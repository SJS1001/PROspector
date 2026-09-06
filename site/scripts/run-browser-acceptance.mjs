import { strict as assert } from "node:assert";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { basename, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const localRoot = resolve(root, ".local");
await mkdir(localRoot, { recursive: true });
const stateRoot = await mkdtemp(resolve(localRoot, "browser-acceptance-state-"));
const runId = basename(stateRoot).replace("browser-acceptance-state-", "");
const artifactRoot = resolve(localRoot, `browser-acceptance-failures-${runId}`);
const state = `.local/${basename(stateRoot)}`;
const port = await reservePort();
const childEnvironment = scrubbedEnvironment({
  PROSPECTOR_BROWSER_PORT: String(port),
  PROSPECTOR_BROWSER_STATE: state,
  PROSPECTOR_BROWSER_ARTIFACTS: artifactRoot,
  PROSPECTOR_BROWSER_ORIGIN: `http://127.0.0.1:${port}`,
  TRUSTED_IDENTITY_PROVIDER: "local-demo",
  LOCAL_DEMO: "1",
  PILOT_OWNER_EMAIL: "browser-owner@prospector.invalid",
  OWNER_SUBJECT_PEPPER: "synthetic-browser-acceptance-pepper-32-bytes-minimum",
  WRANGLER_SEND_METRICS: "false",
  WRANGLER_WRITE_LOGS: "false",
  WRANGLER_LOG_PATH: `.local/${basename(stateRoot)}/wrangler.log`,
  MINIFLARE_REGISTRY_PATH: `.local/${basename(stateRoot)}/registry`,
  NO_UPDATE_NOTIFIER: "1",
  CI: "1",
});

let passed = false;
let failure;
try {
  await run(process.execPath, ["scripts/local-bootstrap.mjs", "--reset", "--state", state], childEnvironment);
  await run(resolve(root, "node_modules", ".bin", "playwright"), ["test", "--config", "playwright.config.ts"], childEnvironment);
  await run(process.execPath, ["scripts/verify-browser-zero-effects.mjs", "--state", state], childEnvironment);
  passed = true;
  process.stdout.write("browser acceptance passed\n");
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

function scrubbedEnvironment(additions) {
  const environment = {};
  for (const name of ["PATH", "HOME", "TMPDIR", "TEMP", "TMP", "SHELL", "LANG", "LC_ALL", "TERM", "PLAYWRIGHT_BROWSERS_PATH"]) {
    if (process.env[name]) environment[name] = process.env[name];
  }
  return { ...environment, ...additions };
}

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
