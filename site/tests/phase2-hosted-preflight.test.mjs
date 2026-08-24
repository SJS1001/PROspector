import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildExact0004MigrationApply,
  buildPreflightCommands,
  parsePreflightArgs,
  runHostedPreflight,
} from "../scripts/phase2-hosted-preflight.mjs";

const PROTECTED_ROWS = [
  { category: "answer_operation", value: "answer-op" },
  { category: "answer_proposal", value: "proposal" },
  { category: "audit_detail", value: "audit" },
  { category: "confirmation_decision", value: "accept" },
  { category: "confirmation_operation", value: "confirm-op" },
  { category: "knowledge_source", value: "source" },
  { category: "knowledge_value", value: '{"score":1}' },
];
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
const FORBIDDEN_COUNTS = Object.fromEntries([
  "runner_connections", "runs", "signals", "candidates", "prospects", "contacts", "schedules",
  "approval_grants", "provider_grants", "provider_calls", "outreach_packages", "outreach_package_approvals",
  "message_versions", "message_approvals", "message_dispatches", "manual_calls", "export_jobs",
  "external_effects", "credential_records", "provider_credentials", "provider_secrets", "workspace_archives",
  "workspace_archive_objects",
].map((name) => [name, 0]));
const BASELINE = {
  baselineVersion: 1,
  mode: "old-schema",
  migrationIds: ["0000", "0001", "0002", "0003"],
  protectedDigest: PROTECTED_DIGEST,
  protectedCount: 7,
  protectedCategoryCounts: CATEGORY_COUNTS,
  workspaceCount: 1,
  boundHistorianCount: 1,
  legacyUnboundCount: 0,
  forbiddenCounts: FORBIDDEN_COUNTS,
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
    protected: PROTECTED_ROWS,
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
      contact_count: 0,
    }],
    foreignKeys: [{ foreign_key_violations: 0 }],
    forbiddenTables: [{ name: "contacts" }],
  };
}

function fakeRunner(outputs = successfulOutputs()) {
  return async ({ key }) => ({ stdout: wranglerJson(outputs[key]), stderr: "warning with private@example.test" });
}

test("preflight builds only fixed Wrangler 4.116 d1 execute --json reads", () => {
  const options = parsePreflightArgs(["--mode", "post-migration", "--database", "pilot_d1", "--baseline", "/outside/repo/baseline.json"]);
  const commands = buildPreflightCommands(options);
  assert.deepEqual(commands.map(({ key }) => key), ["migrations", "protected", "counts", "foreignKeys", "forbiddenTables"]);
  for (const command of commands) {
    assert.deepEqual(command.args.slice(0, 2), ["d1", "execute"]);
    assert.ok(command.args.includes("--remote"));
    assert.ok(command.args.includes("--json"));
    assert.ok(command.args.includes("--command"));
    const sql = command.args.at(-1);
    assert.match(sql, /^(SELECT|PRAGMA)/u);
    assert.doesNotMatch(sql, /\b(INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|REPLACE|ATTACH|DETACH|VACUUM)\b/iu);
  }
});

test("post-migration fake-runner flow hashes in memory and returns only an allowlisted success", async () => {
  const result = await runHostedPreflight({
    options: { mode: "post-migration", database: "pilot_d1", baseline: "/outside/repo/baseline.json" },
    baseline: BASELINE,
    runner: fakeRunner(),
  });
  assert.deepEqual(result, { ok: true, status: "passed", code: "post_migration_invariants_match" });
  const serialized = JSON.stringify(result);
  for (const raw of ["private-time", "hidden-hosted-id", "private@example.test", "answer-op", "proposal", "source"]) {
    assert.doesNotMatch(serialized, new RegExp(raw, "u"));
  }
});

test("preflight emits fixed blocked codes for malformed output, invariant mismatch, and CLI failure", async () => {
  const base = { options: { mode: "post-migration", database: "pilot_d1", baseline: "/outside/repo/baseline.json" }, baseline: BASELINE };
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

test("an invalid owner-held baseline blocks before any hosted query", async () => {
  let calls = 0;
  const result = await runHostedPreflight({
    options: { mode: "post-migration", database: "pilot_d1", baseline: "/outside/repo/baseline.json" },
    baseline: { ...BASELINE, workspaceCount: 2 },
    runner: async () => { calls += 1; return { stdout: "should-not-run" }; },
  });
  assert.equal(calls, 0);
  assert.deepEqual(result, { ok: false, status: "blocked", code: "baseline_invalid" });
});

test("preflight rejects unsafe arguments and requires an explicit off-Git baseline for post-migration", () => {
  for (const args of [
    ["--mode", "old-schema", "--database", "pilot;DROP"],
    ["--mode", "old-schema", "--database", "pilot\nname"],
    ["--mode", "delete", "--database", "pilot"],
    ["--mode", "old-schema", "--database", "pilot", "--sql", "SELECT 1"],
    ["--mode", "post-migration", "--database", "pilot"],
    ["--mode", "post-migration", "--database", "pilot", "--baseline", new URL("../baseline.json", import.meta.url).pathname],
  ]) assert.throws(() => parsePreflightArgs(args));
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
