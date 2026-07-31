import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFile } from "node:fs/promises";
import { applyMigrations, createD1Fixture } from "./helpers/d1.mjs";

const root = new URL("..", import.meta.url);
async function source(path) { return readFile(new URL(path, root), "utf8"); }
async function handler() { const fixture = await createD1Fixture("contacts-handler"); await applyMigrations(fixture.database); const identity = await fixture.vite.ssrLoadModule(new URL("../domain/interview.ts", import.meta.url).pathname); const principal = await identity.principalFromIdentity("owner@example.invalid", "Owner", "contacts-test-pepper-at-least-32-bytes"); await fixture.database.prepare("INSERT INTO workspaces (id,company_name,owner_subject,created_at,updated_at,revision) VALUES ('contacts-owned','Owned',?,?,?,1)").bind(principal.subject, 1_700_000_000_000, 1_700_000_000_000).run(); const loaded = await fixture.vite.ssrLoadModule(new URL("../domain/contacts-handler.ts", import.meta.url).pathname); return { fixture, loaded, principal }; }
function dependencies(overrides = {}) { return { subjectPepper: "contacts-test-pepper-at-least-32-bytes", pilotOwnerEmail: "owner@example.invalid", getIdentity: async () => ({ email: "owner@example.invalid", displayName: "Owner" }), ...overrides }; }
function mutation(body, headers = {}) { return new Request("https://prospector.test/api/contacts", { method: "POST", headers: { origin: "https://prospector.test", "sec-fetch-site": "same-origin", "x-prospector-intent": "contacts-mutation", "content-type": "application/json", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) }); }
async function csrf(module, fixture) { const response = await module.handleContactsGet(new Request("https://prospector.test/api/contacts"), dependencies({ database: fixture.database })); assert.equal(response.status, 200); return response.headers.get("set-cookie").split(";")[0]; }

test("Contacts handler admits owner first and rejects foreign, CSRF, malformed, oversized, and closed-shape requests", async () => {
    const { fixture, loaded } = await handler();
  try {
    const denied = await loaded.handleContactsGet(new Request("https://prospector.test/api/contacts"), dependencies({ database: fixture.database, getIdentity: async () => null }));
    assert.equal(denied.status, 404, "non-owner cannot obtain the Contacts surface");
    const get = await loaded.handleContactsGet(new Request("https://prospector.test/api/contacts"), dependencies({ database: fixture.database }));
    assert.equal(get.status, 200); assert.match(get.headers.get("set-cookie") ?? "", /__Host-prospector-csrf/);
    const foreign = await loaded.handleContactsPost(mutation({}, { origin: "https://foreign.test" }), dependencies({ database: fixture.database }));
    assert.equal(foreign.status, 403); assert.equal((await foreign.json()).error, "foreign_origin");
    const csrfDenied = await loaded.handleContactsPost(mutation({ action: "create_grant_confirmation", prospectId: "synthetic", expectedProspectRevision: 1, idempotencyKey: "a".repeat(20) }), dependencies({ database: fixture.database }));
    assert.equal(csrfDenied.status, 403);
    const malformed = await loaded.handleContactsPost(mutation("{", { cookie: await csrf(loaded, fixture) }), dependencies({ database: fixture.database }));
    assert.equal(malformed.status, 400);
    const oversized = await loaded.handleContactsPost(mutation({}, { "content-length": "4097" }), dependencies({ database: fixture.database }));
    assert.equal(oversized.status, 413);
    const closed = await loaded.handleContactsPost(mutation({ action: "create_grant_confirmation", prospectId: "synthetic", expectedProspectRevision: 1, idempotencyKey: "a".repeat(20), provider: "forged" }, { cookie: await csrf(loaded, fixture) }), dependencies({ database: fixture.database }));
    assert.equal(closed.status, 400);
  } finally { await fixture.dispose(); }
});

test("admitted Contacts confirmation is reject-only and returns no provider authority", async () => {
    const { fixture, loaded } = await handler();
  try {
    const response = await loaded.handleContactsPost(mutation({ action: "create_grant_confirmation", prospectId: "synthetic", expectedProspectRevision: 1, idempotencyKey: "a".repeat(20) }, { cookie: await csrf(loaded, fixture) }), dependencies({ database: fixture.database }));
    assert.equal(response.status, 409); const body = await response.json(); assert.equal(body.error, "contacts_capability_unavailable"); assert.equal(body.projection.authority.providerCall, false);
  } finally { await fixture.dispose(); }
});

test("contact attestation stays non-activatable in D1 preparation while the future reader accepts only an exact tuple", async () => {
  const { fixture, loaded } = await handler();
  try {
    assert.equal(await loaded.contactAttestationActivated(fixture.database, "contacts-owned"), false);
    const gate = {
      capability: "controlled_enrichment",
      authorization_reference: "owner-authorization-reference",
      target_project_deployment: "private-project-deployment",
      reviewed_source_digest: "a".repeat(64),
      migration_identity_status: "exact-0008-applied",
      post_migration_evidence_reference: "post-migration-evidence",
      independent_review_reference: "independent-review",
      deployed_boundary_proof_reference: "deployed-boundary-proof",
    };
    const fields = [
      "capability",
      "authorization_reference",
      "target_project_deployment",
      "reviewed_source_digest",
      "migration_identity_status",
      "post_migration_evidence_reference",
      "independent_review_reference",
      "deployed_boundary_proof_reference",
    ];
    const tuple = fields.map((field) => `${field}=${gate[field]}`).join("\n");
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(tuple));
    const tupleDigest = Array.from(
      new Uint8Array(digest),
      (byte) => byte.toString(16).padStart(2, "0"),
    ).join("");
    await assert.rejects(
      fixture.database.prepare(
        `INSERT INTO phase_activation_gates (
          id,workspace_id,capability,authorization_reference,target_project_deployment,
          reviewed_source_digest,migration_identity_status,post_migration_evidence_reference,
          independent_review_reference,deployed_boundary_proof_reference,tuple_digest,accepted_at,created_at
        ) VALUES ('contacts-controlled-enrichment-gate','contacts-owned',?,?,?,?,?,?,?,?,?,?,?)`,
      ).bind(
        gate.capability,
        gate.authorization_reference,
        gate.target_project_deployment,
        gate.reviewed_source_digest,
        gate.migration_identity_status,
        gate.post_migration_evidence_reference,
        gate.independent_review_reference,
        gate.deployed_boundary_proof_reference,
        tupleDigest,
        1_700_000_000_000,
        1_700_000_000_000,
      ).run(),
      /activation requires a future trusted server authorization anchor/,
    );
    assert.equal(await loaded.contactAttestationActivated(fixture.database, "contacts-owned"), false);
    const futureReadOnlyEvidence = {
      prepare() {
        return {
          bind() {
            return {
              async all() {
                return { results: [{ ...gate, tuple_digest: tupleDigest }] };
              },
            };
          },
        };
      },
    };
    assert.equal(
      await loaded.contactAttestationActivated(futureReadOnlyEvidence, "contacts-owned"),
      true,
      "the reader recognizes exact future hosted evidence but this migration cannot create it",
    );
    assert.equal(
      await loaded.contactAttestationActivated({
        prepare() {
          return {
            bind() {
              return {
                async all() {
                  return { results: [{ ...gate, tuple_digest: "0".repeat(64) }] };
                },
              };
            },
          };
        },
      }, "contacts-owned"),
      false,
      "a changed tuple digest is not activation evidence",
    );
  } finally {
    await fixture.dispose();
  }
});

test("Contacts reader returns owner-scoped persisted identity data and retains the strict stale/drift recheck boundary", async () => {
  const { fixture, loaded, principal } = await handler();
  const now = Date.now(), digest = (character) => character.repeat(64);
  try {
    await fixture.database.batch([
      fixture.database.prepare("INSERT INTO companies (id,workspace_id,created_at,updated_at,revision,name,status) VALUES ('identity-company','contacts-owned',?,?,1,'Identity','active')").bind(now, now),
      fixture.database.prepare("INSERT INTO contacts (id,workspace_id,created_at,updated_at,revision,company_id,identity_digest,display_name) VALUES ('owned-contact-a','contacts-owned',?,?,1,'identity-company',?,'A'),('owned-contact-b','contacts-owned',?,?,1,'identity-company',?,'B')").bind(now, now, digest("a"), now, now, digest("b")),
      fixture.database.prepare("INSERT INTO identity_suggestions (id,workspace_id,owner_subject,subject_kind,kind,revision,candidate_revisions_json,source_lineage_ids_json,retained_identity_lineage_ids_json,retained_aliases_json,retained_suppression_subject_refs_json,proposed_partition_json,suggestion_digest,created_at) VALUES ('owned-identity','contacts-owned',?,'contact','merge',2,'{\"owned-contact-a\":1,\"owned-contact-b\":1}','[\"owned-contact-a\",\"owned-contact-b\"]','[\"owned-contact-a\",\"owned-contact-b\"]','[]','[]',NULL,?,?)").bind(principal.subject, digest("6"), now),
      fixture.database.prepare("INSERT INTO workspaces (id,company_name,owner_subject,created_at,updated_at,revision) VALUES ('contacts-other','Other','other-owner',?,?,1)").bind(now, now),
      fixture.database.prepare("INSERT INTO companies (id,workspace_id,created_at,updated_at,revision,name,status) VALUES ('other-company','contacts-other',?,?,1,'Other','active')").bind(now, now),
      fixture.database.prepare("INSERT INTO contacts (id,workspace_id,created_at,updated_at,revision,company_id,identity_digest,display_name) VALUES ('other-contact-a','contacts-other',?,?,1,'other-company',?,'A'),('other-contact-b','contacts-other',?,?,1,'other-company',?,'B')").bind(now, now, digest("7"), now, now, digest("8")),
      fixture.database.prepare("INSERT INTO identity_suggestions (id,workspace_id,owner_subject,subject_kind,kind,revision,candidate_revisions_json,source_lineage_ids_json,retained_identity_lineage_ids_json,retained_aliases_json,retained_suppression_subject_refs_json,proposed_partition_json,suggestion_digest,created_at) VALUES ('other-identity','contacts-other','other-owner','contact','merge',2,'{\"other-contact-a\":1,\"other-contact-b\":1}','[\"other-contact-a\",\"other-contact-b\"]','[\"other-contact-a\",\"other-contact-b\"]','[]','[]',NULL,?,?)").bind(digest("9"), now),
    ]);
    const response = await loaded.handleContactsGet(new Request("https://prospector.test/api/contacts"), dependencies({ database: fixture.database }));
    assert.equal(response.status, 200); const body = await response.json();
    assert.deepEqual(body.identity[0].candidateRevisions, [{ subjectId: "owned-contact-a", revision: 1 }, { subjectId: "owned-contact-b", revision: 1 }]);
    assert.doesNotMatch(JSON.stringify(body), /other-/);
    assert.doesNotMatch(
      JSON.stringify(body),
      /sourceReference|assignmentId|configurationId|configurationDigest|receiptReservationId|prospectRevision|observationIds|projectedAt|"current"|"digest"|"createdAt"/,
      "the actual GET payload contains no source locator or internal authority metadata",
    );
    const handlerSource = await source("domain/contacts-handler.ts");
    assert.match(handlerSource, /snapshot\.current\.prospectRevision === snapshot\.prospectRevision[\s\S]*contact_lineage_drifted/);
    assert.match(handlerSource, /snapshot\.state === "ContactReady" && freshCandidates\.length === 0[\s\S]*contact_evidence_stale/);
  } finally { await fixture.dispose(); }
});

test("Contacts projection strips source locators and internal authority metadata before browser delivery", async () => {
  const { fixture, loaded } = await handler();
  try {
    const internalObservation = {
      id: "observation-private",
      contactId: "contact-private",
      assignmentId: "assignment-private",
      kind: "phone",
      verificationClass: "source_verified",
      method: "authoritative_source_reconfirmed",
      sourceReference: "private-provider-locator",
      retrievedAt: 1_700_000_000_000,
      observedAt: 1_700_000_000_001,
      verifiedAt: 1_700_000_000_001,
      configurationId: "configuration-private",
      configurationDigest: "a".repeat(64),
      assignmentProspectId: "prospect-private",
      assignmentContactId: "contact-private",
      assignmentConfigurationId: "configuration-private",
      assignmentConfigurationDigest: "a".repeat(64),
      receiptReservationId: "reservation-private",
    };
    const projected = loaded.toPublicContactRow(
      {
        id: "snapshot-public",
        contactId: "contact-private",
        prospectId: "prospect-private",
        configurationId: "configuration-private",
        configurationDigest: "b".repeat(64),
        configurationRevision: 7,
        prospectRevision: 9,
        observationIds: ["observation-private"],
        projectedAt: 1_700_000_000_002,
        current: { private: true },
      },
      "ContactReady",
      true,
      [],
      [internalObservation],
    );
    assert.deepEqual(projected, {
      id: "snapshot-public",
      contactId: "contact-private",
      prospectId: "prospect-private",
      state: "ContactReady",
      eligible: true,
      reasonCodes: [],
      observations: [{
        kind: "phone",
        verificationClass: "source_verified",
        method: "authoritative_source_reconfirmed",
        verifiedAt: 1_700_000_000_001,
      }],
    });
    assert.doesNotMatch(
      JSON.stringify(projected),
      /private-provider-locator|sourceReference|assignment|configuration|reservation|provider|prospectRevision|observationIds|projectedAt|"current"/i,
    );
  } finally {
    await fixture.dispose();
  }
});

test("Contacts UI is reachable through a dedicated owner page, mounts read-first semantics, and keeps explanations unique", async () => {
  const fixture = await createD1Fixture("contacts-ui");
  try {
    const workspace = await fixture.vite.ssrLoadModule(new URL("../app/prospects/contacts-workspace.tsx", import.meta.url).pathname);
    const html = renderToStaticMarkup(React.createElement(workspace.ContactsWorkspace));
    for (const text of ["Eligibility", "Verified contacts", "Contact Suggestions", "Authority and identity", "Stage 1", "Stage 2", "No provider call will be made"]) assert.match(html, new RegExp(text));
    assert.match(html, /aria-live="polite"/); assert.match(html, /contacts-granted-operation-explanation/); assert.equal((html.match(/contacts-granted-operation-explanation/g) ?? []).length, 2, "one unique explanation ID is referenced once and rendered once");
    const page = await source("app/contacts/page.tsx"); assert.match(page, /admitPilotOwner/); assert.match(page, /ContactsWorkspace/);
    let posts = 0;
    const beforeReadiness = await workspace.postContactConfirmation(async () => { posts += 1; return new Response("unexpected"); }, { authorityReady: false, confirmed: true, pending: false, idempotencyKey: "stable-synthetic-key" });
    assert.equal(beforeReadiness, null); assert.equal(posts, 0, "a deferred authoritative GET leaves Stage 1 unable to issue POST");
    const leaves = await fixture.vite.ssrLoadModule(new URL("../app/prospects/contact-leaves.tsx", import.meta.url).pathname);
    const projected = renderToStaticMarkup(React.createElement(leaves.ContactsReadFirst, { projection: {
      capability: { available: false, status: "blocked", reason: "Current capability is blocked." },
      eligibility: [{ id: "eligibility-1", contactId: "contact-1", prospectId: "prospect-1", state: "ContactReady", eligible: true, reasonCodes: [], observations: [{ verificationClass: "mailbox_verified" }] }],
      verifiedContacts: [{ id: "verified-1", contactId: "contact-1", prospectId: "prospect-1", state: "ContactReady", eligible: true, reasonCodes: [], observations: [{ verificationClass: "mailbox_verified" }] }],
      suggestions: [{ id: "suggestion-1", contactId: "contact-2", prospectId: "prospect-2", state: "ContactSuggestion", eligible: false, reasonCodes: ["verification_pending"] }],
      needsReview: [{ id: "review-1", contactId: "contact-3", prospectId: "prospect-3", state: "NeedsReview", eligible: false, reasonCodes: ["contact_evidence_stale"] }],
      identity: [{ id: "identity-1", subjectKind: "contact", kind: "merge", revision: 2, candidateRevisions: [{ subjectId: "contact-1", revision: 1 }, { subjectId: "contact-2", revision: 1 }], sourceLineageIds: ["lineage-1"] }],
      authority: { stage: "reject_only", grantCreation: "blocked", operation: "blocked", providerCall: false },
    } }));
    for (const text of ["contact-1", "mailbox_verified", "contact-2", "verification_pending", "contact-3", "contact_evidence_stale", "2 candidates and 1 lineage record"]) assert.match(projected, new RegExp(text));
  } finally { await fixture.dispose(); }
});

test("Contacts transport gets fresh authority/CSRF before mutation, keeps one intent key pending, and refreshes after 409 or CSRF", async () => {
  const [workspace, leaves, handlerSource, route] = await Promise.all([source("app/prospects/contacts-workspace.tsx"), source("app/prospects/contact-leaves.tsx"), source("domain/contacts-handler.ts"), source("app/api/contacts/route.ts")]);
  assert.match(workspace, /useEffect[\s\S]*then\(refresh\)/); assert.match(workspace, /useState\(\(\) => crypto\.randomUUID\(\)\)/); assert.match(workspace, /setAuthorityReady\(false\)[\s\S]*fetch\("\/api\/contacts"/); assert.match(workspace, /disabled=\{!authorityReady \|\| !confirmed \|\| pending\}/); assert.match(workspace, /response\.status === 409[\s\S]*await refresh\(\)/); assert.match(workspace, /response\.status === 403[\s\S]*await refresh\(\)/);
  assert.match(`${workspace}\n${leaves}`, /data-status/); assert.match(`${workspace}\n${leaves}`, /contacts-granted-operation-explanation/);
  assert.match(handlerSource, /admitPilotOwner[\s\S]*validateSameOriginMutation[\s\S]*consumeCsrfToken/); assert.match(handlerSource, /MAX_CONTACTS_BODY_BYTES/); assert.doesNotMatch(`${handlerSource}\n${route}`, /enrichment-operation|contact-provider-port|provider.*\.enrich/i);
});
