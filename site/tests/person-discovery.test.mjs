import assert from "node:assert/strict";
import test from "node:test";
import {
  PERSON_DISCOVERY_NOW,
  createPersonDiscoveryFixture,
  loadPersonDiscoveryModules,
} from "./helpers/person-discovery-fixture.mjs";

test("a candidate remains non-authoritative and no_match writes no Contact, relevance, or evidence", async () => {
  const fixture = await createPersonDiscoveryFixture("person-discovery-no-match");
  try {
    const { discovery, testPort } = await loadPersonDiscoveryModules(fixture);
    assert.equal((await fixture.database.prepare("SELECT status FROM prospecting_candidates WHERE id='person-discovery-company-candidate'").first()).status, "observed", "the Approved Prospect keeps the production-eligible observed source lifecycle");
    const command = startCommand(fixture, "person-discovery-start-no-match");
    const unavailable = discovery.createPersonDiscoveryService({ database: fixture.database, now: () => PERSON_DISCOVERY_NOW + 100, idFactory: ids("unavailable") });
    assert.deepEqual(await unavailable.start(fixture.scope, command), { kind: "blocked", reason: "port_unavailable" });
    assert.equal(await count(fixture, "person_discovery_runs"), 0);

    let calls = 0;
    let assignment;
    const port = testPort.bindPersonDiscoveryTestPort(async (received) => {
      calls += 1;
      assignment = received;
      return completedCandidate("candidate-a");
    });
    const service = discovery.createPersonDiscoveryService({ database: fixture.database, port, now: () => PERSON_DISCOVERY_NOW + 100, idFactory: ids("no-match") });
    const generationBefore = await generation(fixture);
    const result = await service.start(fixture.scope, command);
    assert.equal(result.kind, "accepted");
    assert.equal(result.replayed, false);
    assert.equal(result.run.status, "completed");
    assert.equal(result.run.candidates.length, 1);
    assert.equal(calls, 1);
    assert.deepEqual(Object.keys(assignment).sort(), [
      "configurationDigest", "configurationId", "configurationRevision", "deadlineAt",
      "maxCandidates", "maxProvenancePerCandidate", "operationKey", "profileId", "prospectId", "prospectRevision", "runId", "schema",
    ]);
    assert.equal(await count(fixture, "contacts"), 0, "discovered candidates are not Contacts");
    assert.equal(await count(fixture, "contact_point_observations"), 0, "discovery creates no eligible contact evidence");
    assert.equal(await count(fixture, "contact_eligibility_snapshots"), 0);
    assert.ok(await generation(fixture) > generationBefore, "new immutable history invalidates the Contacts projection");

    const replay = await service.start(fixture.scope, command);
    assert.equal(replay.kind, "accepted");
    assert.equal(replay.replayed, true);
    assert.equal(replay.run.id, result.run.id);
    assert.equal(calls, 1);
    const changedReplay = await service.start(fixture.scope, { ...command, maxCandidates: 3 });
    assert.deepEqual(changedReplay, { kind: "conflict", reason: "idempotency_conflict" });
    assert.equal(calls, 1);

    const decisionCommand = {
      runId: result.run.id,
      expectedResultDigest: result.run.resultDigest,
      decision: "no_match",
      idempotencyKey: "person-discovery-decision-no-match",
    };
    const decided = await service.decide(fixture.scope, decisionCommand);
    assert.equal(decided.kind, "accepted");
    assert.equal(decided.decision.decision, "no_match");
    assert.equal(decided.decision.contactId, null);
    assert.equal(await count(fixture, "contacts"), 0);
    assert.equal(await count(fixture, "prospect_contact_role_relevance"), 0);
    assert.equal(await count(fixture, "contact_point_observations"), 0);
    assert.equal((await service.decide(fixture.scope, decisionCommand)).replayed, true);
    assert.deepEqual(
      await service.decide(fixture.scope, { ...decisionCommand, decision: "create_new", candidateId: result.run.candidates[0].id }),
      { kind: "conflict", reason: "idempotency_conflict" },
    );
    await assert.rejects(fixture.database.prepare("UPDATE person_discovery_candidates SET display_name='mutated' WHERE id=?").bind(result.run.candidates[0].id).run(), /immutable/u);
    await assert.rejects(fixture.database.prepare("DELETE FROM person_discovery_owner_decisions WHERE id=?").bind(decided.decision.id).run(), /immutable/u);
  } finally {
    await fixture.dispose();
  }
});

test("create_new and link_existing atomically bind one same-workspace Contact while verification remains intent-only", async () => {
  const fixture = await createPersonDiscoveryFixture("person-discovery-decisions");
  try {
    const { discovery, repository, testPort } = await loadPersonDiscoveryModules(fixture);
    let calls = 0;
    const port = testPort.bindPersonDiscoveryTestPort(async () => {
      calls += 1;
      return completedCandidate(`candidate-${calls}`);
    });
    const service = discovery.createPersonDiscoveryService({ database: fixture.database, port, now: () => PERSON_DISCOVERY_NOW + 100, idFactory: ids("decision") });

    const first = await service.start(fixture.scope, startCommand(fixture, "person-discovery-start-create", { maxCandidates: 2 }));
    assert.equal(first.kind, "accepted");
    assert.equal(await count(fixture, "contacts"), 0, "ambiguous identity is never auto-resolved before an owner decision");
    const createCommand = {
      runId: first.run.id,
      expectedResultDigest: first.run.resultDigest,
      decision: "create_new",
      candidateId: first.run.candidates[0].id,
      idempotencyKey: "person-discovery-decision-create",
    };
    const [created, createReplay] = await Promise.all([
      service.decide(fixture.scope, createCommand),
      service.decide(fixture.scope, createCommand),
    ]);
    assert.equal(created.kind, "accepted");
    assert.equal(createReplay.kind, "accepted");
    assert.equal(await count(fixture, "contacts"), 1, "the decision race commits exactly one Contact");
    assert.equal(await count(fixture, "person_discovery_owner_decisions"), 1);
    assert.equal(await count(fixture, "prospect_contact_role_relevance"), 1);
    assert.equal(await countWhere(fixture, "authority_commands", "command_type", "person_discovery.owner_decision"), 1);
    assert.equal(await countWhere(fixture, "audit_events", "action", "person_discovery.owner_decided"), 1);
    assert.notEqual(created.decision.contactId, first.run.candidates[0].id, "candidate and Contact identities remain distinct");
    assert.equal(created.decision.contactId, createReplay.decision.contactId);

    const contact = await fixture.database.prepare("SELECT revision FROM contacts WHERE id=? AND workspace_id=?").bind(created.decision.contactId, fixture.workspaceId).first();
    const verifyCommand = {
      relevanceId: created.decision.relevanceId,
      intent: "initial_verification",
      channel: "email",
      expectedProspectRevision: fixture.prospectRevision,
      expectedContactRevision: Number(contact.revision),
      expectedConfigurationId: fixture.configurationId,
      expectedConfigurationDigest: fixture.configurationDigest,
      expectedConfigurationRevision: fixture.configurationRevision,
      idempotencyKey: "person-discovery-initial-verification",
    };
    const intent = await service.recordVerificationIntent(fixture.scope, verifyCommand);
    assert.equal(intent.kind, "accepted");
    assert.equal(intent.intent.intent, "initial_verification");
    assert.equal(intent.intent.channel, "email");
    assert.equal(intent.intent.freshnessWindowMs, fixture.contactStrategy.mailboxVerifiedEmailFreshnessMs);
    assert.equal(intent.providerCallAuthorized, false);
    assert.equal(intent.contactEvidenceCreated, false);
    assert.equal((await service.recordVerificationIntent(fixture.scope, verifyCommand)).replayed, true);
    const phoneIntent = await service.recordVerificationIntent(fixture.scope, {
      ...verifyCommand,
      channel: "phone",
      idempotencyKey: "person-discovery-initial-phone-verification",
    });
    assert.equal(phoneIntent.kind, "accepted");
    assert.equal(phoneIntent.intent.freshnessWindowMs, fixture.contactStrategy.verifiedBusinessPhoneFreshnessMs);
    const intentAuthority = await repository.loadRelevanceAuthority(fixture.database, fixture.scope, created.decision.relevanceId);
    const currentPolicy = await repository.deriveContactFreshnessPolicy(intentAuthority.configurationManifestJson);
    const forgedBase = {
      id: "wrong-policy-intent",
      authorityCommandId: "wrong-policy-command",
      auditEventId: "wrong-policy-audit",
      intent: "initial_verification",
      channel: "email",
      sourceObservationId: null,
      freshnessWindowMs: currentPolicy.mailboxVerifiedEmailFreshnessMs,
      freshnessPolicyDigest: currentPolicy.policyDigest,
      idempotencyKey: "person-discovery-wrong-policy",
      intentDigest: "7".repeat(64),
      createdAt: PERSON_DISCOVERY_NOW + 100,
    };
    await assert.rejects(repository.commitVerificationIntent(fixture.database, intentAuthority, {
      ...forgedBase,
      freshnessPolicyDigest: "6".repeat(64),
    }), /invalid[_ ]contact[_ ]verification[_ ]policy/u);
    await assert.rejects(repository.commitVerificationIntent(fixture.database, intentAuthority, {
      ...forgedBase,
      id: "wrong-window-intent",
      freshnessWindowMs: 30 * 24 * 60 * 60 * 1000,
    }), /invalid[_ ]contact[_ ]verification[_ ]policy/u);
    assert.deepEqual(
      await service.recordVerificationIntent(fixture.scope, { ...verifyCommand, intent: "stale_refresh", sourceObservationId: "missing-observation" }),
      { kind: "conflict", reason: "idempotency_conflict" },
    );
    assert.equal(await count(fixture, "contact_verification_intents"), 2);
    assert.equal(await countWhere(fixture, "authority_commands", "command_type", "person_discovery.verification_intent"), 2);
    assert.equal(await countWhere(fixture, "audit_events", "action", "person_discovery.verification_intent"), 2);
    assert.equal(await count(fixture, "contact_point_observations"), 0);
    assert.equal(await count(fixture, "contact_eligibility_snapshots"), 0);
    assert.deepEqual(
      await service.recordVerificationIntent(fixture.scope, { ...verifyCommand, intent: "stale_refresh", sourceObservationId: "missing-observation", idempotencyKey: "person-discovery-stale-verification" }),
      { kind: "blocked", reason: "stale_or_foreign_authority" },
      "stale refresh is distinct and requires an expired verified source observation",
    );
    const observationDatabase = withSyntheticObservationRead(fixture.database, {
      nominated: { kind: "email", verification_class: "mailbox_verified", verified_at: PERSON_DISCOVERY_NOW - fixture.contactStrategy.mailboxVerifiedEmailFreshnessMs - 1 },
      newer: [{ verification_class: "mailbox_verified", verified_at: PERSON_DISCOVERY_NOW + 99 }],
    });
    const freshnessService = discovery.createPersonDiscoveryService({ database: observationDatabase, port, now: () => PERSON_DISCOVERY_NOW + 100, idFactory: ids("freshness") });
    assert.deepEqual(
      await freshnessService.recordVerificationIntent(fixture.scope, { ...verifyCommand, intent: "stale_refresh", sourceObservationId: "expired-observation", idempotencyKey: "person-discovery-newer-fresh-observation" }),
      { kind: "blocked", reason: "stale_or_foreign_authority" },
      "a newer trusted fresh observation supersedes the nominated expired observation",
    );

    const company = await fixture.database.prepare("SELECT company_id FROM workspace_companies WHERE workspace_id=? LIMIT 1").bind(fixture.workspaceId).first();
    await fixture.database.prepare("INSERT INTO contacts (id,workspace_id,created_at,updated_at,revision,company_id,identity_digest,display_name) VALUES ('explicit-existing-contact',?,?,?,1,?,?,'Explicit Existing Contact')")
      .bind(fixture.workspaceId, PERSON_DISCOVERY_NOW, PERSON_DISCOVERY_NOW, company.company_id, "1".repeat(64)).run();
    const second = await service.start(fixture.scope, startCommand(fixture, "person-discovery-start-link", { maxCandidates: 1 }));
    assert.equal(second.kind, "accepted");
    assert.deepEqual(
      await service.decide(fixture.scope, {
        runId: second.run.id,
        expectedResultDigest: second.run.resultDigest,
        decision: "link_existing",
        candidateId: second.run.candidates[0].id,
        idempotencyKey: "person-discovery-invalid-link",
      }),
      { kind: "blocked", reason: "invalid_request" },
    );
    const linked = await service.decide(fixture.scope, {
      runId: second.run.id,
      expectedResultDigest: second.run.resultDigest,
      decision: "link_existing",
      candidateId: second.run.candidates[0].id,
      existingContactId: "explicit-existing-contact",
      idempotencyKey: "person-discovery-decision-link",
    });
    assert.equal(linked.kind, "accepted");
    assert.equal(linked.decision.contactId, "explicit-existing-contact");
    assert.equal(await count(fixture, "contacts"), 2, "linking an explicit Contact does not create another identity");
    assert.equal(await count(fixture, "prospect_contact_role_relevance"), 2);
    assert.equal(calls, 2, "only the injected fake was invoked once per distinct run");
  } finally {
    await fixture.dispose();
  }
});

test("stale/foreign authority, malformed outcomes, timeouts, and races fail closed without automatic retry", async () => {
  const fixture = await createPersonDiscoveryFixture("person-discovery-adversarial");
  try {
    const { discovery, testPort } = await loadPersonDiscoveryModules(fixture);
    let calls = 0;
    let releaseRace;
    const raceGate = new Promise((resolve) => { releaseRace = resolve; });
    const port = testPort.bindPersonDiscoveryTestPort(async (assignment) => {
      calls += 1;
      if (assignment.maxCandidates === 2) return { kind: "timeout" };
      if (assignment.maxCandidates === 1) return { kind: "completed", candidates: [candidate("over-a"), candidate("over-b")] };
      if (assignment.maxCandidates === 3) { await raceGate; return { kind: "completed", candidates: [] }; }
      if (assignment.maxCandidates === 4) return completedCandidate("stale-decision");
      if (assignment.maxCandidates === 6) return { kind: "unknown" };
      return { kind: "completed", candidates: [{ ...candidate("malformed"), displayName: " bad " }] };
    });
    const service = discovery.createPersonDiscoveryService({ database: fixture.database, port, now: () => PERSON_DISCOVERY_NOW + 100, idFactory: ids("adversarial") });
    assert.deepEqual(
      await service.start(fixture.scope, { ...startCommand(fixture, "person-discovery-stale-start"), expectedProspectRevision: fixture.prospectRevision + 1 }),
      { kind: "blocked", reason: "stale_or_foreign_authority" },
    );
    assert.deepEqual(
      await service.start({ ...fixture.scope, workspaceId: "foreign-workspace" }, startCommand(fixture, "person-discovery-foreign-start")),
      { kind: "blocked", reason: "stale_or_foreign_authority" },
    );
    assert.equal(calls, 0);

    const timeoutCommand = startCommand(fixture, "person-discovery-timeout", { maxCandidates: 2 });
    const timedOut = await service.start(fixture.scope, timeoutCommand);
    assert.equal(timedOut.kind, "accepted");
    assert.equal(timedOut.run.status, "needs_reconciliation");
    assert.equal(timedOut.run.reason, "timeout");
    assert.equal((await service.start(fixture.scope, timeoutCommand)).replayed, true);
    assert.equal(calls, 1, "uncertain outcomes are never retried automatically");

    const overCap = await service.start(fixture.scope, startCommand(fixture, "person-discovery-over-cap", { maxCandidates: 1 }));
    assert.equal(overCap.kind, "accepted");
    assert.equal(overCap.run.status, "needs_reconciliation");
    assert.equal(overCap.run.candidates.length, 0);
    assert.equal(await count(fixture, "person_discovery_candidates"), 0);

    const malformed = await service.start(fixture.scope, startCommand(fixture, "person-discovery-malformed", { maxCandidates: 5 }));
    assert.equal(malformed.kind, "accepted");
    assert.equal(malformed.run.status, "needs_reconciliation");
    assert.equal(malformed.run.candidates.length, 0);
    const unknownCommand = startCommand(fixture, "person-discovery-unknown", { maxCandidates: 6 });
    const unknown = await service.start(fixture.scope, unknownCommand);
    assert.equal(unknown.kind, "accepted");
    assert.equal(unknown.run.status, "needs_reconciliation");
    assert.equal(unknown.run.reason, "unknown_outcome");
    assert.equal((await service.start(fixture.scope, unknownCommand)).replayed, true);
    assert.equal(calls, 4, "malformed and unknown results each stop after one injected invocation");

    const raceCommand = startCommand(fixture, "person-discovery-race", { maxCandidates: 3 });
    const raceA = service.start(fixture.scope, raceCommand);
    const raceB = service.start(fixture.scope, raceCommand);
    releaseRace();
    const [winner, replay] = await Promise.all([raceA, raceB]);
    assert.equal(winner.kind, "accepted");
    assert.equal(replay.kind, "accepted");
    assert.equal(winner.run.id, replay.run.id);
    assert.equal(calls, 5, "same-key in-flight replay invokes the fake exactly once");
    assert.equal(Number(winner.replayed) + Number(replay.replayed), 1);
    assert.deepEqual(
      await service.start(fixture.scope, { ...raceCommand, maxProvenancePerCandidate: 2 }),
      { kind: "conflict", reason: "idempotency_conflict" },
    );

    const staleDecisionRun = await service.start(fixture.scope, startCommand(fixture, "person-discovery-stale-decision", { maxCandidates: 4 }));
    assert.equal(staleDecisionRun.kind, "accepted");
    await fixture.database.prepare("UPDATE profile_prospects SET revision=revision+1,updated_at=updated_at+1 WHERE id=? AND workspace_id=?").bind(fixture.prospectId, fixture.workspaceId).run();
    assert.deepEqual(
      await service.decide(fixture.scope, {
        runId: staleDecisionRun.run.id,
        expectedResultDigest: staleDecisionRun.run.resultDigest,
        decision: "create_new",
        candidateId: staleDecisionRun.run.candidates[0].id,
        idempotencyKey: "person-discovery-stale-decision-command",
      }),
      { kind: "blocked", reason: "stale_or_foreign_authority" },
    );
    assert.equal(await count(fixture, "contacts"), 0);
    assert.equal(await count(fixture, "person_discovery_owner_decisions"), 0);
  } finally {
    await fixture.dispose();
  }
});

function startCommand(fixture, idempotencyKey, overrides = {}) {
  return {
    prospectId: fixture.prospectId,
    expectedProspectRevision: fixture.prospectRevision,
    expectedConfigurationId: fixture.configurationId,
    expectedConfigurationDigest: fixture.configurationDigest,
    expectedConfigurationRevision: fixture.configurationRevision,
    maxCandidates: 2,
    maxProvenancePerCandidate: 1,
    idempotencyKey,
    ...overrides,
  };
}

function candidate(key) {
  return {
    displayName: `Synthetic ${key}`,
    roleTitle: "Operations Director",
    roleSummary: "Synthetic role relevance only; not a verified contact.",
    provenance: [{ sourceReference: `synthetic:${key}`, excerpt: "Synthetic bounded provenance.", retrievedAt: PERSON_DISCOVERY_NOW + 10 }],
  };
}

function completedCandidate(key) { return { kind: "completed", candidates: [candidate(key)] }; }

function ids(prefix) {
  let ordinal = 0;
  return () => `${prefix}-${++ordinal}`;
}

async function count(fixture, table) {
  const row = await fixture.database.prepare(`SELECT count(*) total FROM ${table}`).first();
  return Number(row.total);
}

async function countWhere(fixture, table, column, value) {
  const row = await fixture.database.prepare(`SELECT count(*) total FROM ${table} WHERE ${column}=?`).bind(value).first();
  return Number(row.total);
}

async function generation(fixture) {
  const row = await fixture.database.prepare("SELECT contacts_generation FROM contacts_projection_generations WHERE workspace_id=?").bind(fixture.workspaceId).first();
  return Number(row?.contacts_generation ?? 0);
}

function withSyntheticObservationRead(database, observations) {
  return {
    prepare(sql) {
      if (sql.includes("SELECT kind,verification_class,verified_at FROM contact_point_observations")) return syntheticStatement({ first: observations.nominated });
      if (sql.includes("SELECT verification_class,verified_at FROM contact_point_observations")) return syntheticStatement({ results: observations.newer });
      return database.prepare(sql);
    },
    batch: database.batch.bind(database),
  };
}

function syntheticStatement(result) {
  return {
    bind() { return this; },
    async first() { return result.first ?? null; },
    async all() { return { results: result.results ?? [] }; },
  };
}
