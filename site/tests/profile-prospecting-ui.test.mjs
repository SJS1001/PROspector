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
