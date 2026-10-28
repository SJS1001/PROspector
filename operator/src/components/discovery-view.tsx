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
      <PageHeading
        eyebrow="Product discovery"
        title="Market play proposals"
        copy="Every run produces at most three proposals. Explore, defer, or dismiss — none of these activate prospecting on their own. Hunting starts only from an activated profile."
      />

      {!data.interviewComplete ? <InterviewBlocked /> : null}

      <ProductReadiness data={data} />
      <DraftPlays data={data} />
      <DiscoveryLedger data={data} />

      <p className="text-xs font-semibold text-muted">
        {open.length} open · {data.proposals.length} in this workspace · at most 3 proposals per run
      </p>
      {data.proposals.length === 0 ? (
        <Panel className="p-10 text-center text-sm text-muted">
          No market play proposals yet. Activate the product, then Discover markets. A run surfaces at most three proposals.
        </Panel>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {data.proposals.map((proposal) => (
            <ProposalCard key={proposal.id} proposal={proposal} />
          ))}
        </div>
      )}
    </div>
  );
}

function InterviewBlocked() {
  return (
    <Panel className="p-8">
      <Badge tone="warn">Interview incomplete</Badge>
      <h2 className="mt-3 font-display text-2xl">Market discovery is blocked</h2>
      <p className="mt-2 max-w-xl text-sm text-muted">
        Confirm every knowledge item before product readiness and live market discovery can start.
        Activation and Discover markets stay dark until the interview is complete.
      </p>
      <Link to="/knowledge" className="mt-5 inline-flex">
        <Button>Continue interview</Button>
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
  const busyRun = data.discoveryRuns.some((run) => run.status === "queued" || run.status === "running");
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
          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-teal">
            {active ? "Active product configuration" : "Product readiness"}
          </span>
          <h2 className="mt-2 font-display text-xl">
            {data.product.snapshot?.product || "Product configuration"}
          </h2>
          <p className="mt-1 font-mono text-[11px] text-muted">
            {data.product.digest ?? "No configuration digest yet"}
          </p>
        </div>
        <Badge tone={active ? "ok" : data.product.status === "stale" ? "warn" : "neutral"}>
          {data.product.status}
        </Badge>
      </div>

      <ol className="mt-5 grid gap-2">
        {data.product.readiness.map((item) => (
          <li key={item.id} className="flex items-start justify-between gap-3 border-b border-line py-2 last:border-0">
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

      {!ready ? (
        <p role="alert" className="mt-4 text-xs text-red">
          This product is not ready. Confirm the required interview items before creating a configuration.
        </p>
      ) : null}
      {data.product.status === "stale" ? (
        <p role="alert" className="mt-4 text-xs text-amber">
          Confirmed knowledge changed after activation. Load the current product configuration before continuing.
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
              <p className="text-xs text-muted">
                Activation queues one discovery run and does not start prospecting.
              </p>
              <Button disabled={!ready || pending} onClick={() => setConfirming("activate")}>
                Activate product configuration
              </Button>
            </>
          ) : (
            <>
              <p className="text-xs text-muted">
                Digest {data.product.digest}. Manual discovery produces at most three proposals per run and does not start prospecting.
              </p>
              <Button disabled={pending || busyRun} onClick={() => setConfirming("discover")}>
                Discover markets
              </Button>
            </>
          )}
        </div>
      )}

      {pending ? (
        <p className="mt-3 text-xs text-muted" aria-live="polite">
          Queuing market discovery against the product configuration. Prospecting stays off.
        </p>
      ) : null}
      {error ? <div className="mt-3"><ErrorNote message={mutationMessage(error)} /></div> : null}
    </Panel>
  );
}

function DraftPlays({ data }: { data: WorkspaceDTO }) {
  return (
    <Panel className="p-6">
      <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-teal">Draft plays</span>
      <h2 className="mt-2 font-display text-lg">Explore opened a Draft Play. It does not activate prospecting.</h2>
      {data.draftPlays.length === 0 ? (
        <p className="mt-3 text-sm text-muted">
          No draft plays yet. Exploring a proposal records a draft interview only. Confirm audience and buyer before the profile can hunt.
        </p>
      ) : (
        <ol className="mt-4 grid gap-3">
          {data.draftPlays.map((play) => (
            <DraftPlayCard key={play.id} play={play} />
          ))}
        </ol>
      )}
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
          Audience: {play.audience}. Buyer: {play.likelyBuyer}. Offer: {play.offer}. Prospecting still needs a separate profile activation.
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
  if (data.discoveryRuns.length === 0) {
    return (
      <Panel className="p-6">
        <h2 className="font-display text-lg">Discovery run ledger</h2>
        <p className="mt-2 text-sm text-muted">
          No discovery runs yet. Activation queues one initial run. Manual Discover markets queues another, each capped at three proposals.
        </p>
      </Panel>
    );
  }
  return (
    <Panel className="p-6">
      <h2 className="font-display text-lg">Discovery run ledger</h2>
      <ol className="mt-4 grid gap-3">
        {data.discoveryRuns.map((run) => (
          <li key={run.id} className="rounded-[10px] border border-line bg-paper p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <b className="text-sm">{run.trigger} run</b>
              <Badge tone={run.status === "succeeded" ? "ok" : run.status === "failed" ? "danger" : "warn"}>
                {run.status}
              </Badge>
            </div>
            <p className="mt-2 text-xs text-muted">
              {run.proposalCount} proposals
              {` · ${new Date(run.startedAt).toLocaleString("en-CA")}`}
              {run.finishedAt ? ` · finished ${new Date(run.finishedAt).toLocaleString("en-CA")}` : ""}
            </p>
            {run.terminalReason ? <p className="mt-2 text-xs">{run.terminalReason}</p> : null}
          </li>
        ))}
      </ol>
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
        <Badge tone={proposal.decision === "explore" ? "ok" : proposal.decision === "open" ? "lime" : "neutral"}>
          {proposal.decision}
        </Badge>
      </header>
      <p className="text-sm text-muted">{proposal.problemMatch}</p>
      <dl className="grid gap-2 text-xs">
        <Row term="Customer type" value={proposal.customerType} />
        <Row term="Examples" value={proposal.examples} />
        <Row term="Likely buyer" value={proposal.likelyBuyer} />
        <Row term="Risks" value={proposal.risks} />
        <Row term="Product fit" value={proposal.productFit} />
      </dl>
      <div className="rounded-[8px] border border-line bg-paper p-3 text-xs text-muted">
        <b className="text-teal">Evidence. </b>
        {proposal.evidence}
      </div>
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
            <Button disabled={decide.isPending} onClick={() => act("explore")}>Explore</Button>
            <Button variant="outline" disabled={decide.isPending} onClick={() => act("defer")}>Defer</Button>
            <Button variant="danger" disabled={decide.isPending} onClick={() => act("dismiss")}>Dismiss</Button>
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
      <dd className="m-0">{value}</dd>
    </div>
  );
}
