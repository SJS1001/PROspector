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
      renderToStaticMarkup(createElement(ContactsWorkspace)),
    ].join("\n");
  } finally {
    await server.close();
  }
}

function buttons(html) {
  return [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].map(([, attributes, inner]) => ({
    attributes,
    label: inner.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim(),
    disabled: /(?:^|\s)disabled(?:=|\s|$)/.test(attributes),
    describedBy: /aria-describedby="/.test(attributes),
  }));
}

test("every shell task renders the capability boundary and no fixture-governed control", async () => {
  const html = await renderSurfaces();

  assert.match(html, /Controlled capability pilot/);
  // The removed views were the only source of fixture-governed synthetic rows in
  // the shell. Nothing may reintroduce one.
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
  assert.doesNotMatch(html, /Connected · advisory|Last run 06:00|fixture mode/);

  const source = await readFile(new URL("../app/prospector-app.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /const signals\b|SignalRow|function MorningBrief\(|function Exports\(/);
  assert.doesNotMatch(source, /Search prospects|No live runs|Codex runner/);
});

test("every remaining consequential control renders natively disabled with a stated reason", async () => {
  const html = await renderSurfaces();
  const rendered = buttons(html);
  assert.ok(rendered.length > 0, "the owner surfaces render controls at all");

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

  // CONSEQUENTIAL is a verb list, so it cannot cover a control whose verb is not
  // on it. "Buy credits disabled" is the live example: a spend-authority control
  // matched by no word above and named by no assertion below, so rendering it
  // enabled passes this file today. Close that by holding every control to its
  // own label: one that tells the operator it is disabled must actually be
  // disabled. This needs no maintenance as controls are added.
  const claimsDisabled = rendered.filter((button) => /\bdisabled$/iu.test(button.label));
  assert.ok(
    claimsDisabled.length >= 2,
    `expected controls labelled disabled to remain under test, saw ${JSON.stringify(rendered.map((item) => item.label))}`,
  );
  for (const button of claimsDisabled) {
    assert.equal(
      button.disabled,
      true,
      `${button.label} claims to be disabled but carries no native disabled attribute`,
    );
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
