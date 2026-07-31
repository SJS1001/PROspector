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
    const input = { principalSubject: "owner-synthetic", prospectIds: ["prospect-b", "prospect-a"], operation: "business_contact_lookup/v1", maxUnits: 2, maxCostMinor: 22, currency: "USD", expiresAt: 1_500, expectedRevision: 7, idempotencyKey: "issue-synthetic-1", now: 1_000, nonce: "nonce-synthetic" };
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
          accounts: [budget("grant"), budget("profile"), budget("workspace"), budget("provider")],
        } : null;
      },
      async commitReservation(record) { mutations.push(["reserve", record.id]); reservations.set(record.id, record); return { kind: "created", record }; },
      async claimCommittedInvocation(id) { const record = reservations.get(id); if (!record || record.status !== "reserved") return null; record.status = "invoking"; mutations.push(["claim", id]); return record.assignment; },
      async settleReservation(id, settlement) { mutations.push(["settle", id, settlement.state]); reservations.get(id).status = settlement.state; },
      async markNeedsReconciliation(id) { mutations.push(["reconcile", id]); reservations.get(id).status = "needs_reconciliation"; },
    };
    const fake = { calls: 0, async enrich(assignment) { this.calls += 1; return { kind: "partial", reservationId: assignment.reservationId, operationKey: assignment.operationKey, documentedUnits: 1, documentedCostMinor: 11, evidence: [] }; } };
    const denied = await authority.reserveEnrichmentOperation(reservationAuthority, { grantId: grant.id, principalSubject: "owner-synthetic", operationKey: "op_client_selected", now: 1_100 });
    assert.equal(denied.kind, "blocked"); assert.equal(fake.calls, 0); assert.deepEqual(mutations, []);
    const reserved = await authority.reserveEnrichmentOperation(reservationAuthority, { grantId: grant.id, principalSubject: "owner-synthetic", operationKey: grant.tuple.operationKey, now: 1_100 });
    assert.equal(reserved.kind, "reserved"); assert.equal(fake.calls, 0); assert.deepEqual(mutations[0][0], "reserve");
    const delivered = await operation.executeEnrichmentOperation(reservationAuthority, fake, { reservationId: reserved.reservation.id, now: 1_101 });
    assert.equal(delivered.kind, "settled"); assert.equal(fake.calls, 1); assert.deepEqual(mutations.map((entry) => entry[0]), ["reserve", "claim", "settle"]);
    assert.equal(portModule.productionContactProviderPort.kind, "unconfigured");
    await assert.rejects(() => portModule.productionContactProviderPort.enrich({}), /contact_provider_unconfigured/);
    const retry = await operation.executeEnrichmentOperation(reservationAuthority, fake, { reservationId: reserved.reservation.id, now: 1_102 });
    assert.equal(retry.kind, "blocked"); assert.equal(fake.calls, 1);

    const timedOutReservation = { ...reserved.reservation, id: "reservation-timeout", status: "reserved" }; reservations.set(timedOutReservation.id, timedOutReservation);
    const timeoutPort = { calls: 0, async enrich(assignment) { this.calls += 1; return { kind: "ambiguous", reservationId: assignment.reservationId, operationKey: assignment.operationKey }; } };
    const uncertain = await operation.executeEnrichmentOperation(reservationAuthority, timeoutPort, { reservationId: timedOutReservation.id, now: 1_103 });
    assert.equal(uncertain.kind, "needs_reconciliation"); assert.equal(timeoutPort.calls, 1); assert.equal(timedOutReservation.status, "needs_reconciliation");
    assert.equal((await operation.executeEnrichmentOperation(reservationAuthority, timeoutPort, { reservationId: timedOutReservation.id, now: 1_104 })).kind, "blocked");
    assert.equal(timeoutPort.calls, 1, "ambiguous acceptance is never retried or switched");

    const runnerAuthority = { grant: { authorityType: "runner_spend", id: "runner-grant", providerId: "synthetic-model-provider", model: "synthetic-model", catalogRef: "runner-catalog", runType: "prospecting", scopeId: "run-synthetic", maxRetries: 0, currency: "USD", expiresAt: 2_000, perRunCostMinor: 9, monthlyCostMinor: 9 }, admitted: true, principalSubject: "owner-synthetic", perRun: budget("runner_per_run", 9), monthly: budget("runner_monthly", 9) };
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
      ["over cap", (value) => ({ ...value, accounts: [budget("grant", 21)] })],
      ["consumed", (value) => ({ ...value, grant: { ...value.grant, status: "consumed" } })],
    ];
    for (const [name, mutate] of cases) {
      const writes = [];
      const base = { admitted: true, principalSubject: "owner-synthetic", workspaceId: "workspace-synthetic", sourceRevision: 7, grant, configuration: currentSnapshot().configuration, prospects: currentSnapshot().prospects, quote: currentSnapshot().quote, accounts: [budget("grant"), budget("profile"), budget("workspace"), budget("provider")] };
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
      ["wrong input grant id", { grantId: "grant-other", principalSubject: "owner-synthetic", operationKey: grant.tuple.operationKey, now: 1_100 }, [budget("grant"), budget("profile"), budget("workspace"), budget("provider")] ],
      ["duplicate budget scope", { grantId: grant.id, principalSubject: "owner-synthetic", operationKey: grant.tuple.operationKey, now: 1_100 }, [budget("grant"), budget("profile"), budget("profile"), budget("provider")] ],
      ["missing budget scope", { grantId: grant.id, principalSubject: "owner-synthetic", operationKey: grant.tuple.operationKey, now: 1_100 }, [budget("grant"), budget("profile"), budget("workspace")] ],
    ]) {
      const writes = [];
      const result = await authority.reserveEnrichmentOperation({ async loadReservationAuthority() { return { admitted: true, principalSubject: "owner-synthetic", workspaceId: "workspace-synthetic", sourceRevision: 7, grant, configuration: currentSnapshot().configuration, prospects: currentSnapshot().prospects, quote: currentSnapshot().quote, accounts }; }, async commitReservation(record) { writes.push(record); return { kind: "created", record }; }, async claimCommittedInvocation() { return null; }, async settleReservation() {}, async markNeedsReconciliation() {} }, input);
      assert.equal(result.kind, "blocked", name); assert.deepEqual(writes, [], name);
    }
    const malformedWrites = [];
    const malformed = await runner.reserveRunnerSpend({ async loadRunnerAuthority() { return { admitted: true, principalSubject: "owner-synthetic", grant: { authorityType: "runner_spend", id: "", providerId: "", model: "", catalogRef: "", runType: "", scopeId: "", maxRetries: -1, currency: "US", expiresAt: 2_000, perRunCostMinor: -1, monthlyCostMinor: -1 }, perRun: budget("runner-run", 9), monthly: budget("runner-month", 9) }; }, async commitRunnerReservation(record) { malformedWrites.push(record); return { kind: "created", record }; } }, { grantId: "runner-grant", principalSubject: "owner-synthetic", operationKey: `ro_${"a".repeat(64)}`, now: 1_100 });
    assert.equal(malformed.kind, "blocked"); assert.deepEqual(malformedWrites, []);
    const runnerAuthority = { admitted: true, principalSubject: "owner-synthetic", grant: { authorityType: "runner_spend", id: "runner-grant", providerId: "synthetic-model-provider", model: "synthetic-model", catalogRef: "runner-catalog", runType: "prospecting", scopeId: "run-synthetic", maxRetries: 0, currency: "USD", expiresAt: 2_000, perRunCostMinor: 9, monthlyCostMinor: 9 }, perRun: budget("runner_per_run", 9), monthly: budget("runner_monthly", 9) };
    const semanticWrites = [];
    const wrongOperation = await runner.reserveRunnerSpend({ async loadRunnerAuthority() { return runnerAuthority; }, async commitRunnerReservation(record) { semanticWrites.push(record); return { kind: "created", record }; } }, { grantId: "runner-grant", principalSubject: "owner-synthetic", operationKey: `ro_${"b".repeat(64)}`, now: 1_100 });
    assert.equal(wrongOperation.kind, "blocked"); assert.deepEqual(semanticWrites, []);
  } finally { await vite.close(); }
});

test("P5 hardening: malformed fake-port outcomes and settlement failures hold a claimed reservation without retry", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const operation = await module(vite, "enrichment-operation");
    for (const [name, port, settlementThrows, reconciliationThrows] of [
      ["null", null, false, false], ["unknown kind", { async enrich() { return { kind: "other" }; } }, false, false],
      ["oversized evidence", { async enrich(assignment) { return { kind: "completed", reservationId: assignment.reservationId, operationKey: assignment.operationKey, documentedUnits: 1, documentedCostMinor: 1, evidence: Array.from({ length: 101 }, () => ({})) }; } }, false, false],
      ["settlement failure", { async enrich(assignment) { return { kind: "completed", reservationId: assignment.reservationId, operationKey: assignment.operationKey, documentedUnits: 1, documentedCostMinor: 1, evidence: [] }; } }, true, false],
      ["reconciliation persistence failure", { async enrich() { return { kind: "other" }; } }, false, true],
    ]) {
      const state = { status: "reserved", calls: 0, reconciled: 0 };
      const repository = { async claimCommittedInvocation() { if (state.status !== "reserved") return null; state.status = "invoking"; return { reservationId: "reservation-hardened", operationKey: "op_hardened", providerId: "synthetic", providerVersion: "v1", catalogRef: "catalog", quoteRevision: 1, prospectIds: ["prospect-a"], operation: "business_contact_lookup/v1", maxUnits: 1, maxCostMinor: 1, currency: "USD", expiresAt: 2_000 }; }, async settleReservation() { if (settlementThrows) throw new Error("settlement unavailable"); state.status = "settled"; }, async markNeedsReconciliation() { state.reconciled += 1; if (reconciliationThrows) throw new Error("reconciliation unavailable"); state.status = "needs_reconciliation"; } };
      if (port && typeof port.enrich === "function") { const original = port.enrich; port.enrich = async (...args) => { state.calls += 1; return original(...args); }; }
      const result = await operation.executeEnrichmentOperation(repository, port, { reservationId: "reservation-hardened", now: 1_100 });
      assert.equal(result.kind, "needs_reconciliation", name); assert.equal(state.calls <= 1, true, name); assert.notEqual(state.status, "reserved", name);
      assert.equal((await operation.executeEnrichmentOperation(repository, port, { reservationId: "reservation-hardened", now: 1_101 })).kind, "blocked", name);
    }
  } finally { await vite.close(); }
});

function currentSnapshot() {
  return { admitted: true, workspaceId: "workspace-synthetic", ownerSubject: "owner-synthetic", revision: 7, configuration: { id: "config-synthetic", digest: "a".repeat(64), revision: 3, current: true }, prospects: [{ id: "prospect-a", state: "approved", configurationId: "config-synthetic", configurationDigest: "a".repeat(64), revision: 4 }], quote: { providerId: "synthetic-provider", providerVersion: "v1", catalogRef: "catalog-synthetic", revision: 2, currency: "USD", unitCostMinor: 11, expiresAt: 2_000 } };
}
function issueInput() { return { principalSubject: "owner-synthetic", prospectIds: ["prospect-a"], operation: "business_contact_lookup/v1", maxUnits: 2, maxCostMinor: 22, currency: "USD", expiresAt: 1_500, expectedRevision: 7, idempotencyKey: "issue-synthetic-2", now: 1_000 }; }
function budget(scope, maxCostMinor = 22) { return { scope, currency: "USD", actualUnits: 0, reservedUnits: 0, maxUnits: 2, actualCostMinor: 0, reservedCostMinor: 0, maxCostMinor }; }
