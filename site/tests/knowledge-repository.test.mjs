import assert from "node:assert/strict";
import test from "node:test";
import {
  applyMigrations,
  assertForbiddenOperationalRowsUnchanged,
  createD1Fixture,
  runRace,
  snapshotForbiddenOperationalRows,
} from "./helpers/d1.mjs";

const principal = { subject: "knowledge-owner", legacySubject: "knowledge-legacy", displayName: "Owner" };
const origins = ["owner_edit", "repository_research", "import", "same_company_reuse", "same_product_reuse", "allowlisted_package", "quarantined_upload"];

function proposalInput(origin, idempotencyKey) {
  return {
    origin,
    destination: { scopeType: "product", locator: "ONE" },
    kind: "capability",
    value: { excerpt: "Synthetic, bounded evidence excerpt." },
    source: { reference: `opaque:${origin}`, custody: "synthetic-test", retrievedAt: 1_700_000_000_000 },
    privacy: "private",
    license: { use: "internal_review_only" },
    reuseEligibility: origin === "allowlisted_package" ? "allowlisted_package" : "company_only",
    idempotencyKey,
  };
}

test("every intake origin records immutable Proposed knowledge with complete provenance before review", async () => {
  const fixture = await createD1Fixture("knowledge-origins");
  try {
    await applyMigrations(fixture.database);
    const knowledge = await fixture.vite.ssrLoadModule(new URL("../domain/knowledge.ts", import.meta.url).pathname);
    const before = await snapshotForbiddenOperationalRows(fixture.database);
    for (const [index, origin] of origins.entries()) {
      const proposed = await knowledge.createKnowledgeProposal(fixture.database, principal, proposalInput(origin, `0198a4b0-0000-7000-8000-0000000002${String(index).padStart(2, "0")}`));
      assert.equal(proposed.status, "proposed");
      assert.equal(proposed.origin, origin);
      assert.equal(proposed.immutable, true);
      assert.match(proposed.digest, /^[a-f0-9]{64}$/);
      assert.equal(proposed.provenance.custody, "synthetic-test");
      assert.equal(proposed.provenance.retrievedAt, 1_700_000_000_000);
      assert.equal(proposed.privacy, "private");
      assert.equal(proposed.license.use, "internal_review_only");
      assert.equal(proposed.destination.scopeType, "product");
      if (origin === "quarantined_upload") {
        assert.equal(proposed.value, undefined);
        assert.equal(proposed.quarantine.content, "withheld");
      } else assert.match(proposed.value.excerpt, /bounded evidence/i);
      await assertForbiddenOperationalRowsUnchanged(fixture.database, before);
    }
    const listed = await knowledge.listKnowledge(fixture.database, principal, { destination: { scopeType: "product", locator: "ONE" } });
    assert.equal(listed.filter((record) => record.status === "proposed").length, origins.length);
  } finally { await fixture.dispose(); }
});

test("quarantined or unscanned upload proposals never become parseable, renderable, or reviewable", async () => {
  const fixture = await createD1Fixture("knowledge-quarantine");
  try {
    await applyMigrations(fixture.database);
    const knowledge = await fixture.vite.ssrLoadModule(new URL("../domain/knowledge.ts", import.meta.url).pathname);
    const before = await snapshotForbiddenOperationalRows(fixture.database);
    const upload = await knowledge.createKnowledgeProposal(fixture.database, principal, proposalInput("quarantined_upload", "0198a4b0-0000-7000-8000-000000000220"));
    assert.equal(upload.quarantine.status, "unscanned");
    const raw = proposalInput("quarantined_upload", "ignored").value.excerpt;
    const persisted = await fixture.database.prepare("SELECT kp.value_json, se.content, se.locator, sc.object_digest FROM knowledge_proposals kp JOIN source_excerpts se ON se.id = kp.excerpt_id JOIN source_custody sc ON sc.source_id = kp.source_id WHERE kp.id = ?").bind(upload.id).first();
    const expectedObjectDigest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw))), (byte) => byte.toString(16).padStart(2, "0")).join("");
    assert.equal(persisted.object_digest, expectedObjectDigest);
    assert.doesNotMatch(JSON.stringify(persisted), new RegExp(raw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(JSON.stringify(await knowledge.readKnowledgeLibrary(fixture.database, principal)), new RegExp(raw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    await assert.rejects(knowledge.readKnowledgeContent(fixture.database, principal, upload.id), /quarantine|scan/i);
    await assert.rejects(knowledge.renderKnowledgeContent(fixture.database, principal, upload.id), /quarantine|scan/i);
    await assert.rejects(knowledge.reviewKnowledgeProposal(fixture.database, principal, { proposalId: upload.id, decision: "accept", expectedRevision: upload.revision, idempotencyKey: "0198a4b0-0000-7000-8000-000000000221" }), /quarantine|scan/i);
    await assertForbiddenOperationalRowsUnchanged(fixture.database, before);
  } finally { await fixture.dispose(); }
});

test("duplicate hierarchy names fail closed while exact projected destination IDs preserve ancestry", async () => {
  const fixture = await createD1Fixture("knowledge-destination-identity");
  try {
    await applyMigrations(fixture.database);
    const knowledge = await fixture.vite.ssrLoadModule(new URL("../domain/knowledge.ts", import.meta.url).pathname);
    const initialized = await knowledge.createKnowledgeProposal(fixture.database, principal, proposalInput("owner_edit", "0198a4b0-0000-7000-8000-000000000270"));
    const workspace = await fixture.database.prepare("SELECT w.id, c.id AS company_id FROM workspaces w JOIN companies c ON c.workspace_id = w.id WHERE w.owner_subject = ?").bind(principal.subject).first();
    const originalProduct = await fixture.database.prepare("SELECT id FROM products WHERE workspace_id = ? AND name = 'ONE'").bind(workspace.id).first();
    const originalPlay = await fixture.database.prepare("SELECT id FROM market_plays WHERE workspace_id = ? AND product_id = ? AND name = 'ONE for Mining'").bind(workspace.id, originalProduct.id).first();
    const originalProfile = await fixture.database.prepare("SELECT id FROM customer_profiles WHERE workspace_id = ? AND play_id = ? AND name = 'Operating'").bind(workspace.id, originalPlay.id).first();
    const now = Date.now();
    await fixture.database.batch([
      fixture.database.prepare("INSERT INTO products (id, workspace_id, created_at, updated_at, revision, company_id, name, lifecycle) VALUES ('product-duplicate', ?, ?, ?, 1, ?, 'Second Product', 'draft')").bind(workspace.id, now, now, workspace.company_id),
      fixture.database.prepare("INSERT INTO market_plays (id, workspace_id, created_at, updated_at, revision, product_id, name, lifecycle) VALUES ('play-duplicate', ?, ?, ?, 1, 'product-duplicate', 'ONE for Mining', 'draft')").bind(workspace.id, now, now),
      fixture.database.prepare("INSERT INTO customer_profiles (id, workspace_id, created_at, updated_at, revision, play_id, name, lifecycle, timezone, weekly_target) VALUES ('profile-duplicate', ?, ?, ?, 1, 'play-duplicate', 'Operating', 'draft', 'UTC', 0)").bind(workspace.id, now, now),
    ]);
    await assert.rejects(knowledge.createKnowledgeProposal(fixture.database, principal, { ...proposalInput("owner_edit", "0198a4b0-0000-7000-8000-000000000271"), destination: { scopeType: "market_play", locator: "ONE for Mining" } }), /ambiguous|exact projected id/i);
    await assert.rejects(knowledge.createKnowledgeProposal(fixture.database, principal, { ...proposalInput("owner_edit", "0198a4b0-0000-7000-8000-000000000272"), destination: { scopeType: "customer_profile", locator: "Operating" } }), /ambiguous|exact projected id/i);
    const exact = await knowledge.createKnowledgeProposal(fixture.database, principal, { ...proposalInput("owner_edit", "0198a4b0-0000-7000-8000-000000000273"), destination: { scopeType: "customer_profile", id: originalProfile.id, locator: "Operating" } });
    assert.equal(exact.destination.id, originalProfile.id);
    await assert.rejects(knowledge.createKnowledgeProposal(fixture.database, principal, { ...proposalInput("owner_edit", "0198a4b0-0000-7000-8000-000000000274"), destination: { scopeType: "customer_profile", id: "profile-duplicate", locator: "Greenfield" } }), /outside|hierarchy/i);
    await assert.rejects(knowledge.createKnowledgeProposal(fixture.database, { subject: "foreign-owner", legacySubject: "foreign-legacy", displayName: "Foreign" }, { ...proposalInput("owner_edit", "0198a4b0-0000-7000-8000-000000000275"), destination: { scopeType: "customer_profile", id: originalProfile.id } }), /outside|hierarchy/i);
    assert.equal(initialized.destination.scopeType, "product");
  } finally { await fixture.dispose(); }
});

test("knowledge review appends immutable versions, converges retries, and enforces confirmed reuse boundaries", async () => {
  const fixture = await createD1Fixture("knowledge-review");
  try {
    await applyMigrations(fixture.database);
    const knowledge = await fixture.vite.ssrLoadModule(new URL("../domain/knowledge.ts", import.meta.url).pathname);
    const before = await snapshotForbiddenOperationalRows(fixture.database);
    const accepted = await knowledge.createKnowledgeProposal(fixture.database, principal, proposalInput("owner_edit", "0198a4b0-0000-7000-8000-000000000230"));
    const accept = { proposalId: accepted.id, decision: "accept", expectedRevision: accepted.revision, idempotencyKey: "0198a4b0-0000-7000-8000-000000000231" };
    const acceptedReview = await knowledge.reviewKnowledgeProposal(fixture.database, principal, accept);
    assert.equal(acceptedReview.decision, "accept");
    assert.equal(acceptedReview.version.predecessorId, null);
    assert.equal(acceptedReview.version.immutable, true);
    assert.deepEqual(await knowledge.reviewKnowledgeProposal(fixture.database, principal, accept), acceptedReview, "exact operation digest retry converges");
    await assert.rejects(knowledge.reviewKnowledgeProposal(fixture.database, principal, { ...accept, decision: "reject" }), /idempotency|another review/i);
    const corrected = await knowledge.createKnowledgeProposal(fixture.database, principal, proposalInput("owner_edit", "0198a4b0-0000-7000-8000-000000000232"));
    const correction = await knowledge.reviewKnowledgeProposal(fixture.database, principal, { proposalId: corrected.id, decision: "correct", correction: { excerpt: "Corrected bounded excerpt." }, predecessorVersionId: acceptedReview.version.id, expectedRevision: corrected.revision, idempotencyKey: "0198a4b0-0000-7000-8000-000000000233" });
    assert.equal(correction.version.predecessorId, acceptedReview.version.id);
    assert.equal(correction.version.successorLineage.decision, "correct");
    const rescoped = await knowledge.createKnowledgeProposal(fixture.database, principal, proposalInput("same_product_reuse", "0198a4b0-0000-7000-8000-000000000234"));
    const rescope = await knowledge.reviewKnowledgeProposal(fixture.database, principal, { proposalId: rescoped.id, decision: "rescope", destination: { scopeType: "market_play", locator: "ONE for Mining" }, predecessorVersionId: correction.version.id, expectedRevision: rescoped.revision, idempotencyKey: "0198a4b0-0000-7000-8000-000000000235" });
    assert.equal(rescope.version.predecessorId, correction.version.id);
    const rejected = await knowledge.createKnowledgeProposal(fixture.database, principal, proposalInput("import", "0198a4b0-0000-7000-8000-000000000236"));
    const countBeforeReject = (await knowledge.listKnowledge(fixture.database, principal, {})).filter((record) => record.type === "knowledge_version").length;
    await knowledge.reviewKnowledgeProposal(fixture.database, principal, { proposalId: rejected.id, decision: "reject", expectedRevision: rejected.revision, idempotencyKey: "0198a4b0-0000-7000-8000-000000000237" });
    assert.equal((await knowledge.listKnowledge(fixture.database, principal, {})).filter((record) => record.type === "knowledge_version").length, countBeforeReject);
    await assert.rejects(knowledge.reuseKnowledge(fixture.database, principal, { sourceVersionId: acceptedReview.version.id, destination: { companyId: "other-company", scopeType: "product", locator: "Other" }, category: "contacts", idempotencyKey: "0198a4b0-0000-7000-8000-000000000238" }), /cross-company|allowlist|contacts/i);
    for (const [index, category] of ["prospects", "outreach", "suppression", "secrets", "unapproved_private_source"].entries()) {
      await assert.rejects(knowledge.reuseKnowledge(fixture.database, principal, { sourceVersionId: acceptedReview.version.id, destination: { companyId: "other-company", scopeType: "product", locator: "Other" }, category, idempotencyKey: `0198a4b0-0000-7000-8000-00000000024${index}` }), /cross-company|allowlist|private/i);
    }
    const reuse = await knowledge.reuseKnowledge(fixture.database, principal, { sourceVersionId: acceptedReview.version.id, destination: { scopeType: "product", locator: "ONE" }, category: "capability", idempotencyKey: "0198a4b0-0000-7000-8000-000000000239" });
    assert.equal(reuse.status, "proposed", "reuse is a suggestion requiring destination confirmation");
    assert.deepEqual(reuse.reuseOrder, ["same_company", "same_product", "allowlisted_package"]);
    await assertForbiddenOperationalRowsUnchanged(fixture.database, before);
  } finally { await fixture.dispose(); }
});

test("concurrent knowledge reviewers commit exactly one decision and one version", async () => {
  const fixture = await createD1Fixture("knowledge-review-race");
  try {
    await applyMigrations(fixture.database);
    const knowledge = await fixture.vite.ssrLoadModule(new URL("../domain/knowledge.ts", import.meta.url).pathname);
    const proposed = await knowledge.createKnowledgeProposal(fixture.database, principal, proposalInput("owner_edit", "0198a4b0-0000-7000-8000-000000000250"));
    const raced = await runRace([
      () => knowledge.reviewKnowledgeProposal(fixture.database, principal, { proposalId: proposed.id, decision: "accept", expectedRevision: proposed.revision, idempotencyKey: "0198a4b0-0000-7000-8000-000000000251" }),
      () => knowledge.reviewKnowledgeProposal(fixture.database, principal, { proposalId: proposed.id, decision: "correct", correction: { excerpt: "Concurrent corrected value." }, expectedRevision: proposed.revision, idempotencyKey: "0198a4b0-0000-7000-8000-000000000252" }),
    ]);
    assert.equal(raced.filter((result) => result.status === "fulfilled").length, 1);
    const decisions = await fixture.database.prepare("SELECT COUNT(*) AS count FROM proposal_decisions WHERE proposal_id = ?").bind(proposed.id).first();
    const versions = await fixture.database.prepare("SELECT COUNT(*) AS count FROM knowledge_versions WHERE proposal_id = ?").bind(proposed.id).first();
    assert.equal(Number(decisions.count), 1);
    assert.equal(Number(versions.count), 1);
  } finally { await fixture.dispose(); }
});

test("generalized interview decision is atomic across proposal, version, confirmation, and session state", async () => {
  const fixture = await createD1Fixture("interview-authority-atomic");
  try {
    await applyMigrations(fixture.database);
    const interview = await fixture.vite.ssrLoadModule(new URL("../domain/interview.ts", import.meta.url).pathname);
    const atomicPrincipal = await interview.principalFromIdentity("atomic@example.com", "Atomic Owner", "test-only-subject-pepper-with-at-least-32-bytes");
    const active = await interview.bootstrapInterview(fixture.database, atomicPrincipal);
    const awaiting = await interview.submitInterviewAnswer(fixture.database, atomicPrincipal, {
      questionId: active.question.id,
      expectedRevision: active.question.revision,
      idempotencyKey: "0198a4b0-0000-7000-8000-000000000260",
      answer: "use_recommendation",
    });
    await fixture.database.prepare("CREATE TRIGGER test_confirmation_failure BEFORE INSERT ON interview_confirmations BEGIN SELECT RAISE(ABORT, 'injected confirmation failure'); END").run();
    const decision = { answerId: awaiting.answer.id, expectedSessionRevision: awaiting.session.revision, idempotencyKey: "0198a4b0-0000-7000-8000-000000000261", decision: "accept" };
    await assert.rejects(interview.recordInterviewDecision(fixture.database, atomicPrincipal, decision), /decision|reload/i);
    const proposal = await fixture.database.prepare("SELECT id, status, revision FROM knowledge_proposals LIMIT 1").first();
    assert.equal(proposal.status, "proposed");
    assert.equal(Number(proposal.revision), 1);
    for (const table of ["proposal_decisions", "knowledge_versions", "interview_confirmations", "interview_authority_bindings"]) {
      const row = await fixture.database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).first();
      assert.equal(Number(row.count), 0, `${table} must roll back with the failed authority transition`);
    }
    const session = await fixture.database.prepare("SELECT state FROM interview_sessions WHERE id = ?").bind(awaiting.session.id).first();
    const question = await fixture.database.prepare("SELECT status FROM interview_questions WHERE id = ?").bind(awaiting.question.id).first();
    assert.equal(session.state, "awaiting_confirmation");
    assert.equal(question.status, "answered");
    await fixture.database.prepare("DROP TRIGGER test_confirmation_failure").run();
    const completed = await interview.recordInterviewDecision(fixture.database, atomicPrincipal, decision);
    assert.notEqual(completed.status, "awaiting_confirmation");
    assert.deepEqual(await interview.recordInterviewDecision(fixture.database, atomicPrincipal, decision), completed);
    const binding = await fixture.database.prepare("SELECT COUNT(*) AS count FROM interview_authority_bindings WHERE answer_id = ?").bind(awaiting.answer.id).first();
    assert.equal(Number(binding.count), 1);
  } finally { await fixture.dispose(); }
});
