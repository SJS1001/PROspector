import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { createServer } from "vite";

const fixtureUrl = new URL("./fixtures/prospect-quality-evaluation-v1.json", import.meta.url);

async function load() {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    return { vite, quality: await vite.ssrLoadModule(new URL("../domain/prospect-quality-evaluation.ts", import.meta.url).pathname) };
  } catch (error) {
    await vite.close();
    throw error;
  }
}
async function fixture() { return JSON.parse(await readFile(fixtureUrl, "utf8")); }
function clone(value) { return structuredClone(value); }

async function runtimeSourceUrls(directory = new URL("../", import.meta.url)) {
  const ignored = new Set([".next", ".wrangler", "dist", "node_modules", "tests"]);
  const urls = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const url = new URL(entry.name + (entry.isDirectory() ? "/" : ""), directory);
    if (entry.isDirectory()) urls.push(...await runtimeSourceUrls(url));
    else if (/\.(?:c|m)?(?:j|t)sx?$/u.test(entry.name) && entry.name !== "prospect-quality-evaluation.ts") urls.push(url);
  }
  return urls;
}

test("reduces the frozen synthetic two-arm cohort with exact denominators and literal non-authority", async () => {
  const { vite, quality } = await load();
  try {
    const report = await quality.evaluateProspectQuality(await fixture());
    assert.equal(report.status, "available");
    assert.equal(report.evidenceClass, "synthetic_only");
    assert.equal(report.operationalAcceptance, false);
    assert.match(report.protocolDigest, /^[a-f0-9]{64}$/);
    assert.match(report.cohortDigest, /^[a-f0-9]{64}$/);
    assert.match(report.evaluationDigest, /^[a-f0-9]{64}$/);
    assert.deepEqual(report.arms.system.closedSetRecall, { numerator: 3, denominator: 3, value: 1, wilson95: { lower: 0.438503, upper: 1 } });
    assert.deepEqual(report.arms.system.relevancePrecision, { numerator: 3, denominator: 3, value: 1, wilson95: { lower: 0.438503, upper: 1 } });
    assert.deepEqual(report.arms.system.evidenceAccuracy, { numerator: 2, denominator: 3, value: 0.666667, wilson95: { lower: 0.20766, upper: 0.938508 } });
    assert.equal(report.arms.system.evaluationUsableTargetCount, 1);
    assert.equal(report.arms.system.activeMinutes, 60);
    assert.equal(report.arms.system.activeMinutesPerUsable, 60);
    assert.equal(report.arms.system.knownActualCostMinor, 150);
    assert.equal(report.arms.system.unresolvedReservedCostMinor, 100);
    assert.equal(report.arms.system.atRiskCostMinorPerUsable, 250);
    assert.deepEqual(report.arms.system.contactOutcomeCounts, { complete: 1, no_result: 1, partial: 2, uncertain: 1 });
    assert.deepEqual(report.arms.system.contactEligibilityCounts, { current_eligible: 2, stale: 0, weak: 1, invalid: 0, unknown: 1, no_result: 1 });
    assert.deepEqual(report.arms.system.chargeOutcomeCounts, { complete: 1, no_result: 1, partial: 1, uncertain: 1 });
    assert.deepEqual(report.arms.system.evidenceLabelCounts, { supported_current: 2, supported_stale: 1, unsupported: 0, unknown: 0 });
    assert.deepEqual(report.arms.system.organizationMatchCounts, { correct: 3, incorrect: 0, ambiguous: 0, unknown: 0 });
    assert.deepEqual(report.arms.system.personIdentityLabelCounts, { correct: 3, incorrect: 0, ambiguous: 0, unknown: 1 });
    assert.deepEqual(report.arms.system.roleLabelCounts, { correct: 2, incorrect: 1, ambiguous: 0, unknown: 1 });
    assert.deepEqual(report.arms.system.affiliationCounts, { current: 3, notCurrent: 0, unknown: 1 });
    assert.deepEqual(report.sample.strata.map((stratum) => [stratum.id, stratum.targetCount]), [["borderline", 1], ["negative", 1], ["positive", 2]]);
    assert.ok(report.limitations.includes("single_item_stratum_has_unstable_estimate"));
    assert.ok(report.limitations.includes("strata_reported_descriptively_not_individually_powered"));
    assert.equal(report.thresholdExercise.status, "passed");
    assert.equal(report.thresholdExercise.meaning, "synthetic_calculation_contract_only");
    assert.ok(report.limitations.includes("synthetic_fixture_not_real_quality_evidence"));
    assert.equal(Object.isFrozen(report), true);
    assert.equal(Object.isFrozen(report.arms.system), true);
  } finally { await vite.close(); }
});

test("input ordering cannot change the bound report or digests", async () => {
  const { vite, quality } = await load();
  try {
    const original = await fixture();
    const shuffled = clone(original);
    shuffled.cohort.targets.reverse();
    shuffled.cohort.strata.reverse();
    shuffled.arms.reverse();
    for (const arm of shuffled.arms) {
      arm.results.reverse(); arm.effort.reverse(); arm.costs.reverse();
      for (const result of arm.results) { result.evidence.reverse(); result.contacts.reverse(); }
    }
    const [a, b] = await Promise.all([quality.evaluateProspectQuality(original), quality.evaluateProspectQuality(shuffled)]);
    assert.deepEqual(b, a);
  } finally { await vite.close(); }
});

test("protocol or cohort changes produce new immutable evidence identities", async () => {
  const { vite, quality } = await load();
  try {
    const original = await fixture();
    const thresholdChanged = clone(original);
    thresholdChanged.protocol.revision = 2;
    thresholdChanged.protocol.thresholds.minEvidenceAccuracy = 0.9;
    const cohortChanged = clone(original);
    cohortChanged.cohort.targets[0].label = "irrelevant";
    const [a, b, c] = await Promise.all([original, thresholdChanged, cohortChanged].map((input) => quality.evaluateProspectQuality(input)));
    assert.notEqual(a.protocolDigest, b.protocolDigest);
    assert.notEqual(a.evaluationDigest, b.evaluationDigest);
    assert.equal(a.cohortDigest, b.cohortDigest);
    assert.equal(b.thresholdExercise.status, "failed");
    assert.equal(a.protocolDigest, c.protocolDigest);
    assert.notEqual(a.cohortDigest, c.cohortDigest);
  } finally { await vite.close(); }
});

test("unknown labels remain losses and prevent synthetic threshold success", async () => {
  const { vite, quality } = await load();
  try {
    const input = await fixture();
    input.cohort.targets[0].label = "unknown";
    input.arms[0].results[0].evidence[0].label = "unknown";
    const report = await quality.evaluateProspectQuality(input);
    assert.equal(report.status, "available");
    assert.equal(report.thresholdExercise.status, "failed");
    assert.equal(report.thresholdExercise.checks.minimumAdjudicatedTargets, false);
    assert.ok(report.limitations.includes("cohort_contains_unknown_owner_labels"));
    assert.equal(report.arms.system.evidenceLabelCounts.unknown, 1);
    assert.equal(report.arms.system.evidenceAccuracy.numerator, 1);
    assert.equal(report.arms.system.evidenceAccuracy.denominator, 3);
  } finally { await vite.close(); }
});

test("threshold decisions use exact fractions rather than rounded display values", async () => {
  const { vite, quality } = await load();
  try {
    const minimum = await fixture();
    minimum.protocol.thresholds.minEvidenceAccuracy = 0.6666668;
    const minimumReport = await quality.evaluateProspectQuality(minimum);
    assert.equal(minimumReport.arms.system.evidenceAccuracy.value, 0.666667);
    assert.equal(minimumReport.thresholdExercise.checks.evidenceAccuracy, false, "2/3 is below the threshold even though its display rounds up");

    const maximum = await fixture();
    maximum.arms[0].results[2].organizationMatch = "incorrect";
    maximum.protocol.thresholds.maxOrganizationFalseMatchRate = 0.3333332;
    const maximumReport = await quality.evaluateProspectQuality(maximum);
    assert.equal(maximumReport.arms.system.organizationFalseMatchRate.value, 0.333333);
    assert.equal(maximumReport.thresholdExercise.checks.organizationFalseMatchRate, false, "1/3 is above the threshold even though its display rounds down");
  } finally { await vite.close(); }
});

test("active-time acceptance uses exact elapsed milliseconds and rounds only the report", async () => {
  const { vite, quality } = await load();
  try {
    const input = await fixture();
    input.arms[0].effort = [
      { id: "effort-two-ms-a", targetId: "target-alpha", startedAt: "2026-09-02T10:00:00.000Z", endedAt: "2026-09-02T10:00:00.002Z" },
      { id: "effort-two-ms-b", targetId: "target-bravo", startedAt: "2026-09-02T10:00:00.003Z", endedAt: "2026-09-02T10:00:00.005Z" },
      { id: "effort-two-ms-c", targetId: "target-charlie", startedAt: "2026-09-02T10:00:00.006Z", endedAt: "2026-09-02T10:00:00.008Z" },
    ];
    input.protocol.thresholds.maxActiveMinutesPerUsable = 0.0000995;
    const report = await quality.evaluateProspectQuality(input);
    assert.equal(report.status, "available");
    assert.equal(report.arms.system.activeMinutes, 0.0001);
    assert.equal(report.arms.system.activeMinutesPerUsable, 0.0001);
    assert.equal(report.thresholdExercise.checks.activeMinutesPerUsable, false, "six exact milliseconds exceed the 5.97ms cap");
  } finally { await vite.close(); }
});

test("accepts exact UTC instants only and rejects normalized or noncanonical timestamps", async () => {
  const { vite, quality } = await load();
  try {
    for (const mutate of [
      (input) => { input.protocol.observationStartsAt = "2026-02-30T00:00:00.000Z"; },
      (input) => { input.protocol.frozenAt = "2026-09-01T00:00:00Z"; },
      (input) => { input.protocol.observationEndsAt = "2026-09-05T00:00:00.000+00:00"; },
      (input) => { input.arms[0].effort[0].startedAt = "2026-09-02T10:00:00.001Z"; input.arms[0].effort[0].endedAt = "2026-09-02T10:00:00.000Z"; },
    ]) {
      const input = await fixture(); mutate(input);
      const report = await quality.evaluateProspectQuality(input);
      assert.deepEqual(report.reasonCodes, ["evaluation_time_invalid"]);
    }
  } finally { await vite.close(); }
});

test("enforces exact max and max-plus-one collection boundaries", async () => {
  const { vite, quality } = await load();
  try {
    const targetsAtMax = await fixture();
    for (let index = targetsAtMax.cohort.targets.length; index < quality.PROSPECT_QUALITY_MAX_TARGETS; index += 1) {
      const targetId = `target-extra-${String(index).padStart(4, "0")}`;
      targetsAtMax.cohort.targets.push({ id: targetId, stratum: "positive", label: "relevant" });
      for (const arm of targetsAtMax.arms) arm.results.push({ id: `${arm.arm}-extra-${String(index).padStart(4, "0")}`, targetId, surfaced: false, organizationMatch: null, evidence: [], contacts: [] });
    }
    targetsAtMax.protocol.thresholds.minAdjudicatedTargets = quality.PROSPECT_QUALITY_MAX_TARGETS;
    assert.equal((await quality.evaluateProspectQuality(targetsAtMax)).status, "available");
    const targetsOverMax = clone(targetsAtMax);
    targetsOverMax.cohort.targets.push({ id: "target-over-max", stratum: "positive", label: "relevant" });
    for (const arm of targetsOverMax.arms) arm.results.push({ id: `${arm.arm}-over-max`, targetId: "target-over-max", surfaced: false, organizationMatch: null, evidence: [], contacts: [] });
    assert.deepEqual((await quality.evaluateProspectQuality(targetsOverMax)).reasonCodes, ["evaluation_limit_exceeded"]);

    for (const field of ["evidence", "contacts"]) {
      const atMax = await fixture();
      const current = atMax.arms[0].results[0][field].length;
      for (let index = current; index < quality.PROSPECT_QUALITY_MAX_ITEMS_PER_RESULT; index += 1) {
        if (field === "evidence") atMax.arms[0].results[0].evidence.push({ id: `max-claim-${index}`, label: "supported_current" });
        else atMax.arms[0].results[0].contacts.push({ id: `max-contact-${index}`, attempted: true, outcome: "no_result", identity: null, role: null, currentAffiliation: null, eligibility: "no_result" });
      }
      assert.equal((await quality.evaluateProspectQuality(atMax)).status, "available", field);
      const overMax = clone(atMax);
      if (field === "evidence") overMax.arms[0].results[0].evidence.push({ id: "over-max-claim", label: "supported_current" });
      else overMax.arms[0].results[0].contacts.push({ id: "over-max-contact", attempted: true, outcome: "no_result", identity: null, role: null, currentAffiliation: null, eligibility: "no_result" });
      assert.deepEqual((await quality.evaluateProspectQuality(overMax)).reasonCodes, ["evaluation_limit_exceeded"], field);
    }

    const ledgerAtMax = await fixture();
    for (let index = ledgerAtMax.arms[0].costs.length; index < quality.PROSPECT_QUALITY_MAX_LEDGER_ROWS; index += 1) ledgerAtMax.arms[0].costs.push({ id: `max-cost-${String(index).padStart(5, "0")}`, targetId: "target-alpha", outcome: "complete", currency: "CAD", actualMinor: 0, unresolvedReservedMinor: 0 });
    assert.equal((await quality.evaluateProspectQuality(ledgerAtMax)).status, "available");
    ledgerAtMax.arms[0].costs.push({ id: "over-max-cost", targetId: "target-alpha", outcome: "complete", currency: "CAD", actualMinor: 0, unresolvedReservedMinor: 0 });
    assert.deepEqual((await quality.evaluateProspectQuality(ledgerAtMax)).reasonCodes, ["evaluation_limit_exceeded"]);
  } finally { await vite.close(); }
});

test("validates threshold and safe-integer boundaries without coercion", async () => {
  const { vite, quality } = await load();
  try {
    const safe = await fixture();
    for (const row of safe.arms[0].costs) { row.actualMinor = 0; row.unresolvedReservedMinor = 0; }
    safe.arms[0].costs[0].actualMinor = Number.MAX_SAFE_INTEGER;
    safe.protocol.revision = Number.MAX_SAFE_INTEGER;
    safe.protocol.thresholds.maxKnownCostMinorPerUsable = Number.MAX_SAFE_INTEGER;
    safe.protocol.thresholds.maxAtRiskCostMinorPerUsable = Number.MAX_SAFE_INTEGER;
    assert.equal((await quality.evaluateProspectQuality(safe)).status, "available");

    for (const mutate of [
      (input) => { input.protocol.revision = Number.MAX_SAFE_INTEGER + 1; },
      (input) => { input.protocol.thresholds.minAdjudicatedTargets = 0; },
      (input) => { input.protocol.thresholds.minEvidenceAccuracy = 1.000001; },
      (input) => { input.protocol.thresholds.minEvidenceAccuracy = "0.8"; },
      (input) => { input.protocol.thresholds.maxKnownCostMinorPerUsable = Number.MAX_SAFE_INTEGER + 1; },
      (input) => { input.arms[0].costs[0].actualMinor = Number.MAX_SAFE_INTEGER + 1; },
    ]) {
      const input = await fixture(); mutate(input);
      assert.equal((await quality.evaluateProspectQuality(input)).status, "unavailable");
    }
  } finally { await vite.close(); }
});

test("uses code-unit ordering for stable identities in every locale", async () => {
  const { vite, quality } = await load();
  try {
    const input = await fixture();
    input.cohort.strata = ["alpha", "_under", "Zed"];
    input.cohort.targets[0].stratum = "Zed";
    input.cohort.targets[1].stratum = "_under";
    input.cohort.targets[2].stratum = "alpha";
    input.cohort.targets[3].stratum = "alpha";
    const report = await quality.evaluateProspectQuality(input);
    assert.deepEqual(report.sample.strata.map((stratum) => stratum.id), ["Zed", "_under", "alpha"]);
    const reversed = clone(input); reversed.cohort.targets.reverse(); reversed.cohort.strata.reverse(); reversed.arms.reverse();
    assert.deepEqual(await quality.evaluateProspectQuality(reversed), report);
    const source = await readFile(new URL("../domain/prospect-quality-evaluation.ts", import.meta.url), "utf8");
    assert.doesNotMatch(source, /localeCompare/);
  } finally { await vite.close(); }
});

test("zero usable or zero metric denominators are unavailable for passing, never coerced to zero", async () => {
  const { vite, quality } = await load();
  try {
    const input = await fixture();
    for (const arm of input.arms) for (const result of arm.results) {
      result.surfaced = false; result.organizationMatch = null; result.evidence = []; result.contacts = [];
    }
    const report = await quality.evaluateProspectQuality(input);
    assert.equal(report.status, "available");
    assert.equal(report.arms.system.relevancePrecision.value, null);
    assert.equal(report.arms.system.relevancePrecision.wilson95, null);
    assert.equal(report.arms.system.activeMinutesPerUsable, null);
    assert.equal(report.arms.system.knownCostMinorPerUsable, null);
    assert.equal(report.thresholdExercise.status, "failed");
    assert.ok(report.limitations.includes("system_contains_zero_denominator_metric"));
  } finally { await vite.close(); }
});

test("rejects duplicate, incomplete, cross-cohort, and mismatched arm material", async () => {
  const { vite, quality } = await load();
  try {
    const mutations = [
      (input) => { input.cohort.targets.push(clone(input.cohort.targets[0])); },
      (input) => { input.arms[0].results.pop(); },
      (input) => { input.arms[0].results[0].targetId = "foreign-target"; },
      (input) => { input.arms[1].arm = "system"; },
      (input) => { input.arms[0].results[0].unexpected = true; },
      (input) => { input.arms[0].effortCoverage = "partial"; },
      (input) => { input.arms[0].results[1].contacts[2].eligibility = "current_eligible"; },
      (input) => { input.arms[0].results[1].contacts[0].id = input.arms[0].results[0].contacts[0].id; },
      (input) => { input.arms[1].results[0].id = input.arms[0].results[0].id; },
    ];
    for (const mutate of mutations) {
      const input = await fixture(); mutate(input);
      const report = await quality.evaluateProspectQuality(input);
      assert.equal(report.status, "unavailable");
      assert.equal(report.operationalAcceptance, false);
    }
  } finally { await vite.close(); }
});

test("rejects invalid or overlapping active-time ledgers", async () => {
  const { vite, quality } = await load();
  try {
    const cases = [
      (input) => { input.arms[0].effort[1].startedAt = "2026-09-02T10:10:00.000Z"; },
      (input) => { input.arms[0].effort[0].endedAt = input.arms[0].effort[0].startedAt; },
      (input) => { input.arms[0].effort[0].startedAt = "2026-08-31T23:59:59.999Z"; },
      (input) => { input.arms[0].effort[0].targetId = "foreign-target"; },
      (input) => { input.arms[1].effort[0].startedAt = "2026-09-02T10:10:00.000Z"; input.arms[1].effort[0].endedAt = "2026-09-02T10:15:00.000Z"; },
    ];
    for (const mutate of cases) {
      const input = await fixture(); mutate(input);
      const report = await quality.evaluateProspectQuality(input);
      assert.deepEqual(report.reasonCodes, ["evaluation_time_invalid"]);
    }
  } finally { await vite.close(); }
});

test("counts no-result, partial, and uncertain charges and rejects unsafe cost ledgers", async () => {
  const { vite, quality } = await load();
  try {
    const base = await fixture();
    const report = await quality.evaluateProspectQuality(base);
    assert.equal(report.arms.system.knownActualCostMinor, 150, "no-result and partial actual charges count");
    assert.equal(report.arms.system.atRiskCostMinor, 250, "uncertain reservation remains at risk");
    for (const mutate of [
      (input) => { input.arms[0].costs[0].currency = "USD"; },
      (input) => { input.arms[0].costs[0].actualMinor = -1; },
      (input) => { input.arms[0].costs[0].unresolvedReservedMinor = 1; },
      (input) => { input.arms[0].costs[2].unresolvedReservedMinor = 1; },
      (input) => { input.arms[0].costs[1].id = input.arms[0].costs[0].id; },
      (input) => { input.arms[0].costs[0].actualMinor = Number.MAX_SAFE_INTEGER; },
    ]) {
      const input = await fixture(); mutate(input);
      const rejected = await quality.evaluateProspectQuality(input);
      assert.equal(rejected.status, "unavailable");
    }
  } finally { await vite.close(); }
});

test("repository wiring remains pure, synthetic, and runtime-unreachable", async () => {
  const [moduleSource, fixtureSource, protocol, runtimeUrls] = await Promise.all([
    readFile(new URL("../domain/prospect-quality-evaluation.ts", import.meta.url), "utf8"),
    readFile(fixtureUrl, "utf8"),
    readFile(new URL("../../docs/PROSPECT-QUALITY-EVALUATION.md", import.meta.url), "utf8"),
    runtimeSourceUrls(),
  ]);
  assert.doesNotMatch(moduleSource, /^\s*import(?:\s|\()|require\s*\(|D1Database|fetch\(|\.prepare\(|database\./m);
  assert.match(protocol, /synthetic\s+calculation harness only/i);
  assert.match(protocol, /No provider purchase/i);
  assert.doesNotMatch(fixtureSource, /@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|https?:\/\/(?![^\s"]*\.invalid)/i);
  const dependencyReference = /prospect-quality-evaluation/u;
  for (const example of [
    '  import value from "../domain/prospect-quality-evaluation";',
    'const value = import("../domain/prospect-quality-evaluation");',
    'const value = require("../domain/prospect-quality-evaluation");',
  ]) assert.match(example, dependencyReference);
  for (const url of runtimeUrls) assert.doesNotMatch(await readFile(url, "utf8"), dependencyReference, url.pathname);
});
