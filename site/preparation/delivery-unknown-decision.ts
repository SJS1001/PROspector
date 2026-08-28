type Effects = Readonly<{
  providerCalls: 0;
  outboxMutations: 0;
  sendInvocations: 0;
  callInvocations: 0;
  exportMutations: 0;
  durableMutations: 0;
}>;

type Artifact = Readonly<{ id: string; digest: string }>;
type AmbiguityKind = "accepted_response_lost" | "request_transmission_unknown" | "post_acceptance_persistence_failed";
type ObservationKind = "originated_match" | "no_originated_match" | "conflicting_evidence" | "connection_unavailable";
type DeliveryUnknownSnapshot = Readonly<{
  id: string;
  workspaceId: string;
  companyId: string;
  prospectId: string;
  contactId: string;
  outboxItemId: string;
  dispatchKey: string;
  messageArtifact: Artifact;
  connectionId: string;
  connectionSubjectId: string;
  originatedMessageId: string;
  originatedThreadId: string;
  rfcMessageIdDigest: string;
  markerDigest: string;
  reconciliationDependencyIds: readonly string[];
  leaseGeneration: number;
  providerAttemptCount: 1;
  ambiguityKind: AmbiguityKind;
  observedAt: number;
}>;

type ReconciliationObservation = Readonly<{
  id: string;
  deliveryUnknownId: string;
  workspaceId: string;
  companyId: string;
  outboxItemId: string;
  connectionId: string;
  connectionSubjectId: string;
  originatedMessageId: string;
  originatedThreadId: string;
  rfcMessageIdDigest: string;
  markerDigest: string;
  kind: ObservationKind;
  observedAt: number;
}>;

export type SyntheticDeliveryUnknown = Readonly<{
  kind: "synthetic_delivery_unknown";
  id: string;
  digest: string;
  classification: "delivery_unknown";
  snapshot: DeliveryUnknownSnapshot;
  persistenceAuthorized: false;
  reconciliationAuthorized: false;
  automaticRetryAuthorized: false;
  providerInvocationAuthorized: false;
  effects: Effects;
}>;

const SYNTHETIC_ID = /^synthetic-[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/u;
const DIGEST = /^[a-f0-9]{64}$/u;
const unknownArtifacts = new WeakSet<object>();
const ZERO_EFFECTS: Effects = deepFreeze({
  providerCalls: 0,
  outboxMutations: 0,
  sendInvocations: 0,
  callInvocations: 0,
  exportMutations: 0,
  durableMutations: 0,
});

/**
 * Canonicalizes an already-classified synthetic ambiguous boundary result.
 * It does not invoke a provider or create an outbox/reconciliation record.
 */
export async function buildSyntheticDeliveryUnknown(value: unknown): Promise<SyntheticDeliveryUnknown> {
  try {
    const snapshot = normalizeUnknown(value);
    const artifact: SyntheticDeliveryUnknown = deepFreeze({
      kind: "synthetic_delivery_unknown",
      id: snapshot.id,
      digest: await sha256(JSON.stringify(snapshot)),
      classification: "delivery_unknown",
      snapshot,
      persistenceAuthorized: false,
      reconciliationAuthorized: false,
      automaticRetryAuthorized: false,
      providerInvocationAuthorized: false,
      effects: ZERO_EFFECTS,
    });
    unknownArtifacts.add(artifact);
    return artifact;
  } catch {
    throw new Error("synthetic_delivery_unknown_invalid");
  }
}

/**
 * Classifies one caller-resolved synthetic observation. Even an exact match
 * only describes a future transition; this function cannot write or retry.
 */
export async function evaluateSyntheticDeliveryReconciliation(value: unknown) {
  try {
    const input = exactRecord(value, ["unknownArtifact", "currentUnknown", "observation", "currentAuthority"]);
    if (!unknownArtifacts.has(input.unknownArtifact as object)) invalid();
    const unknownArtifact = input.unknownArtifact as SyntheticDeliveryUnknown;
    const currentUnknown = await buildSyntheticDeliveryUnknown(input.currentUnknown);
    const observation = normalizeObservation(input.observation);
    const current = normalizeAuthority(input.currentAuthority);
    const unknown = unknownArtifact.snapshot;
    const reasons: string[] = [];

    if (currentUnknown.digest !== unknownArtifact.digest) reasons.push("delivery_unknown_changed");
    if (current.workspaceId !== unknown.workspaceId) reasons.push("workspace_scope_mismatch");
    if (current.companyId !== unknown.companyId) reasons.push("company_scope_mismatch");
    if (current.prospectId !== unknown.prospectId) reasons.push("prospect_scope_mismatch");
    if (current.contactId !== unknown.contactId) reasons.push("contact_scope_mismatch");
    if (current.outboxItemId !== unknown.outboxItemId) reasons.push("outbox_item_mismatch");
    if (current.dispatchKey !== unknown.dispatchKey) reasons.push("dispatch_key_mismatch");
    if (!sameArtifact(current.messageArtifact, unknown.messageArtifact)) reasons.push("message_artifact_changed");
    if (current.connectionId !== unknown.connectionId) reasons.push("connection_mismatch");
    if (current.connectionSubjectId !== unknown.connectionSubjectId) reasons.push("connection_subject_mismatch");
    if (!current.knownOriginatedPairs.some((pair) => pair.messageId === unknown.originatedMessageId
      && pair.threadId === unknown.originatedThreadId)) reasons.push("originated_message_thread_unknown");
    if (current.rfcMessageIdDigest !== unknown.rfcMessageIdDigest) reasons.push("rfc_message_id_changed");
    if (current.markerDigest !== unknown.markerDigest) reasons.push("marker_changed");
    if (!sameStrings(current.reconciliationDependencyIds, unknown.reconciliationDependencyIds)) {
      reasons.push("reconciliation_dependency_set_changed");
    }
    if (current.leaseGeneration !== unknown.leaseGeneration) reasons.push("lease_generation_changed");
    if (current.itemState !== "delivery_unknown") reasons.push("item_not_delivery_unknown");
    if (!current.deliveryUnknownRecorded) reasons.push("delivery_unknown_not_recorded");
    if (current.providerAttemptCount !== unknown.providerAttemptCount) reasons.push("provider_attempt_count_changed");
    if (current.automaticRetryCount !== 0) reasons.push("automatic_retry_already_recorded");
    if (!current.connectionActive) reasons.push("connection_inactive");
    if (!current.connectionSubjectPinned) reasons.push("connection_subject_unpinned");
    if (!current.observationAuthenticated) reasons.push("observation_authentication_invalid");
    if (!current.observationOriginRestricted) reasons.push("observation_not_origin_restricted");
    if (current.observationAlreadyRecorded) reasons.push("observation_already_recorded");

    if (observation.deliveryUnknownId !== unknown.id) reasons.push("observation_delivery_unknown_mismatch");
    if (observation.workspaceId !== unknown.workspaceId) reasons.push("observation_workspace_mismatch");
    if (observation.companyId !== unknown.companyId) reasons.push("observation_company_mismatch");
    if (observation.outboxItemId !== unknown.outboxItemId) reasons.push("observation_outbox_mismatch");
    if (observation.connectionId !== unknown.connectionId) reasons.push("observation_connection_mismatch");
    if (observation.connectionSubjectId !== unknown.connectionSubjectId) {
      reasons.push("observation_connection_subject_mismatch");
    }
    if (observation.originatedMessageId !== unknown.originatedMessageId
      || observation.originatedThreadId !== unknown.originatedThreadId) reasons.push("observation_origin_mismatch");
    if (observation.rfcMessageIdDigest !== unknown.rfcMessageIdDigest) {
      reasons.push("observation_rfc_message_id_mismatch");
    }
    if (observation.markerDigest !== unknown.markerDigest) reasons.push("observation_marker_mismatch");
    if (observation.observedAt < unknown.observedAt) reasons.push("observation_precedes_delivery_unknown");
    if (observation.observedAt > current.evaluatedAt) reasons.push("observation_from_future");

    const rejected = reasons.length > 0;
    const matched = !rejected && observation.kind === "originated_match";
    if (!rejected && !matched) reasons.push(classificationReason(observation.kind));
    const reasonCodes = [...new Set(reasons)].sort();
    return deepFreeze({
      kind: "synthetic_delivery_reconciliation_decision" as const,
      status: rejected
        ? "synthetic_reconciliation_rejected" as const
        : "synthetic_reconciliation_classified_no_authority" as const,
      projectedFutureState: matched ? "sent" as const : "delivery_unknown" as const,
      originatedMatchWouldResolveSent: matched,
      ownerActionRequired: !rejected && !matched,
      newMessageVersionRequiredForFutureTransmission: true as const,
      unknownId: unknown.id,
      unknownDigest: unknownArtifact.digest,
      observationId: observation.id,
      reasonCodes,
      persistenceAuthorized: false as const,
      reconciliationAuthorized: false as const,
      automaticRetryAuthorized: false as const,
      providerInvocationAuthorized: false as const,
      effects: ZERO_EFFECTS,
    });
  } catch {
    throw new Error("synthetic_delivery_reconciliation_invalid");
  }
}

function normalizeUnknown(value: unknown): DeliveryUnknownSnapshot {
  const input = exactRecord(value, [
    "id", "workspaceId", "companyId", "prospectId", "contactId", "outboxItemId", "dispatchKey", "messageArtifact",
    "connectionId", "connectionSubjectId", "originatedMessageId", "originatedThreadId", "rfcMessageIdDigest",
    "markerDigest", "reconciliationDependencyIds", "leaseGeneration", "providerAttemptCount", "ambiguityKind", "observedAt",
  ]);
  if (input.providerAttemptCount !== 1) invalid();
  return deepFreeze({
    id: syntheticId(input.id),
    workspaceId: syntheticId(input.workspaceId),
    companyId: syntheticId(input.companyId),
    prospectId: syntheticId(input.prospectId),
    contactId: syntheticId(input.contactId),
    outboxItemId: syntheticId(input.outboxItemId),
    dispatchKey: syntheticId(input.dispatchKey),
    messageArtifact: artifact(input.messageArtifact),
    connectionId: syntheticId(input.connectionId),
    connectionSubjectId: syntheticId(input.connectionSubjectId),
    originatedMessageId: syntheticId(input.originatedMessageId),
    originatedThreadId: syntheticId(input.originatedThreadId),
    rfcMessageIdDigest: digest(input.rfcMessageIdDigest),
    markerDigest: digest(input.markerDigest),
    reconciliationDependencyIds: sortedUnique(input.reconciliationDependencyIds, 1, 64),
    leaseGeneration: positiveInteger(input.leaseGeneration),
    providerAttemptCount: 1,
    ambiguityKind: enumValue(input.ambiguityKind, [
      "accepted_response_lost", "request_transmission_unknown", "post_acceptance_persistence_failed",
    ] as const),
    observedAt: timestamp(input.observedAt),
  });
}

function normalizeObservation(value: unknown): ReconciliationObservation {
  const input = exactRecord(value, [
    "id", "deliveryUnknownId", "workspaceId", "companyId", "outboxItemId", "connectionId", "connectionSubjectId",
    "originatedMessageId", "originatedThreadId", "rfcMessageIdDigest", "markerDigest", "kind", "observedAt",
  ]);
  return deepFreeze({
    id: syntheticId(input.id),
    deliveryUnknownId: syntheticId(input.deliveryUnknownId),
    workspaceId: syntheticId(input.workspaceId),
    companyId: syntheticId(input.companyId),
    outboxItemId: syntheticId(input.outboxItemId),
    connectionId: syntheticId(input.connectionId),
    connectionSubjectId: syntheticId(input.connectionSubjectId),
    originatedMessageId: syntheticId(input.originatedMessageId),
    originatedThreadId: syntheticId(input.originatedThreadId),
    rfcMessageIdDigest: digest(input.rfcMessageIdDigest),
    markerDigest: digest(input.markerDigest),
    kind: enumValue(input.kind, [
      "originated_match", "no_originated_match", "conflicting_evidence", "connection_unavailable",
    ] as const),
    observedAt: timestamp(input.observedAt),
  });
}

function normalizeAuthority(value: unknown) {
  const input = exactRecord(value, [
    "evaluatedAt", "workspaceId", "companyId", "prospectId", "contactId", "outboxItemId", "dispatchKey",
    "messageArtifact", "connectionId", "connectionSubjectId", "knownOriginatedPairs", "rfcMessageIdDigest",
    "markerDigest", "reconciliationDependencyIds", "leaseGeneration", "itemState", "deliveryUnknownRecorded",
    "providerAttemptCount", "automaticRetryCount", "connectionActive", "connectionSubjectPinned", "observationAuthenticated",
    "observationOriginRestricted", "observationAlreadyRecorded",
  ]);
  return deepFreeze({
    evaluatedAt: timestamp(input.evaluatedAt),
    workspaceId: syntheticId(input.workspaceId),
    companyId: syntheticId(input.companyId),
    prospectId: syntheticId(input.prospectId),
    contactId: syntheticId(input.contactId),
    outboxItemId: syntheticId(input.outboxItemId),
    dispatchKey: syntheticId(input.dispatchKey),
    messageArtifact: artifact(input.messageArtifact),
    connectionId: syntheticId(input.connectionId),
    connectionSubjectId: syntheticId(input.connectionSubjectId),
    knownOriginatedPairs: normalizeOriginatedPairs(input.knownOriginatedPairs),
    rfcMessageIdDigest: digest(input.rfcMessageIdDigest),
    markerDigest: digest(input.markerDigest),
    reconciliationDependencyIds: sortedUnique(input.reconciliationDependencyIds, 1, 64),
    leaseGeneration: positiveInteger(input.leaseGeneration),
    itemState: enumValue(input.itemState, [
      "pending", "leased", "dispatching", "sent", "cancelled", "failed_before_dispatch", "delivery_unknown",
    ] as const),
    deliveryUnknownRecorded: booleanValue(input.deliveryUnknownRecorded),
    providerAttemptCount: nonNegativeInteger(input.providerAttemptCount),
    automaticRetryCount: nonNegativeInteger(input.automaticRetryCount),
    connectionActive: booleanValue(input.connectionActive),
    connectionSubjectPinned: booleanValue(input.connectionSubjectPinned),
    observationAuthenticated: booleanValue(input.observationAuthenticated),
    observationOriginRestricted: booleanValue(input.observationOriginRestricted),
    observationAlreadyRecorded: booleanValue(input.observationAlreadyRecorded),
  });
}

function normalizeOriginatedPairs(value: unknown) {
  const pairs = denseArray(value, 1, 64).map((entry) => {
    const input = exactRecord(entry, ["messageId", "threadId"]);
    return deepFreeze({ messageId: syntheticId(input.messageId), threadId: syntheticId(input.threadId) });
  }).sort((left, right) => `${left.messageId}\0${left.threadId}`.localeCompare(`${right.messageId}\0${right.threadId}`));
  const keys = pairs.map((pair) => `${pair.messageId}\0${pair.threadId}`);
  if (new Set(keys).size !== keys.length) invalid();
  return deepFreeze(pairs);
}

function classificationReason(kind: ObservationKind) {
  if (kind === "no_originated_match") return "originated_delivery_not_found";
  if (kind === "conflicting_evidence") return "reconciliation_evidence_conflict";
  if (kind === "connection_unavailable") return "reconciliation_connection_unavailable";
  invalid();
}

function artifact(value: unknown): Artifact {
  const input = exactRecord(value, ["id", "digest"]);
  return deepFreeze({ id: syntheticId(input.id), digest: digest(input.digest) });
}

function sameArtifact(left: Artifact, right: Artifact) {
  return left.id === right.id && left.digest === right.digest;
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
