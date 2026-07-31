import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";

const workspaceId = "synthetic-workspace-a";

async function load() {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  return {
    vite,
    domain: await vite.ssrLoadModule(
      new URL("../domain/identity-resolution.ts", import.meta.url).pathname,
    ),
  };
}

function identity(id, revision = 1) {
  return {
    id,
    workspaceId,
    revision,
    aliases: [`alias-${id}`],
    sourceLineageIds: [`source-${id}`],
    identityLineageIds: [`lineage-${id}`],
    suppressionSubjectRefs: [`suppression-${id}`],
    associations: [{
      id: `association-${id}`,
      workspaceId,
      scope: "market_play",
      relevanceId: `relevance-${id}`,
      subjectId: id,
    }],
  };
}

class OuterSnapshotRepository {
  constructor(rows) {
    this.rows = new Map(rows.map((row) => [row.id, structuredClone(row)]));
    this.suggestions = new Map();
    this.applied = new Map();
    this.snapshotReads = 0;
    this.suggestionWrites = 0;
    this.suggestionReads = 0;
    this.transactionCalls = 0;
    this.applyCalls = 0;
    this.snapshotArguments = [];
    this.suggestionReadArguments = [];
    this.transactionScopes = [];
    this.lookupKeys = [];
    this.onSnapshotRead = null;
    this.onSuggestionRead = null;
    this.onTransaction = null;
  }

  async readIdentitySnapshots(scope, ids) {
    this.snapshotReads += 1;
    this.snapshotArguments.push([scope, [...ids]]);
    this.onSnapshotRead?.();
    return ids
      .map((id) => this.rows.get(id))
      .filter((row) => row?.workspaceId === scope)
      .map((row) => structuredClone(row));
  }

  async saveIdentitySuggestion(suggestion) {
    this.suggestionWrites += 1;
    const copy = structuredClone(suggestion);
    this.suggestions.set(`${suggestion.workspaceId}:${suggestion.ownerSubject}:${suggestion.id}`, copy);
    return structuredClone(copy);
  }

  async readIdentitySuggestion(scope, subject, suggestionId) {
    this.suggestionReads += 1;
    this.suggestionReadArguments.push([scope, subject, suggestionId]);
    this.onSuggestionRead?.();
    return structuredClone(this.suggestions.get(`${scope}:${subject}:${suggestionId}`) ?? null);
  }

  async transaction(scope, operation) {
    this.transactionCalls += 1;
    this.transactionScopes.push(scope);
    this.onTransaction?.();
    return operation({
      findByIdempotencyKey: async (key) => {
        this.lookupKeys.push(key);
        return structuredClone(this.applied.get(`${scope}:${key}`) ?? null);
      },
      readIdentitySnapshots: async (ids) => ids
        .map((id) => this.rows.get(id))
        .filter((row) => row?.workspaceId === scope)
        .map((row) => structuredClone(row)),
      applyResolution: async (resolution) => {
        this.applyCalls += 1;
        const copy = structuredClone(resolution);
        this.applied.set(`${scope}:${resolution.idempotencyKey}`, copy);
        return structuredClone(copy);
      },
    });
  }
}

function accessorCopy(value, key, onGet) {
  const copy = { ...value };
  delete copy[key];
  Object.defineProperty(copy, key, {
    get: onGet,
    enumerable: true,
  });
  return copy;
}

function accessorArray(value, onGet) {
  const copy = [...value];
  Object.defineProperty(copy, "0", {
    get: onGet,
    enumerable: true,
  });
  return copy;
}

function assertNoEffect(repository, label) {
  assert.equal(repository.snapshotReads, 0, `${label}: no snapshot read`);
  assert.equal(repository.suggestionReads, 0, `${label}: no suggestion read`);
  assert.equal(repository.suggestionWrites, 0, `${label}: no suggestion write`);
  assert.equal(repository.transactionCalls, 0, `${label}: no transaction`);
  assert.equal(repository.applyCalls, 0, `${label}: no resolution mutation`);
}

test("plan snapshots every principal and merge/split input field before repository I/O", async () => {
  const loaded = await load();
  try {
    const mergeRepository = new OuterSnapshotRepository([
      identity("identity-alpha", 3),
      identity("identity-beta", 4),
    ]);
    const mergePrincipal = { subject: "synthetic-owner", admittedOwner: true };
    const mergeInput = {
      workspaceId,
      kind: "merge",
      candidateIds: ["identity-alpha", "identity-beta"],
    };
    mergeRepository.onSnapshotRead = () => {
      mergePrincipal.subject = "mutated-owner";
      mergePrincipal.admittedOwner = false;
      mergeInput.workspaceId = "synthetic-workspace-mutated";
      mergeInput.kind = "split";
      mergeInput.candidateIds[0] = "identity-forged";
    };
    const merge = await loaded.domain.planIdentitySuggestion(
      mergeRepository,
      mergePrincipal,
      mergeInput,
    );
    assert.equal(merge.ownerSubject, "synthetic-owner");
    assert.equal(merge.workspaceId, workspaceId);
    assert.equal(merge.kind, "merge");
    assert.deepEqual(merge.candidateIds, ["identity-alpha", "identity-beta"]);
    assert.deepEqual(
      mergeRepository.snapshotArguments,
      [[workspaceId, ["identity-alpha", "identity-beta"]]],
    );
    assert.equal(Object.isFrozen(merge), true);
    assert.equal(Object.isFrozen(merge.candidateIds), true);
    assert.equal(mergeRepository.suggestionWrites, 1);

    const splitRepository = new OuterSnapshotRepository([identity("identity-alpha", 3)]);
    const splitPrincipal = { subject: "synthetic-owner", admittedOwner: true };
    const splitInput = {
      workspaceId,
      kind: "split",
      sourceId: "identity-alpha",
      moveAssociationIds: ["association-identity-alpha"],
    };
    splitRepository.onSnapshotRead = () => {
      splitPrincipal.subject = "mutated-owner";
      splitPrincipal.admittedOwner = false;
      splitInput.workspaceId = "synthetic-workspace-mutated";
      splitInput.kind = "merge";
      splitInput.sourceId = "identity-forged";
      splitInput.moveAssociationIds[0] = "association-forged";
    };
    const split = await loaded.domain.planIdentitySuggestion(
      splitRepository,
      splitPrincipal,
      splitInput,
    );
    assert.equal(split.ownerSubject, "synthetic-owner");
    assert.equal(split.workspaceId, workspaceId);
    assert.equal(split.kind, "split");
    assert.equal(split.proposedPartition.sourceId, "identity-alpha");
    assert.deepEqual(
      split.proposedPartition.moveAssociationIds,
      ["association-identity-alpha"],
    );
    assert.equal(Object.isFrozen(split.proposedPartition), true);
    assert.equal(Object.isFrozen(split.proposedPartition.moveAssociationIds), true);
    assert.equal(splitRepository.suggestionWrites, 1);
  } finally {
    await loaded.vite.close();
  }
});

test("plan rejects accessor, proxy, extra-key, and non-dense outer authority before any repository effect", async () => {
  const loaded = await load();
  try {
    let getterCalls = 0;
    const getter = () => {
      getterCalls += 1;
      return "forged";
    };
    const principal = { subject: "synthetic-owner", admittedOwner: true };
    const merge = {
      workspaceId,
      kind: "merge",
      candidateIds: ["identity-alpha", "identity-beta"],
    };
    const split = {
      workspaceId,
      kind: "split",
      sourceId: "identity-alpha",
      moveAssociationIds: ["association-identity-alpha"],
    };
    const sparseCandidates = new Array(2);
    sparseCandidates[0] = "identity-alpha";
    const sparseMoveIds = new Array(1);
    const cases = [
      ["principal subject accessor", accessorCopy(principal, "subject", getter), merge],
      ["principal admission accessor", accessorCopy(principal, "admittedOwner", getter), merge],
      ["principal proxy", new Proxy(principal, {}), merge],
      ["merge workspace accessor", principal, accessorCopy(merge, "workspaceId", getter)],
      ["merge kind accessor", principal, accessorCopy(merge, "kind", getter)],
      ["merge candidate-list accessor", principal, accessorCopy(merge, "candidateIds", getter)],
      ["merge candidate element accessor", principal, { ...merge, candidateIds: accessorArray(merge.candidateIds, getter) }],
      ["merge sparse candidates", principal, { ...merge, candidateIds: sparseCandidates }],
      ["merge input proxy", principal, new Proxy(merge, {})],
      ["merge candidate proxy", principal, { ...merge, candidateIds: new Proxy(merge.candidateIds, {}) }],
      ["merge extra key", principal, { ...merge, newIdentityId: "identity-forged" }],
      ["split workspace accessor", principal, accessorCopy(split, "workspaceId", getter)],
      ["split kind accessor", principal, accessorCopy(split, "kind", getter)],
      ["split source accessor", principal, accessorCopy(split, "sourceId", getter)],
      ["split move-list accessor", principal, accessorCopy(split, "moveAssociationIds", getter)],
      ["split move element accessor", principal, { ...split, moveAssociationIds: accessorArray(split.moveAssociationIds, getter) }],
      ["split sparse moves", principal, { ...split, moveAssociationIds: sparseMoveIds }],
      ["split input proxy", principal, new Proxy(split, {})],
      ["split move-list proxy", principal, { ...split, moveAssociationIds: new Proxy(split.moveAssociationIds, {}) }],
      ["split client destination", principal, { ...split, newIdentityId: "identity-forged" }],
    ];
    for (const [label, candidatePrincipal, candidateInput] of cases) {
      const repository = new OuterSnapshotRepository([
        identity("identity-alpha", 3),
        identity("identity-beta", 4),
      ]);
      await assert.rejects(
        () => loaded.domain.planIdentitySuggestion(
          repository,
          candidatePrincipal,
          candidateInput,
        ),
        /identity_resolution_rejected/,
        label,
      );
      assertNoEffect(repository, label);
    }
    assert.equal(getterCalls, 0, "descriptor validation never invokes outer or nested accessors");
  } finally {
    await loaded.vite.close();
  }
});

test("apply uses one immutable snapshot of every outer scalar across all repository awaits", async () => {
  const loaded = await load();
  try {
    const repository = new OuterSnapshotRepository([
      identity("identity-alpha", 3),
      identity("identity-beta", 4),
    ]);
    const planned = await loaded.domain.planIdentitySuggestion(
      repository,
      { subject: "synthetic-owner", admittedOwner: true },
      { workspaceId, kind: "merge", candidateIds: ["identity-alpha", "identity-beta"] },
    );
    const principal = { subject: "synthetic-owner", admittedOwner: true };
    const input = {
      workspaceId,
      suggestionId: planned.id,
      decision: {
        kind: "merge",
        primaryId: "identity-alpha",
        secondaryIds: ["identity-beta"],
      },
      expectedRevision: planned.revision,
      idempotencyKey: "identity-outer-snapshot-0001",
    };
    const mutateCallerAuthority = () => {
      principal.subject = "mutated-owner";
      principal.admittedOwner = false;
      input.workspaceId = "synthetic-workspace-mutated";
      input.suggestionId = "suggestion-forged";
      input.decision.kind = "split";
      input.decision.primaryId = "identity-beta";
      input.decision.secondaryIds[0] = "identity-alpha";
      input.expectedRevision = planned.revision + 1;
      input.idempotencyKey = "identity-outer-snapshot-forged";
    };
    repository.onSuggestionRead = mutateCallerAuthority;
    repository.onTransaction = mutateCallerAuthority;

    const result = await loaded.domain.applyIdentityResolution(
      repository,
      principal,
      input,
    );
    assert.equal(result.workspaceId, workspaceId);
    assert.equal(result.ownerSubject, "synthetic-owner");
    assert.equal(result.suggestionId, planned.id);
    assert.equal(result.idempotencyKey, "identity-outer-snapshot-0001");
    assert.deepEqual(result.decision, {
      kind: "merge",
      primaryId: "identity-alpha",
      secondaryIds: ["identity-beta"],
    });
    assert.deepEqual(
      repository.suggestionReadArguments,
      [[workspaceId, "synthetic-owner", planned.id]],
    );
    assert.deepEqual(repository.transactionScopes, [workspaceId]);
    assert.deepEqual(repository.lookupKeys, ["identity-outer-snapshot-0001"]);
    assert.equal(repository.applyCalls, 1);
  } finally {
    await loaded.vite.close();
  }
});

test("apply rejects accessor, proxy, extra-key, and nested exotic authority before reads or mutation", async () => {
  const loaded = await load();
  try {
    const setup = async () => {
      const repository = new OuterSnapshotRepository([
        identity("identity-alpha", 3),
        identity("identity-beta", 4),
      ]);
      const planned = await loaded.domain.planIdentitySuggestion(
        repository,
        { subject: "synthetic-owner", admittedOwner: true },
        { workspaceId, kind: "merge", candidateIds: ["identity-alpha", "identity-beta"] },
      );
      repository.snapshotReads = 0;
      repository.suggestionWrites = 0;
      return { repository, planned };
    };
    let getterCalls = 0;
    const getter = () => {
      getterCalls += 1;
      return "forged";
    };
    const principal = { subject: "synthetic-owner", admittedOwner: true };
    const decision = {
      kind: "merge",
      primaryId: "identity-alpha",
      secondaryIds: ["identity-beta"],
    };
    const makeInput = (planned) => ({
      workspaceId,
      suggestionId: planned.id,
      decision: structuredClone(decision),
      expectedRevision: planned.revision,
      idempotencyKey: "identity-outer-malformed-0001",
    });
    const factories = [
      ["principal subject accessor", (planned) => [accessorCopy(principal, "subject", getter), makeInput(planned)]],
      ["principal admission accessor", (planned) => [accessorCopy(principal, "admittedOwner", getter), makeInput(planned)]],
      ["principal proxy", (planned) => [new Proxy(principal, {}), makeInput(planned)]],
      ["workspace accessor", (planned) => [principal, accessorCopy(makeInput(planned), "workspaceId", getter)]],
      ["suggestion accessor", (planned) => [principal, accessorCopy(makeInput(planned), "suggestionId", getter)]],
      ["decision accessor", (planned) => [principal, accessorCopy(makeInput(planned), "decision", getter)]],
      ["revision accessor", (planned) => [principal, accessorCopy(makeInput(planned), "expectedRevision", getter)]],
      ["idempotency accessor", (planned) => [principal, accessorCopy(makeInput(planned), "idempotencyKey", getter)]],
      ["input proxy", (planned) => [principal, new Proxy(makeInput(planned), {})]],
      ["decision proxy", (planned) => {
        const input = makeInput(planned);
        input.decision = new Proxy(input.decision, {});
        return [principal, input];
      }],
      ["decision-list proxy", (planned) => {
        const input = makeInput(planned);
        input.decision.secondaryIds = new Proxy(input.decision.secondaryIds, {});
        return [principal, input];
      }],
      ["extra input key", (planned) => [principal, { ...makeInput(planned), clientAuthority: true }]],
    ];
    for (const [label, makeCase] of factories) {
      const { repository, planned } = await setup();
      const [candidatePrincipal, candidateInput] = makeCase(planned);
      await assert.rejects(
        () => loaded.domain.applyIdentityResolution(
          repository,
          candidatePrincipal,
          candidateInput,
        ),
        /identity_resolution_rejected/,
        label,
      );
      assertNoEffect(repository, label);
    }
    assert.equal(getterCalls, 0, "apply descriptor validation never invokes authority accessors");
  } finally {
    await loaded.vite.close();
  }
});
