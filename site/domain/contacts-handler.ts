import { consumeCsrfToken, csrfCookieName, csrfTokenFromRequest, CsrfTokenError, issueCsrfToken, withCsrfCookie, type CsrfCookieMode } from "./csrf";
import { admitPilotOwner, PilotAccessError } from "./pilot-access";
import { readBoundedJson, validateSameOriginMutation } from "./request-security";
import { DEFAULT_CONTACT_FRESHNESS_MS } from "./contact-eligibility";
import { contactSettlementAttestorIdentity, type ContactSettlementAttestor } from "./contact-settlement-attestor";
import { verifyPersistedContactSettlement, verifyPersistedContactSettlements } from "./contact-settlement-persistence";
import { controlledEnrichmentActivated } from "./phase-activation";
import { canonicalDigest } from "./enrichment-grant-issuance";
import { CONTACTS_PAGE_LIMIT, ContactsPageDriftError, ContactsPaginationError, pageInfo, parseContactsPagination, type ContactsPageCursor, type ContactsPageKey } from "./contacts-pagination";

/** Provider-neutral Contacts boundary. Production composition deliberately omits
 * the command runtime until independently verifiable Phase 4 acceptance exists. */
export const CONTACTS_MUTATION_INTENT = "contacts-mutation";
export const MAX_CONTACTS_BODY_BYTES = 4096;
export const CONTACTS_CAPABILITY_BUILD_EPOCH = "contacts-capability-build/v1";
class ContactsSchemaUnavailableError extends Error { readonly status = 503; readonly code = "contacts_schema_unavailable"; constructor() { super("contacts_schema_unavailable"); } }

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
  capabilityBuildEpoch?: string;
  now?: () => number;
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
      json(await projection(dependencies, principal, undefined, request)),
      await issueCsrfToken(dependencies.database, principal.subject),
      dependencies.csrfCookieMode,
    );
  } catch (error) { return error instanceof ContactsPaginationError || error instanceof ContactsPageDriftError || error instanceof ContactsSchemaUnavailableError ? json({ error: error.code }, error.status) : denial(error); }
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
type ApprovedProspectRow = { prospect_id: string; prospect_revision: number };
type ContactsProjectionGenerations = Readonly<{ contacts: number; identity: number; approved: number }>;

async function projection(dependencies: ContactsHandlerDependencies, principal: Principal, knownWorkspaceId?: string, request?: Request) {
  const database = dependencies.database;
  const workspaceId = knownWorkspaceId ?? await ownedWorkspaceId(database, principal);
  const context = Object.freeze({ workspaceId, principalSubject: principal.subject });
  const generationsBefore = await loadProjectionGenerations(database, workspaceId);
  const enrichmentActivated = await controlledEnrichmentActivated(database, workspaceId);
  const phase4Accepted = Boolean(dependencies.commandService && dependencies.phase4Accepted)
    && await dependencies.phase4Accepted!(context);
  const active = Boolean(dependencies.commandService) && phase4Accepted && enrichmentActivated;
  const attestorIdentity = enrichmentActivated ? contactSettlementAttestorIdentity(dependencies.contactSettlementAttestor) : null;
  const effectiveAttestor = attestorIdentity ? dependencies.contactSettlementAttestor : undefined;
  const capabilityEpoch = await contactsCapabilityEpoch(dependencies.capabilityBuildEpoch, active, attestorIdentity);
  const cursorScope = scope(workspaceId, principal.subject, dependencies.subjectPepper, capabilityEpoch);
  const requestTime = dependencies.now?.() ?? Date.now();
  const pagination = await parseContactsPagination(request ?? new Request("https://prospector.invalid/api/contacts"), cursorScope, requestTime);
  assertCursorGenerations(pagination, generationsBefore);
  const [contactsPage, identityPage, approvedProspects] = await Promise.all([
    loadContactsPage(database, workspaceId, cursorScope, pagination.contacts, generationsBefore.contacts, requestTime, effectiveAttestor),
    loadIdentityPage(database, workspaceId, cursorScope, pagination.identity, generationsBefore.identity, requestTime),
    active ? loadApprovedPage(database, workspaceId, principal, cursorScope, pagination.approved, generationsBefore.approved, requestTime) : emptyApprovedPage(cursorScope, pagination.approved, generationsBefore.approved),
  ]);
  const generationsAfter = await loadProjectionGenerations(database, workspaceId);
  if (!sameGenerations(generationsBefore, generationsAfter)) throw new ContactsPageDriftError();
  return {
    capability: active
      ? { available: true, status: "ready", reason: "Contacts command authority is available for this server projection." }
      : { available: false, status: "blocked", reason: "Contacts remain unavailable until Phase 4 acceptance and the separate provider capability gate are proven." },
    contactsPage,
    identityPage,
    approvedProspects,
    authority: active
      ? { stage: "ready", grantCreation: "available", operation: "requires_grant", providerCall: false }
      : { stage: "reject_only", grantCreation: "blocked", operation: "blocked", providerCall: false },
  } as const;
}
const SNAPSHOT_SELECT = "SELECT s.id,s.contact_id,s.prospect_id,s.configuration_id,s.configuration_digest,s.configuration_revision,s.prospect_revision,s.state,s.eligible,s.observation_ids_json,s.reason_codes_json,s.projected_at,p.revision AS current_prospect_revision,p.active AS prospect_active,p.state AS prospect_state,c.id AS current_configuration_id,c.digest AS current_configuration_digest,c.revision AS current_configuration_revision,c.active AS configuration_active FROM contact_eligibility_snapshots s LEFT JOIN profile_prospects p ON p.id=s.prospect_id AND p.workspace_id=s.workspace_id LEFT JOIN typed_configurations c ON c.id=s.configuration_id AND c.workspace_id=s.workspace_id AND c.owner_type='profile' AND c.owner_id=p.profile_id AND c.kind='profile_effective'";
async function loadContactsPage(database: D1Database, workspaceId: string, cursorScope: ReturnType<typeof scope>, cursor: ContactsPageCursor, generation: number, requestTime: number, attestor?: ContactSettlementAttestor) {
  const upper = cursor.highWater ? tupleBound("s.projected_at", "s.id", cursor.highWater) : timeBound("s.projected_at", requestTime);
  const laterUpper = cursor.highWater ? tupleBound("later.projected_at", "later.id", cursor.highWater) : timeBound("later.projected_at", requestTime);
  const after = cursor.after ? " AND (s.projected_at<? OR (s.projected_at=? AND s.id<?))" : "";
  const current = `${upper.sql} AND NOT EXISTS (SELECT 1 FROM contact_eligibility_snapshots later WHERE later.workspace_id=s.workspace_id AND later.prospect_id=s.prospect_id AND later.contact_id=s.contact_id AND ${laterUpper.sql} AND (later.projected_at>s.projected_at OR (later.projected_at=s.projected_at AND later.id>s.id)))`;
  const bindings: unknown[] = [workspaceId, ...upper.bindings, ...laterUpper.bindings];
  if (cursor.after) bindings.push(cursor.after.time, cursor.after.time, cursor.after.id);
  const rows = (await database.prepare(`${SNAPSHOT_SELECT} WHERE s.workspace_id=? AND ${current}${after} ORDER BY s.projected_at DESC,s.id DESC LIMIT ${CONTACTS_PAGE_LIMIT + 1}`).bind(...bindings).all<SnapshotRow>()).results;
  const totalRow = await database.prepare(`SELECT count(*) total FROM contact_eligibility_snapshots s WHERE s.workspace_id=? AND ${current}`).bind(workspaceId, ...upper.bindings, ...laterUpper.bindings).first<{ total: number }>();
  const normalizedRows = rows.map(normalizeSnapshot);
  if (normalizedRows.some((row) => row === null)) throw new Error("invalid_contact_page");
  const snapshots = normalizedRows.slice(0, CONTACTS_PAGE_LIMIT) as NonNullable<ReturnType<typeof normalizeSnapshot>>[];
  const observations = await loadReferencedObservations(database, workspaceId, [...new Set(snapshots.flatMap((row) => row.observationIds))]);
  const observationsById = new Map(observations.map((row) => [row.id, row]));
  const reservationIds = exactFreshReservationIds(snapshots, observationsById, requestTime);
  const verifiedReservations = await verifyPersistedContactSettlements(database, attestor, workspaceId, reservationIds);
  const items = await Promise.all(snapshots.map((row) => recheckSnapshot(row, observationsById, requestTime, database, workspaceId, attestor, verifiedReservations)));
  const effectiveCursor = withHighWater(cursor, rows[0] ? { time: Number(rows[0].projected_at), id: rows[0].id } : null, generation);
  return { items, pageInfo: await pageInfo("contacts", cursorScope, effectiveCursor, Number(totalRow?.total ?? 0), rows.map((row) => ({ time: Number(row.projected_at), id: row.id }))) };
}

async function loadIdentityPage(database: D1Database, workspaceId: string, cursorScope: ReturnType<typeof scope>, cursor: ContactsPageCursor, generation: number, requestTime: number) {
  const upper = cursor.highWater ? tupleBound("created_at", "id", cursor.highWater) : timeBound("created_at", requestTime);
  const after = cursor.after ? " AND (created_at<? OR (created_at=? AND id<?))" : "";
  const bindings: unknown[] = [workspaceId, cursorScope.principalSubject, ...upper.bindings];
  if (cursor.after) bindings.push(cursor.after.time, cursor.after.time, cursor.after.id);
  const rows = (await database.prepare(`SELECT id,subject_kind,kind,revision,candidate_revisions_json,source_lineage_ids_json,suggestion_digest,created_at FROM identity_suggestions WHERE workspace_id=? AND owner_subject=? AND ${upper.sql}${after} ORDER BY created_at DESC,id DESC LIMIT ${CONTACTS_PAGE_LIMIT + 1}`).bind(...bindings).all<IdentityRow>()).results;
  const totalRow = await database.prepare(`SELECT count(*) total FROM identity_suggestions WHERE workspace_id=? AND owner_subject=? AND ${upper.sql}`).bind(workspaceId, cursorScope.principalSubject, ...upper.bindings).first<{ total: number }>();
  const normalizedRows = rows.map(normalizeIdentity);
  if (normalizedRows.some((row) => row === null)) throw new Error("invalid_identity_page");
  const effectiveCursor = withHighWater(cursor, rows[0] ? { time: Number(rows[0].created_at), id: rows[0].id } : null, generation);
  return { items: normalizedRows.slice(0, CONTACTS_PAGE_LIMIT), pageInfo: await pageInfo("identity", cursorScope, effectiveCursor, Number(totalRow?.total ?? 0), rows.map((row) => ({ time: Number(row.created_at), id: row.id }))) };
}

const APPROVED_FROM = `FROM profile_prospects p
  JOIN workspaces w ON w.id=p.workspace_id
  JOIN typed_configurations c ON c.workspace_id=p.workspace_id AND c.owner_type='profile' AND c.owner_id=p.profile_id AND c.kind='profile_effective' AND c.active=1
  JOIN prospecting_candidates pc ON pc.id=p.candidate_id AND pc.workspace_id=p.workspace_id AND pc.profile_id=p.profile_id AND pc.configuration_id=c.id AND pc.status IN ('observed','qualified')
  JOIN qualification_assessments qa ON qa.id=p.assessment_id AND qa.workspace_id=p.workspace_id AND qa.candidate_id=pc.id AND qa.configuration_id=c.id AND qa.configuration_digest=c.digest AND qa.outcome='Passed'
  WHERE p.workspace_id=? AND w.owner_subject IN (?,?) AND p.active=1 AND p.state='approved' AND p.updated_at<=?`;
async function loadApprovedPage(database: D1Database, workspaceId: string, principal: Principal, cursorScope: ReturnType<typeof scope>, cursor: ContactsPageCursor, generation: number, requestTime: number) {
  const legacy = principal.legacySubject ?? principal.subject;
  const currentAuthorityDigest = await canonicalDigest({ schema: "approved-prospect-authority-generation/v1", workspaceId, generation });
  const authorityTop = await database.prepare(`SELECT p.id,p.updated_at ${APPROVED_FROM} ORDER BY p.updated_at DESC,p.id DESC LIMIT 1`).bind(workspaceId, principal.subject, legacy, requestTime).first<{ id: string; updated_at: number }>();
  const currentHighWater = authorityTop && positive(authorityTop.updated_at) && opaqueId(authorityTop.id) ? { time: Number(authorityTop.updated_at), id: authorityTop.id } : null;
  if (cursor.highWater && (!currentHighWater || compareKey(cursor.highWater, currentHighWater) !== 0 || cursor.authorityDigest !== currentAuthorityDigest)) throw new ContactsPageDriftError();
  const effectiveCursor = withHighWater(cursor, currentHighWater, generation, currentAuthorityDigest);
  const upper = effectiveCursor.highWater ? tupleBound("p.updated_at", "p.id", effectiveCursor.highWater) : timeBound("p.updated_at", requestTime);
  const after = cursor.after ? " AND (p.updated_at<? OR (p.updated_at=? AND p.id<?))" : "";
  const bindings: unknown[] = [workspaceId, principal.subject, legacy, ...upper.bindings];
  if (cursor.after) bindings.push(cursor.after.time, cursor.after.time, cursor.after.id);
  const rows = (await database.prepare(`SELECT p.id prospect_id,p.revision prospect_revision,p.updated_at ${APPROVED_FROM.replace("p.updated_at<=?", upper.sql)}${after} ORDER BY p.updated_at DESC,p.id DESC LIMIT ${CONTACTS_PAGE_LIMIT + 1}`).bind(...bindings).all<ApprovedProspectRow & { updated_at: number }>()).results;
  const totalRow = await database.prepare(`SELECT count(*) total ${APPROVED_FROM.replace("p.updated_at<=?", upper.sql)}`).bind(workspaceId, principal.subject, legacy, ...upper.bindings).first<{ total: number }>();
  const normalizedRows = rows.map((row) => ({ prospectId: row.prospect_id, prospectRevision: Number(row.prospect_revision) }));
  if (normalizedRows.some((row) => !opaqueId(row.prospectId) || !positive(row.prospectRevision)) || new Set(normalizedRows.map((row) => row.prospectId)).size !== normalizedRows.length) throw new Error("invalid_approved_prospect_projection");
  const items = normalizedRows.slice(0, CONTACTS_PAGE_LIMIT);
  return { items, pageInfo: await pageInfo("approved", cursorScope, effectiveCursor, Number(totalRow?.total ?? 0), rows.map((row) => ({ time: Number(row.updated_at), id: row.prospect_id }))) };
}
async function emptyApprovedPage(cursorScope: ReturnType<typeof scope>, cursor: ContactsPageCursor, generation: number) { return { items: [], pageInfo: await pageInfo("approved", cursorScope, { ...cursor, generation }, 0, []) }; }
function scope(workspaceId: string, principalSubject: string, secret: string, capabilityEpoch: string) { return Object.freeze({ workspaceId, principalSubject, secret, capabilityEpoch }); }
async function contactsCapabilityEpoch(buildEpoch: string | undefined, active: boolean, attestorIdentity: ReturnType<typeof contactSettlementAttestorIdentity>) {
  if ((active || attestorIdentity) && buildEpoch === undefined) throw new Error("contacts_capability_build_epoch_required");
  const epoch = buildEpoch ?? CONTACTS_CAPABILITY_BUILD_EPOCH;
  if (typeof epoch !== "string" || epoch.length < 1 || epoch.length > 160 || !/^[A-Za-z0-9._/-]+$/.test(epoch)) throw new Error("invalid_contacts_capability_build_epoch");
  return canonicalDigest({ schema: "contacts-capability-epoch/v1", buildEpoch: epoch, active, attestorIdentity });
}
function timeBound(timeColumn: string, time: number) { return { sql: `${timeColumn}<=?`, bindings: [time] as unknown[] }; }
function tupleBound(timeColumn: string, idColumn: string, key: ContactsPageKey) { return { sql: `(${timeColumn}<? OR (${timeColumn}=? AND ${idColumn}<=?))`, bindings: [key.time, key.time, key.id] as unknown[] }; }
function withHighWater(cursor: ContactsPageCursor, highWater: ContactsPageKey | null, generation: number, authorityDigest = cursor.authorityDigest): ContactsPageCursor { return cursor.highWater ? cursor : { highWater, after: cursor.after, generation, authorityDigest }; }
function compareKey(left: ContactsPageKey, right: ContactsPageKey) { return left.time === right.time ? left.id < right.id ? -1 : left.id > right.id ? 1 : 0 : left.time < right.time ? -1 : 1; }

async function loadProjectionGenerations(database: D1Database, workspaceId: string): Promise<ContactsProjectionGenerations> {
  let row: { contacts_generation: number; identity_generation: number; approved_generation: number } | null;
  try {
    row = await database.prepare("SELECT contacts_generation,identity_generation,approved_generation FROM contacts_projection_generations WHERE workspace_id=? LIMIT 1").bind(workspaceId).first<{ contacts_generation: number; identity_generation: number; approved_generation: number }>();
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("no such table: contacts_projection_generations")) throw error;
    throw new ContactsSchemaUnavailableError();
  }
  const contacts = Number(row?.contacts_generation ?? 0), identity = Number(row?.identity_generation ?? 0), approved = Number(row?.approved_generation ?? 0);
  if (![contacts, identity, approved].every((value) => Number.isSafeInteger(value) && value >= 0 && value < Number.MAX_SAFE_INTEGER)) throw new Error("invalid_contacts_projection_generation");
  return Object.freeze({ contacts, identity, approved });
}
function assertCursorGenerations(pagination: Awaited<ReturnType<typeof parseContactsPagination>>, generations: ContactsProjectionGenerations) {
  if ((pagination.contacts.generation !== null && pagination.contacts.generation !== generations.contacts)
    || (pagination.identity.generation !== null && pagination.identity.generation !== generations.identity)
    || (pagination.approved.generation !== null && pagination.approved.generation !== generations.approved)) throw new ContactsPageDriftError();
}
function sameGenerations(left: ContactsProjectionGenerations, right: ContactsProjectionGenerations) { return left.contacts === right.contacts && left.identity === right.identity && left.approved === right.approved; }

async function loadReferencedObservations(database: D1Database, workspaceId: string, ids: readonly string[]) {
  if (ids.length === 0) return [];
  validateReferencedObservationIds(ids);
  const rows = (await database.prepare(`SELECT o.id,o.contact_id,o.assignment_id,o.kind,o.verification_class,o.method,o.source_reference,o.retrieved_at,o.observed_at,o.verified_at,o.configuration_id,o.configuration_digest,a.prospect_id AS assignment_prospect_id,a.contact_id AS assignment_contact_id,a.configuration_id AS assignment_configuration_id,a.configuration_digest AS assignment_configuration_digest,receipt.reservation_id AS receipt_reservation_id FROM contact_point_observations o JOIN json_each(?) requested ON requested.value=o.id LEFT JOIN contact_evidence_assignments a ON a.id=o.assignment_id AND a.workspace_id=o.workspace_id LEFT JOIN contact_verification_receipts receipt ON receipt.id=o.verification_receipt_id AND receipt.workspace_id=o.workspace_id WHERE o.workspace_id=?`).bind(JSON.stringify(ids), workspaceId).all<ObservationRow>()).results;
  const normalized = rows.map(normalizeObservation);
  if (normalized.some((row) => row === null)) throw new Error("invalid_contact_observation_page");
  return normalized as NonNullable<ReturnType<typeof normalizeObservation>>[];
}
export function validateReferencedObservationIds(ids: readonly string[]) { if (ids.length > 2_000 || ids.some((id) => !opaqueId(id))) throw new Error("contact_page_observation_bound_exceeded"); return ids; }
function exactFreshReservationIds(snapshots: readonly NonNullable<ReturnType<typeof normalizeSnapshot>>[], observations: ReadonlyMap<string, NonNullable<ReturnType<typeof normalizeObservation>>>, now: number) { const ids = new Set<string>(); for (const snapshot of snapshots) for (const id of snapshot.observationIds) { const observation = observations.get(id); if (observation && exactObservationLink(snapshot, observation) && fresh(observation, now) && observation.receiptReservationId) ids.add(observation.receiptReservationId); } return [...ids]; }
function exactObservationLink(snapshot: NonNullable<ReturnType<typeof normalizeSnapshot>>, observation: NonNullable<ReturnType<typeof normalizeObservation>>) { return observation.contactId === snapshot.contactId && observation.configurationId === snapshot.configurationId && observation.configurationDigest === snapshot.configurationDigest && observation.assignmentContactId === snapshot.contactId && observation.assignmentProspectId === snapshot.prospectId && observation.assignmentConfigurationId === snapshot.configurationId && observation.assignmentConfigurationDigest === snapshot.configurationDigest; }
function normalizeSnapshot(row: SnapshotRow) { if (!boundedId(row.id) || !boundedId(row.contact_id) || !boundedId(row.prospect_id) || !boundedId(row.configuration_id) || !digest(row.configuration_digest) || !positive(row.configuration_revision) || !positive(row.prospect_revision) || !["ContactReady", "ContactSuggestion", "NeedsReview", "NonContactable"].includes(row.state) || !positive(row.projected_at) || (Number(row.eligible) !== 0 && Number(row.eligible) !== 1)) return null; const observationIds = strings(row.observation_ids_json, 100), reasonCodes = strings(row.reason_codes_json, 32); if (!observationIds || !reasonCodes) return null; return { id: row.id, contactId: row.contact_id, prospectId: row.prospect_id, configurationId: row.configuration_id, configurationDigest: row.configuration_digest, configurationRevision: Number(row.configuration_revision), prospectRevision: Number(row.prospect_revision), state: row.state, eligible: Number(row.eligible) === 1, observationIds, reasonCodes, projectedAt: Number(row.projected_at), current: { prospectRevision: positive(row.current_prospect_revision) ? Number(row.current_prospect_revision) : null, prospectActive: Number(row.prospect_active) === 1, prospectState: row.prospect_state, configurationId: boundedId(row.current_configuration_id) ? row.current_configuration_id : null, configurationDigest: digest(row.current_configuration_digest) ? row.current_configuration_digest : null, configurationRevision: positive(row.current_configuration_revision) ? Number(row.current_configuration_revision) : null, configurationActive: Number(row.configuration_active) === 1 } }; }
function normalizeObservation(row: ObservationRow) { if (!boundedId(row.id) || !boundedId(row.contact_id) || !boundedId(row.assignment_id) || !boundedId(row.configuration_id) || !digest(row.configuration_digest) || !["email", "phone"].includes(row.kind) || !["suggested", "domain_valid", "mailbox_verified", "source_verified", "invalid"].includes(row.verification_class) || !["pattern_inference", "domain_validation", "mailbox_verification", "authoritative_source_reconfirmed"].includes(row.method) || !boundedText(row.source_reference, 1000) || !positive(row.retrieved_at) || !positive(row.observed_at) || Number(row.retrieved_at) > Number(row.observed_at) || row.verified_at !== null && (!positive(row.verified_at) || Number(row.verified_at) > Number(row.observed_at))) return null; return { id: row.id, contactId: row.contact_id, assignmentId: row.assignment_id, kind: row.kind, verificationClass: row.verification_class, method: row.method, sourceReference: row.source_reference, retrievedAt: Number(row.retrieved_at), observedAt: Number(row.observed_at), verifiedAt: row.verified_at === null ? null : Number(row.verified_at), configurationId: row.configuration_id, configurationDigest: row.configuration_digest, assignmentProspectId: boundedId(row.assignment_prospect_id) ? row.assignment_prospect_id : null, assignmentContactId: boundedId(row.assignment_contact_id) ? row.assignment_contact_id : null, assignmentConfigurationId: boundedId(row.assignment_configuration_id) ? row.assignment_configuration_id : null, assignmentConfigurationDigest: digest(row.assignment_configuration_digest) ? row.assignment_configuration_digest : null, receiptReservationId: boundedId(row.receipt_reservation_id) ? row.receipt_reservation_id : null }; }
async function recheckSnapshot(snapshot: NonNullable<ReturnType<typeof normalizeSnapshot>>, observationsById: Map<string, NonNullable<ReturnType<typeof normalizeObservation>>>, now: number, database: D1Database, workspaceId: string, contactSettlementAttestor?: ContactSettlementAttestor, preverified?: ReadonlyMap<string, boolean>) { const observations = snapshot.observationIds.map((id) => observationsById.get(id)).filter((item): item is NonNullable<typeof item> => item !== undefined && exactObservationLink(snapshot, item)); const reasons = new Set(snapshot.reasonCodes); const lineageCurrent = snapshot.current.prospectRevision === snapshot.prospectRevision && snapshot.current.prospectActive && snapshot.current.prospectState === "approved" && snapshot.current.configurationId === snapshot.configurationId && snapshot.current.configurationDigest === snapshot.configurationDigest && snapshot.current.configurationRevision === snapshot.configurationRevision && snapshot.current.configurationActive; if (!lineageCurrent) reasons.add("contact_lineage_drifted"); const freshCandidates = observations.filter((observation) => fresh(observation, now)); const reservationIds = [...new Set(freshCandidates.map((observation) => observation.receiptReservationId).filter((id): id is string => id !== null))]; const verifiedReservations = preverified ?? new Map(await Promise.all(reservationIds.map(async (reservationId) => [reservationId, await verifyPersistedContactSettlement(database, contactSettlementAttestor, workspaceId, reservationId)] as const))); const freshEvidence = freshCandidates.some((observation) => observation.receiptReservationId !== null && verifiedReservations.get(observation.receiptReservationId) === true); if (snapshot.state === "ContactReady" && freshCandidates.length === 0) reasons.add("contact_evidence_stale"); else if (snapshot.state === "ContactReady" && !freshEvidence) reasons.add(contactSettlementAttestor ? "contact_attestation_invalid" : "contact_attestation_unavailable"); const ready = snapshot.state === "ContactReady" && lineageCurrent && freshEvidence; return toPublicContactRow(snapshot, ready ? "ContactReady" : snapshot.state === "ContactReady" ? "NeedsReview" : snapshot.state, ready, [...reasons].sort(), observations, now); }
export function toPublicContactRow(
  snapshot: Pick<NonNullable<ReturnType<typeof normalizeSnapshot>>, "id" | "contactId" | "prospectId"> & { prospectRevision?: number },
  state: string,
  eligible: boolean,
  reasonCodes: readonly string[],
  observations: readonly NonNullable<ReturnType<typeof normalizeObservation>>[],
  now = Date.now(),
) {
  return {
    id: snapshot.id,
    contactId: snapshot.contactId,
    prospectId: snapshot.prospectId,
    ...(positive(snapshot.prospectRevision) ? { prospectRevision: snapshot.prospectRevision } : {}),
    state,
    eligible,
    reasonCodes: [...reasonCodes],
    observations: observations.map((observation) => toPublicContactObservation(observation, now)),
  } as const;
}
export function toPublicContactObservation(observation: NonNullable<ReturnType<typeof normalizeObservation>>, now = Date.now()) {
  const sourceCategory = observation.method === "pattern_inference" ? "inferred_pattern" : observation.method === "domain_validation" ? "domain_check" : observation.method === "mailbox_verification" ? "mailbox_check" : "authoritative_business_source";
  const freshness = observation.verifiedAt === null ? "unverified" : fresh(observation, now) ? "current" : "stale";
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
