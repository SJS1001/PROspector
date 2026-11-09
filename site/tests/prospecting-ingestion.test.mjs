import assert from "node:assert/strict";
import test from "node:test";
import { applyPersonDiscoveryMigrations, assertForbiddenOperationalRowsUnchanged, createD1Fixture, snapshotForbiddenOperationalRows } from "./helpers/d1.mjs";
import { seedProfileAuthority } from "./helpers/phase4.mjs";

const NOW=1_780_000_000_000, DIGEST="a".repeat(64), secret=new TextEncoder().encode("prospecting-ingestion-test-secret-at-least-32-bytes");

async function setup(){
  const fixture=await createD1Fixture("prospecting-ingestion"); await applyPersonDiscoveryMigrations(fixture.database);
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
function payload(observedAt=NOW,url="https://example.invalid/source",{kind="operating-signal",retrievedAt=observedAt}={}){return{status:"complete",findings:[{kind,sourceUrl:url,observedAt,excerpt:"synthetic observation"}],sources:[{url,retrievedAt,excerpt:"source",publisher:"Synthetic"}],provenance:{provider:"runner-provider",model:"runner-model",instructionVersion:"runner-instructions/v1",toolConfigurationDigest:"f".repeat(64),tools:[],transformations:[]}};}
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

test("two interleaved capabilities serialize one run and preserve partial observations before a late complete",async()=>{
 const seed=await setup();try{
  const runner=await seed.fixture.vite.ssrLoadModule(new URL("../domain/runner-assignment.ts",import.meta.url).pathname);
  const ingestion=await seed.fixture.vite.ssrLoadModule(new URL("../domain/prospecting-ingestion.ts",import.meta.url).pathname);
  const issue=(key,at)=>runner.issueRunnerAssignment(seed.fixture.database,{workspaceId:seed.workspaceId,runId:seed.runId,profileId:seed.profileId,configurationId:seed.configurationId,configurationDigest:seed.configurationDigest,audience:"prospecting-runner/v1",expiresAt:at+60_000,instructionVersion:"runner-instructions/v1",toolConfigurationDigest:"f".repeat(64),quotas:{maxBytes:20_000,maxFindings:3,maxSources:3},grantReference:"synthetic",reason:"interleaved capability regression",idempotencyKey:key,now:at,capabilitySecret:secret});
  const competing=await Promise.allSettled([issue("interleaved-a",NOW),issue("interleaved-b",NOW)]);
  assert.equal(competing.filter(result=>result.status==="fulfilled").length,1,"the run-scoped assignment invariant admits one live capability");
  assert.equal(competing.filter(result=>result.status==="rejected").length,1);
  const first=competing.find(result=>result.status==="fulfilled").value;
  const partialPayload={...payload(NOW,"https://partial.example.invalid/source"),status:"partial"};
  const partial=await runner.submitRunnerObservations(seed.fixture.database,{capability:first.capability,idempotencyKey:"interleaved-partial",payload:partialPayload,now:NOW+1,capabilitySecret:secret});
  await assert.rejects(()=>issue("interleaved-before-partial-terminal",NOW+2),/runner_assignment_rejected/i,"consuming a token does not open a competing assignment before trusted ingestion");
  const partialResult=await ingestion.processAcceptedRunnerSubmission(seed.fixture.database,{workspaceId:seed.workspaceId,submissionId:partial.submissionId,now:NOW+3});
  assert.equal(partialResult.retryable,true);
  const late=await issue("interleaved-late-complete",NOW+4);
  const complete=await runner.submitRunnerObservations(seed.fixture.database,{capability:late.capability,idempotencyKey:"interleaved-complete",payload:payload(NOW,"https://complete.example.invalid/source"),now:NOW+5,capabilitySecret:secret});
  const completed=await ingestion.processAcceptedRunnerSubmission(seed.fixture.database,{workspaceId:seed.workspaceId,submissionId:complete.submissionId,now:NOW+6});
  assert.equal(completed.signalCount,1);
  assert.deepEqual(await seed.fixture.database.prepare("SELECT execution_state,successful_watermark FROM prospecting_runs WHERE id=?").bind(seed.runId).first(),{execution_state:"succeeded",successful_watermark:NOW});
  const submissions=await seed.fixture.database.prepare("SELECT id,json_extract(submission_json,'$.status') status FROM runner_submissions WHERE run_id=? ORDER BY created_at,id").bind(seed.runId).all();
  assert.deepEqual(submissions.results.map(row=>row.status),["partial","complete"]);
  const signals=await seed.fixture.database.prepare("SELECT submission_id FROM prospecting_signals WHERE run_id=? ORDER BY submission_id").bind(seed.runId).all();
  assert.deepEqual(new Set(signals.results.map(row=>row.submission_id)),new Set([partial.submissionId,complete.submissionId]),"accepted observations from both serialized submissions remain durable");
  await assert.rejects(()=>issue("interleaved-after-complete",NOW+7),/runner_assignment_rejected/i,"a complete submission closes assignment issuance for the run");
  assert.equal(Number((await seed.fixture.database.prepare("SELECT COUNT(*) count FROM runner_assignments WHERE run_id=? AND status='issued'").bind(seed.runId).first()).count),0);
  assert.equal(Number((await seed.fixture.database.prepare("SELECT COUNT(*) count FROM runner_submissions WHERE run_id=? AND json_extract(submission_json,'$.status')='complete'").bind(seed.runId).first()).count),1);
 }finally{await seed.fixture.dispose();}
});

test("owner-rejected prospect re-enters on a Material Signal or sourced disproof, never on ordinary evidence during cooldown",async()=>{
 const seed=await setup();try{
  const runner=await seed.fixture.vite.ssrLoadModule(new URL("../domain/runner-assignment.ts",import.meta.url).pathname);
  const ingestion=await seed.fixture.vite.ssrLoadModule(new URL("../domain/prospecting-ingestion.ts",import.meta.url).pathname);
	  const schedule=await seed.fixture.vite.ssrLoadModule(new URL("../domain/prospecting-schedule.ts",import.meta.url).pathname);
	  const review=await seed.fixture.vite.ssrLoadModule(new URL("../domain/prospect-review.ts",import.meta.url).pathname);
	  const policy=await seed.fixture.vite.ssrLoadModule(new URL("../domain/source-policy.ts",import.meta.url).pathname);
	  const readiness=await seed.fixture.vite.ssrLoadModule(new URL("../domain/profile-readiness.ts",import.meta.url).pathname);
  const forbidden=await snapshotForbiddenOperationalRows(seed.fixture.database);
  const candidateDraft={targetId:"ingest-target",accountFit:2,painStrength:2,timingUrgency:1,dataReadiness:1,commercialViability:1,requiredEvidence:["target","pain","timing","operation","offer"]};
	  const runSubmission=async({runId,at,key,materializer,observedAt=at,kind})=>{
   const issued=await runner.issueRunnerAssignment(seed.fixture.database,{workspaceId:seed.workspaceId,runId,profileId:seed.profileId,configurationId:seed.configurationId,configurationDigest:seed.configurationDigest,audience:"prospecting-runner/v1",expiresAt:at+60_000,instructionVersion:"runner-instructions/v1",toolConfigurationDigest:"f".repeat(64),quotas:{maxBytes:20_000,maxFindings:3,maxSources:3},grantReference:"synthetic",reason:"synthetic reentry regression",idempotencyKey:`${key}-assignment`,now:at,capabilitySecret:secret});
	   const submitted=await runner.submitRunnerObservations(seed.fixture.database,{capability:issued.capability,idempotencyKey:`${key}-submission`,payload:payload(observedAt,`https://${key}.example.invalid/source`,{kind}),now:at+1,capabilitySecret:secret});
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

  // Ordinary (non-material-kind) evidence during the cooldown must not reopen the rejected prospect.
  const ordinaryRun=replacement.initialRun.id,ordinaryWindow=await seed.fixture.database.prepare("SELECT window_upper_inclusive FROM prospecting_runs WHERE id=?").bind(ordinaryRun).first(),ordinaryAt=NOW+23;
  await assert.rejects(()=>runSubmission({runId:ordinaryRun,at:ordinaryAt,observedAt:Number(ordinaryWindow.window_upper_inclusive),key:"reentry-ordinary",kind:"account-context",materializer:()=>[candidateDraft]}),/Prospecting ingestion is unavailable or invalid/,"ordinary evidence is refused during cooldown");
  const ordinaryCandidate=await seed.fixture.database.prepare("SELECT id FROM prospecting_candidates WHERE run_id=?").bind(ordinaryRun).first();
  await assert.rejects(()=>review.persistQualificationAssessment(seed.fixture.database,{subject:seed.principal.subject},{candidateId:ordinaryCandidate.id,now:ordinaryAt+3}),/cooldown remains active; a Material Signal is required for re-entry/);
  assert.equal(Number((await seed.fixture.database.prepare("SELECT COUNT(*) count FROM prospect_reentry_events WHERE prospect_id=?").bind(firstProspect.id).first()).count),0,"ordinary evidence writes no re-entry event");

  const materialReplacement=await replaceConfiguration(seed,readiness,1,NOW+24);
  const materialRun=materialReplacement.runId,materialAt=NOW+30;
  const materialReentry=await runSubmission({runId:materialRun,at:materialAt,observedAt:materialReplacement.upper,key:"reentry-material",materializer:()=>[candidateDraft]});
  assert.ok(materialReentry.assessments[0],"Plan 04-07: a Material Signal may reopen a rejected prospect during the 90-day cooldown");
  const materialSuccessor=await seed.fixture.database.prepare("SELECT id,assessment_id,state,active,revision FROM profile_prospects WHERE assessment_id=? AND active=1").bind(materialReentry.assessments[0].id).first();
  assert.equal(materialSuccessor.state,"qualified");
  const materialEvent=await seed.fixture.database.prepare("SELECT event_kind FROM prospect_reentry_events WHERE prospect_id=?").bind(firstProspect.id).first();
  assert.equal(materialEvent.event_kind,"material_signal");
  assert.equal(Number((await seed.fixture.database.prepare("SELECT COUNT(*) count FROM prospecting_source_lineage WHERE workspace_id=? AND json_extract(lineage_json,'$.schema')='prospect-reentry-disproof-validation/v1'").bind(seed.workspaceId).first()).count),0,"runner observations cannot assert a validation marker");

  const materialSignal=await seed.fixture.database.prepare("SELECT ps.id,ps.signal_digest,pl.id lineage_id,pl.lineage_digest,json_extract(pl.lineage_json,'$.observationFingerprint') fingerprint FROM prospecting_signals ps JOIN prospecting_source_lineage pl ON pl.id=ps.source_lineage_id WHERE ps.run_id=?").bind(materialRun).first();
  const materialSubmission=await seed.fixture.database.prepare("SELECT id FROM runner_submissions WHERE run_id=?").bind(materialRun).first();
  await assert.rejects(()=>policy.appendSourcedDisproofValidationMarker(seed.fixture.database,{workspaceId:seed.workspaceId,profileId:seed.profileId,candidateId,runId:materialRun,submissionId:materialSubmission.id,selection:{signalFingerprint:"0".repeat(64),validationRule:"owner-rejection-material-evidence/v1"},now:materialAt+3}),/source_policy_rejected/i,"a forged selection cannot substitute another lineage or signal digest");
  await assert.rejects(()=>policy.appendSourcedDisproofValidationMarker(seed.fixture.database,{workspaceId:"wrong-workspace",profileId:seed.profileId,candidateId,runId:materialRun,submissionId:"wrong",selection:{signalFingerprint:materialSignal.fingerprint,validationRule:"owner-rejection-material-evidence/v1"},now:materialAt+3}),/source_policy_rejected/i);
  const candidateBinding=await seed.fixture.database.prepare("SELECT id,candidate_digest,fingerprint,configuration_id FROM prospecting_candidates WHERE run_id=?").bind(materialRun).first();
  const originalCandidateBinding=await seed.fixture.database.prepare("SELECT configuration_id,fingerprint FROM prospecting_candidates WHERE id=?").bind(candidateId).first();
  assert.notEqual(candidateBinding.id,candidateId,"configuration replacement retains a new immutable candidate fact");
  assert.notEqual(candidateBinding.configuration_id,originalCandidateBinding.configuration_id);
  assert.equal(originalCandidateBinding.fingerprint,legacyFingerprint,"the fixture preserves a pre-fix configuration-bound row");
  assert.equal(candidateBinding.fingerprint,stableFingerprint,"the successor restores the stable Prospect identity while compatibility logic still finds the pre-fix rejection");
  const forgedMarker=JSON.stringify({schema:"prospect-reentry-disproof-validation/v1",verdict:"sourced_disproof",validatedBy:"application",workspaceId:seed.workspaceId,profileId:seed.profileId,candidateId:"wrong-candidate",candidateDigest:candidateBinding.candidate_digest,sourceLineageId:"wrong-lineage",sourceLineageDigest:materialSignal.lineage_digest,signalId:materialSignal.id,signalDigest:materialSignal.signal_digest,observedAt:materialAt,retrievedAt:materialAt,validationDigest:"0".repeat(64)});
  await seed.fixture.database.prepare("INSERT INTO prospecting_source_lineage (id,workspace_id,run_id,submission_id,source_id,source_url,publisher_identity,underlying_origin_identity,independence_group,source_tier,published_at,occurred_at,retrieved_at,excerpt,lineage_json,lineage_digest,created_at) VALUES ('forged-disproof-marker',?,?,?,NULL,'https://forged.example.invalid/','forged.example.invalid','forged.example.invalid','origin:forged.example.invalid',1,NULL,?,?,?, ?,?,?)").bind(seed.workspaceId,materialRun,materialSubmission.id,materialAt,materialAt,"forged marker",forgedMarker,"c".repeat(64),materialAt+3).run();
  assert.equal(await policy.readValidatedSourcedDisproofSignalId(seed.fixture.database,{workspaceId:seed.workspaceId,profileId:seed.profileId,candidateId:candidateBinding.id,candidateDigest:candidateBinding.candidate_digest,fingerprint:candidateBinding.fingerprint,priorProspectId:firstProspect.id,priorAssessmentId:firstProspect.assessment_id,decisionAt:NOW+10}),null,"a forged marker with wrong candidate, lineage, and digest never validates");
  assert.equal(await policy.readValidatedSourcedDisproofSignalId(seed.fixture.database,{workspaceId:"wrong-workspace",profileId:seed.profileId,candidateId:candidateBinding.id,candidateDigest:candidateBinding.candidate_digest,fingerprint:candidateBinding.fingerprint,priorProspectId:firstProspect.id,priorAssessmentId:firstProspect.assessment_id,decisionAt:NOW+10}),null,"the marker cannot cross workspace");

  await review.decideQualifiedProspect(seed.fixture.database,seed.principal,{prospectId:materialSuccessor.id,assessmentId:materialSuccessor.assessment_id,decision:"reject",reason:"Clear the Material Signal successor so sourced disproof can be proven separately",expectedRevision:Number(materialSuccessor.revision??1),idempotencyKey:"reentry-owner-reject-successor",now:materialAt+4});

  const disproofAt=NOW+200,disproofRun=await nextRun("reentry-disproof",disproofAt);
  const disproof=await runSubmission({runId:disproofRun,at:disproofAt,key:"reentry-disproof",materializer:({signals})=>[{...candidateDraft,sourcedDisproof:{signalFingerprint:signals[0].fingerprint,validationRule:"owner-rejection-material-evidence/v1"}}]});
  assert.notEqual(disproof.assessments[0].id,firstProspect.assessment_id,"later sourced disproof creates a successor immutable assessment");
  const successor=await seed.fixture.database.prepare("SELECT id,assessment_id,state,active FROM profile_prospects WHERE assessment_id=? AND active=1").bind(disproof.assessments[0].id).first();
  assert.deepEqual({assessmentId:successor.assessment_id,state:successor.state,active:Number(successor.active)},{assessmentId:disproof.assessments[0].id,state:"qualified",active:1});
  const event=await seed.fixture.database.prepare("SELECT signal_id,prior_assessment_id,event_kind,event_json,event_digest FROM prospect_reentry_events WHERE workspace_id=? AND event_kind='sourced_disproof' ORDER BY created_at DESC,id DESC").bind(seed.workspaceId).first();
  assert.equal(event.event_kind,"sourced_disproof");assert.equal(event.prior_assessment_id,materialSuccessor.assessment_id);assert.match(event.event_digest,/^[0-9a-f]{64}$/);
  assert.equal(JSON.parse(event.event_json).reenteredProspectId,successor.id);
  const marker=await seed.fixture.database.prepare("SELECT lineage_json,lineage_digest FROM prospecting_source_lineage WHERE workspace_id=? AND json_extract(lineage_json,'$.schema')='prospect-reentry-disproof-validation/v1' ORDER BY created_at DESC,id DESC").bind(seed.workspaceId).first();
  const markerValue=JSON.parse(marker.lineage_json);assert.match(marker.lineage_digest,/^[0-9a-f]{64}$/);assert.equal(markerValue.workspaceId,seed.workspaceId);assert.equal(markerValue.candidateId,candidateBinding.id);assert.equal(markerValue.signalId,event.signal_id);assert.equal(markerValue.sourceLineageId!==materialSignal.lineage_id,true);assert.equal(markerValue.observedAt>NOW+10,true);
  assert.equal(await policy.readValidatedSourcedDisproofSignalId(seed.fixture.database,{workspaceId:seed.workspaceId,profileId:seed.profileId,candidateId:"wrong-candidate",candidateDigest:candidateBinding.candidate_digest,fingerprint:candidateBinding.fingerprint,priorProspectId:firstProspect.id,priorAssessmentId:firstProspect.assessment_id,decisionAt:NOW+10}),null);
  assert.equal(await policy.readValidatedSourcedDisproofSignalId(seed.fixture.database,{workspaceId:seed.workspaceId,profileId:seed.profileId,candidateId:candidateBinding.id,candidateDigest:"0".repeat(64),fingerprint:candidateBinding.fingerprint,priorProspectId:firstProspect.id,priorAssessmentId:firstProspect.assessment_id,decisionAt:NOW+10}),null);
  await assertForbiddenOperationalRowsUnchanged(seed.fixture.database,forbidden);
 }finally{await seed.fixture.dispose();}
});
test("Material Signal re-entry during a rejection cooldown requires genuinely new post-decision evidence",async()=>{
 const seed=await setup();try{
  const h=await reentryHarness(seed),db=seed.fixture.database;
  const forbidden=await snapshotForbiddenOperationalRows(db);
  const eventUrl="https://material-e.example.invalid/source";
  const initial=await h.submit({runId:seed.runId,at:NOW,key:"cooldown-initial",url:eventUrl,observedAt:NOW});
  const prospect=await db.prepare("SELECT id,assessment_id,revision FROM profile_prospects WHERE candidate_id=? AND active=1").bind(initial.candidateIds[0]).first();
  assert.ok(prospect,"the original material event E qualifies the prospect");
  const decisionAt=NOW+10;
  await h.review.decideQualifiedProspect(db,seed.principal,{prospectId:prospect.id,assessmentId:prospect.assessment_id,decision:"reject",reason:"Owner rejects the prospect evidenced by E",expectedRevision:Number(prospect.revision),idempotencyKey:"cooldown-owner-reject",now:decisionAt});

  // 1. Replaying the exact pre-decision material event E under a replaced configuration.
  const replay=await replaceConfiguration(seed,h.readiness,0,NOW+20);
  assert.equal(replay.lower,null,"the replacement initial run has an unbounded lower window");
  const replayCandidate=await h.expectRefused({runId:replay.runId,at:NOW+30,key:"cooldown-replay",url:eventUrl,observedAt:NOW,label:"repeated pre-decision event E"});

  // 2. Observed after the decision but retrieved before it. The validator requires
  // observedAt<=retrievedAt, so this is pinned as a stored-fact invariant by
  // appending one synthetic material fact to the refused submission.
  await appendRetrievedBeforeDecisionSignal(db,seed,replayCandidate,{occurredAt:decisionAt+5,retrievedAt:decisionAt-1});
  await assert.rejects(()=>h.review.persistQualificationAssessment(db,{subject:seed.principal.subject},{candidateId:replayCandidate,now:NOW+34}),/cooldown remains active/,"a signal retrieved before the decision is not new");

  // 3. A post-decision material event already reported for this target in an earlier submission.
  const first=await replaceConfiguration(seed,h.readiness,1,NOW+40);
  const repeatedUrl="https://material-f.example.invalid/source",repeatedAt=first.upper;
  const notQualified=await h.submit({runId:first.runId,at:NOW+50,key:"cooldown-f-first",url:repeatedUrl,observedAt:repeatedAt,draft:{...h.candidateDraft,accountFit:0,painStrength:0,timingUrgency:0,dataReadiness:0,commercialViability:0}});
  assert.notEqual(notQualified.assessments[0].evaluation.outcome,"Passed","the first report of F does not requalify");
  assert.equal((await h.counts()).active,0);
  const second=await replaceConfiguration(seed,h.readiness,2,NOW+60);
  await h.expectRefused({runId:second.runId,at:NOW+70,key:"cooldown-f-repeat",url:repeatedUrl,observedAt:repeatedAt,label:"repetition of an already reported event F"});
  const republished=await replaceConfiguration(seed,h.readiness,3,NOW+80);
  await h.expectRefused({runId:republished.runId,at:NOW+90,key:"cooldown-f-republished",url:"https://republished.example.invalid/f",observedAt:repeatedAt,label:"republication of F by another URL on the same origin"});

  // 4. Ordinary (non-material) evidence during cooldown.
  const ordinary=await replaceConfiguration(seed,h.readiness,4,NOW+100);
  await h.expectRefused({runId:ordinary.runId,at:NOW+110,key:"cooldown-ordinary",url:"https://ordinary.example.invalid/source",observedAt:ordinary.upper,kind:"account-context",label:"ordinary evidence"});
  assert.deepEqual(await h.counts(),{reentries:0,active:0},"no refused case reopened the rejected prospect");

  // 5. A genuinely new post-decision Material Signal still re-enters during cooldown.
  const fresh=await replaceConfiguration(seed,h.readiness,5,NOW+120);
  const reentered=await h.submit({runId:fresh.runId,at:NOW+130,key:"cooldown-new-g",url:"https://material-g.example.invalid/source",observedAt:fresh.upper});
  assert.equal(reentered.assessments[0].queueState,"qualified");
  const event=await db.prepare("SELECT event_kind,signal_id FROM prospect_reentry_events WHERE prospect_id=?").bind(prospect.id).first();
  assert.equal(event.event_kind,"material_signal");
  assert.equal((await db.prepare("SELECT ps.run_id FROM prospecting_signals ps WHERE ps.id=?").bind(event.signal_id).first()).run_id,fresh.runId,"the re-entry cites the new post-decision signal");
  assert.deepEqual(await h.counts(),{reentries:1,active:1});
  await assertForbiddenOperationalRowsUnchanged(db,forbidden);
 }finally{await seed.fixture.dispose();}
});
test("a deferred prospect re-enters before its review date only on genuinely new post-decision Material Signal",async()=>{
 const seed=await setup();try{
  const h=await reentryHarness(seed),db=seed.fixture.database;
  const eventUrl="https://deferred-e.example.invalid/source";
  const initial=await h.submit({runId:seed.runId,at:NOW,key:"defer-initial",url:eventUrl,observedAt:NOW});
  const prospect=await db.prepare("SELECT id,assessment_id,revision FROM profile_prospects WHERE candidate_id=? AND active=1").bind(initial.candidateIds[0]).first();
  const decisionAt=NOW+10;
  await h.review.decideQualifiedProspect(db,seed.principal,{prospectId:prospect.id,assessmentId:prospect.assessment_id,decision:"defer",reason:"Owner defers the prospect evidenced by E",reviewAt:NOW+30*86_400_000,expectedRevision:Number(prospect.revision),idempotencyKey:"defer-owner-defer",now:decisionAt});
  assert.deepEqual(await db.prepare("SELECT state,active FROM profile_prospects WHERE id=?").bind(prospect.id).first(),{state:"deferred",active:0});

  const replay=await replaceConfiguration(seed,h.readiness,0,NOW+20);
  const replayCandidate=await h.expectRefused({runId:replay.runId,at:NOW+30,key:"defer-replay",url:eventUrl,observedAt:NOW,label:"deferred: repeated pre-decision event E"});
  await appendRetrievedBeforeDecisionSignal(db,seed,replayCandidate,{occurredAt:decisionAt+5,retrievedAt:decisionAt-1});
  await assert.rejects(()=>h.review.persistQualificationAssessment(db,{subject:seed.principal.subject},{candidateId:replayCandidate,now:NOW+34}),/cooldown remains active/,"deferred: a signal retrieved before the decision is not new");

  const first=await replaceConfiguration(seed,h.readiness,1,NOW+40);
  const repeatedUrl="https://deferred-f.example.invalid/source",repeatedAt=first.upper;
  const notQualified=await h.submit({runId:first.runId,at:NOW+50,key:"defer-f-first",url:repeatedUrl,observedAt:repeatedAt,draft:{...h.candidateDraft,accountFit:0,painStrength:0,timingUrgency:0,dataReadiness:0,commercialViability:0}});
  assert.notEqual(notQualified.assessments[0].evaluation.outcome,"Passed");
  const second=await replaceConfiguration(seed,h.readiness,2,NOW+60);
  await h.expectRefused({runId:second.runId,at:NOW+70,key:"defer-f-repeat",url:repeatedUrl,observedAt:repeatedAt,label:"deferred: repetition of an already reported event F"});

  const ordinary=await replaceConfiguration(seed,h.readiness,3,NOW+80);
  await h.expectRefused({runId:ordinary.runId,at:NOW+90,key:"defer-ordinary",url:"https://deferred-ordinary.example.invalid/source",observedAt:ordinary.upper,kind:"account-context",label:"deferred: ordinary evidence"});
  assert.deepEqual(await h.counts(),{reentries:0,active:0});

  const fresh=await replaceConfiguration(seed,h.readiness,4,NOW+100);
  const reentered=await h.submit({runId:fresh.runId,at:NOW+110,key:"defer-new-g",url:"https://deferred-g.example.invalid/source",observedAt:fresh.upper});
  assert.equal(reentered.assessments[0].queueState,"qualified");
  assert.equal((await db.prepare("SELECT event_kind FROM prospect_reentry_events WHERE prospect_id=?").bind(prospect.id).first()).event_kind,"material_signal");
  assert.deepEqual(await h.counts(),{reentries:1,active:1});
 }finally{await seed.fixture.dispose();}
});
function testStable(value){if(Array.isArray(value))return`[${value.map(testStable).join(",")}]`;if(value&&typeof value==="object")return`{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${testStable(value[key])}`).join(",")}}`;return JSON.stringify(value);}
async function testDigest(value){const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));return Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,"0")).join("");}

/* Replaces the immutable Profile configuration so the next initial run yields a
 * fresh candidate (new configuration_id) with an unbounded lower source window,
 * the reachable path on which repeated pre-decision evidence was re-reported. */
async function replaceConfiguration(seed,readiness,index,at){
 const digestChar="bcdef0123456789"[index];
 const product=await seed.fixture.database.prepare("SELECT owner_id FROM typed_configurations WHERE workspace_id=? AND owner_type='product' AND kind='product_discovery' AND active=1").bind(seed.workspaceId).first();
 await seed.fixture.database.batch([
  seed.fixture.database.prepare("UPDATE typed_configurations SET active=0 WHERE workspace_id=? AND owner_type='product' AND kind='product_discovery' AND active=1").bind(seed.workspaceId),
  seed.fixture.database.prepare("INSERT INTO typed_configurations (id,workspace_id,created_at,updated_at,revision,company_id,owner_type,owner_id,kind,digest,manifest_json,active) VALUES (?,?,?,?,1,NULL,'product',?,'product_discovery',?,?,1)").bind(`phase4-product-config-replacement-${index}`,seed.workspaceId,at,at,product.owner_id,digestChar.repeat(64),JSON.stringify({policySnapshot:{sourcePolicy:{id:`phase4-source-policy-replacement-${index}`,versionId:`phase4-version-r${index}`,digest:digestChar.repeat(64),value:{tier1Origins:["example.invalid"],tier2Origins:[],materialSignalKinds:["operating-signal"]}},runnerPolicy:{id:"phase4-runner-policy",versionId:`phase4-version-r${index}`,digest:"a".repeat(64),value:{allowedTools:[]}}},replacementDirectives:{id:"phase4-replacement-directives",digest:"a".repeat(64)}})),
 ]);
 const profileRow=await seed.fixture.database.prepare("SELECT revision FROM customer_profiles WHERE id=?").bind(seed.profileId).first();
 const candidate=await readiness.createProfileConfigurationCandidate(seed.fixture.database,seed.principal,{profileId:seed.profileId,expectedProfileRevision:Number(profileRow.revision),idempotencyKey:`0198f400-0000-7000-8000-${String(9000+index*2).padStart(12,"0")}`,now:at+1});
 const activated=await readiness.activateProfileConfiguration(seed.fixture.database,seed.principal,{candidateId:candidate.id,expectedRevision:candidate.revision,expectedDigest:candidate.digest,idempotencyKey:`0198f400-0000-7000-8000-${String(9001+index*2).padStart(12,"0")}`,now:at+2});
 assert.notEqual(activated.configuration.id,seed.configurationId,"each step crosses a real immutable Profile configuration replacement");
 seed.configurationId=activated.configuration.id;seed.configurationDigest=activated.configuration.digest;
 await seed.fixture.database.prepare("UPDATE prospecting_runs SET execution_state='queued' WHERE id=?").bind(activated.initialRun.id).run();
 const window=await seed.fixture.database.prepare("SELECT window_lower_exclusive,window_upper_inclusive FROM prospecting_runs WHERE id=?").bind(activated.initialRun.id).first();
 return {runId:activated.initialRun.id,lower:window.window_lower_exclusive,upper:Number(window.window_upper_inclusive)};
}
async function reentryHarness(seed){
 const load=(name)=>seed.fixture.vite.ssrLoadModule(new URL(`../domain/${name}.ts`,import.meta.url).pathname);
 const [runner,ingestion,review,readiness]=await Promise.all([load("runner-assignment"),load("prospecting-ingestion"),load("prospect-review"),load("profile-readiness")]);
 const candidateDraft={targetId:"ingest-target",accountFit:2,painStrength:2,timingUrgency:1,dataReadiness:1,commercialViability:1,requiredEvidence:["target","pain","timing","operation","offer"]};
 const submit=async({runId,at,key,url,observedAt,retrievedAt=observedAt,kind,draft=candidateDraft})=>{
  const issued=await runner.issueRunnerAssignment(seed.fixture.database,{workspaceId:seed.workspaceId,runId,profileId:seed.profileId,configurationId:seed.configurationId,configurationDigest:seed.configurationDigest,audience:"prospecting-runner/v1",expiresAt:at+60_000,instructionVersion:"runner-instructions/v1",toolConfigurationDigest:"f".repeat(64),quotas:{maxBytes:20_000,maxFindings:3,maxSources:3},grantReference:"synthetic",reason:"synthetic material-signal regression",idempotencyKey:`${key}-assignment`,now:at,capabilitySecret:secret});
  const submitted=await runner.submitRunnerObservations(seed.fixture.database,{capability:issued.capability,idempotencyKey:`${key}-submission`,payload:payload(observedAt,url,{kind,retrievedAt}),now:at+1,capabilitySecret:secret});
  return ingestion.processAcceptedRunnerSubmission(seed.fixture.database,{workspaceId:seed.workspaceId,submissionId:submitted.submissionId,now:at+2,materializer:()=>[draft]});
 };
 const counts=async()=>({reentries:Number((await seed.fixture.database.prepare("SELECT COUNT(*) count FROM prospect_reentry_events WHERE workspace_id=?").bind(seed.workspaceId).first()).count),active:Number((await seed.fixture.database.prepare("SELECT COUNT(*) count FROM profile_prospects WHERE workspace_id=? AND active=1").bind(seed.workspaceId).first()).count)});
 /* The refused ingestion leaves its candidate; re-assessing it directly surfaces the review refusal text. */
 const expectRefused=async({runId,at,label,...rest})=>{
  const before=await counts();
  await assert.rejects(()=>submit({runId,at,...rest}),/Prospecting ingestion is unavailable or invalid/,`${label}: ingestion refuses the re-entry`);
  const candidate=await seed.fixture.database.prepare("SELECT id FROM prospecting_candidates WHERE run_id=?").bind(runId).first();
  assert.ok(candidate,`${label}: the candidate was materialized before assessment`);
  await assert.rejects(()=>review.persistQualificationAssessment(seed.fixture.database,{subject:seed.principal.subject},{candidateId:candidate.id,now:at+3}),/cooldown remains active; a Material Signal is required for re-entry/,label);
  assert.deepEqual(await counts(),before,`${label}: no re-entry event and no active prospect`);
  return candidate.id;
 };
 return {review,readiness,candidateDraft,submit,counts,expectRefused};
}
async function appendRetrievedBeforeDecisionSignal(db,seed,candidateId,{occurredAt,retrievedAt}){
 const candidate=await db.prepare("SELECT run_id,submission_id FROM prospecting_candidates WHERE id=?").bind(candidateId).first();
 const lineageId=`late-observed-lineage-${candidateId}`,lineageJson=JSON.stringify({schema:"prospecting-source-lineage/v3",observationFingerprint:"9".repeat(64),occurredAt,retrievedAt});
 await db.batch([
  db.prepare("INSERT INTO prospecting_source_lineage (id,workspace_id,run_id,submission_id,source_id,source_url,publisher_identity,underlying_origin_identity,independence_group,source_tier,published_at,occurred_at,retrieved_at,excerpt,lineage_json,lineage_digest,created_at) VALUES (?,?,?,?,NULL,'https://late-observed.example.invalid/','late-observed.example.invalid','late-observed.example.invalid','origin:late-observed.example.invalid',1,NULL,?,?,'late observed',?,?,?)").bind(lineageId,seed.workspaceId,candidate.run_id,candidate.submission_id,occurredAt,retrievedAt,lineageJson,"8".repeat(64),occurredAt),
  db.prepare("INSERT INTO prospecting_signals (id,workspace_id,profile_id,run_id,submission_id,source_lineage_id,signal_kind,material,signal_json,signal_digest,created_at) VALUES (?,?,?,?,?,?,'operating-signal',1,'{}',?,?)").bind(`late-observed-signal-${candidateId}`,seed.workspaceId,seed.profileId,candidate.run_id,candidate.submission_id,lineageId,"7".repeat(64),occurredAt),
 ]);
}
