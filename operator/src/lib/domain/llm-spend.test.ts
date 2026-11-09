import assert from "node:assert/strict";
import test from "node:test";
import {
  SPEND_PRICES,
  estimateTokens,
  parseHuntBatch,
  parseSpendCapDollars,
  responseSpendCents,
  spendCents,
  validSpendCapCents,
} from "./llm.ts";

test("the Settings spend cap accepts dollars and 0, and rejects anything else", () => {
  assert.deepEqual(parseSpendCapDollars(""), {});
  assert.deepEqual(parseSpendCapDollars("  "), {});
  assert.deepEqual(parseSpendCapDollars("50"), { cents: 5000 });
  assert.deepEqual(parseSpendCapDollars("12.50"), { cents: 1250 });
  assert.deepEqual(parseSpendCapDollars("0.07"), { cents: 7 });
  assert.deepEqual(parseSpendCapDollars("0"), { cents: 0 });
  assert.deepEqual(parseSpendCapDollars("100000"), { cents: 10_000_000 });
  for (const bad of ["$50", "50 USD", "-5", "1e3", "12.345", "abc", "100000.01", "Infinity", "NaN", "5,000"])
    assert.match(parseSpendCapDollars(bad).error ?? "", /spend cap/, bad);
  assert.equal(validSpendCapCents(0), true);
  assert.equal(validSpendCapCents(5000), true);
  for (const bad of [Number.NaN, null, undefined, -1, 0.5, "5000", Infinity, 10_000_001])
    assert.equal(validSpendCapCents(bad), false, String(bad));
});

test("companies per search accepts whole numbers 4 to 20 only", () => {
  assert.deepEqual(parseHuntBatch(""), {});
  assert.deepEqual(parseHuntBatch("4"), { batch: 4 });
  assert.deepEqual(parseHuntBatch("20"), { batch: 20 });
  for (const bad of ["3", "21", "7.5", "eight", "-4"]) assert.ok(parseHuntBatch(bad).error, bad);
});

test("cost is whole cents, rounded up, from the one price table", () => {
  assert.equal(spendCents("anthropic", { inputTokens: 1_000_000, outputTokens: 0 }), SPEND_PRICES.anthropic.inputPerMTok);
  assert.equal(spendCents("groq", { inputTokens: 1, outputTokens: 1 }), 1, "a tiny call is never free");
  assert.equal(spendCents("groq", { inputTokens: 0, outputTokens: 0 }), 0);
  assert.equal(spendCents("anthropic", { inputTokens: 0, outputTokens: 0, searches: 3 }), 3);
  assert.equal(spendCents("jev", { inputTokens: 5000, outputTokens: 5000 }), 1);
  assert.equal(estimateTokens("abcdef"), 2);
  for (const [rate, price] of Object.entries(SPEND_PRICES))
    for (const value of Object.values(price)) assert.ok(Number.isFinite(value) && value >= 0, rate);
});

test("actual cost is read from each provider's usage shape", () => {
  assert.equal(responseSpendCents("openai", { usage: { prompt_tokens: 1_000_000, completion_tokens: 0 } }), 1000);
  assert.equal(responseSpendCents("openai", { usage: { input_tokens: 0, output_tokens: 1_000_000 } }), 4000);
  assert.equal(
    responseSpendCents("anthropic", {
      usage: { input_tokens: 0, cache_read_input_tokens: 1_000_000, output_tokens: 0, server_tool_use: { web_search_requests: 2 } },
    }),
    1500 + 2,
  );
  assert.equal(responseSpendCents("openrouter", { usage: { cost: 0.031 } }), 4);
  assert.equal(responseSpendCents("xai", { usage: { prompt_tokens: 0, completion_tokens: 0, num_sources_used: 4 } }), 10);
  // Search count not reported: the searches the request allowed are charged.
  assert.equal(responseSpendCents("anthropic", { usage: { input_tokens: 0, output_tokens: 0 } }, 5), 5);
  for (const none of [null, {}, { usage: null }, { usage: {} }, { usage: { prompt_tokens: "9" } }, "text"])
    assert.equal(responseSpendCents("openai", none), null);
});
