import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import react from "@vitejs/plugin-react";
import { createServer } from "vite";

test("build/source smoke identifies the controlled workbench and removes the starter", async () => {
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
  assert.match(app, /ProspectingWorkspace/);
  assert.doesNotMatch(app, /function ReviewQueue\(|function Prospects\(/);
  assert.doesNotMatch(app, /Connected · advisory|Last run 06:00|Eligible now<\/dt><dd>3 prospects/);
  assert.doesNotMatch(`${page}${app}${layout}${packageJson}`, /codex-preview|react-loading-skeleton|Your site is taking shape/i);
});

test("Prospects and Review Queue compose distinct owner-scoped workflows", async () => {
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
    const projection = {
      authority: "owner",
      profiles: [
        {
          id: "profile-shell",
          name: "Operating sites",
          lifecycle: "ready",
        },
      ],
      readiness: {
        profile: {
          id: "profile-shell",
          revision: 1,
          lifecycle: "ready",
          path: {
            company: { id: "company-shell", name: "Digitalrain" },
            product: { id: "product-shell", name: "ONE" },
            marketPlay: { id: "play-shell", name: "ONE for Mining" },
            profile: { id: "profile-shell", name: "Operating sites" },
          },
        },
        complete: false,
        items: [],
      },
      runs: [],
      evidence: [
        {
          id: "signal-shell",
          source_url: "https://bounded.example/evidence/shell",
          source_tier: 2,
          publisher_identity: "Persisted bounded publisher",
          underlying_origin_identity: "Independent origin",
          independence_group: "independent-shell",
          retrieved_at: 1_780_000_000_000,
          excerpt: "Server-projected evidence, not a shell fixture.",
          run_id: "run-shell",
          submission_id: "submission-shell",
        },
      ],
      assessments: [],
      queue: [
        {
          id: "prospect-shell",
          assessment_id: "assessment-shell",
          revision: 1,
          offer_id: "offer-shell",
          score: 8,
          outcome: "Passed",
          configuration_digest: "a".repeat(64),
          account: {
            id: "account-shell",
            value: "Persisted Account",
          },
          target: {
            id: "target-shell",
            value: "Persisted Target",
          },
        },
      ],
    };
    const prospects = renderToStaticMarkup(
      createElement(ProspectorApp, {
        initialView: "Prospects",
        initialProspectingProjection: projection,
      }),
    );
    const review = renderToStaticMarkup(
      createElement(ProspectorApp, {
        initialView: "Review Queue",
        initialProspectingProjection: projection,
      }),
    );
    assert.match(prospects, /Profile Readiness and Prospect Workspace/);
    assert.match(review, /Qualified Prospect Review Queue/);
    for (const html of [prospects, review]) {
      assert.match(html, /Customer Profile/);
      assert.match(html, /Operating sites · ready/);
      assert.match(html, /Selected Profile <code>profile-shell/);
      assert.match(html, /Persisted bounded publisher/);
      assert.match(html, /https:\/\/bounded\.example\/evidence\/shell/);
      assert.doesNotMatch(
        html,
        /Fixture candidate · not operationally qualified|A layout preview/,
      );
    }
    assert.doesNotMatch(
      prospects,
      /Persisted Account|Persisted Target|Decision pending/,
      "Prospects keeps the readiness/evidence workspace and does not duplicate the queue",
    );
    assert.match(review, /Persisted Account/);
    assert.match(review, /Persisted Target/);
    assert.ok(
      review.indexOf("Review Queue") < review.indexOf("Validated evidence"),
      "the review workflow must be primary in Review Queue mode",
    );
    assert.ok(
      review.indexOf("Validated evidence") < review.indexOf("Profile Readiness"),
      "supporting evidence and authority follow the review workflow",
    );
  } finally {
    await server.close();
  }
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
