import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { createServer } from 'vite';

test('model catalog uses saved credentials, handles pagination and never exposes provider errors', async (t) => {
  const server = await createServer({ configFile:false, resolve:{alias:{'@':join(process.cwd(),'src')}}, server:{middlewareMode:true}, appType:'custom' });
  t.after(() => server.close());
  const { fetchModelCatalog, modelOptions } = await server.ssrLoadModule('/src/lib/server/model-catalog.ts');
  const config = {provider:'anthropic', apiKey:'fixture-secret', workspaceId:'wrkspc_fixture', model:'invalid model', baseUrl:'https://untrusted.invalid',search:'none'};
  const requests=[];
  let respond = () => new Response(JSON.stringify({data:[{id:'new',display_name:'New model',created_at:'2026-10-01'},{id:'old',created_at:'2025-01-01'}]}));
  t.mock.method(globalThis,'fetch',async (url,init) => { requests.push({url:String(url),...init}); return respond(url,init); });
  await t.test('Anthropic lists newest first with workspace header and fixed host',async () => {
    const result = await fetchModelCatalog(config);
    assert.deepEqual(result.models.map(m=>m.id),['new','old']);
    assert.equal(result.models[0].name,'New model');
    assert.equal(requests.at(-1).url,'https://api.anthropic.com/v1/models?limit=1000');
    assert.equal(requests.at(-1).headers['anthropic-workspace-id'],'wrkspc_fixture');
    assert.equal(requests.at(-1).redirect,'error');
    assert.equal(JSON.stringify(result).includes(config.apiKey),false);
  });
  await t.test('pagination includes all pages and removes duplicates',async () => {
    respond = (url) => new Response(JSON.stringify(String(url).includes('after_id=first') ? {data:[{id:'first'},{id:'second'}],has_more:false} : {data:[{id:'first'}],has_more:true,last_id:'first'}));
    assert.equal((await fetchModelCatalog(config)).models.length,2);
  });
  await t.test('invalid pagination fails rather than claiming complete',async () => {
    respond = () => new Response(JSON.stringify({data:[{id:'first'}],has_more:true,last_id:'first'}));
    await assert.rejects(fetchModelCatalog(config),/full model list/);
  });
  await t.test('other providers get Bearer auth only',async () => {
    respond=()=>new Response(JSON.stringify({data:[{id:'chat-model',created:100}]}));
    await fetchModelCatalog({...config,provider:'openai'});
    assert.equal(requests.at(-1).url,'https://api.openai.com/v1/models');
    assert.deepEqual(requests.at(-1).headers,{Authorization:'Bearer fixture-secret'});
  });
  await t.test('filters non-chat and retired models, malformed entries, sorts newest first',() => {
    assert.deepEqual(modelOptions({data:[{id:'retired',lifecycle:'retired'},{id:'text-embedding-3'},{id:'tts-1'},{id:3},{id:'image',type:'image'},{id:'no-chat',capabilities:{completion_chat:false}},{id:'chat-old',created:1},{id:'chat-new',created:2},{id:'chat-new',created:2}]}).map(m=>m.id),['chat-new','chat-old']);
    assert.throws(()=>modelOptions({error:'bad'}),/unreadable/);
  });
  await t.test('unsupported providers send no credential',async () => {
    const count=requests.length;
    await assert.rejects(fetchModelCatalog({...config,provider:'custom'}),/Advanced/);
    await assert.rejects(fetchModelCatalog({...config,provider:'perplexity'}),/Advanced/);
    assert.equal(requests.length,count);
  });
  await t.test('errors are actionable and never echo response secrets',async () => {
    for (const [status, pattern] of [[401,/API key/],[403,/API key/],[429,/busy/],[500,/500/]]) {
      respond=()=>new Response(JSON.stringify({error:{message:'fixture-secret'}}),{status});
      await assert.rejects(fetchModelCatalog(config),e=>pattern.test(e.message)&&!e.message.includes('fixture-secret'));
    }
    respond=()=>{throw new Error('fixture-secret');};
    await assert.rejects(fetchModelCatalog(config),/Could not reach/);
    respond=()=>new Response(JSON.stringify({data:[]}));
    await assert.rejects(fetchModelCatalog(config),/No chat models/);
  });
});
