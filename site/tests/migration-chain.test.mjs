import assert from "node:assert/strict";
import test from "node:test";
import {
  applyPhase2Migrations,
  createD1Fixture,
  seedBoundHistorian,
  seedCoexistenceHistorian,
  seedLegacyUnboundHistorian,
} from "./helpers/d1.mjs";

async function historianSnapshot(database) {
  const result = await database.prepare(`
    SELECT a.id AS answer_id, a.proposal_digest, c.id AS confirmation_id,
      c.operation_digest, k.id AS knowledge_id, k.source_digest, k.value_json,
      (SELECT COUNT(*) FROM audit_events) AS audit_count
    FROM interview_answers a
    JOIN interview_confirmations c ON c.answer_id = a.id
    JOIN knowledge_versions k ON k.id = c.knowledge_version_id
    ORDER BY a.id
  `).all();
  return result.results;
}

test("0000-0004 preserves bound historian authority and is idempotent", async () => {
  const fixture = await createD1Fixture("migration-bound");
  try {
    const historian = await seedBoundHistorian(fixture.database);
    const before = await historianSnapshot(fixture.database);
    await applyPhase2Migrations(fixture.database);
    const foreignKeys = await fixture.database.prepare("PRAGMA foreign_key_check").all();
    assert.deepEqual(foreignKeys.results, []);
    assert.deepEqual(await historianSnapshot(fixture.database), before);
    const company = await fixture.database.prepare("SELECT company_id FROM workspace_companies WHERE workspace_id = ?").bind(historian.workspaceId).all();
    assert.equal(company.results.length, 1);
    const authority = await fixture.database.prepare("SELECT COUNT(*) AS count FROM interview_authority_bindings WHERE answer_id = ?").bind(historian.answerId).first();
    assert.equal(Number(authority.count), 1);
    await applyPhase2Migrations(fixture.database);
    const retried = await fixture.database.prepare("SELECT COUNT(*) AS count FROM interview_authority_bindings WHERE answer_id = ?").bind(historian.answerId).first();
    assert.equal(Number(retried.count), 1);
  } finally { await fixture.dispose(); }
});

test("0004 leaves legacy-unbound historian in explicit review-required quarantine", async () => {
  const fixture = await createD1Fixture("migration-unbound");
  try {
    const historian = await seedLegacyUnboundHistorian(fixture.database);
    await applyPhase2Migrations(fixture.database);
    const review = await fixture.database.prepare("SELECT status FROM interview_authority_review WHERE answer_id = ?").bind(historian.answerId).first();
    assert.equal(review.status, "review_required");
  } finally { await fixture.dispose(); }
});

test("0004 preserves coexistence without silently rebinding legacy authority", async () => {
  const fixture = await createD1Fixture("migration-coexistence");
  try {
    const historian = await seedCoexistenceHistorian(fixture.database);
    const before = await historianSnapshot(fixture.database);
    await applyPhase2Migrations(fixture.database);
    assert.deepEqual(await historianSnapshot(fixture.database), before);
    const bound = await fixture.database.prepare("SELECT COUNT(*) AS count FROM interview_authority_bindings WHERE answer_id = ?").bind(historian.bound.answerId).first();
    const unbound = await fixture.database.prepare("SELECT status FROM interview_authority_review WHERE answer_id = ?").bind(historian.legacy.answerId).first();
    assert.equal(Number(bound.count), 1);
    assert.equal(unbound.status, "review_required");
  } finally { await fixture.dispose(); }
});

test("Phase 2 migration path stops at exactly 0004", async () => {
  const fixture = await createD1Fixture("migration-exact-phase2");
  try {
    await applyPhase2Migrations(fixture.database);
    const phase2Table = await fixture.database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'phase_activation_gates'").first();
    const laterTable = await fixture.database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'market_play_proposal_decisions'").first();
    assert.equal(phase2Table.name, "phase_activation_gates");
    assert.equal(laterTable, null);
  } finally { await fixture.dispose(); }
});
