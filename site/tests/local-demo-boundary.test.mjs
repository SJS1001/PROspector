import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");
const state = resolve(root, ".local", "test-demo-persistence-state");
const wrangler = resolve(root, "node_modules/.bin/wrangler");
const command = (sql) => execFileSync(wrangler, ["d1", "execute", "DB", "--local", "--persist-to", state, "--config", "wrangler.local.jsonc", "--command", sql], { encoding: "utf8" });

test("LOCAL_DEMO is server-only and rejects every ordinary runtime shape", async () => {
  const source = await readFile(resolve(root, "app/runtime-identity.ts"), "utf8");
  assert.match(source, /import\.meta\.env\.DEV/);
  assert.match(source, /localDemo !== "1"/);
  assert.match(source, /local-owner@prospector\.invalid/);
  assert.match(source, /host !== "localhost"/);
  assert.match(source, /origin\).*host !== new URL\(request\.url\)\.host/);
  assert.doesNotMatch(source, /process\.env\.LOCAL_DEMO/);
  const demoPage = await readFile(resolve(root, "app/local-demo/page.tsx"), "utf8");
  assert.match(demoPage, /credentials: "same-origin"/);
  assert.doesNotMatch(demoPage, /headers\.get\("set-cookie"\)|cookie:/);
  const routes = await Promise.all(["contacts","discovery","interview","knowledge","prospecting"].map((name) => readFile(resolve(root, `app/api/${name}/route.ts`), "utf8")));
  for (const route of routes) assert.match(route, /runtimeIdentity/);
});

test("local persisted runtime state survives a separate local process", async () => {
  await rm(state, { recursive: true, force: true });
  execFileSync(process.execPath, ["scripts/local-bootstrap.mjs", "--reset", "--state", ".local/test-demo-persistence-state"], { cwd: root });
  const first = command("SELECT count(*) AS count FROM sqlite_master WHERE type='table';");
  const second = command("SELECT count(*) AS count FROM sqlite_master WHERE type='table';");
  assert.match(first, /4[0-9]|[5-9][0-9]/);
  assert.equal(second, first);
  await rm(state, { recursive: true, force: true });
});
