import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createServer } from "vite";

const ORIGIN = "https://prospector.example";

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
        /owner@example|digitalrain|workspace|audit|capabilit/i,
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
    assert.equal(Array.isArray(body.capabilities), true);
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

function dependencies(identity) {
  return {
    database: {},
    pilotOwnerEmail: "owner@example.com",
    subjectPepper: "test-only-capability-pepper-with-at-least-32-bytes",
    getIdentity: async () => identity,
    getWorkspace: async () => ({ id: "ws_server_derived", companyName: "Digitalrain" }),
    readEvidence: async () => [],
    prerequisites: {
      database: true,
      objectStorage: true,
      secrets: true,
    },
    issueCsrfToken: async () => "csrf-safe-token",
    consumeCsrfToken: async (_subject, token) => {
      if (!token) throw Object.assign(new Error("invalid"), {
        code: "invalid_csrf_token",
      });
    },
    runStorageProof: async () => {
      throw new Error("not expected in contract test");
    },
  };
}

function probeRequest({
  origin = ORIGIN,
  csrf = "csrf-safe-token",
  body = "{}",
} = {}) {
  return new Request(`${ORIGIN}/api/capability-probe`, {
    method: "POST",
    headers: {
      origin,
      "sec-fetch-site": "same-origin",
      "x-prospector-intent": "capability-proof",
      "x-prospector-csrf": csrf,
      "content-type": "application/json",
    },
    body,
  });
}
