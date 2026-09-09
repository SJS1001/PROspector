import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import react from "@vitejs/plugin-react";
import { createServer } from "vite";

test("the Morning Brief workspace states every unavailable downstream boundary and exposes no action control", async () => {
  const vite = await createServer({
    configFile: false,
    logLevel: "silent",
    plugins: [react()],
    server: { middlewareMode: true },
  });
  try {
    const workspace = await vite.ssrLoadModule(
      new URL("../app/morning-brief/morning-brief-workspace.tsx", import.meta.url).pathname,
    );
    const html = renderToStaticMarkup(React.createElement(workspace.MorningBriefWorkspace, {
      onUnauthorized() {},
    }));
    for (const copy of [
      "READ-ONLY PHASE 4 STATE",
      "All active Company, Product, Market Play, and Profile paths",
      "No run, schedule, or export actions are available",
      "Weekly outcome unavailable",
      "Export and handoff unavailable",
      "Restore unavailable",
    ]) assert.match(html, new RegExp(copy, "i"));
    assert.doesNotMatch(html, /<(button|form|input|select|textarea)\b/i);
  } finally { await vite.close(); }
});

test("the workspace performs one no-store GET with no query, mutation, schedule, run, or export seam", async () => {
  const source = await readFile(
    new URL("../app/morning-brief/morning-brief-workspace.tsx", import.meta.url), "utf8",
  );
  assert.match(source, /fetch\("\/api\/morning-brief",\s*\{/);
  assert.match(source, /method:\s*"GET"/);
  assert.match(source, /cache:\s*"no-store"/);
  assert.doesNotMatch(source, /fetch\("\/api\/morning-brief\?/);
  assert.doesNotMatch(source, /method:\s*"(POST|PUT|PATCH|DELETE)"/);
  assert.doesNotMatch(source, /runProspecting|createSchedule|materializeExport|downloadExport/);
});
