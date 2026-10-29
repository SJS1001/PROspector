/** Bounded live research; never downgrade a failed search to model memory. */
export async function anthropicSearch(
  config: { model: string; apiKey: string; workspaceId?: string },
  prompt: string,
  onSearch?: (count: number) => Promise<void>,
): Promise<string> {
  const messages: { role: string; content: unknown }[] = [{ role: "user", content: prompt }];
  let searches = 0;
  const signal = AbortSignal.timeout(180_000);
  for (let turn = 0; turn < 2; turn++) {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      redirect: "error",
      signal,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": config.apiKey,
        "anthropic-version": "2023-06-01",
        ...(config.workspaceId ? { "anthropic-workspace-id": config.workspaceId } : {}),
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: 7000,
        messages,
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }],
      }),
    });
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
    const body = await response.json();
    if (!Array.isArray(body.content))
      throw new Error("Anthropic returned an unreadable search response. Try again.");
    for (const block of body.content) {
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
    if (body.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: body.content });
      continue;
    }
    if (body.stop_reason !== "end_turn")
      throw new Error(
        "Anthropic stopped before finishing the search response. Try a smaller search batch.",
      );
    if (!searches)
      throw new Error(
        "Anthropic did not use live web search. No results were accepted. Try again.",
      );
    return body.content
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
