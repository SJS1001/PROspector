import assert from "node:assert/strict";
import test from "node:test";
import {
  PERSON_DISCOVERY_NOW,
  createPersonDiscoveryFixture,
  loadPersonDiscoveryModules,
} from "./helpers/person-discovery-fixture.mjs";

test("a stale requested run is fenced into reconciliation across service instances without a second provider call", async () => {
  const fixture = await createPersonDiscoveryFixture("person-discovery-stale-requested");
  try {
    const { discovery, repository, testPort } = await loadPersonDiscoveryModules(fixture);
    const { canonicalDigest } = await fixture.vite.ssrLoadModule(new URL("../domain/enrichment-grant-issuance.ts", import.meta.url).pathname);
    const command = startCommand(fixture, "person-discovery-crash-recovery");
    const requestDigest = await canonicalDigest(requestMaterial(fixture, command));
    const authority = await repository.loadApprovedProspectAuthority(fixture.database, fixture.scope, fixture.prospectId);
    assert.ok(authority);
    await repository.createDiscoveryRun(fixture.database, {
      id: "crashed-requested-run",
      eventId: "crashed-requested-event",
      authority,
      maxCandidates: command.maxCandidates,
      maxProvenancePerCandidate: command.maxProvenancePerCandidate,
      idempotencyKey: command.idempotencyKey,
      operationKey: `pd_${requestDigest}`,
      requestDigest,
      requestedDeadlineAt: PERSON_DISCOVERY_NOW + 5,
      createdAt: PERSON_DISCOVERY_NOW,
    });
    let calls = 0;
    const port = testPort.bindPersonDiscoveryTestPort(async () => { calls += 1; return { kind: "completed", candidates: [] }; });
    const serviceA = discovery.createPersonDiscoveryService({ database: fixture.database, port, now: () => PERSON_DISCOVERY_NOW + 10, idFactory: ids("recover-a") });
    const serviceB = discovery.createPersonDiscoveryService({ database: fixture.database, port, now: () => PERSON_DISCOVERY_NOW + 10, idFactory: ids("recover-b") });
    const [first, second] = await Promise.all([serviceA.start(fixture.scope, command), serviceB.start(fixture.scope, command)]);
    assert.equal(first.kind, "accepted");
    assert.equal(second.kind, "accepted");
    assert.equal(first.run.id, "crashed-requested-run");
    assert.equal(second.run.id, first.run.id);
    assert.equal(first.run.status, "needs_reconciliation");
    assert.equal(first.run.reason, "stale_requested");
    assert.equal(calls, 0, "recovery never invokes the provider again");
    assert.equal(await count(fixture, "person_discovery_run_events"), 2);
  } finally {
    await fixture.dispose();
  }
});

test("fresh semantic keys terminalize one expired requested run sequentially and concurrently", async () => {
  const fixture = await createPersonDiscoveryFixture("person-discovery-fresh-key-stale");
  try {
    const { discovery, repository, testPort } = await loadPersonDiscoveryModules(fixture);
    const { canonicalDigest } = await fixture.vite.ssrLoadModule(new URL("../domain/enrichment-grant-issuance.ts", import.meta.url).pathname);
    const original = startCommand(fixture, "person-discovery-expired-original", { maxCandidates: 1 });
    const requestDigest = await canonicalDigest(requestMaterial(fixture, original));
    const authority = await repository.loadApprovedProspectAuthority(fixture.database, fixture.scope, fixture.prospectId);
    await repository.createDiscoveryRun(fixture.database, {
      id: "fresh-key-expired-run", eventId: "fresh-key-expired-event", authority,
      maxCandidates: 1, maxProvenancePerCandidate: 1, idempotencyKey: original.idempotencyKey,
      operationKey: `pd_${requestDigest}`, requestDigest, requestedDeadlineAt: PERSON_DISCOVERY_NOW + 5, createdAt: PERSON_DISCOVERY_NOW,
    });
    let calls = 0;
    const port = testPort.bindPersonDiscoveryTestPort(async () => { calls += 1; return completed(candidate("forbidden-retry")); });
    const serviceA = discovery.createPersonDiscoveryService({ database: fixture.database, port, now: () => PERSON_DISCOVERY_NOW + 10, idFactory: ids("fresh-stale-a") });
    const serviceB = discovery.createPersonDiscoveryService({ database: fixture.database, port, now: () => PERSON_DISCOVERY_NOW + 10, idFactory: ids("fresh-stale-b") });
    const [first, second] = await Promise.all([
      serviceA.start(fixture.scope, { ...original, idempotencyKey: "person-discovery-expired-fresh-a" }),
      serviceB.start(fixture.scope, { ...original, idempotencyKey: "person-discovery-expired-fresh-b" }),
    ]);
    const sequential = await serviceA.start(fixture.scope, { ...original, idempotencyKey: "person-discovery-expired-fresh-c" });
    for (const result of [first, second, sequential]) {
      assert.equal(result.kind, "accepted");
      assert.equal(result.run.id, "fresh-key-expired-run");
      assert.equal(result.run.status, "needs_reconciliation");
      assert.equal(result.run.reason, "stale_requested");
    }
    assert.equal(calls, 0);
    assert.equal(await count(fixture, "person_discovery_run_events"), 2);
  } finally {
    await fixture.dispose();
  }
});

test("fresh semantic keys reconcile expired history before every current ancestor and configuration gate", async () => {
  const drifts = [
    ["company", "UPDATE companies SET status='draft' WHERE workspace_id=?", (fixture) => [fixture.workspaceId]],
    ["product", "UPDATE products SET lifecycle='paused' WHERE id=(SELECT play.product_id FROM customer_profiles profile JOIN market_plays play ON play.id=profile.play_id WHERE profile.id=? AND profile.workspace_id=?)", (fixture) => [fixture.profileId, fixture.workspaceId]],
    ["play", "UPDATE market_plays SET lifecycle='paused' WHERE id=(SELECT play_id FROM customer_profiles WHERE id=? AND workspace_id=?)", (fixture) => [fixture.profileId, fixture.workspaceId]],
    ["profile", "UPDATE customer_profiles SET lifecycle='paused' WHERE id=? AND workspace_id=?", (fixture) => [fixture.profileId, fixture.workspaceId]],
    ["prospect", "UPDATE profile_prospects SET state='deferred',active=0,revision=revision+1 WHERE id=? AND workspace_id=?", (fixture) => [fixture.prospectId, fixture.workspaceId]],
    ["configuration", "UPDATE typed_configurations SET active=0 WHERE id=? AND workspace_id=?", (fixture) => [fixture.configurationId, fixture.workspaceId]],
  ];
  for (const [kind, sql, bindings] of drifts) {
    const fixture = await createPersonDiscoveryFixture(`person-discovery-expired-${kind}-drift`);
    try {
      const { discovery, repository, testPort } = await loadPersonDiscoveryModules(fixture);
      const { canonicalDigest } = await fixture.vite.ssrLoadModule(new URL("../domain/enrichment-grant-issuance.ts", import.meta.url).pathname);
      const original = startCommand(fixture, `person-discovery-expired-${kind}-original`, { maxCandidates: 1 });
      const requestDigest = await canonicalDigest(requestMaterial(fixture, original));
      const authority = await repository.loadApprovedProspectAuthority(fixture.database, fixture.scope, fixture.prospectId);
      await repository.createDiscoveryRun(fixture.database, {
        id: `expired-${kind}-run`, eventId: `expired-${kind}-event`, authority,
        maxCandidates: 1, maxProvenancePerCandidate: 1, idempotencyKey: original.idempotencyKey,
        operationKey: `pd_${requestDigest}`, requestDigest, requestedDeadlineAt: PERSON_DISCOVERY_NOW + 5, createdAt: PERSON_DISCOVERY_NOW,
      });
      await fixture.database.prepare(sql).bind(...bindings(fixture)).run();
      const historical = await repository.readDiscoveryRunByRequestDigest(fixture.database, fixture.scope, requestDigest, `pd_${requestDigest}`);
      assert.equal(historical?.id, `expired-${kind}-run`, `${kind} drift does not erase historical request authority`);
      let calls = 0;
      const port = testPort.bindPersonDiscoveryTestPort(async () => { calls += 1; return completed(candidate(`forbidden-${kind}`)); });
      const serviceA = discovery.createPersonDiscoveryService({ database: fixture.database, port, now: () => PERSON_DISCOVERY_NOW + 10, idFactory: ids(`expired-${kind}-a`) });
      const serviceB = discovery.createPersonDiscoveryService({ database: fixture.database, port, now: () => PERSON_DISCOVERY_NOW + 10, idFactory: ids(`expired-${kind}-b`) });
      const [first, second] = await Promise.all([
        serviceA.start(fixture.scope, { ...original, idempotencyKey: `person-discovery-expired-${kind}-fresh-a` }),
        serviceB.start(fixture.scope, { ...original, idempotencyKey: `person-discovery-expired-${kind}-fresh-b` }),
      ]);
      const sequential = await serviceA.start(fixture.scope, { ...original, idempotencyKey: `person-discovery-expired-${kind}-fresh-c` });
      for (const result of [first, second, sequential]) {
        assert.equal(result.kind, "accepted", `${kind} historical recovery is permitted after drift: ${JSON.stringify(result)}`);
        assert.equal(result.run.id, `expired-${kind}-run`);
        assert.equal(result.run.status, "needs_reconciliation");
        assert.equal(result.run.reason, "stale_requested");
      }
      assert.equal(calls, 0, `${kind} drift recovery never invokes the port`);
      assert.equal(await count(fixture, "person_discovery_run_events"), 2);
    } finally {
      await fixture.dispose();
    }
  }
});

test("the port deadline aborts a hung fake and the uncertain run is never retried", async () => {
  const fixture = await createPersonDiscoveryFixture("person-discovery-abort");
  try {
    const { discovery, testPort } = await loadPersonDiscoveryModules(fixture);
    let calls = 0;
    let observedAbort = false;
    const port = testPort.bindPersonDiscoveryTestPort((_assignment, signal) => new Promise((_resolve, reject) => {
      calls += 1;
      signal.addEventListener("abort", () => { observedAbort = true; reject(new Error("aborted")); }, { once: true });
    }));
    const service = discovery.createPersonDiscoveryService({ database: fixture.database, port, requestTimeoutMs: 5, now: () => PERSON_DISCOVERY_NOW + 100, idFactory: ids("abort") });
    const command = startCommand(fixture, "person-discovery-deadline-abort");
    const result = await service.start(fixture.scope, command);
    assert.equal(result.kind, "accepted");
    assert.equal(result.run.status, "needs_reconciliation");
    assert.equal(result.run.reason, "timeout");
    assert.equal(observedAbort, true);
    assert.equal((await service.start(fixture.scope, command)).replayed, true);
    assert.equal(calls, 1);
  } finally {
    await fixture.dispose();
  }
});

test("stale recovery replays a completed terminal winner instead of failing", async () => {
  const fixture = await createPersonDiscoveryFixture("person-discovery-terminal-winner");
  try {
    const { discovery, repository, testPort } = await loadPersonDiscoveryModules(fixture);
    const command = startCommand(fixture, "person-discovery-terminal-winner", { maxCandidates: 1 });
    const service = discovery.createPersonDiscoveryService({ database: fixture.database, port: testPort.bindPersonDiscoveryTestPort(async () => completed(candidate("terminal-winner"))), now: () => PERSON_DISCOVERY_NOW + 100, idFactory: ids("terminal-winner") });
    const completedRun = await service.start(fixture.scope, command);
    assert.equal(completedRun.kind, "accepted");
    assert.equal(completedRun.run.status, "completed");
    const winner = await repository.reconcileStaleRequestedRun(fixture.database, fixture.scope, completedRun.run.id, completedRun.run.requestDigest, "late-recovery-event", "8".repeat(64), PERSON_DISCOVERY_NOW + 40_000);
    assert.equal(winner.status, "completed");
    assert.equal(winner.id, completedRun.run.id);
  } finally {
    await fixture.dispose();
  }
});

test("fresh idempotency keys deduplicate the same semantic request sequentially and concurrently", async () => {
  const fixture = await createPersonDiscoveryFixture("person-discovery-semantic-dedupe");
  try {
    const { discovery, testPort } = await loadPersonDiscoveryModules(fixture);
    let calls = 0;
    const port = testPort.bindPersonDiscoveryTestPort(async () => { calls += 1; return completed(candidate("semantic")); });
    const serviceA = discovery.createPersonDiscoveryService({ database: fixture.database, port, now: () => PERSON_DISCOVERY_NOW + 100, idFactory: ids("semantic-a") });
    const serviceB = discovery.createPersonDiscoveryService({ database: fixture.database, port, now: () => PERSON_DISCOVERY_NOW + 100, idFactory: ids("semantic-b") });
    const first = await serviceA.start(fixture.scope, startCommand(fixture, "person-discovery-semantic-first", { maxCandidates: 1 }));
    const sequential = await serviceA.start(fixture.scope, startCommand(fixture, "person-discovery-semantic-second", { maxCandidates: 1 }));
    const [concurrentA, concurrentB] = await Promise.all([
      serviceA.start(fixture.scope, startCommand(fixture, "person-discovery-semantic-third", { maxCandidates: 1 })),
      serviceB.start(fixture.scope, startCommand(fixture, "person-discovery-semantic-fourth", { maxCandidates: 1 })),
    ]);
    for (const result of [sequential, concurrentA, concurrentB]) {
      assert.equal(result.kind, "accepted");
      assert.equal(result.run.id, first.run.id);
      assert.equal(result.replayed, true);
    }
    assert.equal(calls, 1);
    assert.equal(await count(fixture, "person_discovery_runs"), 1);
  } finally {
    await fixture.dispose();
  }
});

test("personal and secret-like candidate payloads fail closed while expired raw payloads are audibly redacted", async () => {
  const fixture = await createPersonDiscoveryFixture("person-discovery-retention");
  try {
    const { discovery, testPort } = await loadPersonDiscoveryModules(fixture);
    const sensitive = new Map([
      [1, { ...candidate("internal-email"), displayName: "person@corp" }],
      [2, { ...candidate("ip"), roleTitle: "Operator at 10.0.0.1" }],
      [3, { ...candidate("aws"), roleSummary: `Credential AKIA${"A".repeat(16)}` }],
      [4, { ...candidate("github"), roleSummary: `Token ghp_${"a".repeat(30)}` }],
      [5, { ...candidate("jwt"), roleSummary: "Token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature" }],
      [6, { ...candidate("basic"), roleSummary: "Basic QWxhZGRpbjpvcGVuIHNlc2FtZQ==" }],
      [7, { ...candidate("bearer"), roleSummary: "Bearer abcdefghijklmnopqrstuv" }],
      [8, { ...candidate("pem"), roleSummary: "-----BEGIN PRIVATE KEY-----" }],
      [9, { ...candidate("userinfo"), provenance: [{ ...candidate("userinfo").provenance[0], sourceReference: "https://user:pass@example.invalid/path" }] }],
      [10, { ...candidate("query"), provenance: [{ ...candidate("query").provenance[0], sourceReference: "https://example.invalid/path?token=value" }] }],
      [11, { ...candidate("spoken-phone"), provenance: [{ ...candidate("spoken-phone").provenance[0], excerpt: "Call five five five five five five five now" }] }],
      [12, { ...candidate("sk-proj"), roleSummary: `Token sk-proj-${"a".repeat(24)}` }],
      [13, { ...candidate("sk-ant"), roleSummary: `Token sk-ant-api03-${"b".repeat(24)}` }],
      [14, { ...candidate("slack"), roleSummary: `Token xoxb-${"1".repeat(12)}-${"a".repeat(20)}` }],
      [15, { ...candidate("google"), roleSummary: `Token AIza${"A".repeat(32)}` }],
      [16, { ...candidate("opaque"), roleSummary: `Opaque ${"Ab3".repeat(14)}` }],
      [17, { ...candidate("encoded-contact"), provenance: [{ ...candidate("encoded-contact").provenance[0], sourceReference: "https://example.invalid/person%40corp" }] }],
      [18, { ...candidate("encoded-token"), provenance: [{ ...candidate("encoded-token").provenance[0], sourceReference: `https://example.invalid/${encodeURIComponent(`ghp_${"a".repeat(30)}`)}` }] }],
      [19, { ...candidate("provider-key"), candidateKey: "provider-selected-key" }],
    ]);
    const port = testPort.bindPersonDiscoveryTestPort(async (assignment) => {
      if (sensitive.has(assignment.maxCandidates)) return completed(sensitive.get(assignment.maxCandidates));
      return completed({
        displayName: "Renée O’Connor",
        roleTitle: "VP, Operations & R&D",
        roleSummary: "Leads mining, marine & field-service operations — synthetic evidence only.",
        provenance: [{
          sourceReference: "https://example.invalid/research/person-profile",
          excerpt: "Listed as operations leader (synthetic); role scope includes R&D.",
          retrievedAt: PERSON_DISCOVERY_NOW + 10,
        }],
      });
    });
    const service = discovery.createPersonDiscoveryService({ database: fixture.database, port, now: () => PERSON_DISCOVERY_NOW + 100, idFactory: ids("retention") });
    for (const maxCandidates of sensitive.keys()) {
      const result = await service.start(fixture.scope, startCommand(fixture, `person-discovery-reject-${maxCandidates}`, { maxCandidates }));
      assert.equal(result.kind, "accepted");
      assert.equal(result.run.status, "needs_reconciliation");
    }
    assert.equal(await count(fixture, "person_discovery_candidates"), 0);
    const accepted = await service.start(fixture.scope, startCommand(fixture, "person-discovery-retention-valid", { maxCandidates: 20 }));
    assert.equal(accepted.kind, "accepted");
    assert.equal(accepted.run.status, "completed");
    const before = await fixture.database.prepare("SELECT candidate_key,candidate_digest,display_name,payload_expires_at FROM person_discovery_candidates WHERE run_id=?").bind(accepted.run.id).first();
    assert.match(before.candidate_key, /^candidate:[0-9a-f]{64}$/u, "candidate identity is derived inside the trusted boundary");
    assert.equal(before.display_name, "Renée O’Connor", "legitimate international business prose and punctuation remain admissible");
    const sourceBefore = await fixture.database.prepare("SELECT provenance_digest,source_digest,excerpt_digest,payload_expires_at FROM person_discovery_provenance WHERE run_id=?").bind(accepted.run.id).first();

    const atCandidateExpiry = discovery.createPersonDiscoveryService({ database: fixture.database, port, now: () => Number(before.payload_expires_at), idFactory: ids("candidate-redact") });
    assert.deepEqual(await atCandidateExpiry.redactExpiredPayloads(fixture.scope), { redacted: 1 });
    const afterCandidate = await fixture.database.prepare("SELECT candidate_key,display_name,candidate_digest,redacted_at,redaction_authority_command_id,redaction_audit_event_id FROM person_discovery_candidates WHERE run_id=?").bind(accepted.run.id).first();
    assert.match(afterCandidate.candidate_key, /^redacted:/u);
    assert.equal(afterCandidate.display_name, "[redacted]");
    assert.equal(afterCandidate.candidate_digest, before.candidate_digest, "immutable audit digest survives payload redaction");
    assert.ok(afterCandidate.redaction_authority_command_id);
    assert.ok(afterCandidate.redaction_audit_event_id);
    assert.equal(await countWhere(fixture, "person_discovery_provenance", "redacted_at IS NOT NULL"), 0);

    const atSourceExpiry = discovery.createPersonDiscoveryService({ database: fixture.database, port, now: () => Number(sourceBefore.payload_expires_at), idFactory: ids("source-redact") });
    assert.deepEqual(await atSourceExpiry.redactExpiredPayloads(fixture.scope), { redacted: 1 });
    const afterSource = await fixture.database.prepare("SELECT source_reference,excerpt,provenance_digest,source_digest,excerpt_digest,redacted_at FROM person_discovery_provenance WHERE run_id=?").bind(accepted.run.id).first();
    assert.equal(afterSource.source_reference, "[redacted]");
    assert.equal(afterSource.excerpt, "[redacted]");
    assert.equal(afterSource.provenance_digest, sourceBefore.provenance_digest);
    assert.equal(afterSource.source_digest, sourceBefore.source_digest);
    assert.equal(afterSource.excerpt_digest, sourceBefore.excerpt_digest);
    await assert.rejects(fixture.database.prepare("DELETE FROM person_discovery_candidates WHERE run_id=?").bind(accepted.run.id).run(), /immutable/u);
  } finally {
    await fixture.dispose();
  }
});

test("percent decoding reaches a bounded fixed point before candidate admission", async () => {
  const fixture = await createPersonDiscoveryFixture("person-discovery-percent-decoding");
  try {
    const { discovery, testPort } = await loadPersonDiscoveryModules(fixture);
    const outcomes = new Map([
      [1, { ...candidate("double-contact"), roleSummary: "Contact person%2540corp.example for details." }],
      [2, { ...candidate("triple-token"), provenance: [{ ...candidate("triple-token").provenance[0], sourceReference: `https://example.invalid/research/ghp%25255F${"a".repeat(30)}` }] }],
      [3, { ...candidate("malformed-percent"), roleSummary: "Synthetic profile reference %4G is malformed." }],
      [4, { ...candidate("decode-bound"), provenance: [{ ...candidate("decode-bound").provenance[0], sourceReference: "https://example.invalid/research/person%2525252540corp.example" }] }],
    ]);
    const port = testPort.bindPersonDiscoveryTestPort(async (assignment) => completed(outcomes.get(assignment.maxProvenancePerCandidate) ?? {
      displayName: "Renée O’Connor",
      roleTitle: "VP, Operations & R&D",
      roleSummary: "Improved qualified throughput by 25% year over year — synthetic evidence only.",
      provenance: [{
        sourceReference: "https://example.invalid/research/operations%E2%80%93leadership",
        excerpt: "Synthetic business profile; 25% is a benign percentage.",
        retrievedAt: PERSON_DISCOVERY_NOW + 10,
      }],
    }));
    const service = discovery.createPersonDiscoveryService({ database: fixture.database, port, now: () => PERSON_DISCOVERY_NOW + 100, idFactory: ids("percent") });
    for (const maxProvenancePerCandidate of outcomes.keys()) {
      const result = await service.start(fixture.scope, startCommand(fixture, `person-discovery-percent-reject-${maxProvenancePerCandidate}`, { maxCandidates: 20, maxProvenancePerCandidate }));
      assert.equal(result.kind, "accepted");
      assert.equal(result.run.status, "needs_reconciliation");
      assert.equal(result.run.candidates.length, 0);
    }
    const valid = await service.start(fixture.scope, startCommand(fixture, "person-discovery-percent-valid", { maxCandidates: 20, maxProvenancePerCandidate: 5 }));
    assert.equal(valid.kind, "accepted");
    assert.equal(valid.run.status, "completed", "benign percent prose and a canonical encoded HTTPS path remain admissible");
    assert.equal(valid.run.candidates[0].displayName, "Renée O’Connor");
  } finally {
    await fixture.dispose();
  }
});

test("concurrent retention sweeps replay one durable redaction winner", async () => {
  const fixture = await createPersonDiscoveryFixture("person-discovery-redaction-race");
  try {
    const { discovery, testPort } = await loadPersonDiscoveryModules(fixture);
    const port = testPort.bindPersonDiscoveryTestPort(async () => completed(candidate("redaction-race")));
    const setup = discovery.createPersonDiscoveryService({ database: fixture.database, port, now: () => PERSON_DISCOVERY_NOW + 100, idFactory: ids("redaction-setup") });
    const run = await setup.start(fixture.scope, startCommand(fixture, "person-discovery-redaction-race", { maxCandidates: 1 }));
    const expiry = Number((await fixture.database.prepare("SELECT payload_expires_at FROM person_discovery_candidates WHERE run_id=?").bind(run.run.id).first()).payload_expires_at);
    const sweepA = discovery.createPersonDiscoveryService({ database: fixture.database, port, now: () => expiry, idFactory: ids("redaction-a") });
    const sweepB = discovery.createPersonDiscoveryService({ database: fixture.database, port, now: () => expiry, idFactory: ids("redaction-b") });
    const results = await Promise.all([sweepA.redactExpiredPayloads(fixture.scope), sweepB.redactExpiredPayloads(fixture.scope)]);
    assert.deepEqual(results, [{ redacted: 1 }, { redacted: 1 }]);
    assert.equal(await countWhere(fixture, "person_discovery_candidates", "redacted_at IS NOT NULL"), 1);
    assert.equal(await countWhere(fixture, "authority_commands", "command_type='person_discovery.retention_redact'"), 1);
  } finally {
    await fixture.dispose();
  }
});

test("repository failures remain failures rather than being rewritten as business conflicts", async () => {
  const database = {
    prepare() { throw new Error("synthetic programmer failure"); },
  };
  const fixture = await createPersonDiscoveryFixture("person-discovery-programmer-error");
  try {
    const { discovery, testPort } = await loadPersonDiscoveryModules(fixture);
    const service = discovery.createPersonDiscoveryService({ database, port: testPort.bindPersonDiscoveryTestPort(async () => ({ kind: "completed", candidates: [] })) });
    await assert.rejects(service.start(fixture.scope, startCommand(fixture, "person-discovery-programmer-error")), /synthetic programmer failure/u);
  } finally {
    await fixture.dispose();
  }
});

function requestMaterial(fixture, command) {
  return {
    schema: "person-discovery-request/v1",
    workspaceId: fixture.workspaceId,
    principalSubject: fixture.scope.principalSubject,
    prospectId: command.prospectId,
    expectedProspectRevision: command.expectedProspectRevision,
    expectedConfigurationId: command.expectedConfigurationId,
    expectedConfigurationDigest: command.expectedConfigurationDigest,
    expectedConfigurationRevision: command.expectedConfigurationRevision,
    maxCandidates: command.maxCandidates,
    maxProvenancePerCandidate: command.maxProvenancePerCandidate,
  };
}

function startCommand(fixture, idempotencyKey, overrides = {}) {
  return {
    prospectId: fixture.prospectId,
    expectedProspectRevision: fixture.prospectRevision,
    expectedConfigurationId: fixture.configurationId,
    expectedConfigurationDigest: fixture.configurationDigest,
    expectedConfigurationRevision: fixture.configurationRevision,
    maxCandidates: 4,
    maxProvenancePerCandidate: 1,
    idempotencyKey,
    ...overrides,
  };
}

function candidate(key) {
  return {
    displayName: `Synthetic ${key}`,
    roleTitle: "Operations Director",
    roleSummary: "Synthetic role relevance only; not verified contact authority.",
    provenance: [{ sourceReference: `synthetic:${key}`, excerpt: "Synthetic bounded provenance.", retrievedAt: PERSON_DISCOVERY_NOW + 10 }],
  };
}

function completed(value) { return { kind: "completed", candidates: [value] }; }
function ids(prefix) { let value = 0; return () => `${prefix}-${++value}`; }
async function count(fixture, table) { return Number((await fixture.database.prepare(`SELECT count(*) total FROM ${table}`).first()).total); }
async function countWhere(fixture, table, predicate) { return Number((await fixture.database.prepare(`SELECT count(*) total FROM ${table} WHERE ${predicate}`).first()).total); }
