import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createServer } from "vite";

const NOW = 1_900_000_700_000;
const A = "a".repeat(64);
const B = "b".repeat(64);
const C = "c".repeat(64);
const D = "d".repeat(64);
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
      audit: await vite.ssrLoadModule(new URL("../preparation/outreach-audit-envelope.ts", import.meta.url).pathname),
      manual: await vite.ssrLoadModule(new URL("../preparation/manual-call-decision.ts", import.meta.url).pathname),
    };
  } catch (error) {
    await vite.close();
    throw error;
  }
}

function envelopeInput(patch = {}) {
  return {
    id: "synthetic-audit-envelope",
    recordId: "synthetic-audit-record",
    workspaceId: "synthetic-workspace",
    companyId: "synthetic-company",
    actor: { kind: "synthetic_owner", id: "synthetic-owner" },
    action: "manual_call_outcome_decision",
    subject: { kind: "manual_call_outcome", id: "synthetic-call-outcome", digest: A },
    resultCode: "synthetic_manual_call_outcome_commit_required_no_authority",
    reasonCodes: ["suppression_blocked", "outreach_paused"],
    beforeStateDigest: B,
    afterStateDigest: C,
    decisionDigest: D,
    operationDigest: A,
    policy: {
      id: "synthetic-audit-policy",
      digest: B,
      reasonCodeRegistryDigest: C,
    },
    dependencyDigests: [D, A],
    fence: null,
    occurredAt: NOW,
    ...patch,
  };
}

function authority(artifact, patch = {}) {
  const snapshot = artifact.snapshot;
  return {
    evaluatedAt: NOW + 100,
    workspaceId: snapshot.workspaceId,
    companyId: snapshot.companyId,
    actor: snapshot.actor,
    action: snapshot.action,
    subject: snapshot.subject,
    resultCode: snapshot.resultCode,
    reasonCodes: snapshot.reasonCodes,
    beforeStateDigest: snapshot.beforeStateDigest,
    afterStateDigest: snapshot.afterStateDigest,
    decisionDigest: snapshot.decisionDigest,
    operationDigest: snapshot.operationDigest,
    policy: snapshot.policy,
    dependencyDigests: snapshot.dependencyDigests,
    fence: snapshot.fence,
    auditAvailable: true,
    actorAuthorized: true,
    eventCurrent: true,
    existingRecord: null,
    ...patch,
  };
}

async function evaluate(audit, artifact, authorityPatch = {}, currentEnvelope = envelopeInput()) {
  return audit.evaluateSyntheticOutreachAuditAppend({
    envelopeArtifact: artifact,
    currentEnvelope,
    currentAuthority: authority(artifact, authorityPatch),
  });
}

const ACTION_CASES = [
  ["package_approval_decision", "outreach_package", "synthetic_owner", null],
  ["message_approval_decision", "outreach_message", "synthetic_owner", null],
  ["dispatch_recheck_decision", "dispatch_intent", "synthetic_system", { leaseGeneration: 4, dispatchKeyDigest: D }],
  ["originated_stop_decision", "originated_event", "synthetic_system", null],
  ["delivery_unknown_decision", "delivery_attempt", "synthetic_system", { leaseGeneration: 4, dispatchKeyDigest: D }],
  ["suppression_before_success_decision", "suppression_intent", "synthetic_public", null],
  ["manual_call_eligibility_decision", "manual_call_candidate", "synthetic_owner", null],
  ["manual_call_outcome_decision", "manual_call_outcome", "synthetic_owner", null],
];

function actionInput(action, subjectKind, actorKind, fence, patch = {}) {
  return envelopeInput({
    actor: { kind: actorKind, id: `synthetic-${actorKind.replace("synthetic_", "")}` },
    action,
    subject: { kind: subjectKind, id: "synthetic-subject", digest: A },
    fence,
    ...patch,
  });
}

test("audit envelopes are deterministic, deeply frozen, minimized, and zero-effect", async () => {
  const { vite, audit } = await load();
  try {
    const first = await audit.buildSyntheticOutreachAuditEnvelope(envelopeInput());
    const second = await audit.buildSyntheticOutreachAuditEnvelope(envelopeInput({
      reasonCodes: [...envelopeInput().reasonCodes].reverse(),
      dependencyDigests: [...envelopeInput().dependencyDigests].reverse(),
    }));
    assert.equal(first.digest, second.digest);
    assert.equal(first.kind, "synthetic_outreach_audit_envelope");
    assert.deepEqual(first.snapshot.reasonCodes, ["outreach_paused", "suppression_blocked"]);
    assert.deepEqual(first.snapshot.dependencyDigests, [A, D]);
    assert.equal(first.auditPersistenceAuthorized, false);
    assert.equal(first.loggerInvocationAuthorized, false);
    assert.equal(first.externalSinkAuthorized, false);
    assert.equal(first.providerInvocationAuthorized, false);
    assert.deepEqual(first.effects, ZERO_EFFECTS);
    assert.equal(Object.isFrozen(first), true);
    assert.equal(Object.isFrozen(first.snapshot), true);
    assert.equal(Object.isFrozen(first.snapshot.actor), true);
    assert.equal(Object.isFrozen(first.snapshot.subject), true);
    assert.equal("details" in first.snapshot, false);
    assert.equal("body" in first.snapshot, false);
    assert.equal("notes" in first.snapshot, false);
    assert.equal("contact" in first.snapshot, false);
  } finally {
    await vite.close();
  }
});

test("each closed action admits only its exact subject, actor, and fence shape", async () => {
  const { vite, audit } = await load();
  try {
    for (const [action, subjectKind, actorKind, fence] of ACTION_CASES) {
      const artifact = await audit.buildSyntheticOutreachAuditEnvelope(actionInput(action, subjectKind, actorKind, fence));
      assert.equal(artifact.snapshot.action, action);
      assert.equal(artifact.snapshot.subject.kind, subjectKind);
      assert.equal(artifact.snapshot.actor.kind, actorKind);
      assert.deepEqual(artifact.snapshot.fence, fence);
    }
  } finally {
    await vite.close();
  }
});

test("wrong action-subject, actor, missing fence, and unexpected fence combinations reject", async () => {
  const { vite, audit } = await load();
  try {
    for (const value of [
      actionInput("manual_call_outcome_decision", "outreach_message", "synthetic_owner", null),
      actionInput("manual_call_outcome_decision", "manual_call_outcome", "synthetic_system", null),
      actionInput("dispatch_recheck_decision", "dispatch_intent", "synthetic_system", null),
      actionInput("package_approval_decision", "outreach_package", "synthetic_owner", { leaseGeneration: 1, dispatchKeyDigest: A }),
      actionInput("suppression_before_success_decision", "suppression_intent", "synthetic_public", { leaseGeneration: 1, dispatchKeyDigest: A }),
    ]) {
      await assert.rejects(
        () => audit.buildSyntheticOutreachAuditEnvelope(value),
        /synthetic_outreach_audit_envelope_invalid/,
      );
    }
  } finally {
    await vite.close();
  }
});

test("a complete current tuple projects an append without authorizing a log or write", async () => {
  const { vite, audit } = await load();
  try {
    const artifact = await audit.buildSyntheticOutreachAuditEnvelope(envelopeInput());
    const decision = await evaluate(audit, artifact);
    assert.equal(decision.status, "synthetic_audit_append_required_no_authority");
    assert.deepEqual(decision.reasonCodes, []);
    assert.deepEqual(decision.auditRecordProjection, {
      id: "synthetic-audit-record",
      envelopeDigest: artifact.digest,
      workspaceId: "synthetic-workspace",
      companyId: "synthetic-company",
      actorKind: "synthetic_owner",
      actorId: "synthetic-owner",
      action: "manual_call_outcome_decision",
      subjectKind: "manual_call_outcome",
      subjectId: "synthetic-call-outcome",
      subjectDigest: A,
      resultCode: envelopeInput().resultCode,
      occurredAt: NOW,
    });
    assert.equal(decision.auditPersistenceAuthorized, false);
    assert.equal(decision.loggerInvocationAuthorized, false);
    assert.equal(decision.externalSinkAuthorized, false);
    assert.equal(decision.providerInvocationAuthorized, false);
    assert.deepEqual(decision.effects, ZERO_EFFECTS);
    assert.equal(Object.isFrozen(decision), true);
  } finally {
    await vite.close();
  }
});

test("an exact existing audit record replays while changed content cannot", async () => {
  const { vite, audit } = await load();
  try {
    const artifact = await audit.buildSyntheticOutreachAuditEnvelope(envelopeInput());
    const existingRecord = {
      id: "synthetic-audit-record",
      envelopeDigest: artifact.digest,
      workspaceId: "synthetic-workspace",
      action: "manual_call_outcome_decision",
      subjectId: "synthetic-call-outcome",
      recordedAt: NOW + 50,
    };
    const replay = await evaluate(audit, artifact, { existingRecord });
    assert.equal(replay.status, "synthetic_audit_already_durable_no_authority");
    assert.deepEqual(replay.requiredOrderedSteps, []);
    for (const [reason, record] of [
      ["audit_record_mismatch", { ...existingRecord, envelopeDigest: B }],
      ["audit_record_mismatch", { ...existingRecord, subjectId: "synthetic-other-subject" }],
      ["audit_record_time_invalid", { ...existingRecord, recordedAt: NOW - 1 }],
      ["audit_record_time_invalid", { ...existingRecord, recordedAt: NOW + 200 }],
    ]) {
      const decision = await evaluate(audit, artifact, { existingRecord: record });
      assert.equal(decision.status, "synthetic_audit_rejected", reason);
      assert.equal(decision.reasonCodes.includes(reason), true, reason);
      assert.equal(decision.auditPersistenceAuthorized, false, reason);
    }
  } finally {
    await vite.close();
  }
});

test("every current scope, actor, subject, decision, policy, dependency, and fence mismatch rejects", async () => {
  const { vite, audit } = await load();
  try {
    const input = actionInput(
      "dispatch_recheck_decision",
      "dispatch_intent",
      "synthetic_system",
      { leaseGeneration: 4, dispatchKeyDigest: D },
    );
    const artifact = await audit.buildSyntheticOutreachAuditEnvelope(input);
    const cases = [
      ["workspace_scope_mismatch", { workspaceId: "synthetic-other-workspace" }],
      ["company_scope_mismatch", { companyId: "synthetic-other-company" }],
      ["actor_binding_changed", { actor: { ...artifact.snapshot.actor, id: "synthetic-other-system" } }],
      ["action_changed", { action: "originated_stop_decision" }],
      ["subject_binding_changed", { subject: { ...artifact.snapshot.subject, digest: B } }],
      ["result_code_changed", { resultCode: "synthetic_other_result" }],
      ["reason_code_set_changed", { reasonCodes: [] }],
      ["before_state_changed", { beforeStateDigest: C }],
      ["after_state_changed", { afterStateDigest: D }],
      ["decision_digest_changed", { decisionDigest: A }],
      ["operation_digest_changed", { operationDigest: B }],
      ["audit_policy_changed", { policy: { ...artifact.snapshot.policy, digest: D } }],
      ["dependency_digest_set_changed", { dependencyDigests: [A] }],
      ["fence_binding_changed", { fence: { leaseGeneration: 5, dispatchKeyDigest: D } }],
    ];
    for (const [reason, patch] of cases) {
      const decision = await audit.evaluateSyntheticOutreachAuditAppend({
        envelopeArtifact: artifact,
        currentEnvelope: input,
        currentAuthority: authority(artifact, patch),
      });
      assert.equal(decision.status, "synthetic_audit_rejected", reason);
      assert.equal(decision.reasonCodes.includes(reason), true, reason);
      assert.deepEqual(decision.effects, ZERO_EFFECTS, reason);
    }
  } finally {
    await vite.close();
  }
});

test("audit availability, actor authorization, current event, and time all fail closed", async () => {
  const { vite, audit } = await load();
  try {
    const artifact = await audit.buildSyntheticOutreachAuditEnvelope(envelopeInput());
    for (const [reason, patch] of [
      ["audit_unavailable", { auditAvailable: false }],
      ["actor_unauthorized", { actorAuthorized: false }],
      ["event_not_current", { eventCurrent: false }],
      ["evaluation_precedes_event", { evaluatedAt: NOW - 1 }],
    ]) {
      const decision = await evaluate(audit, artifact, patch);
      assert.equal(decision.status, "synthetic_audit_rejected", reason);
      assert.equal(decision.reasonCodes.includes(reason), true, reason);
    }
  } finally {
    await vite.close();
  }
});

test("changed envelope content cannot reuse a historical artifact", async () => {
  const { vite, audit } = await load();
  try {
    const artifact = await audit.buildSyntheticOutreachAuditEnvelope(envelopeInput());
    const decision = await evaluate(audit, artifact, {}, envelopeInput({ decisionDigest: A }));
    assert.equal(decision.status, "synthetic_audit_rejected");
    assert.equal(decision.reasonCodes.includes("audit_envelope_changed"), true);
  } finally {
    await vite.close();
  }
});

test("only synthetic IDs, digests, bounded codes, and timestamps are admitted", async () => {
  const { vite, audit } = await load();
  try {
    for (const value of [
      { ...envelopeInput(), notes: "Synthetic raw note" },
      { ...envelopeInput(), body: "Synthetic body" },
      { ...envelopeInput(), email: "person@example.com" },
      envelopeInput({ actor: { kind: "synthetic_owner", id: "real-owner" } }),
      envelopeInput({ resultCode: "Contains raw prose" }),
      envelopeInput({ reasonCodes: ["bad-code"] }),
      envelopeInput({ reasonCodes: ["password"] }),
      envelopeInput({ decisionDigest: "not-a-digest" }),
      envelopeInput({ dependencyDigests: [A, A] }),
    ]) {
      await assert.rejects(
        () => audit.buildSyntheticOutreachAuditEnvelope(value),
        /synthetic_outreach_audit_envelope_invalid/,
      );
    }
  } finally {
    await vite.close();
  }
});

test("manual-call outcome intent can contribute digests without exposing its note or phone", async () => {
  const { vite, audit, manual } = await load();
  try {
    const candidateRaw = manualCandidateInput();
    const candidate = await manual.buildSyntheticManualCallCandidate(candidateRaw);
    const eligibility = await manual.evaluateSyntheticManualCallEligibility({
      candidateArtifact: candidate,
      currentCandidate: candidateRaw,
      currentAuthority: manualAuthority(candidate),
    });
    const outcome = await manual.evaluateSyntheticManualCallOutcome({
      candidateArtifact: candidate,
      eligibilityDecision: eligibility,
      currentCandidate: candidateRaw,
      currentAuthority: manualAuthority(candidate, { evaluatedAt: NOW + 400 }),
      submission: {
        id: "synthetic-call-outcome",
        activityId: "synthetic-call-activity",
        suppressionTombstoneId: null,
        cancellationRecordId: null,
        operatorAttestationId: "synthetic-operator-attestation",
        outcome: "connected",
        notes: "Synthetic operator note.",
        submittedAt: NOW + 300,
      },
      durableState: { suppressionRecord: null, cancellationRecord: null, activityRecord: null },
    });
    const artifact = await audit.buildSyntheticOutreachAuditEnvelope(envelopeInput({
      subject: { kind: "manual_call_outcome", id: "synthetic-call-outcome", digest: candidate.digest },
      decisionDigest: outcome.outcomeIntentDigest,
      operationDigest: outcome.outcomeIntentDigest,
      reasonCodes: outcome.reasonCodes,
      resultCode: outcome.status,
    }));
    const serialized = JSON.stringify(artifact);
    assert.equal(serialized.includes("Synthetic operator note"), false);
    assert.equal(serialized.includes("+14165550123"), false);
    assert.equal(serialized.includes("@"), false);
    assert.equal(artifact.snapshot.decisionDigest, outcome.outcomeIntentDigest);
    assert.deepEqual(artifact.effects, ZERO_EFFECTS);
  } finally {
    await vite.close();
  }
});

test("forged brands, accessors, proxies, sparse arrays, and extras fail closed", async () => {
  const { vite, audit } = await load();
  try {
    const accessor = Object.defineProperty(envelopeInput(), "decisionDigest", {
      enumerable: true,
      get() { throw new Error("accessed"); },
    });
    for (const value of [
      accessor,
      new Proxy(envelopeInput(), { ownKeys() { throw new Error("proxied"); } }),
      envelopeInput({ reasonCodes: [, "suppression_blocked"] }),
      { ...envelopeInput(), unexpected: true },
    ]) {
      await assert.rejects(
        () => audit.buildSyntheticOutreachAuditEnvelope(value),
        /synthetic_outreach_audit_envelope_invalid/,
      );
    }
    const artifact = await audit.buildSyntheticOutreachAuditEnvelope(envelopeInput());
    await assert.rejects(
      () => audit.evaluateSyntheticOutreachAuditAppend({
        envelopeArtifact: { ...artifact },
        currentEnvelope: envelopeInput(),
        currentAuthority: authority(artifact),
      }),
      /synthetic_outreach_audit_decision_invalid/,
    );
  } finally {
    await vite.close();
  }
});

test("the audit preparation module has no logger, database, network, or runtime composition seam", async () => {
  const source = await readFile(new URL("../preparation/outreach-audit-envelope.ts", import.meta.url), "utf8");
  for (const forbidden of ["fetch(", "console.", ".prepare(", "INSERT INTO", "logger.", "writeFile("]) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
  assert.equal(source.includes("auditPersistenceAuthorized: false"), true);
  assert.equal(source.includes("loggerInvocationAuthorized: false"), true);
  assert.equal(source.includes("externalSinkAuthorized: false"), true);
});

function manualPackage() {
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
    recommendedAngle: "Synthetic opening grounded in evidence.",
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
  };
}

function manualCandidateInput() {
  return {
    id: "synthetic-manual-call-candidate",
    callSessionId: "synthetic-call-session",
    organizationId: "synthetic-organization",
    package: manualPackage(),
    packageApproval: { id: "synthetic-package-approval", approvedAt: NOW - 500, expiresAt: NOW + 8_000 },
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
    suppressionSubjectIds: ["synthetic-subject-phone", "synthetic-subject-company"],
    matchingPendingWorkIds: [],
    cancellationDependencyIds: ["synthetic-dependency-stop"],
    createdAt: NOW,
  };
}

function manualAuthority(candidate, patch = {}) {
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
