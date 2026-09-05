import { consumeCsrfToken, csrfCookieName, csrfTokenFromRequest, CsrfTokenError, issueCsrfToken, withCsrfCookie, type CsrfCookieMode } from "./csrf";
import { admitPilotOwner, PilotAccessError } from "./pilot-access";
import { readBoundedJson, validateSameOriginMutation } from "./request-security";
import { DEFAULT_CONTACT_FRESHNESS_MS } from "./contact-eligibility";
import type { ContactSettlementAttestor } from "./contact-settlement-attestor";
import { verifyPersistedContactSettlement } from "./contact-settlement-persistence";
import { controlledEnrichmentActivated } from "./phase-activation";

/** Provider-neutral Contacts boundary. Production composition deliberately omits
 * the command runtime until independently verifiable Phase 4 acceptance exists. */
export const CONTACTS_MUTATION_INTENT = "contacts-mutation";
export const MAX_CONTACTS_BODY_BYTES = 4096;

export type ContactsHandlerDependencies = {
  database: D1Database;
  subjectPepper: string;
  pilotOwnerEmail: string;
  getIdentity(): Promise<{ email: string; displayName: string } | null>;
  contactSettlementAttestor?: ContactSettlementAttestor;
  csrfCookieMode?: CsrfCookieMode;
  phase4Accepted?: (context: ContactsCommandContext) => Promise<boolean>;
  runGrantedOperationEnabled?: (context: ContactsCommandContext) => Promise<boolean>;
  identitySplitEnabled?: (context: ContactsCommandContext) => Promise<boolean>;
  commandService?: ContactsCommandService;
};

type Principal = { subject: string; legacySubject?: string; displayName?: string };
export type ContactsCommandContext = Readonly<{ workspaceId: string; principalSubject: string }>;
export type CreateGrantCommand = Readonly<{ prospectId: string; expectedProspectRevision: number; idempotencyKey: string }>;
export type RunGrantedOperationCommand = Readonly<{ grantId: string }>;
export type MergeIdentityCommand = Readonly<{ suggestionId: string; expectedRevision: number; idempotencyKey: string; primaryId: string }>;
export type SplitIdentityCommand = Readonly<{ suggestionId: string; expectedRevision: number; idempotencyKey: string }>;
export type ContactsCommandService = {
  createGrant(context: ContactsCommandContext, command: CreateGrantCommand): Promise<unknown>;
  runGrantedOperation(context: ContactsCommandContext, command: RunGrantedOperationCommand): Promise<unknown>;
  applyIdentityMerge(context: ContactsCommandContext, command: MergeIdentityCommand): Promise<unknown>;
  applyIdentitySplit(context: ContactsCommandContext, command: SplitIdentityCommand): Promise<unknown>;
};
type ContactsAction = "create_grant_confirmation" | "run_granted_operation" | "apply_identity_merge" | "apply_identity_split";
class ContactsCommandError extends Error {}

export async function handleContactsGet(request: Request, dependencies: ContactsHandlerDependencies): Promise<Response> {
  try {
    const principal = await owner(dependencies);
    return withCsrfCookie(
      json(await projection(dependencies, principal)),
      await issueCsrfToken(dependencies.database, principal.subject),
      dependencies.csrfCookieMode,
    );
  } catch (error) { return denial(error); }
}

export async function handleContactsPost(request: Request, dependencies: ContactsHandlerDependencies): Promise<Response> {
  try {
    const principal = await owner(dependencies);
    const rejected = validateSameOriginMutation(request, CONTACTS_MUTATION_INTENT, MAX_CONTACTS_BODY_BYTES);
    if (rejected) return json({ error: rejected.error }, rejected.status);
    await consumeCsrfToken(dependencies.database, principal.subject, csrfTokenFromRequest(request, csrfCookieName(dependencies.csrfCookieMode)));
    const body = await readBoundedJson(request, MAX_CONTACTS_BODY_BYTES);
    if (!record(body) || !isAction(body.action)) return json({ error: "unsupported_action" }, 400);
    assertClosed(body, body.action);
    const workspaceId = await ownedWorkspaceId(dependencies.database, principal);
    const context = Object.freeze({ workspaceId, principalSubject: principal.subject });
    const service = dependencies.commandService;
    // Missing runtime is rejected before either gate inspection can reserve or
    // invoke anything. Production routes intentionally take this branch.
    if (!service) return unavailable(await projection(dependencies, principal, workspaceId));
    const [phase4Accepted, enrichmentActivated] = await Promise.all([
      dependencies.phase4Accepted?.(context) ?? Promise.resolve(false),
      controlledEnrichmentActivated(dependencies.database, workspaceId),
    ]);
    if (!phase4Accepted || !enrichmentActivated) return unavailable(await projection(dependencies, principal, workspaceId));
    if (body.action === "run_granted_operation" && !(await dependencies.runGrantedOperationEnabled?.(context))) return unavailable(await projection(dependencies, principal, workspaceId));
    if (body.action === "apply_identity_split" && !(await dependencies.identitySplitEnabled?.(context))) return unavailable(await projection(dependencies, principal, workspaceId));
    const result = await invokeCommand(service, context, body.action, body);
    const sanitized = sanitizeCommandResult(result);
    if (!sanitized) return json({ error: "contacts_service_result_invalid" }, 503);
    return json({ command: sanitized }, commandStatus(sanitized));
  } catch (error) {
    if (error instanceof PilotAccessError) return privateWorkspaceUnavailable();
    if (error instanceof CsrfTokenError) return json({ error: error.code }, 403);
    if (error instanceof ContactsCommandError) return json({ error: "invalid_command" }, 400);
    if (error instanceof SyntaxError) return json({ error: "invalid_json" }, 400);
    if (error instanceof Error && "status" in error && error.status === 413) return json({ error: "payload_too_large" }, 413);
    return json({ error: "contacts_unavailable" }, 503);
  }
}

type SnapshotRow = { id: string; contact_id: string; prospect_id: string; configuration_id: string; configuration_digest: string; configuration_revision: number; prospect_revision: number; state: string; eligible: number; observation_ids_json: string; reason_codes_json: string; projected_at: number; current_prospect_revision: number | null; prospect_active: number | null; prospect_state: string | null; current_configuration_id: string | null; current_configuration_digest: string | null; current_configuration_revision: number | null; configuration_active: number | null };
type ObservationRow = { id: string; contact_id: string; assignment_id: string; kind: string; verification_class: string; method: string; source_reference: string; retrieved_at: number; observed_at: number; verified_at: number | null; configuration_id: string; configuration_digest: string; assignment_prospect_id: string | null; assignment_contact_id: string | null; assignment_configuration_id: string | null; assignment_configuration_digest: string | null; receipt_reservation_id: string | null };
type IdentityRow = { id: string; subject_kind: string; kind: string; revision: number; candidate_revisions_json: string; source_lineage_ids_json: string; suggestion_digest: string; created_at: number };

async function projection(dependencies: ContactsHandlerDependencies, principal: Principal, knownWorkspaceId?: string) {
  const database = dependencies.database;
  const workspaceId = knownWorkspaceId ?? await ownedWorkspaceId(database, principal);
  const context = Object.freeze({ workspaceId, principalSubject: principal.subject });
  const active = Boolean(dependencies.commandService && dependencies.phase4Accepted)
    && await dependencies.phase4Accepted!(context)
    && await controlledEnrichmentActivated(database, workspaceId);
  const effectiveAttestor = dependencies.contactSettlementAttestor && await contactAttestationActivated(database, workspaceId)
    ? dependencies.contactSettlementAttestor
    : undefined;
  const [snapshots, observations, identities] = await Promise.all([
    database.prepare("SELECT s.id,s.contact_id,s.prospect_id,s.configuration_id,s.configuration_digest,s.configuration_revision,s.prospect_revision,s.state,s.eligible,s.observation_ids_json,s.reason_codes_json,s.projected_at,p.revision AS current_prospect_revision,p.active AS prospect_active,p.state AS prospect_state,c.id AS current_configuration_id,c.digest AS current_configuration_digest,c.revision AS current_configuration_revision,c.active AS configuration_active FROM contact_eligibility_snapshots s LEFT JOIN profile_prospects p ON p.id=s.prospect_id AND p.workspace_id=s.workspace_id LEFT JOIN typed_configurations c ON c.id=s.configuration_id AND c.workspace_id=s.workspace_id AND c.owner_type='profile' AND c.owner_id=p.profile_id AND c.kind='profile_effective' WHERE s.workspace_id=? ORDER BY s.projected_at DESC,s.id DESC").bind(workspaceId).all<SnapshotRow>(),
    database.prepare("SELECT o.id,o.contact_id,o.assignment_id,o.kind,o.verification_class,o.method,o.source_reference,o.retrieved_at,o.observed_at,o.verified_at,o.configuration_id,o.configuration_digest,a.prospect_id AS assignment_prospect_id,a.contact_id AS assignment_contact_id,a.configuration_id AS assignment_configuration_id,a.configuration_digest AS assignment_configuration_digest,receipt.reservation_id AS receipt_reservation_id FROM contact_point_observations o LEFT JOIN contact_evidence_assignments a ON a.id=o.assignment_id AND a.workspace_id=o.workspace_id LEFT JOIN contact_verification_receipts receipt ON receipt.id=o.verification_receipt_id AND receipt.workspace_id=o.workspace_id WHERE o.workspace_id=? ORDER BY o.observed_at DESC,o.id DESC").bind(workspaceId).all<ObservationRow>(),
    database.prepare("SELECT id,subject_kind,kind,revision,candidate_revisions_json,source_lineage_ids_json,suggestion_digest,created_at FROM identity_suggestions WHERE workspace_id=? AND owner_subject=? ORDER BY created_at DESC,id DESC").bind(workspaceId, principal.subject).all<IdentityRow>(),
  ]);
  const observationsById = new Map(observations.results.map(normalizeObservation).filter((row): row is NonNullable<ReturnType<typeof normalizeObservation>> => row !== null).map((row) => [row.id, row]));
  const current = new Map<string, NonNullable<ReturnType<typeof normalizeSnapshot>>>();
  for (const row of snapshots.results.map(normalizeSnapshot)) if (row && !current.has(`${row.prospectId}\u0000${row.contactId}`)) current.set(`${row.prospectId}\u0000${row.contactId}`, row);
  const eligibility = await Promise.all([...current.values()].map((row) =>
    recheckSnapshot(row, observationsById, Date.now(), database, workspaceId, effectiveAttestor)
  ));
  return {
    capability: active
      ? { available: true, status: "ready", reason: "Contacts command authority is available for this server projection." }
      : { available: false, status: "blocked", reason: "Contacts remain unavailable until Phase 4 acceptance and the separate provider capability gate are proven." },
    eligibility,
    verifiedContacts: eligibility.filter((row) => row.state === "ContactReady" && row.eligible),
    suggestions: eligibility.filter((row) => row.state === "ContactSuggestion"),
    needsReview: eligibility.filter((row) => row.state === "NeedsReview" || row.reasonCodes.length > 0),
    identity: identities.results.map(normalizeIdentity).filter((row): row is NonNullable<ReturnType<typeof normalizeIdentity>> => row !== null),
    authority: active
      ? { stage: "ready", grantCreation: "available", operation: "requires_grant", providerCall: false }
      : { stage: "reject_only", grantCreation: "blocked", operation: "blocked", providerCall: false },
  } as const;
}
function normalizeSnapshot(row: SnapshotRow) { if (!boundedId(row.id) || !boundedId(row.contact_id) || !boundedId(row.prospect_id) || !boundedId(row.configuration_id) || !digest(row.configuration_digest) || !positive(row.configuration_revision) || !positive(row.prospect_revision) || !["ContactReady", "ContactSuggestion", "NeedsReview", "NonContactable"].includes(row.state) || !positive(row.projected_at) || (Number(row.eligible) !== 0 && Number(row.eligible) !== 1)) return null; const observationIds = strings(row.observation_ids_json, 100), reasonCodes = strings(row.reason_codes_json, 32); if (!observationIds || !reasonCodes) return null; return { id: row.id, contactId: row.contact_id, prospectId: row.prospect_id, configurationId: row.configuration_id, configurationDigest: row.configuration_digest, configurationRevision: Number(row.configuration_revision), prospectRevision: Number(row.prospect_revision), state: row.state, eligible: Number(row.eligible) === 1, observationIds, reasonCodes, projectedAt: Number(row.projected_at), current: { prospectRevision: positive(row.current_prospect_revision) ? Number(row.current_prospect_revision) : null, prospectActive: Number(row.prospect_active) === 1, prospectState: row.prospect_state, configurationId: boundedId(row.current_configuration_id) ? row.current_configuration_id : null, configurationDigest: digest(row.current_configuration_digest) ? row.current_configuration_digest : null, configurationRevision: positive(row.current_configuration_revision) ? Number(row.current_configuration_revision) : null, configurationActive: Number(row.configuration_active) === 1 } }; }
function normalizeObservation(row: ObservationRow) { if (!boundedId(row.id) || !boundedId(row.contact_id) || !boundedId(row.assignment_id) || !boundedId(row.configuration_id) || !digest(row.configuration_digest) || !["email", "phone"].includes(row.kind) || !["suggested", "domain_valid", "mailbox_verified", "source_verified", "invalid"].includes(row.verification_class) || !["pattern_inference", "domain_validation", "mailbox_verification", "authoritative_source_reconfirmed"].includes(row.method) || !boundedText(row.source_reference, 1000) || !positive(row.retrieved_at) || !positive(row.observed_at) || Number(row.retrieved_at) > Number(row.observed_at) || row.verified_at !== null && (!positive(row.verified_at) || Number(row.verified_at) > Number(row.observed_at))) return null; return { id: row.id, contactId: row.contact_id, assignmentId: row.assignment_id, kind: row.kind, verificationClass: row.verification_class, method: row.method, sourceReference: row.source_reference, retrievedAt: Number(row.retrieved_at), observedAt: Number(row.observed_at), verifiedAt: row.verified_at === null ? null : Number(row.verified_at), configurationId: row.configuration_id, configurationDigest: row.configuration_digest, assignmentProspectId: boundedId(row.assignment_prospect_id) ? row.assignment_prospect_id : null, assignmentContactId: boundedId(row.assignment_contact_id) ? row.assignment_contact_id : null, assignmentConfigurationId: boundedId(row.assignment_configuration_id) ? row.assignment_configuration_id : null, assignmentConfigurationDigest: digest(row.assignment_configuration_digest) ? row.assignment_configuration_digest : null, receiptReservationId: boundedId(row.receipt_reservation_id) ? row.receipt_reservation_id : null }; }
async function recheckSnapshot(snapshot: NonNullable<ReturnType<typeof normalizeSnapshot>>, observationsById: Map<string, NonNullable<ReturnType<typeof normalizeObservation>>>, now: number, database: D1Database, workspaceId: string, contactSettlementAttestor?: ContactSettlementAttestor) { const observations = snapshot.observationIds.map((id) => observationsById.get(id)).filter((item): item is NonNullable<typeof item> => item !== undefined && item.contactId === snapshot.contactId && item.configurationId === snapshot.configurationId && item.configurationDigest === snapshot.configurationDigest && item.assignmentContactId === snapshot.contactId && item.assignmentProspectId === snapshot.prospectId && item.assignmentConfigurationId === snapshot.configurationId && item.assignmentConfigurationDigest === snapshot.configurationDigest); const reasons = new Set(snapshot.reasonCodes); const lineageCurrent = snapshot.current.prospectRevision === snapshot.prospectRevision && snapshot.current.prospectActive && snapshot.current.prospectState === "approved" && snapshot.current.configurationId === snapshot.configurationId && snapshot.current.configurationDigest === snapshot.configurationDigest && snapshot.current.configurationRevision === snapshot.configurationRevision && snapshot.current.configurationActive; if (!lineageCurrent) reasons.add("contact_lineage_drifted"); const freshCandidates = observations.filter((observation) => fresh(observation, now)); const reservationIds = [...new Set(freshCandidates.map((observation) => observation.receiptReservationId).filter((id): id is string => id !== null))]; const verifiedReservations = new Map(await Promise.all(reservationIds.map(async (reservationId) => [reservationId, await verifyPersistedContactSettlement(database, contactSettlementAttestor, workspaceId, reservationId)] as const))); const freshEvidence = freshCandidates.some((observation) => observation.receiptReservationId !== null && verifiedReservations.get(observation.receiptReservationId) === true); if (snapshot.state === "ContactReady" && freshCandidates.length === 0) reasons.add("contact_evidence_stale"); else if (snapshot.state === "ContactReady" && !freshEvidence) reasons.add(contactSettlementAttestor ? "contact_attestation_invalid" : "contact_attestation_unavailable"); const ready = snapshot.state === "ContactReady" && lineageCurrent && freshEvidence; return toPublicContactRow(snapshot, ready ? "ContactReady" : snapshot.state === "ContactReady" ? "NeedsReview" : snapshot.state, ready, [...reasons].sort(), observations); }
export function toPublicContactRow(
  snapshot: Pick<NonNullable<ReturnType<typeof normalizeSnapshot>>, "id" | "contactId" | "prospectId"> & { prospectRevision?: number },
  state: string,
  eligible: boolean,
  reasonCodes: readonly string[],
  observations: readonly NonNullable<ReturnType<typeof normalizeObservation>>[],
) {
  return {
    id: snapshot.id,
    contactId: snapshot.contactId,
    prospectId: snapshot.prospectId,
    ...(positive(snapshot.prospectRevision) ? { prospectRevision: snapshot.prospectRevision } : {}),
    state,
    eligible,
    reasonCodes: [...reasonCodes],
    observations: observations.map(toPublicContactObservation),
  } as const;
}
export function toPublicContactObservation(observation: NonNullable<ReturnType<typeof normalizeObservation>>) {
  const sourceCategory = observation.method === "pattern_inference" ? "inferred_pattern" : observation.method === "domain_validation" ? "domain_check" : observation.method === "mailbox_verification" ? "mailbox_check" : "authoritative_business_source";
  const freshness = observation.verifiedAt === null ? "unverified" : fresh(observation, Date.now()) ? "current" : "stale";
  return {
    kind: observation.kind,
    verificationClass: observation.verificationClass,
    sourceCategory,
    freshness,
    verifiedAt: observation.verifiedAt,
  } as const;
}
function fresh(observation: NonNullable<ReturnType<typeof normalizeObservation>>, now: number) { if (observation.verifiedAt === null || observation.verifiedAt > now) return false; const maxAge = observation.verificationClass === "mailbox_verified" && observation.kind === "email" && observation.method === "mailbox_verification" ? DEFAULT_CONTACT_FRESHNESS_MS.mailboxVerifiedEmail : observation.verificationClass === "source_verified" && observation.kind === "email" && observation.method === "authoritative_source_reconfirmed" ? DEFAULT_CONTACT_FRESHNESS_MS.sourceVerifiedEmail : observation.verificationClass === "source_verified" && observation.kind === "phone" && observation.method === "authoritative_source_reconfirmed" ? DEFAULT_CONTACT_FRESHNESS_MS.verifiedBusinessPhone : null; return maxAge !== null && now < observation.verifiedAt + maxAge; }
function normalizeIdentity(row: IdentityRow) { if (!opaqueId(row.id) || !["contact", "organization"].includes(row.subject_kind) || !["merge", "split"].includes(row.kind) || !positive(row.revision) || !digest(row.suggestion_digest) || !positive(row.created_at)) return null; const candidates = candidateRevisions(row.candidate_revisions_json, 100), lineage = strings(row.source_lineage_ids_json, 100); if (!candidates || !lineage) return null; if (row.kind === "merge" && candidates.length < 2) return null; if (row.kind === "split" && candidates.length !== 1) return null; return { id: row.id, subjectKind: row.subject_kind, kind: row.kind, revision: Number(row.revision), candidateRevisions: candidates, sourceLineageIds: lineage }; }
function strings(value: string, maximum: number) { try { const parsed = JSON.parse(value); if (!Array.isArray(parsed) || parsed.length > maximum || parsed.some((item) => !opaqueId(item))) return null; return parsed; } catch { return null; } }
function candidateRevisions(value: string, maximum: number) { try { const parsed = JSON.parse(value); if (!record(parsed) || Object.keys(parsed).length > maximum) return null; const entries = Object.entries(parsed); if (entries.some(([subjectId, revision]) => !opaqueId(subjectId) || !positive(revision))) return null; return entries.map(([subjectId, revision]) => ({ subjectId, revision: Number(revision) })); } catch { return null; } }
export async function contactAttestationActivated(database: D1Database, workspaceId: string) {
  return controlledEnrichmentActivated(database, workspaceId);
}
function boundedId(value: unknown) { return typeof value === "string" && value.length > 0 && value.length <= 160; }
function opaqueId(value: unknown): value is string { return typeof value === "string" && value.length > 0 && value.length <= 160 && /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(value) && !/^\d{7,15}$/.test(value.replace(/[-_]/g, "")); }
function boundedText(value: unknown, maximum: number) { return typeof value === "string" && value.trim().length > 0 && value.length <= maximum; }
function positive(value: unknown) { return Number.isSafeInteger(Number(value)) && Number(value) > 0; }
function digest(value: unknown) { return typeof value === "string" && /^[0-9a-f]{64}$/.test(value); }
function assertClosed(body: Record<string, unknown>, action: ContactsAction) {
  const allowed: Record<ContactsAction, readonly string[]> = {
    create_grant_confirmation: ["action", "prospectId", "expectedProspectRevision", "idempotencyKey"],
    run_granted_operation: ["action", "grantId"],
    apply_identity_merge: ["action", "suggestionId", "expectedRevision", "idempotencyKey", "primaryId"],
    apply_identity_split: ["action", "suggestionId", "expectedRevision", "idempotencyKey"],
  };
  if (Object.keys(body).some((key) => !allowed[action].includes(key))) throw new ContactsCommandError("invalid_command");
  for (const key of allowed[action]) {
    if (key === "action" || key === "expectedProspectRevision" || key === "expectedRevision") continue;
    if (!opaqueId(body[key])) throw new ContactsCommandError("invalid_command");
  }
  if (action === "create_grant_confirmation" && (!Number.isSafeInteger(body.expectedProspectRevision) || Number(body.expectedProspectRevision) < 1)) throw new ContactsCommandError("invalid_command");
  if ((action === "apply_identity_merge" || action === "apply_identity_split") && (!Number.isSafeInteger(body.expectedRevision) || Number(body.expectedRevision) < 1)) throw new ContactsCommandError("invalid_command");
}
function isAction(value: unknown): value is ContactsAction { return value === "create_grant_confirmation" || value === "run_granted_operation" || value === "apply_identity_merge" || value === "apply_identity_split"; }
async function ownedWorkspaceId(database: D1Database, principal: Principal) {
  const workspace = await database.prepare("SELECT id FROM workspaces WHERE owner_subject IN (?, ?) ORDER BY CASE owner_subject WHEN ? THEN 0 ELSE 1 END LIMIT 1").bind(principal.subject, principal.legacySubject ?? principal.subject, principal.subject).first<{ id: string }>();
  if (!workspace || !opaqueId(workspace.id)) throw new PilotAccessError();
  return workspace.id;
}
async function invokeCommand(service: ContactsCommandService, context: ContactsCommandContext, action: ContactsAction, body: Record<string, unknown>) {
  if (action === "create_grant_confirmation") return service.createGrant(context, Object.freeze({ prospectId: body.prospectId as string, expectedProspectRevision: body.expectedProspectRevision as number, idempotencyKey: body.idempotencyKey as string }));
  if (action === "run_granted_operation") return service.runGrantedOperation(context, Object.freeze({ grantId: body.grantId as string }));
  if (action === "apply_identity_merge") return service.applyIdentityMerge(context, Object.freeze({ suggestionId: body.suggestionId as string, expectedRevision: body.expectedRevision as number, idempotencyKey: body.idempotencyKey as string, primaryId: body.primaryId as string }));
  return service.applyIdentitySplit(context, Object.freeze({ suggestionId: body.suggestionId as string, expectedRevision: body.expectedRevision as number, idempotencyKey: body.idempotencyKey as string }));
}
type PublicCommandResult = Readonly<{
  kind: "grant" | "operation" | "identity";
  status: "created" | "replayed" | "settled" | "reconciliation_required" | "applied" | "conflict" | "stale" | "wrong_scope" | "blocked";
  action?: "merge" | "split";
  grantId?: string; operationId?: string; suggestionId?: string; tupleDigest?: string; resultDigest?: string;
  providerId?: string; providerVersion?: string; unitCostMinor?: number; currency?: string; expiresAt?: number; revision?: number;
}>;
function sanitizeCommandResult(value: unknown): PublicCommandResult | null {
  if (!record(value) || !["grant", "operation", "identity"].includes(String(value.kind)) || !["created", "replayed", "settled", "reconciliation_required", "applied", "conflict", "stale", "wrong_scope", "blocked"].includes(String(value.status))) return null;
  if (!validKindStatus(String(value.kind), String(value.status))) return null;
  if (["conflict", "stale", "wrong_scope", "blocked"].includes(String(value.status))) return Object.freeze({ kind: value.kind, status: value.status }) as PublicCommandResult;
  if (value.kind === "operation") return (value.status === "settled" || value.status === "reconciliation_required") && opaqueId(value.grantId) && opaqueId(value.operationId) && digest(value.resultDigest) && positive(value.revision) ? Object.freeze({ kind: value.kind, status: value.status, grantId: value.grantId, operationId: value.operationId, resultDigest: value.resultDigest, revision: value.revision }) : null;
  if (value.kind === "identity") return value.status === "applied" && (value.action === "merge" || value.action === "split") && opaqueId(value.suggestionId) && digest(value.resultDigest) && positive(value.revision) ? Object.freeze({ kind: value.kind, action: value.action, status: value.status, suggestionId: value.suggestionId, resultDigest: value.resultDigest, revision: value.revision }) : null;
  const result: Record<string, unknown> = { kind: value.kind, status: value.status };
  for (const key of ["grantId", "operationId", "suggestionId"] as const) if (value[key] !== undefined) { if (!opaqueId(value[key])) return null; result[key] = value[key]; }
  for (const key of ["providerId", "providerVersion"] as const) if (value[key] !== undefined) { if (!boundedProviderReference(value[key])) return null; result[key] = value[key]; }
  for (const key of ["tupleDigest", "resultDigest"] as const) if (value[key] !== undefined) { if (!digest(value[key])) return null; result[key] = value[key]; }
  if (value.currency !== undefined) { if (typeof value.currency !== "string" || !/^[A-Z]{3}$/.test(value.currency)) return null; result.currency = value.currency; }
  if (value.unitCostMinor !== undefined) { if (!Number.isSafeInteger(value.unitCostMinor) || Number(value.unitCostMinor) < 0) return null; result.unitCostMinor = value.unitCostMinor; }
  for (const key of ["expiresAt", "revision"] as const) if (value[key] !== undefined) { if (!Number.isSafeInteger(value[key]) || Number(value[key]) < 1) return null; result[key] = value[key]; }
  if (value.kind === "grant" && (value.status === "created" || value.status === "replayed") && !opaqueId(value.grantId)) return null;
  return Object.freeze(result) as PublicCommandResult;
}
function validKindStatus(kind: string, status: string) { return kind === "grant" ? ["created", "replayed", "conflict", "stale", "wrong_scope", "blocked"].includes(status) : kind === "operation" ? ["settled", "reconciliation_required", "conflict", "stale", "wrong_scope", "blocked"].includes(status) : kind === "identity" && ["applied", "conflict", "stale", "wrong_scope", "blocked"].includes(status); }
function boundedProviderReference(value: unknown) { return typeof value === "string" && value.length > 0 && value.length <= 160 && /^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/.test(value); }
function commandStatus(result: PublicCommandResult) { return ["conflict", "stale", "wrong_scope", "blocked"].includes(result.status) ? 409 : 200; }
async function unavailable(projected: Awaited<ReturnType<typeof projection>>) { return json({ error: "contacts_capability_unavailable", projection: projected }, 409); }
async function owner(dependencies: ContactsHandlerDependencies): Promise<Principal> { return admitPilotOwner(await dependencies.getIdentity(), dependencies.pilotOwnerEmail, dependencies.subjectPepper); }
function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }
function json(value: unknown, status = 200) { return Response.json(value, { status, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } }); }
function privateWorkspaceUnavailable() { return json({ error: "private_workspace_unavailable" }, 404); }
function denial(error: unknown) { return error instanceof PilotAccessError ? privateWorkspaceUnavailable() : json({ error: "contacts_unavailable" }, 503); }
