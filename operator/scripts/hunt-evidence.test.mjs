import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { createServer } from "vite";

test("hunt filters unsupported leads and bounds feedback searches", async (t) => {
  const context = { calls: 0, allRejected: false, jev: "off", writes: [] };
  globalThis.__huntEvidenceTest = context;
  const stubs = {
    "/llm": `export async function completeJson(sql, user, prompt, onSearch) { const c=globalThis.__huntEvidenceTest; c.calls++; await onSearch(5); return JSON.stringify({candidates:[{accountName:'Plant '+c.calls,targetName:'Site',url:'https://example.com/'+c.calls,excerpt:'evidence',notes:{}}]}); }`,
    "/retrieve": `export async function retrieveHttps(url) { return {url,title:'Report',text:'Recovery remains below target at this operating plant.',hash:'hash',retrievedAt:new Date().toISOString(),publishedOn:new Date().toISOString().slice(0,10)}; }`,
    "/opportunity": `export async function buildOpportunity(sql,user,account,page) { return {problemStatus: "ongoing",problem: globalThis.__huntEvidenceTest.calls===1 || globalThis.__huntEvidenceTest.allRejected ? null : {text:'Recovery is low',quote:page.text},decisionFit:{decision:'Which blend works?',dataToCheck:'Existing assays if available'},publishedOn:page.publishedOn}; }`,
    "/qualify": `export function qualifyCandidate(input) { return {fingerprint:input.source.url,assessment:{dimensions:[{id:"pain_strength",score:1}]},outcome:'InsufficientEvidence',evidenceExcerpt:'evidence',score:6,evidenceTier:1,evidenceDate:'2026-10-29'}; }`,
    "/secrets": `export async function resolveJev() { return {apiKey:globalThis.__huntEvidenceTest.jev === "off" ? "" : "test"}; }`,
    "/seed": `export const idFor = (user,value) => user+value;`,
    "/jev-tasks": `export function jevQualifyPage() { if (globalThis.__huntEvidenceTest.jev === "fail") throw Error("secret upstream details"); return {model:"jev-test",scores:{pain_strength:{score:2,confidence:0.9}},outcome:"NotQualified",outcomeConfidence:0.9,hardNo:0,operating:1,stuffed:0}; }`,
  };
  const server = await createServer({
    configFile: false,
    optimizeDeps: { noDiscovery: true, include: [] },
    resolve: { alias: { "@": join(process.cwd(), "src") } },
    server: { middlewareMode: true, hmr: false },
    appType: "custom",
    plugins: [
      {
        name: "hunt-test-dependencies",
        enforce: "pre",
        resolveId(id) {
          const suffix = Object.keys(stubs).find((s) => id.endsWith(s));
          if (suffix) return "\0hunt-test" + suffix;
        },
        load(id) {
          if (id.startsWith("\0hunt-test")) return stubs[id.slice("\0hunt-test".length)];
        },
      },
    ],
  });
  t.after(async () => {
    await server.close();
    delete globalThis.__huntEvidenceTest;
  });
  const { executeHunt } = await server.ssrLoadModule("/src/lib/server/hunt.ts");
  const sql = async (strings, ...values) => {
    const query = strings.join("?");
    context.writes.push({ query, values });
    // The stub database has no rows yet, so every prospect insert succeeds.
    return query.includes("insert into prospects") ? [{ id: values[0] }] : [];
  };
  sql.transaction = async (work) => work(sql);
  const snapshot = {
    company: "Seller",
    product: "ONE",
    promise: "Diagnose",
    play: "Mining",
    fit: "Plants",
    offerId: "diagnostic",
  };
  await executeHunt({
    sql,
    userId: "owner",
    runId: "run",
    digest: "digest",
    snapshot,
    knownFingerprints: new Set(),
  });
  assert.equal(context.calls, 2);
  const saved = context.writes.filter((w) => w.query.includes("insert into prospects"));
  assert.equal(saved.length, 1);
  assert.ok(saved[0].values.includes("Plant 2"));
  const last = context.writes.at(-1);
  assert.equal(last.values[0], "succeeded");
  assert.equal(JSON.parse(last.values[1]).searches, 10);
  assert.equal(JSON.parse(last.values[1]).jev.configured, false);
  for (const mode of ["on", "fail"]) {
    context.calls = 0;
    context.writes = [];
    context.jev = mode;
    await executeHunt({
      sql,
      userId: "owner",
      runId: mode,
      digest: "digest",
      snapshot,
      knownFingerprints: new Set(),
    });
    const intermediate = context.writes.filter((w) => w.query.includes("set progress_json"));
    assert.ok(intermediate.length > 0);
    for (const write of intermediate) assert.equal(JSON.parse(write.values[0]).jev.savedWithJev, 0);
    const j = JSON.parse(context.writes.at(-1).values[1]).jev;
    assert.equal(j.attempted, 2);
    assert.equal(j.reviewed, mode === "on" ? 2 : 0);
    assert.equal(j.applied, mode === "on" ? 2 : 0);
    assert.equal(j.changed, mode === "on" ? 2 : 0);
    assert.equal(j.savedWithJev, mode === "on" ? 1 : 0);
    assert.equal(j.failed, mode === "fail" ? 2 : 0);
    assert.equal(JSON.parse(context.writes.at(-1).values[1]).saved, 1);
    assert.doesNotMatch(JSON.stringify(j), /secret upstream/);
  }
  context.jev = "off";
  context.calls = 0;
  context.writes = [];
  context.allRejected = true;
  await executeHunt({
    sql,
    userId: "owner",
    runId: "empty",
    digest: "digest",
    snapshot,
    knownFingerprints: new Set(),
  });
  assert.equal(context.calls, 2);
  assert.equal(context.writes.filter((w) => w.query.includes("insert into prospects")).length, 0);
  assert.equal(context.writes.at(-1).values[0], "succeeded");
  assert.equal(JSON.parse(context.writes.at(-1).values[1]).saved, 0);

  // A commit that re-inserts an existing prospect id (an overlapping or repeated
  // run) must not fail the whole run on the primary key and lose its results.
  const pg = new PGlite();
  t.after(() => pg.close());
  for (const n of readdirSync(join(process.cwd(), "migrations"))
    .filter((n) => n.endsWith(".sql"))
    .sort())
    await pg.exec(readFileSync(join(process.cwd(), "migrations", n), "utf8"));
  const pgSql = (runner) => {
    const query = async (text, params = []) => (await runner.query(text, params)).rows;
    const tagged = async (parts, ...values) => {
      let text = parts[0];
      for (let i = 0; i < values.length; i++) text += `$${i + 1}${parts[i + 1]}`;
      return query(text, values);
    };
    tagged.query = query;
    tagged.transaction = (work) => runner.transaction((tx) => work(pgSql(tx)));
    return tagged;
  };
  const db = pgSql(pg);
  const existingId = "ownerhunt:https://example.com/2";
  await pg.query(
    "insert into prospects(id,user_id,account_name,account_id,target_name,target_id,offer_id,score,outcome,state,configuration_digest,assessment_id,assessment_json,evidence_excerpt,evidence_url,evidence_tier,evidence_date) values ($1,'owner','Earlier Plant','account','Target','target','offer',7,'Passed','approved','config','assessment','{}','Earlier evidence','https://example.com/2',1,'2026-10-28')",
    [existingId],
  );
  await pg.exec(
    "insert into prospecting_runs (id,user_id,configuration_digest,trigger,status) values ('dup','owner','digest','manual','running')",
  );
  context.allRejected = false;
  for (let attempt = 0; attempt < 2; attempt++) {
    context.calls = 0;
    context.writes = [];
    await pg.exec("update prospecting_runs set status = 'running' where id = 'dup'");
    await executeHunt({
      sql: db,
      userId: "owner",
      runId: "dup",
      digest: "digest",
      snapshot,
      knownFingerprints: new Set(),
    });
  }
  const [run] = (
    await pg.query(
      "select status, candidate_count, qualified_count, progress_json, terminal_reason from prospecting_runs where id = 'dup'",
    )
  ).rows;
  assert.equal(run.status, "succeeded");
  // The only accepted result was already saved, so nothing new was saved and
  // the run must not claim one.
  const progress = JSON.parse(run.progress_json);
  assert.equal(progress.saved, 0);
  assert.equal(progress.activity.at(-1), "0 results saved");
  assert.equal(run.candidate_count, 0);
  assert.equal(run.qualified_count, 0);
  assert.match(run.terminal_reason, /Plant 2: already in this workspace\./);
  const [kept] = (
    await pg.query("select account_name, state from prospects where id = $1", [existingId])
  ).rows;
  assert.deepEqual(kept, { account_name: "Earlier Plant", state: "approved" });
  assert.equal((await pg.query("select id from signals where run_id = 'dup'")).rows.length, 1);
  // A new prospect in the same commit is counted once it is actually inserted.
  await pg.exec(
    "insert into prospecting_runs (id,user_id,configuration_digest,trigger,status) values ('fresh','owner','digest','manual','running')",
  );
  await pg.query("delete from prospects where id = $1", [existingId]);
  context.calls = 0;
  await executeHunt({
    sql: db,
    userId: "owner",
    runId: "fresh",
    digest: "digest",
    snapshot,
    knownFingerprints: new Set(),
  });
  const [fresh] = (
    await pg.query("select candidate_count, progress_json from prospecting_runs where id = 'fresh'")
  ).rows;
  assert.equal(JSON.parse(fresh.progress_json).saved, 1);
  assert.equal(JSON.parse(fresh.progress_json).activity.at(-1), "1 results saved");
  assert.equal(fresh.candidate_count, 1);
});
