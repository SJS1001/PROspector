import React from "react";

/**
 * Pure Exports & History leaves (07-09, local). They render a normalized
 * server projection as escaped text: status words, ledgers, and evidence
 * tables. They never fetch, retry, decide eligibility, derive schedule or
 * readiness, or render a contact value, passphrase, nonce digest, object key,
 * or actor subject. Controls live in the single data-owning workspace.
 */

export type Gate = Readonly<{ available: boolean; firstUnmetPredicate: string | null }>;
export type SafeRef = Readonly<{ id: string; digest: string }>;
export type ScheduleView = Readonly<{
  status: string; cadence: string; localTime: string; timeZone: string; reportedState: "enabled" | "disabled" | null;
  readinessRef: SafeRef | null; observedAt: string | null; reasonCodes: readonly string[]; changeableFromThisSurface: false;
}>;
export type ProfileContext = Readonly<{
  companyId: string; productId: string; marketPlayId: string; profileId: string; profileName: string;
  profileLifecycle: string; configurationDigest: string; schedule: ScheduleView;
}>;
export type HandoffSelection = Readonly<{
  snapshotDigest: string; evaluatedAt: number; schemaVersion: string; configurationDigest: string; exportDefinitionDigest: string;
  packageDigests: readonly string[]; exportReadyProspectCount: number; uniqueEligibleProspectCount: number;
  eligibleContactRowCount: number; nonContactableCount: number; exclusions: Readonly<Record<string, number>>;
}>;
export type HandoffHistoryEntry = Readonly<{
  artifactId: string; manifestId: string; version: number; schemaVersion: string; selectedAt: number; rowCount: number;
  prospectCount: number; csvSha256: string; manifestDigest: string; snapshotDigest: string; sourceWorkspaceId: string;
  deliveryState: "available" | "expired" | "failed"; deliveryExpiresAt: number | null; auditRef: string | null;
}>;
export type ArchiveEntry = Readonly<{
  archiveId: string; formatVersion: string; schemaVersion: string; manifestDigest: string; ciphertextSha256: string; byteLength: number;
  recordCount: number; objectCount: number; tombstoneCount: number; createdAt: number; deliveryExpiresAt: number | null;
}>;
export type DryRunEntry = Readonly<{
  dryRunId: string; outcome: "accepted" | "refused"; reasonCode: string; archiveManifestDigest: string;
  expiresAt: number | null; createdAt: number;
}>;
export type RestoreEntry = Readonly<{
  restoreResultId: string; outcome: "applied" | "rolled_back"; reasonCode: string; restoredRecordCount: number;
  restoredObjectCount: number; resultDigest: string; completedAt: number; schedulesEnabled: false | null; effectsEnabled: false | null;
}>;
export type LedgerEntry = Readonly<{
  id: string; action: string; subjectKind: string; subjectId: string | null; outcome: "recorded" | "refused";
  reasonCode: string; createdAt: number; actorRole: "owner";
}>;
export type CurrentDryRun = Readonly<{ dryRunId: string; archiveManifestDigest: string; archiveSchemaVersion: string; expiresAt: number; createdAt: number }>;
export type EffectFence = Readonly<{ scheduler: string; runner: string; outbox: string; provider: string; delivery: string }>;

export type HandoffRecoveryProjection = Readonly<{
  schema: "handoff-recovery-projection/v1";
  generatedAt: number;
  mode: "production" | "synthetic";
  context: Readonly<{ workspaceId: string; briefStatus: "available" | "unavailable"; profiles: readonly ProfileContext[] }>;
  handoff: Readonly<{ gate: Gate; selection: HandoffSelection | null; history: readonly HandoffHistoryEntry[] }>;
  recovery: Readonly<{
    reauthentication: Readonly<{ state: "fresh" | "stale" | "missing"; reauthenticatedAt: number | null }>;
    gates: Readonly<{ archive: Gate; dryRun: Gate; restore: Gate }>;
    candidate: Readonly<{ archiveRef: string }> | null;
    currentDryRun: CurrentDryRun | null;
    target: Readonly<{ clean: boolean; restoreApplied: boolean }> | null;
    archives: readonly ArchiveEntry[]; dryRuns: readonly DryRunEntry[]; restores: readonly RestoreEntry[]; ledger: readonly LedgerEntry[];
    effectFence: EffectFence;
  }>;
}>;

// ---------------------------------------------------------------------------
// Copy (07-UI-SPEC)
// ---------------------------------------------------------------------------

export const PILOT_BANNER_COPY = "Controlled pilot — all displayed records are illustrative or synthetic until the required Phase 3–6 authority and Phase 7 release gates are accepted. This Phase 7 surface cannot change schedules, providers, outreach, or restore effects; restored targets remain disabled.";
export const SYNTHETIC_LABEL = "Synthetic fixture — not a lead, contact, pilot outcome, or import.";
export const CONTACT_ROW_DISTINCTION = "One Prospect can contribute more than one row. Contact rows are not the weekly seven-lead metric.";
export const HANDOFF_RECHECK_COPY = "The server rechecks eligibility and Company-wide suppression before it materializes this file. No CRM sync or outreach will occur.";
export const HANDOFF_EMPTY_COPY = "No eligible contact rows are available for CSV handoff. Export-ready Prospects, fresh verified contacts, an approved package, and no Company-wide suppression are required.";
export const HANDOFF_LOADING_COPY = "Loading current eligibility projection and immutable handoff history…";
export const HANDOFF_ERROR_COPY = "CSV handoff could not load the current eligibility projection. No file was created or delivered.";
export const RECOVERY_LOADING_COPY = "Loading archive and recovery evidence…";
export const RECOVERY_ERROR_COPY = "Recovery status could not be loaded. No archive, dry run, restore, or external effect was started.";
export const RECOVERY_EMPTY_COPY = "No authorized archive or recovery evidence is available. A recent owner reauthentication and accepted archive capability gate are required before recovery can begin.";
export const REAUTH_REQUIRED_COPY = "Recent owner reauthentication is required before an archive operation. No archive was created.";
export const ARCHIVE_UNAVAILABLE_COPY = "Workspace archive is unavailable until authorization, encryption capability, and delivery gates are proven. No workspace data was exported.";
export const ARCHIVE_CREATED_COPY = "Encrypted archive created.";
export const DRY_RUN_PENDING_COPY = "Verifying archive and clean target without writing target data…";
export const DRY_RUN_VERIFIED_COPY = "Dry run verified — no target data, schedules, runners, sends, providers, or delivery state changed.";
export const VERIFICATION_FAILED_COPY = "Archive verification failed. No target data or operational state changed.";
export const RESTORE_BLOCKED_COPY = "Restore blocked. The target remains unchanged. Review the bounded recovery evidence before preparing a clean compatible target.";
export const RESTORE_APPLYING_COPY = "Applying the verified archive to the approved clean target…";
export const RESTORE_COMPLETE_COPY = "Restore complete — all schedules, runners, outboxes, providers, and delivery remain disabled.";
export const RECOVERY_UNKNOWN_COPY = "The recovery outcome could not be verified. Nothing will be retried automatically. Load the current recovery audit.";
export const RESTORE_EFFECT_COPY = "This applies no schedule, runner, send, provider, or delivery authority. All effects remain disabled after restore.";
export const RESTORE_CONFIRMATION_COPY = "Restore this verified archive into the approved clean compatible target? This cannot enable schedules, runners, sends, provider calls, or delivery. The target must remain clean and all effects will stay disabled.";
export const SCHEDULE_BLOCKED_COPY = "Schedule state is reported from Phase 4 only — weekday 06:00 America/Toronto is not current upstream. This view cannot enable it or start a runner.";

const PREDICATE_TEXT: Readonly<Record<string, string>> = Object.freeze({
  crm_handoff_source_unavailable: "no current CSV handoff source is composed",
  authority_unavailable: "current Phase 3–6 authority being unavailable",
  no_eligible_rows: "no eligible contact rows",
  snapshot_stale: "a changed eligibility snapshot",
  recovery_capability_unavailable: "recovery capability (reauthentication, encrypted upload, and clean target) not being composed",
  not_authorized: "owner authorization not being current",
  reauthentication_required: "recent owner reauthentication being required",
  no_uploaded_archive: "no server-issued archive upload",
  target_state_unavailable: "the restore target state being unavailable",
  target_not_clean: "the target not being clean",
  target_already_restored: "the target already holding a restore",
  dry_run_required: "no current verified dry run",
});

export function predicateText(code: string | null): string {
  if (!code) return "an unknown predicate";
  return PREDICATE_TEXT[code] ?? code.replace(/_/gu, " ");
}

export function handoffBlockedCopy(code: string | null): string {
  return `CSV handoff is blocked by ${predicateText(code)}. No CRM sync, contact delivery, or outreach will occur.`;
}

const VERIFICATION_FAILURES = new Set([
  "not_authorized", "archive_untrusted", "archive_verification_failed", "archive_expired", "archive_unavailable",
  "restore_request_invalid", "reauthentication_required",
]);
const RESTORE_BLOCKED_REASONS = new Set([
  "target_not_clean", "target_effects_enabled", "archive_object_missing", "archive_invariant_failed", "archive_incompatible",
  "schema_incompatible", "restore_rolled_back", "restore_lock_unavailable", "dry_run_not_accepted", "stale_projection",
]);

/** Wrong passphrase, tampering, expiry, and authorization stay indistinguishable to the reader. */
export function recoveryRefusalCopy(reason: string): string {
  if (reason === "reauthentication_required") return REAUTH_REQUIRED_COPY;
  if (reason === "recovery_capability_unavailable") return ARCHIVE_UNAVAILABLE_COPY;
  if (RESTORE_BLOCKED_REASONS.has(reason)) return RESTORE_BLOCKED_COPY;
  if (VERIFICATION_FAILURES.has(reason)) return VERIFICATION_FAILED_COPY;
  return VERIFICATION_FAILED_COPY;
}

// ---------------------------------------------------------------------------
// Normalization: the projection is data, never trusted structure
// ---------------------------------------------------------------------------

const ID = /^[A-Za-z0-9](?:[A-Za-z0-9._:-]{0,126}[A-Za-z0-9])?$/u;
const DIGEST = /^[a-f0-9]{64}$/u;
const CODE = /^[a-z0-9](?:[a-z0-9._:-]{0,78}[a-z0-9])?$/u;
const VERSION = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

type Rec = Record<string, unknown>;
const rec = (value: unknown): value is Rec => !!value && typeof value === "object" && !Array.isArray(value);
const id = (value: unknown): value is string => typeof value === "string" && ID.test(value);
const digest = (value: unknown): value is string => typeof value === "string" && DIGEST.test(value);
const code = (value: unknown): value is string => typeof value === "string" && CODE.test(value);
const count = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
const time = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0;
const text = (value: unknown, max = 200): value is string => typeof value === "string" && value.length > 0 && value.length <= max;
const list = <T,>(value: unknown, map: (item: unknown) => T | null, max = 50): readonly T[] =>
  Object.freeze((Array.isArray(value) ? value : []).slice(0, max).map(map).filter((item): item is T => item !== null));

function gate(value: unknown): Gate | null {
  if (!rec(value) || typeof value.available !== "boolean") return null;
  if (value.available) return value.firstUnmetPredicate === null ? Object.freeze({ available: true, firstUnmetPredicate: null }) : null;
  return code(value.firstUnmetPredicate) ? Object.freeze({ available: false, firstUnmetPredicate: value.firstUnmetPredicate }) : null;
}

function safeRef(value: unknown): SafeRef | null {
  return rec(value) && id(value.id) && digest(value.digest) ? Object.freeze({ id: value.id, digest: value.digest }) : null;
}

function schedule(value: unknown): ScheduleView | null {
  if (!rec(value) || !code(value.status) || !code(value.cadence) || !text(value.localTime, 5) || !text(value.timeZone, 64)) return null;
  if (value.changeableFromThisSurface !== false) return null;
  const reportedState = value.reportedState === "enabled" || value.reportedState === "disabled" ? value.reportedState : null;
  return Object.freeze({
    status: value.status, cadence: value.cadence, localTime: value.localTime, timeZone: value.timeZone, reportedState,
    readinessRef: safeRef(value.readinessRef), observedAt: typeof value.observedAt === "string" && ISO.test(value.observedAt) ? value.observedAt : null,
    reasonCodes: list(value.reasonCodes, (item) => code(item) ? item : null, 16), changeableFromThisSurface: false as const,
  });
}

function profile(value: unknown): ProfileContext | null {
  if (!rec(value) || !id(value.companyId) || !id(value.productId) || !id(value.marketPlayId) || !id(value.profileId)) return null;
  const view = schedule(value.schedule);
  if (!text(value.profileName) || !code(value.profileLifecycle) || !digest(value.configurationDigest) || !view) return null;
  return Object.freeze({
    companyId: value.companyId, productId: value.productId, marketPlayId: value.marketPlayId, profileId: value.profileId,
    profileName: value.profileName, profileLifecycle: value.profileLifecycle, configurationDigest: value.configurationDigest, schedule: view,
  });
}

function selection(value: unknown): HandoffSelection | null {
  if (!rec(value) || !digest(value.snapshotDigest) || !time(value.evaluatedAt) || !text(value.schemaVersion, 64)) return null;
  if (!digest(value.configurationDigest) || !digest(value.exportDefinitionDigest) || !rec(value.exclusions)) return null;
  const counts = [value.exportReadyProspectCount, value.uniqueEligibleProspectCount, value.eligibleContactRowCount, value.nonContactableCount];
  if (!counts.every(count)) return null;
  const exclusions: Record<string, number> = {};
  for (const [reason, total] of Object.entries(value.exclusions).slice(0, 32)) if (code(reason) && count(total)) exclusions[reason] = total;
  return Object.freeze({
    snapshotDigest: value.snapshotDigest, evaluatedAt: value.evaluatedAt, schemaVersion: value.schemaVersion,
    configurationDigest: value.configurationDigest, exportDefinitionDigest: value.exportDefinitionDigest,
    packageDigests: list(value.packageDigests, (item) => digest(item) ? item : null, 16),
    exportReadyProspectCount: value.exportReadyProspectCount as number, uniqueEligibleProspectCount: value.uniqueEligibleProspectCount as number,
    eligibleContactRowCount: value.eligibleContactRowCount as number, nonContactableCount: value.nonContactableCount as number,
    exclusions: Object.freeze(exclusions),
  });
}

function historyEntry(value: unknown): HandoffHistoryEntry | null {
  if (!rec(value) || !id(value.artifactId) || !id(value.manifestId) || !count(value.version) || !time(value.selectedAt)) return null;
  if (!count(value.rowCount) || !count(value.prospectCount) || !digest(value.csvSha256) || !digest(value.manifestDigest) || !id(value.sourceWorkspaceId)) return null;
  if (value.deliveryState !== "available" && value.deliveryState !== "expired" && value.deliveryState !== "failed") return null;
  return Object.freeze({
    artifactId: value.artifactId, manifestId: value.manifestId, version: value.version, schemaVersion: typeof value.schemaVersion === "string" && VERSION.test(value.schemaVersion) ? value.schemaVersion : "unknown",
    selectedAt: value.selectedAt, rowCount: value.rowCount, prospectCount: value.prospectCount, csvSha256: value.csvSha256,
    manifestDigest: value.manifestDigest, snapshotDigest: digest(value.snapshotDigest) ? value.snapshotDigest : "", sourceWorkspaceId: value.sourceWorkspaceId,
    deliveryState: value.deliveryState, deliveryExpiresAt: time(value.deliveryExpiresAt) ? value.deliveryExpiresAt : null,
    auditRef: id(value.auditRef) ? value.auditRef : null,
  });
}

function archiveEntry(value: unknown): ArchiveEntry | null {
  if (!rec(value) || !id(value.archiveId) || !digest(value.manifestDigest) || !digest(value.ciphertextSha256) || !time(value.createdAt)) return null;
  if (![value.byteLength, value.recordCount, value.objectCount, value.tombstoneCount].every(count)) return null;
  return Object.freeze({
    archiveId: value.archiveId, formatVersion: typeof value.formatVersion === "string" && VERSION.test(value.formatVersion) ? value.formatVersion : "unknown",
    schemaVersion: typeof value.schemaVersion === "string" && VERSION.test(value.schemaVersion) ? value.schemaVersion : "unknown",
    manifestDigest: value.manifestDigest, ciphertextSha256: value.ciphertextSha256, byteLength: value.byteLength as number,
    recordCount: value.recordCount as number, objectCount: value.objectCount as number, tombstoneCount: value.tombstoneCount as number,
    createdAt: value.createdAt, deliveryExpiresAt: time(value.deliveryExpiresAt) ? value.deliveryExpiresAt : null,
  });
}

function dryRunEntry(value: unknown): DryRunEntry | null {
  if (!rec(value) || !id(value.dryRunId) || (value.outcome !== "accepted" && value.outcome !== "refused") || !code(value.reasonCode) || !time(value.createdAt)) return null;
  return Object.freeze({
    dryRunId: value.dryRunId, outcome: value.outcome, reasonCode: value.reasonCode,
    archiveManifestDigest: digest(value.archiveManifestDigest) ? value.archiveManifestDigest : "", expiresAt: time(value.expiresAt) ? value.expiresAt : null, createdAt: value.createdAt,
  });
}

function restoreEntry(value: unknown): RestoreEntry | null {
  if (!rec(value) || !id(value.restoreResultId) || (value.outcome !== "applied" && value.outcome !== "rolled_back") || !code(value.reasonCode)) return null;
  if (!count(value.restoredRecordCount) || !count(value.restoredObjectCount) || !time(value.completedAt)) return null;
  return Object.freeze({
    restoreResultId: value.restoreResultId, outcome: value.outcome, reasonCode: value.reasonCode,
    restoredRecordCount: value.restoredRecordCount as number, restoredObjectCount: value.restoredObjectCount as number,
    resultDigest: digest(value.resultDigest) ? value.resultDigest : "", completedAt: value.completedAt,
    schedulesEnabled: value.schedulesEnabled === false ? false : null, effectsEnabled: value.effectsEnabled === false ? false : null,
  });
}

function ledgerEntry(value: unknown): LedgerEntry | null {
  if (!rec(value) || !id(value.id) || !code(value.action) || !code(value.subjectKind) || !code(value.reasonCode) || !time(value.createdAt)) return null;
  if ((value.outcome !== "recorded" && value.outcome !== "refused") || value.actorRole !== "owner") return null;
  return Object.freeze({
    id: value.id, action: value.action, subjectKind: value.subjectKind, subjectId: id(value.subjectId) ? value.subjectId : null,
    outcome: value.outcome, reasonCode: value.reasonCode, createdAt: value.createdAt, actorRole: "owner" as const,
  });
}

function currentDryRun(value: unknown): CurrentDryRun | null {
  if (!rec(value) || !id(value.dryRunId) || !time(value.expiresAt) || !time(value.createdAt)) return null;
  return Object.freeze({
    dryRunId: value.dryRunId, archiveManifestDigest: digest(value.archiveManifestDigest) ? value.archiveManifestDigest : "",
    archiveSchemaVersion: typeof value.archiveSchemaVersion === "string" && VERSION.test(value.archiveSchemaVersion) ? value.archiveSchemaVersion : "unknown",
    expiresAt: value.expiresAt, createdAt: value.createdAt,
  });
}

/** Returns null for anything that is not a well-formed projection, so the caller fails closed. */
export function normalizeHandoffRecoveryProjection(value: unknown): HandoffRecoveryProjection | null {
  if (!rec(value) || value.schema !== "handoff-recovery-projection/v1" || !time(value.generatedAt)) return null;
  if ((value.mode !== "production" && value.mode !== "synthetic") || !rec(value.context) || !rec(value.handoff) || !rec(value.recovery)) return null;
  const { context, handoff, recovery } = value;
  if (!id(context.workspaceId) || (context.briefStatus !== "available" && context.briefStatus !== "unavailable")) return null;
  const handoffGate = gate(handoff.gate);
  if (!handoffGate || !rec(recovery.gates) || !rec(recovery.reauthentication) || !rec(recovery.effectFence)) return null;
  const gates = { archive: gate(recovery.gates.archive), dryRun: gate(recovery.gates.dryRun), restore: gate(recovery.gates.restore) };
  if (!gates.archive || !gates.dryRun || !gates.restore) return null;
  const reauthState = recovery.reauthentication.state;
  if (reauthState !== "fresh" && reauthState !== "stale" && reauthState !== "missing") return null;
  const fence = recovery.effectFence;
  if (fence.scheduler !== "disabled" || fence.runner !== "disabled" || fence.outbox !== "paused" || fence.provider !== "disabled" || fence.delivery !== "disabled") return null;
  const target = rec(recovery.target) && typeof recovery.target.clean === "boolean" && typeof recovery.target.restoreApplied === "boolean"
    ? Object.freeze({ clean: recovery.target.clean, restoreApplied: recovery.target.restoreApplied }) : null;
  return Object.freeze({
    schema: "handoff-recovery-projection/v1" as const,
    generatedAt: value.generatedAt,
    mode: value.mode,
    context: Object.freeze({ workspaceId: context.workspaceId, briefStatus: context.briefStatus, profiles: list(context.profiles, profile, 16) }),
    handoff: Object.freeze({ gate: handoffGate, selection: handoff.selection === null ? null : selection(handoff.selection), history: list(handoff.history, historyEntry, 20) }),
    recovery: Object.freeze({
      reauthentication: Object.freeze({ state: reauthState, reauthenticatedAt: time(recovery.reauthentication.reauthenticatedAt) ? recovery.reauthentication.reauthenticatedAt : null }),
      gates: Object.freeze(gates as { archive: Gate; dryRun: Gate; restore: Gate }),
      candidate: rec(recovery.candidate) && id(recovery.candidate.archiveRef) ? Object.freeze({ archiveRef: recovery.candidate.archiveRef }) : null,
      currentDryRun: recovery.currentDryRun === null ? null : currentDryRun(recovery.currentDryRun),
      target,
      archives: list(recovery.archives, archiveEntry, 20),
      dryRuns: list(recovery.dryRuns, dryRunEntry, 20),
      restores: list(recovery.restores, restoreEntry, 20),
      ledger: list(recovery.ledger, ledgerEntry, 50),
      effectFence: Object.freeze({ scheduler: "disabled", runner: "disabled", outbox: "paused", provider: "disabled", delivery: "disabled" }),
    }),
  });
}

// ---------------------------------------------------------------------------
// Leaves
// ---------------------------------------------------------------------------

export function formatTime(value: number | null): string {
  if (value === null || !Number.isSafeInteger(value) || value <= 0) return "Not recorded";
  return new Date(value).toISOString();
}

export type StatusFamily = "Current" | "Needs review" | "Blocked" | "Historical" | "Verified dry run" | "Restore blocked" | "Restored — effects disabled";
const GLYPH: Readonly<Record<StatusFamily, string>> = Object.freeze({
  Current: "●", "Needs review": "◐", Blocked: "■", Historical: "○", "Verified dry run": "✓", "Restore blocked": "■", "Restored — effects disabled": "✓",
});

/** A word, a glyph, a plain reason, a checked time, and a safe reference. Color is never the only signal. */
export function StatusLine({ family, reason, checkedAt, reference }: { family: StatusFamily; reason: string; checkedAt: number | null; reference?: string | null }) {
  return (
    <p className="exports-status" data-status={family}>
      <strong><span aria-hidden="true">{GLYPH[family]} </span>{family}</strong>
      <span>{reason}</span>
      <small>Checked {formatTime(checkedAt)}{reference ? <> · Reference <code>{reference}</code></> : null}</small>
    </p>
  );
}

export function PilotBanner({ mode }: { mode: HandoffRecoveryProjection["mode"] }) {
  return (
    <div className="exports-pilot-banner" role="note">
      <p>{PILOT_BANNER_COPY}</p>
      {mode === "synthetic" ? <p><strong>{SYNTHETIC_LABEL}</strong></p> : null}
    </div>
  );
}

function scheduleCopy(view: ScheduleView) {
  const cadence = view.cadence === "weekdays" ? "Weekdays" : view.cadence;
  return `${cadence} · ${view.localTime} · ${view.timeZone}`;
}

/** The repeated scope strip. A breadcrumb is context, never eligibility proof. */
export function ScopeContext({ projection }: { projection: HandoffRecoveryProjection }) {
  const { context } = projection;
  return (
    <section className="panel exports-context" aria-labelledby="exports-context-title">
      <h2 id="exports-context-title">Current scope</h2>
      <p>Source workspace <code>{context.workspaceId}</code> · Data as of {formatTime(projection.generatedAt)}</p>
      {context.profiles.length === 0 ? (
        <p>{context.briefStatus === "available" ? "No active Company, Product, Market Play, and Profile path is projected for this workspace." : "This Phase 7 view is blocked because the Phase 4 profile projection is missing. Load the current upstream authority."}</p>
      ) : (
        <ul className="exports-context-list">
          {context.profiles.map((item) => (
            <li key={item.profileId}>
              <p><code>{item.companyId}</code> → <code>{item.productId}</code> → <code>{item.marketPlayId}</code> → <strong>{item.profileName}</strong> ({item.profileLifecycle})</p>
              <p>Active configuration digest <code>{item.configurationDigest}</code></p>
              <p>
                <strong>Operating schedule visibility:</strong> {scheduleCopy(item.schedule)} —{" "}
                {item.schedule.status === "current" && item.schedule.reportedState
                  ? `reported ${item.schedule.reportedState} by Phase 4`
                  : SCHEDULE_BLOCKED_COPY}
                {item.schedule.readinessRef ? <> · Readiness reference <code>{item.schedule.readinessRef.id}</code></> : null}
                {" "}Phase 4 owns future activation; this surface has no schedule control.
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const EXCLUSION_LABEL: Readonly<Record<string, string>> = Object.freeze({
  duplicate_identity_conflict: "Duplicate excluded",
  suppressed_exact: "Suppressed — non-contactable (exact address)",
  suppressed_domain: "Suppressed — non-contactable (confirmed domain)",
  suppressed_contact: "Suppressed — non-contactable (contact)",
  suppressed_organization: "Suppressed — non-contactable (organization)",
  suppressed_company: "Suppressed — non-contactable (Company-wide)",
  stale_verification: "No longer eligible — stale verification",
  verification_class_ineligible: "No longer eligible — invalid verification",
  package_revoked: "No longer eligible — no approved package",
  high_risk_drift: "No longer eligible — high-risk drift",
  alias_merge: "No longer eligible — identity merge or split",
  deleted: "No longer eligible — deleted",
  not_export_ready: "Not Export-ready",
  cross_workspace: "Cross-workspace reference",
  not_contact_ready: "Other current-ineligible — not ContactReady",
  eligibility_unavailable: "Other current-ineligible — eligibility unavailable",
  authority_ref_mismatch: "Other current-ineligible — lineage mismatch",
  row_cells_invalid: "Other current-ineligible — malformed row",
});

/** The two non-interchangeable counts. Without a current selection neither is shown as zero. */
export function HandoffMetricsLeaf({ selection }: { selection: HandoffSelection | null }) {
  return (
    <div className="exports-metrics">
      <article className="exports-metric">
        <h3>Export-ready Prospects</h3>
        <p className="exports-metric-value">{selection ? selection.exportReadyProspectCount : "Not available"}</p>
        <p>{selection ? `Distinct Prospects with eligible rows: ${selection.uniqueEligibleProspectCount}` : "No current eligibility projection."}</p>
      </article>
      <article className="exports-metric">
        <h3>Eligible contact rows</h3>
        <p className="exports-metric-value">{selection ? selection.eligibleContactRowCount : "Not available"}</p>
        <p>{CONTACT_ROW_DISTINCTION}</p>
      </article>
    </div>
  );
}

/** Selection definition and every labelled exclusion. */
export function HandoffSelectionLeaf({ selection }: { selection: HandoffSelection }) {
  const reasons = Object.keys(EXCLUSION_LABEL);
  const unknown = Object.keys(selection.exclusions).filter((reason) => !reasons.includes(reason));
  const included = selection.eligibleContactRowCount;
  return (
    <>
      <div className="exports-definition">
        <h3>Current selection definition</h3>
        <p>Current Export-ready Prospect, current approved package, fresh verified contact point, and a transaction-time Company-wide suppression fence.</p>
        <dl className="exports-kv">
          <div><dt>Snapshot</dt><dd><code>{selection.snapshotDigest}</code></dd></div>
          <div><dt>Frozen selection time</dt><dd>{formatTime(selection.evaluatedAt)}</dd></div>
          <div><dt>Schema version</dt><dd><code>{selection.schemaVersion}</code></dd></div>
          <div><dt>Configuration digest</dt><dd><code>{selection.configurationDigest}</code></dd></div>
          <div><dt>Export definition digest</dt><dd><code>{selection.exportDefinitionDigest}</code></dd></div>
          <div><dt>Package digests</dt><dd>{selection.packageDigests.length === 0 ? "None" : selection.packageDigests.map((item) => <code key={item}>{item} </code>)}</dd></div>
        </dl>
      </div>
      <table className="exports-table">
        <caption>Eligibility and exclusion ledger</caption>
        <thead><tr><th scope="col">Outcome</th><th scope="col">Reason code</th><th scope="col">Count</th></tr></thead>
        <tbody>
          <tr><th scope="row" data-label="Outcome">Current eligibility snapshot — included</th><td data-label="Reason code"><code>included</code></td><td data-label="Count">{included}</td></tr>
          {[...reasons, ...unknown].map((reason) => (
            <tr key={reason}>
              <th scope="row" data-label="Outcome">{EXCLUSION_LABEL[reason] ?? `Other current-ineligible — ${reason}`}</th>
              <td data-label="Reason code"><code>{reason}</code></td>
              <td data-label="Count">{selection.exclusions[reason] ?? 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {selection.nonContactableCount > 0 ? <p>Non-contactable suppression references: {selection.nonContactableCount}. They are omitted from every contactable row.</p> : null}
    </>
  );
}

/** Immutable handoff history, newest first. The action cell is supplied by the transport owner. */
export function HandoffHistoryLeaf({ history, renderAction }: { history: readonly HandoffHistoryEntry[]; renderAction(entry: HandoffHistoryEntry): React.ReactNode }) {
  if (history.length === 0) return <p>No CSV handoff has been created in this workspace.</p>;
  return (
    <table className="exports-table">
      <caption>Immutable CSV handoff history, newest first</caption>
      <thead>
        <tr>
          <th scope="col">Manifest</th><th scope="col">Schema</th><th scope="col">Selection time</th><th scope="col">Rows</th>
          <th scope="col">Unique Prospects</th><th scope="col">SHA-256 of persisted bytes</th><th scope="col">Delivery</th><th scope="col">Audit reference</th><th scope="col">Action</th>
        </tr>
      </thead>
      <tbody>
        {history.map((entry) => (
          <tr key={entry.manifestId}>
            <th scope="row" data-label="Manifest"><code>{entry.manifestId}</code> (version {entry.version})</th>
            <td data-label="Schema"><code>{entry.schemaVersion}</code></td>
            <td data-label="Selection time">{formatTime(entry.selectedAt)}</td>
            <td data-label="Rows">{entry.rowCount}</td>
            <td data-label="Unique Prospects">{entry.prospectCount}</td>
            <td data-label="SHA-256 of persisted bytes"><code>{entry.csvSha256}</code></td>
            <td data-label="Delivery">
              {entry.deliveryState === "available"
                ? <>Available until {formatTime(entry.deliveryExpiresAt)}</>
                : <>Delivery unavailable ({entry.deliveryState}{entry.deliveryExpiresAt ? `, window ${formatTime(entry.deliveryExpiresAt)}` : ""}). The file is never re-created or altered.</>}
            </td>
            <td data-label="Audit reference">{entry.auditRef ? <code>{entry.auditRef}</code> : "Not recorded"}</td>
            <td data-label="Action">{renderAction(entry)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ArchiveBoundaryLeaf() {
  return (
    <div className="exports-definition">
      <h3>Archive boundary</h3>
      <p><strong>Included:</strong> canonical records, immutable history and audit, object bytes and references, manifests and checksums, dependencies, export artifacts, and suppression and deletion tombstones.</p>
      <p><strong>Excluded:</strong> credentials, OAuth or bearer tokens, raw passphrases, and environment secrets.</p>
    </div>
  );
}

export function RecoveryReadinessLeaf({ projection }: { projection: HandoffRecoveryProjection }) {
  const { recovery } = projection;
  const reauth = recovery.reauthentication;
  const archiveGate = recovery.gates.archive;
  return (
    <div className="exports-definition">
      <h3>Authorization and archive readiness</h3>
      <dl className="exports-kv">
        <div><dt>Owner reauthentication</dt><dd>{reauth.state === "fresh" ? `Recent (${formatTime(reauth.reauthenticatedAt)})` : reauth.state === "stale" ? `Stale (${formatTime(reauth.reauthenticatedAt)})` : "Not available"}</dd></div>
        <div><dt>Server-issued archive upload</dt><dd>{recovery.candidate ? <code>{recovery.candidate.archiveRef}</code> : "None"}</dd></div>
        <div><dt>Restore target</dt><dd>{recovery.target ? `${recovery.target.clean ? "Clean" : "Not clean"}${recovery.target.restoreApplied ? ", already restored" : ""}` : "Not reported"}</dd></div>
        <div><dt>Effect fence</dt><dd>Scheduler {recovery.effectFence.scheduler}, runner {recovery.effectFence.runner}, outbox {recovery.effectFence.outbox}, provider {recovery.effectFence.provider}, delivery {recovery.effectFence.delivery}</dd></div>
      </dl>
      {archiveGate.available
        ? <StatusLine family="Current" reason="Archive creation is permitted for this owner session." checkedAt={projection.generatedAt} />
        : <div role="alert"><StatusLine family="Blocked" reason={archiveGate.firstUnmetPredicate === "reauthentication_required" || archiveGate.firstUnmetPredicate === "not_authorized" ? REAUTH_REQUIRED_COPY : ARCHIVE_UNAVAILABLE_COPY} checkedAt={projection.generatedAt} /></div>}
    </div>
  );
}

export function DryRunEvidenceLeaf({ projection }: { projection: HandoffRecoveryProjection }) {
  const current = projection.recovery.currentDryRun;
  if (!current) return <p>No current verified dry run. A dry run checks authorization, expiry, manifest, signature and checksum, passphrase authentication, compatibility, object completeness, referential invariants, a clean target, and zero target writes.</p>;
  return (
    <div className="exports-definition">
      <StatusLine family="Verified dry run" reason={DRY_RUN_VERIFIED_COPY} checkedAt={current.createdAt} reference={current.dryRunId} />
      <dl className="exports-kv">
        <div><dt>Archive manifest</dt><dd><code>{current.archiveManifestDigest}</code></dd></div>
        <div><dt>Archive schema</dt><dd><code>{current.archiveSchemaVersion}</code></dd></div>
        <div><dt>Dry run expires</dt><dd>{formatTime(current.expiresAt)}</dd></div>
      </dl>
    </div>
  );
}

/** Replay and audit ledger: archives, dry runs, restores, and bounded audit events. Actor role only. */
export function RecoveryLedgerLeaf({ projection }: { projection: HandoffRecoveryProjection }) {
  const { archives, dryRuns, restores, ledger } = projection.recovery;
  if (archives.length + dryRuns.length + restores.length + ledger.length === 0) return <p>{RECOVERY_EMPTY_COPY}</p>;
  return (
    <>
      {archives.length > 0 ? (
        <table className="exports-table">
          <caption>Encrypted workspace archives</caption>
          <thead><tr><th scope="col">Archive</th><th scope="col">Format</th><th scope="col">Manifest</th><th scope="col">Ciphertext SHA-256</th><th scope="col">Records / objects / tombstones</th><th scope="col">Created</th><th scope="col">Delivery expiry</th></tr></thead>
          <tbody>
            {archives.map((item) => (
              <tr key={item.archiveId}>
                <th scope="row" data-label="Archive"><code>{item.archiveId}</code></th>
                <td data-label="Format"><code>{item.formatVersion}</code></td>
                <td data-label="Manifest"><code>{item.manifestDigest}</code></td>
                <td data-label="Ciphertext SHA-256"><code>{item.ciphertextSha256}</code></td>
                <td data-label="Records / objects / tombstones">{item.recordCount} / {item.objectCount} / {item.tombstoneCount}</td>
                <td data-label="Created">{formatTime(item.createdAt)}</td>
                <td data-label="Delivery expiry">{formatTime(item.deliveryExpiresAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {dryRuns.length > 0 ? (
        <table className="exports-table">
          <caption>Dry runs (zero target writes)</caption>
          <thead><tr><th scope="col">Dry run</th><th scope="col">Outcome</th><th scope="col">Reason</th><th scope="col">Recorded</th><th scope="col">Expires</th></tr></thead>
          <tbody>
            {dryRuns.map((item) => (
              <tr key={item.dryRunId}>
                <th scope="row" data-label="Dry run"><code>{item.dryRunId}</code></th>
                <td data-label="Outcome">{item.outcome === "accepted" ? "Verified dry run" : "Refused"}</td>
                <td data-label="Reason"><code>{item.reasonCode}</code></td>
                <td data-label="Recorded">{formatTime(item.createdAt)}</td>
                <td data-label="Expires">{formatTime(item.expiresAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {restores.length > 0 ? (
        <table className="exports-table">
          <caption>Restore results</caption>
          <thead><tr><th scope="col">Result</th><th scope="col">Outcome</th><th scope="col">Records / objects</th><th scope="col">Schedules and effects</th><th scope="col">Completed</th></tr></thead>
          <tbody>
            {restores.map((item) => (
              <tr key={item.restoreResultId}>
                <th scope="row" data-label="Result"><code>{item.restoreResultId}</code></th>
                <td data-label="Outcome">{item.outcome === "applied" ? "Restored — effects disabled" : `Rolled back (${item.reasonCode})`}</td>
                <td data-label="Records / objects">{item.restoredRecordCount} / {item.restoredObjectCount}</td>
                <td data-label="Schedules and effects">{item.schedulesEnabled === false && item.effectsEnabled === false ? "Disabled pending fresh upstream Phase 4 activation" : "Effect fence could not be verified"}</td>
                <td data-label="Completed">{formatTime(item.completedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {ledger.length > 0 ? (
        <table className="exports-table">
          <caption>Recovery and handoff audit ledger, newest first</caption>
          <thead><tr><th scope="col">Audit reference</th><th scope="col">Action</th><th scope="col">Outcome</th><th scope="col">Reason</th><th scope="col">Actor</th><th scope="col">Time</th></tr></thead>
          <tbody>
            {ledger.map((item) => (
              <tr key={item.id}>
                <th scope="row" data-label="Audit reference"><code>{item.id}</code></th>
                <td data-label="Action"><code>{item.action}</code>{item.subjectId ? <> on <code>{item.subjectId}</code></> : null}</td>
                <td data-label="Outcome">{item.outcome === "recorded" ? "Recorded" : "Refused"}</td>
                <td data-label="Reason"><code>{item.reasonCode}</code></td>
                <td data-label="Actor">Owner</td>
                <td data-label="Time">{formatTime(item.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </>
  );
}
