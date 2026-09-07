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
    // "Approve disabled" and "Defer disabled" were retired with the Mining
    // signals fixture in 3320f26; SignalRow is their only render site and it is
    // now unreachable. Do not re-add them without re-seeding that fixture. This
    // follows 7598ba0, which retired "Prospect disabled" the same way.
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

    assert.doesNotMatch(html, /Connected · advisory|Last run 06:00/);
  } finally {
    await server.close();
  }
});
