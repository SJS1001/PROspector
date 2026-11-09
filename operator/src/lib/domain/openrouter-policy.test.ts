import assert from "node:assert/strict";
import test from "node:test";

import { searchApolloPeople } from "../server/apollo.ts";
import { runApolloPeopleSearch } from "../server/non-ai-dispatch.ts";
import {
  decideNonAiDispatch,
  isOpenRouterModelId,
  jevCredentialPlan,
  OPENROUTER_CHAT_COMPLETIONS_URL,
  OPENROUTER_DECISIONS_URL,
  OPENROUTER_EXCLUSION_COPY,
  openRouterChatRequest,
  openRouterJevDecisionRequest,
  llmKeyBinding,
  planConnectionWrites,
  selectBoundLlmKey,
  showsNonAiCredentials,
  staleLlmKeySecrets,
} from "./openrouter-policy.ts";

/** Applies planned writes the way saveConnections + putSecret do, including the stale-key clear. */
function applyWrites(state: Record<string, string>, writes: { name: string; value: string }[]) {
  const next = { ...state };
  for (const write of writes) {
    if (write.value.trim()) next[write.name] = write.value.trim();
    else delete next[write.name];
    if (write.name === "llm_provider" || write.name === "llm_base_url") {
      for (const name of staleLlmKeySecrets(next)) delete next[name];
    }
  }
  return next;
}

function usableKey(state: Record<string, string>, env = "") {
  return selectBoundLlmKey({
    providerId: state.llm_provider || "xai",
    baseUrl: state.llm_base_url,
    llmKey: state.llm_key,
    binding: state.llm_key_binding,
    xaiSecret: state.xai,
    envXaiKey: env,
  });
}

test("OpenRouter model ids follow the documented author/slug form", () => {
  for (const model of ["openai/gpt-4", "openai/gpt-4:free", "openai/gpt-5.2:nitro:exacto", "~openai/gpt-latest", "openrouter/auto"]) {
    assert.equal(isOpenRouterModelId(model), true, model);
  }
  for (const model of ["", "gpt-4", "apollo", "https://openrouter.ai/api/v1", "openai/", "openai/gpt 4"]) {
    assert.equal(isOpenRouterModelId(model), false, model);
  }
});

test("OpenRouter chat transport uses the official endpoint, bearer key, and selected model", () => {
  const request = openRouterChatRequest({
    apiKey: " sk-or-fictional ",
    model: " openai/gpt-4 ",
    messages: [{ role: "user", content: "synthetic" }],
  });
  assert.equal(request.url, OPENROUTER_CHAT_COMPLETIONS_URL);
  assert.equal(request.method, "POST");
  assert.equal(request.headers.Authorization, "Bearer sk-or-fictional");
  assert.equal(request.body.model, "openai/gpt-4");
  assert.deepEqual(Object.keys(request.headers).sort(), ["Authorization", "Content-Type"]);
  assert.equal("apollo" in request.body, false);
});

test("OpenRouter selection blocks Apollo without reading a stored key or sending the request", async () => {
  assert.equal(showsNonAiCredentials("openrouter"), false);
  assert.equal(showsNonAiCredentials("xai"), true);
  assert.match(OPENROUTER_EXCLUSION_COPY, /not included in OpenRouter/);
  const decision = decideNonAiDispatch("openrouter", "apollo");
  assert.equal(decision.dispatch, false);
  assert.equal(decision.loadStoredSecret, false);
  const reads: string[] = [];
  let fetched = false;
  const original = globalThis.fetch;
  globalThis.fetch = (() => {
    fetched = true;
    throw new Error("network");
  }) as typeof fetch;
  try {
    const result = await runApolloPeopleSearch(async (name) => {
      reads.push(name);
      if (name === "apollo") throw new Error("stored Apollo key must not be read");
      return name === "llm_provider" ? "openrouter" : "";
    }, { accountName: "Fictional Quarry", domain: "example.invalid", titles: ["operator"] });
    assert.equal(result.dispatched, false);
    assert.equal(result.blocked, true);
    assert.deepEqual(result.hits, []);
    assert.deepEqual(reads, ["llm_provider"]);
    assert.equal(fetched, false);
    await assert.rejects(
      () => searchApolloPeople({ key: "stored-apollo-key", accountName: "Fictional", domain: "example.invalid", titles: [], modelProvider: "openrouter" }),
      /not included in OpenRouter/,
    );
    assert.equal(fetched, false);
  } finally {
    globalThis.fetch = original;
  }
});

test("OpenRouter Jev uses the Decisions API and never the chat transport", () => {
  const request = openRouterJevDecisionRequest({
    apiKey: " sk-or-fictional ",
    state: { page: "synthetic operating plant" },
    questions: { operating: { type: "noul", instructions: "Is it operating?" } },
  });
  assert.equal(request.url, OPENROUTER_DECISIONS_URL);
  assert.equal(request.url.includes("chat/completions"), false);
  assert.equal(request.headers.Authorization, "Bearer sk-or-fictional");
  assert.equal(request.body.model, "typesafe/jev-1.14");
  const operating = request.body.questions.operating as { type: string };
  assert.equal(operating.type, "noul");
  assert.throws(() => openRouterJevDecisionRequest({ apiKey: "sk-or-fictional", model: "typesafe/jev-router", state: "", questions: {} }), /not the Jev decision model/);
  assert.throws(() => openRouterChatRequest({ apiKey: "sk-or-fictional", model: "typesafe/jev-1.14", messages: [{ role: "user", content: "decide" }] }), /chat completions/);
  assert.deepEqual(jevCredentialPlan("openrouter"), {
    transport: "openrouter",
    secrets: ["llm_key"],
    envFallback: false,
    model: "typesafe/jev-1.14",
  });
  const direct = jevCredentialPlan("xai");
  assert.equal(direct.transport, "typesafe");
  assert.equal(direct.envFallback, true);
  assert.deepEqual(direct.secrets, ["jev", "jev_base_url"]);
});

test("an existing provider still plans Apollo persistence and an Apollo dispatch", () => {
  const writes = planConnectionWrites({
    llmProvider: "openai",
    llmKey: "sk-openai-fictional",
    llmModel: "gpt-4.1",
    apollo: "apollo-fictional-key",
  });
  // The OpenAI key is no longer copied into the xAI secret row.
  assert.deepEqual(writes.map((write) => write.name), ["llm_provider", "llm_model", "apollo", "llm_key", "llm_key_binding"]);
  assert.equal(writes.find((write) => write.name === "llm_key_binding")?.value, "openai");
  assert.equal(decideNonAiDispatch("openai", "apollo").dispatch, true);
  assert.equal(decideNonAiDispatch("xai", "zoominfo").loadStoredSecret, true);
});

test("OpenRouter persistence keeps only its own key and model and does not erase other secrets", () => {
  const writes = planConnectionWrites({
    llmProvider: "openrouter",
    llmKey: " sk-or-fictional ",
    llmModel: "openai/gpt-4",
    xai: "should-not-replace-xai",
    apollo: "should-not-write-apollo",
    zoominfo: "should-not-write-zoominfo",
    jev: "should-not-write-jev",
    gmailUser: "owner@example.invalid",
    gmailPass: "should-not-write-gmail",
  });
  assert.deepEqual(writes, [
    { name: "llm_model", value: "openai/gpt-4" },
    { name: "llm_provider", value: "openrouter" },
    { name: "llm_key", value: "sk-or-fictional" },
    { name: "llm_key_binding", value: "openrouter" },
  ]);
  const unchanged = planConnectionWrites({ llmProvider: "openrouter", llmKey: "", apollo: "apollo-fictional-key" });
  assert.deepEqual(unchanged, [{ name: "llm_provider", value: "openrouter" }]);
  assert.throws(() => planConnectionWrites({ llmProvider: "openrouter", llmModel: "apollo" }), /openai\/gpt-4/);
});

test("a saved key is bound to its provider and, for custom, to the base-URL origin", () => {
  assert.equal(llmKeyBinding("anthropic"), "anthropic");
  assert.equal(llmKeyBinding("custom", "https://Proxy.Example/v1/"), "custom https://proxy.example");
  assert.equal(llmKeyBinding("custom", ""), "");
  assert.equal(llmKeyBinding("custom", "not a url"), "");
  assert.throws(() => planConnectionWrites({ llmProvider: "custom", llmKey: "sk-fictional" }), /base URL/);
  assert.throws(() => planConnectionWrites({ llmKey: "sk-fictional" }), /provider/);
});

test("an empty-key switch to another provider leaves no key usable for the new provider", () => {
  const anthropic = applyWrites({}, planConnectionWrites({ llmProvider: "anthropic", llmKey: "sk-ant-fictional", xai: "sk-ant-fictional" }));
  assert.equal(anthropic.xai, undefined, "a non-xAI key is never copied into the xAI row");
  assert.equal(usableKey(anthropic), "sk-ant-fictional");
  for (const [provider, baseUrl] of [["groq", ""], ["openrouter", ""], ["custom", "https://my-proxy.example/v1"], ["xai", ""]]) {
    const switched = applyWrites(anthropic, planConnectionWrites({ llmProvider: provider, llmBaseUrl: baseUrl, llmKey: "" }));
    assert.equal(usableKey(switched, "env-xai-fictional") === "sk-ant-fictional", false, `${provider} must not receive the Anthropic key`);
    assert.equal(switched.llm_key, undefined, `${provider} switch clears the old key`);
  }
  // xai -> openrouter must not hand the xAI key to OpenRouter.
  const xai = applyWrites({}, planConnectionWrites({ llmProvider: "xai", llmKey: "xai-fictional", xai: "xai-fictional" }));
  assert.equal(usableKey(xai), "xai-fictional");
  const openrouter = applyWrites(xai, planConnectionWrites({ llmProvider: "openrouter", llmKey: "" }));
  assert.equal(usableKey(openrouter), "");
  // A custom key saved for one origin is not sent to a new base URL.
  const custom = applyWrites({}, planConnectionWrites({ llmProvider: "custom", llmBaseUrl: "https://a.example/v1", llmKey: "custom-fictional" }));
  assert.equal(usableKey(custom), "custom-fictional");
  const moved = applyWrites(custom, planConnectionWrites({ llmProvider: "custom", llmBaseUrl: "https://b.example/v1", llmKey: "" }));
  assert.equal(usableKey(moved), "");
  // Saving the same provider without a key keeps the bound key.
  assert.equal(usableKey(applyWrites(custom, planConnectionWrites({ llmProvider: "custom", llmBaseUrl: "https://a.example/v1/", llmKey: "" }))), "custom-fictional");
});

test("legacy unbound keys and the xAI environment key are used only where they are bound", () => {
  assert.equal(usableKey({ llm_provider: "anthropic", llm_key: "legacy-fictional" }), "", "a legacy key with no binding is not used");
  assert.equal(usableKey({ llm_provider: "xai", llm_key: "legacy-fictional", xai: "legacy-fictional" }), "");
  assert.equal(usableKey({ llm_provider: "custom", llm_base_url: "https://a.example/v1" }, "env-xai-fictional"), "");
  assert.equal(usableKey({ llm_provider: "groq" }, "env-xai-fictional"), "");
  assert.equal(usableKey({ llm_provider: "xai" }, "env-xai-fictional"), "env-xai-fictional");
  assert.equal(usableKey({ llm_provider: "xai", xai: "xai-only-fictional" }, "env-xai-fictional"), "xai-only-fictional");
});
