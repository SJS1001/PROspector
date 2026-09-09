import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { resolve } from "node:path";
import { createServer } from "vite";
import { CANONICAL_MIGRATION_FILENAMES } from "../scripts/migration-chain.mjs";

const root = resolve(import.meta.dirname, "..");
const request = verificationRequest();
const bindings = Object.freeze({ PROSPECTOR_PERSON_DISCOVERY_C4: "synthetic-zero-network-c4-v1", TRUSTED_IDENTITY_PROVIDER: "local-demo", LOCAL_DEMO: "1" });

test("the durable discovery intent drives canonical enrichment settlement and ContactReady projection", async () => {
  const fixture = await createLocalFixture();
  try {
    await applyCanonicalMigrations(fixture.database);
    fixture.gateTriggerSql = await triggerSql(fixture.database);
    const acceptance = await fixture.vite.ssrLoadModule(resolve(root, "domain/person-discovery-c4-acceptance.ts"));
    const consumer = await fixture.vite.ssrLoadModule(resolve(root, "domain/person-discovery-c4-verification.ts"));
    await acceptance.seedPersonDiscoveryC4(fixture.database, "local-owner@prospector.invalid", "synthetic-browser-acceptance-pepper-32-bytes-minimum");
    const workspace = await fixture.database.prepare("SELECT id,owner_subject FROM workspaces LIMIT 1").first();
    const scope = { workspaceId: workspace.id, principalSubject: workspace.owner_subject };

    assert.deepEqual(await consumer.consumePersonDiscoveryC4VerificationIntent(request, bindings, fixture.database, scope, { relevanceId: "missing", channel: "email" }), { kind: "blocked", reason: "verification_intent_unavailable" });
    assert.equal(await countRows(fixture.database, "enrichment_grants"), 0);

    const service = acceptance.createPersonDiscoveryC4Service(request, bindings, fixture.database);
    const authority = await fixture.database.prepare("SELECT p.revision prospect_revision,cfg.id configuration_id,cfg.digest configuration_digest,cfg.revision configuration_revision FROM profile_prospects p JOIN typed_configurations cfg ON cfg.owner_id=p.profile_id AND cfg.workspace_id=p.workspace_id AND cfg.kind='profile_effective' AND cfg.active=1 WHERE p.id='c4-approved-prospect'").first();
    const started = await service.start(scope, {
      prospectId: "c4-approved-prospect", expectedProspectRevision: Number(authority.prospect_revision),
      expectedConfigurationId: authority.configuration_id, expectedConfigurationDigest: authority.configuration_digest,
      expectedConfigurationRevision: Number(authority.configuration_revision), maxCandidates: 2, maxProvenancePerCandidate: 1,
      idempotencyKey: "c4-consumer-start",
    });
    assert.equal(started.kind, "accepted");
    const decided = await service.decide(scope, { runId: started.run.id, expectedResultDigest: started.run.resultDigest, decision: "create_new", candidateId: started.run.candidates[0].id, idempotencyKey: "c4-consumer-decision" });
    assert.equal(decided.kind, "accepted");
    const intent = await service.recordVerificationIntent(scope, {
      relevanceId: decided.decision.relevanceId, intent: "initial_verification", channel: "email",
      expectedProspectRevision: Number(authority.prospect_revision), expectedContactRevision: 1,
      expectedConfigurationId: authority.configuration_id, expectedConfigurationDigest: authority.configuration_digest,
      expectedConfigurationRevision: Number(authority.configuration_revision), idempotencyKey: "c4-consumer-intent",
    });
    assert.equal(intent.kind, "accepted");

    const result = await consumer.consumePersonDiscoveryC4VerificationIntent(request, bindings, fixture.database, scope, { relevanceId: decided.decision.relevanceId, channel: "email" });
    assert.deepEqual(result, { kind: "verified", state: "ContactReady", eligible: true, replayed: false });
    assert.deepEqual(await consumer.consumePersonDiscoveryC4VerificationIntent(request, bindings, fixture.database, scope, { relevanceId: decided.decision.relevanceId, channel: "email" }), { kind: "verified", state: "ContactReady", eligible: true, replayed: true });
    assert.equal(await countRows(fixture.database, "enrichment_grants"), 1);
    assert.equal(await countRows(fixture.database, "enrichment_reservations"), 1);
    assert.equal(await countRows(fixture.database, "contact_point_observations"), 1);
    assert.equal(await countRows(fixture.database, "contact_verification_receipts"), 1);
    assert.equal(await countRows(fixture.database, "contact_eligibility_snapshots"), 1);
    const snapshot = await fixture.database.prepare("SELECT state,eligible FROM contact_eligibility_snapshots").first();
    assert.deepEqual({ ...snapshot }, { state: "ContactReady", eligible: 1 });
    assert.equal(await countRows(fixture.database, "phase_activation_gates"), 0);
    assert.equal(await triggerSql(fixture.database), fixture.gateTriggerSql, "the local seam must never mutate the immutable gate trigger");
    for (const table of ["outreach_messages", "outreach_outbox_items", "outreach_sender_connections", "prospecting_schedules"]) assert.equal(await countRows(fixture.database, table), 0);
    assert.deepEqual((await fixture.database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE '%export%' OR name LIKE '%archive%')").all()).results, []);
  } finally { await fixture.dispose(); }
});

test("the composer is absent off the exact local-demo loopback binding", async () => {
  const fixture = await createLocalFixture();
  try {
    await applyCanonicalMigrations(fixture.database);
    fixture.gateTriggerSql = await triggerSql(fixture.database);
    const consumer = await fixture.vite.ssrLoadModule(resolve(root, "domain/person-discovery-c4-verification.ts"));
    const result = await consumer.consumePersonDiscoveryC4VerificationIntent(new Request("https://example.invalid/verify"), bindings, fixture.database, { workspaceId: "x", principalSubject: "x" }, { relevanceId: "x", channel: "email" });
    assert.deepEqual(result, { kind: "blocked", reason: "capability_unavailable" });
    assert.equal(await countRows(fixture.database, "phase_activation_gates"), 0);
    assert.equal(await countRows(fixture.database, "provider_quotes"), 0);
  } finally { await fixture.dispose(); }
});

test("the local projection seam rejects malformed origins, non-loopback hosts, flags, and outsider scope without writes", async () => {
  const fixture = await createLocalFixture();
  try {
    await applyCanonicalMigrations(fixture.database);
    fixture.gateTriggerSql = await triggerSql(fixture.database);
    const { consumer, scope, relevanceId } = await arrangeVerificationIntent(fixture);
    const attempts = [
      [verificationRequest({ origin: "https://attacker.invalid" }), bindings, scope],
      [verificationRequest({ url: "https://prospector.example/verify", origin: "https://prospector.example" }), bindings, scope],
      [verificationRequest({ origin: null }), bindings, scope],
      [verificationRequest({ intent: "wrong-intent" }), bindings, scope],
      [verificationRequest({ fetchSite: "cross-site" }), bindings, scope],
      [verificationRequest(), { ...bindings, LOCAL_DEMO: "true" }, scope],
      [verificationRequest(), bindings, { ...scope, principalSubject: "outsider-subject" }],
    ];
    for (const [candidateRequest, candidateBindings, scope] of attempts) {
      const result = await consumer.consumePersonDiscoveryC4VerificationIntent(candidateRequest, candidateBindings, fixture.database, scope, { relevanceId, channel: "email" });
      assert.equal(result.kind, "blocked");
    }
    for (const table of ["phase_activation_gates", "provider_quotes", "enrichment_grants", "enrichment_reservations", "contact_point_observations", "contact_verification_receipts", "contact_eligibility_snapshots"]) {
      assert.equal(await countRows(fixture.database, table), 0, `${table} must remain empty`);
    }
    assert.equal(await triggerSql(fixture.database), fixture.gateTriggerSql);
  } finally { await fixture.dispose(); }
});

test("a settled crash-window retry projects once without a second provider operation", async () => {
  const fixture = await createLocalFixture();
  try {
    await applyCanonicalMigrations(fixture.database);
    const { consumer, scope, relevanceId } = await arrangeVerificationIntent(fixture);
    const command = { relevanceId, channel: "email" };
    assert.equal((await consumer.settlePersonDiscoveryC4VerificationIntentForTest(verificationRequest(), bindings, fixture.database, scope, command)).kind, "settled_for_test");
    const terminalBefore = await countRows(fixture.database, "enrichment_reservation_events");
    const observationsBefore = await countRows(fixture.database, "contact_point_observations");
    assert.equal(await countRows(fixture.database, "contact_eligibility_snapshots"), 0);

    const recovered = await consumer.consumePersonDiscoveryC4VerificationIntent(verificationRequest(), bindings, fixture.database, scope, command);
    assert.deepEqual(recovered, { kind: "verified", state: "ContactReady", eligible: true, replayed: false });
    assert.equal(await countRows(fixture.database, "contact_eligibility_snapshots"), 1);
    assert.equal(await countRows(fixture.database, "enrichment_reservation_events"), terminalBefore);
    assert.equal(await countRows(fixture.database, "contact_point_observations"), observationsBefore);
  } finally { await fixture.dispose(); }
});

test("an uncertain provider outcome is durably reconciled and never promotes or retries", async () => {
  const fixture = await createLocalFixture();
  try {
    await applyCanonicalMigrations(fixture.database);
    const { consumer, scope, relevanceId } = await arrangeVerificationIntent(fixture);
    const command = { relevanceId, channel: "email" };
    assert.deepEqual(
      await consumer.consumePersonDiscoveryC4UncertainVerificationIntentForTest(verificationRequest(), bindings, fixture.database, scope, command),
      { kind: "blocked", reason: "verification_unavailable" },
    );
    assert.equal(await countRows(fixture.database, "contact_eligibility_snapshots"), 0);
    assert.equal(await countRows(fixture.database, "contact_point_observations"), 0);
    assert.equal(Number((await fixture.database.prepare("SELECT COUNT(*) count FROM enrichment_reservation_events WHERE state='needs_reconciliation'").first()).count), 1);
    const eventsBefore = await countRows(fixture.database, "enrichment_reservation_events");
    assert.deepEqual(
      await consumer.consumePersonDiscoveryC4VerificationIntent(verificationRequest(), bindings, fixture.database, scope, command),
      { kind: "blocked", reason: "verification_unavailable" },
    );
    assert.equal(await countRows(fixture.database, "enrichment_reservation_events"), eventsBefore);
    assert.equal(await countRows(fixture.database, "contact_eligibility_snapshots"), 0);
  } finally { await fixture.dispose(); }
});

test("stale durable intent authority is rejected before quote, grant, provider, or ContactReady effects", async () => {
  const fixture = await createLocalFixture();
  try {
    await applyCanonicalMigrations(fixture.database);
    fixture.gateTriggerSql = await triggerSql(fixture.database);
    const { consumer, scope, relevanceId } = await arrangeVerificationIntent(fixture);
    await fixture.database.prepare("UPDATE profile_prospects SET revision=revision+1 WHERE id='c4-approved-prospect'").run();

    const result = await consumer.consumePersonDiscoveryC4VerificationIntent(
      verificationRequest(), bindings, fixture.database, scope, { relevanceId, channel: "email" },
    );
    assert.deepEqual(result, { kind: "blocked", reason: "verification_intent_unavailable" });
    for (const table of ["phase_activation_gates", "provider_quotes", "enrichment_grants", "enrichment_reservations", "contact_point_observations", "contact_verification_receipts", "contact_eligibility_snapshots"]) {
      assert.equal(await countRows(fixture.database, table), 0, `${table} must remain empty`);
    }
    assert.equal(await triggerSql(fixture.database), fixture.gateTriggerSql);
  } finally { await fixture.dispose(); }
});

async function createLocalFixture() {
  const sqlite = new DatabaseSync(":memory:", { enableForeignKeyConstraints: true });
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  const database = d1Compatible(sqlite);
  return { database, vite, gateTriggerSql: null, async dispose() { await vite.close(); sqlite.close(); } };
}

function d1Compatible(sqlite) {
  function prepare(sql) {
    const statement = sqlite.prepare(sql);
    const bound = [];
    const api = {
      bind(...values) { bound.splice(0, bound.length, ...values); return api; },
      async run() {
        const result = statement.run(...bound);
        return { success: true, meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
      },
      async first(column) {
        const row = statement.get(...bound) ?? null;
        return column && row ? row[column] ?? null : row;
      },
      async all() { return { success: true, results: statement.all(...bound) }; },
      async raw() { return statement.all(...bound).map((row) => Object.values(row)); },
    };
    return api;
  }
  return { prepare, async batch(statements) { return Promise.all(statements.map((statement) => statement.run())); } };
}

async function applyCanonicalMigrations(database) {
  for (const filename of CANONICAL_MIGRATION_FILENAMES) {
    const sql = await readFile(new URL(`../drizzle/${filename}`, import.meta.url), "utf8");
    for (const statement of sql.split("--> statement-breakpoint")) {
      if (statement.trim()) await database.prepare(statement.trim()).run();
    }
  }
}

async function arrangeVerificationIntent(fixture) {
  const acceptance = await fixture.vite.ssrLoadModule(resolve(root, "domain/person-discovery-c4-acceptance.ts"));
  const consumer = await fixture.vite.ssrLoadModule(resolve(root, "domain/person-discovery-c4-verification.ts"));
  await acceptance.seedPersonDiscoveryC4(fixture.database, "local-owner@prospector.invalid", "synthetic-browser-acceptance-pepper-32-bytes-minimum");
  const workspace = await fixture.database.prepare("SELECT id,owner_subject FROM workspaces LIMIT 1").first();
  const scope = { workspaceId: workspace.id, principalSubject: workspace.owner_subject };
  const service = acceptance.createPersonDiscoveryC4Service(verificationRequest(), bindings, fixture.database);
  const authority = await fixture.database.prepare("SELECT p.revision prospect_revision,cfg.id configuration_id,cfg.digest configuration_digest,cfg.revision configuration_revision FROM profile_prospects p JOIN typed_configurations cfg ON cfg.owner_id=p.profile_id AND cfg.workspace_id=p.workspace_id AND cfg.kind='profile_effective' AND cfg.active=1 WHERE p.id='c4-approved-prospect'").first();
  const started = await service.start(scope, {
    prospectId: "c4-approved-prospect", expectedProspectRevision: Number(authority.prospect_revision),
    expectedConfigurationId: authority.configuration_id, expectedConfigurationDigest: authority.configuration_digest,
    expectedConfigurationRevision: Number(authority.configuration_revision), maxCandidates: 2, maxProvenancePerCandidate: 1,
    idempotencyKey: "c4-stale-consumer-start",
  });
  assert.equal(started.kind, "accepted");
  const decided = await service.decide(scope, { runId: started.run.id, expectedResultDigest: started.run.resultDigest, decision: "create_new", candidateId: started.run.candidates[0].id, idempotencyKey: "c4-stale-consumer-decision" });
  assert.equal(decided.kind, "accepted");
  const intent = await service.recordVerificationIntent(scope, {
    relevanceId: decided.decision.relevanceId, intent: "initial_verification", channel: "email",
    expectedProspectRevision: Number(authority.prospect_revision), expectedContactRevision: 1,
    expectedConfigurationId: authority.configuration_id, expectedConfigurationDigest: authority.configuration_digest,
    expectedConfigurationRevision: Number(authority.configuration_revision), idempotencyKey: "c4-stale-consumer-intent",
  });
  assert.equal(intent.kind, "accepted");
  return { consumer, scope, relevanceId: decided.decision.relevanceId };
}

function verificationRequest({ url = "http://127.0.0.1:8788/api/local-demo/person-discovery-c4/verification", origin = "http://127.0.0.1:8788", intent = "person-discovery-c4-verification", fetchSite = "same-origin" } = {}) {
  const headers = { "sec-fetch-site": fetchSite, "content-type": "application/json", "x-prospector-intent": intent };
  if (origin !== null) headers.origin = origin;
  return new Request(url, { method: "POST", headers, body: "{}" });
}

async function triggerSql(database) {
  return (await database.prepare("SELECT sql FROM sqlite_master WHERE type='trigger' AND name='phase_gate_activation_disabled_insert'").first())?.sql ?? null;
}

async function countRows(database, table) {
  return Number((await database.prepare(`SELECT COUNT(*) count FROM ${table}`).first()).count);
}
