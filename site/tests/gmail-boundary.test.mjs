import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createServer } from "vite";

async function load() {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  return {
    vite,
    gmail: await vite.ssrLoadModule(new URL("../adapters/gmail.ts", import.meta.url).pathname),
    mail: await vite.ssrLoadModule(new URL("../domain/ports/mail.ts", import.meta.url).pathname),
  };
}

function exactEnvelope() {
  return Object.freeze({
    approvedMessage: Object.freeze({
      workspaceId: "synthetic-workspace",
      companyId: "synthetic-company",
      messageVersionId: "synthetic-message-version",
      messageDigest: "a".repeat(64),
      messageApprovalId: "synthetic-message-approval",
      messageApprovalDigest: "b".repeat(64),
      packageVersionId: "synthetic-package-version",
      packageDigest: "c".repeat(64),
      profileConfigurationId: "synthetic-profile-configuration",
      profileConfigurationDigest: "d".repeat(64),
    }),
    idempotency: Object.freeze({
      outboxItemId: "synthetic-outbox-item",
      sendKey: "synthetic-send-key",
      leaseGeneration: 7,
      providerAttempt: 1,
    }),
    originated: Object.freeze({
      originatedMessageId: "synthetic-originated-message",
      originatedThreadId: "synthetic-originated-thread",
      rfcMessageId: "synthetic-rfc-message-id",
      marker: "synthetic-origin-marker",
    }),
  });
}

function reconciliationRequest() {
  const envelope = exactEnvelope();
  return Object.freeze({
    ...envelope,
    deliveryUnknownRecordedAt: 1_900_001_000_000,
  });
}

function syncRequest() {
  return Object.freeze({
    workspaceId: "synthetic-workspace",
    connectionId: "synthetic-connection",
    originated: Object.freeze([exactEnvelope().originated]),
    observedAfter: null,
    observedThrough: 1_900_001_100_000,
  });
}

async function expectUnconfigured(promise, gmail) {
  await assert.rejects(promise, (error) => {
    assert.equal(error instanceof gmail.GmailAdapterUnavailableError, true);
    assert.equal(error.code, "gmail_adapter_unconfigured");
    assert.equal(error.message, "gmail_adapter_unconfigured");
    return true;
  });
}

test("the Gmail launch adapter is one immutable UNCONFIGURED deny-only object", async () => {
  const { vite, gmail } = await load();
  try {
    const adapter = gmail.UNCONFIGURED_GMAIL_ADAPTER;
    assert.equal(gmail.createUnconfiguredGmailAdapter(), adapter);
    assert.equal(Object.isFrozen(adapter), true);
    assert.equal(adapter.state, "UNCONFIGURED");
    assert.equal(adapter.providerInvocationCount, 0);
    assert.deepEqual(Object.keys(adapter).sort(), [
      "dispatch",
      "providerInvocationCount",
      "reconcile",
      "state",
      "syncOriginatedEvents",
    ]);
    assert.throws(() => {
      adapter.state = "CONNECTED";
    }, TypeError);
  } finally {
    await vite.close();
  }
});

test("originated markers bind the exact approved message and idempotency tuple", async () => {
  const { vite, mail } = await load();
  try {
    const envelope = exactEnvelope();
    const input = {
      approvedMessage: envelope.approvedMessage,
      idempotency: envelope.idempotency,
      originatedMessageId: envelope.originated.originatedMessageId,
      originatedThreadId: envelope.originated.originatedThreadId,
    };
    const first = await mail.createOriginatedMessageReference(input);
    const replay = await mail.createOriginatedMessageReference({ ...input });
    const advancedLease = await mail.createOriginatedMessageReference({
      ...input,
      idempotency: { ...input.idempotency, leaseGeneration: 8 },
    });
    assert.deepEqual(first, replay);
    assert.notEqual(first.marker, advancedLease.marker);
    for (const [field, replacement] of [
      ["workspaceId", "synthetic-workspace-other"],
      ["companyId", "synthetic-company-other"],
      ["messageVersionId", "synthetic-message-version-other"],
      ["messageDigest", "e".repeat(64)],
      ["messageApprovalId", "synthetic-message-approval-other"],
      ["messageApprovalDigest", "e".repeat(64)],
      ["packageVersionId", "synthetic-package-version-other"],
      ["packageDigest", "e".repeat(64)],
      ["profileConfigurationId", "synthetic-profile-configuration-other"],
      ["profileConfigurationDigest", "e".repeat(64)],
    ]) {
      const changed = await mail.createOriginatedMessageReference({
        ...input,
        approvedMessage: { ...input.approvedMessage, [field]: replacement },
      });
      assert.notEqual(first.marker, changed.marker, `${field} must bind the marker`);
    }
    assert.match(first.rfcMessageId, /^<[a-f0-9]{64}@prospector\.invalid>$/u);
    assert.match(first.marker, /^prospector-origin\/v1:[a-f0-9]{64}$/u);
    assert.equal(Object.isFrozen(first), true);

    const getterBacked = { ...input };
    Object.defineProperty(getterBacked, "originatedThreadId", {
      enumerable: true,
      get() {
        throw new Error("getter_must_not_run");
      },
    });
    const symbol = Symbol("unknown");
    for (const invalid of [
      { ...input, extra: true },
      { ...input, approvedMessage: { ...input.approvedMessage, messageDigest: "bad" } },
      { ...input, idempotency: { ...input.idempotency, providerAttempt: 2 } },
      { ...input, [symbol]: true },
      { ...input, approvedMessage: { ...input.approvedMessage, [symbol]: true } },
      { ...input, idempotency: { ...input.idempotency, [symbol]: true } },
      getterBacked,
      new Proxy({}, { ownKeys() { throw new Error("hostile_proxy"); } }),
    ]) {
      await assert.rejects(
        mail.createOriginatedMessageReference(invalid),
        /originated_message_reference_invalid/u,
      );
    }
  } finally {
    await vite.close();
  }
});

test("dispatch, reconciliation, and originated sync always reject with zero provider invocation", async () => {
  const { vite, gmail } = await load();
  const previousFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error("network_tripwire");
  };
  try {
    const adapter = gmail.UNCONFIGURED_GMAIL_ADAPTER;
    await expectUnconfigured(adapter.dispatch(exactEnvelope()), gmail);
    await expectUnconfigured(adapter.reconcile(reconciliationRequest()), gmail);
    await expectUnconfigured(adapter.syncOriginatedEvents(syncRequest()), gmail);
    assert.equal(adapter.providerInvocationCount, 0);
    assert.equal(fetchCalls, 0);
  } finally {
    globalThis.fetch = previousFetch;
    await vite.close();
  }
});

test("adversarial inputs are rejected without inspection or capability discovery", async () => {
  const { vite, gmail } = await load();
  try {
    const adapter = gmail.UNCONFIGURED_GMAIL_ADAPTER;
    let inspected = 0;
    const hostile = new Proxy({}, {
      get() {
        inspected += 1;
        throw new Error("hostile_getter_executed");
      },
      ownKeys() {
        inspected += 1;
        throw new Error("hostile_keys_executed");
      },
    });
    const getterBacked = {};
    Object.defineProperty(getterBacked, "approvedMessage", {
      enumerable: true,
      get() {
        inspected += 1;
        throw new Error("hostile_getter_executed");
      },
    });

    for (const method of ["dispatch", "reconcile", "syncOriginatedEvents"]) {
      for (const input of [undefined, null, {}, { ...exactEnvelope(), extra: true }, getterBacked, hostile]) {
        await expectUnconfigured(adapter[method](input), gmail);
      }
    }
    assert.equal(inspected, 0);
    assert.equal(adapter.providerInvocationCount, 0);
  } finally {
    await vite.close();
  }
});

test("the closed result contracts keep absence unknown and forbid automatic retry", async () => {
  const source = await readFile(new URL("../domain/ports/mail.ts", import.meta.url), "utf8");
  assert.match(source, /status: "definite_failure"[\s\S]*requestTransmitted: false;[\s\S]*automaticRetryAuthorized: false;/u);
  assert.match(source, /status: "delivery_unknown"[\s\S]*ownerReconciliationRequired: true;[\s\S]*automaticRetryAuthorized: false;/u);
  assert.match(source, /status: "sent_confirmed";[\s\S]*evidence: "exact_originated_match";/u);
  assert.match(source, /evidence: "not_found" \| "conflicting_evidence" \| "connection_unavailable";/u);
  assert.doesNotMatch(source, /evidence: "not_found"[\s\S]{0,120}status: "sent_confirmed"/u);
});

test("the adapter contains no transport, endpoint, credential, or account-selection seam", async () => {
  const source = await readFile(new URL("../adapters/gmail.ts", import.meta.url), "utf8");
  for (const forbidden of [
    /\bfetch\b/u,
    /https?:\/\//u,
    /googleapis/u,
    /oauth/u,
    /credential/u,
    /secret/u,
    /token/u,
    /account(?:Id|Selector|Selection)/u,
  ]) {
    assert.doesNotMatch(source, forbidden);
  }
});
