import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";

async function load(vite, name) {
  return vite.ssrLoadModule(new URL(`../domain/${name}.ts`, import.meta.url).pathname);
}

function issuanceSnapshot() {
  return {
    admitted: true,
    workspaceId: "workspace-boundary",
    ownerSubject: "owner-boundary",
    revision: 7,
    configuration: {
      id: "config-boundary",
      digest: "a".repeat(64),
      revision: 3,
      current: true,
    },
    prospects: [{
      id: "prospect-boundary",
      state: "approved",
      configurationId: "config-boundary",
      configurationDigest: "a".repeat(64),
      revision: 4,
    }],
    quote: {
      providerId: "synthetic-provider",
      providerVersion: "v1",
      catalogRef: "catalog-boundary",
      revision: 2,
      currency: "USD",
      unitCostMinor: 5,
      expiresAt: 2_000,
    },
  };
}

async function issueGrant(issuance) {
  const snapshot = issuanceSnapshot();
  const result = await issuance.issueEnrichmentGrant({
    async loadIssuanceSnapshot() { return snapshot; },
    async findGrantByIdempotency() { return null; },
    async commitGrant(record) { return { kind: "created", record }; },
    nextNonce: () => "server-nonce-boundary",
  }, {
    principalSubject: snapshot.ownerSubject,
    prospectIds: [snapshot.prospects[0].id],
    operation: "business_contact_lookup/v1",
    maxUnits: 1,
    maxCostMinor: 5,
    currency: "USD",
    expiresAt: 1_500,
    expectedRevision: snapshot.revision,
    idempotencyKey: "boundary-input-grant",
    now: 1_000,
  });
  assert.equal(result.kind, "issued");
  return result.grant;
}

function budget(scope, grant) {
  const entityId = scope === "grant"
    ? grant.id
    : scope === "profile"
      ? grant.tuple.configurationId
      : scope === "workspace"
        ? grant.workspaceId
        : grant.tuple.providerId;
  return {
    authorityType: "enrichment",
    accountId: `enrichment:${grant.workspaceId.length}:${grant.workspaceId}:${scope}:${entityId.length}:${entityId}`,
    scope,
    workspaceId: grant.workspaceId,
    entityId,
    currency: grant.tuple.currency,
    actualUnits: 0,
    reservedUnits: 0,
    maxUnits: grant.tuple.maxUnits,
    actualCostMinor: 0,
    reservedCostMinor: 0,
    maxCostMinor: grant.tuple.maxCostMinor,
  };
}

function reservationAuthority(grant) {
  const snapshot = issuanceSnapshot();
  return {
    admitted: true,
    principalSubject: snapshot.ownerSubject,
    workspaceId: snapshot.workspaceId,
    sourceRevision: snapshot.revision,
    grant,
    configuration: snapshot.configuration,
    prospects: snapshot.prospects,
    quote: snapshot.quote,
    accounts: ["grant", "profile", "workspace", "provider"].map((scope) => budget(scope, grant)),
    evidenceAssignments: [{
      assignmentId: "assignment-boundary",
      prospectId: snapshot.prospects[0].id,
      role: "champion",
      workspaceId: snapshot.workspaceId,
      contactId: "contact-boundary",
      profileConfigurationId: snapshot.configuration.id,
      profileConfigurationDigest: snapshot.configuration.digest,
    }],
  };
}

function exactInputVariants(valid, accessorKey) {
  let getterCalls = 0;
  const accessor = { ...valid };
  Object.defineProperty(accessor, accessorKey, {
    enumerable: true,
    get() {
      getterCalls += 1;
      return valid[accessorKey];
    },
  });
  const nonEnumerable = { ...valid };
  Object.defineProperty(nonEnumerable, "hidden", { value: true });
  const symbol = { ...valid, [Symbol("hidden")]: true };
  const customPrototype = Object.assign(Object.create({ inherited: true }), valid);
  return {
    cases: [
      ["accessor", accessor],
      ["proxy", new Proxy({ ...valid }, {})],
      ["enumerable extra", { ...valid, extra: true }],
      ["non-enumerable extra", nonEnumerable],
      ["symbol extra", symbol],
      ["custom prototype", customPrototype],
    ],
    getterCalls: () => getterCalls,
  };
}

test("reservation snapshots exact public input before any repository access", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const [issuance, authority] = await Promise.all([
      load(vite, "enrichment-grant-issuance"),
      load(vite, "enrichment-authority"),
    ]);
    const grant = await issueGrant(issuance);
    const persistedAuthority = reservationAuthority(grant);
    const valid = {
      grantId: grant.id,
      principalSubject: persistedAuthority.principalSubject,
      operationKey: grant.tuple.operationKey,
      now: 1_100,
    };
    const variants = exactInputVariants(valid, "principalSubject");

    for (const [name, input] of variants.cases) {
      const effects = { loads: 0, commits: 0 };
      const repository = {
        async loadReservationAuthority() { effects.loads += 1; return persistedAuthority; },
        async commitReservation(record) { effects.commits += 1; return { kind: "created", record }; },
      };
      assert.deepEqual(
        await authority.reserveEnrichmentOperation(repository, input),
        { kind: "blocked", reason: "grant_unavailable" },
        name,
      );
      assert.deepEqual(effects, { loads: 0, commits: 0 }, name);
      assert.equal(
        (await authority.validateEnrichmentAuthority(persistedAuthority, input)).kind,
        "blocked",
        `${name}: exported validator`,
      );
    }
    assert.equal(variants.getterCalls(), 0, "accessor-backed input is rejected without getter evaluation");

    let releaseLoad;
    const effects = { loads: 0, commits: 0 };
    const mutableInput = { ...valid, principalSubject: "initially-unauthorized" };
    const pending = authority.reserveEnrichmentOperation({
      async loadReservationAuthority() {
        effects.loads += 1;
        return new Promise((resolve) => { releaseLoad = () => resolve(persistedAuthority); });
      },
      async commitReservation(record) {
        effects.commits += 1;
        return { kind: "created", record };
      },
    }, mutableInput);
    await Promise.resolve();
    mutableInput.principalSubject = persistedAuthority.principalSubject;
    releaseLoad();
    assert.deepEqual(await pending, { kind: "blocked", reason: "owner_not_admitted" });
    assert.deepEqual(effects, { loads: 1, commits: 0 }, "mutation during load cannot acquire commit authority");

    const validEffects = { loads: 0, commits: 0 };
    const validResult = await authority.reserveEnrichmentOperation({
      async loadReservationAuthority() { validEffects.loads += 1; return persistedAuthority; },
      async commitReservation(record) { validEffects.commits += 1; return { kind: "created", record }; },
    }, valid);
    assert.equal(validResult.kind, "reserved");
    assert.deepEqual(validEffects, { loads: 1, commits: 1 });
  } finally {
    await vite.close();
  }
});

test("execution snapshots exact public input before claim, provider, or settlement", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const [issuance, authority, operation, portModule] = await Promise.all([
      load(vite, "enrichment-grant-issuance"),
      load(vite, "enrichment-authority"),
      load(vite, "enrichment-operation"),
      load(vite, "contact-provider-port"),
    ]);
    const grant = await issueGrant(issuance);
    const persistedAuthority = reservationAuthority(grant);
    const effects = { claims: 0, providerCalls: 0, settlements: 0, reconciliations: 0 };
    let committed;
    let releaseClaim;
    const repository = {
      async loadReservationAuthority() { return persistedAuthority; },
      async commitReservation(record) { committed = record; return { kind: "created", record }; },
      async claimCommittedInvocation(_reservationId, now) {
        effects.claims += 1;
        return new Promise((resolve) => {
          releaseClaim = () => resolve({ kind: "claimed", assignment: committed.assignment, claimedAt: now });
        });
      },
      async settleReservation(reservationId, settlement) {
        effects.settlements += 1;
        return {
          kind: "durably_recorded",
          reservationId,
          terminalState: settlement.state,
          terminalReason: settlement.reason,
          settlementDigest: settlement.settlementDigest,
          observationIds: settlement.observations.map((item) => item.id),
          durableRevision: 1,
        };
      },
      async markNeedsReconciliation(reservationId, reason) {
        effects.reconciliations += 1;
        return {
          kind: "durably_recorded",
          reservationId,
          terminalState: "needs_reconciliation",
          terminalReason: reason,
          settlementDigest: null,
          observationIds: [],
          durableRevision: 1,
        };
      },
      async listInvocationsNeedingRecovery() { return []; },
    };
    const reserved = await authority.reserveEnrichmentOperation(repository, {
      grantId: grant.id,
      principalSubject: persistedAuthority.principalSubject,
      operationKey: grant.tuple.operationKey,
      now: 1_100,
    });
    assert.equal(reserved.kind, "reserved");
    const port = portModule.bindContactProviderPort({
      providerId: grant.tuple.providerId,
      providerVersion: grant.tuple.providerVersion,
      catalogRef: grant.tuple.catalogRef,
    }, async (assignment) => {
      effects.providerCalls += 1;
      return {
        kind: "rejected",
        reservationId: assignment.reservationId,
        operationKey: assignment.operationKey,
        documentedUnits: 0,
        documentedCostMinor: 0,
        evidence: [],
      };
    });
    const valid = { reservationId: reserved.reservation.id, now: 1_101 };
    const variants = exactInputVariants(valid, "reservationId");
    for (const [name, input] of variants.cases) {
      assert.deepEqual(await operation.executeEnrichmentOperation(repository, port, input), { kind: "blocked" }, name);
      assert.deepEqual(
        effects,
        { claims: 0, providerCalls: 0, settlements: 0, reconciliations: 0 },
        name,
      );
    }
    assert.equal(variants.getterCalls(), 0, "execution input getter is never evaluated");

    const mutableInput = { ...valid };
    const pending = operation.executeEnrichmentOperation(repository, port, mutableInput);
    await Promise.resolve();
    mutableInput.reservationId = "reservation-mutated";
    mutableInput.now = 9_999;
    releaseClaim();
    assert.deepEqual(await pending, { kind: "settled", outcome: "rejected" });
    assert.deepEqual(
      effects,
      { claims: 1, providerCalls: 1, settlements: 1, reconciliations: 0 },
      "valid flow uses the pre-claim snapshot throughout",
    );
  } finally {
    await vite.close();
  }
});
