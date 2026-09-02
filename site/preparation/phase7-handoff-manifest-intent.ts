type Effects = Readonly<{
  historyMutations: 0;
  durableMutations: 0;
  csvSerializations: 0;
  exportMutations: 0;
  deliveryInvocations: 0;
  downloadInvocations: 0;
  providerCalls: 0;
}>;

type ManifestIntentSnapshot = Readonly<{
  id: string;
  workspaceId: string;
  companyId: string;
  profileId: string;
  eligibilityCandidateId: string;
  eligibilityCandidateDigest: string;
  handoffRequestId: string;
  handoffRequestDigest: string;
  versionIntentId: string;
  versionIntentDigest: string;
  profileConfigurationId: string;
  profileConfigurationDigest: string;
  exportDefinitionId: string;
  exportDefinitionDigest: string;
  uniqueProspectCount: number;
  eligibleContactRowCount: number;
  exclusionCount: number;
  exclusionLedgerDigest: string;
  nonContactableReferenceCount: number;
  nonContactableManifestDigest: string;
  schemaVersion: 1;
  createdAt: number;
}>;

export type SyntheticHandoffManifestIntent = Readonly<{
  kind: "synthetic_phase7_handoff_manifest_intent";
  id: string;
  digest: string;
  snapshot: ManifestIntentSnapshot;
  manifestClaimed: false;
  checksumClaimed: false;
  phaseExecutionAuthorized: false;
  runtimeCompositionAuthorized: false;
  versionCreationAuthorized: false;
  historyMutationAuthorized: false;
  persistenceAuthorized: false;
  csvSerializationAuthorized: false;
  deliveryAuthorized: false;
  downloadAuthorized: false;
  exportAuthorized: false;
  providerInvocationAuthorized: false;
  effects: Effects;
}>;

type CurrentAuthority = Readonly<{
  evaluatedAt: number;
  scopeCurrent: boolean;
  eligibilityCurrent: boolean;
  requestVersionCurrent: boolean;
  configurationCurrent: boolean;
  exportDefinitionCurrent: boolean;
  countsCurrent: boolean;
  exclusionLedgerCurrent: boolean;
  nonContactableManifestCurrent: boolean;
  externalEffectsDisabled: boolean;
}>;

const SYNTHETIC_ID = /^synthetic-[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/u;
const DIGEST = /^[a-f0-9]{64}$/u;
const MAX_TIMESTAMP = 8_640_000_000_000_000;
const MAX_COUNT = 1_000_000_000;
const intents = new WeakSet<object>();
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
 * Binds only synthetic handoff references and aggregate counts into a digest.
 * This is not a manifest, checksum, persisted version, file, or export.
 */
export async function buildSyntheticHandoffManifestIntent(
  value: unknown,
): Promise<SyntheticHandoffManifestIntent> {
  try {
    const snapshot = normalizeIntent(value);
    const artifact: SyntheticHandoffManifestIntent = deepFreeze({
      kind: "synthetic_phase7_handoff_manifest_intent",
      id: snapshot.id,
      digest: await sha256Ascii(JSON.stringify(snapshot)),
      snapshot,
      manifestClaimed: false,
      checksumClaimed: false,
      phaseExecutionAuthorized: false,
      runtimeCompositionAuthorized: false,
      versionCreationAuthorized: false,
      historyMutationAuthorized: false,
      persistenceAuthorized: false,
      csvSerializationAuthorized: false,
      deliveryAuthorized: false,
      downloadAuthorized: false,
      exportAuthorized: false,
      providerInvocationAuthorized: false,
      effects: ZERO_EFFECTS,
    });
    intents.add(artifact);
    return artifact;
  } catch {
    throw new Error("synthetic_phase7_handoff_manifest_intent_invalid");
  }
}

/**
 * Rechecks whether a branded synthetic intent still describes current inputs.
 * A current result remains only an intent and grants no manifest or effect.
 */
export async function evaluateSyntheticHandoffManifestIntent(value: unknown) {
  try {
    const input = exactRecord(value, ["candidate", "currentCandidate", "currentAuthority"]);
    if (!intents.has(input.candidate as object)) invalid();
    const artifact = input.candidate as SyntheticHandoffManifestIntent;
    const current = await buildSyntheticHandoffManifestIntent(input.currentCandidate);
    const authority = normalizeAuthority(input.currentAuthority);
    const reasons: string[] = [];

    if (current.digest !== artifact.digest) reasons.push("handoff_manifest_intent_changed");
    if (authority.evaluatedAt < artifact.snapshot.createdAt) {
      reasons.push("evaluation_precedes_handoff_manifest_intent");
    }
    if (!authority.scopeCurrent) reasons.push("handoff_scope_not_current");
    if (!authority.eligibilityCurrent) reasons.push("handoff_eligibility_not_current");
    if (!authority.requestVersionCurrent) reasons.push("handoff_request_version_not_current");
    if (!authority.configurationCurrent) reasons.push("handoff_configuration_not_current");
    if (!authority.exportDefinitionCurrent) reasons.push("handoff_export_definition_not_current");
    if (!authority.countsCurrent) reasons.push("handoff_counts_not_current");
    if (!authority.exclusionLedgerCurrent) reasons.push("handoff_exclusion_ledger_not_current");
    if (!authority.nonContactableManifestCurrent) {
      reasons.push("handoff_non_contactable_manifest_not_current");
    }
    if (!authority.externalEffectsDisabled) reasons.push("external_effects_not_disabled");

    const reasonCodes = deepFreeze([...new Set(reasons)].sort(compareText));
    return deepFreeze({
      kind: "synthetic_phase7_handoff_manifest_intent_decision" as const,
      status: reasonCodes.length === 0
        ? "synthetic_handoff_manifest_intent_current_no_authority" as const
        : "synthetic_handoff_manifest_intent_rejected" as const,
      candidateId: artifact.id,
      candidateDigest: artifact.digest,
      eligibilityCandidateId: artifact.snapshot.eligibilityCandidateId,
      eligibilityCandidateDigest: artifact.snapshot.eligibilityCandidateDigest,
      handoffRequestId: artifact.snapshot.handoffRequestId,
      handoffRequestDigest: artifact.snapshot.handoffRequestDigest,
      versionIntentId: artifact.snapshot.versionIntentId,
      versionIntentDigest: artifact.snapshot.versionIntentDigest,
      uniqueProspectCount: artifact.snapshot.uniqueProspectCount,
      eligibleContactRowCount: artifact.snapshot.eligibleContactRowCount,
      exclusionCount: artifact.snapshot.exclusionCount,
      nonContactableReferenceCount: artifact.snapshot.nonContactableReferenceCount,
      schemaVersion: artifact.snapshot.schemaVersion,
      currentIntentClaimed: reasonCodes.length === 0,
      manifestClaimed: false as const,
      checksumClaimed: false as const,
      phaseExecutionAuthorized: false as const,
      runtimeCompositionAuthorized: false as const,
      versionCreationAuthorized: false as const,
      historyMutationAuthorized: false as const,
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
    throw new Error("synthetic_phase7_handoff_manifest_intent_decision_invalid");
  }
}

function normalizeIntent(value: unknown): ManifestIntentSnapshot {
  const input = exactRecord(value, [
    "id", "workspaceId", "companyId", "profileId", "eligibilityCandidateId",
    "eligibilityCandidateDigest", "handoffRequestId", "handoffRequestDigest",
    "versionIntentId", "versionIntentDigest", "profileConfigurationId",
    "profileConfigurationDigest", "exportDefinitionId", "exportDefinitionDigest",
    "uniqueProspectCount", "eligibleContactRowCount", "exclusionCount",
    "exclusionLedgerDigest", "nonContactableReferenceCount",
    "nonContactableManifestDigest", "schemaVersion", "createdAt",
  ]);
  const uniqueProspectCount = count(input.uniqueProspectCount);
  const eligibleContactRowCount = count(input.eligibleContactRowCount);
  const exclusionCount = count(input.exclusionCount);
  const nonContactableReferenceCount = count(input.nonContactableReferenceCount);
  if (uniqueProspectCount > eligibleContactRowCount) invalid();
  if (nonContactableReferenceCount > exclusionCount) invalid();
  return deepFreeze({
    id: syntheticId(input.id),
    workspaceId: syntheticId(input.workspaceId),
    companyId: syntheticId(input.companyId),
    profileId: syntheticId(input.profileId),
    eligibilityCandidateId: syntheticId(input.eligibilityCandidateId),
    eligibilityCandidateDigest: digest(input.eligibilityCandidateDigest),
    handoffRequestId: syntheticId(input.handoffRequestId),
    handoffRequestDigest: digest(input.handoffRequestDigest),
    versionIntentId: syntheticId(input.versionIntentId),
    versionIntentDigest: digest(input.versionIntentDigest),
    profileConfigurationId: syntheticId(input.profileConfigurationId),
    profileConfigurationDigest: digest(input.profileConfigurationDigest),
    exportDefinitionId: syntheticId(input.exportDefinitionId),
    exportDefinitionDigest: digest(input.exportDefinitionDigest),
    uniqueProspectCount,
    eligibleContactRowCount,
    exclusionCount,
    exclusionLedgerDigest: digest(input.exclusionLedgerDigest),
    nonContactableReferenceCount,
    nonContactableManifestDigest: digest(input.nonContactableManifestDigest),
    schemaVersion: schemaVersion(input.schemaVersion),
    createdAt: timestamp(input.createdAt),
  });
}

function normalizeAuthority(value: unknown): CurrentAuthority {
  const input = exactRecord(value, [
    "evaluatedAt", "scopeCurrent", "eligibilityCurrent", "requestVersionCurrent",
    "configurationCurrent", "exportDefinitionCurrent", "countsCurrent",
    "exclusionLedgerCurrent", "nonContactableManifestCurrent", "externalEffectsDisabled",
  ]);
  return deepFreeze({
    evaluatedAt: timestamp(input.evaluatedAt),
    scopeCurrent: booleanValue(input.scopeCurrent),
    eligibilityCurrent: booleanValue(input.eligibilityCurrent),
    requestVersionCurrent: booleanValue(input.requestVersionCurrent),
    configurationCurrent: booleanValue(input.configurationCurrent),
    exportDefinitionCurrent: booleanValue(input.exportDefinitionCurrent),
    countsCurrent: booleanValue(input.countsCurrent),
    exclusionLedgerCurrent: booleanValue(input.exclusionLedgerCurrent),
    nonContactableManifestCurrent: booleanValue(input.nonContactableManifestCurrent),
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

function count(value: unknown) {
  if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > MAX_COUNT) invalid();
  return value as number;
}

function schemaVersion(value: unknown) {
  if (value !== 1) invalid();
  return 1 as const;
}

function booleanValue(value: unknown) {
  if (typeof value !== "boolean") invalid();
  return value;
}

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function timestamp(value: unknown) {
  if (!Number.isSafeInteger(value) || (value as number) <= 0 || (value as number) > MAX_TIMESTAMP) invalid();
  return value as number;
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
