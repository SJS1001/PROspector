import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { OPERATOR_JOURNEY_E1_MIGRATIONS } from "./operator-journey-browser-boundary.mjs";

const root = resolve(import.meta.dirname, "..");

/* Decide the `PRAGMA foreign_key_check` result from `wrangler d1 execute --json`.
 * Only a parsed envelope whose first statement carries an empty results array
 * passes; a non-zero exit, unreadable output, an unexpected shape, or any
 * violation row fails closed. */
export function assertForeignKeyCheckClean({ status, stdout }) {
  const code = "e1_foreign_key_check_failed";
  if (status !== 0) throw new Error(`${code}:exit`);
  let payload;
  try { payload = JSON.parse(stdout); } catch { throw new Error(`${code}:unreadable`); }
  const results = Array.isArray(payload) ? payload[0]?.results : undefined;
  if (!Array.isArray(results)) throw new Error(`${code}:unreadable`);
  if (results.length > 0) throw new Error(`${code}:violations:${results.length}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const state = requiredAfter("--state");
  const config = requiredAfter("--config");
  assert.equal(isAbsolute(state), true, "E1 state must be absolute");
  assert.equal(isAbsolute(config), true, "E1 config must be absolute");
  const local = await realpath(resolve(root, ".local"));
  assertInside(local, await realpath(resolve(state, "..")));

  for (const migration of OPERATOR_JOURNEY_E1_MIGRATIONS) {
    const result = spawnSync(resolve(root, "node_modules", ".bin", "wrangler"), [
      "d1", "execute", "DB", "--local", "--persist-to", state, "--config", config,
      "--file", resolve(root, "drizzle", migration),
    ], { cwd: root, env: process.env, encoding: "utf8" });
    if (result.status !== 0) throw new Error(`e1_migration_failed:${migration}:${result.stderr.slice(-2000)}`);
  }
  const check = spawnSync(resolve(root, "node_modules", ".bin", "wrangler"), [
    "d1", "execute", "DB", "--local", "--persist-to", state, "--config", config,
    "--json", "--command", "PRAGMA foreign_key_check;",
  ], { cwd: root, env: process.env, encoding: "utf8" });
  assertForeignKeyCheckClean(check);
  process.stdout.write(`${JSON.stringify({ status: "ready", migrationCount: OPERATOR_JOURNEY_E1_MIGRATIONS.length, synthetic: true })}\n`);
}

function requiredAfter(flag) {
  const index = process.argv.indexOf(flag);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value) throw new Error(`${flag.slice(2)}_required`);
  return resolve(value);
}
function assertInside(parent, child) {
  const path = relative(parent, child);
  if (!path || path === ".." || path.startsWith(`..${sep}`) || resolve(parent, path) !== child) throw new Error("e1_state_path_invalid");
}
