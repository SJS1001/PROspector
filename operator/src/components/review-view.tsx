import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { PageHeading, Panel, ErrorNote, WorkspaceLoadError } from "@/components/shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  mutationMessage,
  useParkGreenfield,
  useReviewProspect,
  useWorkspace,
} from "@/lib/workspace";
import type { Prospect, ReviewDecision } from "@/lib/domain/types";

export function ReviewView() {
  const { data, isPending, isError } = useWorkspace();
  if (isPending) return <p className="text-sm text-muted">Loading the review queue…</p>;
  if (isError || !data)
    return <WorkspaceLoadError message="The review queue could not be loaded." />;

  const queue = data.prospects.filter(
    (item) => item.state === "qualified" && item.outcome === "Passed",
  );

  return (
    <div className="grid gap-6">
      <PageHeading
        eyebrow={`${queue.length} awaiting your decision`}
        title="Review prospects"
        copy="Open a prospect, check its evidence, then approve, reject or defer with a reason. Each decision applies to this assessment revision."
      />
      {queue.length === 0 ? (
        <Panel className="p-10 text-center text-sm text-muted">
          No qualified prospects to review. Prospects appear here only after application-calculated
          qualification passes. Review the current run evidence or find prospects when the active
          configuration permits.
          <div className="mt-4">
            <Link
              to="/prospects"
              className="inline-flex min-h-11 items-center rounded-sm border border-line px-3.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal"
            >
              View prospect evidence
            </Link>
          </div>
        </Panel>
      ) : (
        <div className="grid gap-4">
          {queue.map((item, index) => (
            <ReviewCard key={item.id} item={item} initiallyOpen={index === 0} />
          ))}
        </div>
      )}
    </div>
  );
}

function ReviewCard({ item, initiallyOpen = true }: { item: Prospect; initiallyOpen?: boolean }) {
  const review = useReviewProspect();
  const greenfield = useParkGreenfield();
  const [reason, setReason] = useState("");
  const [reviewAt, setReviewAt] = useState("");
  const [confirming, setConfirming] = useState(false);
  const confirmation = useRef<HTMLSpanElement>(null);
  const opener = useRef<HTMLSpanElement>(null);
  const returnFocus = useRef(false);
  useEffect(() => {
    if (!confirming) {
      if (returnFocus.current) {
        opener.current?.querySelector<HTMLButtonElement>("button")?.focus();
        returnFocus.current = false;
      }
      return;
    }
    confirmation.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, [confirming]);

  function cancelConfirmation() {
    returnFocus.current = true;
    setConfirming(false);
  }

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
    <details
      className="rounded-[12px] border border-line bg-cream p-5"
      open={initiallyOpen}
      aria-busy={review.isPending}
    >
      <summary className="cursor-pointer rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal">
        <span className="ml-2 inline-flex max-w-full flex-wrap items-center gap-x-4 gap-y-2 align-middle">
          <span className="font-display text-xl">{item.accountName}</span>
          <span className="text-sm text-muted">{item.targetName}</span>
          <Badge tone="ok">Qualified · passed</Badge>
          <span className="text-sm font-semibold">{item.score}/10</span>
          <span className="text-xs text-muted">
            Tier {item.evidenceTier} · {item.evidenceDate}
          </span>
        </span>
        <span className="mt-2 block text-xs text-muted">
          {item.assessment.hardDisqualifier ?? item.assessment.passRule}
        </span>
      </summary>
      <div className="mt-4 grid gap-4">
        <p className="text-sm leading-6 text-muted">{item.evidenceExcerpt}</p>
        <details>
          <summary className="cursor-pointer text-sm font-semibold focus-visible:outline-2 focus-visible:outline-teal">
            Assessment & technical details
          </summary>
          <dl className="grid gap-2 text-xs">
            <Row term="Offer" value={item.offerId} />
            <Row term="Account" value={`${item.accountName} · ${item.accountId}`} />
            <Row term="Target" value={`${item.targetName} · ${item.targetId}`} />
            <Row
              term="Evidence"
              value={`Tier ${item.evidenceTier} · ${item.evidenceDate} · ${item.evidenceUrl}`}
            />
            <Row term="Configuration" value={item.configurationDigest} />
          </dl>

          <div className="mt-3 grid gap-2 sm:grid-cols-5">
            {item.assessment.dimensions.map((dim) => (
              <div key={dim.id} className="rounded-[10px] border border-line bg-paper p-3">
                <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
                  {dim.label}
                </span>
                <b className="mt-1 block font-display text-xl">
                  {dim.score}/{dim.max}
                </b>
                <p className="mt-1 text-[11px] leading-4 text-muted">{dim.note}</p>
              </div>
            ))}
          </div>
        </details>

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
          <Button disabled={review.isPending} onClick={() => submit("approve")}>
            Approve
          </Button>
          <Button variant="outline" disabled={review.isPending} onClick={() => submit("defer")}>
            Defer
          </Button>
          {confirming ? (
            <span
              ref={confirmation}
              className="contents"
              onKeyDown={(event) => {
                if (event.key !== "Escape" || review.isPending) return;
                event.preventDefault();
                cancelConfirmation();
              }}
            >
              <Button variant="danger" disabled={review.isPending} onClick={() => submit("reject")}>
                Confirm rejection
              </Button>
              <Button variant="ghost" disabled={review.isPending} onClick={cancelConfirmation}>
                Cancel
              </Button>
            </span>
          ) : (
            <span ref={opener} className="contents">
              <Button
                variant="danger"
                disabled={review.isPending}
                onClick={() => setConfirming(true)}
              >
                Reject
              </Button>
            </span>
          )}
          <Button
            variant="outline"
            disabled={greenfield.isPending}
            onClick={() =>
              greenfield.mutate({ prospectId: item.id, expectedRevision: item.revision })
            }
          >
            Greenfield Draft
          </Button>
          <Link
            to="/prospects/$prospectId"
            params={{ prospectId: item.id }}
            className="ml-auto text-sm font-semibold text-teal"
          >
            Open assessment
          </Link>
        </div>
        {review.error || greenfield.error ? (
          <ErrorNote message={mutationMessage(review.error ?? greenfield.error)} />
        ) : null}
      </div>
    </details>
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
