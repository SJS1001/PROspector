import { strict as assert } from "node:assert";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { basename, resolve } from "node:path";
import { browserAcceptanceStatePath, createBrowserAcceptanceRuntimeRoot, scrubbedBrowserEnvironment } from "./browser-acceptance-boundary.mjs";
import { personDiscoveryC4Bindings } from "./person-discovery-browser-boundary.mjs";

if (process.argv.length !== 2) throw new Error("unsupported_person_discovery_browser_option");
const root = resolve(import.meta.dirname, "..");
const localRoot = resolve(root, ".local");
await mkdir(localRoot, { recursive: true });
const stateRoot = await mkdtemp(resolve(localRoot, "browser-acceptance-state-c4-"));
const runId = basename(stateRoot).replace("browser-acceptance-state-", "");
const artifactRoot = resolve(localRoot, `browser-acceptance-failures-${runId}`);
const browserCache = resolve(localRoot, "playwright-browsers");
const isolatedHome = resolve(stateRoot, "home"), isolatedConfig = resolve(stateRoot, "config"), isolatedCache = resolve(stateRoot, "cache"), isolatedTemp = resolve(stateRoot, "tmp");
await Promise.all([isolatedHome, isolatedConfig, isolatedCache, isolatedTemp, browserCache].map((path) => mkdir(path, { recursive: true })));
const hostingConfig = JSON.parse(await readFile(resolve(root, ".openai", "hosting.json"), "utf8"));
const runtimeRoot = await createBrowserAcceptanceRuntimeRoot(root, stateRoot, hostingConfig, personDiscoveryC4Bindings());
const state = browserAcceptanceStatePath(stateRoot);
const config = resolve(runtimeRoot, "wrangler.browser-acceptance.json");
const port = await reservePort();
const env = scrubbedBrowserEnvironment({
  HOME: isolatedHome, XDG_CONFIG_HOME: isolatedConfig, XDG_CACHE_HOME: isolatedCache,
  TMPDIR: isolatedTemp, TEMP: isolatedTemp, TMP: isolatedTemp,
  NPM_CONFIG_USERCONFIG: resolve(isolatedConfig, "npmrc"), NPM_CONFIG_GLOBALCONFIG: resolve(isolatedConfig, "global-npmrc"),
  PLAYWRIGHT_BROWSERS_PATH: browserCache,
  PROSPECTOR_BROWSER_PORT: String(port), PROSPECTOR_BROWSER_STATE: state,
  PROSPECTOR_BROWSER_ARTIFACTS: artifactRoot, PROSPECTOR_BROWSER_ORIGIN: `http://127.0.0.1:${port}`,
  PROSPECTOR_BROWSER_ACCEPTANCE: "1", PROSPECTOR_BROWSER_RUNTIME_ROOT: runtimeRoot,
  PROSPECTOR_BROWSER_LANE: "person-discovery-c4",
  WRANGLER_SEND_METRICS: "false", WRANGLER_WRITE_LOGS: "false", WRANGLER_LOG_PATH: resolve(stateRoot, "wrangler.log"),
  MINIFLARE_REGISTRY_PATH: resolve(stateRoot, "registry"), NO_UPDATE_NOTIFIER: "1", CI: "1",
});
let passed = false;
let failure;
try {
  await run(process.execPath, ["scripts/person-discovery-browser-bootstrap.mjs", "--state", state, "--config", config], env);
  await run(resolve(root, "node_modules", ".bin", "playwright"), ["test", "--config", "playwright.config.ts"], env);
  await run(process.execPath, ["scripts/verify-person-discovery-c4.mjs", "--state", state], env);
  passed = true;
  process.stdout.write("person discovery C4 browser acceptance passed\n");
} catch (error) { failure = error; }
finally {
  await rm(stateRoot, { recursive: true, force: true });
  if (passed) await rm(artifactRoot, { recursive: true, force: true });
}
if (failure) throw failure;

function reservePort() { return new Promise((resolvePort, reject) => { const socket = createServer(); socket.once("error", reject); socket.listen(0, "127.0.0.1", () => { const address = socket.address(); assert.equal(typeof address, "object"); socket.close((error) => error ? reject(error) : resolvePort(address.port)); }); }); }
function run(command, args, environment) { return new Promise((resolveRun, reject) => { const child = spawn(command, args, { cwd: root, env: environment, stdio: ["ignore", "pipe", "pipe"] }); let output = ""; child.stdout.on("data", (chunk) => { output += chunk; process.stdout.write(chunk); }); child.stderr.on("data", (chunk) => { output += chunk; process.stderr.write(chunk); }); child.once("error", reject); child.once("close", (code) => code === 0 ? resolveRun() : reject(new Error(`${basename(command)} failed (${code})\n${output.slice(-8000)}`))); }); }
