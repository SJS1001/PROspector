export type LlmSearchMode = "xai" | "openai" | "anthropic" | "openrouter" | "builtin" | "none";

export type LlmProviderId =
  | "xai"
  | "openai"
  | "anthropic"
  | "openrouter"
  | "groq"
  | "together"
  | "perplexity"
  | "google"
  | "mistral"
  | "custom";

export type LlmProvider = {
  id: LlmProviderId;
  label: string;
  baseUrl: string;
  defaultModel: string;
  search: LlmSearchMode;
  hint: string;
};

export const LLM_PROVIDERS: LlmProvider[] = [
  {
    id: "xai",
    label: "xAI (Grok)",
    baseUrl: "https://api.x.ai/v1",
    defaultModel: "grok-4.5",
    search: "xai",
    hint: "Native web search. Best default for discovery and hunts.",
  },
  {
    id: "openai",
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4.1",
    search: "openai",
    hint: "Uses Responses + web search when the model allows it.",
  },
  {
    id: "anthropic",
    label: "Anthropic",
    baseUrl: "https://api.anthropic.com",
    defaultModel: "claude-sonnet-4-5",
    search: "anthropic",
    hint: "Live web search. Source pages are checked before results are saved.",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "openrouter/auto",
    search: "openrouter",
    hint: "Model ids look like openai/gpt-4. Apollo and other non-AI services are not included in OpenRouter.",
  },
  {
    id: "groq",
    label: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    defaultModel: "llama-3.3-70b-versatile",
    search: "none",
    hint: "OpenAI-compatible. Retrieval is the evidence gate.",
  },
  {
    id: "together",
    label: "Together",
    baseUrl: "https://api.together.xyz/v1",
    defaultModel: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    search: "none",
    hint: "OpenAI-compatible.",
  },
  {
    id: "perplexity",
    label: "Perplexity",
    baseUrl: "https://api.perplexity.ai",
    defaultModel: "sonar-pro",
    search: "builtin",
    hint: "Sonar models search the web themselves.",
  },
  {
    id: "google",
    label: "Google Gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    defaultModel: "gemini-2.5-pro",
    search: "none",
    hint: "OpenAI-compatible Gemini endpoint.",
  },
  {
    id: "mistral",
    label: "Mistral",
    baseUrl: "https://api.mistral.ai/v1",
    defaultModel: "mistral-large-latest",
    search: "none",
    hint: "OpenAI-compatible.",
  },
  {
    id: "custom",
    label: "Custom (OpenAI-compatible)",
    baseUrl: "",
    defaultModel: "",
    search: "none",
    hint: "HTTPS base URL ending in /v1. Private hosts are rejected.",
  },
];

export function llmProvider(id: string | null | undefined) {
  return LLM_PROVIDERS.find((item) => item.id === id) ?? LLM_PROVIDERS[0];
}

export function anthropicWorkspaceId(value: string): string {
  const id = value.trim();
  if (id && (!/^wrkspc_[A-Za-z0-9]+$/.test(id) || id.length > 128))
    throw new Error("Enter a valid Anthropic workspace ID starting with wrkspc_, or leave it blank for a workspace-scoped key.");
  return id;
}

/**
 * AI spend metering (owner decision 1, 2026-11-09).
 *
 * Every AI request is charged against the monthly cap. Prices are USD cents
 * per million tokens, plus a per-search and per-request fee where the provider
 * bills one. They are deliberately rounded-up ceilings for each provider's
 * default and larger models, not quotes: a model can cost less, and the cap
 * then trips early rather than late. Re-check them against the provider's
 * price page when a default model changes. "jev" is the TypeSafe Jev endpoint,
 * whose response carries no usage, so each request is charged a flat fee.
 */
export type SpendRateId = LlmProviderId | "jev";

export type SpendPrice = {
  inputPerMTok: number;
  outputPerMTok: number;
  perSearch?: number;
  perRequest?: number;
};

export const SPEND_PRICES: Record<SpendRateId, SpendPrice> = {
  xai: { inputPerMTok: 300, outputPerMTok: 1500, perSearch: 2.5 },
  openai: { inputPerMTok: 1000, outputPerMTok: 4000, perSearch: 3.5 },
  anthropic: { inputPerMTok: 1500, outputPerMTok: 7500, perSearch: 1 },
  openrouter: { inputPerMTok: 1500, outputPerMTok: 7500, perSearch: 2 },
  groq: { inputPerMTok: 100, outputPerMTok: 300 },
  together: { inputPerMTok: 100, outputPerMTok: 300 },
  perplexity: { inputPerMTok: 300, outputPerMTok: 1500, perRequest: 1.4 },
  google: { inputPerMTok: 250, outputPerMTok: 1500 },
  mistral: { inputPerMTok: 200, outputPerMTok: 600 },
  custom: { inputPerMTok: 1500, outputPerMTok: 7500 },
  jev: { inputPerMTok: 0, outputPerMTok: 0, perRequest: 1 },
};

export type SpendUsage = { inputTokens: number; outputTokens: number; searches?: number };

/** Whole cents for one request, rounded up so a small call is never free. */
export function spendCents(rate: SpendRateId, usage: SpendUsage) {
  const price = SPEND_PRICES[rate] ?? SPEND_PRICES.custom;
  const cents =
    (usage.inputTokens * price.inputPerMTok + usage.outputTokens * price.outputPerMTok) / 1_000_000 +
    (usage.searches ?? 0) * (price.perSearch ?? 0) +
    (price.perRequest ?? 0);
  return Math.max(0, Math.ceil(cents - 1e-9));
}

/** A conservative token count for request text: about three characters per token. */
export function estimateTokens(text: string) {
  return Math.ceil(text.length / 3);
}

function count(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

/**
 * Actual cents from a provider response's `usage`, or null when it has none.
 * Reads OpenRouter's reported `cost` (USD), Responses/Anthropic input/output
 * tokens, and chat-completions prompt/completion tokens. When the response does
 * not say how many searches ran, the searches the request allowed are charged.
 */
export function responseSpendCents(rate: SpendRateId, body: unknown, allowedSearches = 0): number | null {
  const usage = body && typeof body === "object" ? (body as { usage?: unknown }).usage : undefined;
  if (!usage || typeof usage !== "object") return null;
  const u = usage as Record<string, unknown>;
  const reportedCost = count(u.cost);
  if (reportedCost !== undefined) return Math.ceil(reportedCost * 100 - 1e-9);
  const input = count(u.input_tokens) ?? count(u.prompt_tokens);
  const output = count(u.output_tokens) ?? count(u.completion_tokens);
  if (input === undefined && output === undefined) return null;
  const cached = (count(u.cache_creation_input_tokens) ?? 0) + (count(u.cache_read_input_tokens) ?? 0);
  const tool = u.server_tool_use && typeof u.server_tool_use === "object" ? (u.server_tool_use as Record<string, unknown>) : {};
  const searches = count(tool.web_search_requests) ?? count(u.num_sources_used) ?? allowedSearches;
  return spendCents(rate, { inputTokens: (input ?? 0) + cached, outputTokens: output ?? 0, searches });
}

/** Largest monthly cap the Settings field accepts: USD 100,000. */
export const MAX_SPEND_CAP_CENTS = 10_000_000;

/**
 * The cap typed in Settings, in USD (for example "50" or "12.50"). Returns
 * cents, undefined for a blank field (keep the saved cap), or an error message.
 * 0 is valid: it turns AI off.
 */
export function parseSpendCapDollars(text: string): { cents?: number; error?: string } {
  const value = text.trim();
  if (!value) return {};
  if (!/^\d+(\.\d{1,2})?$/.test(value))
    return { error: "Enter the monthly AI spend cap as a dollar amount, such as 50 or 12.50. Enter 0 to turn AI off." };
  const cents = Math.round(Number(value) * 100);
  if (cents > MAX_SPEND_CAP_CENTS) return { error: "The monthly AI spend cap can be at most 100000 USD." };
  return { cents };
}

/** Server check for a cap sent by Settings: whole cents from 0 to the maximum. */
export function validSpendCapCents(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= MAX_SPEND_CAP_CENTS;
}

/** Companies per search typed in Settings: blank keeps the saved value. */
export function parseHuntBatch(text: string): { batch?: number; error?: string } {
  const value = text.trim();
  if (!value) return {};
  const batch = Number(value);
  if (!/^\d+$/.test(value) || batch < 4 || batch > 20) return { error: "Companies per search must be a whole number from 4 to 20." };
  return { batch };
}

export function spendDollars(cents: number) {
  return (cents / 100).toFixed(2);
}
