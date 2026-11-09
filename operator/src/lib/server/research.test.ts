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

test("research no longer reads an xAI-only environment key or calls xAI directly", async () => {
  const { readFile } = await import("node:fs/promises");
  const fns = await readFile(new URL("./fns.ts", import.meta.url), "utf8");
  const start = fns.indexOf("export const researchQuestion");
  const body = fns.slice(start, fns.indexOf("export const", start + 10));
  assert.ok(start > 0, "researchQuestion exists");
  assert.doesNotMatch(body, /XAI_API_KEY|api\.x\.ai|Research is unavailable in this environment/);
  assert.match(body, /completeJson\(/, "research uses the provider configured in Settings");
});
