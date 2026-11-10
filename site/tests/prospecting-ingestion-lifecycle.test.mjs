import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { applyPersonDiscoveryMigrations, createD1Fixture } from "./helpers/d1.mjs";
import { seedProfileAuthority } from "./helpers/phase4.mjs";

const NOW = 1_780_000_000_000;
const SECRET = new TextEncoder().encode("durable-ingestion-ledger-secret-at-least-32-bytes");
const DIGEST = "a".repeat(64);

async function setup(name) {
  const fixture = await createD1Fixture(name);
  await applyPersonDiscoveryMigrations(fixture.database);
  const principal = { subject:`${name}-owner`, legacySubject:`${name}-legacy`, displayName:"Lifecycle owner" };
  const seeded = await seedProfileAuthority(fixture, principal, NOW);
  const readiness = await fixture.vite.ssrLoadModule(new URL("../domain/profile-readiness.ts", import.meta.url).pathname);
  const candidate = await readiness.createProfileConfigurationCandidate(fixture.database, principal, {
    profileId:seeded.profileId, expectedProfileRevision:seeded.revision,
    idempotencyKey:"0198f500-0000-7000-8000-000000000001", now:NOW,
  });
  const activation = await readiness.activateProfileConfiguration(fixture.database, principal, {
    candidateId:candidate.id, expectedRevision:candidate.revision, expectedDigest:candidate.digest,
    idempotencyKey:"0198f500-0000-7000-8000-000000000002", now:NOW,
  });
  await fixture.database.batch([
    fixture.database.prepare("INSERT INTO organizations (id,workspace_id,created_at,updated_at,revision,company_id,canonical_name,identity_digest) SELECT ?,?,?,?,1,id,'Synthetic lifecycle operator',? FROM companies WHERE workspace_id=?").bind(`${name}-org`,seeded.workspaceId,NOW,NOW,DIGEST,seeded.workspaceId),
    fixture.database.prepare("INSERT INTO accounts (id,workspace_id,created_at,updated_at,revision,play_id,organization_id,state) SELECT ?,?,?,?,1,play_id,?,'draft' FROM customer_profiles WHERE id=?").bind(`${name}-account`,seeded.workspaceId,NOW,NOW,`${name}-org`,seeded.profileId),
    fixture.database.prepare("INSERT INTO targets (id,workspace_id,created_at,updated_at,revision,profile_id,account_id,state) VALUES (?,?,?,?,1,?,?,'draft')").bind(`${name}-target`,seeded.workspaceId,NOW,NOW,seeded.profileId,`${name}-account`),
    fixture.database.prepare("UPDATE prospecting_runs SET execution_state='queued' WHERE id=?").bind(activation.initialRun.id),
  ]);
  return {
    fixture, principal, workspaceId:seeded.workspaceId, profileId:seeded.profileId,
    targetId:`${name}-target`, runId:activation.initialRun.id,
    configurationId:activation.configuration.id, configurationDigest:activation.configuration.digest,
    scheduleId:activation.schedule.id,
  };
}

function payload(status = "complete", origin = "example.invalid") {
  return {
    status,
    findings:[{kind:"operating-signal",sourceUrl:`https://${origin}/source`,observedAt:NOW,excerpt:"synthetic lifecycle observation"}],
    sources:[{url:`https://${origin}/source`,retrievedAt:NOW,excerpt:"synthetic source",publisher:"Synthetic"}],
    provenance:{provider:"runner-provider",model:"runner-model",instructionVersion:"runner-instructions/v1",toolConfigurationDigest:"f".repeat(64),tools:[],transformations:[]},
  };
}

async function submit(seed, key, value = payload(), now = NOW) {
  const runner = await seed.fixture.vite.ssrLoadModule(new URL("../domain/runner-assignment.ts", import.meta.url).pathname);
  const issued = await runner.issueRunnerAssignment(seed.fixture.database, {
    workspaceId:seed.workspaceId, runId:seed.runId, profileId:seed.profileId,
    configurationId:seed.configurationId, configurationDigest:seed.configurationDigest,
    audience:"prospecting-runner/v1", expiresAt:now+60_000,
    instructionVersion:"runner-instructions/v1", toolConfigurationDigest:"f".repeat(64),
    quotas:{maxBytes:20_000,maxFindings:3,maxSources:3}, grantReference:"synthetic",
    reason:`synthetic lifecycle ${key}`, idempotencyKey:`${key}-assignment`, now,
    capabilitySecret:SECRET,
  });
  return runner.submitRunnerObservations(seed.fixture.database, {
    capability:issued.capability, idempotencyKey:`${key}-submission`, payload:value,
    now:now+1, capabilitySecret:SECRET,
  });
}

test("partial canonical submissions stay immutable, retryable, and cannot advance qualification or watermark", async () => {
  const seed=await setup("ledger-partial");
  try {
    const ingestion=await seed.fixture.vite.ssrLoadModule(new URL("../domain/prospecting-ingestion.ts",import.meta.url).pathname);
    const submitted=await submit(seed,"partial",payload("partial"));
    const before=await seed.fixture.database.prepare("SELECT submission_json,submission_digest,status FROM runner_submissions WHERE id=?").bind(submitted.submissionId).first();
    const result=await ingestion.processAcceptedRunnerSubmission(seed.fixture.database,{workspaceId:seed.workspaceId,submissionId:submitted.submissionId,now:NOW+2});
    assert.equal(result.retryable,true);
    assert.deepEqual(await seed.fixture.database.prepare("SELECT submission_json,submission_digest,status FROM runner_submissions WHERE id=?").bind(submitted.submissionId).first(),before);
    const run=await seed.fixture.database.prepare("SELECT execution_state,successful_watermark,window_upper_inclusive FROM prospecting_runs WHERE id=?").bind(seed.runId).first();
    assert.equal(run.execution_state,"submitted");
    assert.equal(run.successful_watermark,null);
    assert.equal(Number((await seed.fixture.database.prepare("SELECT COUNT(*) count FROM prospecting_signals").first()).count),1);
    for(const table of ["prospecting_candidates","qualification_assessments","profile_prospects"]){
      assert.equal(Number((await seed.fixture.database.prepare(`SELECT COUNT(*) count FROM ${table}`).first()).count),0);
    }
    const terminal=await terminalEvents(seed);
    assert.equal(terminal.length,1);
    assert.equal(terminal[0].terminalReason,"partial_submission_retryable");
    assert.equal(terminal[0].retryable,true);
  } finally { await seed.fixture.dispose(); }
});

test("a fresh append-only claim excludes a concurrent worker and produces one effective qualified lifecycle at the exact window watermark", async () => {
  const seed=await setup("ledger-concurrent");
  try {
    const ingestion=await seed.fixture.vite.ssrLoadModule(new URL("../domain/prospecting-ingestion.ts",import.meta.url).pathname);
    const submitted=await submit(seed,"concurrent");
    let release;
    const held=new Promise(resolve=>{release=resolve;});
    let entered;
    const materializerEntered=new Promise(resolve=>{entered=resolve;});
    const materializer=async()=>{entered();await held;return [{
      targetId:seed.targetId,accountFit:2,painStrength:2,timingUrgency:1,dataReadiness:1,commercialViability:1,
      requiredEvidence:["target","pain","timing","operation","offer"],
    }];};
    const first=ingestion.processAcceptedRunnerSubmission(seed.fixture.database,{workspaceId:seed.workspaceId,submissionId:submitted.submissionId,now:NOW+2,materializer});
    await materializerEntered;
    const second=await ingestion.processAcceptedRunnerSubmission(seed.fixture.database,{workspaceId:seed.workspaceId,submissionId:submitted.submissionId,now:NOW+3,materializer});
    assert.equal(second.pending,true);
    release();
    const completed=await first;
    assert.equal(completed.candidateIds.length,1);
    const run=await seed.fixture.database.prepare("SELECT execution_state,successful_watermark,window_upper_inclusive FROM prospecting_runs WHERE id=?").bind(seed.runId).first();
    assert.equal(run.execution_state,"succeeded");
    assert.equal(Number(run.successful_watermark),Number(run.window_upper_inclusive));
    assert.equal(Number(run.successful_watermark),NOW);
    for(const table of ["prospecting_signals","prospecting_candidates","qualification_assessments","profile_prospects"]){
      assert.equal(Number((await seed.fixture.database.prepare(`SELECT COUNT(*) count FROM ${table}`).first()).count),1,table);
    }
  } finally { await seed.fixture.dispose(); }
});

test("a bounded stale lease is recovered append-only and malformed evidence ends in a neutral non-retryable ledger event", async () => {
  const stale=await setup("ledger-stale");
  try {
    const ingestion=await stale.fixture.vite.ssrLoadModule(new URL("../domain/prospecting-ingestion.ts",import.meta.url).pathname);
    const submitted=await submit(stale,"stale");
    const row=await stale.fixture.database.prepare("SELECT submission_digest FROM runner_submissions WHERE id=?").bind(submitted.submissionId).first();
    const eventJson=canonical({schema:"prospecting-ingestion-ledger/v1",stage:"claim",submissionId:submitted.submissionId,submissionDigest:row.submission_digest,attempt:0,leaseExpiresAt:NOW+10});
    await stale.fixture.database.batch([
      stale.fixture.database.prepare("INSERT INTO prospecting_run_events (id,workspace_id,run_id,event_type,event_json,event_digest,operation_digest,created_at) VALUES ('stale-claim',?,?,'validating',?,?,?,?)").bind(stale.workspaceId,stale.runId,eventJson,digest(eventJson),digest("stale-operation"),NOW),
      stale.fixture.database.prepare("UPDATE prospecting_runs SET execution_state='validating' WHERE id=?").bind(stale.runId),
    ]);
    await ingestion.processAcceptedRunnerSubmission(stale.fixture.database,{workspaceId:stale.workspaceId,submissionId:submitted.submissionId,now:NOW+60_011});
    const claims=(await ledgerEvents(stale)).filter(event=>event.stage==="claim");
    assert.deepEqual(claims.map(event=>event.attempt),[0,1]);
    const run=await stale.fixture.database.prepare("SELECT successful_watermark,window_upper_inclusive FROM prospecting_runs WHERE id=?").bind(stale.runId).first();
    assert.equal(Number(run.successful_watermark),Number(run.window_upper_inclusive));
  } finally { await stale.fixture.dispose(); }

  const invalid=await setup("ledger-invalid");
  try {
    const ingestion=await invalid.fixture.vite.ssrLoadModule(new URL("../domain/prospecting-ingestion.ts",import.meta.url).pathname);
    const invalidPayload=payload();
    invalidPayload.findings[0].sourceUrl="https://missing.invalid/source";
    const submitted=await submit(invalid,"invalid",invalidPayload);
    await assert.rejects(
      ingestion.processAcceptedRunnerSubmission(invalid.fixture.database,{workspaceId:invalid.workspaceId,submissionId:submitted.submissionId,now:NOW+2}),
      /unavailable|invalid/i,
    );
    const terminals=await terminalEvents(invalid);
    assert.equal(terminals.at(-1).terminalReason,"validation_rejected");
    assert.equal(terminals.at(-1).retryable,false);
    const durable=JSON.stringify(terminals);
    assert.doesNotMatch(durable,/untrusted|synthetic lifecycle observation|https:/);
    const run=await invalid.fixture.database.prepare("SELECT execution_state,successful_watermark FROM prospecting_runs WHERE id=?").bind(invalid.runId).first();
    assert.equal(run.execution_state,"rejected");
    assert.equal(run.successful_watermark,null);
  } finally { await invalid.fixture.dispose(); }
});

test("new intents reject stale authority while an already-issued historical submission cannot move its successor schedule", async () => {
  const seed=await setup("ledger-historical");
  try {
    const submitted=await submit(seed,"historical");
    const schedule=await seed.fixture.database.prepare("SELECT * FROM prospecting_schedules WHERE id=?").bind(seed.scheduleId).first();
    await seed.fixture.database.batch([
      seed.fixture.database.prepare("UPDATE typed_configurations SET active=0 WHERE id=?").bind(seed.configurationId),
      seed.fixture.database.prepare("UPDATE prospecting_schedules SET active=0 WHERE id=?").bind(seed.scheduleId),
      seed.fixture.database.prepare("INSERT INTO typed_configurations (id,workspace_id,created_at,updated_at,revision,company_id,owner_type,owner_id,kind,digest,manifest_json,active) SELECT 'successor-config',workspace_id,?,?,1,company_id,owner_type,owner_id,kind,?,manifest_json,1 FROM typed_configurations WHERE id=?").bind(NOW+2,NOW+2,"b".repeat(64),seed.configurationId),
      seed.fixture.database.prepare("INSERT INTO authority_commands (id,workspace_id,created_at,updated_at,revision,command_type,idempotency_key,operation_digest,expected_revision,subject_type,subject_id,status) VALUES ('successor-command',?,?,?,1,'test.successor','successor-key',?,1,'profile',?,'accepted')").bind(seed.workspaceId,NOW+2,NOW+2,"c".repeat(64),seed.profileId),
      seed.fixture.database.prepare("INSERT INTO prospecting_schedules (id,workspace_id,created_at,updated_at,revision,profile_id,configuration_id,configuration_digest,schedule_key,timezone,intended_local_time,utc_offset_minutes,cadence,next_run_at,last_successful_watermark,active,execution_state,authority_command_id,operation_digest,idempotency_key) VALUES ('successor-schedule',?,?,?,1,?,'successor-config',?,'successor-key','America/Toronto','06:00',-240,'weekdays',?,?,1,'queued','successor-command',?,'successor-schedule-key')").bind(seed.workspaceId,NOW+2,NOW+2,seed.profileId,"b".repeat(64),Number(schedule.next_run_at),NOW-1_000,"d".repeat(64)),
    ]);
    const scheduling=await seed.fixture.vite.ssrLoadModule(new URL("../domain/prospecting-schedule.ts",import.meta.url).pathname);
    await assert.rejects(
      scheduling.createManualProspectingIntent(seed.fixture.database,seed.workspaceId,{
        profileId:seed.profileId,configurationId:seed.configurationId,configurationDigest:seed.configurationDigest,
        scheduleId:null,idempotencyKey:"stale-manual",at:NOW+3,watermark:null,manifest:{},
      }),
      /active Profile configuration/i,
    );
    const ingestion=await seed.fixture.vite.ssrLoadModule(new URL("../domain/prospecting-ingestion.ts",import.meta.url).pathname);
    await ingestion.processAcceptedRunnerSubmission(seed.fixture.database,{workspaceId:seed.workspaceId,submissionId:submitted.submissionId,now:NOW+4});
    const successor=await seed.fixture.database.prepare("SELECT last_successful_watermark FROM prospecting_schedules WHERE id='successor-schedule'").first();
    assert.equal(Number(successor.last_successful_watermark),NOW-1_000);
  } finally { await seed.fixture.dispose(); }
});

test("a neutral transient terminal immediately permits the next append-only attempt", async () => {
  const seed=await setup("ledger-transient");
  try {
    const ingestion=await seed.fixture.vite.ssrLoadModule(new URL("../domain/prospecting-ingestion.ts",import.meta.url).pathname);
    const submitted=await submit(seed,"transient");
    await assert.rejects(
      ingestion.processAcceptedRunnerSubmission(seed.fixture.database,{
        workspaceId:seed.workspaceId,submissionId:submitted.submissionId,now:NOW+2,
        materializer:()=>{throw new Error("sensitive provider diagnostic");},
      }),
      /unavailable|invalid/i,
    );
    assert.equal((await seed.fixture.database.prepare("SELECT execution_state FROM prospecting_runs WHERE id=?").bind(seed.runId).first()).execution_state,"submitted");
    const firstTerminal=(await terminalEvents(seed)).at(-1);
    assert.deepEqual(
      {terminalReason:firstTerminal.terminalReason,retryable:firstTerminal.retryable},
      {terminalReason:"processing_retryable",retryable:true},
    );
    assert.doesNotMatch(JSON.stringify(firstTerminal),/sensitive provider diagnostic/);
    await ingestion.processAcceptedRunnerSubmission(seed.fixture.database,{
      workspaceId:seed.workspaceId,submissionId:submitted.submissionId,now:NOW+3,
    });
    const claims=(await ledgerEvents(seed)).filter(event=>event.stage==="claim");
    assert.deepEqual(claims.map(event=>event.attempt),[0,1]);
    assert.equal((await seed.fixture.database.prepare("SELECT execution_state FROM prospecting_runs WHERE id=?").bind(seed.runId).first()).execution_state,"succeeded");
  } finally { await seed.fixture.dispose(); }
});

test("a validated partial callback replay after its serialized successor succeeded preserves evidence and watermark", async () => {
  const seed=await setup("ledger-late-partial");
  try {
    const ingestion=await seed.fixture.vite.ssrLoadModule(new URL("../domain/prospecting-ingestion.ts",import.meta.url).pathname);
    const partial=await submit(seed,"late-partial",payload("partial"));
    // A consumed nonce alone cannot authorize another capability. Trusted partial
    // validation must finish before the explicit successor assignment is issued.
    await assert.rejects(() => submit(seed,"premature-complete",payload("complete")), /runner_assignment_rejected/);
    const validatedPartial=await ingestion.processAcceptedRunnerSubmission(seed.fixture.database,{
      workspaceId:seed.workspaceId,submissionId:partial.submissionId,now:NOW+2,
    });
    assert.equal(validatedPartial.retryable,true);
    assert.equal(validatedPartial.signalCount,1);
    const immutablePartial=await seed.fixture.database.prepare("SELECT submission_json,submission_digest,status FROM runner_submissions WHERE id=?").bind(partial.submissionId).first();
    const complete=await submit(seed,"early-complete",payload("complete","successor.example.invalid"),NOW+3);
    await ingestion.processAcceptedRunnerSubmission(seed.fixture.database,{
      workspaceId:seed.workspaceId,submissionId:complete.submissionId,now:NOW+5,
    });
    const before=await seed.fixture.database.prepare("SELECT execution_state,successful_watermark FROM prospecting_runs WHERE id=?").bind(seed.runId).first();
    const result=await ingestion.processAcceptedRunnerSubmission(seed.fixture.database,{
      workspaceId:seed.workspaceId,submissionId:partial.submissionId,now:NOW+6,
    });
    assert.equal(result.signalCount,1);
    assert.equal(result.retryable,true);
    assert.equal(result.replayed,true);
    assert.deepEqual(await seed.fixture.database.prepare("SELECT submission_json,submission_digest,status FROM runner_submissions WHERE id=?").bind(partial.submissionId).first(),immutablePartial);
    assert.equal(Number((await seed.fixture.database.prepare("SELECT COUNT(*) count FROM runner_assignments WHERE run_id=? AND status='issued'").bind(seed.runId).first()).count),0);
    assert.equal(Number((await seed.fixture.database.prepare("SELECT COUNT(*) count FROM prospecting_signals WHERE run_id=?").bind(seed.runId).first()).count),2);
    assert.deepEqual(await seed.fixture.database.prepare("SELECT execution_state,successful_watermark FROM prospecting_runs WHERE id=?").bind(seed.runId).first(),before);
    assert.equal((await terminalEvents(seed)).some(event=>event.submissionId===partial.submissionId&&event.terminalReason==="partial_submission_retryable"),true);
  } finally { await seed.fixture.dispose(); }
});

async function ledgerEvents(seed) {
  const rows=await seed.fixture.database.prepare("SELECT event_json FROM prospecting_run_events WHERE run_id=? AND event_type IN ('validating','failed','watermark_advanced') ORDER BY created_at,id").bind(seed.runId).all();
  return rows.results.map(row=>JSON.parse(row.event_json)).filter(event=>event.schema==="prospecting-ingestion-ledger/v1");
}
async function terminalEvents(seed) {
  return (await ledgerEvents(seed)).filter(event=>event.stage==="terminal");
}
function canonical(value) {
  if(Array.isArray(value))return`[${value.map(canonical).join(",")}]`;
  if(value&&typeof value==="object")return`{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
function digest(value) { return createHash("sha256").update(value).digest("hex"); }

// --- 2026-11-09 review batch 05: exact replay after capability expiry, retryable ingress status ---

async function issue(seed, key, now = NOW, ttl = 60_000) {
  const runner = await seed.fixture.vite.ssrLoadModule(new URL("../domain/runner-assignment.ts", import.meta.url).pathname);
  const issued = await runner.issueRunnerAssignment(seed.fixture.database, {
    workspaceId:seed.workspaceId, runId:seed.runId, profileId:seed.profileId,
    configurationId:seed.configurationId, configurationDigest:seed.configurationDigest,
    audience:"prospecting-runner/v1", expiresAt:now+ttl,
    instructionVersion:"runner-instructions/v1", toolConfigurationDigest:"f".repeat(64),
    quotas:{maxBytes:20_000,maxFindings:3,maxSources:3}, grantReference:"synthetic",
    reason:`synthetic lifecycle ${key}`, idempotencyKey:`${key}-assignment`, now,
    capabilitySecret:SECRET,
  });
  return { runner, capability:issued.capability };
}
function ingressRequest(capability, idempotencyKey, value) {
  return new Request("https://prospector.test/api/prospecting/runner", {
    method:"POST", headers:{"content-type":"application/json"},
    body:JSON.stringify({ capability, idempotencyKey, payload:value }),
  });
}

test("an exact same-key replay after capability expiry reprocesses a retryable submission while new or different data stays refused", async () => {
  const seed=await setup("ledger-expired-replay");
  try {
    const handler=await seed.fixture.vite.ssrLoadModule(new URL("../domain/prospecting-handler.ts",import.meta.url).pathname);
    const { runner, capability }=await issue(seed,"expired-replay");
    let clock=NOW+1;
    const ingress=(materializer)=>({ database:seed.fixture.database, runnerIngressEnabled:true, runnerCapabilitySecret:SECRET, now:()=>clock, candidateMaterializer:materializer });

    const failing=await handler.handleRunnerIngress(ingressRequest(capability,"expired-replay-submission",payload()),ingress(()=>{throw new Error("transient synthetic failure");}));
    assert.equal(failing.status,503,"a retryable processing failure must tell the runner to retry");
    assert.equal((await failing.json()).error,"runner_processing_retryable");
    assert.equal(failing.headers.get("retry-after"),"5");
    assert.equal((await seed.fixture.database.prepare("SELECT execution_state FROM prospecting_runs WHERE id=?").bind(seed.runId).first()).execution_state,"submitted");

    clock=NOW+120_000; // past both capability and assignment expiry
    const different=payload();
    different.findings[0].excerpt="different synthetic observation";
    assert.equal((await handler.handleRunnerIngress(ingressRequest(capability,"expired-replay-submission",different),ingress())).status,404,"a different digest under the same key is still refused");
    await assert.rejects(()=>runner.submitRunnerObservations(seed.fixture.database,{capability,idempotencyKey:"expired-replay-submission",payload:different,now:clock,capabilitySecret:SECRET}),/runner_assignment_rejected/);
    assert.equal((await handler.handleRunnerIngress(ingressRequest(capability,"expired-brand-new-submission",payload()),ingress())).status,404,"a brand-new submission on an expired capability is refused");
    await assert.rejects(()=>runner.submitRunnerObservations(seed.fixture.database,{capability,idempotencyKey:"expired-brand-new-submission",payload:payload(),now:clock,capabilitySecret:SECRET}),/runner_assignment_rejected/);
    assert.equal(Number((await seed.fixture.database.prepare("SELECT COUNT(*) count FROM runner_submissions WHERE run_id=?").bind(seed.runId).first()).count),1);

    const replay=await handler.handleRunnerIngress(ingressRequest(capability,"expired-replay-submission",payload()),ingress());
    assert.equal(replay.status,200);
    const body=await replay.json();
    assert.equal(body.replayed,true);
    assert.equal((await seed.fixture.database.prepare("SELECT execution_state FROM prospecting_runs WHERE id=?").bind(seed.runId).first()).execution_state,"succeeded");
    const claims=(await ledgerEvents(seed)).filter(event=>event.stage==="claim");
    assert.deepEqual(claims.map(event=>event.attempt),[0,1]);
  } finally { await seed.fixture.dispose(); }
});

test("a re-POST while another worker holds the processing claim returns a retryable non-2xx status", async () => {
  const seed=await setup("ledger-pending-ingress");
  try {
    const handler=await seed.fixture.vite.ssrLoadModule(new URL("../domain/prospecting-handler.ts",import.meta.url).pathname);
    const ingestion=await seed.fixture.vite.ssrLoadModule(new URL("../domain/prospecting-ingestion.ts",import.meta.url).pathname);
    const { runner, capability }=await issue(seed,"pending-ingress");
    const submitted=await runner.submitRunnerObservations(seed.fixture.database,{capability,idempotencyKey:"pending-ingress-submission",payload:payload(),now:NOW+1,capabilitySecret:SECRET});
    let release, entered;
    const held=new Promise(resolve=>{release=resolve;});
    const materializerEntered=new Promise(resolve=>{entered=resolve;});
    const first=ingestion.processAcceptedRunnerSubmission(seed.fixture.database,{workspaceId:seed.workspaceId,submissionId:submitted.submissionId,now:NOW+2,materializer:async()=>{entered();await held;return [];}});
    await materializerEntered;
    const pending=await handler.handleRunnerIngress(ingressRequest(capability,"pending-ingress-submission",payload()),{database:seed.fixture.database,runnerIngressEnabled:true,runnerCapabilitySecret:SECRET,now:()=>NOW+3});
    assert.equal(pending.status,503);
    assert.deepEqual(await pending.json(),{error:"runner_processing_pending",submissionId:submitted.submissionId});
    assert.equal(pending.headers.get("retry-after"),"5");
    release();
    await first;
    const done=await handler.handleRunnerIngress(ingressRequest(capability,"pending-ingress-submission",payload()),{database:seed.fixture.database,runnerIngressEnabled:true,runnerCapabilitySecret:SECRET,now:()=>NOW+4});
    assert.equal(done.status,200);
    assert.deepEqual(await done.json(),{submissionId:submitted.submissionId,replayed:true});
  } finally { await seed.fixture.dispose(); }
});
