import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createServer } from "vite";

const ORIGIN = "https://prospector.example";
const LOOPBACK = "http://localhost:8788";

test("capability handlers are owner-only, non-cacheable, and privacy preserving", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const {
      handleCapabilitiesGet,
      handleCapabilityProbePost,
    } = await vite.ssrLoadModule(
      new URL("../domain/capability-handler.ts", import.meta.url).pathname,
    );

    const unauthorized = dependencies(null);
    for (const response of [
      await handleCapabilitiesGet(unauthorized),
      await handleCapabilityProbePost(probeRequest(), unauthorized),
    ]) {
      assert.equal(response.status, 404);
      assert.equal(response.headers.get("cache-control"), "no-store");
      const body = await response.json();
      assert.deepEqual(body, { error: "private_workspace_unavailable" });
      assert.doesNotMatch(
        JSON.stringify(body),
        /owner@example|digitalrain|ws_[a-z0-9]|audit|capabilit/i,
      );
    }

    const owner = dependencies({
      email: "owner@example.com",
      displayName: "Owner",
    });
    const response = await handleCapabilitiesGet(owner);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const body = await response.json();
    const csrfCookie = response.headers.get("set-cookie");
    assert.equal(Array.isArray(body.capabilities), true);
    assert.equal("csrfToken" in body, false);
    assert.match(csrfCookie, /^__Host-prospector-csrf=[A-Za-z0-9_-]+;/);
    assert.match(csrfCookie, /Path=\/; Max-Age=900; HttpOnly; Secure; SameSite=Strict$/);
    assert.equal(
      body.capabilities.every((item) =>
        ["proven", "blocked", "unproven"].includes(item.status),
      ),
      true,
    );
    assert.doesNotMatch(JSON.stringify(body), /owner@example/i);

    assert.equal(
      (await handleCapabilityProbePost(
        probeRequest({ origin: "https://attacker.example" }),
        owner,
      )).status,
      403,
    );
    assert.equal(
      (await handleCapabilityProbePost(probeRequest({ csrf: "" }), owner)).status,
      403,
    );
    assert.equal(
      (await handleCapabilityProbePost(
        probeRequest({ body: JSON.stringify({ key: "foreign" }), csrf: csrfCookie }),
        owner,
      )).status,
      400,
    );

    const missingStorage = dependencies(
      { email: "owner@example.com", displayName: "Owner" },
      { objectStorage: false },
    );
    assert.equal(
      (await handleCapabilityProbePost(probeRequest({ csrf: csrfCookie }), missingStorage)).status,
      409,
    );

    const probeDependencies = dependencies(
      { email: "owner@example.com", displayName: "Owner" },
      { proofStatus: "proven" },
    );
    const firstProbe = await handleCapabilityProbePost(
      probeRequest({ csrf: csrfCookie }),
      probeDependencies,
    );
    assert.equal(firstProbe.status, 200);
    assert.equal((await firstProbe.json()).proof.status, "proven");
    assert.equal(probeDependencies.proofRuns(), 1);
    assert.equal(
      (await handleCapabilityProbePost(probeRequest({ csrf: csrfCookie }), probeDependencies)).status,
      403,
    );

    const failedProof = dependencies(
      { email: "owner@example.com", displayName: "Owner" },
      { proofStatus: "blocked" },
    );
    const failedResponse = await handleCapabilityProbePost(
      probeRequest({ csrf: csrfCookie }),
      failedProof,
    );
    assert.equal(failedResponse.status, 200);
    assert.equal((await failedResponse.json()).proof.status, "blocked");
  } finally {
    await vite.close();
  }
});

test("capability routes cannot treat a binding as accepted proof", async () => {
  const routeSource = await readFile(
    new URL("../app/api/capabilities/route.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(routeSource, /email:\s*user\.email/);
  assert.doesNotMatch(routeSource, /r2:\s*Boolean\s*\(\s*bindings\.FILES\s*\)/);
});

test("capability identity is request-bound so a probe cannot cross origins", async () => {
  const vite = await createServer({
    configFile: false,
    logLevel: "silent",
    plugins: [{
      name: "test-cloudflare-workers",
      resolveId(id) { if (id === "cloudflare:workers") return "\0test-cloudflare-workers"; },
      load(id) {
        if (id === "\0test-cloudflare-workers")
          return "export const env = globalThis.__prospectorRouteTestEnv";
      },
    }],
  });
  try {
    const { capabilityDependencies } = await vite.ssrLoadModule(
      new URL("../app/api/capability-runtime.ts", import.meta.url).pathname,
    );
    const { handleCapabilityProbePost } = await vite.ssrLoadModule(
      new URL("../domain/capability-handler.ts", import.meta.url).pathname,
    );
    const bindings = {
      DB: new Proxy({}, {
        get() { throw new Error("a rejected probe must never reach the database"); },
      }),
      FILES: {},
      OWNER_SUBJECT_PEPPER: "test-only-capability-pepper-with-at-least-32-bytes",
      PILOT_OWNER_EMAIL: "local-owner@prospector.invalid",
      TRUSTED_IDENTITY_PROVIDER: "local-demo",
      LOCAL_DEMO: "1",
    };

    // A loopback URL whose Origin names a different port is not same-origin.
    // Because identity is now resolved from the request, the local-demo
    // method-and-origin fence applies to the probe mutation itself.
    const crossOrigin = loopbackProbe({ origin: "http://localhost:8789" });
    assert.equal(await capabilityDependencies(bindings, crossOrigin).getIdentity(), null);

    let proofRuns = 0;
    const rejected = await handleCapabilityProbePost(crossOrigin, {
      ...capabilityDependencies(bindings, crossOrigin),
      runStorageProof: async () => {
        proofRuns += 1;
        throw new Error("a rejected probe must never run a storage proof");
      },
    });
    assert.notEqual(rejected.status, 200);
    assert.equal(rejected.status, 404);
    assert.deepEqual(await rejected.json(), { error: "private_workspace_unavailable" });
    assert.equal(proofRuns, 0);

    // The same fence still admits the genuine same-origin loopback mutation,
    // so the rejection above is the origin check and not a blanket denial.
    assert.deepEqual(
      await capabilityDependencies(bindings, loopbackProbe()).getIdentity(),
      { email: "local-owner@prospector.invalid", displayName: "Local Demo Owner" },
    );
  } finally {
    await vite.close();
  }
});

test("capability routes pass their request into the runtime dependencies", async () => {
  const read = async (file) =>
    readFile(new URL(`../${file}`, import.meta.url), "utf8");

  const capabilities = await read("app/api/capabilities/route.ts");
  assert.match(capabilities, /export async function GET\(\s*request: Request\s*\)/);
  assert.match(
    capabilities,
    /capabilityDependencies\([^)]*\brequest\b[^)]*\)/s,
    "the capabilities GET route must pass its Request through",
  );

  const probe = await read("app/api/capability-probe/route.ts");
  assert.match(
    probe,
    /capabilityDependencies\([^)]*\brequest\b[^)]*\)/s,
    "the capability probe route must pass its Request through",
  );

  const runtime = await read("app/api/capability-runtime.ts");
  assert.match(runtime, /runtimeIdentity\(request, bindings\)/);
  assert.doesNotMatch(runtime, /runtimeIdentity\(undefined, bindings\)/);
  // The parameter stays optional so the RSC render call site keeps compiling.
  assert.match(runtime, /request\?: Request/);
});

function loopbackProbe({ origin = LOOPBACK } = {}) {
  return new Request(`${LOOPBACK}/api/capability-probe`, {
    method: "POST",
    headers: {
      origin,
      "sec-fetch-site": "same-origin",
      "x-prospector-intent": "capability-proof",
      "content-type": "application/json",
      cookie: `__Host-prospector-csrf=${"a".repeat(43)}`,
    },
    body: "{}",
  });
}

function dependencies(identity, options = {}) {
  const consumedTokens = new Set();
  let proofRuns = 0;
  return {
    database: {},
    pilotOwnerEmail: "owner@example.com",
    subjectPepper: "test-only-capability-pepper-with-at-least-32-bytes",
    getIdentity: async () => identity,
    getWorkspace: async () => ({ id: "ws_server_derived", companyName: "Digitalrain" }),
    readEvidence: async () => [],
    prerequisites: {
      database: true,
      objectStorage: options.objectStorage ?? true,
      secrets: true,
    },
    issueCsrfToken: async () => "a".repeat(43),
    consumeCsrfToken: async (_subject, token) => {
      if (!token || consumedTokens.has(token)) throw Object.assign(new Error("invalid"), {
        code: "invalid_csrf_token",
      });
      consumedTokens.add(token);
    },
    runStorageProof: async () => {
      proofRuns += 1;
      return {
        status: options.proofStatus ?? "proven",
        probeId: "a".repeat(32),
        checkedAt: Date.now(),
        evidenceReference: "r2-proof-" + "a".repeat(32),
        digest: "b".repeat(64),
        steps: {
          put: true,
          read: true,
          digest: true,
          delete: true,
          absence: true,
        },
        reason: "Fixed proof result.",
      };
    },
    proofRuns: () => proofRuns,
  };
}

function probeRequest({
  origin = ORIGIN,
  csrf = `__Host-prospector-csrf=${"a".repeat(43)}`,
  body = "{}",
} = {}) {
  return new Request(`${ORIGIN}/api/capability-probe`, {
    method: "POST",
    headers: {
      origin,
      "sec-fetch-site": "same-origin",
      "x-prospector-intent": "capability-proof",
      ...(csrf ? { cookie: csrf } : {}),
      "content-type": "application/json",
    },
    body,
  });
}
