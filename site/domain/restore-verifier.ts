/**
 * Plan 07-08 Task 2, stage one: the read-only restore dry run.
 *
 * A dry run re-checks the server-derived owner authority and reauthentication,
 * the server-recorded upload expiry, the archive envelope (one indistinguishable
 * refusal for a wrong passphrase or any tampering), object completeness and
 * referential invariants, schema compatibility with the target, and target
 * cleanliness. It writes nothing to the target's data, objects, or effects: its
 * only write is the accepted dry-run evidence row (or a minimized refusal
 * audit) through the 0023 repository, which never makes a target dirty.
 *
 * The returned nonce is shown to the owner once. Only a digest that binds it to
 * this archive, this target, and the verified invariants is stored, so a nonce
 * can never release a different archive or target.
 */
import { openWorkspaceArchive, WORKSPACE_ARCHIVE_SCHEMA_VERSION } from "./workspace-archive";
import type { OpenedWorkspaceArchive } from "./workspace-archive";
import type {
  EffectFence,
  RecoveryAuthority,
  RestorePlan,
  RestorePorts,
  RestoreRow,
  RestoredReadback,
  RestoreTargetLocalState,
} from "./ports/workspace-archive";

/** Every restored target starts with all effects off. Only a fresh upstream Phase 4 activation may change a schedule. */
export const RESTORE_EFFECT_FENCE: EffectFence = Object.freeze({
  scheduler: "disabled",
  runner: "disabled",
  outbox: "paused",
  provider: "disabled",
  delivery: "disabled",
});

export type RestoreRefusal = Readonly<{ status: "refused"; reason: string }>;

export type DryRunResult =
  | Readonly<{
    status: "verified";
    dryRunId: string;
    nonce: string;
    expiresAt: number;
    manifestDigest: string;
    recordCount: number;
    objectCount: number;
    tombstoneCount: number;
  }>
  | RestoreRefusal;

export type VerifiedRestoreCandidate = Readonly<{
  status: "verified";
  now: number;
  authority: RecoveryAuthority;
  archive: OpenedWorkspaceArchive;
  ciphertextSha256: string;
  invariantDigest: string;
  plan: RestorePlan;
  targetClean: boolean;
  targetRestoreApplied: boolean;
  targetLocal: RestoreTargetLocalState;
}>;

const DRY_RUN_TTL_MS = 15 * 60 * 1000;
const REAUTH_MAX_AGE_MS = 15 * 60 * 1000;
/** Schema versions this deployment can hold, ordered oldest to newest. */
const TARGET_SCHEMA_VERSIONS: readonly string[] = Object.freeze([WORKSPACE_ARCHIVE_SCHEMA_VERSION]);
const ID = /^[A-Za-z0-9](?:[A-Za-z0-9._:-]{0,126}[A-Za-z0-9])?$/u;
const DIGEST = /^[a-f0-9]{64}$/u;
const POST_AUTHENTICATION_REASONS = new Set(["archive_object_missing", "archive_invariant_failed"]);
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

/** Stage one. Input is exactly `{ archiveRef, passphrase, ports }`; any request-supplied target scope is refused. */
export async function dryRunRestore(input: Readonly<{ archiveRef: string; passphrase: string; ports: RestorePorts }>): Promise<DryRunResult> {
  if (!plainExact(input, ["archiveRef", "passphrase", "ports"]) || !validRestorePorts(input.ports)) return refused("restore_request_invalid");
  const { ports } = input;
  const candidate = await verifyRestoreCandidate(input.archiveRef, input.passphrase, ports);
  if (candidate.status === "refused") return auditRefusal(ports, "restore.dry_run", "recovery_dry_run", candidate.reason);
  if (!candidate.targetClean || !candidate.targetLocal.empty) return auditRefusal(ports, "restore.dry_run", "recovery_dry_run", "target_not_clean");
  if (candidate.targetLocal.effectsEnabled) return auditRefusal(ports, "restore.dry_run", "recovery_dry_run", "target_effects_enabled");

  const nonce = toHex(randomExact(ports, 16));
  const nonceDigest = await restoreNonceDigest(nonce, candidate);
  const expiresAt = candidate.now + DRY_RUN_TTL_MS;
  let recorded;
  try {
    recorded = await ports.evidence.recordDryRun({
      sourceWorkspaceId: candidate.archive.sourceWorkspaceId,
      archiveManifestDigest: candidate.archive.manifest.digest,
      archiveCiphertextSha256: candidate.ciphertextSha256,
      archiveSchemaVersion: candidate.archive.schemaVersion,
      outcome: "accepted",
      reasonCode: "verified",
      nonceDigest,
      expiresAt,
      invariantDigest: candidate.invariantDigest,
      idempotencyKey: `dry-run.${nonceDigest.slice(0, 32)}`,
    });
  } catch (error) {
    return auditRefusal(ports, "restore.dry_run", "recovery_dry_run", conflictReason(error) === "restore_target_not_clean" ? "target_not_clean" : "dry_run_unavailable");
  }
  return Object.freeze({
    status: "verified" as const,
    dryRunId: recorded.id,
    nonce,
    expiresAt,
    manifestDigest: candidate.archive.manifest.digest,
    recordCount: candidate.archive.counts.recordCount,
    objectCount: candidate.archive.counts.objectCount,
    tombstoneCount: candidate.archive.counts.tombstoneCount,
  });
}

/**
 * The shared read-only verification behind both stages. It never writes, and
 * it reports target state rather than deciding on it, so the apply stage can
 * recognise an idempotent replay of an already restored archive.
 */
export async function verifyRestoreCandidate(archiveRef: unknown, passphrase: unknown, ports: RestorePorts): Promise<VerifiedRestoreCandidate | RestoreRefusal> {
  const now = ports.now();
  if (!Number.isSafeInteger(now) || now <= 0 || !validId(archiveRef)) return refused("restore_request_invalid");
  const authority = await ports.authority.current();
  if (!validAuthority(authority)) return refused("not_authorized");
  if (authority.reauthenticatedAt > now || now - authority.reauthenticatedAt > REAUTH_MAX_AGE_MS) return refused("reauthentication_required");

  const upload = await ports.archives.readArchive(archiveRef);
  if (!upload || !(upload.bytes instanceof Uint8Array) || !Number.isSafeInteger(upload.expiresAt)) return refused("archive_unavailable");
  if (now >= upload.expiresAt) return refused("archive_expired");
  const ciphertextSha256 = await sha256Hex(upload.bytes);
  let archive: OpenedWorkspaceArchive;
  try {
    archive = await openWorkspaceArchive(JSON.parse(decoder.decode(upload.bytes)) as unknown, passphrase);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return refused(POST_AUTHENTICATION_REASONS.has(message) ? message : "archive_untrusted");
  }

  const targetLocal = await ports.target.readState();
  const targetVersion = TARGET_SCHEMA_VERSIONS.indexOf(targetLocal.schemaVersion);
  const [minimum, maximum] = [TARGET_SCHEMA_VERSIONS.indexOf(archive.compatibility.min), TARGET_SCHEMA_VERSIONS.indexOf(archive.compatibility.max)];
  if (targetVersion < 0 || minimum < 0 || maximum < 0 || targetVersion < minimum || targetVersion > maximum) return refused("version_skew");
  const targetState = await ports.evidence.readRestoreTargetState();

  const plan = restorePlan(archive);
  const invariantDigest = await sha256Hex(encoder.encode(JSON.stringify([
    "recovery-invariants/v1", archive.manifest.digest, ciphertextSha256, targetLocal.schemaVersion,
    archive.counts.recordCount, archive.counts.objectCount, archive.counts.tombstoneCount,
  ])));
  return Object.freeze({
    status: "verified" as const,
    now,
    authority,
    archive,
    ciphertextSha256,
    invariantDigest,
    plan,
    targetClean: targetState.clean === true,
    targetRestoreApplied: targetState.restoreApplied === true,
    targetLocal: Object.freeze({ schemaVersion: targetLocal.schemaVersion, empty: targetLocal.empty === true, effectsEnabled: targetLocal.effectsEnabled !== false }),
  });
}

/** Binds a nonce to one target workspace, one archive, and its verified invariants. */
export async function restoreNonceDigest(nonce: string, candidate: VerifiedRestoreCandidate): Promise<string> {
  return sha256Hex(encoder.encode(JSON.stringify([
    "recovery-restore-nonce/v1", nonce, candidate.authority.workspaceId, candidate.archive.sourceWorkspaceId,
    candidate.archive.manifest.digest, candidate.ciphertextSha256, candidate.invariantDigest,
  ])));
}

/** True only when the target holds exactly the verified rows and object bytes and every effect is fenced. */
export async function restoreReadbackMatches(readback: RestoredReadback | null, plan: RestorePlan): Promise<boolean> {
  if (!readback || !Array.isArray(readback.rows) || !Array.isArray(readback.objects)) return false;
  const rows = (list: readonly RestoreRow[]) => list.map(canonicalJson).sort();
  const expectedRows = rows(plan.rows);
  const actualRows = rows(readback.rows);
  if (expectedRows.length !== actualRows.length || expectedRows.some((row, index) => row !== actualRows[index])) return false;
  const byDigest = (left: { digest: string }, right: { digest: string }) => (left.digest < right.digest ? -1 : left.digest > right.digest ? 1 : 0);
  const expectedObjects = [...plan.objects].sort(byDigest);
  const actualObjects = [...readback.objects].sort(byDigest);
  if (expectedObjects.length !== actualObjects.length) return false;
  for (const [index, expected] of expectedObjects.entries()) {
    const actual = actualObjects[index];
    if (!plainObject(actual) || actual.digest !== expected.digest || !(actual.bytes instanceof Uint8Array)) return false;
    if (actual.bytes.byteLength !== expected.bytes.byteLength || await sha256Hex(actual.bytes) !== expected.digest) return false;
  }
  return canonicalJson(readback.effects) === canonicalJson(RESTORE_EFFECT_FENCE);
}

export async function auditRefusal(
  ports: RestorePorts,
  action: "restore.dry_run" | "restore.lock_acquire" | "restore.apply",
  subjectKind: "recovery_dry_run" | "recovery_restore_lock" | "recovery_restore_result",
  reason: string,
): Promise<RestoreRefusal> {
  try {
    await ports.evidence.recordRefusal({ action, subjectKind, subjectId: null, reasonCode: reason });
  } catch {
    // A refusal audit failure never turns a refusal into anything else.
  }
  return refused(reason);
}

export function refused(reason: string): RestoreRefusal {
  return Object.freeze({ status: "refused" as const, reason });
}

export function conflictReason(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  return message.startsWith("handoff_recovery_conflict:") ? message.slice("handoff_recovery_conflict:".length) : "";
}

export function validRestorePorts(ports: unknown): ports is RestorePorts {
  if (!plainObject(ports)) return false;
  const has = (owner: unknown, name: string) => Boolean(owner) && typeof (owner as Record<string, unknown>)[name] === "function";
  return typeof ports.now === "function" && (ports.random === undefined || typeof ports.random === "function")
    && has(ports.authority, "current") && has(ports.archives, "readArchive")
    && ["readState", "apply", "discard", "readRestored"].every((name) => has(ports.target, name))
    && ["readRestoreTargetState", "recordDryRun", "acquireRestoreLock", "recordRestoreResult", "recordRefusal"].every((name) => has(ports.evidence, name));
}

export function plainExact(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (!plainObject(value)) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  return Reflect.ownKeys(descriptors).every((key) => typeof key === "string")
    && Object.keys(descriptors).sort().join("\u0000") === [...keys].sort().join("\u0000")
    && Object.values(descriptors).every((descriptor) => "value" in descriptor);
}

export function validId(value: unknown): value is string {
  return typeof value === "string" && ID.test(value);
}

function restorePlan(archive: OpenedWorkspaceArchive): RestorePlan {
  const { sections } = archive;
  const identified = (section: "records" | "decisions" | "dependencies" | "exportArtifacts" | "tombstones") =>
    sections[section].map((entry) => ({ section, kind: entry.kind, id: entry.id, value: entry.value }));
  const streamed = (section: "history" | "audit") =>
    sections[section].map((entry) => ({ section, stream: entry.stream, sequence: entry.sequence, id: entry.id, value: entry.value }));
  return Object.freeze({
    sourceWorkspaceId: archive.sourceWorkspaceId,
    manifestDigest: archive.manifest.digest,
    rows: Object.freeze([
      ...identified("records"), ...identified("decisions"), ...streamed("history"), ...streamed("audit"),
      ...identified("dependencies"), ...identified("exportArtifacts"), ...identified("tombstones"),
    ]),
    objects: Object.freeze(sections.objects.map((object) => ({ digest: object.digest, mediaType: object.mediaType, bytes: object.bytes }))),
    effects: RESTORE_EFFECT_FENCE,
  });
}

function validAuthority(value: unknown): value is RecoveryAuthority {
  return plainObject(value) && validId(value.workspaceId) && typeof value.ownerSubject === "string" && value.ownerSubject.length > 0
    && Number.isSafeInteger(value.reauthenticatedAt) && (value.reauthenticatedAt as number) > 0
    && typeof value.reauthReferenceDigest === "string" && DIGEST.test(value.reauthReferenceDigest);
}

function randomExact(ports: RestorePorts, length: number) {
  const bytes = (ports.random ?? ((size: number) => crypto.getRandomValues(new Uint8Array(size))))(length);
  if (!(bytes instanceof Uint8Array) || bytes.byteLength !== length) throw new Error("restore_request_invalid");
  return bytes;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

async function sha256Hex(bytes: Uint8Array) {
  return toHex(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as BufferSource)));
}

function toHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function plainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}
