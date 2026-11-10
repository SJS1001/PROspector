/**
 * Plan 07-08 Task 1: the canonical workspace archive and its authenticated
 * encrypted envelope.
 *
 * Crypto follows owner-delegated decision D-4 (2026-11-10) exactly: the key is
 * derived with scrypt (N = 2^17, r = 8, p = 1, 32-byte key, 16-byte random
 * salt) from the runtime's built-in `node:crypto`, and the payload is sealed
 * with AES-256-GCM (12-byte random nonce, 128-bit tag) through WebCrypto. The
 * canonical JSON of every header field is the GCM additional data, so a
 * relabelled header fails authentication. The scrypt password is the UTF-8
 * encoding of the passphrase's NFC form. Only this one version is accepted;
 * any other format, KDF, parameter, or cipher is refused before a key is
 * derived.
 *
 * The passphrase and the derived key exist only in operation memory. Neither is
 * returned, logged, audited, or written to D1 or object metadata. Workspace,
 * owner, reauthentication, and delivery expiry all come from server ports.
 */
import { scrypt } from "node:crypto";
import type {
  ArchiveEntry,
  ArchiveObjectRef,
  ArchiveStreamEntry,
  RandomSource,
  RecoveryAuthority,
  WorkspaceArchivePorts,
  WorkspaceArchiveSnapshot,
} from "./ports/workspace-archive";

export const ARCHIVE_FORMAT_VERSION = "prospector/portable-workspace-archive/v1" as const;
export const WORKSPACE_ARCHIVE_SCHEMA_VERSION = "prospector/portable-workspace-schema/v1" as const;
export const ARCHIVE_CIPHER = "aes-256-gcm" as const;
export const ARCHIVE_KDF = Object.freeze({ name: "scrypt", N: 131072, r: 8, p: 1, keyLength: 32, memoryHard: true } as const);

/** The one refusal for every failure before or at authentication: shape, version, passphrase, tag, or ciphertext. */
export class WorkspaceArchiveUntrustedError extends Error {
  constructor() {
    super("workspace_archive_untrusted");
    this.name = "WorkspaceArchiveUntrustedError";
  }
}

export type ArchiveManifestSection = Readonly<{ count: number; digest: string }>;
export type ArchiveManifest = Readonly<{
  format: typeof MANIFEST_FORMAT;
  schemaVersion: string;
  workspaceId: string;
  sections: Readonly<Record<SectionName, ArchiveManifestSection>>;
  digest: string;
}>;

export type SealedWorkspaceArchive = Readonly<{
  format: typeof ARCHIVE_FORMAT_VERSION;
  schemaVersion: string;
  compatibility: Readonly<{ min: string; max: string }>;
  sourceWorkspaceId: string;
  createdAt: string;
  manifestDigest: string;
  cipher: typeof ARCHIVE_CIPHER;
  kdf: Readonly<typeof ARCHIVE_KDF & { salt: string }>;
  iv: string;
  ciphertext: string;
  tag: string;
}>;

export type OpenedArchiveObject = Readonly<{ digest: string; byteLength: number; mediaType: string; bytes: Uint8Array }>;
export type OpenedWorkspaceArchive = Readonly<{
  sourceWorkspaceId: string;
  schemaVersion: string;
  compatibility: Readonly<{ min: string; max: string }>;
  createdAt: string;
  manifest: ArchiveManifest;
  sections: Readonly<{
    records: readonly ArchiveEntry[];
    decisions: readonly ArchiveEntry[];
    history: readonly ArchiveStreamEntry[];
    audit: readonly ArchiveStreamEntry[];
    objects: readonly OpenedArchiveObject[];
    dependencies: readonly ArchiveEntry[];
    exportArtifacts: readonly ArchiveEntry[];
    tombstones: readonly ArchiveEntry[];
  }>;
  counts: Readonly<{ recordCount: number; objectCount: number; tombstoneCount: number }>;
}>;

export type CreatedWorkspaceArchive = Readonly<{
  archiveId: string;
  manifestDigest: string;
  ciphertextSha256: string;
  deliveryExpiresAt: number;
  envelope: SealedWorkspaceArchive;
}>;

type SectionName = (typeof SECTIONS)[number];

const SECTIONS = ["records", "decisions", "history", "audit", "objects", "dependencies", "exportArtifacts", "tombstones"] as const;
const IDENTIFIED_SECTIONS = ["records", "decisions", "dependencies", "exportArtifacts", "tombstones"] as const;
const STREAM_SECTIONS = ["history", "audit"] as const;
const SNAPSHOT_KEYS = ["workspaceId", "schemaVersion", ...SECTIONS] as const;
const HEADER_KEYS = ["format", "schemaVersion", "compatibility", "sourceWorkspaceId", "createdAt", "manifestDigest", "cipher", "kdf", "iv"] as const;
const ENVELOPE_KEYS = [...HEADER_KEYS, "ciphertext", "tag"] as const;
const KDF_KEYS = ["name", "N", "r", "p", "keyLength", "memoryHard", "salt"] as const;
const PAYLOAD_KEYS = ["format", "createdAt", "manifest", "sections"] as const;
const MANIFEST_KEYS = ["format", "schemaVersion", "workspaceId", "sections", "digest"] as const;
const MANIFEST_FORMAT = "prospector/portable-workspace-manifest/v1" as const;
const PAYLOAD_FORMAT = "prospector/portable-workspace-payload/v1" as const;
/** Ordered oldest to newest; restore compatibility ranges are indexes into this list. */
const SUPPORTED_SCHEMA_VERSIONS: readonly string[] = Object.freeze([WORKSPACE_ARCHIVE_SCHEMA_VERSION]);

const SCRYPT_MAXMEM = 256 * 1024 * 1024;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const MAX_PLAINTEXT_BYTES = 64 * 1024 * 1024;
const MAX_ENTRIES = 100_000;
const MAX_VALUE_DEPTH = 32;
const REAUTH_MAX_AGE_MS = 15 * 60 * 1000;
const DELIVERY_TTL_MS = 24 * 60 * 60 * 1000;

const ID = /^[A-Za-z0-9](?:[A-Za-z0-9._:-]{0,126}[A-Za-z0-9])?$/u;
const KIND = /^[a-z][a-z0-9_]{0,63}$/u;
const DIGEST = /^[a-f0-9]{64}$/u;
const MEDIA_TYPE = /^[a-z]+\/[a-z0-9.+-]{1,64}$/u;
const SECRET_KEY = /passphrase|password|secret|credential|oauth|bearer|token|cookie|authorization|private.?key|api.?key/iu;
const OBJECT_REFERENCE_KEY = /^(?:objectDigest|[A-Za-z0-9]+ObjectDigest)$/u;
const TOMBSTONE_KINDS = new Set(["suppression", "deletion"]);

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

/** Builds the public, canonical manifest: per-section counts and digests only, never section contents. */
export async function buildArchiveManifest(snapshot: WorkspaceArchiveSnapshot): Promise<ArchiveManifest> {
  return manifestFor(canonicalSnapshot(snapshot));
}

/**
 * Creates one sealed archive for the server-admitted owner workspace. Input is
 * exactly `{ passphrase, ports }`; any request-supplied scope is refused.
 */
export async function createWorkspaceArchive(input: Readonly<{ passphrase: string; ports: WorkspaceArchivePorts }>): Promise<CreatedWorkspaceArchive> {
  if (!plainExact(input, ["passphrase", "ports"]) || !validPassphrase(input.passphrase) || !validArchivePorts(input.ports)) {
    throw new Error("archive_request_invalid");
  }
  const { passphrase, ports } = input;
  const refuse = async (reason: string): Promise<never> => {
    try {
      await ports.evidence.recordRefusal({ action: "archive.create", subjectKind: "workspace", subjectId: null, reasonCode: reason });
    } catch {
      // A refusal audit failure never turns a refusal into anything else.
    }
    throw new Error(reason);
  };

  const now = ports.now();
  if (!Number.isSafeInteger(now) || now <= 0) return refuse("archive_request_invalid");
  const authority = await ports.authority.current();
  if (!validAuthority(authority)) return refuse("not_authorized");
  if (!freshReauthentication(authority, now)) return refuse("reauthentication_required");

  let canonical: CanonicalSections;
  try {
    const snapshot = await ports.source.readSnapshot();
    canonical = canonicalSnapshot(snapshot);
    if (canonical.workspaceId !== authority.workspaceId) throw new Error("archive_source_invalid");
  } catch {
    return refuse("archive_source_invalid");
  }

  const objects: OpenedArchiveObject[] = [];
  for (const ref of canonical.objects) {
    const bytes = await ports.source.readObject(ref.digest);
    if (!(bytes instanceof Uint8Array) || bytes.byteLength !== ref.byteLength || await sha256Hex(bytes) !== ref.digest) return refuse("archive_object_missing");
    objects.push({ ...ref, bytes });
  }
  const objectProblem = objectReferenceProblem(canonical, objects);
  if (objectProblem) return refuse("archive_object_missing");
  if (!invariantsHold(canonical)) return refuse("archive_invariant_failed");

  const manifest = await manifestFor(canonical);
  const createdAt = new Date(now).toISOString();
  const payload = {
    format: PAYLOAD_FORMAT,
    createdAt,
    manifest,
    sections: {
      records: canonical.records,
      decisions: canonical.decisions,
      history: canonical.history,
      audit: canonical.audit,
      objects: objects.map((object) => ({ digest: object.digest, byteLength: object.byteLength, mediaType: object.mediaType, bytes: toBase64(object.bytes) })),
      dependencies: canonical.dependencies,
      exportArtifacts: canonical.exportArtifacts,
      tombstones: canonical.tombstones,
    },
  };
  const plaintext = encoder.encode(canonicalJson(payload));
  if (plaintext.byteLength > MAX_PLAINTEXT_BYTES) return refuse("archive_too_large");

  const random = ports.random ?? defaultRandom;
  const salt = randomExact(random, SALT_BYTES);
  const iv = randomExact(random, IV_BYTES);
  const header = {
    format: ARCHIVE_FORMAT_VERSION,
    schemaVersion: canonical.schemaVersion,
    compatibility: { min: canonical.schemaVersion, max: canonical.schemaVersion },
    sourceWorkspaceId: canonical.workspaceId,
    createdAt,
    manifestDigest: manifest.digest,
    cipher: ARCHIVE_CIPHER,
    kdf: { ...ARCHIVE_KDF, salt: toHex(salt) },
    iv: toHex(iv),
  };
  const key = await deriveKey(passphrase, salt, ["encrypt"]);
  const sealed = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource, additionalData: encoder.encode(canonicalJson(header)) as BufferSource, tagLength: TAG_BYTES * 8 },
    key,
    plaintext as BufferSource,
  ));
  const envelope: SealedWorkspaceArchive = deepFreeze({
    ...header,
    ciphertext: toBase64(sealed.subarray(0, sealed.byteLength - TAG_BYTES)),
    tag: toBase64(sealed.subarray(sealed.byteLength - TAG_BYTES)),
  });
  const envelopeBytes = encoder.encode(JSON.stringify(envelope));
  const ciphertextSha256 = await sha256Hex(envelopeBytes);
  const objectKey = `recovery/archives/${ciphertextSha256}.json`;

  await ports.archiveStore.putImmutable(objectKey, envelopeBytes, {
    formatVersion: ARCHIVE_FORMAT_VERSION,
    ciphertextSha256,
    byteLength: envelopeBytes.byteLength,
  });
  const manifestBody = { format: manifest.format, schemaVersion: manifest.schemaVersion, workspaceId: manifest.workspaceId, sections: manifest.sections };
  const recorded = await ports.evidence.recordArchive({
    formatVersion: ARCHIVE_FORMAT_VERSION,
    schemaVersion: canonical.schemaVersion,
    compatibilityMin: canonical.schemaVersion,
    compatibilityMax: canonical.schemaVersion,
    manifest: manifestBody,
    ciphertextSha256,
    byteLength: envelopeBytes.byteLength,
    objectKey,
    cipher: ARCHIVE_CIPHER,
    kdf: ARCHIVE_KDF.name,
    kdfParameters: { ...ARCHIVE_KDF, salt: header.kdf.salt },
    recordCount: restoredRowCount(canonical),
    objectCount: objects.length,
    tombstoneCount: canonical.tombstones.length,
    reauthReferenceDigest: authority.reauthReferenceDigest,
    idempotencyKey: `archive.${ciphertextSha256.slice(0, 32)}`,
  });
  const deliveryExpiresAt = now + DELIVERY_TTL_MS;
  await ports.evidence.recordDeliveryEvent({
    subjectKind: "recovery_archive",
    subjectId: recorded.id,
    eventKind: "issued",
    expiresAt: deliveryExpiresAt,
    reasonCode: "archive_issued",
    occurredAt: now,
    idempotencyKey: `archive-delivery.${ciphertextSha256.slice(0, 32)}`,
  });
  return deepFreeze({ archiveId: recorded.id, manifestDigest: manifest.digest, ciphertextSha256, deliveryExpiresAt, envelope });
}

/**
 * Authenticates, decrypts, and verifies one sealed archive. Every failure up to
 * and including authentication is the single `workspace_archive_untrusted`
 * refusal. With the right passphrase, a payload whose objects are absent or
 * altered is `archive_object_missing`, and one that breaks a referential or
 * append-only invariant is `archive_invariant_failed`.
 */
export async function openWorkspaceArchive(envelope: unknown, passphrase: unknown): Promise<OpenedWorkspaceArchive> {
  let opened: Readonly<{ header: Readonly<Record<string, unknown>>; canonical: CanonicalSections; objects: OpenedArchiveObject[]; manifest: ArchiveManifest; createdAt: string }>;
  try {
    opened = await authenticate(envelope, passphrase);
  } catch {
    throw new WorkspaceArchiveUntrustedError();
  }
  const { canonical, objects, manifest, createdAt, header } = opened;
  if (objectReferenceProblem(canonical, objects)) throw new Error("archive_object_missing");
  if (!invariantsHold(canonical)) throw new Error("archive_invariant_failed");
  const compatibility = header.compatibility as { min: string; max: string };
  return deepFreeze({
    sourceWorkspaceId: canonical.workspaceId,
    schemaVersion: canonical.schemaVersion,
    compatibility: { min: compatibility.min, max: compatibility.max },
    createdAt,
    manifest,
    sections: {
      records: canonical.records,
      decisions: canonical.decisions,
      history: canonical.history,
      audit: canonical.audit,
      objects,
      dependencies: canonical.dependencies,
      exportArtifacts: canonical.exportArtifacts,
      tombstones: canonical.tombstones,
    },
    counts: { recordCount: restoredRowCount(canonical), objectCount: objects.length, tombstoneCount: canonical.tombstones.length },
  });
}

async function authenticate(envelope: unknown, passphrase: unknown) {
  if (!plainExact(envelope, ENVELOPE_KEYS) || !validPassphrase(passphrase)) throw new Error("invalid");
  const header = Object.fromEntries(HEADER_KEYS.map((key) => [key, envelope[key]]));
  const kdf = envelope.kdf;
  const compatibility = envelope.compatibility;
  if (
    envelope.format !== ARCHIVE_FORMAT_VERSION || envelope.cipher !== ARCHIVE_CIPHER
    || !supportedVersion(envelope.schemaVersion) || !plainExact(compatibility, ["min", "max"])
    || !supportedVersion(compatibility.min) || !supportedVersion(compatibility.max)
    || versionIndex(compatibility.min) > versionIndex(compatibility.max)
    || versionIndex(envelope.schemaVersion as string) < versionIndex(compatibility.min) || versionIndex(envelope.schemaVersion as string) > versionIndex(compatibility.max)
    || !validId(envelope.sourceWorkspaceId) || !strictUtc(envelope.createdAt) || !validDigest(envelope.manifestDigest)
    || !plainExact(kdf, KDF_KEYS) || kdf.name !== ARCHIVE_KDF.name || kdf.N !== ARCHIVE_KDF.N || kdf.r !== ARCHIVE_KDF.r
    || kdf.p !== ARCHIVE_KDF.p || kdf.keyLength !== ARCHIVE_KDF.keyLength || kdf.memoryHard !== true
  ) throw new Error("invalid");
  const salt = fromHex(kdf.salt, SALT_BYTES);
  const iv = fromHex(envelope.iv, IV_BYTES);
  const ciphertext = fromBase64(envelope.ciphertext);
  const tag = fromBase64(envelope.tag);
  if (tag.byteLength !== TAG_BYTES || ciphertext.byteLength === 0 || ciphertext.byteLength > MAX_PLAINTEXT_BYTES) throw new Error("invalid");
  const sealed = new Uint8Array(ciphertext.byteLength + TAG_BYTES);
  sealed.set(ciphertext);
  sealed.set(tag, ciphertext.byteLength);
  const key = await deriveKey(passphrase, salt, ["decrypt"]);
  const clear = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv as BufferSource, additionalData: encoder.encode(canonicalJson(header)) as BufferSource, tagLength: TAG_BYTES * 8 },
    key,
    sealed as BufferSource,
  );
  const text = decoder.decode(clear);
  const payload = JSON.parse(text) as unknown;
  if (!plainExact(payload, PAYLOAD_KEYS) || payload.format !== PAYLOAD_FORMAT || payload.createdAt !== envelope.createdAt) throw new Error("invalid");
  if (!plainExact(payload.manifest, MANIFEST_KEYS) || !plainExact(payload.sections, SECTIONS)) throw new Error("invalid");
  const sections = payload.sections;
  if (!Array.isArray(sections.objects)) throw new Error("invalid");
  const objects: OpenedArchiveObject[] = [];
  const refs: ArchiveObjectRef[] = [];
  for (const object of sections.objects) {
    if (!plainExact(object, ["digest", "byteLength", "mediaType", "bytes"])) throw new Error("invalid");
    const bytes = fromBase64(object.bytes, true);
    const ref = { digest: object.digest, byteLength: object.byteLength, mediaType: object.mediaType } as ArchiveObjectRef;
    refs.push(ref);
    objects.push({ ...ref, bytes });
  }
  const canonical = canonicalSnapshot({
    workspaceId: payload.manifest.workspaceId,
    schemaVersion: payload.manifest.schemaVersion,
    ...sections,
    objects: refs,
  });
  const manifest = await manifestFor(canonical);
  const rebuilt = {
    format: PAYLOAD_FORMAT,
    createdAt: payload.createdAt,
    manifest,
    sections: {
      ...Object.fromEntries(SECTIONS.map((name) => [name, canonical[name]])),
      objects: objects.map((object) => ({ digest: object.digest, byteLength: object.byteLength, mediaType: object.mediaType, bytes: toBase64(object.bytes) })),
    },
  };
  // Exact canonical bytes only: a reordered, re-keyed, or extended payload is not this format.
  if (canonicalJson(rebuilt) !== text) throw new Error("invalid");
  if (
    manifest.digest !== envelope.manifestDigest || canonical.workspaceId !== envelope.sourceWorkspaceId
    || canonical.schemaVersion !== envelope.schemaVersion
  ) throw new Error("invalid");
  return { header, canonical, objects, manifest, createdAt: payload.createdAt as string };
}

// -- Canonical sections ------------------------------------------------------

type CanonicalSections = Readonly<{
  workspaceId: string;
  schemaVersion: string;
  records: ArchiveEntry[];
  decisions: ArchiveEntry[];
  history: ArchiveStreamEntry[];
  audit: ArchiveStreamEntry[];
  objects: ArchiveObjectRef[];
  dependencies: ArchiveEntry[];
  exportArtifacts: ArchiveEntry[];
  tombstones: ArchiveEntry[];
}>;

/** Validates shape and secrets, then orders every section. Duplicates stay adjacent for the invariant check. */
function canonicalSnapshot(snapshot: unknown): CanonicalSections {
  if (!plainExact(snapshot, SNAPSHOT_KEYS) || !validId(snapshot.workspaceId) || !supportedVersion(snapshot.schemaVersion)) throw new Error("archive_source_invalid");
  for (const name of SECTIONS) {
    const section = snapshot[name];
    if (!Array.isArray(section) || Object.getPrototypeOf(section) !== Array.prototype || section.length > MAX_ENTRIES) throw new Error("archive_source_invalid");
  }
  const identified = (name: (typeof IDENTIFIED_SECTIONS)[number]) => (snapshot[name] as unknown[]).map((entry) => {
    if (!plainExact(entry, ["kind", "id", "value"]) || !validKind(entry.kind) || !validId(entry.id)) throw new Error("archive_source_invalid");
    if (name === "tombstones" && !validTombstone(entry)) throw new Error("archive_source_invalid");
    return { kind: entry.kind, id: entry.id, value: canonicalValue(entry.value, 0) };
  }).sort((left, right) => compareTuple([left.kind, left.id], [right.kind, right.id]));
  const streamed = (name: (typeof STREAM_SECTIONS)[number]) => (snapshot[name] as unknown[]).map((entry) => {
    if (!plainExact(entry, ["stream", "sequence", "id", "value"]) || !validStream(entry.stream) || !positiveInteger(entry.sequence) || !validId(entry.id)) throw new Error("archive_source_invalid");
    return { stream: entry.stream, sequence: entry.sequence, id: entry.id, value: canonicalValue(entry.value, 0) };
  }).sort((left, right) => compareTuple([left.stream], [right.stream]) || left.sequence - right.sequence);
  const objects = (snapshot.objects as unknown[]).map((entry) => {
    if (!plainExact(entry, ["digest", "byteLength", "mediaType"]) || !validDigest(entry.digest) || !nonNegativeInteger(entry.byteLength)
      || (entry.byteLength as number) > MAX_PLAINTEXT_BYTES || typeof entry.mediaType !== "string" || !MEDIA_TYPE.test(entry.mediaType)) throw new Error("archive_source_invalid");
    return { digest: entry.digest, byteLength: entry.byteLength as number, mediaType: entry.mediaType };
  }).sort((left, right) => compareTuple([left.digest], [right.digest]));
  return {
    workspaceId: snapshot.workspaceId,
    schemaVersion: snapshot.schemaVersion,
    records: identified("records"),
    decisions: identified("decisions"),
    history: streamed("history"),
    audit: streamed("audit"),
    objects,
    dependencies: identified("dependencies"),
    exportArtifacts: identified("exportArtifacts"),
    tombstones: identified("tombstones"),
  };
}

async function manifestFor(canonical: CanonicalSections): Promise<ArchiveManifest> {
  const sections = {} as Record<SectionName, ArchiveManifestSection>;
  for (const name of SECTIONS) {
    const entries = canonical[name] as readonly unknown[];
    sections[name] = { count: entries.length, digest: await sha256Hex(encoder.encode(canonicalJson(entries))) };
  }
  const body = { format: MANIFEST_FORMAT, schemaVersion: canonical.schemaVersion, workspaceId: canonical.workspaceId, sections };
  return deepFreeze({ ...body, digest: await sha256Hex(encoder.encode(canonicalJson(body))) });
}

/** True when an object is declared twice, or a value references an object the archive does not hold. */
function objectReferenceProblem(canonical: CanonicalSections, objects: readonly ArchiveObjectRef[]): boolean {
  const held = new Set(objects.map((object) => object.digest));
  if (held.size !== canonical.objects.length || held.size !== objects.length) return true;
  for (const declared of canonical.objects) if (!held.has(declared.digest)) return true;
  for (const artifact of canonical.exportArtifacts) {
    const value = artifact.value as Record<string, unknown> | null;
    if (!value || typeof value !== "object" || Array.isArray(value) || !validDigest(value.objectDigest)) return true;
  }
  let missing = false;
  const visit = (value: unknown): void => {
    if (missing) return;
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (value && typeof value === "object") {
      for (const [key, child] of Object.entries(value)) {
        if (OBJECT_REFERENCE_KEY.test(key) && (typeof child !== "string" || !held.has(child))) { missing = true; return; }
        visit(child);
      }
    }
  };
  for (const name of [...IDENTIFIED_SECTIONS, ...STREAM_SECTIONS]) for (const entry of canonical[name]) visit(entry.value);
  return missing;
}

/** Unique identities, append-only gap-free streams that name an archived subject, and decisions about archived subjects. */
function invariantsHold(canonical: CanonicalSections): boolean {
  const subjects = new Set<string>();
  for (const name of IDENTIFIED_SECTIONS) {
    const seen = new Set<string>();
    for (const entry of canonical[name]) {
      const identity = `${entry.kind}\u0000${entry.id}`;
      if (seen.has(identity)) return false;
      seen.add(identity);
      if (name !== "tombstones") subjects.add(`${entry.kind}:${entry.id}`);
    }
  }
  for (const decision of canonical.decisions) {
    const value = decision.value as Record<string, unknown> | null;
    if (value && typeof value === "object" && !Array.isArray(value) && ("subjectKind" in value || "subjectId" in value)) {
      if (typeof value.subjectKind !== "string" || typeof value.subjectId !== "string" || !subjects.has(`${value.subjectKind}:${value.subjectId}`)) return false;
    }
  }
  for (const name of STREAM_SECTIONS) {
    const ids = new Set<string>();
    const next = new Map<string, number>();
    for (const entry of canonical[name]) {
      if (ids.has(entry.id)) return false;
      ids.add(entry.id);
      const expected = next.get(entry.stream) ?? 1;
      if (entry.sequence !== expected) return false;
      next.set(entry.stream, expected + 1);
      if (entry.stream !== "workspace" && !subjects.has(entry.stream)) return false;
    }
  }
  return true;
}

function restoredRowCount(canonical: CanonicalSections) {
  return [...IDENTIFIED_SECTIONS, ...STREAM_SECTIONS].reduce((total, name) => total + canonical[name].length, 0);
}

function validTombstone(entry: Record<string, unknown>) {
  const value = entry.value as Record<string, unknown>;
  if (!TOMBSTONE_KINDS.has(entry.kind as string) || !plainObject(value)) return false;
  const keys = Object.keys(value);
  return keys.every((key) => key === "scopeDigest" || key === "scopeKind") && validDigest(value.scopeDigest)
    && (!("scopeKind" in value) || validKind(value.scopeKind));
}

/** Plain JSON only, keys sorted, any secret-like key refused at every depth. */
function canonicalValue(value: unknown, depth: number): unknown {
  if (depth > MAX_VALUE_DEPTH) throw new Error("archive_source_invalid");
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return Object.is(value, -0) ? 0 : value;
  if (Array.isArray(value) && Object.getPrototypeOf(value) === Array.prototype) return value.map((item) => canonicalValue(item, depth + 1));
  if (plainObject(value)) {
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Reflect.ownKeys(descriptors).some((key) => typeof key !== "string") || Object.values(descriptors).some((descriptor) => !("value" in descriptor))) throw new Error("archive_source_invalid");
    return Object.fromEntries(Object.keys(value).sort().map((key) => {
      if (SECRET_KEY.test(key)) throw new Error("archive_source_invalid");
      return [key, canonicalValue(value[key], depth + 1)];
    }));
  }
  throw new Error("archive_source_invalid");
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

// -- Crypto ------------------------------------------------------------------

/** scrypt from the runtime's built-in crypto; the raw key bytes are zeroed once imported as a non-extractable key. */
async function deriveKey(passphrase: string, salt: Uint8Array, usages: KeyUsage[]): Promise<CryptoKey> {
  const secret = encoder.encode(passphrase.normalize("NFC"));
  const raw = await new Promise<Uint8Array>((resolve, reject) => {
    scrypt(secret, salt, ARCHIVE_KDF.keyLength, { N: ARCHIVE_KDF.N, r: ARCHIVE_KDF.r, p: ARCHIVE_KDF.p, maxmem: SCRYPT_MAXMEM }, (error, key) => {
      secret.fill(0);
      if (error) reject(error);
      else resolve(new Uint8Array(key.buffer, key.byteOffset, key.byteLength));
    });
  });
  try {
    return await crypto.subtle.importKey("raw", raw as BufferSource, { name: "AES-GCM" }, false, usages);
  } finally {
    raw.fill(0);
  }
}

const defaultRandom: RandomSource = (length) => crypto.getRandomValues(new Uint8Array(length));

function randomExact(random: RandomSource, length: number) {
  const bytes = random(length);
  if (!(bytes instanceof Uint8Array) || bytes.byteLength !== length) throw new Error("archive_request_invalid");
  return Uint8Array.from(bytes);
}

async function sha256Hex(bytes: Uint8Array) {
  return toHex(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as BufferSource)));
}

// -- Validation and encoding -------------------------------------------------

function validArchivePorts(ports: unknown): ports is WorkspaceArchivePorts {
  if (!plainObject(ports)) return false;
  const value = ports as Record<string, Record<string, unknown> | unknown>;
  const has = (owner: unknown, name: string) => Boolean(owner) && typeof (owner as Record<string, unknown>)[name] === "function";
  return typeof value.now === "function" && (value.random === undefined || typeof value.random === "function")
    && has(value.authority, "current") && has(value.source, "readSnapshot") && has(value.source, "readObject")
    && has(value.archiveStore, "putImmutable") && has(value.evidence, "recordArchive")
    && has(value.evidence, "recordDeliveryEvent") && has(value.evidence, "recordRefusal");
}

function validAuthority(value: unknown): value is RecoveryAuthority {
  return plainObject(value) && validId(value.workspaceId) && typeof value.ownerSubject === "string" && value.ownerSubject.length > 0
    && positiveInteger(value.reauthenticatedAt) && validDigest(value.reauthReferenceDigest);
}

function freshReauthentication(authority: RecoveryAuthority, now: number) {
  return authority.reauthenticatedAt <= now && now - authority.reauthenticatedAt <= REAUTH_MAX_AGE_MS;
}

function validPassphrase(value: unknown): value is string {
  return typeof value === "string" && value.length >= 16 && value.length <= 1024;
}

function supportedVersion(value: unknown): value is string {
  return typeof value === "string" && SUPPORTED_SCHEMA_VERSIONS.includes(value);
}

function versionIndex(value: string) {
  return SUPPORTED_SCHEMA_VERSIONS.indexOf(value);
}

function validStream(value: unknown): value is string {
  if (value === "workspace") return true;
  if (typeof value !== "string") return false;
  const split = value.indexOf(":");
  return split > 0 && validKind(value.slice(0, split)) && validId(value.slice(split + 1));
}

function toHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function fromHex(value: unknown, length: number) {
  if (typeof value !== "string" || value.length !== length * 2 || !/^[a-f0-9]+$/u.test(value)) throw new Error("invalid");
  return Uint8Array.from({ length }, (_, index) => Number.parseInt(value.slice(index * 2, index * 2 + 2), 16));
}

function toBase64(bytes: Uint8Array) {
  let binary = "";
  for (let offset = 0; offset < bytes.byteLength; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function fromBase64(value: unknown, allowEmpty = false) {
  if (typeof value !== "string" || (!allowEmpty && value.length === 0) || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value)) throw new Error("invalid");
  const binary = atob(value);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  if (toBase64(bytes) !== value) throw new Error("invalid");
  return bytes;
}

function strictUtc(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)) return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
}

function compareTuple(left: readonly string[], right: readonly string[]) {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return left[index] < right[index] ? -1 : 1;
  }
  return 0;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !ArrayBuffer.isView(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function validId(value: unknown): value is string { return typeof value === "string" && ID.test(value); }
function validKind(value: unknown): value is string { return typeof value === "string" && KIND.test(value); }
function validDigest(value: unknown): value is string { return typeof value === "string" && DIGEST.test(value); }
function positiveInteger(value: unknown): value is number { return Number.isSafeInteger(value) && (value as number) > 0; }
function nonNegativeInteger(value: unknown): value is number { return Number.isSafeInteger(value) && (value as number) >= 0; }
function plainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}
function plainExact(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (!plainObject(value)) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  return Reflect.ownKeys(descriptors).every((key) => typeof key === "string")
    && Object.keys(descriptors).sort().join("\u0000") === [...keys].sort().join("\u0000")
    && Object.values(descriptors).every((descriptor) => "value" in descriptor);
}
