import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

import { createD1Fixture } from "./helpers/d1.mjs";
import { OUTREACH_NOW, OUTREACH_OWNER, seedOutreachAuthority } from "./helpers/outreach-fixture.mjs";

// This suite resolves the *effective live* outreach_outbox_event_scope_guard
// trigger by applying the entire current site/drizzle migration chain (the
// trigger is dropped and recreated by 0012, 0013, and 0015) and then proves,
// through real inserts against the real SQLite trigger rather than by
// parsing any single migration file, exactly which outreach_outbox_events
// states are reachable from a fresh queued item. A later migration that
// silently reopens a transition into "dispatching", "sent", or
// "delivery_unknown" will make this suite fail.

const DRIZZLE_DIR = new URL("../drizzle/", import.meta.url);
const GUARD_TRIGGER_NAME = "outreach_outbox_event_scope_guard";
const REACHABLE_STATES = ["pending", "leased", "cancelled", "failed_before_dispatch"];
const UNREACHABLE_STATES = ["dispatching", "sent", "delivery_unknown"];
const DECLARED_STATE_UNIVERSE = [...REACHABLE_STATES, ...UNREACHABLE_STATES].slice().sort();

async function listAllMigrationFilenames() {
  const entries = await readdir(DRIZZLE_DIR);
  return entries.filter((name) => /^\d{4}[^/]*\.sql$/u.test(name)).sort();
}

async function applyMigrationFilesInOrder(database, filenames) {
  for (const filename of filenames) {
    const sql = await readFile(new URL(filename, DRIZZLE_DIR), "utf8");
    for (const statement of sql.split("--> statement-breakpoint")) {
      const trimmed = statement.trim();
      if (trimmed) await database.prepare(trimmed).run();
    }
  }
}

async function applyFullMigrationChain(database) {
  const migrations = await listAllMigrationFilenames();
  assert.ok(
    migrations.length >= 16,
    "expected the full site/drizzle chain (through the governed outreach outbox migrations) to be on disk",
  );
  await applyMigrationFilesInOrder(database, migrations);
  return migrations;
}

// seedOutreachAuthority (and the legacy enrichment reservation/claim/settle
// flow it exercises) is only ever validated by the existing test suite
// against migrations 0000-0017. Applying every later migration (currently
// 0018-0019) *before* seeding hits a pre-existing, unrelated incompatibility
// between that legacy flow and the newer contacts-projection-generation
// triggers. That is not this suite's concern: it only needs the *schema* of
// every migration on disk in place before it exercises the guard trigger, so
// it seeds first (against the exact 0000-0017 chain the fixture already
// proves works) and then rolls the remaining migrations forward on top,
// exactly as they would have shipped historically. The guard trigger itself
// is fully defined by migration 0015, well before this cutover, so this
// ordering does not weaken the "effective live trigger" resolution at all.
async function applyMigrationsAfterOutreachPreparationRecovery(database) {
  const migrations = await listAllMigrationFilenames();
  const cutoffIndex = migrations.findIndex((name) => name.startsWith("0017_"));
  assert.ok(cutoffIndex >= 0, "expected migration 0017 (outreach preparation recovery) to exist on disk");
  const remaining = migrations.slice(cutoffIndex + 1);
  assert.ok(remaining.length >= 1, "expected at least one migration after 0017 to exercise forward-compatibility with");
  await applyMigrationFilesInOrder(database, remaining);
  return migrations;
}

async function readLiveTriggerSql(database, name) {
  const row = await database.prepare("SELECT sql FROM sqlite_master WHERE type='trigger' AND name=?").bind(name).first();
  assert.ok(row?.sql, `expected the live "${name}" trigger to exist after applying the full migration chain`);
  return row.sql;
}

function extractDeclaredStateUniverse(triggerSql) {
  const match = triggerSql.match(/NEW\.state\s+NOT IN\s*\(([^)]+)\)/u);
  assert.ok(match, "expected the guard trigger to enumerate its declared state universe via a NOT IN(...) list");
  return match[1]
    .split(",")
    .map((token) => token.trim().replace(/^'/u, "").replace(/'$/u, ""))
    .sort();
}

let digestCounter = 0;
function nextDigest() {
  digestCounter += 1;
  return digestCounter.toString(16).padStart(64, "0");
}

function scope(seeded) {
  return { workspaceId: seeded.workspaceId, ownerSubject: OUTREACH_OWNER.subject, now: () => OUTREACH_NOW };
}

async function loadRepository(fixture, seeded) {
  const repositoryModule = await fixture.vite.ssrLoadModule(new URL("../domain/outreach-repository.ts", import.meta.url).pathname);
  return repositoryModule.createD1OutreachRepository(fixture.database, scope(seeded));
}

async function loadOutbox(fixture, seeded) {
  const outboxModule = await fixture.vite.ssrLoadModule(new URL("../domain/outbox.ts", import.meta.url).pathname);
  return outboxModule.createD1OutboxRepository(fixture.database, scope(seeded));
}

async function insertActiveSenderConnection(fixture, seeded) {
  const issuance = await fixture.vite.ssrLoadModule(new URL("../domain/enrichment-grant-issuance.ts", import.meta.url).pathname);
  const senderAddressDigest = await issuance.canonicalDigest({ schema: "outreach-sender-address/v1", address: "owner@example.invalid" });
  const connectionId = "reachability-sender-connection";
  await fixture.database.prepare(
    "INSERT INTO outreach_sender_connections (id,workspace_id,provider,connection_subject_digest,sender_address_digest,protected_reference,protected_reference_version,status,verified_at,created_at) VALUES (?,?,'gmail',?,?,?,1,'active',?,?)",
  ).bind(connectionId, seeded.workspaceId, nextDigest(), senderAddressDigest, "vault-ref:synthetic-reachability", OUTREACH_NOW - 1, OUTREACH_NOW).run();
  const repository = await loadRepository(fixture, seeded);
  await repository.recordSenderCapability({
    senderConnectionId: connectionId,
    grantedScopes: ["https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.send"],
    verifiedAddresses: [{ address: "owner@example.invalid", kind: "canonical", verificationDigest: nextDigest() }],
    verifiedAt: OUTREACH_NOW,
    expiresAt: OUTREACH_NOW + 86_400_000,
    idempotencyKey: "reachability-sender-capability",
  });
  return connectionId;
}

function packageInput(seeded, suffix) {
  return {
    packageId: `reachability-package-${suffix}`,
    prospectId: seeded.prospectId,
    contactId: seeded.contactId,
    profileId: seeded.profileId,
    version: 1,
    expectedVersion: 0,
    configurationId: seeded.configurationId,
    configurationDigest: seeded.configurationDigest,
    configurationRevision: seeded.configurationRevision,
    prospectRevision: seeded.prospectRevision,
    contactRevision: seeded.contactRevision,
    contactEligibilitySnapshotId: seeded.eligibilityId,
    snapshot: {
      evidenceDigests: [seeded.evidenceDigest],
      claimGuardrailDigests: [seeded.guardrailDigest],
      recommendedAngle: `Synthetic governed outreach angle (${suffix})`,
      selectedRole: "champion",
      selectedContactPointDigests: [seeded.contactPointDigest],
      callScript: "Synthetic offline call script.",
      draftMessageIds: [`reachability-message-${suffix}`],
    },
    bindings: [
      { kind: "configuration", id: seeded.configurationId, digest: seeded.configurationDigest },
      { kind: "qualification", id: "outreach-assessment", digest: "2".repeat(64) },
      { kind: "review_decision", id: "outreach-review", digest: "5".repeat(64) },
      { kind: "source", id: "outreach-source", digest: seeded.sourceDigest },
      { kind: "evidence", id: "outreach-evidence", digest: seeded.evidenceDigest },
      { kind: "claim_guardrail", id: "outreach-guardrail", digest: seeded.guardrailDigest },
      { kind: "contact_observation", id: seeded.observationId, digest: seeded.observationDigest },
      { kind: "contact_eligibility", id: seeded.eligibilityId, digest: seeded.eligibilityDigest },
    ],
    idempotencyKey: `reachability-package-version-create-${suffix}`,
  };
}

function messageInput(packageVersion, seeded, suffix) {
  return {
    messageId: `reachability-message-${suffix}`,
    packageId: `reachability-package-${suffix}`,
    packageVersionId: packageVersion.id,
    version: 1,
    expectedVersion: 0,
    snapshot: {
      senderReference: "sender-synthetic",
      from: "owner@example.invalid",
      replyTo: null,
      to: ["verified@example.invalid"],
      cc: [],
      bcc: [],
      subject: `Synthetic governed outreach message (${suffix})`,
      textBody: "Hello from the offline fixture.",
      htmlBody: null,
      links: ["https://example.invalid/unsubscribe"],
      attachments: [],
      threadReference: null,
      replyToMessageReference: null,
    },
    intendedSendAt: OUTREACH_NOW + 1_000,
    timezone: "America/Toronto",
    unsubscribeTokenDigest: nextDigest(),
    bindings: [{ kind: "package_version", id: packageVersion.id, digest: packageVersion.digest }],
    idempotencyKey: `reachability-message-version-${suffix}`,
  };
}

async function recordRecipientAuthority(repository, message, packageApproval, seeded, suffix, validUntil) {
  const authority = await repository.recordRecipientDispatchAuthority({
    messageVersionId: message.id,
    packageApprovalId: packageApproval.id,
    emailObservationId: seeded.observationId,
    jurisdictionCode: "CA-ON",
    claimedBasisCode: "legitimate_interest",
    basisSourceId: "outreach-source",
    basisSourceDigest: seeded.sourceDigest,
    advisoryPolicyVersion: "prospector-advisory-v1",
    advisoryPolicyDigest: nextDigest(),
    unsubscribePathDigest: nextDigest(),
    acknowledgedAt: OUTREACH_NOW,
    validUntil,
    idempotencyKey: `reachability-recipient-authority-${suffix}`,
  });
  await repository.recordUnsubscribeAuthorityEvent({
    recipientAuthorityId: authority.id,
    expectedRevision: 0,
    status: "working",
    checkDigest: nextDigest(),
    observedAt: OUTREACH_NOW,
    validUntil,
    idempotencyKey: `reachability-unsubscribe-working-${suffix}`,
  });
  return authority;
}

async function enqueueSyntheticItem(fixture, seeded, senderConnectionId, suffix) {
  const repository = await loadRepository(fixture, seeded);
  const packageVersion = await repository.createPackageVersion(packageInput(seeded, suffix));
  const packageApproval = await repository.approvePackageVersion({
    packageVersionId: packageVersion.id,
    expectedVersion: 1,
    expiresAt: OUTREACH_NOW + 70_000,
    idempotencyKey: `reachability-package-approval-${suffix}`,
  });
  const message = await repository.createMessageVersion(messageInput(packageVersion, seeded, suffix));
  await recordRecipientAuthority(repository, message, packageApproval, seeded, suffix, OUTREACH_NOW + 70_000);
  const messageApproval = await repository.approveMessageVersion({
    messageVersionId: message.id,
    packageApprovalId: packageApproval.id,
    expectedVersion: 1,
    acknowledgementDigest: (
      await fixture.database.prepare("SELECT authority_digest FROM outreach_recipient_dispatch_authorities WHERE message_version_id=?").bind(message.id).first()
    ).authority_digest,
    expiresAt: OUTREACH_NOW + 60_000,
    idempotencyKey: `reachability-message-approval-${suffix}`,
  });
  const outbox = await loadOutbox(fixture, seeded);
  const queued = await outbox.enqueueApprovedMessage({ messageApprovalId: messageApproval.id, senderConnectionId });
  assert.equal(queued.kind, "queued", `expected item ${suffix} to enqueue as pending`);
  const pending = await fixture.database.prepare(
    "SELECT id,revision,state,lease_generation,lease_holder_id,lease_expires_at,created_at FROM outreach_outbox_events WHERE outbox_item_id=? AND revision=1",
  ).bind(queued.outboxItemId).first();
  assert.equal(pending.state, "pending");
  return { outboxItemId: queued.outboxItemId, event: pending };
}

async function insertOutboxEvent(fixture, seeded, { id, outboxItemId, revision, state, leaseGeneration, leaseHolderId, leaseExpiresAt, createdAt, reasonCode }) {
  return fixture.database.prepare(
    `INSERT INTO outreach_outbox_events
      (id,workspace_id,outbox_item_id,revision,state,lease_generation,lease_holder_id,lease_expires_at,reason_code,event_digest,created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
  ).bind(id, seeded.workspaceId, outboxItemId, revision, state, leaseGeneration, leaseHolderId, leaseExpiresAt, reasonCode, nextDigest(), createdAt).run();
}

// Attempts every forbidden target state against the given prior event using a
// small grid of structurally-plausible attribute combinations, so a future
// migration that reopens a transition under different lease bookkeeping is
// still caught. Every attempt must be rejected by the live trigger.
async function assertForbiddenStatesUnreachable(fixture, seeded, outboxItemId, prior, label) {
  const nextRevision = prior.revision + 1;
  const combos = [
    { leaseGeneration: prior.lease_generation, leaseHolderId: prior.lease_holder_id, leaseExpiresAt: prior.lease_expires_at, createdAt: prior.created_at + 1 },
    { leaseGeneration: (prior.lease_generation ?? 0) + 1, leaseHolderId: "synthetic-worker-probe", leaseExpiresAt: OUTREACH_NOW + 500_000, createdAt: OUTREACH_NOW + 200_000 },
    { leaseGeneration: 0, leaseHolderId: null, leaseExpiresAt: null, createdAt: prior.created_at + 1 },
    { leaseGeneration: prior.lease_generation, leaseHolderId: null, leaseExpiresAt: null, createdAt: prior.created_at + 1 },
  ];
  for (const forbiddenState of UNREACHABLE_STATES) {
    for (const [index, combo] of combos.entries()) {
      await assert.rejects(
        insertOutboxEvent(fixture, seeded, {
          id: `probe-${label}-${forbiddenState}-${index}-${nextRevision}`,
          outboxItemId,
          revision: nextRevision,
          state: forbiddenState,
          leaseGeneration: combo.leaseGeneration,
          leaseHolderId: combo.leaseHolderId,
          leaseExpiresAt: combo.leaseExpiresAt,
          createdAt: combo.createdAt,
          reasonCode: "reachability_probe",
        }),
        `expected "${label}" -> "${forbiddenState}" (combo ${index}) to remain unreachable`,
      );
    }
  }
}

test("outreach_outbox_event_scope_guard: declared state universe matches the known safety-critical set", async () => {
  const fixture = await createD1Fixture("outbox-guard-state-universe");
  try {
    await applyFullMigrationChain(fixture.database);
    const triggerSql = await readLiveTriggerSql(fixture.database, GUARD_TRIGGER_NAME);
    assert.deepEqual(
      extractDeclaredStateUniverse(triggerSql),
      DECLARED_STATE_UNIVERSE,
      "the guard's declared state universe drifted from the reviewed pending/leased/dispatching/sent/cancelled/failed_before_dispatch/delivery_unknown set",
    );
  } finally {
    await fixture.dispose();
  }
});

test("outreach_outbox_event_scope_guard: revision 1 is reachable only as pending", async () => {
  const fixture = await createD1Fixture("outbox-guard-revision-one");
  try {
    const seeded = await seedOutreachAuthority(fixture);
    await applyMigrationsAfterOutreachPreparationRecovery(fixture.database);
    const senderConnectionId = await insertActiveSenderConnection(fixture, seeded);
    const item = await enqueueSyntheticItem(fixture, seeded, senderConnectionId, "revision-one");
    for (const state of [...UNREACHABLE_STATES, "leased", "cancelled"]) {
      await assert.rejects(
        insertOutboxEvent(fixture, seeded, {
          id: `probe-revision-one-${state}`,
          outboxItemId: item.outboxItemId,
          revision: 1,
          state,
          leaseGeneration: 0,
          leaseHolderId: state === "leased" ? "synthetic-worker-probe" : null,
          leaseExpiresAt: state === "leased" ? OUTREACH_NOW + 500_000 : null,
          createdAt: item.event.created_at,
          reasonCode: "reachability_probe",
        }),
        `expected a fresh revision 1 row to remain rejectable as "${state}"`,
      );
    }
  } finally {
    await fixture.dispose();
  }
});

test("outreach_outbox_event_scope_guard: reachable set is exactly pending, leased, cancelled, failed_before_dispatch", async () => {
  const fixture = await createD1Fixture("outbox-guard-reachability");
  try {
    const seeded = await seedOutreachAuthority(fixture);
    await applyMigrationsAfterOutreachPreparationRecovery(fixture.database);
    const senderConnectionId = await insertActiveSenderConnection(fixture, seeded);

    // Branch A: pending -> leased -> cancelled (terminal).
    const itemA = await enqueueSyntheticItem(fixture, seeded, senderConnectionId, "branch-a");
    await assertForbiddenStatesUnreachable(fixture, seeded, itemA.outboxItemId, itemA.event, "pending(A)");
    await insertOutboxEvent(fixture, seeded, {
      id: "branch-a-leased",
      outboxItemId: itemA.outboxItemId,
      revision: 2,
      state: "leased",
      leaseGeneration: 1,
      leaseHolderId: "synthetic-worker-one",
      leaseExpiresAt: OUTREACH_NOW + 100_000,
      createdAt: itemA.event.created_at + 1,
      reasonCode: "leased",
    });
    const leasedA = await fixture.database.prepare(
      "SELECT revision,state,lease_generation,lease_holder_id,lease_expires_at,created_at FROM outreach_outbox_events WHERE outbox_item_id=? AND revision=2",
    ).bind(itemA.outboxItemId).first();
    assert.equal(leasedA.state, "leased");
    await assertForbiddenStatesUnreachable(fixture, seeded, itemA.outboxItemId, leasedA, "leased(A)");
    await insertOutboxEvent(fixture, seeded, {
      id: "branch-a-cancelled",
      outboxItemId: itemA.outboxItemId,
      revision: 3,
      state: "cancelled",
      leaseGeneration: leasedA.lease_generation,
      leaseHolderId: leasedA.lease_holder_id,
      leaseExpiresAt: leasedA.lease_expires_at,
      createdAt: leasedA.created_at + 1,
      reasonCode: "cancelled",
    });
    const cancelledA = await fixture.database.prepare(
      "SELECT revision,state,lease_generation,lease_holder_id,lease_expires_at,created_at FROM outreach_outbox_events WHERE outbox_item_id=? AND revision=3",
    ).bind(itemA.outboxItemId).first();
    assert.equal(cancelledA.state, "cancelled");
    await assertForbiddenStatesUnreachable(fixture, seeded, itemA.outboxItemId, cancelledA, "cancelled(A)");
    // Cancelled must also be terminal against the reachable states themselves.
    for (const state of ["pending", "leased", "cancelled", "failed_before_dispatch"]) {
      await assert.rejects(
        insertOutboxEvent(fixture, seeded, {
          id: `probe-cancelled-terminal-${state}`,
          outboxItemId: itemA.outboxItemId,
          revision: 4,
          state,
          leaseGeneration: cancelledA.lease_generation,
          leaseHolderId: cancelledA.lease_holder_id,
          leaseExpiresAt: cancelledA.lease_expires_at,
          createdAt: cancelledA.created_at + 1,
          reasonCode: "reachability_probe",
        }),
        `expected cancelled to stay terminal against "${state}"`,
      );
    }

    // Branch B: pending -> leased -> failed_before_dispatch -> leased (relock) -> leased (relock again).
    const itemB = await enqueueSyntheticItem(fixture, seeded, senderConnectionId, "branch-b");
    await insertOutboxEvent(fixture, seeded, {
      id: "branch-b-leased-1",
      outboxItemId: itemB.outboxItemId,
      revision: 2,
      state: "leased",
      leaseGeneration: 1,
      leaseHolderId: "synthetic-worker-one",
      leaseExpiresAt: OUTREACH_NOW + 100_000,
      createdAt: itemB.event.created_at + 1,
      reasonCode: "leased",
    });
    const leasedB1 = await fixture.database.prepare(
      "SELECT revision,state,lease_generation,lease_holder_id,lease_expires_at,created_at FROM outreach_outbox_events WHERE outbox_item_id=? AND revision=2",
    ).bind(itemB.outboxItemId).first();
    await insertOutboxEvent(fixture, seeded, {
      id: "branch-b-failed",
      outboxItemId: itemB.outboxItemId,
      revision: 3,
      state: "failed_before_dispatch",
      leaseGeneration: leasedB1.lease_generation,
      leaseHolderId: leasedB1.lease_holder_id,
      leaseExpiresAt: leasedB1.lease_expires_at,
      createdAt: leasedB1.created_at + 1,
      reasonCode: "failed_before_dispatch",
    });
    const failedB = await fixture.database.prepare(
      "SELECT revision,state,lease_generation,lease_holder_id,lease_expires_at,created_at FROM outreach_outbox_events WHERE outbox_item_id=? AND revision=3",
    ).bind(itemB.outboxItemId).first();
    assert.equal(failedB.state, "failed_before_dispatch");
    await assertForbiddenStatesUnreachable(fixture, seeded, itemB.outboxItemId, failedB, "failed_before_dispatch(B)");
    await insertOutboxEvent(fixture, seeded, {
      id: "branch-b-leased-2",
      outboxItemId: itemB.outboxItemId,
      revision: 4,
      state: "leased",
      leaseGeneration: failedB.lease_generation + 1,
      leaseHolderId: "synthetic-worker-two",
      leaseExpiresAt: OUTREACH_NOW + 200_000,
      createdAt: failedB.created_at + 1,
      reasonCode: "relocked",
    });
    const leasedB2 = await fixture.database.prepare(
      "SELECT revision,state,lease_generation,lease_holder_id,lease_expires_at,created_at FROM outreach_outbox_events WHERE outbox_item_id=? AND revision=4",
    ).bind(itemB.outboxItemId).first();
    assert.equal(leasedB2.state, "leased");
    await assertForbiddenStatesUnreachable(fixture, seeded, itemB.outboxItemId, leasedB2, "leased-relocked(B)");
    // Leased -> leased relock after expiry, to confirm relock cannot be used
    // as a side channel into a forbidden state further down the chain.
    await insertOutboxEvent(fixture, seeded, {
      id: "branch-b-leased-3",
      outboxItemId: itemB.outboxItemId,
      revision: 5,
      state: "leased",
      leaseGeneration: leasedB2.lease_generation + 1,
      leaseHolderId: "synthetic-worker-three",
      leaseExpiresAt: leasedB2.lease_expires_at + 100_000,
      createdAt: leasedB2.lease_expires_at,
      reasonCode: "relocked_after_expiry",
    });
    const leasedB3 = await fixture.database.prepare(
      "SELECT revision,state,lease_generation,lease_holder_id,lease_expires_at,created_at FROM outreach_outbox_events WHERE outbox_item_id=? AND revision=5",
    ).bind(itemB.outboxItemId).first();
    assert.equal(leasedB3.state, "leased");
    await assertForbiddenStatesUnreachable(fixture, seeded, itemB.outboxItemId, leasedB3, "leased-relocked-after-expiry(B)");

    const observedStates = new Set([
      itemA.event.state,
      leasedA.state,
      cancelledA.state,
      itemB.event.state,
      leasedB1.state,
      failedB.state,
      leasedB2.state,
      leasedB3.state,
    ]);
    assert.deepEqual([...observedStates].sort(), REACHABLE_STATES.slice().sort());
    assert.deepEqual((await fixture.database.prepare("PRAGMA foreign_key_check").all()).results, []);
  } finally {
    await fixture.dispose();
  }
});
