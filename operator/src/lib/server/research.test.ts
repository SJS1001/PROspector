import assert from "node:assert/strict";
import test from "node:test";
import { buildResearchPrompt, parseResearchAnswer } from "./research.ts";

const prior = { evidence: "old evidence", inference: "old inference", recommendation: "old recommendation" };

test("the research prompt names the question and confirmed answers, and asks for the three labels", () => {
  const prompt = buildResearchPrompt("Which product do you want to sell?", [
    { question: "What is your company?", confirmed_answer: "Digitalrain" },
  ]);
  assert.match(prompt, /Which product do you want to sell\?/);
  assert.match(prompt, /What is your company\? => Digitalrain/);
  assert.match(prompt, /"evidence"/);
  assert.match(prompt, /Do not invent customers or emails/);
  assert.match(buildResearchPrompt("Q?", []), /Already confirmed: none/);
});

test("a provider answer with JSON replaces the labels, trimmed to their limits", () => {
  const text = `Here you go:\n${JSON.stringify({ evidence: "e".repeat(900), inference: "i", recommendation: "r".repeat(500) })}`;
  const result = parseResearchAnswer(text, prior);
  assert.equal(result.evidence.length, 800);
  assert.equal(result.inference, "i");
  assert.equal(result.recommendation.length, 400);
});

test("missing, empty or malformed answers keep the prior labels", () => {
  assert.deepEqual(parseResearchAnswer("no json here", prior), prior);
  assert.deepEqual(parseResearchAnswer("{not json}", prior), prior);
  assert.deepEqual(parseResearchAnswer(JSON.stringify({ evidence: "" }), prior), prior);
  assert.deepEqual(parseResearchAnswer(JSON.stringify({ evidence: 42 }), prior), prior);
});

test("completeJson with a provider that has no bound key rejects without sending XAI_API_KEY anywhere", async (t) => {
  const { join } = await import("node:path");
  const { createServer } = await import("vite");
  const server = await createServer({
    configFile: false,
    resolve: { alias: { "@": join(process.cwd(), "src") } },
    server: { middlewareMode: true },
    appType: "custom",
  });
  t.after(() => server.close());
  const { completeJson, resolveLlmConfig } = await server.ssrLoadModule("/src/lib/server/llm.ts");
  const prior = process.env.XAI_API_KEY;
  process.env.XAI_API_KEY = "env-xai-fictional";
  t.after(() => {
    if (prior === undefined) delete process.env.XAI_API_KEY;
    else process.env.XAI_API_KEY = prior;
  });
  const calls: string[] = [];
  t.mock.method(globalThis, "fetch", async (url: string) => {
    calls.push(String(url));
    return new Response(JSON.stringify({ choices: [{ message: { content: "{}" } }] }));
  });
  const store = (saved: Record<string, string>) => async (parts: TemplateStringsArray, ...values: string[]) => {
    const query = parts.join("?").trim();
    if (query.startsWith("select value")) return saved[values[1]] ? [{ value: saved[values[1]] }] : [];
    // Spend metering (scripts/spend-cap.test.mjs covers it): a default row, always under the cap.
    if (query.includes("from operating_state")) return [{ monthly_budget_cents: 5000, spend_month: "", spend_used_cents: 0 }];
    if (query.startsWith("insert into operating_state")) return [];
    if (query.startsWith("update operating_state")) return [{ spend_used_cents: 0 }];
    throw new Error(`Unexpected SQL: ${query}`);
  };
  const unbound: Record<string, string>[] = [
    { llm_provider: "groq" },
    { llm_provider: "anthropic", llm_key: "sk-ant-fictional", llm_key_binding: "groq" },
    { llm_provider: "custom", llm_base_url: "https://my-proxy.example/v1", llm_model: "m" },
  ];
  for (const saved of unbound) {
    await assert.rejects(completeJson(store(saved), "fictional", "Which product?"), /Paste an API key for/);
  }
  assert.deepEqual(calls, []);
  // With a key bound to groq, the only request goes to groq.
  const bound = store({ llm_provider: "groq", llm_key: "groq-fictional", llm_key_binding: "groq" });
  assert.equal((await resolveLlmConfig(bound, "fictional")).apiKey, "groq-fictional");
  await completeJson(bound, "fictional", "Which product?");
  assert.deepEqual(calls.map((url) => new URL(url).origin), ["https://api.groq.com"]);
});
