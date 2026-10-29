import assert from "node:assert/strict";
import test from "node:test";
import { qualifyCandidate } from "./qualify.ts";
import { mergeJevQualification, jevContribution } from "./qualify-jev.ts";

const source = {
  url: "https://www.nordicmining.com/operations/engebo/",
  title: "Engebø rutile plant",
  text: "Operating mineral processing plant with historian data, recovery and throughput constraints, 2026 expansion priority, OT/IT link, GM diagnostic path.",
  retrievedAt: "2026-09-20T00:00:00.000Z",
};

function base() {
  return qualifyCandidate({
    accountName: "Nordic Mining",
    targetName: "Engebø plant",
    profileText: "Digitalrain ONE mining plants",
    source,
  });
}

test("Jev cannot upgrade insufficient evidence", () => {
  const thin = qualifyCandidate({
    accountName: "Unknown Miner",
    targetName: "Forum mill",
    profileText: "plants",
    source: { ...source, url: "https://example.net/forum-post", text: "Operating plant mill recovery" },
  });
  const merged = mergeJevQualification(thin, {
    scores: {
      account_fit: { score: 2, confidence: 0.9 },
      pain_strength: { score: 2, confidence: 0.9 },
      timing: { score: 2, confidence: 0.9 },
      data_readiness: { score: 2, confidence: 0.9 },
      commercial: { score: 2, confidence: 0.9 },
    },
    outcome: "Passed",
    outcomeConfidence: 0.95,
    hardNo: 0.01,
    operating: 0.9,
    stuffed: 0.01,
  });
  assert.equal(thin.outcome, "InsufficientEvidence");
  assert.equal(merged.outcome, "InsufficientEvidence");
});

test("high-confidence Jev disqualifier wins", () => {
  const merged = mergeJevQualification(base(), {
    scores: {},
    outcome: "Disqualified",
    outcomeConfidence: 0.9,
    hardNo: 0.88,
    operating: 0.8,
    stuffed: 0.01,
  });
  assert.equal(merged.outcome, "Disqualified");
});

test("low-confidence disagreement blocks a keyword pass", () => {
  const keyword = base();
  assert.equal(keyword.outcome, "Passed");
  const merged = mergeJevQualification(keyword, {
    scores: {},
    outcome: "NotQualified",
    outcomeConfidence: 0.3,
    hardNo: 0.1,
    operating: 0.8,
    stuffed: 0.01,
  });
  assert.equal(merged.outcome, "NotQualified");
});

test("contribution distinguishes agreement, ignored answers and changed decisions", () => {
  const keyword = { ...base(), outcome: "NotQualified" as const };
  const ignored = { scores: { pain_strength: { score: 0, confidence: 0.1 } }, outcome: "NotQualified" as const, outcomeConfidence: 0.1, hardNo: 0, operating: 1, stuffed: 0 };
  assert.deepEqual(jevContribution(keyword, mergeJevQualification(keyword, ignored), ignored), { applied: false, changed: false });
  const agreed = { ...ignored, outcomeConfidence: 0.9 };
  assert.deepEqual(jevContribution(keyword, mergeJevQualification(keyword, agreed), agreed), { applied: true, changed: false });
  const blocked = { ...ignored, hardNo: 1 };
  assert.deepEqual(jevContribution(keyword, mergeJevQualification(keyword, blocked), blocked), { applied: true, changed: true });
});
