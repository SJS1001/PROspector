import {
  createHierarchyDraft,
  initializeCommercialModel,
  readCommercialModel,
  CommercialModelConflictError,
} from "./commercial-model";
import { consumeCsrfToken, csrfTokenFromRequest, CsrfTokenError, issueCsrfToken, withCsrfCookie } from "./csrf";
import { readInterviewState, recordInterviewDecision, submitInterviewAnswer, InterviewConflictError, type InterviewPrincipal } from "./interview";
import {
  importPlainText,
  proposeAllowlistedPackage,
  proposeOwnerEdit,
  proposeRepositoryResearch,
  proposeReuse,
  readKnowledgeLibrary,
  reviewKnowledgeProposal,
  KnowledgeConflictError,
} from "./knowledge";
import { admitPilotOwner, PilotAccessError } from "./pilot-access";
import { createReplacementCandidate, activateReplacement, ReplacementConflictError } from "./replacement";
import { readBoundedJson, validateSameOriginMutation } from "./request-security";

export const KNOWLEDGE_ACTIONS = [
  "initialize_commercial_model", "create_hierarchy_draft", "propose_owner_edit",
  "propose_repository_research", "import_plain_text", "propose_reuse",
  "propose_allowlisted_package", "submit_interview_answer", "record_interview_decision",
  "review_knowledge_proposal", "create_replacement_candidate", "activate_replacement",
] as const;
export const KNOWLEDGE_MUTATION_INTENT = "knowledge-mutation";
export const MAX_KNOWLEDGE_BODY_BYTES = 8192;
export const OLD_SCHEMA_PROJECTION = "phase2_schema_unavailable";
export const INACTIVE_WRITES_PROJECTION = "phase2_writes_not_activated";

export type KnowledgeHandlerDependencies = {
  database: D1Database;
  subjectPepper: string;
  pilotOwnerEmail: string;
  getIdentity(): Promise<{ email: string; displayName: string } | null>;
};

export async function handleKnowledgeGet(dependencies: KnowledgeHandlerDependencies): Promise<Response> {
  try {
    const principal = await authenticatedPrincipal(dependencies);
    if (!await phase2SchemaAvailable(dependencies.database)) return json({ error: OLD_SCHEMA_PROJECTION });
    return projectionResponse(dependencies.database, principal);
  } catch (error) {
    if (error instanceof PilotAccessError) return privateWorkspaceUnavailable();
    if (isKnownDomainError(error)) return json({ error: "knowledge_unavailable" }, 409);
    return json({ error: "server_error" }, 500);
  }
}

export async function handleKnowledgePost(request: Request, dependencies: KnowledgeHandlerDependencies): Promise<Response> {
  try {
    // Admission deliberately precedes every schema, request, gate, and token probe.
    const principal = await authenticatedPrincipal(dependencies);
    if (!await phase2SchemaAvailable(dependencies.database)) return json({ error: OLD_SCHEMA_PROJECTION }, 503);
    const rejected = validateSameOriginMutation(request, KNOWLEDGE_MUTATION_INTENT, MAX_KNOWLEDGE_BODY_BYTES);
    if (rejected) return json({ error: rejected.error }, rejected.status);
    await consumeCsrfToken(dependencies.database, principal.subject, csrfTokenFromRequest(request));
    if (!await writesActivated(dependencies.database, principal)) return json({ error: INACTIVE_WRITES_PROJECTION }, 503);
    const body = await readBoundedJson(request, MAX_KNOWLEDGE_BODY_BYTES);
    if (!isRecord(body) || !KNOWLEDGE_ACTIONS.includes(body.action as (typeof KNOWLEDGE_ACTIONS)[number]))
      return json({ error: "unsupported_action" }, 400);
    assertClosedCommand(body);
    await dispatch(body, dependencies.database, principal);
    return projectionResponse(dependencies.database, principal);
  } catch (error) {
    if (error instanceof PilotAccessError) return privateWorkspaceUnavailable();
    if (error instanceof CsrfTokenError) return json({ error: error.code }, 403);
    if (isKnownDomainError(error)) return json({ error: "command_conflict" }, 409);
    if (error instanceof SyntaxError) return json({ error: "invalid_json" }, 400);
    const status = error instanceof Error && "status" in error && error.status === 413 ? 413 : 500;
    return json({ error: status === 413 ? "payload_too_large" : "server_error" }, status);
  }
}

async function dispatch(body: Record<string, unknown>, database: D1Database, principal: InterviewPrincipal) {
  const key = requiredString(body, "idempotencyKey", 80);
  switch (body.action) {
    case "initialize_commercial_model": return initializeCommercialModel(database, principal, { idempotencyKey: key });
    case "create_hierarchy_draft": return createHierarchyDraft(database, principal, {
      type: enumValue(body, "type", ["product", "market_play", "customer_profile"]), parentId: requiredString(body, "parentId", 160), name: requiredString(body, "name", 160), expectedRevision: requiredRevision(body, "expectedRevision"), idempotencyKey: key, productFundamentalsDiverge: optionalBoolean(body, "productFundamentalsDiverge"),
    });
    case "propose_owner_edit": return proposeOwnerEdit(database, principal, proposalInput(body, key));
    case "propose_repository_research": return proposeRepositoryResearch(database, principal, proposalInput(body, key));
    case "import_plain_text": return importPlainText(database, principal, proposalInput(body, key));
    case "propose_reuse": return proposeReuse(database, principal, proposalInput(body, key));
    case "propose_allowlisted_package": return proposeAllowlistedPackage(database, principal, { ...proposalInput(body, key), reuseEligibility: "allowlisted_package" });
    case "submit_interview_answer": return submitInterviewAnswer(database, principal, {
      questionId: requiredString(body, "questionId", 160), expectedRevision: requiredRevision(body, "expectedRevision"), idempotencyKey: key,
      answer: enumValue(body, "answer", ["use_recommendation", "write_correction", "change_scope"]), ...optionalExcerpt(body, "value"), ...optionalStringValue(body, "reason", 2000), ...optionalDestination(body),
    });
    case "record_interview_decision": return recordInterviewDecision(database, principal, {
      answerId: requiredString(body, "answerId", 160), expectedSessionRevision: requiredRevision(body, "expectedSessionRevision"), expectedQuestionRevision: optionalRevision(body, "expectedQuestionRevision"), idempotencyKey: key,
      decision: enumValue(body, "decision", ["accept", "reject", "correct", "rescope"]), ...optionalExcerpt(body, "value"), ...optionalStringValue(body, "reason", 2000), ...optionalDestination(body), ...optionalStringValue(body, "predecessorVersionId", 160),
    });
    case "review_knowledge_proposal": return reviewKnowledgeProposal(database, principal, {
      proposalId: requiredString(body, "proposalId", 160), decision: enumValue(body, "decision", ["accept", "reject", "correct", "rescope"]), correction: optionalExcerpt(body, "correction").value, destination: optionalDestination(body).destination, predecessorVersionId: optionalStringValue(body, "predecessorVersionId", 160).predecessorVersionId, expectedRevision: requiredRevision(body, "expectedRevision"), idempotencyKey: key,
    });
    case "create_replacement_candidate": return createReplacementCandidate(database, principal, {
      currentVersionId: requiredString(body, "currentVersionId", 160), proposedVersionId: requiredString(body, "proposedVersionId", 160), ownerType: enumValue(body, "ownerType", ["product", "profile"]), ownerId: requiredString(body, "ownerId", 160), kind: enumValue(body, "kind", ["product_discovery", "profile_effective"]), manifest: requiredRecord(body, "manifest"), riskKind: requiredString(body, "riskKind", 120), dependencyEdges: dependencyEdges(body), artifacts: artifacts(body), expectedOwnerRevision: requiredRevision(body, "expectedOwnerRevision"), idempotencyKey: key,
    });
    case "activate_replacement": return activateReplacement(database, principal, { candidateId: requiredString(body, "candidateId", 160), impactDigest: requiredString(body, "impactDigest", 128), expectedOwnerRevision: requiredRevision(body, "expectedOwnerRevision"), expectedCandidateRevision: requiredRevision(body, "expectedCandidateRevision"), idempotencyKey: key });
  }
}

function proposalInput(body: Record<string, unknown>, idempotencyKey: string) {
  const source = requiredRecord(body, "source");
  return { destination: requiredDestination(body), kind: requiredString(body, "kind", 120), value: { excerpt: requiredString(body, "text", 6000) }, source: { reference: requiredString(source, "reference", 1000), custody: requiredString(source, "custody", 240), retrievedAt: requiredTimestamp(source, "retrievedAt") }, privacy: enumValue(body, "privacy", ["public", "private", "restricted"]), license: { use: requiredString(requiredRecord(body, "license"), "use", 240) }, reuseEligibility: requiredString(body, "reuseEligibility", 120), idempotencyKey };
}

function assertClosedCommand(body: Record<string, unknown>) {
  const common = ["action", "idempotencyKey"];
  const proposal = [...common, "destination", "kind", "text", "source", "privacy", "license", "reuseEligibility"];
  const allowed: Record<(typeof KNOWLEDGE_ACTIONS)[number], string[]> = {
    initialize_commercial_model: common,
    create_hierarchy_draft: [...common, "type", "parentId", "name", "expectedRevision", "productFundamentalsDiverge"],
    propose_owner_edit: proposal,
    propose_repository_research: proposal,
    import_plain_text: proposal,
    propose_reuse: proposal,
    propose_allowlisted_package: proposal,
    submit_interview_answer: [...common, "questionId", "expectedRevision", "answer", "value", "reason", "destination"],
    record_interview_decision: [...common, "answerId", "expectedSessionRevision", "expectedQuestionRevision", "decision", "value", "reason", "destination", "predecessorVersionId"],
    review_knowledge_proposal: [...common, "proposalId", "decision", "correction", "destination", "predecessorVersionId", "expectedRevision"],
    create_replacement_candidate: [...common, "currentVersionId", "proposedVersionId", "ownerType", "ownerId", "kind", "manifest", "riskKind", "dependencyEdges", "artifacts", "expectedOwnerRevision"],
    activate_replacement: [...common, "candidateId", "impactDigest", "expectedOwnerRevision", "expectedCandidateRevision"],
  };
  const action = body.action as (typeof KNOWLEDGE_ACTIONS)[number];
  if (Object.keys(body).some((key) => !allowed[action].includes(key))) throw new KnowledgeConflictError("Invalid command");
  if (["propose_owner_edit", "propose_repository_research", "import_plain_text", "propose_reuse", "propose_allowlisted_package"].includes(action)) {
    const source = requiredRecord(body, "source");
    const license = requiredRecord(body, "license");
    if (Object.keys(source).some((key) => !["reference", "custody", "retrievedAt"].includes(key)) || Object.keys(license).some((key) => key !== "use")) throw new KnowledgeConflictError("Invalid command");
  }
}

async function projectionResponse(database: D1Database, principal: InterviewPrincipal) {
  const [commercial, interview, library, drift, replacements] = await Promise.all([
    readCommercialModel(database, principal), readInterviewState(database, principal), readKnowledgeLibrary(database, principal), readDrift(database, principal), readReplacements(database, principal),
  ]);
  return withCsrfCookie(json({ commercial, interview, library, drift, replacements }), await issueCsrfToken(database, principal.subject));
}

async function phase2SchemaAvailable(database: D1Database) {
  return Boolean(await database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'phase_activation_gates' LIMIT 1").first());
}
async function writesActivated(database: D1Database, principal: InterviewPrincipal) {
  const workspace = await database.prepare("SELECT id FROM workspaces WHERE owner_subject IN (?, ?) ORDER BY CASE owner_subject WHEN ? THEN 0 ELSE 1 END LIMIT 1").bind(principal.subject, principal.legacySubject, principal.subject).first<{ id: string }>();
  if (!workspace) return false;
  return Boolean(await database.prepare("SELECT id FROM phase_activation_gates WHERE workspace_id = ? AND capability = 'consensus_knowledge' AND authorization_reference <> '' AND target_project_deployment <> '' AND reviewed_source_digest <> '' AND migration_identity_status <> '' AND post_migration_evidence_reference <> '' AND independent_review_reference <> '' AND deployed_boundary_proof_reference <> '' AND length(tuple_digest) = 64 LIMIT 1").bind(workspace.id).first());
}
async function readDrift(database: D1Database, principal: InterviewPrincipal) { return rowsForOwner(database, principal, "SELECT kd.id, kd.risk_kind AS riskKind, kd.status, ds.impact_digest AS impactDigest FROM knowledge_drifts kd LEFT JOIN drift_impact_snapshots ds ON ds.drift_id = kd.id WHERE kd.workspace_id = ? ORDER BY kd.created_at, kd.id"); }
async function readReplacements(database: D1Database, principal: InterviewPrincipal) { return rowsForOwner(database, principal, "SELECT id, status, candidate_digest AS digest, revision FROM replacement_candidates WHERE workspace_id = ? ORDER BY created_at, id"); }
async function rowsForOwner(database: D1Database, principal: InterviewPrincipal, statement: string) { const workspace = await database.prepare("SELECT id FROM workspaces WHERE owner_subject IN (?, ?) ORDER BY CASE owner_subject WHEN ? THEN 0 ELSE 1 END LIMIT 1").bind(principal.subject, principal.legacySubject, principal.subject).first<{ id: string }>(); return workspace ? (await database.prepare(statement).bind(workspace.id).all()).results : []; }
async function authenticatedPrincipal(dependencies: KnowledgeHandlerDependencies) { return admitPilotOwner(await dependencies.getIdentity(), dependencies.pilotOwnerEmail, dependencies.subjectPepper); }
function json(value: unknown, status = 200) { return Response.json(value, { status, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } }); }
function privateWorkspaceUnavailable() { return json({ error: "private_workspace_unavailable" }, 404); }
function isKnownDomainError(error: unknown) { return error instanceof CommercialModelConflictError || error instanceof KnowledgeConflictError || error instanceof InterviewConflictError || error instanceof ReplacementConflictError; }
function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function requiredRecord(value: Record<string, unknown>, key: string) { const result = value[key]; if (!isRecord(result)) throw new KnowledgeConflictError("Invalid command"); return result; }
function requiredString(value: Record<string, unknown>, key: string, max: number) { const result = value[key]; if (typeof result !== "string" || !result.trim() || result.trim().length > max) throw new KnowledgeConflictError("Invalid command"); return result.trim(); }
function requiredTimestamp(value: Record<string, unknown>, key: string) { const result = value[key]; if (!Number.isSafeInteger(result) || result < 0) throw new KnowledgeConflictError("Invalid command"); return result; }
function requiredRevision(value: Record<string, unknown>, key: string) { const result = value[key]; if (!Number.isInteger(result) || result < 1) throw new KnowledgeConflictError("Invalid command"); return result; }
function optionalRevision(value: Record<string, unknown>, key: string) { return value[key] === undefined ? undefined : requiredRevision(value, key); }
function optionalBoolean(value: Record<string, unknown>, key: string) { if (value[key] === undefined) return undefined; if (typeof value[key] !== "boolean") throw new KnowledgeConflictError("Invalid command"); return value[key]; }
function enumValue<const T extends readonly string[]>(value: Record<string, unknown>, key: string, accepted: T): T[number] { const result = value[key]; if (typeof result !== "string" || !accepted.includes(result)) throw new KnowledgeConflictError("Invalid command"); return result as T[number]; }
function requiredDestination(value: Record<string, unknown>) { const destination = requiredRecord(value, "destination"); return { scopeType: enumValue(destination, "scopeType", ["company", "product", "market_play", "customer_profile", "offer"]), locator: requiredString(destination, "locator", 160) }; }
function optionalDestination(value: Record<string, unknown>) { return value.destination === undefined ? {} : { destination: requiredDestination(value) }; }
function optionalExcerpt(value: Record<string, unknown>, key: string) { if (value[key] === undefined) return {}; const result = requiredRecord(value, key); return { value: { excerpt: requiredString(result, "excerpt", 6000) } }; }
function optionalStringValue(value: Record<string, unknown>, key: string, max: number) { return value[key] === undefined ? {} : { [key]: requiredString(value, key, max) }; }
function dependencyEdges(value: Record<string, unknown>) { const edges = value.dependencyEdges; if (!Array.isArray(edges) || edges.length > 100) throw new KnowledgeConflictError("Invalid command"); return edges.map((edge) => { if (!isRecord(edge)) throw new KnowledgeConflictError("Invalid command"); return { fromType: enumValue(edge, "fromType", ["source", "version", "configuration", "artifact"]), fromId: requiredString(edge, "fromId", 160), toType: enumValue(edge, "toType", ["source", "version", "configuration", "artifact"]), toId: requiredString(edge, "toId", 160) }; }); }
function artifacts(value: Record<string, unknown>) { if (value.artifacts === undefined) return undefined; if (!Array.isArray(value.artifacts) || value.artifacts.length > 100) throw new KnowledgeConflictError("Invalid command"); return value.artifacts.map((artifact) => { if (!isRecord(artifact)) throw new KnowledgeConflictError("Invalid command"); return { artifactId: requiredString(artifact, "artifactId", 160), ...(artifact.artifactType === undefined ? {} : { artifactType: requiredString(artifact, "artifactType", 120) }), ...(artifact.status === undefined ? {} : { status: requiredString(artifact, "status", 120) }) }; }); }
