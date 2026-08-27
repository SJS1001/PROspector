type Effects = Readonly<{
  providerCalls: 0;
  outboxMutations: 0;
  sendInvocations: 0;
  callInvocations: 0;
  exportMutations: 0;
  durableMutations: 0;
}>;

type EventKind = "confirmed_reply" | "ambiguous_reply" | "bounce";
type Classification = "cancel_matching_email_followups" | "pause_matching_email_followups";
type EventSnapshot = Readonly<{
  id: string;
  workspaceId: string;
  companyId: string;
  contactId: string;
  connectionId: string;
  connectionSubjectId: string;
  originatedMessageId: string;
  originatedThreadId: string;
  kind: EventKind;
  senderAddress: string | null;
  bounceClass: "hard" | "soft" | null;
  subjectDigest: string;
  excerptDigest: string;
  suppressionSubjectIds: readonly string[];
  stopDependencyIds: readonly string[];
  occurredAt: number;
}>;

type WorkItem = Readonly<{
  id: string;
  workspaceId: string;
  companyId: string;
  contactId: string;
  originatedMessageId: string;
  originatedThreadId: string;
  channel: "email";
  isFollowUp: boolean;
  state: "pending" | "leased" | "dispatching" | "sent" | "cancelled" | "delivery_unknown";
  leaseGeneration: number | null;
  preCallDecisionRecorded: boolean;
  providerAttemptCount: number;
}>;

export type SyntheticOriginatedEvent = Readonly<{
  kind: "synthetic_originated_event";
  id: string;
  digest: string;
  classification: Classification;
  snapshot: EventSnapshot;
  persistenceAuthorized: false;
  cancellationAuthorized: false;
  effects: Effects;
}>;

const SYNTHETIC_ID = /^synthetic-[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/u;
const DIGEST = /^[a-f0-9]{64}$/u;
const SYNTHETIC_EMAIL = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.invalid$/u;
const eventArtifacts = new WeakSet<object>();
const ZERO_EFFECTS: Effects = deepFreeze({
  providerCalls: 0,
  outboxMutations: 0,
  sendInvocations: 0,
  callInvocations: 0,
  exportMutations: 0,
  durableMutations: 0,
});

/** Creates only a minimized synthetic classification artifact, never a mailbox or provider event. */
export async function buildSyntheticOriginatedEvent(value: unknown): Promise<SyntheticOriginatedEvent> {
  try {
    const snapshot = normalizeEvent(value);
    const artifact: SyntheticOriginatedEvent = deepFreeze({
      kind: "synthetic_originated_event",
      id: snapshot.id,
      digest: await sha256(JSON.stringify(snapshot)),
      classification: snapshot.kind === "ambiguous_reply"
        ? "pause_matching_email_followups"
        : "cancel_matching_email_followups",
      snapshot,
      persistenceAuthorized: false,
      cancellationAuthorized: false,
      effects: ZERO_EFFECTS,
    });
    eventArtifacts.add(artifact);
    return artifact;
  } catch {
    throw new Error("synthetic_originated_event_invalid");
  }
}

/**
 * Projects which already-resolved synthetic work would stop. It neither scans
 * a mailbox nor writes an event, suppression, pause, cancellation, or audit.
 */
export async function evaluateSyntheticOriginatedStopDecision(value: unknown) {
  try {
    const input = exactRecord(value, ["eventArtifact", "currentEvent", "currentAuthority", "workItems"]);
    if (!eventArtifacts.has(input.eventArtifact as object)) invalid();
    const eventArtifact = input.eventArtifact as SyntheticOriginatedEvent;
    const currentEvent = await buildSyntheticOriginatedEvent(input.currentEvent);
    const current = normalizeAuthority(input.currentAuthority);
    const workItems = normalizeWorkItems(input.workItems);
    const event = eventArtifact.snapshot;
    const reasons: string[] = [];

    if (currentEvent.digest !== eventArtifact.digest) reasons.push("originated_event_changed");
    if (current.workspaceId !== event.workspaceId) reasons.push("workspace_scope_mismatch");
    if (current.companyId !== event.companyId) reasons.push("company_scope_mismatch");
    if (current.contactId !== event.contactId) reasons.push("contact_scope_mismatch");
    if (current.connectionId !== event.connectionId) reasons.push("connection_mismatch");
    if (current.connectionSubjectId !== event.connectionSubjectId) reasons.push("connection_subject_mismatch");
    if (!current.connectionActive) reasons.push("connection_inactive");
    if (!current.connectionSubjectPinned) reasons.push("connection_subject_unpinned");
    if (!current.eventAuthenticationValid) reasons.push("event_authentication_invalid");
    if (!current.knownOriginatedPairs.some((pair) => pair.messageId === event.originatedMessageId
      && pair.threadId === event.originatedThreadId)) reasons.push("originated_message_thread_unknown");
    if (!sameStrings(current.suppressionSubjectIds, event.suppressionSubjectIds)) reasons.push("suppression_subject_set_changed");
    if (!sameStrings(current.stopDependencyIds, event.stopDependencyIds)) reasons.push("stop_dependency_set_changed");
    if (current.eventAlreadyRecorded) reasons.push("event_already_recorded");
    if (event.occurredAt > current.evaluatedAt) reasons.push("event_from_future");

    const globalRejected = reasons.length > 0;
    const eligible: string[] = [];
    const fencePassed: string[] = [];
    const terminal: string[] = [];
    if (!globalRejected) {
      for (const item of workItems) {
        if (!matches(event, item)) continue;
        if (item.state === "pending"
          || (item.state === "leased" && !item.preCallDecisionRecorded && item.providerAttemptCount === 0)) {
          eligible.push(item.id);
        } else if (item.state === "leased" || item.state === "dispatching") {
          fencePassed.push(item.id);
        } else {
          terminal.push(item.id);
        }
      }
    }
    const shouldPause = eventArtifact.classification === "pause_matching_email_followups";
    const reasonCodes = [...new Set(reasons)].sort();
    return deepFreeze({
      kind: "synthetic_originated_stop_decision" as const,
      status: globalRejected ? "synthetic_stop_rejected" as const : "synthetic_stop_classified_no_authority" as const,
      classification: eventArtifact.classification,
      stopRuleWouldActivate: !globalRejected,
      wouldCancelWorkItemIds: shouldPause || globalRejected ? [] : eligible.sort(),
      wouldPauseWorkItemIds: shouldPause && !globalRejected ? eligible.sort() : [],
      fencePassedWorkItemIds: globalRejected ? [] : fencePassed.sort(),
      terminalWorkItemIds: globalRejected ? [] : terminal.sort(),
      reasonCodes,
      persistenceAuthorized: false as const,
      cancellationAuthorized: false as const,
      effects: ZERO_EFFECTS,
    });
  } catch {
    throw new Error("synthetic_originated_stop_decision_invalid");
  }
}

function normalizeEvent(value: unknown): EventSnapshot {
  const input = exactRecord(value, [
    "id", "workspaceId", "companyId", "contactId", "connectionId", "connectionSubjectId", "originatedMessageId",
    "originatedThreadId", "kind", "senderAddress", "bounceClass", "subjectDigest", "excerptDigest",
    "suppressionSubjectIds", "stopDependencyIds", "occurredAt",
  ]);
  const kind = enumValue(input.kind, ["confirmed_reply", "ambiguous_reply", "bounce"] as const);
  let senderAddress: string | null;
  let bounceClass: "hard" | "soft" | null;
  if (kind === "bounce") {
    if (input.senderAddress !== null) invalid();
    senderAddress = null;
    bounceClass = enumValue(input.bounceClass, ["hard", "soft"] as const);
  } else {
    senderAddress = syntheticEmail(input.senderAddress);
    if (input.bounceClass !== null) invalid();
    bounceClass = null;
  }
  return deepFreeze({
    id: syntheticId(input.id),
    workspaceId: syntheticId(input.workspaceId),
    companyId: syntheticId(input.companyId),
    contactId: syntheticId(input.contactId),
    connectionId: syntheticId(input.connectionId),
    connectionSubjectId: syntheticId(input.connectionSubjectId),
    originatedMessageId: syntheticId(input.originatedMessageId),
    originatedThreadId: syntheticId(input.originatedThreadId),
    kind,
    senderAddress,
    bounceClass,
    subjectDigest: digest(input.subjectDigest),
    excerptDigest: digest(input.excerptDigest),
    suppressionSubjectIds: sortedUnique(input.suppressionSubjectIds, 1, 32),
    stopDependencyIds: sortedUnique(input.stopDependencyIds, 1, 64),
    occurredAt: timestamp(input.occurredAt),
  });
}

function normalizeAuthority(value: unknown) {
  const input = exactRecord(value, [
    "evaluatedAt", "workspaceId", "companyId", "contactId", "connectionId", "connectionSubjectId",
    "connectionActive", "connectionSubjectPinned", "eventAuthenticationValid", "knownOriginatedPairs",
    "suppressionSubjectIds", "stopDependencyIds", "eventAlreadyRecorded",
  ]);
  return deepFreeze({
    evaluatedAt: timestamp(input.evaluatedAt),
    workspaceId: syntheticId(input.workspaceId),
    companyId: syntheticId(input.companyId),
    contactId: syntheticId(input.contactId),
    connectionId: syntheticId(input.connectionId),
    connectionSubjectId: syntheticId(input.connectionSubjectId),
    connectionActive: booleanValue(input.connectionActive),
    connectionSubjectPinned: booleanValue(input.connectionSubjectPinned),
    eventAuthenticationValid: booleanValue(input.eventAuthenticationValid),
    knownOriginatedPairs: normalizeOriginatedPairs(input.knownOriginatedPairs),
    suppressionSubjectIds: sortedUnique(input.suppressionSubjectIds, 1, 32),
    stopDependencyIds: sortedUnique(input.stopDependencyIds, 1, 64),
    eventAlreadyRecorded: booleanValue(input.eventAlreadyRecorded),
  });
}

function normalizeOriginatedPairs(value: unknown) {
  const pairs = denseArray(value, 1, 64).map((entry) => {
    const input = exactRecord(entry, ["messageId", "threadId"]);
    return deepFreeze({
      messageId: syntheticId(input.messageId),
      threadId: syntheticId(input.threadId),
    });
  }).sort((left, right) => `${left.messageId}\0${left.threadId}`.localeCompare(`${right.messageId}\0${right.threadId}`));
  const keys = pairs.map((pair) => `${pair.messageId}\0${pair.threadId}`);
  if (new Set(keys).size !== keys.length) invalid();
  return deepFreeze(pairs);
}

function normalizeWorkItems(value: unknown): readonly WorkItem[] {
  const items = denseArray(value, 0, 32).map((entry) => {
    const input = exactRecord(entry, [
      "id", "workspaceId", "companyId", "contactId", "originatedMessageId", "originatedThreadId", "channel",
      "isFollowUp", "state", "leaseGeneration", "preCallDecisionRecorded", "providerAttemptCount",
    ]);
    if (input.channel !== "email") invalid();
    const state = enumValue(input.state, ["pending", "leased", "dispatching", "sent", "cancelled", "delivery_unknown"] as const);
    const leaseGeneration = input.leaseGeneration === null ? null : positiveInteger(input.leaseGeneration);
    if ((state === "leased" || state === "dispatching") !== (leaseGeneration !== null)) invalid();
    const providerAttemptCount = nonNegativeInteger(input.providerAttemptCount);
    const preCallDecisionRecorded = booleanValue(input.preCallDecisionRecorded);
    if (state === "pending" && (providerAttemptCount !== 0 || preCallDecisionRecorded)) invalid();
    return {
      id: syntheticId(input.id),
      workspaceId: syntheticId(input.workspaceId),
      companyId: syntheticId(input.companyId),
      contactId: syntheticId(input.contactId),
      originatedMessageId: syntheticId(input.originatedMessageId),
      originatedThreadId: syntheticId(input.originatedThreadId),
      channel: "email" as const,
      isFollowUp: booleanValue(input.isFollowUp),
      state,
      leaseGeneration,
      preCallDecisionRecorded,
      providerAttemptCount,
    };
  }).sort((left, right) => left.id.localeCompare(right.id));
  if (new Set(items.map((item) => item.id)).size !== items.length) invalid();
  return deepFreeze(items);
}

function matches(event: EventSnapshot, item: WorkItem) {
  return item.workspaceId === event.workspaceId
    && item.companyId === event.companyId
    && item.contactId === event.contactId
    && item.originatedMessageId === event.originatedMessageId
    && item.originatedThreadId === event.originatedThreadId
    && item.channel === "email"
    && item.isFollowUp;
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

function syntheticEmail(value: unknown) {
  if (typeof value !== "string") invalid();
  const normalized = value.normalize("NFC").trim().toLowerCase();
  if (normalized.length > 254 || !SYNTHETIC_EMAIL.test(normalized)) invalid();
  return normalized;
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
