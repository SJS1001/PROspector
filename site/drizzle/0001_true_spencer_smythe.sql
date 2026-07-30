CREATE TABLE `interview_answers` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`session_id` text NOT NULL,
	`question_id` text NOT NULL,
	`question_revision` integer NOT NULL,
	`choice` text NOT NULL,
	`correction_json` text,
	`idempotency_key` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`session_id`) REFERENCES `interview_sessions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`question_id`) REFERENCES `interview_questions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `answer_question_unique` ON `interview_answers` (`workspace_id`,`question_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `answer_idempotency_unique` ON `interview_answers` (`workspace_id`,`idempotency_key`);--> statement-breakpoint
CREATE TABLE `interview_confirmations` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`session_id` text NOT NULL,
	`question_id` text NOT NULL,
	`answer_id` text NOT NULL,
	`decision` text NOT NULL,
	`knowledge_version_id` text,
	`idempotency_key` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`session_id`) REFERENCES `interview_sessions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`question_id`) REFERENCES `interview_questions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`answer_id`) REFERENCES `interview_answers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`knowledge_version_id`) REFERENCES `knowledge_versions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `confirmation_answer_unique` ON `interview_confirmations` (`workspace_id`,`answer_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `confirmation_idempotency_unique` ON `interview_confirmations` (`workspace_id`,`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `interview_session_scope_unique` ON `interview_sessions` (`workspace_id`,`scope_type`,`scope_id`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_interview_questions` (
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
	`status` text NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `interview_sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_interview_questions`("id", "workspace_id", "created_at", "updated_at", "revision", "session_id", "version", "prompt", "research_json", "recommendation", "status") SELECT "id", "workspace_id", "created_at", "updated_at", "revision", "session_id", "version", "prompt", "research_json", "recommendation", "status" FROM `interview_questions`;--> statement-breakpoint
DROP TABLE `interview_questions`;--> statement-breakpoint
ALTER TABLE `__new_interview_questions` RENAME TO `interview_questions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `question_version_unique` ON `interview_questions` (`workspace_id`,`session_id`,`version`);