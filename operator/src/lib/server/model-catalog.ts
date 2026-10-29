import { llmProvider, type LlmProviderId } from "@/lib/domain/llm";
import type { LlmConfig } from "@/lib/server/llm";

export type ModelOption = { id: string; name: string; created: number };

export function modelOptions(body: unknown): ModelOption[] {
  const rows = Array.isArray(body) ? body : (body as { data?: unknown } | null)?.data;
  if (!Array.isArray(rows)) throw new Error("The provider returned an unreadable model list. Try Refresh.");
  const models = new Map<string, ModelOption>();
  for (const row of rows) {
    if (!row || typeof row.id !== "string" || !row.id.trim() || row.id.length > 250) continue;
    if (row.lifecycle === "retired" || row.active === false) continue;
    // Exclude dedicated non-chat models where the provider identifies them.
    if (row.type && !["model", "chat", "language"].includes(row.type)) continue;
    if (row.capabilities?.completion_chat === false) continue;
    if (Array.isArray(row.architecture?.output_modalities) && !row.architecture.output_modalities.includes("text")) continue;
    if (/(?:embed|whisper|tts|transcrib|moderation|dall-e|image|realtime|audio|sora|rerank)/i.test(row.id)) continue;
    const date = typeof row.created === "number" ? row.created : Date.parse(row.created_at) / 1000;
    const label = row.display_name || row.name || row.id;
    models.set(row.id, {
      id: row.id,
      name: typeof label === "string" ? label.slice(0, 250) : row.id,
      created: Number.isFinite(date) ? date : 0,
    });
  }
  return [...models.values()].sort((a, b) => b.created - a.created || a.name.localeCompare(b.name));
}

export async function fetchModelCatalog(config: LlmConfig): Promise<{ provider: LlmProviderId; models: ModelOption[] }> {
  if (config.provider === "custom" || config.provider === "perplexity")
    throw new Error("Automatic model lists are not supported for this provider. Use Advanced to enter a model ID.");
  // Only fixed provider URLs receive the saved credential. Never follow redirects.
  const base = llmProvider(config.provider).baseUrl;
  const url = new URL(`${base}${config.provider === "anthropic" ? "/v1" : ""}/models`);
  const headers: Record<string, string> = config.provider === "anthropic"
    ? { "x-api-key": config.apiKey, "anthropic-version": "2023-06-01", ...(config.workspaceId ? { "anthropic-workspace-id": config.workspaceId } : {}) }
    : { Authorization: `Bearer ${config.apiKey}` };
  if (config.provider === "anthropic") url.searchParams.set("limit", "1000");
  const signal = AbortSignal.timeout(15_000);
  const models: ModelOption[] = [];
  const cursors = new Set<string>();
  for (let page = 0; page < 10; page++) {
    let response: Response;
    try { response = await fetch(url, { headers, signal, redirect: "error" }); }
    catch { throw new Error("Could not reach the model list. Try Refresh in a moment."); }
    if (!response.ok) {
      if ([401, 403].includes(response.status)) throw new Error("Could not load models. Check your saved API key and workspace ID, then save and retry.");
      if (response.status === 429) throw new Error("The provider is busy. Try Refresh in a moment.");
      throw new Error(`Could not load models (${response.status}). Check your connection settings or use Advanced.`);
    }
    const body = await response.json().catch(() => null);
    models.push(...modelOptions(body));
    if (!body?.has_more) {
      const unique = [...new Map(models.map((model) => [model.id, model])).values()];
      unique.sort((a, b) => b.created - a.created || a.name.localeCompare(b.name));
      if (!unique.length) throw new Error("No chat models were returned. Try Refresh or use Advanced.");
      return { provider: config.provider, models: unique };
    }
    if (config.provider !== "anthropic" || typeof body.last_id !== "string" || cursors.has(body.last_id)) break;
    cursors.add(body.last_id);
    url.searchParams.set("after_id", body.last_id);
  }
  throw new Error("The full model list could not be loaded. Try Refresh or use Advanced.");
}
