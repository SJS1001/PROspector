import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { countRows, createD1Fixture } from "./helpers/d1.mjs";
import {
  applyOutreachMigrations,
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

test("0010 adds only the governed outreach candidate schema with aligned metadata", async () => {
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
    const journal = JSON.parse(await readFile(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8"));
    const prior = JSON.parse(await readFile(new URL("../drizzle/meta/0009_snapshot.json", import.meta.url), "utf8"));
    const snapshot = JSON.parse(await readFile(new URL("../drizzle/meta/0010_snapshot.json", import.meta.url), "utf8"));
    assert.deepEqual(journal.entries.at(-1), {
      idx: 10,
      version: "6",
      when: journal.entries.at(-1).when,
      tag: "0010_governed_outreach",
      breakpoints: true,
    });
    assert.equal(snapshot.prevId, prior.id);
    for (const table of TABLES) assert.equal(snapshot.tables[table]?.name, table);

    const migration = await readFile(new URL("../drizzle/0010_governed_outreach.sql", import.meta.url), "utf8");
    assert.doesNotMatch(migration, /\b(?:access_token|refresh_token|oauth_code|pkce_verifier|bearer_value|provider_secret)\b/iu);
    assert.doesNotMatch(migration, /CREATE TABLE\s+[`"]?(?:outbox|dispatch|gmail|provider)/iu);
    const triggers = migration.match(/CREATE TRIGGER[\s\S]*?END;/gu) ?? [];
    assert.ok(triggers.length >= 30);
    for (const trigger of triggers) assert.equal((trigger.match(/\bEND;/gu) ?? []).length, 1, "each 0010 trigger keeps one outer END terminator");
    assert.deepEqual((await fixture.database.prepare("PRAGMA foreign_key_check").all()).results, []);
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
    const acknowledgementDigest = "a".repeat(64);
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
    assert.equal(auditRows.length, 4);
    assert.doesNotMatch(JSON.stringify(auditRows), /Synthetic governed outreach message|Hello from the offline fixture/);
    assert.equal(await countRows(fixture.database, "outreach_stop_events"), 0);
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
      selectedContactPointDigests: ["f".repeat(64)],
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
      to: ["recipient@example.invalid"],
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
