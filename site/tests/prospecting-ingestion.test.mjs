import assert from "node:assert/strict";
import test from "node:test";
import { applyMigrations, assertForbiddenOperationalRowsUnchanged, createD1Fixture, snapshotForbiddenOperationalRows } from "./helpers/d1.mjs";
import { seedProfileAuthority } from "./helpers/phase4.mjs";

const NOW=1_780_000_000_000, DIGEST="a".repeat(64), secret=new TextEncoder().encode("prospecting-ingestion-test-secret-at-least-32-bytes");

async function setup(){
  const fixture=await createD1Fixture("prospecting-ingestion"); await applyMigrations(fixture.database);
  const principal={subject:"prospecting-ingestion-owner",legacySubject:"prospecting-ingestion-owner-legacy",displayName:"Ingestion owner"};
  const seeded=await seedProfileAuthority(fixture,principal,NOW), readiness=await fixture.vite.ssrLoadModule(new URL("../domain/profile-readiness.ts",import.meta.url).pathname);
  const candidate=await readiness.createProfileConfigurationCandidate(fixture.database,principal,{profileId:seeded.profileId,expectedProfileRevision:seeded.revision,idempotencyKey:"0198f400-0000-7000-8000-000000000901",now:NOW});
  const activation=await readiness.activateProfileConfiguration(fixture.database,principal,{candidateId:candidate.id,expectedRevision:candidate.revision,expectedDigest:candidate.digest,idempotencyKey:"0198f400-0000-7000-8000-000000000902",now:NOW});
  const workspace={id:seeded.workspaceId},profile={id:seeded.profileId};
  await fixture.database.batch([
    fixture.database.prepare("INSERT INTO organizations (id,workspace_id,created_at,updated_at,revision,company_id,canonical_name,identity_digest) SELECT 'ingest-org',?,?,?,1,id,'Synthetic mining operator',? FROM companies WHERE workspace_id=?").bind(workspace.id,NOW,NOW,DIGEST,workspace.id),
    fixture.database.prepare("INSERT INTO accounts (id,workspace_id,created_at,updated_at,revision,play_id,organization_id,state) SELECT 'ingest-account',?,?,?,1,play_id,'ingest-org','draft' FROM customer_profiles WHERE id=?").bind(workspace.id,NOW,NOW,profile.id),
    fixture.database.prepare("INSERT INTO targets (id,workspace_id,created_at,updated_at,revision,profile_id,account_id,state) VALUES ('ingest-target',?,?,?,1,?,'ingest-account','draft')").bind(workspace.id,NOW,NOW,profile.id),
    fixture.database.prepare("UPDATE prospecting_runs SET execution_state='queued' WHERE id=?").bind(activation.initialRun.id),
  ]); return {fixture,principal,workspaceId:workspace.id,profileId:profile.id,runId:activation.initialRun.id,configurationId:activation.configuration.id,configurationDigest:activation.configuration.digest};
}
function payload(observedAt=NOW,url="https://example.invalid/source"){return{status:"complete",findings:[{kind:"operating-signal",sourceUrl:url,observedAt,excerpt:"synthetic observation"}],sources:[{url,retrievedAt:observedAt,excerpt:"source",publisher:"Synthetic"}],provenance:{provider:"runner-provider",model:"runner-model",instructionVersion:"runner-instructions/v1",toolConfigurationDigest:"f".repeat(64),tools:[],transformations:[]}};}
test("accepted runner observations are pinned, materialized only by the application seam, and complete without later effects",async()=>{
 const seed=await setup();try{const runner=await seed.fixture.vite.ssrLoadModule(new URL("../domain/runner-assignment.ts",import.meta.url).pathname),ingestion=await seed.fixture.vite.ssrLoadModule(new URL("../domain/prospecting-ingestion.ts",import.meta.url).pathname);
 const issued=await runner.issueRunnerAssignment(seed.fixture.database,{workspaceId:seed.workspaceId,runId:seed.runId,profileId:seed.profileId,configurationId:seed.configurationId,configurationDigest:seed.configurationDigest,audience:"prospecting-runner/v1",expiresAt:NOW+60_000,instructionVersion:"runner-instructions/v1",toolConfigurationDigest:"f".repeat(64),quotas:{maxBytes:20_000,maxFindings:3,maxSources:3},grantReference:"synthetic",reason:"synthetic",idempotencyKey:"ingest-assignment",now:NOW,capabilitySecret:secret});
 const submitted=await runner.submitRunnerObservations(seed.fixture.database,{capability:issued.capability,idempotencyKey:"ingest-submission",payload:payload(),now:NOW+1,capabilitySecret:secret}),before=await snapshotForbiddenOperationalRows(seed.fixture.database);
 const completed=await ingestion.processAcceptedRunnerSubmission(seed.fixture.database,{workspaceId:seed.workspaceId,submissionId:submitted.submissionId,now:NOW+2});
 assert.equal(completed.signalCount,1);assert.deepEqual(completed.candidateIds,[]);assert.equal((await seed.fixture.database.prepare("SELECT execution_state,successful_watermark FROM prospecting_runs WHERE id=?").bind(seed.runId).first()).execution_state,"succeeded");assert.equal((await seed.fixture.database.prepare("SELECT COUNT(*) count FROM prospecting_signals WHERE submission_id=?").bind(submitted.submissionId).first()).count,1);
 assert.equal((await ingestion.processAcceptedRunnerSubmission(seed.fixture.database,{workspaceId:seed.workspaceId,submissionId:submitted.submissionId,now:NOW+3})).replayed,true,"a callback retry returns the completed immutable projection");
 assert.deepEqual(await snapshotForbiddenOperationalRows(seed.fixture.database),before);
 }finally{await seed.fixture.dispose();}
});
test("runner callback remains unavailable by default",async()=>{const fixture=await createD1Fixture("prospecting-callback");try{const handler=await fixture.vite.ssrLoadModule(new URL("../domain/prospecting-handler.ts",import.meta.url).pathname),response=await handler.handleRunnerIngress(new Request("https://private.example/api/prospecting/runner",{method:"POST",headers:{"content-type":"application/json"},body:"{}"}));assert.equal(response.status,404);assert.deepEqual(await response.json(),{error:"runner_ingress_unavailable"});}finally{await fixture.dispose();}});
test("enabled injected ingress coordinates an accepted submission through evidence and terminal completion",async()=>{
 const seed=await setup();try{const runner=await seed.fixture.vite.ssrLoadModule(new URL("../domain/runner-assignment.ts",import.meta.url).pathname),handler=await seed.fixture.vite.ssrLoadModule(new URL("../domain/prospecting-handler.ts",import.meta.url).pathname);
 const issued=await runner.issueRunnerAssignment(seed.fixture.database,{workspaceId:seed.workspaceId,runId:seed.runId,profileId:seed.profileId,configurationId:seed.configurationId,configurationDigest:seed.configurationDigest,audience:"prospecting-runner/v1",expiresAt:NOW+60_000,instructionVersion:"runner-instructions/v1",toolConfigurationDigest:"f".repeat(64),quotas:{maxBytes:20_000,maxFindings:3,maxSources:3},grantReference:"synthetic",reason:"synthetic",idempotencyKey:"handler-assignment",now:NOW,capabilitySecret:secret});
 const request=()=>new Request("https://private.example/api/prospecting/runner",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({capability:issued.capability,idempotencyKey:"handler-submission",payload:payload()})});
 const before=await snapshotForbiddenOperationalRows(seed.fixture.database);
 const dependencies={database:seed.fixture.database,runnerIngressEnabled:true,runnerCapabilitySecret:secret,now:()=>NOW+2};const first=await handler.handleRunnerIngress(request(),dependencies),second=await handler.handleRunnerIngress(request(),dependencies);
 assert.equal(first.status,200);assert.equal(second.status,200);const results=await Promise.all([first.json(),second.json()]);assert.equal(results.filter(result=>result.replayed===false).length,1);assert.equal(results.filter(result=>result.replayed===true).length,1);assert.equal((await seed.fixture.database.prepare("SELECT execution_state,successful_watermark FROM prospecting_runs WHERE id=?").bind(seed.runId).first()).execution_state,"succeeded");assert.equal((await seed.fixture.database.prepare("SELECT COUNT(*) count FROM prospecting_signals WHERE run_id=?").bind(seed.runId).first()).count,1);assert.deepEqual(await snapshotForbiddenOperationalRows(seed.fixture.database),before);
 }finally{await seed.fixture.dispose();}
});

test("owner-rejected prospect re-enters only through application-produced sourced disproof bound to later trusted evidence",async()=>{
 const seed=await setup();try{
  const runner=await seed.fixture.vite.ssrLoadModule(new URL("../domain/runner-assignment.ts",import.meta.url).pathname);
  const ingestion=await seed.fixture.vite.ssrLoadModule(new URL("../domain/prospecting-ingestion.ts",import.meta.url).pathname);
	  const schedule=await seed.fixture.vite.ssrLoadModule(new URL("../domain/prospecting-schedule.ts",import.meta.url).pathname);
	  const review=await seed.fixture.vite.ssrLoadModule(new URL("../domain/prospect-review.ts",import.meta.url).pathname);
	  const policy=await seed.fixture.vite.ssrLoadModule(new URL("../domain/source-policy.ts",import.meta.url).pathname);
	  const readiness=await seed.fixture.vite.ssrLoadModule(new URL("../domain/profile-readiness.ts",import.meta.url).pathname);
  const forbidden=await snapshotForbiddenOperationalRows(seed.fixture.database);
  const candidateDraft={targetId:"ingest-target",accountFit:2,painStrength:2,timingUrgency:1,dataReadiness:1,commercialViability:1,requiredEvidence:["target","pain","timing","operation","offer"]};
	  const runSubmission=async({runId,at,key,materializer,observedAt=at})=>{
   const issued=await runner.issueRunnerAssignment(seed.fixture.database,{workspaceId:seed.workspaceId,runId,profileId:seed.profileId,configurationId:seed.configurationId,configurationDigest:seed.configurationDigest,audience:"prospecting-runner/v1",expiresAt:at+60_000,instructionVersion:"runner-instructions/v1",toolConfigurationDigest:"f".repeat(64),quotas:{maxBytes:20_000,maxFindings:3,maxSources:3},grantReference:"synthetic",reason:"synthetic reentry regression",idempotencyKey:`${key}-assignment`,now:at,capabilitySecret:secret});
	   const submitted=await runner.submitRunnerObservations(seed.fixture.database,{capability:issued.capability,idempotencyKey:`${key}-submission`,payload:payload(observedAt,`https://${key}.example.invalid/source`),now:at+1,capabilitySecret:secret});
   return ingestion.processAcceptedRunnerSubmission(seed.fixture.database,{workspaceId:seed.workspaceId,submissionId:submitted.submissionId,now:at+2,materializer});
  };
  const initial=await runSubmission({runId:seed.runId,at:NOW,key:"reentry-initial",materializer:()=>[candidateDraft]});
  const candidateId=initial.candidateIds[0],firstProspect=await seed.fixture.database.prepare("SELECT id,assessment_id,revision FROM profile_prospects WHERE candidate_id=? AND active=1").bind(candidateId).first();
  assert.ok(firstProspect,"application assessment creates the original qualified prospect");
  const stableFingerprint=(await seed.fixture.database.prepare("SELECT fingerprint FROM prospecting_candidates WHERE id=?").bind(candidateId).first()).fingerprint;
  const legacyFingerprint=await testDigest(testStable({accountId:"ingest-account",targetId:"ingest-target",offerId:"phase4-offer",configurationDigest:seed.configurationDigest}));
  await seed.fixture.database.batch([
   seed.fixture.database.prepare("UPDATE prospecting_candidates SET fingerprint=? WHERE id=?").bind(legacyFingerprint,candidateId),
   seed.fixture.database.prepare("UPDATE profile_prospects SET fingerprint=? WHERE id=?").bind(legacyFingerprint,firstProspect.id),
  ]);
  await review.decideQualifiedProspect(seed.fixture.database,seed.principal,{prospectId:firstProspect.id,assessmentId:firstProspect.assessment_id,decision:"reject",reason:"Owner rejection used for sourced-disproof regression",expectedRevision:Number(firstProspect.revision),idempotencyKey:"reentry-owner-reject",now:NOW+10});
  assert.deepEqual(await seed.fixture.database.prepare("SELECT state,active FROM profile_prospects WHERE id=?").bind(firstProspect.id).first(),{state:"rejected",active:0});
  const initialSignal=await seed.fixture.database.prepare("SELECT ps.submission_id,json_extract(pl.lineage_json,'$.observationFingerprint') fingerprint FROM prospecting_signals ps JOIN prospecting_source_lineage pl ON pl.id=ps.source_lineage_id WHERE ps.run_id=?").bind(seed.runId).first();
  await assert.rejects(()=>policy.appendSourcedDisproofValidationMarker(seed.fixture.database,{workspaceId:seed.workspaceId,profileId:seed.profileId,candidateId,runId:seed.runId,submissionId:initialSignal.submission_id,selection:{signalFingerprint:initialSignal.fingerprint,validationRule:"owner-rejection-material-evidence/v1"},now:NOW+11}),/source_policy_rejected/i,"pre-decision evidence cannot become sourced disproof after the owner rejects");

  const productConfiguration=await seed.fixture.database.prepare("SELECT owner_id FROM typed_configurations WHERE id='phase4-product-config' AND workspace_id=?").bind(seed.workspaceId).first();
  await seed.fixture.database.batch([
   seed.fixture.database.prepare("UPDATE typed_configurations SET active=0 WHERE id='phase4-product-config' AND workspace_id=?").bind(seed.workspaceId),
   seed.fixture.database.prepare("INSERT INTO typed_configurations (id,workspace_id,created_at,updated_at,revision,company_id,owner_type,owner_id,kind,digest,manifest_json,active) VALUES ('phase4-product-config-reentry-successor',?,?,?,1,NULL,'product',?,'product_discovery',?,?,1)").bind(seed.workspaceId,NOW+20,NOW+20,productConfiguration.owner_id,"b".repeat(64),JSON.stringify({policySnapshot:{sourcePolicy:{id:"phase4-source-policy-successor",versionId:"phase4-version-3",digest:"b".repeat(64),value:{tier1Origins:["example.invalid"],tier2Origins:[],materialSignalKinds:["operating-signal"]}},runnerPolicy:{id:"phase4-runner-policy",versionId:"phase4-version-3",digest:"a".repeat(64),value:{allowedTools:[]}}},replacementDirectives:{id:"phase4-replacement-directives",digest:"a".repeat(64)}})),
  ]);
  const profileRow=await seed.fixture.database.prepare("SELECT revision FROM customer_profiles WHERE id=?").bind(seed.profileId).first();
  const replacementCandidate=await readiness.createProfileConfigurationCandidate(seed.fixture.database,seed.principal,{profileId:seed.profileId,expectedProfileRevision:Number(profileRow.revision),idempotencyKey:"0198f400-0000-7000-8000-000000000903",now:NOW+21});
  const replacement=await readiness.activateProfileConfiguration(seed.fixture.database,seed.principal,{candidateId:replacementCandidate.id,expectedRevision:replacementCandidate.revision,expectedDigest:replacementCandidate.digest,idempotencyKey:"0198f400-0000-7000-8000-000000000904",now:NOW+22});
  assert.notEqual(replacement.configuration.id,seed.configurationId,"the regression crosses a real immutable Profile configuration replacement");
  seed.configurationId=replacement.configuration.id;
  seed.configurationDigest=replacement.configuration.digest;
  await seed.fixture.database.prepare("UPDATE prospecting_runs SET execution_state='queued' WHERE id=?").bind(replacement.initialRun.id).run();

  const nextRun=async(key,at)=>{
   const activeSchedule=await seed.fixture.database.prepare("SELECT id,last_successful_watermark FROM prospecting_schedules WHERE workspace_id=? AND profile_id=? AND active=1").bind(seed.workspaceId,seed.profileId).first();
   const intent=await schedule.createManualProspectingIntent(seed.fixture.database,seed.workspaceId,{profileId:seed.profileId,configurationId:seed.configurationId,configurationDigest:seed.configurationDigest,scheduleId:activeSchedule.id,watermark:Number(activeSchedule.last_successful_watermark),manifest:{requestedBy:"owner",purpose:"reentry-regression"},idempotencyKey:`${key}-intent`,at});
   await seed.fixture.database.prepare("UPDATE prospecting_runs SET execution_state='queued' WHERE id=? AND execution_state='blocked_missing_capability'").bind(intent.id).run();
   return intent.id;
  };

  const ordinaryRun=replacement.initialRun.id,ordinaryWindow=await seed.fixture.database.prepare("SELECT window_upper_inclusive FROM prospecting_runs WHERE id=?").bind(ordinaryRun).first(),ordinaryAt=NOW+23;
  await assert.rejects(()=>runSubmission({runId:ordinaryRun,at:ordinaryAt,observedAt:Number(ordinaryWindow.window_upper_inclusive),key:"reentry-ordinary",materializer:()=>[candidateDraft]}),(error)=>error?.code==="prospecting_ingestion_rejected","ordinary material evidence under a replacement configuration cannot bypass the owner's rejection");
  assert.equal(Number((await seed.fixture.database.prepare("SELECT COUNT(*) count FROM prospect_reentry_events WHERE prospect_id=?").bind(firstProspect.id).first()).count),0);
  assert.equal(Number((await seed.fixture.database.prepare("SELECT COUNT(*) count FROM prospecting_source_lineage WHERE workspace_id=? AND json_extract(lineage_json,'$.schema')='prospect-reentry-disproof-validation/v1'").bind(seed.workspaceId).first()).count),0,"runner observations cannot assert a validation marker");

  const ordinarySignal=await seed.fixture.database.prepare("SELECT ps.id,ps.signal_digest,pl.id lineage_id,pl.lineage_digest,json_extract(pl.lineage_json,'$.observationFingerprint') fingerprint FROM prospecting_signals ps JOIN prospecting_source_lineage pl ON pl.id=ps.source_lineage_id WHERE ps.run_id=?").bind(ordinaryRun).first();
  const ordinarySubmission=await seed.fixture.database.prepare("SELECT id FROM runner_submissions WHERE run_id=?").bind(ordinaryRun).first();
  await assert.rejects(()=>policy.appendSourcedDisproofValidationMarker(seed.fixture.database,{workspaceId:seed.workspaceId,profileId:seed.profileId,candidateId,runId:ordinaryRun,submissionId:ordinarySubmission.id,selection:{signalFingerprint:"0".repeat(64),validationRule:"owner-rejection-material-evidence/v1"},now:ordinaryAt+3}),/source_policy_rejected/i,"a forged selection cannot substitute another lineage or signal digest");
  await assert.rejects(()=>policy.appendSourcedDisproofValidationMarker(seed.fixture.database,{workspaceId:"wrong-workspace",profileId:seed.profileId,candidateId,runId:ordinaryRun,submissionId:"wrong",selection:{signalFingerprint:ordinarySignal.fingerprint,validationRule:"owner-rejection-material-evidence/v1"},now:ordinaryAt+3}),/source_policy_rejected/i);
  const candidateBinding=await seed.fixture.database.prepare("SELECT id,candidate_digest,fingerprint,configuration_id FROM prospecting_candidates WHERE run_id=?").bind(ordinaryRun).first();
  const originalCandidateBinding=await seed.fixture.database.prepare("SELECT configuration_id,fingerprint FROM prospecting_candidates WHERE id=?").bind(candidateId).first();
  assert.notEqual(candidateBinding.id,candidateId,"configuration replacement retains a new immutable candidate fact");
  assert.notEqual(candidateBinding.configuration_id,originalCandidateBinding.configuration_id);
  assert.equal(originalCandidateBinding.fingerprint,legacyFingerprint,"the fixture preserves a pre-fix configuration-bound row");
  assert.equal(candidateBinding.fingerprint,stableFingerprint,"the successor restores the stable Prospect identity while compatibility logic still finds the pre-fix rejection");
  const forgedMarker=JSON.stringify({schema:"prospect-reentry-disproof-validation/v1",verdict:"sourced_disproof",validatedBy:"application",workspaceId:seed.workspaceId,profileId:seed.profileId,candidateId:"wrong-candidate",candidateDigest:candidateBinding.candidate_digest,sourceLineageId:"wrong-lineage",sourceLineageDigest:ordinarySignal.lineage_digest,signalId:ordinarySignal.id,signalDigest:ordinarySignal.signal_digest,observedAt:ordinaryAt,retrievedAt:ordinaryAt,validationDigest:"0".repeat(64)});
  await seed.fixture.database.prepare("INSERT INTO prospecting_source_lineage (id,workspace_id,run_id,submission_id,source_id,source_url,publisher_identity,underlying_origin_identity,independence_group,source_tier,published_at,occurred_at,retrieved_at,excerpt,lineage_json,lineage_digest,created_at) VALUES ('forged-disproof-marker',?,?,?,NULL,'https://forged.example.invalid/','forged.example.invalid','forged.example.invalid','origin:forged.example.invalid',1,NULL,?,?,?, ?,?,?)").bind(seed.workspaceId,ordinaryRun,ordinarySubmission.id,ordinaryAt,ordinaryAt,"forged marker",forgedMarker,"c".repeat(64),ordinaryAt+3).run();
  assert.equal(await policy.readValidatedSourcedDisproofSignalId(seed.fixture.database,{workspaceId:seed.workspaceId,profileId:seed.profileId,candidateId:candidateBinding.id,candidateDigest:candidateBinding.candidate_digest,fingerprint:candidateBinding.fingerprint,priorProspectId:firstProspect.id,priorAssessmentId:firstProspect.assessment_id,decisionAt:NOW+10}),null,"a forged marker with wrong candidate, lineage, and digest never validates");
  assert.equal(await policy.readValidatedSourcedDisproofSignalId(seed.fixture.database,{workspaceId:"wrong-workspace",profileId:seed.profileId,candidateId:candidateBinding.id,candidateDigest:candidateBinding.candidate_digest,fingerprint:candidateBinding.fingerprint,priorProspectId:firstProspect.id,priorAssessmentId:firstProspect.assessment_id,decisionAt:NOW+10}),null,"the marker cannot cross workspace");

  const disproofAt=NOW+200,disproofRun=await nextRun("reentry-disproof",disproofAt);
  const disproof=await runSubmission({runId:disproofRun,at:disproofAt,key:"reentry-disproof",materializer:({signals})=>[{...candidateDraft,sourcedDisproof:{signalFingerprint:signals[0].fingerprint,validationRule:"owner-rejection-material-evidence/v1"}}]});
  assert.notEqual(disproof.assessments[0].id,firstProspect.assessment_id,"later sourced disproof creates a successor immutable assessment");
  const successor=await seed.fixture.database.prepare("SELECT id,assessment_id,state,active FROM profile_prospects WHERE assessment_id=? AND active=1").bind(disproof.assessments[0].id).first();
  assert.deepEqual({assessmentId:successor.assessment_id,state:successor.state,active:Number(successor.active)},{assessmentId:disproof.assessments[0].id,state:"qualified",active:1});
  const event=await seed.fixture.database.prepare("SELECT signal_id,prior_assessment_id,event_kind,event_json,event_digest FROM prospect_reentry_events WHERE prospect_id=?").bind(firstProspect.id).first();
  assert.equal(event.event_kind,"sourced_disproof");assert.equal(event.prior_assessment_id,firstProspect.assessment_id);assert.match(event.event_digest,/^[0-9a-f]{64}$/);
  assert.equal(JSON.parse(event.event_json).reenteredProspectId,successor.id);
  const marker=await seed.fixture.database.prepare("SELECT lineage_json,lineage_digest FROM prospecting_source_lineage WHERE workspace_id=? AND json_extract(lineage_json,'$.schema')='prospect-reentry-disproof-validation/v1' ORDER BY created_at DESC,id DESC").bind(seed.workspaceId).first();
  const markerValue=JSON.parse(marker.lineage_json);assert.match(marker.lineage_digest,/^[0-9a-f]{64}$/);assert.equal(markerValue.workspaceId,seed.workspaceId);assert.equal(markerValue.candidateId,candidateBinding.id);assert.equal(markerValue.signalId,event.signal_id);assert.equal(markerValue.sourceLineageId!==ordinarySignal.lineage_id,true);assert.equal(markerValue.observedAt>NOW+10,true);
  assert.equal(await policy.readValidatedSourcedDisproofSignalId(seed.fixture.database,{workspaceId:seed.workspaceId,profileId:seed.profileId,candidateId:"wrong-candidate",candidateDigest:candidateBinding.candidate_digest,fingerprint:candidateBinding.fingerprint,priorProspectId:firstProspect.id,priorAssessmentId:firstProspect.assessment_id,decisionAt:NOW+10}),null);
  assert.equal(await policy.readValidatedSourcedDisproofSignalId(seed.fixture.database,{workspaceId:seed.workspaceId,profileId:seed.profileId,candidateId:candidateBinding.id,candidateDigest:"0".repeat(64),fingerprint:candidateBinding.fingerprint,priorProspectId:firstProspect.id,priorAssessmentId:firstProspect.assessment_id,decisionAt:NOW+10}),null);
  await assertForbiddenOperationalRowsUnchanged(seed.fixture.database,forbidden);
 }finally{await seed.fixture.dispose();}
});
function testStable(value){if(Array.isArray(value))return`[${value.map(testStable).join(",")}]`;if(value&&typeof value==="object")return`{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${testStable(value[key])}`).join(",")}}`;return JSON.stringify(value);}
async function testDigest(value){const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));return Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,"0")).join("");}
