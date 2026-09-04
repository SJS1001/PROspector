type Effects = Readonly<{
  historyMutations: 0;
  durableMutations: 0;
  csvSerializations: 0;
  exportMutations: 0;
  deliveryInvocations: 0;
  downloadInvocations: 0;
  providerCalls: 0;
}>;

type RequestSnapshot = Readonly<{
  id: string;
  idempotencyKey: string;
  workspaceId: string;
  companyId: string;
  profileId: string;
  eligibilityCandidateId: string;
  eligibilityCandidateDigest: string;
  profileConfigurationId: string;
  profileConfigurationDigest: string;
  exportDefinitionId: string;
  exportDefinitionDigest: string;
  requestedAt: number;
}>;

export type SyntheticHandoffRequestCandidate = Readonly<{
  kind: "synthetic_phase7_handoff_request_candidate";
  id: string;
  digest: string;
  snapshot: RequestSnapshot;
  operationalRequestClaimed: false;
  phaseExecutionAuthorized: false;
  runtimeCompositionAuthorized: false;
  versionCreationAuthorized: false;
  persistenceAuthorized: false;
  csvSerializationAuthorized: false;
  deliveryAuthorized: false;
  downloadAuthorized: false;
  exportAuthorized: false;
  providerInvocationAuthorized: false;
  effects: Effects;
}>;

type VersionRef = Readonly<{
  versionId: string;
  versionNumber: number;
  versionDigest: string;
  createdAt: number;
}>;

type ExistingRequest = Readonly<VersionRef & {
  requestId: string;
  idempotencyKey: string;
  requestDigest: string;
}>;

type CurrentAuthority = Readonly<{
  evaluatedAt: number;
  scopeCurrent: boolean;
  eligibilityCurrent: boolean;
  configurationCurrent: boolean;
  exportDefinitionCurrent: boolean;
  externalEffectsDisabled: boolean;
  existingRequest: ExistingRequest | null;
  historyHead: VersionRef | null;
}>;

const SYNTHETIC_ID = /^synthetic-[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/u;
const DIGEST = /^[a-f0-9]{64}$/u;
const MAX_TIMESTAMP = 8_640_000_000_000_000;
const MAX_VERSION = 1_000_000_000;
const candidates = new WeakSet<object>();
const ZERO_EFFECTS: Effects = deepFreeze({
  historyMutations: 0,
  durableMutations: 0,
  csvSerializations: 0,
  exportMutations: 0,
  deliveryInvocations: 0,
  downloadInvocations: 0,
  providerCalls: 0,
});

/**
 * Canonicalizes one synthetic request for a future immutable handoff version.
 * It contains only synthetic identifiers and digests and cannot create a
 * version, serialize bytes, persist history, deliver, download, or export.
 */
export async function buildSyntheticHandoffRequestCandidate(
  value: unknown,
): Promise<SyntheticHandoffRequestCandidate> {
  try {
    const snapshot = normalizeRequest(value);
    const artifact: SyntheticHandoffRequestCandidate = deepFreeze({
      kind: "synthetic_phase7_handoff_request_candidate",
      id: snapshot.id,
      digest: await sha256Ascii(JSON.stringify(snapshot)),
      snapshot,
      operationalRequestClaimed: false,
      phaseExecutionAuthorized: false,
      runtimeCompositionAuthorized: false,
      versionCreationAuthorized: false,
      persistenceAuthorized: false,
      csvSerializationAuthorized: false,
      deliveryAuthorized: false,
      downloadAuthorized: false,
      exportAuthorized: false,
      providerInvocationAuthorized: false,
      effects: ZERO_EFFECTS,
    });
    candidates.add(artifact);
    return artifact;
  } catch {
    throw new Error("synthetic_phase7_handoff_request_candidate_invalid");
  }
}

/**
 * Distinguishes a first/new immutable version from an exact idempotent replay.
 * The result is only a zero-effect decision and grants no history mutation,
 * serialization, persistence, delivery, download, export, or provider access.
 */
export async function evaluateSyntheticHandoffRequestVersion(value: unknown) {
  try {
    const input = exactRecord(value, ["candidate", "currentCandidate", "currentAuthority"]);
    if (!candidates.has(input.candidate as object)) invalid();
    const artifact = input.candidate as SyntheticHandoffRequestCandidate;
    const current = await buildSyntheticHandoffRequestCandidate(input.currentCandidate);
    const authority = normalizeAuthority(input.currentAuthority);
    const snapshot = artifact.snapshot;
    const existing = authority.existingRequest;
    const head = authority.historyHead;
    const reasons: string[] = [];

    if (current.digest !== artifact.digest) reasons.push("handoff_request_candidate_changed");
    if (authority.evaluatedAt < snapshot.requestedAt) reasons.push("evaluation_precedes_handoff_request");
    if (!authority.scopeCurrent) reasons.push("handoff_scope_not_current");
    if (!authority.eligibilityCurrent) reasons.push("handoff_eligibility_not_current");
    if (!authority.configurationCurrent) reasons.push("handoff_configuration_not_current");
    if (!authority.exportDefinitionCurrent) reasons.push("handoff_export_definition_not_current");
    if (!authority.externalEffectsDisabled) reasons.push("external_effects_not_disabled");
    if (head && head.createdAt > authority.evaluatedAt) reasons.push("handoff_history_from_future");
    if (!existing && head?.versionNumber === MAX_VERSION) reasons.push("handoff_version_space_exhausted");

    if (existing) {
      if (existing.requestId !== artifact.id
        || existing.idempotencyKey !== snapshot.idempotencyKey
        || existing.requestDigest !== artifact.digest) {
        reasons.push("handoff_idempotency_conflict");
      }
      if (existing.createdAt < snapshot.requestedAt) reasons.push("handoff_receipt_precedes_request");
      if (existing.createdAt > authority.evaluatedAt) reasons.push("handoff_receipt_from_future");
      if (!head) {
        reasons.push("handoff_history_head_missing");
      } else {
        if (head.versionNumber < existing.versionNumber || head.createdAt < existing.createdAt) {
          reasons.push("handoff_history_precedes_replay");
        }
        if (head.versionNumber === existing.versionNumber && (
          head.versionId !== existing.versionId
          || head.versionDigest !== existing.versionDigest
          || head.createdAt !== existing.createdAt
        )) reasons.push("handoff_history_head_conflict");
      }
    }

    const reasonCodes = deepFreeze([...new Set(reasons)].sort(compareText));
    const rejected = reasonCodes.length > 0;
    const replay = !rejected && existing !== null;
    const requiredVersionNumber = !rejected && !replay
      ? (head ? head.versionNumber + 1 : 1)
      : null;
    const replayedVersion = replay && existing ? deepFreeze({
      versionId: existing.versionId,
      versionNumber: existing.versionNumber,
      versionDigest: existing.versionDigest,
    }) : null;

    return deepFreeze({
      kind: "synthetic_phase7_handoff_request_version_decision" as const,
      status: rejected
        ? "synthetic_handoff_version_rejected" as const
        : replay
          ? "synthetic_handoff_version_replayed_no_authority" as const
          : "synthetic_handoff_version_required_no_authority" as const,
      requestId: artifact.id,
      requestDigest: artifact.digest,
      eligibilityCandidateId: snapshot.eligibilityCandidateId,
      eligibilityCandidateDigest: snapshot.eligibilityCandidateDigest,
      historyHeadDigest: head?.versionDigest ?? null,
      wouldRequireNewImmutableVersion: !rejected && !replay,
      requiredVersionNumber,
      replayedVersion,
      phaseExecutionAuthorized: false as const,
      runtimeCompositionAuthorized: false as const,
      versionCreationAuthorized: false as const,
      persistenceAuthorized: false as const,
      csvSerializationAuthorized: false as const,
      deliveryAuthorized: false as const,
      downloadAuthorized: false as const,
      exportAuthorized: false as const,
      providerInvocationAuthorized: false as const,
      reasonCodes,
      effects: ZERO_EFFECTS,
    });
  } catch {
    throw new Error("synthetic_phase7_handoff_request_version_decision_invalid");
  }
}

function normalizeRequest(value: unknown): RequestSnapshot {
  const input = exactRecord(value, [
    "id", "idempotencyKey", "workspaceId", "companyId", "profileId",
    "eligibilityCandidateId", "eligibilityCandidateDigest", "profileConfigurationId",
    "profileConfigurationDigest", "exportDefinitionId", "exportDefinitionDigest", "requestedAt",
  ]);
  return deepFreeze({
    id: syntheticId(input.id),
    idempotencyKey: syntheticId(input.idempotencyKey),
    workspaceId: syntheticId(input.workspaceId),
    companyId: syntheticId(input.companyId),
    profileId: syntheticId(input.profileId),
    eligibilityCandidateId: syntheticId(input.eligibilityCandidateId),
    eligibilityCandidateDigest: digest(input.eligibilityCandidateDigest),
    profileConfigurationId: syntheticId(input.profileConfigurationId),
    profileConfigurationDigest: digest(input.profileConfigurationDigest),
    exportDefinitionId: syntheticId(input.exportDefinitionId),
    exportDefinitionDigest: digest(input.exportDefinitionDigest),
    requestedAt: timestamp(input.requestedAt),
  });
}

function normalizeAuthority(value: unknown): CurrentAuthority {
  const input = exactRecord(value, [
    "evaluatedAt", "scopeCurrent", "eligibilityCurrent", "configurationCurrent",
    "exportDefinitionCurrent", "externalEffectsDisabled", "existingRequest", "historyHead",
  ]);
  return deepFreeze({
    evaluatedAt: timestamp(input.evaluatedAt),
    scopeCurrent: booleanValue(input.scopeCurrent),
    eligibilityCurrent: booleanValue(input.eligibilityCurrent),
    configurationCurrent: booleanValue(input.configurationCurrent),
    exportDefinitionCurrent: booleanValue(input.exportDefinitionCurrent),
    externalEffectsDisabled: booleanValue(input.externalEffectsDisabled),
    existingRequest: nullableExistingRequest(input.existingRequest),
    historyHead: nullableVersionRef(input.historyHead),
  });
}

function nullableExistingRequest(value: unknown): ExistingRequest | null {
  if (value === null) return null;
  const input = exactRecord(value, [
    "requestId", "idempotencyKey", "requestDigest", "versionId", "versionNumber",
    "versionDigest", "createdAt",
  ]);
  return deepFreeze({
    requestId: syntheticId(input.requestId),
    idempotencyKey: syntheticId(input.idempotencyKey),
    requestDigest: digest(input.requestDigest),
    versionId: syntheticId(input.versionId),
    versionNumber: versionNumber(input.versionNumber),
    versionDigest: digest(input.versionDigest),
    createdAt: timestamp(input.createdAt),
  });
}

function nullableVersionRef(value: unknown): VersionRef | null {
  if (value === null) return null;
  const input = exactRecord(value, ["versionId", "versionNumber", "versionDigest", "createdAt"]);
  return deepFreeze({
    versionId: syntheticId(input.versionId),
    versionNumber: versionNumber(input.versionNumber),
    versionDigest: digest(input.versionDigest),
    createdAt: timestamp(input.createdAt),
  });
}

function exactRecord(value: unknown, expectedKeys: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) invalid();
  if (Object.getPrototypeOf(value) !== Object.prototype) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).some((key) => typeof key !== "string")) invalid();
  const keys = Object.keys(descriptors);
  if (keys.sort().join("\0") !== [...expectedKeys].sort().join("\0")) invalid();
  const output: Record<string, unknown> = {};
  for (const key of expectedKeys) {
    const descriptor = descriptors[key];
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) invalid();
    output[key] = descriptor.value;
  }
  return output;
}

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
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
  if (!Number.isSafeInteger(value) || (value as number) <= 0 || (value as number) > MAX_TIMESTAMP) invalid();
  return value as number;
}

function versionNumber(value: unknown) {
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > MAX_VERSION) invalid();
  return value as number;
}

function booleanValue(value: unknown) {
  if (typeof value !== "boolean") invalid();
  return value;
}

async function sha256Ascii(value: string) {
  if ([...value].some((character) => character.charCodeAt(0) > 0x7f)) invalid();
  const bytes = Uint8Array.from(value, (character) => character.charCodeAt(0));
  const hashed = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hashed), (byte) => byte.toString(16).padStart(2, "0")).join("");
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
