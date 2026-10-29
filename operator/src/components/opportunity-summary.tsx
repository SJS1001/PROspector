import { Panel, ErrorNote } from "./shell";
import { Button } from "./ui/button";
import { useExplainProspect, mutationMessage } from "@/lib/workspace";
import type { Prospect } from "@/lib/domain/types";

export function OpportunitySummary({ item }: { item: Prospect }) {
  const explain = useExplainProspect();
  const brief = item.assessment.opportunity;
  return (
    <Panel className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl">The opportunity</h2>
        <span className="text-xs text-muted">
          {brief?.problem
            ? "Possible need · verify with the company"
            : "Customer need not yet confirmed"}
        </span>
      </div>
      {brief ? (
        <dl className="mt-5 grid gap-5 sm:grid-cols-2">
          <Entry title="What they do" text={brief.company.text} />
          <Entry title="What’s happening" text={brief.situation.text} />
          <Entry
            title="Their problem"
            text={brief.problem?.text ?? "The source does not establish an unresolved problem."}
          />
          <Entry title={`Where ${brief.product} could help`} text={brief.possibleFit} />
          <div className="sm:col-span-2 rounded-[10px] border border-line bg-paper p-4">
            <Entry title="What to find out next" text={brief.nextQuestion} />
          </div>
        </dl>
      ) : (
        <p className="mt-4 text-sm text-muted">
          {item.origin === "run"
            ? "This result needs a source-based explanation before you can judge the fit."
            : "Sample prospect. Run a search to find real opportunities."}
        </p>
      )}
      {item.origin === "run" && !brief ? (
        <Button
          className="mt-4"
          disabled={explain.isPending}
          onClick={() => explain.mutate({ prospectId: item.id, expectedRevision: item.revision })}
        >
          {explain.isPending ? "Reading source…" : "Explain this opportunity"}
        </Button>
      ) : null}
      {explain.isPending ? (
        <p role="status" className="mt-3 text-xs text-muted">
          Checking the source and comparing it with your product…
        </p>
      ) : null}
      {explain.error ? <ErrorNote message={mutationMessage(explain.error)} /> : null}
    </Panel>
  );
}

function Entry({ title, text }: { title: string; text: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold text-muted">{title}</dt>
      <dd className="mt-1 text-sm leading-6">{text}</dd>
    </div>
  );
}
