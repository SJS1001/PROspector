import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildExact0004MigrationApply } from "../scripts/phase2-exact-migration.mjs";
import {
  buildPreflightCommands,
  LOCAL_WRANGLER_PATH,
  parsePreflightArgs,
  runHostedPreflight,
  runPreflightCli,
} from "../scripts/phase2-hosted-preflight.mjs";

const TARGET = {
  project: "project-private-raw",
  database: "00000000-0000-0000-0000-000000000004",
  deployment: "deployment-private-raw",
  origin: "https://private-prospector.example.test",
};
const TARGET_BINDING_DIGEST = "cbcadaad7861118fa15919a10c2d00eb674bd4cde075bf184caf7e9d9acd7308";
const POST_PROBE_ADAPTER = "/outside/repo/owner-post-probe.mjs";
const OPTIONS = {
  mode: "post-migration",
  ...TARGET,
  baseline: "/outside/repo/baseline.json",
  postProbeAdapter: POST_PROBE_ADAPTER,
};
const INCIDENT_OPTIONS = {
  mode: "incident-provenance",
  ...TARGET,
  observedAt: "2026-08-25T12:34:56.789Z",
};
const INCIDENT_CLOCK = () => new Date(INCIDENT_OPTIONS.observedAt);
const PROTECTED_DIGEST = "190697270d72e64226736d3c99792a32669e6bfa40c18448cc35316a7665e875";
const CATEGORY_COUNTS = {
  answer_operation: 1,
  answer_proposal: 1,
  audit_detail: 1,
  confirmation_decision: 1,
  confirmation_operation: 1,
  knowledge_source: 1,
  knowledge_value: 1,
};
const OLD_FORBIDDEN_TABLE_STATE = {
  runner_connections: { present: false, count: null },
  runs: { present: false, count: null },
  signals: { present: false, count: null },
  candidates: { present: false, count: null },
  prospects: { present: true, count: 0 },
  contacts: { present: false, count: null },
  schedules: { present: false, count: null },
  approval_grants: { present: false, count: null },
  provider_grants: { present: false, count: null },
  provider_calls: { present: false, count: null },
  outreach_packages: { present: false, count: null },
  outreach_package_approvals: { present: false, count: null },
  message_versions: { present: false, count: null },
  message_approvals: { present: false, count: null },
  message_dispatches: { present: false, count: null },
  manual_calls: { present: false, count: null },
  export_jobs: { present: false, count: null },
  external_effects: { present: false, count: null },
  credential_records: { present: false, count: null },
  provider_credentials: { present: false, count: null },
  provider_secrets: { present: false, count: null },
  workspace_archives: { present: false, count: null },
  workspace_archive_objects: { present: false, count: null },
};
const BASELINE = {
  baselineVersion: 2,
  mode: "old-schema",
  targetBindingDigest: TARGET_BINDING_DIGEST,
  migrationIds: ["0000", "0001", "0002", "0003"],
  protectedDigest: PROTECTED_DIGEST,
  protectedCount: 7,
  protectedCategoryCounts: CATEGORY_COUNTS,
  workspaceCount: 1,
  boundHistorianCount: 1,
  legacyUnboundCount: 0,
  forbiddenTableState: OLD_FORBIDDEN_TABLE_STATE,
  foreignKeyViolations: 0,
};

function wranglerJson(results) {
  return JSON.stringify([{ success: true, results, meta: { served_by: "hidden-hosted-id" } }]);
}

function successfulOutputs() {
  return {
    migrations: [
      { migration_name: "0000_jittery_meteorite.sql", applied_at: "private-time-0" },
      { migration_name: "0001_true_spencer_smythe.sql", applied_at: "private-time-1" },
      { migration_name: "0002_eager_supreme_intelligence.sql", applied_at: "private-time-2" },
      { migration_name: "0003_acoustic_magik.sql", applied_at: "private-time-3" },
      { migration_name: "0004_consensus_knowledge.sql", applied_at: "private-time-4" },
    ],
    protectedAnswerOperation: [{ value: "answer-op" }],
    protectedAnswerProposal: [{ value: "proposal" }],
    protectedAuditDetail: [{ value: "audit" }],
    protectedConfirmationDecision: [{ value: "accept" }],
    protectedConfirmationOperation: [{ value: "confirm-op" }],
    protectedKnowledgeSource: [{ value: "source" }],
    protectedKnowledgeValue: [{ value: '{"score":1}' }],
    counts: [{
      workspace_count: 1,
      bound_historian_count: 1,
      legacy_unbound_count: 0,
      company_count: 1,
      workspace_company_count: 1,
      invalid_company_binding_count: 0,
      binding_count: 1,
      invalid_binding_count: 0,
      invalid_knowledge_lineage_count: 0,
      legacy_bound_count: 0,
      quarantine_count: 0,
      invalid_quarantine_count: 0,
      total_gate_count: 0,
      consensus_gate_count: 0,
      prospect_count: 0,
      contact_count: 0,
      csrf_token_count: 3,
      used_csrf_token_count: 0,
      unused_csrf_token_count: 3,
    }],
    foreignKeys: [],
    forbiddenTables: [{ name: "contacts" }, { name: "prospects" }],
  };
}

function fakeRunner(outputs = successfulOutputs(), csrfTokensConsumed = 1) {
  let collection = 0;
  return async ({ key }) => {
    if (key === "migrations") collection += 1;
    const current = structuredClone(outputs[key]);
    if (collection === 2 && key === "counts") {
      current[0].used_csrf_token_count += csrfTokensConsumed;
      current[0].unused_csrf_token_count -= csrfTokensConsumed;
    }
    return { stdout: wranglerJson(current), stderr: "warning with private@example.test" };
  };
}

function fakePostProbe(overrides = {}) {
  return async () => ({
    status: 503,
    code: "phase2_writes_not_activated",
    method: "POST",
    route: "/api/knowledge",
    origin: TARGET.origin,
    targetBindingDigest: TARGET_BINDING_DIGEST,
    ...overrides,
  });
}

function incidentOutputs(command) {
  if (command.key === "migrations") return [{ id: 5, migration_name: "0004_consensus_knowledge.sql", applied_at: "2026-08-25T12:30:00.000Z" }];
  if (command.key === "schema") return buildPreflightCommands(INCIDENT_OPTIONS).flatMap(({ key }) => {
    if (key.startsWith("tableXinfo:")) {
      const name = key.slice("tableXinfo:".length);
      return [{ type: "table", name, tbl_name: name, sql: `CREATE TABLE \`${name}\` (\`id\` text)` }];
    }
    if (key.startsWith("indexXinfo:")) {
      const name = key.slice("indexXinfo:".length);
      return [{ type: "index", name, tbl_name: "knowledge_versions", sql: `CREATE INDEX \`${name}\` ON \`knowledge_versions\` (\`id\`)` }];
    }
    return [];
  });
  if (command.key.startsWith("tableXinfo:")) return [{ cid: 0, name: "id", type: "TEXT", notnull: 1, dflt_value: null, pk: 1, hidden: 0 }];
  if (command.key.startsWith("foreignKeyList:")) return [];
  if (command.key.startsWith("indexList:")) return [];
  if (command.key.startsWith("indexXinfo:")) return [{ seqno: 0, cid: 0, name: "id", desc: 0, coll: "BINARY", key: 1 }];
  if (command.key === "foreignKeyCheck") return [];
  if (command.key.startsWith("forbiddenRows:")) return [{ row_count: 0 }];
  if (command.key === "counts") return [{
    workspace_count: 1, bound_historian_count: 1, legacy_unbound_count: 0, company_count: 1,
    workspace_company_count: 1, invalid_company_binding_count: 0, binding_count: 1, invalid_binding_count: 0,
    invalid_knowledge_lineage_count: 0, legacy_bound_count: 0, quarantine_count: 0,
    invalid_quarantine_count: 0, audit_count: 1, total_gate_count: 0, consensus_gate_count: 0,
    prospect_count: 0, contact_count: 0, forbidden_table_count: 0,
  }];
  return [];
}

function incidentRunner({ failKey = "", drift = false, malformedKey = "", reorder = false, auditCount, missingSchemaObject = "" } = {}) {
  let calls = 0;
  return async (command) => {
    calls += 1;
    if (command.key === failKey) throw new Error("private target and secret failure");
    const rows = incidentOutputs(command);
    if (command.key === malformedKey) return { stdout: wranglerJson([{ malformed: "private target" }]) };
    if (command.key === "schema" && missingSchemaObject) {
      const filtered = rows.filter(({ name }) => name !== missingSchemaObject);
      return { stdout: wranglerJson(filtered), stderr: "private child output" };
    }
    if (command.key === "counts" && Number.isSafeInteger(auditCount)) rows[0].audit_count = auditCount;
    if (reorder && calls > buildPreflightCommands(INCIDENT_OPTIONS).length && command.key === "schema") rows.reverse();
    if (drift && calls > buildPreflightCommands(INCIDENT_OPTIONS).length && command.key === "counts") rows[0].audit_count = 2;
    return { stdout: wranglerJson(rows), stderr: "private child output" };
  };
}

test("preflight builds only fixed Wrangler 4.116 d1 execute --json reads", () => {
  const options = parsePreflightArgs(["--mode", "post-migration", "--database", TARGET.database, "--project", TARGET.project, "--deployment", TARGET.deployment, "--origin", TARGET.origin, "--baseline", OPTIONS.baseline, "--post-probe-adapter", POST_PROBE_ADAPTER]);
  const commands = buildPreflightCommands(options);
  assert.deepEqual(commands.map(({ key }) => key), [
    "migrations", "protectedAnswerOperation", "protectedAnswerProposal", "protectedAuditDetail",
    "protectedConfirmationDecision", "protectedConfirmationOperation", "protectedKnowledgeSource",
    "protectedKnowledgeValue", "counts", "foreignKeys", "forbiddenTables",
  ]);
  for (const command of commands) {
    assert.deepEqual(command.args.slice(0, 2), ["d1", "execute"]);
    assert.equal(command.args[2], TARGET.database);
    assert.ok(command.args.includes("--remote"));
    assert.ok(command.args.includes("--json"));
    assert.ok(command.args.includes("--command"));
    const sql = command.args.at(-1);
    assert.match(sql, /^(SELECT|PRAGMA)/u);
    assert.doesNotMatch(sql, /\b(INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|REPLACE|ATTACH|DETACH|VACUUM)\b/iu);
  }
});

test("incident provenance requires immutable target binding and builds only fixed read-only metadata/count surfaces", () => {
  const parsed = parsePreflightArgs([
    "--mode", "incident-provenance", "--database", TARGET.database, "--project", TARGET.project,
    "--deployment", TARGET.deployment, "--origin", TARGET.origin, "--observed-at", INCIDENT_OPTIONS.observedAt,
  ]);
  assert.deepEqual(parsed, { ...INCIDENT_OPTIONS, baseline: "", postProbeAdapter: "", help: false });
  const commands = buildPreflightCommands(parsed);
  assert.ok(commands.length > 10);
  for (const command of commands) {
    assert.deepEqual(command.args.slice(0, 2), ["d1", "execute"]);
    assert.equal(command.args[2], TARGET.database);
    assert.ok(command.args.includes("--remote"));
    assert.ok(command.args.includes("--json"));
    const sql = command.args.at(-1);
    assert.match(sql, /^(SELECT|PRAGMA)/u);
    assert.doesNotMatch(sql, /\b(INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|REPLACE|ATTACH|DETACH|VACUUM)\b/iu);
    assert.doesNotMatch(sql, /\b(value_json|detail_json|excerpt|identity|secret|principal|cookie)\b/iu);
  }
  for (const args of [
    ["--mode", "incident-provenance", "--database", TARGET.database, "--project", TARGET.project, "--deployment", TARGET.deployment, "--origin", TARGET.origin],
    ["--mode", "incident-provenance", "--database", "not-an-immutable-id", "--project", TARGET.project, "--deployment", TARGET.deployment, "--origin", TARGET.origin, "--observed-at", INCIDENT_OPTIONS.observedAt],
    ["--mode", "incident-provenance", "--database", TARGET.database, "--project", TARGET.project, "--deployment", TARGET.deployment, "--origin", TARGET.origin, "--observed-at", "2026-08-25T12:34:56Z"],
    ["--mode", "incident-provenance", "--database", TARGET.database, "--project", TARGET.project, "--deployment", TARGET.deployment, "--origin", TARGET.origin, "--observed-at", INCIDENT_OPTIONS.observedAt, "--baseline", OPTIONS.baseline],
  ]) assert.throws(() => parsePreflightArgs(args));
  assert.match(LOCAL_WRANGLER_PATH, /node_modules\/\.bin\/wrangler$/u);
});

test("incident provenance takes two read-only collections and emits stable redacted partial evidence without a POST probe", async () => {
  const commands = buildPreflightCommands(INCIDENT_OPTIONS);
  let calls = 0;
  let probeCalls = 0;
  const runner = incidentRunner();
  const result = await runHostedPreflight({
    options: INCIDENT_OPTIONS,
    runner: async (command) => { calls += 1; return runner(command); },
    postProbe: async () => { probeCalls += 1; throw new Error("must not be called"); },
    clock: INCIDENT_CLOCK,
  });
  assert.equal(calls, commands.length * 2);
  assert.equal(probeCalls, 0);
  assert.equal(result.ok, false);
  assert.equal(result.status, "partial");
  assert.equal(result.code, "provider_evidence_external_required");
  assert.equal(result.observedAt, INCIDENT_OPTIONS.observedAt);
  assert.equal(result.classification, "partial/mixed/unknown");
  assert.match(result.targetBindingDigest, /^[a-f0-9]{64}$/u);
  assert.equal(result.classifiedSchemaFingerprintStatus, "external_evidence_required");
  assert.match(result.incidentEvidenceFingerprint, /^[a-f0-9]{64}$/u);
  assert.match(result.schemaDigest, /^[a-f0-9]{64}$/u);
  assert.match(result.evidenceDigest, /^[a-f0-9]{64}$/u);
  assert.deepEqual(result.collectionInterval, { startedAt: INCIDENT_OPTIONS.observedAt, completedAt: INCIDENT_OPTIONS.observedAt });
  assert.deepEqual(result.protectedHistorianDigest, { status: "external_required" });
  assert.deepEqual(result.auditDigest, { status: "external_required" });
  assert.deepEqual(result.providerAudit, { status: "external_required" });
  assert.deepEqual(result.deploymentBinding, { status: "external_required" });
  assert.equal(result.surfaces.schema.status, "available");
  assert.equal(result.counts.total_gate_count, 0);
  const laterObservation = await runHostedPreflight({
    options: { ...INCIDENT_OPTIONS, observedAt: "2026-08-25T12:35:56.789Z" },
    runner: incidentRunner(),
    clock: () => new Date("2026-08-25T12:35:56.789Z"),
  });
  assert.notEqual(laterObservation.targetBindingDigest, result.targetBindingDigest);
  assert.notEqual(laterObservation.incidentEvidenceFingerprint, result.incidentEvidenceFingerprint);
  const changedEvidence = await runHostedPreflight({
    options: INCIDENT_OPTIONS,
    runner: incidentRunner({ auditCount: 2 }),
    clock: INCIDENT_CLOCK,
  });
  assert.notEqual(changedEvidence.evidenceDigest, result.evidenceDigest);
  assert.notEqual(changedEvidence.incidentEvidenceFingerprint, result.incidentEvidenceFingerprint);
  const serialized = JSON.stringify(result);
  for (const raw of [TARGET.project, TARGET.database, TARGET.deployment, "private child output"]) assert.doesNotMatch(serialized, new RegExp(raw, "u"));
});

test("incident provenance redacts per-surface failures and blocks unstable double collections", async () => {
  const unavailable = await runHostedPreflight({ options: INCIDENT_OPTIONS, runner: incidentRunner({ failKey: "schema" }), clock: INCIDENT_CLOCK });
  assert.equal(unavailable.status, "partial");
  assert.equal(unavailable.code, "provider_evidence_external_required");
  assert.equal(unavailable.surfaces.schema.status, "partial");
  assert.equal(unavailable.surfaceDigests.schema.code, "query_unavailable");

  const malformed = await runHostedPreflight({ options: INCIDENT_OPTIONS, runner: incidentRunner({ malformedKey: "migrations" }), clock: INCIDENT_CLOCK });
  assert.equal(malformed.surfaceDigests.migrations.code, "malformed_result");

  const missing = await runHostedPreflight({ options: INCIDENT_OPTIONS, runner: incidentRunner({ missingSchemaObject: "audit_events" }), clock: INCIDENT_CLOCK });
  assert.deepEqual(missing.surfaceDigests["tableXinfo:audit_events"], { status: "missing", code: "required_object_missing" });

  const reordered = await runHostedPreflight({ options: INCIDENT_OPTIONS, runner: incidentRunner({ reorder: true }), clock: INCIDENT_CLOCK });
  assert.equal(reordered.status, "partial");

  const drift = await runHostedPreflight({ options: INCIDENT_OPTIONS, runner: incidentRunner({ drift: true }), clock: INCIDENT_CLOCK });
  assert.deepEqual(drift, { ok: false, status: "blocked", code: "incident_evidence_drift_detected" });
  assert.doesNotMatch(JSON.stringify([unavailable, malformed, missing, reordered, drift]), /private-raw|secret failure|private target|00000000-0000/u);
});

test("incident provenance rejects a caller timestamp outside the live collection window before querying", async () => {
  let calls = 0;
  const result = await runHostedPreflight({
    options: INCIDENT_OPTIONS,
    runner: async () => { calls += 1; throw new Error("must not query"); },
    clock: () => new Date("2026-08-25T12:45:56.789Z"),
  });
  assert.equal(calls, 0);
  assert.deepEqual(result, { ok: false, status: "blocked", code: "target_binding_mismatch" });
});

test("post-migration flow requires 503, rechecks D1, and emits only an allowlisted success", async () => {
  let queryCalls = 0;
  let probeCalls = 0;
  const runner = fakeRunner();
  const result = await runHostedPreflight({
    options: OPTIONS,
    baseline: BASELINE,
    runner: async (command) => { queryCalls += 1; return runner(command); },
    postProbe: async (target) => { probeCalls += 1; assert.deepEqual(target, { ...TARGET, targetBindingDigest: TARGET_BINDING_DIGEST }); return fakePostProbe()(); },
  });
  assert.equal(queryCalls, 22);
  assert.equal(probeCalls, 1);
  assert.deepEqual(result, { ok: true, status: "passed", code: "post_migration_invariants_match" });
  const serialized = JSON.stringify(result);
  for (const raw of ["private-time", "hidden-hosted-id", "private@example.test", "answer-op", "proposal", "source", TARGET.project, TARGET.database, TARGET.deployment]) {
    assert.doesNotMatch(serialized, new RegExp(raw, "u"));
  }
});

test("owner evidence and probe key order do not change canonical target or invariant meaning", async () => {
  const reorderedBaseline = {
    foreignKeyViolations: BASELINE.foreignKeyViolations,
    forbiddenTableState: BASELINE.forbiddenTableState,
    legacyUnboundCount: BASELINE.legacyUnboundCount,
    boundHistorianCount: BASELINE.boundHistorianCount,
    workspaceCount: BASELINE.workspaceCount,
    protectedCategoryCounts: BASELINE.protectedCategoryCounts,
    protectedCount: BASELINE.protectedCount,
    protectedDigest: BASELINE.protectedDigest,
    migrationIds: BASELINE.migrationIds,
    targetBindingDigest: BASELINE.targetBindingDigest,
    mode: BASELINE.mode,
    baselineVersion: BASELINE.baselineVersion,
  };
  const result = await runHostedPreflight({
    options: OPTIONS,
    baseline: reorderedBaseline,
    runner: fakeRunner(),
    postProbe: async () => ({ origin: TARGET.origin, route: "/api/knowledge", method: "POST", targetBindingDigest: TARGET_BINDING_DIGEST, code: "phase2_writes_not_activated", status: 503 }),
  });
  assert.deepEqual(result, { ok: true, status: "passed", code: "post_migration_invariants_match" });
});

test("preflight preserves actual forbidden-table existence and rejects any changed baseline count", async () => {
  const changed = successfulOutputs();
  changed.counts[0].prospect_count = 1;
  const result = await runHostedPreflight({ options: OPTIONS, baseline: BASELINE, runner: fakeRunner(changed), postProbe: fakePostProbe() });
  assert.deepEqual(result, { ok: false, status: "blocked", code: "post_migration_invariant_mismatch" });
});

test("preflight emits fixed blocked codes for malformed output, invariant mismatch, and CLI failure", async () => {
  const base = { options: OPTIONS, baseline: BASELINE, postProbe: fakePostProbe() };
  const malformed = await runHostedPreflight({ ...base, runner: async () => ({ stdout: "raw-id malformed {", stderr: "token=secret" }) });
  assert.deepEqual(malformed, { ok: false, status: "blocked", code: "hosted_output_invalid" });

  const mismatched = successfulOutputs();
  mismatched.counts[0].total_gate_count = 1;
  const mismatch = await runHostedPreflight({ ...base, runner: fakeRunner(mismatched) });
  assert.deepEqual(mismatch, { ok: false, status: "blocked", code: "post_migration_invariant_mismatch" });

  const failed = await runHostedPreflight({ ...base, runner: async () => { throw new Error("database raw-id and bearer token"); } });
  assert.deepEqual(failed, { ok: false, status: "blocked", code: "hosted_query_failed" });
  assert.doesNotMatch(JSON.stringify([malformed, mismatch, failed]), /raw-id|token|database|private/u);
});

test("the target binding rejects copied deployment, origin, or immutable D1 id before querying", async () => {
  for (const changedTarget of [
    { deployment: "copied-private-deployment" },
    { origin: "https://copied-prospector.example.test" },
    { database: "00000000-0000-0000-0000-000000000005" },
  ]) {
    let calls = 0;
    const result = await runHostedPreflight({
      options: { ...OPTIONS, ...changedTarget },
      baseline: BASELINE,
      runner: async () => { calls += 1; return { stdout: "should-not-run" }; },
      postProbe: fakePostProbe(),
    });
    assert.equal(calls, 0);
    assert.deepEqual(result, { ok: false, status: "blocked", code: "target_binding_mismatch" });
  }
});

test("an invalid owner-held baseline blocks before any hosted query", async () => {
  let calls = 0;
  const result = await runHostedPreflight({
    options: OPTIONS,
    baseline: { ...BASELINE, workspaceCount: 2 },
    runner: async () => { calls += 1; return { stdout: "should-not-run" }; },
    postProbe: fakePostProbe(),
  });
  assert.equal(calls, 0);
  assert.deepEqual(result, { ok: false, status: "blocked", code: "baseline_invalid" });
});

test("POST probe failures and any post-probe D1 delta block with fixed redacted codes", async () => {
  const wrongStatus = await runHostedPreflight({ options: OPTIONS, baseline: BASELINE, runner: fakeRunner(), postProbe: fakePostProbe({ status: 200 }) });
  assert.deepEqual(wrongStatus, { ok: false, status: "blocked", code: "post_probe_invariant_mismatch" });

  const failed = await runHostedPreflight({ options: OPTIONS, baseline: BASELINE, runner: fakeRunner(), postProbe: async () => { throw new Error("raw owner cookie and target id"); } });
  assert.deepEqual(failed, { ok: false, status: "blocked", code: "post_probe_failed" });

  const outputs = successfulOutputs();
  let round = 0;
  const changedRunner = async ({ key }) => {
    if (key === "migrations") round += 1;
    const current = structuredClone(outputs[key]);
    if (round === 2 && key === "counts") {
      current[0].prospect_count = 1;
      current[0].used_csrf_token_count += 1;
      current[0].unused_csrf_token_count -= 1;
    }
    return { stdout: wranglerJson(current) };
  };
  const changed = await runHostedPreflight({ options: OPTIONS, baseline: BASELINE, runner: changedRunner, postProbe: fakePostProbe() });
  assert.deepEqual(changed, { ok: false, status: "blocked", code: "post_probe_effect_detected" });

  const noCsrfConsumption = await runHostedPreflight({ options: OPTIONS, baseline: BASELINE, runner: fakeRunner(successfulOutputs(), 0), postProbe: fakePostProbe() });
  assert.deepEqual(noCsrfConsumption, { ok: false, status: "blocked", code: "post_probe_effect_detected" });
  const multipleCsrfConsumption = await runHostedPreflight({ options: OPTIONS, baseline: BASELINE, runner: fakeRunner(successfulOutputs(), 2), postProbe: fakePostProbe() });
  assert.deepEqual(multipleCsrfConsumption, { ok: false, status: "blocked", code: "post_probe_effect_detected" });
  assert.doesNotMatch(JSON.stringify([wrongStatus, failed, changed, noCsrfConsumption, multipleCsrfConsumption]), /cookie|target id|private/u);
});

test("preflight rejects unsafe arguments and requires exact target and off-Git baseline inputs", () => {
  for (const args of [
    ["--mode", "old-schema", "--database", "pilot;DROP"],
    ["--mode", "old-schema", "--database", "pilot\nname"],
    ["--mode", "delete", "--database", "pilot"],
    ["--mode", "old-schema", "--database", "pilot", "--sql", "SELECT 1"],
    ["--mode", "post-migration", "--database", "pilot"],
    ["--mode", "post-migration", "--database", TARGET.database, "--project", "p", "--deployment", "d", "--origin", TARGET.origin, "--baseline", OPTIONS.baseline],
    ["--mode", "post-migration", "--database", TARGET.database, "--project", "p", "--deployment", "d", "--origin", "https://user:secret@example.test", "--baseline", OPTIONS.baseline, "--post-probe-adapter", POST_PROBE_ADAPTER],
    ["--mode", "post-migration", "--database", TARGET.database, "--project", "p", "--deployment", "d", "--origin", TARGET.origin, "--baseline", new URL("../baseline.json", import.meta.url).pathname, "--post-probe-adapter", POST_PROBE_ADAPTER],
  ]) assert.throws(() => parsePreflightArgs(args));
});

test("CLI entrypoint injected I/O never leaks raw target or child-process failures", async () => {
  const stdout = [];
  const stderr = [];
  const exitCode = await runPreflightCli({
    argv: ["--mode", "post-migration", "--database", TARGET.database, "--project", TARGET.project, "--deployment", TARGET.deployment, "--origin", TARGET.origin, "--baseline", OPTIONS.baseline, "--post-probe-adapter", POST_PROBE_ADAPTER],
    stdout: { write: (value) => stdout.push(value) },
    stderr: { write: (value) => stderr.push(value) },
    readBaseline: async () => BASELINE,
    runner: async () => { throw new Error(`raw failure ${TARGET.database} ${TARGET.project} ${TARGET.deployment}`); },
    postProbe: fakePostProbe(),
  });
  assert.equal(exitCode, 1);
  assert.deepEqual(stdout, []);
  assert.deepEqual(stderr.map((value) => JSON.parse(value)), [{ ok: false, status: "blocked", code: "hosted_query_failed" }]);
  assert.doesNotMatch(stderr.join(""), new RegExp(`${TARGET.database}|${TARGET.project}|${TARGET.deployment}|raw failure`, "u"));
});

test("CLI loads the owner-held POST adapter and runs the complete hosted proof path", async () => {
  const stdout = [];
  const stderr = [];
  let loadedPath = "";
  const exitCode = await runPreflightCli({
    argv: ["--mode", "post-migration", "--database", TARGET.database, "--project", TARGET.project, "--deployment", TARGET.deployment, "--origin", TARGET.origin, "--baseline", OPTIONS.baseline, "--post-probe-adapter", POST_PROBE_ADAPTER],
    stdout: { write: (value) => stdout.push(value) },
    stderr: { write: (value) => stderr.push(value) },
    readBaseline: async () => BASELINE,
    runner: fakeRunner(),
    loadPostProbe: async (path) => {
      loadedPath = path;
      return fakePostProbe();
    },
  });
  assert.equal(exitCode, 0);
  assert.equal(loadedPath, POST_PROBE_ADAPTER);
  assert.deepEqual(stderr, []);
  assert.deepEqual(stdout.map((value) => JSON.parse(value)), [{ ok: true, status: "passed", code: "post_migration_invariants_match" }]);
  assert.doesNotMatch(stdout.join(""), /private|00000000|example\.test/u);
});

test("actual CLI subprocess emits only a fixed code when owner evidence cannot be loaded", () => {
  const result = spawnSync(process.execPath, [
    new URL("../scripts/phase2-hosted-preflight.mjs", import.meta.url).pathname,
    "--mode", "post-migration",
    "--database", TARGET.database,
    "--project", TARGET.project,
    "--deployment", TARGET.deployment,
    "--origin", TARGET.origin,
    "--baseline", "/private/tmp/prospector-owner-baseline-does-not-exist.json",
    "--post-probe-adapter", "/private/tmp/prospector-owner-post-probe-does-not-exist.mjs",
  ], { encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.deepEqual(JSON.parse(result.stderr), { ok: false, status: "blocked", code: "baseline_invalid" });
  assert.doesNotMatch(`${result.stdout}${result.stderr}`, new RegExp(`${TARGET.database}|${TARGET.project}|${TARGET.deployment}|private-prospector|prospector-owner`, "u"));
});

test("exact 0004 migration apply builder requires a caller-held digest and exact migration pattern", async () => {
  const migration = await readFile(new URL("../drizzle/0004_consensus_knowledge.sql", import.meta.url));
  const reviewedMigrationDigest = createHash("sha256").update(migration).digest("hex");
  const built = await buildExact0004MigrationApply({
    databaseName: "pilot_d1",
    databaseId: "00000000-0000-0000-0000-000000000004",
    reviewedMigrationDigest,
  });
  assert.equal(built.config.d1_databases[0].migrations_dir, "../drizzle");
  assert.equal(built.config.d1_databases[0].migrations_pattern, "../drizzle/0004_consensus_knowledge.sql");
  assert.ok(built.configPath.endsWith("/site/.wrangler/phase2-0004.wrangler.json"));
  assert.deepEqual(built.command.args, ["d1", "migrations", "apply", "DB", "--remote", "--config", built.configPath]);
  await assert.rejects(() => buildExact0004MigrationApply({
    databaseName: "pilot_d1",
    databaseId: "00000000-0000-0000-0000-000000000004",
    reviewedMigrationDigest: "0".repeat(64),
  }), /migration_digest_mismatch/u);
});
