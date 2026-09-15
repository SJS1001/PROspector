import type {
  OutreachPackageSnapshot,
  RecordSuppressionInput,
} from "./outreach-repository";

export type ManualCallOutcome =
  | "connected"
  | "voicemail"
  | "no_answer"
  | "wrong_number"
  | "do_not_call"
  | "follow_up";

type Principal = Readonly<{ workspaceId: string; subject: string }>;
type SuppressionSubject = Readonly<{
  kind: RecordSuppressionInput["subjectKind"];
  digest: string;
  channel: "phone" | "all";
}>;
type MatchingPendingWork = Readonly<{
  id: string;
  revision: number;
  state: "pending";
}>;

export type ManualCallAuthoritySnapshot = Readonly<{
  dataClassification: "synthetic";
  workspaceId: string;
  ownerSubject: string;
  authorityRevision: number;
  packageVersion: Readonly<{
    id: string;
    version: number;
    artifactDigest: string;
    callScriptDigest: string;
    snapshot: OutreachPackageSnapshot;
  }>;
  packageApproval: Readonly<{
    id: string;
    packageVersionId: string;
    artifactDigest: string;
    approvalDigest: string;
    expiresAt: number;
    revoked: boolean;
  }>;
  prospect: Readonly<{
    id: string;
    revision: number;
    state: "approved" | "rejected" | "deferred" | "cooled_down";
    active: boolean;
  }>;
  contact: Readonly<{
    id: string;
    revision: number;
    status: "active" | "noncontactable";
  }>;
  contactEligibility: Readonly<{
    id: string;
    snapshotDigest: string;
    state: "ContactReady" | "NeedsReview" | "NonContactable";
    eligible: boolean;
    current: boolean;
  }>;
  phoneObservation: Readonly<{
    id: string;
    contactId: string;
    kind: "phone" | "email";
    contactPointDigest: string;
    verificationClass: "source_verified" | "provider_verified" | "suggestion" | "unverified";
    status: "active" | "revoked";
    freshUntil: number;
  }>;
  suppressionSubjects: readonly SuppressionSubject[];
  matchingPendingWork: readonly MatchingPendingWork[];
  suppressed: boolean;
}>;

export type ManualCallAuthorityRepository = Readonly<{
  loadCurrentAuthority(input: Readonly<{
    workspaceId: string;
    ownerSubject: string;
    packageApprovalId: string;
    phoneObservationId: string;
  }>): Promise<ManualCallAuthoritySnapshot | null>;
}>;

export type ManualCallOutcomeRecord = Readonly<{
  id: string;
  workspaceId: string;
  actorSubject: string;
  packageApprovalId: string;
  packageApprovalDigest: string;
  packageVersionId: string;
  packageArtifactDigest: string;
  callScriptDigest: string;
  phoneObservationId: string;
  contactPointDigest: string;
  prospectId: string;
  contactId: string;
  authorityRevision: number;
  authorityDigest: string;
  decisionDigest: string;
  outcome: ManualCallOutcome;
  notes: string;
  notesDigest: string;
  operationDigest: string;
  idempotencyKey: string;
  recordedAt: number;
  synthetic: true;
}>;

export type ManualCallOutcomeRepository = Readonly<{
  findByIdempotencyKey(input: Readonly<{
    workspaceId: string;
    ownerSubject: string;
    idempotencyKey: string;
  }>): Promise<ManualCallOutcomeRecord | null>;
  /**
   * Atomically rechecks authority and, for do-not-call, completes the exact
   * suppression and pending-work cancellation projection in the required
   * order before inserting the outcome record. A uniqueness loser returns the
   * immutable repository winner as `replayed`.
   */
  commitCurrentOutcome(input: Readonly<{
    expectedAuthorityRevision: number;
    expectedAuthorityDigest: string;
    doNotCallRequirements: Readonly<{
      suppressionSubjects: readonly SuppressionSubject[];
      matchingPendingWork: readonly MatchingPendingWork[];
      requiredOrder: "suppression_then_pending_work_cancellation_then_outcome";
    }> | null;
    record: ManualCallOutcomeRecord;
  }>): Promise<Readonly<{
    kind: "committed" | "replayed" | "stale" | "suppressed" | "conflict";
    record: ManualCallOutcomeRecord | null;
  }>>;
}>;

type DecisionRequest = Readonly<{
  packageApprovalId: string;
  phoneObservationId: string;
  expectedAuthorityRevision: number;
  expectedPackageVersion: number;
  expectedPackageArtifactDigest: string;
  expectedPackageApprovalDigest: string;
  expectedProspectRevision: number;
  expectedContactRevision: number;
  expectedContactEligibilityDigest: string;
}>;

type OutcomeCommand = DecisionRequest & Readonly<{
  expectedDecisionDigest: string;
  outcome: ManualCallOutcome;
  notes: string;
  idempotencyKey: string;
}>;

const ID = /^[a-z0-9][a-z0-9_.:-]{2,127}$/iu;
const DIGEST = /^[a-f0-9]{64}$/u;
const OUTCOMES = new Set<ManualCallOutcome>([
  "connected", "voicemail", "no_answer", "wrong_number", "do_not_call", "follow_up",
]);
const FORBIDDEN_SYNTHETIC_TEXT = /(?:https?:\/\/|[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}|\+\d{7,15}|\b(?:bearer|password|secret|oauth|refresh[_ -]?token|access[_ -]?token)\b)/iu;
const ZERO_EFFECTS = Object.freeze({ providerInvocations: 0, dialInvocations: 0, uriInvocations: 0 });

export class ManualCallDecisionError extends Error {
  constructor(reason: string) {
    super(`manual_call_decision:${reason}`);
    this.name = "ManualCallDecisionError";
  }
}

/**
 * Local decision/outcome service only. It has no phone/provider port and never
 * returns a callable target. The injected outcome repository must compare the
 * exact authority digest and revision atomically with its suppression recheck.
 */
export function createManualCallDecisionService(dependencies: Readonly<{
  authorityRepository: ManualCallAuthorityRepository;
  outcomeRepository: ManualCallOutcomeRepository;
  now?: () => number;
}>) {
  if (!dependencies || typeof dependencies !== "object"
    || typeof dependencies.authorityRepository?.loadCurrentAuthority !== "function"
    || typeof dependencies.outcomeRepository?.findByIdempotencyKey !== "function"
    || typeof dependencies.outcomeRepository?.commitCurrentOutcome !== "function"
    || (dependencies.now !== undefined && typeof dependencies.now !== "function")) {
    throw new TypeError("invalid_manual_call_dependencies");
  }
  const clock = dependencies.now ?? Date.now;

  const decide = async (principalValue: Principal, requestValue: DecisionRequest) => {
    const principal = principalInput(principalValue);
    const request = decisionInput(requestValue);
    const now = validTime(clock());
    const authority = await loadAuthority(dependencies.authorityRepository, principal, request);
    return evaluate(principal, request, authority, now);
  };

  const recordOutcome = async (principalValue: Principal, commandValue: OutcomeCommand) => {
    const principal = principalInput(principalValue);
    const command = outcomeInput(commandValue);
    const now = validTime(clock());
    const notesDigest = await sha256(command.notes);
    const operationDigest = await sha256(canonical({
      schema: "synthetic-manual-call-outcome/v1",
      workspaceId: principal.workspaceId,
      actorSubject: principal.subject,
      decisionRequest: decisionRequest(command),
      decisionDigest: command.expectedDecisionDigest,
      outcome: command.outcome,
      notesDigest,
      idempotencyKey: command.idempotencyKey,
    }));
    const replay = await dependencies.outcomeRepository.findByIdempotencyKey({
      workspaceId: principal.workspaceId,
      ownerSubject: principal.subject,
      idempotencyKey: command.idempotencyKey,
    });
    if (replay) {
      if (replay.operationDigest !== operationDigest
        || replay.workspaceId !== principal.workspaceId
        || replay.actorSubject !== principal.subject
        || replay.idempotencyKey !== command.idempotencyKey
        || replay.decisionDigest !== command.expectedDecisionDigest
        || replay.outcome !== command.outcome
        || replay.notesDigest !== notesDigest
        || replay.synthetic !== true) throw new ManualCallDecisionError("idempotency_conflict");
      return outcomeResult(replay, true);
    }
    const authority = await loadAuthority(dependencies.authorityRepository, principal, command);
    const decision = await evaluate(principal, command, authority, now);
    if (!decision.eligible || decision.decisionDigest !== command.expectedDecisionDigest) {
      throw new ManualCallDecisionError("stale_or_ineligible");
    }
    const record: ManualCallOutcomeRecord = deepFreeze({
      id: `mco_${operationDigest.slice(0, 32)}`,
      workspaceId: principal.workspaceId,
      actorSubject: principal.subject,
      packageApprovalId: authority.packageApproval.id,
      packageApprovalDigest: authority.packageApproval.approvalDigest,
      packageVersionId: authority.packageVersion.id,
      packageArtifactDigest: authority.packageVersion.artifactDigest,
      callScriptDigest: authority.packageVersion.callScriptDigest,
      phoneObservationId: authority.phoneObservation.id,
      contactPointDigest: authority.phoneObservation.contactPointDigest,
      prospectId: authority.prospect.id,
      contactId: authority.contact.id,
      authorityRevision: authority.authorityRevision,
      authorityDigest: decision.authorityDigest,
      decisionDigest: decision.decisionDigest,
      outcome: command.outcome,
      notes: command.notes,
      notesDigest,
      operationDigest,
      idempotencyKey: command.idempotencyKey,
      recordedAt: now,
      synthetic: true,
    });
    const committed = await dependencies.outcomeRepository.commitCurrentOutcome({
      expectedAuthorityRevision: authority.authorityRevision,
      expectedAuthorityDigest: decision.authorityDigest,
      doNotCallRequirements: command.outcome === "do_not_call" ? deepFreeze({
        suppressionSubjects: authority.suppressionSubjects,
        matchingPendingWork: authority.matchingPendingWork,
        requiredOrder: "suppression_then_pending_work_cancellation_then_outcome" as const,
      }) : null,
      record,
    });
    if ((committed.kind !== "committed" && committed.kind !== "replayed") || !committed.record) {
      throw new ManualCallDecisionError(committed.kind === "conflict" ? "idempotency_conflict" : "authority_changed");
    }
    if (!sameImmutableOutcome(committed.record, record)) throw new ManualCallDecisionError("repository_result_mismatch");
    validTime(committed.record.recordedAt);
    return outcomeResult(committed.record, committed.kind === "replayed");
  };

  return Object.freeze({ decide, recordOutcome });
}

async function loadAuthority(repository: ManualCallAuthorityRepository, principal: Principal, request: DecisionRequest) {
  const loaded = await repository.loadCurrentAuthority({
    workspaceId: principal.workspaceId,
    ownerSubject: principal.subject,
    packageApprovalId: request.packageApprovalId,
    phoneObservationId: request.phoneObservationId,
  });
  if (!loaded) throw new ManualCallDecisionError("authority_unavailable");
  return authorityInput(loaded);
}

async function evaluate(principal: Principal, request: DecisionRequest, authority: ManualCallAuthoritySnapshot, now: number) {
  const reasons: string[] = [];
  if (authority.workspaceId !== principal.workspaceId || authority.ownerSubject !== principal.subject) reasons.push("outsider");
  if (authority.authorityRevision !== request.expectedAuthorityRevision) reasons.push("authority_revision_changed");
  if (authority.packageVersion.version !== request.expectedPackageVersion) reasons.push("package_version_changed");
  if (authority.packageVersion.artifactDigest !== request.expectedPackageArtifactDigest) reasons.push("package_artifact_changed");
  if (authority.packageApproval.approvalDigest !== request.expectedPackageApprovalDigest) reasons.push("package_approval_changed");
  if (authority.prospect.revision !== request.expectedProspectRevision) reasons.push("prospect_revision_changed");
  if (authority.contact.revision !== request.expectedContactRevision) reasons.push("contact_revision_changed");
  if (authority.contactEligibility.snapshotDigest !== request.expectedContactEligibilityDigest) reasons.push("contact_eligibility_changed");
  if (authority.packageApproval.id !== request.packageApprovalId
    || authority.packageApproval.packageVersionId !== authority.packageVersion.id
    || authority.packageApproval.artifactDigest !== authority.packageVersion.artifactDigest) reasons.push("approval_artifact_mismatch");
  if (authority.packageApproval.revoked) reasons.push("approval_revoked");
  if (authority.packageApproval.expiresAt <= now) reasons.push("approval_expired");
  if (authority.prospect.state !== "approved" || !authority.prospect.active) reasons.push("prospect_unavailable");
  if (authority.contact.status !== "active") reasons.push("contact_noncontactable");
  if (!authority.contactEligibility.current || !authority.contactEligibility.eligible
    || authority.contactEligibility.state !== "ContactReady") reasons.push("contact_not_ready");
  if (authority.phoneObservation.id !== request.phoneObservationId
    || authority.phoneObservation.contactId !== authority.contact.id
    || authority.phoneObservation.kind !== "phone"
    || !["source_verified", "provider_verified"].includes(authority.phoneObservation.verificationClass)
    || authority.phoneObservation.status !== "active"
    || authority.phoneObservation.freshUntil <= now) reasons.push("phone_not_current_verified");
  if (!authority.packageVersion.snapshot.selectedContactPointDigests.includes(authority.phoneObservation.contactPointDigest)) reasons.push("phone_not_selected_by_package");
  const callScriptDigest = await sha256(canonical({
    schema: "outreach-call-script/v1",
    callScript: authority.packageVersion.snapshot.callScript,
  }));
  if (callScriptDigest !== authority.packageVersion.callScriptDigest) reasons.push("call_script_digest_mismatch");
  if (authority.suppressed) reasons.push("suppressed");
  const authorityDigest = await digestAuthority(authority);
  const reasonCodes = [...new Set(reasons)].sort();
  const decisionDigest = await sha256(canonical({
    schema: "synthetic-manual-call-decision/v1",
    authorityDigest,
    expectedAuthorityRevision: request.expectedAuthorityRevision,
    reasonCodes,
  }));
  return deepFreeze({
    kind: "manual_call_decision" as const,
    eligible: reasonCodes.length === 0,
    reasonCodes,
    authorityRevision: authority.authorityRevision,
    authorityDigest,
    decisionDigest,
    packageApprovalId: authority.packageApproval.id,
    packageApprovalDigest: authority.packageApproval.approvalDigest,
    packageArtifactDigest: authority.packageVersion.artifactDigest,
    callScript: reasonCodes.length === 0 ? authority.packageVersion.snapshot.callScript : null,
    callScriptDigest: reasonCodes.length === 0 ? authority.packageVersion.callScriptDigest : null,
    phoneTarget: null,
    phoneEffectAuthorized: false as const,
    synthetic: true as const,
    effects: ZERO_EFFECTS,
  });
}

async function digestAuthority(authority: ManualCallAuthoritySnapshot) {
  return sha256(canonical({
    schema: "synthetic-manual-call-authority/v1",
    ...authority,
    packageVersion: {
      ...authority.packageVersion,
      snapshot: authority.packageVersion.snapshot,
    },
  }));
}

function outcomeResult(record: ManualCallOutcomeRecord, replayed: boolean) {
  return deepFreeze({
    kind: "manual_call_outcome_recorded" as const,
    outcomeId: record.id,
    outcome: record.outcome,
    notesDigest: record.notesDigest,
    operationDigest: record.operationDigest,
    replayed,
    suppressionRecordedFirst: record.outcome === "do_not_call",
    followUpAuthorized: false as const,
    phoneEffectAuthorized: false as const,
    synthetic: true as const,
    effects: ZERO_EFFECTS,
  });
}

function principalInput(value: Principal): Principal {
  const input = exactRecord(value, ["workspaceId", "subject"]);
  return deepFreeze({ workspaceId: validId(input.workspaceId), subject: validId(input.subject) });
}

function decisionInput(value: DecisionRequest): DecisionRequest {
  const input = exactRecord(value, [
    "packageApprovalId", "phoneObservationId", "expectedAuthorityRevision", "expectedPackageVersion",
    "expectedPackageArtifactDigest", "expectedPackageApprovalDigest", "expectedProspectRevision",
    "expectedContactRevision", "expectedContactEligibilityDigest",
  ]);
  return deepFreeze({
    packageApprovalId: validId(input.packageApprovalId),
    phoneObservationId: validId(input.phoneObservationId),
    expectedAuthorityRevision: positiveInteger(input.expectedAuthorityRevision),
    expectedPackageVersion: positiveInteger(input.expectedPackageVersion),
    expectedPackageArtifactDigest: validDigest(input.expectedPackageArtifactDigest),
    expectedPackageApprovalDigest: validDigest(input.expectedPackageApprovalDigest),
    expectedProspectRevision: positiveInteger(input.expectedProspectRevision),
    expectedContactRevision: positiveInteger(input.expectedContactRevision),
    expectedContactEligibilityDigest: validDigest(input.expectedContactEligibilityDigest),
  });
}

function decisionRequest(value: DecisionRequest): DecisionRequest {
  return deepFreeze({
    packageApprovalId: value.packageApprovalId,
    phoneObservationId: value.phoneObservationId,
    expectedAuthorityRevision: value.expectedAuthorityRevision,
    expectedPackageVersion: value.expectedPackageVersion,
    expectedPackageArtifactDigest: value.expectedPackageArtifactDigest,
    expectedPackageApprovalDigest: value.expectedPackageApprovalDigest,
    expectedProspectRevision: value.expectedProspectRevision,
    expectedContactRevision: value.expectedContactRevision,
    expectedContactEligibilityDigest: value.expectedContactEligibilityDigest,
  });
}

function outcomeInput(value: OutcomeCommand): OutcomeCommand {
  const input = exactRecord(value, [
    "packageApprovalId", "phoneObservationId", "expectedAuthorityRevision", "expectedPackageVersion",
    "expectedPackageArtifactDigest", "expectedPackageApprovalDigest", "expectedProspectRevision",
    "expectedContactRevision", "expectedContactEligibilityDigest", "expectedDecisionDigest", "outcome",
    "notes", "idempotencyKey",
  ]);
  const base = decisionInput(Object.fromEntries(Object.entries(input).filter(([key]) => !["expectedDecisionDigest", "outcome", "notes", "idempotencyKey"].includes(key))) as unknown as DecisionRequest);
  if (typeof input.outcome !== "string" || !OUTCOMES.has(input.outcome as ManualCallOutcome)) throw new ManualCallDecisionError("invalid_outcome");
  if (typeof input.notes !== "string" || input.notes.length < 1 || input.notes.length > 512
    || input.notes.includes("\0") || FORBIDDEN_SYNTHETIC_TEXT.test(input.notes)) throw new ManualCallDecisionError("invalid_synthetic_notes");
  return deepFreeze({
    ...base,
    expectedDecisionDigest: validDigest(input.expectedDecisionDigest),
    outcome: input.outcome as ManualCallOutcome,
    notes: input.notes,
    idempotencyKey: validId(input.idempotencyKey),
  });
}

function authorityInput(value: ManualCallAuthoritySnapshot): ManualCallAuthoritySnapshot {
  const copied = snapshot(value);
  if (copied.dataClassification !== "synthetic") throw new ManualCallDecisionError("non_synthetic_authority");
  if (!validIdentifier(copied.workspaceId) || !validIdentifier(copied.ownerSubject)
    || !Number.isSafeInteger(copied.authorityRevision) || copied.authorityRevision < 1) throw new ManualCallDecisionError("invalid_authority");
  for (const value of [copied.packageVersion.artifactDigest, copied.packageVersion.callScriptDigest,
    copied.packageApproval.artifactDigest, copied.packageApproval.approvalDigest,
    copied.contactEligibility.snapshotDigest, copied.phoneObservation.contactPointDigest]) {
    if (!DIGEST.test(value)) throw new ManualCallDecisionError("invalid_authority");
  }
  if (!Array.isArray(copied.suppressionSubjects) || copied.suppressionSubjects.length < 1
    || copied.suppressionSubjects.length > 32
    || !Array.isArray(copied.matchingPendingWork) || copied.matchingPendingWork.length > 64
    || typeof copied.suppressed !== "boolean") throw new ManualCallDecisionError("invalid_authority");
  const pendingIds = new Set<string>();
  for (const work of copied.matchingPendingWork) {
    const item = exactRecord(work, ["id", "revision", "state"]);
    if (!validIdentifier(item.id) || !Number.isSafeInteger(item.revision) || Number(item.revision) < 1
      || item.state !== "pending" || pendingIds.has(item.id)) throw new ManualCallDecisionError("invalid_authority");
    pendingIds.add(item.id);
  }
  return deepFreeze(copied);
}

function sameImmutableOutcome(actual: ManualCallOutcomeRecord, expected: ManualCallOutcomeRecord) {
  const { recordedAt: actualRecordedAt, ...actualImmutable } = actual;
  const { recordedAt: expectedRecordedAt, ...expectedImmutable } = expected;
  void actualRecordedAt;
  void expectedRecordedAt;
  return canonical(actualImmutable) === canonical(expectedImmutable);
}

function snapshot<T>(value: T): T {
  try {
    return structuredClone(value);
  } catch {
    throw new ManualCallDecisionError("invalid_authority");
  }
}

function exactRecord(value: unknown, keys: readonly string[]) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new ManualCallDecisionError("invalid_input");
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).some((key) => typeof key !== "string")
    || Object.entries(descriptors).some(([, descriptor]) => !("value" in descriptor))) throw new ManualCallDecisionError("invalid_input");
  if (Object.keys(descriptors).sort().join("\0") !== [...keys].sort().join("\0")) throw new ManualCallDecisionError("invalid_input");
  return Object.fromEntries(Object.entries(descriptors).map(([key, descriptor]) => [key, descriptor.value]));
}

function validIdentifier(value: unknown): value is string { return typeof value === "string" && ID.test(value); }
function validId(value: unknown) { if (!validIdentifier(value)) throw new ManualCallDecisionError("invalid_identifier"); return value; }
function validDigest(value: unknown) { if (typeof value !== "string" || !DIGEST.test(value)) throw new ManualCallDecisionError("invalid_digest"); return value; }
function positiveInteger(value: unknown) { if (!Number.isSafeInteger(value) || Number(value) < 1) throw new ManualCallDecisionError("invalid_revision"); return Number(value); }
function validTime(value: unknown) { if (!Number.isSafeInteger(value) || Number(value) < 1) throw new ManualCallDecisionError("invalid_time"); return Number(value); }

function canonical(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number" && Number.isSafeInteger(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(",")}}`;
  throw new ManualCallDecisionError("invalid_canonical_value");
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
