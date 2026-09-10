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
  assert.match(source, /TRUSTED_IDENTITY_PROVIDER === "local-demo"/);
  // The demo identity lives in its own dev-only module so a production build
  // drops it with the folded branch; runtime-identity must not carry it inline.
  assert.doesNotMatch(source, /local-owner@prospector\.invalid/);
  assert.match(source, /await import\("\.\/_local-demo-identity"\)/);
  const demoIdentity = await readFile(resolve(root, "app/_local-demo-identity.ts"), "utf8");
  assert.match(demoIdentity, /local-owner@prospector\.invalid/);
  assert.match(demoIdentity, /Local Demo Owner/);
  assert.match(source, /isLoopbackHostname/);
  assert.match(source, /new URL\(origin\)\.origin !== new URL\(request\.url\)\.origin/);
  assert.doesNotMatch(source, /process\.env\.LOCAL_DEMO/);
  const demoPage = await readFile(resolve(root, "app/local-demo/_screen.tsx"), "utf8");
  assert.match(demoPage, /credentials: "same-origin"/);
  assert.match(demoPage, /data-local-demo-visible="true"/);
  assert.match(demoPage, /Supported Phase 4–7 local journey/);
  assert.match(demoPage, /action: "advance"/);
  assert.match(demoPage, /expectedRevision: scenario\.revision/);
  assert.match(demoPage, /Materialization<\/dt><dd>refused/);
  assert.doesNotMatch(demoPage, /TextEncoder|TextDecoder|blob:|data:|download/);
  assert.match(demoPage, /Open Consensus Knowledge/);
  assert.match(demoPage, /import Link from "next\/link"/);
  assert.match(demoPage, /href="\/\?view=knowledge"/);
  assert.match(demoPage, /aria-live="polite"/);
  assert.doesNotMatch(demoPage, /headers\.get\("set-cookie"\)|cookie:/);
  const styles = await readFile(resolve(root, "app/globals.css"), "utf8");
  assert.match(styles, /\.local-demo-screen \{ min-height:100vh; display:grid; place-items:center;/);
  const routes = await Promise.all(["contacts","discovery","interview","knowledge","prospecting"].map((name) => readFile(resolve(root, `app/api/${name}/route.ts`), "utf8")));
  for (const route of routes) assert.match(route, /runtimeIdentity/);

  // The admission in app/page.tsx must be awaited and must be the only source
  // of the rendered access state. It rejects for a denied identity; unawaited,
  // the rejection escapes as an unhandled rejection while a following statement
  // marks the visitor authorized anyway -- admitting precisely when admission
  // was refused, which defeats the loopback check for the page paths, where the
  // identity resolves the host from the Host header.
  //
  // The route now admits through admitOperatorSession rather than a bare
  // admitPilotOwner call, so assert the same guarantee on that shape: the call
  // is awaited, it is not wrapped in a catch that could swallow its rejection,
  // and the access passed to the shell is derived from its result rather than
  // assigned independently.
  const home = await readFile(resolve(root, "app/page.tsx"), "utf8");
  assert.match(home, /const session = await admitOperatorSession\(bindings\);/u);
  assert.match(home, /initialAccess=\{session\.admitted \? "authorized" : "unauthorized"\}/u);
  assert.doesNotMatch(
    home,
    /initialAccess\s*=\s*"authorized"/u,
    "access must never be assigned independently of the admission result",
  );
  const admissionLine = home.split("\n").findIndex((line) => line.includes("admitOperatorSession(bindings)"));
  const firstTry = home.split("\n").findIndex((line) => /\btry\s*\{/u.test(line));
  assert.ok(
    admissionLine >= 0 && (firstTry === -1 || admissionLine < firstTry),
    "the admission must resolve before any try block that could swallow its rejection",
  );
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
    const selection = "?view=knowledge&interviewSessionId=0198b5c0-0000-7000-8000-000000000001&marketPlayId=0198b5c0-0000-7000-8000-000000000002&sourceProposalVersionId=0198b5c0-0000-7000-8000-000000000003";
    assert.equal(
      knowledgeMutationTransport("advance_local_interview", "localhost", selection).endpoint,
      "/api/interview?interviewSessionId=0198b5c0-0000-7000-8000-000000000001&marketPlayId=0198b5c0-0000-7000-8000-000000000002&sourceProposalVersionId=0198b5c0-0000-7000-8000-000000000003",
      "the exact selection survives the local mutation transport without unrelated view state",
    );
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
