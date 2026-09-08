import assert from "node:assert/strict";
import test from "node:test";
import { createD1Fixture, applyMigrations } from "./helpers/d1.mjs";

const PEPPER = "test-only-real-identity-sequencing-pepper-32b";
const ORIGIN = "https://prospector.example";

// Issue #9: the generalized queue composer only ever exposed its live queue
// digest (interview.localProgression) to callers with enableLocalDemoProgression
// set, i.e. the loopback dev demo. An ordinary secure (Cloudflare-Access,
// non-demo) owner could still call start_onboarding_interview and answer/confirm
// one question, but the projection then had no supported way to tell them a
// next question existed -- onboarding.interviewQueueDigest is deliberately
// nulled once the interview has started, and interview.localProgression was
// simply absent. This proves the real identity path now reaches the second
// slot using only what the projection response gives it, with no widening of
// LOCAL_DEMO and no bypass of the existing queue/session fences.
test("real (non-demo) secure identity advances the generalized queue past one confirmed decision", async () => {
  const fixture = await createD1Fixture("knowledge-real-identity-sequencing");
  try {
    await applyMigrations(fixture.database);
    const [knowledge, onboarding, interview] = await Promise.all([
      fixture.vite.ssrLoadModule(new URL("../domain/knowledge-handler.ts", import.meta.url).pathname),
      fixture.vite.ssrLoadModule(new URL("../domain/onboarding.ts", import.meta.url).pathname),
      fixture.vite.ssrLoadModule(new URL("../domain/interview.ts", import.meta.url).pathname),
    ]);
    const owner = await interview.principalFromIdentity("owner@example.com", "Owner", PEPPER);

    // Build the hierarchy directly through the domain layer (test setup
    // only, bypassing the HTTP writesActivated gate) -- the same pattern
    // interview-question-authoring.test.mjs already uses for its fixtures.
    const init = await onboarding.initializeOwnerCompanyProduct(fixture.database, owner, {
      companyName: "Acme", productName: "Widgets", idempotencyKey: k(1),
    });
    const play = await onboarding.createOnboardingDraft(fixture.database, owner, {
      type: "market_play", parentId: init.product.id, name: "Play 1", expectedRevision: init.product.revision, idempotencyKey: k(2),
    });
    const profile = await onboarding.createOnboardingDraft(fixture.database, owner, {
      type: "customer_profile", parentId: play.marketPlay.id, name: "Profile 1", expectedRevision: play.marketPlay.revision, idempotencyKey: k(3),
    });
    assert.equal(profile.status, "profile_fit_required");

    const workspaceRow = await fixture.database.prepare("SELECT id FROM workspaces WHERE owner_subject = ? LIMIT 1").bind(owner.subject).first();
    await activateSyntheticKnowledgeGate(fixture.database, workspaceRow.id);

    // Exercise the REAL identity path through the guarded HTTP handler,
    // exactly as a real Cloudflare-Access-authenticated production owner
    // would -- never enableLocalDemoProgression.
    const deps = () => ({
      database: fixture.database, subjectPepper: PEPPER, pilotOwnerEmail: "owner@example.com",
      enableLocalDemoProgression: false, runtimeIsDevelopment: false,
      getIdentity: async () => ({ email: "owner@example.com", displayName: "Owner" }),
    });

    let res = await knowledge.handleKnowledgeGet(deps());
    let body = await res.json();
    let csrf = res.headers.get("set-cookie").split(";", 1)[0];
    assert.equal(body.onboarding.status, "profile_fit_required");
    assert.ok(body.onboarding.interviewQueueDigest, "real identity must see a queue digest to start the interview");
    assert.equal("interview" in body, false, "no interview projection exists before any question has been issued");

    res = await knowledge.handleKnowledgePost(mutation({
      action: "start_onboarding_interview", expectedQueueDigest: body.onboarding.interviewQueueDigest, idempotencyKey: k(5),
    }, csrf), deps());
    body = await res.json();
    csrf = res.headers.get("set-cookie").split(";", 1)[0];
    assert.equal(res.status, 200);
    assert.equal(body.interview.status, "active", "the first internally issued question must be visible to real identity");
    assert.equal(body.interview.question.knowledgeKind, "identity");

    res = await knowledge.handleKnowledgePost(mutation({
      action: "submit_interview_answer", questionId: body.interview.question.id, expectedRevision: body.interview.question.revision,
      answer: "write_correction", value: { excerpt: "Real owner input for the first slot." }, reason: "Real owner input.", idempotencyKey: k(6),
    }, csrf), deps());
    body = await res.json();
    csrf = res.headers.get("set-cookie").split(";", 1)[0];
    assert.equal(res.status, 200);
    assert.equal(body.interview.status, "awaiting_confirmation", "answer and confirmation remain separate stages for real identity");

    res = await knowledge.handleKnowledgePost(mutation({
      action: "record_interview_decision", answerId: body.interview.answer.id, expectedSessionRevision: body.interview.session.revision,
      expectedQuestionRevision: body.interview.question.revision, decision: "accept", idempotencyKey: k(7),
    }, csrf), deps());
    body = await res.json();
    csrf = res.headers.get("set-cookie").split(";", 1)[0];
    assert.equal(res.status, 200);

    // The actual issue #9 gap: after exactly one confirmed decision, real
    // identity must be able to see the next slot without the demo flag.
    assert.ok(body.interview.localProgression, "real identity must see the live queue after one confirmed decision");
    assert.equal(body.interview.localProgression.status, "ready");
    assert.equal(body.interview.localProgression.completedSlots, 1);
    assert.equal(body.interview.localProgression.next.label, "Product");
    assert.equal(body.interview.localProgression.next.knowledgeKind, "capability");
    const queueDigest = body.interview.localProgression.queueDigest;

    // Existing stale-digest fence still holds for real identity: a forged
    // or outdated digest is rejected before any write.
    const beforeStale = await rowCounts(fixture.database);
    const stale = await knowledge.handleKnowledgePost(mutation({
      action: "start_onboarding_interview", expectedQueueDigest: "f".repeat(64), idempotencyKey: k(8),
    }, csrf), deps());
    assert.equal(stale.status, 409);
    assert.deepEqual(await rowCounts(fixture.database), beforeStale);
    // The stale-digest call consumed the single-use CSRF token; mint a fresh one.
    const refreshed = await knowledge.handleKnowledgeGet(deps());
    csrf = refreshed.headers.get("set-cookie").split(";", 1)[0];

    // Advance to slot #2 using exactly what the projection gave real identity.
    res = await knowledge.handleKnowledgePost(mutation({
      action: "start_onboarding_interview", expectedQueueDigest: queueDigest, idempotencyKey: k(9),
    }, csrf), deps());
    body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.interview.status, "active");
    assert.equal(body.interview.question.knowledgeKind, "capability");
    assert.equal(body.interview.question.destination.scopeType, "product");
  } finally {
    await fixture.dispose();
  }
});

async function activateSyntheticKnowledgeGate(database, workspaceId) {
  const gate = {
    capability: "consensus_knowledge",
    authorization_reference: "synthetic-real-identity-test-authorization",
    target_project_deployment: "synthetic-real-identity-test-target",
    reviewed_source_digest: "a".repeat(64),
    migration_identity_status: "synthetic-greenfield-test",
    post_migration_evidence_reference: "synthetic-real-identity-test-migration-evidence",
    independent_review_reference: "synthetic-real-identity-test-review",
    deployed_boundary_proof_reference: "synthetic-real-identity-test-boundary-proof",
  };
  const fields = ["capability", "authorization_reference", "target_project_deployment", "reviewed_source_digest", "migration_identity_status", "post_migration_evidence_reference", "independent_review_reference", "deployed_boundary_proof_reference"];
  const canonical = fields.map((field) => `${field}=${gate[field]}`).join("\n");
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  const tupleDigest = Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
  await database.prepare("DROP TRIGGER phase_gate_activation_disabled_insert").run();
  const now = Date.now();
  await database.prepare(`INSERT INTO phase_activation_gates (
    id,workspace_id,capability,authorization_reference,target_project_deployment,reviewed_source_digest,
    migration_identity_status,post_migration_evidence_reference,independent_review_reference,
    deployed_boundary_proof_reference,tuple_digest,accepted_at,created_at
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
    "synthetic-real-identity-gate", workspaceId, gate.capability, gate.authorization_reference,
    gate.target_project_deployment, gate.reviewed_source_digest, gate.migration_identity_status,
    gate.post_migration_evidence_reference, gate.independent_review_reference,
    gate.deployed_boundary_proof_reference, tupleDigest, now, now,
  ).run();
}

async function rowCounts(database) {
  const tables = ["interview_sessions", "interview_questions", "interview_answers", "interview_confirmations", "knowledge_versions", "audit_events"];
  return Object.fromEntries(await Promise.all(tables.map(async (table) => [table, (await database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).first()).count])));
}

function mutation(body, csrf) {
  return new Request(`${ORIGIN}/api/knowledge`, {
    method: "POST",
    headers: {
      origin: ORIGIN, "sec-fetch-site": "same-origin", "x-prospector-intent": "knowledge-mutation",
      cookie: csrf, "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function k(n) { return `0198a4b0-1000-7000-8000-${String(n).padStart(12, "0")}`; }
