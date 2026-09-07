import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createServer } from "vite";

const root = new URL("../", import.meta.url);

test("workspace URLs admit only the exact bounded view vocabulary", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const routing = await vite.ssrLoadModule(new URL("../app/workspace-view.ts", import.meta.url).pathname);
    const expected = new Map([
      [null, "status"],
      ["company-products", "company-products"],
      ["market-discovery", "market-discovery"],
      ["review-prospects", "review-prospects"],
      ["prospects", "prospects"],
      ["contacts", "contacts"],
    ]);
    for (const [parameter, id] of expected) {
      assert.equal(routing.workspaceViewFromParam(parameter), id);
      assert.equal(routing.workspaceViewParam(id), parameter);
    }
    // Slugs for services that do not exist yet must not resolve to a live task.
    for (const removed of ["morning-brief", "knowledge", "review-queue", "exports-history"]) {
      assert.equal(routing.workspaceViewFromParam(removed), "status");
    }
    for (const value of [undefined, "", "Company & products", "../company-products", ["company-products"], { view: "company-products" }]) {
      assert.equal(routing.workspaceViewFromParam(value), "status");
    }
    assert.equal(routing.workspaceTaskLabel("company-products"), "Company & products");
    assert.equal(routing.workspaceTaskLabel("market-discovery"), "Market discovery");
    assert.equal(routing.workspaceTaskLabel("review-prospects"), "Review prospects");
    assert.equal(routing.workspaceTaskLabel("contacts"), "Contacts");
  } finally {
    await vite.close();
  }
});

test("workspace navigation is server-seeded, history-aware, and demo-directed to Company & products", async () => {
  const page = await readFile(new URL("app/page.tsx", root), "utf8");
  const app = await readFile(new URL("app/prospector-app.tsx", root), "utf8");
  const demo = await readFile(new URL("app/local-demo/_screen.tsx", root), "utf8");

  assert.match(page, /workspaceViewFromParam\(requestedView\)/);
  // The server seeds the view from the URL, then redirects a blank local-demo
  // workspace to Company & products instead of the default Status landing.
  assert.match(page, /initialView=\{[^}]*\binitialView\b[^}]*\}/);
  assert.match(page, /blankLocalOnboarding && initialView === "status" \? "company-products" : initialView/);
  assert.match(app, /window\.history\.pushState/);
  assert.match(app, /addEventListener\("popstate", restoreView\)/);
  assert.match(app, /aria-current=\{view === item\.id \? "page" : undefined\}/);
  assert.match(demo, /href="\/\?view=company-products"/);
  assert.match(demo, /Open Consensus Knowledge/);
});

test("only real, service-backed tasks are listed and Morning Brief/Exports are absent", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const routing = await vite.ssrLoadModule(new URL("../app/workspace-view.ts", import.meta.url).pathname);
    assert.deepEqual(
      routing.WORKSPACE_VIEWS.map((item) => item.label),
      ["Status", "Company & products", "Market discovery", "Review prospects", "Prospects", "Contacts"],
    );
    assert.ok(!routing.WORKSPACE_VIEWS.some((item) => item.label === "Morning Brief"));
    assert.ok(!routing.WORKSPACE_VIEWS.some((item) => item.label === "Exports & History"));
  } finally {
    await vite.close();
  }
});
