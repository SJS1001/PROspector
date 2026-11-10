CREATE TABLE `handoff_delivery_events` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`subject_kind` text NOT NULL,
	`subject_id` text NOT NULL,
	`event_kind` text NOT NULL,
	`expires_at` integer,
	`reason_code` text NOT NULL,
	`event_digest` text NOT NULL,
	`command_id` text NOT NULL,
	`occurred_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`command_id`) REFERENCES `handoff_recovery_commands`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "handoff_delivery_event_shape_check" CHECK("handoff_delivery_events"."subject_kind" in ('export_artifact','recovery_archive') and "handoff_delivery_events"."event_kind" in ('issued','expired','failed') and (("handoff_delivery_events"."event_kind" = 'issued' and "handoff_delivery_events"."expires_at" > "handoff_delivery_events"."occurred_at") or ("handoff_delivery_events"."event_kind" <> 'issued' and "handoff_delivery_events"."expires_at" is null)) and "handoff_delivery_events"."occurred_at" <= "handoff_delivery_events"."created_at" and length("handoff_delivery_events"."subject_id") between 1 and 128 and "handoff_delivery_events"."subject_id" not glob '*[^A-Za-z0-9._:-]*' and length("handoff_delivery_events"."reason_code") between 1 and 80 and "handoff_delivery_events"."reason_code" not glob '*[^a-z0-9._:-]*' and length("handoff_delivery_events"."event_digest") = 64 and "handoff_delivery_events"."event_digest" not glob '*[^0-9a-f]*')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `handoff_delivery_event_digest_unique` ON `handoff_delivery_events` (`workspace_id`,`event_digest`);--> statement-breakpoint
CREATE UNIQUE INDEX `handoff_delivery_event_command_unique` ON `handoff_delivery_events` (`command_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `handoff_delivery_issued_unique` ON `handoff_delivery_events` (`subject_kind`,`subject_id`) WHERE "handoff_delivery_events"."event_kind" = 'issued';--> statement-breakpoint
CREATE UNIQUE INDEX `handoff_delivery_terminal_unique` ON `handoff_delivery_events` (`subject_kind`,`subject_id`) WHERE "handoff_delivery_events"."event_kind" <> 'issued';--> statement-breakpoint
CREATE TABLE `handoff_export_artifacts` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`snapshot_id` text NOT NULL,
	`command_id` text NOT NULL,
	`schema_version` text NOT NULL,
	`media_type` text NOT NULL,
	`object_key` text NOT NULL,
	`content_sha256` text NOT NULL,
	`byte_length` integer NOT NULL,
	`manifest_json` text NOT NULL,
	`manifest_digest` text NOT NULL,
	`row_count` integer NOT NULL,
	`prospect_count` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`snapshot_id`) REFERENCES `handoff_export_snapshots`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`command_id`) REFERENCES `handoff_recovery_commands`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "handoff_export_artifact_digest_check" CHECK(length("handoff_export_artifacts"."content_sha256") = 64 and "handoff_export_artifacts"."content_sha256" not glob '*[^0-9a-f]*' and length("handoff_export_artifacts"."manifest_digest") = 64 and "handoff_export_artifacts"."manifest_digest" not glob '*[^0-9a-f]*'),
	CONSTRAINT "handoff_export_artifact_shape_check" CHECK("handoff_export_artifacts"."byte_length" > 0 and "handoff_export_artifacts"."row_count" >= "handoff_export_artifacts"."prospect_count" and "handoff_export_artifacts"."prospect_count" >= 0 and "handoff_export_artifacts"."media_type" = 'text/csv' and length("handoff_export_artifacts"."schema_version") between 1 and 128 and "handoff_export_artifacts"."schema_version" not glob '*[^A-Za-z0-9._:/-]*' and length("handoff_export_artifacts"."object_key") between 1 and 512 and "handoff_export_artifacts"."object_key" not glob '*[^A-Za-z0-9._/-]*' and "handoff_export_artifacts"."object_key" not like '%..%' and "handoff_export_artifacts"."object_key" not like '/%' and json_valid("handoff_export_artifacts"."manifest_json") and length("handoff_export_artifacts"."manifest_json") <= 65536 and lower("handoff_export_artifacts"."manifest_json") not like '%passphrase%' and lower("handoff_export_artifacts"."manifest_json") not like '%password%' and lower("handoff_export_artifacts"."manifest_json") not like '%secret%' and lower("handoff_export_artifacts"."manifest_json") not like '%credential%' and lower("handoff_export_artifacts"."manifest_json") not like '%bearer%' and lower("handoff_export_artifacts"."manifest_json") not like '%oauth%')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `handoff_export_artifact_snapshot_unique` ON `handoff_export_artifacts` (`snapshot_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `handoff_export_artifact_content_unique` ON `handoff_export_artifacts` (`workspace_id`,`content_sha256`);--> statement-breakpoint
CREATE UNIQUE INDEX `handoff_export_artifact_object_unique` ON `handoff_export_artifacts` (`workspace_id`,`object_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `handoff_export_artifact_command_unique` ON `handoff_export_artifacts` (`command_id`);--> statement-breakpoint
CREATE TABLE `handoff_export_snapshot_rows` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`snapshot_id` text NOT NULL,
	`ordinal` integer NOT NULL,
	`prospect_id` text NOT NULL,
	`contact_id` text NOT NULL,
	`contact_point_digest` text NOT NULL,
	`package_version_id` text NOT NULL,
	`package_approval_id` text NOT NULL,
	`row_identity_digest` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`snapshot_id`) REFERENCES `handoff_export_snapshots`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`prospect_id`) REFERENCES `profile_prospects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`package_version_id`) REFERENCES `outreach_package_versions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`package_approval_id`) REFERENCES `outreach_package_approvals`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "handoff_export_row_shape_check" CHECK("handoff_export_snapshot_rows"."ordinal" >= 0 and length("handoff_export_snapshot_rows"."contact_point_digest") = 64 and "handoff_export_snapshot_rows"."contact_point_digest" not glob '*[^0-9a-f]*' and length("handoff_export_snapshot_rows"."row_identity_digest") = 64 and "handoff_export_snapshot_rows"."row_identity_digest" not glob '*[^0-9a-f]*')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `handoff_export_row_ordinal_unique` ON `handoff_export_snapshot_rows` (`snapshot_id`,`ordinal`);--> statement-breakpoint
CREATE UNIQUE INDEX `handoff_export_row_identity_unique` ON `handoff_export_snapshot_rows` (`snapshot_id`,`prospect_id`,`contact_point_digest`);--> statement-breakpoint
CREATE UNIQUE INDEX `handoff_export_row_digest_unique` ON `handoff_export_snapshot_rows` (`snapshot_id`,`row_identity_digest`);--> statement-breakpoint
CREATE TABLE `handoff_export_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`command_id` text NOT NULL,
	`export_definition_digest` text NOT NULL,
	`policy_digest` text NOT NULL,
	`configuration_digest` text NOT NULL,
	`package_set_digest` text NOT NULL,
	`suppression_fence_count` integer NOT NULL,
	`snapshot_digest` text NOT NULL,
	`selected_at` integer NOT NULL,
	`prospect_count` integer NOT NULL,
	`contact_row_count` integer NOT NULL,
	`exclusion_count` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`command_id`) REFERENCES `handoff_recovery_commands`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "handoff_export_snapshot_digest_check" CHECK(length("handoff_export_snapshots"."export_definition_digest") = 64 and "handoff_export_snapshots"."export_definition_digest" not glob '*[^0-9a-f]*' and length("handoff_export_snapshots"."policy_digest") = 64 and "handoff_export_snapshots"."policy_digest" not glob '*[^0-9a-f]*' and length("handoff_export_snapshots"."configuration_digest") = 64 and "handoff_export_snapshots"."configuration_digest" not glob '*[^0-9a-f]*' and length("handoff_export_snapshots"."package_set_digest") = 64 and "handoff_export_snapshots"."package_set_digest" not glob '*[^0-9a-f]*' and length("handoff_export_snapshots"."snapshot_digest") = 64 and "handoff_export_snapshots"."snapshot_digest" not glob '*[^0-9a-f]*'),
	CONSTRAINT "handoff_export_snapshot_count_check" CHECK("handoff_export_snapshots"."suppression_fence_count" >= 0 and "handoff_export_snapshots"."prospect_count" >= 0 and "handoff_export_snapshots"."contact_row_count" >= "handoff_export_snapshots"."prospect_count" and "handoff_export_snapshots"."exclusion_count" >= 0 and "handoff_export_snapshots"."selected_at" <= "handoff_export_snapshots"."created_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `handoff_export_snapshot_digest_unique` ON `handoff_export_snapshots` (`workspace_id`,`snapshot_digest`);--> statement-breakpoint
CREATE UNIQUE INDEX `handoff_export_snapshot_command_unique` ON `handoff_export_snapshots` (`command_id`);--> statement-breakpoint
CREATE TABLE `handoff_recovery_audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`actor_subject` text NOT NULL,
	`action` text NOT NULL,
	`subject_kind` text NOT NULL,
	`subject_id` text,
	`outcome` text NOT NULL,
	`reason_code` text NOT NULL,
	`material_digest` text NOT NULL,
	`command_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`command_id`) REFERENCES `handoff_recovery_commands`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "handoff_recovery_audit_vocabulary_check" CHECK("handoff_recovery_audit_events"."action" in ('schedule.observed','weekly_report.recorded','export.snapshot_recorded','export.artifact_recorded','delivery.event_recorded','archive.recorded','restore.dry_run_recorded','restore.lock_acquired','restore.result_recorded','schedule.observe','weekly_report.record','export.snapshot','export.artifact','delivery.event','archive.create','restore.dry_run','restore.lock_acquire','restore.apply') and "handoff_recovery_audit_events"."subject_kind" in ('workspace','schedule_observation','weekly_report','export_snapshot','export_artifact','delivery_event','recovery_archive','recovery_dry_run','recovery_restore_lock','recovery_restore_result')),
	CONSTRAINT "handoff_recovery_audit_outcome_check" CHECK(("handoff_recovery_audit_events"."outcome" = 'recorded' and "handoff_recovery_audit_events"."command_id" is not null and "handoff_recovery_audit_events"."subject_id" is not null) or ("handoff_recovery_audit_events"."outcome" = 'refused' and "handoff_recovery_audit_events"."command_id" is null)),
	CONSTRAINT "handoff_recovery_audit_shape_check" CHECK(length("handoff_recovery_audit_events"."material_digest") = 64 and "handoff_recovery_audit_events"."material_digest" not glob '*[^0-9a-f]*' and length("handoff_recovery_audit_events"."reason_code") between 1 and 80 and "handoff_recovery_audit_events"."reason_code" not glob '*[^a-z0-9._:-]*' and ("handoff_recovery_audit_events"."subject_id" is null or length("handoff_recovery_audit_events"."subject_id") between 1 and 128 and "handoff_recovery_audit_events"."subject_id" not glob '*[^A-Za-z0-9._:-]*'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `handoff_recovery_audit_material_unique` ON `handoff_recovery_audit_events` (`workspace_id`,`material_digest`);--> statement-breakpoint
CREATE UNIQUE INDEX `handoff_recovery_audit_command_unique` ON `handoff_recovery_audit_events` (`command_id`);--> statement-breakpoint
CREATE INDEX `handoff_recovery_audit_time_idx` ON `handoff_recovery_audit_events` (`workspace_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `handoff_recovery_commands` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`owner_subject` text NOT NULL,
	`command_kind` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`operation_digest` text NOT NULL,
	`expected_revision` integer NOT NULL,
	`result_kind` text NOT NULL,
	`result_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "handoff_recovery_command_kind_check" CHECK("handoff_recovery_commands"."command_kind" in ('schedule_observation.record','weekly_report.record','export_snapshot.record','export_artifact.record','delivery_event.record','archive.record','dry_run.record','restore_lock.acquire','restore_result.record')),
	CONSTRAINT "handoff_recovery_command_shape_check" CHECK(length("handoff_recovery_commands"."operation_digest") = 64 and "handoff_recovery_commands"."operation_digest" not glob '*[^0-9a-f]*' and length("handoff_recovery_commands"."idempotency_key") between 1 and 128 and "handoff_recovery_commands"."idempotency_key" not glob '*[^A-Za-z0-9._:-]*' and length("handoff_recovery_commands"."result_id") between 1 and 128 and "handoff_recovery_commands"."result_id" not glob '*[^A-Za-z0-9._:-]*' and length("handoff_recovery_commands"."result_kind") between 1 and 80 and "handoff_recovery_commands"."result_kind" not glob '*[^a-z0-9._:-]*' and "handoff_recovery_commands"."expected_revision" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `handoff_recovery_command_key_unique` ON `handoff_recovery_commands` (`workspace_id`,`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `handoff_recovery_command_operation_unique` ON `handoff_recovery_commands` (`workspace_id`,`operation_digest`);--> statement-breakpoint
CREATE TABLE `handoff_schedule_observations` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`profile_id` text NOT NULL,
	`schedule_id` text NOT NULL,
	`schedule_revision` integer NOT NULL,
	`configuration_id` text NOT NULL,
	`configuration_digest` text NOT NULL,
	`cadence` text NOT NULL,
	`intended_local_time` text NOT NULL,
	`timezone` text NOT NULL,
	`utc_offset_minutes` integer NOT NULL,
	`schedule_active` integer NOT NULL,
	`execution_state` text NOT NULL,
	`activation_id` text NOT NULL,
	`activation_audit_event_id` text NOT NULL,
	`source_digest` text NOT NULL,
	`observation_digest` text NOT NULL,
	`command_id` text NOT NULL,
	`observed_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`profile_id`) REFERENCES `customer_profiles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`schedule_id`) REFERENCES `prospecting_schedules`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`configuration_id`) REFERENCES `typed_configurations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`activation_id`) REFERENCES `profile_configuration_activations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`activation_audit_event_id`) REFERENCES `audit_events`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`command_id`) REFERENCES `handoff_recovery_commands`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "handoff_schedule_observation_digest_check" CHECK(length("handoff_schedule_observations"."configuration_digest") = 64 and "handoff_schedule_observations"."configuration_digest" not glob '*[^0-9a-f]*' and length("handoff_schedule_observations"."source_digest") = 64 and "handoff_schedule_observations"."source_digest" not glob '*[^0-9a-f]*' and length("handoff_schedule_observations"."observation_digest") = 64 and "handoff_schedule_observations"."observation_digest" not glob '*[^0-9a-f]*'),
	CONSTRAINT "handoff_schedule_observation_shape_check" CHECK("handoff_schedule_observations"."schedule_revision" > 0 and "handoff_schedule_observations"."intended_local_time" glob '[0-2][0-9]:[0-5][0-9]' and length("handoff_schedule_observations"."timezone") between 1 and 64 and "handoff_schedule_observations"."timezone" not glob '*[^A-Za-z0-9_+/-]*' and length("handoff_schedule_observations"."cadence") between 1 and 32 and "handoff_schedule_observations"."cadence" not glob '*[^a-z0-9_]*' and length("handoff_schedule_observations"."execution_state") between 1 and 64 and "handoff_schedule_observations"."execution_state" not glob '*[^a-z0-9_]*' and "handoff_schedule_observations"."utc_offset_minutes" between -840 and 840 and "handoff_schedule_observations"."schedule_active" in (0,1) and "handoff_schedule_observations"."observed_at" <= "handoff_schedule_observations"."created_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `handoff_schedule_observation_digest_unique` ON `handoff_schedule_observations` (`workspace_id`,`observation_digest`);--> statement-breakpoint
CREATE UNIQUE INDEX `handoff_schedule_observation_command_unique` ON `handoff_schedule_observations` (`command_id`);--> statement-breakpoint
CREATE INDEX `handoff_schedule_observation_profile_idx` ON `handoff_schedule_observations` (`workspace_id`,`profile_id`,`observed_at`);--> statement-breakpoint
CREATE TABLE `handoff_suppression_exclusions` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`snapshot_id` text NOT NULL,
	`ordinal` integer NOT NULL,
	`prospect_id` text NOT NULL,
	`contact_id` text,
	`tombstone_id` text NOT NULL,
	`scope_kind` text NOT NULL,
	`exclusion_digest` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`snapshot_id`) REFERENCES `handoff_export_snapshots`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`prospect_id`) REFERENCES `profile_prospects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tombstone_id`) REFERENCES `outreach_suppression_tombstones`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "handoff_exclusion_shape_check" CHECK("handoff_suppression_exclusions"."ordinal" >= 0 and length("handoff_suppression_exclusions"."exclusion_digest") = 64 and "handoff_suppression_exclusions"."exclusion_digest" not glob '*[^0-9a-f]*' and "handoff_suppression_exclusions"."scope_kind" in ('exact_email','confirmed_email_domain','e164_phone','contact','organization','company'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `handoff_exclusion_ordinal_unique` ON `handoff_suppression_exclusions` (`snapshot_id`,`ordinal`);--> statement-breakpoint
CREATE UNIQUE INDEX `handoff_exclusion_digest_unique` ON `handoff_suppression_exclusions` (`snapshot_id`,`exclusion_digest`);--> statement-breakpoint
CREATE TABLE `handoff_weekly_report_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`report_id` text NOT NULL,
	`prospect_id` text NOT NULL,
	`transition_event_id` text NOT NULL,
	`ordinal` integer NOT NULL,
	`occurred_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`report_id`) REFERENCES `handoff_weekly_reports`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`prospect_id`) REFERENCES `profile_prospects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`transition_event_id`) REFERENCES `prospect_transition_events`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "handoff_weekly_entry_ordinal_check" CHECK("handoff_weekly_report_entries"."ordinal" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `handoff_weekly_entry_prospect_unique` ON `handoff_weekly_report_entries` (`report_id`,`prospect_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `handoff_weekly_entry_ordinal_unique` ON `handoff_weekly_report_entries` (`report_id`,`ordinal`);--> statement-breakpoint
CREATE UNIQUE INDEX `handoff_weekly_entry_transition_unique` ON `handoff_weekly_report_entries` (`report_id`,`transition_event_id`);--> statement-breakpoint
CREATE TABLE `handoff_weekly_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`command_id` text NOT NULL,
	`definition_version` text NOT NULL,
	`time_zone` text NOT NULL,
	`week_start_local` text NOT NULL,
	`week_end_local` text NOT NULL,
	`window_start_at` integer NOT NULL,
	`window_end_at` integer NOT NULL,
	`as_of` integer NOT NULL,
	`target_count` integer NOT NULL,
	`cohort_count` integer NOT NULL,
	`history_digest` text NOT NULL,
	`projection_digest` text NOT NULL,
	`report_digest` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`command_id`) REFERENCES `handoff_recovery_commands`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "handoff_weekly_report_digest_check" CHECK(length("handoff_weekly_reports"."history_digest") = 64 and "handoff_weekly_reports"."history_digest" not glob '*[^0-9a-f]*' and length("handoff_weekly_reports"."projection_digest") = 64 and "handoff_weekly_reports"."projection_digest" not glob '*[^0-9a-f]*' and length("handoff_weekly_reports"."report_digest") = 64 and "handoff_weekly_reports"."report_digest" not glob '*[^0-9a-f]*'),
	CONSTRAINT "handoff_weekly_report_window_check" CHECK("handoff_weekly_reports"."window_end_at" - "handoff_weekly_reports"."window_start_at" between 601200000 and 608400000 and "handoff_weekly_reports"."as_of" >= "handoff_weekly_reports"."window_start_at" and "handoff_weekly_reports"."week_start_local" glob '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]' and "handoff_weekly_reports"."week_end_local" glob '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]' and "handoff_weekly_reports"."week_start_local" < "handoff_weekly_reports"."week_end_local"),
	CONSTRAINT "handoff_weekly_report_shape_check" CHECK("handoff_weekly_reports"."target_count" > 0 and "handoff_weekly_reports"."cohort_count" >= 0 and length("handoff_weekly_reports"."definition_version") between 1 and 128 and "handoff_weekly_reports"."definition_version" not glob '*[^A-Za-z0-9._:/-]*' and length("handoff_weekly_reports"."time_zone") between 1 and 64 and "handoff_weekly_reports"."time_zone" not glob '*[^A-Za-z0-9_+/-]*')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `handoff_weekly_report_digest_unique` ON `handoff_weekly_reports` (`workspace_id`,`report_digest`);--> statement-breakpoint
CREATE UNIQUE INDEX `handoff_weekly_report_command_unique` ON `handoff_weekly_reports` (`command_id`);--> statement-breakpoint
CREATE INDEX `handoff_weekly_report_window_idx` ON `handoff_weekly_reports` (`workspace_id`,`window_start_at`);--> statement-breakpoint
CREATE TABLE `recovery_archives` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`command_id` text NOT NULL,
	`format_version` text NOT NULL,
	`schema_version` text NOT NULL,
	`compatibility_min` text NOT NULL,
	`compatibility_max` text NOT NULL,
	`manifest_json` text NOT NULL,
	`manifest_digest` text NOT NULL,
	`ciphertext_sha256` text NOT NULL,
	`byte_length` integer NOT NULL,
	`object_key` text NOT NULL,
	`cipher` text NOT NULL,
	`kdf` text NOT NULL,
	`kdf_parameters_json` text NOT NULL,
	`record_count` integer NOT NULL,
	`object_count` integer NOT NULL,
	`tombstone_count` integer NOT NULL,
	`reauth_reference_digest` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`command_id`) REFERENCES `handoff_recovery_commands`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "recovery_archive_digest_check" CHECK(length("recovery_archives"."manifest_digest") = 64 and "recovery_archives"."manifest_digest" not glob '*[^0-9a-f]*' and length("recovery_archives"."ciphertext_sha256") = 64 and "recovery_archives"."ciphertext_sha256" not glob '*[^0-9a-f]*' and length("recovery_archives"."reauth_reference_digest") = 64 and "recovery_archives"."reauth_reference_digest" not glob '*[^0-9a-f]*'),
	CONSTRAINT "recovery_archive_envelope_check" CHECK(length("recovery_archives"."format_version") between 1 and 128 and "recovery_archives"."format_version" not glob '*[^A-Za-z0-9._:/-]*' and length("recovery_archives"."schema_version") between 1 and 128 and "recovery_archives"."schema_version" not glob '*[^A-Za-z0-9._:/-]*' and length("recovery_archives"."compatibility_min") between 1 and 128 and "recovery_archives"."compatibility_min" not glob '*[^A-Za-z0-9._:/-]*' and length("recovery_archives"."compatibility_max") between 1 and 128 and "recovery_archives"."compatibility_max" not glob '*[^A-Za-z0-9._:/-]*' and length("recovery_archives"."cipher") between 1 and 32 and "recovery_archives"."cipher" not glob '*[^a-z0-9-]*' and length("recovery_archives"."kdf") between 1 and 32 and "recovery_archives"."kdf" not glob '*[^a-z0-9-]*' and length("recovery_archives"."object_key") between 1 and 512 and "recovery_archives"."object_key" not glob '*[^A-Za-z0-9._/-]*' and "recovery_archives"."object_key" not like '%..%' and "recovery_archives"."object_key" not like '/%'),
	CONSTRAINT "recovery_archive_metadata_check" CHECK(json_valid("recovery_archives"."manifest_json") and length("recovery_archives"."manifest_json") <= 65536 and lower("recovery_archives"."manifest_json") not like '%passphrase%' and lower("recovery_archives"."manifest_json") not like '%password%' and lower("recovery_archives"."manifest_json") not like '%secret%' and lower("recovery_archives"."manifest_json") not like '%credential%' and lower("recovery_archives"."manifest_json") not like '%bearer%' and lower("recovery_archives"."manifest_json") not like '%oauth%' and json_valid("recovery_archives"."kdf_parameters_json") and length("recovery_archives"."kdf_parameters_json") <= 65536 and lower("recovery_archives"."kdf_parameters_json") not like '%passphrase%' and lower("recovery_archives"."kdf_parameters_json") not like '%password%' and lower("recovery_archives"."kdf_parameters_json") not like '%secret%' and lower("recovery_archives"."kdf_parameters_json") not like '%credential%' and lower("recovery_archives"."kdf_parameters_json") not like '%bearer%' and lower("recovery_archives"."kdf_parameters_json") not like '%oauth%' and "recovery_archives"."byte_length" > 0 and "recovery_archives"."record_count" >= 0 and "recovery_archives"."object_count" >= 0 and "recovery_archives"."tombstone_count" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `recovery_archive_manifest_unique` ON `recovery_archives` (`workspace_id`,`manifest_digest`);--> statement-breakpoint
CREATE UNIQUE INDEX `recovery_archive_ciphertext_unique` ON `recovery_archives` (`ciphertext_sha256`);--> statement-breakpoint
CREATE UNIQUE INDEX `recovery_archive_object_unique` ON `recovery_archives` (`workspace_id`,`object_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `recovery_archive_command_unique` ON `recovery_archives` (`command_id`);--> statement-breakpoint
CREATE TABLE `recovery_dry_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`command_id` text NOT NULL,
	`source_workspace_id` text NOT NULL,
	`archive_manifest_digest` text NOT NULL,
	`archive_ciphertext_sha256` text NOT NULL,
	`archive_schema_version` text NOT NULL,
	`outcome` text NOT NULL,
	`reason_code` text NOT NULL,
	`nonce_digest` text,
	`expires_at` integer,
	`target_state_digest` text NOT NULL,
	`invariant_digest` text,
	`dry_run_digest` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`command_id`) REFERENCES `handoff_recovery_commands`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "recovery_dry_run_digest_check" CHECK(length("recovery_dry_runs"."archive_manifest_digest") = 64 and "recovery_dry_runs"."archive_manifest_digest" not glob '*[^0-9a-f]*' and length("recovery_dry_runs"."archive_ciphertext_sha256") = 64 and "recovery_dry_runs"."archive_ciphertext_sha256" not glob '*[^0-9a-f]*' and length("recovery_dry_runs"."target_state_digest") = 64 and "recovery_dry_runs"."target_state_digest" not glob '*[^0-9a-f]*' and length("recovery_dry_runs"."dry_run_digest") = 64 and "recovery_dry_runs"."dry_run_digest" not glob '*[^0-9a-f]*' and length("recovery_dry_runs"."source_workspace_id") between 1 and 128 and "recovery_dry_runs"."source_workspace_id" not glob '*[^A-Za-z0-9._:-]*' and length("recovery_dry_runs"."archive_schema_version") between 1 and 128 and "recovery_dry_runs"."archive_schema_version" not glob '*[^A-Za-z0-9._:/-]*' and length("recovery_dry_runs"."reason_code") between 1 and 80 and "recovery_dry_runs"."reason_code" not glob '*[^a-z0-9._:-]*'),
	CONSTRAINT "recovery_dry_run_outcome_check" CHECK(("recovery_dry_runs"."outcome" = 'accepted' and "recovery_dry_runs"."reason_code" = 'verified' and "recovery_dry_runs"."nonce_digest" is not null and length("recovery_dry_runs"."nonce_digest") = 64 and "recovery_dry_runs"."nonce_digest" not glob '*[^0-9a-f]*' and "recovery_dry_runs"."invariant_digest" is not null and length("recovery_dry_runs"."invariant_digest") = 64 and "recovery_dry_runs"."invariant_digest" not glob '*[^0-9a-f]*' and "recovery_dry_runs"."expires_at" > "recovery_dry_runs"."created_at") or ("recovery_dry_runs"."outcome" = 'refused' and "recovery_dry_runs"."reason_code" <> 'verified' and "recovery_dry_runs"."nonce_digest" is null and "recovery_dry_runs"."expires_at" is null and ("recovery_dry_runs"."invariant_digest" is null or length("recovery_dry_runs"."invariant_digest") = 64 and "recovery_dry_runs"."invariant_digest" not glob '*[^0-9a-f]*')))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `recovery_dry_run_digest_unique` ON `recovery_dry_runs` (`workspace_id`,`dry_run_digest`);--> statement-breakpoint
CREATE UNIQUE INDEX `recovery_dry_run_nonce_unique` ON `recovery_dry_runs` (`nonce_digest`);--> statement-breakpoint
CREATE UNIQUE INDEX `recovery_dry_run_command_unique` ON `recovery_dry_runs` (`command_id`);--> statement-breakpoint
CREATE TABLE `recovery_restore_locks` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`dry_run_id` text NOT NULL,
	`command_id` text NOT NULL,
	`nonce_digest` text NOT NULL,
	`acquired_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`dry_run_id`) REFERENCES `recovery_dry_runs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`command_id`) REFERENCES `handoff_recovery_commands`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "recovery_restore_lock_shape_check" CHECK(length("recovery_restore_locks"."nonce_digest") = 64 and "recovery_restore_locks"."nonce_digest" not glob '*[^0-9a-f]*' and "recovery_restore_locks"."acquired_at" <= "recovery_restore_locks"."created_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `recovery_restore_lock_dry_run_unique` ON `recovery_restore_locks` (`dry_run_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `recovery_restore_lock_command_unique` ON `recovery_restore_locks` (`command_id`);--> statement-breakpoint
CREATE TABLE `recovery_restore_results` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`lock_id` text NOT NULL,
	`command_id` text NOT NULL,
	`outcome` text NOT NULL,
	`reason_code` text NOT NULL,
	`restored_record_count` integer NOT NULL,
	`restored_object_count` integer NOT NULL,
	`result_digest` text NOT NULL,
	`schedules_enabled` integer DEFAULT false NOT NULL,
	`effects_enabled` integer DEFAULT false NOT NULL,
	`completed_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`lock_id`) REFERENCES `recovery_restore_locks`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`command_id`) REFERENCES `handoff_recovery_commands`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "recovery_restore_result_disabled_check" CHECK("recovery_restore_results"."schedules_enabled" = 0 and "recovery_restore_results"."effects_enabled" = 0),
	CONSTRAINT "recovery_restore_result_shape_check" CHECK("recovery_restore_results"."outcome" in ('applied','rolled_back') and length("recovery_restore_results"."reason_code") between 1 and 80 and "recovery_restore_results"."reason_code" not glob '*[^a-z0-9._:-]*' and length("recovery_restore_results"."result_digest") = 64 and "recovery_restore_results"."result_digest" not glob '*[^0-9a-f]*' and "recovery_restore_results"."restored_record_count" >= 0 and "recovery_restore_results"."restored_object_count" >= 0 and ("recovery_restore_results"."outcome" = 'applied' or ("recovery_restore_results"."restored_record_count" = 0 and "recovery_restore_results"."restored_object_count" = 0)) and "recovery_restore_results"."completed_at" <= "recovery_restore_results"."created_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `recovery_restore_result_lock_unique` ON `recovery_restore_results` (`lock_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `recovery_restore_result_command_unique` ON `recovery_restore_results` (`command_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `recovery_restore_result_applied_unique` ON `recovery_restore_results` (`workspace_id`) WHERE "recovery_restore_results"."outcome" = 'applied';--> statement-breakpoint
CREATE TRIGGER `handoff_recovery_command_scope_insert`
BEFORE INSERT ON `handoff_recovery_commands`
WHEN NOT EXISTS (
  SELECT 1 FROM `workspaces` workspace WHERE workspace.id = NEW.workspace_id AND workspace.owner_subject = NEW.owner_subject
)
BEGIN SELECT RAISE(ABORT, 'handoff recovery command requires the workspace owner'); END;--> statement-breakpoint
CREATE TRIGGER `handoff_recovery_audit_scope_insert`
BEFORE INSERT ON `handoff_recovery_audit_events`
WHEN NOT EXISTS (
  SELECT 1 FROM `workspaces` workspace WHERE workspace.id = NEW.workspace_id AND workspace.owner_subject = NEW.actor_subject
) OR (
  NEW.command_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM `handoff_recovery_commands` command WHERE command.id = NEW.command_id AND command.workspace_id = NEW.workspace_id
  )
)
BEGIN SELECT RAISE(ABORT, 'handoff recovery audit requires the workspace owner and an in-scope command'); END;--> statement-breakpoint
CREATE TRIGGER `handoff_schedule_observation_scope_insert`
BEFORE INSERT ON `handoff_schedule_observations`
WHEN NOT EXISTS (
  SELECT 1 FROM `prospecting_schedules` schedule
  WHERE schedule.id = NEW.schedule_id
    AND schedule.workspace_id = NEW.workspace_id
    AND schedule.profile_id = NEW.profile_id
    AND schedule.revision = NEW.schedule_revision
    AND schedule.configuration_id = NEW.configuration_id
    AND schedule.configuration_digest = NEW.configuration_digest
    AND schedule.cadence = NEW.cadence
    AND schedule.intended_local_time = NEW.intended_local_time
    AND schedule.timezone = NEW.timezone
    AND schedule.utc_offset_minutes = NEW.utc_offset_minutes
    AND schedule.active = NEW.schedule_active
    AND schedule.execution_state = NEW.execution_state
) OR NOT EXISTS (
  SELECT 1 FROM `profile_configuration_activations` activation
  WHERE activation.id = NEW.activation_id
    AND activation.workspace_id = NEW.workspace_id
    AND activation.profile_id = NEW.profile_id
    AND activation.configuration_id = NEW.configuration_id
    AND activation.audit_event_id = NEW.activation_audit_event_id
) OR NOT EXISTS (
  SELECT 1 FROM `handoff_recovery_commands` command WHERE command.id = NEW.command_id AND command.workspace_id = NEW.workspace_id
)
BEGIN SELECT RAISE(ABORT, 'schedule observation requires the exact upstream schedule state'); END;--> statement-breakpoint
CREATE TRIGGER `handoff_weekly_report_scope_insert`
BEFORE INSERT ON `handoff_weekly_reports`
WHEN NOT EXISTS (
  SELECT 1 FROM `handoff_recovery_commands` command WHERE command.id = NEW.command_id AND command.workspace_id = NEW.workspace_id
)
BEGIN SELECT RAISE(ABORT, 'weekly report requires an in-scope command'); END;--> statement-breakpoint
CREATE TRIGGER `handoff_weekly_entry_scope_insert`
BEFORE INSERT ON `handoff_weekly_report_entries`
WHEN NOT EXISTS (
  SELECT 1 FROM `handoff_weekly_reports` report
  JOIN `prospect_transition_events` event ON event.id = NEW.transition_event_id
  WHERE report.id = NEW.report_id
    AND report.workspace_id = NEW.workspace_id
    AND NEW.ordinal < report.cohort_count
    AND event.workspace_id = NEW.workspace_id
    AND event.prospect_id = NEW.prospect_id
    AND event.new_state = 'ExportReady'
    AND event.occurred_at = NEW.occurred_at
    AND event.occurred_at >= report.window_start_at
    AND event.occurred_at < report.window_end_at
    AND event.occurred_at <= report.as_of
    AND NOT EXISTS (
      SELECT 1 FROM `prospect_transition_events` earlier
      WHERE earlier.prospect_id = event.prospect_id
        AND earlier.new_state = 'ExportReady'
        AND earlier.sequence < event.sequence
    )
)
BEGIN SELECT RAISE(ABORT, 'weekly report entry must reference the first Export-ready transition inside its report window and cohort'); END;--> statement-breakpoint
CREATE TRIGGER `handoff_export_snapshot_fence_insert`
BEFORE INSERT ON `handoff_export_snapshots`
WHEN NOT EXISTS (
  SELECT 1 FROM `handoff_recovery_commands` command WHERE command.id = NEW.command_id AND command.workspace_id = NEW.workspace_id
) OR NEW.suppression_fence_count <> (
  SELECT COUNT(*) FROM `outreach_suppression_tombstones` tombstone WHERE tombstone.workspace_id = NEW.workspace_id
)
BEGIN SELECT RAISE(ABORT, 'export snapshot suppression fence is stale or out of scope'); END;--> statement-breakpoint
CREATE TRIGGER `handoff_export_row_scope_insert`
BEFORE INSERT ON `handoff_export_snapshot_rows`
WHEN NOT EXISTS (
  SELECT 1 FROM `handoff_export_snapshots` snapshot
  WHERE snapshot.id = NEW.snapshot_id AND snapshot.workspace_id = NEW.workspace_id AND NEW.ordinal < snapshot.contact_row_count
) OR NOT EXISTS (
  SELECT 1 FROM `outreach_package_approvals` approval
  JOIN `outreach_package_versions` version ON version.id = approval.package_version_id AND version.workspace_id = approval.workspace_id
  JOIN `outreach_packages` package ON package.id = version.package_id AND package.workspace_id = version.workspace_id
  JOIN `contacts` contact ON contact.id = package.contact_id AND contact.workspace_id = package.workspace_id
  WHERE approval.id = NEW.package_approval_id
    AND approval.workspace_id = NEW.workspace_id
    AND version.id = NEW.package_version_id
    AND package.prospect_id = NEW.prospect_id
    AND package.contact_id = NEW.contact_id
)
BEGIN SELECT RAISE(ABORT, 'export snapshot row requires in-scope package lineage'); END;--> statement-breakpoint
CREATE TRIGGER `handoff_exclusion_scope_insert`
BEFORE INSERT ON `handoff_suppression_exclusions`
WHEN NOT EXISTS (
  SELECT 1 FROM `handoff_export_snapshots` snapshot
  WHERE snapshot.id = NEW.snapshot_id AND snapshot.workspace_id = NEW.workspace_id AND NEW.ordinal < snapshot.exclusion_count
) OR NOT EXISTS (
  SELECT 1 FROM `outreach_suppression_tombstones` tombstone
  WHERE tombstone.id = NEW.tombstone_id AND tombstone.workspace_id = NEW.workspace_id AND tombstone.subject_kind = NEW.scope_kind
) OR NOT EXISTS (
  SELECT 1 FROM `profile_prospects` prospect WHERE prospect.id = NEW.prospect_id AND prospect.workspace_id = NEW.workspace_id
) OR (
  NEW.contact_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM `contacts` contact WHERE contact.id = NEW.contact_id AND contact.workspace_id = NEW.workspace_id
  )
)
BEGIN SELECT RAISE(ABORT, 'suppression exclusion requires in-scope tombstone lineage'); END;--> statement-breakpoint
CREATE TRIGGER `handoff_export_artifact_scope_insert`
BEFORE INSERT ON `handoff_export_artifacts`
WHEN NOT EXISTS (
  SELECT 1 FROM `handoff_export_snapshots` snapshot
  WHERE snapshot.id = NEW.snapshot_id
    AND snapshot.workspace_id = NEW.workspace_id
    AND snapshot.contact_row_count = NEW.row_count
    AND snapshot.prospect_count = NEW.prospect_count
) OR NOT EXISTS (
  SELECT 1 FROM `handoff_recovery_commands` command WHERE command.id = NEW.command_id AND command.workspace_id = NEW.workspace_id
)
BEGIN SELECT RAISE(ABORT, 'export artifact requires its in-scope frozen snapshot'); END;--> statement-breakpoint
CREATE TRIGGER `handoff_delivery_scope_insert`
BEFORE INSERT ON `handoff_delivery_events`
WHEN NOT EXISTS (
  SELECT 1 FROM `handoff_recovery_commands` command WHERE command.id = NEW.command_id AND command.workspace_id = NEW.workspace_id
) OR (
  NEW.subject_kind = 'export_artifact' AND NOT EXISTS (
    SELECT 1 FROM `handoff_export_artifacts` artifact WHERE artifact.id = NEW.subject_id AND artifact.workspace_id = NEW.workspace_id
  )
) OR (
  NEW.subject_kind = 'recovery_archive' AND NOT EXISTS (
    SELECT 1 FROM `recovery_archives` archive WHERE archive.id = NEW.subject_id AND archive.workspace_id = NEW.workspace_id
  )
) OR (
  NEW.event_kind <> 'issued' AND NOT EXISTS (
    SELECT 1 FROM `handoff_delivery_events` issued
    WHERE issued.workspace_id = NEW.workspace_id AND issued.subject_kind = NEW.subject_kind
      AND issued.subject_id = NEW.subject_id AND issued.event_kind = 'issued' AND issued.occurred_at <= NEW.occurred_at
  )
)
BEGIN SELECT RAISE(ABORT, 'delivery event requires an in-scope issued subject'); END;--> statement-breakpoint
CREATE TRIGGER `recovery_archive_scope_insert`
BEFORE INSERT ON `recovery_archives`
WHEN NOT EXISTS (
  SELECT 1 FROM `handoff_recovery_commands` command WHERE command.id = NEW.command_id AND command.workspace_id = NEW.workspace_id
)
BEGIN SELECT RAISE(ABORT, 'recovery archive requires an in-scope command'); END;--> statement-breakpoint
CREATE TRIGGER `recovery_dry_run_scope_insert`
BEFORE INSERT ON `recovery_dry_runs`
WHEN NOT EXISTS (
  SELECT 1 FROM `handoff_recovery_commands` command WHERE command.id = NEW.command_id AND command.workspace_id = NEW.workspace_id
)
BEGIN SELECT RAISE(ABORT, 'restore dry run requires an in-scope command'); END;--> statement-breakpoint
CREATE TRIGGER `recovery_restore_lock_dry_run_insert`
BEFORE INSERT ON `recovery_restore_locks`
WHEN NOT EXISTS (
  SELECT 1 FROM `recovery_dry_runs` dry_run
  WHERE dry_run.id = NEW.dry_run_id
    AND dry_run.workspace_id = NEW.workspace_id
    AND dry_run.outcome = 'accepted'
    AND dry_run.nonce_digest = NEW.nonce_digest
    AND NEW.acquired_at <= dry_run.expires_at
) OR NOT EXISTS (
  SELECT 1 FROM `handoff_recovery_commands` command WHERE command.id = NEW.command_id AND command.workspace_id = NEW.workspace_id
)
BEGIN SELECT RAISE(ABORT, 'restore lock requires a current accepted dry run'); END;--> statement-breakpoint
CREATE TRIGGER `recovery_restore_lock_exclusive_insert`
BEFORE INSERT ON `recovery_restore_locks`
WHEN EXISTS (
  SELECT 1 FROM `recovery_restore_locks` open_lock
  WHERE open_lock.workspace_id = NEW.workspace_id
    AND NOT EXISTS (SELECT 1 FROM `recovery_restore_results` result WHERE result.lock_id = open_lock.id)
) OR EXISTS (
  SELECT 1 FROM `recovery_restore_results` applied WHERE applied.workspace_id = NEW.workspace_id AND applied.outcome = 'applied'
)
BEGIN SELECT RAISE(ABORT, 'restore target already has an active or applied restore'); END;--> statement-breakpoint
CREATE TRIGGER `recovery_restore_result_scope_insert`
BEFORE INSERT ON `recovery_restore_results`
WHEN NOT EXISTS (
  SELECT 1 FROM `recovery_restore_locks` lock WHERE lock.id = NEW.lock_id AND lock.workspace_id = NEW.workspace_id
) OR NOT EXISTS (
  SELECT 1 FROM `handoff_recovery_commands` command WHERE command.id = NEW.command_id AND command.workspace_id = NEW.workspace_id
)
BEGIN SELECT RAISE(ABORT, 'restore result requires its in-scope restore lock'); END;--> statement-breakpoint
CREATE TRIGGER `recovery_restore_result_schedule_fence`
BEFORE INSERT ON `recovery_restore_results`
WHEN NEW.outcome = 'applied' AND EXISTS (
  SELECT 1 FROM `prospecting_schedules` schedule WHERE schedule.workspace_id = NEW.workspace_id AND schedule.active = 1
)
BEGIN SELECT RAISE(ABORT, 'restored target must keep schedules disabled until a fresh Phase 4 readiness activation'); END;--> statement-breakpoint
CREATE TRIGGER `handoff_recovery_commands_immutable_update`
BEFORE UPDATE ON `handoff_recovery_commands`
BEGIN SELECT RAISE(ABORT, 'handoff_recovery_commands evidence is immutable'); END;--> statement-breakpoint
CREATE TRIGGER `handoff_recovery_commands_immutable_delete`
BEFORE DELETE ON `handoff_recovery_commands`
BEGIN SELECT RAISE(ABORT, 'handoff_recovery_commands evidence is immutable'); END;--> statement-breakpoint
CREATE TRIGGER `handoff_recovery_audit_events_immutable_update`
BEFORE UPDATE ON `handoff_recovery_audit_events`
BEGIN SELECT RAISE(ABORT, 'handoff_recovery_audit_events evidence is immutable'); END;--> statement-breakpoint
CREATE TRIGGER `handoff_recovery_audit_events_immutable_delete`
BEFORE DELETE ON `handoff_recovery_audit_events`
BEGIN SELECT RAISE(ABORT, 'handoff_recovery_audit_events evidence is immutable'); END;--> statement-breakpoint
CREATE TRIGGER `handoff_schedule_observations_immutable_update`
BEFORE UPDATE ON `handoff_schedule_observations`
BEGIN SELECT RAISE(ABORT, 'handoff_schedule_observations evidence is immutable'); END;--> statement-breakpoint
CREATE TRIGGER `handoff_schedule_observations_immutable_delete`
BEFORE DELETE ON `handoff_schedule_observations`
BEGIN SELECT RAISE(ABORT, 'handoff_schedule_observations evidence is immutable'); END;--> statement-breakpoint
CREATE TRIGGER `handoff_weekly_reports_immutable_update`
BEFORE UPDATE ON `handoff_weekly_reports`
BEGIN SELECT RAISE(ABORT, 'handoff_weekly_reports evidence is immutable'); END;--> statement-breakpoint
CREATE TRIGGER `handoff_weekly_reports_immutable_delete`
BEFORE DELETE ON `handoff_weekly_reports`
BEGIN SELECT RAISE(ABORT, 'handoff_weekly_reports evidence is immutable'); END;--> statement-breakpoint
CREATE TRIGGER `handoff_weekly_report_entries_immutable_update`
BEFORE UPDATE ON `handoff_weekly_report_entries`
BEGIN SELECT RAISE(ABORT, 'handoff_weekly_report_entries evidence is immutable'); END;--> statement-breakpoint
CREATE TRIGGER `handoff_weekly_report_entries_immutable_delete`
BEFORE DELETE ON `handoff_weekly_report_entries`
BEGIN SELECT RAISE(ABORT, 'handoff_weekly_report_entries evidence is immutable'); END;--> statement-breakpoint
CREATE TRIGGER `handoff_export_snapshots_immutable_update`
BEFORE UPDATE ON `handoff_export_snapshots`
BEGIN SELECT RAISE(ABORT, 'handoff_export_snapshots evidence is immutable'); END;--> statement-breakpoint
CREATE TRIGGER `handoff_export_snapshots_immutable_delete`
BEFORE DELETE ON `handoff_export_snapshots`
BEGIN SELECT RAISE(ABORT, 'handoff_export_snapshots evidence is immutable'); END;--> statement-breakpoint
CREATE TRIGGER `handoff_export_snapshot_rows_immutable_update`
BEFORE UPDATE ON `handoff_export_snapshot_rows`
BEGIN SELECT RAISE(ABORT, 'handoff_export_snapshot_rows evidence is immutable'); END;--> statement-breakpoint
CREATE TRIGGER `handoff_export_snapshot_rows_immutable_delete`
BEFORE DELETE ON `handoff_export_snapshot_rows`
BEGIN SELECT RAISE(ABORT, 'handoff_export_snapshot_rows evidence is immutable'); END;--> statement-breakpoint
CREATE TRIGGER `handoff_suppression_exclusions_immutable_update`
BEFORE UPDATE ON `handoff_suppression_exclusions`
BEGIN SELECT RAISE(ABORT, 'handoff_suppression_exclusions evidence is immutable'); END;--> statement-breakpoint
CREATE TRIGGER `handoff_suppression_exclusions_immutable_delete`
BEFORE DELETE ON `handoff_suppression_exclusions`
BEGIN SELECT RAISE(ABORT, 'handoff_suppression_exclusions evidence is immutable'); END;--> statement-breakpoint
CREATE TRIGGER `handoff_export_artifacts_immutable_update`
BEFORE UPDATE ON `handoff_export_artifacts`
BEGIN SELECT RAISE(ABORT, 'handoff_export_artifacts evidence is immutable'); END;--> statement-breakpoint
CREATE TRIGGER `handoff_export_artifacts_immutable_delete`
BEFORE DELETE ON `handoff_export_artifacts`
BEGIN SELECT RAISE(ABORT, 'handoff_export_artifacts evidence is immutable'); END;--> statement-breakpoint
CREATE TRIGGER `handoff_delivery_events_immutable_update`
BEFORE UPDATE ON `handoff_delivery_events`
BEGIN SELECT RAISE(ABORT, 'handoff_delivery_events evidence is immutable'); END;--> statement-breakpoint
CREATE TRIGGER `handoff_delivery_events_immutable_delete`
BEFORE DELETE ON `handoff_delivery_events`
BEGIN SELECT RAISE(ABORT, 'handoff_delivery_events evidence is immutable'); END;--> statement-breakpoint
CREATE TRIGGER `recovery_archives_immutable_update`
BEFORE UPDATE ON `recovery_archives`
BEGIN SELECT RAISE(ABORT, 'recovery_archives evidence is immutable'); END;--> statement-breakpoint
CREATE TRIGGER `recovery_archives_immutable_delete`
BEFORE DELETE ON `recovery_archives`
BEGIN SELECT RAISE(ABORT, 'recovery_archives evidence is immutable'); END;--> statement-breakpoint
CREATE TRIGGER `recovery_dry_runs_immutable_update`
BEFORE UPDATE ON `recovery_dry_runs`
BEGIN SELECT RAISE(ABORT, 'recovery_dry_runs evidence is immutable'); END;--> statement-breakpoint
CREATE TRIGGER `recovery_dry_runs_immutable_delete`
BEFORE DELETE ON `recovery_dry_runs`
BEGIN SELECT RAISE(ABORT, 'recovery_dry_runs evidence is immutable'); END;--> statement-breakpoint
CREATE TRIGGER `recovery_restore_locks_immutable_update`
BEFORE UPDATE ON `recovery_restore_locks`
BEGIN SELECT RAISE(ABORT, 'recovery_restore_locks evidence is immutable'); END;--> statement-breakpoint
CREATE TRIGGER `recovery_restore_locks_immutable_delete`
BEFORE DELETE ON `recovery_restore_locks`
BEGIN SELECT RAISE(ABORT, 'recovery_restore_locks evidence is immutable'); END;--> statement-breakpoint
CREATE TRIGGER `recovery_restore_results_immutable_update`
BEFORE UPDATE ON `recovery_restore_results`
BEGIN SELECT RAISE(ABORT, 'recovery_restore_results evidence is immutable'); END;--> statement-breakpoint
CREATE TRIGGER `recovery_restore_results_immutable_delete`
BEFORE DELETE ON `recovery_restore_results`
BEGIN SELECT RAISE(ABORT, 'recovery_restore_results evidence is immutable'); END;
