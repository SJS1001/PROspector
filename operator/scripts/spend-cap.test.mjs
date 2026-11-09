// Owner decision 1, 2026-11-09: every AI call counts against the monthly cap.
// Synthetic only: a real PGlite database with the operator migrations and a
// stubbed fetch. Nothing here reaches a provider.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { createServer } from "vite";

let serverPromise;
function modules() {
  serverPromise ??= createServer({
    configFile: false,
    optimizeDeps: { noDiscovery: true, include: [] },
    resolve: { alias: { "@": join(process.cwd(), "src") } },
    server: { middlewareMode: true, hmr: false },
    appType: "custom",
  });
  return serverPromise.then(async (server) => ({
    ...(await server.ssrLoadModule("/src/lib/server/llm.ts")),
    ...(await server.ssrLoadModule("/src/lib/server/secrets.ts")),
    ...(await server.ssrLoadModule("/src/lib/server/jev-tasks.ts")),
    ...(await server.ssrLoadModule("/src/lib/server/jev.ts")),
  }));
}

let pg;
async function database() {
  if (!pg) {
    pg = new PGlite();
    for (const name of readdirSync(new URL("../migrations/", import.meta.url))
      .filter((n) => n.endsWith(".sql"))
      .sort())
      await pg.exec(readFileSync(new URL(`../migrations/${name}`, import.meta.url), "utf8"));
  }
  await pg.exec("truncate operator_secrets, operating_state");
  const query = async (text, params = []) => (await pg.query(text, params)).rows;
  const sql = async (parts, ...values) => {
    let text = parts[0];
    for (let i = 0; i < values.length; i++) text += `$${i + 1}${parts[i + 1]}`;
    return query(text, values);
  };
  sql.query = query;
  return sql;
}
after(async () => {
  await pg?.close();
  if (serverPromise) await (await serverPromise).close();
});

const USER = "fictional";

async function workspace(sql, { secrets, cap, used = 0, month }) {
  const { currentSpendMonth } = await modules();
  for (const [name, value] of Object.entries(secrets))
    await sql`insert into operator_secrets (user_id, name, value) values (${USER}, ${name}, ${value})`;
  if (cap !== undefined)
    await sql`
      insert into operating_state (user_id, monthly_budget_cents, spend_month, spend_used_cents)
      values (${USER}, ${cap}, ${month ?? currentSpendMonth()}, ${used})
    `;
}

async function state(sql) {
  const [row] = await sql`select monthly_budget_cents, spend_month, spend_used_cents from operating_state where user_id = ${USER}`;
  return row;
}

const GROQ = { llm_provider: "groq", llm_key: "groq-fictional", llm_key_binding: "groq" };
const ANTHROPIC = { llm_provider: "anthropic", llm_key: "sk-ant-fictional", llm_key_binding: "anthropic" };
const OPENROUTER = { llm_provider: "openrouter", llm_key: "or-fictional", llm_key_binding: "openrouter", llm_model: "openai/gpt-4o" };
const CUSTOM = {
  llm_provider: "custom",
  llm_base_url: "https://fictional-proxy.example/v1",
  llm_key: "custom-fictional",
  llm_key_binding: "custom https://fictional-proxy.example",
  llm_model: "m",
};
const TYPESAFE = { llm_provider: "groq", jev: "typesafe-fictional" };

const jevPage = {
  accountName: "Fictional Works",
  targetName: "Fictional Plant",
  url: "https://fictional.example/page",
  title: "Fictional page",
  pageText: "Fictional operating plant.",
  profileText: "Fictional profile.",
};

function jevAnswers(body) {
  const { questions } = JSON.parse(body);
  return Object.fromEntries(
    Object.entries(questions).map(([id, q]) => [
      id,
      q.type === "score" ? { score: 1, confidence: 0.8 } : q.type === "choice" ? { choice: Object.keys(q.criteria)[0], confidence: 0.8 } : { noul: 0.1 },
    ]),
  );
}

/** Records every request; answers like the provider at that URL would, with the given usage. */
function stubFetch(t, usage) {
  const requests = [];
  t.mock.method(globalThis, "fetch", async (url, init) => {
    requests.push(String(url));
    const text = '{"ok":true}';
    if (String(url).includes("/systemone") || String(url).includes("/decisions"))
      return Response.json({ model: "jev-fictional", answers: jevAnswers(init.body), ...(usage === undefined ? {} : { usage }) });
    return Response.json({
      stop_reason: "end_turn",
      content: [{ type: "web_search_tool_result", content: [] }, { type: "text", text }],
      choices: [{ message: { content: text } }],
      output_text: text,
      ...(usage === undefined ? {} : { usage }),
    });
  });
  return requests;
}

/** Every metered entry point, each with the provider settings it needs. */
function aiCalls(m) {
  return [
    ["completeJson (groq chat)", GROQ, (sql) => m.completeJson(sql, USER, "fixture")],
    ["completeJson (custom provider, before its DNS check)", CUSTOM, (sql) => m.completeJson(sql, USER, "fixture")],
    ["completeJson (OpenRouter web search)", OPENROUTER, (sql) => m.completeJson(sql, USER, "fixture")],
    ["anthropicSearch via completeJson", ANTHROPIC, (sql) => m.completeJson(sql, USER, "fixture")],
    ["explainEvidence", ANTHROPIC, (sql) => m.explainEvidence(sql, USER, "fixture")],
    ["Jev qualification (TypeSafe)", TYPESAFE, async (sql) => m.jevQualifyPage({ ...(await m.resolveJev(sql, USER)), ...jevPage })],
    ["Jev qualification (OpenRouter)", OPENROUTER, async (sql) => m.jevQualifyPage({ ...(await m.resolveJev(sql, USER)), ...jevPage })],
    [
      "Jev inbox classification",
      TYPESAFE,
      async (sql) => m.jevClassifyInbox({ ...(await m.resolveJev(sql, USER)), from: "a@fictional.example", subject: "s", body: "b" }),
    ],
    [
      "Jev copy guard",
      TYPESAFE,
      async (sql) => m.jevGuardCopy({ ...(await m.resolveJev(sql, USER)), limitations: "l", promise: "p", body: "b" }),
    ],
  ];
}

test("a cap of 0 means no AI: every AI call is refused before any request leaves", async (t) => {
  const m = await modules();
  const requests = stubFetch(t, { prompt_tokens: 10, completion_tokens: 10 });
  for (const [label, secrets, call] of aiCalls(m)) {
    const sql = await database();
    await workspace(sql, { secrets, cap: 0 });
    await assert.rejects(call(sql), /AI is turned off because the monthly AI spend cap is 0 USD/, label);
    assert.equal((await state(sql)).spend_used_cents, 0, label);
  }
  assert.deepEqual(requests, []);
});

test("once used >= cap, every AI call is refused before any request leaves", async (t) => {
  const m = await modules();
  const requests = stubFetch(t, { prompt_tokens: 10, completion_tokens: 10 });
  for (const used of [500, 731]) {
    for (const [label, secrets, call] of aiCalls(m)) {
      const sql = await database();
      await workspace(sql, { secrets, cap: 500, used });
      await assert.rejects(call(sql), /spend cap is reached \(\d+\.\d\d of 5\.00 USD used\)/, label);
      assert.equal((await state(sql)).spend_used_cents, used, label);
    }
  }
  assert.deepEqual(requests, []);
});

test("every AI call under the cap is charged, and the call after the cap is reached is refused", async (t) => {
  const m = await modules();
  for (const [label, secrets, call] of aiCalls(m)) {
    if (label.includes("custom")) continue; // needs public DNS; refusal is covered above
    const requests = stubFetch(t, { prompt_tokens: 10, completion_tokens: 10 });
    const sql = await database();
    await workspace(sql, { secrets, cap: 1 });
    await call(sql);
    assert.equal(requests.length, 1, label);
    assert.ok((await state(sql)).spend_used_cents >= 1, label);
    await assert.rejects(call(sql), /spend cap is reached/, label);
    assert.equal(requests.length, 1, label);
    t.mock.restoreAll();
  }
});

test("actual cost comes from the provider's token usage and the price table", async (t) => {
  const m = await modules();
  // Anthropic: 100k input at 1500 c/MTok + 10k output at 7500 c/MTok = 150 + 75 cents.
  let sql = await database();
  await workspace(sql, { secrets: ANTHROPIC, cap: 5000 });
  stubFetch(t, { input_tokens: 100_000, output_tokens: 10_000 });
  await m.explainEvidence(sql, USER, "fixture");
  assert.equal((await state(sql)).spend_used_cents, 225);
  t.mock.restoreAll();

  // Anthropic search: tokens plus one cent per reported web search.
  sql = await database();
  await workspace(sql, { secrets: ANTHROPIC, cap: 5000 });
  stubFetch(t, { input_tokens: 1000, output_tokens: 1000, server_tool_use: { web_search_requests: 2 } });
  await m.completeJson(sql, USER, "fixture");
  assert.equal((await state(sql)).spend_used_cents, 9 + 2);
  t.mock.restoreAll();

  // OpenRouter reports its own cost in USD; it is rounded up to whole cents.
  sql = await database();
  await workspace(sql, { secrets: OPENROUTER, cap: 5000 });
  stubFetch(t, { cost: 0.0123, prompt_tokens: 1, completion_tokens: 1 });
  await m.completeJson(sql, USER, "fixture");
  assert.equal((await state(sql)).spend_used_cents, 2);
  t.mock.restoreAll();

  // TypeSafe Jev reports no usage: the flat per-request price is charged.
  sql = await database();
  await workspace(sql, { secrets: TYPESAFE, cap: 5000 });
  stubFetch(t, undefined);
  await m.jevQualifyPage({ ...(await m.resolveJev(sql, USER)), ...jevPage });
  assert.equal((await state(sql)).spend_used_cents, 1);
});

test("a response without usage keeps the conservative estimate; a refused request is not charged", async (t) => {
  const m = await modules();
  let sql = await database();
  await workspace(sql, { secrets: GROQ, cap: 5000 });
  stubFetch(t, undefined);
  await m.completeJson(sql, USER, "fixture");
  const charged = (await state(sql)).spend_used_cents;
  // Groq: the 2200-token output limit alone is 0.66 cents, rounded up to 1.
  assert.ok(charged >= 1);
  t.mock.restoreAll();

  sql = await database();
  await workspace(sql, { secrets: GROQ, cap: 5000, used: 40 });
  t.mock.method(globalThis, "fetch", async () => Response.json({ error: { message: "Fictional overload" } }, { status: 503 }));
  await assert.rejects(m.completeJson(sql, USER, "fixture"), /Fictional overload/);
  assert.equal((await state(sql)).spend_used_cents, 40);
});

test("the used count restarts each calendar month", async (t) => {
  const m = await modules();
  const sql = await database();
  await workspace(sql, { secrets: ANTHROPIC, cap: 500, used: 9999, month: "2000-01" });
  stubFetch(t, { input_tokens: 100_000, output_tokens: 10_000 });
  await m.explainEvidence(sql, USER, "fixture");
  assert.deepEqual(await state(sql), { monthly_budget_cents: 500, spend_month: m.currentSpendMonth(), spend_used_cents: 225 });
  const flags = await m.connectionFlags(sql, USER);
  assert.equal(flags.spendUsedCents, 225);
  assert.equal(flags.monthlyBudgetCents, 500);
  assert.equal(m.currentSpendMonth(new Date("2026-11-01T03:00:00Z")), "2026-10", "Toronto time decides the month");
});

test("a workspace with no operating state gets the default cap, not unlimited AI", async (t) => {
  const m = await modules();
  const sql = await database();
  await workspace(sql, { secrets: GROQ });
  stubFetch(t, { prompt_tokens: 10, completion_tokens: 10 });
  await m.completeJson(sql, USER, "fixture");
  const row = await state(sql);
  assert.equal(row.monthly_budget_cents, 5000);
  assert.equal(row.spend_used_cents, 1);
});

test("calls made at the same moment cannot all slip under the cap", async (t) => {
  const m = await modules();
  const sql = await database();
  await workspace(sql, { secrets: GROQ, cap: 1 });
  const requests = stubFetch(t, { prompt_tokens: 10, completion_tokens: 10 });
  const results = await Promise.allSettled(Array.from({ length: 6 }, () => m.completeJson(sql, USER, "fixture")));
  assert.equal(requests.length, 1, "only the call that reserved the last cent may reach the provider");
  assert.equal(results.filter((r) => r.status === "rejected").length, 5);
  assert.ok((await state(sql)).spend_used_cents >= 1);
});
