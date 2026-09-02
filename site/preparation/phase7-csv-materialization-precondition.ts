type Effects = Readonly<{
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

type PreconditionSnapshot = Readonly<{
  id: string;
  handoffManifestIntentId: string;
  handoffManifestIntentDigest: string;
  csvPolicyDefinitionId: string;
  csvPolicyDefinitionDigest: string;
  createdAt: number;
}>;

export type SyntheticCsvMaterializationPrecondition = Readonly<{
  kind: "synthetic_phase7_csv_materialization_precondition";
  id: string;
  digest: string;
  snapshot: PreconditionSnapshot;
  materializationPreconditionClaimed: false;
  phaseExecutionAuthorized: false;
  runtimeCompositionAuthorized: false;
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
  manifestIntentCurrent: boolean;
  csvPolicyDefinitionCurrent: boolean;
  eligibilityCurrent: boolean;
  requestVersionCurrent: boolean;
  configurationCurrent: boolean;
  exportDefinitionCurrent: boolean;
  suppressionCurrent: boolean;
  externalEffectsDisabled: boolean;
}>;

const SYNTHETIC_ID = /^synthetic-[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/u;
const DIGEST = /^[a-f0-9]{64}$/u;
const MAX_TIMESTAMP = 8_640_000_000_000_000;
const candidates = new WeakSet<object>();
const ZERO_EFFECTS: Effects = deepFreeze({
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
 * Binds the synthetic manifest-intent and CSV-policy digests that a future
 * materializer would have to recheck. It cannot access rows or create bytes.
 */
export async function buildSyntheticCsvMaterializationPrecondition(
  value: unknown,
): Promise<SyntheticCsvMaterializationPrecondition> {
  try {
    const snapshot = normalizeCandidate(value);
    const artifact: SyntheticCsvMaterializationPrecondition = deepFreeze({
      kind: "synthetic_phase7_csv_materialization_precondition",
      id: snapshot.id,
      digest: await sha256Ascii(JSON.stringify(snapshot)),
      snapshot,
      materializationPreconditionClaimed: false,
      phaseExecutionAuthorized: false,
      runtimeCompositionAuthorized: false,
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
    candidates.add(artifact);
    return artifact;
  } catch {
    throw new Error("synthetic_phase7_csv_materialization_precondition_invalid");
  }
}

/**
 * Projects whether all future materialization predicates are current. Even a
 * passing projection grants no row, serialization, byte, persistence, or
 * external-effect authority.
 */
export async function evaluateSyntheticCsvMaterializationPrecondition(value: unknown) {
  try {
    const input = exactRecord(value, ["candidate", "currentCandidate", "currentAuthority"]);
    if (!candidates.has(input.candidate as object)) invalid();
    const artifact = input.candidate as SyntheticCsvMaterializationPrecondition;
    const current = await buildSyntheticCsvMaterializationPrecondition(input.currentCandidate);
    const authority = normalizeAuthority(input.currentAuthority);
    const reasons: string[] = [];

    if (current.digest !== artifact.digest) reasons.push("csv_materialization_precondition_changed");
    if (authority.evaluatedAt < artifact.snapshot.createdAt) {
      reasons.push("evaluation_precedes_csv_materialization_precondition");
    }
    if (!authority.manifestIntentCurrent) reasons.push("handoff_manifest_intent_not_current");
    if (!authority.csvPolicyDefinitionCurrent) reasons.push("csv_policy_definition_not_current");
    if (!authority.eligibilityCurrent) reasons.push("handoff_eligibility_not_current");
    if (!authority.requestVersionCurrent) reasons.push("handoff_request_version_not_current");
    if (!authority.configurationCurrent) reasons.push("handoff_configuration_not_current");
    if (!authority.exportDefinitionCurrent) reasons.push("handoff_export_definition_not_current");
    if (!authority.suppressionCurrent) reasons.push("handoff_suppression_not_current");
    if (!authority.externalEffectsDisabled) reasons.push("external_effects_not_disabled");

    const reasonCodes = deepFreeze([...new Set(reasons)].sort(compareText));
    return deepFreeze({
      kind: "synthetic_phase7_csv_materialization_precondition_decision" as const,
      status: reasonCodes.length === 0
        ? "synthetic_csv_materialization_preconditions_current_no_authority" as const
        : "synthetic_csv_materialization_preconditions_rejected" as const,
      candidateId: artifact.id,
      candidateDigest: artifact.digest,
      handoffManifestIntentId: artifact.snapshot.handoffManifestIntentId,
      handoffManifestIntentDigest: artifact.snapshot.handoffManifestIntentDigest,
      csvPolicyDefinitionId: artifact.snapshot.csvPolicyDefinitionId,
      csvPolicyDefinitionDigest: artifact.snapshot.csvPolicyDefinitionDigest,
      preconditionsCurrentClaimed: reasonCodes.length === 0,
      phaseExecutionAuthorized: false as const,
      runtimeCompositionAuthorized: false as const,
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
    throw new Error("synthetic_phase7_csv_materialization_precondition_decision_invalid");
  }
}

function normalizeCandidate(value: unknown): PreconditionSnapshot {
  const input = exactRecord(value, [
    "id", "handoffManifestIntentId", "handoffManifestIntentDigest",
    "csvPolicyDefinitionId", "csvPolicyDefinitionDigest", "createdAt",
  ]);
  return deepFreeze({
    id: syntheticId(input.id),
    handoffManifestIntentId: syntheticId(input.handoffManifestIntentId),
    handoffManifestIntentDigest: digest(input.handoffManifestIntentDigest),
    csvPolicyDefinitionId: syntheticId(input.csvPolicyDefinitionId),
    csvPolicyDefinitionDigest: digest(input.csvPolicyDefinitionDigest),
    createdAt: timestamp(input.createdAt),
  });
}

function normalizeAuthority(value: unknown): CurrentAuthority {
  const input = exactRecord(value, [
    "evaluatedAt", "manifestIntentCurrent", "csvPolicyDefinitionCurrent",
    "eligibilityCurrent", "requestVersionCurrent", "configurationCurrent",
    "exportDefinitionCurrent", "suppressionCurrent", "externalEffectsDisabled",
  ]);
  return deepFreeze({
    evaluatedAt: timestamp(input.evaluatedAt),
    manifestIntentCurrent: booleanValue(input.manifestIntentCurrent),
    csvPolicyDefinitionCurrent: booleanValue(input.csvPolicyDefinitionCurrent),
    eligibilityCurrent: booleanValue(input.eligibilityCurrent),
    requestVersionCurrent: booleanValue(input.requestVersionCurrent),
    configurationCurrent: booleanValue(input.configurationCurrent),
    exportDefinitionCurrent: booleanValue(input.exportDefinitionCurrent),
    suppressionCurrent: booleanValue(input.suppressionCurrent),
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
