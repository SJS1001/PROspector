import assert from "node:assert/strict";
import { extname, join, resolve } from "node:path";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { createServer } from "vite";

const NOW = 1_900_000_000_000;
const DAY = 86_400_000;
const A = "a".repeat(64);
const B = "b".repeat(64);
const C = "c".repeat(64);
const encoder = new TextEncoder();

async function load() {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    return {
      vite,
      manifest: await vite.ssrLoadModule(new URL("../preparation/phase7-backup-manifest.ts", import.meta.url).pathname),
      integrity: await vite.ssrLoadModule(new URL("../preparation/phase7-backup-integrity.ts", import.meta.url).pathname),
      restore: await vite.ssrLoadModule(new URL("../preparation/phase7-restore-plan.ts", import.meta.url).pathname),
      retention: await vite.ssrLoadModule(new URL("../preparation/phase7-backup-retention.ts", import.meta.url).pathname),
    };
  } catch (error) {
    await vite.close();
    throw error;
  }
}

function entry(id, kind, text) {
  return { id, kind, bytes: encoder.encode(text) };
}

function manifestInput(patch = {}) {
  return {
    id: "synthetic-backup-one",
    idempotencyKey: "synthetic-backup-key-one",
    tenantId: "synthetic-tenant-one",
    environmentId: "synthetic-source-environment",
    schemaVersion: 7,
    minimumRestoreSchemaVersion: 6,
    maximumRestoreSchemaVersion: 8,
    createdAt: NOW,
    deliveryExpiresAt: NOW + 7 * DAY,
    retainUntil: NOW + 30 * DAY,
    retentionPolicyId: "synthetic-retention-policy",
    retentionPolicyDigest: B,
    encryptionCapabilityId: "synthetic-encryption-capability",
    encryptionCapabilityDigest: A,
    entries: [
      entry("synthetic-records", "canonical_records", "fictional-records-v1"),
      entry("synthetic-tombstones", "suppression_tombstones", "fictional-tombstones-v1"),
      entry("synthetic-object", "content_object", "fictional-object-v1"),
    ],
    ...patch,
  };
}

function integrityCurrent(patch = {}) {
  return {
    evaluatedAt: NOW + DAY,
    tenantId: "synthetic-tenant-one",
    environmentId: "synthetic-source-environment",
    schemaVersion: 7,
    encryptedAtRestSupported: true,
    authenticatedEncryptionSupported: true,
    capabilityCurrent: true,
    encryptionCapabilityId: "synthetic-encryption-capability",
    encryptionCapabilityDigest: A,
    ...patch,
  };
}

function restoreInput(manifest, patch = {}) {
  return {
    id: "synthetic-restore-plan-one",
    idempotencyKey: "synthetic-restore-key-one",
    manifestId: manifest.id,
    manifestDigest: manifest.manifestDigest,
    sourceTenantId: manifest.tenantId,
    sourceEnvironmentId: manifest.environmentId,
    targetTenantId: manifest.tenantId,
    targetEnvironmentId: "synthetic-target-environment",
    targetSchemaVersion: 8,
    createdAt: NOW + DAY,
    ...patch,
  };
}

function restoreCurrent(patch = {}) {
  return {
    evaluatedAt: NOW + 2 * DAY,
    targetTenantId: "synthetic-tenant-one",
    targetEnvironmentId: "synthetic-target-environment",
    targetSchemaVersion: 8,
    targetClean: true,
    targetIsolationCurrent: true,
    effectsDisabled: true,
    ...patch,
  };
}

async function verifiedFixture(modules) {
  const manifest = await modules.manifest.buildSyntheticBackupManifest(manifestInput());
  const integrity = await modules.integrity.verifySyntheticBackupIntegrity({
    manifest,
    currentManifestInput: manifestInput(),
    current: integrityCurrent(),
  });
  return { manifest, integrity };
}

test("backup manifests are deterministic, tenant/environment bound, immutable, and retain no bytes", async () => {
  const modules = await load();
  try {
    const first = await modules.manifest.buildSyntheticBackupManifest(manifestInput());
    const reversed = await modules.manifest.buildSyntheticBackupManifest(manifestInput({ entries: [...manifestInput().entries].reverse() }));
    assert.equal(first.manifestDigest, reversed.manifestDigest);
    assert.equal(first.contentDigest, reversed.contentDigest);
    assert.deepEqual(first.entries.map(({ id }) => id), ["synthetic-records", "synthetic-object", "synthetic-tombstones"]);
    assert.equal(first.entries.some((item) => "bytes" in item), false);
    assert.equal(first.totalByteLength, manifestInput().entries.reduce((sum, item) => sum + item.bytes.byteLength, 0));
    assert.equal(Object.isFrozen(first), true);
    assert.equal(Object.isFrozen(first.entries), true);
    assert.equal(first.syntheticMetadataOnly, true);
    assert.equal(first.encryptedArchiveCreated, false);
    assert.equal(first.backupAuthorized, false);
    assert.equal(first.restoreAuthorized, false);
    assert.equal(first.deletionAuthorized, false);

    const otherTenant = await modules.manifest.buildSyntheticBackupManifest(manifestInput({ tenantId: "synthetic-tenant-two" }));
    const otherEnvironment = await modules.manifest.buildSyntheticBackupManifest(manifestInput({ environmentId: "synthetic-source-environment-two" }));
    assert.notEqual(first.manifestDigest, otherTenant.manifestDigest);
    assert.notEqual(first.manifestDigest, otherEnvironment.manifestDigest);
  } finally { await modules.vite.close(); }
});

test("manifest validation rejects ambiguous versions, chronology, duplicate IDs, empty bytes, and hostile shapes", async () => {
  const modules = await load();
  try {
    for (const input of [
      manifestInput({ minimumRestoreSchemaVersion: 8 }),
      manifestInput({ maximumRestoreSchemaVersion: 6 }),
      manifestInput({ deliveryExpiresAt: NOW }),
      manifestInput({ retainUntil: NOW - 1 }),
      manifestInput({ entries: [] }),
      manifestInput({ entries: [entry("synthetic-same", "content_object", "a"), entry("synthetic-same", "history", "b")] }),
      manifestInput({ entries: [entry("synthetic-empty", "content_object", "")] }),
      { ...manifestInput(), extra: true },
    ]) await assert.rejects(() => modules.manifest.buildSyntheticBackupManifest(input), /synthetic_phase7_backup_manifest_invalid/u);

    let reads = 0;
    const hostile = manifestInput();
    Object.defineProperty(hostile, "tenantId", { enumerable: true, get() { reads += 1; return "synthetic-tenant-one"; } });
    await assert.rejects(() => modules.manifest.buildSyntheticBackupManifest(hostile), /synthetic_phase7_backup_manifest_invalid/u);
    assert.equal(reads, 0);
  } finally { await modules.vite.close(); }
});

test("integrity verification re-hashes every supplied byte and accepts only current encryption capability", async () => {
  const modules = await load();
  try {
    const { manifest, integrity } = await verifiedFixture(modules);
    assert.equal(integrity.status, "verified_no_authority");
    assert.equal(integrity.integrityVerified, true);
    assert.equal(integrity.encryptionCapabilitySatisfied, true);
    assert.equal(integrity.restoreAuthorized, false);
    assert.deepEqual(integrity.effects, { filesystemReads: 0, filesystemWrites: 0, storageCalls: 0, providerCalls: 0 });

    const changed = manifestInput({ entries: [
      entry("synthetic-records", "canonical_records", "fictional-records-v2"),
      ...manifestInput().entries.slice(1),
    ] });
    const tampered = await modules.integrity.verifySyntheticBackupIntegrity({ manifest, currentManifestInput: changed, current: integrityCurrent() });
    assert.equal(tampered.status, "rejected");
    assert.equal(tampered.integrityVerified, false);
    assert.deepEqual(tampered.reasonCodes, ["backup_manifest_or_content_changed"]);
    assert.equal(tampered.contentDigest, null);
  } finally { await modules.vite.close(); }
});

test("integrity fails closed on tenant, environment, schema, expiry, or unknown capability state", async () => {
  const modules = await load();
  try {
    const manifest = await modules.manifest.buildSyntheticBackupManifest(manifestInput());
    const cases = [
      ["backup_tenant_mismatch", { tenantId: "synthetic-tenant-two" }],
      ["backup_environment_mismatch", { environmentId: "synthetic-source-environment-two" }],
      ["backup_schema_version_mismatch", { schemaVersion: 8 }],
      ["backup_delivery_expired", { evaluatedAt: manifest.deliveryExpiresAt }],
      ["encrypted_at_rest_capability_unavailable", { encryptedAtRestSupported: false }],
      ["authenticated_encryption_capability_unavailable", { authenticatedEncryptionSupported: false }],
      ["encryption_capability_not_current", { capabilityCurrent: false }],
      ["encryption_capability_mismatch", { encryptionCapabilityDigest: C }],
    ];
    for (const [reason, patch] of cases) {
      const decision = await modules.integrity.verifySyntheticBackupIntegrity({ manifest, currentManifestInput: manifestInput(), current: integrityCurrent(patch) });
      assert.equal(decision.status, "rejected", reason);
      assert.equal(decision.reasonCodes.includes(reason), true, reason);
      assert.deepEqual(decision.effects, { filesystemReads: 0, filesystemWrites: 0, storageCalls: 0, providerCalls: 0 });
    }
    await assert.rejects(() => modules.integrity.verifySyntheticBackupIntegrity({ manifest, currentManifestInput: manifestInput(), current: integrityCurrent({ capabilityCurrent: null }) }), /synthetic_phase7_backup_integrity_invalid/u);
  } finally { await modules.vite.close(); }
});

test("restore plans validate compatible clean isolated targets without doing a dry run or write", async () => {
  const modules = await load();
  try {
    const { manifest, integrity } = await verifiedFixture(modules);
    const planInput = restoreInput(manifest);
    const plan = await modules.restore.buildSyntheticRestorePlan(planInput);
    const decision = await modules.restore.validateSyntheticRestorePlan({ plan, currentPlanInput: planInput, manifest, integrityDecision: integrity, current: restoreCurrent(), existingReceipt: null });
    assert.equal(decision.status, "valid_no_authority");
    assert.equal(decision.wouldRequireDryRun, true);
    assert.equal(decision.dryRunPerformed, false);
    assert.equal(decision.restoreAuthorized, false);
    assert.deepEqual(decision.effects, { targetReads: 0, targetWrites: 0, filesystemWrites: 0, storageCalls: 0, providerCalls: 0 });
  } finally { await modules.vite.close(); }
});

test("restore planning rejects cross-tenant, same-environment, incompatible, dirty, unknown, enabled, and expired states", async () => {
  const modules = await load();
  try {
    const { manifest, integrity } = await verifiedFixture(modules);
    await assert.rejects(() => modules.restore.buildSyntheticRestorePlan(restoreInput(manifest, { targetTenantId: "synthetic-tenant-two" })), /synthetic_phase7_restore_plan_invalid/u);
    await assert.rejects(() => modules.restore.buildSyntheticRestorePlan(restoreInput(manifest, { targetEnvironmentId: manifest.environmentId })), /synthetic_phase7_restore_plan_invalid/u);
    const planInput = restoreInput(manifest);
    const plan = await modules.restore.buildSyntheticRestorePlan(planInput);
    const cases = [
      ["restore_tenant_mismatch", { targetTenantId: "synthetic-tenant-two" }],
      ["restore_environment_mismatch", { targetEnvironmentId: "synthetic-target-environment-two" }],
      ["restore_schema_incompatible", { targetSchemaVersion: 9 }],
      ["restore_target_not_clean", { targetClean: false }],
      ["restore_target_isolation_unknown", { targetIsolationCurrent: false }],
      ["restore_effects_not_disabled", { effectsDisabled: false }],
      ["restore_delivery_expired", { evaluatedAt: manifest.deliveryExpiresAt }],
    ];
    for (const [reason, patch] of cases) {
      const decision = await modules.restore.validateSyntheticRestorePlan({ plan, currentPlanInput: planInput, manifest, integrityDecision: integrity, current: restoreCurrent(patch), existingReceipt: null });
      assert.equal(decision.status, "rejected", reason);
      assert.equal(decision.reasonCodes.includes(reason), true, reason);
      assert.equal(decision.restoreAuthorized, false);
    }
  } finally { await modules.vite.close(); }
});

test("restore validation requires a branded successful integrity decision", async () => {
  const modules = await load();
  try {
    const manifest = await modules.manifest.buildSyntheticBackupManifest(manifestInput());
    const rejectedIntegrity = await modules.integrity.verifySyntheticBackupIntegrity({ manifest, currentManifestInput: manifestInput(), current: integrityCurrent({ capabilityCurrent: false }) });
    const planInput = restoreInput(manifest);
    const plan = await modules.restore.buildSyntheticRestorePlan(planInput);
    const rejected = await modules.restore.validateSyntheticRestorePlan({ plan, currentPlanInput: planInput, manifest, integrityDecision: rejectedIntegrity, current: restoreCurrent(), existingReceipt: null });
    assert.equal(rejected.status, "rejected");
    assert.equal(rejected.reasonCodes.includes("backup_integrity_unverified"), true);
    await assert.rejects(() => modules.restore.validateSyntheticRestorePlan({ plan, currentPlanInput: planInput, manifest, integrityDecision: { ...rejectedIntegrity, status: "verified_no_authority" }, current: restoreCurrent(), existingReceipt: null }), /synthetic_phase7_restore_plan_decision_invalid/u);
  } finally { await modules.vite.close(); }
});

test("restore idempotency replays only the exact persisted key and operation digest", async () => {
  const modules = await load();
  try {
    const { manifest, integrity } = await verifiedFixture(modules);
    const planInput = restoreInput(manifest);
    const plan = await modules.restore.buildSyntheticRestorePlan(planInput);
    const receipt = { idempotencyKey: plan.snapshot.idempotencyKey, planId: plan.id, planDigest: plan.digest, receiptDigest: C };
    const replay = await modules.restore.validateSyntheticRestorePlan({ plan, currentPlanInput: planInput, manifest, integrityDecision: integrity, current: restoreCurrent(), existingReceipt: receipt });
    assert.equal(replay.status, "replayed_no_authority");
    assert.equal(replay.wouldRequireDryRun, false);
    assert.equal(replay.replayedReceiptDigest, C);
    for (const patch of [{ planDigest: B }, { planId: "synthetic-other-plan" }, { idempotencyKey: "synthetic-other-key" }]) {
      const conflict = await modules.restore.validateSyntheticRestorePlan({ plan, currentPlanInput: planInput, manifest, integrityDecision: integrity, current: restoreCurrent(), existingReceipt: { ...receipt, ...patch } });
      assert.equal(conflict.status, "rejected");
      assert.equal(conflict.reasonCodes.includes("restore_idempotency_conflict"), true);
    }
  } finally { await modules.vite.close(); }
});

test("retention distinguishes delivery expiry from retention and never authorizes deletion", async () => {
  const modules = await load();
  try {
    const { manifest } = await verifiedFixture(modules);
    const current = {
      evaluatedAt: NOW + DAY,
      tenantId: manifest.tenantId,
      environmentId: manifest.environmentId,
      policyId: manifest.retentionPolicyId,
      policyDigest: manifest.retentionPolicyDigest,
      policyCurrent: true,
      custodyStateKnown: true,
      legalHold: false,
    };
    const retained = modules.retention.decideSyntheticBackupRetention({ manifest, current });
    assert.equal(retained.disposition, "retain_until_policy_date");
    const expiredDelivery = modules.retention.decideSyntheticBackupRetention({ manifest, current: { ...current, evaluatedAt: manifest.deliveryExpiresAt } });
    assert.equal(expiredDelivery.disposition, "retain_until_policy_date_delivery_expired");
    const elapsed = modules.retention.decideSyntheticBackupRetention({ manifest, current: { ...current, evaluatedAt: manifest.retainUntil } });
    assert.equal(elapsed.disposition, "eligible_for_custodian_disposal_no_authority");
    assert.equal(elapsed.disposalEligibilityMet, true);
    assert.equal(elapsed.custodianDisposalAuthorized, false);
    assert.equal(elapsed.deletionAuthorized, false);
    assert.deepEqual(elapsed.effects, { filesystemDeletes: 0, storageDeletes: 0, durableMutations: 0, providerCalls: 0 });
    const held = modules.retention.decideSyntheticBackupRetention({ manifest, current: { ...current, evaluatedAt: manifest.retainUntil, legalHold: true } });
    assert.equal(held.disposition, "retain_legal_hold");
    assert.equal(held.disposalEligibilityMet, false);
  } finally { await modules.vite.close(); }
});

test("retention fails closed on unknown custody/hold, stale policy, or binding drift", async () => {
  const modules = await load();
  try {
    const { manifest } = await verifiedFixture(modules);
    const current = { evaluatedAt: manifest.retainUntil, tenantId: manifest.tenantId, environmentId: manifest.environmentId, policyId: manifest.retentionPolicyId, policyDigest: manifest.retentionPolicyDigest, policyCurrent: true, custodyStateKnown: true, legalHold: false };
    const cases = [
      ["retention_tenant_mismatch", { tenantId: "synthetic-tenant-two" }],
      ["retention_environment_mismatch", { environmentId: "synthetic-source-environment-two" }],
      ["retention_policy_mismatch", { policyDigest: C }],
      ["retention_policy_not_current", { policyCurrent: false }],
      ["retention_custody_unknown", { custodyStateKnown: false }],
      ["retention_legal_hold_unknown", { legalHold: null }],
    ];
    for (const [reason, patch] of cases) {
      const decision = modules.retention.decideSyntheticBackupRetention({ manifest, current: { ...current, ...patch } });
      assert.equal(decision.disposition, "retain_fail_closed", reason);
      assert.equal(decision.reasonCodes.includes(reason), true, reason);
      assert.equal(decision.disposalEligibilityMet, false);
      assert.equal(decision.deletionAuthorized, false);
    }
  } finally { await modules.vite.close(); }
});

test("backup/recovery preparation stays outside every runtime composition surface", async () => {
  const siteRoot = resolve(import.meta.dirname, "..");
  const runtimeFiles = [
    ...await sourceFiles(join(siteRoot, "app")),
    ...await sourceFiles(join(siteRoot, "adapters")),
    ...await sourceFiles(join(siteRoot, "worker"), true),
  ];
  for (const file of runtimeFiles) {
    const source = await readFile(file, "utf8");
    assert.doesNotMatch(source, /phase7-(?:backup|restore-plan)/u, `${file} must not compose Phase 7 backup/recovery preparation`);
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
