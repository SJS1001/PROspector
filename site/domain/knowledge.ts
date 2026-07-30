import { v7 } from "uuid";

import { initializeCommercialModel } from "./commercial-model";
import type { InterviewPrincipal } from "./interview";

export class KnowledgeConflictError extends Error {
  readonly code = "knowledge_conflict";
}

export type TrustedKnowledgeOrigin = "owner_edit" | "repository_research" | "plain_text_import" | "same_company_reuse" | "same_product_reuse" | "allowlisted_package" | "quarantined_upload";
type AcceptedOrigin = TrustedKnowledgeOrigin | "import";
type Destination = { scopeType: "company" | "product" | "market_play" | "customer_profile" | "offer"; id?: string; locator?: string; companyId?: string };

export async function createKnowledgeProposal(database: D1Database, principal: InterviewPrincipal, input: ProposalInput) {
  const origin = validateOrigin(input.origin);
  validateKey(input.idempotencyKey);
  const workspace = await workspaceForKnowledge(database, principal);
  const destination = await resolveDestination(database, workspace.id, input.destination);
  const submittedValue = validateValue(input.value);
  const provenance = validateProvenance(input.source, input.privacy, input.license, input.reuseEligibility);
  const quarantineDigest = origin === "quarantined_upload" ? await sha256(submittedValue.excerpt) : null;
  const value = quarantineDigest ? { quarantined: true, contentDigest: quarantineDigest } : submittedValue;
  const snapshot = orderedSnapshot({ origin, destination, kind: bounded(input.kind, 120, "knowledge kind"), value, provenance, prerequisites: [] as unknown[], idempotencyKey: input.idempotencyKey });
  const proposalDigest = await sha256(snapshot);
  const existing = await database.prepare("SELECT id FROM knowledge_proposals WHERE workspace_id = ? AND proposal_digest = ? LIMIT 1").bind(workspace.id, proposalDigest).first<{ id: string }>();
  if (existing) return proposalById(database, workspace.id, existing.id);
  const now = Date.now(); const proposalId = v7(); const sourceId = v7(); const excerptId = v7();
  const sourceDigest = await sha256(orderedSnapshot({ proposalDigest, provenance, idempotencyKey: input.idempotencyKey }));
  const sourceStatus = origin === "quarantined_upload" ? "quarantined" : "available";
  try {
    await database.batch([
      database.prepare("INSERT INTO sources (id, workspace_id, created_at, updated_at, revision, origin, opaque_locator, source_digest, privacy, license, status) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)").bind(sourceId, workspace.id, now, now, sourceOrigin(origin), `${provenance.reference}#${proposalDigest}`, sourceDigest, provenance.privacy, JSON.stringify(provenance.license), sourceStatus),
      database.prepare("INSERT INTO source_excerpts (id, workspace_id, created_at, updated_at, revision, source_id, excerpt_digest, content, locator) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?)").bind(excerptId, workspace.id, now, now, sourceId, quarantineDigest ?? await sha256(submittedValue.excerpt), quarantineDigest ? "" : submittedValue.excerpt, quarantineDigest ? `quarantine:${sourceId}` : provenance.reference),
      database.prepare("INSERT INTO knowledge_proposals (id, workspace_id, created_at, updated_at, revision, company_id, source_id, excerpt_id, destination_scope_type, destination_scope_id, kind, value_json, provenance_json, proposal_digest, origin, status) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'proposed')").bind(proposalId, workspace.id, now, now, workspace.companyId, sourceId, excerptId, destination.scopeType, destination.id, input.kind, JSON.stringify(value), JSON.stringify(provenance), proposalDigest, origin),
      ...(origin === "quarantined_upload" ? [database.prepare("INSERT INTO source_custody (id, workspace_id, created_at, updated_at, revision, source_id, object_reference, quarantine_status, scan_status, object_digest) VALUES (?, ?, ?, ?, 1, ?, ?, 'quarantined', 'not_scanned', ?)").bind(v7(), workspace.id, now, now, sourceId, provenance.reference, quarantineDigest)] : []),
      ...(origin === "repository_research" ? [database.prepare("INSERT INTO research_candidates (id, workspace_id, created_at, updated_at, revision, source_id, excerpt_id, opaque_locator, provenance_digest, visibility, status) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, 'public', 'available')").bind(v7(), workspace.id, now, now, sourceId, excerptId, provenance.reference, sourceDigest)] : []),
      database.prepare("INSERT INTO audit_events (id, workspace_id, actor_type, actor_id, action, subject_type, subject_id, detail_json, created_at) VALUES (?, ?, 'owner', ?, 'knowledge.proposed', 'knowledge_proposal', ?, ?, ?)").bind(v7(), workspace.id, principal.subject, proposalId, JSON.stringify({ proposalDigest, origin }), now),
    ]);
  } catch (error) {
    if (!isConstraint(error)) throw error;
    const retry = await database.prepare("SELECT id FROM knowledge_proposals WHERE workspace_id = ? AND proposal_digest = ? LIMIT 1").bind(workspace.id, proposalDigest).first<{ id: string }>();
    if (!retry) throw new KnowledgeConflictError("Knowledge proposal did not converge");
    return proposalById(database, workspace.id, retry.id);
  }
  return proposalById(database, workspace.id, proposalId);
}

export async function proposeOwnerEdit(database: D1Database, principal: InterviewPrincipal, input: Omit<ProposalInput, "origin">) { return createKnowledgeProposal(database, principal, { ...input, origin: "owner_edit" }); }
export async function proposeRepositoryResearch(database: D1Database, principal: InterviewPrincipal, input: Omit<ProposalInput, "origin">) { validateResearchUrl(input.source.reference); return createKnowledgeProposal(database, principal, { ...input, origin: "repository_research" }); }
export async function importPlainText(database: D1Database, principal: InterviewPrincipal, input: Omit<ProposalInput, "origin">) { validatePlainText(input.value.excerpt); return createKnowledgeProposal(database, principal, { ...input, origin: "plain_text_import" }); }
export async function proposeReuse(database: D1Database, principal: InterviewPrincipal, input: Omit<ProposalInput, "origin">) { return createKnowledgeProposal(database, principal, { ...input, origin: "same_company_reuse" }); }
export async function proposeAllowlistedPackage(database: D1Database, principal: InterviewPrincipal, input: Omit<ProposalInput, "origin">) { if (input.reuseEligibility !== "allowlisted_package") throw new KnowledgeConflictError("Package intake requires a positive allowlist"); return createKnowledgeProposal(database, principal, { ...input, origin: "allowlisted_package" }); }

export async function reviewKnowledgeProposal(database: D1Database, principal: InterviewPrincipal, input: ReviewInput) {
  const prepared = await prepareKnowledgeReview(database, principal, input);
  if (prepared.existingDecisionId) return decisionById(database, prepared.workspace.id, prepared.existingDecisionId);
  try { await database.batch(prepared.statements); } catch (error) {
    if (!isConstraint(error)) throw error;
    const retry = await database.prepare("SELECT id, operation_digest FROM proposal_decisions WHERE workspace_id = ? AND idempotency_key = ? LIMIT 1").bind(prepared.workspace.id, input.idempotencyKey).first<{ id: string; operation_digest: string }>();
    if (retry?.operation_digest === prepared.operationDigest) return decisionById(database, prepared.workspace.id, retry.id);
    throw new KnowledgeConflictError("Knowledge review conflicted");
  }
  return decisionById(database, prepared.workspace.id, prepared.decisionId, input.predecessorVersionId ?? null);
}

export async function prepareKnowledgeReview(database: D1Database, principal: InterviewPrincipal, input: ReviewInput, guard?: InterviewReviewGuard) {
  validateKey(input.idempotencyKey);
  if (!["accept", "reject", "correct", "rescope"].includes(input.decision)) throw new KnowledgeConflictError("Unknown knowledge decision");
  const workspace = await workspaceForKnowledge(database, principal);
  const proposal = await proposalRow(database, workspace.id, input.proposalId);
  if (proposal.origin === "quarantined_upload") throw new KnowledgeConflictError("Quarantined upload is not reviewable until scanning exists");
  const target = input.decision === "rescope" ? await resolveDestination(database, workspace.id, required(input.destination, "Rescope destination")) : { id: proposal.destination_scope_id, scopeType: proposal.destination_scope_type };
  const value = input.decision === "correct" ? validateValue(required(input.correction, "Corrected value")) : JSON.parse(proposal.value_json);
  const operationDigest = await sha256(orderedSnapshot({ proposalDigest: proposal.proposal_digest, decision: input.decision, target, value, predecessorVersionId: input.predecessorVersionId ?? null, expectedRevision: input.expectedRevision }));
  const prior = await database.prepare("SELECT id, operation_digest FROM proposal_decisions WHERE workspace_id = ? AND idempotency_key = ? LIMIT 1").bind(workspace.id, input.idempotencyKey).first<{ id: string; operation_digest: string }>();
  if (prior) {
    if (prior.operation_digest !== operationDigest) throw new KnowledgeConflictError("Idempotency key was reused for another review");
    return { existingDecisionId: prior.id, workspace, operationDigest, statements: [] as D1PreparedStatement[] };
  }
  if (proposal.revision !== input.expectedRevision) throw new KnowledgeConflictError("Stale proposal revision");
  const now = Date.now(); const commandId = v7(); const decisionId = v7(); const auditId = v7(); const versionId = input.decision === "reject" ? null : v7(); const itemId = input.decision === "reject" ? null : v7();
  const command = guard
    ? database.prepare(`INSERT INTO authority_commands (id, workspace_id, created_at, updated_at, revision, command_type, idempotency_key, operation_digest, expected_revision, subject_type, subject_id, status)
        SELECT ?, ?, ?, ?, 1, 'knowledge.review', ?, ?, ?, 'knowledge_proposal', ?, 'accepted'
        WHERE EXISTS (SELECT 1 FROM knowledge_proposals kp
          JOIN interview_answers ans ON ans.id = ? AND ans.workspace_id = kp.workspace_id
          JOIN interview_sessions s ON s.id = ? AND s.workspace_id = kp.workspace_id AND s.state = 'awaiting_confirmation' AND s.revision = ?
          JOIN interview_questions q ON q.id = ? AND q.workspace_id = kp.workspace_id AND q.status = 'answered' AND q.revision = ?
          WHERE kp.id = ? AND kp.workspace_id = ? AND kp.revision = ? AND kp.status = 'proposed'
            AND ans.session_id = s.id AND ans.question_id = q.id)`)
      .bind(commandId, workspace.id, now, now, input.idempotencyKey, operationDigest, input.expectedRevision, proposal.id, guard.answerId, guard.sessionId, guard.sessionRevision, guard.questionId, guard.questionRevision, proposal.id, workspace.id, input.expectedRevision)
    : database.prepare("INSERT INTO authority_commands (id, workspace_id, created_at, updated_at, revision, command_type, idempotency_key, operation_digest, expected_revision, subject_type, subject_id, status) SELECT ?, ?, ?, ?, 1, 'knowledge.review', ?, ?, ?, 'knowledge_proposal', ?, 'accepted' WHERE EXISTS (SELECT 1 FROM knowledge_proposals WHERE id = ? AND workspace_id = ? AND revision = ? AND status = 'proposed')").bind(commandId, workspace.id, now, now, input.idempotencyKey, operationDigest, input.expectedRevision, proposal.id, proposal.id, workspace.id, input.expectedRevision);
  const statements: D1PreparedStatement[] = [
    command,
    database.prepare("INSERT INTO proposal_decisions (id, workspace_id, created_at, updated_at, revision, proposal_id, answer_id, authority_command_id, decision, reviewed_snapshot_digest, operation_digest, idempotency_key) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?)").bind(decisionId, workspace.id, now, now, proposal.id, guard?.answerId ?? null, commandId, input.decision, proposal.proposal_digest, operationDigest, input.idempotencyKey),
  ];
  if (versionId && itemId) {
    const digest = await sha256(orderedSnapshot(value));
    statements.push(
      database.prepare("INSERT INTO knowledge_items (id, workspace_id, created_at, updated_at, revision, company_id, scope_type, scope_id, kind, slot, current_version_id) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, NULL)").bind(itemId, workspace.id, now, now, workspace.companyId, target.scopeType, target.id, proposal.kind, `${proposal.id}:${decisionId}`),
      database.prepare("INSERT INTO knowledge_versions (id, workspace_id, created_at, updated_at, revision, knowledge_item_id, proposal_id, decision_id, authority_command_id, scope_type, scope_id, kind, value_json, value_digest, status, source_digest) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', ?)").bind(versionId, workspace.id, now, now, itemId, proposal.id, decisionId, commandId, target.scopeType, target.id, proposal.kind, JSON.stringify(value), digest, proposal.proposal_digest),
      database.prepare("UPDATE knowledge_items SET current_version_id = ?, updated_at = ?, revision = revision + 1 WHERE id = ? AND workspace_id = ?").bind(versionId, now, itemId, workspace.id),
    );
  }
  statements.push(
    database.prepare("UPDATE knowledge_proposals SET status = ?, updated_at = ?, revision = revision + 1 WHERE id = ? AND workspace_id = ? AND revision = ?").bind(input.decision === "reject" ? "rejected" : "reviewed", now, proposal.id, workspace.id, input.expectedRevision),
    database.prepare("INSERT INTO audit_events (id, workspace_id, actor_type, actor_id, action, subject_type, subject_id, detail_json, created_at) VALUES (?, ?, 'owner', ?, ?, 'knowledge_proposal', ?, ?, ?)").bind(auditId, workspace.id, principal.subject, `knowledge.${input.decision}`, proposal.id, JSON.stringify({ decisionId, versionId, predecessorVersionId: input.predecessorVersionId ?? null }), now),
  );
  return { workspace, proposal, target, value, operationDigest, commandId, decisionId, auditId, versionId, itemId, now, statements };
}

export async function readKnowledgeLibrary(database: D1Database, principal: InterviewPrincipal) { return listKnowledge(database, principal, {}); }
export async function listKnowledge(database: D1Database, principal: InterviewPrincipal, filters: { destination?: Destination }) { const workspace = await workspaceForKnowledge(database, principal); let scopeId: string | undefined; if (filters.destination) scopeId = (await resolveDestination(database, workspace.id, filters.destination)).id; const proposals = await database.prepare(`SELECT id FROM knowledge_proposals WHERE workspace_id = ?${scopeId ? " AND destination_scope_id = ?" : ""} ORDER BY created_at`).bind(...(scopeId ? [workspace.id, scopeId] : [workspace.id])).all<{ id: string }>(); const versions = await database.prepare(`SELECT id FROM knowledge_versions WHERE workspace_id = ?${scopeId ? " AND scope_id = ?" : ""} ORDER BY created_at`).bind(...(scopeId ? [workspace.id, scopeId] : [workspace.id])).all<{ id: string }>(); return [...await Promise.all(proposals.results.map((row) => proposalById(database, workspace.id, row.id))), ...await Promise.all(versions.results.map((row) => versionById(database, workspace.id, row.id)))] as Array<Record<string, unknown>>; }
export async function readKnowledgeContent(database: D1Database, principal: InterviewPrincipal, id: string) { await workspaceForKnowledge(database, principal); const proposal = await database.prepare("SELECT kp.origin FROM knowledge_proposals kp WHERE kp.id = ? LIMIT 1").bind(id).first<{ origin: string }>(); if (proposal?.origin === "quarantined_upload") throw new KnowledgeConflictError("Quarantined content cannot be read before scanning"); throw new KnowledgeConflictError("Knowledge content is not exposed by this authority module"); }
export async function renderKnowledgeContent(database: D1Database, principal: InterviewPrincipal, id: string) { return readKnowledgeContent(database, principal, id); }
export async function reuseKnowledge(database: D1Database, principal: InterviewPrincipal, input: { sourceVersionId: string; destination: Destination; category: string; idempotencyKey: string }) { if (["contacts", "prospects", "outreach", "suppression", "secrets", "unapproved_private_source"].includes(input.category) || input.destination.companyId) throw new KnowledgeConflictError("Cross-company reuse requires allowlist and excludes private operational categories"); const workspace = await workspaceForKnowledge(database, principal); const source = await database.prepare("SELECT value_json, kind, source_digest FROM knowledge_versions WHERE id = ? AND workspace_id = ? AND status = 'confirmed' LIMIT 1").bind(input.sourceVersionId, workspace.id).first<{ value_json: string; kind: string; source_digest: string }>(); if (!source) throw new KnowledgeConflictError("Confirmed same-company source version is required"); const proposal = await createKnowledgeProposal(database, principal, { origin: "same_company_reuse", destination: input.destination, kind: source.kind, value: JSON.parse(source.value_json), source: { reference: `reuse:${input.sourceVersionId}`, custody: "same-company confirmed knowledge", retrievedAt: Date.now() }, privacy: "private", license: { use: "internal_review_only" }, reuseEligibility: "company_only", idempotencyKey: input.idempotencyKey }); return { ...proposal, reuseOrder: ["same_company", "same_product", "allowlisted_package"] }; }

type ProposalInput = { origin: AcceptedOrigin; destination: Destination; kind: string; value: { excerpt: string }; source: { reference: string; custody: string; retrievedAt: number }; privacy: "public" | "private" | "restricted"; license: { use: string }; reuseEligibility: string; idempotencyKey: string };
type ReviewInput = { proposalId: string; decision: "accept" | "reject" | "correct" | "rescope"; correction?: { excerpt: string }; destination?: Destination; predecessorVersionId?: string; expectedRevision: number; idempotencyKey: string };
type InterviewReviewGuard = { answerId: string; sessionId: string; questionId: string; sessionRevision: number; questionRevision: number };
async function workspaceForKnowledge(database: D1Database, principal: InterviewPrincipal) { const key = (await sha256(`knowledge-bootstrap:${principal.subject}`)).slice(0, 32); await initializeCommercialModel(database, principal, { idempotencyKey: key }); const row = await database.prepare("SELECT w.id, c.id AS company_id FROM workspaces w JOIN companies c ON c.workspace_id = w.id WHERE w.owner_subject IN (?, ?) ORDER BY CASE w.owner_subject WHEN ? THEN 0 ELSE 1 END LIMIT 1").bind(principal.subject, principal.legacySubject, principal.subject).first<{ id: string; company_id: string }>(); if (!row) throw new KnowledgeConflictError("Commercial workspace is unavailable"); return { id: row.id, companyId: row.company_id }; }
async function resolveDestination(database: D1Database, workspaceId: string, destination: Destination) {
  const mapping = destination.scopeType === "company"
    ? { scope: "company", query: "SELECT c.id, c.name FROM companies c WHERE c.workspace_id = ?" }
    : destination.scopeType === "product"
      ? { scope: "product", query: "SELECT n.id, n.name FROM products n JOIN companies c ON c.id = n.company_id AND c.workspace_id = n.workspace_id WHERE n.workspace_id = ?" }
      : destination.scopeType === "market_play"
        ? { scope: "play", query: "SELECT n.id, n.name FROM market_plays n JOIN products p ON p.id = n.product_id AND p.workspace_id = n.workspace_id JOIN companies c ON c.id = p.company_id AND c.workspace_id = n.workspace_id WHERE n.workspace_id = ?" }
        : destination.scopeType === "customer_profile"
          ? { scope: "profile", query: "SELECT n.id, n.name FROM customer_profiles n JOIN market_plays mp ON mp.id = n.play_id AND mp.workspace_id = n.workspace_id JOIN products p ON p.id = mp.product_id AND p.workspace_id = n.workspace_id JOIN companies c ON c.id = p.company_id AND c.workspace_id = n.workspace_id WHERE n.workspace_id = ?" }
          : { scope: "offer", query: "SELECT n.id, n.name FROM offers n JOIN customer_profiles cp ON cp.id = n.profile_id AND cp.workspace_id = n.workspace_id JOIN market_plays mp ON mp.id = cp.play_id AND mp.workspace_id = n.workspace_id JOIN products p ON p.id = mp.product_id AND p.workspace_id = n.workspace_id JOIN companies c ON c.id = p.company_id AND c.workspace_id = n.workspace_id WHERE n.workspace_id = ?" };
  if (destination.id) {
    const id = bounded(destination.id, 160, "destination id");
    const row = await database.prepare(`${mapping.query} AND ${destination.scopeType === "company" ? "c" : "n"}.id = ? LIMIT 1`).bind(workspaceId, id).first<{ id: string; name: string }>();
    if (!row || (destination.locator && row.name !== bounded(destination.locator, 160, "destination locator"))) throw new KnowledgeConflictError("Destination is outside the authorized commercial hierarchy");
    return { id: row.id, scopeType: mapping.scope };
  }
  const locator = bounded(required(destination.locator, "Destination id or locator"), 160, "destination locator");
  const rows = await database.prepare(`${mapping.query} AND ${destination.scopeType === "company" ? "c" : "n"}.name = ? LIMIT 2`).bind(workspaceId, locator).all<{ id: string }>();
  if (rows.results.length !== 1) throw new KnowledgeConflictError(rows.results.length > 1 ? "Destination locator is ambiguous; use its exact projected id" : "Destination is outside the authorized commercial hierarchy");
  return { id: rows.results[0].id, scopeType: mapping.scope };
}
async function proposalRow(database: D1Database, workspaceId: string, id: string) { const row = await database.prepare("SELECT id, revision, origin, destination_scope_type, destination_scope_id, kind, value_json, proposal_digest FROM knowledge_proposals WHERE id = ? AND workspace_id = ? LIMIT 1").bind(id, workspaceId).first<ProposalRow>(); if (!row) throw new KnowledgeConflictError("Knowledge proposal is unavailable"); return row; }
async function proposalById(database: D1Database, workspaceId: string, id: string) { const row = await database.prepare("SELECT kp.id, kp.revision, kp.origin, kp.status, kp.destination_scope_type, kp.destination_scope_id, kp.kind, kp.value_json, kp.proposal_digest, kp.provenance_json FROM knowledge_proposals kp WHERE kp.id = ? AND kp.workspace_id = ? LIMIT 1").bind(id, workspaceId).first<ProposalView>(); if (!row) throw new KnowledgeConflictError("Knowledge proposal is unavailable"); const provenance = JSON.parse(row.provenance_json); const locator = await destinationLocator(database, workspaceId, row.destination_scope_type, row.destination_scope_id); const quarantined = row.origin === "quarantined_upload"; return { id: row.id, type: "knowledge_proposal", revision: row.revision, status: row.status, origin: row.origin, immutable: true, digest: row.proposal_digest, destination: { scopeType: row.destination_scope_type, id: row.destination_scope_id, locator }, ...(quarantined ? {} : { value: JSON.parse(row.value_json) }), provenance, privacy: provenance.privacy, license: provenance.license, quarantine: quarantined ? { status: "unscanned", content: "withheld" } : undefined }; }
async function versionById(database: D1Database, workspaceId: string, id: string, predecessorId: string | null = null) { const row = await database.prepare("SELECT id, proposal_id, decision_id, scope_type, scope_id, kind, value_json, value_digest FROM knowledge_versions WHERE id = ? AND workspace_id = ? LIMIT 1").bind(id, workspaceId).first<{ id: string; proposal_id: string; decision_id: string; scope_type: string; scope_id: string; kind: string; value_json: string; value_digest: string }>(); if (!row) throw new KnowledgeConflictError("Knowledge version is unavailable"); const decision = await database.prepare("SELECT decision FROM proposal_decisions WHERE id = ? AND workspace_id = ? LIMIT 1").bind(row.decision_id, workspaceId).first<{ decision: string }>(); const locator = await destinationLocator(database, workspaceId, row.scope_type, row.scope_id); return { id: row.id, type: "knowledge_version", immutable: true, predecessorId, successorLineage: { decision: decision?.decision }, destination: { scopeType: row.scope_type, id: row.scope_id, locator }, kind: row.kind, value: JSON.parse(row.value_json), digest: row.value_digest }; }
async function destinationLocator(database: D1Database, workspaceId: string, scopeType: string, scopeId: string) { const table = scopeType === "company" ? "companies" : scopeType === "product" ? "products" : scopeType === "play" || scopeType === "market_play" ? "market_plays" : scopeType === "profile" || scopeType === "customer_profile" ? "customer_profiles" : "offers"; const row = await database.prepare(`SELECT name FROM ${table} WHERE id = ? AND workspace_id = ? LIMIT 1`).bind(scopeId, workspaceId).first<{ name: string }>(); if (!row) throw new KnowledgeConflictError("Knowledge destination is unavailable"); return row.name; }
async function decisionById(database: D1Database, workspaceId: string, id: string, predecessorId: string | null = null) { const row = await database.prepare("SELECT id, decision FROM proposal_decisions WHERE id = ? AND workspace_id = ? LIMIT 1").bind(id, workspaceId).first<{ id: string; decision: "accept" | "reject" | "correct" | "rescope" }>(); if (!row) throw new KnowledgeConflictError("Knowledge decision is unavailable"); const version = row.decision === "reject" ? undefined : await database.prepare("SELECT id FROM knowledge_versions WHERE decision_id = ? AND workspace_id = ? LIMIT 1").bind(row.id, workspaceId).first<{ id: string }>(); return { id: row.id, decision: row.decision, ...(version ? { version: await versionById(database, workspaceId, version.id, predecessorId) } : {}) }; }
type ProposalRow = { id: string; revision: number; origin: string; destination_scope_type: string; destination_scope_id: string; kind: string; value_json: string; proposal_digest: string };
type ProposalView = ProposalRow & { status: string; provenance_json: string };
function validateOrigin(origin: AcceptedOrigin) { if (!["owner_edit", "repository_research", "plain_text_import", "import", "same_company_reuse", "same_product_reuse", "allowlisted_package", "quarantined_upload"].includes(origin)) throw new KnowledgeConflictError("Untrusted knowledge origin"); return origin; }
function sourceOrigin(origin: string) { return origin === "repository_research" ? "public_research" : origin === "quarantined_upload" ? "uploaded_quarantine" : origin.includes("reuse") || origin === "allowlisted_package" ? "reuse_package" : "owner_import"; }
function validateValue(value: { excerpt: string }) { validatePlainText(value.excerpt); return { excerpt: bounded(value.excerpt, 12_000, "knowledge excerpt") }; }
function validatePlainText(value: string) { if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value) || /<\s*\/?[a-z][^>]*>/i.test(value)) throw new KnowledgeConflictError("Only bounded UTF-8 plain text is accepted"); }
function validateProvenance(source: ProposalInput["source"], privacy: ProposalInput["privacy"], license: ProposalInput["license"], reuseEligibility: string) { return { reference: bounded(source.reference, 1000, "source reference"), custody: bounded(source.custody, 240, "source custody"), retrievedAt: source.retrievedAt, privacy, license: { use: bounded(license.use, 240, "license use") }, reuseEligibility: bounded(reuseEligibility, 120, "reuse eligibility") }; }
function validateResearchUrl(value: string) { let url: URL; try { url = new URL(value); } catch { throw new KnowledgeConflictError("Repository research requires an HTTPS URL"); } if (url.protocol !== "https:" || url.username || url.password || url.hash || /(token|secret|key|password)/i.test(url.search) || /^(localhost|127\.|0\.0\.0\.0|169\.254\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/i.test(url.hostname)) throw new KnowledgeConflictError("Repository research URL is not safely public"); }
function orderedSnapshot(value: unknown) { return JSON.stringify(value); }
function required<T>(value: T | undefined, label: string) { if (value === undefined) throw new KnowledgeConflictError(`${label} is required`); return value; }
function bounded(value: string, max: number, label: string) { const normalized = value.trim(); if (!normalized || normalized.length > max) throw new KnowledgeConflictError(`Invalid ${label}`); return normalized; }
function validateKey(value: string) { if (!/^[a-f0-9-]{20,80}$/i.test(value)) throw new KnowledgeConflictError("Invalid idempotency key"); }
function isConstraint(error: unknown) { return error instanceof Error && /unique|constraint/i.test(error.message); }
async function sha256(value: string) { const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)); return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join(""); }
