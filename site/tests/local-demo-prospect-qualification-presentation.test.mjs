import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { act, create } from "react-test-renderer";
import react from "@vitejs/plugin-react";
import { createServer } from "vite";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const moduleUrl = new URL("../app/local-demo/presentation/prospect-qualification-review.tsx", import.meta.url);

async function loadPresentation() {
  const vite = await createServer({ configFile: false, logLevel: "silent", plugins: [react()], server: { middlewareMode: true } });
  try {
    return await vite.ssrLoadModule(moduleUrl.pathname);
  } finally {
    await vite.close();
  }
}

const qualification = {
  prospectReference: "fictional-prospect-mining-01",
  profileReference: "fictional-profile-mining-01",
  score: 8,
  outcome: "Passed",
  hardGate: "clear",
  configurationDigest: "fictional-config-digest-01",
  evidence: [{ reference: "fictional-evidence-01", sourceTier: 1, recency: "current", summary: "Fictional operating signal." }],
};

const readiness = {
  uniqueProspectCount: 2,
  eligibleContactPointCount: 1,
  suggestionCount: 1,
  nonContactableCount: 1,
  suppressionState: "clear",
  contactReadiness: "ContactReady",
  verificationState: "fictional_preview_only",
  predecessorProspectReference: "fictional-prospect-mining-01",
  predecessorConfigurationDigest: "fictional-config-digest-01",
};

const approvedReceipt = Object.freeze({
  decision: "approved",
  prospectReference: qualification.prospectReference,
  configurationDigest: qualification.configurationDigest,
});

test("fictional qualification exposes deterministic evidence and local-only review controls", async () => {
  const presentation = await loadPresentation();
  const html = renderToStaticMarkup(React.createElement(presentation.FictionalProspectQualificationReview, { qualification }));
  for (const expected of ["FICTIONAL", "Deterministic score", "8 / 10", "Passed", "fictional-evidence-01", "Current local state: pending."]) assert.match(html, new RegExp(expected));
  assert.equal((html.match(/<button/g) ?? []).length, 3);
  assert.equal((html.match(/disabled=""/g) ?? []).length, 0, "a Passed fictional assessment may only update local reducer state");
  assert.doesNotMatch(html, /contact@|\+1\d{3}|https?:\/\//i);
});

test("fictional review decision stays inside the component reducer", async () => {
  const presentation = await loadPresentation();
  const decisions = [];
  let renderer;
  await act(() => { renderer = create(React.createElement(presentation.FictionalProspectQualificationReview, { qualification, onReviewDecision: (decision) => decisions.push(decision) })); });
  const approve = renderer.root.findAllByType("button").find((button) => button.children.join("") === "Mark fictional review approved");
  assert.ok(approve);
  await act(() => { approve.props.onClick(); });
  const status = renderer.root.findAll((node) => node.props.role === "status").find((node) => node.children.join("").startsWith("Current local state:"));
  assert.equal(status?.children.join(""), "Current local state: approved.");
  assert.deepEqual(decisions, [approvedReceipt], "the local decision is emitted as a bound fictional receipt");
  for (const button of renderer.root.findAllByType("button")) assert.equal(button.props.disabled, true, "a completed local review cannot be repeated");
  await act(() => { renderer.unmount(); });
});

test("ContactReady-shaped preview binds an approved receipt to its immutable predecessor", async () => {
  const presentation = await loadPresentation();
  const html = renderToStaticMarkup(React.createElement(presentation.FictionalContactReadyPreview, { readiness, reviewReceipt: approvedReceipt }));
  for (const expected of ["Unique prospects</dt><dd>2", "Eligible contact points</dt><dd>1", "Contact Suggestions</dt><dd>1", "Non-contactable references</dt><dd>1", "Suppression recheck</dt><dd>clear", "ContactReady-shaped fictional projection only"]) assert.match(html, new RegExp(expected));
  assert.match(html, /<button[^>]*disabled=""[^>]*aria-describedby="[^"]+"/);
  const deniedReceipts = [
    ["missing", undefined],
    ["rejected", { ...approvedReceipt, decision: "rejected" }],
    ["wrong prospect", { ...approvedReceipt, prospectReference: "another-fictional-prospect" }],
    ["wrong digest", { ...approvedReceipt, configurationDigest: "another-fictional-digest" }],
  ];
  for (const [label, reviewReceipt] of deniedReceipts) {
    const denied = renderToStaticMarkup(React.createElement(presentation.FictionalContactReadyPreview, { readiness, reviewReceipt }));
    assert.match(denied, /preview unavailable until its exact predecessor review is approved/, `${label} receipt must fail closed`);
    for (const downstream of ["Unique prospects", "Eligible contact points", "Contact Suggestions", "Non-contactable references", "Suppression recheck", "Fictional contact state", "ContactReady-shaped fictional projection only"]) {
      assert.doesNotMatch(denied, new RegExp(downstream), `${label} receipt must not expose downstream readiness details`);
    }
  }
});

test("incomplete qualification cannot be approved, including by direct handler invocation", async () => {
  const presentation = await loadPresentation();
  const blockedQualification = { ...qualification, hardGate: "blocked" };
  const decisions = [];
  let renderer;
  await act(() => { renderer = create(React.createElement(presentation.FictionalProspectQualificationReview, { qualification: blockedQualification, onReviewDecision: (decision) => decisions.push(decision) })); });
  const approve = renderer.root.findAllByType("button").find((button) => button.children.join("") === "Mark fictional review approved");
  assert.equal(approve?.props.disabled, true, "the same complete predicate disables a hard-gate-blocked qualification");
  await act(() => { approve.props.onClick(); });
  const status = renderer.root.findAll((node) => node.props.role === "status").find((node) => node.children.join("").startsWith("Current local state:"));
  assert.equal(status?.children.join(""), "Current local state: pending.");
  assert.deepEqual(decisions, [], "the handler independently rejects an incomplete qualification");
  await act(() => { renderer.unmount(); });
});

test("malformed fictional values fail closed before any nested dereference and the isolated leaves cannot reach runtime authority", async () => {
  const presentation = await loadPresentation();
  const invalidQualification = { ...qualification, score: 11 };
  const invalidReadiness = { ...readiness, eligibleContactPointCount: 3 };
  assert.match(renderToStaticMarkup(React.createElement(presentation.FictionalProspectQualificationReview, { qualification: invalidQualification })), /projection unavailable/);
  assert.match(renderToStaticMarkup(React.createElement(presentation.FictionalContactReadyPreview, { readiness: invalidReadiness, reviewReceipt: approvedReceipt })), /preview unavailable/);
  for (const malformedQualification of [null, { ...qualification, evidence: null }, { ...qualification, outcome: "Passed", extra: true }, { ...qualification, evidence: [{ ...qualification.evidence[0], sourceTier: 4 }] }]) {
    assert.doesNotThrow(() => renderToStaticMarkup(React.createElement(presentation.FictionalProspectQualificationReview, { qualification: malformedQualification })));
    assert.match(renderToStaticMarkup(React.createElement(presentation.FictionalProspectQualificationReview, { qualification: malformedQualification })), /projection unavailable/);
  }
  for (const malformedReadiness of [null, { ...readiness, suppressionState: "unknown" }, { ...readiness, predecessorConfigurationDigest: "" }, { ...readiness, extra: true }]) {
    assert.doesNotThrow(() => renderToStaticMarkup(React.createElement(presentation.FictionalContactReadyPreview, { readiness: malformedReadiness, reviewReceipt: approvedReceipt })));
    assert.match(renderToStaticMarkup(React.createElement(presentation.FictionalContactReadyPreview, { readiness: malformedReadiness, reviewReceipt: approvedReceipt })), /preview unavailable/);
  }
  const revokedQualification = Proxy.revocable(qualification, {});
  revokedQualification.revoke();
  assert.doesNotThrow(() => renderToStaticMarkup(React.createElement(presentation.FictionalProspectQualificationReview, { qualification: revokedQualification.proxy })));
  assert.match(renderToStaticMarkup(React.createElement(presentation.FictionalProspectQualificationReview, { qualification: revokedQualification.proxy })), /projection unavailable/);
  const source = await readFile(moduleUrl, "utf8");
  for (const forbidden of [/\bfetch\s*\(/, /localStorage/, /sessionStorage/, /indexedDB/, /document\./, /window\./, /\/api\//, /from\s+["'][^"']*(?:domain|adapter|preparation)[^"']*["']/]) {
    assert.doesNotMatch(source, forbidden, `presentation module must remain transport-free: ${forbidden}`);
  }
  assert.doesNotMatch(source, /id="fictional-(?:qualification-title|contact-ready-title|contact-action-reason)"/, "multiple mounted leaves must not reuse hard-coded IDs");
});

test("presentation leaves remain unreachable from the current local-demo screen and route", async () => {
  const [screen, route] = await Promise.all([
    readFile(new URL("../app/local-demo/_screen.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/local-demo/page.tsx", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(screen, /prospect-qualification-review/);
  assert.doesNotMatch(route, /prospect-qualification-review/);
});
