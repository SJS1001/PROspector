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
      [null, "Pilot Status"],
      ["morning-brief", "Morning Brief"],
      ["knowledge", "Knowledge"],
      ["market-discovery", "Market Discovery"],
      ["review-queue", "Review Queue"],
      ["prospects", "Prospects"],
      ["exports-history", "Exports & History"],
    ]);
    for (const [parameter, view] of expected) {
      assert.equal(routing.workspaceViewFromParam(parameter), view);
      assert.equal(routing.workspaceViewParam(view), parameter);
    }
    for (const value of [undefined, "", "Knowledge", "../knowledge", ["knowledge"], { view: "knowledge" }]) {
      assert.equal(routing.workspaceViewFromParam(value), "Pilot Status");
    }
  } finally {
    await vite.close();
  }
});

test("workspace navigation is server-seeded, history-aware, and demo-directed to Knowledge", async () => {
  const page = await readFile(new URL("app/page.tsx", root), "utf8");
  const app = await readFile(new URL("app/prospector-app.tsx", root), "utf8");
  const demo = await readFile(new URL("app/local-demo/page.tsx", root), "utf8");

  assert.match(page, /workspaceViewFromParam\(requestedView\)/);
  assert.match(page, /initialView=\{initialView\}/);
  assert.match(app, /window\.history\.pushState/);
  assert.match(app, /addEventListener\("popstate", restoreView\)/);
  assert.match(app, /aria-current=\{view === item\.label \? "page" : undefined\}/);
  assert.match(demo, /href="\/\?view=knowledge"/);
  assert.match(demo, /Open Consensus Knowledge/);
});
