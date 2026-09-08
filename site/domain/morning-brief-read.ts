/**
 * Persisted-read source for the owner Morning Brief.
 *
 * Boundary. Every statement in this module is a `SELECT`. It opens no
 * transaction, issues no `INSERT`, `UPDATE`, `DELETE`, or DDL, allocates no
 * migration, and touches no schema. It composes no provider, route, worker,
 * scheduler, runner, export, delivery, archive, or restore seam, and it is
 * imported by no runtime surface.
 *
 * Honesty rules this module exists to enforce:
 *
 * - The weekly cohort counts each Prospect's first transition to
 *   `ExportReady`. No such state exists in `db/schema.ts`, and no prospect
 *   state-transition history is persisted anywhere, so this module never
 *   supplies a weekly history. It reports the section unavailable instead of
 *   fabricating events or reporting a zero cohort.
 * - `prospect_review_decisions` is a Phase 4 qualification record, not an
 *   outcome ledger. Its counts are surfaced as their own funnel section and
 *   are never converted into, compared with, or substituted for Export-ready
 *   outcomes.
 * - Handoff eligibility requires Phase 5 verification and Phase 6 package and
 *   suppression authority, none of which is composed. That section is
 *   reported unavailable rather than approximated.
 * - Workspace origin (original versus restored) is not persisted. That
 *   section is reported unavailable with the restored-effects fence closed.
 */

import {
  composeMorningBrief,
  type MorningBriefProfileLifecycle,
  type MorningBriefResult,
  type MorningBriefScope,
  type ReviewFunnelObservation,
  type SafeReference,
  type UpstreamScheduleObservation,
} from "./morning-brief";

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
  | "workspace_absent"
  | "commercial_hierarchy_incomplete"
  | "active_profile_configuration_absent"
  | "scope_row_malformed";

export type MorningBriefReadResult =
  | Readonly<{ status: "available"; brief: MorningBriefResult }>
  | Readonly<{
    status: "unavailable";
    reasonCodes: readonly MorningBriefScopeUnavailableReason[];
    brief: null;
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

type ScheduleRow = {
  schedule_id: string; operation_digest: string; profile_id: string;
  configuration_digest: string; timezone: string; intended_local_time: string;
  cadence: string; execution_state: string; active: number;
  authority_command_id: string; command_operation_digest: string;
  updated_at: number;
};

type ProfileRow = { profile_id: string; profile_name: string };

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

  const scopeRow = await readScopeRow(database, principal);
  if (scopeRow === null) return scopeUnavailable("workspace_absent");
  const scope = toScope(scopeRow);
  if (scope === null) return scopeUnavailable("scope_row_malformed");

  const schedule = await readScheduleObservation(database, scope.workspaceId, scope.profileId);
  const reviewFunnel = await readReviewFunnel(
    database, scope.workspaceId, scope.profileId, windowStart, windowEnd,
  );
  const greenfieldProfiles = await readOtherProfiles(
    database, scope.workspaceId, scopeRow.market_play_id, scope.profileId,
  );

  return Object.freeze({
    status: "available" as const,
    brief: composeMorningBrief({
      scope,
      asOf,
      // No persisted Export-ready transition history exists. Supplying null
      // makes the weekly section unavailable; it never becomes a zero cohort.
      weeklyHistory: null,
      scheduleObservation: schedule,
      // Phase 5 verification and Phase 6 package/suppression authority are not
      // composed, so no eligibility snapshot can be read.
      handoffReadiness: null,
      reviewFunnel,
      // Workspace origin is not persisted in the checked schema.
      workspaceOrigin: null,
      greenfieldProfiles,
    }),
  });
}

async function readScopeRow(
  database: D1Database,
  principal: MorningBriefPrincipal,
): Promise<ScopeRow | null> {
  const legacy = principal.legacySubject ?? principal.subject;
  return database.prepare(
    `SELECT w.id AS workspace_id, c.id AS company_id, pr.id AS product_id,
            mp.id AS market_play_id, cp.id AS profile_id, cp.name AS profile_name,
            cp.lifecycle AS profile_lifecycle, tc.digest AS configuration_digest
       FROM workspaces w
       JOIN workspace_companies wc ON wc.workspace_id = w.id
       JOIN companies c ON c.id = wc.company_id AND c.workspace_id = w.id
       JOIN products pr ON pr.company_id = c.id AND pr.workspace_id = w.id
       JOIN market_plays mp ON mp.product_id = pr.id AND mp.workspace_id = w.id
       JOIN customer_profiles cp ON cp.play_id = mp.id AND cp.workspace_id = w.id
       JOIN typed_configurations tc
         ON tc.workspace_id = w.id AND tc.owner_type = 'profile'
        AND tc.owner_id = cp.id AND tc.kind = 'profile_effective' AND tc.active = 1
      WHERE w.owner_subject IN (?, ?)
      ORDER BY CASE w.owner_subject WHEN ? THEN 0 ELSE 1 END, cp.created_at, cp.id
      LIMIT 1`,
  ).bind(principal.subject, legacy, principal.subject).first<ScopeRow>();
}

function toScope(row: ScopeRow): MorningBriefScope | null {
  if (!LIFECYCLES.includes(row.profile_lifecycle as MorningBriefProfileLifecycle)) return null;
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
 * Project the Phase 4-owned recurring schedule as a read-only observation.
 * A missing, archived, or shape-invalid row yields `null`, which the brief
 * reports as an unknown schedule rather than an enabled or disabled one.
 */
async function readScheduleObservation(
  database: D1Database,
  workspaceId: string,
  profileId: string,
): Promise<UpstreamScheduleObservation | null> {
  const row = await database.prepare(
    `SELECT ps.id AS schedule_id, ps.operation_digest AS operation_digest,
            ps.profile_id AS profile_id, ps.configuration_digest AS configuration_digest,
            ps.timezone AS timezone, ps.intended_local_time AS intended_local_time,
            ps.cadence AS cadence, ps.execution_state AS execution_state,
            ps.active AS active, ps.authority_command_id AS authority_command_id,
            ac.operation_digest AS command_operation_digest, ps.updated_at AS updated_at
       FROM prospecting_schedules ps
       JOIN authority_commands ac ON ac.id = ps.authority_command_id
      WHERE ps.workspace_id = ? AND ps.profile_id = ? AND ps.active = 1
      LIMIT 1`,
  ).bind(workspaceId, profileId).first<ScheduleRow>();
  if (!row) return null;
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

/** Sibling profiles under the same Market Play, reported as non-contributing. */
async function readOtherProfiles(
  database: D1Database,
  workspaceId: string,
  marketPlayId: string,
  profileId: string,
) {
  const rows = await database.prepare(
    `SELECT cp.id AS profile_id, cp.name AS profile_name
       FROM customer_profiles cp
      WHERE cp.workspace_id = ? AND cp.play_id = ? AND cp.id <> ?
      ORDER BY cp.created_at, cp.id
      LIMIT 64`,
  ).bind(workspaceId, marketPlayId, profileId).all<ProfileRow>();
  return ((rows.results ?? []) as ProfileRow[]).map((row) => Object.freeze({
    profileId: row.profile_id,
    label: row.profile_name,
  }));
}

function scopeUnavailable(
  reason: MorningBriefScopeUnavailableReason,
): MorningBriefReadResult {
  return Object.freeze({ status: "unavailable" as const, reasonCodes: [reason], brief: null });
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
