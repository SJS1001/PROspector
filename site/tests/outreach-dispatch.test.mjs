import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { countRows, createD1Fixture } from "./helpers/d1.mjs";
import { OUTREACH_NOW } from "./helpers/outreach-fixture.mjs";
import {
  MODULES,
  RECIPIENT,
  SENDER_CONNECTION_ID,
  SENDER_SUBJECT_DIGEST,
  assertNoForbiddenStates,
  claimLease,
  digestOf,
  enqueuePair,
  fakeMailPort,
  fakeOriginStore,
  insertSenderConnection,
  latestEvent,
  prepareApprovedPair,
  scope,
  syntheticFinalSendPort,
} from "./helpers/outreach-dispatch-lane.mjs";

// 06-06 Task 1 (governed enqueue) and Task 3 (originated mail sync), local
// and synthetic only. Task 2 (Dispatching/Sent/DeliveryUnknown in D1) is out
// of scope: every D1 path here reports providerCalls 0, the fake MailPort's
// dispatch and reconcile counters stay at zero, and the forbidden send states
// never appear in outreach_outbox_events.

const NO_SEND_ROWS = ["outreach_message_approval_consumptions", "outreach_outbox_items", "outreach_outbox_events"];
const SYNC_NOW = OUTREACH_NOW + 2_000;
const ORIGIN_MESSAGE_ID = "gmail-message-0001";
const ORIGIN_THREAD_ID = "gmail-thread-0001";

async function rowCounts(fixture, tables = NO_SEND_ROWS) {
  const counts = {};
  for (const table of tables) counts[table] = await countRows(fixture.database, table);
  return counts;
}

function originRecord(outboxItemId, overrides = {}) {
  return {
    connectionId: SENDER_CONNECTION_ID,
    outboxItemId,
    leaseGeneration: 1,
    originatedMessageId: ORIGIN_MESSAGE_ID,
    originatedThreadId: ORIGIN_THREAD_ID,
    connectionSubjectDigest: SENDER_SUBJECT_DIGEST,
    ...overrides,
  };
}

function reply(originated, overrides = {}) {
  return { kind: "reply", originated, sender: RECIPIENT, subject: "Re: Synthetic governed outreach", excerpt: "Thanks, happy to talk next week.", occurredAt: OUTREACH_NOW + 1_500, ...overrides };
}

function bounce(originated, bounceClass, overrides = {}) {
  return { kind: "bounce", originated, bounceClass, subject: "Undeliverable", excerpt: "Synthetic delivery status notification.", occurredAt: OUTREACH_NOW + 1_500, ...overrides };
}

async function originatedContext(fixture) {
  const context = await prepareApprovedPair(fixture);
  const queued = await enqueuePair(fixture, context);
  // The origin Message was leased once (generation 1). D1 cannot represent a
  // send, so the in-memory origin store stands in for the provider identifiers.
  assert.equal((await claimLease(fixture, context, queued.origin.outboxItemId, "synthetic-worker-origin")).kind, "claimed");
  return { ...context, queued };
}

async function loadSync(fixture, context, ports, now = SYNC_NOW) {
  const syncModule = await fixture.vite.ssrLoadModule(MODULES.sync);
  return syncModule.createOriginatedMailSync(fixture.database, scope(context.seeded, now), ports);
}

function syncInput(overrides = {}) {
  return { connectionId: SENDER_CONNECTION_ID, observedAfter: OUTREACH_NOW, observedThrough: SYNC_NOW, ...overrides };
}

test("governed enqueue requires a current ContactReady final-send recheck and the production port always refuses", async () => {
  const fixture = await createD1Fixture("dispatch-enqueue-eligibility");
  try {
    const context = await prepareApprovedPair(fixture);
    const outboxModule = await fixture.vite.ssrLoadModule(MODULES.outbox);
    const input = { messageApprovalId: context.approvals.origin.id, senderConnectionId: context.senderConnectionId };
    const governed = (port) => outboxModule.createGovernedOutboxEnqueue(fixture.database, scope(context.seeded), { eligibility: port });

    assert.throws(() => outboxModule.createGovernedOutboxEnqueue(fixture.database, scope(context.seeded), {}), /eligibility_port_required/);
    assert.throws(() => outboxModule.createGovernedOutboxEnqueue(fixture.database, scope(context.seeded), { eligibility: {} }), /eligibility_port_required/);

    const refusedBy = async (label, port) => {
      assert.deepEqual(await governed(port).enqueueApprovedMessage(input), { kind: "blocked", reason: "current_authority_unavailable", providerCalls: 0 }, label);
      assert.deepEqual(await rowCounts(fixture), { outreach_message_approval_consumptions: 0, outreach_outbox_items: 0, outreach_outbox_events: 0 }, label);
    };
    const eligibilityModule = await fixture.vite.ssrLoadModule(new URL("../domain/contact-eligibility.ts", import.meta.url).pathname);
    await refusedBy("production recheckForFinalSend always refuses", Object.freeze({ recheckForFinalSend: eligibilityModule.recheckForFinalSend }));
    for (const [label, overrides] of [
      ["blocked recheck", { blocked: true }],
      ["wrong boundary", { boundary: "package_approval" }],
      ["not ContactReady", { state: "NeedsReview", eligible: false }],
      ["eligible flag false", { eligible: false }],
      ["reason codes present", { reasonCodes: ["phase4_approval_missing"] }],
      ["bound point stale", { points: [{ observationId: context.seeded.observationId, state: "stale" }] }],
      ["bound point missing", { points: [] }],
      ["port throws", { throws: true }],
    ]) {
      await refusedBy(label, syntheticFinalSendPort(context.seeded, overrides).port);
    }
    await refusedBy("malformed recheck", Object.freeze({ recheckForFinalSend: () => null }));

    const ready = syntheticFinalSendPort(context.seeded);
    const queued = await governed(ready.port).enqueueApprovedMessage(input);
    assert.equal(queued.kind, "queued");
    assert.equal(queued.replayed, false);
    assert.equal(queued.providerCalls, 0);
    assert.equal((await latestEvent(fixture, queued.outboxItemId)).state, "pending");
    assert.deepEqual(await rowCounts(fixture), { outreach_message_approval_consumptions: 1, outreach_outbox_items: 1, outreach_outbox_events: 1 });

    // The port sees identifiers only, never Message content or recipients.
    assert.equal(ready.calls.length, 1);
    const seen = ready.calls[0];
    assert.deepEqual(seen.target, { workspaceId: context.seeded.workspaceId, prospectId: context.seeded.prospectId, contactId: context.seeded.contactId });
    assert.equal(seen.boundary, "final_send");
    assert.equal(seen.observationId, context.seeded.observationId);
    assert.ok(Object.isFrozen(seen));
    const serialized = JSON.stringify(seen);
    for (const leaked of [RECIPIENT, "Synthetic governed outreach message", "Hello from the offline fixture"]) {
      assert.equal(serialized.includes(leaked), false, `${leaked} must not reach the eligibility port`);
    }
    await assertNoForbiddenStates(fixture);
  } finally {
    await fixture.dispose();
  }
});

test("governed enqueue replays exactly, refuses mismatched reuse, and denied tuples create no item", async () => {
  const fixture = await createD1Fixture("dispatch-enqueue-tuples");
  try {
    const context = await prepareApprovedPair(fixture);
    const outboxModule = await fixture.vite.ssrLoadModule(MODULES.outbox);
    const ready = syntheticFinalSendPort(context.seeded);
    const governed = (now = OUTREACH_NOW) => outboxModule.createGovernedOutboxEnqueue(fixture.database, scope(context.seeded, now), { eligibility: ready.port });
    const blocked = { kind: "blocked", reason: "current_authority_unavailable", providerCalls: 0 };

    const first = await governed().enqueueApprovedMessage({ messageApprovalId: context.approvals.origin.id, senderConnectionId: context.senderConnectionId });
    assert.equal(first.kind, "queued");
    const replay = await governed().enqueueApprovedMessage({ messageApprovalId: context.approvals.origin.id, senderConnectionId: context.senderConnectionId });
    assert.deepEqual(replay, { ...first, replayed: true });

    const otherConnection = await insertSenderConnection(fixture, context.seeded, context.repository, { id: "dispatch-sender-connection-2", subjectDigest: "8".repeat(64), version: 1 });
    assert.deepEqual(
      await governed().enqueueApprovedMessage({ messageApprovalId: context.approvals.origin.id, senderConnectionId: otherConnection }),
      blocked,
      "reusing a consumed approval with a different sender conflicts",
    );
    const inactive = await insertSenderConnection(fixture, context.seeded, context.repository, { id: "dispatch-sender-inactive", subjectDigest: "9".repeat(64), version: 1, status: "revoked" });
    const followUp = context.approvals.followUp.id;
    for (const [label, input, now] of [
      ["hostile input", { messageApprovalId: followUp, senderConnectionId: context.senderConnectionId, extra: true }, OUTREACH_NOW],
      ["unknown sender connection", { messageApprovalId: followUp, senderConnectionId: "dispatch-sender-unknown" }, OUTREACH_NOW],
      ["inactive sender connection", { messageApprovalId: followUp, senderConnectionId: inactive }, OUTREACH_NOW],
      ["expired Message approval", { messageApprovalId: followUp, senderConnectionId: context.senderConnectionId }, OUTREACH_NOW + 60_000],
      ["unknown approval", { messageApprovalId: "dispatch-approval-unknown", senderConnectionId: context.senderConnectionId }, OUTREACH_NOW],
    ]) {
      const result = await governed(now).enqueueApprovedMessage(input);
      assert.equal(result.kind, "blocked", label);
      assert.equal(result.providerCalls, 0, label);
    }
    await context.repository.recordSuppression({
      subjectKind: "exact_email", subjectDigest: context.seeded.contactPointDigest, channel: "email", reason: "owner_request",
      sourceEventDigest: digestOf("dispatch-exact-suppression"), aliasDigests: [], effectiveAt: OUTREACH_NOW, idempotencyKey: "dispatch-exact-suppression",
    });
    assert.deepEqual(
      await governed().enqueueApprovedMessage({ messageApprovalId: followUp, senderConnectionId: context.senderConnectionId }),
      blocked,
      "a recipient suppressed after approval wins at enqueue",
    );
    assert.deepEqual(await rowCounts(fixture), { outreach_message_approval_consumptions: 1, outreach_outbox_items: 1, outreach_outbox_events: 1 });
    await assertNoForbiddenStates(fixture);
  } finally {
    await fixture.dispose();
  }
});

async function recordStop(fixture, context, subject, channel, reason, key, effectiveAt = OUTREACH_NOW + 1_100) {
  const stopRules = (await fixture.vite.ssrLoadModule(MODULES.stopRules)).createOutreachStopRules(fixture.database, scope(context.seeded, effectiveAt));
  return stopRules.recordSuppressionStop({
    subject, channel, reason, sourceEventDigest: digestOf(key), aliasDigests: [], effectiveAt, idempotencyKey: `dispatch-${key}`,
  });
}

async function domainDigestOf(fixture, domain) {
  const domainScope = await fixture.vite.ssrLoadModule(MODULES.domainScope);
  return domainScope.domainDigest(domainScope.normalizeConfirmedDomain(domain));
}

test("Company and Organization stops still cancel every queued item and block every later lease", async () => {
  // D-7 narrows only confirmed-domain and Contact tombstones. Company and
  // Organization tombstones stay workspace-wide in enqueue, lease, the 0010
  // approval triggers and the 0015-0017 pre-call/attempt triggers, so
  // cancellation must still reach every live item.
  const cases = [
    ["d7-organization", () => ({ kind: "organization", identityDigest: "4".repeat(64) }), "email", "owner_request"],
    ["d7-company", (context) => ({ kind: "company", workspaceId: context.seeded.workspaceId }), "all", "owner_request"],
  ];
  for (const [key, subjectOf, channel, reason] of cases) {
    const fixture = await createD1Fixture(`dispatch-${key}`);
    try {
      const context = await prepareApprovedPair(fixture);
      const queued = await enqueuePair(fixture, context);
      assert.equal((await claimLease(fixture, context, queued.origin.outboxItemId, "synthetic-worker-one")).kind, "claimed");
      const result = await recordStop(fixture, context, subjectOf(context), channel, reason, key);
      assert.equal(result.kind, "suppressed", key);
      assert.deepEqual(result.cancelledOutboxItemIds, [queued.origin.outboxItemId, queued.followUp.outboxItemId].sort(), key);
      assert.deepEqual(result.uncancelled, [], key);
      for (const item of [queued.origin, queued.followUp]) {
        assert.equal((await latestEvent(fixture, item.outboxItemId)).state, "cancelled", key);
        const lease = await claimLease(fixture, context, item.outboxItemId, "synthetic-worker-two", OUTREACH_NOW + 20_000);
        assert.equal(lease.kind, "blocked", key);
        assert.equal(lease.providerCalls, 0, key);
      }
      await assertNoForbiddenStates(fixture);
    } finally {
      await fixture.dispose();
    }
  }
});

test("D-7: a confirmed domain stop outside the recipient's domain or a phone-only Contact stop leaves email work queued, leasable and preparable", async () => {
  // Recipient: verified@example.invalid. other.invalid is unrelated,
  // ample.invalid is a string suffix but not a whole-label suffix, and
  // mail.example.invalid is a child, which never covers its parent. A
  // do_not_call Contact tombstone on the phone channel does not reach email.
  const cases = [
    ["d7-other-domain", { kind: "confirmed_email_domain", domain: "other.invalid", ownerConfirmed: true }, "email", "owner_request"],
    ["d7-string-suffix", { kind: "confirmed_email_domain", domain: "ample.invalid", ownerConfirmed: true }, "email", "owner_request"],
    ["d7-child-domain", { kind: "confirmed_email_domain", domain: "mail.example.invalid", ownerConfirmed: true }, "all", "owner_request"],
    ["d7-phone-contact", { kind: "contact", identityDigest: "6".repeat(64) }, "phone", "do_not_call"],
  ];
  for (const [key, subject, channel, reason] of cases) {
    const fixture = await createD1Fixture(`dispatch-${key}`);
    try {
      const context = await prepareApprovedPair(fixture);
      const queued = await enqueuePair(fixture, context);
      assert.equal((await claimLease(fixture, context, queued.origin.outboxItemId, "synthetic-worker-one")).kind, "claimed");
      const result = await recordStop(fixture, context, subject, channel, reason, key);
      assert.equal(result.kind, "suppressed", key);
      assert.deepEqual(result.cancelledOutboxItemIds, [], key);
      assert.deepEqual(result.uncancelled, [], key);
      assert.equal((await latestEvent(fixture, queued.origin.outboxItemId)).state, "leased", key);
      assert.equal((await latestEvent(fixture, queued.followUp.outboxItemId)).state, "pending", key);
      // Nothing is stranded: the lease, the 0015 pre-call receipt trigger and
      // the 0016 attempt-preparation trigger all admit the uncancelled item.
      const lease = await claimLease(fixture, context, queued.followUp.outboxItemId, "synthetic-worker-two", OUTREACH_NOW + 1_200);
      assert.equal(lease.kind, "claimed", key);
      const outbox = (await fixture.vite.ssrLoadModule(MODULES.outbox)).createD1OutboxRepository(fixture.database, scope(context.seeded, OUTREACH_NOW + 1_300));
      const receipt = await outbox.recordPreCallRecheckReceipt({ outboxItemId: queued.followUp.outboxItemId, holderId: "synthetic-worker-two", leaseGeneration: lease.leaseGeneration });
      assert.equal(receipt.kind, "recorded", key);
      const attempt = await outbox.prepareDispatchAttempt({ outboxItemId: queued.followUp.outboxItemId, preCallReceiptId: receipt.receiptId, holderId: "synthetic-worker-two", leaseGeneration: lease.leaseGeneration });
      assert.equal(attempt.kind, "prepared_no_invocation", key);
      assert.equal(attempt.providerCalls, 0, key);
      await assertNoForbiddenStates(fixture);
    } finally {
      await fixture.dispose();
    }
  }
});

test("D-7: a confirmed domain stop cancels that domain and its whole-label subdomains, and a Contact stop cancels its own channel", async () => {
  const cases = [
    ["d7-same-domain", "verified@example.invalid", { kind: "confirmed_email_domain", domain: "example.invalid", ownerConfirmed: true }, "email"],
    ["d7-root-dot-domain", "verified@example.invalid", { kind: "confirmed_email_domain", domain: "EXAMPLE.invalid.", ownerConfirmed: true }, "email"],
    ["d7-parent-domain", "verified@mail.example.invalid", { kind: "confirmed_email_domain", domain: "example.invalid", ownerConfirmed: true }, "all"],
    ["d7-exact-subdomain", "verified@mail.example.invalid", { kind: "confirmed_email_domain", domain: "mail.example.invalid", ownerConfirmed: true }, "email"],
    ["d7-email-contact", "verified@example.invalid", { kind: "contact", identityDigest: "6".repeat(64) }, "email"],
    ["d7-all-contact", "verified@example.invalid", { kind: "contact", identityDigest: "6".repeat(64) }, "all"],
  ];
  for (const [key, recipient, subject, channel] of cases) {
    const fixture = await createD1Fixture(`dispatch-${key}`);
    try {
      const context = await prepareApprovedPair(fixture, { recipient });
      const queued = await enqueuePair(fixture, context);
      assert.equal((await claimLease(fixture, context, queued.origin.outboxItemId, "synthetic-worker-one")).kind, "claimed");
      const result = await recordStop(fixture, context, subject, channel, "owner_request", key);
      assert.equal(result.kind, "suppressed", key);
      assert.deepEqual(result.cancelledOutboxItemIds, [queued.origin.outboxItemId, queued.followUp.outboxItemId].sort(), key);
      assert.deepEqual(result.uncancelled, [], key);
      for (const item of [queued.origin, queued.followUp]) {
        assert.equal((await latestEvent(fixture, item.outboxItemId)).state, "cancelled", key);
        const lease = await claimLease(fixture, context, item.outboxItemId, "synthetic-worker-two", OUTREACH_NOW + 20_000);
        assert.equal(lease.kind, "blocked", key);
        assert.equal(lease.providerCalls, 0, key);
      }
      await assertNoForbiddenStates(fixture);
    } finally {
      await fixture.dispose();
    }
  }
});

test("D-7: the recipient authority records the whole-label domain scope of its verified contact point", async () => {
  const fixture = await createD1Fixture("dispatch-d7-domain-scope-row");
  try {
    const context = await prepareApprovedPair(fixture, { recipient: "verified@mail.example.invalid" });
    const rows = (await fixture.database.prepare(
      "SELECT contact_point_digest,domain_digests_json FROM outreach_contact_point_domains WHERE workspace_id=?",
    ).bind(context.seeded.workspaceId).all()).results;
    assert.deepEqual(rows, [{
      contact_point_digest: context.seeded.contactPointDigest,
      domain_digests_json: JSON.stringify([await domainDigestOf(fixture, "mail.example.invalid"), await domainDigestOf(fixture, "example.invalid")]),
    }], "two Messages to one verified address share one immutable scope row");
    await assert.rejects(
      fixture.database.prepare("UPDATE outreach_contact_point_domains SET domain_digests_json='[]' WHERE workspace_id=?").bind(context.seeded.workspaceId).run(),
      /immutable outreach contact point domain/,
    );
    await assert.rejects(
      fixture.database.prepare("DELETE FROM outreach_contact_point_domains WHERE workspace_id=?").bind(context.seeded.workspaceId).run(),
      /immutable outreach contact point domain/,
    );
    for (const [label, digests] of [
      ["empty", "[]"],
      ["not hex", JSON.stringify(["x".repeat(64)])],
      ["duplicate", JSON.stringify(["a".repeat(64), "a".repeat(64)])],
      ["not an array", "{}"],
    ]) {
      await assert.rejects(
        fixture.database.prepare(
          "INSERT INTO outreach_contact_point_domains (id,workspace_id,contact_point_digest,domain_digests_json,created_at) VALUES (?,?,?,?,?)",
        ).bind(`ocpd_forged_${label.replace(/ /gu, "_")}`, context.seeded.workspaceId, "b".repeat(64), digests, OUTREACH_NOW).run(),
        /invalid outreach contact point domain/,
        label,
      );
    }
    await assert.rejects(
      fixture.database.prepare(
        "INSERT INTO outreach_contact_point_domains (id,workspace_id,contact_point_digest,domain_digests_json,created_at) VALUES (?,?,?,?,?)",
      ).bind("ocpd_forged_unknown_point", context.seeded.workspaceId, "b".repeat(64), JSON.stringify(["a".repeat(64)]), OUTREACH_NOW).run(),
      /invalid outreach contact point domain/,
      "a scope row needs a stored email contact point",
    );
  } finally {
    await fixture.dispose();
  }
});

test("D-7: enqueue rechecks a confirmed domain by whole labels and a Contact tombstone by its channel", async () => {
  const cases = [
    ["d7-enqueue-other-domain", { kind: "confirmed_email_domain", domain: "other.invalid", ownerConfirmed: true }, "email", "queued"],
    ["d7-enqueue-string-suffix", { kind: "confirmed_email_domain", domain: "ample.invalid", ownerConfirmed: true }, "email", "queued"],
    ["d7-enqueue-phone-contact", { kind: "contact", identityDigest: "6".repeat(64) }, "phone", "queued"],
    ["d7-enqueue-same-domain", { kind: "confirmed_email_domain", domain: "example.invalid", ownerConfirmed: true }, "email", "blocked"],
    ["d7-enqueue-email-contact", { kind: "contact", identityDigest: "6".repeat(64) }, "email", "blocked"],
  ];
  for (const [key, subject, channel, expected] of cases) {
    const fixture = await createD1Fixture(`dispatch-${key}`);
    try {
      const context = await prepareApprovedPair(fixture);
      const result = await recordStop(fixture, context, subject, channel, channel === "phone" ? "do_not_call" : "owner_request", key, OUTREACH_NOW);
      assert.equal(result.kind, "suppressed", key);
      const outbox = (await fixture.vite.ssrLoadModule(MODULES.outbox)).createD1OutboxRepository(fixture.database, scope(context.seeded));
      const enqueued = await outbox.enqueueApprovedMessage({ messageApprovalId: context.approvals.origin.id, senderConnectionId: context.senderConnectionId });
      assert.equal(enqueued.kind, expected, key);
      assert.equal(enqueued.providerCalls, 0, key);
      const items = expected === "queued" ? 1 : 0;
      assert.deepEqual(await rowCounts(fixture), { outreach_message_approval_consumptions: items, outreach_outbox_items: items, outreach_outbox_events: items }, key);
      await assertNoForbiddenStates(fixture);
    } finally {
      await fixture.dispose();
    }
  }
});

test("D-7: approvals resolve a confirmed domain through the recorded scope; Package approval defers an unscoped point to Message approval", async () => {
  const domain = (value) => ({ kind: "confirmed_email_domain", domain: value, ownerConfirmed: true });
  const record = (fixture, subject, channel, reason, key) => async ({ seeded }) => {
    const result = await recordStop(fixture, { seeded }, subject, channel, reason, key, OUTREACH_NOW);
    assert.equal(result.kind, "suppressed", key);
  };

  // PR 205 review: the scope is recorded beside the recipient authority,
  // which needs a Package approval first, so a first-time address never has
  // one at Package approval. Package approval grants no email authority and
  // defers an unscoped point; an unrelated domain no longer refuses it.
  let fixture = await createD1Fixture("dispatch-d7-approval-first-time-other-domain");
  try {
    const context = await prepareApprovedPair(fixture, {
      beforePackageApproval: async (seededContext) => {
        assert.equal(await countRows(fixture.database, "outreach_contact_point_domains"), 0, "a first-time address has no recorded scope");
        await record(fixture, domain("other.invalid"), "email", "owner_request", "d7-approval-first-time-other")(seededContext);
      },
    });
    assert.equal(await countRows(fixture.database, "outreach_package_approvals"), 1);
    assert.equal(await countRows(fixture.database, "outreach_message_approvals"), 2);
    assert.equal((await enqueuePair(fixture, context)).origin.kind, "queued");
  } finally {
    await fixture.dispose();
  }
  // The recipient's own domain is then refused at Message approval, once the
  // recipient authority has recorded the scope: email still cannot move.
  fixture = await createD1Fixture("dispatch-d7-approval-first-time-same-domain");
  try {
    await assert.rejects(
      prepareApprovedPair(fixture, { beforePackageApproval: record(fixture, domain("example.invalid"), "email", "owner_request", "d7-approval-first-time-same") }),
      /unresolved_suppression_scope/,
    );
    assert.equal(await countRows(fixture.database, "outreach_package_approvals"), 1, "Package approval deferred the unscoped point");
    assert.equal(await countRows(fixture.database, "outreach_contact_point_domains"), 1, "the recipient authority recorded the scope");
    assert.equal(await countRows(fixture.database, "outreach_message_approvals"), 0);
    assert.equal(await countRows(fixture.database, "outreach_outbox_items"), 0);
  } finally {
    await fixture.dispose();
  }

  // A phone-only Contact tombstone does not refuse an email-only Package.
  fixture = await createD1Fixture("dispatch-d7-approval-phone-contact");
  try {
    const context = await prepareApprovedPair(fixture, {
      beforePackageApproval: record(fixture, { kind: "contact", identityDigest: "6".repeat(64) }, "phone", "do_not_call", "d7-approval-phone"),
    });
    assert.equal((await enqueuePair(fixture, context)).origin.kind, "queued");
  } finally {
    await fixture.dispose();
  }

  // After the recipient authority records the scope, an unrelated domain no
  // longer refuses the Message approval, and the recipient's domain does.
  fixture = await createD1Fixture("dispatch-d7-approval-other-domain");
  try {
    const context = await prepareApprovedPair(fixture, { beforeMessageApproval: record(fixture, domain("other.invalid"), "email", "owner_request", "d7-approval-other") });
    assert.equal((await enqueuePair(fixture, context)).origin.kind, "queued");
  } finally {
    await fixture.dispose();
  }
  fixture = await createD1Fixture("dispatch-d7-approval-same-domain");
  try {
    await assert.rejects(
      prepareApprovedPair(fixture, { beforeMessageApproval: record(fixture, domain("example.invalid"), "email", "owner_request", "d7-approval-same") }),
      /unresolved_suppression_scope/,
    );
    assert.equal(await countRows(fixture.database, "outreach_message_approvals"), 0);
  } finally {
    await fixture.dispose();
  }
});
test("D-7: an eligibility snapshot taken after an unrelated-domain or phone-only tombstone keeps email work approvable, queued and leasable", async () => {
  // PR 205 review: the snapshot's preserved suppression refs gate enqueue,
  // lease and both approval triggers. They must not carry a confirmed-domain
  // tombstone on another domain or a phone-channel Contact/number tombstone.
  const cases = [
    ["d7-snapshot-other-domain", [[{ kind: "confirmed_email_domain", domain: "other.invalid", ownerConfirmed: true }, "email", "owner_request"]]],
    ["d7-snapshot-phone-dnc", [
      [{ kind: "contact", identityDigest: "6".repeat(64) }, "phone", "do_not_call"],
      [{ kind: "e164_phone", phone: "+14165550100" }, "phone", "do_not_call"],
    ]],
  ];
  for (const [key, stops] of cases) {
    const fixture = await createD1Fixture(`dispatch-${key}`);
    try {
      const context = await prepareApprovedPair(fixture, {
        seed: {
          beforeEligibilitySnapshot: async ({ seeded }) => {
            for (const [index, [subject, channel, reason]] of stops.entries()) {
              assert.equal((await recordStop(fixture, { seeded }, subject, channel, reason, `${key}-${index}`, OUTREACH_NOW)).kind, "suppressed", key);
            }
          },
        },
      });
      const snapshot = await fixture.database.prepare("SELECT preserved_suppression_refs_json FROM contact_eligibility_snapshots WHERE id='outreach-eligibility'").first();
      assert.equal(snapshot.preserved_suppression_refs_json, "[]", key);
      const queued = await enqueuePair(fixture, context);
      assert.equal(queued.origin.kind, "queued", key);
      assert.equal((await claimLease(fixture, context, queued.origin.outboxItemId, "synthetic-worker-one")).kind, "claimed", key);
      await assertNoForbiddenStates(fixture);
    } finally {
      await fixture.dispose();
    }
  }
});

test("D-7: an eligibility snapshot taken after an email-channel Contact tombstone still blocks the Package, and the recipient's domain is refused at Message approval", async () => {
  const cases = [
    ["d7-snapshot-email-contact", { kind: "contact", identityDigest: "6".repeat(64) }, "email"],
    ["d7-snapshot-all-contact", { kind: "contact", identityDigest: "6".repeat(64) }, "all"],
  ];
  const beforeSnapshot = (fixture, subject, channel, key) => ({
    beforeEligibilitySnapshot: async ({ seeded }) => {
      assert.equal((await recordStop(fixture, { seeded }, subject, channel, "owner_request", key, OUTREACH_NOW)).kind, "suppressed", key);
    },
  });
  for (const [key, subject, channel] of cases) {
    const fixture = await createD1Fixture(`dispatch-${key}`);
    try {
      await assert.rejects(prepareApprovedPair(fixture, { seed: beforeSnapshot(fixture, subject, channel, key) }), /outreach_repository_conflict:conflict$/u, key);
      const snapshot = await fixture.database.prepare("SELECT preserved_suppression_refs_json FROM contact_eligibility_snapshots WHERE id='outreach-eligibility'").first();
      assert.equal(JSON.parse(snapshot.preserved_suppression_refs_json).length, 1, key);
      assert.equal(await countRows(fixture.database, "outreach_package_approvals"), 0, key);
    } finally {
      await fixture.dispose();
    }
  }
  // A snapshot of a first-time address cannot resolve its domain (no scope is
  // recorded yet), so it defers like Package approval; the Message approval
  // recheck then refuses the recipient's domain with the recorded scope.
  const fixture = await createD1Fixture("dispatch-d7-snapshot-same-domain");
  try {
    const subject = { kind: "confirmed_email_domain", domain: "example.invalid", ownerConfirmed: true };
    await assert.rejects(prepareApprovedPair(fixture, { seed: beforeSnapshot(fixture, subject, "email", "d7-snapshot-same-domain") }), /unresolved_suppression_scope/u);
    const snapshot = await fixture.database.prepare("SELECT preserved_suppression_refs_json FROM contact_eligibility_snapshots WHERE id='outreach-eligibility'").first();
    assert.equal(snapshot.preserved_suppression_refs_json, "[]");
    assert.equal(await countRows(fixture.database, "outreach_message_approvals"), 0);
    assert.equal(await countRows(fixture.database, "outreach_outbox_items"), 0);
  } finally {
    await fixture.dispose();
  }
});

test("an exact-email stop spelled with a DNS root dot cancels queued items and blocks the enqueue SQL recheck for the plain contact point", async () => {
  // PR 199 review: the outbox enqueue/lease SQL, the 0010 and 0015-0017
  // triggers and the eligibility snapshot SQL match exact_email tombstones by
  // subject digest or alias snapshot only. The tombstone must carry every
  // mailbox spelling, or `x@example.com.` and `x@example.com` escape each other.
  const dotted = `${RECIPIENT.toUpperCase()}.`;

  const cancelFixture = await createD1Fixture("dispatch-root-dot-cancel");
  try {
    const context = await prepareApprovedPair(cancelFixture);
    const queued = await enqueuePair(cancelFixture, context);
    const stopRules = (await cancelFixture.vite.ssrLoadModule(MODULES.stopRules)).createOutreachStopRules(cancelFixture.database, scope(context.seeded, OUTREACH_NOW + 1_100));
    const result = await stopRules.recordSuppressionStop({
      subject: { kind: "exact_email", email: dotted }, channel: "email", reason: "owner_request", sourceEventDigest: digestOf("root-dot-cancel"),
      aliasDigests: [], effectiveAt: OUTREACH_NOW + 1_100, idempotencyKey: "dispatch-root-dot-cancel",
    });
    assert.equal(result.kind, "suppressed");
    assert.deepEqual(result.cancelledOutboxItemIds, [queued.origin.outboxItemId, queued.followUp.outboxItemId].sort());
    assert.deepEqual(result.uncancelled, []);
    await assertNoForbiddenStates(cancelFixture);
  } finally {
    await cancelFixture.dispose();
  }

  const enqueueFixture = await createD1Fixture("dispatch-root-dot-enqueue");
  try {
    const context = await prepareApprovedPair(enqueueFixture);
    const stopRules = (await enqueueFixture.vite.ssrLoadModule(MODULES.stopRules)).createOutreachStopRules(enqueueFixture.database, scope(context.seeded, OUTREACH_NOW));
    const result = await stopRules.recordSuppressionStop({
      subject: { kind: "exact_email", email: dotted }, channel: "email", reason: "owner_request", sourceEventDigest: digestOf("root-dot-enqueue"),
      aliasDigests: [], effectiveAt: OUTREACH_NOW, idempotencyKey: "dispatch-root-dot-enqueue",
    });
    assert.equal(result.kind, "suppressed");
    const outbox = (await enqueueFixture.vite.ssrLoadModule(MODULES.outbox)).createD1OutboxRepository(enqueueFixture.database, scope(context.seeded));
    const enqueued = await outbox.enqueueApprovedMessage({ messageApprovalId: context.approvals.origin.id, senderConnectionId: context.senderConnectionId });
    assert.equal(enqueued.kind, "blocked", "the enqueue SQL recheck sees the root-dot tombstone");
    assert.equal(enqueued.providerCalls, 0);
    assert.deepEqual(await rowCounts(enqueueFixture), { outreach_message_approval_consumptions: 0, outreach_outbox_items: 0, outreach_outbox_events: 0 });
    await assertNoForbiddenStates(enqueueFixture);
  } finally {
    await enqueueFixture.dispose();
  }
});

test("originated sync denies unauthenticated connections, origins and fields without persistence or stop action", async () => {
  const fixture = await createD1Fixture("dispatch-sync-denials");
  try {
    const context = await originatedContext(fixture);
    const syncModule = await fixture.vite.ssrLoadModule(MODULES.sync);
    const gmail = await fixture.vite.ssrLoadModule(MODULES.gmail);
    const origin = context.queued.origin.outboxItemId;
    const followUp = context.queued.followUp.outboxItemId;
    const watched = ["outreach_outbox_events", "outreach_stop_events", "outreach_suppression_tombstones"];
    // Sender connections added below write their own capability audit rows.
    const otherAudits = async () => Number((await fixture.database.prepare("SELECT count(*) count FROM outreach_audit_records WHERE action<>'sender_capability.recorded'").first()).count);
    const before = { ...await rowCounts(fixture, watched), audits: await otherAudits() };
    const unchanged = async (label) => {
      assert.deepEqual({ ...await rowCounts(fixture, watched), audits: await otherAudits() }, before, label);
      assert.equal((await latestEvent(fixture, origin)).state, "leased", label);
      assert.equal((await latestEvent(fixture, followUp)).state, "pending", label);
    };

    assert.throws(() => syncModule.createOriginatedMailSync(fixture.database, scope(context.seeded), {}), /mail_port_required/);
    assert.throws(() => syncModule.createOriginatedMailSync(fixture.database, scope(context.seeded), { mailPort: gmail.UNCONFIGURED_GMAIL_ADAPTER }), /origin_store_required/);

    // Production composition: the reject-only adapter and no stored origins.
    const production = await loadSync(fixture, context, { mailPort: gmail.UNCONFIGURED_GMAIL_ADAPTER, originStore: syncModule.NO_ORIGINATED_REFERENCES });
    assert.deepEqual(await production.syncConnection(syncInput()), { kind: "synced", observedThrough: SYNC_NOW, accepted: [], denied: [], deniedOrigins: 0, providerCalls: 0 });
    const unconfigured = await loadSync(fixture, context, { mailPort: gmail.UNCONFIGURED_GMAIL_ADAPTER, originStore: fakeOriginStore([originRecord(origin)]).store });
    assert.deepEqual(await unconfigured.syncConnection(syncInput()), { kind: "refused", reason: "sync_unavailable", providerCalls: 0 });
    await unchanged("reject-only adapter");

    const echo = fakeMailPort((request) => ({ events: [reply(request.originated[0])], observedThrough: request.observedThrough }));
    const store = fakeOriginStore([originRecord(origin)]);
    const sync = await loadSync(fixture, context, { mailPort: echo.port, originStore: store.store });
    for (const [label, input] of [
      ["extra field", { ...syncInput(), mailbox: "INBOX" }],
      ["bad connection id", syncInput({ connectionId: "" })],
      ["inverted window", syncInput({ observedAfter: SYNC_NOW, observedThrough: OUTREACH_NOW })],
      ["future window", syncInput({ observedThrough: SYNC_NOW + 1 })],
    ]) {
      assert.deepEqual(await sync.syncConnection(input), { kind: "refused", reason: "invalid_request", providerCalls: 0 }, label);
    }
    const inactive = await insertSenderConnection(fixture, context.seeded, context.repository, { id: "dispatch-sender-inactive", subjectDigest: "9".repeat(64), version: 1, status: "revoked" });
    for (const connectionId of ["dispatch-sender-unknown", inactive]) {
      assert.deepEqual(await sync.syncConnection(syncInput({ connectionId })), { kind: "refused", reason: "connection_unavailable", providerCalls: 0 }, connectionId);
    }
    assert.equal(echo.counts.sync, 0, "no sync read happens before the connection authenticates");

    // Origins the domain cannot bind to this connection are never offered to the port.
    const otherConnection = await insertSenderConnection(fixture, context.seeded, context.repository, { id: "dispatch-sender-connection-2", subjectDigest: "a".repeat(64), version: 1 });
    const badOrigins = fakeOriginStore([
      originRecord(origin, { connectionSubjectDigest: "b".repeat(64) }),
      originRecord(origin, { leaseGeneration: 2 }),
      originRecord("ooi-not-originated-here"),
      originRecord(followUp),
      originRecord(origin, { connectionId: otherConnection }),
      originRecord(origin, { originatedMessageId: "bad id with spaces" }),
      { ...originRecord(origin), raw: "From: someone" },
    ]);
    const unbound = await loadSync(fixture, context, { mailPort: echo.port, originStore: badOrigins.store });
    assert.deepEqual(await unbound.syncConnection(syncInput()), { kind: "synced", observedThrough: SYNC_NOW, accepted: [], denied: [], deniedOrigins: 6, providerCalls: 0 });
    assert.deepEqual(await unbound.syncConnection(syncInput({ connectionId: otherConnection })), { kind: "synced", observedThrough: SYNC_NOW, accepted: [], denied: [], deniedOrigins: 1, providerCalls: 0 }, "an origin of another connection is swapped, not trusted");
    assert.equal(echo.counts.sync, 0);
    await unchanged("unbound origins");

    // Events that do not exactly reference an authenticated origin, or that
    // carry raw or oversized content, are denied one by one.
    const hostile = fakeMailPort((request) => {
      const ref = request.originated[0];
      return {
        events: [
          reply({ ...ref, originatedMessageId: "gmail-message-9999" }),
          reply({ ...ref, marker: `${ref.marker.slice(0, -1)}${ref.marker.endsWith("0") ? "1" : "0"}` }),
          reply({ ...ref, extra: true }),
          { ...reply(ref), raw: "Received: from synthetic" },
          reply(ref, { excerpt: "x".repeat(501) }),
          reply(ref, { subject: "s".repeat(257) }),
          reply(ref, { occurredAt: SYNC_NOW + 1 }),
          reply(ref, { occurredAt: OUTREACH_NOW }),
          reply(ref, { sender: "not an address" }),
          bounce(ref, "permanent"),
          { kind: "read_receipt", originated: ref, occurredAt: OUTREACH_NOW + 1_500 },
          null,
        ],
        observedThrough: request.observedThrough,
      };
    });
    const denied = await (await loadSync(fixture, context, { mailPort: hostile.port, originStore: store.store })).syncConnection(syncInput());
    assert.equal(denied.kind, "synced");
    assert.deepEqual(denied.accepted, []);
    assert.deepEqual(denied.denied.map((entry) => entry.reason), [
      "unrecognized_origin", "unrecognized_origin", "unrecognized_origin", "unexpected_fields", "oversized_field", "oversized_field",
      "invalid_time", "invalid_time", "invalid_sender", "unexpected_fields", "unexpected_fields", "unexpected_fields",
    ]);
    assert.deepEqual(denied.denied.map((entry) => entry.index), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    assert.equal(hostile.requests.length, 1);
    assert.deepEqual(Object.keys(hostile.requests[0]).sort(), ["connectionId", "observedAfter", "observedThrough", "originated", "workspaceId"]);
    assert.equal(hostile.requests[0].originated.length, 1);
    assert.ok(Object.isFrozen(hostile.requests[0]) && Object.isFrozen(hostile.requests[0].originated));
    await unchanged("hostile events");

    for (const [label, respond, reason] of [
      ["port throws", () => { throw new Error("synthetic port failure"); }, "sync_unavailable"],
      ["events not an array", (request) => ({ events: "none", observedThrough: request.observedThrough }), "sync_result_invalid"],
      ["extra result field", (request) => ({ events: [], observedThrough: request.observedThrough, cursor: "x" }), "sync_result_invalid"],
      ["observedThrough beyond the request", (request) => ({ events: [], observedThrough: request.observedThrough + 1 }), "sync_result_invalid"],
      ["too many events", (request) => ({ events: Array.from({ length: 101 }, () => reply(request.originated[0])), observedThrough: request.observedThrough }), "sync_result_invalid"],
    ]) {
      const port = fakeMailPort(respond);
      assert.deepEqual(await (await loadSync(fixture, context, { mailPort: port.port, originStore: store.store })).syncConnection(syncInput()), { kind: "refused", reason, providerCalls: 0 }, label);
    }
    await unchanged("malformed results");

    // A rotated (re-authorized) connection is no longer the pinned connection.
    await fixture.database.prepare(
      "INSERT INTO outreach_sender_connections (id,workspace_id,provider,connection_subject_digest,sender_address_digest,protected_reference,protected_reference_version,status,verified_at,created_at) SELECT 'dispatch-sender-rotated',workspace_id,provider,connection_subject_digest,sender_address_digest,'vault-ref:synthetic-rotated',2,'active',verified_at,created_at FROM outreach_sender_connections WHERE id=?",
    ).bind(SENDER_CONNECTION_ID).run();
    assert.deepEqual(await sync.syncConnection(syncInput()), { kind: "refused", reason: "connection_unavailable", providerCalls: 0 });
    assert.equal(echo.counts.sync, 0);
    for (const port of [echo, hostile]) {
      assert.equal(port.counts.dispatch, 0);
      assert.equal(port.counts.reconcile, 0);
    }
    await unchanged("rotation");
    await assertNoForbiddenStates(fixture);
  } finally {
    await fixture.dispose();
  }
});

test("an authenticated reply is minimized, persisted once, and cancels matching follow-ups; duplicate sync has no new effect", async () => {
  const fixture = await createD1Fixture("dispatch-sync-reply");
  try {
    const context = await originatedContext(fixture);
    const origin = context.queued.origin.outboxItemId;
    const followUp = context.queued.followUp.outboxItemId;
    const port = fakeMailPort((request) => ({ events: [reply(request.originated[0])], observedThrough: request.observedThrough }));
    const sync = await loadSync(fixture, context, { mailPort: port.port, originStore: fakeOriginStore([originRecord(origin)]).store });

    const first = await sync.syncConnection(syncInput());
    assert.equal(first.kind, "synced");
    assert.deepEqual(first.denied, []);
    assert.equal(first.accepted.length, 1);
    const [accepted] = first.accepted;
    assert.equal(accepted.outboxItemId, origin);
    assert.equal(accepted.classification, "reply");
    assert.equal(accepted.outcome, "stopped");
    assert.equal(accepted.replayed, false);
    assert.match(accepted.stopEventId, /^ose_/u);
    assert.deepEqual(accepted.cancelledOutboxItemIds, [origin, followUp].sort());
    assert.equal(first.providerCalls, 0);
    const serialized = JSON.stringify(first);
    for (const leaked of [RECIPIENT, "Thanks, happy to talk", "Re: Synthetic", ORIGIN_MESSAGE_ID, ORIGIN_THREAD_ID]) {
      assert.equal(serialized.includes(leaked), false, `${leaked} must not be exposed`);
    }

    const stop = await fixture.database.prepare("SELECT stop_kind,subject_kind,subject_digest,source_event_digest,reason_code FROM outreach_stop_events").all();
    assert.equal(stop.results.length, 1);
    assert.equal(stop.results[0].stop_kind, "reply");
    assert.equal(stop.results[0].subject_kind, "exact_email");
    assert.equal(stop.results[0].subject_digest, context.seeded.contactPointDigest);
    assert.match(stop.results[0].source_event_digest, /^[a-f0-9]{64}$/u);
    assert.equal((await latestEvent(fixture, followUp)).reason_code, "reply_received");
    assert.equal(await countRows(fixture.database, "outreach_suppression_tombstones"), 0);

    const events = await countRows(fixture.database, "outreach_outbox_events");
    const second = await sync.syncConnection(syncInput());
    assert.equal(second.accepted.length, 1);
    assert.equal(second.accepted[0].replayed, true);
    assert.equal(second.accepted[0].stopEventId, accepted.stopEventId);
    assert.deepEqual(second.accepted[0].cancelledOutboxItemIds, []);
    assert.equal(await countRows(fixture.database, "outreach_stop_events"), 1);
    assert.equal(await countRows(fixture.database, "outreach_outbox_events"), events, "duplicate sync appends no cancellation");
    assert.equal(port.counts.dispatch, 0);
    assert.equal(port.counts.reconcile, 0);
    await assertNoForbiddenStates(fixture);
  } finally {
    await fixture.dispose();
  }
});

test("hard bounces stop, soft bounces and third-party replies pause for review, and an opt-out reply suppresses", async () => {
  const fixture = await createD1Fixture("dispatch-sync-classification");
  try {
    const context = await originatedContext(fixture);
    const origin = context.queued.origin.outboxItemId;
    const followUp = context.queued.followUp.outboxItemId;
    const port = fakeMailPort((request) => {
      const ref = request.originated[0];
      return {
        events: [
          bounce(ref, "soft"),
          bounce(ref, "hard", { occurredAt: OUTREACH_NOW + 1_600 }),
          reply(ref, { sender: "colleague@example.invalid", excerpt: "Forwarding to the right person.", occurredAt: OUTREACH_NOW + 1_700 }),
          reply(ref, { subject: "Please unsubscribe me", excerpt: "Remove me from this list.", occurredAt: OUTREACH_NOW + 1_800 }),
        ],
        observedThrough: request.observedThrough,
      };
    });
    const sync = await loadSync(fixture, context, { mailPort: port.port, originStore: fakeOriginStore([originRecord(origin)]).store });
    const result = await sync.syncConnection(syncInput());
    assert.equal(result.kind, "synced");
    assert.deepEqual(result.denied, []);
    assert.deepEqual(result.accepted.map((entry) => [entry.classification, entry.outcome]), [
      ["ambiguous", "paused_for_review"],
      ["bounce", "stopped"],
      ["ambiguous", "paused_for_review"],
      ["opt_out", "stopped"],
    ]);
    assert.deepEqual(result.accepted[0].cancelledOutboxItemIds, [origin, followUp].sort(), "a soft bounce pauses matching work");
    assert.equal((await latestEvent(fixture, followUp)).reason_code, "ambiguous_reply_paused");
    assert.match(result.accepted[3].tombstoneId, /^ost_/u);
    const stops = await fixture.database.prepare("SELECT stop_kind,count(*) count FROM outreach_stop_events GROUP BY stop_kind ORDER BY stop_kind").all();
    assert.equal(stops.results.find((row) => row.stop_kind === "bounce")?.count, 1);
    assert.equal(stops.results.find((row) => row.stop_kind === "reply"), undefined, "ambiguous replies write no permanent reply stop");
    const tombstones = await fixture.database.prepare("SELECT subject_kind,subject_digest,reason FROM outreach_suppression_tombstones").all();
    assert.deepEqual(tombstones.results, [{ subject_kind: "exact_email", subject_digest: context.seeded.contactPointDigest, reason: "explicit_opt_out" }]);
    assert.equal(port.counts.dispatch, 0);
    await assertNoForbiddenStates(fixture);
  } finally {
    await fixture.dispose();
  }
});

test("a reply that reaches the pre-call decision point first leaves the leased follow-up with zero MailPort calls", async () => {
  for (const order of ["before_receipt", "after_preparation"]) {
    const fixture = await createD1Fixture(`dispatch-sync-race-${order}`);
    try {
      const context = await originatedContext(fixture);
      const origin = context.queued.origin.outboxItemId;
      const followUp = context.queued.followUp.outboxItemId;
      const lease = await claimLease(fixture, context, followUp, "synthetic-worker-two");
      assert.equal(lease.kind, "claimed");
      const port = fakeMailPort((request) => ({ events: [reply(request.originated[0])], observedThrough: request.observedThrough }));
      const outbox = (await fixture.vite.ssrLoadModule(MODULES.outbox)).createD1OutboxRepository(fixture.database, scope(context.seeded, SYNC_NOW + 10));
      // A deterministic synthetic worker: it may only reach the MailPort after a
      // current receipt and a prepared attempt, both re-read at the decision point.
      const worker = async () => {
        const receipt = await outbox.recordPreCallRecheckReceipt({ outboxItemId: followUp, holderId: "synthetic-worker-two", leaseGeneration: lease.leaseGeneration });
        if (receipt.kind !== "recorded") return { receipt };
        const attempt = await outbox.prepareDispatchAttempt({ outboxItemId: followUp, preCallReceiptId: receipt.receiptId, holderId: "synthetic-worker-two", leaseGeneration: lease.leaseGeneration });
        return { receipt, attempt };
      };
      if (order === "after_preparation") {
        const early = await worker();
        assert.equal(early.receipt.kind, "recorded");
        assert.equal(early.attempt.kind, "prepared_no_invocation");
        assert.equal(early.attempt.providerCalls, 0);
      }
      const sync = await loadSync(fixture, context, { mailPort: port.port, originStore: fakeOriginStore([originRecord(origin)]).store });
      const result = await sync.syncConnection(syncInput());
      assert.deepEqual(result.accepted[0].cancelledOutboxItemIds, [origin, followUp].sort(), order);
      assert.equal((await latestEvent(fixture, followUp)).state, "cancelled", order);
      const late = await worker();
      assert.equal(late.receipt.kind, "blocked", order);
      assert.equal(late.receipt.providerCalls, 0, order);
      assert.equal(late.attempt, undefined, order);
      assert.equal(port.counts.dispatch, 0, order);
      assert.equal(port.counts.reconcile, 0, order);
      await assertNoForbiddenStates(fixture);
    } finally {
      await fixture.dispose();
    }
  }
});

test("originated sync source never fetches a mailbox, dispatches, reconciles, or persists content", async () => {
  const source = await readFile(new URL("../domain/originated-mail-sync.ts", import.meta.url), "utf8");
  assert.match(source, /applyInboundStop/u, "sync feeds the existing stop rules");
  assert.doesNotMatch(source, /\.dispatch\(|\.reconcile\(/u);
  assert.doesNotMatch(source, /\bfetch\(/u);
  assert.doesNotMatch(source, /INSERT\s+INTO/iu, "sync persists only through the stop-rule service");
  assert.doesNotMatch(source, /from\s+["'][^"']*preparation\//u);
});
