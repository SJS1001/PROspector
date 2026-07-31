import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";

const workspaceId = "synthetic-workspace-a";
const owner = { subject: "synthetic-owner", admittedOwner: true };

async function load() {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  return { vite, domain: await vite.ssrLoadModule(new URL("../domain/identity-resolution.ts", import.meta.url).pathname) };
}

function identity(id, revision, overrides = {}) {
  return {
    id, workspaceId, revision,
    aliases: [`alias-${id}`], sourceLineageIds: [`source-${id}`], identityLineageIds: [`lineage-${id}`], suppressionSubjectRefs: [`suppression-${id}`],
    associations: [{ id: `association-${id}`, workspaceId, scope: "market_play", relevanceId: `relevance-${id}`, subjectId: id }],
    ...overrides,
  };
}

class FakeIdentityRepository {
  constructor(rows) { this.rows = new Map(rows.map((row) => [row.id, structuredClone(row)])); this.suggestions = new Map(); this.suggestionWrites = 0; this.applied = []; this.mutations = 0; this.tail = Promise.resolve(); }
  async readIdentitySnapshots(scope, ids) { return ids.map((id) => this.rows.get(id)).filter((row) => row?.workspaceId === scope).map((row) => structuredClone(row)); }
  async saveIdentitySuggestion(suggestion) {
    const key = `${suggestion.workspaceId}:${suggestion.ownerSubject}:${suggestion.id}`;
    const existing = this.suggestions.get(key);
    if (existing) {
      if (JSON.stringify(existing) !== JSON.stringify(suggestion)) throw new Error("identity_resolution_rejected");
      return structuredClone(existing);
    }
    this.suggestionWrites += 1;
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
    try { return await operation(this.#tx(scope)); } finally { release(); }
  }
  #tx(scope) {
    return {
      findByIdempotencyKey: async (key) => structuredClone(this.applied.find((entry) => entry.workspaceId === scope && entry.idempotencyKey === key)?.resolution ?? null),
      readIdentitySnapshots: async (ids) => ids.map((id) => this.rows.get(id)).filter((row) => row?.workspaceId === scope).map((row) => structuredClone(row)),
      applyResolution: async (resolution) => {
        this.mutations += 1;
        this.applied.push({ workspaceId: scope, idempotencyKey: resolution.idempotencyKey, resolution: structuredClone(resolution) });
        const affected = resolution.decision.kind === "merge"
          ? [resolution.decision.primaryId, ...resolution.decision.secondaryIds]
          : [resolution.decision.sourceId];
        for (const id of affected) this.rows.get(id).revision += 1;
        return structuredClone(resolution);
      },
    };
  }
  identitySnapshot() { return { rows: structuredClone([...this.rows.values()]), applied: structuredClone(this.applied), mutations: this.mutations }; }
  snapshot() { return { ...this.identitySnapshot(), suggestions: structuredClone([...this.suggestions.values()]), suggestionWrites: this.suggestionWrites }; }
}

async function apply(domain, repository, suggestion, decision, key = "identity-resolution-key-0001") {
  return domain.applyIdentityResolution(repository, owner, {
    workspaceId, suggestionId: suggestion.id, decision, expectedRevision: suggestion.revision, idempotencyKey: key,
  });
}

async function plan(domain, repository, input) {
  return domain.planIdentitySuggestion(repository, owner, input);
}

test("ambiguity is a non-authoritative proposal with bounded impact and no automatic mutation", async () => {
  const loaded = await load();
  try {
    const repository = new FakeIdentityRepository([identity("identity-alpha", 3), identity("identity-beta", 5)]);
    const before = repository.identitySnapshot();
    const [suggestion, replay] = await Promise.all([
      plan(loaded.domain, repository, { workspaceId, kind: "merge", candidateIds: ["identity-beta", "identity-alpha"] }),
      plan(loaded.domain, repository, { workspaceId, kind: "merge", candidateIds: ["identity-alpha", "identity-beta"] }),
    ]);
    assert.deepEqual(replay, suggestion, "concurrent creation converges on one persisted server-created suggestion");
    assert.deepEqual(suggestion.candidateIds, ["identity-alpha", "identity-beta"]);
    assert.deepEqual(suggestion.sourceLineageIds, ["source-identity-alpha", "source-identity-beta"]);
    assert.equal(suggestion.suppressionPreservationNotice, "preserve_all_existing_subject_references");
    assert.equal(suggestion.associationImpact.length, 2);
    assert.deepEqual(repository.identitySnapshot(), before, "suggestion persistence cannot merge identities, alter relevance, or mutate suppression references");
    assert.equal(repository.suggestionWrites, 1);
  } finally { await loaded.vite.close(); }
});

test("owner merge retains all lineage, aliases, scoped relevance, and suppression references while invalidating projections", async () => {
  const loaded = await load();
  try {
    const repository = new FakeIdentityRepository([
      identity("identity-alpha", 3),
      identity("identity-beta", 5, { associations: [{ id: "association-beta", workspaceId, scope: "customer_profile", relevanceId: "relevance-profile", subjectId: "identity-beta" }] }),
    ]);
    const suggestion = await plan(loaded.domain, repository, { workspaceId, kind: "merge", candidateIds: ["identity-alpha", "identity-beta"] });
    const result = await apply(loaded.domain, repository, suggestion, { kind: "merge", primaryId: "identity-alpha", secondaryIds: ["identity-beta"] });
    assert.deepEqual(result.retainedSourceLineageIds, ["source-identity-alpha", "source-identity-beta"]);
    assert.deepEqual(result.retainedIdentityLineageIds, ["identity-alpha", "identity-beta", "lineage-identity-alpha", "lineage-identity-beta"]);
    assert.deepEqual(result.retainedAliases, ["alias-identity-alpha", "alias-identity-beta"]);
    assert.deepEqual(result.retainedSuppressionSubjectRefs, ["suppression-identity-alpha", "suppression-identity-beta"]);
    assert.deepEqual(result.rePointedAssociationIds, ["association-beta", "association-identity-alpha"]);
    assert.deepEqual(result.invalidations.map((entry) => entry.projection), ["NeedsReview", "NeedsReview"]);
    assert.equal(repository.mutations, 1);
  } finally { await loaded.vite.close(); }
});

test("split is owner-only, preserves retained references, and projects moved associations NonContactable without historical deletion", async () => {
  const loaded = await load();
  try {
    const repository = new FakeIdentityRepository([identity("identity-alpha", 4)]);
    const acceptedProposal = await plan(loaded.domain, repository, { workspaceId, kind: "split", sourceId: "identity-alpha", newIdentityId: "identity-child", moveAssociationIds: ["association-identity-alpha"] });
    assert.deepEqual(acceptedProposal.candidateIds, ["identity-alpha"], "a split partitions one existing identity");
    assert.deepEqual(acceptedProposal.proposedPartition, { sourceId: "identity-alpha", newIdentityId: "identity-child", moveAssociationIds: ["association-identity-alpha"] });
    const result = await apply(loaded.domain, repository, acceptedProposal, { kind: "split", sourceId: "identity-alpha", newIdentityId: "identity-child", moveAssociationIds: ["association-identity-alpha"] });
    assert.deepEqual(result.invalidations, [{ associationId: "association-identity-alpha", projection: "NonContactable" }]);
    assert.deepEqual(result.retainedSuppressionSubjectRefs, ["suppression-identity-alpha"]);
    assert.equal(repository.rows.has("identity-alpha"), true, "the historical source identity remains available to the later persistence seam");
  } finally { await loaded.vite.close(); }
});

test("split rejects duplicate or nonexistent moved associations with zero durable mutation", async () => {
  const loaded = await load();
  try {
    const repository = new FakeIdentityRepository([identity("identity-alpha", 4)]);
    const suggestion = await plan(loaded.domain, repository, { workspaceId, kind: "split", sourceId: "identity-alpha", newIdentityId: "identity-child", moveAssociationIds: ["association-identity-alpha"] });
    const before = repository.snapshot();
    await assert.rejects(() => plan(loaded.domain, repository, { workspaceId, kind: "split", sourceId: "identity-alpha", newIdentityId: "identity-other", moveAssociationIds: ["association-missing"] }), /identity_resolution_rejected/);
    await assert.rejects(() => apply(loaded.domain, repository, suggestion, { kind: "split", sourceId: "identity-alpha", newIdentityId: "identity-child", moveAssociationIds: ["association-identity-alpha", "association-identity-alpha"] }, "identity-resolution-key-0006"), /identity_resolution_rejected/);
    await assert.rejects(() => apply(loaded.domain, repository, suggestion, { kind: "split", sourceId: "identity-alpha", newIdentityId: "identity-child", moveAssociationIds: ["association-missing"] }, "identity-resolution-key-0007"), /identity_resolution_rejected/);
    assert.deepEqual(repository.snapshot(), before, "a split may not silently drop an unknown association or mutate a partial graph");
  } finally { await loaded.vite.close(); }
});

test("malformed snapshot arrays and scoped associations fail closed without dropping lineage or mutating", async () => {
  const loaded = await load();
  try {
    const malformed = [
      { aliases: [""] },
      { aliases: ["alias-duplicate", "alias-duplicate"] },
      { sourceLineageIds: [] },
      { sourceLineageIds: ["source-duplicate", "source-duplicate"] },
      { identityLineageIds: [""] },
      { suppressionSubjectRefs: [""] },
      { suppressionSubjectRefs: ["suppression-duplicate", "suppression-duplicate"] },
      { associations: "not-an-array" },
      { associations: [{ id: "association-alpha", workspaceId: "synthetic-workspace-b", scope: "market_play", relevanceId: "relevance-alpha", subjectId: "identity-alpha" }] },
      { associations: [{ id: "association-alpha", workspaceId, scope: "unknown", relevanceId: "relevance-alpha", subjectId: "identity-alpha" }] },
      { associations: [{ id: "association-alpha", workspaceId, scope: "market_play", relevanceId: "", subjectId: "identity-alpha" }] },
      { associations: [{ id: "association-alpha", workspaceId, scope: "market_play", relevanceId: "relevance-alpha", subjectId: "" }] },
      { associations: [{ id: "association-alpha", workspaceId, scope: "market_play", relevanceId: "relevance-alpha", subjectId: "identity-beta" }] },
      { associations: [{ id: "association-alpha", workspaceId, scope: "market_play", relevanceId: "relevance-alpha", subjectId: "identity-alpha" }, { id: "association-alpha", workspaceId, scope: "market_play", relevanceId: "relevance-other", subjectId: "identity-alpha" }] },
    ];
    for (const overrides of malformed) {
      const repository = new FakeIdentityRepository([identity("identity-alpha", 3, overrides), identity("identity-beta", 4)]);
      const before = repository.snapshot();
      await assert.rejects(() => plan(loaded.domain, repository, { workspaceId, kind: "merge", candidateIds: ["identity-alpha", "identity-beta"] }), /identity_resolution_rejected/);
      assert.deepEqual(repository.snapshot(), before, "malformed snapshots cannot be normalized by dropping fields");
    }
    const repository = new FakeIdentityRepository([identity("identity-alpha", 3), identity("identity-beta", 4)]);
    const suggestion = await plan(loaded.domain, repository, { workspaceId, kind: "merge", candidateIds: ["identity-alpha", "identity-beta"] });
    repository.rows.get("identity-alpha").suppressionSubjectRefs = [""];
    const before = repository.snapshot();
    await assert.rejects(() => apply(loaded.domain, repository, suggestion, { kind: "merge", primaryId: "identity-alpha", secondaryIds: ["identity-beta"] }, "identity-resolution-key-0008"), /identity_resolution_rejected/);
    assert.deepEqual(repository.snapshot(), before, "a malformed current snapshot is denied before the transaction can apply a resolution");

    const currentRepository = new FakeIdentityRepository([identity("identity-alpha", 3), identity("identity-beta", 4)]);
    const currentSuggestion = await plan(loaded.domain, currentRepository, { workspaceId, kind: "merge", candidateIds: ["identity-alpha", "identity-beta"] });
    const current = currentRepository.rows.get("identity-alpha");
    current.sourceLineageIds = ["source-reconfirmed"];
    current.associations[0].relevanceId = "relevance-reconfirmed";
    current.revision += 1;
    const currentBefore = currentRepository.snapshot();
    await assert.rejects(() => apply(loaded.domain, currentRepository, currentSuggestion, { kind: "merge", primaryId: "identity-alpha", secondaryIds: ["identity-beta"] }, "identity-resolution-key-0009"), /identity_resolution_rejected/);
    assert.deepEqual(currentRepository.snapshot(), currentBefore, "candidate source and association impact previews are never authority without a current snapshot reread");
  } finally { await loaded.vite.close(); }
});

test("idempotent retry returns the original resolution; changed payload and concurrent stale decisions mutate once", async () => {
  const loaded = await load();
  try {
    const repository = new FakeIdentityRepository([identity("identity-alpha", 3), identity("identity-beta", 4)]);
    const suggestion = await plan(loaded.domain, repository, { workspaceId, kind: "merge", candidateIds: ["identity-alpha", "identity-beta"] });
    const decision = { kind: "merge", primaryId: "identity-alpha", secondaryIds: ["identity-beta"] };
    const [first, replay] = await Promise.all([
      apply(loaded.domain, repository, suggestion, decision, "identity-resolution-key-0002"),
      apply(loaded.domain, repository, suggestion, decision, "identity-resolution-key-0002"),
    ]);
    assert.deepEqual(replay, first); assert.equal(repository.mutations, 1);
    await assert.rejects(() => apply(loaded.domain, repository, suggestion, { kind: "merge", primaryId: "identity-beta", secondaryIds: ["identity-alpha"] }, "identity-resolution-key-0002"), /identity_resolution_rejected/);
    await assert.rejects(() => apply(loaded.domain, repository, suggestion, decision, "identity-resolution-key-0003"), /identity_resolution_rejected/, "the original suggestion revision is stale after the first decision");
    assert.equal(repository.mutations, 1);
  } finally { await loaded.vite.close(); }
});

test("apply reloads an owner-scoped persisted suggestion and rejects absent or forged evidence with zero identity mutation", async () => {
  const loaded = await load();
  try {
    const repository = new FakeIdentityRepository([identity("identity-alpha", 3), identity("identity-beta", 4)]);
    const suggestion = await plan(loaded.domain, repository, { workspaceId, kind: "merge", candidateIds: ["identity-alpha", "identity-beta"] });
    const decision = { kind: "merge", primaryId: "identity-alpha", secondaryIds: ["identity-beta"] };
    const before = repository.identitySnapshot();
    await assert.rejects(() => loaded.domain.applyIdentityResolution(repository, owner, {
      workspaceId, suggestionId: "a".repeat(64), decision, expectedRevision: suggestion.revision, idempotencyKey: "identity-resolution-absent-0001",
    }), /identity_resolution_rejected/);
    await assert.rejects(() => loaded.domain.applyIdentityResolution(repository, { subject: "synthetic-other-owner", admittedOwner: true }, {
      workspaceId, suggestionId: suggestion.id, decision, expectedRevision: suggestion.revision, idempotencyKey: "identity-resolution-other-owner-0001",
    }), /identity_resolution_rejected/);
    await assert.rejects(() => loaded.domain.applyIdentityResolution(repository, owner, {
      workspaceId: "synthetic-workspace-b", suggestionId: suggestion.id, decision, expectedRevision: suggestion.revision, idempotencyKey: "identity-resolution-other-workspace-0001",
    }), /identity_resolution_rejected/);
    const key = `${workspaceId}:${owner.subject}:${suggestion.id}`;
    const forged = structuredClone(suggestion);
    forged.sourceLineageIds = ["source-forged"];
    repository.suggestions.set(key, forged);
    await assert.rejects(() => loaded.domain.applyIdentityResolution(repository, owner, {
      workspaceId, suggestionId: suggestion.id, decision, expectedRevision: suggestion.revision, idempotencyKey: "identity-resolution-forged-0001",
    }), /identity_resolution_rejected/);
    assert.deepEqual(repository.identitySnapshot(), before, "absent or digest-mismatched persisted suggestions cannot change the identity graph");
  } finally { await loaded.vite.close(); }
});

test("cross-workspace, non-owner, forged revision, and reject-only production composition leave durable state untouched", async () => {
  const loaded = await load();
  try {
    const foreign = identity("identity-foreign", 1, { workspaceId: "synthetic-workspace-b" });
    const repository = new FakeIdentityRepository([identity("identity-alpha", 3), identity("identity-beta", 4), foreign]);
    const before = repository.identitySnapshot();
    await assert.rejects(() => plan(loaded.domain, repository, { workspaceId, kind: "merge", candidateIds: ["identity-alpha", "identity-foreign"] }), /identity_resolution_rejected/);
    const suggestion = await plan(loaded.domain, repository, { workspaceId, kind: "merge", candidateIds: ["identity-alpha", "identity-beta"] });
    await assert.rejects(() => loaded.domain.applyIdentityResolution(repository, { subject: "denied-user", admittedOwner: false }, { workspaceId, suggestionId: suggestion.id, decision: { kind: "merge", primaryId: "identity-alpha", secondaryIds: ["identity-beta"] }, expectedRevision: suggestion.revision, idempotencyKey: "identity-resolution-key-0004" }), /identity_resolution_rejected/);
    await assert.rejects(() => loaded.domain.applyIdentityResolution(repository, owner, { workspaceId, suggestionId: suggestion.id, decision: { kind: "merge", primaryId: "identity-alpha", secondaryIds: ["identity-beta"] }, expectedRevision: suggestion.revision + 1, idempotencyKey: "identity-resolution-key-0005" }), /identity_resolution_rejected/);
    await assert.rejects(() => plan(loaded.domain, loaded.domain.unavailableIdentityResolutionRepository, { workspaceId, kind: "merge", candidateIds: ["identity-alpha", "identity-beta"] }), /identity_resolution_rejected/);
    assert.deepEqual(repository.identitySnapshot(), before, "denials cannot mutate identities, associations, projections, or suppression references");
  } finally { await loaded.vite.close(); }
});
