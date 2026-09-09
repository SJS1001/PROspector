import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createServer } from "vite";

const OWNER = { email: "owner@example.invalid", displayName: "Owner" };
const BASE = {
  database: {},
  pilotOwnerEmail: OWNER.email,
  subjectPepper: "x".repeat(32),
  getIdentity: async () => OWNER,
};

async function load() {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  return {
    vite,
    handler: await vite.ssrLoadModule(new URL("../domain/morning-brief-handler.ts", import.meta.url).pathname),
  };
}

function available(options) {
  return {
    status: "available",
    workspaceId: "workspace-one",
    generatedAt: options.asOf,
    reviewWindow: { start: options.reviewWindowStart, endExclusive: options.reviewWindowEndExclusive },
    profiles: [],
  };
}

test("GET derives the exact Toronto week on the server and returns hardened read-only headers", async () => {
  const { vite, handler } = await load();
  try {
    let received;
    const response = await handler.handleMorningBriefGet(
      new Request("https://prospector.test/api/morning-brief"),
      {
        ...BASE,
        now: () => Date.parse("2026-10-30T16:00:00.000Z"),
        read: async (_database, _principal, options) => {
          received = options;
          return available(options);
        },
      },
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.deepEqual(received, {
      asOf: "2026-10-30T16:00:00.000Z",
      reviewWindowStart: "2026-10-26T04:00:00.000Z",
      reviewWindowEndExclusive: "2026-11-02T05:00:00.000Z",
    });
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.deepEqual(body.profiles, []);
  } finally { await vite.close(); }
});

test("identity, workspace, and any query input deny neutrally with 404 and no cache", async () => {
  const { vite, handler } = await load();
  try {
    let reads = 0;
    const read = async (_database, _principal, options) => { reads += 1; return available(options); };
    for (const [name, request, patch] of [
      ["missing identity", new Request("https://prospector.test/api/morning-brief"), { getIdentity: async () => null }],
      ["foreign identity", new Request("https://prospector.test/api/morning-brief"), { getIdentity: async () => ({ email: "other@example.invalid", displayName: "Other" }) }],
      ["query authority", new Request("https://prospector.test/api/morning-brief?profileId=profile-one"), {}],
      ["absent workspace", new Request("https://prospector.test/api/morning-brief"), { read: async () => ({ status: "unavailable", reasonCodes: ["workspace_absent"], workspaceId: null, generatedAt: null, reviewWindow: null, profiles: [] }) }],
    ]) {
      const response = await handler.handleMorningBriefGet(request, { ...BASE, now: () => 0, read, ...patch });
      assert.equal(response.status, 404, name);
      assert.deepEqual(await response.json(), { error: "private_workspace_unavailable" }, name);
      assert.equal(response.headers.get("cache-control"), "no-store", name);
      assert.equal(response.headers.get("x-content-type-options"), "nosniff", name);
    }
    assert.equal(reads, 0, "denied and query-bearing requests never reach the read adapter");
  } finally { await vite.close(); }
});

test("read and server-clock failures return a closed 503 without detail", async () => {
  const { vite, handler } = await load();
  try {
    for (const dependencies of [
      { ...BASE, now: () => Number.NaN, read: async () => { throw new Error("unreachable"); } },
      { ...BASE, now: () => 0, read: async () => { throw new Error("database detail"); } },
    ]) {
      const response = await handler.handleMorningBriefGet(
        new Request("https://prospector.test/api/morning-brief"), dependencies,
      );
      assert.equal(response.status, 503);
      assert.deepEqual(await response.json(), { error: "morning_brief_unavailable" });
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    }
  } finally { await vite.close(); }
});

test("the runtime route exports GET only and accepts no query-derived authority", async () => {
  const source = await readFile(new URL("../app/api/morning-brief/route.ts", import.meta.url), "utf8");
  assert.match(source, /export async function GET\(/);
  assert.doesNotMatch(source, /export async function (POST|PUT|PATCH|DELETE)\(/);
  assert.doesNotMatch(source, /searchParams|get\(["'](profile|workspace|company|product|play)/i);
});
