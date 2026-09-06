import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFile } from "node:fs/promises";
import { applyMigrations, createD1Fixture } from "./helpers/d1.mjs";
import { createApprovedProspectLifecycle } from "./helpers/phase5-integration.mjs";

const root = new URL("..", import.meta.url);
async function source(path) { return readFile(new URL(path, root), "utf8"); }
async function applyContactsMigrations(database) { await applyMigrations(database); const sql = await source("drizzle/0018_massive_blizzard.sql"); for (const statement of sql.split("--> statement-breakpoint").map((value) => value.trim()).filter(Boolean)) await database.prepare(statement).run(); }
async function handler() { const fixture = await createD1Fixture("contacts-handler"); await applyContactsMigrations(fixture.database); const identity = await fixture.vite.ssrLoadModule(new URL("../domain/interview.ts", import.meta.url).pathname); const principal = await identity.principalFromIdentity("owner@example.invalid", "Owner", "contacts-test-pepper-at-least-32-bytes"); await fixture.database.prepare("INSERT INTO workspaces (id,company_name,owner_subject,created_at,updated_at,revision) VALUES ('contacts-owned','Owned',?,?,?,1)").bind(principal.subject, 1_700_000_000_000, 1_700_000_000_000).run(); const loaded = await fixture.vite.ssrLoadModule(new URL("../domain/contacts-handler.ts", import.meta.url).pathname); return { fixture, loaded, principal }; }
function dependencies(overrides = {}) { return { subjectPepper: "contacts-test-pepper-at-least-32-bytes", pilotOwnerEmail: "owner@example.invalid", capabilityBuildEpoch: "contacts-test-build/v1", getIdentity: async () => ({ email: "owner@example.invalid", displayName: "Owner" }), ...overrides }; }
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
function page(items = [], total = items.length, nextCursor = null) { return { items, pageInfo: { schema: "contacts-page-info/v1", limit: 20, total, returned: items.length, hasNext: nextCursor !== null, nextCursor } }; }

test("Contacts handler admits owner first and rejects foreign, CSRF, malformed, oversized, and closed-shape requests", async () => {
    const { fixture, loaded } = await handler();
  try {
    const denied = await loaded.handleContactsGet(new Request("https://prospector.test/api/contacts"), dependencies({ database: fixture.database, getIdentity: async () => null }));
    assert.equal(denied.status, 404, "non-owner cannot obtain the Contacts surface");
    const get = await loaded.handleContactsGet(new Request("https://prospector.test/api/contacts"), dependencies({ database: fixture.database }));
    assert.equal(get.status, 200); assert.match(get.headers.get("set-cookie") ?? "", /__Host-prospector-csrf/);
    for (const url of ["https://prospector.test/api/contacts?unknown=x", "https://prospector.test/api/contacts?contactsCursor=bad", "https://prospector.test/api/contacts?contactsCursor=bad&contactsCursor=bad"]) {
      const invalidPage = await loaded.handleContactsGet(new Request(url), dependencies({ database: fixture.database }));
      assert.equal(invalidPage.status, 400); assert.deepEqual(await invalidPage.json(), { error: "invalid_contacts_cursor" });
    }
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

test("Contacts GET fences its gate read and rejects a generation change while pages are assembled", async () => {
  const { fixture, loaded } = await handler(); let generationReads = 0; const events = [];
  try {
    const database = { prepare(sql) {
      if (String(sql).startsWith("SELECT contacts_generation,identity_generation,approved_generation")) return { bind() { return { async first() { generationReads += 1; events.push(`generation-${generationReads}`); return { contacts_generation: generationReads === 1 ? 0 : 1, identity_generation: 0, approved_generation: 0 }; } }; } };
      if (String(sql).includes("FROM phase_activation_gates")) { events.push("gate"); }
      return fixture.database.prepare(sql);
    }, batch: fixture.database.batch.bind(fixture.database) };
    const response = await loaded.handleContactsGet(new Request("https://prospector.test/api/contacts"), dependencies({ database }));
    assert.equal(generationReads, 2); assert.deepEqual(events.filter((event) => event.startsWith("generation") || event === "gate"), ["generation-1", "gate", "generation-2"]); assert.equal(response.status, 409); assert.deepEqual(await response.json(), { error: "contacts_page_drifted" });
  } finally { await fixture.dispose(); }
});

test("Contacts fails closed before migration 0018 instead of issuing a falsely stable page", async () => {
  const fixture = await createD1Fixture("contacts-generation-schema-required");
  try {
    await applyMigrations(fixture.database);
    const identity = await fixture.vite.ssrLoadModule(new URL("../domain/interview.ts", import.meta.url).pathname); const principal = await identity.principalFromIdentity("owner@example.invalid", "Owner", "contacts-test-pepper-at-least-32-bytes");
    await fixture.database.prepare("INSERT INTO workspaces (id,company_name,owner_subject,created_at,updated_at,revision) VALUES ('pre-pagination','Old schema',?,?,?,1)").bind(principal.subject, 1_700_000_000_000, 1_700_000_000_000).run();
    const loaded = await fixture.vite.ssrLoadModule(new URL("../domain/contacts-handler.ts", import.meta.url).pathname);
    const response = await loaded.handleContactsGet(new Request("https://prospector.test/api/contacts"), dependencies({ database: fixture.database }));
    assert.equal(response.status, 503); assert.deepEqual(await response.json(), { error: "contacts_schema_unavailable" }); assert.equal(response.headers.get("set-cookie"), null);
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
    await applyContactsMigrations(fixture.database);
    const lifecycle = await createApprovedProspectLifecycle(fixture);
    const interview = await fixture.vite.ssrLoadModule(new URL("../domain/interview.ts", import.meta.url).pathname);
    const principal = await interview.principalFromIdentity("owner@example.invalid", "Owner", "contacts-test-pepper-at-least-32-bytes");
    await fixture.database.prepare("UPDATE workspaces SET owner_subject=? WHERE id=?").bind(principal.subject, lifecycle.workspaceId).run();
    assert.equal(Number((await fixture.database.prepare("SELECT count(*) count FROM contacts WHERE workspace_id=?").bind(lifecycle.workspaceId).first()).count), 0);
    assert.equal(Number((await fixture.database.prepare("SELECT count(*) count FROM contact_eligibility_snapshots WHERE workspace_id=?").bind(lifecycle.workspaceId).first()).count), 0);
    const loaded = await fixture.vite.ssrLoadModule(new URL("../domain/contacts-handler.ts", import.meta.url).pathname);
    const commandService = { async createGrant() {}, async runGrantedOperation() {}, async applyIdentityMerge() {}, async applyIdentitySplit() {} };
    const active = dependencies({ database: await activatedDatabase(fixture.database), phase4Accepted: async () => true, commandService, now: () => 1_810_000_000_100 });
    const read = async (deps = active) => loaded.handleContactsGet(new Request("https://prospector.test/api/contacts"), deps);

    const missingEpoch = await read({ ...active, capabilityBuildEpoch: undefined }); assert.equal(missingEpoch.status, 503); assert.deepEqual(await missingEpoch.json(), { error: "contacts_unavailable" }, "active composition fails closed without explicit deployment/build epoch metadata");
    let response = await read();
    assert.equal(response.status, 200);
    let body = await response.json();
    const revision = Number((await fixture.database.prepare("SELECT revision FROM profile_prospects WHERE id=?").bind(lifecycle.prospectId).first()).revision);
    assert.deepEqual(body.approvedProspects, page([{ prospectId: lifecycle.prospectId, prospectRevision: revision }]));
    assert.deepEqual(body.contactsPage.items, [], "verified contacts are downstream evidence, not a Stage 1 prerequisite");

    body = await (await read(dependencies({ database: await activatedDatabase(fixture.database), phase4Accepted: async () => false, commandService }))).json();
    assert.deepEqual(body.approvedProspects, page(), "the query is gate-off fail-closed");

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

test("approved prospects traverse a real D1 21-row high-water and drift on later authority mutation", async () => {
  const fixture = await createD1Fixture("contacts-approved-prospect-pagination");
  try {
    await applyContactsMigrations(fixture.database);
    const lifecycle = await createApprovedProspectLifecycle(fixture);
    const interview = await fixture.vite.ssrLoadModule(new URL("../domain/interview.ts", import.meta.url).pathname);
    const principal = await interview.principalFromIdentity("owner@example.invalid", "Owner", "contacts-test-pepper-at-least-32-bytes");
    await fixture.database.prepare("UPDATE workspaces SET owner_subject=? WHERE id=?").bind(principal.subject, lifecycle.workspaceId).run();
    const source = await fixture.database.prepare("SELECT candidate_id,assessment_id FROM profile_prospects WHERE id=?").bind(lifecycle.prospectId).first();
    const inserts = [];
    for (let index = 1; index <= 20; index += 1) {
      const suffix = String(index).padStart(2, "0"), digest = index.toString(16).padStart(64, "0"), timestamp = 1_810_000_000_010 + index;
      inserts.push(
        fixture.database.prepare(`INSERT INTO prospecting_candidates (id,workspace_id,created_at,updated_at,revision,profile_id,offer_id,run_id,submission_id,configuration_id,fingerprint,candidate_json,candidate_digest,predecessor_candidate_id,status)
          SELECT ?,workspace_id,?,?,revision,profile_id,offer_id,run_id,submission_id,configuration_id,?,candidate_json,?,NULL,status FROM prospecting_candidates WHERE id=?`).bind(`page-candidate-${suffix}`, timestamp, timestamp, digest, digest, source.candidate_id),
        fixture.database.prepare(`INSERT INTO qualification_assessments (id,workspace_id,candidate_id,configuration_id,configuration_digest,input_json,input_digest,anchor_json,evidence_json,gate_json,score_json,score,outcome,tie_order,assessment_digest,predecessor_assessment_id,created_at)
          SELECT ?,workspace_id,?,configuration_id,configuration_digest,input_json,?,anchor_json,evidence_json,gate_json,score_json,score,outcome,tie_order,?,NULL,? FROM qualification_assessments WHERE id=?`).bind(`page-assessment-${suffix}`, `page-candidate-${suffix}`, digest, digest, timestamp, source.assessment_id),
        fixture.database.prepare(`INSERT INTO profile_prospects (id,workspace_id,created_at,updated_at,revision,profile_id,offer_id,candidate_id,assessment_id,fingerprint,state,active)
          SELECT ?,workspace_id,?,?,1,profile_id,offer_id,?,?,?,'approved',1 FROM profile_prospects WHERE id=?`).bind(`page-prospect-${suffix}`, timestamp, timestamp, `page-candidate-${suffix}`, `page-assessment-${suffix}`, digest, lifecycle.prospectId),
      );
    }
    await fixture.database.batch(inserts);
    const loaded = await fixture.vite.ssrLoadModule(new URL("../domain/contacts-handler.ts", import.meta.url).pathname);
    const commandService = { async createGrant() {}, async runGrantedOperation() {}, async applyIdentityMerge() {}, async applyIdentitySplit() {} };
    const activeDatabase = await activatedDatabase(fixture.database);
    let queryCount = 0;
    const countingDatabase = { prepare(sql) { queryCount += 1; return activeDatabase.prepare(sql); }, batch: activeDatabase.batch };
    const deps = dependencies({ database: countingDatabase, phase4Accepted: async () => true, commandService, now: () => 1_810_000_001_000 });
    const first = await loaded.handleContactsGet(new Request("https://prospector.test/api/contacts"), deps); assert.equal(first.status, 200);
    assert.ok(queryCount < 50, `the full owner GET used ${queryCount} D1 statements`);
    const firstBody = await first.json(); assert.equal(firstBody.approvedProspects.items.length, 20); assert.equal(firstBody.approvedProspects.pageInfo.hasNext, true);
    const cursor = firstBody.approvedProspects.pageInfo.nextCursor; assert.ok(cursor);
    queryCount = 0;
    const second = await loaded.handleContactsGet(new Request(`https://prospector.test/api/contacts?approvedCursor=${encodeURIComponent(cursor)}`), deps); assert.equal(second.status, 200);
    assert.ok(queryCount < 50, `the continued owner GET used ${queryCount} D1 statements`);
    const secondBody = await second.json(); assert.equal(secondBody.approvedProspects.items.length, 1); assert.equal(secondBody.approvedProspects.pageInfo.hasNext, false);
    const all = [...firstBody.approvedProspects.items, ...secondBody.approvedProspects.items].map((row) => row.prospectId); assert.equal(new Set(all).size, 21); assert.ok(all.includes(lifecycle.prospectId));
    await fixture.database.prepare("UPDATE prospecting_candidates SET status='rejected' WHERE id=(SELECT candidate_id FROM profile_prospects WHERE id=?)").bind(lifecycle.prospectId).run();
    const drift = await loaded.handleContactsGet(new Request(`https://prospector.test/api/contacts?approvedCursor=${encodeURIComponent(cursor)}`), deps); assert.equal(drift.status, 409); assert.deepEqual(await drift.json(), { error: "contacts_page_drifted" });
  } finally { await fixture.dispose(); }
});

test("identity suggestions traverse a real owner-scoped D1 page beyond twenty", async () => {
  const { fixture, loaded, principal } = await handler();
  try {
    const attestation = await fixture.vite.ssrLoadModule(new URL("../domain/contact-settlement-attestor.ts", import.meta.url).pathname);
    const activeKey = await crypto.subtle.importKey("raw", new TextEncoder().encode("contacts epoch active key material 0001"), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
    const retiredKey = await crypto.subtle.importKey("raw", new TextEncoder().encode("contacts epoch retired key material 001"), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    const currentAttestor = attestation.bindContactSettlementAttestor({ active: { keyId: "contacts-current", key: activeKey }, verificationOnly: [] });
    const rotatedVerificationSet = attestation.bindContactSettlementAttestor({ active: { keyId: "contacts-current", key: activeKey }, verificationOnly: [{ keyId: "contacts-retired", key: retiredKey }] });
    const inserts = [];
    for (let index = 0; index < 21; index += 1) {
      const suffix = String(index).padStart(2, "0"), digest = (index + 1).toString(16).padStart(64, "0");
      inserts.push(fixture.database.prepare(`INSERT INTO identity_suggestions (id,workspace_id,owner_subject,subject_kind,kind,revision,candidate_revisions_json,source_lineage_ids_json,retained_identity_lineage_ids_json,retained_aliases_json,retained_suppression_subject_refs_json,proposed_partition_json,suggestion_digest,created_at)
        VALUES (?,'contacts-owned',?,'contact','merge',2,?,?,?,'[]','[]',NULL,?,?)`).bind(`identity-page-${suffix}`, principal.subject, JSON.stringify({ [`contact-${suffix}-a`]: 1, [`contact-${suffix}-b`]: 1 }), JSON.stringify([`contact-${suffix}-a`, `contact-${suffix}-b`]), JSON.stringify([`contact-${suffix}-a`, `contact-${suffix}-b`]), digest, 1_700_000_001_000 + index));
    }
    await fixture.database.batch(inserts);
    const database = await activatedDatabase(fixture.database); let queryCount = 0;
    const counting = { prepare(sql) { queryCount += 1; return database.prepare(sql); }, batch: database.batch };
    const deps = dependencies({ database: counting, contactSettlementAttestor: currentAttestor, phase4Accepted: async () => true, commandService: { async createGrant() {}, async runGrantedOperation() {}, async applyIdentityMerge() {}, async applyIdentitySplit() {} }, now: () => 1_700_000_002_000 });
    const first = await loaded.handleContactsGet(new Request("https://prospector.test/api/contacts"), deps); assert.equal(first.status, 200); assert.ok(queryCount < 50);
    const body = await first.json(); assert.equal(body.identityPage.items.length, 20); assert.equal(body.identityPage.pageInfo.hasNext, true);
    const rotated = await loaded.handleContactsGet(new Request(`https://prospector.test/api/contacts?identityCursor=${encodeURIComponent(body.identityPage.pageInfo.nextCursor)}`), { ...deps, capabilityBuildEpoch: "contacts-capability-build/v2" }); assert.equal(rotated.status, 409); assert.deepEqual(await rotated.json(), { error: "contacts_page_drifted" }, "a server build/capability epoch rotation invalidates continuation");
    const verificationSetRotated = await loaded.handleContactsGet(new Request(`https://prospector.test/api/contacts?identityCursor=${encodeURIComponent(body.identityPage.pageInfo.nextCursor)}`), { ...deps, contactSettlementAttestor: rotatedVerificationSet }); assert.equal(verificationSetRotated.status, 409); assert.deepEqual(await verificationSetRotated.json(), { error: "contacts_page_drifted" }, "the complete nonsecret attestor verification key-ID set is cursor authority");
    const disabled = await loaded.handleContactsGet(new Request(`https://prospector.test/api/contacts?identityCursor=${encodeURIComponent(body.identityPage.pageInfo.nextCursor)}`), { ...deps, phase4Accepted: async () => false }); assert.equal(disabled.status, 409); assert.deepEqual(await disabled.json(), { error: "contacts_page_drifted" }, "a request-time authority capability change invalidates continuation");
    queryCount = 0; const second = await loaded.handleContactsGet(new Request(`https://prospector.test/api/contacts?identityCursor=${encodeURIComponent(body.identityPage.pageInfo.nextCursor)}`), deps); assert.equal(second.status, 200); assert.ok(queryCount < 50);
    const secondBody = await second.json(); assert.equal(secondBody.identityPage.items.length, 1); assert.equal(new Set([...body.identityPage.items, ...secondBody.identityPage.items].map((row) => row.id)).size, 21);
    const refreshed = await loaded.handleContactsGet(new Request("https://prospector.test/api/contacts"), deps); const refreshedCursor = (await refreshed.json()).identityPage.pageInfo.nextCursor;
    await assert.rejects(() => fixture.database.prepare("UPDATE identity_suggestions SET revision=revision+1 WHERE id='identity-page-00'").run(), /immutable identity suggestion/);
    const stable = await loaded.handleContactsGet(new Request(`https://prospector.test/api/contacts?identityCursor=${encodeURIComponent(refreshedCursor)}`), deps); assert.equal(stable.status, 200, "the database rejects in-place identity drift before it can affect a continuation");
    await fixture.database.prepare("DROP TRIGGER phase_gate_activation_disabled_insert").run();
    await fixture.database.prepare(`INSERT INTO phase_activation_gates (id,workspace_id,capability,authorization_reference,target_project_deployment,reviewed_source_digest,migration_identity_status,post_migration_evidence_reference,independent_review_reference,deployed_boundary_proof_reference,tuple_digest,accepted_at,created_at)
      VALUES ('paging-gate-change','contacts-owned','consensus_knowledge','test-authorization','test-target',?,'test-migration','test-evidence','test-review','test-boundary',?,1,1)`).bind("a".repeat(64), "b".repeat(64)).run();
    const afterGateInsert = await loaded.handleContactsGet(new Request(`https://prospector.test/api/contacts?identityCursor=${encodeURIComponent(refreshedCursor)}`), deps); assert.equal(afterGateInsert.status, 409); assert.deepEqual(await afterGateInsert.json(), { error: "contacts_page_drifted" }, "a gate insertion invalidates an issued continuation");
    const postInsert = await loaded.handleContactsGet(new Request("https://prospector.test/api/contacts"), deps); const postInsertCursor = (await postInsert.json()).identityPage.pageInfo.nextCursor;
    await fixture.database.prepare("DELETE FROM phase_activation_gates WHERE id='paging-gate-change'").run();
    const afterGateDelete = await loaded.handleContactsGet(new Request(`https://prospector.test/api/contacts?identityCursor=${encodeURIComponent(postInsertCursor)}`), deps); assert.equal(afterGateDelete.status, 409); assert.deepEqual(await afterGateDelete.json(), { error: "contacts_page_drifted" }, "a gate deletion invalidates an issued continuation");
    const foreign = await loaded.handleContactsGet(new Request("https://prospector.test/api/contacts"), { ...deps, getIdentity: async () => ({ email: "foreign@example.invalid", displayName: "Foreign" }) }); assert.equal(foreign.status, 404);
  } finally { await fixture.dispose(); }
});

test("contact histories traverse a real 45-row D1 snapshot and generation-fence same-time, backdated, and in-place drift", async () => {
  const fixture = await createD1Fixture("contacts-eligibility-pagination");
  try {
    await applyContactsMigrations(fixture.database); const lifecycle = await createApprovedProspectLifecycle(fixture);
    const interview = await fixture.vite.ssrLoadModule(new URL("../domain/interview.ts", import.meta.url).pathname); const principal = await interview.principalFromIdentity("owner@example.invalid", "Owner", "contacts-test-pepper-at-least-32-bytes");
    await fixture.database.prepare("UPDATE workspaces SET owner_subject=? WHERE id=?").bind(principal.subject, lifecycle.workspaceId).run();
    const companyId = (await fixture.database.prepare("SELECT id FROM companies WHERE workspace_id=? LIMIT 1").bind(lifecycle.workspaceId).first()).id;
    const prospect = await fixture.database.prepare("SELECT revision FROM profile_prospects WHERE id=?").bind(lifecycle.prospectId).first();
    const configuration = await fixture.database.prepare("SELECT revision,digest FROM typed_configurations WHERE id=?").bind(lifecycle.configurationId).first(); const inserts = [];
    await fixture.database.prepare("UPDATE prospecting_candidates SET status='qualified' WHERE id=(SELECT candidate_id FROM profile_prospects WHERE id=?)").bind(lifecycle.prospectId).run();
    for (let index = 0; index < 45; index += 1) {
      const suffix = String(index).padStart(2, "0"), digest = (index + 100).toString(16).padStart(64, "0"), timestamp = 1_810_000_000_100 + index;
      inserts.push(
        fixture.database.prepare("INSERT INTO contacts (id,workspace_id,created_at,updated_at,revision,company_id,identity_digest,display_name) VALUES (?,?,?,?,1,?,?,?)").bind(`page-contact-${suffix}`, lifecycle.workspaceId, timestamp, timestamp, companyId, digest, `Synthetic ${suffix}`),
        fixture.database.prepare(`INSERT INTO contact_eligibility_snapshots (id,workspace_id,contact_id,prospect_id,configuration_id,configuration_digest,configuration_revision,prospect_revision,state,eligible,observation_ids_json,reason_codes_json,preserved_suppression_refs_json,snapshot_digest,projected_at)
          VALUES (?,?,?,?,?,?,?,?,?,0,'[]','["synthetic_history"]','[]',?,?)`).bind(`page-snapshot-${suffix}`, lifecycle.workspaceId, `page-contact-${suffix}`, lifecycle.prospectId, lifecycle.configurationId, configuration.digest, Number(configuration.revision), Number(prospect.revision), index % 2 === 0 ? "ContactSuggestion" : "NeedsReview", digest, timestamp),
      );
    }
    await fixture.database.batch(inserts);
    await fixture.database.prepare(`INSERT INTO contact_eligibility_snapshots (id,workspace_id,contact_id,prospect_id,configuration_id,configuration_digest,configuration_revision,prospect_revision,state,eligible,observation_ids_json,reason_codes_json,preserved_suppression_refs_json,snapshot_digest,projected_at)
      VALUES ('page-snapshot-00-older',?,?,?,?,?,?,?,'NeedsReview',0,'[]','["older"]','[]',?,?)`).bind(lifecycle.workspaceId, "page-contact-00", lifecycle.prospectId, lifecycle.configurationId, configuration.digest, Number(configuration.revision), Number(prospect.revision), "f".repeat(64), 1_810_000_000_050).run();
    const loaded = await fixture.vite.ssrLoadModule(new URL("../domain/contacts-handler.ts", import.meta.url).pathname); const database = await activatedDatabase(fixture.database); let queryCount = 0;
    const deps = dependencies({ database: { prepare(sql) { queryCount += 1; return database.prepare(sql); }, batch: database.batch }, phase4Accepted: async () => true, commandService: { async createGrant() {}, async runGrantedOperation() {}, async applyIdentityMerge() {}, async applyIdentitySplit() {} }, now: () => 1_810_000_001_000 });
    const pages = []; let cursor = null; let firstCursor = null;
    for (let pageIndex = 0; pageIndex < 3; pageIndex += 1) {
      queryCount = 0; const url = cursor ? `https://prospector.test/api/contacts?contactsCursor=${encodeURIComponent(cursor)}` : "https://prospector.test/api/contacts";
      const response = await loaded.handleContactsGet(new Request(url), deps); assert.equal(response.status, 200); assert.ok(queryCount < 50);
      const body = await response.json(); pages.push(...body.contactsPage.items); cursor = body.contactsPage.pageInfo.nextCursor; if (pageIndex === 0) firstCursor = cursor;
      assert.equal(body.contactsPage.pageInfo.total, 45); assert.equal(body.contactsPage.pageInfo.returned, pageIndex < 2 ? 20 : 5);
    }
    assert.equal(pages.length, 45); assert.equal(new Set(pages.map((row) => `${row.prospectId}:${row.contactId}`)).size, 45); assert.ok(pages.some((row) => row.id === "page-snapshot-00")); assert.equal(pages.some((row) => row.id === "page-snapshot-00-older"), false);
    async function expectContactDrift(pageCursor, label) { const response = await loaded.handleContactsGet(new Request(`https://prospector.test/api/contacts?contactsCursor=${encodeURIComponent(pageCursor)}`), deps); assert.equal(response.status, 409, label); assert.deepEqual(await response.json(), { error: "contacts_page_drifted" }); }
    async function freshContactCursor() { const response = await loaded.handleContactsGet(new Request("https://prospector.test/api/contacts"), deps); assert.equal(response.status, 200); return (await response.json()).contactsPage.pageInfo.nextCursor; }
    await fixture.database.prepare(`INSERT INTO contact_eligibility_snapshots (id,workspace_id,contact_id,prospect_id,configuration_id,configuration_digest,configuration_revision,prospect_revision,state,eligible,observation_ids_json,reason_codes_json,preserved_suppression_refs_json,snapshot_digest,projected_at)
      VALUES ('page-snapshot-00-same-time',?,?,?,?,?,?,?,'NeedsReview',0,'[]','["same_time"]','[]',?,?)`).bind(lifecycle.workspaceId, "page-contact-00", lifecycle.prospectId, lifecycle.configurationId, configuration.digest, Number(configuration.revision), Number(prospect.revision), "e".repeat(64), 1_810_000_000_144).run();
    await expectContactDrift(firstCursor, "same-time lower-key insertion cannot enter a continuation");
    let freshCursor = await freshContactCursor();
    await fixture.database.prepare(`INSERT INTO contact_eligibility_snapshots (id,workspace_id,contact_id,prospect_id,configuration_id,configuration_digest,configuration_revision,prospect_revision,state,eligible,observation_ids_json,reason_codes_json,preserved_suppression_refs_json,snapshot_digest,projected_at)
      VALUES ('page-snapshot-01-backdated',?,?,?,?,?,?,?,'NeedsReview',0,'[]','["backdated"]','[]',?,?)`).bind(lifecycle.workspaceId, "page-contact-01", lifecycle.prospectId, lifecycle.configurationId, configuration.digest, Number(configuration.revision), Number(prospect.revision), "d".repeat(64), 1_810_000_000_075).run();
    await expectContactDrift(freshCursor, "backdated insertion cannot enter a continuation");
    freshCursor = await freshContactCursor();
    await assert.rejects(() => fixture.database.prepare("UPDATE contact_eligibility_snapshots SET reason_codes_json='[\"changed\"]' WHERE id='page-snapshot-02'").run(), /immutable contact eligibility snapshot/);
    await fixture.database.prepare("UPDATE profile_prospects SET revision=revision+1 WHERE id=?").bind(lifecycle.prospectId).run();
    await expectContactDrift(freshCursor, "dependent current authority mutation invalidates contact continuation");
  } finally { await fixture.dispose(); }
});

test("a populated contact page uses one observation and two settlement set queries for more than twenty fresh linked reservations", async () => {
  const { fixture, loaded } = await handler();
  try {
    const attestation = await fixture.vite.ssrLoadModule(new URL("../domain/contact-settlement-attestor.ts", import.meta.url).pathname);
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode("contacts integrated set-query key 0001"), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
    const attestor = attestation.bindContactSettlementAttestor({ active: { keyId: "contacts-page-key", key }, verificationOnly: [] });
    const activeDatabase = await activatedDatabase(fixture.database), now = 1_820_000_000_000, configurationDigest = "a".repeat(64);
    const observationIds = Array.from({ length: 25 }, (_, index) => `page-observation-${index}`), reservationIds = observationIds.map((_, index) => `page-reservation-${index}`);
    const snapshot = { id: "page-ready-snapshot", contact_id: "page-contact", prospect_id: "page-prospect", configuration_id: "page-configuration", configuration_digest: configurationDigest, configuration_revision: 1, prospect_revision: 1, state: "ContactReady", eligible: 1, observation_ids_json: JSON.stringify(observationIds), reason_codes_json: "[]", projected_at: now - 1, current_prospect_revision: 1, prospect_active: 1, prospect_state: "approved", current_configuration_id: "page-configuration", current_configuration_digest: configurationDigest, current_configuration_revision: 1, configuration_active: 1 };
    const observations = observationIds.map((id, index) => ({ id, contact_id: "page-contact", assignment_id: `page-assignment-${index}`, kind: "email", verification_class: "mailbox_verified", method: "mailbox_verification", source_reference: `source-${index}`, retrieved_at: now - 200, observed_at: now - 100, verified_at: now - 100, configuration_id: "page-configuration", configuration_digest: configurationDigest, assignment_prospect_id: "page-prospect", assignment_contact_id: "page-contact", assignment_configuration_id: "page-configuration", assignment_configuration_digest: configurationDigest, receipt_reservation_id: reservationIds[index] }));
    const classes = { observations: 0, headers: 0, settlements: 0 }, requested = {};
    const database = { prepare(sql) {
      const text = String(sql);
      if (text.startsWith("SELECT s.id,s.contact_id")) return { bind() { return { async all() { return { results: [snapshot] }; } }; } };
      if (text.startsWith("SELECT count(*) total FROM contact_eligibility_snapshots")) return { bind() { return { async first() { return { total: 1 }; } }; } };
      if (text.includes("FROM contact_point_observations o JOIN json_each")) return { bind(ids) { classes.observations += 1; requested.observations = JSON.parse(ids); return { async all() { return { results: observations }; } }; } };
      if (text.includes("terminal.observation_ids_json terminal_observation_ids_json") && !text.includes("row_number()")) return { bind(ids) { classes.headers += 1; requested.reservations = JSON.parse(ids); return { async all() { return { results: reservationIds.map((reservationId, index) => ({ reservation_id: reservationId, terminal_observation_ids_json: JSON.stringify([observationIds[index]]) })) }; } }; } };
      if (text.includes("row_number() OVER (PARTITION BY reservation.id")) return { bind(reservations, ids) { classes.settlements += 1; requested.settlementReservations = JSON.parse(reservations); requested.settlementObservations = JSON.parse(ids); return { async all() { return { results: [] }; } }; } };
      return activeDatabase.prepare(sql);
    }, batch: activeDatabase.batch };
    const response = await loaded.handleContactsGet(new Request("https://prospector.test/api/contacts"), dependencies({ database, contactSettlementAttestor: attestor, now: () => now }));
    assert.equal(response.status, 200); const body = await response.json();
    assert.deepEqual(classes, { observations: 1, headers: 1, settlements: 1 });
    assert.deepEqual(new Set(requested.observations), new Set(observationIds)); assert.deepEqual(new Set(requested.reservations), new Set(reservationIds));
    assert.deepEqual(new Set(requested.settlementReservations), new Set(reservationIds)); assert.deepEqual(new Set(requested.settlementObservations), new Set(observationIds));
    assert.equal(body.contactsPage.items[0].state, "NeedsReview"); assert.equal(body.contactsPage.items[0].eligible, false); assert.ok(body.contactsPage.items[0].reasonCodes.includes("contact_attestation_invalid"));
  } finally { await fixture.dispose(); }
});

test("approved prospect projection is closed, explicitly selected, and deterministically truncated", async () => {
  const { fixture, loaded } = await handler();
  try {
    const leaves = await fixture.vite.ssrLoadModule(new URL("../app/prospects/contact-leaves.tsx", import.meta.url).pathname);
    const workspace = await fixture.vite.ssrLoadModule(new URL("../app/prospects/contacts-workspace.tsx", import.meta.url).pathname);
    const base = { capability: { available: true, status: "ready", reason: "Synthetic authority." }, contactsPage: page(), approvedProspects: page([{ prospectId: "prospect-approved", prospectRevision: 7 }]), identityPage: page(), authority: { stage: "ready", grantCreation: "available", operation: "requires_grant", providerCall: false } };
    const normalized = leaves.normalizeContactsProjection(base);
    assert.ok(normalized);
    assert.deepEqual(normalized.contactsPage.items, []);
    assert.equal(workspace.selectStageOneGrantCandidate(normalized, ""), null, "there is no automatic selection");
    assert.deepEqual(workspace.selectStageOneGrantCandidate(normalized, "prospect-approved"), { prospectId: "prospect-approved", prospectRevision: 7 });
    assert.equal(workspace.selectStageOneGrantCandidate(normalized, "prospect-missing"), null, "a drifted selection cannot remain actionable");
    const observation = { kind: "email", verificationClass: "mailbox_verified", sourceCategory: "mailbox_check", freshness: "current", verifiedAt: 1_800_000_000_000 };
    for (const count of [33, 100]) {
      const withEvidence = leaves.normalizeContactsProjection({ ...base, contactsPage: page([{ id: `evidence-${count}`, contactId: "contact-evidence", prospectId: "prospect-evidence", state: "ContactReady", eligible: true, reasonCodes: [], observations: Array.from({ length: count }, () => observation) }]) });
      assert.equal(withEvidence?.contactsPage.items[0].observations.length, count, `${count} server-supported observations remain valid in the client DTO`);
    }
    assert.equal(leaves.normalizeContactsProjection({ ...base, contactsPage: page([{ id: "evidence-101", contactId: "contact-evidence", prospectId: "prospect-evidence", state: "ContactReady", eligible: true, reasonCodes: [], observations: Array.from({ length: 101 }, () => observation) }]) }), null, "the exact 100-observation per-row bound remains closed");
    const fullPageEvidence = leaves.normalizeContactsProjection({ ...base, contactsPage: page(Array.from({ length: 20 }, (_, index) => ({ id: `evidence-page-${index}`, contactId: `contact-page-${index}`, prospectId: `prospect-page-${index}`, state: "ContactReady", eligible: true, reasonCodes: [], observations: Array.from({ length: 100 }, () => observation) }))) });
    assert.equal(fullPageEvidence?.contactsPage.items.reduce((total, row) => total + row.observations.length, 0), 2_000, "a full 20-row page accepts the server's bounded 20x100 evidence contract");
    for (const approvedProspects of [
      page([{ prospectId: "prospect-approved", prospectRevision: 7, provider: "forged" }]),
      { ...page([{ prospectId: "prospect-approved", prospectRevision: 7 }]), cursor: "forged" },
      page([{ prospectId: "mailto:test@example.invalid", prospectRevision: 7 }]),
      page([{ prospectId: "1234567890", prospectRevision: 7 }]),
      page([{ prospectId: "prospect-approved", prospectRevision: 0 }]),
      page([{ prospectId: "prospect-approved", prospectRevision: 1.5 }]),
      page([{ prospectId: "prospect-approved", prospectRevision: 7 }, { prospectId: "prospect-approved", prospectRevision: 8 }]),
      { items: [{ prospectId: "prospect-approved", prospectRevision: 7 }], pageInfo: { ...page().pageInfo, returned: 1, total: 0 } },
      page([{ prospectId: "prospect-approved", prospectRevision: 7 }], 2, `${"a".repeat(30)}.${"b".repeat(30)}`),
    ]) assert.equal(leaves.normalizeContactsProjection({ ...base, approvedProspects }), null);
    assert.equal(leaves.normalizeContactsProjection({ ...base, capability: { available: false, status: "blocked", reason: "Blocked." }, approvedProspects: base.approvedProspects }), null, "blocked authority cannot carry candidates");

    const rows = Array.from({ length: 21 }, (_, index) => ({ prospect_id: `prospect-${String(21 - index).padStart(2, "0")}`, prospect_revision: index + 1, updated_at: Date.now() - 10_000 - index }));
    const activeDatabase = await activatedDatabase(fixture.database);
    const projectedDatabase = {
      prepare(sql) {
        if (String(sql).includes("SELECT p.id,p.updated_at FROM profile_prospects")) return { bind() { return { async first() { return { id: rows[0].prospect_id, updated_at: rows[0].updated_at }; } }; } };
        if (String(sql).includes("SELECT p.id prospect_id,p.revision prospect_revision")) return { bind() { return { async all() { return { results: rows }; } }; } };
        if (String(sql).includes("SELECT count(*) total FROM profile_prospects")) return { bind() { return { async first() { return { total: 2001 }; } }; } };
        return activeDatabase.prepare(sql);
      },
      batch: activeDatabase.batch,
    };
    const commandService = { async createGrant() {}, async runGrantedOperation() {}, async applyIdentityMerge() {}, async applyIdentitySplit() {} };
    const response = await loaded.handleContactsGet(new Request("https://prospector.test/api/contacts"), dependencies({ database: projectedDatabase, phase4Accepted: async () => true, commandService }));
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.approvedProspects.items.length, 20);
    assert.equal(body.approvedProspects.pageInfo.hasNext, true);
    assert.equal(body.approvedProspects.pageInfo.total, 2001, "more than two thousand valid authorities remain pageable instead of taking down Contacts");
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
    assert.deepEqual(body.identityPage.items[0].candidateRevisions, [{ subjectId: "owned-contact-a", revision: 1 }, { subjectId: "owned-contact-b", revision: 1 }]);
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
    const pageSource = await source("app/contacts/page.tsx"); assert.match(pageSource, /admitPilotOwner/); assert.match(pageSource, /ContactsWorkspace/);
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
      contactsPage: page([
        { id: "eligibility-1", contactId: "contact-1", prospectId: "prospect-1", state: "ContactReady", eligible: true, reasonCodes: [], observations: [{ kind: "email", verificationClass: "mailbox_verified", sourceCategory: "mailbox_check", freshness: "stale", verifiedAt: 1_700_000_000_000 }] },
        { id: "suggestion-1", contactId: "contact-2", prospectId: "prospect-2", state: "ContactSuggestion", eligible: false, reasonCodes: ["verification_pending"] },
        { id: "review-1", contactId: "contact-3", prospectId: "prospect-3", state: "NeedsReview", eligible: false, reasonCodes: ["contact_evidence_stale"] },
      ]),
      approvedProspects: page(),
      identityPage: page([{ id: "identity-1", subjectKind: "contact", kind: "merge", revision: 2, candidateRevisions: [{ subjectId: "contact-1", revision: 1 }, { subjectId: "contact-2", revision: 1 }], sourceLineageIds: ["lineage-1"] }]),
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
    const refreshed = await workspace.finishUnknownContactConfirmationRecovery(async (url, init) => { calls.push({ url, method: init.method ?? "GET" }); return Response.json({ capability: { available: false, status: "blocked", reason: "Blocked." }, contactsPage: page(), approvedProspects: page(), identityPage: page(), authority: { stage: "reject_only", grantCreation: "blocked", operation: "blocked", providerCall: false } }); }, recovery);
    const applied = workspace.applyUnknownContactConfirmationRecovery(recovery.state, refreshed);
    assert.equal(refreshed.projection?.authority.providerCall, false); assert.equal(applied.authorityReady, true); assert.equal(applied.confirmed, false);
    assert.deepEqual(calls, [{ url: "/api/contacts", method: "POST" }, { url: "/api/contacts", method: "GET" }], "recovery performs one safe GET and never retries POST");
    const malformed = await workspace.fetchContactsProjection(async () => Response.json({ capability: { available: false, status: "blocked", reason: "contact@example.invalid" } }));
    assert.equal(malformed.projection, null, "malformed successful responses do not become UI authority");
    const stale = confirmation.startAuthorityRefresh(recovery.state);
    assert.equal(workspace.applyUnknownContactConfirmationRecovery(stale, refreshed), stale, "a late recovery cannot overwrite a newer authority generation");
    const thrown = await workspace.finishUnknownContactConfirmationRecovery(async () => { throw new Error("offline"); }, recovery);
    assert.deepEqual({ ready: thrown.state.authorityReady, confirmed: thrown.state.confirmed, pending: thrown.state.pending }, { ready: false, confirmed: false, pending: false });

    const recoveredProjection = { capability: { available: false, status: "blocked", reason: "Recovered." }, contactsPage: page(), approvedProspects: page(), identityPage: page(), authority: { stage: "reject_only", grantCreation: "blocked", operation: "blocked", providerCall: false } };
    async function exerciseIdentityRecovery(failureMode) {
      const guard = workspace.createIdentityAuthorityGuard(); guard.finishRefresh(true);
      const attempts = new Map(), keys = new Map(); const postedKeys = []; let posts = 0, gets = 0, firstPost = failureMode !== "prelatched";
      if (failureMode === "prelatched") attempts.set("identity-recovered", { current: true });
      const fetcher = async (url, init = {}) => {
        if (init.method === "POST") {
          posts += 1; postedKeys.push(JSON.parse(init.body).idempotencyKey);
          if (firstPost) { firstPost = false; if (failureMode === "throw") throw new Error("connection lost after dispatch"); return new Response("unknown", { status: 503 }); }
          return Response.json({ command: { kind: "identity", action: "merge", status: "applied", suggestionId: "identity-recovered", resultDigest: "a".repeat(64), revision: 3 } });
        }
        gets += 1; return Response.json(recoveredProjection);
      };
      async function recover() {
        guard.beginRefresh();
        const authorityRecovery = workspace.beginUnknownContactConfirmationRecovery(confirmation.INITIAL_CONTACT_CONFIRMATION_STATE);
        const completed = await workspace.finishUnknownContactConfirmationRecovery(fetcher, authorityRecovery);
        workspace.settleIdentityAuthorityRecovery(guard, attempts, completed.projection !== null);
      }
      async function explicitAction() {
        if (!guard.tryBeginMutation()) return null;
        const attempt = attempts.get("identity-recovered") ?? { current: false }; attempts.set("identity-recovered", attempt);
        keys.set("identity-recovered", keys.get("identity-recovered") ?? "identity-recovered-key");
        try { const response = await workspace.postContactsCommandOnce(fetcher, { action: "apply_identity_merge", idempotencyKey: keys.get("identity-recovered") }, attempt); if (!response || !response.ok) { await recover(); return null; } return response; }
        catch { await recover(); return null; }
      }
      assert.equal(await explicitAction(), null); assert.equal(posts, failureMode === "prelatched" ? 0 : 1); assert.equal(gets, 1, `${failureMode}: recovery performs exactly one GET and never retries the POST`);
      assert.deepEqual(guard.snapshot(), { authorityReady: true, pending: false }); assert.equal(attempts.size, 0, `${failureMode}: successful authority recovery retires the uncertain attempt before reopening controls`); assert.equal(keys.size, 1, `${failureMode}: recovery retains the stable idempotency key for later explicit convergence`);
      assert.equal(posts, failureMode === "prelatched" ? 0 : 1, `${failureMode}: recovery itself does not send`);
      assert.equal((await explicitAction()).status, 200); assert.equal(posts, failureMode === "prelatched" ? 1 : 2, `${failureMode}: the next separately explicit action can send exactly once`); assert.deepEqual(postedKeys, failureMode === "prelatched" ? ["identity-recovered-key"] : ["identity-recovered-key", "identity-recovered-key"], `${failureMode}: the later explicit action safely reuses the original idempotency key`);
    }
    await exerciseIdentityRecovery("non_ok");
    await exerciseIdentityRecovery("throw");
    await exerciseIdentityRecovery("prelatched");

    const failedGuard = workspace.createIdentityAuthorityGuard(); failedGuard.finishRefresh(true);
    const failedAttempts = new Map([["identity-failed", { current: true }]]), failedKeys = new Map([["identity-failed", "identity-failed-key"]]);
    let failedGets = 0, failedPosts = 0;
    assert.equal(failedGuard.tryBeginMutation(), true);
    const missingResponse = await workspace.postContactsCommandOnce(async () => { failedPosts += 1; return new Response("unexpected"); }, { action: "apply_identity_merge", idempotencyKey: failedKeys.get("identity-failed") }, failedAttempts.get("identity-failed"));
    assert.equal(missingResponse, null); failedGuard.beginRefresh();
    const failedRecovery = workspace.beginUnknownContactConfirmationRecovery(confirmation.INITIAL_CONTACT_CONFIRMATION_STATE);
    const failedCompletion = await workspace.finishUnknownContactConfirmationRecovery(async () => { failedGets += 1; return Response.json({ malformed: true }); }, failedRecovery);
    workspace.settleIdentityAuthorityRecovery(failedGuard, failedAttempts, failedCompletion.projection !== null);
    assert.deepEqual(failedGuard.snapshot(), { authorityReady: false, pending: false }); assert.equal(failedGuard.tryBeginMutation(), false, "failed recovery keeps identity actions disabled until another authoritative refresh succeeds");
    assert.equal(failedPosts, 0); assert.equal(failedGets, 1, "a pre-latched null result performs one authoritative GET and no POST or automatic retry");
    assert.equal(failedAttempts.size, 1); assert.equal(failedKeys.get("identity-failed"), "identity-failed-key", "failed recovery does not falsely retire an unresolved attempt or its convergence key");
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
    const baseActive = { capability: { available: true, status: "ready", reason: "Synthetic authority." }, contactsPage: page([activeRow]), approvedProspects: page([{ prospectId: "prospect-one", prospectRevision: 8 }]), identityPage: page(), authority: { stage: "ready", grantCreation: "available", operation: "requires_grant", providerCall: false } };
    const active = leaves.normalizeContactsProjection(baseActive); assert.equal(active.capability.available, true); assert.equal(active.contactsPage.items[0].prospectRevision, 8);
    const oneCandidateMerge = { id: "merge-one", subjectKind: "contact", kind: "merge", revision: 1, candidateRevisions: [{ subjectId: "contact-one", revision: 1 }], sourceLineageIds: ["lineage-one"] };
    assert.equal(leaves.normalizeContactsProjection({ ...baseActive, identityPage: page([oneCandidateMerge]) }), null, "one-candidate merge is not actionable");
    assert.equal(leaves.normalizeContactsProjection({ ...baseActive, identityPage: page([{ ...oneCandidateMerge, candidateRevisions: [...oneCandidateMerge.candidateRevisions, { subjectId: "contact-two", revision: 1 }] }]) }).identityPage.items.length, 1, "two-candidate merge is accepted");
    const sourceText = await source("app/prospects/contacts-workspace.tsx"); assert.doesNotMatch(sourceText, /synthetic-preview-only|candidateRevisions\[0\]/); assert.match(sourceText, /Partial grant receipt/); assert.match(sourceText, /stageTwoAuthorityComplete = false/); assert.match(sourceText, /selectedPrimary/);
    const route = await source("app/api/contacts/route.ts"); assert.match(route, /isLocalDemoRequest/); assert.doesNotMatch(route, /commandService|phase4Accepted/);
  } finally { await fixture.dispose(); }
});
