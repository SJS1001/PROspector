type Effects = Readonly<{
  historyMutations: 0;
  rowReads: 0;
  csvSerializations: 0;
  byteMaterializations: 0;
  checksumCalculations: 0;
  durableMutations: 0;
  exportMutations: 0;
  deliveryInvocations: 0;
  downloadInvocations: 0;
  providerCalls: 0;
}>;

type VersionIntentSnapshot = Readonly<{
  id: string;
  materializationPreconditionId: string;
  materializationPreconditionDigest: string;
  handoffRequestId: string;
  handoffRequestDigest: string;
  versionIntentId: string;
  versionIntentDigest: string;
  handoffManifestIntentId: string;
  handoffManifestIntentDigest: string;
  csvPolicyDefinitionId: string;
  csvPolicyDefinitionDigest: string;
  intendedVersionNumber: number;
  createdAt: number;
}>;

export type SyntheticCsvArtifactVersionIntent = Readonly<{
  kind: "synthetic_phase7_csv_artifact_version_intent";
  id: string;
  digest: string;
  snapshot: VersionIntentSnapshot;
  artifactVersionClaimed: false;
  phaseExecutionAuthorized: false;
  runtimeCompositionAuthorized: false;
  versionCreationAuthorized: false;
  historyMutationAuthorized: false;
  rowAccessAuthorized: false;
  csvSerializationAuthorized: false;
  byteMaterializationAuthorized: false;
  checksumCalculationAuthorized: false;
  persistenceAuthorized: false;
  deliveryAuthorized: false;
  downloadAuthorized: false;
  exportAuthorized: false;
  providerInvocationAuthorized: false;
  effects: Effects;
}>;

type CurrentAuthority = Readonly<{
  evaluatedAt: number;
  materializationPreconditionCurrent: boolean;
  requestVersionCurrent: boolean;
  manifestIntentCurrent: boolean;
  csvPolicyDefinitionCurrent: boolean;
  intendedVersionCurrent: boolean;
  historyHeadCurrent: boolean;
  externalEffectsDisabled: boolean;
}>;

const SYNTHETIC_ID = /^synthetic-[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/u;
const DIGEST = /^[a-f0-9]{64}$/u;
const MAX_TIMESTAMP = 8_640_000_000_000_000;
const MAX_VERSION = 1_000_000_000;
const intents = new WeakSet<object>();
const ZERO_EFFECTS: Effects = deepFreeze({
  historyMutations: 0,
  rowReads: 0,
  csvSerializations: 0,
  byteMaterializations: 0,
  checksumCalculations: 0,
  durableMutations: 0,
  exportMutations: 0,
  deliveryInvocations: 0,
  downloadInvocations: 0,
  providerCalls: 0,
});

/**
 * Binds the synthetic references for one future immutable CSV artifact
 * version. It cannot create that version, history, rows, bytes, or effects.
 */
export async function buildSyntheticCsvArtifactVersionIntent(
  value: unknown,
): Promise<SyntheticCsvArtifactVersionIntent> {
  try {
    const snapshot = normalizeIntent(value);
    const artifact: SyntheticCsvArtifactVersionIntent = deepFreeze({
      kind: "synthetic_phase7_csv_artifact_version_intent",
      id: snapshot.id,
      digest: await sha256Ascii(JSON.stringify(snapshot)),
      snapshot,
      artifactVersionClaimed: false,
      phaseExecutionAuthorized: false,
      runtimeCompositionAuthorized: false,
      versionCreationAuthorized: false,
      historyMutationAuthorized: false,
      rowAccessAuthorized: false,
      csvSerializationAuthorized: false,
      byteMaterializationAuthorized: false,
      checksumCalculationAuthorized: false,
      persistenceAuthorized: false,
      deliveryAuthorized: false,
      downloadAuthorized: false,
      exportAuthorized: false,
      providerInvocationAuthorized: false,
      effects: ZERO_EFFECTS,
    });
    intents.add(artifact);
    return artifact;
  } catch {
    throw new Error("synthetic_phase7_csv_artifact_version_intent_invalid");
  }
}

/**
 * Rechecks whether the synthetic version intent is current. A passing result
 * remains a zero-authority projection and cannot mutate immutable history.
 */
export async function evaluateSyntheticCsvArtifactVersionIntent(value: unknown) {
  try {
    const input = exactRecord(value, ["candidate", "currentCandidate", "currentAuthority"]);
    if (!intents.has(input.candidate as object)) invalid();
    const artifact = input.candidate as SyntheticCsvArtifactVersionIntent;
    const current = await buildSyntheticCsvArtifactVersionIntent(input.currentCandidate);
    const authority = normalizeAuthority(input.currentAuthority);
    const reasons: string[] = [];

    if (current.digest !== artifact.digest) reasons.push("csv_artifact_version_intent_changed");
    if (authority.evaluatedAt < artifact.snapshot.createdAt) {
      reasons.push("evaluation_precedes_csv_artifact_version_intent");
    }
    if (!authority.materializationPreconditionCurrent) {
      reasons.push("csv_materialization_precondition_not_current");
    }
    if (!authority.requestVersionCurrent) reasons.push("handoff_request_version_not_current");
    if (!authority.manifestIntentCurrent) reasons.push("handoff_manifest_intent_not_current");
    if (!authority.csvPolicyDefinitionCurrent) reasons.push("csv_policy_definition_not_current");
    if (!authority.intendedVersionCurrent) reasons.push("intended_version_not_current");
    if (!authority.historyHeadCurrent) reasons.push("handoff_history_head_not_current");
    if (!authority.externalEffectsDisabled) reasons.push("external_effects_not_disabled");

    const reasonCodes = deepFreeze([...new Set(reasons)].sort(compareText));
    return deepFreeze({
      kind: "synthetic_phase7_csv_artifact_version_intent_decision" as const,
      status: reasonCodes.length === 0
        ? "synthetic_csv_artifact_version_intent_current_no_authority" as const
        : "synthetic_csv_artifact_version_intent_rejected" as const,
      candidateId: artifact.id,
      candidateDigest: artifact.digest,
      materializationPreconditionId: artifact.snapshot.materializationPreconditionId,
      materializationPreconditionDigest: artifact.snapshot.materializationPreconditionDigest,
      handoffRequestId: artifact.snapshot.handoffRequestId,
      handoffRequestDigest: artifact.snapshot.handoffRequestDigest,
      versionIntentId: artifact.snapshot.versionIntentId,
      versionIntentDigest: artifact.snapshot.versionIntentDigest,
      handoffManifestIntentId: artifact.snapshot.handoffManifestIntentId,
      handoffManifestIntentDigest: artifact.snapshot.handoffManifestIntentDigest,
      csvPolicyDefinitionId: artifact.snapshot.csvPolicyDefinitionId,
      csvPolicyDefinitionDigest: artifact.snapshot.csvPolicyDefinitionDigest,
      intendedVersionNumber: artifact.snapshot.intendedVersionNumber,
      currentIntentClaimed: reasonCodes.length === 0,
      artifactVersionClaimed: false as const,
      phaseExecutionAuthorized: false as const,
      runtimeCompositionAuthorized: false as const,
      versionCreationAuthorized: false as const,
      historyMutationAuthorized: false as const,
      rowAccessAuthorized: false as const,
      csvSerializationAuthorized: false as const,
      byteMaterializationAuthorized: false as const,
      checksumCalculationAuthorized: false as const,
      persistenceAuthorized: false as const,
      deliveryAuthorized: false as const,
      downloadAuthorized: false as const,
      exportAuthorized: false as const,
      providerInvocationAuthorized: false as const,
      reasonCodes,
      effects: ZERO_EFFECTS,
    });
  } catch {
    throw new Error("synthetic_phase7_csv_artifact_version_intent_decision_invalid");
  }
}

function normalizeIntent(value: unknown): VersionIntentSnapshot {
  const input = exactRecord(value, [
    "id", "materializationPreconditionId", "materializationPreconditionDigest",
    "handoffRequestId", "handoffRequestDigest", "versionIntentId", "versionIntentDigest",
    "handoffManifestIntentId", "handoffManifestIntentDigest", "csvPolicyDefinitionId",
    "csvPolicyDefinitionDigest", "intendedVersionNumber", "createdAt",
  ]);
  return deepFreeze({
    id: syntheticId(input.id),
    materializationPreconditionId: syntheticId(input.materializationPreconditionId),
    materializationPreconditionDigest: digest(input.materializationPreconditionDigest),
    handoffRequestId: syntheticId(input.handoffRequestId),
    handoffRequestDigest: digest(input.handoffRequestDigest),
    versionIntentId: syntheticId(input.versionIntentId),
    versionIntentDigest: digest(input.versionIntentDigest),
    handoffManifestIntentId: syntheticId(input.handoffManifestIntentId),
    handoffManifestIntentDigest: digest(input.handoffManifestIntentDigest),
    csvPolicyDefinitionId: syntheticId(input.csvPolicyDefinitionId),
    csvPolicyDefinitionDigest: digest(input.csvPolicyDefinitionDigest),
    intendedVersionNumber: versionNumber(input.intendedVersionNumber),
    createdAt: timestamp(input.createdAt),
  });
}

function normalizeAuthority(value: unknown): CurrentAuthority {
  const input = exactRecord(value, [
    "evaluatedAt", "materializationPreconditionCurrent", "requestVersionCurrent",
    "manifestIntentCurrent", "csvPolicyDefinitionCurrent", "intendedVersionCurrent",
    "historyHeadCurrent", "externalEffectsDisabled",
  ]);
  return deepFreeze({
    evaluatedAt: timestamp(input.evaluatedAt),
    materializationPreconditionCurrent: booleanValue(input.materializationPreconditionCurrent),
    requestVersionCurrent: booleanValue(input.requestVersionCurrent),
    manifestIntentCurrent: booleanValue(input.manifestIntentCurrent),
    csvPolicyDefinitionCurrent: booleanValue(input.csvPolicyDefinitionCurrent),
    intendedVersionCurrent: booleanValue(input.intendedVersionCurrent),
    historyHeadCurrent: booleanValue(input.historyHeadCurrent),
    externalEffectsDisabled: booleanValue(input.externalEffectsDisabled),
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

function syntheticId(value: unknown) {
  if (typeof value !== "string" || !SYNTHETIC_ID.test(value)) invalid();
  return value;
}

function digest(value: unknown) {
  if (typeof value !== "string" || !DIGEST.test(value)) invalid();
  return value;
}

function versionNumber(value: unknown) {
  if (!Number.isSafeInteger(value) || (value as number) <= 0 || (value as number) > MAX_VERSION) {
    invalid();
  }
  return value as number;
}

function timestamp(value: unknown) {
  if (!Number.isSafeInteger(value) || (value as number) <= 0 || (value as number) > MAX_TIMESTAMP) {
    invalid();
  }
  return value as number;
}

function booleanValue(value: unknown) {
  if (typeof value !== "boolean") invalid();
  return value;
}

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
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
