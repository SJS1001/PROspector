import assert from "node:assert/strict";
import test from "node:test";

import { applyMigrations, countRows, createD1Fixture } from "./helpers/d1.mjs";
import {
  NOW,
  applyEnrichmentLineageCandidate,
  createApprovedProspectLifecycle,
  seedSyntheticReservationInputs,
  snapshotLaterPhaseEffects,
} from "./helpers/phase5-integration.mjs";

test("D1 Contacts service issues one prospect grant with stable quote authority and exact replay", async () => {
  const setup = await grantSetup("contacts-command-create", { kind: "unconfigured" });
  try {
    const revision = await prospectRevision(setup);
    const command = Object.freeze({ prospectId: setup.lifecycle.prospectId, expectedProspectRevision: revision, idempotencyKey: "contacts-command-create-key" });
    const created = await setup.service.createGrant(setup.context, command);
    const replay = await setup.service.createGrant(setup.context, command);
    assert.deepEqual(Object.keys(created).sort(), ["grantId", "kind", "status", "tupleDigest"]);
    assert.equal(created.kind, "grant");
    assert.equal(created.status, "created");
    assert.equal(replay.status, "replayed");
    assert.equal(replay.grantId, created.grantId);
    assert.equal(replay.tupleDigest, created.tupleDigest);
    assert.equal(await countRows(setup.fixture.database, "enrichment_grants"), 1);
    const persisted = await setup.fixture.database.prepare(
      "SELECT max_units,max_cost_minor,currency,expires_at,source_revision FROM enrichment_grants WHERE id=?",
    ).bind(created.grantId).first();
    assert.deepEqual(persisted, { max_units: 1, max_cost_minor: 10, currency: "CAD", expires_at: NOW + 20_000, source_revision: 1 });

    assert.deepEqual(await setup.service.createGrant(setup.context, {
      ...command,
      expectedProspectRevision: revision + 1,
      idempotencyKey: "contacts-command-stale-key",
    }), { kind: "grant", status: "stale" });
    assert.deepEqual(await setup.service.createGrant(setup.context, {
      prospectId: "prospect-not-in-workspace",
      expectedProspectRevision: 1,
      idempotencyKey: "contacts-command-wrong-key",
    }), { kind: "grant", status: "wrong_scope" });
    assert.equal(await countRows(setup.fixture.database, "enrichment_grants"), 1);
  } finally { await setup.fixture.dispose(); }
});

test("unconfigured or mismatched provider is rejected before reservation and provider invocation", async () => {
  const setup = await grantSetup("contacts-command-port-denial", { kind: "unconfigured" });
  try {
    const grant = await createGrant(setup, "contacts-command-port-grant");
    assert.deepEqual(await setup.service.runGrantedOperation(setup.context, { grantId: grant.grantId }), { kind: "operation", status: "blocked" });
    const provider = await load(setup.fixture, "contact-provider-port");
    let calls = 0;
    const mismatched = provider.bindContactProviderPort({
      providerId: "wrong-provider",
      providerVersion: "v1",
      catalogRef: "synthetic-catalog",
    }, async () => { calls += 1; throw new Error("must_not_run"); });
    const serviceModule = await load(setup.fixture, "contacts-command-service");
    const mismatchedService = serviceModule.createD1ContactsCommandService({
      database: setup.fixture.database,
      providerPort: mismatched,
      now: () => NOW + 5,
    });
    assert.deepEqual(await mismatchedService.runGrantedOperation(setup.context, { grantId: grant.grantId }), { kind: "operation", status: "blocked" });
    assert.equal(calls, 0);
    assert.equal(await countRows(setup.fixture.database, "enrichment_reservations"), 0);
    assert.equal(await countRows(setup.fixture.database, "enrichment_reservation_events"), 0);
  } finally { await setup.fixture.dispose(); }
});

test("bound D1 path reserves and settles once, validates its terminal acknowledgement, and never retries", async () => {
  let providerCalls = 0;
  const setup = await grantSetup("contacts-command-settled", async (fixture) => {
    const provider = await load(fixture, "contact-provider-port");
    return provider.bindContactProviderPort({
      providerId: "synthetic-contact-provider",
      providerVersion: "v1",
      catalogRef: "synthetic-catalog",
    }, async (assignment) => {
      providerCalls += 1;
      return Object.freeze({
        kind: "rejected",
        reservationId: assignment.reservationId,
        operationKey: assignment.operationKey,
        documentedUnits: 0,
        documentedCostMinor: 0,
        evidence: Object.freeze([]),
      });
    });
  });
  try {
    const grant = await createGrant(setup, "contacts-command-settle-grant");
    const repositoryModule = await load(setup.fixture, "enrichment-repository");
    const repository = repositoryModule.createD1EnrichmentRepository(setup.fixture.database, {
      workspaceId: setup.context.workspaceId,
      ownerSubject: setup.context.principalSubject,
      now: () => NOW + 5,
    });
    const persistedGrant = await repository.findGrantByIdempotency(setup.context.workspaceId, "contacts-command-settle-grant");
    await seedSyntheticReservationInputs(setup.fixture.database, setup.lifecycle, persistedGrant);
    const laterBefore = await snapshotLaterPhaseEffects(setup.fixture.database);
    const result = await setup.service.runGrantedOperation(setup.context, { grantId: grant.grantId });
    assert.deepEqual(Object.keys(result).sort(), ["grantId", "kind", "operationId", "resultDigest", "revision", "status"]);
    assert.equal(result.kind, "operation");
    assert.equal(result.status, "settled");
    assert.match(result.resultDigest, /^[a-f0-9]{64}$/);
    assert.equal(providerCalls, 1);
    assert.equal(await countRows(setup.fixture.database, "enrichment_reservations"), 1);
    const terminal = await setup.fixture.database.prepare(
      "SELECT durable_revision,state FROM enrichment_reservation_events WHERE reservation_id=? AND state IN ('settled','released')",
    ).bind(result.operationId).all();
    assert.equal(terminal.results.length, 1);
    assert.equal(result.revision, Number(terminal.results[0].durable_revision));
    assert.deepEqual(await setup.service.runGrantedOperation(setup.context, { grantId: grant.grantId }), { kind: "operation", status: "blocked" });
    assert.equal(providerCalls, 1);
    assert.deepEqual(await snapshotLaterPhaseEffects(setup.fixture.database), laterBefore);
    assert.doesNotMatch(JSON.stringify(result), /owner|nonce|operationKey|catalog|contact|providerResponse|source/i);
  } finally { await setup.fixture.dispose(); }
});

test("timeout becomes durable reconciliation and a later command cannot retry the provider", async () => {
  let providerCalls = 0;
  const setup = await grantSetup("contacts-command-timeout", async (fixture) => {
    const provider = await load(fixture, "contact-provider-port");
    return provider.bindContactProviderPort({
      providerId: "synthetic-contact-provider",
      providerVersion: "v1",
      catalogRef: "synthetic-catalog",
    }, async (assignment) => {
      providerCalls += 1;
      return Object.freeze({ kind: "timeout", reservationId: assignment.reservationId, operationKey: assignment.operationKey });
    });
  });
  try {
    const grant = await createGrant(setup, "contacts-command-timeout-grant");
    const repositoryModule = await load(setup.fixture, "enrichment-repository");
    const repository = repositoryModule.createD1EnrichmentRepository(setup.fixture.database, {
      workspaceId: setup.context.workspaceId,
      ownerSubject: setup.context.principalSubject,
      now: () => NOW + 5,
    });
    await seedSyntheticReservationInputs(
      setup.fixture.database,
      setup.lifecycle,
      await repository.findGrantByIdempotency(setup.context.workspaceId, "contacts-command-timeout-grant"),
    );
    const laterBefore = await snapshotLaterPhaseEffects(setup.fixture.database);
    const result = await setup.service.runGrantedOperation(setup.context, { grantId: grant.grantId });
    assert.equal(result.status, "reconciliation_required");
    assert.match(result.resultDigest, /^[a-f0-9]{64}$/);
    assert.equal(providerCalls, 1);
    assert.equal(await countRows(setup.fixture.database, "enrichment_reservations"), 1);
    const terminal = await setup.fixture.database.prepare(
      "SELECT durable_revision,state FROM enrichment_reservation_events WHERE reservation_id=? AND state='needs_reconciliation'",
    ).bind(result.operationId).all();
    assert.equal(terminal.results.length, 1);
    assert.equal(result.revision, Number(terminal.results[0].durable_revision));
    assert.deepEqual(await setup.service.runGrantedOperation(setup.context, { grantId: grant.grantId }), { kind: "operation", status: "blocked" });
    assert.equal(providerCalls, 1);
    assert.deepEqual(await snapshotLaterPhaseEffects(setup.fixture.database), laterBefore);
  } finally { await setup.fixture.dispose(); }
});

test("D1 identity merge derives sorted secondaries, replays exactly, and rejects stale or foreign locators", async () => {
  const fixture = await createD1Fixture("contacts-command-identity-merge");
  try {
    await applyMigrations(fixture.database);
    const context = await seedIdentities(fixture.database);
    const domain = await load(fixture, "identity-resolution");
    const persistence = await load(fixture, "identity-repository");
    const repository = persistence.createD1IdentityResolutionRepository(fixture.database, {
      workspaceId: context.workspaceId,
      ownerSubject: context.principalSubject,
      subjectKind: "contact",
      now: () => NOW,
    });
    const suggestion = await domain.planIdentitySuggestion(repository, { subject: context.principalSubject, admittedOwner: true }, {
      workspaceId: context.workspaceId,
      kind: "merge",
      candidateIds: ["contacts-command-beta", "contacts-command-alpha"],
    });
    const service = (await load(fixture, "contacts-command-service")).createD1ContactsCommandService({
      database: fixture.database,
      providerPort: { kind: "unconfigured" },
      now: () => NOW,
    });
    const command = { suggestionId: suggestion.id, expectedRevision: suggestion.revision, idempotencyKey: "contacts-command-merge-key", primaryId: "contacts-command-alpha" };
    const applied = await service.applyIdentityMerge(context, command);
    const replay = await service.applyIdentityMerge(context, command);
    assert.deepEqual(Object.keys(applied).sort(), ["action", "kind", "resultDigest", "revision", "status", "suggestionId"]);
    assert.deepEqual(replay, applied);
    assert.equal(applied.action, "merge");
    assert.equal(await countRows(fixture.database, "identity_decisions"), 1);
    assert.deepEqual(await service.applyIdentityMerge(context, { ...command, expectedRevision: suggestion.revision + 1, idempotencyKey: "contacts-command-merge-stale" }), { kind: "identity", status: "stale" });
    assert.deepEqual(await service.applyIdentityMerge({ ...context, principalSubject: "contacts-command-foreign" }, command), { kind: "identity", status: "wrong_scope" });
    assert.equal(await countRows(fixture.database, "identity_decisions"), 1);
  } finally { await fixture.dispose(); }
});

test("D1 identity split uses only the persisted proposed partition and replays without exposing it", async () => {
  const fixture = await createD1Fixture("contacts-command-identity-split");
  try {
    await applyMigrations(fixture.database);
    const context = await seedIdentities(fixture.database);
    const domain = await load(fixture, "identity-resolution");
    const persistence = await load(fixture, "identity-repository");
    const repository = persistence.createD1IdentityResolutionRepository(fixture.database, {
      workspaceId: context.workspaceId,
      ownerSubject: context.principalSubject,
      subjectKind: "contact",
      now: () => NOW,
    });
    const suggestion = await domain.planIdentitySuggestion(repository, { subject: context.principalSubject, admittedOwner: true }, {
      workspaceId: context.workspaceId,
      kind: "split",
      sourceId: "contacts-command-beta",
      moveAssociationIds: ["contacts-command-relevance-beta"],
    });
    const service = (await load(fixture, "contacts-command-service")).createD1ContactsCommandService({
      database: fixture.database,
      providerPort: { kind: "unconfigured" },
      now: () => NOW,
    });
    const command = { suggestionId: suggestion.id, expectedRevision: suggestion.revision, idempotencyKey: "contacts-command-split-key" };
    const applied = await service.applyIdentitySplit(context, command);
    assert.equal(applied.action, "split");
    assert.deepEqual(await service.applyIdentitySplit(context, command), applied);
    assert.equal(await countRows(fixture.database, "identity_decisions"), 1);
    assert.doesNotMatch(JSON.stringify(applied), /sourceId|moveAssociation|newIdentity|partition|Jane/);
  } finally { await fixture.dispose(); }
});

async function grantSetup(name, providerPort) {
  const fixture = await createD1Fixture(name);
  await applyMigrations(fixture.database);
  await applyEnrichmentLineageCandidate(fixture.database);
  const lifecycle = await createApprovedProspectLifecycle(fixture);
  await fixture.database.prepare(`INSERT INTO provider_quotes
    (id,workspace_id,provider_id,provider_version,catalog_ref,revision,operation,currency,unit_cost_minor,quote_digest,expires_at,created_at)
    VALUES (?,?, 'synthetic-contact-provider','v1','synthetic-catalog',1,'business_contact_lookup/v1','CAD',10,?,?,?)`)
    .bind(`${name}-quote`, lifecycle.workspaceId, "b".repeat(64), NOW + 20_000, NOW).run();
  const boundPort = typeof providerPort === "function" ? await providerPort(fixture) : providerPort;
  const service = (await load(fixture, "contacts-command-service")).createD1ContactsCommandService({
    database: fixture.database,
    providerPort: boundPort,
    now: () => NOW + 5,
  });
  const context = Object.freeze({ workspaceId: lifecycle.workspaceId, principalSubject: lifecycle.owner.subject });
  return { fixture, lifecycle, service, context };
}

async function createGrant(setup, idempotencyKey) {
  return setup.service.createGrant(setup.context, {
    prospectId: setup.lifecycle.prospectId,
    expectedProspectRevision: await prospectRevision(setup),
    idempotencyKey,
  });
}

async function prospectRevision(setup) {
  return Number((await setup.fixture.database.prepare(
    "SELECT revision FROM profile_prospects WHERE id=? AND workspace_id=?",
  ).bind(setup.lifecycle.prospectId, setup.lifecycle.workspaceId).first()).revision);
}

async function seedIdentities(database) {
  const workspaceId = "contacts-command-identity-workspace";
  const principalSubject = "contacts-command-identity-owner";
  await database.batch([
    database.prepare("INSERT INTO workspaces (id,company_name,owner_subject,created_at,updated_at,revision) VALUES (?,'Contacts Command',?,?,?,1)").bind(workspaceId, principalSubject, NOW, NOW),
    database.prepare("INSERT INTO companies (id,workspace_id,created_at,updated_at,revision,name,status) VALUES ('contacts-command-company',?,?,?,1,'Contacts Command','active')").bind(workspaceId, NOW, NOW),
    database.prepare("INSERT INTO products (id,workspace_id,created_at,updated_at,revision,name,lifecycle) VALUES ('contacts-command-product',?,?,?,1,'Contacts Command','ready')").bind(workspaceId, NOW, NOW),
    database.prepare("INSERT INTO market_plays (id,workspace_id,created_at,updated_at,revision,product_id,name,lifecycle) VALUES ('contacts-command-play-a',?,?,?,1,'contacts-command-product','Play A','active')").bind(workspaceId, NOW, NOW),
    database.prepare("INSERT INTO market_plays (id,workspace_id,created_at,updated_at,revision,product_id,name,lifecycle) VALUES ('contacts-command-play-b',?,?,?,1,'contacts-command-product','Play B','active')").bind(workspaceId, NOW, NOW),
    database.prepare("INSERT INTO contacts (id,workspace_id,created_at,updated_at,revision,company_id,identity_digest,display_name) VALUES ('contacts-command-alpha',?,?,?,2,'contacts-command-company',?,'Jane Alpha')").bind(workspaceId, NOW, NOW, "a".repeat(64)),
    database.prepare("INSERT INTO contacts (id,workspace_id,created_at,updated_at,revision,company_id,identity_digest,display_name) VALUES ('contacts-command-beta',?,?,?,3,'contacts-command-company',?,'Jane Beta')").bind(workspaceId, NOW, NOW, "b".repeat(64)),
    database.prepare("INSERT INTO contact_relevance (id,workspace_id,created_at,updated_at,revision,play_id,contact_id,relevance_json) VALUES ('contacts-command-relevance-alpha',?,?,?,1,'contacts-command-play-a','contacts-command-alpha','{}')").bind(workspaceId, NOW, NOW),
    database.prepare("INSERT INTO contact_relevance (id,workspace_id,created_at,updated_at,revision,play_id,contact_id,relevance_json) VALUES ('contacts-command-relevance-beta',?,?,?,1,'contacts-command-play-b','contacts-command-beta','{}')").bind(workspaceId, NOW, NOW),
    database.prepare("INSERT INTO suppressions (id,workspace_id,subject_type,subject_digest,channel,reason,created_at) VALUES ('contacts-command-suppression',?,'contact',?,'email','synthetic',?)").bind(workspaceId, "b".repeat(64), NOW),
  ]);
  return Object.freeze({ workspaceId, principalSubject });
}

async function load(fixture, name) {
  return fixture.vite.ssrLoadModule(new URL(`../domain/${name}.ts`, import.meta.url).pathname);
}
