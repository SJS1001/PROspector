-- Candidate-only forward repair. Previously applied migration bytes remain unchanged.
-- Phase 4 records observations immutably; Passed assessment plus current approved
-- Prospect/configuration joins remain the qualification authority. Legacy qualified
-- candidate fixtures remain compatible. No runtime capability is enabled.
DROP TRIGGER enrichment_grant_prospects_scope_guard;
--> statement-breakpoint
CREATE TRIGGER enrichment_grant_prospects_scope_guard BEFORE INSERT ON enrichment_grant_prospects BEGIN
  SELECT RAISE(ABORT, 'invalid enrichment prospect authority') WHERE NOT EXISTS (
    SELECT 1 FROM enrichment_grants g
    JOIN profile_prospects p ON p.id = NEW.prospect_id AND p.workspace_id = g.workspace_id
    JOIN typed_configurations c ON c.id = NEW.configuration_id AND c.workspace_id = g.workspace_id
    JOIN prospecting_candidates pc ON pc.id = p.candidate_id AND pc.workspace_id = p.workspace_id
      AND pc.profile_id = p.profile_id AND pc.configuration_id = NEW.configuration_id AND pc.status IN ('observed','qualified')
    JOIN qualification_assessments qa ON qa.id = p.assessment_id AND qa.workspace_id = p.workspace_id
      AND qa.candidate_id = pc.id AND qa.configuration_id = NEW.configuration_id
      AND qa.configuration_digest = NEW.configuration_digest AND qa.outcome = 'Passed'
    WHERE g.id = NEW.grant_id AND g.workspace_id = NEW.workspace_id AND p.state = 'approved' AND p.active = 1
      AND p.revision = NEW.prospect_revision AND g.configuration_id = NEW.configuration_id
      AND g.configuration_digest = NEW.configuration_digest AND c.digest = NEW.configuration_digest
      AND c.revision = g.configuration_revision AND c.active = 1
  );
END;
--> statement-breakpoint
DROP TRIGGER enrichment_reservation_scope_guard;
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
        OR pc.status NOT IN ('observed','qualified') OR qa.id IS NULL OR qa.candidate_id <> pc.id
        OR qa.configuration_id <> gp.configuration_id OR qa.configuration_digest <> gp.configuration_digest
        OR qa.outcome <> 'Passed' OR g.configuration_id <> gp.configuration_id
        OR g.configuration_digest <> gp.configuration_digest)
  );
END;
--> statement-breakpoint
DROP TRIGGER contact_eligibility_scope_guard;
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
        AND pc.profile_id = p.profile_id AND pc.configuration_id = cfg.id AND pc.status IN ('observed','qualified')
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
