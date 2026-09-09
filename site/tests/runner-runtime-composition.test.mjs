import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { applyMigrations, createD1Fixture } from "./helpers/d1.mjs";

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
    fixture.database.prepare("INSERT INTO typed_configurations (id,workspace_id,created_at,updated_at,revision,company_id,owner_type,owner_id,kind,digest,manifest_json,active) VALUES (?,?,?,?,1,NULL,'profile',?,'profile_effective',?,'{}',1)").bind(`${label}-config`, workspace.id, NOW, NOW, profile.id, DIGEST),
    fixture.database.prepare("INSERT INTO prospecting_schedules (id,workspace_id,created_at,updated_at,revision,profile_id,configuration_id,configuration_digest,schedule_key,timezone,intended_local_time,utc_offset_minutes,cadence,next_run_at,last_successful_watermark,active,execution_state,authority_command_id,operation_digest,idempotency_key) VALUES (?,?,?,?,1,?,?,?,?,'America/Toronto','06:00',-240,'weekdays',?,NULL,1,'blocked_missing_capability',?,?,?)").bind(`${label}-schedule`, workspace.id, NOW, NOW, profile.id, `${label}-config`, DIGEST, `${label}-schedule-key`, NOW, `${label}-command`, "b".repeat(64), `${label}-schedule-idem`),
    fixture.database.prepare("INSERT INTO prospecting_runs (id,workspace_id,created_at,updated_at,revision,profile_id,configuration_id,schedule_id,configuration_digest,trigger_kind,trigger_key,window_lower_exclusive,window_upper_inclusive,last_successful_watermark,successful_watermark,manifest_json,manifest_digest,execution_state,authority_command_id,operation_digest,idempotency_key,started_at,completed_at) VALUES (?,?,?,?,1,?,?,?,?, 'manual',?,NULL,?,NULL,NULL,'{}',?,'queued',?,?,?,?,NULL)").bind(`${label}-run`, workspace.id, NOW, NOW, profile.id, `${label}-config`, `${label}-schedule`, DIGEST, `${label}-run-key`, NOW + 30_000, "c".repeat(64), `${label}-command`, "d".repeat(64), `${label}-run-idem`, NOW),
  ]);
  return { fixture, workspaceId: workspace.id, profileId: profile.id, runId: `${label}-run`, configurationId: `${label}-config` };
}

function assignment(seed) {
  return { workspaceId: seed.workspaceId, runId: seed.runId, profileId: seed.profileId, configurationId: seed.configurationId, configurationDigest: DIGEST, audience: "prospecting-runner/v1", expiresAt: NOW + 60_000, instructionVersion: "runner-instructions/v1", toolConfigurationDigest: "e".repeat(64), quotas: { maxBytes: 20_000, maxFindings: 3, maxSources: 3 }, grantReference: "synthetic", reason: "focused runtime composition test", idempotencyKey: `${seed.runId}-assignment`, now: NOW };
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
  assert.match(route, /composeRunnerIngress/);
  assert.doesNotMatch(route, /runnerIngressEnabled:\s*true/);
  assert.doesNotMatch(route, /issueRuntimeRunnerAssignment/);
  for (const forbidden of [/\bfetch\s*\(/, /process\.env/, /import\.meta\.env/, /GMAIL/i, /telephony/i]) assert.doesNotMatch(runtime, forbidden);
});
