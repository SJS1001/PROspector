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
/* The chain is forward-only: no migration is guarded, and 0001 rebuilds a table
 * by dropping the original, so replaying these files over an existing schema
 * destroys it. Only the wipe above makes that safe, so prove the wipe took
 * effect rather than assuming it: an occupied target is never migrated. */
const existing = readRows(wrangler(["--json", "--command", "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%';"]), "local_state_probe_failed");
if (existing.length > 0) throw new Error(`local_state_not_empty:${existing.length}`);
for (const migration of MIGRATIONS) {
  const result = spawnSync(resolve(ROOT, "node_modules", ".bin", "wrangler"), ["d1", "execute", "DB", "--local", "--persist-to", STATE, "--config", "wrangler.local.jsonc", "--file", resolve(ROOT, "drizzle", migration)], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`local_migration_failed:${migration}:${result.stderr.trim()}`);
}
const violations = readRows(wrangler(["--json", "--command", "PRAGMA foreign_key_check;"]), "local_foreign_key_check_failed");
if (violations.length > 0) throw new Error(`local_foreign_key_check_failed:${violations.length}`);
console.log(JSON.stringify({ status: "ready", state: STATE, migrationCount: MIGRATIONS.length, migrationHead: CANONICAL_MIGRATION_HEAD, migrationChainSource: "checked-repository-journal", disposable: true }));

function wrangler(args) {
  const result = spawnSync(resolve(ROOT, "node_modules", ".bin", "wrangler"), ["d1", "execute", "DB", "--local", "--persist-to", STATE, "--config", "wrangler.local.jsonc", ...args], { encoding: "utf8" });
  return result.status === 0 ? result.stdout : null;
}

/* Read the rows wrangler actually returns.  An envelope this cannot parse is a
 * failed check, never a pass: a violation must not be able to hide behind an
 * output shape the caller does not recognise. */
function readRows(output, code) {
  let payload;
  try { payload = JSON.parse(output); } catch { throw new Error(`${code}:unreadable`); }
  const results = Array.isArray(payload) ? payload[0]?.results : undefined;
  if (!Array.isArray(results)) throw new Error(`${code}:unreadable`);
  return results;
}
