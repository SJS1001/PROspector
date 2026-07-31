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
import { seedProfileAuthority } from "./helpers/phase4.mjs";

const NOW = 1_780_000_000_000;
const OWNER = { subject: "phase4-contract-owner", legacySubject: "phase4-contract-owner-legacy", displayName: "Phase 4 contract owner" };

/*async function seedProfileAuthority(fixture) {
  const commercial = await fixture.vite.ssrLoadModule(new URL("../domain/commercial-model.ts", import.meta.url).pathname);
  const model = await commercial.initializeCommercialModel(fixture.database, OWNER, { idempotencyKey: "0198f400-0000-7000-8000-000000000001" });
  const product = model.products.find((entry) => entry.name === "ONE");
  const profile = model.profiles.find((entry) => entry.name === "Operating");
  const workspace = await fixture.database.prepare("SELECT id FROM workspaces WHERE owner_subject = ? LIMIT 1").bind(OWNER.subject).first();
  const now = NOW;
  await fixture.database.batch([
    fixture.database.prepare("INSERT INTO typed_configurations (id, workspace_id, created_at, updated_at, revision, company_id, owner_type, owner_id, kind, digest, manifest_json, active) VALUES ('phase4-product-config', ?, ?, ?, 1, NULL, 'product', ?, 'product_discovery', ?, ?, 1)").bind(workspace.id, now, now, product.id, "a".repeat(64), JSON.stringify({ policySnapshot: { sourcePolicy: { id: "phase4-source-policy", versionId: "phase4-version-3", digest: "a".repeat(64), value: { tier1Origins: ["example.invalid"], tier2Origins: [], materialSignalKinds: ["operating-signal"] } }, runnerPolicy: { id: "phase4-runner-policy", versionId: "phase4-version-3", digest: "a".repeat(64), value: { allowedTools: [] } } }, replacementDirectives: { id: "phase4-replacement-directives", digest: "a".repeat(64) } })),
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
}*/

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

test("D-05 projects complete bounded P1→P2→P3 review lineage without duplication", async () => {
  const fixture = await createD1Fixture("phase4-transitive-review-lineage");
  try {
    await applyMigrations(fixture.database);
    const seeded = await seedProfileAuthority(fixture, OWNER, NOW), readiness = await loadProfileReadiness(fixture), candidate = await readiness.createProfileConfigurationCandidate(fixture.database, OWNER, { profileId: seeded.profileId, expectedProfileRevision: seeded.revision, now: NOW, idempotencyKey: "0198f400-0000-7000-8000-000000000201" }), activation = await readiness.activateProfileConfiguration(fixture.database, OWNER, { candidateId: candidate.id, expectedRevision: candidate.revision, expectedDigest: candidate.digest, now: NOW, idempotencyKey: "0198f400-0000-7000-8000-000000000202" }), workspace = await fixture.database.prepare("SELECT id FROM workspaces WHERE owner_subject=?").bind(OWNER.subject).first(), profile = await fixture.database.prepare("SELECT play_id FROM customer_profiles WHERE id=?").bind(seeded.profileId).first(), company = await fixture.database.prepare("SELECT id FROM companies WHERE workspace_id=?").bind(workspace.id).first();
    const review = await fixture.vite.ssrLoadModule(new URL("../domain/prospect-review.ts", import.meta.url).pathname), digest = "a".repeat(64), candidateJson = JSON.stringify({ accountId: "lineage-account", targetId: "lineage-target", targetValue: "Lineage target" });
    const statements = [
      fixture.database.prepare("INSERT INTO organizations (id,workspace_id,created_at,updated_at,revision,company_id,canonical_name,identity_digest) VALUES ('lineage-org',?,?,?,1,?,'Lineage organization',?)").bind(workspace.id,NOW,NOW,company.id,digest),
      fixture.database.prepare("INSERT INTO accounts (id,workspace_id,created_at,updated_at,revision,play_id,organization_id,state) VALUES ('lineage-account',?,?,?,1,?,'lineage-org','draft')").bind(workspace.id,NOW,NOW,profile.play_id),
      fixture.database.prepare("INSERT INTO targets (id,workspace_id,created_at,updated_at,revision,profile_id,account_id,state) VALUES ('lineage-target',?,?,?,1,?,'lineage-account','draft')").bind(workspace.id,NOW,NOW,seeded.profileId),
      fixture.database.prepare("INSERT INTO authority_commands (id,workspace_id,created_at,updated_at,revision,command_type,idempotency_key,operation_digest,expected_revision,subject_type,subject_id,status) VALUES ('lineage-assignment-command',?,?,?,1,'test.lineage.assignment','lineage-assignment-key',?,1,'prospecting_run',?,'accepted')").bind(workspace.id,NOW,NOW,"f".repeat(64),activation.initialRun.id),
      fixture.database.prepare("INSERT INTO audit_events (id,workspace_id,actor_type,actor_id,action,subject_type,subject_id,detail_json,created_at) VALUES ('lineage-assignment-audit',?,'system','test','test.lineage','prospecting_run',?,'{}',?)").bind(workspace.id,activation.initialRun.id,NOW),
      fixture.database.prepare("UPDATE prospecting_runs SET execution_state='queued' WHERE id=? AND workspace_id=?").bind(activation.initialRun.id,workspace.id),
      fixture.database.prepare("INSERT INTO runner_assignments (id,workspace_id,created_at,updated_at,revision,run_id,profile_id,configuration_id,configuration_digest,audience,token_hash,nonce_hash,instruction_version,tool_configuration_digest,quota_json,quota_digest,expires_at,status,authority_command_id,audit_event_id) VALUES ('lineage-assignment',?,?,?,1,?,?,?,?,'lineage',?,?, 'v1',?,'{}',?,?,'issued','lineage-assignment-command','lineage-assignment-audit')").bind(workspace.id,NOW,NOW,activation.initialRun.id,seeded.profileId,activation.configuration.id,activation.configuration.digest,"0".repeat(64),"1".repeat(64),"2".repeat(64),"3".repeat(64),NOW + 100000),
      fixture.database.prepare("UPDATE prospecting_runs SET execution_state='assigned' WHERE id=? AND workspace_id=?").bind(activation.initialRun.id,workspace.id),
      fixture.database.prepare("INSERT INTO runner_submissions (id,workspace_id,run_id,assignment_id,configuration_id,submission_json,submission_digest,provenance_json,provenance_digest,status,operation_digest,idempotency_key,created_at) VALUES ('lineage-submission',?,'"+activation.initialRun.id+"','lineage-assignment','"+activation.configuration.id+"','{}',?,'{}',?,'accepted',?,'lineage-submission-key',?)").bind(workspace.id,"4".repeat(64),"5".repeat(64),"6".repeat(64),NOW),
    ];
    for (const [index, prospectId] of ["p1", "p2", "p3"].entries()) {
      const id = `lineage-${prospectId}`, at = NOW + index * 1000, fingerprint = `${index + 1}`.repeat(64), command = `lineage-command-${prospectId}`, audit = `lineage-audit-${prospectId}`;
      statements.push(
        fixture.database.prepare("INSERT INTO authority_commands (id,workspace_id,created_at,updated_at,revision,command_type,idempotency_key,operation_digest,expected_revision,subject_type,subject_id,status) VALUES (?,?,?,?,1,'test.lineage',?,?,1,'profile_prospect',?,'accepted')").bind(command,workspace.id,at,at,`lineage-key-${prospectId}`,String.fromCharCode(97 + index).repeat(64),id),
        fixture.database.prepare("INSERT INTO audit_events (id,workspace_id,actor_type,actor_id,action,subject_type,subject_id,detail_json,created_at) VALUES (?,?,'owner',?,'test.lineage','profile_prospect',?,'{}',?)").bind(audit,workspace.id,OWNER.subject,id,at),
        fixture.database.prepare("INSERT INTO prospecting_candidates (id,workspace_id,created_at,updated_at,revision,profile_id,offer_id,run_id,submission_id,configuration_id,fingerprint,candidate_json,candidate_digest,status) VALUES (?,?,?,?,1,?,'phase4-offer',?,?,?, ?,?,?,'qualified')").bind(`lineage-candidate-${prospectId}`,workspace.id,at,at,seeded.profileId,activation.initialRun.id,"lineage-submission",activation.configuration.id,fingerprint,candidateJson,`${index + 4}`.repeat(64)),
        fixture.database.prepare("INSERT INTO qualification_assessments (id,workspace_id,candidate_id,configuration_id,configuration_digest,input_json,input_digest,anchor_json,evidence_json,gate_json,score_json,score,outcome,tie_order,assessment_digest,predecessor_assessment_id,created_at) VALUES (?,?,'lineage-candidate-"+prospectId+"',?,?, '{}',?,'{}','{}','{}','{}',8,'Passed','[]',?,NULL,?)").bind(`lineage-assessment-${prospectId}`,workspace.id,activation.configuration.id,activation.configuration.digest,`${index + 7}`.repeat(64),String.fromCharCode(97 + index).repeat(64),at),
        fixture.database.prepare("INSERT INTO profile_prospects (id,workspace_id,created_at,updated_at,revision,profile_id,offer_id,candidate_id,assessment_id,fingerprint,state,active) VALUES (?,?,?,?,1,?,'phase4-offer',?,?,?,'qualified',?)").bind(id,workspace.id,at,at,seeded.profileId,`lineage-candidate-${prospectId}`,`lineage-assessment-${prospectId}`,digest,index === 2 ? 1 : 0),
      );
      if (index < 2) statements.push(
        fixture.database.prepare("INSERT INTO prospect_review_decisions (id,workspace_id,prospect_id,assessment_id,decision,reason,review_at,expected_prospect_revision,authority_command_id,audit_event_id,decision_digest,operation_digest,idempotency_key,created_at) VALUES (?,?,?,?,?,?,NULL,1,?,?,?,?,?,?)").bind(`lineage-decision-${prospectId}`,workspace.id,id,`lineage-assessment-${prospectId}`,index ? "defer" : "reject",`reason-${prospectId}`,command,audit,String.fromCharCode(100 + index).repeat(64),String.fromCharCode(102 - index).repeat(64),`lineage-review-${prospectId}`,at),
        fixture.database.prepare("INSERT INTO prospect_cooldowns (id,workspace_id,prospect_id,review_decision_id,assessment_id,reason,starts_at,ends_at,status,created_at) VALUES (?,?,?,?,?,?,?,?,'released',?)").bind(`lineage-cooldown-${prospectId}`,workspace.id,id,`lineage-decision-${prospectId}`,`lineage-assessment-${prospectId}`,`reason-${prospectId}`,at,at + 1,at),
      );
    }
    statements.push(
      fixture.database.prepare("INSERT INTO authority_commands (id,workspace_id,created_at,updated_at,revision,command_type,idempotency_key,operation_digest,expected_revision,subject_type,subject_id,status) VALUES ('lineage-reentry-command-p1',?,?,?,1,'test.lineage.reentry','lineage-reentry-key-p1',?,1,'profile_prospect','lineage-p1','accepted')").bind(workspace.id,NOW + 2000,NOW + 2000,"d".repeat(64)),
      fixture.database.prepare("INSERT INTO authority_commands (id,workspace_id,created_at,updated_at,revision,command_type,idempotency_key,operation_digest,expected_revision,subject_type,subject_id,status) VALUES ('lineage-reentry-command-p2',?,?,?,1,'test.lineage.reentry','lineage-reentry-key-p2',?,1,'profile_prospect','lineage-p2','accepted')").bind(workspace.id,NOW + 3000,NOW + 3000,"e".repeat(64)),
      fixture.database.prepare("INSERT INTO prospect_reentry_events (id,workspace_id,prospect_id,cooldown_id,signal_id,prior_assessment_id,event_kind,event_json,event_digest,authority_command_id,audit_event_id,created_at) VALUES ('lineage-reentry-p1',?,'lineage-p1','lineage-cooldown-p1',NULL,'lineage-assessment-p1','material_signal',?,?,'lineage-reentry-command-p1','lineage-audit-p3',?)").bind(workspace.id,JSON.stringify({ assessmentId: "lineage-assessment-p2", priorProspectId: "lineage-p1", reenteredProspectId: "lineage-p2" }),"b".repeat(64),NOW + 2000),
      fixture.database.prepare("INSERT INTO prospect_reentry_events (id,workspace_id,prospect_id,cooldown_id,signal_id,prior_assessment_id,event_kind,event_json,event_digest,authority_command_id,audit_event_id,created_at) VALUES ('lineage-reentry-p2',?,'lineage-p2','lineage-cooldown-p2',NULL,'lineage-assessment-p2','review_date_due',?,?,'lineage-reentry-command-p2','lineage-audit-p2',?)").bind(workspace.id,JSON.stringify({ assessmentId: "lineage-assessment-p3", priorProspectId: "lineage-p2", reenteredProspectId: "lineage-p3" }),"c".repeat(64),NOW + 3000),
    );
    await fixture.database.batch(statements);
    const projection = await review.readProspectingProjection(fixture.database, OWNER), current = projection.queue.find((row) => row.id === "lineage-p3");
    assert.deepEqual(current.decisionHistory.map((row) => row.prospect_id), ["lineage-p1", "lineage-p2"]);
    assert.deepEqual(current.cooldownHistory.map((row) => row.prospect_id), ["lineage-p1", "lineage-p2"]);
    assert.deepEqual(current.reentryHistory.map((row) => row.prior_prospect_id), ["lineage-p1", "lineage-p2"]);
    assert.equal(new Set(current.reentryHistory.map((row) => row.id)).size, 2, "lineage events deduplicate by immutable event ID");
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
    const seeded = await seedProfileAuthority(fixture, OWNER, NOW);
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
    const seeded = await seedProfileAuthority(fixture, OWNER, NOW);
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
    const persisted = await fixture.database.prepare("SELECT manifest_json FROM typed_configurations WHERE id = ?").bind(active.configuration.id).first();
    const manifest = JSON.parse(persisted.manifest_json);
    assert.equal(manifest.authority.sourcePolicy.id, "phase4-source-policy");
    assert.equal(manifest.authority.runnerPolicy.id, "phase4-runner-policy");
    assert.equal(Object.keys(manifest.confirmedCategoryInputs).length, 12, "all readiness categories persist canonical inputs");
    for (const table of ["runner_assignments", "accounts", "contacts", "prospects"]) {
      assert.equal(await countRows(fixture.database, table), before[table]?.count ?? 0, `${table} must remain unaffected`);
    }
  } finally { await fixture.dispose(); }
});

test("distinct concurrent activation keys return only the persisted winner", async () => {
  const fixture = await createD1Fixture("phase4-distinct-activation-race");
  try {
    await applyMigrations(fixture.database);
    const profile = await loadProfileReadiness(fixture);
    const seeded = await seedProfileAuthority(fixture, OWNER, NOW);
    const candidate = await profile.createProfileConfigurationCandidate(fixture.database, OWNER, { profileId: seeded.profileId, expectedProfileRevision: seeded.revision, now: NOW, idempotencyKey: "0198f400-0000-7000-8000-000000000151" });
    const before = await Promise.all(["authority_commands", "audit_events", "profile_configuration_activations", "prospecting_runs", "prospecting_schedules"].map(async (table) => [table, await countRows(fixture.database, table)]));
    const attempts = await Promise.allSettled(["152", "153"].map((suffix) => profile.activateProfileConfiguration(fixture.database, OWNER, { candidateId: candidate.id, expectedRevision: candidate.revision, expectedDigest: candidate.digest, now: NOW + 1, idempotencyKey: `0198f400-0000-7000-8000-000000000${suffix}` })));
    const activation = await fixture.database.prepare("SELECT a.configuration_id,r.id run_id,s.id schedule_id FROM profile_configuration_activations a JOIN prospecting_runs r ON r.configuration_id=a.configuration_id AND r.trigger_kind='initial' JOIN prospecting_schedules s ON s.configuration_id=a.configuration_id AND s.active=1 WHERE a.candidate_id=?").bind(candidate.id).first();
    assert.ok(activation, "one durable activation is the only possible winner");
    for (const attempt of attempts) {
      if (attempt.status === "fulfilled") assert.deepEqual([attempt.value.configuration.id, attempt.value.initialRun.id, attempt.value.schedule.id], [activation.configuration_id, activation.run_id, activation.schedule_id], "a concurrent caller must return persisted IDs, never generated IDs");
      else assert.match(attempt.reason.message, /replacement|required|activation/i);
    }
    for (const [table, count] of before) assert.equal(await countRows(fixture.database, table), count + 1, `${table} has exactly the winner's single authority write`);
  } finally { await fixture.dispose(); }
});

test("D-01 stale candidates cannot overwrite a replacement authority or mutate the replacement lineage", async () => {
  const fixture = await createD1Fixture("phase4-replacement-candidate-race");
  try {
    await applyMigrations(fixture.database);
    const profile = await loadProfileReadiness(fixture);
    const seeded = await seedProfileAuthority(fixture, OWNER, NOW);
    const candidateA = await profile.createProfileConfigurationCandidate(fixture.database, OWNER, { profileId: seeded.profileId, expectedProfileRevision: seeded.revision, now: NOW, idempotencyKey: "0198f400-0000-7000-8000-000000000111" });
    const workspace = await fixture.database.prepare("SELECT id FROM workspaces WHERE owner_subject=?").bind(OWNER.subject).first();
    const productConfiguration = await fixture.database.prepare("SELECT owner_id FROM typed_configurations WHERE id='phase4-product-config' AND workspace_id=?").bind(workspace.id).first();
    await fixture.database.batch([
      fixture.database.prepare("UPDATE typed_configurations SET active=0 WHERE id='phase4-product-config' AND workspace_id=?").bind(workspace.id),
      fixture.database.prepare("INSERT INTO typed_configurations (id,workspace_id,created_at,updated_at,revision,company_id,owner_type,owner_id,kind,digest,manifest_json,active) VALUES ('phase4-product-config-replacement',?,?,?,1,NULL,'product',?,'product_discovery',?,?,1)").bind(workspace.id, NOW + 1, NOW + 1, productConfiguration.owner_id, "b".repeat(64), JSON.stringify({ policySnapshot: { sourcePolicy: { id: "phase4-source-policy-replacement", versionId: "phase4-version-3", digest: "b".repeat(64), value: { tier1Origins: ["example.invalid"], tier2Origins: [], materialSignalKinds: ["operating-signal"] } }, runnerPolicy: { id: "phase4-runner-policy", versionId: "phase4-version-3", digest: "a".repeat(64), value: { allowedTools: [] } } }, replacementDirectives: { id: "phase4-replacement-directives", digest: "a".repeat(64) } })),
    ]);
    const candidateB = await profile.createProfileConfigurationCandidate(fixture.database, OWNER, { profileId: seeded.profileId, expectedProfileRevision: seeded.revision, now: NOW + 2, idempotencyKey: "0198f400-0000-7000-8000-000000000112" });
    const activatedB = await profile.activateProfileConfiguration(fixture.database, OWNER, { candidateId: candidateB.id, expectedRevision: candidateB.revision, expectedDigest: candidateB.digest, now: NOW + 3, idempotencyKey: "0198f400-0000-7000-8000-000000000113" });
    const before = await fixture.database.prepare("SELECT a.candidate_id,a.configuration_id,a.previous_configuration_id,a.operation_digest,c.status,c.candidate_digest FROM profile_configuration_activations a JOIN profile_configuration_candidates c ON c.id=a.candidate_id WHERE a.profile_id=? ORDER BY a.created_at").bind(seeded.profileId).all();
    const beforeMutations = await Promise.all(["typed_configurations", "profile_configuration_activations", "prospecting_schedules", "prospecting_runs", "audit_events"].map(async (table) => [table, await countRows(fixture.database, table)]));
    await assert.rejects(() => profile.activateProfileConfiguration(fixture.database, OWNER, { candidateId: candidateA.id, expectedRevision: candidateA.revision, expectedDigest: candidateA.digest, now: NOW + 4, idempotencyKey: "0198f400-0000-7000-8000-000000000114" }), /replacement candidate required/i);
    const after = await fixture.database.prepare("SELECT a.candidate_id,a.configuration_id,a.previous_configuration_id,a.operation_digest,c.status,c.candidate_digest FROM profile_configuration_activations a JOIN profile_configuration_candidates c ON c.id=a.candidate_id WHERE a.profile_id=? ORDER BY a.created_at").bind(seeded.profileId).all();
    assert.deepEqual(await Promise.all(["typed_configurations", "profile_configuration_activations", "prospecting_schedules", "prospecting_runs", "audit_events"].map(async (table) => [table, await countRows(fixture.database, table)])), beforeMutations, "the stale activation must not mutate configuration, activation, schedule, run, or audit records");
    assert.deepEqual(after.results, before.results, "the stale activation cannot alter the replacement activation lineage");
    assert.equal(after.results.length, 1); assert.equal(after.results[0].candidate_id, candidateB.id); assert.equal(after.results[0].configuration_id, activatedB.configuration.id);
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
