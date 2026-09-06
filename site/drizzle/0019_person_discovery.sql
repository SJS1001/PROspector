CREATE TABLE `contact_verification_intents` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`prospect_id` text NOT NULL,
	`contact_id` text NOT NULL,
	`relevance_id` text NOT NULL,
	`decision_id` text NOT NULL,
	`intent` text NOT NULL,
	`channel` text NOT NULL,
	`source_observation_id` text,
	`configuration_id` text NOT NULL,
	`configuration_digest` text NOT NULL,
	`configuration_revision` integer NOT NULL,
	`prospect_revision` integer NOT NULL,
	`contact_revision` integer NOT NULL,
	`freshness_window_ms` integer NOT NULL,
	`freshness_policy_digest` text NOT NULL,
	`owner_subject` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`intent_digest` text NOT NULL,
	`authority_command_id` text NOT NULL,
	`audit_event_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`prospect_id`) REFERENCES `profile_prospects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`relevance_id`) REFERENCES `prospect_contact_role_relevance`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`decision_id`) REFERENCES `person_discovery_owner_decisions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_observation_id`) REFERENCES `contact_point_observations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`configuration_id`) REFERENCES `typed_configurations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`authority_command_id`) REFERENCES `authority_commands`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`audit_event_id`) REFERENCES `audit_events`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "contact_verification_intent_shape_check" CHECK(("contact_verification_intents"."intent" = 'initial_verification' and "contact_verification_intents"."source_observation_id" is null) or ("contact_verification_intents"."intent" = 'stale_refresh' and "contact_verification_intents"."source_observation_id" is not null)),
	CONSTRAINT "contact_verification_intent_revision_check" CHECK("contact_verification_intents"."configuration_revision" > 0 and "contact_verification_intents"."prospect_revision" > 0 and "contact_verification_intents"."contact_revision" > 0 and "contact_verification_intents"."freshness_window_ms" > 0 and "contact_verification_intents"."freshness_window_ms" <= 31622400000),
	CONSTRAINT "contact_verification_intent_text_bounds_check" CHECK(length("contact_verification_intents"."owner_subject") between 1 and 256 and length("contact_verification_intents"."idempotency_key") between 8 and 200),
	CONSTRAINT "contact_verification_intent_digest_check" CHECK(length("contact_verification_intents"."configuration_digest") = 64 and "contact_verification_intents"."configuration_digest" not glob '*[^0-9a-f]*' and length("contact_verification_intents"."freshness_policy_digest") = 64 and "contact_verification_intents"."freshness_policy_digest" not glob '*[^0-9a-f]*' and length("contact_verification_intents"."intent_digest") = 64 and "contact_verification_intents"."intent_digest" not glob '*[^0-9a-f]*')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `contact_verification_intent_idempotency_unique` ON `contact_verification_intents` (`workspace_id`,`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `contact_verification_intent_digest_unique` ON `contact_verification_intents` (`workspace_id`,`intent_digest`);--> statement-breakpoint
CREATE INDEX `contact_verification_intent_subject_idx` ON `contact_verification_intents` (`workspace_id`,`prospect_id`,`contact_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `person_discovery_candidates` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`run_id` text NOT NULL,
	`prospect_id` text NOT NULL,
	`ordinal` integer NOT NULL,
	`candidate_key` text NOT NULL,
	`display_name` text NOT NULL,
	`role_title` text NOT NULL,
	`role_summary` text NOT NULL,
	`candidate_digest` text NOT NULL,
	`payload_expires_at` integer NOT NULL,
	`redacted_at` integer,
	`redaction_authority_command_id` text,
	`redaction_audit_event_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`run_id`) REFERENCES `person_discovery_runs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`prospect_id`) REFERENCES `profile_prospects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`redaction_authority_command_id`) REFERENCES `authority_commands`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`redaction_audit_event_id`) REFERENCES `audit_events`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "person_discovery_candidate_ordinal_check" CHECK("person_discovery_candidates"."ordinal" between 0 and 19),
	CONSTRAINT "person_discovery_candidate_text_bounds_check" CHECK(length("person_discovery_candidates"."candidate_key") between 1 and 128 and length("person_discovery_candidates"."display_name") between 1 and 160 and length("person_discovery_candidates"."role_title") between 1 and 160 and length("person_discovery_candidates"."role_summary") between 1 and 1000),
	CONSTRAINT "person_discovery_candidate_retention_check" CHECK("person_discovery_candidates"."payload_expires_at" = "person_discovery_candidates"."created_at" + 7776000000 and (("person_discovery_candidates"."redacted_at" is null and "person_discovery_candidates"."redaction_authority_command_id" is null and "person_discovery_candidates"."redaction_audit_event_id" is null) or ("person_discovery_candidates"."redacted_at" >= "person_discovery_candidates"."payload_expires_at" and "person_discovery_candidates"."redaction_authority_command_id" is not null and "person_discovery_candidates"."redaction_audit_event_id" is not null))),
	CONSTRAINT "person_discovery_candidate_digest_check" CHECK(length("person_discovery_candidates"."candidate_digest") = 64 and "person_discovery_candidates"."candidate_digest" not glob '*[^0-9a-f]*')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `person_discovery_candidate_ordinal_unique` ON `person_discovery_candidates` (`run_id`,`ordinal`);--> statement-breakpoint
CREATE UNIQUE INDEX `person_discovery_candidate_key_unique` ON `person_discovery_candidates` (`run_id`,`candidate_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `person_discovery_candidate_digest_unique` ON `person_discovery_candidates` (`workspace_id`,`candidate_digest`);--> statement-breakpoint
CREATE INDEX `person_discovery_candidate_prospect_idx` ON `person_discovery_candidates` (`workspace_id`,`prospect_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `person_discovery_owner_decisions` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`run_id` text NOT NULL,
	`candidate_id` text,
	`decision` text NOT NULL,
	`contact_id` text,
	`owner_subject` text NOT NULL,
	`expected_result_digest` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`decision_digest` text NOT NULL,
	`authority_command_id` text NOT NULL,
	`audit_event_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`run_id`) REFERENCES `person_discovery_runs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`candidate_id`) REFERENCES `person_discovery_candidates`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`authority_command_id`) REFERENCES `authority_commands`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`audit_event_id`) REFERENCES `audit_events`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "person_discovery_decision_shape_check" CHECK(("person_discovery_owner_decisions"."decision" = 'no_match' and "person_discovery_owner_decisions"."candidate_id" is null and "person_discovery_owner_decisions"."contact_id" is null) or ("person_discovery_owner_decisions"."decision" in ('create_new','link_existing') and "person_discovery_owner_decisions"."candidate_id" is not null and "person_discovery_owner_decisions"."contact_id" is not null)),
	CONSTRAINT "person_discovery_decision_text_bounds_check" CHECK(length("person_discovery_owner_decisions"."owner_subject") between 1 and 256 and length("person_discovery_owner_decisions"."idempotency_key") between 8 and 200),
	CONSTRAINT "person_discovery_decision_digest_check" CHECK(length("person_discovery_owner_decisions"."expected_result_digest") = 64 and "person_discovery_owner_decisions"."expected_result_digest" not glob '*[^0-9a-f]*' and length("person_discovery_owner_decisions"."decision_digest") = 64 and "person_discovery_owner_decisions"."decision_digest" not glob '*[^0-9a-f]*')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `person_discovery_decision_run_unique` ON `person_discovery_owner_decisions` (`run_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `person_discovery_decision_idempotency_unique` ON `person_discovery_owner_decisions` (`workspace_id`,`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `person_discovery_decision_digest_unique` ON `person_discovery_owner_decisions` (`workspace_id`,`decision_digest`);--> statement-breakpoint
CREATE TABLE `person_discovery_provenance` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`run_id` text NOT NULL,
	`candidate_id` text NOT NULL,
	`ordinal` integer NOT NULL,
	`source_reference` text NOT NULL,
	`excerpt` text NOT NULL,
	`source_digest` text NOT NULL,
	`excerpt_digest` text NOT NULL,
	`retrieved_at` integer NOT NULL,
	`provenance_digest` text NOT NULL,
	`payload_expires_at` integer NOT NULL,
	`redacted_at` integer,
	`redaction_authority_command_id` text,
	`redaction_audit_event_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`run_id`) REFERENCES `person_discovery_runs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`candidate_id`) REFERENCES `person_discovery_candidates`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`redaction_authority_command_id`) REFERENCES `authority_commands`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`redaction_audit_event_id`) REFERENCES `audit_events`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "person_discovery_provenance_ordinal_check" CHECK("person_discovery_provenance"."ordinal" between 0 and 7),
	CONSTRAINT "person_discovery_provenance_text_bounds_check" CHECK(length("person_discovery_provenance"."source_reference") between 1 and 512 and length("person_discovery_provenance"."excerpt") between 1 and 2000 and "person_discovery_provenance"."retrieved_at" >= 0 and "person_discovery_provenance"."retrieved_at" <= 9007199254740990),
	CONSTRAINT "person_discovery_provenance_retention_check" CHECK("person_discovery_provenance"."payload_expires_at" = "person_discovery_provenance"."created_at" + 63072000000 and (("person_discovery_provenance"."redacted_at" is null and "person_discovery_provenance"."redaction_authority_command_id" is null and "person_discovery_provenance"."redaction_audit_event_id" is null) or ("person_discovery_provenance"."redacted_at" >= "person_discovery_provenance"."payload_expires_at" and "person_discovery_provenance"."redaction_authority_command_id" is not null and "person_discovery_provenance"."redaction_audit_event_id" is not null))),
	CONSTRAINT "person_discovery_provenance_digest_check" CHECK(length("person_discovery_provenance"."source_digest") = 64 and "person_discovery_provenance"."source_digest" not glob '*[^0-9a-f]*' and length("person_discovery_provenance"."excerpt_digest") = 64 and "person_discovery_provenance"."excerpt_digest" not glob '*[^0-9a-f]*' and length("person_discovery_provenance"."provenance_digest") = 64 and "person_discovery_provenance"."provenance_digest" not glob '*[^0-9a-f]*')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `person_discovery_provenance_ordinal_unique` ON `person_discovery_provenance` (`candidate_id`,`ordinal`);--> statement-breakpoint
CREATE UNIQUE INDEX `person_discovery_provenance_digest_unique` ON `person_discovery_provenance` (`workspace_id`,`provenance_digest`);--> statement-breakpoint
CREATE INDEX `person_discovery_provenance_run_idx` ON `person_discovery_provenance` (`workspace_id`,`run_id`,`candidate_id`);--> statement-breakpoint
CREATE TABLE `person_discovery_run_events` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`run_id` text NOT NULL,
	`durable_revision` integer NOT NULL,
	`state` text NOT NULL,
	`candidate_count` integer NOT NULL,
	`result_digest` text,
	`reason` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`run_id`) REFERENCES `person_discovery_runs`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "person_discovery_event_revision_check" CHECK("person_discovery_run_events"."durable_revision" between 1 and 2),
	CONSTRAINT "person_discovery_event_count_check" CHECK("person_discovery_run_events"."candidate_count" between 0 and 20),
	CONSTRAINT "person_discovery_event_shape_check" CHECK(("person_discovery_run_events"."state" = 'requested' and "person_discovery_run_events"."durable_revision" = 1 and "person_discovery_run_events"."candidate_count" = 0 and "person_discovery_run_events"."result_digest" is null and "person_discovery_run_events"."reason" is null) or ("person_discovery_run_events"."state" = 'completed' and "person_discovery_run_events"."durable_revision" = 2 and "person_discovery_run_events"."result_digest" is not null and "person_discovery_run_events"."reason" is null) or ("person_discovery_run_events"."state" = 'needs_reconciliation' and "person_discovery_run_events"."durable_revision" = 2 and "person_discovery_run_events"."candidate_count" = 0 and "person_discovery_run_events"."result_digest" is not null and "person_discovery_run_events"."reason" is not null)),
	CONSTRAINT "person_discovery_event_digest_check" CHECK("person_discovery_run_events"."result_digest" is null or (length("person_discovery_run_events"."result_digest") = 64 and "person_discovery_run_events"."result_digest" not glob '*[^0-9a-f]*')),
	CONSTRAINT "person_discovery_event_reason_check" CHECK("person_discovery_run_events"."reason" is null or length("person_discovery_run_events"."reason") between 1 and 200)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `person_discovery_event_revision_unique` ON `person_discovery_run_events` (`run_id`,`durable_revision`);--> statement-breakpoint
CREATE UNIQUE INDEX `person_discovery_event_result_unique` ON `person_discovery_run_events` (`workspace_id`,`result_digest`);--> statement-breakpoint
CREATE INDEX `person_discovery_event_state_idx` ON `person_discovery_run_events` (`workspace_id`,`state`,`created_at`);--> statement-breakpoint
CREATE TABLE `person_discovery_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`owner_subject` text NOT NULL,
	`prospect_id` text NOT NULL,
	`profile_id` text NOT NULL,
	`configuration_id` text NOT NULL,
	`configuration_digest` text NOT NULL,
	`configuration_revision` integer NOT NULL,
	`prospect_revision` integer NOT NULL,
	`workspace_revision` integer NOT NULL,
	`max_candidates` integer NOT NULL,
	`max_provenance_per_candidate` integer NOT NULL,
	`idempotency_key` text NOT NULL,
	`operation_key` text NOT NULL,
	`request_digest` text NOT NULL,
	`requested_deadline_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`prospect_id`) REFERENCES `profile_prospects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`profile_id`) REFERENCES `customer_profiles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`configuration_id`) REFERENCES `typed_configurations`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "person_discovery_run_revision_check" CHECK("person_discovery_runs"."configuration_revision" > 0 and "person_discovery_runs"."prospect_revision" > 0 and "person_discovery_runs"."workspace_revision" > 0),
	CONSTRAINT "person_discovery_run_bounds_check" CHECK("person_discovery_runs"."max_candidates" between 1 and 20 and "person_discovery_runs"."max_provenance_per_candidate" between 1 and 8 and "person_discovery_runs"."requested_deadline_at" > "person_discovery_runs"."created_at" and "person_discovery_runs"."requested_deadline_at" <= "person_discovery_runs"."created_at" + 30000),
	CONSTRAINT "person_discovery_run_text_bounds_check" CHECK(length("person_discovery_runs"."owner_subject") between 1 and 256 and length("person_discovery_runs"."idempotency_key") between 8 and 200),
	CONSTRAINT "person_discovery_run_digest_check" CHECK(length("person_discovery_runs"."operation_key") = 67 and substr("person_discovery_runs"."operation_key", 1, 3) = 'pd_' and substr("person_discovery_runs"."operation_key", 4) not glob '*[^0-9a-f]*' and length("person_discovery_runs"."request_digest") = 64 and "person_discovery_runs"."request_digest" not glob '*[^0-9a-f]*' and length("person_discovery_runs"."configuration_digest") = 64 and "person_discovery_runs"."configuration_digest" not glob '*[^0-9a-f]*')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `person_discovery_run_idempotency_unique` ON `person_discovery_runs` (`workspace_id`,`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `person_discovery_run_operation_unique` ON `person_discovery_runs` (`workspace_id`,`operation_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `person_discovery_run_digest_unique` ON `person_discovery_runs` (`workspace_id`,`request_digest`);--> statement-breakpoint
CREATE INDEX `person_discovery_run_prospect_idx` ON `person_discovery_runs` (`workspace_id`,`prospect_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `prospect_contact_role_relevance` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`prospect_id` text NOT NULL,
	`contact_id` text NOT NULL,
	`candidate_id` text NOT NULL,
	`decision_id` text NOT NULL,
	`role_title` text NOT NULL,
	`role_summary` text NOT NULL,
	`relevance_digest` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`prospect_id`) REFERENCES `profile_prospects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`candidate_id`) REFERENCES `person_discovery_candidates`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`decision_id`) REFERENCES `person_discovery_owner_decisions`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "prospect_contact_role_text_bounds_check" CHECK(length("prospect_contact_role_relevance"."role_title") between 1 and 160 and length("prospect_contact_role_relevance"."role_summary") between 1 and 1000),
	CONSTRAINT "prospect_contact_role_digest_check" CHECK(length("prospect_contact_role_relevance"."relevance_digest") = 64 and "prospect_contact_role_relevance"."relevance_digest" not glob '*[^0-9a-f]*')
);
--> statement-breakpoint
CREATE INDEX `prospect_contact_role_history_idx` ON `prospect_contact_role_relevance` (`workspace_id`,`prospect_id`,`contact_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `prospect_contact_role_decision_unique` ON `prospect_contact_role_relevance` (`decision_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `prospect_contact_role_digest_unique` ON `prospect_contact_role_relevance` (`workspace_id`,`relevance_digest`);--> statement-breakpoint
CREATE INDEX `prospect_contact_role_contact_idx` ON `prospect_contact_role_relevance` (`workspace_id`,`contact_id`,`created_at`);
--> statement-breakpoint
CREATE TRIGGER person_discovery_run_scope_guard BEFORE INSERT ON person_discovery_runs BEGIN
  SELECT RAISE(ABORT,'invalid person discovery run authority') WHERE NOT EXISTS (
    SELECT 1 FROM workspaces w
    JOIN workspace_companies wc ON wc.workspace_id=w.id
    JOIN companies company ON company.id=wc.company_id AND company.workspace_id=w.id AND company.status='active'
    JOIN profile_prospects prospect ON prospect.id=NEW.prospect_id AND prospect.workspace_id=w.id AND prospect.profile_id=NEW.profile_id AND prospect.active=1 AND prospect.state='approved' AND prospect.revision=NEW.prospect_revision
    JOIN customer_profiles profile ON profile.id=prospect.profile_id AND profile.workspace_id=w.id AND profile.lifecycle='ready'
    JOIN market_plays play ON play.id=profile.play_id AND play.workspace_id=w.id AND play.lifecycle='active'
    JOIN products product ON product.id=play.product_id AND product.workspace_id=w.id AND product.company_id=company.id AND product.lifecycle='ready'
    JOIN typed_configurations cfg ON cfg.id=NEW.configuration_id AND cfg.workspace_id=w.id AND cfg.owner_type='profile' AND cfg.owner_id=profile.id AND cfg.kind='profile_effective' AND cfg.active=1 AND cfg.digest=NEW.configuration_digest AND cfg.revision=NEW.configuration_revision
    JOIN prospecting_candidates candidate ON candidate.id=prospect.candidate_id AND candidate.workspace_id=w.id AND candidate.profile_id=profile.id AND candidate.configuration_id=cfg.id AND candidate.status IN ('observed','qualified')
    JOIN qualification_assessments assessment ON assessment.id=prospect.assessment_id AND assessment.workspace_id=w.id AND assessment.candidate_id=candidate.id AND assessment.configuration_id=cfg.id AND assessment.configuration_digest=cfg.digest AND assessment.outcome='Passed'
    JOIN prospect_review_decisions review ON review.prospect_id=prospect.id AND review.workspace_id=w.id AND review.assessment_id=assessment.id AND review.decision='approve'
    WHERE w.id=NEW.workspace_id AND w.owner_subject=NEW.owner_subject AND w.revision=NEW.workspace_revision
  );
END;
--> statement-breakpoint
CREATE TRIGGER person_discovery_event_scope_guard BEFORE INSERT ON person_discovery_run_events BEGIN
  SELECT RAISE(ABORT,'invalid person discovery event authority') WHERE NOT EXISTS (SELECT 1 FROM person_discovery_runs run WHERE run.id=NEW.run_id AND run.workspace_id=NEW.workspace_id);
  SELECT RAISE(ABORT,'invalid person discovery event transition') WHERE (NEW.durable_revision=1 AND EXISTS (SELECT 1 FROM person_discovery_run_events event WHERE event.run_id=NEW.run_id)) OR (NEW.durable_revision=2 AND NOT EXISTS (SELECT 1 FROM person_discovery_run_events event WHERE event.run_id=NEW.run_id AND event.durable_revision=1 AND event.state='requested'));
  SELECT RAISE(ABORT,'invalid person discovery completed authority') WHERE NEW.state='completed' AND NOT EXISTS (
    SELECT 1 FROM person_discovery_runs run
    JOIN workspaces w ON w.id=run.workspace_id AND w.owner_subject=run.owner_subject AND w.revision=run.workspace_revision
    JOIN workspace_companies wc ON wc.workspace_id=w.id
    JOIN companies company ON company.id=wc.company_id AND company.workspace_id=w.id AND company.status='active'
    JOIN profile_prospects prospect ON prospect.id=run.prospect_id AND prospect.workspace_id=w.id AND prospect.profile_id=run.profile_id AND prospect.active=1 AND prospect.state='approved' AND prospect.revision=run.prospect_revision
    JOIN customer_profiles profile ON profile.id=prospect.profile_id AND profile.workspace_id=w.id AND profile.lifecycle='ready'
    JOIN market_plays play ON play.id=profile.play_id AND play.workspace_id=w.id AND play.lifecycle='active'
    JOIN products product ON product.id=play.product_id AND product.workspace_id=w.id AND product.company_id=company.id AND product.lifecycle='ready'
    JOIN typed_configurations cfg ON cfg.id=run.configuration_id AND cfg.workspace_id=w.id AND cfg.owner_type='profile' AND cfg.owner_id=profile.id AND cfg.kind='profile_effective' AND cfg.active=1 AND cfg.digest=run.configuration_digest AND cfg.revision=run.configuration_revision
    JOIN prospecting_candidates candidate ON candidate.id=prospect.candidate_id AND candidate.workspace_id=w.id AND candidate.profile_id=profile.id AND candidate.configuration_id=cfg.id AND candidate.status IN ('observed','qualified')
    JOIN qualification_assessments assessment ON assessment.id=prospect.assessment_id AND assessment.workspace_id=w.id AND assessment.candidate_id=candidate.id AND assessment.configuration_id=cfg.id AND assessment.configuration_digest=cfg.digest AND assessment.outcome='Passed'
    JOIN prospect_review_decisions review ON review.prospect_id=prospect.id AND review.workspace_id=w.id AND review.assessment_id=assessment.id AND review.decision='approve'
    WHERE run.id=NEW.run_id AND run.workspace_id=NEW.workspace_id
  );
  SELECT RAISE(ABORT,'invalid person discovery candidate count') WHERE NEW.state='completed' AND NEW.candidate_count<>(SELECT count(*) FROM person_discovery_candidates WHERE run_id=NEW.run_id AND workspace_id=NEW.workspace_id);
  SELECT RAISE(ABORT,'invalid person discovery reconciliation payload') WHERE NEW.state='needs_reconciliation' AND EXISTS (SELECT 1 FROM person_discovery_candidates WHERE run_id=NEW.run_id);
END;
--> statement-breakpoint
CREATE TRIGGER person_discovery_candidate_scope_guard BEFORE INSERT ON person_discovery_candidates BEGIN
  SELECT RAISE(ABORT,'invalid person discovery candidate authority') WHERE NOT EXISTS (
    SELECT 1 FROM person_discovery_runs run
    JOIN person_discovery_run_events requested ON requested.run_id=run.id AND requested.durable_revision=1 AND requested.state='requested'
    JOIN workspaces w ON w.id=run.workspace_id AND w.owner_subject=run.owner_subject AND w.revision=run.workspace_revision
    JOIN workspace_companies wc ON wc.workspace_id=w.id
    JOIN companies company ON company.id=wc.company_id AND company.workspace_id=w.id AND company.status='active'
    JOIN profile_prospects prospect ON prospect.id=run.prospect_id AND prospect.workspace_id=w.id AND prospect.profile_id=run.profile_id AND prospect.active=1 AND prospect.state='approved' AND prospect.revision=run.prospect_revision
    JOIN customer_profiles profile ON profile.id=prospect.profile_id AND profile.workspace_id=w.id AND profile.lifecycle='ready'
    JOIN market_plays play ON play.id=profile.play_id AND play.workspace_id=w.id AND play.lifecycle='active'
    JOIN products product ON product.id=play.product_id AND product.workspace_id=w.id AND product.company_id=company.id AND product.lifecycle='ready'
    JOIN typed_configurations cfg ON cfg.id=run.configuration_id AND cfg.workspace_id=w.id AND cfg.owner_type='profile' AND cfg.owner_id=profile.id AND cfg.kind='profile_effective' AND cfg.active=1 AND cfg.digest=run.configuration_digest AND cfg.revision=run.configuration_revision
    JOIN prospecting_candidates source_candidate ON source_candidate.id=prospect.candidate_id AND source_candidate.workspace_id=w.id AND source_candidate.profile_id=profile.id AND source_candidate.configuration_id=cfg.id AND source_candidate.status IN ('observed','qualified')
    JOIN qualification_assessments assessment ON assessment.id=prospect.assessment_id AND assessment.workspace_id=w.id AND assessment.candidate_id=source_candidate.id AND assessment.configuration_id=cfg.id AND assessment.configuration_digest=cfg.digest AND assessment.outcome='Passed'
    JOIN prospect_review_decisions review ON review.prospect_id=prospect.id AND review.workspace_id=w.id AND review.assessment_id=assessment.id AND review.decision='approve'
    WHERE run.id=NEW.run_id AND run.workspace_id=NEW.workspace_id AND run.prospect_id=NEW.prospect_id AND NEW.ordinal<run.max_candidates
      AND NOT EXISTS (SELECT 1 FROM person_discovery_run_events terminal WHERE terminal.run_id=run.id AND terminal.durable_revision=2)
  );
END;
--> statement-breakpoint
CREATE TRIGGER person_discovery_provenance_scope_guard BEFORE INSERT ON person_discovery_provenance BEGIN
  SELECT RAISE(ABORT,'invalid person discovery provenance authority') WHERE NOT EXISTS (
    SELECT 1 FROM person_discovery_candidates candidate
    JOIN person_discovery_runs run ON run.id=candidate.run_id AND run.workspace_id=candidate.workspace_id
    WHERE candidate.id=NEW.candidate_id AND candidate.run_id=NEW.run_id AND candidate.workspace_id=NEW.workspace_id AND NEW.ordinal<run.max_provenance_per_candidate
      AND NOT EXISTS (SELECT 1 FROM person_discovery_run_events terminal WHERE terminal.run_id=run.id AND terminal.durable_revision=2)
  );
END;
--> statement-breakpoint
CREATE TRIGGER person_discovery_decision_scope_guard BEFORE INSERT ON person_discovery_owner_decisions BEGIN
  SELECT RAISE(ABORT,'invalid person discovery decision authority') WHERE NOT EXISTS (
    SELECT 1 FROM person_discovery_runs run
    JOIN person_discovery_run_events completed ON completed.run_id=run.id AND completed.durable_revision=2 AND completed.state='completed' AND completed.result_digest=NEW.expected_result_digest
    JOIN workspaces w ON w.id=run.workspace_id AND w.owner_subject=NEW.owner_subject AND w.revision=run.workspace_revision
    JOIN workspace_companies wc ON wc.workspace_id=w.id
    JOIN companies company ON company.id=wc.company_id AND company.workspace_id=w.id AND company.status='active'
    JOIN profile_prospects prospect ON prospect.id=run.prospect_id AND prospect.workspace_id=w.id AND prospect.profile_id=run.profile_id AND prospect.active=1 AND prospect.state='approved' AND prospect.revision=run.prospect_revision
    JOIN customer_profiles profile ON profile.id=prospect.profile_id AND profile.workspace_id=w.id AND profile.lifecycle='ready'
    JOIN market_plays play ON play.id=profile.play_id AND play.workspace_id=w.id AND play.lifecycle='active'
    JOIN products product ON product.id=play.product_id AND product.workspace_id=w.id AND product.company_id=company.id AND product.lifecycle='ready'
    JOIN typed_configurations cfg ON cfg.id=run.configuration_id AND cfg.workspace_id=w.id AND cfg.owner_type='profile' AND cfg.owner_id=profile.id AND cfg.kind='profile_effective' AND cfg.active=1 AND cfg.digest=run.configuration_digest AND cfg.revision=run.configuration_revision
    JOIN prospecting_candidates source_candidate ON source_candidate.id=prospect.candidate_id AND source_candidate.workspace_id=w.id AND source_candidate.profile_id=profile.id AND source_candidate.configuration_id=cfg.id AND source_candidate.status IN ('observed','qualified')
    JOIN qualification_assessments assessment ON assessment.id=prospect.assessment_id AND assessment.workspace_id=w.id AND assessment.candidate_id=source_candidate.id AND assessment.configuration_id=cfg.id AND assessment.configuration_digest=cfg.digest AND assessment.outcome='Passed'
    JOIN prospect_review_decisions review ON review.prospect_id=prospect.id AND review.workspace_id=w.id AND review.assessment_id=assessment.id AND review.decision='approve'
    JOIN authority_commands command ON command.id=NEW.authority_command_id AND command.workspace_id=w.id AND command.command_type='person_discovery.owner_decision' AND command.idempotency_key=NEW.idempotency_key AND command.operation_digest=NEW.decision_digest AND command.expected_revision=2 AND command.subject_type='person_discovery_run' AND command.subject_id=run.id AND command.status='accepted'
    JOIN audit_events audit ON audit.id=NEW.audit_event_id AND audit.workspace_id=w.id AND audit.actor_type='owner' AND audit.actor_id=NEW.owner_subject AND audit.action='person_discovery.owner_decided' AND audit.subject_type='person_discovery_owner_decision' AND audit.subject_id=NEW.id
    WHERE run.id=NEW.run_id AND run.workspace_id=NEW.workspace_id
  );
  SELECT RAISE(ABORT,'invalid person discovery decision candidate') WHERE NEW.decision<>'no_match' AND NOT EXISTS (SELECT 1 FROM person_discovery_candidates candidate WHERE candidate.id=NEW.candidate_id AND candidate.run_id=NEW.run_id AND candidate.workspace_id=NEW.workspace_id AND candidate.redacted_at IS NULL);
  SELECT RAISE(ABORT,'invalid person discovery decision contact') WHERE NEW.decision='link_existing' AND NOT EXISTS (SELECT 1 FROM contacts contact WHERE contact.id=NEW.contact_id AND contact.workspace_id=NEW.workspace_id);
END;
--> statement-breakpoint
CREATE TRIGGER prospect_contact_role_scope_guard BEFORE INSERT ON prospect_contact_role_relevance BEGIN
  SELECT RAISE(ABORT,'invalid prospect contact role authority') WHERE NOT EXISTS (
    SELECT 1 FROM person_discovery_owner_decisions decision
    JOIN person_discovery_runs run ON run.id=decision.run_id AND run.workspace_id=decision.workspace_id
    JOIN person_discovery_candidates candidate ON candidate.id=decision.candidate_id AND candidate.run_id=run.id AND candidate.redacted_at IS NULL
    JOIN contacts contact ON contact.id=decision.contact_id AND contact.workspace_id=run.workspace_id
    WHERE decision.id=NEW.decision_id AND decision.workspace_id=NEW.workspace_id AND decision.decision IN ('create_new','link_existing') AND run.prospect_id=NEW.prospect_id AND candidate.id=NEW.candidate_id AND contact.id=NEW.contact_id
  );
END;
--> statement-breakpoint
CREATE TRIGGER contact_verification_intent_scope_guard BEFORE INSERT ON contact_verification_intents BEGIN
  SELECT RAISE(ABORT,'invalid contact verification intent authority') WHERE NOT EXISTS (
    SELECT 1 FROM prospect_contact_role_relevance relevance
    JOIN person_discovery_owner_decisions decision ON decision.id=relevance.decision_id AND decision.workspace_id=relevance.workspace_id
    JOIN person_discovery_runs run ON run.id=decision.run_id AND run.workspace_id=decision.workspace_id
    JOIN workspaces w ON w.id=run.workspace_id AND w.owner_subject=NEW.owner_subject AND w.revision=run.workspace_revision
    JOIN workspace_companies wc ON wc.workspace_id=w.id
    JOIN companies company ON company.id=wc.company_id AND company.workspace_id=w.id AND company.status='active'
    JOIN profile_prospects prospect ON prospect.id=run.prospect_id AND prospect.workspace_id=w.id AND prospect.profile_id=run.profile_id AND prospect.active=1 AND prospect.state='approved' AND prospect.revision=run.prospect_revision
    JOIN customer_profiles profile ON profile.id=prospect.profile_id AND profile.workspace_id=w.id AND profile.lifecycle='ready'
    JOIN market_plays play ON play.id=profile.play_id AND play.workspace_id=w.id AND play.lifecycle='active'
    JOIN products product ON product.id=play.product_id AND product.workspace_id=w.id AND product.company_id=company.id AND product.lifecycle='ready'
    JOIN typed_configurations cfg ON cfg.id=run.configuration_id AND cfg.workspace_id=w.id AND cfg.owner_type='profile' AND cfg.owner_id=profile.id AND cfg.kind='profile_effective' AND cfg.active=1 AND cfg.digest=run.configuration_digest AND cfg.revision=run.configuration_revision
    JOIN prospecting_candidates source_candidate ON source_candidate.id=prospect.candidate_id AND source_candidate.workspace_id=w.id AND source_candidate.profile_id=profile.id AND source_candidate.configuration_id=cfg.id AND source_candidate.status IN ('observed','qualified')
    JOIN qualification_assessments assessment ON assessment.id=prospect.assessment_id AND assessment.workspace_id=w.id AND assessment.candidate_id=source_candidate.id AND assessment.configuration_id=cfg.id AND assessment.configuration_digest=cfg.digest AND assessment.outcome='Passed'
    JOIN prospect_review_decisions review ON review.prospect_id=prospect.id AND review.workspace_id=w.id AND review.assessment_id=assessment.id AND review.decision='approve'
    JOIN contacts contact ON contact.id=relevance.contact_id AND contact.workspace_id=w.id AND contact.revision=NEW.contact_revision
    JOIN authority_commands command ON command.id=NEW.authority_command_id AND command.workspace_id=w.id AND command.command_type='person_discovery.verification_intent' AND command.idempotency_key=NEW.idempotency_key AND command.operation_digest=NEW.intent_digest AND command.expected_revision=1 AND command.subject_type='prospect_contact_role_relevance' AND command.subject_id=relevance.id AND command.status='accepted'
    JOIN audit_events audit ON audit.id=NEW.audit_event_id AND audit.workspace_id=w.id AND audit.actor_type='owner' AND audit.actor_id=NEW.owner_subject AND audit.action='person_discovery.verification_intent' AND audit.subject_type='contact_verification_intent' AND audit.subject_id=NEW.id AND json_extract(audit.detail_json,'$.intentDigest')=NEW.intent_digest AND json_extract(audit.detail_json,'$.relevanceId')=NEW.relevance_id AND json_extract(audit.detail_json,'$.channel')=NEW.channel AND json_extract(audit.detail_json,'$.freshnessWindowMs')=NEW.freshness_window_ms AND json_extract(audit.detail_json,'$.freshnessPolicyDigest')=NEW.freshness_policy_digest
    WHERE relevance.id=NEW.relevance_id AND relevance.workspace_id=NEW.workspace_id AND relevance.prospect_id=NEW.prospect_id AND relevance.contact_id=NEW.contact_id AND relevance.decision_id=NEW.decision_id AND NEW.configuration_id=cfg.id AND NEW.configuration_digest=cfg.digest AND NEW.configuration_revision=cfg.revision AND NEW.prospect_revision=prospect.revision
  );
  SELECT RAISE(ABORT,'invalid contact verification freshness policy') WHERE NOT EXISTS (
    SELECT 1 FROM typed_configurations cfg WHERE cfg.id=NEW.configuration_id AND cfg.workspace_id=NEW.workspace_id AND cfg.digest=NEW.configuration_digest AND cfg.revision=NEW.configuration_revision AND cfg.active=1 AND (
      (NEW.intent='initial_verification' AND NEW.channel='email' AND NEW.freshness_window_ms=json_extract(cfg.manifest_json,'$.confirmedCategoryInputs.contact_strategy[0].value.mailboxVerifiedEmailFreshnessMs')) OR
      (NEW.intent='initial_verification' AND NEW.channel='phone' AND NEW.freshness_window_ms=json_extract(cfg.manifest_json,'$.confirmedCategoryInputs.contact_strategy[0].value.verifiedBusinessPhoneFreshnessMs')) OR
      (NEW.intent='stale_refresh' AND EXISTS (SELECT 1 FROM contact_point_observations observation WHERE observation.id=NEW.source_observation_id AND observation.workspace_id=NEW.workspace_id AND observation.contact_id=NEW.contact_id AND observation.kind=NEW.channel AND ((observation.verification_class='mailbox_verified' AND NEW.freshness_window_ms=json_extract(cfg.manifest_json,'$.confirmedCategoryInputs.contact_strategy[0].value.mailboxVerifiedEmailFreshnessMs')) OR (observation.verification_class='source_verified' AND observation.kind='email' AND NEW.freshness_window_ms=json_extract(cfg.manifest_json,'$.confirmedCategoryInputs.contact_strategy[0].value.sourceVerifiedEmailFreshnessMs')) OR (observation.verification_class='source_verified' AND observation.kind='phone' AND NEW.freshness_window_ms=json_extract(cfg.manifest_json,'$.confirmedCategoryInputs.contact_strategy[0].value.verifiedBusinessPhoneFreshnessMs')))))
    )
  );
  SELECT RAISE(ABORT,'invalid stale refresh source') WHERE NEW.intent='stale_refresh' AND NOT EXISTS (
    SELECT 1 FROM contact_point_observations observation WHERE observation.id=NEW.source_observation_id AND observation.workspace_id=NEW.workspace_id AND observation.contact_id=NEW.contact_id AND observation.configuration_id=NEW.configuration_id AND observation.configuration_digest=NEW.configuration_digest AND observation.kind=NEW.channel AND observation.verification_class IN ('mailbox_verified','source_verified') AND observation.verified_at IS NOT NULL AND NEW.created_at>=observation.verified_at+NEW.freshness_window_ms
  );
  SELECT RAISE(ABORT,'newer fresh contact observation exists') WHERE NEW.intent='stale_refresh' AND EXISTS (
    SELECT 1 FROM contact_point_observations newer
    JOIN contact_point_observations nominated ON nominated.id=NEW.source_observation_id AND nominated.workspace_id=NEW.workspace_id AND nominated.contact_id=NEW.contact_id
    JOIN typed_configurations cfg ON cfg.id=NEW.configuration_id AND cfg.workspace_id=NEW.workspace_id AND cfg.digest=NEW.configuration_digest AND cfg.revision=NEW.configuration_revision AND cfg.active=1
    WHERE newer.workspace_id=NEW.workspace_id AND newer.contact_id=NEW.contact_id AND newer.configuration_id=NEW.configuration_id AND newer.configuration_digest=NEW.configuration_digest AND newer.kind=NEW.channel
      AND newer.verification_class IN ('mailbox_verified','source_verified') AND newer.verified_at IS NOT NULL AND newer.verified_at>nominated.verified_at
      AND ((newer.verification_class='mailbox_verified' AND NEW.created_at<newer.verified_at+json_extract(cfg.manifest_json,'$.confirmedCategoryInputs.contact_strategy[0].value.mailboxVerifiedEmailFreshnessMs')) OR (newer.verification_class='source_verified' AND newer.kind='email' AND NEW.created_at<newer.verified_at+json_extract(cfg.manifest_json,'$.confirmedCategoryInputs.contact_strategy[0].value.sourceVerifiedEmailFreshnessMs')) OR (newer.verification_class='source_verified' AND newer.kind='phone' AND NEW.created_at<newer.verified_at+json_extract(cfg.manifest_json,'$.confirmedCategoryInputs.contact_strategy[0].value.verifiedBusinessPhoneFreshnessMs')))
  );
END;
--> statement-breakpoint
CREATE TRIGGER person_discovery_candidate_redaction_guard BEFORE UPDATE ON person_discovery_candidates BEGIN
  SELECT RAISE(ABORT,'person discovery candidate is immutable') WHERE NOT (
    OLD.redacted_at IS NULL AND NEW.redacted_at>=OLD.payload_expires_at AND NEW.candidate_key='redacted:'||OLD.id AND NEW.display_name='[redacted]' AND NEW.role_title='[redacted]' AND NEW.role_summary='[redacted]'
    AND NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.run_id IS OLD.run_id AND NEW.prospect_id IS OLD.prospect_id AND NEW.ordinal IS OLD.ordinal AND NEW.candidate_digest IS OLD.candidate_digest AND NEW.payload_expires_at IS OLD.payload_expires_at AND NEW.created_at IS OLD.created_at
    AND EXISTS (SELECT 1 FROM authority_commands command WHERE command.id=NEW.redaction_authority_command_id AND command.workspace_id=OLD.workspace_id AND command.command_type='person_discovery.retention_redact' AND command.operation_digest=OLD.candidate_digest AND command.subject_type='person_discovery_candidates' AND command.subject_id=OLD.id AND command.status='accepted')
    AND EXISTS (SELECT 1 FROM audit_events audit WHERE audit.id=NEW.redaction_audit_event_id AND audit.workspace_id=OLD.workspace_id AND audit.action='person_discovery.payload_redacted' AND audit.subject_type='person_discovery_candidates' AND audit.subject_id=OLD.id)
  );
END;
--> statement-breakpoint
CREATE TRIGGER person_discovery_provenance_redaction_guard BEFORE UPDATE ON person_discovery_provenance BEGIN
  SELECT RAISE(ABORT,'person discovery provenance is immutable') WHERE NOT (
    OLD.redacted_at IS NULL AND NEW.redacted_at>=OLD.payload_expires_at AND NEW.source_reference='[redacted]' AND NEW.excerpt='[redacted]'
    AND NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.run_id IS OLD.run_id AND NEW.candidate_id IS OLD.candidate_id AND NEW.ordinal IS OLD.ordinal AND NEW.source_digest IS OLD.source_digest AND NEW.excerpt_digest IS OLD.excerpt_digest AND NEW.retrieved_at IS OLD.retrieved_at AND NEW.provenance_digest IS OLD.provenance_digest AND NEW.payload_expires_at IS OLD.payload_expires_at AND NEW.created_at IS OLD.created_at
    AND EXISTS (SELECT 1 FROM authority_commands command WHERE command.id=NEW.redaction_authority_command_id AND command.workspace_id=OLD.workspace_id AND command.command_type='person_discovery.retention_redact' AND command.operation_digest=OLD.provenance_digest AND command.subject_type='person_discovery_provenance' AND command.subject_id=OLD.id AND command.status='accepted')
    AND EXISTS (SELECT 1 FROM audit_events audit WHERE audit.id=NEW.redaction_audit_event_id AND audit.workspace_id=OLD.workspace_id AND audit.action='person_discovery.payload_redacted' AND audit.subject_type='person_discovery_provenance' AND audit.subject_id=OLD.id)
  );
END;
--> statement-breakpoint
CREATE TRIGGER person_discovery_run_immutable_update BEFORE UPDATE ON person_discovery_runs BEGIN SELECT RAISE(ABORT,'person discovery run is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER person_discovery_run_immutable_delete BEFORE DELETE ON person_discovery_runs BEGIN SELECT RAISE(ABORT,'person discovery run is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER person_discovery_event_immutable_update BEFORE UPDATE ON person_discovery_run_events BEGIN SELECT RAISE(ABORT,'person discovery event is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER person_discovery_event_immutable_delete BEFORE DELETE ON person_discovery_run_events BEGIN SELECT RAISE(ABORT,'person discovery event is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER person_discovery_candidate_immutable_delete BEFORE DELETE ON person_discovery_candidates BEGIN SELECT RAISE(ABORT,'person discovery candidate is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER person_discovery_provenance_immutable_delete BEFORE DELETE ON person_discovery_provenance BEGIN SELECT RAISE(ABORT,'person discovery provenance is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER person_discovery_decision_immutable_update BEFORE UPDATE ON person_discovery_owner_decisions BEGIN SELECT RAISE(ABORT,'person discovery decision is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER person_discovery_decision_immutable_delete BEFORE DELETE ON person_discovery_owner_decisions BEGIN SELECT RAISE(ABORT,'person discovery decision is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER prospect_contact_role_immutable_update BEFORE UPDATE ON prospect_contact_role_relevance BEGIN SELECT RAISE(ABORT,'prospect contact role is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER prospect_contact_role_immutable_delete BEFORE DELETE ON prospect_contact_role_relevance BEGIN SELECT RAISE(ABORT,'prospect contact role is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER contact_verification_intent_immutable_update BEFORE UPDATE ON contact_verification_intents BEGIN SELECT RAISE(ABORT,'contact verification intent is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER contact_verification_intent_immutable_delete BEFORE DELETE ON contact_verification_intents BEGIN SELECT RAISE(ABORT,'contact verification intent is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER contacts_generation_person_discovery_run_insert AFTER INSERT ON person_discovery_runs BEGIN
  SELECT RAISE(ABORT,'contacts projection generation overflow') WHERE COALESCE((SELECT contacts_generation FROM contacts_projection_generations WHERE workspace_id=NEW.workspace_id),0)>=9007199254740990;
  INSERT INTO contacts_projection_generations (workspace_id,contacts_generation) VALUES (NEW.workspace_id,1) ON CONFLICT(workspace_id) DO UPDATE SET contacts_generation=contacts_generation+1;
END;
--> statement-breakpoint
CREATE TRIGGER contacts_generation_person_discovery_event_insert AFTER INSERT ON person_discovery_run_events BEGIN
  SELECT RAISE(ABORT,'contacts projection generation overflow') WHERE COALESCE((SELECT contacts_generation FROM contacts_projection_generations WHERE workspace_id=NEW.workspace_id),0)>=9007199254740990;
  INSERT INTO contacts_projection_generations (workspace_id,contacts_generation) VALUES (NEW.workspace_id,1) ON CONFLICT(workspace_id) DO UPDATE SET contacts_generation=contacts_generation+1;
END;
--> statement-breakpoint
CREATE TRIGGER contacts_generation_person_discovery_candidate_insert AFTER INSERT ON person_discovery_candidates BEGIN
  SELECT RAISE(ABORT,'contacts projection generation overflow') WHERE COALESCE((SELECT contacts_generation FROM contacts_projection_generations WHERE workspace_id=NEW.workspace_id),0)>=9007199254740990;
  INSERT INTO contacts_projection_generations (workspace_id,contacts_generation) VALUES (NEW.workspace_id,1) ON CONFLICT(workspace_id) DO UPDATE SET contacts_generation=contacts_generation+1;
END;
--> statement-breakpoint
CREATE TRIGGER contacts_generation_person_discovery_candidate_redact AFTER UPDATE ON person_discovery_candidates BEGIN
  SELECT RAISE(ABORT,'contacts projection generation overflow') WHERE COALESCE((SELECT contacts_generation FROM contacts_projection_generations WHERE workspace_id=NEW.workspace_id),0)>=9007199254740990;
  INSERT INTO contacts_projection_generations (workspace_id,contacts_generation) VALUES (NEW.workspace_id,1) ON CONFLICT(workspace_id) DO UPDATE SET contacts_generation=contacts_generation+1;
END;
--> statement-breakpoint
CREATE TRIGGER contacts_generation_person_discovery_provenance_insert AFTER INSERT ON person_discovery_provenance BEGIN
  SELECT RAISE(ABORT,'contacts projection generation overflow') WHERE COALESCE((SELECT contacts_generation FROM contacts_projection_generations WHERE workspace_id=NEW.workspace_id),0)>=9007199254740990;
  INSERT INTO contacts_projection_generations (workspace_id,contacts_generation) VALUES (NEW.workspace_id,1) ON CONFLICT(workspace_id) DO UPDATE SET contacts_generation=contacts_generation+1;
END;
--> statement-breakpoint
CREATE TRIGGER contacts_generation_person_discovery_provenance_redact AFTER UPDATE ON person_discovery_provenance BEGIN
  SELECT RAISE(ABORT,'contacts projection generation overflow') WHERE COALESCE((SELECT contacts_generation FROM contacts_projection_generations WHERE workspace_id=NEW.workspace_id),0)>=9007199254740990;
  INSERT INTO contacts_projection_generations (workspace_id,contacts_generation) VALUES (NEW.workspace_id,1) ON CONFLICT(workspace_id) DO UPDATE SET contacts_generation=contacts_generation+1;
END;
--> statement-breakpoint
CREATE TRIGGER contacts_generation_person_discovery_decision_insert AFTER INSERT ON person_discovery_owner_decisions BEGIN
  SELECT RAISE(ABORT,'contacts projection generation overflow') WHERE COALESCE((SELECT contacts_generation FROM contacts_projection_generations WHERE workspace_id=NEW.workspace_id),0)>=9007199254740990;
  INSERT INTO contacts_projection_generations (workspace_id,contacts_generation) VALUES (NEW.workspace_id,1) ON CONFLICT(workspace_id) DO UPDATE SET contacts_generation=contacts_generation+1;
END;
--> statement-breakpoint
CREATE TRIGGER contacts_generation_prospect_contact_role_insert AFTER INSERT ON prospect_contact_role_relevance BEGIN
  SELECT RAISE(ABORT,'contacts projection generation overflow') WHERE COALESCE((SELECT contacts_generation FROM contacts_projection_generations WHERE workspace_id=NEW.workspace_id),0)>=9007199254740990;
  INSERT INTO contacts_projection_generations (workspace_id,contacts_generation) VALUES (NEW.workspace_id,1) ON CONFLICT(workspace_id) DO UPDATE SET contacts_generation=contacts_generation+1;
END;
--> statement-breakpoint
CREATE TRIGGER contacts_generation_contact_verification_intent_insert AFTER INSERT ON contact_verification_intents BEGIN
  SELECT RAISE(ABORT,'contacts projection generation overflow') WHERE COALESCE((SELECT contacts_generation FROM contacts_projection_generations WHERE workspace_id=NEW.workspace_id),0)>=9007199254740990;
  INSERT INTO contacts_projection_generations (workspace_id,contacts_generation) VALUES (NEW.workspace_id,1) ON CONFLICT(workspace_id) DO UPDATE SET contacts_generation=contacts_generation+1;
END;
