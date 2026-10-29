import { JevSearchStatus } from "@/components/jev-search-status";
import { useEffect, useState } from "react";
import type { ProspectingRun } from "@/lib/domain/types";

export function SearchMonitor({ run }: { run: ProspectingRun }) {
  const active = run.status === "running" || run.status === "queued";
  const failed = run.status === "failed";
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  const seconds = Math.max(
    0,
    Math.floor(
      ((run.finishedAt ? Date.parse(run.finishedAt) : now) - Date.parse(run.startedAt)) / 1000,
    ),
  );
  const p = run.progress;
  const steps = ["Search the web", "Check sources", "Save results"];
  const current = !p || p.stage === "searching" ? 0 : p?.stage === "checking" ? 1 : 2;
  const title = failed ? "Search stopped" : !active ? "Search complete" : steps[current];
  return (
    <section
      className={`search-monitor ${active ? "search-monitor-active" : ""}`}
      aria-label="Search progress"
    >
      <div className="flex items-center gap-4">
        <div className="search-orbit shrink-0" aria-hidden="true">
          <span>{failed ? "!" : active ? "◉" : "✓"}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
              {active ? "Live search" : "Latest search"}
            </span>
            <span className="font-mono text-xs tabular-nums text-muted" aria-label="Elapsed time">
              {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
            </span>
          </div>
          <h2 className="mt-1 font-display text-xl" role="status" aria-live="polite">
            {title}
          </h2>
        </div>
      </div>
      <ol className="mt-5 grid grid-cols-3 gap-2" aria-label="Search stages">
        {steps.map((step, i) => (
          <li
            key={step}
            className={`search-step ${(!active && !failed) || i < current ? "search-step-done" : ""} ${active && i === current ? "search-step-current" : ""}`}
            aria-current={active && i === current ? "step" : undefined}
          >
            <span className="block text-[10px] text-muted">0{i + 1}</span>
            <span className="text-xs">{step}</span>
          </li>
        ))}
      </ol>
      <div className="mt-5 grid grid-cols-3 gap-3 border-t border-line pt-4">
        <div>
          <b className="font-mono text-xl">{p?.searches ?? "—"}</b>
          <span className="mt-1 block text-xs text-muted">Web searches</span>
        </div>
        <div>
          <b className="font-mono text-xl">
            {p && p.stage !== "searching" ? `${p.checked}/${p.proposed}` : "—"}
          </b>
          <span className="mt-1 block text-xs text-muted">Sources checked</span>
        </div>
        <div>
          <b className="font-mono text-xl">{run.candidateCount}</b>
          <span className="mt-1 block text-xs text-muted">Results saved</span>
        </div>
      </div>
      {failed ? (
        <p role="alert" className="mt-4 text-sm text-red">
          {run.terminalReason}
        </p>
      ) : !active ? (
        <p className="mt-4 text-sm text-muted">
          {run.candidateCount} results · {run.qualifiedCount} match your criteria
        </p>
      ) : (
        <p className="mt-4 truncate text-xs text-muted">
          {p?.activity.at(-1) ?? "Starting search…"}
          {seconds > 45 && current === 0 ? " · Waiting for the AI provider" : ""}
        </p>
      )}
      <JevSearchStatus run={run} />
      {p?.activity.length ? (
        <details className="mt-3 border-t border-line pt-3">
          <summary className="cursor-pointer text-xs text-muted">Search activity</summary>
          <p className="mt-3 max-h-44 overflow-auto whitespace-pre-line break-words text-xs leading-relaxed text-muted">
            {p.activity.join("\n")}
          </p>
        </details>
      ) : null}
    </section>
  );
}
