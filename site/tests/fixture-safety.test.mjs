import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import react from "@vitejs/plugin-react";
import { createServer } from "vite";

test("consequential controls across every governed view render natively disabled", async () => {
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
    //
    // Consequential controls the governed shell renders today. Each must
    // carry the native disabled attribute, not merely a disabled style.
    const rendered = [
      "Enrich contact disabled",
      "Buy credits disabled",
      "Export CRM disabled",
      "Approve package disabled",
      "Send email disabled",
      "Call prospect disabled",
      "Run granted operation",
      "Create grant confirmation",
    ];
    for (const label of rendered) {
      assert.match(
        html,
        new RegExp(`<button(?=[^>]*disabled)[^>]*>${escapeRegExp(label)}</button>`),
        `${label} must render with the native disabled attribute`,
      );
    }

    // Any control whose own label tells the operator it is disabled must
    // actually be disabled, so a future control cannot claim the state without
    // holding it.
    for (const [element, attributes, text] of html.matchAll(/<button([^>]*)>([^<]*)<\/button>/gu)) {
      if (!/\bdisabled$/iu.test(text.trim())) continue;
      assert.match(
        attributes,
        /\bdisabled\b/u,
        `${text.trim()} claims to be disabled but ${element} carries no disabled attribute`,
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

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
