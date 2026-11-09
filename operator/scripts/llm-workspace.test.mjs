import test, { after } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { createServer } from "vite";

let serverPromise;
function modules() {
  serverPromise ??= createServer({
    configFile: false,
    resolve: { alias: { "@": join(process.cwd(), "src") } },
    server: { middlewareMode: true },
    appType: "custom",
  });
  return serverPromise.then(async (server) => ({
    ...(await server.ssrLoadModule("/src/lib/server/llm.ts")),
    ...(await server.ssrLoadModule("/src/lib/server/secrets.ts")),
    ...(await server.ssrLoadModule("/src/lib/domain/llm.ts")),
  }));
}
after(async () => {
  if (serverPromise) await (await serverPromise).close();
});

/** In-memory operator_secrets table; values are stored as plain fixture text. */
function secretStore(saved) {
  return async (parts, ...values) => {
    const query = parts.join("?").trim();
    if (query.startsWith("insert into operator_secrets")) {
      saved[values[1]] = values[2];
      return [];
    }
    if (query.startsWith("delete from operator_secrets")) {
      delete saved[values[1]];
      return [];
    }
    if (query.startsWith("select value")) return saved[values[1]] ? [{ value: saved[values[1]] }] : [];
    if (query.startsWith("select name")) return Object.entries(saved).map(([name, value]) => ({ name, value }));
    if (query.includes("from operating_state")) return [];
    throw new Error(`Unexpected SQL: ${query}`);
  };
}

const okBody = {
  stop_reason: "end_turn",
  output_text: '{"ok":true}',
  content: [{ type: "web_search_tool_result", content: [] }, { type: "text", text: '{"ok":true}' }],
  choices: [{ message: { content: '{"ok":true}' } }],
};

/** Records every fetch; `respond` returns a Response or throws. */
function stubFetch(t, respond = () => new Response(JSON.stringify(okBody), { status: 200 })) {
  const requests = [];
  t.mock.method(globalThis, "fetch", async (url, init) => {
    requests.push({ url: String(url), ...init, json: init?.body ? JSON.parse(init.body) : undefined });
    return respond(requests.length);
  });
  return requests;
}

function withoutEnvXai(t, value) {
  const prior = process.env.XAI_API_KEY;
  if (value === undefined) delete process.env.XAI_API_KEY;
  else process.env.XAI_API_KEY = value;
  t.after(() => {
    if (prior === undefined) delete process.env.XAI_API_KEY;
    else process.env.XAI_API_KEY = prior;
  });
}

test("Anthropic workspace selection is validated, saved, projected, and sent only to Anthropic", async (t) => {
  const { completeJson, putSecret, connectionFlags, anthropicWorkspaceId } = await modules();
  const saved = { llm_provider: "anthropic", llm_key: "fictional-key", llm_key_binding: "anthropic" };
  const sql = secretStore(saved);
  let fail = false;
  const requests = stubFetch(t, () =>
    new Response(
      JSON.stringify(
        fail
          ? { error: { message: "This API key is not scoped to a workspace; include the anthropic-workspace-id header" } }
          : okBody,
      ),
      { status: fail ? 400 : 200 },
    ),
  );
  assert.equal(anthropicWorkspaceId(" wrkspc_example123 "), "wrkspc_example123");
  assert.throws(() => anthropicWorkspaceId("wrkspc_bad\r\nheader"), /valid Anthropic workspace/);
  assert.throws(() => anthropicWorkspaceId("not-a-workspace"), /valid Anthropic workspace/);
  await putSecret(sql, "fictional", "llm_workspace_id", anthropicWorkspaceId(" wrkspc_example123 "));
  assert.equal((await connectionFlags(sql, "fictional")).llmWorkspaceId, "wrkspc_example123");
  assert.equal(await completeJson(sql, "fictional", "fixture"), '{"ok":true}');
  assert.equal(new URL(requests.at(-1).url).origin, "https://api.anthropic.com");
  assert.equal(requests.at(-1).headers["anthropic-workspace-id"], "wrkspc_example123");
  assert.equal(requests.at(-1).headers["x-api-key"], "fictional-key");
  await putSecret(sql, "fictional", "llm_workspace_id", "");
  assert.equal((await connectionFlags(sql, "fictional")).llmWorkspaceId, "");
  await completeJson(sql, "fictional", "fixture");
  assert.equal(requests.at(-1).headers["anthropic-workspace-id"], undefined);
  fail = true;
  await assert.rejects(completeJson(sql, "fictional", "fixture"), /Open Settings.*workspace ID/);
  for (const request of requests) assert.equal(new URL(request.url).origin, "https://api.anthropic.com");
});

test("a key saved for Anthropic is never sent after switching to groq, custom or OpenRouter without a new key", async (t) => {
  const { completeJson, putSecret, connectionFlags } = await modules();
  withoutEnvXai(t, undefined);
  const requests = stubFetch(t);
  for (const [provider, baseUrl, model] of [
    ["groq", "", ""],
    ["custom", "https://my-proxy.example/v1", "proxy-model"],
    ["openrouter", "", "openai/gpt-4"],
    ["xai", "", ""],
  ]) {
    // Row-level switch (no save path): the key is still stored but bound to Anthropic.
    const raw = { llm_provider: provider, llm_key: "sk-ant-fictional", llm_key_binding: "anthropic", xai: "sk-ant-fictional" };
    if (baseUrl) raw.llm_base_url = baseUrl;
    if (model) raw.llm_model = model;
    await assert.rejects(completeJson(secretStore(raw), "fictional", "fixture"), /Paste an API key for/, provider);
    assert.equal((await connectionFlags(secretStore(raw), "fictional")).llm, false, `${provider} badge is not Connected`);
    // Save-path switch: writing the provider clears the stale key.
    const viaSave = { llm_provider: "anthropic", llm_key: "sk-ant-fictional", llm_key_binding: "anthropic" };
    const sql = secretStore(viaSave);
    if (baseUrl) await putSecret(sql, "fictional", "llm_base_url", baseUrl);
    await putSecret(sql, "fictional", "llm_provider", provider);
    assert.equal(viaSave.llm_key, undefined, `${provider} switch clears the Anthropic key`);
    assert.equal(viaSave.llm_key_binding, undefined);
    await assert.rejects(completeJson(sql, "fictional", "fixture"), /Paste an API key for/, provider);
    assert.equal((await connectionFlags(sql, "fictional")).llm, false);
  }
  assert.equal(requests.length, 0, "no request was sent to any provider");
});

test("a bound groq key goes only to groq with a bearer header and no Anthropic headers", async (t) => {
  const { completeJson } = await modules();
  const requests = stubFetch(t);
  const sql = secretStore({ llm_provider: "groq", llm_key: "groq-fictional", llm_key_binding: "groq", llm_workspace_id: "wrkspc_example123" });
  await completeJson(sql, "fictional", "fixture");
  assert.equal(requests.length, 1);
  assert.equal(new URL(requests[0].url).origin, "https://api.groq.com");
  assert.equal(requests[0].headers.Authorization, "Bearer groq-fictional");
  assert.equal(requests[0].headers["x-api-key"], undefined);
  assert.equal(requests[0].headers["anthropic-workspace-id"], undefined);
  assert.equal(requests[0].redirect, "error", "provider redirects are refused");
});

test("XAI_API_KEY in the environment is not sent to a custom or non-xAI provider", async (t) => {
  const { completeJson, connectionFlags } = await modules();
  withoutEnvXai(t, "env-xai-fictional");
  const requests = stubFetch(t);
  for (const saved of [
    { llm_provider: "custom", llm_base_url: "https://my-proxy.example/v1", llm_model: "proxy-model" },
    { llm_provider: "groq" },
    { llm_provider: "openrouter", llm_model: "openai/gpt-4" },
  ]) {
    await assert.rejects(completeJson(secretStore(saved), "fictional", "fixture"), /Paste an API key for/);
    assert.equal((await connectionFlags(secretStore(saved), "fictional")).llm, false);
  }
  assert.equal(requests.length, 0);
  // The environment key is an xAI key, so xAI alone may use it.
  assert.equal((await connectionFlags(secretStore({ llm_provider: "xai" }), "fictional")).llm, true);
  await completeJson(secretStore({ llm_provider: "xai" }), "fictional", "fixture");
  assert.deepEqual(requests.map((request) => [new URL(request.url).origin, request.headers.Authorization]), [["https://api.x.ai", "Bearer env-xai-fictional"]]);
});

test("a custom base URL that is private or resolves to a private address is refused before any request", async (t) => {
  const { completeJson } = await modules();
  const requests = stubFetch(t);
  for (const base of ["https://[::1]/v1", "https://[::ffff:127.0.0.1]/v1", "https://[fd00::1]/v1", "https://localhost./v1"]) {
    const sql = secretStore({ llm_provider: "custom", llm_base_url: base, llm_model: "m", llm_key: "custom-fictional", llm_key_binding: `custom ${new URL(base).origin}` });
    await assert.rejects(completeJson(sql, "fictional", "fixture"), /Private/, base);
  }
  assert.equal(requests.length, 0);
});

for (const [provider, model] of [["openai", "gpt-4.1"], ["openrouter", "openai/gpt-4"]]) {
  test(`${provider} search failures surface after one request instead of a silent search-free retry`, async (t) => {
    const { completeJson } = await modules();
    const sql = () => secretStore({ llm_provider: provider, llm_model: model, llm_key: `${provider}-fictional`, llm_key_binding: provider });
    for (const [label, respond, pattern] of [
      ["timeout", () => { throw new DOMException("The operation was aborted due to timeout", "TimeoutError"); }, /timeout/i],
      ["429", () => new Response(JSON.stringify({ error: { message: "Rate limit exceeded" } }), { status: 429 }), /Rate limit/],
      ["500", () => new Response("{}", { status: 500 }), /\(500\)/],
      ["401", () => new Response(JSON.stringify({ error: { message: "Invalid API key" } }), { status: 401 }), /Invalid API key/],
      ["unrelated 400", () => new Response(JSON.stringify({ error: { message: "max_tokens is too large" } }), { status: 400 }), /max_tokens/],
    ]) {
      const requests = stubFetch(t, respond);
      await assert.rejects(completeJson(sql(), "fictional", "fixture"), pattern, label);
      assert.equal(requests.length, 1, `${label}: exactly one request`);
      t.mock.restoreAll();
    }
  });

  test(`${provider} falls back once, without the live-search wording, only when web search is unsupported`, async (t) => {
    const { completeJsonWithMeta } = await modules();
    const sql = secretStore({ llm_provider: provider, llm_model: model, llm_key: `${provider}-fictional`, llm_key_binding: provider });
    const unsupported =
      provider === "openai" ? "Tool 'web_search_preview' is not supported with this model." : "The web plugin is not supported for this model.";
    const requests = stubFetch(t, (count) =>
      count === 1
        ? new Response(JSON.stringify({ error: { message: unsupported } }), { status: 400 })
        : new Response(JSON.stringify(okBody), { status: 200 }),
    );
    const result = await completeJsonWithMeta(sql, "fictional", "fixture");
    assert.deepEqual(result, { text: '{"ok":true}', searchDowngraded: true });
    assert.equal(requests.length, 2);
    const fallbackPrompt = requests[1].json.messages[0].content;
    assert.doesNotMatch(fallbackPrompt, /Use live web search/);
    assert.match(fallbackPrompt, /You have no live web search/);
    assert.equal(requests[1].json.plugins, undefined);
    assert.equal(requests[1].json.tools, undefined);
    for (const request of requests) assert.equal(request.redirect, "error");
  });
}
