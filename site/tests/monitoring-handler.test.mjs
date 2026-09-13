import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createServer } from "vite";

const NOW = 2_000_000_000_000;
const OWNER_EMAIL = "operator@example.invalid";
const WORKSPACE = "synthetic_workspace_alpha";
const PEPPER = "synthetic-monitoring-pepper-with-safe-length";

async function load() {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    return { vite, handler: await vite.ssrLoadModule(new URL("../domain/monitoring-handler.ts", import.meta.url).pathname) };
  } catch (error) {
    await vite.close();
    throw error;
  }
}

function safeSnapshot(workspaceId = WORKSPACE) {
  return {
    schema: "prospector-monitoring-snapshot/v1",
    workspaceId,
    observedAt: NOW,
    windowStartedAt: NOW - 60_000,
    scheduler: { pendingCount: 0, oldestPendingAt: null },
    runner: { pendingCount: 0, oldestPendingAt: null, expiredLeaseCount: 0, denialCount: 0 },
    outbox: { pendingCount: 0, oldestPendingAt: null, expiredLeaseCount: 0, uncertainDispatchCount: 0, digestMismatchCount: 0 },
    recovery: { pendingCount: 0, oldestPendingAt: null, failureCount: 0 },
  };
}

function dependencies(overrides = {}) {
  return {
    pilotOwnerEmail: OWNER_EMAIL,
    subjectPepper: PEPPER,
    getIdentity: async () => ({ email: OWNER_EMAIL, displayName: "Synthetic Operator" }),
    getWorkspace: async () => ({ id: WORKSPACE }),
    source: { read: async () => safeSnapshot() },
    now: () => NOW,
    ...overrides,
  };
}

test("owner GET derives workspace scope and returns only structured aggregate diagnostics", async () => {
  const { vite, handler } = await load();
  let requestedScope;
  try {
    const response = await handler.handleMonitoringGet(
      new Request("http://localhost/api/monitoring"),
      dependencies({ source: { read: async (workspaceId, observedAt) => {
        requestedScope = { workspaceId, observedAt };
        return safeSnapshot(workspaceId);
      } } }),
    );
    assert.equal(response.status, 200);
    assert.deepEqual(requestedScope, { workspaceId: WORKSPACE, observedAt: NOW });
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.ready, true);
    assert.equal(body.externalEffectsAuthorized, false);
    assert.equal(body.automaticRetryAuthorized, false);
    assert.equal(body.automaticRecoveryAuthorized, false);
    assert.equal(body.workspaceId, undefined);
    assert.doesNotMatch(JSON.stringify(body), /operator@example|synthetic-monitoring-pepper|provider|holder/i);
  } finally {
    await vite.close();
  }
});

test("non-owner, query authority, absent workspace, and absent source deny without reading a snapshot", async () => {
  const { vite, handler } = await load();
  let reads = 0;
  const source = { read: async () => { reads += 1; return safeSnapshot(); } };
  try {
    const cases = [
      [new Request("http://localhost/api/monitoring"), dependencies({ getIdentity: async () => ({ email: "other@example.invalid", displayName: "Other" }), source })],
      [new Request("http://localhost/api/monitoring?workspaceId=synthetic_workspace_beta"), dependencies({ source })],
      [new Request("http://localhost/api/monitoring"), dependencies({ getWorkspace: async () => null, source })],
      [new Request("http://localhost/api/monitoring"), dependencies({
        source: undefined,
        getWorkspace: async () => { throw new Error("uncomposed monitoring must not read workspace state"); },
      })],
    ];
    const statuses = [];
    for (const [request, deps] of cases) statuses.push((await handler.handleMonitoringGet(request, deps)).status);
    assert.deepEqual(statuses, [404, 404, 404, 503]);
    assert.equal(reads, 0);
  } finally {
    await vite.close();
  }
});

test("cross-tenant and failed sources collapse to the same privacy-safe unavailable response", async () => {
  const { vite, handler } = await load();
  try {
    const cases = [
      dependencies({ source: { read: async () => safeSnapshot("synthetic_workspace_beta") } }),
      dependencies({ source: { read: async () => { throw new Error("raw.person@example.invalid secret-token"); } } }),
    ];
    for (const deps of cases) {
      const response = await handler.handleMonitoringGet(new Request("http://localhost/api/monitoring"), deps);
      assert.equal(response.status, 503);
      assert.deepEqual(await response.json(), { error: "monitoring_unavailable" });
    }
  } finally {
    await vite.close();
  }
});

test("checked route has no source composition, mutation verb, provider, or secret-bearing response path", async () => {
  const route = await readFile(new URL("../app/api/monitoring/route.ts", import.meta.url), "utf8");
  assert.match(route, /source: undefined/);
  assert.doesNotMatch(route, /export async function (?:POST|PUT|PATCH|DELETE)/);
  assert.doesNotMatch(route, /Firecrawl|Apollo|Gmail|MailPort|fetch\s*\(/i);
  assert.doesNotMatch(route, /SELECT[^`]*(?:email|phone|payload|snapshot_json|event_json|token|secret|digest)/i);
});
