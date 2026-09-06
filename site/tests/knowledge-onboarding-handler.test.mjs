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
