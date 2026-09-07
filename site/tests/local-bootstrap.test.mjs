import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { CANONICAL_MIGRATION_COUNT, CANONICAL_MIGRATION_HEAD } from "../scripts/migration-chain.mjs";

const root = resolve(import.meta.dirname, "..");

function query(state, sql) {
  return execFileSync(resolve(root, "node_modules/.bin/wrangler"), [
    "d1", "execute", "DB", "--local", "--persist-to", state,
    "--config", "wrangler.local.jsonc", "--command", sql,
  ], { cwd: root, encoding: "utf8" });
}

test("local bootstrap applies the whole canonical chain, not a truncated prefix", async () => {
  const state = resolve(root, ".local", "test-bootstrap-state");
  await rm(state, { recursive: true, force: true });
  try {
    const output = execFileSync(process.execPath, ["scripts/local-bootstrap.mjs", "--reset", "--state", ".local/test-bootstrap-state"], { cwd: root, encoding: "utf8" });
    const receipt = JSON.parse(output.trim());
    assert.equal(receipt.status, "ready");
    assert.equal(receipt.disposable, true);
    assert.equal(receipt.migrationSource, "checked-repository-journal");
    assert.equal(receipt.migrationCount, CANONICAL_MIGRATION_COUNT);
    assert.equal(receipt.migrationHead, CANONICAL_MIGRATION_HEAD);

    // The head-of-chain tables are the ones a 0000-0009 bootstrap silently
    // omitted: assert the schema itself, not just a loose table count.
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
    const names = query(state, `SELECT name FROM sqlite_master WHERE type='table' AND name IN (${required.map((table) => `'${table}'`).join(",")}) ORDER BY name;`);
    for (const table of required) {
      assert.match(names, new RegExp(`"name":\\s*"${table}"`), `${table} must exist after a fresh local bootstrap`);
    }

    const tableCount = query(state, "SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT LIKE '_mf_%';");
    const applicationTables = Number(/"count":\s*(\d+)/.exec(tableCount)?.[1]);
    assert.ok(applicationTables >= 92, `the post-chain schema must keep at least 92 application tables, saw ${applicationTables}`);
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
