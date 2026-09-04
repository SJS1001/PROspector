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
type AuthorityExpiryRow = {
  message_expires_at: number;
  package_expires_at: number;
  recipient_authority_expires_at: number;
  unsubscribe_expires_at: number;
  sender_capability_expires_at: number;
  sender_address_expires_at: number;
};
type LatestEventRow = {
  revision: number;
  state: string;
  lease_generation: number;
  lease_holder_id: string | null;
  lease_expires_at: number | null;
};
type PreCallMaterialRow = {
  outbox_item_id: string;
  send_key: string;
  dispatch_key: string;
  approval_consumption_id: string;
  lease_event_id: string;
  lease_revision: number;
  lease_generation: number;
  lease_holder_id: string;
  lease_expires_at: number;
  message_version_id: string;
  message_artifact_digest: string;
  message_approval_id: string;
  message_approval_digest: string;
  message_approval_expires_at: number;
  package_version_id: string;
  package_artifact_digest: string;
  package_approval_id: string;
  package_approval_digest: string;
  package_approval_expires_at: number;
  prospect_id: string;
  prospect_revision: number;
  contact_id: string;
  contact_revision: number;
  configuration_id: string;
  configuration_digest: string;
  configuration_revision: number;
  contact_eligibility_snapshot_id: string;
  contact_eligibility_snapshot_digest: string;
  email_observation_id: string;
  observation_digest: string;
  observation_verified_at: number;
  observation_verification_class: string;
  basis_source_id: string;
  basis_source_digest: string;
  recipient_authority_id: string;
  recipient_authority_digest: string;
  recipient_authority_expires_at: number;
  unsubscribe_event_id: string;
  unsubscribe_revision: number;
  unsubscribe_event_digest: string;
  unsubscribe_expires_at: number;
  sender_connection_id: string;
  sender_connection_subject_digest: string;
  sender_connection_version: number;
  sender_capability_id: string;
  sender_capability_digest: string;
  sender_capability_expires_at: number;
  sender_verified_address_id: string;
  sender_address_digest: string;
  sender_address_verification_digest: string;
  sender_address_expires_at: number;
};
type PreCallReceiptRow = {
  id: string;
  outbox_item_id: string;
  lease_event_id: string;
  lease_revision: number;
  lease_generation: number;
  lease_holder_id: string;
  lease_expires_at: number;
  current_material_digest: string;
  receipt_digest: string;
  valid_until: number;
  provider_invocation_authorized: number;
  created_at: number;
};
type DispatchAttemptPreparationRow = {
  id: string;
  outbox_item_id: string;
  attempt_ordinal: number;
  send_key: string;
  dispatch_key: string;
  message_version_id: string;
  message_artifact_digest: string;
  sender_connection_id: string;
  pre_call_receipt_id: string;
  lease_event_id: string;
  lease_generation: number;
  lease_holder_id: string;
  lease_expires_at: number;
  preparation_digest: string;
  provider_invocation_authorized: number;
  provider_calls: number;
  prepared_at: number;
};
type DispatchPreparationEventRow = {
  id: string;
  preparation_id: string;
  revision: number;
  event_kind: "voided_before_invocation" | "reprepared_no_invocation";
  prior_event_id: string | null;
  prior_digest: string;
  pre_call_receipt_id: string;
  lease_event_id: string;
  lease_generation: number;
  lease_holder_id: string;
  lease_expires_at: number;
  reason_code: "lease_expired_no_invocation" | "fresh_receipt_reprepared_no_invocation";
  event_digest: string;
  provider_invocation_authorized: number;
  provider_calls: number;
  effective_at: number;
  created_at: number;
};

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

export type ClaimLeaseResult =
  | Readonly<{
      kind: "claimed";
      outboxItemId: string;
      holderId: string;
      leaseGeneration: number;
      expiresAt: number;
      replayed: boolean;
      providerInvocationAuthorized: false;
      providerCalls: 0;
    }>
  | Readonly<{
      kind: "blocked";
      reason: "invalid_request" | "current_authority_unavailable" | "lease_unavailable";
      providerInvocationAuthorized: false;
      providerCalls: 0;
    }>;

export type PreCallReceiptResult =
  | Readonly<{
      kind: "recorded";
      receiptId: string;
      receiptDigest: string;
      outboxItemId: string;
      leaseGeneration: number;
      validUntil: number;
      replayed: boolean;
      providerInvocationAuthorized: false;
      providerCalls: 0;
    }>
  | Readonly<{
      kind: "blocked";
      reason: "invalid_request" | "current_authority_unavailable" | "lease_unavailable";
      providerInvocationAuthorized: false;
      providerCalls: 0;
    }>;

export type DispatchAttemptPreparationResult =
  | Readonly<{
      kind: "prepared_no_invocation";
      preparationId: string;
      preparationDigest: string;
      preCallReceiptId: string;
      outboxItemId: string;
      leaseGeneration: number;
      validUntil: number;
      replayed: boolean;
      providerInvocationAuthorized: false;
      providerCalls: 0;
    }>
  | Readonly<{
      kind: "blocked";
      reason: "invalid_request" | "current_authority_unavailable" | "lease_unavailable" | "attempt_unavailable";
      providerInvocationAuthorized: false;
      providerCalls: 0;
    }>;

export type DispatchPreparationVoidResult =
  | Readonly<{
      kind: "voided_before_invocation";
      eventId: string;
      eventDigest: string;
      preparationId: string;
      outboxItemId: string;
      leaseGeneration: number;
      effectiveAt: number;
      replayed: boolean;
      providerInvocationAuthorized: false;
      providerCalls: 0;
    }>
  | DispatchPreparationLifecycleBlockedResult;

export type DispatchRepreparationResult =
  | Readonly<{
      kind: "reprepared_no_invocation";
      eventId: string;
      eventDigest: string;
      preparationId: string;
      preCallReceiptId: string;
      outboxItemId: string;
      leaseGeneration: number;
      validUntil: number;
      replayed: boolean;
      providerInvocationAuthorized: false;
      providerCalls: 0;
    }>
  | DispatchPreparationLifecycleBlockedResult;

type DispatchPreparationLifecycleBlockedResult = Readonly<{
  kind: "blocked";
  reason: "invalid_request" | "current_authority_unavailable" | "lease_unavailable" | "attempt_unavailable";
  providerInvocationAuthorized: false;
  providerCalls: 0;
}>;

const LEASE_DURATION_MS = 15_000;

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
               AND connection.status='active' AND connection.provider='gmail' AND connection.verified_at<=?
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
               AND NOT EXISTS (
                 SELECT 1 FROM outreach_suppression_tombstones suppression
                 WHERE suppression.workspace_id=ma.workspace_id AND suppression.effective_at<=? AND (
                   suppression.subject_kind IN ('company','organization','confirmed_email_domain')
                   OR (suppression.subject_kind='contact' AND (
                     suppression.subject_digest=contact.identity_digest
                     OR EXISTS (SELECT 1 FROM json_each(suppression.alias_snapshot_json) alias WHERE alias.value=contact.identity_digest)
                   ))
                   OR (suppression.subject_kind='exact_email' AND EXISTS (
                     SELECT 1 FROM outreach_artifact_bindings binding
                     JOIN contact_point_observations observation ON observation.id=binding.binding_id
                     WHERE binding.artifact_kind='package_version' AND binding.artifact_id=pv.id
                       AND binding.binding_kind='contact_observation' AND observation.kind='email'
                       AND (suppression.subject_digest=observation.contact_point_digest
                         OR EXISTS (SELECT 1 FROM json_each(suppression.alias_snapshot_json) alias WHERE alias.value=observation.contact_point_digest))
                   ))
                 )
               )
               AND NOT EXISTS (
                 SELECT 1 FROM outreach_stop_events stop
                 WHERE stop.workspace_id=ma.workspace_id AND stop.effective_at<=? AND (
                   stop.subject_kind IN ('company','organization','confirmed_email_domain')
                   OR (stop.subject_kind='contact' AND stop.subject_digest=contact.identity_digest)
                   OR EXISTS (
                     SELECT 1 FROM outreach_artifact_bindings binding
                     JOIN contact_point_observations observation ON observation.id=binding.binding_id
                     WHERE binding.artifact_kind='package_version' AND binding.artifact_id=pv.id
                       AND binding.binding_kind='contact_observation' AND observation.kind='email'
                       AND observation.contact_point_digest=stop.subject_digest
                   )
                 )
               )`,
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

    async claimDispatchLease(inputValue: unknown): Promise<ClaimLeaseResult> {
      const input = exactDataRecord(inputValue, ["outboxItemId", "holderId"]);
      if (!input || !id(input.outboxItemId) || !id(input.holderId)) return leaseBlocked("invalid_request");
      const now = scope.now();
      if (!Number.isSafeInteger(now) || now <= 0) return leaseBlocked("current_authority_unavailable");
      const current = await readLatestEvent(database, scope.workspaceId, input.outboxItemId);
      if (!current || !validLatestEvent(current)) return leaseBlocked("current_authority_unavailable");
      const preparation = await readDispatchAttemptPreparationForLease(
        database,
        scope.workspaceId,
        scope.ownerSubject,
        input.outboxItemId,
      );
      if (preparation) {
        const lifecycle = await verifyDispatchPreparationLifecycle(database, scope, preparation);
        const latestLifecycle = lifecycle?.at(-1);
        if (
          !latestLifecycle
          || latestLifecycle.event_kind !== "voided_before_invocation"
          || latestLifecycle.created_at > now
        ) {
          return leaseBlocked("lease_unavailable");
        }
      }
      const sameHolderReplay = (
        current.state === "leased"
        && current.lease_holder_id === input.holderId
        && current.lease_expires_at !== null
        && current.lease_expires_at > now
      );
      if (
        !sameHolderReplay
        &&
        current.state !== "pending"
        && current.state !== "failed_before_dispatch"
        && !(current.state === "leased" && current.lease_expires_at !== null && current.lease_expires_at <= now)
      ) {
        return leaseBlocked("lease_unavailable");
      }

      const authorityExpiry = await readAuthorityExpiry(database, scope.workspaceId, scope.ownerSubject, input.outboxItemId, now);
      if (
        !authorityExpiry
        || !Number.isSafeInteger(authorityExpiry.message_expires_at)
        || !Number.isSafeInteger(authorityExpiry.package_expires_at)
        || !Number.isSafeInteger(authorityExpiry.recipient_authority_expires_at)
        || !Number.isSafeInteger(authorityExpiry.unsubscribe_expires_at)
        || !Number.isSafeInteger(authorityExpiry.sender_capability_expires_at)
        || !Number.isSafeInteger(authorityExpiry.sender_address_expires_at)
        || authorityExpiry.message_expires_at <= now
        || authorityExpiry.package_expires_at <= now
        || authorityExpiry.recipient_authority_expires_at <= now
        || authorityExpiry.unsubscribe_expires_at <= now
        || authorityExpiry.sender_capability_expires_at <= now
        || authorityExpiry.sender_address_expires_at <= now
      ) return leaseBlocked("current_authority_unavailable");
      if (sameHolderReplay) {
        return claimed(input.outboxItemId, input.holderId, current.lease_generation, current.lease_expires_at!, true);
      }
      const revision = current.revision + 1;
      const generation = current.lease_generation + 1;
      const expiresAt = Math.min(
        now + LEASE_DURATION_MS,
        authorityExpiry.message_expires_at,
        authorityExpiry.package_expires_at,
        authorityExpiry.recipient_authority_expires_at,
        authorityExpiry.unsubscribe_expires_at,
        authorityExpiry.sender_capability_expires_at,
        authorityExpiry.sender_address_expires_at,
      );
      const eventDigest = await canonicalDigest({
        schema: "outreach-outbox-event/v1",
        outboxItemId: input.outboxItemId,
        revision,
        state: "leased",
        leaseGeneration: generation,
        holderId: input.holderId,
        expiresAt,
        reasonCode: "dispatch_lease_claimed",
        createdAt: now,
      });
      let committed = false;
      try {
        const inserted = await database.prepare(
          `INSERT INTO outreach_outbox_events
            (id,workspace_id,outbox_item_id,revision,state,lease_generation,lease_holder_id,lease_expires_at,reason_code,event_digest,created_at)
           SELECT ?,item.workspace_id,item.id,?,'leased',?,?,?,'dispatch_lease_claimed',?,?
           FROM outreach_outbox_items item
           JOIN outreach_message_approval_consumptions consumption ON consumption.id=item.approval_consumption_id AND consumption.workspace_id=item.workspace_id
           JOIN outreach_message_approvals ma ON ma.id=item.message_approval_id AND ma.workspace_id=item.workspace_id AND ma.approval_digest=consumption.approval_digest
           JOIN outreach_message_versions mv ON mv.id=item.message_version_id AND mv.workspace_id=item.workspace_id AND mv.id=ma.message_version_id
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
           JOIN outreach_sender_connections connection ON connection.id=item.sender_connection_id AND connection.workspace_id=item.workspace_id
           JOIN outreach_recipient_dispatch_authorities recipient_authority ON recipient_authority.message_version_id=mv.id AND recipient_authority.workspace_id=mv.workspace_id
             AND recipient_authority.message_artifact_digest=mv.artifact_digest AND recipient_authority.package_approval_id=pa.id
             AND recipient_authority.package_approval_digest=pa.approval_digest AND recipient_authority.acknowledgement_digest=ma.acknowledgement_digest
           JOIN contact_point_observations observation ON observation.id=recipient_authority.email_observation_id
             AND observation.workspace_id=recipient_authority.workspace_id AND observation.contact_id=recipient_authority.contact_id
           JOIN sources basis_source ON basis_source.id=recipient_authority.basis_source_id
             AND basis_source.workspace_id=recipient_authority.workspace_id AND basis_source.source_digest=recipient_authority.basis_source_digest
           JOIN outreach_unsubscribe_authority_events unsubscribe ON unsubscribe.recipient_authority_id=recipient_authority.id AND unsubscribe.workspace_id=recipient_authority.workspace_id
           JOIN outreach_sender_capability_snapshots sender_capability ON sender_capability.sender_connection_id=connection.id AND sender_capability.workspace_id=connection.workspace_id
             AND sender_capability.connection_subject_digest=connection.connection_subject_digest
           JOIN outreach_sender_verified_addresses sender_address ON sender_address.sender_capability_id=sender_capability.id AND sender_address.workspace_id=sender_capability.workspace_id
             AND sender_address.address_digest=recipient_authority.sender_address_digest
           JOIN outreach_outbox_events prior ON prior.outbox_item_id=item.id AND prior.workspace_id=item.workspace_id AND prior.revision=?
           JOIN workspaces workspace ON workspace.id=item.workspace_id AND workspace.owner_subject=?
           WHERE item.id=? AND item.workspace_id=? AND ma.owner_subject=? AND ma.expires_at>? AND pa.expires_at>?
             AND ma.expires_at>=? AND pa.expires_at>=?
             AND (mv.intended_send_at IS NULL OR mv.intended_send_at<=?)
             AND prior.id=(SELECT latest.id FROM outreach_outbox_events latest WHERE latest.outbox_item_id=item.id AND latest.workspace_id=item.workspace_id ORDER BY latest.revision DESC LIMIT 1)
             AND ((prior.state='pending' AND prior.lease_generation=0)
               OR prior.state='failed_before_dispatch'
               OR (prior.state='leased' AND prior.lease_expires_at<=?))
             AND connection.status='active' AND connection.provider='gmail'
             AND recipient_authority.valid_until>=? AND recipient_authority.owner_subject=?
             AND unsubscribe.id=(SELECT latest.id FROM outreach_unsubscribe_authority_events latest WHERE latest.recipient_authority_id=recipient_authority.id AND latest.workspace_id=recipient_authority.workspace_id ORDER BY latest.revision DESC LIMIT 1)
             AND unsubscribe.status='working' AND unsubscribe.valid_until>=?
             AND sender_capability.expires_at>=? AND sender_address.expires_at>=?
             AND json_array_length(sender_capability.granted_scopes_json)=2
             AND EXISTS (SELECT 1 FROM json_each(sender_capability.granted_scopes_json) scope WHERE scope.value='https://www.googleapis.com/auth/gmail.send')
             AND EXISTS (SELECT 1 FROM json_each(sender_capability.granted_scopes_json) scope WHERE scope.value='https://www.googleapis.com/auth/gmail.readonly')
             AND basis_source.status='available'
             AND EXISTS (SELECT 1 FROM outreach_artifact_bindings binding WHERE binding.workspace_id=pv.workspace_id
               AND binding.artifact_kind='package_version' AND binding.artifact_id=pv.id AND binding.binding_kind='source'
               AND binding.binding_id=basis_source.id AND binding.binding_digest=basis_source.source_digest)
             AND EXISTS (SELECT 1 FROM outreach_artifact_bindings binding WHERE binding.workspace_id=pv.workspace_id
               AND binding.artifact_kind='package_version' AND binding.artifact_id=pv.id AND binding.binding_kind='contact_observation'
               AND binding.binding_id=observation.id AND binding.binding_digest=observation.observation_digest)
             AND EXISTS (SELECT 1 FROM contact_evidence_assignments assignment
               JOIN contact_verification_receipts receipt ON receipt.id=observation.verification_receipt_id
                 AND receipt.workspace_id=observation.workspace_id AND receipt.observation_id=observation.id
                 AND receipt.receipt_digest IS NOT NULL AND receipt.attestation_key_id IS NOT NULL
               WHERE assignment.id=observation.assignment_id AND assignment.workspace_id=observation.workspace_id
                 AND assignment.prospect_id=op.prospect_id AND assignment.contact_id=op.contact_id
                 AND assignment.configuration_id=pv.configuration_id AND assignment.configuration_digest=pv.configuration_digest)
             AND ((observation.verification_class='mailbox_verified' AND observation.method='mailbox_verification'
                   AND observation.verified_at+2592000000>=?)
               OR (observation.verification_class='source_verified' AND observation.method='authoritative_source_reconfirmed'
                   AND observation.verified_at+7776000000>=?))
             AND NOT EXISTS (SELECT 1 FROM contact_point_observations later WHERE later.workspace_id=observation.workspace_id
               AND later.contact_id=observation.contact_id AND later.contact_point_digest=observation.contact_point_digest
               AND later.id<>observation.id AND later.observed_at>=observation.observed_at)
             AND NOT EXISTS (SELECT 1 FROM outreach_approval_revocations revoked WHERE revoked.workspace_id=item.workspace_id AND revoked.message_approval_id=ma.id AND revoked.effective_at<=?)
             AND NOT EXISTS (SELECT 1 FROM outreach_approval_revocations revoked WHERE revoked.workspace_id=item.workspace_id AND revoked.package_approval_id=pa.id AND revoked.effective_at<=?)
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
             AND NOT EXISTS (SELECT 1 FROM knowledge_drifts drift WHERE drift.workspace_id=item.workspace_id AND drift.status<>'resolved')
             AND NOT EXISTS (
               SELECT 1 FROM outreach_suppression_tombstones suppression
               WHERE suppression.workspace_id=item.workspace_id AND suppression.effective_at<=? AND (
                 suppression.subject_kind IN ('company','organization','confirmed_email_domain')
                 OR (suppression.subject_kind='contact' AND (
                   suppression.subject_digest=contact.identity_digest
                   OR EXISTS (SELECT 1 FROM json_each(suppression.alias_snapshot_json) alias WHERE alias.value=contact.identity_digest)
                 ))
                 OR (suppression.subject_kind='exact_email' AND EXISTS (
                   SELECT 1 FROM outreach_artifact_bindings binding
                   JOIN contact_point_observations observation ON observation.id=binding.binding_id
                   WHERE binding.artifact_kind='package_version' AND binding.artifact_id=pv.id
                     AND binding.binding_kind='contact_observation' AND observation.kind='email'
                     AND (suppression.subject_digest=observation.contact_point_digest
                       OR EXISTS (SELECT 1 FROM json_each(suppression.alias_snapshot_json) alias WHERE alias.value=observation.contact_point_digest))
                 ))
               )
             )
             AND NOT EXISTS (
               SELECT 1 FROM outreach_stop_events stop
               WHERE stop.workspace_id=item.workspace_id AND stop.effective_at<=? AND (
                 stop.subject_kind IN ('company','organization','confirmed_email_domain')
                 OR (stop.subject_kind='contact' AND stop.subject_digest=contact.identity_digest)
                 OR EXISTS (
                   SELECT 1 FROM outreach_artifact_bindings binding
                   JOIN contact_point_observations observation ON observation.id=binding.binding_id
                   WHERE binding.artifact_kind='package_version' AND binding.artifact_id=pv.id
                     AND binding.binding_kind='contact_observation' AND observation.kind='email'
                     AND observation.contact_point_digest=stop.subject_digest
                 )
               )
             )`,
        ).bind(
          `ooe-${eventDigest}`,
          revision,
          generation,
          input.holderId,
          expiresAt,
          eventDigest,
          now,
          current.revision,
          scope.ownerSubject,
          input.outboxItemId,
          scope.workspaceId,
          scope.ownerSubject,
          now,
          now,
          expiresAt,
          expiresAt,
          now,
          now,
          expiresAt,
          scope.ownerSubject,
          expiresAt,
          expiresAt,
          expiresAt,
          expiresAt,
          expiresAt,
          now,
          now,
          now,
          now,
        ).run();
        committed = Number(inserted.meta?.changes) === 1;
      } catch {
        // Resolve an exact concurrent claim below; conflicting or stale claims
        // remain unavailable and cannot advance the event chain.
      }
      const latest = await readLatestEvent(database, scope.workspaceId, input.outboxItemId);
      if (
        latest?.state === "leased"
        && latest.lease_generation === generation
        && latest.lease_holder_id === input.holderId
        && latest.lease_expires_at === expiresAt
      ) return claimed(input.outboxItemId, input.holderId, generation, expiresAt, !committed);
      return leaseBlocked("lease_unavailable");
    },

    async recordPreCallRecheckReceipt(inputValue: unknown): Promise<PreCallReceiptResult> {
      const input = exactDataRecord(inputValue, ["outboxItemId", "holderId", "leaseGeneration"]);
      if (
        !input
        || !id(input.outboxItemId)
        || !id(input.holderId)
        || !Number.isSafeInteger(input.leaseGeneration)
        || Number(input.leaseGeneration) <= 0
      ) return preCallBlocked("invalid_request");
      const leaseGeneration = Number(input.leaseGeneration);
      const now = scope.now();
      if (!Number.isSafeInteger(now) || now <= 0) return preCallBlocked("current_authority_unavailable");
      const existing = await readPreCallReceipt(
        database,
        scope.workspaceId,
        scope.ownerSubject,
        input.outboxItemId,
        leaseGeneration,
      );
      if (existing) return verifyPreCallReceipt(database, scope, existing, input.holderId, now, true);
      const material = await readPreCallMaterial(
        database,
        scope.workspaceId,
        scope.ownerSubject,
        input.outboxItemId,
        input.holderId,
        leaseGeneration,
      );
      if (!material || !validPreCallMaterial(material)) return preCallBlocked("lease_unavailable");
      const contactFreshUntil = material.observation_verified_at + (
        material.observation_verification_class === "mailbox_verified" ? 2_592_000_000 : 7_776_000_000
      );
      const validUntil = Math.min(
        material.lease_expires_at,
        material.message_approval_expires_at,
        material.package_approval_expires_at,
        material.recipient_authority_expires_at,
        material.unsubscribe_expires_at,
        material.sender_capability_expires_at,
        material.sender_address_expires_at,
        contactFreshUntil,
      );
      if (!Number.isSafeInteger(validUntil) || validUntil <= now) return preCallBlocked("current_authority_unavailable");
      const currentMaterialDigest = await preCallMaterialDigest(scope, material);
      const receiptDigest = await preCallReceiptDigest(scope, material, currentMaterialDigest, validUntil, now);
      const receiptId = `opcr-${receiptDigest}`;
      let committed = false;
      try {
        const inserted = await database.prepare(
          `INSERT INTO outreach_pre_call_recheck_receipts
            (id,workspace_id,owner_subject,outbox_item_id,lease_event_id,lease_revision,lease_generation,
             lease_holder_id,lease_expires_at,recipient_authority_id,unsubscribe_event_id,sender_capability_id,
             sender_verified_address_id,contact_eligibility_snapshot_id,current_material_digest,receipt_digest,
             valid_until,provider_invocation_authorized,created_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?)`,
        ).bind(
          receiptId,
          scope.workspaceId,
          scope.ownerSubject,
          input.outboxItemId,
          material.lease_event_id,
          material.lease_revision,
          leaseGeneration,
          input.holderId,
          material.lease_expires_at,
          material.recipient_authority_id,
          material.unsubscribe_event_id,
          material.sender_capability_id,
          material.sender_verified_address_id,
          material.contact_eligibility_snapshot_id,
          currentMaterialDigest,
          receiptDigest,
          validUntil,
          now,
        ).run();
        committed = Number(inserted.meta?.changes) === 1;
      } catch {
        // The trigger is the transaction-local current-authority fence. A
        // concurrent exact record is resolved below; every other failure is
        // intentionally indistinguishable from unavailable authority.
      }
      let stored: PreCallReceiptRow | null = null;
      for (let attempt = 0; attempt < 3 && !stored; attempt += 1) {
        stored = await readPreCallReceipt(
          database,
          scope.workspaceId,
          scope.ownerSubject,
          input.outboxItemId,
          leaseGeneration,
        );
      }
      if (!stored) return preCallBlocked("current_authority_unavailable");
      const result = await verifyPreCallReceipt(database, scope, stored, input.holderId, now, !committed);
      if (result.kind !== "recorded") return result;
      return !committed || (result.receiptId === receiptId && result.receiptDigest === receiptDigest)
        ? result
        : preCallBlocked("lease_unavailable");
    },

    async prepareDispatchAttempt(inputValue: unknown): Promise<DispatchAttemptPreparationResult> {
      const input = exactDataRecord(inputValue, ["outboxItemId", "preCallReceiptId", "holderId", "leaseGeneration"]);
      if (
        !input
        || !id(input.outboxItemId)
        || !id(input.preCallReceiptId)
        || !id(input.holderId)
        || !Number.isSafeInteger(input.leaseGeneration)
        || Number(input.leaseGeneration) <= 0
      ) return attemptBlocked("invalid_request");
      const leaseGeneration = Number(input.leaseGeneration);
      const now = scope.now();
      if (!Number.isSafeInteger(now) || now <= 0) return attemptBlocked("current_authority_unavailable");
      const receipt = await readPreCallReceipt(
        database,
        scope.workspaceId,
        scope.ownerSubject,
        input.outboxItemId,
        leaseGeneration,
      );
      if (!receipt || receipt.id !== input.preCallReceiptId) return attemptBlocked("lease_unavailable");
      const receiptResult = await verifyPreCallReceipt(database, scope, receipt, input.holderId, now, true);
      if (receiptResult.kind !== "recorded") return attemptBlocked(receiptResult.reason);
      const existing = await readDispatchAttemptPreparation(database, scope.workspaceId, scope.ownerSubject, input.outboxItemId);
      if (existing) {
        return verifyDispatchAttemptPreparation(scope, existing, receipt, input.holderId, now, true);
      }
      const material = await readPreCallMaterial(
        database,
        scope.workspaceId,
        scope.ownerSubject,
        input.outboxItemId,
        input.holderId,
        leaseGeneration,
      );
      if (!material || !validPreCallMaterial(material) || material.lease_event_id !== receipt.lease_event_id) {
        return attemptBlocked("lease_unavailable");
      }
      const preparationDigest = await dispatchAttemptPreparationDigest(scope, material, receipt, now);
      const preparationId = `odap-${preparationDigest}`;
      let committed = false;
      try {
        const inserted = await database.prepare(
          `INSERT INTO outreach_dispatch_attempt_preparations
            (id,workspace_id,owner_subject,outbox_item_id,attempt_ordinal,send_key,dispatch_key,
             message_version_id,message_artifact_digest,sender_connection_id,pre_call_receipt_id,
             lease_event_id,lease_generation,lease_holder_id,lease_expires_at,preparation_digest,
             provider_invocation_authorized,provider_calls,prepared_at)
           VALUES (?,?,?,?,1,?,?,?,?,?,?,?,?,?,?,?,0,0,?)`,
        ).bind(
          preparationId,
          scope.workspaceId,
          scope.ownerSubject,
          input.outboxItemId,
          material.send_key,
          material.dispatch_key,
          material.message_version_id,
          material.message_artifact_digest,
          material.sender_connection_id,
          receipt.id,
          receipt.lease_event_id,
          leaseGeneration,
          input.holderId,
          receipt.lease_expires_at,
          preparationDigest,
          now,
        ).run();
        committed = Number(inserted.meta?.changes) === 1;
      } catch {
        // An exact concurrent preparation is resolved below. This single inert
        // row is the whole preparation fact and never advances the outbox.
      }
      const stored = await readDispatchAttemptPreparation(database, scope.workspaceId, scope.ownerSubject, input.outboxItemId);
      if (!stored) return attemptBlocked("current_authority_unavailable");
      const result = await verifyDispatchAttemptPreparation(scope, stored, receipt, input.holderId, now, !committed);
      if (result.kind !== "prepared_no_invocation") return result;
      return !committed || (
        result.preparationId === preparationId
        && result.preparationDigest === preparationDigest
      ) ? result : attemptBlocked("attempt_unavailable");
    },

    async voidExpiredDispatchPreparation(inputValue: unknown): Promise<DispatchPreparationVoidResult> {
      const input = exactDataRecord(inputValue, ["outboxItemId", "preparationId", "expectedLeaseGeneration"]);
      if (
        !input
        || !id(input.outboxItemId)
        || !id(input.preparationId)
        || !Number.isSafeInteger(input.expectedLeaseGeneration)
        || Number(input.expectedLeaseGeneration) <= 0
      ) return lifecycleBlocked("invalid_request");
      const expectedLeaseGeneration = Number(input.expectedLeaseGeneration);
      const now = scope.now();
      if (!Number.isSafeInteger(now) || now <= 0) return lifecycleBlocked("current_authority_unavailable");
      const preparation = await readDispatchAttemptPreparation(
        database,
        scope.workspaceId,
        scope.ownerSubject,
        input.outboxItemId,
      );
      if (!preparation || preparation.id !== input.preparationId) return lifecycleBlocked("attempt_unavailable");
      const lifecycle = await verifyDispatchPreparationLifecycle(database, scope, preparation);
      if (!lifecycle) return lifecycleBlocked("attempt_unavailable");
      const latest = lifecycle.at(-1);
      if (latest && latest.created_at > now) return lifecycleBlocked("current_authority_unavailable");
      if (latest?.event_kind === "voided_before_invocation") {
        return latest.lease_generation === expectedLeaseGeneration
          ? dispatchPreparationVoidResult(preparation, latest, true)
          : lifecycleBlocked("lease_unavailable");
      }
      const active = latest ?? preparation;
      const activeLeaseGeneration = active.lease_generation;
      const activeLeaseExpiresAt = active.lease_expires_at;
      const activeCreatedAt = latest?.created_at ?? preparation.prepared_at;
      if (
        activeLeaseGeneration !== expectedLeaseGeneration
        || activeCreatedAt > now
        || activeLeaseExpiresAt > now
      ) return lifecycleBlocked("lease_unavailable");
      const revision = (latest?.revision ?? 0) + 1;
      const priorEventId = latest?.id ?? null;
      const priorDigest = latest?.event_digest ?? preparation.preparation_digest;
      const preCallReceiptId = latest?.pre_call_receipt_id ?? preparation.pre_call_receipt_id;
      const leaseEventId = latest?.lease_event_id ?? preparation.lease_event_id;
      const leaseHolderId = latest?.lease_holder_id ?? preparation.lease_holder_id;
      const eventDigest = await dispatchPreparationLifecycleDigest(scope, preparation, {
        revision,
        eventKind: "voided_before_invocation",
        priorEventId,
        priorDigest,
        preCallReceiptId,
        leaseEventId,
        leaseGeneration: activeLeaseGeneration,
        leaseHolderId,
        leaseExpiresAt: activeLeaseExpiresAt,
        reasonCode: "lease_expired_no_invocation",
        effectiveAt: activeLeaseExpiresAt,
        createdAt: now,
      });
      const eventId = `odape-${eventDigest}`;
      let committed = false;
      try {
        const inserted = await database.prepare(
          `INSERT INTO outreach_dispatch_attempt_preparation_events
            (id,workspace_id,preparation_id,revision,event_kind,prior_event_id,prior_digest,
             pre_call_receipt_id,lease_event_id,lease_generation,lease_holder_id,lease_expires_at,
             reason_code,event_digest,provider_invocation_authorized,provider_calls,effective_at,created_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,0,?,?)`,
        ).bind(
          eventId,
          scope.workspaceId,
          preparation.id,
          revision,
          "voided_before_invocation",
          priorEventId,
          priorDigest,
          preCallReceiptId,
          leaseEventId,
          activeLeaseGeneration,
          leaseHolderId,
          activeLeaseExpiresAt,
          "lease_expired_no_invocation",
          eventDigest,
          activeLeaseExpiresAt,
          now,
        ).run();
        committed = Number(inserted.meta?.changes) === 1;
      } catch {
        // Exact contention is resolved by canonical lifecycle verification.
      }
      const storedLifecycle = await verifyDispatchPreparationLifecycle(database, scope, preparation);
      const stored = storedLifecycle?.at(-1);
      if (
        !stored
        || stored.event_kind !== "voided_before_invocation"
        || stored.id !== eventId
        || stored.event_digest !== eventDigest
      ) return lifecycleBlocked("attempt_unavailable");
      return dispatchPreparationVoidResult(preparation, stored, !committed);
    },

    async reprepareDispatchAttempt(inputValue: unknown): Promise<DispatchRepreparationResult> {
      const input = exactDataRecord(inputValue, [
        "outboxItemId", "preparationId", "priorVoidEventId", "preCallReceiptId", "holderId", "leaseGeneration",
      ]);
      if (
        !input
        || !id(input.outboxItemId)
        || !id(input.preparationId)
        || !id(input.priorVoidEventId)
        || !id(input.preCallReceiptId)
        || !id(input.holderId)
        || !Number.isSafeInteger(input.leaseGeneration)
        || Number(input.leaseGeneration) <= 0
      ) return lifecycleBlocked("invalid_request");
      const leaseGeneration = Number(input.leaseGeneration);
      const now = scope.now();
      if (!Number.isSafeInteger(now) || now <= 0) return lifecycleBlocked("current_authority_unavailable");
      const preparation = await readDispatchAttemptPreparation(
        database,
        scope.workspaceId,
        scope.ownerSubject,
        input.outboxItemId,
      );
      if (!preparation || preparation.id !== input.preparationId) return lifecycleBlocked("attempt_unavailable");
      const lifecycle = await verifyDispatchPreparationLifecycle(database, scope, preparation);
      if (!lifecycle) return lifecycleBlocked("attempt_unavailable");
      const latest = lifecycle.at(-1);
      if (latest && latest.created_at > now) return lifecycleBlocked("current_authority_unavailable");
      const receipt = await readPreCallReceipt(
        database,
        scope.workspaceId,
        scope.ownerSubject,
        input.outboxItemId,
        leaseGeneration,
      );
      if (!receipt || receipt.id !== input.preCallReceiptId) return lifecycleBlocked("lease_unavailable");
      const receiptResult = await verifyPreCallReceipt(database, scope, receipt, input.holderId, now, true);
      if (receiptResult.kind !== "recorded") return lifecycleBlocked(receiptResult.reason);
      if (latest?.event_kind === "reprepared_no_invocation") {
        return latest.prior_event_id === input.priorVoidEventId
          && latest.pre_call_receipt_id === receipt.id
          && latest.lease_generation === leaseGeneration
          && latest.lease_holder_id === input.holderId
          ? dispatchRepreparationResult(preparation, latest, receipt, true)
          : lifecycleBlocked("attempt_unavailable");
      }
      if (
        !latest
        || latest.event_kind !== "voided_before_invocation"
        || latest.id !== input.priorVoidEventId
        || leaseGeneration <= latest.lease_generation
      ) return lifecycleBlocked("attempt_unavailable");
      const revision = latest.revision + 1;
      const eventDigest = await dispatchPreparationLifecycleDigest(scope, preparation, {
        revision,
        eventKind: "reprepared_no_invocation",
        priorEventId: latest.id,
        priorDigest: latest.event_digest,
        preCallReceiptId: receipt.id,
        leaseEventId: receipt.lease_event_id,
        leaseGeneration,
        leaseHolderId: input.holderId,
        leaseExpiresAt: receipt.lease_expires_at,
        reasonCode: "fresh_receipt_reprepared_no_invocation",
        effectiveAt: now,
        createdAt: now,
      });
      const eventId = `odape-${eventDigest}`;
      let committed = false;
      try {
        const inserted = await database.prepare(
          `INSERT INTO outreach_dispatch_attempt_preparation_events
            (id,workspace_id,preparation_id,revision,event_kind,prior_event_id,prior_digest,
             pre_call_receipt_id,lease_event_id,lease_generation,lease_holder_id,lease_expires_at,
             reason_code,event_digest,provider_invocation_authorized,provider_calls,effective_at,created_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,0,?,?)`,
        ).bind(
          eventId,
          scope.workspaceId,
          preparation.id,
          revision,
          "reprepared_no_invocation",
          latest.id,
          latest.event_digest,
          receipt.id,
          receipt.lease_event_id,
          leaseGeneration,
          input.holderId,
          receipt.lease_expires_at,
          "fresh_receipt_reprepared_no_invocation",
          eventDigest,
          now,
          now,
        ).run();
        committed = Number(inserted.meta?.changes) === 1;
      } catch {
        // Exact contention is resolved by canonical lifecycle verification.
      }
      const storedLifecycle = await verifyDispatchPreparationLifecycle(database, scope, preparation);
      const stored = storedLifecycle?.at(-1);
      if (
        !stored
        || stored.event_kind !== "reprepared_no_invocation"
        || stored.id !== eventId
        || stored.event_digest !== eventDigest
      ) return lifecycleBlocked("attempt_unavailable");
      return dispatchRepreparationResult(preparation, stored, receipt, !committed);
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

async function readLatestEvent(database: D1Database, workspaceId: string, outboxItemId: string) {
  return database.prepare(
    `SELECT revision,state,lease_generation,lease_holder_id,lease_expires_at
     FROM outreach_outbox_events WHERE workspace_id=? AND outbox_item_id=?
     ORDER BY revision DESC LIMIT 1`,
  ).bind(workspaceId, outboxItemId).first<LatestEventRow>();
}

async function readPreCallReceipt(
  database: D1Database,
  workspaceId: string,
  ownerSubject: string,
  outboxItemId: string,
  leaseGeneration: number,
) {
  return database.prepare(
    `SELECT id,outbox_item_id,lease_event_id,lease_revision,lease_generation,lease_holder_id,lease_expires_at,
            current_material_digest,receipt_digest,valid_until,provider_invocation_authorized,created_at
     FROM outreach_pre_call_recheck_receipts
     WHERE workspace_id=? AND owner_subject=? AND outbox_item_id=? AND lease_generation=? LIMIT 1`,
  ).bind(workspaceId, ownerSubject, outboxItemId, leaseGeneration).first<PreCallReceiptRow>();
}

async function readDispatchAttemptPreparation(
  database: D1Database,
  workspaceId: string,
  ownerSubject: string,
  outboxItemId: string,
) {
  return database.prepare(
    `SELECT preparation.id,preparation.outbox_item_id,preparation.attempt_ordinal,
            preparation.send_key,preparation.dispatch_key,preparation.message_version_id,
            preparation.message_artifact_digest,preparation.sender_connection_id,
            preparation.pre_call_receipt_id,preparation.lease_event_id,
            preparation.lease_generation,preparation.lease_holder_id,preparation.lease_expires_at,
            preparation.preparation_digest,preparation.provider_invocation_authorized,
            preparation.provider_calls,preparation.prepared_at
     FROM outreach_dispatch_attempt_preparations preparation
     JOIN workspaces workspace ON workspace.id=preparation.workspace_id AND workspace.owner_subject=preparation.owner_subject
     WHERE preparation.workspace_id=? AND preparation.owner_subject=? AND preparation.outbox_item_id=?
       AND preparation.attempt_ordinal=1 LIMIT 1`,
  ).bind(workspaceId, ownerSubject, outboxItemId).first<DispatchAttemptPreparationRow>();
}

async function readDispatchAttemptPreparationForLease(
  database: D1Database,
  workspaceId: string,
  ownerSubject: string,
  outboxItemId: string,
) {
  try {
    return await readDispatchAttemptPreparation(database, workspaceId, ownerSubject, outboxItemId);
  } catch (error) {
    if (isMissingPreparationTable(error)) return null;
    throw error;
  }
}

function isMissingPreparationTable(error: unknown) {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current; depth += 1) {
    if (
      current instanceof Error
      && /\bno such table:\s*outreach_dispatch_attempt_preparations\b/iu.test(current.message)
    ) return true;
    current = typeof current === "object" && current !== null && "cause" in current
      ? (current as { cause?: unknown }).cause
      : null;
  }
  return false;
}

async function readPreCallReceiptById(
  database: D1Database,
  workspaceId: string,
  ownerSubject: string,
  receiptId: string,
) {
  return database.prepare(
    `SELECT id,outbox_item_id,lease_event_id,lease_revision,lease_generation,lease_holder_id,lease_expires_at,
            current_material_digest,receipt_digest,valid_until,provider_invocation_authorized,created_at
     FROM outreach_pre_call_recheck_receipts
     WHERE workspace_id=? AND owner_subject=? AND id=? LIMIT 1`,
  ).bind(workspaceId, ownerSubject, receiptId).first<PreCallReceiptRow>();
}

async function readDispatchPreparationEvents(
  database: D1Database,
  workspaceId: string,
  preparationId: string,
) {
  const result = await database.prepare(
    `SELECT id,preparation_id,revision,event_kind,prior_event_id,prior_digest,pre_call_receipt_id,
            lease_event_id,lease_generation,lease_holder_id,lease_expires_at,reason_code,event_digest,
            provider_invocation_authorized,provider_calls,effective_at,created_at
     FROM outreach_dispatch_attempt_preparation_events
     WHERE workspace_id=? AND preparation_id=? ORDER BY revision ASC`,
  ).bind(workspaceId, preparationId).all<DispatchPreparationEventRow>();
  return result.results;
}

async function readPreCallMaterial(
  database: D1Database,
  workspaceId: string,
  ownerSubject: string,
  outboxItemId: string,
  holderId: string,
  leaseGeneration: number,
) {
  return database.prepare(
    `SELECT item.id outbox_item_id,item.send_key,item.dispatch_key,item.approval_consumption_id,
            lease_event.id lease_event_id,lease_event.revision lease_revision,lease_event.lease_generation,
            lease_event.lease_holder_id,lease_event.lease_expires_at,
            message_version.id message_version_id,message_version.artifact_digest message_artifact_digest,
            message_approval.id message_approval_id,message_approval.approval_digest message_approval_digest,
            message_approval.expires_at message_approval_expires_at,
            package_version.id package_version_id,package_version.artifact_digest package_artifact_digest,
            package_approval.id package_approval_id,package_approval.approval_digest package_approval_digest,
            package_approval.expires_at package_approval_expires_at,
            prospect.id prospect_id,prospect.revision prospect_revision,contact.id contact_id,contact.revision contact_revision,
            configuration.id configuration_id,configuration.digest configuration_digest,configuration.revision configuration_revision,
            eligibility.id contact_eligibility_snapshot_id,eligibility.snapshot_digest contact_eligibility_snapshot_digest,
            observation.id email_observation_id,observation.observation_digest,observation.verified_at observation_verified_at,
            observation.verification_class observation_verification_class,
            basis_source.id basis_source_id,basis_source.source_digest basis_source_digest,
            recipient_authority.id recipient_authority_id,recipient_authority.authority_digest recipient_authority_digest,
            recipient_authority.valid_until recipient_authority_expires_at,
            unsubscribe.id unsubscribe_event_id,unsubscribe.revision unsubscribe_revision,
            unsubscribe.event_digest unsubscribe_event_digest,unsubscribe.valid_until unsubscribe_expires_at,
            sender_connection.id sender_connection_id,sender_connection.connection_subject_digest sender_connection_subject_digest,
            sender_connection.protected_reference_version sender_connection_version,
            sender_capability.id sender_capability_id,sender_capability.capability_digest sender_capability_digest,
            sender_capability.expires_at sender_capability_expires_at,
            sender_address.id sender_verified_address_id,sender_address.address_digest sender_address_digest,
            sender_address.verification_digest sender_address_verification_digest,
            sender_address.expires_at sender_address_expires_at
     FROM outreach_outbox_items item
     JOIN outreach_outbox_events lease_event ON lease_event.outbox_item_id=item.id AND lease_event.workspace_id=item.workspace_id
     JOIN outreach_message_approval_consumptions consumption ON consumption.id=item.approval_consumption_id AND consumption.workspace_id=item.workspace_id
     JOIN outreach_message_approvals message_approval ON message_approval.id=item.message_approval_id AND message_approval.workspace_id=item.workspace_id
     JOIN outreach_message_versions message_version ON message_version.id=item.message_version_id AND message_version.workspace_id=item.workspace_id
     JOIN outreach_package_approvals package_approval ON package_approval.id=message_approval.package_approval_id AND package_approval.workspace_id=item.workspace_id
     JOIN outreach_package_versions package_version ON package_version.id=message_version.package_version_id AND package_version.workspace_id=item.workspace_id
     JOIN outreach_packages package ON package.id=package_version.package_id AND package.workspace_id=item.workspace_id
     JOIN profile_prospects prospect ON prospect.id=package.prospect_id AND prospect.workspace_id=item.workspace_id
     JOIN contacts contact ON contact.id=package.contact_id AND contact.workspace_id=item.workspace_id
     JOIN typed_configurations configuration ON configuration.id=package_version.configuration_id AND configuration.workspace_id=item.workspace_id
     JOIN contact_eligibility_snapshots eligibility ON eligibility.id=package_version.contact_eligibility_snapshot_id AND eligibility.workspace_id=item.workspace_id
     JOIN outreach_recipient_dispatch_authorities recipient_authority ON recipient_authority.message_version_id=item.message_version_id AND recipient_authority.workspace_id=item.workspace_id
     JOIN contact_point_observations observation ON observation.id=recipient_authority.email_observation_id AND observation.workspace_id=item.workspace_id
     JOIN sources basis_source ON basis_source.id=recipient_authority.basis_source_id AND basis_source.workspace_id=item.workspace_id
     JOIN outreach_unsubscribe_authority_events unsubscribe ON unsubscribe.recipient_authority_id=recipient_authority.id AND unsubscribe.workspace_id=item.workspace_id
     JOIN outreach_sender_connections sender_connection ON sender_connection.id=item.sender_connection_id AND sender_connection.workspace_id=item.workspace_id
     JOIN outreach_sender_capability_snapshots sender_capability ON sender_capability.sender_connection_id=sender_connection.id AND sender_capability.workspace_id=item.workspace_id
     JOIN outreach_sender_verified_addresses sender_address ON sender_address.sender_capability_id=sender_capability.id
       AND sender_address.workspace_id=item.workspace_id AND sender_address.address_digest=recipient_authority.sender_address_digest
     JOIN workspaces workspace ON workspace.id=item.workspace_id AND workspace.owner_subject=?
     WHERE item.id=? AND item.workspace_id=? AND message_approval.owner_subject=?
       AND lease_event.state='leased' AND lease_event.lease_holder_id=? AND lease_event.lease_generation=?
       AND lease_event.id=(SELECT latest.id FROM outreach_outbox_events latest
         WHERE latest.workspace_id=item.workspace_id AND latest.outbox_item_id=item.id ORDER BY latest.revision DESC LIMIT 1)
       AND unsubscribe.id=(SELECT latest.id FROM outreach_unsubscribe_authority_events latest
         WHERE latest.workspace_id=item.workspace_id AND latest.recipient_authority_id=recipient_authority.id ORDER BY latest.revision DESC LIMIT 1)
     LIMIT 1`,
  ).bind(ownerSubject, outboxItemId, workspaceId, ownerSubject, holderId, leaseGeneration).first<PreCallMaterialRow>();
}

async function readAuthorityExpiry(
  database: D1Database,
  workspaceId: string,
  ownerSubject: string,
  outboxItemId: string,
  now: number,
) {
  return database.prepare(
    `SELECT ma.expires_at message_expires_at,pa.expires_at package_expires_at,
            authority.valid_until recipient_authority_expires_at,unsubscribe.valid_until unsubscribe_expires_at,
            capability.expires_at sender_capability_expires_at,address.expires_at sender_address_expires_at
     FROM outreach_outbox_items item
     JOIN outreach_message_approvals ma ON ma.id=item.message_approval_id AND ma.workspace_id=item.workspace_id
     JOIN outreach_message_versions mv ON mv.id=item.message_version_id AND mv.workspace_id=item.workspace_id
     JOIN outreach_package_approvals pa ON pa.id=ma.package_approval_id AND pa.workspace_id=ma.workspace_id
     JOIN outreach_package_versions pv ON pv.id=mv.package_version_id AND pv.workspace_id=mv.workspace_id
     JOIN outreach_packages package ON package.id=pv.package_id AND package.workspace_id=pv.workspace_id
     JOIN profile_prospects prospect ON prospect.id=package.prospect_id AND prospect.workspace_id=package.workspace_id
     JOIN customer_profiles profile ON profile.id=package.profile_id AND profile.workspace_id=package.workspace_id
     JOIN market_plays play ON play.id=profile.play_id AND play.workspace_id=profile.workspace_id
     JOIN products product ON product.id=play.product_id AND product.workspace_id=play.workspace_id
     JOIN companies company ON company.id=product.company_id AND company.workspace_id=product.workspace_id
     JOIN contacts contact ON contact.id=package.contact_id AND contact.workspace_id=package.workspace_id AND contact.company_id=company.id
     JOIN typed_configurations cfg ON cfg.id=pv.configuration_id AND cfg.workspace_id=pv.workspace_id
     JOIN contact_eligibility_snapshots eligibility ON eligibility.id=pv.contact_eligibility_snapshot_id
       AND eligibility.workspace_id=pv.workspace_id
     JOIN outreach_recipient_dispatch_authorities authority ON authority.message_version_id=item.message_version_id AND authority.workspace_id=item.workspace_id
       AND authority.message_artifact_digest=ma.artifact_digest AND authority.package_approval_id=pa.id
       AND authority.package_approval_digest=pa.approval_digest AND authority.acknowledgement_digest=ma.acknowledgement_digest
     JOIN contact_point_observations observation ON observation.id=authority.email_observation_id
       AND observation.workspace_id=authority.workspace_id AND observation.contact_id=authority.contact_id
     JOIN sources basis_source ON basis_source.id=authority.basis_source_id AND basis_source.workspace_id=authority.workspace_id
       AND basis_source.source_digest=authority.basis_source_digest AND basis_source.status='available'
     JOIN outreach_unsubscribe_authority_events unsubscribe ON unsubscribe.recipient_authority_id=authority.id AND unsubscribe.workspace_id=authority.workspace_id
     JOIN outreach_sender_connections connection ON connection.id=item.sender_connection_id AND connection.workspace_id=item.workspace_id
       AND connection.status='active' AND connection.provider='gmail'
     JOIN outreach_sender_capability_snapshots capability ON capability.sender_connection_id=item.sender_connection_id AND capability.workspace_id=item.workspace_id
       AND capability.connection_subject_digest=connection.connection_subject_digest
     JOIN outreach_sender_verified_addresses address ON address.sender_capability_id=capability.id AND address.workspace_id=capability.workspace_id
       AND address.address_digest=authority.sender_address_digest
     WHERE item.id=? AND item.workspace_id=? AND ma.owner_subject=?
       AND unsubscribe.id=(SELECT latest.id FROM outreach_unsubscribe_authority_events latest WHERE latest.recipient_authority_id=authority.id AND latest.workspace_id=authority.workspace_id ORDER BY latest.revision DESC LIMIT 1)
       AND unsubscribe.status='working'
       AND json_array_length(capability.granted_scopes_json)=2
       AND EXISTS (SELECT 1 FROM json_each(capability.granted_scopes_json) scope WHERE scope.value='https://www.googleapis.com/auth/gmail.send')
       AND EXISTS (SELECT 1 FROM json_each(capability.granted_scopes_json) scope WHERE scope.value='https://www.googleapis.com/auth/gmail.readonly')
       AND EXISTS (SELECT 1 FROM outreach_artifact_bindings binding WHERE binding.workspace_id=pv.workspace_id
         AND binding.artifact_kind='package_version' AND binding.artifact_id=pv.id AND binding.binding_kind='source'
         AND binding.binding_id=basis_source.id AND binding.binding_digest=basis_source.source_digest)
       AND NOT EXISTS (SELECT 1 FROM outreach_artifact_bindings binding
         LEFT JOIN sources bound_source ON bound_source.id=binding.binding_id AND bound_source.workspace_id=binding.workspace_id
         WHERE binding.workspace_id=pv.workspace_id AND binding.artifact_kind='package_version'
           AND binding.artifact_id=pv.id AND binding.binding_kind='source'
           AND (bound_source.id IS NULL OR bound_source.status<>'available' OR bound_source.source_digest<>binding.binding_digest))
       AND NOT EXISTS (SELECT 1 FROM outreach_artifact_bindings binding
         LEFT JOIN knowledge_versions guardrail ON guardrail.id=binding.binding_id AND guardrail.workspace_id=binding.workspace_id
         WHERE binding.workspace_id=pv.workspace_id AND binding.artifact_kind='package_version'
           AND binding.artifact_id=pv.id AND binding.binding_kind='claim_guardrail'
           AND (guardrail.id IS NULL OR guardrail.status<>'confirmed' OR guardrail.value_digest<>binding.binding_digest))
       AND EXISTS (SELECT 1 FROM outreach_artifact_bindings binding WHERE binding.workspace_id=pv.workspace_id
         AND binding.artifact_kind='package_version' AND binding.artifact_id=pv.id AND binding.binding_kind='contact_observation'
         AND binding.binding_id=observation.id AND binding.binding_digest=observation.observation_digest)
       AND EXISTS (SELECT 1 FROM contact_evidence_assignments assignment
         JOIN contact_verification_receipts receipt ON receipt.id=observation.verification_receipt_id
           AND receipt.workspace_id=observation.workspace_id AND receipt.observation_id=observation.id
           AND receipt.receipt_digest IS NOT NULL AND receipt.attestation_key_id IS NOT NULL
         WHERE assignment.id=observation.assignment_id AND assignment.workspace_id=observation.workspace_id
           AND assignment.prospect_id=package.prospect_id AND assignment.contact_id=package.contact_id
           AND assignment.configuration_id=pv.configuration_id AND assignment.configuration_digest=pv.configuration_digest)
       AND NOT EXISTS (SELECT 1 FROM contact_point_observations later WHERE later.workspace_id=observation.workspace_id
         AND later.contact_id=observation.contact_id AND later.contact_point_digest=observation.contact_point_digest
         AND later.id<>observation.id AND later.observed_at>=observation.observed_at)
       AND NOT EXISTS (SELECT 1 FROM contact_eligibility_snapshots later WHERE later.workspace_id=pv.workspace_id
         AND later.prospect_id=package.prospect_id AND later.contact_id=package.contact_id
         AND later.id<>pv.contact_eligibility_snapshot_id
         AND later.projected_at>=(SELECT current.projected_at FROM contact_eligibility_snapshots current WHERE current.id=pv.contact_eligibility_snapshot_id))
       AND prospect.state='approved' AND prospect.active=1 AND prospect.revision=pv.prospect_revision
       AND contact.revision=pv.contact_revision
       AND profile.lifecycle='ready' AND play.lifecycle='active' AND product.lifecycle='ready' AND company.status='active'
       AND cfg.active=1 AND cfg.digest=pv.configuration_digest AND cfg.revision=pv.configuration_revision
       AND eligibility.contact_id=package.contact_id AND eligibility.prospect_id=package.prospect_id
       AND eligibility.configuration_id=pv.configuration_id AND eligibility.configuration_digest=pv.configuration_digest
       AND eligibility.configuration_revision=pv.configuration_revision AND eligibility.prospect_revision=pv.prospect_revision
       AND eligibility.state='ContactReady' AND eligibility.eligible=1
       AND json_array_length(eligibility.preserved_suppression_refs_json)=0
       AND EXISTS (SELECT 1 FROM json_each(eligibility.observation_ids_json) selected WHERE selected.value=observation.id)
       AND NOT EXISTS (SELECT 1 FROM outreach_message_versions later WHERE later.message_id=mv.message_id AND later.version>mv.version)
       AND NOT EXISTS (SELECT 1 FROM outreach_package_versions later WHERE later.package_id=pv.package_id AND later.version>pv.version)
       AND NOT EXISTS (SELECT 1 FROM knowledge_drifts drift WHERE drift.workspace_id=item.workspace_id AND drift.status<>'resolved')
       AND NOT EXISTS (
         SELECT 1 FROM outreach_suppression_tombstones suppression
         WHERE suppression.workspace_id=item.workspace_id AND suppression.effective_at<=? AND (
           suppression.subject_kind IN ('company','organization','confirmed_email_domain')
           OR (suppression.subject_kind='contact' AND (
             suppression.subject_digest=contact.identity_digest
             OR EXISTS (SELECT 1 FROM json_each(suppression.alias_snapshot_json) alias WHERE alias.value=contact.identity_digest)
           ))
           OR (suppression.subject_kind='exact_email' AND (
             suppression.subject_digest=observation.contact_point_digest
             OR EXISTS (SELECT 1 FROM json_each(suppression.alias_snapshot_json) alias WHERE alias.value=observation.contact_point_digest)
           ))
         )
       )
       AND NOT EXISTS (
         SELECT 1 FROM outreach_stop_events stop
         WHERE stop.workspace_id=item.workspace_id AND stop.effective_at<=? AND (
           stop.subject_kind IN ('company','organization','confirmed_email_domain')
           OR (stop.subject_kind='contact' AND stop.subject_digest=contact.identity_digest)
           OR (stop.subject_kind='exact_email' AND stop.subject_digest=observation.contact_point_digest)
         )
       )
       AND NOT EXISTS (SELECT 1 FROM outreach_sender_connections later WHERE later.workspace_id=connection.workspace_id
         AND later.provider=connection.provider AND later.connection_subject_digest=connection.connection_subject_digest
         AND later.protected_reference_version>connection.protected_reference_version)
       AND NOT EXISTS (SELECT 1 FROM outreach_approval_revocations revoked WHERE revoked.workspace_id=item.workspace_id AND revoked.message_approval_id=ma.id)
       AND NOT EXISTS (SELECT 1 FROM outreach_approval_revocations revoked WHERE revoked.workspace_id=item.workspace_id AND revoked.package_approval_id=pa.id)
     LIMIT 1`,
  ).bind(outboxItemId, workspaceId, ownerSubject, now, now).first<AuthorityExpiryRow>();
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

function leaseBlocked(reason: "invalid_request" | "current_authority_unavailable" | "lease_unavailable"): ClaimLeaseResult {
  return Object.freeze({ kind: "blocked", reason, providerInvocationAuthorized: false, providerCalls: 0 });
}

function preCallBlocked(
  reason: "invalid_request" | "current_authority_unavailable" | "lease_unavailable",
): PreCallReceiptResult {
  return Object.freeze({ kind: "blocked", reason, providerInvocationAuthorized: false, providerCalls: 0 });
}

function attemptBlocked(
  reason: "invalid_request" | "current_authority_unavailable" | "lease_unavailable" | "attempt_unavailable",
): DispatchAttemptPreparationResult {
  return Object.freeze({ kind: "blocked", reason, providerInvocationAuthorized: false, providerCalls: 0 });
}

function lifecycleBlocked(
  reason: "invalid_request" | "current_authority_unavailable" | "lease_unavailable" | "attempt_unavailable",
): DispatchPreparationLifecycleBlockedResult {
  return Object.freeze({ kind: "blocked", reason, providerInvocationAuthorized: false, providerCalls: 0 });
}

function dispatchPreparationVoidResult(
  preparation: DispatchAttemptPreparationRow,
  event: DispatchPreparationEventRow,
  replayed: boolean,
): DispatchPreparationVoidResult {
  return Object.freeze({
    kind: "voided_before_invocation",
    eventId: event.id,
    eventDigest: event.event_digest,
    preparationId: preparation.id,
    outboxItemId: preparation.outbox_item_id,
    leaseGeneration: event.lease_generation,
    effectiveAt: event.effective_at,
    replayed,
    providerInvocationAuthorized: false,
    providerCalls: 0,
  });
}

function dispatchRepreparationResult(
  preparation: DispatchAttemptPreparationRow,
  event: DispatchPreparationEventRow,
  receipt: PreCallReceiptRow,
  replayed: boolean,
): DispatchRepreparationResult {
  return Object.freeze({
    kind: "reprepared_no_invocation",
    eventId: event.id,
    eventDigest: event.event_digest,
    preparationId: preparation.id,
    preCallReceiptId: receipt.id,
    outboxItemId: preparation.outbox_item_id,
    leaseGeneration: event.lease_generation,
    validUntil: receipt.valid_until,
    replayed,
    providerInvocationAuthorized: false,
    providerCalls: 0,
  });
}

function exactPreCallReceipt(
  row: PreCallReceiptRow,
  holderId: string,
  replayed: boolean,
): PreCallReceiptResult {
  if (
    !id(row.id)
    || !id(row.outbox_item_id)
    || !id(row.lease_event_id)
    || row.lease_holder_id !== holderId
    || !Number.isSafeInteger(row.lease_generation)
    || row.lease_generation <= 0
    || !digest(row.receipt_digest)
    || !Number.isSafeInteger(row.valid_until)
  ) return preCallBlocked("lease_unavailable");
  return Object.freeze({
    kind: "recorded",
    receiptId: row.id,
    receiptDigest: row.receipt_digest,
    outboxItemId: row.outbox_item_id,
    leaseGeneration: row.lease_generation,
    validUntil: row.valid_until,
    replayed,
    providerInvocationAuthorized: false,
    providerCalls: 0,
  });
}

async function verifyPreCallReceipt(
  database: D1Database,
  scope: Readonly<{ workspaceId: string; ownerSubject: string }>,
  row: PreCallReceiptRow,
  holderId: string,
  now: number,
  replayed: boolean,
): Promise<PreCallReceiptResult> {
  const shaped = exactPreCallReceipt(row, holderId, replayed);
  if (
    shaped.kind !== "recorded"
    || !digest(row.current_material_digest)
    || !Number.isSafeInteger(row.lease_revision)
    || row.lease_revision <= 1
    || !Number.isSafeInteger(row.lease_expires_at)
    || !Number.isSafeInteger(row.created_at)
    || row.created_at > now
    || row.valid_until <= now
  ) return preCallBlocked("current_authority_unavailable");
  const authority = await readAuthorityExpiry(database, scope.workspaceId, scope.ownerSubject, row.outbox_item_id, now);
  if (!authority || Object.values(authority).some((expiry) => !Number.isSafeInteger(expiry) || Number(expiry) <= now)) {
    return preCallBlocked("current_authority_unavailable");
  }
  const material = await readPreCallMaterial(
    database,
    scope.workspaceId,
    scope.ownerSubject,
    row.outbox_item_id,
    holderId,
    row.lease_generation,
  );
  if (!material || !validPreCallMaterial(material) || material.lease_event_id !== row.lease_event_id) {
    return preCallBlocked("lease_unavailable");
  }
  const currentMaterialDigest = await preCallMaterialDigest(scope, material);
  const receiptDigest = await preCallReceiptDigest(scope, material, currentMaterialDigest, row.valid_until, row.created_at);
  if (
    currentMaterialDigest !== row.current_material_digest
    || receiptDigest !== row.receipt_digest
    || row.id !== `opcr-${receiptDigest}`
    || material.lease_revision !== row.lease_revision
    || material.lease_expires_at !== row.lease_expires_at
  ) return preCallBlocked("current_authority_unavailable");
  return shaped;
}

function preCallMaterialDigest(
  scope: Readonly<{ workspaceId: string; ownerSubject: string }>,
  material: PreCallMaterialRow,
) {
  return canonicalDigest({
    schema: "outreach-pre-call-current-material/v1",
    workspaceId: scope.workspaceId,
    ownerSubject: scope.ownerSubject,
    ...material,
  });
}

function preCallReceiptDigest(
  scope: Readonly<{ workspaceId: string; ownerSubject: string }>,
  material: PreCallMaterialRow,
  currentMaterialDigest: string,
  validUntil: number,
  createdAt: number,
) {
  return canonicalDigest({
    schema: "outreach-pre-call-recheck-receipt/v1",
    workspaceId: scope.workspaceId,
    ownerSubject: scope.ownerSubject,
    outboxItemId: material.outbox_item_id,
    leaseEventId: material.lease_event_id,
    leaseRevision: material.lease_revision,
    leaseGeneration: material.lease_generation,
    leaseHolderId: material.lease_holder_id,
    leaseExpiresAt: material.lease_expires_at,
    currentMaterialDigest,
    validUntil,
    createdAt,
    providerInvocationAuthorized: false,
  });
}

function dispatchAttemptPreparationDigest(
  scope: Readonly<{ workspaceId: string; ownerSubject: string }>,
  material: Pick<PreCallMaterialRow, "outbox_item_id" | "send_key" | "dispatch_key" | "message_version_id" | "message_artifact_digest" | "sender_connection_id">,
  receipt: PreCallReceiptRow,
  preparedAt: number,
) {
  return canonicalDigest({
    schema: "outreach-dispatch-attempt-preparation/v1",
    workspaceId: scope.workspaceId,
    ownerSubject: scope.ownerSubject,
    outboxItemId: material.outbox_item_id,
    attemptOrdinal: 1,
    sendKey: material.send_key,
    dispatchKey: material.dispatch_key,
    messageVersionId: material.message_version_id,
    messageArtifactDigest: material.message_artifact_digest,
    senderConnectionId: material.sender_connection_id,
    preCallReceiptId: receipt.id,
    preCallReceiptDigest: receipt.receipt_digest,
    leaseEventId: receipt.lease_event_id,
    leaseGeneration: receipt.lease_generation,
    leaseHolderId: receipt.lease_holder_id,
    leaseExpiresAt: receipt.lease_expires_at,
    providerInvocationAuthorized: false,
    providerCalls: 0,
    preparedAt,
  });
}

type DispatchPreparationLifecycleDigestInput = Readonly<{
  revision: number;
  eventKind: DispatchPreparationEventRow["event_kind"];
  priorEventId: string | null;
  priorDigest: string;
  preCallReceiptId: string;
  leaseEventId: string;
  leaseGeneration: number;
  leaseHolderId: string;
  leaseExpiresAt: number;
  reasonCode: DispatchPreparationEventRow["reason_code"];
  effectiveAt: number;
  createdAt: number;
}>;

function dispatchPreparationLifecycleDigest(
  scope: Readonly<{ workspaceId: string; ownerSubject: string }>,
  preparation: DispatchAttemptPreparationRow,
  event: DispatchPreparationLifecycleDigestInput,
) {
  return canonicalDigest({
    schema: "outreach-dispatch-attempt-preparation-event/v1",
    workspaceId: scope.workspaceId,
    ownerSubject: scope.ownerSubject,
    preparationId: preparation.id,
    preparationDigest: preparation.preparation_digest,
    revision: event.revision,
    eventKind: event.eventKind,
    priorEventId: event.priorEventId,
    priorDigest: event.priorDigest,
    preCallReceiptId: event.preCallReceiptId,
    leaseEventId: event.leaseEventId,
    leaseGeneration: event.leaseGeneration,
    leaseHolderId: event.leaseHolderId,
    leaseExpiresAt: event.leaseExpiresAt,
    reasonCode: event.reasonCode,
    providerInvocationAuthorized: false,
    providerCalls: 0,
    effectiveAt: event.effectiveAt,
    createdAt: event.createdAt,
  });
}

function historicalPreCallReceiptDigest(
  scope: Readonly<{ workspaceId: string; ownerSubject: string }>,
  receipt: PreCallReceiptRow,
) {
  return canonicalDigest({
    schema: "outreach-pre-call-recheck-receipt/v1",
    workspaceId: scope.workspaceId,
    ownerSubject: scope.ownerSubject,
    outboxItemId: receipt.outbox_item_id,
    leaseEventId: receipt.lease_event_id,
    leaseRevision: receipt.lease_revision,
    leaseGeneration: receipt.lease_generation,
    leaseHolderId: receipt.lease_holder_id,
    leaseExpiresAt: receipt.lease_expires_at,
    currentMaterialDigest: receipt.current_material_digest,
    validUntil: receipt.valid_until,
    createdAt: receipt.created_at,
    providerInvocationAuthorized: false,
  });
}

async function validHistoricalPreCallReceipt(
  scope: Readonly<{ workspaceId: string; ownerSubject: string }>,
  receipt: PreCallReceiptRow,
) {
  if (
    !id(receipt.id)
    || !id(receipt.outbox_item_id)
    || !id(receipt.lease_event_id)
    || !id(receipt.lease_holder_id)
    || !digest(receipt.current_material_digest)
    || !digest(receipt.receipt_digest)
    || ![receipt.lease_revision, receipt.lease_generation, receipt.lease_expires_at, receipt.valid_until, receipt.created_at]
      .every((value) => Number.isSafeInteger(value) && value > 0)
    || receipt.lease_revision <= 1
    || receipt.valid_until > receipt.lease_expires_at
    || receipt.created_at >= receipt.valid_until
    || receipt.provider_invocation_authorized !== 0
  ) return false;
  const receiptDigest = await historicalPreCallReceiptDigest(scope, receipt);
  return receipt.receipt_digest === receiptDigest && receipt.id === `opcr-${receiptDigest}`;
}

async function validDispatchAttemptPreparationIntegrity(
  scope: Readonly<{ workspaceId: string; ownerSubject: string }>,
  preparation: DispatchAttemptPreparationRow,
  receipt: PreCallReceiptRow,
) {
  if (
    !id(preparation.id)
    || !id(preparation.outbox_item_id)
    || !id(preparation.message_version_id)
    || !id(preparation.sender_connection_id)
    || !id(preparation.pre_call_receipt_id)
    || !id(preparation.lease_event_id)
    || preparation.attempt_ordinal !== 1
    || preparation.pre_call_receipt_id !== receipt.id
    || preparation.outbox_item_id !== receipt.outbox_item_id
    || preparation.lease_event_id !== receipt.lease_event_id
    || preparation.lease_generation !== receipt.lease_generation
    || preparation.lease_holder_id !== receipt.lease_holder_id
    || preparation.lease_expires_at !== receipt.lease_expires_at
    || preparation.prepared_at < receipt.created_at
    || preparation.prepared_at >= preparation.lease_expires_at
    || preparation.provider_invocation_authorized !== 0
    || preparation.provider_calls !== 0
    || ![preparation.send_key, preparation.dispatch_key, preparation.message_artifact_digest, preparation.preparation_digest].every(digest)
    || !await validHistoricalPreCallReceipt(scope, receipt)
  ) return false;
  const preparationDigest = await dispatchAttemptPreparationDigest(scope, {
    outbox_item_id: preparation.outbox_item_id,
    send_key: preparation.send_key,
    dispatch_key: preparation.dispatch_key,
    message_version_id: preparation.message_version_id,
    message_artifact_digest: preparation.message_artifact_digest,
    sender_connection_id: preparation.sender_connection_id,
  }, receipt, preparation.prepared_at);
  return preparation.preparation_digest === preparationDigest && preparation.id === `odap-${preparationDigest}`;
}

async function verifyDispatchPreparationLifecycle(
  database: D1Database,
  scope: Readonly<{ workspaceId: string; ownerSubject: string }>,
  preparation: DispatchAttemptPreparationRow,
): Promise<DispatchPreparationEventRow[] | null> {
  const rootReceipt = await readPreCallReceiptById(database, scope.workspaceId, scope.ownerSubject, preparation.pre_call_receipt_id);
  if (!rootReceipt || !await validDispatchAttemptPreparationIntegrity(scope, preparation, rootReceipt)) return null;
  const rows = await readDispatchPreparationEvents(database, scope.workspaceId, preparation.id);
  if (rows.length > 1_000) return null;
  let active: Readonly<{
    preCallReceiptId: string;
    leaseEventId: string;
    leaseGeneration: number;
    leaseHolderId: string;
    leaseExpiresAt: number;
  }> = {
    preCallReceiptId: preparation.pre_call_receipt_id,
    leaseEventId: preparation.lease_event_id,
    leaseGeneration: preparation.lease_generation,
    leaseHolderId: preparation.lease_holder_id,
    leaseExpiresAt: preparation.lease_expires_at,
  };
  let priorId: string | null = null;
  let priorDigest = preparation.preparation_digest;
  let priorCreatedAt = preparation.prepared_at;
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const revision = index + 1;
    const expectedKind = revision % 2 === 1 ? "voided_before_invocation" : "reprepared_no_invocation";
    const expectedReason = expectedKind === "voided_before_invocation"
      ? "lease_expired_no_invocation"
      : "fresh_receipt_reprepared_no_invocation";
    if (
      !id(row.id)
      || row.preparation_id !== preparation.id
      || row.revision !== revision
      || row.event_kind !== expectedKind
      || row.reason_code !== expectedReason
      || row.prior_event_id !== priorId
      || row.prior_digest !== priorDigest
      || !id(row.pre_call_receipt_id)
      || !id(row.lease_event_id)
      || !id(row.lease_holder_id)
      || !digest(row.event_digest)
      || !digest(row.prior_digest)
      || ![row.lease_generation, row.lease_expires_at, row.effective_at, row.created_at]
        .every((value) => Number.isSafeInteger(value) && value > 0)
      || row.provider_invocation_authorized !== 0
      || row.provider_calls !== 0
      || row.effective_at > row.created_at
      || row.created_at < priorCreatedAt
    ) return null;
    if (expectedKind === "voided_before_invocation") {
      if (
        row.pre_call_receipt_id !== active.preCallReceiptId
        || row.lease_event_id !== active.leaseEventId
        || row.lease_generation !== active.leaseGeneration
        || row.lease_holder_id !== active.leaseHolderId
        || row.lease_expires_at !== active.leaseExpiresAt
        || row.effective_at !== active.leaseExpiresAt
      ) return null;
    } else {
      const receipt = await readPreCallReceiptById(database, scope.workspaceId, scope.ownerSubject, row.pre_call_receipt_id);
      if (
        !receipt
        || !await validHistoricalPreCallReceipt(scope, receipt)
        || receipt.outbox_item_id !== preparation.outbox_item_id
        || receipt.lease_event_id !== row.lease_event_id
        || receipt.lease_generation !== row.lease_generation
        || receipt.lease_holder_id !== row.lease_holder_id
        || receipt.lease_expires_at !== row.lease_expires_at
        || receipt.created_at > row.created_at
        || receipt.valid_until <= row.created_at
        || row.lease_generation <= active.leaseGeneration
        || row.effective_at !== row.created_at
        || row.lease_expires_at <= row.created_at
      ) return null;
      active = {
        preCallReceiptId: row.pre_call_receipt_id,
        leaseEventId: row.lease_event_id,
        leaseGeneration: row.lease_generation,
        leaseHolderId: row.lease_holder_id,
        leaseExpiresAt: row.lease_expires_at,
      };
    }
    const eventDigest = await dispatchPreparationLifecycleDigest(scope, preparation, {
      revision: row.revision,
      eventKind: row.event_kind,
      priorEventId: row.prior_event_id,
      priorDigest: row.prior_digest,
      preCallReceiptId: row.pre_call_receipt_id,
      leaseEventId: row.lease_event_id,
      leaseGeneration: row.lease_generation,
      leaseHolderId: row.lease_holder_id,
      leaseExpiresAt: row.lease_expires_at,
      reasonCode: row.reason_code,
      effectiveAt: row.effective_at,
      createdAt: row.created_at,
    });
    if (row.event_digest !== eventDigest || row.id !== `odape-${eventDigest}`) return null;
    priorId = row.id;
    priorDigest = row.event_digest;
    priorCreatedAt = row.created_at;
  }
  return rows;
}

async function verifyDispatchAttemptPreparation(
  scope: Readonly<{ workspaceId: string; ownerSubject: string }>,
  row: DispatchAttemptPreparationRow,
  receipt: PreCallReceiptRow,
  holderId: string,
  now: number,
  replayed: boolean,
): Promise<DispatchAttemptPreparationResult> {
  if (
    !id(row.id)
    || !id(row.outbox_item_id)
    || !id(row.message_version_id)
    || !id(row.sender_connection_id)
    || !id(row.pre_call_receipt_id)
    || !id(row.lease_event_id)
    || row.attempt_ordinal !== 1
    || row.pre_call_receipt_id !== receipt.id
    || row.lease_event_id !== receipt.lease_event_id
    || row.lease_generation !== receipt.lease_generation
    || row.lease_holder_id !== holderId
    || row.lease_holder_id !== receipt.lease_holder_id
    || row.lease_expires_at !== receipt.lease_expires_at
    || row.prepared_at < receipt.created_at
    || row.prepared_at > now
    || row.lease_expires_at <= now
    || receipt.valid_until <= now
    || row.provider_invocation_authorized !== 0
    || row.provider_calls !== 0
    || ![row.send_key,row.dispatch_key,row.message_artifact_digest,row.preparation_digest].every(digest)
  ) return attemptBlocked("attempt_unavailable");
  const preparationDigest = await dispatchAttemptPreparationDigest(scope, {
    outbox_item_id: row.outbox_item_id,
    send_key: row.send_key,
    dispatch_key: row.dispatch_key,
    message_version_id: row.message_version_id,
    message_artifact_digest: row.message_artifact_digest,
    sender_connection_id: row.sender_connection_id,
  }, receipt, row.prepared_at);
  if (
    preparationDigest !== row.preparation_digest
    || row.id !== `odap-${preparationDigest}`
  ) return attemptBlocked("attempt_unavailable");
  return Object.freeze({
    kind: "prepared_no_invocation",
    preparationId: row.id,
    preparationDigest,
    preCallReceiptId: receipt.id,
    outboxItemId: row.outbox_item_id,
    leaseGeneration: row.lease_generation,
    validUntil: receipt.valid_until,
    replayed,
    providerInvocationAuthorized: false,
    providerCalls: 0,
  });
}

function validPreCallMaterial(row: PreCallMaterialRow) {
  const ids = [
    row.outbox_item_id,row.approval_consumption_id,row.lease_event_id,row.lease_holder_id,row.message_version_id,
    row.message_approval_id,row.package_version_id,row.package_approval_id,row.prospect_id,row.contact_id,
    row.configuration_id,row.contact_eligibility_snapshot_id,row.email_observation_id,row.basis_source_id,
    row.recipient_authority_id,row.unsubscribe_event_id,row.sender_connection_id,row.sender_capability_id,
    row.sender_verified_address_id,
  ];
  const digests = [
    row.send_key,row.dispatch_key,row.message_artifact_digest,row.message_approval_digest,row.package_artifact_digest,
    row.package_approval_digest,row.configuration_digest,row.contact_eligibility_snapshot_digest,row.observation_digest,
    row.basis_source_digest,row.recipient_authority_digest,row.unsubscribe_event_digest,row.sender_connection_subject_digest,
    row.sender_capability_digest,row.sender_address_digest,row.sender_address_verification_digest,
  ];
  const positiveIntegers = [
    row.lease_revision,row.lease_generation,row.lease_expires_at,row.message_approval_expires_at,
    row.package_approval_expires_at,row.prospect_revision,row.contact_revision,row.configuration_revision,
    row.observation_verified_at,row.recipient_authority_expires_at,row.unsubscribe_revision,row.unsubscribe_expires_at,
    row.sender_connection_version,row.sender_capability_expires_at,row.sender_address_expires_at,
  ];
  return ids.every(id) && digests.every(digest) && positiveIntegers.every((value) => Number.isSafeInteger(value) && value > 0)
    && ["mailbox_verified", "source_verified"].includes(row.observation_verification_class);
}

function claimed(
  outboxItemId: string,
  holderId: string,
  leaseGeneration: number,
  expiresAt: number,
  replayed: boolean,
): ClaimLeaseResult {
  return Object.freeze({
    kind: "claimed",
    outboxItemId,
    holderId,
    leaseGeneration,
    expiresAt,
    replayed,
    providerInvocationAuthorized: false,
    providerCalls: 0,
  });
}

function validLatestEvent(value: LatestEventRow) {
  return Number.isSafeInteger(value.revision)
    && value.revision > 0
    && Number.isSafeInteger(value.lease_generation)
    && value.lease_generation >= 0
    && typeof value.state === "string"
    && (value.lease_holder_id === null || id(value.lease_holder_id))
    && (value.lease_expires_at === null || Number.isSafeInteger(value.lease_expires_at));
}

function id(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9][a-z0-9_.:-]{2,127}$/iu.test(value);
}

function digest(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
}
