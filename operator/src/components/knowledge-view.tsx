import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { PageHeading, Panel, ErrorNote, WorkspaceLoadError } from "@/components/shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  mutationMessage,
  useConfirmAnswer,
  useLoadMiningSample,
  useProposeAnswer,
  useResearchQuestion,
  useStartCorrectedReview,
  useWorkspace,
} from "@/lib/workspace";
import type { KnowledgeItem } from "@/lib/domain/types";

export function KnowledgeView() {
  const { data, isPending, isError } = useWorkspace();
  if (isPending) return <p className="text-sm text-muted">Reading confirmed knowledge…</p>;
  if (isError || !data) return <WorkspaceLoadError message="Knowledge could not be loaded." />;

  const current = data.currentQuestion;

  return (
    <div className="grid gap-6">
      <PageHeading
        eyebrow="Consensus interview"
        title="Company & products"
        copy="Research first, one decision-bearing question at a time. Submit an answer, then confirm it. Confirmed knowledge is the system of record."
      />

      {data.sampleAvailable ? <SampleLoadPanel /> : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="grid gap-4">
          {current ? (
            <QuestionCard key={current.questionId} item={current} />
          ) : (
            <Panel className="p-6">
              <Badge tone="ok">Interview complete</Badge>
              <h2 className="mt-3 font-display text-2xl">Confirmed knowledge is in force.</h2>
              <p className="mt-2 max-w-xl text-sm text-muted">
                Product readiness, market discovery and prospecting read from these answers.
                Start a corrected review to propose a change. Confirmation is still required
                before anything authoritative moves.
              </p>
              <div className="mt-4">
                <Link to="/discovery">
                  <Button>Make the product ready</Button>
                </Link>
              </div>
            </Panel>
          )}
          {data.knowledge.filter((item) => item.status === "confirmed").map((item) => (
            <ConfirmedCard key={item.id} item={item} />
          ))}
        </div>

        <Panel className="h-fit p-6">
          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-teal">Scope</span>
          <h3 className="mt-2 font-display text-base">Company to offer</h3>
          <ol className="mt-4 grid gap-0">
            {data.knowledge.map((item) => (
              <li
                key={item.id}
                className="border-b border-line py-3 text-xs text-muted last:border-0"
              >
                <span className="block text-[10px] uppercase tracking-[0.12em]">{item.scope}</span>
                <b className="mt-1 block text-ink">
                  {item.confirmedAnswer ?? item.proposedAnswer ?? "Open"}
                </b>
                <span className="mt-1 inline-block">
                  <Badge tone={item.status === "confirmed" ? "ok" : item.status === "proposed" ? "warn" : "neutral"}>
                    {item.status}
                  </Badge>
                </span>
              </li>
            ))}
          </ol>
        </Panel>
      </div>
    </div>
  );
}

function SampleLoadPanel() {
  const load = useLoadMiningSample();
  return (
    <Panel className="p-6">
      <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-teal">Optional fixture</span>
      <h2 className="mt-2 font-display text-lg">Load ONE for Mining sample</h2>
      <p className="mt-2 max-w-xl text-sm text-muted">
        This loads Digitalrain fixtures so you can walk the rest of the OS.
      </p>
      <Button className="mt-4" disabled={load.isPending} onClick={() => load.mutate(undefined)}>
        {load.isPending ? "Loading sample…" : "Load ONE for Mining sample"}
      </Button>
      {load.error ? <div className="mt-3"><ErrorNote message={mutationMessage(load.error)} /></div> : null}
    </Panel>
  );
}

function QuestionCard({ item }: { item: KnowledgeItem }) {
  const [answer, setAnswer] = useState(item.proposedAnswer ?? item.recommendation);
  const propose = useProposeAnswer();
  const confirm = useConfirmAnswer();
  const research = useResearchQuestion();
  const error = propose.error ?? confirm.error ?? research.error;
  const busy = propose.isPending || confirm.isPending || research.isPending;

  useEffect(() => {
    if (item.proposedAnswer) setAnswer(item.proposedAnswer);
    else if (item.recommendation) setAnswer(item.recommendation);
  }, [item.questionId, item.proposedAnswer, item.recommendation]);

  return (
    <Panel className="p-7">
      <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-teal">
        Question {item.sortOrder} · {item.scope}
      </span>
      <h2 className="mt-3 max-w-[680px] font-display text-[28px] leading-[1.15] tracking-[-0.03em]">
        {item.question}
      </h2>
      <p className="mt-3 max-w-[700px] text-sm text-muted">{item.inference}</p>

      <div className="mt-6 grid gap-3 md:grid-cols-2">
        <div className="rounded-[10px] border border-line bg-paper p-4">
          <b className="text-[10px] font-bold uppercase tracking-[0.12em] text-teal">Evidence</b>
          <p className="mt-2 text-xs leading-5 text-muted">{item.evidence}</p>
        </div>
        <div className="rounded-[10px] border border-line bg-paper p-4">
          <b className="text-[10px] font-bold uppercase tracking-[0.12em] text-teal">Inference</b>
          <p className="mt-2 text-xs leading-5 text-muted">{item.inference}</p>
        </div>
      </div>

      <div className="mt-4 rounded-[10px] bg-green p-4 text-cream">
        <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-lime">Recommendation</span>
        <p className="mt-2 font-display text-lg leading-snug">{item.recommendation}</p>
      </div>

      {item.status !== "proposed" ? (
        <form
          className="mt-5 grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            propose.mutate({ questionId: item.questionId, answer });
          }}
        >
          <label className="grid gap-1 text-xs text-muted">
            Answer
            <textarea
              required
              minLength={2}
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              className="min-h-24 w-full rounded-[10px] border border-line bg-cream p-3 text-sm text-ink"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => research.mutate({ questionId: item.questionId })}
            >
              {research.isPending ? "Researching…" : "Research first"}
            </Button>
            <Button type="submit" disabled={busy}>
              Submit answer for confirmation
            </Button>
          </div>
        </form>
      ) : (
        <div className="mt-5 grid gap-3">
          <p className="rounded-[8px] bg-ok-bg px-3 py-2 text-xs text-teal">
            Proposed: {item.proposedAnswer}
          </p>
          <Button
            disabled={busy}
            onClick={() => confirm.mutate({ questionId: item.questionId })}
          >
            Confirm submitted answer
          </Button>
        </div>
      )}
      {error ? <div className="mt-3"><ErrorNote message={mutationMessage(error)} /></div> : null}
    </Panel>
  );
}

function ConfirmedCard({ item }: { item: KnowledgeItem }) {
  const start = useStartCorrectedReview();
  return (
    <Panel className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted">{item.scope}</span>
          <h3 className="mt-1 font-display text-lg">{item.question}</h3>
        </div>
        <Badge tone="ok">Confirmed</Badge>
      </div>
      <p className="mt-3 text-sm">{item.confirmedAnswer}</p>
      <p className="mt-2 text-xs text-muted">{item.evidence}</p>
      <Button
        variant="outline"
        className="mt-4"
        disabled={start.isPending}
        onClick={() => start.mutate({ questionId: item.questionId })}
      >
        Start corrected review
      </Button>
      {start.error ? <div className="mt-3"><ErrorNote message={mutationMessage(start.error)} /></div> : null}
    </Panel>
  );
}
