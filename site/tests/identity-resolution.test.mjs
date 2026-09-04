import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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
        if (resolution.decision.kind === "merge") {
          const ids = [resolution.decision.primaryId, ...resolution.decision.secondaryIds];
          const primary = this.rows.get(resolution.decision.primaryId);
          const rows = ids.map((id) => this.rows.get(id));
          primary.aliases = [...new Set(rows.flatMap((row) => row.aliases))].sort();
          primary.sourceLineageIds = [...new Set(rows.flatMap((row) => row.sourceLineageIds))].sort();
          primary.identityLineageIds = [...new Set(rows.flatMap((row) => [row.id, ...row.identityLineageIds]))].sort();
          primary.suppressionSubjectRefs = [...new Set(rows.flatMap((row) => row.suppressionSubjectRefs))].sort();
          primary.associations = rows.flatMap((row) => row.associations).map((association) => ({ ...association, subjectId: primary.id }));
          primary.revision += 1;
        } else {
          const source = this.rows.get(resolution.decision.sourceId);
          const movedIds = new Set(resolution.decision.moveAssociationIds);
          const moved = source.associations.filter((association) => movedIds.has(association.id));
          source.associations = source.associations.filter((association) => !movedIds.has(association.id));
          source.revision += 1;
          this.rows.set(resolution.decision.newIdentityId, {
            id: resolution.decision.newIdentityId,
            workspaceId: scope,
            revision: 1,
            aliases: [],
            sourceLineageIds: [...source.sourceLineageIds],
            identityLineageIds: [...new Set([source.id, ...source.identityLineageIds])].sort(),
            suppressionSubjectRefs: [...source.suppressionSubjectRefs],
            associations: moved.map((association) => ({ ...association, subjectId: resolution.decision.newIdentityId })),
          });
        }
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

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function digest(value) {
  return createHash("sha256").update(stable(value)).digest("hex");
}

function assertDeepFrozen(value, seen = new Set()) {
  if (value === null || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  assert.equal(Object.isFrozen(value), true, "every returned suggestion object, row, array, and revision map is immutable");
  for (const nested of Object.values(value)) assertDeepFrozen(nested, seen);
}

function resignResolution(record) {
  const appliedMaterial = {
    workspaceId: record.workspaceId,
    ownerSubject: record.ownerSubject,
    suggestionId: record.suggestionId,
    suggestionDigest: record.suggestionDigest,
    idempotencyKey: record.idempotencyKey,
    decision: record.decision,
    operationDigest: record.operationDigest,
    retainedSourceLineageIds: record.retainedSourceLineageIds,
    retainedIdentityLineageIds: record.retainedIdentityLineageIds,
    retainedAliases: record.retainedAliases,
    retainedSuppressionSubjectRefs: record.retainedSuppressionSubjectRefs,
    rePointedAssociationIds: record.rePointedAssociationIds,
    invalidations: record.invalidations,
  };
  record.resultDigest = digest({ schema: "identity-resolution-result/v1", ...appliedMaterial });
  record.id = digest({
    operationDigest: record.operationDigest,
    idempotencyKey: record.idempotencyKey,
    resultDigest: record.resultDigest,
  });
  return record;
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
    assert.deepEqual(suggestion.retainedIdentityLineageIds, [
      "identity-alpha",
      "identity-beta",
      "lineage-identity-alpha",
      "lineage-identity-beta",
    ]);
    assert.deepEqual(suggestion.retainedAliases, ["alias-identity-alpha", "alias-identity-beta"]);
    assert.deepEqual(suggestion.retainedSuppressionSubjectRefs, ["suppression-identity-alpha", "suppression-identity-beta"]);
    assert.equal(suggestion.suppressionPreservationNotice, "preserve_all_existing_subject_references");
    assert.equal(suggestion.associationImpact.length, 2);
    assertDeepFrozen(suggestion);
    assertDeepFrozen(replay);
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
    const acceptedProposal = await plan(loaded.domain, repository, { workspaceId, kind: "split", sourceId: "identity-alpha", moveAssociationIds: ["association-identity-alpha"] });
    assert.deepEqual(acceptedProposal.candidateIds, ["identity-alpha"], "a split partitions one existing identity");
    assert.equal(acceptedProposal.proposedPartition.sourceId, "identity-alpha");
    assert.deepEqual(acceptedProposal.proposedPartition.moveAssociationIds, ["association-identity-alpha"]);
    assert.match(acceptedProposal.proposedPartition.newIdentityId, /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assertDeepFrozen(acceptedProposal);
    const result = await apply(loaded.domain, repository, acceptedProposal, { kind: "split", sourceId: "identity-alpha", moveAssociationIds: ["association-identity-alpha"] });
    assert.deepEqual(result.invalidations, [{ associationId: "association-identity-alpha", projection: "NonContactable" }]);
    assert.deepEqual(result.retainedSuppressionSubjectRefs, ["suppression-identity-alpha"]);
    assert.equal(result.decision.newIdentityId, acceptedProposal.proposedPartition.newIdentityId);
    assert.equal(repository.rows.has("identity-alpha"), true, "the historical source identity remains available to the later persistence seam");
    assert.equal(repository.rows.has(result.decision.newIdentityId), true, "the server-created destination is persisted");
    assert.deepEqual(repository.rows.get("identity-alpha").associations, []);
    assert.deepEqual(repository.rows.get(result.decision.newIdentityId).associations.map((association) => association.subjectId), [result.decision.newIdentityId]);
    assert.deepEqual(repository.rows.get(result.decision.newIdentityId).suppressionSubjectRefs, ["suppression-identity-alpha"]);
  } finally { await loaded.vite.close(); }
});

test("split rejects duplicate or nonexistent moved associations with zero durable mutation", async () => {
  const loaded = await load();
  try {
    const repository = new FakeIdentityRepository([identity("identity-alpha", 4)]);
    const suggestion = await plan(loaded.domain, repository, { workspaceId, kind: "split", sourceId: "identity-alpha", moveAssociationIds: ["association-identity-alpha"] });
    const before = repository.snapshot();
    await assert.rejects(() => plan(loaded.domain, repository, { workspaceId, kind: "split", sourceId: "identity-alpha", newIdentityId: "identity-other", moveAssociationIds: ["association-missing"] }), /identity_resolution_rejected/);
    await assert.rejects(() => apply(loaded.domain, repository, suggestion, { kind: "split", sourceId: "identity-alpha", newIdentityId: "identity-child", moveAssociationIds: ["association-identity-alpha"] }, "identity-resolution-key-0005"), /identity_resolution_rejected/);
    await assert.rejects(() => apply(loaded.domain, repository, suggestion, { kind: "split", sourceId: "identity-alpha", moveAssociationIds: ["association-identity-alpha", "association-identity-alpha"] }, "identity-resolution-key-0006"), /identity_resolution_rejected/);
    await assert.rejects(() => apply(loaded.domain, repository, suggestion, { kind: "split", sourceId: "identity-alpha", moveAssociationIds: ["association-missing"] }, "identity-resolution-key-0007"), /identity_resolution_rejected/);
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

test("sparse or descriptor-malformed snapshot arrays reject before suggestion persistence or resolution mutation", async () => {
  const loaded = await load();
  try {
    let getterCalls = 0;
    const sparseOne = () => new Array(1);
    const withExtra = (values) => {
      const array = [...values];
      Object.defineProperty(array, "untrustedMetadata", {
        value: "must-not-be-normalized",
        enumerable: true,
      });
      return array;
    };
    const withAccessor = (value) => {
      const array = [];
      Object.defineProperty(array, "0", {
        get() {
          getterCalls += 1;
          return value;
        },
        enumerable: true,
      });
      return array;
    };
    const withCustomPrototype = (values) => {
      const array = [...values];
      Object.setPrototypeOf(array, Object.create(Array.prototype));
      return array;
    };
    const rows = () => [identity("identity-alpha", 3), identity("identity-beta", 4)];
    const malformedCases = [
      ["top-level hole", () => {
        const value = new Array(2);
        value[0] = identity("identity-alpha", 3);
        return value;
      }],
      ["top-level extra property", () => withExtra(rows())],
      ["top-level accessor", () => {
        const value = withAccessor(identity("identity-alpha", 3));
        value.length = 2;
        Object.defineProperty(value, "1", {
          value: identity("identity-beta", 4),
          enumerable: true,
        });
        return value;
      }],
      ["top-level custom prototype", () => withCustomPrototype(rows())],
      ["aliases hole", () => {
        const value = rows();
        value[0].aliases = sparseOne();
        return value;
      }],
      ["aliases extra property", () => {
        const value = rows();
        value[0].aliases = withExtra(value[0].aliases);
        return value;
      }],
      ["source lineage hole", () => {
        const value = rows();
        value[0].sourceLineageIds = sparseOne();
        return value;
      }],
      ["identity lineage hole", () => {
        const value = rows();
        value[0].identityLineageIds = sparseOne();
        return value;
      }],
      ["suppression reference hole", () => {
        const value = rows();
        value[0].suppressionSubjectRefs = sparseOne();
        return value;
      }],
      ["association hole", () => {
        const value = rows();
        value[0].associations = sparseOne();
        return value;
      }],
      ["association array accessor", () => {
        const value = rows();
        value[0].associations = withAccessor(value[0].associations[0]);
        return value;
      }],
      ["association array extra property", () => {
        const value = rows();
        value[0].associations = withExtra(value[0].associations);
        return value;
      }],
      ["association object accessor", () => {
        const value = rows();
        const association = { ...value[0].associations[0] };
        Object.defineProperty(association, "relevanceId", {
          get() {
            getterCalls += 1;
            return "relevance-identity-alpha";
          },
          enumerable: true,
        });
        value[0].associations = [association];
        return value;
      }],
    ];
    for (const [name, makeSnapshots] of malformedCases) {
      const repository = new FakeIdentityRepository(rows());
      const before = repository.identitySnapshot();
      repository.readIdentitySnapshots = async () => makeSnapshots();
      await assert.rejects(
        () => plan(loaded.domain, repository, {
          workspaceId,
          kind: "merge",
          candidateIds: ["identity-alpha", "identity-beta"],
        }),
        /identity_resolution_rejected/,
        name,
      );
      assert.equal(repository.suggestionWrites, 0, `${name} cannot be normalized into a persisted suggestion`);
      assert.deepEqual(repository.identitySnapshot(), before, `${name} cannot mutate the identity graph`);
    }
    assert.equal(getterCalls, 0, "snapshot validation inspects descriptors without invoking untrusted accessors");

    const repository = new FakeIdentityRepository(rows());
    const suggestion = await plan(loaded.domain, repository, {
      workspaceId,
      kind: "merge",
      candidateIds: ["identity-alpha", "identity-beta"],
    });
    repository.rows.get("identity-alpha").identityLineageIds = sparseOne();
    const beforeApply = repository.identitySnapshot();
    await assert.rejects(
      () => apply(
        loaded.domain,
        repository,
        suggestion,
        { kind: "merge", primaryId: "identity-alpha", secondaryIds: ["identity-beta"] },
        "identity-resolution-sparse-current-0001",
      ),
      /identity_resolution_rejected/,
    );
    assert.equal(repository.mutations, 0, "a sparse current snapshot is rejected before the transaction applies a resolution");
    assert.deepEqual(repository.identitySnapshot(), beforeApply);
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

test("idempotent replay rejects self-consistent records that drop pre-decision preservation authority", async () => {
  const loaded = await load();
  try {
    const repository = new FakeIdentityRepository([identity("identity-alpha", 3), identity("identity-beta", 4)]);
    const suggestion = await plan(loaded.domain, repository, { workspaceId, kind: "merge", candidateIds: ["identity-alpha", "identity-beta"] });
    const decision = { kind: "merge", primaryId: "identity-alpha", secondaryIds: ["identity-beta"] };
    const idempotencyKey = "identity-resolution-preservation-replay-0001";
    const original = await apply(loaded.domain, repository, suggestion, decision, idempotencyKey);
    const mutations = [
      (record) => { record.retainedAliases = ["alias-identity-alpha"]; },
      (record) => { record.retainedSourceLineageIds = ["source-identity-alpha"]; },
      (record) => { record.retainedIdentityLineageIds = ["identity-alpha", "identity-beta"]; },
      (record) => { record.retainedSuppressionSubjectRefs = ["suppression-identity-alpha"]; },
    ];
    for (const mutate of mutations) {
      const forged = structuredClone(original);
      mutate(forged);
      repository.applied[0].resolution = resignResolution(forged);
      await assert.rejects(
        () => apply(loaded.domain, repository, suggestion, decision, idempotencyKey),
        /identity_resolution_rejected/,
        "a recomputed result digest and id cannot erase preservation authority",
      );
    }
    repository.applied[0].resolution = structuredClone(original);
    assert.deepEqual(
      await apply(loaded.domain, repository, suggestion, decision, idempotencyKey),
      original,
      "the exact same-key replay remains safe",
    );
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
