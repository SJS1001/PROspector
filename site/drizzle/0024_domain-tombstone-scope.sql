CREATE TABLE `outreach_contact_point_domains` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`contact_point_digest` text NOT NULL,
	`domain_digests_json` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "outreach_contact_point_domain_digest_check" CHECK(length("outreach_contact_point_domains"."contact_point_digest") = 64 and "outreach_contact_point_domains"."contact_point_digest" not glob '*[^0-9a-f]*' and "outreach_contact_point_domains"."created_at" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `outreach_contact_point_domain_point_unique` ON `outreach_contact_point_domains` (`workspace_id`,`contact_point_digest`);
--> statement-breakpoint
CREATE TRIGGER outreach_contact_point_domain_scope_guard BEFORE INSERT ON outreach_contact_point_domains BEGIN
  SELECT RAISE(ABORT, 'invalid outreach contact point domain') WHERE json_valid(NEW.domain_digests_json)<>1;
  SELECT RAISE(ABORT, 'invalid outreach contact point domain') WHERE json_type(NEW.domain_digests_json)<>'array'
    OR json_array_length(NEW.domain_digests_json)<1 OR json_array_length(NEW.domain_digests_json)>7
    OR EXISTS (SELECT 1 FROM json_each(NEW.domain_digests_json) d WHERE d.type<>'text' OR length(d.value)<>64 OR d.value GLOB '*[^0-9a-f]*')
    OR (SELECT count(*) FROM json_each(NEW.domain_digests_json))<>(SELECT count(DISTINCT value) FROM json_each(NEW.domain_digests_json))
    OR NOT EXISTS (SELECT 1 FROM contact_point_observations o WHERE o.workspace_id=NEW.workspace_id
      AND o.contact_point_digest=NEW.contact_point_digest AND o.kind='email');
END;
--> statement-breakpoint
CREATE TRIGGER immutable_outreach_contact_point_domains_update BEFORE UPDATE ON outreach_contact_point_domains BEGIN SELECT RAISE(ABORT, 'immutable outreach contact point domain'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_outreach_contact_point_domains_delete BEFORE DELETE ON outreach_contact_point_domains BEGIN SELECT RAISE(ABORT, 'immutable outreach contact point domain'); END;
--> statement-breakpoint
DROP TRIGGER outreach_package_approval_current_guard;
--> statement-breakpoint
CREATE TRIGGER outreach_package_approval_current_guard BEFORE INSERT ON outreach_package_approvals BEGIN
  SELECT RAISE(ABORT, 'stale outreach candidate ancestry') WHERE NOT EXISTS (
    SELECT 1 FROM outreach_package_versions pv
    JOIN outreach_packages op ON op.id=pv.package_id AND op.workspace_id=pv.workspace_id
    JOIN profile_prospects p ON p.id=op.prospect_id AND p.workspace_id=op.workspace_id
    JOIN prospecting_candidates candidate ON candidate.id=p.candidate_id AND candidate.workspace_id=p.workspace_id
    WHERE pv.id=NEW.package_version_id AND pv.workspace_id=NEW.workspace_id
      AND candidate.profile_id=op.profile_id AND candidate.configuration_id=pv.configuration_id
      AND candidate.status IN ('observed','qualified')
  );
  SELECT RAISE(ABORT, 'unresolved outreach suppression scope') WHERE EXISTS (
    SELECT 1 FROM outreach_suppression_tombstones s WHERE s.workspace_id=NEW.workspace_id
      AND s.effective_at<=NEW.created_at AND (s.subject_kind='organization'
        OR (s.subject_kind='confirmed_email_domain' AND (
          EXISTS (SELECT 1 FROM outreach_artifact_bindings b
            JOIN contact_point_observations o ON o.id=b.binding_id
            LEFT JOIN outreach_contact_point_domains point_domain ON point_domain.workspace_id=NEW.workspace_id
              AND point_domain.contact_point_digest=o.contact_point_digest
            WHERE b.workspace_id=NEW.workspace_id AND b.artifact_kind='package_version'
              AND b.artifact_id=NEW.package_version_id AND b.binding_kind='contact_observation'
              AND o.kind='email' AND (point_domain.id IS NULL
                OR EXISTS (SELECT 1 FROM json_each(point_domain.domain_digests_json) scope_domain
                  WHERE scope_domain.value=s.subject_digest
                    OR EXISTS (SELECT 1 FROM json_each(s.alias_snapshot_json) a WHERE a.value=scope_domain.value)))))))
  );
  SELECT RAISE(ABORT, 'stale or prohibited outreach authority') WHERE NOT EXISTS (SELECT 1 FROM outreach_package_versions pv
    JOIN outreach_packages op ON op.id=pv.package_id AND op.workspace_id=pv.workspace_id
    JOIN profile_prospects p ON p.id=op.prospect_id AND p.workspace_id=op.workspace_id
    JOIN customer_profiles cp ON cp.id=op.profile_id AND cp.workspace_id=op.workspace_id
    JOIN market_plays mp ON mp.id=cp.play_id AND mp.workspace_id=cp.workspace_id
    JOIN products product ON product.id=mp.product_id AND product.workspace_id=mp.workspace_id
    JOIN companies company ON company.id=product.company_id AND company.workspace_id=product.workspace_id
    JOIN contacts c ON c.id=op.contact_id AND c.workspace_id=op.workspace_id AND c.company_id=company.id
    JOIN typed_configurations cfg ON cfg.id=pv.configuration_id AND cfg.workspace_id=pv.workspace_id
    JOIN contact_eligibility_snapshots ces ON ces.id=pv.contact_eligibility_snapshot_id AND ces.workspace_id=pv.workspace_id
    JOIN qualification_assessments q ON q.id=p.assessment_id AND q.workspace_id=p.workspace_id
    WHERE pv.id=NEW.package_version_id AND pv.workspace_id=NEW.workspace_id
      AND p.profile_id=op.profile_id AND p.state='approved' AND p.active=1 AND p.revision=pv.prospect_revision AND c.revision=pv.contact_revision
      AND cp.lifecycle='ready' AND mp.lifecycle='active' AND product.lifecycle='ready' AND company.status='active'
      AND cfg.active=1 AND cfg.owner_type='profile' AND cfg.owner_id=op.profile_id AND cfg.kind='profile_effective'
      AND cfg.digest=pv.configuration_digest AND cfg.revision=pv.configuration_revision
      AND q.candidate_id=p.candidate_id AND q.configuration_id=cfg.id AND q.configuration_digest=cfg.digest AND q.outcome='Passed'
      AND ces.contact_id=c.id AND ces.prospect_id=p.id AND ces.configuration_id=cfg.id
      AND ces.configuration_digest=cfg.digest AND ces.configuration_revision=cfg.revision AND ces.prospect_revision=p.revision
      AND ces.state='ContactReady' AND ces.eligible=1 AND ces.projected_at<=NEW.created_at
      AND json_array_length(ces.preserved_suppression_refs_json)=0
      AND NOT EXISTS (SELECT 1 FROM contact_eligibility_snapshots later WHERE later.workspace_id=p.workspace_id
        AND later.contact_id=c.id AND later.prospect_id=p.id AND later.id<>ces.id AND later.projected_at>=ces.projected_at)
  );
  SELECT RAISE(ABORT, 'stale or prohibited outreach authority') WHERE NOT EXISTS (SELECT 1 FROM outreach_package_versions pv
    JOIN outreach_packages op ON op.id=pv.package_id AND op.workspace_id=pv.workspace_id
    JOIN profile_prospects p ON p.id=op.prospect_id AND p.workspace_id=op.workspace_id
    JOIN contacts c ON c.id=op.contact_id AND c.workspace_id=op.workspace_id
    JOIN typed_configurations cfg ON cfg.id=pv.configuration_id AND cfg.workspace_id=pv.workspace_id
    JOIN contact_eligibility_snapshots ces ON ces.id=pv.contact_eligibility_snapshot_id AND ces.workspace_id=pv.workspace_id
    WHERE pv.id=NEW.package_version_id AND pv.workspace_id=NEW.workspace_id
      AND NOT EXISTS (SELECT 1 FROM outreach_package_versions later WHERE later.package_id=pv.package_id AND later.version>pv.version)
      AND EXISTS (SELECT 1 FROM outreach_audit_records ar WHERE ar.workspace_id=pv.workspace_id AND ar.subject_kind='package_version' AND ar.subject_id=pv.id AND ar.action='package.version.created')
      AND EXISTS (SELECT 1 FROM outreach_artifact_bindings b JOIN prospect_review_decisions r ON r.id=b.binding_id
        WHERE b.artifact_id=pv.id AND b.artifact_kind='package_version' AND b.binding_kind='review_decision'
          AND r.prospect_id=p.id AND r.assessment_id=p.assessment_id AND r.decision='approve' AND r.decision_digest=b.binding_digest
          AND NOT EXISTS (SELECT 1 FROM prospect_review_decisions later WHERE later.workspace_id=r.workspace_id AND later.prospect_id=p.id
            AND later.id<>r.id AND later.created_at>=r.created_at))
      AND NOT EXISTS (SELECT 1 FROM outreach_artifact_bindings b JOIN sources s ON s.id=b.binding_id
        WHERE b.artifact_id=pv.id AND b.artifact_kind='package_version' AND b.binding_kind='source' AND (s.status<>'available' OR s.source_digest<>b.binding_digest))
      AND NOT EXISTS (SELECT 1 FROM outreach_artifact_bindings b JOIN knowledge_versions k ON k.id=b.binding_id
        WHERE b.artifact_id=pv.id AND b.artifact_kind='package_version' AND b.binding_kind='claim_guardrail' AND (k.status<>'confirmed' OR k.value_digest<>b.binding_digest))
      AND NOT EXISTS (SELECT 1 FROM knowledge_drifts d WHERE d.workspace_id=pv.workspace_id AND d.status IN ('open','reviewed','contained')
        AND (EXISTS (SELECT 1 FROM configuration_knowledge_dependencies dep WHERE dep.configuration_id=cfg.id AND dep.knowledge_version_id=d.current_version_id)
          OR EXISTS (SELECT 1 FROM outreach_artifact_bindings b WHERE b.artifact_id=pv.id AND b.artifact_kind='package_version' AND b.binding_kind='claim_guardrail' AND b.binding_id=d.current_version_id)))
      AND json_array_length(pv.snapshot_json,'$.selectedContactPointDigests')>0
  );
  SELECT RAISE(ABORT, 'stale outreach contact evidence') WHERE EXISTS (
    SELECT 1 FROM outreach_package_versions pv
    JOIN outreach_packages op ON op.id=pv.package_id AND op.workspace_id=pv.workspace_id
    JOIN json_each(pv.snapshot_json,'$.selectedContactPointDigests') selected
    WHERE pv.id=NEW.package_version_id AND pv.workspace_id=NEW.workspace_id AND NOT EXISTS (
        SELECT 1 FROM outreach_artifact_bindings b
        JOIN contact_point_observations o ON o.id=b.binding_id AND o.workspace_id=pv.workspace_id
        JOIN contact_evidence_assignments a ON a.id=o.assignment_id AND a.workspace_id=pv.workspace_id
        JOIN contact_verification_receipts vr ON vr.id=o.verification_receipt_id AND vr.workspace_id=pv.workspace_id
        WHERE b.artifact_kind='package_version' AND b.artifact_id=pv.id AND b.binding_kind='contact_observation'
          AND b.binding_digest=o.observation_digest AND o.contact_id=op.contact_id AND o.configuration_id=pv.configuration_id AND o.configuration_digest=pv.configuration_digest
          AND a.prospect_id=op.prospect_id AND a.contact_id=op.contact_id AND a.configuration_id=pv.configuration_id
          AND o.contact_point_digest=selected.value AND o.verified_at<=NEW.created_at
          AND vr.observation_id=o.id AND vr.receipt_digest IS NOT NULL AND vr.attestation_key_id IS NOT NULL
          AND ((o.kind='email' AND o.verification_class='mailbox_verified' AND o.method='mailbox_verification' AND o.verified_at+2592000000>NEW.created_at)
            OR (o.verification_class='source_verified' AND o.method='authoritative_source_reconfirmed' AND o.verified_at+7776000000>NEW.created_at))
          AND NOT EXISTS (SELECT 1 FROM contact_point_observations later WHERE later.workspace_id=o.workspace_id AND later.contact_id=o.contact_id
            AND later.contact_point_digest=o.contact_point_digest AND later.id<>o.id AND later.observed_at>=o.observed_at)
    )
  );
  SELECT RAISE(ABORT, 'stale or prohibited outreach authority') WHERE NOT EXISTS (SELECT 1 FROM outreach_package_versions pv
    JOIN outreach_packages op ON op.id=pv.package_id AND op.workspace_id=pv.workspace_id
    JOIN profile_prospects p ON p.id=op.prospect_id AND p.workspace_id=op.workspace_id
    JOIN contacts c ON c.id=op.contact_id AND c.workspace_id=op.workspace_id
    JOIN typed_configurations cfg ON cfg.id=pv.configuration_id AND cfg.workspace_id=pv.workspace_id
    JOIN contact_eligibility_snapshots ces ON ces.id=pv.contact_eligibility_snapshot_id AND ces.workspace_id=pv.workspace_id
    WHERE pv.id=NEW.package_version_id AND pv.workspace_id=NEW.workspace_id
      AND NOT EXISTS (SELECT 1 FROM outreach_suppression_tombstones s WHERE s.workspace_id=pv.workspace_id AND s.effective_at<=NEW.created_at AND (
        s.subject_kind='company'
        OR (s.subject_kind='contact' AND (s.channel='all' OR EXISTS (SELECT 1 FROM outreach_artifact_bindings b JOIN contact_point_observations o ON o.id=b.binding_id
          WHERE b.artifact_kind='package_version' AND b.artifact_id=pv.id AND b.binding_kind='contact_observation' AND o.kind=s.channel))
          AND (s.subject_digest=c.identity_digest OR EXISTS (SELECT 1 FROM json_each(s.alias_snapshot_json) a WHERE a.value=c.identity_digest)))
        OR (s.subject_kind IN ('exact_email','e164_phone') AND EXISTS (
          SELECT 1 FROM outreach_artifact_bindings b JOIN contact_point_observations o ON o.id=b.binding_id
          WHERE b.artifact_kind='package_version' AND b.artifact_id=pv.id AND b.binding_kind='contact_observation'
            AND ((s.subject_kind='exact_email' AND o.kind='email') OR (s.subject_kind='e164_phone' AND o.kind='phone'))
            AND (s.subject_digest=o.contact_point_digest OR EXISTS (SELECT 1 FROM json_each(s.alias_snapshot_json) a WHERE a.value=o.contact_point_digest))
        ))
      ))
  );
  SELECT RAISE(ABORT, 'stale or prohibited outreach authority') WHERE NOT EXISTS (SELECT 1 FROM outreach_package_versions pv
    JOIN outreach_packages op ON op.id=pv.package_id AND op.workspace_id=pv.workspace_id
    JOIN profile_prospects p ON p.id=op.prospect_id AND p.workspace_id=op.workspace_id
    JOIN contacts c ON c.id=op.contact_id AND c.workspace_id=op.workspace_id
    JOIN typed_configurations cfg ON cfg.id=pv.configuration_id AND cfg.workspace_id=pv.workspace_id
    JOIN contact_eligibility_snapshots ces ON ces.id=pv.contact_eligibility_snapshot_id AND ces.workspace_id=pv.workspace_id
    WHERE pv.id=NEW.package_version_id AND pv.workspace_id=NEW.workspace_id
      AND NOT EXISTS (SELECT 1 FROM outreach_stop_events stop WHERE stop.workspace_id=pv.workspace_id AND stop.stop_kind<>'suppression' AND stop.effective_at<=NEW.created_at
        AND ((stop.subject_kind='company') OR (stop.subject_kind='contact' AND stop.subject_digest=c.identity_digest)
          OR EXISTS (SELECT 1 FROM json_each(pv.snapshot_json,'$.selectedContactPointDigests') point WHERE point.value=stop.subject_digest)))
  );
END;
--> statement-breakpoint
DROP TRIGGER outreach_message_approval_current_guard;
--> statement-breakpoint
CREATE TRIGGER outreach_message_approval_current_guard BEFORE INSERT ON outreach_message_approvals BEGIN
  SELECT RAISE(ABORT, 'stale outreach candidate ancestry') WHERE NOT EXISTS (
    SELECT 1 FROM outreach_package_versions pv
    JOIN outreach_packages op ON op.id=pv.package_id AND op.workspace_id=pv.workspace_id
    JOIN profile_prospects p ON p.id=op.prospect_id AND p.workspace_id=op.workspace_id
    JOIN prospecting_candidates candidate ON candidate.id=p.candidate_id AND candidate.workspace_id=p.workspace_id
    WHERE pv.id=(SELECT package_version_id FROM outreach_message_versions WHERE id=NEW.message_version_id AND workspace_id=NEW.workspace_id) AND pv.workspace_id=NEW.workspace_id
      AND candidate.profile_id=op.profile_id AND candidate.configuration_id=pv.configuration_id
      AND candidate.status IN ('observed','qualified')
  );
  SELECT RAISE(ABORT, 'unresolved outreach suppression scope') WHERE EXISTS (
    SELECT 1 FROM outreach_suppression_tombstones s WHERE s.workspace_id=NEW.workspace_id
      AND s.effective_at<=NEW.created_at AND (s.subject_kind='organization'
        OR (s.subject_kind='confirmed_email_domain' AND (
          NOT EXISTS (SELECT 1 FROM outreach_artifact_bindings b
            JOIN contact_point_observations o ON o.id=b.binding_id
            WHERE b.workspace_id=NEW.workspace_id AND b.artifact_kind='package_version'
              AND b.artifact_id=(SELECT package_version_id FROM outreach_message_versions WHERE id=NEW.message_version_id AND workspace_id=NEW.workspace_id) AND b.binding_kind='contact_observation'
              AND o.kind='email')
          OR EXISTS (SELECT 1 FROM outreach_artifact_bindings b
            JOIN contact_point_observations o ON o.id=b.binding_id
            LEFT JOIN outreach_contact_point_domains point_domain ON point_domain.workspace_id=NEW.workspace_id
              AND point_domain.contact_point_digest=o.contact_point_digest
            WHERE b.workspace_id=NEW.workspace_id AND b.artifact_kind='package_version'
              AND b.artifact_id=(SELECT package_version_id FROM outreach_message_versions WHERE id=NEW.message_version_id AND workspace_id=NEW.workspace_id) AND b.binding_kind='contact_observation'
              AND o.kind='email' AND (point_domain.id IS NULL
                OR EXISTS (SELECT 1 FROM json_each(point_domain.domain_digests_json) scope_domain
                  WHERE scope_domain.value=s.subject_digest
                    OR EXISTS (SELECT 1 FROM json_each(s.alias_snapshot_json) a WHERE a.value=scope_domain.value)))))))
  );
  SELECT RAISE(ABORT, 'stale outreach message version') WHERE EXISTS (
    SELECT 1 FROM outreach_message_versions mv JOIN outreach_message_versions later ON later.message_id=mv.message_id AND later.version>mv.version
    WHERE mv.id=NEW.message_version_id AND mv.workspace_id=NEW.workspace_id
  );
  SELECT RAISE(ABORT, 'incomplete outreach message audit') WHERE NOT EXISTS (
    SELECT 1 FROM outreach_audit_records a WHERE a.workspace_id=NEW.workspace_id AND a.subject_kind='message_version' AND a.subject_id=NEW.message_version_id AND a.action='message.version.created'
  );
  SELECT RAISE(ABORT, 'stale or prohibited outreach authority') WHERE NOT EXISTS (SELECT 1 FROM outreach_package_versions pv
    JOIN outreach_packages op ON op.id=pv.package_id AND op.workspace_id=pv.workspace_id
    JOIN profile_prospects p ON p.id=op.prospect_id AND p.workspace_id=op.workspace_id
    JOIN customer_profiles cp ON cp.id=op.profile_id AND cp.workspace_id=op.workspace_id
    JOIN market_plays mp ON mp.id=cp.play_id AND mp.workspace_id=cp.workspace_id
    JOIN products product ON product.id=mp.product_id AND product.workspace_id=mp.workspace_id
    JOIN companies company ON company.id=product.company_id AND company.workspace_id=product.workspace_id
    JOIN contacts c ON c.id=op.contact_id AND c.workspace_id=op.workspace_id AND c.company_id=company.id
    JOIN typed_configurations cfg ON cfg.id=pv.configuration_id AND cfg.workspace_id=pv.workspace_id
    JOIN contact_eligibility_snapshots ces ON ces.id=pv.contact_eligibility_snapshot_id AND ces.workspace_id=pv.workspace_id
    JOIN qualification_assessments q ON q.id=p.assessment_id AND q.workspace_id=p.workspace_id
    WHERE pv.id=(SELECT package_version_id FROM outreach_message_versions WHERE id=NEW.message_version_id AND workspace_id=NEW.workspace_id) AND pv.workspace_id=NEW.workspace_id
      AND p.profile_id=op.profile_id AND p.state='approved' AND p.active=1 AND p.revision=pv.prospect_revision AND c.revision=pv.contact_revision
      AND cp.lifecycle='ready' AND mp.lifecycle='active' AND product.lifecycle='ready' AND company.status='active'
      AND cfg.active=1 AND cfg.owner_type='profile' AND cfg.owner_id=op.profile_id AND cfg.kind='profile_effective'
      AND cfg.digest=pv.configuration_digest AND cfg.revision=pv.configuration_revision
      AND q.candidate_id=p.candidate_id AND q.configuration_id=cfg.id AND q.configuration_digest=cfg.digest AND q.outcome='Passed'
      AND ces.contact_id=c.id AND ces.prospect_id=p.id AND ces.configuration_id=cfg.id
      AND ces.configuration_digest=cfg.digest AND ces.configuration_revision=cfg.revision AND ces.prospect_revision=p.revision
      AND ces.state='ContactReady' AND ces.eligible=1 AND ces.projected_at<=NEW.created_at
      AND json_array_length(ces.preserved_suppression_refs_json)=0
      AND NOT EXISTS (SELECT 1 FROM contact_eligibility_snapshots later WHERE later.workspace_id=p.workspace_id
        AND later.contact_id=c.id AND later.prospect_id=p.id AND later.id<>ces.id AND later.projected_at>=ces.projected_at)
  );
  SELECT RAISE(ABORT, 'stale or prohibited outreach authority') WHERE NOT EXISTS (SELECT 1 FROM outreach_package_versions pv
    JOIN outreach_packages op ON op.id=pv.package_id AND op.workspace_id=pv.workspace_id
    JOIN profile_prospects p ON p.id=op.prospect_id AND p.workspace_id=op.workspace_id
    JOIN contacts c ON c.id=op.contact_id AND c.workspace_id=op.workspace_id
    JOIN typed_configurations cfg ON cfg.id=pv.configuration_id AND cfg.workspace_id=pv.workspace_id
    JOIN contact_eligibility_snapshots ces ON ces.id=pv.contact_eligibility_snapshot_id AND ces.workspace_id=pv.workspace_id
    WHERE pv.id=(SELECT package_version_id FROM outreach_message_versions WHERE id=NEW.message_version_id AND workspace_id=NEW.workspace_id) AND pv.workspace_id=NEW.workspace_id
      AND NOT EXISTS (SELECT 1 FROM outreach_package_versions later WHERE later.package_id=pv.package_id AND later.version>pv.version)
      AND EXISTS (SELECT 1 FROM outreach_audit_records ar WHERE ar.workspace_id=pv.workspace_id AND ar.subject_kind='package_version' AND ar.subject_id=pv.id AND ar.action='package.version.created')
      AND EXISTS (SELECT 1 FROM outreach_artifact_bindings b JOIN prospect_review_decisions r ON r.id=b.binding_id
        WHERE b.artifact_id=pv.id AND b.artifact_kind='package_version' AND b.binding_kind='review_decision'
          AND r.prospect_id=p.id AND r.assessment_id=p.assessment_id AND r.decision='approve' AND r.decision_digest=b.binding_digest
          AND NOT EXISTS (SELECT 1 FROM prospect_review_decisions later WHERE later.workspace_id=r.workspace_id AND later.prospect_id=p.id
            AND later.id<>r.id AND later.created_at>=r.created_at))
      AND NOT EXISTS (SELECT 1 FROM outreach_artifact_bindings b JOIN sources s ON s.id=b.binding_id
        WHERE b.artifact_id=pv.id AND b.artifact_kind='package_version' AND b.binding_kind='source' AND (s.status<>'available' OR s.source_digest<>b.binding_digest))
      AND NOT EXISTS (SELECT 1 FROM outreach_artifact_bindings b JOIN knowledge_versions k ON k.id=b.binding_id
        WHERE b.artifact_id=pv.id AND b.artifact_kind='package_version' AND b.binding_kind='claim_guardrail' AND (k.status<>'confirmed' OR k.value_digest<>b.binding_digest))
      AND NOT EXISTS (SELECT 1 FROM knowledge_drifts d WHERE d.workspace_id=pv.workspace_id AND d.status IN ('open','reviewed','contained')
        AND (EXISTS (SELECT 1 FROM configuration_knowledge_dependencies dep WHERE dep.configuration_id=cfg.id AND dep.knowledge_version_id=d.current_version_id)
          OR EXISTS (SELECT 1 FROM outreach_artifact_bindings b WHERE b.artifact_id=pv.id AND b.artifact_kind='package_version' AND b.binding_kind='claim_guardrail' AND b.binding_id=d.current_version_id)))
      AND json_array_length(pv.snapshot_json,'$.selectedContactPointDigests')>0
  );
  SELECT RAISE(ABORT, 'stale outreach contact evidence') WHERE EXISTS (
    SELECT 1 FROM outreach_package_versions pv
    JOIN outreach_packages op ON op.id=pv.package_id AND op.workspace_id=pv.workspace_id
    JOIN json_each(pv.snapshot_json,'$.selectedContactPointDigests') selected
    WHERE pv.id=(SELECT package_version_id FROM outreach_message_versions WHERE id=NEW.message_version_id AND workspace_id=NEW.workspace_id) AND pv.workspace_id=NEW.workspace_id AND NOT EXISTS (
        SELECT 1 FROM outreach_artifact_bindings b
        JOIN contact_point_observations o ON o.id=b.binding_id AND o.workspace_id=pv.workspace_id
        JOIN contact_evidence_assignments a ON a.id=o.assignment_id AND a.workspace_id=pv.workspace_id
        JOIN contact_verification_receipts vr ON vr.id=o.verification_receipt_id AND vr.workspace_id=pv.workspace_id
        WHERE b.artifact_kind='package_version' AND b.artifact_id=pv.id AND b.binding_kind='contact_observation'
          AND b.binding_digest=o.observation_digest AND o.contact_id=op.contact_id AND o.configuration_id=pv.configuration_id AND o.configuration_digest=pv.configuration_digest
          AND a.prospect_id=op.prospect_id AND a.contact_id=op.contact_id AND a.configuration_id=pv.configuration_id
          AND o.contact_point_digest=selected.value AND o.verified_at<=NEW.created_at
          AND vr.observation_id=o.id AND vr.receipt_digest IS NOT NULL AND vr.attestation_key_id IS NOT NULL
          AND ((o.kind='email' AND o.verification_class='mailbox_verified' AND o.method='mailbox_verification' AND o.verified_at+2592000000>NEW.created_at)
            OR (o.verification_class='source_verified' AND o.method='authoritative_source_reconfirmed' AND o.verified_at+7776000000>NEW.created_at))
          AND NOT EXISTS (SELECT 1 FROM contact_point_observations later WHERE later.workspace_id=o.workspace_id AND later.contact_id=o.contact_id
            AND later.contact_point_digest=o.contact_point_digest AND later.id<>o.id AND later.observed_at>=o.observed_at)
    )
  );
  SELECT RAISE(ABORT, 'stale or prohibited outreach authority') WHERE NOT EXISTS (SELECT 1 FROM outreach_package_versions pv
    JOIN outreach_packages op ON op.id=pv.package_id AND op.workspace_id=pv.workspace_id
    JOIN profile_prospects p ON p.id=op.prospect_id AND p.workspace_id=op.workspace_id
    JOIN contacts c ON c.id=op.contact_id AND c.workspace_id=op.workspace_id
    JOIN typed_configurations cfg ON cfg.id=pv.configuration_id AND cfg.workspace_id=pv.workspace_id
    JOIN contact_eligibility_snapshots ces ON ces.id=pv.contact_eligibility_snapshot_id AND ces.workspace_id=pv.workspace_id
    WHERE pv.id=(SELECT package_version_id FROM outreach_message_versions WHERE id=NEW.message_version_id AND workspace_id=NEW.workspace_id) AND pv.workspace_id=NEW.workspace_id
      AND NOT EXISTS (SELECT 1 FROM outreach_suppression_tombstones s WHERE s.workspace_id=pv.workspace_id AND s.effective_at<=NEW.created_at AND (
        s.subject_kind='company'
        OR (s.subject_kind='contact' AND s.channel IN ('email','all')
          AND (s.subject_digest=c.identity_digest OR EXISTS (SELECT 1 FROM json_each(s.alias_snapshot_json) a WHERE a.value=c.identity_digest)))
        OR (s.subject_kind IN ('exact_email','e164_phone') AND EXISTS (
          SELECT 1 FROM outreach_artifact_bindings b JOIN contact_point_observations o ON o.id=b.binding_id
          WHERE b.artifact_kind='package_version' AND b.artifact_id=pv.id AND b.binding_kind='contact_observation'
            AND ((s.subject_kind='exact_email' AND o.kind='email') OR (s.subject_kind='e164_phone' AND o.kind='phone'))
            AND (s.subject_digest=o.contact_point_digest OR EXISTS (SELECT 1 FROM json_each(s.alias_snapshot_json) a WHERE a.value=o.contact_point_digest))
        ))
      ))
  );
  SELECT RAISE(ABORT, 'stale or prohibited outreach authority') WHERE NOT EXISTS (SELECT 1 FROM outreach_package_versions pv
    JOIN outreach_packages op ON op.id=pv.package_id AND op.workspace_id=pv.workspace_id
    JOIN profile_prospects p ON p.id=op.prospect_id AND p.workspace_id=op.workspace_id
    JOIN contacts c ON c.id=op.contact_id AND c.workspace_id=op.workspace_id
    JOIN typed_configurations cfg ON cfg.id=pv.configuration_id AND cfg.workspace_id=pv.workspace_id
    JOIN contact_eligibility_snapshots ces ON ces.id=pv.contact_eligibility_snapshot_id AND ces.workspace_id=pv.workspace_id
    WHERE pv.id=(SELECT package_version_id FROM outreach_message_versions WHERE id=NEW.message_version_id AND workspace_id=NEW.workspace_id) AND pv.workspace_id=NEW.workspace_id
      AND NOT EXISTS (SELECT 1 FROM outreach_stop_events stop WHERE stop.workspace_id=pv.workspace_id AND stop.stop_kind<>'suppression' AND stop.effective_at<=NEW.created_at
        AND ((stop.subject_kind='company') OR (stop.subject_kind='contact' AND stop.subject_digest=c.identity_digest)
          OR EXISTS (SELECT 1 FROM json_each(pv.snapshot_json,'$.selectedContactPointDigests') point WHERE point.value=stop.subject_digest)))
  );
END;
--> statement-breakpoint
DROP TRIGGER outreach_pre_call_receipt_scope_guard;
--> statement-breakpoint
CREATE TRIGGER outreach_pre_call_receipt_scope_guard BEFORE INSERT ON outreach_pre_call_recheck_receipts BEGIN
  SELECT RAISE(ABORT, 'invalid outreach pre-call receipt') WHERE
    NEW.provider_invocation_authorized<>0
    OR NEW.owner_subject='' OR length(NEW.owner_subject)>256
    OR NEW.lease_revision<=1 OR NEW.lease_generation<=0
    OR NEW.created_at<=0 OR NEW.valid_until<=NEW.created_at OR NEW.valid_until>NEW.lease_expires_at;
  SELECT RAISE(ABORT, 'invalid outreach pre-call receipt') WHERE NOT EXISTS (
    SELECT 1
    FROM outreach_outbox_items item
    JOIN outreach_outbox_events lease_event ON lease_event.id=NEW.lease_event_id
      AND lease_event.workspace_id=item.workspace_id AND lease_event.outbox_item_id=item.id
    JOIN outreach_message_approval_consumptions consumption ON consumption.id=item.approval_consumption_id
      AND consumption.workspace_id=item.workspace_id AND consumption.message_approval_id=item.message_approval_id
      AND consumption.send_key=item.send_key
    JOIN outreach_message_approvals message_approval ON message_approval.id=item.message_approval_id
      AND message_approval.workspace_id=item.workspace_id AND message_approval.message_version_id=item.message_version_id
      AND message_approval.approval_digest=consumption.approval_digest
    JOIN outreach_message_versions message_version ON message_version.id=item.message_version_id
      AND message_version.workspace_id=item.workspace_id AND message_version.artifact_digest=message_approval.artifact_digest
    JOIN outreach_package_approvals package_approval ON package_approval.id=message_approval.package_approval_id
      AND package_approval.workspace_id=item.workspace_id
    JOIN outreach_package_versions package_version ON package_version.id=message_version.package_version_id
      AND package_version.workspace_id=item.workspace_id AND package_version.artifact_digest=package_approval.artifact_digest
    JOIN outreach_recipient_dispatch_authorities recipient_authority ON recipient_authority.id=NEW.recipient_authority_id
      AND recipient_authority.workspace_id=item.workspace_id AND recipient_authority.message_version_id=message_version.id
      AND recipient_authority.package_approval_id=package_approval.id
      AND recipient_authority.message_artifact_digest=message_version.artifact_digest
      AND recipient_authority.package_approval_digest=package_approval.approval_digest
      AND recipient_authority.acknowledgement_digest=message_approval.acknowledgement_digest
    JOIN workspaces workspace ON workspace.id=item.workspace_id AND workspace.owner_subject=NEW.owner_subject
    WHERE item.id=NEW.outbox_item_id AND item.workspace_id=NEW.workspace_id
      AND lease_event.revision=NEW.lease_revision AND lease_event.state='leased'
      AND lease_event.lease_generation=NEW.lease_generation AND lease_event.lease_holder_id=NEW.lease_holder_id
      AND lease_event.lease_expires_at=NEW.lease_expires_at AND lease_event.created_at<=NEW.created_at
      AND lease_event.lease_expires_at>NEW.created_at
      AND lease_event.id=(SELECT latest.id FROM outreach_outbox_events latest
        WHERE latest.workspace_id=item.workspace_id AND latest.outbox_item_id=item.id
        ORDER BY latest.revision DESC LIMIT 1)
      AND message_approval.owner_subject=NEW.owner_subject
      AND message_approval.expires_at>NEW.created_at AND package_approval.expires_at>NEW.created_at
      AND (message_version.intended_send_at IS NULL OR message_version.intended_send_at<=NEW.created_at)
      AND recipient_authority.owner_subject=NEW.owner_subject AND recipient_authority.valid_until>NEW.created_at
  );
  SELECT RAISE(ABORT, 'invalid outreach pre-call receipt') WHERE NOT EXISTS (
    SELECT 1
    FROM outreach_outbox_items item
    JOIN outreach_outbox_events lease_event ON lease_event.id=NEW.lease_event_id AND lease_event.workspace_id=item.workspace_id
    JOIN outreach_message_approvals message_approval ON message_approval.id=item.message_approval_id AND message_approval.workspace_id=item.workspace_id
    JOIN outreach_message_versions message_version ON message_version.id=item.message_version_id AND message_version.workspace_id=item.workspace_id
    JOIN outreach_package_approvals package_approval ON package_approval.id=message_approval.package_approval_id AND package_approval.workspace_id=item.workspace_id
    JOIN outreach_recipient_dispatch_authorities recipient_authority ON recipient_authority.id=NEW.recipient_authority_id AND recipient_authority.workspace_id=item.workspace_id
    JOIN contact_point_observations observation ON observation.id=recipient_authority.email_observation_id AND observation.workspace_id=item.workspace_id
    JOIN sources basis_source ON basis_source.id=recipient_authority.basis_source_id AND basis_source.workspace_id=item.workspace_id
    JOIN outreach_unsubscribe_authority_events unsubscribe ON unsubscribe.id=NEW.unsubscribe_event_id
      AND unsubscribe.workspace_id=item.workspace_id AND unsubscribe.recipient_authority_id=recipient_authority.id
    JOIN outreach_sender_connections sender_connection ON sender_connection.id=item.sender_connection_id AND sender_connection.workspace_id=item.workspace_id
    JOIN outreach_sender_capability_snapshots sender_capability ON sender_capability.id=NEW.sender_capability_id
      AND sender_capability.workspace_id=item.workspace_id AND sender_capability.sender_connection_id=sender_connection.id
      AND sender_capability.connection_subject_digest=sender_connection.connection_subject_digest
    JOIN outreach_sender_verified_addresses sender_address ON sender_address.id=NEW.sender_verified_address_id
      AND sender_address.workspace_id=item.workspace_id AND sender_address.sender_capability_id=sender_capability.id
      AND sender_address.address_digest=recipient_authority.sender_address_digest
    WHERE item.id=NEW.outbox_item_id AND item.workspace_id=NEW.workspace_id
      AND unsubscribe.status='working' AND unsubscribe.valid_until>NEW.created_at
      AND unsubscribe.id=(SELECT latest.id FROM outreach_unsubscribe_authority_events latest
        WHERE latest.workspace_id=item.workspace_id AND latest.recipient_authority_id=recipient_authority.id
        ORDER BY latest.revision DESC LIMIT 1)
      AND sender_connection.provider='gmail' AND sender_connection.status='active'
      AND sender_capability.expires_at>NEW.created_at AND sender_address.expires_at>NEW.created_at
      AND json_array_length(sender_capability.granted_scopes_json)=2
      AND EXISTS (SELECT 1 FROM json_each(sender_capability.granted_scopes_json) scope
        WHERE scope.value='https://www.googleapis.com/auth/gmail.send')
      AND EXISTS (SELECT 1 FROM json_each(sender_capability.granted_scopes_json) scope
        WHERE scope.value='https://www.googleapis.com/auth/gmail.readonly')
      AND basis_source.source_digest=recipient_authority.basis_source_digest AND basis_source.status='available'
      AND observation.contact_id=recipient_authority.contact_id
      AND observation.contact_point_digest=recipient_authority.recipient_address_digest
      AND ((observation.verification_class='mailbox_verified' AND observation.method='mailbox_verification'
            AND observation.verified_at+2592000000>NEW.created_at)
        OR (observation.verification_class='source_verified' AND observation.method='authoritative_source_reconfirmed'
            AND observation.verified_at+7776000000>NEW.created_at))
      AND NEW.valid_until=min(
        lease_event.lease_expires_at,message_approval.expires_at,package_approval.expires_at,
        recipient_authority.valid_until,unsubscribe.valid_until,sender_capability.expires_at,
        sender_address.expires_at,
        CASE observation.verification_class WHEN 'mailbox_verified' THEN observation.verified_at+2592000000
          ELSE observation.verified_at+7776000000 END
      )
  );
  SELECT RAISE(ABORT, 'invalid outreach pre-call receipt') WHERE NOT EXISTS (
    SELECT 1
    FROM outreach_outbox_items item
    JOIN outreach_message_versions message_version ON message_version.id=item.message_version_id AND message_version.workspace_id=item.workspace_id
    JOIN outreach_package_versions package_version ON package_version.id=message_version.package_version_id AND package_version.workspace_id=item.workspace_id
    JOIN outreach_packages package ON package.id=package_version.package_id AND package.workspace_id=item.workspace_id
    JOIN profile_prospects prospect ON prospect.id=package.prospect_id AND prospect.workspace_id=item.workspace_id
    JOIN contacts contact ON contact.id=package.contact_id AND contact.workspace_id=item.workspace_id
    JOIN typed_configurations configuration ON configuration.id=package_version.configuration_id AND configuration.workspace_id=item.workspace_id
    JOIN outreach_recipient_dispatch_authorities recipient_authority ON recipient_authority.id=NEW.recipient_authority_id AND recipient_authority.workspace_id=item.workspace_id
    JOIN contact_point_observations observation ON observation.id=recipient_authority.email_observation_id AND observation.workspace_id=item.workspace_id
    JOIN sources basis_source ON basis_source.id=recipient_authority.basis_source_id AND basis_source.workspace_id=item.workspace_id
    WHERE item.id=NEW.outbox_item_id AND item.workspace_id=NEW.workspace_id
      AND EXISTS (SELECT 1 FROM outreach_artifact_bindings binding
        WHERE binding.workspace_id=item.workspace_id AND binding.artifact_kind='package_version'
          AND binding.artifact_id=package_version.id AND binding.binding_kind='source'
          AND binding.binding_id=basis_source.id AND binding.binding_digest=basis_source.source_digest)
      AND EXISTS (SELECT 1 FROM outreach_artifact_bindings binding
        WHERE binding.workspace_id=item.workspace_id AND binding.artifact_kind='package_version'
          AND binding.artifact_id=package_version.id AND binding.binding_kind='contact_observation'
          AND binding.binding_id=observation.id AND binding.binding_digest=observation.observation_digest)
      AND NOT EXISTS (SELECT 1 FROM outreach_artifact_bindings binding
        LEFT JOIN sources bound_source ON bound_source.id=binding.binding_id AND bound_source.workspace_id=binding.workspace_id
        WHERE binding.workspace_id=item.workspace_id AND binding.artifact_kind='package_version'
          AND binding.artifact_id=package_version.id AND binding.binding_kind='source'
          AND (bound_source.id IS NULL OR bound_source.status<>'available' OR bound_source.source_digest<>binding.binding_digest))
      AND NOT EXISTS (SELECT 1 FROM outreach_artifact_bindings binding
        LEFT JOIN knowledge_versions guardrail ON guardrail.id=binding.binding_id AND guardrail.workspace_id=binding.workspace_id
        WHERE binding.workspace_id=item.workspace_id AND binding.artifact_kind='package_version'
          AND binding.artifact_id=package_version.id AND binding.binding_kind='claim_guardrail'
          AND (guardrail.id IS NULL OR guardrail.status<>'confirmed' OR guardrail.value_digest<>binding.binding_digest))
      AND EXISTS (SELECT 1 FROM contact_evidence_assignments assignment
        JOIN contact_verification_receipts verification_receipt ON verification_receipt.id=observation.verification_receipt_id
          AND verification_receipt.workspace_id=item.workspace_id AND verification_receipt.observation_id=observation.id
          AND verification_receipt.receipt_digest IS NOT NULL AND verification_receipt.attestation_key_id IS NOT NULL
        WHERE assignment.id=observation.assignment_id AND assignment.workspace_id=item.workspace_id
          AND assignment.prospect_id=prospect.id AND assignment.contact_id=contact.id
          AND assignment.configuration_id=configuration.id AND assignment.configuration_digest=configuration.digest)
  );
  SELECT RAISE(ABORT, 'invalid outreach pre-call receipt') WHERE NOT EXISTS (
    SELECT 1
    FROM outreach_outbox_items item
    JOIN outreach_message_versions message_version ON message_version.id=item.message_version_id AND message_version.workspace_id=item.workspace_id
    JOIN outreach_package_versions package_version ON package_version.id=message_version.package_version_id AND package_version.workspace_id=item.workspace_id
    JOIN outreach_packages package ON package.id=package_version.package_id AND package.workspace_id=item.workspace_id
    JOIN profile_prospects prospect ON prospect.id=package.prospect_id AND prospect.workspace_id=item.workspace_id
    JOIN customer_profiles profile ON profile.id=package.profile_id AND profile.workspace_id=item.workspace_id
    JOIN market_plays play ON play.id=profile.play_id AND play.workspace_id=item.workspace_id
    JOIN products product ON product.id=play.product_id AND product.workspace_id=item.workspace_id
    JOIN companies company ON company.id=product.company_id AND company.workspace_id=item.workspace_id
    JOIN contacts contact ON contact.id=package.contact_id AND contact.workspace_id=item.workspace_id AND contact.company_id=company.id
    JOIN typed_configurations configuration ON configuration.id=package_version.configuration_id AND configuration.workspace_id=item.workspace_id
    JOIN contact_eligibility_snapshots eligibility ON eligibility.id=NEW.contact_eligibility_snapshot_id AND eligibility.workspace_id=item.workspace_id
    JOIN outreach_recipient_dispatch_authorities recipient_authority ON recipient_authority.id=NEW.recipient_authority_id AND recipient_authority.workspace_id=item.workspace_id
    JOIN contact_point_observations observation ON observation.id=recipient_authority.email_observation_id AND observation.workspace_id=item.workspace_id
    JOIN outreach_sender_connections sender_connection ON sender_connection.id=item.sender_connection_id AND sender_connection.workspace_id=item.workspace_id
    WHERE item.id=NEW.outbox_item_id AND item.workspace_id=NEW.workspace_id
      AND prospect.state='approved' AND prospect.active=1 AND prospect.revision=package_version.prospect_revision
      AND contact.revision=package_version.contact_revision
      AND profile.lifecycle='ready' AND play.lifecycle='active' AND product.lifecycle='ready' AND company.status='active'
      AND configuration.active=1 AND configuration.digest=package_version.configuration_digest
      AND configuration.revision=package_version.configuration_revision
      AND eligibility.id=package_version.contact_eligibility_snapshot_id AND eligibility.state='ContactReady' AND eligibility.eligible=1
      AND eligibility.configuration_id=configuration.id
      AND eligibility.configuration_digest=configuration.digest AND eligibility.configuration_revision=configuration.revision
      AND eligibility.prospect_id=prospect.id AND eligibility.prospect_revision=prospect.revision
      AND json_array_length(eligibility.preserved_suppression_refs_json)=0
      AND EXISTS (SELECT 1 FROM json_each(eligibility.observation_ids_json) selected WHERE selected.value=observation.id)
      AND NOT EXISTS (SELECT 1 FROM outreach_message_versions later
        WHERE later.workspace_id=item.workspace_id AND later.message_id=message_version.message_id AND later.version>message_version.version)
      AND NOT EXISTS (SELECT 1 FROM outreach_package_versions later
        WHERE later.workspace_id=item.workspace_id AND later.package_id=package_version.package_id AND later.version>package_version.version)
      AND NOT EXISTS (SELECT 1 FROM contact_eligibility_snapshots later
        WHERE later.workspace_id=item.workspace_id AND later.prospect_id=eligibility.prospect_id
          AND later.contact_id=eligibility.contact_id AND later.id<>eligibility.id AND later.projected_at>=eligibility.projected_at)
      AND NOT EXISTS (SELECT 1 FROM contact_point_observations later
        WHERE later.workspace_id=item.workspace_id AND later.contact_id=observation.contact_id
          AND later.contact_point_digest=observation.contact_point_digest AND later.id<>observation.id
          AND later.observed_at>=observation.observed_at)
      AND NOT EXISTS (SELECT 1 FROM outreach_sender_connections later
        WHERE later.workspace_id=item.workspace_id AND later.provider=sender_connection.provider
          AND later.connection_subject_digest=sender_connection.connection_subject_digest
          AND later.protected_reference_version>sender_connection.protected_reference_version)
      AND NOT EXISTS (SELECT 1 FROM knowledge_drifts drift WHERE drift.workspace_id=item.workspace_id AND drift.status<>'resolved')
      AND NOT EXISTS (SELECT 1 FROM outreach_approval_revocations revoked
        JOIN outreach_message_approvals approval ON approval.id=item.message_approval_id AND approval.workspace_id=item.workspace_id
        WHERE revoked.workspace_id=item.workspace_id AND revoked.message_approval_id=approval.id AND revoked.effective_at<=NEW.created_at)
      AND NOT EXISTS (SELECT 1 FROM outreach_approval_revocations revoked
        JOIN outreach_message_approvals message_approval ON message_approval.id=item.message_approval_id AND message_approval.workspace_id=item.workspace_id
        WHERE revoked.workspace_id=item.workspace_id AND revoked.package_approval_id=message_approval.package_approval_id
          AND revoked.effective_at<=NEW.created_at)
  );
  SELECT RAISE(ABORT, 'invalid outreach pre-call receipt') WHERE EXISTS (
    SELECT 1
    FROM outreach_outbox_items item
    JOIN outreach_message_versions message_version ON message_version.id=item.message_version_id AND message_version.workspace_id=item.workspace_id
    JOIN outreach_package_versions package_version ON package_version.id=message_version.package_version_id AND package_version.workspace_id=item.workspace_id
    JOIN outreach_packages package ON package.id=package_version.package_id AND package.workspace_id=item.workspace_id
    JOIN contacts contact ON contact.id=package.contact_id AND contact.workspace_id=item.workspace_id
    WHERE item.id=NEW.outbox_item_id AND item.workspace_id=NEW.workspace_id AND (
      EXISTS (SELECT 1 FROM outreach_suppression_tombstones suppression
        WHERE suppression.workspace_id=item.workspace_id AND suppression.effective_at<=NEW.created_at AND (
          suppression.subject_kind IN ('company','organization')
          OR (suppression.subject_kind='confirmed_email_domain' AND (
            NOT EXISTS (SELECT 1 FROM outreach_artifact_bindings binding
              JOIN contact_point_observations observation ON observation.id=binding.binding_id
              WHERE binding.workspace_id=item.workspace_id AND binding.artifact_kind='package_version'
                AND binding.artifact_id=package_version.id AND binding.binding_kind='contact_observation'
                AND observation.kind='email')
            OR EXISTS (SELECT 1 FROM outreach_artifact_bindings binding
              JOIN contact_point_observations observation ON observation.id=binding.binding_id
              LEFT JOIN outreach_contact_point_domains point_domain ON point_domain.workspace_id=item.workspace_id
                AND point_domain.contact_point_digest=observation.contact_point_digest
              WHERE binding.workspace_id=item.workspace_id AND binding.artifact_kind='package_version'
                AND binding.artifact_id=package_version.id AND binding.binding_kind='contact_observation'
                AND observation.kind='email' AND (point_domain.id IS NULL
                  OR EXISTS (SELECT 1 FROM json_each(point_domain.domain_digests_json) scope_domain
                    WHERE scope_domain.value=suppression.subject_digest
                      OR EXISTS (SELECT 1 FROM json_each(suppression.alias_snapshot_json) alias WHERE alias.value=scope_domain.value))))))
          OR (suppression.subject_kind='contact' AND suppression.channel IN ('email','all') AND (
            suppression.subject_digest=contact.identity_digest
            OR EXISTS (SELECT 1 FROM json_each(suppression.alias_snapshot_json) alias WHERE alias.value=contact.identity_digest)))
          OR (suppression.subject_kind='exact_email' AND EXISTS (
            SELECT 1 FROM outreach_artifact_bindings binding
            JOIN contact_point_observations observation ON observation.id=binding.binding_id
            WHERE binding.workspace_id=item.workspace_id AND binding.artifact_kind='package_version'
              AND binding.artifact_id=package_version.id AND binding.binding_kind='contact_observation'
              AND observation.kind='email' AND (suppression.subject_digest=observation.contact_point_digest
                OR EXISTS (SELECT 1 FROM json_each(suppression.alias_snapshot_json) alias
                  WHERE alias.value=observation.contact_point_digest))))))
      OR EXISTS (SELECT 1 FROM outreach_stop_events stop
        WHERE stop.workspace_id=item.workspace_id AND stop.effective_at<=NEW.created_at AND (
          stop.subject_kind IN ('company','organization')
          OR (stop.subject_kind='confirmed_email_domain' AND stop.stop_kind<>'suppression')
          OR (stop.subject_kind='contact' AND stop.stop_kind<>'suppression' AND stop.subject_digest=contact.identity_digest)
          OR EXISTS (SELECT 1 FROM outreach_artifact_bindings binding
            JOIN contact_point_observations observation ON observation.id=binding.binding_id
            WHERE binding.workspace_id=item.workspace_id AND binding.artifact_kind='package_version'
              AND binding.artifact_id=package_version.id AND binding.binding_kind='contact_observation'
              AND observation.kind='email' AND observation.contact_point_digest=stop.subject_digest)))
    )
  );
END;
--> statement-breakpoint
DROP TRIGGER outreach_dispatch_attempt_preparation_scope_guard;
--> statement-breakpoint
CREATE TRIGGER outreach_dispatch_attempt_preparation_scope_guard BEFORE INSERT ON outreach_dispatch_attempt_preparations BEGIN
  SELECT RAISE(ABORT, 'invalid outreach dispatch attempt preparation') WHERE
    NEW.owner_subject='' OR length(NEW.owner_subject)>256 OR NEW.attempt_ordinal<>1
    OR NEW.provider_invocation_authorized<>0 OR NEW.provider_calls<>0 OR NEW.prepared_at<=0;
  SELECT RAISE(ABORT, 'invalid outreach dispatch attempt preparation') WHERE NOT EXISTS (
    SELECT 1 FROM outreach_outbox_items item
    JOIN workspaces workspace ON workspace.id=item.workspace_id AND workspace.owner_subject=NEW.owner_subject
    JOIN outreach_message_versions message_version ON message_version.id=item.message_version_id AND message_version.workspace_id=item.workspace_id
    JOIN outreach_pre_call_recheck_receipts receipt ON receipt.id=NEW.pre_call_receipt_id
      AND receipt.workspace_id=item.workspace_id AND receipt.owner_subject=NEW.owner_subject
      AND receipt.outbox_item_id=item.id AND receipt.provider_invocation_authorized=0
    JOIN outreach_outbox_events lease_event ON lease_event.id=NEW.lease_event_id
      AND lease_event.workspace_id=item.workspace_id AND lease_event.outbox_item_id=item.id
    WHERE item.id=NEW.outbox_item_id AND item.workspace_id=NEW.workspace_id
      AND NEW.send_key=item.send_key AND NEW.dispatch_key=item.dispatch_key
      AND NEW.message_version_id=item.message_version_id
      AND NEW.message_artifact_digest=message_version.artifact_digest
      AND NEW.sender_connection_id=item.sender_connection_id
      AND receipt.lease_event_id=lease_event.id AND receipt.lease_revision=lease_event.revision
      AND receipt.lease_generation=NEW.lease_generation AND receipt.lease_holder_id=NEW.lease_holder_id
      AND receipt.lease_expires_at=NEW.lease_expires_at
      AND receipt.created_at<=NEW.prepared_at AND receipt.valid_until>NEW.prepared_at
      AND lease_event.state='leased' AND lease_event.lease_generation=NEW.lease_generation
      AND lease_event.lease_holder_id=NEW.lease_holder_id AND lease_event.lease_expires_at=NEW.lease_expires_at
      AND lease_event.created_at<=NEW.prepared_at AND lease_event.lease_expires_at>NEW.prepared_at
      AND lease_event.id=(SELECT latest.id FROM outreach_outbox_events latest
        WHERE latest.workspace_id=item.workspace_id AND latest.outbox_item_id=item.id
        ORDER BY latest.revision DESC LIMIT 1)
      AND NOT EXISTS (SELECT 1 FROM outreach_outbox_events unsafe_history
        WHERE unsafe_history.workspace_id=item.workspace_id AND unsafe_history.outbox_item_id=item.id
          AND unsafe_history.state IN ('dispatching','sent','delivery_unknown'))
  );
  SELECT RAISE(ABORT, 'invalid outreach dispatch attempt preparation') WHERE NOT EXISTS (
    SELECT 1 FROM outreach_outbox_items item
    JOIN outreach_message_approval_consumptions consumption ON consumption.id=item.approval_consumption_id
      AND consumption.workspace_id=item.workspace_id AND consumption.message_approval_id=item.message_approval_id
      AND consumption.send_key=item.send_key
    JOIN outreach_message_approvals message_approval ON message_approval.id=item.message_approval_id
      AND message_approval.workspace_id=item.workspace_id AND message_approval.owner_subject=NEW.owner_subject
      AND message_approval.message_version_id=item.message_version_id
      AND message_approval.approval_digest=consumption.approval_digest
    JOIN outreach_message_versions message_version ON message_version.id=item.message_version_id
      AND message_version.workspace_id=item.workspace_id AND message_version.artifact_digest=message_approval.artifact_digest
    JOIN outreach_package_approvals package_approval ON package_approval.id=message_approval.package_approval_id
      AND package_approval.workspace_id=item.workspace_id
    JOIN outreach_package_versions package_version ON package_version.id=message_version.package_version_id
      AND package_version.workspace_id=item.workspace_id AND package_version.artifact_digest=package_approval.artifact_digest
    JOIN outreach_pre_call_recheck_receipts receipt ON receipt.id=NEW.pre_call_receipt_id
      AND receipt.workspace_id=item.workspace_id AND receipt.outbox_item_id=item.id
    JOIN outreach_recipient_dispatch_authorities recipient_authority ON recipient_authority.id=receipt.recipient_authority_id
      AND recipient_authority.workspace_id=item.workspace_id AND recipient_authority.message_version_id=message_version.id
      AND recipient_authority.message_artifact_digest=message_version.artifact_digest
      AND recipient_authority.package_approval_id=package_approval.id
      AND recipient_authority.package_approval_digest=package_approval.approval_digest
      AND recipient_authority.acknowledgement_digest=message_approval.acknowledgement_digest
    WHERE item.id=NEW.outbox_item_id AND item.workspace_id=NEW.workspace_id
      AND message_approval.expires_at>NEW.prepared_at AND package_approval.expires_at>NEW.prepared_at
      AND (message_version.intended_send_at IS NULL OR message_version.intended_send_at<=NEW.prepared_at)
      AND recipient_authority.owner_subject=NEW.owner_subject AND recipient_authority.valid_until>NEW.prepared_at
      AND NOT EXISTS (SELECT 1 FROM outreach_approval_revocations revoked
        WHERE revoked.workspace_id=item.workspace_id AND revoked.message_approval_id=message_approval.id
          AND revoked.effective_at<=NEW.prepared_at)
      AND NOT EXISTS (SELECT 1 FROM outreach_approval_revocations revoked
        WHERE revoked.workspace_id=item.workspace_id AND revoked.package_approval_id=package_approval.id
          AND revoked.effective_at<=NEW.prepared_at)
  );
  SELECT RAISE(ABORT, 'invalid outreach dispatch attempt preparation') WHERE NOT EXISTS (
    SELECT 1 FROM outreach_outbox_items item
    JOIN outreach_pre_call_recheck_receipts receipt ON receipt.id=NEW.pre_call_receipt_id
      AND receipt.workspace_id=item.workspace_id AND receipt.outbox_item_id=item.id
    JOIN outreach_recipient_dispatch_authorities recipient_authority ON recipient_authority.id=receipt.recipient_authority_id
      AND recipient_authority.workspace_id=item.workspace_id
    JOIN outreach_unsubscribe_authority_events unsubscribe ON unsubscribe.id=receipt.unsubscribe_event_id
      AND unsubscribe.workspace_id=item.workspace_id AND unsubscribe.recipient_authority_id=recipient_authority.id
    JOIN outreach_sender_connections sender_connection ON sender_connection.id=item.sender_connection_id
      AND sender_connection.workspace_id=item.workspace_id
    JOIN outreach_sender_capability_snapshots sender_capability ON sender_capability.id=receipt.sender_capability_id
      AND sender_capability.workspace_id=item.workspace_id AND sender_capability.sender_connection_id=sender_connection.id
      AND sender_capability.connection_subject_digest=sender_connection.connection_subject_digest
    JOIN outreach_sender_verified_addresses sender_address ON sender_address.id=receipt.sender_verified_address_id
      AND sender_address.workspace_id=item.workspace_id AND sender_address.sender_capability_id=sender_capability.id
      AND sender_address.address_digest=recipient_authority.sender_address_digest
    JOIN contact_point_observations observation ON observation.id=recipient_authority.email_observation_id
      AND observation.workspace_id=item.workspace_id AND observation.contact_id=recipient_authority.contact_id
    JOIN sources basis_source ON basis_source.id=recipient_authority.basis_source_id AND basis_source.workspace_id=item.workspace_id
    WHERE item.id=NEW.outbox_item_id AND item.workspace_id=NEW.workspace_id
      AND unsubscribe.status='working' AND unsubscribe.valid_until>NEW.prepared_at
      AND unsubscribe.id=(SELECT latest.id FROM outreach_unsubscribe_authority_events latest
        WHERE latest.workspace_id=item.workspace_id AND latest.recipient_authority_id=recipient_authority.id
        ORDER BY latest.revision DESC LIMIT 1)
      AND sender_connection.provider='gmail' AND sender_connection.status='active'
      AND sender_capability.expires_at>NEW.prepared_at AND sender_address.expires_at>NEW.prepared_at
      AND json_array_length(sender_capability.granted_scopes_json)=2
      AND EXISTS (SELECT 1 FROM json_each(sender_capability.granted_scopes_json) scope
        WHERE scope.value='https://www.googleapis.com/auth/gmail.send')
      AND EXISTS (SELECT 1 FROM json_each(sender_capability.granted_scopes_json) scope
        WHERE scope.value='https://www.googleapis.com/auth/gmail.readonly')
      AND basis_source.source_digest=recipient_authority.basis_source_digest AND basis_source.status='available'
      AND observation.contact_point_digest=recipient_authority.recipient_address_digest
      AND ((observation.verification_class='mailbox_verified' AND observation.method='mailbox_verification'
            AND observation.verified_at+2592000000>NEW.prepared_at)
        OR (observation.verification_class='source_verified' AND observation.method='authoritative_source_reconfirmed'
            AND observation.verified_at+7776000000>NEW.prepared_at))
  );
  SELECT RAISE(ABORT, 'invalid outreach dispatch attempt preparation') WHERE NOT EXISTS (
    SELECT 1 FROM outreach_outbox_items item
    JOIN outreach_message_versions message_version ON message_version.id=item.message_version_id AND message_version.workspace_id=item.workspace_id
    JOIN outreach_package_versions package_version ON package_version.id=message_version.package_version_id AND package_version.workspace_id=item.workspace_id
    JOIN outreach_packages package ON package.id=package_version.package_id AND package.workspace_id=item.workspace_id
    JOIN profile_prospects prospect ON prospect.id=package.prospect_id AND prospect.workspace_id=item.workspace_id
    JOIN contacts contact ON contact.id=package.contact_id AND contact.workspace_id=item.workspace_id
    JOIN typed_configurations configuration ON configuration.id=package_version.configuration_id AND configuration.workspace_id=item.workspace_id
    JOIN outreach_pre_call_recheck_receipts receipt ON receipt.id=NEW.pre_call_receipt_id
      AND receipt.workspace_id=item.workspace_id AND receipt.outbox_item_id=item.id
    JOIN outreach_recipient_dispatch_authorities recipient_authority ON recipient_authority.id=receipt.recipient_authority_id
      AND recipient_authority.workspace_id=item.workspace_id
    JOIN contact_point_observations observation ON observation.id=recipient_authority.email_observation_id AND observation.workspace_id=item.workspace_id
    JOIN sources basis_source ON basis_source.id=recipient_authority.basis_source_id AND basis_source.workspace_id=item.workspace_id
    WHERE item.id=NEW.outbox_item_id AND item.workspace_id=NEW.workspace_id
      AND EXISTS (SELECT 1 FROM outreach_artifact_bindings binding
        WHERE binding.workspace_id=item.workspace_id AND binding.artifact_kind='package_version'
          AND binding.artifact_id=package_version.id AND binding.binding_kind='source'
          AND binding.binding_id=basis_source.id AND binding.binding_digest=basis_source.source_digest)
      AND EXISTS (SELECT 1 FROM outreach_artifact_bindings binding
        WHERE binding.workspace_id=item.workspace_id AND binding.artifact_kind='package_version'
          AND binding.artifact_id=package_version.id AND binding.binding_kind='contact_observation'
          AND binding.binding_id=observation.id AND binding.binding_digest=observation.observation_digest)
      AND NOT EXISTS (SELECT 1 FROM outreach_artifact_bindings binding
        LEFT JOIN sources bound_source ON bound_source.id=binding.binding_id AND bound_source.workspace_id=binding.workspace_id
        WHERE binding.workspace_id=item.workspace_id AND binding.artifact_kind='package_version'
          AND binding.artifact_id=package_version.id AND binding.binding_kind='source'
          AND (bound_source.id IS NULL OR bound_source.status<>'available' OR bound_source.source_digest<>binding.binding_digest))
      AND NOT EXISTS (SELECT 1 FROM outreach_artifact_bindings binding
        LEFT JOIN knowledge_versions guardrail ON guardrail.id=binding.binding_id AND guardrail.workspace_id=binding.workspace_id
        WHERE binding.workspace_id=item.workspace_id AND binding.artifact_kind='package_version'
          AND binding.artifact_id=package_version.id AND binding.binding_kind='claim_guardrail'
          AND (guardrail.id IS NULL OR guardrail.status<>'confirmed' OR guardrail.value_digest<>binding.binding_digest))
      AND EXISTS (SELECT 1 FROM contact_evidence_assignments assignment
        JOIN contact_verification_receipts verification_receipt ON verification_receipt.id=observation.verification_receipt_id
          AND verification_receipt.workspace_id=item.workspace_id AND verification_receipt.observation_id=observation.id
          AND verification_receipt.receipt_digest IS NOT NULL AND verification_receipt.attestation_key_id IS NOT NULL
        WHERE assignment.id=observation.assignment_id AND assignment.workspace_id=item.workspace_id
          AND assignment.prospect_id=prospect.id AND assignment.contact_id=contact.id
          AND assignment.configuration_id=configuration.id AND assignment.configuration_digest=configuration.digest)
  );
  SELECT RAISE(ABORT, 'invalid outreach dispatch attempt preparation') WHERE NOT EXISTS (
    SELECT 1 FROM outreach_outbox_items item
    JOIN outreach_message_versions message_version ON message_version.id=item.message_version_id AND message_version.workspace_id=item.workspace_id
    JOIN outreach_package_versions package_version ON package_version.id=message_version.package_version_id AND package_version.workspace_id=item.workspace_id
    JOIN outreach_packages package ON package.id=package_version.package_id AND package.workspace_id=item.workspace_id
    JOIN profile_prospects prospect ON prospect.id=package.prospect_id AND prospect.workspace_id=item.workspace_id
    JOIN customer_profiles profile ON profile.id=package.profile_id AND profile.workspace_id=item.workspace_id
    JOIN market_plays play ON play.id=profile.play_id AND play.workspace_id=item.workspace_id
    JOIN products product ON product.id=play.product_id AND product.workspace_id=item.workspace_id
    JOIN companies company ON company.id=product.company_id AND company.workspace_id=item.workspace_id
    JOIN contacts contact ON contact.id=package.contact_id AND contact.workspace_id=item.workspace_id AND contact.company_id=company.id
    JOIN typed_configurations configuration ON configuration.id=package_version.configuration_id AND configuration.workspace_id=item.workspace_id
    JOIN outreach_pre_call_recheck_receipts receipt ON receipt.id=NEW.pre_call_receipt_id
      AND receipt.workspace_id=item.workspace_id AND receipt.outbox_item_id=item.id
    JOIN contact_eligibility_snapshots eligibility ON eligibility.id=receipt.contact_eligibility_snapshot_id AND eligibility.workspace_id=item.workspace_id
    JOIN outreach_recipient_dispatch_authorities recipient_authority ON recipient_authority.id=receipt.recipient_authority_id
      AND recipient_authority.workspace_id=item.workspace_id
    JOIN contact_point_observations observation ON observation.id=recipient_authority.email_observation_id AND observation.workspace_id=item.workspace_id
    JOIN outreach_sender_connections sender_connection ON sender_connection.id=item.sender_connection_id AND sender_connection.workspace_id=item.workspace_id
    WHERE item.id=NEW.outbox_item_id AND item.workspace_id=NEW.workspace_id
      AND prospect.state='approved' AND prospect.active=1 AND prospect.revision=package_version.prospect_revision
      AND contact.revision=package_version.contact_revision
      AND profile.lifecycle='ready' AND play.lifecycle='active' AND product.lifecycle='ready' AND company.status='active'
      AND configuration.active=1 AND configuration.digest=package_version.configuration_digest
      AND configuration.revision=package_version.configuration_revision
      AND eligibility.id=package_version.contact_eligibility_snapshot_id
      AND eligibility.state='ContactReady' AND eligibility.eligible=1
      AND eligibility.configuration_id=configuration.id AND eligibility.configuration_digest=configuration.digest
      AND eligibility.configuration_revision=configuration.revision
      AND eligibility.prospect_id=prospect.id AND eligibility.prospect_revision=prospect.revision
      AND json_array_length(eligibility.preserved_suppression_refs_json)=0
      AND EXISTS (SELECT 1 FROM json_each(eligibility.observation_ids_json) selected WHERE selected.value=observation.id)
      AND NOT EXISTS (SELECT 1 FROM outreach_message_versions later
        WHERE later.workspace_id=item.workspace_id AND later.message_id=message_version.message_id AND later.version>message_version.version)
      AND NOT EXISTS (SELECT 1 FROM outreach_package_versions later
        WHERE later.workspace_id=item.workspace_id AND later.package_id=package_version.package_id AND later.version>package_version.version)
      AND NOT EXISTS (SELECT 1 FROM contact_eligibility_snapshots later
        WHERE later.workspace_id=item.workspace_id AND later.prospect_id=eligibility.prospect_id
          AND later.contact_id=eligibility.contact_id AND later.id<>eligibility.id AND later.projected_at>=eligibility.projected_at)
      AND NOT EXISTS (SELECT 1 FROM contact_point_observations later
        WHERE later.workspace_id=item.workspace_id AND later.contact_id=observation.contact_id
          AND later.contact_point_digest=observation.contact_point_digest AND later.id<>observation.id
          AND later.observed_at>=observation.observed_at)
      AND NOT EXISTS (SELECT 1 FROM outreach_sender_connections later
        WHERE later.workspace_id=item.workspace_id AND later.provider=sender_connection.provider
          AND later.connection_subject_digest=sender_connection.connection_subject_digest
          AND later.protected_reference_version>sender_connection.protected_reference_version)
      AND NOT EXISTS (SELECT 1 FROM knowledge_drifts drift WHERE drift.workspace_id=item.workspace_id AND drift.status<>'resolved')
  );
  SELECT RAISE(ABORT, 'invalid outreach dispatch attempt preparation') WHERE EXISTS (
    SELECT 1 FROM outreach_outbox_items item
    JOIN outreach_message_versions message_version ON message_version.id=item.message_version_id AND message_version.workspace_id=item.workspace_id
    JOIN outreach_package_versions package_version ON package_version.id=message_version.package_version_id AND package_version.workspace_id=item.workspace_id
    JOIN outreach_packages package ON package.id=package_version.package_id AND package.workspace_id=item.workspace_id
    JOIN contacts contact ON contact.id=package.contact_id AND contact.workspace_id=item.workspace_id
    WHERE item.id=NEW.outbox_item_id AND item.workspace_id=NEW.workspace_id AND (
      EXISTS (SELECT 1 FROM outreach_suppression_tombstones suppression
        WHERE suppression.workspace_id=item.workspace_id AND suppression.effective_at<=NEW.prepared_at AND (
          suppression.subject_kind IN ('company','organization')
          OR (suppression.subject_kind='confirmed_email_domain' AND (
            NOT EXISTS (SELECT 1 FROM outreach_artifact_bindings binding
              JOIN contact_point_observations observation ON observation.id=binding.binding_id
              WHERE binding.workspace_id=item.workspace_id AND binding.artifact_kind='package_version'
                AND binding.artifact_id=package_version.id AND binding.binding_kind='contact_observation'
                AND observation.kind='email')
            OR EXISTS (SELECT 1 FROM outreach_artifact_bindings binding
              JOIN contact_point_observations observation ON observation.id=binding.binding_id
              LEFT JOIN outreach_contact_point_domains point_domain ON point_domain.workspace_id=item.workspace_id
                AND point_domain.contact_point_digest=observation.contact_point_digest
              WHERE binding.workspace_id=item.workspace_id AND binding.artifact_kind='package_version'
                AND binding.artifact_id=package_version.id AND binding.binding_kind='contact_observation'
                AND observation.kind='email' AND (point_domain.id IS NULL
                  OR EXISTS (SELECT 1 FROM json_each(point_domain.domain_digests_json) scope_domain
                    WHERE scope_domain.value=suppression.subject_digest
                      OR EXISTS (SELECT 1 FROM json_each(suppression.alias_snapshot_json) alias WHERE alias.value=scope_domain.value))))))
          OR (suppression.subject_kind='contact' AND suppression.channel IN ('email','all') AND (
            suppression.subject_digest=contact.identity_digest
            OR EXISTS (SELECT 1 FROM json_each(suppression.alias_snapshot_json) alias WHERE alias.value=contact.identity_digest)))
          OR (suppression.subject_kind='exact_email' AND EXISTS (
            SELECT 1 FROM outreach_artifact_bindings binding
            JOIN contact_point_observations observation ON observation.id=binding.binding_id
            WHERE binding.workspace_id=item.workspace_id AND binding.artifact_kind='package_version'
              AND binding.artifact_id=package_version.id AND binding.binding_kind='contact_observation'
              AND observation.kind='email' AND (suppression.subject_digest=observation.contact_point_digest
                OR EXISTS (SELECT 1 FROM json_each(suppression.alias_snapshot_json) alias
                  WHERE alias.value=observation.contact_point_digest))))))
      OR EXISTS (SELECT 1 FROM outreach_stop_events stop
        WHERE stop.workspace_id=item.workspace_id AND stop.effective_at<=NEW.prepared_at AND (
          stop.subject_kind IN ('company','organization')
          OR (stop.subject_kind='confirmed_email_domain' AND stop.stop_kind<>'suppression')
          OR (stop.subject_kind='contact' AND stop.stop_kind<>'suppression' AND stop.subject_digest=contact.identity_digest)
          OR EXISTS (SELECT 1 FROM outreach_artifact_bindings binding
            JOIN contact_point_observations observation ON observation.id=binding.binding_id
            WHERE binding.workspace_id=item.workspace_id AND binding.artifact_kind='package_version'
              AND binding.artifact_id=package_version.id AND binding.binding_kind='contact_observation'
              AND observation.kind='email' AND observation.contact_point_digest=stop.subject_digest)))
    )
  );
END;
--> statement-breakpoint
DROP TRIGGER outreach_dispatch_attempt_repreparation_guard;
--> statement-breakpoint
CREATE TRIGGER outreach_dispatch_attempt_repreparation_guard BEFORE INSERT ON outreach_dispatch_attempt_preparation_events WHEN NEW.event_kind='reprepared_no_invocation' BEGIN
  SELECT RAISE(ABORT, 'invalid outreach dispatch repreparation') WHERE
    NEW.provider_invocation_authorized<>0 OR NEW.provider_calls<>0
    OR NEW.reason_code<>'fresh_receipt_reprepared_no_invocation'
    OR NEW.effective_at<>NEW.created_at
    OR NOT EXISTS (
      SELECT 1 FROM outreach_dispatch_attempt_preparations preparation
      JOIN workspaces workspace ON workspace.id=preparation.workspace_id AND workspace.owner_subject=preparation.owner_subject
      JOIN outreach_dispatch_attempt_preparation_events prior ON prior.id=NEW.prior_event_id
        AND prior.workspace_id=preparation.workspace_id AND prior.preparation_id=preparation.id
      JOIN outreach_pre_call_recheck_receipts receipt ON receipt.id=NEW.pre_call_receipt_id
        AND receipt.workspace_id=preparation.workspace_id AND receipt.owner_subject=preparation.owner_subject
        AND receipt.outbox_item_id=preparation.outbox_item_id AND receipt.provider_invocation_authorized=0
      JOIN outreach_outbox_events lease_event ON lease_event.id=NEW.lease_event_id
        AND lease_event.workspace_id=preparation.workspace_id AND lease_event.outbox_item_id=preparation.outbox_item_id
      WHERE preparation.id=NEW.preparation_id AND preparation.workspace_id=NEW.workspace_id
        AND prior.event_kind='voided_before_invocation' AND prior.revision=NEW.revision-1
        AND prior.event_digest=NEW.prior_digest AND prior.id=(
          SELECT latest.id FROM outreach_dispatch_attempt_preparation_events latest
          WHERE latest.workspace_id=preparation.workspace_id AND latest.preparation_id=preparation.id
          ORDER BY latest.revision DESC LIMIT 1)
        AND prior.created_at<=NEW.created_at AND NEW.lease_generation>prior.lease_generation
        AND receipt.lease_event_id=lease_event.id AND receipt.lease_revision=lease_event.revision
        AND receipt.lease_generation=NEW.lease_generation AND receipt.lease_holder_id=NEW.lease_holder_id
        AND receipt.lease_expires_at=NEW.lease_expires_at
        AND receipt.created_at<=NEW.created_at AND receipt.valid_until>NEW.created_at
        AND lease_event.state='leased' AND lease_event.lease_generation=NEW.lease_generation
        AND lease_event.lease_holder_id=NEW.lease_holder_id AND lease_event.lease_expires_at=NEW.lease_expires_at
        AND lease_event.created_at<=NEW.created_at AND lease_event.lease_expires_at>NEW.created_at
        AND lease_event.id=(SELECT latest.id FROM outreach_outbox_events latest
          WHERE latest.workspace_id=preparation.workspace_id AND latest.outbox_item_id=preparation.outbox_item_id
          ORDER BY latest.revision DESC LIMIT 1)
        AND NOT EXISTS (SELECT 1 FROM outreach_outbox_events unsafe_history
          WHERE unsafe_history.workspace_id=preparation.workspace_id
            AND unsafe_history.outbox_item_id=preparation.outbox_item_id
            AND unsafe_history.state IN ('dispatching','sent','delivery_unknown'))
    );
  SELECT RAISE(ABORT, 'invalid outreach dispatch repreparation') WHERE NOT EXISTS (
    SELECT 1 FROM outreach_dispatch_attempt_preparations preparation
    JOIN outreach_outbox_items item ON item.id=preparation.outbox_item_id AND item.workspace_id=preparation.workspace_id
    JOIN outreach_message_approval_consumptions consumption ON consumption.id=item.approval_consumption_id
      AND consumption.workspace_id=item.workspace_id AND consumption.message_approval_id=item.message_approval_id
      AND consumption.send_key=item.send_key
    JOIN outreach_message_approvals message_approval ON message_approval.id=item.message_approval_id
      AND message_approval.workspace_id=item.workspace_id AND message_approval.owner_subject=preparation.owner_subject
      AND message_approval.message_version_id=item.message_version_id
      AND message_approval.approval_digest=consumption.approval_digest
    JOIN outreach_message_versions message_version ON message_version.id=item.message_version_id
      AND message_version.workspace_id=item.workspace_id AND message_version.artifact_digest=message_approval.artifact_digest
    JOIN outreach_package_approvals package_approval ON package_approval.id=message_approval.package_approval_id
      AND package_approval.workspace_id=item.workspace_id
    JOIN outreach_package_versions package_version ON package_version.id=message_version.package_version_id
      AND package_version.workspace_id=item.workspace_id AND package_version.artifact_digest=package_approval.artifact_digest
    JOIN outreach_pre_call_recheck_receipts receipt ON receipt.id=NEW.pre_call_receipt_id
      AND receipt.workspace_id=item.workspace_id AND receipt.outbox_item_id=item.id
    JOIN outreach_recipient_dispatch_authorities recipient_authority ON recipient_authority.id=receipt.recipient_authority_id
      AND recipient_authority.workspace_id=item.workspace_id AND recipient_authority.message_version_id=message_version.id
      AND recipient_authority.message_artifact_digest=message_version.artifact_digest
      AND recipient_authority.package_approval_id=package_approval.id
      AND recipient_authority.package_approval_digest=package_approval.approval_digest
      AND recipient_authority.acknowledgement_digest=message_approval.acknowledgement_digest
    WHERE preparation.id=NEW.preparation_id AND preparation.workspace_id=NEW.workspace_id
      AND message_approval.expires_at>NEW.created_at AND package_approval.expires_at>NEW.created_at
      AND (message_version.intended_send_at IS NULL OR message_version.intended_send_at<=NEW.created_at)
      AND recipient_authority.owner_subject=preparation.owner_subject AND recipient_authority.valid_until>NEW.created_at
      AND NOT EXISTS (SELECT 1 FROM outreach_approval_revocations revoked
        WHERE revoked.workspace_id=item.workspace_id AND revoked.message_approval_id=message_approval.id
          AND revoked.effective_at<=NEW.created_at)
      AND NOT EXISTS (SELECT 1 FROM outreach_approval_revocations revoked
        WHERE revoked.workspace_id=item.workspace_id AND revoked.package_approval_id=package_approval.id
          AND revoked.effective_at<=NEW.created_at)
  );
  SELECT RAISE(ABORT, 'invalid outreach dispatch repreparation') WHERE NOT EXISTS (
    SELECT 1 FROM outreach_dispatch_attempt_preparations preparation
    JOIN outreach_outbox_items item ON item.id=preparation.outbox_item_id AND item.workspace_id=preparation.workspace_id
    JOIN outreach_pre_call_recheck_receipts receipt ON receipt.id=NEW.pre_call_receipt_id
      AND receipt.workspace_id=item.workspace_id AND receipt.outbox_item_id=item.id
    JOIN outreach_recipient_dispatch_authorities recipient_authority ON recipient_authority.id=receipt.recipient_authority_id
      AND recipient_authority.workspace_id=item.workspace_id
    JOIN outreach_unsubscribe_authority_events unsubscribe ON unsubscribe.id=receipt.unsubscribe_event_id
      AND unsubscribe.workspace_id=item.workspace_id AND unsubscribe.recipient_authority_id=recipient_authority.id
    JOIN outreach_sender_connections sender_connection ON sender_connection.id=item.sender_connection_id
      AND sender_connection.workspace_id=item.workspace_id
    JOIN outreach_sender_capability_snapshots sender_capability ON sender_capability.id=receipt.sender_capability_id
      AND sender_capability.workspace_id=item.workspace_id AND sender_capability.sender_connection_id=sender_connection.id
      AND sender_capability.connection_subject_digest=sender_connection.connection_subject_digest
    JOIN outreach_sender_verified_addresses sender_address ON sender_address.id=receipt.sender_verified_address_id
      AND sender_address.workspace_id=item.workspace_id AND sender_address.sender_capability_id=sender_capability.id
      AND sender_address.address_digest=recipient_authority.sender_address_digest
    JOIN contact_point_observations observation ON observation.id=recipient_authority.email_observation_id
      AND observation.workspace_id=item.workspace_id AND observation.contact_id=recipient_authority.contact_id
    JOIN sources basis_source ON basis_source.id=recipient_authority.basis_source_id AND basis_source.workspace_id=item.workspace_id
    WHERE preparation.id=NEW.preparation_id AND preparation.workspace_id=NEW.workspace_id
      AND unsubscribe.status='working' AND unsubscribe.valid_until>NEW.created_at
      AND unsubscribe.id=(SELECT latest.id FROM outreach_unsubscribe_authority_events latest
        WHERE latest.workspace_id=item.workspace_id AND latest.recipient_authority_id=recipient_authority.id
        ORDER BY latest.revision DESC LIMIT 1)
      AND sender_connection.provider='gmail' AND sender_connection.status='active'
      AND sender_capability.expires_at>NEW.created_at AND sender_address.expires_at>NEW.created_at
      AND json_array_length(sender_capability.granted_scopes_json)=2
      AND EXISTS (SELECT 1 FROM json_each(sender_capability.granted_scopes_json) scope
        WHERE scope.value='https://www.googleapis.com/auth/gmail.send')
      AND EXISTS (SELECT 1 FROM json_each(sender_capability.granted_scopes_json) scope
        WHERE scope.value='https://www.googleapis.com/auth/gmail.readonly')
      AND basis_source.source_digest=recipient_authority.basis_source_digest AND basis_source.status='available'
      AND observation.contact_point_digest=recipient_authority.recipient_address_digest
      AND ((observation.verification_class='mailbox_verified' AND observation.method='mailbox_verification'
            AND observation.verified_at+2592000000>NEW.created_at)
        OR (observation.verification_class='source_verified' AND observation.method='authoritative_source_reconfirmed'
            AND observation.verified_at+7776000000>NEW.created_at))
  );
  SELECT RAISE(ABORT, 'invalid outreach dispatch repreparation') WHERE NOT EXISTS (
    SELECT 1 FROM outreach_dispatch_attempt_preparations preparation
    JOIN outreach_outbox_items item ON item.id=preparation.outbox_item_id AND item.workspace_id=preparation.workspace_id
    JOIN outreach_message_versions message_version ON message_version.id=item.message_version_id AND message_version.workspace_id=item.workspace_id
    JOIN outreach_package_versions package_version ON package_version.id=message_version.package_version_id AND package_version.workspace_id=item.workspace_id
    JOIN outreach_packages package ON package.id=package_version.package_id AND package.workspace_id=item.workspace_id
    JOIN profile_prospects prospect ON prospect.id=package.prospect_id AND prospect.workspace_id=item.workspace_id
    JOIN contacts contact ON contact.id=package.contact_id AND contact.workspace_id=item.workspace_id
    JOIN typed_configurations configuration ON configuration.id=package_version.configuration_id AND configuration.workspace_id=item.workspace_id
    JOIN outreach_pre_call_recheck_receipts receipt ON receipt.id=NEW.pre_call_receipt_id
      AND receipt.workspace_id=item.workspace_id AND receipt.outbox_item_id=item.id
    JOIN outreach_recipient_dispatch_authorities recipient_authority ON recipient_authority.id=receipt.recipient_authority_id
      AND recipient_authority.workspace_id=item.workspace_id
    JOIN contact_point_observations observation ON observation.id=recipient_authority.email_observation_id AND observation.workspace_id=item.workspace_id
    JOIN sources basis_source ON basis_source.id=recipient_authority.basis_source_id AND basis_source.workspace_id=item.workspace_id
    WHERE preparation.id=NEW.preparation_id AND preparation.workspace_id=NEW.workspace_id
      AND EXISTS (SELECT 1 FROM outreach_artifact_bindings binding
        WHERE binding.workspace_id=item.workspace_id AND binding.artifact_kind='package_version'
          AND binding.artifact_id=package_version.id AND binding.binding_kind='source'
          AND binding.binding_id=basis_source.id AND binding.binding_digest=basis_source.source_digest)
      AND EXISTS (SELECT 1 FROM outreach_artifact_bindings binding
        WHERE binding.workspace_id=item.workspace_id AND binding.artifact_kind='package_version'
          AND binding.artifact_id=package_version.id AND binding.binding_kind='contact_observation'
          AND binding.binding_id=observation.id AND binding.binding_digest=observation.observation_digest)
      AND NOT EXISTS (SELECT 1 FROM outreach_artifact_bindings binding
        LEFT JOIN sources bound_source ON bound_source.id=binding.binding_id AND bound_source.workspace_id=binding.workspace_id
        WHERE binding.workspace_id=item.workspace_id AND binding.artifact_kind='package_version'
          AND binding.artifact_id=package_version.id AND binding.binding_kind='source'
          AND (bound_source.id IS NULL OR bound_source.status<>'available' OR bound_source.source_digest<>binding.binding_digest))
      AND NOT EXISTS (SELECT 1 FROM outreach_artifact_bindings binding
        LEFT JOIN knowledge_versions guardrail ON guardrail.id=binding.binding_id AND guardrail.workspace_id=binding.workspace_id
        WHERE binding.workspace_id=item.workspace_id AND binding.artifact_kind='package_version'
          AND binding.artifact_id=package_version.id AND binding.binding_kind='claim_guardrail'
          AND (guardrail.id IS NULL OR guardrail.status<>'confirmed' OR guardrail.value_digest<>binding.binding_digest))
      AND EXISTS (SELECT 1 FROM contact_evidence_assignments assignment
        JOIN contact_verification_receipts verification_receipt ON verification_receipt.id=observation.verification_receipt_id
          AND verification_receipt.workspace_id=item.workspace_id AND verification_receipt.observation_id=observation.id
          AND verification_receipt.receipt_digest IS NOT NULL AND verification_receipt.attestation_key_id IS NOT NULL
        WHERE assignment.id=observation.assignment_id AND assignment.workspace_id=item.workspace_id
          AND assignment.prospect_id=prospect.id AND assignment.contact_id=contact.id
          AND assignment.configuration_id=configuration.id AND assignment.configuration_digest=configuration.digest)
  );
  SELECT RAISE(ABORT, 'invalid outreach dispatch repreparation') WHERE NOT EXISTS (
    SELECT 1 FROM outreach_dispatch_attempt_preparations preparation
    JOIN outreach_outbox_items item ON item.id=preparation.outbox_item_id AND item.workspace_id=preparation.workspace_id
    JOIN outreach_message_versions message_version ON message_version.id=item.message_version_id AND message_version.workspace_id=item.workspace_id
    JOIN outreach_package_versions package_version ON package_version.id=message_version.package_version_id AND package_version.workspace_id=item.workspace_id
    JOIN outreach_packages package ON package.id=package_version.package_id AND package.workspace_id=item.workspace_id
    JOIN profile_prospects prospect ON prospect.id=package.prospect_id AND prospect.workspace_id=item.workspace_id
    JOIN customer_profiles profile ON profile.id=package.profile_id AND profile.workspace_id=item.workspace_id
    JOIN market_plays play ON play.id=profile.play_id AND play.workspace_id=item.workspace_id
    JOIN products product ON product.id=play.product_id AND product.workspace_id=item.workspace_id
    JOIN companies company ON company.id=product.company_id AND company.workspace_id=item.workspace_id
    JOIN contacts contact ON contact.id=package.contact_id AND contact.workspace_id=item.workspace_id AND contact.company_id=company.id
    JOIN typed_configurations configuration ON configuration.id=package_version.configuration_id AND configuration.workspace_id=item.workspace_id
    JOIN outreach_pre_call_recheck_receipts receipt ON receipt.id=NEW.pre_call_receipt_id
      AND receipt.workspace_id=item.workspace_id AND receipt.outbox_item_id=item.id
    JOIN contact_eligibility_snapshots eligibility ON eligibility.id=receipt.contact_eligibility_snapshot_id AND eligibility.workspace_id=item.workspace_id
    JOIN outreach_recipient_dispatch_authorities recipient_authority ON recipient_authority.id=receipt.recipient_authority_id
      AND recipient_authority.workspace_id=item.workspace_id
    JOIN contact_point_observations observation ON observation.id=recipient_authority.email_observation_id AND observation.workspace_id=item.workspace_id
    JOIN outreach_sender_connections sender_connection ON sender_connection.id=item.sender_connection_id AND sender_connection.workspace_id=item.workspace_id
    WHERE preparation.id=NEW.preparation_id AND preparation.workspace_id=NEW.workspace_id
      AND prospect.state='approved' AND prospect.active=1 AND prospect.revision=package_version.prospect_revision
      AND contact.revision=package_version.contact_revision
      AND profile.lifecycle='ready' AND play.lifecycle='active' AND product.lifecycle='ready' AND company.status='active'
      AND configuration.active=1 AND configuration.digest=package_version.configuration_digest
      AND configuration.revision=package_version.configuration_revision
      AND eligibility.id=package_version.contact_eligibility_snapshot_id
      AND eligibility.state='ContactReady' AND eligibility.eligible=1
      AND eligibility.configuration_id=configuration.id AND eligibility.configuration_digest=configuration.digest
      AND eligibility.configuration_revision=configuration.revision
      AND eligibility.prospect_id=prospect.id AND eligibility.prospect_revision=prospect.revision
      AND json_array_length(eligibility.preserved_suppression_refs_json)=0
      AND EXISTS (SELECT 1 FROM json_each(eligibility.observation_ids_json) selected WHERE selected.value=observation.id)
      AND NOT EXISTS (SELECT 1 FROM outreach_message_versions later
        WHERE later.workspace_id=item.workspace_id AND later.message_id=message_version.message_id AND later.version>message_version.version)
      AND NOT EXISTS (SELECT 1 FROM outreach_package_versions later
        WHERE later.workspace_id=item.workspace_id AND later.package_id=package_version.package_id AND later.version>package_version.version)
      AND NOT EXISTS (SELECT 1 FROM contact_eligibility_snapshots later
        WHERE later.workspace_id=item.workspace_id AND later.prospect_id=eligibility.prospect_id
          AND later.contact_id=eligibility.contact_id AND later.id<>eligibility.id AND later.projected_at>=eligibility.projected_at)
      AND NOT EXISTS (SELECT 1 FROM contact_point_observations later
        WHERE later.workspace_id=item.workspace_id AND later.contact_id=observation.contact_id
          AND later.contact_point_digest=observation.contact_point_digest AND later.id<>observation.id
          AND later.observed_at>=observation.observed_at)
      AND NOT EXISTS (SELECT 1 FROM outreach_sender_connections later
        WHERE later.workspace_id=item.workspace_id AND later.provider=sender_connection.provider
          AND later.connection_subject_digest=sender_connection.connection_subject_digest
          AND later.protected_reference_version>sender_connection.protected_reference_version)
      AND NOT EXISTS (SELECT 1 FROM knowledge_drifts drift WHERE drift.workspace_id=item.workspace_id AND drift.status<>'resolved')
  );
  SELECT RAISE(ABORT, 'invalid outreach dispatch repreparation') WHERE EXISTS (
    SELECT 1 FROM outreach_dispatch_attempt_preparations preparation
    JOIN outreach_outbox_items item ON item.id=preparation.outbox_item_id AND item.workspace_id=preparation.workspace_id
    JOIN outreach_message_versions message_version ON message_version.id=item.message_version_id AND message_version.workspace_id=item.workspace_id
    JOIN outreach_package_versions package_version ON package_version.id=message_version.package_version_id AND package_version.workspace_id=item.workspace_id
    JOIN outreach_packages package ON package.id=package_version.package_id AND package.workspace_id=item.workspace_id
    JOIN contacts contact ON contact.id=package.contact_id AND contact.workspace_id=item.workspace_id
    WHERE preparation.id=NEW.preparation_id AND preparation.workspace_id=NEW.workspace_id AND (
      EXISTS (SELECT 1 FROM outreach_suppression_tombstones suppression
        WHERE suppression.workspace_id=item.workspace_id AND suppression.effective_at<=NEW.created_at AND (
          suppression.subject_kind IN ('company','organization')
          OR (suppression.subject_kind='confirmed_email_domain' AND (
            NOT EXISTS (SELECT 1 FROM outreach_artifact_bindings binding
              JOIN contact_point_observations observation ON observation.id=binding.binding_id
              WHERE binding.workspace_id=item.workspace_id AND binding.artifact_kind='package_version'
                AND binding.artifact_id=package_version.id AND binding.binding_kind='contact_observation'
                AND observation.kind='email')
            OR EXISTS (SELECT 1 FROM outreach_artifact_bindings binding
              JOIN contact_point_observations observation ON observation.id=binding.binding_id
              LEFT JOIN outreach_contact_point_domains point_domain ON point_domain.workspace_id=item.workspace_id
                AND point_domain.contact_point_digest=observation.contact_point_digest
              WHERE binding.workspace_id=item.workspace_id AND binding.artifact_kind='package_version'
                AND binding.artifact_id=package_version.id AND binding.binding_kind='contact_observation'
                AND observation.kind='email' AND (point_domain.id IS NULL
                  OR EXISTS (SELECT 1 FROM json_each(point_domain.domain_digests_json) scope_domain
                    WHERE scope_domain.value=suppression.subject_digest
                      OR EXISTS (SELECT 1 FROM json_each(suppression.alias_snapshot_json) alias WHERE alias.value=scope_domain.value))))))
          OR (suppression.subject_kind='contact' AND suppression.channel IN ('email','all') AND (
            suppression.subject_digest=contact.identity_digest
            OR EXISTS (SELECT 1 FROM json_each(suppression.alias_snapshot_json) alias WHERE alias.value=contact.identity_digest)))
          OR (suppression.subject_kind='exact_email' AND EXISTS (
            SELECT 1 FROM outreach_artifact_bindings binding
            JOIN contact_point_observations observation ON observation.id=binding.binding_id
            WHERE binding.workspace_id=item.workspace_id AND binding.artifact_kind='package_version'
              AND binding.artifact_id=package_version.id AND binding.binding_kind='contact_observation'
              AND observation.kind='email' AND (suppression.subject_digest=observation.contact_point_digest
                OR EXISTS (SELECT 1 FROM json_each(suppression.alias_snapshot_json) alias
                  WHERE alias.value=observation.contact_point_digest))))))
      OR EXISTS (SELECT 1 FROM outreach_stop_events stop
        WHERE stop.workspace_id=item.workspace_id AND stop.effective_at<=NEW.created_at AND (
          stop.subject_kind IN ('company','organization')
          OR (stop.subject_kind='confirmed_email_domain' AND stop.stop_kind<>'suppression')
          OR (stop.subject_kind='contact' AND stop.stop_kind<>'suppression' AND stop.subject_digest=contact.identity_digest)
          OR EXISTS (SELECT 1 FROM outreach_artifact_bindings binding
            JOIN contact_point_observations observation ON observation.id=binding.binding_id
            WHERE binding.workspace_id=item.workspace_id AND binding.artifact_kind='package_version'
              AND binding.artifact_id=package_version.id AND binding.binding_kind='contact_observation'
              AND observation.kind='email' AND observation.contact_point_digest=stop.subject_digest)))
    )
  );
END;
