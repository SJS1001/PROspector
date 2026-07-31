import { v7 } from "uuid";
import { persistQualificationAssessment } from "./prospect-review";
import { completeProspectingRun } from "./prospecting-schedule";
import { appendValidatedSignals, type ValidatedSignal } from "./source-policy";

/** The runner can only supply observations.  Candidate facts must be produced by
 * this application-owned seam after source validation, never by the runner body. */
export type CandidateMaterializer = (input: Readonly<{
  workspaceId: string; profileId: string; runId: string; submissionId: string;
  configurationId: string; signals: readonly ValidatedSignal[];
}>) => Promise<readonly CandidateDraft[]> | readonly CandidateDraft[];
export type CandidateDraft = Readonly<{
  targetId: string; accountFit: 0|1|2; painStrength: 0|1|2; timingUrgency: 0|1|2;
  dataReadiness: 0|1|2; commercialViability: 0|1|2;
  requiredEvidence?: readonly string[]; hardDisqualifiers?: readonly string[];
}>;

export class ProspectingIngestionError extends Error { readonly code = "prospecting_ingestion_rejected"; }

/** Production deliberately has no automatic entity matcher yet.  A future
 * matcher must be separately authorized and supplied through this narrow port. */
export function createRejectOnlyCandidateMaterializer(): CandidateMaterializer { return () => []; }

/**
 * Trusted, effect-free completion of an already accepted runner submission.
 * It validates pinned source policy first, materializes only application-owned
 * candidate proposals, calculates assessments, then advances a running run.
 */
export async function processAcceptedRunnerSubmission(
  database: D1Database,
  input: { workspaceId: string; submissionId: string; now: number; materializer?: CandidateMaterializer },
) {
  if (!validId(input.workspaceId) || !validId(input.submissionId) || !Number.isSafeInteger(input.now) || input.now <= 0) throw fail();
  const submission = await database.prepare(
    "SELECT s.id,s.workspace_id,s.run_id,s.configuration_id,s.status,r.profile_id,r.configuration_digest,r.execution_state,w.owner_subject FROM runner_submissions s JOIN prospecting_runs r ON r.id=s.run_id AND r.workspace_id=s.workspace_id JOIN workspaces w ON w.id=s.workspace_id WHERE s.id=? AND s.workspace_id=? LIMIT 1",
  ).bind(input.submissionId, input.workspaceId).first<Submission>();
  if (!submission) throw fail();
  if (submission.execution_state === "succeeded" || submission.status === "processed") return completedProjection(database, submission);
  if (!["assigned", "running"].includes(submission.execution_state)) throw fail();
  const claim = await database.prepare("UPDATE runner_submissions SET status='processing' WHERE id=? AND workspace_id=? AND status='received'").bind(submission.id, input.workspaceId).run();
  if (!claim.meta.changes) {
    const current = await database.prepare("SELECT status FROM runner_submissions WHERE id=? AND workspace_id=? LIMIT 1").bind(submission.id, input.workspaceId).first<{status:string}>();
    if (current?.status === "processing") return Object.freeze({ runId: submission.run_id, submissionId: submission.id, signalCount: 0, candidateIds: Object.freeze([]), assessments: Object.freeze([]), replayed: true, processing: true });
    if (current?.status === "processed") return completedProjection(database, submission);
    throw fail();
  }
  try {
  if (submission.execution_state === "assigned") {
    const started = await database.prepare(
      "UPDATE prospecting_runs SET execution_state='running',updated_at=?,revision=revision+1 WHERE id=? AND workspace_id=? AND execution_state='assigned'",
    ).bind(input.now, submission.run_id, input.workspaceId).run();
    if (!started.meta.changes) {
      const current = await database.prepare("SELECT execution_state FROM prospecting_runs WHERE id=? AND workspace_id=? LIMIT 1").bind(submission.run_id, input.workspaceId).first<{execution_state:string}>();
      if (current?.execution_state !== "running") throw fail();
    }
  }
  const signals = await appendValidatedSignals(database, { workspaceId: input.workspaceId, submissionId: input.submissionId, now: input.now });
  const drafts = normalizeDrafts(await (input.materializer ?? createRejectOnlyCandidateMaterializer())({
    workspaceId: input.workspaceId, profileId: submission.profile_id, runId: submission.run_id,
    submissionId: submission.id, configurationId: submission.configuration_id, signals,
  }));
  const candidateIds: string[] = [];
  for (const draft of drafts) candidateIds.push(await materializeCandidate(database, submission, draft, input.now));
  const assessments = [];
  for (const candidateId of candidateIds) assessments.push(await persistQualificationAssessment(database, { subject: submission.owner_subject }, { candidateId, now: input.now }));
  await completeProspectingRun(database, input.workspaceId, { runId: submission.run_id, successfulWatermark: input.now, now: input.now });
  await database.prepare("UPDATE runner_submissions SET status='processed' WHERE id=? AND workspace_id=? AND status='processing'").bind(submission.id, input.workspaceId).run();
  return Object.freeze({ runId: submission.run_id, submissionId: submission.id, signalCount: signals.length, candidateIds: Object.freeze(candidateIds), assessments: Object.freeze(assessments) });
  } catch (error) {
    await database.prepare("UPDATE runner_submissions SET status='received' WHERE id=? AND workspace_id=? AND status='processing'").bind(submission.id, input.workspaceId).run();
    throw error;
  }
}

async function completedProjection(database:D1Database, submission:Submission) {
  const [signals, candidates, assessments] = await Promise.all([
    database.prepare("SELECT COUNT(*) count FROM prospecting_signals WHERE workspace_id=? AND submission_id=?").bind(submission.workspace_id, submission.id).first<{count:number}>(),
    database.prepare("SELECT id FROM prospecting_candidates WHERE workspace_id=? AND submission_id=? ORDER BY id").bind(submission.workspace_id, submission.id).all<{id:string}>(),
    database.prepare("SELECT a.id,a.outcome,a.score FROM qualification_assessments a JOIN prospecting_candidates c ON c.id=a.candidate_id AND c.workspace_id=a.workspace_id WHERE a.workspace_id=? AND c.submission_id=? ORDER BY a.id").bind(submission.workspace_id, submission.id).all(),
  ]);
  return Object.freeze({ runId:submission.run_id, submissionId:submission.id, signalCount:Number(signals?.count ?? 0), candidateIds:Object.freeze(candidates.results.map(row=>row.id)), assessments:Object.freeze(assessments.results), replayed:true });
}

type Submission = { id:string; workspace_id:string; run_id:string; configuration_id:string; profile_id:string; configuration_digest:string; execution_state:string; owner_subject:string; status:string };
async function materializeCandidate(database:D1Database, submission:Submission, draft:CandidateDraft, now:number) {
  const target = await database.prepare(
    "SELECT t.id,t.account_id,o.id offer_id FROM targets t JOIN accounts a ON a.id=t.account_id AND a.workspace_id=t.workspace_id JOIN typed_configurations c ON c.id=? AND c.workspace_id=t.workspace_id AND c.owner_type='profile' AND c.owner_id=t.profile_id AND c.kind='profile_effective' JOIN offers o ON o.id=json_extract(c.manifest_json,'$.authority.offer.id') AND o.workspace_id=t.workspace_id AND o.profile_id=t.profile_id WHERE t.id=? AND t.workspace_id=? AND t.profile_id=? LIMIT 1",
  ).bind(submission.configuration_id, draft.targetId, submission.workspace_id, submission.profile_id).first<{id:string;account_id:string;offer_id:string}>();
  if (!target) throw fail();
  const candidateValue = { schema:"prospecting-candidate/v1", accountId:target.account_id, targetId:target.id,
    accountFit:draft.accountFit, painStrength:draft.painStrength, timingUrgency:draft.timingUrgency,
    dataReadiness:draft.dataReadiness, commercialViability:draft.commercialViability,
    requiredEvidence:[...(draft.requiredEvidence ?? [])], hardDisqualifiers:[...(draft.hardDisqualifiers ?? [])] };
  const candidateJson=stable(candidateValue), candidateDigest=await sha256(stable({candidateValue,submissionId:submission.id,configurationDigest:submission.configuration_digest}));
  const fingerprint=await sha256(stable({accountId:target.account_id,targetId:target.id,offerId:target.offer_id,configurationDigest:submission.configuration_digest}));
  const existing=await database.prepare("SELECT id FROM prospecting_candidates WHERE workspace_id=? AND profile_id=? AND offer_id=? AND fingerprint=? LIMIT 1").bind(submission.workspace_id,submission.profile_id,target.offer_id,fingerprint).first<{id:string}>();
  if(existing) return existing.id;
  const id=v7();
  try { await database.prepare(
    "INSERT INTO prospecting_candidates (id,workspace_id,created_at,updated_at,revision,profile_id,offer_id,run_id,submission_id,configuration_id,fingerprint,candidate_json,candidate_digest,status) VALUES (?,?,?,?,1,?,?,?,?,?,?,?,?,?,'observed')",
  ).bind(id,submission.workspace_id,now,now,submission.profile_id,target.offer_id,submission.run_id,submission.id,submission.configuration_id,fingerprint,candidateJson,candidateDigest).run(); }
  catch { const winner=await database.prepare("SELECT id FROM prospecting_candidates WHERE workspace_id=? AND profile_id=? AND offer_id=? AND fingerprint=? LIMIT 1").bind(submission.workspace_id,submission.profile_id,target.offer_id,fingerprint).first<{id:string}>(); if(winner)return winner.id; throw fail(); }
  return id;
}
function normalizeDrafts(value:readonly CandidateDraft[]) {
  if (!Array.isArray(value) || value.length > 25) throw fail();
  const output=value.map(d=>{ if(!d||!validId(d.targetId)||![d.accountFit,d.painStrength,d.timingUrgency,d.dataReadiness,d.commercialViability].every(score=>Number.isInteger(score)&&score>=0&&score<=2))throw fail(); const requiredEvidence=boundedArray(d.requiredEvidence??[],160,128),hardDisqualifiers=boundedArray(d.hardDisqualifiers??[],32,128); return {...d,requiredEvidence,hardDisqualifiers}; });
  if(new Set(output.map(d=>d.targetId)).size!==output.length)throw fail(); return output;
}
function boundedArray(values:readonly string[],max:number,width:number){if(!Array.isArray(values)||values.length>max)throw fail();const out=values.map(value=>{if(typeof value!=="string"||!(value=value.normalize("NFC").trim())||value.length>width)throw fail();return value;});if(new Set(out).size!==out.length)throw fail();return out.sort();}
function validId(value:unknown):value is string{return typeof value==="string"&&value.length>0&&value.length<=160;}
function fail():never{throw new ProspectingIngestionError("Prospecting ingestion is unavailable or invalid");}
function stable(value:unknown):string{if(Array.isArray(value))return`[${value.map(stable).join(",")}]`;if(value&&typeof value==="object"){const record=value as Record<string,unknown>;return`{${Object.keys(record).sort().map(key=>`${JSON.stringify(key)}:${stable(record[key])}`).join(",")}}`;}return JSON.stringify(value);}
async function sha256(value:string){const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));return Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,"0")).join("");}
