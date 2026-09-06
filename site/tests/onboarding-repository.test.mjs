import assert from "node:assert/strict";
import test from "node:test";
import { applyMigrations, createD1Fixture } from "./helpers/d1.mjs";

const OWNER={subject:"owner-generic",legacySubject:"legacy-generic",displayName:"Owner"};
const key=n=>`0198a4b0-0000-7000-8000-${String(n).padStart(12,"0")}`;

test("blank onboarding reads are pure and owner input creates exactly one resumable graph",async()=>{
  const fixture=await createD1Fixture("generic-onboarding");
  try{
    await applyMigrations(fixture.database);
    const onboarding=await fixture.vite.ssrLoadModule(new URL("../domain/onboarding.ts",import.meta.url).pathname);
    const commercial=await fixture.vite.ssrLoadModule(new URL("../domain/commercial-model.ts",import.meta.url).pathname);
    const composer=await fixture.vite.ssrLoadModule(new URL("../domain/interview-question-composer.ts",import.meta.url).pathname);
    const interview=await fixture.vite.ssrLoadModule(new URL("../domain/interview.ts",import.meta.url).pathname);
    assert.deepEqual(await onboarding.readOnboardingProjection(fixture.database,OWNER),{status:"company_product_required",externalEffects:false});
    assert.equal((await fixture.database.prepare("SELECT count(*) AS count FROM workspaces").first()).count,0);
    const first=await onboarding.initializeOwnerCompanyProduct(fixture.database,OWNER,{companyName:"Acme Marine",productName:"Fleet ONE",idempotencyKey:key(1)});
    assert.equal(first.status,"market_play_required"); assert.equal(first.company.name,"Acme Marine"); assert.equal(first.product.name,"Fleet ONE");
    assert.deepEqual(await onboarding.initializeOwnerCompanyProduct(fixture.database,OWNER,{companyName:"Acme Marine",productName:"Fleet ONE",idempotencyKey:key(1)}),first);
    await assert.rejects(()=>onboarding.initializeOwnerCompanyProduct(fixture.database,{...OWNER,subject:"control-owner"},{companyName:"Bad\u202ename",productName:"Product",idempotencyKey:key(9)}),/Invalid onboarding name/);
    await assert.rejects(()=>onboarding.initializeOwnerCompanyProduct(fixture.database,OWNER,{companyName:"Other",productName:"Other",idempotencyKey:key(2)}),/already initialized/);
    for(const table of ["workspaces","companies","workspace_companies","products","interview_sessions"]){assert.equal(Number((await fixture.database.prepare(`SELECT count(*) AS count FROM ${table}`).first()).count),1,table);}
    const play=await onboarding.createOnboardingDraft(fixture.database,OWNER,{type:"market_play",parentId:first.product.id,name:"Commercial shipping",expectedRevision:first.product.revision,idempotencyKey:key(3)});
    assert.equal(play.status,"customer_profile_required");
    assert.equal((await onboarding.createOnboardingDraft(fixture.database,OWNER,{type:"market_play",parentId:first.product.id,name:"Commercial shipping",expectedRevision:first.product.revision,idempotencyKey:key(3)})).status,"customer_profile_required");
    await assert.rejects(()=>onboarding.createOnboardingDraft(fixture.database,OWNER,{type:"market_play",parentId:first.product.id,name:"Changed market",expectedRevision:first.product.revision,idempotencyKey:key(3)}),/idempotency|another command/i);
    const profile=await onboarding.createOnboardingDraft(fixture.database,OWNER,{type:"customer_profile",parentId:play.marketPlay.id,name:"Fleet operations leaders",expectedRevision:play.marketPlay.revision,idempotencyKey:key(4)});
    assert.equal(profile.status,"profile_fit_required"); assert.match(profile.interviewQueueDigest,/^[a-f0-9]{64}$/);
    assert.equal((await onboarding.createOnboardingDraft(fixture.database,OWNER,{type:"customer_profile",parentId:play.marketPlay.id,name:"Fleet operations leaders",expectedRevision:play.marketPlay.revision,idempotencyKey:key(4)})).status,"profile_fit_required");
    assert.equal(Number((await fixture.database.prepare("SELECT count(*) AS count FROM market_plays WHERE name LIKE '%Mining%'").first()).count),0);
    for(let index=0;index<4;index++){
      const progress=await onboarding.readOnboardingProjection(fixture.database,OWNER);assert.equal(progress.status,"profile_fit_required");assert.ok(progress.interviewQueueDigest);
      const active=await composer.advanceLocalInterview(fixture.database,OWNER,{expectedQueueDigest:progress.interviewQueueDigest,idempotencyKey:key(30+index*3)});
      const awaiting=await interview.submitInterviewAnswer(fixture.database,OWNER,{questionId:active.question.id,expectedRevision:active.question.revision,answer:"write_correction",value:{excerpt:`Owner confirmed answer ${index}`},reason:"Owner-authored setup answer",idempotencyKey:key(31+index*3)});
      await interview.recordInterviewDecision(fixture.database,OWNER,{answerId:awaiting.answer.id,expectedSessionRevision:awaiting.session.revision,expectedQuestionRevision:awaiting.question.revision,decision:"accept",idempotencyKey:key(32+index*3)});
    }
    const complete=await onboarding.readOnboardingProjection(fixture.database,OWNER);assert.equal(complete.status,"complete");assert.match(complete.fitKnowledgeVersionId,/^[a-f0-9-]{20,80}$/i);
    await commercial.createHierarchyDraft(fixture.database,OWNER,{type:"product",parentId:first.company.id,name:"Second Product",expectedRevision:first.company.revision,idempotencyKey:key(5)});
    assert.equal(Number((await fixture.database.prepare("SELECT count(*) AS count FROM products").first()).count),2);
  }finally{await fixture.dispose();}
});

test("different onboarding keys race to one complete graph without orphans",async()=>{
  const fixture=await createD1Fixture("generic-onboarding-race");
  try{await applyMigrations(fixture.database);const onboarding=await fixture.vite.ssrLoadModule(new URL("../domain/onboarding.ts",import.meta.url).pathname);
    const outcomes=await Promise.allSettled([onboarding.initializeOwnerCompanyProduct(fixture.database,OWNER,{companyName:"Winner A",productName:"Product A",idempotencyKey:key(20)}),onboarding.initializeOwnerCompanyProduct(fixture.database,OWNER,{companyName:"Winner B",productName:"Product B",idempotencyKey:key(21)})]);
    assert.equal(outcomes.filter(item=>item.status==="fulfilled").length,1);
    for(const table of ["workspaces","companies","workspace_companies","products","interview_sessions","authority_commands","audit_events"])assert.equal(Number((await fixture.database.prepare(`SELECT count(*) AS count FROM ${table}`).first()).count),1,table);
    const state=await onboarding.readOnboardingProjection(fixture.database,OWNER);
    const drafts=await Promise.allSettled([onboarding.createOnboardingDraft(fixture.database,OWNER,{type:"market_play",parentId:state.product.id,name:"Market A",expectedRevision:state.product.revision,idempotencyKey:key(22)}),onboarding.createOnboardingDraft(fixture.database,OWNER,{type:"market_play",parentId:state.product.id,name:"Market B",expectedRevision:state.product.revision,idempotencyKey:key(23)})]);
    assert.equal(drafts.filter(item=>item.status==="fulfilled").length,1);
    assert.equal(Number((await fixture.database.prepare("SELECT count(*) AS count FROM market_plays").first()).count),1);
  }finally{await fixture.dispose();}
});
