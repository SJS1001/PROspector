import assert from "node:assert/strict";
import test from "node:test";

import {
  applyMigrations,
  countRows,
  createD1Fixture,
} from "./helpers/d1.mjs";
import { seedProfileAuthority } from "./helpers/phase4.mjs";

const NOW = 1_790_500_000_000;
const OWNER = {
  subject: "phase5-redteam-owner",
  legacySubject: "phase5-redteam-owner-legacy",
  displayName: "Phase 5 red-team owner",
};

test("direct SQL cannot manufacture verified evidence or ContactReady without a bound durable receipt and settled reservation", async () => {
  const fixture = await createD1Fixture("phase5-redteam-contact-receipt");
  try {
    await applyMigrations(fixture.database);
    const seeded = await seedApprovedProspect(fixture);
    const repositoryModule = await fixture.vite.ssrLoadModule(
      new URL("../domain/enrichment-repository.ts", import.meta.url).pathname,
    );
    const issuance = await fixture.vite.ssrLoadModule(
      new URL("../domain/enrichment-grant-issuance.ts", import.meta.url).pathname,
    );
    const repository = repositoryModule.createD1EnrichmentRepository(fixture.database, {
      workspaceId: seeded.workspaceId,
      ownerSubject: OWNER.subject,
      now: () => NOW,
    });

    await fixture.database.prepare(
      `INSERT INTO provider_quotes
        (id,workspace_id,provider_id,provider_version,catalog_ref,revision,operation,currency,
         unit_cost_minor,quote_digest,expires_at,created_at)
       VALUES ('redteam-contact-quote',?,'provider-redteam','v1','catalog-redteam',1,
         'business_contact_lookup/v1','CAD',10,?,?,?)`,
    ).bind(seeded.workspaceId, "1".repeat(64), NOW + 10_000, NOW - 1).run();

    const snapshot = await repository.loadIssuanceSnapshot(OWNER.subject, [seeded.prospectId]);
    assert.ok(snapshot);
    const issued = await issuance.issueEnrichmentGrant(repository, {
      principalSubject: OWNER.subject,
      prospectIds: [seeded.prospectId],
      operation: "business_contact_lookup/v1",
      maxUnits: 1,
      maxCostMinor: 10,
      currency: "CAD",
      expiresAt: NOW + 5_000,
      expectedRevision: snapshot.revision,
      idempotencyKey: "phase5-redteam-contact-grant",
      now: NOW,
    });
    assert.equal(issued.kind, "issued");

    const company = await fixture.database.prepare(
      "SELECT id FROM companies WHERE workspace_id=? LIMIT 1",
    ).bind(seeded.workspaceId).first();
    await fixture.database.batch([
      fixture.database.prepare(
        `INSERT INTO contacts
          (id,workspace_id,created_at,updated_at,revision,company_id,identity_digest,display_name)
         VALUES ('redteam-contact',?,?,?,1,?,?,'Synthetic Red-team Contact')`,
      ).bind(seeded.workspaceId, NOW, NOW, company.id, "2".repeat(64)),
      fixture.database.prepare(
        `INSERT INTO contact_evidence_assignments
          (id,workspace_id,reservation_id,grant_id,prospect_id,contact_id,role,configuration_id,
           configuration_digest,provider_id,provider_version,catalog_ref,quote_revision,
           assignment_digest,created_at)
         VALUES ('redteam-contact-assignment',?,NULL,?,'redteam-prospect','redteam-contact',
           'champion',?,?,?,?,?,1,?,?)`,
      ).bind(
        seeded.workspaceId,
        issued.grant.id,
        issued.grant.tuple.configurationId,
        issued.grant.tuple.configurationDigest,
        issued.grant.tuple.providerId,
        issued.grant.tuple.providerVersion,
        issued.grant.tuple.catalogRef,
        "3".repeat(64),
        NOW,
      ),
    ]);

    const observationError = await captureFailure(() => fixture.database.prepare(
      `INSERT INTO contact_point_observations (
        id,workspace_id,assignment_id,contact_id,configuration_id,configuration_digest,kind,
        contact_point_digest,contact_point_reference,verification_class,confidence_basis_points,method,
        source_reference,excerpt_digest,object_reference,content_hash,retrieved_at,observed_at,verified_at,
        provider_id,provider_version,catalog_ref,verifier_id,verifier_version,verdict_reference,verdict_digest,
        parent_observation_id,observation_digest,created_at
      ) VALUES (
        'redteam-forged-observation',?,'redteam-contact-assignment','redteam-contact',?,?,'email',
        ?,'contact-point:forged','mailbox_verified',9900,'mailbox_verification',
        'source:forged',?,'object:forged',?,?,?,?,
        ?,?,?,'forged-verifier','v1','verdict:forged',?,
        NULL,?,?
      )`,
    ).bind(
      seeded.workspaceId,
      issued.grant.tuple.configurationId,
      issued.grant.tuple.configurationDigest,
      "4".repeat(64),
      "5".repeat(64),
      "6".repeat(64),
      NOW - 2_000,
      NOW - 500,
      NOW - 1_000,
      issued.grant.tuple.providerId,
      issued.grant.tuple.providerVersion,
      issued.grant.tuple.catalogRef,
      "7".repeat(64),
      "8".repeat(64),
      NOW,
    ).run());

    const lineage = await fixture.database.prepare(
      `SELECT p.revision prospect_revision,c.revision configuration_revision,c.digest configuration_digest
       FROM profile_prospects p
       JOIN typed_configurations c
         ON c.id=? AND c.workspace_id=p.workspace_id AND c.owner_type='profile'
        AND c.owner_id=p.profile_id AND c.kind='profile_effective' AND c.active=1
       WHERE p.id='redteam-prospect' AND p.workspace_id=?`,
    ).bind(seeded.configurationId, seeded.workspaceId).first();
    assert.ok(lineage);
    const eligibilityError = await captureFailure(() => fixture.database.prepare(
      `INSERT INTO contact_eligibility_snapshots (
        id,workspace_id,contact_id,prospect_id,configuration_id,configuration_digest,
        configuration_revision,prospect_revision,state,eligible,observation_ids_json,
        reason_codes_json,preserved_suppression_refs_json,snapshot_digest,projected_at
      ) VALUES (
        'redteam-forged-ready',?,'redteam-contact','redteam-prospect',?,?,?,?,
        'ContactReady',1,'["redteam-forged-observation"]','[]','[]',?,?
      )`,
    ).bind(
      seeded.workspaceId,
      seeded.configurationId,
      lineage.configuration_digest,
      Number(lineage.configuration_revision),
      Number(lineage.prospect_revision),
      "9".repeat(64),
      NOW,
    ).run());

    const defects = [];
    if (!observationError) defects.push("forged verified observation persisted");
    if (!eligibilityError) defects.push("forged ContactReady snapshot persisted");
    assert.deepEqual(defects, [], defects.join("; "));
    assert.equal(await countRows(fixture.database, "contact_point_observations"), 0);
    assert.equal(await countRows(fixture.database, "contact_eligibility_snapshots"), 0);
  } finally {
    await fixture.dispose();
  }
});

test("raw runner grant and account rows without owner command, audit, and canonical issuance cannot drive reservation", async () => {
  const fixture = await createD1Fixture("phase5-redteam-runner-issuance");
  try {
    await applyMigrations(fixture.database);
    const runner = await fixture.vite.ssrLoadModule(
      new URL("../domain/runner-spend-authority.ts", import.meta.url).pathname,
    );
    const repositoryModule = await fixture.vite.ssrLoadModule(
      new URL("../domain/enrichment-repository.ts", import.meta.url).pathname,
    );
    const workspaceId = "redteam-runner-workspace";
    const ownerSubject = "redteam-runner-owner";
    await fixture.database.prepare(
      `INSERT INTO workspaces
        (id,company_name,owner_subject,created_at,updated_at,revision)
       VALUES (?, 'Red-team Runner Workspace', ?, ?, ?, 1)`,
    ).bind(workspaceId, ownerSubject, NOW, NOW).run();

    const grant = {
      authorityType: "runner_spend",
      id: "redteam-raw-runner-grant",
      providerId: "runner-provider",
      model: "runner-model",
      catalogRef: "runner-catalog",
      runType: "prospecting",
      scopeId: "runner-profile",
      perRunCostMinor: 1_000,
      monthlyCostMinor: 10_000,
      currency: "CAD",
      expiresAt: NOW + 10_000,
      maxRetries: 0,
    };
    const attempt = {
      attemptNumber: 0,
      previousOutcome: "none",
      previousOperationKeys: [],
    };
    const operationKey = await runner.deriveRunnerOperationKey({
      workspaceId,
      principalSubject: ownerSubject,
      grant,
      attempt,
    });
    const period = runner.deriveRunnerUtcMonthPeriod(NOW);
    const perRunId = runner.deriveRunnerPerRunAccountId({
      workspaceId,
      principalSubject: ownerSubject,
      grantId: grant.id,
      providerId: grant.providerId,
      scopeId: grant.scopeId,
      attemptNumber: 0,
      operationKey,
    });
    const monthlyId = runner.deriveRunnerMonthlyAccountId({
      workspaceId,
      principalSubject: ownerSubject,
      providerId: grant.providerId,
      scopeId: grant.scopeId,
      period,
    });

    const rawInsertError = await captureFailure(() => fixture.database.batch([
      fixture.database.prepare(
        `INSERT INTO runner_spend_grants (
          id,workspace_id,owner_subject,provider_id,model,catalog_ref,run_type,scope_id,
          per_run_cost_minor,monthly_cost_minor,currency,max_retries,grant_digest,nonce,
          expires_at,created_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      ).bind(
        grant.id,
        workspaceId,
        ownerSubject,
        grant.providerId,
        grant.model,
        grant.catalogRef,
        grant.runType,
        grant.scopeId,
        grant.perRunCostMinor,
        grant.monthlyCostMinor,
        grant.currency,
        grant.maxRetries,
        "a".repeat(64),
        "raw-untrusted-nonce",
        grant.expiresAt,
        NOW - 1,
      ),
      fixture.database.prepare(
        `INSERT INTO runner_budget_accounts (
          id,workspace_id,scope,owner_subject,provider_id,scope_id,period,attempt_number,
          operation_key,currency,actual_cost_minor,reserved_cost_minor,max_cost_minor,
          revision,created_at,updated_at
        ) VALUES (?,?,'runner_monthly',?,?,?,?,NULL,NULL,?,0,0,?,1,?,?)`,
      ).bind(
        monthlyId,
        workspaceId,
        ownerSubject,
        grant.providerId,
        grant.scopeId,
        period,
        grant.currency,
        grant.monthlyCostMinor,
        NOW,
        NOW,
      ),
      fixture.database.prepare(
        `INSERT INTO runner_budget_accounts (
          id,workspace_id,scope,owner_subject,provider_id,scope_id,period,attempt_number,
          operation_key,currency,actual_cost_minor,reserved_cost_minor,max_cost_minor,
          revision,created_at,updated_at
        ) VALUES (?,?,'runner_per_run',?,?,?,NULL,0,?,?,0,0,?,1,?,?)`,
      ).bind(
        perRunId,
        workspaceId,
        ownerSubject,
        grant.providerId,
        grant.scopeId,
        operationKey,
        grant.currency,
        grant.perRunCostMinor,
        NOW,
        NOW,
      ),
    ]));

    let loaded = null;
    let reservationKind = "blocked";
    if (!rawInsertError) {
      const repository = repositoryModule.createD1RunnerSpendRepository(fixture.database, {
        workspaceId,
        ownerSubject,
        now: () => NOW,
      });
      loaded = await repository.loadRunnerAuthority(grant.id);
      const reservation = await runner.reserveRunnerSpend(repository, {
        grantId: grant.id,
        principalSubject: ownerSubject,
        operationKey,
        now: NOW,
      });
      reservationKind = reservation.kind;
    }

    assert.deepEqual(
      {
        loaderAdmittedRawAuthority: loaded !== null,
        rawAuthorityReservedSpend: reservationKind === "reserved",
      },
      {
        loaderAdmittedRawAuthority: false,
        rawAuthorityReservedSpend: false,
      },
      "uncommanded, unaudited, non-canonical runner rows must fail before reservation",
    );
  } finally {
    await fixture.dispose();
  }
});

test("malformed identity suggestion, decision, lineage, and suppression shapes cannot persist", async () => {
  const fixture = await createD1Fixture("phase5-redteam-identity-shapes");
  try {
    await applyMigrations(fixture.database);
    await fixture.database.batch([
      fixture.database.prepare(
        `INSERT INTO workspaces
          (id,company_name,owner_subject,created_at,updated_at,revision)
         VALUES ('redteam-identity-workspace','Identity Red-team','redteam-identity-owner',?,?,1)`,
      ).bind(NOW, NOW),
      fixture.database.prepare(
        `INSERT INTO companies
          (id,workspace_id,created_at,updated_at,revision,name,status)
         VALUES ('redteam-identity-company','redteam-identity-workspace',?,?,1,'Identity Company','active')`,
      ).bind(NOW, NOW),
      fixture.database.prepare(
        `INSERT INTO contacts
          (id,workspace_id,created_at,updated_at,revision,company_id,identity_digest,display_name)
         VALUES ('redteam-source-contact','redteam-identity-workspace',?,?,1,
           'redteam-identity-company',?,'Source Contact')`,
      ).bind(NOW, NOW, "b".repeat(64)),
      fixture.database.prepare(
        `INSERT INTO contacts
          (id,workspace_id,created_at,updated_at,revision,company_id,identity_digest,display_name)
         VALUES ('redteam-target-contact','redteam-identity-workspace',?,?,1,
           'redteam-identity-company',?,'Target Contact')`,
      ).bind(NOW, NOW, "c".repeat(64)),
    ]);

    await captureFailure(() => fixture.database.prepare(
      `INSERT INTO identity_suggestions (
        id,workspace_id,owner_subject,subject_kind,kind,revision,candidate_revisions_json,
        source_lineage_ids_json,retained_identity_lineage_ids_json,retained_aliases_json,
        retained_suppression_subject_refs_json,proposed_partition_json,suggestion_digest,created_at
      ) VALUES (
        'redteam-malformed-split','redteam-identity-workspace','redteam-identity-owner',
        'contact','split',1,'not-json','not-json','not-json','not-json','not-json',
        NULL,?,?
      )`,
    ).bind("d".repeat(64), NOW).run());

    await captureFailure(() => fixture.database.prepare(
      `INSERT INTO identity_suggestions (
        id,workspace_id,owner_subject,subject_kind,kind,revision,candidate_revisions_json,
        source_lineage_ids_json,retained_identity_lineage_ids_json,retained_aliases_json,
        retained_suppression_subject_refs_json,proposed_partition_json,suggestion_digest,created_at
      ) VALUES (
        'redteam-incomplete-merge','redteam-identity-workspace','redteam-identity-owner',
        'contact','merge',1,'{"redteam-source-contact":1}','[]','[]','[]','[]',
        NULL,?,?
      )`,
    ).bind("e".repeat(64), NOW).run());

    await captureFailure(() => fixture.database.prepare(
      `INSERT INTO identity_decisions (
        id,workspace_id,suggestion_id,owner_subject,subject_kind,kind,decision_json,
        idempotency_key,operation_digest,result_digest,retained_source_lineage_ids_json,
        retained_identity_lineage_ids_json,retained_aliases_json,
        retained_suppression_subject_refs_json,repointed_association_ids_json,
        invalidations_json,created_at
      ) VALUES (
        'redteam-malformed-decision','redteam-identity-workspace','redteam-malformed-split',
        'redteam-identity-owner','contact','split','not-json','redteam-decision-key',
        ?,?,'not-json','not-json','not-json','not-json','not-json','not-json',?
      )`,
    ).bind("f".repeat(64), "0".repeat(64), NOW).run());

    await captureFailure(() => fixture.database.prepare(
      `INSERT INTO identity_lineage (
        id,workspace_id,decision_id,subject_kind,source_subject_id,target_subject_id,
        relationship,retained_source_lineage_ids_json,retained_identity_lineage_ids_json,
        retained_aliases_json,retained_suppression_subject_refs_json,lineage_digest,created_at
      ) VALUES (
        'redteam-malformed-lineage','redteam-identity-workspace','redteam-malformed-decision',
        'contact','redteam-source-contact','redteam-target-contact','split_from',
        'not-json','not-json','not-json','not-json',?,?
      )`,
    ).bind("1".repeat(64), NOW).run());

    assert.deepEqual(
      {
        suggestions: await countRows(fixture.database, "identity_suggestions"),
        decisions: await countRows(fixture.database, "identity_decisions"),
        lineage: await countRows(fixture.database, "identity_lineage"),
      },
      { suggestions: 0, decisions: 0, lineage: 0 },
      "invalid JSON, incomplete merge/split shape, and lost suppression/lineage cannot become immutable history",
    );
  } finally {
    await fixture.dispose();
  }
});

async function seedApprovedProspect(fixture) {
  const seeded = await seedProfileAuthority(fixture, OWNER, NOW);
  const readiness = await fixture.vite.ssrLoadModule(
    new URL("../domain/profile-readiness.ts", import.meta.url).pathname,
  );
  const candidate = await readiness.createProfileConfigurationCandidate(fixture.database, OWNER, {
    profileId: seeded.profileId,
    expectedProfileRevision: seeded.revision,
    now: NOW,
    idempotencyKey: "0198f500-0000-7000-8000-000000000501",
  });
  const activation = await readiness.activateProfileConfiguration(fixture.database, OWNER, {
    candidateId: candidate.id,
    expectedRevision: candidate.revision,
    expectedDigest: candidate.digest,
    now: NOW,
    idempotencyKey: "0198f500-0000-7000-8000-000000000502",
  });
  const workspaceId = seeded.workspaceId;
  await fixture.database.batch([
    fixture.database.prepare(
      `INSERT INTO authority_commands (
        id,workspace_id,created_at,updated_at,revision,command_type,idempotency_key,
        operation_digest,expected_revision,subject_type,subject_id,status
      ) VALUES (
        'redteam-assignment-command',?,?,?,1,'test.phase5.redteam.assignment',
        'redteam-assignment-key',?,1,'prospecting_run',?,'accepted'
      )`,
    ).bind(workspaceId, NOW, NOW, "2".repeat(64), activation.initialRun.id),
    fixture.database.prepare(
      `INSERT INTO audit_events (
        id,workspace_id,actor_type,actor_id,action,subject_type,subject_id,detail_json,created_at
      ) VALUES (
        'redteam-assignment-audit',?,'system','test','test.phase5.redteam',
        'prospecting_run',?,'{}',?
      )`,
    ).bind(workspaceId, activation.initialRun.id, NOW),
    fixture.database.prepare(
      "UPDATE prospecting_runs SET execution_state='queued' WHERE id=? AND workspace_id=?",
    ).bind(activation.initialRun.id, workspaceId),
    fixture.database.prepare(
      `INSERT INTO runner_assignments (
        id,workspace_id,created_at,updated_at,revision,run_id,profile_id,configuration_id,
        configuration_digest,audience,token_hash,nonce_hash,instruction_version,
        tool_configuration_digest,quota_json,quota_digest,expires_at,status,
        authority_command_id,audit_event_id
      ) VALUES (
        'redteam-assignment',?,?,?,1,?,?,?,?,'phase5-redteam',?,?,'v1',?,'{}',?,?,
        'issued','redteam-assignment-command','redteam-assignment-audit'
      )`,
    ).bind(
      workspaceId,
      NOW,
      NOW,
      activation.initialRun.id,
      seeded.profileId,
      activation.configuration.id,
      activation.configuration.digest,
      "2".repeat(64),
      "3".repeat(64),
      "4".repeat(64),
      "5".repeat(64),
      NOW + 100_000,
    ),
    fixture.database.prepare(
      "UPDATE prospecting_runs SET execution_state='assigned' WHERE id=? AND workspace_id=?",
    ).bind(activation.initialRun.id, workspaceId),
    fixture.database.prepare(
      `INSERT INTO runner_submissions (
        id,workspace_id,run_id,assignment_id,configuration_id,submission_json,
        submission_digest,provenance_json,provenance_digest,status,operation_digest,
        idempotency_key,created_at
      ) VALUES (
        'redteam-submission',?,?,'redteam-assignment',?,'{}',?,'{}',?,
        'accepted',?,'redteam-submission-key',?
      )`,
    ).bind(
      workspaceId,
      activation.initialRun.id,
      activation.configuration.id,
      "6".repeat(64),
      "7".repeat(64),
      "8".repeat(64),
      NOW,
    ),
    fixture.database.prepare(
      `INSERT INTO prospecting_candidates (
        id,workspace_id,created_at,updated_at,revision,profile_id,offer_id,run_id,
        submission_id,configuration_id,fingerprint,candidate_json,candidate_digest,status
      ) VALUES (
        'redteam-candidate',?,?,?,1,?,'phase4-offer',?,'redteam-submission',?,?,'{}',?,
        'qualified'
      )`,
    ).bind(
      workspaceId,
      NOW,
      NOW,
      seeded.profileId,
      activation.initialRun.id,
      activation.configuration.id,
      "9".repeat(64),
      "a".repeat(64),
    ),
    fixture.database.prepare(
      `INSERT INTO qualification_assessments (
        id,workspace_id,candidate_id,configuration_id,configuration_digest,input_json,
        input_digest,anchor_json,evidence_json,gate_json,score_json,score,outcome,tie_order,
        assessment_digest,predecessor_assessment_id,created_at
      ) VALUES (
        'redteam-assessment',?,'redteam-candidate',?,?,'{}',?,'{}','{}','{}','{}',8,
        'Passed','[]',?,NULL,?
      )`,
    ).bind(
      workspaceId,
      activation.configuration.id,
      activation.configuration.digest,
      "b".repeat(64),
      "c".repeat(64),
      NOW,
    ),
    fixture.database.prepare(
      `INSERT INTO profile_prospects (
        id,workspace_id,created_at,updated_at,revision,profile_id,offer_id,candidate_id,
        assessment_id,fingerprint,state,active
      ) VALUES (
        'redteam-prospect',?,?,?,1,?,'phase4-offer','redteam-candidate',
        'redteam-assessment',?,'approved',1
      )`,
    ).bind(workspaceId, NOW, NOW, seeded.profileId, "d".repeat(64)),
  ]);
  return {
    ...seeded,
    configurationId: activation.configuration.id,
    configurationDigest: activation.configuration.digest,
    prospectId: "redteam-prospect",
  };
}

async function captureFailure(action) {
  try {
    await action();
    return null;
  } catch (error) {
    return error;
  }
}
