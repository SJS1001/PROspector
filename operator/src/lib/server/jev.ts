export type JevQuestion =
  | { type: "noul"; instructions: string; criteria?: Record<string, string> }
  | { type: "choice"; instructions: string; criteria: Record<string, string | null> }
  | { type: "score"; instructions: string; criteria: string[] };

export type JevAnswer = {
  choice?: string;
  noul?: number;
  score?: number;
  confidence?: number;
  probabilities?: Record<string, number>;
};

export type JevResponse = {
  model?: string;
  answers?: Record<string, JevAnswer>;
};

export class JevError extends Error {}

export function jevFailureMessage(error: unknown) {
  return error instanceof JevError
    ? error.message
    : "JEV could not be reached. Try the connection test in Settings.";
}

function validNumber(value: unknown, max = 1): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= max;
}

export function validateJevResponse(
  value: unknown,
  questions: Record<string, JevQuestion>,
): JevResponse {
  const result = value as JevResponse | null;
  if (
    !result ||
    typeof result !== "object" ||
    !result.answers ||
    typeof result.answers !== "object"
  ) {
    throw new JevError("JEV returned an incomplete response. Basic scoring was kept.");
  }
  for (const [id, question] of Object.entries(questions)) {
    const answer = result.answers[id];
    const valid =
      answer &&
      (question.type === "noul"
        ? validNumber(answer.noul)
        : validNumber(answer.confidence) &&
          (question.type === "score"
            ? validNumber(answer.score, question.criteria.length - 1)
            : typeof answer.choice === "string" &&
              Object.hasOwn(question.criteria, answer.choice)));
    if (!valid) throw new JevError("JEV returned an incomplete response. Basic scoring was kept.");
  }
  if (
    result.model !== undefined &&
    (typeof result.model !== "string" || result.model.length > 120)
  ) {
    throw new JevError("JEV returned an invalid model name.");
  }
  return result;
}

const DEFAULT_BASE = "https://api.typesafe.ai/v1";

function roundScore(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(2, Math.round(value)));
}

export function parseNoul(answer: JevAnswer | undefined) {
  if (!answer) return 0;
  if (typeof answer.noul === "number") return answer.noul;
  if (typeof answer.score === "number") return answer.score;
  if (answer.choice === "true") return answer.probabilities?.true ?? 1;
  if (answer.choice === "false") return answer.probabilities?.true ?? 0;
  return 0;
}

export function parseChoice(answer: JevAnswer | undefined) {
  return answer?.choice?.trim() || "";
}

export function parseScore(answer: JevAnswer | undefined) {
  if (!answer) return { score: 0, confidence: 0 };
  const confidence = typeof answer.confidence === "number" ? answer.confidence : 0.5;
  if (typeof answer.score === "number") return { score: roundScore(answer.score), confidence };
  if (answer.choice && /^\d+$/.test(answer.choice)) {
    return { score: roundScore(Number(answer.choice)), confidence };
  }
  const probs = answer.probabilities ?? {};
  let best = 0;
  let mass = 0;
  for (const [key, value] of Object.entries(probs)) {
    const n = Number(key);
    if (!Number.isFinite(n) || !Number.isFinite(value)) continue;
    best += n * value;
    mass += value;
  }
  return { score: roundScore(mass ? best / mass : 0), confidence };
}

export async function jevDecide(opts: {
  apiKey: string;
  baseUrl?: string;
  state: unknown;
  questions: Record<string, JevQuestion>;
  model?: string;
}): Promise<JevResponse> {
  const base = (opts.baseUrl || DEFAULT_BASE).replace(/\/+$/, "");
  let response: Response;
  try {
    response = await fetch(`${base}/systemone`, {
      method: "POST",
      signal: AbortSignal.timeout(12_000),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${opts.apiKey}`,
      },
      body: JSON.stringify({
        model: opts.model || "jev-latest",
        state: opts.state,
        questions: opts.questions,
      }),
    });
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new JevError("JEV timed out. Try again from Settings.");
    }
    throw new JevError("JEV could not be reached. Check the connection URL in Settings.");
  }
  if (!response.ok) {
    const reason =
      response.status === 401 || response.status === 403
        ? "JEV rejected the saved key. Check your TypeSafe key and account access."
        : response.status === 429
          ? "JEV is rate limited or out of credits. Check your TypeSafe account."
          : response.status === 400 || response.status === 422
            ? "JEV rejected the scoring request."
            : `JEV is unavailable (HTTP ${response.status}). Try again later.`;
    throw new JevError(reason);
  }
  return validateJevResponse(await response.json().catch(() => null), opts.questions);
}
