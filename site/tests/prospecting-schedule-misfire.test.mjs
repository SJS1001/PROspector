import assert from "node:assert/strict";
import test from "node:test";

import {
  applyMigrations,
  assertForbiddenOperationalRowsUnchanged,
  createD1Fixture,
  snapshotForbiddenOperationalRows,
} from "./helpers/d1.mjs";
import { seedProfileAuthority } from "./helpers/phase4.mjs";

const NOW = 1_780_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

test("a schedule more than a day late records each skipped slot and does not mint transport", async () => {
  const fixture = await createD1Fixture("phase4-schedule-misfire");
  try {
    await applyMigrations(fixture.database);
    const before = await snapshotForbiddenOperationalRows(fixture.database);
    const identity = { email: "phase4-misfire-owner@example.com", displayName: "Phase 4 misfire owner" };
    const subjectPepper = "phase4-misfire-owner-pepper-material-at-least-thirty-two-bytes";
    const access = await fixture.vite.ssrLoadModule(new URL("../domain/pilot-access.ts", import.meta.url).pathname);
    const handler = await fixture.vite.ssrLoadModule(new URL("../domain/prospecting-handler.ts", import.meta.url).pathname);
    const schedule = await fixture.vite.ssrLoadModule(new URL("../domain/prospecting-schedule.ts", import.meta.url).pathname);
    const principal = await access.admitPilotOwner(identity, identity.email, subjectPepper);
    const seeded = await seedProfileAuthority(fixture, principal, NOW);
    const dependencies = { database: fixture.database, subjectPepper, pilotOwnerEmail: identity.email, async getIdentity() { return identity; } };
    const baseUrl = `https://prospector.test/api/prospecting?profileId=${encodeURIComponent(seeded.profileId)}`;
    const ownerPost = (cookie, body) => handler.handleProspectingPost(new Request(baseUrl, {
      method: "POST",
      headers: { "content-type": "application/json", cookie, origin: "https://prospector.test", "sec-fetch-site": "same-origin", "x-prospector-intent": handler.PROSPECTING_MUTATION_INTENT },
      body: JSON.stringify(body),
    }), dependencies);

    const initial = await handler.handleProspectingGet(new Request(baseUrl), dependencies);
    assert.equal(initial.status, 200);
    let cookie = csrfCookie(initial);
    const create = await ownerPost(cookie, { action: "create_candidate", profileId: seeded.profileId, expectedRevision: seeded.revision, idempotencyKey: "0198f400-0000-7000-8000-000000001101" });
    assert.equal(create.status, 200);
    cookie = csrfCookie(create);
    const candidate = await fixture.database.prepare("SELECT id,revision,candidate_digest FROM profile_configuration_candidates WHERE workspace_id=?").bind(seeded.workspaceId).first();
    const activate = await ownerPost(cookie, { action: "activate", candidateId: candidate.id, expectedRevision: Number(candidate.revision), expectedDigest: candidate.candidate_digest, idempotencyKey: "0198f400-0000-7000-8000-000000001102" });
    assert.equal(activate.status, 200);

    const stored = await fixture.database.prepare("SELECT id,next_run_at,execution_state FROM prospecting_schedules WHERE workspace_id=? AND profile_id=? AND active=1").bind(seeded.workspaceId, seeded.profileId).first();
    const lateDue = NOW - (3 * DAY);
    await fixture.database.prepare("UPDATE prospecting_schedules SET next_run_at=? WHERE id=? AND workspace_id=?").bind(lateDue, stored.id, seeded.workspaceId).run();

    const first = await schedule.reconcileProspectingSchedules(fixture.database, seeded.workspaceId, NOW);
    assert.equal(first.length, 1);
    assert.equal(first[0].executionState, "skipped_misfire");
    assert.equal(first[0].replayed, false);
    const second = await schedule.reconcileProspectingSchedules(fixture.database, seeded.workspaceId, NOW);
    assert.equal(second.length, 1);
    assert.equal(second[0].executionState, "skipped_misfire");
    assert.notEqual(second[0].key, first[0].key);

    const missed = await fixture.database.prepare("SELECT id,execution_state,completed_at FROM prospecting_runs WHERE workspace_id=? AND trigger_kind='scheduled' AND execution_state='skipped_misfire' ORDER BY started_at,id").bind(seeded.workspaceId).all();
    assert.deepEqual(missed.results.map((row) => row.execution_state), ["skipped_misfire", "skipped_misfire"]);
    assert.deepEqual(missed.results.map((row) => row.id), [first[0].id, second[0].id]);
    for (const row of missed.results) assert.equal(Number(row.completed_at) > 0, true);
    const events = await fixture.database.prepare("SELECT event_type FROM prospecting_run_events WHERE workspace_id=? AND event_type='skipped_misfire'").bind(seeded.workspaceId).all();
    assert.equal(events.results.length, 2);

    const advanced = await fixture.database.prepare("SELECT next_run_at,execution_state FROM prospecting_schedules WHERE id=? AND workspace_id=?").bind(stored.id, seeded.workspaceId).first();
    assert.equal(advanced.execution_state, "blocked_missing_capability");
    assert.equal(Number(advanced.next_run_at) > lateDue, true);
    const replay = await schedule.reconcileProspectingSchedules(fixture.database, seeded.workspaceId, NOW);
    const still = await fixture.database.prepare("SELECT id FROM prospecting_runs WHERE workspace_id=? AND trigger_key=?").bind(seeded.workspaceId, first[0].key).all();
    assert.equal(still.results.length, 1);
    if (replay.length === 1 && replay[0].key === first[0].key) assert.equal(replay[0].replayed, true);

    await assertForbiddenOperationalRowsUnchanged(fixture.database, before);
  } finally {
    await fixture.dispose();
  }
});

test("an active run records skipped overlap on the run and keeps the schedule state inside its declared set", async () => {
  const fixture = await createD1Fixture("phase4-schedule-overlap");
  try {
    await applyMigrations(fixture.database);
    const before = await snapshotForbiddenOperationalRows(fixture.database);
    const identity = { email: "phase4-overlap-owner@example.com", displayName: "Phase 4 overlap owner" };
    const subjectPepper = "phase4-overlap-owner-pepper-material-at-least-thirty-two-bytes";
    const access = await fixture.vite.ssrLoadModule(new URL("../domain/pilot-access.ts", import.meta.url).pathname);
    const handler = await fixture.vite.ssrLoadModule(new URL("../domain/prospecting-handler.ts", import.meta.url).pathname);
    const schedule = await fixture.vite.ssrLoadModule(new URL("../domain/prospecting-schedule.ts", import.meta.url).pathname);
    const principal = await access.admitPilotOwner(identity, identity.email, subjectPepper);
    const seeded = await seedProfileAuthority(fixture, principal, NOW);
    const dependencies = { database: fixture.database, subjectPepper, pilotOwnerEmail: identity.email, async getIdentity() { return identity; } };
    const baseUrl = `https://prospector.test/api/prospecting?profileId=${encodeURIComponent(seeded.profileId)}`;
    const ownerPost = (cookie, body) => handler.handleProspectingPost(new Request(baseUrl, {
      method: "POST",
      headers: { "content-type": "application/json", cookie, origin: "https://prospector.test", "sec-fetch-site": "same-origin", "x-prospector-intent": handler.PROSPECTING_MUTATION_INTENT },
      body: JSON.stringify(body),
    }), dependencies);

    const initial = await handler.handleProspectingGet(new Request(baseUrl), dependencies);
    assert.equal(initial.status, 200);
    let cookie = csrfCookie(initial);
    const create = await ownerPost(cookie, { action: "create_candidate", profileId: seeded.profileId, expectedRevision: seeded.revision, idempotencyKey: "0198f400-0000-7000-8000-000000001201" });
    assert.equal(create.status, 200);
    cookie = csrfCookie(create);
    const candidate = await fixture.database.prepare("SELECT id,revision,candidate_digest FROM profile_configuration_candidates WHERE workspace_id=?").bind(seeded.workspaceId).first();
    const activate = await ownerPost(cookie, { action: "activate", candidateId: candidate.id, expectedRevision: Number(candidate.revision), expectedDigest: candidate.candidate_digest, idempotencyKey: "0198f400-0000-7000-8000-000000001202" });
    assert.equal(activate.status, 200);

    const activeRun = await fixture.database.prepare("UPDATE prospecting_runs SET execution_state='running' WHERE workspace_id=? AND profile_id=? AND trigger_kind='initial' AND execution_state='blocked_missing_capability'").bind(seeded.workspaceId, seeded.profileId).run();
    assert.equal(Number(activeRun.meta?.changes ?? 0), 1);
    const stored = await fixture.database.prepare("SELECT id,next_run_at FROM prospecting_schedules WHERE workspace_id=? AND profile_id=? AND active=1").bind(seeded.workspaceId, seeded.profileId).first();
    const due = NOW - (60 * 60 * 1000);
    await fixture.database.prepare("UPDATE prospecting_schedules SET next_run_at=? WHERE id=? AND workspace_id=?").bind(due, stored.id, seeded.workspaceId).run();

    const first = await schedule.reconcileProspectingSchedules(fixture.database, seeded.workspaceId, NOW);
    assert.equal(first.length, 1);
    assert.equal(first[0].executionState, "skipped_overlap");
    assert.equal(first[0].replayed, false);
    const overlap = await fixture.database.prepare("SELECT id,execution_state,completed_at FROM prospecting_runs WHERE workspace_id=? AND trigger_key=?").bind(seeded.workspaceId, first[0].key).first();
    assert.equal(overlap.execution_state, "skipped_overlap");
    assert.equal(Number(overlap.completed_at) > 0, true);
    const event = await fixture.database.prepare("SELECT event_type,event_json FROM prospecting_run_events WHERE workspace_id=? AND run_id=?").bind(seeded.workspaceId, overlap.id).first();
    assert.equal(event.event_type, "skipped_overlap");
    assert.equal(JSON.parse(event.event_json).state, "skipped_overlap");
    const advanced = await fixture.database.prepare("SELECT next_run_at,execution_state FROM prospecting_schedules WHERE id=? AND workspace_id=?").bind(stored.id, seeded.workspaceId).first();
    assert.equal(advanced.execution_state, "blocked_missing_capability");
    assert.equal(Number(advanced.next_run_at) > due, true);
    const stillRunning = await fixture.database.prepare("SELECT execution_state FROM prospecting_runs WHERE workspace_id=? AND trigger_kind='initial'").bind(seeded.workspaceId).first();
    assert.equal(stillRunning.execution_state, "running");

    const second = await schedule.reconcileProspectingSchedules(fixture.database, seeded.workspaceId, NOW);
    const sameSlot = await fixture.database.prepare("SELECT id FROM prospecting_runs WHERE workspace_id=? AND trigger_key=?").bind(seeded.workspaceId, first[0].key).all();
    assert.equal(sameSlot.results.length, 1);
    const scheduleStates = await fixture.database.prepare("SELECT execution_state FROM prospecting_schedules WHERE workspace_id=?").bind(seeded.workspaceId).all();
    for (const row of scheduleStates.results) assert.equal(row.execution_state, "blocked_missing_capability");
    if (second.some((row) => row.key === first[0].key)) assert.equal(second.find((row) => row.key === first[0].key).replayed, true);

    await assertForbiddenOperationalRowsUnchanged(fixture.database, before);
  } finally {
    await fixture.dispose();
  }
});

function csrfCookie(response) {
  const value = response.headers.get("set-cookie");
  const match = /(?:^|,\s*)(__Host-prospector-csrf=[A-Za-z0-9_-]{43})/.exec(value ?? "");
  assert.ok(match, "the owner response must set the opaque HttpOnly CSRF cookie");
  return match[1];
}

// --- 2026-11-09 review batch 05: schedule liveness, overlap admission, intent replay ---

const MINUTE = 60 * 1000;
const SLOT = NOW + (7 * DAY);

async function activatedSchedule(name) {
  const fixture = await createD1Fixture(name);
  await applyMigrations(fixture.database);
  const principal = { subject: `${name}-owner`, legacySubject: `${name}-legacy`, displayName: "Batch 05 owner" };
  const seeded = await seedProfileAuthority(fixture, principal, NOW);
  const readiness = await fixture.vite.ssrLoadModule(new URL("../domain/profile-readiness.ts", import.meta.url).pathname);
  const schedule = await fixture.vite.ssrLoadModule(new URL("../domain/prospecting-schedule.ts", import.meta.url).pathname);
  const candidate = await readiness.createProfileConfigurationCandidate(fixture.database, principal, {
    profileId: seeded.profileId, expectedProfileRevision: seeded.revision,
    idempotencyKey: "0198f405-0000-7000-8000-000000000001", now: NOW,
  });
  const activation = await readiness.activateProfileConfiguration(fixture.database, principal, {
    candidateId: candidate.id, expectedRevision: candidate.revision, expectedDigest: candidate.digest,
    idempotencyKey: "0198f405-0000-7000-8000-000000000002", now: NOW,
  });
  return {
    fixture, schedule, workspaceId: seeded.workspaceId, profileId: seeded.profileId,
    configurationId: activation.configuration.id, configurationDigest: activation.configuration.digest,
    scheduleId: activation.schedule.id, initialRunId: activation.initialRun.id,
  };
}

async function setSchedule(seed, nextRunAt, watermark) {
  await seed.fixture.database.prepare("UPDATE prospecting_schedules SET next_run_at=?,last_successful_watermark=? WHERE id=? AND workspace_id=?").bind(nextRunAt, watermark, seed.scheduleId, seed.workspaceId).run();
}
async function readSchedule(seed) {
  const row = await seed.fixture.database.prepare("SELECT next_run_at,last_successful_watermark,execution_state FROM prospecting_schedules WHERE id=? AND workspace_id=?").bind(seed.scheduleId, seed.workspaceId).first();
  return { nextRunAt: Number(row.next_run_at), watermark: row.last_successful_watermark === null ? null : Number(row.last_successful_watermark), executionState: row.execution_state };
}
async function completedManualRun(seed, key, at, watermark) {
  const intent = await seed.schedule.createManualProspectingIntent(seed.fixture.database, seed.workspaceId, {
    profileId: seed.profileId, configurationId: seed.configurationId, configurationDigest: seed.configurationDigest,
    scheduleId: seed.scheduleId, idempotencyKey: key, at, watermark, manifest: { requestedBy: "owner" },
  });
  await seed.fixture.database.prepare("UPDATE prospecting_runs SET execution_state='running' WHERE id=?").bind(intent.id).run();
  return seed.schedule.completeProspectingRun(seed.fixture.database, seed.workspaceId, { runId: intent.id, successfulWatermark: at, now: at + MINUTE });
}

test("a manual run completing after an unreconciled due slot caps the schedule watermark below that slot and never regresses it", async () => {
  const seed = await activatedSchedule("batch05-manual-watermark");
  try {
    await setSchedule(seed, SLOT, SLOT - DAY);
    await completedManualRun(seed, "batch05-manual-late", SLOT + (5 * MINUTE), SLOT - DAY);
    const capped = await readSchedule(seed);
    assert.equal(capped.watermark, SLOT - 1, "a manual completion may not move the watermark onto or past the unreconciled due slot");

    // An older manual run completing later cannot regress the watermark.
    await completedManualRun(seed, "batch05-manual-older", SLOT - (2 * DAY), null);
    assert.equal((await readSchedule(seed)).watermark, SLOT - 1);

    const reconciled = await seed.schedule.reconcileProspectingSchedules(seed.fixture.database, seed.workspaceId, SLOT + (30 * MINUTE));
    assert.equal(reconciled.length, 1);
    assert.equal(reconciled[0].scheduleId, seed.scheduleId);
    assert.equal(reconciled[0].executionState, "blocked_missing_capability");
    const run = await seed.fixture.database.prepare("SELECT window_lower_exclusive,window_upper_inclusive FROM prospecting_runs WHERE id=?").bind(reconciled[0].id).first();
    assert.equal(Number(run.window_upper_inclusive), SLOT);
    assert.equal(Number(run.window_lower_exclusive), SLOT - 1 - DAY);
    assert.equal((await readSchedule(seed)).nextRunAt > SLOT, true);
  } finally { await seed.fixture.dispose(); }
});

test("an already-inverted schedule watermark records the slot as skipped with a distinct reason and advances, on time and after a misfire", async () => {
  const seed = await activatedSchedule("batch05-inverted-watermark");
  try {
    // Reproduces the pre-fix wedge: watermark = due + 5 minutes.
    await setSchedule(seed, SLOT, SLOT + (5 * MINUTE));
    const onTime = await seed.schedule.reconcileProspectingSchedules(seed.fixture.database, seed.workspaceId, SLOT + (30 * MINUTE));
    assert.equal(onTime.length, 1);
    assert.equal(onTime[0].executionState, "skipped_misfire");
    assert.equal(onTime[0].replayed, false);
    const row = await seed.fixture.database.prepare("SELECT execution_state,manifest_json,window_lower_exclusive,window_upper_inclusive,completed_at FROM prospecting_runs WHERE id=?").bind(onTime[0].id).first();
    assert.equal(row.execution_state, "skipped_misfire");
    assert.equal(JSON.parse(row.manifest_json).skippedBecause, "watermark_at_or_after_slot");
    assert.equal(row.window_lower_exclusive, null);
    assert.equal(Number(row.window_upper_inclusive), SLOT);
    assert.equal(Number(row.completed_at) > 0, true);
    const event = await seed.fixture.database.prepare("SELECT event_json FROM prospecting_run_events WHERE run_id=? AND event_type='skipped_misfire'").bind(onTime[0].id).first();
    assert.equal(JSON.parse(event.event_json).reason, "watermark_at_or_after_slot");
    const advanced = await readSchedule(seed);
    assert.equal(advanced.nextRunAt > SLOT, true);
    assert.equal(advanced.watermark, SLOT + (5 * MINUTE), "skipping never rewrites the watermark");

    // The same wedge discovered two days late goes through the misfire branch.
    const late = advanced.nextRunAt;
    await setSchedule(seed, late, late + (5 * MINUTE));
    const misfire = await seed.schedule.reconcileProspectingSchedules(seed.fixture.database, seed.workspaceId, late + (2 * DAY));
    assert.equal(misfire.length, 1);
    assert.equal(misfire[0].executionState, "skipped_misfire");
    const misfireRow = await seed.fixture.database.prepare("SELECT manifest_json FROM prospecting_runs WHERE id=?").bind(misfire[0].id).first();
    assert.equal(JSON.parse(misfireRow.manifest_json).skippedBecause, "watermark_at_or_after_slot");
    assert.equal((await readSchedule(seed)).nextRunAt > late, true);

    // Replaying the same slot is idempotent.
    await setSchedule(seed, late, late + (5 * MINUTE));
    const replay = await seed.schedule.reconcileProspectingSchedules(seed.fixture.database, seed.workspaceId, late + (2 * DAY));
    assert.equal(replay[0].id, misfire[0].id);
    assert.equal(replay[0].replayed, true);
  } finally { await seed.fixture.dispose(); }
});

test("one failing schedule is reported per schedule and cannot starve a later schedule", async () => {
  const seed = await activatedSchedule("batch05-isolation");
  try {
    const database = seed.fixture.database;
    await database.batch([
      database.prepare("INSERT INTO customer_profiles (id,workspace_id,created_at,updated_at,revision,play_id,name,lifecycle,timezone,weekly_target) SELECT 'batch05-broken-profile',workspace_id,created_at,updated_at,1,play_id,'Broken schedule profile',lifecycle,timezone,weekly_target FROM customer_profiles WHERE id=?").bind(seed.profileId),
      database.prepare("INSERT INTO authority_commands (id,workspace_id,created_at,updated_at,revision,command_type,idempotency_key,operation_digest,expected_revision,subject_type,subject_id,status) VALUES ('batch05-broken-command',?,?,?,1,'test.broken_schedule','batch05-broken-command-key',?,1,'profile','batch05-broken-profile','accepted')").bind(seed.workspaceId, NOW, NOW, "e".repeat(64)),
      // Pinned to an inactive configuration: intent creation must refuse it on every pass.
      database.prepare("INSERT INTO typed_configurations (id,workspace_id,created_at,updated_at,revision,company_id,owner_type,owner_id,kind,digest,manifest_json,active) SELECT 'batch05-broken-config',workspace_id,created_at,updated_at,1,company_id,owner_type,'batch05-broken-profile',kind,?,manifest_json,0 FROM typed_configurations WHERE id=?").bind("b".repeat(64), seed.configurationId),
      database.prepare("INSERT INTO prospecting_schedules (id,workspace_id,created_at,updated_at,revision,profile_id,configuration_id,configuration_digest,schedule_key,timezone,intended_local_time,utc_offset_minutes,cadence,next_run_at,last_successful_watermark,active,execution_state,authority_command_id,operation_digest,idempotency_key) VALUES ('batch05-broken-schedule',?,?,?,1,'batch05-broken-profile','batch05-broken-config',?,'batch05-broken-key','America/Toronto','06:00',-240,'weekdays',?,NULL,1,'blocked_missing_capability','batch05-broken-command',?,'batch05-broken-schedule-key')").bind(seed.workspaceId, NOW, NOW, "b".repeat(64), SLOT - (60 * MINUTE), "d".repeat(64)),
    ]);
    await setSchedule(seed, SLOT, SLOT - DAY);
    const results = await seed.schedule.reconcileProspectingSchedules(database, seed.workspaceId, SLOT + (30 * MINUTE));
    assert.equal(results.length, 2);
    assert.deepEqual(results[0], { scheduleId: "batch05-broken-schedule", failed: true, errorCode: "prospecting_schedule_conflict" });
    assert.equal(results[1].scheduleId, seed.scheduleId);
    assert.equal(results[1].executionState, "blocked_missing_capability");
    assert.equal(results[1].replayed, false);
    const broken = await database.prepare("SELECT next_run_at FROM prospecting_schedules WHERE id='batch05-broken-schedule'").first();
    assert.equal(Number(broken.next_run_at), SLOT - (60 * MINUTE), "a genuinely failing slot is not silently advanced");
    assert.equal((await readSchedule(seed)).nextRunAt > SLOT, true);
  } finally { await seed.fixture.dispose(); }
});

test("a concurrent duplicate prospecting intent replays the winner instead of surfacing a raw constraint error", async () => {
  const seed = await activatedSchedule("batch05-intent-race");
  try {
    const input = {
      profileId: seed.profileId, configurationId: seed.configurationId, configurationDigest: seed.configurationDigest,
      scheduleId: seed.scheduleId, idempotencyKey: "batch05-race-key", at: NOW + MINUTE, watermark: null, manifest: { requestedBy: "owner" },
    };
    let raced = false;
    const real = seed.fixture.database;
    // The loser's prior read happens, then the winner commits before the loser's batch.
    const racing = new Proxy(real, {
      get(target, property) {
        if (property === "prepare") return (sql) => {
          const statement = target.prepare(sql);
          if (raced || !sql.startsWith("SELECT id, trigger_kind, trigger_key, execution_state FROM prospecting_runs")) return statement;
          raced = true;
          return { bind: () => ({ first: async () => { await seed.schedule.createManualProspectingIntent(real, seed.workspaceId, input); return null; } }) };
        };
        const value = Reflect.get(target, property);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const loser = await seed.schedule.createManualProspectingIntent(racing, seed.workspaceId, input);
    assert.equal(raced, true);
    assert.equal(loser.replayed, true);
    const rows = await real.prepare("SELECT id FROM prospecting_runs WHERE workspace_id=? AND idempotency_key=?").bind(seed.workspaceId, input.idempotencyKey).all();
    assert.equal(rows.results.length, 1);
    assert.equal(loser.id, rows.results[0].id);

    // A different trigger under the same key is a typed conflict, not a raw D1 error.
    let racedOther = false;
    const conflicting = new Proxy(real, {
      get(target, property) {
        if (property === "prepare") return (sql) => {
          const statement = target.prepare(sql);
          if (racedOther || !sql.startsWith("SELECT id, trigger_kind, trigger_key, execution_state FROM prospecting_runs")) return statement;
          racedOther = true;
          return { bind: () => ({ first: async () => null }) };
        };
        const value = Reflect.get(target, property);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    await assert.rejects(
      seed.schedule.createManualProspectingIntent(conflicting, seed.workspaceId, { ...input, triggerKey: "manual:batch05:other" }),
      (error) => error instanceof seed.schedule.ProspectingScheduleConflictError,
    );
  } finally { await seed.fixture.dispose(); }
});

test("admission refuses a second run for a Profile while another run is active", async () => {
  const seed = await activatedSchedule("batch05-admission-overlap");
  try {
    const admission = await seed.fixture.vite.ssrLoadModule(new URL("../domain/prospecting-run-admission.ts", import.meta.url).pathname);
    const manual = await seed.schedule.createManualProspectingIntent(seed.fixture.database, seed.workspaceId, {
      profileId: seed.profileId, configurationId: seed.configurationId, configurationDigest: seed.configurationDigest,
      scheduleId: seed.scheduleId, idempotencyKey: "batch05-admission-manual", at: NOW + MINUTE, watermark: null, manifest: { requestedBy: "owner" },
    });
    const port = { async authorize(request) {
      return { kind: "authorized", authorityId: `synthetic-${request.runId}`, evidenceDigest: "c".repeat(64), requestDigest: await admission.digestProspectingRunAdmissionRequest(request), validUntil: NOW + (2 * MINUTE) };
    } };
    const runs = await seed.fixture.database.prepare("SELECT id,execution_state,revision FROM prospecting_runs WHERE id IN (?,?)").bind(seed.initialRunId, manual.id).all();
    assert.deepEqual(runs.results.map((row) => row.execution_state), ["blocked_missing_capability", "blocked_missing_capability"]);
    const revisionOf = (id) => Number(runs.results.find((row) => row.id === id).revision);

    const first = await admission.admitProspectingRunToQueue(seed.fixture.database, { workspaceId: seed.workspaceId, runId: seed.initialRunId, expectedRunRevision: revisionOf(seed.initialRunId), idempotencyKey: "batch05-admit-initial", now: NOW + MINUTE }, port);
    assert.equal(first.executionState, "queued");
    await assert.rejects(
      admission.admitProspectingRunToQueue(seed.fixture.database, { workspaceId: seed.workspaceId, runId: manual.id, expectedRunRevision: revisionOf(manual.id), idempotencyKey: "batch05-admit-manual", now: NOW + MINUTE }, port),
      /prospecting_run_admission_rejected/,
    );
    assert.equal((await seed.fixture.database.prepare("SELECT execution_state FROM prospecting_runs WHERE id=?").bind(manual.id).first()).execution_state, "blocked_missing_capability");

    // Once the active run is terminal the second run may be admitted.
    await seed.fixture.database.prepare("UPDATE prospecting_runs SET execution_state='succeeded' WHERE id=?").bind(seed.initialRunId).run();
    const second = await admission.admitProspectingRunToQueue(seed.fixture.database, { workspaceId: seed.workspaceId, runId: manual.id, expectedRunRevision: revisionOf(manual.id), idempotencyKey: "batch05-admit-manual-after", now: NOW + MINUTE }, port);
    assert.equal(second.executionState, "queued");
  } finally { await seed.fixture.dispose(); }
});
