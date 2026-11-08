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
  planConnectionWrites,
  showsNonAiCredentials,
} from "./openrouter-policy.ts";

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
  assert.deepEqual(writes.map((write) => write.name), ["llm_key", "xai", "llm_provider", "llm_model", "apollo"]);
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
    { name: "llm_key", value: "sk-or-fictional" },
    { name: "llm_model", value: "openai/gpt-4" },
    { name: "llm_provider", value: "openrouter" },
  ]);
  const unchanged = planConnectionWrites({ llmProvider: "openrouter", llmKey: "", apollo: "apollo-fictional-key" });
  assert.deepEqual(unchanged, [{ name: "llm_provider", value: "openrouter" }]);
  assert.throws(() => planConnectionWrites({ llmProvider: "openrouter", llmModel: "apollo" }), /openai\/gpt-4/);
});
