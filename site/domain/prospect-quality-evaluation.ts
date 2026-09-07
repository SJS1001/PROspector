export const PROSPECT_QUALITY_SCHEMA = "prospect-quality-evaluation/v1" as const;
export const PROSPECT_QUALITY_MAX_TARGETS = 1_000 as const;
export const PROSPECT_QUALITY_MAX_ITEMS_PER_RESULT = 100 as const;
export const PROSPECT_QUALITY_MAX_LEDGER_ROWS = 10_000 as const;

type ArmName = "system" | "manual";
type Label = "relevant" | "irrelevant" | "unknown";
type EvidenceLabel = "supported_current" | "supported_stale" | "unsupported" | "unknown";
type MatchLabel = "correct" | "incorrect" | "ambiguous" | "unknown";
type AttemptOutcome = "complete" | "no_result" | "partial" | "uncertain";
type Eligibility = "current_eligible" | "stale" | "weak" | "invalid" | "unknown" | "no_result";
type ChargeOutcome = "complete" | "no_result" | "partial" | "uncertain";

type Ratio = Readonly<{
  numerator: number;
  denominator: number;
  value: number | null;
  wilson95: Readonly<{ lower: number; upper: number }> | null;
}>;

type NormalizedTarget = Readonly<{ id: string; stratum: string; label: Label }>;
type NormalizedEvidence = Readonly<{ id: string; label: EvidenceLabel }>;
type NormalizedContact = Readonly<{
  id: string;
  attempted: true;
  outcome: AttemptOutcome;
  identity: MatchLabel | null;
  role: MatchLabel | null;
  currentAffiliation: boolean | null;
  eligibility: Eligibility;
}>;
type NormalizedResult = Readonly<{
  id: string;
  targetId: string;
  surfaced: boolean;
  organizationMatch: MatchLabel | null;
  evidence: readonly NormalizedEvidence[];
  contacts: readonly NormalizedContact[];
}>;
type NormalizedEffort = Readonly<{ id: string; targetId: string; startedAt: string; endedAt: string; durationMilliseconds: number }>;
type NormalizedCost = Readonly<{
  id: string;
  targetId: string;
  outcome: ChargeOutcome;
  actualMinor: number;
  unresolvedReservedMinor: number;
}>;
type Thresholds = Readonly<{
  minAdjudicatedTargets: number;
  minRelevancePrecision: number;
  minClosedSetRecall: number;
  minMaterialEvidenceCoverage: number;
  minEvidenceAccuracy: number;
  minOrganizationAccuracy: number;
  maxOrganizationFalseMatchRate: number;
  minPersonIdentityAccuracy: number;
  minCurrentRoleAccuracy: number;
  minVerificationYield: number;
  minRelevantTargetContactCoverage: number;
  maxActiveMinutesPerUsable: number;
  maxKnownCostMinorPerUsable: number;
  maxAtRiskCostMinorPerUsable: number;
  maxQualityRegressionVsManual: number;
}>;
type NormalizedArm = Readonly<{
  arm: ArmName;
  effortCoverage: "complete";
  costCoverage: "complete";
  results: readonly NormalizedResult[];
  effort: readonly NormalizedEffort[];
  costs: readonly NormalizedCost[];
}>;
type NormalizedInput = Readonly<{
  schema: typeof PROSPECT_QUALITY_SCHEMA;
  datasetKind: "synthetic";
  protocol: Readonly<{
    id: string;
    revision: number;
    frozenAt: string;
    observationStartsAt: string;
    observationEndsAt: string;
    currency: string;
    thresholds: Thresholds;
  }>;
  cohort: Readonly<{ id: string; strata: readonly string[]; targets: readonly NormalizedTarget[] }>;
  arms: readonly NormalizedArm[];
}>;

export type ProspectQualityUnavailableReason =
  | "evaluation_input_malformed"
  | "evaluation_limit_exceeded"
  | "evaluation_cohort_incomplete"
  | "evaluation_arm_mismatch"
  | "evaluation_time_invalid"
  | "evaluation_cost_invalid";

export type ProspectQualityReport = Readonly<{
  status: "available";
  schema: typeof PROSPECT_QUALITY_SCHEMA;
  evidenceClass: "synthetic_only";
  protocolId: string;
  protocolRevision: number;
  protocolDigest: string;
  cohortId: string;
  cohortDigest: string;
  evaluationDigest: string;
  currency: string;
  operationalAcceptance: false;
  sample: Readonly<{
    cohortTargetCount: number;
    adjudicatedTargetCount: number;
    predeclaredMinimum: number;
    meetsPredeclaredMinimum: boolean;
    strata: readonly Readonly<{
      id: string;
      targetCount: number;
      relevantCount: number;
      irrelevantCount: number;
      unknownCount: number;
    }>[];
  }>;
  arms: Readonly<Record<ArmName, ArmMetrics>>;
  pairedDelta: Readonly<Record<QualityMetricName, number | null>>;
  thresholdExercise: Readonly<{
    status: "passed" | "failed";
    checks: Readonly<Record<string, boolean>>;
    meaning: "synthetic_calculation_contract_only";
  }>;
  limitations: readonly string[];
}>;

export type ProspectQualityUnavailable = Readonly<{
  status: "unavailable";
  schema: typeof PROSPECT_QUALITY_SCHEMA;
  operationalAcceptance: false;
  reasonCodes: readonly ProspectQualityUnavailableReason[];
}>;

type QualityMetricName =
  | "closedSetRecall"
  | "relevancePrecision"
  | "materialEvidenceCoverage"
  | "evidenceAccuracy"
  | "organizationAccuracy"
  | "organizationFalseMatchRate"
  | "personIdentityAccuracy"
  | "currentRoleAccuracy"
  | "verificationYield"
  | "relevantTargetContactCoverage";

type ArmMetrics = Readonly<{
  targetCount: number;
  surfacedTargetCount: number;
  evaluationUsableTargetCount: number;
  closedSetRecall: Ratio;
  relevancePrecision: Ratio;
  materialEvidenceCoverage: Ratio;
  evidenceAccuracy: Ratio;
  organizationAccuracy: Ratio;
  organizationFalseMatchRate: Ratio;
  evidenceLabelCounts: Readonly<Record<EvidenceLabel, number>>;
  organizationMatchCounts: Readonly<Record<MatchLabel, number>>;
  personIdentityAccuracy: Ratio;
  currentRoleAccuracy: Ratio;
  personIdentityLabelCounts: Readonly<Record<MatchLabel, number>>;
  roleLabelCounts: Readonly<Record<MatchLabel, number>>;
  affiliationCounts: Readonly<{ current: number; notCurrent: number; unknown: number }>;
  verificationYield: Ratio;
  relevantTargetContactCoverage: Ratio;
  contactOutcomeCounts: Readonly<Record<AttemptOutcome, number>>;
  contactEligibilityCounts: Readonly<Record<Eligibility, number>>;
  activeMinutes: number;
  activeMinutesPerUsable: number | null;
  knownActualCostMinor: number;
  unresolvedReservedCostMinor: number;
  atRiskCostMinor: number;
  knownCostMinorPerUsable: number | null;
  atRiskCostMinorPerUsable: number | null;
  chargeOutcomeCounts: Readonly<Record<ChargeOutcome, number>>;
  unusableReasonCounts: Readonly<Record<string, number>>;
}>;

class InvalidEvaluation extends Error {
  constructor(readonly reason: ProspectQualityUnavailableReason) { super(reason); }
}

const ID = /^[A-Za-z0-9](?:[A-Za-z0-9._:-]{0,126}[A-Za-z0-9])?$/u;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const CURRENCY = /^[A-Z]{3}$/u;
const QUALITY_METRICS: readonly QualityMetricName[] = Object.freeze([
  "closedSetRecall", "relevancePrecision", "materialEvidenceCoverage", "evidenceAccuracy",
  "organizationAccuracy", "organizationFalseMatchRate", "personIdentityAccuracy", "currentRoleAccuracy",
  "verificationYield", "relevantTargetContactCoverage",
]);

/**
 * Deterministic synthetic benchmark reducer. It performs no I/O, persistence,
 * application-state transition, provider operation, or external effect.
 */
export async function evaluateProspectQuality(value: unknown): Promise<ProspectQualityReport | ProspectQualityUnavailable> {
  try {
    const input = normalizeInput(value);
    const targetById = new Map(input.cohort.targets.map((target) => [target.id, target]));
    const [systemArm, manualArm] = [arm(input, "system"), arm(input, "manual")];
    const system = armMetrics(systemArm, targetById);
    const manual = armMetrics(manualArm, targetById);
    const pairedDelta = Object.fromEntries(QUALITY_METRICS.map((name) => [name, delta(system[name], manual[name])])) as Record<QualityMetricName, number | null>;
    const checks = thresholdChecks(input.protocol.thresholds, input.cohort.targets, system, manual, systemArm);
    const protocolDigest = await sha256(canonical(input.protocol));
    const cohortDigest = await sha256(canonical(input.cohort));
    const evaluationDigest = await sha256(canonical(input));
    const sample = sampleProjection(input.cohort.targets, input.cohort.strata, input.protocol.thresholds.minAdjudicatedTargets);
    const limitations = [
      "synthetic_fixture_not_real_quality_evidence",
      "provider_labels_not_application_verification",
      "no_operational_or_weekly_target_claim",
      ...(input.cohort.targets.some((target) => target.label === "unknown") ? ["cohort_contains_unknown_owner_labels"] : []),
      ...(!sample.meetsPredeclaredMinimum ? ["sample_below_predeclared_minimum"] : []),
      ...(sample.strata.some((stratum) => stratum.targetCount === 1) ? ["single_item_stratum_has_unstable_estimate"] : []),
      ...(sample.strata.some((stratum) => stratum.unknownCount > 0) ? ["stratum_contains_unknown_owner_labels"] : []),
      "strata_reported_descriptively_not_individually_powered",
      ...(Object.values(system).some((metric) => isRatio(metric) && metric.value === null) ? ["system_contains_zero_denominator_metric"] : []),
      ...(Object.values(manual).some((metric) => isRatio(metric) && metric.value === null) ? ["manual_contains_zero_denominator_metric"] : []),
    ];
    return deepFreeze({
      status: "available", schema: PROSPECT_QUALITY_SCHEMA, evidenceClass: "synthetic_only",
      protocolId: input.protocol.id, protocolRevision: input.protocol.revision,
      protocolDigest, cohortId: input.cohort.id, cohortDigest, evaluationDigest, currency: input.protocol.currency,
      operationalAcceptance: false, sample, arms: { system, manual }, pairedDelta,
      thresholdExercise: {
        status: Object.values(checks).every(Boolean) ? "passed" : "failed",
        checks, meaning: "synthetic_calculation_contract_only",
      },
      limitations: uniqueSorted(limitations),
    });
  } catch (error) {
    return deepFreeze({
      status: "unavailable", schema: PROSPECT_QUALITY_SCHEMA, operationalAcceptance: false,
      reasonCodes: [error instanceof InvalidEvaluation ? error.reason : "evaluation_input_malformed"],
    });
  }
}

function armMetrics(armValue: NormalizedArm, targetById: ReadonlyMap<string, NormalizedTarget>): ArmMetrics {
  const surfaced = armValue.results.filter((result) => result.surfaced);
  const relevantTargets = [...targetById.values()].filter((target) => target.label === "relevant");
  const surfacedRelevant = surfaced.filter((result) => targetById.get(result.targetId)?.label === "relevant");
  const evidence = surfaced.flatMap((result) => result.evidence);
  const contacts = surfaced.flatMap((result) => result.contacts);
  const returned = contacts.filter((contact) => contact.outcome !== "no_result");
  const evaluationUsable = surfacedRelevant.filter((result) => usable(result));
  const activeMilliseconds = armValue.effort.reduce((sum, row) => sum + row.durationMilliseconds, 0);
  if (!Number.isSafeInteger(activeMilliseconds)) invalid("evaluation_time_invalid");
  const activeMinutes = rounded(activeMilliseconds / 60_000);
  const knownActualCostMinor = armValue.costs.reduce((sum, row) => sum + row.actualMinor, 0);
  const unresolvedReservedCostMinor = armValue.costs.reduce((sum, row) => sum + row.unresolvedReservedMinor, 0);
  if (!Number.isSafeInteger(knownActualCostMinor) || !Number.isSafeInteger(unresolvedReservedCostMinor) || !Number.isSafeInteger(knownActualCostMinor + unresolvedReservedCostMinor)) invalid("evaluation_cost_invalid");
  const outcomeCounts = countEnum(contacts.map((contact) => contact.outcome), ["complete", "no_result", "partial", "uncertain"] as const);
  const chargeOutcomeCounts = countEnum(armValue.costs.map((cost) => cost.outcome), ["complete", "no_result", "partial", "uncertain"] as const);
  const unusableReasonCounts: Record<string, number> = {};
  for (const result of surfacedRelevant) for (const reason of unusableReasons(result)) unusableReasonCounts[reason] = (unusableReasonCounts[reason] ?? 0) + 1;
  const usableCount = evaluationUsable.length;
  return deepFreeze({
    targetCount: targetById.size,
    surfacedTargetCount: surfaced.length,
    evaluationUsableTargetCount: usableCount,
    closedSetRecall: ratio(surfacedRelevant.length, relevantTargets.length),
    relevancePrecision: ratio(surfacedRelevant.length, surfaced.length),
    materialEvidenceCoverage: ratio(surfaced.filter((result) => result.evidence.length > 0).length, surfaced.length),
    evidenceAccuracy: ratio(evidence.filter((claim) => claim.label === "supported_current").length, evidence.length),
    organizationAccuracy: ratio(surfaced.filter((result) => result.organizationMatch === "correct").length, surfaced.length),
    organizationFalseMatchRate: ratio(surfaced.filter((result) => result.organizationMatch === "incorrect").length, surfaced.length),
    evidenceLabelCounts: countEnum(evidence.map((claim) => claim.label), ["supported_current", "supported_stale", "unsupported", "unknown"] as const),
    organizationMatchCounts: countEnum(surfaced.map((result) => result.organizationMatch!), ["correct", "incorrect", "ambiguous", "unknown"] as const),
    personIdentityAccuracy: ratio(returned.filter((contact) => contact.identity === "correct").length, returned.length),
    currentRoleAccuracy: ratio(returned.filter((contact) => contact.identity === "correct" && contact.role === "correct" && contact.currentAffiliation === true).length, returned.length),
    personIdentityLabelCounts: countEnum(returned.map((contact) => contact.identity!), ["correct", "incorrect", "ambiguous", "unknown"] as const),
    roleLabelCounts: countEnum(returned.map((contact) => contact.role!), ["correct", "incorrect", "ambiguous", "unknown"] as const),
    affiliationCounts: {
      current: returned.filter((contact) => contact.currentAffiliation === true).length,
      notCurrent: returned.filter((contact) => contact.currentAffiliation === false).length,
      unknown: returned.filter((contact) => contact.currentAffiliation === null).length,
    },
    verificationYield: ratio(contacts.filter((contact) => contact.eligibility === "current_eligible").length, contacts.length),
    relevantTargetContactCoverage: ratio(surfacedRelevant.filter((result) => result.contacts.some((contact) => contact.eligibility === "current_eligible")).length, surfacedRelevant.length),
    contactOutcomeCounts: outcomeCounts,
    contactEligibilityCounts: countEnum(contacts.map((contact) => contact.eligibility), ["current_eligible", "stale", "weak", "invalid", "unknown", "no_result"] as const),
    activeMinutes,
    activeMinutesPerUsable: usableCount === 0 ? null : rounded(activeMilliseconds / (60_000 * usableCount)),
    knownActualCostMinor,
    unresolvedReservedCostMinor,
    atRiskCostMinor: knownActualCostMinor + unresolvedReservedCostMinor,
    knownCostMinorPerUsable: perUsable(knownActualCostMinor, usableCount),
    atRiskCostMinorPerUsable: perUsable(knownActualCostMinor + unresolvedReservedCostMinor, usableCount),
    chargeOutcomeCounts,
    unusableReasonCounts: Object.fromEntries(Object.entries(unusableReasonCounts).sort(([a], [b]) => compareCodeUnits(a, b))),
  });
}

function arm(input: NormalizedInput, name: ArmName): NormalizedArm {
  const result = input.arms.find((candidate) => candidate.arm === name);
  if (!result) invalid("evaluation_arm_mismatch");
  return result;
}

function usable(result: NormalizedResult) { return unusableReasons(result).length === 0; }
function unusableReasons(result: NormalizedResult) {
  const reasons: string[] = [];
  if (result.organizationMatch !== "correct") reasons.push("organization_not_confirmed");
  if (!result.evidence.length) reasons.push("material_evidence_missing");
  else if (result.evidence.some((claim) => claim.label !== "supported_current")) reasons.push("material_evidence_not_current_and_supported");
  if (!result.contacts.some((contact) => contact.identity === "correct" && contact.role === "correct" && contact.currentAffiliation === true && contact.eligibility === "current_eligible")) reasons.push("current_role_contact_missing");
  return reasons;
}

function thresholdChecks(thresholds: Thresholds, targets: readonly NormalizedTarget[], system: ArmMetrics, manual: ArmMetrics, systemArm: NormalizedArm) {
  const checks: Record<string, boolean> = {
    minimumAdjudicatedTargets: targets.filter((target) => target.label !== "unknown").length >= thresholds.minAdjudicatedTargets && targets.every((target) => target.label !== "unknown"),
    relevancePrecision: atLeast(system.relevancePrecision, thresholds.minRelevancePrecision),
    closedSetRecall: atLeast(system.closedSetRecall, thresholds.minClosedSetRecall),
    materialEvidenceCoverage: atLeast(system.materialEvidenceCoverage, thresholds.minMaterialEvidenceCoverage),
    evidenceAccuracy: atLeast(system.evidenceAccuracy, thresholds.minEvidenceAccuracy),
    organizationAccuracy: atLeast(system.organizationAccuracy, thresholds.minOrganizationAccuracy),
    organizationFalseMatchRate: atMost(system.organizationFalseMatchRate, thresholds.maxOrganizationFalseMatchRate),
    personIdentityAccuracy: atLeast(system.personIdentityAccuracy, thresholds.minPersonIdentityAccuracy),
    currentRoleAccuracy: atLeast(system.currentRoleAccuracy, thresholds.minCurrentRoleAccuracy),
    verificationYield: atLeast(system.verificationYield, thresholds.minVerificationYield),
    relevantTargetContactCoverage: atLeast(system.relevantTargetContactCoverage, thresholds.minRelevantTargetContactCoverage),
    activeMinutesPerUsable: exactActiveMinutesAtMost(systemArm, system.evaluationUsableTargetCount, thresholds.maxActiveMinutesPerUsable),
    knownCostPerUsable: finiteAtMost(system.knownCostMinorPerUsable, thresholds.maxKnownCostMinorPerUsable),
    atRiskCostPerUsable: finiteAtMost(system.atRiskCostMinorPerUsable, thresholds.maxAtRiskCostMinorPerUsable),
  };
  for (const name of QUALITY_METRICS) {
    const systemValue = exactValue(system[name]);
    const manualValue = exactValue(manual[name]);
    const favorable = name !== "organizationFalseMatchRate";
    checks[`manualNonInferiority.${name}`] = systemValue !== null && manualValue !== null && (favorable
      ? systemValue >= manualValue - thresholds.maxQualityRegressionVsManual
      : systemValue <= manualValue + thresholds.maxQualityRegressionVsManual);
  }
  return Object.fromEntries(Object.entries(checks).sort(([a], [b]) => compareCodeUnits(a, b)));
}

function sampleProjection(targets: readonly NormalizedTarget[], strata: readonly string[], predeclaredMinimum: number) {
  const adjudicatedTargetCount = targets.filter((target) => target.label !== "unknown").length;
  return deepFreeze({
    cohortTargetCount: targets.length,
    adjudicatedTargetCount,
    predeclaredMinimum,
    meetsPredeclaredMinimum: adjudicatedTargetCount >= predeclaredMinimum && adjudicatedTargetCount === targets.length,
    strata: [...strata].sort(compareCodeUnits).map((stratum) => {
      const members = targets.filter((target) => target.stratum === stratum);
      return {
        id: stratum,
        targetCount: members.length,
        relevantCount: members.filter((target) => target.label === "relevant").length,
        irrelevantCount: members.filter((target) => target.label === "irrelevant").length,
        unknownCount: members.filter((target) => target.label === "unknown").length,
      };
    }),
  });
}

function normalizeInput(value: unknown): NormalizedInput {
  const root = exact(value, ["schema", "datasetKind", "protocol", "cohort", "arms"]);
  if (root.schema !== PROSPECT_QUALITY_SCHEMA || root.datasetKind !== "synthetic") malformed();
  const protocolValue = exact(root.protocol, ["id", "revision", "frozenAt", "observationStartsAt", "observationEndsAt", "currency", "thresholds"]);
  const frozenAt = instant(protocolValue.frozenAt), observationStartsAt = instant(protocolValue.observationStartsAt), observationEndsAt = instant(protocolValue.observationEndsAt);
  if (Date.parse(observationStartsAt) >= Date.parse(observationEndsAt) || Date.parse(frozenAt) > Date.parse(observationStartsAt)) invalid("evaluation_time_invalid");
  if (!CURRENCY.test(String(protocolValue.currency))) invalid("evaluation_cost_invalid");
  const thresholds = normalizeThresholds(protocolValue.thresholds);
  const cohortValue = exact(root.cohort, ["id", "strata", "targets"]);
  const strata = dense(cohortValue.strata, 100).map((item) => text(item));
  unique(strata);
  const rawTargets = dense(cohortValue.targets, PROSPECT_QUALITY_MAX_TARGETS);
  if (!rawTargets.length) invalid("evaluation_cohort_incomplete");
  const targets = rawTargets.map((entry) => {
    const row = exact(entry, ["id", "stratum", "label"]);
    const stratum = text(row.stratum), label = enumValue(row.label, ["relevant", "irrelevant", "unknown"] as const);
    if (!strata.includes(stratum)) invalid("evaluation_cohort_incomplete");
    return { id: id(row.id), stratum, label };
  }).sort(byId);
  unique(targets.map((target) => target.id));
  const targetIds = new Set(targets.map((target) => target.id));
  const arms = dense(root.arms, 2).map((entry) => normalizeArm(entry, targetIds, observationStartsAt, observationEndsAt, String(protocolValue.currency))).sort((a, b) => compareCodeUnits(a.arm, b.arm));
  if (arms.length !== 2 || arms[0]?.arm !== "manual" || arms[1]?.arm !== "system") invalid("evaluation_arm_mismatch");
  for (const candidate of arms) if (candidate.results.length !== targets.length || candidate.results.some((result) => !targetIds.has(result.targetId))) invalid("evaluation_arm_mismatch");
  for (const armValue of arms) {
    unique(armValue.results.flatMap((result) => result.evidence.map((claim) => claim.id)));
    unique(armValue.results.flatMap((result) => result.contacts.map((contact) => contact.id)));
  }
  for (const selector of [
    (armValue: NormalizedArm) => armValue.results.map((result) => result.id),
    (armValue: NormalizedArm) => armValue.results.flatMap((result) => result.evidence.map((claim) => claim.id)),
    (armValue: NormalizedArm) => armValue.results.flatMap((result) => result.contacts.map((contact) => contact.id)),
    (armValue: NormalizedArm) => armValue.effort.map((item) => item.id),
    (armValue: NormalizedArm) => armValue.costs.map((item) => item.id),
  ]) unique(arms.flatMap(selector));
  const allEffort = arms.flatMap((armValue) => armValue.effort).sort((a, b) => compareCodeUnits(a.startedAt, b.startedAt) || compareCodeUnits(a.id, b.id));
  for (let index = 1; index < allEffort.length; index += 1) if (Date.parse(allEffort[index - 1]!.endedAt) > Date.parse(allEffort[index]!.startedAt)) invalid("evaluation_time_invalid");
  return deepFreeze({
    schema: PROSPECT_QUALITY_SCHEMA, datasetKind: "synthetic",
    protocol: { id: id(protocolValue.id), revision: positiveInteger(protocolValue.revision), frozenAt, observationStartsAt, observationEndsAt, currency: String(protocolValue.currency), thresholds },
    cohort: { id: id(cohortValue.id), strata: [...strata].sort(compareCodeUnits), targets }, arms,
  });
}

function normalizeArm(value: unknown, targetIds: ReadonlySet<string>, startsAt: string, endsAt: string, currency: string): NormalizedArm {
  const row = exact(value, ["arm", "effortCoverage", "costCoverage", "results", "effort", "costs"]);
  const armName = enumValue(row.arm, ["system", "manual"] as const);
  if (row.effortCoverage !== "complete" || row.costCoverage !== "complete") malformed();
  const results = dense(row.results, PROSPECT_QUALITY_MAX_TARGETS).map((entry) => {
    const result = exact(entry, ["id", "targetId", "surfaced", "organizationMatch", "evidence", "contacts"]);
    const targetId = id(result.targetId);
    if (!targetIds.has(targetId) || typeof result.surfaced !== "boolean") invalid("evaluation_arm_mismatch");
    const organizationMatch = result.organizationMatch === null ? null : enumValue(result.organizationMatch, ["correct", "incorrect", "ambiguous", "unknown"] as const);
    const evidence = dense(result.evidence, PROSPECT_QUALITY_MAX_ITEMS_PER_RESULT).map((entryValue) => {
      const claim = exact(entryValue, ["id", "label"]);
      return { id: id(claim.id), label: enumValue(claim.label, ["supported_current", "supported_stale", "unsupported", "unknown"] as const) };
    }).sort(byId);
    const contacts = dense(result.contacts, PROSPECT_QUALITY_MAX_ITEMS_PER_RESULT).map((entryValue) => normalizeContact(entryValue)).sort(byId);
    unique(evidence.map((claim) => claim.id)); unique(contacts.map((contact) => contact.id));
    if (!result.surfaced && (organizationMatch !== null || evidence.length || contacts.length)) invalid("evaluation_arm_mismatch");
    if (result.surfaced && organizationMatch === null) invalid("evaluation_arm_mismatch");
    return { id: id(result.id), targetId, surfaced: result.surfaced, organizationMatch, evidence, contacts };
  }).sort((a, b) => compareCodeUnits(a.targetId, b.targetId));
  unique(results.map((result) => result.id)); unique(results.map((result) => result.targetId));
  const effort = dense(row.effort, PROSPECT_QUALITY_MAX_LEDGER_ROWS).map((entry) => normalizeEffort(entry, targetIds, startsAt, endsAt)).sort((a, b) => compareCodeUnits(a.startedAt, b.startedAt) || compareCodeUnits(a.id, b.id));
  unique(effort.map((item) => item.id));
  for (let index = 1; index < effort.length; index += 1) if (Date.parse(effort[index - 1]!.endedAt) > Date.parse(effort[index]!.startedAt)) invalid("evaluation_time_invalid");
  const costs = dense(row.costs, PROSPECT_QUALITY_MAX_LEDGER_ROWS).map((entry) => normalizeCost(entry, targetIds, currency)).sort(byId);
  unique(costs.map((item) => item.id));
  return { arm: armName, effortCoverage: "complete", costCoverage: "complete", results, effort, costs };
}

function normalizeContact(value: unknown): NormalizedContact {
  const row = exact(value, ["id", "attempted", "outcome", "identity", "role", "currentAffiliation", "eligibility"]);
  if (row.attempted !== true) malformed();
  const outcome = enumValue(row.outcome, ["complete", "no_result", "partial", "uncertain"] as const);
  const identity = row.identity === null ? null : enumValue(row.identity, ["correct", "incorrect", "ambiguous", "unknown"] as const);
  const role = row.role === null ? null : enumValue(row.role, ["correct", "incorrect", "ambiguous", "unknown"] as const);
  if (row.currentAffiliation !== null && typeof row.currentAffiliation !== "boolean") malformed();
  const eligibility = enumValue(row.eligibility, ["current_eligible", "stale", "weak", "invalid", "unknown", "no_result"] as const);
  if (outcome === "no_result") {
    if (identity !== null || role !== null || row.currentAffiliation !== null || eligibility !== "no_result") malformed();
  } else if (identity === null || role === null || eligibility === "no_result" || (outcome === "uncertain" && eligibility === "current_eligible")) malformed();
  return { id: id(row.id), attempted: true, outcome, identity, role, currentAffiliation: row.currentAffiliation as boolean | null, eligibility };
}

function normalizeEffort(value: unknown, targetIds: ReadonlySet<string>, startsAt: string, endsAt: string): NormalizedEffort {
  const row = exact(value, ["id", "targetId", "startedAt", "endedAt"]);
  const targetId = id(row.targetId), start = instant(row.startedAt), end = instant(row.endedAt);
  const startMs = Date.parse(start), endMs = Date.parse(end);
  if (!targetIds.has(targetId) || startMs < Date.parse(startsAt) || endMs > Date.parse(endsAt) || startMs >= endMs) invalid("evaluation_time_invalid");
  return { id: id(row.id), targetId, startedAt: start, endedAt: end, durationMilliseconds: endMs - startMs };
}

function normalizeCost(value: unknown, targetIds: ReadonlySet<string>, expectedCurrency: string): NormalizedCost {
  const row = exact(value, ["id", "targetId", "outcome", "currency", "actualMinor", "unresolvedReservedMinor"]);
  const targetId = id(row.targetId), outcome = enumValue(row.outcome, ["complete", "no_result", "partial", "uncertain"] as const);
  if (!targetIds.has(targetId) || row.currency !== expectedCurrency) invalid("evaluation_cost_invalid");
  const actualMinor = nonnegativeInteger(row.actualMinor), unresolvedReservedMinor = nonnegativeInteger(row.unresolvedReservedMinor);
  if (outcome !== "uncertain" && unresolvedReservedMinor !== 0) invalid("evaluation_cost_invalid");
  return { id: id(row.id), targetId, outcome, actualMinor, unresolvedReservedMinor };
}

function normalizeThresholds(value: unknown): Thresholds {
  const keys = [
    "minAdjudicatedTargets", "minRelevancePrecision", "minClosedSetRecall", "minMaterialEvidenceCoverage", "minEvidenceAccuracy",
    "minOrganizationAccuracy", "maxOrganizationFalseMatchRate", "minPersonIdentityAccuracy", "minCurrentRoleAccuracy",
    "minVerificationYield", "minRelevantTargetContactCoverage", "maxActiveMinutesPerUsable",
    "maxKnownCostMinorPerUsable", "maxAtRiskCostMinorPerUsable", "maxQualityRegressionVsManual",
  ];
  const row = exact(value, keys);
  if (!Number.isSafeInteger(row.minAdjudicatedTargets) || Number(row.minAdjudicatedTargets) <= 0 || Number(row.minAdjudicatedTargets) > PROSPECT_QUALITY_MAX_TARGETS) malformed();
  const ratioKeys = keys.filter((key) => !["minAdjudicatedTargets", "maxActiveMinutesPerUsable", "maxKnownCostMinorPerUsable", "maxAtRiskCostMinorPerUsable"].includes(key));
  for (const key of ratioKeys) if (typeof row[key] !== "number" || !Number.isFinite(row[key]) || Number(row[key]) < 0 || Number(row[key]) > 1) malformed();
  if (typeof row.maxActiveMinutesPerUsable !== "number" || !Number.isFinite(row.maxActiveMinutesPerUsable) || row.maxActiveMinutesPerUsable < 0) malformed();
  for (const key of ["maxKnownCostMinorPerUsable", "maxAtRiskCostMinorPerUsable"]) if (!Number.isSafeInteger(row[key]) || Number(row[key]) < 0) malformed();
  return row as Thresholds;
}

function ratio(numerator: number, denominator: number): Ratio {
  if (denominator === 0) return deepFreeze({ numerator, denominator, value: null, wilson95: null });
  const value = numerator / denominator, z = 1.959963984540054, z2 = z * z;
  const center = (value + z2 / (2 * denominator)) / (1 + z2 / denominator);
  const margin = z * Math.sqrt((value * (1 - value) + z2 / (4 * denominator)) / denominator) / (1 + z2 / denominator);
  return deepFreeze({ numerator, denominator, value: rounded(value), wilson95: { lower: rounded(Math.max(0, center - margin)), upper: rounded(Math.min(1, center + margin)) } });
}
function delta(system: Ratio, manual: Ratio) { return system.value === null || manual.value === null ? null : rounded(system.value - manual.value); }
function perUsable(value: number, usable: number) { return usable === 0 ? null : rounded(value / usable); }
function exactValue(metric: Ratio) { return metric.denominator === 0 ? null : metric.numerator / metric.denominator; }
function atLeast(metric: Ratio, threshold: number) { const value = exactValue(metric); return value !== null && value >= threshold; }
function atMost(metric: Ratio, threshold: number) { const value = exactValue(metric); return value !== null && value <= threshold; }
function finiteAtMost(value: number | null, threshold: number) { return value !== null && Number.isFinite(value) && value <= threshold; }
function exactActiveMinutesAtMost(armValue: NormalizedArm, usable: number, threshold: number) {
  if (usable === 0) return false;
  const milliseconds = armValue.effort.reduce((sum, row) => sum + row.durationMilliseconds, 0);
  return Number.isSafeInteger(milliseconds) && milliseconds / (60_000 * usable) <= threshold;
}
function isRatio(value: unknown): value is Ratio { return Boolean(value && typeof value === "object" && "denominator" in value && "value" in value); }
function countEnum<const T extends string>(values: readonly T[], keys: readonly T[]) { return Object.fromEntries(keys.map((key) => [key, values.filter((value) => value === key).length])) as Record<T, number>; }
function rounded(value: number) { return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000; }
function exact(value: unknown, keys: readonly string[]): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) malformed(); const row = value as Record<string, unknown>; const actual = Object.keys(row).sort(), expected = [...keys].sort(); if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) malformed(); return row; }
function dense(value: unknown, max: number): unknown[] { if (!Array.isArray(value)) malformed(); if (value.length > max) invalid("evaluation_limit_exceeded"); if (Object.keys(value).length !== value.length) malformed(); return value; }
function enumValue<const T extends string>(value: unknown, values: readonly T[]): T { if (typeof value !== "string" || !values.includes(value as T)) malformed(); return value as T; }
function id(value: unknown) { if (typeof value !== "string" || !ID.test(value)) malformed(); return value; }
function text(value: unknown) { if (typeof value !== "string" || !(value = value.normalize("NFC").trim()) || value.length > 160) malformed(); return value as string; }
function instant(value: unknown) { if (typeof value !== "string" || !ISO.test(value)) invalid("evaluation_time_invalid"); const milliseconds = Date.parse(value); if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== value) invalid("evaluation_time_invalid"); return value; }
function positiveInteger(value: unknown) { if (!Number.isSafeInteger(value) || Number(value) <= 0) malformed(); return Number(value); }
function nonnegativeInteger(value: unknown) { if (!Number.isSafeInteger(value) || Number(value) < 0) invalid("evaluation_cost_invalid"); return Number(value); }
function unique(values: readonly string[]) { if (new Set(values).size !== values.length) malformed(); }
function byId(a: Readonly<{ id: string }>, b: Readonly<{ id: string }>) { return compareCodeUnits(a.id, b.id); }
function compareCodeUnits(a: string, b: string) { return a < b ? -1 : a > b ? 1 : 0; }
function malformed(): never { throw new InvalidEvaluation("evaluation_input_malformed"); }
function invalid(reason: ProspectQualityUnavailableReason): never { throw new InvalidEvaluation(reason); }
function uniqueSorted(values: readonly string[]) { return [...new Set(values)].sort(); }
function canonical(value: unknown): string { if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`; if (value && typeof value === "object") { const row = value as Record<string, unknown>; return `{${Object.keys(row).sort().map((key) => `${JSON.stringify(key)}:${canonical(row[key])}`).join(",")}}`; } return JSON.stringify(value); }
async function sha256(value: string) { const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)); return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join(""); }
function deepFreeze<T>(value: T): T { if (value && typeof value === "object" && !Object.isFrozen(value)) { for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child); Object.freeze(value); } return value; }
