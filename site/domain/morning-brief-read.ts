/**
 * Persisted-read source for the owner Morning Brief.
 *
 * Boundary. Every statement in this module is a `SELECT`. It opens no
 * transaction, issues no `INSERT`, `UPDATE`, `DELETE`, or DDL, allocates no
 * migration, and touches no schema. It composes no provider, route, worker,
 * scheduler, runner, export, delivery, archive, or restore seam. The owner GET
 * route composes it only as a read adapter.
 *
 * Honesty rules this module exists to enforce:
 *
 * - The weekly cohort counts each Prospect's first transition to
 *   `ExportReady`, read from the immutable 0022 `prospect_transition_events`
 *   ledger through the admitted, read-only handoff recovery reader. The
 *   history covers every Prospect of the Profile from its origin through the
 *   evaluation instant; a Prospect without a persisted stream makes the whole
 *   section unavailable rather than a smaller cohort. Contact linkage and loss
 *   facts are not persisted, so they are declared evidence gaps and reported
 *   unknown, never zero.
 * - `prospect_review_decisions` is a Phase 4 qualification record, not an
 *   outcome ledger. Its counts are surfaced as their own funnel section and
 *   are never converted into, compared with, or substituted for Export-ready
 *   outcomes.
 * - Handoff eligibility requires Phase 5 verification and Phase 6 package and
 *   suppression authority, none of which is composed. That section is
 *   reported unavailable rather than approximated.
 * - Workspace origin comes from the 0023 `recovery_restore_locks` and
 *   `recovery_restore_results` ledgers. A lock open at the evaluation instant
 *   reports a restore in progress with the effects fence closed, never an
 *   original workspace. An applied restore keeps the schedule reported
 *   disabled until a Phase 4 profile activation strictly after that restore
 *   exists. This module only reports that state; it never requests, records,
 *   or releases it.
 * - The owner workspace is selected before its active hierarchy is read. Every
 *   Company/Product/Play/Profile join repeats the workspace boundary, and only
 *   active hierarchy rows with one valid active Profile configuration can
 *   contribute. Malformed and duplicate rows are omitted, never repaired.
 */

import {
  createD1HandoffRecoveryReader,
  type OpenRestoreLock,
  type ProfileTransitionHistory,
  type RestoreOrigin,
} from "./handoff-recovery-repository";
import {
  composeMorningBrief,
  type MorningBriefAvailable,
  type MorningBriefProfileLifecycle,
  type MorningBriefScope,
  type MorningBriefWeeklyEvidenceGap,
  type ReviewFunnelObservation,
  type SafeReference,
  type UpstreamScheduleAbsence,
  type UpstreamScheduleObservation,
  type WorkspaceOrigin,
} from "./morning-brief";
import { WEEKLY_OUTCOME_TIME_ZONE } from "./weekly-outcome";

/** Read-only owner identity. This module never derives authority from it. */
export type MorningBriefPrincipal = Readonly<{
  subject: string;
  legacySubject?: string;
}>;

export type MorningBriefReadOptions = Readonly<{
  asOf: string;
  reviewWindowStart: string;
  reviewWindowEndExclusive: string;
}>;

export type MorningBriefScopeUnavailableReason =
  | "workspace_absent";

export type MorningBriefReadResult =
  | Readonly<{
    status: "available";
    workspaceId: string;
    generatedAt: string;
    reviewWindow: Readonly<{ start: string; endExclusive: string }>;
    profiles: readonly MorningBriefAvailable[];
  }>
  | Readonly<{
    status: "unavailable";
    reasonCodes: readonly MorningBriefScopeUnavailableReason[];
    workspaceId: null;
    generatedAt: null;
    reviewWindow: null;
    profiles: readonly [];
  }>;

const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const DIGEST = /^[a-f0-9]{64}$/u;
const LIFECYCLES: readonly MorningBriefProfileLifecycle[] = [
  "draft", "ready", "paused", "archived",
];
const SCHEDULE_CADENCE = "weekdays";
const SCHEDULE_UPSTREAM_AUTHORITY = "phase4_profile_readiness";

type ScopeRow = {
  workspace_id: string; company_id: string; product_id: string;
  market_play_id: string; profile_id: string; profile_name: string;
  profile_lifecycle: string; configuration_digest: string;
};

type WorkspaceRow = { workspace_id: string; owner_subject: string };

/** Weekly evidence kinds the persisted schema does not record yet. */
const PERSISTED_WEEKLY_EVIDENCE_GAPS: readonly MorningBriefWeeklyEvidenceGap[] = Object.freeze([
  "contact_links_not_persisted", "loss_events_not_persisted",
]);

type ScheduleRow = {
  schedule_id: string; operation_digest: string; profile_id: string;
  configuration_digest: string; timezone: string; intended_local_time: string;
  cadence: string; execution_state: string; active: number;
  authority_command_id: string; command_operation_digest: string;
  updated_at: number;
};

/**
 * Read the current owner Morning Brief from persisted state.
 *
 * Returns `unavailable` only when the scope itself cannot be established.
 * Every other gap is reported as an unavailable section inside an otherwise
 * usable brief.
 */
export async function readMorningBrief(
  database: D1Database,
  principal: MorningBriefPrincipal,
  options: MorningBriefReadOptions,
): Promise<MorningBriefReadResult> {
  const asOf = instant(options.asOf, "asOf");
  const windowStart = instant(options.reviewWindowStart, "reviewWindowStart");
  const windowEnd = instant(options.reviewWindowEndExclusive, "reviewWindowEndExclusive");
  if (Date.parse(windowEnd) <= Date.parse(windowStart)) {
    throw new TypeError("reviewWindowEndExclusive must follow reviewWindowStart");
  }

  const workspace = await readWorkspaceRow(database, principal);
  if (workspace === null || !stableId(workspace.workspace_id)) {
    return scopeUnavailable("workspace_absent");
  }

  const rows = await readScopeRows(database, principal, workspace.workspace_id);
  const seenProfiles = new Set<string>();
  const scopes: MorningBriefScope[] = [];
  for (const row of rows) {
    if (row.workspace_id !== workspace.workspace_id) continue;
    const scope = toScope(row);
    if (scope === null || seenProfiles.has(scope.profileId)) continue;
    seenProfiles.add(scope.profileId);
    scopes.push(scope);
  }
  scopes.sort((left, right) => hierarchyKey(left).localeCompare(hierarchyKey(right), "en"));

  const throughAt = Date.parse(asOf);
  const reader = createD1HandoffRecoveryReader(database, {
    workspaceId: workspace.workspace_id,
    ownerSubject: workspace.owner_subject,
  });
  const restore = await reader.readRestoreOrigin({ throughAt });
  const openLock = await reader.readOpenRestoreLock({ throughAt });

  const projected = await Promise.all(scopes.map(async (scope) => {
    const [scheduleObservation, reviewFunnel, history, activation] = await Promise.all([
      readScheduleObservation(database, scope.workspaceId, scope.profileId),
      readReviewFunnel(database, scope.workspaceId, scope.profileId, windowStart, windowEnd),
      reader.readProfileTransitionHistory({ profileId: scope.profileId, throughAt }),
      restore !== null && restore.completedAt < throughAt
        ? reader.readLatestProfileActivation({
          profileId: scope.profileId, afterAt: restore.completedAt, throughAt,
        })
        : Promise.resolve(null),
    ]);
    return composeMorningBrief({
      scope,
      asOf,
      weeklyHistory: weeklyHistoryInput(scope, asOf, history),
      scheduleObservation,
      handoffReadiness: null,
      reviewFunnel,
      workspaceOrigin: workspaceOrigin(openLock, restore, activation),
      greenfieldProfiles: [],
      weeklyEvidenceGaps: PERSISTED_WEEKLY_EVIDENCE_GAPS,
    });
  }));
  const profiles = projected.filter(
    (brief): brief is MorningBriefAvailable => brief.status === "available",
  );

  return Object.freeze({
    status: "available" as const,
    workspaceId: workspace.workspace_id,
    generatedAt: asOf,
    reviewWindow: Object.freeze({ start: windowStart, endExclusive: windowEnd }),
    profiles: Object.freeze(profiles),
  });
}

async function readWorkspaceRow(
  database: D1Database,
  principal: MorningBriefPrincipal,
): Promise<WorkspaceRow | null> {
  const legacy = principal.legacySubject ?? principal.subject;
  return database.prepare(
    `SELECT w.id AS workspace_id, w.owner_subject AS owner_subject
       FROM workspaces w
      WHERE w.owner_subject IN (?, ?)
      ORDER BY CASE w.owner_subject WHEN ? THEN 0 ELSE 1 END, w.created_at, w.id
      LIMIT 1`,
  ).bind(principal.subject, legacy, principal.subject).first<WorkspaceRow>();
}

async function readScopeRows(
  database: D1Database,
  principal: MorningBriefPrincipal,
  workspaceId: string,
): Promise<ScopeRow[]> {
  const legacy = principal.legacySubject ?? principal.subject;
  const result = await database.prepare(
    `SELECT w.id AS workspace_id, c.id AS company_id, pr.id AS product_id,
            mp.id AS market_play_id, cp.id AS profile_id, cp.name AS profile_name,
            cp.lifecycle AS profile_lifecycle, tc.digest AS configuration_digest
       FROM workspaces w
       JOIN workspace_companies wc ON wc.workspace_id = w.id
       JOIN companies c
         ON c.id = wc.company_id AND c.workspace_id = w.id AND c.status = 'active'
       JOIN products pr
         ON pr.company_id = c.id AND pr.workspace_id = w.id AND pr.lifecycle = 'ready'
       JOIN market_plays mp
         ON mp.product_id = pr.id AND mp.workspace_id = w.id AND mp.lifecycle = 'active'
       JOIN customer_profiles cp
         ON cp.play_id = mp.id AND cp.workspace_id = w.id AND cp.lifecycle = 'ready'
       JOIN typed_configurations tc
         ON tc.workspace_id = w.id AND tc.owner_type = 'profile'
        AND tc.owner_id = cp.id AND tc.kind = 'profile_effective' AND tc.active = 1
      WHERE w.id = ? AND w.owner_subject IN (?, ?)
      ORDER BY c.id, pr.id, mp.id, cp.id, tc.id`,
  ).bind(workspaceId, principal.subject, legacy).all<ScopeRow>();
  return (result.results ?? []) as ScopeRow[];
}

function toScope(row: ScopeRow): MorningBriefScope | null {
  if (![row.workspace_id, row.company_id, row.product_id, row.market_play_id, row.profile_id]
    .every(stableId)) return null;
  if (row.profile_lifecycle !== "ready"
    || !LIFECYCLES.includes(row.profile_lifecycle as MorningBriefProfileLifecycle)) return null;
  if (typeof row.configuration_digest !== "string"
    || !DIGEST.test(row.configuration_digest)) return null;
  return Object.freeze({
    workspaceId: row.workspace_id,
    companyId: row.company_id,
    productId: row.product_id,
    marketPlayId: row.market_play_id,
    profileId: row.profile_id,
    profileName: row.profile_name,
    profileLifecycle: row.profile_lifecycle as MorningBriefProfileLifecycle,
    activeConfigurationDigest: row.configuration_digest,
  });
}

/**
 * Shape the persisted transition ledger as the reducer's origin-to-asOf input.
 * Rows are copied verbatim; the reducer, not this adapter, validates origin,
 * sequence, chronology, state continuity, and bounds. Returns `null` (absent
 * history) when any in-scope Prospect has no persisted stream, so a partial
 * ledger is never reported as a smaller cohort.
 */
function weeklyHistoryInput(
  scope: MorningBriefScope,
  asOf: string,
  history: ProfileTransitionHistory,
) {
  const streams = new Map<string, ProfileTransitionHistory["events"][number][]>();
  for (const event of history.events) {
    const stream = streams.get(event.prospectId) ?? [];
    stream.push(event);
    streams.set(event.prospectId, stream);
  }
  if (!history.prospectLimitExceeded
    && history.prospectIds.some((prospectId) => !streams.has(prospectId))) return null;
  return {
    scope: {
      workspaceId: scope.workspaceId,
      companyId: scope.companyId,
      productId: scope.productId,
      marketPlayId: scope.marketPlayId,
      profileId: scope.profileId,
      // Only `ready` Profiles reach this read; the persisted lifecycle, never
      // the Profile's name, decides whether it contributes.
      profileLifecycle: scope.profileLifecycle === "ready" ? "Operating" : "Draft",
    },
    timeZone: WEEKLY_OUTCOME_TIME_ZONE,
    asOf,
    coverage: { from: "prospect_origin", through: asOf, prospectIds: [...history.prospectIds] },
    histories: history.prospectIds.map((prospectId) => ({
      prospectId,
      workspaceId: scope.workspaceId,
      companyId: scope.companyId,
      productId: scope.productId,
      marketPlayId: scope.marketPlayId,
      profileId: scope.profileId,
      events: (streams.get(prospectId) ?? []).map((event) => {
        const base = {
          eventId: event.eventId,
          sequence: event.sequence,
          occurredAt: instantOrInvalid(event.occurredAt),
          // The immutable transition row is its own audit record.
          auditRef: { id: event.eventId, digest: event.operationDigest },
        };
        return event.eventKind === "prospect_created"
          ? { ...base, kind: event.eventKind, initialState: event.newState }
          : { ...base, kind: event.eventKind, fromState: event.priorState, toState: event.newState };
      }),
    })),
  };
}

function workspaceOrigin(
  openLock: OpenRestoreLock | null,
  restore: RestoreOrigin | null,
  activation: Readonly<{ activationId: string; operationDigest: string; createdAt: number }> | null,
): WorkspaceOrigin {
  // An open lock means target data may be half-imported. It outranks any
  // applied result, so contradictory evidence keeps the fence closed.
  if (openLock !== null) {
    return { kind: "restore_in_progress", lockedAt: instantOrInvalid(openLock.acquiredAt) };
  }
  if (restore === null) return { kind: "original" };
  return {
    kind: "restored",
    restoreRef: { id: restore.restoreResultId, digest: restore.resultDigest },
    restoredAt: instantOrInvalid(restore.completedAt),
    freshUpstreamActivation: activation === null ? null : {
      activationRef: { id: activation.activationId, digest: activation.operationDigest },
      activatedAt: instantOrInvalid(activation.createdAt),
    },
  };
}

/** A non-representable stored instant becomes a value every validator refuses. */
function instantOrInvalid(value: number) {
  return Number.isSafeInteger(value) && value >= 0 ? new Date(value).toISOString() : "invalid";
}

/**
 * Project the Phase 4-owned recurring schedule as a read-only observation.
 * A shape-invalid or cross-workspace active row yields `null`, which the brief
 * reports as an unknown schedule rather than an enabled or disabled one. Only
 * when the table holds no active row at all for the Profile does the read
 * return positive absence evidence; the brief may then report a restored
 * target disabled, and otherwise reports it unknown as well.
 *
 * The authority-command join carries its own workspace predicate. The schema's
 * foreign key references `authority_commands(id)` alone and no trigger fences
 * that column to the row's workspace, so joining on id alone would let a
 * malformed cross-workspace reference surface another workspace's operation
 * digest. Such a row matches nothing and is withheld rather than reported.
 */
async function readScheduleObservation(
  database: D1Database,
  workspaceId: string,
  profileId: string,
): Promise<UpstreamScheduleObservation | UpstreamScheduleAbsence | null> {
  const row = await database.prepare(
    `SELECT ps.id AS schedule_id, ps.operation_digest AS operation_digest,
            ps.profile_id AS profile_id, ps.configuration_digest AS configuration_digest,
            ps.timezone AS timezone, ps.intended_local_time AS intended_local_time,
            ps.cadence AS cadence, ps.execution_state AS execution_state,
            ps.active AS active, ps.authority_command_id AS authority_command_id,
            ac.operation_digest AS command_operation_digest, ps.updated_at AS updated_at
       FROM prospecting_schedules ps
       JOIN authority_commands ac
         ON ac.id = ps.authority_command_id AND ac.workspace_id = ps.workspace_id
      WHERE ps.workspace_id = ? AND ps.profile_id = ? AND ps.active = 1
      LIMIT 1`,
  ).bind(workspaceId, profileId).first<ScheduleRow>();
  if (!row) return readScheduleAbsence(database, workspaceId, profileId);
  if (!DIGEST.test(row.operation_digest) || !DIGEST.test(row.configuration_digest)
    || !DIGEST.test(row.command_operation_digest)) return null;
  if (!Number.isSafeInteger(row.updated_at) || row.updated_at < 0) return null;
  const observedAt = new Date(row.updated_at).toISOString();
  if (!ISO_INSTANT.test(observedAt)) return null;
  return Object.freeze({
    observationRef: { id: row.schedule_id, digest: row.operation_digest },
    profileId: row.profile_id,
    configurationDigest: row.configuration_digest,
    cadence: row.cadence,
    localTime: row.intended_local_time,
    timeZone: row.timezone,
    upstreamAuthority: SCHEDULE_UPSTREAM_AUTHORITY,
    readinessRef: {
      id: row.authority_command_id, digest: row.command_operation_digest,
    } satisfies SafeReference,
    // `active` gates existence; `execution_state` alone decides enablement, so
    // a paused or capability-blocked schedule is never reported enabled.
    state: row.execution_state === "active" ? "enabled" : "disabled",
    observedAt,
  });
}

/**
 * Positive evidence that no active schedule row exists for the Profile. Any
 * active row, even one the observation read rejected, withholds it.
 */
async function readScheduleAbsence(
  database: D1Database,
  workspaceId: string,
  profileId: string,
): Promise<UpstreamScheduleAbsence | null> {
  const row = await database.prepare(
    `SELECT COUNT(*) AS active_count FROM prospecting_schedules
      WHERE workspace_id = ? AND profile_id = ? AND active = 1`,
  ).bind(workspaceId, profileId).first<{ active_count: number }>();
  if (!row || Number(row.active_count) !== 0) return null;
  return Object.freeze({ kind: "no_active_schedule_row" as const, profileId });
}

/**
 * Count immutable Phase 4 review evidence inside the supplied window.
 *
 * `prospect_review_decisions`, `prospect_cooldowns`, and
 * `prospect_reentry_events` carry database immutability triggers, so these are
 * append-only facts. They describe qualification review, never Export-ready
 * outcomes, and the brief labels them accordingly.
 */
async function readReviewFunnel(
  database: D1Database,
  workspaceId: string,
  profileId: string,
  windowStart: string,
  windowEndExclusive: string,
): Promise<ReviewFunnelObservation | null> {
  const start = Date.parse(windowStart);
  const end = Date.parse(windowEndExclusive);

  const decisionRows = await database.prepare(
    `SELECT prd.decision AS decision, COUNT(*) AS decision_count,
            COUNT(DISTINCT prd.prospect_id) AS prospect_count
       FROM prospect_review_decisions prd
       JOIN profile_prospects pp
         ON pp.id = prd.prospect_id AND pp.workspace_id = prd.workspace_id
      WHERE prd.workspace_id = ? AND pp.profile_id = ?
        AND prd.created_at >= ? AND prd.created_at < ?
      GROUP BY prd.decision`,
  ).bind(workspaceId, profileId, start, end)
    .all<{ decision: string; decision_count: number; prospect_count: number }>();

  const distinctRow = await database.prepare(
    `SELECT COUNT(DISTINCT prd.prospect_id) AS prospect_count
       FROM prospect_review_decisions prd
       JOIN profile_prospects pp
         ON pp.id = prd.prospect_id AND pp.workspace_id = prd.workspace_id
      WHERE prd.workspace_id = ? AND pp.profile_id = ?
        AND prd.created_at >= ? AND prd.created_at < ?`,
  ).bind(workspaceId, profileId, start, end).first<{ prospect_count: number }>();

  const cooldownRow = await database.prepare(
    `SELECT COUNT(*) AS cooldown_count
       FROM prospect_cooldowns pc
       JOIN profile_prospects pp
         ON pp.id = pc.prospect_id AND pp.workspace_id = pc.workspace_id
      WHERE pc.workspace_id = ? AND pp.profile_id = ?
        AND pc.created_at >= ? AND pc.created_at < ?`,
  ).bind(workspaceId, profileId, start, end).first<{ cooldown_count: number }>();

  const reentryRows = await database.prepare(
    `SELECT pre.event_kind AS event_kind, COUNT(*) AS event_count
       FROM prospect_reentry_events pre
       JOIN profile_prospects pp
         ON pp.id = pre.prospect_id AND pp.workspace_id = pre.workspace_id
      WHERE pre.workspace_id = ? AND pp.profile_id = ?
        AND pre.created_at >= ? AND pre.created_at < ?
      GROUP BY pre.event_kind`,
  ).bind(workspaceId, profileId, start, end)
    .all<{ event_kind: string; event_count: number }>();

  const decisions: Record<"approve" | "reject" | "defer", number> = {
    approve: 0, reject: 0, defer: 0,
  };
  for (const row of (decisionRows.results ?? []) as { decision: string; decision_count: number }[]) {
    if (row.decision === "approve" || row.decision === "reject" || row.decision === "defer") {
      decisions[row.decision] = count(row.decision_count);
    }
  }
  const reentryEvents: Record<"review_due" | "material_signal" | "hard_gate_disproved", number> = {
    review_due: 0, material_signal: 0, hard_gate_disproved: 0,
  };
  for (const row of (reentryRows.results ?? []) as { event_kind: string; event_count: number }[]) {
    if (row.event_kind === "review_due" || row.event_kind === "material_signal"
      || row.event_kind === "hard_gate_disproved") {
      reentryEvents[row.event_kind] = count(row.event_count);
    }
  }
  return Object.freeze({
    windowStart,
    windowEndExclusive,
    decisions: Object.freeze(decisions),
    distinctReviewedProspectCount: count(distinctRow?.prospect_count ?? 0),
    cooldownsStarted: count(cooldownRow?.cooldown_count ?? 0),
    reentryEvents: Object.freeze(reentryEvents),
  });
}

function scopeUnavailable(
  reason: MorningBriefScopeUnavailableReason,
): MorningBriefReadResult {
  return Object.freeze({
    status: "unavailable" as const,
    reasonCodes: [reason],
    workspaceId: null,
    generatedAt: null,
    reviewWindow: null,
    profiles: [] as const,
  });
}

const STABLE_ID = /^[A-Za-z0-9](?:[A-Za-z0-9._:-]{0,126}[A-Za-z0-9])?$/u;
function stableId(value: unknown): value is string {
  return typeof value === "string" && STABLE_ID.test(value);
}

function hierarchyKey(scope: MorningBriefScope) {
  return [scope.companyId, scope.productId, scope.marketPlayId, scope.profileId].join("\u0000");
}

function count(value: unknown) {
  return Number.isSafeInteger(value) && (value as number) >= 0 ? value as number : 0;
}

function instant(value: unknown, field: string) {
  if (typeof value !== "string" || !ISO_INSTANT.test(value)) {
    throw new TypeError(`${field} must be an exact ISO instant`);
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) {
    throw new TypeError(`${field} must be an exact ISO instant`);
  }
  return value;
}

export const MORNING_BRIEF_READ_CADENCE = SCHEDULE_CADENCE;
