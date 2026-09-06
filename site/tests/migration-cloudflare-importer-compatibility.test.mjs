import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { createD1Fixture } from "./helpers/d1.mjs";

const migrationDirectory = new URL("../drizzle/", import.meta.url);

async function checkedMigrationChain() {
  return (await readdir(migrationDirectory))
    .filter((file) => /^\d{4}[^/]*\.sql$/.test(file))
    .sort();
}

async function applyCheckedMigrationChain(database, migrations) {
  for (const migration of migrations) {
    const sql = await readFile(new URL(migration, migrationDirectory), "utf8");
    for (const statement of sql.split("--> statement-breakpoint").map((value) => value.trim()).filter(Boolean)) {
      await database.prepare(statement).run();
    }
  }
}

test("remote D1 trigger statements contain only their outer compound terminator", async () => {
  const migrations = await checkedMigrationChain();

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
      if (migration === "0018_massive_blizzard.sql") {
        assert.doesNotMatch(
          statement,
          /\bCASE\b/i,
          "0018 must not reintroduce the original nested CASE/END importer shape",
        );
      }
    }
  }
});

test("the checked local D1 verifier imports the complete migration chain through 0018", async () => {
  const fixture = await createD1Fixture("migration-cloudflare-importer-compatibility");
  try {
    const migrations = await checkedMigrationChain();
    assert.equal(migrations.at(-1), "0018_massive_blizzard.sql");
    await applyCheckedMigrationChain(fixture.database, migrations);
    const foreignKeys = await fixture.database.prepare("PRAGMA foreign_key_check").all();
    assert.deepEqual(foreignKeys.results, []);
    const triggerCount = await fixture.database.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'trigger'").first();
    assert.ok(Number(triggerCount.count) >= 37, "0018 generation guards must import into local D1");
  } finally {
    await fixture.dispose();
  }
});

test("0018 preserves generation increments and rejects guarded overflow", async () => {
  const fixture = await createD1Fixture("migration-cloudflare-importer-semantics");
  try {
    await applyCheckedMigrationChain(fixture.database, await checkedMigrationChain());
    await fixture.database.prepare("INSERT INTO workspaces (id, company_name, owner_subject, created_at, updated_at, revision) VALUES ('workspace-0018', 'Test', 'owner-0018', 1, 1, 1)").run();
    await fixture.database.prepare("UPDATE workspaces SET owner_subject = 'owner-0018-next' WHERE id = 'workspace-0018'").run();
    assert.deepEqual(
      await fixture.database.prepare("SELECT contacts_generation, identity_generation, approved_generation FROM contacts_projection_generations WHERE workspace_id = 'workspace-0018'").first(),
      { contacts_generation: 0, identity_generation: 0, approved_generation: 1 },
    );
    await fixture.database.prepare("UPDATE workspaces SET owner_subject = 'owner-0018-final' WHERE id = 'workspace-0018'").run();
    assert.deepEqual(
      await fixture.database.prepare("SELECT contacts_generation, identity_generation, approved_generation FROM contacts_projection_generations WHERE workspace_id = 'workspace-0018'").first(),
      { contacts_generation: 0, identity_generation: 0, approved_generation: 2 },
    );
    await fixture.database.prepare("UPDATE contacts_projection_generations SET approved_generation = 9007199254740990 WHERE workspace_id = 'workspace-0018'").run();
    await assert.rejects(
      fixture.database.prepare("UPDATE workspaces SET owner_subject = 'owner-0018-overflow' WHERE id = 'workspace-0018'").run(),
      /contacts projection generation exhausted/,
    );
    assert.deepEqual(
      await fixture.database.prepare("SELECT owner_subject FROM workspaces WHERE id = 'workspace-0018'").first(),
      { owner_subject: "owner-0018-final" },
      "the guarded source update rolls back with its generation increment",
    );
  } finally {
    await fixture.dispose();
  }
});
