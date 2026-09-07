import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");
const wrangler = resolve(root, "node_modules/.bin/wrangler");

test("local bootstrap creates a disposable chain whose schema matches the checked snapshot", async () => {
  const state = resolve(root, ".local", "test-bootstrap-state");
  await rm(state, { recursive: true, force: true });
  try {
    const report = JSON.parse(execFileSync(process.execPath, ["scripts/local-bootstrap.mjs", "--reset", "--state", ".local/test-bootstrap-state"], { cwd: root, encoding: "utf8" }).trim());
    assert.equal(report.status, "ready");
    assert.equal(report.disposable, true);
    /* 0000-0009 is the deliberate bootstrap scope, not the whole checked chain.
     * Pinning it here forces any extension to revisit the greenfield claims
     * that describe what this database contains. */
    assert.equal(report.migrationCount, 10);

    const snapshot = JSON.parse(await readFile(new URL("../drizzle/meta/0009_snapshot.json", import.meta.url), "utf8"));
    const expectedTables = Object.keys(snapshot.tables).length;
    const [counted] = query(state, "SELECT COUNT(*) AS tables FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%';");
    assert.equal(counted.tables, expectedTables, `bootstrap must build every table the 0009 snapshot declares (${expectedTables})`);

    assert.deepEqual(query(state, "PRAGMA foreign_key_check;"), [], "a bootstrapped database has no foreign-key violations");
    /* The bootstrap decides that from wrangler's row shape, so prove the shape a
     * violation would arrive in is one this check can actually see: a parser
     * blind to it would report every database clean. */
    assert.deepEqual(query(state, "SELECT 'contacts' AS \"table\", 1 AS rowid;"), [{ table: "contacts", rowid: 1 }]);
  } finally {
    await rm(state, { recursive: true, force: true });
  }
});

function query(state, sql) {
  const output = execFileSync(wrangler, ["d1", "execute", "DB", "--local", "--persist-to", state, "--config", "wrangler.local.jsonc", "--json", "--command", sql], { cwd: root, encoding: "utf8" });
  const payload = JSON.parse(output);
  assert.ok(Array.isArray(payload) && Array.isArray(payload[0]?.results), "wrangler must return a readable result envelope");
  return payload[0].results;
}
