import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

test("local bootstrap creates a disposable complete migration chain", async () => {
  const root = resolve(import.meta.dirname, "..");
  const database = resolve(root, ".local", "prospector.sqlite");
  await rm(database, { force: true });
  const output = execFileSync(process.execPath, ["scripts/local-bootstrap.mjs", "--reset"], { cwd: root, encoding: "utf8" });
  assert.match(output, /"status":"ready"/);
  assert.equal(execFileSync("sqlite3", [database, "PRAGMA foreign_key_check;"], { encoding: "utf8" }).trim(), "");
  assert.ok(Number(execFileSync("sqlite3", [database, "SELECT count(*) FROM sqlite_master WHERE type='table';"], { encoding: "utf8" }).trim()) >= 40);
  await rm(database, { force: true });
});
