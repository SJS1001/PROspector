/**
 * Plan 07-04: the admitted, workspace-scoped D1 seam for Phase 7 handoff and
 * recovery evidence (migration 0023).
 *
 * The repository joins upstream Phase 4-6 projections and persists immutable
 * evidence. It makes no qualification, eligibility, package, suppression,
 * schedule, or restore-release decision: those stay in their upstream modules
 * and the later 07-05 to 07-09 services. Workspace and owner come only from the
 * trusted server scope passed at construction; no method accepts a workspace,
 * owner, schedule state, tombstone scope, or effect-enable claim. Every write
 * binds its idempotency key to a canonical operation digest, so a replay with
 * the same semantics returns the stored result and a changed reuse conflicts.
 *
 * Nothing here reaches a provider, a host, a scheduler, or a send path, and no
 * passphrase, credential, token, raw archive, or raw contact value is stored.
 */

export type HandoffRecoveryScope = Readonly<{
  workspaceId: string;
  ownerSubject: string;
  now?: () => number;
}>;

export type HandoffRecoveryWriteResult = Readonly<{ id: string; digest: string; replayed: boolean }>;

export type UpstreamScheduleState = Readonly<{
  scheduleId: string;
  profileId: string;
  revision: number;
  configurationId: string;
  configurationDigest: string;
  cadence: string;
  intendedLocalTime: string;
  timezone: string;
  utcOffsetMinutes: number;
  active: boolean;
  executionState: string;
  activationId: string;
  activationAuditEventId: string;
}>;

export type FirstExportReadyTransition = Readonly<{
  prospectId: string;
  transitionEventId: string;
  sequence: number;
  occurredAt: number;
}>;

export type CurrentProspectState = Readonly<{ prospectId: string; sequence: number; state: string; occurredAt: number }>;

export type SuppressionFence = Readonly<{
  tombstoneCount: number;
  tombstones: readonly Readonly<{ id: string; subjectKind: string; subjectDigest: string; channel: string; tombstoneDigest: string; effectiveAt: number }>[];
}>;

export type PackageApprovalLineage = Readonly<{
  packageApprovalId: string;
  packageVersionId: string;
  packageId: string;
  prospectId: string;
  contactId: string;
  approvalDigest: string;
  artifactDigest: string;
  expiresAt: number;
  revoked: boolean;
}>;

export type RestoreTargetState = Readonly<{
  clean: boolean;
  nonEmptyTables: readonly string[];
  restoreApplied: boolean;
  digest: string;
}>;

export type RecordScheduleObservationInput = Readonly<{ profileId: string; idempotencyKey: string }>;

export type RecordWeeklyReportInput = Readonly<{
  definitionVersion: string;
  timeZone: string;
  weekStartLocal: string;
  weekEndLocal: string;
  windowStartAt: number;
  windowEndAt: number;
  asOf: number;
  targetCount: number;
  projectionDigest: string;
  idempotencyKey: string;
}>;

export type ExportSnapshotRowInput = Readonly<{
  prospectId: string;
  contactId: string;
  contactPointDigest: string;
  packageVersionId: string;
  packageApprovalId: string;
}>;

export type ExportSnapshotExclusionInput = Readonly<{ prospectId: string; contactId: string | null; tombstoneId: string }>;

export type RecordExportSnapshotInput = Readonly<{
  exportDefinitionDigest: string;
  policyDigest: string;
  configurationDigest: string;
  packageSetDigest: string;
  suppressionFenceCount: number;
  rows: readonly ExportSnapshotRowInput[];
  exclusions: readonly ExportSnapshotExclusionInput[];
  idempotencyKey: string;
}>;

export type RecordExportArtifactInput = Readonly<{
  snapshotId: string;
  schemaVersion: string;
  mediaType: "text/csv";
  objectKey: string;
  contentSha256: string;
  byteLength: number;
  manifest: Readonly<Record<string, unknown>>;
  idempotencyKey: string;
}>;

export type RecordDeliveryEventInput = Readonly<{
  subjectKind: "export_artifact" | "recovery_archive";
  subjectId: string;
  eventKind: "issued" | "expired" | "failed";
  expiresAt: number | null;
  reasonCode: string;
  occurredAt: number;
  idempotencyKey: string;
}>;

export type RecordArchiveInput = Readonly<{
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
}>;

export type RecordDryRunInput = Readonly<{
  sourceWorkspaceId: string;
  archiveManifestDigest: string;
  archiveCiphertextSha256: string;
  archiveSchemaVersion: string;
  outcome: "accepted" | "refused";
  reasonCode: string;
  nonceDigest: string | null;
  expiresAt: number | null;
  invariantDigest: string | null;
  idempotencyKey: string;
}>;

export type AcquireRestoreLockInput = Readonly<{ dryRunId: string; nonceDigest: string; idempotencyKey: string }>;

export type RecordRestoreResultInput = Readonly<{
  lockId: string;
  outcome: "applied" | "rolled_back";
  reasonCode: string;
  restoredRecordCount: number;
  restoredObjectCount: number;
  idempotencyKey: string;
}>;

export type RecordRefusalInput = Readonly<{
  action: (typeof REFUSAL_ACTIONS)[number];
  subjectKind: (typeof SUBJECT_KINDS)[number];
  subjectId: string | null;
  reasonCode: string;
}>;

export type ReadExportArtifactSelector =
  | Readonly<{ by: "idempotencyKey"; idempotencyKey: string }>
  | Readonly<{ by: "objectKey"; objectKey: string }>
  | Readonly<{ by: "contentSha256"; contentSha256: string }>
  | Readonly<{ by: "latest" }>;

export type ExportArtifactView = Readonly<{
  id: string;
  snapshotId: string;
  schemaVersion: string;
  mediaType: "text/csv";
  objectKey: string;
  contentSha256: string;
  byteLength: number;
  manifest: Readonly<Record<string, unknown>>;
  manifestDigest: string;
  rowCount: number;
  prospectCount: number;
  createdAt: number;
  /** The idempotency key of the command that recorded this artifact. */
  idempotencyKey: string;
  delivery: Readonly<{
    issued: Readonly<{ occurredAt: number; expiresAt: number }> | null;
    terminal: Readonly<{ eventKind: "expired" | "failed"; reasonCode: string; occurredAt: number }> | null;
  }>;
}>;

export class HandoffRecoveryConflictError extends Error {
  constructor(reason = "conflict") {
    super(`handoff_recovery_conflict:${reason}`);
    this.name = "HandoffRecoveryConflictError";
  }
}

const ID = /^[A-Za-z0-9](?:[A-Za-z0-9._:-]{0,126}[A-Za-z0-9])?$/u;
const DIGEST = /^[a-f0-9]{64}$/u;
const REASON = /^[a-z0-9](?:[a-z0-9._:-]{0,78}[a-z0-9])?$/u;
const VERSION = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u;
const TIME_ZONE = /^[A-Za-z0-9_+/-]{1,64}$/u;
const LOCAL_DATE = /^\d{4}-[01]\d-[0-3]\d$/u;
const OBJECT_KEY = /^(?!\/)(?!.*\.\.)[A-Za-z0-9._/-]{1,512}$/u;
const ENVELOPE_TOKEN = /^[a-z0-9-]{1,32}$/u;
const SECRET_KEY = /passphrase|password|secret|credential|oauth|bearer|token|cookie|authorization|private.?key|api.?key/iu;
const TABLE_NAME = /^[a-z][a-z0-9_]*$/u;
const WORKSPACE_COLUMN = /(?:^|[\s,(])[`"[]?workspace_id[`"\]]?\s/u;
const MAX_ROWS = 1_000;
const MAX_COHORT = 10_000;
const MAX_TOMBSTONES = 10_000;
const MAX_METADATA_BYTES = 64 * 1024;
const MAX_ARTIFACT_BYTES = 256 * 1024 * 1024;
const WEEK_MIN_MS = 167 * 60 * 60 * 1000;
const WEEK_MAX_MS = 169 * 60 * 60 * 1000;

/** Recovery evidence never makes a restore target dirty; every other workspace row does. */
const RECOVERY_EVIDENCE_TABLES = new Set([
  "handoff_recovery_commands", "handoff_recovery_audit_events", "recovery_dry_runs", "recovery_restore_locks", "recovery_restore_results",
]);
const REFUSAL_ACTIONS = Object.freeze([
  "schedule.observe", "weekly_report.record", "export.snapshot", "export.artifact", "delivery.event",
  "archive.create", "restore.dry_run", "restore.lock_acquire", "restore.apply",
] as const);
const SUBJECT_KINDS = Object.freeze([
  "workspace", "schedule_observation", "weekly_report", "export_snapshot", "export_artifact", "delivery_event",
  "recovery_archive", "recovery_dry_run", "recovery_restore_lock", "recovery_restore_result",
] as const);

type CommandKind =
  | "schedule_observation.record" | "weekly_report.record" | "export_snapshot.record" | "export_artifact.record"
  | "delivery_event.record" | "archive.record" | "dry_run.record" | "restore_lock.acquire" | "restore_result.record";

type WritePlan = Readonly<{
  kind: CommandKind;
  key: string;
  operationDigest: string;
  resultKind: string;
  resultId: string;
  resultDigest: string;
  expectedRevision: number;
  audit: Readonly<{ action: string; subjectKind: string; reasonCode: string }>;
  precheck?: () => Promise<void>;
  statements: (commandId: string) => readonly D1PreparedStatement[];
}>;

/**
 * Creates the uncomposed Phase 7 evidence seam. The scope must come from
 * trusted server admission; it is re-checked against `workspaces` on every
 * call, so a stale or forged owner/workspace pair is refused before any read.
 */
export function createD1HandoffRecoveryRepository(database: D1Database, scopeValue: HandoffRecoveryScope) {
  const scope = captureScope(scopeValue);
  const clock = scopeValue.now ?? Date.now;
  const now = () => {
    const value = clock();
    if (!positive(value)) throw conflict("invalid_clock");
    return value;
  };
  const admitted = () => requireAdmission(database, scope);
  const write = (plan: WritePlan) => execute(database, scope, plan, now());

  const repository = {
    readUpstreamScheduleState: async (profileId: string): Promise<UpstreamScheduleState | null> => {
      if (!validId(profileId)) throw conflict("invalid_profile");
      await admitted();
      return readSchedule(database, scope.workspaceId, profileId);
    },

    readFirstExportReadyTransitions: async (window: Readonly<{ windowStartAt: number; windowEndAt: number }>): Promise<readonly FirstExportReadyTransition[]> => {
      const input = snapshotCommand(window, ["windowStartAt", "windowEndAt"]);
      if (!positive(input.windowStartAt) || !positive(input.windowEndAt) || input.windowEndAt <= input.windowStartAt) throw conflict("invalid_window");
      await admitted();
      return readFirstExportReady(database, scope.workspaceId, input.windowStartAt, input.windowEndAt);
    },

    readCurrentProspectStates: async (prospectIds: readonly string[]): Promise<readonly CurrentProspectState[]> => {
      const ids = boundedIdList(prospectIds, 1, 500, "invalid_prospect_ids");
      await admitted();
      const rows = await all<{ prospect_id: string; sequence: number; new_state: string; occurred_at: number }>(database.prepare(
        `SELECT event.prospect_id,event.sequence,event.new_state,event.occurred_at FROM prospect_transition_events event
         WHERE event.workspace_id=? AND event.prospect_id IN (${placeholders(ids.length)})
           AND event.sequence=(SELECT MAX(latest.sequence) FROM prospect_transition_events latest WHERE latest.prospect_id=event.prospect_id AND latest.workspace_id=event.workspace_id)
         ORDER BY event.prospect_id`,
      ).bind(scope.workspaceId, ...ids));
      return Object.freeze(rows.map((row) => Object.freeze({ prospectId: row.prospect_id, sequence: Number(row.sequence), state: row.new_state, occurredAt: Number(row.occurred_at) })));
    },

    readSuppressionFence: async (): Promise<SuppressionFence> => {
      await admitted();
      return readFence(database, scope.workspaceId);
    },

    readPackageApprovalLineage: async (prospectIds: readonly string[]): Promise<readonly PackageApprovalLineage[]> => {
      const ids = boundedIdList(prospectIds, 1, 500, "invalid_prospect_ids");
      await admitted();
      const rows = await all<{ approval_id: string; version_id: string; package_id: string; prospect_id: string; contact_id: string; approval_digest: string; artifact_digest: string; expires_at: number; revoked: number }>(database.prepare(
        `SELECT approval.id approval_id,version.id version_id,package.id package_id,package.prospect_id,package.contact_id,
                approval.approval_digest,version.artifact_digest,approval.expires_at,
                EXISTS (SELECT 1 FROM outreach_approval_revocations revocation WHERE revocation.package_approval_id=approval.id AND revocation.workspace_id=approval.workspace_id) revoked
         FROM outreach_package_approvals approval
         JOIN outreach_package_versions version ON version.id=approval.package_version_id AND version.workspace_id=approval.workspace_id
         JOIN outreach_packages package ON package.id=version.package_id AND package.workspace_id=version.workspace_id
         WHERE approval.workspace_id=? AND package.prospect_id IN (${placeholders(ids.length)})
         ORDER BY package.prospect_id,package.contact_id,version.version,approval.id`,
      ).bind(scope.workspaceId, ...ids));
      return Object.freeze(rows.map((row) => Object.freeze({
        packageApprovalId: row.approval_id, packageVersionId: row.version_id, packageId: row.package_id,
        prospectId: row.prospect_id, contactId: row.contact_id, approvalDigest: row.approval_digest,
        artifactDigest: row.artifact_digest, expiresAt: Number(row.expires_at), revoked: Number(row.revoked) === 1,
      })));
    },

    /** Zero-write: reports whether this workspace is an empty, never-restored restore target. */
    readRestoreTargetState: async (): Promise<RestoreTargetState> => {
      await admitted();
      return readTargetState(database, scope.workspaceId);
    },

    recordScheduleObservation: async (value: RecordScheduleObservationInput): Promise<HandoffRecoveryWriteResult> => {
      const input = snapshotCommand(value, ["profileId", "idempotencyKey"]);
      if (!validId(input.profileId) || !validId(input.idempotencyKey)) throw conflict("invalid_schedule_observation");
      await admitted();
      const state = await readSchedule(database, scope.workspaceId, input.profileId);
      if (!state) throw conflict("schedule_unavailable");
      const sourceDigest = await digest({ schema: "handoff-upstream-schedule/v1", workspaceId: scope.workspaceId, ...state });
      const observationDigest = await digest({ schema: "handoff-schedule-observation/v1", workspaceId: scope.workspaceId, sourceDigest, idempotencyKey: input.idempotencyKey });
      const operationDigest = await commandDigest(scope, "schedule_observation.record", observationDigest);
      const id = await derivedId("hso", operationDigest);
      return write({
        kind: "schedule_observation.record", key: input.idempotencyKey, operationDigest, resultKind: "schedule_observation",
        resultId: id, resultDigest: observationDigest, expectedRevision: state.revision,
        audit: { action: "schedule.observed", subjectKind: "schedule_observation", reasonCode: state.active ? "schedule_active" : "schedule_inactive" },
        statements: (commandId) => {
          const at = now();
          return [database.prepare(
            `INSERT INTO handoff_schedule_observations (
              id,workspace_id,profile_id,schedule_id,schedule_revision,configuration_id,configuration_digest,cadence,
              intended_local_time,timezone,utc_offset_minutes,schedule_active,execution_state,activation_id,
              activation_audit_event_id,source_digest,observation_digest,command_id,observed_at,created_at
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          ).bind(
            id, scope.workspaceId, state.profileId, state.scheduleId, state.revision, state.configurationId, state.configurationDigest,
            state.cadence, state.intendedLocalTime, state.timezone, state.utcOffsetMinutes, state.active ? 1 : 0, state.executionState,
            state.activationId, state.activationAuditEventId, sourceDigest, observationDigest, commandId, at, at,
          )];
        },
      });
    },

    recordWeeklyReport: async (value: RecordWeeklyReportInput): Promise<HandoffRecoveryWriteResult> => {
      const input = snapshotCommand(value, ["definitionVersion", "timeZone", "weekStartLocal", "weekEndLocal", "windowStartAt", "windowEndAt", "asOf", "targetCount", "projectionDigest", "idempotencyKey"]);
      const at = now();
      if (
        !VERSION.test(String(input.definitionVersion)) || !TIME_ZONE.test(String(input.timeZone))
        || !LOCAL_DATE.test(String(input.weekStartLocal)) || !LOCAL_DATE.test(String(input.weekEndLocal)) || !(input.weekStartLocal < input.weekEndLocal)
        || !positive(input.windowStartAt) || !positive(input.windowEndAt) || !positive(input.asOf)
        || input.windowEndAt - input.windowStartAt < WEEK_MIN_MS || input.windowEndAt - input.windowStartAt > WEEK_MAX_MS
        || input.asOf < input.windowStartAt || input.asOf > at
        || !positive(input.targetCount) || input.targetCount > MAX_COHORT || !validDigest(input.projectionDigest) || !validId(input.idempotencyKey)
      ) throw conflict("invalid_weekly_report");
      await admitted();
      const cohort = (await readFirstExportReady(database, scope.workspaceId, input.windowStartAt, input.windowEndAt))
        .filter((entry) => entry.occurredAt <= input.asOf);
      const historyDigest = await digest({ schema: "handoff-weekly-cohort/v1", entries: cohort.map((entry) => ({ prospectId: entry.prospectId, transitionEventId: entry.transitionEventId, occurredAt: entry.occurredAt })) });
      const reportDigest = await digest({
        schema: "handoff-weekly-report/v1", workspaceId: scope.workspaceId, definitionVersion: input.definitionVersion, timeZone: input.timeZone,
        weekStartLocal: input.weekStartLocal, weekEndLocal: input.weekEndLocal, windowStartAt: input.windowStartAt, windowEndAt: input.windowEndAt,
        asOf: input.asOf, targetCount: input.targetCount, cohortCount: cohort.length, historyDigest, projectionDigest: input.projectionDigest,
      });
      const operationDigest = await commandDigest(scope, "weekly_report.record", reportDigest);
      const id = await derivedId("hwr", operationDigest);
      const entryIds = await Promise.all(cohort.map((_, ordinal) => derivedId("hwe", `${reportDigest}:${ordinal}`)));
      return write({
        kind: "weekly_report.record", key: input.idempotencyKey, operationDigest, resultKind: "weekly_report", resultId: id,
        resultDigest: reportDigest, expectedRevision: 0,
        audit: { action: "weekly_report.recorded", subjectKind: "weekly_report", reasonCode: cohort.length >= input.targetCount ? "target_met" : "target_not_met" },
        statements: (commandId) => [
          database.prepare(
            `INSERT INTO handoff_weekly_reports (
              id,workspace_id,command_id,definition_version,time_zone,week_start_local,week_end_local,window_start_at,window_end_at,
              as_of,target_count,cohort_count,history_digest,projection_digest,report_digest,created_at
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          ).bind(
            id, scope.workspaceId, commandId, input.definitionVersion, input.timeZone, input.weekStartLocal, input.weekEndLocal,
            input.windowStartAt, input.windowEndAt, input.asOf, input.targetCount, cohort.length, historyDigest, input.projectionDigest, reportDigest, at,
          ),
          ...cohort.map((entry, ordinal) => database.prepare(
            `INSERT INTO handoff_weekly_report_entries (id,workspace_id,report_id,prospect_id,transition_event_id,ordinal,occurred_at,created_at)
             VALUES (?,?,?,?,?,?,?,?)`,
          ).bind(entryIds[ordinal], scope.workspaceId, id, entry.prospectId, entry.transitionEventId, ordinal, entry.occurredAt, at)),
        ],
      });
    },

    recordExportSnapshot: async (value: RecordExportSnapshotInput): Promise<HandoffRecoveryWriteResult> => {
      const input = snapshotCommand(value, ["exportDefinitionDigest", "policyDigest", "configurationDigest", "packageSetDigest", "suppressionFenceCount", "rows", "exclusions", "idempotencyKey"]);
      if (
        ![input.exportDefinitionDigest, input.policyDigest, input.configurationDigest, input.packageSetDigest].every(validDigest)
        || !nonNegative(input.suppressionFenceCount) || !validId(input.idempotencyKey)
        || !Array.isArray(input.rows) || input.rows.length > MAX_ROWS || !Array.isArray(input.exclusions) || input.exclusions.length > MAX_ROWS
      ) throw conflict("invalid_export_snapshot");
      const rows = input.rows.map((row): ExportSnapshotRowInput => {
        const candidate: unknown = row;
        if (!plainObject(candidate) || !exactKeys(candidate, ["prospectId", "contactId", "contactPointDigest", "packageVersionId", "packageApprovalId"])
          || ![candidate.prospectId, candidate.contactId, candidate.packageVersionId, candidate.packageApprovalId].every(validId) || !validDigest(candidate.contactPointDigest)) throw conflict("invalid_export_snapshot");
        return row;
      }).sort((left, right) => compareTuple([left.prospectId, left.contactId, left.contactPointDigest], [right.prospectId, right.contactId, right.contactPointDigest]));
      if (new Set(rows.map((row) => `${row.prospectId}\u0000${row.contactPointDigest}`)).size !== rows.length) throw conflict("duplicate_export_row");
      const exclusions = input.exclusions.map((exclusion): ExportSnapshotExclusionInput => {
        const candidate: unknown = exclusion;
        if (!plainObject(candidate) || !exactKeys(candidate, ["prospectId", "contactId", "tombstoneId"])
          || !validId(candidate.prospectId) || !validId(candidate.tombstoneId) || (candidate.contactId !== null && !validId(candidate.contactId))) throw conflict("invalid_export_snapshot");
        return exclusion;
      }).sort((left, right) => compareTuple([left.prospectId, left.contactId ?? "", left.tombstoneId], [right.prospectId, right.contactId ?? "", right.tombstoneId]));
      if (new Set(exclusions.map((exclusion) => `${exclusion.prospectId}\u0000${exclusion.contactId ?? ""}\u0000${exclusion.tombstoneId}`)).size !== exclusions.length) throw conflict("duplicate_exclusion");
      // A frozen snapshot is self-consistent: a Prospect-wide exclusion (null
      // Contact) or a Contact exclusion refuses any contactable row it covers.
      // The suppression decision stays upstream; this only refuses evidence
      // that contradicts itself.
      const excluded = new Set(exclusions.map((exclusion) => `${exclusion.prospectId}\u0000${exclusion.contactId ?? ""}`));
      if (rows.some((row) => excluded.has(`${row.prospectId}\u0000`) || excluded.has(`${row.prospectId}\u0000${row.contactId}`))) throw conflict("suppressed_export_row");
      await admitted();
      const selectedAt = now();
      await requireRowPackageLineage(database, scope.workspaceId, rows, selectedAt);
      const tombstoneIds = [...new Set(exclusions.map((exclusion) => exclusion.tombstoneId))];
      const scopeKinds = new Map<string, string>();
      for (let offset = 0; offset < tombstoneIds.length; offset += 100) {
        const chunk = tombstoneIds.slice(offset, offset + 100);
        for (const row of await all<{ id: string; subject_kind: string }>(database.prepare(
          `SELECT id,subject_kind FROM outreach_suppression_tombstones WHERE workspace_id=? AND id IN (${placeholders(chunk.length)})`,
        ).bind(scope.workspaceId, ...chunk))) scopeKinds.set(row.id, row.subject_kind);
      }
      if (scopeKinds.size !== tombstoneIds.length) throw conflict("tombstone_unavailable");
      const canonicalRows = await Promise.all(rows.map(async (row) => ({
        ...row,
        rowIdentityDigest: await digest({ schema: "handoff-export-row/v1", prospectId: row.prospectId, contactId: row.contactId, contactPointDigest: row.contactPointDigest }),
      })));
      const canonicalExclusions = await Promise.all(exclusions.map(async (exclusion) => ({
        ...exclusion,
        scopeKind: scopeKinds.get(exclusion.tombstoneId)!,
        exclusionDigest: await digest({ schema: "handoff-suppression-exclusion/v1", ...exclusion }),
      })));
      const prospectCount = new Set(rows.map((row) => row.prospectId)).size;
      const snapshotDigest = await digest({
        schema: "handoff-export-snapshot/v1", workspaceId: scope.workspaceId,
        exportDefinitionDigest: input.exportDefinitionDigest, policyDigest: input.policyDigest,
        configurationDigest: input.configurationDigest, packageSetDigest: input.packageSetDigest,
        suppressionFenceCount: input.suppressionFenceCount, rows: canonicalRows, exclusions: canonicalExclusions,
      });
      const operationDigest = await commandDigest(scope, "export_snapshot.record", snapshotDigest);
      const id = await derivedId("hes", operationDigest);
      const rowIds = await Promise.all(canonicalRows.map((row) => derivedId("her", `${snapshotDigest}:${row.rowIdentityDigest}`)));
      const exclusionIds = await Promise.all(canonicalExclusions.map((exclusion) => derivedId("hex", `${snapshotDigest}:${exclusion.exclusionDigest}`)));
      return write({
        kind: "export_snapshot.record", key: input.idempotencyKey, operationDigest, resultKind: "export_snapshot", resultId: id,
        resultDigest: snapshotDigest, expectedRevision: input.suppressionFenceCount,
        audit: { action: "export.snapshot_recorded", subjectKind: "export_snapshot", reasonCode: canonicalExclusions.length > 0 ? "snapshot_with_exclusions" : "snapshot_recorded" },
        precheck: async () => {
          if ((await readFenceCount(database, scope.workspaceId)) !== input.suppressionFenceCount) throw conflict("suppression_fence_stale");
        },
        statements: (commandId) => {
          const at = selectedAt;
          return [
            database.prepare(
              `INSERT INTO handoff_export_snapshots (
                id,workspace_id,command_id,export_definition_digest,policy_digest,configuration_digest,package_set_digest,
                suppression_fence_count,snapshot_digest,selected_at,prospect_count,contact_row_count,exclusion_count,created_at
              ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            ).bind(
              id, scope.workspaceId, commandId, input.exportDefinitionDigest, input.policyDigest, input.configurationDigest, input.packageSetDigest,
              input.suppressionFenceCount, snapshotDigest, at, prospectCount, canonicalRows.length, canonicalExclusions.length, at,
            ),
            ...canonicalRows.map((row, ordinal) => database.prepare(
              `INSERT INTO handoff_export_snapshot_rows (
                id,workspace_id,snapshot_id,ordinal,prospect_id,contact_id,contact_point_digest,package_version_id,package_approval_id,row_identity_digest,created_at
              ) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
            ).bind(rowIds[ordinal], scope.workspaceId, id, ordinal, row.prospectId, row.contactId, row.contactPointDigest, row.packageVersionId, row.packageApprovalId, row.rowIdentityDigest, at)),
            ...canonicalExclusions.map((exclusion, ordinal) => database.prepare(
              `INSERT INTO handoff_suppression_exclusions (
                id,workspace_id,snapshot_id,ordinal,prospect_id,contact_id,tombstone_id,scope_kind,exclusion_digest,created_at
              ) VALUES (?,?,?,?,?,?,?,?,?,?)`,
            ).bind(exclusionIds[ordinal], scope.workspaceId, id, ordinal, exclusion.prospectId, exclusion.contactId, exclusion.tombstoneId, exclusion.scopeKind, exclusion.exclusionDigest, at)),
          ];
        },
      });
    },

    recordExportArtifact: async (value: RecordExportArtifactInput): Promise<HandoffRecoveryWriteResult> => {
      const input = snapshotCommand(value, ["snapshotId", "schemaVersion", "mediaType", "objectKey", "contentSha256", "byteLength", "manifest", "idempotencyKey"]);
      const manifestJson = safeMetadata(input.manifest);
      if (
        !validId(input.snapshotId) || !VERSION.test(String(input.schemaVersion)) || input.mediaType !== "text/csv"
        || !OBJECT_KEY.test(String(input.objectKey)) || !validDigest(input.contentSha256)
        || !positive(input.byteLength) || input.byteLength > MAX_ARTIFACT_BYTES || !validId(input.idempotencyKey)
      ) throw conflict("invalid_export_artifact");
      await admitted();
      const snapshot = await database.prepare(
        "SELECT contact_row_count,prospect_count FROM handoff_export_snapshots WHERE id=? AND workspace_id=? LIMIT 1",
      ).bind(input.snapshotId, scope.workspaceId).first<{ contact_row_count: number; prospect_count: number }>();
      if (!snapshot) throw conflict("snapshot_unavailable");
      const manifestDigest = await digest(manifestJson);
      const artifactDigest = await digest({
        schema: "handoff-export-artifact/v1", workspaceId: scope.workspaceId, snapshotId: input.snapshotId, schemaVersion: input.schemaVersion,
        mediaType: input.mediaType, objectKey: input.objectKey, contentSha256: input.contentSha256, byteLength: input.byteLength, manifestDigest,
      });
      const operationDigest = await commandDigest(scope, "export_artifact.record", artifactDigest);
      const id = await derivedId("hea", operationDigest);
      return write({
        kind: "export_artifact.record", key: input.idempotencyKey, operationDigest, resultKind: "export_artifact", resultId: id,
        resultDigest: artifactDigest, expectedRevision: 0,
        audit: { action: "export.artifact_recorded", subjectKind: "export_artifact", reasonCode: "artifact_recorded" },
        precheck: async () => {
          const existing = await database.prepare("SELECT id FROM handoff_export_artifacts WHERE snapshot_id=? AND workspace_id=? LIMIT 1").bind(input.snapshotId, scope.workspaceId).first();
          if (existing) throw conflict("artifact_conflict");
        },
        statements: (commandId) => [database.prepare(
          `INSERT INTO handoff_export_artifacts (
            id,workspace_id,snapshot_id,command_id,schema_version,media_type,object_key,content_sha256,byte_length,
            manifest_json,manifest_digest,row_count,prospect_count,created_at
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        ).bind(
          id, scope.workspaceId, input.snapshotId, commandId, input.schemaVersion, input.mediaType, input.objectKey, input.contentSha256,
          input.byteLength, manifestJson, manifestDigest, Number(snapshot.contact_row_count), Number(snapshot.prospect_count), now(),
        )],
      });
    },

    /**
     * Zero-write read of one recorded export artifact with its delivery
     * events. The stored manifest is re-digested on read, so a manifest that no
     * longer matches its recorded digest is refused rather than returned.
     */
    readExportArtifact: async (value: ReadExportArtifactSelector): Promise<ExportArtifactView | null> => {
      const input = snapshotData(value) as ReadExportArtifactSelector;
      if (!plainObject(input)) throw conflict("invalid_artifact_selector");
      let filter: string;
      let bindings: unknown[];
      if (input.by === "idempotencyKey" && exactKeys(input, ["by", "idempotencyKey"]) && validId(input.idempotencyKey)) {
        filter = "AND command.idempotency_key=? AND command.command_kind='export_artifact.record'";
        bindings = [input.idempotencyKey];
      } else if (input.by === "objectKey" && exactKeys(input, ["by", "objectKey"]) && OBJECT_KEY.test(String(input.objectKey))) {
        filter = "AND artifact.object_key=?";
        bindings = [input.objectKey];
      } else if (input.by === "contentSha256" && exactKeys(input, ["by", "contentSha256"]) && validDigest(input.contentSha256)) {
        filter = "AND artifact.content_sha256=?";
        bindings = [input.contentSha256];
      } else if (input.by === "latest" && exactKeys(input, ["by"])) {
        filter = "";
        bindings = [];
      } else throw conflict("invalid_artifact_selector");
      await admitted();
      const row = await database.prepare(
        `SELECT artifact.id,artifact.snapshot_id,artifact.schema_version,artifact.media_type,artifact.object_key,artifact.content_sha256,
                artifact.byte_length,artifact.manifest_json,artifact.manifest_digest,artifact.row_count,artifact.prospect_count,artifact.created_at,
                command.idempotency_key
         FROM handoff_export_artifacts artifact
         JOIN handoff_recovery_commands command ON command.id=artifact.command_id AND command.workspace_id=artifact.workspace_id
         WHERE artifact.workspace_id=? ${filter}
         ORDER BY artifact.created_at DESC,artifact.rowid DESC LIMIT 1`,
      ).bind(scope.workspaceId, ...bindings).first<{
        id: string; snapshot_id: string; schema_version: string; media_type: string; object_key: string; content_sha256: string;
        byte_length: number; manifest_json: string; manifest_digest: string; row_count: number; prospect_count: number; created_at: number;
        idempotency_key: string;
      }>();
      if (!row) return null;
      if (row.media_type !== "text/csv" || (await digest(row.manifest_json)) !== row.manifest_digest) throw conflict("artifact_integrity");
      const events = await all<{ event_kind: string; expires_at: number | null; reason_code: string; occurred_at: number }>(database.prepare(
        "SELECT event_kind,expires_at,reason_code,occurred_at FROM handoff_delivery_events WHERE workspace_id=? AND subject_kind='export_artifact' AND subject_id=?",
      ).bind(scope.workspaceId, row.id));
      const issued = events.find((event) => event.event_kind === "issued");
      const terminal = events.find((event) => event.event_kind === "expired" || event.event_kind === "failed");
      return Object.freeze({
        id: row.id, snapshotId: row.snapshot_id, schemaVersion: row.schema_version, mediaType: "text/csv" as const,
        objectKey: row.object_key, contentSha256: row.content_sha256, byteLength: Number(row.byte_length),
        manifest: snapshotData(JSON.parse(row.manifest_json)) as Readonly<Record<string, unknown>>, manifestDigest: row.manifest_digest,
        rowCount: Number(row.row_count), prospectCount: Number(row.prospect_count), createdAt: Number(row.created_at),
        idempotencyKey: row.idempotency_key,
        delivery: Object.freeze({
          issued: issued ? Object.freeze({ occurredAt: Number(issued.occurred_at), expiresAt: Number(issued.expires_at) }) : null,
          terminal: terminal ? Object.freeze({ eventKind: terminal.event_kind as "expired" | "failed", reasonCode: terminal.reason_code, occurredAt: Number(terminal.occurred_at) }) : null,
        }),
      });
    },

    recordDeliveryEvent: async (value: RecordDeliveryEventInput): Promise<HandoffRecoveryWriteResult> => {
      const input = snapshotCommand(value, ["subjectKind", "subjectId", "eventKind", "expiresAt", "reasonCode", "occurredAt", "idempotencyKey"]);
      const at = now();
      if (
        !["export_artifact", "recovery_archive"].includes(String(input.subjectKind)) || !["issued", "expired", "failed"].includes(String(input.eventKind))
        || !validId(input.subjectId) || !validReason(input.reasonCode) || !positive(input.occurredAt) || input.occurredAt > at || !validId(input.idempotencyKey)
        || (input.eventKind === "issued" ? !(positive(input.expiresAt) && input.expiresAt > input.occurredAt) : input.expiresAt !== null)
      ) throw conflict("invalid_delivery_event");
      await admitted();
      const eventDigest = await digest({ schema: "handoff-delivery-event/v1", workspaceId: scope.workspaceId, subjectKind: input.subjectKind, subjectId: input.subjectId, eventKind: input.eventKind, expiresAt: input.expiresAt, reasonCode: input.reasonCode, occurredAt: input.occurredAt });
      const operationDigest = await commandDigest(scope, "delivery_event.record", eventDigest);
      const id = await derivedId("hde", operationDigest);
      const subjectTable = input.subjectKind === "export_artifact" ? "handoff_export_artifacts" : "recovery_archives";
      return write({
        kind: "delivery_event.record", key: input.idempotencyKey, operationDigest, resultKind: "delivery_event", resultId: id,
        resultDigest: eventDigest, expectedRevision: 0,
        audit: { action: "delivery.event_recorded", subjectKind: "delivery_event", reasonCode: input.reasonCode },
        precheck: async () => {
          const subject = await database.prepare(`SELECT id FROM ${subjectTable} WHERE id=? AND workspace_id=? LIMIT 1`).bind(input.subjectId, scope.workspaceId).first();
          const events = await all<{ event_kind: string; occurred_at: number }>(database.prepare(
            "SELECT event_kind,occurred_at FROM handoff_delivery_events WHERE workspace_id=? AND subject_kind=? AND subject_id=?",
          ).bind(scope.workspaceId, input.subjectKind, input.subjectId));
          const issued = events.find((event) => event.event_kind === "issued");
          const terminal = events.some((event) => event.event_kind !== "issued");
          const available = input.eventKind === "issued" ? !issued : Boolean(issued) && !terminal && Number(issued?.occurred_at) <= input.occurredAt;
          if (!subject || !available) throw conflict("delivery_unavailable");
        },
        statements: (commandId) => [database.prepare(
          `INSERT INTO handoff_delivery_events (id,workspace_id,subject_kind,subject_id,event_kind,expires_at,reason_code,event_digest,command_id,occurred_at,created_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        ).bind(id, scope.workspaceId, input.subjectKind, input.subjectId, input.eventKind, input.expiresAt, input.reasonCode, eventDigest, commandId, input.occurredAt, at)],
      });
    },

    recordArchive: async (value: RecordArchiveInput): Promise<HandoffRecoveryWriteResult> => {
      const input = snapshotCommand(value, ["formatVersion", "schemaVersion", "compatibilityMin", "compatibilityMax", "manifest", "ciphertextSha256", "byteLength", "objectKey", "cipher", "kdf", "kdfParameters", "recordCount", "objectCount", "tombstoneCount", "reauthReferenceDigest", "idempotencyKey"]);
      const manifestJson = safeMetadata(input.manifest);
      const kdfParametersJson = safeMetadata(input.kdfParameters);
      if (
        ![input.formatVersion, input.schemaVersion, input.compatibilityMin, input.compatibilityMax].every((item) => VERSION.test(String(item)))
        || !validDigest(input.ciphertextSha256) || !validDigest(input.reauthReferenceDigest)
        || !positive(input.byteLength) || input.byteLength > MAX_ARTIFACT_BYTES || !OBJECT_KEY.test(String(input.objectKey))
        || !ENVELOPE_TOKEN.test(String(input.cipher)) || !ENVELOPE_TOKEN.test(String(input.kdf))
        || ![input.recordCount, input.objectCount, input.tombstoneCount].every(nonNegative) || !validId(input.idempotencyKey)
      ) throw conflict("invalid_archive");
      await admitted();
      const manifestDigest = await digest(manifestJson);
      const archiveDigest = await digest({
        schema: "recovery-archive/v1", workspaceId: scope.workspaceId, formatVersion: input.formatVersion, schemaVersion: input.schemaVersion,
        compatibilityMin: input.compatibilityMin, compatibilityMax: input.compatibilityMax, manifestDigest, ciphertextSha256: input.ciphertextSha256,
        byteLength: input.byteLength, objectKey: input.objectKey, cipher: input.cipher, kdf: input.kdf, kdfParametersJson,
        recordCount: input.recordCount, objectCount: input.objectCount, tombstoneCount: input.tombstoneCount, reauthReferenceDigest: input.reauthReferenceDigest,
      });
      const operationDigest = await commandDigest(scope, "archive.record", archiveDigest);
      const id = await derivedId("rar", operationDigest);
      return write({
        kind: "archive.record", key: input.idempotencyKey, operationDigest, resultKind: "recovery_archive", resultId: id,
        resultDigest: archiveDigest, expectedRevision: 0,
        audit: { action: "archive.recorded", subjectKind: "recovery_archive", reasonCode: "archive_recorded" },
        statements: (commandId) => [database.prepare(
          `INSERT INTO recovery_archives (
            id,workspace_id,command_id,format_version,schema_version,compatibility_min,compatibility_max,manifest_json,manifest_digest,
            ciphertext_sha256,byte_length,object_key,cipher,kdf,kdf_parameters_json,record_count,object_count,tombstone_count,
            reauth_reference_digest,created_at
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        ).bind(
          id, scope.workspaceId, commandId, input.formatVersion, input.schemaVersion, input.compatibilityMin, input.compatibilityMax,
          manifestJson, manifestDigest, input.ciphertextSha256, input.byteLength, input.objectKey, input.cipher, input.kdf, kdfParametersJson,
          input.recordCount, input.objectCount, input.tombstoneCount, input.reauthReferenceDigest, now(),
        )],
      });
    },

    recordDryRun: async (value: RecordDryRunInput): Promise<HandoffRecoveryWriteResult> => {
      const input = snapshotCommand(value, ["sourceWorkspaceId", "archiveManifestDigest", "archiveCiphertextSha256", "archiveSchemaVersion", "outcome", "reasonCode", "nonceDigest", "expiresAt", "invariantDigest", "idempotencyKey"]);
      const at = now();
      const accepted = input.outcome === "accepted";
      if (
        !validId(input.sourceWorkspaceId) || !validDigest(input.archiveManifestDigest) || !validDigest(input.archiveCiphertextSha256)
        || !VERSION.test(String(input.archiveSchemaVersion)) || !["accepted", "refused"].includes(String(input.outcome))
        || !validReason(input.reasonCode) || !validId(input.idempotencyKey)
        || (accepted
          ? input.reasonCode !== "verified" || !validDigest(input.nonceDigest) || !validDigest(input.invariantDigest) || !(positive(input.expiresAt) && input.expiresAt > at)
          : input.reasonCode === "verified" || input.nonceDigest !== null || input.expiresAt !== null || (input.invariantDigest !== null && !validDigest(input.invariantDigest)))
      ) throw conflict("invalid_dry_run");
      await admitted();
      const target = await readTargetState(database, scope.workspaceId);
      const dryRunDigest = await digest({
        schema: "recovery-dry-run/v1", workspaceId: scope.workspaceId, sourceWorkspaceId: input.sourceWorkspaceId,
        archiveManifestDigest: input.archiveManifestDigest, archiveCiphertextSha256: input.archiveCiphertextSha256,
        archiveSchemaVersion: input.archiveSchemaVersion, outcome: input.outcome, reasonCode: input.reasonCode,
        nonceDigest: input.nonceDigest, expiresAt: input.expiresAt, invariantDigest: input.invariantDigest, targetStateDigest: target.digest,
      });
      const operationDigest = await commandDigest(scope, "dry_run.record", dryRunDigest);
      const id = await derivedId("rdr", operationDigest);
      return write({
        kind: "dry_run.record", key: input.idempotencyKey, operationDigest, resultKind: "recovery_dry_run", resultId: id,
        resultDigest: dryRunDigest, expectedRevision: 0,
        audit: { action: "restore.dry_run_recorded", subjectKind: "recovery_dry_run", reasonCode: input.reasonCode },
        precheck: async () => {
          if (accepted && !target.clean) throw conflict("restore_target_not_clean");
        },
        statements: (commandId) => [database.prepare(
          `INSERT INTO recovery_dry_runs (
            id,workspace_id,command_id,source_workspace_id,archive_manifest_digest,archive_ciphertext_sha256,archive_schema_version,
            outcome,reason_code,nonce_digest,expires_at,target_state_digest,invariant_digest,dry_run_digest,created_at
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        ).bind(
          id, scope.workspaceId, commandId, input.sourceWorkspaceId, input.archiveManifestDigest, input.archiveCiphertextSha256,
          input.archiveSchemaVersion, input.outcome, input.reasonCode, input.nonceDigest, input.expiresAt, target.digest,
          input.invariantDigest, dryRunDigest, at,
        )],
      });
    },

    acquireRestoreLock: async (value: AcquireRestoreLockInput): Promise<HandoffRecoveryWriteResult> => {
      const input = snapshotCommand(value, ["dryRunId", "nonceDigest", "idempotencyKey"]);
      if (!validId(input.dryRunId) || !validDigest(input.nonceDigest) || !validId(input.idempotencyKey)) throw conflict("invalid_restore_lock");
      await admitted();
      const at = now();
      const lockDigest = await digest({ schema: "recovery-restore-lock/v1", workspaceId: scope.workspaceId, dryRunId: input.dryRunId, nonceDigest: input.nonceDigest });
      const operationDigest = await commandDigest(scope, "restore_lock.acquire", lockDigest);
      const id = await derivedId("rrl", operationDigest);
      return write({
        kind: "restore_lock.acquire", key: input.idempotencyKey, operationDigest, resultKind: "recovery_restore_lock", resultId: id,
        resultDigest: lockDigest, expectedRevision: 0,
        audit: { action: "restore.lock_acquired", subjectKind: "recovery_restore_lock", reasonCode: "lock_acquired" },
        precheck: async () => {
          const dryRun = await database.prepare(
            "SELECT outcome,nonce_digest,expires_at FROM recovery_dry_runs WHERE id=? AND workspace_id=? LIMIT 1",
          ).bind(input.dryRunId, scope.workspaceId).first<{ outcome: string; nonce_digest: string | null; expires_at: number | null }>();
          if (!dryRun || dryRun.outcome !== "accepted" || dryRun.nonce_digest !== input.nonceDigest || dryRun.expires_at === null || at > Number(dryRun.expires_at)) throw conflict("dry_run_not_accepted");
          const busy = await database.prepare(
            `SELECT 1 busy WHERE EXISTS (SELECT 1 FROM recovery_restore_locks lock WHERE lock.workspace_id=?1
                AND (lock.dry_run_id=?2 OR NOT EXISTS (SELECT 1 FROM recovery_restore_results result WHERE result.lock_id=lock.id)))
              OR EXISTS (SELECT 1 FROM recovery_restore_results applied WHERE applied.workspace_id=?1 AND applied.outcome='applied')`,
          ).bind(scope.workspaceId, input.dryRunId).first();
          if (busy) throw conflict("restore_lock_unavailable");
        },
        statements: (commandId) => [database.prepare(
          "INSERT INTO recovery_restore_locks (id,workspace_id,dry_run_id,command_id,nonce_digest,acquired_at,created_at) VALUES (?,?,?,?,?,?,?)",
        ).bind(id, scope.workspaceId, input.dryRunId, commandId, input.nonceDigest, at, at)],
      });
    },

    recordRestoreResult: async (value: RecordRestoreResultInput): Promise<HandoffRecoveryWriteResult> => {
      const input = snapshotCommand(value, ["lockId", "outcome", "reasonCode", "restoredRecordCount", "restoredObjectCount", "idempotencyKey"]);
      const applied = input.outcome === "applied";
      if (
        !validId(input.lockId) || !["applied", "rolled_back"].includes(String(input.outcome)) || !validReason(input.reasonCode)
        || !nonNegative(input.restoredRecordCount) || !nonNegative(input.restoredObjectCount) || !validId(input.idempotencyKey)
        || (!applied && (input.restoredRecordCount !== 0 || input.restoredObjectCount !== 0))
      ) throw conflict("invalid_restore_result");
      await admitted();
      const at = now();
      // Restored targets always start with schedules and effects disabled; only
      // a fresh upstream Phase 4 readiness activation may enable a schedule.
      const resultDigest = await digest({
        schema: "recovery-restore-result/v1", workspaceId: scope.workspaceId, lockId: input.lockId, outcome: input.outcome,
        reasonCode: input.reasonCode, restoredRecordCount: input.restoredRecordCount, restoredObjectCount: input.restoredObjectCount,
        schedulesEnabled: false, effectsEnabled: false,
      });
      const operationDigest = await commandDigest(scope, "restore_result.record", resultDigest);
      const id = await derivedId("rrr", operationDigest);
      return write({
        kind: "restore_result.record", key: input.idempotencyKey, operationDigest, resultKind: "recovery_restore_result", resultId: id,
        resultDigest, expectedRevision: 0,
        audit: { action: "restore.result_recorded", subjectKind: "recovery_restore_result", reasonCode: input.reasonCode },
        precheck: async () => {
          const lock = await database.prepare(
            `SELECT lock.id FROM recovery_restore_locks lock WHERE lock.id=? AND lock.workspace_id=?
               AND NOT EXISTS (SELECT 1 FROM recovery_restore_results result WHERE result.lock_id=lock.id) LIMIT 1`,
          ).bind(input.lockId, scope.workspaceId).first();
          if (!lock) throw conflict("restore_lock_unavailable");
          if (applied && await database.prepare("SELECT id FROM prospecting_schedules WHERE workspace_id=? AND active=1 LIMIT 1").bind(scope.workspaceId).first()) throw conflict("schedules_must_start_disabled");
        },
        statements: (commandId) => [database.prepare(
          `INSERT INTO recovery_restore_results (
            id,workspace_id,lock_id,command_id,outcome,reason_code,restored_record_count,restored_object_count,result_digest,
            schedules_enabled,effects_enabled,completed_at,created_at
          ) VALUES (?,?,?,?,?,?,?,?,?,0,0,?,?)`,
        ).bind(id, scope.workspaceId, input.lockId, commandId, input.outcome, input.reasonCode, input.restoredRecordCount, input.restoredObjectCount, resultDigest, at, at)],
      });
    },

    /** Bounded, minimized audit for a refused attempt. Writes no command and no domain row. */
    recordRefusal: async (value: RecordRefusalInput): Promise<HandoffRecoveryWriteResult> => {
      const input = snapshotCommand(value, ["action", "subjectKind", "subjectId", "reasonCode"]);
      if (
        !(REFUSAL_ACTIONS as readonly string[]).includes(String(input.action)) || !(SUBJECT_KINDS as readonly string[]).includes(String(input.subjectKind))
        || (input.subjectId !== null && !validId(input.subjectId)) || !validReason(input.reasonCode)
      ) throw conflict("invalid_refusal");
      await admitted();
      const at = now();
      const materialDigest = await digest({ schema: "handoff-recovery-refusal/v1", workspaceId: scope.workspaceId, action: input.action, subjectKind: input.subjectKind, subjectId: input.subjectId, reasonCode: input.reasonCode, at });
      const id = await derivedId("hra", materialDigest);
      try {
        await database.prepare(
          `INSERT INTO handoff_recovery_audit_events (id,workspace_id,actor_subject,action,subject_kind,subject_id,outcome,reason_code,material_digest,command_id,created_at)
           VALUES (?,?,?,?,?,?,'refused',?,?,NULL,?)`,
        ).bind(id, scope.workspaceId, scope.ownerSubject, input.action, input.subjectKind, input.subjectId, input.reasonCode, materialDigest, at).run();
        return Object.freeze({ id, digest: materialDigest, replayed: false });
      } catch {
        const prior = await database.prepare("SELECT id FROM handoff_recovery_audit_events WHERE workspace_id=? AND material_digest=? LIMIT 1").bind(scope.workspaceId, materialDigest).first<{ id: string }>();
        if (prior?.id === id) return Object.freeze({ id, digest: materialDigest, replayed: true });
        throw conflict();
      }
    },
  };
  return Object.freeze(repository);
}

async function execute(database: D1Database, scope: CapturedScope, plan: WritePlan, createdAt: number): Promise<HandoffRecoveryWriteResult> {
  const replay = await priorCommand(database, scope.workspaceId, plan.key);
  if (replay) return replayOrConflict(replay, plan);
  await plan.precheck?.();
  const commandId = await derivedId("hrc", plan.operationDigest);
  const auditMaterial = await digest({ schema: "handoff-recovery-audit/v1", action: plan.audit.action, subjectKind: plan.audit.subjectKind, subjectId: plan.resultId, reasonCode: plan.audit.reasonCode, operationDigest: plan.operationDigest });
  const statements = [
    database.prepare(
      `INSERT INTO handoff_recovery_commands (id,workspace_id,owner_subject,command_kind,idempotency_key,operation_digest,expected_revision,result_kind,result_id,created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
    ).bind(commandId, scope.workspaceId, scope.ownerSubject, plan.kind, plan.key, plan.operationDigest, plan.expectedRevision, plan.resultKind, plan.resultId, createdAt),
    ...plan.statements(commandId),
    database.prepare(
      `INSERT INTO handoff_recovery_audit_events (id,workspace_id,actor_subject,action,subject_kind,subject_id,outcome,reason_code,material_digest,command_id,created_at)
       VALUES (?,?,?,?,?,?,'recorded',?,?,?,?)`,
    ).bind(await derivedId("hra", auditMaterial), scope.workspaceId, scope.ownerSubject, plan.audit.action, plan.audit.subjectKind, plan.resultId, plan.audit.reasonCode, auditMaterial, commandId, createdAt),
  ];
  try {
    await database.batch(statements);
    return Object.freeze({ id: plan.resultId, digest: plan.resultDigest, replayed: false });
  } catch (error) {
    const winner = await priorCommand(database, scope.workspaceId, plan.key);
    if (winner) return replayOrConflict(winner, plan);
    throw conflict(classify(error));
  }
}

type CommandRow = { operation_digest: string; result_id: string; command_kind: string };

async function priorCommand(database: D1Database, workspaceId: string, key: string) {
  return database.prepare(
    "SELECT operation_digest,result_id,command_kind FROM handoff_recovery_commands WHERE workspace_id=? AND idempotency_key=? LIMIT 1",
  ).bind(workspaceId, key).first<CommandRow>();
}

function replayOrConflict(row: CommandRow, plan: WritePlan): HandoffRecoveryWriteResult {
  if (row.command_kind === plan.kind && row.operation_digest === plan.operationDigest && row.result_id === plan.resultId) {
    return Object.freeze({ id: plan.resultId, digest: plan.resultDigest, replayed: true });
  }
  throw conflict("idempotency_conflict");
}

function classify(error: unknown): string {
  const message = typeof error === "object" && error !== null && "message" in error ? String(error.message) : "";
  if (message.includes("suppression fence")) return "suppression_fence_stale";
  if (message.includes("contradicts a suppression exclusion") || message.includes("contradicts a contactable row")) return "suppressed_export_row";
  if (message.includes("in-scope package lineage")) return "package_approval_unavailable";
  if (message.includes("active or applied restore")) return "restore_lock_unavailable";
  if (message.includes("current accepted dry run")) return "dry_run_not_accepted";
  if (message.includes("schedules disabled")) return "schedules_must_start_disabled";
  if (message.includes("delivery event")) return "delivery_unavailable";
  if (message.includes("exact upstream schedule")) return "schedule_unavailable";
  if (message.includes("handoff_export_artifacts.")) return "artifact_conflict";
  if (message.includes("handoff_recovery_commands.operation_digest")) return "duplicate_evidence";
  return "conflict";
}

async function readSchedule(database: D1Database, workspaceId: string, profileId: string): Promise<UpstreamScheduleState | null> {
  const row = await database.prepare(
    `SELECT schedule.id,schedule.profile_id,schedule.revision,schedule.configuration_id,schedule.configuration_digest,schedule.cadence,
            schedule.intended_local_time,schedule.timezone,schedule.utc_offset_minutes,schedule.active,schedule.execution_state,
            activation.id activation_id,activation.audit_event_id
     FROM prospecting_schedules schedule
     JOIN profile_configuration_activations activation ON activation.workspace_id=schedule.workspace_id
       AND activation.profile_id=schedule.profile_id AND activation.configuration_id=schedule.configuration_id
     WHERE schedule.workspace_id=? AND schedule.profile_id=?
     ORDER BY schedule.active DESC,schedule.updated_at DESC,schedule.id DESC,activation.created_at DESC,activation.id DESC LIMIT 1`,
  ).bind(workspaceId, profileId).first<{
    id: string; profile_id: string; revision: number; configuration_id: string; configuration_digest: string; cadence: string;
    intended_local_time: string; timezone: string; utc_offset_minutes: number; active: number; execution_state: string;
    activation_id: string; audit_event_id: string;
  }>();
  if (!row) return null;
  return Object.freeze({
    scheduleId: row.id, profileId: row.profile_id, revision: Number(row.revision), configurationId: row.configuration_id,
    configurationDigest: row.configuration_digest, cadence: row.cadence, intendedLocalTime: row.intended_local_time,
    timezone: row.timezone, utcOffsetMinutes: Number(row.utc_offset_minutes), active: Number(row.active) === 1,
    executionState: row.execution_state, activationId: row.activation_id, activationAuditEventId: row.audit_event_id,
  });
}

async function readFirstExportReady(database: D1Database, workspaceId: string, windowStartAt: number, windowEndAt: number) {
  const rows = await all<{ prospect_id: string; id: string; sequence: number; occurred_at: number }>(database.prepare(
    `SELECT event.prospect_id,event.id,event.sequence,event.occurred_at FROM prospect_transition_events event
     WHERE event.workspace_id=? AND event.new_state='ExportReady' AND event.occurred_at>=? AND event.occurred_at<?
       AND NOT EXISTS (SELECT 1 FROM prospect_transition_events earlier WHERE earlier.prospect_id=event.prospect_id
         AND earlier.workspace_id=event.workspace_id AND earlier.new_state='ExportReady' AND earlier.sequence<event.sequence)
     ORDER BY event.occurred_at,event.prospect_id LIMIT ?`,
  ).bind(workspaceId, windowStartAt, windowEndAt, MAX_COHORT + 1));
  if (rows.length > MAX_COHORT) throw conflict("cohort_too_large");
  return Object.freeze(rows.map((row) => Object.freeze({ prospectId: row.prospect_id, transitionEventId: row.id, sequence: Number(row.sequence), occurredAt: Number(row.occurred_at) })));
}

/**
 * Every contactable row must cite an in-scope, unrevoked, unexpired package
 * approval for its own Prospect and Contact, and one of that version's
 * selected contact points. Package decisions stay upstream; this refuses a
 * row the upstream lineage no longer supports. 0023 repeats it below.
 */
async function requireRowPackageLineage(database: D1Database, workspaceId: string, rows: readonly ExportSnapshotRowInput[], at: number) {
  const approvalIds = [...new Set(rows.map((row) => row.packageApprovalId))];
  const lineage = new Map<string, { version_id: string; prospect_id: string; contact_id: string; expires_at: number; revoked: number; selected_json: string | null }>();
  for (let offset = 0; offset < approvalIds.length; offset += 100) {
    const chunk = approvalIds.slice(offset, offset + 100);
    for (const row of await all<{ approval_id: string; version_id: string; prospect_id: string; contact_id: string; expires_at: number; revoked: number; selected_json: string | null }>(database.prepare(
      `SELECT approval.id approval_id,version.id version_id,package.prospect_id,package.contact_id,approval.expires_at,
              EXISTS (SELECT 1 FROM outreach_approval_revocations revocation WHERE revocation.package_approval_id=approval.id AND revocation.workspace_id=approval.workspace_id) revoked,
              json_extract(version.snapshot_json,'$.selectedContactPointDigests') selected_json
       FROM outreach_package_approvals approval
       JOIN outreach_package_versions version ON version.id=approval.package_version_id AND version.workspace_id=approval.workspace_id
       JOIN outreach_packages package ON package.id=version.package_id AND package.workspace_id=version.workspace_id
       WHERE approval.workspace_id=? AND approval.id IN (${placeholders(chunk.length)})`,
    ).bind(workspaceId, ...chunk))) lineage.set(row.approval_id, row);
  }
  for (const row of rows) {
    const approval = lineage.get(row.packageApprovalId);
    if (
      !approval || approval.version_id !== row.packageVersionId || approval.prospect_id !== row.prospectId || approval.contact_id !== row.contactId
      || Number(approval.revoked) === 1 || !(Number(approval.expires_at) > at)
    ) throw conflict("package_approval_unavailable");
    const selected: unknown = approval.selected_json === null ? [] : JSON.parse(approval.selected_json);
    if (!Array.isArray(selected) || !selected.includes(row.contactPointDigest)) throw conflict("contact_point_not_selected");
  }
}

async function readFenceCount(database: D1Database, workspaceId: string) {
  const row = await database.prepare("SELECT COUNT(*) count FROM outreach_suppression_tombstones WHERE workspace_id=?").bind(workspaceId).first<{ count: number }>();
  return Number(row?.count ?? 0);
}

async function readFence(database: D1Database, workspaceId: string): Promise<SuppressionFence> {
  const rows = await all<{ id: string; subject_kind: string; subject_digest: string; channel: string; tombstone_digest: string; effective_at: number }>(database.prepare(
    `SELECT id,subject_kind,subject_digest,channel,tombstone_digest,effective_at FROM outreach_suppression_tombstones
     WHERE workspace_id=? ORDER BY created_at,id LIMIT ?`,
  ).bind(workspaceId, MAX_TOMBSTONES + 1));
  if (rows.length > MAX_TOMBSTONES) throw conflict("suppression_fence_too_large");
  return Object.freeze({
    tombstoneCount: rows.length,
    tombstones: Object.freeze(rows.map((row) => Object.freeze({
      id: row.id, subjectKind: row.subject_kind, subjectDigest: row.subject_digest, channel: row.channel,
      tombstoneDigest: row.tombstone_digest, effectiveAt: Number(row.effective_at),
    }))),
  });
}

async function readTargetState(database: D1Database, workspaceId: string): Promise<RestoreTargetState> {
  const tables = (await all<{ name: string; sql: string | null }>(database.prepare(
    "SELECT name,sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name",
  ))).filter((table) => TABLE_NAME.test(table.name) && !RECOVERY_EVIDENCE_TABLES.has(table.name) && WORKSPACE_COLUMN.test(String(table.sql ?? "")));
  const nonEmpty: { table: string; count: number }[] = [];
  for (const table of tables) {
    const row = await database.prepare(`SELECT COUNT(*) count FROM "${table.name}" WHERE workspace_id=?`).bind(workspaceId).first<{ count: number }>();
    const count = Number(row?.count ?? 0);
    if (count > 0) nonEmpty.push({ table: table.name, count });
  }
  const applied = Boolean(await database.prepare(
    "SELECT id FROM recovery_restore_results WHERE workspace_id=? AND outcome='applied' LIMIT 1",
  ).bind(workspaceId).first());
  const stateDigest = await digest({ schema: "recovery-target-state/v1", workspaceId, nonEmpty, restoreApplied: applied });
  return Object.freeze({
    clean: nonEmpty.length === 0 && !applied,
    nonEmptyTables: Object.freeze(nonEmpty.map((entry) => entry.table)),
    restoreApplied: applied,
    digest: stateDigest,
  });
}

async function requireAdmission(database: D1Database, scope: CapturedScope) {
  const row = await database.prepare("SELECT id FROM workspaces WHERE id=? AND owner_subject=? LIMIT 1").bind(scope.workspaceId, scope.ownerSubject).first();
  if (!row) throw conflict("not_admitted");
}

type CapturedScope = Readonly<{ workspaceId: string; ownerSubject: string }>;

function captureScope(value: HandoffRecoveryScope): CapturedScope {
  if (!plainObject(value) || !dataKeys(value, ["workspaceId", "ownerSubject"], ["now"])) throw new TypeError("invalid_handoff_recovery_scope");
  if (!validId(value.workspaceId) || typeof value.ownerSubject !== "string" || value.ownerSubject.length < 1 || value.ownerSubject.length > 320) throw new TypeError("invalid_handoff_recovery_scope");
  if (value.now !== undefined && typeof value.now !== "function") throw new TypeError("invalid_handoff_recovery_scope");
  return Object.freeze({ workspaceId: value.workspaceId, ownerSubject: value.ownerSubject });
}

async function commandDigest(scope: CapturedScope, kind: CommandKind, semanticDigest: string) {
  return digest({ schema: "handoff-recovery-command/v1", workspaceId: scope.workspaceId, ownerSubject: scope.ownerSubject, kind, semanticDigest });
}

/** Canonical JSON for public metadata; any secret-like key at any depth is refused. */
function safeMetadata(value: unknown): string {
  if (!plainObject(value)) throw conflict("invalid_metadata");
  const visit = (item: unknown): void => {
    if (Array.isArray(item)) { item.forEach(visit); return; }
    if (plainObject(item)) {
      for (const [key, child] of Object.entries(item)) {
        if (SECRET_KEY.test(key)) throw conflict("secret_bearing_metadata");
        visit(child);
      }
    }
  };
  visit(value);
  const json = canonical(value);
  if (new TextEncoder().encode(json).byteLength > MAX_METADATA_BYTES) throw conflict("invalid_metadata");
  return json;
}

function canonical(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

function canonicalValue(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (plainObject(value)) return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]));
  throw conflict("invalid_metadata");
}

async function digest(value: unknown) {
  const bytes = new TextEncoder().encode(typeof value === "string" ? value : canonical(value));
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function derivedId(prefix: string, material: string) {
  return `${prefix}_${(DIGEST.test(material) ? material : await digest(material)).slice(0, 32)}`;
}

/** Capture before any await; never invoke accessors or toJSON. */
function snapshotData<T>(value: T): T {
  let nodes = 0;
  const seen = new Set<object>();
  const copy = (item: unknown, depth: number): unknown => {
    if (++nodes > 20_000 || depth > 12) throw conflict("invalid_command_shape");
    if (item === null || typeof item === "string" || typeof item === "boolean" || (typeof item === "number" && Number.isSafeInteger(item))) return item;
    if (!item || typeof item !== "object" || seen.has(item)) throw conflict("invalid_command_shape");
    seen.add(item);
    try {
      if (Array.isArray(item)) {
        if (Object.getPrototypeOf(item) !== Array.prototype || item.length > MAX_ROWS || !dataKeys(item, ["length", ...Array.from({ length: item.length }, (_, index) => String(index))])) throw conflict("invalid_command_shape");
        return Object.freeze(Array.from({ length: item.length }, (_, index) => copy(Object.getOwnPropertyDescriptor(item, String(index))!.value, depth + 1)));
      }
      if (!plainObject(item)) throw conflict("invalid_command_shape");
      const keys = Reflect.ownKeys(item);
      if (keys.some((key) => typeof key !== "string" || !Object.hasOwn(Object.getOwnPropertyDescriptor(item, key) ?? {}, "value"))) throw conflict("invalid_command_shape");
      return Object.freeze(Object.fromEntries((keys as string[]).map((key) => [key, copy(Object.getOwnPropertyDescriptor(item, key)!.value, depth + 1)])));
    } finally {
      seen.delete(item);
    }
  };
  return copy(value, 0) as T;
}

function snapshotCommand<T>(value: T, keys: readonly string[]): T {
  const copied = snapshotData(value);
  if (!plainObject(copied) || !exactKeys(copied, keys)) throw conflict("invalid_command_shape");
  return copied;
}

async function all<T>(statement: D1PreparedStatement): Promise<T[]> {
  return ((await statement.all<T>()).results ?? []) as T[];
}

function boundedIdList(value: unknown, min: number, max: number, reason: string): string[] {
  const copied = snapshotData(value);
  if (!Array.isArray(copied) || copied.length < min || copied.length > max || !copied.every(validId) || new Set(copied).size !== copied.length) throw conflict(reason);
  return [...copied].sort();
}

function placeholders(count: number) {
  return Array.from({ length: count }, () => "?").join(",");
}

function compareTuple(left: readonly string[], right: readonly string[]) {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return left[index] < right[index] ? -1 : 1;
  }
  return 0;
}

function dataKeys(value: object, required: readonly string[], optional: readonly string[] = []) {
  const keys = Reflect.ownKeys(value);
  return required.every((key) => keys.includes(key)) && keys.every((key) => typeof key === "string" && [...required, ...optional].includes(key)
    && Object.hasOwn(Object.getOwnPropertyDescriptor(value, key) ?? {}, "value"));
}

function validId(value: unknown): value is string { return typeof value === "string" && ID.test(value); }
function validDigest(value: unknown): value is string { return typeof value === "string" && DIGEST.test(value); }
function validReason(value: unknown): value is string { return typeof value === "string" && REASON.test(value); }
function positive(value: unknown): value is number { return Number.isSafeInteger(value) && Number(value) > 0; }
function nonNegative(value: unknown): value is number { return Number.isSafeInteger(value) && Number(value) >= 0; }
function plainObject(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype; }
function exactKeys(value: object, keys: readonly string[]) { return Object.keys(value).sort().join("\u0000") === [...keys].sort().join("\u0000"); }
function conflict(reason?: string) { return new HandoffRecoveryConflictError(reason); }
