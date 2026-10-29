import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { createServer } from "vite";

test("hunt filters unsupported leads and bounds feedback searches", async (t) => {
  const context = { calls: 0, allRejected: false, writes: [] };
  globalThis.__huntEvidenceTest = context;
  const stubs = {
    "/llm": `export async function completeJson(sql, user, prompt, onSearch) { const c=globalThis.__huntEvidenceTest; c.calls++; await onSearch(5); return JSON.stringify({candidates:[{accountName:'Plant '+c.calls,targetName:'Site',url:'https://example.com/'+c.calls,excerpt:'evidence',notes:{}}]}); }`,
    "/retrieve": `export async function retrieveHttps(url) { return {url,title:'Report',text:'Recovery remains below target at this operating plant.',hash:'hash',retrievedAt:new Date().toISOString(),publishedOn:new Date().toISOString().slice(0,10)}; }`,
    "/opportunity": `export async function buildOpportunity(sql,user,account,page) { return {problemStatus: "ongoing",problem: globalThis.__huntEvidenceTest.calls===1 || globalThis.__huntEvidenceTest.allRejected ? null : {text:'Recovery is low',quote:page.text},decisionFit:{decision:'Which blend works?',dataToCheck:'Existing assays if available'},publishedOn:page.publishedOn}; }`,
    "/qualify": `export function qualifyCandidate(input) { return {fingerprint:input.source.url,assessment:{},outcome:'InsufficientEvidence',score:6,evidenceTier:1,evidenceDate:'2026-10-29'}; }`,
    "/secrets": `export async function resolveJev() { return {}; }`,
    "/seed": `export const idFor = (user,value) => user+value;`,
    "/jev-tasks": `export function jevQualifyPage() { throw Error('unused'); }`,
  };
  const server = await createServer({
    configFile: false,
    resolve: { alias: { "@": join(process.cwd(), "src") } },
    server: { middlewareMode: true },
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
    context.writes.push({ query: strings.join("?"), values });
    return [];
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
});
