import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import react from "@vitejs/plugin-react";
import { createServer } from "vite";

test("remaining fixture-governed consequential controls render natively disabled", async () => {
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
    const html = [
      "Morning Brief",
      "Knowledge",
      "Market Discovery",
      "Review Queue",
      "Prospects",
      "Exports & History",
    ].map((initialView) =>
      renderToStaticMarkup(createElement(ProspectorApp, { initialView })),
    ).join("\n");

    assert.match(html, /Controlled capability pilot/);
    for (const label of [
      "Prospecting disabled",
      "CSV disabled",
      "Export disabled",
    ]) {
      const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      assert.match(
        html,
        new RegExp(`<button(?=[^>]*disabled)[^>]*>${escaped}</button>`),
        `${label} must render with the native disabled attribute`,
      );
    }

    // Approve and Defer lived only inside the seeded sample signal rows. The
    // generic onboarding rework (3320f26) emptied that fixture, so no row and
    // therefore no approve/defer control renders at all. That is safer than a
    // disabled one, so assert the absence rather than re-adding a fixture.
    assert.doesNotMatch(html, /Approve disabled|Defer disabled/);

    // The property the disabled labels above stand for, stated directly: no
    // consequential control may render enabled. Every enabled button must be
    // inert navigation or a read-only reload. A new enabled control fails here
    // until it is deliberately added to this list.
    const inertEnabled = new Set([
      "Company setupOwner workspace",
      "01Pilot Status",
      "02Morning Brief",
      "03Knowledge",
      "04Market Discovery",
      "05Review Queue",
      "06Prospects",
      "07Exports & History",
      "Pilot settings →",
      "Open queue →",
      "Continue setup",
      "Load current authority",
    ]);
    const enabledLabels = [...html.matchAll(/<button[^>]*>([\s\S]*?)<\/button>/gu)]
      .filter((match) => !/\sdisabled/u.test(match[0]))
      .map((match) => match[1].replaceAll(/<[^>]*>/gu, "").replaceAll("&amp;", "&").trim());
    assert.ok(enabledLabels.length > 0, "expected the navigation controls to render");
    for (const label of new Set(enabledLabels)) {
      assert.ok(
        inertEnabled.has(label),
        `enabled control ${JSON.stringify(label)} is not a known inert control`,
      );
    }

    assert.doesNotMatch(html, /Connected · advisory|Last run 06:00/);
  } finally {
    await server.close();
  }
});
