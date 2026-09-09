import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { applyMigrations, createD1Fixture, PHASE4_PERSISTENCE_TABLES } from "./helpers/d1.mjs";

const NOW = 1_780_000_000_000;
const DIGEST = "a".repeat(64);
const SECRET = "runner-runtime-test-secret-material-at-least-32-bytes";

async function setup(label) {
  const fixture = await createD1Fixture(label);
  await applyMigrations(fixture.database);
  const commercial = await fixture.vite.ssrLoadModule(new URL("../domain/commercial-model.ts", import.meta.url).pathname);
  const principal = { subject: `${label}-owner`, legacySubject: `${label}-legacy`, displayName: "Runner runtime owner" };
  const model = await commercial.initializeCommercialModel(fixture.database, principal, { idempotencyKey: "0198f400-0000-7000-8000-000000000101" });
  const profile = model.profiles.find((entry) => entry.name === "Operating");
  const workspace = await fixture.database.prepare("SELECT id FROM workspaces WHERE owner_subject=?").bind(principal.subject).first();
  await fixture.database.batch([
    fixture.database.prepare("INSERT INTO authority_commands (id,workspace_id,created_at,updated_at,revision,command_type,idempotency_key,operation_digest,expected_revision,subject_type,subject_id,status) VALUES (?,?,?,?,1,'test.seed',?,?,1,'profile',?,'accepted')").bind(`${label}-command`, workspace.id, NOW, NOW, `${label}-seed`, DIGEST, profile.id),
    fixture.database.prepare("INSERT INTO typed_configurations (id,workspace_id,created_at,updated_at,revision,company_id,owner_type,owner_id,kind,digest,manifest_json,active) VALUES (?,?,?,?,1,NULL,'profile',?,'profile_effective',?,?,1)").bind(`${label}-config`, workspace.id, NOW, NOW, profile.id, DIGEST, JSON.stringify({ sourcePolicy: { id: "pinned-source-policy", digest: "f".repeat(64), rules: { tier1Origins: ["example.invalid"], tier2Origins: [], materialSignalKinds: ["operating-signal"] } } })),
    fixture.database.prepare("INSERT INTO prospecting_schedules (id,workspace_id,created_at,updated_at,revision,profile_id,configuration_id,configuration_digest,schedule_key,timezone,intended_local_time,utc_offset_minutes,cadence,next_run_at,last_successful_watermark,active,execution_state,authority_command_id,operation_digest,idempotency_key) VALUES (?,?,?,?,1,?,?,?,?,'America/Toronto','06:00',-240,'weekdays',?,NULL,1,'blocked_missing_capability',?,?,?)").bind(`${label}-schedule`, workspace.id, NOW, NOW, profile.id, `${label}-config`, DIGEST, `${label}-schedule-key`, NOW, `${label}-command`, "b".repeat(64), `${label}-schedule-idem`),
    fixture.database.prepare("INSERT INTO prospecting_runs (id,workspace_id,created_at,updated_at,revision,profile_id,configuration_id,schedule_id,configuration_digest,trigger_kind,trigger_key,window_lower_exclusive,window_upper_inclusive,last_successful_watermark,successful_watermark,manifest_json,manifest_digest,execution_state,authority_command_id,operation_digest,idempotency_key,started_at,completed_at) VALUES (?,?,?,?,1,?,?,?,?, 'manual',?,NULL,?,NULL,NULL,'{}',?,'queued',?,?,?,?,NULL)").bind(`${label}-run`, workspace.id, NOW, NOW, profile.id, `${label}-config`, `${label}-schedule`, DIGEST, `${label}-run-key`, NOW + 30_000, "c".repeat(64), `${label}-command`, "d".repeat(64), `${label}-run-idem`, NOW),
  ]);
  return { fixture, workspaceId: workspace.id, profileId: profile.id, runId: `${label}-run`, configurationId: `${label}-config` };
}

function assignment(seed) {
  return { workspaceId: seed.workspaceId, runId: seed.runId, profileId: seed.profileId, configurationId: seed.configurationId, configurationDigest: DIGEST, audience: "prospecting-runner/v1", expiresAt: NOW + 60_000, instructionVersion: "runner-instructions/v1", toolConfigurationDigest: "e".repeat(64), quotas: { maxBytes: 20_000, maxFindings: 3, maxSources: 3 }, grantReference: "synthetic", reason: "focused runtime composition test", idempotencyKey: `${seed.runId}-assignment`, now: NOW };
}

function submission(capability) {
  return new Request("https://prospector.test/api/prospecting/runner", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      capability,
      idempotencyKey: "runner-runtime-submission",
      payload: {
        status: "partial",
        findings: [],
        sources: [],
        provenance: {
          provider: "runner-provider",
          model: "runner-model",
          instructionVersion: "runner-instructions/v1",
          toolConfigurationDigest: "e".repeat(64),
          tools: [],
          transformations: [],
        },
      },
    }),
  });
}

async function durableState(database) {
  const counts = {};
  for (const name of ["authority_commands", "audit_events", ...PHASE4_PERSISTENCE_TABLES]) {
    counts[name] = Number((await database.prepare(`SELECT COUNT(*) count FROM ${name}`).first()).count);
  }
  const assignmentState = await database.prepare("SELECT status,revision FROM runner_assignments ORDER BY id").all();
  const runState = await database.prepare("SELECT execution_state,revision FROM prospecting_runs ORDER BY id").all();
  return { counts, assignmentState: assignmentState.results, runState: runState.results };
}

test("runner runtime is default-off and its two capabilities are independently enabled", async () => {
  const seed = await setup("runner-runtime-gates");
  try {
    const runtime = await seed.fixture.vite.ssrLoadModule(new URL("../domain/runner-runtime.ts", import.meta.url).pathname);
    const databaseOnly = { DB: seed.fixture.database };
    assert.equal(runtime.composeRunnerIngress(databaseOnly), undefined);
    assert.equal(runtime.composeRunnerIngress({ ...databaseOnly, PROSPECTOR_RUNNER_INGRESS_ENABLED: "true", RUNNER_CAPABILITY_SECRET: SECRET }), undefined, "loose truthy flags stay closed");
    assert.equal(runtime.composeRunnerIngress({ ...databaseOnly, PROSPECTOR_RUNNER_INGRESS_ENABLED: "1", RUNNER_CAPABILITY_SECRET: "short" }), undefined);
    await assert.rejects(() => runtime.issueRuntimeRunnerAssignment(databaseOnly, assignment(seed)), /runner_runtime_unavailable/);
    await assert.rejects(() => runtime.issueRuntimeRunnerAssignment({ ...databaseOnly, PROSPECTOR_RUNNER_INGRESS_ENABLED: "1", RUNNER_CAPABILITY_SECRET: SECRET }, assignment(seed)), /runner_runtime_unavailable/, "ingress does not enable issuance");

    const issued = await runtime.issueRuntimeRunnerAssignment({ ...databaseOnly, PROSPECTOR_RUNNER_ASSIGNMENT_ENABLED: "1", RUNNER_CAPABILITY_SECRET: SECRET }, assignment(seed));
    assert.match(issued.capability, /\./);
    assert.equal(runtime.composeRunnerIngress({ ...databaseOnly, PROSPECTOR_RUNNER_ASSIGNMENT_ENABLED: "1", RUNNER_CAPABILITY_SECRET: SECRET }), undefined, "issuance does not enable ingress");
    const ingress = runtime.composeRunnerIngress({ ...databaseOnly, PROSPECTOR_RUNNER_INGRESS_ENABLED: "1", RUNNER_CAPABILITY_SECRET: SECRET });
    assert.equal(ingress.runnerIngressEnabled, true);
    assert.equal(ingress.runnerCapabilitySecret.byteLength >= 32, true);
    assert.equal(Object.hasOwn(ingress, "PROSPECTOR_RUNNER_ASSIGNMENT_ENABLED"), false);
  } finally { await seed.fixture.dispose(); }
});

test("application route composes only the default-off binding boundary", async () => {
  const root = resolve(import.meta.dirname, "..");
  const route = await readFile(resolve(root, "app/api/prospecting/runner/route.ts"), "utf8");
  const runtime = await readFile(resolve(root, "domain/runner-runtime.ts"), "utf8");
  assert.match(route, /handleRunnerRuntimeRequest/);
  assert.doesNotMatch(route, /runnerIngressEnabled:\s*true/);
  assert.doesNotMatch(route, /issueRuntimeRunnerAssignment/);
  for (const forbidden of [/\bfetch\s*\(/, /process\.env/, /import\.meta\.env/, /GMAIL/i, /telephony/i]) assert.doesNotMatch(runtime, forbidden);
});

test("route binding failures are neutral and perform zero D1 writes", async () => {
  const seed = await setup("runner-runtime-route-denials");
  try {
    const runtime = await seed.fixture.vite.ssrLoadModule(new URL("../domain/runner-runtime.ts", import.meta.url).pathname);
    const baseline = await durableState(seed.fixture.database);
    const cases = [
      {},
      { DB: seed.fixture.database },
      { DB: seed.fixture.database, PROSPECTOR_RUNNER_INGRESS_ENABLED: "" },
      { DB: seed.fixture.database, PROSPECTOR_RUNNER_INGRESS_ENABLED: "0", RUNNER_CAPABILITY_SECRET: SECRET },
      { DB: seed.fixture.database, PROSPECTOR_RUNNER_INGRESS_ENABLED: "false", RUNNER_CAPABILITY_SECRET: SECRET },
      { DB: seed.fixture.database, PROSPECTOR_RUNNER_INGRESS_ENABLED: "true", RUNNER_CAPABILITY_SECRET: SECRET },
      { DB: seed.fixture.database, PROSPECTOR_RUNNER_INGRESS_ENABLED: " 1 ", RUNNER_CAPABILITY_SECRET: SECRET },
      { DB: seed.fixture.database, PROSPECTOR_RUNNER_INGRESS_ENABLED: "1" },
      { DB: seed.fixture.database, PROSPECTOR_RUNNER_INGRESS_ENABLED: "1", RUNNER_CAPABILITY_SECRET: "short" },
    ];
    for (const bindings of cases) {
      const response = await runtime.handleRunnerRuntimeRequest(submission("synthetic.invalid"), bindings);
      assert.equal(response.status, 404);
      assert.deepEqual(await response.json(), { error: "runner_ingress_unavailable" });
      assert.deepEqual(await durableState(seed.fixture.database), baseline);
    }
  } finally { await seed.fixture.dispose(); }
});

test("exact route bindings admit one bounded submission and replay without new writes", async () => {
  const seed = await setup("runner-runtime-route-enabled");
  try {
    const runtime = await seed.fixture.vite.ssrLoadModule(new URL("../domain/runner-runtime.ts", import.meta.url).pathname);
    const issued = await runtime.issueRuntimeRunnerAssignment({
      DB: seed.fixture.database,
      PROSPECTOR_RUNNER_ASSIGNMENT_ENABLED: "1",
      RUNNER_CAPABILITY_SECRET: SECRET,
    }, assignment(seed));
    const before = await durableState(seed.fixture.database);
    const bindings = {
      DB: seed.fixture.database,
      PROSPECTOR_RUNNER_INGRESS_ENABLED: "1",
      RUNNER_CAPABILITY_SECRET: SECRET,
    };
    const accepted = await runtime.handleRunnerRuntimeRequest(submission(issued.capability), bindings, () => NOW + 1);
    assert.equal(accepted.status, 200);
    const acceptedBody = await accepted.json();
    assert.equal(acceptedBody.replayed, false);
    assert.equal(typeof acceptedBody.submissionId, "string");
    const after = await durableState(seed.fixture.database);
    const changedCounts = Object.keys(after.counts).filter((name) => after.counts[name] !== before.counts[name]);
    assert.deepEqual(changedCounts, ["prospecting_run_events", "runner_submissions"]);
    assert.equal(after.counts.runner_submissions, before.counts.runner_submissions + 1);
    assert.equal(after.counts.prospecting_run_events, before.counts.prospecting_run_events + 3);
    assert.deepEqual(after.assignmentState, [{ status: "consumed", revision: 2 }]);
    assert.deepEqual(after.runState, [{ execution_state: "submitted", revision: 4 }]);

    const replay = await runtime.handleRunnerRuntimeRequest(submission(issued.capability), bindings, () => NOW + 2);
    assert.equal(replay.status, 200);
    assert.deepEqual(await replay.json(), { submissionId: acceptedBody.submissionId, replayed: true });
    assert.deepEqual(await durableState(seed.fixture.database), after);
  } finally { await seed.fixture.dispose(); }
});
