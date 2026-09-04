import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

test("local bootstrap creates a disposable complete migration chain", async () => {
  const root = resolve(import.meta.dirname, "..");
  const state = resolve(root, ".local", "test-bootstrap-state");
  await rm(state, { recursive: true, force: true });
  const output = execFileSync(process.execPath, ["scripts/local-bootstrap.mjs", "--reset", "--state", ".local/test-bootstrap-state"], { cwd: root, encoding: "utf8" });
  assert.match(output, /"status":"ready"/);
  const result = execFileSync(resolve(root, "node_modules/.bin/wrangler"), ["d1", "execute", "DB", "--local", "--persist-to", state, "--config", "wrangler.local.jsonc", "--command", "SELECT count(*) FROM sqlite_master WHERE type='table';"], { encoding: "utf8" });
  assert.match(result, /4[0-9]|[5-9][0-9]/);
  await rm(state, { recursive: true, force: true });
});
