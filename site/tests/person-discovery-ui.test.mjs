import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { act, create } from "react-test-renderer";
import { createServer } from "vite";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const digest = "a".repeat(64);
const hexDigest = (index) => index.toString(16).padStart(64, "0");
const candidate = (ordinal = 0) => ({ candidateId: `person-suggestion-${ordinal}`, ordinal, displayName: "Synthetic person", roleTitle: "Operations lead", roleSummary: "Owns site operations", candidateDigest: hexDigest(ordinal + 1), provenance: { sourceReference: "Synthetic public listing", excerpt: "Synthetic bounded evidence", retrievedAt: 1700000000000 }, state: "suggestion_not_contact", eligible: false });
const page = (items = []) => ({ limit: 5, returned: items.length, hasNext: false, nextCursor: null });
const run = { runId: "run-current", prospectId: "approved-prospect", state: "completed", resultDigest: digest };
const decision = (kind = "create_new") => ({ decisionId: `decision-${kind}`, runId: "run-current", prospectId: "approved-prospect", decision: kind, candidateId: kind === "no_match" ? null : "person-suggestion-0", contactId: kind === "no_match" ? null : "existing-contact" });
const relevance = { relevanceId: "relevance-current", prospectId: "approved-prospect", contactId: "existing-contact", contactRevision: 4, contactLabel: "Synthetic person · contact_0001", decisionId: "decision-create_new", roleTitle: "Operations lead", current: true, verificationChannels: ["email", "phone"] };
const emptyHistory = () => ({ runs: [], decisions: [], relevance: [], verificationIntents: [], staleTrustedObservations: [] });
const initialProjection = () => ({ capability: "test_composed_only", approvedProspects: [{ prospectId: "approved-prospect", prospectRevision: 3, label: "Approved prospect · ed_prospect1 · reviewed 2026-09-06", knownPerson: false }], linkableContacts: [], people: { runId: null, status: "not_started", items: [], pageInfo: page() }, history: emptyHistory() });
const discoveryProjection = (overrides = {}) => ({
  capability: "test_composed_only",
  approvedProspects: [{ prospectId: "approved-prospect", prospectRevision: 3, label: "Approved prospect · ed_prospect1 · reviewed 2026-09-06", knownPerson: false }],
  linkableContacts: [{ contactId: "existing-contact", contactRevision: 4, label: "Synthetic person · contact_0001" }],
  people: { runId: "run-current", resultDigest: digest, status: "completed", items: [candidate(0)], pageInfo: page([candidate(0)]) },
  history: { runs: [run], decisions: [], relevance: [], verificationIntents: [], staleTrustedObservations: [] },
  ...overrides,
});
const verificationProjection = (overrides = {}) => ({ ...discoveryProjection(), approvedProspects: [{ ...discoveryProjection().approvedProspects[0], knownPerson: true }], history: { runs: [run], decisions: [decision()], relevance: [relevance], verificationIntents: [], staleTrustedObservations: [{ sourceObservationId: "stale-observation", relevanceId: "relevance-current", channel: "email", verifiedAt: 1600000000000, status: "stale" }] }, ...overrides });
async function module() { const vite = await createServer({ configFile: false, logLevel: "silent", plugins: [{ name: "jsx", enforce: "pre", config: () => ({ esbuild: { jsx: "automatic" } }) }] }); const ui = await vite.ssrLoadModule(new URL("../app/prospects/person-discovery-workspace.tsx", import.meta.url).pathname); return { vite, ui }; }
const response = (value, status = 200) => Response.json(value, { status });
async function settle() { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); }); }
function button(root, label) { return root.findAllByType("button").find((node) => node.children.join("") === label && !node.props.disabled); }
function input(root, name) { return root.findAllByType("input").find((node) => node.props.name === name); }
function select(root, label) { return root.findAllByType("select").find((node) => node.props["aria-label"] === label); }
async function mountWorkspace(ui, fetcher, focus = { count: 0 }) { let renderer; await act(async () => { renderer = create(React.createElement(ui.PersonDiscoveryWorkspace, { fetcher, idFactory: (() => { let n = 0; return () => `ui-command-${++n}`; })() }), { createNodeMock(element) { return element.props.role === "status" ? { focus() { focus.count += 1; } } : {}; } }); }); await settle(); return renderer; }
function chooseDecision(root, kind) { const candidateRadio = input(root, "person-candidate"); assert.ok(candidateRadio); act(() => candidateRadio.props.onChange()); const decisionRadio = root.findAllByType("input").find((node) => node.props.name === "person-decision" && node.parent?.children.join("").includes(kind === "create_new" ? "Create new person" : "Link existing person")); assert.ok(decisionRadio); act(() => decisionRadio.props.onChange()); if (kind === "link_existing") { const contact = select(root, "Exact existing Contact"); assert.ok(contact); act(() => contact.props.onChange({ target: { value: "existing-contact" } })); } const confirmation = root.findAllByType("input").find((node) => node.props.type === "checkbox"); assert.ok(confirmation); act(() => confirmation.props.onChange({ target: { checked: true } })); }

test("C3 accepts ordinal zero and bounded safe projection data while rejecting authority widening", async () => {
  const { vite, ui } = await module();
  try {
    const parsed = ui.normalizePersonDiscoveryProjection(discoveryProjection());
    assert.equal(parsed.people.items[0].ordinal, 0, "canonical first candidate ordinal is zero");
    assert.equal(parsed.people.items[0].eligible, false);
    assert.equal(ui.normalizePersonDiscoveryProjection(discoveryProjection({ people: { ...discoveryProjection().people, items: [candidate(20)] } })), null, "ordinal 20 is outside 0..19");
    assert.equal(ui.normalizePersonDiscoveryProjection(discoveryProjection({ people: { ...discoveryProjection().people, items: [{ ...candidate(), eligible: true }] } })), null);
    assert.equal(ui.normalizePersonDiscoveryProjection(discoveryProjection({ people: { ...discoveryProjection().people, items: [{ ...candidate(), contactId: "forged-contact" }] } })), null);
    const html = renderToStaticMarkup(React.createElement(ui.PersonDiscoveryWorkspace));
    for (const expected of ["person-discovery-heading", "aria-live", "Find suitable people", "Approved prospect"]) assert.match(html, new RegExp(expected));
  } finally { await vite.close(); }
});

test("C3 validates exact projection shape, cardinality, identifiers, references, and intent history", async () => {
  const { vite, ui } = await module();
  try {
    assert.ok(ui.normalizePersonDiscoveryProjection(verificationProjection({ history: { ...verificationProjection().history, verificationIntents: [{ intentId: "intent-current", relevanceId: "relevance-current", intent: "initial_verification", channel: "email", sourceObservationId: null, effect: "intent_only" }] } })));
    assert.ok(ui.normalizePersonDiscoveryProjection(initialProjection()));
    for (const state of ["requested", "needs_reconciliation"]) {
      const resultDigest = state === "requested" ? null : digest;
      assert.ok(ui.normalizePersonDiscoveryProjection(discoveryProjection({ people: { runId: "run-current", resultDigest, status: state, items: [], pageInfo: page() }, history: { runs: [{ ...run, state, resultDigest }], decisions: [], relevance: [], verificationIntents: [], staleTrustedObservations: [] } })));
    }
    assert.ok(ui.normalizePersonDiscoveryProjection(discoveryProjection({ people: { runId: null, status: "stale_authority", items: [], pageInfo: page() }, history: emptyHistory() })));
    for (const count of [0, 5]) assert.ok(ui.normalizePersonDiscoveryProjection(discoveryProjection({ people: { ...discoveryProjection().people, items: Array.from({ length: count }, (_, index) => candidate(index)), pageInfo: page(Array.from({ length: count })) } })));
    const malformed = [
      discoveryProjection({ people: { ...discoveryProjection().people, pageInfo: { ...discoveryProjection().people.pageInfo, returned: 0 } } }),
      discoveryProjection({ people: { ...discoveryProjection().people, items: [candidate(0), candidate(0)], pageInfo: page([candidate(0), candidate(0)]) } }),
      discoveryProjection({ people: { ...discoveryProjection().people, items: [candidate(0), { ...candidate(1), ordinal: 0 }], pageInfo: page([candidate(0), candidate(1)]) } }),
      discoveryProjection({ approvedProspects: [discoveryProjection().approvedProspects[0], discoveryProjection().approvedProspects[0]] }),
      discoveryProjection({ approvedProspects: [discoveryProjection().approvedProspects[0], { ...discoveryProjection().approvedProspects[0], prospectId: "second-prospect" }] }),
      discoveryProjection({ linkableContacts: [discoveryProjection().linkableContacts[0], discoveryProjection().linkableContacts[0]] }),
      discoveryProjection({ linkableContacts: [discoveryProjection().linkableContacts[0], { ...discoveryProjection().linkableContacts[0], contactId: "second-contact" }] }),
      verificationProjection({ history: { ...verificationProjection().history, relevance: [relevance, { ...relevance }] } }),
      verificationProjection({ history: { ...verificationProjection().history, verificationIntents: [{ intentId: "intent-bad", relevanceId: "relevance-current", intent: "initial_verification", channel: "email", sourceObservationId: "impossible", effect: "intent_only" }] } }),
      verificationProjection({ history: { ...verificationProjection().history, relevance: [{ ...relevance, current: false }] } }),
      { ...verificationProjection(), unexpected: true },
      discoveryProjection({ people: { ...discoveryProjection().people, items: Array.from({ length: 4 }, (_, index) => candidate(index)), pageInfo: { limit: 5, returned: 4, hasNext: true, nextCursor: "abc.def" } } }),
      discoveryProjection({ people: { runId: null, resultDigest: null, status: "completed", items: [], pageInfo: page() } }),
      discoveryProjection({ people: { runId: "run-current", resultDigest: digest, status: "requested", items: [], pageInfo: page() } }),
      discoveryProjection({ people: { runId: "run-current", resultDigest: null, status: "needs_reconciliation", items: [], pageInfo: page() } }),
      discoveryProjection({ people: { runId: "run-current", resultDigest: null, status: "not_started", items: [], pageInfo: page() } }),
      discoveryProjection({ people: { ...discoveryProjection().people, status: "requested", items: [], pageInfo: page() } }),
    ];
    for (const value of malformed) assert.equal(ui.normalizePersonDiscoveryProjection(value), null);
    const extra = (count, make) => Array.from({ length: count }, (_, index) => make(index));
    const overCap = [
      { ...initialProjection(), approvedProspects: extra(101, (index) => ({ prospectId: `prospect-${index}`, prospectRevision: 1, label: `Approved ${index}`, knownPerson: false })) },
      discoveryProjection({ linkableContacts: extra(21, (index) => ({ contactId: `contact-${index}`, contactRevision: 1, label: `Duplicate name · ${String(index).padStart(12, "0")}` })) }),
      discoveryProjection({ history: { ...discoveryProjection().history, runs: [run, ...extra(50, (index) => ({ runId: `run-${index}`, prospectId: "approved-prospect", state: "completed", resultDigest: hexDigest(index + 1) }))] } }),
      discoveryProjection({ history: { ...discoveryProjection().history, decisions: extra(51, (index) => ({ ...decision(), decisionId: `decision-${index}` })) } }),
      verificationProjection({ history: { ...verificationProjection().history, relevance: extra(51, (index) => ({ ...relevance, relevanceId: `relevance-${index}`, contactId: `contact-${index}`, contactLabel: `Synthetic person · ${String(index).padStart(12, "0")}` })) } }),
      verificationProjection({ history: { ...verificationProjection().history, verificationIntents: extra(51, (index) => ({ intentId: `intent-${index}`, relevanceId: "relevance-current", intent: "initial_verification", channel: "email", sourceObservationId: null, effect: "intent_only" })) } }),
      verificationProjection({ history: { ...verificationProjection().history, staleTrustedObservations: extra(21, (index) => ({ sourceObservationId: `observation-${index}`, relevanceId: "relevance-current", channel: "email", verifiedAt: 1600000000000 + index, status: "stale" })) } }),
    ];
    for (const value of overCap) assert.equal(ui.normalizePersonDiscoveryProjection(value), null);
  } finally { await vite.close(); }
});

test("C3 mounted flow performs actual create, initial phone, and stale email intent clicks", async () => {
  const { vite, ui } = await module();
  try {
    let current = discoveryProjection(); const posts = [];
    const fetcher = async (url, init = {}) => { if (init.method === "POST") { const body = JSON.parse(init.body); posts.push(body); if (body.action === "decide_person_discovery") current = verificationProjection(); return response({ command: { kind: "accepted" } }); } return response(String(url).includes("?") ? current : initialProjection()); };
    const renderer = await mountWorkspace(ui, fetcher); const root = renderer.root;
    chooseDecision(root, "create_new"); const record = button(root, "Record decision"); assert.ok(record); act(() => record.props.onClick()); await settle();
    assert.match(JSON.stringify(renderer.toJSON()), /Current linked Contact/);
    let channel = select(root, "Contact channel"); assert.ok(channel); act(() => channel.props.onChange({ target: { value: "phone" } })); let initial = button(root, "Record initial verification intent"); assert.ok(initial); act(() => initial.props.onClick()); await settle();
    channel = select(root, "Contact channel"); act(() => channel.props.onChange({ target: { value: "email" } })); const refresh = button(root, "Record stale verification refresh"); assert.ok(refresh); act(() => refresh.props.onClick()); await settle();
    assert.deepEqual(posts.map(({ action, decision, intent, channel, sourceObservationId }) => ({ action, decision, intent, channel, sourceObservationId })), [
      { action: "decide_person_discovery", decision: "create_new", intent: undefined, channel: undefined, sourceObservationId: undefined },
      { action: "record_verification_intent", decision: undefined, intent: "initial_verification", channel: "phone", sourceObservationId: null },
      { action: "record_verification_intent", decision: undefined, intent: "stale_refresh", channel: "email", sourceObservationId: "stale-observation" },
    ]);
    for (const sent of posts) for (const forbidden of ["workspaceId", "provider", "config", "candidateDigest", "contactValue", "sourceReference", "budget"]) assert.equal(Object.hasOwn(sent, forbidden), false);
    act(() => renderer.unmount());
  } finally { await vite.close(); }
});

test("C3 mounted link click is exact and a recorded no-match is terminal", async () => {
  const { vite, ui } = await module();
  try {
    const posts = []; const fetcher = async (url, init = {}) => { if (init.method === "POST") { posts.push(JSON.parse(init.body)); return response({ command: { kind: "accepted" } }); } return response(String(url).includes("?") ? discoveryProjection() : initialProjection()); };
    const renderer = await mountWorkspace(ui, fetcher); chooseDecision(renderer.root, "link_existing"); const record = button(renderer.root, "Record decision"); assert.ok(record); act(() => record.props.onClick()); await settle();
    assert.equal(posts.length, 1); assert.deepEqual({ decision: posts[0].decision, candidateId: posts[0].candidateId, existingContactId: posts[0].existingContactId }, { decision: "link_existing", candidateId: "person-suggestion-0", existingContactId: "existing-contact" }); act(() => renderer.unmount());
    let noMatchState = discoveryProjection(); const noMatchPosts = [];
    const noMatchFetcher = async (url, init = {}) => { if (init.method === "POST") { noMatchPosts.push(JSON.parse(init.body)); noMatchState = discoveryProjection({ history: { runs: [run], decisions: [decision("no_match")], relevance: [], verificationIntents: [], staleTrustedObservations: [] } }); return response({ command: { kind: "accepted" } }); } return response(String(url).includes("?") ? noMatchState : initialProjection()); };
    const terminal = await mountWorkspace(ui, noMatchFetcher);
    const noMatchRadio = terminal.root.findAllByType("input").find((node) => node.props.name === "person-decision" && node.parent?.children.join("").includes("No match")); assert.ok(noMatchRadio); act(() => noMatchRadio.props.onChange());
    const noMatchConfirmation = terminal.root.findAllByType("input").find((node) => node.props.type === "checkbox"); assert.ok(noMatchConfirmation); act(() => noMatchConfirmation.props.onChange({ target: { checked: true } }));
    const noMatchRecord = button(terminal.root, "Record decision"); assert.ok(noMatchRecord); act(() => noMatchRecord.props.onClick()); await settle();
    assert.deepEqual({ decision: noMatchPosts[0].decision, candidateId: noMatchPosts[0].candidateId, existingContactId: noMatchPosts[0].existingContactId }, { decision: "no_match", candidateId: null, existingContactId: null });
    const rendered = JSON.stringify(terminal.toJSON()); assert.match(rendered, /Decision recorded/); assert.match(rendered, /terminal result/); assert.equal(button(terminal.root, "Record decision"), undefined); act(() => terminal.unmount());
  } finally { await vite.close(); }
});

test("C3 duplicate business names remain distinguishable and link the exact selected Contact", async () => {
  const { vite, ui } = await module();
  try {
    const duplicateProjection = discoveryProjection({ linkableContacts: [
      { contactId: "existing-contact", contactRevision: 4, label: "Synthetic person · contact_0001" },
      { contactId: "second-contact", contactRevision: 2, label: "Synthetic person · contact_0002" },
    ] });
    const posts = [];
    const fetcher = async (url, init = {}) => { if (init.method === "POST") { posts.push(JSON.parse(init.body)); return response({ command: { kind: "accepted" } }); } return response(String(url).includes("?") ? duplicateProjection : initialProjection()); };
    const renderer = await mountWorkspace(ui, fetcher); const root = renderer.root;
    const candidateRadio = input(root, "person-candidate"); act(() => candidateRadio.props.onChange());
    const linkRadio = root.findAllByType("input").find((node) => node.props.name === "person-decision" && node.parent?.children.join("").includes("Link existing person")); act(() => linkRadio.props.onChange());
    const contacts = select(root, "Exact existing Contact"); assert.deepEqual(contacts.findAllByType("option").slice(1).map((item) => item.children.join("")), ["Synthetic person · contact_0001", "Synthetic person · contact_0002"]); act(() => contacts.props.onChange({ target: { value: "second-contact" } }));
    const confirmation = root.findAllByType("input").find((node) => node.props.type === "checkbox"); act(() => confirmation.props.onChange({ target: { checked: true } }));
    const record = button(root, "Record decision"); act(() => record.props.onClick()); await settle();
    assert.equal(posts[0].existingContactId, "second-contact"); act(() => renderer.unmount());
  } finally { await vite.close(); }
});

test("C3 double Next starts one cursor read and a cursor 409 performs exactly one first-page reset", async () => {
  const { vite, ui } = await module();
  try {
    const items = Array.from({ length: 5 }, (_, index) => candidate(index));
    const firstPage = discoveryProjection({ people: { ...discoveryProjection().people, items, pageInfo: { limit: 5, returned: 5, hasNext: true, nextCursor: "abc.def" } } });
    const urls = []; let resolveCursor;
    const cursorResponse = new Promise((resolve) => { resolveCursor = resolve; });
    const fetcher = async (url) => { urls.push(String(url)); if (String(url).includes("peopleCursor")) return cursorResponse; return response(String(url).includes("?") ? firstPage : initialProjection()); };
    const renderer = await mountWorkspace(ui, fetcher); const next = button(renderer.root, "Next people"); assert.ok(next);
    act(() => { next.props.onClick(); next.props.onClick(); });
    assert.equal(urls.filter((url) => url.includes("peopleCursor")).length, 1, "same-tick Next clicks start one cursor read");
    const firstPagesBefore = urls.filter((url) => url.includes("prospectId") && !url.includes("peopleCursor")).length;
    resolveCursor(response({ error: "people_page_drifted" }, 409)); await settle();
    assert.equal(urls.filter((url) => url.includes("prospectId") && !url.includes("peopleCursor")).length - firstPagesBefore, 1, "cursor drift resets the first page exactly once");
    assert.match(JSON.stringify(renderer.toJSON()), /first page was reloaded/); act(() => renderer.unmount());
  } finally { await vite.close(); }
});

test("C3 pending guard, 409 recovery, lost-response recovery, and focus never retry a mutation", async () => {
  const { vite, ui } = await module();
  try {
    for (const outcome of ["409", "lost", "recovery_non_ok", "recovery_throw"]) {
      let reads = 0, posts = 0, resolvePost; const focus = { count: 0 };
      const pending = new Promise((resolve, reject) => { resolvePost = outcome === "lost" ? () => reject(new Error("lost response")) : () => resolve(response({ error: "conflict" }, 409)); });
      const fetcher = async (url, init = {}) => { if (init.method === "POST") { posts += 1; return pending; } reads += 1; if (reads > 2 && outcome === "recovery_non_ok") return response({ error: "unavailable" }, 503); if (reads > 2 && outcome === "recovery_throw") throw new Error("refresh unavailable"); return response(reads === 1 ? initialProjection() : discoveryProjection()); };
      const renderer = await mountWorkspace(ui, fetcher, focus); chooseDecision(renderer.root, "create_new"); const record = button(renderer.root, "Record decision"); assert.ok(record); act(() => { record.props.onClick(); record.props.onClick(); }); assert.equal(posts, 1, `${outcome}: same-tick double click issues one mutation`); assert.equal(button(renderer.root, "Record decision"), undefined, `${outcome}: pending state disables the action`);
      const readsBeforeRecovery = reads; resolvePost(); await settle(); assert.equal(posts, 1, `${outcome}: uncertain result is never retried`); assert.equal(reads - readsBeforeRecovery, 1, `${outcome}: exactly one authoritative refresh follows the uncertain result`); const rendered = JSON.stringify(renderer.toJSON()); assert.match(rendered, /not retried/); if (outcome.startsWith("recovery_")) assert.match(rendered, /no further request was made/); assert.ok(focus.count > 0); act(() => renderer.unmount());
    }
  } finally { await vite.close(); }
});

test("C3 renders focusable disabled explanations and retains a literal zero-effect surface", async () => {
  const { vite, ui } = await module();
  try {
    const disabled = renderToStaticMarkup(React.createElement(ui.DisabledAction, { id: "why", text: "Choose a current approved prospect first." }, "Find suitable people"));
    assert.match(disabled, /aria-describedby="why"/); assert.match(disabled, /tabindex="0"/);
    const paging = renderToStaticMarkup(React.createElement(ui.PersonPageControls, { info: page([]), canGoBack: false, loading: false, onPrevious() {}, onNext() {} }));
    assert.match(paging, /Suggested people pages/); assert.match(paging, /Previous people/); assert.match(paging, /Next people/);
    const source = await readFile(new URL("../app/prospects/person-discovery-workspace.tsx", import.meta.url), "utf8");
    for (const forbidden of ["Gmail", "telephony", "click-to-call", "exportCsv", "providerKey", "workspaceId"]) assert.equal(source.includes(forbidden), false, `${forbidden} is not an operator control`);
    assert.match(source, /Status was refreshed; it was not retried/);
  } finally { await vite.close(); }
});
