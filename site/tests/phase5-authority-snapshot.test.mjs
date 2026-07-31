import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";

async function load(vite, name) {
  return vite.ssrLoadModule(new URL(`../domain/${name}.ts`, import.meta.url).pathname);
}

test("grant authority rejects accessors, proxies, extras, and delayed provider economics mutation before lookup or write", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const issuance = await load(vite, "enrichment-grant-issuance");
    const cases = [
      ["provider accessor", (counters) => withAccessor(issuanceSnapshot(), "quote", "providerId", "provider-attacker", counters)],
      ["catalog accessor", (counters) => withAccessor(issuanceSnapshot(), "quote", "catalogRef", "catalog-attacker", counters)],
      ["cost accessor", (counters) => withAccessor(issuanceSnapshot(), "quote", "unitCostMinor", 0, counters)],
      ["nested extra", () => ({ ...issuanceSnapshot(), quote: { ...issuanceSnapshot().quote, unauthorized: true } })],
      ["custom prototype", () => ({ ...issuanceSnapshot(), quote: Object.assign(Object.create({ inherited: true }), issuanceSnapshot().quote) })],
      ["proxy microtask mutation", () => withMutatingQuoteProxy(issuanceSnapshot())],
    ];
    for (const [name, makeSnapshot] of cases) {
      const counters = { getterCalls: 0, lookups: 0, writes: 0 };
      const snapshot = makeSnapshot(counters);
      const result = await issuance.issueEnrichmentGrant({
        async loadIssuanceSnapshot() { return snapshot; },
        async findGrantByIdempotency() {
          counters.lookups += 1;
          throw new Error("invalid authority must not reach replay lookup");
        },
        async commitGrant() {
          counters.writes += 1;
          throw new Error("invalid authority must not commit");
        },
      }, issueInput());
      await Promise.resolve();
      assert.deepEqual(result, { kind: "blocked", reason: "repository_result_invalid" }, name);
      assert.equal(counters.getterCalls, 0, `${name}: an authority getter must never execute`);
      assert.equal(counters.lookups, 0, `${name}: malformed authority cannot probe idempotency`);
      assert.equal(counters.writes, 0, `${name}: malformed authority cannot write`);
    }
  } finally {
    await vite.close();
  }
});

test("grant replay validates the immutable original before current freshness while changed and foreign requests stay contained", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const issuance = await load(vite, "enrichment-grant-issuance");
    const records = new Map();
    let snapshot = issuanceSnapshot();
    const counters = { lookups: 0, writes: 0 };
    const repository = {
      async loadIssuanceSnapshot() { return snapshot; },
      async findGrantByIdempotency(_workspaceId, key) {
        counters.lookups += 1;
        return records.get(key) ?? null;
      },
      async commitGrant(record) {
        counters.writes += 1;
        records.set(record.idempotencyKey, record);
        return { kind: "created", record };
      },
      nextNonce: () => "snapshot-replay-nonce",
    };
    const input = issueInput();
    const first = await issuance.issueEnrichmentGrant(repository, input);
    assert.equal(first.kind, "issued");
    assert.equal(counters.writes, 1);

    snapshot = {
      ...issuanceSnapshot(),
      revision: 8,
      configuration: {
        ...issuanceSnapshot().configuration,
        digest: "b".repeat(64),
        revision: 4,
        current: false,
      },
      prospects: [{
        ...issuanceSnapshot().prospects[0],
        configurationDigest: "b".repeat(64),
        revision: 5,
      }],
      quote: {
        ...issuanceSnapshot().quote,
        providerId: "provider-replacement",
        catalogRef: "catalog-replacement",
        revision: 3,
        unitCostMinor: 999,
        expiresAt: 900,
      },
    };
    const replay = await issuance.issueEnrichmentGrant(repository, input);
    assert.equal(replay.kind, "issued");
    assert.equal(replay.replayed, true);
    assert.equal(replay.grant.id, first.grant.id);
    assert.equal(counters.writes, 1, "a replay never creates a second grant");

    const changed = await issuance.issueEnrichmentGrant(repository, { ...input, maxCostMinor: 11 });
    assert.deepEqual(changed, { kind: "conflict", reason: "idempotency_conflict" });
    assert.equal(counters.writes, 1);

    const lookupsBeforeForeign = counters.lookups;
    const foreign = await issuance.issueEnrichmentGrant({
      ...repository,
      async loadIssuanceSnapshot() { return { ...snapshot, ownerSubject: "owner-authorized" }; },
    }, { ...input, principalSubject: "owner-foreign" });
    assert.deepEqual(foreign, { kind: "blocked", reason: "owner_not_admitted" });
    assert.equal(counters.lookups, lookupsBeforeForeign, "a foreign principal cannot probe grant existence");

    const denied = await issuance.issueEnrichmentGrant({
      ...repository,
      async loadIssuanceSnapshot() { return { ...snapshot, admitted: false }; },
    }, input);
    assert.deepEqual(denied, { kind: "blocked", reason: "owner_not_admitted" });
    assert.equal(counters.lookups, lookupsBeforeForeign, "a non-admitted principal cannot probe grant existence");
  } finally {
    await vite.close();
  }
});

test("runner authority is copied once and rejects getter, proxy, prototype, and extra-field attacks with zero reservations", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const runner = await load(vite, "runner-spend-authority");
    const base = await runnerAuthority(runner);
    const cases = [
      ["provider getter", (counters) => withAccessor(base, "grant", "providerId", "provider-attacker", counters)],
      ["catalog getter", (counters) => withAccessor(base, "grant", "catalogRef", "catalog-attacker", counters)],
      ["cost getter", (counters) => withAccessor(base, "grant", "perRunCostMinor", 0, counters)],
      ["nested extra", () => ({ ...base, grant: { ...base.grant, unauthorized: true } })],
      ["custom prototype", () => ({ ...base, monthly: Object.assign(Object.create({ inherited: true }), base.monthly) })],
      ["proxy microtask mutation", () => withMutatingRunnerProxy(base)],
    ];
    for (const [name, makeAuthority] of cases) {
      const counters = { getterCalls: 0, writes: 0 };
      const authority = makeAuthority(counters);
      const result = await runner.reserveRunnerSpend({
        async loadRunnerAuthority() { return authority; },
        async commitRunnerReservation() {
          counters.writes += 1;
          throw new Error("invalid authority must not reserve spend");
        },
      }, runnerInput(base));
      await Promise.resolve();
      assert.equal(result.kind, "blocked", name);
      assert.equal(counters.getterCalls, 0, `${name}: an authority getter must never execute`);
      assert.equal(counters.writes, 0, `${name}: invalid authority must not reserve`);
    }

    const writes = [];
    const accepted = await runner.reserveRunnerSpend({
      async loadRunnerAuthority() { return base; },
      async commitRunnerReservation(record) {
        writes.push(record);
        return { kind: "created", record };
      },
    }, runnerInput(base));
    assert.equal(accepted.kind, "reserved");
    assert.equal(writes.length, 1);
    assert.equal(Object.isFrozen(accepted.reservation), true);
  } finally {
    await vite.close();
  }
});

function issuanceSnapshot() {
  return {
    admitted: true,
    workspaceId: "workspace-snapshot",
    ownerSubject: "owner-authorized",
    revision: 7,
    configuration: {
      id: "configuration-snapshot",
      digest: "a".repeat(64),
      revision: 3,
      current: true,
    },
    prospects: [{
      id: "prospect-snapshot",
      state: "approved",
      configurationId: "configuration-snapshot",
      configurationDigest: "a".repeat(64),
      revision: 4,
    }],
    quote: {
      providerId: "provider-snapshot",
      providerVersion: "v1",
      catalogRef: "catalog-snapshot",
      revision: 2,
      currency: "USD",
      unitCostMinor: 10,
      expiresAt: 2_000,
    },
  };
}

function issueInput() {
  return {
    principalSubject: "owner-authorized",
    prospectIds: ["prospect-snapshot"],
    operation: "business_contact_lookup/v1",
    maxUnits: 1,
    maxCostMinor: 10,
    currency: "USD",
    expiresAt: 1_500,
    expectedRevision: 7,
    idempotencyKey: "authority-snapshot-replay",
    now: 1_000,
  };
}

function withAccessor(root, containerKey, property, replacement, counters = { getterCalls: 0 }) {
  const container = { ...root[containerKey] };
  const original = container[property];
  Object.defineProperty(container, property, {
    enumerable: true,
    get() {
      counters.getterCalls += 1;
      queueMicrotask(() => {
        Object.defineProperty(container, property, {
          configurable: true,
          enumerable: true,
          value: replacement,
          writable: true,
        });
      });
      return original;
    },
  });
  return { ...root, [containerKey]: container };
}

function withMutatingQuoteProxy(root) {
  const quote = { ...root.quote };
  let queued = false;
  const proxy = new Proxy(quote, {
    getOwnPropertyDescriptor(target, property) {
      if (!queued && property === "providerId") {
        queued = true;
        queueMicrotask(() => {
          target.providerId = "provider-attacker";
          target.catalogRef = "catalog-attacker";
          target.unitCostMinor = 0;
        });
      }
      return Reflect.getOwnPropertyDescriptor(target, property);
    },
  });
  return { ...root, quote: proxy };
}

async function runnerAuthority(runner) {
  const principalSubject = "owner-authorized";
  const grant = {
    authorityType: "runner_spend",
    id: "runner-grant-snapshot",
    providerId: "runner-provider",
    model: "runner-model",
    catalogRef: "runner-catalog",
    runType: "prospecting",
    scopeId: "runner-scope",
    perRunCostMinor: 10,
    monthlyCostMinor: 100,
    currency: "USD",
    expiresAt: 2_000,
    maxRetries: 0,
  };
  const attempt = { attemptNumber: 0, previousOutcome: "none", previousOperationKeys: [] };
  const seed = { principalSubject, grant, attempt };
  const operationKey = await runner.deriveRunnerOperationKey(seed);
  const period = runner.deriveRunnerUtcMonthPeriod(1_100);
  return {
    admitted: true,
    ...seed,
    perRun: {
      authorityType: "runner_spend",
      accountId: runner.deriveRunnerPerRunAccountId({
        principalSubject,
        grantId: grant.id,
        providerId: grant.providerId,
        scopeId: grant.scopeId,
        attemptNumber: 0,
        operationKey,
      }),
      scope: "runner_per_run",
      principalSubject,
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
        principalSubject,
        providerId: grant.providerId,
        scopeId: grant.scopeId,
        period,
      }),
      scope: "runner_monthly",
      principalSubject,
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
    now: 1_100,
  };
}

function withMutatingRunnerProxy(root) {
  const grant = { ...root.grant };
  let queued = false;
  const proxy = new Proxy(grant, {
    getOwnPropertyDescriptor(target, property) {
      if (!queued && property === "providerId") {
        queued = true;
        queueMicrotask(() => {
          target.providerId = "provider-attacker";
          target.catalogRef = "catalog-attacker";
          target.perRunCostMinor = 0;
        });
      }
      return Reflect.getOwnPropertyDescriptor(target, property);
    },
  });
  return { ...root, grant: proxy };
}
