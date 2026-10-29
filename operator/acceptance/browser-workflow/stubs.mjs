// Only the disposable build config imports this generator. No production import.
export const STUB_NAMES = [
  "llm",
  "retrieve",
  "apollo",
  "zoominfo",
  "mailer",
  "inbox",
  "jev",
  "jev-tasks",
];
const prelude = `import { appendFileSync, readFileSync } from 'node:fs';
const log = (name) => appendFileSync(process.env.ACCEPTANCE_EVENTS, JSON.stringify({kind:'stub',name})+'\\n');
const forbidden = (name) => (...args) => { log(name); throw new Error('Forbidden provider adapter: '+name); };
`;
export function stubSource(name) {
  if (name === "llm")
    return (
      prelude +
      `
export async function completeJson(_sql,_user,prompt) {
 if(prompt.includes('"candidates"')) {
  log('hunt');
  const n = readFileSync(process.env.ACCEPTANCE_EVENTS,'utf8').split('\\n').filter(x=>x && JSON.parse(x).name==='hunt').length;
  return JSON.stringify({candidates:[{accountName:'Fictional Quarry',targetName:'Fictional Plant '+n,url:'https://fictionalquarry.example/evidence/'+n}]});
 }
 if(prompt.includes('"proposals"')) {log('discovery'); return JSON.stringify({proposals:[{title:'Fictional Plant Market',problemMatch:'Fictional operating plant recovery',customerType:'Fictional plants',examples:'Fictional Quarry',likelyBuyer:'Fictional Director',risks:'Fictional evidence only',productFit:'Fictional diagnostic',evidence:'Fictional labelled evidence'}]});}
 throw new Error('Unreviewed fictional prompt');
}
export async function explainEvidence(_sql,_user,prompt) {
 if (!prompt.includes('<source>') || !prompt.includes('fictionalquarry.example') && !prompt.includes('Fictional Quarry')) throw new Error('Unreviewed fictional explanation');
 log('explain');
 return JSON.stringify({
  company:{text:'Fictional Quarry operates a processing plant.',quote:'Fictional Quarry operates a mine, mill and processing plant.'},
  situation:{text:'Fictional recovery losses remain under investigation.',quote:'Recovery and throughput losses create downtime constraints.'},
  problem:{text:'The fictional plant has continuing recovery losses.',quote:'Recovery and throughput losses create downtime constraints.'},
  problemStatus:'ongoing', decisionFit:{decision:'Investigate the cause of fictional recovery losses.',dataToCheck:'Historian and lab data, subject to availability.'},
  possibleFit:'If the fictional plant needs help diagnosing losses, its existing records could support a diagnostic.',nextQuestion:'Does the fictional plant still need help finding the cause?'
 });
}
export const resolveLlmConfig = forbidden('resolveLlmConfig');`
    );
  if (name === "retrieve")
    return (
      prelude +
      `
import { createHash } from 'node:crypto';
export function assertPublicHttps(raw) { const u=new URL(raw); if(u.origin!=='https://fictionalquarry.example' || !/^\\/evidence\\/[12]$/.test(u.pathname) || u.search || u.hash || u.username || u.password) throw new Error('Unknown fictional page'); return u; }
export async function retrieveHttps(raw) {
 const u=assertPublicHttps(raw); log('retrieve');
 const n=u.pathname.split('/').pop();
 const text='Fictional evidence only. Fictional Quarry operates a mine, mill and processing plant. Recovery and throughput losses create downtime constraints. Expansion and restart commissioning are a 2026 priority. Historian, SCADA and sensor records support the lab. The owner, director and GM approve a diagnostic budget under NDA. Fictional Person can be reached at person'+n+'@fictionalquarry.example. These invented statements describe no real business.';
 return {url:u.href,title:'Fictional Quarry evidence',text,hash:createHash('sha256').update(text).digest('hex'),retrievedAt:new Date().toISOString(),publishedOn:new Date().toISOString().slice(0,10)};
}`
    );
  const exports = {
    apollo: ["fetchApolloCredits", "searchApolloPeople"],
    zoominfo: ["searchZoomInfoPeople"],
    mailer: ["sendViaGmail"],
    inbox: ["scanGmailInbox"],
    jev: ["jevRequest"],
    "jev-tasks": ["jevGuardCopy", "jevQualifyPage"],
  }[name];
  if (!exports) throw new Error("Unknown stub");
  return prelude + (name === "jev" ? `export const jevFailureMessage = () => "Fictional JEV failure";\n` : "") + exports.map((x) => `export const ${x}=forbidden('${x}');`).join("\n");
}
