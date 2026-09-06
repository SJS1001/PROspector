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
import { loadApprovedProspectAuthority, loadRelevanceAuthority, readDiscoveryRun } from "./person-discovery-repository";

export const PERSON_DISCOVERY_MUTATION_INTENT = "person-discovery-mutation";
export const PERSON_DISCOVERY_PAGE_LIMIT = 20;
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
    const workspaceId = await ownedWorkspaceId(dependencies.database, principal);
    const projection = await readProjection(request, dependencies, workspaceId, principal.subject);
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
    const workspaceId = await ownedWorkspaceId(dependencies.database, principal);
    const scope = Object.freeze({ workspaceId, principalSubject: principal.subject });
    const service = dependencies.personDiscoveryService;
    if (!service) return json({ error: "person_discovery_capability_unavailable" }, 409);
    const result = await invoke(service, scope, body, dependencies.database);
    return json({ command: sanitize(result) }, commandStatus(result));
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
    const run = await readDiscoveryRun(database, scope, body.runId as string);
    const runScope = await database.prepare("SELECT prospect_id FROM person_discovery_runs WHERE id=? AND workspace_id=? AND owner_subject=? LIMIT 1").bind(body.runId, scope.workspaceId, scope.principalSubject).first<{ prospect_id: string }>();
    const authority = runScope && opaque(runScope.prospect_id) ? await loadApprovedProspectAuthority(database, scope, runScope.prospect_id) : null;
    if (!run || !authority || authority.prospectRevision !== body.expectedProspectRevision || run.resultDigest !== body.expectedResultDigest || run.status !== "completed") return Object.freeze({ kind: "blocked", reason: "stale_or_foreign_authority" });
    return service.decide(scope, Object.freeze({ runId: run.id, expectedResultDigest: run.resultDigest, decision: body.decision, ...(opaque(body.candidateId) ? { candidateId: body.candidateId } : {}), ...(opaque(body.existingContactId) ? { existingContactId: body.existingContactId } : {}), idempotencyKey: body.idempotencyKey }));
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
  const approved = (await dependencies.database.prepare(`SELECT p.id,p.revision,EXISTS(SELECT 1 FROM prospect_contact_role_relevance relevance WHERE relevance.workspace_id=p.workspace_id AND relevance.prospect_id=p.id) known_person FROM profile_prospects p JOIN workspaces w ON w.id=p.workspace_id WHERE p.workspace_id=? AND w.owner_subject=? AND p.active=1 AND p.state='approved' ORDER BY p.updated_at DESC,p.id DESC LIMIT 100`).bind(workspaceId, subject).all<{ id: string; revision: number; known_person: number }>()).results
    .filter((row) => opaque(row.id) && positive(row.revision)).map((row) => Object.freeze({ prospectId: row.id, prospectRevision: Number(row.revision), knownPerson: Number(row.known_person) === 1 }));
  const prospectId = url.searchParams.get("prospectId");
  if (!prospectId) return Object.freeze({ capability: dependencies.personDiscoveryService ? "test_composed_only" : "reject_only", approvedProspects: approved, history: await history(dependencies.database, workspaceId), people: emptyPeople() });
  if (!opaque(prospectId)) throw new CursorError();
  const authority = await loadApprovedProspectAuthority(dependencies.database, { workspaceId, principalSubject: subject }, prospectId);
  if (!authority) return Object.freeze({ capability: dependencies.personDiscoveryService ? "test_composed_only" : "reject_only", approvedProspects: approved, history: await history(dependencies.database, workspaceId), people: emptyPeople() });
  const generation = await contactsGeneration(dependencies.database, workspaceId);
  const latest = await dependencies.database.prepare(`SELECT r.id,e.result_digest,r.created_at FROM person_discovery_runs r JOIN person_discovery_run_events e ON e.run_id=r.id AND e.durable_revision=(SELECT max(x.durable_revision) FROM person_discovery_run_events x WHERE x.run_id=r.id) WHERE r.workspace_id=? AND r.owner_subject=? AND r.prospect_id=? AND e.state='completed' ORDER BY r.created_at DESC,r.id DESC LIMIT 1`).bind(workspaceId, subject, prospectId).first<{ id: string; result_digest: string; created_at: number }>();
  if (!latest || !opaque(latest.id) || !digest(latest.result_digest) || !positive(latest.created_at)) return Object.freeze({ capability: dependencies.personDiscoveryService ? "test_composed_only" : "reject_only", approvedProspects: approved, history: await history(dependencies.database, workspaceId), people: emptyPeople() });
  const rawCursor = url.searchParams.get("peopleCursor");
  const cursor = rawCursor ? await decodeCursor(rawCursor, dependencies.subjectPepper, workspaceId, subject) : null;
  if (cursor && (cursor.prospectId !== prospectId || cursor.prospectRevision !== authority.prospectRevision || cursor.configurationDigest !== authority.configurationDigest || cursor.runId !== latest.id || cursor.resultDigest !== latest.result_digest || cursor.generation !== generation)) throw new CursorDriftError();
  const top = cursor?.highWater ?? await candidateTop(dependencies.database, workspaceId, latest.id);
  if (!top) return Object.freeze({ capability: dependencies.personDiscoveryService ? "test_composed_only" : "reject_only", approvedProspects: approved, history: await history(dependencies.database, workspaceId), people: emptyPeople() });
  const after = cursor?.after;
  const whereAfter = after ? " AND (created_at<? OR (created_at=? AND id<?))" : "";
  const bind: unknown[] = [workspaceId, latest.id, top.time, top.time, top.id];
  if (after) bind.push(after.time, after.time, after.id);
  const rows = (await dependencies.database.prepare(`SELECT id,ordinal,display_name,role_title,role_summary,candidate_digest,created_at FROM person_discovery_candidates WHERE workspace_id=? AND run_id=? AND (created_at<? OR (created_at=? AND id<=?))${whereAfter} ORDER BY created_at DESC,id DESC LIMIT ${PERSON_DISCOVERY_PAGE_LIMIT + 1}`).bind(...bind).all<{ id: string; ordinal: number; display_name: string; role_title: string; role_summary: string; candidate_digest: string; created_at: number }>()).results;
  const returned = rows.slice(0, PERSON_DISCOVERY_PAGE_LIMIT).map((row) => Object.freeze({ candidateId: row.id, ordinal: Number(row.ordinal), displayName: row.display_name, roleTitle: row.role_title, roleSummary: row.role_summary, candidateDigest: row.candidate_digest, state: "suggestion_not_contact" as const, eligible: false }));
  const last = rows[Math.min(rows.length, PERSON_DISCOVERY_PAGE_LIMIT) - 1];
  const nextCursor = rows.length > PERSON_DISCOVERY_PAGE_LIMIT && last ? await encodeCursor({ prospectId, prospectRevision: authority.prospectRevision, configurationDigest: authority.configurationDigest, runId: latest.id, resultDigest: latest.result_digest, highWater: top, after: { time: Number(last.created_at), id: last.id }, generation }, dependencies.subjectPepper, workspaceId, subject) : null;
  return Object.freeze({ capability: dependencies.personDiscoveryService ? "test_composed_only" : "reject_only", approvedProspects: approved, history: await history(dependencies.database, workspaceId), people: Object.freeze({ runId: latest.id, status: "completed", items: returned, pageInfo: Object.freeze({ limit: PERSON_DISCOVERY_PAGE_LIMIT, returned: returned.length, hasNext: rows.length > PERSON_DISCOVERY_PAGE_LIMIT, nextCursor }) }) });
}

async function history(database: D1Database, workspaceId: string) {
  const [runs, decisions, relevance, intents] = await Promise.all([
    database.prepare(`SELECT r.id,e.state,e.result_digest FROM person_discovery_runs r JOIN person_discovery_run_events e ON e.run_id=r.id AND e.durable_revision=(SELECT max(x.durable_revision) FROM person_discovery_run_events x WHERE x.run_id=r.id) WHERE r.workspace_id=? ORDER BY r.created_at DESC,r.id DESC LIMIT 50`).bind(workspaceId).all<{ id: string; state: string; result_digest: string | null }>(),
    database.prepare("SELECT id,run_id,decision,contact_id FROM person_discovery_owner_decisions WHERE workspace_id=? ORDER BY created_at DESC,id DESC LIMIT 50").bind(workspaceId).all<{ id: string; run_id: string; decision: string; contact_id: string | null }>(),
    database.prepare("SELECT id,prospect_id,contact_id,decision_id,role_title FROM prospect_contact_role_relevance WHERE workspace_id=? ORDER BY created_at DESC,id DESC LIMIT 50").bind(workspaceId).all<{ id: string; prospect_id: string; contact_id: string; decision_id: string; role_title: string }>(),
    database.prepare("SELECT id,relevance_id,intent,channel,source_observation_id FROM contact_verification_intents WHERE workspace_id=? ORDER BY created_at DESC,id DESC LIMIT 50").bind(workspaceId).all<{ id: string; relevance_id: string; intent: string; channel: string; source_observation_id: string | null }>(),
  ]);
  return Object.freeze({
    runs: runs.results.filter((row) => opaque(row.id) && ["requested", "completed", "needs_reconciliation"].includes(row.state)).map((row) => Object.freeze({ runId: row.id, state: row.state, resultDigest: digest(row.result_digest) ? row.result_digest : null })),
    decisions: decisions.results.filter((row) => opaque(row.id) && opaque(row.run_id) && ["no_match", "create_new", "link_existing"].includes(row.decision)).map((row) => Object.freeze({ decisionId: row.id, runId: row.run_id, decision: row.decision, contactId: opaque(row.contact_id) ? row.contact_id : null })),
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
function sanitize(value: unknown) { if (!record(value) || !["accepted", "blocked", "conflict"].includes(String(value.kind))) return Object.freeze({ kind: "blocked", reason: "invalid_service_result" }); const result: Record<string, unknown> = { kind: value.kind }; if (typeof value.reason === "string") result.reason = value.reason; if (value.kind === "accepted") result.replayed = value.replayed === true; return Object.freeze(result); }
function commandStatus(value: unknown) { return record(value) && value.kind === "accepted" ? 200 : 409; }
async function owner(dependencies: PersonDiscoveryHandlerDependencies): Promise<Principal> { return admitPilotOwner(await dependencies.getIdentity(), dependencies.pilotOwnerEmail, dependencies.subjectPepper); }
async function ownedWorkspaceId(database: D1Database, principal: Principal) { const row = await database.prepare("SELECT id FROM workspaces WHERE owner_subject IN (?,?) ORDER BY CASE owner_subject WHEN ? THEN 0 ELSE 1 END LIMIT 1").bind(principal.subject, principal.legacySubject ?? principal.subject, principal.subject).first<{ id: string }>(); if (!row || !opaque(row.id)) throw new PilotAccessError(); return row.id; }
function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); } function exact(value: unknown, keys: readonly string[]) { return record(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)); } function opaque(value: unknown): value is string { return typeof value === "string" && value.length > 0 && value.length <= 200 && /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(value); } function digest(value: unknown): value is string { return typeof value === "string" && /^[0-9a-f]{64}$/.test(value); } function positive(value: unknown): value is number { return Number.isSafeInteger(value) && value > 0; } function between(value: unknown, lower: number, upper: number) { return Number.isSafeInteger(value) && value >= lower && value <= upper; } function validKey(value: unknown): value is Key { return record(value) && opaque(value.id) && positive(value.time); } function safeGeneration(value: unknown) { return Number.isSafeInteger(value) && value >= 0 && value < Number.MAX_SAFE_INTEGER; } class CommandError extends Error {} function json(value: unknown, status = 200) { return Response.json(value, { status, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } }); } function privateUnavailable() { return json({ error: "private_workspace_unavailable" }, 404); } function denial(error: unknown) { return error instanceof PilotAccessError ? privateUnavailable() : json({ error: "person_discovery_unavailable" }, 503); }
