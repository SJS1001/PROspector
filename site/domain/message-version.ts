import {
  boundedText,
  canonicalBindings,
  canonicalJson,
  composeOutreachPackageService,
  createD1OutreachArtifactReader,
  DEFAULT_PACKAGE_APPROVAL_TTL_MS,
  hasOnlyKeys,
  inputError,
  isRecord,
  mapRepositoryError,
  refused,
  requireDigest,
  requireExactKeys,
  requireId,
  requirePositiveInteger,
  sha256Hex,
  snapshotArtifactInput,
  validTtl,
  type ArtifactRefusal,
  type ContactEvidence,
  type MessageApprovalRecord,
  type MessageVersionRecord,
  type OutreachArtifactReader,
  type OutreachPackageService,
} from "./outreach-package";
import {
  createD1OutreachRepository,
  type OutreachBinding,
  type OutreachMessageSnapshot,
  type OutreachRepositoryScope,
  type OutreachWriteResult,
} from "./outreach-repository";

/**
 * Message Version authority (06-03 Task 2).
 *
 * Each Message Version is an immutable canonical email artifact bound to one
 * exact Package Version digest. Every canonical-field edit, including a
 * reschedule, is a new version with a new digest and needs its own approval.
 * A message approval is exact and independent: it binds this version digest,
 * the owner, a current Package approval, and an acknowledgement-bearing
 * recipient authority. It enqueues nothing and never invokes a MailPort.
 */

export const MESSAGE_SCHEMA = "outreach-message-version/v1";
export const MESSAGE_VERSION_FIELDS = Object.freeze([
  "messageId", "packageId", "packageVersionId", "version", "snapshot", "intendedSendAt", "timezone", "unsubscribeTokenDigest",
] as const);
export const MESSAGE_SNAPSHOT_FIELDS = Object.freeze([
  "senderReference", "from", "replyTo", "to", "cc", "bcc", "subject", "textBody", "htmlBody",
  "links", "attachments", "threadReference", "replyToMessageReference",
] as const);
const MESSAGE_REVISABLE_FIELDS = Object.freeze(["packageVersionId", "snapshot", "intendedSendAt", "timezone", "unsubscribeTokenDigest"]);
const TIMEZONE = /^[A-Za-z_]+(?:\/[A-Za-z0-9_+.-]+)+$/u;
const MAILBOX = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]+$/u;
const MEDIA_TYPE = /^[a-z0-9][a-z0-9!#$&^_.+-]{0,63}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,63}$/u;
const HEADER_BREAK = /[\r\n]/u;

export type MessageVersionDraft = Readonly<{
  messageId: string;
  packageId: string;
  packageVersionId: string;
  version: number;
  snapshot: OutreachMessageSnapshot;
  intendedSendAt: number | null;
  timezone: string;
  unsubscribeTokenDigest: string;
}>;

export type CanonicalMessageVersion = Readonly<MessageVersionDraft & {
  schema: typeof MESSAGE_SCHEMA;
  bindings: readonly OutreachBinding[];
}>;

/** Strict allowlist canonicalization bound to the exact Package Version digest. */
export function canonicalMessageVersion(value: unknown, packageVersionDigest: string): CanonicalMessageVersion {
  requireDigest(packageVersionDigest, "packageVersionDigest");
  const draft = snapshotArtifactInput(value);
  requireExactKeys(draft, MESSAGE_VERSION_FIELDS, "message");
  const snapshot = draft.snapshot;
  if (!isRecord(snapshot)) throw inputError("message_snapshot");
  requireExactKeys(snapshot, MESSAGE_SNAPSHOT_FIELDS, "message_snapshot");
  requireId(draft.messageId, "messageId");
  requireId(draft.packageId, "packageId");
  requireId(draft.packageVersionId, "packageVersionId");
  requirePositiveInteger(draft.version, "version");
  requireDigest(draft.unsubscribeTokenDigest, "unsubscribeTokenDigest");
  if (draft.intendedSendAt !== null) requirePositiveInteger(draft.intendedSendAt, "intendedSendAt");
  const timezone = canonicalTimezone(draft.timezone);

  const to = mailboxSet(snapshot.to, 1, "to");
  const cc = mailboxSet(snapshot.cc, 0, "cc");
  const bcc = mailboxSet(snapshot.bcc, 0, "bcc");
  const recipients = [...to, ...cc, ...bcc];
  if (new Set(recipients).size !== recipients.length) throw inputError("duplicate_recipient");
  if (recipients.length > 32) throw inputError("recipient_count");

  const canonicalSnapshot: OutreachMessageSnapshot = Object.freeze({
    senderReference: headerText(snapshot.senderReference, 1, 256, "senderReference"),
    from: mailbox(snapshot.from, "from"),
    replyTo: snapshot.replyTo === null ? null : mailbox(snapshot.replyTo, "replyTo"),
    to, cc, bcc,
    subject: headerText(snapshot.subject, 1, 998, "subject"),
    textBody: boundedText(snapshot.textBody, 1, 32_000, "textBody"),
    // HTML is stored as inert data only; rendering later escapes it.
    htmlBody: snapshot.htmlBody === null ? null : boundedText(snapshot.htmlBody, 1, 48_000, "htmlBody"),
    links: links(snapshot.links),
    attachments: attachments(snapshot.attachments),
    threadReference: snapshot.threadReference === null ? null : headerText(snapshot.threadReference, 1, 512, "threadReference"),
    replyToMessageReference: snapshot.replyToMessageReference === null ? null : headerText(snapshot.replyToMessageReference, 1, 512, "replyToMessageReference"),
  });
  return Object.freeze({
    schema: MESSAGE_SCHEMA,
    messageId: draft.messageId as string,
    packageId: draft.packageId as string,
    packageVersionId: draft.packageVersionId as string,
    version: draft.version as number,
    snapshot: canonicalSnapshot,
    intendedSendAt: draft.intendedSendAt as number | null,
    timezone,
    unsubscribeTokenDigest: draft.unsubscribeTokenDigest as string,
    bindings: canonicalBindings([{ kind: "package_version", id: draft.packageVersionId, digest: packageVersionDigest }], ["package_version"], ["package_version"], 1),
  });
}

export async function messageVersionDigest(canonical: CanonicalMessageVersion): Promise<string> {
  return sha256Hex(canonicalJson(canonical));
}

/**
 * Pure reschedule: returns the next version draft, or null when the time and
 * timezone are unchanged. The input draft is never mutated.
 */
export function rescheduleMessageDraft(draft: MessageVersionDraft, schedule: Readonly<{ intendedSendAt: number | null; timezone: string }>): MessageVersionDraft | null {
  const copied = snapshotArtifactInput(schedule);
  requireExactKeys(copied, ["intendedSendAt", "timezone"], "reschedule");
  if (copied.intendedSendAt !== null) requirePositiveInteger(copied.intendedSendAt, "intendedSendAt");
  const timezone = canonicalTimezone(copied.timezone);
  const base = snapshotArtifactInput(draft) as unknown as MessageVersionDraft;
  if (base.intendedSendAt === copied.intendedSendAt && base.timezone === timezone) return null;
  return Object.freeze({ ...base, version: base.version + 1, intendedSendAt: copied.intendedSendAt as number | null, timezone });
}

type MessageRepository = Readonly<{
  createMessageVersion: ReturnType<typeof createD1OutreachRepository>["createMessageVersion"];
  approveMessageVersion: ReturnType<typeof createD1OutreachRepository>["approveMessageVersion"];
}>;

export type MessageVersionCreated = Readonly<{ kind: "created"; id: string; digest: string; version: number; replayed: boolean }>;
export type MessageApproved = Readonly<{
  kind: "approved"; approvalId: string; approvalDigest: string; messageVersionId: string; artifactDigest: string;
  packageApprovalId: string; expiresAt: number; replayed: boolean; authority: "exact_message_only";
  effects: Readonly<{ outboxItems: 0; mailPortCalls: 0; approvalConsumptions: 0 }>;
}>;

export function createMessageVersionService(deps: Readonly<{
  repository: MessageRepository;
  reader: OutreachArtifactReader;
  packages: Pick<OutreachPackageService, "projectApproval">;
  now: () => number;
  approvalTtlMs?: number;
}>) {
  if (!isRecord(deps) || !hasOnlyKeys(deps, ["repository", "reader", "packages", "now"], ["approvalTtlMs"])) throw new TypeError("invalid_message_service_dependencies");
  const { repository, reader, packages, now } = deps;
  if (!isRecord(repository) || !isRecord(reader) || !isRecord(packages) || typeof packages.projectApproval !== "function" || typeof now !== "function") {
    throw new TypeError("invalid_message_service_dependencies");
  }
  const ttl = validTtl(deps.approvalTtlMs ?? DEFAULT_PACKAGE_APPROVAL_TTL_MS);
  const clock = () => {
    const value = now();
    if (!Number.isSafeInteger(value) || value <= 0) throw new RangeError("invalid_message_service_clock");
    return value;
  };

  const createFromDraft = async (draft: unknown, configurationId: unknown, idempotencyKey: unknown): Promise<MessageVersionCreated | ArtifactRefusal> => {
    if (typeof idempotencyKey !== "string" || !/^[a-z0-9][a-z0-9_.:-]{2,127}$/iu.test(idempotencyKey)) return refused("invalid_idempotency_key");
    const packageVersionId = isRecord(draft) ? draft.packageVersionId : undefined;
    const packageVersion = typeof packageVersionId === "string" ? await reader.readPackageVersion(packageVersionId) : null;
    if (!packageVersion) return refused("package_version_unavailable");
    if (isRecord(draft) && draft.packageId !== packageVersion.packageId) return refused("package_mismatch");
    // The Profile Effective Configuration is bound transitively through the exact package version.
    if (configurationId !== packageVersion.configurationId) return refused("configuration_mismatch");
    let canonical: CanonicalMessageVersion;
    try { canonical = canonicalMessageVersion(draft, packageVersion.artifactDigest); } catch { return refused("invalid_message_input"); }
    const prior = await reader.readCommand(idempotencyKey);
    if (prior && prior.commandKind !== "message_version.create") return refused("idempotency_conflict");
    const digest = await messageVersionDigest(canonical);
    let result: OutreachWriteResult;
    try {
      result = await repository.createMessageVersion({
        messageId: canonical.messageId, packageId: canonical.packageId, packageVersionId: canonical.packageVersionId,
        version: canonical.version, expectedVersion: canonical.version - 1, snapshot: canonical.snapshot,
        intendedSendAt: canonical.intendedSendAt, timezone: canonical.timezone,
        unsubscribeTokenDigest: canonical.unsubscribeTokenDigest, bindings: canonical.bindings, idempotencyKey,
      });
    } catch (error) {
      return mapRepositoryError(error, reader, idempotencyKey);
    }
    if (result.digest !== digest) throw new Error("outreach_message_digest_invariant");
    return Object.freeze({ kind: "created" as const, id: result.id, digest: result.digest, version: canonical.version, replayed: result.replayed });
  };

  const reviseVersion = async (input: Readonly<{ previousVersionId: string; changes: unknown; idempotencyKey: string }>): Promise<MessageVersionCreated | ArtifactRefusal> => {
    if (!isRecord(input) || !hasOnlyKeys(input, ["previousVersionId", "changes", "idempotencyKey"])) return refused("invalid_message_input");
    let changes: Record<string, unknown>;
    try { changes = snapshotArtifactInput(input.changes); } catch { return refused("invalid_message_input"); }
    if (Object.keys(changes).some((key) => key === "messageId" || key === "packageId" || key === "version")) return refused("message_identity_immutable");
    if (!hasOnlyKeys(changes, [], MESSAGE_REVISABLE_FIELDS) || (changes.snapshot !== undefined && !isRecord(changes.snapshot))) return refused("invalid_message_input");
    const previous = await reader.readMessageVersion(String(input.previousVersionId));
    if (!previous) return refused("message_version_unavailable");
    if ((await reader.latestMessageVersion(previous.messageId)) !== previous.version) return refused("stale_base_version");
    const merged: Record<string, unknown> = {
      ...draftOf(previous),
      ...changes,
      snapshot: { ...(previous.snapshot as Record<string, unknown>), ...(changes.snapshot as Record<string, unknown> | undefined) },
    };
    const packageVersion = await reader.readPackageVersion(String(merged.packageVersionId));
    if (!packageVersion) return refused("package_version_unavailable");
    try {
      const same = canonicalMessageVersion({ ...merged, version: previous.version }, packageVersion.artifactDigest);
      if (await messageVersionDigest(same) === previous.artifactDigest) return refused("unchanged_message");
    } catch { return refused("invalid_message_input"); }
    // Each version carries its own opaque unsubscribe token (unique per version in D1).
    if (merged.unsubscribeTokenDigest === previous.unsubscribeTokenDigest) return refused("unsubscribe_token_reused");
    return createFromDraft({ ...merged, version: previous.version + 1 }, packageVersion.configurationId, input.idempotencyKey);
  };

  return Object.freeze({
    /** Create an immutable Message Version for an exact Package Version. */
    async createVersion(input: Readonly<{ draft: unknown; configurationId: string; idempotencyKey: string }>): Promise<MessageVersionCreated | ArtifactRefusal> {
      if (!isRecord(input) || !hasOnlyKeys(input, ["draft", "configurationId", "idempotencyKey"])) return refused("invalid_message_input");
      return createFromDraft(input.draft, input.configurationId, input.idempotencyKey);
    },

    /** Version-only edit of any canonical field. */
    reviseVersion,

    /**
     * A reschedule is a canonical edit: new version, new digest, new approval
     * required. The new version needs a fresh opaque unsubscribe token digest.
     */
    async reschedule(input: Readonly<{ previousVersionId: string; intendedSendAt: number | null; timezone: string; unsubscribeTokenDigest: string; idempotencyKey: string }>): Promise<MessageVersionCreated | ArtifactRefusal> {
      if (!isRecord(input) || !hasOnlyKeys(input, ["previousVersionId", "intendedSendAt", "timezone", "unsubscribeTokenDigest", "idempotencyKey"])) return refused("invalid_message_input");
      const previous = await reader.readMessageVersion(String(input.previousVersionId));
      if (previous && previous.intendedSendAt === input.intendedSendAt && previous.timezone === input.timezone) return refused("unchanged_schedule");
      return reviseVersion({
        previousVersionId: input.previousVersionId,
        changes: { intendedSendAt: input.intendedSendAt, timezone: input.timezone, unsubscribeTokenDigest: input.unsubscribeTokenDigest },
        idempotencyKey: input.idempotencyKey,
      });
    },

    /**
     * Approve exactly one reviewed Message Version digest. Requires a current
     * Package approval (rechecked through the package service's injected
     * eligibility port) and an acknowledgement-bearing recipient authority for
     * this exact version. Creates no outbox item and invokes no MailPort.
     */
    async approve(input: Readonly<{
      messageVersionId: string; reviewedDigest: string; packageApprovalId: string; acknowledgementDigest: string;
      currentDependencies: readonly OutreachBinding[]; contactEvidence: ContactEvidence; idempotencyKey: string;
    }>): Promise<MessageApproved | ArtifactRefusal> {
      if (!isRecord(input) || !hasOnlyKeys(input, ["messageVersionId", "reviewedDigest", "packageApprovalId", "acknowledgementDigest", "currentDependencies", "contactEvidence", "idempotencyKey"])) {
        return refused("invalid_message_approval_input");
      }
      const { messageVersionId, reviewedDigest, packageApprovalId, acknowledgementDigest, idempotencyKey } = input;
      if (
        typeof idempotencyKey !== "string" || !/^[a-z0-9][a-z0-9_.:-]{2,127}$/iu.test(idempotencyKey)
        || typeof reviewedDigest !== "string" || !/^[a-f0-9]{64}$/u.test(reviewedDigest)
        || typeof acknowledgementDigest !== "string" || !/^[a-f0-9]{64}$/u.test(acknowledgementDigest)
      ) return refused("invalid_message_approval_input");
      const prior = await reader.readCommand(idempotencyKey);
      if (prior) {
        const existing = prior.commandKind === "message.approve" ? await reader.readMessageApproval(prior.resultId) : null;
        if (!existing || existing.messageVersionId !== messageVersionId || existing.artifactDigest !== reviewedDigest || existing.packageApprovalId !== packageApprovalId) {
          return refused("idempotency_conflict");
        }
        return approvedMessage(existing, true);
      }
      const message = await reader.readMessageVersion(String(messageVersionId));
      if (!message) return refused("message_version_unavailable");
      const at = clock();
      const reasons: string[] = [];
      if (message.artifactDigest !== reviewedDigest) reasons.push("reviewed_digest_mismatch");
      if ((await reader.latestMessageVersion(message.messageId)) !== message.version) reasons.push("superseded_by_newer_version");
      const packageApproval = await reader.readPackageApproval(String(packageApprovalId));
      if (!packageApproval) return refused(...reasons, "package_approval_unavailable");
      if (packageApproval.packageVersionId !== message.packageVersionId) reasons.push("package_approval_mismatch");
      const projection = await packages.projectApproval({
        packageApprovalId: packageApproval.id,
        currentDependencies: input.currentDependencies,
        contactEvidence: input.contactEvidence,
      });
      if (!projection.crmEligible) reasons.push("package_approval_not_current", ...projection.reasonCodes);
      const authority = await reader.readRecipientAuthority({ messageVersionId: message.id, packageApprovalId: packageApproval.id, acknowledgementDigest });
      if (!authority) reasons.push("acknowledgement_missing");
      else {
        if (authority.validUntil <= at) reasons.push("acknowledgement_expired");
        if (authority.unsubscribeStatus !== "working" || authority.unsubscribeValidUntil === null || authority.unsubscribeValidUntil <= at) reasons.push("unsubscribe_path_not_working");
      }
      if (reasons.length > 0 || !authority) return refused(...reasons);
      // Independently expiring, but never beyond the package approval or the acknowledged authority.
      const expiresAt = Math.min(at + ttl, packageApproval.expiresAt, authority.validUntil, authority.unsubscribeValidUntil ?? 0);
      if (expiresAt <= at) return refused("approval_window_closed");
      let result: OutreachWriteResult;
      try {
        result = await repository.approveMessageVersion({
          messageVersionId: message.id, packageApprovalId: packageApproval.id, expectedVersion: message.version,
          acknowledgementDigest, expiresAt, idempotencyKey,
        });
      } catch (error) {
        return mapRepositoryError(error, reader, idempotencyKey);
      }
      return approvedMessage({
        id: result.id, messageVersionId: message.id, packageApprovalId: packageApproval.id,
        artifactDigest: message.artifactDigest, approvalDigest: result.digest, expiresAt,
      }, result.replayed);
    },
  });
}

/** Production composition: package authority rechecks through the blocked Phase 5 gate. */
export function composeMessageVersionService(database: D1Database, scope: OutreachRepositoryScope, options: Readonly<{ approvalTtlMs?: number }> = {}) {
  if (!isRecord(options) || !hasOnlyKeys(options, [], ["approvalTtlMs"])) throw new TypeError("invalid_message_composition_options");
  return createMessageVersionService({
    repository: createD1OutreachRepository(database, scope),
    reader: createD1OutreachArtifactReader(database, scope),
    packages: composeOutreachPackageService(database, scope),
    now: scope.now ?? Date.now,
    ...(options.approvalTtlMs === undefined ? {} : { approvalTtlMs: options.approvalTtlMs }),
  });
}

function approvedMessage(approval: MessageApprovalRecord, replayed: boolean): MessageApproved {
  return Object.freeze({
    kind: "approved" as const,
    approvalId: approval.id,
    approvalDigest: approval.approvalDigest,
    messageVersionId: approval.messageVersionId,
    artifactDigest: approval.artifactDigest,
    packageApprovalId: approval.packageApprovalId,
    expiresAt: approval.expiresAt,
    replayed,
    authority: "exact_message_only" as const,
    effects: Object.freeze({ outboxItems: 0 as const, mailPortCalls: 0 as const, approvalConsumptions: 0 as const }),
  });
}

function draftOf(record: MessageVersionRecord): Record<string, unknown> {
  return {
    messageId: record.messageId, packageId: record.packageId, packageVersionId: record.packageVersionId,
    version: record.version, snapshot: record.snapshot, intendedSendAt: record.intendedSendAt,
    timezone: record.timezone, unsubscribeTokenDigest: record.unsubscribeTokenDigest,
  };
}

function mailbox(value: unknown, label: string): string {
  if (typeof value !== "string") throw inputError(label);
  const normalized = value.trim().toLowerCase();
  if (normalized.length < 3 || normalized.length > 320 || !MAILBOX.test(normalized)) throw inputError(label);
  return normalized;
}

function mailboxSet(value: unknown, min: number, label: string): readonly string[] {
  if (!Array.isArray(value) || value.length < min || value.length > 32) throw inputError(label);
  const normalized = value.map((item) => mailbox(item, label));
  if (new Set(normalized).size !== normalized.length) throw inputError("duplicate_recipient");
  return Object.freeze(normalized.sort());
}

function headerText(value: unknown, min: number, max: number, label: string): string {
  const text = boundedText(value, min, max, label);
  if (HEADER_BREAK.test(text)) throw inputError(`${label}_line_break`);
  return text;
}

function links(value: unknown): readonly string[] {
  if (!Array.isArray(value) || value.length > 64) throw inputError("links");
  // Order is meaningful and preserved.
  return Object.freeze(value.map((item) => {
    if (typeof item !== "string" || item.length > 2_048) throw inputError("link");
    let url: URL;
    try { url = new URL(item); } catch { throw inputError("link"); }
    if (url.protocol !== "https:" || url.username !== "" || url.password !== "") throw inputError("link_scheme");
    return url.href;
  }));
}

function attachments(value: unknown): OutreachMessageSnapshot["attachments"] {
  if (!Array.isArray(value) || value.length > 16) throw inputError("attachments");
  const items = value.map((item) => {
    if (!isRecord(item)) throw inputError("attachment");
    requireExactKeys(item, ["id", "name", "mediaType", "digest"], "attachment");
    requireId(item.id, "attachment_id");
    requireDigest(item.digest, "attachment_digest");
    const mediaType = typeof item.mediaType === "string" ? item.mediaType.toLowerCase() : "";
    if (!MEDIA_TYPE.test(mediaType)) throw inputError("attachment_media_type");
    return Object.freeze({ id: item.id, name: headerText(item.name, 1, 255, "attachment_name"), mediaType, digest: item.digest });
  });
  if (new Set(items.map((item) => item.id)).size !== items.length) throw inputError("duplicate_attachment");
  return Object.freeze(items.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)));
}

function canonicalTimezone(value: unknown): string {
  if (typeof value !== "string" || !TIMEZONE.test(value)) throw inputError("timezone");
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
  } catch {
    throw inputError("timezone");
  }
  return value;
}
