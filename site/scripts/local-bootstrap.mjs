import { mkdir, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const DATABASE = resolve(ROOT, ".local", "prospector.sqlite");
const MIGRATIONS = [
  "0000_jittery_meteorite.sql", "0001_true_spencer_smythe.sql",
  "0002_eager_supreme_intelligence.sql", "0003_acoustic_magik.sql",
  "0004_consensus_knowledge.sql", "0005_even_mastermind.sql",
  "0006_private-proof-run-binding.sql", "0007_profile_prospecting.sql",
  "0008_controlled_enrichment.sql", "0009_gorgeous_captain_universe.sql",
];

if (!process.argv.includes("--reset")) {
  throw new Error("local_reset_required: run npm run db:local:reset");
}

await mkdir(dirname(DATABASE), { recursive: true });
await rm(DATABASE, { force: true });
for (const migration of MIGRATIONS) {
  const result = spawnSync("sqlite3", [DATABASE], {
    input: await (await import("node:fs/promises")).readFile(resolve(ROOT, "drizzle", migration)),
    encoding: "utf8",
  });
  if (result.status !== 0) throw new Error(`local_migration_failed:${migration}:${result.stderr.trim()}`);
}
const check = spawnSync("sqlite3", [DATABASE, "PRAGMA foreign_key_check;"], { encoding: "utf8" });
if (check.status !== 0 || check.stdout.trim()) throw new Error("local_foreign_key_check_failed");
const tables = spawnSync("sqlite3", [DATABASE, "SELECT count(*) FROM sqlite_master WHERE type='table';"], { encoding: "utf8" });
if (tables.status !== 0 || Number(tables.stdout.trim()) < 40) throw new Error("local_schema_incomplete");
console.log(JSON.stringify({ status: "ready", database: ".local/prospector.sqlite", migrationCount: MIGRATIONS.length, disposable: true }));
