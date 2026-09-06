import assert from "node:assert/strict";
import test from "node:test";

import {
  applyMigrations,
  assertForbiddenOperationalRowsUnchanged,
  countRows,
  createD1Fixture,
  snapshotForbiddenOperationalRows,
} from "./helpers/d1.mjs";
import { seedProfileAuthority } from "./helpers/phase4.mjs";

const OWNER = { subject: "question-owner", legacySubject: "question-owner-legacy", displayName: "Question owner" };
const OUTSIDER = { subject: "question-outsider", legacySubject: "question-outsider-legacy", displayName: "Outsider" };
const NOW = 1_780_000_000_000;

test("question issuance rejects wrong authority and converges under idempotency and races", async () => {
  const fixture = await createD1Fixture("interview-question-authority");
  try {
    const authority = await setup(fixture);
    const before = await snapshotForbiddenOperationalRows(fixture.database);
    const input = {
      sessionId: authority.sessionId,
      expectedSessionRevision: 1,
      idempotencyKey: key(10),
      candidate: question({
        destination: { scopeType: "product", id: authority.productId },
        prerequisiteKnowledge: [authority.prerequisite],
      }),
    };

    await assert.rejects(
      authority.authoring.issueInterviewQuestion(fixture.database, OUTSIDER, input),
      isConflict,
    );
    await assert.rejects(
      authority.authoring.issueInterviewQuestion(fixture.database, OWNER, {
        ...input,
        candidate: { ...input.candidate, destination: { scopeType: "company", id: authority.companyId } },
      }),
      isConflict,
    );
    await assert.rejects(
      authority.authoring.issueInterviewQuestion(fixture.database, OWNER, { ...input, expectedSessionRevision: 2 }),
      isConflict,
    );
    await assert.rejects(
      authority.authoring.issueInterviewQuestion(fixture.database, OWNER, {
        ...input,
        candidate: { ...input.candidate, prerequisiteKnowledge: [{ ...authority.prerequisite, digest: "f".repeat(64) }] },
      }),
      isConflict,
    );
    await assert.rejects(
      authority.authoring.issueInterviewQuestion(fixture.database, OWNER, {
        ...input,
        candidate: { ...input.candidate, unexpected: true },
      }),
      isConflict,
    );
    await assert.rejects(
      authority.authoring.issueInterviewQuestion(fixture.database, OWNER, {
        ...input,
        candidate: {
          ...input.candidate,
          prerequisiteKnowledge: Array.from({ length: 30 }, (_, index) => ({ id: `knowledge-${index}`, digest: "a".repeat(64) })),
        },
      }),
      isConflict,
      "the portable D1 binding ceiling rejects a thirtieth prerequisite",
    );
    assert.equal(await countRows(fixture.database, "interview_questions", "session_id = ?", [authority.sessionId]), 0);

    const contenders = [
      input,
      { ...input, idempotencyKey: key(11), candidate: { ...input.candidate, prompt: "A competing server-authored question?" } },
    ];
    const race = await Promise.allSettled(contenders.map((candidateInput) =>
      authority.authoring.issueInterviewQuestion(fixture.database, OWNER, candidateInput)));
    assert.equal(race.filter(({ status }) => status === "fulfilled").length, 1);
    assert.equal(race.filter(({ status }) => status === "rejected").length, 1);
    const winnerIndex = race.findIndex(({ status }) => status === "fulfilled");
    const winnerInput = contenders[winnerIndex];
    const winner = race[winnerIndex].value;
    assert.equal(winner.status, "active");
    assert.equal(winner.question.ordinal, 1);
    await fixture.database.prepare(
      `INSERT INTO interview_sessions
       (id, workspace_id, created_at, updated_at, revision, company_id, scope_type, scope_id, state, active_question_id)
       SELECT 'competing-live-session', workspace_id, ?, ?, 1, company_id, 'company', company_id, 'open', NULL
       FROM interview_sessions WHERE id = ?`,
    ).bind(NOW + 1, NOW + 1, authority.sessionId).run();
    await assert.rejects(
      authority.authoring.issueInterviewQuestion(fixture.database, OWNER, {
        ...input,
        sessionId: "competing-live-session",
        idempotencyKey: key(12),
        candidate: { ...input.candidate, destination: { scopeType: "company", id: authority.companyId } },
      }),
      isConflict,
      "only one decision-bearing question may be live in a workspace",
    );
    assert.deepEqual(
      await fixture.database.prepare("SELECT state, active_question_id FROM interview_sessions WHERE id = 'competing-live-session'").first(),
      { state: "open", active_question_id: null },
      "rejected issuance leaves the target session untouched",
    );
    await fixture.database.prepare(
      "UPDATE knowledge_versions SET status = 'superseded' WHERE id = ?",
    ).bind(authority.prerequisite.id).run();
    assert.deepEqual(
      await authority.authoring.issueInterviewQuestion(fixture.database, OWNER, winnerInput),
      winner,
    );
    await assert.rejects(
      authority.authoring.issueInterviewQuestion(fixture.database, OWNER, {
        ...winnerInput,
        candidate: { ...winnerInput.candidate, knowledgeKind: "changed_kind" },
      }),
      isConflict,
    );
    assert.equal(await countRows(fixture.database, "interview_questions", "session_id = ?", [authority.sessionId]), 1);
    assert.equal(await countRows(fixture.database, "authority_commands", "command_type = 'interview.question.issue'"), 1);
    assert.equal(await countRows(fixture.database, "audit_events", "action = 'interview.question_issued'"), 1);
    await assertForbiddenOperationalRowsUnchanged(fixture.database, before);
  } finally {
    await fixture.dispose();
  }
});

test("concurrent issuance into two sessions converges on one workspace-wide live question", async () => {
  const fixture = await createD1Fixture("interview-question-workspace-race");
  try {
    const authority = await setup(fixture);
    await fixture.database.prepare(
      `INSERT INTO interview_sessions
       (id, workspace_id, created_at, updated_at, revision, company_id, scope_type, scope_id, state, active_question_id)
       SELECT 'question-session-two', workspace_id, ?, ?, 1, company_id, 'company', company_id, 'open', NULL
       FROM interview_sessions WHERE id = ?`,
    ).bind(NOW + 1, NOW + 1, authority.sessionId).run();
    const inputs = [authority.sessionId, "question-session-two"].map((sessionId, index) => ({
      sessionId,
      expectedSessionRevision: 1,
      idempotencyKey: key(20 + index),
      candidate: question({
        destination: index === 0
          ? { scopeType: "product", id: authority.productId }
          : { scopeType: "company", id: authority.companyId },
        prerequisiteKnowledge: [authority.prerequisite],
        prompt: `Workspace-race question ${index + 1}?`,
      }),
    }));
    const race = await Promise.allSettled(inputs.map((input) =>
      authority.authoring.issueInterviewQuestion(fixture.database, OWNER, input)));
    assert.equal(race.filter(({ status }) => status === "fulfilled").length, 1);
    assert.equal(race.filter(({ status }) => status === "rejected").length, 1);
    const winnerIndex = race.findIndex(({ status }) => status === "fulfilled");
    assert.equal(race[winnerIndex].value.session.id, inputs[winnerIndex].sessionId);
    assert.equal(await countRows(fixture.database, "interview_sessions", "state IN ('awaiting_answer','awaiting_confirmation') AND active_question_id IS NOT NULL"), 1);
    assert.equal(await countRows(fixture.database, "interview_questions"), 1);
    assert.equal(await countRows(fixture.database, "authority_commands", "command_type = 'interview.question.issue'"), 1);
    assert.equal(await countRows(fixture.database, "audit_events", "action = 'interview.question_issued'"), 1);
  } finally {
    await fixture.dispose();
  }
});

test("all five exact commercial destinations accept internally authored questions", async () => {
  const fixture = await createD1Fixture("interview-question-destinations");
  try {
    await applyMigrations(fixture.database);
    const interview = await fixture.vite.ssrLoadModule(new URL("../domain/interview.ts", import.meta.url).pathname);
    const authoring = await fixture.vite.ssrLoadModule(new URL("../domain/interview-question-authoring.ts", import.meta.url).pathname);
    const seeded = await seedProfileAuthority(fixture, OWNER, NOW);
    const [company, product, play, profile, offer] = await Promise.all([
      fixture.database.prepare("SELECT id FROM companies WHERE workspace_id = ?").bind(seeded.workspaceId).first(),
      fixture.database.prepare("SELECT id FROM products WHERE workspace_id = ? LIMIT 1").bind(seeded.workspaceId).first(),
      fixture.database.prepare("SELECT id FROM market_plays WHERE workspace_id = ? LIMIT 1").bind(seeded.workspaceId).first(),
      fixture.database.prepare("SELECT id FROM customer_profiles WHERE workspace_id = ? LIMIT 1").bind(seeded.workspaceId).first(),
      fixture.database.prepare("SELECT id FROM offers WHERE workspace_id = ? LIMIT 1").bind(seeded.workspaceId).first(),
    ]);
    const destinations = [
      ["company", company.id],
      ["product", product.id],
      ["market_play", play.id],
      ["customer_profile", profile.id],
      ["offer", offer.id],
    ];
    const before = await snapshotForbiddenOperationalRows(fixture.database);
    for (const [index, [scopeType, id]] of destinations.entries()) {
      const sessionId = `destination-session-${index}`;
      await fixture.database.prepare(
        `INSERT INTO interview_sessions
         (id, workspace_id, created_at, updated_at, revision, company_id, scope_type, scope_id, state, active_question_id)
         VALUES (?, ?, ?, ?, 1, ?, ?, ?, 'open', NULL)`,
      ).bind(sessionId, seeded.workspaceId, NOW + index, NOW + index, company.id, scopeType, id).run();
      await authoring.issueInterviewQuestion(fixture.database, OWNER, {
        sessionId,
        expectedSessionRevision: 1,
        idempotencyKey: key(100 + index),
        candidate: question({ destination: { scopeType, id }, knowledgeKind: `kind_${index}` }),
      });
      const stored = await fixture.database.prepare(
        "SELECT status, version FROM interview_questions WHERE workspace_id = ? AND session_id = ?",
      ).bind(seeded.workspaceId, sessionId).first();
      assert.deepEqual(stored, { status: "active", version: 1 });
      await fixture.database.batch([
        fixture.database.prepare("UPDATE interview_questions SET status = 'answered', revision = revision + 1, updated_at = ? WHERE workspace_id = ? AND session_id = ? AND status = 'active'").bind(NOW + index + 1, seeded.workspaceId, sessionId),
        fixture.database.prepare("UPDATE interview_sessions SET state = 'completed', active_question_id = NULL, revision = revision + 1, updated_at = ? WHERE workspace_id = ? AND id = ? AND state = 'awaiting_answer'").bind(NOW + index + 1, seeded.workspaceId, sessionId),
      ]);
    }
    assert.equal(typeof interview.readInterviewState, "function");
    await assertForbiddenOperationalRowsUnchanged(fixture.database, before);
  } finally {
    await fixture.dispose();
  }
});

test("an actual Explore-created open session accepts its first internal question", async () => {
  const fixture = await createD1Fixture("interview-question-explore-session");
  try {
    await applyMigrations(fixture.database);
    const [commercial, discovery, composer, interview, authoring, handler, knowledgeHandler] = await Promise.all([
      fixture.vite.ssrLoadModule(new URL("../domain/commercial-model.ts", import.meta.url).pathname),
      fixture.vite.ssrLoadModule(new URL("../domain/market-discovery.ts", import.meta.url).pathname),
      fixture.vite.ssrLoadModule(new URL("../domain/interview-question-composer.ts", import.meta.url).pathname),
      fixture.vite.ssrLoadModule(new URL("../domain/interview.ts", import.meta.url).pathname),
      fixture.vite.ssrLoadModule(new URL("../domain/interview-question-authoring.ts", import.meta.url).pathname),
      fixture.vite.ssrLoadModule(new URL("../domain/interview-handler.ts", import.meta.url).pathname),
      fixture.vite.ssrLoadModule(new URL("../domain/knowledge-handler.ts", import.meta.url).pathname),
    ]);
    const subjectPepper = "focused-handler-selection-pepper-at-least-32-bytes";
    const principal = await interview.principalFromIdentity("owner@example.com", "Owner", subjectPepper);
    const model = await commercial.initializeCommercialModel(fixture.database, principal, { idempotencyKey: key(200) });
    const product = model.products[0];
    const workspaceId = model.workspace.id;
    const digest = "a".repeat(64);
    const finding = {
      marketCategory: "synthetic-market",
      audience: "synthetic-operators",
      problemFamily: "bounded-problem",
      problemMatch: "A synthetic operating problem.",
      likelyBuyer: "Synthetic buyer",
      examples: ["Synthetic example"],
      evidence: [{ reference: "opaque:synthetic", publisher: "Fixture", excerpt: "Synthetic evidence.", observedAt: NOW, materialEvidenceFingerprint: "material-1" }],
      inference: "A bounded hypothesis.",
      productFit: "A synthetic fit.",
      risks: ["Must be confirmed"],
    };
    await fixture.database.batch([
      fixture.database.prepare("INSERT INTO typed_configurations (id,workspace_id,created_at,updated_at,revision,company_id,owner_type,owner_id,kind,digest,manifest_json,active) VALUES ('explore-config',?,?,?,1,NULL,'product',?,'product_discovery',?,'{}',1)").bind(workspaceId, NOW, NOW, product.id, digest),
      fixture.database.prepare("INSERT INTO product_discovery_runs (id,workspace_id,created_at,updated_at,revision,product_id,configuration_id,configuration_digest,trigger_kind,trigger_key,source_event_id,started_at,window_lower_exclusive,window_upper_inclusive,last_successful_watermark,successful_watermark,manifest_json,manifest_digest,policy_snapshot_json,policy_snapshot_digest,execution_state,operation_digest,idempotency_key,completed_at) VALUES ('explore-run',?,?,?,1,?,'explore-config',?,'manual','explore-trigger',NULL,?,NULL,?,NULL,?,'{}',?,'{}',?,'succeeded',?,?,?)").bind(workspaceId, NOW, NOW, product.id, digest, NOW, NOW, NOW, digest, digest, digest, key(201), NOW),
      fixture.database.prepare("INSERT INTO product_discovery_submissions (id,workspace_id,product_id,run_id,configuration_id,provenance_json,provenance_digest,submission_json,submission_digest,result_json,result_digest,status,operation_digest,idempotency_key,created_at) VALUES ('explore-submission',?,?,'explore-run','explore-config','{}',?,'{}',?,'{}',?,'succeeded',?,?,?)").bind(workspaceId, product.id, digest, digest, digest, digest, key(202), NOW),
      fixture.database.prepare("INSERT INTO market_play_proposals (id,workspace_id,created_at,updated_at,revision,product_id,run_id,fingerprint,current_version_id,status,surfaced,rank,active,cooldown_until) VALUES ('explore-proposal',?,?,?,1,?,'explore-run',?,NULL,'new',1,1,1,NULL)").bind(workspaceId, NOW, NOW, product.id, digest),
      fixture.database.prepare("INSERT INTO market_play_proposal_versions (id,workspace_id,product_id,proposal_id,run_id,submission_id,version,proposal_json,proposal_digest,material_evidence_fingerprint,predecessor_version_id,relationship,created_at) VALUES ('0198b5c0-0000-7000-8000-000000002011',?,?,'explore-proposal','explore-run','explore-submission',1,?,?,?,NULL,'new',?)").bind(workspaceId, product.id, JSON.stringify(finding), digest, digest, NOW),
      fixture.database.prepare("UPDATE market_play_proposals SET current_version_id = '0198b5c0-0000-7000-8000-000000002011' WHERE id = 'explore-proposal'"),
    ]);
    const explored = await discovery.decideMarketPlayProposal(fixture.database, principal, {
      proposalId: "explore-proposal",
      expectedProposalRevision: 1,
      expectedProposalDigest: digest,
      decision: "explore",
      reason: "Open the synthetic hypothesis interview.",
      idempotencyKey: key(203),
    });
    const session = await fixture.database.prepare("SELECT state, revision, scope_type, scope_id FROM interview_sessions WHERE id = ?").bind(explored.interview.id).first();
    assert.deepEqual(session, { state: "open", revision: 1, scope_type: "market_play", scope_id: explored.interview.marketPlayId });
    const selection = { sessionId: explored.interview.id, marketPlayId: explored.interview.marketPlayId, sourceProposalVersionId: explored.interview.sourceProposalVersionId };
    const competingPlayId = "0198b5c0-0000-7000-8000-000000002012";
    const competingSessionId = "0198b5c0-0000-7000-8000-000000002013";
    await fixture.database.batch([
      fixture.database.prepare("INSERT INTO market_plays (id,workspace_id,created_at,updated_at,revision,product_id,name,lifecycle) VALUES (?,?,?,?,1,?,?,'draft')").bind(competingPlayId, workspaceId, NOW + 10, NOW + 10, product.id, "Competing newer play"),
      fixture.database.prepare("INSERT INTO interview_sessions (id,workspace_id,created_at,updated_at,revision,scope_type,scope_id,state,active_question_id) VALUES (?,?,?,?,1,'market_play',?,'open',NULL)").bind(competingSessionId, workspaceId, NOW + 10, NOW + 10, competingPlayId),
    ]);
    const selectedReady = await interview.readInterviewState(fixture.database, principal, selection);
    assert.equal(selectedReady.status, "ready", "a newer open session cannot redirect the exact Explore handoff");
    await assert.rejects(
      interview.readInterviewState(fixture.database, principal, { ...selection, marketPlayId: competingPlayId }),
      /selected Draft Market Play interview is unavailable/i,
      "URL identity is not authority and cannot retarget the stored Explore decision",
    );
    const competing = await authoring.issueInterviewQuestion(fixture.database, principal, {
      sessionId: competingSessionId, expectedSessionRevision: 1, idempotencyKey: key(204),
      candidate: question({ destination: { scopeType: "market_play", id: competingPlayId }, knowledgeKind: "problem" }),
    });
    const handlerDependencies = {
      database: fixture.database, subjectPepper, pilotOwnerEmail: "owner@example.com",
      enableLocalDemoProgression: true, interviewSelection: selection,
      getIdentity: async () => ({ email: "owner@example.com", displayName: "Owner" }),
    };
    await activateSyntheticKnowledgeGate(fixture.database, workspaceId);
    let get = await handler.handleInterviewGet(handlerDependencies);
    let csrf = (get.headers.get("set-cookie") ?? "").split(";", 1)[0];
    let beforeMutation = await selectedMutationSnapshot(fixture.database);
    let response = await handler.handleInterviewPost(interviewMutation({
      action: "submit_interview_answer", questionId: competing.question.id, expectedRevision: competing.question.revision,
      answer: "use_recommendation", idempotencyKey: key(205),
    }, csrf), handlerDependencies);
    assert.equal(response.status, 409, "selected session A cannot answer session B");
    assert.deepEqual(await selectedMutationSnapshot(fixture.database), beforeMutation, "hostile answer routing creates zero question, answer, Knowledge, decision, audit, session, or lifecycle writes");
    get = await handler.handleInterviewGet(handlerDependencies);
    csrf = (get.headers.get("set-cookie") ?? "").split(";", 1)[0];
    response = await handler.handleInterviewPost(interviewMutation({
      action: "submit_recommendation_answer", questionId: competing.question.id,
      expectedRevision: competing.question.revision, idempotencyKey: key(2051),
    }, csrf), handlerDependencies);
    assert.equal(response.status, 409, "the legacy answer command cannot escape a selected Explore tuple");
    assert.deepEqual(await selectedMutationSnapshot(fixture.database), beforeMutation);
    get = await handler.handleInterviewGet(handlerDependencies);
    csrf = (get.headers.get("set-cookie") ?? "").split(";", 1)[0];
    response = await handler.handleInterviewPost(interviewMutation({
      action: "submit_interview_answer", questionId: competing.question.id, expectedRevision: competing.question.revision,
      answer: "use_recommendation", idempotencyKey: key(20515),
    }, csrf), { ...handlerDependencies, interviewSelection: { ...selection, marketPlayId: competingPlayId } });
    assert.equal(response.status, 409, "an invalid selected tuple cannot reach an answer mutation");
    assert.deepEqual(await selectedMutationSnapshot(fixture.database), beforeMutation, "an invalid tuple creates zero authority or lifecycle writes");
    get = await knowledgeHandler.handleKnowledgeGet(handlerDependencies);
    csrf = (get.headers.get("set-cookie") ?? "").split(";", 1)[0];
    response = await knowledgeHandler.handleKnowledgePost(knowledgeMutation({
      action: "submit_interview_answer", questionId: competing.question.id, expectedRevision: competing.question.revision,
      answer: "use_recommendation", idempotencyKey: key(2052),
    }, csrf), handlerDependencies);
    assert.equal(response.status, 409, "the Knowledge handler cannot route selection A to session B's question");
    assert.deepEqual(await selectedMutationSnapshot(fixture.database), beforeMutation, "hostile Knowledge answer routing creates zero authority or lifecycle writes");

    const competingAnswer = await interview.submitInterviewAnswer(fixture.database, principal, {
      questionId: competing.question.id, expectedRevision: competing.question.revision,
      answer: "use_recommendation", idempotencyKey: key(206),
    });
    get = await handler.handleInterviewGet(handlerDependencies);
    csrf = (get.headers.get("set-cookie") ?? "").split(";", 1)[0];
    beforeMutation = await selectedMutationSnapshot(fixture.database);
    response = await handler.handleInterviewPost(interviewMutation({
      action: "record_interview_decision", answerId: competingAnswer.answer.id,
      expectedSessionRevision: competingAnswer.session.revision, expectedQuestionRevision: competingAnswer.question.revision,
      decision: "accept", idempotencyKey: key(207),
    }, csrf), handlerDependencies);
    assert.equal(response.status, 409, "selected session A cannot confirm session B's answer");
    assert.deepEqual(await selectedMutationSnapshot(fixture.database), beforeMutation, "hostile confirmation routing creates zero question, answer, Knowledge, decision, audit, session, or lifecycle writes");
    get = await handler.handleInterviewGet(handlerDependencies);
    csrf = (get.headers.get("set-cookie") ?? "").split(";", 1)[0];
    response = await handler.handleInterviewPost(interviewMutation({
      action: "confirm_submitted_answer", answerId: competingAnswer.answer.id,
      expectedSessionRevision: competingAnswer.session.revision, idempotencyKey: key(2071),
    }, csrf), handlerDependencies);
    assert.equal(response.status, 409, "the legacy confirmation command cannot escape a selected Explore tuple");
    assert.deepEqual(await selectedMutationSnapshot(fixture.database), beforeMutation);
    get = await knowledgeHandler.handleKnowledgeGet(handlerDependencies);
    csrf = (get.headers.get("set-cookie") ?? "").split(";", 1)[0];
    response = await knowledgeHandler.handleKnowledgePost(knowledgeMutation({
      action: "record_interview_decision", answerId: competingAnswer.answer.id,
      expectedSessionRevision: competingAnswer.session.revision, expectedQuestionRevision: competingAnswer.question.revision,
      decision: "accept", idempotencyKey: key(2072),
    }, csrf), handlerDependencies);
    assert.equal(response.status, 409, "the Knowledge handler cannot route selection A to session B's answer");
    assert.deepEqual(await selectedMutationSnapshot(fixture.database), beforeMutation, "hostile Knowledge confirmation routing creates zero authority or lifecycle writes");
    await interview.recordInterviewDecision(fixture.database, principal, {
      answerId: competingAnswer.answer.id, expectedSessionRevision: competingAnswer.session.revision,
      expectedQuestionRevision: competingAnswer.question.revision, decision: "reject", idempotencyKey: key(208),
    });

    const selectedProgression = await composer.readLocalInterviewProgression(fixture.database, principal, selection);
    assert.equal(selectedProgression.next.destination.id, explored.interview.marketPlayId);
    const beforeIssue = await snapshotForbiddenOperationalRows(fixture.database);
    const active = await composer.advanceLocalInterview(fixture.database, principal, { expectedQueueDigest: selectedProgression.queueDigest, idempotencyKey: key(209) }, selection);
    assert.equal(active.status, "active");
    assert.equal(active.question.destination.id, explored.interview.marketPlayId);
    await assertForbiddenOperationalRowsUnchanged(fixture.database, beforeIssue);
  } finally {
    await fixture.dispose();
  }
});

async function setup(fixture) {
  await applyMigrations(fixture.database);
  const [commercial, authoring] = await Promise.all([
    fixture.vite.ssrLoadModule(new URL("../domain/commercial-model.ts", import.meta.url).pathname),
    fixture.vite.ssrLoadModule(new URL("../domain/interview-question-authoring.ts", import.meta.url).pathname),
  ]);
  const model = await commercial.initializeCommercialModel(fixture.database, OWNER, { idempotencyKey: key(1) });
  await commercial.initializeCommercialModel(fixture.database, OUTSIDER, { idempotencyKey: key(3) });
  const company = model.path.find((node) => node.type === "company");
  const product = model.products[0];
  const digest = "b".repeat(64);
  await fixture.database.batch([
    fixture.database.prepare("INSERT INTO authority_commands (id,workspace_id,created_at,updated_at,revision,command_type,idempotency_key,operation_digest,expected_revision,subject_type,subject_id,status) VALUES ('question-prerequisite-command',?,?,?,1,'test.question.prerequisite',?,?,1,'product',?,'accepted')").bind(model.workspace.id, NOW, NOW, key(2), "c".repeat(64), product.id),
    fixture.database.prepare("INSERT INTO knowledge_items (id,workspace_id,created_at,updated_at,revision,company_id,scope_type,scope_id,kind,slot,current_version_id) VALUES ('question-prerequisite-item',?,?,?,?,?,'product',?,'capability','default',NULL)").bind(model.workspace.id, NOW, NOW, 1, company.id, product.id),
    fixture.database.prepare("INSERT INTO knowledge_versions (id,workspace_id,created_at,updated_at,revision,knowledge_item_id,proposal_id,decision_id,authority_command_id,predecessor_version_id,scope_type,scope_id,kind,value_json,value_digest,status,source_digest) VALUES ('question-prerequisite-version',?,?,?,1,'question-prerequisite-item',NULL,NULL,'question-prerequisite-command',NULL,'product',?,'capability','{}',?,'confirmed',?)").bind(model.workspace.id, NOW, NOW, product.id, digest, digest),
    fixture.database.prepare("UPDATE knowledge_items SET current_version_id = 'question-prerequisite-version' WHERE id = 'question-prerequisite-item'"),
    fixture.database.prepare("INSERT INTO interview_sessions (id,workspace_id,created_at,updated_at,revision,company_id,scope_type,scope_id,state,active_question_id) VALUES ('question-session',?,?,?,?,?,'product',?,'open',NULL)").bind(model.workspace.id, NOW, NOW, 1, company.id, product.id),
  ]);
  return {
    authoring,
    companyId: company.id,
    productId: product.id,
    sessionId: "question-session",
    prerequisite: { id: "question-prerequisite-version", digest },
  };
}

function question(overrides = {}) {
  return {
    schema: "consensus-interview-question/v1",
    prompt: "What is the next bounded decision?",
    evidenceFindings: [{ sourceTitle: "Synthetic source", sourceRef: "opaque:question", sourceType: "repository_fixture", retrievedAt: NOW, excerpt: "Synthetic evidence only." }],
    inference: { label: "Inference", value: "The bounded option is testable." },
    recommendation: { rationale: "Prefer the bounded option.", value: { excerpt: "Use the bounded option." } },
    destination: { scopeType: "product", id: "missing-product" },
    prerequisiteKnowledge: [],
    knowledgeKind: "capability",
    ...overrides,
  };
}

function interviewMutation(body, csrf) {
  return new Request("https://prospector.example/api/interview", {
    method: "POST",
    headers: { origin: "https://prospector.example", "sec-fetch-site": "same-origin", "x-prospector-intent": "interview-mutation", "content-type": "application/json", cookie: csrf },
    body: JSON.stringify(body),
  });
}

function knowledgeMutation(body, csrf) {
  return new Request("https://prospector.example/api/knowledge", {
    method: "POST",
    headers: { origin: "https://prospector.example", "sec-fetch-site": "same-origin", "x-prospector-intent": "knowledge-mutation", "content-type": "application/json", cookie: csrf },
    body: JSON.stringify(body),
  });
}

async function selectedMutationSnapshot(database) {
  const tables = ["interview_sessions", "interview_questions", "interview_answers", "interview_confirmations", "market_plays", "knowledge_proposals", "knowledge_items", "knowledge_versions", "proposal_decisions", "offers", "authority_commands", "audit_events"];
  return Object.fromEntries(await Promise.all(tables.map(async (table) => [table, (await database.prepare(`SELECT * FROM ${table} ORDER BY id`).all()).results])));
}

async function activateSyntheticKnowledgeGate(database, workspaceId) {
  const gate = {
    capability: "consensus_knowledge",
    authorization_reference: "synthetic-handler-test-authorization",
    target_project_deployment: "synthetic-handler-test-target",
    reviewed_source_digest: "a".repeat(64),
    migration_identity_status: "synthetic-greenfield-test",
    post_migration_evidence_reference: "synthetic-handler-test-migration-evidence",
    independent_review_reference: "synthetic-handler-test-review",
    deployed_boundary_proof_reference: "synthetic-handler-test-boundary-proof",
  };
  const fields = ["capability", "authorization_reference", "target_project_deployment", "reviewed_source_digest", "migration_identity_status", "post_migration_evidence_reference", "independent_review_reference", "deployed_boundary_proof_reference"];
  const canonical = fields.map((field) => `${field}=${gate[field]}`).join("\n");
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  const tupleDigest = Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
  await database.prepare("DROP TRIGGER phase_gate_activation_disabled_insert").run();
  await database.prepare(`INSERT INTO phase_activation_gates (
    id,workspace_id,capability,authorization_reference,target_project_deployment,reviewed_source_digest,
    migration_identity_status,post_migration_evidence_reference,independent_review_reference,
    deployed_boundary_proof_reference,tuple_digest,accepted_at,created_at
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
    "synthetic-handler-selection-gate", workspaceId, gate.capability, gate.authorization_reference,
    gate.target_project_deployment, gate.reviewed_source_digest, gate.migration_identity_status,
    gate.post_migration_evidence_reference, gate.independent_review_reference,
    gate.deployed_boundary_proof_reference, tupleDigest, NOW, NOW,
  ).run();
}

function key(sequence) {
  return `0198e500-0000-7000-8000-${String(sequence).padStart(12, "0")}`;
}

function isConflict(error) {
  return error?.code === "interview_conflict";
}
