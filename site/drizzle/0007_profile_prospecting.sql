CREATE TABLE `profile_configuration_activations` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`profile_id` text NOT NULL,
	`candidate_id` text NOT NULL,
	`previous_configuration_id` text,
	`configuration_id` text NOT NULL,
	`authority_command_id` text NOT NULL,
	`audit_event_id` text NOT NULL,
	`operation_digest` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`profile_id`) REFERENCES `customer_profiles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`candidate_id`) REFERENCES `profile_configuration_candidates`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`previous_configuration_id`) REFERENCES `typed_configurations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`configuration_id`) REFERENCES `typed_configurations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`authority_command_id`) REFERENCES `authority_commands`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`audit_event_id`) REFERENCES `audit_events`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "profile_configuration_activation_digest_check" CHECK(length("profile_configuration_activations"."operation_digest") = 64 and "profile_configuration_activations"."operation_digest" not glob '*[^0-9a-f]*')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `profile_configuration_activation_candidate_unique` ON `profile_configuration_activations` (`candidate_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `profile_configuration_activation_command_unique` ON `profile_configuration_activations` (`authority_command_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `profile_configuration_activation_operation_unique` ON `profile_configuration_activations` (`workspace_id`,`operation_digest`);--> statement-breakpoint
CREATE TABLE `profile_configuration_candidates` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`profile_id` text NOT NULL,
	`configuration_id` text NOT NULL,
	`predecessor_configuration_id` text,
	`authority_command_id` text NOT NULL,
	`audit_event_id` text NOT NULL,
	`candidate_digest` text NOT NULL,
	`status` text DEFAULT 'candidate' NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `customer_profiles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`configuration_id`) REFERENCES `typed_configurations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`predecessor_configuration_id`) REFERENCES `typed_configurations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`authority_command_id`) REFERENCES `authority_commands`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`audit_event_id`) REFERENCES `audit_events`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "profile_configuration_candidate_digest_check" CHECK(length("profile_configuration_candidates"."candidate_digest") = 64 and "profile_configuration_candidates"."candidate_digest" not glob '*[^0-9a-f]*')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `profile_configuration_candidate_digest_unique` ON `profile_configuration_candidates` (`workspace_id`,`profile_id`,`candidate_digest`);--> statement-breakpoint
CREATE UNIQUE INDEX `profile_configuration_candidate_command_unique` ON `profile_configuration_candidates` (`authority_command_id`);--> statement-breakpoint
CREATE INDEX `profile_configuration_candidate_profile_idx` ON `profile_configuration_candidates` (`workspace_id`,`profile_id`,`status`);--> statement-breakpoint
CREATE TABLE `profile_prospects` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`profile_id` text NOT NULL,
	`offer_id` text NOT NULL,
	`candidate_id` text NOT NULL,
	`assessment_id` text NOT NULL,
	`fingerprint` text NOT NULL,
	`state` text DEFAULT 'qualified' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `customer_profiles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`offer_id`) REFERENCES `offers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`candidate_id`) REFERENCES `prospecting_candidates`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`assessment_id`) REFERENCES `qualification_assessments`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "profile_prospect_fingerprint_check" CHECK(length("profile_prospects"."fingerprint") = 64 and "profile_prospects"."fingerprint" not glob '*[^0-9a-f]*')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `profile_prospect_active_fingerprint_unique` ON `profile_prospects` (`workspace_id`,`fingerprint`) WHERE "profile_prospects"."active" = 1;--> statement-breakpoint
CREATE UNIQUE INDEX `profile_prospect_assessment_unique` ON `profile_prospects` (`assessment_id`);--> statement-breakpoint
CREATE INDEX `profile_prospect_queue_idx` ON `profile_prospects` (`workspace_id`,`profile_id`,`state`);--> statement-breakpoint
CREATE TABLE `prospect_cooldowns` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`prospect_id` text NOT NULL,
	`review_decision_id` text,
	`assessment_id` text,
	`reason` text NOT NULL,
	`starts_at` integer NOT NULL,
	`ends_at` integer NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`prospect_id`) REFERENCES `profile_prospects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`review_decision_id`) REFERENCES `prospect_review_decisions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`assessment_id`) REFERENCES `qualification_assessments`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "prospect_cooldown_range_check" CHECK("prospect_cooldowns"."ends_at" > "prospect_cooldowns"."starts_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `prospect_cooldown_active_unique` ON `prospect_cooldowns` (`prospect_id`) WHERE "prospect_cooldowns"."status" = 'active';--> statement-breakpoint
CREATE INDEX `prospect_cooldown_expiry_idx` ON `prospect_cooldowns` (`workspace_id`,`status`,`ends_at`);--> statement-breakpoint
CREATE TABLE `prospect_reentry_events` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`prospect_id` text NOT NULL,
	`cooldown_id` text,
	`signal_id` text,
	`prior_assessment_id` text,
	`event_kind` text NOT NULL,
	`event_json` text NOT NULL,
	`event_digest` text NOT NULL,
	`authority_command_id` text NOT NULL,
	`audit_event_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`prospect_id`) REFERENCES `profile_prospects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`cooldown_id`) REFERENCES `prospect_cooldowns`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`signal_id`) REFERENCES `prospecting_signals`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`prior_assessment_id`) REFERENCES `qualification_assessments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`authority_command_id`) REFERENCES `authority_commands`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`audit_event_id`) REFERENCES `audit_events`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "prospect_reentry_event_digest_check" CHECK(length("prospect_reentry_events"."event_digest") = 64 and "prospect_reentry_events"."event_digest" not glob '*[^0-9a-f]*')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `prospect_reentry_event_digest_unique` ON `prospect_reentry_events` (`workspace_id`,`event_digest`);--> statement-breakpoint
CREATE INDEX `prospect_reentry_event_prospect_idx` ON `prospect_reentry_events` (`prospect_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `prospect_review_decisions` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`prospect_id` text NOT NULL,
	`assessment_id` text NOT NULL,
	`decision` text NOT NULL,
	`reason` text NOT NULL,
	`review_at` integer,
	`expected_prospect_revision` integer NOT NULL,
	`authority_command_id` text NOT NULL,
	`audit_event_id` text NOT NULL,
	`decision_digest` text NOT NULL,
	`operation_digest` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`prospect_id`) REFERENCES `profile_prospects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`assessment_id`) REFERENCES `qualification_assessments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`authority_command_id`) REFERENCES `authority_commands`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`audit_event_id`) REFERENCES `audit_events`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "prospect_review_decision_digest_check" CHECK(length("prospect_review_decisions"."decision_digest") = 64 and "prospect_review_decisions"."decision_digest" not glob '*[^0-9a-f]*'),
	CONSTRAINT "prospect_review_decision_operation_digest_check" CHECK(length("prospect_review_decisions"."operation_digest") = 64 and "prospect_review_decisions"."operation_digest" not glob '*[^0-9a-f]*')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `prospect_review_decision_key_unique` ON `prospect_review_decisions` (`workspace_id`,`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `prospect_review_decision_operation_unique` ON `prospect_review_decisions` (`workspace_id`,`operation_digest`);--> statement-breakpoint
CREATE UNIQUE INDEX `prospect_review_decision_command_unique` ON `prospect_review_decisions` (`authority_command_id`);--> statement-breakpoint
CREATE INDEX `prospect_review_decision_prospect_idx` ON `prospect_review_decisions` (`prospect_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `prospecting_candidates` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`profile_id` text NOT NULL,
	`offer_id` text NOT NULL,
	`run_id` text NOT NULL,
	`submission_id` text NOT NULL,
	`configuration_id` text NOT NULL,
	`fingerprint` text NOT NULL,
	`candidate_json` text NOT NULL,
	`candidate_digest` text NOT NULL,
	`predecessor_candidate_id` text,
	`status` text DEFAULT 'observed' NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `customer_profiles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`offer_id`) REFERENCES `offers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`run_id`) REFERENCES `prospecting_runs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`submission_id`) REFERENCES `runner_submissions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`configuration_id`) REFERENCES `typed_configurations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`predecessor_candidate_id`) REFERENCES `prospecting_candidates`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "prospecting_candidate_fingerprint_check" CHECK(length("prospecting_candidates"."fingerprint") = 64 and "prospecting_candidates"."fingerprint" not glob '*[^0-9a-f]*'),
	CONSTRAINT "prospecting_candidate_digest_check" CHECK(length("prospecting_candidates"."candidate_digest") = 64 and "prospecting_candidates"."candidate_digest" not glob '*[^0-9a-f]*')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `prospecting_candidate_fingerprint_unique` ON `prospecting_candidates` (`workspace_id`,`profile_id`,`offer_id`,`configuration_id`,`fingerprint`);--> statement-breakpoint
CREATE UNIQUE INDEX `prospecting_candidate_digest_unique` ON `prospecting_candidates` (`workspace_id`,`candidate_digest`);--> statement-breakpoint
CREATE INDEX `prospecting_candidate_profile_status_idx` ON `prospecting_candidates` (`workspace_id`,`profile_id`,`status`);--> statement-breakpoint
CREATE TABLE `prospecting_run_events` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`run_id` text NOT NULL,
	`event_type` text NOT NULL,
	`event_json` text NOT NULL,
	`event_digest` text NOT NULL,
	`operation_digest` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`run_id`) REFERENCES `prospecting_runs`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "prospecting_run_event_digest_check" CHECK(length("prospecting_run_events"."event_digest") = 64 and "prospecting_run_events"."event_digest" not glob '*[^0-9a-f]*'),
	CONSTRAINT "prospecting_run_event_operation_digest_check" CHECK(length("prospecting_run_events"."operation_digest") = 64 and "prospecting_run_events"."operation_digest" not glob '*[^0-9a-f]*')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `prospecting_run_event_operation_unique` ON `prospecting_run_events` (`workspace_id`,`operation_digest`);--> statement-breakpoint
CREATE UNIQUE INDEX `prospecting_run_event_digest_unique` ON `prospecting_run_events` (`run_id`,`event_digest`);--> statement-breakpoint
CREATE INDEX `prospecting_run_event_order_idx` ON `prospecting_run_events` (`run_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `prospecting_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`profile_id` text NOT NULL,
	`configuration_id` text NOT NULL,
	`schedule_id` text,
	`configuration_digest` text NOT NULL,
	`trigger_kind` text NOT NULL,
	`trigger_key` text NOT NULL,
	`window_lower_exclusive` integer,
	`window_upper_inclusive` integer NOT NULL,
	`last_successful_watermark` integer,
	`successful_watermark` integer,
	`manifest_json` text NOT NULL,
	`manifest_digest` text NOT NULL,
	`execution_state` text NOT NULL,
	`authority_command_id` text NOT NULL,
	`operation_digest` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`started_at` integer NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`profile_id`) REFERENCES `customer_profiles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`configuration_id`) REFERENCES `typed_configurations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`schedule_id`) REFERENCES `prospecting_schedules`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`authority_command_id`) REFERENCES `authority_commands`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "prospecting_run_configuration_digest_check" CHECK(length("prospecting_runs"."configuration_digest") = 64 and "prospecting_runs"."configuration_digest" not glob '*[^0-9a-f]*'),
	CONSTRAINT "prospecting_run_manifest_digest_check" CHECK(length("prospecting_runs"."manifest_digest") = 64 and "prospecting_runs"."manifest_digest" not glob '*[^0-9a-f]*'),
	CONSTRAINT "prospecting_run_operation_digest_check" CHECK(length("prospecting_runs"."operation_digest") = 64 and "prospecting_runs"."operation_digest" not glob '*[^0-9a-f]*'),
	CONSTRAINT "prospecting_run_window_check" CHECK("prospecting_runs"."window_lower_exclusive" is null or "prospecting_runs"."window_lower_exclusive" < "prospecting_runs"."window_upper_inclusive")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `prospecting_run_trigger_unique` ON `prospecting_runs` (`workspace_id`,`profile_id`,`trigger_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `prospecting_run_idempotency_unique` ON `prospecting_runs` (`workspace_id`,`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `prospecting_run_operation_unique` ON `prospecting_runs` (`workspace_id`,`operation_digest`);--> statement-breakpoint
CREATE UNIQUE INDEX `prospecting_initial_run_unique` ON `prospecting_runs` (`workspace_id`,`configuration_id`) WHERE "prospecting_runs"."trigger_kind" = 'initial';--> statement-breakpoint
CREATE INDEX `prospecting_run_profile_idx` ON `prospecting_runs` (`workspace_id`,`profile_id`,`started_at`);--> statement-breakpoint
CREATE TABLE `prospecting_schedules` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`profile_id` text NOT NULL,
	`configuration_id` text NOT NULL,
	`configuration_digest` text NOT NULL,
	`schedule_key` text NOT NULL,
	`timezone` text NOT NULL,
	`intended_local_time` text NOT NULL,
	`utc_offset_minutes` integer NOT NULL,
	`cadence` text NOT NULL,
	`next_run_at` integer NOT NULL,
	`last_successful_watermark` integer,
	`active` integer DEFAULT true NOT NULL,
	`execution_state` text NOT NULL,
	`authority_command_id` text NOT NULL,
	`operation_digest` text NOT NULL,
	`idempotency_key` text NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `customer_profiles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`configuration_id`) REFERENCES `typed_configurations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`authority_command_id`) REFERENCES `authority_commands`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "prospecting_schedule_configuration_digest_check" CHECK(length("prospecting_schedules"."configuration_digest") = 64 and "prospecting_schedules"."configuration_digest" not glob '*[^0-9a-f]*'),
	CONSTRAINT "prospecting_schedule_operation_digest_check" CHECK(length("prospecting_schedules"."operation_digest") = 64 and "prospecting_schedules"."operation_digest" not glob '*[^0-9a-f]*')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `prospecting_schedule_key_unique` ON `prospecting_schedules` (`workspace_id`,`schedule_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `prospecting_schedule_active_profile_unique` ON `prospecting_schedules` (`workspace_id`,`profile_id`) WHERE "prospecting_schedules"."active" = 1;--> statement-breakpoint
CREATE UNIQUE INDEX `prospecting_schedule_command_unique` ON `prospecting_schedules` (`authority_command_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `prospecting_schedule_idempotency_unique` ON `prospecting_schedules` (`workspace_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `prospecting_schedule_due_idx` ON `prospecting_schedules` (`workspace_id`,`execution_state`,`next_run_at`);--> statement-breakpoint
CREATE TABLE `prospecting_signals` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`run_id` text NOT NULL,
	`submission_id` text NOT NULL,
	`source_lineage_id` text NOT NULL,
	`profile_id` text NOT NULL,
	`signal_kind` text NOT NULL,
	`signal_json` text NOT NULL,
	`signal_digest` text NOT NULL,
	`material` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`run_id`) REFERENCES `prospecting_runs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`submission_id`) REFERENCES `runner_submissions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_lineage_id`) REFERENCES `prospecting_source_lineage`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`profile_id`) REFERENCES `customer_profiles`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "prospecting_signal_digest_check" CHECK(length("prospecting_signals"."signal_digest") = 64 and "prospecting_signals"."signal_digest" not glob '*[^0-9a-f]*')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `prospecting_signal_digest_unique` ON `prospecting_signals` (`workspace_id`,`signal_digest`);--> statement-breakpoint
CREATE INDEX `prospecting_signal_profile_idx` ON `prospecting_signals` (`workspace_id`,`profile_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `prospecting_source_lineage` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`run_id` text NOT NULL,
	`submission_id` text NOT NULL,
	`source_id` text,
	`source_url` text NOT NULL,
	`publisher_identity` text NOT NULL,
	`underlying_origin_identity` text NOT NULL,
	`independence_group` text NOT NULL,
	`source_tier` integer NOT NULL,
	`published_at` integer,
	`occurred_at` integer,
	`retrieved_at` integer NOT NULL,
	`excerpt` text NOT NULL,
	`lineage_json` text NOT NULL,
	`lineage_digest` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`run_id`) REFERENCES `prospecting_runs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`submission_id`) REFERENCES `runner_submissions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "prospecting_source_lineage_tier_check" CHECK("prospecting_source_lineage"."source_tier" between 1 and 3),
	CONSTRAINT "prospecting_source_lineage_digest_check" CHECK(length("prospecting_source_lineage"."lineage_digest") = 64 and "prospecting_source_lineage"."lineage_digest" not glob '*[^0-9a-f]*')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `prospecting_source_lineage_digest_unique` ON `prospecting_source_lineage` (`run_id`,`lineage_digest`);--> statement-breakpoint
CREATE INDEX `prospecting_source_lineage_run_idx` ON `prospecting_source_lineage` (`run_id`,`retrieved_at`);--> statement-breakpoint
CREATE TABLE `qualification_assessments` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`candidate_id` text NOT NULL,
	`configuration_id` text NOT NULL,
	`configuration_digest` text NOT NULL,
	`input_json` text NOT NULL,
	`input_digest` text NOT NULL,
	`anchor_json` text NOT NULL,
	`evidence_json` text NOT NULL,
	`gate_json` text NOT NULL,
	`score_json` text NOT NULL,
	`score` integer NOT NULL,
	`outcome` text NOT NULL,
	`tie_order` text NOT NULL,
	`assessment_digest` text NOT NULL,
	`predecessor_assessment_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`candidate_id`) REFERENCES `prospecting_candidates`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`configuration_id`) REFERENCES `typed_configurations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`predecessor_assessment_id`) REFERENCES `qualification_assessments`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "qualification_assessment_configuration_digest_check" CHECK(length("qualification_assessments"."configuration_digest") = 64 and "qualification_assessments"."configuration_digest" not glob '*[^0-9a-f]*'),
	CONSTRAINT "qualification_assessment_input_digest_check" CHECK(length("qualification_assessments"."input_digest") = 64 and "qualification_assessments"."input_digest" not glob '*[^0-9a-f]*'),
	CONSTRAINT "qualification_assessment_digest_check" CHECK(length("qualification_assessments"."assessment_digest") = 64 and "qualification_assessments"."assessment_digest" not glob '*[^0-9a-f]*'),
	CONSTRAINT "qualification_assessment_score_check" CHECK("qualification_assessments"."score" between 0 and 10)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `qualification_assessment_digest_unique` ON `qualification_assessments` (`workspace_id`,`assessment_digest`);--> statement-breakpoint
CREATE INDEX `qualification_assessment_candidate_idx` ON `qualification_assessments` (`candidate_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `runner_assignment_revocations` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`assignment_id` text NOT NULL,
	`reason` text NOT NULL,
	`authority_command_id` text NOT NULL,
	`audit_event_id` text NOT NULL,
	`operation_digest` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`assignment_id`) REFERENCES `runner_assignments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`authority_command_id`) REFERENCES `authority_commands`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`audit_event_id`) REFERENCES `audit_events`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "runner_assignment_revocation_digest_check" CHECK(length("runner_assignment_revocations"."operation_digest") = 64 and "runner_assignment_revocations"."operation_digest" not glob '*[^0-9a-f]*')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `runner_assignment_revocation_assignment_unique` ON `runner_assignment_revocations` (`assignment_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `runner_assignment_revocation_command_unique` ON `runner_assignment_revocations` (`authority_command_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `runner_assignment_revocation_operation_unique` ON `runner_assignment_revocations` (`workspace_id`,`operation_digest`);--> statement-breakpoint
CREATE TABLE `runner_assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`run_id` text NOT NULL,
	`profile_id` text NOT NULL,
	`configuration_id` text NOT NULL,
	`configuration_digest` text NOT NULL,
	`audience` text NOT NULL,
	`token_hash` text NOT NULL,
	`nonce_hash` text NOT NULL,
	`instruction_version` text NOT NULL,
	`tool_configuration_digest` text NOT NULL,
	`quota_json` text NOT NULL,
	`quota_digest` text NOT NULL,
	`expires_at` integer NOT NULL,
	`status` text DEFAULT 'issued' NOT NULL,
	`authority_command_id` text NOT NULL,
	`audit_event_id` text NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `prospecting_runs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`profile_id`) REFERENCES `customer_profiles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`configuration_id`) REFERENCES `typed_configurations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`authority_command_id`) REFERENCES `authority_commands`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`audit_event_id`) REFERENCES `audit_events`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "runner_assignment_configuration_digest_check" CHECK(length("runner_assignments"."configuration_digest") = 64 and "runner_assignments"."configuration_digest" not glob '*[^0-9a-f]*'),
	CONSTRAINT "runner_assignment_token_hash_check" CHECK(length("runner_assignments"."token_hash") = 64 and "runner_assignments"."token_hash" not glob '*[^0-9a-f]*'),
	CONSTRAINT "runner_assignment_nonce_hash_check" CHECK(length("runner_assignments"."nonce_hash") = 64 and "runner_assignments"."nonce_hash" not glob '*[^0-9a-f]*'),
	CONSTRAINT "runner_assignment_quota_digest_check" CHECK(length("runner_assignments"."quota_digest") = 64 and "runner_assignments"."quota_digest" not glob '*[^0-9a-f]*')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `runner_assignment_token_hash_unique` ON `runner_assignments` (`workspace_id`,`token_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `runner_assignment_nonce_hash_unique` ON `runner_assignments` (`workspace_id`,`nonce_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `runner_assignment_command_unique` ON `runner_assignments` (`authority_command_id`);--> statement-breakpoint
CREATE INDEX `runner_assignment_run_idx` ON `runner_assignments` (`workspace_id`,`run_id`,`status`);--> statement-breakpoint
CREATE TABLE `runner_submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`run_id` text NOT NULL,
	`assignment_id` text NOT NULL,
	`configuration_id` text NOT NULL,
	`submission_json` text NOT NULL,
	`submission_digest` text NOT NULL,
	`provenance_json` text NOT NULL,
	`provenance_digest` text NOT NULL,
	`status` text NOT NULL,
	`operation_digest` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`run_id`) REFERENCES `prospecting_runs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`assignment_id`) REFERENCES `runner_assignments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`configuration_id`) REFERENCES `typed_configurations`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "runner_submission_digest_check" CHECK(length("runner_submissions"."submission_digest") = 64 and "runner_submissions"."submission_digest" not glob '*[^0-9a-f]*'),
	CONSTRAINT "runner_submission_provenance_digest_check" CHECK(length("runner_submissions"."provenance_digest") = 64 and "runner_submissions"."provenance_digest" not glob '*[^0-9a-f]*'),
	CONSTRAINT "runner_submission_operation_digest_check" CHECK(length("runner_submissions"."operation_digest") = 64 and "runner_submissions"."operation_digest" not glob '*[^0-9a-f]*')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `runner_submission_key_unique` ON `runner_submissions` (`workspace_id`,`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `runner_submission_operation_unique` ON `runner_submissions` (`workspace_id`,`operation_digest`);--> statement-breakpoint
CREATE UNIQUE INDEX `runner_submission_digest_unique` ON `runner_submissions` (`assignment_id`,`submission_digest`);--> statement-breakpoint
CREATE INDEX `runner_submission_run_idx` ON `runner_submissions` (`run_id`,`created_at`);--> statement-breakpoint
CREATE TRIGGER `profile_configuration_candidate_scope_insert`
BEFORE INSERT ON `profile_configuration_candidates`
WHEN NOT EXISTS (
  SELECT 1 FROM `typed_configurations` c
  WHERE c.id = NEW.configuration_id AND c.workspace_id = NEW.workspace_id
    AND c.owner_type = 'profile' AND c.owner_id = NEW.profile_id
    AND c.kind = 'profile_effective' AND c.active = 0
) OR NOT EXISTS (
  SELECT 1 FROM `customer_profiles` p WHERE p.id = NEW.profile_id AND p.workspace_id = NEW.workspace_id
)
BEGIN SELECT RAISE(ABORT, 'profile configuration candidate requires exact inactive profile configuration'); END;--> statement-breakpoint
CREATE TRIGGER `profile_configuration_activation_scope_insert`
BEFORE INSERT ON `profile_configuration_activations`
WHEN NOT EXISTS (
  SELECT 1 FROM `profile_configuration_candidates` pc
  JOIN `typed_configurations` c ON c.id = pc.configuration_id AND c.workspace_id = pc.workspace_id
  WHERE pc.id = NEW.candidate_id AND pc.workspace_id = NEW.workspace_id AND pc.profile_id = NEW.profile_id
    AND pc.configuration_id = NEW.configuration_id AND pc.status = 'candidate'
    AND c.owner_type = 'profile' AND c.owner_id = NEW.profile_id AND c.kind = 'profile_effective'
)
BEGIN SELECT RAISE(ABORT, 'profile activation requires its exact candidate configuration'); END;--> statement-breakpoint
CREATE TRIGGER `prospecting_schedule_scope_insert`
BEFORE INSERT ON `prospecting_schedules`
WHEN NOT EXISTS (
  SELECT 1 FROM `typed_configurations` c WHERE c.id = NEW.configuration_id AND c.workspace_id = NEW.workspace_id
    AND c.owner_type = 'profile' AND c.owner_id = NEW.profile_id AND c.kind = 'profile_effective' AND c.digest = NEW.configuration_digest
)
BEGIN SELECT RAISE(ABORT, 'prospecting schedule requires exact profile configuration'); END;--> statement-breakpoint
CREATE TRIGGER `prospecting_run_scope_insert`
BEFORE INSERT ON `prospecting_runs`
WHEN NOT EXISTS (
  SELECT 1 FROM `typed_configurations` c WHERE c.id = NEW.configuration_id AND c.workspace_id = NEW.workspace_id
    AND c.owner_type = 'profile' AND c.owner_id = NEW.profile_id AND c.kind = 'profile_effective' AND c.digest = NEW.configuration_digest
) OR (NEW.schedule_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM `prospecting_schedules` s WHERE s.id = NEW.schedule_id AND s.workspace_id = NEW.workspace_id
    AND s.profile_id = NEW.profile_id AND s.configuration_id = NEW.configuration_id
))
BEGIN SELECT RAISE(ABORT, 'prospecting run requires exact profile configuration and schedule'); END;--> statement-breakpoint
CREATE TRIGGER `runner_assignment_scope_insert`
BEFORE INSERT ON `runner_assignments`
WHEN NOT EXISTS (
  SELECT 1 FROM `prospecting_runs` r
  JOIN `typed_configurations` c ON c.id = r.configuration_id AND c.workspace_id = r.workspace_id
  WHERE r.id = NEW.run_id AND r.workspace_id = NEW.workspace_id
    AND r.profile_id = NEW.profile_id AND r.configuration_id = NEW.configuration_id AND r.configuration_digest = NEW.configuration_digest
    AND c.owner_type = 'profile' AND c.owner_id = r.profile_id AND c.kind = 'profile_effective'
    AND (
      (c.active = 1 AND r.execution_state IN ('queued', 'assigned', 'running'))
      OR (
        r.execution_state = 'submitted'
        AND EXISTS (
          SELECT 1 FROM `runner_submissions` s
          JOIN `runner_assignments` prior ON prior.id = s.assignment_id
            AND prior.workspace_id = s.workspace_id AND prior.run_id = s.run_id
          WHERE s.run_id = r.id AND s.workspace_id = r.workspace_id
            AND s.configuration_id = r.configuration_id AND s.status = 'received'
            AND json_extract(s.submission_json, '$.status') = 'partial'
            AND prior.status = 'consumed'
        )
      )
    )
)
BEGIN SELECT RAISE(ABORT, 'runner assignment requires exact mutable run binding'); END;--> statement-breakpoint
CREATE TRIGGER `runner_assignment_secret_immutable_update`
BEFORE UPDATE OF `run_id`, `profile_id`, `configuration_id`, `configuration_digest`, `audience`, `token_hash`, `nonce_hash`, `instruction_version`, `tool_configuration_digest`, `quota_json`, `quota_digest`, `expires_at`, `authority_command_id`, `audit_event_id` ON `runner_assignments`
BEGIN SELECT RAISE(ABORT, 'runner assignment capability facts are immutable'); END;--> statement-breakpoint
CREATE TRIGGER `runner_submission_scope_insert`
BEFORE INSERT ON `runner_submissions`
WHEN NOT EXISTS (
  SELECT 1 FROM `runner_assignments` a JOIN `prospecting_runs` r ON r.id = a.run_id
  WHERE a.id = NEW.assignment_id AND a.workspace_id = NEW.workspace_id AND a.run_id = NEW.run_id
    AND a.configuration_id = NEW.configuration_id AND a.status = 'issued'
    AND r.workspace_id = NEW.workspace_id AND r.execution_state IN ('assigned', 'running')
)
BEGIN SELECT RAISE(ABORT, 'runner submission requires one issued assignment binding'); END;--> statement-breakpoint
CREATE TRIGGER `prospecting_fact_immutable_update`
BEFORE UPDATE ON `prospecting_run_events`
BEGIN SELECT RAISE(ABORT, 'prospecting run events are immutable'); END;--> statement-breakpoint
CREATE TRIGGER `prospecting_fact_immutable_delete`
BEFORE DELETE ON `prospecting_run_events`
BEGIN SELECT RAISE(ABORT, 'prospecting run events are immutable'); END;--> statement-breakpoint
CREATE TRIGGER `runner_submission_immutable_update`
BEFORE UPDATE ON `runner_submissions`
BEGIN SELECT RAISE(ABORT, 'runner submissions are immutable'); END;--> statement-breakpoint
CREATE TRIGGER `runner_submission_immutable_delete`
BEFORE DELETE ON `runner_submissions`
BEGIN SELECT RAISE(ABORT, 'runner submissions are immutable'); END;--> statement-breakpoint
CREATE TRIGGER `prospecting_lineage_immutable_update`
BEFORE UPDATE ON `prospecting_source_lineage`
BEGIN SELECT RAISE(ABORT, 'prospecting source lineage is immutable'); END;--> statement-breakpoint
CREATE TRIGGER `prospecting_lineage_immutable_delete`
BEFORE DELETE ON `prospecting_source_lineage`
BEGIN SELECT RAISE(ABORT, 'prospecting source lineage is immutable'); END;--> statement-breakpoint
CREATE TRIGGER `prospecting_signal_immutable_update`
BEFORE UPDATE ON `prospecting_signals`
BEGIN SELECT RAISE(ABORT, 'prospecting signals are immutable'); END;--> statement-breakpoint
CREATE TRIGGER `prospecting_signal_immutable_delete`
BEFORE DELETE ON `prospecting_signals`
BEGIN SELECT RAISE(ABORT, 'prospecting signals are immutable'); END;--> statement-breakpoint
CREATE TRIGGER `qualification_assessment_immutable_update`
BEFORE UPDATE ON `qualification_assessments`
BEGIN SELECT RAISE(ABORT, 'qualification assessments are immutable'); END;--> statement-breakpoint
CREATE TRIGGER `qualification_assessment_immutable_delete`
BEFORE DELETE ON `qualification_assessments`
BEGIN SELECT RAISE(ABORT, 'qualification assessments are immutable'); END;--> statement-breakpoint
CREATE TRIGGER `prospect_review_immutable_update`
BEFORE UPDATE ON `prospect_review_decisions`
BEGIN SELECT RAISE(ABORT, 'prospect review decisions are immutable'); END;--> statement-breakpoint
CREATE TRIGGER `prospect_review_immutable_delete`
BEFORE DELETE ON `prospect_review_decisions`
BEGIN SELECT RAISE(ABORT, 'prospect review decisions are immutable'); END;--> statement-breakpoint
CREATE TRIGGER `prospect_cooldown_immutable_update`
BEFORE UPDATE ON `prospect_cooldowns`
BEGIN SELECT RAISE(ABORT, 'prospect cooldowns are immutable'); END;--> statement-breakpoint
CREATE TRIGGER `prospect_cooldown_immutable_delete`
BEFORE DELETE ON `prospect_cooldowns`
BEGIN SELECT RAISE(ABORT, 'prospect cooldowns are immutable'); END;--> statement-breakpoint
CREATE TRIGGER `prospect_reentry_immutable_update`
BEFORE UPDATE ON `prospect_reentry_events`
BEGIN SELECT RAISE(ABORT, 'prospect reentry events are immutable'); END;--> statement-breakpoint
CREATE TRIGGER `prospect_reentry_immutable_delete`
BEFORE DELETE ON `prospect_reentry_events`
BEGIN SELECT RAISE(ABORT, 'prospect reentry events are immutable'); END;
