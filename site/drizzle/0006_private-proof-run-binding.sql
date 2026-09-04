ALTER TABLE `private_synthetic_proof_authorizations` ADD COLUMN `run_id` text;--> statement-breakpoint
ALTER TABLE `private_synthetic_proof_authorizations` ADD COLUMN `configuration_id` text;--> statement-breakpoint
ALTER TABLE `private_synthetic_proof_authorizations` ADD COLUMN `configuration_digest` text;--> statement-breakpoint
DROP INDEX `private_synthetic_proof_authorization_evidence_unique`;--> statement-breakpoint
CREATE UNIQUE INDEX `private_synthetic_proof_authorization_evidence_run_unique`
  ON `private_synthetic_proof_authorizations` (`workspace_id`,`evidence_reference`,`run_id`,`configuration_id`,`configuration_digest`);--> statement-breakpoint

CREATE TRIGGER `private_synthetic_proof_authorization_run_binding_insert`
BEFORE INSERT ON `private_synthetic_proof_authorizations`
WHEN NEW.run_id IS NULL
  OR NEW.configuration_id IS NULL
  OR length(NEW.configuration_digest) <> 64
  OR NEW.configuration_digest glob '*[^0-9a-f]*'
  OR NOT EXISTS (
    SELECT 1 FROM `product_discovery_runs` r
    JOIN `typed_configurations` c ON c.id = r.configuration_id
      AND c.workspace_id = r.workspace_id AND c.digest = r.configuration_digest
      AND c.owner_type = 'product' AND c.owner_id = r.product_id
      AND c.kind = 'product_discovery' AND c.active = 1
    WHERE r.id = NEW.run_id
      AND r.workspace_id = NEW.workspace_id
      AND r.product_id = NEW.product_id
      AND r.configuration_id = NEW.configuration_id
      AND r.configuration_digest = NEW.configuration_digest
      AND r.execution_state IN ('blocked_missing_capability', 'queued', 'running')
  )
BEGIN SELECT RAISE(ABORT, 'private synthetic proof requires an exact active run configuration binding'); END;--> statement-breakpoint

CREATE TRIGGER `private_synthetic_proof_consumption_run_binding_insert`
BEFORE INSERT ON `private_synthetic_proof_consumptions`
WHEN NOT EXISTS (
  SELECT 1 FROM `private_synthetic_proof_authorizations` a
  JOIN `product_discovery_runs` r ON r.id = a.run_id
    AND r.workspace_id = a.workspace_id AND r.product_id = a.product_id
    AND r.configuration_id = a.configuration_id AND r.configuration_digest = a.configuration_digest
  JOIN `typed_configurations` c ON c.id = a.configuration_id
    AND c.workspace_id = a.workspace_id AND c.digest = a.configuration_digest
    AND c.owner_type = 'product' AND c.owner_id = a.product_id
    AND c.kind = 'product_discovery' AND c.active = 1
  JOIN `product_discovery_submissions` s ON s.id = NEW.winner_submission_id
    AND s.workspace_id = a.workspace_id AND s.run_id = a.run_id
    AND s.configuration_id = a.configuration_id AND s.operation_digest = NEW.operation_digest
  WHERE a.id = NEW.authorization_id
    AND a.workspace_id = NEW.workspace_id
    AND a.product_id = NEW.product_id
    AND NEW.winner_run_id = a.run_id
)
BEGIN SELECT RAISE(ABORT, 'private synthetic proof consumption must use its exact authorization run binding'); END;
