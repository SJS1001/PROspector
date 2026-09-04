/**
 * Provider-neutral mail boundary. The trusted domain owns approval, leases,
 * suppression, persistence, and retry decisions; implementations of this port
 * may only act on the exact immutable references supplied by that domain.
 */

export type ApprovedImmutableMessageReference = Readonly<{
  workspaceId: string;
  companyId: string;
  messageVersionId: string;
  messageDigest: string;
  messageApprovalId: string;
  messageApprovalDigest: string;
  packageVersionId: string;
  packageDigest: string;
  profileConfigurationId: string;
  profileConfigurationDigest: string;
}>;

export type MailDispatchIdempotency = Readonly<{
  outboxItemId: string;
  sendKey: string;
  leaseGeneration: number;
  providerAttempt: 1;
}>;

export type OriginatedMessageReference = Readonly<{
  originatedMessageId: string;
  originatedThreadId: string;
  rfcMessageId: string;
  marker: string;
}>;

export type OriginatedMessageReferenceInput = Readonly<{
  approvedMessage: ApprovedImmutableMessageReference;
  idempotency: MailDispatchIdempotency;
  originatedMessageId: string;
  originatedThreadId: string;
}>;

export type MailDispatchEnvelope = Readonly<{
  approvedMessage: ApprovedImmutableMessageReference;
  idempotency: MailDispatchIdempotency;
  originated: OriginatedMessageReference;
}>;

export type MailDispatchAccepted = Readonly<{
  status: "accepted";
  originated: OriginatedMessageReference;
  acceptedAt: number;
  automaticRetryAuthorized: false;
}>;

export type MailDispatchDefiniteFailure = Readonly<{
  status: "definite_failure";
  reason:
    | "connection_unavailable"
    | "sender_unavailable"
    | "request_rejected_before_transmission";
  requestTransmitted: false;
  automaticRetryAuthorized: false;
}>;

export type MailDispatchDeliveryUnknown = Readonly<{
  status: "delivery_unknown";
  ambiguity:
    | "accepted_response_lost"
    | "request_transmission_unknown"
    | "post_acceptance_persistence_failed";
  originated: OriginatedMessageReference;
  ownerReconciliationRequired: true;
  automaticRetryAuthorized: false;
}>;

export type MailDispatchResult =
  | MailDispatchAccepted
  | MailDispatchDefiniteFailure
  | MailDispatchDeliveryUnknown;

export type MailReconciliationRequest = Readonly<{
  approvedMessage: ApprovedImmutableMessageReference;
  idempotency: MailDispatchIdempotency;
  deliveryUnknownRecordedAt: number;
  originated: OriginatedMessageReference;
}>;

export type MailReconciliationResult =
  | Readonly<{
      status: "sent_confirmed";
      evidence: "exact_originated_match";
      originated: OriginatedMessageReference;
      observedAt: number;
      automaticRetryAuthorized: false;
    }>
  | Readonly<{
      status: "delivery_unknown";
      evidence: "not_found" | "conflicting_evidence" | "connection_unavailable";
      ownerReconciliationRequired: true;
      automaticRetryAuthorized: false;
    }>;

export type OriginatedEventSyncRequest = Readonly<{
  workspaceId: string;
  connectionId: string;
  originated: readonly OriginatedMessageReference[];
  observedAfter: number | null;
  observedThrough: number;
}>;

export type OriginatedMailEvent =
  | Readonly<{
      kind: "reply";
      originated: OriginatedMessageReference;
      sender: string;
      subject: string;
      excerpt: string;
      occurredAt: number;
    }>
  | Readonly<{
      kind: "bounce";
      originated: OriginatedMessageReference;
      bounceClass: "hard" | "soft";
      subject: string;
      excerpt: string;
      occurredAt: number;
    }>;

export type OriginatedEventSyncResult = Readonly<{
  events: readonly OriginatedMailEvent[];
  observedThrough: number;
}>;

export type MailPort = Readonly<{
  dispatch(envelope: MailDispatchEnvelope): Promise<MailDispatchResult>;
  reconcile(request: MailReconciliationRequest): Promise<MailReconciliationResult>;
  syncOriginatedEvents(request: OriginatedEventSyncRequest): Promise<OriginatedEventSyncResult>;
}>;

const OPAQUE_ID = /^[A-Za-z0-9][A-Za-z0-9:_-]{2,127}$/u;
const DIGEST = /^[a-f0-9]{64}$/u;

/** Constructs bounded reconciliation markers without consulting a provider. */
export async function createOriginatedMessageReference(
  value: unknown,
): Promise<OriginatedMessageReference> {
  try {
    const input = exactRecord(value, [
      "approvedMessage",
      "idempotency",
      "originatedMessageId",
      "originatedThreadId",
    ]);
    const approvedMessage = normalizeApprovedMessage(input.approvedMessage);
    const idempotency = normalizeIdempotency(input.idempotency);
    const originatedMessageId = opaqueId(input.originatedMessageId);
    const originatedThreadId = opaqueId(input.originatedThreadId);
    const material = JSON.stringify([
      "prospector-origin/v1",
      approvedMessage.workspaceId,
      approvedMessage.companyId,
      approvedMessage.messageVersionId,
      approvedMessage.messageDigest,
      approvedMessage.messageApprovalId,
      approvedMessage.messageApprovalDigest,
      approvedMessage.packageVersionId,
      approvedMessage.packageDigest,
      approvedMessage.profileConfigurationId,
      approvedMessage.profileConfigurationDigest,
      idempotency.outboxItemId,
      idempotency.sendKey,
      idempotency.leaseGeneration,
      idempotency.providerAttempt,
      originatedMessageId,
      originatedThreadId,
    ]);
    const digest = await sha256(material);
    return Object.freeze({
      originatedMessageId,
      originatedThreadId,
      rfcMessageId: `<${digest}@prospector.invalid>`,
      marker: `prospector-origin/v1:${digest}`,
    });
  } catch {
    throw new Error("originated_message_reference_invalid");
  }
}

function normalizeApprovedMessage(value: unknown): ApprovedImmutableMessageReference {
  const input = exactRecord(value, [
    "workspaceId",
    "companyId",
    "messageVersionId",
    "messageDigest",
    "messageApprovalId",
    "messageApprovalDigest",
    "packageVersionId",
    "packageDigest",
    "profileConfigurationId",
    "profileConfigurationDigest",
  ]);
  return Object.freeze({
    workspaceId: opaqueId(input.workspaceId),
    companyId: opaqueId(input.companyId),
    messageVersionId: opaqueId(input.messageVersionId),
    messageDigest: digest(input.messageDigest),
    messageApprovalId: opaqueId(input.messageApprovalId),
    messageApprovalDigest: digest(input.messageApprovalDigest),
    packageVersionId: opaqueId(input.packageVersionId),
    packageDigest: digest(input.packageDigest),
    profileConfigurationId: opaqueId(input.profileConfigurationId),
    profileConfigurationDigest: digest(input.profileConfigurationDigest),
  });
}

function normalizeIdempotency(value: unknown): MailDispatchIdempotency {
  const input = exactRecord(value, ["outboxItemId", "sendKey", "leaseGeneration", "providerAttempt"]);
  if (!Number.isSafeInteger(input.leaseGeneration) || Number(input.leaseGeneration) < 1) invalid();
  if (input.providerAttempt !== 1) invalid();
  return Object.freeze({
    outboxItemId: opaqueId(input.outboxItemId),
    sendKey: opaqueId(input.sendKey),
    leaseGeneration: Number(input.leaseGeneration),
    providerAttempt: 1,
  });
}

function exactRecord(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) invalid();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const actualKeys = Reflect.ownKeys(descriptors);
  if (
    actualKeys.some((key) => typeof key !== "string")
    || (actualKeys as string[]).sort().join("\0") !== [...keys].sort().join("\0")
  ) invalid();
  const record: Record<string, unknown> = {};
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) invalid();
    record[key] = descriptor.value;
  }
  return record;
}

function opaqueId(value: unknown): string {
  if (typeof value !== "string" || !OPAQUE_ID.test(value)) invalid();
  return value;
}

function digest(value: unknown): string {
  if (typeof value !== "string" || !DIGEST.test(value)) invalid();
  return value;
}

function invalid(): never {
  throw new Error("invalid");
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digestBytes = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digestBytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
