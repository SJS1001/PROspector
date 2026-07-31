import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";

async function module(vite, name) {
  return vite.ssrLoadModule(new URL(`../domain/${name}.ts`, import.meta.url).pathname);
}

test("P5 preparation: owner issuance derives a replay-safe immutable operation-key grant without a provider", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const issuance = await module(vite, "enrichment-grant-issuance");
    const records = new Map();
    const snapshot = {
      admitted: true, workspaceId: "workspace-synthetic", ownerSubject: "owner-synthetic", revision: 7,
      configuration: { id: "config-synthetic", digest: "a".repeat(64), revision: 3, current: true },
      prospects: [
        { id: "prospect-b", state: "approved", configurationId: "config-synthetic", configurationDigest: "a".repeat(64), revision: 4 },
        { id: "prospect-a", state: "approved", configurationId: "config-synthetic", configurationDigest: "a".repeat(64), revision: 5 },
      ],
      quote: { providerId: "synthetic-provider", providerVersion: "v1", catalogRef: "catalog-synthetic", revision: 2, currency: "USD", unitCostMinor: 11, expiresAt: 2_000 },
    };
    const repository = {
      async loadIssuanceSnapshot() { return snapshot; },
      async findGrantByIdempotency(_workspaceId, key) { return records.get(key) ?? null; },
      async commitGrant(record) { records.set(record.idempotencyKey, record); return { kind: "created", record }; }, nextNonce: () => "server-nonce-synthetic",
    };
    const input = { principalSubject: "owner-synthetic", prospectIds: ["prospect-b", "prospect-a"], operation: "business_contact_lookup/v1", maxUnits: 2, maxCostMinor: 22, currency: "USD", expiresAt: 1_500, expectedRevision: 7, idempotencyKey: "issue-synthetic-1", now: 1_000 };
    const first = await issuance.issueEnrichmentGrant(repository, input);
    assert.equal(first.kind, "issued");
    assert.deepEqual(first.grant.tuple.prospectIds, ["prospect-a", "prospect-b"]);
    assert.match(first.grant.tuple.operationKey, /^op_[0-9a-f]{64}$/);
    assert.match(first.grant.tuple.digest, /^[0-9a-f]{64}$/);
    assert.equal(first.audit.operationKey, first.grant.tuple.operationKey);
    assert.equal(first.audit.digest, first.grant.tuple.digest);
    assert.equal(JSON.stringify(first.audit).includes("nonce-synthetic"), false);
    assert.equal(first.grant.tuple.nonce, "server-nonce-synthetic", "only repository/server entropy reaches the tuple");
    const { digest, ...unsignedTuple } = first.grant.tuple;
    const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(issuance.canonical(unsignedTuple)));
    assert.equal(digest, Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join(""), "the tuple digest covers the server-derived operation key");
    const replay = await issuance.issueEnrichmentGrant(repository, input);
    assert.equal(replay.kind, "issued");
    assert.equal(replay.replayed, true);
    assert.equal(replay.grant.id, first.grant.id);
  } finally {
    await vite.close();
  }
});

test("P5 preparation: every issuance denial is provider-free and makes no durable mutation", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const issuance = await module(vite, "enrichment-grant-issuance");
    const fakePort = { calls: 0, async enrich() { this.calls += 1; throw new Error("unreachable"); } };
    for (const [name, mutate] of [
      ["admission", (snapshot) => ({ ...snapshot, admitted: false })],
      ["stale revision", (snapshot) => snapshot],
      ["wrong persisted prospect", (snapshot) => ({ ...snapshot, prospects: [{ ...snapshot.prospects[0], id: "prospect-other" }] })],
      ["unapproved prospect", (snapshot) => ({ ...snapshot, prospects: [{ ...snapshot.prospects[0], state: "qualified" }] })],
      ["stale configuration", (snapshot) => ({ ...snapshot, configuration: { ...snapshot.configuration, current: false } })],
      ["expired quote", (snapshot) => ({ ...snapshot, quote: { ...snapshot.quote, expiresAt: 1_000 } })],
      ["currency mismatch", (snapshot) => ({ ...snapshot, quote: { ...snapshot.quote, currency: "CAD" } })],
      ["cost cap", (snapshot) => snapshot],
    ]) {
      const writes = [];
      const input = issueInput();
      if (name === "stale revision") input.expectedRevision = 6;
      if (name === "cost cap") input.maxCostMinor = 21;
      const result = await issuance.issueEnrichmentGrant({ async loadIssuanceSnapshot() { return mutate(currentSnapshot()); }, async findGrantByIdempotency() { return null; }, async commitGrant(record) { writes.push(record); return { kind: "created", record }; }, nextNonce: () => "server-nonce" }, input);
      assert.equal(result.kind, "blocked", name); assert.deepEqual(writes, [], name); assert.equal(fakePort.calls, 0, name);
    }
    const records = new Map(); const repository = { async loadIssuanceSnapshot() { return currentSnapshot(); }, async findGrantByIdempotency(_workspaceId, key) { return records.get(key) ?? null; }, async commitGrant(record) { records.set(record.idempotencyKey, record); return { kind: "created", record }; }, nextNonce: () => "server-nonce" };
    const first = await issuance.issueEnrichmentGrant(repository, issueInput());
    const conflict = await issuance.issueEnrichmentGrant(repository, { ...issueInput(), maxUnits: 1 });
    assert.equal(first.kind, "issued"); assert.deepEqual(conflict, { kind: "conflict", reason: "idempotency_conflict" }); assert.equal(fakePort.calls, 0);
  } finally { await vite.close(); }
});

test("P5 preparation: only an exact committed reservation can invoke the injected fake once, while denied and uncertain paths stay contained", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const [issuance, authority, operation, portModule, runner] = await Promise.all([
      module(vite, "enrichment-grant-issuance"), module(vite, "enrichment-authority"), module(vite, "enrichment-operation"), module(vite, "contact-provider-port"), module(vite, "runner-spend-authority"),
    ]);
    const snapshot = currentSnapshot();
    const grants = new Map(); const reservations = new Map(); const mutations = [];
    const issuanceRepository = {
      async loadIssuanceSnapshot() { return snapshot; }, async findGrantByIdempotency(_workspaceId, key) { return grants.get(key) ?? null; },
      async commitGrant(record) { grants.set(record.idempotencyKey, record); return { kind: "created", record }; }, nextNonce: () => "server-nonce-synthetic",
    };
    const issued = await issuance.issueEnrichmentGrant(issuanceRepository, issueInput());
    assert.equal(issued.kind, "issued");
    const grant = issued.grant;
    const reservationAuthority = {
      async loadReservationAuthority(grantId) {
        return grantId === grant.id ? {
          admitted: true, principalSubject: "owner-synthetic", workspaceId: "workspace-synthetic", sourceRevision: 7, grant,
          configuration: snapshot.configuration, prospects: snapshot.prospects, quote: snapshot.quote,
          accounts: [budget("grant", 22, grant.id), budget("profile", 22, grant.id), budget("workspace", 22, grant.id), budget("provider", 22, grant.id)], evidenceAssignments: [evidenceBinding()],
        } : null;
      },
      async commitReservation(record) { mutations.push(["reserve", record.id]); reservations.set(record.id, record); return { kind: "created", record }; },
      async claimCommittedInvocation(id, now) { const record = reservations.get(id); if (!record || record.status !== "reserved") return { kind: "blocked", reason: "unavailable" }; if (record.assignment.expiresAt <= now) { record.status = "released"; return { kind: "blocked", reason: "expired" }; } record.status = "invoking"; mutations.push(["claim", id]); return { kind: "claimed", assignment: record.assignment, claimedAt: now }; },
      async settleReservation(id, settlement) { mutations.push(["settle", id, settlement.state]); reservations.get(id).status = settlement.state; return durableSettlementAck(id, settlement); },
      async markNeedsReconciliation(id, reason) { mutations.push(["reconcile", id]); reservations.get(id).status = "needs_reconciliation"; return durableReconciliationAck(id, reason); },
      async listInvocationsNeedingRecovery() { return []; },
    };
    const fake = boundFakePort(portModule, async (assignment) => ({ kind: "partial", reservationId: assignment.reservationId, operationKey: assignment.operationKey, documentedUnits: 1, documentedCostMinor: 11, evidence: [contactEnvelope()] }));
    const denied = await authority.reserveEnrichmentOperation(reservationAuthority, { grantId: grant.id, principalSubject: "owner-synthetic", operationKey: "op_client_selected", now: 1_100 });
    assert.equal(denied.kind, "blocked"); assert.equal(fake.calls, 0); assert.deepEqual(mutations, []);
    const reserved = await authority.reserveEnrichmentOperation(reservationAuthority, { grantId: grant.id, principalSubject: "owner-synthetic", operationKey: grant.tuple.operationKey, now: 1_100 });
    assert.equal(reserved.kind, "reserved"); assert.equal(fake.calls, 0); assert.deepEqual(mutations[0][0], "reserve");
    assert.equal(reserved.reservation.assignment.quoteUnitCostMinor, 11);
    const delivered = await operation.executeEnrichmentOperation(reservationAuthority, fake.port, { reservationId: reserved.reservation.id, now: 1_101 });
    assert.equal(delivered.kind, "settled"); assert.equal(fake.calls, 1); assert.deepEqual(mutations.map((entry) => entry[0]), ["reserve", "claim", "settle"]);
    assert.equal(portModule.productionContactProviderPort.kind, "unconfigured");
    await assert.rejects(() => portModule.productionContactProviderPort.enrich({}), /contact_provider_unconfigured/);
    const retry = await operation.executeEnrichmentOperation(reservationAuthority, fake.port, { reservationId: reserved.reservation.id, now: 1_102 });
    assert.equal(retry.kind, "blocked"); assert.equal(fake.calls, 1);

    const timed = await admittedExecutionRepository({ issuance, authority, maxUnits: 1, maxCostMinor: 11, quoteUnitCostMinor: 11 });
    const timeoutPort = boundFakePort(portModule, async (assignment) => ({ kind: "ambiguous", reservationId: assignment.reservationId, operationKey: assignment.operationKey }));
    const uncertain = await operation.executeEnrichmentOperation(timed.repository, timeoutPort.port, { reservationId: timed.reservation.id, now: 1_103 });
    assert.equal(uncertain.kind, "needs_reconciliation"); assert.equal(timeoutPort.calls, 1); assert.equal(timed.state.status, "needs_reconciliation");
    assert.equal((await operation.executeEnrichmentOperation(timed.repository, timeoutPort.port, { reservationId: timed.reservation.id, now: 1_104 })).kind, "blocked");
    assert.equal(timeoutPort.calls, 1, "ambiguous acceptance is never retried or switched");

    const runnerAuthority = await configuredRunnerAuthority(runner, { maxRetries: 0, attempt: { attemptNumber: 0, previousOutcome: "none", previousOperationKeys: [] } });
    const runnerResult = await runner.reserveRunnerSpend({ async loadRunnerAuthority() { return runnerAuthority; }, async commitRunnerReservation(record) { return { kind: "created", record }; } }, { grantId: "runner-grant", principalSubject: "owner-synthetic", operationKey: await runner.deriveRunnerOperationKey(runnerAuthority), now: 1_100 });
    assert.equal(runnerResult.kind, "reserved");
    assert.equal(await runner.reserveRunnerSpend({ async loadRunnerAuthority() { return null; }, async commitRunnerReservation() { throw new Error("must not mutate"); } }, { grantId: grant.id, principalSubject: "owner-synthetic", operationKey: grant.tuple.operationKey, now: 1_100 }).then((value) => value.kind), "blocked", "an enrichment grant cannot be a runner grant");
  } finally {
    await vite.close();
  }
});

test("P5 preparation: stale, mismatched, expired, capped, and consumed reservation requests make zero calls and zero writes", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const [issuance, authority] = await Promise.all([module(vite, "enrichment-grant-issuance"), module(vite, "enrichment-authority")]);
    const grants = new Map(); const issueRepository = { async loadIssuanceSnapshot() { return currentSnapshot(); }, async findGrantByIdempotency(_workspaceId, key) { return grants.get(key) ?? null; }, async commitGrant(record) { grants.set(record.idempotencyKey, record); return { kind: "created", record }; }, nextNonce: () => "server-nonce" };
    const result = await issuance.issueEnrichmentGrant(issueRepository, issueInput()); assert.equal(result.kind, "issued"); const grant = result.grant;
    const fakePort = { calls: 0, async enrich() { this.calls += 1; } };
    const cases = [
      ["wrong owner", (value) => ({ ...value, principalSubject: "another-owner" })],
      ["wrong workspace", (value) => ({ ...value, workspaceId: "other-workspace" })],
      ["expired grant", (value) => ({ ...value, grant: { ...value.grant, tuple: { ...value.grant.tuple, expiresAt: 1_100 } } })],
      ["stale quote", (value) => ({ ...value, quote: { ...value.quote, revision: 3 } })],
      ["same-revision price changed", (value) => ({ ...value, quote: { ...value.quote, unitCostMinor: 12 } })],
      ["same-revision quote expiry changed", (value) => ({ ...value, quote: { ...value.quote, expiresAt: 1_999 } })],
      ["source revision changed", (value) => ({ ...value, sourceRevision: 8 })],
      ["prospect revision changed", (value) => ({ ...value, prospects: [{ ...value.prospects[0], revision: 5 }] })],
      ["tampered immutable tuple", (value) => ({ ...value, grant: { ...value.grant, tuple: { ...value.grant.tuple, workspaceId: "other-workspace" } } })],
      ["stale prospect", (value) => ({ ...value, prospects: [{ ...value.prospects[0], state: "deferred" }] })],
      ["over cap", (value) => ({ ...value, accounts: [budget("grant", 21, grant.id)] })],
      ["consumed", (value) => ({ ...value, grant: { ...value.grant, status: "consumed" } })],
    ];
    for (const [name, mutate] of cases) {
      const writes = [];
      const base = { admitted: true, principalSubject: "owner-synthetic", workspaceId: "workspace-synthetic", sourceRevision: 7, grant, configuration: currentSnapshot().configuration, prospects: currentSnapshot().prospects, quote: currentSnapshot().quote, accounts: [budget("grant", 22, grant.id), budget("profile", 22, grant.id), budget("workspace", 22, grant.id), budget("provider", 22, grant.id)], evidenceAssignments: [evidenceBinding()] };
      const denied = await authority.reserveEnrichmentOperation({ async loadReservationAuthority() { return mutate(base); }, async commitReservation(record) { writes.push(record); return { kind: "created", record }; }, async claimCommittedInvocation() { return null; }, async settleReservation() {}, async markNeedsReconciliation() {} }, { grantId: grant.id, principalSubject: "owner-synthetic", operationKey: grant.tuple.operationKey, now: 1_100 });
      assert.equal(denied.kind, "blocked", name); assert.deepEqual(writes, [], name); assert.equal(fakePort.calls, 0, name);
    }
  } finally { await vite.close(); }
});

test("P5 hardening: immutable grants and exact synthetic authority shapes fail closed before mutation", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const [issuance, authority, runner] = await Promise.all([module(vite, "enrichment-grant-issuance"), module(vite, "enrichment-authority"), module(vite, "runner-spend-authority")]);
    const grants = new Map(); const repository = { async loadIssuanceSnapshot() { return currentSnapshot(); }, async findGrantByIdempotency(_workspaceId, key) { return grants.get(key) ?? null; }, async commitGrant(record) { grants.set(record.idempotencyKey, record); return { kind: "created", record }; }, nextNonce: () => "server-nonce" };
    const issued = await issuance.issueEnrichmentGrant(repository, issueInput()); assert.equal(issued.kind, "issued"); const grant = issued.grant;
    assert.equal(Object.isFrozen(grant), true); assert.equal(Object.isFrozen(grant.tuple), true); assert.equal(Object.isFrozen(grant.tuple.prospectIds), true); assert.equal(Object.isFrozen(grant.tuple.prospectRevisions), true); assert.equal(Object.isFrozen(grant.tuple.prospectRevisions[0]), true);
    assert.throws(() => grant.tuple.prospectIds.push("prospect-other"), TypeError);
    for (const [name, snapshot, input] of [
      ["duplicate snapshot prospects", { ...currentSnapshot(), prospects: [{ ...currentSnapshot().prospects[0] }, { ...currentSnapshot().prospects[0] }] }, { ...issueInput(), prospectIds: ["prospect-a", "prospect-b"] }],
      ["unbounded workspace", { ...currentSnapshot(), workspaceId: "x".repeat(257) }, issueInput()],
      ["unbounded configuration", { ...currentSnapshot(), configuration: { ...currentSnapshot().configuration, id: "x".repeat(257) } }, issueInput()],
      ["nonpositive configuration revision", { ...currentSnapshot(), configuration: { ...currentSnapshot().configuration, revision: 0 } }, issueInput()],
      ["nonpositive prospect revision", { ...currentSnapshot(), prospects: [{ ...currentSnapshot().prospects[0], revision: 0 }] }, issueInput()],
      ["nonpositive quote revision", { ...currentSnapshot(), quote: { ...currentSnapshot().quote, revision: 0 } }, issueInput()],
      ["noninteger quote expiry", { ...currentSnapshot(), quote: { ...currentSnapshot().quote, expiresAt: 2_000.5 } }, issueInput()],
      ["nonpositive request timestamp", currentSnapshot(), { ...issueInput(), now: 0 }],
      ["unsafe unit calculation", { ...currentSnapshot(), quote: { ...currentSnapshot().quote, unitCostMinor: Number.MAX_SAFE_INTEGER } }, { ...issueInput(), maxCostMinor: Number.MAX_SAFE_INTEGER }],
      ["grant outlives quote", currentSnapshot(), { ...issueInput(), expiresAt: 2_001 }],
    ]) {
      const writes = [];
      const result = await issuance.issueEnrichmentGrant({ async loadIssuanceSnapshot() { return snapshot; }, async findGrantByIdempotency() { return null; }, async commitGrant(record) { writes.push(record); return { kind: "created", record }; }, nextNonce: () => "server-nonce" }, input);
      assert.equal(result.kind, "blocked", name); assert.deepEqual(writes, [], name);
    }
    for (const [name, input, accounts] of [
      ["wrong input grant id", { grantId: "grant-other", principalSubject: "owner-synthetic", operationKey: grant.tuple.operationKey, now: 1_100 }, [budget("grant", 22, grant.id), budget("profile", 22, grant.id), budget("workspace", 22, grant.id), budget("provider", 22, grant.id)] ],
      ["nonpositive reservation clock", { grantId: grant.id, principalSubject: "owner-synthetic", operationKey: grant.tuple.operationKey, now: 0 }, [budget("grant", 22, grant.id), budget("profile", 22, grant.id), budget("workspace", 22, grant.id), budget("provider", 22, grant.id)] ],
      ["duplicate budget scope", { grantId: grant.id, principalSubject: "owner-synthetic", operationKey: grant.tuple.operationKey, now: 1_100 }, [budget("grant", 22, grant.id), budget("profile", 22, grant.id), budget("profile", 22, grant.id), budget("provider", 22, grant.id)] ],
      ["missing budget scope", { grantId: grant.id, principalSubject: "owner-synthetic", operationKey: grant.tuple.operationKey, now: 1_100 }, [budget("grant", 22, grant.id), budget("profile", 22, grant.id), budget("workspace", 22, grant.id)] ],
    ]) {
      const writes = [];
      const result = await authority.reserveEnrichmentOperation({ async loadReservationAuthority() { return { admitted: true, principalSubject: "owner-synthetic", workspaceId: "workspace-synthetic", sourceRevision: 7, grant, configuration: currentSnapshot().configuration, prospects: currentSnapshot().prospects, quote: currentSnapshot().quote, accounts, evidenceAssignments: [evidenceBinding()] }; }, async commitReservation(record) { writes.push(record); return { kind: "created", record }; }, async claimCommittedInvocation() { return { kind: "blocked", reason: "unavailable" }; }, async settleReservation() {}, async markNeedsReconciliation() { return { kind: "recorded" }; }, async listInvocationsNeedingRecovery() { return []; } }, input);
      assert.equal(result.kind, "blocked", name); assert.deepEqual(writes, [], name);
    }
    const malformedWrites = [];
    const malformed = await runner.reserveRunnerSpend({ async loadRunnerAuthority() { return { admitted: true, workspaceId: "workspace-synthetic", principalSubject: "owner-synthetic", grant: { authorityType: "runner_spend", id: "", providerId: "", model: "", catalogRef: "", runType: "", scopeId: "", maxRetries: -1, currency: "US", expiresAt: 2_000, perRunCostMinor: -1, monthlyCostMinor: -1 }, perRun: budget("runner-run", 9), monthly: budget("runner-month", 9) }; }, async commitRunnerReservation(record) { malformedWrites.push(record); return { kind: "created", record }; } }, { grantId: "runner-grant", principalSubject: "owner-synthetic", operationKey: `ro_${"a".repeat(64)}`, now: 1_100 });
    assert.equal(malformed.kind, "blocked"); assert.deepEqual(malformedWrites, []);
    const runnerAuthority = { admitted: true, workspaceId: "workspace-synthetic", principalSubject: "owner-synthetic", grant: { authorityType: "runner_spend", id: "runner-grant", providerId: "synthetic-model-provider", model: "synthetic-model", catalogRef: "runner-catalog", runType: "prospecting", scopeId: "run-synthetic", maxRetries: 0, currency: "USD", expiresAt: 2_000, perRunCostMinor: 9, monthlyCostMinor: 9 }, attempt: { attemptNumber: 0, previousOutcome: "none", previousOperationKeys: [] }, perRun: budget("runner_per_run", 9), monthly: budget("runner_monthly", 9) };
    const semanticWrites = [];
    const wrongOperation = await runner.reserveRunnerSpend({ async loadRunnerAuthority() { return runnerAuthority; }, async commitRunnerReservation(record) { semanticWrites.push(record); return { kind: "created", record }; } }, { grantId: "runner-grant", principalSubject: "owner-synthetic", operationKey: `ro_${"b".repeat(64)}`, now: 1_100 });
    assert.equal(wrongOperation.kind, "blocked"); assert.deepEqual(semanticWrites, []);
  } finally { await vite.close(); }
});

test("P5 hardening: malformed fake-port outcomes and settlement failures hold a claimed reservation without retry", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const [issuance, authority, operation, portModule] = await Promise.all([
      module(vite, "enrichment-grant-issuance"),
      module(vite, "enrichment-authority"),
      module(vite, "enrichment-operation"),
      module(vite, "contact-provider-port"),
    ]);
    for (const [name, fake, settlementThrows, reconciliationThrows] of [
      ["null", { port: null, calls: 0 }, false, false],
      ["unknown kind", boundFakePort(portModule, async () => ({ kind: "other" })), false, false],
      ["oversized evidence", boundFakePort(portModule, async (assignment) => ({ kind: "completed", reservationId: assignment.reservationId, operationKey: assignment.operationKey, documentedUnits: 1, documentedCostMinor: 1, evidence: Array.from({ length: 101 }, () => ({})) })), false, false],
      ["settlement failure", boundFakePort(portModule, async (assignment) => ({ kind: "completed", reservationId: assignment.reservationId, operationKey: assignment.operationKey, documentedUnits: 1, documentedCostMinor: 1, evidence: [contactEnvelope()] })), true, false],
      ["reconciliation persistence failure", boundFakePort(portModule, async () => ({ kind: "other" })), false, true],
    ]) {
      let reconciled = 0;
      const admitted = await admittedExecutionRepository({
        issuance,
        authority,
        settle: settlementThrows
          ? async () => { throw new Error("settlement unavailable"); }
          : undefined,
        reconcile: async ({ state }, id, reason) => {
          reconciled += 1;
          if (reconciliationThrows) throw new Error("reconciliation unavailable");
          state.status = "needs_reconciliation";
          state.durableRevision += 1;
          return durableReconciliationAck(id, reason, state.durableRevision);
        },
      });
      const result = await operation.executeEnrichmentOperation(admitted.repository, fake.port, { reservationId: admitted.reservation.id, now: 1_100 });
      assert.equal(result.kind, reconciliationThrows ? "reconciliation_persistence_failure" : "needs_reconciliation", name); assert.equal(fake.calls <= 1, true, name); assert.notEqual(admitted.state.status, "reserved", name);
      assert.equal(reconciled, 1, name);
      assert.equal((await operation.executeEnrichmentOperation(admitted.repository, fake.port, { reservationId: admitted.reservation.id, now: 1_101 })).kind, "blocked", name);
    }
  } finally { await vite.close(); }
});

test("P5 hardening: exact provider binding and quote economics fail closed before call or settlement", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const [issuance, authority, operation, portModule] = await Promise.all([
      module(vite, "enrichment-grant-issuance"),
      module(vite, "enrichment-authority"),
      module(vite, "enrichment-operation"),
      module(vite, "contact-provider-port"),
    ]);
    for (const [name, descriptorPatch] of [
      ["provider id", { providerId: "wrong-provider" }],
      ["provider version", { providerVersion: "wrong-version" }],
      ["catalog reference", { catalogRef: "wrong-catalog" }],
    ]) {
      const fake = boundFakePort(portModule, async (value) => ({ kind: "completed", reservationId: value.reservationId, operationKey: value.operationKey, documentedUnits: 1, documentedCostMinor: 1, evidence: [contactEnvelope()] }), descriptorPatch);
      const state = { settled: 0, reconciled: 0, reason: null };
      const admitted = await admittedExecutionRepository({
        issuance,
        authority,
        settle: async (_context, id, settlement) => { state.settled += 1; return durableSettlementAck(id, settlement); },
        reconcile: async ({ state: durableState }, id, reason) => {
          state.reconciled += 1; state.reason = reason; durableState.status = "needs_reconciliation"; durableState.durableRevision += 1;
          return durableReconciliationAck(id, reason, durableState.durableRevision);
        },
      });
      const result = await operation.executeEnrichmentOperation(admitted.repository, fake.port, { reservationId: admitted.reservation.id, now: 1_100 });
      assert.equal(result.kind, "needs_reconciliation", name);
      assert.equal(fake.calls, 0, `${name}: mismatched adapter must not be invoked`);
      assert.equal(state.settled, 0, name);
      assert.equal(state.reconciled, 1, name);
      assert.equal(state.reason, "provider_port_mismatch", name);
    }

    for (const [name, makeOutcome] of [
      ["zero units at full cost", (assignment) => ({ kind: "completed", reservationId: assignment.reservationId, operationKey: assignment.operationKey, documentedUnits: 0, documentedCostMinor: 6, evidence: [] })],
      ["cost differs from quote", (assignment) => ({ kind: "partial", reservationId: assignment.reservationId, operationKey: assignment.operationKey, documentedUnits: 1, documentedCostMinor: 2, evidence: [contactEnvelope()] })],
      ["evidence count differs from units", (assignment) => ({ kind: "completed", reservationId: assignment.reservationId, operationKey: assignment.operationKey, documentedUnits: 2, documentedCostMinor: 6, evidence: [contactEnvelope()] })],
      ["units and cost exceed caps", (assignment) => ({ kind: "completed", reservationId: assignment.reservationId, operationKey: assignment.operationKey, documentedUnits: 3, documentedCostMinor: 9, evidence: [contactEnvelope(), contactEnvelope(), contactEnvelope()] })],
    ]) {
      const state = { settled: 0, reconciled: 0, reason: null };
      const admitted = await admittedExecutionRepository({
        issuance,
        authority,
        maxUnits: 2,
        maxCostMinor: 6,
        quoteUnitCostMinor: 3,
        evidenceAssignments: [
          evidenceBinding(),
          evidenceBinding({ assignmentId: "assignment-prospect-a-economic-buyer", role: "economic_buyer", contactId: "contact-economic-buyer" }),
        ],
        settle: async (_context, id, settlement) => { state.settled += 1; return durableSettlementAck(id, settlement); },
        reconcile: async ({ state: durableState }, id, reason) => {
          state.reconciled += 1; state.reason = reason; durableState.status = "needs_reconciliation"; durableState.durableRevision += 1;
          return durableReconciliationAck(id, reason, durableState.durableRevision);
        },
      });
      const fake = boundFakePort(portModule, async () => makeOutcome(admitted.assignment));
      const result = await operation.executeEnrichmentOperation(admitted.repository, fake.port, { reservationId: admitted.reservation.id, now: 1_100 });
      assert.equal(result.kind, "needs_reconciliation", name);
      assert.equal(fake.calls, 1, name);
      assert.equal(state.settled, 0, name);
      assert.equal(state.reconciled, 1, name);
      assert.equal(state.reason, "invalid_provider_outcome", name);
    }
  } finally { await vite.close(); }
});

test("P5 hardening: invocation expiry is atomic and provider evidence must pass exact assignment-bound ingestion", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const [issuance, authority, operation, portModule, evidenceModule] = await Promise.all([
      module(vite, "enrichment-grant-issuance"),
      module(vite, "enrichment-authority"),
      module(vite, "enrichment-operation"),
      module(vite, "contact-provider-port"),
      module(vite, "contact-evidence"),
    ]);
    const port = boundFakePort(portModule, async (assignment) => ({ kind: "completed", reservationId: assignment.reservationId, operationKey: assignment.operationKey, documentedUnits: 1, documentedCostMinor: 1, evidence: [contactEnvelope()] }));
    const expiredAdmission = await admittedExecutionRepository({ issuance, authority, expiresAt: 1_101 });
    const expired = await operation.executeEnrichmentOperation(expiredAdmission.repository, port.port, { reservationId: expiredAdmission.reservation.id, now: 1_101 });
    assert.equal(expired.kind, "blocked"); assert.equal(port.calls, 0); assert.equal(expiredAdmission.state.status, "released");
    let defensiveReconciled = 0;
    const defensiveAdmission = await admittedExecutionRepository({
      issuance,
      authority,
      claim: ({ state, record }, _id, now) => {
        state.status = "invoking";
        record.assignment.expiresAt = now;
        return { kind: "claimed", assignment: record.assignment, claimedAt: now };
      },
      reconcile: async ({ state }, id, reason) => {
        defensiveReconciled += 1; state.status = "needs_reconciliation"; state.durableRevision += 1;
        return durableReconciliationAck(id, reason, state.durableRevision);
      },
    });
    const defensiveExpiry = await operation.executeEnrichmentOperation(defensiveAdmission.repository, port.port, { reservationId: defensiveAdmission.reservation.id, now: 1_100 });
    assert.equal(defensiveExpiry.kind, "needs_reconciliation"); assert.equal(port.calls, 0); assert.equal(defensiveReconciled, 1);

    const state = { status: "reserved", settled: 0, promoted: 0, reconciled: 0, reconciliationReason: null };
    const invalidEvidencePort = boundFakePort(portModule, async (value) => ({ kind: "completed", reservationId: value.reservationId, operationKey: value.operationKey, documentedUnits: 1, documentedCostMinor: 1, evidence: [contactEnvelope({ workspaceId: "other-workspace" })] }));
    const evidenceAdmission = await admittedExecutionRepository({
      issuance,
      authority,
      settle: async (_context, id, settlement) => { state.settled += 1; state.promoted += settlement.observations.length; state.status = "settled"; return durableSettlementAck(id, settlement); },
      reconcile: async ({ state: durableState }, id, reason) => {
        state.reconciled += 1; state.reconciliationReason = reason; state.status = "needs_reconciliation"; durableState.status = "needs_reconciliation"; durableState.durableRevision += 1;
        return durableReconciliationAck(id, reason, durableState.durableRevision);
      },
    });
    const invalid = await operation.executeEnrichmentOperation(evidenceAdmission.repository, invalidEvidencePort.port, { reservationId: evidenceAdmission.reservation.id, now: 1_100 });
    assert.equal(invalid.kind, "needs_reconciliation"); assert.equal(state.reconciliationReason, "invalid_evidence"); assert.equal(invalidEvidencePort.calls, 1); assert.equal(state.settled, 0); assert.equal(state.promoted, 0); assert.equal(state.reconciled, 1);

    const acceptedState = { status: "reserved", observations: [] };
    const acceptedAdmission = await admittedExecutionRepository({
      issuance,
      authority,
      settle: async ({ state: durableState }, id, settlement) => {
        acceptedState.observations = settlement.observations; acceptedState.status = "settled"; durableState.status = "settled"; durableState.durableRevision += 1;
        return durableSettlementAck(id, settlement, durableState.durableRevision);
      },
    });
    const acceptedPort = boundFakePort(portModule, async (value) => ({ kind: "partial", reservationId: value.reservationId, operationKey: value.operationKey, documentedUnits: 1, documentedCostMinor: 1, evidence: [contactEnvelope()] }));
    const accepted = await operation.executeEnrichmentOperation(acceptedAdmission.repository, acceptedPort.port, { reservationId: acceptedAdmission.reservation.id, now: 1_100 });
    assert.equal(accepted.kind, "settled"); assert.equal(acceptedPort.calls, 1); assert.equal(acceptedState.observations.length, 1); assert.equal(acceptedState.observations[0].workspaceId, acceptedAdmission.assignment.workspaceId); assert.equal(acceptedState.observations[0].contactId, evidenceBinding().contactId); assert.equal(Object.isFrozen(acceptedState.observations[0]), true);
    assert.equal(acceptedState.observations[0].verificationClass, "suggested", "adapter-only evidence cannot self-certify eligibility");
    assert.equal(acceptedState.observations[0].providerId, null);

    const verifiedState = { status: "reserved", observations: [], reconciled: 0 };
    const verifiedAdmission = await admittedExecutionRepository({
      issuance,
      authority,
      settle: async ({ state: durableState }, id, settlement) => {
        verifiedState.observations = settlement.observations; verifiedState.status = "settled"; durableState.status = "settled"; durableState.durableRevision += 1;
        return durableSettlementAck(id, settlement, durableState.durableRevision);
      },
      reconcile: async ({ state: durableState }, id, reason) => {
        verifiedState.reconciled += 1; verifiedState.status = "needs_reconciliation"; durableState.status = "needs_reconciliation"; durableState.durableRevision += 1;
        return durableReconciliationAck(id, reason, durableState.durableRevision);
      },
    });
    const trustedVerifier = evidenceModule.bindContactEvidenceVerifier(
      { verifierId: "server-verifier", verifierVersion: "v1" },
      async ({ envelope: raw }) => contactVerification(raw),
    );
    const verified = await operation.executeEnrichmentOperation(verifiedAdmission.repository, acceptedPort.port, { reservationId: verifiedAdmission.reservation.id, now: 1_100 }, trustedVerifier);
    assert.equal(verified.kind, "settled"); assert.equal(verifiedState.reconciled, 0); assert.equal(verifiedState.observations.length, 1);
    assert.equal(verifiedState.observations[0].verificationClass, "mailbox_verified");
    assert.equal(verifiedState.observations[0].providerId, verifiedAdmission.assignment.providerId);
    assert.equal(verifiedState.observations[0].providerVersion, verifiedAdmission.assignment.providerVersion);
    assert.equal(verifiedState.observations[0].catalogRef, verifiedAdmission.assignment.catalogRef);
    assert.equal(verifiedState.observations[0].verificationAuthority.verifierId, "server-verifier");
    assert.equal(verifiedState.observations[0].verificationAuthority.verifierVersion, "v1");
    assert.equal(Object.isFrozen(trustedVerifier.descriptor), true);

    const rawVerifierState = { settled: 0, reconciled: 0 };
    const rawVerifierAdmission = await admittedExecutionRepository({
      issuance,
      authority,
      settle: async (_context, id, settlement) => { rawVerifierState.settled += 1; return durableSettlementAck(id, settlement); },
      reconcile: async ({ state: durableState }, id, reason) => {
        rawVerifierState.reconciled += 1; durableState.status = "needs_reconciliation"; durableState.durableRevision += 1;
        return durableReconciliationAck(id, reason, durableState.durableRevision);
      },
    });
    const rawVerifier = {
      kind: "bound",
      descriptor: { verifierId: "client-selected", verifierVersion: "v999" },
      async verify({ envelope: raw }) {
        return { ...contactVerification(raw), verifierId: "client-selected", verifierVersion: "v999" };
      },
    };
    const rawVerifierResult = await operation.executeEnrichmentOperation(
      rawVerifierAdmission.repository,
      acceptedPort.port,
      { reservationId: rawVerifierAdmission.reservation.id, now: 1_100 },
      rawVerifier,
    );
    assert.equal(rawVerifierResult.kind, "needs_reconciliation");
    assert.equal(rawVerifierState.settled, 0);
    assert.equal(rawVerifierState.reconciled, 1, "a structural verifier cannot mint a receipt");

    const multiState = { observations: [], reconciled: 0 };
    const multiAdmission = await admittedExecutionRepository({
      issuance,
      authority,
      maxUnits: 2,
      maxCostMinor: 2,
      evidenceAssignments: [
        evidenceBinding(),
        evidenceBinding({ assignmentId: "assignment-prospect-a-economic-buyer", role: "economic_buyer", contactId: "contact-economic-buyer" }),
      ],
      settle: async ({ state: durableState }, id, settlement) => {
        multiState.observations = settlement.observations; durableState.status = settlement.state; durableState.durableRevision += 1;
        return durableSettlementAck(id, settlement, durableState.durableRevision);
      },
      reconcile: async ({ state: durableState }, id, reason) => {
        multiState.reconciled += 1; durableState.status = "needs_reconciliation"; durableState.durableRevision += 1;
        return durableReconciliationAck(id, reason, durableState.durableRevision);
      },
    });
    const multiPort = boundFakePort(portModule, async (value) => ({
      kind: "completed", reservationId: value.reservationId, operationKey: value.operationKey,
      documentedUnits: 2, documentedCostMinor: 2,
      evidence: [
        contactEnvelope(),
        contactEnvelope({ id: "observation-economic-buyer", assignmentId: "assignment-prospect-a-economic-buyer", contactId: "contact-economic-buyer", value: "economic-buyer@example.invalid" }),
      ],
    }));
    const multi = await operation.executeEnrichmentOperation(multiAdmission.repository, multiPort.port, { reservationId: multiAdmission.reservation.id, now: 1_100 });
    assert.equal(multi.kind, "settled");
    assert.equal(multiState.reconciled, 0);
    assert.deepEqual(multiState.observations.map((observation) => observation.contactId), ["contact-synthetic", "contact-economic-buyer"]);

    const duplicateState = { settled: 0, reconciled: 0, reason: null };
    const duplicateAdmission = await admittedExecutionRepository({
      issuance,
      authority,
      maxUnits: 2,
      maxCostMinor: 2,
      evidenceAssignments: [
        evidenceBinding(),
        evidenceBinding({ assignmentId: "assignment-prospect-a-economic-buyer", role: "economic_buyer", contactId: "contact-economic-buyer" }),
      ],
      settle: async (_context, id, settlement) => { duplicateState.settled += 1; return durableSettlementAck(id, settlement); },
      reconcile: async ({ state: durableState }, id, reason) => {
        duplicateState.reconciled += 1; duplicateState.reason = reason; durableState.status = "needs_reconciliation"; durableState.durableRevision += 1;
        return durableReconciliationAck(id, reason, durableState.durableRevision);
      },
    });
    const duplicatePort = boundFakePort(portModule, async (value) => ({
      kind: "completed",
      reservationId: value.reservationId,
      operationKey: value.operationKey,
      documentedUnits: 2,
      documentedCostMinor: 2,
      evidence: [
        contactEnvelope(),
        contactEnvelope({ id: "observation-duplicate", value: "duplicate@example.invalid" }),
      ],
    }));
    const duplicate = await operation.executeEnrichmentOperation(
      duplicateAdmission.repository,
      duplicatePort.port,
      { reservationId: duplicateAdmission.reservation.id, now: 1_100 },
    );
    assert.equal(duplicate.kind, "needs_reconciliation");
    assert.equal(duplicateState.reason, "invalid_evidence");
    assert.equal(duplicateState.settled, 0);
    assert.equal(duplicateState.reconciled, 1, "one assignment/contact cannot be billed twice");

    const forgedProviderState = { settled: 0, reconciled: 0 };
    const forgedProviderAdmission = await admittedExecutionRepository({
      issuance,
      authority,
      settle: async (_context, id, settlement) => { forgedProviderState.settled += 1; return durableSettlementAck(id, settlement); },
      reconcile: async ({ state: durableState }, id, reason) => {
        forgedProviderState.reconciled += 1; durableState.status = "needs_reconciliation"; durableState.durableRevision += 1;
        return durableReconciliationAck(id, reason, durableState.durableRevision);
      },
    });
    const forgedProvider = await operation.executeEnrichmentOperation(
      forgedProviderAdmission.repository,
      acceptedPort.port,
      { reservationId: forgedProviderAdmission.reservation.id, now: 1_100 },
      evidenceModule.bindContactEvidenceVerifier(
        { verifierId: "server-verifier", verifierVersion: "v1" },
        async ({ envelope: raw }) => contactVerification(raw, { providerId: "different-provider" }),
      ),
    );
    assert.equal(forgedProvider.kind, "needs_reconciliation");
    assert.equal(forgedProviderState.settled, 0);
    assert.equal(forgedProviderState.reconciled, 1);
  } finally { await vite.close(); }
});

test("P5 hardening: claimed assignments and hostile provider outcomes cannot leak extra fields or escape reconciliation", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const [issuance, authority, operation, portModule] = await Promise.all([
      module(vite, "enrichment-grant-issuance"),
      module(vite, "enrichment-authority"),
      module(vite, "enrichment-operation"),
      module(vite, "contact-provider-port"),
    ]);
    let extraGetterReads = 0;
    const assignmentState = { settled: 0, reconciled: 0, reason: null };
    const assignmentAdmission = await admittedExecutionRepository({
      issuance,
      authority,
      settle: async (_context, id, settlement) => { assignmentState.settled += 1; return durableSettlementAck(id, settlement); },
      reconcile: async ({ state }, id, reason) => {
        assignmentState.reconciled += 1; assignmentState.reason = reason; state.status = "needs_reconciliation"; state.durableRevision += 1;
        return durableReconciliationAck(id, reason, state.durableRevision);
      },
    });
    Object.defineProperty(assignmentAdmission.assignment, "secretLike", {
      enumerable: true,
      get() { extraGetterReads += 1; return "must-not-leak"; },
    });
    const assignmentPort = boundFakePort(portModule, async () => { throw new Error("must not call"); });
    const assignmentResult = await operation.executeEnrichmentOperation(
      assignmentAdmission.repository,
      assignmentPort.port,
      { reservationId: assignmentAdmission.reservation.id, now: 1_100 },
    );
    assert.equal(assignmentResult.kind, "needs_reconciliation");
    assert.equal(assignmentState.reason, "invalid_assignment");
    assert.equal(assignmentPort.calls, 0);
    assert.equal(assignmentState.settled, 0);
    assert.equal(extraGetterReads, 0, "unknown claimed fields are rejected before access");

    const bindingPort = boundFakePort(portModule, async () => { throw new Error("must not call"); });
    const bindingState = { settled: 0, reconciled: 0 };
    const bindingAdmission = await admittedExecutionRepository({
      issuance,
      authority,
      settle: async (_context, id, settlement) => { bindingState.settled += 1; return durableSettlementAck(id, settlement); },
      reconcile: async ({ state }, id, reason) => {
        bindingState.reconciled += 1; state.status = "needs_reconciliation"; state.durableRevision += 1;
        return durableReconciliationAck(id, reason, state.durableRevision);
      },
    });
    bindingAdmission.assignment.evidenceAssignments[0].secretLike = "must-not-leak";
    const bindingResult = await operation.executeEnrichmentOperation(
      bindingAdmission.repository,
      bindingPort.port,
      { reservationId: bindingAdmission.reservation.id, now: 1_100 },
    );
    assert.equal(bindingResult.kind, "needs_reconciliation");
    assert.equal(bindingPort.calls, 0);
    assert.equal(bindingState.settled, 0);
    assert.equal(bindingState.reconciled, 1);

    let hostileGetterReads = 0;
    const hostileState = { settled: 0, reconciled: 0, reason: null };
    const hostileAdmission = await admittedExecutionRepository({
      issuance,
      authority,
      settle: async (_context, id, settlement) => { hostileState.settled += 1; return durableSettlementAck(id, settlement); },
      reconcile: async ({ state }, id, reason) => {
        hostileState.reconciled += 1; hostileState.reason = reason; state.status = "needs_reconciliation"; state.durableRevision += 1;
        return durableReconciliationAck(id, reason, state.durableRevision);
      },
    });
    const hostileOutcome = {
      kind: "completed",
      reservationId: hostileAdmission.assignment.reservationId,
      operationKey: hostileAdmission.assignment.operationKey,
      documentedUnits: 1,
      documentedCostMinor: 1,
      get evidence() { hostileGetterReads += 1; throw new Error("hostile getter"); },
    };
    const hostilePort = boundFakePort(portModule, async () => hostileOutcome);
    const hostileResult = await operation.executeEnrichmentOperation(
      hostileAdmission.repository,
      hostilePort.port,
      { reservationId: hostileAdmission.reservation.id, now: 1_100 },
    );
    assert.equal(hostileResult.kind, "needs_reconciliation");
    assert.equal(hostileState.reason, "invalid_provider_outcome");
    assert.equal(hostilePort.calls, 1);
    assert.equal(hostileGetterReads, 0, "provider outcome accessors are rejected without evaluation");
    assert.equal(hostileState.settled, 0);
    assert.equal(hostileState.reconciled, 1);
  } finally { await vite.close(); }
});

test("P5 hardening: committed admission and durable acknowledgements reject clones, no-ops, and forged receipts", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const [issuance, authority, operation, portModule] = await Promise.all([
      module(vite, "enrichment-grant-issuance"),
      module(vite, "enrichment-authority"),
      module(vite, "enrichment-operation"),
      module(vite, "contact-provider-port"),
    ]);
    const neverCalled = boundFakePort(portModule, async () => { throw new Error("must not call"); });
    const rehydratedRepository = {
      async claimCommittedInvocation() { return { kind: "claimed", assignment: authorizedAssignment(), claimedAt: 1_100 }; },
      async settleReservation() { throw new Error("unreachable"); },
      async markNeedsReconciliation() { throw new Error("unreachable"); },
      async listInvocationsNeedingRecovery() { return []; },
    };
    assert.equal(
      (await operation.executeEnrichmentOperation(rehydratedRepository, neverCalled.port, { reservationId: "reservation-hardened", now: 1_100 })).kind,
      "blocked",
      "persisted rehydration has no process-local admission receipt",
    );
    assert.equal(neverCalled.calls, 0);

    for (const [name, mutate] of [
      ["exact clone", (assignment) => ({ ...assignment, prospectIds: [...assignment.prospectIds], evidenceAssignments: assignment.evidenceAssignments.map((item) => ({ ...item })) })],
      ["alternate provider", (assignment) => ({ ...assignment, providerId: "alternate-provider" })],
      ["alternate scope", (assignment) => ({ ...assignment, workspaceId: "alternate-workspace" })],
    ]) {
      const admitted = await admittedExecutionRepository({
        issuance,
        authority,
        claim: ({ state, record }, _id, now) => {
          state.status = "invoking";
          return { kind: "claimed", assignment: mutate(record.assignment), claimedAt: now };
        },
      });
      const result = await operation.executeEnrichmentOperation(admitted.repository, neverCalled.port, { reservationId: admitted.reservation.id, now: 1_100 });
      assert.equal(result.kind, "needs_reconciliation", name);
      assert.equal(admitted.state.status, "needs_reconciliation", name);
      assert.equal(neverCalled.calls, 0, name);
    }

    const uncertainClaim = await admittedExecutionRepository({
      issuance,
      authority,
      claim: () => { throw new Error("claim acknowledgement lost"); },
    });
    assert.equal(
      (await operation.executeEnrichmentOperation(uncertainClaim.repository, neverCalled.port, { reservationId: uncertainClaim.reservation.id, now: 1_100 })).kind,
      "needs_reconciliation",
      "a claim error is contained as uncertainty rather than made retryable",
    );
    assert.equal(uncertainClaim.state.status, "needs_reconciliation");
    assert.equal(neverCalled.calls, 0);

    let claimGetterReads = 0;
    const accessorClaim = await admittedExecutionRepository({
      issuance,
      authority,
      claim: ({ state, record }, _id, now) => {
        state.status = "invoking";
        return {
          kind: "claimed",
          get assignment() { claimGetterReads += 1; return record.assignment; },
          claimedAt: now,
        };
      },
    });
    assert.equal(
      (await operation.executeEnrichmentOperation(accessorClaim.repository, neverCalled.port, { reservationId: accessorClaim.reservation.id, now: 1_100 })).kind,
      "needs_reconciliation",
    );
    assert.equal(claimGetterReads, 0, "claim accessors are rejected without evaluation");
    assert.equal(neverCalled.calls, 0);

    for (const [name, settle] of [
      ["no-op settlement", async () => undefined],
      ["forged settlement acknowledgement", async (_context, id, settlement) => ({ ...durableSettlementAck(id, settlement), durableRevision: 0 })],
      ["wrong settlement digest", async (_context, id, settlement) => ({ ...durableSettlementAck(id, settlement), settlementDigest: "f".repeat(64) })],
      ["wrong settlement observations", async (_context, id, settlement) => ({ ...durableSettlementAck(id, settlement), observationIds: ["other-observation"] })],
      ["extra settlement acknowledgement field", async (_context, id, settlement) => ({ ...durableSettlementAck(id, settlement), forged: true })],
    ]) {
      let reconciliationReason = null;
      const admitted = await admittedExecutionRepository({
        issuance,
        authority,
        settle,
        reconcile: async ({ state }, id, reason) => {
          reconciliationReason = reason; state.status = "needs_reconciliation"; state.durableRevision += 1;
          return durableReconciliationAck(id, reason, state.durableRevision);
        },
      });
      const fake = boundFakePort(portModule, async (assignment) => ({
        kind: "completed",
        reservationId: assignment.reservationId,
        operationKey: assignment.operationKey,
        documentedUnits: 1,
        documentedCostMinor: 1,
        evidence: [contactEnvelope()],
      }));
      const result = await operation.executeEnrichmentOperation(admitted.repository, fake.port, { reservationId: admitted.reservation.id, now: 1_100 });
      assert.equal(result.kind, "needs_reconciliation", name);
      assert.equal(reconciliationReason, "settlement_failure", name);
      assert.equal(fake.calls, 1, name);
    }

    for (const [name, reconcile] of [
      ["no-op reconciliation", async () => undefined],
      ["forged reconciliation acknowledgement", async (_context, id, reason) => ({ ...durableReconciliationAck(id, reason), reservationId: "other-reservation" })],
      ["wrong reconciliation reason", async (_context, id) => durableReconciliationAck(id, "ambiguous")],
      ["extra reconciliation acknowledgement field", async (_context, id, reason) => ({ ...durableReconciliationAck(id, reason), forged: true })],
    ]) {
      const admitted = await admittedExecutionRepository({ issuance, authority, reconcile });
      const fake = boundFakePort(portModule, async () => ({ kind: "other" }));
      const result = await operation.executeEnrichmentOperation(admitted.repository, fake.port, { reservationId: admitted.reservation.id, now: 1_100 });
      assert.equal(result.kind, "reconciliation_persistence_failure", name);
      assert.equal(fake.calls, 1, name);
    }
  } finally { await vite.close(); }
});

test("P5 hardening: Runner retry attempts are immutable, bounded, duplicate-safe, and uncertainty-stopped", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const runner = await module(vite, "runner-spend-authority");
    const base = await configuredRunnerAuthority(runner, { maxRetries: 1, attempt: { attemptNumber: 0, previousOutcome: "none", previousOperationKeys: [] } });
    const firstKey = await runner.deriveRunnerOperationKey(base);
    const duplicateSeed = await configuredRunnerAuthority(runner, { maxRetries: 1, attempt: { attemptNumber: 1, previousOutcome: "failed_retryable", previousOperationKeys: [firstKey] } });
    const duplicateKey = await runner.deriveRunnerOperationKey(duplicateSeed);
    for (const [name, authority, operationKey] of [
      ["exhausted", await configuredRunnerAuthority(runner, { maxRetries: 0, attempt: { attemptNumber: 1, previousOutcome: "failed_retryable", previousOperationKeys: [firstKey] } }), await runner.deriveRunnerOperationKey(await configuredRunnerAuthority(runner, { maxRetries: 0, attempt: { attemptNumber: 1, previousOutcome: "failed_retryable", previousOperationKeys: [firstKey] } }))],
      ["uncertain", await configuredRunnerAuthority(runner, { maxRetries: 1, attempt: { attemptNumber: 1, previousOutcome: "uncertain", previousOperationKeys: [firstKey] } }), await runner.deriveRunnerOperationKey(await configuredRunnerAuthority(runner, { maxRetries: 1, attempt: { attemptNumber: 1, previousOutcome: "uncertain", previousOperationKeys: [firstKey] } }))],
      ["duplicate", await configuredRunnerAuthority(runner, { maxRetries: 1, attempt: { attemptNumber: 1, previousOutcome: "failed_retryable", previousOperationKeys: [duplicateKey] } }), duplicateKey],
    ]) {
      const writes = [];
      const result = await runner.reserveRunnerSpend({ async loadRunnerAuthority() { return authority; }, async commitRunnerReservation(record) { writes.push(record); return { kind: "created", record }; } }, { grantId: authority.grant.id, principalSubject: authority.principalSubject, operationKey, now: 1_100 });
      assert.equal(result.kind, "blocked", name); assert.deepEqual(writes, [], name);
    }
    const retryWrites = [];
    const retry = await runner.reserveRunnerSpend({ async loadRunnerAuthority() { return duplicateSeed; }, async commitRunnerReservation(record, _accounts, attempt) { retryWrites.push({ record, attempt }); return { kind: "created", record }; } }, { grantId: duplicateSeed.grant.id, principalSubject: duplicateSeed.principalSubject, operationKey: duplicateKey, now: 1_100 });
    assert.equal(retry.kind, "reserved"); assert.equal(retry.reservation.attemptNumber, 1); assert.equal(retry.reservation.maxRetries, 1); assert.match(retry.reservation.attemptDigest, /^[a-f0-9]{64}$/); assert.equal(Object.isFrozen(retryWrites[0].attempt), true); assert.equal(Object.isFrozen(retryWrites[0].attempt.previousOperationKeys), true);
  } finally { await vite.close(); }
});

function currentSnapshot() {
  return { admitted: true, workspaceId: "workspace-synthetic", ownerSubject: "owner-synthetic", revision: 7, configuration: { id: "config-synthetic", digest: "a".repeat(64), revision: 3, current: true }, prospects: [{ id: "prospect-a", state: "approved", configurationId: "config-synthetic", configurationDigest: "a".repeat(64), revision: 4 }], quote: { providerId: "synthetic-provider", providerVersion: "v1", catalogRef: "catalog-synthetic", revision: 2, currency: "USD", unitCostMinor: 11, expiresAt: 2_000 } };
}
function issueInput() { return { principalSubject: "owner-synthetic", prospectIds: ["prospect-a"], operation: "business_contact_lookup/v1", maxUnits: 2, maxCostMinor: 22, currency: "USD", expiresAt: 1_500, expectedRevision: 7, idempotencyKey: "issue-synthetic-2", now: 1_000 }; }
function budget(scope, maxCostMinor = 22, grantId = "runner-grant") {
  const workspaceId = "workspace-synthetic";
  const entityId = scope === "grant" ? grantId : scope === "profile" ? "config-synthetic" : scope === "workspace" ? workspaceId : "synthetic-provider";
  return {
    authorityType: "enrichment",
    accountId: `enrichment:${workspaceId.length}:${workspaceId}:${scope}:${entityId.length}:${entityId}`,
    scope, workspaceId, entityId, currency: "USD",
    actualUnits: 0, reservedUnits: 0, maxUnits: 2,
    actualCostMinor: 0, reservedCostMinor: 0, maxCostMinor,
  };
}
function evidenceBinding(patch = {}) { return { assignmentId: "assignment-prospect-a-champion", prospectId: "prospect-a", role: "champion", workspaceId: "workspace-synthetic", contactId: "contact-synthetic", profileConfigurationId: "config-synthetic", profileConfigurationDigest: "a".repeat(64), ...patch }; }
function authorizedAssignment(patch = {}) { return { reservationId: "reservation-hardened", workspaceId: "workspace-synthetic", configurationId: "config-synthetic", configurationDigest: "a".repeat(64), operationKey: `op_${"a".repeat(64)}`, providerId: "synthetic-provider", providerVersion: "v1", catalogRef: "catalog-synthetic", quoteRevision: 1, quoteUnitCostMinor: 1, prospectIds: ["prospect-a"], operation: "business_contact_lookup/v1", maxUnits: 1, maxCostMinor: 1, currency: "USD", expiresAt: 2_000, evidenceAssignments: [evidenceBinding()], ...patch }; }
function contactEnvelope(patch = {}) { return { id: "observation-synthetic", assignmentId: "assignment-prospect-a-champion", prospectId: "prospect-a", workspaceId: "workspace-synthetic", contactId: "contact-synthetic", profileConfigurationId: "config-synthetic", profileConfigurationDigest: "a".repeat(64), kind: "email", value: "synthetic-contact@example.invalid", confidence: 1, provenance: { sourceReference: "source-synthetic", excerpt: "synthetic excerpt", objectReference: "object-synthetic", contentHash: "b".repeat(64), retrievedAt: 1_090 }, observedAt: 1_100, ...patch }; }
function contactVerification(raw = contactEnvelope(), patch = {}) { return { observationId: raw.id, workspaceId: raw.workspaceId, contactId: raw.contactId, profileConfigurationId: raw.profileConfigurationId, profileConfigurationDigest: raw.profileConfigurationDigest, kind: raw.kind, normalizedValue: String(raw.value).trim().toLowerCase(), contentHash: raw.provenance.contentHash, verificationClass: "mailbox_verified", method: "mailbox_verification", verifiedAt: 1_095, providerId: "synthetic-provider", providerVersion: "v1", catalogRef: "catalog-synthetic", verdictReference: "verdict-synthetic", verdictDigest: "d".repeat(64), ...patch }; }
async function configuredRunnerAuthority(runner, { maxRetries, attempt }) {
  const principalSubject = "owner-synthetic";
  const grant = { authorityType: "runner_spend", id: "runner-grant", providerId: "synthetic-model-provider", model: "synthetic-model", catalogRef: "runner-catalog", runType: "prospecting", scopeId: "run-synthetic", maxRetries, currency: "USD", expiresAt: 2_000, perRunCostMinor: 9, monthlyCostMinor: 9 };
  const workspaceId = "workspace-synthetic";
  const seed = { admitted: true, workspaceId, principalSubject, grant, attempt };
  const operationKey = await runner.deriveRunnerOperationKey(seed);
  const period = runner.deriveRunnerUtcMonthPeriod(1_100);
  return {
    ...seed,
    perRun: {
      authorityType: "runner_spend",
      accountId: runner.deriveRunnerPerRunAccountId({ workspaceId, principalSubject, grantId: grant.id, providerId: grant.providerId, scopeId: grant.scopeId, attemptNumber: attempt.attemptNumber, operationKey }),
      scope: "runner_per_run", principalSubject, grantId: grant.id, providerId: grant.providerId, scopeId: grant.scopeId,
      attemptNumber: attempt.attemptNumber, operationKey, currency: "USD",
      actualCostMinor: 0, reservedCostMinor: 0, maxCostMinor: 9,
    },
    monthly: {
      authorityType: "runner_spend",
      accountId: runner.deriveRunnerMonthlyAccountId({ workspaceId, principalSubject, providerId: grant.providerId, scopeId: grant.scopeId, period }),
      scope: "runner_monthly", principalSubject, grantId: grant.id, providerId: grant.providerId, scopeId: grant.scopeId,
      period, currency: "USD", actualCostMinor: 0, reservedCostMinor: 0, maxCostMinor: 9,
    },
  };
}
function boundFakePort(portModule, enrich, descriptorPatch = {}) {
  const tracker = { calls: 0, port: null };
  tracker.port = portModule.bindContactProviderPort(
    { providerId: "synthetic-provider", providerVersion: "v1", catalogRef: "catalog-synthetic", ...descriptorPatch },
    async (assignment) => { tracker.calls += 1; return enrich(assignment); },
  );
  return tracker;
}

let admissionSequence = 0;
async function admittedExecutionRepository({
  issuance,
  authority,
  maxUnits = 1,
  maxCostMinor = maxUnits,
  quoteUnitCostMinor = 1,
  expiresAt = 2_000,
  evidenceAssignments = [evidenceBinding()],
  claim,
  settle,
  reconcile,
}) {
  admissionSequence += 1;
  const snapshot = {
    ...currentSnapshot(),
    quote: {
      ...currentSnapshot().quote,
      unitCostMinor: quoteUnitCostMinor,
      expiresAt: Math.max(expiresAt, 2_000),
    },
  };
  const issueRepository = {
    async loadIssuanceSnapshot() { return snapshot; },
    async findGrantByIdempotency() { return null; },
    async commitGrant(record) { return { kind: "created", record }; },
    nextNonce: () => `server-nonce-admission-${admissionSequence}`,
  };
  const issued = await issuance.issueEnrichmentGrant(issueRepository, {
    ...issueInput(),
    maxUnits,
    maxCostMinor,
    expiresAt,
    idempotencyKey: `issue-admission-${admissionSequence}`,
  });
  assert.equal(issued.kind, "issued");
  const state = { status: "unreserved", record: null, durableRevision: 0 };
  const repository = {
    async loadReservationAuthority() {
      return {
        admitted: true,
        principalSubject: snapshot.ownerSubject,
        workspaceId: snapshot.workspaceId,
        sourceRevision: snapshot.revision,
        grant: issued.grant,
        configuration: snapshot.configuration,
        prospects: snapshot.prospects,
        quote: snapshot.quote,
        accounts: [
          budget("grant", maxCostMinor, issued.grant.id),
          budget("profile", maxCostMinor, issued.grant.id),
          budget("workspace", maxCostMinor, issued.grant.id),
          budget("provider", maxCostMinor, issued.grant.id),
        ],
        evidenceAssignments,
      };
    },
    async commitReservation(record) {
      state.record = record;
      state.status = "reserved";
      return { kind: "created", record };
    },
    async claimCommittedInvocation(id, now) {
      if (claim) return claim({ state, record: state.record }, id, now);
      if (!state.record || state.status !== "reserved") return { kind: "blocked", reason: "unavailable" };
      if (state.record.assignment.expiresAt <= now) {
        state.status = "released";
        return { kind: "blocked", reason: "expired" };
      }
      state.status = "invoking";
      return { kind: "claimed", assignment: state.record.assignment, claimedAt: now };
    },
    async settleReservation(id, settlementWrite) {
      if (settle) return settle({ state, record: state.record }, id, settlementWrite);
      state.status = settlementWrite.state;
      state.durableRevision += 1;
      return durableSettlementAck(id, settlementWrite, state.durableRevision);
    },
    async markNeedsReconciliation(id, reason) {
      if (reconcile) return reconcile({ state, record: state.record }, id, reason);
      state.status = "needs_reconciliation";
      state.durableRevision += 1;
      return durableReconciliationAck(id, reason, state.durableRevision);
    },
    async listInvocationsNeedingRecovery() {
      return state.status === "invoking" && state.record
        ? [{ reservationId: state.record.id, operationKey: state.record.operationKey, claimedAt: 1_100, expiresAt: state.record.assignment.expiresAt, status: "invoking" }]
        : [];
    },
  };
  const reserved = await authority.reserveEnrichmentOperation(repository, {
    grantId: issued.grant.id,
    principalSubject: snapshot.ownerSubject,
    operationKey: issued.grant.tuple.operationKey,
    now: 1_100,
  });
  assert.equal(reserved.kind, "reserved");
  return { repository, state, reservation: reserved.reservation, assignment: state.record.assignment };
}

function durableSettlementAck(reservationId, settlement, durableRevision = 1) {
  return {
    kind: "durably_recorded",
    reservationId,
    terminalState: settlement.state,
    terminalReason: settlement.reason,
    settlementDigest: settlement.settlementDigest,
    observationIds: settlement.observations.map((observation) => observation.id),
    durableRevision,
  };
}

function durableReconciliationAck(reservationId, reason, durableRevision = 1) {
  return {
    kind: "durably_recorded",
    reservationId,
    terminalState: "needs_reconciliation",
    terminalReason: reason,
    settlementDigest: null,
    observationIds: [],
    durableRevision,
  };
}
