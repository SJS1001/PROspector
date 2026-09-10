import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import react from "@vitejs/plugin-react";
import { createServer } from "vite";

const componentUrl = new URL("../app/local-demo/presentation/phase7-operating-preview.tsx", import.meta.url);
const losses = [
  "rejected", "deferred", "enrichment_failed", "enrichment_uncertain", "review_delayed",
  "contact_stale_or_invalid", "package_invalid", "suppressed", "high_risk_drift", "reversal",
];

test("the standalone Phase 7 operating preview presents fixed fictional boundaries in the required order", async () => {
  const vite = await createServer({
    configFile: false,
    logLevel: "silent",
    plugins: [react()],
    server: { middlewareMode: true },
  });
  try {
    const presentation = await vite.ssrLoadModule(componentUrl.pathname);
    const html = renderToStaticMarkup(React.createElement(presentation.Phase7OperatingPreview));
    const orderedLabels = [
      "Morning Brief summary",
      "Toronto Monday-Sunday weekly result",
      "CRM handoff boundary",
      "Portability compatibility preview",
    ];
    let previous = -1;
    for (const label of orderedLabels) {
      const index = html.indexOf(label);
      assert.ok(index > previous, `${label} follows the prior panel`);
      previous = index;
    }
    assert.match(html, /Target<\/dt><dd>7<\/dd>/u);
    assert.match(html, /Unique Export-ready<\/dt><dd>3<\/dd>/u);
    for (const category of losses) assert.match(html, new RegExp(`${category}: 0`, "u"));
    assert.match(html, /Admitted<\/dt><dd>0<\/dd>/u);
    assert.match(html, /Export and download<\/dt><dd>Absent<\/dd>/u);
    assert.match(html, /Referential only: no CSV text or materialization is present\./u);
    assert.match(html, /synthetic_contract_match/u);
    assert.match(html, /restoreAuthority<\/dt><dd>false<\/dd>/u);
    assert.match(html, /operationalAuthority<\/dt><dd>false<\/dd>/u);
    assert.equal((html.match(/Fictional, non-durable, no plan credit, and zero external effects or authority\./gu) ?? []).length, 4);
    assert.doesNotMatch(html, /<(button|form|input|select|textarea|a)\b/iu);
  } finally {
    await vite.close();
  }
});

test("the presentation remains static, synthetic, and disconnected from operating seams", async () => {
  const source = await readFile(componentUrl, "utf8");
  assert.match(source, /synthetic-phase7-operating-preview-v1/u);
  for (const id of ["synthetic-phase7-morning-brief-v1", "synthetic-phase7-weekly-result-v1", "synthetic-phase7-crm-boundary-v1", "synthetic-phase7-portability-v1", "synthetic-handoff-reference-v1"]) assert.match(source, new RegExp(id, "u"));
  assert.doesNotMatch(source, /\b(import|fetch|useEffect|useState|localStorage|sessionStorage|crypto|clipboard|weekly-outcome|crm-csv-codec|local-portable-backup)\b/iu);
  assert.doesNotMatch(source, /\b(email|phone|address|message|provider|credential|file|account_target|contact_value)\b/iu);
  assert.doesNotMatch(source, /<(button|form|input|select|textarea|a)\b/iu);
  assert.doesNotMatch(source, /\b(onClick|onSubmit|onChange|set[A-Z]|async)\b/u);
});
