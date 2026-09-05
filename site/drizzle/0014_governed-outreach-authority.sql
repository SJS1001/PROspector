CREATE TABLE `outreach_approval_revocations` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`package_approval_id` text,
	`message_approval_id` text,
	`approval_digest` text NOT NULL,
	`actor_subject` text NOT NULL,
	`reason_code` text NOT NULL,
	`source_event_digest` text NOT NULL,
	`revocation_digest` text NOT NULL,
	`effective_at` integer NOT NULL,
	`command_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`package_approval_id`) REFERENCES `outreach_package_approvals`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`message_approval_id`) REFERENCES `outreach_message_approvals`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`command_id`) REFERENCES `outreach_commands`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "outreach_approval_revocation_target_check" CHECK(("outreach_approval_revocations"."package_approval_id" is not null and "outreach_approval_revocations"."message_approval_id" is null) or ("outreach_approval_revocations"."package_approval_id" is null and "outreach_approval_revocations"."message_approval_id" is not null)),
	CONSTRAINT "outreach_approval_revocation_time_check" CHECK("outreach_approval_revocations"."effective_at" = "outreach_approval_revocations"."created_at"),
	CONSTRAINT "outreach_approval_revocation_digest_check" CHECK(length("outreach_approval_revocations"."approval_digest") = 64 and "outreach_approval_revocations"."approval_digest" not glob '*[^0-9a-f]*' and length("outreach_approval_revocations"."source_event_digest") = 64 and "outreach_approval_revocations"."source_event_digest" not glob '*[^0-9a-f]*' and length("outreach_approval_revocations"."revocation_digest") = 64 and "outreach_approval_revocations"."revocation_digest" not glob '*[^0-9a-f]*')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `outreach_package_approval_revocation_unique` ON `outreach_approval_revocations` (`package_approval_id`) WHERE "outreach_approval_revocations"."package_approval_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX `outreach_message_approval_revocation_unique` ON `outreach_approval_revocations` (`message_approval_id`) WHERE "outreach_approval_revocations"."message_approval_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX `outreach_approval_revocation_digest_unique` ON `outreach_approval_revocations` (`workspace_id`,`revocation_digest`);--> statement-breakpoint
CREATE UNIQUE INDEX `outreach_approval_revocation_command_unique` ON `outreach_approval_revocations` (`command_id`);--> statement-breakpoint
CREATE TABLE `outreach_recipient_dispatch_authorities` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`message_version_id` text NOT NULL,
	`message_artifact_digest` text NOT NULL,
	`package_approval_id` text NOT NULL,
	`package_approval_digest` text NOT NULL,
	`contact_id` text NOT NULL,
	`email_observation_id` text NOT NULL,
	`recipient_address_digest` text NOT NULL,
	`sender_address_digest` text NOT NULL,
	`jurisdiction_code` text NOT NULL,
	`claimed_basis_code` text NOT NULL,
	`basis_source_id` text NOT NULL,
	`basis_source_digest` text NOT NULL,
	`advisory_policy_version` text NOT NULL,
	`advisory_policy_digest` text NOT NULL,
	`acknowledgement_digest` text NOT NULL,
	`unsubscribe_token_digest` text NOT NULL,
	`unsubscribe_path_digest` text NOT NULL,
	`unsubscribe_scope_kind` text NOT NULL,
	`unsubscribe_scope_digest` text NOT NULL,
	`owner_subject` text NOT NULL,
	`acknowledged_at` integer NOT NULL,
	`authority_digest` text NOT NULL,
	`valid_until` integer NOT NULL,
	`command_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`message_version_id`) REFERENCES `outreach_message_versions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`package_approval_id`) REFERENCES `outreach_package_approvals`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`email_observation_id`) REFERENCES `contact_point_observations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`basis_source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`command_id`) REFERENCES `outreach_commands`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "outreach_recipient_authority_time_check" CHECK("outreach_recipient_dispatch_authorities"."acknowledged_at" <= "outreach_recipient_dispatch_authorities"."created_at" and "outreach_recipient_dispatch_authorities"."valid_until" > "outreach_recipient_dispatch_authorities"."created_at"),
	CONSTRAINT "outreach_recipient_authority_digest_check" CHECK(length("outreach_recipient_dispatch_authorities"."message_artifact_digest") = 64 and "outreach_recipient_dispatch_authorities"."message_artifact_digest" not glob '*[^0-9a-f]*' and length("outreach_recipient_dispatch_authorities"."package_approval_digest") = 64 and "outreach_recipient_dispatch_authorities"."package_approval_digest" not glob '*[^0-9a-f]*' and length("outreach_recipient_dispatch_authorities"."recipient_address_digest") = 64 and "outreach_recipient_dispatch_authorities"."recipient_address_digest" not glob '*[^0-9a-f]*' and length("outreach_recipient_dispatch_authorities"."sender_address_digest") = 64 and "outreach_recipient_dispatch_authorities"."sender_address_digest" not glob '*[^0-9a-f]*' and length("outreach_recipient_dispatch_authorities"."basis_source_digest") = 64 and "outreach_recipient_dispatch_authorities"."basis_source_digest" not glob '*[^0-9a-f]*' and length("outreach_recipient_dispatch_authorities"."advisory_policy_digest") = 64 and "outreach_recipient_dispatch_authorities"."advisory_policy_digest" not glob '*[^0-9a-f]*' and length("outreach_recipient_dispatch_authorities"."acknowledgement_digest") = 64 and "outreach_recipient_dispatch_authorities"."acknowledgement_digest" not glob '*[^0-9a-f]*' and length("outreach_recipient_dispatch_authorities"."unsubscribe_token_digest") = 64 and "outreach_recipient_dispatch_authorities"."unsubscribe_token_digest" not glob '*[^0-9a-f]*' and length("outreach_recipient_dispatch_authorities"."unsubscribe_path_digest") = 64 and "outreach_recipient_dispatch_authorities"."unsubscribe_path_digest" not glob '*[^0-9a-f]*' and length("outreach_recipient_dispatch_authorities"."unsubscribe_scope_digest") = 64 and "outreach_recipient_dispatch_authorities"."unsubscribe_scope_digest" not glob '*[^0-9a-f]*' and length("outreach_recipient_dispatch_authorities"."authority_digest") = 64 and "outreach_recipient_dispatch_authorities"."authority_digest" not glob '*[^0-9a-f]*')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `outreach_recipient_authority_message_unique` ON `outreach_recipient_dispatch_authorities` (`message_version_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `outreach_recipient_authority_digest_unique` ON `outreach_recipient_dispatch_authorities` (`workspace_id`,`authority_digest`);--> statement-breakpoint
CREATE UNIQUE INDEX `outreach_recipient_authority_command_unique` ON `outreach_recipient_dispatch_authorities` (`command_id`);--> statement-breakpoint
CREATE TABLE `outreach_sender_capability_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`sender_connection_id` text NOT NULL,
	`connection_subject_digest` text NOT NULL,
	`canonical_address_digest` text NOT NULL,
	`granted_scopes_json` text NOT NULL,
	`verified_addresses_json` text NOT NULL,
	`scope_set_digest` text NOT NULL,
	`capability_digest` text NOT NULL,
	`verified_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`command_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`sender_connection_id`) REFERENCES `outreach_sender_connections`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`command_id`) REFERENCES `outreach_commands`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "outreach_sender_capability_time_check" CHECK("outreach_sender_capability_snapshots"."verified_at" <= "outreach_sender_capability_snapshots"."created_at" and "outreach_sender_capability_snapshots"."expires_at" > "outreach_sender_capability_snapshots"."created_at"),
	CONSTRAINT "outreach_sender_capability_digest_check" CHECK(length("outreach_sender_capability_snapshots"."connection_subject_digest") = 64 and "outreach_sender_capability_snapshots"."connection_subject_digest" not glob '*[^0-9a-f]*' and length("outreach_sender_capability_snapshots"."canonical_address_digest") = 64 and "outreach_sender_capability_snapshots"."canonical_address_digest" not glob '*[^0-9a-f]*' and length("outreach_sender_capability_snapshots"."scope_set_digest") = 64 and "outreach_sender_capability_snapshots"."scope_set_digest" not glob '*[^0-9a-f]*' and length("outreach_sender_capability_snapshots"."capability_digest") = 64 and "outreach_sender_capability_snapshots"."capability_digest" not glob '*[^0-9a-f]*')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `outreach_sender_capability_connection_unique` ON `outreach_sender_capability_snapshots` (`sender_connection_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `outreach_sender_capability_digest_unique` ON `outreach_sender_capability_snapshots` (`workspace_id`,`capability_digest`);--> statement-breakpoint
CREATE UNIQUE INDEX `outreach_sender_capability_command_unique` ON `outreach_sender_capability_snapshots` (`command_id`);--> statement-breakpoint
CREATE TABLE `outreach_sender_verified_addresses` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`sender_capability_id` text NOT NULL,
	`address_digest` text NOT NULL,
	`address_kind` text NOT NULL,
	`verification_digest` text NOT NULL,
	`verified_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`sender_capability_id`) REFERENCES `outreach_sender_capability_snapshots`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "outreach_sender_verified_address_time_check" CHECK("outreach_sender_verified_addresses"."verified_at" <= "outreach_sender_verified_addresses"."created_at" and "outreach_sender_verified_addresses"."expires_at" > "outreach_sender_verified_addresses"."created_at"),
	CONSTRAINT "outreach_sender_verified_address_digest_check" CHECK(length("outreach_sender_verified_addresses"."address_digest") = 64 and "outreach_sender_verified_addresses"."address_digest" not glob '*[^0-9a-f]*' and length("outreach_sender_verified_addresses"."verification_digest") = 64 and "outreach_sender_verified_addresses"."verification_digest" not glob '*[^0-9a-f]*')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `outreach_sender_verified_address_unique` ON `outreach_sender_verified_addresses` (`sender_capability_id`,`address_digest`);--> statement-breakpoint
CREATE TABLE `outreach_unsubscribe_authority_events` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`recipient_authority_id` text NOT NULL,
	`revision` integer NOT NULL,
	`status` text NOT NULL,
	`check_digest` text NOT NULL,
	`event_digest` text NOT NULL,
	`observed_at` integer NOT NULL,
	`valid_until` integer,
	`command_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recipient_authority_id`) REFERENCES `outreach_recipient_dispatch_authorities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`command_id`) REFERENCES `outreach_commands`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "outreach_unsubscribe_event_revision_check" CHECK("outreach_unsubscribe_authority_events"."revision" > 0 and "outreach_unsubscribe_authority_events"."observed_at" <= "outreach_unsubscribe_authority_events"."created_at"),
	CONSTRAINT "outreach_unsubscribe_event_validity_check" CHECK(("outreach_unsubscribe_authority_events"."status" = 'working' and "outreach_unsubscribe_authority_events"."valid_until" is not null and "outreach_unsubscribe_authority_events"."valid_until" > "outreach_unsubscribe_authority_events"."observed_at") or ("outreach_unsubscribe_authority_events"."status" <> 'working' and "outreach_unsubscribe_authority_events"."valid_until" is null)),
	CONSTRAINT "outreach_unsubscribe_event_digest_check" CHECK(length("outreach_unsubscribe_authority_events"."check_digest") = 64 and "outreach_unsubscribe_authority_events"."check_digest" not glob '*[^0-9a-f]*' and length("outreach_unsubscribe_authority_events"."event_digest") = 64 and "outreach_unsubscribe_authority_events"."event_digest" not glob '*[^0-9a-f]*')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `outreach_unsubscribe_event_revision_unique` ON `outreach_unsubscribe_authority_events` (`recipient_authority_id`,`revision`);--> statement-breakpoint
CREATE UNIQUE INDEX `outreach_unsubscribe_event_digest_unique` ON `outreach_unsubscribe_authority_events` (`workspace_id`,`event_digest`);--> statement-breakpoint
CREATE UNIQUE INDEX `outreach_unsubscribe_event_command_unique` ON `outreach_unsubscribe_authority_events` (`command_id`);
--> statement-breakpoint
DROP TRIGGER outreach_command_scope_guard;
--> statement-breakpoint
CREATE TRIGGER outreach_command_scope_guard BEFORE INSERT ON outreach_commands BEGIN
  SELECT RAISE(ABORT, 'invalid outreach command') WHERE
    NEW.command_kind NOT IN (
      'package_version.create','message_version.create','package.approve','message.approve','suppression.record',
      'recipient_dispatch_authority.record','unsubscribe_authority_event.record','sender_capability.record','approval.revoke'
    )
    OR NEW.result_kind NOT IN (
      'package_version','message_version','package_approval','message_approval','suppression_tombstone',
      'recipient_dispatch_authority','unsubscribe_authority_event','sender_capability_snapshot','approval_revocation'
    )
    OR (NEW.command_kind='package_version.create' AND NEW.result_kind<>'package_version')
    OR (NEW.command_kind='message_version.create' AND NEW.result_kind<>'message_version')
    OR (NEW.command_kind='package.approve' AND NEW.result_kind<>'package_approval')
    OR (NEW.command_kind='message.approve' AND NEW.result_kind<>'message_approval')
    OR (NEW.command_kind='suppression.record' AND NEW.result_kind<>'suppression_tombstone')
    OR (NEW.command_kind='recipient_dispatch_authority.record' AND NEW.result_kind<>'recipient_dispatch_authority')
    OR (NEW.command_kind='unsubscribe_authority_event.record' AND NEW.result_kind<>'unsubscribe_authority_event')
    OR (NEW.command_kind='sender_capability.record' AND NEW.result_kind<>'sender_capability_snapshot')
    OR (NEW.command_kind='approval.revoke' AND NEW.result_kind<>'approval_revocation')
    OR NOT EXISTS (SELECT 1 FROM workspaces w WHERE w.id=NEW.workspace_id AND w.owner_subject=NEW.owner_subject);
END;
--> statement-breakpoint
DROP TRIGGER outreach_audit_scope_guard;
--> statement-breakpoint
CREATE TRIGGER outreach_audit_scope_guard BEFORE INSERT ON outreach_audit_records BEGIN
  SELECT RAISE(ABORT, 'invalid outreach audit record') WHERE
    NEW.action NOT IN (
      'package.version.created','message.version.created','package.approved','message.approved','suppression.recorded',
      'recipient_dispatch_authority.recorded','unsubscribe_authority_event.recorded','sender_capability.recorded','approval.revoked'
    )
    OR NEW.subject_kind NOT IN (
      'package_version','message_version','package_approval','message_approval','suppression_tombstone',
      'recipient_dispatch_authority','unsubscribe_authority_event','sender_capability_snapshot','approval_revocation'
    )
    OR NEW.outcome<>'recorded' OR length(NEW.reason_code)<1 OR length(NEW.reason_code)>64
    OR NOT EXISTS (
      SELECT 1 FROM outreach_commands cmd WHERE cmd.id=NEW.command_id AND cmd.workspace_id=NEW.workspace_id
        AND cmd.owner_subject=NEW.actor_subject AND cmd.result_kind=NEW.subject_kind AND cmd.result_id=NEW.subject_id
    )
    OR (NEW.action='sender_capability.recorded' AND NOT EXISTS (
      SELECT 1 FROM outreach_sender_capability_snapshots capability
      JOIN outreach_sender_verified_addresses address ON address.sender_capability_id=capability.id
        AND address.workspace_id=capability.workspace_id AND address.address_kind='canonical'
        AND address.address_digest=capability.canonical_address_digest
      WHERE capability.id=NEW.subject_id AND capability.workspace_id=NEW.workspace_id
        AND (SELECT count(*) FROM outreach_sender_verified_addresses child
          WHERE child.sender_capability_id=capability.id AND child.workspace_id=capability.workspace_id)
          =json_array_length(capability.verified_addresses_json)
        AND NOT EXISTS (SELECT 1 FROM json_each(capability.verified_addresses_json) manifest
          WHERE NOT EXISTS (SELECT 1 FROM outreach_sender_verified_addresses child
            WHERE child.sender_capability_id=capability.id AND child.workspace_id=capability.workspace_id
              AND child.address_digest=json_extract(manifest.value,'$.addressDigest')
              AND child.address_kind=json_extract(manifest.value,'$.kind')
              AND child.verification_digest=json_extract(manifest.value,'$.verificationDigest')))
    ));
END;
--> statement-breakpoint
CREATE TRIGGER outreach_recipient_dispatch_authority_scope_guard BEFORE INSERT ON outreach_recipient_dispatch_authorities BEGIN
  SELECT RAISE(ABORT, 'invalid outreach recipient dispatch authority') WHERE
    NEW.claimed_basis_code NOT IN ('consent','legitimate_interest','existing_relationship','other_documented')
    OR NEW.unsubscribe_scope_kind<>'exact_email'
    OR length(NEW.jurisdiction_code)<2 OR length(NEW.jurisdiction_code)>64 OR trim(NEW.jurisdiction_code)<>NEW.jurisdiction_code
    OR length(NEW.advisory_policy_version)<1 OR length(NEW.advisory_policy_version)>128
    OR NOT EXISTS (
      SELECT 1 FROM outreach_message_versions mv
      JOIN outreach_messages message ON message.id=mv.message_id AND message.workspace_id=mv.workspace_id
      JOIN outreach_package_versions pv ON pv.id=mv.package_version_id AND pv.workspace_id=mv.workspace_id
      JOIN outreach_packages package ON package.id=pv.package_id AND package.workspace_id=pv.workspace_id AND package.id=message.package_id
      JOIN outreach_package_approvals pa ON pa.id=NEW.package_approval_id AND pa.workspace_id=mv.workspace_id
        AND pa.package_version_id=pv.id AND pa.artifact_digest=pv.artifact_digest AND pa.approval_digest=NEW.package_approval_digest
      JOIN contacts contact ON contact.id=NEW.contact_id AND contact.workspace_id=mv.workspace_id AND contact.id=package.contact_id
      JOIN contact_point_observations observation ON observation.id=NEW.email_observation_id AND observation.workspace_id=mv.workspace_id
        AND observation.contact_id=contact.id AND observation.kind='email'
        AND observation.contact_point_digest=NEW.recipient_address_digest
      JOIN contact_evidence_assignments assignment ON assignment.id=observation.assignment_id AND assignment.workspace_id=mv.workspace_id
        AND assignment.prospect_id=package.prospect_id AND assignment.contact_id=contact.id
        AND assignment.configuration_id=pv.configuration_id AND assignment.configuration_digest=pv.configuration_digest
      JOIN contact_verification_receipts receipt ON receipt.id=observation.verification_receipt_id AND receipt.workspace_id=mv.workspace_id
        AND receipt.observation_id=observation.id AND receipt.receipt_digest IS NOT NULL AND receipt.attestation_key_id IS NOT NULL
      JOIN contact_eligibility_snapshots eligibility ON eligibility.id=pv.contact_eligibility_snapshot_id AND eligibility.workspace_id=pv.workspace_id
        AND eligibility.contact_id=contact.id AND eligibility.prospect_id=package.prospect_id
        AND eligibility.configuration_id=pv.configuration_id AND eligibility.configuration_digest=pv.configuration_digest
      JOIN sources basis_source ON basis_source.id=NEW.basis_source_id AND basis_source.workspace_id=mv.workspace_id
        AND basis_source.source_digest=NEW.basis_source_digest AND basis_source.status='available'
      JOIN outreach_commands command ON command.id=NEW.command_id AND command.workspace_id=mv.workspace_id
        AND command.owner_subject=NEW.owner_subject AND command.command_kind='recipient_dispatch_authority.record'
        AND command.result_kind='recipient_dispatch_authority' AND command.result_id=NEW.id
      JOIN workspaces workspace ON workspace.id=mv.workspace_id AND workspace.owner_subject=NEW.owner_subject
      WHERE mv.id=NEW.message_version_id AND mv.workspace_id=NEW.workspace_id
        AND mv.artifact_digest=NEW.message_artifact_digest
        AND mv.unsubscribe_token_digest=NEW.unsubscribe_token_digest
        AND NEW.unsubscribe_scope_digest=NEW.recipient_address_digest
        AND observation.verified_at<=NEW.created_at
        AND ((observation.verification_class='mailbox_verified' AND observation.method='mailbox_verification'
              AND observation.verified_at+2592000000>NEW.created_at AND NEW.valid_until<=observation.verified_at+2592000000)
          OR (observation.verification_class='source_verified' AND observation.method='authoritative_source_reconfirmed'
              AND observation.verified_at+7776000000>NEW.created_at AND NEW.valid_until<=observation.verified_at+7776000000))
        AND json_array_length(json_extract(mv.snapshot_json,'$.to'))=1
        AND json_array_length(json_extract(mv.snapshot_json,'$.cc'))=0
        AND json_array_length(json_extract(mv.snapshot_json,'$.bcc'))=0
        AND EXISTS (
          SELECT 1 FROM outreach_artifact_bindings binding
          WHERE binding.workspace_id=mv.workspace_id AND binding.artifact_kind='package_version'
            AND binding.artifact_id=pv.id AND binding.binding_kind='contact_observation'
            AND binding.binding_id=observation.id AND binding.binding_digest=observation.observation_digest
        )
        AND EXISTS (
          SELECT 1 FROM outreach_artifact_bindings binding
          WHERE binding.workspace_id=mv.workspace_id AND binding.artifact_kind='package_version'
            AND binding.artifact_id=pv.id AND binding.binding_kind='source'
            AND binding.binding_id=basis_source.id AND binding.binding_digest=basis_source.source_digest
        )
        AND eligibility.state='ContactReady' AND eligibility.eligible=1
        AND eligibility.configuration_revision=pv.configuration_revision AND eligibility.prospect_revision=pv.prospect_revision
        AND json_array_length(eligibility.preserved_suppression_refs_json)=0
        AND EXISTS (SELECT 1 FROM json_each(eligibility.observation_ids_json) selected WHERE selected.value=observation.id)
        AND NOT EXISTS (
          SELECT 1 FROM contact_eligibility_snapshots later
          WHERE later.workspace_id=eligibility.workspace_id AND later.prospect_id=eligibility.prospect_id
            AND later.contact_id=eligibility.contact_id AND later.id<>eligibility.id AND later.projected_at>=eligibility.projected_at
        )
        AND NOT EXISTS (
          SELECT 1 FROM contact_point_observations later
          WHERE later.workspace_id=observation.workspace_id AND later.contact_id=observation.contact_id
            AND later.contact_point_digest=observation.contact_point_digest AND later.id<>observation.id
            AND later.observed_at>=observation.observed_at
        )
        AND pa.expires_at>=NEW.valid_until AND NEW.acknowledged_at>=mv.created_at
        AND NOT EXISTS (SELECT 1 FROM outreach_message_versions later WHERE later.message_id=mv.message_id AND later.version>mv.version)
        AND NOT EXISTS (SELECT 1 FROM outreach_approval_revocations revoked WHERE revoked.workspace_id=mv.workspace_id AND revoked.package_approval_id=pa.id AND revoked.effective_at<=NEW.created_at)
    );
END;
--> statement-breakpoint
CREATE TRIGGER outreach_unsubscribe_authority_event_scope_guard BEFORE INSERT ON outreach_unsubscribe_authority_events BEGIN
  SELECT RAISE(ABORT, 'invalid outreach unsubscribe authority event') WHERE
    NEW.status NOT IN ('working','failed','revoked')
    OR NOT EXISTS (
      SELECT 1 FROM outreach_recipient_dispatch_authorities authority
      JOIN outreach_commands command ON command.id=NEW.command_id AND command.workspace_id=authority.workspace_id
        AND command.owner_subject=authority.owner_subject AND command.command_kind='unsubscribe_authority_event.record'
        AND command.result_kind='unsubscribe_authority_event' AND command.result_id=NEW.id
      WHERE authority.id=NEW.recipient_authority_id AND authority.workspace_id=NEW.workspace_id
        AND NEW.observed_at>=authority.created_at AND NEW.created_at>=NEW.observed_at
        AND (
          (NEW.revision=1 AND NEW.status='working')
          OR (NEW.revision>1 AND EXISTS (
            SELECT 1 FROM outreach_unsubscribe_authority_events prior
            WHERE prior.recipient_authority_id=authority.id AND prior.workspace_id=authority.workspace_id
              AND prior.revision=NEW.revision-1 AND NEW.observed_at>=prior.observed_at
              AND ((prior.status='working' AND NEW.status IN ('working','failed','revoked'))
                OR (prior.status='failed' AND NEW.status IN ('working','failed','revoked')))
          ))
        )
    );
END;
--> statement-breakpoint
CREATE TRIGGER outreach_sender_capability_scope_guard BEFORE INSERT ON outreach_sender_capability_snapshots BEGIN
  SELECT RAISE(ABORT, 'invalid outreach sender capability') WHERE
    json_valid(NEW.granted_scopes_json)<>1 OR json_type(NEW.granted_scopes_json)<>'array'
    OR json_array_length(NEW.granted_scopes_json)<>2
    OR EXISTS (SELECT 1 FROM json_each(NEW.granted_scopes_json) scope WHERE scope.type<>'text' OR length(scope.value)<1 OR length(scope.value)>256)
    OR NOT EXISTS (SELECT 1 FROM json_each(NEW.granted_scopes_json) scope WHERE scope.value='https://www.googleapis.com/auth/gmail.readonly')
    OR NOT EXISTS (SELECT 1 FROM json_each(NEW.granted_scopes_json) scope WHERE scope.value='https://www.googleapis.com/auth/gmail.send')
    OR json_valid(NEW.verified_addresses_json)<>1 OR json_type(NEW.verified_addresses_json)<>'array'
    OR json_array_length(NEW.verified_addresses_json)<1 OR json_array_length(NEW.verified_addresses_json)>32
    OR json_array_length(NEW.verified_addresses_json)<>(SELECT count(DISTINCT json_extract(address.value,'$.addressDigest')) FROM json_each(NEW.verified_addresses_json) address)
    OR EXISTS (SELECT 1 FROM json_each(NEW.verified_addresses_json) address
      WHERE json_type(address.value)<>'object'
        OR json_extract(address.value,'$.kind') NOT IN ('canonical','alias')
        OR length(json_extract(address.value,'$.addressDigest'))<>64
        OR json_extract(address.value,'$.addressDigest') glob '*[^0-9a-f]*'
        OR length(json_extract(address.value,'$.verificationDigest'))<>64
        OR json_extract(address.value,'$.verificationDigest') glob '*[^0-9a-f]*')
    OR NOT EXISTS (SELECT 1 FROM json_each(NEW.verified_addresses_json) address
      WHERE json_extract(address.value,'$.kind')='canonical'
        AND json_extract(address.value,'$.addressDigest')=NEW.canonical_address_digest)
    OR NOT EXISTS (
      SELECT 1 FROM outreach_sender_connections connection
      JOIN outreach_commands command ON command.id=NEW.command_id AND command.workspace_id=connection.workspace_id
        AND command.command_kind='sender_capability.record' AND command.result_kind='sender_capability_snapshot' AND command.result_id=NEW.id
      JOIN workspaces workspace ON workspace.id=connection.workspace_id AND workspace.owner_subject=command.owner_subject
      WHERE connection.id=NEW.sender_connection_id AND connection.workspace_id=NEW.workspace_id
        AND connection.status='active' AND connection.connection_subject_digest=NEW.connection_subject_digest
        AND connection.sender_address_digest=NEW.canonical_address_digest
        AND NOT EXISTS (SELECT 1 FROM outreach_sender_connections later WHERE later.workspace_id=connection.workspace_id AND later.provider=connection.provider AND later.connection_subject_digest=connection.connection_subject_digest AND later.protected_reference_version>connection.protected_reference_version)
    );
END;
--> statement-breakpoint
CREATE TRIGGER outreach_sender_verified_address_scope_guard BEFORE INSERT ON outreach_sender_verified_addresses BEGIN
  SELECT RAISE(ABORT, 'invalid outreach verified sender address') WHERE
    NEW.address_kind NOT IN ('canonical','alias')
    OR EXISTS (
      SELECT 1 FROM outreach_audit_records audit
      WHERE audit.workspace_id=NEW.workspace_id AND audit.subject_kind='sender_capability_snapshot'
        AND audit.subject_id=NEW.sender_capability_id AND audit.action='sender_capability.recorded'
    )
    OR NOT EXISTS (
      SELECT 1 FROM outreach_sender_capability_snapshots capability
      WHERE capability.id=NEW.sender_capability_id AND capability.workspace_id=NEW.workspace_id
        AND NEW.verified_at>=capability.verified_at AND NEW.expires_at<=capability.expires_at
        AND (NEW.address_kind<>'canonical' OR NEW.address_digest=capability.canonical_address_digest)
        AND EXISTS (SELECT 1 FROM json_each(capability.verified_addresses_json) manifest
          WHERE json_extract(manifest.value,'$.addressDigest')=NEW.address_digest
            AND json_extract(manifest.value,'$.kind')=NEW.address_kind
            AND json_extract(manifest.value,'$.verificationDigest')=NEW.verification_digest)
    );
END;
--> statement-breakpoint
CREATE TRIGGER outreach_approval_revocation_scope_guard BEFORE INSERT ON outreach_approval_revocations BEGIN
  SELECT RAISE(ABORT, 'invalid outreach approval revocation') WHERE
    length(NEW.reason_code)<1 OR length(NEW.reason_code)>64
    OR NOT EXISTS (
      SELECT 1 FROM outreach_commands command
      JOIN workspaces workspace ON workspace.id=command.workspace_id AND workspace.owner_subject=NEW.actor_subject
      WHERE command.id=NEW.command_id AND command.workspace_id=NEW.workspace_id
        AND command.command_kind='approval.revoke' AND command.result_kind='approval_revocation' AND command.result_id=NEW.id
    )
    OR NOT (
      (NEW.package_approval_id IS NOT NULL AND NEW.message_approval_id IS NULL AND EXISTS (
        SELECT 1 FROM outreach_package_approvals approval
        WHERE approval.id=NEW.package_approval_id AND approval.workspace_id=NEW.workspace_id
          AND approval.approval_digest=NEW.approval_digest AND approval.owner_subject=NEW.actor_subject
          AND NEW.effective_at>=approval.created_at
      ))
      OR (NEW.package_approval_id IS NULL AND NEW.message_approval_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM outreach_message_approvals approval
        WHERE approval.id=NEW.message_approval_id AND approval.workspace_id=NEW.workspace_id
          AND approval.approval_digest=NEW.approval_digest AND approval.owner_subject=NEW.actor_subject
          AND NEW.effective_at>=approval.created_at
      ))
    );
END;
--> statement-breakpoint
CREATE TRIGGER outreach_message_approval_delivery_authority_guard BEFORE INSERT ON outreach_message_approvals BEGIN
  SELECT RAISE(ABORT, 'missing outreach delivery authority') WHERE NOT EXISTS (
    SELECT 1 FROM outreach_recipient_dispatch_authorities authority
    JOIN outreach_unsubscribe_authority_events unsubscribe ON unsubscribe.recipient_authority_id=authority.id AND unsubscribe.workspace_id=authority.workspace_id
    WHERE authority.workspace_id=NEW.workspace_id AND authority.message_version_id=NEW.message_version_id
      AND authority.message_artifact_digest=NEW.artifact_digest AND authority.package_approval_id=NEW.package_approval_id
      AND authority.owner_subject=NEW.owner_subject AND authority.acknowledgement_digest=NEW.acknowledgement_digest
      AND authority.valid_until>=NEW.expires_at
      AND unsubscribe.id=(SELECT latest.id FROM outreach_unsubscribe_authority_events latest WHERE latest.recipient_authority_id=authority.id AND latest.workspace_id=authority.workspace_id ORDER BY latest.revision DESC LIMIT 1)
      AND unsubscribe.status='working' AND unsubscribe.valid_until>=NEW.expires_at
      AND EXISTS (
        SELECT 1 FROM outreach_message_versions mv
        JOIN outreach_package_versions pv ON pv.id=mv.package_version_id AND pv.workspace_id=mv.workspace_id
        JOIN outreach_artifact_bindings binding ON binding.workspace_id=pv.workspace_id
          AND binding.artifact_kind='package_version' AND binding.artifact_id=pv.id AND binding.binding_kind='source'
          AND binding.binding_id=authority.basis_source_id AND binding.binding_digest=authority.basis_source_digest
        JOIN sources basis_source ON basis_source.id=binding.binding_id AND basis_source.workspace_id=binding.workspace_id
          AND basis_source.source_digest=binding.binding_digest AND basis_source.status='available'
        JOIN contact_point_observations observation ON observation.id=authority.email_observation_id
          AND observation.workspace_id=authority.workspace_id AND observation.contact_id=authority.contact_id
        WHERE mv.id=authority.message_version_id AND mv.workspace_id=authority.workspace_id
          AND observation.observation_digest=(SELECT exact_binding.binding_digest FROM outreach_artifact_bindings exact_binding
            WHERE exact_binding.workspace_id=pv.workspace_id AND exact_binding.artifact_kind='package_version'
              AND exact_binding.artifact_id=pv.id AND exact_binding.binding_kind='contact_observation'
              AND exact_binding.binding_id=observation.id LIMIT 1)
          AND NOT EXISTS (SELECT 1 FROM contact_point_observations later WHERE later.workspace_id=observation.workspace_id
            AND later.contact_id=observation.contact_id AND later.contact_point_digest=observation.contact_point_digest
            AND later.id<>observation.id AND later.observed_at>=observation.observed_at)
      )
      AND NOT EXISTS (SELECT 1 FROM outreach_approval_revocations revoked WHERE revoked.workspace_id=NEW.workspace_id AND revoked.package_approval_id=NEW.package_approval_id AND revoked.effective_at<=NEW.created_at)
  );
END;
--> statement-breakpoint
CREATE TRIGGER outreach_outbox_item_delivery_authority_guard BEFORE INSERT ON outreach_outbox_items BEGIN
  SELECT RAISE(ABORT, 'missing current outreach delivery authority') WHERE NOT EXISTS (
    SELECT 1 FROM outreach_message_approvals approval
    JOIN outreach_recipient_dispatch_authorities authority ON authority.message_version_id=approval.message_version_id AND authority.workspace_id=approval.workspace_id
      AND authority.message_artifact_digest=approval.artifact_digest AND authority.package_approval_id=approval.package_approval_id
      AND authority.owner_subject=approval.owner_subject AND authority.acknowledgement_digest=approval.acknowledgement_digest
    JOIN outreach_unsubscribe_authority_events unsubscribe ON unsubscribe.recipient_authority_id=authority.id AND unsubscribe.workspace_id=authority.workspace_id
    JOIN outreach_sender_capability_snapshots capability ON capability.sender_connection_id=NEW.sender_connection_id AND capability.workspace_id=NEW.workspace_id
    JOIN outreach_sender_verified_addresses address ON address.sender_capability_id=capability.id AND address.workspace_id=capability.workspace_id
      AND address.address_digest=authority.sender_address_digest
    WHERE approval.id=NEW.message_approval_id AND approval.workspace_id=NEW.workspace_id AND approval.message_version_id=NEW.message_version_id
      AND authority.valid_until>NEW.created_at
      AND unsubscribe.id=(SELECT latest.id FROM outreach_unsubscribe_authority_events latest WHERE latest.recipient_authority_id=authority.id AND latest.workspace_id=authority.workspace_id ORDER BY latest.revision DESC LIMIT 1)
      AND unsubscribe.status='working' AND unsubscribe.valid_until>NEW.created_at
      AND capability.expires_at>NEW.created_at AND address.expires_at>NEW.created_at
      AND json_array_length(capability.granted_scopes_json)=2
      AND EXISTS (SELECT 1 FROM json_each(capability.granted_scopes_json) scope WHERE scope.value='https://www.googleapis.com/auth/gmail.send')
      AND EXISTS (SELECT 1 FROM json_each(capability.granted_scopes_json) scope WHERE scope.value='https://www.googleapis.com/auth/gmail.readonly')
      AND EXISTS (
        SELECT 1 FROM outreach_message_versions mv
        JOIN outreach_package_versions pv ON pv.id=mv.package_version_id AND pv.workspace_id=mv.workspace_id
        JOIN outreach_artifact_bindings binding ON binding.workspace_id=pv.workspace_id
          AND binding.artifact_kind='package_version' AND binding.artifact_id=pv.id AND binding.binding_kind='source'
          AND binding.binding_id=authority.basis_source_id AND binding.binding_digest=authority.basis_source_digest
        JOIN sources basis_source ON basis_source.id=binding.binding_id AND basis_source.workspace_id=binding.workspace_id
          AND basis_source.source_digest=binding.binding_digest AND basis_source.status='available'
        JOIN contact_point_observations observation ON observation.id=authority.email_observation_id
          AND observation.workspace_id=authority.workspace_id AND observation.contact_id=authority.contact_id
        WHERE mv.id=authority.message_version_id AND mv.workspace_id=authority.workspace_id
          AND observation.observation_digest=(SELECT exact_binding.binding_digest FROM outreach_artifact_bindings exact_binding
            WHERE exact_binding.workspace_id=pv.workspace_id AND exact_binding.artifact_kind='package_version'
              AND exact_binding.artifact_id=pv.id AND exact_binding.binding_kind='contact_observation'
              AND exact_binding.binding_id=observation.id LIMIT 1)
          AND observation.verified_at<=NEW.created_at
          AND ((observation.verification_class='mailbox_verified' AND observation.method='mailbox_verification' AND observation.verified_at+2592000000>NEW.created_at)
            OR (observation.verification_class='source_verified' AND observation.method='authoritative_source_reconfirmed' AND observation.verified_at+7776000000>NEW.created_at))
          AND NOT EXISTS (SELECT 1 FROM contact_point_observations later WHERE later.workspace_id=observation.workspace_id
            AND later.contact_id=observation.contact_id AND later.contact_point_digest=observation.contact_point_digest
            AND later.id<>observation.id AND later.observed_at>=observation.observed_at)
      )
      AND NOT EXISTS (SELECT 1 FROM outreach_approval_revocations revoked WHERE revoked.workspace_id=approval.workspace_id AND revoked.message_approval_id=approval.id AND revoked.effective_at<=NEW.created_at)
      AND NOT EXISTS (SELECT 1 FROM outreach_approval_revocations revoked WHERE revoked.workspace_id=approval.workspace_id AND revoked.package_approval_id=approval.package_approval_id AND revoked.effective_at<=NEW.created_at)
  );
END;
--> statement-breakpoint
CREATE TRIGGER immutable_outreach_recipient_dispatch_authorities_update BEFORE UPDATE ON outreach_recipient_dispatch_authorities BEGIN SELECT RAISE(ABORT, 'immutable outreach recipient dispatch authority'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_outreach_recipient_dispatch_authorities_delete BEFORE DELETE ON outreach_recipient_dispatch_authorities BEGIN SELECT RAISE(ABORT, 'immutable outreach recipient dispatch authority'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_outreach_unsubscribe_authority_events_update BEFORE UPDATE ON outreach_unsubscribe_authority_events BEGIN SELECT RAISE(ABORT, 'immutable outreach unsubscribe authority event'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_outreach_unsubscribe_authority_events_delete BEFORE DELETE ON outreach_unsubscribe_authority_events BEGIN SELECT RAISE(ABORT, 'immutable outreach unsubscribe authority event'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_outreach_sender_capability_snapshots_update BEFORE UPDATE ON outreach_sender_capability_snapshots BEGIN SELECT RAISE(ABORT, 'immutable outreach sender capability'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_outreach_sender_capability_snapshots_delete BEFORE DELETE ON outreach_sender_capability_snapshots BEGIN SELECT RAISE(ABORT, 'immutable outreach sender capability'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_outreach_sender_verified_addresses_update BEFORE UPDATE ON outreach_sender_verified_addresses BEGIN SELECT RAISE(ABORT, 'immutable outreach verified sender address'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_outreach_sender_verified_addresses_delete BEFORE DELETE ON outreach_sender_verified_addresses BEGIN SELECT RAISE(ABORT, 'immutable outreach verified sender address'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_outreach_approval_revocations_update BEFORE UPDATE ON outreach_approval_revocations BEGIN SELECT RAISE(ABORT, 'immutable outreach approval revocation'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_outreach_approval_revocations_delete BEFORE DELETE ON outreach_approval_revocations BEGIN SELECT RAISE(ABORT, 'immutable outreach approval revocation'); END;
