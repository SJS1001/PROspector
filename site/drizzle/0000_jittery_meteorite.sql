CREATE TABLE `audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`actor_type` text NOT NULL,
	`actor_id` text NOT NULL,
	`action` text NOT NULL,
	`subject_type` text NOT NULL,
	`subject_id` text NOT NULL,
	`detail_json` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_workspace_time_idx` ON `audit_events` (`workspace_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `typed_configurations` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`owner_type` text NOT NULL,
	`owner_id` text NOT NULL,
	`kind` text NOT NULL,
	`digest` text NOT NULL,
	`manifest_json` text NOT NULL,
	`active` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `config_digest_unique` ON `typed_configurations` (`workspace_id`,`kind`,`digest`);--> statement-breakpoint
CREATE TABLE `import_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`format` text NOT NULL,
	`format_version` text NOT NULL,
	`artifact_digests_json` text NOT NULL,
	`status` text NOT NULL,
	`counts_json` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `import_identity_unique` ON `import_batches` (`workspace_id`,`format`,`format_version`,`artifact_digests_json`);--> statement-breakpoint
CREATE TABLE `import_items` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`batch_id` text NOT NULL,
	`source_index` integer NOT NULL,
	`item_hash` text NOT NULL,
	`destination_type` text NOT NULL,
	`normalized_json` text NOT NULL,
	`review_state` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `import_item_unique` ON `import_items` (`workspace_id`,`batch_id`,`source_index`);--> statement-breakpoint
CREATE TABLE `interview_questions` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`session_id` text NOT NULL,
	`version` integer NOT NULL,
	`prompt` text NOT NULL,
	`research_json` text NOT NULL,
	`recommendation` text,
	`status` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `question_version_unique` ON `interview_questions` (`workspace_id`,`session_id`,`version`);--> statement-breakpoint
CREATE TABLE `interview_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`scope_type` text NOT NULL,
	`scope_id` text NOT NULL,
	`state` text NOT NULL,
	`active_question_id` text
);
--> statement-breakpoint
CREATE TABLE `knowledge_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`scope_type` text NOT NULL,
	`scope_id` text NOT NULL,
	`kind` text NOT NULL,
	`value_json` text NOT NULL,
	`status` text NOT NULL,
	`source_digest` text
);
--> statement-breakpoint
CREATE INDEX `knowledge_scope_idx` ON `knowledge_versions` (`workspace_id`,`scope_type`,`scope_id`);--> statement-breakpoint
CREATE TABLE `market_plays` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`product_id` text NOT NULL,
	`name` text NOT NULL,
	`lifecycle` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `plays_product_idx` ON `market_plays` (`workspace_id`,`product_id`);--> statement-breakpoint
CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`name` text NOT NULL,
	`lifecycle` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `products_workspace_idx` ON `products` (`workspace_id`);--> statement-breakpoint
CREATE TABLE `customer_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`play_id` text NOT NULL,
	`name` text NOT NULL,
	`lifecycle` text NOT NULL,
	`timezone` text NOT NULL,
	`weekly_target` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `profiles_play_idx` ON `customer_profiles` (`workspace_id`,`play_id`);--> statement-breakpoint
CREATE TABLE `prospects` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`profile_id` text NOT NULL,
	`organization_name` text NOT NULL,
	`target_name` text,
	`state` text NOT NULL,
	`score` integer,
	`configuration_id` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `prospect_queue_idx` ON `prospects` (`workspace_id`,`profile_id`,`state`);--> statement-breakpoint
CREATE TABLE `suppressions` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`subject_type` text NOT NULL,
	`subject_digest` text NOT NULL,
	`channel` text NOT NULL,
	`reason` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `suppression_subject_unique` ON `suppressions` (`workspace_id`,`subject_type`,`subject_digest`,`channel`);--> statement-breakpoint
CREATE TABLE `workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`company_name` text NOT NULL,
	`owner_subject` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspaces_owner_subject_unique` ON `workspaces` (`owner_subject`);