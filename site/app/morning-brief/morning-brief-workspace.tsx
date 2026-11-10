"use client";

import { useEffect, useState } from "react";
import type { MorningBriefAvailable } from "../../domain/morning-brief";

/**
 * Read-only Morning Brief (07-09, local). It renders the server-projected
 * weekly outcome, the upstream Phase 4 schedule state, funnel losses, and
 * handoff readiness as escaped text. It has no control of any kind: the
 * schedule is display-only, Phase 4 owns any future activation, and CSV
 * handoff and recovery requests live in Exports & History.
 */

type BriefState = Readonly<{
  ok: true;
  status: "available";
  workspaceId: string;
  generatedAt: string;
  reviewWindow: Readonly<{ start: string; endExclusive: string }>;
  profiles: readonly MorningBriefAvailable[];
}>;

const PILOT_NOTICE = "Controlled pilot — all displayed records are illustrative or synthetic until the required Phase 3–6 authority and Phase 7 release gates are accepted. This Phase 7 surface cannot change schedules, providers, outreach, or restore effects; restored targets remain disabled.";
const WEEKLY_EXPLANATION = "Counts each stable Prospect once, at its first Export-ready transition this local week. CSV contact rows, re-exports, and later reversals do not increase this target.";
const CONTACT_ROW_DISTINCTION = "One Prospect can contribute more than one row. Contact rows are not the weekly seven-lead metric.";
const SCHEDULE_NOT_CURRENT = "Schedule state is reported from Phase 4 only — weekday 06:00 America/Toronto is not current upstream. This view cannot enable it or start a runner.";
const SCHEDULE_OWNERSHIP = "This view cannot change it or start a runner. Phase 4 owns future activation.";

/** The ten separately labelled funnel-loss categories. None counts toward the weekly target. */
const LOSS_LABELS = Object.freeze({
  rejected: "Rejected",
  deferred: "Deferred",
  enrichment_failed: "Enrichment failed",
  enrichment_uncertain: "Enrichment uncertain",
  review_delayed: "Review delayed",
  contact_stale_or_invalid: "Stale or invalid contact",
  package_invalid: "Package revoked or expired",
  suppressed: "Suppressed",
  high_risk_drift: "High-risk drift",
  reversal: "Reversal to NeedsReview or NonContactable",
} as const);

export function MorningBriefWorkspace({
  onUnauthorized,
}: {
  onUnauthorized: () => void;
}) {
  const [state, setState] = useState<BriefState | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let active = true;
    void fetch("/api/morning-brief", {
      method: "GET",
      headers: { accept: "application/json" },
      cache: "no-store",
    }).then(async (response) => {
      if (!active) return;
      if (response.status === 404) {
        onUnauthorized();
        return;
      }
      if (!response.ok) {
        setUnavailable(true);
        return;
      }
      const body: unknown = await response.json();
      if (!isBriefState(body)) {
        setUnavailable(true);
        return;
      }
      setState(body);
    }).catch(() => {
      if (active) setUnavailable(true);
    });
    return () => { active = false; };
  }, [onUnauthorized]);

  return (
    <section className="morning-brief-workspace" aria-labelledby="morning-brief-title">
      <header className="page-heading">
        <div>
          <span className="eyebrow">READ-ONLY PHASE 4 STATE</span>
          <h1 id="morning-brief-title">Morning Brief</h1>
          <p>All active Company, Product, Market Play, and Profile paths in this owner workspace.</p>
        </div>
      </header>

      <p className="panel brief-pilot-notice" role="note">{PILOT_NOTICE}</p>

      <section className="panel brief-boundary" aria-label="Actions not available in this brief">
        <h2>Local operating view only</h2>
        <p>No run, schedule, or export actions are available from this brief.</p>
        <ul>
          <li><strong>Weekly outcome is read-only.</strong> It counts saved Export-ready transitions. Contact links and loss events are not saved yet, so they show as unknown, never zero.</li>
          <li><strong>Export and handoff are not available here.</strong> CSV CRM Handoff is on the Handoff &amp; Recovery screen.</li>
          <li><strong>Restore is not available here.</strong> Archive, dry run, and restore are on the Handoff &amp; Recovery screen.</li>
        </ul>
      </section>

      {!state && !unavailable && <section className="panel" role="status"><p>Loading current weekly outcome and readiness evidence…</p></section>}
      {unavailable && <section className="panel" role="alert"><h2>Morning Brief unavailable</h2><p>Morning Brief could not load current evidence. Nothing has been scheduled or enabled.</p></section>}
      {state && state.profiles.length === 0 && <section className="panel"><h2>No active profiles</h2><p>No weekly outcome evidence is available. Load current Phase 3–6 authority and immutable transition history before interpreting the seven-lead target.</p></section>}
      {state && state.profiles.length > 0 && (
        <div className="brief-profile-grid">
          {state.profiles.map((brief) => <ProfileBrief key={brief.scope.profileId} brief={brief} />)}
        </div>
      )}
    </section>
  );
}

function offset(minutes: number) {
  if (!Number.isSafeInteger(minutes)) return "UTC";
  const sign = minutes < 0 ? "-" : "+";
  const absolute = Math.abs(minutes);
  return `UTC${sign}${String(Math.floor(absolute / 60)).padStart(2, "0")}:${String(absolute % 60).padStart(2, "0")}`;
}

/** One profile's read-only brief. Every value is server-projected; nothing here derives schedule or readiness. */
export function ProfileBrief({ brief }: { brief: MorningBriefAvailable }) {
  const funnel = brief.funnel?.status === "current" ? brief.funnel : null;
  const weekly = brief.weekly?.status === "current" ? brief.weekly : null;
  const schedule = brief.schedule;
  const definition = schedule?.definition;
  const scheduleCopy = definition ? `${definition.cadence === "weekdays" ? "Weekdays" : definition.cadence} · ${definition.localTime} · ${definition.timeZone}` : "Not projected";
  const scheduleCurrent = schedule?.status === "current" && (schedule.reportedState === "enabled" || schedule.reportedState === "disabled");
  const handoff = brief.handoff?.status === "current" ? brief.handoff : null;
  const losses = brief.losses;
  const restored = brief.workspace?.status === "current" && brief.workspace.origin === "restored";
  const greenfield = brief.greenfield?.profiles ?? [];
  return (
    <article className="panel brief-profile-card">
      <header>
        <div><span className="eyebrow">ACTIVE PROFILE</span><h2>{brief.scope.profileName}</h2></div>
        <span className="task-state-badge">{brief.scope.profileLifecycle}</span>
      </header>
      <p className="brief-scope-path">
        <code>{brief.scope.companyId}</code> → <code>{brief.scope.productId}</code> → <code>{brief.scope.marketPlayId}</code> → <code>{brief.scope.profileId}</code>
      </p>
      <p className="brief-meta">Active configuration digest <code>{brief.scope.activeConfigurationDigest}</code> · Data as of {brief.generatedAt}</p>

      <section className="brief-section" aria-label="Weekly outcome">
        <h3>Weekly outcome</h3>
        <dl>
          <div><dt>Newly Export-ready Prospects this week</dt><dd className="brief-focal">{weekly ? weekly.newlyExportReadyProspectCount : "Unavailable"}</dd></div>
          <div><dt>Weekly target</dt><dd>{brief.weekly?.target ?? 7}</dd></div>
          <div><dt>Remaining to target</dt><dd>{weekly ? weekly.remainingProspectsToTarget : "Unavailable"}</dd></div>
          {weekly ? <div><dt>Week (America/Toronto)</dt><dd>{weekly.week.start.localDate} ({offset(weekly.week.start.utcOffsetMinutes)}) to {weekly.week.endLocalDate} ({offset(weekly.week.endExclusive.utcOffsetMinutes)})</dd></div> : null}
        </dl>
        <p>{WEEKLY_EXPLANATION}</p>
        {!weekly ? <p>No weekly outcome evidence is available. Reason: {(brief.weekly?.status === "unavailable" ? brief.weekly.reasonCodes : []).join(", ") || "not projected"}.</p> : null}
      </section>

      <section className="brief-section" aria-label="Schedule and readiness">
        <h3>Operating schedule visibility</h3>
        <p><strong>{scheduleCopy}</strong></p>
        {scheduleCurrent ? (
          <p>Reported {schedule.reportedState} by Phase 4{schedule.observedAt ? ` at ${schedule.observedAt}` : ""}{schedule.readinessRef ? <> · Readiness reference <code>{schedule.readinessRef.id}</code></> : null}. {SCHEDULE_OWNERSHIP}</p>
        ) : (
          <p role="alert">{SCHEDULE_NOT_CURRENT} Reason: {(schedule?.reasonCodes ?? []).join(", ") || "not projected"}.</p>
        )}
      </section>

      <section className="brief-section" aria-label="Funnel losses">
        <h3>Funnel losses</h3>
        {losses ? (
          <dl>
            {(Object.keys(LOSS_LABELS) as (keyof typeof LOSS_LABELS)[]).map((key) => (
              <div key={key}><dt>{LOSS_LABELS[key]}</dt><dd>{losses[key]?.distinctProspectCount ?? "Unavailable"}</dd></div>
            ))}
          </dl>
        ) : (
          <>
            <p>Loss events are not persisted yet, so each category is reported unknown, never zero.</p>
            <ul className="brief-loss-list">
              {(Object.keys(LOSS_LABELS) as (keyof typeof LOSS_LABELS)[]).map((key) => <li key={key}>{LOSS_LABELS[key]}: unknown</li>)}
            </ul>
          </>
        )}
      </section>

      <section className="brief-section" aria-label="Current handoff readiness">
        <h3>Current handoff readiness</h3>
        <dl>
          <div><dt>Export-ready Prospects</dt><dd>{handoff?.counts ? handoff.counts.exportReadyProspectCount : "Unavailable"}</dd></div>
          <div><dt>Eligible contact rows</dt><dd>{handoff?.counts ? handoff.counts.eligibleContactRowCount : "Unavailable"}</dd></div>
        </dl>
        <p>{CONTACT_ROW_DISTINCTION} Read-only: CSV handoff is requested from the Handoff &amp; Recovery screen.</p>
      </section>

      <section className="brief-section" aria-label="Evidence">
        <h3>Evidence</h3>
        <dl>
          <div><dt>Reviewed this Toronto week</dt><dd>{funnel?.distinctReviewedProspectCount ?? "Unavailable"}</dd></div>
          <div><dt>Approved</dt><dd>{funnel?.decisions.approve ?? "Unavailable"}</dd></div>
          <div><dt>Rejected</dt><dd>{funnel?.decisions.reject ?? "Unavailable"}</dd></div>
          <div><dt>Deferred</dt><dd>{funnel?.decisions.defer ?? "Unavailable"}</dd></div>
        </dl>
        {restored ? <p>Restored workspace: all schedules, runners, outboxes, providers, and delivery remain disabled pending fresh upstream Phase 4 activation.</p> : null}
      </section>

      {greenfield.length > 0 ? (
        <section className="brief-section brief-greenfield" aria-label="Draft and nurture profiles">
          {greenfield.map((note) => <h3 key={note.profileId}>{note.label}; not active</h3>)}
          <p>{brief.greenfield.notice}</p>
        </section>
      ) : null}
    </article>
  );
}

function isBriefState(value: unknown): value is BriefState {
  if (!record(value) || value.ok !== true || value.status !== "available"
    || typeof value.workspaceId !== "string" || typeof value.generatedAt !== "string"
    || !record(value.reviewWindow) || typeof value.reviewWindow.start !== "string"
    || typeof value.reviewWindow.endExclusive !== "string" || !Array.isArray(value.profiles)) {
    return false;
  }
  return value.profiles.every((brief) => {
    if (!record(brief) || brief.status !== "available" || !record(brief.scope)
      || typeof brief.scope.profileId !== "string" || typeof brief.scope.profileName !== "string"
      || typeof brief.scope.profileLifecycle !== "string" || !record(brief.schedule)
      || typeof brief.schedule.status !== "string" || !record(brief.schedule.definition)
      || !record(brief.weekly) || !record(brief.handoff) || !record(brief.greenfield)
      || !Array.isArray(brief.greenfield.profiles) || !record(brief.funnel)) return false;
    if (brief.funnel.status !== "current") return brief.funnel.status === "unavailable";
    return Number.isSafeInteger(brief.funnel.distinctReviewedProspectCount)
      && record(brief.funnel.decisions)
      && [brief.funnel.decisions.approve, brief.funnel.decisions.reject, brief.funnel.decisions.defer]
        .every((count) => Number.isSafeInteger(count) && (count as number) >= 0);
  });
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
