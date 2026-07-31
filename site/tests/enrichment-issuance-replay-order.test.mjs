import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";

const NOW = 1_000;

async function load(vite) {
  return vite.ssrLoadModule(new URL("../domain/enrichment-grant-issuance.ts", import.meta.url).pathname);
}

test("issuance validates exact canonical authority fields before an idempotency lookup", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const issuance = await load(vite);
    const malformed = [
      ["admitted boolean", "repository_result_invalid", (value) => ({ ...value, admitted: 1 })],
      ["workspace", "repository_result_invalid", (value) => ({ ...value, workspaceId: "" })],
      ["owner", "repository_result_invalid", (value) => ({ ...value, ownerSubject: "" })],
      ["source revision", "stale_revision", (value) => ({ ...value, revision: 1.5 })],
      ["configuration current boolean", "configuration_not_current", (value) => ({
        ...value,
        configuration: { ...value.configuration, current: "true" },
      })],
      ["configuration digest", "configuration_not_current", (value) => ({
        ...value,
        configuration: { ...value.configuration, digest: "not-a-digest" },
      })],
      ["prospect revision", "prospect_not_approved", (value) => ({
        ...value,
        prospects: [{ ...value.prospects[0], revision: 0 }],
      })],
      ["duplicate prospect", "prospect_not_approved", (value) => ({
        ...value,
        prospects: [value.prospects[0], { ...value.prospects[0] }],
      })],
      ["provider", "quote_unavailable", (value) => ({
        ...value,
        quote: { ...value.quote, providerId: "" },
      })],
      ["currency", "quote_unavailable", (value) => ({
        ...value,
        quote: { ...value.quote, currency: "usd" },
      })],
      ["unit price", "quote_unavailable", (value) => ({
        ...value,
        quote: { ...value.quote, unitCostMinor: 1.5 },
      })],
      ["quote expiry", "quote_unavailable", (value) => ({
        ...value,
        quote: { ...value.quote, expiresAt: 0 },
      })],
    ];

    for (const [name, reason, mutate] of malformed) {
      let lookups = 0;
      const result = await issuance.issueEnrichmentGrant({
        async loadIssuanceSnapshot() { return mutate(authority()); },
        async findGrantByIdempotency() {
          lookups += 1;
          throw new Error("malformed authority must not probe grant existence");
        },
        async commitGrant() {
          throw new Error("malformed authority must not write");
        },
      }, input());
      assert.deepEqual(result, { kind: "blocked", reason }, name);
      assert.equal(lookups, 0, name);
    }

    let deniedLookups = 0;
    const denied = await issuance.issueEnrichmentGrant({
      async loadIssuanceSnapshot() { return { ...authority(), admitted: false }; },
      async findGrantByIdempotency() {
        deniedLookups += 1;
        return null;
      },
      async commitGrant() {
        throw new Error("a denied owner must not write");
      },
    }, input());
    assert.deepEqual(denied, { kind: "blocked", reason: "owner_not_admitted" });
    assert.equal(deniedLookups, 0);
  } finally {
    await vite.close();
  }
});

test("an exact immutable grant replays before structurally valid advanced-state freshness checks", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const issuance = await load(vite);
    const records = new Map();
    let current = authority();
    let writes = 0;
    const repository = {
      async loadIssuanceSnapshot() { return current; },
      async findGrantByIdempotency(_workspaceId, idempotencyKey) {
        return records.get(idempotencyKey) ?? null;
      },
      async commitGrant(record) {
        writes += 1;
        records.set(record.idempotencyKey, record);
        return { kind: "created", record };
      },
      nextNonce: () => "issuance-replay-order-nonce",
    };

    const originalInput = input();
    const first = await issuance.issueEnrichmentGrant(repository, originalInput);
    assert.equal(first.kind, "issued");

    current = {
      ...authority(),
      revision: 8,
      configuration: {
        id: "configuration-replacement",
        digest: "b".repeat(64),
        revision: 4,
        current: false,
      },
      prospects: [{
        id: "prospect-one",
        state: "archived",
        configurationId: "configuration-replacement",
        configurationDigest: "b".repeat(64),
        revision: 5,
      }],
      quote: {
        providerId: "provider-replacement",
        providerVersion: "v2",
        catalogRef: "catalog-replacement",
        revision: 3,
        currency: "USD",
        unitCostMinor: 99,
        expiresAt: 900,
      },
    };

    const replay = await issuance.issueEnrichmentGrant(repository, originalInput);
    assert.equal(replay.kind, "issued");
    assert.equal(replay.replayed, true);
    assert.equal(replay.grant.id, first.grant.id);
    assert.equal(writes, 1);

    const conflict = await issuance.issueEnrichmentGrant(repository, {
      ...originalInput,
      maxCostMinor: originalInput.maxCostMinor + 1,
    });
    assert.deepEqual(conflict, { kind: "conflict", reason: "idempotency_conflict" });

    const staleNewGrant = await issuance.issueEnrichmentGrant(repository, {
      ...originalInput,
      idempotencyKey: "issuance-replay-order-new-key",
    });
    assert.deepEqual(staleNewGrant, { kind: "blocked", reason: "stale_revision" });

    const nonCurrentNewGrant = await issuance.issueEnrichmentGrant(repository, {
      ...originalInput,
      expectedRevision: 8,
      idempotencyKey: "issuance-replay-order-current-key",
    });
    assert.deepEqual(nonCurrentNewGrant, { kind: "blocked", reason: "configuration_not_current" });
    assert.equal(writes, 1);
  } finally {
    await vite.close();
  }
});

function authority() {
  return {
    admitted: true,
    workspaceId: "workspace-one",
    ownerSubject: "owner-one",
    revision: 7,
    configuration: {
      id: "configuration-one",
      digest: "a".repeat(64),
      revision: 3,
      current: true,
    },
    prospects: [{
      id: "prospect-one",
      state: "approved",
      configurationId: "configuration-one",
      configurationDigest: "a".repeat(64),
      revision: 4,
    }],
    quote: {
      providerId: "provider-one",
      providerVersion: "v1",
      catalogRef: "catalog-one",
      revision: 2,
      currency: "USD",
      unitCostMinor: 10,
      expiresAt: 2_000,
    },
  };
}

function input() {
  return {
    principalSubject: "owner-one",
    prospectIds: ["prospect-one"],
    operation: "business_contact_lookup/v1",
    maxUnits: 1,
    maxCostMinor: 10,
    currency: "USD",
    expiresAt: 1_500,
    expectedRevision: 7,
    idempotencyKey: "issuance-replay-order-original",
    now: NOW,
  };
}
