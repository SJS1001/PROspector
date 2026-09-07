// Adversarial regression coverage for the canonical migration source of truth.
//
// The blocker this guards against: the repository chain grew to 0000-0019 while
// the local bootstrap, its readiness attestation, and the acceptance lanes kept
// private copies pinned at 0000-0009, so a fresh local bootstrap silently
// produced a database with no Contacts/Person Discovery schema. Every case here
// either proves the single source of truth is authoritative, or proves that a
// consumer cannot quietly reintroduce a second copy.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cp, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import {
  CANONICAL_MIGRATION_COUNT,
  CANONICAL_MIGRATION_FILENAMES,
  CANONICAL_MIGRATION_HEAD,
  MIGRATION_DIRECTORY,
  assertCanonicalPrefix,
  readMigrationChain,
} from "../scripts/migration-chain.mjs";
import { PERSON_DISCOVERY_C4_MIGRATIONS } from "../scripts/person-discovery-browser-boundary.mjs";
import { GREENFIELD_REQUIRED_EMPTY_TABLES } from "../scripts/greenfield-baseline-contract.mjs";
import {
  MIGRATION_FILENAMES,
  PERSON_DISCOVERY_FORWARD_MIGRATION_FILENAMES,
  PHASE2_MIGRATION_FILENAMES,
  applyPersonDiscoveryMigrations,
  createD1Fixture,
} from "./helpers/d1.mjs";

const root = resolve(import.meta.dirname, "..");

async function scratchChain() {
  const directory = await mkdtemp(resolve(tmpdir(), "prospector-migration-chain-"));
  await cp(MIGRATION_DIRECTORY, directory, { recursive: true });
  return directory;
}

async function rewriteJournal(directory, mutate) {
  const path = resolve(directory, "meta/_journal.json");
  const journal = JSON.parse(await readFile(path, "utf8"));
  const mutated = mutate(journal) ?? journal;
  await writeFile(path, JSON.stringify(mutated));
}

test("the canonical chain is the checked journal, in journal order, with no gaps", () => {
  assert.ok(CANONICAL_MIGRATION_COUNT > 0);
  assert.equal(CANONICAL_MIGRATION_HEAD, CANONICAL_MIGRATION_FILENAMES.at(-1));
  assert.equal(Object.isFrozen(CANONICAL_MIGRATION_FILENAMES), true);
  CANONICAL_MIGRATION_FILENAMES.forEach((filename, index) => {
    assert.equal(filename.slice(0, 4), String(index).padStart(4, "0"), `${filename} must sit at journal index ${index}`);
  });
  // Regression: the chain reaches the integrated person-discovery head rather
  // than the historical 0009 boundary.
  assert.ok(CANONICAL_MIGRATION_COUNT >= 20);
  assert.equal(CANONICAL_MIGRATION_HEAD, "0019_person_discovery.sql");
});

test("the canonical chain is exactly the set of checked SQL files", async () => {
  const onDisk = (await readdir(MIGRATION_DIRECTORY, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .sort();
  assert.deepEqual([...CANONICAL_MIGRATION_FILENAMES].sort(), onDisk, "no orphan SQL file and no journal entry without a file");
});

test("an SQL file that no journal entry claims fails closed", async () => {
  const directory = await scratchChain();
  try {
    await writeFile(resolve(directory, "0020_unjournalled_candidate.sql"), "SELECT 1;\n");
    assert.throws(() => readMigrationChain(directory), /migration_chain_orphan_file:0020_unjournalled_candidate\.sql/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("a journal entry whose SQL file is missing fails closed", async () => {
  const directory = await scratchChain();
  try {
    await rewriteJournal(directory, (journal) => {
      journal.entries.push({ idx: journal.entries.length, version: "6", when: 1, tag: "0020_absent_migration" });
    });
    assert.throws(() => readMigrationChain(directory), /migration_chain_file_missing:0020_absent_migration\.sql/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("a gap, a duplicate, or a mismatched prefix in the journal fails closed", async () => {
  for (const [mutate, expected] of [
    [(journal) => { journal.entries = journal.entries.filter((entry) => entry.idx !== 5); }, /migration_chain_index_gap:5/],
    [(journal) => { journal.entries[6].idx = 5; }, /migration_chain_duplicate_index:5/],
    [(journal) => { journal.entries[5].idx = 7; }, /migration_chain_prefix_mismatch:0005_even_mastermind/],
    [(journal) => { journal.entries[5].tag = "0005_../../escape"; }, /migration_chain_tag_invalid/],
    [(journal) => { journal.dialect = "postgresql"; }, /migration_chain_dialect_invalid/],
    [(journal) => { journal.entries = []; }, /migration_chain_journal_invalid/],
  ]) {
    const directory = await scratchChain();
    try {
      await rewriteJournal(directory, mutate);
      assert.throws(() => readMigrationChain(directory), expected);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
});

test("an unreadable or non-object journal fails closed instead of returning a short chain", async () => {
  const directory = await scratchChain();
  try {
    await writeFile(resolve(directory, "meta/_journal.json"), "not json");
    assert.throws(() => readMigrationChain(directory), /migration_chain_journal_unreadable/);
    await writeFile(resolve(directory, "meta/_journal.json"), "[]");
    assert.throws(() => readMigrationChain(directory), /migration_chain_journal_invalid/);
    await rm(resolve(directory, "meta/_journal.json"));
    assert.throws(() => readMigrationChain(directory), /migration_chain_journal_unreadable/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("a newly added migration enters every derived consumer without an edit", async () => {
  const directory = await scratchChain();
  try {
    await writeFile(resolve(directory, "0020_synthetic_future_migration.sql"), "SELECT 1;\n");
    await rewriteJournal(directory, (journal) => {
      journal.entries.push({ idx: journal.entries.length, version: "6", when: 1, tag: "0020_synthetic_future_migration" });
    });
    const grown = readMigrationChain(directory);
    assert.equal(grown.length, CANONICAL_MIGRATION_COUNT + 1);
    assert.equal(grown.at(-1), "0020_synthetic_future_migration.sql");
    assert.deepEqual(grown.slice(0, CANONICAL_MIGRATION_COUNT), [...CANONICAL_MIGRATION_FILENAMES]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("no bootstrap or lane script keeps a private copy of the chain", async () => {
  for (const relativePath of [
    "scripts/local-bootstrap.mjs",
    "scripts/person-discovery-browser-boundary.mjs",
    "scripts/person-discovery-browser-bootstrap.mjs",
    "scripts/greenfield-baseline.mjs",
  ]) {
    const source = await readFile(resolve(root, relativePath), "utf8");
    assert.deepEqual(
      [...source.matchAll(/["'](\d{4}_[A-Za-z0-9._-]+\.sql)["']/g)].map((match) => match[1]),
      [],
      `${relativePath} must derive the chain instead of restating it`,
    );
  }
});

test("pinned fixture prefixes and the derived forward list still reconstruct the canonical chain", () => {
  assertCanonicalPrefix(PHASE2_MIGRATION_FILENAMES, "PHASE2_MIGRATION_FILENAMES");
  assertCanonicalPrefix(MIGRATION_FILENAMES, "MIGRATION_FILENAMES");
  assert.deepEqual(
    [...MIGRATION_FILENAMES, ...PERSON_DISCOVERY_FORWARD_MIGRATION_FILENAMES],
    [...CANONICAL_MIGRATION_FILENAMES],
    "the full-chain fixture must reach the canonical head",
  );
  assert.deepEqual([...PERSON_DISCOVERY_C4_MIGRATIONS], [...CANONICAL_MIGRATION_FILENAMES]);
  assert.throws(() => assertCanonicalPrefix(["0001_true_spencer_smythe.sql"], "reordered"), /exact prefix/);
  assert.throws(() => assertCanonicalPrefix([...CANONICAL_MIGRATION_FILENAMES, "0020_invented.sql"], "invented"), /exact prefix/);
});

test("the greenfield attestation covers the Contacts and Person Discovery schema", () => {
  for (const table of [
    "contacts",
    "contacts_projection_generations",
    "person_discovery_runs",
    "person_discovery_run_events",
    "person_discovery_candidates",
    "person_discovery_provenance",
    "person_discovery_owner_decisions",
    "prospect_contact_role_relevance",
    "contact_verification_intents",
  ]) {
    assert.ok(GREENFIELD_REQUIRED_EMPTY_TABLES.includes(table), `${table} must be attested empty by the greenfield baseline`);
  }
  assert.equal(new Set(GREENFIELD_REQUIRED_EMPTY_TABLES).size, GREENFIELD_REQUIRED_EMPTY_TABLES.length);
  for (const table of GREENFIELD_REQUIRED_EMPTY_TABLES) assert.match(table, /^[a-z][a-z0-9_]*$/);
});

test("the full canonical chain installs a clean, empty Contacts and Person Discovery schema", async () => {
  const fixture = await createD1Fixture("migration-source-of-truth-full-chain");
  try {
    await applyPersonDiscoveryMigrations(fixture.database);
    const foreignKeys = await fixture.database.prepare("PRAGMA foreign_key_check").all();
    assert.deepEqual(foreignKeys.results, []);
    for (const table of GREENFIELD_REQUIRED_EMPTY_TABLES) {
      const present = await fixture.database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?").bind(table).first();
      assert.equal(present?.name, table, `${table} must exist after the canonical chain`);
      const count = await fixture.database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).first();
      assert.equal(Number(count.count), 0, `${table} must be empty in a fresh chain`);
    }
    const tables = await fixture.database.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'").first();
    assert.ok(Number(tables.count) >= 92, `the post-chain schema must keep at least 92 application tables, saw ${tables.count}`);
  } finally {
    await fixture.dispose();
  }
});

test("the Stage 2 hosted manifest is an intact, byte-identical prefix of the canonical chain", async () => {
  // The manifest records the exact bytes verified against the provisioned D1 at
  // the 0009 boundary. It is hosted evidence and must not be rewritten to
  // follow the repository chain: doing so would claim a remote apply that never
  // happened. What must hold is that the reviewed prefix is still intact and
  // that the chain only ever grew past it.
  const manifest = await readFile(resolve(root, "../.planning/phases/02-consensus-knowledge-and-commercial-model/02-99-MIGRATION-MANIFEST.md"), "utf8");
  const rows = manifest.split("\n")
    .filter((line) => /^\| \d{4} \|/u.test(line))
    .map((line) => line.split("|").slice(1, -1).map((cell) => cell.trim().replaceAll("`", "")))
    .map(([order, name, sha]) => ({ order, name, sha }));

  assert.ok(rows.length > 0, "the manifest must still list its release chain");
  assertCanonicalPrefix(rows.map((row) => row.name), "02-99-MIGRATION-MANIFEST.md");
  assert.ok(
    CANONICAL_MIGRATION_COUNT >= rows.length,
    "the canonical chain may grow past the applied boundary but never shrink below it",
  );

  for (const [index, row] of rows.entries()) {
    assert.equal(row.order, String(index).padStart(4, "0"));
    const bytes = await readFile(resolve(root, "drizzle", row.name));
    assert.equal(
      createHash("sha256").update(bytes).digest("hex"),
      row.sha,
      `${row.name} no longer matches the reviewed bytes recorded for the hosted apply`,
    );
  }
});
