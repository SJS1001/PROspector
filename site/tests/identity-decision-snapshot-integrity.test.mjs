import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";

const workspaceId = "synthetic-workspace-a";
const owner = { subject: "synthetic-owner", admittedOwner: true };

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

class SnapshotRepository {
  constructor(rows) {
    this.rows = new Map(rows.map((row) => [row.id, structuredClone(row)]));
    this.suggestions = new Map();
    this.applied = new Map();
    this.suggestionReads = 0;
    this.transactionCalls = 0;
    this.applyCalls = 0;
    this.onSuggestionRead = null;
  }

  async readIdentitySnapshots(scope, ids) {
    return ids
      .map((id) => this.rows.get(id))
      .filter((row) => row?.workspaceId === scope)
      .map((row) => structuredClone(row));
  }

  async saveIdentitySuggestion(suggestion) {
    const copy = structuredClone(suggestion);
    this.suggestions.set(`${suggestion.workspaceId}:${suggestion.ownerSubject}:${suggestion.id}`, copy);
    return structuredClone(copy);
  }

  async readIdentitySuggestion(scope, ownerSubject, suggestionId) {
    this.suggestionReads += 1;
    this.onSuggestionRead?.();
    return structuredClone(this.suggestions.get(`${scope}:${ownerSubject}:${suggestionId}`) ?? null);
  }

  async transaction(scope, operation) {
    this.transactionCalls += 1;
    return operation({
      findByIdempotencyKey: async (key) => structuredClone(this.applied.get(`${scope}:${key}`) ?? null),
      readIdentitySnapshots: async (ids) => ids
        .map((id) => this.rows.get(id))
        .filter((row) => row?.workspaceId === scope)
        .map((row) => structuredClone(row)),
      applyResolution: async (resolution) => {
        this.applyCalls += 1;
        this.applied.set(`${scope}:${resolution.idempotencyKey}`, structuredClone(resolution));
        return structuredClone(resolution);
      },
    });
  }
}

async function suggestion(domain, repository, kind) {
  return domain.planIdentitySuggestion(
    repository,
    owner,
    kind === "merge"
      ? { workspaceId, kind, candidateIds: ["identity-alpha", "identity-beta"] }
      : {
        workspaceId,
        kind,
        sourceId: "identity-alpha",
        moveAssociationIds: ["association-identity-alpha"],
      },
  );
}

async function apply(domain, repository, planned, decision, key) {
  return domain.applyIdentityResolution(repository, owner, {
    workspaceId,
    suggestionId: planned.id,
    decision,
    expectedRevision: planned.revision,
    idempotencyKey: key,
  });
}

function assertNoDecisionMutation(repository) {
  assert.equal(repository.suggestionReads, 0, "malformed decisions reject before repository reads");
  assert.equal(repository.transactionCalls, 0, "malformed decisions reject before opening a transaction");
  assert.equal(repository.applyCalls, 0, "malformed decisions cannot reach durable mutation");
}

test("merge decision accessors and exotic shapes reject without invoking accessors or opening a transaction", async () => {
  const loaded = await load();
  try {
    const cases = [];
    let getterCalls = 0;

    const primaryAccessor = {
      kind: "merge",
      secondaryIds: ["identity-beta"],
    };
    Object.defineProperty(primaryAccessor, "primaryId", {
      get() {
        getterCalls += 1;
        return "identity-alpha";
      },
      enumerable: true,
    });
    cases.push(primaryAccessor);

    const secondaryAccessor = {
      kind: "merge",
      primaryId: "identity-alpha",
    };
    Object.defineProperty(secondaryAccessor, "secondaryIds", {
      get() {
        getterCalls += 1;
        return ["identity-beta"];
      },
      enumerable: true,
    });
    cases.push(secondaryAccessor);

    cases.push({
      kind: "merge",
      primaryId: "identity-alpha",
      secondaryIds: ["identity-beta"],
      unexpectedAuthority: true,
    });
    cases.push(Object.assign(
      Object.create({ inheritedAuthority: true }),
      { kind: "merge", primaryId: "identity-alpha", secondaryIds: ["identity-beta"] },
    ));

    for (const [index, decision] of cases.entries()) {
      const repository = new SnapshotRepository([
        identity("identity-alpha", 3),
        identity("identity-beta", 4),
      ]);
      const planned = await suggestion(loaded.domain, repository, "merge");
      repository.suggestionReads = 0;
      await assert.rejects(
        () => apply(
          loaded.domain,
          repository,
          planned,
          decision,
          `identity-decision-malformed-${index}`,
        ),
        /identity_resolution_rejected/,
      );
      assertNoDecisionMutation(repository);
    }
    assert.equal(getterCalls, 0, "decision validation inspects descriptors without executing accessors");
  } finally {
    await loaded.vite.close();
  }
});

test("merge uses one immutable decision snapshot when caller data changes during repository I/O", async () => {
  const loaded = await load();
  try {
    const repository = new SnapshotRepository([
      identity("identity-alpha", 3),
      identity("identity-beta", 4),
    ]);
    const planned = await suggestion(loaded.domain, repository, "merge");
    const decision = {
      kind: "merge",
      primaryId: "identity-alpha",
      secondaryIds: ["identity-beta"],
    };
    repository.onSuggestionRead = () => {
      decision.primaryId = "identity-beta";
      decision.secondaryIds[0] = "identity-alpha";
    };
    const result = await apply(
      loaded.domain,
      repository,
      planned,
      decision,
      "identity-decision-merge-snapshot-0001",
    );
    assert.deepEqual(result.decision, {
      kind: "merge",
      primaryId: "identity-alpha",
      secondaryIds: ["identity-beta"],
    });
    assert.equal(Object.isFrozen(result.decision), true);
    assert.equal(Object.isFrozen(result.decision.secondaryIds), true);
    assert.equal(repository.transactionCalls, 1);
    assert.equal(repository.applyCalls, 1);
  } finally {
    await loaded.vite.close();
  }
});

test("split source and move-list accessors or proxies reject before transaction authority", async () => {
  const loaded = await load();
  try {
    let getterCalls = 0;
    const sourceAccessor = {
      kind: "split",
      moveAssociationIds: ["association-identity-alpha"],
    };
    Object.defineProperty(sourceAccessor, "sourceId", {
      get() {
        getterCalls += 1;
        return "identity-alpha";
      },
      enumerable: true,
    });

    const moveIds = [];
    Object.defineProperty(moveIds, "0", {
      get() {
        getterCalls += 1;
        return "association-identity-alpha";
      },
      enumerable: true,
    });
    moveIds.length = 1;
    const moveAccessor = {
      kind: "split",
      sourceId: "identity-alpha",
      moveAssociationIds: moveIds,
    };
    const proxyDecision = new Proxy({
      kind: "split",
      sourceId: "identity-alpha",
      moveAssociationIds: ["association-identity-alpha"],
    }, {});
    const proxyMoveList = {
      kind: "split",
      sourceId: "identity-alpha",
      moveAssociationIds: new Proxy(["association-identity-alpha"], {}),
    };

    for (const [index, decision] of [
      sourceAccessor,
      moveAccessor,
      proxyDecision,
      proxyMoveList,
    ].entries()) {
      const repository = new SnapshotRepository([identity("identity-alpha", 3)]);
      const planned = await suggestion(loaded.domain, repository, "split");
      repository.suggestionReads = 0;
      await assert.rejects(
        () => apply(
          loaded.domain,
          repository,
          planned,
          decision,
          `identity-decision-split-malformed-${index}`,
        ),
        /identity_resolution_rejected/,
      );
      assertNoDecisionMutation(repository);
    }
    assert.equal(getterCalls, 0, "split descriptor validation never executes source or move-list accessors");
  } finally {
    await loaded.vite.close();
  }
});

test("split uses the frozen source and move-list snapshot despite caller mutation during I/O", async () => {
  const loaded = await load();
  try {
    const repository = new SnapshotRepository([identity("identity-alpha", 3)]);
    const planned = await suggestion(loaded.domain, repository, "split");
    const decision = {
      kind: "split",
      sourceId: "identity-alpha",
      moveAssociationIds: ["association-identity-alpha"],
    };
    repository.onSuggestionRead = () => {
      decision.sourceId = "identity-beta";
      decision.moveAssociationIds[0] = "association-forged";
    };
    const result = await apply(
      loaded.domain,
      repository,
      planned,
      decision,
      "identity-decision-split-snapshot-0001",
    );
    assert.equal(result.decision.sourceId, "identity-alpha");
    assert.deepEqual(result.decision.moveAssociationIds, ["association-identity-alpha"]);
    assert.equal(result.decision.newIdentityId, planned.proposedPartition.newIdentityId);
    assert.equal(Object.isFrozen(result.decision), true);
    assert.equal(Object.isFrozen(result.decision.moveAssociationIds), true);
    assert.equal(repository.transactionCalls, 1);
    assert.equal(repository.applyCalls, 1);
  } finally {
    await loaded.vite.close();
  }
});
