import { deepFreeze, exactRecord, positiveInteger, sha256Ascii, syntheticId, timestamp, booleanValue } from "./phase7-backup-contract-helpers";
import { isSyntheticBackupManifest, type SyntheticBackupManifest } from "./phase7-backup-manifest";
import { isSyntheticBackupIntegrityDecision } from "./phase7-backup-integrity";

const ZERO_EFFECTS = deepFreeze({ targetReads: 0 as const, targetWrites: 0 as const, filesystemWrites: 0 as const, storageCalls: 0 as const, providerCalls: 0 as const });
const plans = new WeakSet<object>();

export async function buildSyntheticRestorePlan(value: unknown) {
  try {
    const input = exactRecord(value, [
      "id", "idempotencyKey", "manifestId", "manifestDigest", "sourceTenantId",
      "sourceEnvironmentId", "targetTenantId", "targetEnvironmentId", "targetSchemaVersion", "createdAt",
    ]);
    const snapshot = deepFreeze({
      id: syntheticId(input.id),
      idempotencyKey: syntheticId(input.idempotencyKey),
      manifestId: syntheticId(input.manifestId),
      manifestDigest: digestValue(input.manifestDigest),
      sourceTenantId: syntheticId(input.sourceTenantId),
      sourceEnvironmentId: syntheticId(input.sourceEnvironmentId),
      targetTenantId: syntheticId(input.targetTenantId),
      targetEnvironmentId: syntheticId(input.targetEnvironmentId),
      targetSchemaVersion: positiveInteger(input.targetSchemaVersion),
      createdAt: timestamp(input.createdAt),
    });
    if (snapshot.sourceTenantId !== snapshot.targetTenantId) throw new Error("invalid");
    if (snapshot.sourceEnvironmentId === snapshot.targetEnvironmentId) throw new Error("invalid");
    const artifact = deepFreeze({
      kind: "synthetic_phase7_restore_plan" as const,
      id: snapshot.id,
      digest: await sha256Ascii(JSON.stringify(snapshot)),
      snapshot,
      dryRunPerformed: false as const,
      restoreAuthorized: false as const,
      persistenceAuthorized: false as const,
      effects: ZERO_EFFECTS,
    });
    plans.add(artifact);
    return artifact;
  } catch {
    throw new Error("synthetic_phase7_restore_plan_invalid");
  }
}

export async function validateSyntheticRestorePlan(value: unknown) {
  try {
    const input = exactRecord(value, ["plan", "currentPlanInput", "manifest", "integrityDecision", "current", "existingReceipt"]);
    if (!input.plan || typeof input.plan !== "object" || !plans.has(input.plan)) throw new Error("invalid");
    if (!isSyntheticBackupManifest(input.manifest)) throw new Error("invalid");
    if (!isSyntheticBackupIntegrityDecision(input.integrityDecision)) throw new Error("invalid");
    const plan = input.plan as Awaited<ReturnType<typeof buildSyntheticRestorePlan>>;
    const currentPlan = await buildSyntheticRestorePlan(input.currentPlanInput);
    const manifest = input.manifest as SyntheticBackupManifest;
    const integrity = input.integrityDecision;
    const current = normalizeCurrent(input.current);
    const receipt = normalizeReceipt(input.existingReceipt);
    const reasons: string[] = [];
    if (currentPlan.digest !== plan.digest) reasons.push("restore_plan_changed");
    if (manifest.id !== plan.snapshot.manifestId || manifest.manifestDigest !== plan.snapshot.manifestDigest) reasons.push("restore_manifest_mismatch");
    if (integrity.manifestDigest !== manifest.manifestDigest || integrity.status !== "verified_no_authority") reasons.push("backup_integrity_unverified");
    if (manifest.tenantId !== plan.snapshot.sourceTenantId || current.targetTenantId !== plan.snapshot.targetTenantId) reasons.push("restore_tenant_mismatch");
    if (manifest.environmentId !== plan.snapshot.sourceEnvironmentId || current.targetEnvironmentId !== plan.snapshot.targetEnvironmentId) reasons.push("restore_environment_mismatch");
    if (current.targetSchemaVersion !== plan.snapshot.targetSchemaVersion
      || current.targetSchemaVersion < manifest.minimumRestoreSchemaVersion
      || current.targetSchemaVersion > manifest.maximumRestoreSchemaVersion) reasons.push("restore_schema_incompatible");
    if (!integrity.encryptionCapabilitySatisfied) reasons.push("encrypted_at_rest_requirement_unmet");
    if (!current.targetClean) reasons.push("restore_target_not_clean");
    if (!current.targetIsolationCurrent) reasons.push("restore_target_isolation_unknown");
    if (!current.effectsDisabled) reasons.push("restore_effects_not_disabled");
    if (current.evaluatedAt < plan.snapshot.createdAt) reasons.push("restore_evaluation_precedes_plan");
    if (current.evaluatedAt >= manifest.deliveryExpiresAt) reasons.push("restore_delivery_expired");
    let replay = false;
    if (receipt) {
      if (receipt.idempotencyKey !== plan.snapshot.idempotencyKey || receipt.planId !== plan.id || receipt.planDigest !== plan.digest) {
        reasons.push("restore_idempotency_conflict");
      } else replay = true;
    }
    const reasonCodes = deepFreeze([...new Set(reasons)].sort());
    return deepFreeze({
      kind: "synthetic_phase7_restore_plan_decision" as const,
      status: reasonCodes.length > 0 ? "rejected" as const : replay ? "replayed_no_authority" as const : "valid_no_authority" as const,
      planId: plan.id,
      planDigest: plan.digest,
      manifestDigest: manifest.manifestDigest,
      reasonCodes,
      wouldRequireDryRun: reasonCodes.length === 0 && !replay,
      replayedReceiptDigest: reasonCodes.length === 0 && replay && receipt ? receipt.receiptDigest : null,
      dryRunPerformed: false as const,
      restoreAuthorized: false as const,
      persistenceAuthorized: false as const,
      effects: ZERO_EFFECTS,
    });
  } catch {
    throw new Error("synthetic_phase7_restore_plan_decision_invalid");
  }
}

function normalizeCurrent(value: unknown) {
  const input = exactRecord(value, ["evaluatedAt", "targetTenantId", "targetEnvironmentId", "targetSchemaVersion", "targetClean", "targetIsolationCurrent", "effectsDisabled"]);
  return deepFreeze({ evaluatedAt: timestamp(input.evaluatedAt), targetTenantId: syntheticId(input.targetTenantId), targetEnvironmentId: syntheticId(input.targetEnvironmentId), targetSchemaVersion: positiveInteger(input.targetSchemaVersion), targetClean: booleanValue(input.targetClean), targetIsolationCurrent: booleanValue(input.targetIsolationCurrent), effectsDisabled: booleanValue(input.effectsDisabled) });
}

function normalizeReceipt(value: unknown) {
  if (value === null) return null;
  const input = exactRecord(value, ["idempotencyKey", "planId", "planDigest", "receiptDigest"]);
  return deepFreeze({ idempotencyKey: syntheticId(input.idempotencyKey), planId: syntheticId(input.planId), planDigest: digestValue(input.planDigest), receiptDigest: digestValue(input.receiptDigest) });
}

function digestValue(value: unknown): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value)) throw new Error("invalid");
  return value;
}
