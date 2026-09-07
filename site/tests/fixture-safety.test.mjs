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
    const { ProspectorApp, SignalRow } = await server.ssrLoadModule(
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

    // The workbench ships no fabricated prospect rows, so the per-row Approve
    // and Defer controls are unreachable through it. That is the stronger
    // posture, but it must not silently retire the row-level guarantee: render
    // SignalRow directly so its controls are still proven natively disabled.
    const rowHtml = renderToStaticMarkup(createElement(SignalRow, {
      item: {
        company: "Synthetic Company",
        target: "Synthetic target",
        signal: "Synthetic signal",
        score: 0,
        tier: "Synthetic",
        age: "0d",
        status: "Synthetic",
      },
    }));

    const assertNativelyDisabled = (source, label, where) => {
      const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      assert.match(
        source,
        new RegExp(`<button(?=[^>]*disabled)[^>]*>${escaped}</button>`),
        `${label} must render with the native disabled attribute in ${where}`,
      );
    };

    assert.match(html, /Controlled capability pilot/);
    for (const label of ["Prospecting disabled", "CSV disabled", "Export disabled"]) {
      assertNativelyDisabled(html, label, "the rendered workbench");
    }
    for (const label of ["Approve disabled", "Defer disabled"]) {
      assertNativelyDisabled(rowHtml, label, "a rendered signal row");
    }

    // No sample prospect row may ship in the workbench itself.
    assert.match(html, /No prospects match that search\./);
    assert.doesNotMatch(html, /class="signal-row"/);
    assert.doesNotMatch(html, /Connected · advisory|Last run 06:00/);
  } finally {
    await server.close();
  }
});
