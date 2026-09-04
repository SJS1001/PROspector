import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";

const NOW = Date.UTC(2026, 6, 15);
const PRINCIPAL = "owner-synthetic";
const WORKSPACE = "workspace-synthetic";

async function loadRunner(vite) {
  return vite.ssrLoadModule(
    new URL("../domain/runner-spend-authority.ts", import.meta.url).pathname,
  );
}

function grant(maxRetries = 2) {
  return {
    authorityType: "runner_spend",
    id: "runner-grant",
    providerId: "runner-provider",
    model: "runner-model",
    catalogRef: "runner-catalog",
    runType: "prospecting",
    scopeId: "run-synthetic",
    perRunCostMinor: 10,
    monthlyCostMinor: 100,
    currency: "USD",
    expiresAt: Date.UTC(2027, 0, 1),
    maxRetries,
  };
}

async function operationKeyFor(runner, immutableGrant, attemptNumber) {
  return runner.deriveRunnerOperationKey({
    workspaceId: WORKSPACE,
    principalSubject: PRINCIPAL,
    grant: immutableGrant,
    attempt: {
      attemptNumber,
      previousOutcome: attemptNumber === 0 ? "none" : "failed_retryable",
      previousOperationKeys: [],
    },
  });
}

async function authorityFor(runner, attempt, maxRetries = 2) {
  const immutableGrant = grant(maxRetries);
  const operationKey = await operationKeyFor(
    runner,
    immutableGrant,
    attempt.attemptNumber,
  );
  const period = runner.deriveRunnerUtcMonthPeriod(NOW);
  return {
    admitted: true,
    workspaceId: WORKSPACE,
    principalSubject: PRINCIPAL,
    grant: immutableGrant,
    attempt,
    perRun: {
      authorityType: "runner_spend",
      accountId: runner.deriveRunnerPerRunAccountId({
        workspaceId: WORKSPACE,
        principalSubject: PRINCIPAL,
        grantId: immutableGrant.id,
        providerId: immutableGrant.providerId,
        scopeId: immutableGrant.scopeId,
        attemptNumber: attempt.attemptNumber,
        operationKey,
      }),
      scope: "runner_per_run",
      principalSubject: PRINCIPAL,
      grantId: immutableGrant.id,
      providerId: immutableGrant.providerId,
      scopeId: immutableGrant.scopeId,
      attemptNumber: attempt.attemptNumber,
      operationKey,
      currency: immutableGrant.currency,
      actualCostMinor: 0,
      reservedCostMinor: 0,
      maxCostMinor: immutableGrant.perRunCostMinor,
    },
    monthly: {
      authorityType: "runner_spend",
      accountId: runner.deriveRunnerMonthlyAccountId({
        workspaceId: WORKSPACE,
        principalSubject: PRINCIPAL,
        providerId: immutableGrant.providerId,
        scopeId: immutableGrant.scopeId,
        period,
      }),
      scope: "runner_monthly",
      principalSubject: PRINCIPAL,
      grantId: immutableGrant.id,
      providerId: immutableGrant.providerId,
      scopeId: immutableGrant.scopeId,
      period,
      currency: immutableGrant.currency,
      actualCostMinor: 0,
      reservedCostMinor: 0,
      maxCostMinor: immutableGrant.monthlyCostMinor,
    },
  };
}

function repository(authority, writes) {
  return {
    async loadRunnerAuthority() {
      return authority;
    },
    async commitRunnerReservation(record) {
      writes.push(record);
      return { kind: "created", record };
    },
  };
}

async function reserve(runner, authority, writes) {
  return runner.reserveRunnerSpend(repository(authority, writes), {
    grantId: authority.grant.id,
    principalSubject: authority.principalSubject,
    operationKey: authority.perRun.operationKey,
    now: NOW,
  });
}

test("runner accepts only the exact ordered keys for every prior retry attempt", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const runner = await loadRunner(vite);
    const immutableGrant = grant();
    const previousOperationKeys = await Promise.all([
      operationKeyFor(runner, immutableGrant, 0),
      operationKeyFor(runner, immutableGrant, 1),
    ]);
    const authority = await authorityFor(runner, {
      attemptNumber: 2,
      previousOutcome: "failed_retryable",
      previousOperationKeys,
    });
    const writes = [];

    const result = await reserve(runner, authority, writes);

    assert.equal(result.kind, "reserved");
    assert.equal(result.reservation.attemptNumber, 2);
    assert.equal(writes.length, 1);
  } finally {
    await vite.close();
  }
});

test("forged, missing, duplicate, reordered, extra, or non-retryable histories write nothing", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const runner = await loadRunner(vite);
    const immutableGrant = grant();
    const firstKey = await operationKeyFor(runner, immutableGrant, 0);
    const secondKey = await operationKeyFor(runner, immutableGrant, 1);
    const forgedKey = `ro_${"f".repeat(64)}`;
    const cases = [
      ["forged", 1, "failed_retryable", [forgedKey]],
      ["missing", 1, "failed_retryable", []],
      ["duplicate", 2, "failed_retryable", [firstKey, firstKey]],
      ["reordered", 2, "failed_retryable", [secondKey, firstKey]],
      ["extra", 1, "failed_retryable", [firstKey, secondKey]],
      ["non-retryable", 1, "uncertain", [firstKey]],
    ];

    for (const [name, attemptNumber, previousOutcome, previousOperationKeys] of cases) {
      const authority = await authorityFor(runner, {
        attemptNumber,
        previousOutcome,
        previousOperationKeys,
      });
      const writes = [];

      const result = await reserve(runner, authority, writes);

      assert.deepEqual(
        result,
        { kind: "blocked", reason: "runner_retry_unavailable" },
        name,
      );
      assert.deepEqual(writes, [], name);
    }
  } finally {
    await vite.close();
  }
});
