import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";

const WORKSPACE_ID = "workspace-prospect-integrity";
const PROSPECT_ID = "prospect-integrity-a";
const CONTACT_ID = "contact-prospect-integrity";
const CONFIGURATION_ID = "configuration-prospect-integrity";
const CONFIGURATION_DIGEST = "a".repeat(64);
const PROVIDER_ID = "provider-prospect-integrity";
const NOW = 1_800_000_000_000;

async function load(vite, name) {
  return vite.ssrLoadModule(new URL(`../domain/${name}.ts`, import.meta.url).pathname);
}

test("ContactReady remains bound to the prospect in the committed evidence assignment", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const evidence = await load(vite, "contact-evidence");
    const eligibility = await load(vite, "contact-eligibility");
    const raw = contactEnvelope();
    const verifier = evidence.bindContactEvidenceVerifier(
      { verifierId: "verifier-prospect-integrity", verifierVersion: "v1" },
      async () => trustedVerdict(raw),
    );
    const receipt = await evidence.executeContactVerification(
      verifier,
      verificationRequest(raw),
    );
    assert.ok(receipt);
    const admitted = evidence.ingestContactEvidence(
      committedEvidenceAssignment(),
      raw,
      receipt,
    );
    assert.equal(admitted.accepted, true);

    const baseline = eligibilityInput(admitted.observation);
    assert.equal(
      eligibility.projectContactEligibility(baseline).state,
      "ContactReady",
    );

    const targets = [
      {
        label: "cross-prospect target",
        target: { ...baseline.target, prospectId: "prospect-integrity-b" },
      },
      {
        label: "missing prospect target",
        target: {
          workspaceId: baseline.target.workspaceId,
          contactId: baseline.target.contactId,
        },
      },
      {
        label: "malformed prospect target",
        target: { ...baseline.target, prospectId: "" },
      },
      {
        label: "cross-prospect approval authority",
        target: baseline.target,
        authority: { ...baseline.authority, prospectId: "prospect-integrity-b" },
      },
      {
        label: "cross-configuration approval authority",
        target: baseline.target,
        authority: {
          ...baseline.authority,
          configurationDigest: "c".repeat(64),
        },
      },
    ];
    for (const scenario of targets) {
      const input = {
        ...baseline,
        target: scenario.target,
        authority: scenario.authority ?? baseline.authority,
      };
      const projection = eligibility.projectContactEligibility(input);
      assert.equal(projection.eligible, false, scenario.label);
      assert.equal(projection.state, "NeedsReview", scenario.label);
      for (const recheck of [
        eligibility.recheckForPackageApproval,
        eligibility.recheckForCrmExport,
        eligibility.recheckForClickToCall,
        eligibility.recheckForFinalSend,
      ]) {
        const result = recheck(input);
        assert.equal(result.blocked, true, scenario.label);
        assert.equal(result.eligibility.eligible, false, scenario.label);
        assert.deepEqual(result.effectsBefore, eligibility.zeroDownstreamEffects());
        assert.deepEqual(result.effectsAfter, eligibility.zeroDownstreamEffects());
      }
    }
  } finally {
    await vite.close();
  }
});

test("provider outcomes are snapshotted without getters and reject exotic or inexact material", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const issuance = await load(vite, "enrichment-grant-issuance");
    const authority = await load(vite, "enrichment-authority");
    const operation = await load(vite, "enrichment-operation");
    const providerPort = await load(vite, "contact-provider-port");

    let getterCalls = 0;
    const scenarios = [
      {
        label: "accessor",
        maxUnits: 1,
        outcome(assignment) {
          const value = validOutcome(assignment);
          const reservationId = value.reservationId;
          delete value.reservationId;
          Object.defineProperty(value, "reservationId", {
            enumerable: true,
            get() {
              getterCalls += 1;
              return reservationId;
            },
          });
          return value;
        },
      },
      {
        label: "Proxy",
        maxUnits: 1,
        outcome: (assignment) => new Proxy(validOutcome(assignment), {}),
      },
      {
        label: "symbol extra",
        maxUnits: 1,
        outcome(assignment) {
          const value = validOutcome(assignment);
          value[Symbol("hidden-authority")] = true;
          return value;
        },
      },
      {
        label: "non-enumerable extra",
        maxUnits: 1,
        outcome(assignment) {
          const value = validOutcome(assignment);
          Object.defineProperty(value, "hiddenAuthority", {
            enumerable: false,
            value: true,
          });
          return value;
        },
      },
      {
        label: "sparse evidence",
        maxUnits: 2,
        outcome(assignment) {
          const evidence = [contactEnvelope()];
          evidence.length = 2;
          return validOutcome(assignment, {
            documentedUnits: 2,
            documentedCostMinor: 2,
            evidence,
          });
        },
      },
      {
        label: "deep extra",
        maxUnits: 1,
        outcome(assignment) {
          const envelope = contactEnvelope();
          envelope.provenance = { ...envelope.provenance, unexpected: true };
          return validOutcome(assignment, { evidence: [envelope] });
        },
      },
    ];

    for (const scenario of scenarios) {
      const harness = await admittedHarness(
        issuance,
        authority,
        scenario.maxUnits,
        scenario.label,
      );
      const port = providerPort.bindContactProviderPort(
        providerDescriptor(),
        async (assignment) => {
          harness.state.providerCalls += 1;
          return scenario.outcome(assignment);
        },
      );
      const result = await operation.executeEnrichmentOperation(
        harness.repository,
        port,
        { reservationId: harness.reservation.id, now: NOW },
      );
      assert.equal(result.kind, "needs_reconciliation", scenario.label);
      assert.equal(harness.state.providerCalls, 1, scenario.label);
      assert.equal(harness.state.settlements, 0, scenario.label);
      assert.equal(harness.state.reconciliations, 1, scenario.label);
    }
    assert.equal(getterCalls, 0, "provider outcome accessors are never evaluated");

    const valid = await admittedHarness(issuance, authority, 1, "valid");
    const validPort = providerPort.bindContactProviderPort(
      providerDescriptor(),
      async (assignment) => validOutcome(assignment),
    );
    assert.deepEqual(
      await operation.executeEnrichmentOperation(
        valid.repository,
        validPort,
        { reservationId: valid.reservation.id, now: NOW },
      ),
      { kind: "settled", outcome: "completed" },
    );
    assert.equal(valid.state.settlements, 1);
    assert.equal(valid.state.reconciliations, 0);
  } finally {
    await vite.close();
  }
});

async function admittedHarness(issuance, authority, maxUnits, nonceSuffix) {
  const snapshot = issuanceSnapshot();
  const issued = await issuance.issueEnrichmentGrant(
    {
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
        return `nonce-${nonceSuffix}`;
      },
    },
    {
      principalSubject: "owner-prospect-integrity",
      prospectIds: [PROSPECT_ID],
      operation: "business_contact_lookup/v1",
      maxUnits,
      maxCostMinor: maxUnits,
      currency: "USD",
      expiresAt: NOW + 10_000,
      expectedRevision: snapshot.revision,
      idempotencyKey: `grant-${nonceSuffix}`,
      now: NOW - 1_000,
    },
  );
  assert.equal(issued.kind, "issued");
  const state = {
    record: null,
    status: "empty",
    providerCalls: 0,
    settlements: 0,
    reconciliations: 0,
    revision: 0,
  };
  const repository = {
    async loadReservationAuthority() {
      return reservationAuthority(issued.grant, snapshot, maxUnits);
    },
    async commitReservation(record) {
      state.record = record;
      state.status = "reserved";
      return { kind: "created", record };
    },
    async claimCommittedInvocation(reservationId, now) {
      if (
        !state.record
        || state.record.id !== reservationId
        || state.status !== "reserved"
      ) return { kind: "blocked", reason: "unavailable" };
      state.status = "invoking";
      return {
        kind: "claimed",
        assignment: state.record.assignment,
        claimedAt: now,
      };
    },
    async settleReservation(reservationId, settlement) {
      state.settlements += 1;
      state.revision += 1;
      return {
        kind: "durably_recorded",
        reservationId,
        terminalState: settlement.state,
        terminalReason: settlement.reason,
        settlementDigest: settlement.settlementDigest,
        observationIds: settlement.observations.map((item) => item.id),
        durableRevision: state.revision,
      };
    },
    async markNeedsReconciliation(reservationId, reason) {
      state.reconciliations += 1;
      state.revision += 1;
      return {
        kind: "durably_recorded",
        reservationId,
        terminalState: "needs_reconciliation",
        terminalReason: reason,
        settlementDigest: null,
        observationIds: [],
        durableRevision: state.revision,
      };
    },
    async listInvocationsNeedingRecovery() {
      return [];
    },
  };
  const reserved = await authority.reserveEnrichmentOperation(repository, {
    grantId: issued.grant.id,
    principalSubject: "owner-prospect-integrity",
    operationKey: issued.grant.tuple.operationKey,
    now: NOW,
  });
  assert.equal(reserved.kind, "reserved");
  return { repository, reservation: reserved.reservation, state };
}

function issuanceSnapshot() {
  return {
    admitted: true,
    workspaceId: WORKSPACE_ID,
    ownerSubject: "owner-prospect-integrity",
    revision: 7,
    configuration: {
      id: CONFIGURATION_ID,
      digest: CONFIGURATION_DIGEST,
      revision: 3,
      current: true,
    },
    prospects: [{
      id: PROSPECT_ID,
      state: "approved",
      configurationId: CONFIGURATION_ID,
      configurationDigest: CONFIGURATION_DIGEST,
      revision: 4,
    }],
    quote: {
      ...providerDescriptor(),
      revision: 2,
      currency: "USD",
      unitCostMinor: 1,
      expiresAt: NOW + 20_000,
    },
  };
}

function reservationAuthority(grant, snapshot, maxUnits) {
  return {
    admitted: true,
    principalSubject: "owner-prospect-integrity",
    workspaceId: WORKSPACE_ID,
    sourceRevision: snapshot.revision,
    grant,
    configuration: snapshot.configuration,
    prospects: snapshot.prospects,
    quote: snapshot.quote,
    accounts: [
      budget("grant", grant.id, maxUnits),
      budget("profile", CONFIGURATION_ID, maxUnits),
      budget("workspace", WORKSPACE_ID, maxUnits),
      budget("provider", PROVIDER_ID, maxUnits),
    ],
    evidenceAssignments: [
      evidenceAssignment(),
      ...(maxUnits > 1 ? [evidenceAssignment({
        assignmentId: "assignment-prospect-integrity-second",
        contactId: "contact-prospect-integrity-second",
        role: "economic_buyer",
      })] : []),
    ],
  };
}

function budget(scope, entityId, maximum) {
  return {
    authorityType: "enrichment",
    accountId: `enrichment:${WORKSPACE_ID.length}:${WORKSPACE_ID}:${scope}:${entityId.length}:${entityId}`,
    scope,
    workspaceId: WORKSPACE_ID,
    entityId,
    currency: "USD",
    actualUnits: 0,
    reservedUnits: 0,
    maxUnits: maximum,
    actualCostMinor: 0,
    reservedCostMinor: 0,
    maxCostMinor: maximum,
  };
}

function providerDescriptor() {
  return {
    providerId: PROVIDER_ID,
    providerVersion: "v1",
    catalogRef: "catalog-prospect-integrity",
  };
}

function evidenceAssignment(patch = {}) {
  return {
    assignmentId: "assignment-prospect-integrity",
    prospectId: PROSPECT_ID,
    role: "champion",
    workspaceId: WORKSPACE_ID,
    contactId: CONTACT_ID,
    profileConfigurationId: CONFIGURATION_ID,
    profileConfigurationDigest: CONFIGURATION_DIGEST,
    ...patch,
  };
}

function committedEvidenceAssignment() {
  return {
    ...evidenceAssignment(),
    quoteRevision: 2,
    providerAuthority: providerDescriptor(),
  };
}

function contactEnvelope(patch = {}) {
  return {
    id: "observation-prospect-integrity",
    assignmentId: "assignment-prospect-integrity",
    prospectId: PROSPECT_ID,
    workspaceId: WORKSPACE_ID,
    contactId: CONTACT_ID,
    profileConfigurationId: CONFIGURATION_ID,
    profileConfigurationDigest: CONFIGURATION_DIGEST,
    kind: "email",
    value: "prospect-integrity@example.invalid",
    confidence: 1,
    provenance: {
      sourceReference: "source-prospect-integrity",
      excerpt: "synthetic verified business contact",
      objectReference: "object-prospect-integrity",
      contentHash: "b".repeat(64),
      retrievedAt: NOW - 200,
    },
    observedAt: NOW - 100,
    ...patch,
  };
}

function verificationRequest(envelope) {
  return {
    assignmentId: "assignment-prospect-integrity",
    prospectId: PROSPECT_ID,
    role: "champion",
    assignment: {
      workspaceId: WORKSPACE_ID,
      contactId: CONTACT_ID,
      profileConfigurationId: CONFIGURATION_ID,
      profileConfigurationDigest: CONFIGURATION_DIGEST,
      ...providerDescriptor(),
      quoteRevision: 2,
    },
    envelope,
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
    normalizedValue: envelope.value,
    contentHash: envelope.provenance.contentHash,
    verificationClass: "mailbox_verified",
    method: "mailbox_verification",
    verifiedAt: NOW - 150,
    ...providerDescriptor(),
    verdictReference: "verdict-prospect-integrity",
    verdictDigest: "d".repeat(64),
  };
}

function eligibilityInput(observation) {
  return {
    target: {
      workspaceId: WORKSPACE_ID,
      prospectId: PROSPECT_ID,
      contactId: CONTACT_ID,
    },
    points: [observation],
    strategy: {
      configurationId: CONFIGURATION_ID,
      configurationDigest: CONFIGURATION_DIGEST,
    },
    authority: {
      prospectId: PROSPECT_ID,
      configurationId: CONFIGURATION_ID,
      configurationDigest: CONFIGURATION_DIGEST,
      profileAvailable: true,
      configurationCurrent: true,
      drifted: false,
      disqualified: false,
      suppressed: false,
      phase4Approved: true,
      contactCapabilityEnabled: true,
    },
    now: NOW,
  };
}

function validOutcome(assignment, patch = {}) {
  return {
    kind: "completed",
    reservationId: assignment.reservationId,
    operationKey: assignment.operationKey,
    documentedUnits: 1,
    documentedCostMinor: 1,
    evidence: [contactEnvelope()],
    ...patch,
  };
}
