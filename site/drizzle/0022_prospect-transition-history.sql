CREATE TABLE `prospect_transition_events` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`prospect_id` text NOT NULL,
	`sequence` integer NOT NULL,
	`event_kind` text NOT NULL,
	`prior_state` text,
	`new_state` text NOT NULL,
	`expected_prospect_revision` integer NOT NULL,
	`actor_kind` text NOT NULL,
	`actor_reference_digest` text NOT NULL,
	`source_kind` text NOT NULL,
	`reason_code` text NOT NULL,
	`evidence_reference_id` text NOT NULL,
	`evidence_reference_digest` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`operation_digest` text NOT NULL,
	`occurred_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`prospect_id`) REFERENCES `profile_prospects`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "prospect_transition_sequence_check" CHECK("prospect_transition_events"."sequence" > 0 and "prospect_transition_events"."expected_prospect_revision" > 0),
	CONSTRAINT "prospect_transition_time_check" CHECK("prospect_transition_events"."occurred_at" <= "prospect_transition_events"."created_at"),
	CONSTRAINT "prospect_transition_state_check" CHECK("prospect_transition_events"."new_state" in ('Candidate','Qualified','NotQualified','InsufficientEvidence','Disqualified','Approved','Rejected','Deferred','ContactReady','PackageReady','ExportReady','Contacted','NeedsReview','NonContactable') and ("prospect_transition_events"."prior_state" is null or "prospect_transition_events"."prior_state" in ('Candidate','Qualified','NotQualified','InsufficientEvidence','Disqualified','Approved','Rejected','Deferred','ContactReady','PackageReady','ExportReady','Contacted','NeedsReview','NonContactable'))),
	CONSTRAINT "prospect_transition_actor_source_check" CHECK("prospect_transition_events"."actor_kind" in ('owner','application','runner','import') and "prospect_transition_events"."source_kind" in ('qualification','owner_review','contact_verification','package_readiness','export_readiness','reconciliation')),
	CONSTRAINT "prospect_transition_shape_check" CHECK(("prospect_transition_events"."event_kind" = 'prospect_created' and "prospect_transition_events"."sequence" = 1 and "prospect_transition_events"."prior_state" is null and "prospect_transition_events"."new_state" = 'Candidate') or ("prospect_transition_events"."event_kind" = 'state_transition' and "prospect_transition_events"."sequence" > 1 and "prospect_transition_events"."prior_state" is not null and "prospect_transition_events"."prior_state" <> "prospect_transition_events"."new_state")),
	CONSTRAINT "prospect_transition_digest_check" CHECK(length("prospect_transition_events"."actor_reference_digest") = 64 and "prospect_transition_events"."actor_reference_digest" not glob '*[^0-9a-f]*' and length("prospect_transition_events"."evidence_reference_digest") = 64 and "prospect_transition_events"."evidence_reference_digest" not glob '*[^0-9a-f]*' and length("prospect_transition_events"."operation_digest") = 64 and "prospect_transition_events"."operation_digest" not glob '*[^0-9a-f]*'),
	CONSTRAINT "prospect_transition_reference_check" CHECK(length("prospect_transition_events"."evidence_reference_id") between 1 and 128 and "prospect_transition_events"."evidence_reference_id" not glob '*[^A-Za-z0-9._:-]*' and length("prospect_transition_events"."reason_code") between 1 and 80 and "prospect_transition_events"."reason_code" not glob '*[^a-z0-9._:-]*' and length("prospect_transition_events"."idempotency_key") between 1 and 128 and "prospect_transition_events"."idempotency_key" not glob '*[^A-Za-z0-9._:-]*')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `prospect_transition_sequence_unique` ON `prospect_transition_events` (`prospect_id`,`sequence`);--> statement-breakpoint
CREATE UNIQUE INDEX `prospect_transition_idempotency_unique` ON `prospect_transition_events` (`workspace_id`,`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `prospect_transition_operation_unique` ON `prospect_transition_events` (`workspace_id`,`operation_digest`);--> statement-breakpoint
CREATE INDEX `prospect_transition_report_idx` ON `prospect_transition_events` (`workspace_id`,`occurred_at`,`prospect_id`,`sequence`);--> statement-breakpoint
CREATE TRIGGER `prospect_transition_scope_insert`
BEFORE INSERT ON `prospect_transition_events`
WHEN NOT EXISTS (
  SELECT 1 FROM `profile_prospects` prospect
  WHERE prospect.id = NEW.prospect_id
    AND prospect.workspace_id = NEW.workspace_id
    AND prospect.revision = NEW.expected_prospect_revision
)
BEGIN SELECT RAISE(ABORT, 'prospect transition requires exact tenant and prospect revision'); END;--> statement-breakpoint
CREATE TRIGGER `prospect_transition_continuity_insert`
BEFORE INSERT ON `prospect_transition_events`
WHEN (
  NEW.event_kind = 'prospect_created'
  AND EXISTS (SELECT 1 FROM `prospect_transition_events` prior WHERE prior.prospect_id = NEW.prospect_id)
) OR (
  NEW.event_kind = 'state_transition'
  AND NOT EXISTS (
    SELECT 1 FROM `prospect_transition_events` prior
    WHERE prior.prospect_id = NEW.prospect_id
      AND prior.workspace_id = NEW.workspace_id
      AND prior.sequence = NEW.sequence - 1
      AND prior.new_state = NEW.prior_state
      AND prior.occurred_at <= NEW.occurred_at
  )
) OR EXISTS (
  SELECT 1 FROM `prospect_transition_events` later
  WHERE later.prospect_id = NEW.prospect_id AND later.sequence >= NEW.sequence
)
BEGIN SELECT RAISE(ABORT, 'prospect transition history must be contiguous and chronological'); END;--> statement-breakpoint
CREATE TRIGGER `prospect_transition_immutable_update`
BEFORE UPDATE ON `prospect_transition_events`
BEGIN SELECT RAISE(ABORT, 'prospect transition history is immutable'); END;--> statement-breakpoint
CREATE TRIGGER `prospect_transition_immutable_delete`
BEFORE DELETE ON `prospect_transition_events`
BEGIN SELECT RAISE(ABORT, 'prospect transition history is immutable'); END;
