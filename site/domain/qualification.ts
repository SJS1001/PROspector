export const MINING_EVALUATION_VERSION = "mining-rubric/v1";
export const MINING_HARD_DISQUALIFIERS = Object.freeze([
  "wrong_target_type_or_status_or_geography_or_language",
  "no_relevant_processing_operation",
  "explicit_no_solicitation",
  "duplicate_active_prospect",
  "offer_blocked_by_product_limitation",
] as const);

const REQUIRED_EVIDENCE = ["target", "pain", "timing", "operation", "offer"] as const;
type Dimension = "accountFit" | "painStrength" | "timingUrgency" | "dataReadiness" | "commercialViability";
type Source = { id: string; tier: number; independenceGroup: string; retrievedAt: number; recency?: "current" | "account_context_reconfirmation_required"; material?: boolean };
export type MiningQualificationInput = Readonly<{
  configurationDigest: string; rubricDigest?: string; candidateId: string; accountId: string; targetId: string; offerId: string;
  accountFit?: number; painStrength?: number; timingUrgency?: number; dataReadiness?: number; commercialViability?: number;
  requiredEvidence?: readonly string[]; sources?: readonly Source[]; hardDisqualifiers?: readonly string[];
}>;

export type MiningQualification = Readonly<{
  evaluationVersion: typeof MINING_EVALUATION_VERSION; configurationDigest: string; rubricDigest: string; candidateId: string;
  outcome: "Passed" | "NotQualified" | "InsufficientEvidence" | "Disqualified"; score: number;
  anchors: Readonly<Record<Dimension, number>>; missingFields: readonly string[]; citedSources: readonly { id: string; tier: 1 | 2 | 3; independenceGroup: string; retrievedAt: number; recency: string }[];
  gateChecks: readonly { gate: string; passed: boolean; detail: string }[]; freshestMaterialEvent: number | null;
  tieOrder: readonly [number, number, number, number, string];
}>;

/** Pure total evaluator: trusted validated evidence in, immutable assessment out. */
export function evaluateMiningQualification(input: MiningQualificationInput): MiningQualification {
  const anchors = Object.freeze({ accountFit: anchor(input.accountFit), painStrength: anchor(input.painStrength), timingUrgency: anchor(input.timingUrgency), dataReadiness: anchor(input.dataReadiness), commercialViability: anchor(input.commercialViability) });
  const populated = new Set((input.requiredEvidence ?? []).filter((value): value is string => typeof value === "string"));
  const missingFields = REQUIRED_EVIDENCE.filter((field) => !populated.has(field));
  const sources = normalizeSources(input.sources ?? []);
  const current = sources.filter((source) => source.recency === "current");
  const tierOne = current.filter((source) => source.tier === 1);
  const tierTwoGroups = new Set(current.filter((source) => source.tier === 2).map((source) => source.independenceGroup));
  const evidenceGate = tierOne.length >= 1 || tierTwoGroups.size >= 2;
  const hardGates = MINING_HARD_DISQUALIFIERS.filter((gate) => (input.hardDisqualifiers ?? []).includes(gate));
  const score = Object.values(anchors).reduce((sum, value) => sum + value, 0);
  const painTimingGate = anchors.painStrength >= 1 && anchors.timingUrgency >= 1;
  const outcome = hardGates.length ? "Disqualified" : missingFields.length || !evidenceGate ? "InsufficientEvidence" : score >= 7 && painTimingGate ? "Passed" : "NotQualified";
  const freshestMaterialEvent = current.filter((source) => source.material).reduce<number | null>((latest, source) => latest === null || source.retrievedAt > latest ? source.retrievedAt : latest, null);
  return Object.freeze({
    evaluationVersion: MINING_EVALUATION_VERSION, configurationDigest: text(input.configurationDigest), rubricDigest: text(input.rubricDigest ?? input.configurationDigest), candidateId: text(input.candidateId), outcome, score, anchors,
    missingFields: Object.freeze([...missingFields]), citedSources: Object.freeze(sources.map(({ id, tier, independenceGroup, retrievedAt, recency }) => Object.freeze({ id, tier, independenceGroup, retrievedAt, recency }))),
    gateChecks: Object.freeze([
      { gate: "required_evidence", passed: missingFields.length === 0, detail: missingFields.join(",") || "complete" },
      { gate: "independent_qualifying_sources", passed: evidenceGate, detail: `tier1:${tierOne.length};tier2_groups:${tierTwoGroups.size}` },
      { gate: "pain_and_timing", passed: painTimingGate, detail: `pain:${anchors.painStrength};timing:${anchors.timingUrgency}` },
      ...MINING_HARD_DISQUALIFIERS.map((gate) => ({ gate, passed: !hardGates.includes(gate), detail: hardGates.includes(gate) ? "present" : "absent" })),
    ]), freshestMaterialEvent,
    tieOrder: Object.freeze([anchors.painStrength, anchors.timingUrgency, anchors.accountFit, freshestMaterialEvent ?? -1, text(input.candidateId)]),
  });
}

export function orderQualificationCandidates(inputs: readonly MiningQualificationInput[]): MiningQualification[] {
  return inputs.map(evaluateMiningQualification).sort((left, right) =>
    right.score - left.score || right.tieOrder[0] - left.tieOrder[0] || right.tieOrder[1] - left.tieOrder[1] || right.tieOrder[2] - left.tieOrder[2] || right.tieOrder[3] - left.tieOrder[3] || left.tieOrder[4].localeCompare(right.tieOrder[4]),
  );
}

function normalizeSources(sources: readonly Source[]) {
  const deduped = new Map<string, { id: string; tier: 1 | 2 | 3; independenceGroup: string; retrievedAt: number; recency: string; material: boolean }>();
  for (const source of sources) {
    if (!source || typeof source.id !== "string" || !source.id || ![1, 2, 3].includes(source.tier) || typeof source.independenceGroup !== "string" || !source.independenceGroup || !Number.isSafeInteger(source.retrievedAt)) continue;
    const normalized = { id: source.id, tier: source.tier as 1 | 2 | 3, independenceGroup: source.independenceGroup, retrievedAt: source.retrievedAt, recency: source.recency === "account_context_reconfirmation_required" ? "account_context_reconfirmation_required" : "current", material: source.material === true };
    const prior = deduped.get(normalized.id); if (!prior || normalized.retrievedAt > prior.retrievedAt) deduped.set(normalized.id, normalized);
  }
  return [...deduped.values()].sort((left, right) => left.id.localeCompare(right.id));
}
function anchor(value: unknown) { return Number.isInteger(value) && value >= 0 && value <= 2 ? value : 0; }
function text(value: unknown) { return typeof value === "string" && value ? value : "unavailable"; }
