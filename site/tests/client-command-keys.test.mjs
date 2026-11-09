import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";

// Client-only command transport: per-intent idempotency keys, and no automatic
// retry after an expired CSRF token (owner rule, 2026-11-09). Fetch is stubbed;
// no server, provider, or network.

const PRODUCT_A = "01890000-0000-7000-8000-00000000000a";
const PRODUCT_B = "01890000-0000-7000-8000-00000000000b";
const DIGEST = "a".repeat(64);

async function withModule(path, assertion) {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    await assertion(await vite.ssrLoadModule(new URL(`../app/${path}`, import.meta.url).pathname));
  } finally {
    await vite.close();
  }
}

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

/** Records every call and answers from a queue of responders. */
function stubFetch(responders) {
  const calls = [];
  const fetcher = async (url, init = {}) => {
    const method = init.method ?? "GET";
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ url: String(url), method, body });
    const next = responders.shift();
    if (!next) throw new Error(`unexpected ${method} ${url}`);
    return typeof next === "function" ? next(url, init) : next;
  };
  return { fetcher, calls, posts: () => calls.filter((call) => call.method === "POST"), gets: () => calls.filter((call) => call.method === "GET") };
}

function emptyDiscoveryProjection() {
  return { products: [], selectedProductId: null, readiness: null, runs: [], proposals: [], privateSyntheticProof: null };
}

function discover(productId, revision = 1) {
  return { action: "start_manual_discovery", productId, expectedProductRevision: revision };
}

test("Market Discovery keys are scoped to the full intent and dropped on a definitive outcome", async () => {
  await withModule("discovery/discovery-workspace.tsx", async (discovery) => {
    const keys = new Map();
    const ok = () => json(200, emptyDiscoveryProjection());

    let stub = stubFetch([ok()]);
    assert.equal((await discovery.postDiscoveryMutation(stub.fetcher, discover(PRODUCT_A), keys)).kind, "applied");
    const firstKey = stub.posts()[0].body.idempotencyKey;
    assert.equal(keys.size, 0, "success drops the key");

    stub = stubFetch([ok()]);
    await discovery.postDiscoveryMutation(stub.fetcher, discover(PRODUCT_A), keys);
    const repeatKey = stub.posts()[0].body.idempotencyKey;
    assert.notEqual(repeatKey, firstKey, "a repeat Discover after success sends a new key");

    stub = stubFetch([ok()]);
    await discovery.postDiscoveryMutation(stub.fetcher, discover(PRODUCT_B), keys);
    assert.notEqual(stub.posts()[0].body.idempotencyKey, repeatKey, "a different product sends a different key");
    assert.equal(stub.posts()[0].body.productId, PRODUCT_B);

    assert.notEqual(discovery.discoveryIntentKey(discover(PRODUCT_A, 1)), discovery.discoveryIntentKey(discover(PRODUCT_A, 2)));
    const proposal = { action: "decide_proposal", proposalId: PRODUCT_A, expectedProposalRevision: 1, expectedProposalDigest: DIGEST };
    assert.notEqual(discovery.discoveryIntentKey({ ...proposal, decision: "defer" }), discovery.discoveryIntentKey({ ...proposal, decision: "explore" }));
  });
});

test("Market Discovery reuses the key only for an unknown-outcome retry of the same intent", async () => {
  await withModule("discovery/discovery-workspace.tsx", async (discovery) => {
    const keys = new Map();
    let stub = stubFetch([json(503, { error: "unavailable" })]);
    assert.equal((await discovery.postDiscoveryMutation(stub.fetcher, discover(PRODUCT_A), keys)).kind, "unknown");
    const unknownKey = stub.posts()[0].body.idempotencyKey;
    assert.equal(stub.calls.length, 1, "an unknown outcome is never retried automatically");

    stub = stubFetch([() => { throw new TypeError("network"); }]);
    assert.equal((await discovery.postDiscoveryMutation(stub.fetcher, discover(PRODUCT_A), keys)).kind, "unknown");
    assert.equal(stub.posts()[0].body.idempotencyKey, unknownKey, "the owner's retry of the same intent reuses the key");

    stub = stubFetch([json(200, emptyDiscoveryProjection())]);
    assert.equal((await discovery.postDiscoveryMutation(stub.fetcher, discover(PRODUCT_A), keys)).kind, "applied");
    assert.equal(stub.posts()[0].body.idempotencyKey, unknownKey);
    assert.equal(keys.size, 0);
  });
});

test("Market Discovery maps 409 to a conflict without retrying and drops the key", async () => {
  await withModule("discovery/discovery-workspace.tsx", async (discovery) => {
    const keys = new Map();
    const stub = stubFetch([json(409, { error: "conflict" })]);
    assert.equal((await discovery.postDiscoveryMutation(stub.fetcher, discover(PRODUCT_A), keys)).kind, "conflict");
    assert.equal(stub.calls.length, 1, "a 409 never triggers a retry");
    assert.equal(keys.size, 0);
  });
});

test("Market Discovery never retries after an expired CSRF token and drops the key", async () => {
  await withModule("discovery/discovery-workspace.tsx", async (discovery) => {
    const keys = new Map();
    const stub = stubFetch([json(403, { error: "invalid_csrf_token" })]);
    assert.equal((await discovery.postDiscoveryMutation(stub.fetcher, discover(PRODUCT_A), keys)).kind, "refused");
    assert.equal(stub.calls.length, 1, "exactly one POST and no refresh GET");
    assert.equal(keys.size, 0, "a definitive refusal drops the key");
  });
});

test("Contacts grant keys are minted per prospect intent and survive only an unknown outcome", async () => {
  await withModule("prospects/contacts-workspace.tsx", async (contacts) => {
    const keys = new Map();
    const first = { prospectId: "prospect-1", expectedProspectRevision: 1 };
    const second = { prospectId: "prospect-2", expectedProspectRevision: 1 };
    const firstKey = contacts.contactGrantKey(keys, first);
    assert.equal(contacts.contactGrantKey(keys, first), firstKey);
    assert.notEqual(contacts.contactGrantKey(keys, second), firstKey, "a different prospect gets a different key");
    assert.notEqual(contacts.contactGrantKey(keys, { ...first, expectedProspectRevision: 2 }), firstKey);

    contacts.settleContactGrantKey(keys, first, "unknown");
    assert.equal(contacts.contactGrantKey(keys, first), firstKey, "unknown outcome keeps the key for a retry");
    contacts.settleContactGrantKey(keys, first, "definitive");
    assert.notEqual(contacts.contactGrantKey(keys, first), firstKey, "a definitive outcome drops the key");
  });
});

test("Contacts confirmation never retries after an expired CSRF token or a 409", async () => {
  await withModule("prospects/contacts-workspace.tsx", async (contacts) => {
    const input = { authorityReady: true, confirmed: true, pending: false, idempotencyKey: "grant-key-1" };
    const command = { prospectId: "prospect-1", expectedProspectRevision: 1 };
    for (const [status, error] of [[403, "invalid_csrf_token"], [409, "idempotency_conflict"]]) {
      const stub = stubFetch([json(status, { error })]);
      assert.equal((await contacts.postContactConfirmation(stub.fetcher, input, command)).status, status);
      assert.equal(stub.calls.length, 1, `a ${status} never triggers a retry`);
      assert.equal(stub.posts()[0].body.idempotencyKey, "grant-key-1");
    }
  });
});

test("Prospecting commands are sent once with a key and never retried, including an expired CSRF token", async () => {
  await withModule("prospecting/prospecting-workspace.tsx", async (prospecting) => {
    const body = { action: "manual_find", profileId: "profile-1" };
    for (const status of [403, 409, 400, 404, 500]) {
      const stub = stubFetch([json(status, { error: status === 403 ? "invalid_csrf_token" : "refused" })]);
      assert.equal((await prospecting.postProspectingCommand(stub.fetcher, body)).status, status);
      assert.equal(stub.calls.length, 1, `status ${status} is never retried`);
      assert.ok(stub.posts()[0].body.idempotencyKey);
    }
  });
});

test("Contacts granted operation and identity merge are never retried after an expired CSRF token", async () => {
  await withModule("prospects/contacts-workspace.tsx", async (contacts) => {
    let stub = stubFetch([json(403, { error: "invalid_csrf_token" })]);
    const response = await contacts.postGrantedOperationOnce(stub.fetcher, { grantId: "grant-1", confirmed: true }, { current: false });
    assert.equal(response.status, 403);
    assert.equal(stub.calls.length, 1);

    const merge = { action: "apply_identity_merge", suggestionId: "suggestion-1", expectedRevision: 1, idempotencyKey: "identity-key-1", primaryId: "subject-1" };
    stub = stubFetch([json(403, { error: "invalid_csrf_token" })]);
    const attempt = { current: false };
    assert.equal((await contacts.postContactsCommandOnce(stub.fetcher, merge, attempt)).status, 403);
    assert.equal(stub.calls.length, 1, "exactly one POST and no refresh GET");
    assert.equal(await contacts.postContactsCommandOnce(stub.fetcher, merge, attempt), null, "the attempt guard still holds");
  });
});
