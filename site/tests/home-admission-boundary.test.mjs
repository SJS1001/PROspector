import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

// `app/page.tsx` admits the operator through `admitOperatorSession`, and the
// rendered shell is the only place that decision becomes observable. A
// source-shape guard (tests/knowledge-handler.test.mjs) can prove the call is
// written down; it cannot prove the emitted markup honours the denial. These
// cases render the server component and read the decision off the markup.
//
// `admitOperatorSession` converts every failure into a returned DENIED value
// rather than a rejection, so a denial is expected to be silent. The
// unhandled-rejection ledger below therefore guards the surrounding render
// path: if any promise on the way to the shell is dropped instead of awaited,
// the ledger records it even when the markup happens to look right.

const PEPPER = "home-admission-boundary-pepper-at-least-32-bytes";
const DEMO_OWNER = "local-owner@prospector.invalid"; // app/_local-demo-identity.ts
const LOOPBACK_HOST = "localhost:8788";
const FOREIGN_HOST = "example.test";

const LOCAL_DEMO_ENV = {
  TRUSTED_IDENTITY_PROVIDER: "local-demo",
  LOCAL_DEMO: "1",
  PILOT_OWNER_EMAIL: DEMO_OWNER,
  OWNER_SUBJECT_PEPPER: PEPPER,
};

const WORKSPACE_ROW = { id: "ws_home_fixture", company_name: "Fixture Co" };

const rejections = [];
const recordRejection = (reason) => rejections.push(reason);
process.on("unhandledRejection", recordRejection);
test.after(() => process.off("unhandledRejection", recordRejection));
// Each case owns only the rejections it produced. Without this reset a case
// that fails its markup assertion never reaches the ledger check, and its
// dropped rejection would surface against the next case -- taking the positive
// control down for a defect it did not cause.
test.beforeEach(async () => {
  await flushPendingRejections();
  rejections.length = 0;
});

// Every binding tuple that must not reach the authorized shell. Each one
// removes exactly one condition from the admitted tuple, so a single relaxed
// check in `admitOperatorSession` or `runtimeIdentity` fails exactly one case
// and names it.
const DENIED_CASES = [
  ["a non-loopback host", LOCAL_DEMO_ENV, FOREIGN_HOST],
  ["a missing PILOT_OWNER_EMAIL binding", omit(LOCAL_DEMO_ENV, "PILOT_OWNER_EMAIL"), LOOPBACK_HOST],
  ["a missing OWNER_SUBJECT_PEPPER binding", omit(LOCAL_DEMO_ENV, "OWNER_SUBJECT_PEPPER"), LOOPBACK_HOST],
  ["an empty OWNER_SUBJECT_PEPPER binding", { ...LOCAL_DEMO_ENV, OWNER_SUBJECT_PEPPER: "" }, LOOPBACK_HOST],
  ["a non-owner PILOT_OWNER_EMAIL", { ...LOCAL_DEMO_ENV, PILOT_OWNER_EMAIL: "someone-else@prospector.invalid" }, LOOPBACK_HOST],
  ["LOCAL_DEMO absent", omit(LOCAL_DEMO_ENV, "LOCAL_DEMO"), LOOPBACK_HOST],
  ["LOCAL_DEMO set to something other than \"1\"", { ...LOCAL_DEMO_ENV, LOCAL_DEMO: "true" }, LOOPBACK_HOST],
  ["a non-local-demo identity provider", { ...LOCAL_DEMO_ENV, TRUSTED_IDENTITY_PROVIDER: "cloudflare-access" }, LOOPBACK_HOST],
  ["an absent identity provider", omit(LOCAL_DEMO_ENV, "TRUSTED_IDENTITY_PROVIDER"), LOOPBACK_HOST],
  ["no bindings at all", {}, LOOPBACK_HOST],
];

for (const [label, bindings, host] of DENIED_CASES) {
  test(`${label} cannot reach the authorized shell`, async () => {
    const markup = await renderHome(bindings, host);
    assertUnauthorized(markup);
    assertNoSecretsInMarkup(markup);
    await assertNoUnhandledRejections();
  });
}

test("the configured local-demo owner with a blank workspace is admitted and lands off Pilot Status", async () => {
  const db = fakeD1({ workspace: null });
  const markup = await renderHome({ ...LOCAL_DEMO_ENV, DB: db }, LOOPBACK_HOST);
  assert.match(markup, /class="app-shell"/);
  assert.doesNotMatch(markup, /Private workspace unavailable/);
  assert.doesNotMatch(markup, /class="access-screen"/);
  // The workspace lookup really ran against the bound database and found no
  // workspace, so `page.tsx` coerces the default status landing view to the
  // setup task. Labels come from `operatorTaskLabel` in app/workspace-view.ts.
  assert.ok(db.statements.some((sql) => /FROM workspaces/u.test(sql)), "the blank case must read the bound database");
  assert.match(markup, /aria-current="page">Company &amp; products</u);
  assert.doesNotMatch(markup, /aria-current="page">Status</u);
  assertNoSecretsInMarkup(markup);
  await assertNoUnhandledRejections();
});

// A failed capability read is not evidence that the workspace is blank. An
// established owner whose read fails must stay on Status, whose existing
// loading/error/retry state handles it, rather than be sent to onboarding.
for (const [label, failure] of [
  ["the workspace lookup", "workspace"],
  ["the evidence read", "evidence"],
]) {
  test(`a capability read failure in ${label} renders Status, not onboarding`, async () => {
    const db = fakeD1({ workspace: WORKSPACE_ROW, fail: failure });
    const markup = await renderHome({ ...LOCAL_DEMO_ENV, DB: db }, LOOPBACK_HOST);
    assert.match(markup, /class="app-shell"/);
    assert.doesNotMatch(markup, /class="access-screen"/);
    assert.match(markup, /aria-current="page">Status</u);
    assert.doesNotMatch(markup, /aria-current="page">Company &amp; products</u);
    assert.match(markup, /class="pilot-(loading|error)"/u);
    assertNoSecretsInMarkup(markup);
    await assertNoUnhandledRejections();
  });
}

test("an established workspace lands on Pilot Status with its projected capabilities", async () => {
  const db = fakeD1({ workspace: WORKSPACE_ROW });
  const markup = await renderHome({ ...LOCAL_DEMO_ENV, DB: db }, LOOPBACK_HOST);
  assert.match(markup, /class="app-shell"/);
  assert.match(markup, /aria-current="page">Status</u);
  assert.doesNotMatch(markup, /class="pilot-(loading|error)"/u);
  assertNoSecretsInMarkup(markup);
  await assertNoUnhandledRejections();
});

// The server render cannot deliver a Set-Cookie to the browser, so issuing a
// CSRF token there would only write an unredeemable row. Rendering `/` must
// never touch csrf_tokens, for any workspace shape.
test("rendering / writes no csrf_tokens row", async () => {
  for (const options of [{ workspace: WORKSPACE_ROW }, { workspace: null }, { workspace: WORKSPACE_ROW, fail: "evidence" }]) {
    const db = fakeD1(options);
    await renderHome({ ...LOCAL_DEMO_ENV, DB: db }, LOOPBACK_HOST);
    assert.ok(db.statements.length > 0, "the render must have read the bound database");
    assert.deepEqual(db.statements.filter((sql) => /csrf_tokens/iu.test(sql)), []);
  }
  await assertNoUnhandledRejections();
});

// The browser GET route keeps issuing exactly one CSRF token with its cookie.
test("GET /api/capabilities still issues a CSRF token and Set-Cookie", async () => {
  const db = fakeD1({ workspace: WORKSPACE_ROW });
  const response = await withHomeModules({ ...LOCAL_DEMO_ENV, DB: db }, LOOPBACK_HOST, async (load) => {
    const { handleCapabilitiesGet } = await load("../domain/capability-handler.ts");
    const { capabilityDependencies } = await load("../app/api/capability-runtime.ts");
    const request = new Request(`http://${LOOPBACK_HOST}/api/capabilities`, { headers: { host: LOOPBACK_HOST } });
    return handleCapabilitiesGet(capabilityDependencies(globalThis.__prospectorHomeTestEnv, request));
  });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("set-cookie") ?? "", /^prospector-local-csrf=[A-Za-z0-9_-]{43}; Path=\/; Max-Age=900; HttpOnly; SameSite=Strict$/u);
  assert.equal(db.statements.filter((sql) => /INSERT INTO csrf_tokens/iu.test(sql)).length, 1);
  assert.equal((await response.json()).workspace.companyName, WORKSPACE_ROW.company_name);
  await assertNoUnhandledRejections();
});

// The admitted shell carries an identity key so per-operator presentation state
// cannot leak between identities. It is a truncated one-way digest and must
// never carry the subject, the owner address, or the pepper into the markup.
test("the admitted shell exposes only a digest identity key, never the owner subject or pepper", async () => {
  const markup = await renderHome(LOCAL_DEMO_ENV, LOOPBACK_HOST);
  assertNoSecretsInMarkup(markup);
  const { presentationIdentityKey } = await loadOwnerAdmission();
  const expected = await presentationIdentityKey(DEMO_OWNER);
  assert.match(expected, /^[0-9a-f]{32}$/u, "the identity key must be a truncated hex digest");
  assert.doesNotMatch(markup, new RegExp(expected, "u"), "the digest must not be rendered into the markup either");
});

function assertUnauthorized(markup) {
  assert.match(markup, /class="access-screen"/);
  assert.match(markup, /Private workspace unavailable/);
  assert.doesNotMatch(markup, /class="app-shell"/);
}

// A denial must not become an oracle. Neither the shell nor the denial screen
// may echo the configured owner address or the subject pepper.
function assertNoSecretsInMarkup(markup) {
  assert.doesNotMatch(markup, new RegExp(PEPPER, "u"), "the subject pepper must never reach the markup");
  assert.doesNotMatch(markup, /local-owner@prospector\.invalid/u, "the owner address must never reach the markup");
}

// A dropped rejection is only observable once the microtask queue drains, so
// flush the loop before reading the ledger. The ledger is drained per case so a
// dropped rejection is attributed to the case that produced it rather than
// failing every later case, which would take the positive control down with it.
async function assertNoUnhandledRejections() {
  await flushPendingRejections();
  assert.deepEqual(
    rejections.splice(0).map((reason) => `${reason?.name ?? "rejection"}: ${reason?.message ?? reason}`),
    [],
    "the home render path dropped a rejected promise instead of awaiting it",
  );
}

async function flushPendingRejections() {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

function omit(source, key) {
  const copy = { ...source };
  delete copy[key];
  return copy;
}

function testServer() {
  // `next/headers` is bare-specifier externalised for SSR, so a plugin
  // `resolveId` never sees it; the alias has to intercept it first.
  return createServer({
    configFile: false,
    logLevel: "silent",
    resolve: { alias: { "next/headers": "virtual:test-home-headers" } },
    plugins: [{
      name: "test-home-admission-boundary",
      resolveId(id) {
        if (id === "cloudflare:workers") return "\0test-home-workers";
        if (id === "virtual:test-home-headers") return "\0test-home-headers";
      },
      load(id) {
        if (id === "\0test-home-workers") return "export const env = globalThis.__prospectorHomeTestEnv";
        if (id === "\0test-home-headers") return "export const headers = async () => new Headers(globalThis.__prospectorHomeTestHeaders)";
      },
    }],
  });
}

async function loadOwnerAdmission() {
  const server = await testServer();
  try {
    return await server.ssrLoadModule(new URL("../app/owner-admission.ts", import.meta.url).pathname);
  } finally {
    await server.close();
  }
}

async function renderHome(bindings, host) {
  return withHomeModules(bindings, host, async (load) => {
    const page = await load("../app/page.tsx");
    return renderToStaticMarkup(await page.default({ searchParams: Promise.resolve({}) }));
  });
}

async function withHomeModules(bindings, host, run) {
  globalThis.__prospectorHomeTestEnv = bindings;
  globalThis.__prospectorHomeTestHeaders = { host };
  const server = await testServer();
  try {
    return await run((path) => server.ssrLoadModule(new URL(path, import.meta.url).pathname));
  } finally {
    await server.close();
    delete globalThis.__prospectorHomeTestEnv;
    delete globalThis.__prospectorHomeTestHeaders;
  }
}

// A minimal synthetic D1 binding that records every statement it is asked to
// prepare. `workspace` is the row the workspace lookup returns (null for a
// blank workspace); `fail` makes the named read reject.
function fakeD1({ workspace = null, fail = null } = {}) {
  const statements = [];
  const statement = (sql) => {
    const bound = {
      bind: () => bound,
      async first() {
        if (/FROM workspaces/u.test(sql)) {
          if (fail === "workspace") throw new Error("synthetic D1 failure");
          return workspace;
        }
        return null;
      },
      async all() {
        if (/FROM audit_events/u.test(sql) && fail === "evidence") throw new Error("synthetic D1 failure");
        return { results: [] };
      },
      async run() {
        return { success: true, meta: { changes: 1 } };
      },
    };
    return bound;
  };
  return {
    statements,
    prepare(sql) {
      statements.push(sql);
      return statement(sql);
    },
    async batch(prepared) {
      return prepared.map(() => ({ success: true, results: [] }));
    },
  };
}
