import assert from "node:assert/strict";
import { extname, join, resolve } from "node:path";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { createServer } from "vite";

async function load() {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    return {
      vite,
      artifact: await vite.ssrLoadModule(new URL("../domain/crm-handoff-artifact.ts", import.meta.url).pathname),
      backup: await vite.ssrLoadModule(new URL("../domain/local-portable-backup.ts", import.meta.url).pathname),
      retention: await vite.ssrLoadModule(new URL("../domain/retention-decision.ts", import.meta.url).pathname),
    };
  } catch (error) {
    await vite.close();
    throw error;
  }
}

const digest = (character) => character.repeat(64);
function row(patch = {}) {
  return {
    prospect_id: "prospect-1", company_id: "company-1", product_id: "product-1",
    market_play_id: "play-1", profile_id: "profile-1", account_target: "Synthetic Account",
    selected_role: "Operations", contact_id: "contact-1", contact_point_id: "point-1",
    contact_kind: "email", contact_value: "fictional@example.test", verification_class: "mailbox_verified",
    verification_method_ref: "verify-1", verification_time: "2026-09-09T12:00:00.000Z",
    qualification_score_ref: "score-1", evidence_refs: "evidence-1", offer_ref: "offer-1",
    package_ref: "package-1", activity_status: "approved", source_workspace_id: "workspace-1",
    source_run_id: "run-1", export_manifest_ref: "manifest-1", ...patch,
  };
}

test("CRM materialization is deterministic, tenant-bound, and formula-safe", async () => {
  const { vite, artifact } = await load();
  try {
    const input = {
      workspaceId: "workspace-1", snapshotDigest: digest("a"), exportDefinitionDigest: digest("b"),
      configurationDigest: digest("c"), packageDigests: [digest("e"), digest("d")],
      selectedAt: "2026-09-09T12:00:00.000Z",
      rows: [row({ prospect_id: "prospect-2", contact_id: "contact-2", contact_point_id: "point-2", selected_role: "\t=HYPERLINK(\"bad\")" }), row()],
    };
    const first = await artifact.materializeCrmHandoff(input);
    const second = await artifact.materializeCrmHandoff({ ...input, rows: [...input.rows].reverse(), packageDigests: [...input.packageDigests].reverse() });
    assert.equal(first.manifest.manifestSha256, second.manifest.manifestSha256);
    assert.equal(first.manifest.csvSha256, second.manifest.csvSha256);
    assert.deepEqual(first.bytes, second.bytes);
    assert.match(new TextDecoder().decode(first.bytes), /'\t=HYPERLINK/u);
    assert.equal(first.manifest.operationalAuthority, false);
    assert.equal(first.manifest.rowCount, 2);
    assert.equal(first.manifest.uniqueProspectCount, 2);
    const firstByte = first.bytes[0];
    first.bytes[0] = 0;
    assert.equal(first.bytes[0], firstByte, "each byte read returns a defensive copy");

    const otherTenant = await artifact.materializeCrmHandoff({
      ...input,
      workspaceId: "workspace-2",
      rows: input.rows.map((candidate) => ({ ...candidate, source_workspace_id: "workspace-2" })),
    });
    assert.notEqual(first.manifest.manifestSha256, otherTenant.manifest.manifestSha256);
    await assert.rejects(() => artifact.materializeCrmHandoff({ ...input, rows: [row({ source_workspace_id: "workspace-2" })] }), /crm_handoff_manifest_invalid/u);
    await assert.rejects(() => artifact.materializeCrmHandoff({ ...input, packageDigests: [] }), /crm_handoff_manifest_invalid/u);
    await assert.rejects(() => artifact.materializeCrmHandoff({ ...input, packageDigests: [digest("d"), digest("d")] }), /crm_handoff_manifest_invalid/u);
    await assert.rejects(() => artifact.materializeCrmHandoff({ ...input, unexpected: true }), /crm_handoff_manifest_invalid/u);
  } finally { await vite.close(); }
});

test("encrypted local backup restores atomically, idempotently, and keeps effects off", async () => {
  const { vite, backup } = await load();
  try {
    const source = {
      workspaceId: "workspace-1", createdAt: "2026-09-09T12:00:00.000Z",
      records: [{ kind: "prospect", id: "prospect-1", value: { state: "ExportReady", label: "Synthetic" } }],
      objectDigests: [digest("a")],
      suppressionTombstones: [{ kind: "suppression", id: "tombstone-1", value: { scopeDigest: digest("b") } }],
    };
    const passphrase = "disposable-test-passphrase-only";
    const envelope = await backup.createEncryptedLocalBackup(source, passphrase);
    assert.equal(JSON.stringify(envelope).includes(passphrase), false);
    const empty = { workspaceId: "workspace-1", archiveDigest: null, records: [], objectDigests: [], suppressionTombstones: [], effectsEnabled: false };
    const restored = await backup.restoreEncryptedLocalBackup(envelope, passphrase, empty);
    assert.equal(restored.effectsEnabled, false);
    assert.equal(restored.suppressionTombstones.length, 1);
    assert.equal(restored.records.length, 1);
    const replay = await backup.restoreEncryptedLocalBackup(envelope, passphrase, restored);
    assert.equal(replay, restored, "exact restore replay returns the prior immutable state");

    await assert.rejects(
      () => backup.restoreEncryptedLocalBackup(envelope, passphrase, { ...restored, workspaceId: "workspace-2" }),
      /portable_backup_untrusted/u,
      "a matching archive digest cannot bypass tenant isolation",
    );
    await assert.rejects(
      () => backup.restoreEncryptedLocalBackup(envelope, passphrase, { ...restored, records: [] }),
      /portable_backup_untrusted/u,
      "a matching archive digest cannot bless divergent restored state",
    );

    await assert.rejects(() => backup.restoreEncryptedLocalBackup(envelope, "wrong-passphrase-long-enough", empty), /portable_backup_untrusted/u);
    const corrupt = { ...envelope, ciphertext: `${envelope.ciphertext.slice(0, -4)}AAAA` };
    await assert.rejects(() => backup.restoreEncryptedLocalBackup(corrupt, passphrase, empty), /portable_backup_untrusted/u);
    await assert.rejects(() => backup.restoreEncryptedLocalBackup({ ...envelope, ciphertext: envelope.ciphertext.slice(0, -4) }, passphrase, empty), /portable_backup_untrusted/u);
    await assert.rejects(() => backup.restoreEncryptedLocalBackup({ ...envelope, salt: envelope.salt.replace(/=+$/u, "") }, passphrase, empty), /portable_backup_untrusted/u);
    await assert.rejects(() => backup.restoreEncryptedLocalBackup({ ...envelope, extra: true }, passphrase, empty), /portable_backup_untrusted/u);
    await assert.rejects(() => backup.restoreEncryptedLocalBackup({ ...envelope, iterations: 209_999 }, passphrase, empty), /portable_backup_untrusted/u);
    const nonClean = { ...empty, records: [{ kind: "existing", id: "existing-1", value: {} }] };
    await assert.rejects(() => backup.restoreEncryptedLocalBackup(envelope, passphrase, nonClean), /portable_backup_untrusted/u);
    assert.equal(nonClean.records.length, 1, "failed restore leaves caller state unchanged");
    await assert.rejects(() => backup.restoreEncryptedLocalBackup(envelope, passphrase, { ...empty, workspaceId: "workspace-2" }), /portable_backup_untrusted/u);
  } finally { await vite.close(); }
});

test("backup canonicalization rejects ambiguous and malformed suppression identities", async () => {
  const { vite, backup } = await load();
  try {
    const base = {
      workspaceId: "workspace-1", createdAt: "2026-09-09T12:00:00.000Z", objectDigests: [digest("b"), digest("a")],
      records: [{ kind: "account", id: "account-2", value: { z: 1, a: 2 } }],
      suppressionTombstones: [{ kind: "suppression", id: "tombstone-1", value: { scopeDigest: digest("c") } }],
    };
    const passphrase = "disposable-test-passphrase-only";
    const envelope = await backup.createEncryptedLocalBackup(base, passphrase);
    const empty = { workspaceId: "workspace-1", archiveDigest: null, records: [], objectDigests: [], suppressionTombstones: [], effectsEnabled: false };
    const restored = await backup.restoreEncryptedLocalBackup(envelope, passphrase, empty);
    assert.deepEqual(restored.objectDigests, [digest("a"), digest("b")]);
    assert.deepEqual(restored.records[0].value, { a: 2, z: 1 });

    await assert.rejects(() => backup.createEncryptedLocalBackup({
      ...base,
      records: [{ kind: "suppression", id: "tombstone-1", value: {} }],
    }, passphrase), /portable_backup_invalid/u, "one cross-archive identity index rejects collisions");
    await assert.rejects(() => backup.createEncryptedLocalBackup({
      ...base, suppressionTombstones: [{ kind: "account", id: "tombstone-1", value: { scopeDigest: digest("c") } }],
    }, passphrase), /portable_backup_invalid/u);
    await assert.rejects(() => backup.createEncryptedLocalBackup({
      ...base, suppressionTombstones: [{ kind: "suppression", id: "tombstone-1", value: {} }],
    }, passphrase), /portable_backup_invalid/u);
    await assert.rejects(() => backup.createEncryptedLocalBackup({
      ...base, suppressionTombstones: [{ kind: "suppression", id: "tombstone-1", value: { scopeDigest: "malformed" } }],
    }, passphrase), /portable_backup_invalid/u);
  } finally { await vite.close(); }
});

test("backup creation rejects secret-shaped fields before encryption", async () => {
  const { vite, backup } = await load();
  try {
    await assert.rejects(() => backup.createEncryptedLocalBackup({
      workspaceId: "workspace-1", createdAt: "2026-09-09T12:00:00.000Z", objectDigests: [], suppressionTombstones: [],
      records: [{ kind: "account", id: "account-1", value: { oauthToken: "must-not-enter-archive" } }],
    }, "disposable-test-passphrase-only"), /portable_backup_invalid/u);
  } finally { await vite.close(); }
});

test("retention fails closed and suppression tombstones always survive", async () => {
  const { vite, retention } = await load();
  try {
    const tombstone = retention.decideRetention({
      kind: "suppression_tombstone", createdAt: "2025-01-01T00:00:00.000Z", expiresAt: "2025-02-01T00:00:00.000Z", suppressionScopeDigest: digest("a"),
    }, "2030-01-01T00:00:00.000Z");
    assert.equal(tombstone.disposition, "retain_suppression_tombstone");
    assert.equal(tombstone.mayPurgePayload, false);
    assert.equal(tombstone.mustPreserveTombstone, true);
    assert.equal(tombstone.operationalAuthority, false);

    const expired = retention.decideRetention({
      kind: "crm_artifact", createdAt: "2025-01-01T00:00:00.000Z", expiresAt: "2025-02-01T00:00:00.000Z", suppressionScopeDigest: digest("b"),
    }, "2025-03-01T00:00:00.000Z");
    assert.equal(expired.disposition, "purge_payload_preserve_manifest");
    assert.equal(expired.mayPurgePayload, true);
    assert.equal(expired.mustPreserveTombstone, true);

    assert.throws(() => retention.decideRetention({ kind: "unknown", createdAt: "2025-01-01T00:00:00.000Z", expiresAt: null, suppressionScopeDigest: null }, "2025-01-02T00:00:00.000Z"), /retention_input_invalid/u);
    assert.throws(() => retention.decideRetention({ kind: "crm_artifact", createdAt: "bad", expiresAt: null, suppressionScopeDigest: null }, "2025-01-02T00:00:00.000Z"), /retention_input_invalid/u);
    const valid = { kind: "crm_artifact", createdAt: "2025-01-01T00:00:00.000Z", expiresAt: "2025-01-02T00:00:00.000Z", suppressionScopeDigest: null };
    assert.equal(retention.decideRetention(valid, valid.expiresAt).disposition, "purge_payload_preserve_manifest", "expiry boundary is inclusive");
    for (const [subject, now] of [
      [{ ...valid, createdAt: "2025-02-30T00:00:00.000Z" }, "2025-03-01T00:00:00.000Z"],
      [{ ...valid, createdAt: "2025-99-01T00:00:00.000Z" }, "2025-03-01T00:00:00.000Z"],
      [{ ...valid, createdAt: "2025-01-01T00:00:00+00:00" }, "2025-03-01T00:00:00.000Z"],
      [{ ...valid, expiresAt: "2024-12-31T23:59:59.999Z" }, "2025-03-01T00:00:00.000Z"],
      [valid, "2024-12-31T23:59:59.999Z"],
      [{ ...valid, extra: true }, "2025-03-01T00:00:00.000Z"],
    ]) assert.throws(() => retention.decideRetention(subject, now), /retention_input_invalid/u);
  } finally { await vite.close(); }
});

test("local portability modules remain excluded from production composition", async () => {
  const siteRoot = resolve(import.meta.dirname, "..");
  const runtimeFiles = [
    ...await sourceFiles(join(siteRoot, "app")),
    ...await sourceFiles(join(siteRoot, "adapters")),
    ...await sourceFiles(join(siteRoot, "worker"), true),
  ];
  for (const file of runtimeFiles) {
    const source = await readFile(file, "utf8");
    assert.doesNotMatch(source, /(?:crm-handoff-artifact|local-portable-backup|retention-decision)/u, `${file} must not compose local portability preparation`);
  }
});

async function sourceFiles(directory, optional = false) {
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); }
  catch (error) { if (optional && error?.code === "ENOENT") return []; throw error; }
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(path));
    else if ([".ts", ".tsx", ".js", ".mjs"].includes(extname(entry.name))) files.push(path);
  }
  return files;
}
