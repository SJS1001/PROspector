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
function payload(observedAt=NOW,url="https://example.invalid/source",kind="operating-signal"){return{status:"complete",findings:[{kind,sourceUrl:url,observedAt,excerpt:"synthetic observation"}],sources:[{url,retrievedAt:observedAt,excerpt:"source",publisher:"Synthetic"}],provenance:{provider:"runner-provider",model:"runner-model",instructionVersion:"runner-instructions/v1",toolConfigurationDigest:"f".repeat(64),tools:[],transformations:[]}};}
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

test("owner-rejected prospect re-enters immediately on a later Material Signal",async()=>{
 const seed=await setup();try{
  const runner=await seed.fixture.vite.ssrLoadModule(new URL("../domain/runner-assignment.ts",import.meta.url).pathname);
  const ingestion=await seed.fixture.vite.ssrLoadModule(new URL("../domain/prospecting-ingestion.ts",import.meta.url).pathname);
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
  const legacyFingerprint=await testDigest(testStable({accountId:"ingest-account",targetId:"ingest-target",offerId:"phase4-offer",configurationDigest:seed.configurationDigest}));
  await seed.fixture.database.batch([
   seed.fixture.database.prepare("UPDATE prospecting_candidates SET fingerprint=? WHERE id=?").bind(legacyFingerprint,candidateId),
   seed.fixture.database.prepare("UPDATE profile_prospects SET fingerprint=? WHERE id=?").bind(legacyFingerprint,firstProspect.id),
  ]);
  const reviewCommand={prospectId:firstProspect.id,assessmentId:firstProspect.assessment_id,decision:"reject",reason:"Owner rejection used for cooldown regression",expectedRevision:Number(firstProspect.revision),idempotencyKey:"reentry-owner-reject",now:NOW+10};
  const decided=await review.decideQualifiedProspect(seed.fixture.database,seed.principal,reviewCommand);
  assert.equal(decided.replayed,false);
  assert.deepEqual(await review.decideQualifiedProspect(seed.fixture.database,seed.principal,reviewCommand),{decisionId:decided.decisionId,replayed:true},"the exact successful command replays after prospect state and revision advance");
  await assert.rejects(()=>review.decideQualifiedProspect(seed.fixture.database,seed.principal,{...reviewCommand,reason:"Changed payload under the same key"}),/idempotency key conflicts/i);
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
  const ordinaryRun=replacement.initialRun.id,ordinaryWindow=await seed.fixture.database.prepare("SELECT window_upper_inclusive FROM prospecting_runs WHERE id=?").bind(ordinaryRun).first(),ordinaryAt=NOW+23;
  const immediate=await runSubmission({runId:ordinaryRun,at:ordinaryAt,observedAt:Number(ordinaryWindow.window_upper_inclusive),key:"reentry-ordinary",materializer:()=>[candidateDraft]});
  const successor=await seed.fixture.database.prepare("SELECT id,assessment_id,state,active FROM profile_prospects WHERE assessment_id=? AND active=1").bind(immediate.assessments[0].id).first();
  assert.deepEqual({assessmentId:successor.assessment_id,state:successor.state,active:Number(successor.active)},{assessmentId:immediate.assessments[0].id,state:"qualified",active:1});
  const event=await seed.fixture.database.prepare("SELECT signal_id,prior_assessment_id,event_kind,event_json,event_digest FROM prospect_reentry_events WHERE prospect_id=?").bind(firstProspect.id).first();
  assert.equal(event.event_kind,"material_signal");assert.equal(event.prior_assessment_id,firstProspect.assessment_id);assert.match(event.event_digest,/^[0-9a-f]{64}$/);
  assert.equal(JSON.parse(event.event_json).reenteredProspectId,successor.id);
  assert.equal(Number((await seed.fixture.database.prepare("SELECT COUNT(*) count FROM prospecting_source_lineage WHERE workspace_id=? AND json_extract(lineage_json,'$.schema')='prospect-reentry-disproof-validation/v1'").bind(seed.workspaceId).first()).count),0,"runner observations cannot assert a validation marker");
  await assertForbiddenOperationalRowsUnchanged(seed.fixture.database,forbidden);
 }finally{await seed.fixture.dispose();}
});

async function rejectedScenario(key){
 const seed=await setup(),runner=await seed.fixture.vite.ssrLoadModule(new URL("../domain/runner-assignment.ts",import.meta.url).pathname),ingestion=await seed.fixture.vite.ssrLoadModule(new URL("../domain/prospecting-ingestion.ts",import.meta.url).pathname),review=await seed.fixture.vite.ssrLoadModule(new URL("../domain/prospect-review.ts",import.meta.url).pathname),readiness=await seed.fixture.vite.ssrLoadModule(new URL("../domain/profile-readiness.ts",import.meta.url).pathname);
 const candidateDraft={targetId:"ingest-target",accountFit:2,painStrength:2,timingUrgency:1,dataReadiness:1,commercialViability:1,requiredEvidence:["target","pain","timing","operation","offer"]};
 const runSubmission=async({runId,at,submissionKey,kind="operating-signal",observedAt=at})=>{const issued=await runner.issueRunnerAssignment(seed.fixture.database,{workspaceId:seed.workspaceId,runId,profileId:seed.profileId,configurationId:seed.configurationId,configurationDigest:seed.configurationDigest,audience:"prospecting-runner/v1",expiresAt:at+60_000,instructionVersion:"runner-instructions/v1",toolConfigurationDigest:"f".repeat(64),quotas:{maxBytes:20_000,maxFindings:3,maxSources:3},grantReference:"synthetic",reason:"synthetic cooldown regression",idempotencyKey:`${submissionKey}-assignment`,now:at,capabilitySecret:secret});const submitted=await runner.submitRunnerObservations(seed.fixture.database,{capability:issued.capability,idempotencyKey:`${submissionKey}-submission`,payload:payload(observedAt,`https://${submissionKey}.example.invalid/source`,kind),now:at+1,capabilitySecret:secret});return ingestion.processAcceptedRunnerSubmission(seed.fixture.database,{workspaceId:seed.workspaceId,submissionId:submitted.submissionId,now:at+2,materializer:()=>[candidateDraft]});};
 const initial=await runSubmission({runId:seed.runId,at:NOW,submissionKey:`${key}-initial`}),prospect=await seed.fixture.database.prepare("SELECT id,assessment_id,revision FROM profile_prospects WHERE candidate_id=? AND active=1").bind(initial.candidateIds[0]).first(),decisionAt=NOW+10;
 await review.decideQualifiedProspect(seed.fixture.database,seed.principal,{prospectId:prospect.id,assessmentId:prospect.assessment_id,decision:"reject",reason:"Owner rejected synthetic prospect",expectedRevision:Number(prospect.revision),idempotencyKey:`${key}-reject`,now:decisionAt});
 return {seed,review,readiness,runSubmission,prospect,decisionAt};
}

async function replaceProfileConfiguration(scenario,key,at){
 const {seed,readiness}=scenario,product=await seed.fixture.database.prepare("SELECT id,owner_id FROM typed_configurations WHERE workspace_id=? AND owner_type='product' AND kind='product_discovery' AND active=1 LIMIT 1").bind(seed.workspaceId).first(),productId=`product-config-${key}`;
 await seed.fixture.database.batch([
  seed.fixture.database.prepare("UPDATE typed_configurations SET active=0 WHERE id=? AND workspace_id=?").bind(product.id,seed.workspaceId),
  seed.fixture.database.prepare("INSERT INTO typed_configurations (id,workspace_id,created_at,updated_at,revision,company_id,owner_type,owner_id,kind,digest,manifest_json,active) VALUES (?,?,?, ?,1,NULL,'product',?,'product_discovery',?,?,1)").bind(productId,seed.workspaceId,at,at,product.owner_id,"b".repeat(64),JSON.stringify({policySnapshot:{sourcePolicy:{id:`source-policy-${key}`,versionId:"phase4-version-3",digest:"b".repeat(64),value:{tier1Origins:["example.invalid"],tier2Origins:[],materialSignalKinds:["operating-signal"]}},runnerPolicy:{id:"phase4-runner-policy",versionId:"phase4-version-3",digest:"a".repeat(64),value:{allowedTools:[]}}},replacementDirectives:{id:"phase4-replacement-directives",digest:"a".repeat(64)}})),
 ]);
 const profile=await seed.fixture.database.prepare("SELECT revision FROM customer_profiles WHERE id=?").bind(seed.profileId).first(),candidate=await readiness.createProfileConfigurationCandidate(seed.fixture.database,seed.principal,{profileId:seed.profileId,expectedProfileRevision:Number(profile.revision),idempotencyKey:`${key}-candidate`,now:at+1}),replacement=await readiness.activateProfileConfiguration(seed.fixture.database,seed.principal,{candidateId:candidate.id,expectedRevision:candidate.revision,expectedDigest:candidate.digest,idempotencyKey:`${key}-activate`,now:at+2});
 seed.configurationId=replacement.configuration.id;seed.configurationDigest=replacement.configuration.digest;
 await seed.fixture.database.prepare("UPDATE prospecting_runs SET execution_state='queued' WHERE id=?").bind(replacement.initialRun.id).run();
 return replacement.initialRun.id;
}

test("owner rejection forbids non-material re-entry before the 90-day cooldown expires",async()=>{
 const scenario=await rejectedScenario("early-reentry");try{const before=await snapshotForbiddenOperationalRows(scenario.seed.fixture.database),runId=await replaceProfileConfiguration(scenario,"early-reentry",scenario.decisionAt+1),window=await scenario.seed.fixture.database.prepare("SELECT window_upper_inclusive FROM prospecting_runs WHERE id=?").bind(runId).first();await assert.rejects(()=>scenario.runSubmission({runId,at:scenario.decisionAt+3,observedAt:Number(window.window_upper_inclusive),submissionKey:"early-reentry-attempt",kind:"context-signal"}),(error)=>error?.code==="prospecting_ingestion_rejected");assert.equal(Number((await scenario.seed.fixture.database.prepare("SELECT COUNT(*) count FROM prospect_reentry_events WHERE prospect_id=?").bind(scenario.prospect.id).first()).count),0);assert.deepEqual(await snapshotForbiddenOperationalRows(scenario.seed.fixture.database),before);}finally{await scenario.seed.fixture.dispose();}
});

test("owner-rejected prospect re-enters after the 90-day cooldown without sourced disproof",async()=>{
 const scenario=await rejectedScenario("expired-reentry");try{const before=await snapshotForbiddenOperationalRows(scenario.seed.fixture.database),expiredAt=scenario.decisionAt+90*86_400_000+1,runId=await replaceProfileConfiguration(scenario,"expired-reentry",expiredAt),window=await scenario.seed.fixture.database.prepare("SELECT window_upper_inclusive FROM prospecting_runs WHERE id=?").bind(runId).first(),completed=await scenario.runSubmission({runId,at:expiredAt+3,observedAt:Number(window.window_upper_inclusive),submissionKey:"expired-reentry-attempt",kind:"context-signal"}),successor=await scenario.seed.fixture.database.prepare("SELECT id,state,active FROM profile_prospects WHERE assessment_id=?").bind(completed.assessments[0].id).first(),event=await scenario.seed.fixture.database.prepare("SELECT event_kind,signal_id FROM prospect_reentry_events WHERE prospect_id=?").bind(scenario.prospect.id).first();assert.deepEqual({state:successor.state,active:Number(successor.active)},{state:"qualified",active:1});assert.deepEqual(event,{event_kind:"review_due",signal_id:null});assert.deepEqual(await snapshotForbiddenOperationalRows(scenario.seed.fixture.database),before);}finally{await scenario.seed.fixture.dispose();}
});
function testStable(value){if(Array.isArray(value))return`[${value.map(testStable).join(",")}]`;if(value&&typeof value==="object")return`{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${testStable(value[key])}`).join(",")}}`;return JSON.stringify(value);}
async function testDigest(value){const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));return Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,"0")).join("");}
