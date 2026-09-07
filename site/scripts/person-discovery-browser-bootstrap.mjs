import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { PERSON_DISCOVERY_C4_MIGRATIONS } from "./person-discovery-browser-boundary.mjs";

const root = resolve(import.meta.dirname, "..");
const state = requiredAfter("--state");
const config = requiredAfter("--config");
assert.equal(isAbsolute(state), true, "C4 state must be absolute");
assert.equal(isAbsolute(config), true, "C4 config must be absolute");
const local = await realpath(resolve(root, ".local"));
assertInside(local, await realpath(resolve(state, "..")));

for (const migration of PERSON_DISCOVERY_C4_MIGRATIONS) {
  const result = spawnSync(resolve(root, "node_modules", ".bin", "wrangler"), [
    "d1", "execute", "DB", "--local", "--persist-to", state, "--config", config,
    "--file", resolve(root, "drizzle", migration),
  ], { cwd: root, env: process.env, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`c4_migration_failed:${migration}:${result.stderr.slice(-2000)}`);
}
const check = spawnSync(resolve(root, "node_modules", ".bin", "wrangler"), [
  "d1", "execute", "DB", "--local", "--persist-to", state, "--config", config,
  "--command", "PRAGMA foreign_key_check;",
], { cwd: root, env: process.env, encoding: "utf8" });
if (check.status !== 0 || /\"results\":\[\[[^\]]/.test(check.stdout)) throw new Error("c4_foreign_key_check_failed");
process.stdout.write(`${JSON.stringify({ status: "ready", migrationCount: PERSON_DISCOVERY_C4_MIGRATIONS.length, synthetic: true })}\n`);

function requiredAfter(flag) {
  const index = process.argv.indexOf(flag);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value) throw new Error(`${flag.slice(2)}_required`);
  return resolve(value);
}
function assertInside(parent, child) {
  const path = relative(parent, child);
  if (!path || path === ".." || path.startsWith(`..${sep}`) || resolve(parent, path) !== child) throw new Error("c4_state_path_invalid");
}
