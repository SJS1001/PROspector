export type PortableRecord = Readonly<{ kind: string; id: string; value: unknown }>;
export const PORTABLE_WORKSPACE_SCHEMA_VERSION = "prospector/portable-workspace-schema/v1" as const;

export type SyntheticBackupProvenance = Readonly<{
  kind: "synthetic_disposable";
  snapshotId: string;
  snapshotDigest: string;
  migrationLineageDigest: string;
}>;

export type PortableBackupSource = Readonly<{
  workspaceId: string;
  createdAt: string;
  provenance: SyntheticBackupProvenance;
  records: readonly PortableRecord[];
  objectDigests: readonly string[];
  suppressionTombstones: readonly PortableRecord[];
}>;

export type EncryptedPortableBackup = Readonly<{
  format: "prospector/local-portable-backup/v2";
  kdf: "PBKDF2-SHA-256";
  iterations: 210_000;
  cipher: "AES-256-GCM";
  salt: string;
  iv: string;
  ciphertext: string;
}>;

export type LocalRestoreState = Readonly<{
  workspaceId: string;
  archiveDigest: string | null;
  records: readonly PortableRecord[];
  objectDigests: readonly string[];
  suppressionTombstones: readonly PortableRecord[];
  effectsEnabled: false;
}>;

export type PortableRestoreCompatibilityExpectation = Readonly<{
  workspaceId: string;
  schemaVersion: typeof PORTABLE_WORKSPACE_SCHEMA_VERSION;
  snapshotId: string;
  snapshotDigest: string;
  migrationLineageDigest: string;
}>;

export type PortableRestoreCompatibilityReceipt = Readonly<{
  format: "prospector/local-restore-compatibility-receipt/v1";
  compatibility: "synthetic_contract_match";
  archiveDigest: string;
  workspaceId: string;
  schemaVersion: typeof PORTABLE_WORKSPACE_SCHEMA_VERSION;
  snapshotId: string;
  snapshotDigest: string;
  migrationLineageDigest: string;
  recordCount: number;
  objectDigestCount: number;
  suppressionTombstoneCount: number;
  restoreAuthority: false;
  operationalAuthority: false;
}>;

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
const DIGEST = /^[a-f0-9]{64}$/u;
const ID = /^[\w.:-]{1,256}$/u;
const FORBIDDEN_KEY = /(?:passphrase|password|secret|credential|oauth|bearer|token)/iu;
const SOURCE_KEYS = ["workspaceId", "createdAt", "provenance", "records", "objectDigests", "suppressionTombstones"] as const;
const PROVENANCE_KEYS = ["kind", "snapshotId", "snapshotDigest", "migrationLineageDigest"] as const;
const EXPECTATION_KEYS = ["workspaceId", "schemaVersion", "snapshotId", "snapshotDigest", "migrationLineageDigest"] as const;
const ENVELOPE_KEYS = ["format", "kdf", "iterations", "cipher", "salt", "iv", "ciphertext"] as const;
const ARCHIVE_KEYS = ["format", "schemaVersion", "workspaceId", "createdAt", "provenance", "records", "objectDigests", "suppressionTombstones", "effectsEnabled"] as const;

export async function createEncryptedLocalBackup(source: PortableBackupSource, passphrase: string): Promise<EncryptedPortableBackup> {
  validatePassphrase(passphrase);
  const canonical = canonicalArchive(source);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt, ["encrypt"]);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: encoder.encode("prospector/local-portable-backup/v2") }, key, encoder.encode(canonical));
  return Object.freeze({
    format: "prospector/local-portable-backup/v2",
    kdf: "PBKDF2-SHA-256",
    iterations: 210_000,
    cipher: "AES-256-GCM",
    salt: base64(salt),
    iv: base64(iv),
    ciphertext: base64(new Uint8Array(ciphertext)),
  });
}

export async function restoreEncryptedLocalBackup(
  envelope: EncryptedPortableBackup,
  passphrase: string,
  current: LocalRestoreState,
  expectation: PortableRestoreCompatibilityExpectation,
): Promise<LocalRestoreState> {
  try {
    const { source: parsed, archiveDigest } = await verifyArchive(envelope, passphrase, expectation);
    if (current.workspaceId !== parsed.workspaceId || current.effectsEnabled !== false) throw new Error("invalid");
    if (current.archiveDigest === archiveDigest) {
      const restored = restoredState(parsed, archiveDigest);
      if (JSON.stringify(current) !== JSON.stringify(restored)) throw new Error("invalid");
      return current;
    }
    if (current.archiveDigest !== null || current.records.length || current.objectDigests.length || current.suppressionTombstones.length) throw new Error("invalid");
    return restoredState(parsed, archiveDigest);
  } catch {
    throw new Error("portable_backup_untrusted");
  }
}

/**
 * Decrypts and checks only the synthetic archive contract. The receipt is not
 * target authority, a dry run, an operational restore decision, or evidence
 * that any hosted source or migration exists.
 */
export async function verifyEncryptedLocalBackupCompatibility(
  envelope: EncryptedPortableBackup,
  passphrase: string,
  expectation: PortableRestoreCompatibilityExpectation,
): Promise<PortableRestoreCompatibilityReceipt> {
  try {
    const { source, archiveDigest } = await verifyArchive(envelope, passphrase, expectation);
    return deepFreeze({
      format: "prospector/local-restore-compatibility-receipt/v1" as const,
      compatibility: "synthetic_contract_match" as const,
      archiveDigest,
      workspaceId: source.workspaceId,
      schemaVersion: PORTABLE_WORKSPACE_SCHEMA_VERSION,
      snapshotId: source.provenance.snapshotId,
      snapshotDigest: source.provenance.snapshotDigest,
      migrationLineageDigest: source.provenance.migrationLineageDigest,
      recordCount: source.records.length,
      objectDigestCount: source.objectDigests.length,
      suppressionTombstoneCount: source.suppressionTombstones.length,
      restoreAuthority: false as const,
      operationalAuthority: false as const,
    });
  } catch {
    throw new Error("portable_backup_untrusted");
  }
}

async function verifyArchive(
  envelope: EncryptedPortableBackup,
  passphrase: string,
  expectation: PortableRestoreCompatibilityExpectation,
) {
  validateEnvelope(envelope);
  validateExpectation(expectation);
  validatePassphrase(passphrase);
  const salt = unbase64(envelope.salt, 16);
  const iv = unbase64(envelope.iv, 12);
  const ciphertext = unbase64(envelope.ciphertext);
  const key = await deriveKey(passphrase, salt, ["decrypt"]);
  const clear = await crypto.subtle.decrypt({ name: "AES-GCM", iv, additionalData: encoder.encode(envelope.format) }, key, ciphertext);
  const canonical = decoder.decode(clear);
  const payload = JSON.parse(canonical) as unknown;
  if (!plainExact(payload, ARCHIVE_KEYS) || payload.format !== "prospector/portable-workspace/v2" || payload.schemaVersion !== PORTABLE_WORKSPACE_SCHEMA_VERSION || payload.effectsEnabled !== false) throw new Error("invalid");
  const parsed: PortableBackupSource = {
    workspaceId: payload.workspaceId,
    createdAt: payload.createdAt,
    provenance: payload.provenance,
    records: payload.records,
    objectDigests: payload.objectDigests,
    suppressionTombstones: payload.suppressionTombstones,
  } as PortableBackupSource;
  if (canonicalArchive(parsed) !== canonical) throw new Error("invalid");
  if (
    expectation.workspaceId !== parsed.workspaceId
    || expectation.snapshotId !== parsed.provenance.snapshotId
    || expectation.snapshotDigest !== parsed.provenance.snapshotDigest
    || expectation.migrationLineageDigest !== parsed.provenance.migrationLineageDigest
  ) throw new Error("invalid");
  return { source: parsed, archiveDigest: await sha256(encoder.encode(canonical)) };
}

function restoredState(source: PortableBackupSource, archiveDigest: string): LocalRestoreState {
  return deepFreeze({
    workspaceId: source.workspaceId,
    archiveDigest,
    records: source.records,
    objectDigests: source.objectDigests,
    suppressionTombstones: source.suppressionTombstones,
    effectsEnabled: false as const,
  });
}

function canonicalArchive(source: PortableBackupSource) {
  if (!plainExact(source, SOURCE_KEYS) || !ID.test(source.workspaceId) || !strictUtc(source.createdAt)) throw new Error("portable_backup_invalid");
  if (!Array.isArray(source.records) || !Array.isArray(source.objectDigests) || !Array.isArray(source.suppressionTombstones)) throw new Error("portable_backup_invalid");
  const provenance = canonicalProvenance(source.provenance);
  assertNoSecrets(source);
  if (!source.objectDigests.every((value) => typeof value === "string" && DIGEST.test(value))) throw new Error("portable_backup_invalid");
  const identityIndex = new Set<string>();
  const records = canonicalRecords(source.records, identityIndex, false);
  const tombstones = canonicalRecords(source.suppressionTombstones, identityIndex, true);
  return JSON.stringify({
    format: "prospector/portable-workspace/v2",
    schemaVersion: PORTABLE_WORKSPACE_SCHEMA_VERSION,
    workspaceId: source.workspaceId,
    createdAt: source.createdAt,
    provenance,
    records,
    objectDigests: [...new Set(source.objectDigests)].sort(),
    suppressionTombstones: tombstones,
    effectsEnabled: false,
  });
}

function canonicalProvenance(value: SyntheticBackupProvenance) {
  if (!plainExact(value, PROVENANCE_KEYS) || value.kind !== "synthetic_disposable" || !ID.test(value.snapshotId)) throw new Error("portable_backup_invalid");
  if (!DIGEST.test(value.snapshotDigest) || !DIGEST.test(value.migrationLineageDigest)) throw new Error("portable_backup_invalid");
  return {
    kind: value.kind,
    snapshotId: value.snapshotId,
    snapshotDigest: value.snapshotDigest,
    migrationLineageDigest: value.migrationLineageDigest,
  };
}

function canonicalRecords(records: readonly PortableRecord[], identityIndex: Set<string>, tombstones: boolean) {
  return records.map((record) => {
    if (!plainExact(record, ["kind", "id", "value"]) || !/^[\w.:-]{1,128}$/u.test(record.kind) || !/^[\w.:-]{1,256}$/u.test(record.id)) throw new Error("portable_backup_invalid");
    const key = `${record.kind}\0${record.id}`;
    if (identityIndex.has(key)) throw new Error("portable_backup_invalid");
    identityIndex.add(key);
    if (tombstones && (record.kind !== "suppression" || !plainExact(record.value, ["scopeDigest"]) || typeof record.value.scopeDigest !== "string" || !DIGEST.test(record.value.scopeDigest))) throw new Error("portable_backup_invalid");
    return { kind: record.kind, id: record.id, value: sortValue(record.value) };
  }).sort((left, right) => compareText(`${left.kind}\0${left.id}`, `${right.kind}\0${right.id}`));
}

function sortValue(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.keys(value as object).sort().map((key) => [key, sortValue((value as Record<string, unknown>)[key])]));
  }
  throw new Error("portable_backup_invalid");
}

function assertNoSecrets(value: unknown, key = ""): void {
  if (FORBIDDEN_KEY.test(key)) throw new Error("portable_backup_invalid");
  if (Array.isArray(value)) return value.forEach((item) => assertNoSecrets(item));
  if (value && typeof value === "object") for (const [childKey, child] of Object.entries(value)) assertNoSecrets(child, childKey);
}

async function deriveKey(passphrase: string, salt: Uint8Array, usages: KeyUsage[]) {
  const material = await crypto.subtle.importKey("raw", encoder.encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt, iterations: 210_000 }, material, { name: "AES-GCM", length: 256 }, false, usages);
}

function validatePassphrase(value: string) { if (typeof value !== "string" || value.length < 16 || value.length > 1024) throw new Error("portable_backup_invalid"); }
function validateEnvelope(value: EncryptedPortableBackup) {
  if (!plainExact(value, ENVELOPE_KEYS) || value.format !== "prospector/local-portable-backup/v2" || value.kdf !== "PBKDF2-SHA-256" || value.iterations !== 210_000 || value.cipher !== "AES-256-GCM") throw new Error("invalid");
}
function validateExpectation(value: PortableRestoreCompatibilityExpectation) {
  if (!plainExact(value, EXPECTATION_KEYS) || !ID.test(value.workspaceId) || value.schemaVersion !== PORTABLE_WORKSPACE_SCHEMA_VERSION) throw new Error("invalid");
  if (!ID.test(value.snapshotId) || !DIGEST.test(value.snapshotDigest) || !DIGEST.test(value.migrationLineageDigest)) throw new Error("invalid");
}
function base64(value: Uint8Array) { return btoa(String.fromCharCode(...value)); }
function unbase64(value: string, exactLength?: number) {
  if (typeof value !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/u.test(value)) throw new Error("invalid");
  const bytes = Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
  if (base64(bytes) !== value) throw new Error("invalid");
  if (exactLength !== undefined && bytes.length !== exactLength) throw new Error("invalid");
  return bytes;
}
async function sha256(value: Uint8Array) { return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", value)), (byte) => byte.toString(16).padStart(2, "0")).join(""); }
function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") { Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); }
  return value;
}
function compareText(left: string, right: string) { return left < right ? -1 : left > right ? 1 : 0; }
function strictUtc(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)) return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
}
function plainExact(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  return Reflect.ownKeys(descriptors).every((key) => typeof key === "string")
    && Object.keys(descriptors).sort().join("\0") === [...keys].sort().join("\0")
    && Object.values(descriptors).every((descriptor) => "value" in descriptor);
}
