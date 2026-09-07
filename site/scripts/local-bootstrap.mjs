import { mkdir, readFile, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const requestedState = process.argv.indexOf("--state");
const STATE = requestedState >= 0 && process.argv[requestedState + 1]
  ? resolve(ROOT, process.argv[requestedState + 1])
  : resolve(ROOT, ".local", "miniflare-state");
if (!STATE.startsWith(resolve(ROOT, ".local") + "/")) throw new Error("local_state_path_invalid");
// Derived from the checked Drizzle journal so an appended migration is applied
// here without a second list to keep in step.
const MIGRATIONS = await readJournalMigrations();

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
console.log(JSON.stringify({ status: "ready", state: STATE, migrationCount: MIGRATIONS.length, disposable: true }));

async function readJournalMigrations() {
  let journal;
  try {
    journal = JSON.parse(await readFile(resolve(ROOT, "drizzle", "meta", "_journal.json"), "utf8"));
  } catch {
    throw new Error("local_migration_journal_invalid");
  }
  const entries = journal?.entries;
  if (!Array.isArray(entries) || entries.length === 0) throw new Error("local_migration_journal_invalid");
  return entries
    .map((entry) => {
      if (!Number.isInteger(entry?.idx) || !/^\d{4}_[a-z0-9_-]+$/iu.test(entry?.tag ?? "")) {
        throw new Error("local_migration_journal_invalid");
      }
      return entry;
    })
    .sort((left, right) => left.idx - right.idx)
    .map((entry) => `${entry.tag}.sql`);
}
