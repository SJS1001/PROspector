import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { countRows, createD1Fixture } from "./helpers/d1.mjs";
import {
  applyOutreachAttemptPreparationMigration,
  applyOutreachAuthorityMigration,
  applyOutreachMigrations,
  applyOutreachMigrationsThroughLease,
  applyOutreachPreCallMigration,
  applyOutreachPreparationRecoveryMigration,
  OUTREACH_NOW,
  OUTREACH_OWNER,
  seedOutreachAuthority,
} from "./helpers/outreach-fixture.mjs";

const TABLES = [
  "outreach_commands",
  "outreach_packages",
  "outreach_package_versions",
  "outreach_messages",
  "outreach_message_versions",
  "outreach_artifact_bindings",
  "outreach_package_approvals",
  "outreach_message_approvals",
  "outreach_message_approval_consumptions",
  "outreach_suppression_tombstones",
  "outreach_stop_events",
  "outreach_audit_records",
];
const OUTBOX_TABLES = ["outreach_sender_connections", "outreach_outbox_items", "outreach_outbox_events"];
const DELIVERY_AUTHORITY_TABLES = [
  "outreach_recipient_dispatch_authorities",
  "outreach_unsubscribe_authority_events",
  "outreach_sender_capability_snapshots",
  "outreach_sender_verified_addresses",
  "outreach_approval_revocations",
];
const PRE_CALL_TABLES = ["outreach_pre_call_recheck_receipts"];
const ATTEMPT_PREPARATION_TABLES = ["outreach_dispatch_attempt_preparations"];
const ATTEMPT_RECOVERY_TABLES = ["outreach_dispatch_attempt_preparation_events"];

test("governed outreach candidate migrations stay additive and metadata-aligned", async () => {
  const fixture = await createD1Fixture("outreach-migration");
  try {
    await applyOutreachMigrations(fixture.database);
    for (const table of TABLES) {
      assert.equal(
        (await fixture.database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").bind(table).first())?.name,
        table,
      );
      assert.equal(await countRows(fixture.database, table), 0);
    }
    for (const table of OUTBOX_TABLES) {
      assert.equal(
        (await fixture.database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").bind(table).first())?.name,
        table,
      );
      assert.equal(await countRows(fixture.database, table), 0);
    }
    for (const table of DELIVERY_AUTHORITY_TABLES) {
      assert.equal(
        (await fixture.database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").bind(table).first())?.name,
        table,
      );
      assert.equal(await countRows(fixture.database, table), 0);
    }
    const journal = JSON.parse(await readFile(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8"));
    const prior = JSON.parse(await readFile(new URL("../drizzle/meta/0009_snapshot.json", import.meta.url), "utf8"));
    const snapshot = JSON.parse(await readFile(new URL("../drizzle/meta/0010_snapshot.json", import.meta.url), "utf8"));
    const entry = journal.entries.find((entry) => entry.idx === 10);
    assert.deepEqual(entry, {
      idx: 10,
      version: "6",
      when: entry.when,
      tag: "0010_governed_outreach",
      breakpoints: true,
    });
    assert.equal(snapshot.prevId, prior.id);
    for (const table of TABLES) assert.equal(snapshot.tables[table]?.name, table);
    const outboxSnapshot = JSON.parse(await readFile(new URL("../drizzle/meta/0012_snapshot.json", import.meta.url), "utf8"));
    const outboxEntry = journal.entries.find((entry) => entry.idx === 12);
    assert.equal(outboxEntry.tag, "0012_governed_outreach_outbox");
    assert.equal(outboxSnapshot.prevId, JSON.parse(await readFile(new URL("../drizzle/meta/0011_snapshot.json", import.meta.url), "utf8")).id);
    for (const table of OUTBOX_TABLES) assert.equal(outboxSnapshot.tables[table]?.name, table);
    const leaseSnapshot = JSON.parse(await readFile(new URL("../drizzle/meta/0013_snapshot.json", import.meta.url), "utf8"));
    const leaseEntry = journal.entries.find((entry) => entry.idx === 13);
    assert.equal(leaseEntry.tag, "0013_governed_outreach_lease");
    assert.equal(leaseSnapshot.prevId, outboxSnapshot.id);
    assert.deepEqual(leaseSnapshot.tables, outboxSnapshot.tables, "trigger-only 0013 must not alter table metadata");
    const authoritySnapshot = JSON.parse(await readFile(new URL("../drizzle/meta/0014_snapshot.json", import.meta.url), "utf8"));
    const authorityEntry = journal.entries.find((entry) => entry.idx === 14);
    assert.equal(authorityEntry.tag, "0014_governed-outreach-authority");
    assert.equal(authoritySnapshot.prevId, leaseSnapshot.id);
    for (const table of DELIVERY_AUTHORITY_TABLES) assert.equal(authoritySnapshot.tables[table]?.name, table);
    const preCallSnapshot = JSON.parse(await readFile(new URL("../drizzle/meta/0015_snapshot.json", import.meta.url), "utf8"));
    const preCallEntry = journal.entries.find((entry) => entry.idx === 15);
    assert.equal(preCallEntry.tag, "0015_governed-outreach-pre-call");
    assert.equal(preCallSnapshot.prevId, authoritySnapshot.id);
    for (const table of PRE_CALL_TABLES) {
      assert.equal(preCallSnapshot.tables[table]?.name, table);
      assert.equal(await countRows(fixture.database, table), 0);
    }
    const attemptSnapshot = JSON.parse(await readFile(new URL("../drizzle/meta/0016_snapshot.json", import.meta.url), "utf8"));
    const attemptEntry = journal.entries.find((entry) => entry.idx === 16);
    assert.equal(attemptEntry.tag, "0016_governed-outreach-attempt-preparation");
    assert.equal(attemptSnapshot.prevId, preCallSnapshot.id);
    for (const table of ATTEMPT_PREPARATION_TABLES) {
      assert.equal(attemptSnapshot.tables[table]?.name, table);
      assert.equal(await countRows(fixture.database, table), 0);
    }
    const recoverySnapshot = JSON.parse(await readFile(new URL("../drizzle/meta/0017_snapshot.json", import.meta.url), "utf8"));
    const recoveryEntry = journal.entries.find((entry) => entry.idx === 17);
    assert.equal(recoveryEntry.tag, "0017_governed-outreach-preparation-recovery");
    assert.equal(recoverySnapshot.prevId, attemptSnapshot.id);
    for (const table of ATTEMPT_RECOVERY_TABLES) {
      assert.equal(recoverySnapshot.tables[table]?.name, table);
      assert.equal(await countRows(fixture.database, table), 0);
    }

    const migration = await readFile(new URL("../drizzle/0010_governed_outreach.sql", import.meta.url), "utf8");
    assert.doesNotMatch(migration, /\b(?:access_token|refresh_token|oauth_code|pkce_verifier|bearer_value|provider_secret)\b/iu);
    assert.doesNotMatch(migration, /CREATE TABLE\s+[`"]?(?:outbox|dispatch|gmail|provider)/iu);
    const outboxMigration = await readFile(new URL("../drizzle/0012_governed_outreach_outbox.sql", import.meta.url), "utf8");
    assert.doesNotMatch(outboxMigration, /\b(?:access_token|refresh_token|oauth_code|pkce_verifier|bearer_value|provider_secret)\b/iu);
    const outboxSource = await readFile(new URL("../domain/outbox.ts", import.meta.url), "utf8");
    assert.deepEqual(
      [...outboxSource.matchAll(/^import\s+.*?from\s+"([^"]+)";$/gmu)].map((match) => match[1]),
      ["./enrichment-grant-issuance"],
    );
    assert.doesNotMatch(outboxSource, /\bfetch\s*\(|gmail-boundary|gmail\.ts/iu);
    const preCallMigration = await readFile(new URL("../drizzle/0015_governed-outreach-pre-call.sql", import.meta.url), "utf8");
    assert.doesNotMatch(preCallMigration, /\b(?:access_token|refresh_token|oauth_code|pkce_verifier|bearer_value|provider_secret)\b/iu);
    assert.match(preCallMigration, /provider_invocation_authorized[^\n]+DEFAULT 0 NOT NULL/iu);
    const attemptMigration = await readFile(new URL("../drizzle/0016_governed-outreach-attempt-preparation.sql", import.meta.url), "utf8");
    assert.doesNotMatch(attemptMigration, /\b(?:access_token|refresh_token|oauth_code|pkce_verifier|bearer_value|provider_secret|message_body)\b/iu);
    assert.doesNotMatch(attemptMigration, /\b(?:boundary_committed|accepted|definite_failure_before_transmission|ambiguous|reconciled_sent)\b/iu);
    assert.match(attemptMigration, /provider_invocation_authorized[^\n]+DEFAULT 0 NOT NULL/iu);
    assert.doesNotMatch(attemptMigration, /\b(?:fetch|route|worker|cron)\b/iu);
    const recoveryMigration = await readFile(new URL("../drizzle/0017_governed-outreach-preparation-recovery.sql", import.meta.url), "utf8");
    assert.doesNotMatch(recoveryMigration, /\b(?:access_token|refresh_token|oauth_code|pkce_verifier|bearer_value|provider_secret|message_body|protected_reference)\b/iu);
    assert.doesNotMatch(recoveryMigration, /\b(?:boundary_committed|accepted|definite_failure_before_transmission|ambiguous|reconciled_sent)\b/iu);
    assert.match(recoveryMigration, /provider_invocation_authorized[^\n]+DEFAULT 0 NOT NULL/iu);
    assert.doesNotMatch(recoveryMigration, /\b(?:fetch|route|worker|cron|mailport)\b/iu);
    assert.doesNotMatch(outboxSource, /\bfetch\s*\(|gmail-boundary|gmail\.ts/iu);
    const triggers = migration.match(/CREATE TRIGGER[\s\S]*?END;/gu) ?? [];
    assert.ok(triggers.length >= 30);
    for (const trigger of triggers) assert.equal((trigger.match(/\bEND;/gu) ?? []).length, 1, "each 0010 trigger keeps one outer END terminator");
    assert.deepEqual((await fixture.database.prepare("PRAGMA foreign_key_check").all()).results, []);
  } finally {
    await fixture.dispose();
  }
});

test("0014 upgrades populated 0013 state without inferring new dispatch authority", async () => {
  const fixture = await createD1Fixture("outreach-authority-upgrade");
  try {
    await applyOutreachMigrationsThroughLease(fixture.database);
    await fixture.database.prepare(
      "INSERT INTO workspaces (id,company_name,owner_subject,created_at,updated_at,revision) VALUES ('authority-upgrade-workspace','Synthetic','authority-upgrade-owner',?,?,1)",
    ).bind(OUTREACH_NOW, OUTREACH_NOW).run();
    await fixture.database.prepare(
      `INSERT INTO outreach_sender_connections
        (id,workspace_id,provider,connection_subject_digest,sender_address_digest,protected_reference,protected_reference_version,status,verified_at,created_at)
       VALUES ('authority-upgrade-connection','authority-upgrade-workspace','gmail',?,?,'vault-ref:synthetic-upgrade',1,'active',?,?)`,
    ).bind("1".repeat(64), "2".repeat(64), OUTREACH_NOW - 1, OUTREACH_NOW).run();
    await applyOutreachAuthorityMigration(fixture.database);
    await applyOutreachPreCallMigration(fixture.database);
    await applyOutreachAttemptPreparationMigration(fixture.database);
    assert.equal(await countRows(fixture.database, "outreach_sender_connections"), 1);
    for (const table of DELIVERY_AUTHORITY_TABLES) assert.equal(await countRows(fixture.database, table), 0);
    for (const table of PRE_CALL_TABLES) assert.equal(await countRows(fixture.database, table), 0);
    for (const table of ATTEMPT_PREPARATION_TABLES) assert.equal(await countRows(fixture.database, table), 0);
    assert.deepEqual((await fixture.database.prepare("PRAGMA foreign_key_check").all()).results, []);
  } finally {
    await fixture.dispose();
  }
});

test("0016 upgrades populated 0015 state without inferring an attempt and can prepare the current receipt", async () => {
  const fixture = await createD1Fixture("outreach-attempt-upgrade");
  try {
    await applyOutreachMigrationsThroughLease(fixture.database);
    await applyOutreachAuthorityMigration(fixture.database);
    await applyOutreachPreCallMigration(fixture.database);
    const seeded = await seedOutreachAuthority(fixture, { applyMigrations: false });
    const prepared = await prepareApprovedMessageFromSeeded(fixture, seeded, {
      packageExpiresAt: OUTREACH_NOW + 70_000,
      messageExpiresAt: OUTREACH_NOW + 60_000,
    });
    const senderConnectionId = await insertSenderConnection(fixture, seeded, "active", 1);
    const enqueue = await loadOutbox(fixture, seeded);
    const queued = await enqueue.enqueueApprovedMessage({ messageApprovalId: prepared.messageApproval.id, senderConnectionId });
    const outboxModule = await fixture.vite.ssrLoadModule(new URL("../domain/outbox.ts", import.meta.url).pathname);
    const boundary = outboxModule.createD1OutboxRepository(fixture.database, {
      ...scope(seeded),
      now: () => OUTREACH_NOW + 1_000,
    });
    const lease = await boundary.claimDispatchLease({ outboxItemId: queued.outboxItemId, holderId: "synthetic-worker-one" });
    assert.equal(lease.kind, "claimed");
    const leaseInput = { outboxItemId: queued.outboxItemId, holderId: lease.holderId, leaseGeneration: lease.leaseGeneration };
    const receipt = await boundary.recordPreCallRecheckReceipt(leaseInput);
    assert.equal(receipt.kind, "recorded");
    await applyOutreachAttemptPreparationMigration(fixture.database);
    for (const table of ATTEMPT_PREPARATION_TABLES) assert.equal(await countRows(fixture.database, table), 0);
    const result = await boundary.prepareDispatchAttempt({ ...leaseInput, preCallReceiptId: receipt.receiptId });
    assert.equal(result.kind, "prepared_no_invocation");
    assert.equal(result.providerInvocationAuthorized, false);
    assert.equal(result.providerCalls, 0);
    assert.equal(await countRows(fixture.database, "outreach_dispatch_attempt_preparations"), 1);
    assert.equal(await countRows(fixture.database, "outreach_outbox_events"), 2);
  } finally {
    await fixture.dispose();
  }
});

test("0017 upgrades a populated 0016 attempt without inferring recovery and requires explicit expiry void", async () => {
  const fixture = await createD1Fixture("outreach-recovery-upgrade");
  try {
    await applyOutreachMigrationsThroughLease(fixture.database);
    await applyOutreachAuthorityMigration(fixture.database);
    await applyOutreachPreCallMigration(fixture.database);
    await applyOutreachAttemptPreparationMigration(fixture.database);
    const seeded = await seedOutreachAuthority(fixture, { applyMigrations: false });
    const prepared = await prepareApprovedMessageFromSeeded(fixture, seeded, {
      packageExpiresAt: OUTREACH_NOW + 70_000,
      messageExpiresAt: OUTREACH_NOW + 60_000,
    });
    const senderConnectionId = await insertSenderConnection(fixture, seeded, "active", 1);
    const outbox = await loadOutbox(fixture, seeded);
    const queued = await outbox.enqueueApprovedMessage({ messageApprovalId: prepared.messageApproval.id, senderConnectionId });
    const outboxModule = await fixture.vite.ssrLoadModule(new URL("../domain/outbox.ts", import.meta.url).pathname);
    const initial = outboxModule.createD1OutboxRepository(fixture.database, { ...scope(seeded), now: () => OUTREACH_NOW + 1_000 });
    const lease = await initial.claimDispatchLease({ outboxItemId: queued.outboxItemId, holderId: "synthetic-worker-one" });
    const leaseInput = { outboxItemId: queued.outboxItemId, holderId: lease.holderId, leaseGeneration: lease.leaseGeneration };
    const receipt = await initial.recordPreCallRecheckReceipt(leaseInput);
    const attempt = await initial.prepareDispatchAttempt({ ...leaseInput, preCallReceiptId: receipt.receiptId });
    assert.equal(attempt.kind, "prepared_no_invocation");
    await applyOutreachPreparationRecoveryMigration(fixture.database);
    assert.equal(await countRows(fixture.database, "outreach_dispatch_attempt_preparation_events"), 0);
    const expired = outboxModule.createD1OutboxRepository(fixture.database, { ...scope(seeded), now: () => lease.expiresAt });
    const voided = await expired.voidExpiredDispatchPreparation({
      outboxItemId: queued.outboxItemId,
      preparationId: attempt.preparationId,
      expectedLeaseGeneration: lease.leaseGeneration,
    });
    assert.equal(voided.kind, "voided_before_invocation");
    assert.equal(voided.effectiveAt, lease.expiresAt);
    assert.equal(voided.providerInvocationAuthorized, false);
    assert.equal(voided.providerCalls, 0);
    assert.equal(await countRows(fixture.database, "outreach_dispatch_attempt_preparation_events"), 1);
  } finally {
    await fixture.dispose();
  }
});

test("0015 fences a legacy dispatching history from retry and receipt authority", async () => {
  const fixture = await createD1Fixture("outreach-pre-call-legacy-history");
  try {
    await applyOutreachMigrationsThroughLease(fixture.database);
    await applyOutreachAuthorityMigration(fixture.database);
    const seeded = await seedOutreachAuthority(fixture, { applyMigrations: false });
    const prepared = await prepareApprovedMessageFromSeeded(fixture, seeded, {
      packageExpiresAt: OUTREACH_NOW + 70_000,
      messageExpiresAt: OUTREACH_NOW + 60_000,
    });
    const senderConnectionId = await insertSenderConnection(fixture, seeded, "active", 1);
    const enqueue = await loadOutbox(fixture, seeded);
    const queued = await enqueue.enqueueApprovedMessage({ messageApprovalId: prepared.messageApproval.id, senderConnectionId });
    const outboxModule = await fixture.vite.ssrLoadModule(new URL("../domain/outbox.ts", import.meta.url).pathname);
    const beforeUpgrade = outboxModule.createD1OutboxRepository(fixture.database, {
      ...scope(seeded),
      now: () => OUTREACH_NOW + 1_000,
    });
    const lease = await beforeUpgrade.claimDispatchLease({ outboxItemId: queued.outboxItemId, holderId: "synthetic-worker-one" });
    assert.equal(lease.kind, "claimed");
    await fixture.database.prepare(
      `INSERT INTO outreach_outbox_events
        (id,workspace_id,outbox_item_id,revision,state,lease_generation,lease_holder_id,lease_expires_at,reason_code,event_digest,created_at)
       VALUES ('legacy-dispatching',?,?,3,'dispatching',1,'synthetic-worker-one',?,'legacy_dispatching',?,?)`,
    ).bind(seeded.workspaceId, queued.outboxItemId, lease.expiresAt, "a".repeat(64), OUTREACH_NOW + 1_001).run();
    await fixture.database.prepare(
      `INSERT INTO outreach_outbox_events
        (id,workspace_id,outbox_item_id,revision,state,lease_generation,lease_holder_id,lease_expires_at,reason_code,event_digest,created_at)
       VALUES ('legacy-failed-before-dispatch',?,?,4,'failed_before_dispatch',1,'synthetic-worker-one',?,'legacy_failure',?,?)`,
    ).bind(seeded.workspaceId, queued.outboxItemId, lease.expiresAt, "b".repeat(64), OUTREACH_NOW + 1_002).run();
    await applyOutreachPreCallMigration(fixture.database);
    assert.equal(await countRows(fixture.database, "outreach_pre_call_recheck_receipts"), 0);
    const afterUpgrade = outboxModule.createD1OutboxRepository(fixture.database, {
      ...scope(seeded),
      now: () => OUTREACH_NOW + 1_003,
    });
    const retry = await afterUpgrade.claimDispatchLease({ outboxItemId: queued.outboxItemId, holderId: "synthetic-worker-two" });
    assert.equal(retry.kind, "blocked");
    assert.equal(retry.providerInvocationAuthorized, false);
    assert.equal(retry.providerCalls, 0);
    const receipt = await afterUpgrade.recordPreCallRecheckReceipt({
      outboxItemId: queued.outboxItemId,
      holderId: "synthetic-worker-one",
      leaseGeneration: lease.leaseGeneration,
    });
    assert.equal(receipt.kind, "blocked");
    assert.equal(await countRows(fixture.database, "outreach_pre_call_recheck_receipts"), 0);
    assert.equal(await countRows(fixture.database, "outreach_outbox_events"), 4);
  } finally {
    await fixture.dispose();
  }
});

test("package version creation is atomic, immutable, version-fenced, and exactly replayable", async () => {
  const fixture = await createD1Fixture("outreach-package");
  try {
    const seeded = await seedOutreachAuthority(fixture);
    const repository = await loadRepository(fixture, seeded);
    const input = packageInput(seeded);
    const results = await Promise.all([repository.createPackageVersion(input), repository.createPackageVersion(input)]);
    assert.equal(results.filter((result) => result.replayed).length, 1);
    assert.equal(results[0].id, results[1].id);
    assert.equal(results[0].digest, results[1].digest);
    assert.equal(await countRows(fixture.database, "outreach_packages"), 1);
    assert.equal(await countRows(fixture.database, "outreach_package_versions"), 1);
    assert.equal(await countRows(fixture.database, "outreach_artifact_bindings"), input.bindings.length);
    assert.equal(await countRows(fixture.database, "outreach_commands"), 1);
    assert.equal(await countRows(fixture.database, "outreach_audit_records"), 1);

    await assert.rejects(
      repository.createPackageVersion({ ...input, snapshot: { ...input.snapshot, recommendedAngle: "Changed under the same command key" } }),
      /outreach_repository_conflict/,
    );
    await assert.rejects(
      repository.createPackageVersion({ ...input, version: 3, expectedVersion: 2, idempotencyKey: "outreach-package-skipped-version" }),
      /outreach_repository_conflict/,
    );
    await assert.rejects(
      fixture.database.prepare("UPDATE outreach_package_versions SET snapshot_json='{}' WHERE id=?").bind(results[0].id).run(),
      /immutable outreach package version/,
    );
    assert.equal(await countRows(fixture.database, "outreach_package_versions"), 1);
  } finally {
    await fixture.dispose();
  }
});

test("a failed package batch rolls back command, root, bindings, and audit together", async () => {
  const fixture = await createD1Fixture("outreach-package-rollback");
  try {
    const seeded = await seedOutreachAuthority(fixture);
    const failingDatabase = Object.freeze({
      prepare: (...args) => fixture.database.prepare(...args),
      batch: (statements) => fixture.database.batch([
        ...statements,
        fixture.database.prepare("INSERT INTO outreach_audit_records (id) VALUES ('forced-failure')"),
      ]),
    });
    const repositoryModule = await fixture.vite.ssrLoadModule(new URL("../domain/outreach-repository.ts", import.meta.url).pathname);
    const repository = repositoryModule.createD1OutreachRepository(failingDatabase, scope(seeded));
    await assert.rejects(repository.createPackageVersion(packageInput(seeded)), /outreach_repository_conflict/);
    for (const table of ["outreach_commands", "outreach_packages", "outreach_package_versions", "outreach_artifact_bindings", "outreach_audit_records"]) {
      assert.equal(await countRows(fixture.database, table), 0, `${table} must roll back`);
    }
  } finally {
    await fixture.dispose();
  }
});

test("message and package approvals remain separate immutable authorities", async () => {
  const fixture = await createD1Fixture("outreach-message-approvals");
  try {
    const seeded = await seedOutreachAuthority(fixture);
    await fixture.database.prepare("UPDATE prospecting_candidates SET status='observed' WHERE id='outreach-candidate'").run();
    const repository = await loadRepository(fixture, seeded);
    const packageVersion = await repository.createPackageVersion(packageInput(seeded));
    const packageApproval = await repository.approvePackageVersion({
      packageVersionId: packageVersion.id,
      expectedVersion: 1,
      expiresAt: OUTREACH_NOW + 20_000,
      idempotencyKey: "outreach-package-approval",
    });
    assert.equal(await countRows(fixture.database, "outreach_package_approvals"), 1);
    assert.equal(await countRows(fixture.database, "outreach_message_approvals"), 0);
    assert.equal(await countRows(fixture.database, "outreach_message_approval_consumptions"), 0);

    const message = await repository.createMessageVersion(messageInput(packageVersion, seeded));
    const recipientAuthority = await recordRecipientAuthority(repository, message, packageApproval, seeded);
    const acknowledgementDigest = recipientAuthority.digest;
    const approvalInput = {
      messageVersionId: message.id,
      packageApprovalId: packageApproval.id,
      expectedVersion: 1,
      acknowledgementDigest,
      expiresAt: OUTREACH_NOW + 10_000,
      idempotencyKey: "outreach-message-approval",
    };
    const approvals = await Promise.all([
      repository.approveMessageVersion(approvalInput),
      repository.approveMessageVersion(approvalInput),
    ]);
    assert.equal(approvals.filter((result) => result.replayed).length, 1);
    assert.equal(approvals[0].id, approvals[1].id);
    assert.equal(await countRows(fixture.database, "outreach_message_approvals"), 1);
    assert.equal(await countRows(fixture.database, "outreach_message_approval_consumptions"), 0, "approval does not enqueue or consume itself");
    await assert.rejects(
      fixture.database.prepare("UPDATE outreach_message_approvals SET expires_at=expires_at+1 WHERE id=?").bind(approvals[0].id).run(),
      /immutable outreach message approval/,
    );
    const auditRows = (await fixture.database.prepare("SELECT action,reason_code,material_digest FROM outreach_audit_records ORDER BY created_at,id").all()).results;
    assert.equal(auditRows.length, 6);
    assert.doesNotMatch(JSON.stringify(auditRows), /Synthetic governed outreach message|Hello from the offline fixture/);
    assert.equal(await countRows(fixture.database, "outreach_stop_events"), 0);
  } finally {
    await fixture.dispose();
  }
});

test("approved message enqueue is atomic, exactly replayable, immutable, and zero-effect", async () => {
  const fixture = await createD1Fixture("outreach-outbox-enqueue");
  try {
    const prepared = await prepareApprovedMessage(fixture);
    const outbox = await loadOutbox(fixture, prepared.seeded);
    const senderConnectionId = await insertSenderConnection(fixture, prepared.seeded, "active", 1);
    const input = { messageApprovalId: prepared.messageApproval.id, senderConnectionId };

    const first = await outbox.enqueueApprovedMessage(input);
    assert.equal(first.kind, "queued");
    assert.equal(first.replayed, false);
    assert.equal(first.providerCalls, 0);
    assert.match(first.sendKey, /^[a-f0-9]{64}$/u);
    assert.match(first.dispatchKey, /^[a-f0-9]{64}$/u);
    assert.equal(await countRows(fixture.database, "outreach_message_approval_consumptions"), 1);
    assert.equal(await countRows(fixture.database, "outreach_outbox_items"), 1);
    assert.equal(await countRows(fixture.database, "outreach_outbox_events"), 1);
    assert.deepEqual(
      await fixture.database.prepare(
        "SELECT revision,state,lease_generation,lease_holder_id,lease_expires_at,reason_code FROM outreach_outbox_events WHERE outbox_item_id=?",
      ).bind(first.outboxItemId).first(),
      {
        revision: 1,
        state: "pending",
        lease_generation: 0,
        lease_holder_id: null,
        lease_expires_at: null,
        reason_code: "approved_message_queued",
      },
    );

    const replay = await outbox.enqueueApprovedMessage(input);
    assert.deepEqual(replay, { ...first, replayed: true });
    assert.equal(await countRows(fixture.database, "outreach_message_approval_consumptions"), 1);
    assert.equal(await countRows(fixture.database, "outreach_outbox_items"), 1);
    assert.equal(await countRows(fixture.database, "outreach_outbox_events"), 1);

    await assert.rejects(
      fixture.database.prepare(
        "INSERT INTO outreach_outbox_events (id,workspace_id,outbox_item_id,revision,state,lease_generation,lease_holder_id,lease_expires_at,reason_code,event_digest,created_at) VALUES ('invalid-direct-sent',?,?,2,'sent',0,NULL,NULL,'bypass',?,?)",
      ).bind(prepared.seeded.workspaceId, first.outboxItemId, "6".repeat(64), OUTREACH_NOW + 1).run(),
      /invalid outreach outbox event/,
    );
    await assert.rejects(
      fixture.database.prepare("UPDATE outreach_outbox_items SET dispatch_key=? WHERE id=?").bind("0".repeat(64), first.outboxItemId).run(),
      /immutable outreach outbox item/,
    );
    await assert.rejects(
      fixture.database.prepare("DELETE FROM outreach_sender_connections WHERE id=?").bind(senderConnectionId).run(),
      /immutable outreach sender connection/,
    );
    assert.deepEqual((await fixture.database.prepare("PRAGMA foreign_key_check").all()).results, []);
  } finally {
    await fixture.dispose();
  }
});

test("recipient dispatch authority binds one verified recipient and never represents legal approval", async () => {
  const fixture = await createD1Fixture("outreach-recipient-authority");
  try {
    const seeded = await seedOutreachAuthority(fixture);
    const repository = await loadRepository(fixture, seeded);
    const packageVersion = await repository.createPackageVersion(packageInput(seeded));
    const packageApproval = await repository.approvePackageVersion({
      packageVersionId: packageVersion.id,
      expectedVersion: 1,
      expiresAt: OUTREACH_NOW + 20_000,
      idempotencyKey: "recipient-authority-package-approval",
    });
    const message = await repository.createMessageVersion(messageInput(packageVersion, seeded));
    const authority = await recordRecipientAuthority(repository, message, packageApproval, seeded);
    const replay = await recordRecipientAuthority(repository, message, packageApproval, seeded);
    assert.equal(replay.id, authority.id);
    assert.equal(replay.replayed, true);
    const row = await fixture.database.prepare(
      `SELECT jurisdiction_code,claimed_basis_code,recipient_address_digest,sender_address_digest,
              unsubscribe_scope_kind,unsubscribe_scope_digest,acknowledgement_digest,authority_digest
       FROM outreach_recipient_dispatch_authorities WHERE id=?`,
    ).bind(authority.id).first();
    assert.deepEqual(row, {
      jurisdiction_code: "CA-ON",
      claimed_basis_code: "legitimate_interest",
      recipient_address_digest: seeded.contactPointDigest,
      sender_address_digest: await (await fixture.vite.ssrLoadModule(new URL("../domain/enrichment-grant-issuance.ts", import.meta.url).pathname)).canonicalDigest({ schema: "outreach-sender-address/v1", address: "owner@example.invalid" }),
      unsubscribe_scope_kind: "exact_email",
      unsubscribe_scope_digest: seeded.contactPointDigest,
      acknowledgement_digest: authority.digest,
      authority_digest: authority.digest,
    });
    assert.doesNotMatch(JSON.stringify(row), /legal[_ -]?(?:approval|clearance)|basis_allowed/iu);
    await assert.rejects(
      fixture.database.prepare("UPDATE outreach_recipient_dispatch_authorities SET jurisdiction_code='US' WHERE id=?").bind(authority.id).run(),
      /immutable outreach recipient dispatch authority/,
    );

    const secondMessage = await repository.createMessageVersion({
      ...messageInput(packageVersion, seeded),
      messageId: "outreach-message-multiple-recipients",
      snapshot: { ...messageInput(packageVersion, seeded).snapshot, to: ["verified@example.invalid", "other@example.invalid"] },
      unsubscribeTokenDigest: "8".repeat(64),
      idempotencyKey: "outreach-message-multiple-recipients",
    });
    await assert.rejects(
      repository.recordRecipientDispatchAuthority({
        messageVersionId: secondMessage.id,
        packageApprovalId: packageApproval.id,
        emailObservationId: seeded.observationId,
        jurisdictionCode: "CA-ON",
        claimedBasisCode: "legitimate_interest",
        basisSourceId: "outreach-source",
        basisSourceDigest: seeded.sourceDigest,
        advisoryPolicyVersion: "prospector-advisory-v1",
        advisoryPolicyDigest: "c".repeat(64),
        unsubscribePathDigest: "d".repeat(64),
        acknowledgedAt: OUTREACH_NOW,
        validUntil: OUTREACH_NOW + 20_000,
        idempotencyKey: "outreach-recipient-authority-multiple-recipients",
      }),
      /outreach_repository_conflict/,
    );
  } finally {
    await fixture.dispose();
  }
});

test("recipient authority is capped by attested contact freshness and a Package-bound basis source", async () => {
  const fixture = await createD1Fixture("outreach-recipient-authority-freshness");
  try {
    const seeded = await seedOutreachAuthority(fixture);
    const repository = await loadRepository(fixture, seeded);
    const packageVersion = await repository.createPackageVersion(packageInput(seeded));
    const packageApproval = await repository.approvePackageVersion({
      packageVersionId: packageVersion.id,
      expectedVersion: 1,
      expiresAt: OUTREACH_NOW + 31 * 24 * 60 * 60 * 1000,
      idempotencyKey: "recipient-freshness-package-approval",
    });
    const message = await repository.createMessageVersion(messageInput(packageVersion, seeded));
    const observation = await fixture.database.prepare(
      "SELECT verified_at FROM contact_point_observations WHERE id=?",
    ).bind(seeded.observationId).first();
    const freshnessExpiry = Number(observation.verified_at) + 30 * 24 * 60 * 60 * 1000;
    await assert.rejects(
      recordRecipientAuthority(repository, message, packageApproval, seeded, freshnessExpiry + 1),
      /outreach_repository_conflict/,
    );
    assert.equal(await countRows(fixture.database, "outreach_recipient_dispatch_authorities"), 0);

    await fixture.database.prepare(
      `INSERT INTO sources (id,workspace_id,created_at,updated_at,revision,origin,opaque_locator,source_digest,privacy,license,status)
       VALUES ('unbound-authority-source',?,?,?,1,'public_research','synthetic:unbound',?,'public','synthetic-test-only','available')`,
    ).bind(seeded.workspaceId, OUTREACH_NOW, OUTREACH_NOW, "a".repeat(64)).run();
    await assert.rejects(
      repository.recordRecipientDispatchAuthority({
        messageVersionId: message.id,
        packageApprovalId: packageApproval.id,
        emailObservationId: seeded.observationId,
        jurisdictionCode: "CA-ON",
        claimedBasisCode: "legitimate_interest",
        basisSourceId: "unbound-authority-source",
        basisSourceDigest: "a".repeat(64),
        advisoryPolicyVersion: "prospector-advisory-v1",
        advisoryPolicyDigest: "c".repeat(64),
        unsubscribePathDigest: "d".repeat(64),
        acknowledgedAt: OUTREACH_NOW,
        validUntil: freshnessExpiry,
        idempotencyKey: "outreach-unbound-recipient-authority",
      }),
      /outreach_repository_conflict/,
    );
    assert.equal(await countRows(fixture.database, "outreach_recipient_dispatch_authorities"), 0);
    assert.equal((await recordRecipientAuthority(repository, message, packageApproval, seeded, freshnessExpiry)).replayed, false);
  } finally {
    await fixture.dispose();
  }
});

test("sender capability canonicalizes and seals its exact verified address set", async () => {
  const fixture = await createD1Fixture("outreach-sender-capability-seal");
  try {
    const seeded = await seedOutreachAuthority(fixture);
    const repository = await loadRepository(fixture, seeded);
    const connectionId = await insertRawSenderConnection(fixture, seeded, "active", 1);
    const input = {
      senderConnectionId: connectionId,
      grantedScopes: [
        "https://www.googleapis.com/auth/gmail.send",
        "https://www.googleapis.com/auth/gmail.readonly",
      ],
      verifiedAddresses: [
        { address: "alias@example.invalid", kind: "alias", verificationDigest: "8".repeat(64) },
        { address: "owner@example.invalid", kind: "canonical", verificationDigest: "7".repeat(64) },
      ],
      verifiedAt: OUTREACH_NOW,
      expiresAt: OUTREACH_NOW + 86_400_000,
      idempotencyKey: "outreach-canonical-sender-capability",
    };
    const capability = await repository.recordSenderCapability(input);
    const replay = await repository.recordSenderCapability({
      ...input,
      grantedScopes: [...input.grantedScopes].reverse(),
      verifiedAddresses: [...input.verifiedAddresses].reverse(),
    });
    assert.deepEqual(replay, { ...capability, replayed: true });
    const issuance = await fixture.vite.ssrLoadModule(new URL("../domain/enrichment-grant-issuance.ts", import.meta.url).pathname);
    const forgedDigest = await issuance.canonicalDigest({ schema: "outreach-sender-address/v1", address: "forged@example.invalid" });
    await assert.rejects(
      fixture.database.prepare(
        `INSERT INTO outreach_sender_verified_addresses
          (id,workspace_id,sender_capability_id,address_digest,address_kind,verification_digest,verified_at,expires_at,created_at)
         VALUES ('forged-sender-alias',?,?,?,'alias',?,?,?,?)`,
      ).bind(seeded.workspaceId, capability.id, forgedDigest, "9".repeat(64), OUTREACH_NOW, OUTREACH_NOW + 86_400_000, OUTREACH_NOW).run(),
      /invalid outreach verified sender address/,
    );
    assert.equal(await countRows(fixture.database, "outreach_sender_verified_addresses"), 2);
  } finally {
    await fixture.dispose();
  }
});

test("unsubscribe authority history is monotonic, recoverable before terminal state, and current at enqueue", async () => {
  const fixture = await createD1Fixture("outreach-unsubscribe-authority-history");
  try {
    const prepared = await prepareApprovedMessage(fixture);
    const repository = await loadRepository(fixture, prepared.seeded);
    const senderConnectionId = await insertSenderConnection(fixture, prepared.seeded, "active", 1);
    await repository.recordUnsubscribeAuthorityEvent({
      recipientAuthorityId: prepared.recipientAuthority.id,
      expectedRevision: 1,
      status: "failed",
      checkDigest: "f".repeat(64),
      observedAt: OUTREACH_NOW,
      validUntil: null,
      idempotencyKey: "outreach-unsubscribe-failed",
    });
    const outbox = await loadOutbox(fixture, prepared.seeded);
    assert.deepEqual(
      await outbox.enqueueApprovedMessage({ messageApprovalId: prepared.messageApproval.id, senderConnectionId }),
      { kind: "blocked", reason: "current_authority_unavailable", providerCalls: 0 },
    );
    assert.equal(await countRows(fixture.database, "outreach_outbox_items"), 0);
    await repository.recordUnsubscribeAuthorityEvent({
      recipientAuthorityId: prepared.recipientAuthority.id,
      expectedRevision: 2,
      status: "working",
      checkDigest: "1".repeat(64),
      observedAt: OUTREACH_NOW,
      validUntil: OUTREACH_NOW + 20_000,
      idempotencyKey: "outreach-unsubscribe-recovered",
    });
    assert.equal((await outbox.enqueueApprovedMessage({ messageApprovalId: prepared.messageApproval.id, senderConnectionId })).kind, "queued");
    await repository.recordUnsubscribeAuthorityEvent({
      recipientAuthorityId: prepared.recipientAuthority.id,
      expectedRevision: 3,
      status: "revoked",
      checkDigest: "2".repeat(64),
      observedAt: OUTREACH_NOW,
      validUntil: null,
      idempotencyKey: "outreach-unsubscribe-revoked",
    });
    await assert.rejects(
      repository.recordUnsubscribeAuthorityEvent({
        recipientAuthorityId: prepared.recipientAuthority.id,
        expectedRevision: 4,
        status: "working",
        checkDigest: "3".repeat(64),
        observedAt: OUTREACH_NOW,
        validUntil: OUTREACH_NOW + 20_000,
        idempotencyKey: "outreach-unsubscribe-illegal-recovery",
      }),
      /outreach_repository_conflict/,
    );
    await assert.rejects(
      repository.recordUnsubscribeAuthorityEvent({
        recipientAuthorityId: prepared.recipientAuthority.id,
        expectedRevision: 4,
        status: "redeemed",
        checkDigest: "4".repeat(64),
        observedAt: OUTREACH_NOW,
        validUntil: null,
        idempotencyKey: "outreach-unsubscribe-redeemed-without-suppression",
      }),
      /outreach_repository_conflict/,
    );
    const afterRevocation = await loadOutbox(fixture, prepared.seeded);
    assert.equal(
      (await afterRevocation.claimDispatchLease({ outboxItemId: (await fixture.database.prepare("SELECT id FROM outreach_outbox_items LIMIT 1").first()).id, holderId: "synthetic-worker-one" })).kind,
      "blocked",
    );
  } finally {
    await fixture.dispose();
  }
});

test("approval revocation is immutable, exactly replayable, and wins before lease", async () => {
  const fixture = await createD1Fixture("outreach-approval-revocation");
  try {
    const prepared = await prepareApprovedMessage(fixture);
    const senderConnectionId = await insertSenderConnection(fixture, prepared.seeded, "active", 1);
    const outbox = await loadOutbox(fixture, prepared.seeded);
    const queued = await outbox.enqueueApprovedMessage({ messageApprovalId: prepared.messageApproval.id, senderConnectionId });
    assert.equal(queued.kind, "queued");
    const repositoryModule = await fixture.vite.ssrLoadModule(new URL("../domain/outreach-repository.ts", import.meta.url).pathname);
    const input = {
      targetKind: "message_approval",
      targetApprovalId: prepared.messageApproval.id,
      reasonCode: "owner_revoked",
      sourceEventDigest: "4".repeat(64),
      idempotencyKey: "outreach-message-approval-revoked",
    };
    const [first, replay] = await Promise.all([
      repositoryModule.createD1OutreachRepository(fixture.database, {
        ...scope(prepared.seeded),
        now: () => OUTREACH_NOW + 1,
      }).revokeApproval(input),
      repositoryModule.createD1OutreachRepository(fixture.database, {
        ...scope(prepared.seeded),
        now: () => OUTREACH_NOW + 2,
      }).revokeApproval(input),
    ]);
    assert.equal(first.id, replay.id);
    assert.equal([first, replay].filter((result) => result.replayed).length, 1);
    assert.equal(await countRows(fixture.database, "outreach_approval_revocations"), 1);
    const laterRepository = repositoryModule.createD1OutreachRepository(fixture.database, {
      ...scope(prepared.seeded),
      now: () => OUTREACH_NOW + 500,
    });
    assert.deepEqual(await laterRepository.revokeApproval(input), { ...first, replayed: true });
    assert.equal(
      (await outbox.claimDispatchLease({ outboxItemId: queued.outboxItemId, holderId: "synthetic-worker-one" })).kind,
      "blocked",
    );
    await assert.rejects(
      fixture.database.prepare("DELETE FROM outreach_approval_revocations WHERE id=?").bind(first.id).run(),
      /immutable outreach approval revocation/,
    );
    const foreign = repositoryModule.createD1OutreachRepository(fixture.database, { ...scope(prepared.seeded), ownerSubject: "foreign-owner" });
    await assert.rejects(foreign.revokeApproval({ ...input, idempotencyKey: "foreign-revocation" }), /outreach_repository_conflict/);
  } finally {
    await fixture.dispose();
  }
});

test("partial or unexpected sender scope and revoked Package authority create no outbox item", async () => {
  const fixture = await createD1Fixture("outreach-authority-fail-closed");
  try {
    const prepared = await prepareApprovedMessage(fixture);
    const partialConnectionId = await insertRawSenderConnection(fixture, prepared.seeded, "active", 1);
    const repository = await loadRepository(fixture, prepared.seeded);
    const capabilityBase = {
      senderConnectionId: partialConnectionId,
      verifiedAddresses: [{ address: "owner@example.invalid", kind: "canonical", verificationDigest: "7".repeat(64) }],
      verifiedAt: OUTREACH_NOW,
      expiresAt: OUTREACH_NOW + 86_400_000,
      idempotencyKey: "outreach-invalid-sender-capability",
    };
    await assert.rejects(
      repository.recordSenderCapability({ ...capabilityBase, grantedScopes: ["https://www.googleapis.com/auth/gmail.send"] }),
      /outreach_repository_conflict/,
    );
    await assert.rejects(
      repository.recordSenderCapability({
        ...capabilityBase,
        grantedScopes: [
          "https://www.googleapis.com/auth/gmail.readonly",
          "https://www.googleapis.com/auth/gmail.send",
          "https://www.googleapis.com/auth/gmail.modify",
        ],
      }),
      /outreach_repository_conflict/,
    );
    const outbox = await loadOutbox(fixture, prepared.seeded);
    assert.deepEqual(
      await outbox.enqueueApprovedMessage({ messageApprovalId: prepared.messageApproval.id, senderConnectionId: partialConnectionId }),
      { kind: "blocked", reason: "current_authority_unavailable", providerCalls: 0 },
    );
    assert.equal(await countRows(fixture.database, "outreach_outbox_items"), 0);

    await repository.revokeApproval({
      targetKind: "package_approval",
      targetApprovalId: prepared.packageApproval.id,
      reasonCode: "owner_revoked",
      sourceEventDigest: "5".repeat(64),
      idempotencyKey: "outreach-package-approval-revoked",
    });
    assert.deepEqual(
      await outbox.enqueueApprovedMessage({
        messageApprovalId: prepared.messageApproval.id,
        senderConnectionId: await insertSenderConnection(fixture, prepared.seeded, "active", 2),
      }),
      { kind: "blocked", reason: "current_authority_unavailable", providerCalls: 0 },
    );
    assert.equal(await countRows(fixture.database, "outreach_message_approval_consumptions"), 0);
    assert.equal(await countRows(fixture.database, "outreach_outbox_events"), 0);
  } finally {
    await fixture.dispose();
  }
});

test("withdrawing the bound basis source blocks enqueue and lease", async () => {
  const fixture = await createD1Fixture("outreach-basis-source-withdrawal");
  try {
    const prepared = await prepareApprovedMessage(fixture);
    const senderConnectionId = await insertSenderConnection(fixture, prepared.seeded, "active", 1);
    const outbox = await loadOutbox(fixture, prepared.seeded);
    await fixture.database.prepare("UPDATE sources SET status='withdrawn' WHERE id='outreach-source'").run();
    assert.deepEqual(
      await outbox.enqueueApprovedMessage({ messageApprovalId: prepared.messageApproval.id, senderConnectionId }),
      { kind: "blocked", reason: "current_authority_unavailable", providerCalls: 0 },
    );
    assert.equal(await countRows(fixture.database, "outreach_outbox_items"), 0);
    await fixture.database.prepare("UPDATE sources SET status='available' WHERE id='outreach-source'").run();
    const queued = await outbox.enqueueApprovedMessage({ messageApprovalId: prepared.messageApproval.id, senderConnectionId });
    assert.equal(queued.kind, "queued");
    await fixture.database.prepare("UPDATE sources SET status='withdrawn' WHERE id='outreach-source'").run();
    assert.deepEqual(
      await outbox.claimDispatchLease({ outboxItemId: queued.outboxItemId, holderId: "synthetic-worker-one" }),
      {
        kind: "blocked",
        reason: "current_authority_unavailable",
        providerInvocationAuthorized: false,
        providerCalls: 0,
      },
    );
  } finally {
    await fixture.dispose();
  }
});

test("an exact sealed send-as alias can enqueue without becoming a provider call", async () => {
  const fixture = await createD1Fixture("outreach-verified-sender-alias");
  try {
    const seeded = await seedOutreachAuthority(fixture);
    const repository = await loadRepository(fixture, seeded);
    const packageVersion = await repository.createPackageVersion(packageInput(seeded));
    const packageApproval = await repository.approvePackageVersion({
      packageVersionId: packageVersion.id,
      expectedVersion: 1,
      expiresAt: OUTREACH_NOW + 20_000,
      idempotencyKey: "alias-package-approval",
    });
    const baseMessage = messageInput(packageVersion, seeded);
    const message = await repository.createMessageVersion({
      ...baseMessage,
      snapshot: { ...baseMessage.snapshot, from: "alias@example.invalid" },
      idempotencyKey: "alias-message-version",
    });
    const recipientAuthority = await recordRecipientAuthority(repository, message, packageApproval, seeded);
    const messageApproval = await repository.approveMessageVersion({
      messageVersionId: message.id,
      packageApprovalId: packageApproval.id,
      expectedVersion: 1,
      acknowledgementDigest: recipientAuthority.digest,
      expiresAt: OUTREACH_NOW + 10_000,
      idempotencyKey: "alias-message-approval",
    });
    const senderConnectionId = await insertSenderConnection(
      fixture,
      seeded,
      "active",
      1,
      undefined,
      [
        { address: "owner@example.invalid", kind: "canonical", verificationDigest: "7".repeat(64) },
        { address: "alias@example.invalid", kind: "alias", verificationDigest: "8".repeat(64) },
      ],
    );
    const outbox = await loadOutbox(fixture, seeded);
    const queued = await outbox.enqueueApprovedMessage({ messageApprovalId: messageApproval.id, senderConnectionId });
    assert.equal(queued.kind, "queued");
    assert.equal(queued.providerCalls, 0);
  } finally {
    await fixture.dispose();
  }
});

test("dispatch leases are exclusive, monotonic, replayable, and grant no provider authority", async () => {
  const fixture = await createD1Fixture("outreach-outbox-lease");
  try {
    const prepared = await prepareApprovedMessage(fixture, {
      packageExpiresAt: OUTREACH_NOW + 70_000,
      messageExpiresAt: OUTREACH_NOW + 60_000,
    });
    const outbox = await loadOutbox(fixture, prepared.seeded);
    const senderConnectionId = await insertSenderConnection(fixture, prepared.seeded, "active", 1);
    const queued = await outbox.enqueueApprovedMessage({
      messageApprovalId: prepared.messageApproval.id,
      senderConnectionId,
    });
    assert.equal(queued.kind, "queued");

    const outboxModule = await fixture.vite.ssrLoadModule(new URL("../domain/outbox.ts", import.meta.url).pathname);
    const claimingOutbox = outboxModule.createD1OutboxRepository(fixture.database, {
      ...scope(prepared.seeded),
      now: () => OUTREACH_NOW + 1_000,
    });
    const first = await claimingOutbox.claimDispatchLease({
      outboxItemId: queued.outboxItemId,
      holderId: "synthetic-worker-one",
    });
    assert.deepEqual(first, {
      kind: "claimed",
      outboxItemId: queued.outboxItemId,
      holderId: "synthetic-worker-one",
      leaseGeneration: 1,
      expiresAt: OUTREACH_NOW + 16_000,
      replayed: false,
      providerInvocationAuthorized: false,
      providerCalls: 0,
    });
    assert.deepEqual(
      await claimingOutbox.claimDispatchLease({
        outboxItemId: queued.outboxItemId,
        holderId: "synthetic-worker-one",
      }),
      { ...first, replayed: true },
    );
    await fixture.database.prepare("UPDATE sources SET status='withdrawn' WHERE id='outreach-source'").run();
    assert.deepEqual(
      await claimingOutbox.claimDispatchLease({ outboxItemId: queued.outboxItemId, holderId: "synthetic-worker-one" }),
      {
        kind: "blocked",
        reason: "current_authority_unavailable",
        providerInvocationAuthorized: false,
        providerCalls: 0,
      },
    );
    await fixture.database.prepare("UPDATE sources SET status='available' WHERE id='outreach-source'").run();
    assert.deepEqual(
      await claimingOutbox.claimDispatchLease({
        outboxItemId: queued.outboxItemId,
        holderId: "synthetic-worker-two",
      }),
      {
        kind: "blocked",
        reason: "lease_unavailable",
        providerInvocationAuthorized: false,
        providerCalls: 0,
      },
    );
    assert.equal(await countRows(fixture.database, "outreach_outbox_events"), 2);

    await assert.rejects(
      fixture.database.prepare(
        "INSERT INTO outreach_outbox_events (id,workspace_id,outbox_item_id,revision,state,lease_generation,lease_holder_id,lease_expires_at,reason_code,event_digest,created_at) VALUES ('backdated-lease',?,?,3,'leased',2,'synthetic-worker-two',?,'backdated',?,?)",
      ).bind(
        prepared.seeded.workspaceId,
        queued.outboxItemId,
        OUTREACH_NOW + 30_000,
        "8".repeat(64),
        OUTREACH_NOW,
      ).run(),
      /invalid outreach outbox event/,
    );
    const afterExpiry = outboxModule.createD1OutboxRepository(fixture.database, {
      ...scope(prepared.seeded),
      now: () => OUTREACH_NOW + 16_000,
    });
    const second = await afterExpiry.claimDispatchLease({
      outboxItemId: queued.outboxItemId,
      holderId: "synthetic-worker-two",
    });
    assert.deepEqual(second, {
      kind: "claimed",
      outboxItemId: queued.outboxItemId,
      holderId: "synthetic-worker-two",
      leaseGeneration: 2,
      expiresAt: OUTREACH_NOW + 31_000,
      replayed: false,
      providerInvocationAuthorized: false,
      providerCalls: 0,
    });
    assert.equal(await countRows(fixture.database, "outreach_outbox_events"), 3);
    assert.equal((await afterExpiry.recordPreCallRecheckReceipt({
      outboxItemId: queued.outboxItemId,
      holderId: "synthetic-worker-one",
      leaseGeneration: first.leaseGeneration,
    })).kind, "blocked", "the recovered generation permanently fences the old holder");
    const currentReceipt = await afterExpiry.recordPreCallRecheckReceipt({
      outboxItemId: queued.outboxItemId,
      holderId: "synthetic-worker-two",
      leaseGeneration: second.leaseGeneration,
    });
    assert.equal(currentReceipt.kind, "recorded");
    assert.equal(currentReceipt.providerInvocationAuthorized, false);
    assert.equal(await countRows(fixture.database, "outreach_pre_call_recheck_receipts"), 1);
    await assert.rejects(
      fixture.database.prepare(
        "INSERT INTO outreach_outbox_events (id,workspace_id,outbox_item_id,revision,state,lease_generation,lease_holder_id,lease_expires_at,reason_code,event_digest,created_at) VALUES ('stale-worker-dispatch',?,?,4,'dispatching',1,'synthetic-worker-one',?,'stale_holder',?,?)",
      ).bind(
        prepared.seeded.workspaceId,
        queued.outboxItemId,
        first.expiresAt,
        "7".repeat(64),
        OUTREACH_NOW + 16_001,
      ).run(),
      /invalid outreach outbox event/,
    );
    const repository = await loadRepository(fixture, prepared.seeded);
    await repository.recordSuppression({
      ...suppressionInput(),
      subjectDigest: prepared.seeded.contactPointDigest,
      aliasDigests: [],
      idempotencyKey: "outreach-active-lease-suppression",
    });
    assert.deepEqual(
      await afterExpiry.claimDispatchLease({ outboxItemId: queued.outboxItemId, holderId: "synthetic-worker-two" }),
      {
        kind: "blocked",
        reason: "current_authority_unavailable",
        providerInvocationAuthorized: false,
        providerCalls: 0,
      },
    );
    assert.equal((await afterExpiry.recordPreCallRecheckReceipt({
      outboxItemId: queued.outboxItemId,
      holderId: "synthetic-worker-two",
      leaseGeneration: second.leaseGeneration,
    })).kind, "blocked", "a historical receipt replay cannot launder later suppression");
    assert.equal(await countRows(fixture.database, "outreach_outbox_events"), 3);
  } finally {
    await fixture.dispose();
  }
});

test("simultaneous lease claimers produce one winner and one immutable event", async () => {
  const fixture = await createD1Fixture("outreach-outbox-lease-race");
  try {
    const prepared = await prepareApprovedMessage(fixture, {
      packageExpiresAt: OUTREACH_NOW + 70_000,
      messageExpiresAt: OUTREACH_NOW + 60_000,
    });
    const enqueue = await loadOutbox(fixture, prepared.seeded);
    const senderConnectionId = await insertSenderConnection(fixture, prepared.seeded, "active", 1);
    const queued = await enqueue.enqueueApprovedMessage({
      messageApprovalId: prepared.messageApproval.id,
      senderConnectionId,
    });
    assert.equal(queued.kind, "queued");
    const outboxModule = await fixture.vite.ssrLoadModule(new URL("../domain/outbox.ts", import.meta.url).pathname);
    const claimant = outboxModule.createD1OutboxRepository(fixture.database, {
      ...scope(prepared.seeded),
      now: () => OUTREACH_NOW + 1_000,
    });
    const results = await Promise.all([
      claimant.claimDispatchLease({ outboxItemId: queued.outboxItemId, holderId: "synthetic-worker-one" }),
      claimant.claimDispatchLease({ outboxItemId: queued.outboxItemId, holderId: "synthetic-worker-two" }),
    ]);
    assert.equal(results.filter((result) => result.kind === "claimed").length, 1);
    assert.equal(results.filter((result) => result.kind === "blocked" && result.reason === "lease_unavailable").length, 1);
    assert.equal(results.every((result) => result.providerInvocationAuthorized === false && result.providerCalls === 0), true);
    assert.equal(await countRows(fixture.database, "outreach_outbox_events"), 2);
  } finally {
    await fixture.dispose();
  }
});

test("exact current lease records one immutable inert pre-call receipt", async () => {
  const fixture = await createD1Fixture("outreach-pre-call-receipt");
  try {
    const prepared = await prepareApprovedMessage(fixture, {
      packageExpiresAt: OUTREACH_NOW + 70_000,
      messageExpiresAt: OUTREACH_NOW + 60_000,
    });
    const senderConnectionId = await insertSenderConnection(fixture, prepared.seeded, "active", 1);
    const enqueue = await loadOutbox(fixture, prepared.seeded);
    const queued = await enqueue.enqueueApprovedMessage({
      messageApprovalId: prepared.messageApproval.id,
      senderConnectionId,
    });
    assert.equal(queued.kind, "queued");
    const outboxModule = await fixture.vite.ssrLoadModule(new URL("../domain/outbox.ts", import.meta.url).pathname);
    const boundary = outboxModule.createD1OutboxRepository(fixture.database, {
      ...scope(prepared.seeded),
      now: () => OUTREACH_NOW + 1_000,
    });
    const lease = await boundary.claimDispatchLease({
      outboxItemId: queued.outboxItemId,
      holderId: "synthetic-worker-one",
    });
    assert.equal(lease.kind, "claimed");
    const input = {
      outboxItemId: queued.outboxItemId,
      holderId: "synthetic-worker-one",
      leaseGeneration: lease.leaseGeneration,
    };
    const laterBoundary = outboxModule.createD1OutboxRepository(fixture.database, {
      ...scope(prepared.seeded),
      now: () => OUTREACH_NOW + 1_001,
    });
    const contenders = await Promise.all([
      boundary.recordPreCallRecheckReceipt(input),
      laterBoundary.recordPreCallRecheckReceipt(input),
    ]);
    assert.equal(contenders.every((result) => result.kind === "recorded"), true, JSON.stringify(contenders));
    assert.equal(contenders.every((result) => result.providerInvocationAuthorized === false && result.providerCalls === 0), true);
    assert.equal(contenders.filter((result) => result.replayed === false).length, 1);
    assert.equal(contenders.filter((result) => result.replayed === true).length, 1);
    const first = contenders.find((result) => result.kind === "recorded");
    const replay = await boundary.recordPreCallRecheckReceipt(input);
    assert.equal(replay.kind, "recorded", JSON.stringify(replay));
    assert.equal(first.receiptId, replay.receiptId);
    assert.equal(first.receiptDigest, replay.receiptDigest);
    assert.equal(replay.replayed, true);
    assert.equal(await countRows(fixture.database, "outreach_pre_call_recheck_receipts"), 1);
    assert.equal(await countRows(fixture.database, "outreach_outbox_events"), 2, "receipt must not advance dispatch state");
    const wrongOwner = outboxModule.createD1OutboxRepository(fixture.database, {
      workspaceId: prepared.seeded.workspaceId,
      ownerSubject: "different-owner",
      now: () => OUTREACH_NOW + 1_002,
    });
    assert.equal((await wrongOwner.recordPreCallRecheckReceipt(input)).kind, "blocked");
    assert.equal(
      (await fixture.database.prepare(
        "SELECT provider_invocation_authorized FROM outreach_pre_call_recheck_receipts LIMIT 1",
      ).first()).provider_invocation_authorized,
      0,
    );
    await assert.rejects(
      fixture.database.prepare(
        "INSERT INTO outreach_outbox_events (id,workspace_id,outbox_item_id,revision,state,lease_generation,lease_holder_id,lease_expires_at,reason_code,event_digest,created_at) VALUES ('receipt-bypass-dispatching',?,?,3,'dispatching',1,'synthetic-worker-one',?,'bypass',?,?)",
      ).bind(prepared.seeded.workspaceId, queued.outboxItemId, lease.expiresAt, "9".repeat(64), OUTREACH_NOW + 1_001).run(),
      /invalid outreach outbox event/,
    );
    await assert.rejects(
      fixture.database.prepare("UPDATE outreach_pre_call_recheck_receipts SET provider_invocation_authorized=1 WHERE id=?").bind(first.receiptId).run(),
      /immutable outreach pre-call receipt/,
    );
    await assert.rejects(
      fixture.database.prepare("DELETE FROM outreach_pre_call_recheck_receipts WHERE id=?").bind(first.receiptId).run(),
      /immutable outreach pre-call receipt/,
    );
  } finally {
    await fixture.dispose();
  }
});

test("current receipt prepares one immutable zero-effect attempt without advancing the outbox", async () => {
  const fixture = await createD1Fixture("outreach-attempt-preparation");
  try {
    const context = await prepareLeasedOutbox(fixture);
    const receipt = await context.boundary.recordPreCallRecheckReceipt(context.input);
    assert.equal(receipt.kind, "recorded");
    const input = { ...context.input, preCallReceiptId: receipt.receiptId };
    const outboxModule = await fixture.vite.ssrLoadModule(new URL("../domain/outbox.ts", import.meta.url).pathname);
    const rollbackBoundary = outboxModule.createD1OutboxRepository(fixture.database, {
      ...scope(context.prepared.seeded),
      now: () => OUTREACH_NOW + 999,
    });
    assert.equal((await rollbackBoundary.prepareDispatchAttempt(input)).kind, "blocked");
    assert.equal(await countRows(fixture.database, "outreach_dispatch_attempt_preparations"), 0);
    const laterBoundary = outboxModule.createD1OutboxRepository(fixture.database, {
      ...scope(context.prepared.seeded),
      now: () => OUTREACH_NOW + 1_001,
    });
    const contenders = await Promise.all([
      context.boundary.prepareDispatchAttempt(input),
      context.boundary.prepareDispatchAttempt(input),
    ]);
    assert.equal(contenders.every((result) => result.kind === "prepared_no_invocation"), true, JSON.stringify(contenders));
    assert.equal(contenders.every((result) => result.providerInvocationAuthorized === false && result.providerCalls === 0), true);
    assert.equal(contenders.filter((result) => result.replayed === false).length, 1);
    assert.equal(contenders.filter((result) => result.replayed === true).length, 1);
    assert.equal(contenders.every(Object.isFrozen), true);
    assert.equal(contenders[0].preparationId, contenders[1].preparationId);
    assert.equal(contenders[0].preparationDigest, contenders[1].preparationDigest);
    assert.equal(await countRows(fixture.database, "outreach_dispatch_attempt_preparations"), 1);
    assert.equal(await countRows(fixture.database, "outreach_outbox_events"), 2);
    const latest = await fixture.database.prepare(
      "SELECT state,revision FROM outreach_outbox_events WHERE outbox_item_id=? ORDER BY revision DESC LIMIT 1",
    ).bind(input.outboxItemId).first();
    assert.deepEqual(latest, { state: "leased", revision: 2 });
    const persisted = await fixture.database.prepare(
      `SELECT provider_invocation_authorized,provider_calls
       FROM outreach_dispatch_attempt_preparations`,
    ).first();
    assert.deepEqual(persisted, {
      provider_invocation_authorized: 0,
      provider_calls: 0,
    });
    const replay = await laterBoundary.prepareDispatchAttempt(input);
    assert.equal(replay.kind, "prepared_no_invocation");
    assert.equal(replay.replayed, true);
    const wrongOwner = outboxModule.createD1OutboxRepository(fixture.database, {
      workspaceId: context.prepared.seeded.workspaceId,
      ownerSubject: "different-owner",
      now: () => OUTREACH_NOW + 1_001,
    });
    for (const denied of [
      { ...input, holderId: "different-holder" },
      { ...input, leaseGeneration: input.leaseGeneration + 1 },
      { ...input, preCallReceiptId: "different-receipt" },
      { ...input, extra: "forbidden" },
    ]) assert.equal((await context.boundary.prepareDispatchAttempt(denied)).kind, "blocked");
    assert.equal((await wrongOwner.prepareDispatchAttempt(input)).kind, "blocked");
    let getterCalls = 0;
    const hostile = {};
    Object.defineProperty(hostile, "outboxItemId", { enumerable: true, get() { getterCalls += 1; return input.outboxItemId; } });
    Object.defineProperty(hostile, "preCallReceiptId", { enumerable: true, value: input.preCallReceiptId });
    Object.defineProperty(hostile, "holderId", { enumerable: true, value: input.holderId });
    Object.defineProperty(hostile, "leaseGeneration", { enumerable: true, value: input.leaseGeneration });
    assert.equal((await context.boundary.prepareDispatchAttempt(hostile)).reason, "invalid_request");
    assert.equal(getterCalls, 0);
    const expired = outboxModule.createD1OutboxRepository(fixture.database, {
      ...scope(context.prepared.seeded),
      now: () => receipt.validUntil,
    });
    assert.equal((await expired.prepareDispatchAttempt(input)).kind, "blocked");
    await assert.rejects(
      fixture.database.prepare("UPDATE outreach_dispatch_attempt_preparations SET provider_calls=1 WHERE id=?").bind(replay.preparationId).run(),
      /immutable outreach dispatch attempt preparation/,
    );
    await assert.rejects(
      fixture.database.prepare("DELETE FROM outreach_dispatch_attempt_preparations WHERE id=?").bind(replay.preparationId).run(),
      /immutable outreach dispatch attempt preparation/,
    );
    const preparation = await fixture.database.prepare("SELECT * FROM outreach_dispatch_attempt_preparations WHERE id=?").bind(replay.preparationId).first();
    await assert.rejects(
      fixture.database.prepare(
        "INSERT INTO outreach_outbox_events (id,workspace_id,outbox_item_id,revision,state,lease_generation,lease_holder_id,lease_expires_at,reason_code,event_digest,created_at) VALUES ('attempt-bypass-dispatching',?,?,3,'dispatching',1,'synthetic-worker-one',?,'bypass',?,?)",
      ).bind(context.prepared.seeded.workspaceId, input.outboxItemId, preparation.lease_expires_at, "e".repeat(64), OUTREACH_NOW + 1_001).run(),
      /invalid outreach outbox event/,
    );
    const recoveredBoundary = outboxModule.createD1OutboxRepository(fixture.database, {
      ...scope(context.prepared.seeded),
      now: () => preparation.lease_expires_at + 1,
    });
    const recoveredLease = await recoveredBoundary.claimDispatchLease({
      outboxItemId: input.outboxItemId,
      holderId: "synthetic-worker-two",
    });
    assert.deepEqual(recoveredLease, {
      kind: "blocked",
      reason: "lease_unavailable",
      providerInvocationAuthorized: false,
      providerCalls: 0,
    });
    assert.equal(await countRows(fixture.database, "outreach_dispatch_attempt_preparations"), 1);
    assert.equal(await countRows(fixture.database, "outreach_outbox_events"), 2);
  } finally {
    await fixture.dispose();
  }
});

test("expired inert attempts recover through two canonical zero-effect void and reprepare cycles", async () => {
  const fixture = await createD1Fixture("outreach-attempt-recovery-cycles");
  try {
    const context = await prepareInertDispatchAttempt(fixture);
    const outboxModule = await fixture.vite.ssrLoadModule(new URL("../domain/outbox.ts", import.meta.url).pathname);
    const voidInput = {
      outboxItemId: context.input.outboxItemId,
      preparationId: context.preparation.preparationId,
      expectedLeaseGeneration: context.input.leaseGeneration,
    };
    const beforeExpiry = outboxModule.createD1OutboxRepository(fixture.database, {
      ...scope(context.prepared.seeded),
      now: () => context.receipt.validUntil - 1,
    });
    assert.deepEqual(await beforeExpiry.voidExpiredDispatchPreparation(voidInput), {
      kind: "blocked",
      reason: "lease_unavailable",
      providerInvocationAuthorized: false,
      providerCalls: 0,
    });
    const atFirstExpiry = outboxModule.createD1OutboxRepository(fixture.database, {
      ...scope(context.prepared.seeded),
      now: () => context.receipt.validUntil,
    });
    const firstVoidContenders = await Promise.all([
      atFirstExpiry.voidExpiredDispatchPreparation(voidInput),
      atFirstExpiry.voidExpiredDispatchPreparation(voidInput),
    ]);
    assert.equal(firstVoidContenders.every((result) => result.kind === "voided_before_invocation"), true);
    assert.equal(firstVoidContenders.filter((result) => result.replayed === false).length, 1);
    assert.equal(firstVoidContenders.filter((result) => result.replayed === true).length, 1);
    assert.equal(firstVoidContenders[0].eventId, firstVoidContenders[1].eventId);
    const firstVoid = firstVoidContenders[0];
    const rolledBack = outboxModule.createD1OutboxRepository(fixture.database, {
      ...scope(context.prepared.seeded),
      now: () => context.receipt.validUntil - 1,
    });
    assert.equal((await rolledBack.voidExpiredDispatchPreparation(voidInput)).reason, "current_authority_unavailable");
    assert.equal((await rolledBack.claimDispatchLease({
      outboxItemId: context.input.outboxItemId,
      holderId: "synthetic-worker-two",
    })).kind, "blocked");
    const leaseContenders = await Promise.all([
      atFirstExpiry.claimDispatchLease({ outboxItemId: context.input.outboxItemId, holderId: "synthetic-worker-two" }),
      atFirstExpiry.claimDispatchLease({ outboxItemId: context.input.outboxItemId, holderId: "synthetic-worker-three" }),
    ]);
    const claimed = leaseContenders.filter((result) => result.kind === "claimed");
    assert.equal(claimed.length, 1, JSON.stringify(leaseContenders));
    assert.equal(claimed[0].leaseGeneration, 2);
    const secondLease = claimed[0];
    const secondReceipt = await atFirstExpiry.recordPreCallRecheckReceipt({
      outboxItemId: context.input.outboxItemId,
      holderId: secondLease.holderId,
      leaseGeneration: secondLease.leaseGeneration,
    });
    assert.equal(secondReceipt.kind, "recorded");
    const secondPreparationInput = {
      outboxItemId: context.input.outboxItemId,
      preparationId: context.preparation.preparationId,
      priorVoidEventId: firstVoid.eventId,
      preCallReceiptId: secondReceipt.receiptId,
      holderId: secondLease.holderId,
      leaseGeneration: secondLease.leaseGeneration,
    };
    const reprepareContenders = await Promise.all([
      atFirstExpiry.reprepareDispatchAttempt(secondPreparationInput),
      atFirstExpiry.reprepareDispatchAttempt(secondPreparationInput),
    ]);
    assert.equal(reprepareContenders.every((result) => result.kind === "reprepared_no_invocation"), true, JSON.stringify(reprepareContenders));
    assert.equal(reprepareContenders.filter((result) => result.replayed === false).length, 1);
    assert.equal(reprepareContenders.filter((result) => result.replayed === true).length, 1);
    const secondPreparation = reprepareContenders[0];
    assert.deepEqual(await atFirstExpiry.claimDispatchLease({
      outboxItemId: context.input.outboxItemId,
      holderId: secondLease.holderId,
    }), {
      kind: "blocked",
      reason: "lease_unavailable",
      providerInvocationAuthorized: false,
      providerCalls: 0,
    });

    const atSecondExpiry = outboxModule.createD1OutboxRepository(fixture.database, {
      ...scope(context.prepared.seeded),
      now: () => secondLease.expiresAt,
    });
    const secondVoid = await atSecondExpiry.voidExpiredDispatchPreparation({
      ...voidInput,
      expectedLeaseGeneration: secondLease.leaseGeneration,
    });
    assert.equal(secondVoid.kind, "voided_before_invocation");
    const thirdLease = await atSecondExpiry.claimDispatchLease({
      outboxItemId: context.input.outboxItemId,
      holderId: "synthetic-worker-four",
    });
    assert.equal(thirdLease.kind, "claimed");
    assert.equal(thirdLease.leaseGeneration, 3);
    const thirdReceipt = await atSecondExpiry.recordPreCallRecheckReceipt({
      outboxItemId: context.input.outboxItemId,
      holderId: thirdLease.holderId,
      leaseGeneration: thirdLease.leaseGeneration,
    });
    assert.equal(thirdReceipt.kind, "recorded");
    const thirdPreparation = await atSecondExpiry.reprepareDispatchAttempt({
      outboxItemId: context.input.outboxItemId,
      preparationId: context.preparation.preparationId,
      priorVoidEventId: secondVoid.eventId,
      preCallReceiptId: thirdReceipt.receiptId,
      holderId: thirdLease.holderId,
      leaseGeneration: thirdLease.leaseGeneration,
    });
    assert.equal(thirdPreparation.kind, "reprepared_no_invocation");
    assert.equal(await countRows(fixture.database, "outreach_dispatch_attempt_preparations"), 1);
    const lifecycle = (await fixture.database.prepare(
      `SELECT id,revision,event_kind,prior_event_id,prior_digest,event_digest,lease_generation,
              provider_invocation_authorized,provider_calls
       FROM outreach_dispatch_attempt_preparation_events ORDER BY revision`,
    ).all()).results;
    assert.deepEqual(lifecycle.map((event) => event.revision), [1, 2, 3, 4]);
    assert.deepEqual(lifecycle.map((event) => event.event_kind), [
      "voided_before_invocation", "reprepared_no_invocation", "voided_before_invocation", "reprepared_no_invocation",
    ]);
    assert.deepEqual(lifecycle.map((event) => event.lease_generation), [1, 2, 2, 3]);
    assert.equal(lifecycle.every((event) => event.provider_invocation_authorized === 0 && event.provider_calls === 0), true);
    assert.equal(lifecycle[0].prior_event_id, null);
    assert.equal(lifecycle[0].prior_digest, context.preparation.preparationDigest);
    for (let index = 1; index < lifecycle.length; index += 1) {
      assert.equal(lifecycle[index].prior_event_id, lifecycle[index - 1].id);
      assert.equal(lifecycle[index].prior_digest, lifecycle[index - 1].event_digest);
    }
    const outboxStates = (await fixture.database.prepare(
      "SELECT state FROM outreach_outbox_events WHERE outbox_item_id=? ORDER BY revision",
    ).bind(context.input.outboxItemId).all()).results.map((event) => event.state);
    assert.deepEqual(outboxStates, ["pending", "leased", "leased", "leased"]);
    for (const result of [firstVoid, secondPreparation, secondVoid, thirdPreparation]) {
      assert.equal(result.providerInvocationAuthorized, false);
      assert.equal(result.providerCalls, 0);
      assert.equal(Object.isFrozen(result), true);
    }
  } finally {
    await fixture.dispose();
  }
});

test("forged recovery digests and stale terminal events cannot reopen an inert attempt", async () => {
  const fixture = await createD1Fixture("outreach-attempt-recovery-forgery");
  try {
    const context = await prepareInertDispatchAttempt(fixture);
    const preparation = await fixture.database.prepare(
      "SELECT * FROM outreach_dispatch_attempt_preparations WHERE id=?",
    ).bind(context.preparation.preparationId).first();
    const forgedDigest = "f".repeat(64);
    await fixture.database.prepare(
      `INSERT INTO outreach_dispatch_attempt_preparation_events
        (id,workspace_id,preparation_id,revision,event_kind,prior_event_id,prior_digest,
         pre_call_receipt_id,lease_event_id,lease_generation,lease_holder_id,lease_expires_at,
         reason_code,event_digest,provider_invocation_authorized,provider_calls,effective_at,created_at)
       VALUES ('forged-recovery-event',?,?,1,'voided_before_invocation',NULL,?,?,?,?,?,?,
               'lease_expired_no_invocation',?,0,0,?,?)`,
    ).bind(
      context.prepared.seeded.workspaceId,
      preparation.id,
      preparation.preparation_digest,
      preparation.pre_call_receipt_id,
      preparation.lease_event_id,
      preparation.lease_generation,
      preparation.lease_holder_id,
      preparation.lease_expires_at,
      forgedDigest,
      preparation.lease_expires_at,
      preparation.lease_expires_at,
    ).run();
    const outboxModule = await fixture.vite.ssrLoadModule(new URL("../domain/outbox.ts", import.meta.url).pathname);
    const expired = outboxModule.createD1OutboxRepository(fixture.database, {
      ...scope(context.prepared.seeded),
      now: () => preparation.lease_expires_at,
    });
    assert.deepEqual(await expired.claimDispatchLease({
      outboxItemId: context.input.outboxItemId,
      holderId: "synthetic-worker-two",
    }), {
      kind: "blocked",
      reason: "lease_unavailable",
      providerInvocationAuthorized: false,
      providerCalls: 0,
    });
    assert.deepEqual(await expired.voidExpiredDispatchPreparation({
      outboxItemId: context.input.outboxItemId,
      preparationId: preparation.id,
      expectedLeaseGeneration: preparation.lease_generation,
    }), {
      kind: "blocked",
      reason: "attempt_unavailable",
      providerInvocationAuthorized: false,
      providerCalls: 0,
    });
    await assert.rejects(
      fixture.database.prepare(
        `INSERT INTO outreach_outbox_events
          (id,workspace_id,outbox_item_id,revision,state,lease_generation,lease_holder_id,lease_expires_at,reason_code,event_digest,created_at)
         VALUES ('stale-terminal-after-void',?,?,3,'failed_before_dispatch',?,?,?,'stale_terminal',?,?)`,
      ).bind(
        context.prepared.seeded.workspaceId,
        context.input.outboxItemId,
        preparation.lease_generation,
        preparation.lease_holder_id,
        preparation.lease_expires_at,
        "e".repeat(64),
        preparation.lease_expires_at - 1,
      ).run(),
      /voided outreach dispatch preparation blocks stale terminal event/,
    );
    await assert.rejects(
      fixture.database.prepare("UPDATE outreach_dispatch_attempt_preparation_events SET provider_calls=1 WHERE id='forged-recovery-event'").run(),
      /immutable outreach dispatch attempt preparation event/,
    );
    await assert.rejects(
      fixture.database.prepare("DELETE FROM outreach_dispatch_attempt_preparation_events WHERE id='forged-recovery-event'").run(),
      /immutable outreach dispatch attempt preparation event/,
    );
    assert.equal(await countRows(fixture.database, "outreach_dispatch_attempt_preparation_events"), 1);
    assert.equal(await countRows(fixture.database, "outreach_outbox_events"), 2);
  } finally {
    await fixture.dispose();
  }
});

test("recovery rejects stale workers, hostile input, invalid lifecycle writes, and changed authority", async () => {
  const fixture = await createD1Fixture("outreach-attempt-recovery-denials");
  try {
    const context = await prepareInertDispatchAttempt(fixture);
    const outboxModule = await fixture.vite.ssrLoadModule(new URL("../domain/outbox.ts", import.meta.url).pathname);
    const expired = outboxModule.createD1OutboxRepository(fixture.database, {
      ...scope(context.prepared.seeded),
      now: () => context.receipt.validUntil,
    });
    const voided = await expired.voidExpiredDispatchPreparation({
      outboxItemId: context.input.outboxItemId,
      preparationId: context.preparation.preparationId,
      expectedLeaseGeneration: context.input.leaseGeneration,
    });
    assert.equal(voided.kind, "voided_before_invocation");
    const lease = await expired.claimDispatchLease({
      outboxItemId: context.input.outboxItemId,
      holderId: "synthetic-recovery-worker",
    });
    assert.equal(lease.kind, "claimed");
    const receipt = await expired.recordPreCallRecheckReceipt({
      outboxItemId: context.input.outboxItemId,
      holderId: lease.holderId,
      leaseGeneration: lease.leaseGeneration,
    });
    assert.equal(receipt.kind, "recorded");
    const valid = {
      outboxItemId: context.input.outboxItemId,
      preparationId: context.preparation.preparationId,
      priorVoidEventId: voided.eventId,
      preCallReceiptId: receipt.receiptId,
      holderId: lease.holderId,
      leaseGeneration: lease.leaseGeneration,
    };
    for (const denied of [
      { ...valid, preparationId: "different-preparation" },
      { ...valid, priorVoidEventId: "different-void" },
      { ...valid, preCallReceiptId: context.receipt.receiptId },
      { ...valid, holderId: "stale-worker" },
      { ...valid, leaseGeneration: context.input.leaseGeneration },
      { ...valid, extra: "forbidden" },
    ]) {
      const result = await expired.reprepareDispatchAttempt(denied);
      assert.equal(result.kind, "blocked");
      assert.equal(result.providerInvocationAuthorized, false);
      assert.equal(result.providerCalls, 0);
    }
    let getterCalls = 0;
    const hostile = {};
    Object.defineProperty(hostile, "outboxItemId", { enumerable: true, get() { getterCalls += 1; return valid.outboxItemId; } });
    for (const [key, value] of Object.entries(valid).filter(([key]) => key !== "outboxItemId")) {
      Object.defineProperty(hostile, key, { enumerable: true, value });
    }
    assert.deepEqual(await expired.reprepareDispatchAttempt(hostile), {
      kind: "blocked",
      reason: "invalid_request",
      providerInvocationAuthorized: false,
      providerCalls: 0,
    });
    assert.equal(getterCalls, 0);
    const wrongOwner = outboxModule.createD1OutboxRepository(fixture.database, {
      workspaceId: context.prepared.seeded.workspaceId,
      ownerSubject: "different-owner",
      now: () => context.receipt.validUntil,
    });
    assert.equal((await wrongOwner.reprepareDispatchAttempt(valid)).kind, "blocked");
    await assert.rejects(
      fixture.database.prepare(
        `INSERT INTO outreach_dispatch_attempt_preparation_events
          (id,workspace_id,preparation_id,revision,event_kind,prior_event_id,prior_digest,
           pre_call_receipt_id,lease_event_id,lease_generation,lease_holder_id,lease_expires_at,
           reason_code,event_digest,provider_invocation_authorized,provider_calls,effective_at,created_at)
         VALUES ('invalid-provider-reprepare',?,?,2,'reprepared_no_invocation',?,?,?,?,?,?,?,
                 'fresh_receipt_reprepared_no_invocation',?,1,0,?,?)`,
      ).bind(
        context.prepared.seeded.workspaceId,
        context.preparation.preparationId,
        voided.eventId,
        voided.eventDigest,
        receipt.receiptId,
        (await fixture.database.prepare("SELECT lease_event_id FROM outreach_pre_call_recheck_receipts WHERE id=?").bind(receipt.receiptId).first()).lease_event_id,
        lease.leaseGeneration,
        lease.holderId,
        lease.expiresAt,
        "c".repeat(64),
        context.receipt.validUntil,
        context.receipt.validUntil,
      ).run(),
      /CHECK constraint failed|invalid outreach dispatch repreparation/,
    );
    assert.equal(await countRows(fixture.database, "outreach_dispatch_attempt_preparation_events"), 1);
    await fixture.database.prepare("UPDATE sources SET status='withdrawn' WHERE id='outreach-source'").run();
    const changedAuthority = await expired.reprepareDispatchAttempt(valid);
    assert.equal(changedAuthority.kind, "blocked");
    assert.equal(changedAuthority.providerInvocationAuthorized, false);
    assert.equal(changedAuthority.providerCalls, 0);
    assert.equal(await countRows(fixture.database, "outreach_dispatch_attempt_preparation_events"), 1);
    assert.equal(await countRows(fixture.database, "outreach_outbox_events"), 3);
  } finally {
    await fixture.dispose();
  }
});

test("attempt preparation rechecks authority changed after the receipt and leaves no partial attempt", async () => {
  const cases = [
    ["source-withdrawn", async ({ fixture }) => fixture.database.prepare("UPDATE sources SET status='withdrawn' WHERE id='outreach-source'").run()],
    ["claim-guardrail-invalidated", async ({ fixture }) => fixture.database.prepare("UPDATE knowledge_versions SET status='superseded' WHERE id='outreach-guardrail'").run()],
    ["suppression", async ({ repository, prepared }) => repository.recordSuppression({
      ...suppressionInput(),
      subjectDigest: prepared.seeded.contactPointDigest,
      aliasDigests: [],
      idempotencyKey: "attempt-preparation-suppression",
    })],
  ];
  for (const [name, invalidate] of cases) {
    const fixture = await createD1Fixture(`outreach-attempt-${name}`);
    try {
      const context = await prepareLeasedOutbox(fixture);
      const receipt = await context.boundary.recordPreCallRecheckReceipt(context.input);
      assert.equal(receipt.kind, "recorded", name);
      const repository = await loadRepository(fixture, context.prepared.seeded);
      await invalidate({ ...context, fixture, repository });
      const result = await context.boundary.prepareDispatchAttempt({ ...context.input, preCallReceiptId: receipt.receiptId });
      assert.equal(result.kind, "blocked", name);
      assert.equal(result.providerInvocationAuthorized, false, name);
      assert.equal(result.providerCalls, 0, name);
      assert.equal(await countRows(fixture.database, "outreach_dispatch_attempt_preparations"), 0, name);
      assert.equal(await countRows(fixture.database, "outreach_outbox_events"), 2, name);
    } finally {
      await fixture.dispose();
    }
  }
});

test("a structurally valid forged preparation never becomes provider authority", async () => {
  const fixture = await createD1Fixture("outreach-attempt-forged-digests");
  try {
    const context = await prepareLeasedOutbox(fixture);
    const receipt = await context.boundary.recordPreCallRecheckReceipt(context.input);
    assert.equal(receipt.kind, "recorded");
    const material = await fixture.database.prepare(
      `SELECT item.send_key,item.dispatch_key,item.message_version_id,message_version.artifact_digest,
              item.sender_connection_id
       FROM outreach_outbox_items item
       JOIN outreach_message_versions message_version
         ON message_version.id=item.message_version_id AND message_version.workspace_id=item.workspace_id
       WHERE item.id=? AND item.workspace_id=?`,
    ).bind(context.input.outboxItemId, context.prepared.seeded.workspaceId).first();
    const receiptRow = await fixture.database.prepare(
      "SELECT * FROM outreach_pre_call_recheck_receipts WHERE id=?",
    ).bind(receipt.receiptId).first();
    const forgedPreparationDigest = "d".repeat(64);
    await fixture.database.prepare(
      `INSERT INTO outreach_dispatch_attempt_preparations
        (id,workspace_id,owner_subject,outbox_item_id,attempt_ordinal,send_key,dispatch_key,
         message_version_id,message_artifact_digest,sender_connection_id,pre_call_receipt_id,
         lease_event_id,lease_generation,lease_holder_id,lease_expires_at,preparation_digest,
         provider_invocation_authorized,provider_calls,prepared_at)
       VALUES ('forged-attempt-preparation',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,0,?)`,
    ).bind(
      context.prepared.seeded.workspaceId,
      OUTREACH_OWNER.subject,
      context.input.outboxItemId,
      1,
      material.send_key,
      material.dispatch_key,
      material.message_version_id,
      material.artifact_digest,
      material.sender_connection_id,
      receiptRow.id,
      receiptRow.lease_event_id,
      receiptRow.lease_generation,
      receiptRow.lease_holder_id,
      receiptRow.lease_expires_at,
      forgedPreparationDigest,
      receiptRow.created_at,
    ).run();
    const result = await context.boundary.prepareDispatchAttempt({
      ...context.input,
      preCallReceiptId: receipt.receiptId,
    });
    assert.deepEqual(result, {
      kind: "blocked",
      reason: "attempt_unavailable",
      providerInvocationAuthorized: false,
      providerCalls: 0,
    });
    assert.equal(await countRows(fixture.database, "outreach_dispatch_attempt_preparations"), 1);
    assert.equal(await countRows(fixture.database, "outreach_outbox_events"), 2);
  } finally {
    await fixture.dispose();
  }
});

test("pre-call receipt rejects stale fences, hostile input, and post-lease authority changes with zero effects", async () => {
  const fixture = await createD1Fixture("outreach-pre-call-denials");
  try {
    const prepared = await prepareApprovedMessage(fixture, {
      packageExpiresAt: OUTREACH_NOW + 70_000,
      messageExpiresAt: OUTREACH_NOW + 60_000,
    });
    const senderConnectionId = await insertSenderConnection(fixture, prepared.seeded, "active", 1);
    const enqueue = await loadOutbox(fixture, prepared.seeded);
    const queued = await enqueue.enqueueApprovedMessage({
      messageApprovalId: prepared.messageApproval.id,
      senderConnectionId,
    });
    const outboxModule = await fixture.vite.ssrLoadModule(new URL("../domain/outbox.ts", import.meta.url).pathname);
    const boundary = outboxModule.createD1OutboxRepository(fixture.database, {
      ...scope(prepared.seeded),
      now: () => OUTREACH_NOW + 1_000,
    });
    const lease = await boundary.claimDispatchLease({
      outboxItemId: queued.outboxItemId,
      holderId: "synthetic-worker-one",
    });
    assert.equal(lease.kind, "claimed");
    const base = {
      outboxItemId: queued.outboxItemId,
      holderId: "synthetic-worker-one",
      leaseGeneration: lease.leaseGeneration,
    };
    for (const input of [
      { ...base, holderId: "synthetic-worker-two" },
      { ...base, leaseGeneration: lease.leaseGeneration + 1 },
      { ...base, extra: "forbidden" },
    ]) {
      assert.equal((await boundary.recordPreCallRecheckReceipt(input)).kind, "blocked");
    }
    let getterCalls = 0;
    const hostile = {};
    Object.defineProperty(hostile, "outboxItemId", { enumerable: true, get() { getterCalls += 1; return queued.outboxItemId; } });
    Object.defineProperty(hostile, "holderId", { enumerable: true, value: base.holderId });
    Object.defineProperty(hostile, "leaseGeneration", { enumerable: true, value: base.leaseGeneration });
    assert.equal((await boundary.recordPreCallRecheckReceipt(hostile)).reason, "invalid_request");
    assert.equal(getterCalls, 0);
    await fixture.database.prepare("UPDATE sources SET status='withdrawn' WHERE id='outreach-source'").run();
    assert.deepEqual(await boundary.recordPreCallRecheckReceipt(base), {
      kind: "blocked",
      reason: "current_authority_unavailable",
      providerInvocationAuthorized: false,
      providerCalls: 0,
    });
    assert.equal(await countRows(fixture.database, "outreach_pre_call_recheck_receipts"), 0);
    assert.equal(await countRows(fixture.database, "outreach_outbox_events"), 2);
  } finally {
    await fixture.dispose();
  }
});

test("repository rejects a structurally valid receipt whose canonical digests were forged", async () => {
  const fixture = await createD1Fixture("outreach-pre-call-forged-digest");
  try {
    const context = await prepareLeasedOutbox(fixture);
    const first = await context.boundary.recordPreCallRecheckReceipt(context.input);
    assert.equal(first.kind, "recorded");
    const firstRow = await fixture.database.prepare(
      "SELECT * FROM outreach_pre_call_recheck_receipts WHERE id=?",
    ).bind(first.receiptId).first();
    const outboxModule = await fixture.vite.ssrLoadModule(new URL("../domain/outbox.ts", import.meta.url).pathname);
    const recovered = outboxModule.createD1OutboxRepository(fixture.database, {
      ...scope(context.prepared.seeded),
      now: () => OUTREACH_NOW + 16_000,
    });
    const secondLease = await recovered.claimDispatchLease({
      outboxItemId: context.input.outboxItemId,
      holderId: "synthetic-worker-two",
    });
    assert.equal(secondLease.kind, "claimed");
    const secondEvent = await fixture.database.prepare(
      "SELECT id,revision FROM outreach_outbox_events WHERE outbox_item_id=? ORDER BY revision DESC LIMIT 1",
    ).bind(context.input.outboxItemId).first();
    const forgedDigest = "e".repeat(64);
    await fixture.database.prepare(
      `INSERT INTO outreach_pre_call_recheck_receipts
        (id,workspace_id,owner_subject,outbox_item_id,lease_event_id,lease_revision,lease_generation,
         lease_holder_id,lease_expires_at,recipient_authority_id,unsubscribe_event_id,sender_capability_id,
         sender_verified_address_id,contact_eligibility_snapshot_id,current_material_digest,receipt_digest,
         valid_until,provider_invocation_authorized,created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?)`,
    ).bind(
      `opcr-${forgedDigest}`,
      firstRow.workspace_id,
      firstRow.owner_subject,
      firstRow.outbox_item_id,
      secondEvent.id,
      secondEvent.revision,
      secondLease.leaseGeneration,
      secondLease.holderId,
      secondLease.expiresAt,
      firstRow.recipient_authority_id,
      firstRow.unsubscribe_event_id,
      firstRow.sender_capability_id,
      firstRow.sender_verified_address_id,
      firstRow.contact_eligibility_snapshot_id,
      "d".repeat(64),
      forgedDigest,
      secondLease.expiresAt,
      OUTREACH_NOW + 16_000,
    ).run();
    const replay = await recovered.recordPreCallRecheckReceipt({
      outboxItemId: context.input.outboxItemId,
      holderId: secondLease.holderId,
      leaseGeneration: secondLease.leaseGeneration,
    });
    assert.equal(replay.kind, "blocked");
    assert.equal(replay.providerInvocationAuthorized, false);
    assert.equal(replay.providerCalls, 0);
    assert.equal(await countRows(fixture.database, "outreach_pre_call_recheck_receipts"), 2);
  } finally {
    await fixture.dispose();
  }
});

test("pre-call receipt fails closed at the exact lease expiry boundary and across owners", async () => {
  const fixture = await createD1Fixture("outreach-pre-call-boundaries");
  try {
    const prepared = await prepareApprovedMessage(fixture, {
      packageExpiresAt: OUTREACH_NOW + 70_000,
      messageExpiresAt: OUTREACH_NOW + 60_000,
    });
    const senderConnectionId = await insertSenderConnection(fixture, prepared.seeded, "active", 1);
    const enqueue = await loadOutbox(fixture, prepared.seeded);
    const queued = await enqueue.enqueueApprovedMessage({ messageApprovalId: prepared.messageApproval.id, senderConnectionId });
    const outboxModule = await fixture.vite.ssrLoadModule(new URL("../domain/outbox.ts", import.meta.url).pathname);
    const boundary = outboxModule.createD1OutboxRepository(fixture.database, {
      ...scope(prepared.seeded),
      now: () => OUTREACH_NOW + 1_000,
    });
    const lease = await boundary.claimDispatchLease({ outboxItemId: queued.outboxItemId, holderId: "synthetic-worker-one" });
    assert.equal(lease.kind, "claimed");
    const input = { outboxItemId: queued.outboxItemId, holderId: "synthetic-worker-one", leaseGeneration: lease.leaseGeneration };
    const wrongOwner = outboxModule.createD1OutboxRepository(fixture.database, {
      workspaceId: prepared.seeded.workspaceId,
      ownerSubject: "different-owner",
      now: () => OUTREACH_NOW + 1_001,
    });
    assert.equal((await wrongOwner.recordPreCallRecheckReceipt(input)).kind, "blocked");
    const expired = outboxModule.createD1OutboxRepository(fixture.database, {
      ...scope(prepared.seeded),
      now: () => lease.expiresAt,
    });
    assert.equal((await expired.recordPreCallRecheckReceipt(input)).kind, "blocked");
    assert.equal(await countRows(fixture.database, "outreach_pre_call_recheck_receipts"), 0);
  } finally {
    await fixture.dispose();
  }
});

test("suppression, approval revocation, stop, unsubscribe failure, and sender rotation each win after lease", async () => {
  const cases = [
    ["suppression", async ({ repository, prepared }) => repository.recordSuppression({
      ...suppressionInput(),
      subjectDigest: prepared.seeded.contactPointDigest,
      aliasDigests: [],
      idempotencyKey: "pre-call-suppression",
    })],
    ["approval-revocation", async ({ repository, prepared }) => repository.revokeApproval({
      targetKind: "message_approval",
      targetApprovalId: prepared.messageApproval.id,
      reasonCode: "owner_revoked",
      sourceEventDigest: "4".repeat(64),
      idempotencyKey: "pre-call-approval-revocation",
    })],
    ["package-approval-revocation", async ({ repository, prepared }) => repository.revokeApproval({
      targetKind: "package_approval",
      targetApprovalId: prepared.packageApproval.id,
      reasonCode: "owner_revoked",
      sourceEventDigest: "5".repeat(64),
      idempotencyKey: "pre-call-package-approval-revocation",
    })],
    ["pause-stop", async ({ fixture, prepared }) => {
      const command = await fixture.database.prepare(
        "SELECT id FROM outreach_commands WHERE workspace_id=? ORDER BY created_at,id LIMIT 1",
      ).bind(prepared.seeded.workspaceId).first();
      await fixture.database.prepare(
        `INSERT INTO outreach_stop_events
          (id,workspace_id,stop_kind,tombstone_id,subject_kind,subject_digest,source_event_digest,
           reason_code,command_id,effective_at,created_at)
         VALUES ('outreach-pre-call-pause',?,'pause',NULL,'exact_email',?,?,'synthetic_pause',?,?,?)`,
      ).bind(
        prepared.seeded.workspaceId,
        prepared.seeded.contactPointDigest,
        "6".repeat(64),
        command.id,
        OUTREACH_NOW,
        OUTREACH_NOW,
      ).run();
    }],
    ["unsubscribe-failure", async ({ repository, prepared }) => repository.recordUnsubscribeAuthorityEvent({
      recipientAuthorityId: prepared.recipientAuthority.id,
      expectedRevision: 1,
      status: "failed",
      checkDigest: "f".repeat(64),
      observedAt: OUTREACH_NOW,
      validUntil: null,
      idempotencyKey: "pre-call-unsubscribe-failed",
    })],
    ["sender-rotation", async ({ fixture, prepared }) => {
      await insertSenderConnection(fixture, prepared.seeded, "degraded", 2);
    }],
    ["claim-guardrail-invalidated", async ({ fixture }) => {
      await fixture.database.prepare("UPDATE knowledge_versions SET status='superseded' WHERE id='outreach-guardrail'").run();
    }],
  ];
  for (const [name, invalidate] of cases) {
    const fixture = await createD1Fixture(`outreach-pre-call-${name}`);
    try {
      const context = await prepareLeasedOutbox(fixture);
      const repository = await loadRepository(fixture, context.prepared.seeded);
      await invalidate({ ...context, fixture, repository });
      const result = await context.boundary.recordPreCallRecheckReceipt(context.input);
      assert.equal(result.kind, "blocked", name);
      assert.equal(result.providerInvocationAuthorized, false, name);
      assert.equal(result.providerCalls, 0, name);
      assert.equal(await countRows(fixture.database, "outreach_pre_call_recheck_receipts"), 0, name);
      assert.equal(await countRows(fixture.database, "outreach_outbox_events"), 2, name);
    } finally {
      await fixture.dispose();
    }
  }
});

test("withdrawing any Package-bound source blocks the pre-call receipt", async () => {
  const fixture = await createD1Fixture("outreach-pre-call-secondary-source");
  try {
    const seeded = await seedOutreachAuthority(fixture);
    await fixture.database.prepare(
      `INSERT INTO sources
        (id,workspace_id,created_at,updated_at,revision,origin,opaque_locator,source_digest,privacy,license,status)
       VALUES ('outreach-secondary-source',?,?,?,1,'public_research','synthetic:secondary-source',?,'public','synthetic-test-only','available')`,
    ).bind(seeded.workspaceId, OUTREACH_NOW, OUTREACH_NOW, "6".repeat(64)).run();
    await fixture.database.prepare(
      `INSERT INTO prospecting_source_lineage
        (id,workspace_id,run_id,submission_id,source_id,source_url,publisher_identity,underlying_origin_identity,
         independence_group,source_tier,published_at,occurred_at,retrieved_at,excerpt,lineage_json,lineage_digest,created_at)
       VALUES ('outreach-secondary-evidence',?,?, 'outreach-submission','outreach-secondary-source','https://example.invalid/secondary-evidence',
         'synthetic-secondary-publisher','synthetic-secondary-origin','synthetic-secondary-independent',1,?,?,?,'synthetic secondary evidence','{}',?,?)`,
    ).bind(
      seeded.workspaceId,
      seeded.runId,
      OUTREACH_NOW - 10,
      OUTREACH_NOW - 10,
      OUTREACH_NOW - 5,
      "7".repeat(64),
      OUTREACH_NOW,
    ).run();
    const prepared = await prepareApprovedMessageFromSeeded(fixture, seeded, {
      packageExpiresAt: OUTREACH_NOW + 70_000,
      messageExpiresAt: OUTREACH_NOW + 60_000,
      additionalEvidenceDigests: ["7".repeat(64)],
      additionalPackageBindings: [
        { kind: "source", id: "outreach-secondary-source", digest: "6".repeat(64) },
        { kind: "evidence", id: "outreach-secondary-evidence", digest: "7".repeat(64) },
      ],
    });
    const senderConnectionId = await insertSenderConnection(fixture, seeded, "active", 1);
    const enqueue = await loadOutbox(fixture, seeded);
    const queued = await enqueue.enqueueApprovedMessage({ messageApprovalId: prepared.messageApproval.id, senderConnectionId });
    const outboxModule = await fixture.vite.ssrLoadModule(new URL("../domain/outbox.ts", import.meta.url).pathname);
    const boundary = outboxModule.createD1OutboxRepository(fixture.database, {
      ...scope(seeded),
      now: () => OUTREACH_NOW + 1_000,
    });
    const lease = await boundary.claimDispatchLease({ outboxItemId: queued.outboxItemId, holderId: "synthetic-worker-one" });
    assert.equal(lease.kind, "claimed");
    await fixture.database.prepare("UPDATE sources SET status='withdrawn' WHERE id='outreach-secondary-source'").run();
    const result = await boundary.recordPreCallRecheckReceipt({
      outboxItemId: queued.outboxItemId,
      holderId: "synthetic-worker-one",
      leaseGeneration: lease.leaseGeneration,
    });
    assert.equal(result.kind, "blocked");
    assert.equal(result.providerInvocationAuthorized, false);
    assert.equal(result.providerCalls, 0);
    assert.equal(await countRows(fixture.database, "outreach_pre_call_recheck_receipts"), 0);
  } finally {
    await fixture.dispose();
  }
});

test("later artifact, eligibility, and lifecycle state each block the pre-call receipt", async () => {
  const cases = [
    ["later-package", async ({ repository, prepared }) => repository.createPackageVersion({
      ...packageInput(prepared.seeded),
      version: 2,
      expectedVersion: 1,
      idempotencyKey: "pre-call-later-package",
    })],
    ["later-message", async ({ fixture, repository, prepared }) => {
      const packageVersion = await fixture.database.prepare(
        `SELECT package_version.id,package_version.artifact_digest digest
         FROM outreach_message_versions message_version
         JOIN outreach_package_versions package_version ON package_version.id=message_version.package_version_id
         WHERE message_version.id=? AND message_version.workspace_id=?`,
      ).bind(prepared.message.id, prepared.seeded.workspaceId).first();
      const next = messageInput(packageVersion, prepared.seeded);
      return repository.createMessageVersion({
        ...next,
        version: 2,
        expectedVersion: 1,
        snapshot: { ...next.snapshot, subject: "Synthetic later pre-call message" },
        unsubscribeTokenDigest: "a".repeat(64),
        idempotencyKey: "pre-call-later-message",
      });
    }],
    ["newer-eligibility", async ({ fixture, prepared }) => fixture.database.prepare(
      `INSERT INTO contact_eligibility_snapshots
        (id,workspace_id,contact_id,prospect_id,configuration_id,configuration_digest,configuration_revision,
         prospect_revision,state,eligible,observation_ids_json,reason_codes_json,preserved_suppression_refs_json,
         snapshot_digest,projected_at)
       SELECT 'pre-call-newer-eligibility',workspace_id,contact_id,prospect_id,configuration_id,configuration_digest,
         configuration_revision,prospect_revision,'NeedsReview',0,observation_ids_json,'["new_review_required"]',
         preserved_suppression_refs_json,?,projected_at
       FROM contact_eligibility_snapshots WHERE id=? AND workspace_id=?`,
    ).bind(
      "8".repeat(64),
      prepared.seeded.eligibilityId,
      prepared.seeded.workspaceId,
    ).run()],
    ["profile-paused", async ({ fixture, prepared }) => fixture.database.prepare(
      "UPDATE customer_profiles SET lifecycle='paused' WHERE id=? AND workspace_id=?",
    ).bind(prepared.seeded.profileId, prepared.seeded.workspaceId).run()],
    ["play-paused", async ({ fixture, prepared }) => fixture.database.prepare(
      `UPDATE market_plays SET lifecycle='paused'
       WHERE workspace_id=? AND id=(SELECT play_id FROM customer_profiles WHERE id=? AND workspace_id=?)`,
    ).bind(prepared.seeded.workspaceId, prepared.seeded.profileId, prepared.seeded.workspaceId).run()],
    ["product-paused", async ({ fixture, prepared }) => fixture.database.prepare(
      `UPDATE products SET lifecycle='paused'
       WHERE workspace_id=? AND id=(
         SELECT play.product_id FROM customer_profiles profile
         JOIN market_plays play ON play.id=profile.play_id AND play.workspace_id=profile.workspace_id
         WHERE profile.id=? AND profile.workspace_id=?)`,
    ).bind(prepared.seeded.workspaceId, prepared.seeded.profileId, prepared.seeded.workspaceId).run()],
    ["company-archived", async ({ fixture, prepared }) => fixture.database.prepare(
      "UPDATE companies SET status='archived' WHERE workspace_id=?",
    ).bind(prepared.seeded.workspaceId).run()],
  ];
  for (const [name, invalidate] of cases) {
    const fixture = await createD1Fixture(`outreach-pre-call-currentness-${name}`);
    try {
      const context = await prepareLeasedOutbox(fixture);
      const repository = await loadRepository(fixture, context.prepared.seeded);
      await invalidate({ ...context, fixture, repository });
      const result = await context.boundary.recordPreCallRecheckReceipt(context.input);
      assert.equal(result.kind, "blocked", name);
      assert.equal(result.providerInvocationAuthorized, false, name);
      assert.equal(result.providerCalls, 0, name);
      assert.equal(await countRows(fixture.database, "outreach_pre_call_recheck_receipts"), 0, name);
      assert.equal(await countRows(fixture.database, "outreach_outbox_events"), 2, name);
    } finally {
      await fixture.dispose();
    }
  }
});

test("outbox enqueue rejects stale sender metadata, wrong owners, and accessor inputs without partial state", async () => {
  const fixture = await createD1Fixture("outreach-outbox-denials");
  try {
    const prepared = await prepareApprovedMessage(fixture);
    const activeId = await insertSenderConnection(fixture, prepared.seeded, "active", 1);
    await insertSenderConnection(fixture, prepared.seeded, "degraded", 2);
    const outbox = await loadOutbox(fixture, prepared.seeded);

    assert.deepEqual(
      await outbox.enqueueApprovedMessage({ messageApprovalId: prepared.messageApproval.id, senderConnectionId: activeId }),
      { kind: "blocked", reason: "current_authority_unavailable", providerCalls: 0 },
    );
    const outboxModule = await fixture.vite.ssrLoadModule(new URL("../domain/outbox.ts", import.meta.url).pathname);
    const wrongOwner = outboxModule.createD1OutboxRepository(fixture.database, {
      workspaceId: prepared.seeded.workspaceId,
      ownerSubject: "different-owner",
      now: () => OUTREACH_NOW,
    });
    assert.deepEqual(
      await wrongOwner.enqueueApprovedMessage({ messageApprovalId: prepared.messageApproval.id, senderConnectionId: activeId }),
      { kind: "blocked", reason: "current_authority_unavailable", providerCalls: 0 },
    );

    let getterCalls = 0;
    const accessorInput = {};
    Object.defineProperty(accessorInput, "messageApprovalId", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return prepared.messageApproval.id;
      },
    });
    Object.defineProperty(accessorInput, "senderConnectionId", { enumerable: true, value: activeId });
    assert.deepEqual(
      await outbox.enqueueApprovedMessage(accessorInput),
      { kind: "blocked", reason: "invalid_request", providerCalls: 0 },
    );
    assert.equal(getterCalls, 0);
    assert.equal(await countRows(fixture.database, "outreach_message_approval_consumptions"), 0);
    assert.equal(await countRows(fixture.database, "outreach_outbox_items"), 0);
    assert.equal(await countRows(fixture.database, "outreach_outbox_events"), 0);
  } finally {
    await fixture.dispose();
  }
});

test("unrelated suppression committed after approval does not block exact enqueue scope", async () => {
  const fixture = await createD1Fixture("outreach-outbox-unrelated-suppression");
  try {
    const prepared = await prepareApprovedMessage(fixture);
    const senderConnectionId = await insertSenderConnection(fixture, prepared.seeded, "active", 1);
    const repository = await loadRepository(fixture, prepared.seeded);
    await repository.recordSuppression({
      ...suppressionInput(),
      idempotencyKey: "outreach-outbox-post-approval-suppression",
    });
    const outbox = await loadOutbox(fixture, prepared.seeded);
    const queued = await outbox.enqueueApprovedMessage({ messageApprovalId: prepared.messageApproval.id, senderConnectionId });
    assert.equal(queued.kind, "queued");
    assert.equal(queued.providerCalls, 0);
    assert.equal(await countRows(fixture.database, "outreach_message_approval_consumptions"), 1);
    assert.equal(await countRows(fixture.database, "outreach_outbox_items"), 1);
    assert.equal(await countRows(fixture.database, "outreach_outbox_events"), 1);
    const outboxModule = await fixture.vite.ssrLoadModule(new URL("../domain/outbox.ts", import.meta.url).pathname);
    const whenDue = outboxModule.createD1OutboxRepository(fixture.database, {
      ...scope(prepared.seeded),
      now: () => OUTREACH_NOW + 1_000,
    });
    assert.equal(
      (await whenDue.claimDispatchLease({ outboxItemId: queued.outboxItemId, holderId: "synthetic-worker-one" })).kind,
      "claimed",
    );
  } finally {
    await fixture.dispose();
  }
});

test("exact suppression after queue prevents lease acquisition", async () => {
  const fixture = await createD1Fixture("outreach-outbox-lease-suppression");
  try {
    const prepared = await prepareApprovedMessage(fixture);
    const outbox = await loadOutbox(fixture, prepared.seeded);
    const senderConnectionId = await insertSenderConnection(fixture, prepared.seeded, "active", 1);
    const queued = await outbox.enqueueApprovedMessage({
      messageApprovalId: prepared.messageApproval.id,
      senderConnectionId,
    });
    assert.equal(queued.kind, "queued");
    const repository = await loadRepository(fixture, prepared.seeded);
    await repository.recordSuppression({
      ...suppressionInput(),
      subjectDigest: prepared.seeded.contactPointDigest,
      aliasDigests: [],
      idempotencyKey: "outreach-outbox-post-queue-suppression",
    });
    const outboxModule = await fixture.vite.ssrLoadModule(new URL("../domain/outbox.ts", import.meta.url).pathname);
    const whenDue = outboxModule.createD1OutboxRepository(fixture.database, {
      ...scope(prepared.seeded),
      now: () => OUTREACH_NOW + 1_000,
    });
    assert.deepEqual(
      await whenDue.claimDispatchLease({ outboxItemId: queued.outboxItemId, holderId: "synthetic-worker-one" }),
      {
        kind: "blocked",
        reason: "current_authority_unavailable",
        providerInvocationAuthorized: false,
        providerCalls: 0,
      },
    );
    assert.equal(await countRows(fixture.database, "outreach_outbox_events"), 1);
  } finally {
    await fixture.dispose();
  }
});

test("future schedule and sender revocation prevent lease acquisition", async () => {
  const fixture = await createD1Fixture("outreach-outbox-lease-schedule-revocation");
  try {
    const prepared = await prepareApprovedMessage(fixture);
    const outbox = await loadOutbox(fixture, prepared.seeded);
    const senderConnectionId = await insertSenderConnection(fixture, prepared.seeded, "active", 1);
    const queued = await outbox.enqueueApprovedMessage({
      messageApprovalId: prepared.messageApproval.id,
      senderConnectionId,
    });
    assert.equal(queued.kind, "queued");
    assert.equal(
      (await outbox.claimDispatchLease({ outboxItemId: queued.outboxItemId, holderId: "synthetic-worker-one" })).kind,
      "blocked",
      "the message is scheduled one second in the future",
    );
    await insertSenderConnection(fixture, prepared.seeded, "revoked", 2);
    const outboxModule = await fixture.vite.ssrLoadModule(new URL("../domain/outbox.ts", import.meta.url).pathname);
    const whenDue = outboxModule.createD1OutboxRepository(fixture.database, {
      ...scope(prepared.seeded),
      now: () => OUTREACH_NOW + 1_000,
    });
    assert.deepEqual(
      await whenDue.claimDispatchLease({ outboxItemId: queued.outboxItemId, holderId: "synthetic-worker-one" }),
      {
        kind: "blocked",
        reason: "current_authority_unavailable",
        providerInvocationAuthorized: false,
        providerCalls: 0,
      },
    );
    assert.equal(await countRows(fixture.database, "outreach_outbox_events"), 1);
  } finally {
    await fixture.dispose();
  }
});

test("dispatch lease expiry cannot exceed immutable message approval authority", async () => {
  const fixture = await createD1Fixture("outreach-outbox-lease-expiry-cap");
  try {
    const prepared = await prepareApprovedMessage(fixture);
    const outbox = await loadOutbox(fixture, prepared.seeded);
    const senderConnectionId = await insertSenderConnection(fixture, prepared.seeded, "active", 1);
    const queued = await outbox.enqueueApprovedMessage({
      messageApprovalId: prepared.messageApproval.id,
      senderConnectionId,
    });
    assert.equal(queued.kind, "queued");
    const outboxModule = await fixture.vite.ssrLoadModule(new URL("../domain/outbox.ts", import.meta.url).pathname);
    const whenDue = outboxModule.createD1OutboxRepository(fixture.database, {
      ...scope(prepared.seeded),
      now: () => OUTREACH_NOW + 1_000,
    });
    const lease = await whenDue.claimDispatchLease({
      outboxItemId: queued.outboxItemId,
      holderId: "synthetic-worker-one",
    });
    assert.equal(lease.kind, "claimed");
    assert.equal(lease.expiresAt, OUTREACH_NOW + 10_000);
    assert.equal(lease.providerInvocationAuthorized, false);
    assert.equal(lease.providerCalls, 0);
  } finally {
    await fixture.dispose();
  }
});

test("suppression atomically appends tombstone, stop, and minimized audit before exact replay", async () => {
  const fixture = await createD1Fixture("outreach-suppression");
  try {
    const seeded = await seedOutreachAuthority(fixture);
    const repository = await loadRepository(fixture, seeded);
    const input = {
      subjectKind: "exact_email",
      subjectDigest: "b".repeat(64),
      channel: "email",
      reason: "unsubscribe",
      sourceEventDigest: "c".repeat(64),
      aliasDigests: ["d".repeat(64), "e".repeat(64)],
      effectiveAt: OUTREACH_NOW - 1,
      idempotencyKey: "outreach-suppression-command",
    };
    const results = await Promise.all([repository.recordSuppression(input), repository.recordSuppression(input)]);
    assert.equal(results.filter((result) => result.replayed).length, 1);
    assert.equal(await countRows(fixture.database, "outreach_suppression_tombstones"), 1);
    assert.equal(await countRows(fixture.database, "outreach_stop_events"), 1);
    assert.equal(await countRows(fixture.database, "outreach_audit_records"), 1);
    assert.equal(await repository.isSuppressed([{ kind: "exact_email", digest: input.subjectDigest, channel: "email" }]), true);
    await assert.rejects(
      repository.recordSuppression({ ...input, channel: "all", idempotencyKey: "outreach-suppression-changed" }),
      /outreach_repository_conflict/,
      "the durable subject prohibition cannot be replaced with changed semantics",
    );
    await assert.rejects(
      fixture.database.prepare("DELETE FROM outreach_suppression_tombstones WHERE id=?").bind(results[0].id).run(),
      /immutable outreach suppression/,
    );
    assert.deepEqual((await fixture.database.prepare("PRAGMA foreign_key_check").all()).results, []);
  } finally {
    await fixture.dispose();
  }
});

test("repository admission and cross-workspace artifact bindings fail closed", async () => {
  const fixture = await createD1Fixture("outreach-scope-negative");
  try {
    const seeded = await seedOutreachAuthority(fixture);
    const repositoryModule = await fixture.vite.ssrLoadModule(new URL("../domain/outreach-repository.ts", import.meta.url).pathname);
    const denied = repositoryModule.createD1OutreachRepository(fixture.database, {
      workspaceId: seeded.workspaceId,
      ownerSubject: "different-owner",
      now: () => OUTREACH_NOW,
    });
    await assert.rejects(denied.createPackageVersion(packageInput(seeded)), /outreach_repository_conflict/);
    assert.equal(await countRows(fixture.database, "outreach_commands"), 0);
    const repository = repositoryModule.createD1OutreachRepository(fixture.database, scope(seeded));
    const input = packageInput(seeded);
    await assert.rejects(
      repository.createPackageVersion({
        ...input,
        bindings: input.bindings.map((binding) => binding.kind === "source" ? { ...binding, id: "missing-cross-workspace-source" } : binding),
      }),
      /outreach_repository_conflict/,
    );
    assert.equal(await countRows(fixture.database, "outreach_packages"), 0);
    assert.equal(await countRows(fixture.database, "outreach_commands"), 0);
  } finally {
    await fixture.dispose();
  }
});

async function loadRepository(fixture, seeded) {
  const repositoryModule = await fixture.vite.ssrLoadModule(new URL("../domain/outreach-repository.ts", import.meta.url).pathname);
  return repositoryModule.createD1OutreachRepository(fixture.database, scope(seeded));
}

async function prepareApprovedMessage(fixture, expiry = {}) {
  const seeded = await seedOutreachAuthority(fixture);
  return prepareApprovedMessageFromSeeded(fixture, seeded, expiry);
}

async function prepareApprovedMessageFromSeeded(fixture, seeded, expiry = {}) {
  const repository = await loadRepository(fixture, seeded);
  const basePackage = packageInput(seeded);
  const packageVersion = await repository.createPackageVersion({
    ...basePackage,
    snapshot: {
      ...basePackage.snapshot,
      evidenceDigests: [...basePackage.snapshot.evidenceDigests, ...(expiry.additionalEvidenceDigests ?? [])],
    },
    bindings: [...basePackage.bindings, ...(expiry.additionalPackageBindings ?? [])],
  });
  const packageApproval = await repository.approvePackageVersion({
    packageVersionId: packageVersion.id,
    expectedVersion: 1,
    expiresAt: expiry.packageExpiresAt ?? OUTREACH_NOW + 20_000,
    idempotencyKey: "outreach-package-approval-for-outbox",
  });
  const message = await repository.createMessageVersion(messageInput(packageVersion, seeded));
  const recipientAuthority = await recordRecipientAuthority(repository, message, packageApproval, seeded, expiry.packageExpiresAt ?? OUTREACH_NOW + 20_000);
  const messageApproval = await repository.approveMessageVersion({
    messageVersionId: message.id,
    packageApprovalId: packageApproval.id,
    expectedVersion: 1,
    acknowledgementDigest: recipientAuthority.digest,
    expiresAt: expiry.messageExpiresAt ?? OUTREACH_NOW + 10_000,
    idempotencyKey: "outreach-message-approval-for-outbox",
  });
  return { seeded, packageApproval, message, recipientAuthority, messageApproval };
}

async function loadOutbox(fixture, seeded) {
  const outboxModule = await fixture.vite.ssrLoadModule(new URL("../domain/outbox.ts", import.meta.url).pathname);
  return outboxModule.createD1OutboxRepository(fixture.database, scope(seeded));
}

async function prepareLeasedOutbox(fixture) {
  const prepared = await prepareApprovedMessage(fixture, {
    packageExpiresAt: OUTREACH_NOW + 70_000,
    messageExpiresAt: OUTREACH_NOW + 60_000,
  });
  const senderConnectionId = await insertSenderConnection(fixture, prepared.seeded, "active", 1);
  const enqueue = await loadOutbox(fixture, prepared.seeded);
  const queued = await enqueue.enqueueApprovedMessage({ messageApprovalId: prepared.messageApproval.id, senderConnectionId });
  assert.equal(queued.kind, "queued");
  const outboxModule = await fixture.vite.ssrLoadModule(new URL("../domain/outbox.ts", import.meta.url).pathname);
  const boundary = outboxModule.createD1OutboxRepository(fixture.database, {
    ...scope(prepared.seeded),
    now: () => OUTREACH_NOW + 1_000,
  });
  const lease = await boundary.claimDispatchLease({ outboxItemId: queued.outboxItemId, holderId: "synthetic-worker-one" });
  assert.equal(lease.kind, "claimed");
  return {
    prepared,
    boundary,
    input: { outboxItemId: queued.outboxItemId, holderId: "synthetic-worker-one", leaseGeneration: lease.leaseGeneration },
  };
}

async function prepareInertDispatchAttempt(fixture) {
  const context = await prepareLeasedOutbox(fixture);
  const receipt = await context.boundary.recordPreCallRecheckReceipt(context.input);
  assert.equal(receipt.kind, "recorded");
  const preparation = await context.boundary.prepareDispatchAttempt({
    ...context.input,
    preCallReceiptId: receipt.receiptId,
  });
  assert.equal(preparation.kind, "prepared_no_invocation");
  return { ...context, receipt, preparation };
}

async function insertSenderConnection(fixture, seeded, status, version, grantedScopes = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
], verifiedAddresses = [
  { address: "owner@example.invalid", kind: "canonical", verificationDigest: "7".repeat(64) },
], expiresAt = OUTREACH_NOW + 86_400_000) {
  const connectionId = await insertRawSenderConnection(fixture, seeded, status, version);
  if (status === "active") {
    const repository = await loadRepository(fixture, seeded);
    await repository.recordSenderCapability({
      senderConnectionId: connectionId,
      grantedScopes,
      verifiedAddresses,
      verifiedAt: OUTREACH_NOW,
      expiresAt,
      idempotencyKey: `outreach-sender-capability-${version}`,
    });
  }
  return connectionId;
}

async function insertRawSenderConnection(fixture, seeded, status, version) {
  const issuance = await fixture.vite.ssrLoadModule(new URL("../domain/enrichment-grant-issuance.ts", import.meta.url).pathname);
  const senderAddressDigest = await issuance.canonicalDigest({
    schema: "outreach-sender-address/v1",
    address: "owner@example.invalid",
  });
  const connectionId = "outreach-sender-connection-" + version;
  await fixture.database.prepare(
    "INSERT INTO outreach_sender_connections (id,workspace_id,provider,connection_subject_digest,sender_address_digest,protected_reference,protected_reference_version,status,verified_at,created_at) VALUES (?,?,'gmail',?,?,?,?,?,?,?)",
  ).bind(
    connectionId,
    seeded.workspaceId,
    "6".repeat(64),
    senderAddressDigest,
    "vault-ref:synthetic-unconfigured-" + version,
    version,
    status,
    OUTREACH_NOW - 1,
    OUTREACH_NOW,
  ).run();
  return connectionId;
}

async function recordRecipientAuthority(repository, message, packageApproval, seeded, validUntil = OUTREACH_NOW + 20_000) {
  const authority = await repository.recordRecipientDispatchAuthority({
    messageVersionId: message.id,
    packageApprovalId: packageApproval.id,
    emailObservationId: seeded.observationId,
    jurisdictionCode: "CA-ON",
    claimedBasisCode: "legitimate_interest",
    basisSourceId: "outreach-source",
    basisSourceDigest: seeded.sourceDigest,
    advisoryPolicyVersion: "prospector-advisory-v1",
    advisoryPolicyDigest: "c".repeat(64),
    unsubscribePathDigest: "d".repeat(64),
    acknowledgedAt: OUTREACH_NOW,
    validUntil,
    idempotencyKey: `outreach-recipient-authority-${message.id}`,
  });
  await repository.recordUnsubscribeAuthorityEvent({
    recipientAuthorityId: authority.id,
    expectedRevision: 0,
    status: "working",
    checkDigest: "e".repeat(64),
    observedAt: OUTREACH_NOW,
    validUntil,
    idempotencyKey: `outreach-unsubscribe-working-${message.id}`,
  });
  return authority;
}

test("caller mutation cannot change captured scope, package, message, approval, or suppression commands", async () => {
  const fixture = await createD1Fixture("outreach-input-capture");
  try {
    const seeded = await seedOutreachAuthority(fixture);
    const repositoryModule = await fixture.vite.ssrLoadModule(new URL("../domain/outreach-repository.ts", import.meta.url).pathname);
    let mutate = () => {};
    const database = {
      prepare(sql) {
        const statement = fixture.database.prepare(sql);
        if (!sql.startsWith("SELECT id FROM workspaces")) return statement;
        return { bind(...args) {
          const bound = statement.bind(...args);
          return { async first() { const result = await bound.first(); mutate(); return result; } };
        } };
      },
      batch: (statements) => fixture.database.batch(statements),
    };
    const mutableScope = scope(seeded);
    const repository = repositoryModule.createD1OutreachRepository(database, mutableScope);
    const packageCommand = packageInput(seeded);
    const originalPackage = structuredClone(packageCommand);
    mutate = () => {
      mutableScope.workspaceId = "foreign-workspace";
      mutableScope.ownerSubject = "foreign-owner";
      packageCommand.snapshot.recommendedAngle = "changed after admission";
      packageCommand.bindings[0].digest = "0".repeat(64);
      packageCommand.idempotencyKey = "changed-after-admission";
    };
    const packageVersion = await repository.createPackageVersion(packageCommand);
    const packageRow = await fixture.database.prepare("SELECT snapshot_json FROM outreach_package_versions WHERE id=?").bind(packageVersion.id).first();
    assert.equal(JSON.parse(packageRow.snapshot_json).recommendedAngle, originalPackage.snapshot.recommendedAngle);
    mutate = () => {};
    assert.equal((await repository.createPackageVersion(originalPackage)).replayed, true);

    const packageApprovalCommand = { packageVersionId: packageVersion.id, expectedVersion: 1, expiresAt: OUTREACH_NOW + 20_000, idempotencyKey: "capture-package-approval" };
    mutate = () => { packageApprovalCommand.expiresAt = 1; packageApprovalCommand.packageVersionId = "foreign-package"; };
    const packageApproval = await repository.approvePackageVersion(packageApprovalCommand);
    const messageCommand = messageInput(packageVersion, seeded);
    const originalMessage = structuredClone(messageCommand);
    mutate = () => { messageCommand.snapshot.textBody = "unreviewed mutation"; messageCommand.bindings[0].id = "foreign-package"; };
    const message = await repository.createMessageVersion(messageCommand);
    const messageRow = await fixture.database.prepare("SELECT snapshot_json FROM outreach_message_versions WHERE id=?").bind(message.id).first();
    assert.equal(JSON.parse(messageRow.snapshot_json).textBody, originalMessage.snapshot.textBody);
    mutate = () => {};
    const recipientAuthority = await recordRecipientAuthority(repository, message, packageApproval, seeded);
    const messageApprovalCommand = { messageVersionId: message.id, packageApprovalId: packageApproval.id, expectedVersion: 1, acknowledgementDigest: recipientAuthority.digest, expiresAt: OUTREACH_NOW + 10_000, idempotencyKey: "capture-message-approval" };
    mutate = () => { messageApprovalCommand.acknowledgementDigest = "b".repeat(64); messageApprovalCommand.messageVersionId = "foreign-message"; };
    const approval = await repository.approveMessageVersion(messageApprovalCommand);
    assert.equal((await fixture.database.prepare("SELECT acknowledgement_digest FROM outreach_message_approvals WHERE id=?").bind(approval.id).first()).acknowledgement_digest, recipientAuthority.digest);
    const suppression = suppressionInput();
    mutate = () => { suppression.subjectDigest = "9".repeat(64); suppression.aliasDigests.push("8".repeat(64)); };
    const tombstone = await repository.recordSuppression(suppression);
    const tombstoneRow = await fixture.database.prepare("SELECT subject_digest,alias_snapshot_json FROM outreach_suppression_tombstones WHERE id=?").bind(tombstone.id).first();
    assert.equal(tombstoneRow.subject_digest, "b".repeat(64));
    assert.deepEqual(JSON.parse(tombstoneRow.alias_snapshot_json), ["d".repeat(64)]);
  } finally { await fixture.dispose(); }
});

test("accessors, sparse arrays, extra fields and malformed suppression lookups fail before admission", async () => {
  let admissions = 0;
  const fixture = await createD1Fixture("outreach-hostile-input");
  try {
    const repositoryModule = await fixture.vite.ssrLoadModule(new URL("../domain/outreach-repository.ts", import.meta.url).pathname);
    const repository = repositoryModule.createD1OutreachRepository({ prepare() { admissions++; throw new Error("must not query"); } }, { workspaceId: "synthetic-workspace", ownerSubject: "synthetic-owner" });
    let accessorCalls = 0;
    const accessor = {};
    Object.defineProperty(accessor, "idempotencyKey", { enumerable: true, get() { accessorCalls++; return "synthetic-key"; } });
    for (const method of ["createPackageVersion", "createMessageVersion", "approvePackageVersion", "approveMessageVersion", "recordSuppression"]) {
      await assert.rejects(repository[method](accessor), /invalid_input_shape/);
    }
    await assert.rejects(repository.recordSuppression({ ...suppressionInput(), extra: true }), /invalid_command_shape/);
    await assert.rejects(repository.recordSuppression({ ...suppressionInput(), aliasDigests: new Array(1) }), /invalid_input_shape/);
    for (const subjects of [
      [{ kind: "made_up", digest: "a".repeat(64), channel: "email" }],
      [{ kind: "exact_email", digest: "a".repeat(64), channel: "phone" }],
      [{ kind: "contact", digest: "a".repeat(64), channel: "made_up" }],
      [{ kind: "contact", digest: "a".repeat(64), channel: "all", extra: true }],
      new Array(1),
    ]) await assert.rejects(repository.isSuppressed(subjects), /outreach_repository_conflict/);
    const hostileScope = { workspaceId: "synthetic-workspace", ownerSubject: "synthetic-owner" };
    Object.defineProperty(hostileScope, "now", { enumerable: true, get() { accessorCalls++; return Date.now; } });
    assert.throws(() => repositoryModule.createD1OutreachRepository({}, hostileScope), /invalid_outreach_repository_scope/);
    assert.equal(accessorCalls, 0);
    assert.equal(admissions, 0);
  } finally { await fixture.dispose(); }
});

test("suppression lookup preserves aliases and validates channel semantics", async () => {
  const fixture = await createD1Fixture("outreach-alias-union");
  try {
    const seeded = await seedOutreachAuthority(fixture);
    const repository = await loadRepository(fixture, seeded);
    await repository.recordSuppression(suppressionInput());
    await repository.recordSuppression({ ...suppressionInput(), subjectDigest: "e".repeat(64), aliasDigests: ["d".repeat(64), "f".repeat(64)], sourceEventDigest: "1".repeat(64), idempotencyKey: "alias-second-tombstone" });
    for (const digest of ["b", "d", "e", "f"]) assert.equal(await repository.isSuppressed([{ kind: "exact_email", digest: digest.repeat(64), channel: "email" }]), true);
    assert.equal(await repository.isSuppressed([{ kind: "exact_email", digest: "0".repeat(64), channel: "email" }]), false);
    assert.equal(await repository.isSuppressed([{ kind: "e164_phone", digest: "d".repeat(64), channel: "phone" }]), false);
  } finally { await fixture.dispose(); }
});

test("same-workspace configuration, assessment, source, contact-point and package transplants roll back", async () => {
  const fixture = await createD1Fixture("outreach-binding-ancestry");
  try {
    const seeded = await seedOutreachAuthority(fixture);
    const repository = await loadRepository(fixture, seeded);
    await fixture.database.prepare(`INSERT INTO sources (id,workspace_id,created_at,updated_at,revision,origin,opaque_locator,source_digest,privacy,license,status)
      SELECT 'unrelated-source',workspace_id,created_at,updated_at,revision,origin,'synthetic:unrelated',?,privacy,license,status FROM sources WHERE id='outreach-source'`).bind("0".repeat(64)).run();
    await fixture.database.prepare(`INSERT INTO qualification_assessments (id,workspace_id,candidate_id,configuration_id,configuration_digest,input_json,input_digest,anchor_json,evidence_json,gate_json,score_json,score,outcome,tie_order,assessment_digest,predecessor_assessment_id,created_at)
      SELECT 'unrelated-assessment',workspace_id,candidate_id,configuration_id,configuration_digest,input_json,input_digest,anchor_json,evidence_json,gate_json,score_json,score,outcome,tie_order,?,predecessor_assessment_id,created_at FROM qualification_assessments WHERE id='outreach-assessment'`).bind("0".repeat(64)).run();
    for (const [kind, id, digest] of [
      ["configuration", "phase4-product-config", "a".repeat(64)],
      ["qualification", "unrelated-assessment", "0".repeat(64)],
      ["source", "unrelated-source", "0".repeat(64)],
    ]) {
      const input = packageInput(seeded);
      input.bindings = input.bindings.map((binding) => binding.kind === kind ? { kind, id, digest } : binding);
      await assert.rejects(repository.createPackageVersion(input), /outreach_repository_conflict/);
      assert.equal(await countRows(fixture.database, "outreach_commands"), 0);
    }
    const wrongPoint = packageInput(seeded);
    wrongPoint.snapshot.selectedContactPointDigests = ["0".repeat(64)];
    await assert.rejects(repository.createPackageVersion(wrongPoint), /outreach_repository_conflict/);
    await fixture.database.prepare("UPDATE prospecting_candidates SET status='observed' WHERE id='outreach-candidate'").run();
    const packageVersion = await repository.createPackageVersion(packageInput(seeded));
    const other = await repository.createPackageVersion({ ...packageInput(seeded), packageId: "second-package-root", idempotencyKey: "second-package-command" });
    const message = messageInput(packageVersion, seeded);
    message.bindings = [{ kind: "package_version", id: other.id, digest: other.digest }];
    await assert.rejects(repository.createMessageVersion(message), /outreach_repository_conflict/);
    assert.equal(await countRows(fixture.database, "outreach_message_versions"), 0);
    await assert.rejects(fixture.database.prepare(`INSERT INTO outreach_artifact_bindings (id,workspace_id,artifact_kind,artifact_id,binding_kind,binding_id,binding_digest,ordinal,created_at)
      VALUES ('appended-binding',?,'package_version',?,'source','outreach-source',?,99,?)`).bind(seeded.workspaceId, packageVersion.id, seeded.sourceDigest, OUTREACH_NOW).run(), /sealed outreach bindings/);
  } finally { await fixture.dispose(); }
});

test("approval transaction rechecks current configuration, prospect, contact, source and lifecycle", async () => {
  const fixture = await createD1Fixture("outreach-current-approval");
  try {
    const seeded = await seedOutreachAuthority(fixture);
    const repository = await loadRepository(fixture, seeded);
    const packageVersion = await repository.createPackageVersion(packageInput(seeded));
    const command = { packageVersionId: packageVersion.id, expectedVersion: 1, expiresAt: OUTREACH_NOW + 20_000, idempotencyKey: "current-package-approval" };
    for (const [deny, restore, id] of [
      ["UPDATE typed_configurations SET active=0 WHERE id=?", "UPDATE typed_configurations SET active=1 WHERE id=?", seeded.configurationId],
      ["UPDATE profile_prospects SET state='rejected' WHERE id=?", "UPDATE profile_prospects SET state='approved' WHERE id=?", seeded.prospectId],
      ["UPDATE contacts SET revision=revision+1 WHERE id=?", "UPDATE contacts SET revision=revision-1 WHERE id=?", seeded.contactId],
      ["UPDATE sources SET status='withdrawn' WHERE id=?", "UPDATE sources SET status='available' WHERE id=?", "outreach-source"],
      ["UPDATE customer_profiles SET lifecycle='paused' WHERE id=?", "UPDATE customer_profiles SET lifecycle='ready' WHERE id=?", seeded.profileId],
    ]) {
      await fixture.database.prepare(deny).bind(id).run();
      await assert.rejects(repository.approvePackageVersion(command), /outreach_repository_conflict/);
      assert.equal(await countRows(fixture.database, "outreach_package_approvals"), 0);
      assert.equal(await countRows(fixture.database, "outreach_commands"), 1);
      await fixture.database.prepare(restore).bind(id).run();
    }
    const packageApproval = await repository.approvePackageVersion(command);
    const message = await repository.createMessageVersion(messageInput(packageVersion, seeded));
    const recipientAuthority = await recordRecipientAuthority(repository, message, packageApproval, seeded);
    const repositoryModule = await fixture.vite.ssrLoadModule(new URL("../domain/outreach-repository.ts", import.meta.url).pathname);
    const racing = repositoryModule.createD1OutreachRepository({
      prepare: (...args) => fixture.database.prepare(...args),
      async batch(statements) {
        await fixture.database.prepare("UPDATE typed_configurations SET active=0 WHERE id=?").bind(seeded.configurationId).run();
        return fixture.database.batch(statements);
      },
    }, scope(seeded));
    await assert.rejects(racing.approveMessageVersion({ messageVersionId: message.id, packageApprovalId: packageApproval.id, expectedVersion: 1, acknowledgementDigest: recipientAuthority.digest, expiresAt: OUTREACH_NOW + 10_000, idempotencyKey: "raced-message-approval" }), /outreach_repository_conflict/);
    assert.equal(await countRows(fixture.database, "outreach_message_approvals"), 0);
    assert.equal(await countRows(fixture.database, "outreach_commands"), 5);
    await fixture.database.prepare("UPDATE typed_configurations SET active=1 WHERE id=?").bind(seeded.configurationId).run();
    await fixture.database.prepare(`INSERT INTO contact_eligibility_snapshots
      (id,workspace_id,contact_id,prospect_id,configuration_id,configuration_digest,configuration_revision,prospect_revision,state,eligible,observation_ids_json,reason_codes_json,preserved_suppression_refs_json,snapshot_digest,projected_at)
      SELECT 'outreach-newer-eligibility',workspace_id,contact_id,prospect_id,configuration_id,configuration_digest,configuration_revision,prospect_revision,'NeedsReview',0,observation_ids_json,'["new_review_required"]',preserved_suppression_refs_json,?,projected_at
      FROM contact_eligibility_snapshots WHERE id=?`).bind("0".repeat(64), seeded.eligibilityId).run();
    await assert.rejects(repository.approveMessageVersion({ messageVersionId: message.id, packageApprovalId: packageApproval.id, expectedVersion: 1, acknowledgementDigest: recipientAuthority.digest, expiresAt: OUTREACH_NOW+10_000, idempotencyKey: "newer-eligibility-denied" }), /outreach_repository_conflict/);
    assert.equal(await countRows(fixture.database, "outreach_message_approvals"), 0);
  } finally { await fixture.dispose(); }
});

test("later Message versions fence the caller package identity against the immutable Message parent", async () => {
  const fixture = await createD1Fixture("outreach-message-parent-fence");
  try {
    const seeded = await seedOutreachAuthority(fixture);
    const repository = await loadRepository(fixture, seeded);
    const packageVersion = await repository.createPackageVersion(packageInput(seeded));
    const original = messageInput(packageVersion, seeded);
    await repository.createMessageVersion(original);
    const otherPackage = { ...packageInput(seeded), packageId: "other-message-package", idempotencyKey: "other-message-package-command" };
    await repository.createPackageVersion(otherPackage);
    const second = {
      ...original, version: 2, expectedVersion: 1,
      snapshot: { ...original.snapshot, subject: "Synthetic immutable version two" },
      unsubscribeTokenDigest: "8".repeat(64), idempotencyKey: "message-version-two-parent-fence",
    };
    await assert.rejects(repository.createMessageVersion({ ...second, packageId: otherPackage.packageId }), /outreach_repository_conflict/);
    assert.equal(await countRows(fixture.database, "outreach_commands"), 3, "a missing guarded version insert cannot leave a command-only commit");
    assert.equal(await countRows(fixture.database, "outreach_audit_records"), 3);
    assert.equal(await countRows(fixture.database, "outreach_message_versions"), 1);
    const accepted = await repository.createMessageVersion(second);
    assert.equal((await repository.createMessageVersion(second)).replayed, true);
    const row = await fixture.database.prepare("SELECT m.package_id,v.package_version_id,v.version FROM outreach_message_versions v JOIN outreach_messages m ON m.id=v.message_id WHERE v.id=?").bind(accepted.id).first();
    assert.deepEqual(row, { package_id: original.packageId, package_version_id: original.packageVersionId, version: 2 });
    assert.equal(await countRows(fixture.database, "outreach_commands"), 4);
    assert.equal(await countRows(fixture.database, "outreach_audit_records"), 4);
    assert.equal(await countRows(fixture.database, "outreach_message_versions"), 2);
  } finally { await fixture.dispose(); }
});

test("later Package versions fence every caller subject against the immutable Package parent", async () => {
  const fixture = await createD1Fixture("outreach-package-parent-fence");
  try {
    const seeded = await seedOutreachAuthority(fixture);
    const repository = await loadRepository(fixture, seeded);
    const original = packageInput(seeded);
    await repository.createPackageVersion(original);
    const second = { ...original, version: 2, expectedVersion: 1, idempotencyKey: "package-version-two-parent-fence" };
    for (const field of ["prospectId", "contactId", "profileId"]) {
      await assert.rejects(repository.createPackageVersion({ ...second, [field]: "wrong-parent-subject" }), /outreach_repository_conflict/);
      assert.equal(await countRows(fixture.database, "outreach_commands"), 1, "a failed root association fence rolls back the command");
      assert.equal(await countRows(fixture.database, "outreach_package_versions"), 1);
      assert.equal(await countRows(fixture.database, "outreach_audit_records"), 1);
    }
    const accepted = await repository.createPackageVersion(second);
    assert.equal((await repository.createPackageVersion(second)).replayed, true);
    const row = await fixture.database.prepare("SELECT p.prospect_id,p.contact_id,p.profile_id,v.version FROM outreach_package_versions v JOIN outreach_packages p ON p.id=v.package_id WHERE v.id=?").bind(accepted.id).first();
    assert.deepEqual(row, { prospect_id: original.prospectId, contact_id: original.contactId, profile_id: original.profileId, version: 2 });
    assert.equal(await countRows(fixture.database, "outreach_commands"), 2);
  } finally { await fixture.dispose(); }
});

test("suppression committed immediately before approval wins and unknown scoped resolution fails explicitly", async () => {
  const fixture = await createD1Fixture("outreach-suppression-approval-race");
  try {
    const seeded = await seedOutreachAuthority(fixture);
    const repository = await loadRepository(fixture, seeded);
    const version = await repository.createPackageVersion(packageInput(seeded));
    const repositoryModule = await fixture.vite.ssrLoadModule(new URL("../domain/outreach-repository.ts", import.meta.url).pathname);
    const racing = repositoryModule.createD1OutreachRepository({
      prepare: (...args) => fixture.database.prepare(...args),
      async batch(statements) {
        await repository.recordSuppression({ ...suppressionInput(), aliasDigests: [seeded.contactPointDigest] });
        return fixture.database.batch(statements);
      },
    }, scope(seeded));
    await assert.rejects(racing.approvePackageVersion({ packageVersionId: version.id, expectedVersion: 1, expiresAt: OUTREACH_NOW + 20_000, idempotencyKey: "suppressed-package-approval" }), /outreach_repository_conflict/);
    assert.equal(await countRows(fixture.database, "outreach_package_approvals"), 0);
    assert.equal(await countRows(fixture.database, "outreach_commands"), 2);
    // The schema proves there is exactly one Company per workspace.
    const indexes = (await fixture.database.prepare("PRAGMA index_list('companies')").all()).results;
    assert.equal(indexes.find((index) => index.name === "companies_workspace_unique").unique, 1);
    await repository.recordSuppression({ ...suppressionInput(), subjectKind: "organization", subjectDigest: "1".repeat(64), sourceEventDigest: "2".repeat(64), aliasDigests: [], idempotencyKey: "organization-scope-unresolved" });
    await assert.rejects(repository.approvePackageVersion({ packageVersionId: version.id, expectedVersion: 1, expiresAt: OUTREACH_NOW + 20_000, idempotencyKey: "unresolved-organization-approval" }), /unresolved_suppression_scope/);
  } finally { await fixture.dispose(); }
});

test("freshness expiry and workspace Company suppression cannot authorize approval", async () => {
  const fixture = await createD1Fixture("outreach-expiry-company");
  try {
    const seeded = await seedOutreachAuthority(fixture);
    const repository = await loadRepository(fixture, seeded);
    const version = await repository.createPackageVersion(packageInput(seeded));
    const repositoryModule = await fixture.vite.ssrLoadModule(new URL("../domain/outreach-repository.ts", import.meta.url).pathname);
    const observation = await fixture.database.prepare("SELECT verified_at FROM contact_point_observations WHERE id=?").bind(seeded.observationId).first();
    const expiry = Number(observation.verified_at) + 30 * 24 * 60 * 60 * 1000;
    const expired = repositoryModule.createD1OutreachRepository(fixture.database, { ...scope(seeded), now: () => expiry });
    await assert.rejects(expired.approvePackageVersion({ packageVersionId: version.id, expectedVersion: 1, expiresAt: expiry+10_000, idempotencyKey: "freshness-exact-expiry" }), /outreach_repository_conflict/);
    // A pending unrelated exact-email prohibition does not block this Contact.
    await repository.recordSuppression(suppressionInput());
    const packageApproval = await repository.approvePackageVersion({ packageVersionId: version.id, expectedVersion: 1, expiresAt: OUTREACH_NOW+20_000, idempotencyKey: "unrelated-suppression-approval" });
    const message = await repository.createMessageVersion(messageInput(version, seeded));
    const recipientAuthority = await recordRecipientAuthority(repository, message, packageApproval, seeded);
    await repository.recordSuppression({ ...suppressionInput(), subjectKind: "company", subjectDigest: "0".repeat(64), channel: "all", aliasDigests: [], sourceEventDigest: "1".repeat(64), idempotencyKey: "workspace-company-prohibition" });
    await assert.rejects(repository.approveMessageVersion({ messageVersionId: message.id, packageApprovalId: packageApproval.id, expectedVersion: 1, acknowledgementDigest: recipientAuthority.digest, expiresAt: OUTREACH_NOW+10_000, idempotencyKey: "company-suppressed-message" }), /outreach_repository_conflict/);
    assert.equal(await countRows(fixture.database, "outreach_message_approvals"), 0);
  } finally { await fixture.dispose(); }
});

function suppressionInput() {
  return { subjectKind: "exact_email", subjectDigest: "b".repeat(64), channel: "email", reason: "unsubscribe", sourceEventDigest: "c".repeat(64), aliasDigests: ["d".repeat(64)], effectiveAt: OUTREACH_NOW - 1, idempotencyKey: "outreach-suppression-command" };
}

function scope(seeded) {
  return { workspaceId: seeded.workspaceId, ownerSubject: OUTREACH_OWNER.subject, now: () => OUTREACH_NOW };
}

function packageInput(seeded) {
  return {
    packageId: "outreach-package-root",
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
      recommendedAngle: "Synthetic governed outreach angle",
      selectedRole: "champion",
      selectedContactPointDigests: [seeded.contactPointDigest],
      callScript: "Synthetic offline call script.",
      draftMessageIds: ["outreach-message-root"],
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
    idempotencyKey: "outreach-package-version-create",
  };
}

function messageInput(packageVersion, seeded) {
  return {
    messageId: "outreach-message-root",
    packageId: "outreach-package-root",
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
      subject: "Synthetic governed outreach message",
      textBody: "Hello from the offline fixture.",
      htmlBody: null,
      links: ["https://example.invalid/unsubscribe"],
      attachments: [],
      threadReference: null,
      replyToMessageReference: null,
    },
    intendedSendAt: OUTREACH_NOW + 1_000,
    timezone: "America/Toronto",
    unsubscribeTokenDigest: "9".repeat(64),
    bindings: [{ kind: "package_version", id: packageVersion.id, digest: packageVersion.digest }],
    idempotencyKey: `outreach-message-version-${seeded.prospectId}`,
  };
}
