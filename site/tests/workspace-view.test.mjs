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
      ["knowledge", "knowledge"],
      ["market-discovery", "market-discovery"],
      ["review-queue", "review-queue"],
      ["prospects", "prospects"],
    ]);
    for (const [parameter, task] of expected) {
      assert.equal(routing.shellTaskFromParam(parameter), task);
      assert.equal(routing.shellTaskParam(task), parameter);
    }
    for (const value of [undefined, "", "contacts", "morning-brief", "exports-history", "Knowledge", "../knowledge", ["knowledge"], { view: "knowledge" }]) {
      assert.equal(routing.shellTaskFromParam(value), "status");
    }
  } finally {
    await vite.close();
  }
});

test("workspace navigation is server-seeded, history-aware, and demo-directed to Knowledge", async () => {
  const page = await readFile(new URL("app/page.tsx", root), "utf8");
  const app = await readFile(new URL("app/prospector-app.tsx", root), "utf8");
  // The demo screen moved out of the route module so the production build can
  // drop the local-demo routes.
  const demo = await readFile(new URL("app/local-demo/_screen.tsx", root), "utf8");

  assert.match(page, /shellTaskFromParam\(requestedView\)/);
  // The server seeds the view from the URL, then redirects a blank local-demo
  // workspace to Company & products instead of the default Status landing.
  assert.match(page, /initialView=\{[^}]*\binitialView\b[^}]*\}/);
  assert.match(page, /blankWorkspace && initialView === "status" \? "knowledge" : initialView/);
  assert.match(app, /window\.history\.pushState/);
  assert.match(app, /addEventListener\("popstate", restoreView\)/);
  assert.match(app, /aria-current=\{current \? "page" : undefined\}/);
  assert.match(demo, /href="\/\?view=knowledge"/);
  assert.match(demo, /Open Consensus Knowledge/);
});
