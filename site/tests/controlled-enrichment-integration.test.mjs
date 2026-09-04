import assert from "node:assert/strict";
import test from "node:test";
import { applyMigrations, countRows, createD1Fixture } from "./helpers/d1.mjs";
import { NOW, createApprovedProspectLifecycle, snapshotLaterPhaseEffects } from "./helpers/phase5-integration.mjs";

test("real Approved Prospect lifecycle exposes the Phase 4 to Phase 5 status defect without forged authority", async () => {
  const fixture = await createD1Fixture("phase5-controlled-enrichment-lifecycle");
  try {
    await applyMigrations(fixture.database);
    const laterEffectsBefore = await snapshotLaterPhaseEffects(fixture.database);
    const lifecycle = await createApprovedProspectLifecycle(fixture);
    await fixture.database.prepare(`INSERT INTO provider_quotes
      (id,workspace_id,provider_id,provider_version,catalog_ref,revision,operation,currency,unit_cost_minor,quote_digest,expires_at,created_at)
      VALUES ('p5i-quote',?,'synthetic-contact-provider','v1','synthetic-catalog',1,'business_contact_lookup/v1','CAD',10,?,?,?)`)
      .bind(lifecycle.workspaceId,"b".repeat(64),NOW+20_000,NOW).run();
    const repositoryModule = await fixture.vite.ssrLoadModule(new URL("../domain/enrichment-repository.ts", import.meta.url).pathname);
    const repository = repositoryModule.createD1EnrichmentRepository(fixture.database, {
      workspaceId: lifecycle.workspaceId, ownerSubject: lifecycle.owner.subject, now: () => NOW,
    });
    const persisted = await fixture.database.prepare(`SELECT p.state,p.active,pc.status candidate_status,qa.outcome,c.active configuration_active
      FROM profile_prospects p JOIN prospecting_candidates pc ON pc.id=p.candidate_id AND pc.workspace_id=p.workspace_id
      JOIN qualification_assessments qa ON qa.id=p.assessment_id AND qa.workspace_id=p.workspace_id
      JOIN typed_configurations c ON c.id=qa.configuration_id AND c.workspace_id=p.workspace_id WHERE p.id=?`)
      .bind(lifecycle.prospectId).first();
    assert.deepEqual(persisted, { state:"approved", active:1, candidate_status:"observed", outcome:"Passed", configuration_active:1 });
    assert.equal(await repository.loadIssuanceSnapshot(lifecycle.owner.subject,[lifecycle.prospectId]), null,
      "Phase 5 requires a candidate status that no Phase 4 service produces");
    assert.equal(await countRows(fixture.database,"enrichment_grants"),0);
    assert.equal(await countRows(fixture.database,"enrichment_reservations"),0);
    assert.equal(await countRows(fixture.database,"contact_point_observations"),0);

    const contacts = await fixture.vite.ssrLoadModule(new URL("../domain/contacts-handler.ts", import.meta.url).pathname);
    const identity = { email:"phase5-integration-owner@example.invalid", displayName:"Phase 5 integration owner" };
    const subjectPepper = "phase5-integration-owner-pepper-at-least-thirty-two-bytes";
    const access = await fixture.vite.ssrLoadModule(new URL("../domain/pilot-access.ts", import.meta.url).pathname);
    const admitted = await access.admitPilotOwner(identity,identity.email,subjectPepper);
    await fixture.database.prepare("UPDATE workspaces SET owner_subject=? WHERE id=?").bind(admitted.subject,lifecycle.workspaceId).run();
    const dependencies = { database:fixture.database, subjectPepper, pilotOwnerEmail:identity.email, async getIdentity(){return identity;} };
    const get = await contacts.handleContactsGet(new Request("https://prospector.test/api/contacts"),dependencies);
    assert.equal(get.status,200);
    assert.deepEqual((await get.clone().json()).authority,{stage:"reject_only",grantCreation:"blocked",operation:"blocked",providerCall:false});
    const cookie = /(__Host-prospector-csrf=[A-Za-z0-9_-]{43})/.exec(get.headers.get("set-cookie")??"")?.[1];
    assert.ok(cookie);
    const denied = await contacts.handleContactsPost(new Request("https://prospector.test/api/contacts",{
      method:"POST",headers:{"content-type":"application/json",cookie,origin:"https://prospector.test","sec-fetch-site":"same-origin","x-prospector-intent":contacts.CONTACTS_MUTATION_INTENT},
      body:JSON.stringify({action:"run_granted_operation",grantId:"synthetic-unavailable-grant",idempotencyKey:"p5i-runtime-denial"}),
    }),dependencies);
    assert.equal(denied.status,409);
    assert.equal((await denied.json()).error,"contacts_capability_unavailable");
    assert.deepEqual(await snapshotLaterPhaseEffects(fixture.database),laterEffectsBefore);
  } finally { await fixture.dispose(); }
});
