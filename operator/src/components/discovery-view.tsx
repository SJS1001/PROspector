import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { PageHeading, Panel, ErrorNote, WorkspaceLoadError } from "@/components/shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  mutationMessage,
  useActivateProduct,
  useConfirmDraftPlay,
  useDecideProposal,
  useRunDiscovery,
  useWorkspace,
} from "@/lib/workspace";
import type { MarketProposal, ProposalDecision, WorkspaceDTO } from "@/lib/domain/types";

export function DiscoveryView() {
  const { data, isPending, isError } = useWorkspace();
  if (isPending) return <p className="text-sm text-muted">Reading market discovery…</p>;
  if (isError || !data) return <WorkspaceLoadError message="Discovery could not be loaded." />;

  const open = data.proposals.filter((item) => item.decision === "open");

  return (
    <div className="grid gap-6">
      <PageHeading title="Target markets" />

      {!data.interviewComplete ? <InterviewBlocked /> : null}

      <ProductReadiness data={data} />
      {data.discoveryRuns
        .filter((run) => run.status !== "succeeded")
        .map((run) => (
          <p
            key={run.id}
            role={run.status === "failed" ? "alert" : "status"}
            className="text-sm text-muted"
          >
            Discovery {run.status}
            {run.terminalReason ? `: ${run.terminalReason}` : ""}
          </p>
        ))}
      <DraftPlays data={data} />

      <p className="text-xs font-semibold text-muted">{open.length} to review</p>
      {data.proposals.length === 0 ? (
        <Panel className="p-10 text-center text-sm text-muted">
          No markets yet. Use the action above to find markets.
        </Panel>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {open.map((proposal) => (
            <ProposalCard key={proposal.id} proposal={proposal} />
          ))}
        </div>
      )}
      {data.proposals.some((proposal) => proposal.decision !== "open") ? (
        <details className="rounded-[12px] border border-line bg-cream p-5">
          <summary className="cursor-pointer text-sm font-medium">Reviewed markets</summary>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {data.proposals
              .filter((proposal) => proposal.decision !== "open")
              .map((proposal) => (
                <ProposalCard key={proposal.id} proposal={proposal} />
              ))}
          </div>
        </details>
      ) : null}
      <DiscoveryLedger data={data} />
    </div>
  );
}

function InterviewBlocked() {
  return (
    <Panel className="p-8">
      <h2 className="font-display text-xl">Complete your company details first</h2>
      <Link to="/knowledge" className="mt-5 inline-flex">
        <Button>Complete company details</Button>
      </Link>
    </Panel>
  );
}

function ProductReadiness({ data }: { data: WorkspaceDTO }) {
  const activate = useActivateProduct();
  const discover = useRunDiscovery();
  const [confirming, setConfirming] = useState<"activate" | "discover" | null>(null);
  const ready = data.interviewComplete && data.product.readiness.every((item) => item.complete);
  const active = data.product.status === "active";
  const busyRun = data.discoveryRuns.some(
    (run) => run.status === "queued" || run.status === "running",
  );
  const error = activate.error ?? discover.error;
  const pending = activate.isPending || discover.isPending;
  const confirmation = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLDivElement>(null);
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
    const dismiss = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || pending) return;
      event.preventDefault();
      returnFocus.current = true;
      setConfirming(null);
    };
    document.addEventListener("keydown", dismiss);
    return () => document.removeEventListener("keydown", dismiss);
  }, [confirming, pending]);

  function cancelConfirmation() {
    returnFocus.current = true;
    setConfirming(null);
  }

  return (
    <Panel className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl">
            {data.product.snapshot?.product || "Product configuration"}
          </h2>
        </div>
        <Badge tone={active ? "ok" : data.product.status === "stale" ? "warn" : "neutral"}>
          {data.product.status}
        </Badge>
      </div>

      <details className="mt-4" open={!ready}>
        <summary className="cursor-pointer text-sm font-semibold focus-visible:outline-2 focus-visible:outline-teal">
          Product readiness · {data.product.readiness.filter((item) => item.complete).length}/
          {data.product.readiness.length} complete
        </summary>
        <ol className="mt-3 grid gap-2">
          {data.product.readiness.map((item) => (
            <li
              key={item.id}
              className="flex items-start justify-between gap-3 border-b border-line py-2 last:border-0"
            >
              <div>
                <b className="block text-sm">{item.label}</b>
                <span className="text-xs text-muted">{item.summary}</span>
              </div>
              <Badge tone={item.complete ? "ok" : "warn"}>
                {item.complete ? "Complete" : "Needs confirmation"}
              </Badge>
            </li>
          ))}
        </ol>
        <p className="mt-3 break-all font-mono text-[11px] text-muted">
          {data.product.digest ?? "No configuration digest yet"}
        </p>
      </details>

      {!ready ? (
        <p role="alert" className="mt-4 text-xs text-red">
          Confirm the missing company details before activation.
        </p>
      ) : null}
      {data.product.status === "stale" ? (
        <p role="alert" className="mt-4 text-xs text-amber">
          Company details changed. Activate the updated product to continue.
        </p>
      ) : null}

      {confirming ? (
        <div ref={confirmation} className="mt-5 rounded-[10px] border border-line bg-paper p-4">
          <p className="text-sm">
            {confirming === "activate"
              ? "Activation queues one discovery run and does not start prospecting. It does not create a customer profile or authorize outreach."
              : "This run produces at most three market play proposals. Explore, defer, or dismiss — none of these activate prospecting."}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              disabled={pending}
              onClick={() => {
                if (confirming === "activate") activate.mutate(undefined);
                else discover.mutate(undefined);
                setConfirming(null);
              }}
            >
              {pending ? "Working…" : "Confirm"}
            </Button>
            <Button variant="outline" disabled={pending} onClick={cancelConfirmation}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div ref={opener} className="mt-5 grid gap-3">
          {!active ? (
            <>
              <Button disabled={!ready || pending} onClick={() => setConfirming("activate")}>
                Activate product configuration
              </Button>
            </>
          ) : (
            <>
              <Button disabled={pending || busyRun} onClick={() => setConfirming("discover")}>
                Discover markets
              </Button>
            </>
          )}
        </div>
      )}

      {pending ? (
        <p className="mt-3 text-xs text-muted" aria-live="polite">
          Starting market discovery…
        </p>
      ) : null}
      {error ? (
        <div className="mt-3">
          <ErrorNote message={mutationMessage(error)} />
        </div>
      ) : null}
    </Panel>
  );
}

function DraftPlays({ data }: { data: WorkspaceDTO }) {
  if (!data.draftPlays.length) return null;
  return (
    <Panel className="p-6">
      {data.draftPlays.some((play) => play.status !== "confirmed") ? (
        <>
          <h2 className="font-display text-lg">
            Draft markets · {data.draftPlays.filter((play) => play.status !== "confirmed").length}{" "}
            awaiting confirmation
          </h2>
          <ol className="mt-4 grid gap-3">
            {data.draftPlays
              .filter((play) => play.status !== "confirmed")
              .map((play) => (
                <DraftPlayCard key={play.id} play={play} />
              ))}
          </ol>
        </>
      ) : null}
      {data.draftPlays.some((play) => play.status === "confirmed") ? (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-semibold focus-visible:outline-2 focus-visible:outline-teal">
            Confirmed markets ·{" "}
            {data.draftPlays.filter((play) => play.status === "confirmed").length}
          </summary>
          <ol className="mt-3 grid gap-3">
            {data.draftPlays
              .filter((play) => play.status === "confirmed")
              .map((play) => (
                <DraftPlayCard key={play.id} play={play} />
              ))}
          </ol>
        </details>
      ) : null}
    </Panel>
  );
}

function DraftPlayCard({ play }: { play: WorkspaceDTO["draftPlays"][number] }) {
  const confirm = useConfirmDraftPlay();
  const [audience, setAudience] = useState(play.audience ?? "");
  const [likelyBuyer, setLikelyBuyer] = useState(play.likelyBuyer ?? "");
  const [offer, setOffer] = useState(play.offer ?? "eight-week-diagnostic");
  const confirmed = play.status === "confirmed";

  return (
    <li className="rounded-[10px] border border-line bg-paper p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <b className="text-sm">{play.title}</b>
        <Badge tone={confirmed ? "ok" : "warn"}>{play.status}</Badge>
      </div>
      {play.notes ? <p className="mt-2 text-xs text-muted">{play.notes}</p> : null}
      {confirmed ? (
        <p className="mt-3 text-xs text-muted">
          Audience: {play.audience}. Buyer: {play.likelyBuyer}. Offer: {play.offer}.
        </p>
      ) : (
        <form
          className="mt-4 grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            confirm.mutate({ playId: play.id, audience, likelyBuyer, offer });
          }}
        >
          <label className="grid gap-1 text-xs">
            Audience
            <input
              required
              value={audience}
              onChange={(event) => setAudience(event.target.value)}
              className="min-h-11 rounded-[10px] border border-line bg-cream px-3 text-sm"
            />
          </label>
          <label className="grid gap-1 text-xs">
            Likely buyer
            <input
              required
              value={likelyBuyer}
              onChange={(event) => setLikelyBuyer(event.target.value)}
              className="min-h-11 rounded-[10px] border border-line bg-cream px-3 text-sm"
            />
          </label>
          <label className="grid gap-1 text-xs">
            Offer
            <input
              value={offer}
              onChange={(event) => setOffer(event.target.value)}
              className="min-h-11 rounded-[10px] border border-line bg-cream px-3 text-sm"
            />
          </label>
          <Button type="submit" disabled={confirm.isPending}>
            Confirm draft play
          </Button>
          {confirm.error ? <ErrorNote message={mutationMessage(confirm.error)} /> : null}
        </form>
      )}
    </li>
  );
}

function DiscoveryLedger({ data }: { data: WorkspaceDTO }) {
  if (data.discoveryRuns.length === 0) return null;
  return (
    <Panel className="p-6">
      <details open={data.discoveryRuns.some((run) => run.status !== "succeeded")}>
        <summary className="cursor-pointer text-sm font-semibold focus-visible:outline-2 focus-visible:outline-teal">
          Discovery history · {data.discoveryRuns.length} runs
        </summary>
        <ol className="mt-4 grid gap-3">
          {data.discoveryRuns.map((run) => (
            <li key={run.id} className="rounded-[10px] border border-line bg-paper p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <b className="text-sm">{run.trigger} run</b>
                <Badge
                  tone={
                    run.status === "succeeded" ? "ok" : run.status === "failed" ? "danger" : "warn"
                  }
                >
                  {run.status}
                </Badge>
              </div>
              <p className="mt-2 text-xs text-muted">
                {run.proposalCount} proposals
                {` · ${new Date(run.startedAt).toLocaleString("en-CA")}`}
                {run.finishedAt
                  ? ` · finished ${new Date(run.finishedAt).toLocaleString("en-CA")}`
                  : ""}
              </p>
              {run.terminalReason ? <p className="mt-2 text-xs">{run.terminalReason}</p> : null}
            </li>
          ))}
        </ol>
      </details>
    </Panel>
  );
}

function ProposalCard({ proposal }: { proposal: MarketProposal }) {
  const decide = useDecideProposal();
  const [reason, setReason] = useState("");
  const open = proposal.decision === "open";

  function act(decision: Exclude<ProposalDecision, "open">) {
    decide.mutate({ proposalId: proposal.id, decision, reason });
  }

  return (
    <article className="grid gap-4 rounded-[12px] border border-line bg-cream p-6">
      <header className="flex items-start justify-between gap-3">
        <h2 className="font-display text-xl leading-snug">{proposal.title}</h2>
        <Badge
          tone={
            proposal.decision === "explore"
              ? "ok"
              : proposal.decision === "open"
                ? "lime"
                : "neutral"
          }
        >
          {proposal.decision}
        </Badge>
      </header>
      <p className="text-sm text-muted">{proposal.problemMatch}</p>
      <p className="text-xs text-muted">
        <b className="text-ink">Fit:</b> {proposal.productFit}
      </p>
      <p className="text-xs text-muted">
        <b className="text-ink">Risks:</b> {proposal.risks}
      </p>
      <details>
        <summary className="cursor-pointer text-sm font-semibold focus-visible:outline-2 focus-visible:outline-teal">
          Market details & evidence
        </summary>
        <dl className="mt-3 grid gap-2 text-xs">
          <Row term="Customer type" value={proposal.customerType} />
          <Row term="Examples" value={proposal.examples} />
          <Row term="Likely buyer" value={proposal.likelyBuyer} />
        </dl>
        <div className="rounded-[8px] border border-line bg-paper p-3 text-xs text-muted">
          <b className="text-teal">Evidence. </b>
          {proposal.evidence}
        </div>
      </details>
      {open ? (
        <div className="grid gap-3">
          <label className="grid gap-1 text-xs text-muted">
            Reason
            <input
              required
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className="min-h-11 rounded-[10px] border border-line bg-cream px-3 text-sm text-ink"
              placeholder="Why this decision?"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button disabled={decide.isPending} onClick={() => act("explore")}>
              Explore
            </Button>
            <Button variant="outline" disabled={decide.isPending} onClick={() => act("defer")}>
              Defer
            </Button>
            <Button variant="danger" disabled={decide.isPending} onClick={() => act("dismiss")}>
              Dismiss
            </Button>
          </div>
          {decide.error ? <ErrorNote message={mutationMessage(decide.error)} /> : null}
        </div>
      ) : (
        <p className="text-xs text-muted">Reason recorded: {proposal.decisionReason}</p>
      )}
    </article>
  );
}

function Row({ term, value }: { term: string; value: string }) {
  return (
    <div className="grid gap-1 border-b border-line py-2 sm:grid-cols-[140px_minmax(0,1fr)]">
      <dt className="text-muted">{term}</dt>
      <dd className="m-0 break-words">{value}</dd>
    </div>
  );
}
