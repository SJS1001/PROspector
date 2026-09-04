type Effects = Readonly<{
  providerCalls: 0;
  outboxMutations: 0;
  sendInvocations: 0;
  callInvocations: 0;
  exportMutations: 0;
  durableMutations: 0;
}>;

type Artifact = Readonly<{ id: string; digest: string }>;
type MessageArtifact = Readonly<Artifact & { packageId: string; packageDigest: string }>;
type Lease = Readonly<{ id: string; holderId: string; generation: number; acquiredAt: number; expiresAt: number }>;
type CandidateSnapshot = Readonly<{
  id: string;
  workspaceId: string;
  companyId: string;
  prospectId: string;
  contactId: string;
  outboxItemId: string;
  dispatchKey: string;
  profileConfigurationId: string;
  profileConfigurationDigest: string;
  packageApprovalId: string;
  packageApprovalExpiresAt: number;
  messageApprovalId: string;
  messageApprovalExpiresAt: number;
  senderConnectionId: string;
  senderIdentityId: string;
  unsubscribeVersionId: string;
  complianceAcknowledgementId: string;
  basisPolicyVersionId: string;
  packageArtifact: Artifact;
  messageArtifact: MessageArtifact;
  suppressionSubjectIds: readonly string[];
  stopDependencyIds: readonly string[];
  lease: Lease;
  createdAt: number;
}>;

export type SyntheticDispatchLeaseCandidate = Readonly<{
  kind: "synthetic_dispatch_lease_candidate";
  id: string;
  digest: string;
  snapshot: CandidateSnapshot;
  providerInvocationAuthorized: false;
  effects: Effects;
}>;

const SYNTHETIC_ID = /^synthetic-[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/u;
const DIGEST = /^[a-f0-9]{64}$/u;
const candidateArtifacts = new WeakSet<object>();
const ZERO_EFFECTS: Effects = deepFreeze({
  providerCalls: 0,
  outboxMutations: 0,
  sendInvocations: 0,
  callInvocations: 0,
  exportMutations: 0,
  durableMutations: 0,
});

/**
 * Produces a minimized synthetic lease candidate. This is not an outbox row,
 * capability, provider envelope, state transition, or invocation authority.
 */
export async function buildSyntheticDispatchLeaseCandidate(value: unknown): Promise<SyntheticDispatchLeaseCandidate> {
  try {
    const snapshot = normalizeCandidate(value);
    const artifact: SyntheticDispatchLeaseCandidate = deepFreeze({
      kind: "synthetic_dispatch_lease_candidate",
      id: snapshot.id,
      digest: await sha256(JSON.stringify(snapshot)),
      snapshot,
      providerInvocationAuthorized: false,
      effects: ZERO_EFFECTS,
    });
    candidateArtifacts.add(artifact);
    return artifact;
  } catch {
    throw new Error("synthetic_dispatch_candidate_invalid");
  }
}

/**
 * Models the last future dispatch fence as a pure projection. Passing means
 * only that the synthetic tuple is internally current; it never grants a call.
 */
export async function evaluateSyntheticFinalDispatch(value: unknown) {
  try {
    const input = exactRecord(value, ["candidate", "currentCandidate", "currentAuthority"]);
    if (!candidateArtifacts.has(input.candidate as object)) invalid();
    const candidate = input.candidate as SyntheticDispatchLeaseCandidate;
    const currentCandidate = await buildSyntheticDispatchLeaseCandidate(input.currentCandidate);
    const current = normalizeCurrentAuthority(input.currentAuthority);
    const snapshot = candidate.snapshot;
    const reasons: string[] = [];

    if (currentCandidate.digest !== candidate.digest) reasons.push("dispatch_candidate_changed");
    if (current.workspaceId !== snapshot.workspaceId) reasons.push("workspace_scope_mismatch");
    if (current.companyId !== snapshot.companyId) reasons.push("company_scope_mismatch");
    if (current.prospectId !== snapshot.prospectId) reasons.push("prospect_scope_mismatch");
    if (current.contactId !== snapshot.contactId) reasons.push("contact_scope_mismatch");
    if (current.outboxItemId !== snapshot.outboxItemId) reasons.push("outbox_item_mismatch");
    if (current.dispatchKey !== snapshot.dispatchKey) reasons.push("dispatch_key_mismatch");
    if (current.itemState !== "leased") reasons.push("item_not_leased");
    if (current.lease.id !== snapshot.lease.id) reasons.push("lease_id_mismatch");
    if (current.lease.holderId !== snapshot.lease.holderId) reasons.push("lease_holder_mismatch");
    if (current.lease.generation !== snapshot.lease.generation) reasons.push("lease_generation_mismatch");
    if (current.lease.expiresAt !== snapshot.lease.expiresAt) reasons.push("lease_expiry_mismatch");
    if (current.evaluatedAt >= current.lease.expiresAt || current.evaluatedAt >= snapshot.lease.expiresAt) reasons.push("lease_expired");
    if (!sameArtifact(current.packageArtifact, snapshot.packageArtifact)) reasons.push("package_artifact_changed");
    if (current.messageArtifact.id !== snapshot.messageArtifact.id
      || current.messageArtifact.digest !== snapshot.messageArtifact.digest) reasons.push("message_artifact_changed");
    if (current.messageArtifact.packageId !== current.packageArtifact.id
      || current.messageArtifact.packageDigest !== current.packageArtifact.digest
      || current.messageArtifact.packageId !== snapshot.messageArtifact.packageId
      || current.messageArtifact.packageDigest !== snapshot.messageArtifact.packageDigest) {
      reasons.push("message_package_binding_changed");
    }
    if (current.profileConfigurationId !== snapshot.profileConfigurationId
      || current.profileConfigurationDigest !== snapshot.profileConfigurationDigest) reasons.push("profile_configuration_changed");
    if (current.packageApprovalId !== snapshot.packageApprovalId
      || current.packageApprovalExpiresAt !== snapshot.packageApprovalExpiresAt) reasons.push("package_approval_changed");
    if (current.messageApprovalId !== snapshot.messageApprovalId
      || current.messageApprovalExpiresAt !== snapshot.messageApprovalExpiresAt) reasons.push("message_approval_changed");
    if (current.evaluatedAt >= current.packageApprovalExpiresAt) reasons.push("package_approval_expired");
    if (current.evaluatedAt >= current.messageApprovalExpiresAt) reasons.push("message_approval_expired");
    if (current.senderConnectionId !== snapshot.senderConnectionId) reasons.push("sender_connection_changed");
    if (current.senderIdentityId !== snapshot.senderIdentityId) reasons.push("sender_identity_changed");
    if (current.unsubscribeVersionId !== snapshot.unsubscribeVersionId) reasons.push("unsubscribe_authority_changed");
    if (current.complianceAcknowledgementId !== snapshot.complianceAcknowledgementId) reasons.push("compliance_authority_changed");
    if (current.basisPolicyVersionId !== snapshot.basisPolicyVersionId) reasons.push("basis_authority_changed");
    if (!sameStrings(current.suppressionSubjectIds, snapshot.suppressionSubjectIds)) reasons.push("suppression_subject_set_changed");
    if (!sameStrings(current.stopDependencyIds, snapshot.stopDependencyIds)) reasons.push("stop_dependency_set_changed");
    if (!current.packageApprovalValid) reasons.push("package_approval_invalid");
    if (!current.messageApprovalValid) reasons.push("message_approval_invalid");
    if (!current.artifactValidityValid) reasons.push("artifact_validity_invalid");
    if (!current.profileAvailable) reasons.push("profile_unavailable");
    if (!current.prospectApproved) reasons.push("prospect_not_approved");
    if (!current.contactReady) reasons.push("contact_not_ready");
    if (!current.senderConnectionAvailable) reasons.push("sender_connection_unavailable");
    if (!current.senderIdentityVerified) reasons.push("sender_identity_unverified");
    if (!current.unsubscribeAvailable) reasons.push("unsubscribe_unavailable");
    if (!current.complianceAcknowledged) reasons.push("compliance_unacknowledged");
    if (!current.basisAllowed) reasons.push("basis_not_allowed");
    if (!current.availabilityActive) reasons.push("availability_blocked");
    if (current.highRiskDrift) reasons.push("high_risk_drift");
    if (current.suppressionBlocked) reasons.push("suppression_blocked");
    if (current.stopRuleActive) reasons.push("stop_rule_active");
    if (!current.approvalConsumedForItem) reasons.push("approval_not_consumed");
    if (current.providerAttemptCount !== 0) reasons.push("provider_attempt_already_recorded");
    if (current.deliveryState !== "not_attempted") reasons.push("delivery_state_not_dispatchable");

    const reasonCodes = [...new Set(reasons)].sort();
    return deepFreeze({
      kind: "synthetic_final_dispatch_decision" as const,
      status: reasonCodes.length === 0 ? "synthetic_recheck_passed_no_authority" as const : "synthetic_recheck_rejected" as const,
      wouldPassFutureBoundary: reasonCodes.length === 0,
      providerInvocationAuthorized: false as const,
      candidateId: candidate.id,
      candidateDigest: candidate.digest,
      leaseGeneration: snapshot.lease.generation,
      reasonCodes,
      effects: ZERO_EFFECTS,
    });
  } catch {
    throw new Error("synthetic_dispatch_decision_invalid");
  }
}

function normalizeCandidate(value: unknown): CandidateSnapshot {
  const input = exactRecord(value, [
    "id", "workspaceId", "companyId", "prospectId", "contactId", "outboxItemId", "dispatchKey",
    "profileConfigurationId", "profileConfigurationDigest", "packageApprovalId", "packageApprovalExpiresAt",
    "messageApprovalId", "messageApprovalExpiresAt", "senderConnectionId", "senderIdentityId", "unsubscribeVersionId",
    "complianceAcknowledgementId", "basisPolicyVersionId", "packageArtifact", "messageArtifact",
    "suppressionSubjectIds", "stopDependencyIds", "lease", "createdAt",
  ]);
  const packageArtifact = artifact(input.packageArtifact);
  const messageArtifact = message(input.messageArtifact);
  if (messageArtifact.packageId !== packageArtifact.id || messageArtifact.packageDigest !== packageArtifact.digest) invalid();
  const leaseInput = exactRecord(input.lease, ["id", "holderId", "generation", "acquiredAt", "expiresAt"]);
  const lease: Lease = {
    id: syntheticId(leaseInput.id),
    holderId: syntheticId(leaseInput.holderId),
    generation: positiveInteger(leaseInput.generation),
    acquiredAt: timestamp(leaseInput.acquiredAt),
    expiresAt: timestamp(leaseInput.expiresAt),
  };
  const createdAt = timestamp(input.createdAt);
  const packageApprovalExpiresAt = timestamp(input.packageApprovalExpiresAt);
  const messageApprovalExpiresAt = timestamp(input.messageApprovalExpiresAt);
  if (createdAt > lease.acquiredAt
    || lease.expiresAt <= lease.acquiredAt
    || packageApprovalExpiresAt <= createdAt
    || messageApprovalExpiresAt <= createdAt
    || messageApprovalExpiresAt > packageApprovalExpiresAt) invalid();
  return deepFreeze({
    id: syntheticId(input.id),
    workspaceId: syntheticId(input.workspaceId),
    companyId: syntheticId(input.companyId),
    prospectId: syntheticId(input.prospectId),
    contactId: syntheticId(input.contactId),
    outboxItemId: syntheticId(input.outboxItemId),
    dispatchKey: syntheticId(input.dispatchKey),
    profileConfigurationId: syntheticId(input.profileConfigurationId),
    profileConfigurationDigest: digest(input.profileConfigurationDigest),
    packageApprovalId: syntheticId(input.packageApprovalId),
    packageApprovalExpiresAt,
    messageApprovalId: syntheticId(input.messageApprovalId),
    messageApprovalExpiresAt,
    senderConnectionId: syntheticId(input.senderConnectionId),
    senderIdentityId: syntheticId(input.senderIdentityId),
    unsubscribeVersionId: syntheticId(input.unsubscribeVersionId),
    complianceAcknowledgementId: syntheticId(input.complianceAcknowledgementId),
    basisPolicyVersionId: syntheticId(input.basisPolicyVersionId),
    packageArtifact,
    messageArtifact,
    suppressionSubjectIds: sortedUnique(input.suppressionSubjectIds, 1, 32),
    stopDependencyIds: sortedUnique(input.stopDependencyIds, 1, 64),
    lease,
    createdAt,
  });
}

function normalizeCurrentAuthority(value: unknown) {
  const input = exactRecord(value, [
    "evaluatedAt", "workspaceId", "companyId", "prospectId", "contactId", "outboxItemId", "dispatchKey", "itemState",
    "lease", "packageArtifact", "messageArtifact", "profileConfigurationId", "profileConfigurationDigest",
    "packageApprovalId", "packageApprovalExpiresAt", "messageApprovalId", "messageApprovalExpiresAt",
    "senderConnectionId", "senderIdentityId", "unsubscribeVersionId", "complianceAcknowledgementId",
    "basisPolicyVersionId", "suppressionSubjectIds", "stopDependencyIds",
    "packageApprovalValid", "messageApprovalValid", "artifactValidityValid", "profileAvailable", "prospectApproved",
    "contactReady", "senderConnectionAvailable", "senderIdentityVerified", "unsubscribeAvailable",
    "complianceAcknowledged", "basisAllowed", "availabilityActive", "highRiskDrift", "suppressionBlocked",
    "stopRuleActive", "approvalConsumedForItem", "providerAttemptCount", "deliveryState",
  ]);
  const leaseInput = exactRecord(input.lease, ["id", "holderId", "generation", "expiresAt"]);
  const itemState = enumValue(input.itemState, ["pending", "leased", "dispatching", "sent", "cancelled", "failed_before_dispatch", "delivery_unknown"] as const);
  const deliveryState = enumValue(input.deliveryState, ["not_attempted", "sent", "failed_before_dispatch", "delivery_unknown"] as const);
  return deepFreeze({
    evaluatedAt: timestamp(input.evaluatedAt),
    workspaceId: syntheticId(input.workspaceId),
    companyId: syntheticId(input.companyId),
    prospectId: syntheticId(input.prospectId),
    contactId: syntheticId(input.contactId),
    outboxItemId: syntheticId(input.outboxItemId),
    dispatchKey: syntheticId(input.dispatchKey),
    itemState,
    lease: {
      id: syntheticId(leaseInput.id),
      holderId: syntheticId(leaseInput.holderId),
      generation: positiveInteger(leaseInput.generation),
      expiresAt: timestamp(leaseInput.expiresAt),
    },
    packageArtifact: artifact(input.packageArtifact),
    messageArtifact: message(input.messageArtifact),
    profileConfigurationId: syntheticId(input.profileConfigurationId),
    profileConfigurationDigest: digest(input.profileConfigurationDigest),
    packageApprovalId: syntheticId(input.packageApprovalId),
    packageApprovalExpiresAt: timestamp(input.packageApprovalExpiresAt),
    messageApprovalId: syntheticId(input.messageApprovalId),
    messageApprovalExpiresAt: timestamp(input.messageApprovalExpiresAt),
    senderConnectionId: syntheticId(input.senderConnectionId),
    senderIdentityId: syntheticId(input.senderIdentityId),
    unsubscribeVersionId: syntheticId(input.unsubscribeVersionId),
    complianceAcknowledgementId: syntheticId(input.complianceAcknowledgementId),
    basisPolicyVersionId: syntheticId(input.basisPolicyVersionId),
    suppressionSubjectIds: sortedUnique(input.suppressionSubjectIds, 1, 32),
    stopDependencyIds: sortedUnique(input.stopDependencyIds, 1, 64),
    packageApprovalValid: booleanValue(input.packageApprovalValid),
    messageApprovalValid: booleanValue(input.messageApprovalValid),
    artifactValidityValid: booleanValue(input.artifactValidityValid),
    profileAvailable: booleanValue(input.profileAvailable),
    prospectApproved: booleanValue(input.prospectApproved),
    contactReady: booleanValue(input.contactReady),
    senderConnectionAvailable: booleanValue(input.senderConnectionAvailable),
    senderIdentityVerified: booleanValue(input.senderIdentityVerified),
    unsubscribeAvailable: booleanValue(input.unsubscribeAvailable),
    complianceAcknowledged: booleanValue(input.complianceAcknowledged),
    basisAllowed: booleanValue(input.basisAllowed),
    availabilityActive: booleanValue(input.availabilityActive),
    highRiskDrift: booleanValue(input.highRiskDrift),
    suppressionBlocked: booleanValue(input.suppressionBlocked),
    stopRuleActive: booleanValue(input.stopRuleActive),
    approvalConsumedForItem: booleanValue(input.approvalConsumedForItem),
    providerAttemptCount: nonNegativeInteger(input.providerAttemptCount),
    deliveryState,
  });
}

function artifact(value: unknown): Artifact {
  const input = exactRecord(value, ["id", "digest"]);
  return deepFreeze({ id: syntheticId(input.id), digest: digest(input.digest) });
}

function message(value: unknown): MessageArtifact {
  const input = exactRecord(value, ["id", "digest", "packageId", "packageDigest"]);
  return deepFreeze({
    id: syntheticId(input.id),
    digest: digest(input.digest),
    packageId: syntheticId(input.packageId),
    packageDigest: digest(input.packageDigest),
  });
}

function exactRecord(value: unknown, expectedKeys: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) invalid();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).some((key) => typeof key !== "string")) invalid();
  if (Object.keys(descriptors).sort().join("\0") !== [...expectedKeys].sort().join("\0")) invalid();
  const output: Record<string, unknown> = {};
  for (const key of expectedKeys) {
    const descriptor = descriptors[key];
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) invalid();
    output[key] = descriptor.value;
  }
  return output;
}

function denseArray(value: unknown, minimum: number, maximum: number): unknown[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (keys.some((key) => typeof key !== "string")) invalid();
  const expected = [...Array(value.length).keys()].map(String);
  const actual = keys.filter((key) => key !== "length");
  if (actual.sort().join("\0") !== expected.sort().join("\0")) invalid();
  return expected.map((key) => {
    const descriptor = descriptors[key];
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) invalid();
    return descriptor.value;
  });
}

function sortedUnique(value: unknown, minimum: number, maximum: number): readonly string[] {
  const entries = denseArray(value, minimum, maximum).map(syntheticId).sort();
  if (new Set(entries).size !== entries.length) invalid();
  return deepFreeze(entries);
}

function sameArtifact(left: Artifact, right: Artifact) {
  return left.id === right.id && left.digest === right.digest;
}

function sameStrings(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && left.every((entry, index) => entry === right[index]);
}

function syntheticId(value: unknown) {
  if (typeof value !== "string" || !SYNTHETIC_ID.test(value)) invalid();
  return value;
}

function digest(value: unknown) {
  if (typeof value !== "string" || !DIGEST.test(value)) invalid();
  return value;
}

function timestamp(value: unknown) {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) invalid();
  return value as number;
}

function positiveInteger(value: unknown) {
  return timestamp(value);
}

function nonNegativeInteger(value: unknown) {
  if (!Number.isSafeInteger(value) || (value as number) < 0) invalid();
  return value as number;
}

function booleanValue(value: unknown) {
  if (typeof value !== "boolean") invalid();
  return value;
}

function enumValue<const T extends readonly string[]>(value: unknown, allowed: T): T[number] {
  if (typeof value !== "string" || !allowed.includes(value)) invalid();
  return value as T[number];
}

async function sha256(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

function invalid(): never {
  throw new Error("invalid");
}
