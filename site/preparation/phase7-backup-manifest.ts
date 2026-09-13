import {
  compareText,
  deepFreeze,
  exactRecord,
  invalid,
  positiveInteger,
  sha256Ascii,
  sha256Bytes,
  syntheticId,
  timestamp,
} from "./phase7-backup-contract-helpers";

const ENTRY_KINDS = ["canonical_records", "content_object", "history", "suppression_tombstones"] as const;
type EntryKind = (typeof ENTRY_KINDS)[number];

export type SyntheticBackupManifest = Readonly<{
  kind: "synthetic_phase7_backup_manifest";
  manifestVersion: 1;
  id: string;
  idempotencyKey: string;
  tenantId: string;
  environmentId: string;
  schemaVersion: number;
  minimumRestoreSchemaVersion: number;
  maximumRestoreSchemaVersion: number;
  createdAt: number;
  deliveryExpiresAt: number;
  retainUntil: number;
  retentionPolicyId: string;
  retentionPolicyDigest: string;
  encryptionCapabilityId: string;
  encryptionCapabilityDigest: string;
  entries: readonly Readonly<{ id: string; kind: EntryKind; byteLength: number; contentDigest: string }>[];
  totalByteLength: number;
  contentDigest: string;
  manifestDigest: string;
  syntheticMetadataOnly: true;
  encryptedArchiveCreated: false;
  persistenceAuthorized: false;
  backupAuthorized: false;
  restoreAuthorized: false;
  deletionAuthorized: false;
}>;

const manifests = new WeakSet<object>();

/** Builds hashes and immutable metadata only; supplied synthetic bytes are never retained. */
export async function buildSyntheticBackupManifest(value: unknown): Promise<SyntheticBackupManifest> {
  try {
    const input = exactRecord(value, [
      "id", "idempotencyKey", "tenantId", "environmentId", "schemaVersion",
      "minimumRestoreSchemaVersion", "maximumRestoreSchemaVersion", "createdAt",
      "deliveryExpiresAt", "retainUntil", "retentionPolicyId", "retentionPolicyDigest", "encryptionCapabilityId",
      "encryptionCapabilityDigest", "entries",
    ]);
    const schemaVersion = positiveInteger(input.schemaVersion);
    const minimumRestoreSchemaVersion = positiveInteger(input.minimumRestoreSchemaVersion);
    const maximumRestoreSchemaVersion = positiveInteger(input.maximumRestoreSchemaVersion);
    const createdAt = timestamp(input.createdAt);
    const deliveryExpiresAt = timestamp(input.deliveryExpiresAt);
    const retainUntil = timestamp(input.retainUntil);
    if (minimumRestoreSchemaVersion > schemaVersion || schemaVersion > maximumRestoreSchemaVersion) invalid();
    if (deliveryExpiresAt <= createdAt || retainUntil < createdAt) invalid();
    if (!Array.isArray(input.entries) || input.entries.length === 0 || input.entries.length > 10_000) invalid();

    const entries = await Promise.all(input.entries.map((entry) => normalizeEntry(entry)));
    entries.sort((left, right) => compareText(`${left.kind}\0${left.id}`, `${right.kind}\0${right.id}`));
    if (new Set(entries.map((entry) => entry.id)).size !== entries.length) invalid();
    const totalByteLength = entries.reduce((total, entry) => total + entry.byteLength, 0);
    if (!Number.isSafeInteger(totalByteLength)) invalid();
    const contentDigest = await sha256Ascii(JSON.stringify(entries));
    const unsigned = {
      kind: "synthetic_phase7_backup_manifest" as const,
      manifestVersion: 1 as const,
      id: syntheticId(input.id),
      idempotencyKey: syntheticId(input.idempotencyKey),
      tenantId: syntheticId(input.tenantId),
      environmentId: syntheticId(input.environmentId),
      schemaVersion,
      minimumRestoreSchemaVersion,
      maximumRestoreSchemaVersion,
      createdAt,
      deliveryExpiresAt,
      retainUntil,
      retentionPolicyId: syntheticId(input.retentionPolicyId),
      retentionPolicyDigest: digestValue(input.retentionPolicyDigest),
      encryptionCapabilityId: syntheticId(input.encryptionCapabilityId),
      encryptionCapabilityDigest: digestValue(input.encryptionCapabilityDigest),
      entries,
      totalByteLength,
      contentDigest,
      syntheticMetadataOnly: true as const,
      encryptedArchiveCreated: false as const,
      persistenceAuthorized: false as const,
      backupAuthorized: false as const,
      restoreAuthorized: false as const,
      deletionAuthorized: false as const,
    };
    const artifact = deepFreeze({ ...unsigned, manifestDigest: await sha256Ascii(JSON.stringify(unsigned)) });
    manifests.add(artifact);
    return artifact;
  } catch {
    throw new Error("synthetic_phase7_backup_manifest_invalid");
  }
}

export function isSyntheticBackupManifest(value: unknown): value is SyntheticBackupManifest {
  return value !== null && typeof value === "object" && manifests.has(value);
}

async function normalizeEntry(value: unknown) {
  const input = exactRecord(value, ["id", "kind", "bytes"]);
  if (typeof input.kind !== "string" || !ENTRY_KINDS.includes(input.kind as EntryKind)) invalid();
  if (!(input.bytes instanceof Uint8Array) || input.bytes.byteLength === 0 || input.bytes.byteLength > 10_000_000) invalid();
  return deepFreeze({
    id: syntheticId(input.id),
    kind: input.kind as EntryKind,
    byteLength: input.bytes.byteLength,
    contentDigest: await sha256Bytes(input.bytes),
  });
}

function digestValue(value: unknown): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value)) invalid();
  return value;
}
