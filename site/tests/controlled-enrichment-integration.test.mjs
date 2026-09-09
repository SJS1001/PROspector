import assert from "node:assert/strict";
import test from "node:test";
import { readFile, readdir } from "node:fs/promises";
import { countRows } from "./helpers/d1.mjs";
import {
  NOW,
  applyCanonicalPhase5IntegrationMigrations,
  createApprovedProspectLifecycle,
  createPhase5D1Fixture as createD1Fixture,
  createSyntheticContactSettlementAttestor,
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
      now:()=>NOW+10,
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
    const execution = await operation.executeEnrichmentOperation(repository,port,{reservationId:reserved.reservation.id,now:NOW+7},verifier);
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
    await enableSyntheticControlledEnrichmentGate(fixture.database,lifecycle.workspaceId);
    const persistedSnapshot = await eligibilityPersistence.persistCurrentContactEligibilitySnapshot(
      fixture.database,
      restartedAttestor,
      snapshotRequest,
    );
    assert.equal(persistedSnapshot.kind,"persisted",JSON.stringify(persistedSnapshot));
    assert.equal(persistedSnapshot.snapshot.state,"ContactReady");
    assert.equal(persistedSnapshot.snapshot.eligible,true);
    assert.deepEqual(persistedSnapshot.snapshot.observationIds,[evidence.id]);
    assert.deepEqual(persistedSnapshot.snapshot.preservedSuppressionRefs,[]);
    assert.equal((await eligibilityPersistence.persistCurrentContactEligibilitySnapshot(
      fixture.database,
      restartedAttestor,
      snapshotRequest,
    )).replayed,true,"the same current snapshot is idempotent");
    assert.equal(await countRows(fixture.database,"contact_eligibility_snapshots"),1);
    assert.deepEqual(
      await eligibilityPersistence.readLatestContactEligibilitySnapshot(
        fixture.database,
        lifecycle.owner.subject,
        lifecycle.workspaceId,
        lifecycle.prospectId,
        binding.contactId,
      ),
      persistedSnapshot.snapshot,
    );
    assert.equal(await eligibilityPersistence.readLatestContactEligibilitySnapshot(
      fixture.database,
      "wrong-owner",
      lifecycle.workspaceId,
      lifecycle.prospectId,
      binding.contactId,
    ),null);
    assert.deepEqual(
      await eligibilityPersistence.persistCurrentContactEligibilitySnapshot(
        fixture.database,
        restartedAttestor,
        {...snapshotRequest,ownerSubject:"wrong-owner",projectedAt:NOW+9},
      ),
      {kind:"blocked",reason:"contact_authority_unavailable"},
    );
    assert.equal(await countRows(fixture.database,"contact_eligibility_snapshots"),1);
    const pointDigest = await fixture.database.prepare(
      "SELECT contact_point_digest FROM contact_point_observations WHERE id=? AND workspace_id=?",
    ).bind(evidence.id,lifecycle.workspaceId).first();
    await fixture.database.prepare(
      `INSERT INTO suppressions (id,workspace_id,subject_type,subject_digest,channel,reason,created_at)
       VALUES ('p5i-suppression',?,'exact_email',?,'email','synthetic owner prohibition',?)`,
    ).bind(lifecycle.workspaceId,pointDigest.contact_point_digest,NOW+9).run();
    const suppressedSnapshot = await eligibilityPersistence.persistCurrentContactEligibilitySnapshot(
      fixture.database,
      restartedAttestor,
      {...snapshotRequest,projectedAt:NOW+9},
    );
    assert.equal(suppressedSnapshot.kind,"persisted",JSON.stringify(suppressedSnapshot));
    assert.equal(suppressedSnapshot.snapshot.state,"NonContactable");
    assert.equal(suppressedSnapshot.snapshot.eligible,false);
    assert.ok(suppressedSnapshot.snapshot.reasonCodes.includes("suppressed"));
    assert.deepEqual(suppressedSnapshot.snapshot.preservedSuppressionRefs,["p5i-suppression"]);
    assert.equal(await countRows(fixture.database,"contact_eligibility_snapshots"),2);
    assert.equal((await operation.executeEnrichmentOperation(repository,port,{reservationId:reserved.reservation.id,now:NOW+10},verifier)).kind,"blocked");
    assert.equal(providerCalls,1,"settled operations cannot be invoked twice");
    assert.deepEqual(await snapshotLaterPhaseEffects(fixture.database),laterEffectsBefore);
  } finally { await fixture.dispose(); }
});

test("concurrent reservation attempts enforce the committed cap and never invoke a provider", async () => {
  const fixture = await createD1Fixture("phase5-controlled-enrichment-cap-race");
  try {
    const { lifecycle, repository, issuance, authority } = await readyObservedCandidate(fixture);
    const snapshot = await repository.loadIssuanceSnapshot(lifecycle.owner.subject,[lifecycle.prospectId]);
    const issued = await issuance.issueEnrichmentGrant(repository,grantRequest(lifecycle,snapshot.revision,"p5i-cap-race"));
    await seedSyntheticReservationInputs(fixture.database,lifecycle,issued.grant);
    const request = {grantId:issued.grant.id,principalSubject:lifecycle.owner.subject,operationKey:issued.grant.tuple.operationKey,now:NOW+6};
    const before = await snapshotLaterPhaseEffects(fixture.database);
    const results = await Promise.all([
      authority.reserveEnrichmentOperation(repository,request),
      authority.reserveEnrichmentOperation(repository,request),
    ]);
    assert.ok(results.every((result) => result.kind==="reserved"));
    assert.deepEqual(results.map((result) => result.replayed).sort(),[false,true],"the race converges on one committed reservation");
    assert.equal(await countRows(fixture.database,"enrichment_reservations"),1);
    const budgets = (await fixture.database.prepare(
      "SELECT actual_units,reserved_units,actual_cost_minor,reserved_cost_minor FROM enrichment_budget_accounts WHERE workspace_id=? ORDER BY scope",
    ).bind(lifecycle.workspaceId).all()).results;
    assert.equal(budgets.length,4);
    assert.ok(budgets.every((row) => Number(row.actual_units)===0 && Number(row.reserved_units)===1 && Number(row.actual_cost_minor)===0 && Number(row.reserved_cost_minor)===10));
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
    const result = await operation.executeEnrichmentOperation(prepared.repository,port,{reservationId:prepared.reserved.reservation.id,now:NOW+7},syntheticVerifier(contactEvidence,evidence,prepared.issued));
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
    assert.deepEqual(await operation.executeEnrichmentOperation(prepared.repository,port,{reservationId:prepared.reserved.reservation.id,now:NOW+7}),{kind:"needs_reconciliation"});
    assert.deepEqual(await operation.executeEnrichmentOperation(prepared.repository,port,{reservationId:prepared.reserved.reservation.id,now:NOW+8}),{kind:"blocked"});
    assert.equal(providerCalls,1,"an uncertain provider acceptance is never retried");
    const terminal = await terminalReservation(fixture.database,prepared.reserved.reservation.id);
    assert.deepEqual(terminal,{state:"needs_reconciliation",terminal_reason:"ambiguous",documented_units:0,documented_cost_minor:0});
    const budgets = (await fixture.database.prepare("SELECT actual_cost_minor,reserved_cost_minor FROM enrichment_budget_accounts WHERE workspace_id=?").bind(prepared.lifecycle.workspaceId).all()).results;
    assert.ok(budgets.every((row) => Number(row.actual_cost_minor)===0 && Number(row.reserved_cost_minor)===10));
    assert.equal(await countRows(fixture.database,"contact_point_observations"),0);
    assert.deepEqual(await snapshotLaterPhaseEffects(fixture.database),before);
  } finally { await fixture.dispose(); }
});

test("merge and split decisions preserve suppression reach and invalidate every moved association", async () => {
  const fixture = await createD1Fixture("phase5-controlled-enrichment-identity");
  try {
    const identity = await load(fixture,"identity-resolution");
    const owner={subject:"fictional-owner",admittedOwner:true};
    const workspaceId="fictional-workspace";
    const mergeRepository=createIdentityRepository(workspaceId,[fictionalIdentity(workspaceId,"identity-a",["association-a"]),fictionalIdentity(workspaceId,"identity-b",["association-b"])]);
    const mergeSuggestion=await identity.planIdentitySuggestion(mergeRepository,owner,{workspaceId,kind:"merge",candidateIds:["identity-a","identity-b"]});
    const merged=await identity.applyIdentityResolution(mergeRepository,owner,{workspaceId,suggestionId:mergeSuggestion.id,decision:{kind:"merge",primaryId:"identity-a",secondaryIds:["identity-b"]},expectedRevision:mergeSuggestion.revision,idempotencyKey:"p5i-merge"});
    assert.deepEqual(merged.retainedSuppressionSubjectRefs,["suppression-identity-a","suppression-identity-b"]);
    assert.deepEqual(merged.invalidations.map((item) => item.projection),["NeedsReview","NeedsReview"]);

    const splitRepository=createIdentityRepository(workspaceId,[fictionalIdentity(workspaceId,"identity-c",["association-c1","association-c2"])]);
    const splitSuggestion=await identity.planIdentitySuggestion(splitRepository,owner,{workspaceId,kind:"split",sourceId:"identity-c",moveAssociationIds:["association-c2"]});
    const split=await identity.applyIdentityResolution(splitRepository,owner,{workspaceId,suggestionId:splitSuggestion.id,decision:{kind:"split",sourceId:"identity-c",moveAssociationIds:["association-c2"]},expectedRevision:splitSuggestion.revision,idempotencyKey:"p5i-split"});
    assert.deepEqual(split.retainedSuppressionSubjectRefs,["suppression-identity-c"]);
    assert.deepEqual(split.invalidations,[{associationId:"association-c2",projection:"NonContactable"}]);
    assert.equal(mergeRepository.mutations,1);
    assert.equal(splitRepository.mutations,1);
  } finally { await fixture.dispose(); }
});

test("cross-tenant authority is rejected and legacy Python enrichment is runtime-unreachable", async () => {
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

    const legacy = await readFile(new URL("../../enrichment/mcp_server.py",import.meta.url),"utf8");
    assert.ok(legacy.length>0,"the retained legacy file is deliberately inspected, never executed");
    const runtimeFiles=await collectRuntimeFiles(new URL("../",import.meta.url));
    const reachable=[];
    for (const url of runtimeFiles) {
      const source=await readFile(url,"utf8");
      if (/enrichment\/mcp_server|mcp_server\.py/u.test(source)) reachable.push(url.pathname);
    }
    assert.deepEqual(reachable,[],"no application/domain runtime source references the legacy Python enrichment process");
  } finally { await fixture.dispose(); }
});

async function readyObservedCandidate(fixture) {
  await applyCanonicalPhase5IntegrationMigrations(fixture.database);
  const lifecycle = await createApprovedProspectLifecycle(fixture);
  await fixture.database.prepare(`INSERT INTO provider_quotes
    (id,workspace_id,provider_id,provider_version,catalog_ref,revision,operation,currency,unit_cost_minor,quote_digest,expires_at,created_at)
    VALUES ('p5i-quote',?,'synthetic-contact-provider','v1','synthetic-catalog',1,'business_contact_lookup/v1','CAD',10,?,?,?)`)
    .bind(lifecycle.workspaceId,"b".repeat(64),NOW+20_000,NOW).run();
  const [repositoryModule,issuance,authority] = await loadDomain(fixture, [
    "enrichment-repository", "enrichment-grant-issuance", "enrichment-authority",
  ]);
  const contactSettlementAttestor=await createSyntheticContactSettlementAttestor(fixture);
  const repository = repositoryModule.createD1EnrichmentRepository(fixture.database,{workspaceId:lifecycle.workspaceId,ownerSubject:lifecycle.owner.subject,now:()=>NOW,contactSettlementAttestor});
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

function fictionalIdentity(workspaceId,id,associationIds) { return {id,workspaceId,revision:1,aliases:[`alias-${id}`],sourceLineageIds:[`source-${id}`],identityLineageIds:[`lineage-${id}`],suppressionSubjectRefs:[`suppression-${id}`],associations:associationIds.map((associationId)=>({id:associationId,workspaceId,scope:"market_play",relevanceId:`relevance-${associationId}`,subjectId:id}))}; }
function createIdentityRepository(workspaceId,initialRows) {
  const rows=new Map(initialRows.map((row)=>[row.id,structuredClone(row)])),suggestions=new Map(),applied=new Map();
  const repository={mutations:0,
    async readIdentitySnapshots(scope,ids){return ids.map((id)=>rows.get(id)).filter((row)=>row?.workspaceId===scope).map((row)=>structuredClone(row));},
    async saveIdentitySuggestion(suggestion){suggestions.set(`${suggestion.workspaceId}:${suggestion.ownerSubject}:${suggestion.id}`,structuredClone(suggestion));return structuredClone(suggestion);},
    async readIdentitySuggestion(scope,owner,id){return structuredClone(suggestions.get(`${scope}:${owner}:${id}`)??null);},
    async transaction(scope,operation){return operation({
      async findByIdempotencyKey(key){return structuredClone(applied.get(`${scope}:${key}`)??null);},
      async readIdentitySnapshots(ids){return repository.readIdentitySnapshots(scope,ids);},
      async applyResolution(resolution){repository.mutations+=1;applied.set(`${scope}:${resolution.idempotencyKey}`,structuredClone(resolution));if(resolution.decision.kind==="merge"){const sourceRows=[resolution.decision.primaryId,...resolution.decision.secondaryIds].map((id)=>rows.get(id));const primary=sourceRows[0];primary.revision+=1;primary.aliases=[...new Set(sourceRows.flatMap((row)=>row.aliases))].sort();primary.sourceLineageIds=[...new Set(sourceRows.flatMap((row)=>row.sourceLineageIds))].sort();primary.identityLineageIds=[...new Set(sourceRows.flatMap((row)=>[row.id,...row.identityLineageIds]))].sort();primary.suppressionSubjectRefs=[...new Set(sourceRows.flatMap((row)=>row.suppressionSubjectRefs))].sort();primary.associations=sourceRows.flatMap((row)=>row.associations).map((association)=>({...association,subjectId:primary.id}));}else{const source=rows.get(resolution.decision.sourceId),moved=new Set(resolution.decision.moveAssociationIds),associations=source.associations.filter((item)=>moved.has(item.id));source.associations=source.associations.filter((item)=>!moved.has(item.id));source.revision+=1;rows.set(resolution.decision.newIdentityId,{...structuredClone(source),id:resolution.decision.newIdentityId,revision:1,associations:associations.map((item)=>({...item,subjectId:resolution.decision.newIdentityId}))});}return structuredClone(resolution);},
    });},
  };return repository;
}

async function collectRuntimeFiles(root) { const output=[]; for (const name of ["app","domain"]){const start=new URL(`${name}/`,root);await walk(start,output);} return output; }
async function walk(directory,output) { for (const entry of await readdir(directory,{withFileTypes:true})){const url=new URL(entry.name+(entry.isDirectory()?"/":""),directory);if(entry.isDirectory())await walk(url,output);else if(/\.(?:ts|tsx|mjs|js)$/u.test(entry.name))output.push(url);} }

function grantRequest(lifecycle, expectedRevision, idempotencyKey) { return { principalSubject:lifecycle.owner.subject,prospectIds:[lifecycle.prospectId],operation:"business_contact_lookup/v1",maxUnits:1,maxCostMinor:10,currency:"CAD",expiresAt:NOW+5_000,expectedRevision,idempotencyKey,now:NOW+5 }; }

function load(fixture,name) { return fixture.vite.ssrLoadModule(new URL(`../domain/${name}.ts`,import.meta.url).pathname); }
/* One at a time: port and verifier authority is a module-scoped WeakSet brand,
 * so it only holds while every module shares one instance of the file that owns
 * it. Concurrent loads let two of them instantiate a shared dependency twice,
 * and the operation then correctly rejects an object branded by the other. */
async function loadDomain(fixture,names) { const modules=[]; for (const name of names) modules.push(await load(fixture,name)); return modules; }

async function enableSyntheticControlledEnrichmentGate(database,workspaceId) {
  const gate = {
    capability:"controlled_enrichment",
    authorization_reference:"synthetic-local-authorization",
    target_project_deployment:"synthetic-local-target",
    reviewed_source_digest:"a".repeat(64),
    migration_identity_status:"synthetic-local-only",
    post_migration_evidence_reference:"synthetic-local-evidence",
    independent_review_reference:"synthetic-local-review",
    deployed_boundary_proof_reference:"synthetic-local-boundary-proof",
  };
  const fields = [
    "capability","authorization_reference","target_project_deployment","reviewed_source_digest",
    "migration_identity_status","post_migration_evidence_reference","independent_review_reference",
    "deployed_boundary_proof_reference",
  ];
  const canonical = fields.map((field) => `${field}=${gate[field]}`).join("\n");
  const bytes = await crypto.subtle.digest("SHA-256",new TextEncoder().encode(canonical));
  const tupleDigest = Array.from(new Uint8Array(bytes),(byte) => byte.toString(16).padStart(2,"0")).join("");
  await database.prepare("DROP TRIGGER phase_gate_activation_disabled_insert").run();
  await database.prepare(
    `INSERT INTO phase_activation_gates (
      id,workspace_id,capability,authorization_reference,target_project_deployment,
      reviewed_source_digest,migration_identity_status,post_migration_evidence_reference,
      independent_review_reference,deployed_boundary_proof_reference,tuple_digest,accepted_at,created_at
    ) VALUES ('p5i-synthetic-gate',?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).bind(
    workspaceId,
    gate.capability,
    gate.authorization_reference,
    gate.target_project_deployment,
    gate.reviewed_source_digest,
    gate.migration_identity_status,
    gate.post_migration_evidence_reference,
    gate.independent_review_reference,
    gate.deployed_boundary_proof_reference,
    tupleDigest,
    NOW+8,
    NOW+8,
  ).run();
}
