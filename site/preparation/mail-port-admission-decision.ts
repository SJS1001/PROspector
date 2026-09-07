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
type Lease = Readonly<{
  id: string;
  holderId: string;
  generation: number;
  acquiredAt: number;
  expiresAt: number;
}>;

/**
 * The only representable mail-port shape. Every provider-bearing field is a
 * literal `false`/`0`, so no admitted descriptor can describe a port that is
 * able to transmit. A configured, selected, credential-bearing, endpoint-
 * bearing, or previously invoked descriptor is not a rejected input: it cannot
 * be constructed at all.
 */
type MailPortDescriptor = Readonly<{
  portKind: "provider_neutral_mail_port";
  implementationState: "unconfigured" | "not_selected";
  providerSelected: false;
  credentialReferencePresent: false;
  endpointConfigured: false;
  providerInvocationCount: 0;
  descriptorDigest: string;
}>;

const PORT_STATES = ["unconfigured", "not_selected"] as const;
const FINAL_RECHECK_PASSED = "synthetic_recheck_passed_no_authority";
const PREPARATION_STATES = [
  "prepared_no_invocation",
  "voided_before_invocation",
  "reprepared_no_invocation",
  "absent",
] as const;
const ITEM_STATES = [
  "pending",
  "leased",
  "dispatching",
  "sent",
  "cancelled",
  "failed_before_dispatch",
  "delivery_unknown",
] as const;
const DELIVERY_STATES = [
  "not_attempted",
  "sent",
  "failed_before_dispatch",
  "delivery_unknown",
] as const;
const MANUAL_CALL_STATES = ["absent", "advisory_only", "outcome_recorded"] as const;

type CandidateSnapshot = Readonly<{
  id: string;
  workspaceId: string;
  companyId: string;
  prospectId: string;
  contactId: string;
  outboxItemId: string;
  sendKey: string;
  dispatchKey: string;
  packageArtifact: Artifact;
  messageArtifact: MessageArtifact;
  packageApprovalId: string;
  packageApprovalDigest: string;
  packageApprovalExpiresAt: number;
  messageApprovalId: string;
  messageApprovalDigest: string;
  messageApprovalExpiresAt: number;
  finalRecheckDecisionId: string;
  finalRecheckDecisionDigest: string;
  finalRecheckStatus: typeof FINAL_RECHECK_PASSED;
  preCallReceiptId: string;
  preCallReceiptDigest: string;
  preCallReceiptValidUntil: number;
  preparationId: string;
  preparationDigest: string;
  attemptOrdinal: 1;
  lease: Lease;
  port: MailPortDescriptor;
  manualCallSubstitutesForEmailApproval: false;
  createdAt: number;
}>;

export type SyntheticMailPortAdmissionCandidate = Readonly<{
  kind: "synthetic_mail_port_admission_candidate";
  id: string;
  digest: string;
  snapshot: CandidateSnapshot;
  mailPortResolvable: false;
  providerInvocationAuthorized: false;
  dispatchAuthorized: false;
  automaticRetryAuthorized: false;
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
 * Builds the synthetic seam between an already-prepared, provider-disconnected
 * dispatch attempt and a provider-neutral mail port. It constructs no port, no
 * envelope, no credential reference, and no capability; it is a description of
 * the boundary that a later authorized plan would have to satisfy.
 */
export async function buildSyntheticMailPortAdmissionCandidate(
  value: unknown,
): Promise<SyntheticMailPortAdmissionCandidate> {
  try {
    const snapshot = normalizeCandidate(value);
    const artifact: SyntheticMailPortAdmissionCandidate = deepFreeze({
      kind: "synthetic_mail_port_admission_candidate",
      id: snapshot.id,
      digest: await sha256(JSON.stringify(snapshot)),
      snapshot,
      mailPortResolvable: false,
      providerInvocationAuthorized: false,
      dispatchAuthorized: false,
      automaticRetryAuthorized: false,
      effects: ZERO_EFFECTS,
    });
    candidateArtifacts.add(artifact);
    return artifact;
  } catch {
    throw new Error("synthetic_mail_port_admission_candidate_invalid");
  }
}

/**
 * Rechecks the complete admission tuple immediately before the modelled
 * hand-off to a mail port. A clean tuple is still a denial: the only
 * representable port is unresolvable, so the projected outcome is a definite
 * pre-transmission failure with zero calls and no automatic retry.
 */
export async function evaluateSyntheticMailPortAdmission(value: unknown) {
  try {
    const input = exactRecord(value, ["candidate", "currentCandidate", "currentAuthority"]);
    if (!candidateArtifacts.has(input.candidate as object)) invalid();
    const candidate = input.candidate as SyntheticMailPortAdmissionCandidate;
    const currentCandidate = await buildSyntheticMailPortAdmissionCandidate(input.currentCandidate);
    const current = normalizeCurrentAuthority(input.currentAuthority);
    const snapshot = candidate.snapshot;
    const reasons: string[] = [];

    if (currentCandidate.digest !== candidate.digest) reasons.push("admission_candidate_changed");
    if (current.evaluatedAt < snapshot.createdAt) reasons.push("evaluation_precedes_candidate_creation");

    if (current.workspaceId !== snapshot.workspaceId) reasons.push("workspace_scope_mismatch");
    if (current.companyId !== snapshot.companyId) reasons.push("company_scope_mismatch");
    if (current.prospectId !== snapshot.prospectId) reasons.push("prospect_scope_mismatch");
    if (current.contactId !== snapshot.contactId) reasons.push("contact_scope_mismatch");
    if (current.outboxItemId !== snapshot.outboxItemId) reasons.push("outbox_item_mismatch");
    if (current.sendKey !== snapshot.sendKey) reasons.push("send_key_mismatch");
    if (current.dispatchKey !== snapshot.dispatchKey) reasons.push("dispatch_key_mismatch");

    if (current.itemState !== "leased") reasons.push("item_not_leased");
    if (current.lease.id !== snapshot.lease.id) reasons.push("lease_id_mismatch");
    if (current.lease.holderId !== snapshot.lease.holderId) reasons.push("lease_holder_mismatch");
    if (current.lease.generation !== snapshot.lease.generation) reasons.push("lease_generation_mismatch");
    if (current.lease.expiresAt !== snapshot.lease.expiresAt) reasons.push("lease_expiry_mismatch");
    if (current.evaluatedAt >= current.lease.expiresAt || current.evaluatedAt >= snapshot.lease.expiresAt) {
      reasons.push("lease_expired");
    }

    if (!sameArtifact(current.packageArtifact, snapshot.packageArtifact)) reasons.push("package_artifact_changed");
    if (current.messageArtifact.id !== snapshot.messageArtifact.id
      || current.messageArtifact.digest !== snapshot.messageArtifact.digest) reasons.push("message_artifact_changed");
    if (current.messageArtifact.packageId !== current.packageArtifact.id
      || current.messageArtifact.packageDigest !== current.packageArtifact.digest) {
      reasons.push("message_package_binding_changed");
    }

    if (current.packageApprovalId !== snapshot.packageApprovalId
      || current.packageApprovalDigest !== snapshot.packageApprovalDigest
      || current.packageApprovalExpiresAt !== snapshot.packageApprovalExpiresAt) reasons.push("package_approval_changed");
    if (current.messageApprovalId !== snapshot.messageApprovalId
      || current.messageApprovalDigest !== snapshot.messageApprovalDigest
      || current.messageApprovalExpiresAt !== snapshot.messageApprovalExpiresAt) reasons.push("message_approval_changed");
    if (!current.packageApprovalImmutable) reasons.push("package_approval_not_immutable");
    if (!current.messageApprovalImmutable) reasons.push("message_approval_not_immutable");
    if (current.evaluatedAt >= current.packageApprovalExpiresAt) reasons.push("package_approval_expired");
    if (current.evaluatedAt >= current.messageApprovalExpiresAt) reasons.push("message_approval_expired");

    if (current.finalRecheckDecisionId !== snapshot.finalRecheckDecisionId
      || current.finalRecheckDecisionDigest !== snapshot.finalRecheckDecisionDigest) {
      reasons.push("final_recheck_decision_changed");
    }
    if (current.finalRecheckStatus !== FINAL_RECHECK_PASSED) reasons.push("final_recheck_not_passed");

    if (current.preCallReceiptId !== snapshot.preCallReceiptId
      || current.preCallReceiptDigest !== snapshot.preCallReceiptDigest
      || current.preCallReceiptValidUntil !== snapshot.preCallReceiptValidUntil) {
      reasons.push("pre_call_receipt_changed");
    }
    if (current.evaluatedAt >= current.preCallReceiptValidUntil) reasons.push("pre_call_receipt_expired");

    if (current.preparationId !== snapshot.preparationId
      || current.preparationDigest !== snapshot.preparationDigest) reasons.push("dispatch_preparation_changed");
    if (current.preparationState !== "prepared_no_invocation") reasons.push("dispatch_preparation_not_current");

    if (current.port.descriptorDigest !== snapshot.port.descriptorDigest
      || current.port.implementationState !== snapshot.port.implementationState) {
      reasons.push("mail_port_descriptor_changed");
    }

    if (current.suppressionEffective) reasons.push("suppression_effective_before_success");
    if (!current.suppressionPrecedesSuccessAcknowledgement) {
      reasons.push("suppression_success_ordering_not_preserved");
    }
    if (current.stopRuleActive) reasons.push("stop_rule_active");

    if (current.deliveryState !== "not_attempted") reasons.push("delivery_state_not_dispatchable");
    if (current.providerAttemptCount !== 0) reasons.push("provider_attempt_already_recorded");
    if (current.deliveryUnknownRecorded) reasons.push("delivery_unknown_recorded_no_automatic_retry");

    if (!current.externalEffectsDisabled) reasons.push("external_effects_not_disabled");

    const reasonCodes = deepFreeze([...new Set(reasons)].sort());
    return deepFreeze({
      kind: "synthetic_mail_port_admission_decision" as const,
      status: reasonCodes.length === 0
        ? "synthetic_mail_port_admission_denied_unconfigured_no_authority" as const
        : "synthetic_mail_port_admission_rejected" as const,
      candidateId: candidate.id,
      candidateDigest: candidate.digest,
      leaseGeneration: snapshot.lease.generation,
      attemptOrdinal: snapshot.attemptOrdinal,
      portImplementationState: snapshot.port.implementationState,
      // The single modelled outcome of handing this tuple to the only
      // representable port. It mirrors the domain MailPort definite-failure
      // shape and can never become an acceptance or a delivery-unknown state.
      projectedPortOutcome: "definite_failure_connection_unavailable_before_transmission" as const,
      requestTransmitted: false as const,
      reasonCodes,
      mailPortResolvable: false as const,
      providerInvocationAuthorized: false as const,
      dispatchAuthorized: false as const,
      automaticRetryAuthorized: false as const,
      persistenceAuthorized: false as const,
      successAcknowledgementAuthorized: false as const,
      manualCallAdvisoryOnly: true as const,
      manualCallBranchStatus: current.manualCallBranchStatus,
      effects: ZERO_EFFECTS,
    });
  } catch {
    throw new Error("synthetic_mail_port_admission_decision_invalid");
  }
}

function normalizeCandidate(value: unknown): CandidateSnapshot {
  const input = exactRecord(value, [
    "id", "workspaceId", "companyId", "prospectId", "contactId", "outboxItemId", "sendKey", "dispatchKey",
    "packageArtifact", "messageArtifact", "packageApprovalId", "packageApprovalDigest", "packageApprovalExpiresAt",
    "messageApprovalId", "messageApprovalDigest", "messageApprovalExpiresAt", "finalRecheckDecisionId",
    "finalRecheckDecisionDigest", "finalRecheckStatus", "preCallReceiptId", "preCallReceiptDigest",
    "preCallReceiptValidUntil", "preparationId", "preparationDigest", "attemptOrdinal", "lease", "port",
    "manualCallSubstitutesForEmailApproval", "createdAt",
  ]);
  const packageArtifact = artifactRef(input.packageArtifact);
  const messageArtifact = messageRef(input.messageArtifact);
  if (messageArtifact.packageId !== packageArtifact.id
    || messageArtifact.packageDigest !== packageArtifact.digest) invalid();
  if (input.finalRecheckStatus !== FINAL_RECHECK_PASSED) invalid();
  if (input.attemptOrdinal !== 1) invalid();
  if (input.manualCallSubstitutesForEmailApproval !== false) invalid();

  const lease = normalizeLease(input.lease);
  const createdAt = timestamp(input.createdAt);
  const packageApprovalExpiresAt = timestamp(input.packageApprovalExpiresAt);
  const messageApprovalExpiresAt = timestamp(input.messageApprovalExpiresAt);
  const preCallReceiptValidUntil = timestamp(input.preCallReceiptValidUntil);
  if (createdAt > lease.acquiredAt) invalid();
  if (packageApprovalExpiresAt <= createdAt || messageApprovalExpiresAt <= createdAt) invalid();
  if (messageApprovalExpiresAt > packageApprovalExpiresAt) invalid();
  // A pre-call receipt can never outlive the lease generation that produced it.
  if (preCallReceiptValidUntil <= lease.acquiredAt || preCallReceiptValidUntil > lease.expiresAt) invalid();

  return deepFreeze({
    id: syntheticId(input.id),
    workspaceId: syntheticId(input.workspaceId),
    companyId: syntheticId(input.companyId),
    prospectId: syntheticId(input.prospectId),
    contactId: syntheticId(input.contactId),
    outboxItemId: syntheticId(input.outboxItemId),
    sendKey: syntheticId(input.sendKey),
    dispatchKey: syntheticId(input.dispatchKey),
    packageArtifact,
    messageArtifact,
    packageApprovalId: syntheticId(input.packageApprovalId),
    packageApprovalDigest: digest(input.packageApprovalDigest),
    packageApprovalExpiresAt,
    messageApprovalId: syntheticId(input.messageApprovalId),
    messageApprovalDigest: digest(input.messageApprovalDigest),
    messageApprovalExpiresAt,
    finalRecheckDecisionId: syntheticId(input.finalRecheckDecisionId),
    finalRecheckDecisionDigest: digest(input.finalRecheckDecisionDigest),
    finalRecheckStatus: FINAL_RECHECK_PASSED,
    preCallReceiptId: syntheticId(input.preCallReceiptId),
    preCallReceiptDigest: digest(input.preCallReceiptDigest),
    preCallReceiptValidUntil,
    preparationId: syntheticId(input.preparationId),
    preparationDigest: digest(input.preparationDigest),
    attemptOrdinal: 1,
    lease,
    port: normalizePort(input.port),
    manualCallSubstitutesForEmailApproval: false,
    createdAt,
  });
}

function normalizeCurrentAuthority(value: unknown) {
  const input = exactRecord(value, [
    "evaluatedAt", "workspaceId", "companyId", "prospectId", "contactId", "outboxItemId", "sendKey", "dispatchKey",
    "itemState", "lease", "packageArtifact", "messageArtifact", "packageApprovalId", "packageApprovalDigest",
    "packageApprovalExpiresAt", "packageApprovalImmutable", "messageApprovalId", "messageApprovalDigest",
    "messageApprovalExpiresAt", "messageApprovalImmutable", "finalRecheckDecisionId", "finalRecheckDecisionDigest",
    "finalRecheckStatus", "preCallReceiptId", "preCallReceiptDigest", "preCallReceiptValidUntil", "preparationId",
    "preparationDigest", "preparationState", "port", "suppressionEffective",
    "suppressionPrecedesSuccessAcknowledgement", "stopRuleActive", "deliveryState", "deliveryUnknownRecorded",
    "providerAttemptCount", "manualCallBranchStatus", "externalEffectsDisabled",
  ]);
  const leaseInput = exactRecord(input.lease, ["id", "holderId", "generation", "expiresAt"]);
  return deepFreeze({
    evaluatedAt: timestamp(input.evaluatedAt),
    workspaceId: syntheticId(input.workspaceId),
    companyId: syntheticId(input.companyId),
    prospectId: syntheticId(input.prospectId),
    contactId: syntheticId(input.contactId),
    outboxItemId: syntheticId(input.outboxItemId),
    sendKey: syntheticId(input.sendKey),
    dispatchKey: syntheticId(input.dispatchKey),
    itemState: enumValue(input.itemState, ITEM_STATES),
    lease: {
      id: syntheticId(leaseInput.id),
      holderId: syntheticId(leaseInput.holderId),
      generation: positiveInteger(leaseInput.generation),
      expiresAt: timestamp(leaseInput.expiresAt),
    },
    packageArtifact: artifactRef(input.packageArtifact),
    messageArtifact: messageRef(input.messageArtifact),
    packageApprovalId: syntheticId(input.packageApprovalId),
    packageApprovalDigest: digest(input.packageApprovalDigest),
    packageApprovalExpiresAt: timestamp(input.packageApprovalExpiresAt),
    packageApprovalImmutable: booleanValue(input.packageApprovalImmutable),
    messageApprovalId: syntheticId(input.messageApprovalId),
    messageApprovalDigest: digest(input.messageApprovalDigest),
    messageApprovalExpiresAt: timestamp(input.messageApprovalExpiresAt),
    messageApprovalImmutable: booleanValue(input.messageApprovalImmutable),
    finalRecheckDecisionId: syntheticId(input.finalRecheckDecisionId),
    finalRecheckDecisionDigest: digest(input.finalRecheckDecisionDigest),
    finalRecheckStatus: enumValue(input.finalRecheckStatus, [
      FINAL_RECHECK_PASSED,
      "synthetic_recheck_rejected",
    ] as const),
    preCallReceiptId: syntheticId(input.preCallReceiptId),
    preCallReceiptDigest: digest(input.preCallReceiptDigest),
    preCallReceiptValidUntil: timestamp(input.preCallReceiptValidUntil),
    preparationId: syntheticId(input.preparationId),
    preparationDigest: digest(input.preparationDigest),
    preparationState: enumValue(input.preparationState, PREPARATION_STATES),
    port: normalizePort(input.port),
    suppressionEffective: booleanValue(input.suppressionEffective),
    suppressionPrecedesSuccessAcknowledgement: booleanValue(input.suppressionPrecedesSuccessAcknowledgement),
    stopRuleActive: booleanValue(input.stopRuleActive),
    deliveryState: enumValue(input.deliveryState, DELIVERY_STATES),
    deliveryUnknownRecorded: booleanValue(input.deliveryUnknownRecorded),
    providerAttemptCount: nonNegativeInteger(input.providerAttemptCount),
    manualCallBranchStatus: enumValue(input.manualCallBranchStatus, MANUAL_CALL_STATES),
    externalEffectsDisabled: booleanValue(input.externalEffectsDisabled),
  });
}

function normalizePort(value: unknown): MailPortDescriptor {
  const input = exactRecord(value, [
    "portKind", "implementationState", "providerSelected", "credentialReferencePresent",
    "endpointConfigured", "providerInvocationCount", "descriptorDigest",
  ]);
  if (input.portKind !== "provider_neutral_mail_port") invalid();
  if (input.providerSelected !== false) invalid();
  if (input.credentialReferencePresent !== false) invalid();
  if (input.endpointConfigured !== false) invalid();
  if (input.providerInvocationCount !== 0) invalid();
  return deepFreeze({
    portKind: "provider_neutral_mail_port",
    implementationState: enumValue(input.implementationState, PORT_STATES),
    providerSelected: false,
    credentialReferencePresent: false,
    endpointConfigured: false,
    providerInvocationCount: 0,
    descriptorDigest: digest(input.descriptorDigest),
  });
}

function normalizeLease(value: unknown): Lease {
  const input = exactRecord(value, ["id", "holderId", "generation", "acquiredAt", "expiresAt"]);
  const acquiredAt = timestamp(input.acquiredAt);
  const expiresAt = timestamp(input.expiresAt);
  if (expiresAt <= acquiredAt) invalid();
  return deepFreeze({
    id: syntheticId(input.id),
    holderId: syntheticId(input.holderId),
    generation: positiveInteger(input.generation),
    acquiredAt,
    expiresAt,
  });
}

function artifactRef(value: unknown): Artifact {
  const input = exactRecord(value, ["id", "digest"]);
  return deepFreeze({ id: syntheticId(input.id), digest: digest(input.digest) });
}

function messageRef(value: unknown): MessageArtifact {
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

function sameArtifact(left: Artifact, right: Artifact) {
  return left.id === right.id && left.digest === right.digest;
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
