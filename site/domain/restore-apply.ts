/**
 * Plan 07-08 Task 2, stage two: the explicit, fenced, idempotent restore.
 *
 * A restore re-verifies the archive with the owner's passphrase (the key is
 * never kept between stages), recomputes the nonce digest that binds the dry
 * run to this archive and target, and acquires the 0023 restore lock, which
 * the repository grants only for a current accepted dry run with that digest,
 * once per workspace. It then applies every row, object, and the default-off
 * effect fence, reads the target back, and records the result. Any failure
 * after the lock discards the partial write and records a minimized
 * `rolled_back` outcome, consuming the nonce.
 *
 * Replaying the same verified archive, dry run, and nonce into the target it
 * already restored is `already_restored` with no write. Nothing here enables a
 * schedule, starts a runner, sends, calls a provider, or delivers.
 */
import {
  RESTORE_EFFECT_FENCE,
  auditRefusal,
  conflictReason,
  plainExact,
  restoreNonceDigest,
  restoreReadbackMatches,
  validId,
  validRestorePorts,
  verifyRestoreCandidate,
} from "./restore-verifier";
import type { RestoreRefusal } from "./restore-verifier";
import type { EffectFence, RestorePorts } from "./ports/workspace-archive";

export type ApplyRestoreResult =
  | Readonly<{
    status: "restored";
    archiveDigest: string;
    restoreResultId: string;
    recordCount: number;
    objectCount: number;
    effects: EffectFence;
  }>
  | Readonly<{ status: "already_restored"; archiveDigest: string; auditRef: string }>
  | Readonly<{ status: "rolled_back"; target: Readonly<{ clean: boolean }>; reason: string; auditRef: string }>
  | RestoreRefusal;

const NONCE = /^[a-f0-9]{32}$/u;

/** Input is exactly `{ archiveRef, dryRunId, nonce, passphrase, ports }`; target identity comes only from the server authority. */
export async function applyRestore(input: Readonly<{
  archiveRef: string;
  dryRunId: string;
  nonce: string;
  passphrase: string;
  ports: RestorePorts;
}>): Promise<ApplyRestoreResult> {
  if (!plainExact(input, ["archiveRef", "dryRunId", "nonce", "passphrase", "ports"]) || !validRestorePorts(input.ports)) {
    return Object.freeze({ status: "refused" as const, reason: "restore_request_invalid" });
  }
  const { ports } = input;
  const refuse = (reason: string) => auditRefusal(ports, "restore.apply", "recovery_restore_result", reason);
  if (!validId(input.dryRunId) || typeof input.nonce !== "string" || !NONCE.test(input.nonce)) return refuse("restore_request_invalid");

  const candidate = await verifyRestoreCandidate(input.archiveRef, input.passphrase, ports);
  if (candidate.status === "refused") return refuse(candidate.reason);
  const nonceDigest = await restoreNonceDigest(input.nonce, candidate);
  const lockRequest = { dryRunId: input.dryRunId, nonceDigest, idempotencyKey: `restore-lock.${input.dryRunId}` };
  const archiveDigest = candidate.archive.manifest.digest;

  if (candidate.targetRestoreApplied) {
    // Only an exact replay of the lock that restored this target can be idempotent.
    let replay;
    try {
      replay = await ports.evidence.acquireRestoreLock(lockRequest);
    } catch {
      return refuse("target_not_clean");
    }
    if (replay.replayed && await restoreReadbackMatches(await ports.target.readRestored(), candidate.plan)) {
      return Object.freeze({ status: "already_restored" as const, archiveDigest, auditRef: replay.id });
    }
    return refuse("target_not_clean");
  }
  if (!candidate.targetClean || !candidate.targetLocal.empty) return refuse("target_not_clean");
  if (candidate.targetLocal.effectsEnabled) return refuse("target_effects_enabled");

  let lock;
  try {
    lock = await ports.evidence.acquireRestoreLock(lockRequest);
  } catch (error) {
    return auditRefusal(ports, "restore.lock_acquire", "recovery_restore_lock", conflictReason(error) === "dry_run_not_accepted" ? "dry_run_not_current" : "restore_lock_unavailable");
  }
  // A replayed lock means another attempt already holds or consumed this nonce.
  if (lock.replayed) return auditRefusal(ports, "restore.lock_acquire", "recovery_restore_lock", "restore_lock_unavailable");

  let failure: string | null = null;
  try {
    await ports.target.apply(candidate.plan);
  } catch {
    failure = "partial_write";
  }
  if (failure === null) {
    let readback = null;
    try {
      readback = await ports.target.readRestored();
    } catch {
      readback = null;
    }
    if (!(await restoreReadbackMatches(readback, candidate.plan))) failure = "restore_verification_failed";
  }
  if (failure === null) {
    try {
      const result = await ports.evidence.recordRestoreResult({
        lockId: lock.id,
        outcome: "applied",
        reasonCode: "restored",
        restoredRecordCount: candidate.archive.counts.recordCount,
        restoredObjectCount: candidate.archive.counts.objectCount,
        idempotencyKey: `restore-result.${lock.id}`,
      });
      return Object.freeze({
        status: "restored" as const,
        archiveDigest,
        restoreResultId: result.id,
        recordCount: candidate.archive.counts.recordCount,
        objectCount: candidate.archive.counts.objectCount,
        effects: Object.freeze({ ...RESTORE_EFFECT_FENCE }),
      });
    } catch (error) {
      failure = conflictReason(error) === "schedules_must_start_disabled" ? "schedules_must_start_disabled" : "restore_result_unavailable";
    }
  }
  return rollBack(ports, lock.id, failure);
}

/** Discards the partial write and records a minimized outcome. Internal error text never leaves this function. */
async function rollBack(ports: RestorePorts, lockId: string, reason: string): Promise<ApplyRestoreResult> {
  let discarded = true;
  try {
    await ports.target.discard();
  } catch {
    discarded = false;
  }
  const finalReason = discarded ? reason : "rollback_incomplete";
  let auditRef = lockId;
  try {
    const result = await ports.evidence.recordRestoreResult({
      lockId,
      outcome: "rolled_back",
      reasonCode: finalReason,
      restoredRecordCount: 0,
      restoredObjectCount: 0,
      idempotencyKey: `restore-result.${lockId}`,
    });
    auditRef = result.id;
  } catch {
    // The held lock is itself the durable evidence; it also blocks any later restore.
  }
  let clean = false;
  if (discarded) {
    try {
      const [evidence, local] = await Promise.all([ports.evidence.readRestoreTargetState(), ports.target.readState()]);
      clean = evidence.clean === true && local.empty === true;
    } catch {
      clean = false;
    }
  }
  return Object.freeze({ status: "rolled_back" as const, target: Object.freeze({ clean }), reason: finalReason, auditRef });
}
