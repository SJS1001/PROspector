import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createServer } from "vite";

const NOW = 1_900_000_400_000;
const A = "a".repeat(64);
const B = "b".repeat(64);
const C = "c".repeat(64);
const ZERO_EFFECTS = Object.freeze({
  providerCalls: 0,
  outboxMutations: 0,
  sendInvocations: 0,
  callInvocations: 0,
  exportMutations: 0,
  durableMutations: 0,
});

async function load() {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  return {
    vite,
    delivery: await vite.ssrLoadModule(new URL("../preparation/delivery-unknown-decision.ts", import.meta.url).pathname),
  };
}

function unknownInput(patch = {}) {
  return {
    id: "synthetic-delivery-unknown",
    workspaceId: "synthetic-workspace",
    companyId: "synthetic-company",
    prospectId: "synthetic-prospect",
    contactId: "synthetic-contact",
    outboxItemId: "synthetic-outbox-item",
    dispatchKey: "synthetic-dispatch-key",
    messageArtifact: { id: "synthetic-message", digest: A },
    connectionId: "synthetic-connection",
    connectionSubjectId: "synthetic-connection-subject",
    originatedMessageId: "synthetic-originated-message",
    originatedThreadId: "synthetic-originated-thread",
    rfcMessageIdDigest: B,
    markerDigest: C,
    reconciliationDependencyIds: ["synthetic-dependency-origin", "synthetic-dependency-connection"],
    leaseGeneration: 4,
    providerAttemptCount: 1,
    ambiguityKind: "accepted_response_lost",
    observedAt: NOW,
    ...patch,
  };
}

function observation(patch = {}) {
  return {
    id: "synthetic-reconciliation-observation",
    deliveryUnknownId: "synthetic-delivery-unknown",
    workspaceId: "synthetic-workspace",
    companyId: "synthetic-company",
    outboxItemId: "synthetic-outbox-item",
    connectionId: "synthetic-connection",
    connectionSubjectId: "synthetic-connection-subject",
    originatedMessageId: "synthetic-originated-message",
    originatedThreadId: "synthetic-originated-thread",
    rfcMessageIdDigest: B,
    markerDigest: C,
    kind: "originated_match",
    observedAt: NOW + 100,
    ...patch,
  };
}

function authority(patch = {}) {
  return {
    evaluatedAt: NOW + 200,
    workspaceId: "synthetic-workspace",
    companyId: "synthetic-company",
    prospectId: "synthetic-prospect",
    contactId: "synthetic-contact",
    outboxItemId: "synthetic-outbox-item",
    dispatchKey: "synthetic-dispatch-key",
    messageArtifact: { id: "synthetic-message", digest: A },
    connectionId: "synthetic-connection",
    connectionSubjectId: "synthetic-connection-subject",
    knownOriginatedPairs: [{
      messageId: "synthetic-originated-message",
      threadId: "synthetic-originated-thread",
    }],
    rfcMessageIdDigest: B,
    markerDigest: C,
    reconciliationDependencyIds: ["synthetic-dependency-connection", "synthetic-dependency-origin"],
    leaseGeneration: 4,
    itemState: "delivery_unknown",
    deliveryUnknownRecorded: true,
    providerAttemptCount: 1,
    automaticRetryCount: 0,
    connectionActive: true,
    connectionSubjectPinned: true,
    observationAuthenticated: true,
    observationOriginRestricted: true,
    observationAlreadyRecorded: false,
    ...patch,
  };
}

test("delivery-unknown artifacts are canonical, minimized, immutable, and zero-effect", async () => {
  const { vite, delivery } = await load();
  try {
    const first = await delivery.buildSyntheticDeliveryUnknown(unknownInput());
    const permuted = await delivery.buildSyntheticDeliveryUnknown(unknownInput({
      reconciliationDependencyIds: [...unknownInput().reconciliationDependencyIds].reverse(),
    }));
    assert.equal(first.digest, permuted.digest);
    assert.equal(first.classification, "delivery_unknown");
    assert.equal(first.persistenceAuthorized, false);
    assert.equal(first.reconciliationAuthorized, false);
    assert.equal(first.automaticRetryAuthorized, false);
    assert.equal(first.providerInvocationAuthorized, false);
    assert.deepEqual(first.effects, ZERO_EFFECTS);
    assert.equal(Object.isFrozen(first), true);
    assert.equal("providerResponse" in first.snapshot, false);
    assert.equal("messageBody" in first.snapshot, false);
  } finally {
    await vite.close();
  }
});

test("every admitted ambiguity kind stays DeliveryUnknown without retry authority", async () => {
  const { vite, delivery } = await load();
  try {
    for (const ambiguityKind of ["accepted_response_lost", "request_transmission_unknown", "post_acceptance_persistence_failed"]) {
      const artifact = await delivery.buildSyntheticDeliveryUnknown(unknownInput({ ambiguityKind }));
      assert.equal(artifact.classification, "delivery_unknown");
      assert.equal(artifact.automaticRetryAuthorized, false);
      assert.equal(artifact.providerInvocationAuthorized, false);
      assert.equal(artifact.persistenceAuthorized, false);
      assert.deepEqual(artifact.effects, ZERO_EFFECTS);
    }
  } finally {
    await vite.close();
  }
});

test("an exact stored-origin match can only describe a future Sent resolution", async () => {
  const { vite, delivery } = await load();
  try {
    const unknownArtifact = await delivery.buildSyntheticDeliveryUnknown(unknownInput());
    const decision = await delivery.evaluateSyntheticDeliveryReconciliation({
      unknownArtifact,
      currentUnknown: unknownInput(),
      observation: observation(),
      currentAuthority: authority(),
    });
    assert.equal(decision.status, "synthetic_reconciliation_classified_no_authority");
    assert.equal(decision.projectedFutureState, "sent");
    assert.equal(decision.originatedMatchWouldResolveSent, true);
    assert.equal(decision.ownerActionRequired, false);
    assert.equal(decision.newMessageVersionRequiredForFutureTransmission, true);
    assert.equal(decision.persistenceAuthorized, false);
    assert.equal(decision.reconciliationAuthorized, false);
    assert.equal(decision.automaticRetryAuthorized, false);
    assert.equal(decision.providerInvocationAuthorized, false);
    assert.deepEqual(decision.reasonCodes, []);
    assert.deepEqual(decision.effects, ZERO_EFFECTS);
    assert.equal(Object.isFrozen(decision), true);
  } finally {
    await vite.close();
  }
});

test("absence, conflict, and unavailable connection remain unknown and require owner review", async () => {
  const { vite, delivery } = await load();
  try {
    const unknownArtifact = await delivery.buildSyntheticDeliveryUnknown(unknownInput());
    const cases = [
      ["no_originated_match", "originated_delivery_not_found"],
      ["conflicting_evidence", "reconciliation_evidence_conflict"],
      ["connection_unavailable", "reconciliation_connection_unavailable"],
    ];
    for (const [kind, reason] of cases) {
      const decision = await delivery.evaluateSyntheticDeliveryReconciliation({
        unknownArtifact,
        currentUnknown: unknownInput(),
        observation: observation({ kind }),
        currentAuthority: authority(),
      });
      assert.equal(decision.projectedFutureState, "delivery_unknown", kind);
      assert.equal(decision.originatedMatchWouldResolveSent, false, kind);
      assert.equal(decision.ownerActionRequired, true, kind);
      assert.deepEqual(decision.reasonCodes, [reason], kind);
      assert.equal(decision.newMessageVersionRequiredForFutureTransmission, true, kind);
      assert.equal(decision.automaticRetryAuthorized, false, kind);
      assert.equal(decision.providerInvocationAuthorized, false, kind);
      assert.equal(decision.persistenceAuthorized, false, kind);
      assert.equal(decision.reconciliationAuthorized, false, kind);
      assert.deepEqual(decision.effects, ZERO_EFFECTS, kind);
    }
  } finally {
    await vite.close();
  }
});

test("every current-authority failure rejects reconciliation and resend", async () => {
  const { vite, delivery } = await load();
  try {
    const unknownArtifact = await delivery.buildSyntheticDeliveryUnknown(unknownInput());
    const cases = [
      ["delivery_unknown_changed", {}, unknownInput({ observedAt: NOW + 1 })],
      ["workspace_scope_mismatch", { workspaceId: "synthetic-other-workspace" }],
      ["company_scope_mismatch", { companyId: "synthetic-other-company" }],
      ["prospect_scope_mismatch", { prospectId: "synthetic-other-prospect" }],
      ["contact_scope_mismatch", { contactId: "synthetic-other-contact" }],
      ["outbox_item_mismatch", { outboxItemId: "synthetic-other-outbox" }],
      ["dispatch_key_mismatch", { dispatchKey: "synthetic-other-dispatch" }],
      ["message_artifact_changed", { messageArtifact: { id: "synthetic-message", digest: B } }],
      ["connection_mismatch", { connectionId: "synthetic-other-connection" }],
      ["connection_subject_mismatch", { connectionSubjectId: "synthetic-other-subject" }],
      ["originated_message_thread_unknown", { knownOriginatedPairs: [{ messageId: "synthetic-other-message", threadId: "synthetic-originated-thread" }] }],
      ["rfc_message_id_changed", { rfcMessageIdDigest: A }],
      ["marker_changed", { markerDigest: A }],
      ["reconciliation_dependency_set_changed", { reconciliationDependencyIds: ["synthetic-dependency-origin"] }],
      ["lease_generation_changed", { leaseGeneration: 5 }],
      ["item_not_delivery_unknown", { itemState: "sent" }],
      ["delivery_unknown_not_recorded", { deliveryUnknownRecorded: false }],
      ["provider_attempt_count_changed", { providerAttemptCount: 2 }],
      ["automatic_retry_already_recorded", { automaticRetryCount: 1 }],
      ["connection_inactive", { connectionActive: false }],
      ["connection_subject_unpinned", { connectionSubjectPinned: false }],
      ["observation_authentication_invalid", { observationAuthenticated: false }],
      ["observation_not_origin_restricted", { observationOriginRestricted: false }],
      ["observation_already_recorded", { observationAlreadyRecorded: true }],
    ];
    for (const [reason, authorityPatch, currentUnknown = unknownInput()] of cases) {
      const decision = await delivery.evaluateSyntheticDeliveryReconciliation({
        unknownArtifact,
        currentUnknown,
        observation: observation(),
        currentAuthority: authority(authorityPatch),
      });
      assert.equal(decision.status, "synthetic_reconciliation_rejected", reason);
      assert.equal(decision.reasonCodes.includes(reason), true, reason);
      assert.equal(decision.originatedMatchWouldResolveSent, false, reason);
      assert.equal(decision.projectedFutureState, "delivery_unknown", reason);
      assert.equal(decision.automaticRetryAuthorized, false, reason);
      assert.equal(decision.providerInvocationAuthorized, false, reason);
      assert.equal(decision.persistenceAuthorized, false, reason);
      assert.equal(decision.reconciliationAuthorized, false, reason);
      assert.deepEqual(decision.effects, ZERO_EFFECTS, reason);
    }
  } finally {
    await vite.close();
  }
});

test("observation scope, identity, and time must exactly bind the unknown artifact", async () => {
  const { vite, delivery } = await load();
  try {
    const unknownArtifact = await delivery.buildSyntheticDeliveryUnknown(unknownInput());
    const cases = [
      ["observation_delivery_unknown_mismatch", { deliveryUnknownId: "synthetic-other-unknown" }],
      ["observation_workspace_mismatch", { workspaceId: "synthetic-other-workspace" }],
      ["observation_company_mismatch", { companyId: "synthetic-other-company" }],
      ["observation_outbox_mismatch", { outboxItemId: "synthetic-other-outbox" }],
      ["observation_connection_mismatch", { connectionId: "synthetic-other-connection" }],
      ["observation_connection_subject_mismatch", { connectionSubjectId: "synthetic-other-subject" }],
      ["observation_origin_mismatch", { originatedThreadId: "synthetic-other-thread" }],
      ["observation_rfc_message_id_mismatch", { rfcMessageIdDigest: A }],
      ["observation_marker_mismatch", { markerDigest: A }],
      ["observation_precedes_delivery_unknown", { observedAt: NOW - 1 }],
      ["observation_from_future", { observedAt: NOW + 300 }],
    ];
    for (const [reason, observationPatch] of cases) {
      const decision = await delivery.evaluateSyntheticDeliveryReconciliation({
        unknownArtifact,
        currentUnknown: unknownInput(),
        observation: observation(observationPatch),
        currentAuthority: authority(),
      });
      assert.equal(decision.reasonCodes.includes(reason), true, reason);
      assert.equal(decision.originatedMatchWouldResolveSent, false, reason);
      assert.equal(decision.automaticRetryAuthorized, false, reason);
      assert.equal(decision.persistenceAuthorized, false, reason);
    }
  } finally {
    await vite.close();
  }
});

test("DeliveryUnknown cannot be fed back into the prior dispatch boundary for retry", async () => {
  const source = await readFile(new URL("../preparation/outreach-dispatch-decision.ts", import.meta.url), "utf8");
  assert.match(source, /if \(current\.deliveryState !== "not_attempted"\) reasons\.push\("delivery_state_not_dispatchable"\)/u);
  assert.doesNotMatch(source, /delivery_unknown[^\n]*(?:retry|resend)/iu);
});

test("malformed, real-looking, sparse, duplicate, extra, accessor, and forged inputs fail closed", async () => {
  const { vite, delivery } = await load();
  try {
    await assert.rejects(
      delivery.buildSyntheticDeliveryUnknown(unknownInput({ workspaceId: "real-workspace" })),
      /synthetic_delivery_unknown_invalid/,
    );
    await assert.rejects(
      delivery.buildSyntheticDeliveryUnknown(unknownInput({ providerAttemptCount: 2 })),
      /synthetic_delivery_unknown_invalid/,
    );
    await assert.rejects(
      delivery.buildSyntheticDeliveryUnknown(unknownInput({ reconciliationDependencyIds: ["synthetic-dependency-origin", "synthetic-dependency-origin"] })),
      /synthetic_delivery_unknown_invalid/,
    );
    await assert.rejects(
      delivery.buildSyntheticDeliveryUnknown({ ...unknownInput(), providerResponse: "accepted" }),
      /synthetic_delivery_unknown_invalid/,
    );
    const accessor = unknownInput();
    Object.defineProperty(accessor, "ambiguityKind", { enumerable: true, get() { throw new Error("must-not-run"); } });
    await assert.rejects(delivery.buildSyntheticDeliveryUnknown(accessor), /synthetic_delivery_unknown_invalid/);
    const unknownArtifact = await delivery.buildSyntheticDeliveryUnknown(unknownInput());
    await assert.rejects(
      delivery.evaluateSyntheticDeliveryReconciliation({
        unknownArtifact: { ...unknownArtifact },
        currentUnknown: unknownInput(),
        observation: observation(),
        currentAuthority: authority(),
      }),
      /synthetic_delivery_reconciliation_invalid/,
    );
    await assert.rejects(
      delivery.evaluateSyntheticDeliveryReconciliation({
        unknownArtifact,
        currentUnknown: unknownInput(),
        observation: observation(),
        currentAuthority: authority({ knownOriginatedPairs: new Array(1) }),
      }),
      /synthetic_delivery_reconciliation_invalid/,
    );
    await assert.rejects(
      delivery.evaluateSyntheticDeliveryReconciliation({
        unknownArtifact,
        currentUnknown: unknownInput(),
        observation: observation(),
        currentAuthority: authority({ knownOriginatedPairs: [
          { messageId: "synthetic-originated-message", threadId: "synthetic-originated-thread" },
          { messageId: "synthetic-originated-message", threadId: "synthetic-originated-thread" },
        ] }),
      }),
      /synthetic_delivery_reconciliation_invalid/,
    );
  } finally {
    await vite.close();
  }
});
