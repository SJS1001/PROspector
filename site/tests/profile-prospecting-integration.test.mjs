import assert from "node:assert/strict";
import test from "node:test";
import { assertForbiddenOperationalRowsUnchanged, createD1Fixture, applyMigrations, snapshotForbiddenOperationalRows } from "./helpers/d1.mjs";
import { seedProfileAuthority } from "./helpers/phase4.mjs";

const NOW = 1_780_000_000_000;
const DIGEST = "a".repeat(64);
const RUNNER_SECRET = new TextEncoder().encode("phase4-integrated-runner-secret-at-least-32-bytes");

test("Phase 4 persisted synthetic lifecycle is replayable, auditable, and remains zero-effect", async () => {
  const fixture = await createD1Fixture("phase4-integration");
  try {
    await applyMigrations(fixture.database);
    const before = await snapshotForbiddenOperationalRows(fixture.database);
    const identity = { email: "phase4-lifecycle-owner@example.com", displayName: "Phase 4 lifecycle owner" };
    const subjectPepper = "phase4-lifecycle-owner-pepper-material-at-least-thirty-two-bytes";
    const access = await fixture.vite.ssrLoadModule(new URL("../domain/pilot-access.ts", import.meta.url).pathname);
    const handler = await fixture.vite.ssrLoadModule(new URL("../domain/prospecting-handler.ts", import.meta.url).pathname);
    const runner = await fixture.vite.ssrLoadModule(new URL("../domain/runner-assignment.ts", import.meta.url).pathname);
    const qualification = await fixture.vite.ssrLoadModule(new URL("../domain/qualification.ts", import.meta.url).pathname);
    const principal = await access.admitPilotOwner(identity, identity.email, subjectPepper);
    const seeded = await seedProfileAuthority(fixture, principal, NOW);
    const dependencies = { database: fixture.database, subjectPepper, pilotOwnerEmail: identity.email, async getIdentity() { return identity; } };
    const baseUrl = `https://prospector.test/api/prospecting?profileId=${encodeURIComponent(seeded.profileId)}`;
    const ownerPost = (cookie, body) => handler.handleProspectingPost(new Request(baseUrl, {
      method: "POST", headers: { "content-type": "application/json", cookie, origin: "https://prospector.test", "sec-fetch-site": "same-origin", "x-prospector-intent": handler.PROSPECTING_MUTATION_INTENT }, body: JSON.stringify(body),
    }), dependencies);

    // The persisted Phase 2/3-shaped authority is incomplete until the helper's
    // confirmed Profile authority is present; the owner route exposes that state.
    const initial = await handler.handleProspectingGet(new Request(baseUrl), dependencies);
    assert.equal(initial.status, 200);
    assert.equal((await initial.clone().json()).readiness.complete, true);
    let cookie = csrfCookie(initial);
    const create = await ownerPost(cookie, { action: "create_candidate", profileId: seeded.profileId, expectedRevision: seeded.revision, idempotencyKey: "0198f400-0000-7000-8000-000000001001" });
    assert.equal(create.status, 200);
    cookie = csrfCookie(create);
    const candidate = await fixture.database.prepare("SELECT id,revision,candidate_digest,status FROM profile_configuration_candidates WHERE workspace_id=?").bind(seeded.workspaceId).first();
    assert.deepEqual({ status: candidate.status, revision: Number(candidate.revision) }, { status: "candidate", revision: 1 });
    assert.match(candidate.candidate_digest, /^[a-f0-9]{64}$/);
    const activate = await ownerPost(cookie, { action: "activate", candidateId: candidate.id, expectedRevision: Number(candidate.revision), expectedDigest: candidate.candidate_digest, idempotencyKey: "0198f400-0000-7000-8000-000000001002" });
    assert.equal(activate.status, 200);
    cookie = csrfCookie(activate);
    const active = await fixture.database.prepare("SELECT c.id,c.digest FROM typed_configurations c WHERE c.workspace_id=? AND c.owner_type='profile' AND c.owner_id=? AND c.active=1").bind(seeded.workspaceId, seeded.profileId).first();
    const initialRun = await fixture.database.prepare("SELECT id,execution_state,manifest_digest FROM prospecting_runs WHERE workspace_id=? AND configuration_id=? AND trigger_kind='initial'").bind(seeded.workspaceId, active.id).first();
    assert.equal(initialRun.execution_state, "blocked_missing_capability", "activation has no runnable transport");
    assert.match(initialRun.manifest_digest, /^[a-f0-9]{64}$/);
    const manual = await ownerPost(cookie, { action: "manual_find", profileId: seeded.profileId, idempotencyKey: "0198f400-0000-7000-8000-000000001003" });
    assert.equal(manual.status, 200);
    cookie = csrfCookie(manual);
    assert.equal((await fixture.database.prepare("SELECT execution_state FROM prospecting_runs WHERE workspace_id=? AND trigger_kind='manual'").bind(seeded.workspaceId).first()).execution_state, "blocked_missing_capability");
    const ownerAssignment = await ownerPost(cookie, { action: "issue_assignment", runId: initialRun.id, profileId: seeded.profileId, configurationId: active.id, configurationDigest: active.digest, toolConfigurationDigest: "f".repeat(64), expiresAt: NOW + 60_000, idempotencyKey: "0198f400-0000-7000-8000-000000001004" });
    assert.equal(ownerAssignment.status, 409, "the browser route cannot mint runner capability");

    // There is intentionally no scheduler/transport admission route yet. This
    // test-only state transition represents the trusted runner lease handoff;
    // the public owner route above remains blocked and cannot mint a capability.
    await fixture.database.batch([
      fixture.database.prepare("INSERT INTO organizations (id,workspace_id,created_at,updated_at,revision,company_id,canonical_name,identity_digest) SELECT 'phase4-integrated-org',?,?,?,1,id,'Synthetic mining operator',? FROM companies WHERE workspace_id=?").bind(seeded.workspaceId,NOW,NOW,DIGEST,seeded.workspaceId),
      fixture.database.prepare("INSERT INTO accounts (id,workspace_id,created_at,updated_at,revision,play_id,organization_id,state) SELECT 'phase4-integrated-account',?,?,?,1,play_id,'phase4-integrated-org','draft' FROM customer_profiles WHERE id=?").bind(seeded.workspaceId,NOW,NOW,seeded.profileId),
      fixture.database.prepare("INSERT INTO targets (id,workspace_id,created_at,updated_at,revision,profile_id,account_id,state) VALUES ('phase4-integrated-target',?,?,?,1,?,'phase4-integrated-account','draft')").bind(seeded.workspaceId,NOW,NOW,seeded.profileId),
      fixture.database.prepare("UPDATE prospecting_runs SET execution_state='queued' WHERE id=?").bind(initialRun.id),
    ]);
    const assignment = await runner.issueRunnerAssignment(fixture.database, { workspaceId: seeded.workspaceId, runId: initialRun.id, profileId: seeded.profileId, configurationId: active.id, configurationDigest: active.digest, audience: "prospecting-runner/v1", expiresAt: NOW + 60_000, instructionVersion: "runner-instructions/v1", toolConfigurationDigest: "f".repeat(64), quotas: { maxBytes: 20_000, maxFindings: 3, maxSources: 3 }, grantReference: "synthetic", reason: "synthetic integration", idempotencyKey: "phase4-integrated-assignment", now: NOW, capabilitySecret: RUNNER_SECRET });
    assert.ok(await fixture.database.prepare("SELECT t.id FROM targets t JOIN typed_configurations c ON c.id=? AND c.workspace_id=t.workspace_id AND c.owner_type='profile' AND c.owner_id=t.profile_id AND c.kind='profile_effective' JOIN offers o ON o.id=json_extract(c.manifest_json,'$.authority.offer.id') AND o.workspace_id=t.workspace_id AND o.profile_id=t.profile_id WHERE t.id=? AND t.workspace_id=? AND t.profile_id=?").bind(active.id, "phase4-integrated-target", seeded.workspaceId, seeded.profileId).first(), "materializer target must bind the pinned Offer lineage");
    const payload = { status: "complete", findings: [{ kind: "operating-signal", sourceUrl: "https://example.invalid/source", observedAt: NOW, excerpt: "<script>synthetic observation</script>" }], sources: [{ url: "https://example.invalid/source", retrievedAt: NOW, excerpt: "<script>source</script>", publisher: "Synthetic" }], provenance: { provider: "runner-provider", model: "runner-model", instructionVersion: "runner-instructions/v1", toolConfigurationDigest: "f".repeat(64), tools: [], transformations: [] } };
    const runnerRequest = () => new Request("https://prospector.test/api/prospecting/runner", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ capability: assignment.capability, idempotencyKey: "phase4-integrated-submission", payload }) });
    const materializer = ({ signals }) => { assert.equal(signals.length, 1); assert.match(signals[0].excerpt, /&lt;script&gt;/); return [{ targetId: "phase4-integrated-target", accountFit: 2, painStrength: 2, timingUrgency: 1, dataReadiness: 1, commercialViability: 1, requiredEvidence: ["target", "pain", "timing", "operation", "offer"] }]; };
    const ingress = { database: fixture.database, runnerIngressEnabled: true, runnerCapabilitySecret: RUNNER_SECRET, candidateMaterializer: materializer, now: () => NOW + 2 };
    const firstIngress = await handler.handleRunnerIngress(runnerRequest(), ingress);
    assert.equal(firstIngress.status, 200);
    assert.deepEqual(await firstIngress.json(), { submissionId: (await fixture.database.prepare("SELECT id FROM runner_submissions WHERE workspace_id=?").bind(seeded.workspaceId).first()).id, replayed: false });
    const replayIngress = await handler.handleRunnerIngress(runnerRequest(), ingress);
    assert.equal(replayIngress.status, 200);
    assert.equal((await replayIngress.json()).replayed, true);
    const signal = await fixture.database.prepare("SELECT ps.id,ps.signal_digest,pl.lineage_digest,pl.excerpt FROM prospecting_signals ps JOIN prospecting_source_lineage pl ON pl.id=ps.source_lineage_id WHERE ps.workspace_id=?").bind(seeded.workspaceId).first();
    assert.match(signal.signal_digest, /^[a-f0-9]{64}$/); assert.match(signal.lineage_digest, /^[a-f0-9]{64}$/); assert.match(signal.excerpt, /&lt;script&gt;/);
    const candidateFact = await fixture.database.prepare("SELECT id FROM prospecting_candidates WHERE workspace_id=?").bind(seeded.workspaceId).first();
    const assessment = await fixture.database.prepare("SELECT id,assessment_digest,input_digest,outcome,score FROM qualification_assessments WHERE candidate_id=?").bind(candidateFact.id).first();
    assert.deepEqual({ outcome: assessment.outcome, score: Number(assessment.score) }, { outcome: "Passed", score: 7 });
    assert.match(assessment.assessment_digest, /^[a-f0-9]{64}$/); assert.match(assessment.input_digest, /^[a-f0-9]{64}$/);
    assert.equal((await fixture.database.prepare("SELECT COUNT(*) count FROM qualification_assessments WHERE candidate_id=?").bind(candidateFact.id).first()).count, 1, "runner replay must not create another assessment");
    const qualified = await fixture.database.prepare("SELECT id,assessment_id,revision,state,active FROM profile_prospects WHERE assessment_id=?").bind(assessment.id).first();
    assert.deepEqual({ assessmentId: qualified.assessment_id, state: qualified.state, active: Number(qualified.active) }, { assessmentId: assessment.id, state: "qualified", active: 1 });
    cookie = csrfCookie(await handler.handleProspectingGet(new Request(baseUrl), dependencies));
    const reviewResponse = await ownerPost(cookie, { action: "review", prospectId: qualified.id, assessmentId: qualified.assessment_id, decision: "approve", reason: "Synthetic owner approval; contact verification remains governed.", expectedRevision: Number(qualified.revision), idempotencyKey: "0198f400-0000-7000-8000-000000001005" });
    assert.equal(reviewResponse.status, 200);
    assert.equal((await fixture.database.prepare("SELECT decision,audit_event_id,decision_digest FROM prospect_review_decisions WHERE prospect_id=?").bind(qualified.id).first()).decision, "approve");
    assert.equal((await fixture.database.prepare("SELECT COUNT(*) count FROM audit_events WHERE workspace_id=? AND action IN ('profile.configuration.activated','prospect.assessed','prospect.review.approve')").bind(seeded.workspaceId).first()).count, 3);
    const eventRows = await fixture.database.prepare("SELECT event_type,event_digest FROM prospecting_run_events WHERE run_id=? ORDER BY created_at,id").bind(initialRun.id).all();
    assert.ok(eventRows.results.every((event) => /^[a-f0-9]{64}$/.test(event.event_digest)), "every runner transition is digest-bound");
    assert.equal((await fixture.database.prepare("SELECT execution_state,successful_watermark FROM prospecting_runs WHERE id=?").bind(initialRun.id).first()).execution_state, "succeeded");
    assert.equal((await fixture.database.prepare("SELECT COUNT(*) count FROM prospecting_source_lineage WHERE workspace_id=?").bind(seeded.workspaceId).first()).count >= 1, true);
    assert.equal(qualification.evaluateMiningQualification({ configurationDigest: active.digest, rubricDigest: "a".repeat(64), evaluationVersion: qualification.MINING_EVALUATION_VERSION, candidateId: "x", accountId: "x", targetId: "x", offerId: "x", accountFit: 2, painStrength: 2, timingUrgency: 1, dataReadiness: 1, commercialViability: 1, requiredEvidence: ["target", "pain", "timing", "operation", "offer"], sources: [] }).outcome, "InsufficientEvidence");
    await assertForbiddenOperationalRowsUnchanged(fixture.database, before);
  } finally { await fixture.dispose(); }
});

test("owner handler consumes and rotates its HttpOnly CSRF cookie across exact profile reads", async () => {
  const fixture = await createD1Fixture("phase4-handler-csrf");
  try {
    await applyMigrations(fixture.database);
    const identity = {
      email: "phase4-owner@example.com",
      displayName: "Phase 4 owner",
    };
    const subjectPepper = "phase4-handler-test-pepper-material-at-least-thirty-two-bytes";
    const access = await fixture.vite.ssrLoadModule(new URL("../domain/pilot-access.ts", import.meta.url).pathname);
    const handler = await fixture.vite.ssrLoadModule(new URL("../domain/prospecting-handler.ts", import.meta.url).pathname);
    const commercial = await fixture.vite.ssrLoadModule(new URL("../domain/commercial-model.ts", import.meta.url).pathname);
    const principal = await access.admitPilotOwner(identity, identity.email, subjectPepper);
    const model = await commercial.initializeCommercialModel(fixture.database, principal, {
      idempotencyKey: "0198f400-0000-7000-8000-000000000301",
    });
    const profile = model.profiles.find((entry) => entry.name === "Operating");
    assert.ok(profile);
    const otherIdentity = {
      email: "other-phase4-owner@example.com",
      displayName: "Other Phase 4 owner",
    };
    const otherPrincipal = await access.admitPilotOwner(
      otherIdentity,
      otherIdentity.email,
      subjectPepper,
    );
    const otherModel = await commercial.initializeCommercialModel(
      fixture.database,
      otherPrincipal,
      {
        idempotencyKey: "0198f400-0000-7000-8000-000000000302",
      },
    );
    const otherProfile = otherModel.profiles.find(
      (entry) => entry.name === "Operating",
    );
    assert.ok(otherProfile);
    const dependencies = {
      database: fixture.database,
      subjectPepper,
      pilotOwnerEmail: identity.email,
      async getIdentity() { return identity; },
    };
    const baseUrl = `https://prospector.test/api/prospecting?profileId=${encodeURIComponent(profile.id)}`;
    const unselected = await handler.handleProspectingGet(
      new Request("https://prospector.test/api/prospecting"),
      dependencies,
    );
    assert.equal(unselected.status, 200);
    const unselectedProjection = await unselected.json();
    assert.ok(unselectedProjection.profiles.length > 0);
    assert.equal(unselectedProjection.readiness, null);
    for (const collection of [
      "runs",
      "evidence",
      "assessments",
      "queue",
      "decisions",
    ]) {
      assert.deepEqual(
        unselectedProjection[collection],
        [],
        `unselected GET must not silently compose ${collection}`,
      );
    }
    const initial = await handler.handleProspectingGet(new Request(baseUrl), dependencies);
    assert.equal(initial.status, 200);
    const initialProjection = await initial.clone().json();
    assert.ok(
      initialProjection.profiles.some(
        (entry) =>
          entry.id === profile.id &&
          entry.name === "Operating" &&
          typeof entry.lifecycle === "string",
      ),
    );
    assert.equal(initialProjection.readiness.profile.id, profile.id);
    for (const forbiddenProfileId of [
      "unknown-profile",
      otherProfile.id,
    ]) {
      const denied = await handler.handleProspectingGet(
        new Request(
          `https://prospector.test/api/prospecting?profileId=${encodeURIComponent(forbiddenProfileId)}`,
        ),
        dependencies,
      );
      assert.equal(denied.status, 404);
      assert.deepEqual(await denied.json(), {
        error: "private_workspace_unavailable",
      });
    }
    const firstCookie = csrfCookie(initial);

    const post = (cookie) => handler.handleProspectingPost(new Request(baseUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie,
        origin: "https://prospector.test",
        "sec-fetch-site": "same-origin",
        "x-prospector-intent": handler.PROSPECTING_MUTATION_INTENT,
      },
      body: JSON.stringify({
        action: "read_profile_readiness",
        profileId: profile.id,
      }),
    }), dependencies);

    const first = await post(firstCookie);
    assert.equal(first.status, 200);
    assert.equal(first.headers.get("cache-control"), "no-store");
    const firstProjection = await first.json();
    assert.equal(firstProjection.readiness.profile.id, profile.id);
    const rotatedCookie = csrfCookie(first);
    assert.notEqual(rotatedCookie, firstCookie);

    const replay = await post(firstCookie);
    assert.equal(replay.status, 403);
    assert.deepEqual(await replay.json(), { error: "invalid_csrf_token" });

    const second = await post(rotatedCookie);
    assert.equal(second.status, 200);
    assert.equal((await second.json()).readiness.profile.id, profile.id);
  } finally {
    await fixture.dispose();
  }
});

test("owner revocation resolves the assignment's exact workspace Profile before projecting state", async () => {
  const fixture = await createD1Fixture("phase4-handler-revoke-scope");
  try {
    await applyMigrations(fixture.database);
    const identity={email:"phase4-revoke-owner@example.com",displayName:"Phase 4 revoke owner"};
    const subjectPepper="phase4-revoke-owner-pepper-at-least-thirty-two-bytes";
    const access=await fixture.vite.ssrLoadModule(new URL("../domain/pilot-access.ts",import.meta.url).pathname);
    const handler=await fixture.vite.ssrLoadModule(new URL("../domain/prospecting-handler.ts",import.meta.url).pathname);
    const runner=await fixture.vite.ssrLoadModule(new URL("../domain/runner-assignment.ts",import.meta.url).pathname);
    const principal=await access.admitPilotOwner(identity,identity.email,subjectPepper);
    const seeded=await seedProfileAuthority(fixture,principal,NOW);
    const otherProfile=await fixture.database.prepare("SELECT id FROM customer_profiles WHERE workspace_id=? AND id<>? ORDER BY id LIMIT 1").bind(seeded.workspaceId,seeded.profileId).first();
    assert.ok(otherProfile);
    const configurationId="phase4-other-profile-config",configurationDigest="9".repeat(64),runId="phase4-other-profile-run",runCommandId="phase4-other-profile-run-command";
    await fixture.database.batch([
      fixture.database.prepare("INSERT INTO typed_configurations (id,workspace_id,created_at,updated_at,revision,company_id,owner_type,owner_id,kind,digest,manifest_json,active) VALUES (?,?,?, ?,1,NULL,'profile',?,'profile_effective',?,'{}',1)").bind(configurationId,seeded.workspaceId,NOW,NOW,otherProfile.id,configurationDigest),
      fixture.database.prepare("INSERT INTO authority_commands (id,workspace_id,created_at,updated_at,revision,command_type,idempotency_key,operation_digest,expected_revision,subject_type,subject_id,status) VALUES (?,?,?,?,1,'test.prospecting.run','phase4-other-profile-run-command-key',?,1,'profile',?,'accepted')").bind(runCommandId,seeded.workspaceId,NOW,NOW,"7".repeat(64),otherProfile.id),
      fixture.database.prepare("INSERT INTO prospecting_runs (id,workspace_id,created_at,updated_at,revision,profile_id,configuration_id,schedule_id,configuration_digest,trigger_kind,trigger_key,window_lower_exclusive,window_upper_inclusive,last_successful_watermark,successful_watermark,manifest_json,manifest_digest,execution_state,authority_command_id,operation_digest,idempotency_key,started_at,completed_at) VALUES (?,?,?, ?,1,?,?,NULL,?,'manual','other-profile-run',NULL,?,NULL,NULL,'{}',?,'queued',?,?,'phase4-other-profile-run-key',?,NULL)").bind(runId,seeded.workspaceId,NOW,NOW,otherProfile.id,configurationId,configurationDigest,NOW,"8".repeat(64),runCommandId,"7".repeat(64),NOW),
    ]);
    const assignment=await runner.issueRunnerAssignment(fixture.database,{workspaceId:seeded.workspaceId,runId,profileId:otherProfile.id,configurationId,configurationDigest,audience:"prospecting-runner/v1",expiresAt:NOW+60_000,instructionVersion:"runner-instructions/v1",toolConfigurationDigest:"f".repeat(64),quotas:{maxBytes:20_000,maxFindings:3,maxSources:3},grantReference:"synthetic",reason:"cross-profile revocation scope regression",idempotencyKey:"phase4-other-profile-assignment",now:NOW,capabilitySecret:RUNNER_SECRET});
    const dependencies={database:fixture.database,subjectPepper,pilotOwnerEmail:identity.email,async getIdentity(){return identity;}};
    const selectedUrl=`https://prospector.test/api/prospecting?profileId=${encodeURIComponent(seeded.profileId)}`;
    const initial=await handler.handleProspectingGet(new Request(selectedUrl),dependencies);
    let cookie=csrfCookie(initial);
    const revokeBody={action:"revoke_assignment",assignmentId:assignment.assignmentId,reason:"Owner revoked exact assignment",idempotencyKey:"phase4-handler-revoke-other-profile"};
    const mutation=(body,headers={})=>handler.handleProspectingPost(new Request(selectedUrl,{method:"POST",headers:{"content-type":"application/json",cookie,origin:"https://prospector.test","sec-fetch-site":"same-origin","x-prospector-intent":handler.PROSPECTING_MUTATION_INTENT,...headers},body:JSON.stringify(body)}),dependencies);
    const foreign=await mutation(revokeBody,{origin:"https://foreign.example"});
    assert.equal(foreign.status,403);assert.deepEqual(await foreign.json(),{error:"foreign_origin"});
    const oversized=await mutation(revokeBody,{"content-length":String(handler.MAX_PROSPECTING_BODY_BYTES+1)});
    assert.equal(oversized.status,413);assert.deepEqual(await oversized.json(),{error:"payload_too_large"});
    const openBody=await mutation({...revokeBody,profileId:seeded.profileId});
    assert.equal(openBody.status,409);assert.deepEqual(await openBody.json(),{error:"command_conflict"});
    assert.equal((await fixture.database.prepare("SELECT status FROM runner_assignments WHERE id=?").bind(assignment.assignmentId).first()).status,"issued","closed-body and request-security negatives have no revocation effect");
    cookie=csrfCookie(await handler.handleProspectingGet(new Request(selectedUrl),dependencies));
    const revoke=await mutation(revokeBody);
    assert.equal(revoke.status,200);
    const projection=await revoke.json();
    assert.equal(projection.readiness.profile.id,otherProfile.id);
    assert.ok(projection.runs.length>0);
    assert.ok(projection.runs.every((run)=>run.profile_id===otherProfile.id),"revocation cannot widen the response to another selected Profile");
    assert.equal((await fixture.database.prepare("SELECT status FROM runner_assignments WHERE id=?").bind(assignment.assignmentId).first()).status,"revoked");
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
