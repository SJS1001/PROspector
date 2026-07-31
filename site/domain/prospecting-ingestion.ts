import { v7 } from "uuid";
import { persistQualificationAssessment } from "./prospect-review";
import { completeProspectingRun } from "./prospecting-schedule";
import { appendSourcedDisproofValidationMarker, appendValidatedSignals, type SourcedDisproofSelection, type ValidatedSignal } from "./source-policy";

const INGESTION_LEASE_MS = 60_000;

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
  /** Trusted materializer output, never accepted from the runner payload. */
  sourcedDisproof?: SourcedDisproofSelection;
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
    "SELECT s.id,s.workspace_id,s.run_id,s.configuration_id,s.submission_json,s.submission_digest,s.operation_digest,r.profile_id,r.configuration_digest,r.execution_state,r.successful_watermark,r.window_upper_inclusive,w.owner_subject FROM runner_submissions s JOIN prospecting_runs r ON r.id=s.run_id AND r.workspace_id=s.workspace_id JOIN workspaces w ON w.id=s.workspace_id WHERE s.id=? AND s.workspace_id=? LIMIT 1",
  ).bind(input.submissionId, input.workspaceId).first<Submission>();
  if (!submission) throw fail();
  const payloadStatus = canonicalPayloadStatus(submission.submission_json);
  if (payloadStatus !== "complete" && payloadStatus !== "partial") {
    await appendTerminalEvent(database, submission, 0, input.now, "validation_rejected", false);
    throw fail();
  }
  const priorLedger=await readLedger(database,submission);
  if(payloadStatus==="partial"&&priorLedger.terminals.some(event=>event.terminalReason==="partial_submission_retryable")){
    return partialProjection(database,submission,true);
  }
  if(payloadStatus==="partial"&&submission.execution_state==="succeeded"){
    try {
      await appendValidatedSignals(database,{workspaceId:input.workspaceId,submissionId:input.submissionId,now:input.now});
      await appendTerminalEvent(database,submission,0,input.now,"partial_submission_retryable",true);
    } catch(error) {
      const deterministic=isDeterministicFailure(error);
      await appendTerminalEvent(database,submission,0,input.now,deterministic?"validation_rejected":"processing_retryable",!deterministic);
      throw fail();
    }
    return partialProjection(database,submission,true);
  }
  if (submission.execution_state === "succeeded") {
    if (Number(submission.successful_watermark) !== Number(submission.window_upper_inclusive)) throw fail();
    await appendTerminalEvent(database, submission, 0, input.now, "succeeded", false, Number(submission.window_upper_inclusive));
    return completedProjection(database, submission);
  }
  if (!["assigned", "running", "submitted", "validating"].includes(submission.execution_state)) throw fail();
  const claim = await claimIngestion(database, submission, input.now, priorLedger);
  if (!claim.acquired) {
    if (claim.nonRetryable) throw fail();
    return Object.freeze({
      runId: submission.run_id, submissionId: submission.id, signalCount: 0,
      candidateIds: Object.freeze([]), assessments: Object.freeze([]),
      replayed: true, pending: true,
    });
  }
  try {
    const signals = await appendValidatedSignals(database, { workspaceId: input.workspaceId, submissionId: input.submissionId, now: input.now });
    if(payloadStatus==="partial"){
      await appendTerminalEvent(database,submission,claim.attempt,input.now,"partial_submission_retryable",true);
      return Object.freeze({
        runId:submission.run_id,submissionId:submission.id,signalCount:signals.length,
        candidateIds:Object.freeze([]),assessments:Object.freeze([]),replayed:false,retryable:true,
      });
    }
    const drafts = normalizeDrafts(await (input.materializer ?? createRejectOnlyCandidateMaterializer())({
      workspaceId: input.workspaceId, profileId: submission.profile_id, runId: submission.run_id,
      submissionId: submission.id, configurationId: submission.configuration_id, signals,
    }));
    const candidateIds: string[] = [];
    for (const draft of drafts) {
      const candidateId=await materializeCandidate(database, submission, draft, input.now);
      candidateIds.push(candidateId);
      if(draft.sourcedDisproof)await appendSourcedDisproofValidationMarker(database,{
        workspaceId:input.workspaceId,profileId:submission.profile_id,candidateId,runId:submission.run_id,
        submissionId:submission.id,selection:draft.sourcedDisproof,now:input.now,
      });
    }
    const assessments = [];
    for (const candidateId of candidateIds) assessments.push(await persistQualificationAssessment(database, { subject: submission.owner_subject }, { candidateId, now: input.now }));
    await completeProspectingRun(database, input.workspaceId, {
      runId: submission.run_id,
      successfulWatermark: Number(submission.window_upper_inclusive),
      now: input.now,
    });
    await appendTerminalEvent(database, submission, claim.attempt, input.now, "succeeded", false, Number(submission.window_upper_inclusive));
    return Object.freeze({ runId: submission.run_id, submissionId: submission.id, signalCount: signals.length, candidateIds: Object.freeze(candidateIds), assessments: Object.freeze(assessments) });
  } catch (error) {
    const deterministic = isDeterministicFailure(error);
    await appendTerminalEvent(database, submission, claim.attempt, input.now, deterministic ? "validation_rejected" : "processing_retryable", !deterministic);
    throw fail();
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

type Submission = {
  id:string; workspace_id:string; run_id:string; configuration_id:string; profile_id:string;
  configuration_digest:string; execution_state:string; owner_subject:string; submission_json:string;
  submission_digest:string; operation_digest:string; successful_watermark:number|null; window_upper_inclusive:number;
};
type LedgerEvent = {
  id:string; event_json:string; created_at:number;
};
type ParsedLedgerEvent = {
  stage:"claim"|"terminal"; submissionId:string; submissionDigest:string; attempt:number;
  leaseExpiresAt?:number; retryable?:boolean; terminalReason?:string;
};

type IngestionLedger = Awaited<ReturnType<typeof readLedger>>;
async function claimIngestion(database:D1Database, submission:Submission, now:number, currentLedger?:IngestionLedger) {
  const ledger = currentLedger??await readLedger(database, submission);
  const latestTerminal = ledger.terminals.sort((a,b)=>b.attempt-a.attempt)[0];
  if (latestTerminal && latestTerminal.attempt >= ledger.latestAttempt) {
    if (latestTerminal.terminalReason === "succeeded") return { acquired:false, attempt:latestTerminal.attempt, nonRetryable:false };
    if (latestTerminal.retryable === false) return { acquired:false, attempt:latestTerminal.attempt, nonRetryable:true };
  }
  const latestClaim = ledger.claims.sort((a,b)=>b.attempt-a.attempt)[0];
  if (latestClaim && latestClaim.attempt > (latestTerminal?.attempt ?? -1) && Number(latestClaim.leaseExpiresAt) > now) {
    return { acquired:false, attempt:latestClaim.attempt, nonRetryable:false };
  }
  const attempt = Math.max(0, ledger.latestAttempt + 1);
  const eventJson = stable({
    schema:"prospecting-ingestion-ledger/v1", stage:"claim", submissionId:submission.id,
    submissionDigest:submission.submission_digest, attempt, leaseExpiresAt:now + INGESTION_LEASE_MS,
  });
  const operationDigest = await sha256(`${submission.operation_digest}:ingestion-claim:${attempt}`);
  const eventId = v7();
  try {
    const results = await database.batch([
      database.prepare(
        "INSERT INTO prospecting_run_events (id,workspace_id,run_id,event_type,event_json,event_digest,operation_digest,created_at) SELECT ?,?,?,'validating',?,?,?,? WHERE EXISTS (SELECT 1 FROM prospecting_runs WHERE id=? AND workspace_id=? AND execution_state IN ('assigned','running','submitted','validating'))",
      ).bind(eventId,submission.workspace_id,submission.run_id,eventJson,await sha256(eventJson),operationDigest,now,submission.run_id,submission.workspace_id),
      database.prepare(
        "UPDATE prospecting_runs SET execution_state='validating',updated_at=?,revision=revision+1 WHERE id=? AND workspace_id=? AND execution_state IN ('assigned','running','submitted')",
      ).bind(now,submission.run_id,submission.workspace_id),
    ]);
    if (Number(results[0]?.meta?.changes ?? 0) === 1) return { acquired:true, attempt, nonRetryable:false };
  } catch {
    // A competing worker may have acquired this deterministic attempt.
  }
  return { acquired:false, attempt, nonRetryable:false };
}

async function readLedger(database:D1Database, submission:Submission) {
  const rows = await database.prepare(
    "SELECT id,event_json,created_at FROM prospecting_run_events WHERE workspace_id=? AND run_id=? AND event_type IN ('validating','failed','watermark_advanced') ORDER BY created_at,id",
  ).bind(submission.workspace_id,submission.run_id).all<LedgerEvent>();
  const claims:(ParsedLedgerEvent&{createdAt:number})[]=[];
  const terminals:(ParsedLedgerEvent&{createdAt:number})[]=[];
  let latestAttempt=-1;
  for (const row of rows.results) {
    const parsed=parseLedgerEvent(row.event_json,submission);
    if(!parsed)continue;
    latestAttempt=Math.max(latestAttempt,parsed.attempt);
    const item={...parsed,createdAt:Number(row.created_at)};
    if(parsed.stage==="claim")claims.push(item);else terminals.push(item);
  }
  return {claims,terminals,latestAttempt};
}

function parseLedgerEvent(value:string,submission:Submission):ParsedLedgerEvent|null {
  try {
    const parsed=JSON.parse(value) as Record<string,unknown>;
    if(parsed.schema!=="prospecting-ingestion-ledger/v1"||parsed.submissionId!==submission.id||parsed.submissionDigest!==submission.submission_digest||!Number.isSafeInteger(parsed.attempt)||Number(parsed.attempt)<0)return null;
    if(parsed.stage==="claim"&&Number.isSafeInteger(parsed.leaseExpiresAt))return parsed as ParsedLedgerEvent;
    if(parsed.stage==="terminal"&&typeof parsed.terminalReason==="string"&&typeof parsed.retryable==="boolean")return parsed as ParsedLedgerEvent;
    return null;
  } catch { return null; }
}

async function appendTerminalEvent(
  database:D1Database, submission:Submission, attempt:number, now:number,
  terminalReason:"succeeded"|"partial_submission_retryable"|"validation_rejected"|"processing_retryable", retryable:boolean,
  successfulWatermark?:number,
) {
  const eventJson=stable({
    schema:"prospecting-ingestion-ledger/v1",stage:"terminal",submissionId:submission.id,
    submissionDigest:submission.submission_digest,attempt,terminalReason,retryable,
    ...(successfulWatermark===undefined?{}:{successfulWatermark}),
  });
  const operationDigest=await sha256(`${submission.operation_digest}:ingestion-terminal:${attempt}:${terminalReason}`);
  const nextState=terminalReason==="validation_rejected"?"rejected":"submitted";
  try {
    await database.batch([
      database.prepare(
        "INSERT INTO prospecting_run_events (id,workspace_id,run_id,event_type,event_json,event_digest,operation_digest,created_at) VALUES (?,?,?,?,?,?,?,?)",
      ).bind(v7(),submission.workspace_id,submission.run_id,terminalReason==="succeeded"?"watermark_advanced":"failed",eventJson,await sha256(eventJson),operationDigest,now),
      ...(terminalReason==="succeeded"?[]:[database.prepare(
        "UPDATE prospecting_runs SET execution_state=?,completed_at=CASE WHEN ?='rejected' THEN ? ELSE NULL END,updated_at=?,revision=revision+1 WHERE id=? AND workspace_id=? AND execution_state IN ('assigned','running','submitted','validating')",
      ).bind(nextState,nextState,now,now,submission.run_id,submission.workspace_id)]),
    ]);
  } catch {
    const existing=await database.prepare("SELECT event_json FROM prospecting_run_events WHERE workspace_id=? AND operation_digest=? LIMIT 1").bind(submission.workspace_id,operationDigest).first<{event_json:string}>();
    if(!existing||existing.event_json!==eventJson)throw fail();
    if(terminalReason!=="succeeded")await database.prepare(
      "UPDATE prospecting_runs SET execution_state=?,completed_at=CASE WHEN ?='rejected' THEN ? ELSE NULL END,updated_at=?,revision=revision+1 WHERE id=? AND workspace_id=? AND execution_state IN ('assigned','running','submitted','validating')",
    ).bind(nextState,nextState,now,now,submission.run_id,submission.workspace_id).run();
  }
}

function canonicalPayloadStatus(value:string):"complete"|"partial"|null {
  try {
    const parsed=JSON.parse(value) as Record<string,unknown>;
    if(!parsed||typeof parsed!=="object"||Array.isArray(parsed)||parsed.schema!=="runner-observations/v1")return null;
    return parsed.status==="complete"||parsed.status==="partial"?parsed.status:null;
  } catch { return null; }
}

function isDeterministicFailure(error:unknown) {
  const code=error&&typeof error==="object"&&"code" in error?(error as {code?:unknown}).code:null;
  return code==="source_policy_rejected"||code==="prospect_review_rejected"||code==="prospecting_ingestion_rejected";
}
async function signalCount(database:D1Database,submission:Submission){
  const row=await database.prepare("SELECT COUNT(*) count FROM prospecting_signals WHERE workspace_id=? AND submission_id=?").bind(submission.workspace_id,submission.id).first<{count:number}>();
  return Number(row?.count??0);
}
async function partialProjection(database:D1Database,submission:Submission,replayed:boolean){
  return Object.freeze({
    runId:submission.run_id,submissionId:submission.id,
    signalCount:await signalCount(database,submission),candidateIds:Object.freeze([]),assessments:Object.freeze([]),
    replayed,retryable:true,
  });
}
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
    "INSERT INTO prospecting_candidates (id,workspace_id,created_at,updated_at,revision,profile_id,offer_id,run_id,submission_id,configuration_id,fingerprint,candidate_json,candidate_digest,status) VALUES (?,?,?,?,1,?,?,?,?,?,?,?,?,'observed')",
  ).bind(id,submission.workspace_id,now,now,submission.profile_id,target.offer_id,submission.run_id,submission.id,submission.configuration_id,fingerprint,candidateJson,candidateDigest).run(); }
  catch { const winner=await database.prepare("SELECT id FROM prospecting_candidates WHERE workspace_id=? AND profile_id=? AND offer_id=? AND fingerprint=? LIMIT 1").bind(submission.workspace_id,submission.profile_id,target.offer_id,fingerprint).first<{id:string}>(); if(winner)return winner.id; throw fail(); }
  return id;
}
function normalizeDrafts(value:readonly CandidateDraft[]) {
  if (!Array.isArray(value) || value.length > 25) throw fail();
  const output=value.map(d=>{ if(!d||!validId(d.targetId)||![d.accountFit,d.painStrength,d.timingUrgency,d.dataReadiness,d.commercialViability].every(score=>Number.isInteger(score)&&score>=0&&score<=2))throw fail(); const requiredEvidence=boundedArray(d.requiredEvidence??[],160,128),hardDisqualifiers=boundedArray(d.hardDisqualifiers??[],32,128);let sourcedDisproof:SourcedDisproofSelection|undefined;if(d.sourcedDisproof!==undefined){if(!d.sourcedDisproof||Object.keys(d.sourcedDisproof).sort().join(",")!=="signalFingerprint,validationRule"||!validDigest(d.sourcedDisproof.signalFingerprint)||d.sourcedDisproof.validationRule!=="owner-rejection-material-evidence/v1")throw fail();sourcedDisproof={signalFingerprint:d.sourcedDisproof.signalFingerprint,validationRule:d.sourcedDisproof.validationRule};}return {...d,requiredEvidence,hardDisqualifiers,...(sourcedDisproof?{sourcedDisproof}:{})}; });
  if(new Set(output.map(d=>d.targetId)).size!==output.length)throw fail(); return output;
}
function boundedArray(values:readonly string[],max:number,width:number){if(!Array.isArray(values)||values.length>max)throw fail();const out=values.map(value=>{if(typeof value!=="string"||!(value=value.normalize("NFC").trim())||value.length>width)throw fail();return value;});if(new Set(out).size!==out.length)throw fail();return out.sort();}
function validId(value:unknown):value is string{return typeof value==="string"&&value.length>0&&value.length<=160;}
function validDigest(value:unknown):value is string{return typeof value==="string"&&/^[0-9a-f]{64}$/.test(value);}
function fail():never{throw new ProspectingIngestionError("Prospecting ingestion is unavailable or invalid");}
function stable(value:unknown):string{if(Array.isArray(value))return`[${value.map(stable).join(",")}]`;if(value&&typeof value==="object"){const record=value as Record<string,unknown>;return`{${Object.keys(record).sort().map(key=>`${JSON.stringify(key)}:${stable(record[key])}`).join(",")}}`;}return JSON.stringify(value);}
async function sha256(value:string){const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));return Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,"0")).join("");}
