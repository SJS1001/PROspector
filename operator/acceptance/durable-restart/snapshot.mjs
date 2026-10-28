// Read only, after the server is fully stopped; opens the same physical PGlite.
import { PGlite } from "@electric-sql/pglite";
import { join } from "node:path";
import { writeFileSync } from "node:fs";
const pg = new PGlite(join(process.env.OPERATOR_DATA_DIR, "database"));
try {
  const tables = (
    await pg.query("select tablename from pg_tables where schemaname='public' order by tablename")
  ).rows;
  const snapshot = {};
  for (const { tablename } of tables) {
    if (!/^[a-z_]+$/.test(tablename)) throw new Error("Unexpected table");
    // Auth-session activity is intentionally compared separately over HTTP.
    if (["operator_secrets", "session", "account", "verification"].includes(tablename)) continue;
    snapshot[tablename] = (await pg.query(`select * from "${tablename}"`)).rows
      .map((row) => JSON.stringify(row))
      .sort();
  }
  // Ciphertext is compared by digest only; never emit credentials or owner files.
  const { createHash } = await import("node:crypto");
  snapshot.secretDigest = createHash("sha256")
    .update(JSON.stringify((await pg.query("select * from operator_secrets order by name")).rows))
    .digest("hex");
  writeFileSync(process.argv[2], JSON.stringify(snapshot), { mode: 0o600 });
} finally {
  await pg.close();
}
