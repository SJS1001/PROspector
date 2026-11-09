import assert from "node:assert/strict";
import { extname, join, resolve } from "node:path";
import { readdir, readFile } from "node:fs/promises";
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
    schema: "prospector-monitoring-snapshot/v2",
    workspaceId,
    observedAt: NOW,
    windowStartedAt: NOW - 60_000,
    componentLiveness: {
      scheduler: { component: "scheduler", observedAt: NOW },
      runner: { component: "runner", observedAt: NOW },
      outbox: { component: "outbox", observedAt: NOW },
      recovery: { component: "recovery", observedAt: NOW },
    },
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

test("stale component liveness collapses to privacy-safe unavailable", async () => {
  const { vite, handler } = await load();
  try {
    const response = await handler.handleMonitoringGet(
      new Request("http://localhost/api/monitoring"),
      dependencies({ source: { read: async () => ({
        ...safeSnapshot(),
        componentLiveness: {
          ...safeSnapshot().componentLiveness,
          scheduler: { component: "scheduler", observedAt: NOW - 2 * 60_000 - 1 },
        },
      }) } }),
    );
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: "monitoring_unavailable" });
  } finally {
    await vite.close();
  }
});

test("monitoring stays uncomposed and has no provider, mutation, or secret-bearing read", async () => {
  for (const relativePath of ["../domain/monitoring-handler.ts", "../domain/monitoring-readiness.ts"]) {
    const source = await readFile(new URL(relativePath, import.meta.url), "utf8");
    assert.doesNotMatch(source, /export async function (?:POST|PUT|PATCH|DELETE)/u);
    assert.doesNotMatch(source, /Firecrawl|Apollo|Gmail|MailPort|fetch\s*\(/iu);
    assert.doesNotMatch(source, /SELECT[^`]*(?:email|phone|payload|snapshot_json|event_json|token|secret|digest)/iu);
    assert.doesNotMatch(source, /from\s+["']cloudflare:workers["']/u);
  }

  const siteRoot = resolve(import.meta.dirname, "..");
  const runtimeFiles = [
    ...await sourceFiles(join(siteRoot, "app")),
    ...await sourceFiles(join(siteRoot, "adapters")),
    ...await sourceFiles(join(siteRoot, "worker"), true),
  ];
  for (const file of runtimeFiles) {
    const source = await readFile(file, "utf8");
    assert.equal(source.includes("monitoring-handler"), false, `${file} must not compose monitoring`);
    assert.equal(source.includes("monitoring-readiness"), false, `${file} must not compose monitoring`);
  }
});

async function sourceFiles(directory, optional = false) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (optional && error?.code === "ENOENT") return [];
    throw error;
  }
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(path));
    else if ([".ts", ".tsx", ".js", ".mjs"].includes(extname(entry.name))) files.push(path);
  }
  return files;
}
