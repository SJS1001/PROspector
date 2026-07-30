import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  applyMigrations,
  assertForbiddenOperationalRowsUnchanged,
  createD1Fixture,
  countRows,
  seedBoundHistorian,
  snapshotForbiddenOperationalRows,
} from "./helpers/d1.mjs";

const NOW = 1_780_000_000_000;
const OWNER = { subject: "phase4-contract-owner", legacySubject: "phase4-contract-owner-legacy", displayName: "Phase 4 contract owner" };

async function seedProfileAuthority(fixture) {
  const commercial = await fixture.vite.ssrLoadModule(new URL("../domain/commercial-model.ts", import.meta.url).pathname);
  const model = await commercial.initializeCommercialModel(fixture.database, OWNER, { idempotencyKey: "0198f400-0000-7000-8000-000000000001" });
  const product = model.products.find((entry) => entry.name === "ONE");
  const profile = model.profiles.find((entry) => entry.name === "Operating");
  const workspace = await fixture.database.prepare("SELECT id FROM workspaces WHERE owner_subject = ? LIMIT 1").bind(OWNER.subject).first();
  const now = NOW;
  await fixture.database.batch([
    fixture.database.prepare("INSERT INTO typed_configurations (id, workspace_id, created_at, updated_at, revision, company_id, owner_type, owner_id, kind, digest, manifest_json, active) VALUES ('phase4-product-config', ?, ?, ?, 1, NULL, 'product', ?, 'product_discovery', ?, '{}', 1)").bind(workspace.id, now, now, product.id, "a".repeat(64)),
    fixture.database.prepare("UPDATE customer_profiles SET timezone = 'America/Toronto', weekly_target = 1 WHERE id = ?").bind(profile.id),
  ]);
  const row = await fixture.database.prepare("SELECT revision FROM customer_profiles WHERE id = ?").bind(profile.id).first();
  // Phase 4 must consume persisted Phase 2/3 facts.  This deliberately builds
  // the minimum accepted Play, confirmed Offer lineage, and exact current
  // Profile versions instead of passing a client-shaped authority object.
  const profileRow = await fixture.database.prepare("SELECT play_id FROM customer_profiles WHERE id=?").bind(profile.id).first();
  await fixture.database.prepare("UPDATE market_plays SET lifecycle = 'active' WHERE id = ?").bind(profileRow.play_id).run();
  const workspaceId = workspace.id;
  const commandId = "phase4-authority-command";
  await fixture.database.prepare("INSERT INTO authority_commands (id,workspace_id,created_at,updated_at,revision,command_type,idempotency_key,operation_digest,expected_revision,subject_type,subject_id,status) VALUES (?,?,?,?,1,'test.profile.authority',?,?,1,'profile',?,'accepted')").bind(commandId, workspaceId, now, now, "0198f400-0000-7000-8000-000000000099", "1".repeat(64), profile.id).run();
  const categories = ["fit", "disqualifier", "roles", "signals", "timezone", "rubric", "proof_policy", "contact_policy", "outreach_policy", "schedule", "output_target"];
  for (const [index, kind] of categories.entries()) {
    const itemId = `phase4-item-${index}`; const versionId = `phase4-version-${index}`;
    await fixture.database.batch([
      fixture.database.prepare("INSERT INTO knowledge_items (id,workspace_id,created_at,updated_at,revision,company_id,scope_type,scope_id,kind,slot,current_version_id) VALUES (?,?,?,?,1,?,'profile',?,?, 'default',NULL)").bind(itemId,workspaceId,now,now,(await fixture.database.prepare("SELECT id FROM companies WHERE workspace_id=?").bind(workspaceId).first()).id,profile.id,kind),
      fixture.database.prepare("INSERT INTO knowledge_versions (id,workspace_id,created_at,updated_at,revision,scope_type,scope_id,kind,value_json,status,source_digest,knowledge_item_id,proposal_id,decision_id,authority_command_id,value_digest,predecessor_version_id) VALUES (?,?,?,?,1,'profile',?,?, '{}','confirmed',?,?,?,?,?,?,NULL)").bind(versionId,workspaceId,now,now,profile.id,kind,"a".repeat(64),itemId,null,null,commandId,"a".repeat(64)),
      fixture.database.prepare("UPDATE knowledge_items SET current_version_id=? WHERE id=?").bind(versionId,itemId),
    ]);
  }
  const offerVersion = "phase4-offer-version", offerItem = "phase4-offer-item";
  await fixture.database.prepare("INSERT INTO knowledge_items (id,workspace_id,created_at,updated_at,revision,company_id,scope_type,scope_id,kind,slot,current_version_id) VALUES (?,?,?,?,1,?,'profile',?,'fit','offer',NULL)").bind(offerItem, workspaceId, now, now, (await fixture.database.prepare("SELECT id FROM companies WHERE workspace_id=?").bind(workspaceId).first()).id, profile.id).run();
  const proposalId = "phase4-offer-proposal", decisionId = "phase4-offer-decision", questionId = "phase4-offer-question", answerId = "phase4-offer-answer", sessionId = "phase4-offer-session", auditId = "phase4-offer-audit";
  await fixture.database.batch([
    fixture.database.prepare("INSERT INTO interview_sessions (id,workspace_id,created_at,updated_at,revision,scope_type,scope_id,state,active_question_id) VALUES (?,?,?,?,1,'profile',?,'complete',NULL)").bind(sessionId,workspaceId,now,now,profile.id),
    fixture.database.prepare("INSERT INTO interview_questions (id,workspace_id,created_at,updated_at,revision,session_id,version,prompt,research_json,recommendation,status) VALUES (?,?,?,?,1,?,1,'offer','{}',NULL,'answered')").bind(questionId,workspaceId,now,now,sessionId),
    fixture.database.prepare("INSERT INTO interview_answers (id,workspace_id,session_id,question_id,question_revision,choice,correction_json,idempotency_key,created_at,proposal_json,proposal_digest,operation_digest) VALUES (?,?,?,?,1,'accept',NULL,?,?, '{}',?,?)").bind(answerId,workspaceId,sessionId,questionId,"0198f400-0000-7000-8000-000000000098",now,"b".repeat(64),"c".repeat(64)),
    fixture.database.prepare("INSERT INTO knowledge_proposals (id,workspace_id,created_at,updated_at,revision,company_id,source_id,excerpt_id,destination_scope_type,destination_scope_id,kind,value_json,provenance_json,proposal_digest,origin,status) VALUES (?,?,?,?,1,?,NULL,NULL,'profile',?,'fit','{}','{}',?,'test','accepted')").bind(proposalId,workspaceId,now,now,(await fixture.database.prepare("SELECT id FROM companies WHERE workspace_id=?").bind(workspaceId).first()).id,profile.id,"d".repeat(64)),
    fixture.database.prepare("INSERT INTO proposal_decisions (id,workspace_id,created_at,updated_at,revision,proposal_id,answer_id,authority_command_id,decision,reviewed_snapshot_digest,operation_digest,idempotency_key) VALUES (?,?,?,?,1,?,?,?,'accept',?,?,?)").bind(decisionId,workspaceId,now,now,proposalId,answerId,commandId,"e".repeat(64),"f".repeat(64),"0198f400-0000-7000-8000-000000000097"),
    fixture.database.prepare("INSERT INTO knowledge_versions (id,workspace_id,created_at,updated_at,revision,scope_type,scope_id,kind,value_json,status,source_digest,knowledge_item_id,proposal_id,decision_id,authority_command_id,value_digest,predecessor_version_id) VALUES (?,?,?,?,1,'profile',?,?, '{}','confirmed',?,?,?,?,?,?,NULL)").bind(offerVersion,workspaceId,now,now,profile.id,"fit","a".repeat(64),offerItem,proposalId,decisionId,commandId,"a".repeat(64)),
    fixture.database.prepare("UPDATE knowledge_items SET current_version_id=? WHERE id=?").bind(offerVersion,offerItem),
    fixture.database.prepare("INSERT INTO audit_events (id,workspace_id,actor_type,actor_id,action,subject_type,subject_id,detail_json,created_at) VALUES (?,?,'owner',?,'test.offer','offer',?,'{}',?)").bind(auditId,workspaceId,OWNER.subject,profile.id,now),
    fixture.database.prepare("INSERT INTO offers (id,workspace_id,created_at,updated_at,revision,profile_id,name,value_json,question_id,answer_id,proposal_id,decision_id,knowledge_version_id,authority_command_id,audit_event_id) VALUES ('phase4-offer',?,?,?,1,?,'Offer','{}',?,?,?,?,?,?,?)").bind(workspaceId,now,now,profile.id,questionId,answerId,proposalId,decisionId,offerVersion,commandId,auditId),
  ]);
  return { profileId: profile.id, revision: Number(row.revision) };
}

test("04-02 full chain installs constrained Phase 4 persistence without Phase 5–7 effect tables", async () => {
  const fixture = await createD1Fixture("phase4-schema-contract");
  try {
    const historian = await seedBoundHistorian(fixture.database);
    await applyMigrations(fixture.database);
    const expected = [
      "profile_configuration_candidates", "profile_configuration_activations", "prospecting_schedules", "prospecting_runs", "prospecting_run_events",
      "runner_assignments", "runner_assignment_revocations", "runner_submissions", "prospecting_source_lineage", "prospecting_signals",
      "prospecting_candidates", "qualification_assessments", "profile_prospects", "prospect_review_decisions", "prospect_cooldowns", "prospect_reentry_events",
    ];
    for (const table of expected) {
      const row = await fixture.database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").bind(table).first();
      assert.equal(row?.name, table, `${table} must be in the additive 0007 schema`);
      assert.equal(await countRows(fixture.database, table), 0);
    }
    for (const table of ["enriched_contacts", "enrichment_grants", "outreach_packages", "message_versions", "message_dispatches", "export_jobs", "provider_credentials", "provider_secrets"]) {
      const row = await fixture.database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").bind(table).first();
      assert.equal(row, null, `${table} belongs to a later effect phase and must be absent`);
    }
    for (const trigger of ["runner_submission_scope_insert", "runner_assignment_secret_immutable_update", "qualification_assessment_immutable_update", "prospect_review_immutable_update"]) {
      const row = await fixture.database.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' AND name = ?").bind(trigger).first();
      assert.equal(row?.name, trigger, `${trigger} must enforce D1-side containment`);
    }
    for (const [table, index] of [
      ["profile_configuration_activations", "profile_configuration_activation_candidate_unique"],
      ["prospecting_schedules", "prospecting_schedule_active_profile_unique"],
      ["prospecting_runs", "prospecting_initial_run_unique"],
      ["runner_assignments", "runner_assignment_token_hash_unique"],
      ["profile_prospects", "profile_prospect_active_fingerprint_unique"],
      ["prospect_cooldowns", "prospect_cooldown_active_unique"],
    ]) {
      const indexes = await fixture.database.prepare(`PRAGMA index_list('${table}')`).all();
      assert.ok(indexes.results.some((entry) => entry.name === index), `${index} must arbitrate duplicate active Phase 4 facts`);
    }
    for (const [table, referencedTable] of [
      ["prospecting_runs", "typed_configurations"],
      ["runner_submissions", "runner_assignments"],
      ["prospecting_signals", "prospecting_source_lineage"],
      ["qualification_assessments", "prospecting_candidates"],
      ["prospect_review_decisions", "profile_prospects"],
    ]) {
      const foreignKeys = await fixture.database.prepare(`PRAGMA foreign_key_list('${table}')`).all();
      assert.ok(foreignKeys.results.some((entry) => entry.table === referencedTable), `${table} must retain its ${referencedTable} lineage FK`);
    }
    const replayedHistorian = await fixture.database.prepare("SELECT id FROM knowledge_versions WHERE id = ?").bind(historian.knowledgeVersionId).first();
    assert.equal(replayedHistorian?.id, historian.knowledgeVersionId, "0007 must preserve prior Phase 2/3 historian rows");
    const migration = await readFile(new URL("../drizzle/0007_profile_prospecting.sql", import.meta.url), "utf8");
    assert.doesNotMatch(migration, /(?:DROP INDEX|ALTER TABLE)\s+`private_synthetic_proof_/i, "0007 must be strictly additive from committed 0006");
  } finally { await fixture.dispose(); }
});

test("D-05 qualification review requires a reason/date and never authorizes Phase 5–7 effects", async () => {
  const fixture = await createD1Fixture("phase4-review-contract");
  try {
    await applyMigrations(fixture.database);
    const review = await fixture.vite.ssrLoadModule(new URL("../domain/prospect-review.ts", import.meta.url).pathname)
      .catch(() => assert.fail("missing production behavior: site/domain/prospect-review.ts must persist immutable assessments and owner review cooldowns"));
    const before = await snapshotForbiddenOperationalRows(fixture.database);
    for (const [decision, input] of [["approve", {}], ["reject", {}], ["defer", { reason: "awaiting budget", reviewAt: NOW + 7 * 86_400_000 }]]) {
      if (decision !== "approve") await assert.rejects(
        () => review.decideQualifiedProspect(fixture.database, OWNER, { prospectId: "prospect-a", decision, expectedRevision: 1, idempotencyKey: `0198f400-0000-7000-8000-0000000002${decision.length}`, ...input }),
        /reason/i,
      );
    }
    await assertForbiddenOperationalRowsUnchanged(fixture.database, before);
  } finally { await fixture.dispose(); }
});

async function loadProfileReadiness(fixture) {
  try {
    return await fixture.vite.ssrLoadModule(new URL("../domain/profile-readiness.ts", import.meta.url).pathname);
  } catch {
    assert.fail("missing production behavior: site/domain/profile-readiness.ts must resolve immutable Phase 3 authority before creating or activating a Profile configuration");
  }
}

function activePhase3Authority(overrides = {}) {
  return {
    productConfiguration: { id: "product-config", digest: "a".repeat(64), active: true, productId: "product-one" },
    acceptedPlay: { id: "play-mining", digest: "b".repeat(64), active: true, productId: "product-one" },
    offer: { id: "offer-mining", digest: "c".repeat(64), active: true, playId: "play-mining", profileId: "profile-mining" },
    sourcePolicy: { id: "source-policy", digest: "d".repeat(64), active: true, playId: "play-mining" },
    runnerPolicy: { id: "runner-policy", digest: "e".repeat(64), active: true, productId: "product-one" },
    scheduleSemantics: { id: "schedule-policy", digest: "f".repeat(64), timezone: "America/Toronto", active: true },
    replacementDirectives: { id: "replacement-directives", digest: "0".repeat(64), active: true },
    ...overrides,
  };
}

test("D-01 Phase 4 rejects every missing, stale, or wrong-scoped immutable Phase 3 predecessor", async () => {
  const fixture = await createD1Fixture("phase4-prerequisite-contract");
  try {
    await applyMigrations(fixture.database);
    const profile = await loadProfileReadiness(fixture);
    const before = await snapshotForbiddenOperationalRows(fixture.database);
    const seeded = await seedProfileAuthority(fixture);
    await fixture.database.prepare("DELETE FROM typed_configurations WHERE id = 'phase4-product-config'").run();
    await assert.rejects(
      () => profile.createProfileConfigurationCandidate(fixture.database, OWNER, {
        profileId: seeded.profileId, expectedProfileRevision: seeded.revision, phase3Authority: activePhase3Authority({ productConfiguration: null }), now: NOW,
        idempotencyKey: "0198f400-0000-7000-8000-000000000090",
      }),
      /Product Discovery Configuration/i,
      "client-supplied authority must not replace a missing persisted predecessor",
    );
    for (const table of ["runner_assignments", "accounts", "contacts", "prospects"]) {
      assert.equal(await countRows(fixture.database, table), before[table]?.count ?? 0, `${table} must remain unaffected`);
    }
  } finally { await fixture.dispose(); }
});

test("D-01/D-02 Profile candidate and activation are separate, immutable, and zero-effect downstream", async () => {
  const fixture = await createD1Fixture("phase4-activation-contract");
  try {
    await applyMigrations(fixture.database);
    const profile = await loadProfileReadiness(fixture);
    const before = await snapshotForbiddenOperationalRows(fixture.database);
    const seeded = await seedProfileAuthority(fixture);
    const candidate = await profile.createProfileConfigurationCandidate(fixture.database, OWNER, {
      profileId: seeded.profileId, expectedProfileRevision: seeded.revision, now: NOW,
      idempotencyKey: "0198f400-0000-7000-8000-000000000101",
    });
    assert.equal(candidate.status, "candidate_not_active");
    assert.match(candidate.digest, /^[0-9a-f]{64}$/);
    const active = await profile.activateProfileConfiguration(fixture.database, OWNER, {
      candidateId: candidate.id, expectedRevision: candidate.revision, expectedDigest: candidate.digest, now: NOW,
      idempotencyKey: "0198f400-0000-7000-8000-000000000102",
    });
    assert.equal(active.configuration.active, true);
    assert.equal(active.initialRun.trigger, "initial");
    assert.equal(active.schedule.timezone, "America/Toronto");
    assert.equal(active.initialRun.executionState, "blocked_missing_capability");
    for (const table of ["runner_assignments", "accounts", "contacts", "prospects"]) {
      assert.equal(await countRows(fixture.database, table), before[table]?.count ?? 0, `${table} must remain unaffected`);
    }
  } finally { await fixture.dispose(); }
});

test("04-03 readiness classification is table-driven and never trusts a client authority shape", async () => {
  const fixture = await createD1Fixture("phase4-readiness-matrix");
  try {
    await applyMigrations(fixture.database);
    const profile = await loadProfileReadiness(fixture);
    const complete = profile.PROFILE_READINESS_CATEGORIES.map((category, index) => ({ id: `v-${index}`, digest: "a".repeat(64), kind: ({ fit_target:"fit", disqualifier:"disqualifier", roles:"roles", signals:"signals", geography_language:"timezone", rubric:"rubric", proof_guardrail:"proof_policy", contact_strategy:"contact_policy", outreach_strategy:"outreach_policy", schedule_timezone:"schedule", compliance:"proof_policy", output_policy:"output_target" })[category], scope_type:"profile", scope_id:"p", status:"confirmed" }));
    const authority = { productConfiguration:{ id:"pc", digest:"b".repeat(64) }, acceptedPlay:{ id:"play", revision:1 }, offer:{ id:"offer", knowledgeVersionId:"v", digest:"c".repeat(64) } };
    for (const [name, versions, expected] of [
      ["complete", complete, "complete"],
      ["missing", complete.filter((v) => v.kind !== "fit"), "missing"],
      ["stale", complete.map((v) => v.kind === "fit" ? { ...v, status:"proposed" } : v), "stale"],
      ["wrong-scoped", complete.map((v) => v.kind === "fit" ? { ...v, scope_id:"foreign" } : v), "wrong-scoped"],
    ]) {
      const result = profile.evaluateProfileReadiness({ profile:{ id:"p", lifecycle:"draft" }, authority, versions });
      if (expected === "complete") assert.equal(result.complete, true, name);
      else assert.equal(result.items.find((item) => item.category === "fit_target").status, expected, name);
    }
  } finally { await fixture.dispose(); }
});

test("04-03 Profile schedule utility matrix retains namespace, offset, and successful-only overlap window", async () => {
  const fixture = await createD1Fixture("phase4-schedule-matrix");
  try {
    await applyMigrations(fixture.database);
    const schedule = await fixture.vite.ssrLoadModule(new URL("../domain/prospecting-schedule.ts", import.meta.url).pathname);
    const cases = [
      ["profile namespace", () => schedule.profileSlotKey("profile-a", "2026-11-01", "06:00", -300), /^profile:profile-a:slot:2026-11-01T06:00:offset:-300$/],
      ["DST offset remains part of identity", () => schedule.profileSlotKey("profile-a", "2026-11-01", "06:00", -240), /^profile:profile-a:slot:2026-11-01T06:00:offset:-240$/],
    ];
    for (const [, create, matcher] of cases) assert.match(create(), matcher);
    assert.notEqual(schedule.profileSlotKey("profile-a", "2026-11-01", "06:00", -240), schedule.profileSlotKey("profile-a", "2026-11-01", "06:00", -300));
    assert.deepEqual(schedule.profileSourceWindow(null, NOW), { lowerExclusive:null, upperInclusive:NOW });
    assert.deepEqual(schedule.profileSourceWindow(NOW, NOW + 2 * 86_400_000), { lowerExclusive:NOW - 86_400_000, upperInclusive:NOW + 2 * 86_400_000 });
    assert.throws(() => schedule.profileSlotKey("", "bad", "6", 0), /schedule slot/i);
  } finally { await fixture.dispose(); }
});
