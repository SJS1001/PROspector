/* D1's flexible row projection is narrowed at each authority boundary. */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { v7 } from "uuid";

const DAY = 24 * 60 * 60 * 1_000;

export class ProspectingScheduleConflictError extends Error {
  readonly code = "prospecting_schedule_conflict";
}

type Intent = {
  profileId: string; configurationId: string; configurationDigest: string; scheduleId: string | null;
  triggerKind: "initial" | "manual" | "scheduled" | "material_change"; triggerKey: string;
  idempotencyKey: string; at: number; watermark: number | null; manifest: Record<string, unknown>;
};

/** A Profile-owned namespace; Product discovery slots can never occupy these keys. */
export function profileSlotKey(profileId: string, localDate: string, localTime: string, utcOffsetMinutes: number) {
  if (!profileId || !/^\d{4}-\d{2}-\d{2}$/.test(localDate) || !/^\d{2}:\d{2}$/.test(localTime) || !Number.isInteger(utcOffsetMinutes)) {
    throw new ProspectingScheduleConflictError("Invalid Profile schedule slot");
  }
  return `profile:${profileId}:slot:${localDate}T${localTime}:offset:${utcOffsetMinutes}`;
}

export function profileSourceWindow(watermark: number | null, upperInclusive: number) {
  if (!Number.isSafeInteger(upperInclusive)) throw new ProspectingScheduleConflictError("Invalid prospecting window");
  return { lowerExclusive: watermark === null ? null : watermark - DAY, upperInclusive };
}

export async function createProspectingIntent(database: D1Database, workspaceId: string, intent: Intent) {
  validateIntent(intent);
  const prior = await database.prepare(
    "SELECT id, trigger_kind, trigger_key, execution_state FROM prospecting_runs WHERE workspace_id = ? AND idempotency_key = ? LIMIT 1",
  ).bind(workspaceId, intent.idempotencyKey).first<{ id: string; trigger_kind: string; trigger_key: string; execution_state: string }>();
  if (prior) {
    if (prior.trigger_kind !== intent.triggerKind || prior.trigger_key !== intent.triggerKey) throw new ProspectingScheduleConflictError("Idempotency key was used for another prospecting intent");
    return { id: prior.id, trigger: intent.triggerKind, key: prior.trigger_key, executionState: prior.execution_state, replayed: true };
  }
  if (intent.triggerKind === "scheduled") {
    const active = await database.prepare(
      "SELECT id FROM prospecting_runs WHERE workspace_id = ? AND profile_id = ? AND execution_state IN ('queued','assigned','running','submitted','validating') LIMIT 1",
    ).bind(workspaceId, intent.profileId).first<{ id: string }>();
    if (active) return persistSkippedOverlap(database, workspaceId, intent, active.id);
  }
  const manifestJson = stable({ schema: "profile-prospecting-run/v1", ...intent.manifest, window: profileSourceWindow(intent.watermark, intent.at), transport: "blocked_missing_capability", downstreamAuthority: false });
  const manifestDigest = await sha256(manifestJson);
  const operationDigest = await sha256(stable({ action: "profile.prospecting.intent", profileId: intent.profileId, configurationDigest: intent.configurationDigest, triggerKey: intent.triggerKey, manifestDigest }));
  const commandId = v7(); const runId = v7(); const eventId = v7(); const now = intent.at;
  const window = profileSourceWindow(intent.watermark, intent.at);
  const eventJson = stable({ trigger: intent.triggerKind, key: intent.triggerKey, state: "blocked_missing_capability" });
  const eventDigest = await sha256(eventJson);
  await database.batch([
    database.prepare("INSERT INTO authority_commands (id, workspace_id, created_at, updated_at, revision, command_type, idempotency_key, operation_digest, expected_revision, subject_type, subject_id, status) VALUES (?, ?, ?, ?, 1, 'profile.prospecting.intent', ?, ?, 1, 'profile', ?, 'accepted')").bind(commandId, workspaceId, now, now, intent.idempotencyKey, operationDigest, intent.profileId),
    database.prepare("INSERT INTO prospecting_runs (id, workspace_id, created_at, updated_at, revision, profile_id, configuration_id, schedule_id, configuration_digest, trigger_kind, trigger_key, window_lower_exclusive, window_upper_inclusive, last_successful_watermark, successful_watermark, manifest_json, manifest_digest, execution_state, authority_command_id, operation_digest, idempotency_key, started_at, completed_at) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, 'blocked_missing_capability', ?, ?, ?, ?, NULL)").bind(runId, workspaceId, now, now, intent.profileId, intent.configurationId, intent.scheduleId, intent.configurationDigest, intent.triggerKind, intent.triggerKey, window.lowerExclusive, window.upperInclusive, intent.watermark, manifestJson, manifestDigest, commandId, operationDigest, intent.idempotencyKey, now),
    database.prepare("INSERT INTO prospecting_run_events (id, workspace_id, run_id, event_type, event_json, event_digest, operation_digest, created_at) VALUES (?, ?, ?, 'created', ?, ?, ?, ?)").bind(eventId, workspaceId, runId, eventJson, eventDigest, await sha256(`${operationDigest}:created`), now),
  ]);
  return { id: runId, trigger: intent.triggerKind, key: intent.triggerKey, executionState: "blocked_missing_capability", replayed: false };
}

/**
 * Durable scheduler reconciliation.  This is intentionally a pure database
 * intent writer: no clock service, Runner, provider, URL retrieval, or queue
 * dispatch is reachable here.  A due local slot runs once if it is at most a
 * day late; older slots are recorded as skipped and the next local slot is
 * calculated with its actual UTC offset (so DST cannot collapse slots).
 */
export async function reconcileProspectingSchedules(database: D1Database, workspaceId: string, now: number) {
  if (!Number.isSafeInteger(now)) throw new ProspectingScheduleConflictError("Invalid reconciliation time");
  const schedules = await database.prepare("SELECT id,profile_id,configuration_id,configuration_digest,next_run_at,last_successful_watermark,intended_local_time,timezone FROM prospecting_schedules WHERE workspace_id=? AND active=1 ORDER BY next_run_at,id").bind(workspaceId).all<any>();
  const results = [];
  for (const schedule of schedules.results) {
    if (Number(schedule.next_run_at) > now) continue;
    const due = Number(schedule.next_run_at); const key = slotAt(schedule.profile_id, due, String(schedule.intended_local_time), String(schedule.timezone));
    const next = nextWeekdayLocal(due, String(schedule.intended_local_time), String(schedule.timezone));
    if (now - due > DAY) {
      await advanceSchedule(database, workspaceId, schedule.id, next, now, "skipped_misfire");
      results.push({ scheduleId: schedule.id, executionState: "skipped_misfire", key }); continue;
    }
    const result = await createProspectingIntent(database, workspaceId, { profileId:schedule.profile_id, configurationId:schedule.configuration_id, configurationDigest:schedule.configuration_digest, scheduleId:schedule.id, triggerKind:"scheduled", triggerKey:key, idempotencyKey:`schedule:${key}`, at:due, watermark:schedule.last_successful_watermark === null ? null : Number(schedule.last_successful_watermark), manifest:{ scheduleId:schedule.id, localSlot:key } });
    await advanceSchedule(database, workspaceId, schedule.id, next, now, result.executionState);
    results.push({ scheduleId:schedule.id, ...result });
  }
  return results;
}

export async function createManualProspectingIntent(database: D1Database, workspaceId: string, input: Omit<Intent, "triggerKind" | "triggerKey"> & { triggerKey?: string }) {
  return createProspectingIntent(database, workspaceId, { ...input, triggerKind:"manual", triggerKey: input.triggerKey ?? `manual:profile:${input.profileId}:${input.idempotencyKey}` });
}

export async function createMaterialChangeProspectingIntent(database: D1Database, workspaceId: string, input: Omit<Intent, "triggerKind" | "triggerKey"> & { replacementActivationId: string }) {
  if (!input.replacementActivationId) throw new ProspectingScheduleConflictError("Material-change intent requires replacement activation lineage");
  return createProspectingIntent(database, workspaceId, { ...input, triggerKind:"material_change", triggerKey:`material-change:profile:${input.profileId}:${input.replacementActivationId}`, manifest:{ ...input.manifest, replacementActivationId:input.replacementActivationId } });
}

export async function completeProspectingRun(database: D1Database, workspaceId: string, input: { runId: string; successfulWatermark: number; now: number }) {
  const run = await database.prepare("SELECT id, schedule_id, execution_state, successful_watermark FROM prospecting_runs WHERE id = ? AND workspace_id = ? LIMIT 1").bind(input.runId, workspaceId).first<{ id: string; schedule_id: string | null; execution_state: string; successful_watermark:number|null }>();
  if (!run) throw new ProspectingScheduleConflictError("Only a running prospecting run may succeed");
  if (!Number.isSafeInteger(input.successfulWatermark)) throw new ProspectingScheduleConflictError("Invalid successful watermark");
  if(run.execution_state==="succeeded"&&Number(run.successful_watermark)===input.successfulWatermark)return{replayed:true};
  if(run.execution_state==="succeeded")throw new ProspectingScheduleConflictError("Prospecting run completion watermark conflicts");
  if (run.execution_state !== "running") throw new ProspectingScheduleConflictError("Only a running prospecting run may succeed");
  const eventJson = stable({ state: "succeeded", successfulWatermark: input.successfulWatermark });
  try{const result=await database.batch([
    database.prepare("UPDATE prospecting_runs SET execution_state = 'succeeded', successful_watermark = ?, completed_at = ?, updated_at = ?, revision = revision + 1 WHERE id = ? AND workspace_id = ? AND execution_state = 'running'").bind(input.successfulWatermark, input.now, input.now, run.id, workspaceId),
    ...(run.schedule_id ? [database.prepare("UPDATE prospecting_schedules SET last_successful_watermark = ?, updated_at = ?, revision = revision + 1 WHERE id = ? AND workspace_id = ?").bind(input.successfulWatermark, input.now, run.schedule_id, workspaceId)] : []),
    database.prepare("INSERT INTO prospecting_run_events (id,workspace_id,run_id,event_type,event_json,event_digest,operation_digest,created_at) VALUES (?,?,?,?,?,?,?,?)").bind(v7(), workspaceId, run.id, "succeeded", eventJson, await sha256(eventJson), await sha256(`prospecting:${run.id}:succeeded:${input.successfulWatermark}`), input.now),
  ]);if(Number(result[0]?.meta?.changes??0)===1)return{replayed:false};}catch{/* The competing completion may have committed atomically. */}
  const winner=await database.prepare("SELECT execution_state,successful_watermark FROM prospecting_runs WHERE id=? AND workspace_id=? LIMIT 1").bind(run.id,workspaceId).first<{execution_state:string;successful_watermark:number|null}>();if(winner?.execution_state==="succeeded"&&Number(winner.successful_watermark)===input.successfulWatermark)return{replayed:true};throw new ProspectingScheduleConflictError("Prospecting run completion conflicted");
}

async function persistSkippedOverlap(database:D1Database, workspaceId:string, intent:Intent, activeRunId:string) {
  const existing = await database.prepare("SELECT id,execution_state FROM prospecting_runs WHERE workspace_id=? AND profile_id=? AND trigger_key=? LIMIT 1").bind(workspaceId,intent.profileId,intent.triggerKey).first<any>();
  if (existing) return { id:existing.id,trigger:intent.triggerKind,key:intent.triggerKey,executionState:existing.execution_state,replayed:true };
  const now=intent.at, runId=v7(),commandId=v7(),eventId=v7();const manifest=stable({schema:"profile-prospecting-run/v1",...intent.manifest,transport:"blocked_missing_capability",downstreamAuthority:false,skippedBecause:activeRunId});const manifestDigest=await sha256(manifest),operation=await sha256(stable({action:"profile.prospecting.skipped_overlap",profileId:intent.profileId,triggerKey:intent.triggerKey,manifestDigest})),eventJson=stable({trigger:"scheduled",key:intent.triggerKey,state:"skipped_overlap",activeRunId});
  try { await database.batch([
    database.prepare("INSERT INTO authority_commands (id,workspace_id,created_at,updated_at,revision,command_type,idempotency_key,operation_digest,expected_revision,subject_type,subject_id,status) VALUES (?,?,?,?,1,'profile.prospecting.intent',?,?,1,'profile',?,'accepted')").bind(commandId,workspaceId,now,now,intent.idempotencyKey,operation,intent.profileId),
    database.prepare("INSERT INTO prospecting_runs (id,workspace_id,created_at,updated_at,revision,profile_id,configuration_id,schedule_id,configuration_digest,trigger_kind,trigger_key,window_lower_exclusive,window_upper_inclusive,last_successful_watermark,successful_watermark,manifest_json,manifest_digest,execution_state,authority_command_id,operation_digest,idempotency_key,started_at,completed_at) VALUES (?,?,?,?,1,?,?,?,?,?,?,?, ?,NULL,?,?,?,'skipped_overlap',?,?,?, ?,?)").bind(runId,workspaceId,now,now,intent.profileId,intent.configurationId,intent.scheduleId,intent.configurationDigest,intent.triggerKind,intent.triggerKey,profileSourceWindow(intent.watermark,now).lowerExclusive,now,intent.watermark,manifest,manifestDigest,commandId,operation,intent.idempotencyKey,now,now),
    database.prepare("INSERT INTO prospecting_run_events (id,workspace_id,run_id,event_type,event_json,event_digest,operation_digest,created_at) VALUES (?, ?, ?, 'skipped_overlap', ?, ?, ?, ?)").bind(eventId,workspaceId,runId,eventJson,await sha256(eventJson),await sha256(`${operation}:skipped_overlap`),now),
  ]); } catch(e) { const r=await database.prepare("SELECT id,execution_state FROM prospecting_runs WHERE workspace_id=? AND profile_id=? AND trigger_key=? LIMIT 1").bind(workspaceId,intent.profileId,intent.triggerKey).first<any>();if(r)return{id:r.id,trigger:intent.triggerKind,key:intent.triggerKey,executionState:r.execution_state,replayed:true};throw e }
  return {id:runId,trigger:intent.triggerKind,key:intent.triggerKey,executionState:"skipped_overlap" as const,replayed:false};
}
async function advanceSchedule(database:D1Database,workspaceId:string,id:string,next:number,now:number,state:string){await database.prepare("UPDATE prospecting_schedules SET next_run_at=?,utc_offset_minutes=?,execution_state=?,updated_at=?,revision=revision+1 WHERE id=? AND workspace_id=? AND active=1").bind(next,offsetAt(next),state,now,id,workspaceId).run();}
function slotAt(profileId:string,at:number,time:string,zone:string){const p=localParts(at,zone);return profileSlotKey(profileId,`${p.year}-${p.month}-${p.day}`,time,offsetAt(at,zone));}
function localParts(at:number,zone:string){const x=new Intl.DateTimeFormat("en-CA",{timeZone:zone,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date(at));const v=(k:string)=>x.find(p=>p.type===k)?.value??"";return{year:v("year"),month:v("month"),day:v("day")};}
function offsetAt(at:number,zone="America/Toronto"){const n=new Intl.DateTimeFormat("en-US",{timeZone:zone,timeZoneName:"longOffset"}).formatToParts(new Date(at)).find(p=>p.type==="timeZoneName")?.value??"GMT-05:00";const m=/GMT([+-])(\d{2}):(\d{2})/.exec(n);return m?(m[1]==="+"?1:-1)*(Number(m[2])*60+Number(m[3])):-300;}
function nextWeekdayLocal(after:number,time:string,zone:string){const [h,m]=time.split(":").map(Number);for(let at=after+60_000,i=0;i<12_000;i++,at+=60_000){const p=new Intl.DateTimeFormat("en-US",{timeZone:zone,weekday:"short",hour:"2-digit",hourCycle:"h23",minute:"2-digit"}).formatToParts(new Date(at)),v=(k:string)=>p.find(x=>x.type===k)?.value;if(!["Sat","Sun"].includes(v("weekday")??"")&&Number(v("hour"))===h&&Number(v("minute"))===m)return at;}throw new ProspectingScheduleConflictError("Unable to resolve next Profile local slot");}

function validateIntent(intent: Intent) {
  if (!intent.profileId || !intent.configurationId || !validDigest(intent.configurationDigest) || !intent.idempotencyKey || !Number.isSafeInteger(intent.at)) throw new ProspectingScheduleConflictError("Invalid prospecting intent");
  if (!intent.scheduleId && intent.triggerKind === "scheduled") throw new ProspectingScheduleConflictError("Scheduled intent requires a schedule");
}
function validDigest(value: unknown): value is string { return typeof value === "string" && /^[a-f0-9]{64}$/.test(value); }
function stable(value: unknown): string { if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`; if (value && typeof value === "object") { const record = value as Record<string, unknown>; return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stable(record[key])}`).join(",")}}`; } return JSON.stringify(value); }
async function sha256(value: string) { const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)); return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join(""); }
