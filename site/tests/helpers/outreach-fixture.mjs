import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { applyMigrations } from "./d1.mjs";
import { seedProfileAuthority } from "./phase4.mjs";

export const OUTREACH_NOW = 1_790_500_000_000;
export const OUTREACH_OWNER = Object.freeze({
  subject: "outreach-persistence-owner",
  legacySubject: "outreach-persistence-owner-legacy",
  displayName: "Synthetic outreach owner",
});

const attestors = new WeakMap();

export async function applyOutreachMigrations(database) {
  await applyMigrations(database);
  const sql = await readFile(new URL("../../drizzle/0010_governed_outreach.sql", import.meta.url), "utf8");
  for (const statement of sql.split("--> statement-breakpoint")) {
    const trimmed = statement.trim();
    if (trimmed) await database.prepare(trimmed).run();
  }
}

export async function seedOutreachAuthority(fixture) {
  await applyOutreachMigrations(fixture.database);
  const seeded = await seedApprovedProspect(fixture);
  const repositoryModule = await fixture.vite.ssrLoadModule(
    new URL("../../domain/enrichment-repository.ts", import.meta.url).pathname,
  );
  const issuance = await fixture.vite.ssrLoadModule(
    new URL("../../domain/enrichment-grant-issuance.ts", import.meta.url).pathname,
  );
  const authority = await fixture.vite.ssrLoadModule(
    new URL("../../domain/enrichment-authority.ts", import.meta.url).pathname,
  );
  const repository = repositoryModule.createD1EnrichmentRepository(fixture.database, {
    workspaceId: seeded.workspaceId,
    ownerSubject: OUTREACH_OWNER.subject,
    now: () => OUTREACH_NOW,
    contactSettlementAttestor: await testAttestor(fixture),
  });
  await fixture.database.prepare(
    `INSERT INTO provider_quotes
      (id,workspace_id,provider_id,provider_version,catalog_ref,revision,operation,currency,unit_cost_minor,quote_digest,expires_at,created_at)
     VALUES ('outreach-quote',?,'synthetic-provider','v1','synthetic-catalog',1,'business_contact_lookup/v1','CAD',10,?,?,?)`,
  ).bind(seeded.workspaceId, "1".repeat(64), OUTREACH_NOW + 10_000, OUTREACH_NOW).run();
  const snapshot = await repository.loadIssuanceSnapshot(OUTREACH_OWNER.subject, [seeded.prospectId]);
  assert.equal(snapshot?.admitted, true);
  const issued = await issuance.issueEnrichmentGrant(repository, {
    principalSubject: OUTREACH_OWNER.subject,
    prospectIds: [seeded.prospectId],
    operation: "business_contact_lookup/v1",
    maxUnits: 1,
    maxCostMinor: 10,
    currency: "CAD",
    expiresAt: OUTREACH_NOW + 5_000,
    expectedRevision: snapshot.revision,
    idempotencyKey: "outreach-synthetic-enrichment-grant",
    now: OUTREACH_NOW + 1,
  });
  assert.equal(issued.kind, "issued");
  await seedReservationInputs(fixture.database, seeded, issued.grant);
  const reserved = await authority.reserveEnrichmentOperation(repository, {
    grantId: issued.grant.id,
    principalSubject: OUTREACH_OWNER.subject,
    operationKey: issued.grant.tuple.operationKey,
    now: OUTREACH_NOW + 2,
  });
  assert.equal(reserved.kind, "reserved");
  assert.equal((await authority.claimAdmittedCommittedInvocation(repository, reserved.reservation.id, OUTREACH_NOW + 3)).kind, "claimed");
  const observation = await makeObservation(fixture, reserved, issued.grant);
  const settlementIdentity = await authority.deriveEnrichmentSettlementIdentity({
    reservationId: reserved.reservation.id,
    terminalState: "settled",
    terminalReason: "completed",
    documentedUnits: 1,
    documentedCostMinor: 10,
    observations: [observation],
  });
  await repository.settleReservation(reserved.reservation.id, {
    state: "settled",
    documentedUnits: 1,
    documentedCostMinor: 10,
    reason: "completed",
    observations: [observation],
    settlementDigest: settlementIdentity.settlementDigest,
  });
  const lineage = await fixture.database.prepare(
    `SELECT p.revision prospect_revision,c.revision contact_revision,cfg.revision configuration_revision,cfg.digest configuration_digest
     FROM profile_prospects p JOIN contacts c ON c.id='outreach-contact' AND c.workspace_id=p.workspace_id
     JOIN typed_configurations cfg ON cfg.id=? AND cfg.workspace_id=p.workspace_id
     WHERE p.id=? AND p.workspace_id=?`,
  ).bind(seeded.configurationId, seeded.prospectId, seeded.workspaceId).first();
  const eligibilityDigest = "2".repeat(64);
  await fixture.database.prepare(
    `INSERT INTO contact_eligibility_snapshots (
      id,workspace_id,contact_id,prospect_id,configuration_id,configuration_digest,configuration_revision,
      prospect_revision,state,eligible,observation_ids_json,reason_codes_json,preserved_suppression_refs_json,snapshot_digest,projected_at
    ) VALUES ('outreach-eligibility',?,'outreach-contact',?,?,?, ?,?,'ContactReady',1,?,'[]','[]',?,?)`,
  ).bind(
    seeded.workspaceId, seeded.prospectId, seeded.configurationId, lineage.configuration_digest,
    lineage.configuration_revision, lineage.prospect_revision, JSON.stringify([observation.id]),
    eligibilityDigest, OUTREACH_NOW,
  ).run();
  const sourceDigest = "3".repeat(64);
  await fixture.database.prepare(
    `INSERT INTO sources
      (id,workspace_id,created_at,updated_at,revision,origin,opaque_locator,source_digest,privacy,license,status)
     VALUES ('outreach-source',?,?,?,1,'public_research','synthetic:outreach-source',?,'public','synthetic-test-only','available')`,
  ).bind(seeded.workspaceId, OUTREACH_NOW, OUTREACH_NOW, sourceDigest).run();
  const evidenceDigest = "4".repeat(64);
  await fixture.database.prepare(
    `INSERT INTO prospecting_source_lineage
      (id,workspace_id,run_id,submission_id,source_id,source_url,publisher_identity,underlying_origin_identity,
       independence_group,source_tier,published_at,occurred_at,retrieved_at,excerpt,lineage_json,lineage_digest,created_at)
     VALUES ('outreach-evidence',?,?,'outreach-submission','outreach-source','https://example.invalid/evidence',
       'synthetic-publisher','synthetic-origin','synthetic-independent',1,?,?,?,'synthetic evidence','{}',?,?)`,
  ).bind(seeded.workspaceId, seeded.runId, OUTREACH_NOW - 10, OUTREACH_NOW - 10, OUTREACH_NOW - 5, evidenceDigest, OUTREACH_NOW).run();
  const guardrailDigest = "5".repeat(64);
  await fixture.database.prepare(
    `INSERT INTO knowledge_versions
      (id,workspace_id,created_at,updated_at,revision,scope_type,scope_id,kind,value_json,value_digest,status,source_digest)
     VALUES ('outreach-guardrail',?,?,?,1,'profile',?,'claim_guardrail','{}',?,'confirmed',?)`,
  ).bind(seeded.workspaceId, OUTREACH_NOW, OUTREACH_NOW, seeded.profileId, guardrailDigest, sourceDigest).run();
  return Object.freeze({
    ...seeded,
    contactId: "outreach-contact",
    contactRevision: Number(lineage.contact_revision),
    prospectRevision: Number(lineage.prospect_revision),
    configurationRevision: Number(lineage.configuration_revision),
    eligibilityId: "outreach-eligibility",
    eligibilityDigest,
    sourceDigest,
    evidenceDigest,
    guardrailDigest,
    observationId: observation.id,
    observationDigest: settlementIdentity.observationBindings[0].observationDigest,
  });
}

async function seedApprovedProspect(fixture) {
  const seeded = await seedProfileAuthority(fixture, OUTREACH_OWNER, OUTREACH_NOW);
  const readiness = await fixture.vite.ssrLoadModule(
    new URL("../../domain/profile-readiness.ts", import.meta.url).pathname,
  );
  const candidate = await readiness.createProfileConfigurationCandidate(fixture.database, OUTREACH_OWNER, {
    profileId: seeded.profileId,
    expectedProfileRevision: seeded.revision,
    now: OUTREACH_NOW,
    idempotencyKey: "0198f500-1000-7000-8000-000000000001",
  });
  const activation = await readiness.activateProfileConfiguration(fixture.database, OUTREACH_OWNER, {
    candidateId: candidate.id,
    expectedRevision: candidate.revision,
    expectedDigest: candidate.digest,
    now: OUTREACH_NOW,
    idempotencyKey: "0198f500-1000-7000-8000-000000000002",
  });
  const workspaceId = seeded.workspaceId;
  await fixture.database.batch([
    fixture.database.prepare("INSERT INTO authority_commands (id,workspace_id,created_at,updated_at,revision,command_type,idempotency_key,operation_digest,expected_revision,subject_type,subject_id,status) VALUES ('outreach-assignment-command',?,?,?,1,'test.outreach.assignment','outreach-assignment-key',?,1,'prospecting_run',?,'accepted')").bind(workspaceId, OUTREACH_NOW, OUTREACH_NOW, "6".repeat(64), activation.initialRun.id),
    fixture.database.prepare("INSERT INTO audit_events (id,workspace_id,actor_type,actor_id,action,subject_type,subject_id,detail_json,created_at) VALUES ('outreach-assignment-audit',?,'system','synthetic','test.outreach','prospecting_run',?,'{}',?)").bind(workspaceId, activation.initialRun.id, OUTREACH_NOW),
    fixture.database.prepare("UPDATE prospecting_runs SET execution_state='queued' WHERE id=? AND workspace_id=?").bind(activation.initialRun.id, workspaceId),
    fixture.database.prepare("INSERT INTO runner_assignments (id,workspace_id,created_at,updated_at,revision,run_id,profile_id,configuration_id,configuration_digest,audience,token_hash,nonce_hash,instruction_version,tool_configuration_digest,quota_json,quota_digest,expires_at,status,authority_command_id,audit_event_id) VALUES ('outreach-assignment',?,?,?,1,?,?,?,?,'synthetic',?,?,'v1',?,'{}',?,?,'issued','outreach-assignment-command','outreach-assignment-audit')").bind(workspaceId, OUTREACH_NOW, OUTREACH_NOW, activation.initialRun.id, seeded.profileId, activation.configuration.id, activation.configuration.digest, "7".repeat(64), "8".repeat(64), "9".repeat(64), "a".repeat(64), OUTREACH_NOW + 100_000),
    fixture.database.prepare("UPDATE prospecting_runs SET execution_state='assigned' WHERE id=? AND workspace_id=?").bind(activation.initialRun.id, workspaceId),
    fixture.database.prepare("INSERT INTO runner_submissions (id,workspace_id,run_id,assignment_id,configuration_id,submission_json,submission_digest,provenance_json,provenance_digest,status,operation_digest,idempotency_key,created_at) VALUES ('outreach-submission',?,?,'outreach-assignment',?,'{}',?,'{}',?,'accepted',?,'outreach-submission-key',?)").bind(workspaceId, activation.initialRun.id, activation.configuration.id, "b".repeat(64), "c".repeat(64), "d".repeat(64), OUTREACH_NOW),
    fixture.database.prepare("INSERT INTO prospecting_candidates (id,workspace_id,created_at,updated_at,revision,profile_id,offer_id,run_id,submission_id,configuration_id,fingerprint,candidate_json,candidate_digest,status) VALUES ('outreach-candidate',?,?,?,1,?,'phase4-offer',?,'outreach-submission',?,?,'{}',?,'qualified')").bind(workspaceId, OUTREACH_NOW, OUTREACH_NOW, seeded.profileId, activation.initialRun.id, activation.configuration.id, "e".repeat(64), "f".repeat(64)),
    fixture.database.prepare("INSERT INTO qualification_assessments (id,workspace_id,candidate_id,configuration_id,configuration_digest,input_json,input_digest,anchor_json,evidence_json,gate_json,score_json,score,outcome,tie_order,assessment_digest,predecessor_assessment_id,created_at) VALUES ('outreach-assessment',?,'outreach-candidate',?,?,'{}',?,'{}','{}','{}','{}',8,'Passed','[]',?,NULL,?)").bind(workspaceId, activation.configuration.id, activation.configuration.digest, "1".repeat(64), "2".repeat(64), OUTREACH_NOW),
    fixture.database.prepare("INSERT INTO profile_prospects (id,workspace_id,created_at,updated_at,revision,profile_id,offer_id,candidate_id,assessment_id,fingerprint,state,active) VALUES ('outreach-prospect',?,?,?,1,?,'phase4-offer','outreach-candidate','outreach-assessment',?,'approved',1)").bind(workspaceId, OUTREACH_NOW, OUTREACH_NOW, seeded.profileId, "3".repeat(64)),
    fixture.database.prepare("INSERT INTO authority_commands (id,workspace_id,created_at,updated_at,revision,command_type,idempotency_key,operation_digest,expected_revision,subject_type,subject_id,status) VALUES ('outreach-review-command',?,?,?,1,'prospect.review','outreach-review-key',?,1,'profile_prospect','outreach-prospect','accepted')").bind(workspaceId, OUTREACH_NOW, OUTREACH_NOW, "4".repeat(64)),
    fixture.database.prepare("INSERT INTO audit_events (id,workspace_id,actor_type,actor_id,action,subject_type,subject_id,detail_json,created_at) VALUES ('outreach-review-audit',?,'owner',?,'prospect.reviewed','profile_prospect','outreach-prospect','{}',?)").bind(workspaceId, OUTREACH_OWNER.subject, OUTREACH_NOW),
    fixture.database.prepare("INSERT INTO prospect_review_decisions (id,workspace_id,prospect_id,assessment_id,decision,reason,review_at,expected_prospect_revision,authority_command_id,audit_event_id,decision_digest,operation_digest,idempotency_key,created_at) VALUES ('outreach-review',?,'outreach-prospect','outreach-assessment','approve','synthetic_approved',NULL,1,'outreach-review-command','outreach-review-audit',?,?,'outreach-review-key',?)").bind(workspaceId, "5".repeat(64), "4".repeat(64), OUTREACH_NOW),
  ]);
  return { ...seeded, workspaceId, profileId: seeded.profileId, configurationId: activation.configuration.id, configurationDigest: activation.configuration.digest, prospectId: "outreach-prospect", runId: activation.initialRun.id };
}

async function seedReservationInputs(database, seeded, grant) {
  const company = await database.prepare("SELECT id FROM companies WHERE workspace_id=? LIMIT 1").bind(seeded.workspaceId).first();
  await database.prepare(
    "INSERT INTO contacts (id,workspace_id,created_at,updated_at,revision,company_id,identity_digest,display_name) VALUES ('outreach-contact',?,?,?,1,?,?,'Synthetic Contact')",
  ).bind(seeded.workspaceId, OUTREACH_NOW, OUTREACH_NOW, company.id, "6".repeat(64)).run();
  await database.prepare(
    `INSERT INTO contact_evidence_assignments
      (id,workspace_id,reservation_id,grant_id,prospect_id,contact_id,role,configuration_id,configuration_digest,provider_id,provider_version,catalog_ref,quote_revision,assignment_digest,created_at)
     VALUES ('outreach-contact-assignment',?,NULL,?,'outreach-prospect','outreach-contact','champion',?,?,?,?,?,1,?,?)`,
  ).bind(seeded.workspaceId, grant.id, grant.tuple.configurationId, grant.tuple.configurationDigest, grant.tuple.providerId, grant.tuple.providerVersion, grant.tuple.catalogRef, "7".repeat(64), OUTREACH_NOW).run();
  for (const [scope, entityId] of Object.entries({ grant: grant.id, profile: grant.tuple.configurationId, workspace: seeded.workspaceId, provider: grant.tuple.providerId })) {
    const accountId = `enrichment:${seeded.workspaceId.length}:${seeded.workspaceId}:${scope}:${entityId.length}:${entityId}`;
    await database.prepare(
      `INSERT INTO enrichment_budget_accounts
        (id,workspace_id,authority_type,scope,entity_id,currency,actual_units,reserved_units,max_units,actual_cost_minor,reserved_cost_minor,max_cost_minor,revision,created_at,updated_at)
       VALUES (?,?,'enrichment',?,?,'CAD',0,0,1,0,0,10,1,?,?)`,
    ).bind(accountId, seeded.workspaceId, scope, entityId, OUTREACH_NOW, OUTREACH_NOW).run();
  }
}

async function makeObservation(fixture, reserved, grant) {
  const contactEvidence = await fixture.vite.ssrLoadModule(new URL("../../domain/contact-evidence.ts", import.meta.url).pathname);
  const binding = reserved.reservation.assignment.evidenceAssignments[0];
  const providerAuthority = { providerId: grant.tuple.providerId, providerVersion: grant.tuple.providerVersion, catalogRef: grant.tuple.catalogRef };
  const envelope = {
    id: "outreach-observation", assignmentId: binding.assignmentId, prospectId: binding.prospectId,
    workspaceId: binding.workspaceId, contactId: binding.contactId, profileConfigurationId: binding.profileConfigurationId,
    profileConfigurationDigest: binding.profileConfigurationDigest, kind: "email", value: "verified@example.invalid", confidence: 1,
    provenance: { sourceReference: "source:synthetic", excerpt: "synthetic verification", objectReference: "object:synthetic", contentHash: "8".repeat(64), retrievedAt: OUTREACH_NOW - 4 },
    observedAt: OUTREACH_NOW - 2,
  };
  const verifier = contactEvidence.bindContactEvidenceVerifier(
    { verifierId: "synthetic-verifier", verifierVersion: "v1" },
    async () => ({
      observationId: envelope.id, workspaceId: envelope.workspaceId, contactId: envelope.contactId,
      profileConfigurationId: envelope.profileConfigurationId, profileConfigurationDigest: envelope.profileConfigurationDigest,
      kind: envelope.kind, normalizedValue: envelope.value, contentHash: envelope.provenance.contentHash,
      verificationClass: "mailbox_verified", method: "mailbox_verification", verifiedAt: OUTREACH_NOW - 3,
      ...providerAuthority, verdictReference: "verdict:synthetic", verdictDigest: "9".repeat(64),
    }),
  );
  const receipt = await contactEvidence.executeContactVerification(verifier, {
    assignmentId: binding.assignmentId, prospectId: binding.prospectId, role: binding.role,
    assignment: { workspaceId: binding.workspaceId, contactId: binding.contactId, profileConfigurationId: binding.profileConfigurationId, profileConfigurationDigest: binding.profileConfigurationDigest, ...providerAuthority, quoteRevision: grant.tuple.quoteRevision },
    envelope,
  });
  const result = contactEvidence.ingestContactEvidence({ ...binding, quoteRevision: grant.tuple.quoteRevision, providerAuthority }, envelope, receipt);
  assert.equal(result.accepted, true);
  return result.observation;
}

async function testAttestor(fixture) {
  if (attestors.has(fixture)) return attestors.get(fixture);
  const promise = (async () => {
    const attestorModule = await fixture.vite.ssrLoadModule(new URL("../../domain/contact-settlement-attestor.ts", import.meta.url).pathname);
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode("outreach-local-synthetic-attestation-key"), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
    return attestorModule.bindContactSettlementAttestor({ active: { keyId: "outreach-synthetic-key", key }, verificationOnly: [] });
  })();
  attestors.set(fixture, promise);
  return promise;
}
