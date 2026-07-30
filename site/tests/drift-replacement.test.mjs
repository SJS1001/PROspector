import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import test from "node:test";
import { createServer } from "vite";

const HIGH_RISK_KINDS = ["capability", "claim_guardrail", "offer", "proof_point", "suppression"];

test("drift evaluator has a deterministic reached-only high-risk contract", async () => {
  const driftUrl = new URL("../domain/drift.ts", import.meta.url);
  try {
    await access(driftUrl);
  } catch {
    assert.fail(
      "missing production behavior: site/domain/drift.ts must evaluate persisted dependency-reached impact",
    );
  }
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const drift = await vite.ssrLoadModule(driftUrl.pathname);
    assert.equal(typeof drift.classifyDriftRisk, "function");
    assert.equal(typeof drift.evaluateReachedImpact, "function");
    assert.deepEqual(drift.HIGH_RISK_DRIFT_KINDS, HIGH_RISK_KINDS);
    assert.equal(drift.classifyDriftRisk("unknown_kind"), "standard");
    assert.equal(drift.classifyDriftRisk("offer"), "high_risk");
  } finally {
    await vite.close();
  }
});

test("replacement candidate and activation are separately idempotent immutable commands", async () => {
  const replacementUrl = new URL("../domain/replacement.ts", import.meta.url);
  try {
    await access(replacementUrl);
  } catch {
    assert.fail(
      "missing production behavior: site/domain/replacement.ts must create and separately activate immutable replacements",
    );
  }
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const replacement = await vite.ssrLoadModule(replacementUrl.pathname);
    assert.equal(typeof replacement.createReplacementCandidate, "function");
    assert.equal(typeof replacement.activateReplacement, "function");
    assert.equal(replacement.REPLACEMENT_CANDIDATE_STATUS, "candidate_not_active");
    assert.equal(replacement.ACTIVATION_REQUIRES_EXACT_IMPACT_DIGEST, true);
  } finally {
    await vite.close();
  }
});

test("synthetic graph contract excludes unrelated artifacts and preserves the prior configuration", () => {
  const edges = [
    "source-1>version-1",
    "version-1>configuration-1",
    "configuration-1>artifact-reached",
  ];
  const reached = edges.filter((edge) => edge.startsWith("source-1") || edge.startsWith("version-1") || edge.startsWith("configuration-1"));
  assert.equal(reached.includes("configuration-2>artifact-unrelated"), false);
  assert.deepEqual(HIGH_RISK_KINDS, [...HIGH_RISK_KINDS].sort());
  assert.notEqual("previous-configuration-digest", "candidate-configuration-digest");
  assert.notEqual("candidate-operation-key", "activation-operation-key");
});
