import { canonicalDigest } from "./enrichment-grant-issuance";
import { createD1OutboxRepository } from "./outbox";
import {
  prepareInboundStopEvent,
  prepareSuppressionTombstone,
  type OutreachRepositoryScope,
  type RecordSuppressionInput,
} from "./outreach-repository";
import {
  emailDigest,
  normalizeExactEmail,
  subjectDigest,
  unsubscribeTokenDigest,
  type SuppressionSubject,
} from "./suppression";

/**
 * Ordered stop rules. Every durable stop (tombstone or stop event) and the
 * cancellation of applicable pending/leased outbox work commit in one D1
 * batch, with the durable stop first. Success is reported only after that
 * batch commits. No rule sends, resends, imports a mailbox, or approves a
 * follow-up; a later touch needs a new Message Version and approval.
 */

export const UNSUBSCRIBE_ACKNOWLEDGEMENT = "Your request has been received. If this link was valid, no further outreach will be sent to this address.";

type Scope = Readonly<{ workspaceId: string; ownerSubject: string; now?: () => number }>;
type Refused = Readonly<{ kind: "refused"; reason: string; providerCalls: 0 }>;
type Uncancelled = Readonly<{ outboxItemId: string; reason: string }>;

type LiveItem = Readonly<{
  outboxItemId: string;
  profileId: string;
  contactIdentityDigest: string;
  recipientDigests: readonly string[];
  unparseableRecipient: boolean;
}>;

type Matcher = (item: LiveItem) => boolean;

type DurableSubject = Readonly<{ kind: RecordSuppressionInput["subjectKind"]; digest: string; aliasDigests: readonly string[]; channel: RecordSuppressionInput["channel"] }>;

const ID = /^[a-z0-9][a-z0-9_.:-]{2,127}$/iu;
const DIGEST = /^[a-f0-9]{64}$/u;
const MAX_LIVE_ITEMS = 512;
const CANCEL_CHUNK = 64;
const INBOUND = ["reply", "bounce", "opt_out", "ambiguous"] as const;
const LIFECYCLE = { pause: "profile_paused", archive: "profile_archived", high_risk_drift: "high_risk_drift" } as const;

export function createOutreachStopRules(database: D1Database, scopeValue: Scope) {
  const scope = captureScope(scopeValue);
  const clock = scopeValue.now ?? Date.now;

  return Object.freeze({
    /** Owner suppression, explicit opt-out, or do_not_call, with cancellation. */
    async recordSuppressionStop(inputValue: unknown) {
      const input = exactRecord(inputValue, ["subject", "channel", "reason", "sourceEventDigest", "aliasDigests", "effectiveAt", "idempotencyKey"]);
      if (!input || !Array.isArray(input.aliasDigests) || !validId(input.idempotencyKey)) return refused("invalid_request");
      let subject;
      try {
        subject = await subjectDigest(input.subject as SuppressionSubject);
      } catch {
        return refused("invalid_request");
      }
      const now = clock();
      if (!positive(now)) return refused("current_authority_unavailable");
      if (!await admitted(database, scope)) return refused("current_authority_unavailable");
      const durable: DurableSubject = { kind: subject.kind, digest: subject.digest, aliasDigests: input.aliasDigests as string[], channel: input.channel as DurableSubject["channel"] };
      return commitSuppression(database, scope, now, {
        subjects: [durable],
        reason: input.reason as RecordSuppressionInput["reason"],
        sourceEventDigest: input.sourceEventDigest as string,
        effectiveAt: input.effectiveAt as number,
        idempotencyKey: () => input.idempotencyKey as string,
        matcher: await suppressionMatcher(durable),
        cancelReason: `suppression_${String(input.reason)}`,
      });
    },

    /**
     * Inbound classification for one PROspector-originated outbox item. Only
     * the classification and a source digest are accepted: no body, subject
     * or mailbox content.
     */
    async applyInboundStop(inputValue: unknown) {
      const input = exactRecord(inputValue, ["originatedOutboxItemId", "classification", "sourceEventDigest", "observedAt"]);
      if (
        !input || !validId(input.originatedOutboxItemId) || !INBOUND.includes(input.classification as typeof INBOUND[number])
        || !validDigest(input.sourceEventDigest) || !positive(input.observedAt)
      ) return refused("invalid_request");
      const now = clock();
      if (!positive(now) || Number(input.observedAt) > now) return refused("invalid_request");
      if (!await admitted(database, scope)) return refused("current_authority_unavailable");
      const origin = await database.prepare(
        `SELECT item.id outbox_item_id,ma.command_id approval_command_id,rda.recipient_address_digest,contact.identity_digest contact_identity_digest
         FROM outreach_outbox_items item
         JOIN outreach_message_approvals ma ON ma.id=item.message_approval_id AND ma.workspace_id=item.workspace_id
         JOIN outreach_recipient_dispatch_authorities rda ON rda.message_version_id=item.message_version_id AND rda.workspace_id=item.workspace_id
         JOIN contacts contact ON contact.id=rda.contact_id AND contact.workspace_id=item.workspace_id
         WHERE item.id=? AND item.workspace_id=? LIMIT 1`,
      ).bind(input.originatedOutboxItemId, scope.workspaceId).first<{
        outbox_item_id: string; approval_command_id: string; recipient_address_digest: string; contact_identity_digest: string;
      }>();
      if (!origin || !validDigest(origin.recipient_address_digest) || !validId(origin.approval_command_id)) return refused("unknown_origin");
      const classification = input.classification as typeof INBOUND[number];
      const recipient = origin.recipient_address_digest;
      const contact = origin.contact_identity_digest;
      const sameRecipient: Matcher = (item) => item.unparseableRecipient || item.recipientDigests.includes(recipient);
      const recipientOrContact: Matcher = (item) => sameRecipient(item) || item.contactIdentityDigest === contact;
      const sourceEventDigest = input.sourceEventDigest as string;
      const observedAt = Number(input.observedAt);

      if (classification === "opt_out") {
        const result = await commitSuppression(database, scope, now, {
          subjects: [{ kind: "exact_email", digest: recipient, aliasDigests: [], channel: "email" }],
          reason: "explicit_opt_out",
          sourceEventDigest,
          effectiveAt: observedAt,
          idempotencyKey: () => `optout:${sourceEventDigest.slice(0, 48)}`,
          matcher: recipientOrContact,
          cancelReason: "suppression_explicit_opt_out",
        });
        return result.kind === "suppressed" ? Object.freeze({ ...result, kind: "stopped" as const, classification }) : result;
      }

      if (classification === "ambiguous") {
        const cancellation = await planCancellation(database, scope, now, recipientOrContact, "ambiguous_reply_paused");
        if (cancellation.kind === "refused") return cancellation;
        if (cancellation.statements.length > 0) {
          try {
            await database.batch([...cancellation.statements]);
          } catch {
            return refused("write_failed");
          }
        }
        const outcome = await confirmCancellation(database, scope, cancellation);
        return Object.freeze({ kind: "paused_for_review" as const, classification, ...outcome, providerCalls: 0 as const });
      }

      const prior = await database.prepare(
        "SELECT id FROM outreach_stop_events WHERE workspace_id=? AND stop_kind=? AND source_event_digest=? LIMIT 1",
      ).bind(scope.workspaceId, classification, sourceEventDigest).first<{ id: string }>();
      let stop;
      try {
        stop = await prepareInboundStopEvent(database, scope, {
          stopKind: classification,
          subjectKind: "exact_email",
          subjectDigest: recipient,
          sourceEventDigest,
          reasonCode: `${classification}_received`,
          anchorCommandId: origin.approval_command_id,
          effectiveAt: observedAt,
        }, now);
      } catch {
        return refused("invalid_request");
      }
      const cancellation = await planCancellation(database, scope, now, classification === "bounce" ? sameRecipient : recipientOrContact, `${classification}_received`);
      if (cancellation.kind === "refused") return cancellation;
      try {
        await database.batch([stop.statement, ...cancellation.statements]);
      } catch {
        return refused("write_failed");
      }
      const stored = await database.prepare(
        "SELECT id FROM outreach_stop_events WHERE workspace_id=? AND stop_kind=? AND source_event_digest=? LIMIT 1",
      ).bind(scope.workspaceId, classification, sourceEventDigest).first<{ id: string }>();
      if (!stored) return refused("write_failed");
      const outcome = await confirmCancellation(database, scope, cancellation);
      return Object.freeze({ kind: "stopped" as const, classification, stopEventId: stored.id, replayed: !!prior, ...outcome, providerCalls: 0 as const });
    },

    /**
     * Pause, archive or high-risk drift cancels the Profile's pending work.
     * The lifecycle row itself stays the durable authority; enqueue and lease
     * already recheck it, so no permanent stop event is written.
     */
    async applyLifecycleStop(inputValue: unknown) {
      const input = exactRecord(inputValue, ["kind", "profileId", "sourceEventDigest"]);
      if (!input || !Object.hasOwn(LIFECYCLE, String(input.kind)) || !validId(input.profileId) || !validDigest(input.sourceEventDigest)) return refused("invalid_request");
      const now = clock();
      if (!positive(now)) return refused("current_authority_unavailable");
      if (!await admitted(database, scope)) return refused("current_authority_unavailable");
      const profile = await database.prepare("SELECT id FROM customer_profiles WHERE id=? AND workspace_id=? LIMIT 1").bind(input.profileId, scope.workspaceId).first();
      if (!profile) return refused("unknown_profile");
      const cancellation = await planCancellation(database, scope, now, (item) => item.profileId === input.profileId, LIFECYCLE[input.kind as keyof typeof LIFECYCLE]);
      if (cancellation.kind === "refused") return cancellation;
      if (cancellation.statements.length > 0) {
        try {
          await database.batch([...cancellation.statements]);
        } catch {
          return refused("write_failed");
        }
      }
      const outcome = await confirmCancellation(database, scope, cancellation);
      return Object.freeze({ kind: "stopped" as const, lifecycle: input.kind as keyof typeof LIFECYCLE, ...outcome, providerCalls: 0 as const });
    },
  });
}

/**
 * Public unsubscribe. The rate limiter is injected and consulted before any
 * read. Every non-limited outcome that is not a write failure returns the same
 * generic acknowledgement, so the response never reveals whether a token or a
 * contact exists. Success is returned only after the tombstone commits.
 */
export function createPublicUnsubscribe(
  database: D1Database,
  options: Readonly<{ limiter: Readonly<{ consume(key: string): Promise<boolean> | boolean }>; now?: () => number }>,
) {
  if (!options || typeof options.limiter?.consume !== "function") throw new TypeError("rate_limiter_required");
  const limiter = options.limiter;
  const clock = options.now ?? Date.now;
  const acknowledged = Object.freeze({ kind: "acknowledged" as const, message: UNSUBSCRIBE_ACKNOWLEDGEMENT, providerCalls: 0 as const });
  const unavailable = Object.freeze({ kind: "unavailable" as const, providerCalls: 0 as const });

  return Object.freeze({
    async unsubscribe(inputValue: unknown) {
      const input = exactRecord(inputValue, ["token", "clientKey"]);
      const clientKey = input && typeof input.clientKey === "string" && input.clientKey.length > 0 && input.clientKey.length <= 256 ? input.clientKey : "anonymous";
      let allowed: boolean;
      try {
        allowed = await limiter.consume(await canonicalDigest({ schema: "outreach-unsubscribe-rate/v1", clientKey }));
      } catch {
        return unavailable;
      }
      if (allowed !== true) return Object.freeze({ kind: "rate_limited" as const, providerCalls: 0 as const });
      if (!input) return acknowledged;
      let tokenDigest: string;
      try {
        tokenDigest = await unsubscribeTokenDigest(input.token);
      } catch {
        return acknowledged;
      }
      const now = clock();
      if (!positive(now)) return unavailable;
      const rows = await database.prepare(
        `SELECT mv.workspace_id,mv.snapshot_json,w.owner_subject,rda.unsubscribe_scope_kind,rda.unsubscribe_scope_digest
         FROM outreach_message_versions mv
         JOIN workspaces w ON w.id=mv.workspace_id
         LEFT JOIN outreach_recipient_dispatch_authorities rda ON rda.message_version_id=mv.id AND rda.workspace_id=mv.workspace_id
           AND rda.unsubscribe_token_digest=mv.unsubscribe_token_digest
         WHERE mv.unsubscribe_token_digest=? LIMIT 2`,
      ).bind(tokenDigest).all<{
        workspace_id: string; snapshot_json: string; owner_subject: string;
        unsubscribe_scope_kind: string | null; unsubscribe_scope_digest: string | null;
      }>();
      const matches = rows.results ?? [];
      if (matches.length !== 1) return acknowledged;
      const row = matches[0];
      if (!validId(row.workspace_id) || !validId(row.owner_subject)) return acknowledged;
      const scope = Object.freeze({ workspaceId: row.workspace_id, ownerSubject: row.owner_subject });
      const digests = row.unsubscribe_scope_kind === "exact_email" && validDigest(row.unsubscribe_scope_digest)
        ? [row.unsubscribe_scope_digest]
        : await snapshotRecipientDigests(row.snapshot_json, ["to"]);
      if (!digests || digests.length === 0) return acknowledged;
      const sourceEventDigest = await canonicalDigest({ schema: "outreach-unsubscribe-source/v1", tokenDigest });
      const subjects: DurableSubject[] = digests.map((digest) => ({ kind: "exact_email", digest, aliasDigests: [], channel: "email" }));
      const result = await commitSuppression(database, scope, now, {
        subjects,
        reason: "unsubscribe",
        sourceEventDigest,
        effectiveAt: now,
        idempotencyKey: (subject) => `unsub:${tokenDigest.slice(0, 32)}:${subject.digest.slice(0, 32)}`,
        matcher: (item) => item.unparseableRecipient || item.recipientDigests.some((digest) => digests.includes(digest)),
        cancelReason: "suppression_unsubscribe",
      });
      return result.kind === "suppressed" ? acknowledged : unavailable;
    },
  });
}

type SuppressionPlan = Readonly<{
  subjects: readonly DurableSubject[];
  reason: RecordSuppressionInput["reason"];
  sourceEventDigest: string;
  effectiveAt: number;
  idempotencyKey: (subject: DurableSubject) => string;
  matcher: Matcher;
  cancelReason: string;
}>;

/** Tombstones first, then fenced cancellations, in one batch. */
async function commitSuppression(database: D1Database, scope: OutreachRepositoryScope, now: number, plan: SuppressionPlan) {
  const statements: D1PreparedStatement[] = [];
  const tombstoneIds: string[] = [];
  let replayed = true;
  for (const subject of plan.subjects) {
    const existing = await existingTombstone(database, scope, subject);
    if (existing) {
      tombstoneIds.push(existing);
      continue;
    }
    replayed = false;
    try {
      const prepared = await prepareSuppressionTombstone(database, scope, {
        subjectKind: subject.kind,
        subjectDigest: subject.digest,
        channel: subject.channel,
        reason: plan.reason,
        sourceEventDigest: plan.sourceEventDigest,
        aliasDigests: [...subject.aliasDigests],
        effectiveAt: plan.effectiveAt,
        idempotencyKey: plan.idempotencyKey(subject),
      }, now);
      statements.push(...prepared.statements);
      tombstoneIds.push(prepared.tombstoneId);
    } catch {
      return refused("invalid_request");
    }
  }
  const cancellation = await planCancellation(database, scope, now, plan.matcher, plan.cancelReason.slice(0, 64));
  if (cancellation.kind === "refused") {
    // The tombstone never waits on cancellation planning.
    if (statements.length === 0) return cancellation;
  }
  const cancelStatements = cancellation.kind === "planned" ? cancellation.statements : [];
  if (statements.length + cancelStatements.length > 0) {
    try {
      await database.batch([...statements, ...cancelStatements]);
    } catch {
      // A concurrent exact replay may have committed the same tombstones.
    }
  }
  for (const subject of plan.subjects) {
    if (!await existingTombstone(database, scope, subject)) return refused("write_failed");
  }
  const outcome = cancellation.kind === "planned"
    ? await confirmCancellation(database, scope, cancellation)
    : { cancelledOutboxItemIds: Object.freeze([]) as readonly string[], uncancelled: Object.freeze([{ outboxItemId: "*", reason: cancellation.reason }]) as readonly Uncancelled[] };
  return Object.freeze({
    kind: "suppressed" as const,
    tombstoneId: tombstoneIds[0],
    tombstoneIds: Object.freeze(tombstoneIds),
    replayed,
    ...outcome,
    providerCalls: 0 as const,
  });
}

type CancellationPlan =
  | Readonly<{ kind: "planned"; statements: readonly D1PreparedStatement[]; targets: readonly Readonly<{ outboxItemId: string; eventId: string }>[]; skipped: readonly Uncancelled[] }>
  | Refused;

async function planCancellation(database: D1Database, scope: OutreachRepositoryScope, now: number, matcher: Matcher, reasonCode: string): Promise<CancellationPlan> {
  const live = await liveItems(database, scope);
  const ids = live.filter(matcher).map((item) => item.outboxItemId);
  const statements: D1PreparedStatement[] = [];
  const targets: { outboxItemId: string; eventId: string }[] = [];
  const skipped: Uncancelled[] = [];
  if (ids.length === 0) return Object.freeze({ kind: "planned", statements, targets, skipped });
  const outbox = createD1OutboxRepository(database, { workspaceId: scope.workspaceId, ownerSubject: scope.ownerSubject, now: () => now });
  for (let index = 0; index < ids.length; index += CANCEL_CHUNK) {
    const plan = await outbox.prepareCancellationBeforeDispatch({ outboxItemIds: ids.slice(index, index + CANCEL_CHUNK), reasonCode });
    if (plan.kind !== "planned") return refused(plan.reason);
    statements.push(...plan.statements);
    targets.push(...plan.targets.map((target) => ({ outboxItemId: target.outboxItemId, eventId: target.eventId })));
    skipped.push(...plan.skipped.map((skip) => Object.freeze({ outboxItemId: skip.outboxItemId, reason: skip.reason })));
  }
  return Object.freeze({ kind: "planned", statements: Object.freeze(statements), targets: Object.freeze(targets), skipped: Object.freeze(skipped) });
}

async function confirmCancellation(database: D1Database, scope: OutreachRepositoryScope, plan: Extract<CancellationPlan, { kind: "planned" }>) {
  const cancelled: string[] = [];
  const uncancelled: Uncancelled[] = [...plan.skipped];
  for (const target of plan.targets) {
    const row = await database.prepare(
      "SELECT 1 ok FROM outreach_outbox_events WHERE id=? AND workspace_id=? AND outbox_item_id=? AND state='cancelled' LIMIT 1",
    ).bind(target.eventId, scope.workspaceId, target.outboxItemId).first();
    if (row) cancelled.push(target.outboxItemId);
    else uncancelled.push(Object.freeze({ outboxItemId: target.outboxItemId, reason: "state_changed" }));
  }
  return { cancelledOutboxItemIds: Object.freeze(cancelled.sort()), uncancelled: Object.freeze(uncancelled) };
}

async function liveItems(database: D1Database, scope: OutreachRepositoryScope): Promise<LiveItem[]> {
  const rows = await database.prepare(
    `SELECT item.id outbox_item_id,mv.snapshot_json,package.profile_id,contact.identity_digest contact_identity_digest,
            rda.recipient_address_digest
     FROM outreach_outbox_items item
     JOIN outreach_outbox_events latest ON latest.workspace_id=item.workspace_id AND latest.outbox_item_id=item.id
       AND latest.revision=(SELECT max(event.revision) FROM outreach_outbox_events event
         WHERE event.workspace_id=item.workspace_id AND event.outbox_item_id=item.id)
     JOIN outreach_message_versions mv ON mv.id=item.message_version_id AND mv.workspace_id=item.workspace_id
     JOIN outreach_package_versions pv ON pv.id=mv.package_version_id AND pv.workspace_id=mv.workspace_id
     JOIN outreach_packages package ON package.id=pv.package_id AND package.workspace_id=pv.workspace_id
     JOIN contacts contact ON contact.id=package.contact_id AND contact.workspace_id=package.workspace_id
     LEFT JOIN outreach_recipient_dispatch_authorities rda ON rda.message_version_id=item.message_version_id
       AND rda.workspace_id=item.workspace_id
     WHERE item.workspace_id=? AND latest.state IN ('pending','leased')
     ORDER BY item.id LIMIT ?`,
  ).bind(scope.workspaceId, MAX_LIVE_ITEMS).all<{
    outbox_item_id: string; snapshot_json: string; profile_id: string; contact_identity_digest: string; recipient_address_digest: string | null;
  }>();
  const items: LiveItem[] = [];
  for (const row of rows.results ?? []) {
    const addresses = recipientAddresses(row.snapshot_json, ["to", "cc", "bcc"]);
    const recipientDigests = new Set<string>(validDigest(row.recipient_address_digest) ? [row.recipient_address_digest] : []);
    let unparseableRecipient = addresses === null;
    for (const address of addresses ?? []) {
      try {
        recipientDigests.add(await emailDigest(address));
      } catch {
        unparseableRecipient = true;
      }
    }
    items.push(Object.freeze({
      outboxItemId: row.outbox_item_id,
      profileId: row.profile_id,
      contactIdentityDigest: row.contact_identity_digest,
      recipientDigests: Object.freeze([...recipientDigests]),
      unparseableRecipient,
    }));
  }
  return items;
}

/**
 * Which live email work a suppression subject reaches. The rule is: never less
 * than what the outbox can no longer lease. Enqueue, lease and the 0015-0017
 * pre-call/attempt triggers treat every Company, Organization and
 * confirmed-domain tombstone (and its stop event) as workspace-wide, and do not
 * consult the channel for those kinds or for Contact. A narrower cancellation
 * would leave items `pending` that no lease can ever claim, because tombstones
 * are append-only. The whole-label subdomain reach of a confirmed domain
 * (owner decision D-6) is enforced by the resolver; the D1 rechecks cannot
 * resolve a domain digest, and narrowing them needs a migration (deferred).
 * Only an E.164 phone subject never reaches email work.
 */
async function suppressionMatcher(subject: DurableSubject): Promise<Matcher> {
  const reach = new Set([subject.digest, ...subject.aliasDigests]);
  switch (subject.kind) {
    case "company":
    case "organization":
    case "confirmed_email_domain":
      return () => true;
    case "contact":
      return (item) => reach.has(item.contactIdentityDigest);
    case "exact_email":
      return (item) => item.unparseableRecipient || item.recipientDigests.some((digest) => reach.has(digest));
    default:
      return () => false;
  }
}

async function snapshotRecipientDigests(snapshotJson: string, fields: readonly ("to" | "cc" | "bcc")[]) {
  const addresses = recipientAddresses(snapshotJson, fields);
  if (!addresses) return null;
  const digests: string[] = [];
  for (const address of addresses) digests.push(await emailDigest(address));
  return [...new Set(digests)];
}

function recipientAddresses(snapshotJson: string, fields: readonly ("to" | "cc" | "bcc")[]): string[] | null {
  try {
    const snapshot = JSON.parse(snapshotJson) as Record<string, unknown>;
    const addresses: string[] = [];
    for (const field of fields) {
      const list = snapshot[field];
      if (!Array.isArray(list)) return null;
      for (const value of list) {
        const normalized = normalizeExactEmail(value);
        if (!normalized) return null;
        addresses.push(normalized);
      }
    }
    return addresses;
  } catch {
    return null;
  }
}

async function existingTombstone(database: D1Database, scope: OutreachRepositoryScope, subject: DurableSubject) {
  const row = await database.prepare(
    `SELECT id FROM outreach_suppression_tombstones
     WHERE workspace_id=? AND subject_kind=? AND subject_digest=? AND (channel=? OR channel='all') LIMIT 1`,
  ).bind(scope.workspaceId, subject.kind, subject.digest, subject.channel).first<{ id: string }>();
  return row?.id ?? null;
}

async function admitted(database: D1Database, scope: OutreachRepositoryScope) {
  return !!await database.prepare("SELECT 1 ok FROM workspaces WHERE id=? AND owner_subject=? LIMIT 1").bind(scope.workspaceId, scope.ownerSubject).first();
}

function captureScope(value: Scope): OutreachRepositoryScope {
  const record = exactRecord(value, ["workspaceId", "ownerSubject"], ["now"]);
  if (!record || !validId(record.workspaceId) || !validId(record.ownerSubject) || (record.now !== undefined && typeof record.now !== "function")) {
    throw new TypeError("invalid_stop_rules_scope");
  }
  return Object.freeze({ workspaceId: record.workspaceId as string, ownerSubject: record.ownerSubject as string });
}

function exactRecord(value: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return null;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  const allowed = new Set([...required, ...optional]);
  if (keys.some((key) => typeof key !== "string" || !allowed.has(key)) || required.some((key) => !Object.hasOwn(descriptors, key))) return null;
  const result: Record<string, unknown> = {};
  for (const key of keys as string[]) {
    const descriptor = descriptors[key];
    if (!descriptor || !("value" in descriptor)) return null;
    result[key] = descriptor.value;
  }
  return result;
}

function refused(reason: string): Refused {
  return Object.freeze({ kind: "refused", reason, providerCalls: 0 });
}

function positive(value: unknown): value is number { return Number.isSafeInteger(value) && Number(value) > 0; }
function validId(value: unknown): value is string { return typeof value === "string" && ID.test(value); }
function validDigest(value: unknown): value is string { return typeof value === "string" && DIGEST.test(value); }
