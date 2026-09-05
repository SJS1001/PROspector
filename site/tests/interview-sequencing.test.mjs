import assert from "node:assert/strict";
import test from "node:test";

import {
  applyMigrations,
  assertForbiddenOperationalRowsUnchanged,
  createD1Fixture,
  snapshotForbiddenOperationalRows,
} from "./helpers/d1.mjs";

const PEPPER = "test-only-interview-sequencing-pepper-32-bytes";

test("Q1 decision can be followed by an internally issued Q2 that remains visible and answerable", async () => {
  const fixture = await createD1Fixture("interview-sequencing-q1-q2");
  try {
    await applyMigrations(fixture.database);
    const [interview, authoring, commercial] = await Promise.all([
      fixture.vite.ssrLoadModule(new URL("../domain/interview.ts", import.meta.url).pathname),
      fixture.vite.ssrLoadModule(new URL("../domain/interview-question-authoring.ts", import.meta.url).pathname),
      fixture.vite.ssrLoadModule(new URL("../domain/commercial-model.ts", import.meta.url).pathname),
    ]);
    const owner = await interview.principalFromIdentity("owner@example.invalid", "Demo owner", PEPPER);
    const q1 = await interview.bootstrapInterview(fixture.database, owner);
    const model = await commercial.initializeCommercialModel(fixture.database, owner, {
      idempotencyKey: key(1),
    });
    const before = await snapshotForbiddenOperationalRows(fixture.database);

    const q1Answer = await interview.submitInterviewAnswer(fixture.database, owner, {
      questionId: q1.question.id,
      expectedRevision: q1.question.revision,
      answer: "use_recommendation",
      idempotencyKey: key(2),
    });
    assert.equal(q1Answer.status, "awaiting_confirmation");
    const q1Decision = await interview.recordInterviewDecision(fixture.database, owner, {
      answerId: q1Answer.answer.id,
      expectedSessionRevision: q1Answer.session.revision,
      expectedQuestionRevision: q1Answer.question.revision,
      decision: "accept",
      idempotencyKey: key(3),
    });
    assert.equal(q1Decision.status, "confirmed");
    const prerequisite = await fixture.database.prepare(
      "SELECT id, COALESCE(value_digest, source_digest) AS digest FROM knowledge_versions WHERE id = ?",
    ).bind(q1Decision.confirmed.knowledgeVersionId).first();
    assert.ok(prerequisite?.id && prerequisite?.digest);
    const company = model.path.find((node) => node.type === "company");
    assert.ok(company);

    const q2 = await authoring.issueInterviewQuestion(fixture.database, owner, {
      sessionId: q1.session.id,
      expectedSessionRevision: 3,
      idempotencyKey: key(4),
      candidate: candidate({
        prompt: "Which constraint should guide this Company's next commercial decision?",
        destination: { scopeType: "company", id: company.id },
        prerequisiteKnowledge: [{ id: prerequisite.id, digest: prerequisite.digest }],
        knowledgeKind: "commercial_guardrail",
      }),
    });
    assert.equal(q2.status, "active");
    assert.equal(q2.session.id, q1.session.id);
    assert.equal(q2.session.revision, 4);
    assert.equal(q2.question.ordinal, 2);
    assert.equal(q2.question.destination.id, company.id);
    assert.equal(q2.question.inference, "A reversible decision reduces risk.");
    assert.equal(q2.question.recommendationDetail.value.excerpt, "Keep the next decision reversible.");
    assert.deepEqual(q2.question.prerequisiteKnowledge, [{ id: prerequisite.id, digest: prerequisite.digest }]);
    assert.equal((await interview.readInterviewState(fixture.database, owner)).question.id, q2.question.id);

    const q2Answer = await interview.submitInterviewAnswer(fixture.database, owner, {
      questionId: q2.question.id,
      expectedRevision: q2.question.revision,
      answer: "use_recommendation",
      idempotencyKey: key(5),
    });
    assert.equal(q2Answer.status, "awaiting_confirmation");
    const stored = await fixture.database.prepare(
      `SELECT kp.kind, kp.destination_scope_type, kp.destination_scope_id, kp.value_json
       FROM interview_answers ans
       JOIN knowledge_proposals kp ON kp.id = json_extract(ans.proposal_json, '$.knowledgeProposalId')
       WHERE ans.id = ?`,
    ).bind(q2Answer.answer.id).first();
    assert.deepEqual(stored, {
      kind: "commercial_guardrail",
      destination_scope_type: "company",
      destination_scope_id: company.id,
      value_json: JSON.stringify({ excerpt: "Keep the next decision reversible." }),
    });
    await assertForbiddenOperationalRowsUnchanged(fixture.database, before);
  } finally {
    await fixture.dispose();
  }
});

function candidate(overrides = {}) {
  return {
    schema: "consensus-interview-question/v1",
    prompt: "What should the owner decide next?",
    evidenceFindings: [{
      sourceTitle: "Synthetic repository fixture",
      sourceRef: "opaque:interview-sequencing",
      sourceType: "repository_fixture",
      retrievedAt: 1_780_000_000_000,
      excerpt: "A bounded synthetic fact supports owner review.",
    }],
    inference: { label: "Inference", value: "A reversible decision reduces risk." },
    recommendation: {
      rationale: "Prefer the bounded reversible choice.",
      value: { excerpt: "Keep the next decision reversible." },
    },
    destination: { scopeType: "company", id: "missing-company" },
    prerequisiteKnowledge: [],
    knowledgeKind: "commercial_guardrail",
    ...overrides,
  };
}

function key(sequence) {
  return `0198e600-0000-7000-8000-${String(sequence).padStart(12, "0")}`;
}
