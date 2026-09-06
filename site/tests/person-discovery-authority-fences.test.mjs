import assert from "node:assert/strict";
import test from "node:test";
import {
  PERSON_DISCOVERY_NOW,
  createPersonDiscoveryFixture,
  loadPersonDiscoveryModules,
} from "./helpers/person-discovery-fixture.mjs";

test("workspace, prospect, configuration, and ancestor drift after dispatch cannot commit candidates or retry", async () => {
  const drifts = [
    ["workspace", "UPDATE workspaces SET revision=revision+1 WHERE id=?", (fixture) => [fixture.workspaceId]],
    ["prospect", "UPDATE profile_prospects SET revision=revision+1,updated_at=updated_at+1 WHERE id=? AND workspace_id=?", (fixture) => [fixture.prospectId, fixture.workspaceId]],
    ["configuration", "UPDATE typed_configurations SET active=0 WHERE id=? AND workspace_id=?", (fixture) => [fixture.configurationId, fixture.workspaceId]],
    ["ancestor", "UPDATE customer_profiles SET lifecycle='paused' WHERE id=? AND workspace_id=?", (fixture) => [fixture.profileId, fixture.workspaceId]],
  ];
  for (const [kind, sql, bindings] of drifts) {
    const fixture = await createPersonDiscoveryFixture(`person-discovery-drift-${kind}`);
    try {
      const { discovery, testPort } = await loadPersonDiscoveryModules(fixture);
      let calls = 0;
      const port = testPort.bindPersonDiscoveryTestPort(async () => {
        calls += 1;
        await fixture.database.prepare(sql).bind(...bindings(fixture)).run();
        return completedCandidate(`drift-${kind}`);
      });
      const service = discovery.createPersonDiscoveryService({ database: fixture.database, port, now: () => PERSON_DISCOVERY_NOW + 100, idFactory: ids(`drift-${kind}`) });
      const command = startCommand(fixture, `person-discovery-drift-${kind}`);
      const result = await service.start(fixture.scope, command);
      assert.equal(result.kind, "accepted", `${kind} drift is durably acknowledged`);
      assert.equal(result.run.status, "needs_reconciliation", `${kind} drift fails closed`);
      assert.equal(result.run.candidates.length, 0);
      assert.equal(await count(fixture, "person_discovery_candidates"), 0);
      assert.equal((await service.start(fixture.scope, command)).replayed, true);
      assert.equal(calls, 1, `${kind} drift is never retried`);
    } finally {
      await fixture.dispose();
    }
  }
});

test("a paused ancestor rolls back a cached owner decision including Contact, command, and audit writes", async () => {
  const fixture = await createPersonDiscoveryFixture("person-discovery-decision-toctou");
  try {
    const { discovery, repository, testPort } = await loadPersonDiscoveryModules(fixture);
    const service = discovery.createPersonDiscoveryService({ database: fixture.database, port: testPort.bindPersonDiscoveryTestPort(async () => completedCandidate("decision-toctou")), now: () => PERSON_DISCOVERY_NOW + 100, idFactory: ids("decision-setup") });
    const runResult = await service.start(fixture.scope, startCommand(fixture, "person-discovery-decision-toctou-run"));
    assert.equal(runResult.kind, "accepted");
    const play = await fixture.database.prepare("SELECT play_id FROM customer_profiles WHERE id=? AND workspace_id=?").bind(fixture.profileId, fixture.workspaceId).first();
    await fixture.database.prepare("UPDATE market_plays SET lifecycle='paused' WHERE id=? AND workspace_id=?").bind(play.play_id, fixture.workspaceId).run();
    await assert.rejects(repository.commitDiscoveryDecision(fixture.database, {
      id: "toctou-decision",
      authorityCommandId: "toctou-decision-command",
      auditEventId: "toctou-decision-audit",
      relevanceId: "toctou-relevance",
      contactId: "toctou-contact",
      newContactIdentityDigest: "1".repeat(64),
      scope: fixture.scope,
      runId: runResult.run.id,
      candidateId: runResult.run.candidates[0].id,
      decision: "create_new",
      expectedResultDigest: runResult.run.resultDigest,
      idempotencyKey: "person-discovery-toctou-decision",
      decisionDigest: "2".repeat(64),
      relevanceDigest: "3".repeat(64),
      createdAt: PERSON_DISCOVERY_NOW + 200,
    }), /invalid person discovery decision authority/u);
    assert.equal(await count(fixture, "contacts"), 0);
    assert.equal(await countId(fixture, "authority_commands", "toctou-decision-command"), 0);
    assert.equal(await countId(fixture, "audit_events", "toctou-decision-audit"), 0);
    assert.equal(await count(fixture, "person_discovery_owner_decisions"), 0);
  } finally {
    await fixture.dispose();
  }
});

test("a paused ancestor rolls back a verification intent built from formerly current authority", async () => {
  const fixture = await createPersonDiscoveryFixture("person-discovery-intent-toctou");
  try {
    const { discovery, repository, testPort } = await loadPersonDiscoveryModules(fixture);
    const service = discovery.createPersonDiscoveryService({ database: fixture.database, port: testPort.bindPersonDiscoveryTestPort(async () => completedCandidate("intent-toctou")), now: () => PERSON_DISCOVERY_NOW + 100, idFactory: ids("intent-setup") });
    const runResult = await service.start(fixture.scope, startCommand(fixture, "person-discovery-intent-toctou-run"));
    const decision = await service.decide(fixture.scope, {
      runId: runResult.run.id,
      expectedResultDigest: runResult.run.resultDigest,
      decision: "create_new",
      candidateId: runResult.run.candidates[0].id,
      idempotencyKey: "person-discovery-intent-toctou-decision",
    });
    assert.equal(decision.kind, "accepted");
    const authority = await repository.loadRelevanceAuthority(fixture.database, fixture.scope, decision.decision.relevanceId);
    assert.ok(authority, "authority is current before the interleaving pause");
    const policy = await repository.deriveContactFreshnessPolicy(authority.configurationManifestJson);
    const { canonicalDigest } = await fixture.vite.ssrLoadModule(new URL("../domain/enrichment-grant-issuance.ts", import.meta.url).pathname);
    const intentDigest = await canonicalDigest({
      schema: "contact-verification-intent/v1", workspaceId: authority.workspaceId, principalSubject: authority.ownerSubject,
      relevanceId: authority.relevanceId, intent: "initial_verification", channel: "email", sourceObservationId: null,
      expectedProspectRevision: authority.prospectRevision, expectedContactRevision: authority.contactRevision,
      expectedConfigurationId: authority.configurationId, expectedConfigurationDigest: authority.configurationDigest,
      expectedConfigurationRevision: authority.configurationRevision,
      freshnessWindowMs: policy.mailboxVerifiedEmailFreshnessMs, freshnessPolicyDigest: policy.policyDigest,
    });
    const product = await fixture.database.prepare("SELECT play.product_id FROM customer_profiles profile JOIN market_plays play ON play.id=profile.play_id AND play.workspace_id=profile.workspace_id WHERE profile.id=? AND profile.workspace_id=?").bind(fixture.profileId, fixture.workspaceId).first();
    await fixture.database.prepare("UPDATE products SET lifecycle='paused' WHERE id=? AND workspace_id=?").bind(product.product_id, fixture.workspaceId).run();
    await assert.rejects(repository.commitVerificationIntent(fixture.database, authority, {
      id: "toctou-intent",
      authorityCommandId: "toctou-intent-command",
      auditEventId: "toctou-intent-audit",
      intent: "initial_verification",
      channel: "email",
      sourceObservationId: null,
      freshnessWindowMs: fixture.contactStrategy.mailboxVerifiedEmailFreshnessMs,
      freshnessPolicyDigest: policy.policyDigest,
      idempotencyKey: "person-discovery-toctou-intent",
      intentDigest,
      createdAt: PERSON_DISCOVERY_NOW + 200,
    }), /invalid contact verification intent authority/u);
    assert.equal(await countId(fixture, "authority_commands", "toctou-intent-command"), 0);
    assert.equal(await countId(fixture, "audit_events", "toctou-intent-audit"), 0);
    assert.equal(await count(fixture, "contact_verification_intents"), 0);
  } finally {
    await fixture.dispose();
  }
});

test("freshness suppression is current-configuration scoped and fenced again inside the intent transaction", async () => {
  const fixture = await createPersonDiscoveryFixture("person-discovery-freshness-toctou");
  try {
    const { discovery, repository, testPort } = await loadPersonDiscoveryModules(fixture);
    const service = discovery.createPersonDiscoveryService({ database: fixture.database, port: testPort.bindPersonDiscoveryTestPort(async () => completedCandidate("freshness-toctou")), now: () => PERSON_DISCOVERY_NOW + 100, idFactory: ids("freshness-setup") });
    const run = await service.start(fixture.scope, startCommand(fixture, "person-discovery-freshness-run"));
    const decision = await service.decide(fixture.scope, { runId: run.run.id, expectedResultDigest: run.run.resultDigest, decision: "create_new", candidateId: run.run.candidates[0].id, idempotencyKey: "person-discovery-freshness-decision" });
    const authority = await repository.loadRelevanceAuthority(fixture.database, fixture.scope, decision.decision.relevanceId);
    const policy = await repository.deriveContactFreshnessPolicy(authority.configurationManifestJson);
    const now = PERSON_DISCOVERY_NOW + 100;
    const expiredAt = now - policy.mailboxVerifiedEmailFreshnessMs - 1;
    // Isolate the C1 freshness fence from the older enrichment-assignment chain.
    // The production-shaped authority rows above remain real; this disposable
    // observation table lets the test interleave trusted evidence at the exact
    // transaction boundary without manufacturing a provider grant.
    await fixture.database.prepare("DROP TABLE contact_point_observations").run();
    await fixture.database.prepare(`CREATE TABLE contact_point_observations (
      id text PRIMARY KEY NOT NULL,
      workspace_id text NOT NULL,
      assignment_id text NOT NULL,
      contact_id text NOT NULL,
      configuration_id text NOT NULL,
      configuration_digest text NOT NULL,
      kind text NOT NULL,
      contact_point_digest text NOT NULL,
      contact_point_reference text NOT NULL,
      verification_class text NOT NULL,
      confidence_basis_points integer NOT NULL,
      method text NOT NULL,
      source_reference text NOT NULL,
      excerpt_digest text NOT NULL,
      object_reference text NOT NULL,
      content_hash text NOT NULL,
      retrieved_at integer NOT NULL,
      observed_at integer NOT NULL,
      verified_at integer,
      provider_id text,
      provider_version text,
      catalog_ref text,
      verifier_id text,
      verifier_version text,
      verdict_reference text,
      verdict_digest text,
      verification_receipt_id text,
      parent_observation_id text,
      observation_digest text NOT NULL,
      created_at integer NOT NULL
    )`).run();
    await insertObservation(fixture, authority, "expired-current", authority.configurationId, authority.configurationDigest, expiredAt, "8");
    await insertObservation(fixture, authority, "newer-stale-config", "stale-configuration", "9".repeat(64), now - 1, "9");
    assert.equal(await repository.hasNewerTrustedFreshObservation(fixture.database, authority, "expired-current", "email", now, policy), false, "stale-configuration evidence is not current authority");
    await insertObservation(fixture, authority, "newer-current", authority.configurationId, authority.configurationDigest, now - 1, "a");
    assert.equal(await repository.hasNewerTrustedFreshObservation(fixture.database, authority, "expired-current", "email", now, policy), true);
    const { canonicalDigest } = await fixture.vite.ssrLoadModule(new URL("../domain/enrichment-grant-issuance.ts", import.meta.url).pathname);
    const intentDigest = await canonicalDigest({
      schema: "contact-verification-intent/v1", workspaceId: authority.workspaceId, principalSubject: authority.ownerSubject,
      relevanceId: authority.relevanceId, intent: "stale_refresh", channel: "email", sourceObservationId: "expired-current",
      expectedProspectRevision: authority.prospectRevision, expectedContactRevision: authority.contactRevision,
      expectedConfigurationId: authority.configurationId, expectedConfigurationDigest: authority.configurationDigest,
      expectedConfigurationRevision: authority.configurationRevision, freshnessWindowMs: policy.mailboxVerifiedEmailFreshnessMs,
      freshnessPolicyDigest: policy.policyDigest,
    });
    await assert.rejects(repository.commitVerificationIntent(fixture.database, authority, {
      id: "freshness-toctou-intent", authorityCommandId: "freshness-toctou-command", auditEventId: "freshness-toctou-audit",
      intent: "stale_refresh", channel: "email", sourceObservationId: "expired-current", freshnessWindowMs: policy.mailboxVerifiedEmailFreshnessMs,
      freshnessPolicyDigest: policy.policyDigest, idempotencyKey: "person-discovery-freshness-toctou", intentDigest, createdAt: now,
    }), /newer fresh contact observation exists/u);
    assert.equal(await countId(fixture, "authority_commands", "freshness-toctou-command"), 0);
    assert.equal(await countId(fixture, "audit_events", "freshness-toctou-audit"), 0);
    assert.equal(await countId(fixture, "contact_verification_intents", "freshness-toctou-intent"), 0);
  } finally {
    await fixture.dispose();
  }
});

async function insertObservation(fixture, authority, id, configurationId, configurationDigest, verifiedAt, digestCharacter) {
  await fixture.database.prepare(`INSERT INTO contact_point_observations
    (id,workspace_id,assignment_id,contact_id,configuration_id,configuration_digest,kind,contact_point_digest,contact_point_reference,verification_class,confidence_basis_points,method,source_reference,excerpt_digest,object_reference,content_hash,retrieved_at,observed_at,verified_at,provider_id,provider_version,catalog_ref,verifier_id,verifier_version,verdict_reference,verdict_digest,verification_receipt_id,parent_observation_id,observation_digest,created_at)
    VALUES (?,?,?, ?,?,?,'email',?,'synthetic-reference','mailbox_verified',10000,'mailbox_verification','synthetic-source',?,'synthetic-object',?,?,?,?,NULL,NULL,NULL,'synthetic-verifier','v1','synthetic-verdict',?,NULL,NULL,?,?)`)
    .bind(id, authority.workspaceId, `missing-assignment-${id}`, authority.contactId, configurationId, configurationDigest, digestCharacter.repeat(64), digestCharacter.repeat(64), digestCharacter.repeat(64), verifiedAt - 2, verifiedAt + 1, verifiedAt, digestCharacter.repeat(64), `${digestCharacter}1`.repeat(32), verifiedAt + 1).run();
}

function startCommand(fixture, idempotencyKey) {
  return {
    prospectId: fixture.prospectId,
    expectedProspectRevision: fixture.prospectRevision,
    expectedConfigurationId: fixture.configurationId,
    expectedConfigurationDigest: fixture.configurationDigest,
    expectedConfigurationRevision: fixture.configurationRevision,
    maxCandidates: 1,
    maxProvenancePerCandidate: 1,
    idempotencyKey,
  };
}

function completedCandidate(key) {
  return { kind: "completed", candidates: [{ displayName: `Synthetic ${key}`, roleTitle: "Operations Director", roleSummary: "Synthetic role relevance only.", provenance: [{ sourceReference: `synthetic:${key}`, excerpt: "Synthetic bounded provenance.", retrievedAt: PERSON_DISCOVERY_NOW + 10 }] }] };
}

function ids(prefix) { let value = 0; return () => `${prefix}-${++value}`; }
async function count(fixture, table) { return Number((await fixture.database.prepare(`SELECT count(*) total FROM ${table}`).first()).total); }
async function countId(fixture, table, id) { return Number((await fixture.database.prepare(`SELECT count(*) total FROM ${table} WHERE id=?`).bind(id).first()).total); }
