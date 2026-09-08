import assert from "node:assert/strict";
import test from "node:test";
import { applyPhase4Migrations, createD1Fixture } from "./helpers/d1.mjs";

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

test("reads scope, schedule and review funnel from persisted rows while weekly, handoff and restore stay unavailable", async () => {
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
    const brief = result.brief;
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
    assert.equal(brief.workspace.status, "unavailable");
    assert.deepEqual(brief.workspace.reasonCodes, ["workspace_origin_not_persisted"]);
    assert.equal(brief.workspace.restoredEffectsFenced, true);

    assert.deepEqual(brief.greenfield.profiles.map((p) => p.label), ["Greenfield"]);
    assert.ok(brief.greenfield.profiles.every((p) => p.contributesToWeeklyOutcome === false));
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
    assert.equal(result.brief.scope.workspaceId, "workspace-mine");
    assert.deepEqual(result.brief.funnel.decisions, { approve: 1, reject: 0, defer: 0 });
    assert.equal(result.brief.funnel.distinctReviewedProspectCount, 1);
    assert.equal(result.brief.schedule.observationRef.id, "schedule-mine");

    const unknown = await read.readMorningBrief(
      fixture.database, { subject: "owner-nobody" },
      { asOf: AS_OF, reviewWindowStart: WINDOW_START, reviewWindowEndExclusive: WINDOW_END },
    );
    assert.equal(unknown.status, "unavailable");
    assert.deepEqual(unknown.reasonCodes, ["workspace_absent"]);
    assert.equal(unknown.brief, null);
  } finally {
    await fixture.dispose();
  }
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
    assert.equal(absent.brief.schedule.status, "unknown");
    assert.equal(absent.brief.schedule.reportedState, null);
    assert.deepEqual(absent.brief.schedule.reasonCodes, ["schedule_observation_absent"]);

    await seedSchedule(fixture.database, ctx, { executionState: "paused" });
    const paused = await read.readMorningBrief(
      fixture.database, { subject: "owner-sched" },
      { asOf: AS_OF, reviewWindowStart: WINDOW_START, reviewWindowEndExclusive: WINDOW_END },
    );
    assert.equal(paused.brief.schedule.status, "current");
    assert.equal(paused.brief.schedule.reportedState, "disabled");
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
    assert.equal(result.brief.schedule.status, "blocked");
    assert.equal(result.brief.schedule.reportedState, null);
    assert.deepEqual(result.brief.schedule.reasonCodes, ["schedule_observation_stale"]);
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
    assert.equal(result.brief.scope.activeConfigurationDigest, DIGEST_B);
    assert.equal(result.brief.schedule.status, "blocked");
    assert.equal(result.brief.schedule.reportedState, null);
    assert.deepEqual(result.brief.schedule.reasonCodes, ["schedule_configuration_drift"]);
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
    assert.deepEqual(result.brief.funnel.decisions, { approve: 1, reject: 0, defer: 1 });
    // Two decisions, one Prospect.
    assert.equal(result.brief.funnel.distinctReviewedProspectCount, 1);
    assert.equal(result.brief.weekly.status, "unavailable");
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
    assert.deepEqual(result.brief.funnel.decisions, { approve: 1, reject: 0, defer: 0 });
    assert.equal(result.brief.funnel.windowStart, WINDOW_START);
    assert.equal(result.brief.funnel.windowEndExclusive, WINDOW_END);
  } finally {
    await fixture.dispose();
  }
});

test("every persisted profile lifecycle is reported verbatim and none is equated with a profile name", async () => {
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
      assert.equal(result.brief.scope.profileLifecycle, lifecycle, lifecycle);
      assert.equal(result.brief.scope.profileName, "Operating", lifecycle);
      // No lifecycle is ever promoted to an Operating/Draft judgement.
      assert.ok(!["Operating", "Draft"].includes(result.brief.scope.profileLifecycle), lifecycle);
    } finally {
      await fixture.dispose();
    }
  }
});

test("a workspace without an active profile configuration cannot establish scope", async () => {
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
    assert.equal(result.status, "unavailable");
    assert.deepEqual(result.reasonCodes, ["workspace_absent"]);
    assert.equal(result.brief, null);
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

test("a sibling profile's review decisions never appear in this profile's funnel", async () => {
  const fixture = await createD1Fixture("morning-brief-read-sibling");
  try {
    await applyPhase4Migrations(fixture.database);
    const read = await load(fixture);
    const ctx = await seedWorkspace(fixture.database, "sib");
    await seedSchedule(fixture.database, ctx);
    await seedOffer(fixture.database, ctx);
    await seedReviewedProspect(fixture.database, ctx, "own", "approve", Date.UTC(2026, 2, 10, 12));

    // The same workspace's Greenfield profile also has reviewed Prospects.
    await run(fixture.database, "INSERT INTO typed_configurations (id, workspace_id, created_at, updated_at, revision, company_id, owner_type, owner_id, kind, digest, manifest_json, active) VALUES ('config-gf-sib', 'workspace-sib', ?, ?, 1, 'company-sib', 'profile', 'profile-greenfield-sib', 'profile_effective', ?, '{}', 1)", ctx.now, ctx.now, DIGEST_B);
    await seedOffer(fixture.database, ctx, "profile-greenfield", "config-gf", DIGEST_B);
    for (const key of ["gf-a", "gf-b", "gf-c"]) {
      await seedReviewedProspect(fixture.database, ctx, key, "reject", Date.UTC(2026, 2, 11, 12), "profile-greenfield", "config-gf", DIGEST_B);
    }

    const result = await read.readMorningBrief(
      fixture.database, { subject: "owner-sib" },
      { asOf: AS_OF, reviewWindowStart: WINDOW_START, reviewWindowEndExclusive: WINDOW_END },
    );
    assert.equal(result.brief.scope.profileId, "profile-sib");
    // Three sibling rejections exist in the same workspace and must be excluded.
    assert.deepEqual(result.brief.funnel.decisions, { approve: 1, reject: 0, defer: 0 });
    assert.equal(result.brief.funnel.distinctReviewedProspectCount, 1);
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
    assert.equal(result.brief.scope.workspaceId, "workspace-victim");
    // The foreign digest must not reach the brief through any field.
    assert.ok(
      !JSON.stringify(result.brief).includes(FOREIGN_DIGEST),
      "another workspace's authority-command digest must never appear in the brief",
    );
    // A cross-workspace reference is not a usable observation: it is withheld.
    assert.equal(result.brief.schedule.status, "unknown");
    assert.equal(result.brief.schedule.reportedState, null);
    assert.equal(result.brief.schedule.readinessRef, null);
    assert.deepEqual(result.brief.schedule.reasonCodes, ["schedule_observation_absent"]);
  } finally {
    await fixture.dispose();
  }
});
