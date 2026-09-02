INSERT INTO `phase_activation_gates` (
	`id`,`workspace_id`,`capability`,`authorization_reference`,`target_project_deployment`,
	`reviewed_source_digest`,`migration_identity_status`,`post_migration_evidence_reference`,
	`independent_review_reference`,`deployed_boundary_proof_reference`,`tuple_digest`,`accepted_at`,`created_at`
)
SELECT 'migration-0009-runner-guard', '', 'migration_guard', '', '', '', '', '', '', '', '', 0, 0
WHERE EXISTS (SELECT 1 FROM `runner_spend_grants`) OR EXISTS (SELECT 1 FROM `runner_budget_accounts`);--> statement-breakpoint
CREATE TABLE `contact_verification_receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`reservation_id` text NOT NULL,
	`grant_id` text NOT NULL,
	`assignment_id` text NOT NULL,
	`prospect_id` text NOT NULL,
	`contact_id` text NOT NULL,
	`role` text NOT NULL,
	`configuration_id` text NOT NULL,
	`configuration_digest` text NOT NULL,
	`provider_id` text NOT NULL,
	`provider_version` text NOT NULL,
	`catalog_ref` text NOT NULL,
	`quote_revision` integer NOT NULL,
	`verifier_id` text NOT NULL,
	`verifier_version` text NOT NULL,
	`request_digest` text NOT NULL,
	`verdict_reference` text NOT NULL,
	`verdict_digest` text NOT NULL,
	`observation_id` text NOT NULL,
	`kind` text NOT NULL,
	`contact_point_digest` text NOT NULL,
	`verification_class` text NOT NULL,
	`method` text NOT NULL,
	`retrieved_at` integer NOT NULL,
	`observed_at` integer NOT NULL,
	`verified_at` integer,
	`content_hash` text NOT NULL,
	`receipt_digest` text NOT NULL,
	`attestation_key_id` text,
	`settlement_material_digest` text,
	`settlement_attestation_tag` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reservation_id`) REFERENCES `enrichment_reservations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`grant_id`) REFERENCES `enrichment_grants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`assignment_id`) REFERENCES `contact_evidence_assignments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`prospect_id`) REFERENCES `profile_prospects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`configuration_id`) REFERENCES `typed_configurations`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "contact_verification_receipt_time_check" CHECK("contact_verification_receipts"."retrieved_at" <= "contact_verification_receipts"."observed_at" and ("contact_verification_receipts"."verified_at" is null or ("contact_verification_receipts"."verified_at" >= "contact_verification_receipts"."retrieved_at" and "contact_verification_receipts"."verified_at" <= "contact_verification_receipts"."observed_at"))),
	CONSTRAINT "contact_verification_receipt_digest_check" CHECK(length("contact_verification_receipts"."configuration_digest") = 64 and "contact_verification_receipts"."configuration_digest" not glob '*[^0-9a-f]*' and length("contact_verification_receipts"."request_digest") = 64 and "contact_verification_receipts"."request_digest" not glob '*[^0-9a-f]*' and length("contact_verification_receipts"."verdict_digest") = 64 and "contact_verification_receipts"."verdict_digest" not glob '*[^0-9a-f]*' and length("contact_verification_receipts"."contact_point_digest") = 64 and "contact_verification_receipts"."contact_point_digest" not glob '*[^0-9a-f]*' and length("contact_verification_receipts"."content_hash") = 64 and "contact_verification_receipts"."content_hash" not glob '*[^0-9a-f]*' and length("contact_verification_receipts"."receipt_digest") = 64 and "contact_verification_receipts"."receipt_digest" not glob '*[^0-9a-f]*'),
	CONSTRAINT "contact_verification_receipt_attestation_shape_check" CHECK((("contact_verification_receipts"."attestation_key_id" is null and "contact_verification_receipts"."settlement_material_digest" is null and "contact_verification_receipts"."settlement_attestation_tag" is null) or ("contact_verification_receipts"."attestation_key_id" is not null and length("contact_verification_receipts"."attestation_key_id") between 1 and 128 and "contact_verification_receipts"."settlement_material_digest" is not null and length("contact_verification_receipts"."settlement_material_digest") = 64 and "contact_verification_receipts"."settlement_material_digest" not glob '*[^0-9a-f]*' and "contact_verification_receipts"."settlement_attestation_tag" is not null and length("contact_verification_receipts"."settlement_attestation_tag") = 64 and "contact_verification_receipts"."settlement_attestation_tag" not glob '*[^0-9a-f]*'))),
	CONSTRAINT "contact_verification_receipt_verified_attestation_check" CHECK("contact_verification_receipts"."verification_class" not in ('mailbox_verified','source_verified') or "contact_verification_receipts"."attestation_key_id" is not null)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `contact_verification_receipt_request_unique` ON `contact_verification_receipts` (`workspace_id`,`reservation_id`,`assignment_id`,`request_digest`);--> statement-breakpoint
CREATE UNIQUE INDEX `contact_verification_receipt_observation_unique` ON `contact_verification_receipts` (`workspace_id`,`observation_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `contact_verification_receipt_digest_unique` ON `contact_verification_receipts` (`workspace_id`,`receipt_digest`);--> statement-breakpoint
CREATE UNIQUE INDEX `contact_verification_receipt_verdict_unique` ON `contact_verification_receipts` (`workspace_id`,`verifier_id`,`verifier_version`,`verdict_digest`);--> statement-breakpoint
CREATE INDEX `contact_verification_receipt_attestation_idx` ON `contact_verification_receipts` (`workspace_id`,`attestation_key_id`,`created_at`);--> statement-breakpoint
DROP TRIGGER `runner_spend_grant_scope_guard`;--> statement-breakpoint
DROP TRIGGER `immutable_runner_grants_update`;--> statement-breakpoint
DROP TRIGGER `immutable_runner_grants_delete`;--> statement-breakpoint
DROP TRIGGER `runner_budget_account_scope_guard`;--> statement-breakpoint
DROP TRIGGER `runner_budget_account_update_guard`;--> statement-breakpoint
DROP TRIGGER `immutable_runner_budget_accounts_delete`;--> statement-breakpoint
DROP TRIGGER `runner_reservation_scope_guard`;--> statement-breakpoint
DROP TRIGGER `runner_reservation_apply`;--> statement-breakpoint
DROP TRIGGER `runner_reservation_event_scope_guard`;--> statement-breakpoint
DROP TRIGGER `runner_reservation_terminal_apply`;--> statement-breakpoint
DROP TRIGGER `enrichment_reservation_scope_guard`;--> statement-breakpoint
DROP TRIGGER `enrichment_reservation_event_guard`;--> statement-breakpoint
DROP TRIGGER `contact_observation_scope_guard`;--> statement-breakpoint
DROP TRIGGER `contact_eligibility_scope_guard`;--> statement-breakpoint
DROP TRIGGER `identity_impact_scope_guard`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_runner_spend_grants` (
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
	`source_revision` integer NOT NULL,
	`idempotency_key` text NOT NULL,
	`request_digest` text NOT NULL,
	`grant_digest` text NOT NULL,
	`authority_command_id` text NOT NULL,
	`audit_event_id` text NOT NULL,
	`nonce` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`authority_command_id`) REFERENCES `authority_commands`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`audit_event_id`) REFERENCES `audit_events`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "runner_spend_grant_bounds_check" CHECK("per_run_cost_minor" >= 0 and "monthly_cost_minor" >= "per_run_cost_minor" and "max_retries" >= 0 and "max_retries" <= 3 and "source_revision" > 0 and "expires_at" > "created_at"),
	CONSTRAINT "runner_spend_grant_currency_check" CHECK(length("currency") = 3 and "currency" = upper("currency") and "currency" not glob '*[^A-Z]*'),
	CONSTRAINT "runner_spend_grant_digest_check" CHECK(length("request_digest") = 64 and "request_digest" not glob '*[^0-9a-f]*' and length("grant_digest") = 64 and "grant_digest" not glob '*[^0-9a-f]*')
);
--> statement-breakpoint
INSERT INTO `__new_runner_spend_grants`("id", "workspace_id", "owner_subject", "provider_id", "model", "catalog_ref", "run_type", "scope_id", "per_run_cost_minor", "monthly_cost_minor", "currency", "max_retries", "source_revision", "idempotency_key", "request_digest", "grant_digest", "authority_command_id", "audit_event_id", "nonce", "expires_at", "created_at")
SELECT g."id", g."workspace_id", g."owner_subject", g."provider_id", g."model", g."catalog_ref", g."run_type", g."scope_id", g."per_run_cost_minor", g."monthly_cost_minor", g."currency", g."max_retries", w."revision", 'migration-0009-' || g."id", g."grant_digest", g."grant_digest", 'migration-0009-command-' || g."id", 'migration-0009-audit-' || g."id", g."nonce", g."expires_at", g."created_at"
FROM `runner_spend_grants` g JOIN `workspaces` w ON w."id" = g."workspace_id";--> statement-breakpoint
DROP TABLE `runner_spend_grants`;--> statement-breakpoint
ALTER TABLE `__new_runner_spend_grants` RENAME TO `runner_spend_grants`;--> statement-breakpoint
CREATE UNIQUE INDEX `runner_spend_grant_digest_unique` ON `runner_spend_grants` (`workspace_id`,`grant_digest`);--> statement-breakpoint
CREATE UNIQUE INDEX `runner_spend_grant_idempotency_unique` ON `runner_spend_grants` (`workspace_id`,`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `runner_spend_grant_request_unique` ON `runner_spend_grants` (`workspace_id`,`request_digest`);--> statement-breakpoint
CREATE INDEX `runner_spend_grant_owner_idx` ON `runner_spend_grants` (`workspace_id`,`owner_subject`,`expires_at`);--> statement-breakpoint
ALTER TABLE `contact_point_observations` ADD `verification_receipt_id` text REFERENCES contact_verification_receipts(id);--> statement-breakpoint
CREATE TABLE `__new_runner_budget_accounts` (
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
	`created_by_grant_id` text NOT NULL,
	`authority_command_id` text NOT NULL,
	`audit_event_id` text NOT NULL,
	`account_digest` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_grant_id`) REFERENCES `runner_spend_grants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`authority_command_id`) REFERENCES `authority_commands`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`audit_event_id`) REFERENCES `audit_events`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "runner_budget_account_shape_check" CHECK(("scope" = 'runner_monthly' and "period" glob '[0-9][0-9][0-9][0-9]-[0-1][0-9]' and "attempt_number" is null and "operation_key" is null) or ("scope" = 'runner_per_run' and "period" is null and "attempt_number" >= 0 and "operation_key" is not null)),
	CONSTRAINT "runner_budget_account_currency_check" CHECK(length("currency") = 3 and "currency" = upper("currency") and "currency" not glob '*[^A-Z]*'),
	CONSTRAINT "runner_budget_account_bounds_check" CHECK("actual_cost_minor" >= 0 and "reserved_cost_minor" >= 0 and "max_cost_minor" >= 0 and "actual_cost_minor" + "reserved_cost_minor" <= "max_cost_minor" and "revision" > 0),
	CONSTRAINT "runner_budget_account_digest_check" CHECK(length("account_digest") = 64 and "account_digest" not glob '*[^0-9a-f]*')
);
--> statement-breakpoint
INSERT INTO `__new_runner_budget_accounts`("id", "workspace_id", "scope", "owner_subject", "provider_id", "scope_id", "period", "attempt_number", "operation_key", "currency", "actual_cost_minor", "reserved_cost_minor", "max_cost_minor", "revision", "created_by_grant_id", "authority_command_id", "audit_event_id", "account_digest", "created_at", "updated_at")
SELECT "id", "workspace_id", "scope", "owner_subject", "provider_id", "scope_id", "period", "attempt_number", "operation_key", "currency", "actual_cost_minor", "reserved_cost_minor", "max_cost_minor", "revision", '', '', '', lower(hex(randomblob(32))), "created_at", "updated_at"
FROM `runner_budget_accounts`;--> statement-breakpoint
DROP TABLE `runner_budget_accounts`;--> statement-breakpoint
ALTER TABLE `__new_runner_budget_accounts` RENAME TO `runner_budget_accounts`;--> statement-breakpoint
CREATE UNIQUE INDEX `runner_budget_account_identity_unique` ON `runner_budget_accounts` (`workspace_id`,`scope`,`owner_subject`,`provider_id`,`scope_id`,`period`,`attempt_number`,`operation_key`,`currency`);--> statement-breakpoint
CREATE INDEX `runner_budget_account_month_idx` ON `runner_budget_accounts` (`workspace_id`,`owner_subject`,`provider_id`,`scope_id`,`period`);
--> statement-breakpoint
PRAGMA foreign_keys=ON;
--> statement-breakpoint
CREATE TRIGGER contact_verification_receipt_scope_guard BEFORE INSERT ON contact_verification_receipts BEGIN
  SELECT RAISE(ABORT, 'invalid contact verification receipt') WHERE NEW.role NOT IN ('champion','economic_buyer','general')
    OR NEW.kind NOT IN ('email','phone')
    OR NEW.verification_class NOT IN ('suggested','domain_valid','mailbox_verified','source_verified','invalid')
    OR NEW.method NOT IN ('pattern_inference','domain_validation','mailbox_verification','authoritative_source_reconfirmed')
    OR NOT EXISTS (
      SELECT 1
      FROM contact_evidence_assignments a
      JOIN enrichment_grants g ON g.id=a.grant_id AND g.workspace_id=a.workspace_id
      JOIN enrichment_reservations r ON r.id=NEW.reservation_id AND r.workspace_id=a.workspace_id
        AND r.grant_id=a.grant_id AND r.operation_key=g.operation_key
      JOIN enrichment_reservation_events latest ON latest.reservation_id=r.id AND latest.workspace_id=r.workspace_id
        AND latest.durable_revision=(SELECT max(e2.durable_revision) FROM enrichment_reservation_events e2 WHERE e2.reservation_id=r.id)
      WHERE a.id=NEW.assignment_id AND a.workspace_id=NEW.workspace_id
        AND latest.state IN ('invoking','needs_reconciliation')
        AND NEW.grant_id=a.grant_id AND NEW.prospect_id=a.prospect_id AND NEW.contact_id=a.contact_id
        AND NEW.role=a.role AND NEW.configuration_id=a.configuration_id
        AND NEW.configuration_digest=a.configuration_digest
        AND NEW.provider_id=a.provider_id AND NEW.provider_version=a.provider_version
        AND NEW.catalog_ref=a.catalog_ref AND NEW.quote_revision=a.quote_revision
        AND EXISTS (
          SELECT 1 FROM json_each(r.assignment_json,'$.evidenceAssignments') assigned
          WHERE json_extract(assigned.value,'$.assignmentId')=a.id
            AND json_extract(assigned.value,'$.prospectId')=a.prospect_id
            AND json_extract(assigned.value,'$.contactId')=a.contact_id
            AND json_extract(assigned.value,'$.role')=a.role
        )
    );
END;
--> statement-breakpoint
CREATE TRIGGER contact_observation_scope_guard BEFORE INSERT ON contact_point_observations BEGIN
  SELECT RAISE(ABORT, 'invalid contact observation') WHERE NEW.kind NOT IN ('email','phone') OR NEW.verification_class NOT IN ('suggested','domain_valid','mailbox_verified','source_verified','invalid')
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
      (NEW.verified_at IS NULL OR NEW.verifier_id IS NULL OR NEW.verifier_version IS NULL OR NEW.verdict_reference IS NULL OR NEW.verdict_digest IS NULL
        OR NEW.verification_receipt_id IS NULL OR NOT EXISTS (
          SELECT 1 FROM contact_verification_receipts receipt
          WHERE receipt.id=NEW.verification_receipt_id AND receipt.workspace_id=NEW.workspace_id
            AND receipt.assignment_id=NEW.assignment_id AND receipt.contact_id=NEW.contact_id
            AND receipt.configuration_id=NEW.configuration_id AND receipt.configuration_digest=NEW.configuration_digest
            AND receipt.observation_id=NEW.id AND receipt.kind=NEW.kind
            AND receipt.contact_point_digest=NEW.contact_point_digest
            AND receipt.verification_class=NEW.verification_class AND receipt.method=NEW.method
            AND receipt.retrieved_at=NEW.retrieved_at AND receipt.observed_at=NEW.observed_at
            AND receipt.verified_at=NEW.verified_at AND receipt.content_hash=NEW.content_hash
            AND receipt.provider_id=NEW.provider_id AND receipt.provider_version=NEW.provider_version
            AND receipt.catalog_ref=NEW.catalog_ref AND receipt.verifier_id=NEW.verifier_id
            AND receipt.verifier_version=NEW.verifier_version AND receipt.verdict_reference=NEW.verdict_reference
            AND receipt.verdict_digest=NEW.verdict_digest
        )))
    OR (NEW.verification_receipt_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM contact_verification_receipts receipt
      WHERE receipt.id=NEW.verification_receipt_id AND receipt.workspace_id=NEW.workspace_id
        AND receipt.observation_id=NEW.id AND receipt.assignment_id=NEW.assignment_id
    ))
    OR (NEW.parent_observation_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM contact_point_observations p WHERE p.id = NEW.parent_observation_id AND p.workspace_id = NEW.workspace_id AND p.contact_id = NEW.contact_id
    ));
END;
--> statement-breakpoint
CREATE TRIGGER contact_eligibility_scope_guard BEFORE INSERT ON contact_eligibility_snapshots BEGIN
  SELECT RAISE(ABORT, 'invalid contact eligibility snapshot') WHERE NEW.state NOT IN ('ContactReady','ContactSuggestion','NeedsReview','NonContactable')
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
            AND NEW.projected_at >= o.verified_at AND NEW.projected_at < o.verified_at + 2592000000)
          OR
          (o.kind IN ('email','phone') AND o.verification_class = 'source_verified'
            AND o.method = 'authoritative_source_reconfirmed' AND o.verified_at IS NOT NULL
            AND NEW.projected_at >= o.verified_at AND NEW.projected_at < o.verified_at + 7776000000)
        )
        AND (o.parent_observation_id IS NULL OR EXISTS (
          SELECT 1 FROM contact_point_observations parent
          WHERE parent.id = o.parent_observation_id AND parent.workspace_id = o.workspace_id
            AND parent.contact_id = o.contact_id AND parent.configuration_id = o.configuration_id
            AND parent.configuration_digest = o.configuration_digest
            AND parent.observed_at <= o.observed_at
        ))
      )
    ));
END;
--> statement-breakpoint
CREATE TRIGGER immutable_contact_verification_receipts_update BEFORE UPDATE ON contact_verification_receipts BEGIN SELECT RAISE(ABORT, 'immutable contact verification receipt'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_contact_verification_receipts_delete BEFORE DELETE ON contact_verification_receipts BEGIN SELECT RAISE(ABORT, 'immutable contact verification receipt'); END;
--> statement-breakpoint
CREATE TRIGGER enrichment_reservation_scope_guard BEFORE INSERT ON enrichment_reservations BEGIN
  SELECT RAISE(ABORT, 'invalid enrichment reservation authority') WHERE NOT EXISTS (
    SELECT 1 FROM enrichment_grants g
    JOIN workspaces w ON w.id = g.workspace_id
    JOIN typed_configurations c ON c.id = g.configuration_id AND c.workspace_id = g.workspace_id
    WHERE g.id = NEW.grant_id AND g.workspace_id = NEW.workspace_id
      AND g.operation_key = NEW.operation_key AND g.max_units = NEW.reserved_units
      AND g.max_cost_minor = NEW.reserved_cost_minor AND g.currency = NEW.currency AND g.expires_at = NEW.expires_at
      AND g.expires_at > NEW.created_at AND c.active = 1 AND c.digest = g.configuration_digest
      AND c.revision = g.configuration_revision AND w.revision = g.source_revision
  );
  SELECT RAISE(ABORT, 'stale enrichment prospect authority') WHERE NOT EXISTS (
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
  );
END;
--> statement-breakpoint
CREATE TRIGGER enrichment_reservation_event_guard BEFORE INSERT ON enrichment_reservation_events BEGIN
  SELECT RAISE(ABORT, 'invalid enrichment reservation lifecycle') WHERE NEW.state NOT IN ('reserved','invoking','settled','released','needs_reconciliation')
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
    OR (NEW.state = 'released' AND (
      NEW.documented_units <> 0 OR NEW.documented_cost_minor <> 0 OR NEW.observation_ids_json <> '[]'
    ))
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
    ));
END;
--> statement-breakpoint
CREATE TRIGGER identity_suggestion_shape_guard BEFORE INSERT ON identity_suggestions BEGIN
  SELECT RAISE(ABORT, 'invalid identity suggestion json') WHERE json_valid(NEW.candidate_revisions_json) <> 1
    OR json_valid(NEW.source_lineage_ids_json) <> 1
    OR json_valid(NEW.retained_identity_lineage_ids_json) <> 1
    OR json_valid(NEW.retained_aliases_json) <> 1
    OR json_valid(NEW.retained_suppression_subject_refs_json) <> 1
    OR (NEW.proposed_partition_json IS NOT NULL AND json_valid(NEW.proposed_partition_json) <> 1);
  SELECT RAISE(ABORT, 'invalid identity suggestion shape') WHERE json_type(NEW.candidate_revisions_json) IS NOT 'object'
    OR json_type(NEW.source_lineage_ids_json) IS NOT 'array'
    OR json_type(NEW.retained_identity_lineage_ids_json) IS NOT 'array'
    OR json_type(NEW.retained_aliases_json) IS NOT 'array'
    OR json_type(NEW.retained_suppression_subject_refs_json) IS NOT 'array'
    OR json(NEW.candidate_revisions_json) <> NEW.candidate_revisions_json
    OR json(NEW.source_lineage_ids_json) <> NEW.source_lineage_ids_json
    OR json(NEW.retained_identity_lineage_ids_json) <> NEW.retained_identity_lineage_ids_json
    OR json(NEW.retained_aliases_json) <> NEW.retained_aliases_json
    OR json(NEW.retained_suppression_subject_refs_json) <> NEW.retained_suppression_subject_refs_json
    OR EXISTS (SELECT 1 FROM json_each(NEW.candidate_revisions_json) WHERE key = '' OR type <> 'integer' OR value <= 0)
    OR (SELECT count(*) FROM json_each(NEW.candidate_revisions_json)) <>
      (SELECT count(DISTINCT key) FROM json_each(NEW.candidate_revisions_json))
    OR EXISTS (SELECT 1 FROM json_each(NEW.candidate_revisions_json) current
      JOIN json_each(NEW.candidate_revisions_json) next
        ON next.id=(SELECT min(later.id) FROM json_each(NEW.candidate_revisions_json) later WHERE later.id>current.id)
      WHERE current.key >= next.key)
    OR NEW.revision <> (SELECT coalesce(sum(CAST(value AS integer)),0) FROM json_each(NEW.candidate_revisions_json));
  SELECT RAISE(ABORT, 'invalid identity suggestion retention') WHERE json_array_length(NEW.source_lineage_ids_json) NOT BETWEEN 1 AND 2048
    OR json_array_length(NEW.retained_identity_lineage_ids_json) NOT BETWEEN 1 AND 2048
    OR json_array_length(NEW.retained_aliases_json) NOT BETWEEN 0 AND 2048
    OR json_array_length(NEW.retained_suppression_subject_refs_json) NOT BETWEEN 0 AND 2048
    OR EXISTS (SELECT 1 FROM json_each(NEW.source_lineage_ids_json) WHERE type <> 'text' OR value = '')
    OR EXISTS (SELECT 1 FROM json_each(NEW.retained_identity_lineage_ids_json) WHERE type <> 'text' OR value = '')
    OR EXISTS (SELECT 1 FROM json_each(NEW.retained_aliases_json) WHERE type <> 'text' OR value = '')
    OR EXISTS (SELECT 1 FROM json_each(NEW.retained_suppression_subject_refs_json) WHERE type <> 'text' OR value = '')
    OR json_array_length(NEW.source_lineage_ids_json) <> (SELECT count(DISTINCT value) FROM json_each(NEW.source_lineage_ids_json))
    OR json_array_length(NEW.retained_identity_lineage_ids_json) <> (SELECT count(DISTINCT value) FROM json_each(NEW.retained_identity_lineage_ids_json))
    OR json_array_length(NEW.retained_aliases_json) <> (SELECT count(DISTINCT value) FROM json_each(NEW.retained_aliases_json))
    OR json_array_length(NEW.retained_suppression_subject_refs_json) <> (SELECT count(DISTINCT value) FROM json_each(NEW.retained_suppression_subject_refs_json))
    OR EXISTS (SELECT 1 FROM json_each(NEW.source_lineage_ids_json) current JOIN json_each(NEW.source_lineage_ids_json) next ON next.key=current.key+1 WHERE current.value >= next.value)
    OR EXISTS (SELECT 1 FROM json_each(NEW.retained_identity_lineage_ids_json) current JOIN json_each(NEW.retained_identity_lineage_ids_json) next ON next.key=current.key+1 WHERE current.value >= next.value)
    OR EXISTS (SELECT 1 FROM json_each(NEW.retained_aliases_json) current JOIN json_each(NEW.retained_aliases_json) next ON next.key=current.key+1 WHERE current.value >= next.value)
    OR EXISTS (SELECT 1 FROM json_each(NEW.retained_suppression_subject_refs_json) current JOIN json_each(NEW.retained_suppression_subject_refs_json) next ON next.key=current.key+1 WHERE current.value >= next.value)
    OR EXISTS (SELECT 1 FROM json_each(NEW.candidate_revisions_json) candidate WHERE NOT EXISTS (
      SELECT 1 FROM json_each(NEW.retained_identity_lineage_ids_json) retained WHERE retained.value=candidate.key
    ))
    OR EXISTS (SELECT 1 FROM json_each(NEW.candidate_revisions_json) candidate WHERE NOT EXISTS (
      SELECT 1 FROM json_each(NEW.source_lineage_ids_json) retained WHERE retained.value=candidate.key
    ));
  SELECT RAISE(ABORT, 'invalid identity suggestion cardinality') WHERE (NEW.kind='merge' AND (
      (SELECT count(*) FROM json_each(NEW.candidate_revisions_json)) NOT BETWEEN 2 AND 16
      OR NEW.proposed_partition_json IS NOT NULL
    )) OR (NEW.kind='split' AND (
      (SELECT count(*) FROM json_each(NEW.candidate_revisions_json)) <> 1
      OR NEW.proposed_partition_json IS NULL
    ));
  SELECT RAISE(ABORT, 'invalid identity split partition') WHERE NEW.kind='split' AND (
      json_type(NEW.proposed_partition_json) IS NOT 'object'
      OR json(NEW.proposed_partition_json) <> NEW.proposed_partition_json
      OR (SELECT count(*) FROM json_each(NEW.proposed_partition_json)) <> 3
      OR json_type(NEW.proposed_partition_json,'$.sourceId') IS NOT 'text'
      OR json_type(NEW.proposed_partition_json,'$.newIdentityId') IS NOT 'text'
      OR json_type(NEW.proposed_partition_json,'$.moveAssociationIds') IS NOT 'array'
      OR json_extract(NEW.proposed_partition_json,'$.sourceId') = ''
      OR json_extract(NEW.proposed_partition_json,'$.newIdentityId') = ''
      OR json_extract(NEW.proposed_partition_json,'$.sourceId') = json_extract(NEW.proposed_partition_json,'$.newIdentityId')
      OR json_extract(NEW.proposed_partition_json,'$.sourceId') <> (SELECT key FROM json_each(NEW.candidate_revisions_json) LIMIT 1)
      OR json_array_length(json_extract(NEW.proposed_partition_json,'$.moveAssociationIds')) NOT BETWEEN 1 AND 128
      OR EXISTS (SELECT 1 FROM json_each(NEW.proposed_partition_json,'$.moveAssociationIds') WHERE type <> 'text' OR value = '')
      OR json_array_length(json_extract(NEW.proposed_partition_json,'$.moveAssociationIds')) <>
        (SELECT count(DISTINCT value) FROM json_each(NEW.proposed_partition_json,'$.moveAssociationIds'))
      OR EXISTS (SELECT 1 FROM json_each(NEW.proposed_partition_json,'$.moveAssociationIds') current
        JOIN json_each(NEW.proposed_partition_json,'$.moveAssociationIds') next ON next.key=current.key+1
        WHERE current.value >= next.value)
    );
END;
--> statement-breakpoint
CREATE TRIGGER identity_candidate_shape_guard BEFORE INSERT ON identity_suggestion_candidates BEGIN
  SELECT RAISE(ABORT, 'invalid identity candidate shape') WHERE NOT EXISTS (
    SELECT 1 FROM identity_suggestions s
    WHERE s.id=NEW.suggestion_id AND s.workspace_id=NEW.workspace_id
      AND EXISTS (SELECT 1 FROM json_each(s.candidate_revisions_json) candidate
        WHERE candidate.key=NEW.subject_id AND candidate.type='integer'
          AND CAST(candidate.value AS integer)=NEW.candidate_revision)
      AND NEW.ordinal=(SELECT count(*) FROM json_each(s.candidate_revisions_json) prior WHERE prior.key < NEW.subject_id)
  );
END;
--> statement-breakpoint
CREATE TRIGGER identity_impact_scope_guard BEFORE INSERT ON identity_suggestion_impacts BEGIN
  SELECT RAISE(ABORT, 'invalid identity impact scope') WHERE NEW.scope <> 'market_play' OR NOT EXISTS (
    SELECT 1 FROM identity_suggestions s
    JOIN identity_suggestion_candidates candidate
      ON candidate.suggestion_id=s.id AND candidate.workspace_id=s.workspace_id
      AND candidate.subject_id=NEW.subject_id
    WHERE s.id=NEW.suggestion_id AND s.workspace_id=NEW.workspace_id
      AND ((s.subject_kind='contact' AND EXISTS (
        SELECT 1 FROM contact_relevance relevance
        WHERE relevance.id=NEW.association_id AND relevance.workspace_id=NEW.workspace_id
          AND relevance.contact_id=NEW.subject_id AND relevance.play_id=NEW.relevance_id
      )) OR (s.subject_kind='organization' AND EXISTS (
        SELECT 1 FROM accounts account
        WHERE account.id=NEW.association_id AND account.workspace_id=NEW.workspace_id
          AND account.organization_id=NEW.subject_id AND account.play_id=NEW.relevance_id
      )))
  );
END;
--> statement-breakpoint
CREATE TRIGGER identity_decision_shape_guard BEFORE INSERT ON identity_decisions BEGIN
  SELECT RAISE(ABORT, 'invalid identity decision json') WHERE json_valid(NEW.decision_json) <> 1
    OR json_valid(NEW.retained_source_lineage_ids_json) <> 1
    OR json_valid(NEW.retained_identity_lineage_ids_json) <> 1
    OR json_valid(NEW.retained_aliases_json) <> 1
    OR json_valid(NEW.retained_suppression_subject_refs_json) <> 1
    OR json_valid(NEW.repointed_association_ids_json) <> 1
    OR json_valid(NEW.invalidations_json) <> 1;
  SELECT RAISE(ABORT, 'invalid identity decision shape') WHERE json_type(NEW.decision_json) IS NOT 'object'
    OR json_type(NEW.retained_source_lineage_ids_json) IS NOT 'array'
    OR json_type(NEW.retained_identity_lineage_ids_json) IS NOT 'array'
    OR json_type(NEW.retained_aliases_json) IS NOT 'array'
    OR json_type(NEW.retained_suppression_subject_refs_json) IS NOT 'array'
    OR json_type(NEW.repointed_association_ids_json) IS NOT 'array'
    OR json_type(NEW.invalidations_json) IS NOT 'array'
    OR json(NEW.decision_json) <> NEW.decision_json
    OR json(NEW.retained_source_lineage_ids_json) <> NEW.retained_source_lineage_ids_json
    OR json(NEW.retained_identity_lineage_ids_json) <> NEW.retained_identity_lineage_ids_json
    OR json(NEW.retained_aliases_json) <> NEW.retained_aliases_json
    OR json(NEW.retained_suppression_subject_refs_json) <> NEW.retained_suppression_subject_refs_json
    OR json(NEW.repointed_association_ids_json) <> NEW.repointed_association_ids_json
    OR json(NEW.invalidations_json) <> NEW.invalidations_json;
  SELECT RAISE(ABORT, 'invalid identity decision retention') WHERE json_array_length(NEW.retained_source_lineage_ids_json) NOT BETWEEN 1 AND 2048
    OR json_array_length(NEW.retained_identity_lineage_ids_json) NOT BETWEEN 1 AND 2048
    OR json_array_length(NEW.retained_aliases_json) NOT BETWEEN 0 AND 2048
    OR json_array_length(NEW.retained_suppression_subject_refs_json) NOT BETWEEN 0 AND 2048
    OR json_array_length(NEW.repointed_association_ids_json) NOT BETWEEN 1 AND 2048
    OR EXISTS (SELECT 1 FROM json_each(NEW.retained_source_lineage_ids_json) WHERE type <> 'text' OR value = '')
    OR EXISTS (SELECT 1 FROM json_each(NEW.retained_identity_lineage_ids_json) WHERE type <> 'text' OR value = '')
    OR EXISTS (SELECT 1 FROM json_each(NEW.retained_aliases_json) WHERE type <> 'text' OR value = '')
    OR EXISTS (SELECT 1 FROM json_each(NEW.retained_suppression_subject_refs_json) WHERE type <> 'text' OR value = '')
    OR EXISTS (SELECT 1 FROM json_each(NEW.repointed_association_ids_json) WHERE type <> 'text' OR value = '')
    OR json_array_length(NEW.retained_source_lineage_ids_json) <> (SELECT count(DISTINCT value) FROM json_each(NEW.retained_source_lineage_ids_json))
    OR json_array_length(NEW.retained_identity_lineage_ids_json) <> (SELECT count(DISTINCT value) FROM json_each(NEW.retained_identity_lineage_ids_json))
    OR json_array_length(NEW.retained_aliases_json) <> (SELECT count(DISTINCT value) FROM json_each(NEW.retained_aliases_json))
    OR json_array_length(NEW.retained_suppression_subject_refs_json) <> (SELECT count(DISTINCT value) FROM json_each(NEW.retained_suppression_subject_refs_json))
    OR json_array_length(NEW.repointed_association_ids_json) <> (SELECT count(DISTINCT value) FROM json_each(NEW.repointed_association_ids_json))
    OR EXISTS (SELECT 1 FROM json_each(NEW.retained_source_lineage_ids_json) current JOIN json_each(NEW.retained_source_lineage_ids_json) next ON next.key=current.key+1 WHERE current.value >= next.value)
    OR EXISTS (SELECT 1 FROM json_each(NEW.retained_identity_lineage_ids_json) current JOIN json_each(NEW.retained_identity_lineage_ids_json) next ON next.key=current.key+1 WHERE current.value >= next.value)
    OR EXISTS (SELECT 1 FROM json_each(NEW.retained_aliases_json) current JOIN json_each(NEW.retained_aliases_json) next ON next.key=current.key+1 WHERE current.value >= next.value)
    OR EXISTS (SELECT 1 FROM json_each(NEW.retained_suppression_subject_refs_json) current JOIN json_each(NEW.retained_suppression_subject_refs_json) next ON next.key=current.key+1 WHERE current.value >= next.value)
    OR EXISTS (SELECT 1 FROM json_each(NEW.repointed_association_ids_json) current JOIN json_each(NEW.repointed_association_ids_json) next ON next.key=current.key+1 WHERE current.value >= next.value);
  SELECT RAISE(ABORT, 'invalid identity decision authority') WHERE NOT EXISTS (
    SELECT 1 FROM identity_suggestions s
    WHERE s.id=NEW.suggestion_id AND s.workspace_id=NEW.workspace_id AND s.kind=NEW.kind
      AND NEW.retained_source_lineage_ids_json=s.source_lineage_ids_json
      AND NEW.retained_identity_lineage_ids_json=s.retained_identity_lineage_ids_json
      AND NEW.retained_aliases_json=s.retained_aliases_json
      AND NEW.retained_suppression_subject_refs_json=s.retained_suppression_subject_refs_json
      AND (SELECT count(*) FROM identity_suggestion_candidates c WHERE c.suggestion_id=s.id AND c.workspace_id=s.workspace_id)
        = (SELECT count(*) FROM json_each(s.candidate_revisions_json))
      AND NOT EXISTS (SELECT 1 FROM json_each(s.candidate_revisions_json) expected WHERE NOT EXISTS (
        SELECT 1 FROM identity_suggestion_candidates c WHERE c.suggestion_id=s.id AND c.workspace_id=s.workspace_id
          AND c.subject_id=expected.key AND c.candidate_revision=CAST(expected.value AS integer)
      ))
      AND json_array_length(NEW.repointed_association_ids_json)
        = (SELECT count(*) FROM identity_suggestion_impacts impact WHERE impact.suggestion_id=s.id AND impact.workspace_id=s.workspace_id)
      AND NOT EXISTS (SELECT 1 FROM json_each(NEW.repointed_association_ids_json) repointed WHERE NOT EXISTS (
        SELECT 1 FROM identity_suggestion_impacts impact WHERE impact.suggestion_id=s.id AND impact.workspace_id=s.workspace_id
          AND impact.association_id=repointed.value
      ))
      AND ((NEW.kind='merge'
        AND json_extract(NEW.decision_json,'$.kind')='merge'
        AND (SELECT count(*) FROM json_each(NEW.decision_json))=3
        AND json_type(NEW.decision_json,'$.primaryId')='text'
        AND json_type(NEW.decision_json,'$.secondaryIds')='array'
        AND json_array_length(json_extract(NEW.decision_json,'$.secondaryIds')) BETWEEN 1 AND 15
        AND NOT EXISTS (SELECT 1 FROM json_each(NEW.decision_json,'$.secondaryIds') secondary WHERE secondary.type <> 'text' OR secondary.value=''
          OR secondary.value=json_extract(NEW.decision_json,'$.primaryId'))
        AND json_array_length(json_extract(NEW.decision_json,'$.secondaryIds'))
          =(SELECT count(DISTINCT value) FROM json_each(NEW.decision_json,'$.secondaryIds'))
        AND NOT EXISTS (SELECT 1 FROM json_each(NEW.decision_json,'$.secondaryIds') current
          JOIN json_each(NEW.decision_json,'$.secondaryIds') next ON next.key=current.key+1 WHERE current.value >= next.value)
        AND 1 + json_array_length(json_extract(NEW.decision_json,'$.secondaryIds'))=(SELECT count(*) FROM json_each(s.candidate_revisions_json))
        AND EXISTS (SELECT 1 FROM json_each(s.candidate_revisions_json) candidate WHERE candidate.key=json_extract(NEW.decision_json,'$.primaryId'))
        AND NOT EXISTS (SELECT 1 FROM json_each(NEW.decision_json,'$.secondaryIds') secondary WHERE NOT EXISTS (
          SELECT 1 FROM json_each(s.candidate_revisions_json) candidate WHERE candidate.key=secondary.value
        ))
        AND NOT EXISTS (SELECT 1 FROM json_each(s.candidate_revisions_json) candidate
          WHERE candidate.key<>json_extract(NEW.decision_json,'$.primaryId') AND NOT EXISTS (
            SELECT 1 FROM json_each(NEW.decision_json,'$.secondaryIds') secondary WHERE secondary.value=candidate.key
          )))
      OR (NEW.kind='split'
        AND json_extract(NEW.decision_json,'$.kind')='split'
        AND (SELECT count(*) FROM json_each(NEW.decision_json))=4
        AND json_extract(NEW.decision_json,'$.sourceId')=json_extract(s.proposed_partition_json,'$.sourceId')
        AND json_extract(NEW.decision_json,'$.newIdentityId')=json_extract(s.proposed_partition_json,'$.newIdentityId')
        AND json_extract(NEW.decision_json,'$.moveAssociationIds')=json_extract(s.proposed_partition_json,'$.moveAssociationIds')))
  );
  SELECT RAISE(ABORT, 'invalid identity decision invalidations') WHERE json_array_length(NEW.invalidations_json) <> json_array_length(NEW.repointed_association_ids_json)
    OR EXISTS (
      SELECT 1 FROM json_each(NEW.invalidations_json) invalidation
      JOIN json_each(NEW.repointed_association_ids_json) repointed ON repointed.key=invalidation.key
      WHERE invalidation.type <> 'object'
        OR (SELECT count(*) FROM json_each(invalidation.value)) <> 2
        OR json_type(invalidation.value,'$.associationId') IS NOT 'text'
        OR json_type(invalidation.value,'$.projection') IS NOT 'text'
        OR json_extract(invalidation.value,'$.associationId') <> repointed.value
        OR json_extract(invalidation.value,'$.projection') <> CASE NEW.kind WHEN 'merge' THEN 'NeedsReview' ELSE 'NonContactable' END
    );
END;
--> statement-breakpoint
CREATE UNIQUE INDEX identity_lineage_edge_unique ON identity_lineage
  (workspace_id,decision_id,relationship,source_subject_id,target_subject_id);
--> statement-breakpoint
CREATE TRIGGER identity_lineage_shape_guard BEFORE INSERT ON identity_lineage BEGIN
  SELECT RAISE(ABORT, 'invalid identity lineage json') WHERE json_valid(NEW.retained_source_lineage_ids_json) <> 1
    OR json_valid(NEW.retained_identity_lineage_ids_json) <> 1
    OR json_valid(NEW.retained_aliases_json) <> 1
    OR json_valid(NEW.retained_suppression_subject_refs_json) <> 1;
  SELECT RAISE(ABORT, 'invalid identity lineage shape') WHERE json_type(NEW.retained_source_lineage_ids_json) IS NOT 'array'
    OR json_type(NEW.retained_identity_lineage_ids_json) IS NOT 'array'
    OR json_type(NEW.retained_aliases_json) IS NOT 'array'
    OR json_type(NEW.retained_suppression_subject_refs_json) IS NOT 'array'
    OR json(NEW.retained_source_lineage_ids_json) <> NEW.retained_source_lineage_ids_json
    OR json(NEW.retained_identity_lineage_ids_json) <> NEW.retained_identity_lineage_ids_json
    OR json(NEW.retained_aliases_json) <> NEW.retained_aliases_json
    OR json(NEW.retained_suppression_subject_refs_json) <> NEW.retained_suppression_subject_refs_json;
  SELECT RAISE(ABORT, 'invalid identity lineage authority') WHERE NOT EXISTS (
    SELECT 1 FROM identity_decisions d
    WHERE d.id=NEW.decision_id AND d.workspace_id=NEW.workspace_id AND d.subject_kind=NEW.subject_kind
      AND NEW.retained_source_lineage_ids_json=d.retained_source_lineage_ids_json
      AND NEW.retained_identity_lineage_ids_json=d.retained_identity_lineage_ids_json
      AND NEW.retained_aliases_json=d.retained_aliases_json
      AND NEW.retained_suppression_subject_refs_json=d.retained_suppression_subject_refs_json
      AND ((d.kind='merge' AND NEW.relationship='merged_into'
        AND NEW.target_subject_id=json_extract(d.decision_json,'$.primaryId')
        AND EXISTS (SELECT 1 FROM json_each(d.decision_json,'$.secondaryIds') secondary WHERE secondary.value=NEW.source_subject_id))
      OR (d.kind='split' AND NEW.relationship='split_from'
        AND NEW.source_subject_id=json_extract(d.decision_json,'$.sourceId')
        AND NEW.target_subject_id=json_extract(d.decision_json,'$.newIdentityId')))
  ) OR NEW.source_subject_id=NEW.target_subject_id;
END;
--> statement-breakpoint
CREATE TRIGGER runner_spend_grant_scope_guard BEFORE INSERT ON runner_spend_grants BEGIN
  SELECT RAISE(ABORT, 'invalid runner spend grant scope') WHERE NOT EXISTS (
    SELECT 1 FROM workspaces w
    JOIN authority_commands command ON command.id=NEW.authority_command_id AND command.workspace_id=w.id
      AND command.command_type='runner_spend.grant.issue' AND command.status='accepted'
      AND command.subject_type='runner_spend_grant' AND command.subject_id=NEW.id
      AND command.operation_digest=NEW.request_digest AND command.expected_revision=NEW.source_revision
    JOIN audit_events audit ON audit.id=NEW.audit_event_id AND audit.workspace_id=w.id
      AND audit.actor_type='owner' AND audit.actor_id=NEW.owner_subject
      AND audit.action='runner_spend.grant.issued' AND audit.subject_type='runner_spend_grant'
      AND audit.subject_id=NEW.id
    WHERE w.id=NEW.workspace_id AND w.owner_subject=NEW.owner_subject AND w.revision=NEW.source_revision
  );
END;
--> statement-breakpoint
CREATE TRIGGER runner_budget_account_scope_guard BEFORE INSERT ON runner_budget_accounts BEGIN
  SELECT RAISE(ABORT, 'invalid or duplicate runner budget account') WHERE NEW.scope NOT IN ('runner_per_run','runner_monthly')
    OR NEW.actual_cost_minor <> 0 OR NEW.reserved_cost_minor <> 0 OR NEW.revision <> 1
    OR NOT EXISTS (
      SELECT 1 FROM runner_spend_grants g
      WHERE g.id=NEW.created_by_grant_id AND g.workspace_id=NEW.workspace_id
        AND g.owner_subject=NEW.owner_subject AND g.provider_id=NEW.provider_id AND g.scope_id=NEW.scope_id
        AND g.currency=NEW.currency AND g.authority_command_id=NEW.authority_command_id
        AND g.audit_event_id=NEW.audit_event_id
    ) OR
    (NEW.scope = 'runner_monthly' AND EXISTS (
      SELECT 1 FROM runner_budget_accounts a WHERE a.workspace_id = NEW.workspace_id AND a.scope = 'runner_monthly'
        AND a.owner_subject = NEW.owner_subject AND a.provider_id = NEW.provider_id AND a.scope_id = NEW.scope_id
        AND a.period = NEW.period AND a.currency = NEW.currency
    )) OR (NEW.scope = 'runner_monthly' AND (CAST(substr(NEW.period, 6, 2) AS integer) < 1 OR CAST(substr(NEW.period, 6, 2) AS integer) > 12))
    OR (NEW.scope = 'runner_per_run' AND EXISTS (
      SELECT 1 FROM runner_budget_accounts a WHERE a.workspace_id = NEW.workspace_id AND a.scope = 'runner_per_run'
        AND a.owner_subject = NEW.owner_subject AND a.provider_id = NEW.provider_id AND a.scope_id = NEW.scope_id
        AND a.attempt_number = NEW.attempt_number AND a.operation_key = NEW.operation_key AND a.currency = NEW.currency
    ));
END;
--> statement-breakpoint
CREATE TRIGGER runner_budget_account_update_guard BEFORE UPDATE ON runner_budget_accounts BEGIN
  SELECT RAISE(ABORT, 'invalid runner budget mutation') WHERE NEW.id <> OLD.id OR NEW.workspace_id <> OLD.workspace_id OR NEW.scope <> OLD.scope
    OR NEW.owner_subject <> OLD.owner_subject OR NEW.provider_id <> OLD.provider_id OR NEW.scope_id <> OLD.scope_id
    OR NEW.period IS NOT OLD.period OR NEW.attempt_number IS NOT OLD.attempt_number OR NEW.operation_key IS NOT OLD.operation_key
    OR NEW.currency <> OLD.currency OR NEW.max_cost_minor <> OLD.max_cost_minor OR NEW.created_at <> OLD.created_at
    OR NEW.created_by_grant_id <> OLD.created_by_grant_id OR NEW.authority_command_id <> OLD.authority_command_id
    OR NEW.audit_event_id <> OLD.audit_event_id OR NEW.account_digest <> OLD.account_digest
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
    );
END;
--> statement-breakpoint
CREATE TRIGGER runner_reservation_scope_guard BEFORE INSERT ON runner_spend_reservations BEGIN
  SELECT RAISE(ABORT, 'invalid runner reservation authority') WHERE NOT EXISTS (
    SELECT 1 FROM runner_spend_grants g
    JOIN workspaces w ON w.id=g.workspace_id
    WHERE g.id = NEW.grant_id AND g.workspace_id = NEW.workspace_id AND g.provider_id = NEW.provider_id
      AND g.model = NEW.model AND g.catalog_ref = NEW.catalog_ref AND g.scope_id = NEW.scope_id
      AND g.run_type = NEW.run_type AND g.currency = NEW.currency AND g.per_run_cost_minor = NEW.reserved_cost_minor
      AND g.max_retries = NEW.max_retries AND NEW.attempt_number <= g.max_retries AND g.expires_at > NEW.created_at
      AND w.revision=g.source_revision
      AND NEW.operation_key GLOB 'ro_[0-9a-f]*' AND length(NEW.operation_key) = 67
      AND length(NEW.attempt_digest) = 64 AND NEW.attempt_digest NOT GLOB '*[^0-9a-f]*'
      AND NEW.period = strftime('%Y-%m', NEW.created_at / 1000, 'unixepoch')
      AND json_valid(NEW.previous_operation_keys_json) = 1 AND json_type(NEW.previous_operation_keys_json) = 'array'
      AND json_array_length(NEW.previous_operation_keys_json) = NEW.attempt_number
      AND ((NEW.attempt_number = 0 AND NEW.previous_outcome = 'none')
        OR (NEW.attempt_number > 0 AND NEW.previous_outcome = 'failed_retryable'))
  );
  SELECT RAISE(ABORT, 'invalid runner reservation accounts') WHERE NOT EXISTS (
    SELECT 1 FROM runner_spend_grants g
    JOIN runner_budget_accounts pr ON pr.id = NEW.per_run_account_id AND pr.workspace_id = g.workspace_id
    JOIN runner_budget_accounts mo ON mo.id = NEW.monthly_account_id AND mo.workspace_id = g.workspace_id
    WHERE g.id = NEW.grant_id AND g.workspace_id = NEW.workspace_id
      AND pr.scope = 'runner_per_run' AND pr.owner_subject = g.owner_subject AND pr.provider_id = g.provider_id
      AND pr.scope_id = g.scope_id AND pr.operation_key = NEW.operation_key AND pr.attempt_number = NEW.attempt_number
      AND pr.currency = g.currency AND pr.created_by_grant_id=g.id
      AND pr.authority_command_id=g.authority_command_id AND pr.audit_event_id=g.audit_event_id
      AND pr.actual_cost_minor + pr.reserved_cost_minor + NEW.reserved_cost_minor <= pr.max_cost_minor
      AND mo.scope = 'runner_monthly' AND mo.owner_subject = g.owner_subject AND mo.provider_id = g.provider_id
      AND mo.scope_id = g.scope_id AND mo.currency = g.currency AND mo.period = NEW.period
      AND pr.revision = NEW.per_run_account_expected_revision
      AND mo.revision = NEW.monthly_account_expected_revision
      AND mo.actual_cost_minor + mo.reserved_cost_minor + NEW.reserved_cost_minor <= mo.max_cost_minor
      AND mo.actual_cost_minor + mo.reserved_cost_minor + NEW.reserved_cost_minor <= g.monthly_cost_minor
  );
  SELECT RAISE(ABORT, 'invalid runner retry lineage') WHERE EXISTS (
    SELECT 1 FROM json_each(NEW.previous_operation_keys_json) history
    WHERE NOT EXISTS (
      SELECT 1 FROM runner_spend_reservations prior
      JOIN runner_spend_reservation_events ev ON ev.reservation_id = prior.id
      WHERE prior.workspace_id = NEW.workspace_id AND prior.grant_id = NEW.grant_id
        AND prior.attempt_number = CAST(history.key AS integer) AND prior.operation_key = history.value
        AND ev.durable_revision = (SELECT max(e2.durable_revision) FROM runner_spend_reservation_events e2 WHERE e2.reservation_id = prior.id)
        AND ev.state = 'failed_retryable'
    )
  );
END;
--> statement-breakpoint
CREATE TRIGGER runner_reservation_apply AFTER INSERT ON runner_spend_reservations BEGIN
  UPDATE runner_budget_accounts SET reserved_cost_minor = reserved_cost_minor + NEW.reserved_cost_minor,
    revision = revision + 1, updated_at = NEW.created_at
  WHERE id IN (NEW.per_run_account_id, NEW.monthly_account_id) AND workspace_id = NEW.workspace_id;
END;
--> statement-breakpoint
CREATE TRIGGER runner_reservation_event_scope_guard BEFORE INSERT ON runner_spend_reservation_events BEGIN
  SELECT RAISE(ABORT, 'invalid runner reservation lifecycle') WHERE NEW.state NOT IN ('reserved','assigned','failed_retryable','settled','released','needs_reconciliation')
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
    ));
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
CREATE TRIGGER immutable_runner_grants_update BEFORE UPDATE ON runner_spend_grants BEGIN SELECT RAISE(ABORT, 'immutable runner grant'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_runner_grants_delete BEFORE DELETE ON runner_spend_grants BEGIN SELECT RAISE(ABORT, 'immutable runner grant'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_runner_budget_accounts_delete BEFORE DELETE ON runner_budget_accounts BEGIN SELECT RAISE(ABORT, 'immutable runner budget account'); END;
