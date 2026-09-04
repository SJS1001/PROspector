CREATE TABLE `outreach_dispatch_attempt_preparation_events` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`preparation_id` text NOT NULL,
	`revision` integer NOT NULL,
	`event_kind` text NOT NULL,
	`prior_event_id` text,
	`prior_digest` text NOT NULL,
	`pre_call_receipt_id` text NOT NULL,
	`lease_event_id` text NOT NULL,
	`lease_generation` integer NOT NULL,
	`lease_holder_id` text NOT NULL,
	`lease_expires_at` integer NOT NULL,
	`reason_code` text NOT NULL,
	`event_digest` text NOT NULL,
	`provider_invocation_authorized` integer DEFAULT 0 NOT NULL,
	`provider_calls` integer DEFAULT 0 NOT NULL,
	`effective_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`preparation_id`) REFERENCES `outreach_dispatch_attempt_preparations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`prior_event_id`) REFERENCES `outreach_dispatch_attempt_preparation_events`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`pre_call_receipt_id`) REFERENCES `outreach_pre_call_recheck_receipts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`lease_event_id`) REFERENCES `outreach_outbox_events`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "outreach_dispatch_attempt_preparation_event_revision_check" CHECK("outreach_dispatch_attempt_preparation_events"."revision" > 0),
	CONSTRAINT "outreach_dispatch_attempt_preparation_event_sequence_check" CHECK(("outreach_dispatch_attempt_preparation_events"."revision" % 2 = 1 and "outreach_dispatch_attempt_preparation_events"."event_kind" = 'voided_before_invocation') or ("outreach_dispatch_attempt_preparation_events"."revision" % 2 = 0 and "outreach_dispatch_attempt_preparation_events"."event_kind" = 'reprepared_no_invocation')),
	CONSTRAINT "outreach_dispatch_attempt_preparation_event_kind_reason_check" CHECK(("outreach_dispatch_attempt_preparation_events"."event_kind" = 'voided_before_invocation' and "outreach_dispatch_attempt_preparation_events"."reason_code" = 'lease_expired_no_invocation' and "outreach_dispatch_attempt_preparation_events"."effective_at" = "outreach_dispatch_attempt_preparation_events"."lease_expires_at") or ("outreach_dispatch_attempt_preparation_events"."event_kind" = 'reprepared_no_invocation' and "outreach_dispatch_attempt_preparation_events"."reason_code" = 'fresh_receipt_reprepared_no_invocation' and "outreach_dispatch_attempt_preparation_events"."effective_at" = "outreach_dispatch_attempt_preparation_events"."created_at")),
	CONSTRAINT "outreach_dispatch_attempt_preparation_event_time_check" CHECK("outreach_dispatch_attempt_preparation_events"."lease_generation" > 0 and "outreach_dispatch_attempt_preparation_events"."effective_at" <= "outreach_dispatch_attempt_preparation_events"."created_at"),
	CONSTRAINT "outreach_dispatch_attempt_preparation_event_digest_check" CHECK(length("outreach_dispatch_attempt_preparation_events"."prior_digest") = 64 and "outreach_dispatch_attempt_preparation_events"."prior_digest" not glob '*[^0-9a-f]*' and length("outreach_dispatch_attempt_preparation_events"."event_digest") = 64 and "outreach_dispatch_attempt_preparation_events"."event_digest" not glob '*[^0-9a-f]*'),
	CONSTRAINT "outreach_dispatch_attempt_preparation_event_no_provider_authority" CHECK("outreach_dispatch_attempt_preparation_events"."provider_invocation_authorized" = 0 and "outreach_dispatch_attempt_preparation_events"."provider_calls" = 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `outreach_dispatch_attempt_preparation_event_revision_unique` ON `outreach_dispatch_attempt_preparation_events` (`preparation_id`,`revision`);--> statement-breakpoint
CREATE UNIQUE INDEX `outreach_dispatch_attempt_preparation_event_prior_unique` ON `outreach_dispatch_attempt_preparation_events` (`prior_event_id`) WHERE "outreach_dispatch_attempt_preparation_events"."prior_event_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX `outreach_dispatch_attempt_preparation_event_digest_unique` ON `outreach_dispatch_attempt_preparation_events` (`workspace_id`,`event_digest`);--> statement-breakpoint
CREATE INDEX `outreach_dispatch_attempt_preparation_event_workspace_idx` ON `outreach_dispatch_attempt_preparation_events` (`workspace_id`,`preparation_id`,`created_at`);
--> statement-breakpoint
CREATE TRIGGER outreach_dispatch_attempt_preparation_void_guard BEFORE INSERT ON outreach_dispatch_attempt_preparation_events WHEN NEW.event_kind='voided_before_invocation' BEGIN
  SELECT RAISE(ABORT, 'invalid outreach dispatch preparation void') WHERE
    NEW.provider_invocation_authorized<>0 OR NEW.provider_calls<>0
    OR NEW.reason_code<>'lease_expired_no_invocation'
    OR NEW.effective_at<>NEW.lease_expires_at OR NEW.created_at<NEW.effective_at
    OR NOT EXISTS (
      SELECT 1 FROM outreach_dispatch_attempt_preparations preparation
      JOIN workspaces workspace ON workspace.id=preparation.workspace_id AND workspace.owner_subject=preparation.owner_subject
      WHERE preparation.id=NEW.preparation_id AND preparation.workspace_id=NEW.workspace_id
        AND preparation.provider_invocation_authorized=0 AND preparation.provider_calls=0
        AND (
          (NEW.revision=1 AND NEW.prior_event_id IS NULL
            AND NEW.prior_digest=preparation.preparation_digest
            AND NEW.pre_call_receipt_id=preparation.pre_call_receipt_id
            AND NEW.lease_event_id=preparation.lease_event_id
            AND NEW.lease_generation=preparation.lease_generation
            AND NEW.lease_holder_id=preparation.lease_holder_id
            AND NEW.lease_expires_at=preparation.lease_expires_at
            AND NOT EXISTS (SELECT 1 FROM outreach_dispatch_attempt_preparation_events any_event
              WHERE any_event.workspace_id=preparation.workspace_id AND any_event.preparation_id=preparation.id))
          OR (NEW.revision>1 AND EXISTS (
            SELECT 1 FROM outreach_dispatch_attempt_preparation_events prior
            WHERE prior.id=NEW.prior_event_id AND prior.workspace_id=preparation.workspace_id
              AND prior.preparation_id=preparation.id AND prior.event_kind='reprepared_no_invocation'
              AND prior.revision=NEW.revision-1 AND prior.event_digest=NEW.prior_digest
              AND prior.pre_call_receipt_id=NEW.pre_call_receipt_id
              AND prior.lease_event_id=NEW.lease_event_id
              AND prior.lease_generation=NEW.lease_generation
              AND prior.lease_holder_id=NEW.lease_holder_id
              AND prior.lease_expires_at=NEW.lease_expires_at
              AND prior.created_at<=NEW.created_at
              AND prior.id=(SELECT latest.id FROM outreach_dispatch_attempt_preparation_events latest
                WHERE latest.workspace_id=preparation.workspace_id AND latest.preparation_id=preparation.id
                ORDER BY latest.revision DESC LIMIT 1)))
        )
    );
  SELECT RAISE(ABORT, 'invalid outreach dispatch preparation void') WHERE NOT EXISTS (
    SELECT 1 FROM outreach_dispatch_attempt_preparations preparation
    JOIN outreach_outbox_events lease_event ON lease_event.id=NEW.lease_event_id
      AND lease_event.workspace_id=preparation.workspace_id AND lease_event.outbox_item_id=preparation.outbox_item_id
    WHERE preparation.id=NEW.preparation_id AND preparation.workspace_id=NEW.workspace_id
      AND lease_event.state='leased' AND lease_event.lease_generation=NEW.lease_generation
      AND lease_event.lease_holder_id=NEW.lease_holder_id AND lease_event.lease_expires_at=NEW.lease_expires_at
      AND lease_event.id=(SELECT latest.id FROM outreach_outbox_events latest
        WHERE latest.workspace_id=preparation.workspace_id AND latest.outbox_item_id=preparation.outbox_item_id
        ORDER BY latest.revision DESC LIMIT 1)
      AND NOT EXISTS (SELECT 1 FROM outreach_outbox_events unsafe_history
        WHERE unsafe_history.workspace_id=preparation.workspace_id
          AND unsafe_history.outbox_item_id=preparation.outbox_item_id
          AND unsafe_history.state IN ('dispatching','sent','delivery_unknown'))
  );
END;
--> statement-breakpoint
DROP TRIGGER outreach_dispatch_attempt_preparation_lease_fence;
--> statement-breakpoint
CREATE TRIGGER outreach_dispatch_attempt_preparation_lease_fence BEFORE INSERT ON outreach_outbox_events BEGIN
  SELECT RAISE(ABORT, 'outreach dispatch attempt preparation blocks lease recovery')
  WHERE NEW.state='leased' AND EXISTS (
    SELECT 1 FROM outreach_dispatch_attempt_preparations preparation
    WHERE preparation.workspace_id=NEW.workspace_id AND preparation.outbox_item_id=NEW.outbox_item_id
  ) AND NOT EXISTS (
    SELECT 1 FROM outreach_dispatch_attempt_preparations preparation
    JOIN outreach_dispatch_attempt_preparation_events lifecycle
      ON lifecycle.workspace_id=preparation.workspace_id AND lifecycle.preparation_id=preparation.id
    WHERE preparation.workspace_id=NEW.workspace_id AND preparation.outbox_item_id=NEW.outbox_item_id
      AND lifecycle.event_kind='voided_before_invocation'
      AND lifecycle.lease_generation<NEW.lease_generation
      AND lifecycle.created_at<=NEW.created_at
      AND lifecycle.id=(SELECT latest.id FROM outreach_dispatch_attempt_preparation_events latest
        WHERE latest.workspace_id=preparation.workspace_id AND latest.preparation_id=preparation.id
        ORDER BY latest.revision DESC LIMIT 1)
      AND NOT EXISTS (SELECT 1 FROM outreach_outbox_events unsafe_history
        WHERE unsafe_history.workspace_id=preparation.workspace_id
          AND unsafe_history.outbox_item_id=preparation.outbox_item_id
          AND unsafe_history.state IN ('dispatching','sent','delivery_unknown'))
  );
END;
--> statement-breakpoint
CREATE TRIGGER outreach_dispatch_attempt_preparation_voided_terminal_fence BEFORE INSERT ON outreach_outbox_events BEGIN
  SELECT RAISE(ABORT, 'voided outreach dispatch preparation blocks stale terminal event')
  WHERE NEW.state IN ('cancelled','failed_before_dispatch') AND EXISTS (
    SELECT 1 FROM outreach_dispatch_attempt_preparations preparation
    JOIN outreach_dispatch_attempt_preparation_events lifecycle
      ON lifecycle.workspace_id=preparation.workspace_id AND lifecycle.preparation_id=preparation.id
    WHERE preparation.workspace_id=NEW.workspace_id AND preparation.outbox_item_id=NEW.outbox_item_id
      AND lifecycle.event_kind='voided_before_invocation'
      AND lifecycle.lease_generation=NEW.lease_generation
      AND lifecycle.id=(SELECT latest.id FROM outreach_dispatch_attempt_preparation_events latest
        WHERE latest.workspace_id=preparation.workspace_id AND latest.preparation_id=preparation.id
        ORDER BY latest.revision DESC LIMIT 1)
  );
END;
--> statement-breakpoint
CREATE TRIGGER outreach_dispatch_attempt_repreparation_guard BEFORE INSERT ON outreach_dispatch_attempt_preparation_events WHEN NEW.event_kind='reprepared_no_invocation' BEGIN
  SELECT RAISE(ABORT, 'invalid outreach dispatch repreparation') WHERE
    NEW.provider_invocation_authorized<>0 OR NEW.provider_calls<>0
    OR NEW.reason_code<>'fresh_receipt_reprepared_no_invocation'
    OR NEW.effective_at<>NEW.created_at
    OR NOT EXISTS (
      SELECT 1 FROM outreach_dispatch_attempt_preparations preparation
      JOIN workspaces workspace ON workspace.id=preparation.workspace_id AND workspace.owner_subject=preparation.owner_subject
      JOIN outreach_dispatch_attempt_preparation_events prior ON prior.id=NEW.prior_event_id
        AND prior.workspace_id=preparation.workspace_id AND prior.preparation_id=preparation.id
      JOIN outreach_pre_call_recheck_receipts receipt ON receipt.id=NEW.pre_call_receipt_id
        AND receipt.workspace_id=preparation.workspace_id AND receipt.owner_subject=preparation.owner_subject
        AND receipt.outbox_item_id=preparation.outbox_item_id AND receipt.provider_invocation_authorized=0
      JOIN outreach_outbox_events lease_event ON lease_event.id=NEW.lease_event_id
        AND lease_event.workspace_id=preparation.workspace_id AND lease_event.outbox_item_id=preparation.outbox_item_id
      WHERE preparation.id=NEW.preparation_id AND preparation.workspace_id=NEW.workspace_id
        AND prior.event_kind='voided_before_invocation' AND prior.revision=NEW.revision-1
        AND prior.event_digest=NEW.prior_digest AND prior.id=(
          SELECT latest.id FROM outreach_dispatch_attempt_preparation_events latest
          WHERE latest.workspace_id=preparation.workspace_id AND latest.preparation_id=preparation.id
          ORDER BY latest.revision DESC LIMIT 1)
        AND prior.created_at<=NEW.created_at AND NEW.lease_generation>prior.lease_generation
        AND receipt.lease_event_id=lease_event.id AND receipt.lease_revision=lease_event.revision
        AND receipt.lease_generation=NEW.lease_generation AND receipt.lease_holder_id=NEW.lease_holder_id
        AND receipt.lease_expires_at=NEW.lease_expires_at
        AND receipt.created_at<=NEW.created_at AND receipt.valid_until>NEW.created_at
        AND lease_event.state='leased' AND lease_event.lease_generation=NEW.lease_generation
        AND lease_event.lease_holder_id=NEW.lease_holder_id AND lease_event.lease_expires_at=NEW.lease_expires_at
        AND lease_event.created_at<=NEW.created_at AND lease_event.lease_expires_at>NEW.created_at
        AND lease_event.id=(SELECT latest.id FROM outreach_outbox_events latest
          WHERE latest.workspace_id=preparation.workspace_id AND latest.outbox_item_id=preparation.outbox_item_id
          ORDER BY latest.revision DESC LIMIT 1)
        AND NOT EXISTS (SELECT 1 FROM outreach_outbox_events unsafe_history
          WHERE unsafe_history.workspace_id=preparation.workspace_id
            AND unsafe_history.outbox_item_id=preparation.outbox_item_id
            AND unsafe_history.state IN ('dispatching','sent','delivery_unknown'))
    );
  SELECT RAISE(ABORT, 'invalid outreach dispatch repreparation') WHERE NOT EXISTS (
    SELECT 1 FROM outreach_dispatch_attempt_preparations preparation
    JOIN outreach_outbox_items item ON item.id=preparation.outbox_item_id AND item.workspace_id=preparation.workspace_id
    JOIN outreach_message_approval_consumptions consumption ON consumption.id=item.approval_consumption_id
      AND consumption.workspace_id=item.workspace_id AND consumption.message_approval_id=item.message_approval_id
      AND consumption.send_key=item.send_key
    JOIN outreach_message_approvals message_approval ON message_approval.id=item.message_approval_id
      AND message_approval.workspace_id=item.workspace_id AND message_approval.owner_subject=preparation.owner_subject
      AND message_approval.message_version_id=item.message_version_id
      AND message_approval.approval_digest=consumption.approval_digest
    JOIN outreach_message_versions message_version ON message_version.id=item.message_version_id
      AND message_version.workspace_id=item.workspace_id AND message_version.artifact_digest=message_approval.artifact_digest
    JOIN outreach_package_approvals package_approval ON package_approval.id=message_approval.package_approval_id
      AND package_approval.workspace_id=item.workspace_id
    JOIN outreach_package_versions package_version ON package_version.id=message_version.package_version_id
      AND package_version.workspace_id=item.workspace_id AND package_version.artifact_digest=package_approval.artifact_digest
    JOIN outreach_pre_call_recheck_receipts receipt ON receipt.id=NEW.pre_call_receipt_id
      AND receipt.workspace_id=item.workspace_id AND receipt.outbox_item_id=item.id
    JOIN outreach_recipient_dispatch_authorities recipient_authority ON recipient_authority.id=receipt.recipient_authority_id
      AND recipient_authority.workspace_id=item.workspace_id AND recipient_authority.message_version_id=message_version.id
      AND recipient_authority.message_artifact_digest=message_version.artifact_digest
      AND recipient_authority.package_approval_id=package_approval.id
      AND recipient_authority.package_approval_digest=package_approval.approval_digest
      AND recipient_authority.acknowledgement_digest=message_approval.acknowledgement_digest
    WHERE preparation.id=NEW.preparation_id AND preparation.workspace_id=NEW.workspace_id
      AND message_approval.expires_at>NEW.created_at AND package_approval.expires_at>NEW.created_at
      AND (message_version.intended_send_at IS NULL OR message_version.intended_send_at<=NEW.created_at)
      AND recipient_authority.owner_subject=preparation.owner_subject AND recipient_authority.valid_until>NEW.created_at
      AND NOT EXISTS (SELECT 1 FROM outreach_approval_revocations revoked
        WHERE revoked.workspace_id=item.workspace_id AND revoked.message_approval_id=message_approval.id
          AND revoked.effective_at<=NEW.created_at)
      AND NOT EXISTS (SELECT 1 FROM outreach_approval_revocations revoked
        WHERE revoked.workspace_id=item.workspace_id AND revoked.package_approval_id=package_approval.id
          AND revoked.effective_at<=NEW.created_at)
  );
  SELECT RAISE(ABORT, 'invalid outreach dispatch repreparation') WHERE NOT EXISTS (
    SELECT 1 FROM outreach_dispatch_attempt_preparations preparation
    JOIN outreach_outbox_items item ON item.id=preparation.outbox_item_id AND item.workspace_id=preparation.workspace_id
    JOIN outreach_pre_call_recheck_receipts receipt ON receipt.id=NEW.pre_call_receipt_id
      AND receipt.workspace_id=item.workspace_id AND receipt.outbox_item_id=item.id
    JOIN outreach_recipient_dispatch_authorities recipient_authority ON recipient_authority.id=receipt.recipient_authority_id
      AND recipient_authority.workspace_id=item.workspace_id
    JOIN outreach_unsubscribe_authority_events unsubscribe ON unsubscribe.id=receipt.unsubscribe_event_id
      AND unsubscribe.workspace_id=item.workspace_id AND unsubscribe.recipient_authority_id=recipient_authority.id
    JOIN outreach_sender_connections sender_connection ON sender_connection.id=item.sender_connection_id
      AND sender_connection.workspace_id=item.workspace_id
    JOIN outreach_sender_capability_snapshots sender_capability ON sender_capability.id=receipt.sender_capability_id
      AND sender_capability.workspace_id=item.workspace_id AND sender_capability.sender_connection_id=sender_connection.id
      AND sender_capability.connection_subject_digest=sender_connection.connection_subject_digest
    JOIN outreach_sender_verified_addresses sender_address ON sender_address.id=receipt.sender_verified_address_id
      AND sender_address.workspace_id=item.workspace_id AND sender_address.sender_capability_id=sender_capability.id
      AND sender_address.address_digest=recipient_authority.sender_address_digest
    JOIN contact_point_observations observation ON observation.id=recipient_authority.email_observation_id
      AND observation.workspace_id=item.workspace_id AND observation.contact_id=recipient_authority.contact_id
    JOIN sources basis_source ON basis_source.id=recipient_authority.basis_source_id AND basis_source.workspace_id=item.workspace_id
    WHERE preparation.id=NEW.preparation_id AND preparation.workspace_id=NEW.workspace_id
      AND unsubscribe.status='working' AND unsubscribe.valid_until>NEW.created_at
      AND unsubscribe.id=(SELECT latest.id FROM outreach_unsubscribe_authority_events latest
        WHERE latest.workspace_id=item.workspace_id AND latest.recipient_authority_id=recipient_authority.id
        ORDER BY latest.revision DESC LIMIT 1)
      AND sender_connection.provider='gmail' AND sender_connection.status='active'
      AND sender_capability.expires_at>NEW.created_at AND sender_address.expires_at>NEW.created_at
      AND json_array_length(sender_capability.granted_scopes_json)=2
      AND EXISTS (SELECT 1 FROM json_each(sender_capability.granted_scopes_json) scope
        WHERE scope.value='https://www.googleapis.com/auth/gmail.send')
      AND EXISTS (SELECT 1 FROM json_each(sender_capability.granted_scopes_json) scope
        WHERE scope.value='https://www.googleapis.com/auth/gmail.readonly')
      AND basis_source.source_digest=recipient_authority.basis_source_digest AND basis_source.status='available'
      AND observation.contact_point_digest=recipient_authority.recipient_address_digest
      AND ((observation.verification_class='mailbox_verified' AND observation.method='mailbox_verification'
            AND observation.verified_at+2592000000>NEW.created_at)
        OR (observation.verification_class='source_verified' AND observation.method='authoritative_source_reconfirmed'
            AND observation.verified_at+7776000000>NEW.created_at))
  );
  SELECT RAISE(ABORT, 'invalid outreach dispatch repreparation') WHERE NOT EXISTS (
    SELECT 1 FROM outreach_dispatch_attempt_preparations preparation
    JOIN outreach_outbox_items item ON item.id=preparation.outbox_item_id AND item.workspace_id=preparation.workspace_id
    JOIN outreach_message_versions message_version ON message_version.id=item.message_version_id AND message_version.workspace_id=item.workspace_id
    JOIN outreach_package_versions package_version ON package_version.id=message_version.package_version_id AND package_version.workspace_id=item.workspace_id
    JOIN outreach_packages package ON package.id=package_version.package_id AND package.workspace_id=item.workspace_id
    JOIN profile_prospects prospect ON prospect.id=package.prospect_id AND prospect.workspace_id=item.workspace_id
    JOIN contacts contact ON contact.id=package.contact_id AND contact.workspace_id=item.workspace_id
    JOIN typed_configurations configuration ON configuration.id=package_version.configuration_id AND configuration.workspace_id=item.workspace_id
    JOIN outreach_pre_call_recheck_receipts receipt ON receipt.id=NEW.pre_call_receipt_id
      AND receipt.workspace_id=item.workspace_id AND receipt.outbox_item_id=item.id
    JOIN outreach_recipient_dispatch_authorities recipient_authority ON recipient_authority.id=receipt.recipient_authority_id
      AND recipient_authority.workspace_id=item.workspace_id
    JOIN contact_point_observations observation ON observation.id=recipient_authority.email_observation_id AND observation.workspace_id=item.workspace_id
    JOIN sources basis_source ON basis_source.id=recipient_authority.basis_source_id AND basis_source.workspace_id=item.workspace_id
    WHERE preparation.id=NEW.preparation_id AND preparation.workspace_id=NEW.workspace_id
      AND EXISTS (SELECT 1 FROM outreach_artifact_bindings binding
        WHERE binding.workspace_id=item.workspace_id AND binding.artifact_kind='package_version'
          AND binding.artifact_id=package_version.id AND binding.binding_kind='source'
          AND binding.binding_id=basis_source.id AND binding.binding_digest=basis_source.source_digest)
      AND EXISTS (SELECT 1 FROM outreach_artifact_bindings binding
        WHERE binding.workspace_id=item.workspace_id AND binding.artifact_kind='package_version'
          AND binding.artifact_id=package_version.id AND binding.binding_kind='contact_observation'
          AND binding.binding_id=observation.id AND binding.binding_digest=observation.observation_digest)
      AND NOT EXISTS (SELECT 1 FROM outreach_artifact_bindings binding
        LEFT JOIN sources bound_source ON bound_source.id=binding.binding_id AND bound_source.workspace_id=binding.workspace_id
        WHERE binding.workspace_id=item.workspace_id AND binding.artifact_kind='package_version'
          AND binding.artifact_id=package_version.id AND binding.binding_kind='source'
          AND (bound_source.id IS NULL OR bound_source.status<>'available' OR bound_source.source_digest<>binding.binding_digest))
      AND NOT EXISTS (SELECT 1 FROM outreach_artifact_bindings binding
        LEFT JOIN knowledge_versions guardrail ON guardrail.id=binding.binding_id AND guardrail.workspace_id=binding.workspace_id
        WHERE binding.workspace_id=item.workspace_id AND binding.artifact_kind='package_version'
          AND binding.artifact_id=package_version.id AND binding.binding_kind='claim_guardrail'
          AND (guardrail.id IS NULL OR guardrail.status<>'confirmed' OR guardrail.value_digest<>binding.binding_digest))
      AND EXISTS (SELECT 1 FROM contact_evidence_assignments assignment
        JOIN contact_verification_receipts verification_receipt ON verification_receipt.id=observation.verification_receipt_id
          AND verification_receipt.workspace_id=item.workspace_id AND verification_receipt.observation_id=observation.id
          AND verification_receipt.receipt_digest IS NOT NULL AND verification_receipt.attestation_key_id IS NOT NULL
        WHERE assignment.id=observation.assignment_id AND assignment.workspace_id=item.workspace_id
          AND assignment.prospect_id=prospect.id AND assignment.contact_id=contact.id
          AND assignment.configuration_id=configuration.id AND assignment.configuration_digest=configuration.digest)
  );
  SELECT RAISE(ABORT, 'invalid outreach dispatch repreparation') WHERE NOT EXISTS (
    SELECT 1 FROM outreach_dispatch_attempt_preparations preparation
    JOIN outreach_outbox_items item ON item.id=preparation.outbox_item_id AND item.workspace_id=preparation.workspace_id
    JOIN outreach_message_versions message_version ON message_version.id=item.message_version_id AND message_version.workspace_id=item.workspace_id
    JOIN outreach_package_versions package_version ON package_version.id=message_version.package_version_id AND package_version.workspace_id=item.workspace_id
    JOIN outreach_packages package ON package.id=package_version.package_id AND package.workspace_id=item.workspace_id
    JOIN profile_prospects prospect ON prospect.id=package.prospect_id AND prospect.workspace_id=item.workspace_id
    JOIN customer_profiles profile ON profile.id=package.profile_id AND profile.workspace_id=item.workspace_id
    JOIN market_plays play ON play.id=profile.play_id AND play.workspace_id=item.workspace_id
    JOIN products product ON product.id=play.product_id AND product.workspace_id=item.workspace_id
    JOIN companies company ON company.id=product.company_id AND company.workspace_id=item.workspace_id
    JOIN contacts contact ON contact.id=package.contact_id AND contact.workspace_id=item.workspace_id AND contact.company_id=company.id
    JOIN typed_configurations configuration ON configuration.id=package_version.configuration_id AND configuration.workspace_id=item.workspace_id
    JOIN outreach_pre_call_recheck_receipts receipt ON receipt.id=NEW.pre_call_receipt_id
      AND receipt.workspace_id=item.workspace_id AND receipt.outbox_item_id=item.id
    JOIN contact_eligibility_snapshots eligibility ON eligibility.id=receipt.contact_eligibility_snapshot_id AND eligibility.workspace_id=item.workspace_id
    JOIN outreach_recipient_dispatch_authorities recipient_authority ON recipient_authority.id=receipt.recipient_authority_id
      AND recipient_authority.workspace_id=item.workspace_id
    JOIN contact_point_observations observation ON observation.id=recipient_authority.email_observation_id AND observation.workspace_id=item.workspace_id
    JOIN outreach_sender_connections sender_connection ON sender_connection.id=item.sender_connection_id AND sender_connection.workspace_id=item.workspace_id
    WHERE preparation.id=NEW.preparation_id AND preparation.workspace_id=NEW.workspace_id
      AND prospect.state='approved' AND prospect.active=1 AND prospect.revision=package_version.prospect_revision
      AND contact.revision=package_version.contact_revision
      AND profile.lifecycle='ready' AND play.lifecycle='active' AND product.lifecycle='ready' AND company.status='active'
      AND configuration.active=1 AND configuration.digest=package_version.configuration_digest
      AND configuration.revision=package_version.configuration_revision
      AND eligibility.id=package_version.contact_eligibility_snapshot_id
      AND eligibility.state='ContactReady' AND eligibility.eligible=1
      AND eligibility.configuration_id=configuration.id AND eligibility.configuration_digest=configuration.digest
      AND eligibility.configuration_revision=configuration.revision
      AND eligibility.prospect_id=prospect.id AND eligibility.prospect_revision=prospect.revision
      AND json_array_length(eligibility.preserved_suppression_refs_json)=0
      AND EXISTS (SELECT 1 FROM json_each(eligibility.observation_ids_json) selected WHERE selected.value=observation.id)
      AND NOT EXISTS (SELECT 1 FROM outreach_message_versions later
        WHERE later.workspace_id=item.workspace_id AND later.message_id=message_version.message_id AND later.version>message_version.version)
      AND NOT EXISTS (SELECT 1 FROM outreach_package_versions later
        WHERE later.workspace_id=item.workspace_id AND later.package_id=package_version.package_id AND later.version>package_version.version)
      AND NOT EXISTS (SELECT 1 FROM contact_eligibility_snapshots later
        WHERE later.workspace_id=item.workspace_id AND later.prospect_id=eligibility.prospect_id
          AND later.contact_id=eligibility.contact_id AND later.id<>eligibility.id AND later.projected_at>=eligibility.projected_at)
      AND NOT EXISTS (SELECT 1 FROM contact_point_observations later
        WHERE later.workspace_id=item.workspace_id AND later.contact_id=observation.contact_id
          AND later.contact_point_digest=observation.contact_point_digest AND later.id<>observation.id
          AND later.observed_at>=observation.observed_at)
      AND NOT EXISTS (SELECT 1 FROM outreach_sender_connections later
        WHERE later.workspace_id=item.workspace_id AND later.provider=sender_connection.provider
          AND later.connection_subject_digest=sender_connection.connection_subject_digest
          AND later.protected_reference_version>sender_connection.protected_reference_version)
      AND NOT EXISTS (SELECT 1 FROM knowledge_drifts drift WHERE drift.workspace_id=item.workspace_id AND drift.status<>'resolved')
  );
  SELECT RAISE(ABORT, 'invalid outreach dispatch repreparation') WHERE EXISTS (
    SELECT 1 FROM outreach_dispatch_attempt_preparations preparation
    JOIN outreach_outbox_items item ON item.id=preparation.outbox_item_id AND item.workspace_id=preparation.workspace_id
    JOIN outreach_message_versions message_version ON message_version.id=item.message_version_id AND message_version.workspace_id=item.workspace_id
    JOIN outreach_package_versions package_version ON package_version.id=message_version.package_version_id AND package_version.workspace_id=item.workspace_id
    JOIN outreach_packages package ON package.id=package_version.package_id AND package.workspace_id=item.workspace_id
    JOIN contacts contact ON contact.id=package.contact_id AND contact.workspace_id=item.workspace_id
    WHERE preparation.id=NEW.preparation_id AND preparation.workspace_id=NEW.workspace_id AND (
      EXISTS (SELECT 1 FROM outreach_suppression_tombstones suppression
        WHERE suppression.workspace_id=item.workspace_id AND suppression.effective_at<=NEW.created_at AND (
          suppression.subject_kind IN ('company','organization','confirmed_email_domain')
          OR (suppression.subject_kind='contact' AND (
            suppression.subject_digest=contact.identity_digest
            OR EXISTS (SELECT 1 FROM json_each(suppression.alias_snapshot_json) alias WHERE alias.value=contact.identity_digest)))
          OR (suppression.subject_kind='exact_email' AND EXISTS (
            SELECT 1 FROM outreach_artifact_bindings binding
            JOIN contact_point_observations observation ON observation.id=binding.binding_id
            WHERE binding.workspace_id=item.workspace_id AND binding.artifact_kind='package_version'
              AND binding.artifact_id=package_version.id AND binding.binding_kind='contact_observation'
              AND observation.kind='email' AND (suppression.subject_digest=observation.contact_point_digest
                OR EXISTS (SELECT 1 FROM json_each(suppression.alias_snapshot_json) alias
                  WHERE alias.value=observation.contact_point_digest))))))
      OR EXISTS (SELECT 1 FROM outreach_stop_events stop
        WHERE stop.workspace_id=item.workspace_id AND stop.effective_at<=NEW.created_at AND (
          stop.subject_kind IN ('company','organization','confirmed_email_domain')
          OR (stop.subject_kind='contact' AND stop.subject_digest=contact.identity_digest)
          OR EXISTS (SELECT 1 FROM outreach_artifact_bindings binding
            JOIN contact_point_observations observation ON observation.id=binding.binding_id
            WHERE binding.workspace_id=item.workspace_id AND binding.artifact_kind='package_version'
              AND binding.artifact_id=package_version.id AND binding.binding_kind='contact_observation'
              AND observation.kind='email' AND observation.contact_point_digest=stop.subject_digest)))
    )
  );
END;
--> statement-breakpoint
CREATE TRIGGER immutable_outreach_dispatch_attempt_preparation_events_update BEFORE UPDATE ON outreach_dispatch_attempt_preparation_events BEGIN SELECT RAISE(ABORT, 'immutable outreach dispatch attempt preparation event'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_outreach_dispatch_attempt_preparation_events_delete BEFORE DELETE ON outreach_dispatch_attempt_preparation_events BEGIN SELECT RAISE(ABORT, 'immutable outreach dispatch attempt preparation event'); END;
