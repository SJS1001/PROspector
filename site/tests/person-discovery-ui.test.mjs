import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const digest = "a".repeat(64);
const candidate = (ordinal = 0) => ({ candidateId: `person-suggestion-${ordinal}`, ordinal, displayName: "Synthetic person", roleTitle: "Operations lead", roleSummary: "Owns site operations", candidateDigest: digest, provenance: { sourceReference: "Synthetic public listing", excerpt: "Synthetic bounded evidence", retrievedAt: 1700000000000 }, state: "suggestion_not_contact", eligible: false });
const page = (items = []) => ({ limit: 5, returned: items.length, hasNext: false, nextCursor: null });
const projection = (overrides = {}) => ({
  capability: "test_composed_only",
  approvedProspects: [{ prospectId: "approved-prospect", prospectRevision: 3, label: "Approved prospect reviewed 2026-09-06", knownPerson: false }],
  linkableContacts: [{ contactId: "existing-contact", contactRevision: 4, label: "Existing operations owner" }],
  people: { runId: "run-current", resultDigest: digest, status: "completed", items: [candidate(0)], pageInfo: page([candidate(0)]) },
  history: { runs: [{ runId: "run-current", prospectId: "approved-prospect", state: "completed", resultDigest: digest }], relevance: [{ relevanceId: "relevance-current", prospectId: "approved-prospect", contactId: "existing-contact", contactRevision: 4, contactLabel: "Existing operations owner", decisionId: "decision-current", roleTitle: "Operations lead" }], verificationIntents: [], staleTrustedObservations: [{ sourceObservationId: "stale-observation", relevanceId: "relevance-current", channel: "email", verifiedAt: 1600000000000, status: "stale" }] },
  ...overrides,
});
async function module() { const vite = await createServer({ configFile: false, logLevel: "silent", plugins: [{ name: "jsx", enforce: "pre", config: () => ({ esbuild: { jsx: "automatic" } }) }] }); const ui = await vite.ssrLoadModule(new URL("../app/prospects/person-discovery-workspace.tsx", import.meta.url).pathname); return { vite, ui }; }

test("C3 accepts ordinal zero and bounded safe projection data while rejecting authority widening", async () => {
  const { vite, ui } = await module();
  try {
    const parsed = ui.normalizePersonDiscoveryProjection(projection());
    assert.equal(parsed.people.items[0].ordinal, 0, "canonical first candidate ordinal is zero");
    assert.equal(parsed.people.items[0].eligible, false);
    assert.equal(ui.normalizePersonDiscoveryProjection(projection({ people: { ...projection().people, items: [candidate(20)] } })), null, "ordinal 20 is outside 0..19");
    assert.equal(ui.normalizePersonDiscoveryProjection(projection({ people: { ...projection().people, items: [{ ...candidate(), eligible: true }] } })), null);
    assert.equal(ui.normalizePersonDiscoveryProjection(projection({ people: { ...projection().people, items: [{ ...candidate(), contactId: "forged-contact" }] } })), null);
    const html = renderToStaticMarkup(React.createElement(ui.PersonDiscoveryWorkspace));
    for (const expected of ["person-discovery-heading", "aria-live", "Find suitable people", "Approved prospect"]) assert.match(html, new RegExp(expected));
  } finally { await vite.close(); }
});

test("C3 reducer covers explicit decisions, link selection, five-row paging, stale reset, and retained unknown notice", async () => {
  const { vite, ui } = await module();
  try {
    let state = ui.initialPersonDiscoveryUiState;
    for (const event of ["select_candidate", "choose_create", "confirm"]) state = ui.reducePersonDiscoveryUi(state, event);
    assert.equal(state.decision, "create_new"); assert.equal(state.confirmed, true);
    state = ui.reducePersonDiscoveryUi(state, "choose_link"); state = ui.reducePersonDiscoveryUi(state, "select_contact"); state = ui.reducePersonDiscoveryUi(state, "confirm");
    assert.equal(state.decision, "link_existing"); assert.equal(state.contactId, "selected-contact");
    state = ui.reducePersonDiscoveryUi(state, "next"); assert.equal(state.previous.length, 1); state = ui.reducePersonDiscoveryUi(state, "previous"); assert.equal(state.cursor, null);
    state = ui.reducePersonDiscoveryUi(state, "cursor_drift"); assert.deepEqual([state.candidateId, state.contactId, state.decision, state.confirmed, state.cursor], ["", "", "", false, null]); assert.match(state.notice.text, /first page was reloaded/);
    state = ui.reducePersonDiscoveryUi(state, "unknown_result"); state = ui.reducePersonDiscoveryUi(state, "refresh_loaded"); assert.match(state.notice.text, /not retried/, "recovery GET preserves unknown-result warning");
    for (const count of [0, 5]) assert.ok(ui.normalizePersonDiscoveryProjection(projection({ people: { ...projection().people, items: Array.from({ length: count }, (_, index) => candidate(index)), pageInfo: page(Array.from({ length: count })) } })));
    assert.equal(ui.normalizePersonDiscoveryProjection(projection({ people: { ...projection().people, items: Array.from({ length: 6 }, (_, index) => candidate(index)), pageInfo: { limit: 5, returned: 6, hasNext: true, nextCursor: "a.b" } } })), null);
  } finally { await vite.close(); }
});

test("C3 command transport closes bodies and same-tick guards admit only one mutation", async () => {
  const { vite, ui } = await module();
  try {
    const guard = ui.createPersonDiscoveryMutationGuard(); assert.equal(guard.begin(), true); assert.equal(guard.begin(), false); guard.finish(); assert.equal(guard.begin(), true);
    const seen = [];
    const bodies = [
      { action: "start_person_discovery", prospectId: "approved-prospect", expectedProspectRevision: 3, maxCandidates: 20, maxProvenancePerCandidate: 8, idempotencyKey: "start-key" },
      { action: "decide_person_discovery", runId: "run-current", expectedResultDigest: digest, decision: "link_existing", candidateId: "person-suggestion-0", existingContactId: "existing-contact", expectedProspectRevision: 3, idempotencyKey: "decision-key" },
      { action: "record_verification_intent", relevanceId: "relevance-current", intent: "initial_verification", channel: "email", sourceObservationId: null, expectedProspectRevision: 3, expectedContactRevision: 4, idempotencyKey: "verify-key" },
      { action: "record_verification_intent", relevanceId: "relevance-current", intent: "stale_refresh", channel: "email", sourceObservationId: "stale-observation", expectedProspectRevision: 3, expectedContactRevision: 4, idempotencyKey: "refresh-key" },
    ];
    for (const body of bodies) await ui.postPersonDiscoveryCommand(async (url, init) => { seen.push({ url, init }); return Response.json({ command: { kind: "accepted" } }); }, body);
    assert.equal(seen.length, 4); assert.deepEqual(JSON.parse(seen[1].init.body), bodies[1]); assert.deepEqual(JSON.parse(seen[3].init.body), bodies[3]);
    for (const sent of seen) { assert.equal(sent.url, "/api/contacts/person-discovery"); assert.equal(sent.init.headers["x-prospector-intent"], "person-discovery-mutation"); for (const forbidden of ["workspaceId", "provider", "config", "candidateDigest", "contactValue", "sourceReference", "budget"]) assert.equal(Object.hasOwn(JSON.parse(sent.init.body), forbidden), false); }
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
