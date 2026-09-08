import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { Miniflare } from "miniflare";
import { CANONICAL_MIGRATION_FILENAMES } from "../scripts/migration-chain.mjs";

/**
 * Whole-chain proof. Every other migration suite covers one migration or a
 * prefix, so nothing checked that the complete checked chain applies cleanly or
 * that what it builds still matches the snapshot drizzle generated from it.
 * It drives the canonical chain, so a new migration is covered the moment it is
 * checked in.
 */

/* Tables that declare no foreign key of their own. PRAGMA foreign_key_check
 * cannot police a relationship that was never declared, so a clean check is
 * evidence about the other tables only. Pinned so that adding another
 * unconstrained table is a deliberate decision rather than a silent one. */
const TABLES_WITHOUT_DECLARED_FOREIGN_KEYS = [
  "audit_events", "authority_commands", "companies", "csrf_tokens",
  "import_batches", "import_items", "interview_sessions", "products",
  "prospects", "sources", "suppressions", "typed_configurations", "workspaces",
];

test("the complete checked chain applies cleanly and builds exactly the snapshot schema", async () => {
  const { database, dispose } = await freshDatabase("chain-schema-proof");
  try {
    let applied = 0;
    for (const filename of CANONICAL_MIGRATION_FILENAMES) {
      for (const statement of await statements(filename)) {
        await database.prepare(statement).run();
        applied += 1;
      }
    }
    assert.ok(applied > 0, "the checked chain must contain statements");

    const violations = (await database.prepare("PRAGMA foreign_key_check").all()).results;
    assert.deepEqual(violations, [], "the chain must leave no foreign-key violation");

    const head = CANONICAL_MIGRATION_FILENAMES.at(-1).slice(0, 4);
    const snapshot = JSON.parse(await readFile(new URL(`../drizzle/meta/${head}_snapshot.json`, import.meta.url), "utf8"));
    const live = (await database.prepare("SELECT type, name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'").all()).results;
    const liveTables = new Set(live.filter((row) => row.type === "table").map((row) => row.name));
    const liveIndexes = new Set(live.filter((row) => row.type === "index").map((row) => row.name));

    const declared = Object.values(snapshot.tables).map((table) => table.name).sort();
    assert.deepEqual([...liveTables].sort(), declared, "the applied chain and its snapshot must declare the same tables");

    for (const table of Object.values(snapshot.tables)) {
      const columns = (await database.prepare(`PRAGMA table_info(${table.name})`).all()).results.map((column) => column.name).sort();
      assert.deepEqual(columns, Object.values(table.columns).map((column) => column.name).sort(), `${table.name} columns must match the snapshot`);
      for (const declaredIndex of Object.values(table.indexes ?? {})) {
        assert.ok(liveIndexes.has(declaredIndex.name), `${declaredIndex.name} must exist after applying the chain`);
      }
    }

    const unconstrained = Object.values(snapshot.tables)
      .filter((table) => Object.keys(table.foreignKeys ?? {}).length === 0)
      .map((table) => table.name).sort();
    assert.deepEqual(unconstrained, TABLES_WITHOUT_DECLARED_FOREIGN_KEYS,
      "a clean foreign-key check covers only tables that declare a foreign key; extending this set needs a decision");
  } finally {
    await dispose();
  }
});

/**
 * The chain is forward-only and journal-tracked: no migration is guarded with
 * IF NOT EXISTS, and 0001 rebuilds a table by dropping the original. Applying
 * the checked files to a database that already holds them therefore destroys
 * schema rather than no-opping, which is why every checked path builds a fresh
 * database instead of re-running files over a live one. This pins that
 * property so re-application is never mistaken for a safe repair.
 */
test("re-applying the checked files destroys schema, so only a fresh database may be built", async () => {
  const { database, dispose } = await freshDatabase("chain-reapply-hazard");
  try {
    /* Five files: 0004's backfill is what lets 0001's rebuild re-run far
     * enough to drop the original table. Shorter replays fail earlier and
     * leave the schema intact, which would understate the hazard. */
    const prefix = CANONICAL_MIGRATION_FILENAMES.slice(0, 5);
    for (const filename of prefix) {
      for (const statement of await statements(filename)) await database.prepare(statement).run();
    }
    assert.ok(await tableExists(database, "interview_questions"), "the prefix builds the table 0001 rebuilds");

    let refused = 0;
    for (const filename of prefix) {
      for (const statement of await statements(filename)) {
        try { await database.prepare(statement).run(); } catch { refused += 1; }
      }
    }
    assert.ok(refused > 0, "re-applied DDL must fail rather than silently succeed");
    assert.equal(await tableExists(database, "interview_questions"), false,
      "0001's rebuild drops the original table on a second pass: re-application is destructive, not idempotent");
    assert.ok(await tableExists(database, "__new_interview_questions"),
      "and leaves the rebuild's staging table behind");
  } finally {
    await dispose();
  }
});

async function freshDatabase(name) {
  const miniflare = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok') } }",
    d1Databases: { DB: name },
  });
  return { database: await miniflare.getD1Database("DB"), dispose: () => miniflare.dispose() };
}

async function statements(filename) {
  const sql = await readFile(new URL(`../drizzle/${filename}`, import.meta.url), "utf8");
  return sql.split("--> statement-breakpoint").map((statement) => statement.trim()).filter(Boolean);
}

async function tableExists(database, name) {
  return !!await database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?").bind(name).first();
}
