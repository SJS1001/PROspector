import {
  projectContactEligibility,
  type ContactEligibility,
} from "./contact-eligibility";
import type { ContactSettlementAttestor } from "./contact-settlement-attestor";
import { readVerifiedContactEligibilityEvidence } from "./contact-settlement-persistence";
import { canonicalDigest } from "./enrichment-grant-issuance";
import { deriveContactFreshnessPolicy } from "./person-discovery-repository";
import { controlledEnrichmentActivated } from "./phase-activation";
import { validateSameOriginMutation } from "./request-security";

const PERSON_DISCOVERY_C4_VERIFICATION_INTENT = "person-discovery-c4-verification";

export type ContactEligibilitySnapshot = Readonly<{
  id: string;
  workspaceId: string;
  contactId: string;
  prospectId: string;
  configurationId: string;
  configurationDigest: string;
  configurationRevision: number;
  prospectRevision: number;
  state: ContactEligibility["state"];
  eligible: boolean;
  observationIds: readonly string[];
  reasonCodes: readonly string[];
  preservedSuppressionRefs: readonly string[];
  snapshotDigest: string;
  projectedAt: number;
}>;

export type PersistContactEligibilityResult =
  | Readonly<{ kind: "blocked"; reason: "invalid_request" | "contact_capability_unavailable" | "contact_authority_unavailable" | "verified_evidence_unavailable" | "snapshot_conflict" }>
  | Readonly<{ kind: "persisted"; snapshot: ContactEligibilitySnapshot; replayed: boolean }>;

type AuthorityRow = {
  prospect_revision: number;
  prospect_state: string;
  prospect_active: number;
  configuration_revision: number;
  configuration_active: number;
  candidate_status: string;
  assessment_outcome: string;
  configuration_manifest_json: string;
};

type SnapshotRow = {
  id: string;
  workspace_id: string;
  contact_id: string;
  prospect_id: string;
  configuration_id: string;
  configuration_digest: string;
  configuration_revision: number;
  prospect_revision: number;
  state: string;
  eligible: number;
  observation_ids_json: string;
  reason_codes_json: string;
  preserved_suppression_refs_json: string;
  snapshot_digest: string;
  projected_at: number;
};

type PersistRequest = Readonly<{
  ownerSubject: string;
  workspaceId: string;
  reservationId: string;
  prospectId: string;
  contactId: string;
  configurationId: string;
  configurationDigest: string;
  projectedAt: number;
}>;

/**
 * Persists a current eligibility projection only after the immutable Phase 5 gate,
 * owner scope, D1 lineage and signed settlement have all been re-established.
 * This module has no runtime route and cannot create the activation gate.
 */
export async function persistCurrentContactEligibilitySnapshot(
  database: D1Database,
  attestor: ContactSettlementAttestor | null | undefined,
  requestValue: PersistRequest | unknown,
): Promise<PersistContactEligibilityResult> {
  const request = normalizeRequest(requestValue);
  if (!request) return blocked("invalid_request");
  if (!await controlledEnrichmentActivated(database, request.workspaceId)) {
    return blocked("contact_capability_unavailable");
  }
  return persistAfterActivation(database, attestor, request);
}

/**
 * Disposable C4 acceptance seam. The production entry point above always
 * requires the real immutable activation gate; only the dev-only C4 module
 * imports this wrapper, and a production build folds the body away.
 */
export async function persistPersonDiscoveryC4ContactEligibilitySnapshot(
  request: Request,
  bindings: Readonly<{
    PROSPECTOR_PERSON_DISCOVERY_C4?: unknown;
    TRUSTED_IDENTITY_PROVIDER?: unknown;
    LOCAL_DEMO?: unknown;
  }>,
  database: D1Database,
  attestor: ContactSettlementAttestor | null | undefined,
  requestValue: PersistRequest | unknown,
): Promise<PersistContactEligibilityResult> {
  if (import.meta.env.DEV) {
    const { personDiscoveryC4Enabled } = await import("./person-discovery-c4-acceptance");
    if (
      personDiscoveryC4Enabled(request, bindings)
      && validateSameOriginMutation(request, PERSON_DISCOVERY_C4_VERIFICATION_INTENT, 1024) === null
    ) {
      const normalized = normalizeRequest(requestValue);
      return normalized
        ? persistAfterActivation(database, attestor, normalized)
        : blocked("invalid_request");
    }
  }
  return blocked("contact_capability_unavailable");
}

async function persistAfterActivation(
  database: D1Database,
  attestor: ContactSettlementAttestor | null | undefined,
  request: PersistRequest,
): Promise<PersistContactEligibilityResult> {
  const authority = await readAuthority(database, request);
  if (!authority) return blocked("contact_authority_unavailable");
  const points = await readVerifiedContactEligibilityEvidence(database, attestor, {
    ownerSubject: request.ownerSubject,
    workspaceId: request.workspaceId,
    reservationId: request.reservationId,
    prospectId: request.prospectId,
    contactId: request.contactId,
    configurationId: request.configurationId,
    configurationDigest: request.configurationDigest,
  });
  if (!points) return blocked("verified_evidence_unavailable");
  // The configured contact_strategy windows are the only freshness authority.
  // A manifest without a derivable policy never falls back to defaults.
  const policy = await deriveContactFreshnessPolicy(authority.configuration_manifest_json);
  if (!policy) return blocked("contact_authority_unavailable");

  const drifted = await hasCurrentDrift(database, request.workspaceId, request.configurationId);
  const suppressionRefs = await matchingSuppressionRefs(
    database,
    request.workspaceId,
    request.contactId,
    points.map((point) => point.id),
  );
  const projection = projectContactEligibility({
    target: {
      workspaceId: request.workspaceId,
      prospectId: request.prospectId,
      contactId: request.contactId,
    },
    points,
    strategy: {
      configurationId: request.configurationId,
      configurationDigest: request.configurationDigest,
      mailboxVerifiedEmailFreshnessMs: policy.mailboxVerifiedEmailFreshnessMs,
      sourceVerifiedEmailFreshnessMs: policy.sourceVerifiedEmailFreshnessMs,
      verifiedBusinessPhoneFreshnessMs: policy.verifiedBusinessPhoneFreshnessMs,
    },
    authority: {
      prospectId: request.prospectId,
      configurationId: request.configurationId,
      configurationDigest: request.configurationDigest,
      profileAvailable: true,
      configurationCurrent: true,
      drifted,
      disqualified: false,
      suppressed: suppressionRefs.length > 0,
      phase4Approved: true,
      contactCapabilityEnabled: true,
    },
    now: request.projectedAt,
  });
  const observationIds = Object.freeze(uniqueSorted(
    projection.points
      .filter((point) => !projection.eligible || point.state === "eligible")
      .map((point) => point.observationId),
  ));
  const reasonCodes = Object.freeze(uniqueSorted(projection.reasonCodes));
  const preservedSuppressionRefs = Object.freeze(uniqueSorted(suppressionRefs));
  const snapshotFields = Object.freeze({
    workspaceId: request.workspaceId,
    contactId: request.contactId,
    prospectId: request.prospectId,
    configurationId: request.configurationId,
    configurationDigest: request.configurationDigest,
    configurationRevision: Number(authority.configuration_revision),
    prospectRevision: Number(authority.prospect_revision),
    state: projection.state,
    eligible: projection.eligible,
    observationIds,
    reasonCodes,
    preservedSuppressionRefs,
    projectedAt: request.projectedAt,
  });
  const snapshotDigest = await canonicalDigest({
    schema: "contact-eligibility-snapshot/v1",
    ...snapshotFields,
  });
  const id = `ces-${snapshotDigest}`;
  const snapshot = Object.freeze({ ...snapshotFields, id, snapshotDigest });
  try {
    await database.prepare(
      `INSERT INTO contact_eligibility_snapshots (
        id,workspace_id,contact_id,prospect_id,configuration_id,configuration_digest,
        configuration_revision,prospect_revision,state,eligible,observation_ids_json,
        reason_codes_json,preserved_suppression_refs_json,snapshot_digest,projected_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).bind(
      id,
      request.workspaceId,
      request.contactId,
      request.prospectId,
      request.configurationId,
      request.configurationDigest,
      authority.configuration_revision,
      authority.prospect_revision,
      projection.state,
      projection.eligible ? 1 : 0,
      JSON.stringify(observationIds),
      JSON.stringify(reasonCodes),
      JSON.stringify(preservedSuppressionRefs),
      snapshotDigest,
      request.projectedAt,
    ).run();
    return Object.freeze({ kind: "persisted", snapshot, replayed: false });
  } catch {
    const winner = await readSnapshotByDigest(
      database,
      request.ownerSubject,
      request.workspaceId,
      snapshotDigest,
    );
    return winner
      ? Object.freeze({ kind: "persisted", snapshot: winner, replayed: true })
      : blocked("snapshot_conflict");
  }
}

export async function readLatestContactEligibilitySnapshot(
  database: D1Database,
  ownerSubject: string,
  workspaceId: string,
  prospectId: string,
  contactId: string,
): Promise<ContactEligibilitySnapshot | null> {
  if (
    !bounded(ownerSubject, 160)
    || !bounded(workspaceId, 160)
    || !bounded(prospectId, 160)
    || !bounded(contactId, 160)
  ) return null;
  const row = await database.prepare(
    `SELECT s.* FROM contact_eligibility_snapshots s
     JOIN workspaces w ON w.id=s.workspace_id AND w.owner_subject=?
     WHERE s.workspace_id=? AND s.prospect_id=? AND s.contact_id=?
     ORDER BY s.projected_at DESC,s.id DESC LIMIT 1`,
  ).bind(ownerSubject, workspaceId, prospectId, contactId).first<SnapshotRow>();
  return verifySnapshot(row);
}

async function readAuthority(database: D1Database, request: PersistRequest) {
  const row = await database.prepare(
    `SELECT p.revision prospect_revision,p.state prospect_state,p.active prospect_active,
      cfg.revision configuration_revision,cfg.active configuration_active,
      pc.status candidate_status,qa.outcome assessment_outcome,
      cfg.manifest_json configuration_manifest_json
     FROM workspaces w
     JOIN profile_prospects p ON p.id=? AND p.workspace_id=w.id
     JOIN contacts c ON c.id=? AND c.workspace_id=w.id
     JOIN typed_configurations cfg ON cfg.id=? AND cfg.workspace_id=w.id
      AND cfg.owner_type='profile' AND cfg.owner_id=p.profile_id AND cfg.kind='profile_effective'
     JOIN prospecting_candidates pc ON pc.id=p.candidate_id AND pc.workspace_id=p.workspace_id
      AND pc.profile_id=p.profile_id AND pc.configuration_id=cfg.id
     JOIN qualification_assessments qa ON qa.id=p.assessment_id AND qa.workspace_id=p.workspace_id
      AND qa.candidate_id=pc.id AND qa.configuration_id=cfg.id AND qa.configuration_digest=cfg.digest
     WHERE w.id=? AND w.owner_subject=? AND cfg.digest=? LIMIT 2`,
  ).bind(
    request.prospectId,
    request.contactId,
    request.configurationId,
    request.workspaceId,
    request.ownerSubject,
    request.configurationDigest,
  ).all<AuthorityRow>();
  if (row.results.length !== 1) return null;
  const authority = row.results[0];
  return authority
    && authority.prospect_state === "approved"
    && Number(authority.prospect_active) === 1
    && Number(authority.configuration_active) === 1
    && (authority.candidate_status === "observed" || authority.candidate_status === "qualified")
    && authority.assessment_outcome === "Passed"
    && positive(authority.prospect_revision)
    && positive(authority.configuration_revision)
    && typeof authority.configuration_manifest_json === "string"
      ? authority
      : null;
}

/**
 * Open knowledge drift on any knowledge version the configuration depends on.
 * Shared by the snapshot writer and the Contacts read projection.
 */
export async function hasCurrentDrift(database: D1Database, workspaceId: string, configurationId: string) {
  const row = await database.prepare(
    `SELECT 1 drifted FROM configuration_knowledge_dependencies dependency
     JOIN knowledge_drifts drift ON drift.workspace_id=?
      AND drift.current_version_id=dependency.knowledge_version_id
     WHERE dependency.configuration_id=? AND drift.status<>'resolved' LIMIT 1`,
  ).bind(workspaceId, configurationId).first();
  return row !== null;
}

/**
 * Suppression and tombstone refs that suppress the contact through the named
 * contact-point observations. An unresolvable subject scope returns a sentinel
 * ref, so callers fail closed. Shared by the snapshot writer and the Contacts
 * read projection.
 *
 * D-7 (owner-delegated decision 3, migration 0024): the snapshot gates every
 * channel at once (enqueue, lease and both approval triggers require its refs
 * to be empty), so a tombstone set suppresses the Contact only when it reaches
 * every channel of the named points. Company, Organization and `all`-channel
 * Contact tombstones reach every channel; a channel-scoped Contact tombstone
 * reaches its own channel; an exact email or E.164 tombstone reaches its
 * point's channel; a confirmed domain reaches email when a named email point's
 * recorded whole-label scope holds it or an alias. The scope is recorded with
 * the recipient dispatch authority, after any snapshot of a first-time
 * address, so an unscoped point is deferred, like Package approval, to the
 * Message approval, enqueue, lease and 0015-0017 rechecks, which fail closed
 * for it. Those channel-specific rechecks, and the manual-call recheck for
 * phone, still block whatever a narrowed snapshot leaves open. Legacy
 * suppressions, unknown kinds and anything unparseable reach every channel,
 * and with no named point any matching ref suppresses.
 */
export async function matchingSuppressionRefs(
  database: D1Database,
  workspaceId: string,
  contactId: string,
  observationIds: readonly string[],
) {
  const ids = [...new Set(observationIds)];
  const placeholders = ids.map(() => "?").join(",");
  const digests: readonly { kind: string; contact_point_digest: string }[] = ids.length === 0 ? [] : (await database.prepare(
    `SELECT kind,contact_point_digest FROM contact_point_observations
     WHERE workspace_id=? AND contact_id=? AND id IN (${placeholders})`,
  ).bind(workspaceId, contactId, ...ids).all<{ kind: string; contact_point_digest: string }>()).results;
  const contact = await database.prepare(
    "SELECT identity_digest FROM contacts WHERE id=? AND workspace_id=? LIMIT 1",
  ).bind(contactId, workspaceId).first<{ identity_digest: string }>();
  const identity = contact && digest(contact.identity_digest) ? contact.identity_digest : null;
  const points = digests.filter((row) => digest(row.contact_point_digest));
  const subjects = uniqueSorted([
    ...(identity ? [identity] : []),
    ...points.map((row) => row.contact_point_digest),
  ]);
  if (subjects.length === 0) return ["unresolved-contact-suppression-scope"];
  const subjectPlaceholders = subjects.map(() => "?").join(",");
  const [legacy, outreach] = await Promise.all([
    database.prepare(
      `SELECT id FROM suppressions WHERE workspace_id=? AND subject_digest IN (${subjectPlaceholders})`,
    ).bind(workspaceId, ...subjects).all<{ id: string }>(),
    database.prepare(
      `SELECT id,subject_kind,subject_digest,channel,alias_snapshot_json FROM outreach_suppression_tombstones
       WHERE workspace_id=? AND (
         subject_digest IN (${subjectPlaceholders})
         OR EXISTS (
           SELECT 1 FROM json_each(alias_snapshot_json) alias
           WHERE alias.value IN (${subjectPlaceholders})
         )
         OR subject_kind IN ('confirmed_email_domain','organization','company')
       )`,
    ).bind(workspaceId, ...subjects, ...subjects).all<TombstoneRow>(),
  ]);
  const legacyRefs = legacy.results.map((row) => row.id).filter((id) => bounded(id, 160));
  const tombstones = outreach.results.filter((row) => bounded(row.id, 160));
  const channels = new Set(points.map((row) => row.kind));
  if (points.length === 0 || [...channels].some((kind) => kind !== "email" && kind !== "phone")) {
    return uniqueSorted([...legacyRefs, ...tombstones.map((row) => row.id)]);
  }
  const emailPoints = points.filter((row) => row.kind === "email").map((row) => row.contact_point_digest);
  const phonePoints = new Set(points.filter((row) => row.kind === "phone").map((row) => row.contact_point_digest));
  let domainScopes = new Map<string, ReadonlySet<string>>();
  if (emailPoints.length > 0 && tombstones.some((row) => row.subject_kind === "confirmed_email_domain")) {
    try {
      domainScopes = await recordedDomainScopes(database, workspaceId, emailPoints);
    } catch {
      return uniqueSorted([...legacyRefs, ...tombstones.map((row) => row.id)]);
    }
  }
  const reached = new Set<string>();
  const refs: string[] = [];
  // Only refs that reach a channel of the named points are preserved.
  const reach = (ref: string, scope: readonly string[]) => {
    const named = scope.filter((channel) => channels.has(channel));
    if (named.length === 0) return;
    refs.push(ref);
    for (const channel of named) reached.add(channel);
  };
  for (const id of legacyRefs) reach(id, ALL_CHANNELS);
  for (const row of tombstones) reach(row.id, tombstoneChannels(row, identity, emailPoints, phonePoints, domainScopes));
  if (![...channels].every((channel) => reached.has(channel))) return [];
  return uniqueSorted(refs);
}

type TombstoneRow = { id: string; subject_kind: string; subject_digest: string; channel: string; alias_snapshot_json: string };

const ALL_CHANNELS: readonly string[] = Object.freeze(["email", "phone"]);

/** The channels of the named points that one tombstone reaches (D-7). */
function tombstoneChannels(
  row: TombstoneRow,
  identity: string | null,
  emailPoints: readonly string[],
  phonePoints: ReadonlySet<string>,
  domainScopes: ReadonlyMap<string, ReadonlySet<string>>,
): readonly string[] {
  const aliases = digestList(row.alias_snapshot_json);
  if (!aliases || !digest(row.subject_digest)) return ALL_CHANNELS;
  const covers = (value: string) => row.subject_digest === value || aliases.includes(value);
  switch (row.subject_kind) {
    case "company":
    case "organization":
      return ALL_CHANNELS;
    case "contact":
      if (!identity || !covers(identity) || row.channel === "all") return ALL_CHANNELS;
      return row.channel === "email" || row.channel === "phone" ? [row.channel] : ALL_CHANNELS;
    case "exact_email":
      return emailPoints.some(covers) ? ["email"] : ALL_CHANNELS;
    case "e164_phone":
      return [...phonePoints].some(covers) ? ["phone"] : ALL_CHANNELS;
    case "confirmed_email_domain":
      return emailPoints.some((point) => [...domainScopes.get(point) ?? []].some(covers)) ? ["email"] : [];
    default:
      return ALL_CHANNELS;
  }
}

/**
 * The recorded whole-label domain scope (0024) of each named email point. A
 * point with no row is absent (deferred to the email rechecks). A malformed
 * row or a failed read throws; the caller then fails closed.
 */
async function recordedDomainScopes(database: D1Database, workspaceId: string, emailPoints: readonly string[]) {
  const scopes = new Map<string, ReadonlySet<string>>();
  const rows = (await database.prepare(
    `SELECT contact_point_digest,domain_digests_json FROM outreach_contact_point_domains
     WHERE workspace_id=? AND contact_point_digest IN (${emailPoints.map(() => "?").join(",")})`,
  ).bind(workspaceId, ...emailPoints).all<{ contact_point_digest: string; domain_digests_json: string }>()).results ?? [];
  for (const row of rows) {
    const domains = digestList(row.domain_digests_json);
    if (!domains || domains.length === 0) throw new Error("contact_point_domain_scope_invalid");
    scopes.set(row.contact_point_digest, new Set(domains));
  }
  return scopes;
}

function digestList(json: unknown): string[] | null {
  if (typeof json !== "string") return null;
  try {
    const value = JSON.parse(json) as unknown;
    return Array.isArray(value) && value.every(digest) ? value : null;
  } catch {
    return null;
  }
}

async function readSnapshotByDigest(
  database: D1Database,
  ownerSubject: string,
  workspaceId: string,
  snapshotDigest: string,
) {
  const row = await database.prepare(
    `SELECT s.* FROM contact_eligibility_snapshots s
     JOIN workspaces w ON w.id=s.workspace_id AND w.owner_subject=?
     WHERE s.workspace_id=? AND s.snapshot_digest=? LIMIT 1`,
  ).bind(ownerSubject, workspaceId, snapshotDigest).first<SnapshotRow>();
  return verifySnapshot(row);
}

function normalizeSnapshot(row: SnapshotRow | null): ContactEligibilitySnapshot | null {
  if (
    !row
    || !bounded(row.id, 160)
    || !bounded(row.workspace_id, 160)
    || !bounded(row.contact_id, 160)
    || !bounded(row.prospect_id, 160)
    || !bounded(row.configuration_id, 160)
    || !digest(row.configuration_digest)
    || !positive(row.configuration_revision)
    || !positive(row.prospect_revision)
    || !["ContactReady", "ContactSuggestion", "NeedsReview", "NonContactable"].includes(row.state)
    || (Number(row.eligible) !== 0 && Number(row.eligible) !== 1)
    || (Number(row.eligible) === 1) !== (row.state === "ContactReady")
    || !digest(row.snapshot_digest)
    || !positive(row.projected_at)
  ) return null;
  const observationIds = canonicalStringArray(row.observation_ids_json, 100);
  const reasonCodes = canonicalStringArray(row.reason_codes_json, 32);
  const preservedSuppressionRefs = canonicalStringArray(row.preserved_suppression_refs_json, 100);
  if (!observationIds || !reasonCodes || !preservedSuppressionRefs) return null;
  return Object.freeze({
    id: row.id,
    workspaceId: row.workspace_id,
    contactId: row.contact_id,
    prospectId: row.prospect_id,
    configurationId: row.configuration_id,
    configurationDigest: row.configuration_digest,
    configurationRevision: Number(row.configuration_revision),
    prospectRevision: Number(row.prospect_revision),
    state: row.state as ContactEligibility["state"],
    eligible: Number(row.eligible) === 1,
    observationIds,
    reasonCodes,
    preservedSuppressionRefs,
    snapshotDigest: row.snapshot_digest,
    projectedAt: Number(row.projected_at),
  });
}

async function verifySnapshot(row: SnapshotRow | null) {
  const snapshot = normalizeSnapshot(row);
  if (!snapshot) return null;
  const expected = await canonicalDigest({
    schema: "contact-eligibility-snapshot/v1",
    workspaceId: snapshot.workspaceId,
    contactId: snapshot.contactId,
    prospectId: snapshot.prospectId,
    configurationId: snapshot.configurationId,
    configurationDigest: snapshot.configurationDigest,
    configurationRevision: snapshot.configurationRevision,
    prospectRevision: snapshot.prospectRevision,
    state: snapshot.state,
    eligible: snapshot.eligible,
    observationIds: snapshot.observationIds,
    reasonCodes: snapshot.reasonCodes,
    preservedSuppressionRefs: snapshot.preservedSuppressionRefs,
    projectedAt: snapshot.projectedAt,
  });
  return expected === snapshot.snapshotDigest ? snapshot : null;
}

function normalizeRequest(value: unknown): PersistRequest | null {
  if (!plainObject(value) || !exactKeys(value, [
    "ownerSubject", "workspaceId", "reservationId", "prospectId", "contactId",
    "configurationId", "configurationDigest", "projectedAt",
  ])) return null;
  if (
    !bounded(value.ownerSubject, 160)
    || !bounded(value.workspaceId, 160)
    || !bounded(value.reservationId, 160)
    || !bounded(value.prospectId, 160)
    || !bounded(value.contactId, 160)
    || !bounded(value.configurationId, 160)
    || !digest(value.configurationDigest)
    || !positive(value.projectedAt)
  ) return null;
  try { structuredClone(value); } catch { return null; }
  return Object.freeze({ ...value }) as PersistRequest;
}

function canonicalStringArray(value: string, maximum: number): readonly string[] | null {
  try {
    const parsed = JSON.parse(value);
    if (
      !Array.isArray(parsed)
      || parsed.length > maximum
      || parsed.some((item) => !bounded(item, 160))
      || JSON.stringify(uniqueSorted(parsed)) !== value
    ) return null;
    return Object.freeze(parsed);
  } catch {
    return null;
  }
}

function uniqueSorted(values: readonly string[]) {
  return [...new Set(values)].sort();
}

function blocked(reason: Extract<PersistContactEligibilityResult, { kind: "blocked" }>["reason"]) {
  return Object.freeze({ kind: "blocked" as const, reason });
}

function plainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  return Reflect.ownKeys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function bounded(value: unknown, maximum: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maximum;
}

function digest(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/u.test(value);
}

function positive(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}
