import React, { useState } from "react";

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
type Queue = {
  id: string;
  assessment_id: string;
  revision: number;
  offer_id: string;
  score: number;
  outcome: string;
  configuration_digest: string;
  account?: { id: string; value: string };
  target?: { id: string; value: string };
  cooldownState?: string;
  decisionHistory?: History[];
  cooldownHistory?: History[];
  reentryHistory?: History[];
};
type ReviewDraft = { reason: string; reviewAt: string };
type ReviewDrafts = Record<string, ReviewDraft>;
const EMPTY_DRAFT: ReviewDraft = { reason: "", reviewAt: "" };

export function updateReviewDraft(
  drafts: ReviewDrafts,
  prospectId: string,
  patch: Partial<ReviewDraft>,
): ReviewDrafts {
  return {
    ...drafts,
    [prospectId]: { ...(drafts[prospectId] ?? EMPTY_DRAFT), ...patch },
  };
}

export function buildReviewCommand(
  item: Queue,
  decision: "approve" | "reject" | "defer",
  draft: ReviewDraft,
): Record<string, unknown> | null {
  const reason = draft.reason.normalize("NFC").trim();
  if (!reason) return null;
  const reviewAt =
    decision === "defer" ? new Date(draft.reviewAt).getTime() : undefined;
  if (decision === "defer" && !Number.isFinite(reviewAt)) return null;
  return {
    action: "review",
    prospectId: item.id,
    assessmentId: item.assessment_id,
    expectedRevision: item.revision,
    decision,
    reason,
    ...(reviewAt === undefined ? {} : { reviewAt }),
  };
}

export function ReviewQueue({
  queue,
  onCommand,
  busy,
}: {
  queue: Queue[];
  onCommand: (body: Record<string, unknown>) => void;
  busy: boolean;
}) {
  const [drafts, setDrafts] = useState<ReviewDrafts>({}),
    [confirming, setConfirming] = useState<string | null>(null);
  const submit = (item: Queue, decision: "approve" | "reject" | "defer") => {
    const command = buildReviewCommand(
      item,
      decision,
      drafts[item.id] ?? EMPTY_DRAFT,
    );
    if (command) onCommand(command);
  };
  return (
    <section
      className="prospecting-panel review-queue"
      aria-labelledby="review-queue"
    >
      <h2 id="review-queue">Review Queue</h2>
      {queue.length ? (
        queue.map((item) => {
          const lastDecision = item.decisionHistory?.at(-1),
            lastCooldown = item.cooldownHistory?.at(-1),
            lastReentry = item.reentryHistory?.at(-1),
            draft = drafts[item.id] ?? EMPTY_DRAFT;
          return (
            <article key={item.id}>
              <p>
                <strong>Qualified</strong> — Passed · score {item.score}
              </p>
              <p>
                Account: {item.account?.value || "not recorded"} ·{" "}
                {item.account?.id || "no account ID"}
              </p>
              <p>
                Target: {item.target?.value || "not recorded"} ·{" "}
                {item.target?.id || "no target ID"} · Offer {item.offer_id}
              </p>
              <p>
                Assessment {item.assessment_id} · configuration{" "}
                {item.configuration_digest}
              </p>
              <p>
                Cooldown/re-entry: {item.cooldownState ?? "none"}
                {lastCooldown
                  ? ` · ${lastCooldown.status} until ${stamp(lastCooldown.ends_at)}`
                  : ""}
                {lastReentry?.event_kind
                  ? ` · ${lastReentry.event_kind} at ${stamp(lastReentry.created_at)}`
                  : ""}
              </p>
              {lastDecision && (
                <p>
                  Decision: {lastDecision.decision} at{" "}
                  {stamp(lastDecision.decision_at)} · owner{" "}
                  {lastDecision.owner_subject} · audit{" "}
                  {lastDecision.audit_event_id}
                </p>
              )}
              <Lineage history={item} />
              <label>
                Owner reason{" "}
                <input
                  value={draft.reason}
                  onChange={(e) =>
                    setDrafts((current) =>
                      updateReviewDraft(current, item.id, {
                        reason: e.target.value,
                      }),
                    )
                  }
                  disabled={busy}
                />
              </label>
              <label>
                Defer review date{" "}
                <input
                  type="datetime-local"
                  value={draft.reviewAt}
                  onChange={(e) =>
                    setDrafts((current) =>
                      updateReviewDraft(current, item.id, {
                        reviewAt: e.target.value,
                      }),
                    )
                  }
                  disabled={busy}
                />
              </label>
              <div>
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
                <div role="alert">
                  <p>
                    Rejecting this prospect starts a 90-day cooldown unless a
                    Material Signal appears. Confirm rejection.
                  </p>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => submit(item, "reject")}
                  >
                    Confirm rejection
                  </button>
                </div>
              )}
              <p>
                Approved prospects still require governed contact verification.
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
        </>
      )}
    </section>
  );
}

function Lineage({ history }: { history: Queue }) {
  const decisions = history.decisionHistory ?? [],
    cooldowns = history.cooldownHistory ?? [],
    reentries = history.reentryHistory ?? [];
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
      <pre>{JSON.stringify({ decisions, cooldowns, reentries }, null, 2)}</pre>
    </details>
  );
}
function prospect(history: History) {
  return history.prospect_id ?? "current";
}
function stamp(value: number | undefined) {
  return Number.isFinite(value)
    ? new Date(value!).toISOString()
    : "not recorded";
}
