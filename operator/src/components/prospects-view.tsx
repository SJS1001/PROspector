import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { PageHeading, Panel, ErrorNote, WorkspaceLoadError } from "@/components/shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  mutationMessage,
  useActivateProfile,
  useFindProspects,
  useRecordMaterialSignal,
  useReenterDueProspect,
  useWorkspace,
} from "@/lib/workspace";
import type { Prospect, ProspectState, WorkspaceDTO } from "@/lib/domain/types";

function tone(state: ProspectState) {
  if (state === "approved") return "ok" as const;
  if (state === "rejected" || state === "disqualified") return "danger" as const;
  if (state === "deferred" || state === "assessed") return "warn" as const;
  return "lime" as const;
}

export function ProspectsView() {
  const { data, isPending, isError } = useWorkspace();
  const [filter, setFilter] = useState<"all" | ProspectState>("all");
  if (isPending) return <p className="text-sm text-muted">Reading prospect workspace…</p>;
  if (isError || !data) return <WorkspaceLoadError message="Prospects could not be loaded." />;

  const rows = data.prospects.filter((item) => filter === "all" || item.state === filter);
  const live = data.prospects.filter((item) => item.origin === "run").length;

  return (
    <div className="grid gap-6">
      <PageHeading
        eyebrow="Profile effective configuration"
        title="Prospect workspace"
        copy="Activate the frozen profile, then Find Prospects. A runner may only point at public pages. Application code retrieves, tiers, and scores."
      />
      <ProfileGate data={data} />
      <RunnerRecord data={data} />
      <RunLedger data={data} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {(["all", "qualified", "assessed", "approved", "rejected", "deferred", "disqualified"] as const).map((key) => (
            <Button
              key={key}
              variant={filter === key ? "primary" : "outline"}
              onClick={() => setFilter(key)}
            >
              {key}
            </Button>
          ))}
        </div>
        <p className="text-xs text-muted">{live} from live runs · {data.prospects.length} total</p>
      </div>
      {rows.length === 0 ? (
        <Panel className="p-10 text-center text-sm text-muted">
          No prospects in this filter. Evidence appears only after a permitted run records validated observations.
        </Panel>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((item) => (
            <ProspectCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

function ProfileGate({ data }: { data: WorkspaceDTO }) {
  const activate = useActivateProfile();
  const find = useFindProspects();
  const [confirming, setConfirming] = useState<"activate" | "find" | null>(null);
  const ready = data.profile.readiness.every((item) => item.complete);
  const playReady = data.draftPlays.some((play) => play.status === "confirmed");
  const error = activate.error ?? find.error;
  const pending = activate.isPending || find.isPending;
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
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <Panel className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-teal">
              {data.profile.status === "active" ? "Active configuration" : "Profile readiness"}
            </span>
            <h2 className="mt-2 font-display text-xl">
              {data.profile.snapshot?.play || "Customer profile"}
            </h2>
            <p className="mt-1 font-mono text-[11px] text-muted">
              {data.profile.digest ?? "No configuration digest yet"}
            </p>
          </div>
          <Badge tone={data.profile.status === "active" ? "ok" : data.profile.status === "stale" ? "warn" : "neutral"}>
            {data.profile.status}
          </Badge>
        </div>
        <ol className="mt-5 grid gap-2">
          {data.profile.readiness.map((item) => (
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
        {!playReady ? (
          <p role="alert" className="mt-4 text-xs text-red">
            Confirm a Draft Market Play first. Explore does not start prospecting.
          </p>
        ) : null}
        {!ready ? (
          <p role="alert" className="mt-4 text-xs text-red">
            This profile is not ready. Confirm the required item before creating a configuration candidate.
          </p>
        ) : null}
        {data.profile.status === "stale" ? (
          <p role="alert" className="mt-4 text-xs text-amber">
            The Product, Market Play, or Offer changed. Load the current authority before continuing.
          </p>
        ) : null}

        {confirming ? (
          <div ref={confirmation} className="mt-5 rounded-[10px] border border-line bg-paper p-4">
            <p className="text-sm">
              {confirming === "activate"
                ? "Activation preserves history, queues one initial prospecting run, and starts this profile’s schedule. It does not authorize contact, spend, export, or outreach."
                : "This manual run searches public HTTPS sources in the current window, capped at four candidates. The runner cannot qualify. Application code scores after retrieval."}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                disabled={pending}
                onClick={() => {
                  if (confirming === "activate") activate.mutate(undefined);
                  else find.mutate(undefined);
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
          <div ref={opener} className="mt-5 flex flex-wrap gap-2">
            {data.profile.status !== "active" ? (
              <Button disabled={!ready || !playReady || pending} onClick={() => setConfirming("activate")}>
                Activate profile configuration
              </Button>
            ) : (
              <Button disabled={pending} onClick={() => setConfirming("find")}>
                Find Prospects
              </Button>
            )}
            {!data.interviewComplete ? (
              <Link to="/knowledge">
                <Button variant="outline">Open interview</Button>
              </Link>
            ) : null}
          </div>
        )}
        {pending ? (
          <p className="mt-3 text-xs text-muted" aria-live="polite">
            Searching public sources, then retrieving and scoring. This stays on the owner’s authority.
          </p>
        ) : null}
        {error ? <div className="mt-3"><ErrorNote message={mutationMessage(error)} /></div> : null}
      </Panel>
      <Panel className="h-fit p-6">
        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-teal">Still locked</span>
        <h3 className="mt-2 font-display text-base">After qualification</h3>
        <ul className="mt-3 grid gap-2 text-sm text-muted">
          <li>Review is a state decision only.</li>
          <li>Contacts stay hidden until approve.</li>
          <li>No paid reveal, Gmail, or CRM file.</li>
        </ul>
      </Panel>
    </div>
  );
}

function RunnerRecord({ data }: { data: WorkspaceDTO }) {
  const runner = data.runner;
  return (
    <Panel className="p-6">
      <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-teal">Untrusted runner</span>
      <h2 className="mt-2 font-display text-lg">{runner.provider} · {runner.model}</h2>
      <p className="mt-2 text-sm text-muted">{runner.assignment}</p>
      <ul className="mt-3 grid gap-1 text-xs text-muted">
        <li>Tools: {runner.tools.join(", ")}</li>
        <li>Credentials stored: {runner.credentialsStored ? "yes" : "no"}</li>
        <li>The runner proposes URLs only. Application code retrieves, tiers, and scores.</li>
      </ul>
    </Panel>
  );
}

function RunLedger({ data }: { data: WorkspaceDTO }) {
  if (data.runs.length === 0) {
    return (
      <Panel className="p-6">
        <h2 className="font-display text-lg">Run ledger</h2>
        <p className="mt-2 text-sm text-muted">
          No evidence submitted yet. Evidence appears only after a bounded run records validated observations.
        </p>
      </Panel>
    );
  }
  return (
    <Panel className="p-6">
      <h2 className="font-display text-lg">Run ledger</h2>
      <ol className="mt-4 grid gap-3">
        {data.runs.map((run) => (
          <li key={run.id} className="rounded-[10px] border border-line bg-paper p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <b className="text-sm">{run.trigger} run</b>
              <Badge tone={run.status === "succeeded" ? "ok" : run.status === "failed" ? "danger" : "warn"}>
                {run.status}
              </Badge>
            </div>
            <p className="mt-2 font-mono text-[11px] text-muted">{run.configurationDigest}</p>
            <p className="mt-2 text-xs text-muted">
              {run.candidateCount} retrieved · {run.qualifiedCount} passed
              {run.finishedAt ? ` · ${new Date(run.finishedAt).toLocaleString("en-CA")}` : ""}
            </p>
            {run.terminalReason ? <p className="mt-2 text-xs">{run.terminalReason}</p> : null}
          </li>
        ))}
      </ol>
    </Panel>
  );
}

function ProspectCard({ item }: { item: Prospect }) {
  return (
    <article className="flex flex-col rounded-[12px] border border-line bg-cream p-5">
      <div className="flex items-start justify-between gap-3">
        <Badge tone={tone(item.state)}>{item.state}</Badge>
        <span className="font-mono text-[11px] text-muted">{item.score}/10</span>
      </div>
      <h2 className="mt-4 font-display text-xl">{item.accountName}</h2>
      <p className="mt-1 text-xs text-muted">{item.targetName}</p>
      <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.12em] text-muted">
        {item.origin === "run" ? "Live retrieval" : "Seeded fixture"} · {item.outcome}
      </p>
      <p className="mt-3 flex-1 text-xs leading-5 text-muted">{item.evidenceExcerpt}</p>
      {item.lastReason ? <p className="mt-3 text-xs text-ink">Last reason: {item.lastReason}</p> : null}
      <Link
        to="/prospects/$prospectId"
        params={{ prospectId: item.id }}
        className="mt-4 inline-flex min-h-11 items-center justify-center rounded-[10px] border border-green bg-green text-sm font-semibold text-cream"
      >
        Open record
      </Link>
    </article>
  );
}

export function ProspectDetailView({ prospectId }: { prospectId: string }) {
  const { data, isPending, isError } = useWorkspace();
  const signal = useRecordMaterialSignal();
  const reenter = useReenterDueProspect();
  const [reason, setReason] = useState("");
  if (isPending) return <p className="text-sm text-muted">Reading assessment…</p>;
  if (isError || !data) return <WorkspaceLoadError message="Assessment could not be loaded." />;
  const item = data.prospects.find((row) => row.id === prospectId);
  if (!item) {
    return (
      <Panel className="p-6">
        <h1 className="font-display text-2xl">Prospect not in this workspace</h1>
        <Link to="/prospects" className="mt-4 inline-block text-sm font-semibold text-green">
          Back to prospects
        </Link>
      </Panel>
    );
  }

  const now = Date.now();
  const cooldownExpired =
    item.state === "rejected" && item.cooldownUntil != null && Date.parse(item.cooldownUntil) <= now;
  const reviewDue =
    item.state === "deferred" && item.reviewAt != null && Date.parse(item.reviewAt) <= now;
  const evidence = data.signals.filter((row) => row.prospectId === item.id);

  return (
    <div className="grid gap-6">
      <PageHeading
        eyebrow={`${item.outcome} · revision ${item.revision} · ${item.origin === "run" ? "live run" : "fixture"}`}
        title={item.accountName}
        copy={item.targetName}
        action={
          <Link to="/prospects">
            <Button variant="outline">All prospects</Button>
          </Link>
        }
      />
      <Panel className="p-6">
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone={tone(item.state)}>{item.state}</Badge>
          <Badge tone={item.outcome === "Passed" ? "ok" : "warn"}>{item.outcome}</Badge>
          <span className="font-display text-3xl">{item.score}/10</span>
        </div>
        <p className="mt-3 text-[10px] font-bold uppercase tracking-[0.14em] text-teal">
          Application-calculated qualification
        </p>
        <p className="mt-4 max-w-3xl text-sm leading-6">{item.evidenceExcerpt}</p>
        <p className="mt-3 font-mono text-[11px] text-muted">
          Tier {item.evidenceTier} · {item.evidenceDate} · {item.evidenceUrl}
        </p>
        <p className="mt-2 font-mono text-[11px] text-muted">{item.configurationDigest}</p>
        <div className="mt-6 grid gap-2 sm:grid-cols-5">
          {item.assessment.dimensions.map((dim) => (
            <div key={dim.id} className="rounded-[10px] border border-line bg-paper p-3">
              <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">{dim.label}</span>
              <b className="mt-1 block font-display text-xl">{dim.score}/{dim.max}</b>
              <p className="mt-1 text-[11px] leading-4 text-muted">{dim.note}</p>
            </div>
          ))}
        </div>
        {item.assessment.hardDisqualifier ? (
          <p className="mt-4 text-sm text-red">Hard disqualifier: {item.assessment.hardDisqualifier}</p>
        ) : (
          <p className="mt-4 text-xs text-muted">{item.assessment.passRule}</p>
        )}
      </Panel>

      <Panel className="p-6">
        <h2 className="font-display text-lg">Evidence</h2>
        {evidence.length === 0 ? (
          <p className="mt-2 text-sm text-muted">
            Seeded fixtures carry a stored excerpt. Live runs attach retrieved pages here.
          </p>
        ) : (
          <ul className="mt-4 grid gap-3">
            {evidence.map((row) => (
              <li key={row.id} className="rounded-[10px] border border-line bg-paper p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <b className="text-sm">{row.title}</b>
                  <Badge tone={row.tier === 1 ? "ok" : row.tier === 2 ? "lime" : "warn"}>Tier {row.tier}</Badge>
                </div>
                <p className="mt-2 text-xs leading-5 text-muted">{row.excerpt}</p>
                <a
                  className="mt-2 inline-flex min-h-11 items-center text-xs font-semibold text-green"
                  href={row.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open source (external)
                </a>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {(item.state === "rejected" || item.state === "deferred") && (
        <Panel className="grid gap-3 p-6">
          <h2 className="font-display text-lg">Re-entry</h2>
          <p className="text-sm text-muted">
            Rejected prospects cool for 90 days. Deferred prospects return on the review date.
            A material signal can re-enter either path immediately.
          </p>
          {item.cooldownUntil ? (
            <p className="text-xs text-muted">Cooldown until {new Date(item.cooldownUntil).toLocaleString("en-CA")}</p>
          ) : null}
          {item.reviewAt ? (
            <p className="text-xs text-muted">Review date {new Date(item.reviewAt).toLocaleDateString("en-CA")}</p>
          ) : null}
          <label className="grid gap-1 text-xs text-muted">
            Material signal
            <input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className="min-h-11 rounded-[10px] border border-line px-3 text-sm text-ink"
              placeholder="What changed?"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={signal.isPending}
              onClick={() =>
                signal.mutate({
                  prospectId: item.id,
                  expectedRevision: item.revision,
                  reason,
                })
              }
            >
              Record material signal
            </Button>
            <Button
              variant="outline"
              disabled={reenter.isPending || (!cooldownExpired && !reviewDue && !item.materialSignal)}
              onClick={() =>
                reenter.mutate({ prospectId: item.id, expectedRevision: item.revision })
              }
            >
              Re-enter because the date is due
            </Button>
          </div>
          {signal.error ? <ErrorNote message={mutationMessage(signal.error)} /> : null}
          {reenter.error ? <ErrorNote message={mutationMessage(reenter.error)} /> : null}
        </Panel>
      )}
    </div>
  );
}
