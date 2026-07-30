CREATE TABLE `csrf_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`principal_subject` text NOT NULL,
	`token_digest` text NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `csrf_tokens_token_digest_unique` ON `csrf_tokens` (`token_digest`);--> statement-breakpoint
CREATE INDEX `csrf_principal_expiry_idx` ON `csrf_tokens` (`principal_subject`,`expires_at`,`used_at`);--> statement-breakpoint
DROP INDEX `interview_session_scope_unique`;--> statement-breakpoint
CREATE INDEX `interview_session_scope_idx` ON `interview_sessions` (`workspace_id`,`scope_type`,`scope_id`,`state`);--> statement-breakpoint
ALTER TABLE `interview_answers` ADD `operation_digest` text DEFAULT 'legacy-unbound' NOT NULL;--> statement-breakpoint
ALTER TABLE `interview_confirmations` ADD `operation_digest` text DEFAULT 'legacy-unbound' NOT NULL;