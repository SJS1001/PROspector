import assert from "node:assert/strict";
import test from "node:test";
import { applyMigrations, countRows, createD1Fixture } from "./helpers/d1.mjs";
import {
  NOW,
  applyEnrichmentLineageCandidate,
  createApprovedProspectLifecycle,
  createSyntheticContactSettlementAttestor,
  seedSyntheticReservationInputs,
  snapshotLaterPhaseEffects,
} from "./helpers/phase5-integration.mjs";

test("forward candidate repairs real Approved Prospect issuance and reservation without rewriting prior authority", async () => {
  const fixture = await createD1Fixture("phase5-controlled-enrichment-lifecycle");
  try {
    await applyMigrations(fixture.database);
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
    const snapshot = await repository.loadIssuanceSnapshot(lifecycle.owner.subject,[lifecycle.prospectId]);
    assert.equal(snapshot?.admitted, true);
    const issuance = await fixture.vite.ssrLoadModule(new URL("../domain/enrichment-grant-issuance.ts", import.meta.url).pathname);
    const authority = await fixture.vite.ssrLoadModule(new URL("../domain/enrichment-authority.ts", import.meta.url).pathname);
    const request = { principalSubject:lifecycle.owner.subject,prospectIds:[lifecycle.prospectId],operation:"business_contact_lookup/v1",maxUnits:1,maxCostMinor:10,currency:"CAD",expiresAt:NOW+5_000,expectedRevision:snapshot.revision,idempotencyKey:"p5i-grant",now:NOW+5 };
    await assert.rejects(issuance.issueEnrichmentGrant(repository,request),
      /enrichment_grant_commit_failed/, "the old trigger still rejects the actual observed candidate");
    assert.equal(await countRows(fixture.database,"enrichment_grants"),0);
    assert.equal(await countRows(fixture.database,"enrichment_reservations"),0);
    assert.equal(await countRows(fixture.database,"contact_point_observations"),0);

    await applyEnrichmentLineageCandidate(fixture.database);
    const laterEffectsBefore = await snapshotLaterPhaseEffects(fixture.database);
    const issued = await issuance.issueEnrichmentGrant(repository,request);
    assert.equal(issued.kind,"issued");
    assert.equal((await issuance.issueEnrichmentGrant(repository,request)).replayed,true);
    assert.equal(await countRows(fixture.database,"enrichment_grants"),1);
    await seedSyntheticReservationInputs(fixture.database,lifecycle,issued.grant);
    const reservationRequest = {grantId:issued.grant.id,principalSubject:lifecycle.owner.subject,operationKey:issued.grant.tuple.operationKey,now:NOW+6};
    const reserved = await authority.reserveEnrichmentOperation(repository,reservationRequest);
    assert.equal(reserved.kind,"reserved");
    assert.equal((await authority.reserveEnrichmentOperation(repository,reservationRequest)).kind,"blocked", "a consumed grant cannot reserve a second time");
    assert.equal(await countRows(fixture.database,"enrichment_reservations"),1);
    const claimed = await authority.claimAdmittedCommittedInvocation(repository,reserved.reservation.id,NOW+7);
    assert.equal(claimed.kind,"claimed");
    await repository.markNeedsReconciliation(reserved.reservation.id,"timeout");
    assert.notEqual((await authority.claimAdmittedCommittedInvocation(repository,reserved.reservation.id,NOW+8)).kind,"claimed");
    assert.equal(await countRows(fixture.database,"contact_point_observations"),0);
    await fixture.database.prepare("UPDATE typed_configurations SET active=0 WHERE id=?").bind(lifecycle.configurationId).run();
    assert.equal(await repository.loadIssuanceSnapshot(lifecycle.owner.subject,[lifecycle.prospectId]),null,"deactivated configuration still denies authority");

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

test("a non-observed/non-qualified candidate remains denied before grant issuance", async () => {
  const fixture = await createD1Fixture("phase5-controlled-enrichment-rejected-candidate");
  try {
    const { lifecycle, repository, issuance } = await readyObservedCandidate(fixture);
    await fixture.database.prepare("UPDATE prospecting_candidates SET status='rejected' WHERE id=(SELECT candidate_id FROM profile_prospects WHERE id=? AND workspace_id=?)")
      .bind(lifecycle.prospectId,lifecycle.workspaceId).run();
    assert.equal(await repository.loadIssuanceSnapshot(lifecycle.owner.subject,[lifecycle.prospectId]),null);
    const result = await issuance.issueEnrichmentGrant(repository,grantRequest(lifecycle,1,"p5i-rejected-candidate"));
    assert.equal(result.kind,"blocked");
    assert.equal(await countRows(fixture.database,"enrichment_grants"),0);
    assert.equal(await countRows(fixture.database,"enrichment_reservations"),0);
    assert.equal(await countRows(fixture.database,"contact_point_observations"),0);
  } finally { await fixture.dispose(); }
});

test("candidate lineage invalidated after issuance blocks reservation without observations", async () => {
  const fixture = await createD1Fixture("phase5-controlled-enrichment-stale-candidate");
  try {
    const { lifecycle, repository, issuance, authority } = await readyObservedCandidate(fixture);
    const snapshot = await repository.loadIssuanceSnapshot(lifecycle.owner.subject,[lifecycle.prospectId]);
    assert.equal(snapshot?.admitted,true);
    const issued = await issuance.issueEnrichmentGrant(repository,grantRequest(lifecycle,snapshot.revision,"p5i-stale-candidate"));
    assert.equal(issued.kind,"issued");
    await seedSyntheticReservationInputs(fixture.database,lifecycle,issued.grant);
    await fixture.database.prepare("UPDATE prospecting_candidates SET status='invalid' WHERE id=(SELECT candidate_id FROM profile_prospects WHERE id=? AND workspace_id=?)")
      .bind(lifecycle.prospectId,lifecycle.workspaceId).run();
    const result = await authority.reserveEnrichmentOperation(repository,{grantId:issued.grant.id,principalSubject:lifecycle.owner.subject,operationKey:issued.grant.tuple.operationKey,now:NOW+6});
    assert.equal(result.kind,"blocked");
    assert.equal(await countRows(fixture.database,"enrichment_reservations"),0);
    assert.equal(await countRows(fixture.database,"contact_point_observations"),0);
  } finally { await fixture.dispose(); }
});

test("actual services settle one synthetic provider result into current ContactReady without later effects", async () => {
  const fixture = await createD1Fixture("phase5-controlled-enrichment-success");
  try {
    await applyMigrations(fixture.database);
    await applyEnrichmentLineageCandidate(fixture.database);
    const lifecycle = await createApprovedProspectLifecycle(fixture);
    await fixture.database.prepare(`INSERT INTO provider_quotes
      (id,workspace_id,provider_id,provider_version,catalog_ref,revision,operation,currency,unit_cost_minor,quote_digest,expires_at,created_at)
      VALUES ('p5i-quote',?,'synthetic-contact-provider','v1','synthetic-catalog',1,'business_contact_lookup/v1','CAD',10,?,?,?)`)
      .bind(lifecycle.workspaceId,"b".repeat(64),NOW+20_000,NOW).run();
    const [repositoryModule, issuance, authority, operation, providerPort, contactEvidence, eligibility, settlementPersistence] = await Promise.all([
      load(fixture,"enrichment-repository"), load(fixture,"enrichment-grant-issuance"),
      load(fixture,"enrichment-authority"), load(fixture,"enrichment-operation"),
      load(fixture,"contact-provider-port"), load(fixture,"contact-evidence"),
      load(fixture,"contact-eligibility"), load(fixture,"contact-settlement-persistence"),
    ]);
    const baseRepository = repositoryModule.createD1EnrichmentRepository(fixture.database, {
      workspaceId:lifecycle.workspaceId,
      ownerSubject:lifecycle.owner.subject,
      now:()=>NOW+10,
      contactSettlementAttestor:await createSyntheticContactSettlementAttestor(fixture),
    });
    let settledObservations = Object.freeze([]);
    const repository = Object.freeze({
      ...baseRepository,
      async settleReservation(reservationId, settlement) {
        const acknowledgement = await baseRepository.settleReservation(reservationId,settlement);
        settledObservations = Object.freeze([...settlement.observations]);
        return acknowledgement;
      },
    });
    const snapshot = await repository.loadIssuanceSnapshot(lifecycle.owner.subject,[lifecycle.prospectId]);
    assert.equal(snapshot?.admitted,true);
    const issued = await issuance.issueEnrichmentGrant(repository,grantRequest(lifecycle,snapshot.revision,"p5i-success"));
    assert.equal(issued.kind,"issued");
    await seedSyntheticReservationInputs(fixture.database,lifecycle,issued.grant);
    const reserved = await authority.reserveEnrichmentOperation(repository,{
      grantId:issued.grant.id,
      principalSubject:lifecycle.owner.subject,
      operationKey:issued.grant.tuple.operationKey,
      now:NOW+6,
    });
    assert.equal(reserved.kind,"reserved");
    const binding = reserved.reservation.assignment.evidenceAssignments[0];
    const evidence = Object.freeze({
      id:"p5i-success-observation",
      assignmentId:binding.assignmentId,
      prospectId:binding.prospectId,
      workspaceId:binding.workspaceId,
      contactId:binding.contactId,
      profileConfigurationId:binding.profileConfigurationId,
      profileConfigurationDigest:binding.profileConfigurationDigest,
      kind:"email",
      value:"verified-contact@example.invalid",
      confidence:1,
      provenance:Object.freeze({
        sourceReference:"source:synthetic-phase5-integration",
        excerpt:"Synthetic mailbox verification evidence.",
        objectReference:"object:synthetic-phase5-integration",
        contentHash:"e".repeat(64),
        retrievedAt:NOW+1,
      }),
      observedAt:NOW+3,
    });
    let providerCalls = 0;
    const port = providerPort.bindContactProviderPort({
      providerId:issued.grant.tuple.providerId,
      providerVersion:issued.grant.tuple.providerVersion,
      catalogRef:issued.grant.tuple.catalogRef,
    },async (assignment) => {
      providerCalls += 1;
      return Object.freeze({
        kind:"completed",
        reservationId:assignment.reservationId,
        operationKey:assignment.operationKey,
        documentedUnits:1,
        documentedCostMinor:10,
        evidence:Object.freeze([evidence]),
      });
    });
    const verifier = contactEvidence.bindContactEvidenceVerifier({
      verifierId:"phase5-synthetic-verifier",
      verifierVersion:"v1",
    },async () => Object.freeze({
      observationId:evidence.id,
      workspaceId:evidence.workspaceId,
      contactId:evidence.contactId,
      profileConfigurationId:evidence.profileConfigurationId,
      profileConfigurationDigest:evidence.profileConfigurationDigest,
      kind:evidence.kind,
      normalizedValue:evidence.value,
      contentHash:evidence.provenance.contentHash,
      verificationClass:"mailbox_verified",
      method:"mailbox_verification",
      verifiedAt:NOW+2,
      providerId:issued.grant.tuple.providerId,
      providerVersion:issued.grant.tuple.providerVersion,
      catalogRef:issued.grant.tuple.catalogRef,
      verdictReference:"verdict:synthetic-phase5-integration",
      verdictDigest:"f".repeat(64),
    }));
    const laterEffectsBefore = await snapshotLaterPhaseEffects(fixture.database);
    const execution = await operation.executeEnrichmentOperation(repository,port,{reservationId:reserved.reservation.id,now:NOW+7},verifier);
    assert.deepEqual(execution,{kind:"settled",outcome:"completed"});
    assert.equal(providerCalls,1);
    assert.equal(settledObservations.length,1);
    assert.equal(await countRows(fixture.database,"contact_point_observations"),1);
    assert.equal(await countRows(fixture.database,"contact_verification_receipts"),1);
    const terminal = await fixture.database.prepare(`SELECT state,terminal_reason,documented_units,documented_cost_minor
      FROM enrichment_reservation_events WHERE reservation_id=? ORDER BY durable_revision DESC LIMIT 1`)
      .bind(reserved.reservation.id).first();
    assert.deepEqual(terminal,{state:"settled",terminal_reason:"completed",documented_units:1,documented_cost_minor:10});
    const budgets = (await fixture.database.prepare(`SELECT actual_units,reserved_units,actual_cost_minor,reserved_cost_minor
      FROM enrichment_budget_accounts WHERE workspace_id=? ORDER BY scope`)
      .bind(lifecycle.workspaceId).all()).results;
    assert.equal(budgets.length,4);
    assert.deepEqual(budgets.map((row) => ({
      actualUnits:Number(row.actual_units),
      reservedUnits:Number(row.reserved_units),
      actualCostMinor:Number(row.actual_cost_minor),
      reservedCostMinor:Number(row.reserved_cost_minor),
    })),Array.from({length:4},() => ({actualUnits:1,reservedUnits:0,actualCostMinor:10,reservedCostMinor:0})));
    assert.equal(await settlementPersistence.verifyPersistedContactSettlement(
      fixture.database,
      await createSyntheticContactSettlementAttestor(fixture),
      lifecycle.workspaceId,
      reserved.reservation.id,
    ),true);
    const projectionInput = {
      target:{workspaceId:lifecycle.workspaceId,prospectId:lifecycle.prospectId,contactId:binding.contactId},
      points:settledObservations,
      strategy:{configurationId:lifecycle.configurationId,configurationDigest:lifecycle.configurationDigest},
      authority:{
        prospectId:lifecycle.prospectId,
        configurationId:lifecycle.configurationId,
        configurationDigest:lifecycle.configurationDigest,
        profileAvailable:true,
        configurationCurrent:true,
        drifted:false,
        disqualified:false,
        suppressed:false,
        phase4Approved:true,
        contactCapabilityEnabled:true,
      },
      now:NOW+8,
    };
    const contactReady = eligibility.projectContactEligibility(projectionInput);
    assert.equal(contactReady.state,"ContactReady");
    assert.equal(contactReady.eligible,true);
    for (const recheck of [
      eligibility.recheckForPackageApproval,
      eligibility.recheckForCrmExport,
      eligibility.recheckForClickToCall,
      eligibility.recheckForFinalSend,
    ]) {
      const result = recheck(projectionInput);
      assert.equal(result.blocked,true);
      assert.equal(result.eligibility.state,"ContactReady");
      assert.deepEqual(result.effectsBefore,eligibility.zeroDownstreamEffects());
      assert.deepEqual(result.effectsAfter,eligibility.zeroDownstreamEffects());
    }
    assert.equal((await operation.executeEnrichmentOperation(repository,port,{reservationId:reserved.reservation.id,now:NOW+9},verifier)).kind,"blocked");
    assert.equal(providerCalls,1,"settled operations cannot be invoked twice");
    assert.deepEqual(await snapshotLaterPhaseEffects(fixture.database),laterEffectsBefore);
  } finally { await fixture.dispose(); }
});

async function readyObservedCandidate(fixture) {
  await applyMigrations(fixture.database); await applyEnrichmentLineageCandidate(fixture.database);
  const lifecycle = await createApprovedProspectLifecycle(fixture);
  await fixture.database.prepare(`INSERT INTO provider_quotes
    (id,workspace_id,provider_id,provider_version,catalog_ref,revision,operation,currency,unit_cost_minor,quote_digest,expires_at,created_at)
    VALUES ('p5i-quote',?,'synthetic-contact-provider','v1','synthetic-catalog',1,'business_contact_lookup/v1','CAD',10,?,?,?)`)
    .bind(lifecycle.workspaceId,"b".repeat(64),NOW+20_000,NOW).run();
  const [repositoryModule,issuance,authority] = await Promise.all([
    fixture.vite.ssrLoadModule(new URL("../domain/enrichment-repository.ts", import.meta.url).pathname),
    fixture.vite.ssrLoadModule(new URL("../domain/enrichment-grant-issuance.ts", import.meta.url).pathname),
    fixture.vite.ssrLoadModule(new URL("../domain/enrichment-authority.ts", import.meta.url).pathname),
  ]);
  const repository = repositoryModule.createD1EnrichmentRepository(fixture.database,{workspaceId:lifecycle.workspaceId,ownerSubject:lifecycle.owner.subject,now:()=>NOW});
  return { lifecycle, repository, issuance, authority };
}

function grantRequest(lifecycle, expectedRevision, idempotencyKey) { return { principalSubject:lifecycle.owner.subject,prospectIds:[lifecycle.prospectId],operation:"business_contact_lookup/v1",maxUnits:1,maxCostMinor:10,currency:"CAD",expiresAt:NOW+5_000,expectedRevision,idempotencyKey,now:NOW+5 }; }

function load(fixture,name) { return fixture.vite.ssrLoadModule(new URL(`../domain/${name}.ts`,import.meta.url).pathname); }
