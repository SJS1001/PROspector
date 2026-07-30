import { v7 } from "uuid";
import { evaluateMiningQualification, type MiningQualification } from "./qualification";

export class ProspectReviewError extends Error { readonly code = "prospect_review_rejected"; }
type Principal = { subject: string; legacySubject?: string };
type Candidate = { id:string; workspace_id:string; profile_id:string; offer_id:string; configuration_id:string; candidate_json:string; candidate_digest:string; fingerprint:string };

/** Builds an assessment exclusively from the persisted candidate, pinned configuration,
 * and application-validated signals.  Runner scores and outcomes are deliberately absent. */
export async function persistQualificationAssessment(database:D1Database, principal:Principal, input:{candidateId:string; now?:number}) {
  const workspace=await workspaceFor(database,principal);
  const candidate=await database.prepare("SELECT id,workspace_id,profile_id,offer_id,configuration_id,candidate_json,candidate_digest,fingerprint FROM prospecting_candidates WHERE id=? AND workspace_id=? LIMIT 1").bind(input.candidateId,workspace.id).first<Candidate>();
  if(!candidate) throw fail("Candidate is unavailable");
  const configuration=await database.prepare("SELECT id,digest,manifest_json FROM typed_configurations WHERE id=? AND workspace_id=? AND owner_type='profile' AND owner_id=? AND kind='profile_effective' LIMIT 1").bind(candidate.configuration_id,workspace.id,candidate.profile_id).first<{id:string;digest:string;manifest_json:string}>();
  if(!configuration) throw fail("Pinned Profile configuration is unavailable");
  const candidateValue=safeJson(candidate.candidate_json);
  const signalRows=await database.prepare("SELECT ps.id,ps.material,pl.source_tier,pl.independence_group,pl.retrieved_at,ps.signal_json FROM prospecting_signals ps JOIN prospecting_source_lineage pl ON pl.id=ps.source_lineage_id AND pl.workspace_id=ps.workspace_id WHERE ps.workspace_id=? AND ps.profile_id=? ORDER BY ps.id").bind(workspace.id,candidate.profile_id).all<{id:string;material:number;source_tier:number;independence_group:string;retrieved_at:number;signal_json:string}>();
  const assessmentInput={
    configurationDigest:configuration.digest, rubricDigest:rubricDigest(configuration.manifest_json), evaluationVersion:"mining-rubric/v1",
    candidateId:candidate.id, accountId:text(candidateValue.accountId), targetId:text(candidateValue.targetId), offerId:candidate.offer_id,
    accountFit:number(candidateValue.accountFit), painStrength:number(candidateValue.painStrength), timingUrgency:number(candidateValue.timingUrgency), dataReadiness:number(candidateValue.dataReadiness), commercialViability:number(candidateValue.commercialViability),
    requiredEvidence:Array.isArray(candidateValue.requiredEvidence)?candidateValue.requiredEvidence:[], hardDisqualifiers:Array.isArray(candidateValue.hardDisqualifiers)?candidateValue.hardDisqualifiers:[],
    sources:signalRows.results.map((row)=>({id:row.id,tier:row.source_tier,independenceGroup:row.independence_group,retrievedAt:row.retrieved_at,recency:recency(row.signal_json),material:Boolean(row.material)})),
  };
  const duplicate=await database.prepare("SELECT id FROM profile_prospects WHERE workspace_id=? AND fingerprint=? AND active=1 LIMIT 1").bind(workspace.id,candidate.fingerprint).first<{id:string}>();
  if(duplicate) assessmentInput.hardDisqualifiers=[...assessmentInput.hardDisqualifiers,"duplicate_active_prospect"];
  const evaluation=evaluateMiningQualification(assessmentInput); const now=input.now??Date.now();
  const inputJson=stable(assessmentInput), evidenceJson=stable(evaluation.citedSources), gateJson=stable(evaluation.gateChecks), anchorJson=stable(evaluation.anchors), scoreJson=stable({score:evaluation.score,outcome:evaluation.outcome,sortInputs:evaluation.sortInputs});
  const inputDigest=await sha256(inputJson), assessmentDigest=await sha256(stable({configurationDigest:configuration.digest,inputDigest,anchors:evaluation.anchors,evidence:evaluation.citedSources,gates:evaluation.gateChecks,score:evaluation.score,outcome:evaluation.outcome,tieOrder:evaluation.tieOrder}));
  const existing=await database.prepare("SELECT id FROM qualification_assessments WHERE workspace_id=? AND assessment_digest=? LIMIT 1").bind(workspace.id,assessmentDigest).first<{id:string}>();
  if(existing) return assessmentProjection(existing.id,evaluation,duplicate?.id);
  const assessmentId=v7(), commandId=v7(), auditId=v7(), prospectId=v7();
  try { await database.batch([
    database.prepare("INSERT INTO qualification_assessments (id,workspace_id,candidate_id,configuration_id,configuration_digest,input_json,input_digest,anchor_json,evidence_json,gate_json,score_json,score,outcome,tie_order,assessment_digest,predecessor_assessment_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(assessmentId,workspace.id,candidate.id,configuration.id,configuration.digest,inputJson,inputDigest,anchorJson,evidenceJson,gateJson,scoreJson,evaluation.score,evaluation.outcome,stable(evaluation.tieOrder),assessmentDigest,null,now),
    database.prepare("INSERT INTO authority_commands (id,workspace_id,created_at,updated_at,revision,command_type,idempotency_key,operation_digest,expected_revision,subject_type,subject_id,status) VALUES (?,?,?,?,1,'prospect.assessment',?,?,1,'prospecting_candidate',?,'accepted')").bind(commandId,workspace.id,now,now,`assessment:${assessmentDigest}`,assessmentDigest,candidate.id),
    database.prepare("INSERT INTO audit_events (id,workspace_id,actor_type,actor_id,action,subject_type,subject_id,detail_json,created_at) VALUES (?,?,'system','prospect-assessment-service','prospect.assessed','qualification_assessment',?,?,?)").bind(auditId,workspace.id,assessmentId,stable({assessmentDigest,configurationDigest:configuration.digest,evidenceIds:evaluation.citedSources.map(x=>x.id)}),now),
    database.prepare("INSERT INTO profile_prospects (id,workspace_id,created_at,updated_at,revision,profile_id,offer_id,candidate_id,assessment_id,fingerprint,state,active) SELECT ?,?,?,?,?,?,?,?,?,?,'qualified',1 WHERE ?='Passed' AND NOT EXISTS (SELECT 1 FROM profile_prospects WHERE workspace_id=? AND fingerprint=? AND active=1)").bind(prospectId,workspace.id,now,now,candidate.profile_id,candidate.offer_id,candidate.id,assessmentId,candidate.fingerprint,evaluation.outcome,workspace.id,candidate.fingerprint),
  ]); } catch { const winner=await database.prepare("SELECT id FROM qualification_assessments WHERE workspace_id=? AND assessment_digest=? LIMIT 1").bind(workspace.id,assessmentDigest).first<{id:string}>(); if(!winner) throw fail("Assessment conflict"); return assessmentProjection(winner.id,evaluation,duplicate?.id); }
  const prospect=await database.prepare("SELECT id FROM profile_prospects WHERE assessment_id=? LIMIT 1").bind(assessmentId).first<{id:string}>();
  return assessmentProjection(assessmentId,evaluation,prospect?.id);
}

export async function decideQualifiedProspect(database:D1Database, principal:Principal, input:{prospectId:string; assessmentId?:string; decision:"approve"|"reject"|"defer"; reason?:string; reviewAt?:number; expectedRevision:number; idempotencyKey:string; now?:number}) {
  const reason=input.reason?.normalize("NFC").trim(); const now=input.now??Date.now();
  if(!reason||reason.length>2000) throw fail("A review reason is required");
  if(input.decision==="defer"&&(!Number.isSafeInteger(input.reviewAt)||input.reviewAt<=now)) throw fail("A reasoned deferred review date is required");
  if(!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<1||!validKey(input.idempotencyKey)) throw fail("Invalid review command");
  const workspace=await workspaceFor(database,principal);
  const prospect=await database.prepare("SELECT p.id,p.workspace_id,p.assessment_id,p.revision,p.state,p.active,a.outcome FROM profile_prospects p JOIN qualification_assessments a ON a.id=p.assessment_id AND a.workspace_id=p.workspace_id WHERE p.id=? AND p.workspace_id=? LIMIT 1").bind(input.prospectId,workspace.id).first<{id:string;workspace_id:string;assessment_id:string;revision:number;state:string;active:number;outcome:string}>();
  if(!prospect||prospect.state!=="qualified"||!prospect.active||prospect.outcome!=="Passed"||input.assessmentId!==undefined&&input.assessmentId!==prospect.assessment_id||prospect.revision!==input.expectedRevision) throw fail("Qualified Prospect is unavailable or stale");
  const operation=await sha256(stable({action:"prospect.review",prospectId:prospect.id,assessmentId:prospect.assessment_id,decision:input.decision,reason,reviewAt:input.reviewAt??null,revision:prospect.revision}));
  const prior=await database.prepare("SELECT id,operation_digest FROM prospect_review_decisions WHERE workspace_id=? AND idempotency_key=? LIMIT 1").bind(workspace.id,input.idempotencyKey).first<{id:string;operation_digest:string}>();
  if(prior){if(prior.operation_digest!==operation)throw fail("Idempotency key conflicts with a different review command");return{decisionId:prior.id,replayed:true};}
  const state=input.decision==="approve"?"approved":input.decision==="reject"?"rejected":"deferred", decisionId=v7(),commandId=v7(),auditId=v7();
  try { const writes=[
    database.prepare("INSERT INTO authority_commands (id,workspace_id,created_at,updated_at,revision,command_type,idempotency_key,operation_digest,expected_revision,subject_type,subject_id,status) SELECT ?,?,?,?,1,'prospect.review',?,?,?,'profile_prospect',?,'accepted' WHERE EXISTS (SELECT 1 FROM profile_prospects WHERE id=? AND workspace_id=? AND state='qualified' AND active=1 AND revision=? AND assessment_id=?)").bind(commandId,workspace.id,now,now,input.idempotencyKey,operation,prospect.revision,prospect.id,prospect.id,workspace.id,prospect.revision,prospect.assessment_id),
    database.prepare("INSERT INTO audit_events (id,workspace_id,actor_type,actor_id,action,subject_type,subject_id,detail_json,created_at) SELECT ?,?,'owner',?,?,'profile_prospect',?,?,? WHERE EXISTS (SELECT 1 FROM authority_commands WHERE id=? AND workspace_id=?)").bind(auditId,workspace.id,principal.subject,`prospect.review.${input.decision}`,prospect.id,stable({assessmentId:prospect.assessment_id,operation}),now,commandId,workspace.id),
    database.prepare("INSERT INTO prospect_review_decisions (id,workspace_id,prospect_id,assessment_id,decision,reason,review_at,expected_prospect_revision,authority_command_id,audit_event_id,decision_digest,operation_digest,idempotency_key,created_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM authority_commands WHERE id=? AND workspace_id=?)").bind(decisionId,workspace.id,prospect.id,prospect.assessment_id,input.decision,reason,input.reviewAt??null,prospect.revision,commandId,auditId,operation,operation,input.idempotencyKey,now,commandId,workspace.id),
    database.prepare("UPDATE profile_prospects SET state=?,active=CASE WHEN ?='approve' THEN active ELSE 0 END,updated_at=?,revision=revision+1 WHERE id=? AND workspace_id=? AND revision=? AND state='qualified' AND EXISTS (SELECT 1 FROM prospect_review_decisions WHERE id=? AND authority_command_id=?)").bind(state,input.decision,now,prospect.id,workspace.id,prospect.revision,decisionId,commandId),
  ]; if(input.decision!=="approve")writes.push(database.prepare("INSERT INTO prospect_cooldowns (id,workspace_id,prospect_id,review_decision_id,assessment_id,reason,starts_at,ends_at,status,created_at) SELECT ?,?,?,?,?,?,?,?,'active',? WHERE EXISTS (SELECT 1 FROM prospect_review_decisions WHERE id=? AND workspace_id=?)").bind(v7(),workspace.id,prospect.id,decisionId,prospect.assessment_id,reason,now,input.decision==="reject"?now+90*86400000:input.reviewAt!,now,decisionId,workspace.id));
    const result=await database.batch(writes); if(!result[0]?.meta?.changes)throw fail("Qualified Prospect is unavailable or stale");
  } catch(error) { if(error instanceof ProspectReviewError)throw error; const winner=await database.prepare("SELECT id,operation_digest FROM prospect_review_decisions WHERE workspace_id=? AND idempotency_key=? LIMIT 1").bind(workspace.id,input.idempotencyKey).first<{id:string;operation_digest:string}>(); if(winner&&winner.operation_digest===operation)return{decisionId:winner.id,replayed:true}; throw fail("Review conflict"); }
  return {decisionId,replayed:false,state};
}

export async function readProspectingProjection(database:D1Database, principal:Principal) {
 const workspace=await workspaceFor(database,principal);
 const [profiles,runs,evidence,assessments,queue]=await Promise.all([
  database.prepare("SELECT id,name,lifecycle,revision FROM customer_profiles WHERE workspace_id=? ORDER BY name,id").bind(workspace.id).all(),
  database.prepare("SELECT id,profile_id,configuration_digest,trigger_kind,execution_state,window_lower_exclusive,window_upper_inclusive,started_at,completed_at FROM prospecting_runs WHERE workspace_id=? ORDER BY started_at DESC,id DESC").bind(workspace.id).all(),
  database.prepare("SELECT ps.id,ps.profile_id,ps.signal_kind,ps.material,ps.created_at,pl.source_url,pl.source_tier,pl.publisher_identity,pl.underlying_origin_identity,pl.independence_group,pl.retrieved_at,pl.excerpt,pl.run_id,pl.submission_id FROM prospecting_signals ps JOIN prospecting_source_lineage pl ON pl.id=ps.source_lineage_id WHERE ps.workspace_id=? ORDER BY ps.created_at DESC,ps.id DESC").bind(workspace.id).all(),
  database.prepare("SELECT id,candidate_id,configuration_digest,score,outcome,anchor_json,evidence_json,gate_json,tie_order,assessment_digest,created_at FROM qualification_assessments WHERE workspace_id=? ORDER BY created_at DESC,id DESC").bind(workspace.id).all(),
  database.prepare("SELECT p.id,p.profile_id,p.offer_id,p.candidate_id,p.assessment_id,p.revision,p.state,a.score,a.outcome,a.configuration_digest,a.assessment_digest,d.decision,d.reason,d.review_at,d.created_at decision_at,d.audit_event_id FROM profile_prospects p JOIN qualification_assessments a ON a.id=p.assessment_id LEFT JOIN prospect_review_decisions d ON d.prospect_id=p.id WHERE p.workspace_id=? ORDER BY p.created_at DESC,d.created_at DESC").bind(workspace.id).all(),
 ]);
 return {profiles:profiles.results,runs:runs.results,evidence:evidence.results,assessments:assessments.results,queue:queue.results.filter((x)=>x.state==="qualified"&&x.outcome==="Passed"),readiness:null};
}
async function workspaceFor(database:D1Database,principal:Principal){const w=await database.prepare("SELECT id FROM workspaces WHERE owner_subject IN (?,?) ORDER BY CASE owner_subject WHEN ? THEN 0 ELSE 1 END LIMIT 1").bind(principal.subject,principal.legacySubject??principal.subject,principal.subject).first<{id:string}>();if(!w)throw fail("Private workspace unavailable");return w;}
function assessmentProjection(id:string,evaluation:MiningQualification,prospectId?:string){return{id,evaluation,prospectId:prospectId??null,queueState:evaluation.outcome==="Passed"&&prospectId?"qualified":"absent"};}
function safeJson(s:string){try{const x=JSON.parse(s);return x&&typeof x==="object"&&!Array.isArray(x)?x as Record<string,unknown>:{};}catch{return {};}}
function rubricDigest(manifest:string){const parsed=safeJson(manifest);return typeof parsed.rubricDigest==="string"&&/^[a-f0-9]{64}$/.test(parsed.rubricDigest)?parsed.rubricDigest:"0".repeat(64);}
function recency(signal:string){return safeJson(signal).recency==="account_context_reconfirmation_required"?"account_context_reconfirmation_required":"current";}
function text(x:unknown){return typeof x==="string"?x:"";} function number(x:unknown){return Number.isInteger(x)?x:0;} function validKey(x:string){return typeof x==="string"&&x.length>0&&x.length<=160;}
function stable(v:unknown):string{if(Array.isArray(v))return`[${v.map(stable).join(",")}]`;if(v&&typeof v==="object"){const x=v as Record<string,unknown>;return`{${Object.keys(x).sort().map(k=>`${JSON.stringify(k)}:${stable(x[k])}`).join(",")}}`;}return JSON.stringify(v);}
async function sha256(v:string){const data=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v));return Array.from(new Uint8Array(data),x=>x.toString(16).padStart(2,"0")).join("");}
function fail(message:string){return new ProspectReviewError(message);}
