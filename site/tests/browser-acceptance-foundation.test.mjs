import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { basename, resolve } from "node:path";
import test from "node:test";
import { loadEnv } from "vite";
import {
  BROWSER_ACCEPTANCE_BINDINGS,
  BROWSER_ACCEPTANCE_CONFIG,
  browserAcceptanceCloudflareOptions,
  browserAcceptanceStatePath,
  createBrowserAcceptanceRuntimeRoot,
  scrubbedBrowserEnvironment,
} from "../scripts/browser-acceptance-boundary.mjs";

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
  assert.ok(spec.includes('"vite", "bin", "vite.js"'), "the acceptance server must launch Vite with Node, not npm or Vinext's dotenv-loading CLI");
  assert.equal(spec.includes('spawn("npm"'), false, "npm config discovery is outside the acceptance lane");
  assert.equal(spec.includes('"vinext", "dist", "cli.js"'), false, "Vinext's CLI performs project dotenv discovery before Vite config loads");
  assert.ok(spec.includes('fetch(`${origin}/api/interview`)'), "server readiness must require admitted runtime identity");
  assert.ok(spec.includes("expect(admitted.status()).toBe(200)"), "the browser contract must assert admission before onboarding");
  for (const forbidden of ["storageState", "recordHar", "context.cookies(", "page.screenshot(", "https://github.com", "cloudflare.com"]) {
    assert.equal(spec.includes(forbidden), false, forbidden);
  }

  const runner = await readFile(resolve(root, "scripts/run-browser-acceptance.mjs"), "utf8");
  for (const isolated of ["HOME: isolatedHome", "XDG_CONFIG_HOME: isolatedConfig", "XDG_CACHE_HOME: isolatedCache", "NPM_CONFIG_USERCONFIG:", "NPM_CONFIG_GLOBALCONFIG:", "PROSPECTOR_BROWSER_ACCEPTANCE:", "PROSPECTOR_BROWSER_RUNTIME_ROOT:", "PLAYWRIGHT_BROWSERS_PATH: browserCache"]) {
    assert.ok(runner.includes(isolated), `${isolated} must be isolated or explicitly non-secret`);
  }
  assert.equal(runner.includes('["PATH", "HOME"'), false, "the caller home must never be forwarded");
  assert.equal(runner.includes('process.env.PLAYWRIGHT_BROWSERS_PATH'), false, "the caller browser-cache path must never be discovered");
  assert.ok(runner.includes("const state = browserAcceptanceStatePath(stateRoot)"));
  assert.ok(runner.includes('"acceptance runtime admits the fixed synthetic owner"'));
  assert.ok(runner.includes('["scripts/local-bootstrap.mjs", "--reset", "--state", state]'));
  assert.ok(runner.includes('"scripts/verify-browser-zero-effects.mjs", "--state", state'));

  const viteConfig = await readFile(resolve(root, "vite.config.ts"), "utf8");
  for (const contract of ["root: browserRuntimeRoot, envDir: browserRuntimeRoot", "browserAcceptanceCloudflareOptions", "statePath: localStatePath"]) {
    assert.ok(viteConfig.includes(contract), `${contract} must remain explicit`);
  }
});

test("hostile project and global config cannot enter the acceptance runtime or child environment", async () => {
  const local = resolve(root, ".local");
  await mkdir(local, { recursive: true });
  const fixtureRoot = await mkdtemp(resolve(local, "browser-hostile-source-"));
  const stateRoot = await mkdtemp(resolve(local, "browser-acceptance-state-hostile-"));
  const marker = "must-not-enter-browser-runtime";
  try {
    await Promise.all([
      writeFile(resolve(fixtureRoot, ".env"), `CLOUDFLARE_API_TOKEN=${marker}\nHOSTILE_ENV_MARKER=${marker}\n`),
      writeFile(resolve(fixtureRoot, ".env.development"), `WRANGLER_HYPERDRIVE_LOCAL_CONNECTION_STRING_DB=${marker}\n`),
      writeFile(resolve(fixtureRoot, ".dev.vars"), `PILOT_OWNER_EMAIL=hostile@example.com\nHOSTILE_DEV_VARS_MARKER=${marker}\n`),
      writeFile(resolve(fixtureRoot, ".npmrc"), `//registry.example.invalid/:_authToken=${marker}\n`),
      writeFile(resolve(fixtureRoot, "global-npmrc"), `cafile=${marker}\n`),
    ]);
    const runtimeRoot = await createBrowserAcceptanceRuntimeRoot(fixtureRoot, stateRoot, { d1: "DB", r2: "FILES" });
    const statePath = browserAcceptanceStatePath(stateRoot);
    await mkdir(statePath, { recursive: true });
    for (const forbidden of [".env", ".env.development", ".dev.vars", ".npmrc", "global-npmrc"]) {
      await assert.rejects(access(resolve(runtimeRoot, forbidden)), { code: "ENOENT" });
    }
    const generatedConfig = JSON.parse(await readFile(resolve(runtimeRoot, BROWSER_ACCEPTANCE_CONFIG), "utf8"));
    assert.deepEqual(generatedConfig.vars, BROWSER_ACCEPTANCE_BINDINGS);
    assert.equal(generatedConfig.vars.PILOT_OWNER_EMAIL, "local-owner@prospector.invalid");
    assert.deepEqual(generatedConfig.secrets, {});
    const cloudflareOptions = browserAcceptanceCloudflareOptions({
      projectRoot: root,
      runtimeRoot,
      statePath,
    });
    assert.equal(cloudflareOptions.persistState.path, statePath);
    assert.equal(cloudflareOptions.configPath, resolve(runtimeRoot, BROWSER_ACCEPTANCE_CONFIG));

    const discoveredByVite = loadEnv("development", runtimeRoot, "");
    for (const forbidden of [
      "CLOUDFLARE_API_TOKEN",
      "HOSTILE_ENV_MARKER",
      "WRANGLER_HYPERDRIVE_LOCAL_CONNECTION_STRING_DB",
    ]) {
      assert.equal(discoveredByVite[forbidden], undefined);
    }
    const child = scrubbedBrowserEnvironment({
      HOME: resolve(stateRoot, "home"),
      XDG_CONFIG_HOME: resolve(stateRoot, "config"),
      XDG_CACHE_HOME: resolve(stateRoot, "cache"),
      TMPDIR: resolve(stateRoot, "tmp"),
      NPM_CONFIG_USERCONFIG: resolve(stateRoot, "config", "npmrc"),
      NPM_CONFIG_GLOBALCONFIG: resolve(stateRoot, "config", "global-npmrc"),
      WRANGLER_SEND_METRICS: "false",
      WRANGLER_WRITE_LOGS: "false",
      WRANGLER_LOG_PATH: resolve(stateRoot, "wrangler.log"),
    }, {
      PATH: "/synthetic/bin",
      CLOUDFLARE_API_TOKEN: marker,
      HOSTILE_ENV_MARKER: marker,
      npm_config_userconfig: resolve(fixtureRoot, ".npmrc"),
      NPM_CONFIG_GLOBALCONFIG: resolve(fixtureRoot, "global-npmrc"),
    });
    assert.equal(JSON.stringify(child).includes(marker), false);
    assert.equal(JSON.stringify(child).includes(fixtureRoot), false);
    await Promise.all(["home", "config", "cache", "tmp"].map((directory) => mkdir(resolve(stateRoot, directory), { recursive: true })));
    const probe = spawnSync(process.execPath, ["tests/helpers/probe-browser-dev-vars.mjs", runtimeRoot], {
      cwd: root,
      env: child,
      encoding: "utf8",
    });
    assert.equal(probe.status, 0, probe.stderr);
    assert.deepEqual(JSON.parse(probe.stdout), BROWSER_ACCEPTANCE_BINDINGS);
    assert.equal(`${probe.stdout}\n${probe.stderr}`.includes(marker), false);
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
    await rm(stateRoot, { recursive: true, force: true });
  }
});

test("bootstrap, Miniflare, and verifier share one absolute per-run state path", async () => {
  const local = resolve(root, ".local");
  await mkdir(local, { recursive: true });
  const stateRoot = await mkdtemp(resolve(local, "browser-acceptance-state-path-"));
  try {
    const runtimeRoot = await createBrowserAcceptanceRuntimeRoot(root, stateRoot, { d1: "DB", r2: "FILES" });
    const statePath = browserAcceptanceStatePath(stateRoot);
    await mkdir(statePath, { recursive: true });
    assert.equal(statePath.startsWith(`${stateRoot}/`), true);
    const options = browserAcceptanceCloudflareOptions({ projectRoot: root, runtimeRoot, statePath });
    assert.deepEqual(options.persistState, { path: statePath });

    await assert.rejects(async () => browserAcceptanceCloudflareOptions({
      projectRoot: root,
      runtimeRoot,
      statePath: ".local/not-absolute",
    }), /must be absolute/);
    const wrongState = resolve(stateRoot, "wrong-state");
    await mkdir(wrongState, { recursive: true });
    assert.throws(() => browserAcceptanceCloudflareOptions({
      projectRoot: root,
      runtimeRoot,
      statePath: wrongState,
    }), /must share the per-run state root/);
  } finally {
    await rm(stateRoot, { recursive: true, force: true });
  }
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
    const incomplete = verify(stateRoot, "--allow-incomplete");
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
