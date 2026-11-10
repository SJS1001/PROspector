/**
 * Plan 07-08: the narrow ports behind the portable workspace archive, the
 * read-only restore dry run, and the fenced restore.
 *
 * Every port is composed by trusted server code. None accepts a workspace,
 * owner, target, schedule state, or effect-enable claim from a request: the
 * authority port reports the server's own session and reauthentication, and
 * the evidence ports are the 0023 repository already bound to that scope.
 * Object keys are storage locations, never authority. No port here sends,
 * schedules, runs, or calls a provider, and no port receives a passphrase or a
 * derived key.
 */

/** Server-derived owner authority for one operation. Never built from browser input. */
export type RecoveryAuthority = Readonly<{
  workspaceId: string;
  ownerSubject: string;
  /** Epoch milliseconds of the owner's most recent server-verified reauthentication. */
  reauthenticatedAt: number;
  /** Digest of the server reauthentication event; the event itself stays server-side. */
  reauthReferenceDigest: string;
}>;

export type RecoveryAuthorityPort = Readonly<{
  /** The current server session's owner authority, or null when none is admitted. */
  current(): Promise<RecoveryAuthority | null>;
}>;

export type Clock = () => number;
/** Test randomness seam. Production uses the runtime's cryptographic generator. */
export type RandomSource = (length: number) => Uint8Array;

/** One identified canonical entry: a domain record, decision, dependency, export artifact, or tombstone. */
export type ArchiveEntry = Readonly<{ kind: string; id: string; value: unknown }>;
/** One append-only history or audit entry, ordered by `sequence` within its `stream`. */
export type ArchiveStreamEntry = Readonly<{ stream: string; sequence: number; id: string; value: unknown }>;
/** A content-addressed object; its bytes are read separately and must hash to `digest`. */
export type ArchiveObjectRef = Readonly<{ digest: string; byteLength: number; mediaType: string }>;

export type WorkspaceArchiveSnapshot = Readonly<{
  workspaceId: string;
  schemaVersion: string;
  records: readonly ArchiveEntry[];
  decisions: readonly ArchiveEntry[];
  history: readonly ArchiveStreamEntry[];
  audit: readonly ArchiveStreamEntry[];
  objects: readonly ArchiveObjectRef[];
  dependencies: readonly ArchiveEntry[];
  exportArtifacts: readonly ArchiveEntry[];
  tombstones: readonly ArchiveEntry[];
}>;

/** Workspace-scoped enumeration of the canonical source state, bound to the server scope at composition. */
export type WorkspaceArchiveSourcePort = Readonly<{
  readSnapshot(): Promise<WorkspaceArchiveSnapshot>;
  readObject(digest: string): Promise<Uint8Array | null>;
}>;

/** Public, non-secret metadata stored beside the sealed archive object. */
export type ArchiveObjectMetadata = Readonly<{
  formatVersion: string;
  ciphertextSha256: string;
  byteLength: number;
}>;

export type ArchiveObjectStorePort = Readonly<{
  /** Stores the sealed envelope bytes once; an implementation must refuse to overwrite a key. */
  putImmutable(objectKey: string, bytes: Uint8Array, metadata: ArchiveObjectMetadata): Promise<void>;
}>;

export type RecoveryWriteResult = Readonly<{ id: string; digest: string; replayed: boolean }>;

export type RecoveryRefusal = Readonly<{
  action: "archive.create" | "restore.dry_run" | "restore.lock_acquire" | "restore.apply";
  subjectKind: "workspace" | "recovery_archive" | "recovery_dry_run" | "recovery_restore_lock" | "recovery_restore_result";
  subjectId: string | null;
  reasonCode: string;
}>;

/** The archive-side subset of the 0023 repository (createD1HandoffRecoveryRepository). */
export type ArchiveEvidencePort = Readonly<{
  recordArchive(value: Readonly<{
    formatVersion: string;
    schemaVersion: string;
    compatibilityMin: string;
    compatibilityMax: string;
    manifest: Readonly<Record<string, unknown>>;
    ciphertextSha256: string;
    byteLength: number;
    objectKey: string;
    cipher: string;
    kdf: string;
    kdfParameters: Readonly<Record<string, unknown>>;
    recordCount: number;
    objectCount: number;
    tombstoneCount: number;
    reauthReferenceDigest: string;
    idempotencyKey: string;
  }>): Promise<RecoveryWriteResult>;
  recordDeliveryEvent(value: Readonly<{
    subjectKind: "recovery_archive";
    subjectId: string;
    eventKind: "issued";
    expiresAt: number;
    reasonCode: string;
    occurredAt: number;
    idempotencyKey: string;
  }>): Promise<RecoveryWriteResult>;
  recordRefusal(value: RecoveryRefusal): Promise<RecoveryWriteResult>;
}>;

export type WorkspaceArchivePorts = Readonly<{
  now: Clock;
  random?: RandomSource;
  authority: RecoveryAuthorityPort;
  source: WorkspaceArchiveSourcePort;
  archiveStore: ArchiveObjectStorePort;
  evidence: ArchiveEvidencePort;
}>;

/** A sealed archive the owner supplied to this deployment, with the server-recorded expiry of that upload. */
export type UploadedArchive = Readonly<{ bytes: Uint8Array; expiresAt: number }>;

export type RestoreArchiveSourcePort = Readonly<{
  /** Resolves a server-issued upload reference; never a client-chosen object key. */
  readArchive(archiveRef: string): Promise<UploadedArchive | null>;
}>;

/** Default-disabled effect state every restored target starts in. */
export type EffectFence = Readonly<{
  scheduler: "disabled";
  runner: "disabled";
  outbox: "paused";
  provider: "disabled";
  delivery: "disabled";
}>;

export type RestoreSection = "records" | "decisions" | "history" | "audit" | "dependencies" | "exportArtifacts" | "tombstones";

/** One canonical row as restored. Stream entries carry `stream` and `sequence`; identified entries carry `kind`. */
export type RestoreRow = Readonly<{
  section: RestoreSection;
  kind?: string;
  stream?: string;
  sequence?: number;
  id: string;
  value: unknown;
}>;

export type RestoreObject = Readonly<{ digest: string; mediaType: string; bytes: Uint8Array }>;

export type RestorePlan = Readonly<{
  sourceWorkspaceId: string;
  manifestDigest: string;
  rows: readonly RestoreRow[];
  objects: readonly RestoreObject[];
  effects: EffectFence;
}>;

export type RestoreTargetLocalState = Readonly<{
  schemaVersion: string;
  /** True only when the target holds no workspace data and no object. */
  empty: boolean;
  /** True when any scheduler, runner, outbox, provider, or delivery effect is live. */
  effectsEnabled: boolean;
}>;

export type RestoredReadback = Readonly<{
  rows: readonly RestoreRow[];
  objectDigests: readonly string[];
  effects: Readonly<Record<string, string>> | null;
}>;

/** The clean restore target's data seam. It has no enable, start, send, call, or deliver method. */
export type RestoreTargetPort = Readonly<{
  readState(): Promise<RestoreTargetLocalState>;
  /** Writes every row, every object, and the effect fence. Throws on any failure. */
  apply(plan: RestorePlan): Promise<void>;
  /** Removes everything a failed apply wrote, returning the target to empty. */
  discard(): Promise<void>;
  readRestored(): Promise<RestoredReadback>;
}>;

/** The target-side subset of the 0023 repository, bound to the target workspace scope. */
export type RestoreEvidencePort = Readonly<{
  readRestoreTargetState(): Promise<Readonly<{ clean: boolean; restoreApplied: boolean }>>;
  recordDryRun(value: Readonly<{
    sourceWorkspaceId: string;
    archiveManifestDigest: string;
    archiveCiphertextSha256: string;
    archiveSchemaVersion: string;
    outcome: "accepted";
    reasonCode: "verified";
    nonceDigest: string;
    expiresAt: number;
    invariantDigest: string;
    idempotencyKey: string;
  }>): Promise<RecoveryWriteResult>;
  acquireRestoreLock(value: Readonly<{ dryRunId: string; nonceDigest: string; idempotencyKey: string }>): Promise<RecoveryWriteResult>;
  recordRestoreResult(value: Readonly<{
    lockId: string;
    outcome: "applied" | "rolled_back";
    reasonCode: string;
    restoredRecordCount: number;
    restoredObjectCount: number;
    idempotencyKey: string;
  }>): Promise<RecoveryWriteResult>;
  recordRefusal(value: RecoveryRefusal): Promise<RecoveryWriteResult>;
}>;

export type RestorePorts = Readonly<{
  now: Clock;
  random?: RandomSource;
  authority: RecoveryAuthorityPort;
  archives: RestoreArchiveSourcePort;
  target: RestoreTargetPort;
  evidence: RestoreEvidencePort;
}>;
