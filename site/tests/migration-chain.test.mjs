import assert from "node:assert/strict";
import test from "node:test";
import { buildPreflightCommands } from "../scripts/phase2-hosted-preflight.mjs";
import {
  applyPhase2Migrations,
  createD1Fixture,
  seedBoundHistorian,
  seedCoexistenceHistorian,
  seedLegacyUnboundHistorian,
  snapshotForbiddenOperationalRows,
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

test("real 0000-0004 schema keeps prospects present and adds only an empty contacts table", async () => {
  const fixture = await createD1Fixture("migration-forbidden-schema");
  try {
    await seedBoundHistorian(fixture.database);
    const before = await snapshotForbiddenOperationalRows(fixture.database);
    assert.deepEqual(before.prospects, { present: true, count: 0, rows: [] });
    assert.deepEqual(before.contacts, { present: false, count: null, rows: null });

    await applyPhase2Migrations(fixture.database);
    const after = await snapshotForbiddenOperationalRows(fixture.database);
    assert.deepEqual(after.prospects, { present: true, count: 0, rows: [] });
    assert.deepEqual(after.contacts, { present: true, count: 0, rows: [] });
    for (const [name, state] of Object.entries(after)) {
      if (name !== "prospects" && name !== "contacts") assert.deepEqual(state, { present: false, count: null, rows: null });
    }

    const queryResults = {};
    for (const command of buildPreflightCommands({ mode: "post-migration", database: "00000000-0000-0000-0000-000000000004" })) {
      if (command.key === "migrations") continue;
      try {
        queryResults[command.key] = (await fixture.database.prepare(command.args.at(-1)).all()).results;
      } catch (error) {
        throw new Error(`fixed ${command.key} query failed against real 0000-0004 schema`, { cause: error });
      }
    }
    assert.deepEqual(queryResults.forbiddenTables, [{ name: "contacts" }, { name: "prospects" }]);
    assert.equal(Number(queryResults.counts[0].prospect_count), 0);
    assert.equal(Number(queryResults.counts[0].contact_count), 0);
  } finally { await fixture.dispose(); }
});
