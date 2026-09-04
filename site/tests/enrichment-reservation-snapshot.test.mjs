import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";

async function load(vite, name) {
  return vite.ssrLoadModule(new URL(`../domain/${name}.ts`, import.meta.url).pathname);
}

test("reservation authority snapshots reject an actualUnits getter/mutation and truthy booleans with zero writes", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const issuance = await load(vite, "enrichment-grant-issuance");
    const reservation = await load(vite, "enrichment-authority");
    const seed = await reservationSeed(issuance);

    const getterCalls = { count: 0 };
    const getterAuthority = reservationAuthority(seed);
    const hostileAccount = { ...getterAuthority.accounts[0] };
    const originalActualUnits = hostileAccount.actualUnits;
    Object.defineProperty(hostileAccount, "actualUnits", {
      enumerable: true,
      get() {
        getterCalls.count += 1;
        queueMicrotask(() => {
          Object.defineProperty(hostileAccount, "actualUnits", {
            configurable: true,
            enumerable: true,
            value: hostileAccount.maxUnits,
            writable: true,
          });
        });
        return originalActualUnits;
      },
    });
    getterAuthority.accounts[0] = hostileAccount;

    for (const [name, authority] of [
      ["actualUnits getter", getterAuthority],
      ["truthy admitted string", { ...reservationAuthority(seed), admitted: "true" }],
      [
        "truthy configuration current string",
        {
          ...reservationAuthority(seed),
          configuration: { ...reservationAuthority(seed).configuration, current: "true" },
        },
      ],
    ]) {
      const writes = [];
      const result = await reservation.reserveEnrichmentOperation(
        repositoryFor(authority, writes),
        reservationInput(seed),
      );
      await Promise.resolve();
      assert.equal(result.kind, "blocked", name);
      assert.equal(writes.length, 0, `${name}: invalid authority must not commit`);
    }
    assert.equal(getterCalls.count, 0, "authority accessors are rejected without executing");
  } finally {
    await vite.close();
  }
});

test("reservation authority rejects proxies, custom prototypes, extras, and commits only frozen canonical accounts", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const issuance = await load(vite, "enrichment-grant-issuance");
    const reservation = await load(vite, "enrichment-authority");
    const seed = await reservationSeed(issuance);
    const base = reservationAuthority(seed);
    const proxiedAccount = new Proxy({ ...base.accounts[0] }, {});

    for (const [name, authority] of [
      ["proxy", { ...base, accounts: [proxiedAccount, ...base.accounts.slice(1)] }],
      [
        "custom prototype",
        {
          ...base,
          quote: Object.assign(Object.create({ inherited: true }), base.quote),
        },
      ],
      [
        "nested extra",
        {
          ...base,
          evidenceAssignments: [{ ...base.evidenceAssignments[0], unauthorized: true }],
        },
      ],
    ]) {
      const writes = [];
      const result = await reservation.reserveEnrichmentOperation(
        repositoryFor(authority, writes),
        reservationInput(seed),
      );
      assert.equal(result.kind, "blocked", name);
      assert.equal(writes.length, 0, `${name}: malformed authority must not commit`);
    }

    const writes = [];
    const mutableAuthority = reservationAuthority(seed);
    let mutationRan = false;
    const acceptedPromise = reservation.reserveEnrichmentOperation({
      async loadReservationAuthority() {
        return mutableAuthority;
      },
      async commitReservation(record, accounts) {
        writes.push({ record, accounts });
        assert.equal(mutationRan, true, "the source mutated across the digest await");
        assert.equal(Object.isFrozen(accounts), true);
        assert.equal(accounts.every(Object.isFrozen), true);
        assert.equal(accounts[0].actualUnits, 0);
        assert.throws(() => {
          accounts[0].actualUnits = accounts[0].maxUnits;
        }, TypeError);
        return { kind: "created", record };
      },
      async claimCommittedInvocation() {
        return { kind: "blocked", reason: "unavailable" };
      },
      async settleReservation() {
        throw new Error("not used");
      },
      async markNeedsReconciliation() {
        throw new Error("not used");
      },
      async listInvocationsNeedingRecovery() {
        return [];
      },
    }, reservationInput(seed));
    queueMicrotask(() => {
      mutableAuthority.accounts[0].actualUnits = mutableAuthority.accounts[0].maxUnits;
      mutableAuthority.configuration.current = false;
      mutationRan = true;
    });
    const accepted = await acceptedPromise;
    assert.equal(accepted.kind, "reserved");
    assert.equal(writes.length, 1);
  } finally {
    await vite.close();
  }
});

async function reservationSeed(issuance) {
  const snapshot = {
    admitted: true,
    workspaceId: "workspace-reservation-snapshot",
    ownerSubject: "owner-reservation-snapshot",
    revision: 7,
    configuration: {
      id: "configuration-reservation-snapshot",
      digest: "a".repeat(64),
      revision: 3,
      current: true,
    },
    prospects: [{
      id: "prospect-reservation-snapshot",
      state: "approved",
      configurationId: "configuration-reservation-snapshot",
      configurationDigest: "a".repeat(64),
      revision: 4,
    }],
    quote: {
      providerId: "provider-reservation-snapshot",
      providerVersion: "v1",
      catalogRef: "catalog-reservation-snapshot",
      revision: 2,
      currency: "USD",
      unitCostMinor: 10,
      expiresAt: 2_000,
    },
  };
  const input = {
    principalSubject: snapshot.ownerSubject,
    prospectIds: [snapshot.prospects[0].id],
    operation: "business_contact_lookup/v1",
    maxUnits: 1,
    maxCostMinor: 10,
    currency: "USD",
    expiresAt: 1_500,
    expectedRevision: snapshot.revision,
    idempotencyKey: "reservation-snapshot-grant",
    now: 1_000,
  };
  const result = await issuance.issueEnrichmentGrant({
    async loadIssuanceSnapshot() {
      return snapshot;
    },
    async findGrantByIdempotency() {
      return null;
    },
    async commitGrant(record) {
      return { kind: "created", record };
    },
    nextNonce() {
      return "reservation-snapshot-nonce";
    },
  }, input);
  assert.equal(result.kind, "issued");
  return { snapshot, grant: result.grant, input };
}

function reservationAuthority(seed) {
  const { snapshot, grant } = seed;
  const entities = {
    grant: grant.id,
    profile: snapshot.configuration.id,
    workspace: snapshot.workspaceId,
    provider: snapshot.quote.providerId,
  };
  return {
    admitted: true,
    principalSubject: snapshot.ownerSubject,
    workspaceId: snapshot.workspaceId,
    sourceRevision: snapshot.revision,
    grant,
    configuration: { ...snapshot.configuration },
    prospects: snapshot.prospects.map((prospect) => ({ ...prospect })),
    quote: { ...snapshot.quote },
    accounts: Object.entries(entities).map(([scope, entityId]) => ({
      authorityType: "enrichment",
      accountId: accountId(snapshot.workspaceId, scope, entityId),
      scope,
      workspaceId: snapshot.workspaceId,
      entityId,
      currency: "USD",
      actualUnits: 0,
      reservedUnits: 0,
      maxUnits: 1,
      actualCostMinor: 0,
      reservedCostMinor: 0,
      maxCostMinor: 10,
    })),
    evidenceAssignments: [{
      assignmentId: "assignment-reservation-snapshot",
      prospectId: snapshot.prospects[0].id,
      role: "champion",
      workspaceId: snapshot.workspaceId,
      contactId: "contact-reservation-snapshot",
      profileConfigurationId: snapshot.configuration.id,
      profileConfigurationDigest: snapshot.configuration.digest,
    }],
  };
}

function repositoryFor(authority, writes) {
  return {
    async loadReservationAuthority() {
      return authority;
    },
    async commitReservation(record, accounts) {
      writes.push({ record, accounts });
      return { kind: "created", record };
    },
    async claimCommittedInvocation() {
      return { kind: "blocked", reason: "unavailable" };
    },
    async settleReservation() {
      throw new Error("not used");
    },
    async markNeedsReconciliation() {
      throw new Error("not used");
    },
    async listInvocationsNeedingRecovery() {
      return [];
    },
  };
}

function reservationInput(seed) {
  return {
    grantId: seed.grant.id,
    principalSubject: seed.snapshot.ownerSubject,
    operationKey: seed.grant.tuple.operationKey,
    now: 1_100,
  };
}

function accountId(workspaceId, scope, entityId) {
  return `enrichment:${component(workspaceId)}:${scope}:${component(entityId)}`;
}

function component(value) {
  return `${value.length}:${value}`;
}
