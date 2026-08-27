import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";

const NOW = 1_900_000_300_000;
const A = "a".repeat(64);
const B = "b".repeat(64);
const ZERO_EFFECTS = Object.freeze({
  providerCalls: 0,
  outboxMutations: 0,
  sendInvocations: 0,
  callInvocations: 0,
  exportMutations: 0,
  durableMutations: 0,
});

async function load() {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  return {
    vite,
    stops: await vite.ssrLoadModule(new URL("../preparation/originated-stop-decision.ts", import.meta.url).pathname),
    dispatch: await vite.ssrLoadModule(new URL("../preparation/outreach-dispatch-decision.ts", import.meta.url).pathname),
  };
}

function eventInput(patch = {}) {
  return {
    id: "synthetic-originated-event",
    workspaceId: "synthetic-workspace",
    companyId: "synthetic-company",
    contactId: "synthetic-contact",
    connectionId: "synthetic-connection",
    connectionSubjectId: "synthetic-connection-subject",
    originatedMessageId: "synthetic-originated-message",
    originatedThreadId: "synthetic-originated-thread",
    kind: "confirmed_reply",
    senderAddress: "responder@example.invalid",
    bounceClass: null,
    subjectDigest: A,
    excerptDigest: B,
    suppressionSubjectIds: ["synthetic-subject-email", "synthetic-subject-company"],
    stopDependencyIds: ["synthetic-dependency-profile", "synthetic-dependency-thread"],
    occurredAt: NOW,
    ...patch,
  };
}

function authority(patch = {}) {
  return {
    evaluatedAt: NOW + 100,
    workspaceId: "synthetic-workspace",
    companyId: "synthetic-company",
    contactId: "synthetic-contact",
    connectionId: "synthetic-connection",
    connectionSubjectId: "synthetic-connection-subject",
    connectionActive: true,
    connectionSubjectPinned: true,
    eventAuthenticationValid: true,
    knownOriginatedPairs: [{
      messageId: "synthetic-originated-message",
      threadId: "synthetic-originated-thread",
    }],
    suppressionSubjectIds: ["synthetic-subject-company", "synthetic-subject-email"],
    stopDependencyIds: ["synthetic-dependency-thread", "synthetic-dependency-profile"],
    eventAlreadyRecorded: false,
    ...patch,
  };
}

function workItem(id, patch = {}) {
  return {
    id,
    workspaceId: "synthetic-workspace",
    companyId: "synthetic-company",
    contactId: "synthetic-contact",
    originatedMessageId: "synthetic-originated-message",
    originatedThreadId: "synthetic-originated-thread",
    channel: "email",
    isFollowUp: true,
    state: "pending",
    leaseGeneration: null,
    preCallDecisionRecorded: false,
    providerAttemptCount: 0,
    ...patch,
  };
}

function workItems() {
  return [
    workItem("synthetic-work-pending"),
    workItem("synthetic-work-leased", { state: "leased", leaseGeneration: 3 }),
    workItem("synthetic-work-fenced", { state: "leased", leaseGeneration: 4, preCallDecisionRecorded: true }),
    workItem("synthetic-work-attempted", { state: "leased", leaseGeneration: 5, providerAttemptCount: 1 }),
    workItem("synthetic-work-sent", { state: "sent" }),
    workItem("synthetic-work-unrelated", { originatedThreadId: "synthetic-other-thread" }),
    workItem("synthetic-work-not-followup", { isFollowUp: false }),
  ];
}

test("originated event artifacts are canonical, minimized, immutable, and zero-effect", async () => {
  const { vite, stops } = await load();
  try {
    const first = await stops.buildSyntheticOriginatedEvent(eventInput());
    const permuted = await stops.buildSyntheticOriginatedEvent(eventInput({
      suppressionSubjectIds: [...eventInput().suppressionSubjectIds].reverse(),
      stopDependencyIds: [...eventInput().stopDependencyIds].reverse(),
    }));
    assert.equal(first.digest, permuted.digest);
    assert.equal(first.classification, "cancel_matching_email_followups");
    assert.equal(first.persistenceAuthorized, false);
    assert.equal(first.cancellationAuthorized, false);
    assert.deepEqual(first.effects, ZERO_EFFECTS);
    assert.equal(Object.isFrozen(first), true);
    assert.equal("subject" in first.snapshot, false);
    assert.equal("excerpt" in first.snapshot, false);
    assert.equal("providerPayload" in first.snapshot, false);
  } finally {
    await vite.close();
  }
});

test("confirmed reply and bounce cancel while ambiguous reply pauses, without authority", async () => {
  const { vite, stops } = await load();
  try {
    const cases = [
      [eventInput(), "cancel_matching_email_followups"],
      [eventInput({ kind: "bounce", senderAddress: null, bounceClass: "hard" }), "cancel_matching_email_followups"],
      [eventInput({ kind: "bounce", senderAddress: null, bounceClass: "soft" }), "cancel_matching_email_followups"],
      [eventInput({ kind: "ambiguous_reply" }), "pause_matching_email_followups"],
    ];
    for (const [input, classification] of cases) {
      const artifact = await stops.buildSyntheticOriginatedEvent(input);
      assert.equal(artifact.classification, classification);
      assert.equal(artifact.persistenceAuthorized, false);
      assert.equal(artifact.cancellationAuthorized, false);
      assert.deepEqual(artifact.effects, ZERO_EFFECTS);
    }
  } finally {
    await vite.close();
  }
});

test("valid originated authority selects only matching pending and pre-call leased follow-ups", async () => {
  const { vite, stops } = await load();
  try {
    const eventArtifact = await stops.buildSyntheticOriginatedEvent(eventInput());
    const decision = await stops.evaluateSyntheticOriginatedStopDecision({
      eventArtifact,
      currentEvent: eventInput(),
      currentAuthority: authority(),
      workItems: [...workItems()].reverse(),
    });
    assert.equal(decision.status, "synthetic_stop_classified_no_authority");
    assert.equal(decision.stopRuleWouldActivate, true);
    assert.deepEqual(decision.wouldCancelWorkItemIds, ["synthetic-work-leased", "synthetic-work-pending"]);
    assert.deepEqual(decision.wouldPauseWorkItemIds, []);
    assert.deepEqual(decision.fencePassedWorkItemIds, ["synthetic-work-attempted", "synthetic-work-fenced"]);
    assert.deepEqual(decision.terminalWorkItemIds, ["synthetic-work-sent"]);
    assert.equal(decision.cancellationAuthorized, false);
    assert.equal(decision.persistenceAuthorized, false);
    assert.deepEqual(decision.reasonCodes, []);
    assert.deepEqual(decision.effects, ZERO_EFFECTS);
    assert.equal(Object.isFrozen(decision.wouldCancelWorkItemIds), true);
  } finally {
    await vite.close();
  }
});

test("ambiguous reply projects pause rather than cancellation", async () => {
  const { vite, stops } = await load();
  try {
    const input = eventInput({ kind: "ambiguous_reply" });
    const eventArtifact = await stops.buildSyntheticOriginatedEvent(input);
    const decision = await stops.evaluateSyntheticOriginatedStopDecision({
      eventArtifact,
      currentEvent: input,
      currentAuthority: authority(),
      workItems: workItems(),
    });
    assert.deepEqual(decision.wouldCancelWorkItemIds, []);
    assert.deepEqual(decision.wouldPauseWorkItemIds, ["synthetic-work-leased", "synthetic-work-pending"]);
    assert.equal(decision.cancellationAuthorized, false);
    assert.equal(decision.persistenceAuthorized, false);
  } finally {
    await vite.close();
  }
});

test("every originated-event authority failure rejects all cancellation and persistence", async () => {
  const { vite, stops } = await load();
  try {
    const eventArtifact = await stops.buildSyntheticOriginatedEvent(eventInput());
    const cases = [
      ["originated_event_changed", {}, eventInput({ occurredAt: NOW + 1 })],
      ["workspace_scope_mismatch", { workspaceId: "synthetic-other-workspace" }],
      ["company_scope_mismatch", { companyId: "synthetic-other-company" }],
      ["contact_scope_mismatch", { contactId: "synthetic-other-contact" }],
      ["connection_mismatch", { connectionId: "synthetic-other-connection" }],
      ["connection_subject_mismatch", { connectionSubjectId: "synthetic-other-subject" }],
      ["connection_inactive", { connectionActive: false }],
      ["connection_subject_unpinned", { connectionSubjectPinned: false }],
      ["event_authentication_invalid", { eventAuthenticationValid: false }],
      ["originated_message_thread_unknown", { knownOriginatedPairs: [{ messageId: "synthetic-other-message", threadId: "synthetic-originated-thread" }] }],
      ["originated_message_thread_unknown", { knownOriginatedPairs: [{ messageId: "synthetic-originated-message", threadId: "synthetic-other-thread" }] }],
      ["originated_message_thread_unknown", { knownOriginatedPairs: [
        { messageId: "synthetic-originated-message", threadId: "synthetic-other-thread" },
        { messageId: "synthetic-other-message", threadId: "synthetic-originated-thread" },
      ] }],
      ["suppression_subject_set_changed", { suppressionSubjectIds: ["synthetic-subject-company"] }],
      ["stop_dependency_set_changed", { stopDependencyIds: ["synthetic-dependency-thread"] }],
      ["event_already_recorded", { eventAlreadyRecorded: true }],
    ];
    for (const [reason, authorityPatch, currentEvent = eventInput()] of cases) {
      const decision = await stops.evaluateSyntheticOriginatedStopDecision({
        eventArtifact,
        currentEvent,
        currentAuthority: authority(authorityPatch),
        workItems: workItems(),
      });
      assert.equal(decision.reasonCodes.includes(reason), true, reason);
      assert.equal(decision.stopRuleWouldActivate, false, reason);
      assert.deepEqual(decision.wouldCancelWorkItemIds, [], reason);
      assert.deepEqual(decision.wouldPauseWorkItemIds, [], reason);
      assert.equal(decision.cancellationAuthorized, false, reason);
      assert.equal(decision.persistenceAuthorized, false, reason);
      assert.deepEqual(decision.effects, ZERO_EFFECTS, reason);
    }
    const futureInput = eventInput({ occurredAt: NOW + 200 });
    const futureArtifact = await stops.buildSyntheticOriginatedEvent(futureInput);
    const futureDecision = await stops.evaluateSyntheticOriginatedStopDecision({
      eventArtifact: futureArtifact,
      currentEvent: futureInput,
      currentAuthority: authority(),
      workItems: workItems(),
    });
    assert.deepEqual(futureDecision.reasonCodes, ["event_from_future"]);
    assert.deepEqual(futureDecision.wouldCancelWorkItemIds, []);
    assert.equal(futureDecision.cancellationAuthorized, false);
    assert.equal(futureDecision.persistenceAuthorized, false);
  } finally {
    await vite.close();
  }
});

test("a classified stop can feed only the prior synthetic dispatch rejection flag", async () => {
  const { vite, stops, dispatch } = await load();
  try {
    const input = eventInput();
    const eventArtifact = await stops.buildSyntheticOriginatedEvent(input);
    const stopDecision = await stops.evaluateSyntheticOriginatedStopDecision({
      eventArtifact,
      currentEvent: input,
      currentAuthority: authority(),
      workItems: [workItem("synthetic-work-pending")],
    });
    assert.equal(stopDecision.stopRuleWouldActivate, true);
    const source = await import("node:fs/promises").then(({ readFile }) => readFile(new URL("../preparation/outreach-dispatch-decision.ts", import.meta.url), "utf8"));
    assert.match(source, /if \(current\.stopRuleActive\) reasons\.push\("stop_rule_active"\)/u);
    assert.equal(stopDecision.cancellationAuthorized, false);
    assert.equal(stopDecision.persistenceAuthorized, false);
    assert.equal(typeof dispatch.evaluateSyntheticFinalDispatch, "function");
  } finally {
    await vite.close();
  }
});

test("real-looking, inconsistent, accessor, sparse, duplicate, extra, and forged inputs fail closed", async () => {
  const { vite, stops } = await load();
  try {
    await assert.rejects(
      stops.buildSyntheticOriginatedEvent(eventInput({ senderAddress: "person@example.com" })),
      /synthetic_originated_event_invalid/,
    );
    await assert.rejects(
      stops.buildSyntheticOriginatedEvent(eventInput({ kind: "bounce", bounceClass: null })),
      /synthetic_originated_event_invalid/,
    );
    await assert.rejects(
      stops.buildSyntheticOriginatedEvent(eventInput({ kind: "confirmed_reply", bounceClass: "hard" })),
      /synthetic_originated_event_invalid/,
    );
    await assert.rejects(
      stops.buildSyntheticOriginatedEvent(eventInput({ suppressionSubjectIds: ["synthetic-subject-email", "synthetic-subject-email"] })),
      /synthetic_originated_event_invalid/,
    );
    await assert.rejects(
      stops.buildSyntheticOriginatedEvent({ ...eventInput(), extra: "synthetic-extra" }),
      /synthetic_originated_event_invalid/,
    );
    const accessor = eventInput();
    Object.defineProperty(accessor, "kind", { enumerable: true, get() { throw new Error("must-not-run"); } });
    await assert.rejects(stops.buildSyntheticOriginatedEvent(accessor), /synthetic_originated_event_invalid/);
    const artifact = await stops.buildSyntheticOriginatedEvent(eventInput());
    await assert.rejects(
      stops.evaluateSyntheticOriginatedStopDecision({
        eventArtifact: { ...artifact }, currentEvent: eventInput(), currentAuthority: authority(), workItems: workItems(),
      }),
      /synthetic_originated_stop_decision_invalid/,
    );
    await assert.rejects(
      stops.evaluateSyntheticOriginatedStopDecision({
        eventArtifact: artifact, currentEvent: eventInput(), currentAuthority: authority(), workItems: new Array(1),
      }),
      /synthetic_originated_stop_decision_invalid/,
    );
    await assert.rejects(
      stops.evaluateSyntheticOriginatedStopDecision({
        eventArtifact: artifact,
        currentEvent: eventInput(),
        currentAuthority: authority({ knownOriginatedPairs: [
          { messageId: "synthetic-originated-message", threadId: "synthetic-originated-thread" },
          { messageId: "synthetic-originated-message", threadId: "synthetic-originated-thread" },
        ] }),
        workItems: workItems(),
      }),
      /synthetic_originated_stop_decision_invalid/,
    );
    await assert.rejects(
      stops.evaluateSyntheticOriginatedStopDecision({
        eventArtifact: artifact,
        currentEvent: eventInput(),
        currentAuthority: authority(),
        workItems: [workItem("synthetic-work-duplicate"), workItem("synthetic-work-duplicate")],
      }),
      /synthetic_originated_stop_decision_invalid/,
    );
  } finally {
    await vite.close();
  }
});
