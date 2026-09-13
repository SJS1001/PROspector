import { v7 } from "uuid";

export class ProspectingRunAdmissionError extends Error {
  readonly code = "prospecting_run_admission_rejected";
}

export type ProspectingRunAdmissionRequest = Readonly<{
  workspaceId: string;
  runId: string;
  profileId: string;
  configurationId: string;
  configurationDigest: string;
  expectedRunRevision: number;
  fromState: "blocked_missing_capability";
  toState: "queued";
}>;

export type ProspectingRunAdmissionDecision =
  | Readonly<{ kind: "denied" }>
  | Readonly<{
      kind: "authorized";
      authorityId: string;
      evidenceDigest: string;
      requestDigest: string;
      validUntil: number;
    }>;

export interface ProspectingRunAdmissionPort {
  authorize(request: ProspectingRunAdmissionRequest): Promise<ProspectingRunAdmissionDecision>;
}

type AdmissionInput = Readonly<{
  workspaceId: string;
  runId: string;
  expectedRunRevision: number;
  idempotencyKey: string;
  now: number;
}>;

type RunRow = {
  id: string;
  profile_id: string;
  configuration_id: string;
  configuration_digest: string;
  revision: number;
  execution_state: string;
  configuration_active: number;
};

const INPUT_KEYS = ["expectedRunRevision", "idempotencyKey", "now", "runId", "workspaceId"];
const REQUEST_KEYS = ["configurationDigest", "configurationId", "expectedRunRevision", "fromState", "profileId", "runId", "toState", "workspaceId"];
const AUTHORIZED_DECISION_KEYS = ["authorityId", "evidenceDigest", "kind", "requestDigest", "validUntil"];
export const PROSPECTING_RUN_ADMISSION_MAX_TTL_MS = 5 * 60 * 1_000;

/** Production remains reject-only until a trusted scheduler/transport adapter is composed. */
export function createRejectOnlyProspectingRunAdmissionPort(): ProspectingRunAdmissionPort {
  return Object.freeze({ async authorize() { return { kind: "denied" } as const; } });
}

/** Canonical binding helper for trusted adapters; it grants no authority. */
export async function digestProspectingRunAdmissionRequest(request: ProspectingRunAdmissionRequest) {
  if (!plainWithExactKeys(request, REQUEST_KEYS) || !bounded(request.workspaceId, 256) || !bounded(request.runId, 256) ||
      !bounded(request.profileId, 256) || !bounded(request.configurationId, 256) || !digest(request.configurationDigest) ||
      !Number.isSafeInteger(request.expectedRunRevision) || request.expectedRunRevision < 1 ||
      request.fromState !== "blocked_missing_capability" || request.toState !== "queued") throw rejected();
  return sha256(canonical(request));
}

/**
 * Move one durable run intent into the internal queue only after a trusted,
 * exact-tuple capability decision. This performs no dispatch, retrieval,
 * provider call, assignment issuance, or other external effect.
 */
export async function admitProspectingRunToQueue(
  database: D1Database,
  input: AdmissionInput,
  port: ProspectingRunAdmissionPort = createRejectOnlyProspectingRunAdmissionPort(),
) {
  validateInput(input);
  if (!port || typeof port.authorize !== "function") throw rejected();

  const run = await database.prepare(
    `SELECT r.id,r.profile_id,r.configuration_id,r.configuration_digest,r.revision,r.execution_state,
            c.active AS configuration_active
       FROM prospecting_runs r
       JOIN typed_configurations c
         ON c.id=r.configuration_id
        AND c.workspace_id=r.workspace_id
        AND c.owner_type='profile'
        AND c.owner_id=r.profile_id
        AND c.kind='profile_effective'
      WHERE r.id=? AND r.workspace_id=?
      LIMIT 1`,
  ).bind(input.runId, input.workspaceId).first<RunRow>();
  if (!run || !bounded(run.id, 256) || !bounded(run.profile_id, 256) || !bounded(run.configuration_id, 256) ||
      !digest(run.configuration_digest) || !Number.isSafeInteger(Number(run.revision)) || Number(run.revision) < 1) throw rejected();

  const request: ProspectingRunAdmissionRequest = Object.freeze({
    workspaceId: input.workspaceId,
    runId: run.id,
    profileId: run.profile_id,
    configurationId: run.configuration_id,
    configurationDigest: run.configuration_digest,
    expectedRunRevision: input.expectedRunRevision,
    fromState: "blocked_missing_capability",
    toState: "queued",
  });
  const requestDigest = await digestProspectingRunAdmissionRequest(request);
  let authority: Extract<ProspectingRunAdmissionDecision, { kind: "authorized" }>;
  try {
    authority = validateDecision(await port.authorize(request), requestDigest, input.now);
  } catch {
    throw rejected();
  }
  const operationDigest = await sha256(canonical({
    action: "profile.prospecting.transport_admission",
    authorityId: authority.authorityId,
    evidenceDigest: authority.evidenceDigest,
    requestDigest,
    validUntil: authority.validUntil,
  }));

  const prior = await readPriorAdmission(database, input.workspaceId, input.idempotencyKey);
  if (prior) {
    if (prior.command_type !== "profile.prospecting.transport_admission" ||
        prior.subject_id !== input.runId || prior.operation_digest !== operationDigest ||
        Number(prior.expected_revision) !== input.expectedRunRevision ||
        prior.audit_operation_digest !== operationDigest || prior.audit_request_digest !== requestDigest) {
      throw rejected();
    }
    return Object.freeze({ runId: input.runId, executionState: "queued" as const, revision: input.expectedRunRevision + 1, replayed: true, operationDigest });
  }

  if (Number(run.configuration_active) !== 1 || run.execution_state !== "blocked_missing_capability" || Number(run.revision) !== input.expectedRunRevision) {
    throw rejected();
  }

  const commandId = v7();
  const auditId = v7();
  const detailJson = canonical({
    schema: "prospecting-run-transport-admission/v1",
    authorityCommandId: commandId,
    authorityId: authority.authorityId,
    evidenceDigest: authority.evidenceDigest,
    requestDigest,
    operationDigest,
    validUntil: authority.validUntil,
    fromState: "blocked_missing_capability",
    toState: "queued",
    expectedRunRevision: input.expectedRunRevision,
    resultingRunRevision: input.expectedRunRevision + 1,
    externalEffects: false,
  });

  try {
    const results = await database.batch([
      database.prepare(
        `INSERT INTO authority_commands
          (id,workspace_id,created_at,updated_at,revision,command_type,idempotency_key,operation_digest,expected_revision,subject_type,subject_id,status)
         SELECT ?,?,?,?,1,'profile.prospecting.transport_admission',?,?,?,'prospecting_run',?,'accepted'
          WHERE EXISTS (
            SELECT 1 FROM prospecting_runs r
            JOIN typed_configurations c
              ON c.id=r.configuration_id AND c.workspace_id=r.workspace_id
             AND c.owner_type='profile' AND c.owner_id=r.profile_id
             AND c.kind='profile_effective' AND c.active=1
           WHERE r.id=? AND r.workspace_id=? AND r.revision=?
             AND r.execution_state='blocked_missing_capability'
          )`,
      ).bind(commandId, input.workspaceId, input.now, input.now, input.idempotencyKey, operationDigest, input.expectedRunRevision, input.runId, input.runId, input.workspaceId, input.expectedRunRevision),
      database.prepare(
        `UPDATE prospecting_runs
            SET execution_state='queued',updated_at=?,revision=revision+1
          WHERE id=? AND workspace_id=? AND revision=?
            AND execution_state='blocked_missing_capability'
            AND EXISTS (
              SELECT 1 FROM authority_commands
               WHERE id=? AND workspace_id=? AND command_type='profile.prospecting.transport_admission'
                 AND subject_type='prospecting_run' AND subject_id=? AND operation_digest=?
                 AND expected_revision=? AND status='accepted'
            )`,
      ).bind(input.now, input.runId, input.workspaceId, input.expectedRunRevision, commandId, input.workspaceId, input.runId, operationDigest, input.expectedRunRevision),
      database.prepare(
        `INSERT INTO audit_events
          (id,workspace_id,actor_type,actor_id,action,subject_type,subject_id,detail_json,created_at)
         SELECT ?,?,'system','prospecting-run-admission-service','prospecting.run.queued','prospecting_run',?,?,?
          WHERE EXISTS (
            SELECT 1 FROM authority_commands c
            JOIN prospecting_runs r ON r.id=c.subject_id AND r.workspace_id=c.workspace_id
           WHERE c.id=? AND c.workspace_id=? AND c.operation_digest=?
             AND r.id=? AND r.revision=? AND r.execution_state='queued'
          )`,
      ).bind(auditId, input.workspaceId, input.runId, detailJson, input.now, commandId, input.workspaceId, operationDigest, input.runId, input.expectedRunRevision + 1),
    ]);
    if (results.some((result) => Number(result.meta?.changes ?? 0) !== 1)) throw rejected();
  } catch {
    const winner = await readPriorAdmission(database, input.workspaceId, input.idempotencyKey);
    if (winner && winner.command_type === "profile.prospecting.transport_admission" && winner.subject_id === input.runId &&
        winner.operation_digest === operationDigest && Number(winner.expected_revision) === input.expectedRunRevision &&
        winner.audit_operation_digest === operationDigest && winner.audit_request_digest === requestDigest) {
      return Object.freeze({ runId: input.runId, executionState: "queued" as const, revision: input.expectedRunRevision + 1, replayed: true, operationDigest });
    }
    throw rejected();
  }

  return Object.freeze({ runId: input.runId, executionState: "queued" as const, revision: input.expectedRunRevision + 1, replayed: false, operationDigest });
}

async function readPriorAdmission(database: D1Database, workspaceId: string, idempotencyKey: string) {
  return database.prepare(
    `SELECT c.command_type,c.subject_id,c.operation_digest,c.expected_revision,
            json_extract(a.detail_json,'$.operationDigest') AS audit_operation_digest,
            json_extract(a.detail_json,'$.requestDigest') AS audit_request_digest
       FROM authority_commands c
       LEFT JOIN audit_events a
         ON a.workspace_id=c.workspace_id AND a.subject_type='prospecting_run'
        AND a.subject_id=c.subject_id AND a.action='prospecting.run.queued'
        AND json_extract(a.detail_json,'$.authorityCommandId')=c.id
      WHERE c.workspace_id=? AND c.idempotency_key=?
      LIMIT 1`,
  ).bind(workspaceId, idempotencyKey).first<{
    command_type: string; subject_id: string; operation_digest: string; expected_revision: number;
    audit_operation_digest: string | null; audit_request_digest: string | null;
  }>();
}

function validateInput(input: AdmissionInput) {
  if (!plainWithExactKeys(input, INPUT_KEYS) || !bounded(input.workspaceId, 256) || !bounded(input.runId, 256) ||
      !bounded(input.idempotencyKey, 256) || !Number.isSafeInteger(input.expectedRunRevision) || input.expectedRunRevision < 1 ||
      !Number.isSafeInteger(input.now) || input.now <= 0) throw rejected();
}

function validateDecision(value: ProspectingRunAdmissionDecision, requestDigest: string, now: number) {
  if (!value || typeof value !== "object" || Array.isArray(value) || value.kind !== "authorized" ||
      !plainWithExactKeys(value, AUTHORIZED_DECISION_KEYS) || !bounded(value.authorityId, 256) ||
      !digest(value.evidenceDigest) || value.requestDigest !== requestDigest || !Number.isSafeInteger(value.validUntil) || value.validUntil <= now ||
      value.validUntil - now > PROSPECTING_RUN_ADMISSION_MAX_TTL_MS) {
    throw rejected();
  }
  return value;
}

function plainWithExactKeys(value: unknown, expected: readonly string[]) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return (prototype === Object.prototype || prototype === null) && Object.keys(value).sort().join(",") === [...expected].sort().join(",");
}

function bounded(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max && value === value.normalize("NFC").trim();
}
function digest(value: unknown): value is string { return typeof value === "string" && /^[a-f0-9]{64}$/.test(value); }
function canonical(value: unknown): string { if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`; if (value && typeof value === "object") { const record = value as Record<string, unknown>; return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`; } return JSON.stringify(value); }
async function sha256(value: string) { const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)); return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join(""); }
function rejected() { return new ProspectingRunAdmissionError("prospecting_run_admission_rejected"); }
