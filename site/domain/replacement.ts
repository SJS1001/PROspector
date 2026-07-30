import { v7 } from "uuid";

import { buildDriftImpact, type DependencyEdge } from "./drift";
import { initializeCommercialModel } from "./commercial-model";
import type { InterviewPrincipal } from "./interview";

export const REPLACEMENT_CANDIDATE_STATUS = "candidate_not_active";
export const ACTIVATION_REQUIRES_EXACT_IMPACT_DIGEST = true;

export class ReplacementConflictError extends Error {
  readonly code = "replacement_conflict";
}

type CandidateInput = {
  currentVersionId: string;
  proposedVersionId: string;
  ownerType: "product" | "profile";
  ownerId: string;
  kind: "product_discovery" | "profile_effective";
  manifest: unknown;
  riskKind: string;
  dependencyEdges: DependencyEdge[];
  artifacts?: Array<{ artifactId: string; artifactType?: string; status?: string }>;
  expectedOwnerRevision: number;
  idempotencyKey: string;
};

type ActivationInput = {
  candidateId: string;
  impactDigest: string;
  expectedOwnerRevision: number;
  expectedCandidateRevision: number;
  idempotencyKey: string;
};

export async function createReplacementCandidate(database: D1Database, principal: InterviewPrincipal, input: CandidateInput) {
  validateKey(input.idempotencyKey);
  validateRevision(input.expectedOwnerRevision);
  const workspace = await ownedWorkspace(database, principal);
  const current = await version(database, workspace.id, input.currentVersionId);
  const proposed = await version(database, workspace.id, input.proposedVersionId);
  const active = await database.prepare("SELECT id, digest, revision FROM typed_configurations WHERE workspace_id = ? AND owner_type = ? AND owner_id = ? AND kind = ? AND active = 1 LIMIT 1").bind(workspace.id, input.ownerType, input.ownerId, input.kind).first<{ id: string; digest: string; revision: number }>();
  if (!active) return { status: "no_replacement_required", authoritativeVersionId: proposed.id };
  if (active.revision !== input.expectedOwnerRevision) throw new ReplacementConflictError("Active configuration changed; refresh the preview");
  const impact = buildDriftImpact({ sourceId: current.source_digest ?? current.id, currentVersionId: current.id, proposedVersionId: proposed.id, riskKind: input.riskKind, edges: input.dependencyEdges, artifacts: input.artifacts });
  const impactDigest = await sha256(impact.canonicalJson);
  const manifestJson = stable(input.manifest);
  const candidateDigest = await sha256(stable({ currentConfigurationDigest: active.digest, proposedVersionDigest: proposed.value_digest, impactDigest, manifestJson, ownerType: input.ownerType, ownerId: input.ownerId, kind: input.kind }));
  const operationDigest = await sha256(stable({ action: "create_replacement_candidate", candidateDigest, expectedOwnerRevision: input.expectedOwnerRevision }));
  const prior = await database.prepare("SELECT id, operation_digest FROM authority_commands WHERE workspace_id = ? AND idempotency_key = ? LIMIT 1").bind(workspace.id, input.idempotencyKey).first<{ id: string; operation_digest: string }>();
  if (prior) {
    if (prior.operation_digest !== operationDigest) throw new ReplacementConflictError("Idempotency key was used for another candidate");
    return readCandidate(database, workspace.id, prior.id);
  }
  const existing = await database.prepare("SELECT id FROM replacement_candidates WHERE workspace_id = ? AND candidate_digest = ? LIMIT 1").bind(workspace.id, candidateDigest).first<{ id: string }>();
  if (existing) return readCandidateById(database, workspace.id, existing.id);
  const now = Date.now();
  const commandId = v7(); const driftId = v7(); const snapshotId = v7(); const configurationId = v7(); const candidateId = v7();
  try {
    await database.batch([
      database.prepare("INSERT INTO authority_commands (id, workspace_id, created_at, updated_at, revision, command_type, idempotency_key, operation_digest, expected_revision, subject_type, subject_id, status) SELECT ?, ?, ?, ?, 1, 'replacement.candidate', ?, ?, ?, 'typed_configuration', ?, 'accepted' WHERE EXISTS (SELECT 1 FROM typed_configurations WHERE id = ? AND workspace_id = ? AND owner_type = ? AND owner_id = ? AND kind = ? AND active = 1 AND revision = ?)").bind(commandId, workspace.id, now, now, input.idempotencyKey, operationDigest, input.expectedOwnerRevision, active.id, active.id, workspace.id, input.ownerType, input.ownerId, input.kind, input.expectedOwnerRevision),
      database.prepare("INSERT INTO knowledge_drifts (id, workspace_id, created_at, updated_at, revision, knowledge_item_id, current_version_id, proposal_id, risk_kind, dependency_digest, status) SELECT ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, 'reviewed' WHERE EXISTS (SELECT 1 FROM authority_commands WHERE id = ? AND workspace_id = ?)").bind(driftId, workspace.id, now, now, current.knowledge_item_id, current.id, proposed.proposal_id, input.riskKind, impactDigest, commandId, workspace.id),
      database.prepare("INSERT INTO drift_impact_snapshots (id, workspace_id, drift_id, impact_json, impact_digest, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(snapshotId, workspace.id, driftId, impact.canonicalJson, impactDigest, now),
      database.prepare("INSERT INTO typed_configurations (id, workspace_id, created_at, updated_at, revision, company_id, owner_type, owner_id, kind, digest, manifest_json, active) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, 0)").bind(configurationId, workspace.id, now, now, workspace.companyId, input.ownerType, input.ownerId, input.kind, candidateDigest, manifestJson),
      ...[...new Set(input.dependencyEdges.filter((edge) => edge.toType === "configuration" && edge.toId === active.id).map((edge) => edge.fromId))].sort().map((knowledgeVersionId) => database.prepare("INSERT INTO configuration_knowledge_dependencies (configuration_id, knowledge_version_id, created_at) VALUES (?, ?, ?)").bind(configurationId, knowledgeVersionId, now)),
      database.prepare("INSERT INTO replacement_candidates (id, workspace_id, created_at, updated_at, revision, owner_type, owner_id, current_configuration_id, candidate_configuration_id, impact_snapshot_id, candidate_digest, status) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, 'proposed')").bind(candidateId, workspace.id, now, now, input.ownerType, input.ownerId, active.id, configurationId, snapshotId, candidateDigest),
      database.prepare("INSERT INTO audit_events (id, workspace_id, actor_type, actor_id, action, subject_type, subject_id, detail_json, created_at) VALUES (?, ?, 'owner', ?, 'replacement.candidate_created', 'replacement_candidate', ?, ?, ?)").bind(v7(), workspace.id, principal.subject, candidateId, stable({ impactDigest, candidateDigest, status: REPLACEMENT_CANDIDATE_STATUS }), now),
    ]);
  } catch (error) {
    if (!isConstraint(error)) throw error;
    const retry = await database.prepare("SELECT id FROM replacement_candidates WHERE workspace_id = ? AND candidate_digest = ? LIMIT 1").bind(workspace.id, candidateDigest).first<{ id: string }>();
    if (!retry) throw new ReplacementConflictError("Replacement candidate conflicted; no partial candidate was accepted");
    return readCandidateById(database, workspace.id, retry.id);
  }
  return readCandidateById(database, workspace.id, candidateId);
}

export async function activateReplacement(database: D1Database, principal: InterviewPrincipal, input: ActivationInput) {
  validateKey(input.idempotencyKey); validateRevision(input.expectedOwnerRevision); validateRevision(input.expectedCandidateRevision);
  const workspace = await ownedWorkspace(database, principal);
  const candidate = await candidateRow(database, workspace.id, input.candidateId);
  if (candidate.revision !== input.expectedCandidateRevision) throw new ReplacementConflictError("Replacement candidate changed; refresh the preview");
  if (candidate.impact_digest !== input.impactDigest) throw new ReplacementConflictError("Exact preview digest is required for activation");
  const operationDigest = await sha256(stable({ action: "activate_replacement", candidateId: candidate.id, impactDigest: input.impactDigest, expectedOwnerRevision: input.expectedOwnerRevision, expectedCandidateRevision: input.expectedCandidateRevision }));
  const previous = await database.prepare("SELECT operation_digest FROM authority_commands WHERE workspace_id = ? AND idempotency_key = ? LIMIT 1").bind(workspace.id, input.idempotencyKey).first<{ operation_digest: string }>();
  if (previous) { if (previous.operation_digest !== operationDigest) throw new ReplacementConflictError("Idempotency key was used for another activation"); return readReplacementState(database, principal, candidate.id); }
  if (candidate.status === "activated") return readReplacementState(database, principal, candidate.id);
  const active = await database.prepare("SELECT id, revision FROM typed_configurations WHERE workspace_id = ? AND owner_type = ? AND owner_id = ? AND kind = ? AND active = 1 LIMIT 1").bind(workspace.id, candidate.owner_type, candidate.owner_id, candidate.kind).first<{ id: string; revision: number }>();
  if (!active) return { status: "no_replacement_required", authoritativeVersionId: candidate.proposed_version_id };
  if (active.id !== candidate.current_configuration_id || active.revision !== input.expectedOwnerRevision) throw new ReplacementConflictError("Current configuration changed; refresh the preview");
  const now = Date.now(); const commandId = v7(); const activationId = v7();
  try {
    await database.batch([
      database.prepare("INSERT INTO authority_commands (id, workspace_id, created_at, updated_at, revision, command_type, idempotency_key, operation_digest, expected_revision, subject_type, subject_id, status) VALUES (?, ?, ?, ?, 1, 'replacement.activate', ?, ?, ?, 'replacement_candidate', ?, 'accepted')").bind(commandId, workspace.id, now, now, input.idempotencyKey, operationDigest, input.expectedOwnerRevision, candidate.id),
      database.prepare("UPDATE typed_configurations SET active = 0, updated_at = ?, revision = revision + 1 WHERE id = ? AND workspace_id = ? AND active = 1 AND revision = ?").bind(now, active.id, workspace.id, input.expectedOwnerRevision),
      database.prepare("UPDATE typed_configurations SET active = 1, updated_at = ?, revision = revision + 1 WHERE id = ? AND workspace_id = ? AND active = 0").bind(now, candidate.candidate_configuration_id, workspace.id),
      database.prepare("UPDATE replacement_candidates SET status = 'activated', updated_at = ?, revision = revision + 1 WHERE id = ? AND workspace_id = ? AND status = 'proposed' AND revision = ?").bind(now, candidate.id, workspace.id, input.expectedCandidateRevision),
      database.prepare("INSERT INTO configuration_activations (id, workspace_id, created_at, updated_at, revision, replacement_candidate_id, authority_command_id, previous_configuration_id, next_configuration_id, expected_owner_revision, operation_digest) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)").bind(activationId, workspace.id, now, now, candidate.id, commandId, active.id, candidate.candidate_configuration_id, input.expectedOwnerRevision, operationDigest),
      database.prepare("INSERT INTO audit_events (id, workspace_id, actor_type, actor_id, action, subject_type, subject_id, detail_json, created_at) VALUES (?, ?, 'owner', ?, 'replacement.activation_containment_directive', 'replacement_candidate', ?, ?, ?)").bind(v7(), workspace.id, principal.subject, candidate.id, stable({ impactDigest: input.impactDigest, directivesOnly: true, operationalEffects: "disabled" }), now),
      database.prepare("INSERT INTO audit_events (id, workspace_id, actor_type, actor_id, action, subject_type, subject_id, detail_json, created_at) VALUES (?, ?, 'owner', ?, 'replacement.activated', 'replacement_candidate', ?, ?, ?)").bind(v7(), workspace.id, principal.subject, candidate.id, stable({ activationId, previousConfigurationId: active.id, nextConfigurationId: candidate.candidate_configuration_id }), now),
    ]);
  } catch (error) {
    if (!isConstraint(error)) throw error;
    const won = await database.prepare("SELECT id FROM configuration_activations WHERE replacement_candidate_id = ? LIMIT 1").bind(candidate.id).first<{ id: string }>();
    if (!won) throw new ReplacementConflictError("Another activation won; reload the replacement state");
  }
  return readReplacementState(database, principal, candidate.id);
}

export async function readReplacementState(database: D1Database, principal: InterviewPrincipal, candidateId: string) {
  const workspace = await ownedWorkspace(database, principal);
  return readCandidateById(database, workspace.id, candidateId);
}

async function ownedWorkspace(database: D1Database, principal: InterviewPrincipal) {
  const key = (await sha256(`replacement-bootstrap:${principal.subject}`)).slice(0, 32);
  await initializeCommercialModel(database, principal, { idempotencyKey: key });
  const row = await database.prepare("SELECT w.id, c.id AS company_id FROM workspaces w JOIN companies c ON c.workspace_id = w.id WHERE w.owner_subject IN (?, ?) ORDER BY CASE w.owner_subject WHEN ? THEN 0 ELSE 1 END LIMIT 1").bind(principal.subject, principal.legacySubject, principal.subject).first<{ id: string; company_id: string }>();
  if (!row) throw new ReplacementConflictError("Commercial workspace is unavailable");
  return { id: row.id, companyId: row.company_id };
}
async function version(database: D1Database, workspaceId: string, id: string) {
  const row = await database.prepare("SELECT id, knowledge_item_id, proposal_id, source_digest, value_digest FROM knowledge_versions WHERE id = ? AND workspace_id = ? AND status = 'confirmed' LIMIT 1").bind(id, workspaceId).first<{ id: string; knowledge_item_id: string; proposal_id: string; source_digest: string | null; value_digest: string }>();
  if (!row?.knowledge_item_id || !row.proposal_id || !row.value_digest) throw new ReplacementConflictError("Confirmed knowledge version with immutable lineage is required");
  return row;
}
async function candidateRow(database: D1Database, workspaceId: string, id: string) {
  const row = await database.prepare("SELECT rc.id, rc.revision, rc.status, rc.owner_type, rc.owner_id, rc.current_configuration_id, rc.candidate_configuration_id, ds.impact_digest, kd.current_version_id AS proposed_version_id, tc.kind FROM replacement_candidates rc JOIN drift_impact_snapshots ds ON ds.id = rc.impact_snapshot_id JOIN knowledge_drifts kd ON kd.id = ds.drift_id JOIN typed_configurations tc ON tc.id = rc.candidate_configuration_id WHERE rc.id = ? AND rc.workspace_id = ? LIMIT 1").bind(id, workspaceId).first<{ id: string; revision: number; status: string; owner_type: "product" | "profile"; owner_id: string; current_configuration_id: string; candidate_configuration_id: string; impact_digest: string; proposed_version_id: string; kind: "product_discovery" | "profile_effective" }>();
  if (!row) throw new ReplacementConflictError("Replacement candidate is unavailable");
  return row;
}
async function readCandidate(database: D1Database, workspaceId: string, commandId: string) { const row = await database.prepare("SELECT subject_id FROM authority_commands WHERE id = ? AND workspace_id = ? LIMIT 1").bind(commandId, workspaceId).first<{ subject_id: string }>(); if (!row) throw new ReplacementConflictError("Replacement command is unavailable"); return readCandidateById(database, workspaceId, row.subject_id); }
async function readCandidateById(database: D1Database, workspaceId: string, candidateId: string) { const row = await candidateRow(database, workspaceId, candidateId); return { id: row.id, revision: row.revision, status: row.status === "proposed" ? REPLACEMENT_CANDIDATE_STATUS : row.status, currentConfigurationId: row.current_configuration_id, candidateConfigurationId: row.candidate_configuration_id, impactDigest: row.impact_digest, proposedVersionId: row.proposed_version_id, immutable: true }; }
function validateKey(value: string) { if (!/^[a-f0-9-]{20,80}$/i.test(value)) throw new ReplacementConflictError("Invalid idempotency key"); }
function validateRevision(value: number) { if (!Number.isInteger(value) || value < 1) throw new ReplacementConflictError("Invalid expected revision"); }
function isConstraint(error: unknown) { return error instanceof Error && /unique|constraint/i.test(error.message); }
function stable(value: unknown): string { if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`; if (value && typeof value === "object") { const object = value as Record<string, unknown>; return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stable(object[key])}`).join(",")}}`; } return JSON.stringify(value); }
async function sha256(value: string) { const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)); return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join(""); }
