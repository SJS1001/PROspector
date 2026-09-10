-- Keep pre-existing authorizations readable as historical rows while ensuring
-- no new authorization can omit the release chain it was reviewed against.
ALTER TABLE `private_synthetic_proof_authorizations`
  ADD `migration_identity` text NOT NULL DEFAULT 'legacy-unbound';
--> statement-breakpoint
CREATE TRIGGER `private_synthetic_proof_authorization_migration_identity_insert`
BEFORE INSERT ON `private_synthetic_proof_authorizations`
WHEN NEW.`migration_identity` NOT GLOB 'canonical-chain-[0-9][0-9][0-9][0-9]-?*'
  OR NEW.`migration_identity` GLOB '*[^a-z0-9-]*'
  OR length(NEW.`migration_identity`) > 160
BEGIN
  SELECT RAISE(ABORT, 'invalid private synthetic proof migration identity');
END;
--> statement-breakpoint
CREATE TRIGGER `private_synthetic_proof_authorization_migration_identity_immutable`
BEFORE UPDATE OF `migration_identity` ON `private_synthetic_proof_authorizations`
WHEN NEW.`migration_identity` <> OLD.`migration_identity`
BEGIN
  SELECT RAISE(ABORT, 'private synthetic proof migration identity is immutable');
END;
