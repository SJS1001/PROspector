CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`play_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`state` text DEFAULT 'draft' NOT NULL,
	FOREIGN KEY (`play_id`) REFERENCES `market_plays`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `account_play_organization_unique` ON `accounts` (`workspace_id`,`play_id`,`organization_id`);--> statement-breakpoint
CREATE TABLE `artifact_configuration_dependencies` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`artifact_type` text NOT NULL,
	`artifact_id` text NOT NULL,
	`configuration_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`configuration_id`) REFERENCES `typed_configurations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `artifact_configuration_dependency_unique` ON `artifact_configuration_dependencies` (`workspace_id`,`artifact_type`,`artifact_id`,`configuration_id`);--> statement-breakpoint
CREATE TABLE `authority_commands` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`command_type` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`operation_digest` text NOT NULL,
	`expected_revision` integer NOT NULL,
	`subject_type` text NOT NULL,
	`subject_id` text NOT NULL,
	`status` text DEFAULT 'accepted' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `authority_command_key_unique` ON `authority_commands` (`workspace_id`,`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `authority_command_digest_unique` ON `authority_commands` (`workspace_id`,`operation_digest`);--> statement-breakpoint
CREATE TABLE `companies` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`name` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `companies_workspace_unique` ON `companies` (`workspace_id`);--> statement-breakpoint
CREATE TABLE `configuration_activations` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`replacement_candidate_id` text NOT NULL,
	`authority_command_id` text NOT NULL,
	`previous_configuration_id` text,
	`next_configuration_id` text NOT NULL,
	`expected_owner_revision` integer NOT NULL,
	`operation_digest` text NOT NULL,
	FOREIGN KEY (`replacement_candidate_id`) REFERENCES `replacement_candidates`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`authority_command_id`) REFERENCES `authority_commands`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`previous_configuration_id`) REFERENCES `typed_configurations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`next_configuration_id`) REFERENCES `typed_configurations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `configuration_activation_candidate_unique` ON `configuration_activations` (`replacement_candidate_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `configuration_activation_command_unique` ON `configuration_activations` (`authority_command_id`);--> statement-breakpoint
CREATE TABLE `configuration_knowledge_dependencies` (
	`configuration_id` text NOT NULL,
	`knowledge_version_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`configuration_id`) REFERENCES `typed_configurations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`knowledge_version_id`) REFERENCES `knowledge_versions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `configuration_knowledge_dependency_unique` ON `configuration_knowledge_dependencies` (`configuration_id`,`knowledge_version_id`);--> statement-breakpoint
CREATE TABLE `contact_relevance` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`play_id` text NOT NULL,
	`contact_id` text NOT NULL,
	`relevance_json` text NOT NULL,
	FOREIGN KEY (`play_id`) REFERENCES `market_plays`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `contact_relevance_play_contact_unique` ON `contact_relevance` (`workspace_id`,`play_id`,`contact_id`);--> statement-breakpoint
CREATE TABLE `contacts` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`company_id` text NOT NULL,
	`identity_digest` text NOT NULL,
	`display_name` text NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `contact_company_identity_unique` ON `contacts` (`workspace_id`,`company_id`,`identity_digest`);--> statement-breakpoint
CREATE TABLE `drift_impact_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`drift_id` text NOT NULL,
	`impact_json` text NOT NULL,
	`impact_digest` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`drift_id`) REFERENCES `knowledge_drifts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `drift_impact_digest_unique` ON `drift_impact_snapshots` (`drift_id`,`impact_digest`);--> statement-breakpoint
CREATE TABLE `interview_authority_bindings` (
	`answer_id` text PRIMARY KEY NOT NULL,
	`confirmation_id` text NOT NULL,
	`knowledge_version_id` text NOT NULL,
	`knowledge_item_id` text NOT NULL,
	`proposal_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`answer_id`) REFERENCES `interview_answers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`confirmation_id`) REFERENCES `interview_confirmations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`knowledge_version_id`) REFERENCES `knowledge_versions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`knowledge_item_id`) REFERENCES `knowledge_items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `interview_authority_review` (
	`answer_id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`status` text NOT NULL,
	`reason` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`answer_id`) REFERENCES `interview_answers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `knowledge_drifts` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`knowledge_item_id` text NOT NULL,
	`current_version_id` text NOT NULL,
	`proposal_id` text NOT NULL,
	`risk_kind` text NOT NULL,
	`dependency_digest` text NOT NULL,
	`status` text NOT NULL,
	FOREIGN KEY (`knowledge_item_id`) REFERENCES `knowledge_items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`current_version_id`) REFERENCES `knowledge_versions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`proposal_id`) REFERENCES `knowledge_proposals`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `knowledge_items` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`company_id` text NOT NULL,
	`scope_type` text NOT NULL,
	`scope_id` text NOT NULL,
	`kind` text NOT NULL,
	`slot` text DEFAULT 'default' NOT NULL,
	`current_version_id` text,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `knowledge_item_scope_unique` ON `knowledge_items` (`workspace_id`,`scope_type`,`scope_id`,`kind`,`slot`);--> statement-breakpoint
CREATE UNIQUE INDEX `knowledge_item_current_version_unique` ON `knowledge_items` (`current_version_id`);--> statement-breakpoint
CREATE TABLE `knowledge_proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`company_id` text NOT NULL,
	`source_id` text,
	`excerpt_id` text,
	`destination_scope_type` text NOT NULL,
	`destination_scope_id` text NOT NULL,
	`kind` text NOT NULL,
	`value_json` text NOT NULL,
	`provenance_json` text NOT NULL,
	`proposal_digest` text NOT NULL,
	`origin` text NOT NULL,
	`status` text DEFAULT 'proposed' NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`excerpt_id`) REFERENCES `source_excerpts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `knowledge_proposal_digest_unique` ON `knowledge_proposals` (`workspace_id`,`proposal_digest`);--> statement-breakpoint
CREATE TABLE `offers` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`profile_id` text NOT NULL,
	`name` text NOT NULL,
	`value_json` text NOT NULL,
	`question_id` text NOT NULL,
	`answer_id` text NOT NULL,
	`proposal_id` text NOT NULL,
	`decision_id` text NOT NULL,
	`knowledge_version_id` text NOT NULL,
	`authority_command_id` text NOT NULL,
	`audit_event_id` text NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `customer_profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `offers_profile_idx` ON `offers` (`workspace_id`,`profile_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `offers_authority_unique` ON `offers` (`authority_command_id`);--> statement-breakpoint
CREATE TABLE `organizations` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`company_id` text NOT NULL,
	`canonical_name` text NOT NULL,
	`identity_digest` text NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `organization_company_identity_unique` ON `organizations` (`workspace_id`,`company_id`,`identity_digest`);--> statement-breakpoint
CREATE TABLE `phase_activation_gates` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`capability` text NOT NULL,
	`authorization_reference` text NOT NULL,
	`target_project_deployment` text NOT NULL,
	`reviewed_source_digest` text NOT NULL,
	`migration_identity_status` text NOT NULL,
	`post_migration_evidence_reference` text NOT NULL,
	`independent_review_reference` text NOT NULL,
	`deployed_boundary_proof_reference` text NOT NULL,
	`tuple_digest` text NOT NULL,
	`accepted_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `phase_gate_capability_unique` ON `phase_activation_gates` (`workspace_id`,`capability`);--> statement-breakpoint
CREATE UNIQUE INDEX `phase_gate_tuple_unique` ON `phase_activation_gates` (`workspace_id`,`capability`,`tuple_digest`);--> statement-breakpoint
CREATE TABLE `proposal_decisions` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`proposal_id` text NOT NULL,
	`answer_id` text,
	`authority_command_id` text NOT NULL,
	`decision` text NOT NULL,
	`reviewed_snapshot_digest` text NOT NULL,
	`operation_digest` text NOT NULL,
	`idempotency_key` text NOT NULL,
	FOREIGN KEY (`proposal_id`) REFERENCES `knowledge_proposals`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`answer_id`) REFERENCES `interview_answers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`authority_command_id`) REFERENCES `authority_commands`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `proposal_decision_proposal_unique` ON `proposal_decisions` (`proposal_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `proposal_decision_key_unique` ON `proposal_decisions` (`workspace_id`,`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `proposal_decision_snapshot_unique` ON `proposal_decisions` (`workspace_id`,`reviewed_snapshot_digest`);--> statement-breakpoint
CREATE TABLE `proposal_prerequisites` (
	`proposal_id` text NOT NULL,
	`knowledge_version_id` text NOT NULL,
	`prerequisite_digest` text NOT NULL,
	FOREIGN KEY (`proposal_id`) REFERENCES `knowledge_proposals`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`knowledge_version_id`) REFERENCES `knowledge_versions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `proposal_prerequisite_unique` ON `proposal_prerequisites` (`proposal_id`,`knowledge_version_id`);--> statement-breakpoint
CREATE TABLE `replacement_candidates` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`owner_type` text NOT NULL,
	`owner_id` text NOT NULL,
	`current_configuration_id` text,
	`candidate_configuration_id` text NOT NULL,
	`impact_snapshot_id` text NOT NULL,
	`candidate_digest` text NOT NULL,
	`status` text DEFAULT 'proposed' NOT NULL,
	FOREIGN KEY (`current_configuration_id`) REFERENCES `typed_configurations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`candidate_configuration_id`) REFERENCES `typed_configurations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`impact_snapshot_id`) REFERENCES `drift_impact_snapshots`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `replacement_candidate_digest_unique` ON `replacement_candidates` (`workspace_id`,`candidate_digest`);--> statement-breakpoint
CREATE TABLE `research_candidates` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`source_id` text NOT NULL,
	`excerpt_id` text NOT NULL,
	`opaque_locator` text NOT NULL,
	`provenance_digest` text NOT NULL,
	`visibility` text NOT NULL,
	`status` text NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`excerpt_id`) REFERENCES `source_excerpts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `research_candidate_locator_unique` ON `research_candidates` (`workspace_id`,`opaque_locator`);--> statement-breakpoint
CREATE TABLE `source_custody` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`source_id` text NOT NULL,
	`object_reference` text NOT NULL,
	`quarantine_status` text NOT NULL,
	`scan_status` text NOT NULL,
	`object_digest` text NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `source_custody_object_unique` ON `source_custody` (`workspace_id`,`object_reference`);--> statement-breakpoint
CREATE TABLE `source_excerpts` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`source_id` text NOT NULL,
	`excerpt_digest` text NOT NULL,
	`content` text NOT NULL,
	`locator` text NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `source_excerpt_digest_unique` ON `source_excerpts` (`workspace_id`,`source_id`,`excerpt_digest`);--> statement-breakpoint
CREATE TABLE `sources` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`origin` text NOT NULL,
	`opaque_locator` text NOT NULL,
	`source_digest` text NOT NULL,
	`privacy` text NOT NULL,
	`license` text NOT NULL,
	`status` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `source_workspace_digest_unique` ON `sources` (`workspace_id`,`source_digest`);--> statement-breakpoint
CREATE UNIQUE INDEX `source_workspace_locator_unique` ON `sources` (`workspace_id`,`opaque_locator`);--> statement-breakpoint
CREATE TABLE `targets` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`profile_id` text NOT NULL,
	`account_id` text NOT NULL,
	`state` text DEFAULT 'draft' NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `customer_profiles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `target_profile_account_unique` ON `targets` (`workspace_id`,`profile_id`,`account_id`);--> statement-breakpoint
CREATE TABLE `workspace_companies` (
	`workspace_id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspace_companies_company_unique` ON `workspace_companies` (`company_id`);--> statement-breakpoint
ALTER TABLE `typed_configurations` ADD `company_id` text;--> statement-breakpoint
CREATE INDEX `config_owner_idx` ON `typed_configurations` (`workspace_id`,`owner_type`,`owner_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `active_configuration_owner_unique` ON `typed_configurations` (`workspace_id`,`owner_type`,`owner_id`,`kind`) WHERE `active` = 1;--> statement-breakpoint
ALTER TABLE `interview_sessions` ADD `company_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `live_interview_destination_unique` ON `interview_sessions` (`workspace_id`,`scope_type`,`scope_id`) WHERE `state` IN ('open', 'awaiting_answer', 'awaiting_confirmation', 'paused');--> statement-breakpoint
ALTER TABLE `knowledge_versions` ADD `knowledge_item_id` text REFERENCES knowledge_items(id);--> statement-breakpoint
ALTER TABLE `knowledge_versions` ADD `proposal_id` text;--> statement-breakpoint
ALTER TABLE `knowledge_versions` ADD `decision_id` text;--> statement-breakpoint
ALTER TABLE `knowledge_versions` ADD `authority_command_id` text;--> statement-breakpoint
ALTER TABLE `knowledge_versions` ADD `value_digest` text;--> statement-breakpoint
CREATE UNIQUE INDEX `knowledge_current_version_item_unique` ON `knowledge_versions` (`knowledge_item_id`);--> statement-breakpoint
ALTER TABLE `products` ADD `company_id` text;--> statement-breakpoint
CREATE INDEX `products_company_idx` ON `products` (`workspace_id`,`company_id`);--> statement-breakpoint
CREATE TRIGGER `products_company_scope_insert` BEFORE INSERT ON `products`
WHEN NEW.company_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM companies c WHERE c.id = NEW.company_id AND c.workspace_id = NEW.workspace_id)
BEGIN SELECT RAISE(ABORT, 'company scope mismatch'); END;--> statement-breakpoint
CREATE TRIGGER `market_play_workspace_parent_insert` BEFORE INSERT ON `market_plays`
WHEN NOT EXISTS (SELECT 1 FROM products p WHERE p.id = NEW.product_id AND p.workspace_id = NEW.workspace_id)
BEGIN SELECT RAISE(ABORT, 'product workspace mismatch'); END;--> statement-breakpoint
CREATE TRIGGER `profile_workspace_parent_insert` BEFORE INSERT ON `customer_profiles`
WHEN NOT EXISTS (SELECT 1 FROM market_plays p WHERE p.id = NEW.play_id AND p.workspace_id = NEW.workspace_id)
BEGIN SELECT RAISE(ABORT, 'play workspace mismatch'); END;--> statement-breakpoint
CREATE TRIGGER `offer_profile_only_insert` BEFORE INSERT ON `offers`
WHEN NOT EXISTS (SELECT 1 FROM customer_profiles p WHERE p.id = NEW.profile_id AND p.workspace_id = NEW.workspace_id)
BEGIN SELECT RAISE(ABORT, 'offer requires profile parent'); END;--> statement-breakpoint
CREATE TRIGGER `offer_lineage_insert` BEFORE INSERT ON `offers`
WHEN NOT EXISTS (SELECT 1 FROM interview_questions q WHERE q.id = NEW.question_id AND q.workspace_id = NEW.workspace_id)
  OR NOT EXISTS (SELECT 1 FROM interview_answers a WHERE a.id = NEW.answer_id AND a.question_id = NEW.question_id AND a.workspace_id = NEW.workspace_id)
  OR NOT EXISTS (SELECT 1 FROM proposal_decisions d WHERE d.id = NEW.decision_id AND d.proposal_id = NEW.proposal_id AND d.authority_command_id = NEW.authority_command_id AND d.workspace_id = NEW.workspace_id)
  OR NOT EXISTS (SELECT 1 FROM knowledge_versions k WHERE k.id = NEW.knowledge_version_id AND k.decision_id = NEW.decision_id AND k.workspace_id = NEW.workspace_id)
  OR NOT EXISTS (SELECT 1 FROM audit_events e WHERE e.id = NEW.audit_event_id AND e.workspace_id = NEW.workspace_id)
BEGIN SELECT RAISE(ABORT, 'offer authority lineage mismatch'); END;--> statement-breakpoint
CREATE TRIGGER `phase_gate_complete_tuple_insert` BEFORE INSERT ON `phase_activation_gates`
WHEN NEW.capability != 'consensus_knowledge' OR length(trim(NEW.authorization_reference)) = 0 OR length(trim(NEW.target_project_deployment)) = 0 OR length(trim(NEW.reviewed_source_digest)) = 0 OR length(trim(NEW.migration_identity_status)) = 0 OR length(trim(NEW.post_migration_evidence_reference)) = 0 OR length(trim(NEW.independent_review_reference)) = 0 OR length(trim(NEW.deployed_boundary_proof_reference)) = 0 OR length(NEW.tuple_digest) != 64
BEGIN SELECT RAISE(ABORT, 'incomplete consensus_knowledge gate tuple'); END;--> statement-breakpoint
CREATE TRIGGER `phase_gate_immutable_update` BEFORE UPDATE ON `phase_activation_gates`
BEGIN SELECT RAISE(ABORT, 'activation gates are immutable'); END;--> statement-breakpoint
CREATE TRIGGER `source_custody_quarantine_only` BEFORE INSERT ON `source_custody`
WHEN NEW.quarantine_status NOT IN ('quarantined', 'scan_pending', 'scan_failed') OR NEW.scan_status NOT IN ('not_scanned', 'pending', 'failed')
BEGIN SELECT RAISE(ABORT, 'uploads remain quarantined'); END;--> statement-breakpoint
CREATE TRIGGER `knowledge_version_immutable_update` BEFORE UPDATE OF value_json, source_digest, proposal_id, decision_id, authority_command_id ON `knowledge_versions`
BEGIN SELECT RAISE(ABORT, 'knowledge versions are immutable'); END;--> statement-breakpoint
CREATE TRIGGER `authority_command_expected_revision` BEFORE INSERT ON `authority_commands`
WHEN NEW.expected_revision < 1 OR length(trim(NEW.operation_digest)) = 0
BEGIN SELECT RAISE(ABORT, 'invalid authority command guard'); END;--> statement-breakpoint
INSERT INTO `companies` (`id`, `workspace_id`, `created_at`, `updated_at`, `revision`, `name`, `status`)
SELECT 'company-' || w.id, w.id, w.created_at, w.updated_at, 1, w.company_name, 'draft' FROM `workspaces` w
WHERE NOT EXISTS (SELECT 1 FROM `companies` c WHERE c.workspace_id = w.id);--> statement-breakpoint
INSERT INTO `workspace_companies` (`workspace_id`, `company_id`, `created_at`)
SELECT w.id, c.id, w.created_at FROM `workspaces` w JOIN `companies` c ON c.workspace_id = w.id
WHERE NOT EXISTS (SELECT 1 FROM `workspace_companies` wc WHERE wc.workspace_id = w.id);--> statement-breakpoint
UPDATE `products` SET `company_id` = (SELECT c.id FROM `companies` c WHERE c.workspace_id = `products`.`workspace_id`) WHERE `company_id` IS NULL;--> statement-breakpoint
UPDATE `interview_sessions` SET `company_id` = (SELECT c.id FROM `companies` c WHERE c.workspace_id = `interview_sessions`.`workspace_id`) WHERE `company_id` IS NULL;--> statement-breakpoint
INSERT INTO `knowledge_items` (`id`, `workspace_id`, `created_at`, `updated_at`, `revision`, `company_id`, `scope_type`, `scope_id`, `kind`, `slot`, `current_version_id`)
SELECT 'knowledge-item-' || k.id, k.workspace_id, k.created_at, k.updated_at, 1, c.id, k.scope_type, k.scope_id, k.kind, k.id, k.id FROM `knowledge_versions` k JOIN `companies` c ON c.workspace_id = k.workspace_id
WHERE k.source_digest IS NOT NULL AND k.source_digest != 'legacy-unbound' AND NOT EXISTS (SELECT 1 FROM `knowledge_items` ki WHERE ki.current_version_id = k.id);--> statement-breakpoint
UPDATE `knowledge_versions` SET `knowledge_item_id` = (SELECT ki.id FROM `knowledge_items` ki WHERE ki.current_version_id = `knowledge_versions`.`id`), `value_digest` = `source_digest`
WHERE `source_digest` IS NOT NULL AND `source_digest` != 'legacy-unbound';--> statement-breakpoint
INSERT INTO `interview_authority_bindings` (`answer_id`, `confirmation_id`, `knowledge_version_id`, `knowledge_item_id`, `proposal_id`, `created_at`)
SELECT a.id, c.id, k.id, ki.id, NULL, c.created_at FROM `interview_answers` a JOIN `interview_confirmations` c ON c.answer_id = a.id JOIN `knowledge_versions` k ON k.id = c.knowledge_version_id JOIN `knowledge_items` ki ON ki.current_version_id = k.id
WHERE a.proposal_digest != 'legacy-unbound' AND c.operation_digest != 'legacy-unbound' AND NOT EXISTS (SELECT 1 FROM `interview_authority_bindings` b WHERE b.answer_id = a.id);--> statement-breakpoint
INSERT INTO `interview_authority_review` (`answer_id`, `workspace_id`, `status`, `reason`, `created_at`)
SELECT a.id, a.workspace_id, 'review_required', 'legacy_unbound_authority', a.created_at FROM `interview_answers` a
WHERE a.proposal_digest = 'legacy-unbound' AND NOT EXISTS (SELECT 1 FROM `interview_authority_review` r WHERE r.answer_id = a.id);
