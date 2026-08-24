#!/usr/bin/env node

import { execFile as nativeExecFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isAbsolute, relative } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

const execFile = promisify(nativeExecFile);
const MODES = new Set(["old-schema", "post-migration", "inspect-gate"]);
const SAFE_DATABASE = /^[A-Za-z0-9_-]{1,96}$/u;
const SAFE_DIGEST = /^[a-f0-9]{64}$/u;
const SAFE_MIGRATION_NAME = /^\d{4}_[A-Za-z0-9_-]+\.sql$/u;
const FORBIDDEN_SQL = /\b(INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|REPLACE|ATTACH|DETACH|VACUUM)\b/iu;
const REPOSITORY_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const IGNORED_BASELINE_ROOT = fileURLToPath(new URL("../.wrangler/", import.meta.url));
const OLD_MIGRATIONS = [
  "0000_jittery_meteorite.sql",
  "0001_true_spencer_smythe.sql",
  "0002_eager_supreme_intelligence.sql",
  "0003_acoustic_magik.sql",
];
const PHASE2_MIGRATIONS = [...OLD_MIGRATIONS, "0004_consensus_knowledge.sql"];
const PROTECTED_CATEGORIES = [
  "answer_operation",
  "answer_proposal",
  "audit_detail",
  "confirmation_decision",
  "confirmation_operation",
  "knowledge_source",
  "knowledge_value",
];
const FORBIDDEN_TABLES = [
  "runner_connections", "runs", "signals", "candidates", "prospects", "contacts", "schedules",
  "approval_grants", "provider_grants", "provider_calls", "outreach_packages", "outreach_package_approvals",
  "message_versions", "message_approvals", "message_dispatches", "manual_calls", "export_jobs",
  "external_effects", "credential_records", "provider_credentials", "provider_secrets", "workspace_archives",
  "workspace_archive_objects",
];
const SAFE_RESULTS = Object.freeze({
  oldSchema: Object.freeze({ ok: true, status: "passed", code: "old_schema_invariants_match" }),
  postMigration: Object.freeze({ ok: true, status: "passed", code: "post_migration_invariants_match" }),
  gateAbsent: Object.freeze({ ok: true, status: "passed", code: "gate_absent" }),
});
const SAFE_FAILURE_CODES = new Set([
  "baseline_invalid",
  "hosted_output_invalid",
  "hosted_query_failed",
  "old_schema_invariant_mismatch",
  "post_migration_invariant_mismatch",
  "gate_invariant_mismatch",
]);
const HELP = `Phase 2 hosted D1 preflight (read-only)\n\nUsage: node scripts/phase2-hosted-preflight.mjs --mode old-schema|post-migration|inspect-gate --database <name-or-id> [--baseline <owner-held-json>]\n\nPost-migration mode requires an owner-held baseline file outside Git. Every hosted read uses a fixed Wrangler d1 execute --json query. Output is limited to a status and fixed code; rows, identifiers, content, child-process errors, and secrets are never emitted.\n`;

class PreflightError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

export function parsePreflightArgs(args) {
  const options = { mode: "", database: "", baseline: "", help: false };
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index];
    if (key === "--help" || key === "-h") options.help = true;
    else if (key === "--mode" || key === "--database" || key === "--baseline") {
      const value = args[++index];
      if (!value || value.startsWith("--") || /[\r\n\0]/u.test(value)) throw new Error(`${key.slice(2).replaceAll("-", "_")}_required`);
      options[key.slice(2)] = value;
    } else throw new Error("unsupported_argument");
  }
  if (!options.help && !MODES.has(options.mode)) throw new Error("unsupported_mode");
  if (!options.help && !SAFE_DATABASE.test(options.database)) throw new Error("invalid_database");
  if (!options.help && options.mode === "post-migration" && (!options.baseline || !isOffGitBaselinePath(options.baseline))) throw new Error("baseline_required");
  if (!options.help && options.mode !== "post-migration" && options.baseline) throw new Error("baseline_not_permitted");
  return options;
}

function isWithin(root, candidate) {
  const path = relative(root, candidate);
  return path !== "" && !path.startsWith("..") && !isAbsolute(path);
}

function isOffGitBaselinePath(candidate) {
  if (!isAbsolute(candidate)) return false;
  return !isWithin(REPOSITORY_ROOT, candidate) || isWithin(IGNORED_BASELINE_ROOT, candidate);
}

function fixedRead(key, database, sql) {
  if (FORBIDDEN_SQL.test(sql) || !/^(SELECT|PRAGMA)/u.test(sql)) throw new Error("unsafe_internal_query");
  return { key, args: ["d1", "execute", database, "--remote", "--json", "--command", sql] };
}

const PROTECTED_QUERY = "SELECT 'answer_operation' AS category, operation_digest AS value FROM interview_answers UNION ALL SELECT 'answer_proposal' AS category, proposal_digest AS value FROM interview_answers UNION ALL SELECT 'confirmation_decision' AS category, decision AS value FROM interview_confirmations UNION ALL SELECT 'confirmation_operation' AS category, operation_digest AS value FROM interview_confirmations UNION ALL SELECT 'knowledge_source' AS category, source_digest AS value FROM knowledge_versions UNION ALL SELECT 'knowledge_value' AS category, value_json AS value FROM knowledge_versions UNION ALL SELECT 'audit_detail' AS category, detail_json AS value FROM audit_events ORDER BY category, value";
const OLD_COUNTS_QUERY = "SELECT (SELECT COUNT(*) FROM workspaces) AS workspace_count, (SELECT COUNT(*) FROM interview_answers a JOIN interview_confirmations c ON c.answer_id = a.id JOIN knowledge_versions k ON k.id = c.knowledge_version_id WHERE a.proposal_digest != 'legacy-unbound' AND c.operation_digest != 'legacy-unbound') AS bound_historian_count, (SELECT COUNT(*) FROM interview_answers WHERE proposal_digest = 'legacy-unbound') AS legacy_unbound_count";
const POST_COUNTS_QUERY = "SELECT (SELECT COUNT(*) FROM workspaces) AS workspace_count, (SELECT COUNT(*) FROM interview_answers a JOIN interview_confirmations c ON c.answer_id = a.id JOIN knowledge_versions k ON k.id = c.knowledge_version_id WHERE a.proposal_digest != 'legacy-unbound' AND c.operation_digest != 'legacy-unbound') AS bound_historian_count, (SELECT COUNT(*) FROM interview_answers WHERE proposal_digest = 'legacy-unbound') AS legacy_unbound_count, (SELECT COUNT(*) FROM companies) AS company_count, (SELECT COUNT(*) FROM workspace_companies) AS workspace_company_count, (SELECT COUNT(*) FROM workspaces w LEFT JOIN workspace_companies wc ON wc.workspace_id = w.id LEFT JOIN companies c ON c.id = wc.company_id AND c.workspace_id = w.id WHERE wc.company_id IS NULL OR c.id IS NULL) AS invalid_company_binding_count, (SELECT COUNT(*) FROM interview_authority_bindings) AS binding_count, (SELECT COUNT(*) FROM interview_answers a JOIN interview_confirmations c ON c.answer_id = a.id JOIN knowledge_versions k ON k.id = c.knowledge_version_id LEFT JOIN interview_authority_bindings b ON b.answer_id = a.id AND b.confirmation_id = c.id AND b.knowledge_version_id = k.id AND b.knowledge_item_id = k.knowledge_item_id WHERE a.proposal_digest != 'legacy-unbound' AND c.operation_digest != 'legacy-unbound' AND b.answer_id IS NULL) AS invalid_binding_count, (SELECT COUNT(*) FROM knowledge_versions k WHERE k.source_digest IS NOT NULL AND k.source_digest != 'legacy-unbound' AND (k.knowledge_item_id IS NULL OR k.value_digest != k.source_digest OR NOT EXISTS (SELECT 1 FROM knowledge_items i WHERE i.id = k.knowledge_item_id AND i.current_version_id = k.id AND i.workspace_id = k.workspace_id))) AS invalid_knowledge_lineage_count, (SELECT COUNT(*) FROM interview_answers a JOIN interview_authority_bindings b ON b.answer_id = a.id WHERE a.proposal_digest = 'legacy-unbound') AS legacy_bound_count, (SELECT COUNT(*) FROM interview_authority_review WHERE status = 'review_required') AS quarantine_count, (SELECT COUNT(*) FROM interview_answers a LEFT JOIN interview_authority_review r ON r.answer_id = a.id AND r.workspace_id = a.workspace_id AND r.status = 'review_required' AND r.reason = 'legacy_unbound_authority' WHERE a.proposal_digest = 'legacy-unbound' AND r.answer_id IS NULL) AS invalid_quarantine_count, (SELECT COUNT(*) FROM phase_activation_gates) AS total_gate_count, (SELECT COUNT(*) FROM phase_activation_gates WHERE capability = 'consensus_knowledge') AS consensus_gate_count, (SELECT COUNT(*) FROM contacts) AS contact_count";
const FOREIGN_KEYS_QUERY = "SELECT COUNT(*) AS foreign_key_violations FROM pragma_foreign_key_check";
const FORBIDDEN_TABLE_QUERY = `SELECT name FROM sqlite_schema WHERE type = 'table' AND name IN (${FORBIDDEN_TABLES.map((name) => `'${name}'`).join(",")}) ORDER BY name`;
const GATE_QUERY = "SELECT COUNT(*) AS total_gate_count, COUNT(CASE WHEN capability = 'consensus_knowledge' THEN 1 END) AS consensus_gate_count FROM phase_activation_gates";

export function buildPreflightCommands({ mode, database }) {
  if (!MODES.has(mode) || !SAFE_DATABASE.test(database)) throw new Error("invalid_preflight_options");
  if (mode === "inspect-gate") return [fixedRead("counts", database, GATE_QUERY)];
  return [
    fixedRead("migrations", database, "SELECT name AS migration_name, applied_at FROM d1_migrations ORDER BY id"),
    fixedRead("protected", database, PROTECTED_QUERY),
    fixedRead("counts", database, mode === "post-migration" ? POST_COUNTS_QUERY : OLD_COUNTS_QUERY),
    fixedRead("foreignKeys", database, FOREIGN_KEYS_QUERY),
    fixedRead("forbiddenTables", database, FORBIDDEN_TABLE_QUERY),
  ];
}

function blocked(code) {
  return { ok: false, status: "blocked", code: SAFE_FAILURE_CODES.has(code) ? code : "hosted_output_invalid" };
}

function parseRows(stdout) {
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new PreflightError("hosted_output_invalid");
  }
  if (!Array.isArray(parsed) || parsed.length !== 1 || parsed[0]?.success !== true || !Array.isArray(parsed[0].results)) {
    throw new PreflightError("hosted_output_invalid");
  }
  return parsed[0].results;
}

function integer(row, key) {
  const value = row?.[key];
  if (!Number.isSafeInteger(value) || value < 0) throw new PreflightError("hosted_output_invalid");
  return value;
}

function same(value, expected) {
  return JSON.stringify(value) === JSON.stringify(expected);
}

function protectedSummary(rows) {
  const normalized = rows.map((row) => {
    if (!row || !PROTECTED_CATEGORIES.includes(row.category) || typeof row.value !== "string" || row.value.length > 131_072) {
      throw new PreflightError("hosted_output_invalid");
    }
    return { category: row.category, value: row.value };
  }).sort((left, right) => left.category < right.category ? -1 : left.category > right.category ? 1 : left.value < right.value ? -1 : left.value > right.value ? 1 : 0);
  const categoryCounts = Object.fromEntries(PROTECTED_CATEGORIES.map((category) => [category, normalized.filter((row) => row.category === category).length]));
  return {
    digest: createHash("sha256").update(JSON.stringify(normalized)).digest("hex"),
    count: normalized.length,
    categoryCounts,
  };
}

function validateBaseline(baseline) {
  const keys = ["baselineVersion", "mode", "migrationIds", "protectedDigest", "protectedCount", "protectedCategoryCounts", "workspaceCount", "boundHistorianCount", "legacyUnboundCount", "forbiddenCounts", "foreignKeyViolations"];
  if (!baseline || typeof baseline !== "object" || Array.isArray(baseline) || !same(Object.keys(baseline).sort(), [...keys].sort())) throw new PreflightError("baseline_invalid");
  if (baseline.baselineVersion !== 1 || baseline.mode !== "old-schema" || !same(baseline.migrationIds, OLD_MIGRATIONS.map((name) => name.slice(0, 4))) || !SAFE_DIGEST.test(baseline.protectedDigest)) throw new PreflightError("baseline_invalid");
  for (const key of ["protectedCount", "workspaceCount", "boundHistorianCount", "legacyUnboundCount", "foreignKeyViolations"]) {
    if (!Number.isSafeInteger(baseline[key]) || baseline[key] < 0) throw new PreflightError("baseline_invalid");
  }
  if (baseline.workspaceCount !== 1 || baseline.foreignKeyViolations !== 0) throw new PreflightError("baseline_invalid");
  if (!baseline.protectedCategoryCounts || typeof baseline.protectedCategoryCounts !== "object" || Array.isArray(baseline.protectedCategoryCounts) || !baseline.forbiddenCounts || typeof baseline.forbiddenCounts !== "object" || Array.isArray(baseline.forbiddenCounts)) throw new PreflightError("baseline_invalid");
  if (!same(Object.keys(baseline.protectedCategoryCounts).sort(), [...PROTECTED_CATEGORIES].sort()) || !same(Object.keys(baseline.forbiddenCounts).sort(), [...FORBIDDEN_TABLES].sort())) throw new PreflightError("baseline_invalid");
  if (Object.values(baseline.protectedCategoryCounts).some((value) => !Number.isSafeInteger(value) || value < 0) || Object.values(baseline.forbiddenCounts).some((value) => value !== 0)) throw new PreflightError("baseline_invalid");
  if (Object.values(baseline.protectedCategoryCounts).reduce((total, value) => total + value, 0) !== baseline.protectedCount) throw new PreflightError("baseline_invalid");
  return baseline;
}

function migrationState(rows) {
  const names = rows.map((row) => row?.migration_name);
  if (!names.every((name) => typeof name === "string" && SAFE_MIGRATION_NAME.test(name)) || new Set(names).size !== names.length) throw new PreflightError("hosted_output_invalid");
  return { names, ids: names.map((name) => name.slice(0, 4)) };
}

function invariantState(mode, rowsByKey) {
  const countsRows = rowsByKey.counts;
  const foreignRows = rowsByKey.foreignKeys;
  if (countsRows.length !== 1 || foreignRows.length !== 1) throw new PreflightError("hosted_output_invalid");
  const presentForbidden = rowsByKey.forbiddenTables.map((row) => row?.name);
  if (presentForbidden.some((name) => !FORBIDDEN_TABLES.includes(name)) || new Set(presentForbidden).size !== presentForbidden.length) throw new PreflightError("hosted_output_invalid");
  const counts = countsRows[0];
  const forbiddenCounts = Object.fromEntries(FORBIDDEN_TABLES.map((name) => [name, name === "contacts" && presentForbidden.includes(name) ? integer(counts, "contact_count") : 0]));
  const migrations = migrationState(rowsByKey.migrations);
  return {
    migrationNames: migrations.names,
    migrationIds: migrations.ids,
    protected: protectedSummary(rowsByKey.protected),
    workspaceCount: integer(counts, "workspace_count"),
    boundHistorianCount: integer(counts, "bound_historian_count"),
    legacyUnboundCount: integer(counts, "legacy_unbound_count"),
    foreignKeyViolations: integer(foreignRows[0], "foreign_key_violations"),
    presentForbidden,
    forbiddenCounts,
    counts,
  };
}

function evaluateOldSchema(state) {
  const ok = same(state.migrationNames, OLD_MIGRATIONS)
    && state.workspaceCount === 1
    && state.foreignKeyViolations === 0
    && state.presentForbidden.length === 0;
  if (!ok) throw new PreflightError("old_schema_invariant_mismatch");
  return SAFE_RESULTS.oldSchema;
}

function evaluatePostMigration(state, baselineInput) {
  const baseline = validateBaseline(baselineInput);
  const counts = state.counts;
  const ok = same(state.migrationNames, PHASE2_MIGRATIONS)
    && state.protected.digest === baseline.protectedDigest
    && state.protected.count === baseline.protectedCount
    && same(state.protected.categoryCounts, baseline.protectedCategoryCounts)
    && state.workspaceCount === baseline.workspaceCount
    && state.boundHistorianCount === baseline.boundHistorianCount
    && state.legacyUnboundCount === baseline.legacyUnboundCount
    && state.foreignKeyViolations === baseline.foreignKeyViolations
    && same(state.forbiddenCounts, baseline.forbiddenCounts)
    && same(state.presentForbidden, ["contacts"])
    && integer(counts, "company_count") === baseline.workspaceCount
    && integer(counts, "workspace_company_count") === baseline.workspaceCount
    && integer(counts, "invalid_company_binding_count") === 0
    && integer(counts, "binding_count") === baseline.boundHistorianCount
    && integer(counts, "invalid_binding_count") === 0
    && integer(counts, "invalid_knowledge_lineage_count") === 0
    && integer(counts, "legacy_bound_count") === 0
    && integer(counts, "quarantine_count") === baseline.legacyUnboundCount
    && integer(counts, "invalid_quarantine_count") === 0
    && integer(counts, "total_gate_count") === 0
    && integer(counts, "consensus_gate_count") === 0;
  if (!ok) throw new PreflightError("post_migration_invariant_mismatch");
  return SAFE_RESULTS.postMigration;
}

function evaluateGate(rows) {
  if (rows.length !== 1 || integer(rows[0], "total_gate_count") !== 0 || integer(rows[0], "consensus_gate_count") !== 0) throw new PreflightError("gate_invariant_mismatch");
  return SAFE_RESULTS.gateAbsent;
}

export async function runHostedPreflight({ options, baseline, runner }) {
  let rowsByKey = {};
  try {
    const validatedBaseline = options.mode === "post-migration" ? validateBaseline(baseline) : undefined;
    for (const command of buildPreflightCommands(options)) {
      let result;
      try {
        result = await runner(command);
      } catch {
        throw new PreflightError("hosted_query_failed");
      }
      rowsByKey[command.key] = parseRows(result?.stdout);
    }
    if (options.mode === "inspect-gate") return evaluateGate(rowsByKey.counts);
    const state = invariantState(options.mode, rowsByKey);
    return options.mode === "post-migration" ? evaluatePostMigration(state, validatedBaseline) : evaluateOldSchema(state);
  } catch (error) {
    return blocked(error instanceof PreflightError ? error.code : "hosted_output_invalid");
  } finally {
    rowsByKey = {};
  }
}

export async function buildExact0004MigrationApply({ databaseName, databaseId, reviewedMigrationDigest }) {
  if (!SAFE_DATABASE.test(databaseName) || !SAFE_DATABASE.test(databaseId) || !SAFE_DIGEST.test(reviewedMigrationDigest)) throw new Error("invalid_migration_apply_input");
  const migration = await readFile(new URL("../drizzle/0004_consensus_knowledge.sql", import.meta.url));
  const actualDigest = createHash("sha256").update(migration).digest("hex");
  if (actualDigest !== reviewedMigrationDigest) throw new Error("migration_digest_mismatch");
  const configPath = fileURLToPath(new URL("../.wrangler/phase2-0004.wrangler.json", import.meta.url));
  return {
    configPath,
    config: {
      name: "prospector-phase2-migration-0004",
      compatibility_date: "2026-07-30",
      d1_databases: [{
        binding: "DB",
        database_name: databaseName,
        database_id: databaseId,
        migrations_dir: "../drizzle",
        migrations_pattern: "../drizzle/0004_consensus_knowledge.sql",
      }],
    },
    command: { args: ["d1", "migrations", "apply", "DB", "--remote", "--config", configPath] },
  };
}

async function nativeRunner(command) {
  return execFile("npx", ["wrangler", ...command.args], { cwd: new URL("..", import.meta.url), maxBuffer: 4 * 1024 * 1024 });
}

async function main() {
  const options = parsePreflightArgs(process.argv.slice(2));
  if (options.help) return process.stdout.write(HELP);
  let baseline;
  if (options.baseline) {
    try {
      baseline = JSON.parse(await readFile(options.baseline, "utf8"));
    } catch {
      const result = blocked("baseline_invalid");
      process.stderr.write(`${JSON.stringify(result)}\n`);
      process.exitCode = 1;
      return;
    }
  }
  const result = await runHostedPreflight({ options, baseline, runner: nativeRunner });
  const output = `${JSON.stringify(result)}\n`;
  if (result.ok) process.stdout.write(output);
  else {
    process.stderr.write(output);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    process.stderr.write(`${JSON.stringify(blocked("hosted_output_invalid"))}\n`);
    process.exitCode = 1;
  });
}
