import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";

const NOW = 1_900_000_600_000;
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
      manual: await vite.ssrLoadModule(new URL("../preparation/manual-call-decision.ts", import.meta.url).pathname),
    };
  } catch (error) {
    await vite.close();
    throw error;
  }
}

function packageInput(patch = {}) {
  return {
    id: "synthetic-package",
    workspaceId: "synthetic-workspace",
    companyId: "synthetic-company",
    prospectId: "synthetic-prospect",
    contactId: "synthetic-contact",
    profileConfigurationId: "synthetic-profile-configuration",
    profileConfigurationDigest: A,
    qualificationEvidenceHashes: [B],
    sourceHashes: [C],
    recommendedAngle: "Synthetic opening grounded in the approved evidence.",
    claimGuardrailVersionIds: ["synthetic-guardrail"],
    selectedContactPoints: [{
      id: "synthetic-phone-point",
      kind: "phone",
      value: "+14165550123",
      verificationClass: "source_verified",
      freshUntil: NOW + 10_000,
    }],
    messageVersionIds: ["synthetic-message"],
    createdAt: NOW - 1_000,
    ...patch,
  };
}

function candidateInput(patch = {}) {
  return {
    id: "synthetic-manual-call-candidate",
    callSessionId: "synthetic-call-session",
    organizationId: "synthetic-organization",
    package: packageInput(),
    packageApproval: {
      id: "synthetic-package-approval",
      approvedAt: NOW - 500,
      expiresAt: NOW + 8_000,
    },
    selectedPhoneId: "synthetic-phone-point",
    phoneVerification: {
      verificationClass: "source_verified",
      method: "authoritative_source_reconfirmed",
      verificationEvidenceDigest: A,
      sourceReferenceDigest: C,
      verifiedAt: NOW - 2_000,
      freshUntil: NOW + 10_000,
    },
    advisory: {
      acknowledgementId: "synthetic-advisory-acknowledgement",
      jurisdictionId: "synthetic-jurisdiction-on",
      basisEvidenceDigest: B,
      acknowledgedAt: NOW - 400,
      expiresAt: NOW + 7_000,
    },
    suppressionSubjectIds: [
      "synthetic-subject-phone",
      "synthetic-subject-contact",
      "synthetic-subject-organization",
      "synthetic-subject-company",
    ],
    matchingPendingWorkIds: ["synthetic-work-b", "synthetic-work-a"],
    cancellationDependencyIds: ["synthetic-dependency-suppression", "synthetic-dependency-stop"],
    createdAt: NOW,
    ...patch,
  };
}

function currentAuthority(candidate, patch = {}) {
  const snapshot = candidate.snapshot;
  return {
    evaluatedAt: NOW + 200,
    workspaceId: snapshot.workspaceId,
    companyId: snapshot.companyId,
    prospectId: snapshot.prospectId,
    contactId: snapshot.contactId,
    organizationId: snapshot.organizationId,
    profileConfigurationId: snapshot.profileConfigurationId,
    profileConfigurationDigest: snapshot.profileConfigurationDigest,
    packageArtifact: snapshot.packageArtifact,
    callScriptDigest: snapshot.callScript.digest,
    packageApproval: snapshot.packageApproval,
    selectedPhone: snapshot.selectedPhone,
    advisory: snapshot.advisory,
    suppressionSubjectIds: snapshot.suppressionSubjectIds,
    matchingPendingWorkIds: snapshot.matchingPendingWorkIds,
    cancellationDependencyIds: snapshot.cancellationDependencyIds,
    profileAvailable: true,
    prospectApproved: true,
    contactReady: true,
    packageAvailable: true,
    phoneAvailable: true,
    paused: false,
    archived: false,
    highRiskDrift: false,
    suppressionBlocked: false,
    stopReasonIds: [],
    ...patch,
  };
}

async function eligible(manual, candidate, authorityPatch = {}, currentCandidate = candidateInput()) {
  return manual.evaluateSyntheticManualCallEligibility({
    candidateArtifact: candidate,
    currentCandidate,
    currentAuthority: currentAuthority(candidate, authorityPatch),
  });
}

function submission(outcome = "connected", patch = {}) {
  const doNotCall = outcome === "do_not_call";
  return {
    id: "synthetic-call-outcome",
    activityId: "synthetic-call-activity",
    suppressionTombstoneId: doNotCall ? "synthetic-call-suppression" : null,
    cancellationRecordId: doNotCall ? "synthetic-call-cancellation" : null,
    operatorAttestationId: "synthetic-operator-attestation",
    outcome,
    notes: `Synthetic operator note for ${outcome}.`,
    submittedAt: NOW + 300,
    ...patch,
  };
}

function emptyDurableState() {
  return { suppressionRecord: null, cancellationRecord: null, activityRecord: null };
}

async function outcomeDecision(manual, candidate, eligibilityDecision, outcome = "connected", patch = {}) {
  return manual.evaluateSyntheticManualCallOutcome({
    candidateArtifact: candidate,
    eligibilityDecision,
    currentCandidate: candidateInput(),
    currentAuthority: currentAuthority(candidate, { evaluatedAt: NOW + 400 }),
    submission: submission(outcome),
    durableState: emptyDurableState(),
    ...patch,
  });
}

test("manual-call candidates bind canonical Package-derived script and remain immutable zero-effect", async () => {
  const { vite, manual } = await load();
  try {
    const first = await manual.buildSyntheticManualCallCandidate(candidateInput());
    const second = await manual.buildSyntheticManualCallCandidate(candidateInput({
      suppressionSubjectIds: [...candidateInput().suppressionSubjectIds].reverse(),
      matchingPendingWorkIds: [...candidateInput().matchingPendingWorkIds].reverse(),
      cancellationDependencyIds: [...candidateInput().cancellationDependencyIds].reverse(),
    }));
    assert.equal(first.digest, second.digest);
    assert.equal(first.kind, "synthetic_manual_call_candidate");
    assert.equal(first.snapshot.callScript.opening, packageInput().recommendedAngle);
    assert.deepEqual(first.snapshot.callScript.evidenceHashes, [B, C]);
    assert.equal(first.snapshot.selectedPhone.normalizedNumber, "+14165550123");
    assert.equal(first.snapshot.selectedPhone.verificationEvidenceDigest, A);
    assert.equal(first.snapshot.selectedPhone.sourceReferenceDigest, C);
    assert.equal(first.phoneTargetAuthorized, false);
    assert.equal(first.activityPersistenceAuthorized, false);
    assert.equal(first.suppressionPersistenceAuthorized, false);
    assert.equal(first.followUpCreationAuthorized, false);
    assert.equal(first.phoneEffectAuthorized, false);
    assert.deepEqual(first.effects, ZERO_EFFECTS);
    assert.equal(Object.isFrozen(first), true);
    assert.equal(Object.isFrozen(first.snapshot.callScript), true);
    assert.equal(Object.isFrozen(first.snapshot.selectedPhone), true);
  } finally {
    await vite.close();
  }
});

test("only the selected fresh source-verified fictional business phone can form a candidate", async () => {
  const { vite, manual } = await load();
  try {
    for (const value of [
      candidateInput({ selectedPhoneId: "synthetic-other-phone" }),
      candidateInput({ package: packageInput({ selectedContactPoints: [{
        ...packageInput().selectedContactPoints[0], kind: "email", value: "phone@example.invalid",
      }] }) }),
      candidateInput({ package: packageInput({ selectedContactPoints: [{
        ...packageInput().selectedContactPoints[0], verificationClass: "mailbox_verified",
      }] }) }),
      candidateInput({ phoneVerification: { ...candidateInput().phoneVerification, verificationClass: "mailbox_verified" } }),
      candidateInput({ phoneVerification: { ...candidateInput().phoneVerification, method: "mailbox_verification" } }),
      candidateInput({ phoneVerification: { ...candidateInput().phoneVerification, freshUntil: NOW + 9_999 } }),
      candidateInput({ package: packageInput({ selectedContactPoints: [{
        ...packageInput().selectedContactPoints[0], value: "+14165551234",
      }] }) }),
      candidateInput({ package: packageInput({
        recommendedAngle: "Synthetic contact real-person@example.com.",
      }) }),
    ]) {
      await assert.rejects(() => manual.buildSyntheticManualCallCandidate(value), /synthetic_manual_call_candidate_invalid/);
    }
  } finally {
    await vite.close();
  }
});

test("a complete current tuple projects eligibility but no phone target, activity, or effect", async () => {
  const { vite, manual } = await load();
  try {
    const candidate = await manual.buildSyntheticManualCallCandidate(candidateInput());
    const decision = await eligible(manual, candidate);
    assert.equal(decision.status, "synthetic_manual_call_eligible_no_authority");
    assert.equal(decision.eligibleForManualCall, true);
    assert.equal(decision.phoneTargetProjection, null);
    assert.equal(decision.activityProjection, null);
    assert.deepEqual(decision.scriptProjection, candidate.snapshot.callScript);
    assert.equal(decision.phoneTargetAuthorized, false);
    assert.equal(decision.activityPersistenceAuthorized, false);
    assert.equal(decision.phoneEffectAuthorized, false);
    assert.deepEqual(decision.effects, ZERO_EFFECTS);
    assert.equal(Object.isFrozen(decision), true);
  } finally {
    await vite.close();
  }
});

test("eligibility expires exactly at phone, package-approval, and advisory boundaries", async () => {
  const { vite, manual } = await load();
  try {
    const candidate = await manual.buildSyntheticManualCallCandidate(candidateInput());
    for (const [evaluatedAt, expected] of [
      [candidate.snapshot.selectedPhone.freshUntil, "verified_phone_stale"],
      [candidate.snapshot.packageApproval.expiresAt, "package_approval_expired"],
      [candidate.snapshot.advisory.expiresAt, "advisory_acknowledgement_expired"],
    ]) {
      const decision = await eligible(manual, candidate, { evaluatedAt });
      assert.equal(decision.status, "synthetic_manual_call_rejected");
      assert.equal(decision.reasonCodes.includes(expected), true, expected);
      assert.equal(decision.phoneTargetProjection, null);
      assert.deepEqual(decision.effects, ZERO_EFFECTS);
    }
  } finally {
    await vite.close();
  }
});

test("every scope, artifact, approval, phone, advisory, availability, and stop mismatch fails closed", async () => {
  const { vite, manual } = await load();
  try {
    const candidate = await manual.buildSyntheticManualCallCandidate(candidateInput());
    const cases = [
      ["workspace_scope_mismatch", { workspaceId: "synthetic-other-workspace" }],
      ["company_scope_mismatch", { companyId: "synthetic-other-company" }],
      ["prospect_scope_mismatch", { prospectId: "synthetic-other-prospect" }],
      ["contact_scope_mismatch", { contactId: "synthetic-other-contact" }],
      ["organization_scope_mismatch", { organizationId: "synthetic-other-organization" }],
      ["profile_configuration_changed", { profileConfigurationDigest: C }],
      ["package_artifact_changed", { packageArtifact: { ...candidate.snapshot.packageArtifact, digest: C } }],
      ["call_script_changed", { callScriptDigest: C }],
      ["package_approval_changed", { packageApproval: { ...candidate.snapshot.packageApproval, id: "synthetic-other-approval" } }],
      ["package_approval_inactive", { packageApproval: { ...candidate.snapshot.packageApproval, active: false } }],
      ["verified_phone_changed", { selectedPhone: { ...candidate.snapshot.selectedPhone, id: "synthetic-other-phone" } }],
      ["verified_phone_changed", { selectedPhone: { ...candidate.snapshot.selectedPhone, verificationEvidenceDigest: C } }],
      ["suppression_subject_set_changed", { suppressionSubjectIds: ["synthetic-subject-company"] }],
      ["matching_work_set_changed", { matchingPendingWorkIds: [] }],
      ["cancellation_dependency_set_changed", { cancellationDependencyIds: ["synthetic-dependency-stop"] }],
      ["profile_unavailable", { profileAvailable: false }],
      ["prospect_not_approved", { prospectApproved: false }],
      ["contact_not_ready", { contactReady: false }],
      ["package_unavailable", { packageAvailable: false }],
      ["phone_unavailable", { phoneAvailable: false }],
      ["outreach_paused", { paused: true }],
      ["outreach_archived", { archived: true }],
      ["high_risk_drift", { highRiskDrift: true }],
      ["suppression_blocked", { suppressionBlocked: true }],
      ["stop_rule_active", { stopReasonIds: ["synthetic-stop-reply"] }],
    ];
    for (const [reason, patch] of cases) {
      const decision = await eligible(manual, candidate, patch);
      assert.equal(decision.status, "synthetic_manual_call_rejected", reason);
      assert.equal(decision.reasonCodes.includes(reason), true, reason);
      assert.equal(decision.phoneTargetProjection, null, reason);
      assert.equal(decision.phoneEffectAuthorized, false, reason);
    }
  } finally {
    await vite.close();
  }
});

test("a changed current Package or candidate cannot reuse historical eligibility", async () => {
  const { vite, manual } = await load();
  try {
    const candidate = await manual.buildSyntheticManualCallCandidate(candidateInput());
    const changedPackage = packageInput({ recommendedAngle: "Synthetic changed package opening." });
    const decision = await eligible(manual, candidate, {}, candidateInput({ package: changedPackage }));
    assert.equal(decision.status, "synthetic_manual_call_rejected");
    assert.deepEqual(decision.reasonCodes, ["manual_call_candidate_changed"]);
    assert.equal(decision.phoneTargetProjection, null);
  } finally {
    await vite.close();
  }
});

test("exactly six bounded reasoned manual outcomes are accepted", async () => {
  const { vite, manual } = await load();
  try {
    const candidate = await manual.buildSyntheticManualCallCandidate(candidateInput());
    const eligibilityDecision = await eligible(manual, candidate);
    for (const value of ["connected", "voicemail", "no_answer", "wrong_number", "do_not_call", "follow_up"]) {
      const decision = await outcomeDecision(manual, candidate, eligibilityDecision, value);
      assert.equal(decision.status, "synthetic_manual_call_outcome_commit_required_no_authority", value);
      assert.equal(decision.outcome, value);
      assert.equal(decision.activityPersistenceAuthorized, false);
      assert.equal(decision.suppressionPersistenceAuthorized, false);
      assert.equal(decision.followUpCreationAuthorized, false);
      assert.equal(decision.phoneEffectAuthorized, false);
      assert.deepEqual(decision.effects, ZERO_EFFECTS);
    }
    await assert.rejects(
      () => outcomeDecision(manual, candidate, eligibilityDecision, "busy"),
      /synthetic_manual_call_outcome_invalid/,
    );
    await assert.rejects(
      () => outcomeDecision(manual, candidate, eligibilityDecision, "connected", {
        submission: submission("connected", { notes: "not synthetic" }),
      }),
      /synthetic_manual_call_outcome_invalid/,
    );
    await assert.rejects(
      () => outcomeDecision(manual, candidate, eligibilityDecision, "connected", {
        submission: submission("connected", { notes: "Synthetic contact real-person@example.com." }),
      }),
      /synthetic_manual_call_outcome_invalid/,
    );
  } finally {
    await vite.close();
  }
});

test("outcome modeling requires the exact branded prior eligible decision", async () => {
  const { vite, manual } = await load();
  try {
    const candidate = await manual.buildSyntheticManualCallCandidate(candidateInput());
    const eligibilityDecision = await eligible(manual, candidate);
    await assert.rejects(
      () => outcomeDecision(manual, candidate, { ...eligibilityDecision }),
      /synthetic_manual_call_outcome_invalid/,
    );
    const blocked = await eligible(manual, candidate, { suppressionBlocked: true });
    await assert.rejects(
      () => outcomeDecision(manual, candidate, blocked),
      /synthetic_manual_call_outcome_invalid/,
    );
  } finally {
    await vite.close();
  }
});

test("ordinary outcomes require only an exact activity record and replay immutably", async () => {
  const { vite, manual } = await load();
  try {
    const candidate = await manual.buildSyntheticManualCallCandidate(candidateInput());
    const eligibilityDecision = await eligible(manual, candidate);
    const pending = await outcomeDecision(manual, candidate, eligibilityDecision, "voicemail");
    assert.deepEqual(pending.requiredOrderedSteps, ["record_manual_call_activity"]);
    assert.equal(pending.activityProjection.id, "synthetic-call-activity");
    assert.equal(typeof pending.activityProjection.notesDigest, "string");
    assert.equal("notes" in pending.activityProjection, false);
    const recordedAt = NOW + 350;
    const durable = await outcomeDecision(manual, candidate, eligibilityDecision, "voicemail", {
      durableState: {
        suppressionRecord: null,
        cancellationRecord: null,
        activityRecord: {
          id: "synthetic-call-activity",
          outcomeIntentDigest: pending.outcomeIntentDigest,
          candidateDigest: candidate.digest,
          outcome: "voicemail",
          notesDigest: pending.activityProjection.notesDigest,
          recordedAt,
        },
      },
    });
    assert.equal(durable.status, "synthetic_manual_call_outcome_already_durable_no_authority");
    assert.deepEqual(durable.requiredOrderedSteps, []);
    assert.deepEqual(durable.effects, ZERO_EFFECTS);
  } finally {
    await vite.close();
  }
});

test("do_not_call requires suppression then exact cancellation then activity", async () => {
  const { vite, manual } = await load();
  try {
    const candidate = await manual.buildSyntheticManualCallCandidate(candidateInput());
    const eligibilityDecision = await eligible(manual, candidate);
    const pending = await outcomeDecision(manual, candidate, eligibilityDecision, "do_not_call");
    assert.deepEqual(pending.requiredOrderedSteps, [
      "append_exact_phone_suppression",
      "cancel_matching_pending_or_unleased_work",
      "record_manual_call_activity",
    ]);
    assert.deepEqual(pending.requiredSuppressionSubject, {
      kind: "exact_phone", value: "+14165550123", channel: "phone",
    });
    assert.deepEqual(pending.requiredCancellationWorkIds, ["synthetic-work-a", "synthetic-work-b"]);
    const durable = await outcomeDecision(manual, candidate, eligibilityDecision, "do_not_call", {
      durableState: {
        suppressionRecord: {
          id: "synthetic-call-suppression",
          outcomeIntentDigest: pending.outcomeIntentDigest,
          subject: pending.requiredSuppressionSubject,
          recordedAt: NOW + 320,
        },
        cancellationRecord: {
          id: "synthetic-call-cancellation",
          outcomeIntentDigest: pending.outcomeIntentDigest,
          workIds: ["synthetic-work-a", "synthetic-work-b"],
          recordedAt: NOW + 330,
        },
        activityRecord: {
          id: "synthetic-call-activity",
          outcomeIntentDigest: pending.outcomeIntentDigest,
          candidateDigest: candidate.digest,
          outcome: "do_not_call",
          notesDigest: pending.activityProjection.notesDigest,
          recordedAt: NOW + 340,
        },
      },
    });
    assert.equal(durable.status, "synthetic_manual_call_outcome_already_durable_no_authority");
    assert.equal(durable.suppressionPrecedesActivity, true);
    assert.deepEqual(durable.effects, ZERO_EFFECTS);
  } finally {
    await vite.close();
  }
});

test("do_not_call still requires an exact empty cancellation receipt when no work matches", async () => {
  const { vite, manual } = await load();
  try {
    const input = candidateInput({ matchingPendingWorkIds: [] });
    const candidate = await manual.buildSyntheticManualCallCandidate(input);
    const eligibilityDecision = await eligible(manual, candidate, {}, input);
    const pending = await manual.evaluateSyntheticManualCallOutcome({
      candidateArtifact: candidate,
      eligibilityDecision,
      currentCandidate: input,
      currentAuthority: currentAuthority(candidate, { evaluatedAt: NOW + 400 }),
      submission: submission("do_not_call"),
      durableState: emptyDurableState(),
    });
    assert.deepEqual(pending.requiredCancellationWorkIds, []);
    assert.deepEqual(pending.requiredOrderedSteps, [
      "append_exact_phone_suppression",
      "cancel_matching_pending_or_unleased_work",
      "record_manual_call_activity",
    ]);
  } finally {
    await vite.close();
  }
});

test("partial, mismatched, future, and out-of-order do_not_call records reject", async () => {
  const { vite, manual } = await load();
  try {
    const candidate = await manual.buildSyntheticManualCallCandidate(candidateInput());
    const eligibilityDecision = await eligible(manual, candidate);
    const pending = await outcomeDecision(manual, candidate, eligibilityDecision, "do_not_call");
    const complete = {
      suppressionRecord: {
        id: "synthetic-call-suppression",
        outcomeIntentDigest: pending.outcomeIntentDigest,
        subject: pending.requiredSuppressionSubject,
        recordedAt: NOW + 320,
      },
      cancellationRecord: {
        id: "synthetic-call-cancellation",
        outcomeIntentDigest: pending.outcomeIntentDigest,
        workIds: pending.requiredCancellationWorkIds,
        recordedAt: NOW + 330,
      },
      activityRecord: {
        id: "synthetic-call-activity",
        outcomeIntentDigest: pending.outcomeIntentDigest,
        candidateDigest: candidate.digest,
        outcome: "do_not_call",
        notesDigest: pending.activityProjection.notesDigest,
        recordedAt: NOW + 340,
      },
    };
    const cases = [
      ["partial_manual_call_outcome_state", { ...complete, activityRecord: null }],
      ["suppression_record_mismatch", { ...complete, suppressionRecord: { ...complete.suppressionRecord, id: "synthetic-other-suppression" } }],
      ["cancellation_work_set_mismatch", { ...complete, cancellationRecord: { ...complete.cancellationRecord, workIds: [] } }],
      ["activity_record_mismatch", { ...complete, activityRecord: { ...complete.activityRecord, outcome: "connected" } }],
      ["cancellation_precedes_suppression", { ...complete, cancellationRecord: { ...complete.cancellationRecord, recordedAt: NOW + 310 } }],
      ["activity_precedes_cancellation", { ...complete, activityRecord: { ...complete.activityRecord, recordedAt: NOW + 325 } }],
      ["activity_record_time_invalid", { ...complete, activityRecord: { ...complete.activityRecord, recordedAt: NOW + 500 } }],
    ];
    for (const [reason, durableState] of cases) {
      const decision = await outcomeDecision(manual, candidate, eligibilityDecision, "do_not_call", { durableState });
      assert.equal(decision.status, "synthetic_manual_call_outcome_rejected", reason);
      assert.equal(decision.reasonCodes.includes(reason), true, reason);
      assert.equal(decision.suppressionPrecedesActivity, false, reason);
      assert.deepEqual(decision.effects, ZERO_EFFECTS, reason);
    }
  } finally {
    await vite.close();
  }
});

test("follow_up is only a new-version requirement and every current stop predicate blocks it", async () => {
  const { vite, manual } = await load();
  try {
    const candidate = await manual.buildSyntheticManualCallCandidate(candidateInput());
    const eligibilityDecision = await eligible(manual, candidate);
    const pending = await outcomeDecision(manual, candidate, eligibilityDecision, "follow_up");
    assert.equal(pending.newFollowUpVersionRequired, true);
    assert.deepEqual(pending.requiredOrderedSteps, [
      "record_manual_call_activity",
      "require_new_follow_up_version_and_approval",
    ]);
    assert.equal(pending.followUpCreationAuthorized, false);
    for (const [reason, authorityPatch] of [
      ["suppression_blocked", { suppressionBlocked: true }],
      ["outreach_paused", { paused: true }],
      ["outreach_archived", { archived: true }],
      ["high_risk_drift", { highRiskDrift: true }],
      ["stop_rule_active", { stopReasonIds: ["synthetic-stop-reply"] }],
    ]) {
      const decision = await outcomeDecision(manual, candidate, eligibilityDecision, "follow_up", {
        currentAuthority: currentAuthority(candidate, { evaluatedAt: NOW + 400, ...authorityPatch }),
      });
      assert.equal(decision.status, "synthetic_manual_call_outcome_rejected", reason);
      assert.equal(decision.reasonCodes.includes(reason), true, reason);
      assert.equal(decision.followUpCreationAuthorized, false, reason);
    }
  } finally {
    await vite.close();
  }
});

test("non-follow-up outcomes remain loggable after a stop without granting any new action", async () => {
  const { vite, manual } = await load();
  try {
    const candidate = await manual.buildSyntheticManualCallCandidate(candidateInput());
    const eligibilityDecision = await eligible(manual, candidate);
    const decision = await outcomeDecision(manual, candidate, eligibilityDecision, "connected", {
      currentAuthority: currentAuthority(candidate, {
        evaluatedAt: NOW + 400,
        suppressionBlocked: true,
        paused: true,
        stopReasonIds: ["synthetic-stop-reply"],
      }),
    });
    assert.equal(decision.status, "synthetic_manual_call_outcome_commit_required_no_authority");
    assert.equal(decision.newFollowUpVersionRequired, false);
    assert.equal(decision.phoneTargetAuthorized, false);
    assert.equal(decision.activityPersistenceAuthorized, false);
    assert.deepEqual(decision.effects, ZERO_EFFECTS);
  } finally {
    await vite.close();
  }
});

test("real-looking phones, forged brands, raw target fields, accessors, proxies, and extras fail closed", async () => {
  const { vite, manual } = await load();
  try {
    await assert.rejects(
      () => manual.buildSyntheticManualCallCandidate(candidateInput({
        package: packageInput({ selectedContactPoints: [{
          ...packageInput().selectedContactPoints[0], value: "+14165551234",
        }] }),
      })),
      /synthetic_manual_call_candidate_invalid/,
    );
    await assert.rejects(
      () => manual.buildSyntheticManualCallCandidate({ ...candidateInput(), phoneTarget: "forbidden" }),
      /synthetic_manual_call_candidate_invalid/,
    );
    await assert.rejects(
      () => manual.buildSyntheticManualCallCandidate(Object.defineProperty(candidateInput(), "selectedPhoneId", {
        enumerable: true, get() { throw new Error("accessed"); },
      })),
      /synthetic_manual_call_candidate_invalid/,
    );
    await assert.rejects(
      () => manual.buildSyntheticManualCallCandidate(new Proxy(candidateInput(), { ownKeys() { throw new Error("proxied"); } })),
      /synthetic_manual_call_candidate_invalid/,
    );
    const candidate = await manual.buildSyntheticManualCallCandidate(candidateInput());
    await assert.rejects(
      () => manual.evaluateSyntheticManualCallEligibility({
        candidateArtifact: { ...candidate },
        currentCandidate: candidateInput(),
        currentAuthority: currentAuthority(candidate),
      }),
      /synthetic_manual_call_eligibility_invalid/,
    );
    const eligibilityDecision = await eligible(manual, candidate);
    await assert.rejects(
      () => outcomeDecision(manual, candidate, eligibilityDecision, "connected", {
        submission: { ...submission("connected"), phoneTarget: "forbidden" },
      }),
      /synthetic_manual_call_outcome_invalid/,
    );
  } finally {
    await vite.close();
  }
});
