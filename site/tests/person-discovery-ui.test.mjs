import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const digest = "a".repeat(64);
const page = (items = []) => ({ limit: 5, returned: items.length, hasNext: false, nextCursor: null });
const projection = (overrides = {}) => ({
  capability: "test_composed_only",
  approvedProspects: [{ prospectId: "approved-prospect", prospectRevision: 3, knownPerson: false }],
  people: { runId: "run-current", status: "completed", items: [{ candidateId: "person-suggestion", ordinal: 1, displayName: "Synthetic person", roleTitle: "Operations lead", roleSummary: "Owns site operations", candidateDigest: digest, state: "suggestion_not_contact", eligible: false }], pageInfo: page([{ id: 1 }]) },
  history: { runs: [{ runId: "run-current", prospectId: "approved-prospect", state: "completed", resultDigest: digest }], relevance: [], verificationIntents: [] },
  ...overrides,
});

test("C3 accepts only the bounded C2 projection, keeps suggestions ineligible, and sends closed command bodies", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent", plugins: [{ name: "jsx", enforce: "pre", config: () => ({ esbuild: { jsx: "automatic" } }) }] });
  try {
    const ui = await vite.ssrLoadModule(new URL("../app/prospects/person-discovery-workspace.tsx", import.meta.url).pathname);
    const html = renderToStaticMarkup(React.createElement(ui.PersonDiscoveryWorkspace));
    for (const expected of ["Find suitable people", "aria-live", "person-discovery-heading"]) assert.match(html, new RegExp(expected));
    const parsed = ui.normalizePersonDiscoveryProjection(projection());
    assert.equal(parsed.people.items[0].eligible, false);
    assert.equal(parsed.people.items[0].state, "suggestion_not_contact");
    assert.equal(ui.normalizePersonDiscoveryProjection(projection({ people: { ...projection().people, items: [{ ...projection().people.items[0], eligible: true }] } })), null, "a suggestion can never arrive as eligible");
    assert.equal(ui.normalizePersonDiscoveryProjection(projection({ people: { ...projection().people, items: [{ ...projection().people.items[0], contactId: "forged-contact" }] } })), null, "client projection accepts no Contact identity on a candidate");
    const seen = [];
    await ui.postPersonDiscoveryCommand(async (url, init) => { seen.push({ url, init }); return Response.json({ command: { kind: "accepted", replayed: false } }); }, { action: "start_person_discovery", prospectId: "approved-prospect", expectedProspectRevision: 3, maxCandidates: 20, maxProvenancePerCandidate: 8, idempotencyKey: "idempotency-key" });
    assert.equal(seen[0].url, "/api/contacts/person-discovery");
    assert.deepEqual(JSON.parse(seen[0].init.body), { action: "start_person_discovery", prospectId: "approved-prospect", expectedProspectRevision: 3, maxCandidates: 20, maxProvenancePerCandidate: 8, idempotencyKey: "idempotency-key" });
    assert.equal(seen[0].init.headers["x-prospector-intent"], "person-discovery-mutation");
    const source = await readFile(new URL("../app/prospects/person-discovery-workspace.tsx", import.meta.url), "utf8");
    for (const forbidden of ["Gmail", "telephony", "click-to-call", "exportCsv", "providerKey", "workspaceId"]) assert.equal(source.includes(forbidden), false, `${forbidden} is not a C3 client authority/control`);
    for (const expected of ["Suggested person — not yet a contact", "No match", "Create new person", "Link existing person", "Refresh verification", "aria-live", "No provider call can be made"]) assert.match(source, new RegExp(expected));
  } finally { await vite.close(); }
});

test("C3 paging and stale state keep five-row boundaries and clear review state", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent", plugins: [{ name: "jsx", enforce: "pre", config: () => ({ esbuild: { jsx: "automatic" } }) }] });
  try {
    const ui = await vite.ssrLoadModule(new URL("../app/prospects/person-discovery-workspace.tsx", import.meta.url).pathname);
    for (const count of [0, 5]) assert.ok(ui.normalizePersonDiscoveryProjection(projection({ people: { ...projection().people, items: Array.from({ length: count }, (_, index) => ({ ...projection().people.items[0], candidateId: `candidate-${index}`, ordinal: index + 1 })), pageInfo: page(Array.from({ length: count })) } })), `page of ${count} is bounded`);
    assert.equal(ui.normalizePersonDiscoveryProjection(projection({ people: { ...projection().people, items: Array.from({ length: 6 }, (_, index) => ({ ...projection().people.items[0], candidateId: `candidate-${index}`, ordinal: index + 1 })), pageInfo: { limit: 5, returned: 6, hasNext: true, nextCursor: "a.b" } } })), null, "six returned rows cannot bypass five-row paging");
    assert.match(ui.personDiscoveryUrl("approved-prospect", "a.b"), /prospectId=approved-prospect.*peopleCursor=a.b/);
  } finally { await vite.close(); }
});
