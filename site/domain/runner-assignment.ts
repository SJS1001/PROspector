import { v7 } from "uuid";
import type { RunnerAssignmentEnvelope, RunnerPort } from "./ports/runner";

export class RunnerAssignmentError extends Error {
  readonly code = "runner_assignment_rejected";
}

type Quotas = { maxBytes: number; maxFindings: number; maxSources: number };
type IssueInput = {
  workspaceId: string; runId: string; profileId: string; configurationId: string; configurationDigest: string;
  audience: string; expiresAt: number; instructionVersion: string; toolConfigurationDigest: string; quotas: Quotas;
  grantReference: string; reason: string; idempotencyKey: string; now: number; capabilitySecret: Uint8Array;
};
type SubmitInput = { capability: string; idempotencyKey: string; payload: unknown; now: number; capabilitySecret: Uint8Array };

type Capability = { assignmentId: string; workspaceId: string; runId: string; profileId: string; configurationId: string; audience: string; nonce: string; expiresAt: number };

export async function issueRunnerAssignment(database: D1Database, input: IssueInput) {
  validateIssue(input);
  const run = await database.prepare("SELECT id, execution_state, configuration_id, configuration_digest FROM prospecting_runs WHERE id = ? AND workspace_id = ? AND profile_id = ? LIMIT 1")
    .bind(input.runId, input.workspaceId, input.profileId).first<{ id: string; execution_state: string; configuration_id: string; configuration_digest: string }>();
  if (!run || !["queued", "assigned", "running"].includes(run.execution_state) || run.configuration_id !== input.configurationId || run.configuration_digest !== input.configurationDigest) throw reject("Runner assignment is not bound to an active exact run");
  const existing = await database.prepare("SELECT a.id, a.expires_at FROM runner_assignments a JOIN authority_commands c ON c.id = a.authority_command_id WHERE a.workspace_id = ? AND c.idempotency_key = ? LIMIT 1")
    .bind(input.workspaceId, input.idempotencyKey).first<{ id: string; expires_at: number }>();
  if (existing) return { assignmentId: existing.id, capability: null, replayed: true };
  const assignmentId = v7(); const nonce = randomToken();
  const payload: Capability = { assignmentId, workspaceId: input.workspaceId, runId: input.runId, profileId: input.profileId, configurationId: input.configurationId, audience: input.audience, nonce, expiresAt: input.expiresAt };
  const capability = await signCapability(payload, input.capabilitySecret);
  const tokenHash = await sha256(capability); const nonceHash = await sha256(nonce); const quotaJson = canonical(input.quotas);
  const quotaDigest = await sha256(quotaJson); const operationDigest = await sha256(canonical({ action: "runner.assignment.issue", payload, instructionVersion: input.instructionVersion, toolConfigurationDigest: input.toolConfigurationDigest, quotaDigest, grantReference: input.grantReference, reason: input.reason }));
  const commandId = v7(); const auditId = v7();
  await database.batch([
    database.prepare("INSERT INTO authority_commands (id, workspace_id, created_at, updated_at, revision, command_type, idempotency_key, operation_digest, expected_revision, subject_type, subject_id, status) VALUES (?, ?, ?, ?, 1, 'runner.assignment.issue', ?, ?, 1, 'prospecting_run', ?, 'accepted')").bind(commandId, input.workspaceId, input.now, input.now, input.idempotencyKey, operationDigest, input.runId),
    database.prepare("INSERT INTO audit_events (id, workspace_id, actor_type, actor_id, action, subject_type, subject_id, detail_json, created_at) VALUES (?, ?, 'system', 'runner-assignment-service', 'runner.assignment.issued', 'runner_assignment', ?, ?, ?)").bind(auditId, input.workspaceId, assignmentId, canonical({ operationDigest, grantReference: input.grantReference, reason: input.reason, tokenStored: "hash_only" }), input.now),
    database.prepare("INSERT INTO runner_assignments (id, workspace_id, created_at, updated_at, revision, run_id, profile_id, configuration_id, configuration_digest, audience, token_hash, nonce_hash, instruction_version, tool_configuration_digest, quota_json, quota_digest, expires_at, status, authority_command_id, audit_event_id) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'issued', ?, ?)").bind(assignmentId, input.workspaceId, input.now, input.now, input.runId, input.profileId, input.configurationId, input.configurationDigest, input.audience, tokenHash, nonceHash, input.instructionVersion, input.toolConfigurationDigest, quotaJson, quotaDigest, input.expiresAt, commandId, auditId),
    database.prepare("UPDATE prospecting_runs SET execution_state = CASE WHEN execution_state = 'queued' THEN 'assigned' ELSE execution_state END, updated_at = ?, revision = revision + 1 WHERE id = ? AND workspace_id = ? AND execution_state IN ('queued','assigned','running')").bind(input.now, input.runId, input.workspaceId),
  ]);
  return { assignmentId, capability, replayed: false };
}

export async function revokeRunnerAssignment(database: D1Database, input: { workspaceId: string; assignmentId: string; reason: string; idempotencyKey: string; now: number }) {
  if (!input.reason || input.reason.length > 256 || !input.idempotencyKey) throw reject("Invalid runner revocation");
  const assignment = await database.prepare("SELECT id, status FROM runner_assignments WHERE id = ? AND workspace_id = ? LIMIT 1").bind(input.assignmentId, input.workspaceId).first<{ id: string; status: string }>();
  if (!assignment || assignment.status !== "issued") throw reject("Runner assignment is unavailable");
  const commandId = v7(); const auditId = v7(); const revocationId = v7(); const operationDigest = await sha256(canonical({ action: "runner.assignment.revoke", assignmentId: input.assignmentId, reason: input.reason }));
  await database.batch([
    database.prepare("INSERT INTO authority_commands (id, workspace_id, created_at, updated_at, revision, command_type, idempotency_key, operation_digest, expected_revision, subject_type, subject_id, status) VALUES (?, ?, ?, ?, 1, 'runner.assignment.revoke', ?, ?, 1, 'runner_assignment', ?, 'accepted')").bind(commandId, input.workspaceId, input.now, input.now, input.idempotencyKey, operationDigest, input.assignmentId),
    database.prepare("INSERT INTO audit_events (id, workspace_id, actor_type, actor_id, action, subject_type, subject_id, detail_json, created_at) VALUES (?, ?, 'system', 'runner-assignment-service', 'runner.assignment.revoked', 'runner_assignment', ?, ?, ?)").bind(auditId, input.workspaceId, input.assignmentId, canonical({ operationDigest, reason: input.reason }), input.now),
    database.prepare("INSERT INTO runner_assignment_revocations (id, workspace_id, assignment_id, reason, authority_command_id, audit_event_id, operation_digest, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(revocationId, input.workspaceId, input.assignmentId, input.reason, commandId, auditId, operationDigest, input.now),
    database.prepare("UPDATE runner_assignments SET status = 'revoked', updated_at = ?, revision = revision + 1 WHERE id = ? AND workspace_id = ? AND status = 'issued'").bind(input.now, input.assignmentId, input.workspaceId),
  ]);
}

export async function submitRunnerObservations(database: D1Database, input: SubmitInput) {
  const capability = await verifyCapability(input.capability, input.capabilitySecret);
  if (capability.expiresAt <= input.now) throw reject("Runner capability is expired");
  const assignment = await database.prepare("SELECT a.id, a.workspace_id, a.run_id, a.configuration_id, a.token_hash, a.nonce_hash, a.quota_json, a.expires_at, a.status FROM runner_assignments a JOIN prospecting_runs r ON r.id = a.run_id WHERE a.id = ? AND a.workspace_id = ? AND a.run_id = ? AND a.profile_id = ? AND a.configuration_id = ? AND r.execution_state IN ('assigned','running') LIMIT 1")
    .bind(capability.assignmentId, capability.workspaceId, capability.runId, capability.profileId, capability.configurationId).first<{ id: string; workspace_id: string; run_id: string; configuration_id: string; token_hash: string; nonce_hash: string; quota_json: string; expires_at: number; status: string }>();
  if (!assignment || assignment.status !== "issued" || assignment.expires_at <= input.now || assignment.token_hash !== await sha256(input.capability) || assignment.nonce_hash !== await sha256(capability.nonce)) throw reject("Runner capability is unavailable");
  const normalized = normalizeSubmission(input.payload, JSON.parse(assignment.quota_json) as Quotas);
  const submissionJson = canonical(normalized); const submissionDigest = await sha256(submissionJson); const provenanceJson = canonical(normalized.provenance); const provenanceDigest = await sha256(provenanceJson); const operationDigest = await sha256(canonical({ action: "runner.submission", assignmentId: assignment.id, submissionDigest, idempotencyKey: input.idempotencyKey }));
  const existing = await database.prepare("SELECT id, operation_digest FROM runner_submissions WHERE workspace_id = ? AND idempotency_key = ? LIMIT 1").bind(assignment.workspace_id, input.idempotencyKey).first<{ id: string; operation_digest: string }>();
  if (existing) { if (existing.operation_digest !== operationDigest) throw reject("Runner idempotency key conflicts"); return { submissionId: existing.id, replayed: true }; }
  const submissionId = v7();
  await database.prepare("INSERT INTO runner_submissions (id, workspace_id, run_id, assignment_id, configuration_id, submission_json, submission_digest, provenance_json, provenance_digest, status, operation_digest, idempotency_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'received', ?, ?, ?)")
    .bind(submissionId, assignment.workspace_id, assignment.run_id, assignment.id, assignment.configuration_id, submissionJson, submissionDigest, provenanceJson, provenanceDigest, operationDigest, input.idempotencyKey, input.now).run();
  return { submissionId, replayed: false };
}

export async function deliverRunnerAssignment(port: RunnerPort, assignment: RunnerAssignmentEnvelope) { await port.deliver(assignment); }

function normalizeSubmission(value: unknown, quotas: Quotas) {
  const input = record(value); rejectAuthorityFields(input);
  const findings = input.findings; const sources = input.sources;
  if (!Array.isArray(findings) || !Array.isArray(sources) || findings.length > quotas.maxFindings || sources.length > quotas.maxSources) throw reject("Runner submission exceeds assignment quotas");
  const normalizedSources = sources.map((source) => { const item = record(source); rejectAuthorityFields(item); return { url: url(item.url), retrievedAt: time(item.retrievedAt), excerpt: text(item.excerpt, 8192), publisher: text(item.publisher, 512) }; });
  const normalizedFindings = findings.map((finding) => { const item = record(finding); rejectAuthorityFields(item); return { kind: text(item.kind, 128), sourceUrl: url(item.sourceUrl), observedAt: time(item.observedAt), excerpt: text(item.excerpt, 8192) }; });
  const provenance = record(input.provenance); rejectAuthorityFields(provenance);
  const normalized = { schema: "runner-observations/v1", status: input.status === "partial" ? "partial" : "complete", findings: normalizedFindings, sources: normalizedSources, provenance: { provider: text(provenance.provider, 256), model: text(provenance.model, 256), instructionVersion: text(provenance.instructionVersion, 256), toolConfigurationDigest: digest(provenance.toolConfigurationDigest) } };
  if (new TextEncoder().encode(canonical(normalized)).byteLength > quotas.maxBytes) throw reject("Runner submission exceeds byte quota");
  return normalized;
}
function validateIssue(input: IssueInput) { if (!input.workspaceId || !input.runId || !input.profileId || !input.configurationId || !digestOk(input.configurationDigest) || !input.audience || !input.instructionVersion || !digestOk(input.toolConfigurationDigest) || !input.grantReference || !input.reason || !input.idempotencyKey || input.expiresAt <= input.now || !validQuotas(input.quotas) || input.capabilitySecret.byteLength < 16) throw reject("Invalid runner assignment"); }
function validQuotas(value: Quotas) { return [value.maxBytes, value.maxFindings, value.maxSources].every((part) => Number.isSafeInteger(part) && part > 0) && value.maxBytes <= 1_048_576 && value.maxFindings <= 500 && value.maxSources <= 500; }
function record(value: unknown): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) throw reject("Runner submission must be an object"); return value as Record<string, unknown>; }
function rejectAuthorityFields(value: Record<string, unknown>) { for (const key of ["workspaceId", "runId", "assignmentId", "configurationId", "tier", "outcome", "qualification", "review", "providerCredential", "grant", "budget", "token", "secret", "authorization", "terminalState"]) if (key in value) throw reject("Runner submission contains forbidden authority field"); }
function text(value: unknown, max: number) { if (typeof value !== "string" || !(value = value.normalize("NFC").trim()) || value.length > max) throw reject("Runner submission field is invalid"); return value; }
function url(value: unknown) { const parsed = new URL(text(value, 2048)); if (parsed.protocol !== "https:") throw reject("Runner source URL must use HTTPS"); return parsed.toString(); }
function time(value: unknown) { if (!Number.isSafeInteger(value) || (value as number) <= 0) throw reject("Runner timestamp is invalid"); return value as number; }
function digest(value: unknown) { const output = text(value, 64).toLowerCase(); if (!digestOk(output)) throw reject("Runner digest is invalid"); return output; }
function digestOk(value: unknown): value is string { return typeof value === "string" && /^[0-9a-f]{64}$/.test(value); }
function canonical(value: unknown): string { if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`; if (value && typeof value === "object") { const object = value as Record<string, unknown>; return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`).join(",")}}`; } return JSON.stringify(value); }
async function sha256(value: string) { const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)); return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join(""); }
function randomToken() { const bytes = crypto.getRandomValues(new Uint8Array(32)); return toBase64Url(bytes); }
async function signCapability(payload: Capability, secret: Uint8Array) { const body = toBase64Url(new TextEncoder().encode(canonical(payload))); const key = await crypto.subtle.importKey("raw", secret, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]); const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)); return `${body}.${toBase64Url(new Uint8Array(signature))}`; }
async function verifyCapability(token: string, secret: Uint8Array): Promise<Capability> { const [body, signature, extra] = token.split("."); if (!body || !signature || extra) throw reject("Runner capability is malformed"); const key = await crypto.subtle.importKey("raw", secret, { name: "HMAC", hash: "SHA-256" }, false, ["verify"]); if (!await crypto.subtle.verify("HMAC", key, fromBase64Url(signature), new TextEncoder().encode(body))) throw reject("Runner capability is invalid"); try { return JSON.parse(new TextDecoder().decode(fromBase64Url(body))) as Capability; } catch { throw reject("Runner capability is malformed"); } }
function toBase64Url(bytes: Uint8Array) { let value = ""; for (const byte of bytes) value += String.fromCharCode(byte); return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, ""); }
function fromBase64Url(value: string) { const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4); const decoded = atob(padded); return Uint8Array.from(decoded, (char) => char.charCodeAt(0)); }
function reject(message: string): RunnerAssignmentError { return new RunnerAssignmentError(message); }
