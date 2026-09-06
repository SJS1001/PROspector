/**
 * Closed, owner-admitted transport for the local person-discovery boundary.
 *
 * This deliberately is not composed by the production app route.  Tests may
 * inject the C1 service; an omitted service is a reject-only capability, not
 * a fallback that can acquire a provider.
 */
import { consumeCsrfToken, csrfCookieName, csrfTokenFromRequest, CsrfTokenError, issueCsrfToken, withCsrfCookie, type CsrfCookieMode } from "./csrf";
import { admitPilotOwner, PilotAccessError } from "./pilot-access";
import { readBoundedJson, validateSameOriginMutation } from "./request-security";
import type { PersonDiscoveryService } from "./person-discovery";
import { isDiscoveryRunAuthorityCurrent, loadApprovedProspectAuthority, loadRelevanceAuthority, readDecisionByIdempotency, readDiscoveryRun, readDiscoveryRunByIdempotency, readVerificationIntentByIdempotency } from "./person-discovery-repository";

export const PERSON_DISCOVERY_MUTATION_INTENT = "person-discovery-mutation";
export const PERSON_DISCOVERY_PAGE_LIMIT = 5;
const MAX_BODY_BYTES = 4096;
const CURSOR_DOMAIN = "prospector.person-discovery.people.v1";
const CURSOR_SCHEMA = "person-discovery-people/v1";

type Principal = Readonly<{ subject: string; legacySubject?: string }>;
export type PersonDiscoveryHandlerDependencies = Readonly<{
  database: D1Database;
  subjectPepper: string;
  pilotOwnerEmail: string;
  getIdentity(): Promise<{ email: string; displayName: string } | null>;
  /** Explicit test composition only. Production deliberately leaves this absent. */
  personDiscoveryService?: PersonDiscoveryService;
  csrfCookieMode?: CsrfCookieMode;
  now?: () => number;
}>;

type Action = "start_person_discovery" | "decide_person_discovery" | "record_verification_intent";
type Key = Readonly<{ time: number; id: string }>;
type Cursor = Readonly<{ prospectId: string; prospectRevision: number; configurationDigest: string; runId: string; resultDigest: string; highWater: Key; after: Key; generation: number }>;

export async function handlePersonDiscoveryGet(request: Request, dependencies: PersonDiscoveryHandlerDependencies): Promise<Response> {
  try {
    const principal = await owner(dependencies);
    const workspace = await ownedWorkspace(dependencies.database, principal);
    const projection = await readProjection(request, dependencies, workspace.id, workspace.ownerSubject);
    return withCsrfCookie(json(projection), await issueCsrfToken(dependencies.database, principal.subject), dependencies.csrfCookieMode);
  } catch (error) {
    if (error instanceof CursorDriftError) return json({ error: "people_page_drifted" }, 409);
    if (error instanceof CursorError) return json({ error: "invalid_people_cursor" }, 400);
    return denial(error);
  }
}

export async function handlePersonDiscoveryPost(request: Request, dependencies: PersonDiscoveryHandlerDependencies): Promise<Response> {
  try {
    const principal = await owner(dependencies);
    const rejected = validateSameOriginMutation(request, PERSON_DISCOVERY_MUTATION_INTENT, MAX_BODY_BYTES);
    if (rejected) return json({ error: rejected.error }, rejected.status);
    await consumeCsrfToken(dependencies.database, principal.subject, csrfTokenFromRequest(request, csrfCookieName(dependencies.csrfCookieMode)));
    const body = await readBoundedJson(request, MAX_BODY_BYTES);
    if (!record(body) || !isAction(body.action)) return json({ error: "unsupported_action" }, 400);
    assertClosed(body, body.action);
    const workspace = await ownedWorkspace(dependencies.database, principal);
    const scope = Object.freeze({ workspaceId: workspace.id, principalSubject: workspace.ownerSubject });
    const service = dependencies.personDiscoveryService;
    if (!service) return json({ error: "person_discovery_capability_unavailable" }, 409);
    const result = await invoke(service, scope, body, dependencies.database);
    const safe = sanitize(result, body.action);
    return json({ command: safe }, commandStatus(safe));
  } catch (error) {
    if (error instanceof PilotAccessError) return privateUnavailable();
    if (error instanceof CsrfTokenError) return json({ error: error.code }, 403);
    if (error instanceof CommandError) return json({ error: "invalid_command" }, 400);
    if (error instanceof SyntaxError) return json({ error: "invalid_json" }, 400);
    if (error instanceof Error && "status" in error && error.status === 413) return json({ error: "payload_too_large" }, 413);
    return json({ error: "person_discovery_unavailable" }, 503);
  }
}

async function invoke(service: PersonDiscoveryService, scope: { workspaceId: string; principalSubject: string }, body: Record<string, unknown>, database: D1Database) {
  if (body.action === "start_person_discovery") {
    const prior = await readDiscoveryRunByIdempotency(database, scope, body.idempotencyKey as string);
    if (prior) {
      const stored = await database.prepare("SELECT prospect_id,prospect_revision,configuration_id,configuration_digest,configuration_revision,max_candidates,max_provenance_per_candidate FROM person_discovery_runs WHERE id=? AND workspace_id=? AND owner_subject=?").bind(prior.id, scope.workspaceId, scope.principalSubject).first<{ prospect_id: string; prospect_revision: number; configuration_id: string; configuration_digest: string; configuration_revision: number; max_candidates: number; max_provenance_per_candidate: number }>();
      if (!stored) return Object.freeze({ kind: "blocked", reason: "stale_or_foreign_authority" });
      if (body.prospectId !== stored.prospect_id || body.expectedProspectRevision !== Number(stored.prospect_revision) || body.maxCandidates !== Number(stored.max_candidates) || body.maxProvenancePerCandidate !== Number(stored.max_provenance_per_candidate)) return Object.freeze({ kind: "conflict", reason: "idempotency_conflict" });
      return service.start(scope, Object.freeze({ prospectId: stored.prospect_id, expectedProspectRevision: Number(stored.prospect_revision), expectedConfigurationId: stored.configuration_id, expectedConfigurationDigest: stored.configuration_digest, expectedConfigurationRevision: Number(stored.configuration_revision), maxCandidates: Number(stored.max_candidates), maxProvenancePerCandidate: Number(stored.max_provenance_per_candidate), idempotencyKey: body.idempotencyKey }));
    }
    const authority = await loadApprovedProspectAuthority(database, scope, body.prospectId as string);
    if (!authority || authority.prospectRevision !== body.expectedProspectRevision) return Object.freeze({ kind: "blocked", reason: "stale_or_foreign_authority" });
    return service.start(scope, Object.freeze({
      prospectId: authority.prospectId, expectedProspectRevision: authority.prospectRevision,
      expectedConfigurationId: authority.configurationId, expectedConfigurationDigest: authority.configurationDigest,
      expectedConfigurationRevision: authority.configurationRevision, maxCandidates: body.maxCandidates,
      maxProvenancePerCandidate: body.maxProvenancePerCandidate, idempotencyKey: body.idempotencyKey,
    }));
  }
  if (body.action === "decide_person_discovery") {
    const prior = await readDecisionByIdempotency(database, scope, body.idempotencyKey as string);
    if (prior) {
      const stored = await database.prepare("SELECT decision.run_id,decision.candidate_id,decision.decision,decision.contact_id,decision.expected_result_digest,run.prospect_revision FROM person_discovery_owner_decisions decision JOIN person_discovery_runs run ON run.id=decision.run_id AND run.workspace_id=decision.workspace_id WHERE decision.id=? AND decision.workspace_id=?").bind(prior.id, scope.workspaceId).first<{ run_id: string; candidate_id: string | null; decision: string; contact_id: string | null; expected_result_digest: string; prospect_revision: number }>();
      if (!stored || body.runId !== stored.run_id || body.expectedResultDigest !== stored.expected_result_digest || body.decision !== stored.decision || body.expectedProspectRevision !== Number(stored.prospect_revision) || (opaque(body.candidateId) ? body.candidateId : null) !== stored.candidate_id || (stored.decision === "link_existing" && body.existingContactId !== stored.contact_id)) return Object.freeze({ kind: "conflict", reason: "idempotency_conflict" });
      // The exact durable decision has already been loaded and compared above.
      // Re-entering C1 with a reconstructed optional-field shape risks turning
      // a valid replay into a new semantic command; transport replay is purely
      // a projection of the immutable stored decision.
      return Object.freeze({ kind: "accepted", decision: prior, replayed: true });
    }
    const run = await readDiscoveryRun(database, scope, body.runId as string);
    const runScope = await database.prepare("SELECT prospect_id FROM person_discovery_runs WHERE id=? AND workspace_id=? AND owner_subject=? LIMIT 1").bind(body.runId, scope.workspaceId, scope.principalSubject).first<{ prospect_id: string }>();
    const authority = runScope && opaque(runScope.prospect_id) ? await loadApprovedProspectAuthority(database, scope, runScope.prospect_id) : null;
    if (!run || !authority || authority.prospectRevision !== body.expectedProspectRevision || run.resultDigest !== body.expectedResultDigest || run.status !== "completed") return Object.freeze({ kind: "blocked", reason: "stale_or_foreign_authority" });
    return service.decide(scope, Object.freeze({ runId: run.id, expectedResultDigest: run.resultDigest, decision: body.decision, ...(opaque(body.candidateId) ? { candidateId: body.candidateId } : {}), ...(opaque(body.existingContactId) ? { existingContactId: body.existingContactId } : {}), idempotencyKey: body.idempotencyKey }));
  }
  const prior = await readVerificationIntentByIdempotency(database, scope, body.idempotencyKey as string);
  if (prior) {
    const stored = await database.prepare("SELECT relevance_id,intent,channel,source_observation_id,prospect_revision,contact_revision FROM contact_verification_intents WHERE id=? AND workspace_id=?").bind(prior.id, scope.workspaceId).first<{ relevance_id: string; intent: string; channel: string; source_observation_id: string | null; prospect_revision: number; contact_revision: number }>();
    if (!stored || body.relevanceId !== stored.relevance_id || body.intent !== stored.intent || body.channel !== stored.channel || (opaque(body.sourceObservationId) ? body.sourceObservationId : null) !== stored.source_observation_id || body.expectedProspectRevision !== Number(stored.prospect_revision) || body.expectedContactRevision !== Number(stored.contact_revision)) return Object.freeze({ kind: "conflict", reason: "idempotency_conflict" });
    return Object.freeze({ kind: "accepted", intent: prior, replayed: true, providerCallAuthorized: false, contactEvidenceCreated: false });
  }
  const authority = await loadRelevanceAuthority(database, scope, body.relevanceId as string);
  if (!authority || authority.prospectRevision !== body.expectedProspectRevision || authority.contactRevision !== body.expectedContactRevision) return Object.freeze({ kind: "blocked", reason: "stale_or_foreign_authority" });
  return service.recordVerificationIntent(scope, Object.freeze({
    relevanceId: authority.relevanceId, intent: body.intent, channel: body.channel, ...(opaque(body.sourceObservationId) ? { sourceObservationId: body.sourceObservationId } : {}),
    expectedProspectRevision: authority.prospectRevision, expectedContactRevision: authority.contactRevision,
    expectedConfigurationId: authority.configurationId, expectedConfigurationDigest: authority.configurationDigest,
    expectedConfigurationRevision: authority.configurationRevision, idempotencyKey: body.idempotencyKey,
  }));
}

async function readProjection(request: Request, dependencies: PersonDiscoveryHandlerDependencies, workspaceId: string, subject: string) {
  const url = new URL(request.url);
  const permitted = new Set(["prospectId", "peopleCursor"]);
  for (const key of url.searchParams.keys()) if (!permitted.has(key) || url.searchParams.getAll(key).length !== 1) throw new CursorError();
  const projectionNow = dependencies.now?.() ?? Date.now();
  // Authority is enforced in SQL before the hard projection bound.  This is
  // deliberately not an unbounded fetch followed by async authority probes:
  // stale rows cannot crowd out current ones or turn into unbounded work.
  const approvedRows = (await dependencies.database.prepare(`SELECT p.id,p.revision
    FROM profile_prospects p
    WHERE p.workspace_id=? AND p.active=1 AND p.state='approved' AND EXISTS (
      SELECT 1 FROM workspaces w
      JOIN workspace_companies wc ON wc.workspace_id=w.id
      JOIN companies company ON company.id=wc.company_id AND company.workspace_id=w.id AND company.status='active'
      JOIN customer_profiles profile ON profile.id=p.profile_id AND profile.workspace_id=p.workspace_id AND profile.lifecycle='ready'
      JOIN market_plays play ON play.id=profile.play_id AND play.workspace_id=profile.workspace_id AND play.lifecycle='active'
      JOIN products product ON product.id=play.product_id AND product.workspace_id=play.workspace_id AND product.lifecycle='ready' AND product.company_id=company.id
      JOIN typed_configurations cfg ON cfg.workspace_id=p.workspace_id AND cfg.owner_type='profile' AND cfg.owner_id=p.profile_id AND cfg.kind='profile_effective' AND cfg.active=1
      JOIN prospecting_candidates candidate ON candidate.id=p.candidate_id AND candidate.workspace_id=p.workspace_id AND candidate.profile_id=p.profile_id AND candidate.configuration_id=cfg.id AND candidate.status IN ('observed','qualified')
      JOIN qualification_assessments assessment ON assessment.id=p.assessment_id AND assessment.workspace_id=p.workspace_id AND assessment.candidate_id=candidate.id AND assessment.configuration_id=cfg.id AND assessment.configuration_digest=cfg.digest AND assessment.outcome='Passed'
      JOIN prospect_review_decisions review ON review.prospect_id=p.id AND review.workspace_id=p.workspace_id AND review.assessment_id=p.assessment_id AND review.decision='approve'
      WHERE w.id=p.workspace_id AND w.owner_subject=?
    ) ORDER BY p.updated_at DESC,p.id DESC LIMIT 100`).bind(workspaceId, subject).all<{ id: string; revision: number }>()).results;
  const approved = await Promise.all(approvedRows.filter((row) => opaque(row.id) && positive(row.revision)).map(async (row) => Object.freeze({ prospectId: row.id, prospectRevision: Number(row.revision), knownPerson: await currentKnownPerson(dependencies.database, { workspaceId, principalSubject: subject }, row.id) })));
  const prospectId = url.searchParams.get("prospectId");
  if (!prospectId) return Object.freeze({ capability: dependencies.personDiscoveryService ? "test_composed_only" : "reject_only", approvedProspects: approved, history: await history(dependencies.database, workspaceId), people: emptyPeople() });
  if (!opaque(prospectId)) throw new CursorError();
  // Verify a supplied token even when the requested Prospect is no longer
  // current.  Otherwise a cursor minted for one Prospect could be silently
  // substituted onto an unavailable/foreign selector and look like a benign
  // empty page instead of the authority drift it represents.
  const rawCursor = url.searchParams.get("peopleCursor");
  const cursor = rawCursor ? await decodeCursor(rawCursor, dependencies.subjectPepper, workspaceId, subject) : null;
  const authority = await loadApprovedProspectAuthority(dependencies.database, { workspaceId, principalSubject: subject }, prospectId);
  if (!authority) {
    if (cursor) throw new CursorDriftError();
    return Object.freeze({ capability: dependencies.personDiscoveryService ? "test_composed_only" : "reject_only", approvedProspects: approved, history: await history(dependencies.database, workspaceId), people: emptyPeople() });
  }
  const generation = await contactsGeneration(dependencies.database, workspaceId);
  const latest = await dependencies.database.prepare(`SELECT r.id,e.state,e.result_digest,r.created_at FROM person_discovery_runs r JOIN person_discovery_run_events e ON e.run_id=r.id AND e.durable_revision=(SELECT max(x.durable_revision) FROM person_discovery_run_events x WHERE x.run_id=r.id) WHERE r.workspace_id=? AND r.owner_subject=? AND r.prospect_id=? ORDER BY r.created_at DESC,r.id DESC LIMIT 1`).bind(workspaceId, subject, prospectId).first<{ id: string; state: string; result_digest: string | null; created_at: number }>();
  if (!latest || !opaque(latest.id) || !["requested", "completed", "needs_reconciliation"].includes(latest.state) || !positive(latest.created_at)) {
    if (cursor) throw new CursorDriftError();
    return Object.freeze({ capability: dependencies.personDiscoveryService ? "test_composed_only" : "reject_only", approvedProspects: approved, history: await history(dependencies.database, workspaceId, prospectId), people: emptyPeople() });
  }
  const runCurrent = await isDiscoveryRunAuthorityCurrent(dependencies.database, { workspaceId, principalSubject: subject }, latest.id);
  if (cursor && (!runCurrent || cursor.prospectId !== prospectId || cursor.prospectRevision !== authority.prospectRevision || cursor.configurationDigest !== authority.configurationDigest || cursor.runId !== latest.id || cursor.resultDigest !== latest.result_digest || cursor.generation !== generation)) throw new CursorDriftError();
  if (!runCurrent) return Object.freeze({ capability: dependencies.personDiscoveryService ? "test_composed_only" : "reject_only", approvedProspects: approved, history: await history(dependencies.database, workspaceId, prospectId), people: Object.freeze({ runId: null, status: "stale_authority", items: Object.freeze([]), pageInfo: Object.freeze({ limit: PERSON_DISCOVERY_PAGE_LIMIT, returned: 0, hasNext: false, nextCursor: null }) }) });
  if (latest.state !== "completed") return Object.freeze({ capability: dependencies.personDiscoveryService ? "test_composed_only" : "reject_only", approvedProspects: approved, history: await history(dependencies.database, workspaceId, prospectId), people: Object.freeze({ runId: latest.id, status: latest.state, items: Object.freeze([]), pageInfo: Object.freeze({ limit: PERSON_DISCOVERY_PAGE_LIMIT, returned: 0, hasNext: false, nextCursor: null }) }) });
  if (!digest(latest.result_digest)) { if (cursor) throw new CursorDriftError(); return Object.freeze({ capability: dependencies.personDiscoveryService ? "test_composed_only" : "reject_only", approvedProspects: approved, history: await history(dependencies.database, workspaceId, prospectId), people: emptyPeople() }); }
  const top = cursor?.highWater ?? await candidateTop(dependencies.database, workspaceId, latest.id);
  if (!top) return Object.freeze({ capability: dependencies.personDiscoveryService ? "test_composed_only" : "reject_only", approvedProspects: approved, history: await history(dependencies.database, workspaceId, prospectId), people: Object.freeze({ runId: latest.id, resultDigest: latest.result_digest, status: "completed", items: Object.freeze([]), pageInfo: Object.freeze({ limit: PERSON_DISCOVERY_PAGE_LIMIT, returned: 0, hasNext: false, nextCursor: null }) }) });
  const after = cursor?.after;
  const whereAfter = after ? " AND (created_at<? OR (created_at=? AND id<?))" : "";
  const bind: unknown[] = [workspaceId, latest.id, top.time, top.time, top.id];
  if (after) bind.push(after.time, after.time, after.id);
  const rows = (await dependencies.database.prepare(`SELECT id,ordinal,display_name,role_title,role_summary,candidate_digest,created_at,payload_expires_at,redacted_at FROM person_discovery_candidates WHERE workspace_id=? AND run_id=? AND (created_at<? OR (created_at=? AND id<=?))${whereAfter} ORDER BY created_at DESC,id DESC LIMIT ${PERSON_DISCOVERY_PAGE_LIMIT + 1}`).bind(...bind).all<{ id: string; ordinal: number; display_name: string; role_title: string; role_summary: string; candidate_digest: string; created_at: number; payload_expires_at: number; redacted_at: number | null }>()).results;
  const now = projectionNow;
  const returned = rows.slice(0, PERSON_DISCOVERY_PAGE_LIMIT).map((row) => Number(row.redacted_at) > 0 || Number(row.payload_expires_at) <= now ? Object.freeze({ candidateId: row.id, ordinal: Number(row.ordinal), state: "payload_unavailable" as const, eligible: false }) : Object.freeze({ candidateId: row.id, ordinal: Number(row.ordinal), displayName: row.display_name, roleTitle: row.role_title, roleSummary: row.role_summary, candidateDigest: row.candidate_digest, state: "suggestion_not_contact" as const, eligible: false }));
  const last = rows[Math.min(rows.length, PERSON_DISCOVERY_PAGE_LIMIT) - 1];
  const nextCursor = rows.length > PERSON_DISCOVERY_PAGE_LIMIT && last ? await encodeCursor({ prospectId, prospectRevision: authority.prospectRevision, configurationDigest: authority.configurationDigest, runId: latest.id, resultDigest: latest.result_digest, highWater: top, after: { time: Number(last.created_at), id: last.id }, generation }, dependencies.subjectPepper, workspaceId, subject) : null;
  return Object.freeze({ capability: dependencies.personDiscoveryService ? "test_composed_only" : "reject_only", approvedProspects: approved, history: await history(dependencies.database, workspaceId, prospectId), people: Object.freeze({ runId: latest.id, status: "completed", items: returned, pageInfo: Object.freeze({ limit: PERSON_DISCOVERY_PAGE_LIMIT, returned: returned.length, hasNext: rows.length > PERSON_DISCOVERY_PAGE_LIMIT, nextCursor }) }) });
}

async function currentKnownPerson(database: D1Database, scope: { workspaceId: string; principalSubject: string }, prospectId: string) {
  const row = await database.prepare(`SELECT EXISTS(
    SELECT 1 FROM prospect_contact_role_relevance relevance
    JOIN person_discovery_owner_decisions decision ON decision.id=relevance.decision_id AND decision.workspace_id=relevance.workspace_id
    JOIN person_discovery_runs run ON run.id=decision.run_id AND run.workspace_id=decision.workspace_id
    JOIN workspaces w ON w.id=relevance.workspace_id AND w.owner_subject=? AND w.revision=run.workspace_revision
    JOIN profile_prospects prospect ON prospect.id=relevance.prospect_id AND prospect.workspace_id=relevance.workspace_id AND prospect.active=1 AND prospect.state='approved' AND prospect.revision=run.prospect_revision
    JOIN customer_profiles profile ON profile.id=prospect.profile_id AND profile.workspace_id=prospect.workspace_id AND profile.lifecycle='ready'
    JOIN market_plays play ON play.id=profile.play_id AND play.workspace_id=profile.workspace_id AND play.lifecycle='active'
    JOIN products product ON product.id=play.product_id AND product.workspace_id=play.workspace_id AND product.lifecycle='ready'
    JOIN workspace_companies wc ON wc.workspace_id=relevance.workspace_id
    JOIN companies company ON company.id=wc.company_id AND company.workspace_id=relevance.workspace_id AND company.status='active' AND product.company_id=company.id
    JOIN contacts contact ON contact.id=relevance.contact_id AND contact.workspace_id=relevance.workspace_id
    JOIN typed_configurations cfg ON cfg.workspace_id=relevance.workspace_id AND cfg.owner_type='profile' AND cfg.owner_id=prospect.profile_id AND cfg.kind='profile_effective' AND cfg.active=1 AND cfg.id=run.configuration_id AND cfg.digest=run.configuration_digest AND cfg.revision=run.configuration_revision
    WHERE relevance.workspace_id=? AND relevance.prospect_id=? AND decision.contact_id=relevance.contact_id
  ) known_person`).bind(scope.principalSubject, scope.workspaceId, prospectId).first<{ known_person: number }>();
  return Number(row?.known_person) === 1;
}

async function history(database: D1Database, workspaceId: string, prospectId?: string) {
  const filter = prospectId ? " AND r.prospect_id=?" : "";
  const bind = prospectId ? [workspaceId, prospectId] : [workspaceId];
  const [runs, decisions, relevance, intents] = await Promise.all([
    database.prepare(`SELECT r.id,r.prospect_id,e.state,e.result_digest FROM person_discovery_runs r JOIN person_discovery_run_events e ON e.run_id=r.id AND e.durable_revision=(SELECT max(x.durable_revision) FROM person_discovery_run_events x WHERE x.run_id=r.id) WHERE r.workspace_id=?${filter} ORDER BY r.created_at DESC,r.id DESC LIMIT 50`).bind(...bind).all<{ id: string; prospect_id: string; state: string; result_digest: string | null }>(),
    database.prepare(`SELECT decision.id,decision.run_id,run.prospect_id,decision.decision,decision.contact_id FROM person_discovery_owner_decisions decision JOIN person_discovery_runs run ON run.id=decision.run_id AND run.workspace_id=decision.workspace_id WHERE decision.workspace_id=?${prospectId ? " AND run.prospect_id=?" : ""} ORDER BY decision.created_at DESC,decision.id DESC LIMIT 50`).bind(...bind).all<{ id: string; run_id: string; prospect_id: string; decision: string; contact_id: string | null }>(),
    database.prepare(`SELECT relevance.id,relevance.prospect_id,relevance.contact_id,relevance.decision_id,relevance.role_title FROM prospect_contact_role_relevance relevance WHERE relevance.workspace_id=?${prospectId ? " AND relevance.prospect_id=?" : ""} ORDER BY relevance.created_at DESC,relevance.id DESC LIMIT 50`).bind(...bind).all<{ id: string; prospect_id: string; contact_id: string; decision_id: string; role_title: string }>(),
    database.prepare(`SELECT intent.id,intent.relevance_id,intent.intent,intent.channel,intent.source_observation_id FROM contact_verification_intents intent JOIN prospect_contact_role_relevance relevance ON relevance.id=intent.relevance_id AND relevance.workspace_id=intent.workspace_id WHERE intent.workspace_id=?${prospectId ? " AND relevance.prospect_id=?" : ""} ORDER BY intent.created_at DESC,intent.id DESC LIMIT 50`).bind(...bind).all<{ id: string; relevance_id: string; intent: string; channel: string; source_observation_id: string | null }>(),
  ]);
  return Object.freeze({
    runs: runs.results.filter((row) => opaque(row.id) && opaque(row.prospect_id) && ["requested", "completed", "needs_reconciliation"].includes(row.state)).map((row) => Object.freeze({ runId: row.id, prospectId: row.prospect_id, state: row.state, resultDigest: digest(row.result_digest) ? row.result_digest : null })),
    decisions: decisions.results.filter((row) => opaque(row.id) && opaque(row.run_id) && opaque(row.prospect_id) && ["no_match", "create_new", "link_existing"].includes(row.decision)).map((row) => Object.freeze({ decisionId: row.id, runId: row.run_id, prospectId: row.prospect_id, decision: row.decision, contactId: opaque(row.contact_id) ? row.contact_id : null })),
    relevance: relevance.results.filter((row) => opaque(row.id) && opaque(row.prospect_id) && opaque(row.contact_id) && opaque(row.decision_id)).map((row) => Object.freeze({ relevanceId: row.id, prospectId: row.prospect_id, contactId: row.contact_id, decisionId: row.decision_id, roleTitle: row.role_title })),
    verificationIntents: intents.results.filter((row) => opaque(row.id) && opaque(row.relevance_id) && ["initial_verification", "stale_refresh"].includes(row.intent) && ["email", "phone"].includes(row.channel)).map((row) => Object.freeze({ intentId: row.id, relevanceId: row.relevance_id, intent: row.intent, channel: row.channel, sourceObservationId: opaque(row.source_observation_id) ? row.source_observation_id : null, effect: "intent_only" as const })),
  });
}

function emptyPeople() { return Object.freeze({ runId: null, status: "not_started", items: Object.freeze([]), pageInfo: Object.freeze({ limit: PERSON_DISCOVERY_PAGE_LIMIT, returned: 0, hasNext: false, nextCursor: null }) }); }
async function candidateTop(database: D1Database, workspaceId: string, runId: string): Promise<Key | null> { const row = await database.prepare("SELECT id,created_at FROM person_discovery_candidates WHERE workspace_id=? AND run_id=? ORDER BY created_at DESC,id DESC LIMIT 1").bind(workspaceId, runId).first<{ id: string; created_at: number }>(); return row && opaque(row.id) && positive(row.created_at) ? Object.freeze({ id: row.id, time: Number(row.created_at) }) : null; }
async function contactsGeneration(database: D1Database, workspaceId: string) { const row = await database.prepare("SELECT contacts_generation FROM contacts_projection_generations WHERE workspace_id=?").bind(workspaceId).first<{ contacts_generation: number }>(); return Number.isSafeInteger(Number(row?.contacts_generation)) && Number(row?.contacts_generation) >= 0 ? Number(row?.contacts_generation) : 0; }

class CursorError extends Error {} class CursorDriftError extends Error {}
async function encodeCursor(cursor: Cursor, secret: string, workspaceId: string, subject: string) { const payload = JSON.stringify({ schema: CURSOR_SCHEMA, ...cursor }); const signed = await sign(payload, secret, workspaceId, subject); return `${b64(new TextEncoder().encode(payload))}.${b64(signed)}`; }
async function decodeCursor(value: string, secret: string, workspaceId: string, subject: string): Promise<Cursor> { try { if (typeof value !== "string" || value.length > 1200 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)) throw new Error(); const [encoded, signature] = value.split("."); const payload = new TextDecoder().decode(unb64(encoded)); if (!await crypto.subtle.verify("HMAC", await key(secret), unb64(signature), new TextEncoder().encode(`${CURSOR_DOMAIN}\n${workspaceId}\n${subject}\n${payload}`))) throw new Error(); const parsed = JSON.parse(payload) as Record<string, unknown>; if (!exact(parsed, ["schema", "prospectId", "prospectRevision", "configurationDigest", "runId", "resultDigest", "highWater", "after", "generation"]) || parsed.schema !== CURSOR_SCHEMA || !opaque(parsed.prospectId) || !positive(parsed.prospectRevision) || !digest(parsed.configurationDigest) || !opaque(parsed.runId) || !digest(parsed.resultDigest) || !validKey(parsed.highWater) || !validKey(parsed.after) || !safeGeneration(parsed.generation)) throw new Error(); return parsed as Cursor; } catch { throw new CursorError(); } }
async function sign(payload: string, secret: string, workspaceId: string, subject: string) { return new Uint8Array(await crypto.subtle.sign("HMAC", await key(secret), new TextEncoder().encode(`${CURSOR_DOMAIN}\n${workspaceId}\n${subject}\n${payload}`))); }
async function key(secret: string) { if (typeof secret !== "string" || secret.length < 16) throw new CursorError(); return crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]); }
function b64(bytes: Uint8Array) { let value = ""; for (const byte of bytes) value += String.fromCharCode(byte); return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, ""); }
function unb64(value: string) { const normalized = value.replace(/-/g, "+").replace(/_/g, "/"); const decoded = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4)); return Uint8Array.from(decoded, (item) => item.charCodeAt(0)); }

function assertClosed(body: Record<string, unknown>, action: Action) { const keys: Record<Action, readonly string[]> = { start_person_discovery: ["action", "prospectId", "expectedProspectRevision", "maxCandidates", "maxProvenancePerCandidate", "idempotencyKey"], decide_person_discovery: ["action", "runId", "expectedResultDigest", "decision", "candidateId", "existingContactId", "expectedProspectRevision", "idempotencyKey"], record_verification_intent: ["action", "relevanceId", "intent", "channel", "sourceObservationId", "expectedProspectRevision", "expectedContactRevision", "idempotencyKey"] }; const allowed = keys[action]; if (Object.keys(body).some((key) => !allowed.includes(key))) throw new CommandError(); for (const key of allowed) if (!Object.hasOwn(body, key)) throw new CommandError(); if (!opaque(body.idempotencyKey) || !positive(body.expectedProspectRevision)) throw new CommandError(); if (action === "start_person_discovery" && (!opaque(body.prospectId) || !between(body.maxCandidates, 1, 20) || !between(body.maxProvenancePerCandidate, 1, 8))) throw new CommandError(); if (action === "decide_person_discovery") { if (!opaque(body.runId) || !digest(body.expectedResultDigest) || !["no_match", "create_new", "link_existing"].includes(String(body.decision))) throw new CommandError(); const no = body.decision === "no_match"; if (no ? body.candidateId !== null || body.existingContactId !== null : !opaque(body.candidateId) || (body.decision === "link_existing" ? !opaque(body.existingContactId) : body.existingContactId !== null)) throw new CommandError(); } if (action === "record_verification_intent" && (!opaque(body.relevanceId) || !positive(body.expectedContactRevision) || !["initial_verification", "stale_refresh"].includes(String(body.intent)) || !["email", "phone"].includes(String(body.channel)) || (body.intent === "initial_verification" ? body.sourceObservationId !== null : !opaque(body.sourceObservationId)))) throw new CommandError(); }
function isAction(value: unknown): value is Action { return value === "start_person_discovery" || value === "decide_person_discovery" || value === "record_verification_intent"; }
function sanitize(value: unknown, action: Action) {
  if (!record(value) || !["accepted", "blocked", "conflict"].includes(String(value.kind))) return invalidResult();
  if (value.kind === "accepted") {
    if (value.replayed !== true && value.replayed !== false) return invalidResult();
    const valid = action === "start_person_discovery" ? validRun(value.run)
      : action === "decide_person_discovery" ? validDecision(value.decision)
        : validIntent(value.intent) && value.providerCallAuthorized === false && value.contactEvidenceCreated === false;
    return valid ? Object.freeze({ kind: "accepted", replayed: value.replayed }) : invalidResult();
  }
  const allowed = value.kind === "blocked" ? action === "start_person_discovery" ? ["invalid_request", "port_unavailable", "stale_or_foreign_authority"] : action === "decide_person_discovery" ? ["invalid_request", "stale_or_foreign_authority", "candidate_unavailable"] : ["invalid_request", "stale_or_foreign_authority"] : action === "start_person_discovery" ? ["idempotency_conflict", "write_conflict"] : action === "decide_person_discovery" ? ["idempotency_conflict", "ambiguous_identity_or_race"] : ["idempotency_conflict", "write_conflict"];
  return typeof value.reason === "string" && allowed.includes(value.reason) ? Object.freeze({ kind: value.kind, reason: value.reason }) : invalidResult();
}
function validRun(value: unknown) {
  if (!exact(value, ["id", "requestDigest", "operationKey", "status", "resultDigest", "reason", "requestedDeadlineAt", "candidates"])
    || !opaque(value.id) || !digest(value.requestDigest) || !/^pd_[0-9a-f]{64}$/u.test(String(value.operationKey))
    || !positive(value.requestedDeadlineAt) || !Array.isArray(value.candidates)) return false;
  if (value.status === "requested") return value.resultDigest === null && value.reason === null && value.candidates.length === 0;
  if (value.status === "needs_reconciliation") return digest(value.resultDigest) && ["timeout", "unknown_outcome", "stale_requested"].includes(String(value.reason)) && value.candidates.length === 0;
  return value.status === "completed" && digest(value.resultDigest) && value.reason === null
    && value.candidates.length <= 20 && value.candidates.every((candidate, ordinal) => validCandidate(candidate, ordinal));
}
function validCandidate(value: unknown, ordinal: number) {
  if (!exact(value, ["id", "ordinal", "candidateKey", "displayName", "roleTitle", "roleSummary", "candidateDigest", "payloadExpiresAt", "redactedAt", "provenance"])
    || !opaque(value.id) || value.ordinal !== ordinal || !digest(value.candidateDigest) || !positive(value.payloadExpiresAt)
    || !Array.isArray(value.provenance) || value.provenance.length < 1 || value.provenance.length > 8) return false;
  const live = typeof value.candidateKey === "string" && /^candidate:[0-9a-f]{64}$/u.test(value.candidateKey)
    && boundedText(value.displayName, 160) && boundedText(value.roleTitle, 160) && boundedText(value.roleSummary, 1000) && value.redactedAt === null;
  const redacted = typeof value.candidateKey === "string" && /^redacted:[A-Za-z0-9][A-Za-z0-9_-]*$/u.test(value.candidateKey)
    && value.displayName === "[redacted]" && value.roleTitle === "[redacted]" && value.roleSummary === "[redacted]"
    && positive(value.redactedAt) && value.redactedAt >= value.payloadExpiresAt;
  return (live || redacted) && value.provenance.every((item, index) => validProvenance(item, index));
}
function validProvenance(value: unknown, ordinal: number) {
  if (!exact(value, ["id", "ordinal", "sourceReference", "excerpt", "sourceDigest", "excerptDigest", "retrievedAt", "provenanceDigest", "payloadExpiresAt", "redactedAt"])
    || !opaque(value.id) || value.ordinal !== ordinal || !digest(value.sourceDigest) || !digest(value.excerptDigest) || !digest(value.provenanceDigest)
    || !positive(value.retrievedAt) || !positive(value.payloadExpiresAt)) return false;
  const live = boundedText(value.sourceReference, 512) && boundedText(value.excerpt, 2000) && value.redactedAt === null;
  const redacted = value.sourceReference === "[redacted]" && value.excerpt === "[redacted]" && positive(value.redactedAt) && value.redactedAt >= value.payloadExpiresAt;
  return live || redacted;
}
function validDecision(value: unknown) { return exact(value, ["id", "runId", "decision", "candidateId", "contactId", "relevanceId", "decisionDigest"]) && opaque(value.id) && opaque(value.runId) && digest(value.decisionDigest) && ["no_match", "create_new", "link_existing"].includes(String(value.decision)) && (value.decision === "no_match" ? value.candidateId === null && value.contactId === null && value.relevanceId === null : opaque(value.candidateId) && opaque(value.contactId) && opaque(value.relevanceId)); }
function validIntent(value: unknown) { return exact(value, ["id", "intent", "intentDigest", "sourceObservationId", "channel", "freshnessWindowMs", "freshnessPolicyDigest"]) && opaque(value.id) && digest(value.intentDigest) && ["initial_verification", "stale_refresh"].includes(String(value.intent)) && ["email", "phone"].includes(String(value.channel)) && positive(value.freshnessWindowMs) && digest(value.freshnessPolicyDigest) && (value.intent === "initial_verification" ? value.sourceObservationId === null : opaque(value.sourceObservationId)); }
function invalidResult() { return Object.freeze({ kind: "blocked" as const, reason: "invalid_service_result" }); }
function commandStatus(value: { kind: string }) { return value.kind === "accepted" ? 200 : 409; }
async function owner(dependencies: PersonDiscoveryHandlerDependencies): Promise<Principal> { return admitPilotOwner(await dependencies.getIdentity(), dependencies.pilotOwnerEmail, dependencies.subjectPepper); }
async function ownedWorkspace(database: D1Database, principal: Principal) { const row = await database.prepare("SELECT id,owner_subject FROM workspaces WHERE owner_subject IN (?,?) ORDER BY CASE owner_subject WHEN ? THEN 0 ELSE 1 END LIMIT 1").bind(principal.subject, principal.legacySubject ?? principal.subject, principal.subject).first<{ id: string; owner_subject: string }>(); if (!row || !opaque(row.id) || typeof row.owner_subject !== "string" || row.owner_subject.length < 1 || row.owner_subject.length > 256) throw new PilotAccessError(); return Object.freeze({ id: row.id, ownerSubject: row.owner_subject }); }
function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); } function exact(value: unknown, keys: readonly string[]) { return record(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)); } function opaque(value: unknown): value is string { return typeof value === "string" && value.length > 0 && value.length <= 200 && /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(value); } function digest(value: unknown): value is string { return typeof value === "string" && /^[0-9a-f]{64}$/.test(value); } function positive(value: unknown): value is number { return Number.isSafeInteger(value) && value > 0; } function boundedText(value: unknown, limit: number): value is string { return typeof value === "string" && value.length > 0 && value.length <= limit; } function between(value: unknown, lower: number, upper: number) { return Number.isSafeInteger(value) && value >= lower && value <= upper; } function validKey(value: unknown): value is Key { return record(value) && opaque(value.id) && positive(value.time); } function safeGeneration(value: unknown) { return Number.isSafeInteger(value) && value >= 0 && value < Number.MAX_SAFE_INTEGER; } class CommandError extends Error {} function json(value: unknown, status = 200) { return Response.json(value, { status, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } }); } function privateUnavailable() { return json({ error: "private_workspace_unavailable" }, 404); } function denial(error: unknown) { return error instanceof PilotAccessError ? privateUnavailable() : json({ error: "person_discovery_unavailable" }, 503); }
