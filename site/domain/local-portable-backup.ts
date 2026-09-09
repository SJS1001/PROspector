export type PortableRecord = Readonly<{ kind: string; id: string; value: unknown }>;
export type PortableBackupSource = Readonly<{
  workspaceId: string;
  createdAt: string;
  records: readonly PortableRecord[];
  objectDigests: readonly string[];
  suppressionTombstones: readonly PortableRecord[];
}>;

export type EncryptedPortableBackup = Readonly<{
  format: "prospector/local-portable-backup/v1";
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

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
const DIGEST = /^[a-f0-9]{64}$/u;
const FORBIDDEN_KEY = /(?:passphrase|password|secret|credential|oauth|bearer|token)/iu;

export async function createEncryptedLocalBackup(source: PortableBackupSource, passphrase: string): Promise<EncryptedPortableBackup> {
  validatePassphrase(passphrase);
  const canonical = canonicalArchive(source);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt, ["encrypt"]);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: encoder.encode("prospector/local-portable-backup/v1") }, key, encoder.encode(canonical));
  return Object.freeze({
    format: "prospector/local-portable-backup/v1",
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
): Promise<LocalRestoreState> {
  try {
    validateEnvelope(envelope);
    validatePassphrase(passphrase);
    const salt = unbase64(envelope.salt, 16);
    const iv = unbase64(envelope.iv, 12);
    const ciphertext = unbase64(envelope.ciphertext);
    const key = await deriveKey(passphrase, salt, ["decrypt"]);
    const clear = await crypto.subtle.decrypt({ name: "AES-GCM", iv, additionalData: encoder.encode(envelope.format) }, key, ciphertext);
    const canonical = decoder.decode(clear);
    const parsed = JSON.parse(canonical) as PortableBackupSource;
    if (canonicalArchive(parsed) !== canonical) throw new Error("invalid");
    const archiveDigest = await sha256(encoder.encode(canonical));
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
  if (!source || typeof source !== "object" || !/^[\w.:-]{1,256}$/u.test(source.workspaceId) || !Number.isFinite(Date.parse(source.createdAt))) throw new Error("portable_backup_invalid");
  if (!Array.isArray(source.records) || !Array.isArray(source.objectDigests) || !Array.isArray(source.suppressionTombstones)) throw new Error("portable_backup_invalid");
  assertNoSecrets(source);
  if (!source.objectDigests.every((value) => typeof value === "string" && DIGEST.test(value))) throw new Error("portable_backup_invalid");
  const records = canonicalRecords(source.records);
  const tombstones = canonicalRecords(source.suppressionTombstones);
  return JSON.stringify({
    format: "prospector/portable-workspace/v1",
    workspaceId: source.workspaceId,
    createdAt: source.createdAt,
    records,
    objectDigests: [...new Set(source.objectDigests)].sort(),
    suppressionTombstones: tombstones,
    effectsEnabled: false,
  });
}

function canonicalRecords(records: readonly PortableRecord[]) {
  const seen = new Set<string>();
  return records.map((record) => {
    if (!record || typeof record !== "object" || !/^[\w.:-]{1,128}$/u.test(record.kind) || !/^[\w.:-]{1,256}$/u.test(record.id)) throw new Error("portable_backup_invalid");
    const key = `${record.kind}\0${record.id}`;
    if (seen.has(key)) throw new Error("portable_backup_invalid");
    seen.add(key);
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
  if (!value || value.format !== "prospector/local-portable-backup/v1" || value.kdf !== "PBKDF2-SHA-256" || value.iterations !== 210_000 || value.cipher !== "AES-256-GCM") throw new Error("invalid");
}
function base64(value: Uint8Array) { return btoa(String.fromCharCode(...value)); }
function unbase64(value: string, exactLength?: number) {
  if (typeof value !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/u.test(value)) throw new Error("invalid");
  const bytes = Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
  if (exactLength !== undefined && bytes.length !== exactLength) throw new Error("invalid");
  return bytes;
}
async function sha256(value: Uint8Array) { return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", value)), (byte) => byte.toString(16).padStart(2, "0")).join(""); }
function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") { Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); }
  return value;
}
function compareText(left: string, right: string) { return left < right ? -1 : left > right ? 1 : 0; }
