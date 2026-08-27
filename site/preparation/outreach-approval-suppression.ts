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
type Approval = Readonly<{
  id: string;
  artifactId: string;
  artifactDigest: string;
  packageId: string;
  packageDigest: string;
  approvedAt: number;
  expiresAt: number;
  complianceAcknowledged: boolean;
}>;
type SuppressionKind = "company" | "organization" | "contact" | "exact_email" | "confirmed_email_domain" | "exact_phone";
type SuppressionChannel = "all" | "email" | "phone";
type Tombstone = Readonly<{
  id: string;
  kind: SuppressionKind;
  value: string;
  channel: SuppressionChannel;
  reason: "synthetic_owner_request";
  source: "synthetic_owner";
  effectiveAt: number;
}>;
type CommandReceipt = Readonly<{ idempotencyKey: string; operationDigest: string; resultingRevision: number }>;

export type SyntheticOutreachPreparationState = Readonly<{
  kind: "synthetic_outreach_preparation";
  revision: number;
  workspaceId: string;
  companyId: string;
  contactId: string;
  organizationId: string;
  selectedEmail: string;
  confirmedEmailDomains: readonly string[];
  selectedPhone: string;
  packageArtifact: Artifact;
  messageArtifact: MessageArtifact;
  packageApproval: Approval | null;
  messageApproval: Approval | null;
  tombstones: readonly Tombstone[];
  commandReceipts: readonly CommandReceipt[];
  effects: Effects;
}>;

type PackageApprovalCommand = Readonly<{
  type: "approve_package";
  idempotencyKey: string;
  approvalId: string;
  packageId: string;
  packageDigest: string;
  approvedAt: number;
  expiresAt: number;
}>;
type MessageApprovalCommand = Readonly<{
  type: "approve_message";
  idempotencyKey: string;
  approvalId: string;
  messageId: string;
  messageDigest: string;
  packageId: string;
  packageDigest: string;
  approvedAt: number;
  expiresAt: number;
  complianceAcknowledged: true;
}>;
type SuppressionCommand = Readonly<{
  type: "add_suppression";
  idempotencyKey: string;
  tombstoneId: string;
  subject: Readonly<{ kind: SuppressionKind; value: string; channel: SuppressionChannel }>;
  reason: "synthetic_owner_request";
  source: "synthetic_owner";
  effectiveAt: number;
}>;
type Command = PackageApprovalCommand | MessageApprovalCommand | SuppressionCommand;

const SYNTHETIC_ID = /^synthetic-[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/u;
const DIGEST = /^[a-f0-9]{64}$/u;
const SYNTHETIC_EMAIL = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.invalid$/u;
const SYNTHETIC_DOMAIN = /^[a-z0-9](?:[a-z0-9.-]{0,61}[a-z0-9])?\.invalid$/u;
const SYNTHETIC_PHONE = /^\+1\d{3}55501\d{2}$/u;
const activeStates = new WeakSet<object>();
const ZERO_EFFECTS: Effects = deepFreeze({
  providerCalls: 0,
  outboxMutations: 0,
  sendInvocations: 0,
  callInvocations: 0,
  exportMutations: 0,
  durableMutations: 0,
});

/**
 * Creates an isolated synthetic authority model. It is not imported by the
 * application and cannot enqueue, send, call, export, or persist anything.
 */
export function createSyntheticOutreachPreparation(value: unknown): SyntheticOutreachPreparationState {
  try {
    const input = exactRecord(value, [
      "workspaceId", "companyId", "contactId", "organizationId", "selectedEmail",
      "confirmedEmailDomains", "selectedPhone", "packageArtifact", "messageArtifact",
    ]);
    const packageArtifact = artifact(input.packageArtifact);
    const messageInput = exactRecord(input.messageArtifact, ["id", "digest", "packageId", "packageDigest"]);
    const messageArtifact: MessageArtifact = {
      id: syntheticId(messageInput.id),
      digest: digest(messageInput.digest),
      packageId: syntheticId(messageInput.packageId),
      packageDigest: digest(messageInput.packageDigest),
    };
    if (messageArtifact.packageId !== packageArtifact.id || messageArtifact.packageDigest !== packageArtifact.digest) invalidFixture();
    const confirmedEmailDomains = stringArray(input.confirmedEmailDomains, syntheticDomain);
    const state: SyntheticOutreachPreparationState = deepFreeze({
      kind: "synthetic_outreach_preparation",
      revision: 0,
      workspaceId: syntheticId(input.workspaceId),
      companyId: syntheticId(input.companyId),
      contactId: syntheticId(input.contactId),
      organizationId: syntheticId(input.organizationId),
      selectedEmail: syntheticEmail(input.selectedEmail),
      confirmedEmailDomains,
      selectedPhone: syntheticPhone(input.selectedPhone),
      packageArtifact,
      messageArtifact,
      packageApproval: null,
      messageApproval: null,
      tombstones: [],
      commandReceipts: [],
      effects: ZERO_EFFECTS,
    });
    activeStates.add(state);
    return state;
  } catch {
    throw new Error("synthetic_outreach_fixture_invalid");
  }
}

export async function applySyntheticOutreachCommand(
  state: SyntheticOutreachPreparationState,
  value: unknown,
): Promise<SyntheticOutreachPreparationState> {
  if (!activeStates.has(state)) throw new Error("synthetic_outreach_state_invalid");
  let command: Command;
  try {
    command = normalizeCommand(value);
  } catch {
    throw new Error("synthetic_outreach_command_invalid");
  }
  const operationDigest = await sha256(canonical(command));
  const prior = state.commandReceipts.find((receipt) => receipt.idempotencyKey === command.idempotencyKey);
  if (prior) {
    if (prior.operationDigest !== operationDigest) throw new Error("synthetic_outreach_idempotency_conflict");
    return state;
  }

  const resultingRevision = state.revision + 1;
  const receipt = deepFreeze({ idempotencyKey: command.idempotencyKey, operationDigest, resultingRevision });
  let next: SyntheticOutreachPreparationState;
  if (command.type === "approve_package") {
    if (state.packageApproval
      || command.packageId !== state.packageArtifact.id
      || command.packageDigest !== state.packageArtifact.digest
      || activeSuppression(state, command.approvedAt, "all")) commandInvalid();
    next = deepFreeze({
      ...state,
      revision: resultingRevision,
      packageApproval: approval(command.approvalId, command.packageId, command.packageDigest, command.packageId, command.packageDigest, command.approvedAt, command.expiresAt, false),
      commandReceipts: [...state.commandReceipts, receipt],
    });
  } else if (command.type === "approve_message") {
    const packageApproval = state.packageApproval;
    if (state.messageApproval
      || !packageApproval
      || command.messageId !== state.messageArtifact.id
      || command.messageDigest !== state.messageArtifact.digest
      || command.packageId !== state.packageArtifact.id
      || command.packageDigest !== state.packageArtifact.digest
      || command.approvedAt < packageApproval.approvedAt
      || command.approvedAt >= packageApproval.expiresAt
      || command.expiresAt > packageApproval.expiresAt
      || activeSuppression(state, command.approvedAt, "email")) commandInvalid();
    next = deepFreeze({
      ...state,
      revision: resultingRevision,
      messageApproval: approval(command.approvalId, command.messageId, command.messageDigest, command.packageId, command.packageDigest, command.approvedAt, command.expiresAt, true),
      commandReceipts: [...state.commandReceipts, receipt],
    });
  } else {
    if (state.tombstones.some((tombstone) => tombstone.id === command.tombstoneId)) commandInvalid();
    validateSuppressionSubject(state, command.subject);
    const tombstone: Tombstone = deepFreeze({
      id: command.tombstoneId,
      kind: command.subject.kind,
      value: command.subject.value,
      channel: command.subject.channel,
      reason: command.reason,
      source: command.source,
      effectiveAt: command.effectiveAt,
    });
    next = deepFreeze({
      ...state,
      revision: resultingRevision,
      tombstones: [...state.tombstones, tombstone],
      commandReceipts: [...state.commandReceipts, receipt],
    });
  }
  activeStates.add(next);
  return next;
}

export function projectSyntheticOutreachPreparation(state: SyntheticOutreachPreparationState, now: number) {
  if (!activeStates.has(state) || !validTimestamp(now)) throw new Error("synthetic_outreach_projection_invalid");
  const packageStatus = approvalStatus(state.packageApproval, state.packageArtifact, now, "package");
  const messageStatus = approvalStatus(state.messageApproval, state.messageArtifact, now, "message");
  const matched = state.tombstones.filter((tombstone) => tombstone.effectiveAt <= now && suppressionMatches(state, tombstone));
  const emailBlocked = matched.some((tombstone) => tombstone.channel === "all" || tombstone.channel === "email");
  const phoneBlocked = matched.some((tombstone) => tombstone.channel === "all" || tombstone.channel === "phone");
  let emailStatus: string;
  if (packageStatus !== "approved") emailStatus = `blocked_${packageStatus}_package_approval`;
  else if (messageStatus !== "approved") emailStatus = `blocked_${messageStatus}_message_approval`;
  else if (emailBlocked) emailStatus = "blocked_suppression";
  else emailStatus = "ready_for_future_composition";
  const projection = {
    kind: "synthetic_outreach_preparation_projection" as const,
    revision: state.revision,
    package: {
      approved: packageStatus === "approved",
      status: packageStatus === "approved" ? "approved_for_future_crm_eligibility" : `blocked_${packageStatus}_package_approval`,
    },
    message: { approved: messageStatus === "approved", status: messageStatus },
    email: { eligibleForFutureComposition: emailStatus === "ready_for_future_composition", status: emailStatus },
    phone: { eligibleForFutureComposition: false, status: phoneBlocked ? "blocked_suppression" : "unavailable_not_implemented" },
    suppression: {
      emailBlocked,
      phoneBlocked,
      matchedTombstoneIds: matched.map((tombstone) => tombstone.id).sort(),
    },
    effects: ZERO_EFFECTS,
  };
  return deepFreeze(projection);
}

function normalizeCommand(value: unknown): Command {
  const base = dataRecord(value);
  if (base.type === "approve_package") {
    const input = exactRecord(value, ["type", "idempotencyKey", "approvalId", "packageId", "packageDigest", "approvedAt", "expiresAt"]);
    const approvedAt = timestamp(input.approvedAt);
    const expiresAt = timestamp(input.expiresAt);
    if (expiresAt <= approvedAt) commandInvalid();
    return deepFreeze({
      type: "approve_package",
      idempotencyKey: syntheticId(input.idempotencyKey),
      approvalId: syntheticId(input.approvalId),
      packageId: syntheticId(input.packageId),
      packageDigest: digest(input.packageDigest),
      approvedAt,
      expiresAt,
    });
  }
  if (base.type === "approve_message") {
    const input = exactRecord(value, [
      "type", "idempotencyKey", "approvalId", "messageId", "messageDigest", "packageId",
      "packageDigest", "approvedAt", "expiresAt", "complianceAcknowledged",
    ]);
    const approvedAt = timestamp(input.approvedAt);
    const expiresAt = timestamp(input.expiresAt);
    if (expiresAt <= approvedAt || input.complianceAcknowledged !== true) commandInvalid();
    return deepFreeze({
      type: "approve_message",
      idempotencyKey: syntheticId(input.idempotencyKey),
      approvalId: syntheticId(input.approvalId),
      messageId: syntheticId(input.messageId),
      messageDigest: digest(input.messageDigest),
      packageId: syntheticId(input.packageId),
      packageDigest: digest(input.packageDigest),
      approvedAt,
      expiresAt,
      complianceAcknowledged: true,
    });
  }
  if (base.type === "add_suppression") {
    const input = exactRecord(value, ["type", "idempotencyKey", "tombstoneId", "subject", "reason", "source", "effectiveAt"]);
    const subject = exactRecord(input.subject, ["kind", "value", "channel"]);
    const kind = suppressionKind(subject.kind);
    const channel = suppressionChannel(subject.channel);
    if ((kind === "exact_email" || kind === "confirmed_email_domain") !== (channel === "email")
      || (kind === "exact_phone") !== (channel === "phone")) commandInvalid();
    if (!["exact_email", "confirmed_email_domain", "exact_phone"].includes(kind) && channel !== "all") commandInvalid();
    if (input.reason !== "synthetic_owner_request" || input.source !== "synthetic_owner") commandInvalid();
    return deepFreeze({
      type: "add_suppression",
      idempotencyKey: syntheticId(input.idempotencyKey),
      tombstoneId: syntheticId(input.tombstoneId),
      subject: { kind, value: suppressionValue(kind, subject.value), channel },
      reason: "synthetic_owner_request",
      source: "synthetic_owner",
      effectiveAt: timestamp(input.effectiveAt),
    });
  }
  commandInvalid();
}

function validateSuppressionSubject(state: SyntheticOutreachPreparationState, subject: SuppressionCommand["subject"]) {
  if (subject.kind === "company" && subject.value !== state.companyId) commandInvalid();
  if (subject.kind === "organization" && subject.value !== state.organizationId) commandInvalid();
  if (subject.kind === "contact" && subject.value !== state.contactId) commandInvalid();
  if (subject.kind === "confirmed_email_domain" && !state.confirmedEmailDomains.includes(subject.value)) commandInvalid();
}

function suppressionMatches(state: SyntheticOutreachPreparationState, tombstone: Tombstone) {
  if (tombstone.kind === "company") return tombstone.value === state.companyId;
  if (tombstone.kind === "organization") return tombstone.value === state.organizationId;
  if (tombstone.kind === "contact") return tombstone.value === state.contactId;
  if (tombstone.kind === "exact_email") return tombstone.value === state.selectedEmail;
  if (tombstone.kind === "confirmed_email_domain") {
    return state.confirmedEmailDomains.includes(tombstone.value) && state.selectedEmail.endsWith(`@${tombstone.value}`);
  }
  return tombstone.value === state.selectedPhone;
}

function activeSuppression(state: SyntheticOutreachPreparationState, at: number, channel: "all" | "email") {
  return state.tombstones.some((tombstone) => tombstone.effectiveAt <= at
    && suppressionMatches(state, tombstone)
    && (channel === "all" || tombstone.channel === "all" || tombstone.channel === channel));
}

function approvalStatus(approvalValue: Approval | null, artifactValue: Artifact, now: number, kind: "package" | "message") {
  if (!approvalValue) return "missing";
  if (approvalValue.artifactId !== artifactValue.id || approvalValue.artifactDigest !== artifactValue.digest) return "invalid";
  if (kind === "message" && approvalValue.complianceAcknowledged !== true) return "invalid";
  if (now < approvalValue.approvedAt) return "not_yet_effective";
  if (now >= approvalValue.expiresAt) return "expired";
  return "approved";
}

function approval(id: string, artifactId: string, artifactDigest: string, packageId: string, packageDigest: string, approvedAt: number, expiresAt: number, complianceAcknowledged: boolean): Approval {
  return deepFreeze({ id, artifactId, artifactDigest, packageId, packageDigest, approvedAt, expiresAt, complianceAcknowledged });
}

function artifact(value: unknown): Artifact {
  const input = exactRecord(value, ["id", "digest"]);
  return deepFreeze({ id: syntheticId(input.id), digest: digest(input.digest) });
}

function dataRecord(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) commandInvalid();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) commandInvalid();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).some((key) => typeof key !== "string")) commandInvalid();
  const output: Record<string, unknown> = {};
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (!("value" in descriptor) || !descriptor.enumerable) commandInvalid();
    output[key] = descriptor.value;
  }
  return output;
}

function exactRecord(value: unknown, keys: readonly string[]) {
  const input = dataRecord(value);
  const actual = Object.keys(input).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) commandInvalid();
  return input;
}

function stringArray(value: unknown, normalize: (entry: unknown) => string) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length === 0 || value.length > 10) commandInvalid();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const expectedKeys = new Set(["length", ...Array.from({ length: value.length }, (_, index) => String(index))]);
  const actualKeys = Reflect.ownKeys(descriptors);
  if (actualKeys.some((key) => typeof key !== "string" || !expectedKeys.has(key)) || actualKeys.length !== expectedKeys.size) commandInvalid();
  const entries = Array.from({ length: value.length }, (_, index) => {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) commandInvalid();
    return normalize(descriptor.value);
  });
  if (new Set(entries).size !== entries.length) commandInvalid();
  return deepFreeze([...entries].sort());
}

function syntheticId(value: unknown) {
  if (typeof value !== "string" || !SYNTHETIC_ID.test(value)) commandInvalid();
  return value;
}
function digest(value: unknown) {
  if (typeof value !== "string" || !DIGEST.test(value)) commandInvalid();
  return value;
}
function syntheticEmail(value: unknown) {
  if (typeof value !== "string" || !SYNTHETIC_EMAIL.test(value)) commandInvalid();
  return value;
}
function syntheticDomain(value: unknown) {
  if (typeof value !== "string" || !SYNTHETIC_DOMAIN.test(value)) commandInvalid();
  return value;
}
function syntheticPhone(value: unknown) {
  if (typeof value !== "string" || !SYNTHETIC_PHONE.test(value)) commandInvalid();
  return value;
}
function suppressionKind(value: unknown): SuppressionKind {
  if (value !== "company" && value !== "organization" && value !== "contact" && value !== "exact_email" && value !== "confirmed_email_domain" && value !== "exact_phone") commandInvalid();
  return value;
}
function suppressionChannel(value: unknown): SuppressionChannel {
  if (value !== "all" && value !== "email" && value !== "phone") commandInvalid();
  return value;
}
function suppressionValue(kind: SuppressionKind, value: unknown) {
  if (kind === "exact_email") return syntheticEmail(value);
  if (kind === "confirmed_email_domain") return syntheticDomain(value);
  if (kind === "exact_phone") return syntheticPhone(value);
  return syntheticId(value);
}
function timestamp(value: unknown) {
  if (!validTimestamp(value)) commandInvalid();
  return value;
}
function validTimestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}
function canonical(value: unknown) { return JSON.stringify(value); }
async function sha256(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
function commandInvalid(): never { throw new Error("synthetic_outreach_command_invalid"); }
function invalidFixture(): never { throw new Error("synthetic_outreach_fixture_invalid"); }
function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}
