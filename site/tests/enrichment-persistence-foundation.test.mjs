import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  MIGRATION_FILENAMES,
  applyMigrations,
  applyPhase4Migrations,
  countRows,
  createD1Fixture,
} from "./helpers/d1.mjs";
import { seedProfileAuthority } from "./helpers/phase4.mjs";

const NOW = 1_790_000_000_000;
const OWNER = { subject: "phase5-persistence-owner", legacySubject: "phase5-persistence-owner-legacy", displayName: "Phase 5 persistence owner" };

test("0008 installs the exact additive controlled-enrichment foundation with aligned metadata", async () => {
  const fixture = await createD1Fixture("phase5-persistence-clean");
  try {
    await applyMigrations(fixture.database);
    assert.deepEqual(MIGRATION_FILENAMES.map((name) => name.slice(0, 4)), ["0000", "0001", "0002", "0003", "0004", "0005", "0006", "0007", "0008"]);
    const expectedTables = [
      "provider_quotes", "enrichment_grants", "enrichment_grant_prospects", "enrichment_grant_issuance_events",
      "enrichment_budget_accounts", "enrichment_reservations", "enrichment_reservation_budget_entries", "enrichment_reservation_events",
      "contact_evidence_assignments", "contact_point_observations", "contact_eligibility_snapshots",
      "identity_suggestions", "identity_suggestion_candidates", "identity_suggestion_impacts", "identity_decisions", "identity_lineage",
      "runner_spend_grants", "runner_budget_accounts", "runner_spend_reservations", "runner_spend_reservation_events",
    ];
    for (const table of expectedTables) {
      assert.equal((await fixture.database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").bind(table).first())?.name, table);
      assert.equal(await countRows(fixture.database, table), 0);
    }
    for (const forbidden of ["provider_grants", "provider_credentials", "provider_secrets", "outreach_packages", "message_versions", "message_dispatches", "export_jobs"]) {
      assert.equal(await fixture.database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").bind(forbidden).first(), null);
    }
    const foreignKeys = (await fixture.database.prepare("PRAGMA foreign_key_check").all()).results;
    assert.deepEqual(foreignKeys, []);
    const journal = JSON.parse(await readFile(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8"));
    const snapshot = JSON.parse(await readFile(new URL("../drizzle/meta/0008_snapshot.json", import.meta.url), "utf8"));
    assert.equal(journal.entries.at(-1).idx, 8);
    assert.equal(journal.entries.at(-1).tag, "0008_controlled_enrichment");
    assert.equal(snapshot.prevId, JSON.parse(await readFile(new URL("../drizzle/meta/0007_snapshot.json", import.meta.url), "utf8")).id);
    for (const table of expectedTables) assert.equal(snapshot.tables[table]?.name, table);
    const migration = await readFile(new URL("../drizzle/0008_controlled_enrichment.sql", import.meta.url), "utf8");
    assert.doesNotMatch(migration, /\b(?:api_key|access_token|refresh_token|provider_secret|provider_endpoint|raw_provider_envelope)\b/i);
    assert.match(migration, /RAISE\(ABORT, 'enrichment budget exceeded or stale'\)/);
    assert.match(migration, /immutable_enrichment_grants_update/);
  } finally {
    await fixture.dispose();
  }
});

test("0008 upgrades a prior-0007 database without changing existing rows", async () => {
  const fixture = await createD1Fixture("phase5-persistence-upgrade");
  try {
    await applyPhase4Migrations(fixture.database);
    await fixture.database.prepare(
      "INSERT INTO workspaces (id, company_name, owner_subject, created_at, updated_at, revision) VALUES ('upgrade-workspace', 'Preserved Company', 'upgrade-owner', ?, ?, 7)",
    ).bind(NOW, NOW).run();
    const before = await fixture.database.prepare("SELECT * FROM workspaces WHERE id='upgrade-workspace'").first();
    await applyMigrations(fixture.database);
    assert.deepEqual(await fixture.database.prepare("SELECT * FROM workspaces WHERE id='upgrade-workspace'").first(), before);
    assert.deepEqual((await fixture.database.prepare("PRAGMA foreign_key_check").all()).results, []);
    assert.equal(await countRows(fixture.database, "enrichment_grants"), 0);
  } finally {
    await fixture.dispose();
  }
});

test("repository replays exact grants and atomically admits only one bounded reservation", async () => {
  const fixture = await createD1Fixture("phase5-persistence-repository");
  try {
    await applyMigrations(fixture.database);
    const seeded = await seedApprovedProspect(fixture);
    const repositoryModule = await fixture.vite.ssrLoadModule(new URL("../domain/enrichment-repository.ts", import.meta.url).pathname);
    const issuance = await fixture.vite.ssrLoadModule(new URL("../domain/enrichment-grant-issuance.ts", import.meta.url).pathname);
    const authority = await fixture.vite.ssrLoadModule(new URL("../domain/enrichment-authority.ts", import.meta.url).pathname);
    const repository = repositoryModule.createD1EnrichmentRepository(fixture.database, {
      workspaceId: seeded.workspaceId,
      ownerSubject: OWNER.subject,
      now: () => NOW + 100,
    });
    await fixture.database.prepare(
      `INSERT INTO provider_quotes
        (id,workspace_id,provider_id,provider_version,catalog_ref,revision,operation,currency,unit_cost_minor,quote_digest,expires_at,created_at)
       VALUES ('quote-1',?,'provider-a','v1','catalog-a',1,'business_contact_lookup/v1','CAD',10,?,?,?)`,
    ).bind(seeded.workspaceId, "b".repeat(64), NOW + 10_000, NOW).run();
    const snapshot = await repository.loadIssuanceSnapshot(OWNER.subject, [seeded.prospectId]);
    assert.equal(snapshot?.admitted, true);
    const request = {
      principalSubject: OWNER.subject,
      prospectIds: [seeded.prospectId],
      operation: "business_contact_lookup/v1",
      maxUnits: 1,
      maxCostMinor: 10,
      currency: "CAD",
      expiresAt: NOW + 5_000,
      expectedRevision: snapshot.revision,
      idempotencyKey: "phase5-grant-key",
      now: NOW + 1,
    };
    const first = await issuance.issueEnrichmentGrant(repository, request);
    assert.equal(first.kind, "issued");
    assert.equal(first.replayed, false);
    const replay = await issuance.issueEnrichmentGrant(repository, request);
    assert.equal(replay.kind, "issued");
    assert.equal(replay.replayed, true);
    assert.deepEqual(replay.grant, first.grant);
    const changed = await issuance.issueEnrichmentGrant(repository, { ...request, maxCostMinor: 11 });
    assert.equal(changed.kind, "conflict");
    assert.equal(await countRows(fixture.database, "enrichment_grants"), 1);
    assert.equal(await countRows(fixture.database, "enrichment_grant_issuance_events"), 1);

    await seedReservationInputs(fixture.database, seeded, first.grant);
    const reserved = await authority.reserveEnrichmentOperation(repository, {
      grantId: first.grant.id,
      principalSubject: OWNER.subject,
      operationKey: first.grant.tuple.operationKey,
      now: NOW + 2,
    });
    assert.equal(reserved.kind, "reserved");
    assert.equal(reserved.replayed, false);
    assert.equal(await countRows(fixture.database, "enrichment_reservations"), 1);
    assert.equal(await countRows(fixture.database, "enrichment_reservation_budget_entries"), 4);
    const claim = await authority.claimAdmittedCommittedInvocation(repository, reserved.reservation.id, NOW + 3);
    assert.equal(claim.kind, "claimed");
    const exactReplay = await repository.commitReservation(reserved.reservation, []);
    assert.equal(exactReplay.kind, "existing", "exact durable header replay precedes account re-evaluation");
    const changedReplay = await repository.commitReservation({ ...reserved.reservation, operationKey: `op_${"f".repeat(64)}` }, []);
    assert.equal(changedReplay.kind, "blocked");
    await assert.rejects(
      fixture.database.prepare("UPDATE enrichment_grants SET max_units=2 WHERE id=?").bind(first.grant.id).run(),
      /immutable enrichment grant/,
    );
    await assert.rejects(
      fixture.database.prepare(
        `INSERT INTO enrichment_reservations
          (id,workspace_id,grant_id,operation_key,assignment_json,assignment_digest,reserved_units,reserved_cost_minor,currency,expires_at,created_at)
         SELECT 'duplicate-reservation',workspace_id,grant_id,operation_key,assignment_json,?,reserved_units,reserved_cost_minor,currency,expires_at,created_at
         FROM enrichment_reservations WHERE id=?`,
      ).bind("c".repeat(64), reserved.reservation.id).run(),
    );
    const accounts = (await fixture.database.prepare(
      "SELECT reserved_units,reserved_cost_minor FROM enrichment_budget_accounts WHERE workspace_id=? ORDER BY scope",
    ).bind(seeded.workspaceId).all()).results;
    assert.equal(accounts.length, 4);
    assert.ok(accounts.every((row) => Number(row.reserved_units) === 1 && Number(row.reserved_cost_minor) === 10));
    const settlement = {
      state: "released",
      documentedUnits: 0,
      documentedCostMinor: 0,
      reason: "rejected",
      observations: [],
      settlementDigest: "a".repeat(64),
    };
    const acknowledgement = await repository.settleReservation(reserved.reservation.id, settlement);
    assert.deepEqual(acknowledgement, {
      kind: "durably_recorded",
      reservationId: reserved.reservation.id,
      terminalState: "released",
      terminalReason: "rejected",
      settlementDigest: "a".repeat(64),
      observationIds: [],
      durableRevision: 3,
    });
    assert.deepEqual(await repository.settleReservation(reserved.reservation.id, settlement), acknowledgement, "exact terminal replay returns the durable acknowledgement");
    const releasedAccounts = (await fixture.database.prepare(
      "SELECT actual_units,reserved_units,actual_cost_minor,reserved_cost_minor FROM enrichment_budget_accounts WHERE workspace_id=? ORDER BY scope",
    ).bind(seeded.workspaceId).all()).results;
    assert.ok(releasedAccounts.every((row) => Number(row.actual_units) === 0 && Number(row.reserved_units) === 0 && Number(row.actual_cost_minor) === 0 && Number(row.reserved_cost_minor) === 0));
    assert.deepEqual((await fixture.database.prepare("PRAGMA foreign_key_check").all()).results, []);
  } finally {
    await fixture.dispose();
  }
});

test("identity kind and runner monthly scope are guarded below application code", async () => {
  const fixture = await createD1Fixture("phase5-persistence-scope-guards");
  try {
    await applyMigrations(fixture.database);
    await fixture.database.batch([
      fixture.database.prepare("INSERT INTO workspaces (id,company_name,owner_subject,created_at,updated_at,revision) VALUES ('scope-w','Scope','scope-owner',?,?,1)").bind(NOW, NOW),
      fixture.database.prepare("INSERT INTO companies (id,workspace_id,created_at,updated_at,revision,name,status) VALUES ('scope-company','scope-w',?,?,1,'Scope','active')").bind(NOW, NOW),
      fixture.database.prepare("INSERT INTO contacts (id,workspace_id,created_at,updated_at,revision,company_id,identity_digest,display_name) VALUES ('scope-contact','scope-w',?,?,1,'scope-company',?,'Contact')").bind(NOW, NOW, "d".repeat(64)),
      fixture.database.prepare("INSERT INTO organizations (id,workspace_id,created_at,updated_at,revision,company_id,canonical_name,identity_digest) VALUES ('scope-org','scope-w',?,?,1,'scope-company','Org',?)").bind(NOW, NOW, "e".repeat(64)),
      fixture.database.prepare(
        `INSERT INTO identity_suggestions
          (id,workspace_id,owner_subject,subject_kind,kind,revision,candidate_revisions_json,source_lineage_ids_json,retained_identity_lineage_ids_json,retained_aliases_json,retained_suppression_subject_refs_json,proposed_partition_json,suggestion_digest,created_at)
         VALUES ('scope-suggestion','scope-w','scope-owner','contact','split',1,'{}','[]','[]','[]','[]',NULL,?,?)`,
      ).bind("f".repeat(64), NOW),
    ]);
    await assert.rejects(
      fixture.database.prepare(
        "INSERT INTO identity_suggestion_candidates (id,workspace_id,suggestion_id,subject_id,candidate_revision,ordinal) VALUES ('wrong-kind','scope-w','scope-suggestion','scope-org',1,0)",
      ).run(),
      /invalid identity candidate kind or scope/,
    );
    const monthly = "INSERT INTO runner_budget_accounts (id,workspace_id,scope,owner_subject,provider_id,scope_id,period,attempt_number,operation_key,currency,actual_cost_minor,reserved_cost_minor,max_cost_minor,revision,created_at,updated_at) VALUES (?,'scope-w','runner_monthly','scope-owner','provider-a','profile-a','2026-07',NULL,NULL,'CAD',0,0,100,1,?,?)";
    await fixture.database.prepare(monthly).bind("runner-month-a", NOW, NOW).run();
    await assert.rejects(fixture.database.prepare(monthly).bind("runner-month-b", NOW, NOW).run(), /duplicate runner budget account/);
  } finally {
    await fixture.dispose();
  }
});

async function seedApprovedProspect(fixture) {
  const seeded = await seedProfileAuthority(fixture, OWNER, NOW);
  const readiness = await fixture.vite.ssrLoadModule(new URL("../domain/profile-readiness.ts", import.meta.url).pathname);
  const candidate = await readiness.createProfileConfigurationCandidate(fixture.database, OWNER, {
    profileId: seeded.profileId, expectedProfileRevision: seeded.revision, now: NOW,
    idempotencyKey: "0198f500-0000-7000-8000-000000000001",
  });
  const activation = await readiness.activateProfileConfiguration(fixture.database, OWNER, {
    candidateId: candidate.id, expectedRevision: candidate.revision, expectedDigest: candidate.digest, now: NOW,
    idempotencyKey: "0198f500-0000-7000-8000-000000000002",
  });
  const workspaceId = seeded.workspaceId;
  await fixture.database.batch([
    fixture.database.prepare("INSERT INTO authority_commands (id,workspace_id,created_at,updated_at,revision,command_type,idempotency_key,operation_digest,expected_revision,subject_type,subject_id,status) VALUES ('p5-assignment-command',?,?,?,1,'test.phase5.assignment','p5-assignment-key',?,1,'prospecting_run',?,'accepted')").bind(workspaceId, NOW, NOW, "2".repeat(64), activation.initialRun.id),
    fixture.database.prepare("INSERT INTO audit_events (id,workspace_id,actor_type,actor_id,action,subject_type,subject_id,detail_json,created_at) VALUES ('p5-assignment-audit',?,'system','test','test.phase5','prospecting_run',?,'{}',?)").bind(workspaceId, activation.initialRun.id, NOW),
    fixture.database.prepare("UPDATE prospecting_runs SET execution_state='queued' WHERE id=? AND workspace_id=?").bind(activation.initialRun.id, workspaceId),
    fixture.database.prepare("INSERT INTO runner_assignments (id,workspace_id,created_at,updated_at,revision,run_id,profile_id,configuration_id,configuration_digest,audience,token_hash,nonce_hash,instruction_version,tool_configuration_digest,quota_json,quota_digest,expires_at,status,authority_command_id,audit_event_id) VALUES ('p5-assignment',?,?,?,1,?,?,?,?,'phase5',?,?, 'v1',?,'{}',?,?,'issued','p5-assignment-command','p5-assignment-audit')").bind(workspaceId, NOW, NOW, activation.initialRun.id, seeded.profileId, activation.configuration.id, activation.configuration.digest, "2".repeat(64), "3".repeat(64), "4".repeat(64), "5".repeat(64), NOW + 100_000),
    fixture.database.prepare("UPDATE prospecting_runs SET execution_state='assigned' WHERE id=? AND workspace_id=?").bind(activation.initialRun.id, workspaceId),
    fixture.database.prepare("INSERT INTO runner_submissions (id,workspace_id,run_id,assignment_id,configuration_id,submission_json,submission_digest,provenance_json,provenance_digest,status,operation_digest,idempotency_key,created_at) VALUES ('p5-submission',? ,?,'p5-assignment',?,'{}',?,'{}',?,'accepted',?,'p5-submission-key',?)").bind(workspaceId, activation.initialRun.id, activation.configuration.id, "6".repeat(64), "7".repeat(64), "8".repeat(64), NOW),
    fixture.database.prepare("INSERT INTO prospecting_candidates (id,workspace_id,created_at,updated_at,revision,profile_id,offer_id,run_id,submission_id,configuration_id,fingerprint,candidate_json,candidate_digest,status) VALUES ('p5-candidate',?,?,?,1,?,'phase4-offer',?,'p5-submission',?,?,'{}',?,'qualified')").bind(workspaceId, NOW, NOW, seeded.profileId, activation.initialRun.id, activation.configuration.id, "9".repeat(64), "a".repeat(64)),
    fixture.database.prepare("INSERT INTO qualification_assessments (id,workspace_id,candidate_id,configuration_id,configuration_digest,input_json,input_digest,anchor_json,evidence_json,gate_json,score_json,score,outcome,tie_order,assessment_digest,predecessor_assessment_id,created_at) VALUES ('p5-assessment',?,'p5-candidate',?,?,'{}',?,'{}','{}','{}','{}',8,'Passed','[]',?,NULL,?)").bind(workspaceId, activation.configuration.id, activation.configuration.digest, "b".repeat(64), "c".repeat(64), NOW),
    fixture.database.prepare("INSERT INTO profile_prospects (id,workspace_id,created_at,updated_at,revision,profile_id,offer_id,candidate_id,assessment_id,fingerprint,state,active) VALUES ('p5-prospect',?,?,?,1,?,'phase4-offer','p5-candidate','p5-assessment',?,'approved',1)").bind(workspaceId, NOW, NOW, seeded.profileId, "d".repeat(64)),
  ]);
  return { ...seeded, configurationId: activation.configuration.id, configurationDigest: activation.configuration.digest, prospectId: "p5-prospect" };
}

async function seedReservationInputs(database, seeded, grant) {
  const company = await database.prepare("SELECT id FROM companies WHERE workspace_id=? LIMIT 1").bind(seeded.workspaceId).first();
  await database.prepare(
    "INSERT INTO contacts (id,workspace_id,created_at,updated_at,revision,company_id,identity_digest,display_name) VALUES ('p5-contact',?,?,?,1,?,?,'Synthetic Contact')",
  ).bind(seeded.workspaceId, NOW, NOW, company.id, "e".repeat(64)).run();
  await database.prepare(
    `INSERT INTO contact_evidence_assignments
      (id,workspace_id,reservation_id,grant_id,prospect_id,contact_id,role,configuration_id,configuration_digest,provider_id,provider_version,catalog_ref,quote_revision,assignment_digest,created_at)
     VALUES ('p5-contact-assignment',?,NULL,?,'p5-prospect','p5-contact','champion',?,?,?,?,?,1,?,?)`,
  ).bind(seeded.workspaceId, grant.id, grant.tuple.configurationId, grant.tuple.configurationDigest, grant.tuple.providerId, grant.tuple.providerVersion, grant.tuple.catalogRef, "e".repeat(64), NOW).run();
  const entities = {
    grant: grant.id,
    profile: grant.tuple.configurationId,
    workspace: seeded.workspaceId,
    provider: grant.tuple.providerId,
  };
  for (const [scope, entityId] of Object.entries(entities)) {
    const accountId = `enrichment:${seeded.workspaceId.length}:${seeded.workspaceId}:${scope}:${entityId.length}:${entityId}`;
    await database.prepare(
      `INSERT INTO enrichment_budget_accounts
        (id,workspace_id,authority_type,scope,entity_id,currency,actual_units,reserved_units,max_units,actual_cost_minor,reserved_cost_minor,max_cost_minor,revision,created_at,updated_at)
       VALUES (?,?,'enrichment',?,?,'CAD',0,0,1,0,0,10,1,?,?)`,
    ).bind(accountId, seeded.workspaceId, scope, entityId, NOW, NOW).run();
  }
}
