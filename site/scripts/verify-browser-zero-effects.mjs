import { strict as assert } from "node:assert";
import { readdir, realpath, stat } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { relative, resolve, sep } from "node:path";

import { PHASE2_FORBIDDEN_TABLE_NAMES } from "./phase2-hosted-contract.mjs";

const OPERATIONAL_TABLE_NAMES = Object.freeze([...new Set([
  ...PHASE2_FORBIDDEN_TABLE_NAMES,
  "phase_activation_gates",
  "market_play_proposal_decisions", "market_play_proposal_evidence", "market_play_proposal_lineage", "market_play_proposal_versions", "market_play_proposals",
  "private_synthetic_proof_authorizations", "private_synthetic_proof_consumptions",
  "product_configuration_lineage", "product_discovery_configuration_prerequisites", "product_discovery_run_events", "product_discovery_runs", "product_discovery_schedules", "product_discovery_submissions",
  "profile_configuration_activations", "profile_configuration_candidates", "profile_prospects", "prospect_cooldowns", "prospect_reentry_events", "prospect_review_decisions",
  "prospecting_candidates", "prospecting_run_events", "prospecting_runs", "prospecting_schedules", "prospecting_signals", "prospecting_source_lineage", "qualification_assessments", "runner_assignment_revocations", "runner_assignments", "runner_submissions",
  "contact_eligibility_snapshots", "contact_evidence_assignments", "contact_point_observations", "enrichment_budget_accounts", "enrichment_grant_issuance_events", "enrichment_grant_prospects", "enrichment_grants", "enrichment_reservation_budget_entries", "enrichment_reservation_events", "enrichment_reservations",
  "identity_decisions", "identity_lineage", "identity_suggestion_candidates", "identity_suggestion_impacts", "identity_suggestions", "provider_quotes", "runner_budget_accounts", "runner_spend_grants", "runner_spend_reservation_events", "runner_spend_reservations", "contact_verification_receipts",
])]);

const root = resolve(import.meta.dirname, "..");
const stateArgument = valueAfter("--state");
if (!stateArgument) throw new Error("browser_state_required");
const requireCompletion = !process.argv.includes("--allow-incomplete");
const localRoot = resolve(root, ".local");
const stateRoot = resolve(root, stateArgument);
assertInside(localRoot, stateRoot);

const resolvedLocal = await realpath(localRoot);
const resolvedState = await realpath(stateRoot);
assertInside(resolvedLocal, resolvedState);
assert.equal((await stat(resolvedState)).isDirectory(), true, "browser_state_not_directory");

const sqliteFiles = (await walk(resolvedState)).filter((path) => path.endsWith(".sqlite"));
let applicationDatabase = null;
let objectRows = 0;
let multipartRows = 0;
for (const path of sqliteFiles) {
  const database = new DatabaseSync(path, { readOnly: true });
  try {
    if (database.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='_mf_objects'").get()) {
      objectRows += Number(database.prepare("SELECT COUNT(*) AS count FROM _mf_objects").get().count);
    }
    if (database.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='_mf_multipart_uploads'").get()) {
      multipartRows += Number(database.prepare("SELECT COUNT(*) AS count FROM _mf_multipart_uploads").get().count);
    }
    const workspace = database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='workspaces'").get();
    if (workspace) {
      if (applicationDatabase) throw new Error("multiple_application_databases");
      applicationDatabase = { database, path };
      continue;
    }
  } finally {
    if (applicationDatabase?.database !== database) database.close();
  }
}
if (!applicationDatabase) throw new Error("application_database_not_found");

const forbidden = {};
try {
  assert.equal(objectRows, 0, "r2_objects_must_remain_empty");
  assert.equal(multipartRows, 0, "r2_multipart_uploads_must_remain_empty");
  for (const table of OPERATIONAL_TABLE_NAMES) {
    assert.match(table, /^[a-z][a-z0-9_]*$/);
    const present = Boolean(applicationDatabase.database.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table));
    const count = present ? Number(applicationDatabase.database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count) : 0;
    assert.equal(count, 0, `${table}_must_remain_empty`);
    forbidden[table] = { present, count };
  }
  const workspaceCount = Number(applicationDatabase.database.prepare("SELECT COUNT(*) AS count FROM workspaces").get().count);
  const confirmedFitCount = Number(applicationDatabase.database.prepare("SELECT COUNT(*) AS count FROM knowledge_versions WHERE status='confirmed' AND kind='fit'").get().count);
  if (requireCompletion) {
    assert.equal(workspaceCount, 1, "exactly_one_synthetic_workspace_required");
    assert.equal(confirmedFitCount, 1, "exactly_one_confirmed_fit_required");
  } else {
    assert.ok(workspaceCount >= 0 && workspaceCount <= 1, "bounded_synthetic_workspace_required");
    assert.ok(confirmedFitCount >= 0 && confirmedFitCount <= 1, "bounded_confirmed_fit_required");
  }
  process.stdout.write(`${JSON.stringify({ status: requireCompletion ? "passed" : "zero-effects-only", synthetic: true, workspaceCount, confirmedFitCount, forbiddenRows: 0, objectRows, multipartRows, forbidden })}\n`);
} finally {
  applicationDatabase.database.close();
}

function valueAfter(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function assertInside(parent, child) {
  const path = relative(parent, child);
  if (!path || path.startsWith(`..${sep}`) || path === ".." || resolve(parent, path) !== child) throw new Error("browser_state_path_invalid");
}

async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error("browser_state_symlink_forbidden");
    if (entry.isDirectory()) files.push(...await walk(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}
