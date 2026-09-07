import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import react from "@vitejs/plugin-react";
import { createServer } from "vite";

const SHELL_TASKS = ["status", "knowledge", "market-discovery", "review-queue", "prospects"];

/** Words that name a consequential act. A control whose label contains one of
 * these may never render enabled while its service is unproven. */
const CONSEQUENTIAL = [
  "Approve", "Defer", "Reject", "CSV", "Export", "Send", "Call", "Dispatch",
  "Prospecting", "Run granted operation", "Find suitable people", "Run now",
];

async function renderSurfaces() {
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
    const { ContactsWorkspace } = await server.ssrLoadModule(
      new URL("../app/prospects/contacts-workspace.tsx", import.meta.url).pathname,
    );
    return [
      ...SHELL_TASKS.map((initialView) => renderToStaticMarkup(createElement(ProspectorApp, { initialView }))),
      // Contacts has its own admitted route, so it is rendered directly.
      renderToStaticMarkup(createElement(ContactsWorkspace)),
    ].join("\n");
  } finally {
    await server.close();
  }
}

function buttons(html) {
  return [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].map(([element, attributes, inner]) => ({
    element,
    attributes,
    label: inner.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim(),
    disabled: /(?:^|\s)disabled(?:=|\s|$)/.test(attributes),
    describedBy: /aria-describedby="/.test(attributes),
  }));
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

test("consequential controls across every governed view render natively disabled", async () => {
  const html = await renderSurfaces();

  assert.match(html, /Controlled capability pilot/);

  // "Approve disabled" and "Defer disabled" were retired with the Mining
  // signals fixture in 3320f26; SignalRow was their only render site. Work Unit
  // D then retired Morning Brief and Exports & History themselves, so
  // "Prospecting disabled", "CSV disabled", and "Export disabled" left with
  // them. Do not re-add any of them without re-seeding the view that owns them.
  //
  // Consequential controls the governed shell renders today. Each must carry
  // the native disabled attribute, not merely a disabled style.
  const rendered = [
    // Review prospects and Prospects render the governed prospecting workspace,
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

  // The retired fixtures carried these. Their sources are gone, so they render
  // nowhere. If any ever returns it must still be natively disabled rather than
  // an enabled decision control.
  for (const label of ["Approve disabled", "Defer disabled", "Prospecting disabled", "CSV disabled", "Export disabled"]) {
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
});

test("the retired views and their fixture affordances stay out of the shell", async () => {
  const html = await renderSurfaces();

  for (const label of [
    "Prospecting disabled",
    "Approve disabled",
    "Defer disabled",
    "CSV disabled",
    "Export disabled",
    "No live runs",
  ]) {
    assert.doesNotMatch(html, new RegExp(label), `${label} is no longer part of the shell`);
  }
  assert.doesNotMatch(html, /fixture mode/);

  const source = await readFile(new URL("../app/prospector-app.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /const signals\b|SignalRow|MorningBrief|function Exports\(/);
  assert.doesNotMatch(source, /Search prospects|No live runs|Codex runner/);
});

test("every remaining consequential control renders natively disabled with a stated reason", async () => {
  const html = await renderSurfaces();
  const rendered = buttons(html);
  assert.ok(rendered.length > 0, "the owner surfaces render controls at all");

  // Derived from what is actually rendered rather than a fixed label list, so a
  // newly added enabled consequential control fails this.
  const consequential = rendered.filter((button) =>
    CONSEQUENTIAL.some((word) => button.label.includes(word)),
  );
  // Contacts and the later-phase group still carry such controls, so this
  // contract has live subjects and cannot pass vacuously.
  assert.ok(
    consequential.length >= 2,
    `expected consequential controls to remain under test, saw ${JSON.stringify(rendered.map((item) => item.label))}`,
  );
  for (const button of consequential) {
    assert.equal(button.disabled, true, `${button.label} must render with the native disabled attribute`);
  }

  // Controls whose reason is specific to the control itself keep their own
  // programmatic explanation.
  for (const label of ["Run granted operation", "Find suitable people"]) {
    const control = consequential.find((button) => button.label === label);
    assert.ok(control, `${label} must remain covered by the fixture-safety contract`);
    assert.equal(control.describedBy, true, `${label} must name the reason it is unavailable`);
  }

  // The later-phase group states one shared reason beside its disabled controls.
  assert.match(
    html,
    /Later-phase controls<\/h2>[\s\S]*?grant no contact, spend,\s*export, package, message, or call authority\.[\s\S]*?<button type="button" disabled="">Enrich contact disabled<\/button>/,
    "the later-phase group keeps its reason adjacent to its disabled controls",
  );
});
