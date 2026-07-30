import assert from "node:assert/strict";
import test from "node:test";
import {
  applyMigrations,
  assertForbiddenOperationalRowsUnchanged,
  createD1Fixture,
  runRace,
  snapshotForbiddenOperationalRows,
} from "./helpers/d1.mjs";

const principal = { subject: "commercial-owner", legacySubject: "commercial-legacy", displayName: "Owner" };

test("commercial model seeds only Digitalrain -> ONE -> ONE for Mining -> Operating and stays operationally inert", async () => {
  const fixture = await createD1Fixture("commercial-seed");
  try {
    await applyMigrations(fixture.database);
    const commercial = await fixture.vite.ssrLoadModule(new URL("../domain/commercial-model.ts", import.meta.url).pathname);
    const before = await snapshotForbiddenOperationalRows(fixture.database);
    const initialized = await commercial.initializeCommercialModel(fixture.database, principal, {
      idempotencyKey: "0198a4b0-0000-7000-8000-000000000101",
    });
    assert.deepEqual(initialized.path.map((node) => [node.type, node.name, node.lifecycle]), [
      ["company", "Digitalrain", "active"],
      ["product", "ONE", "draft"],
      ["market_play", "ONE for Mining", "draft"],
      ["customer_profile", "Operating", "draft"],
      ["customer_profile", "Greenfield", "draft"],
    ]);
    assert.equal(initialized.offers.length, 0, "the initial seed must not invent an Offer");
    assert.equal(initialized.profiles.find((profile) => profile.name === "Operating").nurtureState, "nurture");
    assert.equal(initialized.profiles.find((profile) => profile.name === "Greenfield").nurtureState, "nurture");
    assert.deepEqual(await commercial.initializeCommercialModel(fixture.database, principal, {
      idempotencyKey: "0198a4b0-0000-7000-8000-000000000101",
    }), initialized);
    await assertForbiddenOperationalRowsUnchanged(fixture.database, before);
  } finally { await fixture.dispose(); }
});

test("commercial hierarchy enforces exact parentage, scope, identity, and stale/retry/race convergence", async () => {
  const fixture = await createD1Fixture("commercial-contract");
  try {
    await applyMigrations(fixture.database);
    const commercial = await fixture.vite.ssrLoadModule(new URL("../domain/commercial-model.ts", import.meta.url).pathname);
    const before = await snapshotForbiddenOperationalRows(fixture.database);
    const state = await commercial.initializeCommercialModel(fixture.database, principal, { idempotencyKey: "0198a4b0-0000-7000-8000-000000000102" });
    const product = state.path.find((node) => node.type === "product");
    const play = state.path.find((node) => node.type === "market_play");
    const profile = state.path.find((node) => node.type === "customer_profile" && node.name === "Operating");
    assert.deepEqual(state.knowledgeCategories.product, ["capability", "limitation", "delivery", "proof", "ownership", "claim_guardrail"]);
    assert.deepEqual(state.knowledgeCategories.marketPlay, ["market", "problem", "audience", "language", "evidence", "offer_context"]);
    assert.deepEqual(state.knowledgeCategories.customerProfile, ["fit", "disqualifier", "roles", "signals", "rubric", "proof_policy", "contact_policy", "outreach_policy", "schedule", "timezone", "output_target"]);
    await assert.rejects(commercial.createHierarchyDraft(fixture.database, principal, { type: "market_play", parentId: profile.id, name: "Wrong parent", expectedRevision: profile.revision, idempotencyKey: "0198a4b0-0000-7000-8000-000000000103" }), /parent|scope/i);
    await assert.rejects(commercial.createHierarchyDraft(fixture.database, principal, { type: "offer", parentId: profile.id, name: "Direct Offer", expectedRevision: profile.revision, idempotencyKey: "0198a4b0-0000-7000-8000-000000000104" }), /offer/i);
    await assert.rejects(commercial.createHierarchyDraft(fixture.database, principal, { type: "product", parentId: "foreign-workspace-product", name: "Foreign", expectedRevision: 1, idempotencyKey: "0198a4b0-0000-7000-8000-000000000105" }), /scope|workspace/i);
    const marine = await commercial.createHierarchyDraft(fixture.database, principal, { type: "market_play", parentId: product.id, name: "ONE for Marine", expectedRevision: product.revision, idempotencyKey: "0198a4b0-0000-7000-8000-000000000106" });
    assert.equal(marine.parentId, product.id, "ONE for Marine reuses ONE while fundamentals agree");
    await assert.rejects(commercial.createHierarchyDraft(fixture.database, principal, { type: "market_play", parentId: product.id, name: "Fundamentally divergent delivery", expectedRevision: product.revision, idempotencyKey: "0198a4b0-0000-7000-8000-000000000107", productFundamentalsDiverge: true }), /product/i);
    const raced = await runRace([
      () => commercial.initializeCommercialModel(fixture.database, principal, { idempotencyKey: "0198a4b0-0000-7000-8000-000000000108" }),
      () => commercial.initializeCommercialModel(fixture.database, principal, { idempotencyKey: "0198a4b0-0000-7000-8000-000000000109" }),
    ]);
    assert.equal(raced.filter((result) => result.status === "fulfilled").length, 2);
    const reread = await commercial.readCommercialModel(fixture.database, principal);
    assert.equal(reread.path.filter((node) => node.type === "product" && node.name === "ONE").length, 1);
    assert.equal(reread.identities.organization.uniqueScope, "company");
    assert.equal(reread.identities.contact.uniqueScope, "company");
    assert.equal(reread.associations.account.uniqueScope, "market_play_profile");
    await assert.rejects(commercial.createHierarchyDraft(fixture.database, principal, { type: "customer_profile", parentId: play.id, name: "Stale", expectedRevision: 0, idempotencyKey: "0198a4b0-0000-7000-8000-000000000110" }), /stale|revision/i);
    await assertForbiddenOperationalRowsUnchanged(fixture.database, before);
  } finally { await fixture.dispose(); }
});
