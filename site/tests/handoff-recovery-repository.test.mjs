// Plan 07-04 contract: the additive Phase 7 evidence migration (0023, owner-
// delegated decision D-1) and its admitted D1 repository seam.
//
// Everything here is local and synthetic. The repository only joins upstream
// Phase 4-6 projections and persists immutable evidence; it makes no schedule,
// suppression, eligibility, package, or restore-release decision of its own,
// and no case reaches a provider, a host, or a send path.

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { CANONICAL_MIGRATION_FILENAMES } from "../scripts/migration-chain.mjs";
import { applyMigrationsThrough, createD1Fixture } from "./helpers/d1.mjs";
import { OUTREACH_NOW, OUTREACH_OWNER, seedOutreachAuthority } from "./helpers/outreach-fixture.mjs";

const MIGRATION = "0023_handoff_recovery.sql";
const NEW_TABLES = Object.freeze([
  "handoff_delivery_events",
  "handoff_export_artifacts",
  "handoff_export_snapshot_rows",
  "handoff_export_snapshots",
  "handoff_recovery_audit_events",
  "handoff_recovery_commands",
  "handoff_schedule_observations",
  "handoff_suppression_exclusions",
  "handoff_weekly_report_entries",
  "handoff_weekly_reports",
  "recovery_archives",
  "recovery_dry_runs",
  "recovery_restore_locks",
  "recovery_restore_results",
]);
const RECOVERY_EVIDENCE_TABLES = new Set(["handoff_recovery_commands", "handoff_recovery_audit_events", "recovery_dry_runs", "recovery_restore_locks", "recovery_restore_results"]);
const T0 = OUTREACH_NOW + 1_000;
const HOUR = 60 * 60 * 1000;
const hex = (character) => character.repeat(64);

async function load(fixture, path) {
  return fixture.vite.ssrLoadModule(new URL(`../domain/${path}`, import.meta.url).pathname);
}

async function applyFiles(database, filenames) {
  for (const filename of filenames) {
    const sql = await readFile(new URL(`../drizzle/${filename}`, import.meta.url), "utf8");
    for (const statement of sql.split("--> statement-breakpoint")) {
      const trimmed = statement.trim();
      if (trimmed) await database.prepare(trimmed).run();
    }
  }
}

function packageInput(seeded) {
  return {
    packageId: "handoff-package-root",
    prospectId: seeded.prospectId,
    contactId: seeded.contactId,
    profileId: seeded.profileId,
    version: 1,
    expectedVersion: 0,
    configurationId: seeded.configurationId,
    configurationDigest: seeded.configurationDigest,
    configurationRevision: seeded.configurationRevision,
    prospectRevision: seeded.prospectRevision,
    contactRevision: seeded.contactRevision,
    contactEligibilitySnapshotId: seeded.eligibilityId,
    snapshot: {
      evidenceDigests: [seeded.evidenceDigest],
      claimGuardrailDigests: [seeded.guardrailDigest],
      recommendedAngle: "Synthetic handoff angle",
      selectedRole: "champion",
      selectedContactPointDigests: [seeded.contactPointDigest],
      callScript: "Synthetic offline call script.",
      draftMessageIds: ["handoff-message-root"],
    },
    bindings: [
      { kind: "configuration", id: seeded.configurationId, digest: seeded.configurationDigest },
      { kind: "qualification", id: "outreach-assessment", digest: hex("2") },
      { kind: "review_decision", id: "outreach-review", digest: hex("5") },
      { kind: "source", id: "outreach-source", digest: seeded.sourceDigest },
      { kind: "evidence", id: "outreach-evidence", digest: seeded.evidenceDigest },
      { kind: "claim_guardrail", id: "outreach-guardrail", digest: seeded.guardrailDigest },
      { kind: "contact_observation", id: seeded.observationId, digest: seeded.observationDigest },
      { kind: "contact_eligibility", id: seeded.eligibilityId, digest: seeded.eligibilityDigest },
    ],
    idempotencyKey: "handoff-package-version",
  };
}

/**
 * Seeds one synthetic workspace with an activated Profile (and so an active
 * Phase 4 schedule), an approved Outreach Package for one Contact, then rolls
 * the remaining canonical migrations, including 0023, forward on top. The
 * legacy enrichment seed is only proven against 0000-0017, so it runs first.
 */
async function handoffFixture(name) {
  const fixture = await createD1Fixture(name);
  try {
    const seeded = await seedOutreachAuthority(fixture);
    await fixture.database.prepare("UPDATE prospecting_candidates SET status='observed' WHERE id='outreach-candidate'").run();
    const outreachModule = await load(fixture, "outreach-repository.ts");
    const outreach = outreachModule.createD1OutreachRepository(fixture.database, {
      workspaceId: seeded.workspaceId, ownerSubject: OUTREACH_OWNER.subject, now: () => OUTREACH_NOW,
    });
    const packageVersion = await outreach.createPackageVersion(packageInput(seeded));
    const packageApproval = await outreach.approvePackageVersion({
      packageVersionId: packageVersion.id, expectedVersion: 1, expiresAt: OUTREACH_NOW + 20_000, idempotencyKey: "handoff-package-approval",
    });
    const cutoff = CANONICAL_MIGRATION_FILENAMES.findIndex((filename) => filename.startsWith("0017_"));
    await applyFiles(fixture.database, CANONICAL_MIGRATION_FILENAMES.slice(cutoff + 1));
    const recoveryModule = await load(fixture, "handoff-recovery-repository.ts");
    const repository = (now = T0, scope = {}) => recoveryModule.createD1HandoffRecoveryRepository(fixture.database, {
      workspaceId: seeded.workspaceId, ownerSubject: OUTREACH_OWNER.subject, now: () => now, ...scope,
    });
    return { fixture, seeded, outreach, packageVersion, packageApproval, recoveryModule, repository };
  } catch (error) {
    await fixture.dispose();
    throw error;
  }
}

async function count(database, table, where = "1=1", bindings = []) {
  return Number((await database.prepare(`SELECT COUNT(*) count FROM ${table} WHERE ${where}`).bind(...bindings).first()).count);
}

async function tableCounts(database) {
  const tables = (await database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name").all()).results;
  const counts = {};
  for (const { name } of tables) counts[name] = await count(database, name);
  return counts;
}

function conflictWith(reason) {
  return (error) => error instanceof Error && error.name === "HandoffRecoveryConflictError" && error.message === `handoff_recovery_conflict:${reason}`;
}

async function recordHistory(context, steps) {
  const history = await load(context.fixture, "prospect-transition-history.ts");
  const ids = [];
  let prior = null;
  for (const [index, state] of steps.entries()) {
    const result = await history.recordProspectTransition(context.fixture.database, OUTREACH_OWNER.subject, {
      prospectId: context.seeded.prospectId,
      expectedProspectRevision: context.seeded.prospectRevision,
      eventKind: index === 0 ? "prospect_created" : "state_transition",
      priorState: prior,
      newState: state,
      actorKind: "application",
      actorReferenceDigest: hex("1"),
      sourceKind: index === 0 ? "qualification" : "export_readiness",
      reasonCode: `synthetic_${state.toLowerCase()}`,
      evidenceReferenceId: `handoff-evidence-${index}`,
      evidenceReferenceDigest: hex("2"),
      idempotencyKey: `handoff-transition-${index}`,
      occurredAt: T0 + index * HOUR,
    }, () => T0 + steps.length * HOUR);
    assert.equal(result.kind, "recorded", `transition ${index} to ${state} must record`);
    ids.push(result.record.id);
    prior = state;
  }
  return ids;
}

function weeklyInput(overrides = {}) {
  return {
    definitionVersion: "prospector/weekly-outcome/v1",
    timeZone: "America/Toronto",
    weekStartLocal: "2026-09-21",
    weekEndLocal: "2026-09-27",
    windowStartAt: T0 - 24 * HOUR,
    windowEndAt: T0 - 24 * HOUR + 168 * HOUR,
    asOf: T0 + 20 * HOUR,
    targetCount: 7,
    projectionDigest: hex("9"),
    idempotencyKey: "handoff-weekly-report",
    ...overrides,
  };
}

function snapshotInput(context, overrides = {}) {
  return {
    exportDefinitionDigest: hex("a"),
    policyDigest: hex("b"),
    configurationDigest: context.seeded.configurationDigest,
    packageSetDigest: hex("c"),
    suppressionFenceCount: 0,
    rows: [{
      prospectId: context.seeded.prospectId,
      contactId: context.seeded.contactId,
      contactPointDigest: context.seeded.contactPointDigest,
      packageVersionId: context.packageVersion.id,
      packageApprovalId: context.packageApproval.id,
    }],
    exclusions: [],
    idempotencyKey: "handoff-export-snapshot",
    ...overrides,
  };
}

function artifactInput(snapshotId, overrides = {}) {
  return {
    snapshotId,
    schemaVersion: "prospector/crm-handoff-csv/v1",
    mediaType: "text/csv",
    objectKey: `handoff/exports/${hex("d")}.csv`,
    contentSha256: hex("d"),
    byteLength: 512,
    manifest: { schemaVersion: "prospector/crm-handoff-csv/v1", rowCount: 1, prospectCount: 1, checksum: hex("d") },
    idempotencyKey: "handoff-export-artifact",
    ...overrides,
  };
}

function archiveInput(overrides = {}) {
  return {
    formatVersion: "prospector/portable-workspace-archive/v1",
    schemaVersion: "prospector/portable-workspace-schema/v1",
    compatibilityMin: "prospector/portable-workspace-schema/v1",
    compatibilityMax: "prospector/portable-workspace-schema/v1",
    manifest: { records: 3, objects: 1, tombstones: 1, recordDigest: hex("1") },
    ciphertextSha256: hex("e"),
    byteLength: 4096,
    objectKey: `recovery/archives/${hex("e")}.bin`,
    cipher: "aes-256-gcm",
    kdf: "scrypt",
    kdfParameters: { N: 131072, r: 8, p: 1, keyLength: 32, salt: "0".repeat(32) },
    recordCount: 3,
    objectCount: 1,
    tombstoneCount: 1,
    reauthReferenceDigest: hex("f"),
    idempotencyKey: "recovery-archive",
    ...overrides,
  };
}

function dryRunInput(overrides = {}) {
  return {
    sourceWorkspaceId: "source-workspace-synthetic",
    archiveManifestDigest: hex("1"),
    archiveCiphertextSha256: hex("e"),
    archiveSchemaVersion: "prospector/portable-workspace-schema/v1",
    outcome: "accepted",
    reasonCode: "verified",
    nonceDigest: hex("3"),
    expiresAt: T0 + 60_000,
    invariantDigest: hex("4"),
    idempotencyKey: "recovery-dry-run",
    ...overrides,
  };
}

async function insertRestoreTarget(database, id = "restore-target", owner = "restore-target-owner") {
  await database.prepare("INSERT INTO workspaces (id,company_name,owner_subject,created_at,updated_at,revision) VALUES (?,?,?,?,?,1)")
    .bind(id, "Synthetic restore target", owner, OUTREACH_NOW, OUTREACH_NOW).run();
}

test("0023 is additive and generic: earlier objects are unchanged and new objects carry no secret, effect, or Mining-only surface", async (t) => {
  const fixture = await createD1Fixture("handoff-recovery-additive");
  t.after(() => fixture.dispose());
  assert.equal(CANONICAL_MIGRATION_FILENAMES.includes(MIGRATION), true);
  const predecessor = CANONICAL_MIGRATION_FILENAMES[CANONICAL_MIGRATION_FILENAMES.indexOf(MIGRATION) - 1];
  assert.equal(predecessor, "0022_prospect-transition-history.sql");
  await applyMigrationsThrough(fixture.database, predecessor);
  const objects = async () => (await fixture.database.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY type,name").all()).results;
  const before = await objects();
  await applyFiles(fixture.database, [MIGRATION]);
  const after = await objects();
  for (const object of before) {
    assert.deepEqual(after.find((candidate) => candidate.type === object.type && candidate.name === object.name), object, `${object.type} ${object.name} must be unchanged by 0023`);
  }
  const added = after.filter((object) => !before.some((prior) => prior.type === object.type && prior.name === object.name));
  assert.deepEqual(added.filter((object) => object.type === "table").map((object) => object.name).sort(), [...NEW_TABLES]);
  for (const object of added) {
    assert.match(object.name, /^(?:handoff|recovery)_/u, `${object.name} must stay in the Phase 7 evidence namespace`);
    assert.ok(NEW_TABLES.includes(object.tbl_name), `${object.name} must attach only to a new evidence table`);
  }
  const sql = await readFile(new URL(`../drizzle/${MIGRATION}`, import.meta.url), "utf8");
  assert.doesNotMatch(sql, /\b(?:DROP|ALTER)\b/u, "0023 must not drop or alter an upstream object");
  const statements = sql.split("--> statement-breakpoint").map((statement) => statement.trim()).filter(Boolean);
  assert.ok(statements.every((statement) => /^CREATE (?:TABLE|UNIQUE INDEX|INDEX|TRIGGER) `(?:handoff|recovery)_/u.test(statement)), "0023 only creates Phase 7 evidence objects");
  const triggers = statements.filter((statement) => statement.startsWith("CREATE TRIGGER"));
  assert.ok(triggers.length >= NEW_TABLES.length * 2, "every evidence table has immutability triggers");
  for (const trigger of triggers) {
    assert.match(trigger, /\nBEGIN SELECT RAISE\(ABORT, '[^']+'\); END;?$/u, "0023 triggers may only refuse, never write");
  }
  assert.doesNotMatch(sql, /mining|digitalrain|engeb/iu, "0023 must not encode a Mining-only rule");
  for (const table of NEW_TABLES) {
    const columns = (await fixture.database.prepare(`PRAGMA table_info(${table})`).all()).results.map((column) => column.name);
    assert.ok(columns.includes("workspace_id"), `${table} must be workspace scoped`);
    for (const column of columns) {
      assert.doesNotMatch(column, /passphrase|password|secret|credential|oauth|bearer|refresh|access_token|api_key|raw_|plaintext|email_address|phone_number|^next_run|activate|scheduler/u, `${table}.${column}`);
    }
  }
  assert.deepEqual((await fixture.database.prepare("PRAGMA foreign_key_check").all()).results, []);
});

test("schedule observations mirror the exact upstream Phase 4 schedule and cannot be forged, rewritten, or reused for changed state", async (t) => {
  const context = await handoffFixture("handoff-schedule-observation");
  t.after(() => context.fixture.dispose());
  const { database } = context.fixture;
  const repository = context.repository();
  const upstream = await repository.readUpstreamScheduleState(context.seeded.profileId);
  const row = await database.prepare("SELECT * FROM prospecting_schedules WHERE workspace_id=? AND profile_id=? AND active=1").bind(context.seeded.workspaceId, context.seeded.profileId).first();
  assert.ok(row, "the seeded activation must leave an active upstream schedule");
  assert.deepEqual(
    { scheduleId: upstream.scheduleId, revision: upstream.revision, cadence: upstream.cadence, intendedLocalTime: upstream.intendedLocalTime, timezone: upstream.timezone, active: upstream.active, executionState: upstream.executionState, configurationId: upstream.configurationId },
    { scheduleId: row.id, revision: Number(row.revision), cadence: row.cadence, intendedLocalTime: row.intended_local_time, timezone: row.timezone, active: true, executionState: row.execution_state, configurationId: row.configuration_id },
  );
  assert.equal(await count(database, "handoff_schedule_observations"), 0, "a read must not write evidence");

  const first = await repository.recordScheduleObservation({ profileId: context.seeded.profileId, idempotencyKey: "schedule-observation-1" });
  assert.equal(first.replayed, false);
  const replay = await repository.recordScheduleObservation({ profileId: context.seeded.profileId, idempotencyKey: "schedule-observation-1" });
  assert.deepEqual(replay, { ...first, replayed: true });
  const stored = await database.prepare("SELECT * FROM handoff_schedule_observations WHERE id=?").bind(first.id).first();
  assert.equal(stored.schedule_id, row.id);
  assert.equal(Number(stored.schedule_active), 1);
  assert.equal(stored.timezone, row.timezone);
  assert.equal(stored.intended_local_time, row.intended_local_time);

  // Only Phase 4 changes schedule state; a later observation records it and the earlier one is untouched.
  await database.prepare("UPDATE prospecting_schedules SET active=0, revision=revision+1 WHERE id=?").bind(row.id).run();
  await assert.rejects(repository.recordScheduleObservation({ profileId: context.seeded.profileId, idempotencyKey: "schedule-observation-1" }), conflictWith("idempotency_conflict"));
  const second = await repository.recordScheduleObservation({ profileId: context.seeded.profileId, idempotencyKey: "schedule-observation-2" });
  assert.equal(Number((await database.prepare("SELECT schedule_active FROM handoff_schedule_observations WHERE id=?").bind(second.id).first()).schedule_active), 0);
  assert.equal(Number((await database.prepare("SELECT schedule_active FROM handoff_schedule_observations WHERE id=?").bind(first.id).first()).schedule_active), 1);

  const forged = database.prepare(
    `INSERT INTO handoff_schedule_observations (id,workspace_id,profile_id,schedule_id,schedule_revision,configuration_id,configuration_digest,cadence,intended_local_time,timezone,utc_offset_minutes,schedule_active,execution_state,activation_id,activation_audit_event_id,source_digest,observation_digest,command_id,observed_at,created_at)
     SELECT 'forged-observation',workspace_id,profile_id,schedule_id,schedule_revision,configuration_id,configuration_digest,cadence,intended_local_time,timezone,utc_offset_minutes,1,execution_state,activation_id,activation_audit_event_id,source_digest,?,command_id,observed_at,created_at FROM handoff_schedule_observations WHERE id=?`,
  ).bind(hex("7"), second.id);
  await assert.rejects(forged.run(), /exact upstream schedule state/u);
  await assert.rejects(database.prepare("UPDATE handoff_schedule_observations SET schedule_active=1 WHERE id=?").bind(first.id).run(), /immutable/u);
  await assert.rejects(database.prepare("DELETE FROM handoff_schedule_observations WHERE id=?").bind(first.id).run(), /immutable/u);

  await insertRestoreTarget(database, "other-workspace", "other-owner");
  const intruder = context.recoveryModule.createD1HandoffRecoveryRepository(database, { workspaceId: context.seeded.workspaceId, ownerSubject: "other-owner", now: () => T0 });
  await assert.rejects(intruder.recordScheduleObservation({ profileId: context.seeded.profileId, idempotencyKey: "intruder" }), conflictWith("not_admitted"));
  const crossTenant = context.recoveryModule.createD1HandoffRecoveryRepository(database, { workspaceId: "other-workspace", ownerSubject: "other-owner", now: () => T0 });
  assert.equal(await crossTenant.readUpstreamScheduleState(context.seeded.profileId), null);
  await assert.rejects(crossTenant.recordScheduleObservation({ profileId: context.seeded.profileId, idempotencyKey: "cross" }), conflictWith("schedule_unavailable"));
  assert.throws(() => context.recoveryModule.createD1HandoffRecoveryRepository(database, { workspaceId: context.seeded.workspaceId, ownerSubject: OUTREACH_OWNER.subject, targetWorkspaceId: "x" }), /invalid_handoff_recovery_scope/u);
  await assert.rejects(repository.recordScheduleObservation({ profileId: context.seeded.profileId, idempotencyKey: "k", active: true }), conflictWith("invalid_command_shape"));
});

test("weekly reports count each Prospect's first Export-ready transition once and refuse forged cohort entries", async (t) => {
  const context = await handoffFixture("handoff-weekly-report");
  t.after(() => context.fixture.dispose());
  const { database } = context.fixture;
  const ids = await recordHistory(context, ["Candidate", "Qualified", "Approved", "ContactReady", "PackageReady", "ExportReady", "NeedsReview", "ExportReady"]);
  const repository = context.repository(T0 + 30 * HOUR);
  const firsts = await repository.readFirstExportReadyTransitions({ windowStartAt: T0 - HOUR, windowEndAt: T0 + 24 * HOUR });
  assert.deepEqual(firsts.map((entry) => entry.transitionEventId), [ids[5]], "only the first Export-ready transition is a cohort entry");

  const report = await repository.recordWeeklyReport(weeklyInput());
  const stored = await database.prepare("SELECT * FROM handoff_weekly_reports WHERE id=?").bind(report.id).first();
  assert.equal(Number(stored.cohort_count), 1);
  assert.equal(Number(stored.target_count), 7);
  const entries = (await database.prepare("SELECT prospect_id,transition_event_id,ordinal FROM handoff_weekly_report_entries WHERE report_id=?").bind(report.id).all()).results;
  assert.deepEqual(entries, [{ prospect_id: context.seeded.prospectId, transition_event_id: ids[5], ordinal: 0 }]);
  assert.deepEqual(await repository.recordWeeklyReport(weeklyInput()), { ...report, replayed: true });

  // A later window that holds only the re-transition to Export-ready counts nothing.
  const later = await repository.recordWeeklyReport(weeklyInput({ windowStartAt: T0 + 6 * HOUR, windowEndAt: T0 + 6 * HOUR + 168 * HOUR, asOf: T0 + 30 * HOUR, idempotencyKey: "handoff-weekly-later" }));
  assert.equal(Number((await database.prepare("SELECT cohort_count FROM handoff_weekly_reports WHERE id=?").bind(later.id).first()).cohort_count), 0);

  await assert.rejects(database.prepare("INSERT INTO handoff_weekly_report_entries (id,workspace_id,report_id,prospect_id,transition_event_id,ordinal,occurred_at,created_at) VALUES ('forged-entry',?,?,?,?,0,?,?)")
    .bind(context.seeded.workspaceId, later.id, context.seeded.prospectId, ids[7], T0 + 7 * HOUR, T0).run(), /first Export-ready transition/u);
  // A forged report that claims room for one entry still cannot count a re-transition.
  await database.batch([
    database.prepare("INSERT INTO handoff_recovery_commands (id,workspace_id,owner_subject,command_kind,idempotency_key,operation_digest,expected_revision,result_kind,result_id,created_at) VALUES ('forged-report-command',?,?,'weekly_report.record','forged-report',?,0,'weekly_report','forged-report',?)")
      .bind(context.seeded.workspaceId, OUTREACH_OWNER.subject, hex("6"), T0),
    database.prepare("INSERT INTO handoff_weekly_reports (id,workspace_id,command_id,definition_version,time_zone,week_start_local,week_end_local,window_start_at,window_end_at,as_of,target_count,cohort_count,history_digest,projection_digest,report_digest,created_at) VALUES ('forged-report',?,'forged-report-command','prospector/weekly-outcome/v1','America/Toronto','2026-09-28','2026-10-04',?,?,?,7,1,?,?,?,?)")
      .bind(context.seeded.workspaceId, T0 + 6 * HOUR, T0 + 6 * HOUR + 168 * HOUR, T0 + 30 * HOUR, hex("7"), hex("8"), hex("9"), T0),
  ]);
  await assert.rejects(database.prepare("INSERT INTO handoff_weekly_report_entries (id,workspace_id,report_id,prospect_id,transition_event_id,ordinal,occurred_at,created_at) VALUES ('forged-entry-3',?,'forged-report',?,?,0,?,?)")
    .bind(context.seeded.workspaceId, context.seeded.prospectId, ids[7], T0 + 7 * HOUR, T0).run(), /first Export-ready transition/u);
  await assert.rejects(database.prepare("INSERT INTO handoff_weekly_report_entries (id,workspace_id,report_id,prospect_id,transition_event_id,ordinal,occurred_at,created_at) VALUES ('forged-entry-4',?,'forged-report',?,?,0,?,?)")
    .bind(context.seeded.workspaceId, context.seeded.prospectId, ids[6], T0 + 6 * HOUR, T0).run(), /first Export-ready transition/u, "a non-Export-ready transition is never a cohort entry");
  await assert.rejects(database.prepare("INSERT INTO handoff_weekly_report_entries (id,workspace_id,report_id,prospect_id,transition_event_id,ordinal,occurred_at,created_at) VALUES ('forged-entry-2',?,?,?,?,1,?,?)")
    .bind(context.seeded.workspaceId, report.id, context.seeded.prospectId, ids[5], T0 + 5 * HOUR, T0).run());
  await assert.rejects(database.prepare("UPDATE handoff_weekly_reports SET cohort_count=7 WHERE id=?").bind(report.id).run(), /immutable/u);
  await assert.rejects(database.prepare("DELETE FROM handoff_weekly_report_entries WHERE report_id=?").bind(report.id).run(), /immutable/u);
  await assert.rejects(repository.recordWeeklyReport(weeklyInput({ windowEndAt: T0 + 3 * HOUR, idempotencyKey: "short-window" })), conflictWith("invalid_weekly_report"));
  await assert.rejects(repository.recordWeeklyReport(weeklyInput({ targetCount: 8 })), conflictWith("idempotency_conflict"));
});

test("export snapshots persist frozen rows behind a transactional suppression fence and keep tombstone lineage", async (t) => {
  const context = await handoffFixture("handoff-export-snapshot");
  t.after(() => context.fixture.dispose());
  const { database } = context.fixture;
  const repository = context.repository();
  const fence = await repository.readSuppressionFence();
  assert.deepEqual(fence, { tombstoneCount: 0, tombstones: [] });
  const lineage = await repository.readPackageApprovalLineage([context.seeded.prospectId]);
  assert.deepEqual(lineage.map((entry) => [entry.packageApprovalId, entry.packageVersionId, entry.contactId, entry.revoked]), [[context.packageApproval.id, context.packageVersion.id, context.seeded.contactId, false]]);

  const snapshot = await repository.recordExportSnapshot(snapshotInput(context));
  const stored = await database.prepare("SELECT * FROM handoff_export_snapshots WHERE id=?").bind(snapshot.id).first();
  assert.deepEqual([Number(stored.prospect_count), Number(stored.contact_row_count), Number(stored.exclusion_count), Number(stored.suppression_fence_count)], [1, 1, 0, 0]);
  assert.deepEqual(await repository.recordExportSnapshot(snapshotInput(context)), { ...snapshot, replayed: true });
  await assert.rejects(repository.recordExportSnapshot(snapshotInput(context, { policyDigest: hex("0") })), conflictWith("idempotency_conflict"));
  const duplicateRow = snapshotInput(context).rows[0];
  await assert.rejects(repository.recordExportSnapshot(snapshotInput(context, { rows: [duplicateRow, { ...duplicateRow }], idempotencyKey: "duplicate-rows" })), conflictWith("duplicate_export_row"));

  const tombstone = await context.outreach.recordSuppression({
    subjectKind: "exact_email", subjectDigest: context.seeded.contactPointDigest, channel: "email", reason: "unsubscribe",
    sourceEventDigest: hex("c"), aliasDigests: [], effectiveAt: OUTREACH_NOW - 1, idempotencyKey: "handoff-suppression",
  });
  const before = await count(database, "handoff_export_snapshots");
  await assert.rejects(repository.recordExportSnapshot(snapshotInput(context, { idempotencyKey: "stale-fence" })), conflictWith("suppression_fence_stale"));
  assert.equal(await count(database, "handoff_export_snapshots"), before, "a stale fence writes nothing");

  const current = await repository.readSuppressionFence();
  assert.equal(current.tombstoneCount, 1);
  assert.equal(current.tombstones[0].id, tombstone.id);
  const suppressed = await repository.recordExportSnapshot(snapshotInput(context, {
    suppressionFenceCount: current.tombstoneCount,
    rows: [],
    exclusions: [{ prospectId: context.seeded.prospectId, contactId: context.seeded.contactId, tombstoneId: tombstone.id }],
    idempotencyKey: "suppressed-snapshot",
  }));
  const exclusion = await database.prepare("SELECT * FROM handoff_suppression_exclusions WHERE snapshot_id=?").bind(suppressed.id).first();
  assert.equal(exclusion.tombstone_id, tombstone.id);
  assert.equal(exclusion.scope_kind, "exact_email");
  assert.equal(await count(database, "handoff_export_snapshot_rows", "snapshot_id=?", [suppressed.id]), 0, "an exclusion-only snapshot freezes no contactable row; the contradiction case is covered below");

  await insertRestoreTarget(database, "other-workspace", "other-owner");
  await assert.rejects(database.prepare("INSERT INTO handoff_export_snapshot_rows (id,workspace_id,snapshot_id,ordinal,prospect_id,contact_id,contact_point_digest,package_version_id,package_approval_id,row_identity_digest,created_at) VALUES ('cross-row','other-workspace',?,0,?,?,?,?,?,?,?)")
    .bind(snapshot.id, context.seeded.prospectId, context.seeded.contactId, context.seeded.contactPointDigest, context.packageVersion.id, context.packageApproval.id, hex("5"), T0).run(), /scope/u);
  await assert.rejects(database.prepare("INSERT INTO handoff_suppression_exclusions (id,workspace_id,snapshot_id,ordinal,prospect_id,contact_id,tombstone_id,scope_kind,exclusion_digest,created_at) VALUES ('wrong-scope',?,?,1,?,?,?,'company',?,?)")
    .bind(context.seeded.workspaceId, suppressed.id, context.seeded.prospectId, context.seeded.contactId, tombstone.id, hex("6"), T0).run(), /scope/u);
  await assert.rejects(database.prepare("UPDATE handoff_export_snapshot_rows SET contact_point_digest=? WHERE snapshot_id=?").bind(hex("0"), snapshot.id).run(), /immutable/u);
  await assert.rejects(database.prepare("DELETE FROM handoff_suppression_exclusions").run(), /immutable/u);
  assert.equal(await count(database, "outreach_suppression_tombstones"), 1, "Phase 6 tombstones stay append-only and untouched");
});

/**
 * Builds one raw snapshot batch (command, snapshot, then rows and exclusions
 * in the given order) so the 0023 triggers are exercised without the
 * repository's own prechecks. Each batch is atomic, so a refused batch leaves
 * nothing behind and the same ids can be reused.
 */
function rawSnapshotBatch(context, { fence, items, tag = "7" }) {
  const { database } = context.fixture;
  const workspaceId = context.seeded.workspaceId;
  const rows = items.filter((item) => item.kind === "row");
  const exclusions = items.filter((item) => item.kind === "exclusion");
  let rowOrdinal = 0;
  let exclusionOrdinal = 0;
  return database.batch([
    database.prepare("INSERT INTO handoff_recovery_commands (id,workspace_id,owner_subject,command_kind,idempotency_key,operation_digest,expected_revision,result_kind,result_id,created_at) VALUES (?,?,?,'export_snapshot.record',?,?,?,'export_snapshot',?,?)")
      .bind(`raw-${tag}-command`, workspaceId, OUTREACH_OWNER.subject, `raw-${tag}-key`, hex(tag), fence, `raw-${tag}-snapshot`, T0),
    database.prepare("INSERT INTO handoff_export_snapshots (id,workspace_id,command_id,export_definition_digest,policy_digest,configuration_digest,package_set_digest,suppression_fence_count,snapshot_digest,selected_at,prospect_count,contact_row_count,exclusion_count,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .bind(`raw-${tag}-snapshot`, workspaceId, `raw-${tag}-command`, hex("a"), hex("b"), context.seeded.configurationDigest, hex("c"), fence, hex(tag), T0, rows.length > 0 ? 1 : 0, rows.length, exclusions.length, T0),
    ...items.map((item) => item.kind === "row"
      ? database.prepare("INSERT INTO handoff_export_snapshot_rows (id,workspace_id,snapshot_id,ordinal,prospect_id,contact_id,contact_point_digest,package_version_id,package_approval_id,row_identity_digest,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
        .bind(`raw-${tag}-row-${rowOrdinal}`, workspaceId, `raw-${tag}-snapshot`, rowOrdinal++, context.seeded.prospectId, context.seeded.contactId, item.contactPointDigest ?? context.seeded.contactPointDigest, context.packageVersion.id, context.packageApproval.id, hex(String(rowOrdinal)), item.createdAt ?? T0)
      : database.prepare("INSERT INTO handoff_suppression_exclusions (id,workspace_id,snapshot_id,ordinal,prospect_id,contact_id,tombstone_id,scope_kind,exclusion_digest,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
        .bind(`raw-${tag}-exclusion-${exclusionOrdinal}`, workspaceId, `raw-${tag}-snapshot`, exclusionOrdinal++, context.seeded.prospectId, item.contactId, item.tombstoneId, item.scopeKind, hex("e"), T0)),
  ]);
}

test("a frozen snapshot never holds the same Prospect and Contact as both a contactable row and a suppression exclusion", async (t) => {
  const context = await handoffFixture("handoff-export-suppression-contradiction");
  t.after(() => context.fixture.dispose());
  const { database } = context.fixture;
  const repository = context.repository();
  const tombstone = await context.outreach.recordSuppression({
    subjectKind: "exact_email", subjectDigest: context.seeded.contactPointDigest, channel: "email", reason: "unsubscribe",
    sourceEventDigest: hex("c"), aliasDigests: [], effectiveAt: OUTREACH_NOW - 1, idempotencyKey: "contradiction-suppression",
  });
  const before = await tableCounts(database);
  const contactExclusion = { prospectId: context.seeded.prospectId, contactId: context.seeded.contactId, tombstoneId: tombstone.id };
  await assert.rejects(repository.recordExportSnapshot(snapshotInput(context, {
    suppressionFenceCount: 1, exclusions: [contactExclusion], idempotencyKey: "contradiction-contact",
  })), conflictWith("suppressed_export_row"), "a Contact excluded by a tombstone is never also a contactable row");
  await assert.rejects(repository.recordExportSnapshot(snapshotInput(context, {
    suppressionFenceCount: 1, exclusions: [{ ...contactExclusion, contactId: null }], idempotencyKey: "contradiction-prospect",
  })), conflictWith("suppressed_export_row"), "a Prospect-wide exclusion refuses every row for that Prospect");
  assert.deepEqual(await tableCounts(database), before, "a contradictory snapshot writes nothing");

  const exclusionItem = { kind: "exclusion", contactId: context.seeded.contactId, tombstoneId: tombstone.id, scopeKind: "exact_email" };
  await assert.rejects(rawSnapshotBatch(context, { fence: 1, items: [exclusionItem, { kind: "row" }] }), /contradicts a (?:suppression exclusion|contactable row)/u, "a row after its exclusion is refused below the repository");
  await assert.rejects(rawSnapshotBatch(context, { fence: 1, items: [{ kind: "row" }, exclusionItem] }), /contradicts a (?:suppression exclusion|contactable row)/u, "an exclusion after its row is refused below the repository");
  await assert.rejects(rawSnapshotBatch(context, { fence: 1, items: [{ ...exclusionItem, contactId: null }, { kind: "row" }] }), /contradicts a (?:suppression exclusion|contactable row)/u, "a Prospect-wide exclusion refuses the row below the repository");
  assert.deepEqual(await tableCounts(database), before, "refused raw batches write nothing");
  await rawSnapshotBatch(context, { fence: 1, items: [exclusionItem], tag: "1" });
  await rawSnapshotBatch(context, { fence: 1, items: [{ kind: "row" }], tag: "2" });
  assert.equal(await count(database, "handoff_export_snapshot_rows", "snapshot_id='raw-2-snapshot'"), 1, "the same raw row records when no exclusion covers it (positive control)");

  const recorded = await repository.recordExportSnapshot(snapshotInput(context, { suppressionFenceCount: 1, rows: [], exclusions: [contactExclusion], idempotencyKey: "exclusion-only" }));
  assert.equal(await count(database, "handoff_suppression_exclusions", "snapshot_id=?", [recorded.id]), 1, "an exclusion-only snapshot still records");
});

test("export snapshot rows require an unrevoked, unexpired package approval and one of its selected contact points", async (t) => {
  const context = await handoffFixture("handoff-export-package-lineage");
  t.after(() => context.fixture.dispose());
  const { database } = context.fixture;
  await rawSnapshotBatch(context, { fence: 0, items: [{ kind: "row" }], tag: "1" });
  assert.equal(await count(database, "handoff_export_snapshot_rows", "snapshot_id='raw-1-snapshot'"), 1, "a raw row with full lineage records (positive control)");
  const before = await tableCounts(database);
  await assert.rejects(context.repository().recordExportSnapshot(snapshotInput(context, {
    rows: [{ ...snapshotInput(context).rows[0], contactPointDigest: hex("0") }], idempotencyKey: "unselected-contact-point",
  })), conflictWith("contact_point_not_selected"));
  await assert.rejects(rawSnapshotBatch(context, { fence: 0, items: [{ kind: "row", contactPointDigest: hex("0") }] }), /package lineage/u, "an unselected contact point is refused below the repository");

  const expiresAt = OUTREACH_NOW + 20_000;
  await assert.rejects(context.repository(expiresAt).recordExportSnapshot(snapshotInput(context, { idempotencyKey: "expired-approval" })), conflictWith("package_approval_unavailable"));
  await assert.rejects(rawSnapshotBatch(context, { fence: 0, items: [{ kind: "row", createdAt: expiresAt }] }), /package lineage/u, "an expired approval is refused below the repository");
  assert.deepEqual(await tableCounts(database), before, "refused lineage writes nothing");

  await context.outreach.revokeApproval({
    targetKind: "package_approval", targetApprovalId: context.packageApproval.id, reasonCode: "owner_revoked",
    sourceEventDigest: hex("4"), idempotencyKey: "handoff-revoke-package",
  });
  const lineage = await context.repository().readPackageApprovalLineage([context.seeded.prospectId]);
  assert.deepEqual(lineage.map((entry) => entry.revoked), [true]);
  const afterRevocation = await tableCounts(database);
  await assert.rejects(context.repository().recordExportSnapshot(snapshotInput(context, { idempotencyKey: "revoked-approval" })), conflictWith("package_approval_unavailable"));
  await assert.rejects(rawSnapshotBatch(context, { fence: 0, items: [{ kind: "row" }] }), /package lineage/u, "a revoked approval is refused below the repository");
  assert.deepEqual(await tableCounts(database), afterRevocation, "a revoked approval writes nothing");
});

test("export artifacts are immutable, one per frozen snapshot, and delivery expiry never changes their bytes", async (t) => {
  const context = await handoffFixture("handoff-export-artifact");
  t.after(() => context.fixture.dispose());
  const { database } = context.fixture;
  const repository = context.repository();
  const snapshot = await repository.recordExportSnapshot(snapshotInput(context));
  const artifact = await repository.recordExportArtifact(artifactInput(snapshot.id));
  assert.deepEqual(await repository.recordExportArtifact(artifactInput(snapshot.id)), { ...artifact, replayed: true });
  await assert.rejects(repository.recordExportArtifact(artifactInput(snapshot.id, { contentSha256: hex("8"), objectKey: `handoff/exports/${hex("8")}.csv`, idempotencyKey: "regenerated" })), conflictWith("artifact_conflict"));
  await assert.rejects(repository.recordExportArtifact(artifactInput(snapshot.id, { manifest: { checksum: hex("d"), nested: [{ token: "x" }] }, idempotencyKey: "secret-manifest" })), conflictWith("secret_bearing_metadata"));
  await assert.rejects(repository.recordExportArtifact(artifactInput(snapshot.id, { objectKey: "../escape.csv", idempotencyKey: "escape" })), conflictWith("invalid_export_artifact"));
  const stored = await database.prepare("SELECT * FROM handoff_export_artifacts WHERE id=?").bind(artifact.id).first();
  assert.deepEqual([Number(stored.row_count), Number(stored.prospect_count), stored.content_sha256], [1, 1, hex("d")]);
  await assert.rejects(database.prepare("UPDATE handoff_export_artifacts SET content_sha256=? WHERE id=?").bind(hex("8"), artifact.id).run(), /immutable/u);

  const delivery = (eventKind, overrides = {}) => ({ subjectKind: "export_artifact", subjectId: artifact.id, eventKind, expiresAt: null, reasonCode: `delivery_${eventKind}`, occurredAt: T0, idempotencyKey: `delivery-${eventKind}`, ...overrides });
  await assert.rejects(repository.recordDeliveryEvent(delivery("expired")), conflictWith("delivery_unavailable"));
  await repository.recordDeliveryEvent(delivery("issued", { expiresAt: T0 + 7 * 24 * HOUR }));
  await assert.rejects(repository.recordDeliveryEvent(delivery("issued", { expiresAt: T0 + 8 * 24 * HOUR, idempotencyKey: "reissue" })), conflictWith("delivery_unavailable"));
  await repository.recordDeliveryEvent(delivery("expired"));
  assert.deepEqual(await database.prepare("SELECT * FROM handoff_export_artifacts WHERE id=?").bind(artifact.id).first(), stored, "expiry never rewrites the artifact");
  await assert.rejects(repository.recordDeliveryEvent(delivery("issued", { subjectId: "missing-artifact", expiresAt: T0 + HOUR, idempotencyKey: "missing" })), conflictWith("delivery_unavailable"));
});

test("archive metadata keeps only public envelope parameters and refuses any secret-bearing field", async (t) => {
  const context = await handoffFixture("handoff-archive-metadata");
  t.after(() => context.fixture.dispose());
  const { database } = context.fixture;
  const repository = context.repository();
  const archive = await repository.recordArchive(archiveInput());
  const stored = await database.prepare("SELECT * FROM recovery_archives WHERE id=?").bind(archive.id).first();
  assert.equal(stored.kdf, "scrypt");
  assert.deepEqual(JSON.parse(stored.kdf_parameters_json), { N: 131072, keyLength: 32, p: 1, r: 8, salt: "0".repeat(32) });
  for (const [label, patch] of [
    ["kdf passphrase", { kdfParameters: { ...archiveInput().kdfParameters, passphrase: "x" } }],
    ["nested password", { manifest: { records: 1, nested: { password: "x" } } }],
    ["credential", { manifest: { records: 1, credential: "x" } }],
    ["bearer", { manifest: { records: 1, bearerToken: "x" } }],
    ["refresh token", { kdfParameters: { ...archiveInput().kdfParameters, refresh_token: "x" } }],
    ["api key", { manifest: { records: 1, apiKey: "x" } }],
    ["private key", { manifest: { records: 1, private_key: "x" } }],
    ["authorization", { manifest: { records: 1, Authorization: "x" } }],
    ["cookie", { manifest: { records: 1, cookie: "x" } }],
  ]) {
    await assert.rejects(repository.recordArchive(archiveInput({ ...patch, idempotencyKey: `secret-${label.replaceAll(" ", "-")}` })), conflictWith("secret_bearing_metadata"), label);
  }
  // The database CHECK refuses every key family the repository refuses, so a
  // raw or future non-repository insert cannot store one either.
  const forgedArchive = (manifestJson, kdfParametersJson) => database.prepare("INSERT INTO recovery_archives SELECT 'forged-archive',workspace_id,command_id,format_version,schema_version,compatibility_min,compatibility_max,?,?,?,byte_length,?,cipher,kdf,?,record_count,object_count,tombstone_count,reauth_reference_digest,created_at FROM recovery_archives WHERE id=?")
    .bind(manifestJson, hex("0"), hex("0"), "recovery/archives/forged.bin", kdfParametersJson, archive.id).run();
  const SECRET_KEYS = ["passphrase", "password", "secret", "credential", "bearer", "oauth", "refresh_token", "accessToken", "token", "cookie", "Authorization", "private_key", "privateKey", "private-key", "api_key", "apiKey", "API-KEY"];
  for (const key of SECRET_KEYS) {
    await assert.rejects(forgedArchive(stored.manifest_json, JSON.stringify({ [key]: "x" })), /CHECK constraint failed/u, `kdf_parameters_json ${key}`);
    await assert.rejects(forgedArchive(JSON.stringify({ [key]: "x" }), stored.kdf_parameters_json), /CHECK constraint failed/u, `manifest_json ${key}`);
  }
  const snapshot = await repository.recordExportSnapshot(snapshotInput(context));
  const artifact = await repository.recordExportArtifact(artifactInput(snapshot.id));
  const forgedManifest = (manifestJson) => database.prepare("INSERT INTO handoff_export_artifacts SELECT 'forged-artifact',workspace_id,snapshot_id,command_id,schema_version,media_type,?,?,byte_length,?,?,row_count,prospect_count,created_at FROM handoff_export_artifacts WHERE id=?")
    .bind("handoff/exports/forged.csv", hex("0"), manifestJson, hex("0"), artifact.id).run();
  for (const key of SECRET_KEYS) {
    await assert.rejects(forgedManifest(JSON.stringify({ [key]: "x" })), /CHECK constraint failed/u, `artifact manifest_json ${key}`);
  }
  await assert.rejects(database.prepare("UPDATE recovery_archives SET kdf='none' WHERE id=?").bind(archive.id).run(), /immutable/u);
  assert.equal(await count(database, "recovery_archives"), 1);
});

test("a dry run never writes the target, and a restore lock needs a current accepted dry run with its nonce, once", async (t) => {
  const context = await handoffFixture("handoff-restore-lock");
  t.after(() => context.fixture.dispose());
  const { database } = context.fixture;
  await insertRestoreTarget(database);
  const target = (now = T0) => context.recoveryModule.createD1HandoffRecoveryRepository(database, { workspaceId: "restore-target", ownerSubject: "restore-target-owner", now: () => now });

  const before = await tableCounts(database);
  const state = await target().readRestoreTargetState();
  assert.equal(state.clean, true);
  assert.deepEqual(state.nonEmptyTables, []);
  assert.deepEqual(await tableCounts(database), before, "reading target state is zero-write");

  const refused = await target().recordDryRun(dryRunInput({ outcome: "refused", reasonCode: "archive_tampered", nonceDigest: null, expiresAt: null, invariantDigest: null, idempotencyKey: "dry-run-refused" }));
  const afterRefusal = await tableCounts(database);
  for (const [table, value] of Object.entries(afterRefusal)) {
    if (!RECOVERY_EVIDENCE_TABLES.has(table)) assert.equal(value, before[table], `${table} must be untouched by a dry run`);
  }
  assert.equal((await target().readRestoreTargetState()).clean, true, "recovery evidence never makes a target dirty");
  await assert.rejects(target().acquireRestoreLock({ dryRunId: refused.id, nonceDigest: hex("3"), idempotencyKey: "lock-refused" }), conflictWith("dry_run_not_accepted"));

  const accepted = await target().recordDryRun(dryRunInput());
  await assert.rejects(target().acquireRestoreLock({ dryRunId: accepted.id, nonceDigest: hex("9"), idempotencyKey: "lock-wrong-nonce" }), conflictWith("dry_run_not_accepted"));
  await assert.rejects(target(T0 + 120_000).acquireRestoreLock({ dryRunId: accepted.id, nonceDigest: hex("3"), idempotencyKey: "lock-expired" }), conflictWith("dry_run_not_accepted"));
  const lock = await target().acquireRestoreLock({ dryRunId: accepted.id, nonceDigest: hex("3"), idempotencyKey: "lock-1" });
  assert.deepEqual(await target().acquireRestoreLock({ dryRunId: accepted.id, nonceDigest: hex("3"), idempotencyKey: "lock-1" }), { ...lock, replayed: true });
  await assert.rejects(target().acquireRestoreLock({ dryRunId: accepted.id, nonceDigest: hex("3"), idempotencyKey: "lock-again" }), conflictWith("restore_lock_unavailable"));
  const second = await target().recordDryRun(dryRunInput({ nonceDigest: hex("5"), idempotencyKey: "dry-run-second" }));
  await assert.rejects(target().acquireRestoreLock({ dryRunId: second.id, nonceDigest: hex("5"), idempotencyKey: "lock-concurrent" }), conflictWith("restore_lock_unavailable"));

  const result = await target().recordRestoreResult({ lockId: lock.id, outcome: "applied", reasonCode: "restored", restoredRecordCount: 3, restoredObjectCount: 1, idempotencyKey: "restore-result" });
  const stored = await database.prepare("SELECT * FROM recovery_restore_results WHERE id=?").bind(result.id).first();
  assert.deepEqual([Number(stored.schedules_enabled), Number(stored.effects_enabled)], [0, 0], "a restored target starts with schedules and effects disabled");
  await assert.rejects(target().acquireRestoreLock({ dryRunId: second.id, nonceDigest: hex("5"), idempotencyKey: "lock-after-apply" }), conflictWith("restore_lock_unavailable"));
  await assert.rejects(target().recordDryRun(dryRunInput({ nonceDigest: hex("6"), idempotencyKey: "dry-run-after-apply" })), conflictWith("restore_target_not_clean"));
  await assert.rejects(database.prepare("UPDATE recovery_restore_results SET schedules_enabled=1 WHERE id=?").bind(result.id).run(), /immutable/u);
  await assert.rejects(target().recordRestoreResult({ lockId: lock.id, outcome: "applied", reasonCode: "restored", restoredRecordCount: 3, restoredObjectCount: 1, enableSchedules: true, idempotencyKey: "restore-enable" }), conflictWith("invalid_command_shape"));

  const source = context.repository();
  assert.equal((await source.readRestoreTargetState()).clean, false, "a populated workspace is never a clean target");
  await assert.rejects(source.recordDryRun(dryRunInput({ idempotencyKey: "dry-run-dirty" })), conflictWith("restore_target_not_clean"));
});

test("a restored target cannot be released while any upstream schedule is active, even with a prior source activation", async (t) => {
  const context = await handoffFixture("handoff-restore-schedule-fence");
  t.after(() => context.fixture.dispose());
  const { database } = context.fixture;
  const workspaceId = context.seeded.workspaceId;
  const command = (id, kind) => database.prepare("INSERT INTO handoff_recovery_commands (id,workspace_id,owner_subject,command_kind,idempotency_key,operation_digest,expected_revision,result_kind,result_id,created_at) VALUES (?,?,?,?,?,?,0,'synthetic',?,?)")
    .bind(id, workspaceId, OUTREACH_OWNER.subject, kind, `${id}-key`, id === "c-dry" ? hex("1") : id === "c-lock" ? hex("2") : id === "c-result" ? hex("3") : hex("4"), id, T0);
  await database.batch([
    command("c-dry", "dry_run.record"),
    command("c-lock", "restore_lock.acquire"),
    database.prepare("INSERT INTO recovery_dry_runs (id,workspace_id,command_id,source_workspace_id,archive_manifest_digest,archive_ciphertext_sha256,archive_schema_version,outcome,reason_code,nonce_digest,expires_at,target_state_digest,invariant_digest,dry_run_digest,created_at) VALUES ('raw-dry',?,'c-dry','source-ws',?,?,'prospector/portable-workspace-schema/v1','accepted','verified',?,?,?,?,?,?)")
      .bind(workspaceId, hex("1"), hex("2"), hex("3"), T0 + 60_000, hex("4"), hex("5"), hex("6"), T0),
    database.prepare("INSERT INTO recovery_restore_locks (id,workspace_id,dry_run_id,command_id,nonce_digest,acquired_at,created_at) VALUES ('raw-lock',?,'raw-dry','c-lock',?,?,?)").bind(workspaceId, hex("3"), T0, T0),
  ]);
  const result = (outcome, schedules = 0) => database.batch([
    command("c-result", "restore_result.record"),
    database.prepare("INSERT INTO recovery_restore_results (id,workspace_id,lock_id,command_id,outcome,reason_code,restored_record_count,restored_object_count,result_digest,schedules_enabled,effects_enabled,completed_at,created_at) VALUES ('raw-result',?,'raw-lock','c-result',?,'restored',1,1,?,?,0,?,?)")
      .bind(workspaceId, outcome, hex("7"), schedules, T0, T0),
  ]);
  assert.ok(await count(database, "profile_configuration_activations", "workspace_id=?", [workspaceId]) > 0, "the source history records a prior Phase 4 activation");
  await assert.rejects(result("applied"), /schedules disabled/u);
  await database.prepare("UPDATE prospecting_schedules SET active=0, revision=revision+1 WHERE workspace_id=?").bind(workspaceId).run();
  await assert.rejects(result("applied", 1), /CHECK constraint failed/u);
  await result("applied");
  assert.equal(await count(database, "recovery_restore_results", "outcome='applied'"), 1);
});

test("audit evidence is bounded, minimized, and append-only, with one recorded event per admitted command", async (t) => {
  const context = await handoffFixture("handoff-recovery-audit");
  t.after(() => context.fixture.dispose());
  const { database } = context.fixture;
  const repository = context.repository();
  await repository.recordScheduleObservation({ profileId: context.seeded.profileId, idempotencyKey: "audit-observation" });
  await repository.recordArchive(archiveInput());
  const refusal = await repository.recordRefusal({ action: "restore.lock_acquire", subjectKind: "recovery_dry_run", subjectId: null, reasonCode: "nonce_mismatch" });
  const refused = await database.prepare("SELECT * FROM handoff_recovery_audit_events WHERE id=?").bind(refusal.id).first();
  assert.deepEqual([refused.outcome, refused.command_id, refused.subject_id, refused.reason_code], ["refused", null, null, "nonce_mismatch"]);
  await assert.rejects(repository.recordRefusal({ action: "restore.lock_acquire", subjectKind: "recovery_dry_run", subjectId: null, reasonCode: "Wrong passphrase was hunter2" }), conflictWith("invalid_refusal"));
  await assert.rejects(repository.recordRefusal({ action: "send.email", subjectKind: "recovery_dry_run", subjectId: null, reasonCode: "x" }), conflictWith("invalid_refusal"));
  const columns = (await database.prepare("PRAGMA table_info(handoff_recovery_audit_events)").all()).results.map((column) => column.name).sort();
  assert.deepEqual(columns, ["action", "actor_subject", "command_id", "created_at", "id", "material_digest", "outcome", "reason_code", "subject_id", "subject_kind", "workspace_id"]);
  const commands = await count(database, "handoff_recovery_commands");
  assert.equal(commands, 2);
  assert.equal(await count(database, "handoff_recovery_audit_events", "outcome='recorded' AND command_id IN (SELECT id FROM handoff_recovery_commands)"), commands);
  await assert.rejects(database.prepare("UPDATE handoff_recovery_audit_events SET reason_code='changed'").run(), /immutable/u);
  await assert.rejects(database.prepare("DELETE FROM handoff_recovery_commands").run(), /immutable/u);
  await assert.rejects(database.prepare("INSERT INTO handoff_recovery_commands (id,workspace_id,owner_subject,command_kind,idempotency_key,operation_digest,expected_revision,result_kind,result_id,created_at) VALUES ('forged-command',?,'not-the-owner','archive.record','forged',?,0,'archive','x',?)")
    .bind(context.seeded.workspaceId, hex("0"), T0).run(), /workspace owner/u);
});
