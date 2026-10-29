import type { ProspectingRun } from "@/lib/domain/types";
import { jevStatus } from "@/lib/domain/jev-status";

export function JevSearchStatus({ run }: { run: ProspectingRun }) {
  const j = run.progress?.jev;
  return (
    <div className="mt-3 rounded-lg border border-line px-3 py-2 text-xs">
      <p>{jevStatus(run)}</p>
      {j?.attempted ? (
        <details className="mt-2 text-muted">
          <summary className="cursor-pointer">JEV details</summary>
          <p className="mt-2">
            {j.reviewed}/{j.attempted} checks answered · {j.changed} scores or decisions changed ·{" "}
            {j.savedWithJev} saved results use JEV
          </p>
          {j.model ? <p className="mt-1">Model: {j.model}</p> : null}
          {j.errors.map((error) => (
            <p key={error} className="mt-2">
              {error}
            </p>
          ))}
        </details>
      ) : null}
    </div>
  );
}
