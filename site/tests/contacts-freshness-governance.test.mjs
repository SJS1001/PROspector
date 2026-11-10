import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { resolve } from "node:path";
import { createServer } from "vite";
import { CANONICAL_MIGRATION_FILENAMES } from "../scripts/migration-chain.mjs";

// Code review 2026-11-09, batch 08. The Contacts read projection and the
// eligibility snapshot writer must use the profile's configured contact_strategy
// freshness windows (never the built-in defaults), and the read projection must
// re-check suppression and open knowledge drift after a snapshot is persisted.
// Everything here is synthetic and local: the dev-only C4 lane writes the
// snapshot, no provider is called and nothing is sent.

const root = resolve(import.meta.dirname, "..");
const DAY = 24 * 60 * 60 * 1000;
const OWNER_EMAIL = "local-owner@prospector.invalid";
const PEPPER = "synthetic-browser-acceptance-pepper-32-bytes-minimum";
const bindings = Object.freeze({ PROSPECTOR_PERSON_DISCOVERY_C4: "synthetic-zero-network-c4-v1", TRUSTED_IDENTITY_PROVIDER: "local-demo", LOCAL_DEMO: "1" });

test("the C4 snapshot writer honours the configured 7-day mailbox window instead of the 30-day default", async () => {
  const context = await arrangeContactReady();
  try {
    const { fixture, persistence, consumer, settled } = context;
    assert.equal(settled.snapshot.state, "ContactReady");
    const later = await persistence.persistPersonDiscoveryC4ContactEligibilitySnapshot(
      verificationRequest(), bindings, fixture.database, await consumer.createPersonDiscoveryC4SettlementAttestor(),
      { ...settled.persistInput, projectedAt: settled.verifiedAt + 8 * DAY },
    );
    assert.equal(later.kind, "persisted", JSON.stringify(later));
    assert.notEqual(later.snapshot.state, "ContactReady", "8-day-old mailbox evidence is stale under a 7-day policy");
    assert.equal(later.snapshot.eligible, false);
  } finally { await context.fixture.dispose(); }
});

test("the C4 snapshot writer fails closed when the configuration manifest has no derivable freshness policy", async () => {
  const context = await arrangeContactReady();
  try {
    const { fixture, persistence, consumer, settled } = context;
    const database = withManifest(fixture.database, (manifest) => {
      const parsed = JSON.parse(manifest);
      delete parsed.confirmedCategoryInputs.contact_strategy;
      return JSON.stringify(parsed);
    });
    const result = await persistence.persistPersonDiscoveryC4ContactEligibilitySnapshot(
      verificationRequest(), bindings, database, await consumer.createPersonDiscoveryC4SettlementAttestor(),
      { ...settled.persistInput, projectedAt: settled.verifiedAt + DAY },
    );
    assert.deepEqual(result, { kind: "blocked", reason: "contact_authority_unavailable" });
  } finally { await context.fixture.dispose(); }
});

test("Contacts reads 8-day-old evidence as stale under a configured 7-day mailbox window", async () => {
  const context = await arrangeContactReady();
  try {
    const current = await context.read(context.fixture.database, context.settled.verifiedAt + 3 * DAY);
    assert.deepEqual([current.state, current.eligible, current.reasonCodes], ["ContactReady", true, []]);
    assert.equal(current.observations[0].freshness, "current");

    const stale = await context.read(context.fixture.database, context.settled.verifiedAt + 8 * DAY);
    assert.equal(stale.state, "NeedsReview", "the configured 7-day window, not the 30-day default, decides freshness");
    assert.equal(stale.eligible, false);
    assert.ok(stale.reasonCodes.includes("contact_evidence_stale"));
    assert.equal(stale.observations[0].freshness, "stale");
  } finally { await context.fixture.dispose(); }
});

test("Contacts reads 31-day-old evidence as current under a configured 60-day mailbox window", async () => {
  const context = await arrangeContactReady();
  try {
    const database = withManifest(context.fixture.database, (manifest) => {
      const parsed = JSON.parse(manifest);
      parsed.confirmedCategoryInputs.contact_strategy[0].value.mailboxVerifiedEmailFreshnessMs = 60 * DAY;
      return JSON.stringify(parsed);
    });
    const row = await context.read(database, context.settled.verifiedAt + 31 * DAY);
    assert.deepEqual([row.state, row.eligible, row.reasonCodes], ["ContactReady", true, []], "the 30-day default must not cut a 60-day policy short");
    assert.equal(row.observations[0].freshness, "current");
  } finally { await context.fixture.dispose(); }
});

test("Contacts treats evidence as not fresh when the manifest has no derivable freshness policy", async () => {
  const context = await arrangeContactReady();
  try {
    for (const mutate of [
      (manifest) => { const parsed = JSON.parse(manifest); delete parsed.confirmedCategoryInputs.contact_strategy; return JSON.stringify(parsed); },
      (manifest) => { const parsed = JSON.parse(manifest); parsed.confirmedCategoryInputs.contact_strategy[0].value.mailboxVerifiedEmailFreshnessMs = 0; return JSON.stringify(parsed); },
      () => "not-json",
      () => null,
    ]) {
      const row = await context.read(withManifest(context.fixture.database, mutate), context.settled.verifiedAt + DAY);
      assert.equal(row.state, "NeedsReview");
      assert.equal(row.eligible, false);
      assert.ok(row.reasonCodes.includes("contact_evidence_stale"));
      assert.equal(row.observations[0].freshness, "stale");
    }
  } finally { await context.fixture.dispose(); }
});

test("a suppression tombstone recorded after a ContactReady snapshot reads as NonContactable/contact_suppressed", async () => {
  const context = await arrangeContactReady();
  try {
    const { fixture, settled } = context;
    const before = await context.read(fixture.database, settled.verifiedAt + DAY);
    assert.equal(before.state, "ContactReady");

    const contact = await fixture.database.prepare("SELECT identity_digest FROM contacts WHERE id=?").bind(settled.contactId).first();
    const workspace = await fixture.database.prepare("SELECT owner_subject FROM workspaces WHERE id=?").bind(settled.workspaceId).first();
    const at = settled.verifiedAt + 1;
    await fixture.database.prepare("INSERT INTO outreach_commands (id,workspace_id,owner_subject,command_kind,idempotency_key,operation_digest,expected_version,result_kind,result_id,created_at) VALUES ('batch08-suppression-command',?,?,'suppression.record','batch08-suppression-key',?,0,'suppression_tombstone','batch08-tombstone',?)")
      .bind(settled.workspaceId, workspace.owner_subject, "b".repeat(64), at).run();
    await fixture.database.prepare("INSERT INTO outreach_suppression_tombstones (id,workspace_id,subject_kind,subject_digest,channel,reason,source_event_digest,alias_snapshot_json,alias_snapshot_digest,tombstone_digest,actor_subject,effective_at,command_id,created_at) VALUES ('batch08-tombstone',?,'contact',?,'all','owner_request',?,'[]',?,?,?,?,'batch08-suppression-command',?)")
      .bind(settled.workspaceId, contact.identity_digest, "c".repeat(64), "d".repeat(64), "e".repeat(64), workspace.owner_subject, at, at).run();
    assert.equal(await countRows(fixture.database, "contact_eligibility_snapshots"), 1, "no snapshot was rewritten");

    const after = await context.read(fixture.database, settled.verifiedAt + DAY);
    assert.equal(after.state, "NonContactable");
    assert.equal(after.eligible, false);
    assert.ok(after.reasonCodes.includes("contact_suppressed"));
  } finally { await context.fixture.dispose(); }
});

test("open knowledge drift recorded after a ContactReady snapshot reads as NeedsReview/contact_drifted", async () => {
  const context = await arrangeContactReady();
  try {
    const { fixture, settled } = context;
    const at = settled.verifiedAt + 1;
    await fixture.database.prepare("INSERT INTO configuration_knowledge_dependencies (configuration_id,knowledge_version_id,created_at) VALUES (?,'c4-profile-7-version',?)").bind(settled.configurationId, at).run();
    const before = await context.read(fixture.database, settled.verifiedAt + DAY);
    assert.equal(before.state, "ContactReady", "a dependency without open drift does not block");

    await fixture.database.prepare("INSERT INTO knowledge_drifts (id,workspace_id,created_at,updated_at,revision,knowledge_item_id,current_version_id,proposed_version_id,proposal_id,risk_kind,dependency_digest,status) VALUES ('batch08-drift',?,?,?,1,'c4-profile-7-item','c4-profile-7-version','c4-profile-0-version','c4-offer-proposal','high',?,'open')")
      .bind(settled.workspaceId, at, at, "f".repeat(64)).run();
    const drifted = await context.read(fixture.database, settled.verifiedAt + DAY);
    assert.equal(drifted.state, "NeedsReview");
    assert.equal(drifted.eligible, false);
    assert.ok(drifted.reasonCodes.includes("contact_drifted"));

    await fixture.database.prepare("UPDATE knowledge_drifts SET status='resolved' WHERE id='batch08-drift'").run();
    const resolved = await context.read(fixture.database, settled.verifiedAt + DAY);
    assert.deepEqual([resolved.state, resolved.eligible, resolved.reasonCodes], ["ContactReady", true, []], "resolved drift no longer blocks");
  } finally { await context.fixture.dispose(); }
});

async function arrangeContactReady() {
  const fixture = await createLocalFixture();
  try {
    await applyCanonicalMigrations(fixture.database);
    const acceptance = await fixture.vite.ssrLoadModule(resolve(root, "domain/person-discovery-c4-acceptance.ts"));
    const consumer = await fixture.vite.ssrLoadModule(resolve(root, "domain/person-discovery-c4-verification.ts"));
    const persistence = await fixture.vite.ssrLoadModule(resolve(root, "domain/contact-eligibility-persistence.ts"));
    const contacts = await fixture.vite.ssrLoadModule(resolve(root, "domain/contacts-handler.ts"));
    await acceptance.seedPersonDiscoveryC4(fixture.database, OWNER_EMAIL, PEPPER);
    const workspace = await fixture.database.prepare("SELECT id,owner_subject FROM workspaces LIMIT 1").first();
    const scope = { workspaceId: workspace.id, principalSubject: workspace.owner_subject };
    const service = acceptance.createPersonDiscoveryC4Service(verificationRequest(), bindings, fixture.database);
    const authority = await fixture.database.prepare("SELECT p.revision prospect_revision,cfg.id configuration_id,cfg.digest configuration_digest,cfg.revision configuration_revision FROM profile_prospects p JOIN typed_configurations cfg ON cfg.owner_id=p.profile_id AND cfg.workspace_id=p.workspace_id AND cfg.kind='profile_effective' AND cfg.active=1 WHERE p.id='c4-approved-prospect'").first();
    const started = await service.start(scope, { prospectId: "c4-approved-prospect", expectedProspectRevision: Number(authority.prospect_revision), expectedConfigurationId: authority.configuration_id, expectedConfigurationDigest: authority.configuration_digest, expectedConfigurationRevision: Number(authority.configuration_revision), maxCandidates: 2, maxProvenancePerCandidate: 1, idempotencyKey: "batch08-start" });
    const decided = await service.decide(scope, { runId: started.run.id, expectedResultDigest: started.run.resultDigest, decision: "create_new", candidateId: started.run.candidates[0].id, idempotencyKey: "batch08-decision" });
    await service.recordVerificationIntent(scope, { relevanceId: decided.decision.relevanceId, intent: "initial_verification", channel: "email", expectedProspectRevision: Number(authority.prospect_revision), expectedContactRevision: 1, expectedConfigurationId: authority.configuration_id, expectedConfigurationDigest: authority.configuration_digest, expectedConfigurationRevision: Number(authority.configuration_revision), idempotencyKey: "batch08-intent" });
    const consumed = await consumer.consumePersonDiscoveryC4VerificationIntent(verificationRequest(), bindings, fixture.database, scope, { relevanceId: decided.decision.relevanceId, channel: "email" });
    assert.equal(consumed.state, "ContactReady");

    const snapshot = await fixture.database.prepare("SELECT contact_id,prospect_id,configuration_id,configuration_digest,state FROM contact_eligibility_snapshots").first();
    const observation = await fixture.database.prepare("SELECT verified_at FROM contact_point_observations WHERE contact_id=? AND verified_at IS NOT NULL").bind(snapshot.contact_id).first();
    const reservation = await fixture.database.prepare("SELECT id FROM enrichment_reservations LIMIT 1").first();
    const settled = Object.freeze({
      snapshot,
      workspaceId: workspace.id,
      contactId: snapshot.contact_id,
      configurationId: snapshot.configuration_id,
      verifiedAt: Number(observation.verified_at),
      persistInput: Object.freeze({
        ownerSubject: workspace.owner_subject,
        workspaceId: workspace.id,
        reservationId: reservation.id,
        prospectId: snapshot.prospect_id,
        contactId: snapshot.contact_id,
        configurationId: snapshot.configuration_id,
        configurationDigest: snapshot.configuration_digest,
      }),
    });
    const read = async (database, now) => {
      const response = await contacts.handleContactsGet(new Request("http://127.0.0.1:8788/api/contacts"), {
        database, subjectPepper: PEPPER, pilotOwnerEmail: OWNER_EMAIL, capabilityBuildEpoch: "batch08-test-build/v1",
        getIdentity: async () => ({ email: OWNER_EMAIL, displayName: "Owner" }),
        contactSettlementAttestor: await consumer.createPersonDiscoveryC4SettlementAttestor(),
        localDemoContactAttestation: true, now: () => now,
      });
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.contactsPage.items.length, 1);
      assert.equal(body.capability.available, false, "reading never opens commands");
      return body.contactsPage.items[0];
    };
    return { fixture, acceptance, consumer, persistence, contacts, settled, read };
  } catch (error) {
    await fixture.dispose();
    throw error;
  }
}

/** Rewrites only the configuration manifest a query returns, leaving every stored row untouched. */
function withManifest(database, mutate) {
  return {
    prepare(sql) {
      const statement = database.prepare(sql);
      if (!String(sql).includes("manifest_json configuration_manifest_json") && !String(sql).includes("manifest_json AS configuration_manifest_json")) return statement;
      const patch = (row) => row && typeof row.configuration_manifest_json === "string" ? { ...row, configuration_manifest_json: mutate(row.configuration_manifest_json) } : row;
      const wrap = (bound) => ({
        bind(...values) { return wrap(bound.bind(...values)); },
        async first(column) { const row = patch(await bound.first()); return column && row ? row[column] ?? null : row; },
        async all() { const result = await bound.all(); return { ...result, results: result.results.map(patch) }; },
        run: (...args) => bound.run(...args),
        raw: (...args) => bound.raw(...args),
      });
      return wrap(statement);
    },
    batch: database.batch.bind(database),
  };
}

function verificationRequest() {
  return new Request("http://127.0.0.1:8788/api/local-demo/person-discovery-c4/verification", {
    method: "POST",
    headers: { "sec-fetch-site": "same-origin", "content-type": "application/json", "x-prospector-intent": "person-discovery-c4-verification", origin: "http://127.0.0.1:8788" },
    body: "{}",
  });
}

async function countRows(database, table) {
  return Number((await database.prepare(`SELECT COUNT(*) count FROM ${table}`).first()).count);
}

function d1Compatible(sqlite) {
  function prepare(sql) {
    const statement = sqlite.prepare(sql);
    const bound = [];
    const api = {
      bind(...values) { bound.splice(0, bound.length, ...values); return api; },
      async run() {
        const result = statement.run(...bound);
        return { success: true, meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
      },
      async first(column) {
        const row = statement.get(...bound) ?? null;
        return column && row ? row[column] ?? null : row;
      },
      async all() { return { success: true, results: statement.all(...bound) }; },
      async raw() { return statement.all(...bound).map((row) => Object.values(row)); },
    };
    return api;
  }
  return { prepare, async batch(statements) { return Promise.all(statements.map((statement) => statement.run())); } };
}

async function applyCanonicalMigrations(database) {
  for (const filename of CANONICAL_MIGRATION_FILENAMES) {
    const sql = await readFile(new URL(`../drizzle/${filename}`, import.meta.url), "utf8");
    for (const statement of sql.split("--> statement-breakpoint")) {
      if (statement.trim()) await database.prepare(statement.trim()).run();
    }
  }
}

async function createLocalFixture() {
  const sqlite = new DatabaseSync(":memory:", { enableForeignKeyConstraints: true });
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  const database = d1Compatible(sqlite);
  return { database, vite, async dispose() { await vite.close(); sqlite.close(); } };
}
