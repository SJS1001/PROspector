import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("0011 changes only candidate observation predicates in the three current authority guards", async () => {
  const read = (name) => readFile(new URL(`../drizzle/${name}`, import.meta.url), "utf8");
  const [base, upgrade, candidate] = await Promise.all([
    read("0008_controlled_enrichment.sql"), read("0009_gorgeous_captain_universe.sql"),
    read("0011_enrichment_candidate_lineage.sql"),
  ]);
  const definitions = [
    [base, "enrichment_grant_prospects_scope_guard"],
    [upgrade, "enrichment_reservation_scope_guard"],
    [upgrade, "contact_eligibility_scope_guard"],
  ];
  const statements = candidate.split("--> statement-breakpoint")
    .map((part) => part.replace(/^--[^\n]*\n/gm, "").trim()).filter(Boolean);
  assert.equal(statements.length, 6);
  for (const [index, [source, name]] of definitions.entries()) {
    const original = source.match(new RegExp(`CREATE TRIGGER ${name} BEFORE INSERT[\\s\\S]*?\\nEND;`))?.[0];
    assert.ok(original, name);
    const expected = original.replaceAll("pc.status = 'qualified'", "pc.status IN ('observed','qualified')")
      .replaceAll("pc.status <> 'qualified'", "pc.status NOT IN ('observed','qualified')");
    assert.notEqual(original, expected);
    assert.equal(statements[index * 2], `DROP TRIGGER ${name};`);
    assert.equal(statements[index * 2 + 1], expected, "all other current scope, assessment, freshness, and revision guards are preserved");
  }
  const journal = JSON.parse(await read("meta/_journal.json"));
  assert.equal(journal.entries[11].idx, 11);
  assert.equal(journal.entries[11].tag, "0011_enrichment_candidate_lineage");
  const previous = JSON.parse(await read("meta/0010_snapshot.json"));
  const snapshot = JSON.parse(await read("meta/0011_snapshot.json"));
  assert.equal(snapshot.prevId, previous.id);
  assert.notEqual(snapshot.id, previous.id);
  const shape = (value) => Object.fromEntries(Object.entries(value).filter(([key]) => key !== "id" && key !== "prevId"));
  assert.deepEqual(shape(snapshot), shape(previous), "custom trigger repair changes no tables or Drizzle schema shape");
});
