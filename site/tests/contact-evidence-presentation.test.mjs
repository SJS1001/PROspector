import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createD1Fixture } from "./helpers/d1.mjs";

test("contact evidence renders bounded kind, class, source category, and deterministic UTC time without private details", async () => {
  const fixture = await createD1Fixture("contact-evidence-presentation");
  try {
    const leaves = await fixture.vite.ssrLoadModule(new URL("../app/prospects/contact-leaves.tsx", import.meta.url).pathname);
    const html = renderToStaticMarkup(React.createElement(leaves.ContactsReadFirst, { projection: projection([{ kind: "phone", verificationClass: "source_verified", method: "authoritative_source_reconfirmed", verifiedAt: 1_700_000_000_000 }]) }));
    for (const expected of ["Observation kind", "phone", "Verification class", "source_verified", "Source category", "authoritative_business_source", "2023-11-14T22:13:20.000Z"]) assert.match(html, new RegExp(expected));
    assert.doesNotMatch(html, /authoritative_source_reconfirmed|Verification method/);
    assert.doesNotMatch(html, /private-provider|sourceReference|contact@example|\+1555/i);
  } finally { await fixture.dispose(); }
});

test("malformed or privacy-unsafe projections fail closed without rendering contact values", async () => {
  const fixture = await createD1Fixture("contact-evidence-malformed");
  try {
    const leaves = await fixture.vite.ssrLoadModule(new URL("../app/prospects/contact-leaves.tsx", import.meta.url).pathname);
    const hostile = projection([{ kind: "<script>alert(1)</script>", verificationClass: "forged", method: "x".repeat(65), verifiedAt: Number.MAX_SAFE_INTEGER }], ["contact@example.invalid"]);
    hostile.contactsPage.items[0].contactId = "contact@example.invalid";
    const html = renderToStaticMarkup(React.createElement(leaves.ContactsReadFirst, { projection: hostile }));
    assert.match(html, /Contacts are unavailable until the separate capability gate is proven/);
    assert.doesNotMatch(html, /contact@example|hostile|<script>|alert\(1\)/i);
    assert.equal(leaves.normalizeContactsProjection(null), null);
    assert.equal(leaves.normalizeContactsProjection({}), null);
    for (const field of ["id", "contactId", "prospectId"]) {
      for (const value of ["5550100012", "555-010-0012", "contact@example.invalid", "https://example.invalid/source"]) {
        const candidate = projection([]);
        candidate.contactsPage.items[0][field] = value;
        assert.equal(leaves.normalizeContactsProjection(candidate), null, `${field} fails the exact page closed`);
      }
    }
  } finally { await fixture.dispose(); }
});

function projection(observations, reasonCodes = []) {
  const projectedObservations = observations.map((item) => ({ kind: item.kind, verificationClass: item.verificationClass, sourceCategory: item.method === "mailbox_verification" ? "mailbox_check" : "authoritative_business_source", freshness: "stale", verifiedAt: item.verifiedAt }));
  const row = { id: "row-1", contactId: "opaque-contact", prospectId: "opaque-prospect", state: "NeedsReview", eligible: false, reasonCodes, observations: projectedObservations };
  const empty = { schema: "contacts-page-info/v1", limit: 20, total: 0, returned: 0, hasNext: false, nextCursor: null };
  return { capability: { available: false, status: "blocked", reason: "Blocked." }, contactsPage: { items: [row], pageInfo: { ...empty, total: 1, returned: 1 } }, identityPage: { items: [], pageInfo: empty }, approvedProspects: { items: [], pageInfo: empty }, authority: { stage: "reject_only", grantCreation: "blocked", operation: "blocked", providerCall: false } };
}
