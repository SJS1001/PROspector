import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";

async function evaluator(vite) {
  try { return await vite.ssrLoadModule(new URL("../domain/qualification.ts", import.meta.url).pathname); }
  catch { assert.fail("missing production behavior: site/domain/qualification.ts must reproduce the immutable Mining rubric in trusted application code"); }
}

const base = () => ({
  configurationDigest: "a".repeat(64), accountFit: 2, painStrength: 2, timingUrgency: 1, dataReadiness: 1, commercialViability: 1,
  requiredEvidence: ["target", "pain", "timing", "operation", "offer"],
  sources: [{ id: "tier-1", tier: 1, independenceGroup: "publisher-a", retrievedAt: 1_780_000_000_000 }],
  hardDisqualifiers: [], candidateId: "candidate-a", accountId: "account-a", targetId: "target-a", offerId: "offer-a",
});

test("D-04 deterministic Mining qualification locks threshold, evidence gates, and stable ties", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const qualification = await evaluator(vite);
    const cases = [
      ["exactly 7 passes", {}, "Passed"], ["six does not pass", { commercialViability: 0 }, "NotQualified"],
      ["pain zero never passes", { painStrength: 0 }, "NotQualified"], ["timing zero never passes", { timingUrgency: 0 }, "NotQualified"],
      ["Tier 3 alone is insufficient", { sources: [{ id: "tier-3", tier: 3, independenceGroup: "x" }] }, "InsufficientEvidence"],
      ["same Tier 2 publisher is insufficient", { sources: [{ id: "a", tier: 2, independenceGroup: "same" }, { id: "b", tier: 2, independenceGroup: "same" }] }, "InsufficientEvidence"],
      ["missing evidence is insufficient", { requiredEvidence: ["target", "pain"] }, "InsufficientEvidence"],
      ["hard disqualifier wins", { hardDisqualifiers: ["explicit_no_solicitation"] }, "Disqualified"],
    ];
    for (const [name, input, outcome] of cases) {
      const result = qualification.evaluateMiningQualification({ ...base(), ...input });
      assert.equal(result.outcome, outcome, name);
      assert.equal(result.configurationDigest, "a".repeat(64));
      assert.ok(Array.isArray(result.gateChecks));
    }
    const tied = qualification.orderQualificationCandidates([base(), { ...base(), candidateId: "candidate-b" }]);
    assert.deepEqual(tied.map((value) => value.candidateId), ["candidate-a", "candidate-b"], "ties must use a stable recorded final key");
  } finally { await vite.close(); }
});

test("Mining evaluator is byte-stable across source order, duplicates, stale evidence, and runner claims", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const qualification = await evaluator(vite);
    const tierTwo = [
      { id: "source-b", tier: 2, independenceGroup: "b", retrievedAt: 1_780_000_000_000, material: true },
      { id: "source-a", tier: 2, independenceGroup: "a", retrievedAt: 1_779_999_000_000, material: true },
    ];
    const first = qualification.evaluateMiningQualification({ ...base(), sources: tierTwo });
    const replay = qualification.evaluateMiningQualification({ ...base(), sources: [...tierTwo].reverse().concat(tierTwo[0]), runnerScore: 10 });
    assert.equal(JSON.stringify(first), JSON.stringify(replay));
    assert.equal(first.outcome, "Passed");
    const stale = qualification.evaluateMiningQualification({ ...base(), sources: [{ ...tierTwo[0], recency: "account_context_reconfirmation_required" }] });
    assert.equal(stale.outcome, "InsufficientEvidence");
    for (const hardGate of qualification.MINING_HARD_DISQUALIFIERS) {
      assert.equal(qualification.evaluateMiningQualification({ ...base(), hardDisqualifiers: [hardGate] }).outcome, "Disqualified", hardGate);
    }
  } finally { await vite.close(); }
});
