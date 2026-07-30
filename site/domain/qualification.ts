export const MINING_EVALUATION_VERSION = "mining-rubric/v1";
export const MINING_HARD_DISQUALIFIERS = Object.freeze([
  "wrong_target_type_or_status_or_geography_or_language",
  "no_relevant_processing_operation",
  "explicit_no_solicitation",
  "duplicate_active_prospect",
  "offer_blocked_by_product_limitation",
] as const);

const REQUIRED_EVIDENCE = ["target", "pain", "timing", "operation", "offer"] as const;
const DIMENSION_SUPPORT = Object.freeze({
  accountFit: "target", painStrength: "pain", timingUrgency: "timing", dataReadiness: "operation", commercialViability: "offer",
} as const);
const DIMENSIONS = Object.freeze(Object.keys(DIMENSION_SUPPORT) as Dimension[]);
const ID_FIELDS = ["candidateId", "accountId", "targetId", "offerId"] as const;
type Dimension = keyof typeof DIMENSION_SUPPORT;
type Recency = "current" | "account_context_reconfirmation_required";
type Source = { id: string; tier: number; independenceGroup: string; retrievedAt: number; recency: Recency; material: boolean };

export type MiningQualificationInput = Readonly<{
  configurationDigest?: string; rubricDigest?: string; evaluationVersion?: string;
  candidateId?: string; accountId?: string; targetId?: string; offerId?: string;
  accountFit?: number; painStrength?: number; timingUrgency?: number; dataReadiness?: number; commercialViability?: number;
  requiredEvidence?: readonly string[]; sources?: readonly Source[]; hardDisqualifiers?: readonly string[];
}>;

type Outcome = "Passed" | "NotQualified" | "InsufficientEvidence" | "Disqualified";
type CitedSource = Readonly<{ id: string; tier: 1 | 2 | 3; independenceGroup: string; retrievedAt: number; recency: Recency; material: boolean }>;
type GateCheck = Readonly<{ gate: string; passed: boolean; detail: string }>;
type SortInputs = readonly [number, number, number, number, string];

export type MiningQualification = Readonly<{
  evaluationVersion: typeof MINING_EVALUATION_VERSION; configurationDigest: string; rubricDigest: string;
  candidateId: string; accountId: string; targetId: string; offerId: string;
  outcome: Outcome; score: number; anchors: Readonly<Record<Dimension, number>>;
  missingFields: readonly string[]; citedSources: readonly CitedSource[]; gateChecks: readonly GateCheck[];
  freshestMaterialEvent: number | null; sortInputs: SortInputs; tieOrder: SortInputs;
}>;

/**
 * Pure, total evaluator for an already application-validated immutable evidence snapshot.
 * It deliberately ignores runner recommendations and unknown properties: only the pinned
 * rubric, trusted source facts, and recorded hard gates can affect an assessment.
 */
export function evaluateMiningQualification(value: MiningQualificationInput | unknown): MiningQualification {
  const input = record(value);
  const configurationDigest = digest(input.configurationDigest);
  const rubricDigest = digest(input.rubricDigest);
  const evaluationVersionValid = input.evaluationVersion === MINING_EVALUATION_VERSION;
  const identities = Object.freeze({
    candidateId: identifier(input.candidateId), accountId: identifier(input.accountId), targetId: identifier(input.targetId), offerId: identifier(input.offerId),
  });
  const suppliedEvidence = evidenceFields(input.requiredEvidence);
  const missingEvidence = REQUIRED_EVIDENCE.filter((field) => !suppliedEvidence.has(field));
  const anchors = Object.freeze(Object.fromEntries(DIMENSIONS.map((dimension) => [dimension, suppliedEvidence.has(DIMENSION_SUPPORT[dimension]) ? anchor(input[dimension]) : 0])) as Record<Dimension, number>);
  const sources = normalizeSources(input.sources);
  const currentSources = sources.filter((source) => source.recency === "current");
  const tierOne = currentSources.filter((source) => source.tier === 1);
  const tierTwoGroups = new Set(currentSources.filter((source) => source.tier === 2).map((source) => source.independenceGroup));
  const qualifyingSources = tierOne.length >= 1 || tierTwoGroups.size >= 2;
  const hardGates = hardDisqualifiers(input.hardDisqualifiers);
  const missingFields = Object.freeze([
    ...(configurationDigest.valid ? [] : ["configurationDigest"]),
    ...(rubricDigest.valid ? [] : ["rubricDigest"]),
    ...(evaluationVersionValid ? [] : ["evaluationVersion"]),
    ...ID_FIELDS.filter((field) => identities[field] === "unavailable"),
    ...missingEvidence,
    ...(sources.length ? [] : ["sources"]),
  ]);
  const score = DIMENSIONS.reduce((sum, dimension) => sum + anchors[dimension], 0);
  const painTiming = anchors.painStrength >= 1 && anchors.timingUrgency >= 1;
  const immutableConfiguration = configurationDigest.valid && rubricDigest.valid && evaluationVersionValid;
  const complete = immutableConfiguration && ID_FIELDS.every((field) => identities[field] !== "unavailable") && missingEvidence.length === 0;
  const outcome: Outcome = hardGates.length > 0 ? "Disqualified" : !complete || !qualifyingSources ? "InsufficientEvidence" : score >= 7 && painTiming ? "Passed" : "NotQualified";
  const freshestMaterialEvent = currentSources.filter((source) => source.material).reduce<number | null>((latest, source) => latest === null || source.retrievedAt > latest ? source.retrievedAt : latest, null);
  const sortInputs = Object.freeze([anchors.painStrength, anchors.timingUrgency, anchors.accountFit, freshestMaterialEvent ?? -1, identities.candidateId] as const);
  const gateChecks = Object.freeze([
    gate("immutable_configuration", immutableConfiguration, `configuration:${configurationDigest.valid};rubric:${rubricDigest.valid};version:${evaluationVersionValid}`),
    gate("trusted_identity_fields", ID_FIELDS.every((field) => identities[field] !== "unavailable"), ID_FIELDS.filter((field) => identities[field] === "unavailable").join(",") || "complete"),
    gate("required_evidence", missingEvidence.length === 0, missingEvidence.join(",") || "complete"),
    gate("independent_qualifying_sources", qualifyingSources, `tier1:${tierOne.length};tier2_groups:${tierTwoGroups.size}`),
    gate("pain_and_timing", painTiming, `pain:${anchors.painStrength};timing:${anchors.timingUrgency}`),
    ...MINING_HARD_DISQUALIFIERS.map((name) => gate(name, !hardGates.includes(name), hardGates.includes(name) ? "present" : "absent")),
  ]);
  return Object.freeze({
    evaluationVersion: MINING_EVALUATION_VERSION, configurationDigest: configurationDigest.value, rubricDigest: rubricDigest.value,
    ...identities, outcome, score, anchors, missingFields, citedSources: Object.freeze(sources), gateChecks,
    freshestMaterialEvent, sortInputs, tieOrder: sortInputs,
  });
}

export function orderQualificationCandidates(inputs: readonly MiningQualificationInput[]): MiningQualification[] {
  return inputs.map(evaluateMiningQualification).sort((left, right) =>
    right.score - left.score || right.sortInputs[0] - left.sortInputs[0] || right.sortInputs[1] - left.sortInputs[1] || right.sortInputs[2] - left.sortInputs[2] || right.sortInputs[3] - left.sortInputs[3] || compare(left.sortInputs[4], right.sortInputs[4]),
  );
}

function normalizeSources(rawSources: unknown): CitedSource[] {
  if (!Array.isArray(rawSources)) return [];
  const candidates: CitedSource[] = [];
  for (const rawSource of rawSources) {
    if (!rawSource || typeof rawSource !== "object" || Array.isArray(rawSource)) continue;
    const source = rawSource as Record<string, unknown>;
    if (identifier(source.id) === "unavailable" || ![1, 2, 3].includes(source.tier as number) || identifier(source.independenceGroup) === "unavailable" || !Number.isSafeInteger(source.retrievedAt) || (source.recency !== "current" && source.recency !== "account_context_reconfirmation_required") || typeof source.material !== "boolean") continue;
    candidates.push(Object.freeze({ id: source.id as string, tier: source.tier as 1 | 2 | 3, independenceGroup: source.independenceGroup as string, retrievedAt: source.retrievedAt as number, recency: source.recency, material: source.material }));
  }
  candidates.sort(compareSources);
  const unique = new Map<string, CitedSource>();
  for (const source of candidates) if (!unique.has(source.id)) unique.set(source.id, source);
  return [...unique.values()];
}

function evidenceFields(value: unknown): Set<string> {
  if (!Array.isArray(value)) return new Set();
  return new Set(value.filter((field): field is string => typeof field === "string" && (REQUIRED_EVIDENCE as readonly string[]).includes(field)));
}
function hardDisqualifiers(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return [];
  return MINING_HARD_DISQUALIFIERS.filter((gate) => value.includes(gate));
}
function anchor(value: unknown): number { return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 2 ? value as number : 0; }
function digest(value: unknown) { return typeof value === "string" && /^[0-9a-f]{64}$/.test(value) ? { valid: true, value } : { valid: false, value: "unavailable" }; }
function identifier(value: unknown): string { return typeof value === "string" && value.normalize("NFC").trim() ? value.normalize("NFC").trim() : "unavailable"; }
function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function gate(gate: string, passed: boolean, detail: string): GateCheck { return Object.freeze({ gate, passed, detail }); }
function compare(left: string, right: string) { return left < right ? -1 : left > right ? 1 : 0; }
function compareSources(left: CitedSource, right: CitedSource) { return compare(left.id, right.id) || left.tier - right.tier || compare(left.independenceGroup, right.independenceGroup) || left.retrievedAt - right.retrievedAt || compare(left.recency, right.recency) || Number(left.material) - Number(right.material); }
