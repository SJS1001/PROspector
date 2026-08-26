import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const state = ".local/local-demo-smoke-state";
const statePath = resolve(root, state);

await assertLocalDemoBindings();
await rm(statePath, { recursive: true, force: true });
await run(process.execPath, ["scripts/local-bootstrap.mjs", "--reset", "--state", state], { cwd: root });

const port = await availablePort();
const server = spawn(resolve(root, "node_modules/.bin/vinext"), ["dev", "--host", "localhost", "--port", String(port), "--strictPort"], {
  cwd: root,
  env: { ...process.env, PROSPECTOR_LOCAL_STATE_PATH: state, WRANGLER_LOG_PATH: ".wrangler/wrangler.log" },
  stdio: ["ignore", "pipe", "pipe"],
});

let output = "";
server.stdout.on("data", (chunk) => { output += chunk.toString(); });
server.stderr.on("data", (chunk) => { output += chunk.toString(); });

try {
  const base = `http://localhost:${port}`;
  await waitFor(() => fetch(`${base}/local-demo`).then((response) => response.ok ? response : Promise.reject(new Error(`status_${response.status}`))));
  const page = await fetch(`${base}/local-demo`);
  assert.match(await page.text(), /Local demo interview/);

  const initial = await fetch(`${base}/api/interview`);
  assert.equal(initial.status, 200);
  assert.equal((await initial.clone().json()).status, "uninitialized");
  const cookie = csrfCookie(initial);

  const hostile = await fetch(`${base}/api/interview`, {
    method: "POST",
    headers: mutationHeaders(base, cookie, "cross-site"),
    body: JSON.stringify({ action: "bootstrap" }),
  });
  assert.equal(hostile.status, 403);
  assert.equal((await hostile.json()).error, "foreign_origin");

  const accepted = await fetch(`${base}/api/interview`, {
    method: "POST",
    headers: mutationHeaders(base, cookie, "same-origin"),
    body: JSON.stringify({ action: "bootstrap" }),
  });
  assert.equal(accepted.status, 200);
  assert.equal((await accepted.json()).status, "active");
  process.stdout.write("local demo smoke passed\n");
} finally {
  server.kill("SIGTERM");
  await onceClosed(server);
  await rm(statePath, { recursive: true, force: true });
}

async function assertLocalDemoBindings() {
  const source = await readFile(resolve(root, ".dev.vars"), "utf8");
  const entries = new Map(source.split(/\r?\n/).flatMap((line) => {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    return match ? [[match[1], match[2]]] : [];
  }));
  assert.equal(entries.get("LOCAL_DEMO"), "1");
  assert.equal(entries.get("PILOT_OWNER_EMAIL"), "local-owner@prospector.invalid");
  assert.ok((entries.get("OWNER_SUBJECT_PEPPER")?.length ?? 0) >= 32);
}

function mutationHeaders(origin, cookie, fetchSite) {
  return {
    origin,
    cookie,
    "sec-fetch-site": fetchSite,
    "content-type": "application/json",
    "x-prospector-intent": "interview-mutation",
  };
}

function csrfCookie(response) {
  const cookie = response.headers.get("set-cookie")?.split(";", 1)[0] ?? "";
  assert.match(cookie, /^__Host-prospector-csrf=[A-Za-z0-9_-]{43}$/);
  return cookie;
}

function availablePort() {
  return new Promise((resolvePort, reject) => {
    const socket = createServer();
    socket.once("error", reject);
    socket.listen(0, "::1", () => {
      const address = socket.address();
      socket.close((error) => error ? reject(error) : resolvePort(address.port));
    });
  });
}

function waitFor(action, attempts = 80) {
  return new Promise((resolveResult, reject) => {
    const retry = () => {
      action().then(resolveResult, (error) => {
        if (attempts-- <= 0) return reject(new Error(`local_demo_server_unavailable: ${output}\n${error.message}`));
        setTimeout(retry, 100);
      });
    };
    retry();
  });
}

function run(command, args, options) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { ...options, stdio: "pipe" });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk.toString(); });
    child.stderr.on("data", (chunk) => { output += chunk.toString(); });
    child.once("error", reject);
    child.once("close", (code) => code === 0 ? resolveRun() : reject(new Error(`local_demo_bootstrap_failed (${code}): ${output}`)));
  });
}

function onceClosed(child) {
  return new Promise((resolveClose) => {
    if (child.exitCode !== null) return resolveClose();
    child.once("close", resolveClose);
    setTimeout(resolveClose, 2_000);
  });
}
