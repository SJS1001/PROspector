import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { admitProspectingRunToQueue, digestProspectingRunAdmissionRequest } from "../domain/prospecting-run-admission.ts";

const NOW = 1_780_000_000_000;
const EVIDENCE_DIGEST = "e".repeat(64);

function setup(label) {
  const database = new LocalD1();
  database.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE typed_configurations (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, owner_type TEXT NOT NULL,
      owner_id TEXT NOT NULL, kind TEXT NOT NULL, digest TEXT NOT NULL, active INTEGER NOT NULL
    );
    CREATE TABLE prospecting_runs (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, profile_id TEXT NOT NULL,
      configuration_id TEXT NOT NULL, configuration_digest TEXT NOT NULL,
      revision INTEGER NOT NULL, execution_state TEXT NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE authority_commands (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL, revision INTEGER NOT NULL, command_type TEXT NOT NULL,
      idempotency_key TEXT NOT NULL, operation_digest TEXT NOT NULL,
      expected_revision INTEGER NOT NULL, subject_type TEXT NOT NULL,
      subject_id TEXT NOT NULL, status TEXT NOT NULL,
      UNIQUE(workspace_id,idempotency_key), UNIQUE(workspace_id,operation_digest)
    );
    CREATE TABLE audit_events (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, actor_type TEXT NOT NULL,
      actor_id TEXT NOT NULL, action TEXT NOT NULL, subject_type TEXT NOT NULL,
      subject_id TEXT NOT NULL, detail_json TEXT NOT NULL, created_at INTEGER NOT NULL
    );
  `);
  const seed = {
    workspaceId: `${label}-workspace`, profileId: `${label}-profile`,
    configurationId: `${label}-configuration`, configurationDigest: "a".repeat(64), runId: `${label}-run`,
  };
  database.db.prepare("INSERT INTO typed_configurations VALUES (?,?,?,?,?,?,1)").run(seed.configurationId, seed.workspaceId, "profile", seed.profileId, "profile_effective", seed.configurationDigest);
  database.db.prepare("INSERT INTO prospecting_runs VALUES (?,?,?,?,?,1,'blocked_missing_capability',?)").run(seed.runId, seed.workspaceId, seed.profileId, seed.configurationId, seed.configurationDigest, NOW);
  return { database, ...seed };
}

function trustedPort(overrides = {}) {
  return { async authorize(request) { return {
    kind: "authorized", authorityId: "local-synthetic-transport-proof", evidenceDigest: EVIDENCE_DIGEST,
    requestDigest: await digestProspectingRunAdmissionRequest(request), validUntil: NOW + 60_000, ...overrides,
  }; } };
}

function input(seed, overrides = {}) {
  return { workspaceId: seed.workspaceId, runId: seed.runId, expectedRunRevision: 1, idempotencyKey: "queue-admission-key", now: NOW, ...overrides };
}

async function runState(seed) {
  return seed.database.prepare("SELECT execution_state,revision FROM prospecting_runs WHERE id=? AND workspace_id=?").bind(seed.runId, seed.workspaceId).first();
}

async function admissionCounts(seed) {
  const command = await seed.database.prepare("SELECT COUNT(*) count FROM authority_commands WHERE workspace_id=? AND command_type='profile.prospecting.transport_admission'").bind(seed.workspaceId).first();
  const audit = await seed.database.prepare("SELECT COUNT(*) count FROM audit_events WHERE workspace_id=? AND action='prospecting.run.queued'").bind(seed.workspaceId).first();
  return { commands: Number(command.count), audits: Number(audit.count) };
}

test("transport admission is reject-only by default and tenant-scoped", async () => {
  const seed = setup("reject-only");
  await assert.rejects(() => admitProspectingRunToQueue(seed.database, input(seed)), rejected);
  let invoked = false;
  await assert.rejects(() => admitProspectingRunToQueue(seed.database, input(seed, { workspaceId: "another-workspace" }), {
    async authorize() { invoked = true; return { kind: "denied" }; },
  }), rejected);
  assert.equal(invoked, false, "a cross-tenant locator never reaches the capability adapter");
  await assert.rejects(() => admitProspectingRunToQueue(seed.database, { ...input(seed), unexpected: true }, {
    async authorize() { invoked = true; return { kind: "denied" }; },
  }), rejected);
  assert.equal(invoked, false, "an open input shape never reaches the capability adapter");
  assert.deepEqual(await runState(seed), { execution_state: "blocked_missing_capability", revision: 1 });
  assert.deepEqual(await admissionCounts(seed), { commands: 0, audits: 0 });
});

test("exact trusted admission queues once with immutable command and sanitized audit evidence", async () => {
  const seed = setup("success");
  const first = await admitProspectingRunToQueue(seed.database, input(seed), trustedPort());
  assert.deepEqual({ state: first.executionState, revision: first.revision, replayed: first.replayed }, { state: "queued", revision: 2, replayed: false });
  assert.match(first.operationDigest, /^[a-f0-9]{64}$/);
  assert.deepEqual(await runState(seed), { execution_state: "queued", revision: 2 });
  assert.deepEqual(await admissionCounts(seed), { commands: 1, audits: 1 });

  const audit = await seed.database.prepare("SELECT actor_type,actor_id,subject_type,subject_id,detail_json FROM audit_events WHERE workspace_id=? AND action='prospecting.run.queued'").bind(seed.workspaceId).first();
  const detail = JSON.parse(audit.detail_json);
  assert.deepEqual(
    { actorType: audit.actor_type, actorId: audit.actor_id, subjectType: audit.subject_type, subjectId: audit.subject_id },
    { actorType: "system", actorId: "prospecting-run-admission-service", subjectType: "prospecting_run", subjectId: seed.runId },
  );
  assert.deepEqual(
    { schema: detail.schema, from: detail.fromState, to: detail.toState, expected: detail.expectedRunRevision, resulting: detail.resultingRunRevision, externalEffects: detail.externalEffects },
    { schema: "prospecting-run-transport-admission/v1", from: "blocked_missing_capability", to: "queued", expected: 1, resulting: 2, externalEffects: false },
  );
  assert.equal(detail.evidenceDigest, EVIDENCE_DIGEST);
  assert.equal(detail.operationDigest, first.operationDigest);
  assert.deepEqual(Object.keys(detail).sort(), ["authorityCommandId", "authorityId", "evidenceDigest", "expectedRunRevision", "externalEffects", "fromState", "operationDigest", "requestDigest", "resultingRunRevision", "schema", "toState", "validUntil"].sort());

  const replay = await admitProspectingRunToQueue(seed.database, input(seed), trustedPort());
  assert.deepEqual({ state: replay.executionState, revision: replay.revision, replayed: replay.replayed, digest: replay.operationDigest }, { state: "queued", revision: 2, replayed: true, digest: first.operationDigest });
  assert.deepEqual(await admissionCounts(seed), { commands: 1, audits: 1 });
  await assert.rejects(() => admitProspectingRunToQueue(seed.database, input(seed, { expectedRunRevision: 2 }), trustedPort()), rejected, "same-key changed semantics cannot replay");
});

test("committed replay uses bound audit evidence after authority expiry without consulting the port", async () => {
  const seed = setup("expired-replay");
  const first = await admitProspectingRunToQueue(seed.database, input(seed), trustedPort());
  let invoked = false;
  const replay = await admitProspectingRunToQueue(seed.database, input(seed, { now: NOW + 60_001 }), {
    async authorize() {
      invoked = true;
      return {
        kind: "authorized",
        authorityId: "refreshed-authority",
        evidenceDigest: "f".repeat(64),
        requestDigest: "0".repeat(64),
        validUntil: NOW + 120_000,
      };
    },
  });
  assert.equal(invoked, false, "a committed exact-tuple replay must not require refreshed authority");
  assert.deepEqual(
    { state: replay.executionState, revision: replay.revision, replayed: replay.replayed, digest: replay.operationDigest },
    { state: "queued", revision: 2, replayed: true, digest: first.operationDigest },
  );
  assert.deepEqual(await admissionCounts(seed), { commands: 1, audits: 1 });

  const audit = await seed.database.prepare("SELECT id,detail_json FROM audit_events WHERE workspace_id=? AND action='prospecting.run.queued'").bind(seed.workspaceId).first();
  const tampered = { ...JSON.parse(audit.detail_json), requestDigest: "0".repeat(64) };
  seed.database.db.prepare("UPDATE audit_events SET detail_json=? WHERE id=?").run(JSON.stringify(tampered), audit.id);
  await assert.rejects(() => admitProspectingRunToQueue(seed.database, input(seed, { now: NOW + 60_002 }), {
    async authorize() { invoked = true; return { kind: "denied" }; },
  }), rejected, "replay must fail closed when stored audit evidence no longer matches the current request digest");
  assert.equal(invoked, false, "invalid prior evidence must not fall through to fresh authorization");
});

test("denied, expired, malformed, or tuple-mismatched authority cannot queue", async () => {
  const cases = [
    { name: "denied", port: { async authorize() { return { kind: "denied" }; } } },
    { name: "expired", port: trustedPort({ validUntil: NOW }) },
    { name: "overlong", port: trustedPort({ validUntil: NOW + 5 * 60_000 + 1 }) },
    { name: "wrong-request", port: trustedPort({ requestDigest: "0".repeat(64) }) },
    { name: "bad-evidence", port: trustedPort({ evidenceDigest: "not-a-digest" }) },
    { name: "extra-authority", port: trustedPort({ credential: "must-not-be-accepted" }) },
  ];
  for (const entry of cases) {
    const seed = setup(`invalid-${entry.name}`);
    await assert.rejects(() => admitProspectingRunToQueue(seed.database, input(seed), entry.port), rejected, entry.name);
    assert.deepEqual(await runState(seed), { execution_state: "blocked_missing_capability", revision: 1 }, entry.name);
    assert.deepEqual(await admissionCounts(seed), { commands: 0, audits: 0 }, entry.name);
  }
});

test("stale revisions, inactive configurations, and invalid source states fail closed", async () => {
  const stale = setup("stale");
  let staleInvoked = false;
  await assert.rejects(() => admitProspectingRunToQueue(stale.database, input(stale, { expectedRunRevision: 2 }), {
    async authorize() { staleInvoked = true; return { kind: "denied" }; },
  }), rejected);
  assert.equal(staleInvoked, false, "stale revision must be rejected before trusted authorization");
  assert.deepEqual(await runState(stale), { execution_state: "blocked_missing_capability", revision: 1 });

  const inactive = setup("inactive");
  inactive.database.db.prepare("UPDATE typed_configurations SET active=0 WHERE id=? AND workspace_id=?").run(inactive.configurationId, inactive.workspaceId);
  let inactiveInvoked = false;
  await assert.rejects(() => admitProspectingRunToQueue(inactive.database, input(inactive), {
    async authorize() { inactiveInvoked = true; return { kind: "denied" }; },
  }), rejected);
  assert.equal(inactiveInvoked, false, "inactive configuration must be rejected before trusted authorization");
  assert.deepEqual(await runState(inactive), { execution_state: "blocked_missing_capability", revision: 1 });

  const invalidState = setup("invalid-state");
  invalidState.database.db.prepare("UPDATE prospecting_runs SET execution_state='cancelled' WHERE id=? AND workspace_id=?").run(invalidState.runId, invalidState.workspaceId);
  let invalidStateInvoked = false;
  await assert.rejects(() => admitProspectingRunToQueue(invalidState.database, input(invalidState), {
    async authorize() { invalidStateInvoked = true; return { kind: "denied" }; },
  }), rejected);
  assert.equal(invalidStateInvoked, false, "invalid source state must be rejected before trusted authorization");
  assert.deepEqual(await runState(invalidState), { execution_state: "cancelled", revision: 1 });
  assert.deepEqual(await admissionCounts(invalidState), { commands: 0, audits: 0 });
});

test("competing admissions at one revision produce exactly one queued transition", async () => {
  const seed = setup("race");
  const settled = await Promise.allSettled([
    admitProspectingRunToQueue(seed.database, input(seed, { idempotencyKey: "race-a" }), trustedPort()),
    admitProspectingRunToQueue(seed.database, input(seed, { idempotencyKey: "race-b" }), trustedPort()),
  ]);
  assert.equal(settled.filter((entry) => entry.status === "fulfilled").length, 1);
  assert.equal(settled.filter((entry) => entry.status === "rejected" && rejected(entry.reason)).length, 1);
  assert.deepEqual(await runState(seed), { execution_state: "queued", revision: 2 });
  assert.deepEqual(await admissionCounts(seed), { commands: 1, audits: 1 });
});

class LocalD1 {
  constructor() { this.db = new DatabaseSync(":memory:"); }
  exec(sql) { this.db.exec(sql); }
  prepare(sql) { return new LocalPrepared(this.db, sql); }
  async batch(statements) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const results = statements.map((statement) => statement.execute());
      this.db.exec("COMMIT");
      return results;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
}

class LocalPrepared {
  constructor(database, sql, bindings = []) { this.database = database; this.sql = sql; this.bindings = bindings; }
  bind(...bindings) { return new LocalPrepared(this.database, this.sql, bindings); }
  async first() { const row = this.database.prepare(this.sql).get(...this.bindings); return row ? { ...row } : null; }
  execute() { const result = this.database.prepare(this.sql).run(...this.bindings); return { meta: { changes: Number(result.changes) }, results: [] }; }
}

function rejected(error) { return error?.code === "prospecting_run_admission_rejected"; }
