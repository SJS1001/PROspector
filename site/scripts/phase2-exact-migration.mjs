import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const SAFE_DATABASE = /^[A-Za-z0-9_-]{1,96}$/u;
const SAFE_DATABASE_ID = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/u;
const SAFE_DIGEST = /^[a-f0-9]{64}$/u;

export async function buildExact0004MigrationApply({ databaseName, databaseId, reviewedMigrationDigest }) {
  if (!SAFE_DATABASE.test(databaseName) || !SAFE_DATABASE_ID.test(databaseId) || !SAFE_DIGEST.test(reviewedMigrationDigest)) throw new Error("invalid_migration_apply_input");
  const migration = await readFile(new URL("../drizzle/0004_consensus_knowledge.sql", import.meta.url));
  const actualDigest = createHash("sha256").update(migration).digest("hex");
  if (actualDigest !== reviewedMigrationDigest) throw new Error("migration_digest_mismatch");
  const configPath = fileURLToPath(new URL("../.wrangler/phase2-0004.wrangler.json", import.meta.url));
  return {
    configPath,
    config: {
      name: "prospector-phase2-migration-0004",
      compatibility_date: "2026-07-30",
      d1_databases: [{
        binding: "DB",
        database_name: databaseName,
        database_id: databaseId,
        migrations_dir: "../drizzle",
        migrations_pattern: "../drizzle/0004_consensus_knowledge.sql",
      }],
    },
    command: { args: ["d1", "migrations", "apply", "DB", "--remote", "--config", configPath] },
  };
}
