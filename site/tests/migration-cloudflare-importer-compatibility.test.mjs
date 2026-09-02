import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const migrationDirectory = new URL("../drizzle/", import.meta.url);

test("remote D1 trigger statements contain only their outer compound terminator", async () => {
  const migrations = (await readdir(migrationDirectory))
    .filter((file) => /^\d{4}[^/]*\.sql$/.test(file))
    .sort();

  assert.ok(migrations.length > 0, "the checked migration chain must not be empty");
  for (const migration of migrations) {
    const sql = await readFile(new URL(migration, migrationDirectory), "utf8");
    const triggers = sql
      .split("--> statement-breakpoint")
      .filter((statement) => /^\s*CREATE\s+TRIGGER\b/i.test(statement));

    for (const statement of triggers) {
      const compoundTerminators = statement.match(/\bEND\s*;/gi) ?? [];
      assert.equal(
        compoundTerminators.length,
        1,
        `${migration} contains a trigger with ${compoundTerminators.length} END; tokens; inner compound terminators can be mistaken for the outer trigger END by the remote D1 importer`,
      );
    }
  }
});
