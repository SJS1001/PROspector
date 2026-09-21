import assert from "node:assert/strict";
import test from "node:test";
import { assignTier, fingerprintOf, qualifyCandidate } from "./qualify.ts";

const profile =
  "Digitalrain ONE for Mining operating mineral processing plants historian recovery throughput eight-week diagnostic";

test("own-domain evidence is tier 1", () => {
  assert.equal(assignTier("Nordic Mining", "https://www.nordicmining.com/operations/engebo/"), 1);
  assert.equal(assignTier("Lundin Mining", "https://www.reuters.com/markets/commodities/example"), 2);
  assert.equal(assignTier("Forum Co", "https://reddit.com/r/mining"), 3);
});

test("identical account/target fingerprints collide", () => {
  assert.equal(fingerprintOf("Teck", "Highland Valley"), fingerprintOf("teck", "highland valley"));
});

test("pass requires 7/10, pain, timing, and tier 1", () => {
  const result = qualifyCandidate({
    accountName: "Nordic Mining",
    targetName: "Engebø plant",
    profileText: profile,
    source: {
      url: "https://www.nordicmining.com/operations/engebo/",
      title: "Engebø rutile plant",
      text: "Operating mineral processing plant with historian data, recovery and throughput constraints, 2026 expansion priority, OT/IT link, GM diagnostic path.",
      retrievedAt: "2026-09-20T00:00:00.000Z",
    },
  });
  assert.equal(result.outcome, "Passed");
  assert.ok(result.score >= 7);
});

test("tier 3 cannot qualify alone", () => {
  const result = qualifyCandidate({
    accountName: "Unknown Miner",
    targetName: "Forum mill",
    profileText: profile,
    source: {
      url: "https://example.net/forum-post",
      title: "Plant gossip",
      text: "Operating plant mill recovery throughput historian expansion 2026 director diagnostic",
      retrievedAt: "2026-09-20T00:00:00.000Z",
    },
  });
  assert.equal(result.outcome, "InsufficientEvidence");
});

test("hard disqualifier wins", () => {
  const result = qualifyCandidate({
    accountName: "Nordic Mining",
    targetName: "Engebø",
    profileText: profile,
    source: {
      url: "https://www.nordicmining.com/opt-out",
      title: "Do not contact",
      text: "Operating plant recovery throughput historian expansion 2026. Explicit do not contact.",
      retrievedAt: "2026-09-20T00:00:00.000Z",
    },
  });
  assert.equal(result.outcome, "Disqualified");
});
