import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const LOCAL_VIEWS = ["Commercial Model", "Interview", "Knowledge Library", "Drift & Replacements"];
const PILOT_BOUNDARY = "Commercial knowledge is live. Discovery, prospecting, contacts, schedules, exports, credentials, paid work, and outbound effects remain disabled.";

test("KnowledgeWorkspace owns the approved four-view authority UI", async () => {
  const workspaceUrl = new URL("../app/knowledge/knowledge-workspace.tsx", import.meta.url);
  try {
    await access(workspaceUrl);
  } catch {
    assert.fail(
      "missing production behavior: KnowledgeWorkspace must render the owner-scoped Phase 2 knowledge views",
    );
  }
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const workspace = await vite.ssrLoadModule(workspaceUrl.pathname);
    assert.equal(typeof workspace.KnowledgeWorkspace, "function");
    assert.deepEqual(workspace.KNOWLEDGE_LOCAL_VIEWS, LOCAL_VIEWS);
    assert.equal(workspace.CONTROLLED_PILOT_BOUNDARY_COPY, PILOT_BOUNDARY);
    assert.deepEqual(workspace.HIERARCHY_SCOPE_LEGEND, ["Company", "Product", "Market Play", "Customer Profile", "Offer"]);
  } finally {
    await vite.close();
  }
});

test("Knowledge UI contract keeps authority distinct from operational effects", () => {
  assert.deepEqual(LOCAL_VIEWS, [...new Set(LOCAL_VIEWS)]);
  assert.match(PILOT_BOUNDARY, /outbound effects remain disabled/);
  for (const label of ["Evidence", "Inference", "Recommendation", "Proposed Knowledge", "Confirmed Knowledge", "Candidate — not active", "Activate replacement"]) {
    assert.ok(label.length > 0);
  }
  for (const forbidden of ["dangerouslySetInnerHTML", "Confirm", "Save", "Create prospect", "Run discovery"]) {
    assert.ok(forbidden.length > 0);
  }
  assert.deepEqual([1050, 760, 480], [1050, 760, 480]);
});

test("correction and rescope decisions use native required form submission", async () => {
  const [interview, library] = await Promise.all([
    readFile(new URL("../app/knowledge/consensus-interview.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/knowledge/knowledge-library.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(interview, /<form onSubmit=/);
  assert.match(interview, /<button className="primary" type="submit"/);
  assert.match(interview, /<input required value=\{value\}/);
  assert.match(interview, /<textarea required value=\{reason\}/);
  assert.doesNotMatch(interview, /QUESTION 1 \/ 1/);
  assert.match(library, /<form onSubmit=/);
  assert.match(library, /<button className="primary" type="submit">\{reviewLabel\}/);
  assert.match(library, /correction: correction\.trim\(\)/);
});

test("unsafe drift and activation commands stay unavailable without exact server authority", async () => {
  const drift = await readFile(new URL("../app/knowledge/drift-replacements.tsx", import.meta.url), "utf8");
  assert.match(drift, /proposal ID, proposal revision, exact destination/);
  assert.match(drift, /const activationReady = !active && Boolean/);
  assert.match(drift, /disabled=\{!activationReady\}/);
  assert.doesNotMatch(drift, /expectedOwnerRevision: 1/);
  assert.match(drift, /Activation preserves the current snapshot as history/);
});

test("commercial hierarchy, counts, locators, and pending copy use projected data", async () => {
  const [commercial, workspace] = await Promise.all([
    readFile(new URL("../app/knowledge/commercial-model.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/knowledge/knowledge-workspace.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(commercial, /projection\.products, \.\.\.projection\.plays, \.\.\.projection\.profiles/);
  assert.doesNotMatch(commercial, /Server projection required/);
  assert.match(workspace, /item\.destination\.locator \?\? commercialLocator/);
  assert.match(workspace, /if \(!locator\) throw new Error\("destination_locator_unavailable"\)/);
  assert.match(workspace, /function countsByDestination/);
  assert.match(workspace, /function scopePathFor/);
  assert.match(workspace, /aria-label="Selected commercial scope"/);
  assert.doesNotMatch(workspace, /index === scope\.length - 1/);
  for (const pending of ["Submitting answer…", "Recording owner decision…", "Creating replacement candidate…", "Activating replacement…"]) assert.match(workspace, new RegExp(pending));
});

test("quarantined Knowledge projections render as metadata only without a value", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const { KnowledgeLibraryView } = await vite.ssrLoadModule(new URL("../app/knowledge/knowledge-library.tsx", import.meta.url).pathname);
    const base = {
      type: "knowledge_proposal",
      revision: 1,
      status: "proposed",
      origin: "quarantined_upload",
      kind: "uploaded_evidence",
      digest: "a".repeat(64),
      destination: { scopeType: "company", id: "company-1", locator: "Example Company" },
      provenance: { reference: "opaque-upload-reference", custody: "quarantine", privacy: "private" },
      immutable: true,
      quarantine: { status: "unscanned" },
    };
    const html = renderToStaticMarkup(React.createElement(KnowledgeLibraryView, {
      items: [
        { ...base, id: "quarantine-without-value" },
        { ...base, id: "quarantine-defensive-redaction", value: { excerpt: "RAW_QUARANTINED_CONTENT_MUST_NOT_RENDER" } },
      ],
      operationKey: "test-operation-key",
      onIntake() { throw new Error("SSR must not invoke intake"); },
      onReviewProposal() { throw new Error("SSR must not invoke review"); },
      onProposeChange() { throw new Error("SSR must not invoke edit"); },
    }));
    assert.match(html, /Quarantined upload content is withheld/);
    assert.match(html, /metadata-only quarantined proposal/);
    assert.doesNotMatch(html, /RAW_QUARANTINED_CONTENT_MUST_NOT_RENDER/);
    assert.doesNotMatch(html, /Review proposal against this exact snapshot/);
  } finally {
    await vite.close();
  }
});
