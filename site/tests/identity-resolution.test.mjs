import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";

const workspaceId = "synthetic-workspace-a";

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
  constructor(rows) { this.rows = new Map(rows.map((row) => [row.id, structuredClone(row)])); this.applied = []; this.mutations = 0; this.tail = Promise.resolve(); }
  async readIdentitySnapshots(scope, ids) { return ids.map((id) => this.rows.get(id)).filter((row) => row?.workspaceId === scope).map((row) => structuredClone(row)); }
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
  snapshot() { return { rows: structuredClone([...this.rows.values()]), applied: structuredClone(this.applied), mutations: this.mutations }; }
}

async function apply(domain, repository, suggestion, decision, key = "identity-resolution-key-0001") {
  return domain.applyIdentityResolution(repository, { subject: "synthetic-owner", admittedOwner: true }, {
    workspaceId, suggestion, decision, expectedRevision: suggestion.revision, idempotencyKey: key,
  });
}

test("ambiguity is a non-authoritative proposal with bounded impact and no automatic mutation", async () => {
  const loaded = await load();
  try {
    const repository = new FakeIdentityRepository([identity("identity-alpha", 3), identity("identity-beta", 5)]);
    const before = repository.snapshot();
    const suggestion = await loaded.domain.planIdentitySuggestion(repository, { workspaceId, kind: "merge", candidateIds: ["identity-beta", "identity-alpha"] });
    assert.deepEqual(suggestion.candidateIds, ["identity-alpha", "identity-beta"]);
    assert.deepEqual(suggestion.sourceLineageIds, ["source-identity-alpha", "source-identity-beta"]);
    assert.equal(suggestion.suppressionPreservationNotice, "preserve_all_existing_subject_references");
    assert.equal(suggestion.associationImpact.length, 2);
    assert.deepEqual(repository.snapshot(), before, "a suggestion cannot merge identities, alter relevance, or mutate suppression references");
  } finally { await loaded.vite.close(); }
});

test("owner merge retains all lineage, aliases, scoped relevance, and suppression references while invalidating projections", async () => {
  const loaded = await load();
  try {
    const repository = new FakeIdentityRepository([
      identity("identity-alpha", 3),
      identity("identity-beta", 5, { associations: [{ id: "association-beta", workspaceId, scope: "customer_profile", relevanceId: "relevance-profile", subjectId: "identity-beta" }] }),
    ]);
    const suggestion = await loaded.domain.planIdentitySuggestion(repository, { workspaceId, kind: "merge", candidateIds: ["identity-alpha", "identity-beta"] });
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
    const suggestion = await loaded.domain.planIdentitySuggestion(repository, { workspaceId, kind: "split", candidateIds: ["identity-alpha", "identity-beta"] }).catch(() => null);
    assert.equal(suggestion, null, "a split still needs two existing ambiguous candidates; no identity is invented by planning");
    const proposal = await loaded.domain.planIdentitySuggestion(repository, { workspaceId, kind: "split", candidateIds: ["identity-alpha", "identity-gamma"] }).catch(() => null);
    assert.equal(proposal, null);
    const second = identity("identity-beta", 2);
    repository.rows.set(second.id, second);
    const acceptedProposal = await loaded.domain.planIdentitySuggestion(repository, { workspaceId, kind: "split", candidateIds: ["identity-alpha", "identity-beta"] });
    const result = await apply(loaded.domain, repository, acceptedProposal, { kind: "split", sourceId: "identity-alpha", newIdentityId: "identity-child", moveAssociationIds: ["association-identity-alpha"] });
    assert.deepEqual(result.invalidations, [{ associationId: "association-identity-alpha", projection: "NonContactable" }]);
    assert.deepEqual(result.retainedSuppressionSubjectRefs, ["suppression-identity-alpha", "suppression-identity-beta"]);
    assert.equal(repository.rows.has("identity-alpha"), true, "the historical source identity remains available to the later persistence seam");
  } finally { await loaded.vite.close(); }
});

test("idempotent retry returns the original resolution; changed payload and concurrent stale decisions mutate once", async () => {
  const loaded = await load();
  try {
    const repository = new FakeIdentityRepository([identity("identity-alpha", 3), identity("identity-beta", 4)]);
    const suggestion = await loaded.domain.planIdentitySuggestion(repository, { workspaceId, kind: "merge", candidateIds: ["identity-alpha", "identity-beta"] });
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

test("cross-workspace, non-owner, forged revision, and reject-only production composition leave durable state untouched", async () => {
  const loaded = await load();
  try {
    const foreign = identity("identity-foreign", 1, { workspaceId: "synthetic-workspace-b" });
    const repository = new FakeIdentityRepository([identity("identity-alpha", 3), identity("identity-beta", 4), foreign]);
    const before = repository.snapshot();
    await assert.rejects(() => loaded.domain.planIdentitySuggestion(repository, { workspaceId, kind: "merge", candidateIds: ["identity-alpha", "identity-foreign"] }), /identity_resolution_rejected/);
    const suggestion = await loaded.domain.planIdentitySuggestion(repository, { workspaceId, kind: "merge", candidateIds: ["identity-alpha", "identity-beta"] });
    await assert.rejects(() => loaded.domain.applyIdentityResolution(repository, { subject: "denied-user", admittedOwner: false }, { workspaceId, suggestion, decision: { kind: "merge", primaryId: "identity-alpha", secondaryIds: ["identity-beta"] }, expectedRevision: suggestion.revision, idempotencyKey: "identity-resolution-key-0004" }), /identity_resolution_rejected/);
    await assert.rejects(() => loaded.domain.applyIdentityResolution(repository, { subject: "synthetic-owner", admittedOwner: true }, { workspaceId, suggestion, decision: { kind: "merge", primaryId: "identity-alpha", secondaryIds: ["identity-beta"] }, expectedRevision: suggestion.revision + 1, idempotencyKey: "identity-resolution-key-0005" }), /identity_resolution_rejected/);
    await assert.rejects(() => loaded.domain.planIdentitySuggestion(loaded.domain.unavailableIdentityResolutionRepository, { workspaceId, kind: "merge", candidateIds: ["identity-alpha", "identity-beta"] }), /identity_resolution_rejected/);
    assert.deepEqual(repository.snapshot(), before, "denials cannot mutate identities, associations, projections, or suppression references");
  } finally { await loaded.vite.close(); }
});
