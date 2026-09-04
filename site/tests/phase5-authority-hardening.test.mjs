import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";

const workspaceId = "workspace-authority-hardening";
const owner = { subject: "owner-authority-hardening", admittedOwner: true };
const uuidV7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function load(vite, name) {
  return vite.ssrLoadModule(new URL(`../domain/${name}.ts`, import.meta.url).pathname);
}

function identity(id, revision = 1) {
  return {
    id,
    workspaceId,
    revision,
    aliases: [`alias-${id}`],
    sourceLineageIds: [`source-${id}`],
    identityLineageIds: [],
    associations: [{
      id: `association-${id}`,
      workspaceId,
      scope: "market_play",
      relevanceId: `relevance-${id}`,
      subjectId: id,
    }],
    suppressionSubjectRefs: [`suppression-${id}`],
  };
}

class IdentityRepository {
  constructor(rows) {
    this.rows = new Map(rows.map((row) => [row.id, structuredClone(row)]));
    this.suggestions = new Map();
    this.applied = [];
    this.suggestionWrites = 0;
    this.resolutionWrites = 0;
    this.transactionDestinationReads = 0;
    this.tail = Promise.resolve();
  }

  async readIdentitySnapshots(scope, ids) {
    return this.#read(scope, ids);
  }

  async saveIdentitySuggestion(suggestion) {
    this.suggestionWrites += 1;
    const key = `${suggestion.workspaceId}:${suggestion.ownerSubject}:${suggestion.id}`;
    this.suggestions.set(key, structuredClone(suggestion));
    return structuredClone(suggestion);
  }

  async readIdentitySuggestion(scope, ownerSubject, suggestionId) {
    return structuredClone(this.suggestions.get(`${scope}:${ownerSubject}:${suggestionId}`) ?? null);
  }

  async transaction(scope, operation) {
    const previous = this.tail;
    let release;
    this.tail = new Promise((resolve) => { release = resolve; });
    await previous;
    try {
      return await operation({
        findByIdempotencyKey: async (key) => structuredClone(
          this.applied.find((entry) => entry.workspaceId === scope && entry.idempotencyKey === key)?.resolution ?? null,
        ),
        readIdentitySnapshots: async (ids) => {
          if (ids.length === 1 && uuidV7.test(ids[0])) this.transactionDestinationReads += 1;
          return this.#read(scope, ids);
        },
        applyResolution: async (resolution) => {
          this.resolutionWrites += 1;
          this.applied.push({
            workspaceId: scope,
            idempotencyKey: resolution.idempotencyKey,
            resolution: structuredClone(resolution),
          });
          this.rows.get(resolution.decision.sourceId).revision += 1;
          return structuredClone(resolution);
        },
      });
    } finally {
      release();
    }
  }

  #read(scope, ids) {
    return ids
      .map((id) => this.rows.get(id))
      .filter((row) => row?.workspaceId === scope)
      .map((row) => structuredClone(row));
  }
}

test("split destination authority is server-owned, collision-checked in the transaction, and replay-safe", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const domain = await load(vite, "identity-resolution");
    const attackerSelectedId = "identity-attacker-selected";
    const rejectedRepository = new IdentityRepository([identity("identity-source", 4)]);
    await assert.rejects(
      () => domain.planIdentitySuggestion(rejectedRepository, owner, {
        workspaceId,
        kind: "split",
        sourceId: "identity-source",
        newIdentityId: attackerSelectedId,
        moveAssociationIds: ["association-identity-source"],
      }),
      /identity_resolution_rejected/,
    );
    assert.equal(rejectedRepository.suggestionWrites, 0, "caller-selected destination is rejected before suggestion persistence");
    assert.equal(rejectedRepository.resolutionWrites, 0);

    const repository = new IdentityRepository([identity("identity-source", 4)]);
    const suggestion = await domain.planIdentitySuggestion(repository, owner, {
      workspaceId,
      kind: "split",
      sourceId: "identity-source",
      moveAssociationIds: ["association-identity-source"],
    });
    assert.match(suggestion.proposedPartition.newIdentityId, uuidV7);
    assert.notEqual(suggestion.proposedPartition.newIdentityId, attackerSelectedId);

    const decision = {
      kind: "split",
      sourceId: "identity-source",
      moveAssociationIds: ["association-identity-source"],
    };
    await assert.rejects(
      () => domain.applyIdentityResolution(repository, owner, {
        workspaceId,
        suggestionId: suggestion.id,
        decision: { ...decision, newIdentityId: attackerSelectedId },
        expectedRevision: suggestion.revision,
        idempotencyKey: "identity-split-authority-forged-0001",
      }),
      /identity_resolution_rejected/,
    );
    assert.equal(repository.resolutionWrites, 0, "caller-selected apply destination is rejected before the transaction");
    assert.equal(repository.transactionDestinationReads, 0);

    const input = {
      workspaceId,
      suggestionId: suggestion.id,
      decision,
      expectedRevision: suggestion.revision,
      idempotencyKey: "identity-split-authority-0001",
    };
    const [applied, replay] = await Promise.all([
      domain.applyIdentityResolution(repository, owner, input),
      domain.applyIdentityResolution(repository, owner, input),
    ]);
    assert.deepEqual(replay, applied);
    assert.equal(applied.decision.newIdentityId, suggestion.proposedPartition.newIdentityId);
    assert.equal(repository.resolutionWrites, 1, "same-key concurrency commits exactly once");
    assert.equal(repository.transactionDestinationReads, 1, "the absent destination is proven inside the winning transaction");

    const raceRepository = new IdentityRepository([identity("identity-source", 4)]);
    const raceSuggestion = await domain.planIdentitySuggestion(raceRepository, owner, {
      workspaceId,
      kind: "split",
      sourceId: "identity-source",
      moveAssociationIds: ["association-identity-source"],
    });
    const raceBase = {
      workspaceId,
      suggestionId: raceSuggestion.id,
      decision,
      expectedRevision: raceSuggestion.revision,
    };
    const race = await Promise.allSettled([
      domain.applyIdentityResolution(raceRepository, owner, {
        ...raceBase,
        idempotencyKey: "identity-split-authority-race-0001",
      }),
      domain.applyIdentityResolution(raceRepository, owner, {
        ...raceBase,
        idempotencyKey: "identity-split-authority-race-0002",
      }),
    ]);
    assert.deepEqual(race.map((result) => result.status).sort(), ["fulfilled", "rejected"]);
    assert.equal(raceRepository.resolutionWrites, 1, "competing decision keys cannot commit the same split twice");

    const collisionRepository = new IdentityRepository([identity("identity-source", 4)]);
    const collisionSuggestion = await domain.planIdentitySuggestion(collisionRepository, owner, {
      workspaceId,
      kind: "split",
      sourceId: "identity-source",
      moveAssociationIds: ["association-identity-source"],
    });
    collisionRepository.rows.set(
      collisionSuggestion.proposedPartition.newIdentityId,
      identity(collisionSuggestion.proposedPartition.newIdentityId),
    );
    const beforeCollision = structuredClone([...collisionRepository.rows.values()]);
    await assert.rejects(
      () => domain.applyIdentityResolution(collisionRepository, owner, {
        workspaceId,
        suggestionId: collisionSuggestion.id,
        decision,
        expectedRevision: collisionSuggestion.revision,
        idempotencyKey: "identity-split-authority-0002",
      }),
      /identity_resolution_rejected/,
    );
    assert.equal(collisionRepository.resolutionWrites, 0, "destination collision cannot write a resolution");
    assert.deepEqual([...collisionRepository.rows.values()], beforeCollision, "collision rejection leaves the identity graph unchanged");
  } finally {
    await vite.close();
  }
});

test("grant issuance accepts only canonical three-letter uppercase currency before durable writes", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const issuance = await load(vite, "enrichment-grant-issuance");
    const snapshot = {
      admitted: true,
      workspaceId,
      ownerSubject: owner.subject,
      revision: 2,
      configuration: { id: "configuration-authority", digest: "a".repeat(64), revision: 1, current: true },
      prospects: [{
        id: "prospect-authority",
        state: "approved",
        configurationId: "configuration-authority",
        configurationDigest: "a".repeat(64),
        revision: 3,
      }],
      quote: {
        providerId: "provider-synthetic",
        providerVersion: "v1",
        catalogRef: "catalog-synthetic",
        revision: 1,
        currency: "USD",
        unitCostMinor: 5,
        expiresAt: 2_000,
      },
    };
    const validInput = {
      principalSubject: owner.subject,
      prospectIds: ["prospect-authority"],
      operation: "business_contact_lookup/v1",
      maxUnits: 1,
      maxCostMinor: 5,
      currency: "USD",
      expiresAt: 1_500,
      expectedRevision: 2,
      idempotencyKey: "currency-authority-0001",
      now: 1_000,
    };

    for (const currency of ["usd", "US", "USDX", "U1D", " USD"]) {
      const counters = { loads: 0, writes: 0 };
      const result = await issuance.issueEnrichmentGrant({
        async loadIssuanceSnapshot() { counters.loads += 1; return snapshot; },
        async findGrantByIdempotency() { throw new Error("invalid currency must not reach grant lookup"); },
        async commitGrant() { counters.writes += 1; throw new Error("invalid currency must not commit"); },
      }, { ...validInput, currency });
      assert.deepEqual(result, { kind: "blocked", reason: "invalid_request" }, currency);
      assert.deepEqual(counters, { loads: 0, writes: 0 }, `${currency} is rejected before repository access`);
    }

    for (const currency of ["usd", "US", "USDX"]) {
      let writes = 0;
      const result = await issuance.issueEnrichmentGrant({
        async loadIssuanceSnapshot() { return { ...snapshot, quote: { ...snapshot.quote, currency } }; },
        async findGrantByIdempotency() { throw new Error("invalid quote currency must not reach grant lookup"); },
        async commitGrant() { writes += 1; throw new Error("invalid quote currency must not commit"); },
      }, validInput);
      assert.deepEqual(result, { kind: "blocked", reason: "quote_unavailable" }, currency);
      assert.equal(writes, 0, `${currency} quote cannot create authority`);
    }
  } finally {
    await vite.close();
  }
});
