import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import test from "node:test";
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
