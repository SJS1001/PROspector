// Test-only preload: never imported by production. No auth or DB replacement.
import { registerHooks, syncBuiltinESMExports } from "node:module";
import { appendFileSync } from "node:fs";
import net from "node:net";
import tls from "node:tls";
import dgram from "node:dgram";
import ts from "typescript";
const record = (name) =>
  appendFileSync(process.env.DURABLE_EFFECT_LOG, name + "\n", { mode: 0o600 });
globalThis.__durableRecord = record;
const deny = () => {
  record("DENIED_NETWORK");
  throw new Error("Durable acceptance denies outbound network");
};
net.Socket.prototype.connect = deny;
tls.connect = deny;
dgram.createSocket = deny;
globalThis.fetch = deny;
syncBuiltinESMExports();
const bodies = {
  executeDiscovery: `
    globalThis.__durableRecord('discovery');
    if (await getSecret(opts.sql, opts.userId, 'llm_key') !== 'FICTIONAL-DURABLE-KEY') throw new Error('Fictional vault continuity failed');
    await opts.sql.query("insert into market_proposals (id,user_id,title,problem_match,customer_type,examples,likely_buyer,risks,product_fit,evidence,decision) values ('fictional-proposal',$1,'Fictional Quarry','Fictional problem','Fictional customer','Fictional Plant','Fictional Person','Fictional risk','Fictional fit','Fictional evidence','open')", [opts.userId]);
    await opts.sql.query("update discovery_runs set status='succeeded',proposal_count=1,finished_at=now() where id=$1",[opts.runId]);`,
  executeHunt: `
    globalThis.__durableRecord('hunt');
    if (await getSecret(opts.sql, opts.userId, 'llm_key') !== 'FICTIONAL-DURABLE-KEY') throw new Error('Fictional vault continuity failed');
    await opts.sql.query("insert into prospects (id,user_id,account_name,account_id,target_name,target_id,offer_id,score,outcome,state,configuration_digest,assessment_id,assessment_json,evidence_excerpt,evidence_url,evidence_tier,evidence_date) values ('fictional-prospect',$1,'Fictional Quarry','fictional-account','Fictional Plant','fictional-target','fictional-offer',9,'Passed','qualified',$2,'fictional-assessment','{}','Fictional evidence','https://quarry.example/evidence',1,'2026-10-28')",[opts.userId,opts.digest]);
    await opts.sql.query("update prospecting_runs set status='succeeded',finished_at=now() where id=$1",[opts.runId]);`,
  revealFromPages: `globalThis.__durableRecord('reveal'); return [{email:'person@quarry.example',url:'https://quarry.example/evidence',excerpt:'Fictional evidence'}];`,
};
registerHooks({
  load(url, context, nextLoad) {
    const result = nextLoad(url, context);
    if (!/\/_ssr\/fns-[^/]+\.mjs$/.test(url)) return result;
    let source = String(result.source);
    const ast = ts.createSourceFile(url, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    const edits = [];
    for (const node of ast.statements) {
      if (ts.isFunctionDeclaration(node) && bodies[node.name?.text]) {
        edits.push({
          start: node.body.getStart(ast),
          end: node.body.end,
          text: "{" + bodies[node.name.text] + "}",
        });
      }
    }
    if (edits.length !== 3)
      throw new Error("Provider instrumentation drift: expected exactly three adapters");
    for (const edit of edits.sort((a, b) => b.start - a.start))
      source = source.slice(0, edit.start) + edit.text + source.slice(edit.end);
    return { ...result, source };
  },
});
