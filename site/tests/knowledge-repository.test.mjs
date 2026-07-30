import assert from "node:assert/strict";
import test from "node:test";
import {
  applyMigrations,
  assertForbiddenOperationalRowsUnchanged,
  createD1Fixture,
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
      assert.match(proposed.value.excerpt, /bounded evidence/i);
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
    await assert.rejects(knowledge.readKnowledgeContent(fixture.database, principal, upload.id), /quarantine|scan/i);
    await assert.rejects(knowledge.renderKnowledgeContent(fixture.database, principal, upload.id), /quarantine|scan/i);
    await assert.rejects(knowledge.reviewKnowledgeProposal(fixture.database, principal, { proposalId: upload.id, decision: "accept", expectedRevision: upload.revision, idempotencyKey: "0198a4b0-0000-7000-8000-000000000221" }), /quarantine|scan/i);
    await assertForbiddenOperationalRowsUnchanged(fixture.database, before);
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
