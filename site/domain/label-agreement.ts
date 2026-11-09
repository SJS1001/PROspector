// Pure, offline scorer for issue #7 label provenance.
// Jev (the decision model) drafts relevance labels; the owner's labels are the
// independent ground truth. This module measures Jev-vs-owner agreement and
// says whether Jev may draft more labels under spot checks. It performs no
// I/O, calls no provider, and can never promote a Jev label to ground truth.

export const LABEL_AGREEMENT_SCHEMA = "label-agreement/v1" as const;
export const OWNER_LABELING_SHEET_COLUMNS = [
  "target_id", "stratum", "organization_name", "source_reference", "claim_summary",
  "owner_relevance_label", "owner_reason", "owner_evidence_label", "owner_organization_match",
  "owner_blinded_to_jev_draft", "owner_reviewer_id", "labelled_at",
] as const;

type OwnerLabel = "relevant" | "irrelevant" | "unknown";
type JevLabel = "relevant" | "irrelevant" | "uncertain";

export type LabelAgreementThresholds = Readonly<{
  minAdjudicated: number;
  minPerStratum: number;
  minAgreement: number;
  minAgreementWilsonLower: number;
  minKappa: number;
  maxFalseRelevantRate: number;
  spotCheck: Readonly<{ minFraction: number; minBatch: number; revokeBelowAgreement: number }>;
}>;

export type LabelAgreementInput = Readonly<{
  schema: typeof LABEL_AGREEMENT_SCHEMA;
  datasetKind: "synthetic" | "owner_sample";
  protocolId: string;
  strata: readonly string[];
  thresholds: LabelAgreementThresholds;
  targets: readonly Readonly<{
    id: string;
    stratum: string;
    producedByJevPipeline: boolean;
    owner: Readonly<{ label: OwnerLabel; blindedToJevDraft: boolean }>;
    jev: Readonly<{ label: JevLabel; reason: string }>;
  }>[];
}>;

// Protocol v1 thresholds, pinned in code. Callers cannot loosen them: any input
// whose thresholds differ from this constant is rejected (fail closed).
export const LABEL_AGREEMENT_V1_THRESHOLDS: LabelAgreementThresholds = Object.freeze({
  minAdjudicated: 25,
  minPerStratum: 3,
  minAgreement: 0.85,
  minAgreementWilsonLower: 0.7,
  minKappa: 0.6,
  maxFalseRelevantRate: 0.15,
  spotCheck: Object.freeze({ minFraction: 0.2, minBatch: 10, revokeBelowAgreement: 0.8 }),
});

const OWNER: readonly string[] = ["relevant", "irrelevant", "unknown"];
const JEV: readonly string[] = ["relevant", "irrelevant", "uncertain"];

function fail(message: string): never { throw new Error(`label-agreement: ${message}`); }

function ratio(numerator: number, denominator: number) {
  if (denominator === 0) return { numerator, denominator, value: null, wilson95: null };
  const z = 1.96;
  const p = numerator / denominator;
  const d = 1 + (z * z) / denominator;
  const centre = (p + (z * z) / (2 * denominator)) / d;
  const margin = (z * Math.sqrt((p * (1 - p)) / denominator + (z * z) / (4 * denominator * denominator))) / d;
  return { numerator, denominator, value: p, wilson95: { lower: Math.max(0, centre - margin), upper: Math.min(1, centre + margin) } };
}

function validateThresholds(th: LabelAgreementThresholds | undefined) {
  if (!th || typeof th !== "object" || !th.spotCheck || typeof th.spotCheck !== "object") fail("thresholds missing");
  const flat: Record<string, unknown> = { ...th, ...Object.fromEntries(Object.entries(th.spotCheck).map(([k, v]) => [`spotCheck.${k}`, v])) };
  delete flat.spotCheck;
  const pinned = LABEL_AGREEMENT_V1_THRESHOLDS as unknown as Record<string, unknown>;
  const pinnedFlat: Record<string, unknown> = { ...pinned, ...Object.fromEntries(Object.entries(LABEL_AGREEMENT_V1_THRESHOLDS.spotCheck).map(([k, v]) => [`spotCheck.${k}`, v])) };
  delete pinnedFlat.spotCheck;
  for (const key of Object.keys(pinnedFlat)) {
    const v = flat[key];
    if (typeof v !== "number" || !Number.isFinite(v)) fail(`threshold ${key} must be a finite number`);
    if (v !== pinnedFlat[key]) fail(`threshold ${key} differs from the pinned protocol v1 value; thresholds cannot be changed per run`);
  }
  if (Object.keys(flat).length !== Object.keys(pinnedFlat).length) fail("unknown threshold keys");
}

function validate(input: LabelAgreementInput) {
  if (input.schema !== LABEL_AGREEMENT_SCHEMA) fail("unsupported schema");
  if (input.datasetKind !== "synthetic" && input.datasetKind !== "owner_sample") fail("unknown datasetKind");
  validateThresholds(input.thresholds);
  if (!Array.isArray(input.targets) || input.targets.length === 0) fail("no targets");
  const seen = new Set<string>();
  for (const t of input.targets) {
    if (!t.id || seen.has(t.id)) fail(`missing or duplicate target id ${t.id}`);
    seen.add(t.id);
    if (!input.strata.includes(t.stratum)) fail(`target ${t.id} has undeclared stratum`);
    if (!OWNER.includes(t.owner?.label)) fail(`target ${t.id} has no valid owner label`);
    if (typeof t.producedByJevPipeline !== "boolean") fail(`target ${t.id} producedByJevPipeline must be a boolean`);
    if (t.owner.blindedToJevDraft !== true) fail(`target ${t.id} owner label was not blinded to the Jev draft`);
    if (!JEV.includes(t.jev?.label)) fail(`target ${t.id} has no valid Jev draft label`);
    if (typeof t.jev.reason !== "string" || t.jev.reason.trim() === "") fail(`target ${t.id} Jev draft has no reason`);
  }
}

export function scoreLabelAgreement(input: LabelAgreementInput) {
  validate(input);
  const th = LABEL_AGREEMENT_V1_THRESHOLDS;
  const excludedSelfLabelled = input.targets.filter((t) => t.producedByJevPipeline).length;
  const eligible = input.targets.filter((t) => !t.producedByJevPipeline);
  const adjudicated = eligible.filter((t) => t.owner.label !== "unknown");
  const ownerUnresolved = eligible.length - adjudicated.length;

  const agree = adjudicated.filter((t) => t.jev.label === t.owner.label);
  const ownerIrrelevant = adjudicated.filter((t) => t.owner.label === "irrelevant");
  const ownerRelevant = adjudicated.filter((t) => t.owner.label === "relevant");
  const falseRelevant = ownerIrrelevant.filter((t) => t.jev.label === "relevant");
  const falseIrrelevant = ownerRelevant.filter((t) => t.jev.label === "irrelevant");
  const abstained = adjudicated.filter((t) => t.jev.label === "uncertain");

  // Cohen's kappa: Jev "uncertain" is a third outcome that never matches the owner.
  const n = adjudicated.length;
  let kappa: number | null = null;
  if (n > 0) {
    const po = agree.length / n;
    let pe = 0;
    for (const label of ["relevant", "irrelevant"]) {
      pe += (adjudicated.filter((t) => t.owner.label === label).length / n)
        * (adjudicated.filter((t) => t.jev.label === label).length / n);
    }
    kappa = pe === 1 ? null : (po - pe) / (1 - pe);
  }

  const byStratum = input.strata.map((stratum) => {
    const rows = adjudicated.filter((t) => t.stratum === stratum);
    return { stratum, agreement: ratio(rows.filter((t) => t.jev.label === t.owner.label).length, rows.length) };
  });

  const agreement = ratio(agree.length, n);
  const falseRelevantRate = ratio(falseRelevant.length, ownerIrrelevant.length);
  const reasons: string[] = [];
  if (n < th.minAdjudicated) reasons.push(`adjudicated sample ${n} < ${th.minAdjudicated}`);
  for (const s of byStratum) {
    if (s.agreement.denominator < th.minPerStratum) reasons.push(`stratum ${s.stratum} has ${s.agreement.denominator} < ${th.minPerStratum}`);
  }
  if (agreement.value === null || agreement.value < th.minAgreement) reasons.push("agreement below threshold");
  if (agreement.wilson95 === null || agreement.wilson95.lower < th.minAgreementWilsonLower) reasons.push("agreement Wilson lower bound below threshold");
  if (kappa === null || kappa < th.minKappa) reasons.push("kappa below threshold or unavailable");
  if (falseRelevantRate.value === null || falseRelevantRate.value > th.maxFalseRelevantRate) reasons.push("false-relevant rate above threshold or unavailable");

  const cleared = reasons.length === 0;
  return {
    schema: LABEL_AGREEMENT_SCHEMA,
    evidenceClass: input.datasetKind === "synthetic" ? "synthetic_only" : "owner_sample",
    operationalAcceptance: false,
    thresholds: th,
    // Jev rows are drafts under every outcome; only owner labels are ground truth.
    jevLabelsAreGroundTruth: false,
    sample: { targets: input.targets.length, eligible: eligible.length, adjudicated: n, ownerUnresolved, excludedSelfLabelled },
    agreement,
    kappa,
    falseRelevantRate,
    falseIrrelevantRate: ratio(falseIrrelevant.length, ownerRelevant.length),
    abstainRate: ratio(abstained.length, n),
    byStratum,
    decision: cleared
      ? { status: "jev_may_draft_more_with_spot_checks" as const, spotCheck: th.spotCheck, reasons }
      : { status: "owner_labels_only" as const, reasons },
  };
}

// After clearance, each batch of Jev drafts needs an owner spot check.
// Invalid batches are rejected, never treated as renewed permission.
export function assessSpotCheck(
  thresholds: LabelAgreementThresholds,
  batch: Readonly<{
    draftedCount: number;
    checked: readonly Readonly<{ id: string; ownerLabel: OwnerLabel; jevLabel: JevLabel; blindedToJevDraft: boolean; producedByJevPipeline: boolean }>[];
  }>,
) {
  validateThresholds(thresholds);
  const sc = LABEL_AGREEMENT_V1_THRESHOLDS.spotCheck;
  if (!Number.isInteger(batch.draftedCount) || batch.draftedCount <= 0) fail("draftedCount must be a positive integer");
  if (!Array.isArray(batch.checked)) fail("checked must be an array");
  if (batch.checked.length > batch.draftedCount) fail("checked rows exceed drafted batch size");
  const seen = new Set<string>();
  for (const r of batch.checked) {
    if (!r.id || seen.has(r.id)) fail(`spot check missing or duplicate id ${r.id}`);
    seen.add(r.id);
    if (!OWNER.includes(r.ownerLabel)) fail(`spot check ${r.id} has no valid owner label`);
    if (!JEV.includes(r.jevLabel)) fail(`spot check ${r.id} has no valid Jev label`);
    if (r.blindedToJevDraft !== true) fail(`spot check ${r.id} owner label was not blinded to the Jev draft`);
    if (typeof r.producedByJevPipeline !== "boolean") fail(`spot check ${r.id} producedByJevPipeline must be a boolean`);
    if (r.producedByJevPipeline) fail(`spot check ${r.id} is a Jev pipeline output and cannot be checked as truth`);
  }
  const adjudicated = batch.checked.filter((r) => r.ownerLabel !== "unknown");
  const fraction = batch.checked.length / batch.draftedCount;
  const agreement = ratio(adjudicated.filter((r) => r.jevLabel === r.ownerLabel).length, adjudicated.length);
  if (fraction < sc.minFraction || adjudicated.length < sc.minBatch) return { status: "insufficient_spot_check" as const, fraction, agreement };
  if (agreement.value === null || agreement.value < sc.revokeBelowAgreement) return { status: "revoked" as const, fraction, agreement };
  return { status: "retained" as const, fraction, agreement };
}
