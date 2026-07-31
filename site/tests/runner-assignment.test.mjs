import assert from "node:assert/strict";
import test from "node:test";
import { applyMigrations, createD1Fixture } from "./helpers/d1.mjs";

const NOW = 1_780_000_000_000;
const DIGEST = "a".repeat(64);
const secret = new TextEncoder().encode("runner-assignment-test-secret-at-least-32-bytes");

async function setup() {
  const fixture = await createD1Fixture("runner-assignment");
  await applyMigrations(fixture.database);
  const commercial = await fixture.vite.ssrLoadModule(new URL("../domain/commercial-model.ts", import.meta.url).pathname);
  const principal = { subject: "runner-assignment-owner", legacySubject: "runner-assignment-owner-legacy", displayName: "Runner assignment owner" };
  const model = await commercial.initializeCommercialModel(fixture.database, principal, { idempotencyKey: "0198f400-0000-7000-8000-000000000001" });
  const profile = model.profiles.find((entry) => entry.name === "Operating");
  const workspace = await fixture.database.prepare("SELECT id FROM workspaces WHERE owner_subject = ? LIMIT 1").bind(principal.subject).first();
  await fixture.database.batch([
    fixture.database.prepare("INSERT INTO authority_commands (id, workspace_id, created_at, updated_at, revision, command_type, idempotency_key, operation_digest, expected_revision, subject_type, subject_id, status) VALUES ('runner-seed-command', ?, ?, ?, 1, 'test.seed', 'runner-seed-key', ?, 1, 'profile', ?, 'accepted')").bind(workspace.id, NOW, NOW, DIGEST, profile.id),
    fixture.database.prepare("INSERT INTO typed_configurations (id, workspace_id, created_at, updated_at, revision, company_id, owner_type, owner_id, kind, digest, manifest_json, active) VALUES ('runner-config', ?, ?, ?, 1, NULL, 'profile', ?, 'profile_effective', ?, ?, 1)").bind(workspace.id, NOW, NOW, profile.id, DIGEST, JSON.stringify({ sourcePolicy: { id: "pinned-source-policy", digest: "f".repeat(64), rules: { tier1Origins: ["example.invalid"], tier2Origins: [], materialSignalKinds: ["operating-signal"] } } })),
    fixture.database.prepare("INSERT INTO prospecting_schedules (id, workspace_id, created_at, updated_at, revision, profile_id, configuration_id, configuration_digest, schedule_key, timezone, intended_local_time, utc_offset_minutes, cadence, next_run_at, last_successful_watermark, active, execution_state, authority_command_id, operation_digest, idempotency_key) VALUES ('runner-schedule', ?, ?, ?, 1, ?, 'runner-config', ?, 'runner-schedule-key', 'America/Toronto', '06:00', -240, 'weekdays', ?, NULL, 1, 'blocked_missing_capability', 'runner-seed-command', ?, 'runner-schedule-key')").bind(workspace.id, NOW, NOW, profile.id, DIGEST, NOW, "b".repeat(64)),
    fixture.database.prepare("INSERT INTO prospecting_runs (id, workspace_id, created_at, updated_at, revision, profile_id, configuration_id, schedule_id, configuration_digest, trigger_kind, trigger_key, window_lower_exclusive, window_upper_inclusive, last_successful_watermark, successful_watermark, manifest_json, manifest_digest, execution_state, authority_command_id, operation_digest, idempotency_key, started_at, completed_at) VALUES ('runner-run', ?, ?, ?, 1, ?, 'runner-config', 'runner-schedule', ?, 'manual', 'runner-run-key', NULL, ?, NULL, NULL, '{}', ?, 'queued', 'runner-seed-command', ?, 'runner-run-key', ?, NULL)").bind(workspace.id, NOW, NOW, profile.id, DIGEST, NOW + 30_000, "c".repeat(64), "d".repeat(64), NOW),
  ]);
  return { fixture, workspaceId: workspace.id, profileId: profile.id };
}

function issueInput(seed, overrides = {}) {
  return { workspaceId: seed.workspaceId, runId: "runner-run", profileId: seed.profileId, configurationId: "runner-config", configurationDigest: DIGEST, audience: "prospecting-runner/v1", expiresAt: NOW + 60_000, instructionVersion: "runner-instructions/v1", toolConfigurationDigest: "e".repeat(64), quotas: { maxBytes: 20_000, maxFindings: 3, maxSources: 3 }, grantReference: "grant:synthetic", reason: "owner-visible provider/model selection", idempotencyKey: "0198f400-0000-7000-8000-000000000002", now: NOW, capabilitySecret: secret, ...overrides };
}

test("issue/revoke capabilities are hash-only, exact-run scoped, and replay-safe", async () => {
  const seed = await setup();
  try {
    const runner = await seed.fixture.vite.ssrLoadModule(new URL("../domain/runner-assignment.ts", import.meta.url).pathname);
    const issued = await runner.issueRunnerAssignment(seed.fixture.database, issueInput(seed));
    assert.match(issued.capability, /\./);
    const stored = await seed.fixture.database.prepare("SELECT token_hash, nonce_hash, status FROM runner_assignments WHERE id = ?").bind(issued.assignmentId).first();
    assert.match(stored.token_hash, /^[a-f0-9]{64}$/); assert.match(stored.nonce_hash, /^[a-f0-9]{64}$/); assert.equal(stored.status, "issued");
    assert.equal(JSON.stringify(stored).includes(issued.capability), false);
    const replay = await runner.issueRunnerAssignment(seed.fixture.database, issueInput(seed));
    assert.equal(replay.assignmentId, issued.assignmentId); assert.equal(replay.capability, null);
    await runner.revokeRunnerAssignment(seed.fixture.database, { workspaceId: seed.workspaceId, assignmentId: issued.assignmentId, reason: "owner revoked", idempotencyKey: "0198f400-0000-7000-8000-000000000003", now: NOW + 1 });
    await assert.rejects(() => runner.submitRunnerObservations(seed.fixture.database, { capability: issued.capability, idempotencyKey: "0198f400-0000-7000-8000-000000000004", now: NOW + 2, capabilitySecret: secret, payload: validPayload() }), /runner_assignment_rejected/i);
  } finally { await seed.fixture.dispose(); }
});

test("runner capability TTL is capped at five minutes and remains expiry-bound", async () => {
  const seed = await setup();
  try {
    const runner = await seed.fixture.vite.ssrLoadModule(new URL("../domain/runner-assignment.ts", import.meta.url).pathname);
    assert.equal(runner.RUNNER_CAPABILITY_MAX_TTL_MS, 5 * 60 * 1_000);
    const before = await runnerDurableState(seed);
    await assert.rejects(
      () => runner.issueRunnerAssignment(seed.fixture.database, issueInput(seed, {
        expiresAt: NOW + runner.RUNNER_CAPABILITY_MAX_TTL_MS + 1,
        idempotencyKey: "ttl-over-maximum",
      })),
      /runner_assignment_rejected/i,
    );
    assert.deepEqual(await runnerDurableState(seed), before, "max TTL + 1 is rejected before any durable mutation");

    const issued = await runner.issueRunnerAssignment(seed.fixture.database, issueInput(seed, {
      expiresAt: NOW + runner.RUNNER_CAPABILITY_MAX_TTL_MS,
      idempotencyKey: "ttl-exact-maximum",
    }));
    const body = JSON.parse(new TextDecoder().decode(fromBase64UrlTest(issued.capability.split(".")[0])));
    assert.equal(body.expiresAt, NOW + runner.RUNNER_CAPABILITY_MAX_TTL_MS);
    await assert.rejects(
      () => runner.submitRunnerObservations(seed.fixture.database, {
        capability: issued.capability,
        idempotencyKey: "ttl-at-expiry",
        now: body.expiresAt,
        capabilitySecret: secret,
        payload: validPayload(),
      }),
      /runner_assignment_rejected/i,
    );
    assert.equal(
      await seed.fixture.database.prepare("SELECT COUNT(*) AS count FROM runner_submissions").first().then((row) => Number(row.count)),
      0,
      "the exact expiry instant cannot append a submission",
    );
    assert.equal((await seed.fixture.database.prepare("SELECT status FROM runner_assignments WHERE id=?").bind(issued.assignmentId).first()).status, "issued");
  } finally { await seed.fixture.dispose(); }
});

test("runner submission is bounded append-only observation data and rejects authority fields", async () => {
  const seed = await setup();
  try {
    const runner = await seed.fixture.vite.ssrLoadModule(new URL("../domain/runner-assignment.ts", import.meta.url).pathname);
    const issued = await runner.issueRunnerAssignment(seed.fixture.database, issueInput(seed));
    await assert.rejects(
      () => runner.submitRunnerObservations(seed.fixture.database, {
        capability: issued.capability,
        idempotencyKey: "invalid-terminal-claim",
        now: NOW + 1,
        capabilitySecret: secret,
        payload: { ...validPayload(), status: "succeeded" },
      }),
      /runner_assignment_rejected/i,
    );
    assert.equal(await seed.fixture.database.prepare("SELECT COUNT(*) AS count FROM runner_submissions").first().then((row) => Number(row.count)), 0);
    const result = await runner.submitRunnerObservations(seed.fixture.database, { capability: issued.capability, idempotencyKey: "0198f400-0000-7000-8000-000000000005", now: NOW + 1, capabilitySecret: secret, payload: validPayload() });
    assert.ok(result.submissionId);
    const row = await seed.fixture.database.prepare("SELECT status, submission_json FROM runner_submissions WHERE id = ?").bind(result.submissionId).first();
    assert.equal(row.status, "received"); assert.match(row.submission_json, /runner-observations\/v1/);
    await assert.rejects(() => runner.submitRunnerObservations(seed.fixture.database, { capability: issued.capability, idempotencyKey: "0198f400-0000-7000-8000-000000000006", now: NOW + 2, capabilitySecret: secret, payload: { ...validPayload(), tier: 1 } }), /runner_assignment_rejected/i);
    assert.equal(await seed.fixture.database.prepare("SELECT COUNT(*) AS count FROM runner_submissions").first().then((row) => Number(row.count)), 1);
  } finally { await seed.fixture.dispose(); }
});

test("capability and ledger bind the immutable run window and reject out-of-window observations", async () => {
  const seed = await setup();
  try {
    const runner = await seed.fixture.vite.ssrLoadModule(new URL("../domain/runner-assignment.ts", import.meta.url).pathname);
    const issued = await runner.issueRunnerAssignment(seed.fixture.database, issueInput(seed));
    const body = JSON.parse(new TextDecoder().decode(fromBase64UrlTest(issued.capability.split(".")[0])));
    assert.equal(body.windowLowerExclusive, null);
    assert.equal(body.windowUpperInclusive, NOW + 30_000);
    const stored = await seed.fixture.database.prepare("SELECT quota_json FROM runner_assignments WHERE id=?").bind(issued.assignmentId).first();
    const ledger = JSON.parse(stored.quota_json);
    assert.equal(ledger.windowLowerExclusive, null);
    assert.equal(ledger.windowUpperInclusive, NOW + 30_000);
    await assert.rejects(
      () => runner.submitRunnerObservations(seed.fixture.database, { capability: issued.capability, idempotencyKey: "window-escape", now: NOW + 30_002, capabilitySecret: secret, payload: payloadAtTime(NOW + 30_001) }),
      /runner_assignment_rejected/i,
    );
    assert.equal((await seed.fixture.database.prepare("SELECT status FROM runner_assignments WHERE id=?").bind(issued.assignmentId).first()).status, "issued", "window rejection does not consume the nonce");
  } finally { await seed.fixture.dispose(); }
});

test("a submitted historical run may receive an explicit retry assignment but rejected work cannot reopen", async () => {
  const seed = await setup();
  try {
    const runner = await seed.fixture.vite.ssrLoadModule(new URL("../domain/runner-assignment.ts", import.meta.url).pathname);
    const first = await runner.issueRunnerAssignment(seed.fixture.database, issueInput(seed));
    await runner.submitRunnerObservations(seed.fixture.database, {
      capability: first.capability,
      idempotencyKey: "historical-first-submission",
      now: NOW + 1,
      capabilitySecret: secret,
      payload: { ...validPayload(), status: "partial" },
    });
    await seed.fixture.database.batch([
      seed.fixture.database.prepare("UPDATE prospecting_runs SET execution_state='submitted' WHERE id='runner-run'"),
      seed.fixture.database.prepare("UPDATE typed_configurations SET active=0 WHERE id='runner-config'"),
    ]);
    assert.equal(
      await seed.fixture.database.prepare("SELECT json_extract(submission_json,'$.status') status FROM runner_submissions WHERE run_id='runner-run'").first().then((row) => row.status),
      "partial",
      "the retry authority is an accepted immutable partial submission",
    );
    const retry = await runner.issueRunnerAssignment(seed.fixture.database, issueInput(seed, {
      idempotencyKey: "historical-retry-assignment",
      reason: "explicit retry of accepted historical partial submission",
      now: NOW + 2,
      expiresAt: NOW + 60_002,
    }));
    assert.match(retry.capability, /\./);
    assert.equal((await seed.fixture.database.prepare("SELECT execution_state FROM prospecting_runs WHERE id='runner-run'").first()).execution_state, "assigned");
    await seed.fixture.database.prepare("UPDATE prospecting_runs SET execution_state='rejected' WHERE id='runner-run'").run();
    await assert.rejects(
      () => runner.issueRunnerAssignment(seed.fixture.database, issueInput(seed, { idempotencyKey: "rejected-reopen", now: NOW + 3, expiresAt: NOW + 60_003 })),
      /runner_assignment_rejected/i,
    );
  } finally { await seed.fixture.dispose(); }
});

test("the D1 assignment trigger rejects forged submitted, rejected, and stale run authority", async () => {
  for (const scenario of [
    { name: "forged-submitted", runState: "submitted", active: 1 },
    { name: "terminal-rejected", runState: "rejected", active: 1 },
    { name: "stale-queued", runState: "queued", active: 0 },
  ]) {
    const seed = await setup();
    try {
      const runner = await seed.fixture.vite.ssrLoadModule(new URL("../domain/runner-assignment.ts", import.meta.url).pathname);
      await seed.fixture.database.batch([
        seed.fixture.database.prepare("UPDATE prospecting_runs SET execution_state=? WHERE id='runner-run'").bind(scenario.runState),
        seed.fixture.database.prepare("UPDATE typed_configurations SET active=? WHERE id='runner-config'").bind(scenario.active),
      ]);
      await assert.rejects(
        () => runner.issueRunnerAssignment(seed.fixture.database, issueInput(seed, {
          idempotencyKey: `service-${scenario.name}`,
        })),
        /runner_assignment_rejected/i,
        `${scenario.name} cannot pass the trusted service`,
      );
      await assert.rejects(
        () => seed.fixture.database.batch(directAssignmentBatch(seed, scenario.name)),
        /exact mutable run binding/i,
        `${scenario.name} cannot bypass the service with a direct insert`,
      );
      assert.equal(
        await seed.fixture.database.prepare("SELECT COUNT(*) AS count FROM runner_assignments").first().then((row) => Number(row.count)),
        0,
      );
      assert.equal(
        await seed.fixture.database.prepare("SELECT COUNT(*) AS count FROM authority_commands WHERE id=?").bind(`direct-command-${scenario.name}`).first().then((row) => Number(row.count)),
        0,
        "the rejected trigger batch rolls back its supporting authority rows",
      );
    } finally { await seed.fixture.dispose(); }
  }
});

test("capabilities fail neutrally on tamper, expiry, audience, exact provenance, and one-shot nonce races", async () => {
  const seed = await setup();
  try {
    const runner = await seed.fixture.vite.ssrLoadModule(new URL("../domain/runner-assignment.ts", import.meta.url).pathname);
    const issued = await runner.issueRunnerAssignment(seed.fixture.database, { ...issueInput(seed), expiresAt: NOW + 10, quotas: { maxBytes: 20_000, maxFindings: 2, maxSources: 2 } });
    for (const [capability, now, payload] of [[`${issued.capability}x`, NOW + 1, validPayload()], [issued.capability, NOW + 11, validPayload()], [issued.capability, NOW + 1, { ...validPayload(), provenance: { ...validPayload().provenance, model: "forged" } }]]) {
      await assert.rejects(() => runner.submitRunnerObservations(seed.fixture.database, { capability, idempotencyKey: `negative-${now}-${typeof payload === "object" ? JSON.stringify(payload).length : 0}`, now, capabilitySecret: secret, audience: "wrong-audience", payload }), /runner_assignment_rejected/i);
    }
    const live = await runner.issueRunnerAssignment(seed.fixture.database, { ...issueInput(seed), idempotencyKey: "0198f400-0000-7000-8000-000000000007", quotas: { maxBytes: 20_000, maxFindings: 2, maxSources: 2 } });
    const race = await Promise.allSettled([2, 3].map((index) => runner.submitRunnerObservations(seed.fixture.database, { capability: live.capability, idempotencyKey: `nonce-${index}`, now: NOW + index, capabilitySecret: secret, payload: payloadAt(index) })));
    assert.equal(race.filter((entry) => entry.status === "fulfilled").length, 1, "one distinct operation atomically consumes the nonce");
    const winnerIndex = race.findIndex((entry) => entry.status === "fulfilled");
    const winnerNumber = winnerIndex === 0 ? 2 : 3;
    assert.equal((await runner.submitRunnerObservations(seed.fixture.database, { capability: live.capability, idempotencyKey: `nonce-${winnerNumber}`, now: NOW + 4, capabilitySecret: secret, payload: payloadAt(winnerNumber) })).replayed, true, "same-key same-digest retry returns the original");
    assert.equal(await seed.fixture.database.prepare("SELECT COUNT(*) AS count FROM runner_submissions WHERE assignment_id = ?").bind(live.assignmentId).first().then((row) => Number(row.count)), 1);
    const nonceEvents = await seed.fixture.database.prepare("SELECT event_json FROM prospecting_run_events WHERE event_type='runner_nonce_consumed' AND run_id='runner-run'").all();
    assert.equal(nonceEvents.results.length, 1, "the losing race cannot write a nonce-consumed event");
    const nonceEvent = JSON.parse(nonceEvents.results[0].event_json);
    const submission = await seed.fixture.database.prepare("SELECT id,assignment_id,operation_digest FROM runner_submissions WHERE assignment_id=?").bind(live.assignmentId).first();
    assert.equal(nonceEvent.submissionId, submission.id); assert.equal(nonceEvent.assignmentId, submission.assignment_id);
    assert.equal((await seed.fixture.database.prepare("SELECT status FROM runner_assignments WHERE id=?").bind(live.assignmentId).first()).status, "consumed");
  } finally { await seed.fixture.dispose(); }
});

test("an earlier material arrival reconciles an immutable canonical successor chain", async () => {
  const seed = await setup();
  try {
    const runner = await seed.fixture.vite.ssrLoadModule(new URL("../domain/runner-assignment.ts", import.meta.url).pathname);
    const policy = await seed.fixture.vite.ssrLoadModule(new URL("../domain/source-policy.ts", import.meta.url).pathname);
    const first = await runner.issueRunnerAssignment(seed.fixture.database, issueInput(seed, { idempotencyKey: "material-first" }));
    const firstSubmission = await runner.submitRunnerObservations(seed.fixture.database, { capability: first.capability, idempotencyKey: "material-submit-first", now: NOW + 1, capabilitySecret: secret, payload: validPayload() });
    await policy.appendValidatedSignals(seed.fixture.database, { workspaceId: seed.workspaceId, submissionId: firstSubmission.submissionId, now: NOW + 2 });
    await insertSecondRun(seed, "runner-run-2", "runner-run-key-2");
    const second = await runner.issueRunnerAssignment(seed.fixture.database, issueInput(seed, { runId: "runner-run-2", idempotencyKey: "material-second" }));
    const secondSubmission = await runner.submitRunnerObservations(seed.fixture.database, { capability: second.capability, idempotencyKey: "material-submit-second", now: NOW + 11, capabilitySecret: secret, payload: payloadAtTime(NOW + 10) });
    await policy.appendValidatedSignals(seed.fixture.database, { workspaceId: seed.workspaceId, submissionId: secondSubmission.submissionId, now: NOW + 12 });
    await insertSecondRun(seed, "runner-run-3", "runner-run-key-3");
    const nonchronological = await runner.issueRunnerAssignment(seed.fixture.database, issueInput(seed, { runId: "runner-run-3", idempotencyKey: "material-third" }));
    const rejected = await runner.submitRunnerObservations(seed.fixture.database, { capability: nonchronological.capability, idempotencyKey: "material-submit-third", now: NOW + 13, capabilitySecret: secret, payload: payloadAtTime(NOW + 5) });
    await policy.appendValidatedSignals(seed.fixture.database, { workspaceId: seed.workspaceId, submissionId: rejected.submissionId, now: NOW + 14 });
    const chain = await policy.readCanonicalMaterialLineage(seed.fixture.database, { workspaceId: seed.workspaceId, profileId: seed.profileId, kind: "operating-signal", underlyingOriginIdentity: "example.invalid" });
    assert.deepEqual(chain.map((member) => member.occurred_at), [NOW, NOW + 5, NOW + 10]);
    const rows = await seed.fixture.database.prepare("SELECT ps.id,ps.signal_digest,ps.signal_json,pl.id lineage_id,pl.lineage_digest FROM prospecting_signals ps JOIN prospecting_source_lineage pl ON pl.id=ps.source_lineage_id WHERE ps.profile_id=? ORDER BY pl.occurred_at,ps.id").bind(seed.profileId).all();
    assert.equal(rows.results.length, 3); assert.ok(rows.results.every((row) => !JSON.parse(row.signal_json).successorOf), "signal facts remain immutable and relation-free");
    const relation = await canonicalRelation(seed, chain); assert.equal(relation.chain.length, 3); assert.deepEqual(relation.chain.map((member) => member.signalId), chain.map((member) => member.id));
  } finally { await seed.fixture.dispose(); }
});

test("lower timestamp winning first keeps one exact canonical chain across retry", async () => {
  const seed = await setup();
  try {
    const runner = await seed.fixture.vite.ssrLoadModule(new URL("../domain/runner-assignment.ts", import.meta.url).pathname);
    const policy = await seed.fixture.vite.ssrLoadModule(new URL("../domain/source-policy.ts", import.meta.url).pathname);
    const first = await runner.issueRunnerAssignment(seed.fixture.database, issueInput(seed, { idempotencyKey: "chain-root-assignment" }));
    const firstSubmission = await runner.submitRunnerObservations(seed.fixture.database, { capability: first.capability, idempotencyKey: "chain-root-submission", now: NOW + 1, capabilitySecret: secret, payload: validPayload() });
    await policy.appendValidatedSignals(seed.fixture.database, { workspaceId: seed.workspaceId, submissionId: firstSubmission.submissionId, now: NOW + 2 });
    await insertSecondRun(seed, "runner-run-2", "chain-run-2"); await insertSecondRun(seed, "runner-run-3", "chain-run-3");
    const [lower, higher] = await Promise.all([
      runner.issueRunnerAssignment(seed.fixture.database, issueInput(seed, { runId: "runner-run-2", idempotencyKey: "chain-lower-assignment" })),
      runner.issueRunnerAssignment(seed.fixture.database, issueInput(seed, { runId: "runner-run-3", idempotencyKey: "chain-higher-assignment" })),
    ]);
    const [lowerSubmission, higherSubmission] = await Promise.all([
      runner.submitRunnerObservations(seed.fixture.database, { capability: lower.capability, idempotencyKey: "chain-lower-submission", now: NOW + 3, capabilitySecret: secret, payload: payloadAtTime(NOW + 10) }),
      runner.submitRunnerObservations(seed.fixture.database, { capability: higher.capability, idempotencyKey: "chain-higher-submission", now: NOW + 3, capabilitySecret: secret, payload: payloadAtTime(NOW + 20) }),
    ]);
    await policy.appendValidatedSignals(seed.fixture.database, { workspaceId: seed.workspaceId, submissionId: lowerSubmission.submissionId, now: NOW + 30 });
    await policy.appendValidatedSignals(seed.fixture.database, { workspaceId: seed.workspaceId, submissionId: higherSubmission.submissionId, now: NOW + 30 });
    const chain = await policy.readCanonicalMaterialLineage(seed.fixture.database, { workspaceId: seed.workspaceId, profileId: seed.profileId, kind: "operating-signal", underlyingOriginIdentity: "example.invalid" });
    const before = await canonicalRelation(seed, chain); const counts = await lineageCounts(seed);
    await policy.appendValidatedSignals(seed.fixture.database, { workspaceId: seed.workspaceId, submissionId: lowerSubmission.submissionId, now: NOW + 31 });
    await policy.appendValidatedSignals(seed.fixture.database, { workspaceId: seed.workspaceId, submissionId: higherSubmission.submissionId, now: NOW + 31 });
    assert.deepEqual(await lineageCounts(seed), counts); assert.equal((await canonicalRelation(seed, await policy.readCanonicalMaterialLineage(seed.fixture.database, { workspaceId: seed.workspaceId, profileId: seed.profileId, kind: "operating-signal", underlyingOriginIdentity: "example.invalid" }))).chainDigest, before.chainDigest);
  } finally { await seed.fixture.dispose(); }
});

test("canonical material reader ignores forged snapshots and fails closed when the current facts have no exact snapshot", async () => {
  const seed = await setup();
  try {
    const runner = await seed.fixture.vite.ssrLoadModule(new URL("../domain/runner-assignment.ts", import.meta.url).pathname);
    const policy = await seed.fixture.vite.ssrLoadModule(new URL("../domain/source-policy.ts", import.meta.url).pathname);
    const first = await runner.issueRunnerAssignment(seed.fixture.database, issueInput(seed, { idempotencyKey: "reader-first-assignment" }));
    const firstSubmission = await runner.submitRunnerObservations(seed.fixture.database, { capability: first.capability, idempotencyKey: "reader-first-submission", now: NOW + 1, capabilitySecret: secret, payload: validPayload() });
    await policy.appendValidatedSignals(seed.fixture.database, { workspaceId: seed.workspaceId, submissionId: firstSubmission.submissionId, now: NOW + 2 });
    await insertSecondRun(seed, "runner-run-2", "reader-second-run");
    const second = await runner.issueRunnerAssignment(seed.fixture.database, issueInput(seed, { runId: "runner-run-2", idempotencyKey: "reader-second-assignment" }));
    const secondSubmission = await runner.submitRunnerObservations(seed.fixture.database, { capability: second.capability, idempotencyKey: "reader-second-submission", now: NOW + 3, capabilitySecret: secret, payload: payloadAtTime(NOW + 10) });
    await policy.appendValidatedSignals(seed.fixture.database, { workspaceId: seed.workspaceId, submissionId: secondSubmission.submissionId, now: NOW + 4 });
    const input = { workspaceId: seed.workspaceId, profileId: seed.profileId, kind: "operating-signal", underlyingOriginIdentity: "example.invalid" };
    const chain = await policy.readCanonicalMaterialLineage(seed.fixture.database, input);
    const base = await canonicalRelationRow(seed, chain);
    const relation = JSON.parse(base.lineage_json);
    const forged = [
      ["cross-scope", { ...relation, profileId: "forged-profile" }],
      ["members", { ...relation, chain: relation.chain.slice(1) }],
      ["duplicate-member", { ...relation, chain: [...relation.chain, relation.chain[0]] }],
      ["adjacency", { ...relation, immediateSuccessors: [] }],
      ["digest", { ...relation, chainDigest: "0".repeat(64) }],
      ["malformed", "{"],
    ];
    for (const [label, snapshot] of forged) await insertForgedSnapshot(seed, base, String(label), snapshot, NOW + 20);
    assert.deepEqual((await policy.readCanonicalMaterialLineage(seed.fixture.database, input)).map((member) => member.id), chain.map((member) => member.id), "forged duplicate snapshots cannot replace an exact canonical snapshot");
    const rawLineageJson = canonicalTest({ schema: "prospecting-source-lineage/v3", observationFingerprint: "9".repeat(64) });
    const rawLineageDigest = await digestTest(rawLineageJson), rawSignalJson = canonicalTest({ schema: "prospecting-signal/v3", material: true }), rawSignalDigest = await digestTest(rawSignalJson);
    await seed.fixture.database.batch([
      seed.fixture.database.prepare("INSERT INTO prospecting_source_lineage (id,workspace_id,run_id,submission_id,source_id,source_url,publisher_identity,underlying_origin_identity,independence_group,source_tier,published_at,occurred_at,retrieved_at,excerpt,lineage_json,lineage_digest,created_at) VALUES ('reader-stale-lineage',?,?,?,NULL,'https://example.invalid/stale','example.invalid','example.invalid','origin:example.invalid',1,NULL,?,?, 'stale',?,?,?)").bind(seed.workspaceId, "runner-run-2", secondSubmission.submissionId, NOW + 20, NOW + 20, rawLineageJson, rawLineageDigest, NOW + 21),
      seed.fixture.database.prepare("INSERT INTO prospecting_signals (id,workspace_id,run_id,submission_id,source_lineage_id,profile_id,signal_kind,signal_json,signal_digest,material,created_at) VALUES ('reader-stale-signal',?,?,?,'reader-stale-lineage',?,'operating-signal',?,?,1,?)").bind(seed.workspaceId, "runner-run-2", secondSubmission.submissionId, seed.profileId, rawSignalJson, rawSignalDigest, NOW + 21),
    ]);
    await assert.rejects(() => policy.readCanonicalMaterialLineage(seed.fixture.database, input), /source_policy_rejected/i, "a stale snapshot cannot authorize changed material facts");
  } finally { await seed.fixture.dispose(); }
});

test("trusted signal projection loads pinned policy and preserves append-only lineage", async () => {
  const seed = await setup();
  try {
    const runner = await seed.fixture.vite.ssrLoadModule(new URL("../domain/runner-assignment.ts", import.meta.url).pathname);
    const policy = await seed.fixture.vite.ssrLoadModule(new URL("../domain/source-policy.ts", import.meta.url).pathname);
    const issued = await runner.issueRunnerAssignment(seed.fixture.database, issueInput(seed));
    const submission = await runner.submitRunnerObservations(seed.fixture.database, { capability: issued.capability, idempotencyKey: "projection-1", now: NOW + 1, capabilitySecret: secret, payload: validPayload() });
    const signals = await policy.appendValidatedSignals(seed.fixture.database, { workspaceId: seed.workspaceId, submissionId: submission.submissionId, now: NOW + 2, policy: { tier1Origins: [], tier2Origins: [], materialSignalKinds: [] } });
    assert.equal(signals[0].tier, 1, "caller supplied policy is ignored");
    const saved = await seed.fixture.database.prepare("SELECT ps.signal_json, pl.lineage_json FROM prospecting_signals ps JOIN prospecting_source_lineage pl ON pl.id = ps.source_lineage_id WHERE ps.submission_id = ?").bind(submission.submissionId).first();
    assert.match(saved.signal_json, /canonical_append_only_relation/); assert.match(saved.lineage_json, /assignmentId/);
    await policy.appendValidatedSignals(seed.fixture.database, { workspaceId: seed.workspaceId, submissionId: submission.submissionId, now: NOW + 3 });
  } finally { await seed.fixture.dispose(); }
});

test("source policy assigns trusted tiers, independence, recency, and leaves retrieval disabled", async () => {
  const fixture = await createD1Fixture("source-policy");
  try {
    const policy = await fixture.vite.ssrLoadModule(new URL("../domain/source-policy.ts", import.meta.url).pathname);
    const retrieval = await fixture.vite.ssrLoadModule(new URL("../domain/ports/retrieval.ts", import.meta.url).pathname);
    const trusted = { tier1Origins: ["example.com"], tier2Origins: ["trusted.invalid"], materialSignalKinds: ["operating-signal"] };
    const current = await policy.validateSourceObservation(trusted, { url: "https://news.example.com/path#fragment", retrievedAt: NOW, observedAt: NOW, excerpt: "<b>untrusted</b>", kind: "operating-signal" }, NOW);
    assert.equal(current.tier, 1); assert.equal(current.independenceGroup, "origin:example.com"); assert.match(current.excerpt, /&lt;b&gt;/);
    const stale = await policy.validateSourceObservation(trusted, { url: "https://repost.example.com/again", retrievedAt: NOW, observedAt: NOW - 31 * 24 * 60 * 60 * 1_000, excerpt: "stale", kind: "operating-signal" }, NOW);
    assert.equal(stale.independenceGroup, current.independenceGroup); assert.equal(stale.recency, "account_context_reconfirmation_required");
    const uk = await policy.validateSourceObservation({ tier1Origins: ["bbc.co.uk"], tier2Origins: [], materialSignalKinds: [] }, { url: "https://news.bbc.co.uk/a", retrievedAt: NOW, observedAt: NOW, excerpt: "uk", kind: "signal" }, NOW);
    const evil = await policy.validateSourceObservation({ tier1Origins: ["bbc.co.uk"], tier2Origins: [], materialSignalKinds: [] }, { url: "https://evil.co.uk/a", retrievedAt: NOW, observedAt: NOW, excerpt: "evil", kind: "signal" }, NOW);
    assert.equal(uk.tier, 1); assert.equal(evil.tier, 3, "unrelated co.uk origins cannot borrow an allowlist tier");
    await assert.rejects(() => policy.validateSourceObservation({ tier1Origins: ["example.za"], tier2Origins: [], materialSignalKinds: [] }, { url: "https://evil.example.za/a", retrievedAt: NOW, observedAt: NOW, excerpt: "ambiguous", kind: "signal" }, NOW), /source_policy_rejected/i);
    assert.deepEqual(policy.sourceWindow(NOW, NOW + 1), { lowerExclusive: NOW - 24 * 60 * 60 * 1_000, upperInclusive: NOW + 1 });
    await assert.rejects(() => retrieval.createRejectOnlyRetrievalPort().retrieve({ url: "https://example.invalid", expectedMimeTypes: ["text/plain"], maximumBytes: 1, maximumRedirects: 0, timeoutMs: 1 }), /unavailable/i);
  } finally { await fixture.dispose(); }
});

function validPayload() { return { status: "complete", findings: [{ kind: "operating-signal", sourceUrl: "https://example.invalid/source", observedAt: NOW, excerpt: "Bounded synthetic observation" }], sources: [{ url: "https://example.invalid/source", retrievedAt: NOW, excerpt: "Bounded source excerpt", publisher: "Synthetic publisher" }], provenance: { provider: "runner-provider", model: "runner-model", instructionVersion: "runner-instructions/v1", toolConfigurationDigest: "e".repeat(64), tools: [], transformations: [] } }; }
function payloadAt(index) { const payload = validPayload(); payload.findings[0].sourceUrl = `https://example.invalid/source-${index}`; payload.findings[0].observedAt += index; payload.sources[0].url = payload.findings[0].sourceUrl; return payload; }
function payloadAtTime(observedAt) { const payload = validPayload(); payload.findings[0].observedAt = observedAt; payload.sources[0].retrievedAt = observedAt; return payload; }
async function runnerDurableState(seed) {
  return seed.fixture.database.prepare(`
    SELECT
      (SELECT COUNT(*) FROM runner_assignments) assignments,
      (SELECT COUNT(*) FROM authority_commands WHERE command_type='runner.assignment.issue') commands,
      (SELECT COUNT(*) FROM audit_events WHERE action='runner.assignment.issued') audits,
      execution_state run_state,
      revision run_revision
    FROM prospecting_runs WHERE id='runner-run'
  `).first();
}
function directAssignmentBatch(seed, label) {
  const commandId = `direct-command-${label}`;
  const auditId = `direct-audit-${label}`;
  const assignmentId = `direct-assignment-${label}`;
  return [
    seed.fixture.database.prepare("INSERT INTO authority_commands (id,workspace_id,created_at,updated_at,revision,command_type,idempotency_key,operation_digest,expected_revision,subject_type,subject_id,status) VALUES (?,?,?,?,1,'runner.assignment.issue',?,?,1,'prospecting_run','runner-run','accepted')").bind(commandId, seed.workspaceId, NOW, NOW, `direct-key-${label}`, "4".repeat(64)),
    seed.fixture.database.prepare("INSERT INTO audit_events (id,workspace_id,actor_type,actor_id,action,subject_type,subject_id,detail_json,created_at) VALUES (?,?,'system','direct-trigger-test','runner.assignment.issued','runner_assignment',?,'{}',?)").bind(auditId, seed.workspaceId, assignmentId, NOW),
    seed.fixture.database.prepare("INSERT INTO runner_assignments (id,workspace_id,created_at,updated_at,revision,run_id,profile_id,configuration_id,configuration_digest,audience,token_hash,nonce_hash,instruction_version,tool_configuration_digest,quota_json,quota_digest,expires_at,status,authority_command_id,audit_event_id) VALUES (?,?,?,?,1,'runner-run',?,'runner-config',?,'prospecting-runner/v1',?,?,'runner-instructions/v1',?,'{}',?,?,'issued',?,?)").bind(assignmentId, seed.workspaceId, NOW, NOW, seed.profileId, DIGEST, "5".repeat(64), "6".repeat(64), "7".repeat(64), "8".repeat(64), NOW + 60_000, commandId, auditId),
  ];
}
async function canonicalRelation(seed, chain) { const rows = await seed.fixture.database.prepare("SELECT lineage_json FROM prospecting_source_lineage WHERE workspace_id=? AND json_extract(lineage_json,'$.schema')='prospecting-source-lineage-chain/v1'").bind(seed.workspaceId).all(); const expected = chain.map((member) => member.id); const relation = rows.results.map((row) => JSON.parse(row.lineage_json)).find((candidate) => candidate.chain.map((member) => member.signalId).join(",") === expected.join(",")); assert.ok(relation, "an exact canonical relation must cover every material fact"); return relation; }
async function canonicalRelationRow(seed, chain) { const rows = await seed.fixture.database.prepare("SELECT * FROM prospecting_source_lineage WHERE workspace_id=? AND json_extract(lineage_json,'$.schema')='prospecting-source-lineage-chain/v1'").bind(seed.workspaceId).all(); const expected = chain.map((member) => member.id).join(","); const row = rows.results.find((candidate) => JSON.parse(candidate.lineage_json).chain.map((member) => member.signalId).join(",") === expected); assert.ok(row, "an exact canonical relation row must exist"); return row; }
async function insertForgedSnapshot(seed, base, label, snapshot, createdAt) { const lineageJson = typeof snapshot === "string" ? snapshot : canonicalTest(snapshot); const lineageDigest = typeof snapshot === "string" ? "b".repeat(64) : await digestTest(lineageJson); await seed.fixture.database.prepare("INSERT INTO prospecting_source_lineage (id,workspace_id,run_id,submission_id,source_id,source_url,publisher_identity,underlying_origin_identity,independence_group,source_tier,published_at,occurred_at,retrieved_at,excerpt,lineage_json,lineage_digest,created_at) VALUES (?,?,?,?,NULL,?,?,?,?,?,NULL,?,?,?,?,?,?)").bind(`forged-${label}`, seed.workspaceId, base.run_id, base.submission_id, base.source_url, base.publisher_identity, base.underlying_origin_identity, base.independence_group, base.source_tier, base.occurred_at, base.retrieved_at, base.excerpt, lineageJson, lineageDigest, createdAt).run(); }
function canonicalTest(value) { if (Array.isArray(value)) return `[${value.map(canonicalTest).join(",")}]`; if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalTest(value[key])}`).join(",")}}`; return JSON.stringify(value); }
async function digestTest(value) { const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)); return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join(""); }
async function lineageCounts(seed) { return (await seed.fixture.database.prepare("SELECT (SELECT COUNT(*) FROM prospecting_signals WHERE profile_id=?) signals,(SELECT COUNT(*) FROM prospecting_source_lineage WHERE workspace_id=? AND json_extract(lineage_json,'$.schema')='prospecting-source-lineage-chain/v1') relations").bind(seed.profileId, seed.workspaceId).first()); }
async function insertSecondRun(seed, id, triggerKey) { const operationDigest = id.endsWith("2") ? "e".repeat(64) : "f".repeat(64); await seed.fixture.database.prepare("INSERT INTO prospecting_runs (id,workspace_id,created_at,updated_at,revision,profile_id,configuration_id,schedule_id,configuration_digest,trigger_kind,trigger_key,window_lower_exclusive,window_upper_inclusive,last_successful_watermark,successful_watermark,manifest_json,manifest_digest,execution_state,authority_command_id,operation_digest,idempotency_key,started_at,completed_at) VALUES (?,?,?, ?,1,?,'runner-config','runner-schedule',?,'manual',?,NULL,?,NULL,NULL,'{}',?,'queued','runner-seed-command',?,?,?,NULL)").bind(id,seed.workspaceId,NOW,NOW,seed.profileId,DIGEST,triggerKey,NOW + 30_000,"c".repeat(64),operationDigest,triggerKey,NOW).run(); }
function fromBase64UrlTest(value) { const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4); return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0)); }
