import assert from "node:assert/strict";
import { applyPersonDiscoveryMigrations, createD1Fixture } from "./d1.mjs";
import { seedProfileAuthority } from "./phase4.mjs";

export const PERSON_DISCOVERY_NOW = 1_788_000_000_000;
export const PERSON_DISCOVERY_OWNER = Object.freeze({
  subject: "person-discovery-owner",
  legacySubject: "person-discovery-owner-legacy",
  displayName: "Synthetic person discovery owner",
});

export async function createPersonDiscoveryFixture(name = "person-discovery") {
  const fixture = await createD1Fixture(name);
  await applyPersonDiscoveryMigrations(fixture.database);
  const seeded = await seedExplicitApprovedProspect(fixture);
  return Object.freeze({ ...fixture, ...seeded });
}

export async function loadPersonDiscoveryModules(fixture) {
  const [discovery, testPort, repository] = await Promise.all([
    fixture.vite.ssrLoadModule(new URL("../../domain/person-discovery.ts", import.meta.url).pathname),
    fixture.vite.ssrLoadModule(new URL("./person-discovery-test-port.ts", import.meta.url).pathname),
    fixture.vite.ssrLoadModule(new URL("../../domain/person-discovery-repository.ts", import.meta.url).pathname),
  ]);
  return Object.freeze({ discovery, testPort, repository });
}

async function seedExplicitApprovedProspect(fixture) {
  const seeded = await seedProfileAuthority(fixture, PERSON_DISCOVERY_OWNER, PERSON_DISCOVERY_NOW);
  const readiness = await fixture.vite.ssrLoadModule(
    new URL("../../domain/profile-readiness.ts", import.meta.url).pathname,
  );
  const contactStrategy = {
    mailboxVerifiedEmailFreshnessMs: 7 * 24 * 60 * 60 * 1000,
    sourceVerifiedEmailFreshnessMs: 11 * 24 * 60 * 60 * 1000,
    verifiedBusinessPhoneFreshnessMs: 13 * 24 * 60 * 60 * 1000,
  };
  await fixture.database.batch([
    fixture.database.prepare("INSERT INTO knowledge_versions (id,workspace_id,created_at,updated_at,revision,scope_type,scope_id,kind,value_json,status,source_digest,knowledge_item_id,proposal_id,decision_id,authority_command_id,value_digest,predecessor_version_id) SELECT 'person-discovery-contact-policy-version',workspace_id,created_at,updated_at,2,scope_type,scope_id,kind,?,'confirmed',source_digest,knowledge_item_id,proposal_id,decision_id,authority_command_id,?,id FROM knowledge_versions WHERE id='phase4-version-7' AND kind='contact_policy'")
      .bind(JSON.stringify(contactStrategy), "7".repeat(64)),
    fixture.database.prepare("UPDATE knowledge_items SET current_version_id='person-discovery-contact-policy-version' WHERE current_version_id='phase4-version-7'"),
  ]);
  const candidate = await readiness.createProfileConfigurationCandidate(fixture.database, PERSON_DISCOVERY_OWNER, {
    profileId: seeded.profileId,
    expectedProfileRevision: seeded.revision,
    now: PERSON_DISCOVERY_NOW,
    idempotencyKey: "019bff00-0000-7000-8000-000000000001",
  });
  const activation = await readiness.activateProfileConfiguration(fixture.database, PERSON_DISCOVERY_OWNER, {
    candidateId: candidate.id,
    expectedRevision: candidate.revision,
    expectedDigest: candidate.digest,
    now: PERSON_DISCOVERY_NOW,
    idempotencyKey: "019bff00-0000-7000-8000-000000000002",
  });
  const { workspaceId, profileId } = seeded;
  await fixture.database.batch([
    fixture.database.prepare("INSERT INTO authority_commands (id,workspace_id,created_at,updated_at,revision,command_type,idempotency_key,operation_digest,expected_revision,subject_type,subject_id,status) VALUES ('person-discovery-assignment-command',?,?,?,1,'test.person_discovery.assignment','person-discovery-assignment-key',?,1,'prospecting_run',?,'accepted')").bind(workspaceId, PERSON_DISCOVERY_NOW, PERSON_DISCOVERY_NOW, "19".repeat(32), activation.initialRun.id),
    fixture.database.prepare("INSERT INTO audit_events (id,workspace_id,actor_type,actor_id,action,subject_type,subject_id,detail_json,created_at) VALUES ('person-discovery-assignment-audit',?,'system','synthetic','test.person_discovery.assignment','prospecting_run',?,'{}',?)").bind(workspaceId, activation.initialRun.id, PERSON_DISCOVERY_NOW),
    fixture.database.prepare("UPDATE prospecting_runs SET execution_state='queued' WHERE id=? AND workspace_id=?").bind(activation.initialRun.id, workspaceId),
    fixture.database.prepare("INSERT INTO runner_assignments (id,workspace_id,created_at,updated_at,revision,run_id,profile_id,configuration_id,configuration_digest,audience,token_hash,nonce_hash,instruction_version,tool_configuration_digest,quota_json,quota_digest,expires_at,status,authority_command_id,audit_event_id) VALUES ('person-discovery-assignment',?,?,?,1,?,?,?,?,'synthetic',?,?,'v1',?,'{}',?,?,'issued','person-discovery-assignment-command','person-discovery-assignment-audit')").bind(workspaceId, PERSON_DISCOVERY_NOW, PERSON_DISCOVERY_NOW, activation.initialRun.id, profileId, activation.configuration.id, activation.configuration.digest, "2".repeat(64), "3".repeat(64), "4".repeat(64), "5".repeat(64), PERSON_DISCOVERY_NOW + 100_000),
    fixture.database.prepare("UPDATE prospecting_runs SET execution_state='assigned' WHERE id=? AND workspace_id=?").bind(activation.initialRun.id, workspaceId),
    fixture.database.prepare("INSERT INTO runner_submissions (id,workspace_id,run_id,assignment_id,configuration_id,submission_json,submission_digest,provenance_json,provenance_digest,status,operation_digest,idempotency_key,created_at) VALUES ('person-discovery-submission',?,?,'person-discovery-assignment',?,'{}',?,'{}',?,'accepted',?,'person-discovery-submission-key',?)").bind(workspaceId, activation.initialRun.id, activation.configuration.id, "6".repeat(64), "7".repeat(64), "8".repeat(64), PERSON_DISCOVERY_NOW),
    fixture.database.prepare("INSERT INTO prospecting_candidates (id,workspace_id,created_at,updated_at,revision,profile_id,offer_id,run_id,submission_id,configuration_id,fingerprint,candidate_json,candidate_digest,status) VALUES ('person-discovery-company-candidate',?,?,?,1,?,'phase4-offer',?,'person-discovery-submission',?,?,'{}',?,'observed')").bind(workspaceId, PERSON_DISCOVERY_NOW, PERSON_DISCOVERY_NOW, profileId, activation.initialRun.id, activation.configuration.id, "9".repeat(64), "a".repeat(64)),
    fixture.database.prepare("INSERT INTO qualification_assessments (id,workspace_id,candidate_id,configuration_id,configuration_digest,input_json,input_digest,anchor_json,evidence_json,gate_json,score_json,score,outcome,tie_order,assessment_digest,predecessor_assessment_id,created_at) VALUES ('person-discovery-assessment',?,'person-discovery-company-candidate',?,?,'{}',?,'{}','{}','{}','{}',9,'Passed','[]',?,NULL,?)").bind(workspaceId, activation.configuration.id, activation.configuration.digest, "b".repeat(64), "c".repeat(64), PERSON_DISCOVERY_NOW),
    fixture.database.prepare("INSERT INTO profile_prospects (id,workspace_id,created_at,updated_at,revision,profile_id,offer_id,candidate_id,assessment_id,fingerprint,state,active) VALUES ('person-discovery-prospect',?,?,?,1,?,'phase4-offer','person-discovery-company-candidate','person-discovery-assessment',?,'approved',1)").bind(workspaceId, PERSON_DISCOVERY_NOW, PERSON_DISCOVERY_NOW, profileId, "d".repeat(64)),
    fixture.database.prepare("INSERT INTO authority_commands (id,workspace_id,created_at,updated_at,revision,command_type,idempotency_key,operation_digest,expected_revision,subject_type,subject_id,status) VALUES ('person-discovery-review-command',?,?,?,1,'prospect.review','person-discovery-review-key',?,1,'profile_prospect','person-discovery-prospect','accepted')").bind(workspaceId, PERSON_DISCOVERY_NOW, PERSON_DISCOVERY_NOW, "29".repeat(32)),
    fixture.database.prepare("INSERT INTO audit_events (id,workspace_id,actor_type,actor_id,action,subject_type,subject_id,detail_json,created_at) VALUES ('person-discovery-review-audit',?,'owner',?,'prospect.reviewed','profile_prospect','person-discovery-prospect','{}',?)").bind(workspaceId, PERSON_DISCOVERY_OWNER.subject, PERSON_DISCOVERY_NOW),
    fixture.database.prepare("INSERT INTO prospect_review_decisions (id,workspace_id,prospect_id,assessment_id,decision,reason,review_at,expected_prospect_revision,authority_command_id,audit_event_id,decision_digest,operation_digest,idempotency_key,created_at) VALUES ('person-discovery-review',?,'person-discovery-prospect','person-discovery-assessment','approve','explicit_synthetic_approval',NULL,1,'person-discovery-review-command','person-discovery-review-audit',?,?,'person-discovery-review-key',?)").bind(workspaceId, "f".repeat(64), "e".repeat(64), PERSON_DISCOVERY_NOW),
  ]);
  const authority = await fixture.database.prepare(`SELECT p.revision prospect_revision,cfg.id configuration_id,cfg.digest configuration_digest,cfg.revision configuration_revision
    FROM profile_prospects p JOIN typed_configurations cfg ON cfg.workspace_id=p.workspace_id AND cfg.owner_type='profile' AND cfg.owner_id=p.profile_id AND cfg.kind='profile_effective' AND cfg.active=1
    WHERE p.id='person-discovery-prospect' AND p.workspace_id=?`).bind(workspaceId).first();
  assert.ok(authority, "the explicit synthetic Approved Prospect must resolve its current configuration");
  return Object.freeze({
    workspaceId,
    profileId,
    prospectId: "person-discovery-prospect",
    prospectRevision: Number(authority.prospect_revision),
    configurationId: authority.configuration_id,
    configurationDigest: authority.configuration_digest,
    configurationRevision: Number(authority.configuration_revision),
    contactStrategy,
    scope: Object.freeze({ workspaceId, principalSubject: PERSON_DISCOVERY_OWNER.subject }),
  });
}
