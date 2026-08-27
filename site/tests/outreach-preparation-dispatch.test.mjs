import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";

const NOW = 1_900_000_200_000;
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
    dispatch: await vite.ssrLoadModule(new URL("../preparation/outreach-dispatch-decision.ts", import.meta.url).pathname),
    artifacts: await vite.ssrLoadModule(new URL("../preparation/outreach-artifacts.ts", import.meta.url).pathname),
  };
}

function candidateInput(patch = {}) {
  return {
    id: "synthetic-dispatch-candidate",
    workspaceId: "synthetic-workspace",
    companyId: "synthetic-company",
    prospectId: "synthetic-prospect",
    contactId: "synthetic-contact",
    outboxItemId: "synthetic-outbox-item",
    dispatchKey: "synthetic-dispatch-key",
    profileConfigurationId: "synthetic-profile-configuration",
    profileConfigurationDigest: A,
    packageApprovalId: "synthetic-package-approval",
    packageApprovalExpiresAt: NOW + 8_000,
    messageApprovalId: "synthetic-message-approval",
    messageApprovalExpiresAt: NOW + 7_000,
    senderConnectionId: "synthetic-sender-connection",
    senderIdentityId: "synthetic-sender-identity",
    unsubscribeVersionId: "synthetic-unsubscribe-version",
    complianceAcknowledgementId: "synthetic-compliance-acknowledgement",
    basisPolicyVersionId: "synthetic-basis-policy",
    packageArtifact: { id: "synthetic-package", digest: B },
    messageArtifact: {
      id: "synthetic-message-a",
      digest: C,
      packageId: "synthetic-package",
      packageDigest: B,
    },
    suppressionSubjectIds: ["synthetic-subject-phone", "synthetic-subject-company"],
    stopDependencyIds: ["synthetic-stop-thread", "synthetic-stop-profile"],
    lease: {
      id: "synthetic-lease",
      holderId: "synthetic-worker",
      generation: 7,
      acquiredAt: NOW,
      expiresAt: NOW + 10_000,
    },
    createdAt: NOW,
    ...patch,
  };
}

function currentAuthority(patch = {}) {
  return {
    evaluatedAt: NOW + 100,
    workspaceId: "synthetic-workspace",
    companyId: "synthetic-company",
    prospectId: "synthetic-prospect",
    contactId: "synthetic-contact",
    outboxItemId: "synthetic-outbox-item",
    dispatchKey: "synthetic-dispatch-key",
    itemState: "leased",
    lease: {
      id: "synthetic-lease",
      holderId: "synthetic-worker",
      generation: 7,
      expiresAt: NOW + 10_000,
    },
    packageArtifact: { id: "synthetic-package", digest: B },
    messageArtifact: {
      id: "synthetic-message-a",
      digest: C,
      packageId: "synthetic-package",
      packageDigest: B,
    },
    profileConfigurationId: "synthetic-profile-configuration",
    profileConfigurationDigest: A,
    packageApprovalId: "synthetic-package-approval",
    packageApprovalExpiresAt: NOW + 8_000,
    messageApprovalId: "synthetic-message-approval",
    messageApprovalExpiresAt: NOW + 7_000,
    senderConnectionId: "synthetic-sender-connection",
    senderIdentityId: "synthetic-sender-identity",
    unsubscribeVersionId: "synthetic-unsubscribe-version",
    complianceAcknowledgementId: "synthetic-compliance-acknowledgement",
    basisPolicyVersionId: "synthetic-basis-policy",
    suppressionSubjectIds: ["synthetic-subject-company", "synthetic-subject-phone"],
    stopDependencyIds: ["synthetic-stop-profile", "synthetic-stop-thread"],
    packageApprovalValid: true,
    messageApprovalValid: true,
    artifactValidityValid: true,
    profileAvailable: true,
    prospectApproved: true,
    contactReady: true,
    senderConnectionAvailable: true,
    senderIdentityVerified: true,
    unsubscribeAvailable: true,
    complianceAcknowledged: true,
    basisAllowed: true,
    availabilityActive: true,
    highRiskDrift: false,
    suppressionBlocked: false,
    stopRuleActive: false,
    approvalConsumedForItem: true,
    providerAttemptCount: 0,
    deliveryState: "not_attempted",
    ...patch,
  };
}

test("canonical dispatch lease candidates are deterministic, immutable, minimized, and zero-effect", async () => {
  const { vite, dispatch } = await load();
  try {
    const first = await dispatch.buildSyntheticDispatchLeaseCandidate(candidateInput());
    const permuted = await dispatch.buildSyntheticDispatchLeaseCandidate(candidateInput({
      suppressionSubjectIds: [...candidateInput().suppressionSubjectIds].reverse(),
      stopDependencyIds: [...candidateInput().stopDependencyIds].reverse(),
    }));
    assert.equal(first.digest, permuted.digest);
    assert.match(first.digest, /^[a-f0-9]{64}$/u);
    assert.equal(Object.isFrozen(first), true);
    assert.equal(Object.isFrozen(first.snapshot.lease), true);
    assert.deepEqual(first.effects, ZERO_EFFECTS);
    assert.equal(first.providerInvocationAuthorized, false);
    assert.equal("body" in first.snapshot, false);
    assert.equal("recipient" in first.snapshot, false);
    assert.equal("provider" in first.snapshot, false);
  } finally {
    await vite.close();
  }
});

test("a complete current synthetic recheck can pass without granting or invoking an effect", async () => {
  const { vite, dispatch } = await load();
  try {
    const candidate = await dispatch.buildSyntheticDispatchLeaseCandidate(candidateInput());
    const decision = await dispatch.evaluateSyntheticFinalDispatch({
      candidate,
      currentCandidate: candidateInput(),
      currentAuthority: currentAuthority(),
    });
    assert.equal(decision.status, "synthetic_recheck_passed_no_authority");
    assert.equal(decision.wouldPassFutureBoundary, true);
    assert.equal(decision.providerInvocationAuthorized, false);
    assert.deepEqual(decision.reasonCodes, []);
    assert.deepEqual(decision.effects, ZERO_EFFECTS);
    assert.equal(Object.isFrozen(decision), true);
  } finally {
    await vite.close();
  }
});

test("every final-dispatch authority or lease failure is named and remains zero-effect", async () => {
  const { vite, dispatch } = await load();
  try {
    const candidate = await dispatch.buildSyntheticDispatchLeaseCandidate(candidateInput());
    const cases = [
      ["dispatch_candidate_changed", {}, candidateInput({ dispatchKey: "synthetic-changed-key" })],
      ["workspace_scope_mismatch", { workspaceId: "synthetic-other-workspace" }],
      ["company_scope_mismatch", { companyId: "synthetic-other-company" }],
      ["prospect_scope_mismatch", { prospectId: "synthetic-other-prospect" }],
      ["contact_scope_mismatch", { contactId: "synthetic-other-contact" }],
      ["outbox_item_mismatch", { outboxItemId: "synthetic-other-outbox" }],
      ["dispatch_key_mismatch", { dispatchKey: "synthetic-other-key" }],
      ["item_not_leased", { itemState: "pending" }],
      ["lease_id_mismatch", { lease: { ...currentAuthority().lease, id: "synthetic-other-lease" } }],
      ["lease_holder_mismatch", { lease: { ...currentAuthority().lease, holderId: "synthetic-other-worker" } }],
      ["lease_generation_mismatch", { lease: { ...currentAuthority().lease, generation: 8 } }],
      ["lease_expired", { evaluatedAt: NOW + 10_000 }],
      ["package_artifact_changed", { packageArtifact: { id: "synthetic-package", digest: A } }],
      ["message_artifact_changed", { messageArtifact: { ...currentAuthority().messageArtifact, digest: A } }],
      ["message_package_binding_changed", { messageArtifact: { ...currentAuthority().messageArtifact, packageDigest: A } }],
      ["profile_configuration_changed", { profileConfigurationDigest: B }],
      ["package_approval_changed", { packageApprovalId: "synthetic-other-package-approval" }],
      ["message_approval_changed", { messageApprovalId: "synthetic-other-message-approval" }],
      ["package_approval_expired", { evaluatedAt: NOW + 8_000 }],
      ["message_approval_expired", { evaluatedAt: NOW + 7_000 }],
      ["sender_connection_changed", { senderConnectionId: "synthetic-other-connection" }],
      ["sender_identity_changed", { senderIdentityId: "synthetic-other-identity" }],
      ["unsubscribe_authority_changed", { unsubscribeVersionId: "synthetic-other-unsubscribe" }],
      ["compliance_authority_changed", { complianceAcknowledgementId: "synthetic-other-acknowledgement" }],
      ["basis_authority_changed", { basisPolicyVersionId: "synthetic-other-basis-policy" }],
      ["suppression_subject_set_changed", { suppressionSubjectIds: ["synthetic-subject-company"] }],
      ["stop_dependency_set_changed", { stopDependencyIds: ["synthetic-stop-profile"] }],
      ["package_approval_invalid", { packageApprovalValid: false }],
      ["message_approval_invalid", { messageApprovalValid: false }],
      ["artifact_validity_invalid", { artifactValidityValid: false }],
      ["profile_unavailable", { profileAvailable: false }],
      ["prospect_not_approved", { prospectApproved: false }],
      ["contact_not_ready", { contactReady: false }],
      ["sender_connection_unavailable", { senderConnectionAvailable: false }],
      ["sender_identity_unverified", { senderIdentityVerified: false }],
      ["unsubscribe_unavailable", { unsubscribeAvailable: false }],
      ["compliance_unacknowledged", { complianceAcknowledged: false }],
      ["basis_not_allowed", { basisAllowed: false }],
      ["availability_blocked", { availabilityActive: false }],
      ["high_risk_drift", { highRiskDrift: true }],
      ["suppression_blocked", { suppressionBlocked: true }],
      ["stop_rule_active", { stopRuleActive: true }],
      ["approval_not_consumed", { approvalConsumedForItem: false }],
      ["provider_attempt_already_recorded", { providerAttemptCount: 1 }],
      ["delivery_state_not_dispatchable", { deliveryState: "delivery_unknown" }],
    ];
    for (const [reason, authorityPatch, currentCandidate = candidateInput()] of cases) {
      const decision = await dispatch.evaluateSyntheticFinalDispatch({
        candidate,
        currentCandidate,
        currentAuthority: currentAuthority(authorityPatch),
      });
      assert.equal(decision.reasonCodes.includes(reason), true, reason);
      assert.equal(decision.wouldPassFutureBoundary, false, reason);
      assert.equal(decision.providerInvocationAuthorized, false, reason);
      assert.deepEqual(decision.effects, ZERO_EFFECTS, reason);
    }
  } finally {
    await vite.close();
  }
});

test("candidate digest binds every dispatch, artifact, dependency, and lease field", async () => {
  const { vite, dispatch } = await load();
  try {
    const baseline = await dispatch.buildSyntheticDispatchLeaseCandidate(candidateInput());
    const mutations = [
      (value) => { value.dispatchKey = "synthetic-changed-key"; },
      (value) => { value.profileConfigurationDigest = B; },
      (value) => { value.messageApprovalId = "synthetic-changed-message-approval"; },
      (value) => { value.senderConnectionId = "synthetic-changed-connection"; },
      (value) => { value.complianceAcknowledgementId = "synthetic-changed-acknowledgement"; },
      (value) => { value.packageArtifact.digest = A; value.messageArtifact.packageDigest = A; },
      (value) => { value.messageArtifact.digest = A; },
      (value) => { value.suppressionSubjectIds = ["synthetic-subject-company"]; },
      (value) => { value.stopDependencyIds = ["synthetic-stop-thread"]; },
      (value) => { value.lease.generation += 1; },
      (value) => { value.lease.expiresAt += 1; },
      (value) => { value.createdAt -= 1; },
    ];
    for (const mutate of mutations) {
      const changed = structuredClone(candidateInput());
      mutate(changed);
      const artifact = await dispatch.buildSyntheticDispatchLeaseCandidate(changed);
      assert.notEqual(artifact.digest, baseline.digest);
    }
  } finally {
    await vite.close();
  }
});

test("canonical outreach artifacts can supply the minimized candidate references without composing runtime", async () => {
  const { vite, dispatch, artifacts } = await load();
  try {
    const packageArtifact = await artifacts.buildSyntheticOutreachPackage({
      id: "synthetic-package", workspaceId: "synthetic-workspace", companyId: "synthetic-company",
      prospectId: "synthetic-prospect", contactId: "synthetic-contact",
      profileConfigurationId: "synthetic-profile-configuration", profileConfigurationDigest: A,
      qualificationEvidenceHashes: [A], sourceHashes: [B],
      recommendedAngle: "Synthetic dispatch fixture", claimGuardrailVersionIds: ["synthetic-guardrail"],
      selectedContactPoints: [{ id: "synthetic-email-point", kind: "email", value: "prospect@example.invalid", verificationClass: "mailbox_verified", freshUntil: NOW + 20_000 }],
      messageVersionIds: ["synthetic-message-a"], createdAt: NOW,
    });
    const messageArtifact = await artifacts.buildSyntheticMessageVersion({
      id: "synthetic-message-a", packageId: packageArtifact.id, packageDigest: packageArtifact.digest,
      profileConfigurationId: "synthetic-profile-configuration", profileConfigurationDigest: A,
      sender: { from: "owner@example.invalid", replyTo: "owner@example.invalid" },
      recipients: { to: ["prospect@example.invalid"], cc: [], bcc: [] },
      subject: "[SYNTHETIC] Dispatch fixture", textBody: "Synthetic local fixture.", htmlBody: "<p>Synthetic local fixture.</p>",
      links: [], attachments: [], threadId: null, replyToMessageId: null,
      intendedSendAt: NOW + 1_000, timezone: "UTC",
    });
    const candidate = await dispatch.buildSyntheticDispatchLeaseCandidate(candidateInput({
      packageArtifact: { id: packageArtifact.id, digest: packageArtifact.digest },
      messageArtifact: { id: messageArtifact.id, digest: messageArtifact.digest, packageId: messageArtifact.packageId, packageDigest: messageArtifact.packageDigest },
    }));
    assert.equal(candidate.snapshot.packageArtifact.digest, packageArtifact.digest);
    assert.equal(candidate.snapshot.messageArtifact.digest, messageArtifact.digest);
    assert.deepEqual(candidate.effects, ZERO_EFFECTS);
  } finally {
    await vite.close();
  }
});

test("malformed, real-looking, accessor, sparse, duplicate, extra, and forged inputs fail closed", async () => {
  const { vite, dispatch } = await load();
  try {
    await assert.rejects(
      dispatch.buildSyntheticDispatchLeaseCandidate(candidateInput({ workspaceId: "real-workspace" })),
      /synthetic_dispatch_candidate_invalid/,
    );
    await assert.rejects(
      dispatch.buildSyntheticDispatchLeaseCandidate(candidateInput({ suppressionSubjectIds: ["synthetic-subject-company", "synthetic-subject-company"] })),
      /synthetic_dispatch_candidate_invalid/,
    );
    await assert.rejects(
      dispatch.buildSyntheticDispatchLeaseCandidate(candidateInput({ stopDependencyIds: new Array(1) })),
      /synthetic_dispatch_candidate_invalid/,
    );
    const accessor = candidateInput();
    Object.defineProperty(accessor.lease, "generation", { enumerable: true, get() { throw new Error("must-not-run"); } });
    await assert.rejects(dispatch.buildSyntheticDispatchLeaseCandidate(accessor), /synthetic_dispatch_candidate_invalid/);
    const candidate = await dispatch.buildSyntheticDispatchLeaseCandidate(candidateInput());
    await assert.rejects(
      dispatch.evaluateSyntheticFinalDispatch({
        candidate: { ...candidate },
        currentCandidate: candidateInput(),
        currentAuthority: currentAuthority(),
      }),
      /synthetic_dispatch_decision_invalid/,
    );
    await assert.rejects(
      dispatch.evaluateSyntheticFinalDispatch({
        candidate,
        currentCandidate: candidateInput(),
        currentAuthority: { ...currentAuthority(), extra: true },
      }),
      /synthetic_dispatch_decision_invalid/,
    );
  } finally {
    await vite.close();
  }
});
