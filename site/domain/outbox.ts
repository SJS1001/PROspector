import { canonicalDigest } from "./enrichment-grant-issuance";

type Scope = Readonly<{ workspaceId: string; ownerSubject: string; now?: () => number }>;
type EnqueueInput = Readonly<{ messageApprovalId: string; senderConnectionId: string }>;
type OutboxRow = {
  id: string;
  send_key: string;
  dispatch_key: string;
  message_approval_id: string;
  sender_connection_id: string;
};
type ApprovalRow = { approval_digest: string; artifact_digest: string; snapshot_json: string };

export type EnqueueResult =
  | Readonly<{
      kind: "queued";
      outboxItemId: string;
      sendKey: string;
      dispatchKey: string;
      replayed: boolean;
      providerCalls: 0;
    }>
  | Readonly<{
      kind: "blocked";
      reason: "invalid_request" | "current_authority_unavailable";
      providerCalls: 0;
    }>;

/**
 * Provider-neutral enqueue boundary. It can atomically consume an exact
 * approval and append Pending authority, but exposes no lease/dispatch method
 * and has no MailPort dependency.
 */
export function createD1OutboxRepository(database: D1Database, scopeValue: Scope) {
  const capturedScope = exactDataRecord(scopeValue, ["workspaceId", "ownerSubject"], ["now"]);
  if (
    !capturedScope
    || !id(capturedScope.workspaceId)
    || !id(capturedScope.ownerSubject)
    || (capturedScope.now !== undefined && typeof capturedScope.now !== "function")
  ) throw new TypeError("invalid_outbox_scope");
  const scope = Object.freeze({
    workspaceId: capturedScope.workspaceId,
    ownerSubject: capturedScope.ownerSubject,
    now: capturedScope.now ?? Date.now,
  });

  return Object.freeze({
    async enqueueApprovedMessage(inputValue: EnqueueInput | unknown): Promise<EnqueueResult> {
      const input = exactDataRecord(inputValue, ["messageApprovalId", "senderConnectionId"]);
      if (!input || !id(input.messageApprovalId) || !id(input.senderConnectionId)) return blocked("invalid_request");
      const now = scope.now();
      if (!Number.isSafeInteger(now) || now <= 0) return blocked("current_authority_unavailable");

      const approval = await database.prepare(
        `SELECT ma.approval_digest,ma.artifact_digest,mv.snapshot_json
         FROM outreach_message_approvals ma
         JOIN outreach_message_versions mv ON mv.id=ma.message_version_id AND mv.workspace_id=ma.workspace_id
         WHERE ma.id=? AND ma.workspace_id=? AND ma.owner_subject=? LIMIT 1`,
      ).bind(input.messageApprovalId, scope.workspaceId, scope.ownerSubject).first<ApprovalRow>();
      const sender = approval && senderAddress(approval.snapshot_json);
      if (!approval || !digest(approval.approval_digest) || !digest(approval.artifact_digest) || !sender) {
        return blocked("current_authority_unavailable");
      }

      const senderAddressDigest = await canonicalDigest({ schema: "outreach-sender-address/v1", address: sender });
      const sendKey = await canonicalDigest({
        schema: "outreach-send-key/v1",
        workspaceId: scope.workspaceId,
        messageApprovalId: input.messageApprovalId,
        approvalDigest: approval.approval_digest,
      });
      const dispatchKey = await canonicalDigest({
        schema: "outreach-dispatch-key/v1",
        sendKey,
        senderConnectionId: input.senderConnectionId,
      });
      const rfcMessageIdDigest = await canonicalDigest({ schema: "outreach-rfc-message-id/v1", dispatchKey });
      const markerDigest = await canonicalDigest({
        schema: "outreach-origin-marker/v1",
        dispatchKey,
        artifactDigest: approval.artifact_digest,
      });
      const consumptionId = `omac-${sendKey}`;
      const outboxItemId = `ooi-${sendKey}`;
      const existing = await readOutbox(database, scope.workspaceId, input.messageApprovalId);
      if (existing) {
        const replay = exactResult(existing, input.senderConnectionId, sendKey, dispatchKey, true);
        return replay.kind === "queued" && await hasPending(database, scope.workspaceId, existing.id)
          ? replay
          : blocked("current_authority_unavailable");
      }

      const eventDigest = await canonicalDigest({
        schema: "outreach-outbox-event/v1",
        outboxItemId,
        revision: 1,
        state: "pending",
        leaseGeneration: 0,
        reasonCode: "approved_message_queued",
        createdAt: now,
      });
      let committed = false;
      try {
        await database.batch([
          database.prepare(
            `INSERT INTO outreach_message_approval_consumptions
              (id,workspace_id,message_approval_id,send_key,approval_digest,fence_generation,consumed_at)
             SELECT ?,ma.workspace_id,ma.id,?,ma.approval_digest,1,?
             FROM outreach_message_approvals ma
             JOIN outreach_message_versions mv ON mv.id=ma.message_version_id AND mv.workspace_id=ma.workspace_id AND mv.artifact_digest=ma.artifact_digest
             JOIN outreach_package_approvals pa ON pa.id=ma.package_approval_id AND pa.workspace_id=ma.workspace_id
             JOIN outreach_package_versions pv ON pv.id=mv.package_version_id AND pv.workspace_id=mv.workspace_id AND pv.artifact_digest=pa.artifact_digest
             JOIN outreach_packages op ON op.id=pv.package_id AND op.workspace_id=pv.workspace_id
             JOIN profile_prospects prospect ON prospect.id=op.prospect_id AND prospect.workspace_id=op.workspace_id
             JOIN customer_profiles profile ON profile.id=op.profile_id AND profile.workspace_id=op.workspace_id
             JOIN market_plays play ON play.id=profile.play_id AND play.workspace_id=profile.workspace_id
             JOIN products product ON product.id=play.product_id AND product.workspace_id=play.workspace_id
             JOIN companies company ON company.id=product.company_id AND company.workspace_id=product.workspace_id
             JOIN contacts contact ON contact.id=op.contact_id AND contact.workspace_id=op.workspace_id AND contact.company_id=company.id
             JOIN typed_configurations cfg ON cfg.id=pv.configuration_id AND cfg.workspace_id=pv.workspace_id
             JOIN contact_eligibility_snapshots ces ON ces.id=pv.contact_eligibility_snapshot_id AND ces.workspace_id=pv.workspace_id
             JOIN outreach_sender_connections connection ON connection.id=? AND connection.workspace_id=ma.workspace_id
             JOIN workspaces workspace ON workspace.id=ma.workspace_id AND workspace.owner_subject=ma.owner_subject
             WHERE ma.id=? AND ma.workspace_id=? AND ma.owner_subject=? AND ma.expires_at>? AND pa.expires_at>?
               AND connection.status='active' AND connection.provider='gmail' AND connection.sender_address_digest=? AND connection.verified_at<=?
               AND NOT EXISTS (SELECT 1 FROM outreach_sender_connections later WHERE later.workspace_id=connection.workspace_id AND later.provider=connection.provider AND later.connection_subject_digest=connection.connection_subject_digest AND later.protected_reference_version>connection.protected_reference_version)
               AND prospect.state='approved' AND prospect.active=1 AND prospect.revision=pv.prospect_revision
               AND profile.lifecycle='ready' AND play.lifecycle='active' AND product.lifecycle='ready' AND company.status='active'
               AND cfg.active=1 AND cfg.digest=pv.configuration_digest AND cfg.revision=pv.configuration_revision
               AND ces.state='ContactReady' AND ces.eligible=1 AND ces.configuration_digest=cfg.digest
               AND ces.configuration_revision=cfg.revision AND ces.prospect_revision=prospect.revision
               AND json_array_length(ces.preserved_suppression_refs_json)=0
               AND NOT EXISTS (SELECT 1 FROM outreach_message_versions later WHERE later.message_id=mv.message_id AND later.version>mv.version)
               AND NOT EXISTS (SELECT 1 FROM outreach_package_versions later WHERE later.package_id=pv.package_id AND later.version>pv.version)
               AND NOT EXISTS (SELECT 1 FROM contact_eligibility_snapshots later WHERE later.workspace_id=ces.workspace_id AND later.prospect_id=ces.prospect_id AND later.contact_id=ces.contact_id AND later.id<>ces.id AND later.projected_at>=ces.projected_at)
               AND NOT EXISTS (SELECT 1 FROM knowledge_drifts drift WHERE drift.workspace_id=ma.workspace_id AND drift.status<>'resolved')
               AND NOT EXISTS (SELECT 1 FROM outreach_suppression_tombstones suppression WHERE suppression.workspace_id=ma.workspace_id AND suppression.effective_at<=?)
               AND NOT EXISTS (SELECT 1 FROM outreach_stop_events stop WHERE stop.workspace_id=ma.workspace_id AND stop.effective_at<=?)`,
          ).bind(
            consumptionId,
            sendKey,
            now,
            input.senderConnectionId,
            input.messageApprovalId,
            scope.workspaceId,
            scope.ownerSubject,
            now,
            now,
            senderAddressDigest,
            now,
            now,
            now,
          ),
          database.prepare(
            `INSERT INTO outreach_outbox_items
              (id,workspace_id,message_version_id,message_approval_id,approval_consumption_id,sender_connection_id,send_key,dispatch_key,rfc_message_id_digest,marker_digest,created_at)
             SELECT ?,ma.workspace_id,ma.message_version_id,ma.id,consumption.id,?,?,?,?,?,?
             FROM outreach_message_approval_consumptions consumption
             JOIN outreach_message_approvals ma ON ma.id=consumption.message_approval_id AND ma.workspace_id=consumption.workspace_id
             WHERE consumption.id=? AND consumption.workspace_id=? AND ma.id=?`,
          ).bind(
            outboxItemId,
            input.senderConnectionId,
            sendKey,
            dispatchKey,
            rfcMessageIdDigest,
            markerDigest,
            now,
            consumptionId,
            scope.workspaceId,
            input.messageApprovalId,
          ),
          database.prepare(
            `INSERT INTO outreach_outbox_events
              (id,workspace_id,outbox_item_id,revision,state,lease_generation,lease_holder_id,lease_expires_at,reason_code,event_digest,created_at)
             SELECT ?,workspace_id,id,1,'pending',0,NULL,NULL,'approved_message_queued',?,?
             FROM outreach_outbox_items WHERE id=? AND workspace_id=?`,
          ).bind(`ooe-${eventDigest}`, eventDigest, now, outboxItemId, scope.workspaceId),
        ]);
        committed = true;
      } catch {
        // A concurrent exact replay is resolved below. Every failed partial
        // batch is rolled back by D1/Miniflare transaction semantics.
      }

      const row = await readOutbox(database, scope.workspaceId, input.messageApprovalId);
      if (!row) return blocked("current_authority_unavailable");
      const result = exactResult(row, input.senderConnectionId, sendKey, dispatchKey, !committed);
      if (result.kind === "blocked") return result;
      return await hasPending(database, scope.workspaceId, row.id)
        ? result
        : blocked("current_authority_unavailable");
    },
  });
}

async function readOutbox(database: D1Database, workspaceId: string, approvalId: string) {
  return database.prepare(
    "SELECT id,send_key,dispatch_key,message_approval_id,sender_connection_id FROM outreach_outbox_items WHERE workspace_id=? AND message_approval_id=? LIMIT 1",
  ).bind(workspaceId, approvalId).first<OutboxRow>();
}

async function hasPending(database: D1Database, workspaceId: string, outboxItemId: string) {
  return !!await database.prepare(
    "SELECT 1 ok FROM outreach_outbox_events WHERE workspace_id=? AND outbox_item_id=? AND revision=1 AND state='pending' LIMIT 1",
  ).bind(workspaceId, outboxItemId).first();
}

function exactResult(
  row: OutboxRow,
  senderConnectionId: string,
  sendKey: string,
  dispatchKey: string,
  replayed: boolean,
): EnqueueResult {
  if (
    !id(row.id)
    || !id(row.message_approval_id)
    || row.send_key !== sendKey
    || row.dispatch_key !== dispatchKey
    || row.sender_connection_id !== senderConnectionId
  ) return blocked("current_authority_unavailable");
  return Object.freeze({
    kind: "queued",
    outboxItemId: row.id,
    sendKey,
    dispatchKey,
    replayed,
    providerCalls: 0 as const,
  });
}

function senderAddress(value: string) {
  try {
    const parsed = JSON.parse(value);
    const record = exactDataRecord(parsed, [
      "senderReference", "from", "replyTo", "to", "cc", "bcc", "subject",
      "textBody", "htmlBody", "links", "attachments", "threadReference",
      "replyToMessageReference",
    ]);
    if (!record || typeof record.from !== "string") return null;
    const normalized = record.from.normalize("NFC").trim().toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(normalized) && normalized.length <= 320 ? normalized : null;
  } catch {
    return null;
  }
}

function exactDataRecord(value: unknown, required: readonly string[], optional: readonly string[] = []) {
  try {
    if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const ownKeys = Reflect.ownKeys(descriptors);
    const allowed = new Set([...required, ...optional]);
    if (
      ownKeys.some((key) => typeof key !== "string" || !allowed.has(key))
      || required.some((key) => !Object.hasOwn(descriptors, key))
    ) return null;
    const result: Record<string, unknown> = {};
    for (const key of ownKeys as string[]) {
      const descriptor = descriptors[key];
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) return null;
      result[key] = descriptor.value;
    }
    return Object.freeze(result);
  } catch {
    return null;
  }
}

function blocked(reason: "invalid_request" | "current_authority_unavailable"): EnqueueResult {
  return Object.freeze({ kind: "blocked", reason, providerCalls: 0 });
}

function id(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9][a-z0-9_.:-]{2,127}$/iu.test(value);
}

function digest(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
}
