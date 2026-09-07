import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { basename, resolve } from "node:path";
import test from "node:test";

import {
  CANONICAL_DERIVED_TABLES,
  CANONICAL_EFFECT_TABLES,
  CANONICAL_LOCAL_STATE_TABLES,
  CANONICAL_TABLES,
  CANONICAL_TRIGGERS,
  LOCAL_STATE_ROW_CEILING,
  RETIRED_EFFECT_TABLES,
  classifyTable,
} from "../scripts/zero-effects-inventory.mjs";
import { PHASE2_FORBIDDEN_TABLE_NAMES } from "../scripts/phase2-hosted-contract.mjs";

const root = resolve(import.meta.dirname, "..");

// The synthetic onboarding shape the browser journey leaves behind: exactly one
// workspace and one confirmed fit version.
const BASE_SCHEMA = `
CREATE TABLE workspaces (id TEXT PRIMARY KEY);
CREATE TABLE knowledge_versions (id TEXT PRIMARY KEY, status TEXT, kind TEXT);
INSERT INTO workspaces VALUES ('synthetic-workspace');
INSERT INTO knowledge_versions VALUES ('synthetic-fit','confirmed','fit');
`;

test("the inventory classifies exactly the objects the checked migration chain creates", async () => {
  const schema = await readMigrationSchema();
  assert.deepEqual([...schema.tables].sort(), [...CANONICAL_TABLES]);
  assert.deepEqual([...schema.triggers].sort(), [...CANONICAL_TRIGGERS]);
  for (const name of schema.tables) {
    assert.notEqual(classifyTable(name), "unknown", `${name} must be classified as effect or local state`);
  }
  // Every Phase 2 hosted-contract name stays forbidden, whether or not the checked
  // schema still creates it.
  for (const name of PHASE2_FORBIDDEN_TABLE_NAMES) {
    assert.ok(
      CANONICAL_EFFECT_TABLES.includes(name) || RETIRED_EFFECT_TABLES.includes(name),
      `${name} must remain forbidden`,
    );
  }
  for (const name of CANONICAL_LOCAL_STATE_TABLES) assert.equal(PHASE2_FORBIDDEN_TABLE_NAMES.includes(name), false, name);
});

test("every effect table introduced by migrations 0010-0019 is verified, not ignored", async () => {
  const early = await readMigrationSchema((file) => file < "0010");
  const late = await readMigrationSchema();
  const introduced = [...late.tables].filter((name) => !early.tables.has(name)).sort();
  assert.ok(introduced.length >= 30, `expected the later chain to introduce tables, saw ${introduced.length}`);
  // This is the regression the previous denylist missed: none of these tables were
  // covered, so an effect row in any of them passed verification silently. Every
  // introduced table must therefore be classified, and "effect" unless it is named
  // in the derived allowlist -- a table cannot become derived by accident.
  for (const name of introduced) {
    const classification = classifyTable(name);
    if (CANONICAL_DERIVED_TABLES.includes(name)) {
      assert.equal(classification, "derived", name);
      continue;
    }
    assert.equal(classification, "effect", name);
  }
  assert.ok(
    CANONICAL_DERIVED_TABLES.every((name) => introduced.includes(name)),
    "the derived allowlist may only name tables the later chain actually introduces",
  );

  for (const name of introduced) {
    if (CANONICAL_DERIVED_TABLES.includes(name)) continue;
    await withFixture(async ({ stateRoot, write }) => {
      write(`CREATE TABLE "${name}" (id TEXT PRIMARY KEY); INSERT INTO "${name}" VALUES ('effect-row');`);
      const denied = verify(stateRoot);
      assert.notEqual(denied.status, 0, `${name} must fail verification`);
      assert.match(denied.stderr, new RegExp(`${name}_must_remain_empty`));
    });
  }

  // A derived table is bounded, not ignored: a row is accepted, but blowing past the
  // ceiling still fails, so it cannot become an unbounded write surface.
  for (const name of CANONICAL_DERIVED_TABLES) {
    await withFixture(async ({ stateRoot, write }) => {
      write(`CREATE TABLE "${name}" (id TEXT PRIMARY KEY); INSERT INTO "${name}" VALUES ('derived-row');`);
      assert.equal(verify(stateRoot).status, 0, `${name} must accept its trigger-maintained row`);
    });
    await withFixture(async ({ stateRoot, write }) => {
      const rows = Array.from({ length: LOCAL_STATE_ROW_CEILING + 1 }, (_, index) => `('row-${index}')`).join(",");
      write(`CREATE TABLE "${name}" (id TEXT PRIMARY KEY); INSERT INTO "${name}" VALUES ${rows};`);
      const denied = verify(stateRoot);
      assert.notEqual(denied.status, 0, `${name} must fail past the ceiling`);
      assert.match(denied.stderr, new RegExp(`${name}_exceeds_local_state_ceiling`));
    });
  }
});

test("a retired Phase 2 effect table cannot be reintroduced with rows", async () => {
  await withFixture(async ({ stateRoot, write }) => {
    write("CREATE TABLE export_jobs (id TEXT PRIMARY KEY); INSERT INTO export_jobs VALUES ('export');");
    const denied = verify(stateRoot);
    assert.notEqual(denied.status, 0);
    assert.match(denied.stderr, /export_jobs_must_remain_empty/);
  });
});

test("an unknown table fails closed even when it holds no rows", async () => {
  await withFixture(async ({ stateRoot, write }) => {
    write("CREATE TABLE future_dispatch_receipts (id TEXT PRIMARY KEY);");
    const denied = verify(stateRoot);
    assert.notEqual(denied.status, 0);
    assert.match(denied.stderr, /unclassified_database_objects_forbidden:future_dispatch_receipts/);
  });
});

test("an unknown view fails closed and a view over a forbidden name is still counted", async () => {
  await withFixture(async ({ stateRoot, write }) => {
    write("CREATE VIEW workspace_digest AS SELECT id FROM workspaces;");
    const denied = verify(stateRoot);
    assert.notEqual(denied.status, 0);
    assert.match(denied.stderr, /unclassified_database_objects_forbidden:workspace_digest/);
  });

  await withFixture(async ({ stateRoot, write }) => {
    write("CREATE VIEW outreach_messages AS SELECT id FROM workspaces;");
    const denied = verify(stateRoot);
    assert.notEqual(denied.status, 0);
    assert.match(denied.stderr, /outreach_messages_must_remain_empty/);
  });
});

test("an unknown trigger fails closed and a canonical trigger cannot smuggle an effect row", async () => {
  await withFixture(async ({ stateRoot, write }) => {
    write(`
      CREATE TRIGGER workspace_shadow_insert AFTER INSERT ON workspaces
      BEGIN SELECT 1; END;
    `);
    const denied = verify(stateRoot);
    assert.notEqual(denied.status, 0);
    assert.match(denied.stderr, /unclassified_triggers_forbidden:workspace_shadow_insert/);
  });

  // A trigger named exactly like a canonical one still cannot leave an effect row:
  // emptiness is proved by counting rows, not by trusting the trigger inventory.
  await withFixture(async ({ stateRoot, write }) => {
    assert.ok(CANONICAL_TRIGGERS.includes("contacts_generation_prospect_insert"));
    write(`
      CREATE TABLE prospects (id TEXT PRIMARY KEY);
      CREATE TRIGGER contacts_generation_prospect_insert AFTER INSERT ON knowledge_versions
      BEGIN INSERT INTO prospects VALUES (NEW.id); END;
      INSERT INTO knowledge_versions VALUES ('triggered-version','draft','fit');
    `);
    const denied = verify(stateRoot);
    assert.notEqual(denied.status, 0);
    assert.match(denied.stderr, /prospects_must_remain_empty/);
  });
});

test("effect rows are found in every persisted database, not only the application one", async () => {
  await withFixture(async ({ stateRoot }) => {
    const sidecar = new DatabaseSync(resolve(stateRoot, "sidecar.sqlite"));
    try {
      sidecar.exec("CREATE TABLE outreach_outbox_items (id TEXT PRIMARY KEY); INSERT INTO outreach_outbox_items VALUES ('queued');");
    } finally {
      sidecar.close();
    }
    const denied = verify(stateRoot);
    assert.notEqual(denied.status, 0);
    assert.match(denied.stderr, /outreach_outbox_items_must_remain_empty/);
  });

  await withFixture(async ({ stateRoot }) => {
    const bucket = new DatabaseSync(resolve(stateRoot, "r2.sqlite"));
    try {
      bucket.exec("CREATE TABLE _mf_objects (key TEXT PRIMARY KEY); INSERT INTO _mf_objects VALUES ('exported.csv');");
    } finally {
      bucket.close();
    }
    const denied = verify(stateRoot);
    assert.notEqual(denied.status, 0);
    assert.match(denied.stderr, /r2_objects_must_remain_empty/);
  });
});

test("ordinary synthetic local demo state passes and is reported", async () => {
  await withFixture(async ({ stateRoot, write }) => {
    write(`
      CREATE TABLE accounts (id TEXT PRIMARY KEY);
      CREATE TABLE audit_events (id TEXT PRIMARY KEY);
      CREATE TABLE interview_sessions (id TEXT PRIMARY KEY);
      CREATE TABLE interview_answers (id TEXT PRIMARY KEY);
      CREATE TABLE customer_profiles (id TEXT PRIMARY KEY);
      CREATE TABLE prospects (id TEXT PRIMARY KEY);
      CREATE TABLE outreach_messages (id TEXT PRIMARY KEY);
      INSERT INTO accounts VALUES ('northstar');
      INSERT INTO audit_events VALUES ('onboarding-1'), ('onboarding-2');
      INSERT INTO interview_sessions VALUES ('session-1');
      INSERT INTO interview_answers VALUES ('answer-1'), ('answer-2'), ('answer-3');
      INSERT INTO customer_profiles VALUES ('harbor-pulse');
      CREATE TABLE _cf_METADATA (key INTEGER PRIMARY KEY, value BLOB);
      INSERT INTO _cf_METADATA VALUES (1, NULL);
      CREATE TABLE _cf_ALARM (key TEXT PRIMARY KEY);
      CREATE TABLE _cf_KV (key TEXT PRIMARY KEY, value BLOB);
      INSERT INTO _cf_KV VALUES ('bookmark', NULL);
      CREATE TABLE d1_migrations (id INTEGER PRIMARY KEY, name TEXT);
      INSERT INTO d1_migrations VALUES (1, '0000_jittery_meteorite.sql');
    `);
    const passed = verify(stateRoot);
    assert.equal(passed.status, 0, passed.stderr);
    const receipt = JSON.parse(passed.stdout);
    assert.equal(receipt.status, "passed");
    assert.equal(receipt.workspaceCount, 1);
    assert.equal(receipt.confirmedFitCount, 1);
    assert.equal(receipt.forbiddenRows, 0);
    assert.deepEqual(receipt.unknownObjects, []);
    assert.deepEqual(receipt.unknownTriggers, []);
    assert.deepEqual(receipt.localState, {
      accounts: 1, audit_events: 2, customer_profiles: 1, interview_answers: 3,
      interview_sessions: 1, knowledge_versions: 1, workspaces: 1,
    });
    assert.equal(receipt.forbidden.prospects.present, true);
    assert.equal(receipt.forbidden.prospects.count, 0);
    assert.equal(receipt.forbidden.outreach_messages.present, true);
    assert.equal(receipt.forbidden.person_discovery_runs.present, false);
  });
});

test("local state stays bounded so a bulk load cannot pass as demo state", async () => {
  await withFixture(async ({ stateRoot, write }) => {
    const rows = Array.from({ length: LOCAL_STATE_ROW_CEILING + 1 }, (unused, index) => `('bulk-${index}','draft','fit')`).join(",");
    write(`INSERT INTO knowledge_versions VALUES ${rows};`);
    const denied = verify(stateRoot);
    assert.notEqual(denied.status, 0);
    assert.match(denied.stderr, /knowledge_versions_exceeds_local_state_ceiling/);
  });
});

async function withFixture(body) {
  const local = resolve(root, ".local");
  await mkdir(local, { recursive: true });
  const stateRoot = await mkdtemp(resolve(local, "zero-effects-verifier-"));
  const databasePath = resolve(stateRoot, "application.sqlite");
  const write = (sql) => {
    const database = new DatabaseSync(databasePath);
    try { database.exec(sql); } finally { database.close(); }
  };
  try {
    write(BASE_SCHEMA);
    await body({ stateRoot, databasePath, write });
  } finally {
    await rm(stateRoot, { recursive: true, force: true });
  }
}

function verify(stateRoot, ...options) {
  return spawnSync(
    process.execPath,
    ["scripts/verify-browser-zero-effects.mjs", "--state", `.local/${basename(stateRoot)}`, ...options],
    { cwd: root, encoding: "utf8" },
  );
}

// Replays the checked migration chain in statement order so drops and rebuild renames
// are honoured, giving the exact set of objects the schema can leave behind.
async function readMigrationSchema(include = () => true) {
  const directory = resolve(root, "drizzle");
  const files = (await readdir(directory)).filter((name) => name.endsWith(".sql")).sort().filter(include);
  const tables = new Set();
  const triggers = new Set();
  for (const file of files) {
    const sql = await readFile(resolve(directory, file), "utf8");
    const statements = /CREATE TABLE(?: IF NOT EXISTS)? `?([A-Za-z0-9_]+)|DROP TABLE(?: IF EXISTS)? `?([A-Za-z0-9_]+)|ALTER TABLE `?([A-Za-z0-9_]+)`? RENAME TO `?([A-Za-z0-9_]+)|CREATE TRIGGER(?: IF NOT EXISTS)? `?([A-Za-z0-9_]+)/g;
    for (const match of sql.matchAll(statements)) {
      const [, created, dropped, renamedFrom, renamedTo, trigger] = match;
      if (created) tables.add(created);
      else if (dropped) tables.delete(dropped);
      else if (renamedFrom) { tables.delete(renamedFrom); tables.add(renamedTo); }
      else if (trigger) triggers.add(trigger);
    }
  }
  return { tables, triggers };
}
