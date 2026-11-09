import { anthropicSearch } from "./anthropic-search";
import { anthropicWorkspaceId, estimateTokens, llmProvider, type LlmProviderId, type LlmSearchMode } from "@/lib/domain/llm";
import { assertOpenRouterModelId, openRouterChatRequest } from "@/lib/domain/openrouter-policy";
import { assertPublicHttps, resolvePublic } from "@/lib/server/retrieve";
import { assertAiSpendAllowed, boundLlmKey, getSecret, spendMeter, type SpendCharge, type SpendMeter } from "@/lib/server/secrets";
import type { Sql } from "@/lib/db";

export type LlmConfig = {
  provider: LlmProviderId;
  model: string;
  baseUrl: string;
  apiKey: string;
  workspaceId?: string;
  search: LlmSearchMode;
};

function outputText(body: Record<string, unknown>) {
  if (typeof body.output_text === "string") return body.output_text;
  const output = Array.isArray(body.output) ? body.output : [];
  const chunks: string[] = [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const row = item as { content?: unknown };
    if (!Array.isArray(row.content)) continue;
    for (const part of row.content) {
      if (part && typeof part === "object" && "text" in part && typeof part.text === "string") {
        chunks.push(part.text);
      }
    }
  }
  if (chunks.length) return chunks.join("\n");
  const choices = body.choices as { message?: { content?: string } }[] | undefined;
  if (choices?.[0]?.message?.content) return choices[0].message.content;
  const content = body.content as { text?: string }[] | undefined;
  if (Array.isArray(content)) return content.filter((part) => typeof part.text === "string").map((part) => part.text).join("\n");
  return "";
}

export async function resolveLlmConfig(sql: Sql, userId: string): Promise<LlmConfig> {
  const providerId = ((await getSecret(sql, userId, "llm_provider")) || "xai") as LlmProviderId;
  const spec = llmProvider(providerId);
  const customBase = await getSecret(sql, userId, "llm_base_url");
  const storedModel = (await getSecret(sql, userId, "llm_model")) || spec.defaultModel || "grok-4.5";
  const model = spec.id === "openrouter" ? assertOpenRouterModelId(storedModel) : storedModel;
  let baseUrl = spec.baseUrl;
  let customHost = "";
  if (spec.id === "custom") {
    if (!customBase) throw new Error("Set an HTTPS base URL for the custom provider.");
    const url = assertPublicHttps(customBase.replace(/\/+$/, ""));
    baseUrl = url.toString().replace(/\/+$/, "");
    customHost = url.hostname;
  }
  // A stored key is sent only to the provider (and custom origin) it was saved for.
  const key = await boundLlmKey(sql, userId, spec.id, customBase);
  if (!key) throw new Error(`Paste an API key for ${spec.label} in Settings → Connections → AI model before running discovery or hunts.`);
  // Re-checked before every custom request: DNS answers can point at private hosts.
  if (customHost) await resolvePublic(customHost);
  return {
    provider: spec.id,
    model,
    baseUrl,
    apiKey: key,
    workspaceId: spec.id === "anthropic" ? anthropicWorkspaceId(await getSecret(sql, userId, "llm_workspace_id")) : undefined,
    search: spec.search,
  };
}

/** A provider HTTP error, with the status kept so search fallbacks can be narrow. */
export class LlmRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "LlmRequestError";
  }
}

/** Output tokens assumed for a request that sets no output limit. */
const UNBOUNDED_OUTPUT_TOKENS = 8_000;

/** The most one request body can cost: its size, its output limit and the searches it allows. */
function chargeFor(config: LlmConfig, body: Record<string, unknown>, searches = 0): SpendCharge {
  const limit = [body.max_tokens, body.max_output_tokens].find((value) => typeof value === "number");
  return {
    rate: config.provider,
    inputTokens: estimateTokens(JSON.stringify(body)),
    outputTokens: typeof limit === "number" ? limit : UNBOUNDED_OUTPUT_TOKENS,
    searches,
  };
}

async function postJson(
  spend: SpendMeter,
  config: LlmConfig,
  url: string,
  headers: Record<string, string>,
  body: Record<string, unknown>,
  searches = 0,
) {
  const response = await spend(chargeFor(config, body, searches), () =>
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      // A provider redirect could carry the key to another host; refuse it.
      redirect: "error",
      signal: AbortSignal.timeout(45_000),
      body: JSON.stringify(body),
    }),
  );
  const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const message =
      typeof json.error === "object" && json.error && "message" in json.error
        ? String((json.error as { message?: string }).message)
        : `Model request failed (${response.status}).`;
    if (url.startsWith("https://api.anthropic.com/") && message.includes("anthropic-workspace-id"))
      throw new LlmRequestError("Your Anthropic key needs a workspace ID. Open Settings → Connections & search settings → AI model, add your Anthropic workspace ID, then save and try again.", response.status);
    throw new LlmRequestError(message, response.status);
  }
  return json;
}

async function chatCompletions(
  config: LlmConfig,
  spend: SpendMeter,
  prompt: string,
  extra?: Record<string, unknown>,
  searches = 0,
) {
  if (config.provider === "openrouter") {
    const request = openRouterChatRequest({
      apiKey: config.apiKey,
      model: config.model,
      messages: [{ role: "user", content: prompt }],
      maxTokens: typeof extra?.max_tokens === "number" ? extra.max_tokens : undefined,
    });
    const json = await postJson(spend, config, request.url, request.headers, { ...request.body, ...extra }, searches);
    return outputText(json);
  }
  if (config.provider === "anthropic") {
    const json = await postJson(
      spend,
      config,
      `${config.baseUrl.replace(/\/+$/, "")}/v1/messages`,
      {
        "x-api-key": config.apiKey,
        "anthropic-version": "2023-06-01",
        ...(config.workspaceId ? { "anthropic-workspace-id": config.workspaceId } : {}),
      },
      { model: config.model, max_tokens: extra?.max_tokens ?? 2200, messages: [{ role: "user", content: prompt }] },
    );
    return outputText(json);
  }
  const json = await postJson(
    spend,
    config,
    `${config.baseUrl.replace(/\/+$/, "")}/chat/completions`,
    { Authorization: `Bearer ${config.apiKey}` },
    {
      model: config.model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: extra?.max_tokens ?? 2200,
      ...extra,
    },
    searches,
  );
  return outputText(json);
}

const SEARCH_NOTE = "Use live web search. Every URL must be a real public HTTPS page.";
const NO_SEARCH_NOTE =
  "You have no live web search. Only propose HTTPS URLs you would bet already exist. Invented URLs will be dropped when retrieval fails.";

/**
 * True only when the provider said the web-search tool, plugin or endpoint is
 * not supported (a 400/404/422 whose message names the tool and says so).
 * Timeouts, auth errors, 429 and 5xx never qualify: they are surfaced.
 */
export function isSearchUnsupported(error: unknown) {
  if (!(error instanceof LlmRequestError)) return false;
  if (![400, 404, 422].includes(error.status)) return false;
  return /\b(?:web[_ ]?search(?:_preview)?|tools?|plugins?|search_parameters|live search|responses api)\b[^\n]{0,80}?\b(?:not supported|unsupported|not available|not enabled)\b|\b(?:unsupported|unknown|unrecognized) (?:tool|plugin)\b/i.test(
    error.message,
  );
}

export type CompleteJsonResult = {
  text: string;
  /** True when web search was unsupported and the answer came from a search-free request. */
  searchDowngraded: boolean;
};

export async function completeJsonWithMeta(
  sql: Sql,
  userId: string,
  prompt: string,
  onSearch?: (count: number) => Promise<void>,
): Promise<CompleteJsonResult> {
  // Refuse before anything leaves, including the custom-host DNS check.
  await assertAiSpendAllowed(sql, userId);
  const spend = spendMeter(sql, userId);
  const config = await resolveLlmConfig(sql, userId);
  const full = `${prompt}\n\n${config.search === "none" ? NO_SEARCH_NOTE : SEARCH_NOTE}\nReturn JSON only.`;
  const noSearch = `${prompt}\n\n${NO_SEARCH_NOTE}\nReturn JSON only.`;
  const searched = (text: string) => ({ text, searchDowngraded: false });
  const downgraded = async () => ({ text: await chatCompletions(config, spend, noSearch), searchDowngraded: true });

  if (config.search === "anthropic") return searched(await anthropicSearch(config, full, spend, onSearch));

  if (config.search === "xai") {
    try {
      const json = await postJson(
        spend,
        config,
        `${config.baseUrl}/responses`,
        { Authorization: `Bearer ${config.apiKey}` },
        {
          model: config.model,
          input: [{ role: "user", content: full }],
          tools: [{ type: "web_search" }],
          max_output_tokens: 2200,
        },
        5,
      );
      return searched(outputText(json));
    } catch (error) {
      if (!isSearchUnsupported(error)) throw error;
    }
    // xAI's chat endpoint still searches through search_parameters, so the search wording stays.
    return searched(
      await chatCompletions(
        config,
        spend,
        full,
        { search_parameters: { mode: "on", return_citations: true, max_search_results: 8 } },
        8,
      ),
    );
  }

  if (config.search === "openai") {
    try {
      const json = await postJson(
        spend,
        config,
        `${config.baseUrl}/responses`,
        { Authorization: `Bearer ${config.apiKey}` },
        {
          model: config.model,
          input: [{ role: "user", content: full }],
          tools: [{ type: "web_search_preview" }],
        },
        1,
      );
      return searched(outputText(json));
    } catch (error) {
      if (!isSearchUnsupported(error)) throw error;
    }
    return downgraded();
  }

  if (config.search === "openrouter") {
    try {
      return searched(await chatCompletions(config, spend, full, { plugins: [{ id: "web" }] }, 5));
    } catch (error) {
      if (!isSearchUnsupported(error)) throw error;
    }
    return downgraded();
  }

  return searched(await chatCompletions(config, spend, full));
}

export async function completeJson(sql: Sql, userId: string, prompt: string, onSearch?: (count: number) => Promise<void>): Promise<string> {
  return (await completeJsonWithMeta(sql, userId, prompt, onSearch)).text;
}

/** Grounded explanation of already-retrieved evidence; does not start another web search. */
export async function explainEvidence(sql: Sql, userId: string, prompt: string) {
  await assertAiSpendAllowed(sql, userId);
  return chatCompletions(await resolveLlmConfig(sql, userId), spendMeter(sql, userId), prompt);
}
