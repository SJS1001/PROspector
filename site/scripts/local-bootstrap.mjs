import { mkdir, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const STATE = resolve(ROOT, ".local", "miniflare-state");
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

await mkdir(dirname(STATE), { recursive: true });
await rm(STATE, { recursive: true, force: true });
for (const migration of MIGRATIONS) {
  const result = spawnSync(resolve(ROOT, "node_modules", ".bin", "wrangler"), ["d1", "execute", "DB", "--local", "--persist-to", STATE, "--config", "wrangler.local.jsonc", "--file", resolve(ROOT, "drizzle", migration)], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`local_migration_failed:${migration}:${result.stderr.trim()}`);
}
const check = spawnSync(resolve(ROOT, "node_modules", ".bin", "wrangler"), ["d1", "execute", "DB", "--local", "--persist-to", STATE, "--config", "wrangler.local.jsonc", "--command", "PRAGMA foreign_key_check;"], { encoding: "utf8" });
if (check.status !== 0 || /\"results\":\[\[[^\]]/.test(check.stdout)) throw new Error("local_foreign_key_check_failed");
console.log(JSON.stringify({ status: "ready", state: ".local/miniflare-state", migrationCount: MIGRATIONS.length, disposable: true }));
