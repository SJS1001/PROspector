import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { countRows } from "./helpers/d1.mjs";
import {
  NOW,
  advancingClock,
  applyCanonicalPhase5IntegrationMigrations,
  createApprovedProspectLifecycle,
  createPhase5D1Fixture as createD1Fixture,
  createSyntheticContactSettlementAttestor,
  loadPhase5Domain,
  seedSyntheticReservationInputs,
  snapshotLaterPhaseEffects,
} from "./helpers/phase5-integration.mjs";

test("the canonical migration head supports Approved Prospect issuance and reservation without manual migration subsets", async () => {
  const fixture = await createD1Fixture("phase5-controlled-enrichment-lifecycle");
  try {
    await applyCanonicalPhase5IntegrationMigrations(fixture.database);
    const lifecycle = await createApprovedProspectLifecycle(fixture);
    await fixture.database.prepare(`INSERT INTO provider_quotes
      (id,workspace_id,provider_id,provider_version,catalog_ref,revision,operation,currency,unit_cost_minor,quote_digest,expires_at,created_at)
      VALUES ('p5i-quote',?,'synthetic-contact-provider','v1','synthetic-catalog',1,'business_contact_lookup/v1','CAD',10,?,?,?)`)
      .bind(lifecycle.workspaceId,"b".repeat(64),NOW+20_000,NOW).run();
    const [authority,repositoryModule,issuance] = await loadDomain(fixture,["enrichment-authority","enrichment-repository","enrichment-grant-issuance"]);
    const repository = repositoryModule.createD1EnrichmentRepository(fixture.database, {
      workspaceId: lifecycle.workspaceId, ownerSubject: lifecycle.owner.subject, now: advancingClock(NOW + 5),
    });
    const persisted = await fixture.database.prepare(`SELECT p.state,p.active,pc.status candidate_status,qa.outcome,c.active configuration_active
      FROM profile_prospects p JOIN prospecting_candidates pc ON pc.id=p.candidate_id AND pc.workspace_id=p.workspace_id
      JOIN qualification_assessments qa ON qa.id=p.assessment_id AND qa.workspace_id=p.workspace_id
      JOIN typed_configurations c ON c.id=qa.configuration_id AND c.workspace_id=p.workspace_id WHERE p.id=?`)
      .bind(lifecycle.prospectId).first();
    assert.deepEqual(persisted, { state:"approved", active:1, candidate_status:"observed", outcome:"Passed", configuration_active:1 });
    const snapshot = await repository.loadIssuanceSnapshot(lifecycle.owner.subject,[lifecycle.prospectId]);
    assert.equal(snapshot?.admitted, true);
    const request = { principalSubject:lifecycle.owner.subject,prospectIds:[lifecycle.prospectId],operation:"business_contact_lookup/v1",maxUnits:1,maxCostMinor:10,currency:"CAD",expiresAt:NOW+5_000,expectedRevision:snapshot.revision,idempotencyKey:"p5i-grant",now:NOW+5 };
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
      body:JSON.stringify({action:"run_granted_operation",grantId:"synthetic-unavailable-grant"}),
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

test("an expired provider quote blocks grant issuance with zero calls and zero durable authority", async () => {
  const fixture = await createD1Fixture("phase5-controlled-enrichment-stale-quote");
  try {
    const { lifecycle, issuance } = await readyObservedCandidate(fixture);
    const [repositoryModule] = await loadDomain(fixture,["enrichment-repository"]);
    const repository = repositoryModule.createD1EnrichmentRepository(fixture.database,{workspaceId:lifecycle.workspaceId,ownerSubject:lifecycle.owner.subject,now:()=>NOW+30_000});
    const before = await snapshotLaterPhaseEffects(fixture.database);
    const snapshot = await repository.loadIssuanceSnapshot(lifecycle.owner.subject,[lifecycle.prospectId]);
    assert.equal(snapshot?.admitted,true);
    const request={...grantRequest(lifecycle,snapshot.revision,"p5i-stale-quote"),now:NOW+30_000,expiresAt:NOW+31_000};
    assert.equal((await issuance.issueEnrichmentGrant(repository,request)).kind,"blocked");
    assert.equal(await countRows(fixture.database,"enrichment_grants"),0);
    assert.equal(await countRows(fixture.database,"enrichment_reservations"),0);
    assert.equal(await countRows(fixture.database,"contact_point_observations"),0);
    assert.deepEqual(await snapshotLaterPhaseEffects(fixture.database),before);
  } finally { await fixture.dispose(); }
});

test("actual services settle one synthetic provider result into current ContactReady without later effects", async () => {
  const fixture = await createD1Fixture("phase5-controlled-enrichment-success");
  try {
    await applyCanonicalPhase5IntegrationMigrations(fixture.database);
    const lifecycle = await createApprovedProspectLifecycle(fixture);
    await fixture.database.prepare(`INSERT INTO provider_quotes
      (id,workspace_id,provider_id,provider_version,catalog_ref,revision,operation,currency,unit_cost_minor,quote_digest,expires_at,created_at)
      VALUES ('p5i-quote',?,'synthetic-contact-provider','v1','synthetic-catalog',1,'business_contact_lookup/v1','CAD',10,?,?,?)`)
      .bind(lifecycle.workspaceId,"b".repeat(64),NOW+20_000,NOW).run();
    // Load the persistence module before the projector so Vite's SSR test graph
    // shares the same process-local evidence brand used by the real module graph.
    // Concurrent top-level SSR loads can instantiate duplicate module records.
    const settlementPersistence = await load(fixture,"contact-settlement-persistence");
    const eligibility = await load(fixture,"contact-eligibility");
    const eligibilityPersistence = await load(fixture,"contact-eligibility-persistence");
    const [repositoryModule, issuance, authority, operation, providerPort, contactEvidence] = await loadDomain(fixture, [
      "enrichment-repository", "enrichment-grant-issuance",
      "enrichment-authority", "enrichment-operation",
      "contact-provider-port", "contact-evidence",
    ]);
    const settlementAttestor = await createSyntheticContactSettlementAttestor(fixture);
    const repository = repositoryModule.createD1EnrichmentRepository(fixture.database, {
      workspaceId:lifecycle.workspaceId,
      ownerSubject:lifecycle.owner.subject,
      now:advancingClock(NOW+10),
      contactSettlementAttestor:settlementAttestor,
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
    const execution = await operation.executeEnrichmentOperation(repository,port,{reservationId:reserved.reservation.id,now:NOW+100},verifier);
    assert.deepEqual(execution,{kind:"settled",outcome:"completed"});
    assert.equal(providerCalls,1);
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
    const restartedAttestor = await createSyntheticContactSettlementAttestor(fixture);
    assert.notEqual(restartedAttestor,settlementAttestor,"restart reconstructs authority from the same nonextractable key material");
    assert.equal(await settlementPersistence.verifyPersistedContactSettlement(
      fixture.database,
      restartedAttestor,
      lifecycle.workspaceId,
      reserved.reservation.id,
    ),true);
    const verifiedPageSettlements = await settlementPersistence.verifyPersistedContactSettlements(
      fixture.database,
      restartedAttestor,
      lifecycle.workspaceId,
      [reserved.reservation.id],
    );
    assert.equal(verifiedPageSettlements.get(reserved.reservation.id),true,"the fixed-query page verifier preserves complete valid attestation semantics");
    const persistedPoints = await settlementPersistence.readVerifiedContactEligibilityEvidence(
      fixture.database,
      restartedAttestor,
      {
        ownerSubject:lifecycle.owner.subject,
        workspaceId:lifecycle.workspaceId,
        reservationId:reserved.reservation.id,
        prospectId:lifecycle.prospectId,
        contactId:binding.contactId,
        configurationId:lifecycle.configurationId,
        configurationDigest:lifecycle.configurationDigest,
      },
    );
    assert.equal(persistedPoints?.length,1);
    assert.equal(settlementPersistence.isVerifiedPersistedContactEligibilityEvidence(persistedPoints[0]),true);
    assert.equal(contactEvidence.isDefensivelyValidContactObservation(persistedPoints[0]),false,"restart evidence carries no in-memory ingestion receipt");
    assert.equal(settlementPersistence.isVerifiedPersistedContactEligibilityEvidence(structuredClone(persistedPoints[0])),false,"a structural copy loses durable replay authority");
    for (const sensitiveKey of ["value","normalizedValue","provenance","providerId","sourceReference","excerpt","objectReference"]) {
      assert.equal(sensitiveKey in persistedPoints[0],false,`rehydrated eligibility evidence excludes ${sensitiveKey}`);
    }
    assert.equal(await settlementPersistence.readVerifiedContactEligibilityEvidence(
      fixture.database,
      restartedAttestor,
      {
        ownerSubject:"wrong-owner",
        workspaceId:lifecycle.workspaceId,
        reservationId:reserved.reservation.id,
        prospectId:lifecycle.prospectId,
        contactId:binding.contactId,
        configurationId:lifecycle.configurationId,
        configurationDigest:lifecycle.configurationDigest,
      },
    ),null);
    assert.equal(await settlementPersistence.readVerifiedContactEligibilityEvidence(
      fixture.database,
      restartedAttestor,
      {
        ownerSubject:lifecycle.owner.subject,
        workspaceId:lifecycle.workspaceId,
        reservationId:reserved.reservation.id,
        prospectId:lifecycle.prospectId,
        contactId:binding.contactId,
        configurationId:lifecycle.configurationId,
        configurationDigest:"0".repeat(64),
      },
    ),null,"configuration drift cannot replay verified evidence");
    const projectionInput = {
      target:{workspaceId:lifecycle.workspaceId,prospectId:lifecycle.prospectId,contactId:binding.contactId},
      points:persistedPoints,
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
    assert.equal(contactReady.state,"ContactReady",JSON.stringify(contactReady));
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
    const negativeProjectionCases = [
      ["stale contact", {...projectionInput,now:NOW+31*24*60*60*1000}],
      ["configuration mismatch", {...projectionInput,strategy:{...projectionInput.strategy,configurationDigest:"0".repeat(64)}}],
      ["configuration inactive", {...projectionInput,authority:{...projectionInput.authority,configurationCurrent:false}}],
      ["configuration drift", {...projectionInput,authority:{...projectionInput.authority,drifted:true}}],
      ["prospect disqualified", {...projectionInput,authority:{...projectionInput.authority,disqualified:true}}],
      ["contact suppressed", {...projectionInput,authority:{...projectionInput.authority,suppressed:true}}],
    ];
    const denialEffectsBefore = await snapshotLaterPhaseEffects(fixture.database);
    for (const [label,input] of negativeProjectionCases) {
      const deniedProjection = eligibility.projectContactEligibility(input);
      assert.equal(deniedProjection.eligible,false,label);
      for (const recheck of [eligibility.recheckForPackageApproval,eligibility.recheckForCrmExport,eligibility.recheckForClickToCall,eligibility.recheckForFinalSend]) {
        const denied = recheck(input);
        assert.equal(denied.blocked,true,label);
        assert.deepEqual(denied.effectsBefore,eligibility.zeroDownstreamEffects(),label);
        assert.deepEqual(denied.effectsAfter,eligibility.zeroDownstreamEffects(),label);
      }
      assert.equal(providerCalls,1,`${label} cannot make another fake provider call`);
      assert.equal(await countRows(fixture.database,"contact_eligibility_snapshots"),0,`${label} cannot persist eligibility`);
      assert.deepEqual(await snapshotLaterPhaseEffects(fixture.database),denialEffectsBefore,`${label} cannot mutate later-phase state`);
    }
    const snapshotRequest = {
      ownerSubject:lifecycle.owner.subject,
      workspaceId:lifecycle.workspaceId,
      reservationId:reserved.reservation.id,
      prospectId:lifecycle.prospectId,
      contactId:binding.contactId,
      configurationId:lifecycle.configurationId,
      configurationDigest:lifecycle.configurationDigest,
      projectedAt:NOW+8,
    };
    assert.deepEqual(
      await eligibilityPersistence.persistCurrentContactEligibilitySnapshot(
        fixture.database,
        restartedAttestor,
        snapshotRequest,
      ),
      {kind:"blocked",reason:"contact_capability_unavailable"},
      "the unactivated runtime cannot persist even a valid synthetic projection",
    );
    assert.equal(await countRows(fixture.database,"contact_eligibility_snapshots"),0);
    assert.deepEqual(
      await eligibilityPersistence.persistCurrentContactEligibilitySnapshot(
        fixture.database,
        restartedAttestor,
        {...snapshotRequest,ownerSubject:"wrong-owner",projectedAt:NOW+9},
      ),
      {kind:"blocked",reason:"contact_capability_unavailable"},
      "the immutable activation boundary wins before any caller-controlled identity input",
    );
    assert.equal((await operation.executeEnrichmentOperation(repository,port,{reservationId:reserved.reservation.id,now:NOW+101},verifier)).kind,"blocked");
    assert.equal(providerCalls,1,"settled operations cannot be invoked twice");
    assert.deepEqual(await snapshotLaterPhaseEffects(fixture.database),laterEffectsBefore);
  } finally { await fixture.dispose(); }
});

test("concurrent reservation attempts enforce the committed cap and never invoke a provider", async () => {
  const fixture = await createD1Fixture("phase5-controlled-enrichment-cap-race");
  try {
    const { lifecycle, repository, issuance, authority } = await readyObservedCandidate(fixture);
    const snapshot = await repository.loadIssuanceSnapshot(lifecycle.owner.subject,[lifecycle.prospectId]);
    const [first, second] = await Promise.all([
      issuance.issueEnrichmentGrant(repository,grantRequest(lifecycle,snapshot.revision,"p5i-cap-race-one")),
      issuance.issueEnrichmentGrant(repository,{...grantRequest(lifecycle,snapshot.revision,"p5i-cap-race-two"),expiresAt:NOW+5_001}),
    ]);
    assert.equal(first.kind,"issued");
    assert.equal(second.kind,"issued");
    assert.notEqual(first.grant.id,second.grant.id);
    assert.notEqual(first.grant.tuple.operationKey,second.grant.tuple.operationKey);
    await seedSyntheticReservationInputs(fixture.database,lifecycle,first.grant,"cap-one");
    await seedSyntheticReservationInputs(fixture.database,lifecycle,second.grant,"cap-two");
    const before = await snapshotLaterPhaseEffects(fixture.database);
    const results = await Promise.all([
      authority.reserveEnrichmentOperation(repository,{grantId:first.grant.id,principalSubject:lifecycle.owner.subject,operationKey:first.grant.tuple.operationKey,now:NOW+6}),
      authority.reserveEnrichmentOperation(repository,{grantId:second.grant.id,principalSubject:lifecycle.owner.subject,operationKey:second.grant.tuple.operationKey,now:NOW+6}),
    ]);
    assert.deepEqual(results.map((result) => result.kind).sort(),["blocked","reserved"],"distinct operations contend for the shared workspace/profile/provider cap");
    assert.equal(await countRows(fixture.database,"enrichment_reservations"),1);
    const budgets = (await fixture.database.prepare(
      "SELECT actual_units,reserved_units,actual_cost_minor,reserved_cost_minor FROM enrichment_budget_accounts WHERE workspace_id=? ORDER BY scope",
    ).bind(lifecycle.workspaceId).all()).results;
    assert.equal(budgets.length,5);
    assert.equal(budgets.filter((row) => Number(row.reserved_units)===1).length,4);
    assert.equal(budgets.filter((row) => Number(row.reserved_units)===0).length,1);
    assert.ok(budgets.every((row) => Number(row.actual_units)===0 && Number(row.actual_cost_minor)===0));
    assert.equal(await countRows(fixture.database,"contact_point_observations"),0);
    assert.deepEqual(await snapshotLaterPhaseEffects(fixture.database),before);
  } finally { await fixture.dispose(); }
});

test("partial results settle only documented units while preserving literal zero downstream effects", async () => {
  const fixture = await createD1Fixture("phase5-controlled-enrichment-partial");
  try {
    const prepared = await prepareReservedOperation(fixture,"p5i-partial");
    const [operation,providerPort,contactEvidence] = await loadDomain(fixture,["enrichment-operation","contact-provider-port","contact-evidence"]);
    const evidence = syntheticEvidence(prepared.binding,"p5i-partial-observation");
    let providerCalls=0;
    const port = providerPort.bindContactProviderPort(providerBinding(prepared.issued),async (assignment) => {
      providerCalls+=1;
      return Object.freeze({kind:"partial",reservationId:assignment.reservationId,operationKey:assignment.operationKey,documentedUnits:1,documentedCostMinor:10,evidence:Object.freeze([evidence])});
    });
    const before = await snapshotLaterPhaseEffects(fixture.database);
    const result = await operation.executeEnrichmentOperation(prepared.repository,port,{reservationId:prepared.reserved.reservation.id,now:NOW+100},syntheticVerifier(contactEvidence,evidence,prepared.issued));
    assert.deepEqual(result,{kind:"settled",outcome:"partial"});
    assert.equal(providerCalls,1);
    const terminal = await terminalReservation(fixture.database,prepared.reserved.reservation.id);
    assert.deepEqual(terminal,{state:"settled",terminal_reason:"partial",documented_units:1,documented_cost_minor:10});
    assert.equal(await countRows(fixture.database,"contact_point_observations"),1);
    assert.deepEqual(await snapshotLaterPhaseEffects(fixture.database),before);
  } finally { await fixture.dispose(); }
});

test("DeliveryUnknown-equivalent ambiguous acceptance stays reserved and cannot be retried", async () => {
  const fixture = await createD1Fixture("phase5-controlled-enrichment-uncertain");
  try {
    const prepared = await prepareReservedOperation(fixture,"p5i-uncertain");
    const [operation,providerPort] = await loadDomain(fixture,["enrichment-operation","contact-provider-port"]);
    let providerCalls=0;
    const port = providerPort.bindContactProviderPort(providerBinding(prepared.issued),async (assignment) => {
      providerCalls+=1;
      return Object.freeze({kind:"ambiguous",reservationId:assignment.reservationId,operationKey:assignment.operationKey});
    });
    const before = await snapshotLaterPhaseEffects(fixture.database);
    assert.deepEqual(await operation.executeEnrichmentOperation(prepared.repository,port,{reservationId:prepared.reserved.reservation.id,now:NOW+100}),{kind:"needs_reconciliation"});
    assert.deepEqual(await operation.executeEnrichmentOperation(prepared.repository,port,{reservationId:prepared.reserved.reservation.id,now:NOW+101}),{kind:"blocked"});
    assert.equal(providerCalls,1,"an uncertain provider acceptance is never retried");
    const terminal = await terminalReservation(fixture.database,prepared.reserved.reservation.id);
    assert.deepEqual(terminal,{state:"needs_reconciliation",terminal_reason:"ambiguous",documented_units:null,documented_cost_minor:null});
    const budgets = (await fixture.database.prepare("SELECT actual_cost_minor,reserved_cost_minor FROM enrichment_budget_accounts WHERE workspace_id=?").bind(prepared.lifecycle.workspaceId).all()).results;
    assert.ok(budgets.every((row) => Number(row.actual_cost_minor)===0 && Number(row.reserved_cost_minor)===10));
    assert.equal(await countRows(fixture.database,"contact_point_observations"),0);
    assert.deepEqual(await snapshotLaterPhaseEffects(fixture.database),before);
  } finally { await fixture.dispose(); }
});

test("D1 merge and split decisions preserve suppression reach, scope, and moved associations", async () => {
  const fixture = await createD1Fixture("phase5-controlled-enrichment-identity");
  try {
    await applyCanonicalPhase5IntegrationMigrations(fixture.database);
    const lifecycle = await createApprovedProspectLifecycle(fixture);
    const identity = await load(fixture,"identity-resolution");
    const persistence = await load(fixture,"identity-repository");
    const owner={subject:lifecycle.owner.subject,admittedOwner:true};
    await seedD1IdentityContacts(fixture.database,lifecycle);
    const repository=persistence.createD1IdentityResolutionRepository(fixture.database,{workspaceId:lifecycle.workspaceId,ownerSubject:owner.subject,subjectKind:"contact",now:()=>NOW});
    const mergeSuggestion=await identity.planIdentitySuggestion(repository,owner,{workspaceId:lifecycle.workspaceId,kind:"merge",candidateIds:["p5i-identity-alpha","p5i-identity-beta"]});
    const merged=await identity.applyIdentityResolution(repository,owner,{workspaceId:lifecycle.workspaceId,suggestionId:mergeSuggestion.id,decision:{kind:"merge",primaryId:"p5i-identity-alpha",secondaryIds:["p5i-identity-beta"]},expectedRevision:mergeSuggestion.revision,idempotencyKey:"p5i-merge"});
    assert.deepEqual(merged.retainedSuppressionSubjectRefs,["a".repeat(64),"b".repeat(64)]);
    assert.deepEqual(merged.invalidations.map((item) => item.projection),["NeedsReview","NeedsReview"]);
    assert.deepEqual((await fixture.database.prepare("SELECT contact_id FROM contact_relevance WHERE id='p5i-identity-relevance-beta'").first()).contact_id,"p5i-identity-alpha");

    const splitSuggestion=await identity.planIdentitySuggestion(repository,owner,{workspaceId:lifecycle.workspaceId,kind:"split",sourceId:"p5i-identity-alpha",moveAssociationIds:["p5i-identity-relevance-beta"]});
    const split=await identity.applyIdentityResolution(repository,owner,{workspaceId:lifecycle.workspaceId,suggestionId:splitSuggestion.id,decision:{kind:"split",sourceId:"p5i-identity-alpha",moveAssociationIds:["p5i-identity-relevance-beta"]},expectedRevision:splitSuggestion.revision,idempotencyKey:"p5i-split"});
    assert.deepEqual(split.retainedSuppressionSubjectRefs,["a".repeat(64),"b".repeat(64)]);
    assert.deepEqual(split.invalidations,[{associationId:"p5i-identity-relevance-beta",projection:"NonContactable"}]);
    assert.equal(await countRows(fixture.database,"identity_decisions"),2);
    assert.equal(await countRows(fixture.database,"identity_lineage"),2);
    assert.deepEqual((await fixture.database.prepare("SELECT contact_id FROM contact_relevance WHERE id='p5i-identity-relevance-beta'").first()).contact_id,split.decision.newIdentityId);
    await fixture.database.prepare("INSERT INTO suppressions (id,workspace_id,subject_type,subject_digest,channel,reason,created_at) VALUES ('p5i-identity-unbound-email',?,'email',?,'email','synthetic',?)")
      .bind(lifecycle.workspaceId,"f".repeat(64),NOW).run();
    await assert.rejects(
      () => identity.planIdentitySuggestion(repository,owner,{workspaceId:lifecycle.workspaceId,kind:"split",sourceId:split.decision.newIdentityId,moveAssociationIds:["p5i-identity-relevance-beta"]}),
      /identity_resolution_rejected/,
      "a genuinely unbound contact-point tombstone remains fail-closed",
    );
    const foreign=persistence.createD1IdentityResolutionRepository(fixture.database,{workspaceId:lifecycle.workspaceId,ownerSubject:"foreign-owner",subjectKind:"contact",now:()=>NOW});
    assert.deepEqual(await foreign.readIdentitySnapshots(lifecycle.workspaceId,["p5i-identity-alpha"]),[],"owner scope is enforced at the D1 repository boundary");
  } finally { await fixture.dispose(); }
});

test("suppression binding rejects invalid lineage digests and unrelated contact digests without durable mutation", async () => {
  const fixture = await createD1Fixture("phase5-controlled-enrichment-lineage-binding");
  try {
    await applyCanonicalPhase5IntegrationMigrations(fixture.database);
    const lifecycle = await createApprovedProspectLifecycle(fixture);
    const identity = await load(fixture,"identity-resolution");
    const persistence = await load(fixture,"identity-repository");
    const owner={subject:lifecycle.owner.subject,admittedOwner:true};
    await seedD1IdentityContacts(fixture.database,lifecycle);
    const repository=persistence.createD1IdentityResolutionRepository(fixture.database,{workspaceId:lifecycle.workspaceId,ownerSubject:owner.subject,subjectKind:"contact",now:()=>NOW});
    const mergeSuggestion=await identity.planIdentitySuggestion(repository,owner,{workspaceId:lifecycle.workspaceId,kind:"merge",candidateIds:["p5i-identity-alpha","p5i-identity-beta"]});
    await identity.applyIdentityResolution(repository,owner,{workspaceId:lifecycle.workspaceId,suggestionId:mergeSuggestion.id,decision:{kind:"merge",primaryId:"p5i-identity-alpha",secondaryIds:["p5i-identity-beta"]},expectedRevision:mergeSuggestion.revision,idempotencyKey:"p5i-lineage-binding-merge"});
    const lineage = await fixture.database.prepare("SELECT * FROM identity_lineage WHERE workspace_id=? LIMIT 1").bind(lifecycle.workspaceId).first();
    const durableBefore = await identityDurableSnapshot(fixture.database,lifecycle.workspaceId);

    await fixture.database.exec("DROP TRIGGER immutable_identity_lineage_update; DROP TRIGGER immutable_identity_lineage_delete; DROP TRIGGER immutable_identity_decisions_update;");
    await fixture.database.prepare("DELETE FROM identity_lineage WHERE id=?").bind(lineage.id).run();
    const missingEdgeBefore = await identityDurableSnapshot(fixture.database,lifecycle.workspaceId);
    await assert.rejects(
      () => identity.planIdentitySuggestion(repository,owner,{workspaceId:lifecycle.workspaceId,kind:"split",sourceId:"p5i-identity-alpha",moveAssociationIds:["p5i-identity-relevance-beta"]}),
      /identity_resolution_rejected/,
      "a decision missing its complete expected lineage edge set cannot exempt retained suppression",
    );
    assert.deepEqual(await identityDurableSnapshot(fixture.database,lifecycle.workspaceId),missingEdgeBefore,"missing decision lineage cannot create a suggestion or mutate identity state");
    await fixture.database.prepare("INSERT INTO identity_lineage (id,workspace_id,decision_id,subject_kind,source_subject_id,target_subject_id,relationship,retained_source_lineage_ids_json,retained_identity_lineage_ids_json,retained_aliases_json,retained_suppression_subject_refs_json,lineage_digest,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .bind(lineage.id,lineage.workspace_id,lineage.decision_id,lineage.subject_kind,lineage.source_subject_id,lineage.target_subject_id,lineage.relationship,lineage.retained_source_lineage_ids_json,lineage.retained_identity_lineage_ids_json,lineage.retained_aliases_json,lineage.retained_suppression_subject_refs_json,lineage.lineage_digest,lineage.created_at).run();
    await fixture.database.prepare("UPDATE identity_lineage SET lineage_digest=? WHERE id=?").bind("0".repeat(64),lineage.id).run();
    await assert.rejects(
      () => identity.planIdentitySuggestion(repository,owner,{workspaceId:lifecycle.workspaceId,kind:"split",sourceId:"p5i-identity-alpha",moveAssociationIds:["p5i-identity-relevance-beta"]}),
      /identity_resolution_rejected/,
      "a digest-shaped but cryptographically invalid lineage cannot exempt retained suppression",
    );
    assert.deepEqual(await identityDurableSnapshot(fixture.database,lifecycle.workspaceId),durableBefore,"invalid lineage cannot create a suggestion or mutate identity state");

    const unrelatedDigest="c".repeat(64);
    await fixture.database.prepare("INSERT INTO contacts (id,workspace_id,created_at,updated_at,revision,company_id,identity_digest,display_name) SELECT 'p5i-identity-unrelated',?,?,?,1,id,?,'Unrelated Fictional Contact' FROM companies WHERE workspace_id=?")
      .bind(lifecycle.workspaceId,NOW,NOW,unrelatedDigest,lifecycle.workspaceId).run();
    const retainedSuppressionSubjectRefs=["a".repeat(64),"b".repeat(64),unrelatedDigest];
    const decisionRow=await fixture.database.prepare("SELECT * FROM identity_decisions WHERE id=?").bind(lineage.decision_id).first();
    const suggestionRow=await fixture.database.prepare("SELECT suggestion_digest,revision FROM identity_suggestions WHERE id=?").bind(decisionRow.suggestion_id).first();
    const tamperedDecision={kind:"merge",primaryId:"p5i-identity-alpha",secondaryIds:["p5i-identity-beta","p5i-identity-unrelated"]};
    const operationDigest=phase5Digest({workspaceId:lifecycle.workspaceId,suggestionId:decisionRow.suggestion_id,suggestionDigest:suggestionRow.suggestion_digest,suggestionRevision:Number(suggestionRow.revision),decision:tamperedDecision,actor:owner.subject});
    const resultMaterial={workspaceId:lifecycle.workspaceId,ownerSubject:owner.subject,suggestionId:decisionRow.suggestion_id,suggestionDigest:suggestionRow.suggestion_digest,idempotencyKey:decisionRow.idempotency_key,decision:tamperedDecision,operationDigest,retainedSourceLineageIds:JSON.parse(decisionRow.retained_source_lineage_ids_json),retainedIdentityLineageIds:JSON.parse(decisionRow.retained_identity_lineage_ids_json),retainedAliases:JSON.parse(decisionRow.retained_aliases_json),retainedSuppressionSubjectRefs,rePointedAssociationIds:JSON.parse(decisionRow.repointed_association_ids_json),invalidations:JSON.parse(decisionRow.invalidations_json)};
    const resultDigest=phase5Digest({schema:"identity-resolution-result/v1",...resultMaterial});
    const lineageDigest=phase5Digest({
      schema:"identity-lineage/v1",
      decisionId:lineage.decision_id,
      subjectKind:"contact",
      sourceSubjectId:lineage.source_subject_id,
      targetSubjectId:lineage.target_subject_id,
      relationship:lineage.relationship,
      retainedSourceLineageIds:JSON.parse(lineage.retained_source_lineage_ids_json),
      retainedIdentityLineageIds:JSON.parse(lineage.retained_identity_lineage_ids_json),
      retainedAliases:JSON.parse(lineage.retained_aliases_json),
      retainedSuppressionSubjectRefs,
    });
    await fixture.database.batch([
      fixture.database.prepare("UPDATE identity_decisions SET decision_json=?,retained_suppression_subject_refs_json=?,operation_digest=?,result_digest=? WHERE id=?").bind(phase5Canonical(tamperedDecision),JSON.stringify(retainedSuppressionSubjectRefs),operationDigest,resultDigest,lineage.decision_id),
      fixture.database.prepare("UPDATE identity_lineage SET id=?,retained_suppression_subject_refs_json=?,lineage_digest=? WHERE decision_id=?").bind(`il_${lineageDigest.slice(0,24)}`,JSON.stringify(retainedSuppressionSubjectRefs),lineageDigest,lineage.decision_id),
    ]);
    const unrelatedBefore = await identityDurableSnapshot(fixture.database,lifecycle.workspaceId);
    await assert.rejects(
      () => identity.planIdentitySuggestion(repository,owner,{workspaceId:lifecycle.workspaceId,kind:"split",sourceId:"p5i-identity-alpha",moveAssociationIds:["p5i-identity-relevance-beta"]}),
      /identity_resolution_rejected/,
      "coherent decision, retention, operation/result, and lineage tampering cannot add an unrelated contact",
    );
    assert.deepEqual(await identityDurableSnapshot(fixture.database,lifecycle.workspaceId),unrelatedBefore,"unrelated contact lineage cannot create a suggestion or mutate identity state");
  } finally { await fixture.dispose(); }
});

test("cross-tenant authority is rejected and the JavaScript enrichment graph cannot start legacy enrichment", async () => {
  const fixture = await createD1Fixture("phase5-controlled-enrichment-tenant-and-legacy");
  try {
    await applyCanonicalPhase5IntegrationMigrations(fixture.database);
    const lifecycle=await createApprovedProspectLifecycle(fixture);
    await fixture.database.prepare("INSERT INTO workspaces (id,company_name,owner_subject,created_at,updated_at,revision) VALUES ('foreign-workspace','Fictional foreign tenant','foreign-owner',?,?,1)").bind(NOW,NOW).run();
    const [repositoryModule,issuance]=await loadDomain(fixture,["enrichment-repository","enrichment-grant-issuance"]);
    const foreignRepository=repositoryModule.createD1EnrichmentRepository(fixture.database,{workspaceId:"foreign-workspace",ownerSubject:"foreign-owner",now:()=>NOW});
    const before=await snapshotLaterPhaseEffects(fixture.database);
    const result=await issuance.issueEnrichmentGrant(foreignRepository,{...grantRequest(lifecycle,1,"p5i-cross-tenant"),principalSubject:"foreign-owner"});
    assert.equal(result.kind,"blocked");
    assert.equal(await countRows(fixture.database,"enrichment_grants"),0);
    assert.equal(await countRows(fixture.database,"enrichment_reservations"),0);
    assert.deepEqual(await snapshotLaterPhaseEffects(fixture.database),before);

    const resourcesBefore = new Set(process.getActiveResourcesInfo());
    const operation = await load(fixture,"enrichment-operation");
    assert.equal(typeof operation.executeEnrichmentOperation,"function");
    const graphIds=[...fixture.vite.moduleGraph.idToModuleMap.keys()].map(String);
    assert.ok(graphIds.some((id) => id.endsWith("/domain/enrichment-operation.ts")),"the actual JavaScript enrichment entry was imported");
    assert.ok(graphIds.every((id) => !id.includes("mcp_server") && !id.includes("child_process")),"the loaded JavaScript runtime graph has no legacy process dependency");
    const resourcesAfter = new Set(process.getActiveResourcesInfo());
    assert.equal(resourcesAfter.has("ChildProcess"),false,"loading the JavaScript enrichment graph cannot start a child process");
    assert.equal(resourcesBefore.has("ChildProcess"),false,"the test began with no provider process");
    const productionSources = await productionTypeScriptSources();
    assert.ok(productionSources.some(([path]) => path.endsWith("/app/api/contacts/route.ts")),"the production Contacts route is included in the static regression check");
    for (const [path,source] of productionSources) {
      assert.doesNotMatch(source,/mcp_server|child_process|python(?:3)?/iu,`${path} cannot reach the legacy Python adapter`);
    }
    const contactsRoute = productionSources.find(([path]) => path.endsWith("/app/api/contacts/route.ts"))?.[1] ?? "";
    assert.doesNotMatch(contactsRoute,/commandService|executeEnrichmentOperation|bindContactProviderPort/u,"the production Contacts route cannot compose grant execution or a provider port");
    assert.match(await readFile(new URL("../../enrichment/mcp_server.py",import.meta.url),"utf8"),/FastMCP/u,"the legacy file remains covered by the focused non-reference regression check");
  } finally { await fixture.dispose(); }
});

async function readyObservedCandidate(fixture) {
  await applyCanonicalPhase5IntegrationMigrations(fixture.database);
  const lifecycle = await createApprovedProspectLifecycle(fixture);
  await fixture.database.prepare(`INSERT INTO provider_quotes
    (id,workspace_id,provider_id,provider_version,catalog_ref,revision,operation,currency,unit_cost_minor,quote_digest,expires_at,created_at)
    VALUES ('p5i-quote',?,'synthetic-contact-provider','v1','synthetic-catalog',1,'business_contact_lookup/v1','CAD',10,?,?,?)`)
    .bind(lifecycle.workspaceId,"b".repeat(64),NOW+20_000,NOW).run();
  const [authority,repositoryModule,issuance] = await loadDomain(fixture, [
    "enrichment-authority", "enrichment-repository", "enrichment-grant-issuance",
  ]);
  const contactSettlementAttestor=await createSyntheticContactSettlementAttestor(fixture);
  const repository = repositoryModule.createD1EnrichmentRepository(fixture.database,{workspaceId:lifecycle.workspaceId,ownerSubject:lifecycle.owner.subject,now:advancingClock(NOW+5),contactSettlementAttestor});
  return { lifecycle, repository, issuance, authority };
}

async function prepareReservedOperation(fixture,idempotencyKey) {
  const ready=await readyObservedCandidate(fixture);
  const snapshot=await ready.repository.loadIssuanceSnapshot(ready.lifecycle.owner.subject,[ready.lifecycle.prospectId]);
  const issued=await ready.issuance.issueEnrichmentGrant(ready.repository,grantRequest(ready.lifecycle,snapshot.revision,idempotencyKey));
  await seedSyntheticReservationInputs(fixture.database,ready.lifecycle,issued.grant);
  const reserved=await ready.authority.reserveEnrichmentOperation(ready.repository,{grantId:issued.grant.id,principalSubject:ready.lifecycle.owner.subject,operationKey:issued.grant.tuple.operationKey,now:NOW+6});
  assert.equal(reserved.kind,"reserved");
  return {...ready,issued,reserved,binding:reserved.reservation.assignment.evidenceAssignments[0]};
}

function syntheticEvidence(binding,id) { return Object.freeze({id,assignmentId:binding.assignmentId,prospectId:binding.prospectId,workspaceId:binding.workspaceId,contactId:binding.contactId,profileConfigurationId:binding.profileConfigurationId,profileConfigurationDigest:binding.profileConfigurationDigest,kind:"email",value:`${id}@example.invalid`,confidence:1,provenance:Object.freeze({sourceReference:`source:${id}`,excerpt:"Fictional mailbox evidence.",objectReference:`object:${id}`,contentHash:"e".repeat(64),retrievedAt:NOW+1}),observedAt:NOW+3}); }
function providerBinding(issued) { return {providerId:issued.grant.tuple.providerId,providerVersion:issued.grant.tuple.providerVersion,catalogRef:issued.grant.tuple.catalogRef}; }
function syntheticVerifier(contactEvidence,evidence,issued) { return contactEvidence.bindContactEvidenceVerifier({verifierId:"phase5-fictional-verifier",verifierVersion:"v1"},async()=>Object.freeze({observationId:evidence.id,workspaceId:evidence.workspaceId,contactId:evidence.contactId,profileConfigurationId:evidence.profileConfigurationId,profileConfigurationDigest:evidence.profileConfigurationDigest,kind:evidence.kind,normalizedValue:evidence.value,contentHash:evidence.provenance.contentHash,verificationClass:"mailbox_verified",method:"mailbox_verification",verifiedAt:NOW+2,providerId:issued.grant.tuple.providerId,providerVersion:issued.grant.tuple.providerVersion,catalogRef:issued.grant.tuple.catalogRef,verdictReference:`verdict:${evidence.id}`,verdictDigest:"f".repeat(64)})); }
async function terminalReservation(database,reservationId) { return database.prepare("SELECT state,terminal_reason,documented_units,documented_cost_minor FROM enrichment_reservation_events WHERE reservation_id=? ORDER BY durable_revision DESC LIMIT 1").bind(reservationId).first(); }

async function identityDurableSnapshot(database,workspaceId) {
  const [suggestions,decisions,lineage,relevance] = await Promise.all([
    countRows(database,"identity_suggestions"),
    countRows(database,"identity_decisions"),
    countRows(database,"identity_lineage"),
    database.prepare("SELECT id,contact_id,revision FROM contact_relevance WHERE workspace_id=? ORDER BY id").bind(workspaceId).all(),
  ]);
  return {suggestions,decisions,lineage,relevance:relevance.results};
}

function phase5Digest(value) {
  return createHash("sha256").update(phase5Canonical(value)).digest("hex");
}

function phase5Canonical(value) {
  if (Array.isArray(value)) return `[${value.map(phase5Canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${phase5Canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

async function productionTypeScriptSources() {
  const roots=[new URL("../app/",import.meta.url),new URL("../domain/",import.meta.url)];
  const files=(await Promise.all(roots.map((root)=>readdir(root,{recursive:true,withFileTypes:true})))).flatMap((entries)=>entries
    .filter((entry)=>entry.isFile() && /\.(?:ts|tsx)$/u.test(entry.name))
    .map((entry)=>join(entry.parentPath,entry.name)));
  return Promise.all(files.map(async (path)=>[path,await readFile(path,"utf8")]));
}

async function seedD1IdentityContacts(database,lifecycle) {
  const play = await database.prepare("SELECT p.play_id,m.product_id FROM customer_profiles p JOIN market_plays m ON m.id=p.play_id AND m.workspace_id=p.workspace_id WHERE p.id=? AND p.workspace_id=?").bind(lifecycle.profileId,lifecycle.workspaceId).first();
  assert.ok(play?.play_id && play?.product_id);
  await database.prepare("INSERT INTO market_plays (id,workspace_id,created_at,updated_at,revision,product_id,name,lifecycle) VALUES ('p5i-identity-play-beta',?,?,?,1,?,'Synthetic identity beta','active')")
    .bind(lifecycle.workspaceId,NOW,NOW,play.product_id).run();
  await database.batch([
    database.prepare("INSERT INTO contacts (id,workspace_id,created_at,updated_at,revision,company_id,identity_digest,display_name) SELECT 'p5i-identity-alpha',?,?,?,2,id,?,'Synthetic Alpha' FROM companies WHERE workspace_id=?").bind(lifecycle.workspaceId,NOW,NOW,"a".repeat(64),lifecycle.workspaceId),
    database.prepare("INSERT INTO contacts (id,workspace_id,created_at,updated_at,revision,company_id,identity_digest,display_name) SELECT 'p5i-identity-beta',?,?,?,3,id,?,'Synthetic Beta' FROM companies WHERE workspace_id=?").bind(lifecycle.workspaceId,NOW,NOW,"b".repeat(64),lifecycle.workspaceId),
    database.prepare("INSERT INTO contact_relevance (id,workspace_id,created_at,updated_at,revision,play_id,contact_id,relevance_json) VALUES ('p5i-identity-relevance-alpha',?,?,?,1,?,'p5i-identity-alpha','{}')").bind(lifecycle.workspaceId,NOW,NOW,play.play_id),
    database.prepare("INSERT INTO contact_relevance (id,workspace_id,created_at,updated_at,revision,play_id,contact_id,relevance_json) VALUES ('p5i-identity-relevance-beta',?,?,?,1,'p5i-identity-play-beta','p5i-identity-beta','{}')").bind(lifecycle.workspaceId,NOW,NOW),
    database.prepare("INSERT INTO suppressions (id,workspace_id,subject_type,subject_digest,channel,reason,created_at) VALUES ('p5i-identity-suppression-alpha',?,'contact',?,'email','synthetic',?)").bind(lifecycle.workspaceId,"a".repeat(64),NOW),
    database.prepare("INSERT INTO suppressions (id,workspace_id,subject_type,subject_digest,channel,reason,created_at) VALUES ('p5i-identity-suppression-beta',?,'contact',?,'email','synthetic',?)").bind(lifecycle.workspaceId,"b".repeat(64),NOW),
  ]);
}

function grantRequest(lifecycle, expectedRevision, idempotencyKey) { return { principalSubject:lifecycle.owner.subject,prospectIds:[lifecycle.prospectId],operation:"business_contact_lookup/v1",maxUnits:1,maxCostMinor:10,currency:"CAD",expiresAt:NOW+5_000,expectedRevision,idempotencyKey,now:NOW+5 }; }

function load(fixture,name) { return fixture.vite.ssrLoadModule(new URL(`../domain/${name}.ts`,import.meta.url).pathname); }
/* One at a time: port and verifier authority is a module-scoped WeakSet brand,
 * so it only holds while every module shares one instance of the file that owns
 * it. Concurrent loads let two of them instantiate a shared dependency twice,
 * and the operation then correctly rejects an object branded by the other. */
async function loadDomain(fixture,names) {
  const domain = await loadPhase5Domain(fixture);
  const key = {"enrichment-authority":"authority","enrichment-repository":"persistence","enrichment-grant-issuance":"issuance","enrichment-operation":"operation","contact-provider-port":"providerPort","contact-evidence":"contactEvidence"};
  return names.map((name)=>domain[key[name]]);
}
