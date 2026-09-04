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
    const messageApprovalCommand = { messageVersionId: message.id, packageApprovalId: packageApproval.id, expectedVersion: 1, acknowledgementDigest: "a".repeat(64), expiresAt: OUTREACH_NOW + 10_000, idempotencyKey: "capture-message-approval" };
    mutate = () => { messageApprovalCommand.acknowledgementDigest = "b".repeat(64); messageApprovalCommand.messageVersionId = "foreign-message"; };
    const approval = await repository.approveMessageVersion(messageApprovalCommand);
    assert.equal((await fixture.database.prepare("SELECT acknowledgement_digest FROM outreach_message_approvals WHERE id=?").bind(approval.id).first()).acknowledgement_digest, "a".repeat(64));
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
    const repositoryModule = await fixture.vite.ssrLoadModule(new URL("../domain/outreach-repository.ts", import.meta.url).pathname);
    const racing = repositoryModule.createD1OutreachRepository({
      prepare: (...args) => fixture.database.prepare(...args),
      async batch(statements) {
        await fixture.database.prepare("UPDATE typed_configurations SET active=0 WHERE id=?").bind(seeded.configurationId).run();
        return fixture.database.batch(statements);
      },
    }, scope(seeded));
    await assert.rejects(racing.approveMessageVersion({ messageVersionId: message.id, packageApprovalId: packageApproval.id, expectedVersion: 1, acknowledgementDigest: "a".repeat(64), expiresAt: OUTREACH_NOW + 10_000, idempotencyKey: "raced-message-approval" }), /outreach_repository_conflict/);
    assert.equal(await countRows(fixture.database, "outreach_message_approvals"), 0);
    assert.equal(await countRows(fixture.database, "outreach_commands"), 3);
    await fixture.database.prepare("UPDATE typed_configurations SET active=1 WHERE id=?").bind(seeded.configurationId).run();
    await fixture.database.prepare(`INSERT INTO contact_eligibility_snapshots
      (id,workspace_id,contact_id,prospect_id,configuration_id,configuration_digest,configuration_revision,prospect_revision,state,eligible,observation_ids_json,reason_codes_json,preserved_suppression_refs_json,snapshot_digest,projected_at)
      SELECT 'outreach-newer-eligibility',workspace_id,contact_id,prospect_id,configuration_id,configuration_digest,configuration_revision,prospect_revision,'NeedsReview',0,observation_ids_json,'["new_review_required"]',preserved_suppression_refs_json,?,projected_at
      FROM contact_eligibility_snapshots WHERE id=?`).bind("0".repeat(64), seeded.eligibilityId).run();
    await assert.rejects(repository.approveMessageVersion({ messageVersionId: message.id, packageApprovalId: packageApproval.id, expectedVersion: 1, acknowledgementDigest: "a".repeat(64), expiresAt: OUTREACH_NOW+10_000, idempotencyKey: "newer-eligibility-denied" }), /outreach_repository_conflict/);
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
    await repository.recordSuppression({ ...suppressionInput(), subjectKind: "company", subjectDigest: "0".repeat(64), channel: "all", aliasDigests: [], sourceEventDigest: "1".repeat(64), idempotencyKey: "workspace-company-prohibition" });
    await assert.rejects(repository.approveMessageVersion({ messageVersionId: message.id, packageApprovalId: packageApproval.id, expectedVersion: 1, acknowledgementDigest: "a".repeat(64), expiresAt: OUTREACH_NOW+10_000, idempotencyKey: "company-suppressed-message" }), /outreach_repository_conflict/);
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
