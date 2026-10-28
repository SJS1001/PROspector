export type JevQuestion =
  | { type: "noul"; instructions: string; criteria?: Record<string, string> }
  | { type: "choice"; instructions: string; criteria: Record<string, string | null> }
  | { type: "score"; instructions: string; criteria: Record<string, string> };

export type JevAnswer = {
  choice?: string;
  noul?: number;
  score?: number;
  confidence?: number;
  probabilities?: Record<string, number>;
};

export type JevResponse = {
  answers?: Record<string, JevAnswer>;
};

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
  const response = await fetch(`${base}/systemone`, {
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
  const json = (await response.json().catch(() => ({}))) as JevResponse & { error?: unknown; message?: string };
  if (!response.ok) {
    const message =
      typeof json.message === "string"
        ? json.message
        : typeof json.error === "string"
          ? json.error
          : `Jev ${response.status}`;
    throw new Error(message);
  }
  return json;
}
