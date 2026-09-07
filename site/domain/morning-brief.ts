/**
 * Offline Morning Brief projector.
 *
 * Traceability: this composes the existing `reduceWeeklyOutcome` core with a
 * read-only upstream Phase 4 schedule observation, a counts-only CRM handoff
 * readiness preview, and a restored-workspace fence, exactly as the locked
 * Phase 7 Seeded Mining operating view, Recurring-schedule authority
 * allocation, and Seven-lead weekly outcome decisions describe.
 *
 * Boundary. This module is a pure reducer over caller-supplied values. It has
 * no database, repository, route, persistence, scheduler, runner, provider,
 * export, delivery, archive, restore, environment, filesystem, or network
 * port. It imports no preparation-only module and is composed into no runtime
 * surface. It reports the upstream schedule state and never requests,
 * authorizes, provisions, or records a schedule-activation command. It reports
 * handoff readiness counts and never reads an eligibility row, serializes a
 * CSV byte, computes an artifact checksum, persists a version, or delivers a
 * file. It reports a restored workspace and never verifies, decrypts, applies,
 * or claims a recovery. A `status: "available"` brief is a description of the
 * supplied values, not evidence that any modelled state is real.
 */

import {
  reduceWeeklyOutcome,
  WEEKLY_OUTCOME_LOSS_CATEGORIES,
  WEEKLY_OUTCOME_TARGET,
  WEEKLY_OUTCOME_TIME_ZONE,
  type WeeklyOutcomeAvailable,
  type WeeklyOutcomeCohortEntry,
  type WeeklyOutcomeLossCategory,
  type WeeklyOutcomeUnavailableReason,
  type WeeklyOutcomeWeek,
} from "./weekly-outcome";

export const MORNING_BRIEF_SCHEDULE_DEFINITION = Object.freeze({
  cadence: "weekdays" as const,
  localTime: "06:00" as const,
  timeZone: WEEKLY_OUTCOME_TIME_ZONE,
  upstreamAuthority: "phase4_profile_readiness" as const,
});

/** Upstream observations older than this are reported blocked, never current. */
export const MORNING_BRIEF_MAX_OBSERVATION_AGE_MS = 86_400_000 as const;
export const MORNING_BRIEF_MAX_COUNT = 1_000_000 as const;
export const MORNING_BRIEF_MAX_GREENFIELD_PROFILES = 64 as const;

export const MORNING_BRIEF_EXCLUSION_REASONS = Object.freeze([
  "duplicate_row_identity",
  "suppressed",
  "verification_stale",
  "verification_invalid",
  "no_approved_package",
  "disqualified",
  "high_risk_drift",
  "identity_merge_or_split",
  "deleted",
  "cross_scope",
  "other_current_ineligible",
] as const);

export const MORNING_BRIEF_WEEKLY_EXPLANATION = "Counts each stable Prospect once, at its first Export-ready transition this local week. CSV contact rows, re-exports, and later reversals do not increase this target." as const;

export const MORNING_BRIEF_PILOT_NOTICE = "Controlled pilot — all displayed records are illustrative or synthetic until the required Phase 3–6 authority and Phase 7 release gates are accepted. This Phase 7 surface cannot change schedules, providers, outreach, or restore effects; restored targets remain disabled." as const;

export const MORNING_BRIEF_GREENFIELD_NOTICE = "Greenfield is not an active operating profile. It contributes no schedule, weekly outcome, handoff, or runner activity." as const;

/** Every operational authority this projection can confer. All are false. */
export const MORNING_BRIEF_AUTHORITY = Object.freeze({
  changeSchedule: false,
  activateRunner: false,
  readEligibilityRows: false,
  materializeExport: false,
  deliverExport: false,
  createArchive: false,
  verifyRecovery: false,
  applyRestore: false,
  invokeProvider: false,
  persist: false,
});

/** Every effect counter this projection can move. All are zero. */
export const MORNING_BRIEF_EFFECTS = Object.freeze({
  schedulerCalls: 0,
  runnerCalls: 0,
  providerCalls: 0,
  exportBytesCreated: 0,
  exportChecksumsCreated: 0,
  deliveries: 0,
  archivesCreated: 0,
  restoresApplied: 0,
  persistedRecords: 0,
  targetWrites: 0,
  networkCalls: 0,
});

export type MorningBriefExclusionReason =
  (typeof MORNING_BRIEF_EXCLUSION_REASONS)[number];

export type SafeReference = Readonly<{ id: string; digest: string }>;

export type MorningBriefScope = Readonly<{
  workspaceId: string;
  companyId: string;
  productId: string;
  marketPlayId: string;
  profileId: string;
  profileLifecycle: "Operating" | "Draft";
  activeConfigurationDigest: string;
}>;

/**
 * A read-only observation of the Phase 4-owned recurring schedule. It is
 * consumed as evidence; supplying it confers no schedule authority here.
 */
export type UpstreamScheduleObservation = Readonly<{
  observationRef: SafeReference;
  profileId: string;
  configurationDigest: string;
  cadence: string;
  localTime: string;
  timeZone: string;
  upstreamAuthority: string;
  readinessRef: SafeReference;
  state: "enabled" | "disabled";
  observedAt: string;
}>;

/**
 * A counts-only preview of current CRM handoff readiness. It carries no row,
 * contact value, CSV byte, artifact checksum, or delivery handle.
 */
export type HandoffReadinessPreview = Readonly<{
  snapshotRef: SafeReference;
  evaluatedAt: string;
  exportReadyProspectCount: number;
  uniqueEligibleProspectCount: number;
  eligibleContactRowCount: number;
  nonContactableReferenceCount: number;
  exclusions: Readonly<Record<MorningBriefExclusionReason, number>>;
  dependencies: Readonly<{
    configurationDigest: string;
    packagePolicyDigest: string;
    suppressionFenceRef: SafeReference;
  }>;
}>;

export type WorkspaceOrigin =
  | Readonly<{ kind: "original" }>
  | Readonly<{
    kind: "restored";
    restoreRef: SafeReference;
    restoredAt: string;
    freshUpstreamActivation: Readonly<{
      activationRef: SafeReference;
      activatedAt: string;
    }> | null;
  }>;

export type GreenfieldProfileNote = Readonly<{
  profileId: string;
  label: string;
}>;

export type MorningBriefInput = Readonly<{
  scope: MorningBriefScope;
  asOf: string;
  weeklyHistory: unknown;
  scheduleObservation: UpstreamScheduleObservation | null;
  handoffReadiness: HandoffReadinessPreview | null;
  workspaceOrigin: WorkspaceOrigin;
  greenfieldProfiles: readonly GreenfieldProfileNote[];
}>;

export type MorningBriefUnavailableReason =
  | "morning_brief_input_malformed"
  | "morning_brief_raw_identity_value_present"
  | "weekly_history_scope_mismatch"
  | "weekly_history_as_of_mismatch"
  | "weekly_outcome_unavailable";

export type ScheduleBlockReason =
  | "schedule_observation_absent"
  | "schedule_definition_mismatch"
  | "schedule_scope_mismatch"
  | "schedule_configuration_drift"
  | "schedule_upstream_authority_invalid"
  | "schedule_observation_in_future"
  | "schedule_observation_stale"
  | "workspace_restored_pending_fresh_upstream_activation";

export type HandoffBlockReason =
  | "handoff_preview_absent"
  | "handoff_snapshot_in_future"
  | "handoff_snapshot_stale"
  | "handoff_configuration_drift"
  | "handoff_counts_inconsistent";

export type MorningBriefSchedulePanel = Readonly<{
  status: "current" | "disabled_pending_fresh_upstream_activation" | "blocked" | "unknown";
  definition: typeof MORNING_BRIEF_SCHEDULE_DEFINITION;
  reportedState: "enabled" | "disabled" | null;
  observationRef: SafeReference | null;
  readinessRef: SafeReference | null;
  observedAt: string | null;
  reasonCodes: readonly ScheduleBlockReason[];
  changeableFromThisSurface: false;
}>;

export type MorningBriefHandoffPanel = Readonly<{
  status: "current" | "blocked";
  snapshotRef: SafeReference | null;
  evaluatedAt: string | null;
  counts: Readonly<{
    exportReadyProspectCount: number;
    uniqueEligibleProspectCount: number;
    eligibleContactRowCount: number;
    nonContactableReferenceCount: number;
  }> | null;
  exclusions: Readonly<Record<MorningBriefExclusionReason, number>> | null;
  dependencies: HandoffReadinessPreview["dependencies"] | null;
  reasonCodes: readonly HandoffBlockReason[];
  materializableFromThisSurface: false;
}>;

export type MorningBriefWeeklyPanel = Readonly<{
  target: typeof WEEKLY_OUTCOME_TARGET;
  timeZone: typeof WEEKLY_OUTCOME_TIME_ZONE;
  week: WeeklyOutcomeWeek;
  profileIncluded: boolean;
  exclusions: WeeklyOutcomeAvailable["exclusions"];
  newlyExportReadyProspectCount: number;
  remainingProspectsToTarget: number;
  distinctStableProspectCount: number;
  distinctStableContactCount: number;
  cohort: readonly WeeklyOutcomeCohortEntry[];
  explanation: typeof MORNING_BRIEF_WEEKLY_EXPLANATION;
}>;

export type MorningBriefLossPanel = Readonly<Record<
  WeeklyOutcomeLossCategory,
  Readonly<{
    eventCount: number;
    distinctProspectCount: number;
    distinctContactCount: number;
  }>
>>;

export type MorningBriefAvailable = Readonly<{
  status: "available";
  generatedAt: string;
  scope: MorningBriefScope;
  pilotNotice: typeof MORNING_BRIEF_PILOT_NOTICE;
  weekly: MorningBriefWeeklyPanel;
  losses: MorningBriefLossPanel;
  schedule: MorningBriefSchedulePanel;
  handoff: MorningBriefHandoffPanel;
  workspace: Readonly<{
    origin: "original" | "restored";
    restoreRef: SafeReference | null;
    restoredEffectsFenced: boolean;
    freshUpstreamActivationRef: SafeReference | null;
  }>;
  greenfield: Readonly<{
    notice: typeof MORNING_BRIEF_GREENFIELD_NOTICE;
    profiles: readonly Readonly<{
      profileId: string;
      label: string;
      contributesToWeeklyOutcome: false;
      contributesToHandoff: false;
      contributesToSchedule: false;
    }>[];
  }>;
  authority: typeof MORNING_BRIEF_AUTHORITY;
  effects: typeof MORNING_BRIEF_EFFECTS;
}>;

export type MorningBriefUnavailable = Readonly<{
  status: "unavailable";
  generatedAt: null;
  reasonCodes: readonly MorningBriefUnavailableReason[];
  weeklyReasonCodes: readonly WeeklyOutcomeUnavailableReason[];
  scope: null;
  weekly: null;
  losses: null;
  schedule: null;
  handoff: null;
  workspace: null;
  greenfield: null;
  authority: typeof MORNING_BRIEF_AUTHORITY;
  effects: typeof MORNING_BRIEF_EFFECTS;
}>;

export type MorningBriefResult = MorningBriefAvailable | MorningBriefUnavailable;

const ID = /^[A-Za-z0-9](?:[A-Za-z0-9._:-]{0,126}[A-Za-z0-9])?$/u;
const DIGEST = /^[a-f0-9]{64}$/u;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const LABEL = /^[A-Za-z0-9](?:[A-Za-z0-9 .,'–—/()-]{0,126}[A-Za-z0-9.)])?$/u;
// Fail-closed identity fence: an accepted identifier or label may never carry
// an address separator or a phone-length digit run.
const RAW_IDENTITY = /@|\d{7}/u;

class BriefUnavailable extends Error {
  constructor(
    readonly reason: MorningBriefUnavailableReason,
    readonly weeklyReasonCodes: readonly WeeklyOutcomeUnavailableReason[] = [],
  ) {
    super(reason);
  }
}

/**
 * Reduce caller-supplied operating evidence into the read-only Morning Brief
 * projection. Performs no I/O and grants no authority in any result.
 */
export function composeMorningBrief(input: MorningBriefInput): MorningBriefResult {
  try {
    return project(normalizeInput(input));
  } catch (error) {
    if (error instanceof BriefUnavailable) {
      return unavailable(error.reason, error.weeklyReasonCodes);
    }
    return unavailable("morning_brief_input_malformed");
  }
}

type NormalizedInput = Readonly<{
  scope: MorningBriefScope;
  asOf: string;
  weekly: WeeklyOutcomeAvailable;
  scheduleObservation: UpstreamScheduleObservation | null;
  handoffReadiness: HandoffReadinessPreview | null;
  workspaceOrigin: WorkspaceOrigin;
  greenfieldProfiles: readonly GreenfieldProfileNote[];
}>;

function normalizeInput(value: unknown): NormalizedInput {
  const input = exactRecord(value, [
    "scope", "asOf", "weeklyHistory", "scheduleObservation", "handoffReadiness",
    "workspaceOrigin", "greenfieldProfiles",
  ]);
  const scope = normalizeScope(input.scope);
  const asOf = instant(input.asOf);
  const weekly = reduceScopedWeeklyOutcome(input.weeklyHistory, scope, asOf);
  const scheduleObservation = input.scheduleObservation === null
    ? null
    : normalizeScheduleObservation(input.scheduleObservation);
  const handoffReadiness = input.handoffReadiness === null
    ? null
    : normalizeHandoffReadiness(input.handoffReadiness);
  const workspaceOrigin = normalizeWorkspaceOrigin(input.workspaceOrigin, asOf);
  const greenfieldProfiles = denseArray(
    input.greenfieldProfiles,
    MORNING_BRIEF_MAX_GREENFIELD_PROFILES,
  ).map((entry) => normalizeGreenfieldProfile(entry, scope));
  unique(greenfieldProfiles.map((entry) => entry.profileId));
  return deepFreeze({
    scope,
    asOf,
    weekly,
    scheduleObservation,
    handoffReadiness,
    workspaceOrigin,
    greenfieldProfiles,
  });
}

function normalizeScope(value: unknown): MorningBriefScope {
  const input = exactRecord(value, [
    "workspaceId", "companyId", "productId", "marketPlayId", "profileId",
    "profileLifecycle", "activeConfigurationDigest",
  ]);
  if (input.profileLifecycle !== "Operating" && input.profileLifecycle !== "Draft") {
    malformed();
  }
  return deepFreeze({
    workspaceId: stableId(input.workspaceId),
    companyId: stableId(input.companyId),
    productId: stableId(input.productId),
    marketPlayId: stableId(input.marketPlayId),
    profileId: stableId(input.profileId),
    profileLifecycle: input.profileLifecycle,
    activeConfigurationDigest: digest(input.activeConfigurationDigest),
  });
}

/**
 * The brief never accepts a caller-supplied weekly projection. It binds the
 * supplied history to this scope and instant, then derives the projection from
 * the existing reducer so a forged "available" result cannot be injected.
 */
function reduceScopedWeeklyOutcome(
  value: unknown,
  scope: MorningBriefScope,
  asOf: string,
): WeeklyOutcomeAvailable {
  const history = exactRecordAtLeast(value, ["scope", "asOf"]);
  const historyScope = exactRecordAtLeast(history.scope, [
    "workspaceId", "companyId", "productId", "marketPlayId", "profileId",
    "profileLifecycle",
  ]);
  for (const key of [
    "workspaceId", "companyId", "productId", "marketPlayId", "profileId",
    "profileLifecycle",
  ] as const) {
    if (historyScope[key] !== scope[key]) {
      throw new BriefUnavailable("weekly_history_scope_mismatch");
    }
  }
  if (history.asOf !== asOf) throw new BriefUnavailable("weekly_history_as_of_mismatch");
  const result = reduceWeeklyOutcome(value as never);
  if (result.status !== "available") {
    throw new BriefUnavailable("weekly_outcome_unavailable", result.reasonCodes);
  }
  return result;
}

function normalizeScheduleObservation(value: unknown): UpstreamScheduleObservation {
  const input = exactRecord(value, [
    "observationRef", "profileId", "configurationDigest", "cadence", "localTime",
    "timeZone", "upstreamAuthority", "readinessRef", "state", "observedAt",
  ]);
  if (input.state !== "enabled" && input.state !== "disabled") malformed();
  return deepFreeze({
    observationRef: normalizeReference(input.observationRef),
    profileId: stableId(input.profileId),
    configurationDigest: digest(input.configurationDigest),
    cadence: boundedTag(input.cadence),
    localTime: boundedTag(input.localTime),
    timeZone: boundedTag(input.timeZone),
    upstreamAuthority: boundedTag(input.upstreamAuthority),
    readinessRef: normalizeReference(input.readinessRef),
    state: input.state,
    observedAt: instant(input.observedAt),
  });
}

function normalizeHandoffReadiness(value: unknown): HandoffReadinessPreview {
  const input = exactRecord(value, [
    "snapshotRef", "evaluatedAt", "exportReadyProspectCount",
    "uniqueEligibleProspectCount", "eligibleContactRowCount",
    "nonContactableReferenceCount", "exclusions", "dependencies",
  ]);
  const exclusionInput = exactRecord(input.exclusions, MORNING_BRIEF_EXCLUSION_REASONS);
  const exclusions = {} as Record<MorningBriefExclusionReason, number>;
  for (const reason of MORNING_BRIEF_EXCLUSION_REASONS) {
    exclusions[reason] = boundedCount(exclusionInput[reason]);
  }
  const dependencyInput = exactRecord(input.dependencies, [
    "configurationDigest", "packagePolicyDigest", "suppressionFenceRef",
  ]);
  return deepFreeze({
    snapshotRef: normalizeReference(input.snapshotRef),
    evaluatedAt: instant(input.evaluatedAt),
    exportReadyProspectCount: boundedCount(input.exportReadyProspectCount),
    uniqueEligibleProspectCount: boundedCount(input.uniqueEligibleProspectCount),
    eligibleContactRowCount: boundedCount(input.eligibleContactRowCount),
    nonContactableReferenceCount: boundedCount(input.nonContactableReferenceCount),
    exclusions,
    dependencies: {
      configurationDigest: digest(dependencyInput.configurationDigest),
      packagePolicyDigest: digest(dependencyInput.packagePolicyDigest),
      suppressionFenceRef: normalizeReference(dependencyInput.suppressionFenceRef),
    },
  });
}

function normalizeWorkspaceOrigin(value: unknown, asOf: string): WorkspaceOrigin {
  const discriminant = exactRecordAtLeast(value, ["kind"]);
  if (discriminant.kind === "original") {
    exactRecord(value, ["kind"]);
    return deepFreeze({ kind: "original" });
  }
  if (discriminant.kind !== "restored") malformed();
  const input = exactRecord(value, [
    "kind", "restoreRef", "restoredAt", "freshUpstreamActivation",
  ]);
  const restoredAt = instant(input.restoredAt);
  if (Date.parse(restoredAt) > Date.parse(asOf)) malformed();
  let freshUpstreamActivation: null | Readonly<{
    activationRef: SafeReference;
    activatedAt: string;
  }> = null;
  if (input.freshUpstreamActivation !== null) {
    const activation = exactRecord(input.freshUpstreamActivation, [
      "activationRef", "activatedAt",
    ]);
    freshUpstreamActivation = {
      activationRef: normalizeReference(activation.activationRef),
      activatedAt: instant(activation.activatedAt),
    };
  }
  return deepFreeze({
    kind: "restored",
    restoreRef: normalizeReference(input.restoreRef),
    restoredAt,
    freshUpstreamActivation,
  });
}

function normalizeGreenfieldProfile(
  value: unknown,
  scope: MorningBriefScope,
): GreenfieldProfileNote {
  const input = exactRecord(value, ["profileId", "label"]);
  const profileId = stableId(input.profileId);
  if (profileId === scope.profileId) malformed();
  return deepFreeze({ profileId, label: label(input.label) });
}

function project(input: NormalizedInput): MorningBriefAvailable {
  const restorePending = input.workspaceOrigin.kind === "restored"
    && !hasFreshUpstreamActivation(input.workspaceOrigin, input.asOf);
  return deepFreeze({
    status: "available",
    generatedAt: input.asOf,
    scope: input.scope,
    pilotNotice: MORNING_BRIEF_PILOT_NOTICE,
    weekly: projectWeekly(input.weekly),
    losses: projectLosses(input.weekly),
    schedule: projectSchedule(input, restorePending),
    handoff: projectHandoff(input),
    workspace: {
      origin: input.workspaceOrigin.kind,
      restoreRef: input.workspaceOrigin.kind === "restored"
        ? input.workspaceOrigin.restoreRef
        : null,
      restoredEffectsFenced: input.workspaceOrigin.kind === "restored",
      freshUpstreamActivationRef: input.workspaceOrigin.kind === "restored"
        && !restorePending
        ? input.workspaceOrigin.freshUpstreamActivation?.activationRef ?? null
        : null,
    },
    greenfield: {
      notice: MORNING_BRIEF_GREENFIELD_NOTICE,
      profiles: input.greenfieldProfiles.map((entry) => deepFreeze({
        profileId: entry.profileId,
        label: entry.label,
        contributesToWeeklyOutcome: false as const,
        contributesToHandoff: false as const,
        contributesToSchedule: false as const,
      })),
    },
    authority: MORNING_BRIEF_AUTHORITY,
    effects: MORNING_BRIEF_EFFECTS,
  });
}

function hasFreshUpstreamActivation(
  origin: Extract<WorkspaceOrigin, { kind: "restored" }>,
  asOf: string,
) {
  const activation = origin.freshUpstreamActivation;
  if (activation === null) return false;
  const activatedAt = Date.parse(activation.activatedAt);
  return activatedAt > Date.parse(origin.restoredAt) && activatedAt <= Date.parse(asOf);
}

function projectWeekly(weekly: WeeklyOutcomeAvailable): MorningBriefWeeklyPanel {
  return deepFreeze({
    target: WEEKLY_OUTCOME_TARGET,
    timeZone: WEEKLY_OUTCOME_TIME_ZONE,
    week: weekly.week,
    profileIncluded: weekly.profileIncluded,
    exclusions: weekly.exclusions,
    newlyExportReadyProspectCount: weekly.counts.newlyExportReadyProspectCount,
    remainingProspectsToTarget: weekly.counts.remainingProspectsToTarget,
    distinctStableProspectCount: weekly.counts.distinctStableProspectCount,
    distinctStableContactCount: weekly.counts.distinctStableContactCount,
    cohort: weekly.cohort,
    explanation: MORNING_BRIEF_WEEKLY_EXPLANATION,
  });
}

function projectLosses(weekly: WeeklyOutcomeAvailable): MorningBriefLossPanel {
  const losses = {} as Record<
    WeeklyOutcomeLossCategory,
    { eventCount: number; distinctProspectCount: number; distinctContactCount: number }
  >;
  for (const category of WEEKLY_OUTCOME_LOSS_CATEGORIES) {
    const ledger = weekly.losses[category];
    losses[category] = deepFreeze({
      eventCount: ledger.eventCount,
      distinctProspectCount: ledger.distinctProspectCount,
      distinctContactCount: ledger.distinctContactCount,
    });
  }
  return deepFreeze(losses);
}

function projectSchedule(
  input: NormalizedInput,
  restorePending: boolean,
): MorningBriefSchedulePanel {
  const observation = input.scheduleObservation;
  const reasonCodes: ScheduleBlockReason[] = [];
  if (restorePending) reasonCodes.push("workspace_restored_pending_fresh_upstream_activation");
  if (observation === null) {
    reasonCodes.push("schedule_observation_absent");
    return schedulePanel("unknown", null, null, null, null, reasonCodes);
  }
  if (observation.cadence !== MORNING_BRIEF_SCHEDULE_DEFINITION.cadence
    || observation.localTime !== MORNING_BRIEF_SCHEDULE_DEFINITION.localTime
    || observation.timeZone !== MORNING_BRIEF_SCHEDULE_DEFINITION.timeZone) {
    reasonCodes.push("schedule_definition_mismatch");
  }
  if (observation.profileId !== input.scope.profileId) {
    reasonCodes.push("schedule_scope_mismatch");
  }
  if (observation.configurationDigest !== input.scope.activeConfigurationDigest) {
    reasonCodes.push("schedule_configuration_drift");
  }
  if (observation.upstreamAuthority !== MORNING_BRIEF_SCHEDULE_DEFINITION.upstreamAuthority) {
    reasonCodes.push("schedule_upstream_authority_invalid");
  }
  const age = Date.parse(input.asOf) - Date.parse(observation.observedAt);
  if (age < 0) reasonCodes.push("schedule_observation_in_future");
  else if (age > MORNING_BRIEF_MAX_OBSERVATION_AGE_MS) {
    reasonCodes.push("schedule_observation_stale");
  }

  const blocked = reasonCodes.some(
    (reason) => reason !== "workspace_restored_pending_fresh_upstream_activation",
  );
  if (blocked) {
    return schedulePanel(
      "blocked", null, observation.observationRef, observation.readinessRef,
      observation.observedAt, sortText(reasonCodes),
    );
  }
  // A restored target is reported disabled regardless of the source state it
  // carried; only a fresh upstream Phase 4 activation can change that.
  if (restorePending) {
    return schedulePanel(
      "disabled_pending_fresh_upstream_activation", "disabled",
      observation.observationRef, observation.readinessRef, observation.observedAt,
      reasonCodes,
    );
  }
  return schedulePanel(
    "current", observation.state, observation.observationRef,
    observation.readinessRef, observation.observedAt, [],
  );
}

function schedulePanel(
  status: MorningBriefSchedulePanel["status"],
  reportedState: MorningBriefSchedulePanel["reportedState"],
  observationRef: SafeReference | null,
  readinessRef: SafeReference | null,
  observedAt: string | null,
  reasonCodes: readonly ScheduleBlockReason[],
): MorningBriefSchedulePanel {
  return deepFreeze({
    status,
    definition: MORNING_BRIEF_SCHEDULE_DEFINITION,
    reportedState,
    observationRef,
    readinessRef,
    observedAt,
    reasonCodes,
    changeableFromThisSurface: false,
  });
}

function projectHandoff(input: NormalizedInput): MorningBriefHandoffPanel {
  const preview = input.handoffReadiness;
  if (preview === null) {
    return handoffPanel("blocked", null, null, null, null, null, ["handoff_preview_absent"]);
  }
  const reasonCodes: HandoffBlockReason[] = [];
  const age = Date.parse(input.asOf) - Date.parse(preview.evaluatedAt);
  if (age < 0) reasonCodes.push("handoff_snapshot_in_future");
  else if (age > MORNING_BRIEF_MAX_OBSERVATION_AGE_MS) {
    reasonCodes.push("handoff_snapshot_stale");
  }
  if (preview.dependencies.configurationDigest !== input.scope.activeConfigurationDigest) {
    reasonCodes.push("handoff_configuration_drift");
  }
  // Unique Prospects can never exceed the rows they contribute, nor the
  // Export-ready population they are drawn from, and rows require a Prospect.
  if (preview.uniqueEligibleProspectCount > preview.eligibleContactRowCount
    || preview.uniqueEligibleProspectCount > preview.exportReadyProspectCount
    || (preview.eligibleContactRowCount > 0 && preview.uniqueEligibleProspectCount === 0)) {
    reasonCodes.push("handoff_counts_inconsistent");
  }
  if (reasonCodes.length > 0) {
    return handoffPanel(
      "blocked", preview.snapshotRef, preview.evaluatedAt, null, null, null,
      sortText(reasonCodes),
    );
  }
  return handoffPanel(
    "current", preview.snapshotRef, preview.evaluatedAt,
    {
      exportReadyProspectCount: preview.exportReadyProspectCount,
      uniqueEligibleProspectCount: preview.uniqueEligibleProspectCount,
      eligibleContactRowCount: preview.eligibleContactRowCount,
      nonContactableReferenceCount: preview.nonContactableReferenceCount,
    },
    preview.exclusions,
    preview.dependencies,
    [],
  );
}

function handoffPanel(
  status: MorningBriefHandoffPanel["status"],
  snapshotRef: SafeReference | null,
  evaluatedAt: string | null,
  counts: MorningBriefHandoffPanel["counts"],
  exclusions: MorningBriefHandoffPanel["exclusions"],
  dependencies: MorningBriefHandoffPanel["dependencies"],
  reasonCodes: readonly HandoffBlockReason[],
): MorningBriefHandoffPanel {
  return deepFreeze({
    status,
    snapshotRef,
    evaluatedAt,
    counts,
    exclusions,
    dependencies,
    reasonCodes,
    materializableFromThisSurface: false,
  });
}

function unavailable(
  reason: MorningBriefUnavailableReason,
  weeklyReasonCodes: readonly WeeklyOutcomeUnavailableReason[] = [],
): MorningBriefUnavailable {
  return deepFreeze({
    status: "unavailable",
    generatedAt: null,
    reasonCodes: [reason],
    weeklyReasonCodes,
    scope: null,
    weekly: null,
    losses: null,
    schedule: null,
    handoff: null,
    workspace: null,
    greenfield: null,
    authority: MORNING_BRIEF_AUTHORITY,
    effects: MORNING_BRIEF_EFFECTS,
  });
}

function exactRecord(value: unknown, keys: readonly string[]): Record<string, unknown> {
  const descriptors = ownDescriptors(value);
  const actual = Object.keys(descriptors);
  if (actual.length !== keys.length || !sameMembers(actual, keys)) malformed();
  const result: Record<string, unknown> = {};
  for (const key of keys) result[key] = readValue(descriptors, key);
  return result;
}

function exactRecordAtLeast(
  value: unknown,
  keys: readonly string[],
): Record<string, unknown> {
  const descriptors = ownDescriptors(value);
  const result: Record<string, unknown> = {};
  for (const key of keys) result[key] = readValue(descriptors, key);
  return result;
}

function ownDescriptors(value: unknown) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) malformed();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).some((key) => typeof key !== "string")) malformed();
  return descriptors;
}

function readValue(
  descriptors: Record<string, PropertyDescriptor>,
  key: string,
): unknown {
  const descriptor = descriptors[key];
  if (!descriptor?.enumerable || !("value" in descriptor)) malformed();
  return descriptor.value;
}

function denseArray(value: unknown, maximumLength: number): unknown[] {
  if (!Array.isArray(value) || value.length > maximumLength) malformed();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).some((key) => typeof key !== "string")) malformed();
  const expected = Array.from({ length: value.length }, (_, index) => String(index));
  const actual = Object.keys(descriptors).filter((key) => key !== "length");
  if (!sameMembers(expected, actual)) malformed();
  return expected.map((key) => readValue(descriptors, key));
}

function normalizeReference(value: unknown): SafeReference {
  const input = exactRecord(value, ["id", "digest"]);
  return deepFreeze({ id: stableId(input.id), digest: digest(input.digest) });
}

function stableId(value: unknown) {
  if (typeof value !== "string" || !ID.test(value)) malformed();
  if (RAW_IDENTITY.test(value)) rawIdentity();
  return value;
}

function label(value: unknown) {
  if (typeof value !== "string" || !LABEL.test(value)) malformed();
  if (RAW_IDENTITY.test(value)) rawIdentity();
  return value;
}

function boundedTag(value: unknown) {
  if (typeof value !== "string" || value.length === 0 || value.length > 64
    || !/^[A-Za-z0-9_:/+-]+$/u.test(value)) malformed();
  if (RAW_IDENTITY.test(value)) rawIdentity();
  return value;
}

function digest(value: unknown) {
  if (typeof value !== "string" || !DIGEST.test(value)) malformed();
  return value;
}

function instant(value: unknown) {
  if (typeof value !== "string" || !ISO_INSTANT.test(value)) malformed();
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) malformed();
  return value;
}

function boundedCount(value: unknown) {
  if (!Number.isSafeInteger(value) || (value as number) < 0
    || (value as number) > MORNING_BRIEF_MAX_COUNT) malformed();
  return value as number;
}

function unique(values: readonly string[]) {
  if (new Set(values).size !== values.length) malformed();
}

function sameMembers(left: readonly string[], right: readonly string[]) {
  const sortedRight = [...right].sort(compareText);
  return left.length === right.length
    && [...left].sort(compareText).every((value, index) => value === sortedRight[index]);
}

function sortText<T extends string>(values: readonly T[]): readonly T[] {
  return [...values].sort(compareText);
}

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

function rawIdentity(): never {
  throw new BriefUnavailable("morning_brief_raw_identity_value_present");
}

function malformed(): never {
  throw new BriefUnavailable("morning_brief_input_malformed");
}
