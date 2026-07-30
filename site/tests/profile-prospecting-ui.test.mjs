import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

test("D-01/D-04/D-05 Phase 4 UI is evidence-first, explicit about blocked authority, and exposes no later-phase effect", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    let view;
    try { view = await vite.ssrLoadModule(new URL("../app/prospecting/prospecting-workspace.tsx", import.meta.url).pathname); }
    catch { assert.fail("missing production behavior: the Phase 4 ProspectingWorkspace UI does not exist"); }
    const html = renderToStaticMarkup(React.createElement(view.ProspectingWorkspace, { projection: {
      authority: "blocked", readiness: { status: "missing" }, configuration: null, evidence: [], candidates: [], queue: [],
    } }));
    for (const copy of [
      "This profile is not ready. Confirm the required item before creating a configuration candidate.",
      "No evidence submitted yet",
      "Application-calculated qualification",
      "No qualified prospects to review",
    ]) assert.match(html, new RegExp(copy.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    for (const forbidden of ["Enrich contact", "Buy credits", "Export CRM", "Approve package", "Send email", "Call prospect"]) {
      assert.match(html, new RegExp(`${forbidden}[\\s\\S]{0,160}disabled`, "i"), `${forbidden} must be a native disabled later-phase control`);
    }
    assert.doesNotMatch(html, /dangerouslySetInnerHTML/);
  } finally { await vite.close(); }
});

test("Review Queue renders authoritative Account/Target and completed decision lineage", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const view = await vite.ssrLoadModule(new URL("../app/prospecting/review-queue.tsx", import.meta.url).pathname);
    const html = renderToStaticMarkup(React.createElement(view.ReviewQueue, { busy: false, onCommand() { throw new Error("SSR must not mutate"); }, queue: [{
      id: "prospect-1", assessment_id: "assessment-1", revision: 2, offer_id: "offer-1", score: 8, outcome: "Passed", configuration_digest: "a".repeat(64),
      account: { id: "account-1", value: "Exact Account" }, target: { id: "target-1", value: "Exact Target" }, cooldownState: "reentered",
      decisionHistory: [{ decision: "reject", decision_at: 1_780_000_000_000, owner_subject: "owner-1", audit_event_id: "audit-1" }],
      cooldownHistory: [], reentryHistory: [{ event_kind: "sourced_disproof", created_at: 1_780_200_000_000, prior_prospect_id: "prospect-prior", event_json: '{"assessmentId":"assessment-1","priorProspectId":"prospect-prior","reenteredProspectId":"prospect-1"}' }],
    }] }));
    for (const value of ["Exact Account", "account-1", "Exact Target", "target-1", "Decision: reject", "owner owner-1", "audit audit-1", "sourced_disproof", "prospect-prior", "reentered", "Decision and re-entry lineage"]) assert.match(html, new RegExp(value));
  } finally { await vite.close(); }
});
