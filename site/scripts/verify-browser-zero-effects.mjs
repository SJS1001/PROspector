import { strict as assert } from "node:assert";
import { readdir, realpath, stat } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { relative, resolve, sep } from "node:path";

import {
  CANONICAL_LOCAL_STATE_TABLES,
  FORBIDDEN_TABLE_NAMES,
  LOCAL_STATE_ROW_CEILING,
  OBJECT_NAME_PATTERN,
  classifyTable,
  classifyTrigger,
} from "./zero-effects-inventory.mjs";

const root = resolve(import.meta.dirname, "..");
const stateArgument = valueAfter("--state");
if (!stateArgument) throw new Error("browser_state_required");
const requireCompletion = !process.argv.includes("--allow-incomplete");
const localRoot = resolve(root, ".local");
const stateRoot = resolve(root, stateArgument);
assertInside(localRoot, stateRoot);

const resolvedLocal = await realpath(localRoot);
const resolvedState = await realpath(stateRoot);
assertInside(resolvedLocal, resolvedState);
assert.equal((await stat(resolvedState)).isDirectory(), true, "browser_state_not_directory");

const sqliteFiles = (await walk(resolvedState)).filter((path) => path.endsWith(".sqlite"));
let applicationDatabase = null;
let objectRows = 0;
let multipartRows = 0;
const forbidden = {};
const forbiddenSightings = [];
for (const name of FORBIDDEN_TABLE_NAMES) forbidden[name] = { present: false, count: 0 };

// Every persisted SQLite file is inspected, not only the application database: an
// effect row is an effect row wherever the runtime wrote it.
for (const path of sqliteFiles) {
  const database = new DatabaseSync(path, { readOnly: true });
  let retained = false;
  try {
    const objects = readObjects(database);
    if (objects.tables.has("_mf_objects")) objectRows += countRows(database, "_mf_objects");
    if (objects.tables.has("_mf_multipart_uploads")) multipartRows += countRows(database, "_mf_multipart_uploads");
    for (const name of FORBIDDEN_TABLE_NAMES) {
      if (!objects.tables.has(name) && !objects.views.has(name)) continue;
      const count = countRows(database, name);
      forbidden[name] = { present: true, count: forbidden[name].count + count };
      if (count > 0) forbiddenSightings.push({ table: name, count, file: relative(resolvedState, path) });
    }
    if (objects.tables.has("workspaces")) {
      if (applicationDatabase) throw new Error("multiple_application_databases");
      applicationDatabase = { database, path, objects };
      retained = true;
    }
  } finally {
    if (!retained) database.close();
  }
}
if (!applicationDatabase) throw new Error("application_database_not_found");

try {
  assert.equal(objectRows, 0, "r2_objects_must_remain_empty");
  assert.equal(multipartRows, 0, "r2_multipart_uploads_must_remain_empty");
  for (const [name, { count }] of Object.entries(forbidden)) assert.equal(count, 0, `${name}_must_remain_empty`);

  // Fail closed on the application schema itself. Anything present that the canonical
  // inventory does not classify is treated as a potential effect surface, so a table,
  // view, or trigger introduced by a later migration cannot pass unverified. Only this
  // database is audited for unknown objects: the other persisted files are Miniflare KV,
  // R2, and cache stores whose own schemas are not part of the application inventory.
  const { objects } = applicationDatabase;
  const unknownObjects = [
    ...[...objects.tables].filter((name) => classifyTable(name) === "unknown").map((name) => ({ type: "table", name })),
    ...[...objects.views].filter((name) => classifyTable(name) === "unknown").map((name) => ({ type: "view", name })),
  ].sort((left, right) => left.name.localeCompare(right.name));
  const unknownTriggers = [...objects.triggers].filter((name) => classifyTrigger(name) === "unknown").sort();
  assert.deepEqual(unknownObjects, [], `unclassified_database_objects_forbidden:${unknownObjects.map(({ name }) => name).join(",")}`);
  assert.deepEqual(unknownTriggers, [], `unclassified_triggers_forbidden:${unknownTriggers.join(",")}`);

  const localState = {};
  for (const name of CANONICAL_LOCAL_STATE_TABLES) {
    if (!objects.tables.has(name)) continue;
    const count = countRows(applicationDatabase.database, name);
    assert.ok(count <= LOCAL_STATE_ROW_CEILING, `${name}_exceeds_local_state_ceiling`);
    localState[name] = count;
  }

  assert.ok(objects.tables.has("knowledge_versions"), "knowledge_versions_must_be_present");
  const workspaceCount = countRows(applicationDatabase.database, "workspaces");
  const confirmedFitCount = Number(applicationDatabase.database
    .prepare("SELECT COUNT(*) AS count FROM knowledge_versions WHERE status='confirmed' AND kind='fit'").get().count);
  if (requireCompletion) {
    assert.equal(workspaceCount, 1, "exactly_one_synthetic_workspace_required");
    assert.equal(confirmedFitCount, 1, "exactly_one_confirmed_fit_required");
  } else {
    assert.ok(workspaceCount >= 0 && workspaceCount <= 1, "bounded_synthetic_workspace_required");
    assert.ok(confirmedFitCount >= 0 && confirmedFitCount <= 1, "bounded_confirmed_fit_required");
  }
  process.stdout.write(`${JSON.stringify({
    status: requireCompletion ? "passed" : "zero-effects-only",
    synthetic: true,
    workspaceCount,
    confirmedFitCount,
    forbiddenRows: forbiddenSightings.length,
    objectRows,
    multipartRows,
    databaseFiles: sqliteFiles.length,
    unknownObjects: [],
    unknownTriggers: [],
    triggerCount: objects.triggers.size,
    localState,
    forbidden,
  })}\n`);
} finally {
  applicationDatabase.database.close();
}

function valueAfter(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function assertInside(parent, child) {
  const path = relative(parent, child);
  if (!path || path.startsWith(`..${sep}`) || path === ".." || resolve(parent, path) !== child) throw new Error("browser_state_path_invalid");
}

// Indexes are excluded on purpose: they hold no rows and cannot carry an effect.
function readObjects(database) {
  const objects = { tables: new Set(), views: new Set(), triggers: new Set() };
  for (const row of database.prepare("SELECT type, name FROM sqlite_master WHERE type IN ('table','view','trigger')").all()) {
    const name = String(row.name);
    if (row.type === "table") objects.tables.add(name);
    else if (row.type === "view") objects.views.add(name);
    else objects.triggers.add(name);
  }
  return objects;
}

function countRows(database, name) {
  assert.match(name, OBJECT_NAME_PATTERN);
  return Number(database.prepare(`SELECT COUNT(*) AS count FROM "${name}"`).get().count);
}

async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error("browser_state_symlink_forbidden");
    if (entry.isDirectory()) files.push(...await walk(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}
