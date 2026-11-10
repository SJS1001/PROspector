import { CRM_CSV_SCHEMA_VERSION } from "./crm-csv-codec";
import { accessCrmHandoffArtifact, materializeCrmHandoff, planCrmHandoff, type CrmHandoffPorts } from "./crm-handoff";
import { CRM_HANDOFF_STORE_SCHEMA } from "./crm-handoff-d1-store";
import { consumeCsrfToken, csrfCookieName, csrfTokenFromRequest, CsrfTokenError, issueCsrfToken, withCsrfCookie, type CsrfCookieMode } from "./csrf";
import { readMorningBrief, type MorningBriefPrincipal } from "./morning-brief-read";
import { admitPilotOwner, PilotAccessError } from "./pilot-access";
import type { RecoveryAuthority, RestorePorts, WorkspaceArchivePorts } from "./ports/workspace-archive";
import { readBoundedJson, validateSameOriginMutation } from "./request-security";
import { applyRestore } from "./restore-apply";
import { dryRunRestore, RESTORE_EFFECT_FENCE } from "./restore-verifier";
import { torontoWeekForInstant } from "./weekly-outcome";
import { createWorkspaceArchive } from "./workspace-archive";

/**
 * Owner CSV CRM Handoff and Workspace Recovery transport (07-09, local).
 *
 * - The server derives the owner and workspace; the browser sends closed JSON
 *   commands only. No command accepts a workspace, idempotency key, eligibility,
 *   object key, archive or restore target, schedule, timezone, CRM provider,
 *   runner instruction, external response, or passphrase-persistence flag.
 * - The Phase 4 schedule state is read through the existing Morning Brief read
 *   and projected display-only. No command schedules, enables, starts, or runs
 *   anything; there is no schedule command at all.
 * - CSV handoff reaches `crm-handoff.ts` (and its D1 store); the archive, dry
 *   run, and restore reach the 07-08 services. Each service rechecks its own
 *   authority. The archive and dry-run target and the dry run a restore uses
 *   are derived from current server projections; a browser reference that no
 *   longer matches them is refused before any service runs.
 * - Production composes no CSV source, object store, reauthentication, upload,
 *   or restore target, so every request is refused with its first unmet
 *   predicate. Only tests inject synthetic services.
 * - A passphrase is operation input only. It is never returned, logged,
 *   audited, or stored; the restore nonce is returned once to the owner.
 */

export const HANDOFF_RECOVERY_MUTATION_INTENT = "handoff-recovery-mutation";
export const MAX_HANDOFF_RECOVERY_BODY_BYTES = 4096;
export const HANDOFF_RECOVERY_PROJECTION_SCHEMA = "handoff-recovery-projection/v1";

const ID = /^[A-Za-z0-9](?:[A-Za-z0-9._:-]{0,126}[A-Za-z0-9])?$/u;
const DIGEST = /^[a-f0-9]{64}$/u;
const NONCE = /^[a-f0-9]{32}$/u;
const REASON = /^[a-z0-9](?:[a-z0-9._:-]{0,78}[a-z0-9])?$/u;
const VERSION = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u;
const MAX_PASSPHRASE = 1024;
/** Mirrors `createWorkspaceArchive` and `openWorkspaceArchive`; a shorter passphrase is refused before any service runs. */
export const ARCHIVE_PASSPHRASE_MIN_LENGTH = 16;
/**
 * Refusals `createWorkspaceArchive` raises before its first write (the
 * immutable envelope put). Only these, raised before that write, are definite
 * refusals; every other failure is an unknown outcome.
 */
const ARCHIVE_PRE_WRITE_REFUSALS = new Set([
  "archive_request_invalid", "not_authorized", "reauthentication_required", "archive_source_invalid",
  "archive_object_missing", "archive_invariant_failed", "archive_too_large",
]);
const MAX_HISTORY = 20;
const MAX_LEDGER = 50;
/** Mirrors the 07-08 services; they recheck it themselves. */
const REAUTH_MAX_AGE_MS = 15 * 60 * 1000;

/** Every operational authority this surface could confer. All stay false. */
const HANDOFF_RECOVERY_AUTHORITY = Object.freeze({
  changeSchedule: false as const,
  activateRunner: false as const,
  confirmReadiness: false as const,
  syncCrm: false as const,
  enableEffects: false as const,
});

const HANDOFF_RECOVERY_EFFECTS = Object.freeze({
  schedulerCalls: 0 as const,
  runnerCalls: 0 as const,
  providerCalls: 0 as const,
  sends: 0 as const,
  crmSyncs: 0 as const,
});

export type HandoffRecoveryScope = Readonly<{ workspaceId: string; ownerSubject: string; now: () => number }>;

export type HandoffRecoveryServices = Readonly<{
  mode: "production" | "synthetic";
  /** CSV handoff ports for the admitted workspace, or null when no source and object store are composed. */
  crm: CrmHandoffPorts | null;
  /** Archive, dry-run, and restore ports, or null when reauthentication, upload, and target capability are not composed. */
  recovery: Readonly<{
    archive: WorkspaceArchivePorts;
    restore: RestorePorts;
    /** The server-issued reference of the archive upload available to verify, or null. */
    currentRestoreArchiveRef(): Promise<string | null>;
  }> | null;
}>;

export type HandoffRecoveryServicesFactory = (database: D1Database, scope: HandoffRecoveryScope) => HandoffRecoveryServices;

export type HandoffRecoveryHandlerDependencies = {
  database: D1Database;
  subjectPepper: string;
  pilotOwnerEmail: string;
  getIdentity(): Promise<{ email: string; displayName: string } | null>;
  csrfCookieMode?: CsrfCookieMode;
  /** Test seam only. The route never sets it, so production composition is always used. */
  services?: HandoffRecoveryServicesFactory;
  now?: () => number;
};

/**
 * Production composition. No CSV source or object store, no reauthentication
 * mechanism, no archive upload, and no clean restore target exist, so CSV
 * handoff and every recovery request are refused with a first unmet predicate.
 * Even a composed CSV source would still meet the always-refusing
 * `recheckForCrmExport` through `createD1CrmHandoffPorts`.
 */
export function composeProductionHandoffRecoveryServices(): HandoffRecoveryServices {
  return Object.freeze({ mode: "production" as const, crm: null, recovery: null });
}

// ---------------------------------------------------------------------------
// HTTP layer
// ---------------------------------------------------------------------------

type Principal = { subject: string; legacySubject?: string };

export async function handleHandoffRecoveryGet(request: Request, dependencies: HandoffRecoveryHandlerDependencies): Promise<Response> {
  try {
    const principal = await owner(dependencies);
    if (new URL(request.url).search.length !== 0) return privateWorkspaceUnavailable();
    const scope = await workspaceScope(dependencies, principal);
    const projection = await readHandoffRecoveryProjection(dependencies.database, scope, servicesFor(dependencies, scope));
    return withCsrfCookie(json(projection), await issueCsrfToken(dependencies.database, principal.subject), dependencies.csrfCookieMode);
  } catch (error) {
    return error instanceof PilotAccessError ? privateWorkspaceUnavailable() : handoffRecoveryUnavailable();
  }
}

export async function handleHandoffRecoveryPost(request: Request, dependencies: HandoffRecoveryHandlerDependencies): Promise<Response> {
  try {
    const principal = await owner(dependencies);
    const rejected = validateSameOriginMutation(request, HANDOFF_RECOVERY_MUTATION_INTENT, MAX_HANDOFF_RECOVERY_BODY_BYTES);
    if (rejected) return json({ error: rejected.error }, rejected.status);
    await consumeCsrfToken(dependencies.database, principal.subject, csrfTokenFromRequest(request, csrfCookieName(dependencies.csrfCookieMode)));
    const fresh = async (response: Response) => withCsrfCookie(response, await issueCsrfToken(dependencies.database, principal.subject), dependencies.csrfCookieMode);
    let body: unknown;
    try {
      body = await readBoundedJson(request, MAX_HANDOFF_RECOVERY_BODY_BYTES);
    } catch (error) {
      if (error instanceof SyntaxError) return fresh(json({ error: "invalid_json" }, 400));
      if (error instanceof Error && "status" in error && error.status === 413) return fresh(json({ error: "payload_too_large" }, 413));
      throw error;
    }
    const scope = await workspaceScope(dependencies, principal);
    const services = servicesFor(dependencies, scope);
    if (plainRecord(body) && body.action === "download_csv_handoff") {
      const download = await executeHandoffRecoveryDownload(dependencies.database, scope, services, body);
      if (download.kind === "invalid") return fresh(json({ error: download.error }, 400));
      if (download.kind === "refused") return fresh(json({ command: download.command, projection: await readHandoffRecoveryProjection(dependencies.database, scope, services) }, 409));
      return fresh(new Response(Uint8Array.from(download.bytes), {
        status: 200,
        headers: {
          "cache-control": "no-store",
          "x-content-type-options": "nosniff",
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename="crm-handoff-v${download.version}.csv"`,
          "x-content-sha256": download.csvSha256,
        },
      }));
    }
    const result = await executeHandoffRecoveryCommand(dependencies.database, scope, services, body);
    return fresh(json(result.body, result.status));
  } catch (error) {
    if (error instanceof PilotAccessError) return privateWorkspaceUnavailable();
    if (error instanceof CsrfTokenError) return json({ error: error.code }, 403);
    if (error instanceof Error && "status" in error && error.status === 413) return json({ error: "payload_too_large" }, 413);
    // An unknown outcome: the browser reloads the authoritative projection and never retries.
    return handoffRecoveryUnavailable();
  }
}

async function owner(dependencies: HandoffRecoveryHandlerDependencies): Promise<Principal> {
  return admitPilotOwner(await dependencies.getIdentity(), dependencies.pilotOwnerEmail, dependencies.subjectPepper);
}

/** The scope's owner subject is the one stored on the workspace, so legacy-subject workspaces stay consistent. */
async function workspaceScope(dependencies: HandoffRecoveryHandlerDependencies, principal: Principal): Promise<HandoffRecoveryScope> {
  const row = await dependencies.database.prepare(
    "SELECT id,owner_subject FROM workspaces WHERE owner_subject IN (?, ?) ORDER BY CASE owner_subject WHEN ? THEN 0 ELSE 1 END LIMIT 1",
  ).bind(principal.subject, principal.legacySubject ?? principal.subject, principal.subject).first<{ id: string; owner_subject: string }>();
  if (!row || !validId(row.id) || !validId(row.owner_subject)) throw new PilotAccessError();
  return Object.freeze({ workspaceId: row.id, ownerSubject: row.owner_subject, now: dependencies.now ?? Date.now });
}

function servicesFor(dependencies: HandoffRecoveryHandlerDependencies, scope: HandoffRecoveryScope): HandoffRecoveryServices {
  return dependencies.services ? dependencies.services(dependencies.database, scope) : composeProductionHandoffRecoveryServices();
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

type CreateCsvHandoff = Readonly<{ action: "create_csv_handoff"; snapshotDigest: string }>;
type DownloadCsvHandoff = Readonly<{ action: "download_csv_handoff"; artifactId: string }>;
type CreateArchive = Readonly<{ action: "create_archive"; passphrase: string }>;
type RunDryRun = Readonly<{ action: "run_dry_run"; archiveRef: string; passphrase: string }>;
type RestoreVerifiedArchive = Readonly<{ action: "restore_verified_archive"; archiveRef: string; dryRunId: string; nonce: string; passphrase: string }>;
type HandoffRecoveryCommand = CreateCsvHandoff | DownloadCsvHandoff | CreateArchive | RunDryRun | RestoreVerifiedArchive;
type JsonAction = Exclude<HandoffRecoveryCommand["action"], "download_csv_handoff">;

type CommandResult = Readonly<{
  action: HandoffRecoveryCommand["action"];
  status: "applied" | "replayed" | "refused";
  reasonCodes: readonly string[];
  targetWrites: number;
  schedulerCalls: 0; runnerCalls: 0; providerCalls: 0; sends: 0; crmSyncs: 0;
} & Record<string, unknown>>;

const SHAPES: Readonly<Record<HandoffRecoveryCommand["action"], readonly string[]>> = Object.freeze({
  create_csv_handoff: ["action", "snapshotDigest"],
  download_csv_handoff: ["action", "artifactId"],
  create_archive: ["action", "passphrase"],
  run_dry_run: ["action", "archiveRef", "passphrase"],
  restore_verified_archive: ["action", "archiveRef", "dryRunId", "nonce", "passphrase", "confirmed"],
});

class CommandShapeError extends Error {}
class UnsupportedActionError extends Error {}

/** Strict closed-shape parse. Any extra field, including a client-supplied scope or schedule, is refused. */
export function parseHandoffRecoveryCommand(value: unknown): HandoffRecoveryCommand {
  if (!plainRecord(value)) throw new CommandShapeError();
  const action = value.action;
  if (typeof action !== "string" || !Object.hasOwn(SHAPES, action)) throw new UnsupportedActionError();
  const shape = SHAPES[action as HandoffRecoveryCommand["action"]];
  const keys = Object.keys(value);
  if (keys.length !== shape.length || shape.some((key) => !Object.hasOwn(value, key))) throw new CommandShapeError();
  const id = (key: string) => { if (!validId(value[key])) throw new CommandShapeError(); return value[key] as string; };
  const passphrase = () => {
    const raw = value.passphrase;
    if (typeof raw !== "string" || raw.length < ARCHIVE_PASSPHRASE_MIN_LENGTH || raw.length > MAX_PASSPHRASE) throw new CommandShapeError();
    return raw;
  };
  switch (action) {
    case "create_csv_handoff":
      if (typeof value.snapshotDigest !== "string" || !DIGEST.test(value.snapshotDigest)) throw new CommandShapeError();
      return Object.freeze({ action, snapshotDigest: value.snapshotDigest });
    case "download_csv_handoff":
      return Object.freeze({ action, artifactId: id("artifactId") });
    case "create_archive":
      return Object.freeze({ action, passphrase: passphrase() });
    case "run_dry_run":
      return Object.freeze({ action, archiveRef: id("archiveRef"), passphrase: passphrase() });
    case "restore_verified_archive":
      if (value.confirmed !== true) throw new CommandShapeError();
      if (typeof value.nonce !== "string" || !NONCE.test(value.nonce)) throw new CommandShapeError();
      return Object.freeze({ action, archiveRef: id("archiveRef"), dryRunId: id("dryRunId"), nonce: value.nonce, passphrase: passphrase() });
  }
  throw new UnsupportedActionError();
}

/** Parse, run one JSON command through its trusted service, and reload the authoritative projection. */
export async function executeHandoffRecoveryCommand(
  database: D1Database,
  scope: HandoffRecoveryScope,
  services: HandoffRecoveryServices,
  value: unknown,
): Promise<Readonly<{ status: number; body: Record<string, unknown> }>> {
  let command: HandoffRecoveryCommand;
  try {
    command = parseHandoffRecoveryCommand(value);
  } catch (error) {
    return { status: 400, body: { error: error instanceof UnsupportedActionError ? "unsupported_action" : "invalid_command" } };
  }
  if (command.action === "download_csv_handoff") return { status: 400, body: { error: "invalid_command" } };
  const result = await runCommand(database, scope, services, command);
  const projection = await readHandoffRecoveryProjection(database, scope, services);
  return { status: result.status === "refused" ? 409 : 200, body: { command: result, projection } };
}

export type HandoffRecoveryDownload =
  | Readonly<{ kind: "invalid"; error: string }>
  | Readonly<{ kind: "refused"; command: CommandResult }>
  | Readonly<{ kind: "authorized"; artifactId: string; version: number; csvSha256: string; bytes: Uint8Array }>;

/** Re-authorizes the owner, workspace, current eligibility, and checksum, and returns the exact stored bytes. Nothing is rebuilt. */
export async function executeHandoffRecoveryDownload(
  _database: D1Database,
  scope: HandoffRecoveryScope,
  services: HandoffRecoveryServices,
  value: unknown,
): Promise<HandoffRecoveryDownload> {
  let command: HandoffRecoveryCommand;
  try {
    command = parseHandoffRecoveryCommand(value);
  } catch (error) {
    return Object.freeze({ kind: "invalid" as const, error: error instanceof UnsupportedActionError ? "unsupported_action" : "invalid_command" });
  }
  if (command.action !== "download_csv_handoff") return Object.freeze({ kind: "invalid" as const, error: "invalid_command" });
  if (!services.crm) return Object.freeze({ kind: "refused" as const, command: refusedResult(command.action, ["crm_handoff_source_unavailable"]) });
  const result = await accessCrmHandoffArtifact({ workspaceId: scope.workspaceId, artifactId: command.artifactId, ports: services.crm });
  if (result.status !== "authorized") return Object.freeze({ kind: "refused" as const, command: refusedResult(command.action, [result.reason]) });
  return Object.freeze({ kind: "authorized" as const, artifactId: result.artifactId, version: result.version, csvSha256: result.csvSha256, bytes: result.bytes });
}

async function runCommand(
  database: D1Database,
  scope: HandoffRecoveryScope,
  services: HandoffRecoveryServices,
  command: Exclude<HandoffRecoveryCommand, DownloadCsvHandoff>,
): Promise<CommandResult> {
  switch (command.action) {
    case "create_csv_handoff": {
      if (!services.crm) return refusedResult(command.action, ["crm_handoff_source_unavailable"]);
      // The service binds idempotency to the canonical snapshot; the browser supplies no key.
      const result = await materializeCrmHandoff({ workspaceId: scope.workspaceId, staleSnapshotDigest: command.snapshotDigest, ports: services.crm });
      if (result.status === "blocked") return refusedResult(command.action, [result.reason]);
      return completed(command.action, result.status === "replayed", {
        artifactId: result.artifactId, version: result.version, snapshotDigest: result.snapshotDigest,
        csvSha256: result.csvSha256, manifestSha256: result.manifestSha256, deliveryState: result.deliveryState,
      });
    }
    case "create_archive": {
      if (!services.recovery) return refusedResult(command.action, ["recovery_capability_unavailable"]);
      const ports = services.recovery.archive;
      // The envelope put is the service's first write. Once it has begun, the
      // envelope, the archive row, or its delivery event may exist, so any later
      // failure is an unknown outcome: it reaches the outer handler (503), and the
      // browser reloads the projection and audit instead of resubmitting.
      let writeBegan = false;
      const store = ports.archiveStore;
      const observed: WorkspaceArchivePorts = {
        ...ports,
        archiveStore: Object.freeze({
          putImmutable: (...args: Parameters<typeof store.putImmutable>) => { writeBegan = true; return store.putImmutable(...args); },
        }),
      };
      try {
        const created = await createWorkspaceArchive({ passphrase: command.passphrase, ports: observed });
        return completed(command.action, false, {
          archiveId: created.archiveId, manifestDigest: created.manifestDigest,
          ciphertextSha256: created.ciphertextSha256, deliveryExpiresAt: created.deliveryExpiresAt,
        });
      } catch (error) {
        if (!writeBegan && error instanceof Error && ARCHIVE_PRE_WRITE_REFUSALS.has(error.message)) return refusedResult(command.action, [error.message]);
        throw error;
      }
    }
    case "run_dry_run": {
      if (!services.recovery) return refusedResult(command.action, ["recovery_capability_unavailable"]);
      if (await services.recovery.currentRestoreArchiveRef() !== command.archiveRef) return refusedResult(command.action, ["stale_projection"]);
      const result = await dryRunRestore({ archiveRef: command.archiveRef, passphrase: command.passphrase, ports: services.recovery.restore });
      if (result.status !== "verified") return refusedResult(command.action, [result.reason]);
      return completed(command.action, false, {
        dryRunId: result.dryRunId, nonce: result.nonce, expiresAt: result.expiresAt, manifestDigest: result.manifestDigest,
        recordCount: result.recordCount, objectCount: result.objectCount, tombstoneCount: result.tombstoneCount,
      });
    }
    case "restore_verified_archive": {
      if (!services.recovery) return refusedResult(command.action, ["recovery_capability_unavailable"]);
      const now = scope.now();
      const [archiveRef, dryRun] = await Promise.all([
        services.recovery.currentRestoreArchiveRef(),
        readCurrentDryRun(database, scope, now),
      ]);
      if (archiveRef !== command.archiveRef || !dryRun || dryRun.dryRunId !== command.dryRunId) return refusedResult(command.action, ["stale_projection"]);
      // The current dry run must have verified the current candidate's exact bytes.
      if (await candidateCiphertextSha256(services.recovery.restore, archiveRef).catch(() => null) !== dryRun.archiveCiphertextSha256) {
        return refusedResult(command.action, ["stale_projection"]);
      }
      const result = await applyRestore({
        archiveRef: command.archiveRef, dryRunId: command.dryRunId, nonce: command.nonce, passphrase: command.passphrase, ports: services.recovery.restore,
      });
      if (result.status === "restored") {
        return completed(command.action, false, {
          archiveDigest: result.archiveDigest, restoreResultId: result.restoreResultId, recordCount: result.recordCount,
          objectCount: result.objectCount, effects: Object.freeze({ ...result.effects }),
        }, result.recordCount + result.objectCount);
      }
      if (result.status === "already_restored") {
        return completed(command.action, true, { archiveDigest: result.archiveDigest, auditRef: result.auditRef, effects: RESTORE_EFFECT_FENCE });
      }
      if (result.status === "rolled_back") return refusedResult(command.action, ["restore_rolled_back", result.reason]);
      return refusedResult(command.action, [result.reason]);
    }
  }
}

function completed(action: JsonAction, replayed: boolean, extra: Record<string, unknown>, targetWrites = 0): CommandResult {
  return Object.freeze({
    action, status: replayed ? "replayed" as const : "applied" as const, reasonCodes: Object.freeze([]), targetWrites,
    ...HANDOFF_RECOVERY_EFFECTS, ...extra,
  });
}

function refusedResult(action: HandoffRecoveryCommand["action"], reasons: readonly string[]): CommandResult {
  const reasonCodes = [...new Set(reasons.filter((reason) => typeof reason === "string" && REASON.test(reason)))].slice(0, 8);
  return Object.freeze({
    action, status: "refused" as const, reasonCodes: Object.freeze(reasonCodes.length > 0 ? reasonCodes : ["refused"]), targetWrites: 0,
    ...HANDOFF_RECOVERY_EFFECTS,
  });
}

// ---------------------------------------------------------------------------
// Projection
// ---------------------------------------------------------------------------

type Gate = Readonly<{ available: boolean; firstUnmetPredicate: string | null }>;

const OPEN: Gate = Object.freeze({ available: true, firstUnmetPredicate: null });
const blockedGate = (predicate: string): Gate => Object.freeze({ available: false, firstUnmetPredicate: predicate });

/** The authoritative owner projection. Every value is bounded; no contact value, passphrase, nonce, object key, or actor subject is included. */
export async function readHandoffRecoveryProjection(database: D1Database, scope: HandoffRecoveryScope, services: HandoffRecoveryServices) {
  const now = scope.now();
  if (!Number.isSafeInteger(now) || now <= 0) throw new TypeError("invalid server clock");
  const [context, handoff, recovery] = await Promise.all([
    readContext(database, scope, now),
    readHandoff(database, scope, services, now),
    readRecovery(database, scope, services, now),
  ]);
  return Object.freeze({
    schema: HANDOFF_RECOVERY_PROJECTION_SCHEMA,
    generatedAt: now,
    mode: services.mode,
    context,
    handoff,
    recovery,
    authority: HANDOFF_RECOVERY_AUTHORITY,
    effects: HANDOFF_RECOVERY_EFFECTS,
  });
}

/** Scope context and the display-only Phase 4 schedule state, through the existing read-only Morning Brief read. */
async function readContext(database: D1Database, scope: HandoffRecoveryScope, now: number) {
  const asOf = new Date(now).toISOString();
  const week = torontoWeekForInstant(asOf);
  const principal: MorningBriefPrincipal = { subject: scope.ownerSubject };
  let profiles: readonly Record<string, unknown>[] = [];
  let briefStatus: "available" | "unavailable" = "unavailable";
  try {
    const brief = await readMorningBrief(database, principal, {
      asOf, reviewWindowStart: week.start.instant, reviewWindowEndExclusive: week.endExclusive.instant,
    });
    if (brief.status === "available" && brief.workspaceId === scope.workspaceId) {
      briefStatus = "available";
      profiles = brief.profiles.slice(0, 16).map((profile) => Object.freeze({
        companyId: profile.scope.companyId,
        productId: profile.scope.productId,
        marketPlayId: profile.scope.marketPlayId,
        profileId: profile.scope.profileId,
        profileName: profile.scope.profileName,
        profileLifecycle: profile.scope.profileLifecycle,
        configurationDigest: profile.scope.activeConfigurationDigest,
        schedule: Object.freeze({
          status: profile.schedule.status,
          cadence: profile.schedule.definition.cadence,
          localTime: profile.schedule.definition.localTime,
          timeZone: profile.schedule.definition.timeZone,
          reportedState: profile.schedule.reportedState,
          readinessRef: profile.schedule.readinessRef,
          observedAt: profile.schedule.observedAt,
          reasonCodes: Object.freeze([...profile.schedule.reasonCodes]),
          changeableFromThisSurface: false as const,
        }),
      }));
    }
  } catch {
    // The upstream read is optional context here; its absence is reported, never recreated locally.
  }
  return Object.freeze({ workspaceId: scope.workspaceId, briefStatus, profiles: Object.freeze(profiles) });
}

const NOT_EXPORT_READY_REASONS = new Set(["not_export_ready", "cross_workspace", "deleted", "alias_merge", "row_cells_invalid"]);

async function readHandoff(database: D1Database, scope: HandoffRecoveryScope, services: HandoffRecoveryServices, now: number) {
  const history = await readHandoffHistory(database, scope, now);
  if (!services.crm) return Object.freeze({ gate: blockedGate("crm_handoff_source_unavailable"), selection: null, history });
  let plan;
  try {
    plan = await planCrmHandoff({ workspaceId: scope.workspaceId, ports: services.crm });
  } catch {
    return Object.freeze({ gate: blockedGate("authority_unavailable"), selection: null, history });
  }
  const exclusions: Record<string, number> = {};
  for (const entry of plan.exclusions) exclusions[entry.reason] = (exclusions[entry.reason] ?? 0) + 1;
  const eligibleProspects = new Set(plan.rows.map((row) => row.prospectId));
  const exportReady = new Set([
    ...eligibleProspects,
    ...plan.exclusions.filter((entry) => !NOT_EXPORT_READY_REASONS.has(entry.reason) && entry.prospectId !== "unknown").map((entry) => entry.prospectId),
  ]);
  const selection = Object.freeze({
    snapshotDigest: plan.snapshotDigest,
    evaluatedAt: now,
    schemaVersion: `crm-csv/v${CRM_CSV_SCHEMA_VERSION}`,
    configurationDigest: plan.authority.configurationDigest,
    exportDefinitionDigest: plan.authority.exportDefinitionDigest,
    packageDigests: Object.freeze([...new Set(plan.rows.map((row) => row.packageDigest))].sort().slice(0, 16)),
    exportReadyProspectCount: exportReady.size,
    uniqueEligibleProspectCount: eligibleProspects.size,
    eligibleContactRowCount: plan.rows.length,
    nonContactableCount: plan.nonContactable.length,
    exclusions: Object.freeze(exclusions),
  });
  return Object.freeze({ gate: plan.rows.length === 0 ? blockedGate("no_eligible_rows") : OPEN, selection, history });
}

type ArtifactRow = {
  id: string; schema_version: string; content_sha256: string; manifest_json: string; manifest_digest: string; row_count: number;
  prospect_count: number; created_at: number; issued_expires_at: number | null; terminal_kind: string | null; audit_id: string | null;
};

async function readHandoffHistory(database: D1Database, scope: HandoffRecoveryScope, now: number) {
  const rows = (await database.prepare(
    `SELECT artifact.id,artifact.schema_version,artifact.content_sha256,artifact.manifest_json,artifact.manifest_digest,
       artifact.row_count,artifact.prospect_count,artifact.created_at,
       (SELECT issued.expires_at FROM handoff_delivery_events issued WHERE issued.workspace_id=artifact.workspace_id
         AND issued.subject_kind='export_artifact' AND issued.subject_id=artifact.id AND issued.event_kind='issued' LIMIT 1) issued_expires_at,
       (SELECT terminal.event_kind FROM handoff_delivery_events terminal WHERE terminal.workspace_id=artifact.workspace_id
         AND terminal.subject_kind='export_artifact' AND terminal.subject_id=artifact.id AND terminal.event_kind<>'issued' LIMIT 1) terminal_kind,
       (SELECT audit.id FROM handoff_recovery_audit_events audit WHERE audit.workspace_id=artifact.workspace_id
         AND audit.command_id=artifact.command_id LIMIT 1) audit_id
     FROM handoff_export_artifacts artifact
     JOIN workspaces w ON w.id=artifact.workspace_id AND w.owner_subject=?
     WHERE artifact.workspace_id=? ORDER BY artifact.created_at DESC,artifact.id DESC LIMIT ?`,
  ).bind(scope.ownerSubject, scope.workspaceId, MAX_HISTORY).all<ArtifactRow>()).results ?? [];
  const history = [];
  for (const row of rows) {
    const envelope = parseJson(row.manifest_json);
    if (!plainRecord(envelope) || envelope.schema !== CRM_HANDOFF_STORE_SCHEMA || !validId(envelope.artifactId) || !Number.isSafeInteger(envelope.version)) continue;
    const expiresAt = row.issued_expires_at === null ? null : Number(row.issued_expires_at);
    const deliveryState = expiresAt === null ? "failed"
      : row.terminal_kind === "expired" || row.terminal_kind === "failed" ? row.terminal_kind
        : expiresAt <= now ? "expired" : "available";
    history.push(Object.freeze({
      artifactId: envelope.artifactId as string,
      manifestId: row.id,
      version: envelope.version as number,
      schemaVersion: boundedVersion(row.schema_version),
      selectedAt: Number(row.created_at),
      rowCount: Number(row.row_count),
      prospectCount: Number(row.prospect_count),
      csvSha256: digestOrEmpty(row.content_sha256),
      manifestDigest: digestOrEmpty(row.manifest_digest),
      snapshotDigest: digestOrEmpty(envelope.snapshotDigest),
      sourceWorkspaceId: scope.workspaceId,
      deliveryState,
      deliveryExpiresAt: expiresAt,
      auditRef: validId(row.audit_id) ? row.audit_id : null,
    }));
  }
  return Object.freeze(history);
}

async function readRecovery(database: D1Database, scope: HandoffRecoveryScope, services: HandoffRecoveryServices, now: number) {
  const [archives, dryRuns, restores, ledger, currentDryRun] = await Promise.all([
    readArchives(database, scope),
    readDryRuns(database, scope),
    readRestores(database, scope),
    readLedger(database, scope),
    readCurrentDryRun(database, scope, now),
  ]);
  const base = { archives, dryRuns, restores, ledger, effectFence: RESTORE_EFFECT_FENCE };
  if (!services.recovery) {
    const gate = blockedGate("recovery_capability_unavailable");
    return Object.freeze({
      ...base, reauthentication: Object.freeze({ state: "missing" as const, reauthenticatedAt: null }),
      gates: Object.freeze({ archive: gate, dryRun: gate, restore: gate }), candidate: null, currentDryRun: null, target: null,
    });
  }
  const recovery = services.recovery;
  const [authority, archiveRef, target] = await Promise.all([
    recovery.archive.authority.current().catch(() => null),
    recovery.currentRestoreArchiveRef().catch(() => null),
    recovery.restore.evidence.readRestoreTargetState().catch(() => null),
  ]);
  const reauthentication = reauthState(authority, scope, now);
  const authorityGate = reauthentication.state === "missing" ? blockedGate("not_authorized")
    : reauthentication.state === "stale" ? blockedGate("reauthentication_required") : null;
  const candidate = validId(archiveRef) ? Object.freeze({ archiveRef }) : null;
  const targetState = target ? Object.freeze({ clean: target.clean === true, restoreApplied: target.restoreApplied === true }) : null;
  const dryRunGate = authorityGate ?? (!candidate ? blockedGate("no_uploaded_archive")
    : !targetState ? blockedGate("target_state_unavailable")
      : targetState.restoreApplied ? blockedGate("target_already_restored")
        : !targetState.clean ? blockedGate("target_not_clean") : OPEN);
  const dryRunMatchesCandidate = currentDryRun !== null && candidate !== null
    && await candidateCiphertextSha256(recovery.restore, candidate.archiveRef).catch(() => null) === currentDryRun.archiveCiphertextSha256;
  const restoreGate = authorityGate ?? (!candidate ? blockedGate("no_uploaded_archive")
    : !targetState ? blockedGate("target_state_unavailable")
      : targetState.restoreApplied ? blockedGate("target_already_restored")
        : !targetState.clean ? blockedGate("target_not_clean")
          : !currentDryRun ? blockedGate("dry_run_required")
            : !dryRunMatchesCandidate ? blockedGate("dry_run_not_current") : OPEN);
  return Object.freeze({
    ...base, reauthentication,
    gates: Object.freeze({ archive: authorityGate ?? OPEN, dryRun: dryRunGate, restore: restoreGate }),
    candidate, currentDryRun: targetState?.restoreApplied || !currentDryRun ? null : projectedDryRun(currentDryRun), target: targetState,
  });
}

function reauthState(authority: RecoveryAuthority | null, scope: HandoffRecoveryScope, now: number) {
  if (!authority || authority.workspaceId !== scope.workspaceId || !Number.isSafeInteger(authority.reauthenticatedAt)) {
    return Object.freeze({ state: "missing" as const, reauthenticatedAt: null });
  }
  const fresh = authority.reauthenticatedAt <= now && now - authority.reauthenticatedAt <= REAUTH_MAX_AGE_MS;
  return Object.freeze({ state: fresh ? "fresh" as const : "stale" as const, reauthenticatedAt: authority.reauthenticatedAt });
}

/** The SHA-256 of the candidate upload's exact bytes, which a dry run records as `archive_ciphertext_sha256`; null when unavailable. */
async function candidateCiphertextSha256(restore: RestorePorts, archiveRef: string | null): Promise<string | null> {
  if (!validId(archiveRef)) return null;
  const upload = await restore.archives.readArchive(archiveRef);
  if (!upload || !(upload.bytes instanceof Uint8Array)) return null;
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", upload.bytes as BufferSource));
  return [...hash].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

type CurrentDryRun = NonNullable<Awaited<ReturnType<typeof readCurrentDryRun>>>;

/** The browser sees the dry run's references, not the internal ciphertext binding. */
function projectedDryRun(run: CurrentDryRun) {
  return Object.freeze({
    dryRunId: run.dryRunId, archiveManifestDigest: run.archiveManifestDigest, archiveSchemaVersion: run.archiveSchemaVersion,
    expiresAt: run.expiresAt, createdAt: run.createdAt,
  });
}

/** The latest accepted, unexpired, unlocked dry run in this workspace. The browser never names it. */
async function readCurrentDryRun(database: D1Database, scope: HandoffRecoveryScope, now: number) {
  const row = await database.prepare(
    `SELECT run.id,run.archive_manifest_digest,run.archive_ciphertext_sha256,run.archive_schema_version,run.expires_at,run.created_at FROM recovery_dry_runs run
     JOIN workspaces w ON w.id=run.workspace_id AND w.owner_subject=?
     WHERE run.workspace_id=? AND run.outcome='accepted' AND run.expires_at>?
       AND NOT EXISTS (SELECT 1 FROM recovery_restore_locks lock WHERE lock.workspace_id=run.workspace_id AND lock.dry_run_id=run.id)
     ORDER BY run.created_at DESC,run.id DESC LIMIT 1`,
  ).bind(scope.ownerSubject, scope.workspaceId, now).first<{ id: string; archive_manifest_digest: string; archive_ciphertext_sha256: string; archive_schema_version: string; expires_at: number; created_at: number }>();
  if (!row || !validId(row.id)) return null;
  return Object.freeze({
    dryRunId: row.id, archiveManifestDigest: digestOrEmpty(row.archive_manifest_digest), archiveSchemaVersion: boundedVersion(row.archive_schema_version),
    archiveCiphertextSha256: digestOrEmpty(row.archive_ciphertext_sha256),
    expiresAt: Number(row.expires_at), createdAt: Number(row.created_at),
  });
}

async function readArchives(database: D1Database, scope: HandoffRecoveryScope) {
  const rows = (await database.prepare(
    `SELECT archive.id,archive.format_version,archive.schema_version,archive.manifest_digest,archive.ciphertext_sha256,archive.byte_length,
       archive.record_count,archive.object_count,archive.tombstone_count,archive.created_at,
       (SELECT issued.expires_at FROM handoff_delivery_events issued WHERE issued.workspace_id=archive.workspace_id
         AND issued.subject_kind='recovery_archive' AND issued.subject_id=archive.id AND issued.event_kind='issued' LIMIT 1) delivery_expires_at
     FROM recovery_archives archive JOIN workspaces w ON w.id=archive.workspace_id AND w.owner_subject=?
     WHERE archive.workspace_id=? ORDER BY archive.created_at DESC,archive.id DESC LIMIT ?`,
  ).bind(scope.ownerSubject, scope.workspaceId, MAX_HISTORY).all<{
    id: string; format_version: string; schema_version: string; manifest_digest: string; ciphertext_sha256: string; byte_length: number;
    record_count: number; object_count: number; tombstone_count: number; created_at: number; delivery_expires_at: number | null;
  }>()).results ?? [];
  return Object.freeze(rows.filter((row) => validId(row.id)).map((row) => Object.freeze({
    archiveId: row.id, formatVersion: boundedVersion(row.format_version), schemaVersion: boundedVersion(row.schema_version),
    manifestDigest: digestOrEmpty(row.manifest_digest), ciphertextSha256: digestOrEmpty(row.ciphertext_sha256), byteLength: Number(row.byte_length),
    recordCount: Number(row.record_count), objectCount: Number(row.object_count), tombstoneCount: Number(row.tombstone_count),
    createdAt: Number(row.created_at), deliveryExpiresAt: row.delivery_expires_at === null ? null : Number(row.delivery_expires_at),
  })));
}

async function readDryRuns(database: D1Database, scope: HandoffRecoveryScope) {
  const rows = (await database.prepare(
    `SELECT run.id,run.outcome,run.reason_code,run.archive_manifest_digest,run.expires_at,run.created_at FROM recovery_dry_runs run
     JOIN workspaces w ON w.id=run.workspace_id AND w.owner_subject=?
     WHERE run.workspace_id=? ORDER BY run.created_at DESC,run.id DESC LIMIT ?`,
  ).bind(scope.ownerSubject, scope.workspaceId, MAX_HISTORY).all<{ id: string; outcome: string; reason_code: string; archive_manifest_digest: string; expires_at: number | null; created_at: number }>()).results ?? [];
  return Object.freeze(rows.filter((row) => validId(row.id)).map((row) => Object.freeze({
    dryRunId: row.id, outcome: row.outcome === "accepted" ? "accepted" as const : "refused" as const, reasonCode: boundedCode(row.reason_code),
    archiveManifestDigest: digestOrEmpty(row.archive_manifest_digest), expiresAt: row.expires_at === null ? null : Number(row.expires_at),
    createdAt: Number(row.created_at), targetWrites: 0 as const,
  })));
}

async function readRestores(database: D1Database, scope: HandoffRecoveryScope) {
  const rows = (await database.prepare(
    `SELECT result.id,result.outcome,result.reason_code,result.restored_record_count,result.restored_object_count,result.result_digest,
       result.schedules_enabled,result.effects_enabled,result.completed_at FROM recovery_restore_results result
     JOIN workspaces w ON w.id=result.workspace_id AND w.owner_subject=?
     WHERE result.workspace_id=? ORDER BY result.completed_at DESC,result.id DESC LIMIT ?`,
  ).bind(scope.ownerSubject, scope.workspaceId, MAX_HISTORY).all<{
    id: string; outcome: string; reason_code: string; restored_record_count: number; restored_object_count: number; result_digest: string;
    schedules_enabled: number; effects_enabled: number; completed_at: number;
  }>()).results ?? [];
  return Object.freeze(rows.filter((row) => validId(row.id)).map((row) => Object.freeze({
    restoreResultId: row.id, outcome: row.outcome === "applied" ? "applied" as const : "rolled_back" as const, reasonCode: boundedCode(row.reason_code),
    restoredRecordCount: Number(row.restored_record_count), restoredObjectCount: Number(row.restored_object_count),
    resultDigest: digestOrEmpty(row.result_digest), completedAt: Number(row.completed_at),
    // 0023 pins both to 0; anything else is reported as a violation, never as enabled.
    schedulesEnabled: Number(row.schedules_enabled) === 0 ? false as const : null,
    effectsEnabled: Number(row.effects_enabled) === 0 ? false as const : null,
  })));
}

/** Bounded audit ledger. The actor is reported by role; the raw owner subject never leaves the server. */
async function readLedger(database: D1Database, scope: HandoffRecoveryScope) {
  const rows = (await database.prepare(
    `SELECT audit.id,audit.action,audit.subject_kind,audit.subject_id,audit.outcome,audit.reason_code,audit.material_digest,audit.created_at
     FROM handoff_recovery_audit_events audit JOIN workspaces w ON w.id=audit.workspace_id AND w.owner_subject=?
     WHERE audit.workspace_id=? ORDER BY audit.created_at DESC,audit.id DESC LIMIT ?`,
  ).bind(scope.ownerSubject, scope.workspaceId, MAX_LEDGER).all<{
    id: string; action: string; subject_kind: string; subject_id: string | null; outcome: string; reason_code: string; material_digest: string; created_at: number;
  }>()).results ?? [];
  return Object.freeze(rows.filter((row) => validId(row.id)).map((row) => Object.freeze({
    id: row.id, action: boundedCode(row.action), subjectKind: boundedCode(row.subject_kind),
    subjectId: validId(row.subject_id) ? row.subject_id : null, outcome: row.outcome === "recorded" ? "recorded" as const : "refused" as const,
    reasonCode: boundedCode(row.reason_code), materialDigest: digestOrEmpty(row.material_digest), createdAt: Number(row.created_at),
    actorRole: "owner" as const,
  })));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function plainRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}
function validId(value: unknown): value is string { return typeof value === "string" && ID.test(value); }
function parseJson(value: unknown): unknown { try { return typeof value === "string" ? JSON.parse(value) : null; } catch { return null; } }
function boundedCode(value: unknown) { return typeof value === "string" && REASON.test(value) ? value : "unspecified"; }
function boundedVersion(value: unknown) { return typeof value === "string" && VERSION.test(value) ? value : "unknown"; }
function digestOrEmpty(value: unknown) { return typeof value === "string" && DIGEST.test(value) ? value : ""; }
function json(value: unknown, status = 200) { return Response.json(value, { status, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } }); }
function privateWorkspaceUnavailable() { return json({ error: "private_workspace_unavailable" }, 404); }
export function handoffRecoveryUnavailable() { return json({ error: "handoff_recovery_unavailable" }, 503); }
