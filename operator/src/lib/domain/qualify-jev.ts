import type { ProspectOutcome } from "@/lib/domain/types";
import type { QualificationResult } from "./qualify.ts";

export type JevDimensionScore = { score: number; confidence: number };

export type JevQualifyJudgment = {
  model?: string;
  scores: Record<string, JevDimensionScore>;
  outcome: ProspectOutcome | null;
  outcomeConfidence: number;
  hardNo: number;
  operating: number;
  stuffed: number;
};

const OUTCOMES: ProspectOutcome[] = ["Passed", "NotQualified", "Disqualified", "InsufficientEvidence"];

export function asOutcome(value: string): ProspectOutcome | null {
  return OUTCOMES.includes(value as ProspectOutcome) ? (value as ProspectOutcome) : null;
}

export function mergeJevQualification(
  keyword: QualificationResult,
  jev: JevQualifyJudgment | null,
): QualificationResult {
  if (!jev) return keyword;

  const dimensions = keyword.assessment.dimensions.map((dim) => {
    const judged = jev.scores[dim.id];
    if (!judged || judged.confidence < 0.5) return dim;
    return {
      ...dim,
      score: judged.score,
      note: `Jev ${judged.score}/2 (confidence ${judged.confidence.toFixed(2)}). Keyword was ${dim.score}/2.`,
    };
  });
  const score = dimensions.reduce((sum, item) => sum + item.score, 0);
  const pain = dimensions.find((item) => item.id === "pain_strength")?.score ?? 0;
  const timing = dimensions.find((item) => item.id === "timing")?.score ?? 0;

  let outcome = keyword.outcome;
  let hard = keyword.assessment.hardDisqualifier;
  if (jev.hardNo >= 0.7) {
    outcome = "Disqualified";
    hard = hard ?? "Jev: page indicates do-not-contact or exploration-only.";
  } else if (keyword.outcome === "Disqualified" || keyword.outcome === "InsufficientEvidence") {
    outcome = keyword.outcome;
  } else if (jev.outcome && jev.outcomeConfidence >= 0.55) {
    outcome = jev.outcome;
  } else if (keyword.outcome === "Passed" && jev.outcome && jev.outcome !== "Passed") {
    outcome = "NotQualified";
  }
  if (outcome === "Passed" && (score < 7 || pain < 1 || timing < 1 || jev.operating < 0.45 || jev.stuffed >= 0.7)) {
    outcome = jev.stuffed >= 0.7 ? "InsufficientEvidence" : "NotQualified";
  }

  return {
    ...keyword,
    score,
    outcome,
    assessment: {
      ...keyword.assessment,
      hardDisqualifier: hard,
      dimensions,
    },
  };
}

// Count applied judgments separately from changes: agreeing with basic scoring
// can still contribute, while an ignored low-confidence answer cannot.
export function jevContribution(before: QualificationResult, after: QualificationResult, jev: JevQualifyJudgment) {
  const changed = after.outcome !== before.outcome || after.assessment.hardDisqualifier !== before.assessment.hardDisqualifier ||
    after.assessment.dimensions.some((dim, index) => dim.score !== before.assessment.dimensions[index].score);
  const eligibleOutcome = before.outcome !== "Disqualified" && before.outcome !== "InsufficientEvidence";
  const usedDecision = jev.hardNo >= 0.7 || (eligibleOutcome && Boolean(jev.outcome) &&
    (jev.outcomeConfidence >= 0.55 || (before.outcome === "Passed" && jev.outcome !== "Passed"))) || after.outcome === "Passed";
  const applied = changed || usedDecision || after.assessment.dimensions.some((dim, index) => dim !== before.assessment.dimensions[index]);
  return { changed, applied };
}
