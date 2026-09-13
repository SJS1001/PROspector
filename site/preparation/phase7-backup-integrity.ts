import { buildSyntheticBackupManifest, isSyntheticBackupManifest, type SyntheticBackupManifest } from "./phase7-backup-manifest";
import { booleanValue, deepFreeze, exactRecord, positiveInteger, syntheticId, timestamp } from "./phase7-backup-contract-helpers";

const ZERO_EFFECTS = deepFreeze({ filesystemReads: 0 as const, filesystemWrites: 0 as const, storageCalls: 0 as const, providerCalls: 0 as const });
const decisions = new WeakSet<object>();

/** Re-hashes caller-supplied synthetic bytes and returns a zero-authority integrity decision. */
export async function verifySyntheticBackupIntegrity(value: unknown) {
  try {
    const input = exactRecord(value, ["manifest", "currentManifestInput", "current"]);
    if (!isSyntheticBackupManifest(input.manifest)) throw new Error("invalid");
    const manifest = input.manifest as SyntheticBackupManifest;
    const current = normalizeCurrent(input.current);
    const recomputed = await buildSyntheticBackupManifest(input.currentManifestInput);
    const reasons: string[] = [];
    if (recomputed.manifestDigest !== manifest.manifestDigest) reasons.push("backup_manifest_or_content_changed");
    if (current.evaluatedAt < manifest.createdAt) reasons.push("integrity_evaluation_precedes_backup");
    if (current.tenantId !== manifest.tenantId) reasons.push("backup_tenant_mismatch");
    if (current.environmentId !== manifest.environmentId) reasons.push("backup_environment_mismatch");
    if (current.schemaVersion !== manifest.schemaVersion) reasons.push("backup_schema_version_mismatch");
    if (current.evaluatedAt >= manifest.deliveryExpiresAt) reasons.push("backup_delivery_expired");
    if (!current.encryptedAtRestSupported) reasons.push("encrypted_at_rest_capability_unavailable");
    if (!current.authenticatedEncryptionSupported) reasons.push("authenticated_encryption_capability_unavailable");
    if (!current.capabilityCurrent) reasons.push("encryption_capability_not_current");
    if (current.encryptionCapabilityId !== manifest.encryptionCapabilityId
      || current.encryptionCapabilityDigest !== manifest.encryptionCapabilityDigest) {
      reasons.push("encryption_capability_mismatch");
    }
    const reasonCodes = deepFreeze([...new Set(reasons)].sort());
    const encryptionCapabilitySatisfied = !reasonCodes.some((reason) => [
      "encrypted_at_rest_capability_unavailable",
      "authenticated_encryption_capability_unavailable",
      "encryption_capability_not_current",
      "encryption_capability_mismatch",
    ].includes(reason));
    const decision = deepFreeze({
      kind: "synthetic_phase7_backup_integrity_decision" as const,
      status: reasonCodes.length === 0 ? "verified_no_authority" as const : "rejected" as const,
      manifestId: manifest.id,
      manifestDigest: manifest.manifestDigest,
      contentDigest: reasonCodes.length === 0 ? manifest.contentDigest : null,
      tenantId: manifest.tenantId,
      environmentId: manifest.environmentId,
      schemaVersion: manifest.schemaVersion,
      reasonCodes,
      integrityVerified: reasonCodes.length === 0,
      encryptionCapabilitySatisfied,
      backupAuthorized: false as const,
      restoreAuthorized: false as const,
      persistenceAuthorized: false as const,
      effects: ZERO_EFFECTS,
    });
    decisions.add(decision);
    return decision;
  } catch {
    throw new Error("synthetic_phase7_backup_integrity_invalid");
  }
}

export function isSyntheticBackupIntegrityDecision(value: unknown): value is Awaited<ReturnType<typeof verifySyntheticBackupIntegrity>> {
  return value !== null && typeof value === "object" && decisions.has(value);
}

function normalizeCurrent(value: unknown) {
  const input = exactRecord(value, [
    "evaluatedAt", "tenantId", "environmentId", "schemaVersion", "encryptedAtRestSupported",
    "authenticatedEncryptionSupported", "capabilityCurrent", "encryptionCapabilityId",
    "encryptionCapabilityDigest",
  ]);
  return deepFreeze({
    evaluatedAt: timestamp(input.evaluatedAt),
    tenantId: syntheticId(input.tenantId),
    environmentId: syntheticId(input.environmentId),
    schemaVersion: positiveInteger(input.schemaVersion),
    encryptedAtRestSupported: booleanValue(input.encryptedAtRestSupported),
    authenticatedEncryptionSupported: booleanValue(input.authenticatedEncryptionSupported),
    capabilityCurrent: booleanValue(input.capabilityCurrent),
    encryptionCapabilityId: syntheticId(input.encryptionCapabilityId),
    encryptionCapabilityDigest: digestValue(input.encryptionCapabilityDigest),
  });
}

function digestValue(value: unknown): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value)) throw new Error("invalid");
  return value;
}
