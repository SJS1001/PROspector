import { v7 } from "uuid";

export class ProspectReviewError extends Error { readonly code = "prospect_review_rejected"; }

export async function decideQualifiedProspect(database: D1Database, principal: { subject: string; legacySubject?: string }, input: { prospectId: string; decision: "approve" | "reject" | "defer"; reason?: string; reviewAt?: number; expectedRevision: number; idempotencyKey: string; now?: number }) {
  if (!input.reason?.trim()) throw fail("A review reason is required");
  if (input.decision === "defer" && (!Number.isSafeInteger(input.reviewAt) || input.reviewAt <= (input.now ?? Date.now()))) throw fail("A reasoned deferred review date is required");
  if (!Number.isInteger(input.expectedRevision) || !input.idempotencyKey) throw fail("Invalid review command");
  const prospect = await database.prepare("SELECT p.id, p.workspace_id, p.assessment_id, p.revision FROM profile_prospects p JOIN workspaces w ON w.id = p.workspace_id WHERE p.id = ? AND w.owner_subject IN (?, ?) LIMIT 1").bind(input.prospectId, principal.subject, principal.legacySubject ?? principal.subject).first<{ id: string; workspace_id: string; assessment_id: string; revision: number }>();
  if (!prospect || prospect.revision !== input.expectedRevision) throw fail("Qualified Prospect is unavailable or stale");
  const existing = await database.prepare("SELECT id FROM prospect_review_decisions WHERE workspace_id = ? AND idempotency_key = ? LIMIT 1").bind(prospect.workspace_id, input.idempotencyKey).first<{ id: string }>();
  if (existing) return { decisionId: existing.id, replayed: true };
  const now = input.now ?? Date.now(); const decisionId = v7(); const commandId = v7(); const auditId = v7(); const digest = await sha256(JSON.stringify({ prospectId: prospect.id, assessmentId: prospect.assessment_id, decision: input.decision, reason: input.reason.trim(), reviewAt: input.reviewAt ?? null, revision: prospect.revision }));
  const state = input.decision === "approve" ? "approved" : input.decision === "reject" ? "rejected" : "deferred";
  const statements = [
    database.prepare("INSERT INTO authority_commands (id, workspace_id, created_at, updated_at, revision, command_type, idempotency_key, operation_digest, expected_revision, subject_type, subject_id, status) VALUES (?, ?, ?, ?, 1, 'prospect.review', ?, ?, ?, 'profile_prospect', ?, 'accepted')").bind(commandId, prospect.workspace_id, now, now, input.idempotencyKey, digest, prospect.revision, prospect.id),
    database.prepare("INSERT INTO audit_events (id, workspace_id, actor_type, actor_id, action, subject_type, subject_id, detail_json, created_at) VALUES (?, ?, 'owner', ?, ?, 'profile_prospect', ?, ?, ?)").bind(auditId, prospect.workspace_id, principal.subject, `prospect.review.${input.decision}`, prospect.id, JSON.stringify({ assessmentId: prospect.assessment_id, digest }), now),
    database.prepare("INSERT INTO prospect_review_decisions (id, workspace_id, prospect_id, assessment_id, decision, reason, review_at, expected_prospect_revision, authority_command_id, audit_event_id, decision_digest, operation_digest, idempotency_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(decisionId, prospect.workspace_id, prospect.id, prospect.assessment_id, input.decision, input.reason.trim(), input.reviewAt ?? null, prospect.revision, commandId, auditId, digest, digest, input.idempotencyKey, now),
    database.prepare("UPDATE profile_prospects SET state = ?, updated_at = ?, revision = revision + 1 WHERE id = ? AND workspace_id = ? AND revision = ?").bind(state, now, prospect.id, prospect.workspace_id, prospect.revision),
  ];
  if (input.decision !== "approve") statements.push(database.prepare("INSERT INTO prospect_cooldowns (id, workspace_id, prospect_id, review_decision_id, assessment_id, reason, starts_at, ends_at, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)").bind(v7(), prospect.workspace_id, prospect.id, decisionId, prospect.assessment_id, input.reason.trim(), now, input.decision === "reject" ? now + 90 * 86400000 : input.reviewAt, now));
  await database.batch(statements); return { decisionId, replayed: false, state };
}
async function sha256(value: string) { const data = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)); return Array.from(new Uint8Array(data), b => b.toString(16).padStart(2, "0")).join(""); }
function fail(message: string) { return new ProspectReviewError(message); }
