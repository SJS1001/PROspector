import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";

const workspaceId = "workspace-identity-repository-snapshot";
const owner = Object.freeze({ subject: "owner-identity-repository-snapshot", admittedOwner: true });

async function load() {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  return {
    vite,
    domain: await vite.ssrLoadModule(
      new URL("../domain/identity-resolution.ts", import.meta.url).pathname,
    ),
  };
}

function identity(id, revision) {
  return {
    id,
    workspaceId,
    revision,
    aliases: [`alias-${id}`],
    sourceLineageIds: [`source-${id}`],
    identityLineageIds: [`lineage-${id}`],
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

function clone(value) {
  return structuredClone(value);
}

class Repository {
  constructor(rows) {
    this.rows = rows;
    this.suggestions = new Map();
    this.applied = new Map();
    this.suggestionWrites = 0;
    this.applyWrites = 0;
    this.returnSuggestionProxy = false;
    this.returnExistingProxy = false;
    this.returnAppliedProxy = false;
    this.onSave = null;
  }

  async readIdentitySnapshots(scope, ids) {
    return ids
      .map((id) => this.rows.find((row) => row.id === id))
      .filter((row) => row?.workspaceId === scope);
  }

  async saveIdentitySuggestion(suggestion) {
    this.suggestionWrites += 1;
    this.onSave?.(suggestion);
    const stored = clone(suggestion);
    this.suggestions.set(suggestion.id, stored);
    const result = clone(stored);
    return this.returnSuggestionProxy ? new Proxy(result, {}) : result;
  }

  async readIdentitySuggestion(scope, subject, suggestionId) {
    const suggestion = this.suggestions.get(suggestionId);
    return suggestion?.workspaceId === scope && suggestion?.ownerSubject === subject
      ? clone(suggestion)
      : null;
  }

  async transaction(scope, operation) {
    return operation({
      findByIdempotencyKey: async (key) => {
        const existing = this.applied.get(`${scope}:${key}`);
        if (!existing) return null;
        const result = clone(existing);
        return this.returnExistingProxy ? new Proxy(result, {}) : result;
      },
      readIdentitySnapshots: async (ids) => ids
        .map((id) => this.rows.find((row) => row.id === id))
        .filter((row) => row?.workspaceId === scope),
      applyResolution: async (resolution) => {
        this.applyWrites += 1;
        const stored = clone(resolution);
        this.applied.set(`${scope}:${resolution.idempotencyKey}`, stored);
        const result = clone(stored);
        return this.returnAppliedProxy ? new Proxy(result, {}) : result;
      },
    });
  }
}

function mergeInput() {
  return {
    workspaceId,
    kind: "merge",
    candidateIds: ["identity-alpha", "identity-beta"],
  };
}

function mergeDecision(suggestion, idempotencyKey) {
  return {
    workspaceId,
    suggestionId: suggestion.id,
    decision: {
      kind: "merge",
      primaryId: "identity-alpha",
      secondaryIds: ["identity-beta"],
    },
    expectedRevision: suggestion.revision,
    idempotencyKey,
  };
}

function statefulArrayProxy(value, forgedFirstValue) {
  return new Proxy(value, {
    get(target, key, receiver) {
      if (key === "0") return forgedFirstValue;
      return Reflect.get(target, key, receiver);
    },
  });
}

test("identity planning rejects top-level and nested repository Proxies before suggestion persistence", async () => {
  const loaded = await load();
  try {
    const cases = [
      ["top-level rows", (rows) => new Proxy(rows, {})],
      ["row", (rows) => [new Proxy(rows[0], {}), rows[1]]],
      ["aliases", (rows) => {
        rows[0].aliases = statefulArrayProxy(rows[0].aliases, "forged-alias");
        return rows;
      }],
      ["source lineage", (rows) => {
        rows[0].sourceLineageIds = statefulArrayProxy(rows[0].sourceLineageIds, "forged-source");
        return rows;
      }],
      ["suppression subjects", (rows) => {
        rows[0].suppressionSubjectRefs = statefulArrayProxy(
          rows[0].suppressionSubjectRefs,
          "forged-suppression",
        );
        return rows;
      }],
      ["associations", (rows) => {
        rows[0].associations = statefulArrayProxy(rows[0].associations, {
          ...rows[0].associations[0],
          relevanceId: "forged-relevance",
        });
        return rows;
      }],
    ];

    for (const [label, makeRows] of cases) {
      const rows = makeRows([
        identity("identity-alpha", 3),
        identity("identity-beta", 4),
      ]);
      const repository = new Repository(rows);
      if (label === "top-level rows") {
        repository.readIdentitySnapshots = async () => rows;
      }
      await assert.rejects(
        () => loaded.domain.planIdentitySuggestion(repository, owner, mergeInput()),
        /identity_resolution_rejected/,
        label,
      );
      assert.equal(repository.suggestionWrites, 0, `${label}: no suggestion write`);
    }
  } finally {
    await loaded.vite.close();
  }
});

test("identity planning detaches repository rows before later digest and persistence awaits", async () => {
  const loaded = await load();
  try {
    const rows = [
      identity("identity-alpha", 3),
      identity("identity-beta", 4),
    ];
    const repository = new Repository(rows);
    let mutationRan = false;
    repository.onSave = (suggestion) => {
      assert.equal(mutationRan, true, "source mutation happened before persistence");
      assert.deepEqual(suggestion.retainedAliases, [
        "alias-identity-alpha",
        "alias-identity-beta",
      ]);
      assert.deepEqual(suggestion.retainedSuppressionSubjectRefs, [
        "suppression-identity-alpha",
        "suppression-identity-beta",
      ]);
    };

    const pending = loaded.domain.planIdentitySuggestion(repository, owner, mergeInput());
    queueMicrotask(() => {
      rows[0].aliases[0] = "alias-mutated-after-read";
      rows[0].sourceLineageIds[0] = "source-mutated-after-read";
      rows[0].suppressionSubjectRefs[0] = "suppression-mutated-after-read";
      rows[0].associations[0].relevanceId = "relevance-mutated-after-read";
      mutationRan = true;
    });
    const suggestion = await pending;

    assert.equal(mutationRan, true);
    assert.deepEqual(suggestion.retainedAliases, [
      "alias-identity-alpha",
      "alias-identity-beta",
    ]);
    assert.deepEqual(suggestion.sourceLineageIds, [
      "source-identity-alpha",
      "source-identity-beta",
    ]);
    assert.deepEqual(suggestion.retainedSuppressionSubjectRefs, [
      "suppression-identity-alpha",
      "suppression-identity-beta",
    ]);
    assert.deepEqual(
      suggestion.associationImpact.map((impact) => impact.relevanceId),
      ["relevance-identity-alpha", "relevance-identity-beta"],
    );
  } finally {
    await loaded.vite.close();
  }
});

test("suggestion and resolution repository acknowledgements reject Proxy material", async () => {
  const loaded = await load();
  try {
    const rows = [
      identity("identity-alpha", 3),
      identity("identity-beta", 4),
    ];
    const badSuggestionRepository = new Repository(clone(rows));
    badSuggestionRepository.returnSuggestionProxy = true;
    await assert.rejects(
      () => loaded.domain.planIdentitySuggestion(
        badSuggestionRepository,
        owner,
        mergeInput(),
      ),
      /identity_resolution_rejected/,
    );

    const repository = new Repository(clone(rows));
    const suggestion = await loaded.domain.planIdentitySuggestion(
      repository,
      owner,
      mergeInput(),
    );
    const input = mergeDecision(suggestion, "identity-material-snapshot-0001");
    const applied = await loaded.domain.applyIdentityResolution(repository, owner, input);
    assert.equal(applied.idempotencyKey, input.idempotencyKey);

    repository.returnExistingProxy = true;
    await assert.rejects(
      () => loaded.domain.applyIdentityResolution(repository, owner, input),
      /identity_resolution_rejected/,
      "idempotent replay cannot trust a Proxy result",
    );

    const badCommitRepository = new Repository(clone(rows));
    const secondSuggestion = await loaded.domain.planIdentitySuggestion(
      badCommitRepository,
      owner,
      mergeInput(),
    );
    badCommitRepository.returnAppliedProxy = true;
    await assert.rejects(
      () => loaded.domain.applyIdentityResolution(
        badCommitRepository,
        owner,
        mergeDecision(secondSuggestion, "identity-material-snapshot-0002"),
      ),
      /identity_resolution_rejected/,
      "commit acknowledgement cannot be a Proxy",
    );
  } finally {
    await loaded.vite.close();
  }
});
