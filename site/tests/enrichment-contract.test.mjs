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
          accounts: [budget("grant"), budget("profile"), budget("workspace"), budget("provider")], evidenceAssignments: [evidenceBinding()],
        } : null;
      },
      async commitReservation(record) { mutations.push(["reserve", record.id]); reservations.set(record.id, record); return { kind: "created", record }; },
      async claimCommittedInvocation(id, now) { const record = reservations.get(id); if (!record || record.status !== "reserved") return { kind: "blocked", reason: "unavailable" }; if (record.assignment.expiresAt <= now) { record.status = "released"; return { kind: "blocked", reason: "expired" }; } record.status = "invoking"; mutations.push(["claim", id]); return { kind: "claimed", assignment: record.assignment, claimedAt: now }; },
      async settleReservation(id, settlement) { mutations.push(["settle", id, settlement.state]); reservations.get(id).status = settlement.state; },
      async markNeedsReconciliation(id) { mutations.push(["reconcile", id]); reservations.get(id).status = "needs_reconciliation"; return { kind: "recorded" }; },
      async listInvocationsNeedingRecovery() { return []; },
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

    const timedOutReservation = { ...reserved.reservation, id: "reservation-timeout", status: "reserved", assignment: { ...reserved.reservation.assignment, reservationId: "reservation-timeout" } }; reservations.set(timedOutReservation.id, timedOutReservation);
    const timeoutPort = { calls: 0, async enrich(assignment) { this.calls += 1; return { kind: "ambiguous", reservationId: assignment.reservationId, operationKey: assignment.operationKey }; } };
    const uncertain = await operation.executeEnrichmentOperation(reservationAuthority, timeoutPort, { reservationId: timedOutReservation.id, now: 1_103 });
    assert.equal(uncertain.kind, "needs_reconciliation"); assert.equal(timeoutPort.calls, 1); assert.equal(timedOutReservation.status, "needs_reconciliation");
    assert.equal((await operation.executeEnrichmentOperation(reservationAuthority, timeoutPort, { reservationId: timedOutReservation.id, now: 1_104 })).kind, "blocked");
    assert.equal(timeoutPort.calls, 1, "ambiguous acceptance is never retried or switched");

    const runnerAuthority = { grant: { authorityType: "runner_spend", id: "runner-grant", providerId: "synthetic-model-provider", model: "synthetic-model", catalogRef: "runner-catalog", runType: "prospecting", scopeId: "run-synthetic", maxRetries: 0, currency: "USD", expiresAt: 2_000, perRunCostMinor: 9, monthlyCostMinor: 9 }, admitted: true, principalSubject: "owner-synthetic", attempt: { attemptNumber: 0, previousOutcome: "none", previousOperationKeys: [] }, perRun: budget("runner_per_run", 9), monthly: budget("runner_monthly", 9) };
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
      const base = { admitted: true, principalSubject: "owner-synthetic", workspaceId: "workspace-synthetic", sourceRevision: 7, grant, configuration: currentSnapshot().configuration, prospects: currentSnapshot().prospects, quote: currentSnapshot().quote, accounts: [budget("grant"), budget("profile"), budget("workspace"), budget("provider")], evidenceAssignments: [evidenceBinding()] };
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
      ["nonpositive reservation clock", { grantId: grant.id, principalSubject: "owner-synthetic", operationKey: grant.tuple.operationKey, now: 0 }, [budget("grant"), budget("profile"), budget("workspace"), budget("provider")] ],
      ["duplicate budget scope", { grantId: grant.id, principalSubject: "owner-synthetic", operationKey: grant.tuple.operationKey, now: 1_100 }, [budget("grant"), budget("profile"), budget("profile"), budget("provider")] ],
      ["missing budget scope", { grantId: grant.id, principalSubject: "owner-synthetic", operationKey: grant.tuple.operationKey, now: 1_100 }, [budget("grant"), budget("profile"), budget("workspace")] ],
    ]) {
      const writes = [];
      const result = await authority.reserveEnrichmentOperation({ async loadReservationAuthority() { return { admitted: true, principalSubject: "owner-synthetic", workspaceId: "workspace-synthetic", sourceRevision: 7, grant, configuration: currentSnapshot().configuration, prospects: currentSnapshot().prospects, quote: currentSnapshot().quote, accounts, evidenceAssignments: [evidenceBinding()] }; }, async commitReservation(record) { writes.push(record); return { kind: "created", record }; }, async claimCommittedInvocation() { return { kind: "blocked", reason: "unavailable" }; }, async settleReservation() {}, async markNeedsReconciliation() { return { kind: "recorded" }; }, async listInvocationsNeedingRecovery() { return []; } }, input);
      assert.equal(result.kind, "blocked", name); assert.deepEqual(writes, [], name);
    }
    const malformedWrites = [];
    const malformed = await runner.reserveRunnerSpend({ async loadRunnerAuthority() { return { admitted: true, principalSubject: "owner-synthetic", grant: { authorityType: "runner_spend", id: "", providerId: "", model: "", catalogRef: "", runType: "", scopeId: "", maxRetries: -1, currency: "US", expiresAt: 2_000, perRunCostMinor: -1, monthlyCostMinor: -1 }, perRun: budget("runner-run", 9), monthly: budget("runner-month", 9) }; }, async commitRunnerReservation(record) { malformedWrites.push(record); return { kind: "created", record }; } }, { grantId: "runner-grant", principalSubject: "owner-synthetic", operationKey: `ro_${"a".repeat(64)}`, now: 1_100 });
    assert.equal(malformed.kind, "blocked"); assert.deepEqual(malformedWrites, []);
    const runnerAuthority = { admitted: true, principalSubject: "owner-synthetic", grant: { authorityType: "runner_spend", id: "runner-grant", providerId: "synthetic-model-provider", model: "synthetic-model", catalogRef: "runner-catalog", runType: "prospecting", scopeId: "run-synthetic", maxRetries: 0, currency: "USD", expiresAt: 2_000, perRunCostMinor: 9, monthlyCostMinor: 9 }, attempt: { attemptNumber: 0, previousOutcome: "none", previousOperationKeys: [] }, perRun: budget("runner_per_run", 9), monthly: budget("runner_monthly", 9) };
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
      const repository = { async claimCommittedInvocation(_id, now) { if (state.status !== "reserved") return { kind: "blocked", reason: "unavailable" }; state.status = "invoking"; return { kind: "claimed", assignment: authorizedAssignment(), claimedAt: now }; }, async settleReservation() { if (settlementThrows) throw new Error("settlement unavailable"); state.status = "settled"; }, async markNeedsReconciliation() { state.reconciled += 1; if (reconciliationThrows) throw new Error("reconciliation unavailable"); state.status = "needs_reconciliation"; return { kind: "recorded" }; }, async listInvocationsNeedingRecovery() { return state.status === "invoking" ? [{ reservationId: "reservation-hardened", operationKey: authorizedAssignment().operationKey, claimedAt: 1_100, expiresAt: 2_000, status: "invoking" }] : []; } };
      if (port && typeof port.enrich === "function") { const original = port.enrich; port.enrich = async (...args) => { state.calls += 1; return original(...args); }; }
      const result = await operation.executeEnrichmentOperation(repository, port, { reservationId: "reservation-hardened", now: 1_100 });
      assert.equal(result.kind, reconciliationThrows ? "reconciliation_persistence_failure" : "needs_reconciliation", name); assert.equal(state.calls <= 1, true, name); assert.notEqual(state.status, "reserved", name);
      assert.equal((await operation.executeEnrichmentOperation(repository, port, { reservationId: "reservation-hardened", now: 1_101 })).kind, "blocked", name);
    }
  } finally { await vite.close(); }
});

test("P5 hardening: invocation expiry is atomic and provider evidence must pass exact assignment-bound ingestion", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const operation = await module(vite, "enrichment-operation");
    const port = { calls: 0, async enrich(assignment) { this.calls += 1; return { kind: "completed", reservationId: assignment.reservationId, operationKey: assignment.operationKey, documentedUnits: 1, documentedCostMinor: 1, evidence: [] }; } };
    const expiryState = { status: "reserved" };
    const expiredRepository = {
      async claimCommittedInvocation(_id, now) { if (1_100 <= now) { expiryState.status = "expired"; return { kind: "blocked", reason: "expired" }; } throw new Error("unexpected clock"); },
      async settleReservation() { throw new Error("unreachable"); },
      async markNeedsReconciliation() { throw new Error("unreachable"); },
      async listInvocationsNeedingRecovery() { return []; },
    };
    const expired = await operation.executeEnrichmentOperation(expiredRepository, port, { reservationId: "reservation-expired", now: 1_100 });
    assert.equal(expired.kind, "blocked"); assert.equal(port.calls, 0); assert.equal(expiryState.status, "expired");
    const defensiveState = { status: "reserved", reconciled: 0 };
    const defensiveRepository = {
      async claimCommittedInvocation(_id, now) { defensiveState.status = "invoking"; return { kind: "claimed", assignment: authorizedAssignment({ reservationId: "reservation-expired-claim", expiresAt: now }), claimedAt: now }; },
      async settleReservation() { throw new Error("unreachable"); },
      async markNeedsReconciliation() { defensiveState.reconciled += 1; defensiveState.status = "needs_reconciliation"; return { kind: "recorded" }; },
      async listInvocationsNeedingRecovery() { return []; },
    };
    const defensiveExpiry = await operation.executeEnrichmentOperation(defensiveRepository, port, { reservationId: "reservation-expired-claim", now: 1_100 });
    assert.equal(defensiveExpiry.kind, "needs_reconciliation"); assert.equal(port.calls, 0); assert.equal(defensiveState.reconciled, 1);

    const state = { status: "reserved", settled: 0, promoted: 0, reconciled: 0, reconciliationReason: null };
    const assignment = authorizedAssignment({ expiresAt: 2_000 });
    const invalidEvidencePort = { calls: 0, async enrich(value) { this.calls += 1; return { kind: "completed", reservationId: value.reservationId, operationKey: value.operationKey, documentedUnits: 1, documentedCostMinor: 1, evidence: [contactEnvelope({ workspaceId: "other-workspace" })] }; } };
    const evidenceRepository = {
      async claimCommittedInvocation() { if (state.status !== "reserved") return { kind: "blocked", reason: "unavailable" }; state.status = "invoking"; return { kind: "claimed", assignment, claimedAt: 1_100 }; },
      async settleReservation(_id, settlement) { state.settled += 1; state.promoted += settlement.observations.length; state.status = "settled"; },
      async markNeedsReconciliation(_id, reason) { state.reconciled += 1; state.reconciliationReason = reason; state.status = "needs_reconciliation"; return { kind: "recorded" }; },
      async listInvocationsNeedingRecovery() { return []; },
    };
    const invalid = await operation.executeEnrichmentOperation(evidenceRepository, invalidEvidencePort, { reservationId: assignment.reservationId, now: 1_100 });
    assert.equal(invalid.kind, "needs_reconciliation"); assert.equal(state.reconciliationReason, "invalid_evidence"); assert.equal(invalidEvidencePort.calls, 1); assert.equal(state.settled, 0); assert.equal(state.promoted, 0); assert.equal(state.reconciled, 1);

    const acceptedState = { status: "reserved", observations: [] };
    const acceptedRepository = {
      async claimCommittedInvocation() { acceptedState.status = "invoking"; return { kind: "claimed", assignment, claimedAt: 1_100 }; },
      async settleReservation(_id, settlement) { acceptedState.observations = settlement.observations; acceptedState.status = "settled"; },
      async markNeedsReconciliation() { throw new Error("unreachable"); },
      async listInvocationsNeedingRecovery() { return []; },
    };
    const acceptedPort = { calls: 0, async enrich(value) { this.calls += 1; return { kind: "partial", reservationId: value.reservationId, operationKey: value.operationKey, documentedUnits: 1, documentedCostMinor: 1, evidence: [contactEnvelope()] }; } };
    const accepted = await operation.executeEnrichmentOperation(acceptedRepository, acceptedPort, { reservationId: assignment.reservationId, now: 1_100 });
    assert.equal(accepted.kind, "settled"); assert.equal(acceptedPort.calls, 1); assert.equal(acceptedState.observations.length, 1); assert.equal(acceptedState.observations[0].workspaceId, assignment.workspaceId); assert.equal(acceptedState.observations[0].contactId, evidenceBinding().contactId); assert.equal(Object.isFrozen(acceptedState.observations[0]), true);
  } finally { await vite.close(); }
});

test("P5 hardening: Runner retry attempts are immutable, bounded, duplicate-safe, and uncertainty-stopped", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const runner = await module(vite, "runner-spend-authority");
    const base = runnerAuthority({ maxRetries: 1, attempt: { attemptNumber: 0, previousOutcome: "none", previousOperationKeys: [] } });
    const firstKey = await runner.deriveRunnerOperationKey(base);
    const duplicateSeed = runnerAuthority({ maxRetries: 1, attempt: { attemptNumber: 1, previousOutcome: "failed_retryable", previousOperationKeys: [firstKey] } });
    const duplicateKey = await runner.deriveRunnerOperationKey(duplicateSeed);
    for (const [name, authority, operationKey] of [
      ["exhausted", runnerAuthority({ maxRetries: 0, attempt: { attemptNumber: 1, previousOutcome: "failed_retryable", previousOperationKeys: [firstKey] } }), await runner.deriveRunnerOperationKey(runnerAuthority({ maxRetries: 0, attempt: { attemptNumber: 1, previousOutcome: "failed_retryable", previousOperationKeys: [firstKey] } }))],
      ["uncertain", runnerAuthority({ maxRetries: 1, attempt: { attemptNumber: 1, previousOutcome: "uncertain", previousOperationKeys: [firstKey] } }), await runner.deriveRunnerOperationKey(runnerAuthority({ maxRetries: 1, attempt: { attemptNumber: 1, previousOutcome: "uncertain", previousOperationKeys: [firstKey] } }))],
      ["duplicate", runnerAuthority({ maxRetries: 1, attempt: { attemptNumber: 1, previousOutcome: "failed_retryable", previousOperationKeys: [duplicateKey] } }), duplicateKey],
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
function budget(scope, maxCostMinor = 22) { return { scope, currency: "USD", actualUnits: 0, reservedUnits: 0, maxUnits: 2, actualCostMinor: 0, reservedCostMinor: 0, maxCostMinor }; }
function evidenceBinding() { return { prospectId: "prospect-a", workspaceId: "workspace-synthetic", contactId: "contact-synthetic", profileConfigurationId: "config-synthetic", profileConfigurationDigest: "a".repeat(64) }; }
function authorizedAssignment(patch = {}) { return { reservationId: "reservation-hardened", workspaceId: "workspace-synthetic", configurationId: "config-synthetic", configurationDigest: "a".repeat(64), operationKey: `op_${"a".repeat(64)}`, providerId: "synthetic-provider", providerVersion: "v1", catalogRef: "catalog-synthetic", quoteRevision: 1, prospectIds: ["prospect-a"], operation: "business_contact_lookup/v1", maxUnits: 1, maxCostMinor: 1, currency: "USD", expiresAt: 2_000, evidenceAssignments: [evidenceBinding()], ...patch }; }
function contactEnvelope(patch = {}) { return { id: "observation-synthetic", prospectId: "prospect-a", workspaceId: "workspace-synthetic", contactId: "contact-synthetic", profileConfigurationId: "config-synthetic", profileConfigurationDigest: "a".repeat(64), kind: "email", value: "synthetic-contact@example.invalid", verificationClass: "mailbox_verified", confidence: 1, method: "mailbox_verification", provenance: { sourceReference: "source-synthetic", excerpt: "synthetic excerpt", objectReference: "object-synthetic", contentHash: "b".repeat(64), retrievedAt: 1_090 }, observedAt: 1_100, verifiedAt: 1_095, provider: "synthetic-provider", catalogVersion: "v1", ...patch }; }
function runnerAuthority({ maxRetries, attempt }) { return { admitted: true, principalSubject: "owner-synthetic", grant: { authorityType: "runner_spend", id: "runner-grant", providerId: "synthetic-model-provider", model: "synthetic-model", catalogRef: "runner-catalog", runType: "prospecting", scopeId: "run-synthetic", maxRetries, currency: "USD", expiresAt: 2_000, perRunCostMinor: 9, monthlyCostMinor: 9 }, attempt, perRun: budget("runner_per_run", 9), monthly: budget("runner_monthly", 9) }; }
