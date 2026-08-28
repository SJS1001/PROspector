type Effects = Readonly<{
  providerCalls: 0;
  outboxMutations: 0;
  sendInvocations: 0;
  callInvocations: 0;
  exportMutations: 0;
  durableMutations: 0;
}>;

type Artifact = Readonly<{ id: string; digest: string }>;
type PublicUnsubscribeSource = Readonly<{ kind: "public_unsubscribe"; tokenDigest: string }>;
type ExplicitEmailOptOutSource = Readonly<{
  kind: "explicit_email_opt_out";
  eventId: string;
  eventDigest: string;
}>;
type SuppressionSource = PublicUnsubscribeSource | ExplicitEmailOptOutSource;
type SuppressionSubject = Readonly<
  { kind: "exact_email"; value: string; channel: "email" }
  | { kind: "confirmed_email_domain"; value: string; channel: "email" }
  | { kind: "contact" | "organization" | "company"; value: string; channel: "all" }
>;
type SuppressionBeforeSuccessSnapshot = Readonly<{
  id: string;
  source: SuppressionSource;
  workspaceId: string;
  companyId: string;
  contactId: string;
  organizationId: string;
  messageArtifact: Artifact;
  tombstoneId: string;
  sourceReceiptId: string;
  originatedMessageId: string;
  originatedThreadId: string;
  normalizedEmail: string;
  confirmedEmailDomains: readonly string[];
  suppressionSubject: SuppressionSubject;
  matchingWorkIds: readonly string[];
  cancellationDependencyIds: readonly string[];
  occurredAt: number;
}>;

export type SyntheticSuppressionBeforeSuccess = Readonly<{
  kind: "synthetic_suppression_before_success";
  id: string;
  digest: string;
  snapshot: SuppressionBeforeSuccessSnapshot;
  persistenceAuthorized: false;
  cancellationAuthorized: false;
  successAcknowledgementAuthorized: false;
  providerInvocationAuthorized: false;
  effects: Effects;
}>;

const SYNTHETIC_ID = /^synthetic-[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/u;
const DIGEST = /^[a-f0-9]{64}$/u;
const SYNTHETIC_EMAIL = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.invalid$/u;
const SYNTHETIC_DOMAIN = /^[a-z0-9](?:[a-z0-9.-]{0,61}[a-z0-9])?\.invalid$/u;
const suppressionArtifacts = new WeakSet<object>();
const ZERO_EFFECTS: Effects = deepFreeze({
  providerCalls: 0,
  outboxMutations: 0,
  sendInvocations: 0,
  callInvocations: 0,
  exportMutations: 0,
  durableMutations: 0,
});

/**
 * Canonicalizes a synthetic, already-bound suppression intent. It cannot
 * persist a tombstone, cancel work, acknowledge success, or invoke a provider.
 */
export async function buildSyntheticSuppressionBeforeSuccess(
  value: unknown,
): Promise<SyntheticSuppressionBeforeSuccess> {
  try {
    const snapshot = normalizeSnapshot(value);
    const artifact: SyntheticSuppressionBeforeSuccess = deepFreeze({
      kind: "synthetic_suppression_before_success",
      id: snapshot.id,
      digest: await sha256(JSON.stringify(snapshot)),
      snapshot,
      persistenceAuthorized: false,
      cancellationAuthorized: false,
      successAcknowledgementAuthorized: false,
      providerInvocationAuthorized: false,
      effects: ZERO_EFFECTS,
    });
    suppressionArtifacts.add(artifact);
    return artifact;
  } catch {
    throw new Error("synthetic_suppression_before_success_invalid");
  }
}

/**
 * Describes the ordering a future trusted transaction must enforce. The
 * projection itself grants no write, cancellation, response, or provider
 * authority.
 */
export async function evaluateSyntheticSuppressionBeforeSuccess(value: unknown) {
  try {
    const input = exactRecord(value, ["intentArtifact", "currentIntent", "currentAuthority"]);
    if (!suppressionArtifacts.has(input.intentArtifact as object)) invalid();
    const intentArtifact = input.intentArtifact as SyntheticSuppressionBeforeSuccess;
    const currentIntent = await buildSyntheticSuppressionBeforeSuccess(input.currentIntent);
    const current = normalizeAuthority(input.currentAuthority);
    const intent = intentArtifact.snapshot;
    const reasons: string[] = [];

    if (currentIntent.digest !== intentArtifact.digest) reasons.push("suppression_intent_changed");
    if (current.workspaceId !== intent.workspaceId) reasons.push("workspace_scope_mismatch");
    if (current.companyId !== intent.companyId) reasons.push("company_scope_mismatch");
    if (current.contactId !== intent.contactId) reasons.push("contact_scope_mismatch");
    if (current.organizationId !== intent.organizationId) reasons.push("organization_scope_mismatch");
    if (!sameArtifact(current.messageArtifact, intent.messageArtifact)) reasons.push("message_artifact_changed");
    if (current.normalizedEmail !== intent.normalizedEmail) reasons.push("normalized_email_changed");
    if (!sameStrings(current.confirmedEmailDomains, intent.confirmedEmailDomains)) {
      reasons.push("confirmed_email_domain_set_changed");
    }
    if (!sameSubject(current.suppressionSubject, intent.suppressionSubject)) reasons.push("suppression_subject_changed");
    if (!current.knownOriginatedPairs.some((pair) => pair.messageId === intent.originatedMessageId
      && pair.threadId === intent.originatedThreadId)) reasons.push("originated_message_thread_unknown");
    if (!sameStrings(current.matchingWorkIds, intent.matchingWorkIds)) reasons.push("matching_work_set_changed");
    if (!sameStrings(current.cancellationDependencyIds, intent.cancellationDependencyIds)) {
      reasons.push("cancellation_dependency_set_changed");
    }
    if (current.evaluatedAt < intent.occurredAt) reasons.push("evaluation_precedes_intent");
    if (intent.source.kind !== current.sourceBinding.kind) reasons.push("source_kind_mismatch");
    else if (intent.source.kind === "public_unsubscribe") {
      if (current.sourceBinding.kind !== "public_unsubscribe"
        || !current.sourceBinding.bindingKnown
        || current.sourceBinding.tokenDigest !== intent.source.tokenDigest) reasons.push("unsubscribe_binding_invalid");
    } else if (current.sourceBinding.kind !== "explicit_email_opt_out"
      || current.sourceBinding.eventId !== intent.source.eventId
      || current.sourceBinding.eventDigest !== intent.source.eventDigest
      || !current.sourceBinding.eventAuthenticated
      || !current.sourceBinding.eventOriginRestricted
      || !current.sourceBinding.explicitOptOutDetected) reasons.push("explicit_opt_out_binding_invalid");
    if (current.tombstoneRecord
      && (current.tombstoneRecord.id !== intent.tombstoneId
        || current.tombstoneRecord.intentDigest !== intentArtifact.digest)) reasons.push("tombstone_record_mismatch");
    if (current.sourceReceiptRecord
      && (current.sourceReceiptRecord.id !== intent.sourceReceiptId
        || current.sourceReceiptRecord.intentDigest !== intentArtifact.digest)) reasons.push("source_receipt_mismatch");
    if (current.tombstoneRecord
      && (current.tombstoneRecord.recordedAt < intent.occurredAt
        || current.tombstoneRecord.recordedAt > current.evaluatedAt)) reasons.push("tombstone_record_time_invalid");
    if (current.cancellationRecord
      && current.cancellationRecord.intentDigest !== intentArtifact.digest) reasons.push("cancellation_record_mismatch");
    if (current.cancellationRecord
      && !sameStrings(current.cancellationRecord.workIds, intent.matchingWorkIds)) {
      reasons.push("cancellation_work_set_mismatch");
    }
    if (current.cancellationRecord
      && (current.cancellationRecord.recordedAt < intent.occurredAt
        || current.cancellationRecord.recordedAt > current.evaluatedAt)) reasons.push("cancellation_record_time_invalid");
    if (current.sourceReceiptRecord
      && (current.sourceReceiptRecord.recordedAt < intent.occurredAt
        || current.sourceReceiptRecord.recordedAt > current.evaluatedAt)) reasons.push("source_receipt_time_invalid");
    if (current.tombstoneRecord && current.cancellationRecord
      && current.cancellationRecord.recordedAt < current.tombstoneRecord.recordedAt) {
      reasons.push("cancellation_precedes_tombstone");
    }
    if (current.cancellationRecord && current.sourceReceiptRecord
      && current.sourceReceiptRecord.recordedAt < current.cancellationRecord.recordedAt) {
      reasons.push("source_receipt_precedes_cancellation");
    }
    if (current.successReceiptRecord
      && current.successReceiptRecord.intentDigest !== intentArtifact.digest) reasons.push("success_receipt_mismatch");
    if (current.successReceiptRecord
      && (current.successReceiptRecord.recordedAt < intent.occurredAt
        || current.successReceiptRecord.recordedAt > current.evaluatedAt)) reasons.push("success_receipt_time_invalid");
    if (intent.source.kind !== "public_unsubscribe" && current.successReceiptRecord) {
      reasons.push("unexpected_public_success_receipt");
    }
    if (current.successReceiptRecord && current.sourceReceiptRecord
      && current.successReceiptRecord.recordedAt < current.sourceReceiptRecord.recordedAt) {
      reasons.push("success_receipt_precedes_durable_suppression");
    }

    const pristine = current.tombstoneRecord === null
      && current.cancellationRecord === null
      && current.sourceReceiptRecord === null
      && current.successReceiptRecord === null;
    const durable = current.tombstoneRecord !== null
      && current.cancellationRecord !== null
      && current.sourceReceiptRecord !== null;
    if (!pristine && !durable) reasons.push("partial_durable_suppression_state");
    if (current.successReceiptRecord && !durable) {
      reasons.push("success_acknowledgement_precedes_durable_suppression");
    }

    const rejected = reasons.length > 0;
    const commitRequired = !rejected && pristine;
    const alreadyDurable = !rejected && durable;
    return deepFreeze({
      kind: "synthetic_suppression_before_success_decision" as const,
      status: rejected
        ? "synthetic_suppression_rejected" as const
        : alreadyDurable
          ? "synthetic_suppression_already_durable_no_authority" as const
          : "synthetic_suppression_commit_required_no_authority" as const,
      durablePrerequisitesSatisfied: alreadyDurable,
      genericPublicResponseProjection: intent.source.kind === "public_unsubscribe"
        ? "generic_unsubscribe_response" as const
        : null,
      requiredOrderedSteps: !commitRequired ? [] : [
        "append_suppression_tombstone",
        "cancel_matching_pending_or_unleased_work",
        "record_source_processed",
        intent.source.kind === "public_unsubscribe" ? "report_generic_success" : "complete_opt_out_ingestion",
      ] as const,
      requiredCancellationWorkIds: commitRequired ? intent.matchingWorkIds : [],
      reasonCodes: [...new Set(reasons)].sort(),
      persistenceAuthorized: false as const,
      cancellationAuthorized: false as const,
      successAcknowledgementAuthorized: false as const,
      providerInvocationAuthorized: false as const,
      effects: ZERO_EFFECTS,
    });
  } catch {
    throw new Error("synthetic_suppression_before_success_decision_invalid");
  }
}

function normalizeSnapshot(value: unknown): SuppressionBeforeSuccessSnapshot {
  const input = exactRecord(value, [
    "id", "source", "workspaceId", "companyId", "contactId", "organizationId", "messageArtifact",
    "tombstoneId", "sourceReceiptId",
    "originatedMessageId", "originatedThreadId", "normalizedEmail", "confirmedEmailDomains",
    "suppressionSubject", "matchingWorkIds",
    "cancellationDependencyIds", "occurredAt",
  ]);
  const messageArtifact = artifact(input.messageArtifact);
  const normalizedEmail = syntheticEmail(input.normalizedEmail);
  const workspaceId = syntheticId(input.workspaceId);
  const companyId = syntheticId(input.companyId);
  const contactId = syntheticId(input.contactId);
  const organizationId = syntheticId(input.organizationId);
  const confirmedEmailDomains = sortedUniqueDomains(input.confirmedEmailDomains);
  const suppressionSubject = normalizeSuppressionSubject(input.suppressionSubject, {
    companyId, contactId, organizationId, normalizedEmail, confirmedEmailDomains,
  });
  return deepFreeze({
    id: syntheticId(input.id),
    source: normalizeSource(input.source),
    workspaceId,
    companyId,
    contactId,
    organizationId,
    messageArtifact,
    tombstoneId: syntheticId(input.tombstoneId),
    sourceReceiptId: syntheticId(input.sourceReceiptId),
    originatedMessageId: syntheticId(input.originatedMessageId),
    originatedThreadId: syntheticId(input.originatedThreadId),
    normalizedEmail,
    confirmedEmailDomains,
    suppressionSubject,
    matchingWorkIds: sortedUnique(input.matchingWorkIds, 0, 64),
    cancellationDependencyIds: sortedUnique(input.cancellationDependencyIds, 1, 64),
    occurredAt: timestamp(input.occurredAt),
  });
}

function normalizeSource(value: unknown): SuppressionSource {
  const source = dataRecord(value);
  if (source.kind === "public_unsubscribe") {
    const input = exactRecord(value, ["kind", "tokenDigest"]);
    return deepFreeze({ kind: "public_unsubscribe", tokenDigest: digest(input.tokenDigest) });
  }
  if (source.kind === "explicit_email_opt_out") {
    const input = exactRecord(value, ["kind", "eventId", "eventDigest"]);
    return deepFreeze({
      kind: "explicit_email_opt_out",
      eventId: syntheticId(input.eventId),
      eventDigest: digest(input.eventDigest),
    });
  }
  invalid();
}

function normalizeAuthority(value: unknown) {
  const input = exactRecord(value, [
    "evaluatedAt", "workspaceId", "companyId", "contactId", "organizationId", "messageArtifact",
    "normalizedEmail", "confirmedEmailDomains", "suppressionSubject", "knownOriginatedPairs", "matchingWorkIds",
    "cancellationDependencyIds", "sourceBinding", "tombstoneRecord", "cancellationRecord",
    "sourceReceiptRecord", "successReceiptRecord",
  ]);
  const workspaceId = syntheticId(input.workspaceId);
  const companyId = syntheticId(input.companyId);
  const contactId = syntheticId(input.contactId);
  const organizationId = syntheticId(input.organizationId);
  const normalizedEmail = syntheticEmail(input.normalizedEmail);
  const confirmedEmailDomains = sortedUniqueDomains(input.confirmedEmailDomains);
  return deepFreeze({
    evaluatedAt: timestamp(input.evaluatedAt),
    workspaceId,
    companyId,
    contactId,
    organizationId,
    messageArtifact: artifact(input.messageArtifact),
    normalizedEmail,
    confirmedEmailDomains,
    suppressionSubject: normalizeSuppressionSubject(input.suppressionSubject, {
      companyId, contactId, organizationId, normalizedEmail, confirmedEmailDomains,
    }),
    knownOriginatedPairs: normalizeOriginatedPairs(input.knownOriginatedPairs),
    matchingWorkIds: sortedUnique(input.matchingWorkIds, 0, 64),
    cancellationDependencyIds: sortedUnique(input.cancellationDependencyIds, 1, 64),
    sourceBinding: normalizeSourceBinding(input.sourceBinding),
    tombstoneRecord: normalizeCommitRecord(input.tombstoneRecord),
    cancellationRecord: normalizeCancellationRecord(input.cancellationRecord),
    sourceReceiptRecord: normalizeCommitRecord(input.sourceReceiptRecord),
    successReceiptRecord: normalizeSuccessReceipt(input.successReceiptRecord),
  });
}

function normalizeCancellationRecord(value: unknown) {
  if (value === null) return null;
  const input = exactRecord(value, ["intentDigest", "workIds", "recordedAt"]);
  return deepFreeze({
    intentDigest: digest(input.intentDigest),
    workIds: sortedUnique(input.workIds, 0, 64),
    recordedAt: timestamp(input.recordedAt),
  });
}

function normalizeSuccessReceipt(value: unknown) {
  if (value === null) return null;
  const input = exactRecord(value, ["intentDigest", "recordedAt"]);
  return deepFreeze({
    intentDigest: digest(input.intentDigest),
    recordedAt: timestamp(input.recordedAt),
  });
}

function normalizeSuppressionSubject(
  value: unknown,
  scope: Readonly<{
    companyId: string;
    contactId: string;
    organizationId: string;
    normalizedEmail: string;
    confirmedEmailDomains: readonly string[];
  }>,
): SuppressionSubject {
  const input = exactRecord(value, ["kind", "value", "channel"]);
  if (input.kind === "exact_email") {
    const normalized = syntheticEmail(input.value);
    if (input.channel !== "email" || normalized !== scope.normalizedEmail) invalid();
    return deepFreeze({ kind: "exact_email", value: normalized, channel: "email" });
  }
  if (input.kind === "confirmed_email_domain") {
    const domain = syntheticDomain(input.value);
    if (input.channel !== "email"
      || !scope.confirmedEmailDomains.includes(domain)
      || !scope.normalizedEmail.endsWith(`@${domain}`)) invalid();
    return deepFreeze({ kind: "confirmed_email_domain", value: domain, channel: "email" });
  }
  if (input.kind === "contact") {
    if (input.channel !== "all" || input.value !== scope.contactId) invalid();
    return deepFreeze({ kind: "contact", value: scope.contactId, channel: "all" });
  }
  if (input.kind === "organization") {
    if (input.channel !== "all" || input.value !== scope.organizationId) invalid();
    return deepFreeze({ kind: "organization", value: scope.organizationId, channel: "all" });
  }
  if (input.kind === "company") {
    if (input.channel !== "all" || input.value !== scope.companyId) invalid();
    return deepFreeze({ kind: "company", value: scope.companyId, channel: "all" });
  }
  invalid();
}

function normalizeCommitRecord(value: unknown) {
  if (value === null) return null;
  const input = exactRecord(value, ["id", "intentDigest", "recordedAt"]);
  return deepFreeze({
    id: syntheticId(input.id),
    intentDigest: digest(input.intentDigest),
    recordedAt: timestamp(input.recordedAt),
  });
}

function normalizeSourceBinding(value: unknown) {
  const source = dataRecord(value);
  if (source.kind === "public_unsubscribe") {
    const input = exactRecord(value, ["kind", "bindingKnown", "tokenDigest"]);
    return deepFreeze({
      kind: "public_unsubscribe" as const,
      bindingKnown: booleanValue(input.bindingKnown),
      tokenDigest: digest(input.tokenDigest),
    });
  }
  if (source.kind === "explicit_email_opt_out") {
    const input = exactRecord(value, [
      "kind", "eventId", "eventDigest", "eventAuthenticated", "eventOriginRestricted", "explicitOptOutDetected",
    ]);
    return deepFreeze({
      kind: "explicit_email_opt_out" as const,
      eventId: syntheticId(input.eventId),
      eventDigest: digest(input.eventDigest),
      eventAuthenticated: booleanValue(input.eventAuthenticated),
      eventOriginRestricted: booleanValue(input.eventOriginRestricted),
      explicitOptOutDetected: booleanValue(input.explicitOptOutDetected),
    });
  }
  invalid();
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

function artifact(value: unknown): Artifact {
  const input = exactRecord(value, ["id", "digest"]);
  return deepFreeze({ id: syntheticId(input.id), digest: digest(input.digest) });
}

function sameArtifact(left: Artifact, right: Artifact) {
  return left.id === right.id && left.digest === right.digest;
}

function sameSubject(left: SuppressionSubject, right: SuppressionSubject) {
  return left.kind === right.kind && left.value === right.value && left.channel === right.channel;
}

function sameStrings(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && left.every((entry, index) => entry === right[index]);
}

function exactRecord(value: unknown, expectedKeys: readonly string[]): Record<string, unknown> {
  const output = dataRecord(value);
  if (Object.keys(output).sort().join("\0") !== [...expectedKeys].sort().join("\0")) invalid();
  return output;
}

function dataRecord(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) invalid();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).some((key) => typeof key !== "string")) invalid();
  const output: Record<string, unknown> = {};
  for (const [key, descriptor] of Object.entries(descriptors)) {
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

function sortedUniqueDomains(value: unknown): readonly string[] {
  const entries = denseArray(value, 0, 16).map(syntheticDomain).sort();
  if (new Set(entries).size !== entries.length) invalid();
  return deepFreeze(entries);
}

function syntheticId(value: unknown) {
  if (typeof value !== "string" || !SYNTHETIC_ID.test(value)) invalid();
  return value;
}

function digest(value: unknown) {
  if (typeof value !== "string" || !DIGEST.test(value)) invalid();
  return value;
}

function syntheticEmail(value: unknown) {
  if (typeof value !== "string" || !SYNTHETIC_EMAIL.test(value)) invalid();
  return value;
}

function syntheticDomain(value: unknown) {
  if (typeof value !== "string" || !SYNTHETIC_DOMAIN.test(value)) invalid();
  return value;
}

function timestamp(value: unknown) {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) invalid();
  return value as number;
}

function booleanValue(value: unknown) {
  if (typeof value !== "boolean") invalid();
  return value;
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
