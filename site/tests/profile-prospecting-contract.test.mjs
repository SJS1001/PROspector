import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  applyMigrations,
  assertForbiddenOperationalRowsUnchanged,
  createD1Fixture,
  countRows,
  seedBoundHistorian,
  snapshotForbiddenOperationalRows,
} from "./helpers/d1.mjs";

const NOW = 1_780_000_000_000;
const OWNER = { subject: "phase4-contract-owner", legacySubject: "phase4-contract-owner-legacy", displayName: "Phase 4 contract owner" };

async function seedProfileAuthority(fixture) {
  const commercial = await fixture.vite.ssrLoadModule(new URL("../domain/commercial-model.ts", import.meta.url).pathname);
  const model = await commercial.initializeCommercialModel(fixture.database, OWNER, { idempotencyKey: "0198f400-0000-7000-8000-000000000001" });
  const product = model.products.find((entry) => entry.name === "ONE");
  const profile = model.profiles.find((entry) => entry.name === "Operating");
  const workspace = await fixture.database.prepare("SELECT id FROM workspaces WHERE owner_subject = ? LIMIT 1").bind(OWNER.subject).first();
  const now = NOW;
  await fixture.database.batch([
    fixture.database.prepare("INSERT INTO typed_configurations (id, workspace_id, created_at, updated_at, revision, company_id, owner_type, owner_id, kind, digest, manifest_json, active) VALUES ('phase4-product-config', ?, ?, ?, 1, NULL, 'product', ?, 'product_discovery', ?, '{}', 1)").bind(workspace.id, now, now, product.id, "a".repeat(64)),
    fixture.database.prepare("UPDATE customer_profiles SET timezone = 'America/Toronto', weekly_target = 1 WHERE id = ?").bind(profile.id),
  ]);
  const row = await fixture.database.prepare("SELECT revision FROM customer_profiles WHERE id = ?").bind(profile.id).first();
  return { profileId: profile.id, revision: Number(row.revision) };
}

test("04-02 full chain installs constrained Phase 4 persistence without Phase 5–7 effect tables", async () => {
  const fixture = await createD1Fixture("phase4-schema-contract");
  try {
    const historian = await seedBoundHistorian(fixture.database);
    await applyMigrations(fixture.database);
    const expected = [
      "profile_configuration_candidates", "profile_configuration_activations", "prospecting_schedules", "prospecting_runs", "prospecting_run_events",
      "runner_assignments", "runner_assignment_revocations", "runner_submissions", "prospecting_source_lineage", "prospecting_signals",
      "prospecting_candidates", "qualification_assessments", "profile_prospects", "prospect_review_decisions", "prospect_cooldowns", "prospect_reentry_events",
    ];
    for (const table of expected) {
      const row = await fixture.database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").bind(table).first();
      assert.equal(row?.name, table, `${table} must be in the additive 0007 schema`);
      assert.equal(await countRows(fixture.database, table), 0);
    }
    for (const table of ["enriched_contacts", "enrichment_grants", "outreach_packages", "message_versions", "message_dispatches", "export_jobs", "provider_credentials", "provider_secrets"]) {
      const row = await fixture.database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").bind(table).first();
      assert.equal(row, null, `${table} belongs to a later effect phase and must be absent`);
    }
    for (const trigger of ["runner_submission_scope_insert", "runner_assignment_secret_immutable_update", "qualification_assessment_immutable_update", "prospect_review_immutable_update"]) {
      const row = await fixture.database.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' AND name = ?").bind(trigger).first();
      assert.equal(row?.name, trigger, `${trigger} must enforce D1-side containment`);
    }
    for (const [table, index] of [
      ["profile_configuration_activations", "profile_configuration_activation_candidate_unique"],
      ["prospecting_schedules", "prospecting_schedule_active_profile_unique"],
      ["prospecting_runs", "prospecting_initial_run_unique"],
      ["runner_assignments", "runner_assignment_token_hash_unique"],
      ["profile_prospects", "profile_prospect_active_fingerprint_unique"],
      ["prospect_cooldowns", "prospect_cooldown_active_unique"],
    ]) {
      const indexes = await fixture.database.prepare(`PRAGMA index_list('${table}')`).all();
      assert.ok(indexes.results.some((entry) => entry.name === index), `${index} must arbitrate duplicate active Phase 4 facts`);
    }
    for (const [table, referencedTable] of [
      ["prospecting_runs", "typed_configurations"],
      ["runner_submissions", "runner_assignments"],
      ["prospecting_signals", "prospecting_source_lineage"],
      ["qualification_assessments", "prospecting_candidates"],
      ["prospect_review_decisions", "profile_prospects"],
    ]) {
      const foreignKeys = await fixture.database.prepare(`PRAGMA foreign_key_list('${table}')`).all();
      assert.ok(foreignKeys.results.some((entry) => entry.table === referencedTable), `${table} must retain its ${referencedTable} lineage FK`);
    }
    const replayedHistorian = await fixture.database.prepare("SELECT id FROM knowledge_versions WHERE id = ?").bind(historian.knowledgeVersionId).first();
    assert.equal(replayedHistorian?.id, historian.knowledgeVersionId, "0007 must preserve prior Phase 2/3 historian rows");
    const migration = await readFile(new URL("../drizzle/0007_profile_prospecting.sql", import.meta.url), "utf8");
    assert.doesNotMatch(migration, /(?:DROP INDEX|ALTER TABLE)\s+`private_synthetic_proof_/i, "0007 must be strictly additive from committed 0006");
  } finally { await fixture.dispose(); }
});

test("D-05 qualification review requires a reason/date and never authorizes Phase 5–7 effects", async () => {
  const fixture = await createD1Fixture("phase4-review-contract");
  try {
    await applyMigrations(fixture.database);
    const review = await fixture.vite.ssrLoadModule(new URL("../domain/prospect-review.ts", import.meta.url).pathname)
      .catch(() => assert.fail("missing production behavior: site/domain/prospect-review.ts must persist immutable assessments and owner review cooldowns"));
    const before = await snapshotForbiddenOperationalRows(fixture.database);
    for (const [decision, input] of [["approve", {}], ["reject", {}], ["defer", { reason: "awaiting budget", reviewAt: NOW + 7 * 86_400_000 }]]) {
      if (decision !== "approve") await assert.rejects(
        () => review.decideQualifiedProspect(fixture.database, OWNER, { prospectId: "prospect-a", decision, expectedRevision: 1, idempotencyKey: `0198f400-0000-7000-8000-0000000002${decision.length}`, ...input }),
        /reason/i,
      );
    }
    await assertForbiddenOperationalRowsUnchanged(fixture.database, before);
  } finally { await fixture.dispose(); }
});

async function loadProfileReadiness(fixture) {
  try {
    return await fixture.vite.ssrLoadModule(new URL("../domain/profile-readiness.ts", import.meta.url).pathname);
  } catch {
    assert.fail("missing production behavior: site/domain/profile-readiness.ts must resolve immutable Phase 3 authority before creating or activating a Profile configuration");
  }
}

function activePhase3Authority(overrides = {}) {
  return {
    productConfiguration: { id: "product-config", digest: "a".repeat(64), active: true, productId: "product-one" },
    acceptedPlay: { id: "play-mining", digest: "b".repeat(64), active: true, productId: "product-one" },
    offer: { id: "offer-mining", digest: "c".repeat(64), active: true, playId: "play-mining", profileId: "profile-mining" },
    sourcePolicy: { id: "source-policy", digest: "d".repeat(64), active: true, playId: "play-mining" },
    runnerPolicy: { id: "runner-policy", digest: "e".repeat(64), active: true, productId: "product-one" },
    scheduleSemantics: { id: "schedule-policy", digest: "f".repeat(64), timezone: "America/Toronto", active: true },
    replacementDirectives: { id: "replacement-directives", digest: "0".repeat(64), active: true },
    ...overrides,
  };
}

test("D-01 Phase 4 rejects every missing, stale, or wrong-scoped immutable Phase 3 predecessor", async () => {
  const fixture = await createD1Fixture("phase4-prerequisite-contract");
  try {
    await applyMigrations(fixture.database);
    const profile = await loadProfileReadiness(fixture);
    const before = await snapshotForbiddenOperationalRows(fixture.database);
    const seeded = await seedProfileAuthority(fixture);
    await fixture.database.prepare("DELETE FROM typed_configurations WHERE id = 'phase4-product-config'").run();
    await assert.rejects(
      () => profile.createProfileConfigurationCandidate(fixture.database, OWNER, {
        profileId: seeded.profileId, expectedProfileRevision: seeded.revision, phase3Authority: activePhase3Authority({ productConfiguration: null }), now: NOW,
        idempotencyKey: "0198f400-0000-7000-8000-000000000090",
      }),
      /Product Discovery Configuration/i,
      "client-supplied authority must not replace a missing persisted predecessor",
    );
    for (const table of ["runner_assignments", "accounts", "contacts", "prospects"]) {
      assert.equal(await countRows(fixture.database, table), before[table]?.count ?? 0, `${table} must remain unaffected`);
    }
  } finally { await fixture.dispose(); }
});

test("D-01/D-02 Profile candidate and activation are separate, immutable, and zero-effect downstream", async () => {
  const fixture = await createD1Fixture("phase4-activation-contract");
  try {
    await applyMigrations(fixture.database);
    const profile = await loadProfileReadiness(fixture);
    const before = await snapshotForbiddenOperationalRows(fixture.database);
    const seeded = await seedProfileAuthority(fixture);
    const candidate = await profile.createProfileConfigurationCandidate(fixture.database, OWNER, {
      profileId: seeded.profileId, expectedProfileRevision: seeded.revision, now: NOW,
      idempotencyKey: "0198f400-0000-7000-8000-000000000101",
    });
    assert.equal(candidate.status, "candidate_not_active");
    assert.match(candidate.digest, /^[0-9a-f]{64}$/);
    const active = await profile.activateProfileConfiguration(fixture.database, OWNER, {
      candidateId: candidate.id, expectedRevision: candidate.revision, expectedDigest: candidate.digest, now: NOW,
      idempotencyKey: "0198f400-0000-7000-8000-000000000102",
    });
    assert.equal(active.configuration.active, true);
    assert.equal(active.initialRun.trigger, "initial");
    assert.equal(active.schedule.timezone, "America/Toronto");
    assert.equal(active.initialRun.executionState, "blocked_missing_capability");
    for (const table of ["runner_assignments", "accounts", "contacts", "prospects"]) {
      assert.equal(await countRows(fixture.database, table), before[table]?.count ?? 0, `${table} must remain unaffected`);
    }
  } finally { await fixture.dispose(); }
});
