type Effects = Readonly<{
  providerCalls: 0;
  outboxMutations: 0;
  sendInvocations: 0;
  callInvocations: 0;
  exportMutations: 0;
  durableMutations: 0;
}>;

type ContactPoint = Readonly<{
  id: string;
  kind: "email" | "phone";
  value: string;
  verificationClass: "mailbox_verified" | "source_verified";
  freshUntil: number;
}>;

type PackageSnapshot = Readonly<{
  id: string;
  workspaceId: string;
  companyId: string;
  prospectId: string;
  contactId: string;
  profileConfigurationId: string;
  profileConfigurationDigest: string;
  qualificationEvidenceHashes: readonly string[];
  sourceHashes: readonly string[];
  recommendedAngle: string;
  claimGuardrailVersionIds: readonly string[];
  selectedContactPoints: readonly ContactPoint[];
  messageVersionIds: readonly string[];
  createdAt: number;
}>;

type MessageSnapshot = Readonly<{
  id: string;
  packageId: string;
  packageDigest: string;
  profileConfigurationId: string;
  profileConfigurationDigest: string;
  sender: Readonly<{ from: string; replyTo: string }>;
  recipients: Readonly<{ to: readonly string[]; cc: readonly string[]; bcc: readonly string[] }>;
  subject: string;
  textBody: string;
  htmlBody: string;
  links: readonly string[];
  attachments: readonly Readonly<{ id: string; filename: string; mediaType: string; sizeBytes: number; digest: string }>[];
  threadId: string | null;
  replyToMessageId: string | null;
  intendedSendAt: number;
  timezone: "UTC" | "America/Toronto";
}>;

export type SyntheticOutreachPackageArtifact = Readonly<{
  kind: "synthetic_outreach_package_artifact";
  id: string;
  digest: string;
  snapshot: PackageSnapshot;
  callScript: Readonly<{
    opening: string;
    evidenceHashes: readonly string[];
    claimGuardrailVersionIds: readonly string[];
    digest: string;
  }>;
  effects: Effects;
}>;

export type SyntheticMessageArtifact = Readonly<{
  kind: "synthetic_outreach_message_artifact";
  id: string;
  packageId: string;
  packageDigest: string;
  digest: string;
  snapshot: MessageSnapshot;
  effects: Effects;
}>;

const SYNTHETIC_ID = /^synthetic-[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/u;
const DIGEST = /^[a-f0-9]{64}$/u;
const SYNTHETIC_EMAIL = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.invalid$/u;
const SYNTHETIC_PHONE = /^\+1\d{3}55501\d{2}$/u;
const SAFE_FILENAME = /^[a-z0-9][a-z0-9._-]{0,126}[a-z0-9]$/u;
const packageArtifacts = new WeakSet<object>();
const messageArtifacts = new WeakSet<object>();
const ZERO_EFFECTS: Effects = deepFreeze({
  providerCalls: 0,
  outboxMutations: 0,
  sendInvocations: 0,
  callInvocations: 0,
  exportMutations: 0,
  durableMutations: 0,
});

/** Builds a deterministic, in-memory fixture. It is intentionally unreachable from application runtime. */
export async function buildSyntheticOutreachPackage(value: unknown): Promise<SyntheticOutreachPackageArtifact> {
  try {
    const snapshot = normalizePackage(value);
    const digest = await sha256(JSON.stringify(snapshot));
    const callScriptBase = {
      opening: snapshot.recommendedAngle,
      evidenceHashes: deepFreeze([...new Set([...snapshot.qualificationEvidenceHashes, ...snapshot.sourceHashes])].sort()),
      claimGuardrailVersionIds: snapshot.claimGuardrailVersionIds,
    };
    const callScript = deepFreeze({ ...callScriptBase, digest: await sha256(JSON.stringify(callScriptBase)) });
    const artifact: SyntheticOutreachPackageArtifact = deepFreeze({
      kind: "synthetic_outreach_package_artifact",
      id: snapshot.id,
      digest,
      snapshot,
      callScript,
      effects: ZERO_EFFECTS,
    });
    packageArtifacts.add(artifact);
    return artifact;
  } catch {
    throw new Error("synthetic_outreach_package_invalid");
  }
}

/** Builds a deterministic message description, never a provider payload or send command. */
export async function buildSyntheticMessageVersion(value: unknown): Promise<SyntheticMessageArtifact> {
  try {
    const snapshot = normalizeMessage(value);
    const digest = await sha256(JSON.stringify(snapshot));
    const artifact: SyntheticMessageArtifact = deepFreeze({
      kind: "synthetic_outreach_message_artifact",
      id: snapshot.id,
      packageId: snapshot.packageId,
      packageDigest: snapshot.packageDigest,
      digest,
      snapshot,
      effects: ZERO_EFFECTS,
    });
    messageArtifacts.add(artifact);
    return artifact;
  } catch {
    throw new Error("synthetic_outreach_message_invalid");
  }
}

/** Recomputes canonical artifacts and projects invalidation without changing any authority or state. */
export async function evaluateSyntheticArtifactValidity(value: unknown) {
  try {
    const input = exactRecord(value, ["packageArtifact", "messageArtifact", "currentPackage", "currentMessage", "authority"]);
    if (!packageArtifacts.has(input.packageArtifact as object) || !messageArtifacts.has(input.messageArtifact as object)) invalid();
    const packageArtifact = input.packageArtifact as SyntheticOutreachPackageArtifact;
    const messageArtifact = input.messageArtifact as SyntheticMessageArtifact;
    const currentPackage = await buildSyntheticOutreachPackage(input.currentPackage);
    const currentMessage = await buildSyntheticMessageVersion(input.currentMessage);
    const authority = normalizeAuthority(input.authority);
    const reasons: string[] = [];

    if (currentPackage.digest !== packageArtifact.digest) reasons.push("package_digest_changed");
    if (currentMessage.digest !== messageArtifact.digest) reasons.push("message_digest_changed");
    if (messageArtifact.packageId !== packageArtifact.id
      || messageArtifact.packageDigest !== packageArtifact.digest
      || !packageArtifact.snapshot.messageVersionIds.includes(messageArtifact.id)
      || messageArtifact.snapshot.profileConfigurationId !== packageArtifact.snapshot.profileConfigurationId
      || messageArtifact.snapshot.profileConfigurationDigest !== packageArtifact.snapshot.profileConfigurationDigest) {
      reasons.push("message_package_binding_changed");
    }
    if (!authority.profileAvailable) reasons.push("profile_unavailable");
    if (!authority.prospectApproved) reasons.push("prospect_not_approved");
    if (!authority.contactReady) reasons.push("contact_not_ready");
    if (authority.contactFreshUntil <= authority.evaluatedAt) reasons.push("contact_stale");
    if (authority.highRiskDrift) reasons.push("high_risk_drift");
    if (authority.suppressionBlocked) reasons.push("suppression_blocked");
    if (authority.revokedDependencyIds.some((id) => packageDependencies(packageArtifact).has(id))) reasons.push("dependency_revoked");
    if (authority.packageApprovalExpiresAt <= authority.evaluatedAt) reasons.push("package_approval_expired");
    if (authority.messageApprovalExpiresAt <= authority.evaluatedAt) reasons.push("message_approval_expired");

    const packageReasons = new Set([
      "package_digest_changed", "profile_unavailable", "prospect_not_approved", "contact_not_ready", "contact_stale",
      "high_risk_drift", "suppression_blocked", "dependency_revoked", "package_approval_expired",
    ]);
    const packageApprovalValid = !reasons.some((reason) => packageReasons.has(reason));
    return deepFreeze({
      kind: "synthetic_outreach_artifact_validity",
      packageApprovalValid,
      messageApprovalValid: packageApprovalValid && reasons.length === 0,
      reasonCodes: [...new Set(reasons)].sort(),
      currentPackageDigest: currentPackage.digest,
      currentMessageDigest: currentMessage.digest,
      effects: ZERO_EFFECTS,
    });
  } catch {
    throw new Error("synthetic_outreach_artifact_invalid");
  }
}

function normalizePackage(value: unknown): PackageSnapshot {
  const input = exactRecord(value, [
    "id", "workspaceId", "companyId", "prospectId", "contactId", "profileConfigurationId",
    "profileConfigurationDigest", "qualificationEvidenceHashes", "sourceHashes", "recommendedAngle",
    "claimGuardrailVersionIds", "selectedContactPoints", "messageVersionIds", "createdAt",
  ]);
  const recommendedAngle = boundedText(input.recommendedAngle, 512);
  if (!recommendedAngle.startsWith("Synthetic ")) invalid();
  const selectedContactPoints = denseArray(input.selectedContactPoints, 1, 8).map((entry) => {
    const point = exactRecord(entry, ["id", "kind", "value", "verificationClass", "freshUntil"]);
    const kind = point.kind;
    if (kind !== "email" && kind !== "phone") invalid();
    const verificationClass = point.verificationClass;
    if (verificationClass !== "mailbox_verified" && verificationClass !== "source_verified") invalid();
    return {
      id: syntheticId(point.id),
      kind,
      value: kind === "email" ? syntheticEmail(point.value) : syntheticPhone(point.value),
      verificationClass,
      freshUntil: timestamp(point.freshUntil),
    } satisfies ContactPoint;
  }).sort((a, b) => a.id.localeCompare(b.id));
  if (new Set(selectedContactPoints.map((point) => point.id)).size !== selectedContactPoints.length) invalid();
  return deepFreeze({
    id: syntheticId(input.id),
    workspaceId: syntheticId(input.workspaceId),
    companyId: syntheticId(input.companyId),
    prospectId: syntheticId(input.prospectId),
    contactId: syntheticId(input.contactId),
    profileConfigurationId: syntheticId(input.profileConfigurationId),
    profileConfigurationDigest: digestValue(input.profileConfigurationDigest),
    qualificationEvidenceHashes: sortedUnique(input.qualificationEvidenceHashes, digestValue),
    sourceHashes: sortedUnique(input.sourceHashes, digestValue),
    recommendedAngle,
    claimGuardrailVersionIds: sortedUnique(input.claimGuardrailVersionIds, syntheticId),
    selectedContactPoints,
    messageVersionIds: sortedUnique(input.messageVersionIds, syntheticId),
    createdAt: timestamp(input.createdAt),
  });
}

function normalizeMessage(value: unknown): MessageSnapshot {
  const input = exactRecord(value, [
    "id", "packageId", "packageDigest", "profileConfigurationId", "profileConfigurationDigest", "sender",
    "recipients", "subject", "textBody", "htmlBody", "links", "attachments", "threadId", "replyToMessageId",
    "intendedSendAt", "timezone",
  ]);
  const senderInput = exactRecord(input.sender, ["from", "replyTo"]);
  const sender = { from: syntheticEmail(senderInput.from), replyTo: syntheticEmail(senderInput.replyTo) };
  const recipientsInput = exactRecord(input.recipients, ["to", "cc", "bcc"]);
  const recipients = {
    to: sortedUnique(recipientsInput.to, syntheticEmail, 1, 32),
    cc: sortedUnique(recipientsInput.cc, syntheticEmail, 0, 32),
    bcc: sortedUnique(recipientsInput.bcc, syntheticEmail, 0, 32),
  };
  const everyRecipient = [...recipients.to, ...recipients.cc, ...recipients.bcc];
  if (new Set(everyRecipient).size !== everyRecipient.length) invalid();
  const subject = boundedText(input.subject, 256);
  const textBody = boundedText(input.textBody, 32_000);
  const htmlBody = boundedText(input.htmlBody, 64_000);
  if (!subject.startsWith("[SYNTHETIC]") || !/synthetic/iu.test(textBody) || !/synthetic/iu.test(htmlBody)) invalid();
  if (/<\s*(?:script|iframe|object|embed)|\bon[a-z]+\s*=|(?:javascript|data)\s*:/iu.test(htmlBody)) invalid();
  const links = sortedUnique(input.links, syntheticLink, 0, 32);
  const attachments = denseArray(input.attachments, 0, 16).map((entry) => {
    const attachment = exactRecord(entry, ["id", "filename", "mediaType", "sizeBytes", "digest"]);
    const filename = boundedText(attachment.filename, 128).toLowerCase();
    if (!SAFE_FILENAME.test(filename) || filename.includes("..")) invalid();
    if (attachment.mediaType !== "text/plain" && attachment.mediaType !== "application/pdf") invalid();
    const sizeBytes = positiveInteger(attachment.sizeBytes);
    if (sizeBytes > 5_000_000) invalid();
    return {
      id: syntheticId(attachment.id),
      filename,
      mediaType: attachment.mediaType,
      sizeBytes,
      digest: digestValue(attachment.digest),
    };
  }).sort((a, b) => a.id.localeCompare(b.id));
  if (new Set(attachments.map((attachment) => attachment.id)).size !== attachments.length) invalid();
  const timezone = input.timezone;
  if (timezone !== "UTC" && timezone !== "America/Toronto") invalid();
  return deepFreeze({
    id: syntheticId(input.id),
    packageId: syntheticId(input.packageId),
    packageDigest: digestValue(input.packageDigest),
    profileConfigurationId: syntheticId(input.profileConfigurationId),
    profileConfigurationDigest: digestValue(input.profileConfigurationDigest),
    sender,
    recipients,
    subject,
    textBody,
    htmlBody,
    links,
    attachments,
    threadId: nullableSyntheticId(input.threadId),
    replyToMessageId: nullableSyntheticId(input.replyToMessageId),
    intendedSendAt: timestamp(input.intendedSendAt),
    timezone,
  });
}

function normalizeAuthority(value: unknown) {
  const input = exactRecord(value, [
    "evaluatedAt", "packageApprovalExpiresAt", "messageApprovalExpiresAt", "profileAvailable", "prospectApproved",
    "contactReady", "contactFreshUntil", "highRiskDrift", "suppressionBlocked", "revokedDependencyIds",
  ]);
  return deepFreeze({
    evaluatedAt: timestamp(input.evaluatedAt),
    packageApprovalExpiresAt: timestamp(input.packageApprovalExpiresAt),
    messageApprovalExpiresAt: timestamp(input.messageApprovalExpiresAt),
    profileAvailable: booleanValue(input.profileAvailable),
    prospectApproved: booleanValue(input.prospectApproved),
    contactReady: booleanValue(input.contactReady),
    contactFreshUntil: timestamp(input.contactFreshUntil),
    highRiskDrift: booleanValue(input.highRiskDrift),
    suppressionBlocked: booleanValue(input.suppressionBlocked),
    revokedDependencyIds: sortedUnique(input.revokedDependencyIds, syntheticId, 0, 128),
  });
}

function packageDependencies(artifact: SyntheticOutreachPackageArtifact) {
  return new Set([
    artifact.snapshot.profileConfigurationId,
    ...artifact.snapshot.claimGuardrailVersionIds,
    ...artifact.snapshot.selectedContactPoints.map((point) => point.id),
    ...artifact.snapshot.messageVersionIds,
  ]);
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
  const output: unknown[] = [];
  for (const key of expected) {
    const descriptor = descriptors[key];
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) invalid();
    output.push(descriptor.value);
  }
  return output;
}

function sortedUnique(
  value: unknown,
  normalize: (entry: unknown) => string,
  minimum = 1,
  maximum = 128,
): readonly string[] {
  const entries = denseArray(value, minimum, maximum).map(normalize).sort();
  if (new Set(entries).size !== entries.length) invalid();
  return deepFreeze(entries);
}

function syntheticId(value: unknown) {
  if (typeof value !== "string" || !SYNTHETIC_ID.test(value)) invalid();
  return value;
}

function nullableSyntheticId(value: unknown) {
  return value === null ? null : syntheticId(value);
}

function digestValue(value: unknown) {
  if (typeof value !== "string" || !DIGEST.test(value)) invalid();
  return value;
}

function syntheticEmail(value: unknown) {
  if (typeof value !== "string") invalid();
  const normalized = value.normalize("NFC").trim().toLowerCase();
  if (normalized.length > 254 || !SYNTHETIC_EMAIL.test(normalized)) invalid();
  return normalized;
}

function syntheticPhone(value: unknown) {
  if (typeof value !== "string" || !SYNTHETIC_PHONE.test(value)) invalid();
  return value;
}

function syntheticLink(value: unknown) {
  if (typeof value !== "string" || value.length > 2_048) invalid();
  const parsed = new URL(value);
  if (parsed.protocol !== "https:" || !parsed.hostname.endsWith(".invalid") || parsed.username || parsed.password || parsed.hash) invalid();
  return parsed.href;
}

function boundedText(value: unknown, maximum: number) {
  if (typeof value !== "string") invalid();
  const normalized = value.normalize("NFC").trim();
  if (!normalized || normalized.length > maximum) invalid();
  return normalized;
}

function timestamp(value: unknown) {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) invalid();
  return value as number;
}

function positiveInteger(value: unknown) {
  return timestamp(value);
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
