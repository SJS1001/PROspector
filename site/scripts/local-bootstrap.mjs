import { mkdir, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { CANONICAL_MIGRATION_FILENAMES, CANONICAL_MIGRATION_HEAD } from "./migration-chain.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const requestedState = process.argv.indexOf("--state");
const STATE = requestedState >= 0 && process.argv[requestedState + 1]
  ? resolve(ROOT, process.argv[requestedState + 1])
  : resolve(ROOT, ".local", "miniflare-state");
if (!STATE.startsWith(resolve(ROOT, ".local") + "/")) throw new Error("local_state_path_invalid");
// The checked journal is the single source of truth for the chain; a local
// bootstrap that stops short of its head is a defect, not a boundary.
const MIGRATIONS = CANONICAL_MIGRATION_FILENAMES;

if (!process.argv.includes("--reset")) {
  throw new Error("local_reset_required: run npm run db:local:reset");
}

await mkdir(dirname(STATE), { recursive: true });
await rm(STATE, { recursive: true, force: true });
for (const migration of MIGRATIONS) {
  const result = spawnSync(resolve(ROOT, "node_modules", ".bin", "wrangler"), ["d1", "execute", "DB", "--local", "--persist-to", STATE, "--config", "wrangler.local.jsonc", "--file", resolve(ROOT, "drizzle", migration)], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`local_migration_failed:${migration}:${result.stderr.trim()}`);
}
const check = spawnSync(resolve(ROOT, "node_modules", ".bin", "wrangler"), ["d1", "execute", "DB", "--local", "--persist-to", STATE, "--config", "wrangler.local.jsonc", "--command", "PRAGMA foreign_key_check;"], { encoding: "utf8" });
if (check.status !== 0 || /\"results\":\[\[[^\]]/.test(check.stdout)) throw new Error("local_foreign_key_check_failed");
console.log(JSON.stringify({ status: "ready", state: STATE, migrationCount: MIGRATIONS.length, migrationHead: CANONICAL_MIGRATION_HEAD, migrationSource: "checked-repository-journal", disposable: true }));
