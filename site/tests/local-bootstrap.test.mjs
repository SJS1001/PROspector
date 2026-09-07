import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { CANONICAL_MIGRATION_COUNT, CANONICAL_MIGRATION_HEAD } from "../scripts/migration-chain.mjs";

const root = resolve(import.meta.dirname, "..");
const wrangler = resolve(root, "node_modules/.bin/wrangler");

test("local bootstrap applies the whole canonical chain and matches its checked snapshot", async () => {
  const state = resolve(root, ".local", "test-bootstrap-state");
  await rm(state, { recursive: true, force: true });
  try {
    const report = JSON.parse(execFileSync(process.execPath, ["scripts/local-bootstrap.mjs", "--reset", "--state", ".local/test-bootstrap-state"], { cwd: root, encoding: "utf8" }).trim());
    assert.equal(report.status, "ready");
    assert.equal(report.disposable, true);
    assert.equal(report.migrationChainSource, "checked-repository-journal");
    /* The bootstrap scope is the whole checked chain, derived from the journal
     * rather than restated here, so adding a migration extends it without an
     * edit. Pinning the count to the canonical chain still forces any change in
     * that chain to be a deliberate one. */
    assert.equal(report.migrationCount, CANONICAL_MIGRATION_COUNT);
    assert.equal(report.migrationHead, CANONICAL_MIGRATION_HEAD);

    const headSnapshot = CANONICAL_MIGRATION_HEAD.replace(/\.sql$/, "_snapshot.json").replace(/^(\d{4})_.*_snapshot/, "$1_snapshot");
    const snapshot = JSON.parse(await readFile(new URL(`../drizzle/meta/${headSnapshot}`, import.meta.url), "utf8"));
    const expectedTables = Object.keys(snapshot.tables).length;
    const [counted] = query(state, "SELECT COUNT(*) AS tables FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%';");
    assert.equal(counted.tables, expectedTables, `bootstrap must build every table the head snapshot declares (${expectedTables})`);

    /* The head-of-chain tables are the ones a 0000-0009 bootstrap silently
     * omitted, so name them rather than trusting the count alone. */
    const required = [
      "contacts",
      "contacts_projection_generations",
      "person_discovery_runs",
      "person_discovery_run_events",
      "person_discovery_candidates",
      "person_discovery_provenance",
      "person_discovery_owner_decisions",
      "prospect_contact_role_relevance",
      "contact_verification_intents",
    ];
    const present = query(state, `SELECT name FROM sqlite_master WHERE type='table' AND name IN (${required.map((table) => `'${table}'`).join(",")}) ORDER BY name;`).map((row) => row.name);
    assert.deepEqual(present, [...required].sort(), "a fresh local bootstrap must carry the Contacts and Person Discovery schema");

    assert.deepEqual(query(state, "PRAGMA foreign_key_check;"), [], "a bootstrapped database has no foreign-key violations");
    /* The bootstrap decides that from wrangler's row shape, so prove the shape a
     * violation would arrive in is one this check can actually see: a parser
     * blind to it would report every database clean. */
    assert.deepEqual(query(state, "SELECT 'contacts' AS \"table\", 1 AS rowid;"), [{ table: "contacts", rowid: 1 }]);
  } finally {
    await rm(state, { recursive: true, force: true });
  }
});

test("local bootstrap refuses to run without an explicit reset", () => {
  assert.throws(
    () => execFileSync(process.execPath, ["scripts/local-bootstrap.mjs", "--state", ".local/test-bootstrap-no-reset"], { cwd: root, encoding: "utf8", stdio: "pipe" }),
    /local_reset_required/,
  );
});

test("local bootstrap refuses a state path outside site/.local", () => {
  assert.throws(
    () => execFileSync(process.execPath, ["scripts/local-bootstrap.mjs", "--reset", "--state", "../unsafe"], { cwd: root, encoding: "utf8", stdio: "pipe" }),
    /local_state_path_invalid/,
  );
});

function query(state, sql) {
  const output = execFileSync(wrangler, ["d1", "execute", "DB", "--local", "--persist-to", state, "--config", "wrangler.local.jsonc", "--json", "--command", sql], { cwd: root, encoding: "utf8" });
  const payload = JSON.parse(output);
  assert.ok(Array.isArray(payload) && Array.isArray(payload[0]?.results), "wrangler must return a readable result envelope");
  return payload[0].results;
}
