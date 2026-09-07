import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

// `app/page.tsx` admits the local-demo owner into the authorized shell. That
// admission is `admitPilotOwner`, which is `async` and signals denial by
// throwing *inside* the async function -- a rejected promise, not a synchronous
// throw. A source-shape guard (tests/knowledge-handler.test.mjs) cannot tell an
// awaited call from a dropped one, so these tests render the server component
// and read the admission decision off the emitted markup instead.
//
// The unhandled-rejection ledger below is what distinguishes "awaited and
// caught" from "dropped promise that happened to produce the right string": a
// dropped denial still renders, it just leaves the rejection unowned.

const PEPPER = "home-admission-boundary-pepper-at-least-32-bytes";
const DEMO_OWNER = "local-owner@prospector.invalid"; // app/runtime-identity.ts:9
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

test("a non-loopback host cannot reach the authorized shell through local-demo admission", async () => {
  const markup = await renderHome(LOCAL_DEMO_ENV, FOREIGN_HOST);
  assertUnauthorized(markup);
  await assertNoUnhandledRejections();
});

test("a missing PILOT_OWNER_EMAIL binding fails closed instead of admitting the owner", async () => {
  const withoutOwnerEmail = { ...LOCAL_DEMO_ENV };
  delete withoutOwnerEmail.PILOT_OWNER_EMAIL;
  const markup = await renderHome(withoutOwnerEmail, LOOPBACK_HOST);
  assertUnauthorized(markup);
  await assertNoUnhandledRejections();
});

test("the configured local-demo owner is still admitted and lands off Pilot Status", async () => {
  const markup = await renderHome(LOCAL_DEMO_ENV, LOOPBACK_HOST);
  assert.match(markup, /class="app-shell"/);
  assert.doesNotMatch(markup, /Private workspace unavailable/);
  // `blankLocalOnboarding` coerces the default "Pilot Status" landing view.
  assert.match(markup, /<div class="crumbs">.*?<span>Knowledge<\/span><\/div>/s);
  assert.match(markup, /aria-current="page"><span>03<\/span>Knowledge/);
  assert.doesNotMatch(markup, /aria-current="page"><span>01<\/span>Pilot Status/);
  await assertNoUnhandledRejections();
});

function assertUnauthorized(markup) {
  assert.match(markup, /class="access-screen"/);
  assert.match(markup, /Private workspace unavailable/);
  assert.doesNotMatch(markup, /class="app-shell"/);
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
    "home admission dropped a rejected promise instead of awaiting and catching it",
  );
}

async function flushPendingRejections() {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

async function renderHome(bindings, host) {
  globalThis.__prospectorHomeTestEnv = bindings;
  globalThis.__prospectorHomeTestHeaders = { host };
  // `next/headers` is bare-specifier externalised for SSR, so a plugin
  // `resolveId` never sees it; the alias has to intercept it first.
  const server = await createServer({
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
  try {
    const page = await server.ssrLoadModule(new URL("../app/page.tsx", import.meta.url).pathname);
    return renderToStaticMarkup(await page.default({ searchParams: Promise.resolve({}) }));
  } finally {
    await server.close();
    delete globalThis.__prospectorHomeTestEnv;
    delete globalThis.__prospectorHomeTestHeaders;
  }
}
