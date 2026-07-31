import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";

const NOW = Date.UTC(2026, 6, 15);
const EXPIRES = Date.UTC(2026, 6, 15, 0, 30);
const OWNER = "owner-input-snapshot";

async function load(vite, name) {
  return vite.ssrLoadModule(new URL(`../domain/${name}.ts`, import.meta.url).pathname);
}

test("grant issuance uses one immutable exact request snapshot across every await", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const issuance = await load(vite, "enrichment-grant-issuance");
    const input = grantInput();
    const writes = [];
    const result = await issuance.issueEnrichmentGrant({
      async loadIssuanceSnapshot(principalSubject, prospectIds) {
        assert.equal(principalSubject, OWNER);
        assert.deepEqual(prospectIds, ["prospect-input-snapshot"]);
        assert.equal(Object.isFrozen(prospectIds), true);
        await Promise.resolve();
        input.principalSubject = "owner-mutated";
        input.prospectIds.splice(0, 1, "prospect-mutated");
        input.maxUnits = 999;
        input.maxCostMinor = 999;
        input.currency = "CAD";
        input.expiresAt = NOW + 1;
        input.expectedRevision = 99;
        input.idempotencyKey = "mutated-idempotency";
        input.now = EXPIRES;
        return grantSnapshot();
      },
      async findGrantByIdempotency(workspaceId, idempotencyKey) {
        assert.equal(workspaceId, "workspace-input-snapshot");
        assert.equal(idempotencyKey, "grant-input-snapshot");
        await Promise.resolve();
        input.operation = "mutated";
        return null;
      },
      async commitGrant(record) {
        writes.push(record);
        input.idempotencyKey = "mutated-again";
        input.prospectIds.length = 0;
        await Promise.resolve();
        return { kind: "created", record };
      },
      nextNonce: () => "input-snapshot-nonce",
    }, input);

    assert.equal(result.kind, "issued");
    assert.equal(writes.length, 1);
    assert.equal(result.grant.idempotencyKey, "grant-input-snapshot");
    assert.equal(result.grant.tuple.ownerSubject, OWNER);
    assert.deepEqual(result.grant.tuple.prospectIds, ["prospect-input-snapshot"]);
    assert.equal(result.grant.tuple.operation, "business_contact_lookup/v1");
    assert.equal(result.grant.tuple.maxUnits, 1);
    assert.equal(result.grant.tuple.maxCostMinor, 10);
    assert.equal(result.grant.tuple.currency, "USD");
    assert.equal(result.grant.tuple.expiresAt, EXPIRES);
    assert.equal(result.grant.tuple.sourceRevision, 7);
  } finally {
    await vite.close();
  }
});

test("grant issuance rejects accessor, proxy, extra, custom-prototype, sparse, and invalid-clock inputs before repository access", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const issuance = await load(vite, "enrichment-grant-issuance");
    let getterCalls = 0;
    const accessor = { ...grantInput() };
    Object.defineProperty(accessor, "maxCostMinor", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return 10;
      },
    });
    const sparseIds = new Array(1);
    const customPrototype = Object.assign(Object.create({ inherited: true }), grantInput());
    const cases = [
      ["accessor", accessor],
      ["proxy", new Proxy(grantInput(), {})],
      ["extra", { ...grantInput(), unauthorized: true }],
      ["custom prototype", customPrototype],
      ["sparse prospects", { ...grantInput(), prospectIds: sparseIds }],
      ["zero clock", { ...grantInput(), now: 0 }],
      ["unsafe clock", { ...grantInput(), now: Number.MAX_VALUE }],
    ];

    for (const [name, candidate] of cases) {
      let loads = 0;
      let writes = 0;
      const result = await issuance.issueEnrichmentGrant({
        async loadIssuanceSnapshot() {
          loads += 1;
          return grantSnapshot();
        },
        async findGrantByIdempotency() {
          throw new Error("invalid request must not probe replay");
        },
        async commitGrant() {
          writes += 1;
          throw new Error("invalid request must not write");
        },
      }, candidate);
      assert.deepEqual(result, { kind: "blocked", reason: "invalid_request" }, name);
      assert.equal(loads, 0, `${name}: authority must not load`);
      assert.equal(writes, 0, `${name}: grant must not write`);
    }
    assert.equal(getterCalls, 0, "request getters must never execute");
  } finally {
    await vite.close();
  }
});

test("runner reservation uses one immutable exact request snapshot across every await", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const runner = await load(vite, "runner-spend-authority");
    const authority = await runnerAuthority(runner);
    const input = runnerInput(authority);
    const writes = [];
    const result = await runner.reserveRunnerSpend({
      async loadRunnerAuthority(grantId) {
        assert.equal(grantId, "runner-grant-input-snapshot");
        await Promise.resolve();
        input.grantId = "runner-grant-mutated";
        input.principalSubject = "owner-mutated";
        input.operationKey = `ro_${"f".repeat(64)}`;
        input.now = authority.grant.expiresAt;
        return authority;
      },
      async commitRunnerReservation(record) {
        writes.push(record);
        input.operationKey = `ro_${"e".repeat(64)}`;
        input.now = 0;
        await Promise.resolve();
        return { kind: "created", record };
      },
    }, input);

    assert.equal(result.kind, "reserved");
    assert.equal(writes.length, 1);
    assert.equal(result.reservation.grantId, "runner-grant-input-snapshot");
    assert.equal(result.reservation.operationKey, authority.perRun.operationKey);
    assert.equal(result.reservation.reservedCostMinor, 10);
  } finally {
    await vite.close();
  }
});

test("runner reservation rejects accessor, proxy, extra, custom-prototype, and invalid-clock inputs before repository access", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const runner = await load(vite, "runner-spend-authority");
    const authority = await runnerAuthority(runner);
    let getterCalls = 0;
    const accessor = { ...runnerInput(authority) };
    Object.defineProperty(accessor, "operationKey", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return authority.perRun.operationKey;
      },
    });
    const customPrototype = Object.assign(Object.create({ inherited: true }), runnerInput(authority));
    const cases = [
      ["accessor", accessor],
      ["proxy", new Proxy(runnerInput(authority), {})],
      ["extra", { ...runnerInput(authority), unauthorized: true }],
      ["custom prototype", customPrototype],
      ["zero clock", { ...runnerInput(authority), now: 0 }],
      ["unsafe clock", { ...runnerInput(authority), now: Number.MAX_VALUE }],
    ];

    for (const [name, candidate] of cases) {
      let loads = 0;
      let writes = 0;
      const result = await runner.reserveRunnerSpend({
        async loadRunnerAuthority() {
          loads += 1;
          return authority;
        },
        async commitRunnerReservation() {
          writes += 1;
          throw new Error("invalid request must not reserve");
        },
      }, candidate);
      assert.deepEqual(result, { kind: "blocked", reason: "runner_invalid_request" }, name);
      assert.equal(loads, 0, `${name}: authority must not load`);
      assert.equal(writes, 0, `${name}: reservation must not write`);
    }
    assert.equal(getterCalls, 0, "request getters must never execute");
  } finally {
    await vite.close();
  }
});

function grantInput() {
  return {
    principalSubject: OWNER,
    prospectIds: ["prospect-input-snapshot"],
    operation: "business_contact_lookup/v1",
    maxUnits: 1,
    maxCostMinor: 10,
    currency: "USD",
    expiresAt: EXPIRES,
    expectedRevision: 7,
    idempotencyKey: "grant-input-snapshot",
    now: NOW,
  };
}

function grantSnapshot() {
  return {
    admitted: true,
    workspaceId: "workspace-input-snapshot",
    ownerSubject: OWNER,
    revision: 7,
    configuration: {
      id: "configuration-input-snapshot",
      digest: "a".repeat(64),
      revision: 3,
      current: true,
    },
    prospects: [{
      id: "prospect-input-snapshot",
      state: "approved",
      configurationId: "configuration-input-snapshot",
      configurationDigest: "a".repeat(64),
      revision: 4,
    }],
    quote: {
      providerId: "provider-input-snapshot",
      providerVersion: "v1",
      catalogRef: "catalog-input-snapshot",
      revision: 2,
      currency: "USD",
      unitCostMinor: 10,
      expiresAt: Date.UTC(2026, 6, 15, 0, 45),
    },
  };
}

async function runnerAuthority(runner) {
  const grant = {
    authorityType: "runner_spend",
    id: "runner-grant-input-snapshot",
    providerId: "runner-provider",
    model: "runner-model",
    catalogRef: "runner-catalog",
    runType: "prospecting",
    scopeId: "runner-scope",
    perRunCostMinor: 10,
    monthlyCostMinor: 100,
    currency: "USD",
    expiresAt: Date.UTC(2027, 0, 1),
    maxRetries: 0,
  };
  const attempt = {
    attemptNumber: 0,
    previousOutcome: "none",
    previousOperationKeys: [],
  };
  const operationKey = await runner.deriveRunnerOperationKey({
    workspaceId: "workspace-input-snapshot",
    principalSubject: OWNER,
    grant,
    attempt,
  });
  const period = runner.deriveRunnerUtcMonthPeriod(NOW);
  return {
    admitted: true,
    workspaceId: "workspace-input-snapshot",
    principalSubject: OWNER,
    grant,
    attempt,
    perRun: {
      authorityType: "runner_spend",
      accountId: runner.deriveRunnerPerRunAccountId({
        workspaceId: "workspace-input-snapshot",
        principalSubject: OWNER,
        grantId: grant.id,
        providerId: grant.providerId,
        scopeId: grant.scopeId,
        attemptNumber: 0,
        operationKey,
      }),
      scope: "runner_per_run",
      principalSubject: OWNER,
      grantId: grant.id,
      providerId: grant.providerId,
      scopeId: grant.scopeId,
      attemptNumber: 0,
      operationKey,
      currency: "USD",
      actualCostMinor: 0,
      reservedCostMinor: 0,
      maxCostMinor: 10,
    },
    monthly: {
      authorityType: "runner_spend",
      accountId: runner.deriveRunnerMonthlyAccountId({
        workspaceId: "workspace-input-snapshot",
        principalSubject: OWNER,
        providerId: grant.providerId,
        scopeId: grant.scopeId,
        period,
      }),
      scope: "runner_monthly",
      principalSubject: OWNER,
      grantId: grant.id,
      providerId: grant.providerId,
      scopeId: grant.scopeId,
      period,
      currency: "USD",
      actualCostMinor: 0,
      reservedCostMinor: 0,
      maxCostMinor: 100,
    },
  };
}

function runnerInput(authority) {
  return {
    grantId: authority.grant.id,
    principalSubject: authority.principalSubject,
    operationKey: authority.perRun.operationKey,
    now: NOW,
  };
}
