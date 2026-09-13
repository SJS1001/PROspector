import { booleanValue, deepFreeze, exactRecord, syntheticId, timestamp } from "./phase7-backup-contract-helpers";
import { isSyntheticBackupManifest, type SyntheticBackupManifest } from "./phase7-backup-manifest";

const ZERO_EFFECTS = deepFreeze({ filesystemDeletes: 0 as const, storageDeletes: 0 as const, durableMutations: 0 as const, providerCalls: 0 as const });

/** Classifies retention only. It never deletes bytes or grants deletion authority. */
export function decideSyntheticBackupRetention(value: unknown) {
  try {
    const input = exactRecord(value, ["manifest", "current"]);
    if (!isSyntheticBackupManifest(input.manifest)) throw new Error("invalid");
    const manifest = input.manifest as SyntheticBackupManifest;
    const current = normalizeCurrent(input.current);
    const reasons: string[] = [];
    if (current.evaluatedAt < manifest.createdAt) reasons.push("retention_evaluation_precedes_backup");
    if (current.tenantId !== manifest.tenantId) reasons.push("retention_tenant_mismatch");
    if (current.environmentId !== manifest.environmentId) reasons.push("retention_environment_mismatch");
    if (current.policyId !== manifest.retentionPolicyId || current.policyDigest !== manifest.retentionPolicyDigest) reasons.push("retention_policy_mismatch");
    if (!current.policyCurrent) reasons.push("retention_policy_not_current");
    if (!current.custodyStateKnown) reasons.push("retention_custody_unknown");
    if (current.legalHold === null) reasons.push("retention_legal_hold_unknown");
    const reasonCodes = deepFreeze([...new Set(reasons)].sort());
    const rejected = reasonCodes.length > 0;
    const retentionElapsed = current.evaluatedAt >= manifest.retainUntil;
    const deliveryExpired = current.evaluatedAt >= manifest.deliveryExpiresAt;
    const held = current.legalHold === true;
    const disposition = rejected
      ? "retain_fail_closed" as const
      : held
        ? "retain_legal_hold" as const
        : !retentionElapsed
          ? deliveryExpired ? "retain_until_policy_date_delivery_expired" as const : "retain_until_policy_date" as const
          : "eligible_for_custodian_disposal_no_authority" as const;
    return deepFreeze({
      kind: "synthetic_phase7_backup_retention_decision" as const,
      manifestId: manifest.id,
      disposition,
      deliveryExpired,
      retentionElapsed,
      reasonCodes,
      disposalEligibilityMet: !rejected && !held && retentionElapsed,
      custodianDisposalAuthorized: false as const,
      deletionAuthorized: false as const,
      persistenceAuthorized: false as const,
      effects: ZERO_EFFECTS,
    });
  } catch {
    throw new Error("synthetic_phase7_backup_retention_invalid");
  }
}

function normalizeCurrent(value: unknown) {
  const input = exactRecord(value, ["evaluatedAt", "tenantId", "environmentId", "policyId", "policyDigest", "policyCurrent", "custodyStateKnown", "legalHold"]);
  if (input.legalHold !== null && typeof input.legalHold !== "boolean") throw new Error("invalid");
  return deepFreeze({ evaluatedAt: timestamp(input.evaluatedAt), tenantId: syntheticId(input.tenantId), environmentId: syntheticId(input.environmentId), policyId: syntheticId(input.policyId), policyDigest: digestValue(input.policyDigest), policyCurrent: booleanValue(input.policyCurrent), custodyStateKnown: booleanValue(input.custodyStateKnown), legalHold: input.legalHold as boolean | null });
}

function digestValue(value: unknown): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value)) throw new Error("invalid");
  return value;
}
