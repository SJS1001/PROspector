import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";

const NOW = 2_000_000_000_000;
const WORKSPACE = "synthetic_workspace_alpha";

async function load() {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    return { vite, monitoring: await vite.ssrLoadModule(new URL("../domain/monitoring-readiness.ts", import.meta.url).pathname) };
  } catch (error) {
    await vite.close();
    throw error;
  }
}

function snapshot(overrides = {}) {
  return {
    schema: "prospector-monitoring-snapshot/v1",
    workspaceId: WORKSPACE,
    observedAt: NOW,
    windowStartedAt: NOW - 60 * 60_000,
    scheduler: { pendingCount: 0, oldestPendingAt: null },
    runner: { pendingCount: 0, oldestPendingAt: null, expiredLeaseCount: 0, denialCount: 0 },
    outbox: {
      pendingCount: 0,
      oldestPendingAt: null,
      expiredLeaseCount: 0,
      uncertainDispatchCount: 0,
      digestMismatchCount: 0,
    },
    recovery: { pendingCount: 0, oldestPendingAt: null, failureCount: 0 },
    ...overrides,
  };
}

test("healthy aggregate snapshot is ready and emits no identifying material", async () => {
  const { vite, monitoring } = await load();
  try {
    const result = monitoring.evaluateMonitoringReadiness(snapshot(), WORKSPACE, NOW);
    assert.deepEqual(result, {
      schema: "prospector-monitoring-readiness/v1",
      observedAt: NOW,
      windowStartedAt: NOW - 60 * 60_000,
      status: "healthy",
      ready: true,
      externalEffectsAuthorized: false,
      automaticRetryAuthorized: false,
      automaticRecoveryAuthorized: false,
      components: { scheduler: "healthy", runner: "healthy", outbox: "healthy", recovery: "healthy" },
      diagnostics: [],
    });
    const serialized = JSON.stringify(result);
    assert.doesNotMatch(serialized, /workspace|provider|holder|digest|email|phone|payload/i);
  } finally {
    await vite.close();
  }
});

test("lag, stuck leases, denials, uncertainty, mismatch, and recovery failures classify deterministically", async () => {
  const { vite, monitoring } = await load();
  try {
    const result = monitoring.evaluateMonitoringReadiness(snapshot({
      scheduler: { pendingCount: 2, oldestPendingAt: NOW - 6 * 60_000 },
      runner: { pendingCount: 1, oldestPendingAt: NOW - 31 * 60_000, expiredLeaseCount: 1, denialCount: 3 },
      outbox: {
        pendingCount: 4,
        oldestPendingAt: NOW - 16 * 60_000,
        expiredLeaseCount: 2,
        uncertainDispatchCount: 1,
        digestMismatchCount: 2,
      },
      recovery: { pendingCount: 1, oldestPendingAt: NOW - 7 * 60_000, failureCount: 3 },
    }), WORKSPACE, NOW);

    assert.equal(result.status, "blocked");
    assert.equal(result.ready, false);
    assert.equal(result.externalEffectsAuthorized, false);
    assert.equal(result.automaticRetryAuthorized, false);
    assert.equal(result.automaticRecoveryAuthorized, false);
    assert.deepEqual(result.components, {
      scheduler: "degraded",
      runner: "blocked",
      outbox: "blocked",
      recovery: "blocked",
    });
    assert.deepEqual(result.diagnostics.map(({ component, code, severity }) => ({ component, code, severity })), [
      { component: "scheduler", code: "scheduler_lag", severity: "degraded" },
      { component: "runner", code: "repeated_denials", severity: "degraded" },
      { component: "runner", code: "runner_lag", severity: "blocked" },
      { component: "runner", code: "stuck_lease", severity: "blocked" },
      { component: "outbox", code: "digest_mismatch", severity: "blocked" },
      { component: "outbox", code: "outbox_lag", severity: "blocked" },
      { component: "outbox", code: "stuck_lease", severity: "blocked" },
      { component: "outbox", code: "uncertain_dispatch", severity: "blocked" },
      { component: "recovery", code: "recovery_failure", severity: "blocked" },
      { component: "recovery", code: "recovery_lag", severity: "degraded" },
    ]);
    assert.equal(result.diagnostics.find((item) => item.code === "uncertain_dispatch").action.includes("never resend"), true);
    assert.equal(result.diagnostics.find((item) => item.code === "stuck_lease").action.includes("do not reassign"), true);
  } finally {
    await vite.close();
  }
});

test("exact threshold boundaries fail closed into degraded or blocked readiness", async () => {
  const { vite, monitoring } = await load();
  try {
    const result = monitoring.evaluateMonitoringReadiness(snapshot({
      scheduler: { pendingCount: 1, oldestPendingAt: NOW - 5 * 60_000 },
      runner: { pendingCount: 0, oldestPendingAt: null, expiredLeaseCount: 0, denialCount: 10 },
      recovery: { pendingCount: 0, oldestPendingAt: null, failureCount: 1 },
    }), WORKSPACE, NOW);
    assert.equal(result.status, "blocked");
    assert.equal(result.components.scheduler, "degraded");
    assert.equal(result.components.runner, "blocked");
    assert.equal(result.components.recovery, "degraded");
  } finally {
    await vite.close();
  }
});

test("cross-workspace, stale, future, inconsistent, extra, and accessor snapshots are rejected", async () => {
  const { vite, monitoring } = await load();
  try {
    const invalid = [
      snapshot({ workspaceId: "synthetic_workspace_beta" }),
      snapshot({ observedAt: NOW - 2 * 60_000 - 1 }),
      snapshot({ observedAt: NOW + 1 }),
      snapshot({ scheduler: { pendingCount: 0, oldestPendingAt: NOW - 1 } }),
      snapshot({ runner: { pendingCount: 1, oldestPendingAt: NOW + 1, expiredLeaseCount: 0, denialCount: 0 } }),
      snapshot({ rawEmail: "fictional@example.invalid" }),
      snapshot({ outbox: { pendingCount: 0, oldestPendingAt: null, expiredLeaseCount: 0, uncertainDispatchCount: 0, digestMismatchCount: 0, itemId: "forbidden" } }),
    ];
    const accessor = snapshot();
    Object.defineProperty(accessor, "workspaceId", { enumerable: true, get() { throw new Error("must not execute"); } });
    invalid.push(accessor);
    for (const value of invalid) {
      assert.throws(
        () => monitoring.evaluateMonitoringReadiness(value, WORKSPACE, NOW),
        (error) => error?.code === "monitoring_snapshot_invalid",
      );
    }
  } finally {
    await vite.close();
  }
});

test("malformed threshold policy is rejected rather than weakening readiness", async () => {
  const { vite, monitoring } = await load();
  try {
    const weakened = {
      ...monitoring.DEFAULT_MONITORING_THRESHOLDS,
      blockedLagMs: { ...monitoring.DEFAULT_MONITORING_THRESHOLDS.blockedLagMs, outbox: 1 },
    };
    assert.throws(
      () => monitoring.evaluateMonitoringReadiness(snapshot(), WORKSPACE, NOW, weakened),
      (error) => error?.code === "monitoring_snapshot_invalid",
    );
  } finally {
    await vite.close();
  }
});
