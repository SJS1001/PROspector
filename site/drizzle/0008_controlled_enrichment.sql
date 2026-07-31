CREATE TABLE `contact_eligibility_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`contact_id` text NOT NULL,
	`prospect_id` text NOT NULL,
	`configuration_id` text NOT NULL,
	`configuration_digest` text NOT NULL,
	`configuration_revision` integer NOT NULL,
	`prospect_revision` integer NOT NULL,
	`state` text NOT NULL,
	`eligible` integer NOT NULL,
	`observation_ids_json` text NOT NULL,
	`reason_codes_json` text NOT NULL,
	`preserved_suppression_refs_json` text DEFAULT '[]' NOT NULL,
	`snapshot_digest` text NOT NULL,
	`projected_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`prospect_id`) REFERENCES `profile_prospects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`configuration_id`) REFERENCES `typed_configurations`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "contact_eligibility_snapshot_digest_check" CHECK(length("contact_eligibility_snapshots"."snapshot_digest") = 64 and "contact_eligibility_snapshots"."snapshot_digest" not glob '*[^0-9a-f]*' and length("contact_eligibility_snapshots"."configuration_digest") = 64 and "contact_eligibility_snapshots"."configuration_digest" not glob '*[^0-9a-f]*'),
	CONSTRAINT "contact_eligibility_snapshot_revision_check" CHECK("contact_eligibility_snapshots"."configuration_revision" > 0 and "contact_eligibility_snapshots"."prospect_revision" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `contact_eligibility_snapshot_digest_unique` ON `contact_eligibility_snapshots` (`workspace_id`,`snapshot_digest`);--> statement-breakpoint
CREATE INDEX `contact_eligibility_snapshot_current_idx` ON `contact_eligibility_snapshots` (`workspace_id`,`prospect_id`,`contact_id`,`projected_at`);--> statement-breakpoint
CREATE TABLE `contact_evidence_assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`reservation_id` text,
	`grant_id` text NOT NULL,
	`prospect_id` text NOT NULL,
	`contact_id` text NOT NULL,
	`role` text NOT NULL,
	`configuration_id` text NOT NULL,
	`configuration_digest` text NOT NULL,
	`provider_id` text NOT NULL,
	`provider_version` text NOT NULL,
	`catalog_ref` text NOT NULL,
	`quote_revision` integer NOT NULL,
	`assignment_digest` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reservation_id`) REFERENCES `enrichment_reservations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`grant_id`) REFERENCES `enrichment_grants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`prospect_id`) REFERENCES `profile_prospects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`configuration_id`) REFERENCES `typed_configurations`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "contact_evidence_assignment_configuration_digest_check" CHECK(length("contact_evidence_assignments"."configuration_digest") = 64 and "contact_evidence_assignments"."configuration_digest" not glob '*[^0-9a-f]*'),
	CONSTRAINT "contact_evidence_assignment_digest_check" CHECK(length("contact_evidence_assignments"."assignment_digest") = 64 and "contact_evidence_assignments"."assignment_digest" not glob '*[^0-9a-f]*')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `contact_evidence_assignment_digest_unique` ON `contact_evidence_assignments` (`workspace_id`,`assignment_digest`);--> statement-breakpoint
CREATE INDEX `contact_evidence_assignment_prospect_idx` ON `contact_evidence_assignments` (`workspace_id`,`prospect_id`,`role`);--> statement-breakpoint
CREATE TABLE `contact_point_observations` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`assignment_id` text NOT NULL,
	`contact_id` text NOT NULL,
	`configuration_id` text NOT NULL,
	`configuration_digest` text NOT NULL,
	`kind` text NOT NULL,
	`contact_point_digest` text NOT NULL,
	`contact_point_reference` text NOT NULL,
	`verification_class` text NOT NULL,
	`confidence_basis_points` integer NOT NULL,
	`method` text NOT NULL,
	`source_reference` text NOT NULL,
	`excerpt_digest` text NOT NULL,
	`object_reference` text NOT NULL,
	`content_hash` text NOT NULL,
	`retrieved_at` integer NOT NULL,
	`observed_at` integer NOT NULL,
	`verified_at` integer,
	`provider_id` text,
	`provider_version` text,
	`catalog_ref` text,
	`verifier_id` text,
	`verifier_version` text,
	`verdict_reference` text,
	`verdict_digest` text,
	`parent_observation_id` text,
	`observation_digest` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`assignment_id`) REFERENCES `contact_evidence_assignments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`configuration_id`) REFERENCES `typed_configurations`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "contact_point_observation_confidence_check" CHECK("contact_point_observations"."confidence_basis_points" >= 0 and "contact_point_observations"."confidence_basis_points" <= 10000),
	CONSTRAINT "contact_point_observation_time_check" CHECK("contact_point_observations"."retrieved_at" <= "contact_point_observations"."observed_at" and ("contact_point_observations"."verified_at" is null or ("contact_point_observations"."verified_at" >= "contact_point_observations"."retrieved_at" and "contact_point_observations"."verified_at" <= "contact_point_observations"."observed_at"))),
	CONSTRAINT "contact_point_observation_digest_check" CHECK(length("contact_point_observations"."contact_point_digest") = 64 and "contact_point_observations"."contact_point_digest" not glob '*[^0-9a-f]*' and length("contact_point_observations"."excerpt_digest") = 64 and "contact_point_observations"."excerpt_digest" not glob '*[^0-9a-f]*' and length("contact_point_observations"."content_hash") = 64 and "contact_point_observations"."content_hash" not glob '*[^0-9a-f]*' and length("contact_point_observations"."observation_digest") = 64 and "contact_point_observations"."observation_digest" not glob '*[^0-9a-f]*' and ("contact_point_observations"."verdict_digest" is null or (length("contact_point_observations"."verdict_digest") = 64 and "contact_point_observations"."verdict_digest" not glob '*[^0-9a-f]*')))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `contact_point_observation_digest_unique` ON `contact_point_observations` (`workspace_id`,`observation_digest`);--> statement-breakpoint
CREATE INDEX `contact_point_observation_contact_idx` ON `contact_point_observations` (`workspace_id`,`contact_id`,`observed_at`);--> statement-breakpoint
CREATE TABLE `enrichment_budget_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`authority_type` text DEFAULT 'enrichment' NOT NULL,
	`scope` text NOT NULL,
	`entity_id` text NOT NULL,
	`currency` text NOT NULL,
	`actual_units` integer DEFAULT 0 NOT NULL,
	`reserved_units` integer DEFAULT 0 NOT NULL,
	`max_units` integer NOT NULL,
	`actual_cost_minor` integer DEFAULT 0 NOT NULL,
	`reserved_cost_minor` integer DEFAULT 0 NOT NULL,
	`max_cost_minor` integer NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "enrichment_budget_account_currency_check" CHECK(length("enrichment_budget_accounts"."currency") = 3 and "enrichment_budget_accounts"."currency" = upper("enrichment_budget_accounts"."currency") and "enrichment_budget_accounts"."currency" not glob '*[^A-Z]*'),
	CONSTRAINT "enrichment_budget_account_bounds_check" CHECK("enrichment_budget_accounts"."actual_units" >= 0 and "enrichment_budget_accounts"."reserved_units" >= 0 and "enrichment_budget_accounts"."max_units" >= 0 and "enrichment_budget_accounts"."actual_units" + "enrichment_budget_accounts"."reserved_units" <= "enrichment_budget_accounts"."max_units" and "enrichment_budget_accounts"."actual_cost_minor" >= 0 and "enrichment_budget_accounts"."reserved_cost_minor" >= 0 and "enrichment_budget_accounts"."max_cost_minor" >= 0 and "enrichment_budget_accounts"."actual_cost_minor" + "enrichment_budget_accounts"."reserved_cost_minor" <= "enrichment_budget_accounts"."max_cost_minor" and "enrichment_budget_accounts"."revision" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `enrichment_budget_account_scope_unique` ON `enrichment_budget_accounts` (`workspace_id`,`scope`,`entity_id`,`currency`);--> statement-breakpoint
CREATE TABLE `enrichment_grant_issuance_events` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`grant_id` text NOT NULL,
	`actor_subject` text NOT NULL,
	`action` text NOT NULL,
	`operation_key` text NOT NULL,
	`request_digest` text NOT NULL,
	`event_digest` text NOT NULL,
	`bounded_reason` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`grant_id`) REFERENCES `enrichment_grants`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "enrichment_grant_issuance_digest_check" CHECK(length("enrichment_grant_issuance_events"."request_digest") = 64 and "enrichment_grant_issuance_events"."request_digest" not glob '*[^0-9a-f]*' and length("enrichment_grant_issuance_events"."event_digest") = 64 and "enrichment_grant_issuance_events"."event_digest" not glob '*[^0-9a-f]*')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `enrichment_grant_issuance_grant_unique` ON `enrichment_grant_issuance_events` (`grant_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `enrichment_grant_issuance_digest_unique` ON `enrichment_grant_issuance_events` (`workspace_id`,`event_digest`);--> statement-breakpoint
CREATE TABLE `enrichment_grant_prospects` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`grant_id` text NOT NULL,
	`prospect_id` text NOT NULL,
	`ordinal` integer NOT NULL,
	`prospect_revision` integer NOT NULL,
	`configuration_id` text NOT NULL,
	`configuration_digest` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`grant_id`) REFERENCES `enrichment_grants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`prospect_id`) REFERENCES `profile_prospects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`configuration_id`) REFERENCES `typed_configurations`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "enrichment_grant_prospect_revision_check" CHECK("enrichment_grant_prospects"."ordinal" >= 0 and "enrichment_grant_prospects"."prospect_revision" > 0),
	CONSTRAINT "enrichment_grant_prospect_digest_check" CHECK(length("enrichment_grant_prospects"."configuration_digest") = 64 and "enrichment_grant_prospects"."configuration_digest" not glob '*[^0-9a-f]*')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `enrichment_grant_prospect_unique` ON `enrichment_grant_prospects` (`grant_id`,`prospect_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `enrichment_grant_prospect_ordinal_unique` ON `enrichment_grant_prospects` (`grant_id`,`ordinal`);--> statement-breakpoint
CREATE INDEX `enrichment_grant_prospect_lookup_idx` ON `enrichment_grant_prospects` (`workspace_id`,`prospect_id`);--> statement-breakpoint
CREATE TABLE `enrichment_grants` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`quote_id` text NOT NULL,
	`configuration_id` text NOT NULL,
	`configuration_digest` text NOT NULL,
	`configuration_revision` integer NOT NULL,
	`source_revision` integer NOT NULL,
	`provider_id` text NOT NULL,
	`provider_version` text NOT NULL,
	`catalog_ref` text NOT NULL,
	`quote_revision` integer NOT NULL,
	`quote_unit_cost_minor` integer NOT NULL,
	`quote_expires_at` integer NOT NULL,
	`operation` text NOT NULL,
	`operation_key` text NOT NULL,
	`max_units` integer NOT NULL,
	`max_cost_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`expires_at` integer NOT NULL,
	`owner_subject` text NOT NULL,
	`nonce` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`request_digest` text NOT NULL,
	`tuple_digest` text NOT NULL,
	`status` text DEFAULT 'issued' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`quote_id`) REFERENCES `provider_quotes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`configuration_id`) REFERENCES `typed_configurations`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "enrichment_grant_configuration_revision_check" CHECK("enrichment_grants"."configuration_revision" > 0 and "enrichment_grants"."source_revision" > 0),
	CONSTRAINT "enrichment_grant_configuration_digest_check" CHECK(length("enrichment_grants"."configuration_digest") = 64 and "enrichment_grants"."configuration_digest" not glob '*[^0-9a-f]*'),
	CONSTRAINT "enrichment_grant_operation_key_check" CHECK(length("enrichment_grants"."operation_key") = 67 and substr("enrichment_grants"."operation_key", 1, 3) = 'op_' and substr("enrichment_grants"."operation_key", 4) not glob '*[^0-9a-f]*'),
	CONSTRAINT "enrichment_grant_bounds_check" CHECK("enrichment_grants"."max_units" > 0 and "enrichment_grants"."max_units" <= 1000 and "enrichment_grants"."max_cost_minor" >= 0 and "enrichment_grants"."quote_unit_cost_minor" >= 0 and "enrichment_grants"."max_cost_minor" >= "enrichment_grants"."quote_unit_cost_minor" * "enrichment_grants"."max_units"),
	CONSTRAINT "enrichment_grant_currency_check" CHECK(length("enrichment_grants"."currency") = 3 and "enrichment_grants"."currency" = upper("enrichment_grants"."currency") and "enrichment_grants"."currency" not glob '*[^A-Z]*'),
	CONSTRAINT "enrichment_grant_digest_check" CHECK(length("enrichment_grants"."request_digest") = 64 and "enrichment_grants"."request_digest" not glob '*[^0-9a-f]*' and length("enrichment_grants"."tuple_digest") = 64 and "enrichment_grants"."tuple_digest" not glob '*[^0-9a-f]*'),
	CONSTRAINT "enrichment_grant_expiry_check" CHECK("enrichment_grants"."expires_at" > "enrichment_grants"."created_at" and "enrichment_grants"."expires_at" <= "enrichment_grants"."quote_expires_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `enrichment_grant_idempotency_unique` ON `enrichment_grants` (`workspace_id`,`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `enrichment_grant_operation_unique` ON `enrichment_grants` (`workspace_id`,`operation_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `enrichment_grant_tuple_digest_unique` ON `enrichment_grants` (`workspace_id`,`tuple_digest`);--> statement-breakpoint
CREATE INDEX `enrichment_grant_configuration_idx` ON `enrichment_grants` (`workspace_id`,`configuration_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `enrichment_reservation_budget_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`reservation_id` text NOT NULL,
	`account_id` text NOT NULL,
	`reserved_units` integer NOT NULL,
	`reserved_cost_minor` integer NOT NULL,
	`account_expected_revision` integer NOT NULL,
	`entry_digest` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reservation_id`) REFERENCES `enrichment_reservations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`) REFERENCES `enrichment_budget_accounts`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "enrichment_reservation_budget_entry_bounds_check" CHECK("enrichment_reservation_budget_entries"."reserved_units" > 0 and "enrichment_reservation_budget_entries"."reserved_cost_minor" >= 0 and "enrichment_reservation_budget_entries"."account_expected_revision" > 0),
	CONSTRAINT "enrichment_reservation_budget_entry_digest_check" CHECK(length("enrichment_reservation_budget_entries"."entry_digest") = 64 and "enrichment_reservation_budget_entries"."entry_digest" not glob '*[^0-9a-f]*')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `enrichment_reservation_budget_account_unique` ON `enrichment_reservation_budget_entries` (`reservation_id`,`account_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `enrichment_reservation_budget_entry_digest_unique` ON `enrichment_reservation_budget_entries` (`workspace_id`,`entry_digest`);--> statement-breakpoint
CREATE TABLE `enrichment_reservation_events` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`reservation_id` text NOT NULL,
	`durable_revision` integer NOT NULL,
	`state` text NOT NULL,
	`terminal_reason` text,
	`settlement_digest` text,
	`documented_units` integer,
	`documented_cost_minor` integer,
	`observation_ids_json` text DEFAULT '[]' NOT NULL,
	`acknowledgement_digest` text NOT NULL,
	`claimed_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reservation_id`) REFERENCES `enrichment_reservations`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "enrichment_reservation_event_revision_check" CHECK("enrichment_reservation_events"."durable_revision" > 0),
	CONSTRAINT "enrichment_reservation_event_digest_check" CHECK(length("enrichment_reservation_events"."acknowledgement_digest") = 64 and "enrichment_reservation_events"."acknowledgement_digest" not glob '*[^0-9a-f]*' and ("enrichment_reservation_events"."settlement_digest" is null or (length("enrichment_reservation_events"."settlement_digest") = 64 and "enrichment_reservation_events"."settlement_digest" not glob '*[^0-9a-f]*')))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `enrichment_reservation_event_revision_unique` ON `enrichment_reservation_events` (`reservation_id`,`durable_revision`);--> statement-breakpoint
CREATE UNIQUE INDEX `enrichment_reservation_event_ack_unique` ON `enrichment_reservation_events` (`workspace_id`,`acknowledgement_digest`);--> statement-breakpoint
CREATE INDEX `enrichment_reservation_event_state_idx` ON `enrichment_reservation_events` (`workspace_id`,`state`,`created_at`);--> statement-breakpoint
CREATE TABLE `enrichment_reservations` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`grant_id` text NOT NULL,
	`operation_key` text NOT NULL,
	`assignment_json` text NOT NULL,
	`assignment_digest` text NOT NULL,
	`reserved_units` integer NOT NULL,
	`reserved_cost_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`grant_id`) REFERENCES `enrichment_grants`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "enrichment_reservation_assignment_digest_check" CHECK(length("enrichment_reservations"."assignment_digest") = 64 and "enrichment_reservations"."assignment_digest" not glob '*[^0-9a-f]*'),
	CONSTRAINT "enrichment_reservation_bounds_check" CHECK("enrichment_reservations"."reserved_units" > 0 and "enrichment_reservations"."reserved_cost_minor" >= 0 and "enrichment_reservations"."expires_at" > "enrichment_reservations"."created_at"),
	CONSTRAINT "enrichment_reservation_currency_check" CHECK(length("enrichment_reservations"."currency") = 3 and "enrichment_reservations"."currency" = upper("enrichment_reservations"."currency") and "enrichment_reservations"."currency" not glob '*[^A-Z]*')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `enrichment_reservation_grant_operation_unique` ON `enrichment_reservations` (`workspace_id`,`grant_id`,`operation_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `enrichment_reservation_assignment_digest_unique` ON `enrichment_reservations` (`workspace_id`,`assignment_digest`);--> statement-breakpoint
CREATE TABLE `identity_decisions` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`suggestion_id` text NOT NULL,
	`owner_subject` text NOT NULL,
	`subject_kind` text NOT NULL,
	`kind` text NOT NULL,
	`decision_json` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`operation_digest` text NOT NULL,
	`result_digest` text NOT NULL,
	`retained_source_lineage_ids_json` text NOT NULL,
	`retained_identity_lineage_ids_json` text NOT NULL,
	`retained_aliases_json` text NOT NULL,
	`retained_suppression_subject_refs_json` text NOT NULL,
	`repointed_association_ids_json` text NOT NULL,
	`invalidations_json` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`suggestion_id`) REFERENCES `identity_suggestions`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "identity_decision_digest_check" CHECK(length("identity_decisions"."operation_digest") = 64 and "identity_decisions"."operation_digest" not glob '*[^0-9a-f]*' and length("identity_decisions"."result_digest") = 64 and "identity_decisions"."result_digest" not glob '*[^0-9a-f]*')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `identity_decision_suggestion_unique` ON `identity_decisions` (`suggestion_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `identity_decision_idempotency_unique` ON `identity_decisions` (`workspace_id`,`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `identity_decision_operation_unique` ON `identity_decisions` (`workspace_id`,`operation_digest`);--> statement-breakpoint
CREATE TABLE `identity_lineage` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`decision_id` text NOT NULL,
	`subject_kind` text NOT NULL,
	`source_subject_id` text NOT NULL,
	`target_subject_id` text NOT NULL,
	`relationship` text NOT NULL,
	`retained_source_lineage_ids_json` text NOT NULL,
	`retained_identity_lineage_ids_json` text NOT NULL,
	`retained_aliases_json` text NOT NULL,
	`retained_suppression_subject_refs_json` text NOT NULL,
	`lineage_digest` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`decision_id`) REFERENCES `identity_decisions`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "identity_lineage_digest_check" CHECK(length("identity_lineage"."lineage_digest") = 64 and "identity_lineage"."lineage_digest" not glob '*[^0-9a-f]*')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `identity_lineage_digest_unique` ON `identity_lineage` (`workspace_id`,`lineage_digest`);--> statement-breakpoint
CREATE INDEX `identity_lineage_source_idx` ON `identity_lineage` (`workspace_id`,`source_subject_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `identity_lineage_target_idx` ON `identity_lineage` (`workspace_id`,`target_subject_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `identity_suggestion_candidates` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`suggestion_id` text NOT NULL,
	`subject_id` text NOT NULL,
	`candidate_revision` integer NOT NULL,
	`ordinal` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`suggestion_id`) REFERENCES `identity_suggestions`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "identity_suggestion_candidate_revision_check" CHECK("identity_suggestion_candidates"."candidate_revision" > 0 and "identity_suggestion_candidates"."ordinal" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `identity_suggestion_candidate_unique` ON `identity_suggestion_candidates` (`suggestion_id`,`subject_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `identity_suggestion_candidate_ordinal_unique` ON `identity_suggestion_candidates` (`suggestion_id`,`ordinal`);--> statement-breakpoint
CREATE TABLE `identity_suggestion_impacts` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`suggestion_id` text NOT NULL,
	`association_id` text NOT NULL,
	`scope` text NOT NULL,
	`relevance_id` text NOT NULL,
	`subject_id` text NOT NULL,
	`impact_digest` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`suggestion_id`) REFERENCES `identity_suggestions`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "identity_suggestion_impact_digest_check" CHECK(length("identity_suggestion_impacts"."impact_digest") = 64 and "identity_suggestion_impacts"."impact_digest" not glob '*[^0-9a-f]*')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `identity_suggestion_impact_association_unique` ON `identity_suggestion_impacts` (`suggestion_id`,`association_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `identity_suggestion_impact_digest_unique` ON `identity_suggestion_impacts` (`workspace_id`,`impact_digest`);--> statement-breakpoint
CREATE TABLE `identity_suggestions` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`owner_subject` text NOT NULL,
	`subject_kind` text NOT NULL,
	`kind` text NOT NULL,
	`revision` integer NOT NULL,
	`candidate_revisions_json` text NOT NULL,
	`source_lineage_ids_json` text NOT NULL,
	`retained_identity_lineage_ids_json` text NOT NULL,
	`retained_aliases_json` text NOT NULL,
	`retained_suppression_subject_refs_json` text NOT NULL,
	`proposed_partition_json` text,
	`suggestion_digest` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "identity_suggestion_revision_check" CHECK("identity_suggestions"."revision" > 0),
	CONSTRAINT "identity_suggestion_digest_check" CHECK(length("identity_suggestions"."suggestion_digest") = 64 and "identity_suggestions"."suggestion_digest" not glob '*[^0-9a-f]*')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `identity_suggestion_digest_unique` ON `identity_suggestions` (`workspace_id`,`suggestion_digest`);--> statement-breakpoint
CREATE INDEX `identity_suggestion_owner_idx` ON `identity_suggestions` (`workspace_id`,`owner_subject`,`created_at`);--> statement-breakpoint
CREATE TABLE `provider_quotes` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`provider_version` text NOT NULL,
	`catalog_ref` text NOT NULL,
	`revision` integer NOT NULL,
	`operation` text NOT NULL,
	`currency` text NOT NULL,
	`unit_cost_minor` integer NOT NULL,
	`quote_digest` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "provider_quote_revision_check" CHECK("provider_quotes"."revision" > 0),
	CONSTRAINT "provider_quote_currency_check" CHECK(length("provider_quotes"."currency") = 3 and "provider_quotes"."currency" = upper("provider_quotes"."currency") and "provider_quotes"."currency" not glob '*[^A-Z]*'),
	CONSTRAINT "provider_quote_cost_check" CHECK("provider_quotes"."unit_cost_minor" >= 0),
	CONSTRAINT "provider_quote_digest_check" CHECK(length("provider_quotes"."quote_digest") = 64 and "provider_quotes"."quote_digest" not glob '*[^0-9a-f]*'),
	CONSTRAINT "provider_quote_expiry_check" CHECK("provider_quotes"."expires_at" > "provider_quotes"."created_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `provider_quote_revision_unique` ON `provider_quotes` (`workspace_id`,`provider_id`,`provider_version`,`catalog_ref`,`revision`,`operation`);--> statement-breakpoint
CREATE UNIQUE INDEX `provider_quote_digest_unique` ON `provider_quotes` (`workspace_id`,`quote_digest`);--> statement-breakpoint
CREATE INDEX `provider_quote_lookup_idx` ON `provider_quotes` (`workspace_id`,`operation`,`expires_at`);--> statement-breakpoint
CREATE TABLE `runner_budget_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`scope` text NOT NULL,
	`owner_subject` text NOT NULL,
	`provider_id` text NOT NULL,
	`scope_id` text NOT NULL,
	`period` text,
	`attempt_number` integer,
	`operation_key` text,
	`currency` text NOT NULL,
	`actual_cost_minor` integer DEFAULT 0 NOT NULL,
	`reserved_cost_minor` integer DEFAULT 0 NOT NULL,
	`max_cost_minor` integer NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "runner_budget_account_shape_check" CHECK(("runner_budget_accounts"."scope" = 'runner_monthly' and "runner_budget_accounts"."period" glob '[0-9][0-9][0-9][0-9]-[0-1][0-9]' and "runner_budget_accounts"."attempt_number" is null and "runner_budget_accounts"."operation_key" is null) or ("runner_budget_accounts"."scope" = 'runner_per_run' and "runner_budget_accounts"."period" is null and "runner_budget_accounts"."attempt_number" >= 0 and "runner_budget_accounts"."operation_key" is not null)),
	CONSTRAINT "runner_budget_account_currency_check" CHECK(length("runner_budget_accounts"."currency") = 3 and "runner_budget_accounts"."currency" = upper("runner_budget_accounts"."currency") and "runner_budget_accounts"."currency" not glob '*[^A-Z]*'),
	CONSTRAINT "runner_budget_account_bounds_check" CHECK("runner_budget_accounts"."actual_cost_minor" >= 0 and "runner_budget_accounts"."reserved_cost_minor" >= 0 and "runner_budget_accounts"."max_cost_minor" >= 0 and "runner_budget_accounts"."actual_cost_minor" + "runner_budget_accounts"."reserved_cost_minor" <= "runner_budget_accounts"."max_cost_minor" and "runner_budget_accounts"."revision" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `runner_budget_account_identity_unique` ON `runner_budget_accounts` (`workspace_id`,`scope`,`owner_subject`,`provider_id`,`scope_id`,`period`,`attempt_number`,`operation_key`,`currency`);--> statement-breakpoint
CREATE INDEX `runner_budget_account_month_idx` ON `runner_budget_accounts` (`workspace_id`,`owner_subject`,`provider_id`,`scope_id`,`period`);--> statement-breakpoint
CREATE TABLE `runner_spend_grants` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`owner_subject` text NOT NULL,
	`provider_id` text NOT NULL,
	`model` text NOT NULL,
	`catalog_ref` text NOT NULL,
	`run_type` text NOT NULL,
	`scope_id` text NOT NULL,
	`per_run_cost_minor` integer NOT NULL,
	`monthly_cost_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`max_retries` integer NOT NULL,
	`grant_digest` text NOT NULL,
	`nonce` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "runner_spend_grant_bounds_check" CHECK("runner_spend_grants"."per_run_cost_minor" >= 0 and "runner_spend_grants"."monthly_cost_minor" >= "runner_spend_grants"."per_run_cost_minor" and "runner_spend_grants"."max_retries" >= 0 and "runner_spend_grants"."max_retries" <= 10 and "runner_spend_grants"."expires_at" > "runner_spend_grants"."created_at"),
	CONSTRAINT "runner_spend_grant_currency_check" CHECK(length("runner_spend_grants"."currency") = 3 and "runner_spend_grants"."currency" = upper("runner_spend_grants"."currency") and "runner_spend_grants"."currency" not glob '*[^A-Z]*'),
	CONSTRAINT "runner_spend_grant_digest_check" CHECK(length("runner_spend_grants"."grant_digest") = 64 and "runner_spend_grants"."grant_digest" not glob '*[^0-9a-f]*')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `runner_spend_grant_digest_unique` ON `runner_spend_grants` (`workspace_id`,`grant_digest`);--> statement-breakpoint
CREATE INDEX `runner_spend_grant_owner_idx` ON `runner_spend_grants` (`workspace_id`,`owner_subject`,`expires_at`);--> statement-breakpoint
CREATE TABLE `runner_spend_reservation_events` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`reservation_id` text NOT NULL,
	`durable_revision` integer NOT NULL,
	`state` text NOT NULL,
	`terminal_reason` text,
	`settlement_digest` text,
	`documented_cost_minor` integer,
	`acknowledgement_digest` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reservation_id`) REFERENCES `runner_spend_reservations`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "runner_spend_reservation_event_revision_check" CHECK("runner_spend_reservation_events"."durable_revision" > 0),
	CONSTRAINT "runner_spend_reservation_event_digest_check" CHECK(length("runner_spend_reservation_events"."acknowledgement_digest") = 64 and "runner_spend_reservation_events"."acknowledgement_digest" not glob '*[^0-9a-f]*' and ("runner_spend_reservation_events"."settlement_digest" is null or (length("runner_spend_reservation_events"."settlement_digest") = 64 and "runner_spend_reservation_events"."settlement_digest" not glob '*[^0-9a-f]*')))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `runner_spend_reservation_event_revision_unique` ON `runner_spend_reservation_events` (`reservation_id`,`durable_revision`);--> statement-breakpoint
CREATE UNIQUE INDEX `runner_spend_reservation_event_ack_unique` ON `runner_spend_reservation_events` (`workspace_id`,`acknowledgement_digest`);--> statement-breakpoint
CREATE TABLE `runner_spend_reservations` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`grant_id` text NOT NULL,
	`per_run_account_id` text NOT NULL,
	`monthly_account_id` text NOT NULL,
	`operation_key` text NOT NULL,
	`attempt_number` integer NOT NULL,
	`period` text NOT NULL,
	`previous_outcome` text NOT NULL,
	`previous_operation_keys_json` text NOT NULL,
	`per_run_account_expected_revision` integer NOT NULL,
	`monthly_account_expected_revision` integer NOT NULL,
	`provider_id` text NOT NULL,
	`model` text NOT NULL,
	`catalog_ref` text NOT NULL,
	`scope_id` text NOT NULL,
	`run_type` text NOT NULL,
	`currency` text NOT NULL,
	`reserved_cost_minor` integer NOT NULL,
	`max_retries` integer NOT NULL,
	`attempt_digest` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`grant_id`) REFERENCES `runner_spend_grants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`per_run_account_id`) REFERENCES `runner_budget_accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`monthly_account_id`) REFERENCES `runner_budget_accounts`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "runner_spend_reservation_bounds_check" CHECK("runner_spend_reservations"."attempt_number" >= 0 and "runner_spend_reservations"."reserved_cost_minor" >= 0 and "runner_spend_reservations"."max_retries" >= "runner_spend_reservations"."attempt_number" and "runner_spend_reservations"."per_run_account_expected_revision" > 0 and "runner_spend_reservations"."monthly_account_expected_revision" > 0),
	CONSTRAINT "runner_spend_reservation_currency_check" CHECK(length("runner_spend_reservations"."currency") = 3 and "runner_spend_reservations"."currency" = upper("runner_spend_reservations"."currency") and "runner_spend_reservations"."currency" not glob '*[^A-Z]*'),
	CONSTRAINT "runner_spend_reservation_digest_check" CHECK(length("runner_spend_reservations"."attempt_digest") = 64 and "runner_spend_reservations"."attempt_digest" not glob '*[^0-9a-f]*')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `runner_spend_reservation_attempt_unique` ON `runner_spend_reservations` (`workspace_id`,`grant_id`,`attempt_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `runner_spend_reservation_operation_unique` ON `runner_spend_reservations` (`workspace_id`,`operation_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `runner_spend_reservation_attempt_digest_unique` ON `runner_spend_reservations` (`workspace_id`,`grant_id`,`attempt_digest`);
--> statement-breakpoint
CREATE TRIGGER provider_quotes_scope_guard BEFORE INSERT ON provider_quotes BEGIN
  SELECT CASE WHEN NEW.operation <> 'business_contact_lookup/v1' OR NOT EXISTS (SELECT 1 FROM workspaces w WHERE w.id = NEW.workspace_id) THEN RAISE(ABORT, 'invalid provider quote scope') END;
END;
--> statement-breakpoint
CREATE TRIGGER enrichment_grants_scope_guard BEFORE INSERT ON enrichment_grants BEGIN
  SELECT CASE WHEN NEW.status <> 'issued' OR NEW.operation <> 'business_contact_lookup/v1' OR NOT EXISTS (
    SELECT 1 FROM workspaces w
    JOIN provider_quotes q ON q.id = NEW.quote_id AND q.workspace_id = w.id
    JOIN typed_configurations c ON c.id = NEW.configuration_id AND c.workspace_id = w.id
    WHERE w.id = NEW.workspace_id AND w.owner_subject = NEW.owner_subject
      AND NEW.source_revision = w.revision
      AND c.digest = NEW.configuration_digest AND c.revision = NEW.configuration_revision AND c.active = 1
      AND q.provider_id = NEW.provider_id AND q.provider_version = NEW.provider_version
      AND q.catalog_ref = NEW.catalog_ref AND q.revision = NEW.quote_revision
      AND q.unit_cost_minor = NEW.quote_unit_cost_minor AND q.expires_at = NEW.quote_expires_at
      AND q.currency = NEW.currency AND q.operation = NEW.operation
  ) THEN RAISE(ABORT, 'invalid enrichment grant authority') END;
END;
--> statement-breakpoint
CREATE TRIGGER enrichment_grant_prospects_scope_guard BEFORE INSERT ON enrichment_grant_prospects BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM enrichment_grants g
    JOIN profile_prospects p ON p.id = NEW.prospect_id AND p.workspace_id = g.workspace_id
    JOIN typed_configurations c ON c.id = NEW.configuration_id AND c.workspace_id = g.workspace_id
    JOIN prospecting_candidates pc ON pc.id = p.candidate_id AND pc.workspace_id = p.workspace_id
      AND pc.profile_id = p.profile_id AND pc.configuration_id = NEW.configuration_id AND pc.status = 'qualified'
    JOIN qualification_assessments qa ON qa.id = p.assessment_id AND qa.workspace_id = p.workspace_id
      AND qa.candidate_id = pc.id AND qa.configuration_id = NEW.configuration_id
      AND qa.configuration_digest = NEW.configuration_digest AND qa.outcome = 'Passed'
    WHERE g.id = NEW.grant_id AND g.workspace_id = NEW.workspace_id AND p.state = 'approved' AND p.active = 1
      AND p.revision = NEW.prospect_revision AND g.configuration_id = NEW.configuration_id
      AND g.configuration_digest = NEW.configuration_digest AND c.digest = NEW.configuration_digest
      AND c.revision = g.configuration_revision AND c.active = 1
  ) THEN RAISE(ABORT, 'invalid enrichment prospect authority') END;
END;
--> statement-breakpoint
CREATE TRIGGER enrichment_issuance_scope_guard BEFORE INSERT ON enrichment_grant_issuance_events BEGIN
  SELECT CASE WHEN NEW.action <> 'enrichment.grant.issued' OR NEW.bounded_reason <> 'issued' OR NOT EXISTS (
    SELECT 1 FROM enrichment_grants g WHERE g.id = NEW.grant_id AND g.workspace_id = NEW.workspace_id
      AND g.owner_subject = NEW.actor_subject AND g.operation_key = NEW.operation_key AND g.request_digest = NEW.request_digest
  ) THEN RAISE(ABORT, 'invalid enrichment issuance event') END;
END;
--> statement-breakpoint
CREATE TRIGGER enrichment_budget_insert_guard BEFORE INSERT ON enrichment_budget_accounts BEGIN
  SELECT CASE WHEN NEW.authority_type <> 'enrichment' OR NEW.scope NOT IN ('grant','profile','workspace','provider')
    OR NEW.actual_units <> 0 OR NEW.reserved_units <> 0 OR NEW.actual_cost_minor <> 0 OR NEW.reserved_cost_minor <> 0
    OR NEW.revision <> 1
    THEN RAISE(ABORT, 'invalid enrichment budget account') END;
END;
--> statement-breakpoint
CREATE TRIGGER enrichment_budget_update_guard BEFORE UPDATE ON enrichment_budget_accounts BEGIN
  SELECT CASE WHEN NEW.id <> OLD.id OR NEW.workspace_id <> OLD.workspace_id OR NEW.authority_type <> OLD.authority_type
    OR NEW.scope <> OLD.scope OR NEW.entity_id <> OLD.entity_id OR NEW.currency <> OLD.currency
    OR NEW.max_units <> OLD.max_units OR NEW.max_cost_minor <> OLD.max_cost_minor OR NEW.created_at <> OLD.created_at
    OR NEW.revision <> OLD.revision + 1 OR NEW.reserved_units < 0 OR NEW.reserved_cost_minor < 0
    OR NOT (
      EXISTS (
        SELECT 1 FROM enrichment_reservation_budget_entries be
        WHERE be.account_id = OLD.id AND be.workspace_id = OLD.workspace_id
          AND be.account_expected_revision = OLD.revision AND be.created_at = NEW.updated_at
          AND NEW.actual_units = OLD.actual_units AND NEW.actual_cost_minor = OLD.actual_cost_minor
          AND NEW.reserved_units = OLD.reserved_units + be.reserved_units
          AND NEW.reserved_cost_minor = OLD.reserved_cost_minor + be.reserved_cost_minor
          AND NEW.revision = 1
            + (SELECT count(*) FROM enrichment_reservation_budget_entries all_be
               WHERE all_be.account_id = OLD.id AND all_be.workspace_id = OLD.workspace_id)
            + (SELECT count(*) FROM enrichment_reservation_budget_entries terminal_be
               JOIN enrichment_reservation_events terminal_e ON terminal_e.reservation_id = terminal_be.reservation_id
               WHERE terminal_be.account_id = OLD.id AND terminal_be.workspace_id = OLD.workspace_id
                 AND terminal_e.state IN ('settled','released'))
      )
      OR EXISTS (
        SELECT 1 FROM enrichment_reservation_budget_entries be
        JOIN enrichment_reservation_events e ON e.reservation_id = be.reservation_id
        WHERE be.account_id = OLD.id AND be.workspace_id = OLD.workspace_id
          AND e.created_at = NEW.updated_at
          AND e.durable_revision = (SELECT max(e2.durable_revision) FROM enrichment_reservation_events e2 WHERE e2.reservation_id = be.reservation_id)
          AND e.state IN ('settled','released') AND e.documented_units IS NOT NULL AND e.documented_cost_minor IS NOT NULL
          AND OLD.reserved_units = be.reserved_units + coalesce((
            SELECT sum(outstanding_be.reserved_units) FROM enrichment_reservation_budget_entries outstanding_be
            WHERE outstanding_be.account_id = OLD.id AND outstanding_be.workspace_id = OLD.workspace_id
              AND outstanding_be.reservation_id <> be.reservation_id
              AND NOT EXISTS (
                SELECT 1 FROM enrichment_reservation_events outstanding_terminal
                WHERE outstanding_terminal.reservation_id = outstanding_be.reservation_id
                  AND outstanding_terminal.state IN ('settled','released')
              )
          ), 0)
          AND OLD.reserved_cost_minor = be.reserved_cost_minor + coalesce((
            SELECT sum(outstanding_be.reserved_cost_minor) FROM enrichment_reservation_budget_entries outstanding_be
            WHERE outstanding_be.account_id = OLD.id AND outstanding_be.workspace_id = OLD.workspace_id
              AND outstanding_be.reservation_id <> be.reservation_id
              AND NOT EXISTS (
                SELECT 1 FROM enrichment_reservation_events outstanding_terminal
                WHERE outstanding_terminal.reservation_id = outstanding_be.reservation_id
                  AND outstanding_terminal.state IN ('settled','released')
              )
          ), 0)
          AND NEW.reserved_units = OLD.reserved_units - be.reserved_units
          AND NEW.reserved_cost_minor = OLD.reserved_cost_minor - be.reserved_cost_minor
          AND NEW.actual_units = OLD.actual_units + e.documented_units
          AND NEW.actual_cost_minor = OLD.actual_cost_minor + e.documented_cost_minor
          AND NEW.revision = 1
            + (SELECT count(*) FROM enrichment_reservation_budget_entries all_be
               WHERE all_be.account_id = OLD.id AND all_be.workspace_id = OLD.workspace_id)
            + (SELECT count(*) FROM enrichment_reservation_budget_entries terminal_be
               JOIN enrichment_reservation_events terminal_e ON terminal_e.reservation_id = terminal_be.reservation_id
               WHERE terminal_be.account_id = OLD.id AND terminal_be.workspace_id = OLD.workspace_id
                 AND terminal_e.state IN ('settled','released'))
      )
    )
    THEN RAISE(ABORT, 'invalid enrichment budget mutation') END;
END;
--> statement-breakpoint
CREATE TRIGGER enrichment_reservation_scope_guard BEFORE INSERT ON enrichment_reservations BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM enrichment_grants g
    JOIN typed_configurations c ON c.id = g.configuration_id AND c.workspace_id = g.workspace_id
    WHERE g.id = NEW.grant_id AND g.workspace_id = NEW.workspace_id
      AND g.operation_key = NEW.operation_key AND g.max_units = NEW.reserved_units
      AND g.max_cost_minor = NEW.reserved_cost_minor AND g.currency = NEW.currency AND g.expires_at = NEW.expires_at
      AND g.expires_at > NEW.created_at AND c.active = 1 AND c.digest = g.configuration_digest
      AND c.revision = g.configuration_revision
  ) THEN RAISE(ABORT, 'invalid enrichment reservation authority') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM enrichment_grant_prospects gp
    WHERE gp.grant_id = NEW.grant_id AND gp.workspace_id = NEW.workspace_id
  ) OR EXISTS (
    SELECT 1 FROM enrichment_grant_prospects gp
    JOIN enrichment_grants g ON g.id = gp.grant_id AND g.workspace_id = gp.workspace_id
    LEFT JOIN profile_prospects p ON p.id = gp.prospect_id AND p.workspace_id = gp.workspace_id
    LEFT JOIN prospecting_candidates pc ON pc.id = p.candidate_id AND pc.workspace_id = p.workspace_id
    LEFT JOIN qualification_assessments qa ON qa.id = p.assessment_id AND qa.workspace_id = p.workspace_id
    WHERE gp.grant_id = NEW.grant_id AND gp.workspace_id = NEW.workspace_id
      AND (p.id IS NULL OR p.active <> 1 OR p.state <> 'approved' OR p.revision <> gp.prospect_revision
        OR pc.id IS NULL OR pc.profile_id <> p.profile_id OR pc.configuration_id <> gp.configuration_id
        OR pc.status <> 'qualified' OR qa.id IS NULL OR qa.candidate_id <> pc.id
        OR qa.configuration_id <> gp.configuration_id OR qa.configuration_digest <> gp.configuration_digest
        OR qa.outcome <> 'Passed' OR g.configuration_id <> gp.configuration_id
        OR g.configuration_digest <> gp.configuration_digest)
  ) THEN RAISE(ABORT, 'stale enrichment prospect authority') END;
END;
--> statement-breakpoint
CREATE TRIGGER enrichment_budget_entry_guard BEFORE INSERT ON enrichment_reservation_budget_entries BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM enrichment_reservations r JOIN enrichment_grants g ON g.id = r.grant_id AND g.workspace_id = r.workspace_id
    JOIN enrichment_budget_accounts a ON a.id = NEW.account_id
    WHERE r.id = NEW.reservation_id AND r.workspace_id = NEW.workspace_id AND a.workspace_id = NEW.workspace_id
      AND a.revision = NEW.account_expected_revision AND a.currency = r.currency
      AND ((a.scope = 'grant' AND a.entity_id = g.id) OR (a.scope = 'profile' AND a.entity_id = g.configuration_id)
        OR (a.scope = 'workspace' AND a.entity_id = g.workspace_id) OR (a.scope = 'provider' AND a.entity_id = g.provider_id))
      AND NEW.reserved_units = r.reserved_units AND NEW.reserved_cost_minor = r.reserved_cost_minor
      AND a.actual_units + a.reserved_units + NEW.reserved_units <= a.max_units
      AND a.actual_cost_minor + a.reserved_cost_minor + NEW.reserved_cost_minor <= a.max_cost_minor
  ) THEN RAISE(ABORT, 'enrichment budget exceeded or stale') END;
END;
--> statement-breakpoint
CREATE TRIGGER enrichment_budget_entry_apply AFTER INSERT ON enrichment_reservation_budget_entries BEGIN
  UPDATE enrichment_budget_accounts SET reserved_units = reserved_units + NEW.reserved_units,
    reserved_cost_minor = reserved_cost_minor + NEW.reserved_cost_minor,
    revision = revision + 1, updated_at = NEW.created_at
  WHERE id = NEW.account_id AND workspace_id = NEW.workspace_id AND revision = NEW.account_expected_revision;
END;
--> statement-breakpoint
CREATE TRIGGER enrichment_reservation_event_guard BEFORE INSERT ON enrichment_reservation_events BEGIN
  SELECT CASE WHEN NEW.state NOT IN ('reserved','invoking','settled','released','needs_reconciliation')
    OR NOT EXISTS (SELECT 1 FROM enrichment_reservations r WHERE r.id = NEW.reservation_id AND r.workspace_id = NEW.workspace_id)
    OR (NEW.state IN ('reserved','invoking') AND (
      NEW.terminal_reason IS NOT NULL OR NEW.settlement_digest IS NOT NULL
      OR NEW.documented_units IS NOT NULL OR NEW.documented_cost_minor IS NOT NULL
      OR NEW.observation_ids_json <> '[]'
    ))
    OR (NEW.state = 'needs_reconciliation' AND (
      NEW.terminal_reason IS NULL
      OR NEW.terminal_reason NOT IN ('timeout','ambiguous','provider_port_mismatch','invalid_provider_outcome','invalid_assignment','invalid_evidence','provider_throw','settlement_failure')
      OR NEW.settlement_digest IS NOT NULL OR NEW.documented_units IS NOT NULL OR NEW.documented_cost_minor IS NOT NULL
      OR NEW.observation_ids_json <> '[]'
    ))
    OR (NEW.state = 'settled' AND (NEW.terminal_reason IS NULL OR NEW.terminal_reason NOT IN ('completed','partial')))
    OR (NEW.state = 'released' AND (NEW.terminal_reason IS NULL OR NEW.terminal_reason NOT IN ('rejected','expired')))
    OR (NEW.state = 'released' AND NEW.terminal_reason = 'expired' AND (NEW.documented_units <> 0 OR NEW.documented_cost_minor <> 0))
    OR (NEW.state = 'reserved' AND (
      (SELECT count(*) FROM enrichment_reservation_budget_entries be WHERE be.reservation_id = NEW.reservation_id) <> 4
      OR (SELECT count(DISTINCT a.scope) FROM enrichment_reservation_budget_entries be JOIN enrichment_budget_accounts a ON a.id = be.account_id WHERE be.reservation_id = NEW.reservation_id) <> 4
    ))
    OR (NEW.state IN ('settled','released') AND (
      NEW.documented_units IS NULL OR NEW.documented_cost_minor IS NULL OR NEW.settlement_digest IS NULL
      OR NEW.documented_units < 0 OR NEW.documented_cost_minor < 0
      OR json_valid(NEW.observation_ids_json) = 0 OR json_type(NEW.observation_ids_json) <> 'array'
      OR json_array_length(NEW.observation_ids_json) > NEW.documented_units
      OR (SELECT count(*) FROM json_each(NEW.observation_ids_json)) <> (SELECT count(DISTINCT value) FROM json_each(NEW.observation_ids_json))
      OR EXISTS (
        SELECT 1 FROM json_each(NEW.observation_ids_json) ids
        WHERE NOT EXISTS (
          SELECT 1 FROM contact_point_observations o JOIN contact_evidence_assignments a ON a.id = o.assignment_id
          JOIN enrichment_reservations r ON r.grant_id = a.grant_id
          WHERE o.id = ids.value AND o.workspace_id = NEW.workspace_id AND r.id = NEW.reservation_id
        )
      )
      OR NOT EXISTS (SELECT 1 FROM enrichment_reservations r WHERE r.id = NEW.reservation_id
        AND NEW.documented_units <= r.reserved_units AND NEW.documented_cost_minor <= r.reserved_cost_minor)
      OR EXISTS (
        SELECT 1 FROM enrichment_reservation_budget_entries be
        JOIN enrichment_budget_accounts a ON a.id = be.account_id AND a.workspace_id = be.workspace_id
        WHERE be.reservation_id = NEW.reservation_id
          AND (a.reserved_units < be.reserved_units OR a.reserved_cost_minor < be.reserved_cost_minor
            OR a.actual_units + NEW.documented_units > a.max_units
            OR a.actual_cost_minor + NEW.documented_cost_minor > a.max_cost_minor)
      )
    ))
    OR (NEW.durable_revision = 1 AND NEW.state <> 'reserved')
    OR NOT EXISTS (
      SELECT 1 FROM enrichment_reservations r
      WHERE r.id = NEW.reservation_id AND NEW.created_at >= r.created_at
    )
    OR (NEW.state = 'invoking' AND NOT EXISTS (
      SELECT 1 FROM enrichment_reservations r WHERE r.id = NEW.reservation_id AND NEW.created_at < r.expires_at
    ))
    OR (NEW.state = 'released' AND NEW.terminal_reason = 'expired' AND NOT EXISTS (
      SELECT 1 FROM enrichment_reservations r WHERE r.id = NEW.reservation_id AND NEW.created_at >= r.expires_at
    ))
    OR (NEW.durable_revision > 1 AND NOT EXISTS (
      SELECT 1 FROM enrichment_reservation_events prior WHERE prior.reservation_id = NEW.reservation_id
        AND prior.durable_revision = NEW.durable_revision - 1
        AND ((prior.state = 'reserved' AND NEW.state IN ('invoking','released'))
          OR (prior.state = 'invoking' AND NEW.state IN ('settled','released','needs_reconciliation'))
          OR (prior.state = 'needs_reconciliation' AND NEW.state IN ('settled','released')))
    )) THEN RAISE(ABORT, 'invalid enrichment reservation lifecycle') END;
END;
--> statement-breakpoint
CREATE TRIGGER enrichment_reservation_terminal_apply AFTER INSERT ON enrichment_reservation_events
WHEN NEW.state IN ('settled','released') BEGIN
  UPDATE enrichment_budget_accounts SET
    reserved_units = reserved_units - (SELECT be.reserved_units FROM enrichment_reservation_budget_entries be WHERE be.reservation_id = NEW.reservation_id AND be.account_id = enrichment_budget_accounts.id),
    reserved_cost_minor = reserved_cost_minor - (SELECT be.reserved_cost_minor FROM enrichment_reservation_budget_entries be WHERE be.reservation_id = NEW.reservation_id AND be.account_id = enrichment_budget_accounts.id),
    actual_units = actual_units + NEW.documented_units,
    actual_cost_minor = actual_cost_minor + NEW.documented_cost_minor,
    revision = revision + 1,
    updated_at = NEW.created_at
  WHERE id IN (SELECT account_id FROM enrichment_reservation_budget_entries WHERE reservation_id = NEW.reservation_id)
    AND workspace_id = NEW.workspace_id;
END;
--> statement-breakpoint
CREATE TRIGGER contact_assignment_scope_guard BEFORE INSERT ON contact_evidence_assignments BEGIN
  SELECT CASE WHEN NEW.role NOT IN ('champion','economic_buyer','general') OR NOT EXISTS (
    SELECT 1 FROM enrichment_grants g
    JOIN enrichment_grant_prospects gp ON gp.grant_id = g.id AND gp.prospect_id = NEW.prospect_id
    JOIN contacts c ON c.id = NEW.contact_id AND c.workspace_id = g.workspace_id
    WHERE g.id = NEW.grant_id AND g.workspace_id = NEW.workspace_id
      AND (NEW.reservation_id IS NULL OR EXISTS (SELECT 1 FROM enrichment_reservations r WHERE r.id = NEW.reservation_id AND r.workspace_id = NEW.workspace_id AND r.grant_id = g.id))
      AND g.configuration_id = NEW.configuration_id AND g.configuration_digest = NEW.configuration_digest
      AND g.provider_id = NEW.provider_id AND g.provider_version = NEW.provider_version
      AND g.catalog_ref = NEW.catalog_ref AND g.quote_revision = NEW.quote_revision
  ) THEN RAISE(ABORT, 'invalid contact evidence assignment') END;
END;
--> statement-breakpoint
CREATE TRIGGER contact_observation_scope_guard BEFORE INSERT ON contact_point_observations BEGIN
  SELECT CASE WHEN NEW.kind NOT IN ('email','phone') OR NEW.verification_class NOT IN ('suggested','domain_valid','mailbox_verified','source_verified','invalid')
    OR NEW.method NOT IN ('pattern_inference','domain_validation','mailbox_verification','authoritative_source_reconfirmed')
    OR instr(NEW.contact_point_reference, '@') > 0 OR substr(NEW.contact_point_reference, 1, 1) = '+'
    OR (NEW.verification_class = 'suggested' AND (NEW.method <> 'pattern_inference' OR NEW.verified_at IS NOT NULL OR NEW.verifier_id IS NOT NULL))
    OR (NEW.verification_class = 'mailbox_verified' AND NEW.method <> 'mailbox_verification')
    OR (NEW.verification_class = 'source_verified' AND NEW.method <> 'authoritative_source_reconfirmed')
    OR ((NEW.verifier_id IS NULL OR NEW.verifier_version IS NULL OR NEW.verdict_reference IS NULL OR NEW.verdict_digest IS NULL)
      AND NOT (NEW.verifier_id IS NULL AND NEW.verifier_version IS NULL AND NEW.verdict_reference IS NULL AND NEW.verdict_digest IS NULL))
    OR ((NEW.provider_id IS NULL OR NEW.provider_version IS NULL OR NEW.catalog_ref IS NULL)
      AND NOT (NEW.provider_id IS NULL AND NEW.provider_version IS NULL AND NEW.catalog_ref IS NULL))
    OR NOT EXISTS (
      SELECT 1 FROM contact_evidence_assignments a JOIN contacts c ON c.id = NEW.contact_id AND c.workspace_id = a.workspace_id
      WHERE a.id = NEW.assignment_id AND a.workspace_id = NEW.workspace_id AND a.contact_id = NEW.contact_id
        AND a.configuration_id = NEW.configuration_id AND a.configuration_digest = NEW.configuration_digest
        AND (NEW.provider_id IS NULL OR (NEW.provider_id = a.provider_id AND NEW.provider_version = a.provider_version AND NEW.catalog_ref = a.catalog_ref))
    ) OR ((NEW.verification_class IN ('mailbox_verified','source_verified')) AND
      (NEW.verified_at IS NULL OR NEW.verifier_id IS NULL OR NEW.verifier_version IS NULL OR NEW.verdict_reference IS NULL OR NEW.verdict_digest IS NULL))
    OR (NEW.parent_observation_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM contact_point_observations p WHERE p.id = NEW.parent_observation_id AND p.workspace_id = NEW.workspace_id AND p.contact_id = NEW.contact_id
    ))
    THEN RAISE(ABORT, 'invalid contact observation') END;
END;
--> statement-breakpoint
CREATE TRIGGER contact_eligibility_scope_guard BEFORE INSERT ON contact_eligibility_snapshots BEGIN
  SELECT CASE WHEN NEW.state NOT IN ('ContactReady','ContactSuggestion','NeedsReview','NonContactable')
    OR NEW.eligible NOT IN (0,1) OR (NEW.eligible = 1 AND NEW.state <> 'ContactReady')
    OR (NEW.state = 'ContactReady' AND NEW.eligible <> 1)
    OR NOT EXISTS (SELECT 1 FROM contacts c JOIN profile_prospects p ON p.id = NEW.prospect_id AND p.workspace_id = c.workspace_id
      JOIN typed_configurations cfg ON cfg.id = NEW.configuration_id AND cfg.workspace_id = c.workspace_id
      JOIN prospecting_candidates pc ON pc.id = p.candidate_id AND pc.workspace_id = p.workspace_id
      JOIN qualification_assessments qa ON qa.id = p.assessment_id AND qa.workspace_id = p.workspace_id
      WHERE c.id = NEW.contact_id AND c.workspace_id = NEW.workspace_id
        AND p.active = 1 AND p.state = 'approved' AND p.revision = NEW.prospect_revision
        AND cfg.owner_type = 'profile' AND cfg.owner_id = p.profile_id AND cfg.kind = 'profile_effective'
        AND cfg.active = 1 AND cfg.digest = NEW.configuration_digest AND cfg.revision = NEW.configuration_revision
        AND pc.profile_id = p.profile_id AND pc.configuration_id = cfg.id AND pc.status = 'qualified'
        AND qa.candidate_id = pc.id AND qa.configuration_id = cfg.id
        AND qa.configuration_digest = cfg.digest AND qa.outcome = 'Passed')
    OR (NEW.eligible = 1 AND (
      json_array_length(NEW.observation_ids_json) = 0
      OR json_array_length(NEW.observation_ids_json) <> (
        SELECT count(*) FROM json_each(NEW.observation_ids_json) ids
        JOIN contact_point_observations o
          ON o.id = ids.value AND o.workspace_id = NEW.workspace_id
         AND o.contact_id = NEW.contact_id AND o.configuration_id = NEW.configuration_id
         AND o.configuration_digest = NEW.configuration_digest
        JOIN contact_evidence_assignments a
          ON a.id = o.assignment_id AND a.workspace_id = o.workspace_id
         AND a.contact_id = NEW.contact_id AND a.prospect_id = NEW.prospect_id
         AND a.configuration_id = NEW.configuration_id AND a.configuration_digest = NEW.configuration_digest
        WHERE (
          (o.kind = 'email' AND o.verification_class = 'mailbox_verified'
            AND o.method = 'mailbox_verification' AND o.verified_at IS NOT NULL
            AND NEW.projected_at >= o.verified_at AND NEW.projected_at - o.verified_at <= 2592000000)
          OR
          (o.kind IN ('email','phone') AND o.verification_class = 'source_verified'
            AND o.method = 'authoritative_source_reconfirmed' AND o.verified_at IS NOT NULL
            AND NEW.projected_at >= o.verified_at AND NEW.projected_at - o.verified_at <= 7776000000)
        )
        AND (o.parent_observation_id IS NULL OR EXISTS (
          SELECT 1 FROM contact_point_observations parent
          WHERE parent.id = o.parent_observation_id AND parent.workspace_id = o.workspace_id
            AND parent.contact_id = o.contact_id AND parent.configuration_id = o.configuration_id
            AND parent.configuration_digest = o.configuration_digest
            AND parent.observed_at <= o.observed_at
        ))
      )
    ))
    THEN RAISE(ABORT, 'invalid contact eligibility snapshot') END;
END;
--> statement-breakpoint
CREATE TRIGGER contact_eligibility_json_guard BEFORE INSERT ON contact_eligibility_snapshots BEGIN
  SELECT CASE WHEN
    json_valid(NEW.observation_ids_json) <> 1 OR json_type(NEW.observation_ids_json) <> 'array'
    OR json(NEW.observation_ids_json) <> NEW.observation_ids_json
    OR json_valid(NEW.reason_codes_json) <> 1 OR json_type(NEW.reason_codes_json) <> 'array'
    OR json(NEW.reason_codes_json) <> NEW.reason_codes_json
    OR json_valid(NEW.preserved_suppression_refs_json) <> 1 OR json_type(NEW.preserved_suppression_refs_json) <> 'array'
    OR json(NEW.preserved_suppression_refs_json) <> NEW.preserved_suppression_refs_json
    OR EXISTS (SELECT 1 FROM json_each(NEW.observation_ids_json) WHERE type <> 'text' OR value = '')
    OR EXISTS (SELECT 1 FROM json_each(NEW.reason_codes_json) WHERE type <> 'text' OR value = '')
    OR EXISTS (SELECT 1 FROM json_each(NEW.preserved_suppression_refs_json) WHERE type <> 'text' OR value = '')
    OR json_array_length(NEW.observation_ids_json) <> (
      SELECT count(DISTINCT value) FROM json_each(NEW.observation_ids_json)
    )
    OR json_array_length(NEW.reason_codes_json) <> (
      SELECT count(DISTINCT value) FROM json_each(NEW.reason_codes_json)
    )
    OR json_array_length(NEW.preserved_suppression_refs_json) <> (
      SELECT count(DISTINCT value) FROM json_each(NEW.preserved_suppression_refs_json)
    )
    OR EXISTS (
      SELECT 1 FROM json_each(NEW.observation_ids_json) current
      JOIN json_each(NEW.observation_ids_json) next ON next.key = current.key + 1
      WHERE current.value >= next.value
    )
    OR EXISTS (
      SELECT 1 FROM json_each(NEW.reason_codes_json) current
      JOIN json_each(NEW.reason_codes_json) next ON next.key = current.key + 1
      WHERE current.value >= next.value
    )
    OR EXISTS (
      SELECT 1 FROM json_each(NEW.preserved_suppression_refs_json) current
      JOIN json_each(NEW.preserved_suppression_refs_json) next ON next.key = current.key + 1
      WHERE current.value >= next.value
    )
    THEN RAISE(ABORT, 'invalid contact eligibility json') END;
END;
--> statement-breakpoint
CREATE TRIGGER identity_suggestion_scope_guard BEFORE INSERT ON identity_suggestions BEGIN
  SELECT CASE WHEN NEW.subject_kind NOT IN ('contact','organization') OR NEW.kind NOT IN ('merge','split')
    OR NOT EXISTS (SELECT 1 FROM workspaces w WHERE w.id = NEW.workspace_id AND w.owner_subject = NEW.owner_subject)
    THEN RAISE(ABORT, 'invalid identity suggestion') END;
END;
--> statement-breakpoint
CREATE TRIGGER identity_candidate_scope_guard BEFORE INSERT ON identity_suggestion_candidates BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM identity_suggestions s WHERE s.id = NEW.suggestion_id AND s.workspace_id = NEW.workspace_id
      AND ((s.subject_kind = 'contact' AND EXISTS (SELECT 1 FROM contacts c WHERE c.id = NEW.subject_id AND c.workspace_id = NEW.workspace_id))
        OR (s.subject_kind = 'organization' AND EXISTS (SELECT 1 FROM organizations o WHERE o.id = NEW.subject_id AND o.workspace_id = NEW.workspace_id)))
  ) THEN RAISE(ABORT, 'invalid identity candidate kind or scope') END;
END;
--> statement-breakpoint
CREATE TRIGGER identity_impact_scope_guard BEFORE INSERT ON identity_suggestion_impacts BEGIN
  SELECT CASE WHEN NEW.scope NOT IN ('market_play','customer_profile') OR NOT EXISTS (
    SELECT 1 FROM identity_suggestions s WHERE s.id = NEW.suggestion_id AND s.workspace_id = NEW.workspace_id
  ) THEN RAISE(ABORT, 'invalid identity impact scope') END;
END;
--> statement-breakpoint
CREATE TRIGGER identity_decision_scope_guard BEFORE INSERT ON identity_decisions BEGIN
  SELECT CASE WHEN NEW.subject_kind NOT IN ('contact','organization') OR NEW.kind NOT IN ('merge','split') OR NOT EXISTS (
    SELECT 1 FROM identity_suggestions s JOIN workspaces w ON w.id = s.workspace_id
    WHERE s.id = NEW.suggestion_id AND s.workspace_id = NEW.workspace_id AND s.owner_subject = NEW.owner_subject
      AND s.subject_kind = NEW.subject_kind AND s.kind = NEW.kind AND w.owner_subject = NEW.owner_subject
  ) THEN RAISE(ABORT, 'invalid identity decision') END;
END;
--> statement-breakpoint
CREATE TRIGGER identity_lineage_scope_guard BEFORE INSERT ON identity_lineage BEGIN
  SELECT CASE WHEN NEW.subject_kind NOT IN ('contact','organization') OR NEW.relationship NOT IN ('merged_into','split_from','association_repointed')
    OR NOT EXISTS (SELECT 1 FROM identity_decisions d WHERE d.id = NEW.decision_id AND d.workspace_id = NEW.workspace_id AND d.subject_kind = NEW.subject_kind)
    OR (NEW.subject_kind = 'contact' AND (NOT EXISTS (SELECT 1 FROM contacts c WHERE c.id = NEW.source_subject_id AND c.workspace_id = NEW.workspace_id)
      OR NOT EXISTS (SELECT 1 FROM contacts c WHERE c.id = NEW.target_subject_id AND c.workspace_id = NEW.workspace_id)))
    OR (NEW.subject_kind = 'organization' AND (NOT EXISTS (SELECT 1 FROM organizations o WHERE o.id = NEW.source_subject_id AND o.workspace_id = NEW.workspace_id)
      OR NOT EXISTS (SELECT 1 FROM organizations o WHERE o.id = NEW.target_subject_id AND o.workspace_id = NEW.workspace_id)))
    THEN RAISE(ABORT, 'invalid identity lineage') END;
END;
--> statement-breakpoint
CREATE TRIGGER runner_budget_account_scope_guard BEFORE INSERT ON runner_budget_accounts BEGIN
  SELECT CASE WHEN NEW.scope NOT IN ('runner_per_run','runner_monthly')
    OR NEW.actual_cost_minor <> 0 OR NEW.reserved_cost_minor <> 0 OR NEW.revision <> 1 OR
    (NEW.scope = 'runner_monthly' AND EXISTS (
      SELECT 1 FROM runner_budget_accounts a WHERE a.workspace_id = NEW.workspace_id AND a.scope = 'runner_monthly'
        AND a.owner_subject = NEW.owner_subject AND a.provider_id = NEW.provider_id AND a.scope_id = NEW.scope_id
        AND a.period = NEW.period AND a.currency = NEW.currency
    )) OR (NEW.scope = 'runner_monthly' AND (CAST(substr(NEW.period, 6, 2) AS integer) < 1 OR CAST(substr(NEW.period, 6, 2) AS integer) > 12))
    OR (NEW.scope = 'runner_per_run' AND EXISTS (
      SELECT 1 FROM runner_budget_accounts a WHERE a.workspace_id = NEW.workspace_id AND a.scope = 'runner_per_run'
        AND a.owner_subject = NEW.owner_subject AND a.provider_id = NEW.provider_id AND a.scope_id = NEW.scope_id
        AND a.attempt_number = NEW.attempt_number AND a.operation_key = NEW.operation_key AND a.currency = NEW.currency
    )) THEN RAISE(ABORT, 'invalid or duplicate runner budget account') END;
END;
--> statement-breakpoint
CREATE TRIGGER runner_spend_grant_scope_guard BEFORE INSERT ON runner_spend_grants BEGIN
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM workspaces w WHERE w.id = NEW.workspace_id AND w.owner_subject = NEW.owner_subject)
    THEN RAISE(ABORT, 'invalid runner spend grant scope') END;
END;
--> statement-breakpoint
CREATE TRIGGER runner_budget_account_update_guard BEFORE UPDATE ON runner_budget_accounts BEGIN
  SELECT CASE WHEN NEW.id <> OLD.id OR NEW.workspace_id <> OLD.workspace_id OR NEW.scope <> OLD.scope
    OR NEW.owner_subject <> OLD.owner_subject OR NEW.provider_id <> OLD.provider_id OR NEW.scope_id <> OLD.scope_id
    OR NEW.period IS NOT OLD.period OR NEW.attempt_number IS NOT OLD.attempt_number OR NEW.operation_key IS NOT OLD.operation_key
    OR NEW.currency <> OLD.currency OR NEW.max_cost_minor <> OLD.max_cost_minor OR NEW.created_at <> OLD.created_at
    OR NEW.revision <> OLD.revision + 1 OR NEW.reserved_cost_minor < 0
    OR NOT (
      EXISTS (
        SELECT 1 FROM runner_spend_reservations r
        WHERE r.workspace_id = OLD.workspace_id AND (r.per_run_account_id = OLD.id OR r.monthly_account_id = OLD.id)
          AND r.created_at = NEW.updated_at
          AND ((r.per_run_account_id = OLD.id AND r.per_run_account_expected_revision = OLD.revision)
            OR (r.monthly_account_id = OLD.id AND r.monthly_account_expected_revision = OLD.revision))
          AND NEW.actual_cost_minor = OLD.actual_cost_minor
          AND NEW.reserved_cost_minor = OLD.reserved_cost_minor + r.reserved_cost_minor
          AND NEW.revision = 1
            + (SELECT count(*) FROM runner_spend_reservations all_r
               WHERE all_r.workspace_id = OLD.workspace_id
                 AND (all_r.per_run_account_id = OLD.id OR all_r.monthly_account_id = OLD.id))
            + (SELECT count(*) FROM runner_spend_reservations terminal_r
               JOIN runner_spend_reservation_events terminal_e ON terminal_e.reservation_id = terminal_r.id
               WHERE terminal_r.workspace_id = OLD.workspace_id
                 AND (terminal_r.per_run_account_id = OLD.id OR terminal_r.monthly_account_id = OLD.id)
                 AND terminal_e.state IN ('failed_retryable','settled','released'))
      )
      OR EXISTS (
        SELECT 1 FROM runner_spend_reservations r
        JOIN runner_spend_reservation_events e ON e.reservation_id = r.id
        WHERE r.workspace_id = OLD.workspace_id AND (r.per_run_account_id = OLD.id OR r.monthly_account_id = OLD.id)
          AND e.created_at = NEW.updated_at
          AND e.durable_revision = (SELECT max(e2.durable_revision) FROM runner_spend_reservation_events e2 WHERE e2.reservation_id = r.id)
          AND e.state IN ('failed_retryable','settled','released') AND e.documented_cost_minor IS NOT NULL
          AND OLD.reserved_cost_minor = r.reserved_cost_minor + coalesce((
            SELECT sum(outstanding_r.reserved_cost_minor) FROM runner_spend_reservations outstanding_r
            WHERE outstanding_r.workspace_id = OLD.workspace_id
              AND (outstanding_r.per_run_account_id = OLD.id OR outstanding_r.monthly_account_id = OLD.id)
              AND outstanding_r.id <> r.id
              AND NOT EXISTS (
                SELECT 1 FROM runner_spend_reservation_events outstanding_terminal
                WHERE outstanding_terminal.reservation_id = outstanding_r.id
                  AND outstanding_terminal.state IN ('failed_retryable','settled','released')
              )
          ), 0)
          AND NEW.reserved_cost_minor = OLD.reserved_cost_minor - r.reserved_cost_minor
          AND NEW.actual_cost_minor = OLD.actual_cost_minor + e.documented_cost_minor
          AND NEW.revision = 1
            + (SELECT count(*) FROM runner_spend_reservations all_r
               WHERE all_r.workspace_id = OLD.workspace_id
                 AND (all_r.per_run_account_id = OLD.id OR all_r.monthly_account_id = OLD.id))
            + (SELECT count(*) FROM runner_spend_reservations terminal_r
               JOIN runner_spend_reservation_events terminal_e ON terminal_e.reservation_id = terminal_r.id
               WHERE terminal_r.workspace_id = OLD.workspace_id
                 AND (terminal_r.per_run_account_id = OLD.id OR terminal_r.monthly_account_id = OLD.id)
                 AND terminal_e.state IN ('failed_retryable','settled','released'))
      )
    )
    THEN RAISE(ABORT, 'invalid runner budget mutation') END;
END;
--> statement-breakpoint
CREATE TRIGGER runner_reservation_scope_guard BEFORE INSERT ON runner_spend_reservations BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM runner_spend_grants g
    WHERE g.id = NEW.grant_id AND g.workspace_id = NEW.workspace_id AND g.provider_id = NEW.provider_id
      AND g.model = NEW.model AND g.catalog_ref = NEW.catalog_ref AND g.scope_id = NEW.scope_id
      AND g.run_type = NEW.run_type AND g.currency = NEW.currency AND g.per_run_cost_minor = NEW.reserved_cost_minor
      AND g.max_retries = NEW.max_retries AND NEW.attempt_number <= g.max_retries AND g.expires_at > NEW.created_at
      AND NEW.operation_key GLOB 'ro_[0-9a-f]*' AND length(NEW.operation_key) = 67
      AND length(NEW.attempt_digest) = 64 AND NEW.attempt_digest NOT GLOB '*[^0-9a-f]*'
      AND NEW.period = strftime('%Y-%m', NEW.created_at / 1000, 'unixepoch')
      AND json_valid(NEW.previous_operation_keys_json) = 1 AND json_type(NEW.previous_operation_keys_json) = 'array'
      AND json_array_length(NEW.previous_operation_keys_json) = NEW.attempt_number
      AND ((NEW.attempt_number = 0 AND NEW.previous_outcome = 'none')
        OR (NEW.attempt_number > 0 AND NEW.previous_outcome = 'failed_retryable'))
  ) THEN RAISE(ABORT, 'invalid runner reservation authority') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM runner_spend_grants g
    JOIN runner_budget_accounts pr ON pr.id = NEW.per_run_account_id AND pr.workspace_id = g.workspace_id
    JOIN runner_budget_accounts mo ON mo.id = NEW.monthly_account_id AND mo.workspace_id = g.workspace_id
    WHERE g.id = NEW.grant_id AND g.workspace_id = NEW.workspace_id
      AND pr.scope = 'runner_per_run' AND pr.owner_subject = g.owner_subject AND pr.provider_id = g.provider_id
      AND pr.scope_id = g.scope_id AND pr.operation_key = NEW.operation_key AND pr.attempt_number = NEW.attempt_number
      AND pr.currency = g.currency AND pr.actual_cost_minor + pr.reserved_cost_minor + NEW.reserved_cost_minor <= pr.max_cost_minor
      AND mo.scope = 'runner_monthly' AND mo.owner_subject = g.owner_subject AND mo.provider_id = g.provider_id
      AND mo.scope_id = g.scope_id AND mo.currency = g.currency AND mo.period = NEW.period
      AND pr.revision = NEW.per_run_account_expected_revision
      AND mo.revision = NEW.monthly_account_expected_revision
      AND mo.actual_cost_minor + mo.reserved_cost_minor + NEW.reserved_cost_minor <= mo.max_cost_minor
      AND mo.actual_cost_minor + mo.reserved_cost_minor + NEW.reserved_cost_minor <= g.monthly_cost_minor
  ) THEN RAISE(ABORT, 'invalid runner reservation accounts') END;
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM json_each(NEW.previous_operation_keys_json) history
    WHERE NOT EXISTS (
      SELECT 1 FROM runner_spend_reservations prior
      JOIN runner_spend_reservation_events ev ON ev.reservation_id = prior.id
      WHERE prior.workspace_id = NEW.workspace_id AND prior.grant_id = NEW.grant_id
        AND prior.attempt_number = CAST(history.key AS integer) AND prior.operation_key = history.value
        AND ev.durable_revision = (SELECT max(e2.durable_revision) FROM runner_spend_reservation_events e2 WHERE e2.reservation_id = prior.id)
        AND ev.state = 'failed_retryable'
    )
  ) THEN RAISE(ABORT, 'invalid runner retry lineage') END;
END;
--> statement-breakpoint
CREATE TRIGGER runner_reservation_apply AFTER INSERT ON runner_spend_reservations BEGIN
  UPDATE runner_budget_accounts SET reserved_cost_minor = reserved_cost_minor + NEW.reserved_cost_minor,
    revision = revision + 1, updated_at = NEW.created_at
  WHERE id IN (NEW.per_run_account_id, NEW.monthly_account_id) AND workspace_id = NEW.workspace_id;
END;
--> statement-breakpoint
CREATE TRIGGER runner_reservation_event_scope_guard BEFORE INSERT ON runner_spend_reservation_events BEGIN
  SELECT CASE WHEN NEW.state NOT IN ('reserved','assigned','failed_retryable','settled','released','needs_reconciliation')
    OR NOT EXISTS (SELECT 1 FROM runner_spend_reservations r WHERE r.id = NEW.reservation_id AND r.workspace_id = NEW.workspace_id)
    OR (NEW.state IN ('reserved','assigned') AND (
      NEW.terminal_reason IS NOT NULL OR NEW.settlement_digest IS NOT NULL OR NEW.documented_cost_minor IS NOT NULL
    ))
    OR (NEW.state = 'needs_reconciliation' AND (
      NEW.terminal_reason IS NULL OR NEW.terminal_reason NOT IN ('timeout','ambiguous','provider_error')
      OR NEW.settlement_digest IS NOT NULL OR NEW.documented_cost_minor IS NOT NULL
    ))
    OR (NEW.state = 'failed_retryable' AND (
      NEW.terminal_reason IS NULL OR NEW.terminal_reason <> 'failed_retryable'
      OR NEW.settlement_digest IS NULL OR NEW.documented_cost_minor IS NULL
    ))
    OR (NEW.state = 'failed_retryable' AND NOT EXISTS (
      SELECT 1 FROM runner_spend_reservations r
      WHERE r.id = NEW.reservation_id AND r.attempt_number < r.max_retries
    ))
    OR (NEW.state = 'settled' AND (
      NEW.terminal_reason IS NULL OR NEW.terminal_reason NOT IN ('completed','partial')
      OR NEW.settlement_digest IS NULL OR NEW.documented_cost_minor IS NULL
    ))
    OR (NEW.state = 'released' AND (
      NEW.terminal_reason IS NULL OR NEW.terminal_reason NOT IN ('rejected','expired')
      OR NEW.settlement_digest IS NULL OR NEW.documented_cost_minor IS NULL
    ))
    OR (NEW.state IN ('failed_retryable','settled','released') AND (
      NEW.documented_cost_minor < 0
      OR NOT EXISTS (
        SELECT 1 FROM runner_spend_reservations r
        JOIN runner_budget_accounts pr ON pr.id = r.per_run_account_id
        JOIN runner_budget_accounts mo ON mo.id = r.monthly_account_id
        WHERE r.id = NEW.reservation_id AND NEW.documented_cost_minor <= r.reserved_cost_minor
          AND pr.reserved_cost_minor >= r.reserved_cost_minor AND mo.reserved_cost_minor >= r.reserved_cost_minor
          AND pr.actual_cost_minor + NEW.documented_cost_minor <= pr.max_cost_minor
          AND mo.actual_cost_minor + NEW.documented_cost_minor <= mo.max_cost_minor
      )
    ))
    OR (NEW.durable_revision = 1 AND NEW.state <> 'reserved')
    OR NOT EXISTS (
      SELECT 1 FROM runner_spend_reservations r JOIN runner_spend_grants g ON g.id = r.grant_id
      WHERE r.id = NEW.reservation_id AND NEW.created_at >= r.created_at
        AND (NEW.state <> 'assigned' OR NEW.created_at < g.expires_at)
        AND (NEW.state <> 'released' OR NEW.terminal_reason <> 'expired' OR NEW.created_at >= g.expires_at)
    )
    OR (NEW.durable_revision > 1 AND NOT EXISTS (
      SELECT 1 FROM runner_spend_reservation_events prior WHERE prior.reservation_id = NEW.reservation_id
        AND prior.durable_revision = NEW.durable_revision - 1 AND NEW.created_at >= prior.created_at
        AND ((prior.state = 'reserved' AND NEW.state IN ('assigned','released'))
          OR (prior.state = 'assigned' AND NEW.state IN ('failed_retryable','settled','released','needs_reconciliation'))
          OR (prior.state = 'needs_reconciliation' AND NEW.state IN ('settled','released')))
    )) THEN RAISE(ABORT, 'invalid runner reservation lifecycle') END;
END;
--> statement-breakpoint
CREATE TRIGGER runner_reservation_terminal_apply AFTER INSERT ON runner_spend_reservation_events
WHEN NEW.state IN ('failed_retryable','settled','released') BEGIN
  UPDATE runner_budget_accounts SET
    reserved_cost_minor = reserved_cost_minor - (SELECT r.reserved_cost_minor FROM runner_spend_reservations r WHERE r.id = NEW.reservation_id),
    actual_cost_minor = actual_cost_minor + NEW.documented_cost_minor,
    revision = revision + 1,
    updated_at = NEW.created_at
  WHERE id IN (
    SELECT per_run_account_id FROM runner_spend_reservations WHERE id = NEW.reservation_id
    UNION ALL
    SELECT monthly_account_id FROM runner_spend_reservations WHERE id = NEW.reservation_id
  ) AND workspace_id = NEW.workspace_id;
END;
--> statement-breakpoint
CREATE TRIGGER immutable_provider_quotes_update BEFORE UPDATE ON provider_quotes BEGIN SELECT RAISE(ABORT, 'immutable provider quote'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_enrichment_grants_update BEFORE UPDATE ON enrichment_grants BEGIN SELECT RAISE(ABORT, 'immutable enrichment grant'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_enrichment_grant_prospects_update BEFORE UPDATE ON enrichment_grant_prospects BEGIN SELECT RAISE(ABORT, 'immutable enrichment grant prospect'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_enrichment_issuance_update BEFORE UPDATE ON enrichment_grant_issuance_events BEGIN SELECT RAISE(ABORT, 'immutable enrichment issuance'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_enrichment_reservations_update BEFORE UPDATE ON enrichment_reservations BEGIN SELECT RAISE(ABORT, 'immutable enrichment reservation'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_enrichment_budget_entries_update BEFORE UPDATE ON enrichment_reservation_budget_entries BEGIN SELECT RAISE(ABORT, 'immutable enrichment budget entry'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_enrichment_events_update BEFORE UPDATE ON enrichment_reservation_events BEGIN SELECT RAISE(ABORT, 'immutable enrichment reservation event'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_contact_assignments_update BEFORE UPDATE ON contact_evidence_assignments BEGIN SELECT RAISE(ABORT, 'immutable contact assignment'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_contact_observations_update BEFORE UPDATE ON contact_point_observations BEGIN SELECT RAISE(ABORT, 'immutable contact observation'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_contact_eligibility_update BEFORE UPDATE ON contact_eligibility_snapshots BEGIN SELECT RAISE(ABORT, 'immutable contact eligibility snapshot'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_identity_suggestions_update BEFORE UPDATE ON identity_suggestions BEGIN SELECT RAISE(ABORT, 'immutable identity suggestion'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_identity_candidates_update BEFORE UPDATE ON identity_suggestion_candidates BEGIN SELECT RAISE(ABORT, 'immutable identity candidate'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_identity_impacts_update BEFORE UPDATE ON identity_suggestion_impacts BEGIN SELECT RAISE(ABORT, 'immutable identity impact'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_identity_decisions_update BEFORE UPDATE ON identity_decisions BEGIN SELECT RAISE(ABORT, 'immutable identity decision'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_identity_lineage_update BEFORE UPDATE ON identity_lineage BEGIN SELECT RAISE(ABORT, 'immutable identity lineage'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_runner_grants_update BEFORE UPDATE ON runner_spend_grants BEGIN SELECT RAISE(ABORT, 'immutable runner grant'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_runner_reservations_update BEFORE UPDATE ON runner_spend_reservations BEGIN SELECT RAISE(ABORT, 'immutable runner reservation'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_runner_events_update BEFORE UPDATE ON runner_spend_reservation_events BEGIN SELECT RAISE(ABORT, 'immutable runner reservation event'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_provider_quotes_delete BEFORE DELETE ON provider_quotes BEGIN SELECT RAISE(ABORT, 'immutable provider quote'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_enrichment_grants_delete BEFORE DELETE ON enrichment_grants BEGIN SELECT RAISE(ABORT, 'immutable enrichment grant'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_enrichment_grant_prospects_delete BEFORE DELETE ON enrichment_grant_prospects BEGIN SELECT RAISE(ABORT, 'immutable enrichment grant prospect'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_enrichment_issuance_delete BEFORE DELETE ON enrichment_grant_issuance_events BEGIN SELECT RAISE(ABORT, 'immutable enrichment issuance'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_enrichment_reservations_delete BEFORE DELETE ON enrichment_reservations BEGIN SELECT RAISE(ABORT, 'immutable enrichment reservation'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_enrichment_budget_entries_delete BEFORE DELETE ON enrichment_reservation_budget_entries BEGIN SELECT RAISE(ABORT, 'immutable enrichment budget entry'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_enrichment_events_delete BEFORE DELETE ON enrichment_reservation_events BEGIN SELECT RAISE(ABORT, 'immutable enrichment reservation event'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_contact_assignments_delete BEFORE DELETE ON contact_evidence_assignments BEGIN SELECT RAISE(ABORT, 'immutable contact assignment'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_contact_observations_delete BEFORE DELETE ON contact_point_observations BEGIN SELECT RAISE(ABORT, 'immutable contact observation'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_contact_eligibility_delete BEFORE DELETE ON contact_eligibility_snapshots BEGIN SELECT RAISE(ABORT, 'immutable contact eligibility snapshot'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_identity_suggestions_delete BEFORE DELETE ON identity_suggestions BEGIN SELECT RAISE(ABORT, 'immutable identity suggestion'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_identity_candidates_delete BEFORE DELETE ON identity_suggestion_candidates BEGIN SELECT RAISE(ABORT, 'immutable identity candidate'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_identity_impacts_delete BEFORE DELETE ON identity_suggestion_impacts BEGIN SELECT RAISE(ABORT, 'immutable identity impact'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_identity_decisions_delete BEFORE DELETE ON identity_decisions BEGIN SELECT RAISE(ABORT, 'immutable identity decision'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_identity_lineage_delete BEFORE DELETE ON identity_lineage BEGIN SELECT RAISE(ABORT, 'immutable identity lineage'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_runner_grants_delete BEFORE DELETE ON runner_spend_grants BEGIN SELECT RAISE(ABORT, 'immutable runner grant'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_runner_reservations_delete BEFORE DELETE ON runner_spend_reservations BEGIN SELECT RAISE(ABORT, 'immutable runner reservation'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_runner_events_delete BEFORE DELETE ON runner_spend_reservation_events BEGIN SELECT RAISE(ABORT, 'immutable runner reservation event'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_enrichment_budget_accounts_delete BEFORE DELETE ON enrichment_budget_accounts BEGIN SELECT RAISE(ABORT, 'immutable enrichment budget account'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_runner_budget_accounts_delete BEFORE DELETE ON runner_budget_accounts BEGIN SELECT RAISE(ABORT, 'immutable runner budget account'); END;
