ALTER TABLE `interview_answers` ADD `proposal_json` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `interview_answers` ADD `proposal_digest` text DEFAULT 'legacy-unbound' NOT NULL;