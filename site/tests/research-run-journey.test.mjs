import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import test from "node:test";
import { assertForbiddenOperationalRowsUnchanged, createD1Fixture, applyMigrations, snapshotForbiddenOperationalRows } from "./helpers/d1.mjs";
import { seedProfileAuthority } from "./helpers/phase4.mjs";

/**
 * Research-run journey acceptance, composed only through test dependency
 * injection. Plan 04-08 Task 2 keeps the deployed adapter unavailable, and
 * independent review has ruled that constructing it in `app/` under DEV is
 * still runtime composition, so this suite exercises the real chain without any
 * route. It asserts separately that production composition stays fail closed
 * and that no application module imports the journey composer.
 */

const NOW = 1_780_000_000_000;
const SECRET = new TextEncoder().encode("research-run-journey-secret-material-at-least-32-bytes");
const root = resolve(import.meta.dirname, "..");
const JOURNEY_PATH = join(root, "domain", "research-run-journey.ts");

const OBSERVATIONS = Object.freeze([Object.freeze({
  kind: "operating-signal",
  sourceUrl: "https://example.invalid/operating-notice",
  observedAt: NOW - 1_000,
  retrievedAt: NOW - 500,
  excerpt: "<script>synthetic operating notice</script>",
  publisher: "Synthetic Wire",
})]);

function uuidFor(label, suffix) {
  let hash = 0;
  for (const character of label) hash = (hash * 31 + character.codePointAt(0)) >>> 0;
  return `0198f400-0000-7000-8000-0000${hash.toString(16).padStart(8, "0")}${suffix}`;
}

async function prepared(fixture, label) {
  await applyMigrations(fixture.database);
  const forbiddenBefore = await snapshotForbiddenOperationalRows(fixture.database);
  const access = await fixture.vite.ssrLoadModule(new URL("../domain/pilot-access.ts", import.meta.url).pathname);
  const readiness = await fixture.vite.ssrLoadModule(new URL("../domain/profile-readiness.ts", import.meta.url).pathname);
  const identity = { email: `${label}@example.com`, displayName: "Research run owner" };
  const principal = await access.admitPilotOwner(identity, identity.email, "research-run-owner-pepper-material-at-least-thirty-two-bytes");
  const seeded = await seedProfileAuthority(fixture, principal, NOW);
  const candidate = await readiness.createProfileConfigurationCandidate(fixture.database, principal, {
    profileId: seeded.profileId, expectedProfileRevision: seeded.revision, now: NOW, idempotencyKey: uuidFor(label, "01"),
  });
  await readiness.activateProfileConfiguration(fixture.database, principal, {
    candidateId: candidate.id, expectedRevision: candidate.revision, expectedDigest: candidate.digest, now: NOW, idempotencyKey: uuidFor(label, "02"),
  });
  const active = await fixture.database.prepare("SELECT id,digest FROM typed_configurations WHERE workspace_id=? AND owner_type='profile' AND owner_id=? AND kind='profile_effective' AND active=1").bind(seeded.workspaceId, seeded.profileId).first();
  const run = await fixture.database.prepare("SELECT id FROM prospecting_runs WHERE workspace_id=? AND configuration_id=? AND trigger_kind='initial'").bind(seeded.workspaceId, active.id).first();
  // The trusted lease handoff has no admission route yet; the owner route is
  // separately asserted to remain unable to mint a capability.
  await fixture.database.batch([
    fixture.database.prepare("INSERT INTO organizations (id,workspace_id,created_at,updated_at,revision,company_id,canonical_name,identity_digest) SELECT 'rr-org',?,?,?,1,id,'Synthetic Operator',? FROM companies WHERE workspace_id=?").bind(seeded.workspaceId, NOW, NOW, "a".repeat(64), seeded.workspaceId),
    fixture.database.prepare("INSERT INTO accounts (id,workspace_id,created_at,updated_at,revision,play_id,organization_id,state) SELECT 'rr-account',?,?,?,1,play_id,'rr-org','draft' FROM customer_profiles WHERE id=?").bind(seeded.workspaceId, NOW, NOW, seeded.profileId),
    fixture.database.prepare("INSERT INTO targets (id,workspace_id,created_at,updated_at,revision,profile_id,account_id,state) VALUES ('rr-target',?,?,?,1,?,'rr-account','draft')").bind(seeded.workspaceId, NOW, NOW, seeded.profileId),
    fixture.database.prepare("UPDATE prospecting_runs SET execution_state='queued' WHERE id=?").bind(run.id),
  ]);
  const journey = await fixture.vite.ssrLoadModule(JOURNEY_PATH);
  return { principal, seeded, active, runId: run.id, journey, forbiddenBefore };
}

const materializer = () => [{
  targetId: "rr-target", accountFit: 2, painStrength: 2, timingUrgency: 1, dataReadiness: 1, commercialViability: 1,
  requiredEvidence: ["target", "pain", "timing", "operation", "offer"],
}];

function journeyInput(context, overrides = {}) {
  return {
    workspaceId: context.seeded.workspaceId, profileId: context.seeded.profileId, runId: context.runId,
    configurationId: context.active.id, configurationDigest: context.active.digest,
    capabilitySecret: SECRET, now: NOW, expiresAt: NOW + 60_000,
    idempotencyKeyPrefix: "research-run", runner: context.journey.createSyntheticResearchRunner(OBSERVATIONS),
    materializer, ...overrides,
  };
}

test("the research-run journey produces real evidence, assessment, and a qualified prospect", async () => {
  const fixture = await createD1Fixture("research-run-journey");
  try {
    const context = await prepared(fixture, "research-run-owner");
    const runner = context.journey.createSyntheticResearchRunner(OBSERVATIONS);
    const result = await context.journey.runResearchRunJourney(fixture.database, journeyInput(context, { runner }));

    assert.equal(result.deliveredCount, 1, "the assignment crossed the RunnerPort seam");
    assert.equal(result.replayed, false);
    const envelope = runner.delivered[0];
    assert.equal(envelope.scope, "runner.observations.append/v1");
    // The envelope is minimized: no credential, secret, or authority may ride on it.
    for (const forbidden of ["capability", "capabilitySecret", "token", "secret", "credential", "cookie"]) {
      assert.equal(Object.hasOwn(envelope, forbidden), false, `the envelope must not carry ${forbidden}`);
    }
    assert.doesNotMatch(JSON.stringify(envelope), /research-run-journey-secret-material/, "no capability material reaches the runner");

    // Evidence is the product of trusted validation, not of a seeded row.
    const signal = await fixture.database.prepare("SELECT ps.signal_digest,pl.lineage_digest,pl.excerpt,pl.source_tier FROM prospecting_signals ps JOIN prospecting_source_lineage pl ON pl.id=ps.source_lineage_id WHERE ps.workspace_id=?").bind(context.seeded.workspaceId).first();
    assert.match(signal.signal_digest, /^[a-f0-9]{64}$/);
    assert.match(signal.lineage_digest, /^[a-f0-9]{64}$/);
    assert.match(signal.excerpt, /&lt;script&gt;/, "hostile source text is escaped by the application, not the runner");
    assert.equal(Number(signal.source_tier), 1, "the application assigns the tier from its pinned policy");

    const assessment = await fixture.database.prepare("SELECT id,outcome,score,input_digest,assessment_digest FROM qualification_assessments WHERE workspace_id=?").bind(context.seeded.workspaceId).first();
    assert.deepEqual({ outcome: assessment.outcome, score: Number(assessment.score) }, { outcome: "Passed", score: 7 });
    assert.match(assessment.input_digest, /^[a-f0-9]{64}$/);
    assert.notEqual(assessment.input_digest, "{}", "the assessment records real evaluator input");

    const prospect = await fixture.database.prepare("SELECT state,active FROM profile_prospects WHERE assessment_id=?").bind(assessment.id).first();
    assert.deepEqual({ state: prospect.state, active: Number(prospect.active) }, { state: "qualified", active: 1 });
    assert.equal((await fixture.database.prepare("SELECT execution_state FROM prospecting_runs WHERE id=?").bind(context.runId).first()).execution_state, "succeeded");
    await assertForbiddenOperationalRowsUnchanged(fixture.database, context.forbiddenBefore);
  } finally { await fixture.dispose(); }
});

test("a completed run refuses re-assignment and yields no second assessment", async () => {
  const fixture = await createD1Fixture("research-run-journey-replay");
  try {
    const context = await prepared(fixture, "research-run-replay-owner");
    await context.journey.runResearchRunJourney(fixture.database, journeyInput(context));
    // The same keys replay onto the same assignment, which returns no capability.
    // The run reached `succeeded`, so the assignment authority refuses it outright
    // rather than minting a second capability for finished work.
    await assert.rejects(() => context.journey.runResearchRunJourney(fixture.database, journeyInput(context)), /runner_assignment_rejected/);
    assert.equal(Number((await fixture.database.prepare("SELECT COUNT(*) count FROM qualification_assessments WHERE workspace_id=?").bind(context.seeded.workspaceId).first()).count), 1, "a replay creates no second assessment");
    assert.equal(Number((await fixture.database.prepare("SELECT COUNT(*) count FROM runner_submissions WHERE workspace_id=?").bind(context.seeded.workspaceId).first()).count), 1);
  } finally { await fixture.dispose(); }
});

test("assignment authority fails closed on scope, expiry, secret, and configuration drift", async () => {
  const fixture = await createD1Fixture("research-run-journey-adversarial");
  try {
    const context = await prepared(fixture, "research-run-adversarial-owner");
    const rejects = (overrides, label) => assert.rejects(
      () => context.journey.runResearchRunJourney(fixture.database, journeyInput(context, { idempotencyKeyPrefix: label, ...overrides })),
      (error) => { assert.ok(error instanceof Error, label); return true; },
      label,
    );
    await rejects({ expiresAt: NOW - 1 }, "expired-capability");
    await rejects({ expiresAt: NOW + 6 * 60 * 1_000 }, "ttl-beyond-maximum");
    await rejects({ configurationDigest: "b".repeat(64) }, "configuration-digest-drift");
    await rejects({ configurationId: "not-the-active-configuration" }, "configuration-identity-drift");
    await rejects({ runId: "not-this-run" }, "run-identity-drift");
    await rejects({ workspaceId: "not-this-workspace" }, "workspace-drift");
    await rejects({ capabilitySecret: new TextEncoder().encode("short") }, "weak-capability-secret");
    // A runner may not widen the scope it was handed.
    const runner = context.journey.createSyntheticResearchRunner(OBSERVATIONS);
    await assert.rejects(() => runner.port.deliver({ scope: "runner.observations.write/v1" }), /synthetic_runner_scope_rejected/);
    assert.equal(runner.delivered.length, 0);
    assert.equal(Number((await fixture.database.prepare("SELECT COUNT(*) count FROM runner_submissions WHERE workspace_id=?").bind(context.seeded.workspaceId).first()).count), 0, "no rejected attempt left a submission");
  } finally { await fixture.dispose(); }
});

test("production composition stays fail closed and nothing in the app imports the journey", async () => {
  const fixture = await createD1Fixture("research-run-journey-production");
  try {
    await applyMigrations(fixture.database);
    const handler = await fixture.vite.ssrLoadModule(new URL("../domain/prospecting-handler.ts", import.meta.url).pathname);
    const request = () => new Request("https://prospector.test/api/prospecting/runner", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ capability: "x", idempotencyKey: "y", payload: {} }),
    });
    // Exactly the deployed route's dependencies.
    assert.equal((await handler.handleRunnerIngress(request(), { database: fixture.database, runnerIngressEnabled: false })).status, 404);
    assert.equal((await handler.handleRunnerIngress(request(), undefined)).status, 404);
    assert.equal((await handler.handleRunnerIngress(request(), { database: fixture.database, runnerIngressEnabled: true })).status, 404, "ingress without a capability secret stays closed");
  } finally { await fixture.dispose(); }

  const deployedRoute = await readFile(join(root, "app", "api", "prospecting", "runner", "route.ts"), "utf8");
  assert.match(deployedRoute, /composeRunnerIngress/, "the deployed runner route must use the explicit default-off binding composer");
  assert.doesNotMatch(deployedRoute, /runnerIngressEnabled:\s*true/, "the deployed runner route must not force ingress on");

  for (const file of await sourceFiles(join(root, "app"))) {
    const contents = await readFile(file, "utf8");
    assert.equal(contents.includes("research-run-journey"), false, `${file} must not compose the research-run journey`);
    assert.equal(contents.includes("createSyntheticResearchRunner"), false, `${file} must not construct a synthetic runner`);
  }
  const journey = await readFile(JOURNEY_PATH, "utf8");
  for (const forbidden of [/cloudflare:workers/, /import\.meta\.env/, /\bfetch\s*\(/, /process\.env/]) {
    assert.doesNotMatch(journey, forbidden, `the journey composer must read no ambient authority (${forbidden})`);
  }
});

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true }).catch((error) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(path));
    else if (/\.(?:ts|tsx|mts|mjs|js|jsx)$/.test(entry.name)) files.push(path);
  }
  return files;
}
