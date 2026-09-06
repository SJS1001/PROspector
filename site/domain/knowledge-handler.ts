import {
  createHierarchyDraft,
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
import { createReplacementCandidate, activateReplacement, readEligibleReplacementCandidates, ReplacementConflictError } from "./replacement";
import { readBoundedJson, validateSameOriginMutation } from "./request-security";
import { advanceLocalInterview, attachLocalInterviewProgression } from "./interview-question-composer";
import { createOnboardingDraft, initializeOwnerCompanyProduct, OnboardingConflictError, readOnboardingProjection } from "./onboarding";

export const KNOWLEDGE_ACTIONS = [
  "initialize_owner_workspace", "create_onboarding_draft", "start_onboarding_interview",
  "create_hierarchy_draft", "propose_owner_edit",
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
  enableLocalDemoProgression?: boolean;
  runtimeIsDevelopment?: boolean;
  getIdentity(): Promise<{ email: string; displayName: string } | null>;
};

export async function handleKnowledgeGet(dependencies: KnowledgeHandlerDependencies): Promise<Response> {
  try {
    const principal = await authenticatedPrincipal(dependencies);
    if (!await phase2SchemaAvailable(dependencies.database)) return json({ error: OLD_SCHEMA_PROJECTION });
    return projectionResponse(dependencies.database, principal, dependencies.enableLocalDemoProgression === true);
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
    const localOnboardingSeam=dependencies.enableLocalDemoProgression===true&&dependencies.runtimeIsDevelopment===true&&exactLoopbackMutation(request);
    const activated=localOnboardingSeam?null:await writesActivated(dependencies.database,principal);
    if(activated===false)return json({error:INACTIVE_WRITES_PROJECTION},503);
    const body = await readBoundedJson(request, MAX_KNOWLEDGE_BODY_BYTES);
    if (!isRecord(body) || !KNOWLEDGE_ACTIONS.includes(body.action as (typeof KNOWLEDGE_ACTIONS)[number]))
      return json({ error: "unsupported_action" }, 400);
    assertClosedCommand(body);
    const onboardingAction = body.action === "initialize_owner_workspace" || body.action === "create_onboarding_draft" || body.action === "start_onboarding_interview";
    if(localOnboardingSeam&&!onboardingAction&&!await writesActivated(dependencies.database,principal))return json({error:INACTIVE_WRITES_PROJECTION},503);
    await dispatch(body, dependencies.database, principal);
    return projectionResponse(dependencies.database, principal, dependencies.enableLocalDemoProgression === true);
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
    case "initialize_owner_workspace": return initializeOwnerCompanyProduct(database, principal, { companyName: requiredString(body,"companyName",160), productName: requiredString(body,"productName",160), idempotencyKey:key });
    case "create_onboarding_draft": return createOnboardingDraft(database, principal, { type: enumValue(body,"type",["market_play","customer_profile"]), parentId: requiredString(body,"parentId",160), name: requiredString(body,"name",160), expectedRevision: requiredRevision(body,"expectedRevision"), idempotencyKey:key });
    case "start_onboarding_interview": return advanceLocalInterview(database, principal, { expectedQueueDigest: requiredString(body,"expectedQueueDigest",64), idempotencyKey:key });
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
      eligibleProjectionId: requiredString(body, "eligibleProjectionId", 600), eligibleProjectionDigest: requiredString(body, "eligibleProjectionDigest", 128), expectedOwnerRevision: requiredRevision(body, "expectedOwnerRevision"), idempotencyKey: key,
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
    initialize_owner_workspace: [...common, "companyName", "productName"],
    create_onboarding_draft: [...common, "type", "parentId", "name", "expectedRevision"],
    start_onboarding_interview: [...common, "expectedQueueDigest"],
    create_hierarchy_draft: [...common, "type", "parentId", "name", "expectedRevision", "productFundamentalsDiverge"],
    propose_owner_edit: proposal,
    propose_repository_research: proposal,
    import_plain_text: proposal,
    propose_reuse: proposal,
    propose_allowlisted_package: proposal,
    submit_interview_answer: [...common, "questionId", "expectedRevision", "answer", "value", "reason", "destination"],
    record_interview_decision: [...common, "answerId", "expectedSessionRevision", "expectedQuestionRevision", "decision", "value", "reason", "destination", "predecessorVersionId"],
    review_knowledge_proposal: [...common, "proposalId", "decision", "correction", "destination", "predecessorVersionId", "expectedRevision"],
    create_replacement_candidate: [...common, "eligibleProjectionId", "eligibleProjectionDigest", "expectedOwnerRevision"],
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

async function projectionResponse(database: D1Database, principal: InterviewPrincipal, enableLocalDemoProgression = false) {
  const onboarding = await readOnboardingProjection(database, principal);
  if (onboarding.status === "company_product_required" || onboarding.status === "market_play_required" || onboarding.status === "customer_profile_required" || (onboarding.status === "profile_fit_required" && !await liveInterviewExists(database, principal))) return withCsrfCookie(json({ onboarding }), await issueCsrfToken(database, principal.subject));
  // Reads are projection-only; onboarding is the sole local-demo bootstrap authority.
  const library = await readKnowledgeLibrary(database, principal);
  const [commercial, interviewState, drift, replacements] = await Promise.all([
    readCommercialModel(database, principal), readInterviewState(database, principal), readDrift(database, principal), readReplacements(database, principal),
  ]);
  const interview = enableLocalDemoProgression
    ? await attachLocalInterviewProgression(database, principal, interviewState)
    : interviewState;
  return withCsrfCookie(json({ onboarding, commercial: commercialWithDriftTruth(commercial, drift), interview, library, drift, replacements }), await issueCsrfToken(database, principal.subject));
}

function exactLoopbackMutation(request: Request) {
  try {
    const url=new URL(request.url); const origin=request.headers.get("origin");
    return request.method==="POST" && ["localhost","127.0.0.1","::1","[::1]"].includes(url.hostname.toLowerCase()) && Boolean(origin) && new URL(origin!).origin===url.origin;
  } catch { return false; }
}
async function liveInterviewExists(database:D1Database, principal:InterviewPrincipal){const row=await database.prepare("SELECT s.id FROM interview_sessions s JOIN workspaces w ON w.id=s.workspace_id WHERE w.owner_subject IN (?,?) AND s.state IN ('awaiting_answer','awaiting_confirmation') AND s.active_question_id IS NOT NULL LIMIT 1").bind(principal.subject,principal.legacySubject).first();return Boolean(row);}

async function phase2SchemaAvailable(database: D1Database) {
  return Boolean(await database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'phase_activation_gates' LIMIT 1").first());
}
async function writesActivated(database: D1Database, principal: InterviewPrincipal) {
  const workspace = await database.prepare("SELECT id FROM workspaces WHERE owner_subject IN (?, ?) ORDER BY CASE owner_subject WHEN ? THEN 0 ELSE 1 END LIMIT 1").bind(principal.subject, principal.legacySubject, principal.subject).first<{ id: string }>();
  if (!workspace) return false;
  const gate = await database.prepare("SELECT capability, authorization_reference, target_project_deployment, reviewed_source_digest, migration_identity_status, post_migration_evidence_reference, independent_review_reference, deployed_boundary_proof_reference, tuple_digest FROM phase_activation_gates WHERE workspace_id = ? AND capability = 'consensus_knowledge' LIMIT 2").bind(workspace.id).all<Record<string, string>>();
  if (gate.results.length !== 1) return false;
  const row = gate.results[0];
  const fields = ["capability", "authorization_reference", "target_project_deployment", "reviewed_source_digest", "migration_identity_status", "post_migration_evidence_reference", "independent_review_reference", "deployed_boundary_proof_reference"] as const;
  if (fields.some((field) => typeof row[field] !== "string" || !row[field].trim())) return false;
  const canonical = fields.map((field) => `${field}=${row[field]}`).join("\n");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  const expected = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return row.tuple_digest === expected;
}
export async function readDrift(database: D1Database, principal: InterviewPrincipal) {
  const rows = await rowsForOwner(database, principal, `SELECT kd.id, kd.risk_kind AS riskKind, kd.status,
      kd.current_version_id AS currentVersionId, kd.proposed_version_id AS proposedVersionId,
      kp.id AS proposalId, kp.revision AS proposalRevision, kp.destination_scope_type AS destinationScopeType,
      kp.destination_scope_id AS destinationScopeId, kp.value_json AS proposedValueJson, kp.provenance_json AS provenanceJson,
      current.value_json AS currentValueJson, ds.impact_json AS impactJson, ds.impact_digest AS impactDigest,
      rc.id AS replacementCandidateId
    FROM knowledge_drifts kd
    JOIN knowledge_proposals kp ON kp.id = kd.proposal_id AND kp.workspace_id = kd.workspace_id
    JOIN knowledge_versions current ON current.id = kd.current_version_id AND current.workspace_id = kd.workspace_id
    JOIN knowledge_versions proposed ON proposed.id = kd.proposed_version_id AND proposed.workspace_id = kd.workspace_id
    LEFT JOIN drift_impact_snapshots ds ON ds.drift_id = kd.id AND ds.workspace_id = kd.workspace_id
    LEFT JOIN replacement_candidates rc ON rc.impact_snapshot_id = ds.id AND rc.workspace_id = kd.workspace_id
    WHERE kd.workspace_id = ? ORDER BY CASE kd.status WHEN 'open' THEN 0 ELSE 1 END, kd.created_at, kd.id`);
  const persisted = rows.map((row) => {
    const impact = objectJson(row.impactJson);
    const currentValue = objectJson(row.currentValueJson);
    const proposedValue = objectJson(row.proposedValueJson);
    const destinationScopeType = publicScopeToken(String(row.destinationScopeType));
    return {
      id: row.id, riskKind: row.riskKind, status: row.status,
      currentVersionId: row.currentVersionId, proposedVersionId: row.proposedVersionId,
      currentValue: excerptOrNull(currentValue), proposedValue: excerptOrNull(proposedValue),
      provenance: objectJson(row.provenanceJson),
      destination: { scopeType: destinationScopeType, id: row.destinationScopeId },
      review: row.status === "open" ? {
        action: "review_knowledge_proposal", proposalId: row.proposalId, expectedRevision: Number(row.proposalRevision),
        predecessorVersionId: row.currentVersionId,
        destination: { scopeType: destinationScopeType, id: row.destinationScopeId },
        decisions: ["accept", "reject", "correct", "rescope"],
      } : null,
      paths: impact ? reachedArtifacts(impact).map((artifact) => Array.isArray(artifact.path) ? artifact.path.join(" -> ") : null).filter((path): path is string => Boolean(path)) : [],
      artifacts: impact ? reachedArtifacts(impact) : [],
      counts: impact && isRecord(impact.counts) ? impact.counts : {},
      containment: impact && typeof impact.containment === "string" ? impact.containment : null,
      impactDigest: typeof row.impactDigest === "string" ? row.impactDigest : null,
      replacementCandidateId: typeof row.replacementCandidateId === "string" ? row.replacementCandidateId : null,
      candidate: null,
    };
  });
  return [...persisted, ...await readEligibleReplacementDrift(database, principal)];
}
export async function readReplacements(database: D1Database, principal: InterviewPrincipal) {
  const rows = await rowsForOwner(database, principal, `SELECT rc.id, rc.status, rc.candidate_digest AS digest, rc.revision,
      rc.current_configuration_id AS currentConfigurationId, rc.candidate_configuration_id AS candidateConfigurationId,
      rc.proposed_version_id AS storedProposedVersionId, rc.expected_owner_revision AS expectedOwnerRevision,
      ds.impact_digest AS impactDigest, pd.decision AS driftDecision, approved.id AS approvedVersionId,
      previous.digest AS previousConfigurationDigest, previous.manifest_json AS previousManifestJson,
      candidate.digest AS candidateConfigurationDigest, candidate.manifest_json AS candidateManifestJson,
      ca.id AS activationId, ca.created_at AS activatedAt, ca.previous_configuration_id AS activatedPreviousConfigurationId,
      ca.next_configuration_id AS activatedNextConfigurationId, ca.expected_owner_revision AS activatedExpectedOwnerRevision,
      ae.id AS auditEventId, ae.actor_id AS activatedBy
    FROM replacement_candidates rc
    JOIN drift_impact_snapshots ds ON ds.id = rc.impact_snapshot_id AND ds.workspace_id = rc.workspace_id
    JOIN knowledge_drifts kd ON kd.id = ds.drift_id AND kd.workspace_id = rc.workspace_id
    LEFT JOIN proposal_decisions pd ON pd.proposal_id = kd.proposal_id AND pd.workspace_id = rc.workspace_id
    LEFT JOIN knowledge_versions approved ON approved.decision_id = pd.id AND approved.workspace_id = rc.workspace_id
    LEFT JOIN typed_configurations previous ON previous.id = rc.current_configuration_id AND previous.workspace_id = rc.workspace_id
    JOIN typed_configurations candidate ON candidate.id = rc.candidate_configuration_id AND candidate.workspace_id = rc.workspace_id
    LEFT JOIN configuration_activations ca ON ca.replacement_candidate_id = rc.id AND ca.workspace_id = rc.workspace_id
    LEFT JOIN audit_events ae ON ae.id = (SELECT e.id FROM audit_events e WHERE e.workspace_id = rc.workspace_id
      AND e.subject_type = 'replacement_candidate' AND e.subject_id = rc.id AND e.action = 'replacement.activated'
      ORDER BY e.created_at DESC, e.id DESC LIMIT 1)
    WHERE rc.workspace_id = ? ORDER BY rc.created_at, rc.id`);
  return rows.map((row) => ({
    id: row.id, status: row.status, digest: row.digest, revision: Number(row.revision), immutable: true,
    currentConfigurationId: row.currentConfigurationId ?? null,
    candidateConfigurationId: row.candidateConfigurationId,
    proposedVersionId: row.approvedVersionId ?? row.storedProposedVersionId,
    expectedOwnerRevision: Number(row.expectedOwnerRevision),
    impactDigest: row.impactDigest,
    driftDecision: row.driftDecision ?? null,
    previousSnapshot: row.currentConfigurationId ? { id: row.currentConfigurationId, digest: row.previousConfigurationDigest ?? null, manifest: objectJson(row.previousManifestJson) } : null,
    candidateSnapshot: { id: row.candidateConfigurationId, digest: row.candidateConfigurationDigest, manifest: objectJson(row.candidateManifestJson) },
    activation: row.activationId ? {
      id: row.activationId, activatedAt: Number(row.activatedAt), activatedBy: row.activatedBy ?? null, auditEventId: row.auditEventId ?? null,
      previousConfigurationId: row.activatedPreviousConfigurationId ?? null, nextConfigurationId: row.activatedNextConfigurationId,
      expectedOwnerRevision: Number(row.activatedExpectedOwnerRevision),
    } : null,
    activatedAt: row.activationId ? Number(row.activatedAt) : null,
    activatedBy: row.activationId ? row.activatedBy ?? null : null,
    auditEventId: row.activationId ? row.auditEventId ?? null : null,
  }));
}
async function readEligibleReplacementDrift(database: D1Database, principal: InterviewPrincipal) {
  const serverEligible = await readEligibleReplacementCandidates(database, principal);
  return serverEligible.map((item) => ({
    id: item.id, riskKind: item.riskKind, status: "eligible", currentVersionId: item.current.id, proposedVersionId: item.proposed.id,
    currentValue: excerptOrNull(objectJson(item.currentValueJson)), proposedValue: excerptOrNull(objectJson(item.proposedValueJson)),
    provenance: objectJson(item.provenanceJson), destination: { scopeType: publicScopeToken(item.destinationScopeType), id: item.destinationScopeId },
    review: null, paths: item.impact.reachedArtifacts.map((artifact) => artifact.path.join(" -> ")), artifacts: item.impact.reachedArtifacts,
    counts: item.impact.counts, containment: item.impact.containment, impactDigest: item.impactDigest, replacementCandidateId: null,
    candidate: item.candidate, dependencyKnowledgeVersionIds: item.dependencyKnowledgeVersionIds,
  }));
}
async function rowsForOwner(database: D1Database, principal: InterviewPrincipal, statement: string) { const workspace = await database.prepare("SELECT id FROM workspaces WHERE owner_subject IN (?, ?) ORDER BY CASE owner_subject WHEN ? THEN 0 ELSE 1 END LIMIT 1").bind(principal.subject, principal.legacySubject, principal.subject).first<{ id: string }>(); return workspace ? (await database.prepare(statement).bind(workspace.id).all()).results : []; }
function commercialWithDriftTruth<T extends { path: Array<Record<string, unknown>>; products: Array<Record<string, unknown>>; plays: Array<Record<string, unknown>>; profiles: Array<Record<string, unknown>>; offers: Array<Record<string, unknown>> }>(commercial: T, drift: Array<Record<string, unknown>>) {
  const unresolved = new Map<string, number>();
  for (const item of drift) if (item.status !== "resolved" && isRecord(item.destination) && typeof item.destination.id === "string") unresolved.set(item.destination.id, (unresolved.get(item.destination.id) ?? 0) + 1);
  const enrich = (node: Record<string, unknown>) => {
    const lifecycle = typeof node.lifecycle === "string" ? node.lifecycle : "unknown";
    const projected = { ...node, unresolvedDriftCount: unresolved.get(String(node.id)) ?? 0 };
    if (node.type === "customer_profile" && lifecycle !== "nurture") delete projected.nurtureState;
    return projected;
  };
  return { ...commercial, path: commercial.path.map(enrich), products: commercial.products.map(enrich), plays: commercial.plays.map(enrich), profiles: commercial.profiles.map(enrich), offers: commercial.offers.map(enrich) };
}
function objectJson(value: unknown): Record<string, unknown> | null { if (typeof value !== "string") return null; try { const parsed = JSON.parse(value); return isRecord(parsed) ? parsed : null; } catch { return null; } }
function excerptOrNull(value: Record<string, unknown> | null) { return value && typeof value.excerpt === "string" ? value.excerpt : null; }
function reachedArtifacts(impact: Record<string, unknown>) { return Array.isArray(impact.reachedArtifacts) ? impact.reachedArtifacts.filter(isRecord) : []; }
function publicScopeToken(value: string) { return value === "play" ? "market_play" : value === "profile" ? "customer_profile" : value; }
async function authenticatedPrincipal(dependencies: KnowledgeHandlerDependencies) { return admitPilotOwner(await dependencies.getIdentity(), dependencies.pilotOwnerEmail, dependencies.subjectPepper); }
function json(value: unknown, status = 200) { return Response.json(value, { status, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } }); }
function privateWorkspaceUnavailable() { return json({ error: "private_workspace_unavailable" }, 404); }
function isKnownDomainError(error: unknown) { return error instanceof CommercialModelConflictError || error instanceof KnowledgeConflictError || error instanceof InterviewConflictError || error instanceof ReplacementConflictError || error instanceof OnboardingConflictError; }
function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function requiredRecord(value: Record<string, unknown>, key: string) { const result = value[key]; if (!isRecord(result)) throw new KnowledgeConflictError("Invalid command"); return result; }
function requiredString(value: Record<string, unknown>, key: string, max: number) { const result = value[key]; if (typeof result !== "string" || !result.trim() || result.trim().length > max) throw new KnowledgeConflictError("Invalid command"); return result.trim(); }
function requiredTimestamp(value: Record<string, unknown>, key: string) { const result = value[key]; if (!Number.isSafeInteger(result) || result < 0) throw new KnowledgeConflictError("Invalid command"); return result; }
function requiredRevision(value: Record<string, unknown>, key: string) { const result = value[key]; if (!Number.isInteger(result) || result < 1) throw new KnowledgeConflictError("Invalid command"); return result; }
function optionalRevision(value: Record<string, unknown>, key: string) { return value[key] === undefined ? undefined : requiredRevision(value, key); }
function optionalBoolean(value: Record<string, unknown>, key: string) { if (value[key] === undefined) return undefined; if (typeof value[key] !== "boolean") throw new KnowledgeConflictError("Invalid command"); return value[key]; }
function enumValue<const T extends readonly string[]>(value: Record<string, unknown>, key: string, accepted: T): T[number] { const result = value[key]; if (typeof result !== "string" || !accepted.includes(result)) throw new KnowledgeConflictError("Invalid command"); return result as T[number]; }
function requiredDestination(value: Record<string, unknown>) { const destination = requiredRecord(value, "destination"); if (Object.keys(destination).some((key) => !["scopeType", "id", "locator"].includes(key)) || (destination.id === undefined && destination.locator === undefined)) throw new KnowledgeConflictError("Invalid command"); return { scopeType: enumValue(destination, "scopeType", ["company", "product", "market_play", "customer_profile", "offer"]), ...(destination.id === undefined ? {} : { id: requiredString(destination, "id", 160) }), ...(destination.locator === undefined ? {} : { locator: requiredString(destination, "locator", 160) }) }; }
function optionalDestination(value: Record<string, unknown>) { return value.destination === undefined ? {} : { destination: requiredDestination(value) }; }
function optionalExcerpt(value: Record<string, unknown>, key: string) { if (value[key] === undefined) return {}; const result = requiredRecord(value, key); return { value: { excerpt: requiredString(result, "excerpt", 6000) } }; }
function optionalStringValue(value: Record<string, unknown>, key: string, max: number) { return value[key] === undefined ? {} : { [key]: requiredString(value, key, max) }; }
