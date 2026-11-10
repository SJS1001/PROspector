import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createD1Fixture } from "./helpers/d1.mjs";
import { OUTREACH_NOW, OUTREACH_OWNER, seedManualCallAuthority } from "./helpers/manual-call-fixture.mjs";

// Lane F (06-07, local): the manual-call flow backed by D1. Synthetic data and
// fake ports only. The phone action stays disabled until 06-13 Task 3 owner UAT.
const MANUAL_CALL = new URL("../domain/manual-call.ts", import.meta.url).pathname;
const REPOSITORY = new URL("../domain/outreach-repository.ts", import.meta.url).pathname;
const SUPPRESSION = new URL("../domain/suppression.ts", import.meta.url).pathname;
const ELIGIBILITY = new URL("../domain/contact-eligibility.ts", import.meta.url).pathname;
const CALL_SCRIPT = "Synthetic offline call script.";
const ZERO_EFFECTS = { providerInvocations: 0, dialInvocations: 0, uriInvocations: 0 };

function clockAt(start) {
  const clock = { value: start };
  clock.now = () => clock.value;
  return clock;
}

function scopeFor(seeded, clock) {
  return { workspaceId: seeded.workspaceId, ownerSubject: OUTREACH_OWNER.subject, now: clock.now };
}

/** Test-only synthetic ContactReady port. Production wires the blocked recheck. */
function syntheticReadyPort(seeded, overrides = {}) {
  const calls = [];
  return {
    calls,
    port: Object.freeze({
      async recheckForClickToCall(input) {
        calls.push(structuredClone(input));
        return { blocked: false, state: "ContactReady", freshUntil: OUTREACH_NOW + 60_000, normalizedPhone: seeded.phoneNumber, ...overrides };
      },
    }),
  };
}

function packageInput(seeded, { selectPhone = true } = {}) {
  const selected = selectPhone ? [seeded.contactPointDigest, seeded.phoneContactPointDigest] : [seeded.contactPointDigest];
  const observationBindings = [{ kind: "contact_observation", id: seeded.observationId, digest: seeded.observationDigest }];
  if (selectPhone) observationBindings.push({ kind: "contact_observation", id: seeded.phoneObservationId, digest: seeded.phoneObservationDigest });
  return {
    packageId: "manual-call-package", prospectId: seeded.prospectId, contactId: seeded.contactId, profileId: seeded.profileId,
    version: 1, expectedVersion: 0, configurationId: seeded.configurationId, configurationDigest: seeded.configurationDigest,
    configurationRevision: seeded.configurationRevision, prospectRevision: seeded.prospectRevision, contactRevision: seeded.contactRevision,
    contactEligibilitySnapshotId: seeded.eligibilityId,
    snapshot: {
      evidenceDigests: [seeded.evidenceDigest], claimGuardrailDigests: [seeded.guardrailDigest],
      recommendedAngle: "Synthetic governed outreach angle", selectedRole: "champion",
      selectedContactPointDigests: selected, callScript: CALL_SCRIPT, draftMessageIds: [],
    },
    bindings: [
      { kind: "configuration", id: seeded.configurationId, digest: seeded.configurationDigest },
      { kind: "qualification", id: "outreach-assessment", digest: "2".repeat(64) },
      { kind: "review_decision", id: "outreach-review", digest: "5".repeat(64) },
      { kind: "source", id: "outreach-source", digest: seeded.sourceDigest },
      { kind: "evidence", id: "outreach-evidence", digest: seeded.evidenceDigest },
      { kind: "claim_guardrail", id: "outreach-guardrail", digest: seeded.guardrailDigest },
      ...observationBindings,
      { kind: "contact_eligibility", id: seeded.eligibilityId, digest: seeded.eligibilityDigest },
    ],
    idempotencyKey: "manual-call-package-version",
  };
}

async function setup(name, options = {}) {
  const fixture = await createD1Fixture(name);
  try {
    const seeded = await seedManualCallAuthority(fixture);
    const clock = clockAt(OUTREACH_NOW + 10);
    const repository = (await fixture.vite.ssrLoadModule(REPOSITORY)).createD1OutreachRepository(fixture.database, scopeFor(seeded, clock));
    const packageVersion = await repository.createPackageVersion(packageInput(seeded, options));
    const packageApproval = await repository.approvePackageVersion({
      packageVersionId: packageVersion.id, expectedVersion: 1, expiresAt: OUTREACH_NOW + 70_000, idempotencyKey: "manual-call-package-approval",
    });
    const manualCall = await fixture.vite.ssrLoadModule(MANUAL_CALL);
    const suppression = await fixture.vite.ssrLoadModule(SUPPRESSION);
    const target = { packageApprovalId: packageApproval.id, phoneObservationId: seeded.phoneObservationId };
    return { fixture, seeded, clock, repository, packageVersion, packageApproval, manualCall, suppression, target };
  } catch (error) {
    await fixture.dispose();
    throw error;
  }
}

function outcomeCommand(view, outcome, idempotencyKey, notes = "Synthetic call note.") {
  return { ...view.request, expectedDecisionDigest: view.decision.decisionDigest, outcome, notes, idempotencyKey };
}

async function countManualCallRecords(fixture, workspaceId) {
  const row = await fixture.database.prepare(
    "SELECT count(*) count FROM authority_commands WHERE workspace_id=? AND command_type='manual_call.outcome'",
  ).bind(workspaceId).first();
  return Number(row.count);
}

/** Records batch order without changing D1 semantics. */
function recordingDatabase(database, { failWhen = () => false } = {}) {
  const batches = [];
  const real = new WeakMap();
  const wrap = (statement, sql) => {
    const wrapped = Object.freeze({
      bind: (...values) => wrap(statement.bind(...values), sql),
      first: (...args) => statement.first(...args),
      all: (...args) => statement.all(...args),
      run: (...args) => statement.run(...args),
      raw: (...args) => statement.raw(...args),
    });
    real.set(wrapped, { statement, sql });
    return wrapped;
  };
  return {
    batches,
    database: Object.freeze({
      prepare: (sql) => wrap(database.prepare(sql), sql),
      batch: async (statements) => {
        const entries = statements.map((statement) => real.get(statement));
        if (entries.some((entry) => !entry)) throw new Error("unwrapped statement in recorded batch");
        const sqls = entries.map((entry) => entry.sql);
        if (failWhen(sqls)) throw new Error("synthetic batch failure");
        batches.push(sqls);
        return database.batch(entries.map((entry) => entry.statement));
      },
      exec: () => { throw new Error("unexpected exec"); },
    }),
  };
}

const isOutcomeBatch = (sqls) => sqls.some((sql) => sql.includes("INSERT INTO authority_commands"));
const isTombstoneBatch = (sqls) => sqls.some((sql) => sql.includes("outreach_suppression_tombstones"));

test("production wiring: the blocked click-to-call recheck keeps the D1 phone action disabled with zero effects", async () => {
  const ctx = await setup("manual-call-production-port");
  try {
    const { manualCall, fixture, seeded, clock, target } = ctx;
    assert.equal(typeof manualCall.createD1ManualCallService, "function");
    assert.equal(typeof manualCall.blockedClickToCallEligibilityPort?.recheckForClickToCall, "function");
    const eligibility = await fixture.vite.ssrLoadModule(ELIGIBILITY);
    assert.equal(eligibility.recheckForClickToCall({}).blocked, true, "the Phase 5 click-to-call recheck still always refuses");
    assert.throws(() => manualCall.createD1ManualCallService(fixture.database, scopeFor(seeded, clock), {}), /eligibility/u,
      "an eligibility port must be injected explicitly");

    const service = manualCall.createD1ManualCallService(fixture.database, scopeFor(seeded, clock), {
      eligibility: manualCall.blockedClickToCallEligibilityPort,
    });
    const view = await service.projectManualCall(target);
    assert.equal(view.decision.eligible, false);
    assert.ok(view.decision.reasonCodes.includes("phone_not_current_verified"), view.decision.reasonCodes.join(","));
    assert.equal(view.decision.callScript, null);
    assert.equal(view.decision.phoneTarget, null);
    assert.deepEqual(view.phoneAction, { enabled: false, reason: "not_eligible", href: null });
    assert.deepEqual(view.decision.effects, ZERO_EFFECTS);

    const activation = await service.activatePhoneAction(target);
    assert.deepEqual(activation, { kind: "refused", reason: "phone_action_disabled", href: null, effects: ZERO_EFFECTS });
    assert.equal(JSON.stringify({ view, activation }).includes(seeded.phoneNumber), false, "no raw number leaves the service");

    // A non-do-not-call outcome cannot be recorded against an ineligible decision.
    await assert.rejects(service.recordOutcome(outcomeCommand(view, "connected", "manual-call-prod-connected")), /stale_or_ineligible/u);
    assert.equal(await countManualCallRecords(fixture, seeded.workspaceId), 0);
  } finally {
    await ctx.fixture.dispose();
  }
});

test("a synthetic ContactReady port yields the exact approved-package script, yet the phone action stays disabled pending owner UAT", async () => {
  const ctx = await setup("manual-call-projection");
  try {
    const { manualCall, fixture, seeded, clock, target, packageVersion, packageApproval } = ctx;
    const ready = syntheticReadyPort(seeded);
    const service = manualCall.createD1ManualCallService(fixture.database, scopeFor(seeded, clock), { eligibility: ready.port });
    const view = await service.projectManualCall(target);
    assert.equal(view.decision.eligible, true, view.decision.reasonCodes.join(","));
    assert.equal(view.decision.callScript, CALL_SCRIPT);
    const row = await fixture.database.prepare("SELECT call_script_digest FROM outreach_package_versions WHERE id=?").bind(packageVersion.id).first();
    assert.equal(view.decision.callScriptDigest, row.call_script_digest, "the visible script has immutable package provenance");
    assert.equal(view.decision.packageApprovalId, packageApproval.id);
    assert.deepEqual(view.phoneAction, { enabled: false, reason: "owner_uat_pending", href: null });
    assert.equal(view.decision.phoneEffectAuthorized, false);
    const activation = await service.activatePhoneAction(target);
    assert.deepEqual(activation, { kind: "refused", reason: "phone_action_disabled", href: null, effects: ZERO_EFFECTS });
    assert.equal(JSON.stringify({ view, activation }).includes(seeded.phoneNumber), false);
    assert.equal(ready.calls.length >= 1, true, "the injected eligibility port is consulted at action time");
    assert.deepEqual(Object.keys(ready.calls[0]).sort(), ["contactId", "contactPointDigest", "now", "phoneObservationId", "prospectId", "workspaceId"]);

    // Current recheck removes the script: freshness lapse at the port, a port
    // that reports a different number, expiry, and revocation each fail closed.
    const lapsed = manualCall.createD1ManualCallService(fixture.database, scopeFor(seeded, clock), {
      eligibility: syntheticReadyPort(seeded, { freshUntil: clock.value }).port,
    });
    assert.ok((await lapsed.projectManualCall(target)).decision.reasonCodes.includes("phone_not_current_verified"));
    const wrongNumber = manualCall.createD1ManualCallService(fixture.database, scopeFor(seeded, clock), {
      eligibility: syntheticReadyPort(seeded, { normalizedPhone: "+14165550199" }).port,
    });
    assert.ok((await wrongNumber.projectManualCall(target)).decision.reasonCodes.includes("phone_not_current_verified"));
    const throwing = manualCall.createD1ManualCallService(fixture.database, scopeFor(seeded, clock), {
      eligibility: { recheckForClickToCall: async () => { throw new Error("synthetic port failure"); } },
    });
    assert.equal((await throwing.projectManualCall(target)).decision.eligible, false, "a failing port fails closed");

    const expiredClock = clockAt(OUTREACH_NOW + 70_001);
    const expired = manualCall.createD1ManualCallService(fixture.database, scopeFor(seeded, expiredClock), { eligibility: syntheticReadyPort(seeded).port });
    assert.ok((await expired.projectManualCall(target)).decision.reasonCodes.includes("approval_expired"));

    await ctx.repository.revokeApproval({
      targetKind: "package_approval", targetApprovalId: packageApproval.id, reasonCode: "owner_revoked",
      sourceEventDigest: "e".repeat(64), idempotencyKey: "manual-call-revoke",
    });
    const revoked = await service.projectManualCall(target);
    assert.ok(revoked.decision.reasonCodes.includes("approval_revoked"));
    assert.equal(revoked.decision.callScript, null);
    // The stale view cannot keep a phone effect or record a normal outcome.
    await assert.rejects(service.recordOutcome(outcomeCommand(view, "connected", "manual-call-stale-view")), /stale_or_ineligible/u);

    // Outsiders and unknown targets get nothing.
    const outsider = manualCall.createD1ManualCallService(fixture.database, { ...scopeFor(seeded, clock), ownerSubject: "manual-call-outsider" }, { eligibility: ready.port });
    await assert.rejects(outsider.projectManualCall(target), /authority_unavailable/u);
    await assert.rejects(service.projectManualCall({ ...target, phoneObservationId: "missing-observation" }), /authority_unavailable/u);
  } finally {
    await ctx.fixture.dispose();
  }
});

test("a package that does not select the phone never offers a call script", async () => {
  const ctx = await setup("manual-call-unselected", { selectPhone: false });
  try {
    const { manualCall, fixture, seeded, clock, target } = ctx;
    const service = manualCall.createD1ManualCallService(fixture.database, scopeFor(seeded, clock), { eligibility: syntheticReadyPort(seeded).port });
    const view = await service.projectManualCall(target);
    assert.equal(view.decision.eligible, false);
    assert.ok(view.decision.reasonCodes.includes("phone_not_selected_by_package"));
    assert.equal(view.decision.callScript, null);
    // An email observation is never a phone target.
    await assert.rejects(service.recordOutcome(outcomeCommand(view, "connected", "manual-call-unselected")), /stale_or_ineligible/u);
  } finally {
    await ctx.fixture.dispose();
  }
});

test("bounded outcomes persist immutably in D1, replay exactly, and reject conflicts and invented values", async () => {
  const ctx = await setup("manual-call-outcomes");
  try {
    const { manualCall, fixture, seeded, clock, target } = ctx;
    const service = manualCall.createD1ManualCallService(fixture.database, scopeFor(seeded, clock), { eligibility: syntheticReadyPort(seeded).port });
    const view = await service.projectManualCall(target);
    assert.equal(view.decision.eligible, true);

    const recorded = await service.recordOutcome(outcomeCommand(view, "voicemail", "manual-call-voicemail"));
    assert.equal(recorded.kind, "manual_call_outcome_recorded");
    assert.equal(recorded.outcome, "voicemail");
    assert.equal(recorded.replayed, false);
    assert.equal(recorded.followUpAuthorized, false);
    assert.equal(recorded.phoneEffectAuthorized, false);
    assert.deepEqual(recorded.effects, ZERO_EFFECTS);
    assert.equal(await countManualCallRecords(fixture, seeded.workspaceId), 1);
    const audit = await fixture.database.prepare(
      "SELECT action,subject_type,subject_id,detail_json FROM audit_events WHERE workspace_id=? AND action='manual_call.outcome_recorded'",
    ).bind(seeded.workspaceId).first();
    assert.equal(audit.subject_id, recorded.outcomeId);
    const stored = JSON.parse(audit.detail_json);
    assert.equal(stored.callScriptDigest, view.decision.callScriptDigest, "the outcome binds the exact package script");
    assert.equal(stored.packageApprovalId, target.packageApprovalId);
    assert.equal(stored.synthetic, true);
    assert.equal(audit.detail_json.includes(seeded.phoneNumber), false, "the raw number is never stored");

    const replay = await service.recordOutcome(outcomeCommand(view, "voicemail", "manual-call-voicemail"));
    assert.equal(replay.replayed, true);
    assert.equal(replay.outcomeId, recorded.outcomeId);
    assert.equal(await countManualCallRecords(fixture, seeded.workspaceId), 1);
    await assert.rejects(service.recordOutcome(outcomeCommand(view, "voicemail", "manual-call-voicemail", "Different note.")), /idempotency_conflict/u);

    await assert.rejects(service.recordOutcome(outcomeCommand(view, "dialed", "manual-call-invented")), /invalid_outcome/u);
    await assert.rejects(service.recordOutcome(outcomeCommand(view, "connected", "manual-call-pii", "Call +14165550100 back")), /invalid_synthetic_notes/u);
    await assert.rejects(service.recordOutcome(outcomeCommand(view, "connected", "manual-call-long", "x".repeat(513))), /invalid_synthetic_notes/u);
    await assert.rejects(service.recordOutcome({ ...outcomeCommand(view, "connected", "manual-call-extra"), callNow: true }), /invalid_input/u);

    // Every bounded outcome is accepted against a current decision.
    for (const outcome of ["connected", "no_answer", "wrong_number", "follow_up"]) {
      const result = await service.recordOutcome(outcomeCommand(view, outcome, `manual-call-${outcome.replace("_", "-")}`));
      assert.equal(result.outcome, outcome);
      assert.equal(result.followUpAuthorized, false, "follow_up never approves a new message");
    }
    assert.equal(await countManualCallRecords(fixture, seeded.workspaceId), 5);
    const sends = await fixture.database.prepare("SELECT count(*) count FROM outreach_message_versions WHERE workspace_id=?").bind(seeded.workspaceId).first();
    assert.equal(Number(sends.count), 0, "no outcome creates a message");
  } finally {
    await ctx.fixture.dispose();
  }
});

test("do_not_call records the suppression first, blocks the number, and survives a failed outcome write", async () => {
  const ctx = await setup("manual-call-do-not-call");
  try {
    const { manualCall, fixture, seeded, clock, target, suppression } = ctx;
    const resolver = suppression.createSuppressionResolver(fixture.database, scopeFor(seeded, clock));
    assert.equal((await resolver.isBlocked({ channel: "phone", phone: seeded.phoneNumber })).blocked, false);

    // First attempt: the outcome batch fails after the suppression committed.
    const failing = recordingDatabase(fixture.database, { failWhen: isOutcomeBatch });
    const failingService = manualCall.createD1ManualCallService(failing.database, scopeFor(seeded, clock), { eligibility: syntheticReadyPort(seeded).port });
    const view = await failingService.projectManualCall(target);
    await assert.rejects(failingService.recordOutcome(outcomeCommand(view, "do_not_call", "manual-call-dnc", "Asked not to be called.")));
    assert.equal(await countManualCallRecords(fixture, seeded.workspaceId), 0, "no outcome success without the full write");
    assert.equal((await resolver.isBlocked({ channel: "phone", phone: seeded.phoneNumber })).blocked, true, "the prohibition already holds");

    // Retry after the approval was revoked: do_not_call stays recordable.
    await ctx.repository.revokeApproval({
      targetKind: "package_approval", targetApprovalId: target.packageApprovalId, reasonCode: "owner_revoked",
      sourceEventDigest: "f".repeat(64), idempotencyKey: "manual-call-dnc-revoke",
    });
    const recording = recordingDatabase(fixture.database);
    const service = manualCall.createD1ManualCallService(recording.database, scopeFor(seeded, clock), { eligibility: syntheticReadyPort(seeded).port });
    const result = await service.recordOutcome(outcomeCommand(view, "do_not_call", "manual-call-dnc", "Asked not to be called."));
    assert.equal(result.outcome, "do_not_call");
    assert.equal(result.suppressionRecordedFirst, true);
    assert.deepEqual(result.suppression, { contactPhoneBlocked: true, numberBlocked: true });
    const firstOutcome = recording.batches.findIndex(isOutcomeBatch);
    assert.ok(firstOutcome >= 0);
    assert.equal(recording.batches.slice(firstOutcome + 1).some(isTombstoneBatch), false, "no tombstone is written after the outcome");
    assert.equal(await countManualCallRecords(fixture, seeded.workspaceId), 1);
    const tombstones = await fixture.database.prepare(
      "SELECT subject_kind,subject_digest,channel,reason FROM outreach_suppression_tombstones WHERE workspace_id=? ORDER BY subject_kind",
    ).bind(seeded.workspaceId).all();
    assert.deepEqual(tombstones.results.map((row) => [row.subject_kind, row.channel, row.reason]), [["contact", "phone", "do_not_call"], ["e164_phone", "phone", "do_not_call"]]);
    assert.equal(tombstones.results.find((row) => row.subject_kind === "e164_phone").subject_digest, seeded.phoneContactPointDigest);

    // The number is now blocked for every action, and email suppression is untouched.
    assert.equal((await resolver.isBlocked({ channel: "phone", phone: seeded.phoneNumber })).blocked, true);
    assert.equal((await resolver.isBlocked({ channel: "email", email: "verified@example.invalid" })).blocked, false);
    const replay = await service.recordOutcome(outcomeCommand(view, "do_not_call", "manual-call-dnc", "Asked not to be called."));
    assert.equal(replay.replayed, true);
  } finally {
    await ctx.fixture.dispose();
  }
});

test("after do_not_call, no later decision, script, or follow_up can outrun the prohibition", async () => {
  const ctx = await setup("manual-call-after-dnc");
  try {
    const { manualCall, fixture, seeded, clock, target } = ctx;
    const service = manualCall.createD1ManualCallService(fixture.database, scopeFor(seeded, clock), { eligibility: syntheticReadyPort(seeded).port });
    const view = await service.projectManualCall(target);
    assert.equal(view.decision.eligible, true);
    await service.recordOutcome(outcomeCommand(view, "do_not_call", "manual-call-dnc-first", "Asked not to be called."));
    const after = await service.projectManualCall(target);
    assert.equal(after.decision.eligible, false);
    assert.ok(after.decision.reasonCodes.includes("suppressed"));
    assert.equal(after.decision.callScript, null);
    assert.deepEqual(after.phoneAction, { enabled: false, reason: "not_eligible", href: null });
    await assert.rejects(service.recordOutcome(outcomeCommand(view, "follow_up", "manual-call-follow-up-stale")), /stale_or_ineligible/u);
    await assert.rejects(service.recordOutcome(outcomeCommand(after, "follow_up", "manual-call-follow-up-after")), /stale_or_ineligible/u);
    await assert.rejects(service.recordOutcome(outcomeCommand(after, "connected", "manual-call-connected-after")), /stale_or_ineligible/u);
    assert.equal(await countManualCallRecords(fixture, seeded.workspaceId), 1);
  } finally {
    await ctx.fixture.dispose();
  }
});

test("a reply stop blocks follow_up only, and a paused Profile removes the call entirely", async () => {
  const ctx = await setup("manual-call-stop-predicates");
  try {
    const { manualCall, fixture, seeded, clock, target } = ctx;
    const service = manualCall.createD1ManualCallService(fixture.database, scopeFor(seeded, clock), { eligibility: syntheticReadyPort(seeded).port });
    const view = await service.projectManualCall(target);
    assert.equal(view.decision.eligible, true);
    const anchor = await fixture.database.prepare("SELECT command_id FROM outreach_package_approvals WHERE id=?").bind(target.packageApprovalId).first();
    await fixture.database.prepare(
      `INSERT INTO outreach_stop_events (id,workspace_id,stop_kind,tombstone_id,subject_kind,subject_digest,source_event_digest,reason_code,command_id,effective_at,created_at)
       VALUES ('manual-call-reply-stop',?,'reply',NULL,'exact_email',?,?,'reply_received',?,?,?)`,
    ).bind(seeded.workspaceId, seeded.contactPointDigest, "d".repeat(64), anchor.command_id, clock.value, clock.value).run();
    await assert.rejects(service.recordOutcome(outcomeCommand(view, "follow_up", "manual-call-follow-up-after-reply")), /stale_or_ineligible/u);
    assert.equal((await service.recordOutcome(outcomeCommand(view, "connected", "manual-call-connected-after-reply"))).outcome, "connected");

    await fixture.database.prepare("UPDATE customer_profiles SET lifecycle='paused' WHERE id=? AND workspace_id=?").bind(seeded.profileId, seeded.workspaceId).run();
    const paused = await service.projectManualCall(target);
    assert.equal(paused.decision.eligible, false);
    assert.ok(paused.decision.reasonCodes.includes("prospect_unavailable"));
    assert.equal(paused.decision.callScript, null);
    await assert.rejects(service.recordOutcome(outcomeCommand(view, "voicemail", "manual-call-voicemail-paused")), /stale_or_ineligible/u);
    // do_not_call stays recordable while paused.
    assert.equal((await service.recordOutcome(outcomeCommand(view, "do_not_call", "manual-call-dnc-paused", "Asked not to be called."))).outcome, "do_not_call");
  } finally {
    await ctx.fixture.dispose();
  }
});

test("manual-call source has no static call or mail link, no preparation import, and no bypass of the click-to-call recheck", async () => {
  const source = await readFile(MANUAL_CALL, "utf8");
  assert.doesNotMatch(source, /\btel:|\bmailto:/iu, "no literal call or mail scheme");
  assert.doesNotMatch(source, /(?:^|["'/])preparation\//mu);
  assert.doesNotMatch(source, /gmail|twilio|fetch\s*\(/iu, "no provider reach");
  assert.match(source, /import\s*\{[^}]*\brecheckForClickToCall\b[^}]*\}\s*from\s*"\.\/contact-eligibility"/u);
  assert.match(source, /recordSuppressionStop/u, "do_not_call goes through the shared suppression stop rule");
  assert.doesNotMatch(source, /INSERT INTO outreach_suppression_tombstones/iu, "no private tombstone writer");
  const eligibility = await readFile(ELIGIBILITY, "utf8");
  assert.match(eligibility, /export function recheckForClickToCall\(input: unknown\): DownstreamRecheck \{ return blockedRecheck\("click_to_call", input\); \}/u);
});

test("a server-authorized phone action becomes available only after owner UAT", { todo: "06-13 not implemented" }, () => {
  assert.fail("06-13 Task 3 owner UAT has not enabled the phone action");
});
