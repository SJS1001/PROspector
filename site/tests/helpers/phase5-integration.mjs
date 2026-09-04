import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { seedProfileAuthority } from "./phase4.mjs";

export const NOW = 1_810_000_000_000;
export const OWNER = Object.freeze({
  subject: "phase5-integration-owner",
  legacySubject: "phase5-integration-owner-legacy",
  displayName: "Phase 5 integration owner",
});
const RUNNER_SECRET = new TextEncoder().encode("phase5-integration-runner-secret-at-least-32-bytes");

/** Cross the existing Phase 4 services to a persisted Approved Prospect. */
export async function createApprovedProspectLifecycle(fixture) {
  const [readiness, runner, handler, review] = await Promise.all([
    load(fixture, "profile-readiness"), load(fixture, "runner-assignment"),
    load(fixture, "prospecting-handler"), load(fixture, "prospect-review"),
  ]);
  const seeded = await seedProfileAuthority(fixture, OWNER, NOW);
  const candidate = await readiness.createProfileConfigurationCandidate(fixture.database, OWNER, {
    profileId: seeded.profileId, expectedProfileRevision: seeded.revision, now: NOW,
    idempotencyKey: "0198f500-0000-7000-8000-000000000101",
  });
  const activation = await readiness.activateProfileConfiguration(fixture.database, OWNER, {
    candidateId: candidate.id, expectedRevision: candidate.revision, expectedDigest: candidate.digest, now: NOW,
    idempotencyKey: "0198f500-0000-7000-8000-000000000102",
  });
  assert.equal(activation.initialRun.executionState, "blocked_missing_capability");

  // This is the same synthetic lease handoff used by the existing Phase 4
  // integration test. It does not activate a scheduler or production ingress.
  await fixture.database.batch([
    fixture.database.prepare("INSERT INTO organizations (id,workspace_id,created_at,updated_at,revision,company_id,canonical_name,identity_digest) SELECT 'p5i-org',?,?,?,1,id,'Synthetic operator',? FROM companies WHERE workspace_id=?").bind(seeded.workspaceId,NOW,NOW,"a".repeat(64),seeded.workspaceId),
    fixture.database.prepare("INSERT INTO accounts (id,workspace_id,created_at,updated_at,revision,play_id,organization_id,state) SELECT 'p5i-account',?,?,?,1,play_id,'p5i-org','draft' FROM customer_profiles WHERE id=?").bind(seeded.workspaceId,NOW,NOW,seeded.profileId),
    fixture.database.prepare("INSERT INTO targets (id,workspace_id,created_at,updated_at,revision,profile_id,account_id,state) VALUES ('p5i-target',?,?,?,1,?,'p5i-account','draft')").bind(seeded.workspaceId,NOW,NOW,seeded.profileId),
    fixture.database.prepare("UPDATE prospecting_runs SET execution_state='queued' WHERE id=? AND execution_state='blocked_missing_capability'").bind(activation.initialRun.id),
  ]);
  const assignment = await runner.issueRunnerAssignment(fixture.database, {
    workspaceId: seeded.workspaceId, runId: activation.initialRun.id, profileId: seeded.profileId,
    configurationId: activation.configuration.id, configurationDigest: activation.configuration.digest,
    audience: "prospecting-runner/v1", expiresAt: NOW + 60_000, instructionVersion: "runner-instructions/v1",
    toolConfigurationDigest: "f".repeat(64), quotas: { maxBytes: 20_000, maxFindings: 3, maxSources: 3 },
    grantReference: "synthetic", reason: "synthetic integration", idempotencyKey: "p5i-assignment",
    now: NOW, capabilitySecret: RUNNER_SECRET,
  });
  const payload = {
    status: "complete",
    findings: [{ kind: "operating-signal", sourceUrl: "https://example.invalid/p5i", observedAt: NOW, excerpt: "Synthetic observation" }],
    sources: [{ url: "https://example.invalid/p5i", retrievedAt: NOW, excerpt: "Synthetic source", publisher: "Synthetic" }],
    provenance: { provider: "runner-provider", model: "runner-model", instructionVersion: "runner-instructions/v1", toolConfigurationDigest: "f".repeat(64), tools: [], transformations: [] },
  };
  const submitted = await runner.submitRunnerObservations(fixture.database, {
    capability: assignment.capability, idempotencyKey: "p5i-submission", payload, now: NOW + 2,
    capabilitySecret: RUNNER_SECRET,
  });
  assert.equal(submitted.replayed, false);
  const replay = await handler.handleRunnerIngress(new Request("https://prospector.test/api/prospecting/runner", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ capability: assignment.capability, idempotencyKey: "p5i-submission", payload }),
  }), {
    database: fixture.database, runnerIngressEnabled: true, runnerCapabilitySecret: RUNNER_SECRET, now: () => NOW + 3,
    candidateMaterializer: () => [{ targetId: "p5i-target", accountFit: 2, painStrength: 2, timingUrgency: 1, dataReadiness: 1, commercialViability: 1, requiredEvidence: ["target", "pain", "timing", "operation", "offer"] }],
  });
  assert.equal(replay.status, 200);
  assert.equal((await replay.json()).replayed, true);
  const prospect = await fixture.database.prepare("SELECT id,assessment_id,revision,state FROM profile_prospects WHERE workspace_id=? LIMIT 1").bind(seeded.workspaceId).first();
  assert.equal(prospect.state, "qualified");
  const decision = await review.decideQualifiedProspect(fixture.database, OWNER, {
    prospectId: prospect.id, assessmentId: prospect.assessment_id, decision: "approve",
    reason: "Synthetic owner approval; enrichment remains separately bounded.", expectedRevision: Number(prospect.revision),
    idempotencyKey: "p5i-prospect-approval", now: NOW + 4,
  });
  assert.equal(decision.state, "approved");
  return Object.freeze({
    ...seeded, owner: OWNER, configurationId: activation.configuration.id,
    configurationDigest: activation.configuration.digest, prospectId: prospect.id,
  });
}

export async function snapshotLaterPhaseEffects(database) {
  const result = {};
  for (const name of [
    "outreach_artifact_bindings", "outreach_audit_records", "outreach_commands",
    "outreach_message_approval_consumptions", "outreach_message_approvals", "outreach_message_versions",
    "outreach_messages", "outreach_package_approvals", "outreach_package_versions", "outreach_packages",
    "outreach_stop_events", "outreach_suppression_tombstones",
    "message_versions", "message_dispatches", "export_jobs", "workspace_archives",
  ]) {
    const table = await database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").bind(name).first();
    result[name] = table ? Number((await database.prepare(`SELECT COUNT(*) count FROM ${name}`).first()).count) : null;
  }
  return result;
}

export async function applyEnrichmentLineageCandidate(database) {
  for (const name of ["0010_governed_outreach.sql", "0011_enrichment_candidate_lineage.sql"]) {
    const sql = await readFile(new URL(`../../drizzle/${name}`, import.meta.url), "utf8");
    for (const statement of sql.split("--> statement-breakpoint")) {
      if (statement.trim()) await database.prepare(statement.trim()).run();
    }
  }
}

export async function seedSyntheticReservationInputs(database, lifecycle, grant) {
  await database.prepare("INSERT INTO contacts (id,workspace_id,created_at,updated_at,revision,company_id,identity_digest,display_name) SELECT 'p5i-contact',?,?,?,1,id,?,'Synthetic contact' FROM companies WHERE workspace_id=?")
    .bind(lifecycle.workspaceId,NOW,NOW,"c".repeat(64),lifecycle.workspaceId).run();
  await database.prepare(`INSERT INTO contact_evidence_assignments
    (id,workspace_id,reservation_id,grant_id,prospect_id,contact_id,role,configuration_id,configuration_digest,provider_id,provider_version,catalog_ref,quote_revision,assignment_digest,created_at)
    VALUES ('p5i-contact-assignment',?,NULL,?,?,'p5i-contact','champion',?,?,?,?,?,1,?,?)`)
    .bind(lifecycle.workspaceId,grant.id,lifecycle.prospectId,grant.tuple.configurationId,grant.tuple.configurationDigest,grant.tuple.providerId,grant.tuple.providerVersion,grant.tuple.catalogRef,"d".repeat(64),NOW).run();
  for (const [scope, entityId] of Object.entries({ grant:grant.id,profile:grant.tuple.configurationId,workspace:lifecycle.workspaceId,provider:grant.tuple.providerId })) {
    const accountId = `enrichment:${lifecycle.workspaceId.length}:${lifecycle.workspaceId}:${scope}:${entityId.length}:${entityId}`;
    await database.prepare(`INSERT INTO enrichment_budget_accounts
      (id,workspace_id,authority_type,scope,entity_id,currency,actual_units,reserved_units,max_units,actual_cost_minor,reserved_cost_minor,max_cost_minor,revision,created_at,updated_at)
      VALUES (?,?,'enrichment',?,?,'CAD',0,0,1,0,0,10,1,?,?)`)
      .bind(accountId,lifecycle.workspaceId,scope,entityId,NOW,NOW).run();
  }
}

async function load(fixture, name) {
  return fixture.vite.ssrLoadModule(new URL(`../../domain/${name}.ts`, import.meta.url).pathname);
}
