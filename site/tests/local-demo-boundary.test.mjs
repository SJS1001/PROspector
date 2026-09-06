import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { createServer } from "vite";

const root = resolve(import.meta.dirname, "..");
const state = resolve(root, ".local", "test-demo-persistence-state");
const wrangler = resolve(root, "node_modules/.bin/wrangler");
const command = (sql) => execFileSync(wrangler, ["d1", "execute", "DB", "--local", "--persist-to", state, "--config", "wrangler.local.jsonc", "--command", sql], { encoding: "utf8" });
const tableCount = (output) => {
  const match = output.match(/"count":\s*(\d+)/);
  assert.ok(match, "Wrangler should return the persisted table count");
  return Number(match[1]);
};

test("LOCAL_DEMO is server-only and rejects every ordinary runtime shape", async () => {
  const source = await readFile(resolve(root, "app/runtime-identity.ts"), "utf8");
  assert.match(source, /import\.meta\.env\.DEV/);
  assert.match(source, /TRUSTED_IDENTITY_PROVIDER !== "local-demo"/);
  assert.match(source, /local-owner@prospector\.invalid/);
  assert.match(source, /isLoopbackHostname/);
  assert.match(source, /new URL\(origin\)\.origin !== new URL\(request\.url\)\.origin/);
  assert.doesNotMatch(source, /process\.env\.LOCAL_DEMO/);
  const demoPage = await readFile(resolve(root, "app/local-demo/page.tsx"), "utf8");
  assert.match(demoPage, /credentials: "same-origin"/);
  assert.match(demoPage, /data-local-demo-visible="true"/);
  assert.match(demoPage, /Local demo interview/);
  assert.match(demoPage, /Start company setup/);
  assert.doesNotMatch(demoPage, /action:\s*"bootstrap"|Initialize local interview/);
  assert.match(demoPage, /Local demo setup steps/);
  assert.match(demoPage, /demoState === "active"/);
  assert.match(demoPage, /Open Consensus Knowledge/);
  assert.match(demoPage, /import Link from "next\/link"/);
  assert.match(demoPage, /href="\/\?view=knowledge"/);
  assert.match(demoPage, /aria-live="polite"/);
  assert.doesNotMatch(demoPage, /headers\.get\("set-cookie"\)|cookie:/);
  const styles = await readFile(resolve(root, "app/globals.css"), "utf8");
  assert.match(styles, /\.local-demo-screen \{ min-height:100vh; display:grid; place-items:center;/);
  const routes = await Promise.all(["contacts","discovery","interview","knowledge","prospecting"].map((name) => readFile(resolve(root, `app/api/${name}/route.ts`), "utf8")));
  for (const route of routes) assert.match(route, /runtimeIdentity/);
});

test("LOCAL_DEMO recognizes only canonical loopback hostnames, including bracketed IPv6", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const identity = await vite.ssrLoadModule(resolve(root, "app/runtime-identity.ts"));
    for (const hostname of ["localhost", "LOCALHOST", "127.0.0.1", "::1", "[::1]"])
      assert.equal(identity.isLoopbackHostname(hostname), true, hostname);
    for (const hostname of [null, "", "localhost.", "0.0.0.0", "127.0.0.2", "[::2]", "example.test"])
      assert.equal(identity.isLoopbackHostname(hostname), false, String(hostname));
  } finally {
    await vite.close();
  }
});

test("LOCAL_DEMO uses a Safari-compatible HTTP cookie only inside the guarded loopback seam", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const identity = await vite.ssrLoadModule(resolve(root, "app/runtime-identity.ts"));
    const csrf = await vite.ssrLoadModule(resolve(root, "domain/csrf.ts"));
    const token = "a".repeat(43);

    assert.equal(identity.isLocalDemoRequest(
      new Request("http://localhost:8788/api/interview"),
      { TRUSTED_IDENTITY_PROVIDER: "local-demo", LOCAL_DEMO: "1" },
    ), true);
    assert.equal(identity.isLocalDemoRequest(
      new Request("https://prospector.example/api/interview"),
      { TRUSTED_IDENTITY_PROVIDER: "local-demo", LOCAL_DEMO: "1" },
    ), false);
    assert.equal(identity.isLocalDemoRequest(
      new Request("http://localhost:8788/api/interview"),
      { TRUSTED_IDENTITY_PROVIDER: "local-demo", LOCAL_DEMO: "true" },
    ), false);
    assert.equal(
      csrf.csrfCookie(token, "local-demo"),
      `prospector-local-csrf=${token}; Path=/; Max-Age=900; HttpOnly; SameSite=Strict`,
    );
    assert.equal(
      csrf.csrfCookie(token),
      `__Host-prospector-csrf=${token}; Path=/; Max-Age=900; HttpOnly; Secure; SameSite=Strict`,
    );
  } finally {
    await vite.close();
  }

  const route = await readFile(resolve(root, "app/api/interview/route.ts"), "utf8");
  assert.match(route, /isLocalDemoRequest/);
  assert.match(route, /csrfCookieMode:[\s\S]*\? "local-demo"[\s\S]*: "secure"/);
});

test("local demo routes only interview authority commands through the dedicated loopback boundary", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const { knowledgeMutationTransport } = await vite.ssrLoadModule(resolve(root, "app/knowledge/mutation-transport.ts"));
    for (const hostname of ["localhost", "LOCALHOST", "127.0.0.1", "::1", "[::1]"]) {
      assert.deepEqual(knowledgeMutationTransport("submit_interview_answer", hostname), {
        endpoint: "/api/interview",
        intent: "interview-mutation",
        returnsKnowledgeProjection: false,
      });
      assert.equal(knowledgeMutationTransport("record_interview_decision", hostname).endpoint, "/api/interview");
      assert.equal(knowledgeMutationTransport("advance_local_interview", hostname).endpoint, "/api/interview");
      assert.equal(knowledgeMutationTransport("propose_owner_edit", hostname).endpoint, "/api/knowledge");
    }
    for (const hostname of ["", "localhost.", "127.0.0.2", "0.0.0.0", "example.test"]) {
      assert.equal(knowledgeMutationTransport("submit_interview_answer", hostname).endpoint, "/api/knowledge");
      assert.equal(knowledgeMutationTransport("record_interview_decision", hostname).endpoint, "/api/knowledge");
      assert.equal(knowledgeMutationTransport("advance_local_interview", hostname).endpoint, "/api/knowledge");
    }
  } finally {
    await vite.close();
  }
});

test("local persisted runtime state survives a separate local process", async () => {
  await rm(state, { recursive: true, force: true });
  execFileSync(process.execPath, ["scripts/local-bootstrap.mjs", "--reset", "--state", ".local/test-demo-persistence-state"], { cwd: root });
  const first = tableCount(command("SELECT count(*) AS count FROM sqlite_master WHERE type='table';"));
  const second = tableCount(command("SELECT count(*) AS count FROM sqlite_master WHERE type='table';"));
  assert.ok(first >= 40, `expected the complete schema, found ${first} tables`);
  assert.equal(second, first);
  await rm(state, { recursive: true, force: true });
});
