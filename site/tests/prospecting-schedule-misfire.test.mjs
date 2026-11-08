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
