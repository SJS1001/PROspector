import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

test("build/source smoke identifies the fixture-only workbench and removes the starter", async () => {
  const [page, app, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/prospector-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    access(new URL("../dist/server/index.js", import.meta.url)),
  ]);
  assert.match(page, /ProspectorApp/);
  assert.match(layout, /PROspector — Human-governed GTM/);
  assert.match(app, /Good morning, Steven/);
  assert.match(app, /Consensus Interview/);
  assert.match(app, /Sample export-ready/i);
  assert.match(app, /Controlled capability pilot/);
  assert.match(app, /Prospecting disabled/);
  assert.match(app, /0 live prospects/);
  assert.match(app, /Accept and confirm recommendation/);
  assert.match(app, /Fixture candidate · not operationally qualified/);
  assert.doesNotMatch(app, /Connected · advisory|Last run 06:00|Eligible now<\/dt><dd>3 prospects/);
  assert.doesNotMatch(`${page}${app}${layout}${packageJson}`, /codex-preview|react-loading-skeleton|Your site is taking shape/i);
});
