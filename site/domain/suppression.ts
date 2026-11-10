import { normalizeBusinessEmail, normalizeBusinessPhone } from "./contact-evidence";
import { canonicalDigest } from "./enrichment-grant-issuance";
import {
  createD1OutreachRepository,
  prepareSuppressionTombstone,
  suppressionTombstoneDigest,
  type OutreachRepositoryScope,
  type RecordSuppressionInput,
} from "./outreach-repository";

/**
 * Company-wide suppression: one normalization library shared by every writer
 * and resolver. Tombstones are append-only; this module exposes no deletion,
 * exception or expiry path.
 */

export type SuppressionChannel = RecordSuppressionInput["channel"];
export type SuppressionSubjectKind = RecordSuppressionInput["subjectKind"];
export type SuppressionReason = RecordSuppressionInput["reason"];

export type SuppressionSubject =
  | Readonly<{ kind: "exact_email"; email: string }>
  | Readonly<{ kind: "confirmed_email_domain"; domain: string; ownerConfirmed: true }>
  | Readonly<{ kind: "e164_phone"; phone: string }>
  | Readonly<{ kind: "contact"; identityDigest: string }>
  | Readonly<{ kind: "organization"; identityDigest: string }>
  | Readonly<{ kind: "company"; workspaceId: string }>;

export type IdentityLineage = Readonly<{ identityDigest: string; aliasDigests: readonly string[] }>;

export type ResolutionInput = Readonly<{
  channel: SuppressionChannel;
  email?: string;
  phone?: string;
  contact?: IdentityLineage;
  organization?: IdentityLineage;
}>;

export type ResolvedSubject = Readonly<{ kind: SuppressionSubjectKind; digest: string; channel: SuppressionChannel }>;

/**
 * Which scopes block a subject. `complete: false` means the input could not be
 * resolved or at least one scope lookup failed; the result is then blocked and
 * `scopes` lists only the scopes that were positively found.
 */
export type BlockingScopes = Readonly<{
  blocked: boolean;
  scopes: readonly SuppressionSubjectKind[];
  complete: boolean;
  providerCalls: 0;
}>;

export class SuppressionInputError extends Error {
  constructor(reason: string) {
    super(`suppression_input:${reason}`);
    this.name = "SuppressionInputError";
  }
}

const DIGEST = /^[a-f0-9]{64}$/u;
const ID = /^[a-z0-9][a-z0-9_.:-]{2,127}$/iu;
const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;
const TOKEN = /^[A-Za-z0-9_-]{32,256}$/u;
const MAX_DOMAIN_LABELS = 8;
const MAX_ALIASES = 64;
const LOOKUP_CHUNK = 32;
const REASONS: readonly SuppressionReason[] = ["owner_request", "unsubscribe", "explicit_opt_out", "do_not_call", "identity_retention", "import_retention"];
const CHANNELS: readonly SuppressionChannel[] = ["email", "phone", "all"];
/** Report order for `blockingScopes`: widest scope first. */
const SCOPE_ORDER: readonly SuppressionSubjectKind[] = ["company", "organization", "contact", "exact_email", "confirmed_email_domain", "e164_phone"];

/** Exact email: NFC, trim, lowercase. No dot, plus-tag or provider folding. */
export function normalizeExactEmail(value: unknown): string | null {
  return normalizeBusinessEmail(value);
}

/**
 * The exact email with one DNS root dot removed from its domain, so that
 * `x@example.com.` and `x@example.com` are the same mailbox. Null when the
 * value is not an email or stripping the dot leaves no valid address.
 */
export function canonicalMailbox(value: unknown): string | null {
  const email = normalizeExactEmail(value);
  if (!email) return null;
  return email.endsWith(".") ? normalizeExactEmail(email.slice(0, -1)) : email;
}

/**
 * Every exact-email spelling one mailbox can be stored under: the address as
 * normalized, and its canonical form with and without the root dot. Writers keep
 * the business normalization (it matches the Phase 5 contact-point digest), so
 * the resolver checks all spellings and a root dot can never escape an exact block.
 */
function mailboxSpellings(normalizedEmail: string): string[] {
  const canonical = canonicalMailbox(normalizedEmail);
  return [...new Set(canonical ? [normalizedEmail, canonical, `${canonical}.`] : [normalizedEmail])];
}

/**
 * Digests of every spelling of one mailbox. An exact-email tombstone stores
 * the ones other than its subject digest as aliases, because the D1 SQL
 * rechecks (outbox enqueue/lease, the 0010 and 0015-0017 triggers, the
 * eligibility snapshot) match one contact-point digest against the subject
 * digest or the alias snapshot and never call the resolver.
 */
export async function mailboxSpellingDigests(value: unknown): Promise<string[]> {
  const email = normalizeExactEmail(value);
  if (!email) throw new SuppressionInputError("invalid_email");
  const digests: string[] = [];
  for (const spelling of mailboxSpellings(email)) digests.push(await emailDigest(spelling));
  return digests;
}

/** E.164 only. A number without an explicit country code is never guessed. */
export function normalizeE164Phone(value: unknown): string | null {
  return normalizeBusinessPhone(value);
}

/** Owner-confirmed domain: lowercase ASCII/punycode labels, at least two labels. */
export function normalizeConfirmedDomain(value: unknown): string | null {
  if (typeof value !== "string") return null;
  let candidate = value.normalize("NFC").trim().toLowerCase();
  if (candidate.endsWith(".")) candidate = candidate.slice(0, -1);
  if (candidate.length < 3 || candidate.length > 253 || /[^a-z0-9.\-\u0080-￿]/u.test(candidate)) return null;
  let ascii: string;
  try {
    ascii = new URL(`https://${candidate}/`).hostname;
  } catch {
    return null;
  }
  const labels = ascii.split(".");
  if (labels.length < 2 || labels.length > MAX_DOMAIN_LABELS || !labels.every((label) => LABEL.test(label))) return null;
  if (/^[0-9.]+$/u.test(ascii)) return null;
  return ascii;
}

/** Every whole-label suffix with two or more labels, most specific first. */
export function emailDomainSuffixes(email: unknown): string[] {
  const normalized = normalizeExactEmail(email);
  if (!normalized) throw new SuppressionInputError("invalid_email");
  const domain = normalizeConfirmedDomain(normalized.slice(normalized.lastIndexOf("@") + 1));
  if (!domain) throw new SuppressionInputError("invalid_email_domain");
  const labels = domain.split(".");
  return labels.slice(0, -1).map((_, index) => labels.slice(index).join("."));
}

/** True when a confirmed domain entry covers the address by whole labels. */
export function domainBlocksEmail(domain: unknown, email: unknown): boolean {
  const confirmed = normalizeConfirmedDomain(domain);
  if (!confirmed) return false;
  try {
    return emailDomainSuffixes(email).includes(confirmed);
  } catch {
    return false;
  }
}

export async function subjectDigest(subject: SuppressionSubject): Promise<Readonly<{ kind: SuppressionSubjectKind; digest: string }>> {
  const value = plainRecord(subject);
  if (!value || typeof value.kind !== "string") throw new SuppressionInputError("invalid_subject");
  switch (value.kind) {
    case "exact_email": {
      requireKeys(value, ["kind", "email"]);
      const email = normalizeExactEmail(value.email);
      if (!email) throw new SuppressionInputError("invalid_email");
      return Object.freeze({ kind: "exact_email", digest: await emailDigest(email) });
    }
    case "confirmed_email_domain": {
      if (value.ownerConfirmed !== true) throw new SuppressionInputError("owner_confirmation_required");
      requireKeys(value, ["kind", "domain", "ownerConfirmed"]);
      const domain = normalizeConfirmedDomain(value.domain);
      if (!domain) throw new SuppressionInputError("invalid_domain");
      return Object.freeze({ kind: "confirmed_email_domain", digest: await domainDigest(domain) });
    }
    case "e164_phone": {
      requireKeys(value, ["kind", "phone"]);
      const phone = normalizeE164Phone(value.phone);
      if (!phone) throw new SuppressionInputError("invalid_phone");
      return Object.freeze({ kind: "e164_phone", digest: await phoneDigest(phone) });
    }
    case "contact":
    case "organization": {
      requireKeys(value, ["kind", "identityDigest"]);
      if (!validDigest(value.identityDigest)) throw new SuppressionInputError("invalid_identity_digest");
      return Object.freeze({ kind: value.kind, digest: value.identityDigest });
    }
    case "company": {
      requireKeys(value, ["kind", "workspaceId"]);
      if (!validId(value.workspaceId)) throw new SuppressionInputError("invalid_company");
      return Object.freeze({ kind: "company", digest: await companyDigest(value.workspaceId) });
    }
    default:
      throw new SuppressionInputError("invalid_subject");
  }
}

/** The stored `contact-point/v1` digest, identical to Phase 5 contact points. */
export function emailDigest(normalizedEmail: string): Promise<string> {
  return canonicalDigest({ schema: "contact-point/v1", kind: "email", normalizedValue: normalizedEmail });
}

export function phoneDigest(normalizedPhone: string): Promise<string> {
  return canonicalDigest({ schema: "contact-point/v1", kind: "phone", normalizedValue: normalizedPhone });
}

export function domainDigest(normalizedDomain: string): Promise<string> {
  return canonicalDigest({ schema: "outreach-suppression-domain/v1", domain: normalizedDomain });
}

export function companyDigest(workspaceId: string): Promise<string> {
  return canonicalDigest({ schema: "outreach-suppression-company/v1", workspaceId });
}

/** One-way opaque token digest. The raw token is never stored. */
export async function unsubscribeTokenDigest(token: unknown): Promise<string> {
  if (typeof token !== "string" || !TOKEN.test(token)) throw new SuppressionInputError("invalid_unsubscribe_token");
  return canonicalDigest({ schema: "outreach-unsubscribe-token/v1", token });
}

/**
 * Every subject an action must check. An unparseable email or phone throws,
 * and callers treat that as blocked.
 */
export async function resolveSubjects(workspaceId: string, input: ResolutionInput): Promise<ResolvedSubject[]> {
  const value = plainRecord(input);
  if (!value || !CHANNELS.includes(value.channel as SuppressionChannel)) throw new SuppressionInputError("invalid_resolution");
  if (Object.keys(value).some((key) => !["channel", "email", "phone", "contact", "organization"].includes(key))) throw new SuppressionInputError("invalid_resolution");
  const channel = value.channel as SuppressionChannel;
  const subjects: ResolvedSubject[] = [{ kind: "company", digest: await companyDigest(workspaceId), channel }];
  for (const kind of ["organization", "contact"] as const) {
    if (value[kind] === undefined) continue;
    const lineage = validLineage(value[kind]);
    for (const digest of [lineage.identityDigest, ...lineage.aliasDigests]) subjects.push({ kind, digest, channel });
  }
  if (value.email !== undefined && channel !== "phone") {
    const email = normalizeExactEmail(value.email);
    if (!email) throw new SuppressionInputError("invalid_email");
    for (const spelling of mailboxSpellings(email)) {
      subjects.push({ kind: "exact_email", digest: await emailDigest(spelling), channel: "email" });
    }
    for (const domain of emailDomainSuffixes(email)) {
      subjects.push({ kind: "confirmed_email_domain", digest: await domainDigest(domain), channel: "email" });
    }
  }
  if (value.phone !== undefined && channel !== "email") {
    const phone = normalizeE164Phone(value.phone);
    if (!phone) throw new SuppressionInputError("invalid_phone");
    subjects.push({ kind: "e164_phone", digest: await phoneDigest(phone), channel: "phone" });
  }
  return subjects;
}

/** Merge: the surviving identity carries every merged identity and alias. */
export function mergeLineage(records: readonly IdentityLineage[], survivorDigest: string): IdentityLineage {
  if (!Array.isArray(records) || records.length < 2 || !validDigest(survivorDigest)) throw new SuppressionInputError("invalid_merge");
  const lineages = records.map(validLineage);
  if (!lineages.some((lineage) => lineage.identityDigest === survivorDigest)) throw new SuppressionInputError("invalid_merge");
  const aliases = new Set<string>();
  for (const lineage of lineages) {
    aliases.add(lineage.identityDigest);
    for (const alias of lineage.aliasDigests) aliases.add(alias);
  }
  aliases.delete(survivorDigest);
  return freezeLineage(survivorDigest, [...aliases]);
}

/** Split: every child inherits the parent's identity and full alias history. */
export function splitLineage(parent: IdentityLineage, childDigests: readonly string[]): IdentityLineage[] {
  const source = validLineage(parent);
  if (!Array.isArray(childDigests) || childDigests.length < 2 || !childDigests.every(validDigest) || new Set(childDigests).size !== childDigests.length) {
    throw new SuppressionInputError("invalid_split");
  }
  const inherited = [source.identityDigest, ...source.aliasDigests];
  return childDigests.map((child) => freezeLineage(child, inherited.filter((digest) => digest !== child)));
}

export type SuppressionLedgerEntry = Readonly<{
  subjectKind: SuppressionSubjectKind;
  subjectDigest: string;
  channel: SuppressionChannel;
  reason: SuppressionReason;
  sourceEventDigest: string;
  aliasDigests: readonly string[];
  effectiveAt: number;
  tombstoneDigest: string;
}>;

export type SuppressionLedger = Readonly<{
  schema: "outreach-suppression-ledger/v1";
  entries: readonly SuppressionLedgerEntry[];
  ledgerDigest: string;
}>;

/**
 * Owner-scoped resolver and lineage commands. Resolution reads authoritative
 * tombstones at action time; cached eligibility is never consulted.
 */
export function createSuppressionResolver(database: D1Database, scope: OutreachRepositoryScope) {
  const repository = createD1OutreachRepository(database, scope);
  const clock = scope.now ?? Date.now;

  const isBlocked = async (input: ResolutionInput): Promise<Readonly<{ blocked: boolean; providerCalls: 0 }>> => {
    let subjects: ResolvedSubject[];
    try {
      subjects = await resolveSubjects(scope.workspaceId, input);
    } catch {
      return Object.freeze({ blocked: true, providerCalls: 0 });
    }
    // Tombstones are append-only, so chunked reads can only miss a tombstone
    // committed after the read began; any lookup failure fails closed.
    try {
      for (let index = 0; index < subjects.length; index += LOOKUP_CHUNK) {
        const chunk = subjects.slice(index, index + LOOKUP_CHUNK).map((subject) => ({ kind: subject.kind, digest: subject.digest, channel: subject.channel }));
        if (await repository.isSuppressed(chunk)) return Object.freeze({ blocked: true, providerCalls: 0 });
      }
    } catch {
      return Object.freeze({ blocked: true, providerCalls: 0 });
    }
    return Object.freeze({ blocked: false, providerCalls: 0 });
  };

  /**
   * Same subjects and same fail-closed rule as `isBlocked`, checked one scope
   * at a time so the caller learns every scope that blocks. The tombstone SQL
   * only follows aliases within one subject kind, so the union of per-kind
   * answers equals the `isBlocked` answer.
   */
  const blockingScopes = async (input: ResolutionInput): Promise<BlockingScopes> => {
    let subjects: ResolvedSubject[];
    try {
      subjects = await resolveSubjects(scope.workspaceId, input);
    } catch {
      return Object.freeze({ blocked: true, scopes: Object.freeze([]), complete: false, providerCalls: 0 });
    }
    const scopes: SuppressionSubjectKind[] = [];
    let complete = true;
    for (const kind of SCOPE_ORDER) {
      const group = subjects.filter((subject) => subject.kind === kind).map((subject) => ({ kind: subject.kind, digest: subject.digest, channel: subject.channel }));
      try {
        for (let index = 0; index < group.length; index += LOOKUP_CHUNK) {
          if (await repository.isSuppressed(group.slice(index, index + LOOKUP_CHUNK))) {
            scopes.push(kind);
            break;
          }
        }
      } catch {
        complete = false;
      }
    }
    return Object.freeze({ blocked: !complete || scopes.length > 0, scopes: Object.freeze(scopes), complete, providerCalls: 0 });
  };

  return Object.freeze({
    isBlocked,
    blockingScopes,

    /** Import never clears a tombstone; it only reports which rows are blocked. */
    async screenImport(rows: readonly Readonly<{ email?: string; phone?: string; contact?: IdentityLineage }>[]) {
      if (!Array.isArray(rows) || rows.length < 1 || rows.length > 500) throw new SuppressionInputError("invalid_import");
      const results = [];
      for (const [index, row] of rows.entries()) {
        const value = plainRecord(row);
        if (!value) {
          results.push(Object.freeze({ index, blocked: true }));
          continue;
        }
        const channel: SuppressionChannel = value.email !== undefined && value.phone !== undefined ? "all" : value.phone !== undefined ? "phone" : "email";
        results.push(Object.freeze({ index, blocked: (await isBlocked({ channel, ...value } as ResolutionInput)).blocked }));
      }
      return Object.freeze(results);
    },

    /** Digest-only export: no raw email, phone or name leaves the workspace. */
    async exportLedger(): Promise<SuppressionLedger> {
      const rows = await database.prepare(
        `SELECT s.subject_kind,s.subject_digest,s.channel,s.reason,s.source_event_digest,s.alias_snapshot_json,s.effective_at,s.tombstone_digest
         FROM outreach_suppression_tombstones s
         JOIN workspaces w ON w.id=s.workspace_id AND w.owner_subject=?
         WHERE s.workspace_id=? ORDER BY s.tombstone_digest`,
      ).bind(scope.ownerSubject, scope.workspaceId).all<{
        subject_kind: SuppressionSubjectKind; subject_digest: string; channel: SuppressionChannel; reason: SuppressionReason;
        source_event_digest: string; alias_snapshot_json: string; effective_at: number; tombstone_digest: string;
      }>();
      const entries = (rows.results ?? []).map((row) => Object.freeze({
        subjectKind: row.subject_kind,
        subjectDigest: row.subject_digest,
        channel: row.channel,
        reason: row.reason,
        sourceEventDigest: row.source_event_digest,
        aliasDigests: Object.freeze(JSON.parse(row.alias_snapshot_json) as string[]),
        effectiveAt: Number(row.effective_at),
        tombstoneDigest: row.tombstone_digest,
      }));
      return Object.freeze({ schema: "outreach-suppression-ledger/v1", entries: Object.freeze(entries), ledgerDigest: await ledgerDigest(entries) });
    },

    /**
     * Restore appends every ledger tombstone with its original fields, so the
     * tombstone digest round-trips. It never removes or replaces one. A ledger
     * whose digests do not verify writes nothing.
     */
    async restoreLedger(ledgerValue: SuppressionLedger) {
      const ledger = plainRecord(ledgerValue);
      if (!ledger || ledger.schema !== "outreach-suppression-ledger/v1" || !Array.isArray(ledger.entries) || ledger.entries.length > 10_000) {
        return refused("ledger_integrity");
      }
      const entries = ledger.entries as SuppressionLedgerEntry[];
      if (!validDigest(ledger.ledgerDigest) || ledger.ledgerDigest !== await ledgerDigest(entries)) return refused("ledger_integrity");
      const now = clock();
      if (!Number.isSafeInteger(now) || now <= 0) return refused("current_authority_unavailable");
      for (const entry of entries) {
        if (!validLedgerEntry(entry, now) || entry.tombstoneDigest !== await suppressionTombstoneDigest(entry)) return refused("ledger_integrity");
      }
      let written = 0;
      let alreadyPresent = 0;
      for (const entry of entries) {
        const existing = await database.prepare(
          `SELECT tombstone_digest FROM outreach_suppression_tombstones
           WHERE workspace_id=? AND subject_kind=? AND subject_digest=? AND channel=? LIMIT 1`,
        ).bind(scope.workspaceId, entry.subjectKind, entry.subjectDigest, entry.channel).first<{ tombstone_digest: string }>();
        if (existing) {
          alreadyPresent += 1;
          continue;
        }
        let prepared;
        try {
          prepared = await prepareSuppressionTombstone(database, scope, {
            subjectKind: entry.subjectKind,
            subjectDigest: entry.subjectDigest,
            channel: entry.channel,
            reason: entry.reason,
            sourceEventDigest: entry.sourceEventDigest,
            aliasDigests: [...entry.aliasDigests],
            effectiveAt: entry.effectiveAt,
            idempotencyKey: `restore:${entry.tombstoneDigest.slice(0, 48)}`,
          }, now);
        } catch {
          return Object.freeze({ kind: "refused" as const, reason: "current_authority_unavailable" as const, written, alreadyPresent, providerCalls: 0 as const });
        }
        try {
          await database.batch([...prepared.statements]);
          written += 1;
        } catch {
          const raced = await database.prepare(
            "SELECT 1 ok FROM outreach_suppression_tombstones WHERE workspace_id=? AND subject_kind=? AND subject_digest=? AND channel=? LIMIT 1",
          ).bind(scope.workspaceId, entry.subjectKind, entry.subjectDigest, entry.channel).first();
          if (!raced) return Object.freeze({ kind: "refused" as const, reason: "write_failed" as const, written, alreadyPresent, providerCalls: 0 as const });
          alreadyPresent += 1;
        }
      }
      return Object.freeze({ kind: "restored" as const, written, alreadyPresent, providerCalls: 0 as const });
    },
  });
}

async function ledgerDigest(entries: readonly SuppressionLedgerEntry[]) {
  return canonicalDigest({ schema: "outreach-suppression-ledger/v1", tombstoneDigests: entries.map((entry) => entry?.tombstoneDigest ?? null) });
}

function validLedgerEntry(value: unknown, now: number): value is SuppressionLedgerEntry {
  const entry = plainRecord(value);
  if (!entry) return false;
  const keys = ["subjectKind", "subjectDigest", "channel", "reason", "sourceEventDigest", "aliasDigests", "effectiveAt", "tombstoneDigest"];
  return Object.keys(entry).length === keys.length && keys.every((key) => Object.hasOwn(entry, key))
    && ["exact_email", "confirmed_email_domain", "e164_phone", "contact", "organization", "company"].includes(String(entry.subjectKind))
    && CHANNELS.includes(entry.channel as SuppressionChannel) && REASONS.includes(entry.reason as SuppressionReason)
    && validDigest(entry.subjectDigest) && validDigest(entry.sourceEventDigest) && validDigest(entry.tombstoneDigest)
    && Array.isArray(entry.aliasDigests) && entry.aliasDigests.length <= MAX_ALIASES && entry.aliasDigests.every(validDigest)
    && Number.isSafeInteger(entry.effectiveAt) && Number(entry.effectiveAt) > 0 && Number(entry.effectiveAt) <= now;
}

function refused(reason: "ledger_integrity" | "current_authority_unavailable") {
  return Object.freeze({ kind: "refused" as const, reason, providerCalls: 0 as const });
}

function validLineage(value: unknown): IdentityLineage {
  const lineage = plainRecord(value);
  if (
    !lineage || Object.keys(lineage).sort().join(",") !== "aliasDigests,identityDigest"
    || !validDigest(lineage.identityDigest) || !Array.isArray(lineage.aliasDigests)
    || lineage.aliasDigests.length > MAX_ALIASES || !lineage.aliasDigests.every(validDigest)
  ) throw new SuppressionInputError("invalid_lineage");
  return freezeLineage(lineage.identityDigest, lineage.aliasDigests as string[]);
}

function freezeLineage(identityDigest: string, aliases: readonly string[]): IdentityLineage {
  const aliasDigests = [...new Set(aliases)].filter((alias) => alias !== identityDigest).sort();
  if (aliasDigests.length > MAX_ALIASES) throw new SuppressionInputError("lineage_too_large");
  return Object.freeze({ identityDigest, aliasDigests: Object.freeze(aliasDigests) });
}

function requireKeys(value: Record<string, unknown>, keys: readonly string[]) {
  if (Object.keys(value).sort().join(",") !== [...keys].sort().join(",")) throw new SuppressionInputError("invalid_subject");
}

function plainRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return null;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const result: Record<string, unknown> = {};
  for (const key of Reflect.ownKeys(descriptors)) {
    const descriptor = descriptors[key as string];
    if (typeof key !== "string" || !descriptor || !("value" in descriptor)) return null;
    result[key] = descriptor.value;
  }
  return result;
}

function validDigest(value: unknown): value is string { return typeof value === "string" && DIGEST.test(value); }
function validId(value: unknown): value is string { return typeof value === "string" && ID.test(value); }
