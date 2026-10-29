import { JevSearchStatus } from "@/components/jev-search-status";
import { OpportunitySummary } from "./opportunity-summary";
import { SearchMonitor } from "@/components/search-monitor";
import { useQueryClient } from "@tanstack/react-query";
import { workspaceKey } from "@/lib/workspace";
import { sourceLabel, uiLabel, uiText } from "@/lib/domain/plain-language";
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
  if (isPending) return <p className="text-sm text-muted">Loading prospects…</p>;
  if (isError || !data) return <WorkspaceLoadError message="Prospects could not be loaded." />;

  const rows = data.prospects
    .filter((item) => filter === "all" || item.state === filter)
    .sort((a, b) => Number(b.origin === "run") - Number(a.origin === "run"));
  const live = data.prospects.filter((item) => item.origin === "run").length;

  return (
    <div className="grid gap-6">
      <PageHeading title="Searches & prospects" />
      <ProfileGate data={data} />
      {data.runs[0] ? <SearchMonitor run={data.runs[0]} /> : null}
      {data.prospects.some((item) => item.state === "qualified" && item.outcome === "Passed") ? (
        <Link
          to="/review"
          className="inline-flex min-h-11 items-center text-sm font-semibold text-teal"
        >
          Review qualified prospects →
        </Link>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {(
            [
              "all",
              "qualified",
              "assessed",
              "approved",
              "rejected",
              "deferred",
              "disqualified",
            ] as const
          ).map((key) => (
            <Button
              key={key}
              variant={filter === key ? "primary" : "outline"}
              onClick={() => setFilter(key)}
            >
              {uiLabel(key)}
            </Button>
          ))}
        </div>
        <p className="text-xs text-muted">
          {live} from searches · {data.prospects.length} total
        </p>
      </div>
      {rows.length === 0 ? (
        <Panel className="p-10 text-center text-sm text-muted">No prospects in this filter.</Panel>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((item) => (
            <ProspectCard key={item.id} item={item} />
          ))}
        </div>
      )}
      <details className="rounded-[12px] border border-line bg-cream p-5">
        <summary className="cursor-pointer text-sm font-medium">Search details</summary>
        <div className="mt-4 grid gap-3">
          <RunLedger data={data} />
          <RunnerRecord data={data} />
        </div>
      </details>
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
  const busy =
    pending || data.runs.some((run) => run.status === "running" || run.status === "queued");
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(
      () => void queryClient.invalidateQueries({ queryKey: workspaceKey }),
      1500,
    );
    return () => clearInterval(timer);
  }, [pending, queryClient]);
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
    <div className="grid gap-4">
      <Panel className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-xl">
              {data.profile.snapshot?.play || "Search settings"}
            </h2>
          </div>
          <Badge
            tone={
              data.profile.status === "active"
                ? "ok"
                : data.profile.status === "stale"
                  ? "warn"
                  : "neutral"
            }
          >
            {uiLabel(data.profile.status)}
          </Badge>
        </div>
        <details className="mt-4" open={!ready}>
          <summary className="cursor-pointer text-sm font-semibold focus-visible:outline-2 focus-visible:outline-teal">
            Search readiness · {data.profile.readiness.filter((item) => item.complete).length}/
            {data.profile.readiness.length} complete
          </summary>
          <ol className="mt-3 grid gap-2">
            {data.profile.readiness.map((item) => (
              <li
                key={item.id}
                className="flex items-start justify-between gap-3 border-b border-line py-2 last:border-0"
              >
                <div>
                  <b className="block text-sm">{uiText(item.label)}</b>
                  <span className="text-xs text-muted">
                    {item.id === "rubric" ? uiText(item.summary) : item.summary}
                  </span>
                </div>
                <Badge tone={item.complete ? "ok" : "warn"}>
                  {item.complete ? "Complete" : "Needs confirmation"}
                </Badge>
              </li>
            ))}
          </ol>
          <p className="mt-3 break-all font-mono text-[11px] text-muted">
            {data.profile.digest ?? "No saved version yet"}
          </p>
        </details>
        {!playReady ? (
          <p role="alert" className="mt-4 text-xs text-red">
            Confirm a target market first.
          </p>
        ) : null}
        {!ready ? (
          <p role="alert" className="mt-4 text-xs text-red">
            Complete the missing search settings first.
          </p>
        ) : null}
        {data.profile.status === "stale" ? (
          <p role="alert" className="mt-4 text-xs text-amber">
            Your product, market or offer changed. Confirm the updated search settings to continue.
          </p>
        ) : null}

        {confirming ? (
          <div ref={confirmation} className="mt-5 rounded-[10px] border border-line bg-paper p-4">
            <p className="text-sm">
              {confirming === "activate"
                ? "Save these settings and start a prospect search? This also enables the search schedule. Your connected AI service may charge for searches. Nothing is sent to prospects."
                : `Search public sources for up to ${data.connections.huntBatch} prospects using your connected AI service? Results are scored for you to review.`}
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
              <Button
                disabled={!ready || !playReady || busy}
                onClick={() => setConfirming("activate")}
              >
                Confirm settings & start searches
              </Button>
            ) : (
              <Button disabled={busy} onClick={() => setConfirming("find")}>
                Find Prospects
              </Button>
            )}
            {!data.interviewComplete ? (
              <Link to="/knowledge">
                <Button variant="outline">Company details</Button>
              </Link>
            ) : null}
          </div>
        )}
        {pending ? (
          <p className="mt-3 text-xs text-muted" aria-live="polite">
            Searching public sources…
          </p>
        ) : null}
        {error ? (
          <div className="mt-3">
            <ErrorNote message={mutationMessage(error)} />
          </div>
        ) : null}
      </Panel>
    </div>
  );
}

function RunnerRecord({ data }: { data: WorkspaceDTO }) {
  const runner = data.runner;
  return (
    <Panel className="p-6">
      <details>
        <summary className="cursor-pointer text-sm font-semibold focus-visible:outline-2 focus-visible:outline-teal">
          Search provider
        </summary>
        <h2 className="mt-2 font-display text-lg">
          {runner.provider} · {runner.model}
        </h2>
        <p className="mt-2 text-sm text-muted">{uiText(runner.assignment)}</p>
        <ul className="mt-3 grid gap-1 text-xs text-muted">
          <li>Tools: {runner.tools.join(", ")}</li>
          <li>API key saved: {runner.credentialsStored ? "yes" : "no"}</li>
          <li>AI suggests pages. The app checks their sources and scores the results.</li>
        </ul>
      </details>
    </Panel>
  );
}

function RunLedger({ data }: { data: WorkspaceDTO }) {
  if (data.runs.length === 0) {
    return (
      <Panel className="p-6">
        <details open={data.runs.some((run) => run.status !== "succeeded")}>
          <summary className="cursor-pointer text-sm font-semibold focus-visible:outline-2 focus-visible:outline-teal">
            Search history · {data.runs.length} runs
          </summary>
          <p className="mt-2 text-sm text-muted">No searches yet.</p>
        </details>
      </Panel>
    );
  }
  return (
    <Panel className="p-6">
      <details open={data.runs.some((run) => run.status !== "succeeded")}>
        <summary className="cursor-pointer text-sm font-semibold focus-visible:outline-2 focus-visible:outline-teal">
          Search history · {data.runs.length} runs
        </summary>
        <ol className="mt-4 grid gap-3">
          {data.runs.map((run) => (
            <li key={run.id} className="rounded-[10px] border border-line bg-paper p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <b className="text-sm">{uiLabel(run.trigger)}</b>
                <Badge
                  tone={
                    run.status === "succeeded" ? "ok" : run.status === "failed" ? "danger" : "warn"
                  }
                >
                  {uiLabel(run.status)}
                </Badge>
              </div>
              <p className="mt-2 break-all font-mono text-[11px] text-muted">
                {run.configurationDigest}
              </p>
              <p className="mt-2 text-xs text-muted">
                {run.candidateCount} found · {run.qualifiedCount} match your criteria
                {run.finishedAt ? ` · ${new Date(run.finishedAt).toLocaleString("en-CA")}` : ""}
              </p>
              <JevSearchStatus run={run} />
              {run.terminalReason ? (
                <p className="mt-2 text-xs">{uiText(run.terminalReason)}</p>
              ) : null}
            </li>
          ))}
        </ol>
      </details>
    </Panel>
  );
}

function ProspectCard({ item }: { item: Prospect }) {
  return (
    <article className="flex flex-col rounded-[12px] border border-line bg-cream p-5">
      <div className="flex items-start justify-between gap-3">
        <Badge tone={tone(item.state)}>{uiLabel(item.state)}</Badge>
        <span className="text-xs text-muted">
          {item.assessment.opportunity?.problem ? "Possible need" : "Need not confirmed"}
        </span>
      </div>
      <h2 className="mt-4 font-display text-xl">{item.accountName}</h2>
      <p className="mt-2 text-sm leading-6 text-muted">
        {item.assessment.opportunity?.problem?.text ??
          item.assessment.opportunity?.situation.text ??
          "Open to check the source and possible fit."}
      </p>
      <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.12em] text-muted">
        {item.origin === "run" ? "Search result" : "Sample data"} · {uiLabel(item.outcome)}
      </p>
      <p className="mt-2 text-xs text-muted">
        {sourceLabel(item.evidenceTier)} · {item.evidenceDate}
      </p>
      {item.assessment.hardDisqualifier ? (
        <p className="mt-2 text-xs text-red">{item.assessment.hardDisqualifier}</p>
      ) : null}
      {item.lastReason ? (
        <p className="mt-3 text-xs text-ink">Last reason: {item.lastReason}</p>
      ) : null}
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
    item.state === "rejected" &&
    item.cooldownUntil != null &&
    Date.parse(item.cooldownUntil) <= now;
  const reviewDue =
    item.state === "deferred" && item.reviewAt != null && Date.parse(item.reviewAt) <= now;
  const evidence = data.signals.filter((row) => row.prospectId === item.id);

  return (
    <div className="grid gap-6">
      <PageHeading
        eyebrow={item.origin === "run" ? "Search result" : "Sample data"}
        title={item.accountName}
        action={
          <Link to="/prospects">
            <Button variant="outline">All prospects</Button>
          </Link>
        }
      />
      <OpportunitySummary item={item} />
      <Panel className="p-6">
        <h2 className="font-display text-lg">Sources</h2>
        <ul className="mt-4 grid gap-4">
          {(item.assessment.opportunity
            ? [
                {
                  id: "brief-source",
                  url: item.assessment.opportunity.sourceUrl,
                  title: item.assessment.opportunity.sourceTitle,
                  excerpt:
                    item.assessment.opportunity.problem?.text ??
                    item.assessment.opportunity.situation.text,
                  retrievedAt: item.assessment.opportunity.checkedAt,
                },
                ...evidence.filter(
                  (row) =>
                    row.url !== item.evidenceUrl &&
                    row.url !== item.assessment.opportunity?.sourceUrl,
                ),
              ]
            : evidence.length
              ? evidence
              : [
                  {
                    id: "assessment-source",
                    url: item.evidenceUrl,
                    title: "Original source",
                    excerpt: "",
                    retrievedAt: item.evidenceDate,
                  },
                ]
          ).map((row) => (
            <li key={row.id} className="rounded-[10px] border border-line bg-paper p-4">
              {/^https:\/\//i.test(row.url) ? (
                <a
                  className="font-semibold text-sm text-green underline underline-offset-4 break-words"
                  href={row.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  {row.title} ↗
                </a>
              ) : (
                <b className="text-sm">{row.title}</b>
              )}
              <p className="mt-2 text-sm leading-6 text-muted">
                {row.id === "brief-source"
                  ? row.excerpt
                  : "Source saved with this result; relevance has not yet been summarized."}
              </p>
              <p className="mt-2 text-xs text-muted">
                {row.id === "brief-source" && item.assessment.opportunity?.publishedOn
                  ? `Published ${item.assessment.opportunity.publishedOn} · `
                  : ""}
                Checked {row.retrievedAt.slice(0, 10)}
              </p>
              {row.id === "brief-source" && item.assessment.opportunity ? (
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs font-semibold">
                    Supporting passages
                  </summary>
                  {[
                    ...new Set(
                      [
                        item.assessment.opportunity.company.quote,
                        item.assessment.opportunity.situation.quote,
                        item.assessment.opportunity.problem?.quote,
                      ].filter(Boolean),
                    ),
                  ].map((quote) => (
                    <blockquote
                      key={quote}
                      className="mt-3 border-l-2 border-line pl-3 text-xs leading-5 text-muted"
                    >
                      “{quote}”
                    </blockquote>
                  ))}
                </details>
              ) : null}
            </li>
          ))}
        </ul>
      </Panel>
      <Panel className="p-6">
        <details>
          <summary className="cursor-pointer text-sm font-semibold focus-visible:outline-2 focus-visible:outline-teal">
            Assessment details · {uiLabel(item.outcome)}
          </summary>
          <p className="mt-3 text-sm">
            {item.score}/10 · Research score, not proof of buying intent
          </p>
          <p className="mt-2 text-xs text-muted">{uiText(item.assessment.passRule)}</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-5">
            {item.assessment.dimensions.map((dim) => (
              <div key={dim.id} className="rounded-[10px] border border-line bg-paper p-3">
                <span className="text-xs text-muted">{uiText(dim.label)}</span>
                <b className="mt-1 block">
                  {dim.score}/{dim.max}
                </b>
                <p className="mt-1 text-xs leading-5 text-muted">{uiText(dim.note)}</p>
              </div>
            ))}
          </div>
          {item.assessment.hardDisqualifier ? (
            <p className="mt-4 text-sm text-red">
              Reason to exclude: {item.assessment.hardDisqualifier}
            </p>
          ) : null}
        </details>
      </Panel>

      {(item.state === "rejected" || item.state === "deferred") && (
        <Panel className="grid gap-3 p-6">
          <h2 className="font-display text-lg">Review again</h2>
          <p className="text-sm text-muted">
            Review a rejected prospect after 90 days, or a saved prospect on its review date. If
            something important changed, record it below to review sooner.
          </p>
          {item.cooldownUntil ? (
            <p className="text-xs text-muted">
              Can review again on {new Date(item.cooldownUntil).toLocaleString("en-CA")}
            </p>
          ) : null}
          {item.reviewAt ? (
            <p className="text-xs text-muted">
              Review date {new Date(item.reviewAt).toLocaleDateString("en-CA")}
            </p>
          ) : null}
          <label className="grid gap-1 text-xs text-muted">
            What changed?
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
              Record change & review again
            </Button>
            <Button
              variant="outline"
              disabled={
                reenter.isPending || (!cooldownExpired && !reviewDue && !item.materialSignal)
              }
              onClick={() =>
                reenter.mutate({ prospectId: item.id, expectedRevision: item.revision })
              }
            >
              Return to review
            </Button>
          </div>
          {signal.error ? <ErrorNote message={mutationMessage(signal.error)} /> : null}
          {reenter.error ? <ErrorNote message={mutationMessage(reenter.error)} /> : null}
        </Panel>
      )}
    </div>
  );
}
