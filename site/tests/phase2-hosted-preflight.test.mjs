import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPreflightCommands,
  parsePreflightArgs,
  redactPreflightReport,
} from "../scripts/phase2-hosted-preflight.mjs";

test("preflight admits only fixed read-only commands and redacts reports", () => {
  const options = parsePreflightArgs(["--mode", "old-schema", "--database", "pilot_d1"]);
  const commands = buildPreflightCommands(options);
  assert.ok(commands.length >= 3);
  for (const command of commands) {
    assert.equal(command.args[0], "d1");
    assert.ok(command.args.includes("--remote"));
    if (command.args[1] === "migrations") continue;
    const sql = command.args.at(-1);
    assert.match(sql, /^(SELECT|PRAGMA)/u);
    assert.doesNotMatch(sql, /\b(INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|REPLACE|ATTACH|DETACH|VACUUM)\b/iu);
  }
  assert.deepEqual(redactPreflightReport({ mode: "old-schema", migrationIds: ["0000", "0001", "0002", "0003"], protectedDigest: "a".repeat(64), workspaceId: "secret", rows: [{ email: "private@example.test" }] }), {
    ok: true, mode: "old-schema", migrationIds: ["0000", "0001", "0002", "0003"], protectedDigest: "a".repeat(64),
  });
});

test("preflight blocks unsupported modes, unsafe database values, and schema mismatches", () => {
  for (const args of [
    ["--mode", "old-schema", "--database", "pilot;DROP"],
    ["--mode", "old-schema", "--database", "pilot\nname"],
    ["--mode", "delete", "--database", "pilot"],
    ["--mode", "old-schema", "--database", "pilot", "--sql", "SELECT 1"],
  ]) assert.throws(() => parsePreflightArgs(args));
  assert.throws(() => redactPreflightReport({ mode: "post-migration", migrationIds: ["0000", "0001", "0002", "0003"], protectedDigest: "a".repeat(64) }), /migration_chain_mismatch/u);
});
