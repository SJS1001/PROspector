import { llmProvider, type LlmProviderId, type LlmSearchMode } from "@/lib/domain/llm";
import { assertPublicHttps } from "@/lib/server/retrieve";
import { getSecret } from "@/lib/server/secrets";
import type { Sql } from "@/lib/db";

export type LlmConfig = {
  provider: LlmProviderId;
  model: string;
  baseUrl: string;
  apiKey: string;
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
  if (Array.isArray(content) && content[0]?.text) return content[0].text;
  return "";
}

export async function resolveLlmConfig(sql: Sql, userId: string): Promise<LlmConfig> {
  const providerId = ((await getSecret(sql, userId, "llm_provider")) || "xai") as LlmProviderId;
  const spec = llmProvider(providerId);
  const customBase = await getSecret(sql, userId, "llm_base_url");
  const model =
    (await getSecret(sql, userId, "llm_model")) || spec.defaultModel || "grok-4.5";
  const key =
    (await getSecret(sql, userId, "llm_key")) ||
    (await getSecret(sql, userId, "xai")) ||
    process.env.XAI_API_KEY ||
    "";
  let baseUrl = spec.baseUrl;
  if (spec.id === "custom") {
    if (!customBase) throw new Error("Set an HTTPS base URL for the custom provider.");
    const url = assertPublicHttps(customBase.replace(/\/+$/, ""));
    baseUrl = url.toString().replace(/\/+$/, "");
  }
  if (!key) throw new Error("Add an AI API key in Connections before running discovery or hunts.");
  return {
    provider: spec.id,
    model,
    baseUrl,
    apiKey: key,
    search: spec.search,
  };
}

async function postJson(url: string, headers: Record<string, string>, body: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    signal: AbortSignal.timeout(45_000),
    body: JSON.stringify(body),
  });
  const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const message =
      typeof json.error === "object" && json.error && "message" in json.error
        ? String((json.error as { message?: string }).message)
        : `Model request failed (${response.status}).`;
    throw new Error(message);
  }
  return json;
}

async function chatCompletions(config: LlmConfig, prompt: string, extra?: Record<string, unknown>) {
  if (config.provider === "anthropic") {
    const json = await postJson(
      `${config.baseUrl.replace(/\/+$/, "")}/v1/messages`,
      {
        "x-api-key": config.apiKey,
        "anthropic-version": "2023-06-01",
      },
      { model: config.model, max_tokens: extra?.max_tokens ?? 2200, messages: [{ role: "user", content: prompt }] },
    );
    return outputText(json);
  }
  const json = await postJson(
    `${config.baseUrl.replace(/\/+$/, "")}/chat/completions`,
    { Authorization: `Bearer ${config.apiKey}` },
    {
      model: config.model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: extra?.max_tokens ?? 2200,
      ...extra,
    },
  );
  return outputText(json);
}

export async function completeJson(sql: Sql, userId: string, prompt: string): Promise<string> {
  const config = await resolveLlmConfig(sql, userId);
  const searchNote =
    config.search === "none"
      ? "You have no live web search. Only propose HTTPS URLs you would bet already exist. Invented URLs will be dropped when retrieval fails."
      : "Use live web search. Every URL must be a real public HTTPS page.";
  const full = `${prompt}\n\n${searchNote}\nReturn JSON only.`;

  if (config.search === "xai") {
    try {
      const json = await postJson(
        `${config.baseUrl}/responses`,
        { Authorization: `Bearer ${config.apiKey}` },
        {
          model: config.model,
          input: [{ role: "user", content: full }],
          tools: [{ type: "web_search" }],
          max_output_tokens: 2200,
        },
      );
      const text = outputText(json);
      if (text) return text;
    } catch {
      // fall through to chat
    }
    return chatCompletions(config, full, {
      search_parameters: { mode: "on", return_citations: true, max_search_results: 8 },
    });
  }

  if (config.search === "openai") {
    try {
      const json = await postJson(
        `${config.baseUrl}/responses`,
        { Authorization: `Bearer ${config.apiKey}` },
        {
          model: config.model,
          input: [{ role: "user", content: full }],
          tools: [{ type: "web_search_preview" }],
        },
      );
      const text = outputText(json);
      if (text) return text;
    } catch {
      // fall through
    }
    return chatCompletions(config, full);
  }

  if (config.search === "openrouter") {
    try {
      return await chatCompletions(config, full, { plugins: [{ id: "web" }] });
    } catch {
      return chatCompletions(config, full);
    }
  }

  return chatCompletions(config, full);
}
