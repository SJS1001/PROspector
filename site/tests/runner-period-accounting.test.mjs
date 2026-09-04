import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";

const JULY = Date.UTC(2026, 6, 15, 12);
const AUGUST = Date.UTC(2026, 7, 1, 0);

async function loadRunner(vite) {
  return vite.ssrLoadModule(new URL("../domain/runner-spend-authority.ts", import.meta.url).pathname);
}

test("identical runner authority in two workspaces derives distinct operations, reservations, ledgers, and charges", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const runner = await loadRunner(vite);
    const first = await authorityFor(runner, { now: JULY, workspaceId: "workspace-first" });
    const second = await authorityFor(runner, { now: JULY, workspaceId: "workspace-second" });
    assert.notEqual(first.perRun.operationKey, second.perRun.operationKey);
    assert.notEqual(first.perRun.accountId, second.perRun.accountId);
    assert.notEqual(first.monthly.accountId, second.monthly.accountId);
    const firstWrites = [];
    const secondWrites = [];
    const firstResult = await runner.reserveRunnerSpend(repository(first, firstWrites), input(first, JULY));
    const secondResult = await runner.reserveRunnerSpend(repository(second, secondWrites), input(second, JULY));
    assert.equal(firstResult.kind, "reserved");
    assert.equal(secondResult.kind, "reserved");
    assert.notEqual(firstResult.reservation.id, secondResult.reservation.id);
    assert.equal(firstResult.reservation.workspaceId, first.workspaceId);
    assert.equal(secondResult.reservation.workspaceId, second.workspaceId);
    assert.equal(firstWrites.length, 1);
    assert.equal(secondWrites.length, 1);
    assert.equal(firstWrites[0].record.reservedCostMinor, 10);
    assert.equal(secondWrites[0].record.reservedCostMinor, 10);
  } finally {
    await vite.close();
  }
});

test("runner per-run ledgers bind the exact attempt and operation while retries share the month", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const runner = await loadRunner(vite);
    const first = await authorityFor(runner, {
      now: JULY,
      attempt: { attemptNumber: 0, previousOutcome: "none", previousOperationKeys: [] },
    });
    const firstWrites = [];
    const firstResult = await runner.reserveRunnerSpend(repository(first, firstWrites), input(first, JULY));
    assert.equal(firstResult.kind, "reserved");
    assert.equal(firstWrites.length, 1);
    assert.equal(firstWrites[0].accounts[0].attemptNumber, 0);
    assert.equal(firstWrites[0].accounts[0].operationKey, firstResult.reservation.operationKey);
    assert.equal(firstWrites[0].accounts[1].period, "2026-07");

    const retry = await authorityFor(runner, {
      now: JULY,
      attempt: {
        attemptNumber: 1,
        previousOutcome: "failed_retryable",
        previousOperationKeys: [firstResult.reservation.operationKey],
      },
      actualMonthlyCostMinor: 10,
    });
    const retryWrites = [];
    const retryResult = await runner.reserveRunnerSpend(repository(retry, retryWrites), input(retry, JULY));
    assert.equal(retryResult.kind, "reserved");
    assert.equal(retryResult.reservation.attemptNumber, 1);
    assert.notEqual(retry.perRun.accountId, first.perRun.accountId);
    assert.equal(retry.monthly.accountId, first.monthly.accountId);
    assert.equal(retryWrites.length, 1);
  } finally {
    await vite.close();
  }
});

test("runner rejects wrong attempt, operation, and UTC period bindings with zero writes", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const runner = await loadRunner(vite);
    const base = await authorityFor(runner, { now: JULY });
    const cases = [
      ["wrong attempt", { ...base, perRun: { ...base.perRun, attemptNumber: 1 } }],
      ["wrong operation", { ...base, perRun: { ...base.perRun, operationKey: `ro_${"b".repeat(64)}` } }],
      ["missing attempt discriminator", { ...base, perRun: omit(base.perRun, "attemptNumber") }],
      ["stale month", await authorityFor(runner, { now: JULY, accountPeriod: "2026-06" })],
      ["future month", await authorityFor(runner, { now: JULY, accountPeriod: "2026-08" })],
      ["missing month discriminator", { ...base, monthly: omit(base.monthly, "period") }],
    ];
    for (const [name, authority] of cases) {
      const writes = [];
      const result = await runner.reserveRunnerSpend(repository(authority, writes), input(authority, JULY));
      assert.equal(result.kind, "blocked", name);
      assert.deepEqual(writes, [], name);
    }
  } finally {
    await vite.close();
  }
});

test("fresh grants share the same monthly ledger and cannot reset its cap", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const runner = await loadRunner(vite);
    const firstGrant = await authorityFor(runner, {
      now: JULY,
      grantId: "runner-grant-a",
      perRunCostMinor: 20,
      monthlyCostMinor: 30,
    });
    const freshGrant = await authorityFor(runner, {
      now: JULY,
      grantId: "runner-grant-b",
      perRunCostMinor: 15,
      monthlyCostMinor: 30,
      actualMonthlyCostMinor: 20,
    });
    assert.notEqual(firstGrant.perRun.accountId, freshGrant.perRun.accountId);
    assert.equal(firstGrant.monthly.accountId, freshGrant.monthly.accountId);
    assert.equal(firstGrant.monthly.grantId, "runner-grant-a");
    assert.equal(freshGrant.monthly.grantId, "runner-grant-b");

    const writes = [];
    const result = await runner.reserveRunnerSpend(repository(freshGrant, writes), input(freshGrant, JULY));
    assert.equal(result.kind, "blocked");
    assert.equal(result.reason, "runner_budget_exceeded");
    assert.deepEqual(writes, []);

    const forgedReset = {
      ...freshGrant,
      monthly: {
        ...freshGrant.monthly,
        accountId: `${freshGrant.monthly.accountId}:14:runner-grant-b`,
        actualCostMinor: 0,
      },
    };
    const resetWrites = [];
    assert.equal(
      (await runner.reserveRunnerSpend(repository(forgedReset, resetWrites), input(forgedReset, JULY))).kind,
      "blocked",
    );
    assert.deepEqual(resetWrites, []);
  } finally {
    await vite.close();
  }
});

test("the next UTC month has a distinct ledger while uncertainty and settled outcomes cannot retry", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const runner = await loadRunner(vite);
    const july = await authorityFor(runner, { now: JULY, actualMonthlyCostMinor: 30 });
    const august = await authorityFor(runner, { now: AUGUST, actualMonthlyCostMinor: 0 });
    assert.notEqual(july.monthly.accountId, august.monthly.accountId);
    assert.equal(august.monthly.period, "2026-08");
    const nextMonthWrites = [];
    assert.equal(
      (await runner.reserveRunnerSpend(repository(august, nextMonthWrites), input(august, AUGUST))).kind,
      "reserved",
    );
    assert.equal(nextMonthWrites.length, 1);

    const firstKey = await runner.deriveRunnerOperationKey(july);
    for (const outcome of ["uncertain", "settled", "reserved"]) {
      const stopped = await authorityFor(runner, {
        now: JULY,
        attempt: { attemptNumber: 1, previousOutcome: outcome, previousOperationKeys: [firstKey] },
      });
      const writes = [];
      const result = await runner.reserveRunnerSpend(repository(stopped, writes), input(stopped, JULY));
      assert.equal(result.kind, "blocked", outcome);
      assert.equal(result.reason, "runner_retry_unavailable", outcome);
      assert.deepEqual(writes, [], outcome);
    }
  } finally {
    await vite.close();
  }
});

async function authorityFor(runner, options = {}) {
  const now = options.now ?? JULY;
  const grant = {
    authorityType: "runner_spend",
    id: options.grantId ?? "runner-grant",
    providerId: "runner-provider",
    model: "runner-model",
    catalogRef: "runner-catalog",
    runType: "prospecting",
    scopeId: "run-synthetic",
    perRunCostMinor: options.perRunCostMinor ?? 10,
    monthlyCostMinor: options.monthlyCostMinor ?? 30,
    currency: "USD",
    expiresAt: Date.UTC(2027, 0, 1),
    maxRetries: 1,
  };
  const attempt = options.attempt ?? {
    attemptNumber: 0,
    previousOutcome: "none",
    previousOperationKeys: [],
  };
  const authority = {
    admitted: true,
    workspaceId: options.workspaceId ?? "workspace-synthetic",
    principalSubject: "owner-synthetic",
    grant,
    attempt,
  };
  const operationKey = await runner.deriveRunnerOperationKey(authority);
  const period = options.accountPeriod ?? runner.deriveRunnerUtcMonthPeriod(now);
  return {
    ...authority,
    perRun: {
      authorityType: "runner_spend",
      accountId: runner.deriveRunnerPerRunAccountId({
        workspaceId: authority.workspaceId,
        principalSubject: authority.principalSubject,
        grantId: grant.id,
        providerId: grant.providerId,
        scopeId: grant.scopeId,
        attemptNumber: attempt.attemptNumber,
        operationKey,
      }),
      scope: "runner_per_run",
      principalSubject: authority.principalSubject,
      grantId: grant.id,
      providerId: grant.providerId,
      scopeId: grant.scopeId,
      attemptNumber: attempt.attemptNumber,
      operationKey,
      currency: grant.currency,
      actualCostMinor: 0,
      reservedCostMinor: 0,
      maxCostMinor: grant.perRunCostMinor,
    },
    monthly: {
      authorityType: "runner_spend",
      accountId: runner.deriveRunnerMonthlyAccountId({
        workspaceId: authority.workspaceId,
        principalSubject: authority.principalSubject,
        providerId: grant.providerId,
        scopeId: grant.scopeId,
        period,
      }),
      scope: "runner_monthly",
      principalSubject: authority.principalSubject,
      grantId: grant.id,
      providerId: grant.providerId,
      scopeId: grant.scopeId,
      period,
      currency: grant.currency,
      actualCostMinor: options.actualMonthlyCostMinor ?? 0,
      reservedCostMinor: 0,
      maxCostMinor: grant.monthlyCostMinor,
    },
  };
}

function repository(authority, writes) {
  return {
    async loadRunnerAuthority() { return authority; },
    async commitRunnerReservation(record, accounts, attempt) {
      writes.push({ record, accounts, attempt });
      return { kind: "created", record };
    },
  };
}

function input(authority, now) {
  return {
    grantId: authority.grant.id,
    principalSubject: authority.principalSubject,
    operationKey: authority.perRun.operationKey,
    now,
  };
}

function omit(record, key) {
  const copy = { ...record };
  delete copy[key];
  return copy;
}
