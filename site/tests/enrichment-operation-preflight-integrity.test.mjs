import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";

const WORKSPACE_ID = "workspace-operation-preflight";
const OWNER_SUBJECT = "owner-operation-preflight";
const CONFIGURATION_ID = "configuration-operation-preflight";
const CONFIGURATION_DIGEST = "a".repeat(64);
const PROVIDER_ID = "provider-operation-preflight";
const NOW = 1_100;

async function load(vite, name) {
  return vite.ssrLoadModule(new URL(`../domain/${name}.ts`, import.meta.url).pathname);
}

test("the complete provider evidence set is rejected before any verifier or settlement work", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const issuance = await load(vite, "enrichment-grant-issuance");
    const authority = await load(vite, "enrichment-authority");
    const operation = await load(vite, "enrichment-operation");
    const providerPort = await load(vite, "contact-provider-port");
    const evidence = await load(vite, "contact-evidence");

    const cases = [
      {
        name: "second envelope has the wrong assignment",
        reason: "invalid_evidence",
        documentedUnits: 2,
        envelopes: () => [
          contactEnvelope(),
          contactEnvelope({
            id: "observation-second",
            assignmentId: "assignment-unknown",
            contactId: "contact-second",
            value: "second@example.invalid",
          }),
        ],
      },
      {
        name: "second envelope duplicates the first assignment",
        reason: "invalid_evidence",
        documentedUnits: 2,
        envelopes: () => [
          contactEnvelope(),
          contactEnvelope({ id: "observation-duplicate", value: "duplicate@example.invalid" }),
        ],
      },
      {
        name: "one documented envelope is missing",
        reason: "invalid_provider_outcome",
        documentedUnits: 2,
        envelopes: () => [contactEnvelope()],
      },
      {
        name: "an undocumented envelope is extra",
        reason: "invalid_provider_outcome",
        documentedUnits: 1,
        envelopes: () => [
          contactEnvelope(),
          contactEnvelope({
            id: "observation-extra",
            assignmentId: "assignment-second",
            contactId: "contact-second",
            value: "extra@example.invalid",
          }),
        ],
      },
      {
        name: "second envelope has a forbidden role claim",
        reason: "invalid_evidence",
        documentedUnits: 2,
        envelopes: () => [
          contactEnvelope(),
          contactEnvelope({
            id: "observation-second",
            assignmentId: "assignment-second",
            contactId: "contact-second",
            value: "second@example.invalid",
            role: "champion",
          }),
        ],
      },
      {
        name: "second envelope has the wrong workspace scope",
        reason: "invalid_evidence",
        documentedUnits: 2,
        envelopes: () => [
          contactEnvelope(),
          contactEnvelope({
            id: "observation-second",
            assignmentId: "assignment-second",
            workspaceId: "workspace-wrong",
            contactId: "contact-second",
            value: "second@example.invalid",
          }),
        ],
      },
    ];

    for (const scenario of cases) {
      const harness = await admittedHarness({ issuance, authority, maxUnits: 2 });
      let verifierCalls = 0;
      let providerCalls = 0;
      const verifier = evidence.bindContactEvidenceVerifier(
        { verifierId: "server-verifier", verifierVersion: "v1" },
        async ({ envelope }) => {
          verifierCalls += 1;
          return trustedVerdict(envelope);
        },
      );
      const port = providerPort.bindContactProviderPort(
        {
          providerId: PROVIDER_ID,
          providerVersion: "v1",
          catalogRef: "catalog-operation-preflight",
        },
        async (assignment) => {
          providerCalls += 1;
          return {
            kind: "completed",
            reservationId: assignment.reservationId,
            operationKey: assignment.operationKey,
            documentedUnits: scenario.documentedUnits,
            documentedCostMinor: scenario.documentedUnits,
            evidence: scenario.envelopes(),
          };
        },
      );

      const result = await operation.executeEnrichmentOperation(
        harness.repository,
        port,
        { reservationId: harness.reservation.id, now: NOW },
        verifier,
      );

      assert.equal(result.kind, "needs_reconciliation", scenario.name);
      assert.equal(providerCalls, 1, `${scenario.name}: the already-authorized provider call completes once`);
      assert.equal(verifierCalls, 0, `${scenario.name}: no verifier sees a partial evidence set`);
      assert.equal(harness.state.settlements, 0, `${scenario.name}: no observation can be settled`);
      assert.equal(harness.state.reconciliations, 1, `${scenario.name}: uncertainty is durably contained`);
      assert.equal(harness.state.reconciliationReason, scenario.reason, scenario.name);
    }
  } finally {
    await vite.close();
  }
});

test("an exact preflighted evidence set still settles through the public operation seam", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const issuance = await load(vite, "enrichment-grant-issuance");
    const authority = await load(vite, "enrichment-authority");
    const operation = await load(vite, "enrichment-operation");
    const providerPort = await load(vite, "contact-provider-port");
    const evidence = await load(vite, "contact-evidence");
    const harness = await admittedHarness({ issuance, authority, maxUnits: 1 });
    const raw = contactEnvelope();
    const direct = evidence.ingestContactEvidence({
      ...evidenceAssignment(),
      quoteRevision: 2,
      providerAuthority: {
        providerId: PROVIDER_ID,
        providerVersion: "v1",
        catalogRef: "catalog-operation-preflight",
      },
    }, raw);
    assert.equal(direct.accepted, true, direct.reason);
    const port = providerPort.bindContactProviderPort(
      {
        providerId: PROVIDER_ID,
        providerVersion: "v1",
        catalogRef: "catalog-operation-preflight",
      },
      async (assignment) => ({
        kind: "completed",
        reservationId: assignment.reservationId,
        operationKey: assignment.operationKey,
        documentedUnits: 1,
        documentedCostMinor: 1,
        evidence: [raw],
      }),
    );
    const result = await operation.executeEnrichmentOperation(
      harness.repository,
      port,
      { reservationId: harness.reservation.id, now: NOW },
    );
    assert.equal(
      result.kind,
      "settled",
      `valid evidence must not reconcile as ${harness.state.reconciliationReason}`,
    );
    assert.equal(harness.state.settlements, 1);
    assert.equal(harness.state.reconciliations, 0);
  } finally {
    await vite.close();
  }
});

test("a Proxy-backed reservation acknowledgement cannot create invocation authority", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const issuance = await load(vite, "enrichment-grant-issuance");
    const authority = await load(vite, "enrichment-authority");
    const operation = await load(vite, "enrichment-operation");
    const providerPort = await load(vite, "contact-provider-port");
    const seed = await issuedSeed(issuance, 1);
    const state = { claimCalls: 0, providerCalls: 0, reconciliations: 0 };
    const repository = {
      async loadReservationAuthority() {
        return reservationAuthority(seed, 1);
      },
      async commitReservation(record) {
        const statefulRecord = new Proxy(record, {
          get(target, key, receiver) {
            return Reflect.get(target, key, receiver);
          },
        });
        return { kind: "created", record: statefulRecord };
      },
      async claimCommittedInvocation() {
        state.claimCalls += 1;
        throw new Error("proxy acknowledgement must not reach claim");
      },
      async settleReservation() {
        throw new Error("proxy acknowledgement must not settle");
      },
      async markNeedsReconciliation(reservationId, reason) {
        state.reconciliations += 1;
        return durableReconciliationAck(reservationId, reason);
      },
      async listInvocationsNeedingRecovery() {
        return [];
      },
    };

    const reserved = await authority.reserveEnrichmentOperation(repository, {
      grantId: seed.grant.id,
      principalSubject: OWNER_SUBJECT,
      operationKey: seed.grant.tuple.operationKey,
      now: NOW,
    });
    assert.equal(reserved.kind, "blocked");

    const port = providerPort.bindContactProviderPort(
      {
        providerId: PROVIDER_ID,
        providerVersion: "v1",
        catalogRef: "catalog-operation-preflight",
      },
      async () => {
        state.providerCalls += 1;
        throw new Error("proxy acknowledgement must not reach provider");
      },
    );
    const execution = await operation.executeEnrichmentOperation(
      repository,
      port,
      { reservationId: `er_${seed.grant.tuple.digest.slice(0, 24)}`, now: NOW },
    );
    assert.equal(execution.kind, "blocked");
    assert.deepEqual(state, { claimCalls: 0, providerCalls: 0, reconciliations: 0 });
  } finally {
    await vite.close();
  }
});

async function admittedHarness({ issuance, authority, maxUnits }) {
  const seed = await issuedSeed(issuance, maxUnits);
  const state = {
    record: null,
    status: "unreserved",
    settlements: 0,
    reconciliations: 0,
    reconciliationReason: null,
    durableRevision: 0,
  };
  const repository = {
    async loadReservationAuthority() {
      return reservationAuthority(seed, maxUnits);
    },
    async commitReservation(record) {
      state.record = record;
      state.status = "reserved";
      return { kind: "created", record };
    },
    async claimCommittedInvocation(reservationId, now) {
      if (!state.record || state.record.id !== reservationId || state.status !== "reserved") {
        return { kind: "blocked", reason: "unavailable" };
      }
      state.status = "invoking";
      return { kind: "claimed", assignment: state.record.assignment, claimedAt: now };
    },
    async settleReservation(reservationId, settlement) {
      state.settlements += 1;
      state.status = settlement.state;
      state.durableRevision += 1;
      return {
        kind: "durably_recorded",
        reservationId,
        terminalState: settlement.state,
        terminalReason: settlement.reason,
        settlementDigest: settlement.settlementDigest,
        observationIds: settlement.observations.map((item) => item.id),
        durableRevision: state.durableRevision,
      };
    },
    async markNeedsReconciliation(reservationId, reason) {
      state.reconciliations += 1;
      state.reconciliationReason = reason;
      state.status = "needs_reconciliation";
      state.durableRevision += 1;
      return durableReconciliationAck(reservationId, reason, state.durableRevision);
    },
    async listInvocationsNeedingRecovery() {
      return [];
    },
  };
  const reserved = await authority.reserveEnrichmentOperation(repository, {
    grantId: seed.grant.id,
    principalSubject: OWNER_SUBJECT,
    operationKey: seed.grant.tuple.operationKey,
    now: NOW,
  });
  assert.equal(reserved.kind, "reserved");
  return { repository, state, reservation: reserved.reservation };
}

async function issuedSeed(issuance, maxUnits) {
  const snapshot = issuanceSnapshot();
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
      return `server-operation-preflight-nonce-${maxUnits}`;
    },
  }, {
    principalSubject: OWNER_SUBJECT,
    prospectIds: ["prospect-operation-preflight"],
    operation: "business_contact_lookup/v1",
    maxUnits,
    maxCostMinor: maxUnits,
    currency: "USD",
    expiresAt: 1_500,
    expectedRevision: snapshot.revision,
    idempotencyKey: `operation-preflight-grant-${maxUnits}`,
    now: 1_000,
  });
  assert.equal(result.kind, "issued");
  return { grant: result.grant, snapshot };
}

function issuanceSnapshot() {
  return {
    admitted: true,
    workspaceId: WORKSPACE_ID,
    ownerSubject: OWNER_SUBJECT,
    revision: 7,
    configuration: {
      id: CONFIGURATION_ID,
      digest: CONFIGURATION_DIGEST,
      revision: 3,
      current: true,
    },
    prospects: [{
      id: "prospect-operation-preflight",
      state: "approved",
      configurationId: CONFIGURATION_ID,
      configurationDigest: CONFIGURATION_DIGEST,
      revision: 4,
    }],
    quote: {
      providerId: PROVIDER_ID,
      providerVersion: "v1",
      catalogRef: "catalog-operation-preflight",
      revision: 2,
      currency: "USD",
      unitCostMinor: 1,
      expiresAt: 2_000,
    },
  };
}

function reservationAuthority(seed, maxUnits) {
  return {
    admitted: true,
    principalSubject: OWNER_SUBJECT,
    workspaceId: WORKSPACE_ID,
    sourceRevision: seed.snapshot.revision,
    grant: seed.grant,
    configuration: seed.snapshot.configuration,
    prospects: seed.snapshot.prospects,
    quote: seed.snapshot.quote,
    accounts: [
      budget("grant", seed.grant.id, maxUnits),
      budget("profile", CONFIGURATION_ID, maxUnits),
      budget("workspace", WORKSPACE_ID, maxUnits),
      budget("provider", PROVIDER_ID, maxUnits),
    ],
    evidenceAssignments: [
      evidenceAssignment(),
      ...(maxUnits > 1 ? [evidenceAssignment({
        assignmentId: "assignment-second",
        role: "economic_buyer",
        contactId: "contact-second",
      })] : []),
    ],
  };
}

function budget(scope, entityId, maxUnits) {
  return {
    authorityType: "enrichment",
    accountId: `enrichment:${WORKSPACE_ID.length}:${WORKSPACE_ID}:${scope}:${entityId.length}:${entityId}`,
    scope,
    workspaceId: WORKSPACE_ID,
    entityId,
    currency: "USD",
    actualUnits: 0,
    reservedUnits: 0,
    maxUnits,
    actualCostMinor: 0,
    reservedCostMinor: 0,
    maxCostMinor: maxUnits,
  };
}

function evidenceAssignment(patch = {}) {
  return {
    assignmentId: "assignment-first",
    prospectId: "prospect-operation-preflight",
    role: "champion",
    workspaceId: WORKSPACE_ID,
    contactId: "contact-first",
    profileConfigurationId: CONFIGURATION_ID,
    profileConfigurationDigest: CONFIGURATION_DIGEST,
    ...patch,
  };
}

function contactEnvelope(patch = {}) {
  return {
    id: "observation-first",
    assignmentId: "assignment-first",
    prospectId: "prospect-operation-preflight",
    workspaceId: WORKSPACE_ID,
    contactId: "contact-first",
    profileConfigurationId: CONFIGURATION_ID,
    profileConfigurationDigest: CONFIGURATION_DIGEST,
    kind: "email",
    value: "first@example.invalid",
    confidence: 1,
    provenance: {
      sourceReference: "source-operation-preflight",
      excerpt: "synthetic excerpt",
      objectReference: "object-operation-preflight",
      contentHash: "b".repeat(64),
      retrievedAt: 1_090,
    },
    observedAt: NOW,
    ...patch,
  };
}

function trustedVerdict(envelope) {
  return {
    observationId: envelope.id,
    workspaceId: envelope.workspaceId,
    contactId: envelope.contactId,
    profileConfigurationId: envelope.profileConfigurationId,
    profileConfigurationDigest: envelope.profileConfigurationDigest,
    kind: envelope.kind,
    normalizedValue: String(envelope.value).trim().toLowerCase(),
    contentHash: envelope.provenance.contentHash,
    verificationClass: "mailbox_verified",
    method: "mailbox_verification",
    verifiedAt: 1_095,
    providerId: PROVIDER_ID,
    providerVersion: "v1",
    catalogRef: "catalog-operation-preflight",
    verdictReference: `verdict-${envelope.id}`,
    verdictDigest: "d".repeat(64),
  };
}

function durableReconciliationAck(reservationId, reason, durableRevision = 1) {
  return {
    kind: "durably_recorded",
    reservationId,
    terminalState: "needs_reconciliation",
    terminalReason: reason,
    settlementDigest: null,
    observationIds: [],
    durableRevision,
  };
}
