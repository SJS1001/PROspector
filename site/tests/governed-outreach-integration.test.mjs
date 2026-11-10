import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createServer } from "vite";

import { createD1Fixture } from "./helpers/d1.mjs";
import { assertNoForbiddenStates, fakeMailPort, fakeOriginStore, FORBIDDEN_STATES } from "./helpers/outreach-dispatch-lane.mjs";
import {
  addSenderConnection, CLOCK, count, MODULES, OUTREACH_NOW, OUTREACH_OWNER, RECIPIENT,
  recordRecipientAuthority, seedOutreachWorkspace, syntheticServices, UNSUBSCRIBE_TOKEN,
} from "./helpers/outreach-ui-fixture.mjs";

// 06-09 Task 1 (local): one synthetic Prospect walked through the governed
// outreach lifecycle with the merged Phase 6 services composed together:
// package and message versions -> CRM-only package approval -> exact message
// approval -> governed enqueue -> stop events (originated reply and bounce,
// public unsubscribe, owner suppression, do_not_call with the owner-confirmed
// number) -> cancellation -> CRM handoff exclusion. The same flow composed with
// the production (always-refusing) Phase 5 rechecks refuses at every forward
// gate while every stop still applies.
//
// Synthetic data and fake ports only. Only tests inject a synthetic
// ContactReady. Nothing is sent: the fake MailPort's dispatch and reconcile
// counters stay at zero, every result reports providerCalls 0, the D1 send
// states (dispatching, sent, delivery_unknown) never appear, and any fetch to a
// non-loopback host fails the test. Locally accepted only; no plan credit.

const SYNC_NOW = OUTREACH_NOW + 2_000;
const SENDER_CONNECTION_ID = "ui-sender-connection";
const SENDER_SUBJECT_DIGEST = "6".repeat(64);
const FOLLOW_UP_TOKEN = "synthetic-unsubscribe-token-follow-up-0123456789";
const CONFIRMED_PHONE = "+1 416 555 0100";
const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);

const MORE = Object.freeze({
  sync: new URL("../domain/originated-mail-sync.ts", import.meta.url).pathname,
  gmail: new URL("../adapters/gmail.ts", import.meta.url).pathname,
  crm: new URL("../domain/crm-handoff.ts", import.meta.url).pathname,
  eligibility: new URL("../domain/contact-eligibility.ts", import.meta.url).pathname,
});

// ---------------------------------------------------------------------------
// Lane-local helpers (tests/helpers/outreach-fixture.mjs is not edited)
// ---------------------------------------------------------------------------

/** Any fetch to a non-loopback host is refused and recorded. Miniflare's D1 proxy stays on loopback. */
function guardNetwork() {
  const original = globalThis.fetch;
  const external = [];
  globalThis.fetch = async (input, init) => {
    const href = typeof input === "string" ? input : input instanceof URL ? input.href : input?.url;
    let host = "unparseable";
    try { host = new URL(href).hostname; } catch { /* recorded below */ }
    if (!LOOPBACK.has(host)) {
      external.push(host);
      throw new Error("governed-outreach integration refuses non-loopback network access");
    }
    return original(input, init);
  };
  return { external, restore() { globalThis.fetch = original; } };
}

/** A workspace with the Lane G seed, a second (follow-up) Message Version, and a movable clock. */
async function lifecycleWorkspace(name, options = {}) {
  const network = guardNetwork();
  const fixture = await createD1Fixture(name);
  try {
    const context = await seedOutreachWorkspace(fixture, { approvePackage: false, ...options });
    const suppression = await fixture.vite.ssrLoadModule(MODULES.suppression);
    context.followUpVersion = await context.repository.createMessageVersion({
      messageId: "ui-message-follow-up", packageId: "ui-package", packageVersionId: context.packageVersion.id, version: 1, expectedVersion: 0,
      snapshot: {
        senderReference: "sender-synthetic", from: "owner@example.invalid", replyTo: null, to: [RECIPIENT], cc: [], bcc: [],
        subject: "Synthetic governed outreach follow-up", textBody: "A synthetic follow-up.", htmlBody: null,
        links: ["https://example.invalid/unsubscribe"], attachments: [], threadReference: null, replyToMessageReference: null,
      },
      intendedSendAt: OUTREACH_NOW + 1_000, timezone: "America/Toronto", unsubscribeTokenDigest: await suppression.unsubscribeTokenDigest(FOLLOW_UP_TOKEN),
      bindings: [{ kind: "package_version", id: context.packageVersion.id, digest: context.packageVersion.digest }],
      idempotencyKey: "ui-message-version-follow-up",
    });
    const clock = { now: CLOCK };
    const scope = Object.freeze({ workspaceId: context.seeded.workspaceId, ownerSubject: OUTREACH_OWNER.subject, now: () => clock.now });
    const [handler, outbox, sync, gmail, crm, stopRules, unsubscribe] = await Promise.all([
      MODULES.handler, MODULES.outbox, MORE.sync, MORE.gmail, MORE.crm, MODULES.stopRules, MODULES.unsubscribe,
    ].map((path) => fixture.vite.ssrLoadModule(path)));
    const contact = await fixture.database.prepare("SELECT identity_digest FROM contacts WHERE id=? AND workspace_id=?")
      .bind(context.seeded.contactId, context.seeded.workspaceId).first();
    const modules = { handler, outbox, sync, gmail, crm, stopRules, unsubscribe, suppression };
    return { fixture, network, context, clock, scope, modules, contactIdentityDigest: contact.identity_digest };
  } catch (error) {
    network.restore();
    await fixture.dispose();
    throw error;
  }
}

async function dispose(workspace) {
  try {
    assert.deepEqual(workspace.network.external, [], "no non-loopback network request was attempted");
  } finally {
    workspace.network.restore();
    await workspace.fixture.dispose();
  }
}

async function recordAuthorityFor(context, messageVersion, packageApprovalId, suffix) {
  const authority = await context.repository.recordRecipientDispatchAuthority({
    messageVersionId: messageVersion.id, packageApprovalId, emailObservationId: context.seeded.observationId,
    jurisdictionCode: "CA-ON", claimedBasisCode: "legitimate_interest", basisSourceId: "outreach-source", basisSourceDigest: context.seeded.sourceDigest,
    advisoryPolicyVersion: "prospector-advisory-v1", advisoryPolicyDigest: "c".repeat(64), unsubscribePathDigest: "d".repeat(64),
    acknowledgedAt: CLOCK, validUntil: OUTREACH_NOW + 70_000, idempotencyKey: `h-recipient-authority-${suffix}`,
  });
  await context.repository.recordUnsubscribeAuthorityEvent({
    recipientAuthorityId: authority.id, expectedRevision: 0, status: "working", checkDigest: "e".repeat(64),
    observedAt: CLOCK, validUntil: OUTREACH_NOW + 70_000, idempotencyKey: `h-unsubscribe-working-${suffix}`,
  });
  return authority;
}

/** Drives package approval, both message approvals and both queues through the owner handler. */
async function approveAndQueue(workspace, services) {
  const { fixture, context, scope, modules } = workspace;
  const run = (body) => modules.handler.executeOutreachCommand(fixture.database, scope, services, body);
  const pkg = await run({ action: "approve_package", packageVersionId: context.packageVersion.id, reviewedDigest: context.packageVersion.digest, idempotencyKey: "h-package-approval" });
  assert.equal(pkg.status, 200, JSON.stringify(pkg.body.command));
  const packageApprovalId = pkg.body.command.approvalId;
  const approvals = {};
  for (const [label, version] of [["origin", context.messageVersion], ["followUp", context.followUpVersion]]) {
    const authority = label === "origin"
      ? await recordRecipientAuthority(context, packageApprovalId)
      : await recordAuthorityFor(context, version, packageApprovalId, "follow-up");
    const message = await run({
      action: "approve_message", messageVersionId: version.id, reviewedDigest: version.digest,
      packageApprovalId, acknowledgementDigest: authority.digest, idempotencyKey: `h-message-approval-${label}`,
    });
    assert.equal(message.status, 200, JSON.stringify(message.body.command));
    approvals[label] = message.body.command.approvalId;
  }
  await addSenderConnection(fixture, context);
  const items = {};
  for (const label of ["origin", "followUp"]) {
    const queued = await run({ action: "queue_message", messageApprovalId: approvals[label] });
    assert.equal(queued.status, 200, JSON.stringify(queued.body.command));
    assert.equal(queued.body.command.providerCalls, 0);
    items[label] = queued.body.command.outboxItemId;
  }
  return { run, pkg, packageApprovalId, approvals, items };
}

function outboxAt(workspace, now) {
  return workspace.modules.outbox.createD1OutboxRepository(workspace.fixture.database, { ...workspace.scope, now: () => now });
}

async function latestState(workspace, outboxItemId) {
  return workspace.fixture.database.prepare(
    "SELECT state,reason_code FROM outreach_outbox_events WHERE outbox_item_id=? ORDER BY revision DESC LIMIT 1",
  ).bind(outboxItemId).first();
}

async function statesOf(workspace, items) {
  const states = {};
  for (const [label, id] of Object.entries(items)) states[label] = (await latestState(workspace, id)).state;
  return states;
}

function originRecord(outboxItemId) {
  return {
    connectionId: SENDER_CONNECTION_ID, outboxItemId, leaseGeneration: 1,
    originatedMessageId: "gmail-message-h-0001", originatedThreadId: "gmail-thread-h-0001", connectionSubjectDigest: SENDER_SUBJECT_DIGEST,
  };
}

function inbound(kind, originated, overrides = {}) {
  return kind === "reply"
    ? { kind: "reply", originated, sender: RECIPIENT, subject: "Re: Synthetic governed outreach", excerpt: "Thanks, happy to talk next week.", occurredAt: OUTREACH_NOW + 1_500, ...overrides }
    : { kind: "bounce", originated, bounceClass: "hard", subject: "Undeliverable", excerpt: "Synthetic delivery status notification.", occurredAt: OUTREACH_NOW + 1_500, ...overrides };
}

/** Syncs one inbound event for the leased origin item through the originated-mail seam and a fake MailPort. */
async function syncInbound(workspace, origin, kind, overrides = {}) {
  const port = fakeMailPort((request) => ({ events: [inbound(kind, request.originated[0], overrides)], observedThrough: request.observedThrough }));
  const sync = workspace.modules.sync.createOriginatedMailSync(workspace.fixture.database, { ...workspace.scope, now: () => SYNC_NOW }, {
    mailPort: port.port, originStore: fakeOriginStore([originRecord(origin)]).store,
  });
  const result = await sync.syncConnection({ connectionId: SENDER_CONNECTION_ID, observedAfter: OUTREACH_NOW, observedThrough: SYNC_NOW });
  return { result, port };
}

/** The real D1 suppression resolver and a CRM source built from the seeded Contact's email and phone points. */
function crmPorts(workspace, eligibility, packageDigest) {
  const { fixture, context, scope, modules, contactIdentityDigest } = workspace;
  const { seeded } = context;
  const resolver = modules.suppression.createSuppressionResolver(fixture.database, scope);
  const candidate = (kind) => {
    const email = kind === "email";
    return {
      workspaceId: seeded.workspaceId, prospectState: "Export-ready", deleted: false, aliasOf: null,
      verificationClass: email ? "mailbox_verified" : "source_verified", packageDigest,
      contactLineage: { identityDigest: contactIdentityDigest, aliasDigests: [] },
      eligibilityInput: { boundary: "crm_export", contactPointId: email ? seeded.observationId : seeded.phoneObservationId },
      cells: {
        prospect_id: seeded.prospectId, company_id: "synthetic-company-h", product_id: "synthetic-product-h", market_play_id: "synthetic-market-play-h",
        profile_id: seeded.profileId, account_target: "Fictional Example Company", selected_role: "champion", contact_id: seeded.contactId,
        contact_point_id: email ? seeded.observationId : seeded.phoneObservationId, contact_kind: kind,
        contact_value: email ? RECIPIENT : seeded.phoneNumber, verification_class: email ? "synthetic_mailbox_verified" : "synthetic_source_verified",
        verification_method_ref: "synthetic-verification-h", verification_time: "2026-09-26T00:00:00.000Z",
        qualification_score_ref: "synthetic-qualification-h", evidence_refs: "synthetic-evidence-h", offer_ref: "synthetic-offer-h",
        package_ref: "synthetic-package-h", activity_status: "synthetic_no_activity", source_workspace_id: seeded.workspaceId,
        source_run_id: "synthetic-run-h", export_manifest_ref: "synthetic-export-manifest-h",
      },
    };
  };
  const calls = { eligibility: 0, store: 0 };
  return {
    calls,
    ports: {
      source: { async read() {
        return {
          exportScope: { tenantId: "synthetic-tenant-h", workspaceId: seeded.workspaceId }, selectionId: "synthetic-selection-h",
          selectionRevision: 1, authorityRevision: 1, configurationDigest: seeded.configurationDigest, exportDefinitionDigest: "b".repeat(64),
          candidates: [candidate("email"), candidate("phone")],
        };
      } },
      eligibility: { async recheck(request) { calls.eligibility += 1; return eligibility.recheck(request); } },
      suppression: { blockingScopes: (input) => resolver.blockingScopes(input) },
      store: { async lookup() { return null; }, async putImmutable() { calls.store += 1; } },
      clock: { nowIso: () => "2026-11-09T12:00:00.000Z" },
    },
  };
}

const SYNTHETIC_CRM_READY = Object.freeze({ async recheck() { return { contactReady: true }; } });

async function crmPlan(workspace, eligibility = SYNTHETIC_CRM_READY) {
  const { ports, calls } = crmPorts(workspace, eligibility, workspace.context.packageVersion.digest);
  const plan = await workspace.modules.crm.planCrmHandoff({ workspaceId: workspace.context.seeded.workspaceId, ports });
  const reasons = (contactPointId) => plan.exclusions.filter((entry) => entry.contactPointId === contactPointId).map((entry) => entry.reason);
  return {
    plan, calls, ports,
    rows: plan.rows.map((row) => row.cells.contact_kind).sort(),
    email: reasons(workspace.context.seeded.observationId),
    phone: reasons(workspace.context.seeded.phoneObservationId),
  };
}

async function callCard(workspace, services) {
  const projection = await workspace.modules.handler.readOutreachProjection(workspace.fixture.database, workspace.scope, services);
  return projection.calls[0];
}

async function callOutcome(workspace, services, outcome, idempotencyKey, extra = {}) {
  const card = await callCard(workspace, services);
  return workspace.modules.handler.executeOutreachCommand(workspace.fixture.database, workspace.scope, services, {
    action: "record_call_outcome", packageApprovalId: card.packageApprovalId, phoneObservationId: card.phoneObservationId,
    expectedDecisionDigest: card.decision.decisionDigest, outcome, notes: `Synthetic ${outcome} outcome.`, idempotencyKey, ...extra,
  });
}

/** Neither a leased nor a pending item can move toward a provider call. */
async function assertNoSendPath(workspace, items, leaseGeneration = 1) {
  const late = outboxAt(workspace, SYNC_NOW + 10);
  const receipt = await late.recordPreCallRecheckReceipt({ outboxItemId: items.origin, holderId: "h-worker-origin", leaseGeneration });
  assert.equal(receipt.kind, "blocked", "the leased origin cannot record a pre-call receipt after the stop");
  assert.equal(receipt.providerCalls, 0);
  const lease = await late.claimDispatchLease({ outboxItemId: items.followUp, holderId: "h-worker-follow-up" });
  assert.equal(lease.kind, "blocked", "the cancelled follow-up cannot be leased");
  assert.equal(lease.providerInvocationAuthorized, false);
  await assertNoForbiddenStates(workspace.fixture);
}

function assertNoDialOrMail(value, label) {
  const serialized = JSON.stringify(value);
  assert.doesNotMatch(serialized, /tel:|mailto:/i, `${label} carries no dial or mail scheme`);
}

// ---------------------------------------------------------------------------
// Task 1: synthetic lifecycle with test-only readiness
// ---------------------------------------------------------------------------

test("one Prospect walks package, approvals, governed enqueue, originated reply, owner suppression, do_not_call and CRM exclusion with zero provider calls", async () => {
  const workspace = await lifecycleWorkspace("governed-outreach-lifecycle");
  const { fixture, context, scope, modules } = workspace;
  try {
    const services = (await syntheticServices(fixture, context))(fixture.database, scope);
    assert.equal(services.mode, "synthetic");

    // Gates before approval: nothing is queueable, and package approval is CRM-only.
    const early = await modules.handler.executeOutreachCommand(fixture.database, scope, services, { action: "queue_message", messageApprovalId: "not-an-approval-yet" });
    assert.equal(early.status, 409);
    const wrongDigest = await modules.handler.executeOutreachCommand(fixture.database, scope, services, {
      action: "approve_package", packageVersionId: context.packageVersion.id, reviewedDigest: "f".repeat(64), idempotencyKey: "h-wrong-digest",
    });
    assert.ok(wrongDigest.body.command.reasonCodes.includes("reviewed_digest_mismatch"));

    const flow = await approveAndQueue(workspace, services);
    assert.equal(flow.pkg.body.command.authority, "crm_eligibility_only");
    const replay = await flow.run({ action: "queue_message", messageApprovalId: flow.approvals.origin });
    assert.equal(replay.body.command.status, "replayed", "the governed enqueue is idempotent by approval");
    assert.equal(await count(fixture, "outreach_outbox_items"), 2);
    assert.deepEqual(await statesOf(workspace, flow.items), { origin: "pending", followUp: "pending" });

    // Cross-workspace: the same owner's commands under another workspace reach nothing.
    const foreignScope = Object.freeze({ workspaceId: "foreign-workspace-h", ownerSubject: OUTREACH_OWNER.subject, now: scope.now });
    const foreignServices = (await syntheticServices(fixture, context))(fixture.database, foreignScope);
    for (const body of [
      { action: "queue_message", messageApprovalId: flow.approvals.followUp },
      { action: "approve_package", packageVersionId: context.packageVersion.id, reviewedDigest: context.packageVersion.digest, idempotencyKey: "h-foreign-approval" },
    ]) {
      const foreign = await modules.handler.executeOutreachCommand(fixture.database, foreignScope, foreignServices, body);
      assert.equal(foreign.status, 409, JSON.stringify(foreign.body.command));
      assert.deepEqual(foreign.body.projection.packages, [], "another workspace projects none of this workspace's artifacts");
    }
    assert.equal(await count(fixture, "outreach_outbox_items"), 2);

    // CRM handoff before any stop: both verified points are exportable with synthetic readiness.
    const before = await crmPlan(workspace);
    assert.deepEqual(before.rows, ["email", "phone"]);
    assert.equal(before.plan.providerCalls, 0);

    // A synthetic worker leases the origin (generation 1). D1 cannot represent a send.
    workspace.clock.now = OUTREACH_NOW + 1_000;
    const lease = await outboxAt(workspace, OUTREACH_NOW + 1_000).claimDispatchLease({ outboxItemId: flow.items.origin, holderId: "h-worker-origin" });
    assert.equal(lease.kind, "claimed");
    assert.equal(lease.providerInvocationAuthorized, false);
    assert.equal(lease.leaseGeneration, 1);

    // Manual call with synthetic readiness: an outcome is recorded, the phone action stays disabled.
    const card = await callCard(workspace, services);
    assert.equal(card.decision.eligible, true, JSON.stringify(card.decision));
    assert.deepEqual(card.phoneAction, { enabled: false, reason: "owner_uat_pending" });
    const connected = await callOutcome(workspace, services, "connected", "h-call-connected");
    assert.equal(connected.status, 200, JSON.stringify(connected.body.command));
    assert.equal(connected.body.command.phoneEffectAuthorized, false);

    // Originated reply: one durable stop, both pending and leased work cancelled, no MailPort send.
    workspace.clock.now = SYNC_NOW;
    const reply = await syncInbound(workspace, flow.items.origin, "reply");
    assert.equal(reply.result.kind, "synced", JSON.stringify(reply.result));
    assert.deepEqual(reply.result.accepted.map((entry) => [entry.classification, entry.outcome]), [["reply", "stopped"]]);
    assert.deepEqual([...reply.result.accepted[0].cancelledOutboxItemIds].sort(), [flow.items.origin, flow.items.followUp].sort());
    assert.deepEqual(reply.port.counts, { dispatch: 0, reconcile: 0, sync: 1 });
    assert.deepEqual(await statesOf(workspace, flow.items), { origin: "cancelled", followUp: "cancelled" });
    await assertNoSendPath(workspace, flow.items);
    const duplicate = await syncInbound(workspace, flow.items.origin, "reply");
    assert.equal(duplicate.result.accepted[0].replayed, true, "a duplicate sync is a replay");
    assert.equal(await count(fixture, "outreach_stop_events"), 1);

    // A reply blocks a manual follow_up; it does not make the phone callable either.
    const followUp = await callOutcome(workspace, services, "follow_up", "h-call-follow-up");
    assert.equal(followUp.status, 409);
    assert.deepEqual(followUp.body.command.reasonCodes, ["stale_or_ineligible"]);

    // A reply is not a suppression, so CRM export is unchanged until the owner suppresses.
    assert.deepEqual((await crmPlan(workspace)).rows, ["email", "phone"]);
    const suppressed = await flow.run({ action: "record_suppression", subjectKind: "exact_email", value: RECIPIENT, channel: "email", reason: "explicit_opt_out", confirmed: true, idempotencyKey: "h-owner-email" });
    assert.equal(suppressed.status, 200, JSON.stringify(suppressed.body.command));
    assert.equal(suppressed.body.command.cancelledOutboxItems, 0, "nothing live was left to cancel");
    const afterEmail = await crmPlan(workspace);
    assert.deepEqual(afterEmail.rows, ["phone"]);
    assert.deepEqual(afterEmail.email, ["suppressed_exact"]);
    assert.equal(JSON.stringify(afterEmail.plan.nonContactable).includes(RECIPIENT), false, "a non-contactable entry never carries the value");

    // do_not_call with the owner-confirmed number (D-8): contact and number tombstones before the outcome.
    const dnc = await callOutcome(workspace, services, "do_not_call", "h-call-dnc", { confirmedPhoneE164: CONFIRMED_PHONE });
    assert.equal(dnc.status, 200, JSON.stringify(dnc.body.command));
    assert.deepEqual(dnc.body.command.suppression, { contactPhoneBlocked: true, numberBlocked: true });
    const afterDnc = await crmPlan(workspace);
    assert.deepEqual(afterDnc.rows, [], "neither point is exportable after the opt-out and do_not_call");
    assert.ok(afterDnc.phone.length > 0 && afterDnc.phone.every((reason) => reason.startsWith("suppressed_")), JSON.stringify(afterDnc.phone));
    const after = await callCard(workspace, services);
    assert.equal(after.decision.eligible, false, "the suppressed phone is no longer eligible, even with synthetic readiness");
    assert.deepEqual(after.phoneAction, { enabled: false, reason: "not_eligible" });
    const again = await callOutcome(workspace, services, "connected", "h-call-after-dnc");
    assert.equal(again.status, 409, "no outcome can be recorded against a do_not_call phone");

    // The authoritative projection: history retained, no callable target, no send state, no provider call.
    const projection = await modules.handler.readOutreachProjection(fixture.database, scope, services);
    assert.deepEqual(projection.effects, { providerCalls: 0 });
    assert.deepEqual(projection.gates.phone, { enabled: false, reason: "owner_uat_pending" });
    assert.deepEqual(projection.delivery.map((row) => row.state), ["cancelled", "cancelled"]);
    assert.deepEqual(projection.stops.map((row) => row.stopKind).sort(), ["reply", "suppression", "suppression", "suppression"], "one reply stop plus one suppression stop per tombstone");
    assert.deepEqual(projection.suppressions.map((row) => `${row.subjectKind}:${row.reason}`).sort(), ["contact:do_not_call", "e164_phone:do_not_call", "exact_email:explicit_opt_out"]);
    assert.ok(projection.messages.every((message) => message.approval.state === "consumed"));
    assertNoDialOrMail(projection, "the projection");
    assert.equal(JSON.stringify(projection).includes(context.seeded.phoneNumber), false, "the phone number is never projected");
    assert.ok(projection.delivery.every((row) => !FORBIDDEN_STATES.includes(row.state)));
    await assertNoForbiddenStates(fixture);
  } finally { await dispose(workspace); }
});

test("every stop kind cancels pending and leased work for the same Prospect before reporting success, and a stopped item never reaches a pre-call receipt", async () => {
  const stops = [
    {
      kind: "hard bounce", expect: { cancelled: 2, durable: ["stop:bounce"], crmEmail: [] },
      async apply(workspace, flow) {
        const { result, port } = await syncInbound(workspace, flow.items.origin, "bounce");
        assert.deepEqual(result.accepted.map((entry) => [entry.classification, entry.outcome]), [["bounce", "stopped"]]);
        assert.equal(port.counts.dispatch + port.counts.reconcile, 0);
        return result.accepted[0].cancelledOutboxItemIds.length;
      },
    },
    {
      kind: "opt-out via public unsubscribe", expect: { cancelled: 2, durable: ["stop:suppression", "tombstone:exact_email:unsubscribe"], crmEmail: ["suppressed_exact"] },
      async apply(workspace) {
        const limiter = workspace.modules.unsubscribe.createInMemoryRateLimiter({ limit: 5, windowMs: 60_000, now: () => SYNC_NOW });
        const response = await workspace.modules.unsubscribe.handlePublicUnsubscribePost(new Request("https://prospector.test/api/unsubscribe", {
          method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token: UNSUBSCRIBE_TOKEN }).toString(),
        }), { database: workspace.fixture.database, limiter, now: () => SYNC_NOW });
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), { message: workspace.modules.stopRules.UNSUBSCRIBE_ACKNOWLEDGEMENT });
        return null;
      },
    },
    {
      kind: "owner exact-email suppression", expect: { cancelled: 2, durable: ["stop:suppression", "tombstone:exact_email:owner_request"], crmEmail: ["suppressed_exact"] },
      apply: (workspace, flow, services) => ownerSuppression(workspace, services, { subjectKind: "exact_email", value: RECIPIENT, channel: "email" }),
    },
    {
      kind: "owner confirmed-domain suppression", expect: { cancelled: 2, durable: ["stop:suppression", "tombstone:confirmed_email_domain:owner_request"], crmEmail: ["suppressed_domain"] },
      apply: (workspace, flow, services) => ownerSuppression(workspace, services, { subjectKind: "confirmed_email_domain", value: "example.invalid", channel: "email" }),
    },
    {
      kind: "owner company suppression", expect: { cancelled: 2, durable: ["stop:suppression", "tombstone:company:owner_request"], crmEmail: ["suppressed_company"] },
      apply: (workspace, flow, services) => ownerSuppression(workspace, services, { subjectKind: "company", channel: "all" }),
    },
    {
      // D-7 (owner-delegated decision, migration 0024): a Contact tombstone applies to its own
      // channel only, so a phone do_not_call leaves the Contact's email work queued. The phone
      // itself stays blocked and is never exported.
      kind: "do_not_call with the owner-confirmed number", expect: { cancelled: 2, states: { origin: "leased", followUp: "pending" }, emailStopped: false, durable: ["stop:suppression", "stop:suppression", "tombstone:contact:do_not_call", "tombstone:e164_phone:do_not_call"], crmEmail: null },
      async apply(workspace, flow, services) {
        const result = await callOutcome(workspace, services, "do_not_call", "h-matrix-dnc", { confirmedPhoneE164: CONFIRMED_PHONE });
        assert.equal(result.status, 200, JSON.stringify(result.body.command));
        assert.deepEqual(result.body.command.suppression, { contactPhoneBlocked: true, numberBlocked: true });
        return null;
      },
    },
  ];
  for (const stop of stops) {
    const workspace = await lifecycleWorkspace(`governed-outreach-stop-${stop.kind.replace(/[^a-z]+/gu, "-")}`);
    try {
      const { fixture, context, scope } = workspace;
      const services = (await syntheticServices(fixture, context))(fixture.database, scope);
      const flow = await approveAndQueue(workspace, services);
      workspace.clock.now = OUTREACH_NOW + 1_000;
      assert.equal((await outboxAt(workspace, OUTREACH_NOW + 1_000).claimDispatchLease({ outboxItemId: flow.items.origin, holderId: "h-worker-origin" })).kind, "claimed", stop.kind);
      workspace.clock.now = SYNC_NOW;
      const cancelled = await stop.apply(workspace, flow, services);
      if (cancelled !== null) assert.equal(cancelled, stop.expect.cancelled, stop.kind);
      const states = await statesOf(workspace, flow.items);
      assert.deepEqual(states, stop.expect.states ?? { origin: "cancelled", followUp: "cancelled" }, stop.kind);
      const durable = [
        ...(await fixture.database.prepare("SELECT stop_kind FROM outreach_stop_events").all()).results.map((row) => `stop:${row.stop_kind}`),
        ...(await fixture.database.prepare("SELECT subject_kind,reason FROM outreach_suppression_tombstones").all()).results.map((row) => `tombstone:${row.subject_kind}:${row.reason}`),
      ].sort();
      assert.deepEqual(durable, stop.expect.durable, stop.kind);
      if (stop.expect.emailStopped === false) await assertNoForbiddenStates(fixture);
      else await assertNoSendPath(workspace, flow.items);
      const crm = await crmPlan(workspace);
      if (stop.expect.crmEmail !== null) assert.deepEqual(crm.email, stop.expect.crmEmail, `${stop.kind}: CRM email exclusion`);
      if (stop.kind.startsWith("do_not_call")) {
        assert.ok(!crm.rows.includes("phone"), `${stop.kind}: the do_not_call phone is never exported`);
        assert.ok(crm.phone.every((reason) => reason.startsWith("suppressed_")) && crm.phone.length > 0, JSON.stringify(crm.phone));
      }
      if (stop.expect.durable.some((entry) => entry.startsWith("tombstone:company"))) assert.deepEqual(crm.rows, [], "a company tombstone exports nothing");
    } finally { await dispose(workspace); }
  }
});

async function ownerSuppression(workspace, services, subject) {
  const result = await workspace.modules.handler.executeOutreachCommand(workspace.fixture.database, workspace.scope, services, {
    action: "record_suppression", reason: "owner_request", confirmed: true, idempotencyKey: `h-owner-${subject.subjectKind}`, ...subject,
  });
  assert.equal(result.status, 200, JSON.stringify(result.body.command));
  assert.equal(result.body.command.providerCalls, 0);
  assert.equal(result.body.command.uncancelledOutboxItems, 0);
  return result.body.command.cancelledOutboxItems;
}

test("a later touch after a stop needs a new Message Version and approval, and the stop still refuses it", async () => {
  const workspace = await lifecycleWorkspace("governed-outreach-later-touch");
  try {
    const { fixture, context, scope, modules } = workspace;
    const services = (await syntheticServices(fixture, context))(fixture.database, scope);
    const flow = await approveAndQueue(workspace, services);
    // Control: before any stop, a later touch is a new Message Version with its own exact approval.
    const later = await context.repository.createMessageVersion({
      messageId: "ui-message", packageId: "ui-package", packageVersionId: context.packageVersion.id, version: 2, expectedVersion: 1,
      snapshot: {
        senderReference: "sender-synthetic", from: "owner@example.invalid", replyTo: null, to: [RECIPIENT], cc: [], bcc: [],
        subject: "Synthetic later touch", textBody: "A later synthetic touch.", htmlBody: null,
        links: ["https://example.invalid/unsubscribe"], attachments: [], threadReference: null, replyToMessageReference: null,
      },
      intendedSendAt: OUTREACH_NOW + 1_000, timezone: "America/Toronto",
      unsubscribeTokenDigest: await modules.suppression.unsubscribeTokenDigest("synthetic-unsubscribe-token-later-touch-0123456789"),
      bindings: [{ kind: "package_version", id: context.packageVersion.id, digest: context.packageVersion.digest }],
      idempotencyKey: "h-message-version-later",
    });
    const authority = await recordAuthorityFor(context, later, flow.packageApprovalId, "later");
    const approval = await flow.run({
      action: "approve_message", messageVersionId: later.id, reviewedDigest: later.digest, packageApprovalId: flow.packageApprovalId,
      acknowledgementDigest: authority.digest, idempotencyKey: "h-message-approval-later",
    });
    assert.equal(approval.status, 200, JSON.stringify(approval.body.command));
    assert.equal(await count(fixture, "outreach_outbox_items"), 2, "approving the later touch queues nothing");

    workspace.clock.now = SYNC_NOW;
    assert.equal(await ownerSuppression(workspace, services, { subjectKind: "exact_email", value: RECIPIENT, channel: "email" }), 2);
    // Re-queueing a consumed approval only replays the existing, now cancelled, item.
    const requeue = await flow.run({ action: "queue_message", messageApprovalId: flow.approvals.followUp });
    assert.equal(requeue.body.command.status, "replayed");
    assert.equal(requeue.body.command.outboxItemId, flow.items.followUp);
    assert.equal((await latestState(workspace, flow.items.followUp)).state, "cancelled");
    // The approved later touch is refused by the governed enqueue once the recipient is suppressed.
    const queued = await flow.run({ action: "queue_message", messageApprovalId: approval.body.command.approvalId });
    assert.equal(queued.status, 409, JSON.stringify(queued.body.command));
    assert.equal(queued.body.command.providerCalls, 0);
    // And a fresh approval of another version is refused at approval time.
    const third = await context.repository.createMessageVersion({
      messageId: "ui-message", packageId: "ui-package", packageVersionId: context.packageVersion.id, version: 3, expectedVersion: 2,
      snapshot: {
        senderReference: "sender-synthetic", from: "owner@example.invalid", replyTo: null, to: [RECIPIENT], cc: [], bcc: [],
        subject: "Synthetic third touch", textBody: "A third synthetic touch.", htmlBody: null,
        links: ["https://example.invalid/unsubscribe"], attachments: [], threadReference: null, replyToMessageReference: null,
      },
      intendedSendAt: SYNC_NOW + 1_000, timezone: "America/Toronto",
      unsubscribeTokenDigest: await modules.suppression.unsubscribeTokenDigest("synthetic-unsubscribe-token-third-touch-0123456789"),
      bindings: [{ kind: "package_version", id: context.packageVersion.id, digest: context.packageVersion.digest }],
      idempotencyKey: "h-message-version-third",
    });
    const thirdAuthority = await recordAuthorityFor(context, third, flow.packageApprovalId, "third");
    const thirdApproval = await flow.run({
      action: "approve_message", messageVersionId: third.id, reviewedDigest: third.digest, packageApprovalId: flow.packageApprovalId,
      acknowledgementDigest: thirdAuthority.digest, idempotencyKey: "h-message-approval-third",
    });
    assert.equal(thirdApproval.status, 409, JSON.stringify(thirdApproval.body.command));
    assert.equal(await count(fixture, "outreach_outbox_items"), 2, "no new outbox item after the stop");
    await assertNoForbiddenStates(fixture);
  } finally { await dispose(workspace); }
});

test("concurrent owner suppression and lease claims never leave work that can reach a pre-call receipt", async () => {
  const workspace = await lifecycleWorkspace("governed-outreach-concurrency");
  try {
    const { fixture, context, scope, modules } = workspace;
    const services = (await syntheticServices(fixture, context))(fixture.database, scope);
    const flow = await approveAndQueue(workspace, services);
    workspace.clock.now = OUTREACH_NOW + 1_000;
    const leaseAt = outboxAt(workspace, OUTREACH_NOW + 1_000);
    const [suppression, originLease, followUpLease, duplicateLease] = await Promise.all([
      modules.handler.executeOutreachCommand(fixture.database, scope, services, {
        action: "record_suppression", subjectKind: "exact_email", value: RECIPIENT, channel: "email", reason: "owner_request", confirmed: true, idempotencyKey: "h-race-suppression",
      }),
      leaseAt.claimDispatchLease({ outboxItemId: flow.items.origin, holderId: "h-race-worker-a" }),
      leaseAt.claimDispatchLease({ outboxItemId: flow.items.followUp, holderId: "h-race-worker-b" }),
      leaseAt.claimDispatchLease({ outboxItemId: flow.items.followUp, holderId: "h-race-worker-c" }),
    ]);
    assert.equal(suppression.status, 200, JSON.stringify(suppression.body.command));
    const claimedFollowUps = [followUpLease, duplicateLease].filter((lease) => lease.kind === "claimed");
    assert.ok(claimedFollowUps.length <= 1, "one item has at most one current lease holder");
    for (const lease of [originLease, followUpLease, duplicateLease]) assert.equal(lease.providerInvocationAuthorized, false);
    // Whatever interleaving happened, the tombstone wins at the decision point.
    const late = outboxAt(workspace, SYNC_NOW);
    for (const [item, lease, holder] of [[flow.items.origin, originLease, "h-race-worker-a"], ...claimedFollowUps.map((claimed) => [flow.items.followUp, claimed, claimed.holderId])]) {
      if (lease.kind !== "claimed") continue;
      const receipt = await late.recordPreCallRecheckReceipt({ outboxItemId: item, holderId: holder, leaseGeneration: lease.leaseGeneration });
      assert.equal(receipt.kind, "blocked", `${item} cannot reach a pre-call receipt after the suppression`);
    }
    const retry = await outboxAt(workspace, SYNC_NOW).claimDispatchLease({ outboxItemId: flow.items.followUp, holderId: "h-race-worker-d" });
    assert.equal(retry.kind, "blocked");
    // A repeated owner command cancels anything the race left live, then everything is cancelled.
    workspace.clock.now = SYNC_NOW;
    await modules.handler.executeOutreachCommand(fixture.database, scope, services, {
      action: "record_suppression", subjectKind: "exact_email", value: RECIPIENT, channel: "email", reason: "owner_request", confirmed: true, idempotencyKey: "h-race-suppression-2",
    });
    assert.deepEqual(await statesOf(workspace, flow.items), { origin: "cancelled", followUp: "cancelled" });
    await assertNoForbiddenStates(fixture);
  } finally { await dispose(workspace); }
});

// ---------------------------------------------------------------------------
// Production composition: the same flow refuses at every forward gate
// ---------------------------------------------------------------------------

test("with production ports the same Prospect is refused at package approval, message approval, queueing, calling, originated sync and CRM export, while every stop still applies", async () => {
  const workspace = await lifecycleWorkspace("governed-outreach-production", { approvePackage: true, approveMessage: true });
  try {
    const { fixture, context, scope, modules } = workspace;
    const services = modules.handler.composeProductionOutreachServices(fixture.database, scope);
    assert.equal(services.mode, "production");
    const run = (body) => modules.handler.executeOutreachCommand(fixture.database, scope, services, body);
    const results = [];

    // Forward gates: each refuses through the blocked Phase 5 recheck.
    const pkg = await run({ action: "approve_package", packageVersionId: context.packageVersion.id, reviewedDigest: context.packageVersion.digest, idempotencyKey: "h-prod-package" });
    results.push(pkg);
    assert.equal(pkg.status, 409);
    assert.ok(pkg.body.command.reasonCodes.includes("contact_recheck_blocked"), JSON.stringify(pkg.body.command));
    const message = await run({
      action: "approve_message", messageVersionId: context.followUpVersion.id, reviewedDigest: context.followUpVersion.digest,
      packageApprovalId: context.packageApproval.id, acknowledgementDigest: context.recipientAuthority.digest, idempotencyKey: "h-prod-message",
    });
    results.push(message);
    assert.equal(message.status, 409, JSON.stringify(message.body.command));
    const noSender = await run({ action: "queue_message", messageApprovalId: context.messageApproval.id });
    results.push(noSender);
    assert.deepEqual(noSender.body.command.reasonCodes, ["gmail_unavailable"]);
    await addSenderConnection(fixture, context);
    const queue = await run({ action: "queue_message", messageApprovalId: context.messageApproval.id });
    results.push(queue);
    assert.deepEqual(queue.body.command.reasonCodes, ["current_authority_unavailable"], "the final-send recheck refuses");
    const call = await callOutcome(workspace, services, "connected", "h-prod-connected");
    results.push(call);
    assert.equal(call.status, 409);
    assert.deepEqual(call.body.command.reasonCodes, ["stale_or_ineligible"]);
    const card = await callCard(workspace, services);
    assert.equal(card.decision.eligible, false);
    assert.deepEqual(card.phoneAction, { enabled: false, reason: "not_eligible" });

    // Originated sync as production wires it: no originated references and the reject-only Gmail adapter.
    const sync = modules.sync.createOriginatedMailSync(fixture.database, { ...scope, now: () => SYNC_NOW }, {
      mailPort: modules.gmail.UNCONFIGURED_GMAIL_ADAPTER, originStore: modules.sync.NO_ORIGINATED_REFERENCES,
    });
    const synced = await sync.syncConnection({ connectionId: SENDER_CONNECTION_ID, observedAfter: OUTREACH_NOW, observedThrough: SYNC_NOW });
    assert.equal(synced.providerCalls, 0);
    assert.deepEqual(synced.kind === "synced" ? synced.accepted : [], []);
    assert.equal(modules.gmail.UNCONFIGURED_GMAIL_ADAPTER.providerInvocationCount, 0);

    // CRM export with the production eligibility port: no row, nothing stored.
    const crm = await crmPlan(workspace, modules.crm.createCrmExportEligibilityPort());
    assert.deepEqual(crm.rows, []);
    assert.deepEqual([...crm.email, ...crm.phone], ["not_contact_ready", "not_contact_ready"]);
    const materialized = await modules.crm.materializeCrmHandoff({ workspaceId: context.seeded.workspaceId, ports: crm.ports });
    assert.deepEqual({ status: materialized.status, reason: materialized.reason, providerCalls: materialized.providerCalls }, { status: "blocked", reason: "no_eligible_rows", providerCalls: 0 });
    assert.equal(crm.calls.store, 0);

    // Nothing forward was written.
    assert.equal(await count(fixture, "outreach_outbox_items"), 0);
    assert.equal(await count(fixture, "outreach_message_approval_consumptions"), 0);
    assert.equal(await count(fixture, "outreach_package_approvals"), 1, "only the seeded approval exists");
    assert.equal(await count(fixture, "authority_commands", "command_type='manual_call.outcome'"), 0);

    // The stop direction is always open: owner suppression, unsubscribe and do_not_call still apply.
    workspace.clock.now = SYNC_NOW;
    const suppression = await run({ action: "record_suppression", subjectKind: "company", channel: "all", reason: "owner_request", confirmed: true, idempotencyKey: "h-prod-company" });
    results.push(suppression);
    assert.equal(suppression.status, 200);
    const dnc = await callOutcome(workspace, services, "do_not_call", "h-prod-dnc", { confirmedPhoneE164: CONFIRMED_PHONE });
    results.push(dnc);
    assert.equal(dnc.status, 200, JSON.stringify(dnc.body.command));
    assert.deepEqual(dnc.body.command.suppression, { contactPhoneBlocked: true, numberBlocked: true });
    const limiter = modules.unsubscribe.createInMemoryRateLimiter({ limit: 5, windowMs: 60_000, now: () => SYNC_NOW });
    const unsubscribed = await modules.unsubscribe.handlePublicUnsubscribePost(new Request("https://prospector.test/api/unsubscribe", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: UNSUBSCRIBE_TOKEN }),
    }), { database: fixture.database, limiter, now: () => SYNC_NOW });
    assert.equal(unsubscribed.status, 200);
    assert.equal(await count(fixture, "outreach_suppression_tombstones", "reason='unsubscribe'"), 1);

    for (const result of results) assert.equal(result.body.command.providerCalls, 0, JSON.stringify(result.body.command));
    const projection = await modules.handler.readOutreachProjection(fixture.database, scope, services);
    assert.equal(projection.gates.approval.available, false);
    assert.equal(projection.gates.queue.available, false);
    assert.deepEqual(projection.gates.phone, { enabled: false, reason: "owner_uat_pending" });
    assert.deepEqual(projection.effects, { providerCalls: 0 });
    assert.deepEqual(projection.delivery, []);
    assertNoDialOrMail(projection, "the production projection");
    await assertNoForbiddenStates(fixture);
  } finally { await dispose(workspace); }
});

test("the blocked Phase 5 rechecks refuse every downstream boundary and the composed outreach sources reach no provider", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const eligibility = await vite.ssrLoadModule(MORE.eligibility);
    for (const name of ["recheckForPackageApproval", "recheckForCrmExport", "recheckForClickToCall", "recheckForFinalSend"]) {
      const result = eligibility[name]({ synthetic: true });
      assert.equal(result.blocked, true, `${name} refuses`);
      assert.equal(result.eligibility.eligible, false, `${name} is never eligible`);
    }
  } finally { await vite.close(); }
  const files = [
    "domain/outreach-handler.ts", "domain/unsubscribe-handler.ts", "domain/outreach-package.ts", "domain/message-version.ts",
    "domain/outbox.ts", "domain/originated-mail-sync.ts", "domain/outreach-stop-rules.ts", "domain/suppression.ts",
    "domain/manual-call.ts", "domain/crm-handoff.ts", "domain/outreach-repository.ts",
    "app/api/outreach/route.ts", "app/api/unsubscribe/route.ts",
  ];
  for (const file of files) {
    const text = await readFile(new URL(`../${file}`, import.meta.url), "utf8");
    assert.doesNotMatch(text, /\bfetch\s*\(/u, `${file} performs no network call`);
    assert.doesNotMatch(text, /tel:|mailto:/iu, `${file} has no dial or mail scheme`);
    assert.doesNotMatch(text, /gmail\.googleapis\.com|oauth2\.googleapis\.com|\bGMAIL_(?:CLIENT|SECRET|TOKEN|REFRESH|OAUTH)/u, `${file} has no Gmail endpoint or secret name`);
    assert.doesNotMatch(text, /from\s+["'][^"']*preparation\//u, `${file} imports no preparation-only code`);
    assert.doesNotMatch(text, /process\.env/u, `${file} reads no environment secret`);
  }
  const outbox = await readFile(new URL("../domain/outbox.ts", import.meta.url), "utf8");
  assert.doesNotMatch(outbox, /\.dispatch\s*\(/u, "the D1 outbox never invokes a MailPort dispatch");
});

// ---------------------------------------------------------------------------
// Later plans (hosted or live; not implemented locally)
// ---------------------------------------------------------------------------

test("D1 Dispatching, Sent and DeliveryUnknown states replay one delivery through a fake MailPort", { todo: "06-06 Task 2 not implemented" }, () => {});
test("owner Gmail authorization binds a real sender connection", { todo: "06-10 not implemented" }, () => {});
test("accepted Phase 4 Approved Prospect and Phase 5 fresh verified Contact input matrix", { todo: "06-11 not implemented" }, () => {});
test("the real Gmail MailPort and worker deliver one approved message exactly once", { todo: "06-12 not implemented" }, () => {});
test("composition review and live Gmail drill", { todo: "06-13 Tasks 1-2 not implemented" }, () => {});
