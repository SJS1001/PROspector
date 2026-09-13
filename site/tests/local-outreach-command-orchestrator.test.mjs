import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import { createServer } from "vite";

const NOW = 1_900_000_000_000;
const WORKSPACE = "synthetic-workspace-alpha";
const OWNER = "synthetic-owner-alpha";

async function load() {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  return {
    vite,
    orchestration: await vite.ssrLoadModule(new URL("../domain/local-outreach-command-orchestrator.ts", import.meta.url).pathname),
    gmail: await vite.ssrLoadModule(new URL("../adapters/gmail.ts", import.meta.url).pathname),
  };
}

function approval(id, artifactId, approvalDigest, artifactDigest) {
  return {
    id,
    approvalDigest,
    artifactId,
    artifactDigest,
    expiresAt: NOW + 60_000,
    currentId: id,
    currentApprovalDigest: approvalDigest,
    currentArtifactId: artifactId,
    currentArtifactDigest: artifactDigest,
    revoked: false,
  };
}

function record(overrides = {}) {
  const packageVersionId = "synthetic-package-version";
  const packageDigest = "a".repeat(64);
  const messageVersionId = "synthetic-message-version";
  const messageDigest = "b".repeat(64);
  const messageApprovalId = "synthetic-message-approval";
  const messageApprovalDigest = "c".repeat(64);
  const base = {
    workspaceId: WORKSPACE,
    ownerSubject: OWNER,
    companyId: "synthetic-company",
    outboxItemId: "synthetic-outbox-item",
    sendKey: "synthetic-send-key",
    state: "leased",
    revision: 4,
    leaseGeneration: 2,
    leaseHolderId: "synthetic-lease-holder",
    leaseExpiresAt: NOW + 30_000,
    providerAttemptCount: 0,
    approvedMessage: {
      workspaceId: WORKSPACE,
      companyId: "synthetic-company",
      messageVersionId,
      messageDigest,
      messageApprovalId,
      messageApprovalDigest,
      packageVersionId,
      packageDigest,
      profileConfigurationId: "synthetic-profile-configuration",
      profileConfigurationDigest: "d".repeat(64),
    },
    authority: {
      packageApproval: approval("synthetic-package-approval", packageVersionId, "e".repeat(64), packageDigest),
      messageApproval: approval(messageApprovalId, messageVersionId, messageApprovalDigest, messageDigest),
      messagePackageApprovalId: "synthetic-package-approval",
      messagePackageApprovalDigest: "e".repeat(64),
      profileConfigurationId: "synthetic-profile-configuration",
      profileConfigurationDigest: "d".repeat(64),
      currentProfileConfigurationId: "synthetic-profile-configuration",
      currentProfileConfigurationDigest: "d".repeat(64),
      contactEligibilityDigest: "f".repeat(64),
      currentContactEligibilityDigest: "f".repeat(64),
      contactEligible: true,
      contactFreshUntil: NOW + 60_000,
      suppressionRevision: 3,
      currentSuppressionRevision: 3,
      suppressionClear: true,
      lifecycleRevision: 7,
      currentLifecycleRevision: 7,
      lifecycleAvailable: true,
      senderConnectionId: "synthetic-sender-connection",
      currentSenderConnectionId: "synthetic-sender-connection",
      senderConnectionRevision: 5,
      currentSenderConnectionRevision: 5,
      senderEligible: true,
      unsubscribeRevision: 2,
      currentUnsubscribeRevision: 2,
      unsubscribeWorking: true,
      complianceRevision: 2,
      currentComplianceRevision: 2,
      complianceAcknowledged: true,
    },
    originated: null,
    deliveryUnknownRecordedAt: null,
  };
  return {
    ...base,
    ...overrides,
    approvedMessage: { ...base.approvedMessage, ...(overrides.approvedMessage ?? {}) },
    authority: { ...base.authority, ...(overrides.authority ?? {}) },
  };
}

function dispatchCommand(overrides = {}) {
  return {
    outboxItemId: "synthetic-outbox-item",
    expectedRevision: 4,
    leaseGeneration: 2,
    leaseHolderId: "synthetic-lease-holder",
    operationKey: "synthetic-dispatch-operation",
    ...overrides,
  };
}

function port({ dispatch, reconcile } = {}) {
  const calls = { dispatch: 0, reconcile: 0, sync: 0 };
  return {
    calls,
    value: {
      async dispatch(envelope) {
        calls.dispatch += 1;
        return dispatch
          ? dispatch(envelope)
          : { status: "accepted", originated: envelope.originated, acceptedAt: NOW + 1, automaticRetryAuthorized: false };
      },
      async reconcile(request) {
        calls.reconcile += 1;
        return reconcile
          ? reconcile(request)
          : { status: "sent_confirmed", evidence: "exact_originated_match", originated: request.originated, observedAt: NOW + 2, automaticRetryAuthorized: false };
      },
      async syncOriginatedEvents() {
        calls.sync += 1;
        return { events: [], observedThrough: NOW };
      },
    },
  };
}

function orchestrator(module, records, mailPort, now = () => NOW) {
  return module.createLocalOutreachCommandOrchestrator(
    { workspaceId: WORKSPACE, ownerSubject: OWNER, now },
    records,
    mailPort,
  );
}

test("exact package and message authority reaches one terminal accepted result", async () => {
  const { vite, orchestration } = await load();
  try {
    const fake = port();
    const service = orchestrator(orchestration, [record()], fake.value);
    const result = await service.dispatch(dispatchCommand());
    assert.deepEqual(result, {
      kind: "sent",
      outboxItemId: "synthetic-outbox-item",
      revision: 6,
      replayed: false,
      reason: "provider_accepted",
      providerCalls: 1,
      automaticRetryAuthorized: false,
      ownerReconciliationRequired: false,
    });
    assert.equal(fake.calls.dispatch, 1);
    assert.equal(service.read("synthetic-outbox-item").state, "sent");

    const replay = await service.dispatch(dispatchCommand());
    assert.equal(replay.kind, "sent");
    assert.equal(replay.replayed, true);
    assert.equal(fake.calls.dispatch, 1);
    assert.equal((await service.dispatch(dispatchCommand({ expectedRevision: 5 }))).reason, "idempotency_conflict");
    assert.equal(fake.calls.dispatch, 1);
  } finally {
    await vite.close();
  }
});

test("every exact approval and final eligibility drift cancels before the port", async (t) => {
  const cases = [
    ["package approval digest", { packageApproval: { currentApprovalDigest: "0".repeat(64) } }, "package_approval_not_current"],
    ["package artifact digest", { packageApproval: { currentArtifactDigest: "0".repeat(64) } }, "package_approval_not_current"],
    ["message approval digest", { messageApproval: { currentApprovalDigest: "0".repeat(64) } }, "message_approval_not_current"],
    ["message artifact digest", { messageApproval: { currentArtifactDigest: "0".repeat(64) } }, "message_approval_not_current"],
    ["message package binding", { messagePackageApprovalId: "synthetic-other-package-approval" }, "message_package_approval_binding_changed"],
    ["profile configuration", { currentProfileConfigurationDigest: "0".repeat(64) }, "profile_configuration_changed"],
    ["contact digest", { currentContactEligibilityDigest: "0".repeat(64) }, "contact_ineligible"],
    ["contact state", { contactEligible: false }, "contact_ineligible"],
    ["contact freshness", { contactFreshUntil: NOW }, "contact_ineligible"],
    ["suppression", { suppressionClear: false }, "suppressed"],
    ["suppression revision", { currentSuppressionRevision: 4 }, "suppressed"],
    ["lifecycle", { lifecycleAvailable: false }, "lifecycle_unavailable"],
    ["lifecycle revision", { currentLifecycleRevision: 8 }, "lifecycle_unavailable"],
    ["sender", { senderEligible: false }, "sender_unavailable"],
    ["sender connection", { currentSenderConnectionId: "synthetic-other-sender" }, "sender_unavailable"],
    ["unsubscribe", { unsubscribeWorking: false }, "unsubscribe_unavailable"],
    ["unsubscribe revision", { currentUnsubscribeRevision: 3 }, "unsubscribe_unavailable"],
    ["compliance", { complianceAcknowledged: false }, "compliance_unavailable"],
    ["compliance revision", { currentComplianceRevision: 3 }, "compliance_unavailable"],
  ];
  for (const [name, authorityPatch, reason] of cases) {
    await t.test(name, async () => {
      const { vite, orchestration } = await load();
      try {
        const fake = port();
        const base = record();
        const packageApproval = { ...base.authority.packageApproval, ...(authorityPatch.packageApproval ?? {}) };
        const messageApproval = { ...base.authority.messageApproval, ...(authorityPatch.messageApproval ?? {}) };
        const service = orchestrator(orchestration, [record({ authority: { ...authorityPatch, packageApproval, messageApproval } })], fake.value);
        const result = await service.dispatch(dispatchCommand({ operationKey: `synthetic-${name.replaceAll(" ", "-")}` }));
        assert.equal(result.kind, "cancelled");
        assert.equal(result.reason, reason);
        assert.equal(result.providerCalls, 0);
        assert.equal(fake.calls.dispatch, 0);
      } finally {
        await vite.close();
      }
    });
  }
});

test("ambiguous acceptance is terminal for dispatch and only exact originated reconciliation can resolve sent", async () => {
  const { vite, orchestration } = await load();
  try {
    const fake = port({
      dispatch(envelope) {
        return {
          status: "delivery_unknown",
          ambiguity: "accepted_response_lost",
          originated: envelope.originated,
          ownerReconciliationRequired: true,
          automaticRetryAuthorized: false,
        };
      },
    });
    const service = orchestrator(orchestration, [record()], fake.value);
    const unknown = await service.dispatch(dispatchCommand());
    assert.equal(unknown.kind, "delivery_unknown");
    assert.equal(unknown.ownerReconciliationRequired, true);
    assert.equal(unknown.automaticRetryAuthorized, false);
    assert.equal(fake.calls.dispatch, 1);

    const retry = await service.dispatch(dispatchCommand({ expectedRevision: unknown.revision, operationKey: "synthetic-second-dispatch" }));
    assert.equal(retry.reason, "state_not_actionable");
    assert.equal(fake.calls.dispatch, 1);

    const reconciled = await service.reconcile({
      outboxItemId: unknown.outboxItemId,
      expectedRevision: unknown.revision,
      operationKey: "synthetic-reconciliation-operation",
    });
    assert.equal(reconciled.kind, "sent");
    assert.equal(reconciled.reason, "exact_originated_match");
    assert.equal(fake.calls.reconcile, 1);
    const replay = await service.reconcile({
      outboxItemId: unknown.outboxItemId,
      expectedRevision: unknown.revision,
      operationKey: "synthetic-reconciliation-operation",
    });
    assert.equal(replay.replayed, true);
    assert.equal(fake.calls.reconcile, 1);
  } finally {
    await vite.close();
  }
});

test("absent, conflicting, invalid, or failed reconciliation remains DeliveryUnknown without send retry", async (t) => {
  const outcomes = [
    ["not found", () => ({ status: "delivery_unknown", evidence: "not_found", ownerReconciliationRequired: true, automaticRetryAuthorized: false }), "not_found"],
    ["conflict", () => ({ status: "delivery_unknown", evidence: "conflicting_evidence", ownerReconciliationRequired: true, automaticRetryAuthorized: false }), "conflicting_evidence"],
    ["invalid exact match", (request) => ({ status: "sent_confirmed", evidence: "exact_originated_match", originated: { ...request.originated, originatedThreadId: "synthetic-other-thread" }, observedAt: NOW + 2, automaticRetryAuthorized: false }), "reconciliation_match_invalid"],
    ["throw", () => { throw new Error("synthetic_reconciliation_failure"); }, "reconciliation_unavailable"],
  ];
  for (const [name, reconcile, reason] of outcomes) {
    await t.test(name, async () => {
      const { vite, orchestration } = await load();
      try {
        const fake = port({
          dispatch(envelope) {
            return { status: "delivery_unknown", ambiguity: "request_transmission_unknown", originated: envelope.originated, ownerReconciliationRequired: true, automaticRetryAuthorized: false };
          },
          reconcile,
        });
        const service = orchestrator(orchestration, [record()], fake.value);
        const unknown = await service.dispatch(dispatchCommand({ operationKey: `synthetic-dispatch-${name.replaceAll(" ", "-")}` }));
        const result = await service.reconcile({ outboxItemId: unknown.outboxItemId, expectedRevision: unknown.revision, operationKey: `synthetic-reconcile-${name.replaceAll(" ", "-")}` });
        assert.equal(result.kind, "delivery_unknown");
        assert.equal(result.reason, reason);
        assert.equal(result.automaticRetryAuthorized, false);
        assert.equal(fake.calls.dispatch, 1);
        assert.equal(fake.calls.reconcile, 1);
      } finally {
        await vite.close();
      }
    });
  }
});

test("definite pre-transmission failure is bounded and never promoted to Sent", async () => {
  const { vite, orchestration } = await load();
  try {
    const fake = port({
      dispatch() {
        return { status: "definite_failure", reason: "request_rejected_before_transmission", requestTransmitted: false, automaticRetryAuthorized: false };
      },
    });
    const service = orchestrator(orchestration, [record()], fake.value);
    const result = await service.dispatch(dispatchCommand());
    assert.equal(result.kind, "failed_before_dispatch");
    assert.equal(result.reason, "request_rejected_before_transmission");
    assert.equal(result.automaticRetryAuthorized, false);
    assert.equal(fake.calls.dispatch, 1);
  } finally {
    await vite.close();
  }
});

test("cancellation is tenant-scoped, revision-fenced, and replay-idempotent", async () => {
  const { vite, orchestration } = await load();
  try {
    const fake = port();
    const alpha = orchestrator(orchestration, [record()], fake.value);
    const beta = orchestration.createLocalOutreachCommandOrchestrator(
      { workspaceId: "synthetic-workspace-beta", ownerSubject: "synthetic-owner-beta", now: () => NOW },
      [record({ workspaceId: "synthetic-workspace-beta", ownerSubject: "synthetic-owner-beta", outboxItemId: "synthetic-outbox-beta", approvedMessage: { workspaceId: "synthetic-workspace-beta" } })],
      fake.value,
    );
    const command = { outboxItemId: "synthetic-outbox-item", expectedRevision: 4, operationKey: "synthetic-cancel-operation", reason: "suppressed" };
    assert.equal((await beta.cancel(command)).reason, "not_found");
    const cancelled = await alpha.cancel(command);
    assert.equal(cancelled.kind, "cancelled");
    assert.equal(cancelled.providerCalls, 0);
    assert.equal((await alpha.cancel(command)).replayed, true);
    assert.equal((await alpha.cancel({ ...command, reason: "owner_cancelled" })).reason, "idempotency_conflict");
    assert.equal(fake.calls.dispatch, 0);
    assert.equal(fake.calls.reconcile, 0);
  } finally {
    await vite.close();
  }
});

test("concurrent exact replay cannot create a second mail-port call", async () => {
  const { vite, orchestration } = await load();
  let release;
  const waiting = new Promise((resolve) => { release = resolve; });
  try {
    const fake = port({
      async dispatch(envelope) {
        await waiting;
        return { status: "accepted", originated: envelope.originated, acceptedAt: NOW + 1, automaticRetryAuthorized: false };
      },
    });
    const service = orchestrator(orchestration, [record()], fake.value);
    const firstPromise = service.dispatch(dispatchCommand());
    while (fake.calls.dispatch === 0) await new Promise((resolve) => setImmediate(resolve));
    const second = await service.dispatch(dispatchCommand());
    assert.equal(second.reason, "operation_in_progress");
    assert.equal(fake.calls.dispatch, 1);
    release();
    assert.equal((await firstPromise).kind, "sent");
    assert.equal(fake.calls.dispatch, 1);
  } finally {
    release?.();
    await vite.close();
  }
});

test("the only production adapter stays reject-only and the new module remains runtime-unreachable", async () => {
  const { vite, orchestration, gmail } = await load();
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error("network_tripwire");
  };
  try {
    const service = orchestrator(orchestration, [record()], gmail.UNCONFIGURED_GMAIL_ADAPTER);
    const result = await service.dispatch(dispatchCommand());
    assert.equal(result.kind, "failed_before_dispatch");
    assert.equal(result.reason, "mail_port_unconfigured");
    assert.equal(result.providerCalls, 0);
    assert.equal(result.automaticRetryAuthorized, false);
    assert.equal(gmail.UNCONFIGURED_GMAIL_ADAPTER.providerInvocationCount, 0);
    assert.equal(fetchCalls, 0);

    const source = await readFile(new URL("../domain/local-outreach-command-orchestrator.ts", import.meta.url), "utf8");
    assert.doesNotMatch(source, /\bfetch\b|https?:\/\/|googleapis|oauth|credential|secret|bearer/iu);
    for (const directory of ["../app", "../worker", "../adapters"]) {
      for (const entry of await readdir(new URL(directory, import.meta.url), { recursive: true, withFileTypes: true })) {
        if (!entry.isFile() || !/\.(?:ts|tsx|js|mjs)$/u.test(entry.name)) continue;
        const file = await readFile(new URL(`${entry.parentPath}/${entry.name}`, import.meta.url), "utf8");
        assert.doesNotMatch(file, /local-outreach-command-orchestrator/u, `${entry.parentPath}/${entry.name} must not compose the local orchestrator`);
      }
    }
  } finally {
    globalThis.fetch = originalFetch;
    await vite.close();
  }
});

test("hostile and extra-field commands fail closed without inspecting getters", async () => {
  const { vite, orchestration } = await load();
  try {
    const fake = port();
    const service = orchestrator(orchestration, [record()], fake.value);
    let getterInspected = 0;
    const hostile = new Proxy({}, {
      ownKeys() { throw new Error("hostile_keys"); },
      get() { getterInspected += 1; throw new Error("hostile_get"); },
    });
    const getter = { ...dispatchCommand() };
    Object.defineProperty(getter, "operationKey", { enumerable: true, get() { getterInspected += 1; throw new Error("getter"); } });
    for (const value of [hostile, getter, { ...dispatchCommand(), extra: true }, { ...dispatchCommand(), leaseGeneration: 0 }]) {
      const result = await service.dispatch(value);
      assert.equal(result.reason, "invalid_request");
    }
    assert.equal(getterInspected, 0);
    assert.deepEqual(fake.calls, { dispatch: 0, reconcile: 0, sync: 0 });
  } finally {
    await vite.close();
  }
});
