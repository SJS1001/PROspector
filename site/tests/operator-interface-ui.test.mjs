import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { act, create } from "react-test-renderer";
import react from "@vitejs/plugin-react";
import { createServer } from "vite";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const root = new URL("../", import.meta.url);
const source = (path) => readFile(new URL(path, root), "utf8");
const IDENTITY = "aaaaaaaabbbbbbbbccccccccdddddddd";
const OTHER_IDENTITY = "1111111122222222333333334444444";
const TASK_LABELS = ["Status", "Company & products", "Market discovery", "Review prospects", "Prospects", "Contacts"];

async function shell() {
  const vite = await createServer({ configFile: false, logLevel: "silent", plugins: [react()], server: { middlewareMode: true } });
  const app = await vite.ssrLoadModule(new URL("app/prospector-app.tsx", root).pathname);
  return { vite, app };
}
async function routing() {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  return { vite, module: await vite.ssrLoadModule(new URL("app/workspace-view.ts", root).pathname) };
}
async function contextModule() {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  return { vite, module: await vite.ssrLoadModule(new URL("app/operator-context.ts", root).pathname) };
}
function memoryStorage(initial = null) {
  let value = initial;
  return {
    reads: 0,
    getItem() { this.reads += 1; return value; },
    setItem(_key, next) { value = next; },
    removeItem() { value = null; },
    peek: () => value,
  };
}

test("D shows exactly the six real operator tasks and no unsupported affordance", async () => {
  const { vite, app } = await shell();
  try {
    const html = renderToStaticMarkup(React.createElement(app.ProspectorApp, { initialView: "status" }));
    for (const label of TASK_LABELS) assert.match(html, new RegExp(label.replace("&", "&amp;")));
    assert.equal((html.match(/aria-current="page"/g) ?? []).length, 1, "exactly one task is current");
    for (const removed of [
      /Morning brief/i,
      /Exports &amp; History/i,
      /Search prospects/,
      /No live runs/,
      /Codex runner/,
      /fixture mode/,
      /CSV disabled/,
      /Export disabled/,
      /Approve disabled/,
      /Defer disabled/,
      /Prospecting disabled/,
      /Pilot settings/,
    ]) assert.doesNotMatch(html, removed, `${removed} must not remain in the shell`);
    assert.doesNotMatch(html, /<input[^>]*placeholder="Search"/, "the global search affordance is removed");
    const appSource = await source("app/prospector-app.tsx");
    for (const removed of ["MorningBrief", "function Exports(", "SignalRow", "filteredSignals"]) {
      assert.equal(appSource.includes(removed), false, `${removed} must not remain in the shell source`);
    }
  } finally { await vite.close(); }
});

test("D separates stable route IDs from labels and rejects removed or Contacts root views", async () => {
  const { vite, module } = await routing();
  try {
    assert.deepEqual(module.OPERATOR_TASKS.map((task) => task.id), [
      "status", "knowledge", "market-discovery", "review-queue", "prospects", "contacts",
    ]);
    assert.deepEqual(module.OPERATOR_TASKS.map((task) => task.label), TASK_LABELS);
    for (const [parameter, id] of [
      [null, "status"],
      ["knowledge", "knowledge"],
      ["market-discovery", "market-discovery"],
      ["review-queue", "review-queue"],
      ["prospects", "prospects"],
    ]) {
      assert.equal(module.shellTaskFromParam(parameter), id);
      assert.equal(module.shellTaskParam(id), parameter);
    }
    for (const rejected of [
      "contacts", "morning-brief", "exports-history", "", "Knowledge", "../knowledge",
      undefined, ["knowledge"], { view: "knowledge" },
    ]) {
      assert.equal(module.shellTaskFromParam(rejected), "status", `${String(rejected)} is not a root view`);
    }
    assert.equal(module.SHELL_TASKS.some((task) => task.id === "contacts"), false);
    assert.equal(module.operatorTaskHref("contacts"), "/contacts");
    assert.equal(module.operatorTaskHref("knowledge"), "/?view=knowledge");
    assert.equal(module.operatorTaskLabel("knowledge"), "Company & products");
  } finally { await vite.close(); }
});

test("D root rejects ?view=contacts and both entry points admit identically", async () => {
  const [page, contactsPage, admission] = await Promise.all([
    source("app/page.tsx"), source("app/contacts/page.tsx"), source("app/owner-admission.ts"),
  ]);
  for (const entry of [page, contactsPage]) {
    assert.match(entry, /admitOperatorSession/);
    assert.match(entry, /initialAccess=\{session\.admitted \? "authorized" : "unauthorized"\}/);
    assert.match(entry, /identityKey=\{session\.identityKey \?\? ""\}/);
  }
  assert.match(page, /shellTaskFromParam\(requestedView\)/);
  assert.equal(page.includes("activeTask"), false, "the root shell can never render Contacts");
  assert.match(contactsPage, /activeTask="contacts"/);
  assert.match(admission, /admitPilotOwner/);
  assert.match(admission, /catch\s*\{\s*return DENIED/);
  assert.doesNotMatch(admission, /principal\.subject\s*\}/, "the protected subject is never returned to the browser");
});

test("D admission awaits the owner check and fails closed on every rejection", async () => {
  // Regression: the previous root shell called admitPilotOwner() without
  // awaiting it, so the rejected Promise escaped its own try/catch and the page
  // set initialAccess="authorized" for any identity once the local-demo guard
  // held. Contacts already awaited it, so the two entry points disagreed.
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const access = await vite.ssrLoadModule(new URL("domain/pilot-access.ts", root).pathname);
    const pepper = "x".repeat(32);
    await assert.rejects(
      () => access.admitPilotOwner(null, "owner@example.invalid", pepper),
      /Private workspace unavailable/,
      "a missing identity rejects rather than returning",
    );
    await assert.rejects(
      () => access.admitPilotOwner({ email: "outsider@example.invalid", displayName: "Outsider" }, "owner@example.invalid", pepper),
      /Private workspace unavailable/,
      "a non-owner identity rejects rather than returning",
    );
    // The rejection is only fail-closed if the caller awaits it.
    const owner = await access.admitPilotOwner({ email: "owner@example.invalid", displayName: "Owner" }, "owner@example.invalid", pepper);
    assert.equal(typeof owner.subject, "string");
  } finally { await vite.close(); }

  for (const file of ["app/owner-admission.ts", "app/page.tsx", "app/contacts/page.tsx"]) {
    // Import bindings are not call sites; every actual call must be awaited.
    const body = (await source(file)).replace(/^import[\s\S]*?;$/gm, "");
    for (const call of body.matchAll(/admitPilotOwner\s*\(/g)) {
      assert.match(
        body.slice(Math.max(0, call.index - 6), call.index),
        /await\s+$/,
        `${file} must await every admitPilotOwner call so its rejection is caught`,
      );
    }
  }
  const admission = await source("app/owner-admission.ts");
  assert.match(admission, /await admitPilotOwner\(/);
  assert.match(admission, /identityKey: await presentationIdentityKey\(principal\.subject\)/);
  assert.match(admission, /catch\s*\{\s*return DENIED;\s*\}/, "any thrown adapter denies");
  assert.match(admission, /if \(!bindings\.OWNER_SUBJECT_PEPPER \|\| !bindings\.PILOT_OWNER_EMAIL\) return DENIED;/);
  assert.equal(
    (await source("app/page.tsx")).includes("admitPilotOwner"),
    false,
    "the root shell admits only through the shared awaited seam",
  );
});

test("D navigation pushes history, restores back/forward, and moves focus to the task", async () => {
  const { vite, app } = await shell();
  const originalWindow = globalThis.window;
  try {
    const pushed = [];
    const listeners = new Map();
    let href = "https://prospector.test/";
    globalThis.window = {
      location: { get href() { return href; }, get pathname() { return new URL(href).pathname; }, get search() { return new URL(href).search; }, hash: "" },
      history: { pushState(_state, _title, destination) { href = new URL(destination, href).href; pushed.push(destination); } },
      addEventListener: (type, listener) => listeners.set(type, listener),
      removeEventListener: (type) => listeners.delete(type),
      setTimeout: (callback) => { callback(); return 0; },
      clearTimeout: () => {},
      localStorage: memoryStorage(),
    };
    const focused = [];
    let renderer;
    await act(async () => {
      renderer = create(
        React.createElement(app.ProspectorApp, { initialView: "status", identityKey: IDENTITY }),
        { createNodeMock: (element) => element.props.id === "operator-task" ? { focus: () => focused.push("task") } : {} },
      );
    });
    const navButton = (label) => renderer.root.findAllByType("button").find((node) => node.children.join("") === label);
    await act(async () => { navButton("Prospects").props.onClick(); });
    assert.deepEqual(pushed, ["/?view=prospects"]);
    assert.equal(focused.length, 1, "keyboard focus moves to the chosen task exactly once");
    assert.equal(
      renderer.root.findAllByType("button").find((node) => node.props["aria-current"] === "page").children.join(""),
      "Prospects",
    );
    await act(async () => { navButton("Market discovery").props.onClick(); });
    assert.deepEqual(pushed, ["/?view=prospects", "/?view=market-discovery"]);

    href = "https://prospector.test/?view=prospects";
    await act(async () => { listeners.get("popstate")(); });
    assert.equal(
      renderer.root.findAllByType("button").find((node) => node.props["aria-current"] === "page").children.join(""),
      "Prospects",
      "back restores the exact recorded task",
    );
    href = "https://prospector.test/?view=contacts";
    await act(async () => { listeners.get("popstate")(); });
    assert.equal(
      renderer.root.findAllByType("button").find((node) => node.props["aria-current"] === "page").children.join(""),
      "Status",
      "a forged Contacts history entry falls back to Status inside the shell",
    );
    assert.equal(focused.length, 4, "every task change moves focus");
    await act(async () => { renderer.unmount(); });
  } finally {
    globalThis.window = originalWindow;
    await vite.close();
  }
});

test("D operator context is identity-keyed, atomic, and clears descendants", async () => {
  const { vite, module } = await contextModule();
  try {
    const entry = (id, name) => ({ id, name });
    const full = module.setOperatorPath(null, IDENTITY, {
      company: entry("company-1", "Northstar"),
      product: entry("product-1", "Harbor Pulse"),
      marketPlay: entry("play-1", "Port Operations"),
      customerProfile: entry("profile-1", "Bulk Terminal Operators"),
    });
    assert.equal(Object.isFrozen(full), true, "a context is one frozen record");
    assert.deepEqual(module.operatorContextTrail(full).map((step) => step.entry.name), [
      "Northstar", "Harbor Pulse", "Port Operations", "Bulk Terminal Operators",
    ]);

    const changedParent = module.setOperatorScope(full, IDENTITY, "product", entry("product-2", "Second product"));
    assert.equal(changedParent.company.id, "company-1", "an unrelated ancestor is retained");
    assert.equal(changedParent.product.id, "product-2");
    assert.equal(changedParent.marketPlay, null, "a changed parent clears its descendants");
    assert.equal(changedParent.customerProfile, null);
    assert.notEqual(changedParent, full, "the change produces a new whole record");

    const newCompany = module.setOperatorPath(full, IDENTITY, { company: entry("company-2", "Other company") });
    assert.deepEqual(
      [newCompany.company.id, newCompany.product, newCompany.marketPlay, newCompany.customerProfile],
      ["company-2", null, null, null],
    );
    assert.equal(module.isOperatorContextEmpty(module.setOperatorPath(full, IDENTITY, null)), true, "a lost path clears the context");

    const foreign = module.operatorContextForIdentity(full, OTHER_IDENTITY);
    assert.equal(module.isOperatorContextEmpty(foreign), true, "another identity never sees a recorded context");
    assert.equal(module.isOperatorContextEmpty(module.setOperatorScope(full, OTHER_IDENTITY, "product", entry("p", "P"))), false);
    assert.equal(module.setOperatorScope(full, OTHER_IDENTITY, "product", entry("p", "P")).company, null);

    const storage = memoryStorage();
    module.writeStoredOperatorContext(storage, full);
    assert.equal(module.readStoredOperatorContext(storage, IDENTITY).customerProfile.name, "Bulk Terminal Operators");
    assert.equal(module.isOperatorContextEmpty(module.readStoredOperatorContext(storage, OTHER_IDENTITY)), true);
    assert.equal(storage.peek(), null, "a mismatched identity record is discarded, not reused");
    for (const hostile of ["{", "null", JSON.stringify({ v: 1 }), JSON.stringify({ v: 2, identityKey: IDENTITY }), JSON.stringify({ v: 1, identityKey: "../evil", company: null, product: null, marketPlay: null, customerProfile: null })]) {
      assert.equal(module.isOperatorContextEmpty(module.readStoredOperatorContext(memoryStorage(hostile), IDENTITY)), true, hostile);
    }
    assert.equal(module.isOperatorContextEmpty(module.readStoredOperatorContext(null, IDENTITY)), true);
  } finally { await vite.close(); }
});

test("D disambiguates duplicate labels in plain language and keeps identifiers closed", async () => {
  const { vite, module } = await contextModule();
  try {
    assert.deepEqual(
      module.disambiguateOperatorLabels([
        { id: "a", name: "Operating sites" },
        { id: "b", name: "Operating sites" },
        { id: "c", name: "Greenfield" },
      ]).map((item) => item.label),
      ["Operating sites (1 of 2)", "Operating sites (2 of 2)", "Greenfield"],
    );
    assert.deepEqual(module.disambiguateOperatorLabels([]).length, 0);
  } finally { await vite.close(); }

  const { vite: renderVite } = await shell();
  try {
    const taskState = await renderVite.ssrLoadModule(new URL("app/task-state.tsx", root).pathname);
    const html = renderToStaticMarkup(React.createElement(taskState.TaskState, {
      state: "needs-you",
      summary: "Operating sites (1 of 2) is selected.",
      technical: [{ term: "Profile reference", value: "0198b5c0-0000-7000-8000-000000000001" }, { term: "Profile revision", value: "7" }],
    }));
    assert.match(html, /Needs you/);
    assert.match(html, /<details class="task-state-technical"><summary>Technical details<\/summary>/);
    assert.doesNotMatch(html, /<details[^>]*open/, "technical records stay closed");
    assert.ok(
      html.indexOf("0198b5c0-0000-7000-8000-000000000001") > html.indexOf("<details"),
      "raw identifiers appear only inside the closed technical record",
    );
    assert.match(
      renderToStaticMarkup(React.createElement(taskState.TaskState, { state: "ready", summary: "Ready." })),
      /^<div class="task-state" data-task-state="ready">(?!.*<details)/s,
    );
  } finally { await renderVite.close(); }
});

test("D keeps a skip link, one focusable task region, and 760/480 reflow rules", async () => {
  const { vite, app } = await shell();
  try {
    const html = renderToStaticMarkup(React.createElement(app.ProspectorApp, { initialView: "status" }));
    assert.match(html, /<a class="skip-link" href="#operator-task">Skip to task content<\/a>/);
    assert.match(html, /id="operator-task"[^>]*tabindex="-1"/);
    assert.match(html, /aria-label="Operator tasks"/);
    assert.match(html, /aria-label="Current commercial scope"/);
    assert.ok(html.indexOf("skip-link") < html.indexOf("Primary navigation"), "the skip link precedes the rail");
  } finally { await vite.close(); }

  const styles = await source("app/globals.css");
  assert.match(styles, /\.skip-link:focus-visible \{[^}]*min-height:44px/);
  assert.match(styles, /\.content:focus-visible \{[^}]*outline:2px solid var\(--green\)/);
  assert.match(styles, /\.task-state-technical summary \{[^}]*min-height:44px/);
  const reflow760 = styles.match(/@media \(max-width:760px\) \{ \.operator-context[^\n]*/);
  assert.ok(reflow760, "the 760px reflow adjusts the operator context strip");
  assert.match(reflow760[0], /\.rail nav a \{ min-width:max-content/);
  const reflow480 = styles.match(/@media \(max-width:480px\) \{ \.operator-context[^\n]*/);
  assert.ok(reflow480, "the 480px reflow stacks the operator context strip");
  assert.match(reflow480[0], /\.task-state-technical dl div \{ grid-template-columns:1fr/);
  assert.match(styles, /@media \(max-width:760px\) \{ \.app-shell \{ display:block;/);
});

test("D collapses the whole shell on a post-mount Contacts auth 404 without any recovery fetch", async () => {
  const { vite } = await shell();
  try {
    const contacts = await vite.ssrLoadModule(new URL("app/prospects/contacts-workspace.tsx", root).pathname);
    for (const stage of ["read", "mutation"]) {
      const calls = [];
      let collapses = 0;
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async (url, init = {}) => {
        calls.push({ url: String(url), method: init.method ?? "GET" });
        if (stage === "read") return Response.json({ error: "not_found" }, { status: 404 });
        if (init.method === "POST") return Response.json({ error: "not_found" }, { status: 404 });
        return Response.json({
          capability: { available: true, status: "ready", reason: "Synthetic authority." },
          contactsPage: emptyPage(),
          identityPage: emptyPage(),
          approvedProspects: { items: [{ prospectId: "prospect-approved", prospectRevision: 7 }], pageInfo: { schema: "contacts-page-info/v1", limit: 20, total: 1, returned: 1, hasNext: false, nextCursor: null } },
          authority: { stage: "ready", grantCreation: "available", operation: "requires_grant", providerCall: false },
        });
      };
      try {
        let renderer;
        await act(async () => {
          renderer = create(React.createElement(contacts.ContactsWorkspace, { onAuthUnavailable: () => { collapses += 1; } }));
        });
        await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
        if (stage === "mutation") {
          const select = contactsProspectSelect(renderer);
          await act(async () => { select.props.onChange({ target: { value: "prospect-approved" } }); });
          const checkbox = renderer.root.findAllByType("input").find((node) => node.props.type === "checkbox");
          await act(async () => { checkbox.props.onChange({ target: { checked: true } }); });
          const submit = renderer.root.findAllByType("button").find((node) => node.children.join("") === "Create grant confirmation" && !node.props.disabled);
          assert.ok(submit, "the grant control is available before the denial");
          const before = calls.length;
          await act(async () => { submit.props.onClick(); });
          await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
          assert.equal(calls.slice(before).filter((call) => call.method === "POST").length, 1, "one mutation is attempted");
          assert.equal(calls.slice(before).filter((call) => call.method === "GET").length, 0, "no recovery read follows the denial");
        }
        assert.equal(collapses, 1, `${stage}: the whole shell collapses immediately, exactly once`);
        const settled = calls.length;
        await act(async () => { await new Promise((resolve) => setTimeout(resolve, 5)); });
        assert.equal(calls.length, settled, `${stage}: nothing is fetched after the collapse`);
        await act(async () => { renderer.unmount(); });
      } finally { globalThis.fetch = originalFetch; }
    }
  } finally { await vite.close(); }
});

test("D never auto-retries an uncertain Contacts mutation", async () => {
  const { vite } = await shell();
  try {
    const contacts = await vite.ssrLoadModule(new URL("app/prospects/contacts-workspace.tsx", root).pathname);
    const calls = [];
    let collapses = 0;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, init = {}) => {
      calls.push({ url: String(url), method: init.method ?? "GET" });
      if (init.method === "POST") return Response.json({ error: "unavailable" }, { status: 503 });
      return Response.json({
        capability: { available: true, status: "ready", reason: "Synthetic authority." },
        contactsPage: emptyPage(),
        identityPage: emptyPage(),
        approvedProspects: { items: [{ prospectId: "prospect-approved", prospectRevision: 7 }], pageInfo: { schema: "contacts-page-info/v1", limit: 20, total: 1, returned: 1, hasNext: false, nextCursor: null } },
        authority: { stage: "ready", grantCreation: "available", operation: "requires_grant", providerCall: false },
      });
    };
    try {
      let renderer;
      await act(async () => {
        renderer = create(React.createElement(contacts.ContactsWorkspace, { onAuthUnavailable: () => { collapses += 1; } }));
      });
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
      const select = contactsProspectSelect(renderer);
      await act(async () => { select.props.onChange({ target: { value: "prospect-approved" } }); });
      const checkbox = renderer.root.findAllByType("input").find((node) => node.props.type === "checkbox");
      await act(async () => { checkbox.props.onChange({ target: { checked: true } }); });
      const submit = renderer.root.findAllByType("button").find((node) => node.children.join("") === "Create grant confirmation" && !node.props.disabled);
      const before = calls.length;
      await act(async () => { submit.props.onClick(); submit.props.onClick(); });
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
      const issued = calls.slice(before);
      assert.equal(issued.filter((call) => call.method === "POST").length, 1, "an uncertain mutation is issued once and never retried");
      assert.equal(issued.filter((call) => call.method === "GET").length, 1, "recovery is one safe authoritative read");
      assert.equal(collapses, 0, "a server error is not an admission denial");
      assert.equal(contactsProspectSelect(renderer).props.value, "", "recovery clears the selection");
      assert.equal(
        renderer.root.findAllByType("input").find((node) => node.props.type === "checkbox").props.checked,
        false,
        "explicit confirmation is invalidated, so no silent retry is possible",
      );
      await act(async () => { renderer.unmount(); });
    } finally { globalThis.fetch = originalFetch; }
  } finally { await vite.close(); }
});

/** Person discovery renders its own labelled prospect selector; Stage 1 owns the
 * unlabelled one inside the grant fieldset. */
function contactsProspectSelect(renderer) {
  const select = renderer.root.findAllByType("select").find((node) => !node.props["aria-label"]);
  assert.ok(select, "the Stage 1 approved-prospect selector is rendered");
  return select;
}

function emptyPage() {
  return { items: [], pageInfo: { schema: "contacts-page-info/v1", limit: 20, total: 0, returned: 0, hasNext: false, nextCursor: null } };
}
