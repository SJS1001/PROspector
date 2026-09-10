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
      ["morning-brief", "morning-brief"],
      ["review-queue", "review-queue"],
      ["prospects", "prospects"],
    ]);
    for (const [parameter, task] of expected) {
      assert.equal(routing.shellTaskFromParam(parameter), task);
      assert.equal(routing.shellTaskParam(task), parameter);
    }
    for (const value of [undefined, "", "contacts", "exports-history", "Knowledge", "../knowledge", ["knowledge"], { view: "knowledge" }]) {
      assert.equal(routing.shellTaskFromParam(value), "status");
    }
  } finally {
    await vite.close();
  }
});

test("workspace navigation is server-seeded, history-aware, and demo-directed to Knowledge", async () => {
  const page = await readFile(new URL("app/page.tsx", root), "utf8");
  const app = await readFile(new URL("app/prospector-app.tsx", root), "utf8");
  // The demo screen moved out of the route module in be6a8c2 so no LOCAL_DEMO
  // markup can reach the production bundle; the route now only guards it. The
  // navigation contract still belongs to the screen, so assert it there.
  const demo = await readFile(new URL("app/local-demo/_screen.tsx", root), "utf8");
  const demoRoute = await readFile(new URL("app/local-demo/page.tsx", root), "utf8");

  assert.match(page, /shellTaskFromParam\(requestedView\)/);
  assert.match(page, /initialView=\{blankWorkspace && initialView === "status" \? "knowledge" : initialView\}/);
  assert.match(app, /window\.history\.pushState/);
  assert.match(app, /addEventListener\("popstate", restoreView\)/);
  assert.match(app, /aria-current=\{current \? "page" : undefined\}/);
  assert.match(demo, /href="\/\?view=knowledge"/);
  assert.match(demo, /Open Consensus Knowledge/);
  assert.match(demo, /Supported Phase 4–7 local journey/);
  // The route itself must stay a development-only boundary that renders nothing
  // in production, so the screen is reachable only behind the folded branch.
  assert.match(demoRoute, /import\.meta\.env\.DEV/u);
  assert.ok(demoRoute.indexOf("await admitLocalDemoPage()") < demoRoute.indexOf("await import(\"./_screen\")"));
  assert.match(demoRoute, /notFound\(\)/u);
});
