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
