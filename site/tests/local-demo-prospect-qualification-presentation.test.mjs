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
};

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
  let renderer;
  await act(() => { renderer = create(React.createElement(presentation.FictionalProspectQualificationReview, { qualification })); });
  const approve = renderer.root.findAllByType("button").find((button) => button.children.join("") === "Mark fictional review approved");
  assert.ok(approve);
  await act(() => { approve.props.onClick(); });
  const status = renderer.root.findAll((node) => node.props.role === "status").find((node) => node.children.join("").startsWith("Current local state:"));
  assert.equal(status?.children.join(""), "Current local state: approved.");
  for (const button of renderer.root.findAllByType("button")) assert.equal(button.props.disabled, true, "a completed local review cannot be repeated");
  await act(() => { renderer.unmount(); });
});

test("ContactReady-shaped preview keeps unique prospects, eligible points, suggestions, non-contactable, and suppression distinct", async () => {
  const presentation = await loadPresentation();
  const html = renderToStaticMarkup(React.createElement(presentation.FictionalContactReadyPreview, { readiness, reviewState: "approved" }));
  for (const expected of ["Unique prospects</dt><dd>2", "Eligible contact points</dt><dd>1", "Contact Suggestions</dt><dd>1", "Non-contactable references</dt><dd>1", "Suppression recheck</dt><dd>clear", "ContactReady-shaped fictional projection only"]) assert.match(html, new RegExp(expected));
  assert.match(html, /<button[^>]*disabled=""[^>]*aria-describedby="fictional-contact-action-reason"/);
});

test("malformed fictional values fail closed and the isolated leaves cannot reach runtime authority", async () => {
  const presentation = await loadPresentation();
  const invalidQualification = { ...qualification, score: 11 };
  const invalidReadiness = { ...readiness, eligibleContactPointCount: 3 };
  assert.match(renderToStaticMarkup(React.createElement(presentation.FictionalProspectQualificationReview, { qualification: invalidQualification })), /projection unavailable/);
  assert.match(renderToStaticMarkup(React.createElement(presentation.FictionalContactReadyPreview, { readiness: invalidReadiness, reviewState: "approved" })), /preview unavailable/);
  const source = await readFile(moduleUrl, "utf8");
  for (const forbidden of [/\bfetch\s*\(/, /localStorage/, /sessionStorage/, /indexedDB/, /document\./, /window\./, /\/api\//, /from\s+["'][^"']*(?:domain|adapter|preparation)[^"']*["']/]) {
    assert.doesNotMatch(source, forbidden, `presentation module must remain transport-free: ${forbidden}`);
  }
});

test("presentation leaves remain unreachable from the current local-demo screen and route", async () => {
  const [screen, route] = await Promise.all([
    readFile(new URL("../app/local-demo/_screen.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/local-demo/page.tsx", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(screen, /prospect-qualification-review/);
  assert.doesNotMatch(route, /prospect-qualification-review/);
});
