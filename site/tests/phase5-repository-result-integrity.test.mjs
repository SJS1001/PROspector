import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";

const workspaceId = "workspace-result-integrity";
const ownerSubject = "owner-result-integrity";
const now = 1_100;

async function load(vite, name) {
  return vite.ssrLoadModule(new URL(`../domain/${name}.ts`, import.meta.url).pathname);
}

test("grant commit and replay results cannot replace server-authorized provider, scope, cost, key, digest, or shape", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const issuance = await load(vite, "enrichment-grant-issuance");
    const input = issueInput();
    const valid = await issuance.issueEnrichmentGrant(issueRepository(), input);
    assert.equal(valid.kind, "issued");
    assertDeepFrozen(valid.grant);

    const mutations = [
      ["provider", (record) => patchTuple(record, { providerId: "provider-other" })],
      ["scope", (record) => patchTuple(record, { configurationId: "configuration-other" })],
      ["cost", (record) => patchTuple(record, { maxCostMinor: record.tuple.maxCostMinor + 1 })],
      ["workspace", (record) => ({ ...clone(record), workspaceId: "workspace-other" })],
      ["operation key", (record) => patchTuple(record, { operationKey: `op_${"b".repeat(64)}` })],
      ["digest", (record) => patchTuple(record, { digest: "b".repeat(64) })],
      ["extra field", (record) => ({ ...clone(record), unauthorized: true })],
      ["custom prototype", (record) => withPrototype(clone(record))],
      ["throwing getter", (record) => withThrowingGetter(clone(record), "requestDigest")],
    ];
    for (const [name, mutate] of mutations) {
      let commits = 0;
      const result = await issuance.issueEnrichmentGrant({
        ...issueRepository(),
        async commitGrant(record) {
          commits += 1;
          return { kind: "created", record: mutate(record) };
        },
      }, input);
      assert.notEqual(result.kind, "issued", name);
      assert.equal(commits, 1, name);

      const replay = await issuance.issueEnrichmentGrant({
        ...issueRepository(),
        async findGrantByIdempotency() { return mutate(valid.grant); },
        async commitGrant() { throw new Error("invalid replay must not commit"); },
      }, input);
      assert.notEqual(replay.kind, "issued", `replay ${name}`);
    }

    const getterEnvelope = Object.defineProperty({ kind: "created" }, "record", {
      enumerable: true,
      get() { throw new Error("repository getter must not run"); },
    });
    const getterResult = await issuance.issueEnrichmentGrant({
      ...issueRepository(),
      async commitGrant() { return getterEnvelope; },
    }, input);
    assert.equal(getterResult.kind, "blocked");
  } finally {
    await vite.close();
  }
});

test("enrichment reservation commit results cannot manufacture downstream assignment authority", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const [issuance, authority] = await Promise.all([
      load(vite, "enrichment-grant-issuance"),
      load(vite, "enrichment-authority"),
    ]);
    const issued = await issuance.issueEnrichmentGrant(issueRepository(), issueInput());
    assert.equal(issued.kind, "issued");
    const reservationAuthority = enrichmentAuthority(issued.grant);
    const input = {
      grantId: issued.grant.id,
      principalSubject: ownerSubject,
      operationKey: issued.grant.tuple.operationKey,
      now,
    };
    const mutations = [
      ["provider", (record) => patchAssignment(record, { providerId: "provider-other" })],
      ["scope", (record) => patchAssignment(record, { configurationId: "configuration-other" })],
      ["cost", (record) => patchAssignment(record, { maxCostMinor: record.assignment.maxCostMinor + 1 })],
      ["workspace", (record) => ({ ...clone(record), workspaceId: "workspace-other" })],
      ["operation key", (record) => ({ ...clone(record), operationKey: `op_${"b".repeat(64)}` })],
      ["extra field", (record) => ({ ...clone(record), unauthorized: true })],
      ["custom prototype", (record) => withPrototype(clone(record))],
      ["nested throwing getter", (record) => {
        const changed = clone(record);
        changed.assignment = withThrowingGetter(changed.assignment, "providerId");
        return changed;
      }],
    ];
    for (const [name, mutate] of mutations) {
      let downstreamAssignments = 0;
      const result = await authority.reserveEnrichmentOperation({
        async loadReservationAuthority() { return clone(reservationAuthority); },
        async commitReservation(record) { return { kind: "created", record: mutate(record) }; },
      }, input);
      if (result.kind === "reserved") downstreamAssignments += 1;
      assert.equal(result.kind, "blocked", name);
      assert.equal(downstreamAssignments, 0, name);
    }

    const legitimate = await authority.reserveEnrichmentOperation({
      async loadReservationAuthority() { return clone(reservationAuthority); },
      async commitReservation(record) { return { kind: "existing", record: clone(record) }; },
    }, input);
    assert.equal(legitimate.kind, "reserved");
    assert.equal(legitimate.replayed, true);
    assertDeepFrozen(legitimate.reservation);
  } finally {
    await vite.close();
  }
});

test("runner commit results cannot change provider, scope, cost, operation, digest, or record shape", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const runner = await load(vite, "runner-spend-authority");
    const runnerAuthority = await makeRunnerAuthority(runner);
    const input = {
      grantId: runnerAuthority.grant.id,
      principalSubject: ownerSubject,
      operationKey: runnerAuthority.perRun.operationKey,
      now,
    };
    const mutations = [
      ["workspace", (record) => ({ ...clone(record), workspaceId: "workspace-other" })],
      ["provider", (record) => ({ ...clone(record), providerId: "provider-other" })],
      ["scope", (record) => ({ ...clone(record), scopeId: "scope-other" })],
      ["cost", (record) => ({ ...clone(record), reservedCostMinor: record.reservedCostMinor + 1 })],
      ["operation key", (record) => ({ ...clone(record), operationKey: `ro_${"b".repeat(64)}` })],
      ["digest", (record) => ({ ...clone(record), attemptDigest: "b".repeat(64) })],
      ["extra field", (record) => ({ ...clone(record), unauthorized: true })],
      ["custom prototype", (record) => withPrototype(clone(record))],
      ["throwing getter", (record) => withThrowingGetter(clone(record), "catalogRef")],
    ];
    for (const [name, mutate] of mutations) {
      let downstreamAssignments = 0;
      const result = await runner.reserveRunnerSpend({
        async loadRunnerAuthority() { return clone(runnerAuthority); },
        async commitRunnerReservation(record) { return { kind: "created", record: mutate(record) }; },
      }, input);
      if (result.kind === "reserved") downstreamAssignments += 1;
      assert.equal(result.kind, "blocked", name);
      assert.equal(downstreamAssignments, 0, name);
    }

    const legitimate = await runner.reserveRunnerSpend({
      async loadRunnerAuthority() { return clone(runnerAuthority); },
      async commitRunnerReservation(record) { return { kind: "existing", record: clone(record) }; },
    }, input);
    assert.equal(legitimate.kind, "reserved");
    assert.equal(legitimate.replayed, true);
    assertDeepFrozen(legitimate.reservation);
  } finally {
    await vite.close();
  }
});

test("identity apply and idempotent replay results are exact owner/workspace/suggestion-bound immutable records", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const identity = await load(vite, "identity-resolution");
    const owner = { subject: ownerSubject, admittedOwner: true };
    const rows = [identityRow("identity-alpha", 2), identityRow("identity-beta", 3)];
    const suggestions = new Map();
    const repository = identityRepository(rows, suggestions);
    const suggestion = await identity.planIdentitySuggestion(repository, owner, {
      workspaceId,
      kind: "merge",
      candidateIds: ["identity-alpha", "identity-beta"],
    });
    const input = {
      workspaceId,
      suggestionId: suggestion.id,
      decision: { kind: "merge", primaryId: "identity-alpha", secondaryIds: ["identity-beta"] },
      expectedRevision: suggestion.revision,
      idempotencyKey: "identity-result-integrity-0001",
    };
    const valid = await identity.applyIdentityResolution(repository, owner, input);
    assertDeepFrozen(valid);
    const mutations = [
      ["workspace", (record) => ({ ...clone(record), workspaceId: "workspace-other" })],
      ["owner", (record) => ({ ...clone(record), ownerSubject: "owner-other" })],
      ["scope", (record) => ({ ...clone(record), decision: { ...clone(record.decision), primaryId: "identity-beta" } })],
      ["key", (record) => ({ ...clone(record), idempotencyKey: "identity-result-integrity-forged" })],
      ["digest", (record) => ({ ...clone(record), operationDigest: "b".repeat(64) })],
      ["retained authority", (record) => ({ ...clone(record), retainedSuppressionSubjectRefs: ["suppression-forged"] })],
      ["extra field", (record) => ({ ...clone(record), unauthorized: true })],
      ["custom prototype", (record) => withPrototype(clone(record))],
      ["nested throwing getter", (record) => {
        const changed = clone(record);
        changed.decision = withThrowingGetter(changed.decision, "primaryId");
        return changed;
      }],
    ];
    for (const [name, mutate] of mutations) {
      let applyCalls = 0;
      const replayRepository = identityRepository(rows, suggestions, {
        existing: mutate(valid),
        onApply() { applyCalls += 1; },
      });
      await assert.rejects(
        () => identity.applyIdentityResolution(replayRepository, owner, input),
        /identity_resolution_rejected/,
        name,
      );
      assert.equal(applyCalls, 0, name);

      let committed = 0;
      const applyRepository = identityRepository(rows, suggestions, {
        applyResult: mutate,
        onCommit() { committed += 1; },
      });
      await assert.rejects(
        () => identity.applyIdentityResolution(applyRepository, owner, {
          ...input,
          idempotencyKey: `identity-apply-${name.replaceAll(" ", "-")}-0001`,
        }),
        /identity_resolution_rejected/,
        `apply ${name}`,
      );
      assert.equal(committed, 0, `transaction rollback ${name}`);
    }
  } finally {
    await vite.close();
  }
});

function issuanceSnapshot() {
  return {
    admitted: true,
    workspaceId,
    ownerSubject,
    revision: 7,
    configuration: { id: "configuration-result-integrity", digest: "a".repeat(64), revision: 3, current: true },
    prospects: [{
      id: "prospect-result-integrity",
      state: "approved",
      configurationId: "configuration-result-integrity",
      configurationDigest: "a".repeat(64),
      revision: 4,
    }],
    quote: {
      providerId: "provider-result-integrity",
      providerVersion: "v1",
      catalogRef: "catalog-result-integrity",
      revision: 2,
      currency: "USD",
      unitCostMinor: 10,
      expiresAt: 2_000,
    },
  };
}

function issueInput() {
  return {
    principalSubject: ownerSubject,
    prospectIds: ["prospect-result-integrity"],
    operation: "business_contact_lookup/v1",
    maxUnits: 1,
    maxCostMinor: 10,
    currency: "USD",
    expiresAt: 1_500,
    expectedRevision: 7,
    idempotencyKey: "grant-result-integrity-0001",
    now: 1_000,
  };
}

function issueRepository() {
  return {
    async loadIssuanceSnapshot() { return issuanceSnapshot(); },
    async findGrantByIdempotency() { return null; },
    async commitGrant(record) { return { kind: "created", record: clone(record) }; },
    nextNonce: () => "repository-result-integrity-nonce",
  };
}

function enrichmentAuthority(grant) {
  const snapshot = issuanceSnapshot();
  return {
    admitted: true,
    workspaceId,
    principalSubject: ownerSubject,
    sourceRevision: snapshot.revision,
    grant,
    configuration: snapshot.configuration,
    prospects: snapshot.prospects,
    quote: snapshot.quote,
    accounts: [
      enrichmentAccount("grant", grant.id),
      enrichmentAccount("profile", snapshot.configuration.id),
      enrichmentAccount("workspace", workspaceId),
      enrichmentAccount("provider", snapshot.quote.providerId),
    ],
    evidenceAssignments: [{
      assignmentId: "assignment-result-integrity",
      prospectId: "prospect-result-integrity",
      role: "general",
      workspaceId,
      contactId: "contact-result-integrity",
      profileConfigurationId: snapshot.configuration.id,
      profileConfigurationDigest: snapshot.configuration.digest,
    }],
  };
}

function enrichmentAccount(scope, entityId) {
  return {
    authorityType: "enrichment",
    accountId: `enrichment:${component(workspaceId)}:${scope}:${component(entityId)}`,
    scope,
    workspaceId,
    entityId,
    currency: "USD",
    actualUnits: 0,
    reservedUnits: 0,
    maxUnits: 10,
    actualCostMinor: 0,
    reservedCostMinor: 0,
    maxCostMinor: 100,
  };
}

async function makeRunnerAuthority(runner) {
  const grant = {
    authorityType: "runner_spend",
    id: "runner-result-integrity",
    providerId: "runner-provider",
    model: "runner-model",
    catalogRef: "runner-catalog",
    runType: "prospecting",
    scopeId: "runner-scope",
    perRunCostMinor: 10,
    monthlyCostMinor: 100,
    currency: "USD",
    expiresAt: 2_000,
    maxRetries: 0,
  };
  const attempt = { attemptNumber: 0, previousOutcome: "none", previousOperationKeys: [] };
  const operationKey = await runner.deriveRunnerOperationKey({ workspaceId, principalSubject: ownerSubject, grant, attempt });
  const period = runner.deriveRunnerUtcMonthPeriod(now);
  return {
    admitted: true,
    workspaceId,
    principalSubject: ownerSubject,
    grant,
    attempt,
    perRun: {
      authorityType: "runner_spend",
      accountId: runner.deriveRunnerPerRunAccountId({
        workspaceId,
        principalSubject: ownerSubject,
        grantId: grant.id,
        providerId: grant.providerId,
        scopeId: grant.scopeId,
        attemptNumber: 0,
        operationKey,
      }),
      scope: "runner_per_run",
      principalSubject: ownerSubject,
      grantId: grant.id,
      providerId: grant.providerId,
      scopeId: grant.scopeId,
      attemptNumber: 0,
      operationKey,
      currency: "USD",
      actualCostMinor: 0,
      reservedCostMinor: 0,
      maxCostMinor: 10,
    },
    monthly: {
      authorityType: "runner_spend",
      accountId: runner.deriveRunnerMonthlyAccountId({
        workspaceId,
        principalSubject: ownerSubject,
        providerId: grant.providerId,
        scopeId: grant.scopeId,
        period,
      }),
      scope: "runner_monthly",
      principalSubject: ownerSubject,
      grantId: grant.id,
      providerId: grant.providerId,
      scopeId: grant.scopeId,
      period,
      currency: "USD",
      actualCostMinor: 0,
      reservedCostMinor: 0,
      maxCostMinor: 100,
    },
  };
}

function identityRow(id, revision) {
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

function identityRepository(rows, suggestions, options = {}) {
  const byId = new Map(rows.map((row) => [row.id, clone(row)]));
  return {
    async readIdentitySnapshots(scope, ids) {
      return ids.map((id) => byId.get(id)).filter((row) => row?.workspaceId === scope).map(clone);
    },
    async saveIdentitySuggestion(suggestion) {
      suggestions.set(suggestion.id, clone(suggestion));
      return clone(suggestion);
    },
    async readIdentitySuggestion(scope, subject, id) {
      const suggestion = suggestions.get(id);
      return suggestion?.workspaceId === scope && suggestion?.ownerSubject === subject ? clone(suggestion) : null;
    },
    async transaction(_scope, operation) {
      let staged = false;
      const result = await operation({
        async findByIdempotencyKey() { return options.existing ? options.existing : null; },
        async readIdentitySnapshots(ids) { return ids.map((id) => byId.get(id)).filter(Boolean).map(clone); },
        async applyResolution(record) {
          options.onApply?.();
          staged = true;
          return options.applyResult ? options.applyResult(record) : clone(record);
        },
      });
      if (staged) options.onCommit?.();
      return result;
    },
  };
}

function patchTuple(record, patch) {
  const changed = clone(record);
  changed.tuple = { ...changed.tuple, ...patch };
  return changed;
}

function patchAssignment(record, patch) {
  const changed = clone(record);
  changed.assignment = { ...changed.assignment, ...patch };
  return changed;
}

function withPrototype(record) {
  Object.setPrototypeOf(record, { unauthorized: true });
  return record;
}

function withThrowingGetter(record, key) {
  Object.defineProperty(record, key, {
    enumerable: true,
    configurable: true,
    get() { throw new Error("repository getter must not run"); },
  });
  return record;
}

function clone(value) {
  return structuredClone(value);
}

function component(value) {
  return `${value.length}:${value}`;
}

function assertDeepFrozen(value) {
  if (!value || typeof value !== "object") return;
  assert.equal(Object.isFrozen(value), true);
  for (const nested of Object.values(value)) assertDeepFrozen(nested);
}
