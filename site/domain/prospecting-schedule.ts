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
    if (active) return { id: null, trigger: intent.triggerKind, key: intent.triggerKey, executionState: "skipped_overlap" as const, replayed: false };
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

export async function completeProspectingRun(database: D1Database, workspaceId: string, input: { runId: string; successfulWatermark: number; now: number }) {
  const run = await database.prepare("SELECT id, schedule_id, execution_state FROM prospecting_runs WHERE id = ? AND workspace_id = ? LIMIT 1").bind(input.runId, workspaceId).first<{ id: string; schedule_id: string | null; execution_state: string }>();
  if (!run || run.execution_state !== "running") throw new ProspectingScheduleConflictError("Only a running prospecting run may succeed");
  if (!Number.isSafeInteger(input.successfulWatermark)) throw new ProspectingScheduleConflictError("Invalid successful watermark");
  await database.batch([
    database.prepare("UPDATE prospecting_runs SET execution_state = 'succeeded', successful_watermark = ?, completed_at = ?, updated_at = ?, revision = revision + 1 WHERE id = ? AND workspace_id = ? AND execution_state = 'running'").bind(input.successfulWatermark, input.now, input.now, run.id, workspaceId),
    ...(run.schedule_id ? [database.prepare("UPDATE prospecting_schedules SET last_successful_watermark = ?, updated_at = ?, revision = revision + 1 WHERE id = ? AND workspace_id = ?").bind(input.successfulWatermark, input.now, run.schedule_id, workspaceId)] : []),
  ]);
}

function validateIntent(intent: Intent) {
  if (!intent.profileId || !intent.configurationId || !validDigest(intent.configurationDigest) || !intent.idempotencyKey || !Number.isSafeInteger(intent.at)) throw new ProspectingScheduleConflictError("Invalid prospecting intent");
  if (!intent.scheduleId && intent.triggerKind === "scheduled") throw new ProspectingScheduleConflictError("Scheduled intent requires a schedule");
}
function validDigest(value: unknown): value is string { return typeof value === "string" && /^[a-f0-9]{64}$/.test(value); }
function stable(value: unknown): string { if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`; if (value && typeof value === "object") { const record = value as Record<string, unknown>; return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stable(record[key])}`).join(",")}}`; } return JSON.stringify(value); }
async function sha256(value: string) { const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)); return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join(""); }
