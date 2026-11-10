import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createServer } from "vite";

const fixtureUrl = new URL("./fixtures/label-agreement-v1.json", import.meta.url);
const sheetUrl = new URL("../../docs/evaluation/owner-labeling-sheet-template.csv", import.meta.url);

async function load() {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    return { vite, mod: await vite.ssrLoadModule(new URL("../domain/label-agreement.ts", import.meta.url).pathname) };
  } catch (error) {
    await vite.close();
    throw error;
  }
}
async function fixture() { return JSON.parse(await readFile(fixtureUrl, "utf8")); }
async function withModule(run) {
  const { vite, mod } = await load();
  try { return await run(mod); } finally { await vite.close(); }
}

test("baseline synthetic Jev drafts do not clear: exact counts, owner labels stay ground truth", () => withModule(async (mod) => {
  const report = mod.scoreLabelAgreement(await fixture());
  assert.equal(report.evidenceClass, "synthetic_only");
  assert.equal(report.operationalAcceptance, false);
  assert.equal(report.jevLabelsAreGroundTruth, false);
  assert.deepEqual(report.sample, { targets: 32, eligible: 30, adjudicated: 27, ownerUnresolved: 3, excludedSelfLabelled: 2 });
  assert.equal(report.agreement.numerator, 22);
  assert.equal(report.agreement.denominator, 27);
  assert.equal(report.falseRelevantRate.numerator, 2);
  assert.equal(report.falseRelevantRate.denominator, 13);
  assert.equal(report.falseIrrelevantRate.numerator, 1);
  assert.equal(report.abstainRate.numerator, 2);
  assert.deepEqual(report.byStratum.map((s) => [s.stratum, s.agreement.numerator, s.agreement.denominator]),
    [["borderline", 4, 8], ["negative", 8, 9], ["positive", 10, 10]]);
  assert.equal(report.decision.status, "owner_labels_only");
  assert.ok(report.decision.reasons.some((r) => r.includes("agreement below threshold")));
  assert.ok(report.decision.reasons.some((r) => r.includes("false-relevant")));
}));

test("jev clears only when agreement, interval, kappa and false-relevant gates all hold, and stays a draft", () => withModule(async (mod) => {
  const input = await fixture();
  for (const t of input.targets) {
    if (t.owner.label !== "unknown" && t.id !== "t12") t.jev.label = t.owner.label;
  }
  const report = mod.scoreLabelAgreement(input);
  assert.equal(report.agreement.numerator, 26);
  assert.equal(report.decision.status, "jev_may_draft_more_with_spot_checks");
  assert.equal(report.jevLabelsAreGroundTruth, false);
  assert.ok(report.kappa > 0.6);
  assert.ok(report.agreement.wilson95.lower >= 0.7);
}));

test("a small sample cannot clear even with perfect agreement", () => withModule(async (mod) => {
  const input = await fixture();
  input.targets = input.targets.filter((t) => t.stratum !== "positive" || Number(t.id.slice(1)) <= 5 || t.producedByJevPipeline);
  for (const t of input.targets) if (t.owner.label !== "unknown") t.jev.label = t.owner.label;
  const report = mod.scoreLabelAgreement(input);
  assert.equal(report.decision.status, "owner_labels_only");
  assert.ok(report.decision.reasons.some((r) => r.startsWith("adjudicated sample")));
}));

test("targets produced by Jev's own pipeline never enter the agreement sample", () => withModule(async (mod) => {
  const input = await fixture();
  for (const t of input.targets) if (t.producedByJevPipeline) t.jev.label = "irrelevant";
  const report = mod.scoreLabelAgreement(input);
  assert.equal(report.sample.excludedSelfLabelled, 2);
  assert.equal(report.agreement.denominator, 27);
  assert.equal(report.agreement.numerator, 22);
}));

test("owner unknown stays unresolved, never counted as agreement or disagreement", () => withModule(async (mod) => {
  const input = await fixture();
  const before = mod.scoreLabelAgreement(input);
  for (const t of input.targets) if (t.owner.label === "unknown") t.jev.label = "relevant";
  const after = mod.scoreLabelAgreement(input);
  assert.deepEqual(after.agreement, before.agreement);
  assert.equal(after.sample.ownerUnresolved, 3);
}));

test("rejects unblinded owner labels, missing Jev reasons, duplicates and undeclared strata", () => withModule(async (mod) => {
  const bad = async (mutate, pattern) => {
    const input = await fixture();
    mutate(input);
    assert.throws(() => mod.scoreLabelAgreement(input), pattern);
  };
  await bad((i) => { i.targets[0].owner.blindedToJevDraft = false; }, /not blinded/);
  await bad((i) => { i.targets[0].jev.reason = "  "; }, /no reason/);
  await bad((i) => { i.targets[1].id = i.targets[0].id; }, /duplicate/);
  await bad((i) => { i.targets[0].stratum = "other"; }, /undeclared stratum/);
  await bad((i) => { i.targets[0].owner.label = "good"; }, /no valid owner label/);
  await bad((i) => { i.targets[0].jev.label = "unknown"; }, /no valid Jev draft label/);
  await bad((i) => { i.targets = []; }, /no targets/);
}));

test("spot checks retain, revoke, or are insufficient", () => withModule(async (mod) => {
  const { thresholds } = await fixture();
  const rows = (agree, total) => Array.from({ length: total }, (_, i) => ({ id: `s${i}`, ownerLabel: "relevant", blindedToJevDraft: true, producedByJevPipeline: false, jevLabel: i < agree ? "relevant" : "irrelevant" }));
  assert.equal(mod.assessSpotCheck(thresholds, { draftedCount: 50, checked: rows(10, 10) }).status, "retained");
  assert.equal(mod.assessSpotCheck(thresholds, { draftedCount: 50, checked: rows(7, 10) }).status, "revoked");
  assert.equal(mod.assessSpotCheck(thresholds, { draftedCount: 50, checked: rows(5, 5) }).status, "insufficient_spot_check");
  assert.equal(mod.assessSpotCheck(thresholds, { draftedCount: 100, checked: rows(10, 10) }).status, "insufficient_spot_check");
}));

test("thresholds fail closed: missing, NaN, loosened and unknown keys are rejected", () => withModule(async (mod) => {
  const bad = async (mutate, pattern) => {
    const input = await fixture();
    mutate(input);
    assert.throws(() => mod.scoreLabelAgreement(input), pattern);
  };
  await bad((i) => { i.thresholds = {}; }, /thresholds missing/);
  await bad((i) => { delete i.thresholds; }, /thresholds missing/);
  await bad((i) => { delete i.thresholds.minAgreement; }, /minAgreement must be a finite number/);
  await bad((i) => { i.thresholds.minKappa = Number.NaN; }, /minKappa must be a finite number/);
  await bad((i) => { i.thresholds.minAgreement = 0; }, /differs from the pinned/);
  await bad((i) => { i.thresholds.spotCheck.minBatch = 0; }, /differs from the pinned/);
  await bad((i) => { delete i.thresholds.spotCheck.minFraction; }, /minFraction must be a finite number/);
  await bad((i) => { i.thresholds.extra = 1; }, /unknown threshold keys/);
  const report = mod.scoreLabelAgreement(await fixture());
  assert.deepEqual(report.thresholds, mod.LABEL_AGREEMENT_V1_THRESHOLDS);
}));

test("producedByJevPipeline must be an explicit boolean", () => withModule(async (mod) => {
  for (const v of [undefined, "false", null, 0]) {
    const input = await fixture();
    if (v === undefined) delete input.targets[30].producedByJevPipeline; else input.targets[30].producedByJevPipeline = v;
    assert.throws(() => mod.scoreLabelAgreement(input), /producedByJevPipeline must be a boolean/);
  }
}));

test("invalid spot checks are rejected, not retained", () => withModule(async (mod) => {
  const { thresholds } = await fixture();
  const row = (i, o = {}) => ({ id: `s${i}`, ownerLabel: "relevant", jevLabel: "relevant", blindedToJevDraft: true, producedByJevPipeline: false, ...o });
  const rows = (o) => Array.from({ length: 10 }, (_, i) => row(i, o));
  const bad = (batch, pattern) => assert.throws(() => mod.assessSpotCheck(thresholds, batch), pattern);
  bad({ draftedCount: 50, checked: rows({ ownerLabel: "bogus", jevLabel: "bogus" }) }, /no valid owner label/);
  bad({ draftedCount: 50, checked: rows({ jevLabel: "bogus" }) }, /no valid Jev label/);
  bad({ draftedCount: 1, checked: rows() }, /exceed drafted batch size/);
  bad({ draftedCount: 0, checked: [] }, /positive integer/);
  bad({ draftedCount: 50.5, checked: rows() }, /positive integer/);
  bad({ draftedCount: 50, checked: [row(1), row(1)] }, /duplicate id/);
  bad({ draftedCount: 50, checked: rows({ blindedToJevDraft: false }) }, /not blinded/);
  bad({ draftedCount: 50, checked: rows({ producedByJevPipeline: true }) }, /cannot be checked as truth/);
  bad({ draftedCount: 50, checked: rows({ producedByJevPipeline: undefined }) }, /must be a boolean/);
  assert.throws(() => mod.assessSpotCheck({ ...thresholds, spotCheck: { ...thresholds.spotCheck, revokeBelowAgreement: 0 } }, { draftedCount: 50, checked: rows() }), /differs from the pinned/);
  assert.throws(() => mod.assessSpotCheck({}, { draftedCount: 50, checked: rows() }), /thresholds missing/);
}));

test("owner labeling sheet template header matches the module columns and the module does no I/O", async () => {
  const sheet = (await readFile(sheetUrl, "utf8")).split("\n")[0];
  const source = await readFile(new URL("../domain/label-agreement.ts", import.meta.url), "utf8");
  await withModule(async (mod) => assert.equal(sheet, mod.OWNER_LABELING_SHEET_COLUMNS.join(",")));
  assert.doesNotMatch(source, /\bimport\b|\bfetch\(|node:|process\.env/u);
});
