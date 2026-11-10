import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { applyMigrationsThrough, createD1Fixture } from "./helpers/d1.mjs";

// The read composes the 0022 transition ledger and the 0023 restore evidence,
// so every fixture carries the canonical chain through 0023.
const applyPhase4Migrations = (database) => applyMigrationsThrough(database, "0023_handoff_recovery.sql");

const AS_OF = "2026-03-16T03:59:59.999Z";
const WINDOW_START = "2026-03-09T05:00:00.000Z";
const WINDOW_END = "2026-03-16T04:00:00.000Z";
const DIGEST_A = "a".repeat(64);
const DIGEST_B = "b".repeat(64);

async function load(fixture) {
  return fixture.vite.ssrLoadModule(
    new URL("../domain/morning-brief-read.ts", import.meta.url).pathname,
  );
}

function run(database, sql, ...bind) {
  return database.prepare(sql).bind(...bind).run();
}

/**
 * Seeds one complete owner hierarchy. Every value is synthetic; no real
 * workspace, prospect, contact, or provider record is used.
 */
async function seedWorkspace(database, suffix, { lifecycle = "ready", profileName = "Operating" } = {}) {
  const now = Date.UTC(2026, 0, 5);
  const id = (kind) => `${kind}-${suffix}`;
  await run(database, "INSERT INTO workspaces (id, company_name, owner_subject, created_at, updated_at, revision) VALUES (?, ?, ?, ?, ?, 1)", id("workspace"), "Digitalrain", `owner-${suffix}`, now, now);
  await run(database, "INSERT INTO companies (id, workspace_id, created_at, updated_at, revision, name, status) VALUES (?, ?, ?, ?, 1, 'Digitalrain', 'active')", id("company"), id("workspace"), now, now);
  await run(database, "INSERT INTO workspace_companies (workspace_id, company_id, created_at) VALUES (?, ?, ?)", id("workspace"), id("company"), now);
  await run(database, "INSERT INTO products (id, workspace_id, created_at, updated_at, revision, company_id, name, lifecycle) VALUES (?, ?, ?, ?, 1, ?, 'ONE', 'ready')", id("product"), id("workspace"), now, now, id("company"));
  await run(database, "INSERT INTO market_plays (id, workspace_id, created_at, updated_at, revision, product_id, name, lifecycle) VALUES (?, ?, ?, ?, 1, ?, 'ONE for Mining', 'active')", id("play"), id("workspace"), now, now, id("product"));
  await run(database, "INSERT INTO customer_profiles (id, workspace_id, created_at, updated_at, revision, play_id, name, lifecycle, timezone, weekly_target) VALUES (?, ?, ?, ?, 1, ?, ?, ?, 'America/Toronto', 7)", id("profile"), id("workspace"), now, now, id("play"), profileName, lifecycle);
  await run(database, "INSERT INTO customer_profiles (id, workspace_id, created_at, updated_at, revision, play_id, name, lifecycle, timezone, weekly_target) VALUES (?, ?, ?, ?, 1, ?, 'Greenfield', 'draft', 'America/Toronto', 0)", id("profile-greenfield"), id("workspace"), now + 1, now + 1, id("play"));
  await run(database, "INSERT INTO typed_configurations (id, workspace_id, created_at, updated_at, revision, company_id, owner_type, owner_id, kind, digest, manifest_json, active) VALUES (?, ?, ?, ?, 1, ?, 'profile', ?, 'profile_effective', ?, '{}', 1)", id("config"), id("workspace"), now, now, id("company"), id("profile"), DIGEST_A);
  return { id, now };
}

async function seedSchedule(database, ctx, patch = {}) {
  const { id, now } = ctx;
  const updatedAt = patch.updatedAt ?? Date.UTC(2026, 2, 16, 3, 0, 0);
  await run(database, "INSERT INTO authority_commands (id, workspace_id, created_at, updated_at, revision, command_type, idempotency_key, operation_digest, expected_revision, subject_type, subject_id, status) VALUES (?, ?, ?, ?, 1, 'prospecting_schedule', ?, ?, 1, 'profile', ?, 'accepted')", id("command"), id("workspace"), now, now, `key-${id("command")}`, hexOf(ctx0(id), 20), id("profile"));
  await run(
    database,
    `INSERT INTO prospecting_schedules
      (id, workspace_id, created_at, updated_at, revision, profile_id, configuration_id,
       configuration_digest, schedule_key, timezone, intended_local_time, utc_offset_minutes,
       cadence, next_run_at, last_successful_watermark, active, execution_state,
       authority_command_id, operation_digest, idempotency_key)
     VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, -240, 'weekdays', ?, NULL, ?, ?, ?, ?, ?)`,
    id("schedule"), id("workspace"), now, updatedAt, id("profile"), id("config"),
    patch.configurationDigest ?? DIGEST_A, `sk-${id("schedule")}`,
    patch.timezone ?? "America/Toronto", patch.localTime ?? "06:00",
    Date.UTC(2026, 2, 17, 10, 0, 0), patch.active ?? 1,
    patch.executionState ?? "active", id("command"), DIGEST_B, `idem-${id("schedule")}`,
  );
}

/**
 * Seeds the interview/knowledge chain an Offer requires, mirroring the exact
 * statements `tests/helpers/phase4.mjs` uses. That helper hardcodes its ids so
 * it cannot seed two workspaces in one fixture, which the scope-isolation case
 * needs; nothing in it is modified here.
 */
async function seedOffer(database, ctx, profileKey = "profile", configKey = "config", cfgDigest = DIGEST_A) {
  const { id: baseId, now } = ctx;
  const suffix = profileKey === "profile" ? "" : `-${profileKey}`;
  const id = (kind) => (kind === "profile" ? baseId(profileKey) : `${baseId(kind)}${suffix}`);
  const ws = baseId("workspace");
  const cfg = baseId(configKey);
  await run(database, "INSERT INTO authority_commands (id,workspace_id,created_at,updated_at,revision,command_type,idempotency_key,operation_digest,expected_revision,subject_type,subject_id,status) VALUES (?,?,?,?,1,'test.profile.authority',?,?,1,'profile',?,'accepted')", id("offer-cmd"), ws, now, now, `k-${id("offer-cmd")}`, hexOf(ctx0(id), 21), id("profile"));
  await run(database, "INSERT INTO knowledge_items (id,workspace_id,created_at,updated_at,revision,company_id,scope_type,scope_id,kind,slot,current_version_id) VALUES (?,?,?,?,1,?,'profile',?,'fit','offer',NULL)", id("offer-item"), ws, now, now, baseId("company"), id("profile"));
  await run(database, "INSERT INTO interview_sessions (id,workspace_id,created_at,updated_at,revision,scope_type,scope_id,state,active_question_id) VALUES (?,?,?,?,1,'profile',?,'complete',NULL)", id("offer-session"), ws, now, now, id("profile"));
  await run(database, "INSERT INTO interview_questions (id,workspace_id,created_at,updated_at,revision,session_id,version,prompt,research_json,recommendation,status) VALUES (?,?,?,?,1,?,1,'offer','{}',NULL,'answered')", id("offer-question"), ws, now, now, id("offer-session"));
  await run(database, "INSERT INTO interview_answers (id,workspace_id,session_id,question_id,question_revision,choice,correction_json,idempotency_key,created_at,proposal_json,proposal_digest,operation_digest) VALUES (?,?,?,?,1,'accept',NULL,?,?,'{}',?,?)", id("offer-answer"), ws, id("offer-session"), id("offer-question"), `k-${id("offer-answer")}`, now, hexOf(id("salt"), 40), hexOf(id("salt"), 41));
  await run(database, "INSERT INTO knowledge_proposals (id,workspace_id,created_at,updated_at,revision,company_id,source_id,excerpt_id,destination_scope_type,destination_scope_id,kind,value_json,provenance_json,proposal_digest,origin,status) VALUES (?,?,?,?,1,?,NULL,NULL,'profile',?,'fit','{}','{}',?,'test','accepted')", id("offer-proposal"), ws, now, now, baseId("company"), id("profile"), hexOf(id("salt"), 42));
  await run(database, "INSERT INTO proposal_decisions (id,workspace_id,created_at,updated_at,revision,proposal_id,answer_id,authority_command_id,decision,reviewed_snapshot_digest,operation_digest,idempotency_key) VALUES (?,?,?,?,1,?,?,?,'accept',?,?,?)", id("offer-decision"), ws, now, now, id("offer-proposal"), id("offer-answer"), id("offer-cmd"), hexOf(id("salt"), 43), hexOf(id("salt"), 44), `k-${id("offer-decision")}`);
  await run(database, "INSERT INTO knowledge_versions (id,workspace_id,created_at,updated_at,revision,scope_type,scope_id,kind,value_json,status,source_digest,knowledge_item_id,proposal_id,decision_id,authority_command_id,value_digest,predecessor_version_id) VALUES (?,?,?,?,1,'profile',?,'fit','{}','confirmed',?,?,?,?,?,?,NULL)", id("offer-version"), ws, now, now, id("profile"), hexOf(id("salt"), 45), id("offer-item"), id("offer-proposal"), id("offer-decision"), id("offer-cmd"), hexOf(id("salt"), 46));
  await run(database, "UPDATE knowledge_items SET current_version_id=? WHERE id=?", id("offer-version"), id("offer-item"));
  await run(database, "INSERT INTO audit_events (id,workspace_id,actor_type,actor_id,action,subject_type,subject_id,detail_json,created_at) VALUES (?,?,'owner','owner','test.offer','offer',?,'{}',?)", id("offer-audit"), ws, id("profile"), now);
  await run(database, "INSERT INTO offers (id,workspace_id,created_at,updated_at,revision,profile_id,name,value_json,question_id,answer_id,proposal_id,decision_id,knowledge_version_id,authority_command_id,audit_event_id) VALUES (?,?,?,?,1,?,'Offer','{}',?,?,?,?,?,?,?)", id("offer"), ws, now, now, id("profile"), id("offer-question"), id("offer-answer"), id("offer-proposal"), id("offer-decision"), id("offer-version"), id("offer-cmd"), id("offer-audit"));
  await run(database, "INSERT INTO authority_commands (id,workspace_id,created_at,updated_at,revision,command_type,idempotency_key,operation_digest,expected_revision,subject_type,subject_id,status) VALUES (?,?,?,?,1,'test.run.authority',?,?,1,'profile',?,'accepted')", id("run-cmd"), ws, now, now, `k-${id("run-cmd")}`, hexOf(ctx0(id), 22), id("profile"));
  await run(database, "INSERT INTO audit_events (id,workspace_id,actor_type,actor_id,action,subject_type,subject_id,detail_json,created_at) VALUES (?,?,'system','synthetic','test.assignment','prospecting_run',?,'{}',?)", id("run-audit"), ws, id("run"), now);
  await run(database, "INSERT INTO prospecting_runs (id,workspace_id,created_at,updated_at,revision,profile_id,configuration_id,schedule_id,configuration_digest,trigger_kind,trigger_key,window_lower_exclusive,window_upper_inclusive,last_successful_watermark,successful_watermark,manifest_json,manifest_digest,execution_state,authority_command_id,operation_digest,idempotency_key,started_at,completed_at) VALUES (?,?,?,?,1,?,?,NULL,?,'manual',?,NULL,?,NULL,NULL,'{}',?,'queued',?,?,?,?,NULL)", id("run"), ws, now, now, id("profile"), cfg, cfgDigest, `tk-${id("run")}`, now, hexOf(ctx0(id), 23), id("run-cmd"), hexOf(ctx0(id), 24), `idem-${id("run")}`, now);
  await run(database, "INSERT INTO runner_assignments (id,workspace_id,created_at,updated_at,revision,run_id,profile_id,configuration_id,configuration_digest,audience,token_hash,nonce_hash,instruction_version,tool_configuration_digest,quota_json,quota_digest,expires_at,status,authority_command_id,audit_event_id) VALUES (?,?,?,?,1,?,?,?,?,'synthetic',?,?,'v1',?,'{}',?,?,'issued',?,?)", id("assign"), ws, now, now, id("run"), id("profile"), cfg, cfgDigest, hexOf(ctx0(id), 25), hexOf(ctx0(id), 26), hexOf(ctx0(id), 27), hexOf(ctx0(id), 28), now + 100000, id("run-cmd"), id("run-audit"));
  await run(database, "UPDATE prospecting_runs SET execution_state='assigned' WHERE id=? AND workspace_id=?", id("run"), ws);
  await run(database, "INSERT INTO runner_submissions (id,workspace_id,run_id,assignment_id,configuration_id,submission_json,submission_digest,provenance_json,provenance_digest,status,operation_digest,idempotency_key,created_at) VALUES (?,?,?,?,?,'{}',?,'{}',?,'accepted',?,?,?)", id("submission"), ws, id("run"), id("assign"), cfg, hexOf(ctx0(id), 29), hexOf(ctx0(id), 30), hexOf(ctx0(id), 31), `k-${id("submission")}`, now);
}

/** A stable per-workspace salt so unique digests never collide across seeds. */
function ctx0(id) {
  return id("salt");
}

/** Seeds one reviewed Prospect with its immutable Phase 4 review record. */
async function seedReviewedProspect(database, ctx, key, decision, createdAt, profileKey = "profile", configKey = "config", cfgDigest = DIGEST_A) {
  const { id: baseId, now } = ctx;
  const suffix = profileKey === "profile" ? "" : `-${profileKey}`;
  const id = (kind) => (kind === "profile" ? baseId(profileKey) : `${baseId(kind)}${suffix}`);
  const p = (kind) => `${kind}-${key}`;
  const ws = baseId("workspace");
  const cfg = baseId(configKey);
  await run(database, "INSERT INTO audit_events (id, workspace_id, actor_type, actor_id, action, subject_type, subject_id, detail_json, created_at) VALUES (?, ?, 'owner', 'owner', 'prospect.review', 'prospect', ?, '{}', ?)", p("audit"), ws, p("prospect"), createdAt);
  await run(database, "INSERT INTO authority_commands (id, workspace_id, created_at, updated_at, revision, command_type, idempotency_key, operation_digest, expected_revision, subject_type, subject_id, status) VALUES (?, ?, ?, ?, 1, 'prospect_review', ?, ?, 1, 'prospect', ?, 'accepted')", p("cmd"), ws, createdAt, createdAt, `k-${p("cmd")}`, hexOf(key, 0), p("prospect"));
  await run(database, "INSERT INTO prospecting_candidates (id, workspace_id, created_at, updated_at, revision, profile_id, offer_id, run_id, submission_id, configuration_id, fingerprint, candidate_json, candidate_digest, predecessor_candidate_id, status) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, '{}', ?, NULL, 'qualified')", p("cand"), ws, now, now, id("profile"), id("offer"), id("run"), id("submission"), cfg, hexOf(key, 6), hexOf(key, 1));
  await run(database, "INSERT INTO qualification_assessments (id, workspace_id, candidate_id, configuration_id, configuration_digest, input_json, input_digest, anchor_json, evidence_json, gate_json, score_json, score, outcome, tie_order, assessment_digest, predecessor_assessment_id, created_at) VALUES (?, ?, ?, ?, ?, '{}', ?, '{}', '{}', '{}', '{}', 8, 'Passed', 1, ?, NULL, ?)", p("assess"), ws, p("cand"), cfg, cfgDigest, hexOf(key, 2), hexOf(key, 3), now);
  await run(database, "INSERT INTO profile_prospects (id, workspace_id, created_at, updated_at, revision, profile_id, offer_id, candidate_id, assessment_id, fingerprint, state, active) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, 'qualified', 1)", p("prospect"), ws, now, now, id("profile"), id("offer"), p("cand"), p("assess"), hexOf(key, 6));
  await run(database, "INSERT INTO prospect_review_decisions (id, workspace_id, prospect_id, assessment_id, decision, reason, review_at, expected_prospect_revision, authority_command_id, audit_event_id, decision_digest, operation_digest, idempotency_key, created_at) VALUES (?, ?, ?, ?, ?, 'synthetic', NULL, 1, ?, ?, ?, ?, ?, ?)", p("review"), ws, p("prospect"), p("assess"), decision, p("cmd"), p("audit"), hexOf(key, 4), hexOf(key, 5), `idem-${p("review")}`, createdAt);
  return p;
}

function hexOf(key, salt) {
  const seed = `${key}${salt}`;
  let out = "";
  for (let i = 0; i < 64; i += 1) out += "0123456789abcdef"[(seed.charCodeAt(i % seed.length) + i * 7) % 16];
  return out;
}

test("reads scope, schedule, review funnel and workspace origin from persisted rows while weekly and handoff stay unavailable", async () => {
  const fixture = await createD1Fixture("morning-brief-read-happy");
  try {
    await applyPhase4Migrations(fixture.database);
    const read = await load(fixture);
    const ctx = await seedWorkspace(fixture.database, "main");
    await seedSchedule(fixture.database, ctx);
    await seedOffer(fixture.database, ctx);
    await seedReviewedProspect(fixture.database, ctx, "one", "approve", Date.UTC(2026, 2, 10, 12));
    await seedReviewedProspect(fixture.database, ctx, "two", "reject", Date.UTC(2026, 2, 11, 12));
    await seedReviewedProspect(fixture.database, ctx, "three", "defer", Date.UTC(2026, 2, 12, 12));

    const result = await read.readMorningBrief(
      fixture.database,
      { subject: "owner-main" },
      { asOf: AS_OF, reviewWindowStart: WINDOW_START, reviewWindowEndExclusive: WINDOW_END },
    );

    assert.equal(result.status, "available");
    const brief = result.profiles[0];
    assert.equal(brief.status, "available");

    // Scope keeps the profile NAME and the persisted lifecycle apart.
    assert.equal(brief.scope.profileName, "Operating");
    assert.equal(brief.scope.profileLifecycle, "ready");
    assert.notEqual(brief.scope.profileName, brief.scope.profileLifecycle);
    assert.equal(brief.scope.activeConfigurationDigest, DIGEST_A);

    assert.equal(brief.schedule.status, "current");
    assert.equal(brief.schedule.reportedState, "enabled");
    assert.equal(brief.schedule.definition.cadence, "weekdays");
    assert.equal(brief.schedule.changeableFromThisSurface, false);

    assert.equal(brief.funnel.status, "current");
    assert.deepEqual(brief.funnel.decisions, { approve: 1, reject: 1, defer: 1 });
    assert.equal(brief.funnel.distinctReviewedProspectCount, 3);
    assert.equal(brief.funnel.countsExportReadyOutcomes, false);

    // The three review decisions must never surface as an Export-ready cohort.
    assert.equal(brief.weekly.status, "unavailable");
    assert.deepEqual(brief.weekly.reasonCodes, ["weekly_history_absent"]);
    assert.equal(brief.weekly.newlyExportReadyProspectCount, null);
    assert.deepEqual(brief.weekly.cohort, []);
    assert.equal(brief.losses, null);

    assert.equal(brief.handoff.status, "blocked");
    assert.equal(brief.handoff.counts, null);
    // 0023 persists restore results; with none applied the origin is a fact.
    assert.deepEqual(brief.workspace, {
      status: "current", origin: "original", restoreRef: null,
      restoredEffectsFenced: false, freshUpstreamActivationRef: null, reasonCodes: [],
    });

    assert.deepEqual(brief.greenfield.profiles, [], "inactive sibling profiles are excluded");
    assert.ok(Object.values(brief.authority).every((v) => v === false));
    assert.ok(Object.values(brief.effects).every((v) => v === 0));
  } finally {
    await fixture.dispose();
  }
});

test("a second workspace's rows never leak into another owner's brief", async () => {
  const fixture = await createD1Fixture("morning-brief-read-scope");
  try {
    await applyPhase4Migrations(fixture.database);
    const read = await load(fixture);
    const mine = await seedWorkspace(fixture.database, "mine");
    const other = await seedWorkspace(fixture.database, "other");
    await seedSchedule(fixture.database, mine);
    await seedSchedule(fixture.database, other);
    await seedOffer(fixture.database, mine);
    await seedOffer(fixture.database, other);
    await seedReviewedProspect(fixture.database, mine, "mine-a", "approve", Date.UTC(2026, 2, 10, 12));
    for (const key of ["other-a", "other-b", "other-c", "other-d"]) {
      await seedReviewedProspect(fixture.database, other, key, "approve", Date.UTC(2026, 2, 10, 12));
    }

    const result = await read.readMorningBrief(
      fixture.database, { subject: "owner-mine" },
      { asOf: AS_OF, reviewWindowStart: WINDOW_START, reviewWindowEndExclusive: WINDOW_END },
    );
    assert.equal(result.profiles[0].scope.workspaceId, "workspace-mine");
    assert.deepEqual(result.profiles[0].funnel.decisions, { approve: 1, reject: 0, defer: 0 });
    assert.equal(result.profiles[0].funnel.distinctReviewedProspectCount, 1);
    assert.equal(result.profiles[0].schedule.observationRef.id, "schedule-mine");

    const unknown = await read.readMorningBrief(
      fixture.database, { subject: "owner-nobody" },
      { asOf: AS_OF, reviewWindowStart: WINDOW_START, reviewWindowEndExclusive: WINDOW_END },
    );
    assert.equal(unknown.status, "unavailable");
    assert.deepEqual(unknown.reasonCodes, ["workspace_absent"]);
    assert.deepEqual(unknown.profiles, []);
  } finally {
    await fixture.dispose();
  }
});

test("active profiles across separate Product and Play paths all contribute in stable hierarchy order", async () => {
  const fixture = await createD1Fixture("morning-brief-read-multi-path");
  try {
    await applyPhase4Migrations(fixture.database);
    const read = await load(fixture);
    const ctx = await seedWorkspace(fixture.database, "paths");
    const { id, now } = ctx;
    await run(fixture.database, "INSERT INTO products (id, workspace_id, created_at, updated_at, revision, company_id, name, lifecycle) VALUES ('product-a-paths', ?, ?, ?, 1, ?, 'Second product', 'ready')", id("workspace"), now + 10, now + 10, id("company"));
    await run(fixture.database, "INSERT INTO market_plays (id, workspace_id, created_at, updated_at, revision, product_id, name, lifecycle) VALUES ('play-a-paths', ?, ?, ?, 1, 'product-a-paths', 'Second play', 'active')", id("workspace"), now + 11, now + 11);
    await run(fixture.database, "INSERT INTO customer_profiles (id, workspace_id, created_at, updated_at, revision, play_id, name, lifecycle, timezone, weekly_target) VALUES ('profile-a-paths', ?, ?, ?, 1, 'play-a-paths', 'Second profile', 'ready', 'America/Toronto', 7)", id("workspace"), now + 12, now + 12);
    await run(fixture.database, "INSERT INTO typed_configurations (id, workspace_id, created_at, updated_at, revision, company_id, owner_type, owner_id, kind, digest, manifest_json, active) VALUES ('config-a-paths', ?, ?, ?, 1, ?, 'profile', 'profile-a-paths', 'profile_effective', ?, '{}', 1)", id("workspace"), now + 13, now + 13, id("company"), DIGEST_B);

    const result = await read.readMorningBrief(
      fixture.database, { subject: "owner-paths" },
      { asOf: AS_OF, reviewWindowStart: WINDOW_START, reviewWindowEndExclusive: WINDOW_END },
    );
    assert.deepEqual(result.profiles.map((brief) => [
      brief.scope.productId, brief.scope.marketPlayId, brief.scope.profileId,
    ]), [
      ["product-a-paths", "play-a-paths", "profile-a-paths"],
      ["product-paths", "play-paths", "profile-paths"],
    ]);
  } finally { await fixture.dispose(); }
});

test("absent, paused, capability-blocked, drifted and stale schedules never report enabled", async () => {
  const fixture = await createD1Fixture("morning-brief-read-schedule");
  try {
    await applyPhase4Migrations(fixture.database);
    const read = await load(fixture);
    const ctx = await seedWorkspace(fixture.database, "sched");

    const absent = await read.readMorningBrief(
      fixture.database, { subject: "owner-sched" },
      { asOf: AS_OF, reviewWindowStart: WINDOW_START, reviewWindowEndExclusive: WINDOW_END },
    );
    assert.equal(absent.profiles[0].schedule.status, "unknown");
    assert.equal(absent.profiles[0].schedule.reportedState, null);
    assert.deepEqual(absent.profiles[0].schedule.reasonCodes, ["schedule_observation_absent"]);

    await seedSchedule(fixture.database, ctx, { executionState: "paused" });
    const paused = await read.readMorningBrief(
      fixture.database, { subject: "owner-sched" },
      { asOf: AS_OF, reviewWindowStart: WINDOW_START, reviewWindowEndExclusive: WINDOW_END },
    );
    assert.equal(paused.profiles[0].schedule.status, "current");
    assert.equal(paused.profiles[0].schedule.reportedState, "disabled");
  } finally {
    await fixture.dispose();
  }
});

test("a stale schedule observation is reported blocked, not enabled", async () => {
  const fixture = await createD1Fixture("morning-brief-read-stale");
  try {
    await applyPhase4Migrations(fixture.database);
    const read = await load(fixture);
    const ctx = await seedWorkspace(fixture.database, "stale");
    await seedSchedule(fixture.database, ctx, { updatedAt: Date.UTC(2026, 2, 14, 3, 0, 0) });
    const result = await read.readMorningBrief(
      fixture.database, { subject: "owner-stale" },
      { asOf: AS_OF, reviewWindowStart: WINDOW_START, reviewWindowEndExclusive: WINDOW_END },
    );
    assert.equal(result.profiles[0].schedule.status, "blocked");
    assert.equal(result.profiles[0].schedule.reportedState, null);
    assert.deepEqual(result.profiles[0].schedule.reasonCodes, ["schedule_observation_stale"]);
  } finally {
    await fixture.dispose();
  }
});

test("a schedule left on a superseded configuration is reported as drift, never enabled", async () => {
  const fixture = await createD1Fixture("morning-brief-read-drift");
  try {
    await applyPhase4Migrations(fixture.database);
    const read = await load(fixture);
    const ctx = await seedWorkspace(fixture.database, "drift");
    // The database forbids inserting a schedule whose digest differs from its
    // configuration, so real drift is a LATER activation superseding the one
    // the schedule was bound to.
    await seedSchedule(fixture.database, ctx);
    await run(fixture.database, "UPDATE typed_configurations SET active = 0 WHERE id = 'config-drift'");
    await run(fixture.database, "INSERT INTO typed_configurations (id, workspace_id, created_at, updated_at, revision, company_id, owner_type, owner_id, kind, digest, manifest_json, active) VALUES ('config-drift-2', 'workspace-drift', ?, ?, 1, 'company-drift', 'profile', 'profile-drift', 'profile_effective', ?, '{}', 1)", ctx.now + 10, ctx.now + 10, DIGEST_B);

    const result = await read.readMorningBrief(
      fixture.database, { subject: "owner-drift" },
      { asOf: AS_OF, reviewWindowStart: WINDOW_START, reviewWindowEndExclusive: WINDOW_END },
    );
    assert.equal(result.profiles[0].scope.activeConfigurationDigest, DIGEST_B);
    assert.equal(result.profiles[0].schedule.status, "blocked");
    assert.equal(result.profiles[0].schedule.reportedState, null);
    assert.deepEqual(result.profiles[0].schedule.reasonCodes, ["schedule_configuration_drift"]);
  } finally {
    await fixture.dispose();
  }
});

test("review counts are authoritative: repeated decisions on one Prospect never inflate the distinct count", async () => {
  const fixture = await createD1Fixture("morning-brief-read-duplicates");
  try {
    await applyPhase4Migrations(fixture.database);
    const read = await load(fixture);
    const ctx = await seedWorkspace(fixture.database, "dupe");
    await seedSchedule(fixture.database, ctx);
    await seedOffer(fixture.database, ctx);
    const p = await seedReviewedProspect(fixture.database, ctx, "dup", "defer", Date.UTC(2026, 2, 10, 12));

    // A second immutable decision on the SAME Prospect, inside the window.
    await run(fixture.database, "INSERT INTO audit_events (id, workspace_id, actor_type, actor_id, action, subject_type, subject_id, detail_json, created_at) VALUES (?, ?, 'owner', 'owner', 'prospect.review', 'prospect', ?, '{}', ?)", "audit-dup-2", "workspace-dupe", p("prospect"), Date.UTC(2026, 2, 13, 12));
    await run(fixture.database, "INSERT INTO authority_commands (id, workspace_id, created_at, updated_at, revision, command_type, idempotency_key, operation_digest, expected_revision, subject_type, subject_id, status) VALUES (?, ?, ?, ?, 1, 'prospect_review', ?, ?, 2, 'prospect', ?, 'accepted')", "cmd-dup-2", "workspace-dupe", Date.UTC(2026, 2, 13, 12), Date.UTC(2026, 2, 13, 12), "k-dup-2", hexOf("dup2", 9), p("prospect"));
    await run(fixture.database, "INSERT INTO prospect_review_decisions (id, workspace_id, prospect_id, assessment_id, decision, reason, review_at, expected_prospect_revision, authority_command_id, audit_event_id, decision_digest, operation_digest, idempotency_key, created_at) VALUES (?, ?, ?, ?, 'approve', 'synthetic', NULL, 2, ?, ?, ?, ?, ?, ?)", "review-dup-2", "workspace-dupe", p("prospect"), p("assess"), "cmd-dup-2", "audit-dup-2", hexOf("dup2", 10), hexOf("dup2", 11), "idem-dup-2", Date.UTC(2026, 2, 13, 12));

    const result = await read.readMorningBrief(
      fixture.database, { subject: "owner-dupe" },
      { asOf: AS_OF, reviewWindowStart: WINDOW_START, reviewWindowEndExclusive: WINDOW_END },
    );
    assert.deepEqual(result.profiles[0].funnel.decisions, { approve: 1, reject: 0, defer: 1 });
    // Two decisions, one Prospect.
    assert.equal(result.profiles[0].funnel.distinctReviewedProspectCount, 1);
    assert.equal(result.profiles[0].weekly.status, "unavailable");
  } finally {
    await fixture.dispose();
  }
});

test("decisions outside the supplied window are excluded and every persisted lifecycle is carried verbatim", async () => {
  const fixture = await createD1Fixture("morning-brief-read-window");
  try {
    await applyPhase4Migrations(fixture.database);
    const read = await load(fixture);
    const ctx = await seedWorkspace(fixture.database, "win");
    await seedSchedule(fixture.database, ctx);
    await seedOffer(fixture.database, ctx);
    await seedReviewedProspect(fixture.database, ctx, "before", "approve", Date.parse(WINDOW_START) - 1);
    await seedReviewedProspect(fixture.database, ctx, "atstart", "approve", Date.parse(WINDOW_START));
    await seedReviewedProspect(fixture.database, ctx, "atend", "reject", Date.parse(WINDOW_END));

    const result = await read.readMorningBrief(
      fixture.database, { subject: "owner-win" },
      { asOf: AS_OF, reviewWindowStart: WINDOW_START, reviewWindowEndExclusive: WINDOW_END },
    );
    // Start is inclusive, end is exclusive.
    assert.deepEqual(result.profiles[0].funnel.decisions, { approve: 1, reject: 0, defer: 0 });
    assert.equal(result.profiles[0].funnel.windowStart, WINDOW_START);
    assert.equal(result.profiles[0].funnel.windowEndExclusive, WINDOW_END);
  } finally {
    await fixture.dispose();
  }
});

test("only ready Profiles contribute; inactive persisted lifecycles are excluded", async () => {
  for (const lifecycle of ["draft", "ready", "paused", "archived"]) {
    const fixture = await createD1Fixture(`morning-brief-read-lifecycle-${lifecycle}`);
    try {
      await applyPhase4Migrations(fixture.database);
      const read = await load(fixture);
      await seedWorkspace(fixture.database, lifecycle, { lifecycle, profileName: "Operating" });
      const result = await read.readMorningBrief(
        fixture.database, { subject: `owner-${lifecycle}` },
        { asOf: AS_OF, reviewWindowStart: WINDOW_START, reviewWindowEndExclusive: WINDOW_END },
      );
      assert.equal(result.status, "available", lifecycle);
      if (lifecycle === "ready") {
        assert.equal(result.profiles.length, 1);
        assert.equal(result.profiles[0].scope.profileLifecycle, "ready");
        assert.equal(result.profiles[0].scope.profileName, "Operating");
      } else {
        assert.deepEqual(result.profiles, [], `${lifecycle} is not active`);
      }
    } finally {
      await fixture.dispose();
    }
  }
});

test("an owned workspace without an active profile configuration returns an empty brief", async () => {
  const fixture = await createD1Fixture("morning-brief-read-noconfig");
  try {
    await applyPhase4Migrations(fixture.database);
    const read = await load(fixture);
    await seedWorkspace(fixture.database, "noconf");
    await run(fixture.database, "UPDATE typed_configurations SET active = 0 WHERE id = 'config-noconf'");
    const result = await read.readMorningBrief(
      fixture.database, { subject: "owner-noconf" },
      { asOf: AS_OF, reviewWindowStart: WINDOW_START, reviewWindowEndExclusive: WINDOW_END },
    );
    assert.equal(result.status, "available");
    assert.equal(result.workspaceId, "workspace-noconf");
    assert.deepEqual(result.profiles, []);
  } finally {
    await fixture.dispose();
  }
});

test("malformed clocks and windows are rejected rather than silently coerced", async () => {
  const fixture = await createD1Fixture("morning-brief-read-clock");
  try {
    await applyPhase4Migrations(fixture.database);
    const read = await load(fixture);
    await seedWorkspace(fixture.database, "clock");
    const base = { asOf: AS_OF, reviewWindowStart: WINDOW_START, reviewWindowEndExclusive: WINDOW_END };
    for (const [name, patch] of [
      ["second-precision asOf", { asOf: "2026-03-16T03:59:59Z" }],
      ["non-instant window start", { reviewWindowStart: "2026-03-09" }],
      ["inverted window", { reviewWindowStart: WINDOW_END, reviewWindowEndExclusive: WINDOW_START }],
      ["equal window bounds", { reviewWindowStart: WINDOW_START, reviewWindowEndExclusive: WINDOW_START }],
    ]) {
      await assert.rejects(
        () => read.readMorningBrief(fixture.database, { subject: "owner-clock" }, { ...base, ...patch }),
        TypeError,
        name,
      );
    }
  } finally {
    await fixture.dispose();
  }
});

test("multi-profile reads sort active hierarchy paths and omit duplicate, inactive, malformed, and cross-workspace rows", async () => {
  const fixture = await createD1Fixture("morning-brief-read-adversarial-rows");
  try {
    const read = await load(fixture);
    const row = (profileId, patch = {}) => ({
      workspace_id: "workspace-owned",
      company_id: "company-one",
      product_id: "product-one",
      market_play_id: "play-one",
      profile_id: profileId,
      profile_name: `Profile ${profileId.slice(-1).toUpperCase()}`,
      profile_lifecycle: "ready",
      configuration_digest: DIGEST_A,
      ...patch,
    });
    const scopeRows = [
      row("profile-z", { product_id: "product-z", market_play_id: "play-z" }),
      row("profile-z", { product_id: "product-z", market_play_id: "play-z" }),
      row("profile-cross", { workspace_id: "workspace-other" }),
      row("profile-paused", { profile_lifecycle: "paused" }),
      row("bad/profile"),
      row("profile-malformed", { profile_name: "person@example.invalid" }),
      row("profile-a", { product_id: "product-a", market_play_id: "play-a" }),
    ];
    const database = {
      prepare(sql) {
        return {
          bind() {
            if (/SELECT w\.id AS workspace_id, w\.owner_subject AS owner_subject\s+FROM workspaces/u.test(sql)) {
              return { first: async () => ({ workspace_id: "workspace-owned", owner_subject: "owner-subject" }) };
            }
            // The read-only recovery reader re-admits the owner on every call.
            if (/^SELECT id FROM workspaces WHERE id=\? AND owner_subject=\?/u.test(sql)) {
              return { first: async () => ({ id: "workspace-owned" }) };
            }
            if (/JOIN workspace_companies/u.test(sql)) {
              return { all: async () => ({ results: scopeRows }) };
            }
            if (/FROM prospecting_schedules/u.test(sql)) return { first: async () => null };
            if (/GROUP BY prd\.decision/u.test(sql)) return { all: async () => ({ results: [] }) };
            if (/COUNT\(DISTINCT prd\.prospect_id\)/u.test(sql)) return { first: async () => ({ prospect_count: 0 }) };
            if (/FROM prospect_cooldowns/u.test(sql)) return { first: async () => ({ cooldown_count: 0 }) };
            return { first: async () => null, all: async () => ({ results: [] }) };
          },
        };
      },
    };

    const result = await read.readMorningBrief(
      database,
      { subject: "owner-subject" },
      { asOf: AS_OF, reviewWindowStart: WINDOW_START, reviewWindowEndExclusive: WINDOW_END },
    );
    assert.equal(result.status, "available");
    assert.deepEqual(result.profiles.map((brief) => brief.scope.profileId), ["profile-a", "profile-z"]);
    assert.equal(new Set(result.profiles.map((brief) => brief.scope.profileId)).size, 2);
    assert.ok(result.profiles.every((brief) => brief.scope.workspaceId === "workspace-owned"));
  } finally { await fixture.dispose(); }
});

test("the read module issues only SELECT statements and composes no effect seam", async () => {
  const source = await (await import("node:fs/promises"))
    .readFile(new URL("../domain/morning-brief-read.ts", import.meta.url), "utf8");

  for (const pattern of [
    /\bINSERT\s+INTO\b/i,
    /\bUPDATE\s+\w+\s+SET\b/i,
    /\bDELETE\s+FROM\b/i,
    /\bCREATE\s+(TABLE|INDEX|TRIGGER)\b/i,
    /\bALTER\s+TABLE\b/i,
    /\.batch\s*\(/,
    /BEGIN\s+TRANSACTION/i,
    /\bfetch\s*\(/,
    /gmail|twilio|sendgrid|nodemailer/i,
    /preparation\//,
  ]) {
    assert.doesNotMatch(source, pattern, `morning-brief-read.ts must not contain ${pattern}`);
  }

  const statements = source.match(/prepare\(\s*`?\s*(\w+)/g) ?? [];
  assert.ok(statements.length > 0, "expected prepared statements");
  for (const statement of statements) {
    assert.match(statement, /SELECT/i, `every prepared statement must be a SELECT: ${statement}`);
  }
});

test("all active sibling profiles contribute independently without mixing their funnels", async () => {
  const fixture = await createD1Fixture("morning-brief-read-sibling");
  try {
    await applyPhase4Migrations(fixture.database);
    const read = await load(fixture);
    const ctx = await seedWorkspace(fixture.database, "sib");
    await seedSchedule(fixture.database, ctx);
    await seedOffer(fixture.database, ctx);
    await seedReviewedProspect(fixture.database, ctx, "own", "approve", Date.UTC(2026, 2, 10, 12));

    // The same workspace's Greenfield profile also has reviewed Prospects.
    await run(fixture.database, "UPDATE customer_profiles SET lifecycle = 'ready' WHERE id = 'profile-greenfield-sib'");
    await run(fixture.database, "INSERT INTO typed_configurations (id, workspace_id, created_at, updated_at, revision, company_id, owner_type, owner_id, kind, digest, manifest_json, active) VALUES ('config-gf-sib', 'workspace-sib', ?, ?, 1, 'company-sib', 'profile', 'profile-greenfield-sib', 'profile_effective', ?, '{}', 1)", ctx.now, ctx.now, DIGEST_B);
    await seedOffer(fixture.database, ctx, "profile-greenfield", "config-gf", DIGEST_B);
    for (const key of ["gf-a", "gf-b", "gf-c"]) {
      await seedReviewedProspect(fixture.database, ctx, key, "reject", Date.UTC(2026, 2, 11, 12), "profile-greenfield", "config-gf", DIGEST_B);
    }

    const result = await read.readMorningBrief(
      fixture.database, { subject: "owner-sib" },
      { asOf: AS_OF, reviewWindowStart: WINDOW_START, reviewWindowEndExclusive: WINDOW_END },
    );
    assert.deepEqual(result.profiles.map((brief) => brief.scope.profileId), [
      "profile-greenfield-sib", "profile-sib",
    ]);
    const byProfile = new Map(result.profiles.map((brief) => [brief.scope.profileId, brief]));
    assert.deepEqual(byProfile.get("profile-sib").funnel.decisions, { approve: 1, reject: 0, defer: 0 });
    assert.equal(byProfile.get("profile-sib").funnel.distinctReviewedProspectCount, 1);
    assert.deepEqual(byProfile.get("profile-greenfield-sib").funnel.decisions, { approve: 0, reject: 3, defer: 0 });
    assert.equal(byProfile.get("profile-greenfield-sib").funnel.distinctReviewedProspectCount, 3);
  } finally {
    await fixture.dispose();
  }
});

test("a schedule whose authority command belongs to another workspace never surfaces that workspace's value", async () => {
  const fixture = await createD1Fixture("morning-brief-read-foreign-command");
  const FOREIGN_DIGEST = "f".repeat(64);
  try {
    await applyPhase4Migrations(fixture.database);
    const read = await load(fixture);
    const victim = await seedWorkspace(fixture.database, "victim");
    await seedWorkspace(fixture.database, "attacker");

    // The schema's FK on prospecting_schedules.authority_command_id references
    // authority_commands(id) alone, and no trigger fences it to the same
    // workspace, so a malformed row can point across workspaces.
    await run(fixture.database, "INSERT INTO authority_commands (id, workspace_id, created_at, updated_at, revision, command_type, idempotency_key, operation_digest, expected_revision, subject_type, subject_id, status) VALUES ('command-foreign', 'workspace-attacker', ?, ?, 1, 'prospecting_schedule', 'key-foreign', ?, 1, 'profile', 'profile-attacker', 'accepted')", victim.now, victim.now, FOREIGN_DIGEST);
    await run(
      fixture.database,
      `INSERT INTO prospecting_schedules
        (id, workspace_id, created_at, updated_at, revision, profile_id, configuration_id,
         configuration_digest, schedule_key, timezone, intended_local_time, utc_offset_minutes,
         cadence, next_run_at, last_successful_watermark, active, execution_state,
         authority_command_id, operation_digest, idempotency_key)
       VALUES ('schedule-victim', 'workspace-victim', ?, ?, 1, 'profile-victim', 'config-victim',
               ?, 'sk-victim', 'America/Toronto', '06:00', -240, 'weekdays', ?, NULL, 1, 'active',
               'command-foreign', ?, 'idem-victim')`,
      victim.now, Date.UTC(2026, 2, 16, 3, 0, 0), DIGEST_A,
      Date.UTC(2026, 2, 17, 10, 0, 0), DIGEST_B,
    );

    const result = await read.readMorningBrief(
      fixture.database, { subject: "owner-victim" },
      { asOf: AS_OF, reviewWindowStart: WINDOW_START, reviewWindowEndExclusive: WINDOW_END },
    );

    assert.equal(result.status, "available");
    assert.equal(result.profiles[0].scope.workspaceId, "workspace-victim");
    // The foreign digest must not reach the brief through any field.
    assert.ok(
      !JSON.stringify(result.profiles[0]).includes(FOREIGN_DIGEST),
      "another workspace's authority-command digest must never appear in the brief",
    );
    // A cross-workspace reference is not a usable observation: it is withheld.
    assert.equal(result.profiles[0].schedule.status, "unknown");
    assert.equal(result.profiles[0].schedule.reportedState, null);
    assert.equal(result.profiles[0].schedule.readinessRef, null);
    assert.deepEqual(result.profiles[0].schedule.reasonCodes, ["schedule_observation_absent"]);
  } finally {
    await fixture.dispose();
  }
});

// -- 07-05: persisted weekly history and restore origin ----------------------

const STATES_TO_EXPORT = ["Candidate", "Qualified", "Approved", "ContactReady", "PackageReady", "ExportReady"];

function sha(value) {
  return createHash("sha256").update(value).digest("hex");
}

/** Appends one contiguous immutable 0022 stream; returns the inserted rows. */
async function seedTransitions(database, workspaceId, prospectId, steps) {
  const rows = [];
  for (let index = 0; index < steps.length; index += 1) {
    const { state, at } = steps[index];
    const sequence = index + 1;
    const row = {
      id: `pte-${prospectId}-${sequence}`,
      operationDigest: sha(`operation:${workspaceId}:${prospectId}:${sequence}`),
      occurredAt: at,
    };
    await run(
      database,
      `INSERT INTO prospect_transition_events
        (id, workspace_id, prospect_id, sequence, event_kind, prior_state, new_state,
         expected_prospect_revision, actor_kind, actor_reference_digest, source_kind, reason_code,
         evidence_reference_id, evidence_reference_digest, idempotency_key, operation_digest,
         occurred_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, 'application', ?, 'qualification', 'synthetic', ?, ?, ?, ?, ?, ?)`,
      row.id, workspaceId, prospectId, sequence,
      sequence === 1 ? "prospect_created" : "state_transition",
      sequence === 1 ? null : steps[index - 1].state, state,
      sha(`actor:${prospectId}`), `evidence-${prospectId}-${sequence}`, sha(`evidence:${prospectId}:${sequence}`),
      `idem-pte-${prospectId}-${sequence}`, row.operationDigest, at, at,
    );
    rows.push(row);
  }
  return rows;
}

function exportSteps(exportAt, extra = []) {
  const base = Date.UTC(2026, 1, 1, 5);
  return [
    ...STATES_TO_EXPORT.slice(0, -1).map((state, index) => ({ state, at: base + index * 86_400_000 })),
    { state: "ExportReady", at: exportAt },
    ...extra,
  ];
}

/** Records every prepared statement and refuses any batch or exec seam. */
function recordingDatabase(database, statements) {
  return new Proxy(database, {
    get(target, property) {
      if (property === "prepare") return (sql) => { statements.push(sql); return target.prepare(sql); };
      if (property === "batch" || property === "exec") return () => { throw new Error(`write seam ${String(property)} used`); };
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

const EVIDENCE_TABLES = [
  "prospect_transition_events", "handoff_recovery_commands", "handoff_recovery_audit_events",
  "handoff_schedule_observations", "handoff_weekly_reports", "handoff_weekly_report_entries",
  "recovery_restore_results", "profile_configuration_activations", "prospecting_schedules", "audit_events",
];

async function evidenceCounts(database) {
  const counts = {};
  for (const table of EVIDENCE_TABLES) {
    counts[table] = Number((await database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).first()).count);
  }
  const schedule = await database.prepare("SELECT COALESCE(SUM(revision), 0) AS revisions FROM prospecting_schedules").first();
  counts.scheduleRevisions = Number(schedule.revisions);
  return counts;
}

test("the weekly cohort is projected from persisted first Export-ready transitions with explicit evidence gaps and zero writes", async () => {
  const fixture = await createD1Fixture("morning-brief-read-weekly-history");
  try {
    await applyPhase4Migrations(fixture.database);
    const read = await load(fixture);
    const ctx = await seedWorkspace(fixture.database, "main");
    await seedSchedule(fixture.database, ctx);
    await seedOffer(fixture.database, ctx);
    const ws = "workspace-main";
    const fresh = await seedReviewedProspect(fixture.database, ctx, "fresh", "approve", Date.UTC(2026, 2, 10, 12));
    const earlier = await seedReviewedProspect(fixture.database, ctx, "earlier", "approve", Date.UTC(2026, 2, 2, 12));
    const pending = await seedReviewedProspect(fixture.database, ctx, "pending", "approve", Date.UTC(2026, 2, 11, 12));
    const late = await seedReviewedProspect(fixture.database, ctx, "late", "approve", Date.UTC(2026, 2, 12, 12));

    // First-ever ExportReady inside the Toronto week (2026-03-10 10:00 EDT).
    const freshRows = await seedTransitions(fixture.database, ws, fresh("prospect"), exportSteps(Date.UTC(2026, 2, 10, 14)));
    // First ExportReady in the previous week, then reversal and re-export this week.
    await seedTransitions(fixture.database, ws, earlier("prospect"), exportSteps(Date.UTC(2026, 2, 3, 15), [
      { state: "NeedsReview", at: Date.UTC(2026, 2, 10, 12) },
      { state: "ExportReady", at: Date.UTC(2026, 2, 11, 12) },
    ]));
    // ContactReady never implies ExportReady.
    await seedTransitions(fixture.database, ws, pending("prospect"), exportSteps(0).slice(0, 4));
    // An ExportReady after the evaluation instant is not yet history.
    await seedTransitions(fixture.database, ws, late("prospect"), exportSteps(Date.parse(AS_OF) + 3_600_000));

    const before = await evidenceCounts(fixture.database);
    const statements = [];
    const result = await read.readMorningBrief(
      recordingDatabase(fixture.database, statements),
      { subject: "owner-main" },
      { asOf: AS_OF, reviewWindowStart: WINDOW_START, reviewWindowEndExclusive: WINDOW_END },
    );

    assert.equal(result.status, "available");
    const brief = result.profiles[0];
    assert.equal(brief.weekly.status, "current");
    assert.equal(brief.weekly.week.start.localDate, "2026-03-09");
    assert.equal(brief.weekly.newlyExportReadyProspectCount, 1);
    assert.equal(brief.weekly.remainingProspectsToTarget, 6);
    assert.equal(brief.weekly.distinctStableProspectCount, 4);
    assert.deepEqual(brief.weekly.cohort, [{
      prospectId: fresh("prospect"),
      firstExportReadyEventId: freshRows[5].id,
      occurredAt: "2026-03-10T14:00:00.000Z",
      localDate: "2026-03-10",
      utcOffsetMinutes: -240,
      auditRef: { id: freshRows[5].id, digest: freshRows[5].operationDigest },
    }]);
    // Contact linkage and loss facts are not persisted: unknown, never zero.
    assert.equal(brief.weekly.distinctStableContactCount, null);
    assert.equal(brief.losses, null);
    assert.deepEqual(brief.weeklyEvidenceGaps, ["contact_links_not_persisted", "loss_events_not_persisted"]);
    // Review funnel stays a separate Phase 4 fact.
    assert.equal(brief.funnel.countsExportReadyOutcomes, false);

    assert.ok(statements.length > 0);
    for (const sql of statements) assert.match(sql, /^\s*SELECT\b/iu, sql);
    assert.deepEqual(await evidenceCounts(fixture.database), before, "the brief read wrote nothing");
    assert.ok(Object.values(brief.effects).every((value) => value === 0));
  } finally {
    await fixture.dispose();
  }
});

test("another workspace's transition history never enters this owner's weekly cohort", async () => {
  const fixture = await createD1Fixture("morning-brief-read-weekly-scope");
  try {
    await applyPhase4Migrations(fixture.database);
    const read = await load(fixture);
    const owned = await seedWorkspace(fixture.database, "owned");
    await seedOffer(fixture.database, owned);
    const foreign = await seedWorkspace(fixture.database, "foreign");
    await seedOffer(fixture.database, foreign);
    const mine = await seedReviewedProspect(fixture.database, owned, "mine", "approve", Date.UTC(2026, 2, 10, 12));
    const theirs = await seedReviewedProspect(fixture.database, foreign, "theirs", "approve", Date.UTC(2026, 2, 10, 12));
    await seedTransitions(fixture.database, "workspace-owned", mine("prospect"), exportSteps(Date.UTC(2026, 2, 12, 14)));
    await seedTransitions(fixture.database, "workspace-foreign", theirs("prospect"), exportSteps(Date.UTC(2026, 2, 11, 14)));

    const result = await read.readMorningBrief(
      fixture.database, { subject: "owner-owned" },
      { asOf: AS_OF, reviewWindowStart: WINDOW_START, reviewWindowEndExclusive: WINDOW_END },
    );
    const brief = result.profiles[0];
    assert.equal(brief.weekly.status, "current");
    assert.deepEqual(brief.weekly.cohort.map((entry) => entry.prospectId), [mine("prospect")]);
    assert.equal(brief.weekly.distinctStableProspectCount, 1);
  } finally {
    await fixture.dispose();
  }
});

test("a profile with no Prospects reports a complete, empty weekly cohort", async () => {
  const fixture = await createD1Fixture("morning-brief-read-weekly-empty");
  try {
    await applyPhase4Migrations(fixture.database);
    const read = await load(fixture);
    await seedWorkspace(fixture.database, "empty");
    const result = await read.readMorningBrief(
      fixture.database, { subject: "owner-empty" },
      { asOf: AS_OF, reviewWindowStart: WINDOW_START, reviewWindowEndExclusive: WINDOW_END },
    );
    const brief = result.profiles[0];
    assert.equal(brief.weekly.status, "current");
    assert.equal(brief.weekly.newlyExportReadyProspectCount, 0);
    assert.equal(brief.weekly.remainingProspectsToTarget, 7);
    assert.deepEqual(brief.weekly.cohort, []);
    assert.equal(brief.losses, null, "an empty history still cannot report zero losses it never records");
  } finally {
    await fixture.dispose();
  }
});

async function seedActivation(database, ctx, key, createdAt) {
  const { id } = ctx;
  const ws = id("workspace");
  await run(database, "INSERT INTO audit_events (id, workspace_id, actor_type, actor_id, action, subject_type, subject_id, detail_json, created_at) VALUES (?, ?, 'owner', 'owner', 'profile.activate', 'profile', ?, '{}', ?)", `audit-${key}`, ws, id("profile"), createdAt);
  for (const kind of ["candidate", "activation"]) {
    await run(database, "INSERT INTO authority_commands (id, workspace_id, created_at, updated_at, revision, command_type, idempotency_key, operation_digest, expected_revision, subject_type, subject_id, status) VALUES (?, ?, ?, ?, 1, 'profile_activation', ?, ?, 1, 'profile', ?, 'accepted')", `cmd-${kind}-${key}`, ws, createdAt, createdAt, `k-${kind}-${key}`, sha(`${kind}:${key}`), id("profile"));
  }
  // A Phase 4 candidate names an inactive profile configuration of its own.
  await run(database, "INSERT INTO typed_configurations (id, workspace_id, created_at, updated_at, revision, company_id, owner_type, owner_id, kind, digest, manifest_json, active) VALUES (?, ?, ?, ?, 1, ?, 'profile', ?, 'profile_effective', ?, '{}', 0)", `config-${key}`, ws, createdAt, createdAt, id("company"), id("profile"), sha(`config:${key}`));
  await run(database, "INSERT INTO profile_configuration_candidates (id, workspace_id, created_at, updated_at, revision, profile_id, configuration_id, predecessor_configuration_id, authority_command_id, audit_event_id, candidate_digest, status) VALUES (?, ?, ?, ?, 1, ?, ?, NULL, ?, ?, ?, 'candidate')", `candidate-${key}`, ws, createdAt, createdAt, id("profile"), `config-${key}`, `cmd-candidate-${key}`, `audit-${key}`, sha(`candidate-digest:${key}`));
  const operationDigest = sha(`activation-digest:${key}`);
  await run(database, "INSERT INTO profile_configuration_activations (id, workspace_id, profile_id, candidate_id, previous_configuration_id, configuration_id, authority_command_id, audit_event_id, operation_digest, created_at) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?)", `activation-${key}`, ws, id("profile"), `candidate-${key}`, `config-${key}`, `cmd-activation-${key}`, `audit-${key}`, operationDigest, createdAt);
  return { id: `activation-${key}`, digest: operationDigest };
}

async function seedAppliedRestore(database, ctx, completedAt) {
  const { id } = ctx;
  const ws = id("workspace");
  const owner = (await database.prepare("SELECT owner_subject FROM workspaces WHERE id=?").bind(ws).first()).owner_subject;
  const command = (key, kind) => database.prepare("INSERT INTO handoff_recovery_commands (id,workspace_id,owner_subject,command_kind,idempotency_key,operation_digest,expected_revision,result_kind,result_id,created_at) VALUES (?,?,?,?,?,?,0,'synthetic',?,?)")
    .bind(`cmd-${key}`, ws, owner, kind, `key-${key}`, sha(`restore-command:${key}`), key, completedAt);
  const resultDigest = sha("restore-result");
  await database.batch([
    command("dry", "dry_run.record"),
    command("lock", "restore_lock.acquire"),
    database.prepare("INSERT INTO recovery_dry_runs (id,workspace_id,command_id,source_workspace_id,archive_manifest_digest,archive_ciphertext_sha256,archive_schema_version,outcome,reason_code,nonce_digest,expires_at,target_state_digest,invariant_digest,dry_run_digest,created_at) VALUES ('dry-run',?,'cmd-dry','source-workspace',?,?,'prospector/portable-workspace-schema/v1','accepted','verified',?,?,?,?,?,?)")
      .bind(ws, sha("m"), sha("c"), sha("n"), completedAt + 60_000, sha("t"), sha("i"), sha("d"), completedAt),
    database.prepare("INSERT INTO recovery_restore_locks (id,workspace_id,dry_run_id,command_id,nonce_digest,acquired_at,created_at) VALUES ('restore-lock',?,'dry-run','cmd-lock',?,?,?)").bind(ws, sha("n"), completedAt, completedAt),
    command("result", "restore_result.record"),
    database.prepare("INSERT INTO recovery_restore_results (id,workspace_id,lock_id,command_id,outcome,reason_code,restored_record_count,restored_object_count,result_digest,schedules_enabled,effects_enabled,completed_at,created_at) VALUES ('restore-result',?,'restore-lock','cmd-result','applied','restored',1,1,?,0,0,?,?)")
      .bind(ws, resultDigest, completedAt, completedAt),
  ]);
  return { id: "restore-result", digest: resultDigest };
}

test("a restored workspace stays DisabledPendingFreshUpstreamActivation until a fresh Phase 4 activation, read with zero writes", async () => {
  const fixture = await createD1Fixture("morning-brief-read-restored");
  try {
    await applyPhase4Migrations(fixture.database);
    const read = await load(fixture);
    const ctx = await seedWorkspace(fixture.database, "main");
    // The source carried an activation and the restored target arrives with schedules disabled.
    await seedActivation(fixture.database, ctx, "source", Date.UTC(2026, 2, 1, 12));
    await seedSchedule(fixture.database, ctx, { active: 0, executionState: "paused" });
    const restoreRef = await seedAppliedRestore(fixture.database, ctx, Date.UTC(2026, 2, 15, 12));
    const options = { asOf: AS_OF, reviewWindowStart: WINDOW_START, reviewWindowEndExclusive: WINDOW_END };

    const before = await evidenceCounts(fixture.database);
    const statements = [];
    const pending = (await read.readMorningBrief(recordingDatabase(fixture.database, statements), { subject: "owner-main" }, options)).profiles[0];
    assert.deepEqual(pending.workspace, {
      status: "current", origin: "restored", restoreRef,
      restoredEffectsFenced: true, freshUpstreamActivationRef: null, reasonCodes: [],
    });
    assert.equal(pending.schedule.status, "disabled_pending_fresh_upstream_activation");
    assert.equal(pending.schedule.reportedState, "disabled");
    assert.ok(pending.schedule.reasonCodes.includes("workspace_restored_pending_fresh_upstream_activation"));
    assert.equal(pending.schedule.changeableFromThisSurface, false);
    for (const sql of statements) assert.match(sql, /^\s*SELECT\b/iu, sql);
    assert.deepEqual(await evidenceCounts(fixture.database), before, "the brief read wrote nothing");

    // Only Phase 4 can change this: a fresh activation after the restore plus
    // its re-enabled schedule is then reported, never caused, by the brief.
    const activationRef = await seedActivation(fixture.database, ctx, "fresh", Date.UTC(2026, 2, 15, 18));
    await run(fixture.database, "UPDATE prospecting_schedules SET active=1, execution_state='active', revision=revision+1, updated_at=? WHERE id=?", Date.UTC(2026, 2, 16, 3), ctx.id("schedule"));
    const activated = (await read.readMorningBrief(fixture.database, { subject: "owner-main" }, options)).profiles[0];
    assert.equal(activated.workspace.origin, "restored");
    assert.deepEqual(activated.workspace.freshUpstreamActivationRef, activationRef);
    assert.equal(activated.schedule.status, "current");
    assert.equal(activated.schedule.reportedState, "enabled");
  } finally {
    await fixture.dispose();
  }
});

test("a restore completed after the evaluation instant is not yet the workspace origin", async () => {
  const fixture = await createD1Fixture("morning-brief-read-restore-future");
  try {
    await applyPhase4Migrations(fixture.database);
    const read = await load(fixture);
    const ctx = await seedWorkspace(fixture.database, "main");
    await seedAppliedRestore(fixture.database, ctx, Date.parse(AS_OF) + 60_000);
    const brief = (await read.readMorningBrief(fixture.database, { subject: "owner-main" }, {
      asOf: AS_OF, reviewWindowStart: WINDOW_START, reviewWindowEndExclusive: WINDOW_END,
    })).profiles[0];
    assert.equal(brief.status, "available");
    assert.equal(brief.workspace.origin, "original");
  } finally {
    await fixture.dispose();
  }
});

/** An accepted dry run and its restore lock, with no restore result yet. */
async function seedOpenRestoreLock(database, ctx, acquiredAt) {
  const { id } = ctx;
  const ws = id("workspace");
  const owner = (await database.prepare("SELECT owner_subject FROM workspaces WHERE id=?").bind(ws).first()).owner_subject;
  const command = (key, kind) => database.prepare("INSERT INTO handoff_recovery_commands (id,workspace_id,owner_subject,command_kind,idempotency_key,operation_digest,expected_revision,result_kind,result_id,created_at) VALUES (?,?,?,?,?,?,0,'synthetic',?,?)")
    .bind(`cmd-${key}`, ws, owner, kind, `key-${key}`, sha(`restore-command:${key}`), key, acquiredAt);
  await database.batch([
    command("dry", "dry_run.record"),
    command("lock", "restore_lock.acquire"),
    database.prepare("INSERT INTO recovery_dry_runs (id,workspace_id,command_id,source_workspace_id,archive_manifest_digest,archive_ciphertext_sha256,archive_schema_version,outcome,reason_code,nonce_digest,expires_at,target_state_digest,invariant_digest,dry_run_digest,created_at) VALUES ('dry-run',?,'cmd-dry','source-workspace',?,?,'prospector/portable-workspace-schema/v1','accepted','verified',?,?,?,?,?,?)")
      .bind(ws, sha("m"), sha("c"), sha("n"), acquiredAt + 60_000, sha("t"), sha("i"), sha("d"), acquiredAt),
    database.prepare("INSERT INTO recovery_restore_locks (id,workspace_id,dry_run_id,command_id,nonce_digest,acquired_at,created_at) VALUES ('restore-lock',?,'dry-run','cmd-lock',?,?,?)").bind(ws, sha("n"), acquiredAt, acquiredAt),
  ]);
}

async function recordRestoreResult(database, ctx, outcome, completedAt) {
  const { id } = ctx;
  const ws = id("workspace");
  const owner = (await database.prepare("SELECT owner_subject FROM workspaces WHERE id=?").bind(ws).first()).owner_subject;
  const counts = outcome === "applied" ? 1 : 0;
  await database.batch([
    database.prepare("INSERT INTO handoff_recovery_commands (id,workspace_id,owner_subject,command_kind,idempotency_key,operation_digest,expected_revision,result_kind,result_id,created_at) VALUES ('cmd-result',?,?,'restore_result.record','key-result',?,0,'synthetic','result',?)")
      .bind(ws, owner, sha("restore-command:result"), completedAt),
    database.prepare("INSERT INTO recovery_restore_results (id,workspace_id,lock_id,command_id,outcome,reason_code,restored_record_count,restored_object_count,result_digest,schedules_enabled,effects_enabled,completed_at,created_at) VALUES ('restore-result',?,'restore-lock','cmd-result',?,?,?,?,?,0,0,?,?)")
      .bind(ws, outcome, outcome === "applied" ? "restored" : "rolled_back", counts, counts, sha(`restore-result:${outcome}`), completedAt, completedAt),
  ]);
}

const IN_PROGRESS_WORKSPACE = Object.freeze({
  status: "unavailable", origin: null, restoreRef: null,
  restoredEffectsFenced: true, freshUpstreamActivationRef: null,
  reasonCodes: ["workspace_restore_in_progress"],
});

test("an open restore lock with no result reports a restore in progress with the effects fence closed, never an original workspace", async () => {
  const fixture = await createD1Fixture("morning-brief-read-restore-in-progress");
  try {
    await applyPhase4Migrations(fixture.database);
    const read = await load(fixture);
    const ctx = await seedWorkspace(fixture.database, "main");
    await seedSchedule(fixture.database, ctx);
    await seedOpenRestoreLock(fixture.database, ctx, Date.UTC(2026, 2, 15, 12));
    const options = { asOf: AS_OF, reviewWindowStart: WINDOW_START, reviewWindowEndExclusive: WINDOW_END };

    const before = await evidenceCounts(fixture.database);
    const statements = [];
    const brief = (await read.readMorningBrief(recordingDatabase(fixture.database, statements), { subject: "owner-main" }, options)).profiles[0];
    assert.equal(brief.status, "available");
    assert.deepEqual(brief.workspace, IN_PROGRESS_WORKSPACE);
    // The schedule row is active upstream, but a half-imported target cannot
    // vouch for it: the projection is blocked, never a current enabled state.
    assert.equal(brief.schedule.status, "blocked");
    assert.equal(brief.schedule.reportedState, null);
    assert.ok(brief.schedule.reasonCodes.includes("workspace_restore_in_progress"));
    for (const sql of statements) assert.match(sql, /^\s*SELECT\b/iu, sql);
    assert.deepEqual(await evidenceCounts(fixture.database), before, "the brief read wrote nothing");

    // A lock acquired after the evaluation instant is not yet in progress then.
    const earlier = (await read.readMorningBrief(fixture.database, { subject: "owner-main" }, {
      asOf: "2026-03-15T11:59:59.999Z", reviewWindowStart: WINDOW_START, reviewWindowEndExclusive: WINDOW_END,
    })).profiles[0];
    assert.equal(earlier.workspace.origin, "original");
  } finally {
    await fixture.dispose();
  }
});

test("a restore whose result completes after the evaluation instant was still in progress at that instant", async () => {
  const fixture = await createD1Fixture("morning-brief-read-restore-result-after-as-of");
  try {
    await applyPhase4Migrations(fixture.database);
    const read = await load(fixture);
    const ctx = await seedWorkspace(fixture.database, "main");
    await seedOpenRestoreLock(fixture.database, ctx, Date.UTC(2026, 2, 15, 12));
    await recordRestoreResult(fixture.database, ctx, "applied", Date.parse(AS_OF) + 60_000);
    const brief = (await read.readMorningBrief(fixture.database, { subject: "owner-main" }, {
      asOf: AS_OF, reviewWindowStart: WINDOW_START, reviewWindowEndExclusive: WINDOW_END,
    })).profiles[0];
    assert.deepEqual(brief.workspace, IN_PROGRESS_WORKSPACE);
  } finally {
    await fixture.dispose();
  }
});

test("a rolled-back restore closes its lock and leaves the workspace original", async () => {
  const fixture = await createD1Fixture("morning-brief-read-restore-rolled-back");
  try {
    await applyPhase4Migrations(fixture.database);
    const read = await load(fixture);
    const ctx = await seedWorkspace(fixture.database, "main");
    await seedOpenRestoreLock(fixture.database, ctx, Date.UTC(2026, 2, 15, 12));
    await recordRestoreResult(fixture.database, ctx, "rolled_back", Date.UTC(2026, 2, 15, 13));
    const brief = (await read.readMorningBrief(fixture.database, { subject: "owner-main" }, {
      asOf: AS_OF, reviewWindowStart: WINDOW_START, reviewWindowEndExclusive: WINDOW_END,
    })).profiles[0];
    assert.equal(brief.workspace.status, "current");
    assert.equal(brief.workspace.origin, "original");
    assert.equal(brief.workspace.restoredEffectsFenced, false);
  } finally {
    await fixture.dispose();
  }
});

test("a restored workspace whose active schedule row is rejected reports unknown, never a definite disabled state", async () => {
  const fixture = await createD1Fixture("morning-brief-read-restored-rejected-schedule");
  const FOREIGN_DIGEST = "f".repeat(64);
  try {
    await applyPhase4Migrations(fixture.database);
    const read = await load(fixture);
    const victim = await seedWorkspace(fixture.database, "victim");
    await seedWorkspace(fixture.database, "attacker");
    await seedAppliedRestore(fixture.database, victim, Date.UTC(2026, 2, 15, 12));
    // The 0023 fence only holds when the result is inserted; an active row can
    // be written afterwards. This one points at another workspace's command.
    await run(fixture.database, "INSERT INTO authority_commands (id, workspace_id, created_at, updated_at, revision, command_type, idempotency_key, operation_digest, expected_revision, subject_type, subject_id, status) VALUES ('command-foreign', 'workspace-attacker', ?, ?, 1, 'prospecting_schedule', 'key-foreign', ?, 1, 'profile', 'profile-attacker', 'accepted')", victim.now, victim.now, FOREIGN_DIGEST);
    await run(
      fixture.database,
      `INSERT INTO prospecting_schedules
        (id, workspace_id, created_at, updated_at, revision, profile_id, configuration_id,
         configuration_digest, schedule_key, timezone, intended_local_time, utc_offset_minutes,
         cadence, next_run_at, last_successful_watermark, active, execution_state,
         authority_command_id, operation_digest, idempotency_key)
       VALUES ('schedule-victim', 'workspace-victim', ?, ?, 1, 'profile-victim', 'config-victim',
               ?, 'sk-victim', 'America/Toronto', '06:00', -240, 'weekdays', ?, NULL, 1, 'active',
               'command-foreign', ?, 'idem-victim')`,
      victim.now, Date.UTC(2026, 2, 16, 3, 0, 0), DIGEST_A,
      Date.UTC(2026, 2, 17, 10, 0, 0), DIGEST_B,
    );
    // The same holds for a same-workspace active row with a malformed clock.
    const malformedClock = await seedWorkspace(fixture.database, "clock");
    await seedSchedule(fixture.database, malformedClock, { updatedAt: -1 });
    // seedAppliedRestore uses fixed ids, so the second restore gets its own.
    const owner = "owner-clock";
    const completedAt = Date.UTC(2026, 2, 15, 12);
    await run(fixture.database, "UPDATE prospecting_schedules SET active=0 WHERE id='schedule-clock'");
    await fixture.database.batch([
      ...["dry2:dry_run.record", "lock2:restore_lock.acquire", "result2:restore_result.record"].map((entry) => {
        const [key, kind] = entry.split(":");
        return fixture.database.prepare("INSERT INTO handoff_recovery_commands (id,workspace_id,owner_subject,command_kind,idempotency_key,operation_digest,expected_revision,result_kind,result_id,created_at) VALUES (?,?,?,?,?,?,0,'synthetic',?,?)")
          .bind(`cmd-${key}`, "workspace-clock", owner, kind, `key-${key}`, sha(`restore-command:${key}`), key, completedAt);
      }),
      fixture.database.prepare("INSERT INTO recovery_dry_runs (id,workspace_id,command_id,source_workspace_id,archive_manifest_digest,archive_ciphertext_sha256,archive_schema_version,outcome,reason_code,nonce_digest,expires_at,target_state_digest,invariant_digest,dry_run_digest,created_at) VALUES ('dry-run-2','workspace-clock','cmd-dry2','source-workspace',?,?,'prospector/portable-workspace-schema/v1','accepted','verified',?,?,?,?,?,?)")
        .bind(sha("m"), sha("c"), sha("n2"), completedAt + 60_000, sha("t"), sha("i"), sha("d"), completedAt),
      fixture.database.prepare("INSERT INTO recovery_restore_locks (id,workspace_id,dry_run_id,command_id,nonce_digest,acquired_at,created_at) VALUES ('restore-lock-2','workspace-clock','dry-run-2','cmd-lock2',?,?,?)").bind(sha("n2"), completedAt, completedAt),
      fixture.database.prepare("INSERT INTO recovery_restore_results (id,workspace_id,lock_id,command_id,outcome,reason_code,restored_record_count,restored_object_count,result_digest,schedules_enabled,effects_enabled,completed_at,created_at) VALUES ('restore-result-2','workspace-clock','restore-lock-2','cmd-result2','applied','restored',1,1,?,0,0,?,?)")
        .bind(sha("restore-result-2"), completedAt, completedAt),
    ]);
    await run(fixture.database, "UPDATE prospecting_schedules SET active=1, revision=revision+1 WHERE id='schedule-clock'");

    for (const subject of ["owner-victim", "owner-clock"]) {
      const brief = (await read.readMorningBrief(fixture.database, { subject }, {
        asOf: AS_OF, reviewWindowStart: WINDOW_START, reviewWindowEndExclusive: WINDOW_END,
      })).profiles[0];
      assert.equal(brief.workspace.origin, "restored", subject);
      assert.equal(brief.workspace.restoredEffectsFenced, true, subject);
      assert.equal(brief.schedule.status, "unknown", subject);
      assert.equal(brief.schedule.reportedState, null, subject);
      assert.equal(brief.schedule.readinessRef, null, subject);
      assert.deepEqual(brief.schedule.reasonCodes, [
        "schedule_observation_absent",
        "workspace_restored_pending_fresh_upstream_activation",
      ], subject);
      assert.ok(!JSON.stringify(brief).includes(FOREIGN_DIGEST), subject);
    }
  } finally {
    await fixture.dispose();
  }
});

test("the brief composes only the read-only handoff recovery reader", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../domain/morning-brief-read.ts", import.meta.url), "utf8");
  assert.match(source, /\bcreateD1HandoffRecoveryReader\b/u);
  assert.doesNotMatch(source, /\bcreateD1HandoffRecoveryRepository\b/u);
  assert.doesNotMatch(source, /\.record[A-Z]\w*\(|acquireRestoreLock/u);

  const fixture = await createD1Fixture("morning-brief-read-reader-surface");
  try {
    await applyPhase4Migrations(fixture.database);
    await seedWorkspace(fixture.database, "main");
    const recovery = await fixture.vite.ssrLoadModule(new URL("../domain/handoff-recovery-repository.ts", import.meta.url).pathname);
    const reader = recovery.createD1HandoffRecoveryReader(fixture.database, { workspaceId: "workspace-main", ownerSubject: "owner-main" });
    assert.equal(Object.isFrozen(reader), true);
    const methods = Object.keys(reader).sort();
    assert.ok(methods.length > 0);
    for (const method of methods) assert.match(method, /^read[A-Z]/u, method);
    await assert.rejects(
      recovery.createD1HandoffRecoveryReader(fixture.database, { workspaceId: "workspace-main", ownerSubject: "someone-else" }).readRestoreOrigin({ throughAt: Date.parse(AS_OF) }),
      /not_admitted/u,
    );
  } finally {
    await fixture.dispose();
  }
});
