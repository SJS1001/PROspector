import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { basename, resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");

test("browser tooling is exact-pinned and retains only synthetic failure screenshots", async () => {
  const manifest = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
  assert.equal(manifest.devDependencies["@playwright/test"], "1.63.0");
  assert.equal(manifest.devDependencies["@axe-core/playwright"], "4.13.0");
  assert.equal(manifest.scripts["test:browser"], "node scripts/run-browser-acceptance.mjs");

  const config = await readFile(resolve(root, "playwright.config.ts"), "utf8");
  for (const contract of ["workers: 1", "retries: 0", "timeout: 120_000", 'screenshot: "only-on-failure"', 'trace: "off"', 'video: "off"', "acceptDownloads: false", 'serviceWorkers: "block"']) {
    assert.match(config, new RegExp(contract.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  for (const forbidden of ["webServer:", "reuseExistingServer", "storageState:", "recordHar", "har:"]) {
    assert.equal(config.includes(forbidden), false, forbidden);
  }

  const spec = await readFile(resolve(root, "tests/browser/onboarding.spec.ts"), "utf8");
  for (const synthetic of ["Northstar", "Harbor Pulse", "Port Operations", "Bulk Terminal Operators"]) assert.ok(spec.includes(synthetic));
  assert.ok(spec.includes("new AxeBuilder"));
  assert.ok(spec.includes('requested.origin === origin'));
  assert.ok(spec.includes('process.kill(-child.pid, "SIGTERM")'));
  assert.ok(spec.includes("MAX_SUPPORTED_ONBOARDING_STEPS = 32"));
  assert.ok(spec.includes("queue expansion requires an explicit browser-bound review"));
  assert.equal(spec.includes("index < 8"), false, "the journey must not silently stop at the old eight-question cap");
  for (const forbidden of ["storageState", "recordHar", "context.cookies(", "page.screenshot(", "https://github.com", "cloudflare.com"]) {
    assert.equal(spec.includes(forbidden), false, forbidden);
  }

  const runner = await readFile(resolve(root, "scripts/run-browser-acceptance.mjs"), "utf8");
  for (const isolated of ["HOME: isolatedHome", "XDG_CONFIG_HOME: isolatedConfig", "XDG_CACHE_HOME: isolatedCache", "NPM_CONFIG_USERCONFIG:", "PLAYWRIGHT_BROWSERS_PATH: browserCache"]) {
    assert.ok(runner.includes(isolated), `${isolated} must be isolated or explicitly non-secret`);
  }
  assert.equal(runner.includes('["PATH", "HOME"'), false, "the caller home must never be forwarded");
  assert.equal(runner.includes('process.env.PLAYWRIGHT_BROWSERS_PATH'), false, "the caller browser-cache path must never be discovered");
});

test("browser bootstrap remains the exact authoritative 0000-0009 chain", async () => {
  const bootstrap = await readFile(resolve(root, "scripts/local-bootstrap.mjs"), "utf8");
  const migrations = [...bootstrap.matchAll(/"(\d{4}_[a-z0-9_-]+\.sql)"/g)].map((match) => match[1]);
  assert.deepEqual(migrations, [
    "0000_jittery_meteorite.sql",
    "0001_true_spencer_smythe.sql",
    "0002_eager_supreme_intelligence.sql",
    "0003_acoustic_magik.sql",
    "0004_consensus_knowledge.sql",
    "0005_even_mastermind.sql",
    "0006_private-proof-run-binding.sql",
    "0007_profile_prospecting.sql",
    "0008_controlled_enrichment.sql",
    "0009_gorgeous_captain_universe.sql",
  ]);
  assert.equal(/"001\d_/.test(bootstrap), false, "later candidate migrations are outside browser acceptance");
});

test("zero-effect verifier accepts the exact synthetic fit and rejects a forbidden row", async () => {
  const local = resolve(root, ".local");
  await mkdir(local, { recursive: true });
  const stateRoot = await mkdtemp(resolve(local, "zero-effect-test-"));
  const databasePath = resolve(stateRoot, "application.sqlite");
  const database = new DatabaseSync(databasePath);
  try {
    database.exec("CREATE TABLE workspaces (id TEXT PRIMARY KEY); CREATE TABLE knowledge_versions (id TEXT PRIMARY KEY, status TEXT, kind TEXT); CREATE TABLE prospects (id TEXT PRIMARY KEY);");
  } finally {
    database.close();
  }

  try {
    const relativeState = `.local/${basename(stateRoot)}`;
    const incomplete = verify(relativeState, "--allow-incomplete");
    assert.equal(incomplete.status, 0, incomplete.stderr);
    const incompleteReceipt = JSON.parse(incomplete.stdout);
    assert.deepEqual({ status: incompleteReceipt.status, workspaceCount: incompleteReceipt.workspaceCount, confirmedFitCount: incompleteReceipt.confirmedFitCount, forbiddenRows: incompleteReceipt.forbiddenRows }, { status: "zero-effects-only", workspaceCount: 0, confirmedFitCount: 0, forbiddenRows: 0 });

    const completed = new DatabaseSync(databasePath);
    try { completed.exec("INSERT INTO workspaces VALUES ('synthetic-workspace'); INSERT INTO knowledge_versions VALUES ('synthetic-fit','confirmed','fit');"); } finally { completed.close(); }
    const passed = verify(relativeState);
    assert.equal(passed.status, 0, passed.stderr);
    const receipt = JSON.parse(passed.stdout);
    assert.deepEqual({ status: receipt.status, synthetic: receipt.synthetic, workspaceCount: receipt.workspaceCount, confirmedFitCount: receipt.confirmedFitCount, forbiddenRows: receipt.forbiddenRows }, { status: "passed", synthetic: true, workspaceCount: 1, confirmedFitCount: 1, forbiddenRows: 0 });

    const mutated = new DatabaseSync(databasePath);
    try { mutated.exec("INSERT INTO prospects VALUES ('forbidden-prospect')"); } finally { mutated.close(); }
    const denied = verify(relativeState);
    assert.notEqual(denied.status, 0);
    assert.match(denied.stderr, /prospects_must_remain_empty/);
  } finally {
    await rm(stateRoot, { recursive: true, force: true });
  }
});

function verify(state, ...options) {
  return spawnSync(process.execPath, ["scripts/verify-browser-zero-effects.mjs", "--state", state, ...options], { cwd: root, encoding: "utf8" });
}
