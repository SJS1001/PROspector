"use client";

import { useEffect, useState } from "react";
import type { MorningBriefAvailable } from "../../domain/morning-brief";

type BriefState = Readonly<{
  ok: true;
  status: "available";
  workspaceId: string;
  generatedAt: string;
  reviewWindow: Readonly<{ start: string; endExclusive: string }>;
  profiles: readonly MorningBriefAvailable[];
}>;

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

      <section className="panel brief-boundary" aria-label="Unavailable downstream capabilities">
        <h2>Local operating view only</h2>
        <p>No run, schedule, or export actions are available from this brief.</p>
        <ul>
          <li><strong>Weekly outcome unavailable.</strong> Export-ready transition history is not persisted.</li>
          <li><strong>Export and handoff unavailable.</strong> Verification, package, suppression, and delivery authority is not composed.</li>
          <li><strong>Restore unavailable.</strong> Workspace origin and verified recovery evidence are not persisted.</li>
        </ul>
      </section>

      {!state && !unavailable && <section className="panel" role="status"><p>Reading persisted Phase 4 state…</p></section>}
      {unavailable && <section className="panel" role="alert"><h2>Morning Brief unavailable</h2><p>The persisted read could not be completed. No action was attempted.</p></section>}
      {state && state.profiles.length === 0 && <section className="panel"><h2>No active profiles</h2><p>No complete active Company/Product/Play/Profile path is available in this workspace.</p></section>}
      {state && state.profiles.length > 0 && (
        <div className="brief-profile-grid">
          {state.profiles.map((brief) => <ProfileBrief key={brief.scope.profileId} brief={brief} />)}
        </div>
      )}
    </section>
  );
}

function ProfileBrief({ brief }: { brief: MorningBriefAvailable }) {
  const funnel = brief.funnel.status === "current" ? brief.funnel : null;
  return (
    <article className="panel brief-profile-card">
      <header>
        <div><span className="eyebrow">ACTIVE PROFILE</span><h2>{brief.scope.profileName}</h2></div>
        <span className="task-state-badge">{brief.scope.profileLifecycle}</span>
      </header>
      <dl>
        <div><dt>Schedule evidence</dt><dd>{brief.schedule.status === "current" ? brief.schedule.reportedState : "Unavailable"}</dd></div>
        <div><dt>Reviewed this Toronto week</dt><dd>{funnel?.distinctReviewedProspectCount ?? "Unavailable"}</dd></div>
        <div><dt>Approved</dt><dd>{funnel?.decisions.approve ?? "Unavailable"}</dd></div>
        <div><dt>Rejected</dt><dd>{funnel?.decisions.reject ?? "Unavailable"}</dd></div>
        <div><dt>Deferred</dt><dd>{funnel?.decisions.defer ?? "Unavailable"}</dd></div>
      </dl>
      <div className="brief-unavailable-list">
        <p><strong>Weekly outcome:</strong> unavailable</p>
        <p><strong>Export/handoff:</strong> unavailable</p>
        <p><strong>Restore:</strong> unavailable</p>
      </div>
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
      || typeof brief.schedule.status !== "string" || !record(brief.funnel)) return false;
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
