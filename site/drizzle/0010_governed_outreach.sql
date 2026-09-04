CREATE TABLE `outreach_artifact_bindings` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`artifact_kind` text NOT NULL,
	`artifact_id` text NOT NULL,
	`binding_kind` text NOT NULL,
	`binding_id` text NOT NULL,
	`binding_digest` text NOT NULL,
	`ordinal` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "outreach_artifact_binding_ordinal_check" CHECK("outreach_artifact_bindings"."ordinal" >= 0),
	CONSTRAINT "outreach_artifact_binding_digest_check" CHECK(length("outreach_artifact_bindings"."binding_digest") = 64 and "outreach_artifact_bindings"."binding_digest" not glob '*[^0-9a-f]*')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `outreach_artifact_binding_ordinal_unique` ON `outreach_artifact_bindings` (`artifact_kind`,`artifact_id`,`ordinal`);--> statement-breakpoint
CREATE UNIQUE INDEX `outreach_artifact_binding_identity_unique` ON `outreach_artifact_bindings` (`artifact_kind`,`artifact_id`,`binding_kind`,`binding_id`);--> statement-breakpoint
CREATE INDEX `outreach_artifact_binding_lookup_idx` ON `outreach_artifact_bindings` (`workspace_id`,`artifact_kind`,`artifact_id`);--> statement-breakpoint
CREATE TABLE `outreach_audit_records` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`actor_subject` text NOT NULL,
	`action` text NOT NULL,
	`subject_kind` text NOT NULL,
	`subject_id` text NOT NULL,
	`outcome` text DEFAULT 'recorded' NOT NULL,
	`reason_code` text NOT NULL,
	`material_digest` text NOT NULL,
	`command_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`command_id`) REFERENCES `outreach_commands`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "outreach_audit_digest_check" CHECK(length("outreach_audit_records"."material_digest") = 64 and "outreach_audit_records"."material_digest" not glob '*[^0-9a-f]*')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `outreach_audit_command_unique` ON `outreach_audit_records` (`command_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `outreach_audit_material_unique` ON `outreach_audit_records` (`workspace_id`,`material_digest`);--> statement-breakpoint
CREATE INDEX `outreach_audit_time_idx` ON `outreach_audit_records` (`workspace_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `outreach_commands` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`owner_subject` text NOT NULL,
	`command_kind` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`operation_digest` text NOT NULL,
	`expected_version` integer NOT NULL,
	`result_kind` text NOT NULL,
	`result_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "outreach_command_expected_version_check" CHECK("outreach_commands"."expected_version" >= 0),
	CONSTRAINT "outreach_command_digest_check" CHECK(length("outreach_commands"."operation_digest") = 64 and "outreach_commands"."operation_digest" not glob '*[^0-9a-f]*')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `outreach_command_idempotency_unique` ON `outreach_commands` (`workspace_id`,`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `outreach_command_operation_unique` ON `outreach_commands` (`workspace_id`,`operation_digest`);--> statement-breakpoint
CREATE TABLE `outreach_message_approval_consumptions` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`message_approval_id` text NOT NULL,
	`send_key` text NOT NULL,
	`approval_digest` text NOT NULL,
	`fence_generation` integer NOT NULL,
	`consumed_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`message_approval_id`) REFERENCES `outreach_message_approvals`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "outreach_message_approval_consumption_fence_check" CHECK("outreach_message_approval_consumptions"."fence_generation" > 0),
	CONSTRAINT "outreach_message_approval_consumption_digest_check" CHECK(length("outreach_message_approval_consumptions"."approval_digest") = 64 and "outreach_message_approval_consumptions"."approval_digest" not glob '*[^0-9a-f]*')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `outreach_message_approval_consumption_once_unique` ON `outreach_message_approval_consumptions` (`message_approval_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `outreach_message_approval_consumption_send_key_unique` ON `outreach_message_approval_consumptions` (`workspace_id`,`send_key`);--> statement-breakpoint
CREATE TABLE `outreach_message_approvals` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`message_version_id` text NOT NULL,
	`package_approval_id` text NOT NULL,
	`artifact_digest` text NOT NULL,
	`owner_subject` text NOT NULL,
	`acknowledgement_digest` text NOT NULL,
	`approval_digest` text NOT NULL,
	`expires_at` integer NOT NULL,
	`command_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`message_version_id`) REFERENCES `outreach_message_versions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`package_approval_id`) REFERENCES `outreach_package_approvals`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`command_id`) REFERENCES `outreach_commands`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "outreach_message_approval_expiry_check" CHECK("outreach_message_approvals"."expires_at" > "outreach_message_approvals"."created_at"),
	CONSTRAINT "outreach_message_approval_digest_check" CHECK(length("outreach_message_approvals"."artifact_digest") = 64 and "outreach_message_approvals"."artifact_digest" not glob '*[^0-9a-f]*' and length("outreach_message_approvals"."acknowledgement_digest") = 64 and "outreach_message_approvals"."acknowledgement_digest" not glob '*[^0-9a-f]*' and length("outreach_message_approvals"."approval_digest") = 64 and "outreach_message_approvals"."approval_digest" not glob '*[^0-9a-f]*')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `outreach_message_approval_version_unique` ON `outreach_message_approvals` (`message_version_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `outreach_message_approval_digest_unique` ON `outreach_message_approvals` (`workspace_id`,`approval_digest`);--> statement-breakpoint
CREATE UNIQUE INDEX `outreach_message_approval_command_unique` ON `outreach_message_approvals` (`command_id`);--> statement-breakpoint
CREATE TABLE `outreach_message_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`message_id` text NOT NULL,
	`package_version_id` text NOT NULL,
	`version` integer NOT NULL,
	`snapshot_json` text NOT NULL,
	`artifact_digest` text NOT NULL,
	`intended_send_at` integer,
	`timezone` text NOT NULL,
	`unsubscribe_token_digest` text NOT NULL,
	`command_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`message_id`) REFERENCES `outreach_messages`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`package_version_id`) REFERENCES `outreach_package_versions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`command_id`) REFERENCES `outreach_commands`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "outreach_message_version_number_check" CHECK("outreach_message_versions"."version" > 0),
	CONSTRAINT "outreach_message_version_digest_check" CHECK(length("outreach_message_versions"."artifact_digest") = 64 and "outreach_message_versions"."artifact_digest" not glob '*[^0-9a-f]*' and length("outreach_message_versions"."unsubscribe_token_digest") = 64 and "outreach_message_versions"."unsubscribe_token_digest" not glob '*[^0-9a-f]*')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `outreach_message_version_number_unique` ON `outreach_message_versions` (`message_id`,`version`);--> statement-breakpoint
CREATE UNIQUE INDEX `outreach_message_version_digest_unique` ON `outreach_message_versions` (`workspace_id`,`artifact_digest`);--> statement-breakpoint
CREATE UNIQUE INDEX `outreach_message_version_unsubscribe_unique` ON `outreach_message_versions` (`workspace_id`,`unsubscribe_token_digest`);--> statement-breakpoint
CREATE UNIQUE INDEX `outreach_message_version_command_unique` ON `outreach_message_versions` (`command_id`);--> statement-breakpoint
CREATE INDEX `outreach_message_version_message_idx` ON `outreach_message_versions` (`workspace_id`,`message_id`,`version`);--> statement-breakpoint
CREATE TABLE `outreach_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`package_id` text NOT NULL,
	`channel` text DEFAULT 'email' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`package_id`) REFERENCES `outreach_packages`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `outreach_message_package_idx` ON `outreach_messages` (`workspace_id`,`package_id`);--> statement-breakpoint
CREATE TABLE `outreach_package_approvals` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`package_version_id` text NOT NULL,
	`artifact_digest` text NOT NULL,
	`owner_subject` text NOT NULL,
	`approval_digest` text NOT NULL,
	`expires_at` integer NOT NULL,
	`command_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`package_version_id`) REFERENCES `outreach_package_versions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`command_id`) REFERENCES `outreach_commands`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "outreach_package_approval_expiry_check" CHECK("outreach_package_approvals"."expires_at" > "outreach_package_approvals"."created_at"),
	CONSTRAINT "outreach_package_approval_digest_check" CHECK(length("outreach_package_approvals"."artifact_digest") = 64 and "outreach_package_approvals"."artifact_digest" not glob '*[^0-9a-f]*' and length("outreach_package_approvals"."approval_digest") = 64 and "outreach_package_approvals"."approval_digest" not glob '*[^0-9a-f]*')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `outreach_package_approval_version_unique` ON `outreach_package_approvals` (`package_version_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `outreach_package_approval_digest_unique` ON `outreach_package_approvals` (`workspace_id`,`approval_digest`);--> statement-breakpoint
CREATE UNIQUE INDEX `outreach_package_approval_command_unique` ON `outreach_package_approvals` (`command_id`);--> statement-breakpoint
CREATE TABLE `outreach_package_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`package_id` text NOT NULL,
	`version` integer NOT NULL,
	`configuration_id` text NOT NULL,
	`configuration_digest` text NOT NULL,
	`configuration_revision` integer NOT NULL,
	`prospect_revision` integer NOT NULL,
	`contact_revision` integer NOT NULL,
	`contact_eligibility_snapshot_id` text NOT NULL,
	`snapshot_json` text NOT NULL,
	`artifact_digest` text NOT NULL,
	`call_script_digest` text NOT NULL,
	`command_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`package_id`) REFERENCES `outreach_packages`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`configuration_id`) REFERENCES `typed_configurations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`contact_eligibility_snapshot_id`) REFERENCES `contact_eligibility_snapshots`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`command_id`) REFERENCES `outreach_commands`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "outreach_package_version_revision_check" CHECK("outreach_package_versions"."version" > 0 and "outreach_package_versions"."configuration_revision" > 0 and "outreach_package_versions"."prospect_revision" > 0 and "outreach_package_versions"."contact_revision" > 0),
	CONSTRAINT "outreach_package_version_digest_check" CHECK(length("outreach_package_versions"."configuration_digest") = 64 and "outreach_package_versions"."configuration_digest" not glob '*[^0-9a-f]*' and length("outreach_package_versions"."artifact_digest") = 64 and "outreach_package_versions"."artifact_digest" not glob '*[^0-9a-f]*' and length("outreach_package_versions"."call_script_digest") = 64 and "outreach_package_versions"."call_script_digest" not glob '*[^0-9a-f]*')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `outreach_package_version_number_unique` ON `outreach_package_versions` (`package_id`,`version`);--> statement-breakpoint
CREATE UNIQUE INDEX `outreach_package_version_digest_unique` ON `outreach_package_versions` (`workspace_id`,`artifact_digest`);--> statement-breakpoint
CREATE UNIQUE INDEX `outreach_package_version_command_unique` ON `outreach_package_versions` (`command_id`);--> statement-breakpoint
CREATE INDEX `outreach_package_version_package_idx` ON `outreach_package_versions` (`workspace_id`,`package_id`,`version`);--> statement-breakpoint
CREATE TABLE `outreach_packages` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`prospect_id` text NOT NULL,
	`contact_id` text NOT NULL,
	`profile_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`prospect_id`) REFERENCES `profile_prospects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`profile_id`) REFERENCES `customer_profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `outreach_package_subject_idx` ON `outreach_packages` (`workspace_id`,`prospect_id`,`contact_id`);--> statement-breakpoint
CREATE TABLE `outreach_stop_events` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`stop_kind` text NOT NULL,
	`tombstone_id` text,
	`subject_kind` text NOT NULL,
	`subject_digest` text NOT NULL,
	`source_event_digest` text NOT NULL,
	`reason_code` text NOT NULL,
	`command_id` text NOT NULL,
	`effective_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tombstone_id`) REFERENCES `outreach_suppression_tombstones`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`command_id`) REFERENCES `outreach_commands`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "outreach_stop_time_check" CHECK("outreach_stop_events"."effective_at" <= "outreach_stop_events"."created_at"),
	CONSTRAINT "outreach_stop_digest_check" CHECK(length("outreach_stop_events"."subject_digest") = 64 and "outreach_stop_events"."subject_digest" not glob '*[^0-9a-f]*' and length("outreach_stop_events"."source_event_digest") = 64 and "outreach_stop_events"."source_event_digest" not glob '*[^0-9a-f]*')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `outreach_stop_source_unique` ON `outreach_stop_events` (`workspace_id`,`stop_kind`,`source_event_digest`);--> statement-breakpoint
CREATE INDEX `outreach_stop_subject_idx` ON `outreach_stop_events` (`workspace_id`,`subject_kind`,`subject_digest`,`effective_at`);--> statement-breakpoint
CREATE TABLE `outreach_suppression_tombstones` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`subject_kind` text NOT NULL,
	`subject_digest` text NOT NULL,
	`channel` text NOT NULL,
	`reason` text NOT NULL,
	`source_event_digest` text NOT NULL,
	`alias_snapshot_json` text NOT NULL,
	`alias_snapshot_digest` text NOT NULL,
	`tombstone_digest` text NOT NULL,
	`actor_subject` text NOT NULL,
	`effective_at` integer NOT NULL,
	`command_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`command_id`) REFERENCES `outreach_commands`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "outreach_suppression_time_check" CHECK("outreach_suppression_tombstones"."effective_at" <= "outreach_suppression_tombstones"."created_at"),
	CONSTRAINT "outreach_suppression_digest_check" CHECK(length("outreach_suppression_tombstones"."subject_digest") = 64 and "outreach_suppression_tombstones"."subject_digest" not glob '*[^0-9a-f]*' and length("outreach_suppression_tombstones"."source_event_digest") = 64 and "outreach_suppression_tombstones"."source_event_digest" not glob '*[^0-9a-f]*' and length("outreach_suppression_tombstones"."alias_snapshot_digest") = 64 and "outreach_suppression_tombstones"."alias_snapshot_digest" not glob '*[^0-9a-f]*' and length("outreach_suppression_tombstones"."tombstone_digest") = 64 and "outreach_suppression_tombstones"."tombstone_digest" not glob '*[^0-9a-f]*')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `outreach_suppression_subject_unique` ON `outreach_suppression_tombstones` (`workspace_id`,`subject_kind`,`subject_digest`,`channel`);--> statement-breakpoint
CREATE UNIQUE INDEX `outreach_suppression_tombstone_digest_unique` ON `outreach_suppression_tombstones` (`workspace_id`,`tombstone_digest`);--> statement-breakpoint
CREATE UNIQUE INDEX `outreach_suppression_command_unique` ON `outreach_suppression_tombstones` (`command_id`);--> statement-breakpoint
CREATE INDEX `outreach_suppression_effective_idx` ON `outreach_suppression_tombstones` (`workspace_id`,`effective_at`);
--> statement-breakpoint
CREATE TRIGGER outreach_command_scope_guard BEFORE INSERT ON outreach_commands BEGIN
  SELECT RAISE(ABORT, 'invalid outreach command') WHERE
    NEW.command_kind NOT IN ('package_version.create','message_version.create','package.approve','message.approve','suppression.record')
    OR NEW.result_kind NOT IN ('package_version','message_version','package_approval','message_approval','suppression_tombstone')
    OR (NEW.command_kind='package_version.create' AND NEW.result_kind<>'package_version')
    OR (NEW.command_kind='message_version.create' AND NEW.result_kind<>'message_version')
    OR (NEW.command_kind='package.approve' AND NEW.result_kind<>'package_approval')
    OR (NEW.command_kind='message.approve' AND NEW.result_kind<>'message_approval')
    OR (NEW.command_kind='suppression.record' AND NEW.result_kind<>'suppression_tombstone')
    OR NOT EXISTS (SELECT 1 FROM workspaces w WHERE w.id=NEW.workspace_id AND w.owner_subject=NEW.owner_subject);
END;
--> statement-breakpoint
CREATE TRIGGER outreach_package_scope_guard BEFORE INSERT ON outreach_packages BEGIN
  SELECT RAISE(ABORT, 'invalid outreach package scope') WHERE NOT EXISTS (
    SELECT 1 FROM profile_prospects p
    JOIN customer_profiles cp ON cp.id=p.profile_id AND cp.workspace_id=p.workspace_id
    JOIN contacts c ON c.id=NEW.contact_id AND c.workspace_id=p.workspace_id
    WHERE p.id=NEW.prospect_id AND p.workspace_id=NEW.workspace_id
      AND p.profile_id=NEW.profile_id AND p.state='approved' AND p.active=1
  );
END;
--> statement-breakpoint
CREATE TRIGGER outreach_package_version_scope_guard BEFORE INSERT ON outreach_package_versions BEGIN
  SELECT RAISE(ABORT, 'invalid outreach package version') WHERE NOT EXISTS (
    SELECT 1 FROM outreach_packages op
    JOIN profile_prospects p ON p.id=op.prospect_id AND p.workspace_id=op.workspace_id
    JOIN contacts c ON c.id=op.contact_id AND c.workspace_id=op.workspace_id
    JOIN typed_configurations cfg ON cfg.id=NEW.configuration_id AND cfg.workspace_id=op.workspace_id
      AND cfg.owner_type='profile' AND cfg.owner_id=op.profile_id AND cfg.kind='profile_effective' AND cfg.active=1
    JOIN contact_eligibility_snapshots ces ON ces.id=NEW.contact_eligibility_snapshot_id AND ces.workspace_id=op.workspace_id
      AND ces.prospect_id=op.prospect_id AND ces.contact_id=op.contact_id AND ces.configuration_id=cfg.id
    JOIN outreach_commands cmd ON cmd.id=NEW.command_id AND cmd.workspace_id=op.workspace_id
      AND cmd.command_kind='package_version.create' AND cmd.result_kind='package_version' AND cmd.result_id=NEW.id
    WHERE op.id=NEW.package_id AND op.workspace_id=NEW.workspace_id
      AND p.revision=NEW.prospect_revision AND c.revision=NEW.contact_revision
      AND cfg.digest=NEW.configuration_digest AND cfg.revision=NEW.configuration_revision
      AND ces.configuration_digest=NEW.configuration_digest AND ces.configuration_revision=NEW.configuration_revision
      AND ces.prospect_revision=NEW.prospect_revision AND ces.state='ContactReady' AND ces.eligible=1
      AND cmd.expected_version=NEW.version-1
      AND ((NEW.version=1 AND NOT EXISTS (SELECT 1 FROM outreach_package_versions prior WHERE prior.package_id=NEW.package_id))
        OR (NEW.version>1 AND EXISTS (SELECT 1 FROM outreach_package_versions prior WHERE prior.package_id=NEW.package_id AND prior.version=NEW.version-1)))
  );
END;
--> statement-breakpoint
CREATE TRIGGER outreach_message_scope_guard BEFORE INSERT ON outreach_messages BEGIN
  SELECT RAISE(ABORT, 'invalid outreach message scope') WHERE NEW.channel<>'email' OR NOT EXISTS (
    SELECT 1 FROM outreach_packages p WHERE p.id=NEW.package_id AND p.workspace_id=NEW.workspace_id
  );
END;
--> statement-breakpoint
CREATE TRIGGER outreach_message_version_scope_guard BEFORE INSERT ON outreach_message_versions BEGIN
  SELECT RAISE(ABORT, 'invalid outreach message version') WHERE NOT EXISTS (
    SELECT 1 FROM outreach_messages m
    JOIN outreach_package_versions pv ON pv.id=NEW.package_version_id AND pv.workspace_id=m.workspace_id AND pv.package_id=m.package_id
    JOIN outreach_commands cmd ON cmd.id=NEW.command_id AND cmd.workspace_id=m.workspace_id
      AND cmd.command_kind='message_version.create' AND cmd.result_kind='message_version' AND cmd.result_id=NEW.id
    WHERE m.id=NEW.message_id AND m.workspace_id=NEW.workspace_id AND m.channel='email'
      AND cmd.expected_version=NEW.version-1
      AND ((NEW.version=1 AND NOT EXISTS (SELECT 1 FROM outreach_message_versions prior WHERE prior.message_id=NEW.message_id))
        OR (NEW.version>1 AND EXISTS (SELECT 1 FROM outreach_message_versions prior WHERE prior.message_id=NEW.message_id AND prior.version=NEW.version-1)))
  );
END;
--> statement-breakpoint
CREATE TRIGGER outreach_artifact_binding_scope_guard BEFORE INSERT ON outreach_artifact_bindings BEGIN
  SELECT RAISE(ABORT, 'invalid outreach artifact binding') WHERE
    NEW.artifact_kind NOT IN ('package_version','message_version')
    OR NEW.binding_kind NOT IN ('configuration','qualification','review_decision','source','evidence','claim_guardrail','contact_observation','contact_eligibility','package_version')
    OR (NEW.artifact_kind='package_version' AND NOT EXISTS (SELECT 1 FROM outreach_package_versions v WHERE v.id=NEW.artifact_id AND v.workspace_id=NEW.workspace_id))
    OR (NEW.artifact_kind='message_version' AND NOT EXISTS (SELECT 1 FROM outreach_message_versions v WHERE v.id=NEW.artifact_id AND v.workspace_id=NEW.workspace_id))
    OR (NEW.binding_kind='configuration' AND NOT EXISTS (SELECT 1 FROM typed_configurations x WHERE x.id=NEW.binding_id AND x.workspace_id=NEW.workspace_id AND x.digest=NEW.binding_digest))
    OR (NEW.binding_kind='qualification' AND NOT EXISTS (SELECT 1 FROM qualification_assessments x WHERE x.id=NEW.binding_id AND x.workspace_id=NEW.workspace_id AND x.assessment_digest=NEW.binding_digest))
    OR (NEW.binding_kind='review_decision' AND NOT EXISTS (SELECT 1 FROM prospect_review_decisions x WHERE x.id=NEW.binding_id AND x.workspace_id=NEW.workspace_id AND x.decision_digest=NEW.binding_digest))
    OR (NEW.binding_kind='source' AND NOT EXISTS (SELECT 1 FROM sources x WHERE x.id=NEW.binding_id AND x.workspace_id=NEW.workspace_id AND x.source_digest=NEW.binding_digest))
    OR (NEW.binding_kind='evidence' AND NOT EXISTS (SELECT 1 FROM prospecting_source_lineage x WHERE x.id=NEW.binding_id AND x.workspace_id=NEW.workspace_id AND x.lineage_digest=NEW.binding_digest))
    OR (NEW.binding_kind='claim_guardrail' AND NOT EXISTS (SELECT 1 FROM knowledge_versions x WHERE x.id=NEW.binding_id AND x.workspace_id=NEW.workspace_id AND x.value_digest=NEW.binding_digest AND x.status IN ('confirmed','superseded')))
    OR (NEW.binding_kind='contact_observation' AND NOT EXISTS (SELECT 1 FROM contact_point_observations x WHERE x.id=NEW.binding_id AND x.workspace_id=NEW.workspace_id AND x.observation_digest=NEW.binding_digest))
    OR (NEW.binding_kind='contact_eligibility' AND NOT EXISTS (SELECT 1 FROM contact_eligibility_snapshots x WHERE x.id=NEW.binding_id AND x.workspace_id=NEW.workspace_id AND x.snapshot_digest=NEW.binding_digest))
    OR (NEW.binding_kind='package_version' AND NOT EXISTS (SELECT 1 FROM outreach_package_versions x WHERE x.id=NEW.binding_id AND x.workspace_id=NEW.workspace_id AND x.artifact_digest=NEW.binding_digest));
END;
--> statement-breakpoint
CREATE TRIGGER outreach_artifact_binding_ancestry_guard BEFORE INSERT ON outreach_artifact_bindings BEGIN
  SELECT RAISE(ABORT, 'sealed outreach bindings') WHERE EXISTS (
    SELECT 1 FROM outreach_audit_records a WHERE a.workspace_id=NEW.workspace_id AND a.subject_kind=NEW.artifact_kind AND a.subject_id=NEW.artifact_id
  );
  SELECT RAISE(ABORT, 'invalid outreach binding ancestry') WHERE
    (NEW.artifact_kind='message_version' AND (NEW.binding_kind<>'package_version' OR NOT EXISTS (
      SELECT 1 FROM outreach_message_versions mv JOIN outreach_package_versions pv ON pv.id=mv.package_version_id
      WHERE mv.id=NEW.artifact_id AND mv.workspace_id=NEW.workspace_id AND pv.workspace_id=NEW.workspace_id
        AND pv.id=NEW.binding_id AND pv.artifact_digest=NEW.binding_digest
    )))
    OR (NEW.artifact_kind='package_version' AND NOT EXISTS (
      SELECT 1 FROM outreach_package_versions pv
      JOIN outreach_packages op ON op.id=pv.package_id AND op.workspace_id=pv.workspace_id
      JOIN profile_prospects p ON p.id=op.prospect_id AND p.workspace_id=op.workspace_id
      JOIN prospecting_candidates candidate ON candidate.id=p.candidate_id AND candidate.workspace_id=p.workspace_id
      WHERE pv.id=NEW.artifact_id AND pv.workspace_id=NEW.workspace_id
        AND (
          (NEW.binding_kind='configuration' AND NEW.binding_id=pv.configuration_id AND NEW.binding_digest=pv.configuration_digest)
          OR (NEW.binding_kind='qualification' AND NEW.binding_id=p.assessment_id AND EXISTS (
            SELECT 1 FROM qualification_assessments q WHERE q.id=p.assessment_id AND q.workspace_id=p.workspace_id
              AND q.candidate_id=p.candidate_id AND q.configuration_id=pv.configuration_id AND q.configuration_digest=pv.configuration_digest
          ))
          OR (NEW.binding_kind='review_decision' AND EXISTS (
            SELECT 1 FROM prospect_review_decisions r WHERE r.id=NEW.binding_id AND r.workspace_id=p.workspace_id
              AND r.prospect_id=p.id AND r.assessment_id=p.assessment_id AND r.decision='approve'
          ))
          OR (NEW.binding_kind='source' AND EXISTS (
            SELECT 1 FROM prospecting_source_lineage e WHERE e.workspace_id=p.workspace_id AND e.source_id=NEW.binding_id
              AND e.run_id=candidate.run_id AND e.submission_id=candidate.submission_id
          ))
          OR (NEW.binding_kind='evidence' AND EXISTS (
            SELECT 1 FROM prospecting_source_lineage e WHERE e.id=NEW.binding_id AND e.workspace_id=p.workspace_id
              AND e.run_id=candidate.run_id AND e.submission_id=candidate.submission_id
              AND EXISTS (SELECT 1 FROM json_each(pv.snapshot_json,'$.evidenceDigests') d WHERE d.value=NEW.binding_digest)
          ))
          OR (NEW.binding_kind='claim_guardrail' AND EXISTS (
            SELECT 1 FROM knowledge_versions k WHERE k.id=NEW.binding_id AND k.workspace_id=p.workspace_id
              AND k.kind='claim_guardrail' AND k.scope_type='profile' AND k.scope_id=op.profile_id
              AND EXISTS (SELECT 1 FROM json_each(pv.snapshot_json,'$.claimGuardrailDigests') d WHERE d.value=NEW.binding_digest)
          ))
          OR (NEW.binding_kind='contact_observation' AND EXISTS (
            SELECT 1 FROM contact_point_observations o JOIN contact_evidence_assignments a ON a.id=o.assignment_id
            JOIN contact_eligibility_snapshots ces ON ces.id=pv.contact_eligibility_snapshot_id
            WHERE o.id=NEW.binding_id AND o.workspace_id=p.workspace_id AND o.contact_id=op.contact_id
              AND a.workspace_id=p.workspace_id AND a.prospect_id=p.id AND a.contact_id=op.contact_id
              AND o.configuration_id=pv.configuration_id AND o.configuration_digest=pv.configuration_digest
              AND EXISTS (SELECT 1 FROM json_each(ces.observation_ids_json) d WHERE d.value=o.id)
              AND EXISTS (SELECT 1 FROM json_each(pv.snapshot_json,'$.selectedContactPointDigests') d WHERE d.value=o.contact_point_digest)
          ))
          OR (NEW.binding_kind='contact_eligibility' AND NEW.binding_id=pv.contact_eligibility_snapshot_id)
        )
    ));
END;
--> statement-breakpoint
CREATE TRIGGER outreach_artifact_binding_complete_guard BEFORE INSERT ON outreach_audit_records
WHEN NEW.action IN ('package.version.created','message.version.created') BEGIN
  SELECT RAISE(ABORT, 'incomplete outreach bindings') WHERE
    (NEW.action='message.version.created' AND (SELECT count(*) FROM outreach_artifact_bindings b WHERE b.artifact_kind='message_version' AND b.artifact_id=NEW.subject_id AND b.workspace_id=NEW.workspace_id AND b.binding_kind='package_version')<>1)
    OR (NEW.action='package.version.created' AND EXISTS (
      SELECT 1 FROM outreach_package_versions pv WHERE pv.id=NEW.subject_id AND pv.workspace_id=NEW.workspace_id AND (
        EXISTS (SELECT 1 FROM json_each('["configuration","qualification","review_decision","contact_eligibility"]') required
          WHERE (SELECT count(*) FROM outreach_artifact_bindings b WHERE b.artifact_kind='package_version' AND b.artifact_id=pv.id AND b.binding_kind=required.value)<>1)
        OR EXISTS (SELECT 1 FROM json_each(pv.snapshot_json,'$.selectedContactPointDigests') d WHERE NOT EXISTS (
          SELECT 1 FROM outreach_artifact_bindings b JOIN contact_point_observations o ON o.id=b.binding_id
          WHERE b.artifact_kind='package_version' AND b.artifact_id=pv.id AND b.binding_kind='contact_observation' AND o.contact_point_digest=d.value))
        OR EXISTS (SELECT 1 FROM json_each(pv.snapshot_json,'$.evidenceDigests') d WHERE NOT EXISTS (
          SELECT 1 FROM outreach_artifact_bindings b WHERE b.artifact_kind='package_version' AND b.artifact_id=pv.id AND b.binding_kind='evidence' AND b.binding_digest=d.value))
        OR EXISTS (SELECT 1 FROM json_each(pv.snapshot_json,'$.claimGuardrailDigests') d WHERE NOT EXISTS (
          SELECT 1 FROM outreach_artifact_bindings b WHERE b.artifact_kind='package_version' AND b.artifact_id=pv.id AND b.binding_kind='claim_guardrail' AND b.binding_digest=d.value))
        OR EXISTS (SELECT 1 FROM outreach_artifact_bindings b JOIN prospecting_source_lineage e ON e.id=b.binding_id
          WHERE b.artifact_kind='package_version' AND b.artifact_id=pv.id AND b.binding_kind='evidence' AND NOT EXISTS (
            SELECT 1 FROM outreach_artifact_bindings s WHERE s.artifact_kind='package_version' AND s.artifact_id=pv.id AND s.binding_kind='source' AND s.binding_id=e.source_id))
      )
    ));
END;
--> statement-breakpoint
CREATE TRIGGER outreach_package_approval_scope_guard BEFORE INSERT ON outreach_package_approvals BEGIN
  SELECT RAISE(ABORT, 'invalid outreach package approval') WHERE NOT EXISTS (
    SELECT 1 FROM outreach_package_versions pv
    JOIN outreach_commands cmd ON cmd.id=NEW.command_id AND cmd.workspace_id=pv.workspace_id
      AND cmd.owner_subject=NEW.owner_subject AND cmd.command_kind='package.approve'
      AND cmd.result_kind='package_approval' AND cmd.result_id=NEW.id AND cmd.expected_version=pv.version
    WHERE pv.id=NEW.package_version_id AND pv.workspace_id=NEW.workspace_id AND pv.artifact_digest=NEW.artifact_digest
  );
END;
--> statement-breakpoint
CREATE TRIGGER outreach_message_approval_scope_guard BEFORE INSERT ON outreach_message_approvals BEGIN
  SELECT RAISE(ABORT, 'invalid outreach message approval') WHERE NOT EXISTS (
    SELECT 1 FROM outreach_message_versions mv
    JOIN outreach_package_versions pv ON pv.id=mv.package_version_id AND pv.workspace_id=mv.workspace_id
    JOIN outreach_package_approvals pa ON pa.id=NEW.package_approval_id AND pa.workspace_id=mv.workspace_id
      AND pa.package_version_id=pv.id AND pa.owner_subject=NEW.owner_subject AND pa.expires_at>NEW.created_at AND NEW.expires_at<=pa.expires_at
    JOIN outreach_commands cmd ON cmd.id=NEW.command_id AND cmd.workspace_id=mv.workspace_id
      AND cmd.owner_subject=NEW.owner_subject AND cmd.command_kind='message.approve'
      AND cmd.result_kind='message_approval' AND cmd.result_id=NEW.id AND cmd.expected_version=mv.version
    WHERE mv.id=NEW.message_version_id AND mv.workspace_id=NEW.workspace_id AND mv.artifact_digest=NEW.artifact_digest
  );
END;
--> statement-breakpoint
CREATE TRIGGER outreach_package_approval_current_guard BEFORE INSERT ON outreach_package_approvals BEGIN
  SELECT RAISE(ABORT, 'stale outreach candidate ancestry') WHERE NOT EXISTS (
    SELECT 1 FROM outreach_package_versions pv
    JOIN outreach_packages op ON op.id=pv.package_id AND op.workspace_id=pv.workspace_id
    JOIN profile_prospects p ON p.id=op.prospect_id AND p.workspace_id=op.workspace_id
    JOIN prospecting_candidates candidate ON candidate.id=p.candidate_id AND candidate.workspace_id=p.workspace_id
    WHERE pv.id=NEW.package_version_id AND pv.workspace_id=NEW.workspace_id
      AND candidate.profile_id=op.profile_id AND candidate.configuration_id=pv.configuration_id
      AND candidate.status IN ('observed','qualified')
  );
  SELECT RAISE(ABORT, 'unresolved outreach suppression scope') WHERE EXISTS (
    SELECT 1 FROM outreach_suppression_tombstones s WHERE s.workspace_id=NEW.workspace_id
      AND s.effective_at<=NEW.created_at AND s.subject_kind IN ('organization','confirmed_email_domain')
  );
  SELECT RAISE(ABORT, 'stale or prohibited outreach authority') WHERE NOT EXISTS (SELECT 1 FROM outreach_package_versions pv
    JOIN outreach_packages op ON op.id=pv.package_id AND op.workspace_id=pv.workspace_id
    JOIN profile_prospects p ON p.id=op.prospect_id AND p.workspace_id=op.workspace_id
    JOIN customer_profiles cp ON cp.id=op.profile_id AND cp.workspace_id=op.workspace_id
    JOIN market_plays mp ON mp.id=cp.play_id AND mp.workspace_id=cp.workspace_id
    JOIN products product ON product.id=mp.product_id AND product.workspace_id=mp.workspace_id
    JOIN companies company ON company.id=product.company_id AND company.workspace_id=product.workspace_id
    JOIN contacts c ON c.id=op.contact_id AND c.workspace_id=op.workspace_id AND c.company_id=company.id
    JOIN typed_configurations cfg ON cfg.id=pv.configuration_id AND cfg.workspace_id=pv.workspace_id
    JOIN contact_eligibility_snapshots ces ON ces.id=pv.contact_eligibility_snapshot_id AND ces.workspace_id=pv.workspace_id
    JOIN qualification_assessments q ON q.id=p.assessment_id AND q.workspace_id=p.workspace_id
    WHERE pv.id=NEW.package_version_id AND pv.workspace_id=NEW.workspace_id
      AND p.profile_id=op.profile_id AND p.state='approved' AND p.active=1 AND p.revision=pv.prospect_revision AND c.revision=pv.contact_revision
      AND cp.lifecycle='ready' AND mp.lifecycle='active' AND product.lifecycle='ready' AND company.status='active'
      AND cfg.active=1 AND cfg.owner_type='profile' AND cfg.owner_id=op.profile_id AND cfg.kind='profile_effective'
      AND cfg.digest=pv.configuration_digest AND cfg.revision=pv.configuration_revision
      AND q.candidate_id=p.candidate_id AND q.configuration_id=cfg.id AND q.configuration_digest=cfg.digest AND q.outcome='Passed'
      AND ces.contact_id=c.id AND ces.prospect_id=p.id AND ces.configuration_id=cfg.id
      AND ces.configuration_digest=cfg.digest AND ces.configuration_revision=cfg.revision AND ces.prospect_revision=p.revision
      AND ces.state='ContactReady' AND ces.eligible=1 AND ces.projected_at<=NEW.created_at
      AND json_array_length(ces.preserved_suppression_refs_json)=0
      AND NOT EXISTS (SELECT 1 FROM contact_eligibility_snapshots later WHERE later.workspace_id=p.workspace_id
        AND later.contact_id=c.id AND later.prospect_id=p.id AND later.id<>ces.id AND later.projected_at>=ces.projected_at)
  );
  SELECT RAISE(ABORT, 'stale or prohibited outreach authority') WHERE NOT EXISTS (SELECT 1 FROM outreach_package_versions pv
    JOIN outreach_packages op ON op.id=pv.package_id AND op.workspace_id=pv.workspace_id
    JOIN profile_prospects p ON p.id=op.prospect_id AND p.workspace_id=op.workspace_id
    JOIN contacts c ON c.id=op.contact_id AND c.workspace_id=op.workspace_id
    JOIN typed_configurations cfg ON cfg.id=pv.configuration_id AND cfg.workspace_id=pv.workspace_id
    JOIN contact_eligibility_snapshots ces ON ces.id=pv.contact_eligibility_snapshot_id AND ces.workspace_id=pv.workspace_id
    WHERE pv.id=NEW.package_version_id AND pv.workspace_id=NEW.workspace_id
      AND NOT EXISTS (SELECT 1 FROM outreach_package_versions later WHERE later.package_id=pv.package_id AND later.version>pv.version)
      AND EXISTS (SELECT 1 FROM outreach_audit_records ar WHERE ar.workspace_id=pv.workspace_id AND ar.subject_kind='package_version' AND ar.subject_id=pv.id AND ar.action='package.version.created')
      AND EXISTS (SELECT 1 FROM outreach_artifact_bindings b JOIN prospect_review_decisions r ON r.id=b.binding_id
        WHERE b.artifact_id=pv.id AND b.artifact_kind='package_version' AND b.binding_kind='review_decision'
          AND r.prospect_id=p.id AND r.assessment_id=p.assessment_id AND r.decision='approve' AND r.decision_digest=b.binding_digest
          AND NOT EXISTS (SELECT 1 FROM prospect_review_decisions later WHERE later.workspace_id=r.workspace_id AND later.prospect_id=p.id
            AND later.id<>r.id AND later.created_at>=r.created_at))
      AND NOT EXISTS (SELECT 1 FROM outreach_artifact_bindings b JOIN sources s ON s.id=b.binding_id
        WHERE b.artifact_id=pv.id AND b.artifact_kind='package_version' AND b.binding_kind='source' AND (s.status<>'available' OR s.source_digest<>b.binding_digest))
      AND NOT EXISTS (SELECT 1 FROM outreach_artifact_bindings b JOIN knowledge_versions k ON k.id=b.binding_id
        WHERE b.artifact_id=pv.id AND b.artifact_kind='package_version' AND b.binding_kind='claim_guardrail' AND (k.status<>'confirmed' OR k.value_digest<>b.binding_digest))
      AND NOT EXISTS (SELECT 1 FROM knowledge_drifts d WHERE d.workspace_id=pv.workspace_id AND d.status IN ('open','reviewed','contained')
        AND (EXISTS (SELECT 1 FROM configuration_knowledge_dependencies dep WHERE dep.configuration_id=cfg.id AND dep.knowledge_version_id=d.current_version_id)
          OR EXISTS (SELECT 1 FROM outreach_artifact_bindings b WHERE b.artifact_id=pv.id AND b.artifact_kind='package_version' AND b.binding_kind='claim_guardrail' AND b.binding_id=d.current_version_id)))
      AND json_array_length(pv.snapshot_json,'$.selectedContactPointDigests')>0
  );
  SELECT RAISE(ABORT, 'stale outreach contact evidence') WHERE EXISTS (
    SELECT 1 FROM outreach_package_versions pv
    JOIN outreach_packages op ON op.id=pv.package_id AND op.workspace_id=pv.workspace_id
    JOIN json_each(pv.snapshot_json,'$.selectedContactPointDigests') selected
    WHERE pv.id=NEW.package_version_id AND pv.workspace_id=NEW.workspace_id AND NOT EXISTS (
        SELECT 1 FROM outreach_artifact_bindings b
        JOIN contact_point_observations o ON o.id=b.binding_id AND o.workspace_id=pv.workspace_id
        JOIN contact_evidence_assignments a ON a.id=o.assignment_id AND a.workspace_id=pv.workspace_id
        JOIN contact_verification_receipts vr ON vr.id=o.verification_receipt_id AND vr.workspace_id=pv.workspace_id
        WHERE b.artifact_kind='package_version' AND b.artifact_id=pv.id AND b.binding_kind='contact_observation'
          AND b.binding_digest=o.observation_digest AND o.contact_id=op.contact_id AND o.configuration_id=pv.configuration_id AND o.configuration_digest=pv.configuration_digest
          AND a.prospect_id=op.prospect_id AND a.contact_id=op.contact_id AND a.configuration_id=pv.configuration_id
          AND o.contact_point_digest=selected.value AND o.verified_at<=NEW.created_at
          AND vr.observation_id=o.id AND vr.receipt_digest IS NOT NULL AND vr.attestation_key_id IS NOT NULL
          AND ((o.kind='email' AND o.verification_class='mailbox_verified' AND o.method='mailbox_verification' AND o.verified_at+2592000000>NEW.created_at)
            OR (o.verification_class='source_verified' AND o.method='authoritative_source_reconfirmed' AND o.verified_at+7776000000>NEW.created_at))
          AND NOT EXISTS (SELECT 1 FROM contact_point_observations later WHERE later.workspace_id=o.workspace_id AND later.contact_id=o.contact_id
            AND later.contact_point_digest=o.contact_point_digest AND later.id<>o.id AND later.observed_at>=o.observed_at)
    )
  );
  SELECT RAISE(ABORT, 'stale or prohibited outreach authority') WHERE NOT EXISTS (SELECT 1 FROM outreach_package_versions pv
    JOIN outreach_packages op ON op.id=pv.package_id AND op.workspace_id=pv.workspace_id
    JOIN profile_prospects p ON p.id=op.prospect_id AND p.workspace_id=op.workspace_id
    JOIN contacts c ON c.id=op.contact_id AND c.workspace_id=op.workspace_id
    JOIN typed_configurations cfg ON cfg.id=pv.configuration_id AND cfg.workspace_id=pv.workspace_id
    JOIN contact_eligibility_snapshots ces ON ces.id=pv.contact_eligibility_snapshot_id AND ces.workspace_id=pv.workspace_id
    WHERE pv.id=NEW.package_version_id AND pv.workspace_id=NEW.workspace_id
      AND NOT EXISTS (SELECT 1 FROM outreach_suppression_tombstones s WHERE s.workspace_id=pv.workspace_id AND s.effective_at<=NEW.created_at AND (
        s.subject_kind='company'
        OR (s.subject_kind='contact' AND (s.subject_digest=c.identity_digest OR EXISTS (SELECT 1 FROM json_each(s.alias_snapshot_json) a WHERE a.value=c.identity_digest)))
        OR (s.subject_kind IN ('exact_email','e164_phone') AND EXISTS (
          SELECT 1 FROM outreach_artifact_bindings b JOIN contact_point_observations o ON o.id=b.binding_id
          WHERE b.artifact_kind='package_version' AND b.artifact_id=pv.id AND b.binding_kind='contact_observation'
            AND ((s.subject_kind='exact_email' AND o.kind='email') OR (s.subject_kind='e164_phone' AND o.kind='phone'))
            AND (s.subject_digest=o.contact_point_digest OR EXISTS (SELECT 1 FROM json_each(s.alias_snapshot_json) a WHERE a.value=o.contact_point_digest))
        ))
      ))
  );
  SELECT RAISE(ABORT, 'stale or prohibited outreach authority') WHERE NOT EXISTS (SELECT 1 FROM outreach_package_versions pv
    JOIN outreach_packages op ON op.id=pv.package_id AND op.workspace_id=pv.workspace_id
    JOIN profile_prospects p ON p.id=op.prospect_id AND p.workspace_id=op.workspace_id
    JOIN contacts c ON c.id=op.contact_id AND c.workspace_id=op.workspace_id
    JOIN typed_configurations cfg ON cfg.id=pv.configuration_id AND cfg.workspace_id=pv.workspace_id
    JOIN contact_eligibility_snapshots ces ON ces.id=pv.contact_eligibility_snapshot_id AND ces.workspace_id=pv.workspace_id
    WHERE pv.id=NEW.package_version_id AND pv.workspace_id=NEW.workspace_id
      AND NOT EXISTS (SELECT 1 FROM outreach_stop_events stop WHERE stop.workspace_id=pv.workspace_id AND stop.stop_kind<>'suppression' AND stop.effective_at<=NEW.created_at
        AND ((stop.subject_kind='company') OR (stop.subject_kind='contact' AND stop.subject_digest=c.identity_digest)
          OR EXISTS (SELECT 1 FROM json_each(pv.snapshot_json,'$.selectedContactPointDigests') point WHERE point.value=stop.subject_digest)))
  );
END;
--> statement-breakpoint
CREATE TRIGGER outreach_message_approval_current_guard BEFORE INSERT ON outreach_message_approvals BEGIN
  SELECT RAISE(ABORT, 'stale outreach candidate ancestry') WHERE NOT EXISTS (
    SELECT 1 FROM outreach_package_versions pv
    JOIN outreach_packages op ON op.id=pv.package_id AND op.workspace_id=pv.workspace_id
    JOIN profile_prospects p ON p.id=op.prospect_id AND p.workspace_id=op.workspace_id
    JOIN prospecting_candidates candidate ON candidate.id=p.candidate_id AND candidate.workspace_id=p.workspace_id
    WHERE pv.id=(SELECT package_version_id FROM outreach_message_versions WHERE id=NEW.message_version_id AND workspace_id=NEW.workspace_id) AND pv.workspace_id=NEW.workspace_id
      AND candidate.profile_id=op.profile_id AND candidate.configuration_id=pv.configuration_id
      AND candidate.status IN ('observed','qualified')
  );
  SELECT RAISE(ABORT, 'unresolved outreach suppression scope') WHERE EXISTS (
    SELECT 1 FROM outreach_suppression_tombstones s WHERE s.workspace_id=NEW.workspace_id
      AND s.effective_at<=NEW.created_at AND s.subject_kind IN ('organization','confirmed_email_domain')
  );
  SELECT RAISE(ABORT, 'stale outreach message version') WHERE EXISTS (
    SELECT 1 FROM outreach_message_versions mv JOIN outreach_message_versions later ON later.message_id=mv.message_id AND later.version>mv.version
    WHERE mv.id=NEW.message_version_id AND mv.workspace_id=NEW.workspace_id
  );
  SELECT RAISE(ABORT, 'incomplete outreach message audit') WHERE NOT EXISTS (
    SELECT 1 FROM outreach_audit_records a WHERE a.workspace_id=NEW.workspace_id AND a.subject_kind='message_version' AND a.subject_id=NEW.message_version_id AND a.action='message.version.created'
  );
  SELECT RAISE(ABORT, 'stale or prohibited outreach authority') WHERE NOT EXISTS (SELECT 1 FROM outreach_package_versions pv
    JOIN outreach_packages op ON op.id=pv.package_id AND op.workspace_id=pv.workspace_id
    JOIN profile_prospects p ON p.id=op.prospect_id AND p.workspace_id=op.workspace_id
    JOIN customer_profiles cp ON cp.id=op.profile_id AND cp.workspace_id=op.workspace_id
    JOIN market_plays mp ON mp.id=cp.play_id AND mp.workspace_id=cp.workspace_id
    JOIN products product ON product.id=mp.product_id AND product.workspace_id=mp.workspace_id
    JOIN companies company ON company.id=product.company_id AND company.workspace_id=product.workspace_id
    JOIN contacts c ON c.id=op.contact_id AND c.workspace_id=op.workspace_id AND c.company_id=company.id
    JOIN typed_configurations cfg ON cfg.id=pv.configuration_id AND cfg.workspace_id=pv.workspace_id
    JOIN contact_eligibility_snapshots ces ON ces.id=pv.contact_eligibility_snapshot_id AND ces.workspace_id=pv.workspace_id
    JOIN qualification_assessments q ON q.id=p.assessment_id AND q.workspace_id=p.workspace_id
    WHERE pv.id=(SELECT package_version_id FROM outreach_message_versions WHERE id=NEW.message_version_id AND workspace_id=NEW.workspace_id) AND pv.workspace_id=NEW.workspace_id
      AND p.profile_id=op.profile_id AND p.state='approved' AND p.active=1 AND p.revision=pv.prospect_revision AND c.revision=pv.contact_revision
      AND cp.lifecycle='ready' AND mp.lifecycle='active' AND product.lifecycle='ready' AND company.status='active'
      AND cfg.active=1 AND cfg.owner_type='profile' AND cfg.owner_id=op.profile_id AND cfg.kind='profile_effective'
      AND cfg.digest=pv.configuration_digest AND cfg.revision=pv.configuration_revision
      AND q.candidate_id=p.candidate_id AND q.configuration_id=cfg.id AND q.configuration_digest=cfg.digest AND q.outcome='Passed'
      AND ces.contact_id=c.id AND ces.prospect_id=p.id AND ces.configuration_id=cfg.id
      AND ces.configuration_digest=cfg.digest AND ces.configuration_revision=cfg.revision AND ces.prospect_revision=p.revision
      AND ces.state='ContactReady' AND ces.eligible=1 AND ces.projected_at<=NEW.created_at
      AND json_array_length(ces.preserved_suppression_refs_json)=0
      AND NOT EXISTS (SELECT 1 FROM contact_eligibility_snapshots later WHERE later.workspace_id=p.workspace_id
        AND later.contact_id=c.id AND later.prospect_id=p.id AND later.id<>ces.id AND later.projected_at>=ces.projected_at)
  );
  SELECT RAISE(ABORT, 'stale or prohibited outreach authority') WHERE NOT EXISTS (SELECT 1 FROM outreach_package_versions pv
    JOIN outreach_packages op ON op.id=pv.package_id AND op.workspace_id=pv.workspace_id
    JOIN profile_prospects p ON p.id=op.prospect_id AND p.workspace_id=op.workspace_id
    JOIN contacts c ON c.id=op.contact_id AND c.workspace_id=op.workspace_id
    JOIN typed_configurations cfg ON cfg.id=pv.configuration_id AND cfg.workspace_id=pv.workspace_id
    JOIN contact_eligibility_snapshots ces ON ces.id=pv.contact_eligibility_snapshot_id AND ces.workspace_id=pv.workspace_id
    WHERE pv.id=(SELECT package_version_id FROM outreach_message_versions WHERE id=NEW.message_version_id AND workspace_id=NEW.workspace_id) AND pv.workspace_id=NEW.workspace_id
      AND NOT EXISTS (SELECT 1 FROM outreach_package_versions later WHERE later.package_id=pv.package_id AND later.version>pv.version)
      AND EXISTS (SELECT 1 FROM outreach_audit_records ar WHERE ar.workspace_id=pv.workspace_id AND ar.subject_kind='package_version' AND ar.subject_id=pv.id AND ar.action='package.version.created')
      AND EXISTS (SELECT 1 FROM outreach_artifact_bindings b JOIN prospect_review_decisions r ON r.id=b.binding_id
        WHERE b.artifact_id=pv.id AND b.artifact_kind='package_version' AND b.binding_kind='review_decision'
          AND r.prospect_id=p.id AND r.assessment_id=p.assessment_id AND r.decision='approve' AND r.decision_digest=b.binding_digest
          AND NOT EXISTS (SELECT 1 FROM prospect_review_decisions later WHERE later.workspace_id=r.workspace_id AND later.prospect_id=p.id
            AND later.id<>r.id AND later.created_at>=r.created_at))
      AND NOT EXISTS (SELECT 1 FROM outreach_artifact_bindings b JOIN sources s ON s.id=b.binding_id
        WHERE b.artifact_id=pv.id AND b.artifact_kind='package_version' AND b.binding_kind='source' AND (s.status<>'available' OR s.source_digest<>b.binding_digest))
      AND NOT EXISTS (SELECT 1 FROM outreach_artifact_bindings b JOIN knowledge_versions k ON k.id=b.binding_id
        WHERE b.artifact_id=pv.id AND b.artifact_kind='package_version' AND b.binding_kind='claim_guardrail' AND (k.status<>'confirmed' OR k.value_digest<>b.binding_digest))
      AND NOT EXISTS (SELECT 1 FROM knowledge_drifts d WHERE d.workspace_id=pv.workspace_id AND d.status IN ('open','reviewed','contained')
        AND (EXISTS (SELECT 1 FROM configuration_knowledge_dependencies dep WHERE dep.configuration_id=cfg.id AND dep.knowledge_version_id=d.current_version_id)
          OR EXISTS (SELECT 1 FROM outreach_artifact_bindings b WHERE b.artifact_id=pv.id AND b.artifact_kind='package_version' AND b.binding_kind='claim_guardrail' AND b.binding_id=d.current_version_id)))
      AND json_array_length(pv.snapshot_json,'$.selectedContactPointDigests')>0
  );
  SELECT RAISE(ABORT, 'stale outreach contact evidence') WHERE EXISTS (
    SELECT 1 FROM outreach_package_versions pv
    JOIN outreach_packages op ON op.id=pv.package_id AND op.workspace_id=pv.workspace_id
    JOIN json_each(pv.snapshot_json,'$.selectedContactPointDigests') selected
    WHERE pv.id=(SELECT package_version_id FROM outreach_message_versions WHERE id=NEW.message_version_id AND workspace_id=NEW.workspace_id) AND pv.workspace_id=NEW.workspace_id AND NOT EXISTS (
        SELECT 1 FROM outreach_artifact_bindings b
        JOIN contact_point_observations o ON o.id=b.binding_id AND o.workspace_id=pv.workspace_id
        JOIN contact_evidence_assignments a ON a.id=o.assignment_id AND a.workspace_id=pv.workspace_id
        JOIN contact_verification_receipts vr ON vr.id=o.verification_receipt_id AND vr.workspace_id=pv.workspace_id
        WHERE b.artifact_kind='package_version' AND b.artifact_id=pv.id AND b.binding_kind='contact_observation'
          AND b.binding_digest=o.observation_digest AND o.contact_id=op.contact_id AND o.configuration_id=pv.configuration_id AND o.configuration_digest=pv.configuration_digest
          AND a.prospect_id=op.prospect_id AND a.contact_id=op.contact_id AND a.configuration_id=pv.configuration_id
          AND o.contact_point_digest=selected.value AND o.verified_at<=NEW.created_at
          AND vr.observation_id=o.id AND vr.receipt_digest IS NOT NULL AND vr.attestation_key_id IS NOT NULL
          AND ((o.kind='email' AND o.verification_class='mailbox_verified' AND o.method='mailbox_verification' AND o.verified_at+2592000000>NEW.created_at)
            OR (o.verification_class='source_verified' AND o.method='authoritative_source_reconfirmed' AND o.verified_at+7776000000>NEW.created_at))
          AND NOT EXISTS (SELECT 1 FROM contact_point_observations later WHERE later.workspace_id=o.workspace_id AND later.contact_id=o.contact_id
            AND later.contact_point_digest=o.contact_point_digest AND later.id<>o.id AND later.observed_at>=o.observed_at)
    )
  );
  SELECT RAISE(ABORT, 'stale or prohibited outreach authority') WHERE NOT EXISTS (SELECT 1 FROM outreach_package_versions pv
    JOIN outreach_packages op ON op.id=pv.package_id AND op.workspace_id=pv.workspace_id
    JOIN profile_prospects p ON p.id=op.prospect_id AND p.workspace_id=op.workspace_id
    JOIN contacts c ON c.id=op.contact_id AND c.workspace_id=op.workspace_id
    JOIN typed_configurations cfg ON cfg.id=pv.configuration_id AND cfg.workspace_id=pv.workspace_id
    JOIN contact_eligibility_snapshots ces ON ces.id=pv.contact_eligibility_snapshot_id AND ces.workspace_id=pv.workspace_id
    WHERE pv.id=(SELECT package_version_id FROM outreach_message_versions WHERE id=NEW.message_version_id AND workspace_id=NEW.workspace_id) AND pv.workspace_id=NEW.workspace_id
      AND NOT EXISTS (SELECT 1 FROM outreach_suppression_tombstones s WHERE s.workspace_id=pv.workspace_id AND s.effective_at<=NEW.created_at AND (
        s.subject_kind='company'
        OR (s.subject_kind='contact' AND (s.subject_digest=c.identity_digest OR EXISTS (SELECT 1 FROM json_each(s.alias_snapshot_json) a WHERE a.value=c.identity_digest)))
        OR (s.subject_kind IN ('exact_email','e164_phone') AND EXISTS (
          SELECT 1 FROM outreach_artifact_bindings b JOIN contact_point_observations o ON o.id=b.binding_id
          WHERE b.artifact_kind='package_version' AND b.artifact_id=pv.id AND b.binding_kind='contact_observation'
            AND ((s.subject_kind='exact_email' AND o.kind='email') OR (s.subject_kind='e164_phone' AND o.kind='phone'))
            AND (s.subject_digest=o.contact_point_digest OR EXISTS (SELECT 1 FROM json_each(s.alias_snapshot_json) a WHERE a.value=o.contact_point_digest))
        ))
      ))
  );
  SELECT RAISE(ABORT, 'stale or prohibited outreach authority') WHERE NOT EXISTS (SELECT 1 FROM outreach_package_versions pv
    JOIN outreach_packages op ON op.id=pv.package_id AND op.workspace_id=pv.workspace_id
    JOIN profile_prospects p ON p.id=op.prospect_id AND p.workspace_id=op.workspace_id
    JOIN contacts c ON c.id=op.contact_id AND c.workspace_id=op.workspace_id
    JOIN typed_configurations cfg ON cfg.id=pv.configuration_id AND cfg.workspace_id=pv.workspace_id
    JOIN contact_eligibility_snapshots ces ON ces.id=pv.contact_eligibility_snapshot_id AND ces.workspace_id=pv.workspace_id
    WHERE pv.id=(SELECT package_version_id FROM outreach_message_versions WHERE id=NEW.message_version_id AND workspace_id=NEW.workspace_id) AND pv.workspace_id=NEW.workspace_id
      AND NOT EXISTS (SELECT 1 FROM outreach_stop_events stop WHERE stop.workspace_id=pv.workspace_id AND stop.stop_kind<>'suppression' AND stop.effective_at<=NEW.created_at
        AND ((stop.subject_kind='company') OR (stop.subject_kind='contact' AND stop.subject_digest=c.identity_digest)
          OR EXISTS (SELECT 1 FROM json_each(pv.snapshot_json,'$.selectedContactPointDigests') point WHERE point.value=stop.subject_digest)))
  );
END;
--> statement-breakpoint
CREATE TRIGGER outreach_message_consumption_scope_guard BEFORE INSERT ON outreach_message_approval_consumptions BEGIN
  SELECT RAISE(ABORT, 'invalid outreach approval consumption') WHERE NOT EXISTS (
    SELECT 1 FROM outreach_message_approvals ma WHERE ma.id=NEW.message_approval_id
      AND ma.workspace_id=NEW.workspace_id AND ma.approval_digest=NEW.approval_digest AND ma.expires_at>NEW.consumed_at
  );
END;
--> statement-breakpoint
CREATE TRIGGER outreach_suppression_scope_guard BEFORE INSERT ON outreach_suppression_tombstones BEGIN
  SELECT RAISE(ABORT, 'invalid outreach suppression aliases') WHERE json_valid(NEW.alias_snapshot_json)<>1;
  SELECT RAISE(ABORT, 'invalid outreach suppression aliases') WHERE json_type(NEW.alias_snapshot_json)<>'array'
    OR json_array_length(NEW.alias_snapshot_json)>64
    OR EXISTS (SELECT 1 FROM json_each(NEW.alias_snapshot_json) a WHERE a.type<>'text' OR length(a.value)<>64 OR a.value GLOB '*[^0-9a-f]*')
    OR (SELECT count(*) FROM json_each(NEW.alias_snapshot_json))<>(SELECT count(DISTINCT value) FROM json_each(NEW.alias_snapshot_json));
  SELECT RAISE(ABORT, 'invalid outreach suppression') WHERE
    NEW.subject_kind NOT IN ('exact_email','confirmed_email_domain','e164_phone','contact','organization','company')
    OR NEW.channel NOT IN ('email','phone','all')
    OR NEW.reason NOT IN ('owner_request','unsubscribe','explicit_opt_out','do_not_call','identity_retention','import_retention')
    OR (NEW.subject_kind IN ('exact_email','confirmed_email_domain') AND NEW.channel NOT IN ('email','all'))
    OR (NEW.subject_kind='e164_phone' AND NEW.channel NOT IN ('phone','all'))
    OR NOT EXISTS (
      SELECT 1 FROM outreach_commands cmd WHERE cmd.id=NEW.command_id AND cmd.workspace_id=NEW.workspace_id
        AND cmd.owner_subject=NEW.actor_subject AND cmd.command_kind='suppression.record'
        AND cmd.result_kind='suppression_tombstone' AND cmd.result_id=NEW.id AND cmd.expected_version=0
    );
END;
--> statement-breakpoint
CREATE TRIGGER outreach_stop_scope_guard BEFORE INSERT ON outreach_stop_events BEGIN
  SELECT RAISE(ABORT, 'invalid outreach stop event') WHERE
    NEW.stop_kind NOT IN ('suppression','reply','bounce','pause','archive','high_risk_drift')
    OR length(NEW.reason_code)<1 OR length(NEW.reason_code)>64
    OR (NEW.stop_kind='suppression' AND NOT EXISTS (
      SELECT 1 FROM outreach_suppression_tombstones s WHERE s.id=NEW.tombstone_id AND s.workspace_id=NEW.workspace_id
        AND s.subject_kind=NEW.subject_kind AND s.subject_digest=NEW.subject_digest
        AND s.source_event_digest=NEW.source_event_digest AND s.command_id=NEW.command_id AND s.effective_at=NEW.effective_at
    ))
    OR (NEW.stop_kind<>'suppression' AND NEW.tombstone_id IS NOT NULL);
END;
--> statement-breakpoint
CREATE TRIGGER outreach_audit_scope_guard BEFORE INSERT ON outreach_audit_records BEGIN
  SELECT RAISE(ABORT, 'invalid outreach audit record') WHERE
    NEW.action NOT IN ('package.version.created','message.version.created','package.approved','message.approved','suppression.recorded')
    OR NEW.subject_kind NOT IN ('package_version','message_version','package_approval','message_approval','suppression_tombstone')
    OR NEW.outcome<>'recorded' OR length(NEW.reason_code)<1 OR length(NEW.reason_code)>64
    OR NOT EXISTS (
      SELECT 1 FROM outreach_commands cmd WHERE cmd.id=NEW.command_id AND cmd.workspace_id=NEW.workspace_id
        AND cmd.owner_subject=NEW.actor_subject AND cmd.result_kind=NEW.subject_kind AND cmd.result_id=NEW.subject_id
    );
END;
--> statement-breakpoint
CREATE TRIGGER immutable_outreach_commands_update BEFORE UPDATE ON outreach_commands BEGIN SELECT RAISE(ABORT, 'immutable outreach command'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_outreach_commands_delete BEFORE DELETE ON outreach_commands BEGIN SELECT RAISE(ABORT, 'immutable outreach command'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_outreach_packages_update BEFORE UPDATE ON outreach_packages BEGIN SELECT RAISE(ABORT, 'immutable outreach package'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_outreach_packages_delete BEFORE DELETE ON outreach_packages BEGIN SELECT RAISE(ABORT, 'immutable outreach package'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_outreach_package_versions_update BEFORE UPDATE ON outreach_package_versions BEGIN SELECT RAISE(ABORT, 'immutable outreach package version'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_outreach_package_versions_delete BEFORE DELETE ON outreach_package_versions BEGIN SELECT RAISE(ABORT, 'immutable outreach package version'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_outreach_messages_update BEFORE UPDATE ON outreach_messages BEGIN SELECT RAISE(ABORT, 'immutable outreach message'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_outreach_messages_delete BEFORE DELETE ON outreach_messages BEGIN SELECT RAISE(ABORT, 'immutable outreach message'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_outreach_message_versions_update BEFORE UPDATE ON outreach_message_versions BEGIN SELECT RAISE(ABORT, 'immutable outreach message version'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_outreach_message_versions_delete BEFORE DELETE ON outreach_message_versions BEGIN SELECT RAISE(ABORT, 'immutable outreach message version'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_outreach_artifact_bindings_update BEFORE UPDATE ON outreach_artifact_bindings BEGIN SELECT RAISE(ABORT, 'immutable outreach artifact binding'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_outreach_artifact_bindings_delete BEFORE DELETE ON outreach_artifact_bindings BEGIN SELECT RAISE(ABORT, 'immutable outreach artifact binding'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_outreach_package_approvals_update BEFORE UPDATE ON outreach_package_approvals BEGIN SELECT RAISE(ABORT, 'immutable outreach package approval'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_outreach_package_approvals_delete BEFORE DELETE ON outreach_package_approvals BEGIN SELECT RAISE(ABORT, 'immutable outreach package approval'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_outreach_message_approvals_update BEFORE UPDATE ON outreach_message_approvals BEGIN SELECT RAISE(ABORT, 'immutable outreach message approval'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_outreach_message_approvals_delete BEFORE DELETE ON outreach_message_approvals BEGIN SELECT RAISE(ABORT, 'immutable outreach message approval'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_outreach_message_consumptions_update BEFORE UPDATE ON outreach_message_approval_consumptions BEGIN SELECT RAISE(ABORT, 'immutable outreach approval consumption'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_outreach_message_consumptions_delete BEFORE DELETE ON outreach_message_approval_consumptions BEGIN SELECT RAISE(ABORT, 'immutable outreach approval consumption'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_outreach_suppressions_update BEFORE UPDATE ON outreach_suppression_tombstones BEGIN SELECT RAISE(ABORT, 'immutable outreach suppression'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_outreach_suppressions_delete BEFORE DELETE ON outreach_suppression_tombstones BEGIN SELECT RAISE(ABORT, 'immutable outreach suppression'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_outreach_stop_events_update BEFORE UPDATE ON outreach_stop_events BEGIN SELECT RAISE(ABORT, 'immutable outreach stop event'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_outreach_stop_events_delete BEFORE DELETE ON outreach_stop_events BEGIN SELECT RAISE(ABORT, 'immutable outreach stop event'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_outreach_audit_update BEFORE UPDATE ON outreach_audit_records BEGIN SELECT RAISE(ABORT, 'immutable outreach audit record'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_outreach_audit_delete BEFORE DELETE ON outreach_audit_records BEGIN SELECT RAISE(ABORT, 'immutable outreach audit record'); END;
