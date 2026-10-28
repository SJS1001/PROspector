// Test-only adapter. Exercises actual handler/validator bodies and SQL against
// disposable PGlite; it does NOT prove HTTP, authentication, or startup behavior.
import { registerHooks } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';

const root = fileURLToPath(new URL('../', import.meta.url));
const self = import.meta.url;
export const effects = [];
export let message;
export const fixtureSecrets = new Map();
let pg;
export const sql = Object.assign(async (strings, ...params) => {
  const text = strings.reduce((s, part, i) => s + (i ? `$${i}` : '') + part, '');
  return (await pg.query(text, params)).rows;
}, { query: async (text, params = []) => (await pg.query(text, params)).rows });
export async function getSql() { return sql; }
export function createServerFn() {
  let validate = x => x;
  return {
    middleware() { return this; },
    validator(fn) { validate = fn; return this; },
    handler(fn) {
      return ({ userId = 'fictional-owner', data = {} } = {}) =>
        fn({ context: { userId }, data: validate(data) });
    },
  };
}
export function forbidden(name) {
  return async () => { effects.push(name); throw new Error(`Forbidden provider stub: ${name}`); };
}
export async function getSecret(_sql, _user, name) { return fixtureSecrets.get(name) || ''; }
export async function putSecret() { effects.push('putSecret'); throw new Error('Credential writes are outside this harness'); }
export async function resolveJev() { return { apiKey: '' }; }
export async function connectionFlags() {
  return { llm: false, xai: false, gmail: false, apollo: false, zoominfo: false,
    jev: false, scheduleEnabled: false, monthlyBudgetCents: 0, spendUsedCents: 0 };
}

const stubs = new Map([
  ['@tanstack/react-start', `export { createServerFn } from ${JSON.stringify(self)}`],
  ['@/lib/db', `export { getSql } from ${JSON.stringify(self)}`],
  ['@/lib/auth/middleware', 'export const authMiddleware = {};'],
  ['@/lib/server/secrets', `export { getSecret, putSecret, connectionFlags, resolveJev } from ${JSON.stringify(self)}`],
]);
for (const [module, names] of Object.entries({
  discover: ['executeDiscovery'], hunt: ['executeHunt'],
  apollo: ['fetchApolloCredits', 'searchApolloPeople'], mailer: ['sendViaGmail'],
  inbox: ['scanGmailInbox'], reveal: ['revealFromPages'],
  zoominfo: ['searchZoomInfoPeople'], 'jev-tasks': ['jevGuardCopy'],
})) {
  stubs.set(`@/lib/server/${module}`, `import { forbidden } from ${JSON.stringify(self)};\n` +
    names.map(name => `export const ${name} = forbidden(${JSON.stringify(name)});`).join('\n'));
}
const allowedSource = new Set(['src/lib/server/fns.ts', 'src/lib/server/seed.ts',
  'src/lib/server/profile.ts', 'src/lib/server/toronto.ts', 'src/lib/domain/catalog.ts']);
const hook = registerHooks({
  resolve(specifier, context, next) {
    if (stubs.has(specifier)) return { url: `fixture:${specifier}`, shortCircuit: true };
    if (context.parentURL?.startsWith(pathToFileURL(resolve(root, 'src')).href) &&
        !specifier.startsWith('@/') && specifier !== 'node:crypto') {
      throw new Error(`Unreviewed application dependency: ${specifier}`);
    }
    if (specifier.startsWith('@/')) {
      const path = resolve(root, 'src', `${specifier.slice(2)}.ts`);
      if (!path.startsWith(root) || !allowedSource.has(path.slice(root.length))) {
        throw new Error(`Unreviewed application alias: ${specifier}`);
      }
      return { url: pathToFileURL(path).href, shortCircuit: true };
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.startsWith('fixture:')) return { format: 'module', source: stubs.get(url.slice(8)), shortCircuit: true };
    if (url.startsWith(pathToFileURL(root).href) && url.endsWith('.ts')) {
      const path = fileURLToPath(url);
      const relative = path.slice(root.length);
      if (!allowedSource.has(relative)) throw new Error(`Unreviewed acceptance import: ${relative}`);
      return { format: 'module', shortCircuit: true, source: ts.transpileModule(readFileSync(path, 'utf8'), {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
      }).outputText };
    }
    return next(url, context);
  },
});
const priorFetch = globalThis.fetch;
globalThis.fetch = forbidden('fetch');
export let handlers;
export async function reset() {
  handlers ??= await import('../src/lib/server/fns.ts');
  if (pg) await pg.close();
  pg = new PGlite({ parsers: { 20: Number, 1082: value => value, 1186: value => value } });
  await pg.waitReady;
  for (const file of readdirSync(resolve(root, 'migrations')).filter(x => /^\d+.*\.sql$/.test(x)).sort()) {
    await pg.exec(readFileSync(resolve(root, 'migrations', file), 'utf8'));
  }
  effects.length = 0;
  fixtureSecrets.clear();
  await handlers.getWorkspace();
  await sql`update workspaces set company_name = 'Fictional Quarry', company_legal = 'Fictional Quarry'`;
}
export async function close() {
  if (pg) await pg.close();
  hook.deregister();
  globalThis.fetch = priorFetch;
}
export async function seedEligible() {
  await sql`insert into prospects (id,user_id,account_name,account_id,target_name,target_id,offer_id,score,outcome,state,configuration_digest,assessment_id,assessment_json,evidence_excerpt,evidence_url,evidence_tier,evidence_date)
    values ('p','fictional-owner','Fictional Quarry','a','Fictional Plant','t','o',9,'Passed','approved','cfg','assessment','{"dimensions":[]}','Fictional evidence','https://quarry.example/evidence',1,'2026-10-28')`;
  await sql`insert into contacts (id,user_id,prospect_id,full_name,role,email_kind,email_display,source,confidence)
    values ('c','fictional-owner','p','Fictional Person','champion','public_source','person@quarry.example','https://quarry.example/team','high')`;
  await handlers.preparePackage({ data: { prospectId: 'p' } });
  const [pack] = await sql`select id from outreach_packages where prospect_id = 'p'`;
  await handlers.approvePackage({ data: { packageId: pack.id } });
  await handlers.prepareMessage({ data: { packageId: pack.id, contactId: 'c' } });
  [message] = await sql`select * from outreach_messages where contact_id = 'c'`;
  await handlers.approveMessage({ data: { messageId: message.id, acknowledged: true } });
}
