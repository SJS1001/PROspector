import { v7 } from "uuid";

import type { InterviewPrincipal } from "./interview";
import { createHierarchyDraft } from "./commercial-model";
import { readLocalInterviewProgression } from "./interview-question-composer";

export class OnboardingConflictError extends Error {
  readonly code = "onboarding_conflict";
}

export type OnboardingProjection =
  | { status: "company_product_required"; externalEffects: false }
  | { status: "market_play_required"; externalEffects: false; company: Node; product: Node }
  | { status: "customer_profile_required"; externalEffects: false; company: Node; product: Node; marketPlay: Node }
  | { status: "profile_fit_required"; externalEffects: false; company: Node; product: Node; marketPlay: Node; customerProfile: Node; interviewQueueDigest: string | null }
  | { status: "complete"; externalEffects: false; company: Node; product: Node; marketPlay: Node; customerProfile: Node; fitKnowledgeVersionId: string };

type Node = { id: string; name: string; revision: number };

export async function readOnboardingProjection(database: D1Database, principal: InterviewPrincipal): Promise<OnboardingProjection> {
  const row = await database.prepare(`SELECT w.id AS workspaceId, c.id AS companyId, c.name AS companyName, c.revision AS companyRevision,
      p.id AS productId, p.name AS productName, p.revision AS productRevision,
      mp.id AS playId, mp.name AS playName, mp.revision AS playRevision,
      cp.id AS profileId, cp.name AS profileName, cp.revision AS profileRevision
    FROM workspaces w
    LEFT JOIN workspace_companies wc ON wc.workspace_id=w.id
    LEFT JOIN companies c ON c.id=wc.company_id AND c.workspace_id=w.id
    LEFT JOIN products p ON p.company_id=c.id AND p.workspace_id=w.id
    LEFT JOIN market_plays mp ON mp.product_id=p.id AND mp.workspace_id=w.id
    LEFT JOIN customer_profiles cp ON cp.play_id=mp.id AND cp.workspace_id=w.id
    WHERE w.owner_subject IN (?, ?)
    ORDER BY CASE w.owner_subject WHEN ? THEN 0 ELSE 1 END, p.created_at, p.id, mp.created_at, mp.id, cp.created_at, cp.id LIMIT 1`)
    .bind(principal.subject, principal.legacySubject, principal.subject).first<Record<string, unknown>>();
  if (!row) return { status: "company_product_required", externalEffects: false };
  const company = node(row, "company"); const product = node(row, "product");
  if (!company || !product) throw conflict("Onboarding graph is incomplete");
  const marketPlay = node(row, "play");
  if (!marketPlay) return { status: "market_play_required", externalEffects: false, company, product };
  const customerProfile = node(row, "profile");
  if (!customerProfile) return { status: "customer_profile_required", externalEffects: false, company, product, marketPlay };
  const fit = await database.prepare(`SELECT kv.id FROM knowledge_items ki JOIN knowledge_versions kv
      ON kv.id=ki.current_version_id AND kv.workspace_id=ki.workspace_id
    WHERE ki.workspace_id=? AND kv.scope_type IN ('profile','customer_profile') AND kv.scope_id=?
      AND kv.kind='fit' AND kv.status='confirmed' LIMIT 1`).bind(row.workspaceId, customerProfile.id).first<{id:string}>();
  if (fit) return { status: "complete", externalEffects: false, company, product, marketPlay, customerProfile, fitKnowledgeVersionId: fit.id };
  const live=await database.prepare("SELECT id FROM interview_sessions WHERE workspace_id=? AND state IN ('awaiting_answer','awaiting_confirmation') AND active_question_id IS NOT NULL LIMIT 1").bind(row.workspaceId).first();
  const interviewQueueDigest=live?null:(await readLocalInterviewProgression(database,principal)).queueDigest;
  return { status: "profile_fit_required", externalEffects: false, company, product, marketPlay, customerProfile, interviewQueueDigest };
}

export async function initializeOwnerCompanyProduct(database: D1Database, principal: InterviewPrincipal, input: { companyName: string; productName: string; idempotencyKey: string }) {
  exactKeys(input, ["companyName", "idempotencyKey", "productName"]);
  const companyName = name(input.companyName); const productName = name(input.productName); key(input.idempotencyKey);
  const existingWorkspace = await ownedWorkspace(database, principal);
  if (existingWorkspace) return replayOrConflict(database, principal, existingWorkspace.id, input.idempotencyKey, companyName, productName);
  const workspaceId=v7(), companyId=v7(), productId=v7(), sessionId=v7(), commandId=v7(), auditId=v7(), now=Date.now();
  const digest=await sha256(stable({action:"onboarding.initialize", owner:principal.subject, companyName, productName, idempotencyKey:input.idempotencyKey}));
  try {
    await database.batch([
      database.prepare("INSERT INTO workspaces (id, company_name, owner_subject, created_at, updated_at, revision) VALUES (?, ?, ?, ?, ?, 1)").bind(workspaceId,companyName,principal.subject,now,now),
      database.prepare(`INSERT INTO authority_commands (id,workspace_id,created_at,updated_at,revision,command_type,idempotency_key,operation_digest,expected_revision,subject_type,subject_id,status) VALUES (?,?,?,?,1,'onboarding.initialize',?,?,1,'product',?,'accepted')`).bind(commandId,workspaceId,now,now,input.idempotencyKey,digest,productId),
      database.prepare("INSERT INTO companies (id,workspace_id,created_at,updated_at,revision,name,status) VALUES (?,?,?,?,1,?,'active')").bind(companyId,workspaceId,now,now,companyName),
      database.prepare("INSERT INTO workspace_companies (workspace_id,company_id,created_at) VALUES (?,?,?)").bind(workspaceId,companyId,now),
      database.prepare("INSERT INTO products (id,workspace_id,created_at,updated_at,revision,company_id,name,lifecycle) VALUES (?,?,?,?,1,?,?,'draft')").bind(productId,workspaceId,now,now,companyId,productName),
      database.prepare("INSERT INTO interview_sessions (id,workspace_id,created_at,updated_at,revision,scope_type,scope_id,state,active_question_id,company_id) VALUES (?,?,?,?,1,'company',?,'open',NULL,?)").bind(sessionId,workspaceId,now,now,companyId,companyId),
      database.prepare("INSERT INTO audit_events (id,workspace_id,actor_type,actor_id,action,subject_type,subject_id,detail_json,created_at) VALUES (?,?,'owner',?,'onboarding.initialized','workspace',?,?,?)").bind(auditId,workspaceId,principal.subject,workspaceId,stable({commandId,operationDigest:digest,companyId,productId,sessionId,externalEffects:false}),now),
    ]);
  } catch (error) {
    if (!isConstraint(error)) throw error;
  }
  const winner=await ownedWorkspace(database,principal);
  if (!winner) throw conflict("Onboarding initialization did not converge");
  return replayOrConflict(database,principal,winner.id,input.idempotencyKey,companyName,productName);
}

export async function createOnboardingDraft(database:D1Database, principal:InterviewPrincipal, input:{type:"market_play"|"customer_profile";parentId:string;name:string;expectedRevision:number;idempotencyKey:string}) {
  exactKeys(input,["expectedRevision","idempotencyKey","name","parentId","type"]);
  key(input.idempotencyKey);
  const workspace=await ownedWorkspace(database,principal);
  if(!workspace)throw conflict("Workspace is not initialized");
  const prior=await database.prepare("SELECT command_type FROM authority_commands WHERE workspace_id=? AND idempotency_key=? LIMIT 1").bind(workspace.id,input.idempotencyKey).first<{command_type:string}>();
  if(prior){await createHierarchyDraft(database,principal,{...input,requireFirstChild:true});return readOnboardingProjection(database,principal);}
  const state=await readOnboardingProjection(database,principal);
  const expected=state.status==="market_play_required"?{type:"market_play" as const,parent:state.product}:state.status==="customer_profile_required"?{type:"customer_profile" as const,parent:state.marketPlay}:null;
  if(!expected||input.type!==expected.type||input.parentId!==expected.parent.id||input.expectedRevision!==expected.parent.revision) throw conflict("Onboarding step changed; reload before continuing");
  await createHierarchyDraft(database,principal,{...input,requireFirstChild:true});
  return readOnboardingProjection(database,principal);
}

async function replayOrConflict(database:D1Database, principal:InterviewPrincipal, workspaceId:string, idempotencyKey:string, companyName:string, productName:string) {
  const digest=await sha256(stable({action:"onboarding.initialize", owner:principal.subject, companyName, productName, idempotencyKey}));
  const command=await database.prepare("SELECT subject_id AS productId,operation_digest AS digest FROM authority_commands WHERE workspace_id=? AND idempotency_key=? AND command_type='onboarding.initialize' LIMIT 2").bind(workspaceId,idempotencyKey).all<Record<string,unknown>>();
  if(command.results.length!==1||command.results[0].digest!==digest||typeof command.results[0].productId!=="string")throw conflict("Workspace is already initialized or the idempotency key does not match");
  const row=await database.prepare(`SELECT c.name AS companyName,p.name AS productName FROM workspace_companies wc
    JOIN companies c ON c.id=wc.company_id AND c.workspace_id=wc.workspace_id
    JOIN products p ON p.id=? AND p.company_id=c.id AND p.workspace_id=wc.workspace_id
    WHERE wc.workspace_id=? AND EXISTS (SELECT 1 FROM interview_sessions s WHERE s.workspace_id=wc.workspace_id AND s.company_id=c.id AND s.scope_type='company' AND s.scope_id=c.id) LIMIT 1`).bind(command.results[0].productId,workspaceId).first<Record<string,unknown>>();
  if(!row||row.companyName!==companyName||row.productName!==productName) throw conflict("Workspace is already initialized or the idempotency key does not match");
  return readOnboardingProjection(database,principal);
}

async function ownedWorkspace(database:D1Database, principal:InterviewPrincipal){return database.prepare("SELECT id FROM workspaces WHERE owner_subject IN (?,?) ORDER BY CASE owner_subject WHEN ? THEN 0 ELSE 1 END LIMIT 1").bind(principal.subject,principal.legacySubject,principal.subject).first<{id:string}>();}
function node(row:Record<string,unknown>, prefix:string):Node|null{const id=row[`${prefix}Id`],n=row[`${prefix}Name`],r=Number(row[`${prefix}Revision`]);return typeof id==="string"&&typeof n==="string"&&Number.isInteger(r)?{id,name:n,revision:r}:null;}
function name(value:string){const v=value.trim().replace(/\s+/g," ");if(!v||v.length>160||/[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/u.test(v))throw conflict("Invalid onboarding name");return v;}
function key(value:string){if(!/^[a-f0-9-]{20,80}$/i.test(value))throw conflict("Invalid idempotency key");}
function exactKeys(value:object, expected:string[]){if(JSON.stringify(Object.keys(value).sort())!==JSON.stringify([...expected].sort()))throw conflict("Invalid onboarding command");}
function isConstraint(error:unknown){return error instanceof Error&&/unique|constraint/i.test(error.message);}
function conflict(message:string){return new OnboardingConflictError(message);}
function stable(value:unknown):string{if(Array.isArray(value))return`[${value.map(stable).join(",")}]`;if(value&&typeof value==="object"){const o=value as Record<string,unknown>;return`{${Object.keys(o).sort().map(k=>`${JSON.stringify(k)}:${stable(o[k])}`).join(",")}}`;}return JSON.stringify(value)??"null";}
async function sha256(value:string){const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));return Array.from(new Uint8Array(d),b=>b.toString(16).padStart(2,"0")).join("");}
