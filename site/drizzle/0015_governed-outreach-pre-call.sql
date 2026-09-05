CREATE TABLE `outreach_pre_call_recheck_receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`owner_subject` text NOT NULL,
	`outbox_item_id` text NOT NULL,
	`lease_event_id` text NOT NULL,
	`lease_revision` integer NOT NULL,
	`lease_generation` integer NOT NULL,
	`lease_holder_id` text NOT NULL,
	`lease_expires_at` integer NOT NULL,
	`recipient_authority_id` text NOT NULL,
	`unsubscribe_event_id` text NOT NULL,
	`sender_capability_id` text NOT NULL,
	`sender_verified_address_id` text NOT NULL,
	`contact_eligibility_snapshot_id` text NOT NULL,
	`current_material_digest` text NOT NULL,
	`receipt_digest` text NOT NULL,
	`valid_until` integer NOT NULL,
	`provider_invocation_authorized` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`outbox_item_id`) REFERENCES `outreach_outbox_items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`lease_event_id`) REFERENCES `outreach_outbox_events`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recipient_authority_id`) REFERENCES `outreach_recipient_dispatch_authorities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`unsubscribe_event_id`) REFERENCES `outreach_unsubscribe_authority_events`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`sender_capability_id`) REFERENCES `outreach_sender_capability_snapshots`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`sender_verified_address_id`) REFERENCES `outreach_sender_verified_addresses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`contact_eligibility_snapshot_id`) REFERENCES `contact_eligibility_snapshots`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "outreach_pre_call_receipt_fence_check" CHECK("outreach_pre_call_recheck_receipts"."lease_revision" > 1 and "outreach_pre_call_recheck_receipts"."lease_generation" > 0 and "outreach_pre_call_recheck_receipts"."valid_until" > "outreach_pre_call_recheck_receipts"."created_at" and "outreach_pre_call_recheck_receipts"."valid_until" <= "outreach_pre_call_recheck_receipts"."lease_expires_at"),
	CONSTRAINT "outreach_pre_call_receipt_digest_check" CHECK(length("outreach_pre_call_recheck_receipts"."current_material_digest") = 64 and "outreach_pre_call_recheck_receipts"."current_material_digest" not glob '*[^0-9a-f]*' and length("outreach_pre_call_recheck_receipts"."receipt_digest") = 64 and "outreach_pre_call_recheck_receipts"."receipt_digest" not glob '*[^0-9a-f]*'),
	CONSTRAINT "outreach_pre_call_receipt_no_provider_authority" CHECK("outreach_pre_call_recheck_receipts"."provider_invocation_authorized" = 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `outreach_pre_call_receipt_lease_event_unique` ON `outreach_pre_call_recheck_receipts` (`lease_event_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `outreach_pre_call_receipt_generation_unique` ON `outreach_pre_call_recheck_receipts` (`outbox_item_id`,`lease_generation`);--> statement-breakpoint
CREATE UNIQUE INDEX `outreach_pre_call_receipt_digest_unique` ON `outreach_pre_call_recheck_receipts` (`workspace_id`,`receipt_digest`);--> statement-breakpoint
CREATE INDEX `outreach_pre_call_receipt_expiry_idx` ON `outreach_pre_call_recheck_receipts` (`workspace_id`,`valid_until`);
--> statement-breakpoint
CREATE TRIGGER outreach_pre_call_receipt_scope_guard BEFORE INSERT ON outreach_pre_call_recheck_receipts BEGIN
  SELECT RAISE(ABORT, 'invalid outreach pre-call receipt') WHERE
    NEW.provider_invocation_authorized<>0
    OR NEW.owner_subject='' OR length(NEW.owner_subject)>256
    OR NEW.lease_revision<=1 OR NEW.lease_generation<=0
    OR NEW.created_at<=0 OR NEW.valid_until<=NEW.created_at OR NEW.valid_until>NEW.lease_expires_at;
  SELECT RAISE(ABORT, 'invalid outreach pre-call receipt') WHERE NOT EXISTS (
    SELECT 1
    FROM outreach_outbox_items item
    JOIN outreach_outbox_events lease_event ON lease_event.id=NEW.lease_event_id
      AND lease_event.workspace_id=item.workspace_id AND lease_event.outbox_item_id=item.id
    JOIN outreach_message_approval_consumptions consumption ON consumption.id=item.approval_consumption_id
      AND consumption.workspace_id=item.workspace_id AND consumption.message_approval_id=item.message_approval_id
      AND consumption.send_key=item.send_key
    JOIN outreach_message_approvals message_approval ON message_approval.id=item.message_approval_id
      AND message_approval.workspace_id=item.workspace_id AND message_approval.message_version_id=item.message_version_id
      AND message_approval.approval_digest=consumption.approval_digest
    JOIN outreach_message_versions message_version ON message_version.id=item.message_version_id
      AND message_version.workspace_id=item.workspace_id AND message_version.artifact_digest=message_approval.artifact_digest
    JOIN outreach_package_approvals package_approval ON package_approval.id=message_approval.package_approval_id
      AND package_approval.workspace_id=item.workspace_id
    JOIN outreach_package_versions package_version ON package_version.id=message_version.package_version_id
      AND package_version.workspace_id=item.workspace_id AND package_version.artifact_digest=package_approval.artifact_digest
    JOIN outreach_recipient_dispatch_authorities recipient_authority ON recipient_authority.id=NEW.recipient_authority_id
      AND recipient_authority.workspace_id=item.workspace_id AND recipient_authority.message_version_id=message_version.id
      AND recipient_authority.package_approval_id=package_approval.id
      AND recipient_authority.message_artifact_digest=message_version.artifact_digest
      AND recipient_authority.package_approval_digest=package_approval.approval_digest
      AND recipient_authority.acknowledgement_digest=message_approval.acknowledgement_digest
    JOIN workspaces workspace ON workspace.id=item.workspace_id AND workspace.owner_subject=NEW.owner_subject
    WHERE item.id=NEW.outbox_item_id AND item.workspace_id=NEW.workspace_id
      AND lease_event.revision=NEW.lease_revision AND lease_event.state='leased'
      AND lease_event.lease_generation=NEW.lease_generation AND lease_event.lease_holder_id=NEW.lease_holder_id
      AND lease_event.lease_expires_at=NEW.lease_expires_at AND lease_event.created_at<=NEW.created_at
      AND lease_event.lease_expires_at>NEW.created_at
      AND lease_event.id=(SELECT latest.id FROM outreach_outbox_events latest
        WHERE latest.workspace_id=item.workspace_id AND latest.outbox_item_id=item.id
        ORDER BY latest.revision DESC LIMIT 1)
      AND message_approval.owner_subject=NEW.owner_subject
      AND message_approval.expires_at>NEW.created_at AND package_approval.expires_at>NEW.created_at
      AND (message_version.intended_send_at IS NULL OR message_version.intended_send_at<=NEW.created_at)
      AND recipient_authority.owner_subject=NEW.owner_subject AND recipient_authority.valid_until>NEW.created_at
  );
  SELECT RAISE(ABORT, 'invalid outreach pre-call receipt') WHERE NOT EXISTS (
    SELECT 1
    FROM outreach_outbox_items item
    JOIN outreach_outbox_events lease_event ON lease_event.id=NEW.lease_event_id AND lease_event.workspace_id=item.workspace_id
    JOIN outreach_message_approvals message_approval ON message_approval.id=item.message_approval_id AND message_approval.workspace_id=item.workspace_id
    JOIN outreach_message_versions message_version ON message_version.id=item.message_version_id AND message_version.workspace_id=item.workspace_id
    JOIN outreach_package_approvals package_approval ON package_approval.id=message_approval.package_approval_id AND package_approval.workspace_id=item.workspace_id
    JOIN outreach_recipient_dispatch_authorities recipient_authority ON recipient_authority.id=NEW.recipient_authority_id AND recipient_authority.workspace_id=item.workspace_id
    JOIN contact_point_observations observation ON observation.id=recipient_authority.email_observation_id AND observation.workspace_id=item.workspace_id
    JOIN sources basis_source ON basis_source.id=recipient_authority.basis_source_id AND basis_source.workspace_id=item.workspace_id
    JOIN outreach_unsubscribe_authority_events unsubscribe ON unsubscribe.id=NEW.unsubscribe_event_id
      AND unsubscribe.workspace_id=item.workspace_id AND unsubscribe.recipient_authority_id=recipient_authority.id
    JOIN outreach_sender_connections sender_connection ON sender_connection.id=item.sender_connection_id AND sender_connection.workspace_id=item.workspace_id
    JOIN outreach_sender_capability_snapshots sender_capability ON sender_capability.id=NEW.sender_capability_id
      AND sender_capability.workspace_id=item.workspace_id AND sender_capability.sender_connection_id=sender_connection.id
      AND sender_capability.connection_subject_digest=sender_connection.connection_subject_digest
    JOIN outreach_sender_verified_addresses sender_address ON sender_address.id=NEW.sender_verified_address_id
      AND sender_address.workspace_id=item.workspace_id AND sender_address.sender_capability_id=sender_capability.id
      AND sender_address.address_digest=recipient_authority.sender_address_digest
    WHERE item.id=NEW.outbox_item_id AND item.workspace_id=NEW.workspace_id
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
      AND observation.contact_id=recipient_authority.contact_id
      AND observation.contact_point_digest=recipient_authority.recipient_address_digest
      AND ((observation.verification_class='mailbox_verified' AND observation.method='mailbox_verification'
            AND observation.verified_at+2592000000>NEW.created_at)
        OR (observation.verification_class='source_verified' AND observation.method='authoritative_source_reconfirmed'
            AND observation.verified_at+7776000000>NEW.created_at))
      AND NEW.valid_until=min(
        lease_event.lease_expires_at,message_approval.expires_at,package_approval.expires_at,
        recipient_authority.valid_until,unsubscribe.valid_until,sender_capability.expires_at,
        sender_address.expires_at,
        CASE observation.verification_class WHEN 'mailbox_verified' THEN observation.verified_at+2592000000
          ELSE observation.verified_at+7776000000 END
      )
  );
  SELECT RAISE(ABORT, 'invalid outreach pre-call receipt') WHERE NOT EXISTS (
    SELECT 1
    FROM outreach_outbox_items item
    JOIN outreach_message_versions message_version ON message_version.id=item.message_version_id AND message_version.workspace_id=item.workspace_id
    JOIN outreach_package_versions package_version ON package_version.id=message_version.package_version_id AND package_version.workspace_id=item.workspace_id
    JOIN outreach_packages package ON package.id=package_version.package_id AND package.workspace_id=item.workspace_id
    JOIN profile_prospects prospect ON prospect.id=package.prospect_id AND prospect.workspace_id=item.workspace_id
    JOIN contacts contact ON contact.id=package.contact_id AND contact.workspace_id=item.workspace_id
    JOIN typed_configurations configuration ON configuration.id=package_version.configuration_id AND configuration.workspace_id=item.workspace_id
    JOIN outreach_recipient_dispatch_authorities recipient_authority ON recipient_authority.id=NEW.recipient_authority_id AND recipient_authority.workspace_id=item.workspace_id
    JOIN contact_point_observations observation ON observation.id=recipient_authority.email_observation_id AND observation.workspace_id=item.workspace_id
    JOIN sources basis_source ON basis_source.id=recipient_authority.basis_source_id AND basis_source.workspace_id=item.workspace_id
    WHERE item.id=NEW.outbox_item_id AND item.workspace_id=NEW.workspace_id
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
  SELECT RAISE(ABORT, 'invalid outreach pre-call receipt') WHERE NOT EXISTS (
    SELECT 1
    FROM outreach_outbox_items item
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
    JOIN contact_eligibility_snapshots eligibility ON eligibility.id=NEW.contact_eligibility_snapshot_id AND eligibility.workspace_id=item.workspace_id
    JOIN outreach_recipient_dispatch_authorities recipient_authority ON recipient_authority.id=NEW.recipient_authority_id AND recipient_authority.workspace_id=item.workspace_id
    JOIN contact_point_observations observation ON observation.id=recipient_authority.email_observation_id AND observation.workspace_id=item.workspace_id
    JOIN outreach_sender_connections sender_connection ON sender_connection.id=item.sender_connection_id AND sender_connection.workspace_id=item.workspace_id
    WHERE item.id=NEW.outbox_item_id AND item.workspace_id=NEW.workspace_id
      AND prospect.state='approved' AND prospect.active=1 AND prospect.revision=package_version.prospect_revision
      AND contact.revision=package_version.contact_revision
      AND profile.lifecycle='ready' AND play.lifecycle='active' AND product.lifecycle='ready' AND company.status='active'
      AND configuration.active=1 AND configuration.digest=package_version.configuration_digest
      AND configuration.revision=package_version.configuration_revision
      AND eligibility.id=package_version.contact_eligibility_snapshot_id AND eligibility.state='ContactReady' AND eligibility.eligible=1
      AND eligibility.configuration_id=configuration.id
      AND eligibility.configuration_digest=configuration.digest AND eligibility.configuration_revision=configuration.revision
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
      AND NOT EXISTS (SELECT 1 FROM outreach_approval_revocations revoked
        JOIN outreach_message_approvals approval ON approval.id=item.message_approval_id AND approval.workspace_id=item.workspace_id
        WHERE revoked.workspace_id=item.workspace_id AND revoked.message_approval_id=approval.id AND revoked.effective_at<=NEW.created_at)
      AND NOT EXISTS (SELECT 1 FROM outreach_approval_revocations revoked
        JOIN outreach_message_approvals message_approval ON message_approval.id=item.message_approval_id AND message_approval.workspace_id=item.workspace_id
        WHERE revoked.workspace_id=item.workspace_id AND revoked.package_approval_id=message_approval.package_approval_id
          AND revoked.effective_at<=NEW.created_at)
  );
  SELECT RAISE(ABORT, 'invalid outreach pre-call receipt') WHERE EXISTS (
    SELECT 1
    FROM outreach_outbox_items item
    JOIN outreach_message_versions message_version ON message_version.id=item.message_version_id AND message_version.workspace_id=item.workspace_id
    JOIN outreach_package_versions package_version ON package_version.id=message_version.package_version_id AND package_version.workspace_id=item.workspace_id
    JOIN outreach_packages package ON package.id=package_version.package_id AND package.workspace_id=item.workspace_id
    JOIN contacts contact ON contact.id=package.contact_id AND contact.workspace_id=item.workspace_id
    WHERE item.id=NEW.outbox_item_id AND item.workspace_id=NEW.workspace_id AND (
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
CREATE TRIGGER immutable_outreach_pre_call_receipts_update BEFORE UPDATE ON outreach_pre_call_recheck_receipts BEGIN SELECT RAISE(ABORT, 'immutable outreach pre-call receipt'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_outreach_pre_call_receipts_delete BEFORE DELETE ON outreach_pre_call_recheck_receipts BEGIN SELECT RAISE(ABORT, 'immutable outreach pre-call receipt'); END;
--> statement-breakpoint
DROP TRIGGER outreach_outbox_event_scope_guard;
--> statement-breakpoint
CREATE TRIGGER outreach_outbox_event_scope_guard BEFORE INSERT ON outreach_outbox_events BEGIN
  SELECT RAISE(ABORT, 'invalid outreach outbox event') WHERE
    NEW.state NOT IN ('pending','leased','dispatching','sent','cancelled','failed_before_dispatch','delivery_unknown')
    OR length(NEW.reason_code)<1 OR length(NEW.reason_code)>64
    OR NOT EXISTS (SELECT 1 FROM outreach_outbox_items item WHERE item.id=NEW.outbox_item_id AND item.workspace_id=NEW.workspace_id)
    OR (NEW.revision=1 AND (NEW.state<>'pending' OR NEW.lease_generation<>0 OR NEW.lease_holder_id IS NOT NULL OR NEW.lease_expires_at IS NOT NULL))
    OR (NEW.revision>1 AND NOT EXISTS (
      SELECT 1 FROM outreach_outbox_events prior
      WHERE prior.outbox_item_id=NEW.outbox_item_id AND prior.workspace_id=NEW.workspace_id
        AND prior.revision=NEW.revision-1 AND NEW.created_at>=prior.created_at
        AND (
          (prior.state='pending' AND NEW.state='leased' AND NEW.lease_generation=prior.lease_generation+1
            AND NEW.lease_holder_id IS NOT NULL AND NEW.lease_expires_at>NEW.created_at)
          OR (prior.state='leased' AND NEW.state='leased' AND prior.lease_expires_at<=NEW.created_at
            AND NEW.lease_generation=prior.lease_generation+1 AND NEW.lease_holder_id IS NOT NULL
            AND NEW.lease_expires_at>NEW.created_at)
          OR (prior.state='failed_before_dispatch' AND NEW.state='leased'
            AND NEW.lease_generation=prior.lease_generation+1 AND NEW.lease_holder_id IS NOT NULL
            AND NEW.lease_expires_at>NEW.created_at
            AND NOT EXISTS (SELECT 1 FROM outreach_outbox_events unsafe_history
              WHERE unsafe_history.workspace_id=prior.workspace_id
                AND unsafe_history.outbox_item_id=prior.outbox_item_id
                AND unsafe_history.state IN ('dispatching','sent','delivery_unknown')))
          OR (prior.state='pending' AND NEW.state='cancelled' AND NEW.lease_generation=0
            AND NEW.lease_holder_id IS NULL AND NEW.lease_expires_at IS NULL)
          OR (prior.state='leased' AND NEW.state IN ('cancelled','failed_before_dispatch')
            AND NEW.lease_generation=prior.lease_generation AND NEW.lease_holder_id=prior.lease_holder_id
            AND NEW.lease_expires_at=prior.lease_expires_at AND NEW.created_at<prior.lease_expires_at)
        )
    ));
END;
