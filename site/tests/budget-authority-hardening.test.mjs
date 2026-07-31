import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";

async function load(vite, name) {
  return vite.ssrLoadModule(new URL(`../domain/${name}.ts`, import.meta.url).pathname);
}

test("enrichment budget accounts are bound to exact authority entities before any write", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const [issuance, authority] = await Promise.all([
      load(vite, "enrichment-grant-issuance"),
      load(vite, "enrichment-authority"),
    ]);
    const snapshot = issuanceSnapshot();
    const issued = await issuance.issueEnrichmentGrant({
      async loadIssuanceSnapshot() { return snapshot; },
      async findGrantByIdempotency() { return null; },
      async commitGrant(record) { return { kind: "created", record }; },
      nextNonce: () => "budget-hardening-nonce",
    }, {
      principalSubject: "owner-synthetic",
      prospectIds: ["prospect-synthetic"],
      operation: "business_contact_lookup/v1",
      maxUnits: 1,
      maxCostMinor: 10,
      currency: "USD",
      expiresAt: 1_500,
      expectedRevision: 7,
      idempotencyKey: "budget-hardening",
      now: 1_000,
    });
    assert.equal(issued.kind, "issued");
    const base = enrichmentAuthority(issued.grant, snapshot);
    const validWrites = [];
    const accepted = await authority.reserveEnrichmentOperation(enrichmentRepository(base, validWrites), reservationInput(issued.grant));
    assert.equal(accepted.kind, "reserved");
    assert.equal(validWrites.length, 1);
    assert.equal(validWrites[0].accounts.every(Object.isFrozen), true);

    const mutations = [
      ["duplicate account", (accounts) => [accounts[0], accounts[0], accounts[2], accounts[3]]],
      ["wrong workspace", (accounts) => accounts.map((account, index) => index === 2 ? { ...account, workspaceId: "workspace-other" } : account)],
      ["wrong provider", (accounts) => accounts.map((account, index) => index === 3 ? { ...account, entityId: "provider-other" } : account)],
      ["wrong profile", (accounts) => accounts.map((account, index) => index === 1 ? { ...account, entityId: "configuration-other" } : account)],
      ["wrong grant", (accounts) => accounts.map((account, index) => index === 0 ? { ...account, entityId: "grant-other" } : account)],
      ["cross authority", (accounts) => accounts.map((account, index) => index === 0 ? { ...account, authorityType: "runner_spend" } : account)],
      ["forged account id", (accounts) => accounts.map((account, index) => index === 0 ? { ...account, accountId: "enrichment:forged" } : account)],
    ];
    for (const [name, mutate] of mutations) {
      const writes = [];
      const result = await authority.reserveEnrichmentOperation(
        enrichmentRepository({ ...base, accounts: mutate(base.accounts) }, writes),
        reservationInput(issued.grant),
      );
      assert.equal(result.kind, "blocked", name);
      assert.deepEqual(writes, [], name);
    }
  } finally {
    await vite.close();
  }
});

test("runner reserves one attempt against both ledgers and separately enforces the grant monthly ceiling", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const runner = await load(vite, "runner-spend-authority");
    const authority = runnerAuthority();
    const operationKey = await runner.deriveRunnerOperationKey(authority);
    const commits = [];
    const accepted = await runner.reserveRunnerSpend({
      async loadRunnerAuthority() { return authority; },
      async commitRunnerReservation(record, accounts) {
        commits.push({ record, accounts });
        return { kind: "created", record };
      },
    }, { grantId: authority.grant.id, principalSubject: authority.principalSubject, operationKey, now: 1_100 });
    assert.equal(accepted.kind, "reserved");
    assert.equal(commits.length, 1);
    assert.equal(commits[0].record.reservedCostMinor, 10);
    assert.equal(commits[0].accounts.length, 2);
    assert.equal(commits[0].accounts.every(Object.isFrozen), true);

    const ceilingWrites = [];
    const overGrantCeiling = runnerAuthority({ monthly: runnerAccount("runner_monthly", { actualCostMinor: 91, maxCostMinor: 1_000 }) });
    const ceilingResult = await runner.reserveRunnerSpend(runnerRepository(overGrantCeiling, ceilingWrites), {
      grantId: overGrantCeiling.grant.id,
      principalSubject: overGrantCeiling.principalSubject,
      operationKey: await runner.deriveRunnerOperationKey(overGrantCeiling),
      now: 1_100,
    });
    assert.equal(ceilingResult.kind, "blocked");
    assert.deepEqual(ceilingWrites, []);
  } finally {
    await vite.close();
  }
});

test("runner rejects duplicate, mismatched, and cross-authority accounts with zero writes", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const runner = await load(vite, "runner-spend-authority");
    const base = runnerAuthority();
    const cases = [
      ["duplicate account id", { monthly: { ...base.monthly, accountId: base.perRun.accountId } }],
      ["wrong owner", { monthly: { ...base.monthly, principalSubject: "owner-other" } }],
      ["wrong provider", { monthly: { ...base.monthly, providerId: "provider-other" } }],
      ["wrong grant", { monthly: { ...base.monthly, grantId: "grant-other" } }],
      ["wrong run", { monthly: { ...base.monthly, scopeId: "run-other" } }],
      ["cross authority", { monthly: { ...base.monthly, authorityType: "enrichment" } }],
      ["forged account id", { monthly: { ...base.monthly, accountId: "runner:forged" } }],
    ];
    for (const [name, patch] of cases) {
      const candidate = runnerAuthority(patch);
      const writes = [];
      const result = await runner.reserveRunnerSpend(runnerRepository(candidate, writes), {
        grantId: candidate.grant.id,
        principalSubject: candidate.principalSubject,
        operationKey: await runner.deriveRunnerOperationKey(candidate),
        now: 1_100,
      });
      assert.equal(result.kind, "blocked", name);
      assert.deepEqual(writes, [], name);
    }
  } finally {
    await vite.close();
  }
});

function issuanceSnapshot() {
  return {
    admitted: true,
    workspaceId: "workspace-synthetic",
    ownerSubject: "owner-synthetic",
    revision: 7,
    configuration: { id: "configuration-synthetic", digest: "a".repeat(64), revision: 3, current: true },
    prospects: [{ id: "prospect-synthetic", state: "approved", configurationId: "configuration-synthetic", configurationDigest: "a".repeat(64), revision: 4 }],
    quote: { providerId: "provider-synthetic", providerVersion: "v1", catalogRef: "catalog-synthetic", revision: 2, currency: "USD", unitCostMinor: 10, expiresAt: 2_000 },
  };
}

function enrichmentAuthority(grant, snapshot) {
  return {
    admitted: true,
    principalSubject: "owner-synthetic",
    workspaceId: snapshot.workspaceId,
    sourceRevision: snapshot.revision,
    grant,
    configuration: snapshot.configuration,
    prospects: snapshot.prospects,
    quote: snapshot.quote,
    accounts: [
      enrichmentAccount("grant", grant.id),
      enrichmentAccount("profile", snapshot.configuration.id),
      enrichmentAccount("workspace", snapshot.workspaceId),
      enrichmentAccount("provider", snapshot.quote.providerId),
    ],
    evidenceAssignments: [{
      assignmentId: "assignment-synthetic",
      prospectId: "prospect-synthetic",
      role: "general",
      workspaceId: snapshot.workspaceId,
      contactId: "contact-synthetic",
      profileConfigurationId: snapshot.configuration.id,
      profileConfigurationDigest: snapshot.configuration.digest,
    }],
  };
}

function enrichmentAccount(scope, entityId) {
  const workspaceId = "workspace-synthetic";
  return {
    authorityType: "enrichment",
    accountId: `enrichment:${component(workspaceId)}:${scope}:${component(entityId)}`,
    scope,
    workspaceId,
    entityId,
    currency: "USD",
    actualUnits: 0,
    reservedUnits: 0,
    maxUnits: 10,
    actualCostMinor: 0,
    reservedCostMinor: 0,
    maxCostMinor: 100,
  };
}

function enrichmentRepository(authority, writes) {
  return {
    async loadReservationAuthority() { return authority; },
    async commitReservation(record, accounts) {
      writes.push({ record, accounts });
      return { kind: "created", record };
    },
  };
}

function reservationInput(grant) {
  return { grantId: grant.id, principalSubject: "owner-synthetic", operationKey: grant.tuple.operationKey, now: 1_100 };
}

function runnerAuthority(patch = {}) {
  const grant = {
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
    expiresAt: 2_000,
    maxRetries: 0,
  };
  return {
    admitted: true,
    principalSubject: "owner-synthetic",
    grant,
    attempt: { attemptNumber: 0, previousOutcome: "none", previousOperationKeys: [] },
    perRun: runnerAccount("runner_per_run"),
    monthly: runnerAccount("runner_monthly", { actualCostMinor: 80 }),
    ...patch,
  };
}

function runnerAccount(scope, patch = {}) {
  const principalSubject = "owner-synthetic";
  const grantId = "runner-grant";
  const providerId = "runner-provider";
  const scopeId = "run-synthetic";
  return {
    authorityType: "runner_spend",
    accountId: `runner:${scope}:${component(principalSubject)}:${component(grantId)}:${component(providerId)}:${component(scopeId)}`,
    scope,
    principalSubject,
    grantId,
    providerId,
    scopeId,
    currency: "USD",
    actualCostMinor: 0,
    reservedCostMinor: 0,
    maxCostMinor: 100,
    ...patch,
  };
}

function runnerRepository(authority, writes) {
  return {
    async loadRunnerAuthority() { return authority; },
    async commitRunnerReservation(record) {
      writes.push(record);
      return { kind: "created", record };
    },
  };
}

function component(value) {
  return `${value.length}:${value}`;
}
