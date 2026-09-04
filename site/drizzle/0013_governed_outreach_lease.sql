DROP TRIGGER outreach_outbox_event_scope_guard;
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
        AND prior.revision=NEW.revision-1 AND NEW.created_at>=prior.created_at
        AND (
          (prior.state='pending' AND NEW.state='leased' AND NEW.lease_generation=prior.lease_generation+1
            AND NEW.lease_holder_id IS NOT NULL AND NEW.lease_expires_at>NEW.created_at)
          OR (prior.state='leased' AND NEW.state='leased' AND prior.lease_expires_at<=NEW.created_at
            AND NEW.lease_generation=prior.lease_generation+1 AND NEW.lease_holder_id IS NOT NULL
            AND NEW.lease_expires_at>NEW.created_at)
          OR (prior.state='failed_before_dispatch' AND NEW.state='leased'
            AND NEW.lease_generation=prior.lease_generation+1 AND NEW.lease_holder_id IS NOT NULL
            AND NEW.lease_expires_at>NEW.created_at)
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
