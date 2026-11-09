export type ResearchLabels = { evidence: string; inference: string; recommendation: string };

/** Prompt for the research-first interview helper. The provider comes from Settings. */
export function buildResearchPrompt(
  question: string,
  priors: readonly { question: string; confirmed_answer: string | null }[],
) {
  return `Research-first Consensus Interview helper. Return JSON {"evidence":"","inference":"","recommendation":""}.
Question: ${question}
Already confirmed: ${priors.map((row) => `${row.question} => ${row.confirmed_answer}`).join(" | ") || "none"}
Keep recommendation short. Do not invent customers or emails.`;
}

/** Reads the provider's answer. Anything missing or malformed keeps the prior labels. */
export function parseResearchAnswer(text: string, prior: ResearchLabels): ResearchLabels {
  const json = text.match(/\{[\s\S]*\}/)?.[0];
  if (!json) return prior;
  let parsed: Partial<Record<keyof ResearchLabels, unknown>>;
  try {
    parsed = JSON.parse(json);
  } catch {
    return prior;
  }
  const pick = (value: unknown, limit: number, fallback: string) =>
    typeof value === "string" && value.trim() ? value.slice(0, limit) : fallback;
  return {
    evidence: pick(parsed.evidence, 800, prior.evidence),
    inference: pick(parsed.inference, 800, prior.inference),
    recommendation: pick(parsed.recommendation, 400, prior.recommendation),
  };
}
