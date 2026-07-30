import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import react from "@vitejs/plugin-react";
import { createServer } from "vite";

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
  assert.match(app, /Submit answer for confirmation/);
  assert.match(app, /Confirm submitted answer/);
  assert.match(app, /Start corrected review/);
  assert.match(app, /Applying this policy to scoring and prospecting remains disabled/);
  assert.match(app, /Fixture candidate · not operationally qualified/);
  assert.doesNotMatch(app, /Connected · advisory|Last run 06:00|Eligible now<\/dt><dd>3 prospects/);
  assert.doesNotMatch(`${page}${app}${layout}${packageJson}`, /codex-preview|react-loading-skeleton|Your site is taking shape/i);
});

test("Pilot Status renders the evidence hierarchy and a neutral denial", async () => {
  const server = await createServer({
    configFile: false,
    logLevel: "silent",
    plugins: [react()],
    server: { middlewareMode: true },
  });
  try {
    const { ProspectorApp } = await server.ssrLoadModule(
      new URL("../app/prospector-app.tsx", import.meta.url).pathname,
    );
    const capabilityState = {
      ok: true,
      owner: { admitted: true },
      workspace: { companyName: "Digitalrain" },
      overallStatus: "blocked",
      capabilities: [
        capability("trusted_owner_identity", "Trusted owner identity", "proven"),
        capability("single_workspace_authorization", "Single-workspace authorization", "unproven"),
        capability("d1_durable_persistence", "D1 durable persistence", "proven"),
        capability("r2_object_lifecycle", "R2 write/read/delete durability", "blocked"),
        capability("route_row_object_isolation", "Route, row, and object isolation", "unproven"),
        capability("mutation_protection", "Mutation protection", "proven"),
        capability("secrets_and_audit", "Secrets and audit handling", "unproven"),
        capability("provider_neutral_boundary", "Provider-neutral boundary", "unproven"),
      ],
    };
    const ownerHtml = renderToStaticMarkup(
      createElement(ProspectorApp, {
        initialView: "Pilot Status",
        initialCapabilityState: capabilityState,
      }),
    );
    assert.match(ownerHtml, /Private pilot boundary/);
    assert.match(ownerHtml, /Owner and workspace|Private pilot owner/);
    assert.match(ownerHtml, /Capability evidence/);
    assert.match(ownerHtml, />Proven</);
    assert.match(ownerHtml, />Blocked</);
    assert.match(ownerHtml, />Unproven</);
    assert.match(ownerHtml, /Broader operation remains disabled/);
    assert.match(ownerHtml, /What counts as proof/);

    const deniedHtml = renderToStaticMarkup(
      createElement(ProspectorApp, { initialAccess: "unauthorized" }),
    );
    assert.match(deniedHtml, /Private workspace unavailable/);
    assert.doesNotMatch(
      deniedHtml,
      /Digitalrain|Primary navigation|Capability evidence|audit reference|ONE for Mining/i,
    );
  } finally {
    await server.close();
  }
});

function capability(id, name, status) {
  return {
    id,
    name,
    status,
    reason:
      status === "proven"
        ? "Current accepted evidence demonstrates the complete gate."
        : status === "blocked"
          ? "The required binding is unavailable."
          : "Accepted evidence has not been recorded.",
    unavailableEffects: ["Broader operation"],
    checkedAt: status === "proven" ? Date.now() : undefined,
    evidenceReference: status === "proven" ? `evidence-${id}` : undefined,
  };
}
