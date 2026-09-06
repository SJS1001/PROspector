import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { act, create } from "react-test-renderer";
import { createServer } from "vite";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const digest = "a".repeat(64);
const candidate = (ordinal = 0) => ({ candidateId: `person-suggestion-${ordinal}`, ordinal, displayName: "Synthetic person", roleTitle: "Operations lead", roleSummary: "Owns site operations", candidateDigest: digest, provenance: { sourceReference: "Synthetic public listing", excerpt: "Synthetic bounded evidence", retrievedAt: 1700000000000 }, state: "suggestion_not_contact", eligible: false });
const page = (items = []) => ({ limit: 5, returned: items.length, hasNext: false, nextCursor: null });
const run = { runId: "run-current", prospectId: "approved-prospect", state: "completed", resultDigest: digest };
const decision = (kind = "create_new") => ({ decisionId: `decision-${kind}`, runId: "run-current", prospectId: "approved-prospect", decision: kind, candidateId: kind === "no_match" ? null : "person-suggestion-0", contactId: kind === "no_match" ? null : "existing-contact" });
const relevance = { relevanceId: "relevance-current", prospectId: "approved-prospect", contactId: "existing-contact", contactRevision: 4, contactLabel: "Synthetic person", decisionId: "decision-create_new", roleTitle: "Operations lead", current: true, verificationChannels: ["email", "phone"] };
const emptyHistory = () => ({ runs: [], decisions: [], relevance: [], verificationIntents: [], staleTrustedObservations: [] });
const initialProjection = () => ({ capability: "test_composed_only", approvedProspects: [{ prospectId: "approved-prospect", prospectRevision: 3, label: "Approved prospect · ed_prospect1 · reviewed 2026-09-06", knownPerson: false }], linkableContacts: [], people: { runId: null, status: "not_started", items: [], pageInfo: page() }, history: emptyHistory() });
const discoveryProjection = (overrides = {}) => ({
  capability: "test_composed_only",
  approvedProspects: [{ prospectId: "approved-prospect", prospectRevision: 3, label: "Approved prospect · ed_prospect1 · reviewed 2026-09-06", knownPerson: false }],
  linkableContacts: [{ contactId: "existing-contact", contactRevision: 4, label: "Synthetic person" }],
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
    for (const count of [0, 5]) assert.ok(ui.normalizePersonDiscoveryProjection(discoveryProjection({ people: { ...discoveryProjection().people, items: Array.from({ length: count }, (_, index) => candidate(index)), pageInfo: page(Array.from({ length: count })) } })));
    const malformed = [
      discoveryProjection({ people: { ...discoveryProjection().people, pageInfo: { ...discoveryProjection().people.pageInfo, returned: 0 } } }),
      discoveryProjection({ people: { ...discoveryProjection().people, items: [candidate(0), candidate(0)], pageInfo: page([candidate(0), candidate(0)]) } }),
      discoveryProjection({ approvedProspects: [discoveryProjection().approvedProspects[0], discoveryProjection().approvedProspects[0]] }),
      discoveryProjection({ linkableContacts: [discoveryProjection().linkableContacts[0], discoveryProjection().linkableContacts[0]] }),
      verificationProjection({ history: { ...verificationProjection().history, relevance: [relevance, { ...relevance }] } }),
      verificationProjection({ history: { ...verificationProjection().history, verificationIntents: [{ intentId: "intent-bad", relevanceId: "relevance-current", intent: "initial_verification", channel: "email", sourceObservationId: "impossible", effect: "intent_only" }] } }),
      verificationProjection({ history: { ...verificationProjection().history, relevance: [{ ...relevance, current: false }] } }),
      { ...verificationProjection(), unexpected: true },
    ];
    for (const value of malformed) assert.equal(ui.normalizePersonDiscoveryProjection(value), null);
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
    const noMatchFetcher = async (url) => response(String(url).includes("?") ? discoveryProjection({ history: { runs: [run], decisions: [decision("no_match")], relevance: [], verificationIntents: [], staleTrustedObservations: [] } }) : initialProjection());
    const terminal = await mountWorkspace(ui, noMatchFetcher); const rendered = JSON.stringify(terminal.toJSON()); assert.match(rendered, /Decision recorded/); assert.match(rendered, /terminal result/); assert.equal(button(terminal.root, "Record decision"), undefined); act(() => terminal.unmount());
  } finally { await vite.close(); }
});

test("C3 pending guard, 409 recovery, lost-response recovery, and focus never retry a mutation", async () => {
  const { vite, ui } = await module();
  try {
    for (const outcome of ["409", "lost"]) {
      let reads = 0, posts = 0, resolvePost; const focus = { count: 0 };
      const pending = new Promise((resolve, reject) => { resolvePost = outcome === "409" ? () => resolve(response({ error: "conflict" }, 409)) : () => reject(new Error("lost response")); });
      const fetcher = async (url, init = {}) => { if (init.method === "POST") { posts += 1; return pending; } reads += 1; return response(reads === 1 ? initialProjection() : discoveryProjection()); };
      const renderer = await mountWorkspace(ui, fetcher, focus); chooseDecision(renderer.root, "create_new"); const record = button(renderer.root, "Record decision"); assert.ok(record); act(() => { record.props.onClick(); record.props.onClick(); }); assert.equal(posts, 1, `${outcome}: same-tick double click issues one mutation`); assert.equal(button(renderer.root, "Record decision"), undefined, `${outcome}: pending state disables the action`);
      const readsBeforeRecovery = reads; resolvePost(); await settle(); assert.equal(posts, 1, `${outcome}: uncertain result is never retried`); assert.equal(reads - readsBeforeRecovery, 1, `${outcome}: exactly one authoritative refresh follows the uncertain result`); assert.match(JSON.stringify(renderer.toJSON()), /not retried/); assert.ok(focus.count > 0); act(() => renderer.unmount());
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
