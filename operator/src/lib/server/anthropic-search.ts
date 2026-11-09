import { estimateTokens } from "@/lib/domain/llm";
import type { SpendMeter } from "@/lib/server/secrets";

const MAX_TOKENS = 7000;
const MAX_SEARCHES = 5;

/** Bounded live research; never downgrade a failed search to model memory. Every turn is metered. */
export async function anthropicSearch(
  config: { model: string; apiKey: string; workspaceId?: string },
  prompt: string,
  spend: SpendMeter,
  onSearch?: (count: number) => Promise<void>,
): Promise<string> {
  const messages: { role: string; content: unknown }[] = [{ role: "user", content: prompt }];
  let searches = 0;
  const signal = AbortSignal.timeout(180_000);
  for (let turn = 0; turn < 2; turn++) {
    const body = JSON.stringify({
      model: config.model,
      max_tokens: MAX_TOKENS,
      messages,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: MAX_SEARCHES }],
    });
    const response = await spend(
      { rate: "anthropic", inputTokens: estimateTokens(body), outputTokens: MAX_TOKENS, searches: MAX_SEARCHES },
      () =>
        fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          redirect: "error",
          signal,
          headers: {
            "Content-Type": "application/json",
            "x-api-key": config.apiKey,
            "anthropic-version": "2023-06-01",
            ...(config.workspaceId ? { "anthropic-workspace-id": config.workspaceId } : {}),
          },
          body,
        }),
    );
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      if (
        typeof error.error?.message === "string" &&
        error.error.message.includes("anthropic-workspace-id")
      )
        throw new Error(
          "Your Anthropic key needs a workspace ID. Open Settings → Connections & search settings → AI model, add your Anthropic workspace ID, then save and try again.",
        );
      throw new Error(
        `Anthropic search failed (${response.status}). Check your AI connection and web-search access, then try again.`,
      );
    }
    const reply = await response.json();
    if (!Array.isArray(reply.content))
      throw new Error("Anthropic returned an unreadable search response. Try again.");
    for (const block of reply.content) {
      if (block.type === "web_search_tool_result") {
        if (!Array.isArray(block.content))
          throw new Error(
            `Anthropic web search could not finish (${String(
              block.content?.error_code ?? "tool error",
            )
              .replace(/[^a-z_]/g, "")
              .slice(0, 60)}). Try again later.`,
          );
        searches++;
      }
    }
    await onSearch?.(searches);
    if (reply.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: reply.content });
      continue;
    }
    if (reply.stop_reason !== "end_turn")
      throw new Error(
        "Anthropic stopped before finishing the search response. Try a smaller search batch.",
      );
    if (!searches)
      throw new Error(
        "Anthropic did not use live web search. No results were accepted. Try again.",
      );
    return reply.content
      .filter(
        (block: { type: string; text?: string }) =>
          block.type === "text" && typeof block.text === "string",
      )
      .map((block: { text: string }) => block.text)
      .join("\n");
  }
  throw new Error(
    "Anthropic needed more time than this search allows. Try a smaller search batch.",
  );
}
