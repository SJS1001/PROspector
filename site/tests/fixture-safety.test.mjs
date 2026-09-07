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
      "status",
      "company-products",
      "market-discovery",
      "review-prospects",
      "prospects",
      "contacts",
    ].map((initialView) =>
      renderToStaticMarkup(createElement(ProspectorApp, { initialView })),
    ).join("\n");

    assert.match(html, /Controlled capability pilot/);
    // Morning Brief and Exports & History (and with them "Prospecting
    // disabled", "Approve disabled", "Defer disabled", "CSV disabled", and
    // "Export disabled") were removed as part of Work Unit D: those tasks have
    // no backing service yet, so they are hidden rather than shown disabled.
    // See the doesNotMatch assertion below for the corresponding fence.
    for (const label of [
      "Enrich contact disabled",
      "Buy credits disabled",
      "Export CRM disabled",
      "Approve package disabled",
      "Send email disabled",
      "Call prospect disabled",
      "Run granted operation",
      "Create grant confirmation",
    ]) {
      const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      assert.match(
        html,
        new RegExp(`<button(?=[^>]*disabled)[^>]*>${escaped}</button>`),
        `${label} must render with the native disabled attribute`,
      );
    }

    assert.doesNotMatch(html, /Connected · advisory|Last run 06:00/);
    assert.doesNotMatch(
      html,
      /Morning Brief|Exports & History|Codex runner|Not connected · fixture mode/,
      "hidden placeholder tasks and the unconnected runner indicator must not render",
    );
  } finally {
    await server.close();
  }
});
