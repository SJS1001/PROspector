#!/usr/bin/env node

import { execFile as nativeExecFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isAbsolute, relative } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

import { PHASE2_FORBIDDEN_TABLES, PHASE2_FORBIDDEN_TABLE_NAMES } from "./phase2-hosted-contract.mjs";

const execFile = promisify(nativeExecFile);
const MODES = new Set(["old-schema", "post-migration", "inspect-gate"]);
const SAFE_IDENTIFIER = /^[A-Za-z0-9_-]{1,160}$/u;
const SAFE_DATABASE = /^[A-Za-z0-9_-]{1,96}$/u;
const SAFE_DATABASE_ID = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/u;
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
const SAFE_RESULTS = Object.freeze({
  oldSchema: Object.freeze({ ok: true, status: "passed", code: "old_schema_invariants_match" }),
  postMigration: Object.freeze({ ok: true, status: "passed", code: "post_migration_invariants_match" }),
  gateAbsent: Object.freeze({ ok: true, status: "passed", code: "gate_absent" }),
});
const SAFE_FAILURE_CODES = new Set([
  "baseline_invalid",
  "gate_invariant_mismatch",
  "hosted_output_invalid",
  "hosted_query_failed",
  "invalid_arguments",
  "old_schema_invariant_mismatch",
  "post_migration_invariant_mismatch",
  "post_probe_effect_detected",
  "post_probe_failed",
  "post_probe_invariant_mismatch",
  "target_binding_mismatch",
]);
const HELP = `Phase 2 hosted D1 preflight (read-only except for the required POST probe)\n\nUsage: node scripts/phase2-hosted-preflight.mjs --mode old-schema|inspect-gate --database <name-or-id>\n       node scripts/phase2-hosted-preflight.mjs --mode post-migration --database <immutable-d1-uuid> --project <project-id> --deployment <deployment-id> --origin <https-origin> --baseline <owner-held-json> --post-probe-adapter <owner-held-mjs>\n\nPost-migration mode requires owner-held files outside Git. The adapter must export buildKnowledgePostRequest(target) and may supply authenticated RequestInit material; this CLI performs the fixed POST itself against <origin>/api/knowledge and requires the exact inactive-gate 503. The only permitted D1 delta is consumption of exactly one one-time CSRF token; all checked authority and operational state must remain unchanged. Every hosted D1 read uses a fixed Wrangler d1 execute --json query against the immutable D1 UUID. Output is limited to status and fixed code; rows, identifiers, content, child-process errors, request material, and secrets are never emitted.\n`;

class PreflightError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

export function parsePreflightArgs(args) {
  const options = { mode: "", database: "", project: "", deployment: "", origin: "", baseline: "", postProbeAdapter: "", help: false };
  const optionNames = new Map([
    ["--mode", "mode"],
    ["--database", "database"],
    ["--project", "project"],
    ["--deployment", "deployment"],
    ["--origin", "origin"],
    ["--baseline", "baseline"],
    ["--post-probe-adapter", "postProbeAdapter"],
  ]);
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index];
    if (key === "--help" || key === "-h") options.help = true;
    else if (optionNames.has(key)) {
      const value = args[++index];
      if (!value || value.startsWith("--") || /[\r\n\0]/u.test(value)) throw new Error(`${key.slice(2).replaceAll("-", "_")}_required`);
      options[optionNames.get(key)] = value;
    } else throw new Error("unsupported_argument");
  }
  if (options.help) return options;
  if (!MODES.has(options.mode)) throw new Error("unsupported_mode");
  if (!SAFE_DATABASE.test(options.database)) throw new Error("invalid_database");
  if (options.mode === "post-migration") {
    if (!SAFE_IDENTIFIER.test(options.project) || !SAFE_IDENTIFIER.test(options.deployment)) throw new Error("target_required");
    if (!SAFE_DATABASE_ID.test(options.database) || !isExactHttpsOrigin(options.origin)) throw new Error("immutable_target_required");
    if (!options.baseline || !isOwnerHeldPath(options.baseline)) throw new Error("baseline_required");
    if (!options.postProbeAdapter.endsWith(".mjs") || !isOwnerHeldPath(options.postProbeAdapter)) throw new Error("post_probe_adapter_required");
  } else if (options.project || options.deployment || options.origin || options.baseline || options.postProbeAdapter) throw new Error("post_migration_argument_not_permitted");
  return options;
}

function isExactHttpsOrigin(candidate) {
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password
      && parsed.pathname === "/" && !parsed.search && !parsed.hash && parsed.origin === candidate;
  } catch {
    return false;
  }
}

function isWithin(root, candidate) {
  const path = relative(root, candidate);
  return path === "" || (!path.startsWith("..") && !isAbsolute(path));
}

function isOwnerHeldPath(candidate) {
  if (!isAbsolute(candidate)) return false;
  return !isWithin(REPOSITORY_ROOT, candidate) || isWithin(IGNORED_BASELINE_ROOT, candidate);
}

function fixedRead(key, database, sql) {
  if (FORBIDDEN_SQL.test(sql) || !/^(SELECT|PRAGMA)/u.test(sql)) throw new Error("unsafe_internal_query");
  return { key, args: ["d1", "execute", database, "--remote", "--json", "--command", sql] };
}

const PROTECTED_QUERIES = Object.freeze([
  Object.freeze({ key: "protectedAnswerOperation", category: "answer_operation", sql: "SELECT operation_digest AS value FROM interview_answers ORDER BY value" }),
  Object.freeze({ key: "protectedAnswerProposal", category: "answer_proposal", sql: "SELECT proposal_digest AS value FROM interview_answers ORDER BY value" }),
  Object.freeze({ key: "protectedAuditDetail", category: "audit_detail", sql: "SELECT detail_json AS value FROM audit_events ORDER BY value" }),
  Object.freeze({ key: "protectedConfirmationDecision", category: "confirmation_decision", sql: "SELECT decision AS value FROM interview_confirmations ORDER BY value" }),
  Object.freeze({ key: "protectedConfirmationOperation", category: "confirmation_operation", sql: "SELECT operation_digest AS value FROM interview_confirmations ORDER BY value" }),
  Object.freeze({ key: "protectedKnowledgeSource", category: "knowledge_source", sql: "SELECT source_digest AS value FROM knowledge_versions ORDER BY value" }),
  Object.freeze({ key: "protectedKnowledgeValue", category: "knowledge_value", sql: "SELECT value_json AS value FROM knowledge_versions ORDER BY value" }),
]);
const OLD_COUNTS_QUERY = "SELECT (SELECT COUNT(*) FROM workspaces) AS workspace_count, (SELECT COUNT(*) FROM interview_answers a JOIN interview_confirmations c ON c.answer_id = a.id JOIN knowledge_versions k ON k.id = c.knowledge_version_id WHERE a.proposal_digest != 'legacy-unbound' AND c.operation_digest != 'legacy-unbound') AS bound_historian_count, (SELECT COUNT(*) FROM interview_answers WHERE proposal_digest = 'legacy-unbound') AS legacy_unbound_count, (SELECT COUNT(*) FROM prospects) AS prospect_count";
const POST_COUNTS_QUERY = "SELECT (SELECT COUNT(*) FROM workspaces) AS workspace_count, (SELECT COUNT(*) FROM interview_answers a JOIN interview_confirmations c ON c.answer_id = a.id JOIN knowledge_versions k ON k.id = c.knowledge_version_id WHERE a.proposal_digest != 'legacy-unbound' AND c.operation_digest != 'legacy-unbound') AS bound_historian_count, (SELECT COUNT(*) FROM interview_answers WHERE proposal_digest = 'legacy-unbound') AS legacy_unbound_count, (SELECT COUNT(*) FROM companies) AS company_count, (SELECT COUNT(*) FROM workspace_companies) AS workspace_company_count, (SELECT COUNT(*) FROM workspaces w LEFT JOIN workspace_companies wc ON wc.workspace_id = w.id LEFT JOIN companies c ON c.id = wc.company_id AND c.workspace_id = w.id WHERE wc.company_id IS NULL OR c.id IS NULL) AS invalid_company_binding_count, (SELECT COUNT(*) FROM interview_authority_bindings) AS binding_count, (SELECT COUNT(*) FROM interview_answers a JOIN interview_confirmations c ON c.answer_id = a.id JOIN knowledge_versions k ON k.id = c.knowledge_version_id LEFT JOIN interview_authority_bindings b ON b.answer_id = a.id AND b.confirmation_id = c.id AND b.knowledge_version_id = k.id AND b.knowledge_item_id = k.knowledge_item_id WHERE a.proposal_digest != 'legacy-unbound' AND c.operation_digest != 'legacy-unbound' AND b.answer_id IS NULL) AS invalid_binding_count, (SELECT COUNT(*) FROM knowledge_versions k WHERE k.source_digest IS NOT NULL AND k.source_digest != 'legacy-unbound' AND (k.knowledge_item_id IS NULL OR k.value_digest != k.source_digest OR NOT EXISTS (SELECT 1 FROM knowledge_items i WHERE i.id = k.knowledge_item_id AND i.current_version_id = k.id AND i.workspace_id = k.workspace_id))) AS invalid_knowledge_lineage_count, (SELECT COUNT(*) FROM interview_answers a JOIN interview_authority_bindings b ON b.answer_id = a.id WHERE a.proposal_digest = 'legacy-unbound') AS legacy_bound_count, (SELECT COUNT(*) FROM interview_authority_review WHERE status = 'review_required') AS quarantine_count, (SELECT COUNT(*) FROM interview_answers a LEFT JOIN interview_authority_review r ON r.answer_id = a.id AND r.workspace_id = a.workspace_id AND r.status = 'review_required' AND r.reason = 'legacy_unbound_authority' WHERE a.proposal_digest = 'legacy-unbound' AND r.answer_id IS NULL) AS invalid_quarantine_count, (SELECT COUNT(*) FROM phase_activation_gates) AS total_gate_count, (SELECT COUNT(*) FROM phase_activation_gates WHERE capability = 'consensus_knowledge') AS consensus_gate_count, (SELECT COUNT(*) FROM prospects) AS prospect_count, (SELECT COUNT(*) FROM contacts) AS contact_count, (SELECT COUNT(*) FROM csrf_tokens) AS csrf_token_count, (SELECT COUNT(*) FROM csrf_tokens WHERE used_at IS NOT NULL) AS used_csrf_token_count, (SELECT COUNT(*) FROM csrf_tokens WHERE used_at IS NULL) AS unused_csrf_token_count";
const FOREIGN_KEYS_QUERY = "PRAGMA foreign_key_check";
const FORBIDDEN_TABLE_QUERY = `SELECT name FROM sqlite_schema WHERE type = 'table' AND name IN (${PHASE2_FORBIDDEN_TABLE_NAMES.map((name) => `'${name}'`).join(",")}) ORDER BY name`;
const GATE_QUERY = "SELECT COUNT(*) AS total_gate_count, COUNT(CASE WHEN capability = 'consensus_knowledge' THEN 1 END) AS consensus_gate_count FROM phase_activation_gates";

export function buildPreflightCommands({ mode, database }) {
  if (!MODES.has(mode) || !SAFE_DATABASE.test(database) || (mode === "post-migration" && !SAFE_DATABASE_ID.test(database))) throw new Error("invalid_preflight_options");
  if (mode === "inspect-gate") return [fixedRead("counts", database, GATE_QUERY)];
  return [
    fixedRead("migrations", database, "SELECT name AS migration_name, applied_at FROM d1_migrations ORDER BY id"),
    ...PROTECTED_QUERIES.map(({ key, sql }) => fixedRead(key, database, sql)),
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
  if (!Array.isArray(parsed) || parsed.length !== 1 || parsed[0]?.success !== true || !Array.isArray(parsed[0].results)) throw new PreflightError("hosted_output_invalid");
  return parsed[0].results;
}

function integer(row, key) {
  const value = row?.[key];
  if (!Number.isSafeInteger(value) || value < 0) throw new PreflightError("hosted_output_invalid");
  return value;
}

function canonicalEqual(value, expected) {
  return JSON.stringify(value) === JSON.stringify(expected);
}

function hasExactKeys(value, expectedKeys) {
  return value && typeof value === "object" && !Array.isArray(value)
    && canonicalEqual(Object.keys(value).sort(), [...expectedKeys].sort());
}

function protectedSummary(rows) {
  const normalized = rows.map((row) => {
    if (!row || !PROTECTED_CATEGORIES.includes(row.category) || typeof row.value !== "string" || row.value.length > 131_072) throw new PreflightError("hosted_output_invalid");
    return { category: row.category, value: row.value };
  }).sort((left, right) => left.category < right.category ? -1 : left.category > right.category ? 1 : left.value < right.value ? -1 : left.value > right.value ? 1 : 0);
  const categoryCounts = Object.fromEntries(PROTECTED_CATEGORIES.map((category) => [category, normalized.filter((row) => row.category === category).length]));
  return {
    digest: createHash("sha256").update(JSON.stringify(normalized)).digest("hex"),
    count: normalized.length,
    categoryCounts,
  };
}

function validateForbiddenBaseline(state) {
  if (!hasExactKeys(state, PHASE2_FORBIDDEN_TABLE_NAMES)) throw new PreflightError("baseline_invalid");
  for (const descriptor of PHASE2_FORBIDDEN_TABLES) {
    const value = state[descriptor.name];
    if (!hasExactKeys(value, ["present", "count"])) throw new PreflightError("baseline_invalid");
    const expectedPresent = descriptor.oldSchema === "present";
    if (value.present !== expectedPresent) throw new PreflightError("baseline_invalid");
    if (expectedPresent ? !Number.isSafeInteger(value.count) || value.count < 0 : value.count !== null) throw new PreflightError("baseline_invalid");
  }
  return state;
}

function validateBaseline(baseline) {
  const keys = ["baselineVersion", "mode", "targetBindingDigest", "migrationIds", "protectedDigest", "protectedCount", "protectedCategoryCounts", "workspaceCount", "boundHistorianCount", "legacyUnboundCount", "forbiddenTableState", "foreignKeyViolations"];
  if (!hasExactKeys(baseline, keys)) throw new PreflightError("baseline_invalid");
  if (baseline.baselineVersion !== 2 || baseline.mode !== "old-schema" || !SAFE_DIGEST.test(baseline.targetBindingDigest) || !canonicalEqual(baseline.migrationIds, OLD_MIGRATIONS.map((name) => name.slice(0, 4))) || !SAFE_DIGEST.test(baseline.protectedDigest)) throw new PreflightError("baseline_invalid");
  for (const key of ["protectedCount", "workspaceCount", "boundHistorianCount", "legacyUnboundCount", "foreignKeyViolations"]) {
    if (!Number.isSafeInteger(baseline[key]) || baseline[key] < 0) throw new PreflightError("baseline_invalid");
  }
  if (baseline.workspaceCount !== 1 || baseline.foreignKeyViolations !== 0) throw new PreflightError("baseline_invalid");
  if (!hasExactKeys(baseline.protectedCategoryCounts, PROTECTED_CATEGORIES)) throw new PreflightError("baseline_invalid");
  if (Object.values(baseline.protectedCategoryCounts).some((value) => !Number.isSafeInteger(value) || value < 0) || Object.values(baseline.protectedCategoryCounts).reduce((total, value) => total + value, 0) !== baseline.protectedCount) throw new PreflightError("baseline_invalid");
  validateForbiddenBaseline(baseline.forbiddenTableState);
  return baseline;
}

function targetBindingDigest({ project, database, deployment, origin }) {
  return createHash("sha256").update(JSON.stringify({ project, database, deployment, origin })).digest("hex");
}

function validateHostedTarget(options) {
  if (!SAFE_IDENTIFIER.test(options.project) || !SAFE_IDENTIFIER.test(options.deployment)
    || !SAFE_DATABASE_ID.test(options.database) || !isExactHttpsOrigin(options.origin)) {
    throw new PreflightError("target_binding_mismatch");
  }
}

function migrationState(rows) {
  const names = rows.map((row) => row?.migration_name);
  if (!names.every((name) => typeof name === "string" && SAFE_MIGRATION_NAME.test(name)) || new Set(names).size !== names.length) throw new PreflightError("hosted_output_invalid");
  return { names, ids: names.map((name) => name.slice(0, 4)) };
}

function forbiddenTableState(presentRows, counts) {
  const present = presentRows.map((row) => row?.name);
  if (present.some((name) => !PHASE2_FORBIDDEN_TABLE_NAMES.includes(name)) || new Set(present).size !== present.length) throw new PreflightError("hosted_output_invalid");
  return Object.fromEntries(PHASE2_FORBIDDEN_TABLES.map(({ name, countAlias }) => {
    const exists = present.includes(name);
    return [name, { present: exists, count: exists && countAlias ? integer(counts, countAlias) : null }];
  }));
}

function invariantState(rowsByKey) {
  if (rowsByKey.counts.length !== 1) throw new PreflightError("hosted_output_invalid");
  const migrations = migrationState(rowsByKey.migrations);
  const counts = rowsByKey.counts[0];
  const protectedRows = PROTECTED_QUERIES.flatMap(({ key, category }) => rowsByKey[key].map((row) => ({ category, value: row?.value })));
  return {
    migrationNames: migrations.names,
    migrationIds: migrations.ids,
    protected: protectedSummary(protectedRows),
    workspaceCount: integer(counts, "workspace_count"),
    boundHistorianCount: integer(counts, "bound_historian_count"),
    legacyUnboundCount: integer(counts, "legacy_unbound_count"),
    foreignKeyViolations: rowsByKey.foreignKeys.length,
    forbiddenTableState: forbiddenTableState(rowsByKey.forbiddenTables, counts),
    counts,
  };
}

function expectedOldForbiddenState() {
  return Object.fromEntries(PHASE2_FORBIDDEN_TABLES.map(({ name, oldSchema }) => [name, oldSchema === "present" ? { present: true, count: 0 } : { present: false, count: null }]));
}

function expectedPostForbiddenState(baseline) {
  return Object.fromEntries(PHASE2_FORBIDDEN_TABLES.map(({ name, postMigration }) => {
    if (postMigration === "present_empty") return [name, { present: true, count: 0 }];
    return [name, baseline.forbiddenTableState[name]];
  }));
}

function evaluateOldSchema(state) {
  const ok = canonicalEqual(state.migrationNames, OLD_MIGRATIONS)
    && state.workspaceCount === 1
    && state.foreignKeyViolations === 0
    && canonicalEqual(state.forbiddenTableState, expectedOldForbiddenState());
  if (!ok) throw new PreflightError("old_schema_invariant_mismatch");
}

function evaluatePostMigration(state, baseline) {
  const counts = state.counts;
  const csrf = csrfTokenState(counts);
  const ok = canonicalEqual(state.migrationNames, PHASE2_MIGRATIONS)
    && state.protected.digest === baseline.protectedDigest
    && state.protected.count === baseline.protectedCount
    && canonicalEqual(state.protected.categoryCounts, baseline.protectedCategoryCounts)
    && state.workspaceCount === baseline.workspaceCount
    && state.boundHistorianCount === baseline.boundHistorianCount
    && state.legacyUnboundCount === baseline.legacyUnboundCount
    && state.foreignKeyViolations === baseline.foreignKeyViolations
    && canonicalEqual(state.forbiddenTableState, expectedPostForbiddenState(baseline))
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
    && integer(counts, "consensus_gate_count") === 0
    && csrf.total === csrf.used + csrf.unused;
  if (!ok) throw new PreflightError("post_migration_invariant_mismatch");
}

function evidenceDigest(state) {
  const counts = Object.fromEntries(Object.entries(state.counts)
    .filter(([key]) => !["csrf_token_count", "used_csrf_token_count", "unused_csrf_token_count"].includes(key))
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0));
  return createHash("sha256").update(JSON.stringify({
    migrationNames: state.migrationNames,
    protected: state.protected,
    workspaceCount: state.workspaceCount,
    boundHistorianCount: state.boundHistorianCount,
    legacyUnboundCount: state.legacyUnboundCount,
    foreignKeyViolations: state.foreignKeyViolations,
    forbiddenTableState: state.forbiddenTableState,
    counts,
  })).digest("hex");
}

function csrfTokenState(counts) {
  return {
    total: integer(counts, "csrf_token_count"),
    used: integer(counts, "used_csrf_token_count"),
    unused: integer(counts, "unused_csrf_token_count"),
  };
}

function hasExactCsrfConsumption(before, after) {
  const beforeCsrf = csrfTokenState(before.counts);
  const afterCsrf = csrfTokenState(after.counts);
  return beforeCsrf.unused >= 1
    && afterCsrf.total === beforeCsrf.total
    && afterCsrf.used === beforeCsrf.used + 1
    && afterCsrf.unused === beforeCsrf.unused - 1;
}

async function collectState(options, runner) {
  const rowsByKey = {};
  for (const command of buildPreflightCommands(options)) {
    let result;
    try {
      result = await runner(command);
    } catch {
      throw new PreflightError("hosted_query_failed");
    }
    rowsByKey[command.key] = parseRows(result?.stdout);
  }
  return options.mode === "inspect-gate" ? rowsByKey.counts : invariantState(rowsByKey);
}

function validateProbeResult(result, target, bindingDigest) {
  if (!hasExactKeys(result, ["status", "code", "method", "route", "origin", "targetBindingDigest"]) || !SAFE_DIGEST.test(result.targetBindingDigest)) throw new PreflightError("post_probe_invariant_mismatch");
  if (result.status !== 503 || result.code !== "phase2_writes_not_activated" || result.method !== "POST" || result.route !== "/api/knowledge" || result.origin !== target.origin || result.targetBindingDigest !== bindingDigest) throw new PreflightError("post_probe_invariant_mismatch");
}

function evaluateGate(rows) {
  if (rows.length !== 1 || integer(rows[0], "total_gate_count") !== 0 || integer(rows[0], "consensus_gate_count") !== 0) throw new PreflightError("gate_invariant_mismatch");
}

export async function runHostedPreflight({ options, baseline, runner, postProbe }) {
  try {
    if (options.mode === "inspect-gate") {
      evaluateGate(await collectState(options, runner));
      return SAFE_RESULTS.gateAbsent;
    }
    if (options.mode === "old-schema") {
      evaluateOldSchema(await collectState(options, runner));
      return SAFE_RESULTS.oldSchema;
    }

    validateHostedTarget(options);
    const validatedBaseline = validateBaseline(baseline);
    const bindingDigest = targetBindingDigest(options);
    if (bindingDigest !== validatedBaseline.targetBindingDigest) throw new PreflightError("target_binding_mismatch");
    const before = await collectState(options, runner);
    evaluatePostMigration(before, validatedBaseline);
    let probeResult;
    try {
      probeResult = await postProbe({ project: options.project, database: options.database, deployment: options.deployment, origin: options.origin, targetBindingDigest: bindingDigest });
    } catch {
      throw new PreflightError("post_probe_failed");
    }
    validateProbeResult(probeResult, options, bindingDigest);
    const after = await collectState(options, runner);
    if (evidenceDigest(after) !== evidenceDigest(before) || !hasExactCsrfConsumption(before, after)) throw new PreflightError("post_probe_effect_detected");
    evaluatePostMigration(after, validatedBaseline);
    return SAFE_RESULTS.postMigration;
  } catch (error) {
    return blocked(error instanceof PreflightError ? error.code : "hosted_output_invalid");
  }
}

async function nativeRunner(command) {
  return execFile("npx", ["wrangler", ...command.args], { cwd: new URL("..", import.meta.url), maxBuffer: 4 * 1024 * 1024 });
}

async function nativeLoadPostProbe(adapterPath) {
  const adapter = await import(pathToFileURL(adapterPath).href);
  if (typeof adapter.buildKnowledgePostRequest !== "function") throw new Error("post_probe_adapter_invalid");
  return async (target) => {
    const requestInit = await adapter.buildKnowledgePostRequest(Object.freeze({ ...target }));
    if (!hasExactKeys(requestInit, ["headers", "body"]) || typeof requestInit.body !== "string" || Buffer.byteLength(requestInit.body, "utf8") > 8192) throw new Error("post_probe_request_invalid");
    const headers = new Headers(requestInit.headers);
    const url = `${target.origin}/api/knowledge`;
    const response = await fetch(url, { method: "POST", headers, body: requestInit.body, redirect: "error" });
    const contentLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > 4096) throw new Error("post_probe_response_too_large");
    const rawBody = await response.text();
    if (Buffer.byteLength(rawBody, "utf8") > 4096) throw new Error("post_probe_response_too_large");
    const body = JSON.parse(rawBody);
    return {
      status: response.status,
      code: body?.error,
      method: "POST",
      route: "/api/knowledge",
      origin: target.origin,
      targetBindingDigest: target.targetBindingDigest,
    };
  };
}

async function readBaselineFile(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

export async function runPreflightCli({ argv, stdout, stderr, runner = nativeRunner, postProbe, readBaseline = readBaselineFile, loadPostProbe = nativeLoadPostProbe }) {
  let options;
  try {
    options = parsePreflightArgs(argv);
  } catch {
    const result = blocked("invalid_arguments");
    stderr.write(`${JSON.stringify(result)}\n`);
    return 1;
  }
  if (options.help) {
    stdout.write(HELP);
    return 0;
  }
  let baseline;
  if (options.baseline) {
    try {
      baseline = await readBaseline(options.baseline);
    } catch {
      const result = blocked("baseline_invalid");
      stderr.write(`${JSON.stringify(result)}\n`);
      return 1;
    }
  }
  let effectivePostProbe = postProbe;
  if (options.mode === "post-migration" && !effectivePostProbe) {
    try {
      effectivePostProbe = await loadPostProbe(options.postProbeAdapter);
    } catch {
      const result = blocked("post_probe_failed");
      stderr.write(`${JSON.stringify(result)}\n`);
      return 1;
    }
  }
  const result = await runHostedPreflight({ options, baseline, runner, postProbe: effectivePostProbe });
  const output = `${JSON.stringify(result)}\n`;
  if (result.ok) stdout.write(output);
  else stderr.write(output);
  return result.ok ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runPreflightCli({ argv: process.argv.slice(2), stdout: process.stdout, stderr: process.stderr }).then((exitCode) => {
    process.exitCode = exitCode;
  }).catch(() => {
    process.stderr.write(`${JSON.stringify(blocked("hosted_output_invalid"))}\n`);
    process.exitCode = 1;
  });
}
