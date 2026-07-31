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
const contactAttestors = new WeakMap();

test("0008 foundation plus additive 0009 hardening install with aligned metadata", async () => {
  const fixture = await createD1Fixture("phase5-persistence-clean");
  try {
    await applyMigrations(fixture.database);
    assert.deepEqual(MIGRATION_FILENAMES.map((name) => name.slice(0, 4)), ["0000", "0001", "0002", "0003", "0004", "0005", "0006", "0007", "0008", "0009"]);
    const expectedTables = [
      "provider_quotes", "enrichment_grants", "enrichment_grant_prospects", "enrichment_grant_issuance_events",
      "enrichment_budget_accounts", "enrichment_reservations", "enrichment_reservation_budget_entries", "enrichment_reservation_events",
      "contact_evidence_assignments", "contact_verification_receipts", "contact_point_observations", "contact_eligibility_snapshots",
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
    const snapshot = JSON.parse(await readFile(new URL("../drizzle/meta/0009_snapshot.json", import.meta.url), "utf8"));
    assert.equal(journal.entries.at(-1).idx, 9);
    assert.equal(journal.entries.at(-1).tag, "0009_gorgeous_captain_universe");
    assert.equal(snapshot.prevId, JSON.parse(await readFile(new URL("../drizzle/meta/0008_snapshot.json", import.meta.url), "utf8")).id);
    for (const table of expectedTables) assert.equal(snapshot.tables[table]?.name, table);
    const migrations = await Promise.all([
      readFile(new URL("../drizzle/0008_controlled_enrichment.sql", import.meta.url), "utf8"),
      readFile(new URL("../drizzle/0009_gorgeous_captain_universe.sql", import.meta.url), "utf8"),
    ]);
    assert.doesNotMatch(migrations.join("\n"), /\b(?:api_key|access_token|refresh_token|provider_secret|provider_endpoint|raw_provider_envelope)\b/i);
    assert.match(migrations.join("\n"), /RAISE\(ABORT, 'enrichment budget exceeded or stale'\)/);
    assert.match(migrations.join("\n"), /immutable_enrichment_grants_update/);
  } finally {
    await fixture.dispose();
  }
});

test("0008 and 0009 upgrade a prior-0007 database without changing existing rows", async () => {
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
    const contactEvidence = await fixture.vite.ssrLoadModule(new URL("../domain/contact-evidence.ts", import.meta.url).pathname);
    const repository = repositoryModule.createD1EnrichmentRepository(fixture.database, {
      workspaceId: seeded.workspaceId,
      ownerSubject: OWNER.subject,
      now: () => NOW,
      contactSettlementAttestor: await testContactSettlementAttestor(fixture),
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
    await assert.rejects(
      fixture.database.prepare(
        `UPDATE enrichment_budget_accounts
         SET actual_units=actual_units+1,actual_cost_minor=actual_cost_minor+1,revision=revision+1,updated_at=?
         WHERE workspace_id=?`,
      ).bind(NOW + 1, seeded.workspaceId).run(),
      /invalid enrichment budget mutation/,
      "application SQL cannot manufacture enrichment ledger usage",
    );
    const eligibilityLineage = await fixture.database.prepare(
      `SELECT p.revision AS prospect_revision,cfg.revision AS configuration_revision,cfg.digest AS configuration_digest
       FROM profile_prospects p
       JOIN typed_configurations cfg
         ON cfg.workspace_id=p.workspace_id AND cfg.owner_type='profile' AND cfg.owner_id=p.profile_id
        AND cfg.kind='profile_effective' AND cfg.active=1
       WHERE p.id=? AND p.workspace_id=?`,
    ).bind(seeded.prospectId, seeded.workspaceId).first();
    assert.ok(eligibilityLineage);
    await fixture.database.prepare(
      `INSERT INTO contact_eligibility_snapshots
        (id,workspace_id,contact_id,prospect_id,configuration_id,configuration_digest,configuration_revision,
         prospect_revision,state,eligible,observation_ids_json,reason_codes_json,preserved_suppression_refs_json,
         snapshot_digest,projected_at)
       VALUES ('eligibility-current',?,'p5-contact','p5-prospect',?,?,?,?,'NeedsReview',0,'[]','[]','[]',?,?)`,
    ).bind(
      seeded.workspaceId,
      seeded.configurationId,
      eligibilityLineage.configuration_digest,
      eligibilityLineage.configuration_revision,
      eligibilityLineage.prospect_revision,
      "5".repeat(64),
      NOW,
    ).run();
    await assert.rejects(
      fixture.database.prepare(
        `INSERT INTO contact_eligibility_snapshots
          (id,workspace_id,contact_id,prospect_id,configuration_id,configuration_digest,configuration_revision,
           prospect_revision,state,eligible,observation_ids_json,reason_codes_json,preserved_suppression_refs_json,
           snapshot_digest,projected_at)
         VALUES ('eligibility-stale',?,'p5-contact','p5-prospect',?,?,?,?,'NeedsReview',0,'[]','[]','[]',?,?)`,
      ).bind(
        seeded.workspaceId,
        seeded.configurationId,
        eligibilityLineage.configuration_digest,
        eligibilityLineage.configuration_revision,
        Number(eligibilityLineage.prospect_revision) + 1,
        "6".repeat(64),
        NOW,
      ).run(),
      /invalid contact eligibility snapshot/,
      "eligibility snapshots require the exact current prospect and configuration lineage",
    );
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
    assert.equal(
      claim.kind,
      "claimed",
      JSON.stringify((await fixture.database.prepare(
        "SELECT durable_revision,state,terminal_reason,settlement_digest,documented_units,documented_cost_minor,observation_ids_json,acknowledgement_digest,claimed_at,created_at FROM enrichment_reservation_events WHERE reservation_id=? ORDER BY durable_revision",
      ).bind(reserved.reservation.id).all()).results),
    );
    await fixture.database.prepare(
      `INSERT INTO enrichment_budget_accounts
        (id,workspace_id,authority_type,scope,entity_id,currency,actual_units,reserved_units,max_units,
         actual_cost_minor,reserved_cost_minor,max_cost_minor,revision,created_at,updated_at)
       VALUES ('same-currency-decoy',?,'enrichment','workspace','unrelated-entity','CAD',0,0,99,0,0,999,1,?,?)`,
    ).bind(seeded.workspaceId, NOW, NOW).run();
    await fixture.database.prepare(
      `INSERT INTO enrichment_grants (
        id,workspace_id,quote_id,configuration_id,configuration_digest,configuration_revision,source_revision,
        provider_id,provider_version,catalog_ref,quote_revision,quote_unit_cost_minor,quote_expires_at,
        operation,operation_key,max_units,max_cost_minor,currency,expires_at,owner_subject,nonce,
        idempotency_key,request_digest,tuple_digest,status,created_at
      )
      SELECT 'unrelated-grant',workspace_id,quote_id,configuration_id,configuration_digest,configuration_revision,source_revision,
        provider_id,provider_version,catalog_ref,quote_revision,quote_unit_cost_minor,quote_expires_at,
        operation,?,max_units,max_cost_minor,currency,expires_at,owner_subject,'unrelated-nonce',
        'unrelated-idempotency',?,?,status,created_at
      FROM enrichment_grants WHERE id=?`,
    ).bind(`op_${"1".repeat(64)}`, "2".repeat(64), "3".repeat(64), first.grant.id).run();
    await assert.rejects(
      fixture.database.prepare(
        `INSERT INTO contact_evidence_assignments
          (id,workspace_id,reservation_id,grant_id,prospect_id,contact_id,role,configuration_id,configuration_digest,
           provider_id,provider_version,catalog_ref,quote_revision,assignment_digest,created_at)
         VALUES ('wrong-grant-assignment',?,NULL,'unrelated-grant','p5-prospect','p5-contact','champion',?,?,?,?,?,1,?,?)`,
      ).bind(
        seeded.workspaceId, first.grant.tuple.configurationId, first.grant.tuple.configurationDigest,
        first.grant.tuple.providerId, first.grant.tuple.providerVersion, first.grant.tuple.catalogRef,
        "4".repeat(64), NOW,
      ).run(),
      /invalid contact evidence assignment/,
      "an unrelated grant cannot borrow another grant's prospect relationship",
    );
    await fixture.database.prepare(
      "INSERT INTO contacts (id,workspace_id,created_at,updated_at,revision,company_id,identity_digest,display_name) SELECT 'p5-other-contact',workspace_id,?,?,1,company_id,?,'Other Contact' FROM contacts WHERE id='p5-contact' AND workspace_id=?",
    ).bind(NOW, NOW, "f".repeat(64), seeded.workspaceId).run();
    await fixture.database.prepare(
      `INSERT INTO contact_evidence_assignments
        (id,workspace_id,reservation_id,grant_id,prospect_id,contact_id,role,configuration_id,configuration_digest,
         provider_id,provider_version,catalog_ref,quote_revision,assignment_digest,created_at)
       VALUES ('p5-other-assignment',?,?,?,'p5-prospect','p5-other-contact','general',?,?,?,?,?,1,?,?)`,
    ).bind(
      seeded.workspaceId, reserved.reservation.id, first.grant.id, first.grant.tuple.configurationId,
      first.grant.tuple.configurationDigest, first.grant.tuple.providerId, first.grant.tuple.providerVersion,
      first.grant.tuple.catalogRef, "f".repeat(64), NOW + 4,
    ).run();
    await insertContactObservation(fixture.database, first.grant, {
      id: "cross-contact-observation",
      assignmentId: "p5-other-assignment",
      contactId: "p5-other-contact",
      digestChar: "2",
      verificationClass: "suggested",
      method: "pattern_inference",
      retrievedAt: NOW - 2_000,
      observedAt: NOW - 500,
      verifiedAt: null,
      providerId: null,
      providerVersion: null,
      catalogRef: null,
    });
    await assert.rejects(
      insertContactEligibilitySnapshot(fixture.database, seeded, eligibilityLineage, {
        id: "eligibility-cross",
        digest: "9".repeat(64),
        observationIdsJson: '["cross-contact-observation"]',
      }),
      /invalid contact eligibility snapshot/,
      "ContactReady rejects cross-contact evidence",
    );
    await fixture.database.prepare(
      `INSERT INTO contact_evidence_assignments
        (id,workspace_id,reservation_id,grant_id,prospect_id,contact_id,role,configuration_id,configuration_digest,
         provider_id,provider_version,catalog_ref,quote_revision,assignment_digest,created_at)
       VALUES ('later-contact-assignment',?,?,?,'p5-prospect','p5-contact','economic_buyer',?,?,?,?,?,1,?,?)`,
    ).bind(
      seeded.workspaceId, reserved.reservation.id, first.grant.id, first.grant.tuple.configurationId,
      first.grant.tuple.configurationDigest, first.grant.tuple.providerId, first.grant.tuple.providerVersion,
      first.grant.tuple.catalogRef, "7".repeat(64), NOW + 4,
    ).run();
    const laterAssignmentEvidence = contactEvidence.ingestContactEvidence({
      assignmentId: "later-contact-assignment",
      prospectId: seeded.prospectId,
      role: "economic_buyer",
      quoteRevision: 1,
      workspaceId: seeded.workspaceId,
      contactId: "p5-contact",
      profileConfigurationId: first.grant.tuple.configurationId,
      profileConfigurationDigest: first.grant.tuple.configurationDigest,
      providerAuthority: {
        providerId: first.grant.tuple.providerId,
        providerVersion: first.grant.tuple.providerVersion,
        catalogRef: first.grant.tuple.catalogRef,
      },
    }, {
      id: "later-assignment-observation",
      workspaceId: seeded.workspaceId,
      contactId: "p5-contact",
      profileConfigurationId: first.grant.tuple.configurationId,
      profileConfigurationDigest: first.grant.tuple.configurationDigest,
      kind: "email",
      value: "contact@example.invalid",
      confidence: 0.5,
      provenance: {
        sourceReference: "source:later-assignment",
        excerpt: "synthetic later assignment",
        objectReference: "object:later-assignment",
        contentHash: "8".repeat(64),
        retrievedAt: NOW,
      },
      observedAt: NOW + 1,
      lineage: { parentObservationId: null },
    });
    assert.equal(laterAssignmentEvidence.accepted, true);
    const laterAssignmentSettlement = {
        state: "settled",
        documentedUnits: 1,
        documentedCostMinor: 10,
        reason: "partial",
        observations: [laterAssignmentEvidence.observation],
        settlementDigest: (await authority.deriveEnrichmentSettlementIdentity({
          reservationId: reserved.reservation.id,
          terminalState: "settled",
          terminalReason: "partial",
          documentedUnits: 1,
          documentedCostMinor: 10,
          observations: [laterAssignmentEvidence.observation],
        })).settlementDigest,
      };
    await assert.rejects(
      repository.settleReservation(reserved.reservation.id, laterAssignmentSettlement),
      /enrichment_observation_assignment_unavailable/,
      "a later assignment row cannot replace the immutable reservation assignment snapshot",
    );
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
      "SELECT id,reserved_units,reserved_cost_minor FROM enrichment_budget_accounts WHERE workspace_id=? ORDER BY scope,id",
    ).bind(seeded.workspaceId).all()).results;
    assert.equal(accounts.length, 5);
    assert.deepEqual(
      accounts.filter((row) => row.id === "same-currency-decoy").map((row) => ({
        units: Number(row.reserved_units),
        cost: Number(row.reserved_cost_minor),
      })),
      [{ units: 0, cost: 0 }],
      "same-currency accounts outside the exact four derived IDs are not loaded or reserved",
    );
    assert.ok(accounts.filter((row) => row.id !== "same-currency-decoy")
      .every((row) => Number(row.reserved_units) === 1 && Number(row.reserved_cost_minor) === 10));
    const settlement = {
      state: "released",
      documentedUnits: 0,
      documentedCostMinor: 0,
      reason: "rejected",
      observations: [],
      settlementDigest: (await authority.deriveEnrichmentSettlementIdentity({
        reservationId: reserved.reservation.id,
        terminalState: "released",
        terminalReason: "rejected",
        documentedUnits: 0,
        documentedCostMinor: 0,
        observations: [],
      })).settlementDigest,
    };
    const acknowledgement = await repository.settleReservation(reserved.reservation.id, settlement);
    assert.deepEqual(acknowledgement, {
      kind: "durably_recorded",
      reservationId: reserved.reservation.id,
      terminalState: "released",
      terminalReason: "rejected",
      settlementDigest: settlement.settlementDigest,
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

test("a fresh repository rehydrates durable reservation authority before expiry", async () => {
  const fixture = await createD1Fixture("phase5-persistence-restart-claim");
  try {
    await applyMigrations(fixture.database);
    const seeded = await seedApprovedProspect(fixture);
    const repositoryModule = await fixture.vite.ssrLoadModule(new URL("../domain/enrichment-repository.ts", import.meta.url).pathname);
    const issuance = await fixture.vite.ssrLoadModule(new URL("../domain/enrichment-grant-issuance.ts", import.meta.url).pathname);
    const authority = await fixture.vite.ssrLoadModule(new URL("../domain/enrichment-authority.ts", import.meta.url).pathname);
    const repositoryA = repositoryModule.createD1EnrichmentRepository(fixture.database, {
      workspaceId: seeded.workspaceId,
      ownerSubject: OWNER.subject,
      now: () => NOW,
      contactSettlementAttestor: await testContactSettlementAttestor(fixture),
    });
    await fixture.database.prepare(
      `INSERT INTO provider_quotes
        (id,workspace_id,provider_id,provider_version,catalog_ref,revision,operation,currency,unit_cost_minor,quote_digest,expires_at,created_at)
       VALUES ('quote-restart',?,'provider-a','v1','catalog-a',1,'business_contact_lookup/v1','CAD',10,?,?,?)`,
    ).bind(seeded.workspaceId, "6".repeat(64), NOW + 10_000, NOW).run();
    const snapshot = await repositoryA.loadIssuanceSnapshot(OWNER.subject, [seeded.prospectId]);
    const issued = await issuance.issueEnrichmentGrant(repositoryA, {
      principalSubject: OWNER.subject,
      prospectIds: [seeded.prospectId],
      operation: "business_contact_lookup/v1",
      maxUnits: 1,
      maxCostMinor: 10,
      currency: "CAD",
      expiresAt: NOW + 5_000,
      expectedRevision: snapshot.revision,
      idempotencyKey: "phase5-restart-grant-key",
      now: NOW + 1,
    });
    assert.equal(issued.kind, "issued");
    await seedReservationInputs(fixture.database, seeded, issued.grant);
    const reserved = await authority.reserveEnrichmentOperation(repositoryA, {
      grantId: issued.grant.id,
      principalSubject: OWNER.subject,
      operationKey: issued.grant.tuple.operationKey,
      now: NOW + 2,
    });
    assert.equal(reserved.kind, "reserved");
    const repositoryB = repositoryModule.createD1EnrichmentRepository(fixture.database, {
      workspaceId: seeded.workspaceId,
      ownerSubject: OWNER.subject,
      now: () => NOW + 3,
      contactSettlementAttestor: await testContactSettlementAttestor(fixture),
    });
    const claim = await authority.claimAdmittedCommittedInvocation(repositoryB, reserved.reservation.id, NOW + 3);
    assert.equal(claim.kind, "claimed");
    assert.deepEqual(claim.assignment, reserved.reservation.assignment);
    const latest = await fixture.database.prepare(
      "SELECT durable_revision,state,claimed_at FROM enrichment_reservation_events WHERE reservation_id=? ORDER BY durable_revision DESC LIMIT 1",
    ).bind(reserved.reservation.id).first();
    assert.deepEqual(
      { durableRevision: Number(latest.durable_revision), state: latest.state, claimedAt: Number(latest.claimed_at) },
      { durableRevision: 2, state: "invoking", claimedAt: NOW + 3 },
    );
  } finally {
    await fixture.dispose();
  }
});

test("a durable claim trusts the repository clock when it advances beyond the caller timestamp", async () => {
  const fixture = await createD1Fixture("phase5-persistence-repository-claim-clock");
  try {
    const setup = await issueBoundaryGrant(fixture, "repository-claim-clock");
    const trustedNow = NOW + 100;
    const freshRepository = setup.repositoryModule.createD1EnrichmentRepository(fixture.database, {
      workspaceId: setup.seeded.workspaceId,
      ownerSubject: OWNER.subject,
      now: () => trustedNow,
      contactSettlementAttestor: await testContactSettlementAttestor(fixture),
    });
    const claim = await setup.authority.claimAdmittedCommittedInvocation(
      freshRepository,
      setup.reserved.reservation.id,
      NOW + 3,
    );
    assert.equal(claim.kind, "claimed");
    assert.equal(claim.claimedAt, trustedNow, "the durable adapter owns the persisted claim timestamp");
    const latest = await fixture.database.prepare(
      "SELECT state,claimed_at FROM enrichment_reservation_events WHERE reservation_id=? ORDER BY durable_revision DESC LIMIT 1",
    ).bind(setup.reserved.reservation.id).first();
    assert.deepEqual({ state: latest.state, claimedAt: Number(latest.claimed_at) }, {
      state: "invoking",
      claimedAt: trustedNow,
    });
  } finally {
    await fixture.dispose();
  }
});

test("settlement replay binds exact observation and verification receipt content, not only the observation ID", async () => {
  const fixture = await createD1Fixture("phase5-settlement-content-replay");
  try {
    const setup = await issueBoundaryGrant(fixture, "settlement-content-replay");
    assert.equal(
      (await setup.authority.claimAdmittedCommittedInvocation(
        setup.repository,
        setup.reserved.reservation.id,
        NOW + 3,
      )).kind,
      "claimed",
    );
    const firstObservation = await makeVerifiedContactObservation(fixture, setup, {
      id: "same-id-observation",
      verifierVersion: "v1",
      verdictReference: "verdict:first",
      verdictDigest: "1".repeat(64),
    });
    const alteredObservation = await makeVerifiedContactObservation(fixture, setup, {
      id: "same-id-observation",
      verifierVersion: "v2",
      verdictReference: "verdict:altered",
      verdictDigest: "2".repeat(64),
    });
    const firstIdentity = await setup.authority.deriveEnrichmentSettlementIdentity({
      reservationId: setup.reserved.reservation.id,
      terminalState: "settled",
      terminalReason: "completed",
      documentedUnits: 1,
      documentedCostMinor: 10,
      observations: [firstObservation],
    });
    const alteredIdentity = await setup.authority.deriveEnrichmentSettlementIdentity({
      reservationId: setup.reserved.reservation.id,
      terminalState: "settled",
      terminalReason: "completed",
      documentedUnits: 1,
      documentedCostMinor: 10,
      observations: [alteredObservation],
    });
    assert.notEqual(firstIdentity.observationBindings[0].observationDigest, alteredIdentity.observationBindings[0].observationDigest);
    assert.notEqual(firstIdentity.observationBindings[0].verificationReceiptDigest, alteredIdentity.observationBindings[0].verificationReceiptDigest);
    assert.notEqual(firstIdentity.settlementDigest, alteredIdentity.settlementDigest);
    const firstSettlement = {
      state: "settled",
      documentedUnits: 1,
      documentedCostMinor: 10,
      reason: "completed",
      observations: [firstObservation],
      settlementDigest: firstIdentity.settlementDigest,
    };
    const alteredSettlement = {
      ...firstSettlement,
      observations: [alteredObservation],
      settlementDigest: alteredIdentity.settlementDigest,
    };
    const acknowledgement = await setup.repository.settleReservation(setup.reserved.reservation.id, firstSettlement);
    assert.deepEqual(
      await setup.repository.settleReservation(setup.reserved.reservation.id, firstSettlement),
      acknowledgement,
      "an exact retry remains idempotent",
    );
    await assert.rejects(
      setup.repository.settleReservation(setup.reserved.reservation.id, alteredSettlement),
      /enrichment_settlement_conflict/,
      "same-ID evidence with altered receipt content is not an exact replay",
    );
    assert.equal(await countRows(fixture.database, "contact_point_observations"), 1);
    assert.equal(await countRows(fixture.database, "contact_verification_receipts"), 1);
  } finally {
    await fixture.dispose();
  }
});

test("verified contact settlement fails closed when no server attestor is composed", async () => {
  const fixture = await createD1Fixture("phase5-settlement-attestor-absent");
  try {
    const setup = await issueBoundaryGrant(fixture, "settlement-attestor-absent");
    assert.equal(
      (await setup.authority.claimAdmittedCommittedInvocation(
        setup.repository,
        setup.reserved.reservation.id,
        NOW + 3,
      )).kind,
      "claimed",
    );
    const observation = await makeVerifiedContactObservation(fixture, setup, {
      id: "attestor-absent-observation",
      verifierVersion: "v1",
      verdictReference: "verdict:attestor-absent",
      verdictDigest: "5".repeat(64),
    });
    const identity = await setup.authority.deriveEnrichmentSettlementIdentity({
      reservationId: setup.reserved.reservation.id,
      terminalState: "settled",
      terminalReason: "completed",
      documentedUnits: 1,
      documentedCostMinor: 10,
      observations: [observation],
    });
    const rejectOnlyRepository = setup.repositoryModule.createD1EnrichmentRepository(
      fixture.database,
      {
        workspaceId: setup.seeded.workspaceId,
        ownerSubject: OWNER.subject,
        now: () => NOW,
      },
    );
    await assert.rejects(
      rejectOnlyRepository.settleReservation(setup.reserved.reservation.id, {
        state: "settled",
        documentedUnits: 1,
        documentedCostMinor: 10,
        reason: "completed",
        observations: [observation],
        settlementDigest: identity.settlementDigest,
      }),
      /enrichment_contact_attestor_unavailable/,
    );
    assert.equal(await countRows(fixture.database, "contact_verification_receipts"), 0);
    assert.equal(await countRows(fixture.database, "contact_point_observations"), 0);
    const latest = await fixture.database.prepare(
      "SELECT state FROM enrichment_reservation_events WHERE reservation_id=? ORDER BY durable_revision DESC LIMIT 1",
    ).bind(setup.reserved.reservation.id).first();
    assert.equal(latest.state, "invoking");
  } finally {
    await fixture.dispose();
  }
});

test("concurrent same-ID settlements elect one exact evidence payload and reject the loser", async () => {
  const fixture = await createD1Fixture("phase5-settlement-content-race");
  try {
    const setup = await issueBoundaryGrant(fixture, "settlement-content-race");
    assert.equal(
      (await setup.authority.claimAdmittedCommittedInvocation(
        setup.repository,
        setup.reserved.reservation.id,
        NOW + 3,
      )).kind,
      "claimed",
    );
    const observations = await Promise.all([
      makeVerifiedContactObservation(fixture, setup, {
        id: "racing-observation",
        verifierVersion: "v1",
        verdictReference: "verdict:race-a",
        verdictDigest: "3".repeat(64),
      }),
      makeVerifiedContactObservation(fixture, setup, {
        id: "racing-observation",
        verifierVersion: "v2",
        verdictReference: "verdict:race-b",
        verdictDigest: "4".repeat(64),
      }),
    ]);
    const settlements = await Promise.all(observations.map(async (observation) => {
      const identity = await setup.authority.deriveEnrichmentSettlementIdentity({
        reservationId: setup.reserved.reservation.id,
        terminalState: "settled",
        terminalReason: "completed",
        documentedUnits: 1,
        documentedCostMinor: 10,
        observations: [observation],
      });
      return {
        state: "settled",
        documentedUnits: 1,
        documentedCostMinor: 10,
        reason: "completed",
        observations: [observation],
        settlementDigest: identity.settlementDigest,
      };
    }));
    assert.notEqual(settlements[0].settlementDigest, settlements[1].settlementDigest);
    const results = await Promise.allSettled(settlements.map((settlement) =>
      setup.repository.settleReservation(setup.reserved.reservation.id, settlement)
    ));
    assert.deepEqual(
      results.map((result) => result.status).sort(),
      ["fulfilled", "rejected"],
      "only one exact settlement payload may win the terminal race",
    );
    const winner = results.findIndex((result) => result.status === "fulfilled");
    assert.deepEqual(
      await setup.repository.settleReservation(setup.reserved.reservation.id, settlements[winner]),
      results[winner].value,
      "the winning exact payload remains replayable",
    );
    assert.equal(await countRows(fixture.database, "contact_point_observations"), 1);
    assert.equal(await countRows(fixture.database, "contact_verification_receipts"), 1);
    const terminal = await fixture.database.prepare(
      "SELECT settlement_digest FROM enrichment_reservation_events WHERE reservation_id=? ORDER BY durable_revision DESC LIMIT 1",
    ).bind(setup.reserved.reservation.id).first();
    assert.equal(terminal.settlement_digest, settlements[winner].settlementDigest);
  } finally {
    await fixture.dispose();
  }
});

test("a fresh repository sweeps expired reservations and unwinds every reserved account", async () => {
  const fixture = await createD1Fixture("phase5-persistence-expired-claim");
  try {
    await applyMigrations(fixture.database);
    const seeded = await seedApprovedProspect(fixture);
    const repositoryModule = await fixture.vite.ssrLoadModule(new URL("../domain/enrichment-repository.ts", import.meta.url).pathname);
    const issuance = await fixture.vite.ssrLoadModule(new URL("../domain/enrichment-grant-issuance.ts", import.meta.url).pathname);
    const authority = await fixture.vite.ssrLoadModule(new URL("../domain/enrichment-authority.ts", import.meta.url).pathname);
    const repositoryA = repositoryModule.createD1EnrichmentRepository(fixture.database, {
      workspaceId: seeded.workspaceId,
      ownerSubject: OWNER.subject,
      now: () => NOW,
      contactSettlementAttestor: await testContactSettlementAttestor(fixture),
    });
    await fixture.database.prepare(
      `INSERT INTO provider_quotes
        (id,workspace_id,provider_id,provider_version,catalog_ref,revision,operation,currency,unit_cost_minor,quote_digest,expires_at,created_at)
       VALUES ('quote-expiry',?,'provider-a','v1','catalog-a',1,'business_contact_lookup/v1','CAD',10,?,?,?)`,
    ).bind(seeded.workspaceId, "7".repeat(64), NOW + 10_000, NOW).run();
    const snapshot = await repositoryA.loadIssuanceSnapshot(OWNER.subject, [seeded.prospectId]);
    const issued = await issuance.issueEnrichmentGrant(repositoryA, {
      principalSubject: OWNER.subject,
      prospectIds: [seeded.prospectId],
      operation: "business_contact_lookup/v1",
      maxUnits: 1,
      maxCostMinor: 10,
      currency: "CAD",
      expiresAt: NOW + 5_000,
      expectedRevision: snapshot.revision,
      idempotencyKey: "phase5-expiry-grant-key",
      now: NOW + 1,
    });
    assert.equal(issued.kind, "issued");
    await seedReservationInputs(fixture.database, seeded, issued.grant);
    const reserved = await authority.reserveEnrichmentOperation(repositoryA, {
      grantId: issued.grant.id,
      principalSubject: OWNER.subject,
      operationKey: issued.grant.tuple.operationKey,
      now: NOW + 2,
    });
    assert.equal(reserved.kind, "reserved");
    const repositoryC = repositoryModule.createD1EnrichmentRepository(fixture.database, {
      workspaceId: seeded.workspaceId,
      ownerSubject: OWNER.subject,
      now: () => NOW + 5_000,
      contactSettlementAttestor: await testContactSettlementAttestor(fixture),
    });
    assert.deepEqual(
      await repositoryC.releaseExpiredReservations({ now: NOW + 5_000, limit: 10 }),
      [reserved.reservation.id],
    );
    assert.deepEqual(await repositoryC.releaseExpiredReservations({ now: NOW + 5_001, limit: 10 }), []);
    const latest = await fixture.database.prepare(
      "SELECT durable_revision,state,terminal_reason,documented_units,documented_cost_minor FROM enrichment_reservation_events WHERE reservation_id=? ORDER BY durable_revision DESC LIMIT 1",
    ).bind(reserved.reservation.id).first();
    assert.deepEqual(
      {
        durableRevision: Number(latest.durable_revision),
        state: latest.state,
        terminalReason: latest.terminal_reason,
        documentedUnits: Number(latest.documented_units),
        documentedCostMinor: Number(latest.documented_cost_minor),
      },
      { durableRevision: 2, state: "released", terminalReason: "expired", documentedUnits: 0, documentedCostMinor: 0 },
    );
    const accounts = (await fixture.database.prepare(
      "SELECT actual_units,reserved_units,actual_cost_minor,reserved_cost_minor,revision FROM enrichment_budget_accounts WHERE workspace_id=?",
    ).bind(seeded.workspaceId).all()).results;
    assert.ok(accounts.every((row) =>
      Number(row.actual_units) === 0 && Number(row.reserved_units) === 0
      && Number(row.actual_cost_minor) === 0 && Number(row.reserved_cost_minor) === 0
      && Number(row.revision) === 3
    ));
    assert.deepEqual(
      await authority.claimAdmittedCommittedInvocation(repositoryC, reserved.reservation.id, NOW + 5_001),
      { kind: "blocked", reason: "expired" },
      "an exact durable expiry acknowledgement is replay-safe",
    );
  } finally {
    await fixture.dispose();
  }
});

test("overlapping enrichment reservations settle and release shared accounts in either order", async () => {
  for (const settledFirst of [true, false]) {
    const fixture = await createD1Fixture(`phase5-persistence-overlap-enrichment-${settledFirst}`);
    try {
      await applyMigrations(fixture.database);
      const seeded = await seedApprovedProspect(fixture);
      const repositoryModule = await fixture.vite.ssrLoadModule(new URL("../domain/enrichment-repository.ts", import.meta.url).pathname);
      const issuance = await fixture.vite.ssrLoadModule(new URL("../domain/enrichment-grant-issuance.ts", import.meta.url).pathname);
      const authority = await fixture.vite.ssrLoadModule(new URL("../domain/enrichment-authority.ts", import.meta.url).pathname);
      let clock = NOW;
      const repository = repositoryModule.createD1EnrichmentRepository(fixture.database, {
        workspaceId: seeded.workspaceId,
        ownerSubject: OWNER.subject,
        now: () => clock,
        contactSettlementAttestor: await testContactSettlementAttestor(fixture),
      });
      await fixture.database.prepare(
        `INSERT INTO provider_quotes
          (id,workspace_id,provider_id,provider_version,catalog_ref,revision,operation,currency,unit_cost_minor,quote_digest,expires_at,created_at)
         VALUES ('quote-overlap',?,'provider-a','v1','catalog-a',1,'business_contact_lookup/v1','CAD',10,?,?,?)`,
      ).bind(seeded.workspaceId, "3".repeat(64), NOW + 20_000, NOW).run();
      const snapshot = await repository.loadIssuanceSnapshot(OWNER.subject, [seeded.prospectId]);
      const issue = (suffix, expiresAt) => issuance.issueEnrichmentGrant(repository, {
        principalSubject: OWNER.subject,
        prospectIds: [seeded.prospectId],
        operation: "business_contact_lookup/v1",
        maxUnits: 1,
        maxCostMinor: 10,
        currency: "CAD",
        expiresAt,
        expectedRevision: snapshot.revision,
        idempotencyKey: `phase5-overlap-${suffix}`,
        now: NOW + 1,
      });
      const firstGrant = await issue("first", NOW + 8_000);
      const secondGrant = await issue("second", NOW + 9_000);
      assert.equal(firstGrant.kind, "issued");
      assert.equal(secondGrant.kind, "issued");
      await seedOverlappingEnrichmentInputs(fixture.database, seeded, [firstGrant.grant, secondGrant.grant]);
      const first = await authority.reserveEnrichmentOperation(repository, {
        grantId: firstGrant.grant.id,
        principalSubject: OWNER.subject,
        operationKey: firstGrant.grant.tuple.operationKey,
        now: NOW + 2,
      });
      const second = await authority.reserveEnrichmentOperation(repository, {
        grantId: secondGrant.grant.id,
        principalSubject: OWNER.subject,
        operationKey: secondGrant.grant.tuple.operationKey,
        now: NOW + 2,
      });
      assert.equal(first.kind, "reserved");
      assert.equal(second.kind, "reserved");
      assert.equal((await readSharedEnrichmentAccounts(fixture.database, seeded.workspaceId)).every((row) =>
        Number(row.reserved_units) === 2 && Number(row.revision) === 3
      ), true);
      assert.equal((await authority.claimAdmittedCommittedInvocation(repository, first.reservation.id, NOW + 3)).kind, "claimed");
      assert.equal((await authority.claimAdmittedCommittedInvocation(repository, second.reservation.id, NOW + 3)).kind, "claimed");
      clock = NOW + 4;
      const settledWrite = {
        state: "settled",
        documentedUnits: 1,
        documentedCostMinor: 10,
        reason: "completed",
        observations: [],
      };
      const releasedWrite = {
        state: "released",
        documentedUnits: 0,
        documentedCostMinor: 0,
        reason: "rejected",
        observations: [],
      };
      const operations = settledFirst
        ? [[first.reservation.id, settledWrite], [second.reservation.id, releasedWrite]]
        : [[second.reservation.id, releasedWrite], [first.reservation.id, settledWrite]];
      const acknowledgements = [];
      for (const [reservationId, settlementBase] of operations) {
        const settlement = {
          ...settlementBase,
          settlementDigest: (await authority.deriveEnrichmentSettlementIdentity({
            reservationId,
            terminalState: settlementBase.state,
            terminalReason: settlementBase.reason,
            documentedUnits: settlementBase.documentedUnits,
            documentedCostMinor: settlementBase.documentedCostMinor,
            observations: [],
          })).settlementDigest,
        };
        const acknowledgement = await repository.settleReservation(reservationId, settlement);
        acknowledgements.push(acknowledgement);
        assert.deepEqual(await repository.settleReservation(reservationId, settlement), acknowledgement);
        clock += 1;
      }
      assert.deepEqual(acknowledgements.map((item) => item.terminalState).sort(), ["released", "settled"]);
      const shared = await readSharedEnrichmentAccounts(fixture.database, seeded.workspaceId);
      assert.equal(shared.every((row) =>
        Number(row.actual_units) === 1 && Number(row.reserved_units) === 0
        && Number(row.actual_cost_minor) === 10 && Number(row.reserved_cost_minor) === 0
        && Number(row.revision) === 5
      ), true);
      assert.equal(Number((await fixture.database.prepare(
        "SELECT count(*) count FROM enrichment_reservation_events WHERE reservation_id IN (?,?) AND state IN ('settled','released')",
      ).bind(first.reservation.id, second.reservation.id).first()).count), 2);
      await assert.rejects(
        fixture.database.prepare(
          `UPDATE enrichment_budget_accounts SET actual_units=actual_units+1,revision=revision+1,updated_at=?
           WHERE workspace_id=? AND scope='workspace'`,
        ).bind(clock, seeded.workspaceId).run(),
        /invalid enrichment budget mutation/,
      );
    } finally {
      await fixture.dispose();
    }
  }
});

test("forged enrichment assignment digests and initial acknowledgements cannot replay or claim invocation", async () => {
  for (const corruption of ["assignment_digest", "initial_ack"]) {
    const fixture = await createD1Fixture(`phase5-persistence-forged-reservation-${corruption}`);
    try {
      await applyMigrations(fixture.database);
      const seeded = await seedApprovedProspect(fixture);
      const repositoryModule = await fixture.vite.ssrLoadModule(new URL("../domain/enrichment-repository.ts", import.meta.url).pathname);
      const issuance = await fixture.vite.ssrLoadModule(new URL("../domain/enrichment-grant-issuance.ts", import.meta.url).pathname);
      const authority = await fixture.vite.ssrLoadModule(new URL("../domain/enrichment-authority.ts", import.meta.url).pathname);
      const repository = repositoryModule.createD1EnrichmentRepository(fixture.database, {
        workspaceId: seeded.workspaceId,
        ownerSubject: OWNER.subject,
        now: () => NOW,
        contactSettlementAttestor: await testContactSettlementAttestor(fixture),
      });
      await fixture.database.prepare(
        `INSERT INTO provider_quotes
          (id,workspace_id,provider_id,provider_version,catalog_ref,revision,operation,currency,unit_cost_minor,quote_digest,expires_at,created_at)
         VALUES (?,?,'provider-a','v1','catalog-a',1,'business_contact_lookup/v1','CAD',10,?,?,?)`,
      ).bind(`quote-forged-${corruption}`, seeded.workspaceId, corruption === "assignment_digest" ? "6".repeat(64) : "7".repeat(64), NOW + 10_000, NOW).run();
      const snapshot = await repository.loadIssuanceSnapshot(OWNER.subject, [seeded.prospectId]);
      const issued = await issuance.issueEnrichmentGrant(repository, {
        principalSubject: OWNER.subject,
        prospectIds: [seeded.prospectId],
        operation: "business_contact_lookup/v1",
        maxUnits: 1,
        maxCostMinor: 10,
        currency: "CAD",
        expiresAt: NOW + 5_000,
        expectedRevision: snapshot.revision,
        idempotencyKey: `phase5-forged-${corruption}`,
        now: NOW + 1,
      });
      assert.equal(issued.kind, "issued");
      await seedReservationInputs(fixture.database, seeded, issued.grant);
      let capturedRecord;
      let capturedAccounts;
      const planned = await authority.reserveEnrichmentOperation({
        loadReservationAuthority: (...args) => repository.loadReservationAuthority(...args),
        async commitReservation(record, accounts) {
          capturedRecord = record;
          capturedAccounts = accounts;
          return { kind: "blocked" };
        },
      }, {
        grantId: issued.grant.id,
        principalSubject: OWNER.subject,
        operationKey: issued.grant.tuple.operationKey,
        now: NOW + 2,
      });
      assert.equal(planned.kind, "blocked");
      assert.ok(capturedRecord);
      assert.equal(capturedAccounts.length, 4);
      const assignmentJson = issuance.canonical(capturedRecord.assignment);
      const validAssignmentDigest = await sha256Text(assignmentJson);
      await fixture.database.prepare(
        `INSERT INTO enrichment_reservations
          (id,workspace_id,grant_id,operation_key,assignment_json,assignment_digest,reserved_units,reserved_cost_minor,currency,expires_at,created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      ).bind(
        capturedRecord.id, seeded.workspaceId, capturedRecord.grantId, capturedRecord.operationKey, assignmentJson,
        corruption === "assignment_digest" ? "8".repeat(64) : validAssignmentDigest,
        1, 10, "CAD", capturedRecord.assignment.expiresAt, NOW,
      ).run();
      for (const [index, account] of capturedAccounts.entries()) {
        await fixture.database.prepare(
          `INSERT INTO enrichment_reservation_budget_entries
            (id,workspace_id,reservation_id,account_id,reserved_units,reserved_cost_minor,account_expected_revision,entry_digest,created_at)
           VALUES (?,?,?,?,1,10,1,?,?)`,
        ).bind(
          `forged-entry-${corruption}-${index}`, seeded.workspaceId, capturedRecord.id, account.accountId,
          `${index + 1}`.repeat(64), NOW,
        ).run();
      }
      const validInitialAck = await sha256Text(issuance.canonical({
        schema: "enrichment-reservation-event/v1",
        reservationId: capturedRecord.id,
        durableRevision: 1,
        state: "reserved",
      }));
      await fixture.database.prepare(
        `INSERT INTO enrichment_reservation_events
          (id,workspace_id,reservation_id,durable_revision,state,terminal_reason,settlement_digest,documented_units,
           documented_cost_minor,observation_ids_json,acknowledgement_digest,claimed_at,created_at)
         VALUES (?,?,?,1,'reserved',NULL,NULL,NULL,NULL,'[]',?,NULL,?)`,
      ).bind(
        `forged-event-${corruption}`, seeded.workspaceId, capturedRecord.id,
        corruption === "initial_ack" ? "9".repeat(64) : validInitialAck, NOW,
      ).run();
      assert.deepEqual(await repository.commitReservation(capturedRecord, capturedAccounts), { kind: "blocked" });
      assert.deepEqual(
        await repository.claimCommittedInvocation(capturedRecord.id, NOW + 3),
        { kind: "blocked", reason: "unavailable" },
      );
      assert.equal(Number((await fixture.database.prepare(
        "SELECT count(*) count FROM enrichment_reservation_events WHERE reservation_id=?",
      ).bind(capturedRecord.id).first()).count), 1);
    } finally {
      await fixture.dispose();
    }
  }
});

test("replacement configuration and prospect races cannot reuse stale enrichment authority", async () => {
  const fixture = await createD1Fixture("phase5-persistence-stale-prospect-authority");
  try {
    await applyMigrations(fixture.database);
    const seeded = await seedApprovedProspect(fixture);
    const repositoryModule = await fixture.vite.ssrLoadModule(new URL("../domain/enrichment-repository.ts", import.meta.url).pathname);
    const issuance = await fixture.vite.ssrLoadModule(new URL("../domain/enrichment-grant-issuance.ts", import.meta.url).pathname);
    const authority = await fixture.vite.ssrLoadModule(new URL("../domain/enrichment-authority.ts", import.meta.url).pathname);
    const repository = repositoryModule.createD1EnrichmentRepository(fixture.database, {
      workspaceId: seeded.workspaceId,
      ownerSubject: OWNER.subject,
      now: () => NOW,
      contactSettlementAttestor: await testContactSettlementAttestor(fixture),
    });
    await fixture.database.prepare(
      `INSERT INTO provider_quotes
        (id,workspace_id,provider_id,provider_version,catalog_ref,revision,operation,currency,unit_cost_minor,quote_digest,expires_at,created_at)
       VALUES ('quote-stale-race',?,'provider-a','v1','catalog-a',1,'business_contact_lookup/v1','CAD',10,?,?,?)`,
    ).bind(seeded.workspaceId, "1".repeat(64), NOW + 10_000, NOW).run();
    const issuanceSnapshot = await repository.loadIssuanceSnapshot(OWNER.subject, [seeded.prospectId]);
    const staleIssuanceRepository = {
      loadIssuanceSnapshot: async () => issuanceSnapshot,
      findGrantByIdempotency: (...args) => repository.findGrantByIdempotency(...args),
      commitGrant: async (record) => {
        await fixture.database.prepare(
          "UPDATE workspaces SET revision=revision+1,updated_at=? WHERE id=?",
        ).bind(NOW + 1, seeded.workspaceId).run();
        return repository.commitGrant(record);
      },
    };
    await assert.rejects(
      issuance.issueEnrichmentGrant(staleIssuanceRepository, {
        principalSubject: OWNER.subject,
        prospectIds: [seeded.prospectId],
        operation: "business_contact_lookup/v1",
        maxUnits: 1,
        maxCostMinor: 10,
        currency: "CAD",
        expiresAt: NOW + 5_000,
        expectedRevision: issuanceSnapshot.revision,
        idempotencyKey: "phase5-stale-workspace-grant-key",
        now: NOW + 1,
      }),
      /enrichment_grant_commit_failed/,
      "grant insertion atomically rejects a workspace revision changed after admission",
    );
    const currentIssuanceSnapshot = await repository.loadIssuanceSnapshot(OWNER.subject, [seeded.prospectId]);
    const issued = await issuance.issueEnrichmentGrant(repository, {
      principalSubject: OWNER.subject,
      prospectIds: [seeded.prospectId],
      operation: "business_contact_lookup/v1",
      maxUnits: 1,
      maxCostMinor: 10,
      currency: "CAD",
      expiresAt: NOW + 5_000,
      expectedRevision: currentIssuanceSnapshot.revision,
      idempotencyKey: "phase5-stale-race-grant-key",
      now: NOW + 1,
    });
    assert.equal(issued.kind, "issued");
    await seedReservationInputs(fixture.database, seeded, issued.grant);
    const admittedBeforeRace = await repository.loadReservationAuthority(issued.grant.id);
    assert.equal(admittedBeforeRace?.prospects.length, 1);
    const racingRepository = {
      async loadReservationAuthority() {
        return admittedBeforeRace;
      },
      async commitReservation(record, accounts) {
        return repository.commitReservation(record, accounts);
      },
    };
    await fixture.database.prepare(
      "UPDATE profile_prospects SET state='rejected',revision=revision+1,updated_at=? WHERE id=? AND workspace_id=?",
    ).bind(NOW + 2, seeded.prospectId, seeded.workspaceId).run();
    const staleProspect = await authority.reserveEnrichmentOperation(racingRepository, {
      grantId: issued.grant.id,
      principalSubject: OWNER.subject,
      operationKey: issued.grant.tuple.operationKey,
      now: NOW + 3,
    });
    assert.equal(staleProspect.kind, "blocked");
    assert.equal(await countRows(fixture.database, "enrichment_reservations"), 0);
    await fixture.database.prepare(
      "UPDATE profile_prospects SET state='approved',revision=revision-1,updated_at=? WHERE id=? AND workspace_id=?",
    ).bind(NOW + 4, seeded.prospectId, seeded.workspaceId).run();
    await fixture.database.batch([
      fixture.database.prepare(
        "UPDATE typed_configurations SET active=0,updated_at=? WHERE id=? AND workspace_id=?",
      ).bind(NOW + 5, seeded.configurationId, seeded.workspaceId),
      fixture.database.prepare(
        `INSERT INTO typed_configurations
          (id,workspace_id,created_at,updated_at,revision,company_id,owner_type,owner_id,kind,digest,manifest_json,active)
         SELECT 'replacement-profile-configuration',workspace_id,?,?,1,company_id,owner_type,owner_id,kind,?,'{}',1
         FROM typed_configurations WHERE id=? AND workspace_id=?`,
      ).bind(NOW + 5, NOW + 5, "2".repeat(64), seeded.configurationId, seeded.workspaceId),
    ]);
    assert.equal(
      await repository.loadIssuanceSnapshot(OWNER.subject, [seeded.prospectId]),
      null,
      "an old approved prospect is not eligible under a replacement configuration",
    );
    const staleConfiguration = await authority.reserveEnrichmentOperation(racingRepository, {
      grantId: issued.grant.id,
      principalSubject: OWNER.subject,
      operationKey: issued.grant.tuple.operationKey,
      now: NOW + 6,
    });
    assert.equal(staleConfiguration.kind, "blocked");
    assert.equal(await countRows(fixture.database, "enrichment_reservations"), 0);
    const accounts = (await fixture.database.prepare(
      "SELECT actual_units,reserved_units,actual_cost_minor,reserved_cost_minor FROM enrichment_budget_accounts WHERE workspace_id=?",
    ).bind(seeded.workspaceId).all()).results;
    assert.ok(accounts.every((row) =>
      Number(row.actual_units) === 0 && Number(row.reserved_units) === 0
      && Number(row.actual_cost_minor) === 0 && Number(row.reserved_cost_minor) === 0
    ));
  } finally {
    await fixture.dispose();
  }
});

test("runner reservations enforce retry lineage and atomically settle both accounting scopes", async () => {
  const fixture = await createD1Fixture("phase5-persistence-runner-ledger");
  try {
    await applyMigrations(fixture.database);
    const repositoryModule = await fixture.vite.ssrLoadModule(new URL("../domain/enrichment-repository.ts", import.meta.url).pathname);
    const runner = await fixture.vite.ssrLoadModule(new URL("../domain/runner-spend-authority.ts", import.meta.url).pathname);
    const workspaceId = "runner-workspace";
    const ownerSubject = "runner-owner";
    await fixture.database.prepare(
      "INSERT INTO workspaces (id,company_name,owner_subject,created_at,updated_at,revision) VALUES (?,?,?,?,?,1)",
    ).bind(workspaceId, "Runner Company", ownerSubject, NOW, NOW).run();
    const seeded = await seedRunnerAuthority(fixture.database, runner, repositoryModule, {
      workspaceId,
      ownerSubject,
      grantId: "runner-grant-a",
      scopeId: "runner-scope-a",
      maxRetries: 1,
    });
    const repository = repositoryModule.createD1RunnerSpendRepository(fixture.database, {
      workspaceId,
      ownerSubject,
      now: () => NOW,
    });
    const authority0 = await repository.loadRunnerAuthority(seeded.grant.id);
    assert.equal(authority0?.attempt.attemptNumber, 0);
    const operationKey0 = await runner.deriveRunnerOperationKey(authority0);
    const reservation0 = await runner.reserveRunnerSpend(repository, {
      grantId: seeded.grant.id,
      principalSubject: ownerSubject,
      operationKey: operationKey0,
      now: NOW,
    });
    assert.equal(reservation0.kind, "reserved", JSON.stringify(reservation0));
    await assert.rejects(
      fixture.database.prepare(
        `UPDATE runner_budget_accounts
         SET actual_cost_minor=actual_cost_minor+1,revision=revision+1,updated_at=?
         WHERE id=?`,
      ).bind(NOW + 1, seeded.monthlyId).run(),
      /invalid runner budget mutation/,
      "application SQL cannot manufacture runner ledger usage",
    );
    assert.equal(await repository.markRunnerAssigned(reservation0.reservation.id, NOW - 1), true, "repository clock, not caller time, admits a current reservation");
    assert.equal(await repository.markRunnerAssigned(reservation0.reservation.id, seeded.grant.expiresAt), false);
    await assert.rejects(
      fixture.database.prepare(
        `INSERT INTO runner_spend_reservation_events
          (id,workspace_id,reservation_id,durable_revision,state,terminal_reason,settlement_digest,
           documented_cost_minor,acknowledgement_digest,created_at)
         VALUES ('runner-null-reason',?,?,2,'needs_reconciliation',NULL,NULL,NULL,?,?)`,
      ).bind(workspaceId, reservation0.reservation.id, "e".repeat(64), NOW + 1).run(),
      /invalid runner reservation lifecycle/,
      "NULL cannot fall through a runner reason allowlist",
    );
    assert.equal(await repository.markRunnerAssigned(reservation0.reservation.id, NOW + 1), false);
    const clockGovernedOutcome = await repository.recordRunnerOutcome({
      reservationId: reservation0.reservation.id,
      state: "needs_reconciliation",
      terminalReason: "timeout",
      documentedCostMinor: null,
      settlementDigest: null,
      now: NOW - 1,
    });
    assert.equal(clockGovernedOutcome.state, "needs_reconciliation", "repository clock, not a stale caller timestamp, governs durable chronology");
    await repository.recordRunnerOutcome({
      reservationId: reservation0.reservation.id,
      state: "needs_reconciliation",
      terminalReason: "timeout",
      documentedCostMinor: null,
      settlementDigest: null,
      now: NOW + 2,
    });
    let accounts = await readRunnerAccounts(fixture.database, workspaceId);
    assert.ok(accounts.every((row) => Number(row.actual_cost_minor) === 0));
    assert.equal(Number(accounts.find((row) => row.id === seeded.monthlyId).reserved_cost_minor), 10);
    const settled = await repository.recordRunnerOutcome({
      reservationId: reservation0.reservation.id,
      state: "settled",
      terminalReason: "partial",
      documentedCostMinor: 7,
      settlementDigest: "8".repeat(64),
      now: NOW + 3,
    });
    assert.equal(settled.state, "settled");
    accounts = await readRunnerAccounts(fixture.database, workspaceId);
    const settledAccounts = accounts.filter((row) => row.id === seeded.monthlyId || row.id === seeded.perRunIds[0]);
    assert.ok(settledAccounts.every((row) =>
      Number(row.actual_cost_minor) === 7 && Number(row.reserved_cost_minor) === 0 && Number(row.revision) === 3
    ));

    const retrySeed = await seedRunnerAuthority(fixture.database, runner, repositoryModule, {
      workspaceId,
      ownerSubject,
      grantId: "runner-grant-b",
      scopeId: "runner-scope-b",
      maxRetries: 1,
    });
    const retryAuthority0 = await repository.loadRunnerAuthority(retrySeed.grant.id);
    const retryKey0 = await runner.deriveRunnerOperationKey(retryAuthority0);
    const retry0 = await runner.reserveRunnerSpend(repository, {
      grantId: retrySeed.grant.id,
      principalSubject: ownerSubject,
      operationKey: retryKey0,
      now: NOW,
    });
    assert.equal(retry0.kind, "reserved");
    assert.equal(await repository.markRunnerAssigned(retry0.reservation.id, NOW + 1), true);
    await repository.recordRunnerOutcome({
      reservationId: retry0.reservation.id,
      state: "failed_retryable",
      terminalReason: "failed_retryable",
      documentedCostMinor: 4,
      settlementDigest: "9".repeat(64),
      now: NOW + 2,
    });
    const retryAuthority1 = await repository.loadRunnerAuthority(retrySeed.grant.id);
    assert.deepEqual(
      {
        attemptNumber: retryAuthority1.attempt.attemptNumber,
        previousOutcome: retryAuthority1.attempt.previousOutcome,
        previousOperationKeys: [...retryAuthority1.attempt.previousOperationKeys],
      },
      { attemptNumber: 1, previousOutcome: "failed_retryable", previousOperationKeys: [retryKey0] },
    );
    const retryKey1 = await runner.deriveRunnerOperationKey(retryAuthority1);
    const retry1 = await runner.reserveRunnerSpend(repository, {
      grantId: retrySeed.grant.id,
      principalSubject: ownerSubject,
      operationKey: retryKey1,
      now: NOW,
    });
    assert.equal(retry1.kind, "reserved");
    assert.equal(retry1.reservation.attemptNumber, 1);
    const forged = await repository.commitRunnerReservation(
      { ...retry1.reservation, operationKey: `ro_${"f".repeat(64)}` },
      [retryAuthority1.perRun, retryAuthority1.monthly],
      retryAuthority1.attempt,
    );
    assert.equal(forged.kind, "blocked");
    const retryAccounts = await readRunnerAccounts(fixture.database, workspaceId);
    assert.deepEqual(
      retryAccounts.filter((row) => row.id === retrySeed.monthlyId).map((row) => ({
        actual: Number(row.actual_cost_minor),
        reserved: Number(row.reserved_cost_minor),
        revision: Number(row.revision),
      })),
      [{ actual: 4, reserved: 10, revision: 4 }],
    );
    assert.equal(await repository.markRunnerAssigned(retry1.reservation.id, NOW + 3), true);
    await assert.rejects(
      repository.recordRunnerOutcome({
        reservationId: retry1.reservation.id,
        state: "failed_retryable",
        terminalReason: "failed_retryable",
        documentedCostMinor: 0,
        settlementDigest: "c".repeat(64),
        now: NOW + 4,
      }),
      /runner_outcome_commit_failed/,
      "the last authorized attempt cannot manufacture another retry",
    );
    await repository.recordRunnerOutcome({
      reservationId: retry1.reservation.id,
      state: "released",
      terminalReason: "rejected",
      documentedCostMinor: 0,
      settlementDigest: "d".repeat(64),
      now: NOW + 5,
    });
    const releasedRetryAccounts = await readRunnerAccounts(fixture.database, workspaceId);
    assert.deepEqual(
      releasedRetryAccounts.filter((row) => row.id === retrySeed.monthlyId).map((row) => ({
        actual: Number(row.actual_cost_minor),
        reserved: Number(row.reserved_cost_minor),
        revision: Number(row.revision),
      })),
      [{ actual: 4, reserved: 0, revision: 5 }],
    );
  } finally {
    await fixture.dispose();
  }
});

test("runner admission atomically enforces each grant monthly ceiling on a shared account", async () => {
  const fixture = await createD1Fixture("phase5-persistence-runner-grant-monthly-ceiling");
  try {
    await applyMigrations(fixture.database);
    const repositoryModule = await fixture.vite.ssrLoadModule(new URL("../domain/enrichment-repository.ts", import.meta.url).pathname);
    const runner = await fixture.vite.ssrLoadModule(new URL("../domain/runner-spend-authority.ts", import.meta.url).pathname);
    const workspaceId = "runner-grant-ceiling-workspace";
    const ownerSubject = "runner-grant-ceiling-owner";
    await fixture.database.prepare(
      "INSERT INTO workspaces (id,company_name,owner_subject,created_at,updated_at,revision) VALUES (?,?,?,?,?,1)",
    ).bind(workspaceId, "Runner Grant Ceiling Company", ownerSubject, NOW, NOW).run();
    const firstSeed = await seedRunnerAuthority(fixture.database, runner, repositoryModule, {
      workspaceId,
      ownerSubject,
      grantId: "runner-grant-ceiling-first",
      grantDigest: "1".repeat(64),
      scopeId: "runner-grant-ceiling-scope",
      maxRetries: 0,
      monthlyCostMinor: 100,
    });
    const secondSeed = await seedRunnerAuthority(fixture.database, runner, repositoryModule, {
      workspaceId,
      ownerSubject,
      grantId: "runner-grant-ceiling-second",
      grantDigest: "2".repeat(64),
      scopeId: "runner-grant-ceiling-scope",
      maxRetries: 0,
      monthlyCostMinor: 15,
      reuseMonthly: true,
    });
    assert.equal(firstSeed.monthlyId, secondSeed.monthlyId);
    const repository = repositoryModule.createD1RunnerSpendRepository(fixture.database, {
      workspaceId,
      ownerSubject,
      now: () => NOW,
    });
    const firstAuthority = await repository.loadRunnerAuthority(firstSeed.grant.id);
    const staleSecondAuthority = await repository.loadRunnerAuthority(secondSeed.grant.id);
    const firstKey = await runner.deriveRunnerOperationKey(firstAuthority);
    const secondKey = await runner.deriveRunnerOperationKey(staleSecondAuthority);
    const first = await runner.reserveRunnerSpend(repository, {
      grantId: firstSeed.grant.id,
      principalSubject: ownerSubject,
      operationKey: firstKey,
      now: NOW,
    });
    assert.equal(first.kind, "reserved");
    const staleRepository = {
      async loadRunnerAuthority(grantId) {
        return grantId === secondSeed.grant.id ? staleSecondAuthority : null;
      },
      commitRunnerReservation(record, accounts, attempt) {
        return repository.commitRunnerReservation(record, accounts, attempt);
      },
    };
    const blocked = await runner.reserveRunnerSpend(staleRepository, {
      grantId: secondSeed.grant.id,
      principalSubject: ownerSubject,
      operationKey: secondKey,
      now: NOW,
    });
    assert.deepEqual(blocked, { kind: "blocked", reason: "runner_budget_exceeded" });
    const monthly = (await readRunnerAccounts(fixture.database, workspaceId))
      .find((row) => row.id === firstSeed.monthlyId);
    assert.deepEqual(
      { actual: Number(monthly.actual_cost_minor), reserved: Number(monthly.reserved_cost_minor), revision: Number(monthly.revision) },
      { actual: 0, reserved: 10, revision: 2 },
    );
    assert.equal(await countRows(fixture.database, "runner_spend_reservations"), 1);
  } finally {
    await fixture.dispose();
  }
});

test("overlapping runner reservations settle and release one shared monthly account in either order", async () => {
  for (const settledFirst of [true, false]) {
    const fixture = await createD1Fixture(`phase5-persistence-overlap-runner-${settledFirst}`);
    try {
      await applyMigrations(fixture.database);
      const repositoryModule = await fixture.vite.ssrLoadModule(new URL("../domain/enrichment-repository.ts", import.meta.url).pathname);
      const runner = await fixture.vite.ssrLoadModule(new URL("../domain/runner-spend-authority.ts", import.meta.url).pathname);
      const workspaceId = `runner-overlap-workspace-${settledFirst}`;
      const ownerSubject = "runner-overlap-owner";
      await fixture.database.prepare(
        "INSERT INTO workspaces (id,company_name,owner_subject,created_at,updated_at,revision) VALUES (?,?,?,?,?,1)",
      ).bind(workspaceId, "Runner Overlap Company", ownerSubject, NOW, NOW).run();
      const firstSeed = await seedRunnerAuthority(fixture.database, runner, repositoryModule, {
        workspaceId,
        ownerSubject,
        grantId: `runner-overlap-first-${settledFirst}`,
        grantDigest: "a".repeat(64),
        scopeId: "runner-overlap-scope",
        maxRetries: 0,
      });
      const secondSeed = await seedRunnerAuthority(fixture.database, runner, repositoryModule, {
        workspaceId,
        ownerSubject,
        grantId: `runner-overlap-second-${settledFirst}`,
        grantDigest: "b".repeat(64),
        scopeId: "runner-overlap-scope",
        maxRetries: 0,
        reuseMonthly: true,
      });
      assert.equal(firstSeed.monthlyId, secondSeed.monthlyId);
      const repository = repositoryModule.createD1RunnerSpendRepository(fixture.database, {
        workspaceId,
        ownerSubject,
        now: () => NOW,
      });
      const reserve = async (seed) => {
        const authority = await repository.loadRunnerAuthority(seed.grant.id);
        return runner.reserveRunnerSpend(repository, {
          grantId: seed.grant.id,
          principalSubject: ownerSubject,
          operationKey: await runner.deriveRunnerOperationKey(authority),
          now: NOW,
        });
      };
      const first = await reserve(firstSeed);
      const second = await reserve(secondSeed);
      assert.equal(first.kind, "reserved");
      assert.equal(second.kind, "reserved");
      let monthly = (await readRunnerAccounts(fixture.database, workspaceId)).find((row) => row.id === firstSeed.monthlyId);
      assert.deepEqual(
        { actual: Number(monthly.actual_cost_minor), reserved: Number(monthly.reserved_cost_minor), revision: Number(monthly.revision) },
        { actual: 0, reserved: 20, revision: 3 },
      );
      assert.equal(await repository.markRunnerAssigned(first.reservation.id, NOW + 1), true);
      assert.equal(await repository.markRunnerAssigned(second.reservation.id, NOW + 1), true);
      const settledWrite = {
        reservationId: first.reservation.id,
        state: "settled",
        terminalReason: "completed",
        documentedCostMinor: 10,
        settlementDigest: "6".repeat(64),
        now: NOW + 2,
      };
      const releasedWrite = {
        reservationId: second.reservation.id,
        state: "released",
        terminalReason: "rejected",
        documentedCostMinor: 0,
        settlementDigest: "7".repeat(64),
        now: NOW + 3,
      };
      const operations = settledFirst ? [settledWrite, releasedWrite] : [releasedWrite, settledWrite];
      for (const outcome of operations) {
        const acknowledgement = await repository.recordRunnerOutcome(outcome);
        assert.deepEqual(await repository.recordRunnerOutcome(outcome), acknowledgement);
      }
      monthly = (await readRunnerAccounts(fixture.database, workspaceId)).find((row) => row.id === firstSeed.monthlyId);
      assert.deepEqual(
        { actual: Number(monthly.actual_cost_minor), reserved: Number(monthly.reserved_cost_minor), revision: Number(monthly.revision) },
        { actual: 10, reserved: 0, revision: 5 },
      );
      const perRun = (await readRunnerAccounts(fixture.database, workspaceId))
        .filter((row) => row.id === firstSeed.perRunIds[0] || row.id === secondSeed.perRunIds[0])
        .map((row) => ({ actual: Number(row.actual_cost_minor), reserved: Number(row.reserved_cost_minor), revision: Number(row.revision) }))
        .sort((left, right) => left.actual - right.actual);
      assert.deepEqual(perRun, [
        { actual: 0, reserved: 0, revision: 3 },
        { actual: 10, reserved: 0, revision: 3 },
      ]);
      assert.equal(Number((await fixture.database.prepare(
        "SELECT count(*) count FROM runner_spend_reservation_events WHERE reservation_id IN (?,?) AND state IN ('failed_retryable','settled','released')",
      ).bind(first.reservation.id, second.reservation.id).first()).count), 2);
      await assert.rejects(
        fixture.database.prepare(
          "UPDATE runner_budget_accounts SET actual_cost_minor=actual_cost_minor+1,revision=revision+1,updated_at=? WHERE id=?",
        ).bind(NOW + 4, firstSeed.monthlyId).run(),
        /invalid runner budget mutation/,
      );
    } finally {
      await fixture.dispose();
    }
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
         VALUES ('scope-suggestion','scope-w','scope-owner','contact','split',1,?,'["scope-contact"]','["scope-contact"]','[]','[]',?,?,?)`,
      ).bind(
        '{"scope-contact":1}',
        '{"sourceId":"scope-contact","newIdentityId":"scope-contact-split","moveAssociationIds":["scope-association"]}',
        "f".repeat(64),
        NOW,
      ),
    ]);
    await assert.rejects(
      fixture.database.prepare(
        "INSERT INTO identity_suggestion_candidates (id,workspace_id,suggestion_id,subject_id,candidate_revision,ordinal) VALUES ('wrong-kind','scope-w','scope-suggestion','scope-org',1,0)",
      ).run(),
      /invalid identity candidate (?:shape|kind or scope)/,
    );
    const monthly = "INSERT INTO runner_budget_accounts (id,workspace_id,scope,owner_subject,provider_id,scope_id,period,attempt_number,operation_key,currency,actual_cost_minor,reserved_cost_minor,max_cost_minor,revision,created_at,updated_at) VALUES (?,'scope-w','runner_monthly','scope-owner','provider-a','profile-a','2026-07',NULL,NULL,'CAD',0,0,100,1,?,?)";
    await assert.rejects(
      fixture.database.prepare(monthly).bind("runner-month-a", NOW, NOW).run(),
      /invalid or duplicate runner budget account/,
      "runner monthly authority cannot be manufactured without an owner-issued grant",
    );
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

async function insertContactObservation(database, grant, input) {
  const verified = input.verifiedAt !== null;
  const providerId = input.providerId === undefined ? grant.tuple.providerId : input.providerId;
  const providerVersion = input.providerVersion === undefined ? grant.tuple.providerVersion : input.providerVersion;
  const catalogRef = input.catalogRef === undefined ? grant.tuple.catalogRef : input.catalogRef;
  await database.prepare(
    `INSERT INTO contact_point_observations
      (id,workspace_id,assignment_id,contact_id,configuration_id,configuration_digest,kind,
       contact_point_digest,contact_point_reference,verification_class,confidence_basis_points,method,
       source_reference,excerpt_digest,object_reference,content_hash,retrieved_at,observed_at,verified_at,
       provider_id,provider_version,catalog_ref,verifier_id,verifier_version,verdict_reference,verdict_digest,
       parent_observation_id,observation_digest,created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'email',
       ?, ?, ?, 9000, ?,
       ?, ?, ?, ?, ?, ?, ?,
       ?, ?, ?, ?, ?, ?, ?,
       NULL, ?, ?)`,
  ).bind(
    input.id,
    grant.workspaceId,
    input.assignmentId,
    input.contactId,
    grant.tuple.configurationId,
    grant.tuple.configurationDigest,
    input.digestChar.repeat(64),
    `contact-point:${input.id}`,
    input.verificationClass,
    input.method,
    `source:${input.id}`,
    input.digestChar.repeat(64),
    `object:${input.id}`,
    input.digestChar.repeat(64),
    input.retrievedAt,
    input.observedAt,
    input.verifiedAt,
    providerId,
    providerVersion,
    catalogRef,
    verified ? "test-verifier" : null,
    verified ? "v1" : null,
    verified ? `verdict:${input.id}` : null,
    verified ? input.digestChar.repeat(64) : null,
    input.digestChar.repeat(64),
    NOW,
  ).run();
}

async function insertContactEligibilitySnapshot(database, seeded, lineage, input) {
  return database.prepare(
    `INSERT INTO contact_eligibility_snapshots
      (id,workspace_id,contact_id,prospect_id,configuration_id,configuration_digest,configuration_revision,
       prospect_revision,state,eligible,observation_ids_json,reason_codes_json,preserved_suppression_refs_json,
       snapshot_digest,projected_at)
     VALUES (?,?,'p5-contact','p5-prospect',?,?,?,?,'ContactReady',1,?,?,?,?,?)`,
  ).bind(
    input.id,
    seeded.workspaceId,
    seeded.configurationId,
    lineage.configuration_digest,
    lineage.configuration_revision,
    lineage.prospect_revision,
    input.observationIdsJson,
    input.reasonCodesJson ?? "[]",
    input.suppressionRefsJson ?? "[]",
    input.digest,
    input.projectedAt ?? NOW,
  ).run();
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

async function seedOverlappingEnrichmentInputs(database, seeded, grants) {
  const company = await database.prepare("SELECT id FROM companies WHERE workspace_id=? LIMIT 1").bind(seeded.workspaceId).first();
  await database.prepare(
    "INSERT INTO contacts (id,workspace_id,created_at,updated_at,revision,company_id,identity_digest,display_name) VALUES ('p5-contact',?,?,?,1,?,?,'Synthetic Contact')",
  ).bind(seeded.workspaceId, NOW, NOW, company.id, "e".repeat(64)).run();
  for (const [index, grant] of grants.entries()) {
    await database.prepare(
      `INSERT INTO contact_evidence_assignments
        (id,workspace_id,reservation_id,grant_id,prospect_id,contact_id,role,configuration_id,configuration_digest,
         provider_id,provider_version,catalog_ref,quote_revision,assignment_digest,created_at)
       VALUES (?,?,NULL,?,'p5-prospect','p5-contact','champion',?,?,?,?,?,1,?,?)`,
    ).bind(
      `p5-overlap-assignment-${index}`, seeded.workspaceId, grant.id, grant.tuple.configurationId,
      grant.tuple.configurationDigest, grant.tuple.providerId, grant.tuple.providerVersion, grant.tuple.catalogRef,
      String(index + 1).repeat(64), NOW,
    ).run();
    const grantAccountId = `enrichment:${seeded.workspaceId.length}:${seeded.workspaceId}:grant:${grant.id.length}:${grant.id}`;
    await database.prepare(
      `INSERT INTO enrichment_budget_accounts
        (id,workspace_id,authority_type,scope,entity_id,currency,actual_units,reserved_units,max_units,
         actual_cost_minor,reserved_cost_minor,max_cost_minor,revision,created_at,updated_at)
       VALUES (?,?,'enrichment','grant',?,'CAD',0,0,1,0,0,10,1,?,?)`,
    ).bind(grantAccountId, seeded.workspaceId, grant.id, NOW, NOW).run();
  }
  const sharedEntities = {
    profile: grants[0].tuple.configurationId,
    workspace: seeded.workspaceId,
    provider: grants[0].tuple.providerId,
  };
  for (const [scope, entityId] of Object.entries(sharedEntities)) {
    const accountId = `enrichment:${seeded.workspaceId.length}:${seeded.workspaceId}:${scope}:${entityId.length}:${entityId}`;
    await database.prepare(
      `INSERT INTO enrichment_budget_accounts
        (id,workspace_id,authority_type,scope,entity_id,currency,actual_units,reserved_units,max_units,
         actual_cost_minor,reserved_cost_minor,max_cost_minor,revision,created_at,updated_at)
       VALUES (?,?,'enrichment',?,?,'CAD',0,0,2,0,0,20,1,?,?)`,
    ).bind(accountId, seeded.workspaceId, scope, entityId, NOW, NOW).run();
  }
}

async function readSharedEnrichmentAccounts(database, workspaceId) {
  return (await database.prepare(
    `SELECT actual_units,reserved_units,actual_cost_minor,reserved_cost_minor,revision
     FROM enrichment_budget_accounts WHERE workspace_id=? AND scope IN ('profile','workspace','provider') ORDER BY scope`,
  ).bind(workspaceId).all()).results;
}

async function seedRunnerAuthority(database, runner, repositoryModule, input) {
  const issued = await repositoryModule.issueD1RunnerSpendAuthority(
    database,
    {
      workspaceId: input.workspaceId,
      ownerSubject: input.ownerSubject,
      now: () => NOW,
    },
    {
      providerId: "runner-provider",
      model: "runner-model",
      catalogRef: "runner-catalog",
      runType: "prospecting",
      scopeId: input.scopeId,
      perRunCostMinor: input.perRunCostMinor ?? 10,
      monthlyCostMinor: input.monthlyCostMinor ?? 100,
      currency: "CAD",
      maxRetries: input.maxRetries,
      expiresAt: NOW + 10_000,
      expectedRevision: 1,
      idempotencyKey: input.grantId,
    },
  );
  return {
    grant: issued.grant,
    monthlyId: issued.monthlyAccountId,
    perRunIds: [...issued.perRunAccountIds],
  };
}

async function testContactSettlementAttestor(fixture) {
  const existing = contactAttestors.get(fixture);
  if (existing) return existing;
  const pending = (async () => {
    const attestorModule = await fixture.vite.ssrLoadModule(
      new URL("../domain/contact-settlement-attestor.ts", import.meta.url).pathname,
    );
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode("phase5-local-attestation-test-key"),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign", "verify"],
    );
    const attestor = attestorModule.bindContactSettlementAttestor({
      active: { keyId: "phase5-local-test-key", key },
      verificationOnly: [],
    });
    assert.ok(attestor);
    return attestor;
  })();
  contactAttestors.set(fixture, pending);
  return pending;
}

async function readRunnerAccounts(database, workspaceId) {
  return (await database.prepare(
    "SELECT id,actual_cost_minor,reserved_cost_minor,revision FROM runner_budget_accounts WHERE workspace_id=? ORDER BY id",
  ).bind(workspaceId).all()).results;
}

test("repository clock, not a stale claim timestamp, governs enrichment expiry release", async () => {
  const fixture = await createD1Fixture("phase5-repository-clock-enrichment");
  try {
    const setup = await issueBoundaryGrant(fixture, "repository-clock-enrichment");
    const expiredRepository = setup.repositoryModule.createD1EnrichmentRepository(fixture.database, { workspaceId: setup.seeded.workspaceId, ownerSubject: OWNER.subject, now: () => NOW + 5_000, contactSettlementAttestor: await testContactSettlementAttestor(fixture) });
    assert.deepEqual(
      await setup.authority.claimAdmittedCommittedInvocation(expiredRepository, setup.reserved.reservation.id, NOW + 3),
      { kind: "blocked", reason: "expired" },
      "a caller cannot preserve a pre-expiry claim timestamp after the repository clock reaches expiry",
    );
    const terminal = await fixture.database.prepare("SELECT state,terminal_reason,documented_units,documented_cost_minor FROM enrichment_reservation_events WHERE reservation_id=? ORDER BY durable_revision DESC LIMIT 1").bind(setup.reserved.reservation.id).first();
    assert.deepEqual({ state: terminal.state, reason: terminal.terminal_reason, units: Number(terminal.documented_units), cost: Number(terminal.documented_cost_minor) }, { state: "released", reason: "expired", units: 0, cost: 0 });
  } finally { await fixture.dispose(); }
});

test("repository clock, not a stale caller timestamp, governs runner assignment expiry", async () => {
  const fixture = await createD1Fixture("phase5-repository-clock-runner");
  try {
    await applyMigrations(fixture.database);
    const repositoryModule = await fixture.vite.ssrLoadModule(new URL("../domain/enrichment-repository.ts", import.meta.url).pathname);
    const runner = await fixture.vite.ssrLoadModule(new URL("../domain/runner-spend-authority.ts", import.meta.url).pathname);
    const workspaceId = "runner-clock-workspace", ownerSubject = "runner-clock-owner";
    await fixture.database.prepare("INSERT INTO workspaces (id,company_name,owner_subject,created_at,updated_at,revision) VALUES (?,?,?,?,?,1)").bind(workspaceId, "Runner clock", ownerSubject, NOW, NOW).run();
    const seeded = await seedRunnerAuthority(fixture.database, runner, repositoryModule, { workspaceId, ownerSubject, grantId: "runner-clock-grant", scopeId: "runner-clock-scope", maxRetries: 0 });
    const activeRepository = repositoryModule.createD1RunnerSpendRepository(fixture.database, { workspaceId, ownerSubject, now: () => NOW });
    const authority = await activeRepository.loadRunnerAuthority(seeded.grant.id), operationKey = await runner.deriveRunnerOperationKey(authority);
    const reserved = await runner.reserveRunnerSpend(activeRepository, { grantId: seeded.grant.id, principalSubject: ownerSubject, operationKey, now: NOW });
    assert.equal(reserved.kind, "reserved");
    const expiredRepository = repositoryModule.createD1RunnerSpendRepository(fixture.database, { workspaceId, ownerSubject, now: () => seeded.grant.expiresAt });
    assert.equal(await expiredRepository.markRunnerAssigned(reserved.reservation.id, NOW + 1), false, "a stale caller timestamp cannot assign after repository-clock expiry");
  } finally { await fixture.dispose(); }
});

test("D1 ContactReady snapshot rejects evidence exactly at the freshness expiry boundary", async () => {
  const fixture = await createD1Fixture("phase5-contactready-expiry-boundary");
  try {
    const setup = await issueBoundaryGrant(fixture, "contactready-expiry-boundary");
    const lineage = await currentEligibilityLineage(fixture.database, setup.seeded);
    const expiry = NOW + 20_000, verifiedAt = expiry - 2_592_000_000;
    assert.equal(
      (await setup.authority.claimAdmittedCommittedInvocation(
        setup.repository,
        setup.reserved.reservation.id,
        NOW + 3,
      )).kind,
      "claimed",
    );
    const observation = await makeVerifiedContactObservation(fixture, setup, {
      id: "boundary-observation",
      verifierVersion: "v1",
      verdictReference: "verdict:boundary",
      verdictDigest: "f".repeat(64),
      retrievedAt: verifiedAt - 2,
      observedAt: verifiedAt,
      verifiedAt,
    });
    const identity = await setup.authority.deriveEnrichmentSettlementIdentity({
      reservationId: setup.reserved.reservation.id,
      terminalState: "settled",
      terminalReason: "completed",
      documentedUnits: 1,
      documentedCostMinor: 10,
      observations: [observation],
    });
    await setup.repository.settleReservation(setup.reserved.reservation.id, {
      state: "settled",
      documentedUnits: 1,
      documentedCostMinor: 10,
      reason: "completed",
      observations: [observation],
      settlementDigest: identity.settlementDigest,
    });
    await assert.rejects(
      insertContactEligibilitySnapshot(fixture.database, setup.seeded, lineage, { id: "boundary-contactready", digest: "e".repeat(64), observationIdsJson: '["boundary-observation"]', projectedAt: expiry }),
      /invalid contact eligibility snapshot/,
      "ContactReady expires at the exact now >= verifiedAt + freshness boundary",
    );
  } finally { await fixture.dispose(); }
});

test("released/rejected enrichment settlement cannot persist usage, cost, or evidence", async () => {
  const fixture = await createD1Fixture("phase5-rejected-settlement-zero");
  try {
    const setup = await issueBoundaryGrant(fixture, "rejected-settlement-zero");
    const observation = "rejected-settlement-observation";
    await insertContactObservation(fixture.database, setup.issued.grant, {
      id: observation,
      assignmentId: "p5-contact-assignment",
      contactId: "p5-contact",
      digestChar: "d",
      verificationClass: "suggested",
      method: "pattern_inference",
      retrievedAt: NOW - 4,
      observedAt: NOW - 2,
      verifiedAt: null,
      providerId: null,
      providerVersion: null,
      catalogRef: null,
    });
    for (const [id, units, cost, observations] of [["rejected-nonzero-units", 1, 0, "[]"], ["rejected-nonzero-cost", 0, 1, "[]"], ["rejected-evidence", 1, 1, `[\"${observation}\"]`]]) {
      await assert.rejects(
        fixture.database.prepare("INSERT INTO enrichment_reservation_events (id,workspace_id,reservation_id,durable_revision,state,terminal_reason,settlement_digest,documented_units,documented_cost_minor,observation_ids_json,acknowledgement_digest,claimed_at,created_at) VALUES (?,?,?,2,'released','rejected',?,?,?,?,?,NULL,?)").bind(id,setup.seeded.workspaceId,setup.reserved.reservation.id,"a".repeat(64),units,cost,observations,"b".repeat(64),NOW + 4).run(),
        /invalid enrichment reservation lifecycle/,
        `${id} must be impossible for a released/rejected settlement`,
      );
    }
  } finally { await fixture.dispose(); }
});

test("D1 reservation rejects a grant whose source revision became stale after issuance", async () => {
  const fixture = await createD1Fixture("phase5-source-revision-race");
  try {
    const setup = await issueBoundaryGrant(fixture, "source-revision-race", { reserve: false });
    await fixture.database.prepare("UPDATE workspaces SET revision=revision+1,updated_at=? WHERE id=?").bind(NOW + 3, setup.seeded.workspaceId).run();
    const result = await setup.authority.reserveEnrichmentOperation(setup.repository, { grantId: setup.issued.grant.id, principalSubject: OWNER.subject, operationKey: setup.issued.grant.tuple.operationKey, now: NOW + 4 });
    assert.equal(result.kind, "blocked", "source revision must be rechecked even when configuration and prospect rows are unchanged");
    assert.equal(await countRows(fixture.database, "enrichment_reservations"), 0);
  } finally { await fixture.dispose(); }
});

test("D1 rejects a verified observation without its bound provider tuple", async () => {
  const fixture = await createD1Fixture("phase5-null-provider-tuple");
  try {
    const setup = await issueBoundaryGrant(fixture, "null-provider-tuple");
    await assert.rejects(
      insertContactObservation(fixture.database, setup.issued.grant, { id: "null-provider-observation", assignmentId: "p5-contact-assignment", contactId: "p5-contact", digestChar: "c", verificationClass: "mailbox_verified", method: "mailbox_verification", retrievedAt: NOW - 4, observedAt: NOW - 2, verifiedAt: NOW - 3, providerId: null, providerVersion: null, catalogRef: null }),
      /invalid contact observation/,
      "a verified observation must carry the exact provider tuple before it can be projected as ContactReady",
    );
  } finally { await fixture.dispose(); }
});

async function issueBoundaryGrant(fixture, suffix, options = {}) {
  await applyMigrations(fixture.database);
  const seeded = await seedApprovedProspect(fixture);
  const repositoryModule = await fixture.vite.ssrLoadModule(new URL("../domain/enrichment-repository.ts", import.meta.url).pathname);
  const issuance = await fixture.vite.ssrLoadModule(new URL("../domain/enrichment-grant-issuance.ts", import.meta.url).pathname);
  const authority = await fixture.vite.ssrLoadModule(new URL("../domain/enrichment-authority.ts", import.meta.url).pathname);
  const repository = repositoryModule.createD1EnrichmentRepository(fixture.database, { workspaceId: seeded.workspaceId, ownerSubject: OWNER.subject, now: () => NOW, contactSettlementAttestor: await testContactSettlementAttestor(fixture) });
  await fixture.database.prepare("INSERT INTO provider_quotes (id,workspace_id,provider_id,provider_version,catalog_ref,revision,operation,currency,unit_cost_minor,quote_digest,expires_at,created_at) VALUES (?,?, 'provider-a','v1','catalog-a',1,'business_contact_lookup/v1','CAD',10,?,?,?)").bind(`quote-${suffix}`,seeded.workspaceId,"a".repeat(64),NOW + 10_000,NOW).run();
  const snapshot = await repository.loadIssuanceSnapshot(OWNER.subject, [seeded.prospectId]);
  const issued = await issuance.issueEnrichmentGrant(repository, { principalSubject: OWNER.subject, prospectIds: [seeded.prospectId], operation: "business_contact_lookup/v1", maxUnits: 1, maxCostMinor: 10, currency: "CAD", expiresAt: NOW + 5_000, expectedRevision: snapshot.revision, idempotencyKey: `phase5-${suffix}`, now: NOW + 1 });
  assert.equal(issued.kind, "issued");
  await seedReservationInputs(fixture.database, seeded, issued.grant);
  const reserved = options.reserve === false ? null : await authority.reserveEnrichmentOperation(repository, { grantId: issued.grant.id, principalSubject: OWNER.subject, operationKey: issued.grant.tuple.operationKey, now: NOW + 2 });
  if (reserved) assert.equal(reserved.kind, "reserved");
  return { seeded, repositoryModule, repository, authority, issued, reserved };
}

async function makeVerifiedContactObservation(fixture, setup, input) {
  const contactEvidence = await fixture.vite.ssrLoadModule(
    new URL("../domain/contact-evidence.ts", import.meta.url).pathname,
  );
  const binding = setup.reserved.reservation.assignment.evidenceAssignments[0];
  const providerAuthority = {
    providerId: setup.issued.grant.tuple.providerId,
    providerVersion: setup.issued.grant.tuple.providerVersion,
    catalogRef: setup.issued.grant.tuple.catalogRef,
  };
  const assignment = {
    ...binding,
    quoteRevision: setup.issued.grant.tuple.quoteRevision,
    providerAuthority,
  };
  const envelope = {
    id: input.id,
    assignmentId: binding.assignmentId,
    prospectId: binding.prospectId,
    workspaceId: binding.workspaceId,
    contactId: binding.contactId,
    profileConfigurationId: binding.profileConfigurationId,
    profileConfigurationDigest: binding.profileConfigurationDigest,
    kind: "email",
    value: "verified@example.invalid",
    confidence: 1,
    provenance: {
      sourceReference: "source:verified-settlement",
      excerpt: "verified settlement evidence",
      objectReference: "object:verified-settlement",
      contentHash: "9".repeat(64),
      retrievedAt: input.retrievedAt ?? NOW - 4,
    },
    observedAt: input.observedAt ?? NOW - 2,
  };
  const verifier = contactEvidence.bindContactEvidenceVerifier(
    { verifierId: "settlement-verifier", verifierVersion: input.verifierVersion },
    async () => ({
      observationId: envelope.id,
      workspaceId: envelope.workspaceId,
      contactId: envelope.contactId,
      profileConfigurationId: envelope.profileConfigurationId,
      profileConfigurationDigest: envelope.profileConfigurationDigest,
      kind: envelope.kind,
      normalizedValue: envelope.value,
      contentHash: envelope.provenance.contentHash,
      verificationClass: "mailbox_verified",
      method: "mailbox_verification",
      verifiedAt: input.verifiedAt ?? NOW - 3,
      providerId: providerAuthority.providerId,
      providerVersion: providerAuthority.providerVersion,
      catalogRef: providerAuthority.catalogRef,
      verdictReference: input.verdictReference,
      verdictDigest: input.verdictDigest,
    }),
  );
  const trustedVerification = await contactEvidence.executeContactVerification(verifier, {
    assignmentId: binding.assignmentId,
    prospectId: binding.prospectId,
    role: binding.role,
    assignment: {
      workspaceId: binding.workspaceId,
      contactId: binding.contactId,
      profileConfigurationId: binding.profileConfigurationId,
      profileConfigurationDigest: binding.profileConfigurationDigest,
      ...providerAuthority,
      quoteRevision: setup.issued.grant.tuple.quoteRevision,
    },
    envelope,
  });
  assert.ok(trustedVerification, "the bound verifier should issue an in-process receipt");
  const result = contactEvidence.ingestContactEvidence(assignment, envelope, trustedVerification);
  assert.equal(result.accepted, true);
  return result.observation;
}

async function currentEligibilityLineage(database, seeded) {
  return database.prepare("SELECT p.revision prospect_revision,cfg.revision configuration_revision,cfg.digest configuration_digest FROM profile_prospects p JOIN typed_configurations cfg ON cfg.workspace_id=p.workspace_id AND cfg.owner_type='profile' AND cfg.owner_id=p.profile_id AND cfg.kind='profile_effective' AND cfg.active=1 WHERE p.id=? AND p.workspace_id=?").bind(seeded.prospectId, seeded.workspaceId).first();
}

async function sha256Text(value) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
