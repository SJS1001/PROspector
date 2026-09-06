import assert from "node:assert/strict";
import test from "node:test";
import { applyMigrations,assertForbiddenOperationalRowsUnchanged,createD1Fixture,snapshotForbiddenOperationalRows } from "./helpers/d1.mjs";

const pepper="generic-onboarding-test-pepper-with-at-least-32-bytes";
const email="local-owner@prospector.invalid";
const identity=()=>Promise.resolve({email,displayName:"Local Owner"});

test("blank handler admits only exact local-demo onboarding and denied paths write nothing",async()=>{
  const fixture=await createD1Fixture("generic-onboarding-handler");
  try{await applyMigrations(fixture.database);const handler=await fixture.vite.ssrLoadModule(new URL("../domain/knowledge-handler.ts",import.meta.url).pathname);
    const forbidden=await snapshotForbiddenOperationalRows(fixture.database);
    const deps=(overrides={})=>({database:fixture.database,subjectPepper:pepper,pilotOwnerEmail:email,getIdentity:identity,enableLocalDemoProgression:true,runtimeIsDevelopment:true,...overrides});
    const csrf=async(d=deps())=>(await handler.handleKnowledgeGet(d)).headers.get("set-cookie").split(";",1)[0];
    const post=(url,origin,cookie,body,d=deps())=>handler.handleKnowledgePost(new Request(url,{method:"POST",headers:{origin,cookie,"sec-fetch-site":"same-origin","content-type":"application/json","x-prospector-intent":"knowledge-mutation"},body}),d);
    const count=async()=>Number((await fixture.database.prepare("SELECT count(*) AS count FROM workspaces").first()).count);
    let token=await csrf();
    assert.equal((await post("http://localhost/api/knowledge","https://attacker.invalid",token,"{}" )).status,403);assert.equal(await count(),0);
    assert.equal((await post("http://localhost/api/knowledge","http://localhost",token,"{",deps({runtimeIsDevelopment:false}))).status,503);assert.equal(await count(),0);
    token=await csrf();
    assert.equal((await post("https://prospector.example/api/knowledge","https://prospector.example",token,"{",deps({enableLocalDemoProgression:false}))).status,503);assert.equal(await count(),0);
    token=await csrf();
    assert.equal((await post("http://localhost/api/knowledge","http://localhost",token,"{}",deps({enableLocalDemoProgression:undefined}))).status,503);assert.equal(await count(),0);
    token=await csrf();
    assert.equal((await post("http://example.test/api/knowledge","http://example.test",token,"{}",deps({enableLocalDemoProgression:true}))).status,503);assert.equal(await count(),0);
    assert.equal((await post("http://localhost/api/knowledge","http://localhost","prospector=bad","{}" )).status,403);assert.equal(await count(),0);
    assert.equal((await handler.handleKnowledgePost(new Request("http://localhost/api/knowledge",{method:"POST",headers:{origin:"http://localhost","sec-fetch-site":"same-origin","content-type":"application/json","x-prospector-intent":"knowledge-mutation"},body:"{}"}),deps({getIdentity:()=>Promise.resolve({email:"outsider@example.test",displayName:"Outsider"})}))).status,404);assert.equal(await count(),0);
    token=await csrf();assert.equal((await post("http://localhost/api/knowledge","http://localhost",token,"{")).status,400);assert.equal(await count(),0);
    token=await csrf();assert.equal((await post("http://localhost/api/knowledge","http://localhost",token,JSON.stringify({action:"initialize_owner_workspace",idempotencyKey:"0198a4b0-0000-7000-8000-000000009599",companyName:"Nope",productName:"Nope",extra:true}))).status,409);assert.equal(await count(),0);
    await assertForbiddenOperationalRowsUnchanged(fixture.database,forbidden);
    token=await csrf();
    const command={action:"initialize_owner_workspace",idempotencyKey:"0198a4b0-0000-7000-8000-000000009501",companyName:"Northwind Marine",productName:"Fleet Insight"};
    const accepted=await post("http://localhost/api/knowledge","http://localhost",token,JSON.stringify(command));
    assert.equal(accepted.status,200);const projection=await accepted.json();assert.equal(projection.onboarding.status,"market_play_required");assert.equal(projection.onboarding.company.name,"Northwind Marine");assert.equal(await count(),1);
    token=await csrf();assert.equal((await post("http://localhost/api/knowledge","http://localhost",token,JSON.stringify(command))).status,200);
    token=await csrf();assert.equal((await post("http://localhost/api/knowledge","http://localhost",token,JSON.stringify({...command,companyName:"Changed"}))).status,409);assert.equal(await count(),1);
    await assertForbiddenOperationalRowsUnchanged(fixture.database,forbidden);
  }finally{await fixture.dispose();}
});

test("confirmed onboarding answer remains in the interview workspace before fit is complete",async()=>{
  const fixture=await createD1Fixture("generic-onboarding-confirmed-projection");
  try{
    await applyMigrations(fixture.database);
    const knowledge=await fixture.vite.ssrLoadModule(new URL("../domain/knowledge-handler.ts",import.meta.url).pathname);
    const interview=await fixture.vite.ssrLoadModule(new URL("../domain/interview-handler.ts",import.meta.url).pathname);
    const deps={database:fixture.database,subjectPepper:pepper,pilotOwnerEmail:email,getIdentity:identity,enableLocalDemoProgression:true,runtimeIsDevelopment:true};
    const cookie=async(handler)=>(await handler(deps)).headers.get("set-cookie").split(";",1)[0];
    const post=async(handler,intent,body)=>handler(new Request("http://localhost/api/interview",{method:"POST",headers:{origin:"http://localhost",cookie:await cookie(handler===knowledge.handleKnowledgePost?knowledge.handleKnowledgeGet:interview.handleInterviewGet),"sec-fetch-site":"same-origin","content-type":"application/json","x-prospector-intent":intent},body:JSON.stringify(body)}),deps);

    let response=await post(knowledge.handleKnowledgePost,"knowledge-mutation",{action:"initialize_owner_workspace",idempotencyKey:"0198a4b0-0000-7000-8000-000000009601",companyName:"Northstar",productName:"Harbor Pulse"});
    let projection=await response.json();
    response=await post(knowledge.handleKnowledgePost,"knowledge-mutation",{action:"create_onboarding_draft",idempotencyKey:"0198a4b0-0000-7000-8000-000000009602",type:"market_play",parentId:projection.onboarding.product.id,name:"Port Operations",expectedRevision:projection.onboarding.product.revision});
    projection=await response.json();
    response=await post(knowledge.handleKnowledgePost,"knowledge-mutation",{action:"create_onboarding_draft",idempotencyKey:"0198a4b0-0000-7000-8000-000000009603",type:"customer_profile",parentId:projection.onboarding.marketPlay.id,name:"Bulk Terminal Operators",expectedRevision:projection.onboarding.marketPlay.revision});
    projection=await response.json();
    response=await post(knowledge.handleKnowledgePost,"knowledge-mutation",{action:"start_onboarding_interview",idempotencyKey:"0198a4b0-0000-7000-8000-000000009604",expectedQueueDigest:projection.onboarding.interviewQueueDigest});
    projection=await response.json();
    assert.equal(projection.interview.status,"active");

    response=await post(interview.handleInterviewPost,"interview-mutation",{action:"submit_interview_answer",idempotencyKey:"0198a4b0-0000-7000-8000-000000009605",questionId:projection.interview.question.id,expectedRevision:projection.interview.question.revision,answer:"write_correction",value:{excerpt:"Synthetic owner answer"},reason:"Synthetic regression evidence only"});
    let interviewState=await response.json();
    assert.equal(interviewState.status,"awaiting_confirmation");
    response=await post(interview.handleInterviewPost,"interview-mutation",{action:"record_interview_decision",idempotencyKey:"0198a4b0-0000-7000-8000-000000009606",answerId:interviewState.answer.id,expectedSessionRevision:interviewState.session.revision,expectedQuestionRevision:interviewState.question.revision,decision:"accept"});
    interviewState=await response.json();
    assert.equal(interviewState.status,"confirmed");

    const storedSession=await fixture.database.prepare("SELECT state,active_question_id AS activeQuestionId FROM interview_sessions ORDER BY updated_at DESC,id DESC LIMIT 1").first();
    assert.deepEqual(storedSession,{state:"completed",activeQuestionId:null});
    const composer=await fixture.vite.ssrLoadModule(new URL("../domain/interview-question-composer.ts",import.meta.url).pathname);
    const principal=await (await fixture.vite.ssrLoadModule(new URL("../domain/interview.ts",import.meta.url).pathname)).principalFromIdentity(email,"Local Owner",pepper);
    const progression=await composer.readLocalInterviewProgression(fixture.database,principal);
    assert.equal(progression.status,"ready");
    assert.equal(progression.completedSlots,1);

    const current=await knowledge.handleKnowledgeGet(deps);
    assert.equal(current.status,200);
    const currentProjection=await current.json();
    assert.ok(currentProjection.commercial,"confirmed result must not collapse back to Start the fit interview");
    assert.equal(currentProjection.interview.status,"confirmed");
    assert.equal(currentProjection.onboarding.status,"profile_fit_required");
    assert.equal(currentProjection.interview.localProgression.status,"ready");
    const workspace=await fixture.vite.ssrLoadModule(new URL("../app/knowledge/knowledge-workspace.tsx",import.meta.url).pathname);
    assert.doesNotThrow(()=>workspace.normalizeProjection(currentProjection),"the mounted workspace must accept the post-confirmation projection");
  }finally{await fixture.dispose();}
});
