import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { lstatSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { GREENFIELD_REQUIRED_EMPTY_TABLES } from "./greenfield-baseline-contract.mjs";
import { CANONICAL_MIGRATION_COUNT, CANONICAL_MIGRATION_HEAD } from "./migration-chain.mjs";

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
assert.deepEqual(
  Object.keys(counts),
  [...GREENFIELD_REQUIRED_EMPTY_TABLES],
  "greenfield_required_table_set_mismatch",
);
for (const [table, count] of Object.entries(counts)) {
  assert.equal(count, 0, `greenfield_nonempty:${table}`);
}

process.stdout.write(`${JSON.stringify({
  status: "ready",
  baselineKind: "greenfield-local",
  migrationSource: "checked-repository-chain",
  migrationCount: CANONICAL_MIGRATION_COUNT,
  migrationHead: CANONICAL_MIGRATION_HEAD,
  originalProjectEvidence: "waived-unavailable",
  originalProjectMigrationClaim: "none",
  hostedEvidence: false,
  disposable: true,
  rowCounts: counts,
})}\n`);

function queryCounts(state) {
  const projections = GREENFIELD_REQUIRED_EMPTY_TABLES.map((table) => {
    assert.match(table, /^[a-z][a-z0-9_]*$/, `greenfield_table_name_invalid:${table}`);
    return `(SELECT COUNT(*) FROM ${table}) AS ${table}`;
  });
  const sql = `SELECT ${projections.join(", ")};`;
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
