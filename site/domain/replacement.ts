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
  eligibleProjectionId: string;
  eligibleProjectionDigest: string;
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
  const eligible = await eligibleCandidateByBinding(database, principal, input.eligibleProjectionId);
  if (eligible.candidate.eligibleProjectionDigest !== input.eligibleProjectionDigest || eligible.expectedOwnerRevision !== input.expectedOwnerRevision)
    throw new ReplacementConflictError("Eligible replacement projection changed; refresh the preview");
  const { current, proposed, active, impact, impactDigest, manifestJson, candidateDigest, driftProposalDigest } = eligible;
  const operationDigest = await sha256(stable({ action: "create_replacement_candidate", candidateDigest, eligibleProjectionId: input.eligibleProjectionId, eligibleProjectionDigest: input.eligibleProjectionDigest, expectedOwnerRevision: input.expectedOwnerRevision }));
  const prior = await database.prepare("SELECT id, operation_digest FROM authority_commands WHERE workspace_id = ? AND idempotency_key = ? LIMIT 1").bind(workspace.id, input.idempotencyKey).first<{ id: string; operation_digest: string }>();
  if (prior) {
    if (prior.operation_digest !== operationDigest) throw new ReplacementConflictError("Idempotency key was used for another candidate");
    return readCandidate(database, workspace.id, prior.id);
  }
  const existing = await database.prepare("SELECT id FROM replacement_candidates WHERE workspace_id = ? AND candidate_digest = ? LIMIT 1").bind(workspace.id, candidateDigest).first<{ id: string }>();
  if (existing) return readCandidateById(database, workspace.id, existing.id);
  const now = Date.now();
  const commandId = v7(); const driftId = v7(); const driftProposalId = v7(); const snapshotId = v7(); const configurationId = v7(); const candidateId = v7();
  try {
    await database.batch([
      database.prepare("INSERT INTO authority_commands (id, workspace_id, created_at, updated_at, revision, command_type, idempotency_key, operation_digest, expected_revision, subject_type, subject_id, status) SELECT ?, ?, ?, ?, 1, 'replacement.candidate', ?, ?, ?, 'replacement_candidate', ?, 'accepted' WHERE EXISTS (SELECT 1 FROM typed_configurations WHERE id = ? AND workspace_id = ? AND owner_type = ? AND owner_id = ? AND kind = ? AND active = 1 AND revision = ?)").bind(commandId, workspace.id, now, now, input.idempotencyKey, operationDigest, input.expectedOwnerRevision, candidateId, active.id, workspace.id, eligible.ownerType, eligible.ownerId, eligible.kind, input.expectedOwnerRevision),
      database.prepare(`INSERT INTO knowledge_proposals (id, workspace_id, created_at, updated_at, revision, company_id, source_id, excerpt_id, destination_scope_type, destination_scope_id, kind, value_json, provenance_json, proposal_digest, origin, status)
        SELECT ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'proposed'
        WHERE EXISTS (SELECT 1 FROM authority_commands WHERE id = ? AND workspace_id = ?)`).bind(driftProposalId, workspace.id, now, now, workspace.companyId, proposed.source_id, proposed.excerpt_id, proposed.destination_scope_type, proposed.destination_scope_id, proposed.kind, proposed.value_json, proposed.provenance_json, driftProposalDigest, proposed.origin, commandId, workspace.id),
      database.prepare("INSERT INTO knowledge_drifts (id, workspace_id, created_at, updated_at, revision, knowledge_item_id, current_version_id, proposed_version_id, proposal_id, risk_kind, dependency_digest, status) SELECT ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, 'open' WHERE EXISTS (SELECT 1 FROM knowledge_proposals WHERE id = ? AND workspace_id = ? AND status = 'proposed')").bind(driftId, workspace.id, now, now, current.knowledge_item_id, current.id, proposed.id, driftProposalId, eligible.riskKind, impactDigest, driftProposalId, workspace.id),
      database.prepare("INSERT INTO drift_impact_snapshots (id, workspace_id, drift_id, impact_json, impact_digest, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(snapshotId, workspace.id, driftId, impact.canonicalJson, impactDigest, now),
      database.prepare("INSERT INTO typed_configurations (id, workspace_id, created_at, updated_at, revision, company_id, owner_type, owner_id, kind, digest, manifest_json, active) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, 0)").bind(configurationId, workspace.id, now, now, workspace.companyId, eligible.ownerType, eligible.ownerId, eligible.kind, candidateDigest, manifestJson),
      ...eligible.dependencyKnowledgeVersionIds.map((knowledgeVersionId) => database.prepare("INSERT INTO configuration_knowledge_dependencies (configuration_id, knowledge_version_id, created_at) VALUES (?, ?, ?)").bind(configurationId, knowledgeVersionId, now)),
      database.prepare("INSERT INTO replacement_candidates (id, workspace_id, created_at, updated_at, revision, owner_type, owner_id, current_configuration_id, candidate_configuration_id, impact_snapshot_id, proposed_version_id, expected_owner_revision, candidate_digest, status) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, 'proposed')").bind(candidateId, workspace.id, now, now, eligible.ownerType, eligible.ownerId, active.id, configurationId, snapshotId, proposed.id, input.expectedOwnerRevision, candidateDigest),
      database.prepare("INSERT INTO audit_events (id, workspace_id, actor_type, actor_id, action, subject_type, subject_id, detail_json, created_at) VALUES (?, ?, 'owner', ?, 'replacement.candidate_created', 'replacement_candidate', ?, ?, ?)").bind(v7(), workspace.id, principal.subject, candidateId, stable({ driftId, driftProposalId, proposedVersionId: proposed.id, impactDigest, candidateDigest, expectedOwnerRevision: input.expectedOwnerRevision, status: REPLACEMENT_CANDIDATE_STATUS }), now),
    ]);
  } catch (error) {
    if (!isConstraint(error)) throw error;
    const retry = await database.prepare("SELECT id FROM replacement_candidates WHERE workspace_id = ? AND candidate_digest = ? LIMIT 1").bind(workspace.id, candidateDigest).first<{ id: string }>();
    if (!retry) throw new ReplacementConflictError("Replacement candidate conflicted; no partial candidate was accepted");
    return readCandidateById(database, workspace.id, retry.id);
  }
  return readCandidateById(database, workspace.id, candidateId);
}

export async function readEligibleReplacementCandidates(database: D1Database, principal: InterviewPrincipal) {
  const workspace = await ownedWorkspace(database, principal);
  const rows = await database.prepare("SELECT proposed.id AS proposedVersionId, proposed.value_json AS proposedValueJson, current.id AS currentVersionId, current.value_json AS currentValueJson, current.source_digest AS currentSourceDigest, current.knowledge_item_id AS currentKnowledgeItemId, current.value_digest AS currentValueDigest, proposed.value_digest AS proposedValueDigest, kp.source_id AS sourceId, kp.excerpt_id AS excerptId, kp.destination_scope_type AS destinationScopeType, kp.destination_scope_id AS destinationScopeId, kp.kind AS proposalKind, kp.value_json AS proposalValueJson, kp.provenance_json AS provenanceJson, kp.origin AS origin, config.id AS configurationId, config.digest AS configurationDigest, config.owner_type AS ownerType, config.owner_id AS ownerId, config.kind AS configurationKind, config.revision AS expectedOwnerRevision, config.manifest_json AS manifestJson, proposed.kind AS knowledgeKind FROM typed_configurations config JOIN configuration_knowledge_dependencies dep ON dep.configuration_id = config.id JOIN knowledge_versions current ON current.id = dep.knowledge_version_id AND current.workspace_id = config.workspace_id JOIN knowledge_versions proposed ON proposed.workspace_id = current.workspace_id AND proposed.id != current.id AND proposed.scope_type = current.scope_type AND proposed.scope_id = current.scope_id AND proposed.kind = current.kind JOIN knowledge_proposals kp ON kp.id = proposed.proposal_id AND kp.workspace_id = proposed.workspace_id WHERE config.workspace_id = ? AND config.active = 1 AND proposed.status = 'confirmed' ORDER BY proposed.created_at, proposed.id, config.id").bind(workspace.id).all<Record<string, unknown>>();
  return Promise.all(rows.results.map((row) => buildEligibleReplacementCandidate(database, workspace.id, row)));
}

async function eligibleCandidateByBinding(database: D1Database, principal: InterviewPrincipal, eligibleProjectionId: string) {
  if (!/^eligible:[^:]+:[^:]+:[^:]+$/.test(eligibleProjectionId)) throw new ReplacementConflictError("Eligible replacement projection is unavailable");
  const eligible = await readEligibleReplacementCandidates(database, principal);
  const exact = eligible.find((item) => item.id === eligibleProjectionId);
  if (!exact) throw new ReplacementConflictError("Eligible replacement projection changed; refresh the preview");
  return exact;
}

async function buildEligibleReplacementCandidate(database: D1Database, workspaceId: string, row: Record<string, unknown>) {
  const current = { id: requiredRowString(row, "currentVersionId"), knowledge_item_id: requiredRowString(row, "currentKnowledgeItemId"), source_digest: optionalRowString(row, "currentSourceDigest"), value_digest: requiredRowString(row, "currentValueDigest") };
  const proposed = { id: requiredRowString(row, "proposedVersionId"), value_digest: requiredRowString(row, "proposedValueDigest"), source_id: optionalRowString(row, "sourceId"), excerpt_id: optionalRowString(row, "excerptId"), destination_scope_type: requiredRowString(row, "destinationScopeType"), destination_scope_id: requiredRowString(row, "destinationScopeId"), kind: requiredRowString(row, "proposalKind"), value_json: requiredRowString(row, "proposalValueJson"), provenance_json: requiredRowString(row, "provenanceJson"), origin: requiredRowString(row, "origin") };
  const configurationId = requiredRowString(row, "configurationId");
  const ownerType = requiredEnum(row, "ownerType", ["product", "profile"] as const);
  const ownerId = requiredRowString(row, "ownerId");
  const kind = requiredEnum(row, "configurationKind", ["product_discovery", "profile_effective"] as const);
  const manifest = jsonObject(row.manifestJson);
  if (!manifest) throw new ReplacementConflictError("Eligible replacement configuration is malformed");
  const dependencyRows = await database.prepare("SELECT knowledge_version_id FROM configuration_knowledge_dependencies WHERE configuration_id = ? ORDER BY knowledge_version_id").bind(configurationId).all<{ knowledge_version_id: string }>();
  const artifactRows = await database.prepare("SELECT artifact_type, artifact_id FROM artifact_configuration_dependencies WHERE workspace_id = ? AND configuration_id = ? ORDER BY artifact_type, artifact_id").bind(workspaceId, configurationId).all<{ artifact_type: string; artifact_id: string }>();
  const dependencyEdges: DependencyEdge[] = [{ fromType: "version", fromId: current.id, toType: "configuration", toId: configurationId }, ...artifactRows.results.map((artifact) => ({ fromType: "configuration" as const, fromId: configurationId, toType: "artifact" as const, toId: artifact.artifact_id }))];
  const artifacts = artifactRows.results.map((artifact) => ({ artifactId: artifact.artifact_id, artifactType: artifact.artifact_type, status: "dependent" }));
  const riskKind = replacementRiskKind(requiredRowString(row, "knowledgeKind"));
  const impact = buildDriftImpact({ sourceId: current.source_digest ?? current.id, currentVersionId: current.id, proposedVersionId: proposed.id, riskKind, edges: dependencyEdges, artifacts });
  const impactDigest = await sha256(impact.canonicalJson);
  const manifestJson = stable(manifest);
  const candidateDigest = await sha256(stable({ currentConfigurationDigest: requiredRowString(row, "configurationDigest"), proposedVersionDigest: proposed.value_digest, impactDigest, manifestJson, ownerType, ownerId, kind }));
  const driftProposalDigest = await sha256(stable({ authority: "drift_review", currentVersionId: current.id, proposedVersionId: proposed.id, impactDigest, candidateDigest }));
  const expectedOwnerRevision = requiredRowRevision(row, "expectedOwnerRevision");
  const id = "eligible:" + current.id + ":" + proposed.id + ":" + configurationId;
  const dependencyKnowledgeVersionIds = [...new Set(dependencyRows.results.map((dependency) => dependency.knowledge_version_id === current.id ? proposed.id : dependency.knowledge_version_id))].sort();
  const candidate = { eligibleProjectionId: id, eligibleProjectionDigest: await sha256(stable({ id, currentVersionId: current.id, proposedVersionId: proposed.id, configurationId, ownerType, ownerId, kind, manifest, riskKind, dependencyEdges, artifacts, impactDigest, dependencyKnowledgeVersionIds, expectedOwnerRevision })), expectedOwnerRevision };
  return { id, current, proposed, currentVersionId: current.id, proposedVersionId: proposed.id, active: { id: configurationId, digest: requiredRowString(row, "configurationDigest"), revision: expectedOwnerRevision }, ownerType, ownerId, kind, manifestJson, riskKind, dependencyEdges, artifacts, impact, impactDigest, candidateDigest, driftProposalDigest, expectedOwnerRevision, dependencyKnowledgeVersionIds, candidate, currentValueJson: optionalRowString(row, "currentValueJson"), proposedValueJson: optionalRowString(row, "proposedValueJson"), provenanceJson: optionalRowString(row, "provenanceJson"), destinationScopeType: requiredRowString(row, "destinationScopeType"), destinationScopeId: requiredRowString(row, "destinationScopeId") };
}

export async function activateReplacement(database: D1Database, principal: InterviewPrincipal, input: ActivationInput) {
  validateKey(input.idempotencyKey); validateRevision(input.expectedOwnerRevision); validateRevision(input.expectedCandidateRevision);
  const workspace = await ownedWorkspace(database, principal);
  const candidate = await candidateRow(database, workspace.id, input.candidateId);
  if (candidate.revision !== input.expectedCandidateRevision) throw new ReplacementConflictError("Replacement candidate changed; refresh the preview");
  if (candidate.impact_digest !== input.impactDigest) throw new ReplacementConflictError("Exact preview digest is required for activation");
  if (candidate.expected_owner_revision !== input.expectedOwnerRevision) throw new ReplacementConflictError("Candidate owner revision changed; refresh the preview");
  const operationDigest = await sha256(stable({ action: "activate_replacement", candidateId: candidate.id, impactDigest: input.impactDigest, expectedOwnerRevision: input.expectedOwnerRevision, expectedCandidateRevision: input.expectedCandidateRevision }));
  const previous = await database.prepare("SELECT operation_digest FROM authority_commands WHERE workspace_id = ? AND idempotency_key = ? LIMIT 1").bind(workspace.id, input.idempotencyKey).first<{ operation_digest: string }>();
  if (previous) { if (previous.operation_digest !== operationDigest) throw new ReplacementConflictError("Idempotency key was used for another activation"); return readReplacementState(database, principal, candidate.id); }
  if (candidate.status === "activated") return readReplacementState(database, principal, candidate.id);
  if (candidate.status !== "proposed") throw new ReplacementConflictError("Replacement candidate is no longer eligible for activation");
  if (candidate.drift_status !== "resolved" || candidate.drift_decision !== "accept") throw new ReplacementConflictError("Owner must accept the exact open Drift review before activation");
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
async function version(database: D1Database, workspaceId: string, id: string, allowSuperseded: boolean) {
  const row = await database.prepare(`SELECT kv.id, kv.knowledge_item_id, kv.proposal_id, kv.source_digest, kv.value_digest,
      kp.source_id, kp.excerpt_id, kp.destination_scope_type, kp.destination_scope_id, kp.kind, kp.value_json, kp.provenance_json, kp.origin
    FROM knowledge_versions kv JOIN knowledge_proposals kp ON kp.id = kv.proposal_id AND kp.workspace_id = kv.workspace_id
    WHERE kv.id = ? AND kv.workspace_id = ? AND kv.status IN ('confirmed'${allowSuperseded ? ",'superseded'" : ""}) LIMIT 1`).bind(id, workspaceId).first<{ id: string; knowledge_item_id: string; proposal_id: string; source_digest: string | null; value_digest: string; source_id: string | null; excerpt_id: string | null; destination_scope_type: string; destination_scope_id: string; kind: string; value_json: string; provenance_json: string; origin: string }>();
  if (!row?.knowledge_item_id || !row.proposal_id || !row.value_digest) throw new ReplacementConflictError("Confirmed knowledge version with immutable lineage is required");
  return row;
}
async function candidateRow(database: D1Database, workspaceId: string, id: string) {
  const row = await database.prepare(`SELECT rc.id, rc.revision, rc.status, rc.owner_type, rc.owner_id,
      rc.current_configuration_id, rc.candidate_configuration_id, rc.proposed_version_id, rc.expected_owner_revision,
      ds.impact_digest, kd.status AS drift_status, pd.decision AS drift_decision, approved.id AS approved_version_id, tc.kind
    FROM replacement_candidates rc JOIN drift_impact_snapshots ds ON ds.id = rc.impact_snapshot_id
    JOIN knowledge_drifts kd ON kd.id = ds.drift_id
    LEFT JOIN proposal_decisions pd ON pd.proposal_id = kd.proposal_id AND pd.workspace_id = kd.workspace_id
    LEFT JOIN knowledge_versions approved ON approved.decision_id = pd.id AND approved.workspace_id = kd.workspace_id
    JOIN typed_configurations tc ON tc.id = rc.candidate_configuration_id
    WHERE rc.id = ? AND rc.workspace_id = ? LIMIT 1`).bind(id, workspaceId).first<{ id: string; revision: number; status: string; owner_type: "product" | "profile"; owner_id: string; current_configuration_id: string; candidate_configuration_id: string; impact_digest: string; proposed_version_id: string; expected_owner_revision: number; drift_status: string; drift_decision: string | null; approved_version_id: string | null; kind: "product_discovery" | "profile_effective" }>();
  if (!row) throw new ReplacementConflictError("Replacement candidate is unavailable");
  return row;
}
async function readCandidate(database: D1Database, workspaceId: string, commandId: string) { const row = await database.prepare("SELECT subject_id FROM authority_commands WHERE id = ? AND workspace_id = ? LIMIT 1").bind(commandId, workspaceId).first<{ subject_id: string }>(); if (!row) throw new ReplacementConflictError("Replacement command is unavailable"); return readCandidateById(database, workspaceId, row.subject_id); }
async function readCandidateById(database: D1Database, workspaceId: string, candidateId: string) { const row = await candidateRow(database, workspaceId, candidateId); return { id: row.id, revision: row.revision, status: row.status === "proposed" ? REPLACEMENT_CANDIDATE_STATUS : row.status, currentConfigurationId: row.current_configuration_id, candidateConfigurationId: row.candidate_configuration_id, impactDigest: row.impact_digest, proposedVersionId: row.approved_version_id ?? row.proposed_version_id, expectedOwnerRevision: row.expected_owner_revision, driftStatus: row.drift_status, immutable: true }; }
function validateKey(value: string) { if (!/^[a-f0-9-]{20,80}$/i.test(value)) throw new ReplacementConflictError("Invalid idempotency key"); }
function validateRevision(value: number) { if (!Number.isInteger(value) || value < 1) throw new ReplacementConflictError("Invalid expected revision"); }
function isConstraint(error: unknown) { return error instanceof Error && /unique|constraint/i.test(error.message); }
function requiredRowString(row: Record<string, unknown>, key: string) { const value = row[key]; if (typeof value !== "string" || !value) throw new ReplacementConflictError("Eligible replacement projection is unavailable"); return value; }
function optionalRowString(row: Record<string, unknown>, key: string) { return typeof row[key] === "string" ? row[key] : null; }
function requiredRowRevision(row: Record<string, unknown>, key: string) { const value = Number(row[key]); if (!Number.isInteger(value) || value < 1) throw new ReplacementConflictError("Eligible replacement projection is unavailable"); return value; }
function requiredEnum<const T extends readonly string[]>(row: Record<string, unknown>, key: string, accepted: T): T[number] { const value = requiredRowString(row, key); if (!accepted.includes(value)) throw new ReplacementConflictError("Eligible replacement projection is unavailable"); return value as T[number]; }
function jsonObject(value: unknown): Record<string, unknown> | null { if (typeof value !== "string") return null; try { const parsed = JSON.parse(value); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null; } catch { return null; } }
function replacementRiskKind(value: string) { return ["capability", "proof_point", "claim_guardrail", "offer", "suppression", "standard"].includes(value) ? value : "standard"; }
function stable(value: unknown): string { if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`; if (value && typeof value === "object") { const object = value as Record<string, unknown>; return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stable(object[key])}`).join(",")}}`; } return JSON.stringify(value); }
async function sha256(value: string) { const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)); return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join(""); }
