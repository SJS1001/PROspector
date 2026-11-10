import { recheckForPackageApproval } from "./contact-eligibility";
import {
  createD1OutreachRepository,
  OutreachRepositoryConflictError,
  type OutreachBinding,
  type OutreachPackageSnapshot,
  type OutreachRepositoryScope,
  type OutreachWriteResult,
} from "./outreach-repository";

/**
 * Outreach Package authority (06-03 Task 1).
 *
 * A Package Version is a canonical, immutable artifact. Its digest is SHA-256
 * over sorted-key canonical JSON of a strict field allowlist, and it equals the
 * digest the repository persists. Approving a Package Version grants CRM
 * eligibility only: it creates no Message approval, no outbox item, and never
 * reaches a MailPort. Contact readiness is decided by an injected eligibility
 * port; production composition wires the always-refusing
 * `recheckForPackageApproval` from `contact-eligibility.ts`.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_PACKAGE_APPROVAL_TTL_MS = 30 * DAY_MS;
export const MIN_APPROVAL_TTL_MS = 60 * 1000;
export const MAX_APPROVAL_TTL_MS = 366 * DAY_MS;

export const PACKAGE_SCHEMA = "outreach-package-version/v1";
export const PACKAGE_VERSION_FIELDS = Object.freeze([
  "packageId", "prospectId", "contactId", "profileId", "version",
  "configurationId", "configurationDigest", "configurationRevision", "prospectRevision", "contactRevision",
  "contactEligibilitySnapshotId", "snapshot", "bindings",
] as const);
export const PACKAGE_SNAPSHOT_FIELDS = Object.freeze([
  "evidenceDigests", "claimGuardrailDigests", "recommendedAngle", "selectedRole",
  "selectedContactPointDigests", "callScript", "draftMessageIds",
] as const);
export const BINDING_FIELDS = Object.freeze(["kind", "id", "digest"] as const);
export const PACKAGE_BINDING_KINDS = Object.freeze([
  "configuration", "qualification", "review_decision", "source", "evidence",
  "claim_guardrail", "contact_observation", "contact_eligibility",
] as const);
const PACKAGE_IDENTITY_FIELDS = Object.freeze(["packageId", "prospectId", "contactId", "profileId"]);
const PACKAGE_REVISABLE_FIELDS = Object.freeze([
  "configurationId", "configurationDigest", "configurationRevision", "prospectRevision", "contactRevision",
  "contactEligibilitySnapshotId", "snapshot", "bindings",
]);
const SELECTED_ROLES = Object.freeze(["champion", "economic_buyer", "general"]);

export type OutreachPackageDraft = Readonly<{
  packageId: string;
  prospectId: string;
  contactId: string;
  profileId: string;
  version: number;
  configurationId: string;
  configurationDigest: string;
  configurationRevision: number;
  prospectRevision: number;
  contactRevision: number;
  contactEligibilitySnapshotId: string;
  snapshot: OutreachPackageSnapshot;
  bindings: readonly OutreachBinding[];
}>;

export type CanonicalOutreachPackage = Readonly<OutreachPackageDraft & { schema: typeof PACKAGE_SCHEMA }>;

export type PackageContactRecheck = Readonly<{
  boundary: string;
  blocked: boolean;
  eligibility: Readonly<{
    state: string;
    eligible: boolean;
    reasonCodes: readonly string[];
    points: readonly Readonly<{ observationId: string; state: string }>[];
  }>;
}>;

/** The only contact-readiness authority a Package service consults. */
export type PackageEligibilityPort = Readonly<{
  recheckForPackageApproval: (input: unknown) => PackageContactRecheck;
}>;

/** Production wiring: the existing, always-refusing Phase 5 recheck. */
export const PRODUCTION_PACKAGE_ELIGIBILITY_PORT: PackageEligibilityPort = Object.freeze({ recheckForPackageApproval });

export class OutreachArtifactInputError extends Error {
  readonly reason: string;
  constructor(reason: string) {
    super(`outreach_artifact_input:${reason}`);
    this.name = "OutreachArtifactInputError";
    this.reason = reason;
  }
}

// ---------------------------------------------------------------------------
// Canonical form and digest
// ---------------------------------------------------------------------------

const ID = /^[a-z0-9][a-z0-9_.:-]{2,127}$/iu;
const DIGEST = /^[a-f0-9]{64}$/u;
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
const SECRET_KEY = /(?:password|secret|bearer|oauth|pkce|credential|authorization|cookie|access.?token|refresh.?token)/iu;

/** Strict allowlist canonicalization. Throws OutreachArtifactInputError. */
export function canonicalOutreachPackage(value: unknown): CanonicalOutreachPackage {
  const draft = snapshotArtifactInput(value);
  requireExactKeys(draft, PACKAGE_VERSION_FIELDS, "package");
  const snapshot = draft.snapshot;
  if (!isRecord(snapshot)) throw inputError("package_snapshot");
  requireExactKeys(snapshot, PACKAGE_SNAPSHOT_FIELDS, "package_snapshot");
  for (const key of ["packageId", "prospectId", "contactId", "profileId", "configurationId", "contactEligibilitySnapshotId"] as const) {
    requireId(draft[key], key);
  }
  requireDigest(draft.configurationDigest, "configurationDigest");
  for (const key of ["version", "configurationRevision", "prospectRevision", "contactRevision"] as const) {
    requirePositiveInteger(draft[key], key);
  }
  if (typeof snapshot.selectedRole !== "string" || !SELECTED_ROLES.includes(snapshot.selectedRole)) throw inputError("selectedRole");
  const canonicalSnapshot = Object.freeze({
    evidenceDigests: digestSet(snapshot.evidenceDigests, 1, 64, "evidenceDigests"),
    claimGuardrailDigests: digestSet(snapshot.claimGuardrailDigests, 1, 32, "claimGuardrailDigests"),
    recommendedAngle: boundedText(snapshot.recommendedAngle, 1, 4_000, "recommendedAngle"),
    selectedRole: snapshot.selectedRole as OutreachPackageSnapshot["selectedRole"],
    selectedContactPointDigests: digestSet(snapshot.selectedContactPointDigests, 1, 8, "selectedContactPointDigests"),
    callScript: boundedText(snapshot.callScript, 1, 16_000, "callScript"),
    draftMessageIds: idSet(snapshot.draftMessageIds, 0, 32, "draftMessageIds"),
  });
  return Object.freeze({
    schema: PACKAGE_SCHEMA,
    packageId: draft.packageId as string,
    prospectId: draft.prospectId as string,
    contactId: draft.contactId as string,
    profileId: draft.profileId as string,
    version: draft.version as number,
    configurationId: draft.configurationId as string,
    configurationDigest: draft.configurationDigest as string,
    configurationRevision: draft.configurationRevision as number,
    prospectRevision: draft.prospectRevision as number,
    contactRevision: draft.contactRevision as number,
    contactEligibilitySnapshotId: draft.contactEligibilitySnapshotId as string,
    snapshot: canonicalSnapshot,
    bindings: canonicalBindings(draft.bindings, PACKAGE_BINDING_KINDS, PACKAGE_BINDING_KINDS, 128),
  });
}

export async function outreachPackageDigest(canonical: CanonicalOutreachPackage): Promise<string> {
  return sha256Hex(canonicalJson(canonical));
}

/** Sorted-key JSON over plain data; rejects non-integer numbers and secret-shaped keys. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value, 0));
}

export async function sha256Hex(value: string | unknown): Promise<string> {
  const text = typeof value === "string" ? value : canonicalJson(value);
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

// ---------------------------------------------------------------------------
// Approval expiry and invalidation projection
// ---------------------------------------------------------------------------

export function packageApprovalExpiresAt(now: number, ttlMs: number = DEFAULT_PACKAGE_APPROVAL_TTL_MS): number {
  if (!Number.isSafeInteger(now) || now <= 0) throw new RangeError("invalid_approval_clock");
  return now + validTtl(ttlMs);
}

export function validTtl(ttlMs: unknown): number {
  if (typeof ttlMs !== "number" || !Number.isSafeInteger(ttlMs) || ttlMs < MIN_APPROVAL_TTL_MS || ttlMs > MAX_APPROVAL_TTL_MS) {
    throw new RangeError("invalid_approval_ttl");
  }
  return ttlMs;
}

export type PackageApprovalProjection = Readonly<{
  state: "current" | "invalidated";
  crmEligible: boolean;
  messageSendAuthority: false;
  reasonCodes: readonly string[];
}>;

export type PackageApprovalProjectionInput = Readonly<{
  now: number;
  approval: Readonly<{ packageVersionId: string; artifactDigest: string; expiresAt: number; revoked: boolean }> | null;
  version: Readonly<{ id: string; version: number; artifactDigest: string; bindings: readonly OutreachBinding[] }>;
  latestVersion: number;
  currentDependencies: readonly OutreachBinding[];
  contactRecheck: PackageContactRecheck | null;
}>;

/**
 * Pure current-state projection of a Package approval. Any expiry, revocation,
 * newer version, dependency change, or contact readiness loss invalidates it.
 * It never conveys message-send authority.
 */
export function projectPackageApproval(input: PackageApprovalProjectionInput): PackageApprovalProjection {
  const reasons: string[] = [];
  const approval = input.approval;
  if (!approval) reasons.push("approval_missing");
  else {
    if (approval.packageVersionId !== input.version.id || approval.artifactDigest !== input.version.artifactDigest) reasons.push("approval_digest_mismatch");
    if (approval.revoked) reasons.push("approval_revoked");
    if (!Number.isSafeInteger(input.now) || input.now >= approval.expiresAt) reasons.push("approval_expired");
  }
  reasons.push(...packageReadinessReasons(input));
  const reasonCodes = Object.freeze([...new Set(reasons)].sort());
  return Object.freeze({
    state: reasonCodes.length === 0 ? "current" as const : "invalidated" as const,
    crmEligible: reasonCodes.length === 0,
    messageSendAuthority: false as const,
    reasonCodes,
  });
}

function packageReadinessReasons(input: Omit<PackageApprovalProjectionInput, "approval" | "now">): string[] {
  const reasons: string[] = [];
  if (input.latestVersion !== input.version.version) reasons.push("superseded_by_newer_version");
  reasons.push(...dependencyReasons(input.version.bindings, input.currentDependencies));
  reasons.push(...contactReasons(input.contactRecheck, input.version.bindings));
  return reasons;
}

function dependencyReasons(bound: readonly OutreachBinding[], current: readonly OutreachBinding[]): string[] {
  let normalized: readonly OutreachBinding[];
  try {
    normalized = canonicalBindings(current, PACKAGE_BINDING_KINDS, [], 128);
  } catch {
    return ["current_dependencies_invalid"];
  }
  const reasons: string[] = [];
  const currentByKey = new Map(normalized.map((binding) => [`${binding.kind}:${binding.id}`, binding]));
  const boundKeys = new Set(bound.map((binding) => `${binding.kind}:${binding.id}`));
  for (const binding of bound) {
    const now = currentByKey.get(`${binding.kind}:${binding.id}`);
    if (!now) reasons.push(`dependency_missing:${binding.kind}`);
    else if (now.digest !== binding.digest) reasons.push(`dependency_changed:${binding.kind}`);
  }
  for (const binding of normalized) {
    if (!boundKeys.has(`${binding.kind}:${binding.id}`)) reasons.push(`dependency_added:${binding.kind}`);
  }
  return reasons;
}

function contactReasons(recheck: PackageContactRecheck | null, bound: readonly OutreachBinding[]): string[] {
  if (!validRecheck(recheck)) return ["contact_recheck_unavailable"];
  const reasons: string[] = [];
  if (recheck.boundary !== "package_approval") reasons.push("contact_recheck_wrong_boundary");
  if (recheck.blocked !== false) reasons.push("contact_recheck_blocked");
  const eligibility = recheck.eligibility;
  if (eligibility.state !== "ContactReady" || eligibility.eligible !== true) reasons.push("contact_not_ready");
  for (const code of eligibility.reasonCodes) reasons.push(`contact:${code}`);
  const points = new Map(eligibility.points.map((point) => [point.observationId, point.state]));
  for (const point of eligibility.points) if (point.state !== "eligible") reasons.push(`contact_point_${point.state}`);
  const selected = bound.filter((binding) => binding.kind === "contact_observation");
  if (selected.length === 0) reasons.push("contact_point_missing");
  for (const binding of selected) {
    const state = points.get(binding.id);
    if (state === undefined) reasons.push("contact_point_missing");
    else if (state !== "eligible") reasons.push(`contact_point_${state}`);
  }
  return reasons;
}

function validRecheck(value: unknown): value is PackageContactRecheck {
  if (!isRecord(value) || typeof value.boundary !== "string" || typeof value.blocked !== "boolean" || !isRecord(value.eligibility)) return false;
  const eligibility = value.eligibility;
  return typeof eligibility.state === "string" && typeof eligibility.eligible === "boolean"
    && Array.isArray(eligibility.reasonCodes) && eligibility.reasonCodes.every((code) => typeof code === "string" && /^[a-z0-9_:]{1,96}$/u.test(code))
    && Array.isArray(eligibility.points) && eligibility.points.length <= 100
    && eligibility.points.every((point) => isRecord(point) && typeof point.observationId === "string" && typeof point.state === "string" && /^[a-z_]{1,32}$/u.test(point.state));
}

// ---------------------------------------------------------------------------
// Read port (workspace-scoped, admitted reads over the immutable rows)
// ---------------------------------------------------------------------------

export type PackageVersionRecord = Readonly<OutreachPackageDraft & { id: string; workspaceId: string; artifactDigest: string }>;
export type PackageApprovalRecord = Readonly<{
  id: string; packageVersionId: string; artifactDigest: string; approvalDigest: string; expiresAt: number; revoked: boolean;
}>;
export type MessageVersionRecord = Readonly<{
  id: string; messageId: string; packageId: string; packageVersionId: string; version: number;
  snapshot: unknown; intendedSendAt: number | null; timezone: string; unsubscribeTokenDigest: string; artifactDigest: string;
}>;
export type MessageApprovalRecord = Readonly<{
  id: string; messageVersionId: string; packageApprovalId: string; artifactDigest: string; approvalDigest: string; expiresAt: number;
}>;
export type RecipientAuthorityRecord = Readonly<{
  id: string; validUntil: number; unsubscribeStatus: string | null; unsubscribeValidUntil: number | null;
}>;
export type CommandRecord = Readonly<{ commandKind: string; resultKind: string; resultId: string; operationDigest: string }>;

export type OutreachArtifactReader = Readonly<{
  readCommand(idempotencyKey: string): Promise<CommandRecord | null>;
  readPackageVersion(id: string): Promise<PackageVersionRecord | null>;
  latestPackageVersion(packageId: string): Promise<number | null>;
  readPackageApproval(id: string): Promise<PackageApprovalRecord | null>;
  readMessageVersion(id: string): Promise<MessageVersionRecord | null>;
  latestMessageVersion(messageId: string): Promise<number | null>;
  readMessageApproval(id: string): Promise<MessageApprovalRecord | null>;
  readRecipientAuthority(input: Readonly<{ messageVersionId: string; packageApprovalId: string; acknowledgementDigest: string }>): Promise<RecipientAuthorityRecord | null>;
}>;

export function createD1OutreachArtifactReader(database: D1Database, scope: OutreachRepositoryScope): OutreachArtifactReader {
  if (!isRecord(scope) || typeof scope.workspaceId !== "string" || !ID.test(scope.workspaceId) || typeof scope.ownerSubject !== "string" || !ID.test(scope.ownerSubject)) {
    throw new TypeError("invalid_outreach_reader_scope");
  }
  const workspaceId = scope.workspaceId;
  const owner = scope.ownerSubject;
  const admitted = "JOIN workspaces admitted ON admitted.id=? AND admitted.owner_subject=?";
  const first = <T>(sql: string, ...values: unknown[]) => database.prepare(sql).bind(workspaceId, owner, ...values).first<T>();
  const guardId = (value: unknown) => typeof value === "string" && ID.test(value);

  return Object.freeze({
    async readCommand(key) {
      if (!guardId(key)) return null;
      const row = await first<{ command_kind: string; result_kind: string; result_id: string; operation_digest: string }>(
        `SELECT c.command_kind,c.result_kind,c.result_id,c.operation_digest FROM outreach_commands c ${admitted}
         WHERE c.workspace_id=admitted.id AND c.idempotency_key=? LIMIT 1`, key,
      );
      return row ? Object.freeze({ commandKind: row.command_kind, resultKind: row.result_kind, resultId: row.result_id, operationDigest: row.operation_digest }) : null;
    },
    async readPackageVersion(id) {
      if (!guardId(id)) return null;
      const row = await first<Record<string, unknown>>(
        `SELECT pv.id,pv.workspace_id,pv.package_id,op.prospect_id,op.contact_id,op.profile_id,pv.version,pv.configuration_id,
                pv.configuration_digest,pv.configuration_revision,pv.prospect_revision,pv.contact_revision,
                pv.contact_eligibility_snapshot_id,pv.snapshot_json,pv.artifact_digest
         FROM outreach_package_versions pv ${admitted}
         JOIN outreach_packages op ON op.id=pv.package_id AND op.workspace_id=pv.workspace_id
         WHERE pv.workspace_id=admitted.id AND pv.id=? LIMIT 1`, id,
      );
      if (!row) return null;
      type BindingRow = { binding_kind: OutreachBinding["kind"]; binding_id: string; binding_digest: string };
      const bindings: BindingRow[] = (await database.prepare(
        `SELECT binding_kind,binding_id,binding_digest FROM outreach_artifact_bindings
         WHERE workspace_id=? AND artifact_kind='package_version' AND artifact_id=? ORDER BY ordinal`,
      ).bind(workspaceId, id).all<BindingRow>()).results;
      return Object.freeze({
        id: String(row.id), workspaceId: String(row.workspace_id), packageId: String(row.package_id),
        prospectId: String(row.prospect_id), contactId: String(row.contact_id), profileId: String(row.profile_id),
        version: Number(row.version), configurationId: String(row.configuration_id), configurationDigest: String(row.configuration_digest),
        configurationRevision: Number(row.configuration_revision), prospectRevision: Number(row.prospect_revision),
        contactRevision: Number(row.contact_revision), contactEligibilitySnapshotId: String(row.contact_eligibility_snapshot_id),
        snapshot: deepFreeze(JSON.parse(String(row.snapshot_json))) as OutreachPackageSnapshot,
        bindings: Object.freeze(bindings.map((binding: BindingRow) => Object.freeze({ kind: binding.binding_kind, id: binding.binding_id, digest: binding.binding_digest }))),
        artifactDigest: String(row.artifact_digest),
      });
    },
    async latestPackageVersion(packageId) {
      if (!guardId(packageId)) return null;
      const row = await first<{ latest: number | null }>(
        `SELECT max(pv.version) latest FROM outreach_package_versions pv ${admitted} WHERE pv.workspace_id=admitted.id AND pv.package_id=?`, packageId,
      );
      return row?.latest == null ? null : Number(row.latest);
    },
    async readPackageApproval(id) {
      if (!guardId(id)) return null;
      const row = await first<{ id: string; package_version_id: string; artifact_digest: string; approval_digest: string; expires_at: number; revoked: number }>(
        `SELECT pa.id,pa.package_version_id,pa.artifact_digest,pa.approval_digest,pa.expires_at,
                EXISTS (SELECT 1 FROM outreach_approval_revocations r WHERE r.workspace_id=pa.workspace_id AND r.package_approval_id=pa.id) revoked
         FROM outreach_package_approvals pa ${admitted}
         WHERE pa.workspace_id=admitted.id AND pa.owner_subject=admitted.owner_subject AND pa.id=? LIMIT 1`, id,
      );
      return row ? Object.freeze({
        id: row.id, packageVersionId: row.package_version_id, artifactDigest: row.artifact_digest,
        approvalDigest: row.approval_digest, expiresAt: Number(row.expires_at), revoked: Number(row.revoked) === 1,
      }) : null;
    },
    async readMessageVersion(id) {
      if (!guardId(id)) return null;
      const row = await first<Record<string, unknown>>(
        `SELECT mv.id,mv.message_id,m.package_id,mv.package_version_id,mv.version,mv.snapshot_json,mv.intended_send_at,
                mv.timezone,mv.unsubscribe_token_digest,mv.artifact_digest
         FROM outreach_message_versions mv ${admitted}
         JOIN outreach_messages m ON m.id=mv.message_id AND m.workspace_id=mv.workspace_id
         WHERE mv.workspace_id=admitted.id AND mv.id=? LIMIT 1`, id,
      );
      return row ? Object.freeze({
        id: String(row.id), messageId: String(row.message_id), packageId: String(row.package_id),
        packageVersionId: String(row.package_version_id), version: Number(row.version),
        snapshot: deepFreeze(JSON.parse(String(row.snapshot_json))),
        intendedSendAt: row.intended_send_at === null ? null : Number(row.intended_send_at),
        timezone: String(row.timezone), unsubscribeTokenDigest: String(row.unsubscribe_token_digest), artifactDigest: String(row.artifact_digest),
      }) : null;
    },
    async latestMessageVersion(messageId) {
      if (!guardId(messageId)) return null;
      const row = await first<{ latest: number | null }>(
        `SELECT max(mv.version) latest FROM outreach_message_versions mv ${admitted} WHERE mv.workspace_id=admitted.id AND mv.message_id=?`, messageId,
      );
      return row?.latest == null ? null : Number(row.latest);
    },
    async readMessageApproval(id) {
      if (!guardId(id)) return null;
      const row = await first<{ id: string; message_version_id: string; package_approval_id: string; artifact_digest: string; approval_digest: string; expires_at: number }>(
        `SELECT ma.id,ma.message_version_id,ma.package_approval_id,ma.artifact_digest,ma.approval_digest,ma.expires_at
         FROM outreach_message_approvals ma ${admitted}
         WHERE ma.workspace_id=admitted.id AND ma.owner_subject=admitted.owner_subject AND ma.id=? LIMIT 1`, id,
      );
      return row ? Object.freeze({
        id: row.id, messageVersionId: row.message_version_id, packageApprovalId: row.package_approval_id,
        artifactDigest: row.artifact_digest, approvalDigest: row.approval_digest, expiresAt: Number(row.expires_at),
      }) : null;
    },
    async readRecipientAuthority(input) {
      if (!guardId(input.messageVersionId) || !guardId(input.packageApprovalId) || typeof input.acknowledgementDigest !== "string" || !DIGEST.test(input.acknowledgementDigest)) return null;
      const row = await first<{ id: string; valid_until: number; unsubscribe_status: string | null; unsubscribe_valid_until: number | null }>(
        `SELECT a.id,a.valid_until,u.status unsubscribe_status,u.valid_until unsubscribe_valid_until
         FROM outreach_recipient_dispatch_authorities a ${admitted}
         LEFT JOIN outreach_unsubscribe_authority_events u ON u.id=(
           SELECT latest.id FROM outreach_unsubscribe_authority_events latest
           WHERE latest.recipient_authority_id=a.id AND latest.workspace_id=a.workspace_id ORDER BY latest.revision DESC LIMIT 1)
         WHERE a.workspace_id=admitted.id AND a.owner_subject=admitted.owner_subject
           AND a.message_version_id=? AND a.package_approval_id=? AND a.acknowledgement_digest=? LIMIT 1`,
        input.messageVersionId, input.packageApprovalId, input.acknowledgementDigest,
      );
      return row ? Object.freeze({
        id: row.id, validUntil: Number(row.valid_until), unsubscribeStatus: row.unsubscribe_status,
        unsubscribeValidUntil: row.unsubscribe_valid_until === null ? null : Number(row.unsubscribe_valid_until),
      }) : null;
    },
  });
}

// ---------------------------------------------------------------------------
// Package service
// ---------------------------------------------------------------------------

type PackageRepository = Readonly<{
  createPackageVersion: ReturnType<typeof createD1OutreachRepository>["createPackageVersion"];
  approvePackageVersion: ReturnType<typeof createD1OutreachRepository>["approvePackageVersion"];
}>;

export type ContactEvidence = Readonly<{ points?: readonly unknown[]; strategy?: unknown; authority?: unknown }>;

export type ArtifactRefusal = Readonly<{ kind: "refused"; reasonCodes: readonly string[] }>;
export type PackageVersionCreated = Readonly<{ kind: "created"; id: string; digest: string; version: number; replayed: boolean }>;
export type PackageApproved = Readonly<{
  kind: "approved"; approvalId: string; approvalDigest: string; packageVersionId: string; artifactDigest: string;
  expiresAt: number; replayed: boolean; authority: "crm_eligibility_only";
  effects: Readonly<{ outboxItems: 0; mailPortCalls: 0; messageApprovals: 0 }>;
}>;

export type OutreachPackageService = ReturnType<typeof createOutreachPackageService>;

export function createOutreachPackageService(deps: Readonly<{
  repository: PackageRepository;
  reader: OutreachArtifactReader;
  eligibility: PackageEligibilityPort;
  now: () => number;
  approvalTtlMs?: number;
}>) {
  if (!isRecord(deps) || !hasOnlyKeys(deps, ["repository", "reader", "eligibility", "now"], ["approvalTtlMs"])) throw new TypeError("invalid_package_service_dependencies");
  const { repository, reader, eligibility, now } = deps;
  if (!isRecord(eligibility) || typeof eligibility.recheckForPackageApproval !== "function") throw new TypeError("invalid_package_eligibility_port");
  if (!isRecord(repository) || !isRecord(reader) || typeof now !== "function") throw new TypeError("invalid_package_service_dependencies");
  const ttl = validTtl(deps.approvalTtlMs ?? DEFAULT_PACKAGE_APPROVAL_TTL_MS);
  const recheck = eligibility.recheckForPackageApproval;
  const clock = () => {
    const value = now();
    if (!Number.isSafeInteger(value) || value <= 0) throw new RangeError("invalid_package_service_clock");
    return value;
  };

  const runRecheck = (version: PackageVersionRecord, evidence: unknown, at: number): PackageContactRecheck | null => {
    if (!isRecord(evidence) || !hasOnlyKeys(evidence, [], ["points", "strategy", "authority"])) return null;
    try {
      return recheck({
        ...evidence,
        target: { workspaceId: version.workspaceId, prospectId: version.prospectId, contactId: version.contactId },
        now: at,
      });
    } catch {
      return null;
    }
  };

  const createFromCanonical = async (canonical: CanonicalOutreachPackage, idempotencyKey: unknown): Promise<PackageVersionCreated | ArtifactRefusal> => {
    if (typeof idempotencyKey !== "string" || !ID.test(idempotencyKey)) return refused("invalid_idempotency_key");
    const prior = await reader.readCommand(idempotencyKey);
    if (prior && prior.commandKind !== "package_version.create") return refused("idempotency_conflict");
    const digest = await outreachPackageDigest(canonical);
    let result: OutreachWriteResult;
    try {
      result = await repository.createPackageVersion({
        packageId: canonical.packageId, prospectId: canonical.prospectId, contactId: canonical.contactId, profileId: canonical.profileId,
        version: canonical.version, expectedVersion: canonical.version - 1,
        configurationId: canonical.configurationId, configurationDigest: canonical.configurationDigest,
        configurationRevision: canonical.configurationRevision, prospectRevision: canonical.prospectRevision,
        contactRevision: canonical.contactRevision, contactEligibilitySnapshotId: canonical.contactEligibilitySnapshotId,
        snapshot: canonical.snapshot, bindings: canonical.bindings, idempotencyKey,
      });
    } catch (error) {
      return mapRepositoryError(error, reader, idempotencyKey);
    }
    if (result.digest !== digest) throw new Error("outreach_package_digest_invariant");
    return Object.freeze({ kind: "created" as const, id: result.id, digest: result.digest, version: canonical.version, replayed: result.replayed });
  };

  const service = Object.freeze({
    /** Create an immutable Package Version from a complete draft. */
    async createVersion(input: Readonly<{ draft: unknown; idempotencyKey: string }>): Promise<PackageVersionCreated | ArtifactRefusal> {
      if (!isRecord(input) || !hasOnlyKeys(input, ["draft", "idempotencyKey"])) return refused("invalid_package_input");
      let canonical: CanonicalOutreachPackage;
      try { canonical = canonicalOutreachPackage(input.draft); } catch { return refused("invalid_package_input"); }
      return createFromCanonical(canonical, input.idempotencyKey);
    },

    /** Version-only edit: the previous version is never mutated; a new version supersedes it. */
    async reviseVersion(input: Readonly<{ previousVersionId: string; changes: unknown; idempotencyKey: string }>): Promise<PackageVersionCreated | ArtifactRefusal> {
      if (!isRecord(input) || !hasOnlyKeys(input, ["previousVersionId", "changes", "idempotencyKey"])) return refused("invalid_package_input");
      let changes: Record<string, unknown>;
      try { changes = snapshotArtifactInput(input.changes); } catch { return refused("invalid_package_input"); }
      if (Object.keys(changes).some((key) => PACKAGE_IDENTITY_FIELDS.includes(key) || key === "version")) return refused("package_identity_immutable");
      if (!hasOnlyKeys(changes, [], PACKAGE_REVISABLE_FIELDS)) return refused("invalid_package_input");
      const previous = await reader.readPackageVersion(String(input.previousVersionId));
      if (!previous) return refused("package_version_unavailable");
      if ((await reader.latestPackageVersion(previous.packageId)) !== previous.version) return refused("stale_base_version");
      if (changes.snapshot !== undefined && !isRecord(changes.snapshot)) return refused("invalid_package_input");
      const merged = {
        ...draftOf(previous),
        ...changes,
        snapshot: { ...previous.snapshot, ...(changes.snapshot as Record<string, unknown> | undefined) },
      };
      let next: CanonicalOutreachPackage;
      let same: CanonicalOutreachPackage;
      try {
        next = canonicalOutreachPackage({ ...merged, version: previous.version + 1 });
        same = canonicalOutreachPackage({ ...merged, version: previous.version });
      } catch { return refused("invalid_package_input"); }
      if (await outreachPackageDigest(same) === previous.artifactDigest) return refused("unchanged_package");
      return createFromCanonical(next, input.idempotencyKey);
    },

    /**
     * Approve exactly the reviewed Package Version digest for CRM eligibility.
     * Contact readiness is decided only by the injected eligibility port.
     */
    async approve(input: Readonly<{
      packageVersionId: string; reviewedDigest: string; currentDependencies: readonly OutreachBinding[];
      contactEvidence: ContactEvidence; idempotencyKey: string;
    }>): Promise<PackageApproved | ArtifactRefusal> {
      if (!isRecord(input) || !hasOnlyKeys(input, ["packageVersionId", "reviewedDigest", "currentDependencies", "contactEvidence", "idempotencyKey"])) return refused("invalid_package_approval_input");
      const { packageVersionId, reviewedDigest, idempotencyKey } = input;
      if (typeof idempotencyKey !== "string" || !ID.test(idempotencyKey) || typeof reviewedDigest !== "string" || !DIGEST.test(reviewedDigest)) return refused("invalid_package_approval_input");
      const prior = await reader.readCommand(idempotencyKey);
      if (prior) {
        const existing = prior.commandKind === "package.approve" ? await reader.readPackageApproval(prior.resultId) : null;
        if (!existing || existing.packageVersionId !== packageVersionId || existing.artifactDigest !== reviewedDigest) return refused("idempotency_conflict");
        return approvedPackage(existing, true);
      }
      const version = await reader.readPackageVersion(String(packageVersionId));
      if (!version) return refused("package_version_unavailable");
      const at = clock();
      const reasons: string[] = [];
      if (version.artifactDigest !== reviewedDigest) reasons.push("reviewed_digest_mismatch");
      reasons.push(...packageReadinessReasons({
        version,
        latestVersion: (await reader.latestPackageVersion(version.packageId)) ?? 0,
        currentDependencies: input.currentDependencies,
        contactRecheck: runRecheck(version, input.contactEvidence, at),
      }));
      if (reasons.length > 0) return refused(...reasons);
      const expiresAt = packageApprovalExpiresAt(at, ttl);
      let result: OutreachWriteResult;
      try {
        result = await repository.approvePackageVersion({ packageVersionId: version.id, expectedVersion: version.version, expiresAt, idempotencyKey });
      } catch (error) {
        return mapRepositoryError(error, reader, idempotencyKey);
      }
      return approvedPackage({
        id: result.id, packageVersionId: version.id, artifactDigest: version.artifactDigest, approvalDigest: result.digest, expiresAt, revoked: false,
      }, result.replayed);
    },

    /** Current dependency-change invalidation projection for a stored approval. */
    async projectApproval(input: Readonly<{ packageApprovalId: string; currentDependencies: readonly OutreachBinding[]; contactEvidence: ContactEvidence }>): Promise<PackageApprovalProjection & Readonly<{ approval: PackageApprovalRecord | null }>> {
      const unavailable = (reason: string) => Object.freeze({
        state: "invalidated" as const, crmEligible: false, messageSendAuthority: false as const, reasonCodes: Object.freeze([reason]), approval: null,
      });
      if (!isRecord(input) || !hasOnlyKeys(input, ["packageApprovalId", "currentDependencies", "contactEvidence"])) return unavailable("invalid_projection_input");
      const approval = await reader.readPackageApproval(String(input.packageApprovalId));
      if (!approval) return unavailable("approval_unavailable");
      const version = await reader.readPackageVersion(approval.packageVersionId);
      if (!version) return unavailable("package_version_unavailable");
      const at = clock();
      const projection = projectPackageApproval({
        now: at,
        approval,
        version,
        latestVersion: (await reader.latestPackageVersion(version.packageId)) ?? 0,
        currentDependencies: input.currentDependencies,
        contactRecheck: runRecheck(version, input.contactEvidence, at),
      });
      return Object.freeze({ ...projection, approval });
    },
  });
  return service;
}

/** Production composition: D1 repository, admitted reader, and the blocked Phase 5 recheck. */
export function composeOutreachPackageService(database: D1Database, scope: OutreachRepositoryScope, options: Readonly<{ approvalTtlMs?: number }> = {}) {
  if (!isRecord(options) || !hasOnlyKeys(options, [], ["approvalTtlMs"])) throw new TypeError("invalid_package_composition_options");
  return createOutreachPackageService({
    repository: createD1OutreachRepository(database, scope),
    reader: createD1OutreachArtifactReader(database, scope),
    eligibility: PRODUCTION_PACKAGE_ELIGIBILITY_PORT,
    now: scope.now ?? Date.now,
    ...(options.approvalTtlMs === undefined ? {} : { approvalTtlMs: options.approvalTtlMs }),
  });
}

function approvedPackage(approval: PackageApprovalRecord, replayed: boolean): PackageApproved {
  return Object.freeze({
    kind: "approved" as const,
    approvalId: approval.id,
    approvalDigest: approval.approvalDigest,
    packageVersionId: approval.packageVersionId,
    artifactDigest: approval.artifactDigest,
    expiresAt: approval.expiresAt,
    replayed,
    authority: "crm_eligibility_only" as const,
    effects: Object.freeze({ outboxItems: 0 as const, mailPortCalls: 0 as const, messageApprovals: 0 as const }),
  });
}

function draftOf(record: PackageVersionRecord): Record<string, unknown> {
  return {
    packageId: record.packageId, prospectId: record.prospectId, contactId: record.contactId, profileId: record.profileId,
    version: record.version, configurationId: record.configurationId, configurationDigest: record.configurationDigest,
    configurationRevision: record.configurationRevision, prospectRevision: record.prospectRevision,
    contactRevision: record.contactRevision, contactEligibilitySnapshotId: record.contactEligibilitySnapshotId,
    snapshot: record.snapshot, bindings: record.bindings,
  };
}

/** Maps a repository refusal to a stable reason; distinguishes idempotency-key reuse. */
export async function mapRepositoryError(error: unknown, reader: OutreachArtifactReader, idempotencyKey: string): Promise<ArtifactRefusal> {
  if (!(error instanceof OutreachRepositoryConflictError)) throw error;
  if (await reader.readCommand(idempotencyKey)) return refused("idempotency_conflict");
  const detail = error.message.replace(/^outreach_repository_conflict:/u, "");
  return refused("repository_refused", ...(detail && detail !== "conflict" ? [`repository:${detail}`] : []));
}

export function refused(...reasons: string[]): ArtifactRefusal {
  return Object.freeze({ kind: "refused" as const, reasonCodes: Object.freeze([...new Set(reasons)].sort()) });
}

// ---------------------------------------------------------------------------
// Shared strict-input helpers (also used by message-version.ts)
// ---------------------------------------------------------------------------

/** Copies plain data without invoking accessors, toJSON, or proxies' traps beyond descriptors. */
export function snapshotArtifactInput(value: unknown): Record<string, unknown> {
  let nodes = 0;
  const seen = new Set<object>();
  const copy = (item: unknown, depth: number): unknown => {
    if (++nodes > 4096 || depth > 8) throw inputError("input_shape");
    if (item === null || typeof item === "string" || typeof item === "boolean") return item;
    if (typeof item === "number") { if (!Number.isFinite(item)) throw inputError("input_shape"); return item; }
    if (typeof item !== "object" || seen.has(item)) throw inputError("input_shape");
    seen.add(item);
    try {
      const descriptors = Object.getOwnPropertyDescriptors(item);
      const keys = Reflect.ownKeys(descriptors);
      if (keys.some((key) => typeof key !== "string")) throw inputError("input_shape");
      if (Array.isArray(item)) {
        if (Object.getPrototypeOf(item) !== Array.prototype || item.length > 1024 || keys.length !== item.length + 1) throw inputError("input_shape");
        return Array.from({ length: item.length }, (_, index) => {
          const descriptor = descriptors[String(index)];
          if (!descriptor || !Object.hasOwn(descriptor, "value") || !descriptor.enumerable) throw inputError("input_shape");
          return copy(descriptor.value, depth + 1);
        });
      }
      if (Object.getPrototypeOf(item) !== Object.prototype) throw inputError("input_shape");
      const out: Record<string, unknown> = {};
      for (const key of keys as string[]) {
        const descriptor = descriptors[key];
        if (!Object.hasOwn(descriptor, "value") || !descriptor.enumerable) throw inputError("input_shape");
        if (descriptor.value === undefined) throw inputError(`undefined:${key}`);
        out[key] = copy(descriptor.value, depth + 1);
      }
      return out;
    } finally {
      seen.delete(item);
    }
  };
  const result = copy(value, 0);
  if (!isRecord(result)) throw inputError("input_shape");
  return result;
}

export function canonicalBindings(value: unknown, allowedKinds: readonly string[], requiredKinds: readonly string[], max: number): readonly OutreachBinding[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > max) throw inputError("bindings");
  const bindings = value.map((binding) => {
    if (!isRecord(binding)) throw inputError("binding");
    requireExactKeys(binding, BINDING_FIELDS, "binding");
    if (typeof binding.kind !== "string" || !allowedKinds.includes(binding.kind)) throw inputError("binding_kind");
    requireId(binding.id, "binding_id");
    requireDigest(binding.digest, "binding_digest");
    return Object.freeze({ kind: binding.kind as OutreachBinding["kind"], id: binding.id as string, digest: binding.digest as string });
  });
  if (new Set(bindings.map((binding) => `${binding.kind}:${binding.id}`)).size !== bindings.length) throw inputError("duplicate_binding");
  const kinds = new Set(bindings.map((binding) => binding.kind));
  if (requiredKinds.some((kind) => !kinds.has(kind as OutreachBinding["kind"]))) throw inputError("missing_binding");
  // Same comparator as the repository's normalizedBindings so persisted digests agree.
  return Object.freeze(bindings.sort((a, b) => `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`)));
}

export function requireExactKeys(value: Record<string, unknown>, keys: readonly string[], label: string) {
  const own = Object.keys(value);
  if (own.length !== keys.length || own.some((key) => !keys.includes(key))) throw inputError(`${label}_fields`);
}

export function boundedText(value: unknown, min: number, max: number, label: string): string {
  if (typeof value !== "string") throw inputError(label);
  const normalized = value.normalize("NFC");
  if (normalized.length < min || normalized.length > max || CONTROL.test(normalized)) throw inputError(label);
  return normalized;
}

export function requireId(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !ID.test(value)) throw inputError(label);
}

export function requireDigest(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !DIGEST.test(value)) throw inputError(label);
}

export function requirePositiveInteger(value: unknown, label: string): asserts value is number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) throw inputError(label);
}

export function inputError(reason: string) { return new OutreachArtifactInputError(reason); }

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

export function hasOnlyKeys(value: object, required: readonly string[], optional: readonly string[] = []) {
  const keys = Reflect.ownKeys(value);
  return required.every((key) => keys.includes(key)) && keys.every((key) => typeof key === "string" && (required.includes(key) || optional.includes(key)));
}

function digestSet(value: unknown, min: number, max: number, label: string): readonly string[] {
  if (!Array.isArray(value) || value.length < min || value.length > max || value.some((item) => typeof item !== "string" || !DIGEST.test(item))) throw inputError(label);
  if (new Set(value).size !== value.length) throw inputError(`duplicate_${label}`);
  return Object.freeze([...value].sort());
}

function idSet(value: unknown, min: number, max: number, label: string): readonly string[] {
  if (!Array.isArray(value) || value.length < min || value.length > max || value.some((item) => typeof item !== "string" || !ID.test(item))) throw inputError(label);
  if (new Set(value).size !== value.length) throw inputError(`duplicate_${label}`);
  return Object.freeze([...value].sort());
}

function canonicalValue(value: unknown, depth: number): unknown {
  if (depth > 12) throw inputError("canonical_depth");
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  if (Array.isArray(value)) return value.map((item) => canonicalValue(item, depth + 1));
  if (isRecord(value)) {
    if (Object.keys(value).some((key) => SECRET_KEY.test(key))) throw inputError("secret_shaped_key");
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key], depth + 1)]));
  }
  throw inputError("canonical_value");
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}
