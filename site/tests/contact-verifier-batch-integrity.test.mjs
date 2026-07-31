import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";

const WORKSPACE_ID = "workspace-batch-verifier";
const OWNER_SUBJECT = "owner-batch-verifier";
const CONFIGURATION_ID = "configuration-batch-verifier";
const CONFIGURATION_DIGEST = "a".repeat(64);
const PROVIDER_ID = "provider-batch-verifier";
const NOW = 1_100;

test("multi-contact verification uses one branded batch call and admits only a complete ordered verdict set", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const [issuance, authority, operation, providerPort, evidence] = await Promise.all([
      load(vite, "enrichment-grant-issuance"),
      load(vite, "enrichment-authority"),
      load(vite, "enrichment-operation"),
      load(vite, "contact-provider-port"),
      load(vite, "contact-evidence"),
    ]);
    const envelopes = [
      contactEnvelope(),
      contactEnvelope({
        id: "observation-batch-second",
        assignmentId: "assignment-batch-second",
        contactId: "contact-batch-second",
        value: "second@example.invalid",
      }),
    ];
    const scenarios = [
      {
        name: "partial",
        verdicts: () => [trustedVerdict(envelopes[0])],
      },
      {
        name: "duplicate",
        verdicts: () => [trustedVerdict(envelopes[0]), trustedVerdict(envelopes[0])],
      },
      {
        name: "reordered",
        verdicts: () => [trustedVerdict(envelopes[1]), trustedVerdict(envelopes[0])],
      },
      {
        name: "extra",
        verdicts: () => [
          trustedVerdict(envelopes[0]),
          trustedVerdict(envelopes[1]),
          trustedVerdict(envelopes[1]),
        ],
      },
      {
        name: "sparse",
        verdicts: () => {
          const verdicts = new Array(2);
          verdicts[0] = trustedVerdict(envelopes[0]);
          return verdicts;
        },
      },
    ];

    for (const scenario of scenarios) {
      const harness = await admittedHarness({ issuance, authority });
      let batchCalls = 0;
      const verifier = evidence.bindContactEvidenceBatchVerifier(
        { verifierId: "server-batch-verifier", verifierVersion: "v1" },
        async (requests) => {
          batchCalls += 1;
          assert.equal(requests.length, 2);
          assert.ok(Object.isFrozen(requests));
          assert.ok(requests.every((request) =>
            Object.isFrozen(request)
            && Object.isFrozen(request.assignment)
            && Object.isFrozen(request.envelope)
          ));
          return scenario.verdicts();
        },
      );
      const result = await operation.executeEnrichmentOperation(
        harness.repository,
        contactPort(providerPort, envelopes),
        { reservationId: harness.reservation.id, now: NOW },
        verifier,
      );
      assert.equal(result.kind, "needs_reconciliation", scenario.name);
      assert.equal(batchCalls, 1, `${scenario.name}: exactly one batch boundary call`);
      assert.equal(harness.state.settlements, 0, `${scenario.name}: no evidence settles`);
      assert.equal(harness.state.reconciliations, 1, `${scenario.name}: uncertainty is contained`);
      assert.equal(harness.state.reconciliationReason, "invalid_evidence", scenario.name);
    }

    const throwing = await admittedHarness({ issuance, authority });
    let throwingBatchCalls = 0;
    const throwingVerifier = evidence.bindContactEvidenceBatchVerifier(
      { verifierId: "server-batch-verifier", verifierVersion: "v1" },
      async () => {
        throwingBatchCalls += 1;
        throw new Error("synthetic_batch_failure");
      },
    );
    assert.deepEqual(
      await operation.executeEnrichmentOperation(
        throwing.repository,
        contactPort(providerPort, envelopes),
        { reservationId: throwing.reservation.id, now: NOW },
        throwingVerifier,
      ),
      { kind: "needs_reconciliation" },
    );
    assert.equal(throwingBatchCalls, 1);
    assert.equal(throwing.state.settlements, 0);
    assert.equal(throwing.state.reconciliations, 1);

    const accepted = await admittedHarness({ issuance, authority });
    let acceptedBatchCalls = 0;
    const acceptedVerifier = evidence.bindContactEvidenceBatchVerifier(
      { verifierId: "server-batch-verifier", verifierVersion: "v1" },
      async (requests) => {
        acceptedBatchCalls += 1;
        return requests.map(({ envelope }) => trustedVerdict(envelope));
      },
    );
    assert.deepEqual(
      await operation.executeEnrichmentOperation(
        accepted.repository,
        contactPort(providerPort, envelopes),
        { reservationId: accepted.reservation.id, now: NOW },
        acceptedVerifier,
      ),
      { kind: "settled", outcome: "completed" },
    );
    assert.equal(acceptedBatchCalls, 1);
    assert.equal(accepted.state.settlements, 1);
    assert.equal(accepted.state.reconciliations, 0);
    assert.deepEqual(accepted.state.observationIds, [
      "observation-batch-first",
      "observation-batch-second",
    ]);
  } finally {
    await vite.close();
  }
});

test("multi-contact verification never falls back to per-item or externally forged verifier callbacks", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const [issuance, authority, operation, providerPort, evidence] = await Promise.all([
      load(vite, "enrichment-grant-issuance"),
      load(vite, "enrichment-authority"),
      load(vite, "enrichment-operation"),
      load(vite, "contact-provider-port"),
      load(vite, "contact-evidence"),
    ]);
    const envelopes = [
      contactEnvelope(),
      contactEnvelope({
        id: "observation-batch-second",
        assignmentId: "assignment-batch-second",
        contactId: "contact-batch-second",
        value: "second@example.invalid",
      }),
    ];
    const legacy = await admittedHarness({ issuance, authority });
    let individualCalls = 0;
    const individualVerifier = evidence.bindContactEvidenceVerifier(
      { verifierId: "server-single-verifier", verifierVersion: "v1" },
      async ({ envelope }) => {
        individualCalls += 1;
        return trustedVerdict(envelope);
      },
    );
    assert.deepEqual(
      await operation.executeEnrichmentOperation(
        legacy.repository,
        contactPort(providerPort, envelopes),
        { reservationId: legacy.reservation.id, now: NOW },
        individualVerifier,
      ),
      { kind: "needs_reconciliation" },
    );
    assert.equal(individualCalls, 0, "a legacy verifier is never called for a multi-contact set");
    assert.equal(legacy.state.settlements, 0);
    assert.equal(legacy.state.reconciliations, 1);

    const forged = await admittedHarness({ issuance, authority });
    let forgedCalls = 0;
    const forgedVerifier = Object.freeze({
      kind: "batch_bound",
      descriptor: Object.freeze({ verifierId: "forged", verifierVersion: "v1" }),
      async verifyBatch() {
        forgedCalls += 1;
        return envelopes.map(trustedVerdict);
      },
    });
    assert.deepEqual(
      await operation.executeEnrichmentOperation(
        forged.repository,
        contactPort(providerPort, envelopes),
        { reservationId: forged.reservation.id, now: NOW },
        forgedVerifier,
      ),
      { kind: "needs_reconciliation" },
    );
    assert.equal(forgedCalls, 0, "structural lookalikes cannot acquire verifier authority");
    assert.equal(forged.state.settlements, 0);
    assert.equal(forged.state.reconciliations, 1);
  } finally {
    await vite.close();
  }
});

async function load(vite, name) {
  return vite.ssrLoadModule(new URL(`../domain/${name}.ts`, import.meta.url).pathname);
}

async function admittedHarness({ issuance, authority }) {
  const seed = await issuedSeed(issuance);
  const state = {
    record: null,
    status: "unreserved",
    settlements: 0,
    reconciliations: 0,
    reconciliationReason: null,
    observationIds: [],
    durableRevision: 0,
  };
  const repository = {
    async loadReservationAuthority() {
      return reservationAuthority(seed);
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
      state.observationIds = settlement.observations.map((item) => item.id);
      state.durableRevision += 1;
      return {
        kind: "durably_recorded",
        reservationId,
        terminalState: settlement.state,
        terminalReason: settlement.reason,
        settlementDigest: settlement.settlementDigest,
        observationIds: state.observationIds,
        durableRevision: state.durableRevision,
      };
    },
    async markNeedsReconciliation(reservationId, reason) {
      state.reconciliations += 1;
      state.reconciliationReason = reason;
      state.status = "needs_reconciliation";
      state.durableRevision += 1;
      return {
        kind: "durably_recorded",
        reservationId,
        terminalState: "needs_reconciliation",
        terminalReason: reason,
        settlementDigest: null,
        observationIds: [],
        durableRevision: state.durableRevision,
      };
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

async function issuedSeed(issuance) {
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
      return "server-batch-verifier-nonce";
    },
  }, {
    principalSubject: OWNER_SUBJECT,
    prospectIds: ["prospect-batch-verifier"],
    operation: "business_contact_lookup/v1",
    maxUnits: 2,
    maxCostMinor: 2,
    currency: "USD",
    expiresAt: 1_500,
    expectedRevision: snapshot.revision,
    idempotencyKey: "batch-verifier-grant",
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
      id: "prospect-batch-verifier",
      state: "approved",
      configurationId: CONFIGURATION_ID,
      configurationDigest: CONFIGURATION_DIGEST,
      revision: 4,
    }],
    quote: {
      providerId: PROVIDER_ID,
      providerVersion: "v1",
      catalogRef: "catalog-batch-verifier",
      revision: 2,
      currency: "USD",
      unitCostMinor: 1,
      expiresAt: 2_000,
    },
  };
}

function reservationAuthority(seed) {
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
      budget("grant", seed.grant.id),
      budget("profile", CONFIGURATION_ID),
      budget("workspace", WORKSPACE_ID),
      budget("provider", PROVIDER_ID),
    ],
    evidenceAssignments: [
      evidenceAssignment(),
      evidenceAssignment({
        assignmentId: "assignment-batch-second",
        role: "economic_buyer",
        contactId: "contact-batch-second",
      }),
    ],
  };
}

function budget(scope, entityId) {
  return {
    authorityType: "enrichment",
    accountId: `enrichment:${WORKSPACE_ID.length}:${WORKSPACE_ID}:${scope}:${entityId.length}:${entityId}`,
    scope,
    workspaceId: WORKSPACE_ID,
    entityId,
    currency: "USD",
    actualUnits: 0,
    reservedUnits: 0,
    maxUnits: 2,
    actualCostMinor: 0,
    reservedCostMinor: 0,
    maxCostMinor: 2,
  };
}

function evidenceAssignment(patch = {}) {
  return {
    assignmentId: "assignment-batch-first",
    prospectId: "prospect-batch-verifier",
    role: "champion",
    workspaceId: WORKSPACE_ID,
    contactId: "contact-batch-first",
    profileConfigurationId: CONFIGURATION_ID,
    profileConfigurationDigest: CONFIGURATION_DIGEST,
    ...patch,
  };
}

function contactEnvelope(patch = {}) {
  return {
    id: "observation-batch-first",
    assignmentId: "assignment-batch-first",
    prospectId: "prospect-batch-verifier",
    workspaceId: WORKSPACE_ID,
    contactId: "contact-batch-first",
    profileConfigurationId: CONFIGURATION_ID,
    profileConfigurationDigest: CONFIGURATION_DIGEST,
    kind: "email",
    value: "first@example.invalid",
    confidence: 1,
    provenance: {
      sourceReference: "source-batch-verifier",
      excerpt: "synthetic excerpt",
      objectReference: "object-batch-verifier",
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
    catalogRef: "catalog-batch-verifier",
    verdictReference: `verdict-${envelope.id}`,
    verdictDigest: "d".repeat(64),
  };
}

function contactPort(providerPort, envelopes) {
  return providerPort.bindContactProviderPort(
    {
      providerId: PROVIDER_ID,
      providerVersion: "v1",
      catalogRef: "catalog-batch-verifier",
    },
    async (assignment) => ({
      kind: "completed",
      reservationId: assignment.reservationId,
      operationKey: assignment.operationKey,
      documentedUnits: 2,
      documentedCostMinor: 2,
      evidence: envelopes,
    }),
  );
}
