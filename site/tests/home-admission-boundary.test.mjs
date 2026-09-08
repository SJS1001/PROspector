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

test("the configured local-demo owner is still admitted and lands off Pilot Status", async () => {
  const markup = await renderHome(LOCAL_DEMO_ENV, LOOPBACK_HOST);
  assert.match(markup, /class="app-shell"/);
  assert.doesNotMatch(markup, /Private workspace unavailable/);
  assert.doesNotMatch(markup, /class="access-screen"/);
  // A blank workspace has no accepted capability evidence, so `page.tsx`
  // coerces the default status landing view to the setup task. Labels come from
  // `operatorTaskLabel` in app/workspace-view.ts.
  assert.match(markup, /aria-current="page">Company &amp; products</u);
  assert.doesNotMatch(markup, /aria-current="page">Status</u);
  assertNoSecretsInMarkup(markup);
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
  globalThis.__prospectorHomeTestEnv = bindings;
  globalThis.__prospectorHomeTestHeaders = { host };
  const server = await testServer();
  try {
    const page = await server.ssrLoadModule(new URL("../app/page.tsx", import.meta.url).pathname);
    return renderToStaticMarkup(await page.default({ searchParams: Promise.resolve({}) }));
  } finally {
    await server.close();
    delete globalThis.__prospectorHomeTestEnv;
    delete globalThis.__prospectorHomeTestHeaders;
  }
}
