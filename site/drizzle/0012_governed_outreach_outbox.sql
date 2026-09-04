CREATE TABLE `outreach_outbox_events` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`outbox_item_id` text NOT NULL,
	`revision` integer NOT NULL,
	`state` text NOT NULL,
	`lease_generation` integer NOT NULL,
	`lease_holder_id` text,
	`lease_expires_at` integer,
	`reason_code` text NOT NULL,
	`event_digest` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`outbox_item_id`) REFERENCES `outreach_outbox_items`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "outreach_outbox_event_revision_check" CHECK("outreach_outbox_events"."revision" > 0 and "outreach_outbox_events"."lease_generation" >= 0),
	CONSTRAINT "outreach_outbox_event_digest_check" CHECK(length("outreach_outbox_events"."event_digest") = 64 and "outreach_outbox_events"."event_digest" not glob '*[^0-9a-f]*'),
	CONSTRAINT "outreach_outbox_event_lease_check" CHECK(("outreach_outbox_events"."state" = 'pending' and "outreach_outbox_events"."revision" = 1 and "outreach_outbox_events"."lease_generation" = 0 and "outreach_outbox_events"."lease_holder_id" is null and "outreach_outbox_events"."lease_expires_at" is null) or ("outreach_outbox_events"."state" <> 'pending' and "outreach_outbox_events"."revision" > 1))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `outreach_outbox_event_revision_unique` ON `outreach_outbox_events` (`outbox_item_id`,`revision`);--> statement-breakpoint
CREATE UNIQUE INDEX `outreach_outbox_event_digest_unique` ON `outreach_outbox_events` (`workspace_id`,`event_digest`);--> statement-breakpoint
CREATE INDEX `outreach_outbox_event_state_idx` ON `outreach_outbox_events` (`workspace_id`,`state`,`created_at`);--> statement-breakpoint
CREATE TABLE `outreach_outbox_items` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`message_version_id` text NOT NULL,
	`message_approval_id` text NOT NULL,
	`approval_consumption_id` text NOT NULL,
	`sender_connection_id` text NOT NULL,
	`send_key` text NOT NULL,
	`dispatch_key` text NOT NULL,
	`rfc_message_id_digest` text NOT NULL,
	`marker_digest` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`message_version_id`) REFERENCES `outreach_message_versions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`message_approval_id`) REFERENCES `outreach_message_approvals`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`approval_consumption_id`) REFERENCES `outreach_message_approval_consumptions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`sender_connection_id`) REFERENCES `outreach_sender_connections`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "outreach_outbox_digest_check" CHECK(length("outreach_outbox_items"."send_key") = 64 and "outreach_outbox_items"."send_key" not glob '*[^0-9a-f]*' and length("outreach_outbox_items"."dispatch_key") = 64 and "outreach_outbox_items"."dispatch_key" not glob '*[^0-9a-f]*' and length("outreach_outbox_items"."rfc_message_id_digest") = 64 and "outreach_outbox_items"."rfc_message_id_digest" not glob '*[^0-9a-f]*' and length("outreach_outbox_items"."marker_digest") = 64 and "outreach_outbox_items"."marker_digest" not glob '*[^0-9a-f]*')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `outreach_outbox_message_approval_unique` ON `outreach_outbox_items` (`message_approval_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `outreach_outbox_consumption_unique` ON `outreach_outbox_items` (`approval_consumption_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `outreach_outbox_send_key_unique` ON `outreach_outbox_items` (`workspace_id`,`send_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `outreach_outbox_dispatch_key_unique` ON `outreach_outbox_items` (`workspace_id`,`dispatch_key`);--> statement-breakpoint
CREATE INDEX `outreach_outbox_message_idx` ON `outreach_outbox_items` (`workspace_id`,`message_version_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `outreach_sender_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`provider` text NOT NULL,
	`connection_subject_digest` text NOT NULL,
	`sender_address_digest` text NOT NULL,
	`protected_reference` text NOT NULL,
	`protected_reference_version` integer NOT NULL,
	`status` text NOT NULL,
	`verified_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "outreach_sender_connection_digest_check" CHECK(length("outreach_sender_connections"."connection_subject_digest") = 64 and "outreach_sender_connections"."connection_subject_digest" not glob '*[^0-9a-f]*' and length("outreach_sender_connections"."sender_address_digest") = 64 and "outreach_sender_connections"."sender_address_digest" not glob '*[^0-9a-f]*'),
	CONSTRAINT "outreach_sender_connection_reference_check" CHECK("outreach_sender_connections"."protected_reference_version" > 0 and length("outreach_sender_connections"."protected_reference") between 1 and 512 and "outreach_sender_connections"."verified_at" <= "outreach_sender_connections"."created_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `outreach_sender_connection_subject_version_unique` ON `outreach_sender_connections` (`workspace_id`,`provider`,`connection_subject_digest`,`protected_reference_version`);
--> statement-breakpoint
CREATE TRIGGER outreach_sender_connection_scope_guard BEFORE INSERT ON outreach_sender_connections BEGIN
  SELECT RAISE(ABORT, 'invalid outreach sender connection') WHERE
    NEW.provider <> 'gmail' OR NEW.status NOT IN ('active','revoked','degraded')
    OR NEW.protected_reference NOT LIKE 'vault-ref:%'
    OR length(trim(NEW.protected_reference)) <> length(NEW.protected_reference)
    OR NOT EXISTS (SELECT 1 FROM workspaces w WHERE w.id=NEW.workspace_id)
    OR (NEW.protected_reference_version=1 AND NEW.status<>'active')
    OR (NEW.protected_reference_version>1 AND NOT EXISTS (
      SELECT 1 FROM outreach_sender_connections prior
      WHERE prior.workspace_id=NEW.workspace_id AND prior.provider=NEW.provider
        AND prior.connection_subject_digest=NEW.connection_subject_digest
        AND prior.protected_reference_version=NEW.protected_reference_version-1
        AND prior.status<>'revoked'
        AND ((prior.status='active' AND NEW.status IN ('active','degraded','revoked'))
          OR (prior.status='degraded' AND NEW.status IN ('active','degraded','revoked')))
    ));
END;
--> statement-breakpoint
CREATE TRIGGER outreach_outbox_item_scope_guard BEFORE INSERT ON outreach_outbox_items BEGIN
  SELECT RAISE(ABORT, 'invalid outreach outbox item') WHERE NOT EXISTS (
    SELECT 1 FROM outreach_message_approval_consumptions consumption
    JOIN outreach_message_approvals approval ON approval.id=consumption.message_approval_id AND approval.workspace_id=consumption.workspace_id
    JOIN outreach_message_versions version ON version.id=approval.message_version_id AND version.workspace_id=approval.workspace_id
    JOIN outreach_sender_connections connection ON connection.id=NEW.sender_connection_id AND connection.workspace_id=approval.workspace_id
    WHERE consumption.id=NEW.approval_consumption_id AND consumption.workspace_id=NEW.workspace_id
      AND consumption.message_approval_id=NEW.message_approval_id AND consumption.send_key=NEW.send_key
      AND consumption.approval_digest=approval.approval_digest AND version.id=NEW.message_version_id
      AND approval.expires_at>NEW.created_at AND connection.status='active'
      AND NOT EXISTS (
        SELECT 1 FROM outreach_sender_connections later
        WHERE later.workspace_id=connection.workspace_id AND later.provider=connection.provider
          AND later.connection_subject_digest=connection.connection_subject_digest
          AND later.protected_reference_version>connection.protected_reference_version
      )
  );
END;
--> statement-breakpoint
CREATE TRIGGER outreach_outbox_event_scope_guard BEFORE INSERT ON outreach_outbox_events BEGIN
  SELECT RAISE(ABORT, 'invalid outreach outbox event') WHERE
    NEW.state NOT IN ('pending','leased','dispatching','sent','cancelled','failed_before_dispatch','delivery_unknown')
    OR length(NEW.reason_code)<1 OR length(NEW.reason_code)>64
    OR NOT EXISTS (SELECT 1 FROM outreach_outbox_items item WHERE item.id=NEW.outbox_item_id AND item.workspace_id=NEW.workspace_id)
    OR (NEW.revision=1 AND (NEW.state<>'pending' OR NEW.lease_generation<>0 OR NEW.lease_holder_id IS NOT NULL OR NEW.lease_expires_at IS NOT NULL))
    OR (NEW.revision>1 AND NOT EXISTS (
      SELECT 1 FROM outreach_outbox_events prior
      WHERE prior.outbox_item_id=NEW.outbox_item_id AND prior.workspace_id=NEW.workspace_id
        AND prior.revision=NEW.revision-1
        AND (
          (prior.state='pending' AND NEW.state='leased' AND NEW.lease_generation=prior.lease_generation+1
            AND NEW.lease_holder_id IS NOT NULL AND NEW.lease_expires_at>NEW.created_at)
          OR (prior.state='pending' AND NEW.state='cancelled' AND NEW.lease_generation=0
            AND NEW.lease_holder_id IS NULL AND NEW.lease_expires_at IS NULL)
          OR (prior.state='leased' AND NEW.state IN ('dispatching','cancelled','failed_before_dispatch')
            AND NEW.lease_generation=prior.lease_generation AND NEW.lease_holder_id=prior.lease_holder_id
            AND NEW.lease_expires_at=prior.lease_expires_at AND NEW.created_at<prior.lease_expires_at)
          OR (prior.state='dispatching' AND NEW.state IN ('sent','delivery_unknown','failed_before_dispatch')
            AND NEW.lease_generation=prior.lease_generation AND NEW.lease_holder_id=prior.lease_holder_id)
          OR (prior.state='delivery_unknown' AND NEW.state='sent'
            AND NEW.lease_generation=prior.lease_generation AND NEW.lease_holder_id=prior.lease_holder_id)
        )
    ));
END;
--> statement-breakpoint
CREATE TRIGGER immutable_outreach_sender_connections_update BEFORE UPDATE ON outreach_sender_connections BEGIN SELECT RAISE(ABORT, 'immutable outreach sender connection'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_outreach_sender_connections_delete BEFORE DELETE ON outreach_sender_connections BEGIN SELECT RAISE(ABORT, 'immutable outreach sender connection'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_outreach_outbox_items_update BEFORE UPDATE ON outreach_outbox_items BEGIN SELECT RAISE(ABORT, 'immutable outreach outbox item'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_outreach_outbox_items_delete BEFORE DELETE ON outreach_outbox_items BEGIN SELECT RAISE(ABORT, 'immutable outreach outbox item'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_outreach_outbox_events_update BEFORE UPDATE ON outreach_outbox_events BEGIN SELECT RAISE(ABORT, 'immutable outreach outbox event'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_outreach_outbox_events_delete BEFORE DELETE ON outreach_outbox_events BEGIN SELECT RAISE(ABORT, 'immutable outreach outbox event'); END;
