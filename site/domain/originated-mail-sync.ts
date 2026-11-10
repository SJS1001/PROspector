import { canonicalDigest } from "./enrichment-grant-issuance";
import { createOutreachStopRules } from "./outreach-stop-rules";
import {
  createOriginatedMessageReference,
  type MailPort,
  type OriginatedEventSyncRequest,
  type OriginatedMessageReference,
} from "./ports/mail";
import { emailDigest, normalizeExactEmail } from "./suppression";

/**
 * 06-06 Task 3: the adapter-to-domain seam for replies and bounces to
 * PROspector-originated mail.
 *
 * - Only an active, current (not rotated) Gmail sender connection can sync.
 * - The set of originated references is authenticated by the domain: each
 *   stored record must bind to an outbox item of that connection, to a lease
 *   generation that really existed, and to the connection subject pinned when
 *   it was recorded. The reference itself is recomputed from immutable D1
 *   rows with `createOriginatedMessageReference`, never taken from the store.
 * - Each returned event must reference one authenticated origin exactly and
 *   pass a strict allowlist with bounded fields. Anything else is denied
 *   without persistence or stop action.
 * - An accepted event is reduced to a classification and a source digest and
 *   handed to the existing `applyInboundStop`, which commits the durable stop
 *   (or opt-out tombstone) and the cancellation of matching pending or leased
 *   work in one D1 batch. Its unique source digest makes a duplicate sync a
 *   replay with no new effect.
 *
 * The seam only ever calls `syncOriginatedEvents`. It never imports a
 * mailbox, never sends, never reconciles, and exposes and persists no
 * subject, excerpt, sender, or provider identifier. In D1 nothing can be
 * sent yet (06-06 Task 2 is deferred), so production composition wires
 * `NO_ORIGINATED_REFERENCES` and the reject-only Gmail adapter.
 */

export type OriginatedReferenceRecord = Readonly<{
  outboxItemId: string;
  leaseGeneration: number;
  originatedMessageId: string;
  originatedThreadId: string;
  connectionSubjectDigest: string;
}>;

/** Where provider-assigned identifiers of originated mail are recorded. */
export type OriginatedReferenceStore = Readonly<{
  listOriginated(connectionId: string): Promise<readonly OriginatedReferenceRecord[]>;
}>;

/** Production wiring until a send path exists: there are no originated items. */
export const NO_ORIGINATED_REFERENCES: OriginatedReferenceStore = Object.freeze({
  async listOriginated(): Promise<readonly OriginatedReferenceRecord[]> {
    return Object.freeze([]);
  },
});

type Scope = Readonly<{ workspaceId: string; ownerSubject: string; now?: () => number }>;
type Ports = Readonly<{ mailPort: MailPort; originStore: OriginatedReferenceStore }>;
type Classification = "reply" | "bounce" | "opt_out" | "ambiguous";
type DeniedReason = "unexpected_fields" | "unrecognized_origin" | "oversized_field" | "invalid_time" | "invalid_sender" | `stop_${string}`;

type AuthenticatedOrigin = Readonly<{
  outboxItemId: string;
  recipientDigest: string;
  reference: OriginatedMessageReference;
}>;

type OriginRow = {
  outbox_item_id: string;
  send_key: string;
  company_id: string;
  message_version_id: string;
  message_digest: string;
  message_approval_id: string;
  message_approval_digest: string;
  package_version_id: string;
  package_digest: string;
  configuration_id: string;
  configuration_digest: string;
  recipient_address_digest: string;
};

export type OriginatedSyncAccepted = Readonly<{
  outboxItemId: string;
  classification: Classification;
  outcome: "stopped" | "paused_for_review";
  stopEventId: string | null;
  tombstoneId: string | null;
  replayed: boolean;
  cancelledOutboxItemIds: readonly string[];
  uncancelled: readonly Readonly<{ outboxItemId: string; reason: string }>[];
}>;

export type OriginatedSyncResult =
  | Readonly<{
      kind: "synced";
      observedThrough: number;
      accepted: readonly OriginatedSyncAccepted[];
      denied: readonly Readonly<{ index: number; reason: DeniedReason }>[];
      deniedOrigins: number;
      providerCalls: 0;
    }>
  | Readonly<{
      kind: "refused";
      reason: "invalid_request" | "current_authority_unavailable" | "connection_unavailable" | "origin_store_unavailable" | "sync_unavailable" | "sync_result_invalid";
      providerCalls: 0;
    }>;

const ID = /^[a-z0-9][a-z0-9_.:-]{2,127}$/iu;
const DIGEST = /^[a-f0-9]{64}$/u;
const MAX_ORIGINS = 64;
const MAX_EVENTS = 100;
const MAX_SUBJECT = 256;
const MAX_EXCERPT = 500;
const MAX_SENDER = 320;
const REFERENCE_KEYS = ["originatedMessageId", "originatedThreadId", "rfcMessageId", "marker"] as const;
const REPLY_KEYS = ["kind", "originated", "sender", "subject", "excerpt", "occurredAt"] as const;
const BOUNCE_KEYS = ["kind", "originated", "bounceClass", "subject", "excerpt", "occurredAt"] as const;
// Stopping is the safe direction: a reply from the recipient that asks to stop
// becomes an exact-address opt-out tombstone, never an approval of anything.
const OPT_OUT = /\b(?:unsubscribe|opt[\s-]?out|remove me|stop (?:emailing|contacting|sending)|do not (?:email|contact))\b/iu;

export function createOriginatedMailSync(database: D1Database, scopeValue: Scope, portsValue: Ports) {
  const scope = captureScope(scopeValue);
  const ports = plainRecord(portsValue, [], ["mailPort", "originStore"]);
  const mailPort = ports?.mailPort as MailPort | undefined;
  const originStore = ports?.originStore as OriginatedReferenceStore | undefined;
  if (!mailPort || typeof mailPort.syncOriginatedEvents !== "function") throw new TypeError("mail_port_required");
  if (!originStore || typeof originStore.listOriginated !== "function") throw new TypeError("origin_store_required");
  const stopRules = createOutreachStopRules(database, { workspaceId: scope.workspaceId, ownerSubject: scope.ownerSubject, now: scope.now });

  return Object.freeze({
    async syncConnection(inputValue: unknown): Promise<OriginatedSyncResult> {
      const input = plainRecord(inputValue, ["connectionId", "observedAfter", "observedThrough"]);
      const now = scope.now();
      if (!positive(now)) return refused("current_authority_unavailable");
      if (
        !input || !validId(input.connectionId) || !positive(input.observedThrough) || Number(input.observedThrough) > now
        || !(input.observedAfter === null || (positive(input.observedAfter) && Number(input.observedAfter) < Number(input.observedThrough)))
      ) return refused("invalid_request");
      const connectionId = input.connectionId as string;
      const observedAfter = input.observedAfter as number | null;
      const observedThrough = Number(input.observedThrough);
      if (!await admitted(database, scope)) return refused("current_authority_unavailable");

      const connection = await database.prepare(
        `SELECT connection.connection_subject_digest FROM outreach_sender_connections connection
         WHERE connection.id=? AND connection.workspace_id=? AND connection.provider='gmail'
           AND connection.status='active' AND connection.verified_at<=?
           AND NOT EXISTS (SELECT 1 FROM outreach_sender_connections later
             WHERE later.workspace_id=connection.workspace_id AND later.provider=connection.provider
               AND later.connection_subject_digest=connection.connection_subject_digest
               AND later.protected_reference_version>connection.protected_reference_version)
         LIMIT 1`,
      ).bind(connectionId, scope.workspaceId, now).first<{ connection_subject_digest: string }>();
      if (!connection || !validDigest(connection.connection_subject_digest)) return refused("connection_unavailable");

      let records: unknown;
      try {
        records = await originStore.listOriginated(connectionId);
      } catch {
        return refused("origin_store_unavailable");
      }
      if (!Array.isArray(records) || records.length > MAX_ORIGINS) return refused("origin_store_unavailable");
      const origins: AuthenticatedOrigin[] = [];
      let deniedOrigins = 0;
      for (const record of records) {
        const origin = await authenticateOrigin(database, scope, connectionId, connection.connection_subject_digest, record);
        if (!origin || origins.some((known) => known.reference.marker === origin.reference.marker)) deniedOrigins += 1;
        else origins.push(origin);
      }
      if (origins.length === 0) return synced(observedThrough, [], [], deniedOrigins);

      const request: OriginatedEventSyncRequest = Object.freeze({
        workspaceId: scope.workspaceId,
        connectionId,
        originated: Object.freeze(origins.map((origin) => origin.reference)),
        observedAfter,
        observedThrough,
      });
      let response: unknown;
      try {
        response = await mailPort.syncOriginatedEvents(request);
      } catch {
        return refused("sync_unavailable");
      }
      const result = plainRecord(response, ["events", "observedThrough"]);
      if (
        !result || !Array.isArray(result.events) || result.events.length > MAX_EVENTS
        || !positive(result.observedThrough) || Number(result.observedThrough) > observedThrough
        || (observedAfter !== null && Number(result.observedThrough) < observedAfter)
      ) return refused("sync_result_invalid");
      const events = [...result.events] as unknown[];
      const bounds = Object.freeze({ after: observedAfter ?? 0, through: Math.min(Number(result.observedThrough), now) });

      const accepted: OriginatedSyncAccepted[] = [];
      const denied: { index: number; reason: DeniedReason }[] = [];
      for (const [index, event] of events.entries()) {
        const admittedEvent = await admitEvent(event, origins, bounds);
        if ("reason" in admittedEvent) {
          denied.push(Object.freeze({ index, reason: admittedEvent.reason }));
          continue;
        }
        const stop = await stopRules.applyInboundStop({
          originatedOutboxItemId: admittedEvent.origin.outboxItemId,
          classification: admittedEvent.classification,
          sourceEventDigest: await sourceEventDigest(scope.workspaceId, connectionId, admittedEvent),
          observedAt: admittedEvent.occurredAt,
        }) as Record<string, unknown>;
        if (stop.kind !== "stopped" && stop.kind !== "paused_for_review") {
          denied.push(Object.freeze({ index, reason: `stop_${String(stop.reason ?? "refused")}` as DeniedReason }));
          continue;
        }
        accepted.push(Object.freeze({
          outboxItemId: admittedEvent.origin.outboxItemId,
          classification: admittedEvent.classification,
          outcome: stop.kind as "stopped" | "paused_for_review",
          stopEventId: typeof stop.stopEventId === "string" ? stop.stopEventId : null,
          tombstoneId: typeof stop.tombstoneId === "string" ? stop.tombstoneId : null,
          replayed: stop.replayed === true,
          cancelledOutboxItemIds: Object.freeze([...(stop.cancelledOutboxItemIds as readonly string[] ?? [])]),
          uncancelled: Object.freeze([...(stop.uncancelled as readonly Readonly<{ outboxItemId: string; reason: string }>[] ?? [])]),
        }));
      }
      return synced(Number(result.observedThrough), accepted, denied, deniedOrigins);
    },
  });
}

async function authenticateOrigin(
  database: D1Database,
  scope: Readonly<{ workspaceId: string; ownerSubject: string }>,
  connectionId: string,
  pinnedSubjectDigest: string,
  value: unknown,
): Promise<AuthenticatedOrigin | null> {
  const record = plainRecord(value, ["outboxItemId", "leaseGeneration", "originatedMessageId", "originatedThreadId", "connectionSubjectDigest"]);
  if (
    !record || !validId(record.outboxItemId) || !positive(record.leaseGeneration)
    || record.connectionSubjectDigest !== pinnedSubjectDigest
    || typeof record.originatedMessageId !== "string" || typeof record.originatedThreadId !== "string"
  ) return null;
  const row = await database.prepare(
    `SELECT item.id outbox_item_id,item.send_key,contact.company_id,mv.id message_version_id,mv.artifact_digest message_digest,
            ma.id message_approval_id,ma.approval_digest message_approval_digest,pv.id package_version_id,
            pv.artifact_digest package_digest,pv.configuration_id,pv.configuration_digest,rda.recipient_address_digest
     FROM outreach_outbox_items item
     JOIN outreach_message_approvals ma ON ma.id=item.message_approval_id AND ma.workspace_id=item.workspace_id
     JOIN outreach_message_versions mv ON mv.id=item.message_version_id AND mv.workspace_id=item.workspace_id AND mv.id=ma.message_version_id
     JOIN outreach_package_versions pv ON pv.id=mv.package_version_id AND pv.workspace_id=mv.workspace_id
     JOIN outreach_packages op ON op.id=pv.package_id AND op.workspace_id=pv.workspace_id
     JOIN contacts contact ON contact.id=op.contact_id AND contact.workspace_id=op.workspace_id
     JOIN outreach_recipient_dispatch_authorities rda ON rda.message_version_id=mv.id AND rda.workspace_id=mv.workspace_id
     JOIN workspaces workspace ON workspace.id=item.workspace_id AND workspace.owner_subject=?
     WHERE item.id=? AND item.workspace_id=? AND item.sender_connection_id=? AND ma.owner_subject=?
       AND EXISTS (SELECT 1 FROM outreach_outbox_events lease
         WHERE lease.workspace_id=item.workspace_id AND lease.outbox_item_id=item.id
           AND lease.state='leased' AND lease.lease_generation=?)
     LIMIT 1`,
  ).bind(scope.ownerSubject, record.outboxItemId, scope.workspaceId, connectionId, scope.ownerSubject, record.leaseGeneration).first<OriginRow>();
  if (!row || !validDigest(row.recipient_address_digest)) return null;
  try {
    const reference = await createOriginatedMessageReference({
      approvedMessage: {
        workspaceId: scope.workspaceId,
        companyId: row.company_id,
        messageVersionId: row.message_version_id,
        messageDigest: row.message_digest,
        messageApprovalId: row.message_approval_id,
        messageApprovalDigest: row.message_approval_digest,
        packageVersionId: row.package_version_id,
        packageDigest: row.package_digest,
        profileConfigurationId: row.configuration_id,
        profileConfigurationDigest: row.configuration_digest,
      },
      idempotency: { outboxItemId: row.outbox_item_id, sendKey: row.send_key, leaseGeneration: record.leaseGeneration, providerAttempt: 1 },
      originatedMessageId: record.originatedMessageId,
      originatedThreadId: record.originatedThreadId,
    });
    return Object.freeze({ outboxItemId: row.outbox_item_id, recipientDigest: row.recipient_address_digest, reference });
  } catch {
    return null;
  }
}

type AdmittedEvent = Readonly<{
  origin: AuthenticatedOrigin;
  kind: "reply" | "bounce";
  classification: Classification;
  occurredAt: number;
  bounceClass: "hard" | "soft" | null;
  senderDigest: string | null;
  subject: string;
  excerpt: string;
}>;

/** Strict allowlist. The order of checks fixes the reported denial reason. */
async function admitEvent(
  value: unknown,
  origins: readonly AuthenticatedOrigin[],
  bounds: Readonly<{ after: number; through: number }>,
): Promise<AdmittedEvent | Readonly<{ reason: DeniedReason }>> {
  const kind = value && typeof value === "object" ? (value as Record<string, unknown>).kind : undefined;
  const event = kind === "reply" ? plainRecord(value, REPLY_KEYS) : kind === "bounce" ? plainRecord(value, BOUNCE_KEYS) : null;
  if (!event) return deny("unexpected_fields");
  if (kind === "bounce" && event.bounceClass !== "hard" && event.bounceClass !== "soft") return deny("unexpected_fields");
  if (typeof event.subject !== "string" || typeof event.excerpt !== "string") return deny("unexpected_fields");
  const origin = matchOrigin(event.originated, origins);
  if (!origin) return deny("unrecognized_origin");
  const subject = event.subject.normalize("NFC");
  const excerpt = event.excerpt.normalize("NFC");
  if (subject.length > MAX_SUBJECT || excerpt.length > MAX_EXCERPT) return deny("oversized_field");
  if (!positive(event.occurredAt) || Number(event.occurredAt) <= bounds.after || Number(event.occurredAt) > bounds.through) return deny("invalid_time");
  const occurredAt = Number(event.occurredAt);

  if (kind === "bounce") {
    const bounceClass = event.bounceClass as "hard" | "soft";
    return Object.freeze({
      origin, kind, occurredAt, bounceClass, senderDigest: null, subject, excerpt,
      // A soft bounce is transient: pause matching work for owner review.
      classification: bounceClass === "hard" ? "bounce" as const : "ambiguous" as const,
    });
  }
  const sender = typeof event.sender === "string" && event.sender.length <= MAX_SENDER ? normalizeExactEmail(event.sender) : null;
  if (!sender) return deny("invalid_sender");
  const senderDigest = await emailDigest(sender);
  // A reply from anyone other than the original recipient is ambiguous.
  const classification: Classification = senderDigest !== origin.recipientDigest
    ? "ambiguous"
    : OPT_OUT.test(subject) || OPT_OUT.test(excerpt) ? "opt_out" : "reply";
  return Object.freeze({ origin, kind: "reply" as const, occurredAt, bounceClass: null, senderDigest, subject, excerpt, classification });
}

function matchOrigin(value: unknown, origins: readonly AuthenticatedOrigin[]) {
  const reference = plainRecord(value, REFERENCE_KEYS);
  if (!reference) return null;
  return origins.find((origin) => REFERENCE_KEYS.every((key) => origin.reference[key] === reference[key])) ?? null;
}

/** The connection/origin/event identity. Text enters only as digests. */
async function sourceEventDigest(workspaceId: string, connectionId: string, event: AdmittedEvent) {
  return canonicalDigest({
    schema: "outreach-originated-event/v1",
    workspaceId,
    connectionId,
    rfcMessageId: event.origin.reference.rfcMessageId,
    marker: event.origin.reference.marker,
    kind: event.kind,
    bounceClass: event.bounceClass,
    senderDigest: event.senderDigest,
    occurredAt: event.occurredAt,
    subjectDigest: await canonicalDigest({ schema: "outreach-originated-text/v1", value: event.subject }),
    excerptDigest: await canonicalDigest({ schema: "outreach-originated-text/v1", value: event.excerpt }),
  });
}

async function admitted(database: D1Database, scope: Readonly<{ workspaceId: string; ownerSubject: string }>) {
  return !!await database.prepare("SELECT 1 ok FROM workspaces WHERE id=? AND owner_subject=? LIMIT 1").bind(scope.workspaceId, scope.ownerSubject).first();
}

function synced(
  observedThrough: number,
  accepted: readonly OriginatedSyncAccepted[],
  denied: readonly Readonly<{ index: number; reason: DeniedReason }>[],
  deniedOrigins: number,
): OriginatedSyncResult {
  return Object.freeze({ kind: "synced", observedThrough, accepted: Object.freeze([...accepted]), denied: Object.freeze([...denied]), deniedOrigins, providerCalls: 0 });
}

function refused(reason: Extract<OriginatedSyncResult, { kind: "refused" }>["reason"]): OriginatedSyncResult {
  return Object.freeze({ kind: "refused", reason, providerCalls: 0 });
}

function deny(reason: DeniedReason) {
  return Object.freeze({ reason });
}

function captureScope(value: Scope) {
  const record = plainRecord(value, ["workspaceId", "ownerSubject"], ["now"]);
  if (!record || !validId(record.workspaceId) || !validId(record.ownerSubject) || (record.now !== undefined && typeof record.now !== "function")) {
    throw new TypeError("invalid_originated_sync_scope");
  }
  return Object.freeze({
    workspaceId: record.workspaceId as string,
    ownerSubject: record.ownerSubject as string,
    now: (record.now as (() => number) | undefined) ?? Date.now,
  });
}

function plainRecord(value: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return null;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  const allowed = new Set([...required, ...optional]);
  if (keys.some((key) => typeof key !== "string" || !allowed.has(key)) || required.some((key) => !Object.hasOwn(descriptors, key))) return null;
  const result: Record<string, unknown> = {};
  for (const key of keys as string[]) {
    const descriptor = descriptors[key];
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) return null;
    result[key] = descriptor.value;
  }
  return result;
}

function positive(value: unknown): value is number { return Number.isSafeInteger(value) && Number(value) > 0; }
function validId(value: unknown): value is string { return typeof value === "string" && ID.test(value); }
function validDigest(value: unknown): value is string { return typeof value === "string" && DIGEST.test(value); }
