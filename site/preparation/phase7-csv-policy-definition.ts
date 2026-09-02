type Effects = Readonly<{
  durableMutations: 0;
  csvSerializations: 0;
  checksumCalculations: 0;
  exportMutations: 0;
  deliveryInvocations: 0;
  downloadInvocations: 0;
  providerCalls: 0;
}>;

const FIELD_IDS = [
  "prospect_id",
  "company_id",
  "product_id",
  "market_play_id",
  "profile_id",
  "account_target",
  "selected_role",
  "contact_id",
  "contact_point_id",
  "contact_kind",
  "contact_value",
  "verification_class",
  "verification_method_ref",
  "verification_time",
  "qualification_score_ref",
  "evidence_refs",
  "offer_ref",
  "package_ref",
  "activity_status",
  "source_workspace_id",
  "source_run_id",
  "export_manifest_ref",
] as const;
const SORT_KEY_IDS = ["prospect_id", "contact_id", "contact_point_id"] as const;

type PolicySnapshot = Readonly<{
  id: string;
  schemaVersion: 1;
  fieldIds: readonly string[];
  sortKeyIds: readonly string[];
  encoding: "utf-8";
  byteOrderMark: "absent";
  recordSeparator: "crlf";
  headerPolicy: "single_header_row";
  quotingPolicy: "rfc4180_double_quote";
  nullPolicy: "empty_field";
  formulaNeutralizationPolicy: "prefix_apostrophe_for_equals_plus_minus_at";
  createdAt: number;
}>;

export type SyntheticCsvPolicyDefinition = Readonly<{
  kind: "synthetic_phase7_csv_policy_definition";
  id: string;
  digest: string;
  snapshot: PolicySnapshot;
  operationalPolicyClaimed: false;
  csvArtifactClaimed: false;
  checksumClaimed: false;
  phaseExecutionAuthorized: false;
  runtimeCompositionAuthorized: false;
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
  schemaCurrent: boolean;
  fieldOrderCurrent: boolean;
  sortOrderCurrent: boolean;
  encodingCurrent: boolean;
  byteOrderMarkCurrent: boolean;
  recordSeparatorCurrent: boolean;
  headerPolicyCurrent: boolean;
  quotingPolicyCurrent: boolean;
  nullPolicyCurrent: boolean;
  formulaNeutralizationCurrent: boolean;
  externalEffectsDisabled: boolean;
}>;

const SYNTHETIC_ID = /^synthetic-[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/u;
const MAX_TIMESTAMP = 8_640_000_000_000_000;
const definitions = new WeakSet<object>();
const ZERO_EFFECTS: Effects = deepFreeze({
  durableMutations: 0,
  csvSerializations: 0,
  checksumCalculations: 0,
  exportMutations: 0,
  deliveryInvocations: 0,
  downloadInvocations: 0,
  providerCalls: 0,
});

/**
 * Binds the one generic launch CSV schema and text-safety policy into a digest.
 * It accepts no row value and cannot serialize, persist, deliver, or export.
 */
export async function buildSyntheticCsvPolicyDefinition(
  value: unknown,
): Promise<SyntheticCsvPolicyDefinition> {
  try {
    const snapshot = normalizePolicy(value);
    const artifact: SyntheticCsvPolicyDefinition = deepFreeze({
      kind: "synthetic_phase7_csv_policy_definition",
      id: snapshot.id,
      digest: await sha256Ascii(JSON.stringify(snapshot)),
      snapshot,
      operationalPolicyClaimed: false,
      csvArtifactClaimed: false,
      checksumClaimed: false,
      phaseExecutionAuthorized: false,
      runtimeCompositionAuthorized: false,
      persistenceAuthorized: false,
      csvSerializationAuthorized: false,
      deliveryAuthorized: false,
      downloadAuthorized: false,
      exportAuthorized: false,
      providerInvocationAuthorized: false,
      effects: ZERO_EFFECTS,
    });
    definitions.add(artifact);
    return artifact;
  } catch {
    throw new Error("synthetic_phase7_csv_policy_definition_invalid");
  }
}

/**
 * Rechecks that the closed synthetic policy digest and its authority flags are
 * current. A passing decision still cannot create a CSV artifact or effect.
 */
export async function evaluateSyntheticCsvPolicyDefinition(value: unknown) {
  try {
    const input = exactRecord(value, ["candidate", "currentCandidate", "currentAuthority"]);
    if (!definitions.has(input.candidate as object)) invalid();
    const artifact = input.candidate as SyntheticCsvPolicyDefinition;
    const current = await buildSyntheticCsvPolicyDefinition(input.currentCandidate);
    const authority = normalizeAuthority(input.currentAuthority);
    const reasons: string[] = [];

    if (current.digest !== artifact.digest) reasons.push("csv_policy_definition_changed");
    if (authority.evaluatedAt < artifact.snapshot.createdAt) {
      reasons.push("evaluation_precedes_csv_policy_definition");
    }
    if (!authority.schemaCurrent) reasons.push("csv_schema_not_current");
    if (!authority.fieldOrderCurrent) reasons.push("csv_field_order_not_current");
    if (!authority.sortOrderCurrent) reasons.push("csv_sort_order_not_current");
    if (!authority.encodingCurrent) reasons.push("csv_encoding_not_current");
    if (!authority.byteOrderMarkCurrent) reasons.push("csv_byte_order_mark_not_current");
    if (!authority.recordSeparatorCurrent) reasons.push("csv_record_separator_not_current");
    if (!authority.headerPolicyCurrent) reasons.push("csv_header_policy_not_current");
    if (!authority.quotingPolicyCurrent) reasons.push("csv_quoting_policy_not_current");
    if (!authority.nullPolicyCurrent) reasons.push("csv_null_policy_not_current");
    if (!authority.formulaNeutralizationCurrent) {
      reasons.push("csv_formula_neutralization_not_current");
    }
    if (!authority.externalEffectsDisabled) reasons.push("external_effects_not_disabled");

    const reasonCodes = deepFreeze([...new Set(reasons)].sort(compareText));
    return deepFreeze({
      kind: "synthetic_phase7_csv_policy_definition_decision" as const,
      status: reasonCodes.length === 0
        ? "synthetic_csv_policy_definition_current_no_authority" as const
        : "synthetic_csv_policy_definition_rejected" as const,
      candidateId: artifact.id,
      candidateDigest: artifact.digest,
      schemaVersion: artifact.snapshot.schemaVersion,
      fieldIds: artifact.snapshot.fieldIds,
      sortKeyIds: artifact.snapshot.sortKeyIds,
      currentDefinitionClaimed: reasonCodes.length === 0,
      operationalPolicyClaimed: false as const,
      csvArtifactClaimed: false as const,
      checksumClaimed: false as const,
      phaseExecutionAuthorized: false as const,
      runtimeCompositionAuthorized: false as const,
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
    throw new Error("synthetic_phase7_csv_policy_definition_decision_invalid");
  }
}

function normalizePolicy(value: unknown): PolicySnapshot {
  const input = exactRecord(value, [
    "id", "schemaVersion", "fieldIds", "sortKeyIds", "encoding", "byteOrderMark",
    "recordSeparator", "headerPolicy", "quotingPolicy", "nullPolicy",
    "formulaNeutralizationPolicy", "createdAt",
  ]);
  return deepFreeze({
    id: syntheticId(input.id),
    schemaVersion: exactValue(input.schemaVersion, 1),
    fieldIds: exactStringArray(input.fieldIds, FIELD_IDS),
    sortKeyIds: exactStringArray(input.sortKeyIds, SORT_KEY_IDS),
    encoding: exactValue(input.encoding, "utf-8"),
    byteOrderMark: exactValue(input.byteOrderMark, "absent"),
    recordSeparator: exactValue(input.recordSeparator, "crlf"),
    headerPolicy: exactValue(input.headerPolicy, "single_header_row"),
    quotingPolicy: exactValue(input.quotingPolicy, "rfc4180_double_quote"),
    nullPolicy: exactValue(input.nullPolicy, "empty_field"),
    formulaNeutralizationPolicy: exactValue(
      input.formulaNeutralizationPolicy,
      "prefix_apostrophe_for_equals_plus_minus_at",
    ),
    createdAt: timestamp(input.createdAt),
  });
}

function normalizeAuthority(value: unknown): CurrentAuthority {
  const input = exactRecord(value, [
    "evaluatedAt", "schemaCurrent", "fieldOrderCurrent", "sortOrderCurrent",
    "encodingCurrent", "byteOrderMarkCurrent", "recordSeparatorCurrent",
    "headerPolicyCurrent", "quotingPolicyCurrent", "nullPolicyCurrent",
    "formulaNeutralizationCurrent", "externalEffectsDisabled",
  ]);
  return deepFreeze({
    evaluatedAt: timestamp(input.evaluatedAt),
    schemaCurrent: booleanValue(input.schemaCurrent),
    fieldOrderCurrent: booleanValue(input.fieldOrderCurrent),
    sortOrderCurrent: booleanValue(input.sortOrderCurrent),
    encodingCurrent: booleanValue(input.encodingCurrent),
    byteOrderMarkCurrent: booleanValue(input.byteOrderMarkCurrent),
    recordSeparatorCurrent: booleanValue(input.recordSeparatorCurrent),
    headerPolicyCurrent: booleanValue(input.headerPolicyCurrent),
    quotingPolicyCurrent: booleanValue(input.quotingPolicyCurrent),
    nullPolicyCurrent: booleanValue(input.nullPolicyCurrent),
    formulaNeutralizationCurrent: booleanValue(input.formulaNeutralizationCurrent),
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

function exactStringArray(value: unknown, expected: readonly string[]) {
  if (!Array.isArray(value) || value.length !== expected.length) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).some((key) => typeof key !== "string")) invalid();
  const indexes = [...Array(expected.length).keys()].map(String);
  const actual = Object.keys(descriptors).filter((key) => key !== "length");
  if (actual.sort().join("\0") !== [...indexes].sort().join("\0")) invalid();
  const result = indexes.map((key, index) => {
    const descriptor = descriptors[key];
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) invalid();
    if (descriptor.value !== expected[index]) invalid();
    return descriptor.value as string;
  });
  return deepFreeze(result);
}

function exactValue<const T>(value: unknown, expected: T): T {
  if (value !== expected) invalid();
  return expected;
}

function syntheticId(value: unknown) {
  if (typeof value !== "string" || !SYNTHETIC_ID.test(value)) invalid();
  return value;
}

function timestamp(value: unknown) {
  if (!Number.isSafeInteger(value) || (value as number) <= 0 || (value as number) > MAX_TIMESTAMP) invalid();
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
