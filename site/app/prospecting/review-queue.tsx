import React, { useState } from "react";
import {
  buildReviewCommand,
  EMPTY_REVIEW_DRAFT,
  updateReviewDraft,
  type ReviewDrafts,
} from "./review-command";

type History = {
  id?: string;
  prospect_id?: string;
  decision?: string;
  decision_at?: number;
  owner_subject?: string;
  audit_event_id?: string;
  event_kind?: string;
  created_at?: number;
  ends_at?: number;
  status?: string;
  prior_prospect_id?: string;
  reentered_prospect_id?: string;
};
type Freshness = {
  state?: string;
  newestRetrievedAt?: number | null;
  sources?: {
    id?: string;
    retrievedAt?: number;
    recency?: string;
    tier?: number;
    material?: boolean;
  }[];
};
type Queue = {
  id: string;
  assessment_id: string;
  revision: number;
  offer_id: string;
  score: number;
  outcome: string;
  configuration_digest: string;
  assessment_digest?: string;
  account?: { id: string; value: string };
  target?: { id: string; value: string };
  evidenceFreshness?: Freshness;
  cooldownState?: string;
  decisionHistory?: History[];
  cooldownHistory?: History[];
  reentryHistory?: History[];
};
export function ReviewQueue({
  queue,
  onCommand,
  busy,
}: {
  queue: Queue[];
  onCommand: (body: Record<string, unknown>) => void;
  busy: boolean;
}) {
  const [drafts, setDrafts] = useState<ReviewDrafts>({});
  const [confirming, setConfirming] = useState<string | null>(null);
  const submit = (item: Queue, decision: "approve" | "reject" | "defer") => {
    const command = buildReviewCommand(
      item,
      decision,
      drafts[item.id] ?? EMPTY_REVIEW_DRAFT,
    );
    if (command) onCommand(command);
  };
  const qualified = queue.filter((item) => item.outcome === "Passed");
  return (
    <section
      className="prospecting-panel review-queue"
      aria-labelledby="review-queue"
    >
      <h2 id="review-queue">Review Queue</h2>
      {busy && (
        <p aria-live="polite" role="status">
          Decision pending. The immutable assessment remains shown while
          competing decisions are disabled.
        </p>
      )}
      {qualified.length ? (
        qualified.map((item) => {
          const lastDecision = item.decisionHistory?.at(-1);
          const lastCooldown = item.cooldownHistory?.at(-1);
          const lastReentry = item.reentryHistory?.at(-1);
          const draft = drafts[item.id] ?? EMPTY_REVIEW_DRAFT;
          return (
            <article key={item.id} aria-busy={busy}>
              <header>
                <strong>Qualified</strong>
                <span>Passed · score {item.score}</span>
              </header>
              <dl>
                <Row
                  term="Account"
                  value={`${item.account?.value || "not recorded"} · ${item.account?.id || "no account ID"}`}
                />
                <Row
                  term="Target"
                  value={`${item.target?.value || "not recorded"} · ${item.target?.id || "no target ID"}`}
                />
                <Row term="Offer" value={item.offer_id} />
                <Row
                  term="Configuration digest"
                  value={item.configuration_digest}
                />
                <Row
                  term="Evidence freshness"
                  value={freshness(item.evidenceFreshness)}
                />
                <Row
                  term="Cooldown / review"
                  value={`${item.cooldownState ?? "none"}${lastCooldown ? ` · ${lastCooldown.status} until ${stamp(lastCooldown.ends_at)}` : ""}${lastReentry?.event_kind ? ` · ${lastReentry.event_kind} at ${stamp(lastReentry.created_at)}` : ""}`}
                />
              </dl>
              <a
                className="assessment-link"
                href={`#assessment-${item.assessment_id}`}
              >
                View immutable assessment {item.assessment_id}
              </a>
              {lastDecision && (
                <p role="status">
                  Authoritative decision: {lastDecision.decision} at{" "}
                  {stamp(lastDecision.decision_at)} · owner{" "}
                  {lastDecision.owner_subject} · audit{" "}
                  {lastDecision.audit_event_id}
                </p>
              )}
              <Lineage history={item} />
              <label>
                Owner reason
                <input
                  value={draft.reason}
                  maxLength={2000}
                  onChange={(event) =>
                    setDrafts((current) =>
                      updateReviewDraft(current, item.id, {
                        reason: event.target.value,
                      }),
                    )
                  }
                  disabled={busy}
                />
              </label>
              <label>
                Defer review date
                <input
                  type="datetime-local"
                  value={draft.reviewAt}
                  onChange={(event) =>
                    setDrafts((current) =>
                      updateReviewDraft(current, item.id, {
                        reviewAt: event.target.value,
                      }),
                    )
                  }
                  disabled={busy}
                />
              </label>
              <div className="decision-actions">
                <button
                  type="button"
                  disabled={busy || !draft.reason.trim()}
                  onClick={() => submit(item, "approve")}
                >
                  Approve prospect
                </button>
                <button
                  type="button"
                  className="destructive"
                  disabled={busy || !draft.reason.trim()}
                  onClick={() => setConfirming(item.id)}
                >
                  Reject prospect
                </button>
                <button
                  type="button"
                  disabled={
                    busy || !draft.reason.trim() || !draft.reviewAt
                  }
                  onClick={() => submit(item, "defer")}
                >
                  Defer prospect
                </button>
              </div>
              {confirming === item.id && (
                <div role="alert" className="rejection-confirmation">
                  <p>
                    Rejecting this prospect starts a 90-day cooldown unless a
                    Material Signal appears. Confirm rejection.
                  </p>
                  <button
                    type="button"
                    className="destructive"
                    disabled={busy}
                    onClick={() => submit(item, "reject")}
                  >
                    Confirm rejection
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setConfirming(null)}
                  >
                    Keep prospect
                  </button>
                </div>
              )}
              <p>
                Approved prospects still require governed contact verification.
                Approval records prospect state only and authorizes no external
                effect.
              </p>
            </article>
          );
        })
      ) : (
        <>
          <p>No qualified prospects to review</p>
          <p>
            Prospects appear here only after application-calculated
            qualification passes. Review the current run evidence or find
            prospects when the active configuration permits.
          </p>
          <a href="#prospect-workspace">View prospect evidence</a>
        </>
      )}
    </section>
  );
}

function Row({ term, value }: { term: string; value: string }) {
  return (
    <>
      <dt>{term}</dt>
      <dd>{value}</dd>
    </>
  );
}
function Lineage({ history }: { history: Queue }) {
  const decisions = history.decisionHistory ?? [];
  const cooldowns = history.cooldownHistory ?? [];
  const reentries = history.reentryHistory ?? [];
  return (
    <details>
      <summary>Decision, cooldown, and re-entry lineage</summary>
      <p>
        Prior review history:{" "}
        {decisions.length
          ? decisions
              .map(
                (row) =>
                  `${row.decision} (${prospect(row)}) at ${stamp(row.decision_at)}`,
              )
              .join("; ")
          : "none"}
      </p>
      <p>
        Prior cooldown history:{" "}
        {cooldowns.length
          ? cooldowns
              .map(
                (row) =>
                  `${row.status} (${prospect(row)}) until ${stamp(row.ends_at)}`,
              )
              .join("; ")
          : "none"}
      </p>
      <p>
        Re-entry history:{" "}
        {reentries.length
          ? reentries
              .map(
                (row) =>
                  `${row.event_kind} (${row.prior_prospect_id ?? prospect(row)} → ${row.reentered_prospect_id ?? "current"}) at ${stamp(row.created_at)}`,
              )
              .join("; ")
          : "none"}
      </p>
    </details>
  );
}
function freshness(value?: Freshness) {
  if (!value || value.state === "unknown") return "Unknown — inspect evidence";
  const state =
    value.state === "reconfirmation_required"
      ? "Account Context — reconfirmation required"
      : "Current";
  return `${state} · newest retrieval ${stamp(value.newestRetrievedAt)} · ${value.sources?.length ?? 0} cited source${value.sources?.length === 1 ? "" : "s"}`;
}
function prospect(history: History) {
  return history.prospect_id ?? "current";
}
function stamp(value: number | null | undefined) {
  return Number.isFinite(value)
    ? new Date(value as number).toISOString()
    : "not recorded";
}
