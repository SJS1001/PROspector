import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { Miniflare } from "miniflare";
import { createServer } from "vite";

const SUBJECT_PEPPER = "test-only-subject-pepper-with-at-least-32-bytes";

test("owner-scoped interview separates answer submission from confirmation", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  const miniflare = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok') } }",
    d1Databases: { DB: "prospector-interview-test" },
  });

  try {
    const database = await miniflare.getD1Database("DB");
    await applyMigrations(database);
    const domain = await vite.ssrLoadModule(
      new URL("../domain/interview.ts", import.meta.url).pathname,
    );

    const owner = await domain.principalFromIdentity(
      "Owner@Example.com",
      "Test Owner",
      SUBJECT_PEPPER,
    );
    const outsider = await domain.principalFromIdentity(
      "other@example.com",
      "Other Owner",
      SUBJECT_PEPPER,
    );
    assert.doesNotMatch(owner.subject, /@|owner|example/i);
    assert.equal(owner.subject.length, 64);

    assert.equal((await domain.readInterviewState(database, owner)).status, "uninitialized");
    assert.equal((await domain.readInterviewState(database, outsider)).status, "uninitialized");

    const active = await domain.bootstrapInterview(database, owner);
    assert.equal(active.status, "active");
    assert.match(active.question.provenance, /policy question/i);
    assert.equal((await domain.bootstrapInterview(database, owner)).status, "active");
    assert.equal(await count(database, "workspaces"), 1);
    assert.equal(await count(database, "interview_sessions"), 1);
    assert.equal(await count(database, "interview_questions"), 1);
    assert.equal(await count(database, "audit_events"), 1);

    const answerInput = {
      questionId: active.question.id,
      expectedRevision: active.question.revision,
      idempotencyKey: "0198a4b0-0000-7000-8000-000000000001",
    };
    const awaiting = await domain.submitRecommendationAnswer(database, owner, answerInput);
    assert.equal(awaiting.status, "awaiting_confirmation");
    assert.equal(awaiting.session.revision, 2);
    assert.equal(await count(database, "interview_answers"), 1);
    assert.equal(await count(database, "interview_confirmations"), 0);
    assert.equal(await count(database, "knowledge_versions"), 0);
    assert.equal(await count(database, "audit_events"), 2);
    const storedProposal = await database
      .prepare("SELECT proposal_json, proposal_digest FROM interview_answers WHERE id = ?")
      .bind(awaiting.answer.id)
      .first();
    assert.notEqual(storedProposal.proposal_digest, "legacy-unbound");
    assert.match(storedProposal.proposal_json, /Reserve score 2/);
    assert.deepEqual(
      await domain.submitRecommendationAnswer(database, owner, answerInput),
      awaiting,
    );
    await assert.rejects(
      domain.submitRecommendationAnswer(database, owner, {
        ...answerInput,
        expectedRevision: 99,
      }),
      (error) => error?.code === "interview_conflict",
    );
    await database
      .prepare("UPDATE interview_questions SET recommendation = ? WHERE id = ?")
      .bind("A later deployment changed this policy.", active.question.id)
      .run();
    const driftSafePending = await domain.readInterviewState(database, owner);
    assert.equal(driftSafePending.status, "awaiting_confirmation");
    assert.match(driftSafePending.question.recommendation, /Reserve score 2/);
    assert.doesNotMatch(driftSafePending.question.recommendation, /later deployment/);

    const confirmationInput = {
      answerId: awaiting.answer.id,
      expectedSessionRevision: awaiting.session.revision,
      idempotencyKey: "0198a4b0-0000-7000-8000-000000000002",
    };
    const confirmed = await domain.confirmSubmittedAnswer(
      database,
      owner,
      confirmationInput,
    );
    assert.equal(confirmed.status, "confirmed");
    assert.equal(confirmed.confirmed.value.score, 1);
    assert.equal(confirmed.confirmed.value.classification, "partial_readiness");
    const knowledge = await database
      .prepare("SELECT source_digest FROM knowledge_versions WHERE id = ?")
      .bind(confirmed.confirmed.knowledgeVersionId)
      .first();
    assert.equal(knowledge.source_digest, storedProposal.proposal_digest);
    assert.deepEqual(
      await domain.confirmSubmittedAnswer(database, owner, confirmationInput),
      confirmed,
    );
    assert.equal(await count(database, "interview_answers"), 1);
    assert.equal(await count(database, "interview_confirmations"), 1);
    assert.equal(await count(database, "knowledge_versions"), 1);
    assert.equal(await count(database, "audit_events"), 3);
    await assert.rejects(
      domain.confirmSubmittedAnswer(database, owner, {
        ...confirmationInput,
        expectedSessionRevision: 77,
      }),
      (error) => error?.code === "interview_conflict",
    );

    const outsiderActive = await domain.bootstrapInterview(database, outsider);
    assert.equal(outsiderActive.status, "active");
    assert.notEqual(outsiderActive.workspace.id, active.workspace.id);
    await assert.rejects(
      domain.submitRecommendationAnswer(database, outsider, {
        ...answerInput,
        idempotencyKey: "0198a4b0-0000-7000-8000-000000000003",
      }),
      (error) => error?.code === "interview_conflict",
    );

    const answerRace = await Promise.allSettled([
      domain.submitRecommendationAnswer(database, outsider, {
        questionId: outsiderActive.question.id,
        expectedRevision: outsiderActive.question.revision,
        idempotencyKey: "0198a4b0-0000-7000-8000-000000000004",
      }),
      domain.submitRecommendationAnswer(database, outsider, {
        questionId: outsiderActive.question.id,
        expectedRevision: outsiderActive.question.revision,
        idempotencyKey: "0198a4b0-0000-7000-8000-000000000005",
      }),
    ]);
    assert.equal(answerRace.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(answerRace.filter((result) => result.status === "rejected").length, 1);

    const outsiderAwaiting = await domain.readInterviewState(database, outsider);
    assert.equal(outsiderAwaiting.status, "awaiting_confirmation");
    const confirmationRace = await Promise.allSettled([
      domain.confirmSubmittedAnswer(database, outsider, {
        answerId: outsiderAwaiting.answer.id,
        expectedSessionRevision: outsiderAwaiting.session.revision,
        idempotencyKey: "0198a4b0-0000-7000-8000-000000000006",
      }),
      domain.confirmSubmittedAnswer(database, outsider, {
        answerId: outsiderAwaiting.answer.id,
        expectedSessionRevision: outsiderAwaiting.session.revision,
        idempotencyKey: "0198a4b0-0000-7000-8000-000000000007",
      }),
    ]);
    assert.equal(confirmationRace.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(confirmationRace.filter((result) => result.status === "rejected").length, 1);
    assert.equal((await domain.readInterviewState(database, outsider)).status, "confirmed");
    assert.equal((await domain.readInterviewState(database, owner)).status, "confirmed");
    assert.equal(await count(database, "interview_answers"), 2);
    assert.equal(await count(database, "interview_confirmations"), 2);
    assert.equal(await count(database, "knowledge_versions"), 2);

    const auditRows = await database
      .prepare("SELECT actor_id, detail_json FROM audit_events ORDER BY created_at")
      .all();
    assert.equal(auditRows.results.every((row) => row.actor_id.length === 64), true);
    assert.doesNotMatch(JSON.stringify(auditRows.results), /owner@example|other@example|historian connectivity demonstrates/i);

    const legacyPrincipal = {
      subject: outsider.legacySubject,
      legacySubject: "f".repeat(64),
      displayName: "Legacy outsider",
    };
    const legacyActive = await domain.bootstrapInterview(database, legacyPrincipal);
    const legacyAwaiting = await domain.submitRecommendationAnswer(database, legacyPrincipal, {
      questionId: legacyActive.question.id,
      expectedRevision: legacyActive.question.revision,
      idempotencyKey: "0198a4b0-0000-7000-8000-000000000010",
    });
    const legacyConfirmed = await domain.confirmSubmittedAnswer(database, legacyPrincipal, {
      answerId: legacyAwaiting.answer.id,
      expectedSessionRevision: legacyAwaiting.session.revision,
      idempotencyKey: "0198a4b0-0000-7000-8000-000000000011",
    });
    await database
      .prepare("UPDATE interview_answers SET proposal_json = '{}', proposal_digest = 'legacy-unbound' WHERE id = ?")
      .bind(legacyAwaiting.answer.id)
      .run();
    await database
      .prepare("UPDATE interview_confirmations SET operation_digest = 'legacy-unbound' WHERE answer_id = ?")
      .bind(legacyAwaiting.answer.id)
      .run();
    const coexistenceReads = await Promise.all([
      domain.readInterviewState(database, outsider),
      domain.readInterviewState(database, outsider),
    ]);
    assert.equal(coexistenceReads.every((state) => state.status === "confirmed"), true);
    const detachedKnowledge = await database
      .prepare("SELECT status FROM knowledge_versions WHERE id = ?")
      .bind(legacyConfirmed.confirmed.knowledgeVersionId)
      .first();
    assert.equal(detachedKnowledge.status, "superseded");
    const detachedSession = await database
      .prepare("SELECT state FROM interview_sessions WHERE id = ?")
      .bind(legacyAwaiting.session.id)
      .first();
    assert.equal(detachedSession.state, "archived");
    const detachedAudits = await database
      .prepare("SELECT COUNT(*) AS count FROM audit_events WHERE workspace_id = ? AND action = 'workspace.detached_legacy_quarantined'")
      .bind(legacyActive.workspace.id)
      .first();
    assert.equal(Number(detachedAudits.count), 1);

    const migrationPrincipal = await domain.principalFromIdentity(
      "migration@example.com",
      "Migration Owner",
      SUBJECT_PEPPER,
    );
    const migrationActive = await domain.bootstrapInterview(database, migrationPrincipal);
    await database
      .prepare("UPDATE workspaces SET owner_subject = ? WHERE id = ?")
      .bind(migrationPrincipal.legacySubject, migrationActive.workspace.id)
      .run();
    assert.equal((await domain.readInterviewState(database, migrationPrincipal)).status, "active");
    const migratedOwner = await database
      .prepare("SELECT owner_subject FROM workspaces WHERE id = ?")
      .bind(migrationActive.workspace.id)
      .first();
    assert.equal(migratedOwner.owner_subject, migrationPrincipal.subject);

    await database
      .prepare("UPDATE interview_answers SET proposal_json = '{}', proposal_digest = 'legacy-unbound' WHERE id = ?")
      .bind(awaiting.answer.id)
      .run();
    assert.equal((await domain.readInterviewState(database, owner)).status, "review_required");
    const restartRace = await Promise.allSettled([
      domain.restartUnboundReview(database, owner, {
        idempotencyKey: "0198a4b0-0000-7000-8000-000000000008",
      }),
      domain.restartUnboundReview(database, owner, {
        idempotencyKey: "0198a4b0-0000-7000-8000-000000000009",
      }),
    ]);
    assert.equal(restartRace.filter((result) => result.status === "fulfilled").length, 2);
    const restarted = await domain.readInterviewState(database, owner);
    assert.equal(restarted.status, "active");
    assert.deepEqual(
      await domain.restartUnboundReview(database, owner, {
        idempotencyKey: "0198a4b0-0000-7000-8000-000000000008",
      }),
      restarted,
    );
    const activeSessions = await database
      .prepare("SELECT COUNT(*) AS count FROM interview_sessions WHERE workspace_id = ? AND state = 'awaiting_answer'")
      .bind(active.workspace.id)
      .first();
    assert.equal(Number(activeSessions.count), 1);
    const quarantineAudits = await database
      .prepare("SELECT COUNT(*) AS count FROM audit_events WHERE workspace_id = ? AND action = 'interview.unbound_review_restarted'")
      .bind(active.workspace.id)
      .first();
    assert.equal(Number(quarantineAudits.count), 1);
    const superseded = await database
      .prepare("SELECT status FROM knowledge_versions WHERE id = ?")
      .bind(confirmed.confirmed.knowledgeVersionId)
      .first();
    assert.equal(superseded.status, "superseded");
    const legacyConfirmation = await database
      .prepare("SELECT decision FROM interview_confirmations WHERE answer_id = ?")
      .bind(awaiting.answer.id)
      .first();
    assert.equal(legacyConfirmation.decision, "accept");
    assert.equal((await domain.readInterviewState(database, owner)).status, "active");
  } finally {
    await vite.close();
    await miniflare.dispose();
  }
});

export async function applyMigrations(database) {
  for (const filename of [
    "0000_jittery_meteorite.sql",
    "0001_true_spencer_smythe.sql",
    "0002_eager_supreme_intelligence.sql",
    "0003_acoustic_magik.sql",
  ]) {
    const sql = await readFile(new URL(`../drizzle/${filename}`, import.meta.url), "utf8");
    for (const statement of sql.split("--> statement-breakpoint")) {
      const trimmed = statement.trim();
      if (trimmed) await database.prepare(trimmed).run();
    }
  }
}

async function count(database, table) {
  const allowed = new Set([
    "workspaces",
    "interview_sessions",
    "interview_questions",
    "interview_answers",
    "interview_confirmations",
    "knowledge_versions",
    "audit_events",
  ]);
  if (!allowed.has(table)) throw new Error("Unexpected test table");
  const row = await database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).first();
  return Number(row.count);
}
