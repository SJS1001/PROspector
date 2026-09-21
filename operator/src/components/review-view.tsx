import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { PageHeading, Panel, ErrorNote } from "@/components/shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { mutationMessage, useParkGreenfield, useReviewProspect, useWorkspace } from "@/lib/workspace";
import type { Prospect, ReviewDecision } from "@/lib/domain/types";

export function ReviewView() {
  const { data, isPending, isError } = useWorkspace();
  if (isPending) return <p className="text-sm text-muted">Loading the review queue…</p>;
  if (isError || !data) return <ErrorNote message="The review queue could not be loaded." />;

  const queue = data.prospects.filter((item) => item.state === "qualified" && item.outcome === "Passed");

  return (
    <div className="grid gap-6">
      <PageHeading
        eyebrow="Profile effective configuration"
        title="Review prospects"
        copy="Qualification is already calculated. You decide. Approve, reject, or defer — each decision needs a reason and binds to this assessment revision."
      />
      {queue.length === 0 ? (
        <Panel className="p-10 text-center text-sm text-muted">
          No qualified prospects to review. Prospects appear here only after
          application-calculated qualification passes. Review the current run
          evidence or find prospects when the active configuration permits.
          <div className="mt-4">
            <Link to="/prospects">
              <Button variant="outline">View prospect evidence</Button>
            </Link>
          </div>
        </Panel>
      ) : (
        <div className="grid gap-4">
          {queue.map((item) => (
            <ReviewCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

function ReviewCard({ item }: { item: Prospect }) {
  const review = useReviewProspect();
  const greenfield = useParkGreenfield();
  const [reason, setReason] = useState("");
  const [reviewAt, setReviewAt] = useState("");
  const [confirming, setConfirming] = useState(false);

  function submit(decision: ReviewDecision) {
    review.mutate({
      prospectId: item.id,
      assessmentId: item.assessmentId,
      expectedRevision: item.revision,
      decision,
      reason,
      reviewAt: decision === "defer" ? reviewAt : undefined,
    });
  }

  return (
    <article className="grid gap-4 rounded-[12px] border border-line bg-cream p-6" aria-busy={review.isPending}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Badge tone="ok">Qualified · passed</Badge>
          <h2 className="mt-3 font-display text-2xl">{item.accountName}</h2>
          <p className="text-sm text-muted">{item.targetName}</p>
        </div>
        <div className="grid h-[52px] w-[52px] place-content-center rounded-[8px] border border-line bg-paper text-center">
          <b className="font-display text-2xl leading-none">{item.score}</b>
          <span className="text-[9px] text-muted">/ 10</span>
        </div>
      </header>

      <dl className="grid gap-2 text-xs">
        <Row term="Offer" value={item.offerId} />
        <Row term="Account" value={`${item.accountName} · ${item.accountId}`} />
        <Row term="Target" value={`${item.targetName} · ${item.targetId}`} />
        <Row term="Evidence" value={`Tier ${item.evidenceTier} · ${item.evidenceDate} · ${item.evidenceUrl}`} />
        <Row term="Configuration" value={item.configurationDigest} />
      </dl>

      <p className="text-sm leading-6 text-muted">{item.evidenceExcerpt}</p>

      <div className="grid gap-2 sm:grid-cols-5">
        {item.assessment.dimensions.map((dim) => (
          <div key={dim.id} className="rounded-[10px] border border-line bg-paper p-3">
            <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">{dim.label}</span>
            <b className="mt-1 block font-display text-xl">{dim.score}/{dim.max}</b>
            <p className="mt-1 text-[11px] leading-4 text-muted">{dim.note}</p>
          </div>
        ))}
      </div>

      <label className="grid gap-1 text-xs text-muted">
        Reason
        <textarea
          required
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          className="min-h-20 w-full rounded-[10px] border border-line bg-cream p-3 text-sm text-ink"
          placeholder="Why this decision?"
        />
      </label>
      <label className="grid max-w-xs gap-1 text-xs text-muted">
        Review date if deferred
        <input
          type="date"
          value={reviewAt}
          onChange={(event) => setReviewAt(event.target.value)}
          className="min-h-11 rounded-[10px] border border-line bg-cream px-3 text-sm text-ink"
        />
      </label>

      <div className="flex flex-wrap gap-2">
        <Button disabled={review.isPending} onClick={() => submit("approve")}>Approve</Button>
        <Button variant="outline" disabled={review.isPending} onClick={() => submit("defer")}>Defer</Button>
        {confirming ? (
          <>
            <Button variant="danger" disabled={review.isPending} onClick={() => submit("reject")}>
              Confirm rejection
            </Button>
            <Button variant="ghost" onClick={() => setConfirming(false)}>Cancel</Button>
          </>
        ) : (
          <Button variant="danger" disabled={review.isPending} onClick={() => setConfirming(true)}>
            Reject
          </Button>
        )}
        <Button
          variant="outline"
          disabled={greenfield.isPending}
          onClick={() => greenfield.mutate({ prospectId: item.id, expectedRevision: item.revision })}
        >
          Greenfield Draft
        </Button>
        <Link to="/prospects/$prospectId" params={{ prospectId: item.id }} className="ml-auto text-sm font-semibold text-teal">
          Open assessment
        </Link>
      </div>
      {review.error || greenfield.error ? (
        <ErrorNote message={mutationMessage(review.error ?? greenfield.error)} />
      ) : null}
    </article>
  );
}

function Row({ term, value }: { term: string; value: string }) {
  return (
    <div className="grid gap-1 border-b border-line py-2 sm:grid-cols-[140px_minmax(0,1fr)]">
      <dt className="text-muted">{term}</dt>
      <dd className="m-0 break-all font-mono text-[11px]">{value}</dd>
    </div>
  );
}
