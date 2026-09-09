type Effects = Readonly<{
  providerCalls: 0;
  outboxMutations: 0;
  sendInvocations: 0;
  callInvocations: 0;
  exportMutations: 0;
  durableMutations: 0;
}>;

type Reference = Readonly<{ id: string; digest: string }>;
type ExpiringReference = Readonly<Reference & { expiresAt: number }>;
type Lease = Readonly<{ id: string; holderId: string; generation: number; expiresAt: number }>;
type RecipientDigests = Readonly<{
  to: readonly string[];
  cc: readonly string[];
  bcc: readonly string[];
}>;

type ManifestSnapshot = Readonly<{
  id: string;
  workspaceId: string;
  companyId: string;
  prospectId: string;
  contactId: string;
  outboxItemId: string;
  sendKey: string;
  dispatchKey: string;
  packageArtifact: Reference;
  messageArtifact: Readonly<Reference & { packageId: string; packageDigest: string }>;
  packageApproval: ExpiringReference;
  messageApproval: ExpiringReference;
  lease: Lease;
  finalRecheck: Readonly<Reference & { status: "synthetic_recheck_passed_no_authority" }>;
  preCallReceipt: Readonly<ExpiringReference>;
  attemptPreparation: Readonly<Reference & { status: "prepared_no_invocation" }>;
  senderConnectionDigest: string;
  fromAddressDigest: string;
  replyToAddressDigest: string;
  recipientDigests: RecipientDigests;
  subjectDigest: string;
  textBodyDigest: string;
  htmlBodyDigest: string;
  linkManifestDigest: string;
  attachmentManifestDigest: string;
  rfcMessageIdDigest: string;
  originatedMarkerDigest: string;
  unsubscribeAuthorityDigest: string;
  createdAt: number;
}>;

export type SyntheticMailDispatchEnvelopeManifest = Readonly<{
  kind: "synthetic_mail_dispatch_envelope_manifest";
  id: string;
  digest: string;
  snapshot: ManifestSnapshot;
  payloadConstructed: false;
  mailPortResolvable: false;
  providerSelected: false;
  credentialReferencePresent: false;
  dispatchAuthorized: false;
  providerInvocationAuthorized: false;
  requestTransmitted: false;
  effects: Effects;
}>;

const SYNTHETIC_ID = /^synthetic-[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/u;
const DIGEST = /^[a-f0-9]{64}$/u;
const manifests = new WeakSet<object>();
const ZERO_EFFECTS: Effects = deepFreeze({
  providerCalls: 0,
  outboxMutations: 0,
  sendInvocations: 0,
  callInvocations: 0,
  exportMutations: 0,
  durableMutations: 0,
});

/**
 * Canonicalizes only the digest manifest a future trusted worker would bind to
 * a provider envelope. It contains no address, content, attachment, endpoint,
 * credential reference, provider selection, payload bytes, or callable port.
 */
export async function buildSyntheticMailDispatchEnvelopeManifest(
  value: unknown,
): Promise<SyntheticMailDispatchEnvelopeManifest> {
  try {
    const snapshot = normalizeManifest(value);
    const artifact: SyntheticMailDispatchEnvelopeManifest = deepFreeze({
      kind: "synthetic_mail_dispatch_envelope_manifest",
      id: snapshot.id,
      digest: await sha256(JSON.stringify(snapshot)),
      snapshot,
      payloadConstructed: false,
      mailPortResolvable: false,
      providerSelected: false,
      credentialReferencePresent: false,
      dispatchAuthorized: false,
      providerInvocationAuthorized: false,
      requestTransmitted: false,
      effects: ZERO_EFFECTS,
    });
    manifests.add(artifact);
    return artifact;
  } catch {
    throw new Error("synthetic_mail_dispatch_envelope_manifest_invalid");
  }
}

/** Rechecks manifest currency while preserving a literal no-effect result. */
export async function evaluateSyntheticMailDispatchEnvelopeManifest(value: unknown) {
  try {
    const input = exactRecord(value, ["manifest", "currentManifest", "currentAuthority"]);
    if (!manifests.has(input.manifest as object)) invalid();
    const manifest = input.manifest as SyntheticMailDispatchEnvelopeManifest;
    const current = await buildSyntheticMailDispatchEnvelopeManifest(input.currentManifest);
    const authority = normalizeAuthority(input.currentAuthority);
    const reasons: string[] = [];

    if (current.digest !== manifest.digest) reasons.push("envelope_manifest_changed");
    if (authority.evaluatedAt < manifest.snapshot.createdAt) reasons.push("evaluation_precedes_manifest_creation");
    if (authority.evaluatedAt >= manifest.snapshot.lease.expiresAt) reasons.push("lease_expired");
    if (authority.evaluatedAt >= manifest.snapshot.preCallReceipt.expiresAt) reasons.push("pre_call_receipt_expired");
    if (authority.evaluatedAt >= manifest.snapshot.packageApproval.expiresAt) reasons.push("package_approval_expired");
    if (authority.evaluatedAt >= manifest.snapshot.messageApproval.expiresAt) reasons.push("message_approval_expired");
    if (authority.leaseGeneration !== manifest.snapshot.lease.generation) reasons.push("lease_generation_changed");
    if (!authority.artifactBindingsCurrent) reasons.push("artifact_bindings_not_current");
    if (!authority.approvalBindingsCurrent) reasons.push("approval_bindings_not_current");
    if (!authority.senderBindingCurrent) reasons.push("sender_binding_not_current");
    if (!authority.recipientBindingsCurrent) reasons.push("recipient_bindings_not_current");
    if (!authority.contentBindingsCurrent) reasons.push("content_bindings_not_current");
    if (!authority.unsubscribeBindingCurrent) reasons.push("unsubscribe_binding_not_current");
    if (!authority.originatedMarkersCurrent) reasons.push("originated_markers_not_current");
    if (!authority.finalRecheckCurrent) reasons.push("final_recheck_not_current");
    if (!authority.preCallReceiptCurrent) reasons.push("pre_call_receipt_not_current");
    if (!authority.attemptPreparationCurrent) reasons.push("attempt_preparation_not_current");
    if (!authority.externalEffectsDisabled) reasons.push("external_effects_not_disabled");

    const reasonCodes = deepFreeze([...new Set(reasons)].sort());
    return deepFreeze({
      kind: "synthetic_mail_dispatch_envelope_manifest_decision" as const,
      status: reasonCodes.length === 0
        ? "synthetic_mail_dispatch_envelope_manifest_current_no_authority" as const
        : "synthetic_mail_dispatch_envelope_manifest_rejected" as const,
      manifestId: manifest.id,
      manifestDigest: manifest.digest,
      reasonCodes,
      payloadConstructed: false as const,
      mailPortResolvable: false as const,
      providerSelected: false as const,
      credentialReferencePresent: false as const,
      dispatchAuthorized: false as const,
      providerInvocationAuthorized: false as const,
      persistenceAuthorized: false as const,
      requestTransmitted: false as const,
      automaticRetryAuthorized: false as const,
      effects: ZERO_EFFECTS,
    });
  } catch {
    throw new Error("synthetic_mail_dispatch_envelope_manifest_invalid");
  }
}

function normalizeManifest(value: unknown): ManifestSnapshot {
  const input = exactRecord(value, [
    "id", "workspaceId", "companyId", "prospectId", "contactId", "outboxItemId", "sendKey", "dispatchKey",
    "packageArtifact", "messageArtifact", "packageApproval", "messageApproval", "lease", "finalRecheck",
    "preCallReceipt", "attemptPreparation", "senderConnectionDigest", "fromAddressDigest", "replyToAddressDigest",
    "recipientDigests", "subjectDigest", "textBodyDigest", "htmlBodyDigest", "linkManifestDigest",
    "attachmentManifestDigest", "rfcMessageIdDigest", "originatedMarkerDigest", "unsubscribeAuthorityDigest", "createdAt",
  ]);
  const packageArtifact = reference(input.packageArtifact);
  const messageInput = exactRecord(input.messageArtifact, ["id", "digest", "packageId", "packageDigest"]);
  const messageArtifact = deepFreeze({
    id: syntheticId(messageInput.id),
    digest: digest(messageInput.digest),
    packageId: syntheticId(messageInput.packageId),
    packageDigest: digest(messageInput.packageDigest),
  });
  if (messageArtifact.packageId !== packageArtifact.id || messageArtifact.packageDigest !== packageArtifact.digest) invalid();

  const packageApproval = expiringReference(input.packageApproval);
  const messageApproval = expiringReference(input.messageApproval);
  const lease = normalizeLease(input.lease);
  const finalInput = exactRecord(input.finalRecheck, ["id", "digest", "status"]);
  if (finalInput.status !== "synthetic_recheck_passed_no_authority") invalid();
  const finalRecheck = deepFreeze({
    id: syntheticId(finalInput.id),
    digest: digest(finalInput.digest),
    status: finalInput.status,
  });
  const preCallReceipt = expiringReference(input.preCallReceipt);
  const preparationInput = exactRecord(input.attemptPreparation, ["id", "digest", "status"]);
  if (preparationInput.status !== "prepared_no_invocation") invalid();
  const attemptPreparation = deepFreeze({
    id: syntheticId(preparationInput.id),
    digest: digest(preparationInput.digest),
    status: preparationInput.status,
  });
  const createdAt = timestamp(input.createdAt);
  if (
    createdAt >= lease.expiresAt
    || createdAt >= preCallReceipt.expiresAt
    || preCallReceipt.expiresAt > lease.expiresAt
    || createdAt >= packageApproval.expiresAt
    || createdAt >= messageApproval.expiresAt
    || messageApproval.expiresAt > packageApproval.expiresAt
  ) invalid();

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
    packageApproval,
    messageApproval,
    lease,
    finalRecheck,
    preCallReceipt,
    attemptPreparation,
    senderConnectionDigest: digest(input.senderConnectionDigest),
    fromAddressDigest: digest(input.fromAddressDigest),
    replyToAddressDigest: digest(input.replyToAddressDigest),
    recipientDigests: normalizeRecipients(input.recipientDigests),
    subjectDigest: digest(input.subjectDigest),
    textBodyDigest: digest(input.textBodyDigest),
    htmlBodyDigest: digest(input.htmlBodyDigest),
    linkManifestDigest: digest(input.linkManifestDigest),
    attachmentManifestDigest: digest(input.attachmentManifestDigest),
    rfcMessageIdDigest: digest(input.rfcMessageIdDigest),
    originatedMarkerDigest: digest(input.originatedMarkerDigest),
    unsubscribeAuthorityDigest: digest(input.unsubscribeAuthorityDigest),
    createdAt,
  });
}

function normalizeAuthority(value: unknown) {
  const input = exactRecord(value, [
    "evaluatedAt", "leaseGeneration", "artifactBindingsCurrent", "approvalBindingsCurrent", "senderBindingCurrent",
    "recipientBindingsCurrent", "contentBindingsCurrent", "unsubscribeBindingCurrent", "originatedMarkersCurrent",
    "finalRecheckCurrent", "preCallReceiptCurrent", "attemptPreparationCurrent", "externalEffectsDisabled",
  ]);
  return {
    evaluatedAt: timestamp(input.evaluatedAt),
    leaseGeneration: positiveInteger(input.leaseGeneration),
    artifactBindingsCurrent: boolean(input.artifactBindingsCurrent),
    approvalBindingsCurrent: boolean(input.approvalBindingsCurrent),
    senderBindingCurrent: boolean(input.senderBindingCurrent),
    recipientBindingsCurrent: boolean(input.recipientBindingsCurrent),
    contentBindingsCurrent: boolean(input.contentBindingsCurrent),
    unsubscribeBindingCurrent: boolean(input.unsubscribeBindingCurrent),
    originatedMarkersCurrent: boolean(input.originatedMarkersCurrent),
    finalRecheckCurrent: boolean(input.finalRecheckCurrent),
    preCallReceiptCurrent: boolean(input.preCallReceiptCurrent),
    attemptPreparationCurrent: boolean(input.attemptPreparationCurrent),
    externalEffectsDisabled: boolean(input.externalEffectsDisabled),
  };
}

function normalizeRecipients(value: unknown): RecipientDigests {
  const input = exactRecord(value, ["to", "cc", "bcc"]);
  const to = digestList(input.to, 1, 16);
  const cc = digestList(input.cc, 0, 16);
  const bcc = digestList(input.bcc, 0, 16);
  const all = [...to, ...cc, ...bcc];
  if (new Set(all).size !== all.length) invalid();
  return deepFreeze({ to, cc, bcc });
}

function digestList(value: unknown, minimum: number, maximum: number): readonly string[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) invalid();
  const values = value.map(digest);
  if (new Set(values).size !== values.length || JSON.stringify(values) !== JSON.stringify([...values].sort())) invalid();
  return deepFreeze(values);
}

function reference(value: unknown): Reference {
  const input = exactRecord(value, ["id", "digest"]);
  return deepFreeze({ id: syntheticId(input.id), digest: digest(input.digest) });
}

function expiringReference(value: unknown): ExpiringReference {
  const input = exactRecord(value, ["id", "digest", "expiresAt"]);
  return deepFreeze({ id: syntheticId(input.id), digest: digest(input.digest), expiresAt: timestamp(input.expiresAt) });
}

function normalizeLease(value: unknown): Lease {
  const input = exactRecord(value, ["id", "holderId", "generation", "expiresAt"]);
  return deepFreeze({
    id: syntheticId(input.id),
    holderId: syntheticId(input.holderId),
    generation: positiveInteger(input.generation),
    expiresAt: timestamp(input.expiresAt),
  });
}

function exactRecord(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) invalid();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const actualKeys = Reflect.ownKeys(descriptors);
  if (actualKeys.some((key) => typeof key !== "string")
    || (actualKeys as string[]).sort().join("\0") !== [...keys].sort().join("\0")) invalid();
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) invalid();
    result[key] = descriptor.value;
  }
  return result;
}

function syntheticId(value: unknown): string {
  if (typeof value !== "string" || !SYNTHETIC_ID.test(value)) invalid();
  return value;
}

function digest(value: unknown): string {
  if (typeof value !== "string" || !DIGEST.test(value)) invalid();
  return value;
}

function timestamp(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) invalid();
  return Number(value);
}

function positiveInteger(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) invalid();
  return Number(value);
}

function boolean(value: unknown): boolean {
  if (typeof value !== "boolean") invalid();
  return value;
}

function invalid(): never {
  throw new Error("invalid");
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const output = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(output)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
