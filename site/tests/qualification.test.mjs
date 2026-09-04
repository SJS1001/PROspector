import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";

async function evaluator(vite) {
  try { return await vite.ssrLoadModule(new URL("../domain/qualification.ts", import.meta.url).pathname); }
  catch { assert.fail("missing production behavior: site/domain/qualification.ts must reproduce the immutable Mining rubric in trusted application code"); }
}

const DIGEST = "a".repeat(64);
const RUBRIC_DIGEST = "b".repeat(64);
const base = () => ({
  configurationDigest: DIGEST, rubricDigest: RUBRIC_DIGEST, evaluationVersion: "mining-rubric/v1",
  candidateId: "candidate-a", accountId: "account-a", targetId: "target-a", offerId: "offer-a",
  accountFit: 2, painStrength: 2, timingUrgency: 1, dataReadiness: 1, commercialViability: 1,
  requiredEvidence: ["target", "pain", "timing", "operation", "offer"], hardDisqualifiers: [],
  sources: [{ id: "tier-1", tier: 1, independenceGroup: "publisher-a", retrievedAt: 1_780_000_000_000, recency: "current", material: true }],
});

test("D-04 locks every threshold, support, source, and hard-gate boundary", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const qualification = await evaluator(vite);
    const cases = [
      ["exactly 7 passes", {}, "Passed", 7], ["six does not pass", { commercialViability: 0 }, "NotQualified", 6],
      ["pain zero never passes", { painStrength: 0 }, "NotQualified", 5], ["timing zero never passes", { timingUrgency: 0 }, "NotQualified", 6],
      ["Tier 3 alone is insufficient", { sources: [{ id: "tier-3", tier: 3, independenceGroup: "x", retrievedAt: 1, recency: "current", material: false }] }, "InsufficientEvidence", 7],
      ["same Tier 2 group is insufficient", { sources: [{ id: "a", tier: 2, independenceGroup: "same", retrievedAt: 1, recency: "current", material: false }, { id: "b", tier: 2, independenceGroup: "same", retrievedAt: 2, recency: "current", material: false }] }, "InsufficientEvidence", 7],
      ["two independent Tier 2 sources pass", { sources: [{ id: "a", tier: 2, independenceGroup: "one", retrievedAt: 1, recency: "current", material: false }, { id: "b", tier: 2, independenceGroup: "two", retrievedAt: 2, recency: "current", material: false }] }, "Passed", 7],
      ["unreconfirmed account context cannot qualify", { sources: [{ id: "a", tier: 1, independenceGroup: "one", retrievedAt: 1, recency: "account_context_reconfirmation_required", material: false }] }, "InsufficientEvidence", 7],
      ["missing operation zeros its supported dimension", { requiredEvidence: ["target", "pain", "timing", "offer"] }, "InsufficientEvidence", 6],
    ];
    for (const [name, patch, outcome, score] of cases) {
      const result = qualification.evaluateMiningQualification({ ...base(), ...patch });
      assert.equal(result.outcome, outcome, name); assert.equal(result.score, score, name);
    }
    for (const hardGate of qualification.MINING_HARD_DISQUALIFIERS) {
      const result = qualification.evaluateMiningQualification({ ...base(), hardDisqualifiers: [hardGate] });
      assert.equal(result.outcome, "Disqualified", hardGate);
      assert.equal(result.gateChecks.find((check) => check.gate === hardGate).passed, false, hardGate);
    }
  } finally { await vite.close(); }
});

test("D-04 fails closed for malformed immutable or trusted facts without throwing", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const qualification = await evaluator(vite);
    for (const [name, patch, missing] of [
      ["absent configuration digest", { configurationDigest: undefined }, "configurationDigest"],
      ["uppercase digest", { rubricDigest: "A".repeat(64) }, "rubricDigest"],
      ["absent evaluator version", { evaluationVersion: undefined }, "evaluationVersion"],
      ["wrong evaluator version", { evaluationVersion: "runner/v999" }, "evaluationVersion"],
      ["missing target identity", { targetId: "" }, "targetId"],
      ["malformed source does not count", { sources: [{ id: "claimed", tier: 1, independenceGroup: "origin", retrievedAt: 1 }] }, "sources"],
      ["missing support zeros caller score", { requiredEvidence: ["target", "timing", "operation", "offer"] }, "pain"],
    ]) {
      const result = qualification.evaluateMiningQualification({ ...base(), ...patch });
      assert.equal(result.outcome, "InsufficientEvidence", name);
      assert.ok(result.missingFields.includes(missing), name);
    }
    const disqualified = qualification.evaluateMiningQualification({ configurationDigest: null, hardDisqualifiers: ["explicit_no_solicitation"] });
    assert.equal(disqualified.outcome, "Disqualified", "a recorded hard gate takes priority even when other evidence is unusable");
    assert.doesNotThrow(() => qualification.evaluateMiningQualification(null));
  } finally { await vite.close(); }
});

test("D-04 is byte-stable under replay, evidence permutations, duplicates, ties, and runner claims", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const qualification = await evaluator(vite);
    const sources = [
      { id: "source-b", tier: 2, independenceGroup: "b", retrievedAt: 1_780_000_000_000, recency: "current", material: true },
      { id: "source-a", tier: 2, independenceGroup: "a", retrievedAt: 1_779_999_000_000, recency: "current", material: true },
    ];
    const first = qualification.evaluateMiningQualification({ ...base(), sources });
    const replay = qualification.evaluateMiningQualification({ ...base(), sources: [...sources].reverse().concat(sources[0]), runnerScore: 10, score: 10, outcome: "Passed", tier: 1, qualification: { outcome: "Passed" } });
    assert.equal(JSON.stringify(first), JSON.stringify(replay));
    assert.equal(first.outcome, "Passed");
    assert.deepEqual(first.citedSources.map((source) => source.id), ["source-a", "source-b"]);
    const tied = qualification.orderQualificationCandidates([base(), { ...base(), candidateId: "candidate-b" }]);
    assert.deepEqual(tied.map((value) => value.candidateId), ["candidate-a", "candidate-b"]);
    assert.deepEqual(first.sortInputs, [2, 1, 2, 1_780_000_000_000, "candidate-a"]);
  } finally { await vite.close(); }
});
