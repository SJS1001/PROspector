import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";

const NOW = 1_900_000_500_000;
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
  try {
    return {
      vite,
      suppression: await vite.ssrLoadModule(new URL("../preparation/suppression-success-decision.ts", import.meta.url).pathname),
    };
  } catch (error) {
    await vite.close();
    throw error;
  }
}

function publicUnsubscribe(patch = {}) {
  return {
    id: "synthetic-suppression-intent",
    source: { kind: "public_unsubscribe", tokenDigest: A },
    workspaceId: "synthetic-workspace",
    companyId: "synthetic-company",
    contactId: "synthetic-contact",
    organizationId: "synthetic-organization",
    messageArtifact: { id: "synthetic-message", digest: B },
    tombstoneId: "synthetic-suppression-tombstone",
    sourceReceiptId: "synthetic-source-receipt",
    originatedMessageId: "synthetic-originated-message",
    originatedThreadId: "synthetic-originated-thread",
    normalizedEmail: "prospect@example.invalid",
    confirmedEmailDomains: ["example.invalid"],
    suppressionSubject: { kind: "exact_email", value: "prospect@example.invalid", channel: "email" },
    matchingWorkIds: ["synthetic-follow-up-b", "synthetic-follow-up-a"],
    cancellationDependencyIds: ["synthetic-dependency-stop", "synthetic-dependency-suppression"],
    occurredAt: NOW,
    ...patch,
  };
}

function explicitOptOut(patch = {}) {
  return publicUnsubscribe({
    id: "synthetic-explicit-opt-out-intent",
    source: { kind: "explicit_email_opt_out", eventId: "synthetic-opt-out-event", eventDigest: A },
    ...patch,
  });
}

function authority(patch = {}) {
  return {
    evaluatedAt: NOW + 100,
    workspaceId: "synthetic-workspace",
    companyId: "synthetic-company",
    contactId: "synthetic-contact",
    organizationId: "synthetic-organization",
    messageArtifact: { id: "synthetic-message", digest: B },
    normalizedEmail: "prospect@example.invalid",
    confirmedEmailDomains: ["example.invalid"],
    suppressionSubject: { kind: "exact_email", value: "prospect@example.invalid", channel: "email" },
    knownOriginatedPairs: [{ messageId: "synthetic-originated-message", threadId: "synthetic-originated-thread" }],
    matchingWorkIds: ["synthetic-follow-up-a", "synthetic-follow-up-b"],
    cancellationDependencyIds: ["synthetic-dependency-stop", "synthetic-dependency-suppression"],
    sourceBinding: { kind: "public_unsubscribe", bindingKnown: true, tokenDigest: A },
    tombstoneRecord: null,
    cancellationRecord: null,
    sourceReceiptRecord: null,
    successReceiptRecord: null,
    ...patch,
  };
}

test("suppression-before-success artifacts are canonical, immutable, and zero-effect", async () => {
  const { vite, suppression } = await load();
  try {
    const first = await suppression.buildSyntheticSuppressionBeforeSuccess(publicUnsubscribe());
    const permuted = await suppression.buildSyntheticSuppressionBeforeSuccess(publicUnsubscribe({
      matchingWorkIds: [...publicUnsubscribe().matchingWorkIds].reverse(),
      cancellationDependencyIds: [...publicUnsubscribe().cancellationDependencyIds].reverse(),
    }));
    assert.equal(first.digest, permuted.digest);
    assert.equal(first.kind, "synthetic_suppression_before_success");
    assert.equal(first.persistenceAuthorized, false);
    assert.equal(first.cancellationAuthorized, false);
    assert.equal(first.successAcknowledgementAuthorized, false);
    assert.equal(first.providerInvocationAuthorized, false);
    assert.deepEqual(first.effects, ZERO_EFFECTS);
    assert.deepEqual(first.snapshot.matchingWorkIds, ["synthetic-follow-up-a", "synthetic-follow-up-b"]);
    assert.equal(Object.isFrozen(first), true);
    assert.equal(Object.isFrozen(first.snapshot), true);
    assert.equal(Object.isFrozen(first.snapshot.source), true);
  } finally {
    await vite.close();
  }
});

test("an explicit email opt-out binds only its pre-resolved synthetic event", async () => {
  const { vite, suppression } = await load();
  try {
    const artifact = await suppression.buildSyntheticSuppressionBeforeSuccess(explicitOptOut());
    assert.equal(artifact.snapshot.source.kind, "explicit_email_opt_out");
    assert.equal(artifact.snapshot.source.eventId, "synthetic-opt-out-event");
    assert.equal(artifact.snapshot.source.eventDigest, A);
    assert.equal("tokenDigest" in artifact.snapshot.source, false);
    assert.equal(artifact.persistenceAuthorized, false);
    assert.equal(artifact.cancellationAuthorized, false);
    assert.equal(artifact.successAcknowledgementAuthorized, false);
    assert.deepEqual(artifact.effects, ZERO_EFFECTS);
  } finally {
    await vite.close();
  }
});

test("unsubscribe intent binds each allowed email suppression scope exactly", async () => {
  const { vite, suppression } = await load();
  try {
    const cases = [
      { kind: "exact_email", value: "prospect@example.invalid", channel: "email" },
      { kind: "confirmed_email_domain", value: "example.invalid", channel: "email" },
      { kind: "contact", value: "synthetic-contact", channel: "all" },
      { kind: "organization", value: "synthetic-organization", channel: "all" },
      { kind: "company", value: "synthetic-company", channel: "all" },
    ];
    for (const suppressionSubject of cases) {
      const artifact = await suppression.buildSyntheticSuppressionBeforeSuccess(publicUnsubscribe({ suppressionSubject }));
      assert.deepEqual(artifact.snapshot.suppressionSubject, suppressionSubject, suppressionSubject.kind);
      assert.equal(artifact.persistenceAuthorized, false, suppressionSubject.kind);
      assert.deepEqual(artifact.effects, ZERO_EFFECTS, suppressionSubject.kind);
    }
  } finally {
    await vite.close();
  }
});

test("a current bound unsubscribe requires tombstone and stop durability before generic success", async () => {
  const { vite, suppression } = await load();
  try {
    const artifact = await suppression.buildSyntheticSuppressionBeforeSuccess(publicUnsubscribe());
    const decision = await suppression.evaluateSyntheticSuppressionBeforeSuccess({
      intentArtifact: artifact,
      currentIntent: publicUnsubscribe(),
      currentAuthority: authority(),
    });
    assert.equal(decision.status, "synthetic_suppression_commit_required_no_authority");
    assert.equal(decision.durablePrerequisitesSatisfied, false);
    assert.equal(decision.genericPublicResponseProjection, "generic_unsubscribe_response");
    assert.deepEqual(decision.requiredOrderedSteps, [
      "append_suppression_tombstone",
      "cancel_matching_pending_or_unleased_work",
      "record_source_processed",
      "report_generic_success",
    ]);
    assert.deepEqual(decision.requiredCancellationWorkIds, ["synthetic-follow-up-a", "synthetic-follow-up-b"]);
    assert.deepEqual(decision.reasonCodes, []);
    assert.equal(decision.persistenceAuthorized, false);
    assert.equal(decision.cancellationAuthorized, false);
    assert.equal(decision.successAcknowledgementAuthorized, false);
    assert.equal(decision.providerInvocationAuthorized, false);
    assert.deepEqual(decision.effects, ZERO_EFFECTS);
    assert.equal(Object.isFrozen(decision), true);
  } finally {
    await vite.close();
  }
});

test("unsubscribe still requires a tombstone when no matching follow-up exists", async () => {
  const { vite, suppression } = await load();
  try {
    const input = publicUnsubscribe({ matchingWorkIds: [] });
    const artifact = await suppression.buildSyntheticSuppressionBeforeSuccess(input);
    const pending = await suppression.evaluateSyntheticSuppressionBeforeSuccess({
      intentArtifact: artifact,
      currentIntent: input,
      currentAuthority: authority({ matchingWorkIds: [] }),
    });
    assert.equal(pending.status, "synthetic_suppression_commit_required_no_authority");
    assert.deepEqual(pending.requiredCancellationWorkIds, []);
    assert.equal(pending.requiredOrderedSteps[0], "append_suppression_tombstone");
    assert.equal(pending.successAcknowledgementAuthorized, false);

    const durable = await suppression.evaluateSyntheticSuppressionBeforeSuccess({
      intentArtifact: artifact,
      currentIntent: input,
      currentAuthority: authority({
        matchingWorkIds: [],
        tombstoneRecord: {
          id: "synthetic-suppression-tombstone",
          intentDigest: artifact.digest,
          recordedAt: NOW + 1,
        },
        cancellationRecord: {
          intentDigest: artifact.digest,
          workIds: [],
          recordedAt: NOW + 2,
        },
        sourceReceiptRecord: {
          id: "synthetic-source-receipt",
          intentDigest: artifact.digest,
          recordedAt: NOW + 3,
        },
      }),
    });
    assert.equal(durable.status, "synthetic_suppression_already_durable_no_authority");
    assert.equal(durable.durablePrerequisitesSatisfied, true);
    assert.equal(durable.successAcknowledgementAuthorized, false);
    assert.deepEqual(durable.effects, ZERO_EFFECTS);
  } finally {
    await vite.close();
  }
});

test("an exact already-durable unsubscribe replay remains zero-authority and generic", async () => {
  const { vite, suppression } = await load();
  try {
    const artifact = await suppression.buildSyntheticSuppressionBeforeSuccess(publicUnsubscribe());
    const decision = await suppression.evaluateSyntheticSuppressionBeforeSuccess({
      intentArtifact: artifact,
      currentIntent: publicUnsubscribe(),
      currentAuthority: authority({
        tombstoneRecord: {
          id: "synthetic-suppression-tombstone",
          intentDigest: artifact.digest,
          recordedAt: NOW + 1,
        },
        cancellationRecord: {
          intentDigest: artifact.digest,
          workIds: ["synthetic-follow-up-b", "synthetic-follow-up-a"],
          recordedAt: NOW + 2,
        },
        sourceReceiptRecord: {
          id: "synthetic-source-receipt",
          intentDigest: artifact.digest,
          recordedAt: NOW + 3,
        },
        successReceiptRecord: {
          intentDigest: artifact.digest,
          recordedAt: NOW + 4,
        },
      }),
    });
    assert.equal(decision.status, "synthetic_suppression_already_durable_no_authority");
    assert.equal(decision.durablePrerequisitesSatisfied, true);
    assert.equal(decision.genericPublicResponseProjection, "generic_unsubscribe_response");
    assert.deepEqual(decision.requiredOrderedSteps, []);
    assert.deepEqual(decision.requiredCancellationWorkIds, []);
    assert.deepEqual(decision.reasonCodes, []);
    assert.equal(decision.persistenceAuthorized, false);
    assert.equal(decision.cancellationAuthorized, false);
    assert.equal(decision.successAcknowledgementAuthorized, false);
    assert.equal(decision.providerInvocationAuthorized, false);
    assert.deepEqual(decision.effects, ZERO_EFFECTS);
  } finally {
    await vite.close();
  }
});

test("a pre-resolved explicit opt-out requires the same durable ordering without a public response", async () => {
  const { vite, suppression } = await load();
  try {
    const artifact = await suppression.buildSyntheticSuppressionBeforeSuccess(explicitOptOut());
    const decision = await suppression.evaluateSyntheticSuppressionBeforeSuccess({
      intentArtifact: artifact,
      currentIntent: explicitOptOut(),
      currentAuthority: authority({
        sourceBinding: {
          kind: "explicit_email_opt_out",
          eventId: "synthetic-opt-out-event",
          eventDigest: A,
          eventAuthenticated: true,
          eventOriginRestricted: true,
          explicitOptOutDetected: true,
        },
      }),
    });
    assert.equal(decision.status, "synthetic_suppression_commit_required_no_authority");
    assert.equal(decision.genericPublicResponseProjection, null);
    assert.deepEqual(decision.requiredOrderedSteps, [
      "append_suppression_tombstone",
      "cancel_matching_pending_or_unleased_work",
      "record_source_processed",
      "complete_opt_out_ingestion",
    ]);
    assert.equal(decision.persistenceAuthorized, false);
    assert.equal(decision.cancellationAuthorized, false);
    assert.equal(decision.successAcknowledgementAuthorized, false);
    assert.deepEqual(decision.effects, ZERO_EFFECTS);
  } finally {
    await vite.close();
  }
});

test("unknown or mismatched public token bindings remain generic and zero-authority", async () => {
  const { vite, suppression } = await load();
  try {
    const artifact = await suppression.buildSyntheticSuppressionBeforeSuccess(publicUnsubscribe());
    const decisions = [];
    for (const sourceBinding of [
      { kind: "public_unsubscribe", bindingKnown: false, tokenDigest: A },
      { kind: "public_unsubscribe", bindingKnown: true, tokenDigest: B },
    ]) {
      decisions.push(await suppression.evaluateSyntheticSuppressionBeforeSuccess({
        intentArtifact: artifact,
        currentIntent: publicUnsubscribe(),
        currentAuthority: authority({ sourceBinding }),
      }));
    }
    for (const decision of decisions) {
      assert.equal(decision.status, "synthetic_suppression_rejected");
      assert.equal(decision.genericPublicResponseProjection, "generic_unsubscribe_response");
      assert.equal(decision.reasonCodes.includes("unsubscribe_binding_invalid"), true);
      assert.deepEqual(decision.requiredOrderedSteps, []);
      assert.equal(decision.persistenceAuthorized, false);
      assert.equal(decision.cancellationAuthorized, false);
      assert.equal(decision.successAcknowledgementAuthorized, false);
      assert.deepEqual(decision.effects, ZERO_EFFECTS);
    }
  } finally {
    await vite.close();
  }
});

test("partial durable state or premature success acknowledgement is rejected", async () => {
  const { vite, suppression } = await load();
  try {
    const artifact = await suppression.buildSyntheticSuppressionBeforeSuccess(publicUnsubscribe());
    const cases = [
      authority({
        tombstoneRecord: { id: "synthetic-suppression-tombstone", intentDigest: artifact.digest, recordedAt: NOW + 1 },
      }),
      authority({
        cancellationRecord: {
          intentDigest: artifact.digest,
          workIds: ["synthetic-follow-up-a"],
          recordedAt: NOW + 1,
        },
      }),
      authority({
        successReceiptRecord: { intentDigest: artifact.digest, recordedAt: NOW + 1 },
      }),
    ];
    for (const currentAuthority of cases) {
      const decision = await suppression.evaluateSyntheticSuppressionBeforeSuccess({
        intentArtifact: artifact,
        currentIntent: publicUnsubscribe(),
        currentAuthority,
      });
      assert.equal(decision.status, "synthetic_suppression_rejected");
      assert.equal(decision.reasonCodes.includes("partial_durable_suppression_state"), true);
      assert.equal(decision.durablePrerequisitesSatisfied, false);
      assert.deepEqual(decision.requiredOrderedSteps, []);
      assert.equal(decision.successAcknowledgementAuthorized, false);
      assert.deepEqual(decision.effects, ZERO_EFFECTS);
    }
  } finally {
    await vite.close();
  }
});

test("a success receipt cannot predate the durable suppression sequence", async () => {
  const { vite, suppression } = await load();
  try {
    const artifact = await suppression.buildSyntheticSuppressionBeforeSuccess(publicUnsubscribe());
    const decision = await suppression.evaluateSyntheticSuppressionBeforeSuccess({
      intentArtifact: artifact,
      currentIntent: publicUnsubscribe(),
      currentAuthority: authority({
        tombstoneRecord: {
          id: "synthetic-suppression-tombstone",
          intentDigest: artifact.digest,
          recordedAt: NOW + 2,
        },
        cancellationRecord: {
          intentDigest: artifact.digest,
          workIds: ["synthetic-follow-up-a", "synthetic-follow-up-b"],
          recordedAt: NOW + 3,
        },
        sourceReceiptRecord: {
          id: "synthetic-source-receipt",
          intentDigest: artifact.digest,
          recordedAt: NOW + 4,
        },
        successReceiptRecord: {
          intentDigest: artifact.digest,
          recordedAt: NOW + 1,
        },
      }),
    });
    assert.equal(decision.status, "synthetic_suppression_rejected");
    assert.equal(decision.reasonCodes.includes("success_receipt_precedes_durable_suppression"), true);
    assert.equal(decision.successAcknowledgementAuthorized, false);
    assert.deepEqual(decision.requiredOrderedSteps, []);
    assert.deepEqual(decision.effects, ZERO_EFFECTS);
  } finally {
    await vite.close();
  }
});

test("durable receipts must prove tombstone then cancellation then source completion", async () => {
  const { vite, suppression } = await load();
  try {
    const artifact = await suppression.buildSyntheticSuppressionBeforeSuccess(publicUnsubscribe());
    const base = {
      tombstoneRecord: {
        id: "synthetic-suppression-tombstone",
        intentDigest: artifact.digest,
        recordedAt: NOW + 3,
      },
      cancellationRecord: {
        intentDigest: artifact.digest,
        workIds: ["synthetic-follow-up-a", "synthetic-follow-up-b"],
        recordedAt: NOW + 2,
      },
      sourceReceiptRecord: {
        id: "synthetic-source-receipt",
        intentDigest: artifact.digest,
        recordedAt: NOW + 1,
      },
    };
    const decision = await suppression.evaluateSyntheticSuppressionBeforeSuccess({
      intentArtifact: artifact,
      currentIntent: publicUnsubscribe(),
      currentAuthority: authority(base),
    });
    assert.equal(decision.status, "synthetic_suppression_rejected");
    assert.equal(decision.reasonCodes.includes("cancellation_precedes_tombstone"), true);
    assert.equal(decision.reasonCodes.includes("source_receipt_precedes_cancellation"), true);
    assert.equal(decision.durablePrerequisitesSatisfied, false);
    assert.equal(decision.successAcknowledgementAuthorized, false);
    assert.deepEqual(decision.requiredOrderedSteps, []);
    assert.deepEqual(decision.effects, ZERO_EFFECTS);
  } finally {
    await vite.close();
  }
});

test("every current authority mismatch rejects the suppression projection", async () => {
  const { vite, suppression } = await load();
  try {
    const artifact = await suppression.buildSyntheticSuppressionBeforeSuccess(publicUnsubscribe());
    const cases = [
      ["suppression_intent_changed", {}, publicUnsubscribe({ occurredAt: NOW + 1 })],
      ["workspace_scope_mismatch", { workspaceId: "synthetic-other-workspace" }],
      ["company_scope_mismatch", { companyId: "synthetic-other-company" }],
      ["contact_scope_mismatch", { contactId: "synthetic-other-contact" }],
      ["organization_scope_mismatch", { organizationId: "synthetic-other-organization" }],
      ["message_artifact_changed", { messageArtifact: { id: "synthetic-message", digest: A } }],
      ["normalized_email_changed", {
        normalizedEmail: "other@example.invalid",
        suppressionSubject: { kind: "exact_email", value: "other@example.invalid", channel: "email" },
      }],
      ["confirmed_email_domain_set_changed", { confirmedEmailDomains: [] }],
      ["suppression_subject_changed", {
        suppressionSubject: { kind: "contact", value: "synthetic-contact", channel: "all" },
      }],
      ["originated_message_thread_unknown", {
        knownOriginatedPairs: [{ messageId: "synthetic-other-message", threadId: "synthetic-originated-thread" }],
      }],
      ["matching_work_set_changed", { matchingWorkIds: ["synthetic-follow-up-a"] }],
      ["cancellation_dependency_set_changed", {
        cancellationDependencyIds: ["synthetic-dependency-suppression"],
      }],
      ["evaluation_precedes_intent", { evaluatedAt: NOW - 1 }],
      ["unsubscribe_binding_invalid", {
        sourceBinding: { kind: "public_unsubscribe", bindingKnown: false, tokenDigest: A },
      }],
    ];
    for (const [reason, authorityPatch, currentIntent = publicUnsubscribe()] of cases) {
      const decision = await suppression.evaluateSyntheticSuppressionBeforeSuccess({
        intentArtifact: artifact,
        currentIntent,
        currentAuthority: authority(authorityPatch),
      });
      assert.equal(decision.status, "synthetic_suppression_rejected", reason);
      assert.equal(decision.reasonCodes.includes(reason), true, reason);
      assert.deepEqual(decision.requiredOrderedSteps, [], reason);
      assert.equal(decision.persistenceAuthorized, false, reason);
      assert.equal(decision.cancellationAuthorized, false, reason);
      assert.equal(decision.successAcknowledgementAuthorized, false, reason);
      assert.deepEqual(decision.effects, ZERO_EFFECTS, reason);
    }
  } finally {
    await vite.close();
  }
});

test("explicit opt-out authentication and originated-event authority fail closed", async () => {
  const { vite, suppression } = await load();
  try {
    const artifact = await suppression.buildSyntheticSuppressionBeforeSuccess(explicitOptOut());
    const base = {
      kind: "explicit_email_opt_out",
      eventId: "synthetic-opt-out-event",
      eventDigest: A,
      eventAuthenticated: true,
      eventOriginRestricted: true,
      explicitOptOutDetected: true,
    };
    const cases = [
      { ...base, eventId: "synthetic-other-event" },
      { ...base, eventDigest: B },
      { ...base, eventAuthenticated: false },
      { ...base, eventOriginRestricted: false },
      { ...base, explicitOptOutDetected: false },
    ];
    for (const sourceBinding of cases) {
      const decision = await suppression.evaluateSyntheticSuppressionBeforeSuccess({
        intentArtifact: artifact,
        currentIntent: explicitOptOut(),
        currentAuthority: authority({ sourceBinding }),
      });
      assert.equal(decision.status, "synthetic_suppression_rejected");
      assert.equal(decision.reasonCodes.includes("explicit_opt_out_binding_invalid"), true);
      assert.equal(decision.genericPublicResponseProjection, null);
      assert.equal(decision.persistenceAuthorized, false);
      assert.equal(decision.cancellationAuthorized, false);
      assert.equal(decision.successAcknowledgementAuthorized, false);
      assert.deepEqual(decision.effects, ZERO_EFFECTS);
    }
  } finally {
    await vite.close();
  }
});

test("every durable receipt is exact, current, and bound to the intent", async () => {
  const { vite, suppression } = await load();
  try {
    const artifact = await suppression.buildSyntheticSuppressionBeforeSuccess(publicUnsubscribe());
    const records = {
      tombstoneRecord: {
        id: "synthetic-suppression-tombstone",
        intentDigest: artifact.digest,
        recordedAt: NOW + 1,
      },
      cancellationRecord: {
        intentDigest: artifact.digest,
        workIds: ["synthetic-follow-up-a", "synthetic-follow-up-b"],
        recordedAt: NOW + 2,
      },
      sourceReceiptRecord: {
        id: "synthetic-source-receipt",
        intentDigest: artifact.digest,
        recordedAt: NOW + 3,
      },
      successReceiptRecord: {
        intentDigest: artifact.digest,
        recordedAt: NOW + 4,
      },
    };
    const cases = [
      ["tombstone_record_mismatch", { tombstoneRecord: { ...records.tombstoneRecord, id: "synthetic-other-tombstone" } }],
      ["tombstone_record_time_invalid", { tombstoneRecord: { ...records.tombstoneRecord, recordedAt: NOW - 1 } }],
      ["cancellation_record_mismatch", { cancellationRecord: { ...records.cancellationRecord, intentDigest: C } }],
      ["cancellation_work_set_mismatch", { cancellationRecord: { ...records.cancellationRecord, workIds: ["synthetic-follow-up-a"] } }],
      ["cancellation_record_time_invalid", { cancellationRecord: { ...records.cancellationRecord, recordedAt: NOW - 1 } }],
      ["source_receipt_mismatch", { sourceReceiptRecord: { ...records.sourceReceiptRecord, id: "synthetic-other-receipt" } }],
      ["source_receipt_time_invalid", { sourceReceiptRecord: { ...records.sourceReceiptRecord, recordedAt: NOW + 101 } }],
      ["success_receipt_mismatch", { successReceiptRecord: { ...records.successReceiptRecord, intentDigest: C } }],
      ["success_receipt_time_invalid", { successReceiptRecord: { ...records.successReceiptRecord, recordedAt: NOW + 101 } }],
    ];
    for (const [reason, patch] of cases) {
      const decision = await suppression.evaluateSyntheticSuppressionBeforeSuccess({
        intentArtifact: artifact,
        currentIntent: publicUnsubscribe(),
        currentAuthority: authority({ ...records, ...patch }),
      });
      assert.equal(decision.status, "synthetic_suppression_rejected", reason);
      assert.equal(decision.reasonCodes.includes(reason), true, reason);
      assert.equal(decision.successAcknowledgementAuthorized, false, reason);
      assert.deepEqual(decision.requiredOrderedSteps, [], reason);
      assert.deepEqual(decision.effects, ZERO_EFFECTS, reason);
    }
  } finally {
    await vite.close();
  }
});

test("real-looking, raw-token, malformed, duplicate, accessor, and forged inputs fail closed", async () => {
  const { vite, suppression } = await load();
  try {
    await assert.rejects(
      suppression.buildSyntheticSuppressionBeforeSuccess(publicUnsubscribe({ normalizedEmail: "real@example.com" })),
      /synthetic_suppression_before_success_invalid/,
    );
    await assert.rejects(
      suppression.buildSyntheticSuppressionBeforeSuccess({ ...publicUnsubscribe(), rawToken: "must-not-be-stored" }),
      /synthetic_suppression_before_success_invalid/,
    );
    await assert.rejects(
      suppression.buildSyntheticSuppressionBeforeSuccess(publicUnsubscribe({
        matchingWorkIds: ["synthetic-follow-up-a", "synthetic-follow-up-a"],
      })),
      /synthetic_suppression_before_success_invalid/,
    );
    await assert.rejects(
      suppression.buildSyntheticSuppressionBeforeSuccess(publicUnsubscribe({ matchingWorkIds: new Array(1) })),
      /synthetic_suppression_before_success_invalid/,
    );
    await assert.rejects(
      suppression.buildSyntheticSuppressionBeforeSuccess(publicUnsubscribe({
        suppressionSubject: { kind: "exact_phone", value: "+12025550101", channel: "phone" },
      })),
      /synthetic_suppression_before_success_invalid/,
    );
    const accessor = publicUnsubscribe();
    Object.defineProperty(accessor, "source", { enumerable: true, get() { throw new Error("must-not-run"); } });
    await assert.rejects(
      suppression.buildSyntheticSuppressionBeforeSuccess(accessor),
      /synthetic_suppression_before_success_invalid/,
    );
    const artifact = await suppression.buildSyntheticSuppressionBeforeSuccess(publicUnsubscribe());
    await assert.rejects(
      suppression.evaluateSyntheticSuppressionBeforeSuccess({
        intentArtifact: { ...artifact },
        currentIntent: publicUnsubscribe(),
        currentAuthority: authority(),
      }),
      /synthetic_suppression_before_success_decision_invalid/,
    );
    await assert.rejects(
      suppression.evaluateSyntheticSuppressionBeforeSuccess({
        intentArtifact: artifact,
        currentIntent: publicUnsubscribe(),
        currentAuthority: authority({
          knownOriginatedPairs: [
            { messageId: "synthetic-originated-message", threadId: "synthetic-originated-thread" },
            { messageId: "synthetic-originated-message", threadId: "synthetic-originated-thread" },
          ],
        }),
      }),
      /synthetic_suppression_before_success_decision_invalid/,
    );
  } finally {
    await vite.close();
  }
});
