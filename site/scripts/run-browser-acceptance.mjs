import { strict as assert } from "node:assert";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { basename, resolve } from "node:path";
import {
  browserAcceptanceStatePath,
  createBrowserAcceptanceRuntimeRoot,
  scrubbedBrowserEnvironment,
} from "./browser-acceptance-boundary.mjs";

const root = resolve(import.meta.dirname, "..");
const admissionOnly = process.argv.length === 3 && process.argv[2] === "--admission-only";
if (process.argv.length > (admissionOnly ? 3 : 2)) throw new Error("unsupported_browser_acceptance_option");
const localRoot = resolve(root, ".local");
await mkdir(localRoot, { recursive: true });
const stateRoot = await mkdtemp(resolve(localRoot, "browser-acceptance-state-"));
const runId = basename(stateRoot).replace("browser-acceptance-state-", "");
const artifactRoot = resolve(localRoot, `browser-acceptance-failures-${runId}`);
const isolatedHome = resolve(stateRoot, "home");
const isolatedConfig = resolve(stateRoot, "config");
const isolatedCache = resolve(stateRoot, "cache");
const isolatedTemp = resolve(stateRoot, "tmp");
const browserCache = resolve(localRoot, "playwright-browsers");
await Promise.all([
  mkdir(isolatedHome, { recursive: true }),
  mkdir(isolatedConfig, { recursive: true }),
  mkdir(isolatedCache, { recursive: true }),
  mkdir(isolatedTemp, { recursive: true }),
  mkdir(browserCache, { recursive: true }),
]);
const hostingConfig = JSON.parse(await readFile(resolve(root, ".openai", "hosting.json"), "utf8"));
const runtimeRoot = await createBrowserAcceptanceRuntimeRoot(root, stateRoot, hostingConfig);
// Keep disposable runtime persistence below (not equal to) the isolation root:
// local-bootstrap resets its requested state path and must not erase the
// acceptance config, HOME, caches, or generated Wrangler configuration.
const state = browserAcceptanceStatePath(stateRoot);
const port = await reservePort();
const childEnvironment = scrubbedBrowserEnvironment({
  HOME: isolatedHome,
  XDG_CONFIG_HOME: isolatedConfig,
  XDG_CACHE_HOME: isolatedCache,
  TMPDIR: isolatedTemp,
  TEMP: isolatedTemp,
  TMP: isolatedTemp,
  NPM_CONFIG_USERCONFIG: resolve(isolatedConfig, "npmrc"),
  NPM_CONFIG_GLOBALCONFIG: resolve(isolatedConfig, "global-npmrc"),
  PLAYWRIGHT_BROWSERS_PATH: browserCache,
  PROSPECTOR_BROWSER_PORT: String(port),
  PROSPECTOR_BROWSER_STATE: state,
  PROSPECTOR_BROWSER_ARTIFACTS: artifactRoot,
  PROSPECTOR_BROWSER_ORIGIN: `http://127.0.0.1:${port}`,
  PROSPECTOR_BROWSER_ACCEPTANCE: "1",
  PROSPECTOR_BROWSER_RUNTIME_ROOT: runtimeRoot,
  WRANGLER_SEND_METRICS: "false",
  WRANGLER_WRITE_LOGS: "false",
  WRANGLER_LOG_PATH: resolve(stateRoot, "wrangler.log"),
  MINIFLARE_REGISTRY_PATH: resolve(stateRoot, "registry"),
  NO_UPDATE_NOTIFIER: "1",
  CI: "1",
});

let passed = false;
let failure;
try {
  await run(process.execPath, ["scripts/local-bootstrap.mjs", "--reset", "--state", state], childEnvironment);
  const playwrightArguments = ["test", "--config", "playwright.config.ts"];
  if (admissionOnly) playwrightArguments.push("--grep", "acceptance runtime admits the fixed synthetic owner");
  await run(resolve(root, "node_modules", ".bin", "playwright"), playwrightArguments, childEnvironment);
  await run(process.execPath, [
    "scripts/verify-browser-zero-effects.mjs", "--state", state,
    ...(admissionOnly ? ["--allow-incomplete"] : []),
  ], childEnvironment);
  passed = true;
  process.stdout.write(admissionOnly ? "browser acceptance admission passed\n" : "browser acceptance passed\n");
} catch (error) {
  failure = error;
  try {
    await run(process.execPath, ["scripts/verify-browser-zero-effects.mjs", "--state", state, "--allow-incomplete"], childEnvironment);
  } catch (verificationError) {
    failure = new AggregateError([error, verificationError], "browser_acceptance_and_zero_effect_verification_failed");
  }
} finally {
  await rm(stateRoot, { recursive: true, force: true });
  if (passed) await rm(artifactRoot, { recursive: true, force: true });
}
if (failure) throw failure;

function reservePort() {
  return new Promise((resolvePort, reject) => {
    const socket = createServer();
    socket.once("error", reject);
    socket.listen(0, "127.0.0.1", () => {
      const address = socket.address();
      assert.equal(typeof address, "object");
      socket.close((error) => error ? reject(error) : resolvePort(address.port));
    });
  });
}

function run(command, args, env) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk.toString(); process.stdout.write(chunk); });
    child.stderr.on("data", (chunk) => { output += chunk.toString(); process.stderr.write(chunk); });
    child.once("error", reject);
    child.once("close", (code) => code === 0 ? resolveRun() : reject(new Error(`${basename(command)} failed (${code})\n${output.slice(-8000)}`)));
  });
}
