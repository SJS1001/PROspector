import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { lstatSync } from "node:fs";
import { relative, resolve, sep } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const stateIndex = process.argv.indexOf("--state");
const requestedState = stateIndex >= 0 ? process.argv[stateIndex + 1] : ".local/greenfield-baseline-state";
if (!process.argv.includes("--reset")) throw new Error("greenfield_reset_required");
if (!requestedState) throw new Error("greenfield_state_required");

const statePath = resolve(ROOT, requestedState);
const localRoot = resolve(ROOT, ".local");
const stateRelative = relative(localRoot, statePath);
if (!stateRelative || stateRelative.startsWith("..") || stateRelative.includes(sep)) {
  throw new Error("greenfield_state_path_invalid");
}
rejectSymlink(localRoot);
rejectSymlink(statePath);

run(process.execPath, ["scripts/local-bootstrap.mjs", "--reset", "--state", requestedState]);
const counts = queryCounts(statePath);
for (const [table, count] of Object.entries(counts)) {
  assert.equal(count, 0, `greenfield_nonempty:${table}`);
}

process.stdout.write(`${JSON.stringify({
  status: "ready",
  baselineKind: "greenfield-local",
  migrationSource: "checked-repository-chain",
  originalProjectEvidence: "waived-unavailable",
  originalProjectMigrationClaim: "none",
  hostedEvidence: false,
  disposable: true,
  rowCounts: counts,
})}\n`);

function queryCounts(state) {
  const sql = [
    "SELECT",
    "(SELECT COUNT(*) FROM workspaces) AS workspaces,",
    "(SELECT COUNT(*) FROM phase_activation_gates) AS phase_activation_gates,",
    "(SELECT COUNT(*) FROM product_discovery_runs) AS product_discovery_runs,",
    "(SELECT COUNT(*) FROM prospects) AS prospects,",
    "(SELECT COUNT(*) FROM enrichment_grants) AS enrichment_grants,",
    "(SELECT COUNT(*) FROM contact_point_observations) AS contact_point_observations,",
    "(SELECT COUNT(*) FROM suppressions) AS suppressions;",
  ].join(" ");
  const result = run(resolve(ROOT, "node_modules/.bin/wrangler"), [
    "d1", "execute", "DB", "--local", "--persist-to", state,
    "--config", "wrangler.local.jsonc", "--command", sql,
  ]);
  const payload = parseJsonArray(result.stdout);
  const row = payload?.[0]?.results?.[0];
  if (!row || typeof row !== "object") throw new Error("greenfield_count_output_invalid");
  return Object.fromEntries(Object.entries(row).map(([key, value]) => {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error(`greenfield_count_invalid:${key}`);
    return [key, value];
  }));
}

function parseJsonArray(output) {
  const start = output.indexOf("[");
  const end = output.lastIndexOf("]");
  if (start < 0 || end < start) throw new Error("greenfield_count_output_invalid");
  return JSON.parse(output.slice(start, end + 1));
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, WRANGLER_LOG_PATH: ".wrangler/wrangler.log" },
  });
  if (result.status !== 0) throw new Error(`greenfield_command_failed:${result.status}`);
  return result;
}

function rejectSymlink(path) {
  try {
    if (lstatSync(path).isSymbolicLink()) throw new Error("greenfield_state_path_symlink");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}
