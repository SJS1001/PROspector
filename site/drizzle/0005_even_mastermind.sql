CREATE TABLE `market_play_proposal_decisions` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`product_id` text NOT NULL,
	`proposal_id` text NOT NULL,
	`proposal_version_id` text NOT NULL,
	`expected_proposal_revision` integer NOT NULL,
	`expected_proposal_digest` text NOT NULL,
	`decision` text NOT NULL,
	`reason` text,
	`review_at` integer,
	`cooldown_until` integer,
	`confirmed` integer DEFAULT false NOT NULL,
	`draft_market_play_id` text,
	`interview_session_id` text,
	`decision_json` text NOT NULL,
	`decision_digest` text NOT NULL,
	`operation_digest` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`proposal_id`) REFERENCES `market_play_proposals`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`proposal_version_id`) REFERENCES `market_play_proposal_versions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`draft_market_play_id`) REFERENCES `market_plays`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`interview_session_id`) REFERENCES `interview_sessions`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "market_play_proposal_decision_digest_check" CHECK(length("market_play_proposal_decisions"."decision_digest") = 64 and "market_play_proposal_decisions"."decision_digest" not glob '*[^0-9a-f]*'),
	CONSTRAINT "market_play_proposal_decision_operation_digest_check" CHECK(length("market_play_proposal_decisions"."operation_digest") = 64 and "market_play_proposal_decisions"."operation_digest" not glob '*[^0-9a-f]*')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `market_play_proposal_decision_version_unique` ON `market_play_proposal_decisions` (`proposal_version_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `market_play_proposal_decision_key_unique` ON `market_play_proposal_decisions` (`workspace_id`,`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `market_play_proposal_decision_operation_unique` ON `market_play_proposal_decisions` (`workspace_id`,`operation_digest`);--> statement-breakpoint
CREATE INDEX `market_play_proposal_decision_proposal_idx` ON `market_play_proposal_decisions` (`proposal_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `market_play_proposal_evidence` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`proposal_id` text NOT NULL,
	`proposal_version_id` text NOT NULL,
	`reference` text NOT NULL,
	`evidence_json` text NOT NULL,
	`evidence_digest` text NOT NULL,
	`material_evidence_fingerprint` text NOT NULL,
	`observed_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`proposal_id`) REFERENCES `market_play_proposals`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`proposal_version_id`) REFERENCES `market_play_proposal_versions`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "market_play_proposal_evidence_digest_check" CHECK(length("market_play_proposal_evidence"."evidence_digest") = 64 and "market_play_proposal_evidence"."evidence_digest" not glob '*[^0-9a-f]*')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `market_play_proposal_evidence_digest_unique` ON `market_play_proposal_evidence` (`proposal_version_id`,`evidence_digest`);--> statement-breakpoint
CREATE UNIQUE INDEX `market_play_proposal_evidence_reference_unique` ON `market_play_proposal_evidence` (`proposal_version_id`,`reference`);--> statement-breakpoint
CREATE INDEX `market_play_proposal_evidence_proposal_idx` ON `market_play_proposal_evidence` (`proposal_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `market_play_proposal_lineage` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`product_id` text NOT NULL,
	`relationship` text NOT NULL,
	`source_proposal_id` text NOT NULL,
	`source_version_id` text,
	`target_proposal_id` text NOT NULL,
	`target_version_id` text,
	`changed_field` text,
	`evidence_reference` text,
	`lineage_json` text NOT NULL,
	`lineage_digest` text NOT NULL,
	`operation_digest` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_proposal_id`) REFERENCES `market_play_proposals`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_version_id`) REFERENCES `market_play_proposal_versions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`target_proposal_id`) REFERENCES `market_play_proposals`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`target_version_id`) REFERENCES `market_play_proposal_versions`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "market_play_proposal_lineage_digest_check" CHECK(length("market_play_proposal_lineage"."lineage_digest") = 64 and "market_play_proposal_lineage"."lineage_digest" not glob '*[^0-9a-f]*'),
	CONSTRAINT "market_play_proposal_lineage_operation_digest_check" CHECK(length("market_play_proposal_lineage"."operation_digest") = 64 and "market_play_proposal_lineage"."operation_digest" not glob '*[^0-9a-f]*')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `market_play_proposal_lineage_operation_unique` ON `market_play_proposal_lineage` (`workspace_id`,`operation_digest`);--> statement-breakpoint
CREATE UNIQUE INDEX `market_play_proposal_lineage_digest_unique` ON `market_play_proposal_lineage` (`workspace_id`,`lineage_digest`);--> statement-breakpoint
CREATE INDEX `market_play_proposal_lineage_source_idx` ON `market_play_proposal_lineage` (`source_proposal_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `market_play_proposal_lineage_target_idx` ON `market_play_proposal_lineage` (`target_proposal_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `market_play_proposal_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`product_id` text NOT NULL,
	`proposal_id` text NOT NULL,
	`run_id` text NOT NULL,
	`submission_id` text NOT NULL,
	`version` integer NOT NULL,
	`proposal_json` text NOT NULL,
	`proposal_digest` text NOT NULL,
	`material_evidence_fingerprint` text NOT NULL,
	`predecessor_version_id` text,
	`relationship` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`proposal_id`) REFERENCES `market_play_proposals`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`run_id`) REFERENCES `product_discovery_runs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`submission_id`) REFERENCES `product_discovery_submissions`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "market_play_proposal_version_number_check" CHECK("market_play_proposal_versions"."version" > 0),
	CONSTRAINT "market_play_proposal_version_digest_check" CHECK(length("market_play_proposal_versions"."proposal_digest") = 64 and "market_play_proposal_versions"."proposal_digest" not glob '*[^0-9a-f]*')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `market_play_proposal_version_unique` ON `market_play_proposal_versions` (`proposal_id`,`version`);--> statement-breakpoint
CREATE UNIQUE INDEX `market_play_proposal_version_digest_unique` ON `market_play_proposal_versions` (`proposal_id`,`proposal_digest`);--> statement-breakpoint
CREATE UNIQUE INDEX `market_play_proposal_version_submission_unique` ON `market_play_proposal_versions` (`submission_id`,`proposal_id`);--> statement-breakpoint
CREATE INDEX `market_play_proposal_version_run_idx` ON `market_play_proposal_versions` (`run_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `market_play_proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`product_id` text NOT NULL,
	`run_id` text NOT NULL,
	`fingerprint` text NOT NULL,
	`current_version_id` text,
	`status` text DEFAULT 'new' NOT NULL,
	`surfaced` integer DEFAULT false NOT NULL,
	`rank` integer,
	`active` integer DEFAULT true NOT NULL,
	`cooldown_until` integer,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`run_id`) REFERENCES `product_discovery_runs`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "market_play_proposal_fingerprint_check" CHECK(length("market_play_proposals"."fingerprint") = 64 and "market_play_proposals"."fingerprint" not glob '*[^0-9a-f]*'),
	CONSTRAINT "market_play_proposal_rank_check" CHECK("market_play_proposals"."rank" is null or ("market_play_proposals"."rank" >= 1 and "market_play_proposals"."rank" <= 3))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `market_play_proposal_active_fingerprint_unique` ON `market_play_proposals` (`workspace_id`,`product_id`,`fingerprint`) WHERE "market_play_proposals"."active" = 1;--> statement-breakpoint
CREATE UNIQUE INDEX `market_play_proposal_run_rank_unique` ON `market_play_proposals` (`run_id`,`rank`) WHERE "market_play_proposals"."surfaced" = 1;--> statement-breakpoint
CREATE INDEX `market_play_proposal_product_status_idx` ON `market_play_proposals` (`workspace_id`,`product_id`,`status`);--> statement-breakpoint
CREATE TABLE `private_synthetic_proof_authorizations` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`owner_subject_id` text NOT NULL,
	`product_id` text NOT NULL,
	`expected_product_revision` integer NOT NULL,
	`interview_confirmation_id` text NOT NULL,
	`confirmed_knowledge_version_id` text NOT NULL,
	`reviewed_source_revision` text NOT NULL,
	`migration_digest` text NOT NULL,
	`fixture_digest` text NOT NULL,
	`fixture_provenance` text NOT NULL,
	`evidence_reference` text NOT NULL,
	`capability` text NOT NULL,
	`authorization_digest` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`interview_confirmation_id`) REFERENCES `interview_confirmations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`confirmed_knowledge_version_id`) REFERENCES `knowledge_versions`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "private_synthetic_proof_migration_digest_check" CHECK(length("private_synthetic_proof_authorizations"."migration_digest") = 64 and "private_synthetic_proof_authorizations"."migration_digest" not glob '*[^0-9a-f]*'),
	CONSTRAINT "private_synthetic_proof_fixture_digest_check" CHECK(length("private_synthetic_proof_authorizations"."fixture_digest") = 64 and "private_synthetic_proof_authorizations"."fixture_digest" not glob '*[^0-9a-f]*'),
	CONSTRAINT "private_synthetic_proof_authorization_digest_check" CHECK(length("private_synthetic_proof_authorizations"."authorization_digest") = 64 and "private_synthetic_proof_authorizations"."authorization_digest" not glob '*[^0-9a-f]*'),
	CONSTRAINT "private_synthetic_proof_expiry_check" CHECK("private_synthetic_proof_authorizations"."expires_at" > "private_synthetic_proof_authorizations"."created_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `private_synthetic_proof_authorization_digest_unique` ON `private_synthetic_proof_authorizations` (`workspace_id`,`authorization_digest`);--> statement-breakpoint
CREATE UNIQUE INDEX `private_synthetic_proof_authorization_evidence_unique` ON `private_synthetic_proof_authorizations` (`workspace_id`,`evidence_reference`);--> statement-breakpoint
CREATE INDEX `private_synthetic_proof_authorization_lookup_idx` ON `private_synthetic_proof_authorizations` (`workspace_id`,`product_id`,`capability`,`expires_at`);--> statement-breakpoint
CREATE TABLE `private_synthetic_proof_consumptions` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`product_id` text NOT NULL,
	`authorization_id` text NOT NULL,
	`operation_digest` text NOT NULL,
	`winner_run_id` text NOT NULL,
	`winner_submission_id` text NOT NULL,
	`result_json` text NOT NULL,
	`result_digest` text NOT NULL,
	`audit_event_id` text NOT NULL,
	`consumed_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`authorization_id`) REFERENCES `private_synthetic_proof_authorizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`winner_run_id`) REFERENCES `product_discovery_runs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`winner_submission_id`) REFERENCES `product_discovery_submissions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`audit_event_id`) REFERENCES `audit_events`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "private_synthetic_proof_consumption_operation_digest_check" CHECK(length("private_synthetic_proof_consumptions"."operation_digest") = 64 and "private_synthetic_proof_consumptions"."operation_digest" not glob '*[^0-9a-f]*'),
	CONSTRAINT "private_synthetic_proof_consumption_result_digest_check" CHECK(length("private_synthetic_proof_consumptions"."result_digest") = 64 and "private_synthetic_proof_consumptions"."result_digest" not glob '*[^0-9a-f]*')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `private_synthetic_proof_consumption_authorization_unique` ON `private_synthetic_proof_consumptions` (`authorization_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `private_synthetic_proof_consumption_operation_unique` ON `private_synthetic_proof_consumptions` (`workspace_id`,`operation_digest`);--> statement-breakpoint
CREATE UNIQUE INDEX `private_synthetic_proof_consumption_result_unique` ON `private_synthetic_proof_consumptions` (`authorization_id`,`result_digest`);--> statement-breakpoint
CREATE TABLE `product_configuration_lineage` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`product_id` text NOT NULL,
	`replacement_activation_id` text NOT NULL,
	`predecessor_configuration_id` text NOT NULL,
	`successor_configuration_id` text NOT NULL,
	`material_change_run_id` text NOT NULL,
	`lineage_json` text NOT NULL,
	`lineage_digest` text NOT NULL,
	`operation_digest` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`replacement_activation_id`) REFERENCES `configuration_activations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`predecessor_configuration_id`) REFERENCES `typed_configurations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`successor_configuration_id`) REFERENCES `typed_configurations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`material_change_run_id`) REFERENCES `product_discovery_runs`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "product_configuration_lineage_digest_check" CHECK(length("product_configuration_lineage"."lineage_digest") = 64 and "product_configuration_lineage"."lineage_digest" not glob '*[^0-9a-f]*'),
	CONSTRAINT "product_configuration_lineage_operation_digest_check" CHECK(length("product_configuration_lineage"."operation_digest") = 64 and "product_configuration_lineage"."operation_digest" not glob '*[^0-9a-f]*')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `product_configuration_lineage_activation_unique` ON `product_configuration_lineage` (`replacement_activation_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `product_configuration_lineage_successor_unique` ON `product_configuration_lineage` (`workspace_id`,`product_id`,`successor_configuration_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `product_configuration_lineage_operation_unique` ON `product_configuration_lineage` (`workspace_id`,`operation_digest`);--> statement-breakpoint
CREATE TABLE `product_discovery_configuration_prerequisites` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`product_id` text NOT NULL,
	`configuration_id` text NOT NULL,
	`knowledge_version_id` text NOT NULL,
	`knowledge_version_digest` text NOT NULL,
	`category` text NOT NULL,
	`ordinal` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`configuration_id`) REFERENCES `typed_configurations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`knowledge_version_id`) REFERENCES `knowledge_versions`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "product_discovery_prerequisite_digest_check" CHECK(length("product_discovery_configuration_prerequisites"."knowledge_version_digest") = 64 and "product_discovery_configuration_prerequisites"."knowledge_version_digest" not glob '*[^0-9a-f]*'),
	CONSTRAINT "product_discovery_prerequisite_ordinal_check" CHECK("product_discovery_configuration_prerequisites"."ordinal" >= 0 and "product_discovery_configuration_prerequisites"."ordinal" < 9)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `product_discovery_prerequisite_version_unique` ON `product_discovery_configuration_prerequisites` (`configuration_id`,`knowledge_version_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `product_discovery_prerequisite_category_unique` ON `product_discovery_configuration_prerequisites` (`configuration_id`,`category`);--> statement-breakpoint
CREATE UNIQUE INDEX `product_discovery_prerequisite_ordinal_unique` ON `product_discovery_configuration_prerequisites` (`configuration_id`,`ordinal`);--> statement-breakpoint
CREATE INDEX `product_discovery_prerequisite_product_idx` ON `product_discovery_configuration_prerequisites` (`workspace_id`,`product_id`);--> statement-breakpoint
CREATE TABLE `product_discovery_run_events` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`run_id` text NOT NULL,
	`event_type` text NOT NULL,
	`event_json` text NOT NULL,
	`event_digest` text NOT NULL,
	`operation_digest` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`run_id`) REFERENCES `product_discovery_runs`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "product_discovery_run_event_digest_check" CHECK(length("product_discovery_run_events"."event_digest") = 64 and "product_discovery_run_events"."event_digest" not glob '*[^0-9a-f]*'),
	CONSTRAINT "product_discovery_run_event_operation_digest_check" CHECK(length("product_discovery_run_events"."operation_digest") = 64 and "product_discovery_run_events"."operation_digest" not glob '*[^0-9a-f]*')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `product_discovery_run_event_operation_unique` ON `product_discovery_run_events` (`workspace_id`,`operation_digest`);--> statement-breakpoint
CREATE UNIQUE INDEX `product_discovery_run_event_digest_unique` ON `product_discovery_run_events` (`run_id`,`event_digest`);--> statement-breakpoint
CREATE INDEX `product_discovery_run_event_order_idx` ON `product_discovery_run_events` (`run_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `product_discovery_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`product_id` text NOT NULL,
	`configuration_id` text NOT NULL,
	`configuration_digest` text NOT NULL,
	`trigger_kind` text NOT NULL,
	`trigger_key` text NOT NULL,
	`source_event_id` text,
	`started_at` integer NOT NULL,
	`window_lower_exclusive` integer,
	`window_upper_inclusive` integer NOT NULL,
	`last_successful_watermark` integer,
	`successful_watermark` integer,
	`manifest_json` text NOT NULL,
	`manifest_digest` text NOT NULL,
	`policy_snapshot_json` text NOT NULL,
	`policy_snapshot_digest` text NOT NULL,
	`execution_state` text NOT NULL,
	`operation_digest` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`configuration_id`) REFERENCES `typed_configurations`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "product_discovery_run_configuration_digest_check" CHECK(length("product_discovery_runs"."configuration_digest") = 64 and "product_discovery_runs"."configuration_digest" not glob '*[^0-9a-f]*'),
	CONSTRAINT "product_discovery_run_manifest_digest_check" CHECK(length("product_discovery_runs"."manifest_digest") = 64 and "product_discovery_runs"."manifest_digest" not glob '*[^0-9a-f]*'),
	CONSTRAINT "product_discovery_run_policy_digest_check" CHECK(length("product_discovery_runs"."policy_snapshot_digest") = 64 and "product_discovery_runs"."policy_snapshot_digest" not glob '*[^0-9a-f]*'),
	CONSTRAINT "product_discovery_run_operation_digest_check" CHECK(length("product_discovery_runs"."operation_digest") = 64 and "product_discovery_runs"."operation_digest" not glob '*[^0-9a-f]*'),
	CONSTRAINT "product_discovery_run_window_check" CHECK("product_discovery_runs"."window_lower_exclusive" is null or "product_discovery_runs"."window_lower_exclusive" < "product_discovery_runs"."window_upper_inclusive")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `product_discovery_run_trigger_unique` ON `product_discovery_runs` (`workspace_id`,`product_id`,`trigger_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `product_discovery_run_idempotency_unique` ON `product_discovery_runs` (`workspace_id`,`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `product_discovery_run_operation_unique` ON `product_discovery_runs` (`workspace_id`,`operation_digest`);--> statement-breakpoint
CREATE INDEX `product_discovery_run_product_idx` ON `product_discovery_runs` (`workspace_id`,`product_id`,`started_at`);--> statement-breakpoint
CREATE TABLE `product_discovery_schedules` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`product_id` text NOT NULL,
	`configuration_id` text NOT NULL,
	`configuration_digest` text NOT NULL,
	`cadence` text NOT NULL,
	`schedule_key` text NOT NULL,
	`timezone` text NOT NULL,
	`next_run_at` integer NOT NULL,
	`last_successful_watermark` integer,
	`execution_state` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`operation_digest` text NOT NULL,
	`idempotency_key` text NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`configuration_id`) REFERENCES `typed_configurations`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "product_discovery_schedule_digest_check" CHECK(length("product_discovery_schedules"."configuration_digest") = 64 and "product_discovery_schedules"."configuration_digest" not glob '*[^0-9a-f]*'),
	CONSTRAINT "product_discovery_schedule_operation_digest_check" CHECK(length("product_discovery_schedules"."operation_digest") = 64 and "product_discovery_schedules"."operation_digest" not glob '*[^0-9a-f]*')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `product_discovery_schedule_key_unique` ON `product_discovery_schedules` (`workspace_id`,`schedule_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `product_discovery_schedule_idempotency_unique` ON `product_discovery_schedules` (`workspace_id`,`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `product_discovery_active_schedule_unique` ON `product_discovery_schedules` (`workspace_id`,`product_id`,`cadence`) WHERE "product_discovery_schedules"."active" = 1;--> statement-breakpoint
CREATE INDEX `product_discovery_schedule_due_idx` ON `product_discovery_schedules` (`workspace_id`,`execution_state`,`next_run_at`);--> statement-breakpoint
CREATE TABLE `product_discovery_submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`product_id` text NOT NULL,
	`run_id` text NOT NULL,
	`configuration_id` text NOT NULL,
	`provenance_json` text NOT NULL,
	`provenance_digest` text NOT NULL,
	`submission_json` text NOT NULL,
	`submission_digest` text NOT NULL,
	`result_json` text NOT NULL,
	`result_digest` text NOT NULL,
	`status` text NOT NULL,
	`operation_digest` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`run_id`) REFERENCES `product_discovery_runs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`configuration_id`) REFERENCES `typed_configurations`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "product_discovery_submission_digest_check" CHECK(length("product_discovery_submissions"."submission_digest") = 64 and "product_discovery_submissions"."submission_digest" not glob '*[^0-9a-f]*'),
	CONSTRAINT "product_discovery_submission_result_digest_check" CHECK(length("product_discovery_submissions"."result_digest") = 64 and "product_discovery_submissions"."result_digest" not glob '*[^0-9a-f]*'),
	CONSTRAINT "product_discovery_submission_operation_digest_check" CHECK(length("product_discovery_submissions"."operation_digest") = 64 and "product_discovery_submissions"."operation_digest" not glob '*[^0-9a-f]*')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `product_discovery_submission_key_unique` ON `product_discovery_submissions` (`workspace_id`,`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `product_discovery_submission_operation_unique` ON `product_discovery_submissions` (`workspace_id`,`operation_digest`);--> statement-breakpoint
CREATE UNIQUE INDEX `product_discovery_submission_digest_unique` ON `product_discovery_submissions` (`run_id`,`submission_digest`);--> statement-breakpoint
CREATE INDEX `product_discovery_submission_run_idx` ON `product_discovery_submissions` (`run_id`,`created_at`);--> statement-breakpoint

CREATE TRIGGER `product_discovery_prerequisite_scope_insert` BEFORE INSERT ON `product_discovery_configuration_prerequisites`
WHEN NEW.category NOT IN ('capability','limitation','delivery','proof','ownership','claim_guardrail','source_policy','discovery_policy','default_runner_policy')
  OR NOT EXISTS (
    SELECT 1
    FROM `typed_configurations` c
    JOIN `products` p ON p.id = NEW.product_id
    JOIN `knowledge_versions` v ON v.id = NEW.knowledge_version_id
    WHERE c.id = NEW.configuration_id
      AND c.workspace_id = NEW.workspace_id
      AND c.owner_type = 'product'
      AND c.owner_id = NEW.product_id
      AND c.kind = 'product_discovery'
      AND p.workspace_id = NEW.workspace_id
      AND v.workspace_id = NEW.workspace_id
      AND v.scope_type = 'product'
      AND v.scope_id = NEW.product_id
      AND v.status = 'confirmed'
      AND v.kind = NEW.category
      AND COALESCE(v.value_digest, v.source_digest) = NEW.knowledge_version_digest
  )
BEGIN SELECT RAISE(ABORT, 'invalid product discovery prerequisite authority'); END;--> statement-breakpoint
CREATE TRIGGER `product_discovery_prerequisite_immutable_update` BEFORE UPDATE ON `product_discovery_configuration_prerequisites`
BEGIN SELECT RAISE(ABORT, 'product discovery prerequisites are immutable'); END;--> statement-breakpoint
CREATE TRIGGER `product_discovery_prerequisite_immutable_delete` BEFORE DELETE ON `product_discovery_configuration_prerequisites`
BEGIN SELECT RAISE(ABORT, 'product discovery prerequisites are immutable'); END;--> statement-breakpoint

CREATE TRIGGER `product_ready_requires_complete_configuration` BEFORE UPDATE OF lifecycle ON `products`
WHEN NEW.lifecycle = 'ready' AND OLD.lifecycle <> 'ready' AND NOT EXISTS (
  SELECT 1
  FROM `typed_configurations` c
  WHERE c.workspace_id = NEW.workspace_id
    AND c.owner_type = 'product'
    AND c.owner_id = NEW.id
    AND c.kind = 'product_discovery'
    AND c.active = 1
    AND (SELECT COUNT(*) FROM `product_discovery_configuration_prerequisites` p WHERE p.configuration_id = c.id) = 9
)
BEGIN SELECT RAISE(ABORT, 'complete confirmed product discovery configuration required'); END;--> statement-breakpoint

CREATE TRIGGER `product_discovery_schedule_scope_insert` BEFORE INSERT ON `product_discovery_schedules`
WHEN NEW.cadence <> 'monthly'
  OR NEW.execution_state NOT IN ('blocked_missing_capability','active','paused','needs_attention','archived')
  OR NOT EXISTS (
    SELECT 1 FROM `products` p
    JOIN `typed_configurations` c ON c.id = NEW.configuration_id
    WHERE p.id = NEW.product_id
      AND p.workspace_id = NEW.workspace_id
      AND c.workspace_id = NEW.workspace_id
      AND c.owner_type = 'product'
      AND c.owner_id = NEW.product_id
      AND c.kind = 'product_discovery'
      AND c.active = 1
      AND c.digest = NEW.configuration_digest
  )
BEGIN SELECT RAISE(ABORT, 'invalid product discovery schedule scope'); END;--> statement-breakpoint
CREATE TRIGGER `product_discovery_schedule_identity_immutable` BEFORE UPDATE OF workspace_id, product_id, configuration_id, configuration_digest, cadence, schedule_key, timezone, operation_digest, idempotency_key, created_at ON `product_discovery_schedules`
BEGIN SELECT RAISE(ABORT, 'product discovery schedule identity is immutable'); END;--> statement-breakpoint
CREATE TRIGGER `product_discovery_schedule_immutable_delete` BEFORE DELETE ON `product_discovery_schedules`
BEGIN SELECT RAISE(ABORT, 'product discovery schedules are historical'); END;--> statement-breakpoint

CREATE TRIGGER `product_discovery_run_scope_insert` BEFORE INSERT ON `product_discovery_runs`
WHEN NEW.trigger_kind NOT IN ('initial','monthly','manual','material_change')
  OR NEW.execution_state NOT IN ('blocked_missing_capability','queued','running','authority_unknown','succeeded','needs_attention','failed')
  OR json_valid(NEW.manifest_json) <> 1
  OR json_valid(NEW.policy_snapshot_json) <> 1
  OR (NEW.trigger_kind = 'initial' AND NEW.trigger_key <> 'initial:product:' || NEW.product_id || ':' || NEW.configuration_id)
  OR (NEW.trigger_kind = 'material_change' AND NEW.trigger_key <> 'material-change:product:' || NEW.product_id || ':' || NEW.configuration_id)
  OR NOT EXISTS (
    SELECT 1 FROM `products` p
    JOIN `typed_configurations` c ON c.id = NEW.configuration_id
    WHERE p.id = NEW.product_id
      AND p.workspace_id = NEW.workspace_id
      AND c.workspace_id = NEW.workspace_id
      AND c.owner_type = 'product'
      AND c.owner_id = NEW.product_id
      AND c.kind = 'product_discovery'
      AND c.active = 1
      AND c.digest = NEW.configuration_digest
  )
BEGIN SELECT RAISE(ABORT, 'invalid product discovery run scope'); END;--> statement-breakpoint
CREATE TRIGGER `product_discovery_run_identity_immutable` BEFORE UPDATE OF workspace_id, product_id, configuration_id, configuration_digest, trigger_kind, trigger_key, source_event_id, started_at, window_lower_exclusive, window_upper_inclusive, last_successful_watermark, manifest_json, manifest_digest, policy_snapshot_json, policy_snapshot_digest, operation_digest, idempotency_key, created_at ON `product_discovery_runs`
BEGIN SELECT RAISE(ABORT, 'product discovery run identity is immutable'); END;--> statement-breakpoint
CREATE TRIGGER `product_discovery_run_immutable_delete` BEFORE DELETE ON `product_discovery_runs`
BEGIN SELECT RAISE(ABORT, 'product discovery runs are historical'); END;--> statement-breakpoint

CREATE TRIGGER `product_discovery_run_event_scope_insert` BEFORE INSERT ON `product_discovery_run_events`
WHEN NEW.event_type NOT IN ('created','blocked','started','submission_received','authority_unknown','succeeded','needs_attention','failed','watermark_advanced')
  OR json_valid(NEW.event_json) <> 1
  OR NOT EXISTS (SELECT 1 FROM `product_discovery_runs` r WHERE r.id = NEW.run_id AND r.workspace_id = NEW.workspace_id)
BEGIN SELECT RAISE(ABORT, 'invalid product discovery run event scope'); END;--> statement-breakpoint
CREATE TRIGGER `product_discovery_run_event_immutable_update` BEFORE UPDATE ON `product_discovery_run_events`
BEGIN SELECT RAISE(ABORT, 'product discovery run events are immutable'); END;--> statement-breakpoint
CREATE TRIGGER `product_discovery_run_event_immutable_delete` BEFORE DELETE ON `product_discovery_run_events`
BEGIN SELECT RAISE(ABORT, 'product discovery run events are immutable'); END;--> statement-breakpoint

CREATE TRIGGER `product_discovery_submission_scope_insert` BEFORE INSERT ON `product_discovery_submissions`
WHEN NEW.status NOT IN ('partial','authority_unknown','succeeded','rejected')
  OR json_valid(NEW.provenance_json) <> 1
  OR json_valid(NEW.submission_json) <> 1
  OR json_valid(NEW.result_json) <> 1
  OR NOT EXISTS (
    SELECT 1 FROM `product_discovery_runs` r
    WHERE r.id = NEW.run_id
      AND r.workspace_id = NEW.workspace_id
      AND r.product_id = NEW.product_id
      AND r.configuration_id = NEW.configuration_id
  )
BEGIN SELECT RAISE(ABORT, 'invalid product discovery submission scope'); END;--> statement-breakpoint
CREATE TRIGGER `product_discovery_submission_immutable_update` BEFORE UPDATE ON `product_discovery_submissions`
BEGIN SELECT RAISE(ABORT, 'product discovery submissions are immutable'); END;--> statement-breakpoint
CREATE TRIGGER `product_discovery_submission_immutable_delete` BEFORE DELETE ON `product_discovery_submissions`
BEGIN SELECT RAISE(ABORT, 'product discovery submissions are immutable'); END;--> statement-breakpoint

CREATE TRIGGER `market_play_proposal_scope_insert` BEFORE INSERT ON `market_play_proposals`
WHEN NEW.status NOT IN ('new','explored','deferred','dismissed','merged','split','superseded')
  OR (NEW.surfaced = 1 AND NEW.rank IS NULL)
  OR NOT EXISTS (
    SELECT 1 FROM `product_discovery_runs` r
    WHERE r.id = NEW.run_id AND r.workspace_id = NEW.workspace_id AND r.product_id = NEW.product_id
  )
BEGIN SELECT RAISE(ABORT, 'invalid market play proposal scope'); END;--> statement-breakpoint
CREATE TRIGGER `market_play_proposal_identity_immutable` BEFORE UPDATE OF workspace_id, product_id, run_id, fingerprint, created_at ON `market_play_proposals`
BEGIN SELECT RAISE(ABORT, 'market play proposal identity is immutable'); END;--> statement-breakpoint
CREATE TRIGGER `market_play_proposal_immutable_delete` BEFORE DELETE ON `market_play_proposals`
BEGIN SELECT RAISE(ABORT, 'market play proposals are historical'); END;--> statement-breakpoint

CREATE TRIGGER `market_play_proposal_version_scope_insert` BEFORE INSERT ON `market_play_proposal_versions`
WHEN NEW.relationship NOT IN ('new','evidence_attached','split','merge','reopen')
  OR json_valid(NEW.proposal_json) <> 1
  OR NOT EXISTS (
    SELECT 1 FROM `market_play_proposals` p
    JOIN `product_discovery_runs` r ON r.id = NEW.run_id
    JOIN `product_discovery_submissions` s ON s.id = NEW.submission_id
    WHERE p.id = NEW.proposal_id
      AND p.workspace_id = NEW.workspace_id
      AND p.product_id = NEW.product_id
      AND r.workspace_id = NEW.workspace_id
      AND r.product_id = NEW.product_id
      AND s.workspace_id = NEW.workspace_id
      AND s.product_id = NEW.product_id
      AND s.run_id = NEW.run_id
  )
  OR (NEW.predecessor_version_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM `market_play_proposal_versions` v
    WHERE v.id = NEW.predecessor_version_id AND v.workspace_id = NEW.workspace_id AND v.product_id = NEW.product_id
  ))
BEGIN SELECT RAISE(ABORT, 'invalid market play proposal version scope'); END;--> statement-breakpoint
CREATE TRIGGER `market_play_proposal_version_immutable_update` BEFORE UPDATE ON `market_play_proposal_versions`
BEGIN SELECT RAISE(ABORT, 'market play proposal versions are immutable'); END;--> statement-breakpoint
CREATE TRIGGER `market_play_proposal_version_immutable_delete` BEFORE DELETE ON `market_play_proposal_versions`
BEGIN SELECT RAISE(ABORT, 'market play proposal versions are immutable'); END;--> statement-breakpoint

CREATE TRIGGER `market_play_proposal_evidence_scope_insert` BEFORE INSERT ON `market_play_proposal_evidence`
WHEN json_valid(NEW.evidence_json) <> 1
  OR NOT EXISTS (
    SELECT 1 FROM `market_play_proposals` p
    JOIN `market_play_proposal_versions` v ON v.id = NEW.proposal_version_id
    WHERE p.id = NEW.proposal_id
      AND p.workspace_id = NEW.workspace_id
      AND v.workspace_id = NEW.workspace_id
      AND v.proposal_id = NEW.proposal_id
  )
BEGIN SELECT RAISE(ABORT, 'invalid market play proposal evidence scope'); END;--> statement-breakpoint
CREATE TRIGGER `market_play_proposal_evidence_immutable_update` BEFORE UPDATE ON `market_play_proposal_evidence`
BEGIN SELECT RAISE(ABORT, 'market play proposal evidence is immutable'); END;--> statement-breakpoint
CREATE TRIGGER `market_play_proposal_evidence_immutable_delete` BEFORE DELETE ON `market_play_proposal_evidence`
BEGIN SELECT RAISE(ABORT, 'market play proposal evidence is immutable'); END;--> statement-breakpoint

CREATE TRIGGER `market_play_proposal_decision_scope_insert` BEFORE INSERT ON `market_play_proposal_decisions`
WHEN NEW.decision NOT IN ('explore','defer','dismiss')
  OR json_valid(NEW.decision_json) <> 1
  OR NOT EXISTS (
    SELECT 1 FROM `market_play_proposals` p
    JOIN `market_play_proposal_versions` v ON v.id = NEW.proposal_version_id
    WHERE p.id = NEW.proposal_id
      AND p.workspace_id = NEW.workspace_id
      AND p.product_id = NEW.product_id
      AND p.current_version_id = NEW.proposal_version_id
      AND p.revision = NEW.expected_proposal_revision
      AND v.workspace_id = NEW.workspace_id
      AND v.product_id = NEW.product_id
      AND v.proposal_id = NEW.proposal_id
      AND v.proposal_digest = NEW.expected_proposal_digest
  )
BEGIN SELECT RAISE(ABORT, 'stale or cross-scope market play proposal decision'); END;--> statement-breakpoint
CREATE TRIGGER `market_play_proposal_decision_contract_insert` BEFORE INSERT ON `market_play_proposal_decisions`
WHEN (NEW.decision = 'explore' AND (
       NEW.draft_market_play_id IS NULL OR NEW.interview_session_id IS NULL
       OR NOT EXISTS (
         SELECT 1 FROM `market_plays` p JOIN `interview_sessions` s ON s.id = NEW.interview_session_id
         WHERE p.id = NEW.draft_market_play_id
           AND p.workspace_id = NEW.workspace_id
           AND p.product_id = NEW.product_id
           AND p.lifecycle = 'draft'
           AND s.workspace_id = NEW.workspace_id
           AND s.scope_type = 'market_play'
           AND s.scope_id = NEW.draft_market_play_id
       )
     ))
  OR (NEW.decision = 'defer' AND (
       NEW.reason IS NULL OR length(trim(NEW.reason)) = 0 OR NEW.review_at IS NULL
       OR NEW.cooldown_until <> NEW.created_at + 7776000000
       OR NEW.review_at <> NEW.cooldown_until
     ))
  OR (NEW.decision = 'dismiss' AND (
       NEW.reason IS NULL OR length(trim(NEW.reason)) = 0 OR NEW.confirmed <> 1
       OR NEW.cooldown_until <> NEW.created_at + 15552000000
     ))
BEGIN SELECT RAISE(ABORT, 'invalid market play proposal decision contract'); END;--> statement-breakpoint
CREATE TRIGGER `market_play_proposal_decision_immutable_update` BEFORE UPDATE ON `market_play_proposal_decisions`
BEGIN SELECT RAISE(ABORT, 'market play proposal decisions are immutable'); END;--> statement-breakpoint
CREATE TRIGGER `market_play_proposal_decision_immutable_delete` BEFORE DELETE ON `market_play_proposal_decisions`
BEGIN SELECT RAISE(ABORT, 'market play proposal decisions are immutable'); END;--> statement-breakpoint

CREATE TRIGGER `market_play_proposal_lineage_scope_insert` BEFORE INSERT ON `market_play_proposal_lineage`
WHEN NEW.relationship NOT IN ('collision','evidence_attached','split','merge','reopen')
  OR json_valid(NEW.lineage_json) <> 1
  OR NOT EXISTS (
    SELECT 1 FROM `market_play_proposals` source, `market_play_proposals` target
    WHERE source.id = NEW.source_proposal_id
      AND target.id = NEW.target_proposal_id
      AND source.workspace_id = NEW.workspace_id
      AND target.workspace_id = NEW.workspace_id
      AND source.product_id = NEW.product_id
      AND target.product_id = NEW.product_id
  )
BEGIN SELECT RAISE(ABORT, 'invalid market play proposal lineage scope'); END;--> statement-breakpoint
CREATE TRIGGER `market_play_proposal_lineage_immutable_update` BEFORE UPDATE ON `market_play_proposal_lineage`
BEGIN SELECT RAISE(ABORT, 'market play proposal lineage is immutable'); END;--> statement-breakpoint
CREATE TRIGGER `market_play_proposal_lineage_immutable_delete` BEFORE DELETE ON `market_play_proposal_lineage`
BEGIN SELECT RAISE(ABORT, 'market play proposal lineage is immutable'); END;--> statement-breakpoint

CREATE TRIGGER `product_configuration_lineage_scope_insert` BEFORE INSERT ON `product_configuration_lineage`
WHEN json_valid(NEW.lineage_json) <> 1
  OR NOT EXISTS (
    SELECT 1 FROM `configuration_activations` a
    JOIN `typed_configurations` previous ON previous.id = NEW.predecessor_configuration_id
    JOIN `typed_configurations` next ON next.id = NEW.successor_configuration_id
    JOIN `product_discovery_runs` r ON r.id = NEW.material_change_run_id
    WHERE a.id = NEW.replacement_activation_id
      AND a.workspace_id = NEW.workspace_id
      AND a.previous_configuration_id = NEW.predecessor_configuration_id
      AND a.next_configuration_id = NEW.successor_configuration_id
      AND previous.workspace_id = NEW.workspace_id
      AND previous.owner_type = 'product'
      AND previous.owner_id = NEW.product_id
      AND next.workspace_id = NEW.workspace_id
      AND next.owner_type = 'product'
      AND next.owner_id = NEW.product_id
      AND r.workspace_id = NEW.workspace_id
      AND r.product_id = NEW.product_id
      AND r.configuration_id = NEW.successor_configuration_id
      AND r.trigger_kind = 'material_change'
  )
BEGIN SELECT RAISE(ABORT, 'invalid product configuration lineage scope'); END;--> statement-breakpoint
CREATE TRIGGER `product_configuration_lineage_immutable_update` BEFORE UPDATE ON `product_configuration_lineage`
BEGIN SELECT RAISE(ABORT, 'product configuration lineage is immutable'); END;--> statement-breakpoint
CREATE TRIGGER `product_configuration_lineage_immutable_delete` BEFORE DELETE ON `product_configuration_lineage`
BEGIN SELECT RAISE(ABORT, 'product configuration lineage is immutable'); END;--> statement-breakpoint

CREATE TRIGGER `private_synthetic_proof_authorization_scope_insert` BEFORE INSERT ON `private_synthetic_proof_authorizations`
WHEN NEW.capability <> 'private-hosted-synthetic-proposal-proof'
  OR length(trim(NEW.reviewed_source_revision)) = 0
  OR length(trim(NEW.fixture_provenance)) = 0
  OR length(trim(NEW.evidence_reference)) = 0
  OR NOT EXISTS (
    SELECT 1 FROM `workspaces` w
    JOIN `products` p ON p.id = NEW.product_id
    JOIN `interview_confirmations` c ON c.id = NEW.interview_confirmation_id
    JOIN `knowledge_versions` v ON v.id = NEW.confirmed_knowledge_version_id
    WHERE w.id = NEW.workspace_id
      AND w.owner_subject = NEW.owner_subject_id
      AND p.workspace_id = NEW.workspace_id
      AND p.revision = NEW.expected_product_revision
      AND p.lifecycle = 'ready'
      AND c.workspace_id = NEW.workspace_id
      AND c.knowledge_version_id = NEW.confirmed_knowledge_version_id
      AND c.decision = 'accept'
      AND v.workspace_id = NEW.workspace_id
      AND v.scope_type = 'product'
      AND v.scope_id = NEW.product_id
      AND v.status = 'confirmed'
  )
BEGIN SELECT RAISE(ABORT, 'private synthetic proof requires server-derived confirmed owner authority'); END;--> statement-breakpoint
CREATE TRIGGER `private_synthetic_proof_authorization_immutable_update` BEFORE UPDATE ON `private_synthetic_proof_authorizations`
BEGIN SELECT RAISE(ABORT, 'private synthetic proof authorizations are immutable'); END;--> statement-breakpoint
CREATE TRIGGER `private_synthetic_proof_authorization_immutable_delete` BEFORE DELETE ON `private_synthetic_proof_authorizations`
BEGIN SELECT RAISE(ABORT, 'private synthetic proof authorizations are immutable'); END;--> statement-breakpoint

CREATE TRIGGER `private_synthetic_proof_consumption_scope_insert` BEFORE INSERT ON `private_synthetic_proof_consumptions`
WHEN json_valid(NEW.result_json) <> 1
  OR NOT EXISTS (
    SELECT 1 FROM `private_synthetic_proof_authorizations` a
    JOIN `product_discovery_runs` r ON r.id = NEW.winner_run_id
    JOIN `product_discovery_submissions` s ON s.id = NEW.winner_submission_id
    JOIN `audit_events` e ON e.id = NEW.audit_event_id
    WHERE a.id = NEW.authorization_id
      AND a.workspace_id = NEW.workspace_id
      AND a.product_id = NEW.product_id
      AND a.expires_at >= NEW.consumed_at
      AND r.workspace_id = NEW.workspace_id
      AND r.product_id = NEW.product_id
      AND s.workspace_id = NEW.workspace_id
      AND s.product_id = NEW.product_id
      AND s.run_id = NEW.winner_run_id
      AND s.operation_digest = NEW.operation_digest
      AND e.workspace_id = NEW.workspace_id
      AND e.action = 'private_synthetic_proof.consumed'
  )
BEGIN SELECT RAISE(ABORT, 'invalid or expired private synthetic proof consumption'); END;--> statement-breakpoint
CREATE TRIGGER `private_synthetic_proof_consumption_immutable_update` BEFORE UPDATE ON `private_synthetic_proof_consumptions`
BEGIN SELECT RAISE(ABORT, 'private synthetic proof consumptions are immutable'); END;--> statement-breakpoint
CREATE TRIGGER `private_synthetic_proof_consumption_immutable_delete` BEFORE DELETE ON `private_synthetic_proof_consumptions`
BEGIN SELECT RAISE(ABORT, 'private synthetic proof consumptions are immutable'); END;
