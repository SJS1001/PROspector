import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFile } from "node:fs/promises";
import { applyMigrations, createD1Fixture } from "./helpers/d1.mjs";
import { createApprovedProspectLifecycle } from "./helpers/phase5-integration.mjs";

const root = new URL("..", import.meta.url);
async function source(path) { return readFile(new URL(path, root), "utf8"); }
async function handler() { const fixture = await createD1Fixture("contacts-handler"); await applyMigrations(fixture.database); const identity = await fixture.vite.ssrLoadModule(new URL("../domain/interview.ts", import.meta.url).pathname); const principal = await identity.principalFromIdentity("owner@example.invalid", "Owner", "contacts-test-pepper-at-least-32-bytes"); await fixture.database.prepare("INSERT INTO workspaces (id,company_name,owner_subject,created_at,updated_at,revision) VALUES ('contacts-owned','Owned',?,?,?,1)").bind(principal.subject, 1_700_000_000_000, 1_700_000_000_000).run(); const loaded = await fixture.vite.ssrLoadModule(new URL("../domain/contacts-handler.ts", import.meta.url).pathname); return { fixture, loaded, principal }; }
function dependencies(overrides = {}) { return { subjectPepper: "contacts-test-pepper-at-least-32-bytes", pilotOwnerEmail: "owner@example.invalid", getIdentity: async () => ({ email: "owner@example.invalid", displayName: "Owner" }), ...overrides }; }
function mutation(body, overrides = {}) { const headers = new Headers({ origin: "https://prospector.test", "sec-fetch-site": "same-origin", "x-prospector-intent": "contacts-mutation", "content-type": "application/json" }); for (const [name, value] of Object.entries(overrides)) { if (value === null) headers.delete(name); else headers.set(name, value); } return new Request("https://prospector.test/api/contacts", { method: "POST", headers, body: typeof body === "string" ? body : JSON.stringify(body) }); }
async function csrf(module, fixture) { const response = await module.handleContactsGet(new Request("https://prospector.test/api/contacts"), dependencies({ database: fixture.database })); assert.equal(response.status, 200); return response.headers.get("set-cookie").split(";")[0]; }
const COMMANDS = [
  { action: "create_grant_confirmation", prospectId: "prospect-one", expectedProspectRevision: 3, idempotencyKey: "create-key" },
  { action: "run_granted_operation", grantId: "grant-one" },
  { action: "apply_identity_merge", suggestionId: "merge-one", expectedRevision: 2, idempotencyKey: "merge-key", primaryId: "contact-one" },
  { action: "apply_identity_split", suggestionId: "split-one", expectedRevision: 2, idempotencyKey: "split-key" },
];
async function activatedDatabase(database) {
  const row = { capability: "controlled_enrichment", authorization_reference: "synthetic-authorization", target_project_deployment: "synthetic-private-target", reviewed_source_digest: "a".repeat(64), migration_identity_status: "synthetic-exact", post_migration_evidence_reference: "synthetic-post-migration", independent_review_reference: "synthetic-review", deployed_boundary_proof_reference: "synthetic-boundary" };
  const fields = ["capability", "authorization_reference", "target_project_deployment", "reviewed_source_digest", "migration_identity_status", "post_migration_evidence_reference", "independent_review_reference", "deployed_boundary_proof_reference"];
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(fields.map((key) => `${key}=${row[key]}`).join("\n")));
  const tuple_digest = Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return { prepare(sql) { if (String(sql).includes("FROM phase_activation_gates")) return { bind() { return { async all() { return { results: [{ ...row, tuple_digest }] }; } }; } }; return database.prepare(sql); }, batch: database.batch.bind(database), dump: database.dump?.bind(database) };
}

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

test("active Contacts projects an approved prospect before any contact exists and excludes stale authority", async () => {
  const fixture = await createD1Fixture("contacts-approved-prospect-bootstrap");
  try {
    await applyMigrations(fixture.database);
    const lifecycle = await createApprovedProspectLifecycle(fixture);
    const interview = await fixture.vite.ssrLoadModule(new URL("../domain/interview.ts", import.meta.url).pathname);
    const principal = await interview.principalFromIdentity("owner@example.invalid", "Owner", "contacts-test-pepper-at-least-32-bytes");
    await fixture.database.prepare("UPDATE workspaces SET owner_subject=? WHERE id=?").bind(principal.subject, lifecycle.workspaceId).run();
    assert.equal(Number((await fixture.database.prepare("SELECT count(*) count FROM contacts WHERE workspace_id=?").bind(lifecycle.workspaceId).first()).count), 0);
    assert.equal(Number((await fixture.database.prepare("SELECT count(*) count FROM contact_eligibility_snapshots WHERE workspace_id=?").bind(lifecycle.workspaceId).first()).count), 0);
    const loaded = await fixture.vite.ssrLoadModule(new URL("../domain/contacts-handler.ts", import.meta.url).pathname);
    const commandService = { async createGrant() {}, async runGrantedOperation() {}, async applyIdentityMerge() {}, async applyIdentitySplit() {} };
    const active = dependencies({ database: await activatedDatabase(fixture.database), phase4Accepted: async () => true, commandService });
    const read = async (deps = active) => loaded.handleContactsGet(new Request("https://prospector.test/api/contacts"), deps);

    let response = await read();
    assert.equal(response.status, 200);
    let body = await response.json();
    const revision = Number((await fixture.database.prepare("SELECT revision FROM profile_prospects WHERE id=?").bind(lifecycle.prospectId).first()).revision);
    assert.deepEqual(body.approvedProspects, { items: [{ prospectId: lifecycle.prospectId, prospectRevision: revision }], truncated: false });
    assert.deepEqual(body.eligibility, []);
    assert.deepEqual(body.verifiedContacts, [], "verified contacts are downstream evidence, not a Stage 1 prerequisite");

    body = await (await read(dependencies({ database: await activatedDatabase(fixture.database), phase4Accepted: async () => false, commandService }))).json();
    assert.deepEqual(body.approvedProspects, { items: [], truncated: false }, "the query is gate-off fail-closed");

    await fixture.database.prepare("UPDATE profile_prospects SET active=0 WHERE id=?").bind(lifecycle.prospectId).run();
    assert.deepEqual((await (await read()).json()).approvedProspects.items, [], "inactive prospects are absent");
    await fixture.database.prepare("UPDATE profile_prospects SET active=1 WHERE id=?").bind(lifecycle.prospectId).run();
    await fixture.database.prepare("UPDATE profile_prospects SET state='qualified' WHERE id=?").bind(lifecycle.prospectId).run();
    assert.deepEqual((await (await read()).json()).approvedProspects.items, [], "an active but non-approved prospect is absent");
    await fixture.database.prepare("UPDATE profile_prospects SET state='approved' WHERE id=?").bind(lifecycle.prospectId).run();
    await fixture.database.prepare("UPDATE prospecting_candidates SET status='rejected' WHERE id=(SELECT candidate_id FROM profile_prospects WHERE id=?)").bind(lifecycle.prospectId).run();
    assert.deepEqual((await (await read()).json()).approvedProspects.items, [], "rejected candidates are absent");
    await fixture.database.prepare("UPDATE prospecting_candidates SET status='observed' WHERE id=(SELECT candidate_id FROM profile_prospects WHERE id=?)").bind(lifecycle.prospectId).run();
    await fixture.database.prepare("UPDATE typed_configurations SET active=0 WHERE id=?").bind(lifecycle.configurationId).run();
    assert.deepEqual((await (await read()).json()).approvedProspects.items, [], "inactive or stale configurations are absent");
    await fixture.database.prepare("UPDATE typed_configurations SET active=1 WHERE id=?").bind(lifecycle.configurationId).run();
    const assessmentId = (await fixture.database.prepare("SELECT assessment_id FROM profile_prospects WHERE id=?").bind(lifecycle.prospectId).first()).assessment_id;
    await fixture.database.prepare("DROP TRIGGER qualification_assessment_immutable_update").run();
    await fixture.database.prepare("UPDATE qualification_assessments SET outcome='NotQualified' WHERE id=?").bind(assessmentId).run();
    assert.deepEqual((await (await read()).json()).approvedProspects.items, [], "a non-Passed assessment is absent");
    await fixture.database.prepare("UPDATE qualification_assessments SET outcome='Passed',configuration_digest=? WHERE id=?").bind("b".repeat(64), assessmentId).run();
    assert.deepEqual((await (await read()).json()).approvedProspects.items, [], "assessment/configuration digest drift is absent");
    await fixture.database.prepare("UPDATE qualification_assessments SET configuration_digest=? WHERE id=?").bind(lifecycle.configurationDigest, assessmentId).run();
    await fixture.database.prepare("UPDATE profile_prospects SET revision=revision+1,updated_at=updated_at+1 WHERE id=?").bind(lifecycle.prospectId).run();
    body = await (await read()).json();
    assert.equal(body.approvedProspects.items[0].prospectRevision, revision + 1);
    assert.equal(body.approvedProspects.items.some((item) => item.prospectRevision === revision), false, "a stale projected revision is not retained");

    const foreign = await read({ ...active, getIdentity: async () => ({ email: "foreign@example.invalid", displayName: "Foreign" }) });
    assert.equal(foreign.status, 404, "a foreign principal receives no prospect projection");
  } finally { await fixture.dispose(); }
});

test("approved prospect projection is closed, explicitly selected, and deterministically truncated", async () => {
  const { fixture, loaded } = await handler();
  try {
    const leaves = await fixture.vite.ssrLoadModule(new URL("../app/prospects/contact-leaves.tsx", import.meta.url).pathname);
    const workspace = await fixture.vite.ssrLoadModule(new URL("../app/prospects/contacts-workspace.tsx", import.meta.url).pathname);
    const base = { capability: { available: true, status: "ready", reason: "Synthetic authority." }, eligibility: [], verifiedContacts: [], suggestions: [], needsReview: [], approvedProspects: { items: [{ prospectId: "prospect-approved", prospectRevision: 7 }], truncated: false }, identity: [], authority: { stage: "ready", grantCreation: "available", operation: "requires_grant", providerCall: false } };
    const normalized = leaves.normalizeContactsProjection(base);
    assert.ok(normalized);
    assert.deepEqual(normalized.verifiedContacts, []);
    assert.equal(workspace.selectStageOneGrantCandidate(normalized, ""), null, "there is no automatic selection");
    assert.deepEqual(workspace.selectStageOneGrantCandidate(normalized, "prospect-approved"), { prospectId: "prospect-approved", prospectRevision: 7 });
    assert.equal(workspace.selectStageOneGrantCandidate(normalized, "prospect-missing"), null, "a drifted selection cannot remain actionable");
    for (const approvedProspects of [
      { items: [{ prospectId: "prospect-approved", prospectRevision: 7, provider: "forged" }], truncated: false },
      { items: [{ prospectId: "prospect-approved", prospectRevision: 7 }], truncated: false, cursor: "forged" },
      { items: [{ prospectId: "mailto:test@example.invalid", prospectRevision: 7 }], truncated: false, cursor: "forged" },
      { items: [{ prospectId: "1234567890", prospectRevision: 7 }], truncated: false },
      { items: [{ prospectId: "prospect-approved", prospectRevision: 0 }], truncated: false },
      { items: [{ prospectId: "prospect-approved", prospectRevision: 1.5 }], truncated: false },
      { items: [{ prospectId: "prospect-approved", prospectRevision: 7 }, { prospectId: "prospect-approved", prospectRevision: 8 }], truncated: false },
    ]) assert.equal(leaves.normalizeContactsProjection({ ...base, approvedProspects }), null);
    assert.equal(leaves.normalizeContactsProjection({ ...base, capability: { available: false, status: "blocked", reason: "Blocked." }, approvedProspects: base.approvedProspects }), null, "blocked authority cannot carry candidates");

    const rows = Array.from({ length: 21 }, (_, index) => ({ prospect_id: `prospect-${String(21 - index).padStart(2, "0")}`, prospect_revision: index + 1 }));
    const activeDatabase = await activatedDatabase(fixture.database);
    const projectedDatabase = {
      prepare(sql) {
        if (String(sql).includes("SELECT p.id prospect_id,p.revision prospect_revision")) return { bind() { return { async all() { return { results: rows }; } }; } };
        return activeDatabase.prepare(sql);
      },
      batch: activeDatabase.batch,
    };
    const commandService = { async createGrant() {}, async runGrantedOperation() {}, async applyIdentityMerge() {}, async applyIdentitySplit() {} };
    const response = await loaded.handleContactsGet(new Request("https://prospector.test/api/contacts"), dependencies({ database: projectedDatabase, phase4Accepted: async () => true, commandService }));
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.approvedProspects.items.length, 20);
    assert.equal(body.approvedProspects.truncated, true);
    assert.deepEqual(body.approvedProspects.items, rows.slice(0, 20).map((row) => ({ prospectId: row.prospect_id, prospectRevision: row.prospect_revision })));
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
      /sourceReference|assignmentId|configurationId|configurationDigest|receiptReservationId|observationIds|projectedAt|"current"|"digest"|"createdAt"/,
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
      prospectRevision: 9,
      state: "ContactReady",
      eligible: true,
      reasonCodes: [],
      observations: [{
        kind: "phone",
        verificationClass: "source_verified",
        sourceCategory: "authoritative_business_source",
        freshness: "stale",
        verifiedAt: 1_700_000_000_001,
      }],
    });
    assert.doesNotMatch(
      JSON.stringify(projected),
      /private-provider-locator|sourceReference|assignment|configuration|reservation|provider|observationIds|projectedAt|"current"/i,
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
    const beforeReadiness = await workspace.postContactConfirmation(async () => { posts += 1; return new Response("unexpected"); }, { authorityReady: false, confirmed: true, pending: false, idempotencyKey: "stable-synthetic-key" }, { prospectId: "projected-prospect", expectedProspectRevision: 1 });
    assert.equal(beforeReadiness, null); assert.equal(posts, 0, "a deferred authoritative GET leaves Stage 1 unable to issue POST");
    let submitted;
    await workspace.postContactConfirmation(async (url, init) => { submitted = { url, init }; return new Response("accepted", { status: 202 }); }, { authorityReady: true, confirmed: true, pending: false, idempotencyKey: "stable-synthetic-key" }, { prospectId: "projected-prospect", expectedProspectRevision: 7 });
    assert.equal(submitted.url, "/api/contacts");
    assert.deepEqual(JSON.parse(submitted.init.body), { action: "create_grant_confirmation", prospectId: "projected-prospect", expectedProspectRevision: 7, idempotencyKey: "stable-synthetic-key" });
    assert.deepEqual(Object.keys(JSON.parse(submitted.init.body)).sort(), ["action", "expectedProspectRevision", "idempotencyKey", "prospectId"]);
    const leaves = await fixture.vite.ssrLoadModule(new URL("../app/prospects/contact-leaves.tsx", import.meta.url).pathname);
    const projected = renderToStaticMarkup(React.createElement(leaves.ContactsReadFirst, { projection: {
      capability: { available: false, status: "blocked", reason: "Current capability is blocked." },
      eligibility: [{ id: "eligibility-1", contactId: "contact-1", prospectId: "prospect-1", state: "ContactReady", eligible: true, reasonCodes: [], observations: [{ kind: "email", verificationClass: "mailbox_verified", sourceCategory: "mailbox_check", freshness: "stale", verifiedAt: 1_700_000_000_000 }] }],
      verifiedContacts: [{ id: "verified-1", contactId: "contact-1", prospectId: "prospect-1", state: "ContactReady", eligible: true, reasonCodes: [], observations: [{ kind: "email", verificationClass: "mailbox_verified", sourceCategory: "mailbox_check", freshness: "stale", verifiedAt: 1_700_000_000_000 }] }],
      suggestions: [{ id: "suggestion-1", contactId: "contact-2", prospectId: "prospect-2", state: "ContactSuggestion", eligible: false, reasonCodes: ["verification_pending"] }],
      needsReview: [{ id: "review-1", contactId: "contact-3", prospectId: "prospect-3", state: "NeedsReview", eligible: false, reasonCodes: ["contact_evidence_stale"] }],
      approvedProspects: { items: [], truncated: false },
      identity: [{ id: "identity-1", subjectKind: "contact", kind: "merge", revision: 2, candidateRevisions: [{ subjectId: "contact-1", revision: 1 }, { subjectId: "contact-2", revision: 1 }], sourceLineageIds: ["lineage-1"] }],
      authority: { stage: "reject_only", grantCreation: "blocked", operation: "blocked", providerCall: false },
    } }));
    for (const text of ["contact-1", "mailbox_verified", "contact-2", "verification_pending", "contact-3", "contact_evidence_stale", "2 candidates and 1 lineage record"]) assert.match(projected, new RegExp(text));
  } finally { await fixture.dispose(); }
});

test("Contacts transport gets fresh authority/CSRF before mutation, keeps one intent key pending, and refreshes after 409 or CSRF", async () => {
  const [workspace, leaves, handlerSource, route] = await Promise.all([source("app/prospects/contacts-workspace.tsx"), source("app/prospects/contact-leaves.tsx"), source("domain/contacts-handler.ts"), source("app/api/contacts/route.ts")]);
  assert.match(workspace, /useEffect[\s\S]*then\(refresh\)/); assert.match(workspace, /crypto\.randomUUID\(\)/); assert.match(workspace, /startAuthorityRefresh[\s\S]*fetchContactsProjection/); assert.match(workspace, /disabled=\{!authorityReady \|\| !active \|\| !candidate \|\| !confirmed \|\| pending\}/); assert.match(workspace, /response\.status === 409[\s\S]*await refresh\(\)/); assert.match(workspace, /response\.status === 403[\s\S]*await refresh\(\)/);
  assert.match(`${workspace}\n${leaves}`, /data-status/); assert.match(`${workspace}\n${leaves}`, /contacts-granted-operation-explanation/);
  assert.match(handlerSource, /admitPilotOwner[\s\S]*validateSameOriginMutation[\s\S]*consumeCsrfToken/); assert.match(handlerSource, /MAX_CONTACTS_BODY_BYTES/); assert.doesNotMatch(`${handlerSource}\n${route}`, /enrichment-operation|contact-provider-port|provider.*\.enrich/i);
});

test("shared unknown-confirmation recovery clears confirmation, uses GET only, and fences stale completions", async () => {
  const fixture = await createD1Fixture("contacts-unknown-result-refresh");
  try {
    const workspace = await fixture.vite.ssrLoadModule(new URL("../app/prospects/contacts-workspace.tsx", import.meta.url).pathname);
    const confirmation = await fixture.vite.ssrLoadModule(new URL("../app/prospects/contact-confirmation-state.ts", import.meta.url).pathname);
    const calls = [];
    const post = await workspace.postContactConfirmation(async (url, init) => { calls.push({ url, method: init.method }); return new Response("unavailable", { status: 503 }); }, { authorityReady: true, confirmed: true, pending: false, idempotencyKey: "stable-synthetic-key" }, { prospectId: "projected-prospect", expectedProspectRevision: 1 });
    assert.equal(post.status, 503);
    let current = confirmation.finishAuthorityRefresh(confirmation.startAuthorityRefresh(confirmation.INITIAL_CONTACT_CONFIRMATION_STATE), 1, true);
    current = confirmation.setExplicitConfirmation(current, true);
    const reset = workspace.resetStageOneForAuthorityRefresh(current);
    assert.equal(reset.selectedProspectId, "", "refresh clears the selected prospect");
    assert.deepEqual({ ready: reset.confirmation.authorityReady, confirmed: reset.confirmation.confirmed, pending: reset.confirmation.pending }, { ready: false, confirmed: false, pending: false }, "refresh clears confirmation and any pending mutation while loading new authority");
    current = confirmation.beginConfirmationRequest(current).state;
    const recovery = workspace.beginUnknownContactConfirmationRecovery(current);
    assert.deepEqual({ ready: recovery.state.authorityReady, confirmed: recovery.state.confirmed, pending: recovery.state.pending }, { ready: false, confirmed: false, pending: false });
    const refreshed = await workspace.finishUnknownContactConfirmationRecovery(async (url, init) => { calls.push({ url, method: init.method ?? "GET" }); return Response.json({ capability: { available: false, status: "blocked", reason: "Blocked." }, eligibility: [], verifiedContacts: [], suggestions: [], needsReview: [], approvedProspects: { items: [], truncated: false }, identity: [], authority: { stage: "reject_only", grantCreation: "blocked", operation: "blocked", providerCall: false } }); }, recovery);
    const applied = workspace.applyUnknownContactConfirmationRecovery(recovery.state, refreshed);
    assert.equal(refreshed.projection?.authority.providerCall, false); assert.equal(applied.authorityReady, true); assert.equal(applied.confirmed, false);
    assert.deepEqual(calls, [{ url: "/api/contacts", method: "POST" }, { url: "/api/contacts", method: "GET" }], "recovery performs one safe GET and never retries POST");
    const malformed = await workspace.fetchContactsProjection(async () => Response.json({ capability: { available: false, status: "blocked", reason: "contact@example.invalid" } }));
    assert.equal(malformed.projection, null, "malformed successful responses do not become UI authority");
    const stale = confirmation.startAuthorityRefresh(recovery.state);
    assert.equal(workspace.applyUnknownContactConfirmationRecovery(stale, refreshed), stale, "a late recovery cannot overwrite a newer authority generation");
    const thrown = await workspace.finishUnknownContactConfirmationRecovery(async () => { throw new Error("offline"); }, recovery);
    assert.deepEqual({ ready: thrown.state.authorityReady, confirmed: thrown.state.confirmed, pending: thrown.state.pending }, { ready: false, confirmed: false, pending: false });
  } finally { await fixture.dispose(); }
});

test("Stage 2 requires its own confirmation and a synchronous one-attempt guard", async () => {
  const fixture = await createD1Fixture("contacts-stage-two-once");
  try {
    const workspace = await fixture.vite.ssrLoadModule(new URL("../app/prospects/contacts-workspace.tsx", import.meta.url).pathname); let posts = 0; let release;
    const fetcher = async () => { posts += 1; return new Promise((resolve) => { release = resolve; }); };
    const attempt = { current: false };
    assert.equal(await workspace.postGrantedOperationOnce(fetcher, { grantId: null, confirmed: true }, attempt), null); assert.equal(posts, 0);
    assert.equal(await workspace.postGrantedOperationOnce(fetcher, { grantId: "grant-one", confirmed: false }, attempt), null); assert.equal(posts, 0);
    const first = workspace.postGrantedOperationOnce(fetcher, { grantId: "grant-one", confirmed: true }, attempt);
    assert.equal(await workspace.postGrantedOperationOnce(fetcher, { grantId: "grant-one", confirmed: true }, attempt), null); assert.equal(posts, 1, "rapid second attempt cannot POST");
    release(Response.json({ command: { kind: "operation", status: "settled", grantId: "grant-one", operationId: "operation-one", resultDigest: "a".repeat(64), revision: 1 } }));
    assert.equal((await first).status, 200); assert.equal(await workspace.postGrantedOperationOnce(fetcher, { grantId: "grant-one", confirmed: true }, attempt), null); assert.equal(posts, 1, "presented grant stays retired after terminal outcome");
    attempt.current = false; await workspace.postGrantedOperationOnce(async () => { posts += 1; return new Response("unknown", { status: 503 }); }, { grantId: "grant-fresh", confirmed: true }, attempt); assert.equal(posts, 2); assert.equal(attempt.current, true, "unknown result remains retired until an authoritative refresh resets it");
  } finally { await fixture.dispose(); }
});

test("Contacts durable commands require both gates and an injected runtime before any service call", async () => {
  const { fixture, loaded } = await handler();
  let calls = 0;
  const commandService = { async createGrant() { calls += 1; return { kind: "grant", status: "created", grantId: "grant-one" }; }, async runGrantedOperation() { calls += 1; }, async applyIdentityMerge() { calls += 1; }, async applyIdentitySplit() { calls += 1; } };
  const command = { action: "create_grant_confirmation", prospectId: "prospect-one", expectedProspectRevision: 3, idempotencyKey: "stable-command-key" };
  try {
    const noRuntime = await loaded.handleContactsPost(mutation(command, { cookie: await csrf(loaded, fixture) }), dependencies({ database: fixture.database, phase4Accepted: async () => true }));
    assert.equal(noRuntime.status, 409); assert.equal(calls, 0);
    const noRuntimeRun = await loaded.handleContactsPost(mutation({ action: "run_granted_operation", grantId: "grant-one" }, { cookie: await csrf(loaded, fixture) }), dependencies({ database: fixture.database, phase4Accepted: async () => true }));
    assert.equal(noRuntimeRun.status, 409); assert.equal(calls, 0);
    const noActivation = await loaded.handleContactsPost(mutation(command, { cookie: await csrf(loaded, fixture) }), dependencies({ database: fixture.database, phase4Accepted: async () => true, commandService }));
    assert.equal(noActivation.status, 409); assert.equal(calls, 0);
    const activeDb = await activatedDatabase(fixture.database);
    const noPhase4 = await loaded.handleContactsPost(mutation(command, { cookie: await csrf(loaded, { database: activeDb }) }), dependencies({ database: activeDb, phase4Accepted: async () => false, commandService }));
    assert.equal(noPhase4.status, 409); assert.equal(calls, 0);
    const runDefaultDenied = await loaded.handleContactsPost(mutation(COMMANDS[1], { cookie: await csrf(loaded, { database: activeDb }) }), dependencies({ database: activeDb, phase4Accepted: async () => true, commandService })); assert.equal(runDefaultDenied.status, 409); assert.equal(calls, 0);
    const splitDefaultDenied = await loaded.handleContactsPost(mutation(COMMANDS[3], { cookie: await csrf(loaded, { database: activeDb }) }), dependencies({ database: activeDb, phase4Accepted: async () => true, commandService })); assert.equal(splitDefaultDenied.status, 409); assert.equal(calls, 0);
  } finally { await fixture.dispose(); }
});

test("every Contacts action is non-vacuously denied before the active service across authority and request-security failures", async () => {
  const { fixture, loaded } = await handler(); const activeDb = await activatedDatabase(fixture.database); const calls = [];
  const service = { async createGrant(...args) { calls.push(args); }, async runGrantedOperation(...args) { calls.push(args); }, async applyIdentityMerge(...args) { calls.push(args); }, async applyIdentitySplit(...args) { calls.push(args); } };
  const active = dependencies({ database: activeDb, phase4Accepted: async () => true, runGrantedOperationEnabled: async () => true, identitySplitEnabled: async () => true, commandService: service });
  async function freshCookie(database = activeDb, mode) { const response = await loaded.handleContactsGet(new Request("https://prospector.test/api/contacts"), dependencies({ database, csrfCookieMode: mode })); return response.headers.get("set-cookie").split(";")[0]; }
  function assertDeniedWithoutCall(response, status, before, label) { assert.equal(response.status, status, label); assert.equal(calls.length, before, `${label}: service spy remains unchanged`); }
  try {
    for (const command of COMMANDS) {
      let before = calls.length; const activationFalse = await loaded.handleContactsPost(mutation(command, { cookie: await freshCookie(fixture.database) }), dependencies({ database: fixture.database, phase4Accepted: async () => true, commandService: service })); assertDeniedWithoutCall(activationFalse, 409, before, `${command.action}:activation`);
      before = calls.length; const phase4False = await loaded.handleContactsPost(mutation(command, { cookie: await freshCookie() }), dependencies({ database: activeDb, phase4Accepted: async () => false, commandService: service })); assertDeniedWithoutCall(phase4False, 409, before, `${command.action}:phase4`);
      for (const [identityLabel, getIdentity] of [["null", async () => null], ["outsider", async () => ({ email: "outsider@example.invalid", displayName: "Outsider" })]]) { before = calls.length; const denied = await loaded.handleContactsPost(mutation(command, { cookie: await freshCookie() }), { ...active, getIdentity }); assertDeniedWithoutCall(denied, 404, before, `${command.action}:${identityLabel}`); }
      for (const [index, headers] of [{ origin: null, cookie: await freshCookie() }, { origin: "https://foreign.test", cookie: await freshCookie() }, { "x-prospector-intent": null, cookie: await freshCookie() }, { "x-prospector-intent": "wrong-intent", cookie: await freshCookie() }, { cookie: null }, { cookie: "__Host-prospector-csrf=wrong" }].entries()) { before = calls.length; const denied = await loaded.handleContactsPost(mutation(command, headers), active); assertDeniedWithoutCall(denied, 403, before, `${command.action}:request-${index}`); }
      const oneTime = await freshCookie(); before = calls.length; const first = await loaded.handleContactsPost(mutation(command, { cookie: oneTime }), active); assert.notEqual(first.status, 403); assert.equal(calls.length, before + 1, `${command.action}: valid control proves active spy`); before = calls.length; const replay = await loaded.handleContactsPost(mutation(command, { cookie: oneTime }), active); assertDeniedWithoutCall(replay, 403, before, `${command.action}:csrf-replay`);
      const forbiddenByAction = { create_grant_confirmation: ["provider", "configurationId", "workspaceId", "ownerSubject", "operationKey", "reservationId", "cost", "currency", "expiresAt", "nonce", "candidateIds", "associationIds"], run_granted_operation: ["idempotencyKey", "provider", "workspaceId", "operationKey"], apply_identity_merge: ["candidateIds", "associationIds", "workspaceId", "ownerSubject"], apply_identity_split: ["primaryId", "candidateIds", "associationIds", "workspaceId"] };
      for (const field of forbiddenByAction[command.action]) { before = calls.length; const denied = await loaded.handleContactsPost(mutation({ ...command, [field]: "forged" }, { cookie: await freshCookie() }), active); assertDeniedWithoutCall(denied, 400, before, `${command.action}:${field}`); }
    }
    assert.equal(calls.length, 4, "only the four explicitly valid one-time requests reach the active spy; every denial is zero-call");
  } finally { await fixture.dispose(); }
});

test("Contacts maps created, conflict, stale, wrong-scope, settled, and reconciliation service outcomes without retry", async () => {
  const { fixture, loaded } = await handler(); const database = await activatedDatabase(fixture.database); const calls = [];
  const service = {
    async createGrant(_context, command) { calls.push(command.prospectId); return { kind: "grant", status: command.prospectId, grantId: "grant-safe" }; },
    async runGrantedOperation(_context, command) { calls.push(command.grantId); return { kind: "operation", status: command.grantId === "grant-settled" ? "settled" : "reconciliation_required", grantId: command.grantId, operationId: `operation-${command.grantId}`, resultDigest: "d".repeat(64), revision: 1 }; },
    async applyIdentityMerge() { throw new Error("not expected"); }, async applyIdentitySplit() { throw new Error("not expected"); },
  };
  const deps = dependencies({ database, phase4Accepted: async () => true, runGrantedOperationEnabled: async () => true, identitySplitEnabled: async () => true, commandService: service });
  async function post(body) { return loaded.handleContactsPost(mutation(body, { cookie: await csrf(loaded, { database }) }), deps); }
  try {
    for (const status of ["created", "conflict", "stale", "wrong_scope"]) { const response = await post({ action: "create_grant_confirmation", prospectId: status, expectedProspectRevision: 1, idempotencyKey: `key-${status}` }); assert.equal(response.status, status === "created" ? 200 : 409); assert.equal((await response.json()).command.status, status); }
    for (const grantId of ["grant-settled", "grant-reconcile"]) { const response = await post({ action: "run_granted_operation", grantId }); assert.equal(response.status, 200); assert.equal((await response.json()).command.status, grantId === "grant-settled" ? "settled" : "reconciliation_required"); }
    assert.deepEqual(calls, ["created", "conflict", "stale", "wrong_scope", "grant-settled", "grant-reconcile"], "each explicit request invokes the service exactly once");
  } finally { await fixture.dispose(); }
});

test("injected Contacts runtime receives only server context and minimal frozen commands", async () => {
  const { fixture, loaded, principal } = await handler();
  const database = await activatedDatabase(fixture.database); const seen = [];
  const commandService = {
    async createGrant(context, command) { seen.push(["create", context, command]); return { kind: "grant", status: "replayed", grantId: "grant-safe", tupleDigest: "a".repeat(64), providerId: "bounded-provider", providerVersion: "v1", unitCostMinor: 7, currency: "USD", expiresAt: 1_900_000_000_000, ownerSubject: "must-not-leak", nonce: "must-not-leak", source_reference: "must-not-leak" }; },
    async runGrantedOperation(context, command) { seen.push(["run", context, command]); return { kind: "operation", status: "reconciliation_required", grantId: command.grantId, operationId: "operation-safe", resultDigest: "b".repeat(64), revision: 4, providerResponse: "must-not-leak" }; },
    async applyIdentityMerge(context, command) { seen.push(["merge", context, command]); return { kind: "identity", action: "merge", status: "applied", suggestionId: command.suggestionId, resultDigest: "c".repeat(64), revision: 5, rawExcerpt: "must-not-leak" }; },
    async applyIdentitySplit(context, command) { seen.push(["split", context, command]); return { kind: "identity", status: "stale", suggestionId: command.suggestionId, revision: 6, contact_point_reference: "must-not-leak" }; },
  };
  const deps = dependencies({ database, phase4Accepted: async (context) => context.workspaceId === "contacts-owned", runGrantedOperationEnabled: async () => true, identitySplitEnabled: async () => true, commandService });
  async function post(body) { return loaded.handleContactsPost(mutation(body, { cookie: await csrf(loaded, { database }) }), deps); }
  try {
    const create = await post({ action: "create_grant_confirmation", prospectId: "prospect-one", expectedProspectRevision: 3, idempotencyKey: "create-key" });
    assert.equal(create.status, 200); const createBody = await create.json(); assert.equal(createBody.command.status, "replayed"); assert.deepEqual(Object.keys(createBody.command).sort(), ["currency", "expiresAt", "grantId", "kind", "providerId", "providerVersion", "status", "tupleDigest", "unitCostMinor"].sort()); assert.doesNotMatch(JSON.stringify(createBody), /must-not-leak|ownerSubject|nonce|source_reference/);
    const run = await post({ action: "run_granted_operation", grantId: "grant-safe" }); assert.equal(run.status, 200); const runBody = await run.json(); assert.equal(runBody.command.status, "reconciliation_required"); assert.deepEqual(Object.keys(runBody.command).sort(), ["grantId", "kind", "operationId", "resultDigest", "revision", "status"].sort()); assert.doesNotMatch(JSON.stringify(runBody), /providerResponse/);
    const merge = await post({ action: "apply_identity_merge", suggestionId: "suggestion-merge", expectedRevision: 4, idempotencyKey: "merge-key", primaryId: "contact-primary" }); assert.equal(merge.status, 200); const mergeBody = await merge.json(); assert.deepEqual(Object.keys(mergeBody.command).sort(), ["action", "kind", "resultDigest", "revision", "status", "suggestionId"].sort()); assert.doesNotMatch(JSON.stringify(mergeBody), /rawExcerpt/);
    const split = await post({ action: "apply_identity_split", suggestionId: "suggestion-split", expectedRevision: 5, idempotencyKey: "split-key" }); assert.equal(split.status, 409); const splitBody = await split.json(); assert.deepEqual(Object.keys(splitBody.command).sort(), ["kind", "status"].sort()); assert.doesNotMatch(JSON.stringify(splitBody), /contact_point_reference|suggestionId|revision/);
    for (const [, context, command] of seen) { assert.deepEqual(context, { workspaceId: "contacts-owned", principalSubject: principal.subject }); assert.equal(Object.isFrozen(context), true); assert.equal(Object.isFrozen(command), true); }
    assert.deepEqual(seen.map(([name, , command]) => [name, Object.keys(command).sort()]), [
      ["create", ["expectedProspectRevision", "idempotencyKey", "prospectId"]], ["run", ["grantId"]], ["merge", ["expectedRevision", "idempotencyKey", "primaryId", "suggestionId"]], ["split", ["expectedRevision", "idempotencyKey", "suggestionId"]],
    ]);
    const forbidden = ["provider", "configurationId", "workspaceId", "ownerSubject", "operationKey", "reservationId", "cost", "currency", "expiresAt", "nonce", "candidateIds", "associationIds"];
    for (const field of forbidden) { const denied = await post({ action: "create_grant_confirmation", prospectId: "prospect-one", expectedProspectRevision: 3, idempotencyKey: `key-${field}`, [field]: "forged" }); assert.equal(denied.status, 400, field); }
  } finally { await fixture.dispose(); }
});

test("Contacts command outcomes stay closed and local-demo uses the non-Secure CSRF cookie mode", async () => {
  const { fixture, loaded } = await handler();
  try {
    const database = await activatedDatabase(fixture.database); let serviceCalls = 0;
    const commandService = { async createGrant() { serviceCalls += 1; return { kind: "grant", status: "conflict" }; }, async runGrantedOperation() {}, async applyIdentityMerge() {}, async applyIdentitySplit() {} };
    const localDependencies = dependencies({ database, csrfCookieMode: "local-demo", phase4Accepted: async () => true, commandService });
    const local = await loaded.handleContactsGet(new Request("http://127.0.0.1:8788/api/contacts"), localDependencies);
    assert.equal(local.status, 200); assert.match(local.headers.get("set-cookie") ?? "", /prospector-local-csrf=/); assert.doesNotMatch(local.headers.get("set-cookie") ?? "", /Secure/);
    const localCookie = local.headers.get("set-cookie").split(";")[0];
    const localPost = new Request("http://127.0.0.1:8788/api/contacts", { method: "POST", headers: { origin: "http://127.0.0.1:8788", "sec-fetch-site": "same-origin", "x-prospector-intent": "contacts-mutation", "content-type": "application/json", cookie: localCookie }, body: JSON.stringify(COMMANDS[0]) });
    assert.equal((await loaded.handleContactsPost(localPost, localDependencies)).status, 409); assert.equal(serviceCalls, 1);
    const secure = await loaded.handleContactsGet(new Request("https://prospector.test/api/contacts"), dependencies({ database })); const secureCookie = secure.headers.get("set-cookie").split(";")[0];
    const wrongLocal = new Request("http://127.0.0.1:8788/api/contacts", { method: "POST", headers: { origin: "http://127.0.0.1:8788", "sec-fetch-site": "same-origin", "x-prospector-intent": "contacts-mutation", "content-type": "application/json", cookie: secureCookie }, body: JSON.stringify(COMMANDS[0]) });
    assert.equal((await loaded.handleContactsPost(wrongLocal, localDependencies)).status, 403); assert.equal(serviceCalls, 1);
    const wrongSecure = mutation(COMMANDS[0], { cookie: localCookie }); assert.equal((await loaded.handleContactsPost(wrongSecure, dependencies({ database, phase4Accepted: async () => true, commandService }))).status, 403); assert.equal(serviceCalls, 1);
    const leaves = await fixture.vite.ssrLoadModule(new URL("../app/prospects/contact-leaves.tsx", import.meta.url).pathname);
    assert.equal(leaves.normalizeContactsCommand({ kind: "grant", status: "created", grantId: "grant-one", tupleDigest: "a".repeat(64), credentials: "secret" }).credentials, undefined);
    assert.equal(leaves.normalizeContactsCommand({ kind: "grant", status: "created", grantId: "mailto:test@example.invalid" }), null);
    const clientOutcomes = [
      leaves.normalizeContactsCommand({ kind: "grant", status: "created", grantId: "grant-one", tupleDigest: "a".repeat(64), credentials: "drop" }),
      leaves.normalizeContactsCommand({ kind: "operation", status: "settled", grantId: "grant-one", operationId: "operation-one", resultDigest: "b".repeat(64), revision: 1, providerResponse: "drop" }),
      leaves.normalizeContactsCommand({ kind: "identity", action: "merge", status: "applied", suggestionId: "merge-one", resultDigest: "c".repeat(64), revision: 2, rawExcerpt: "drop" }),
      leaves.normalizeContactsCommand({ kind: "identity", status: "stale", contact_point_reference: "drop" }),
    ];
    assert.deepEqual(clientOutcomes.map((outcome) => Object.keys(outcome).sort()), [["grantId", "kind", "status", "tupleDigest"], ["grantId", "kind", "operationId", "resultDigest", "revision", "status"], ["action", "kind", "resultDigest", "revision", "status", "suggestionId"], ["kind", "status"]]);
    const activeRow = { id: "row-one", contactId: "contact-one", prospectId: "prospect-one", prospectRevision: 8, state: "ContactReady", eligible: true, reasonCodes: [] };
    const baseActive = { capability: { available: true, status: "ready", reason: "Synthetic authority." }, eligibility: [activeRow], verifiedContacts: [activeRow], suggestions: [], needsReview: [], approvedProspects: { items: [{ prospectId: "prospect-one", prospectRevision: 8 }], truncated: false }, identity: [], authority: { stage: "ready", grantCreation: "available", operation: "requires_grant", providerCall: false } };
    const active = leaves.normalizeContactsProjection(baseActive); assert.equal(active.capability.available, true); assert.equal(active.verifiedContacts[0].prospectRevision, 8);
    assert.equal(leaves.normalizeContactsProjection({ ...baseActive, verifiedContacts: [{ ...activeRow, prospectRevision: 9 }] }), null, "an inconsistent active projection cannot authorize Stage 1");
    const oneCandidateMerge = { id: "merge-one", subjectKind: "contact", kind: "merge", revision: 1, candidateRevisions: [{ subjectId: "contact-one", revision: 1 }], sourceLineageIds: ["lineage-one"] };
    assert.equal(leaves.normalizeContactsProjection({ ...baseActive, identity: [oneCandidateMerge] }), null, "one-candidate merge is not actionable");
    assert.equal(leaves.normalizeContactsProjection({ ...baseActive, identity: [{ ...oneCandidateMerge, candidateRevisions: [...oneCandidateMerge.candidateRevisions, { subjectId: "contact-two", revision: 1 }] }] }).identity.length, 1, "two-candidate merge is accepted");
    const sourceText = await source("app/prospects/contacts-workspace.tsx"); assert.doesNotMatch(sourceText, /synthetic-preview-only|candidateRevisions\[0\]/); assert.match(sourceText, /Partial grant receipt/); assert.match(sourceText, /stageTwoAuthorityComplete = false/); assert.match(sourceText, /selectedPrimary/);
    const route = await source("app/api/contacts/route.ts"); assert.match(route, /isLocalDemoRequest/); assert.doesNotMatch(route, /commandService|phase4Accepted/);
  } finally { await fixture.dispose(); }
});
