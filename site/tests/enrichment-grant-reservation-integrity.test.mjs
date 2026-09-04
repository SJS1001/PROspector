import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";

async function load(vite, name) {
  return vite.ssrLoadModule(new URL(`../domain/${name}.ts`, import.meta.url).pathname);
}

function issuanceSnapshot() {
  return {
    admitted: true,
    workspaceId: "workspace-synthetic",
    ownerSubject: "owner-synthetic",
    revision: 7,
    configuration: {
      id: "config-synthetic",
      digest: "a".repeat(64),
      revision: 3,
      current: true,
    },
    prospects: [{
      id: "prospect-synthetic",
      state: "approved",
      configurationId: "config-synthetic",
      configurationDigest: "a".repeat(64),
      revision: 4,
    }],
    quote: {
      providerId: "synthetic-provider",
      providerVersion: "v1",
      catalogRef: "catalog-synthetic",
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
    nextNonce: () => "server-nonce-synthetic",
  }, {
    principalSubject: snapshot.ownerSubject,
    prospectIds: ["prospect-synthetic"],
    operation: "business_contact_lookup/v1",
    maxUnits: 1,
    maxCostMinor: 5,
    currency: "USD",
    expiresAt: 1_500,
    expectedRevision: snapshot.revision,
    idempotencyKey: "grant-integrity-synthetic",
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

function authorityFor(grant) {
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
      assignmentId: "assignment-synthetic",
      prospectId: "prospect-synthetic",
      role: "champion",
      workspaceId: snapshot.workspaceId,
      contactId: "contact-synthetic",
      profileConfigurationId: snapshot.configuration.id,
      profileConfigurationDigest: snapshot.configuration.digest,
    }],
  };
}

function reservationRepository(authority, claimFactory) {
  const state = { writes: 0, claimCalls: 0, committed: null };
  const repository = {
    async loadReservationAuthority() { return authority; },
    async commitReservation(record) {
      state.writes += 1;
      state.committed = record;
      return { kind: "created", record };
    },
    async claimCommittedInvocation(reservationId, now) {
      state.claimCalls += 1;
      return claimFactory
        ? claimFactory(state.committed, reservationId, now)
        : { kind: "blocked", reason: "unavailable" };
    },
    async settleReservation() { throw new Error("settlement unreachable"); },
    async markNeedsReconciliation() { throw new Error("reconciliation unreachable"); },
    async listInvocationsNeedingRecovery() { return []; },
  };
  return { repository, state };
}

test("issued-grant integrity parser binds the complete immutable grant before reservation", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const [issuance, authority] = await Promise.all([
      load(vite, "enrichment-grant-issuance"),
      load(vite, "enrichment-authority"),
    ]);
    const grant = await issueGrant(issuance);
    const parsed = await issuance.parseIssuedEnrichmentGrant(grant);
    assert.equal(parsed?.id, grant.id);
    assert.equal(Object.isFrozen(parsed), true);
    assert.equal(Object.isFrozen(parsed.tuple), true);
    assert.equal(Object.isFrozen(parsed.tuple.prospectIds), true);
    assert.equal(Object.isFrozen(parsed.tuple.prospectRevisions), true);

    const cases = [
      ["request digest", (value) => { value.requestDigest = "b".repeat(64); }],
      ["grant id", (value) => { value.id = `eg_${"b".repeat(24)}`; }],
      ["idempotency key", (value) => { value.idempotencyKey = "mutated-idempotency"; }],
      ["nonce", (value) => { value.tuple.nonce = "mutated-nonce"; }],
      ["unit bound", (value) => { value.tuple.maxUnits = 2; }],
      ["cost bound", (value) => { value.tuple.maxCostMinor = 6; }],
    ];
    for (const [name, mutate] of cases) {
      const candidate = structuredClone(grant);
      mutate(candidate);
      assert.equal(await issuance.parseIssuedEnrichmentGrant(candidate), null, name);
      const harness = reservationRepository(authorityFor(candidate));
      const result = await authority.reserveEnrichmentOperation(harness.repository, {
        grantId: candidate.id,
        principalSubject: candidate.tuple.ownerSubject,
        operationKey: candidate.tuple.operationKey,
        now: 1_100,
      });
      assert.equal(result.kind, "blocked", name);
      assert.equal(harness.state.writes, 0, `${name}: reservation must not commit`);
    }

    let getterCalls = 0;
    const accessorGrant = structuredClone(grant);
    Object.defineProperty(accessorGrant.tuple, "nonce", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return grant.tuple.nonce;
      },
    });
    assert.equal(await issuance.parseIssuedEnrichmentGrant(accessorGrant), null);
    assert.equal(getterCalls, 0, "accessor-backed grant fields are rejected without invocation");
  } finally {
    await vite.close();
  }
});

test("invocation claim rejects malformed clocks and claim times without releasing call authority", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const [issuance, authority] = await Promise.all([
      load(vite, "enrichment-grant-issuance"),
      load(vite, "enrichment-authority"),
    ]);
    const grant = await issueGrant(issuance);

    for (const [name, now] of [
      ["zero", 0],
      ["fraction", 1_100.5],
      ["string", "1100"],
      ["unsafe", Number.MAX_SAFE_INTEGER + 1],
    ]) {
      const harness = reservationRepository(authorityFor(grant));
      const reserved = await authority.reserveEnrichmentOperation(harness.repository, {
        grantId: grant.id,
        principalSubject: grant.tuple.ownerSubject,
        operationKey: grant.tuple.operationKey,
        now: 1_100,
      });
      assert.equal(reserved.kind, "reserved", name);
      const result = await authority.claimAdmittedCommittedInvocation(
        harness.repository,
        reserved.reservation.id,
        now,
      );
      assert.deepEqual(result, { kind: "blocked", reason: "unavailable" }, name);
      assert.equal(harness.state.claimCalls, 0, `${name}: invalid clock must not reach repository claim`);
    }

    for (const [name, claimedAt] of [
      ["string claimedAt", "1100"],
      ["fraction claimedAt", 1_100.5],
      ["future claimedAt", 1_101],
      ["unsafe claimedAt", Number.MAX_SAFE_INTEGER + 1],
    ]) {
      const harness = reservationRepository(
        authorityFor(grant),
        (record) => ({ kind: "claimed", assignment: record.assignment, claimedAt }),
      );
      const reserved = await authority.reserveEnrichmentOperation(harness.repository, {
        grantId: grant.id,
        principalSubject: grant.tuple.ownerSubject,
        operationKey: grant.tuple.operationKey,
        now: 1_100,
      });
      assert.equal(reserved.kind, "reserved", name);
      const result = await authority.claimAdmittedCommittedInvocation(
        harness.repository,
        reserved.reservation.id,
        1_100,
      );
      assert.deepEqual(result, { kind: "invalid" }, name);
      assert.equal(harness.state.claimCalls, 1, name);
    }

    const expired = reservationRepository(
      authorityFor(grant),
      (record, _reservationId, now) => ({ kind: "claimed", assignment: record.assignment, claimedAt: now }),
    );
    const reserved = await authority.reserveEnrichmentOperation(expired.repository, {
      grantId: grant.id,
      principalSubject: grant.tuple.ownerSubject,
      operationKey: grant.tuple.operationKey,
      now: 1_100,
    });
    assert.equal(reserved.kind, "reserved");
    assert.deepEqual(
      await authority.claimAdmittedCommittedInvocation(expired.repository, reserved.reservation.id, 1_500),
      { kind: "invalid" },
      "an expired admitted assignment never yields provider-call authority",
    );
  } finally {
    await vite.close();
  }
});
