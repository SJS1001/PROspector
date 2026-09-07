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
    //
    // Consequential controls the governed shell renders today. Each must carry
    // the native disabled attribute, not merely a disabled style.
    const rendered = [
      "Prospecting disabled",
      "CSV disabled",
      "Export disabled",
      // Review Queue and Prospects render the governed prospecting workspace,
      // which replaced the retired synthetic signal-row fixture.
      "Enrich contact disabled",
      "Buy credits disabled",
      "Export CRM disabled",
      "Approve package disabled",
      "Send email disabled",
      "Call prospect disabled",
    ];
    for (const label of rendered) {
      assert.match(
        html,
        new RegExp(`<button(?=[^>]*disabled)[^>]*>${escapeRegExp(label)}</button>`),
        `${label} must render with the native disabled attribute`,
      );
    }

    // The retired signal-row fixture carried these two. Its `signals` source is
    // now empty, so they render nowhere. If either ever returns it must still
    // be natively disabled rather than an enabled decision control.
    for (const label of ["Approve disabled", "Defer disabled"]) {
      for (const [element] of html.matchAll(
        new RegExp(`<button[^>]*>${escapeRegExp(label)}</button>`, "g"),
      )) {
        assert.match(element, /<button(?=[^>]*disabled)/, `${label} must never render enabled`);
      }
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
  } finally {
    await server.close();
  }
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
