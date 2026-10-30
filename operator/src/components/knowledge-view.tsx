import { uiLabel, uiText } from "@/lib/domain/plain-language";
import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { PageHeading, Panel, ErrorNote, WorkspaceLoadError } from "@/components/shell";
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
  if (isPending) return <p className="text-sm text-muted">Loading company details…</p>;
  if (isError || !data)
    return <WorkspaceLoadError message="Company details could not be loaded." />;

  const current = data.currentQuestion;
  const saved = data.knowledge.filter((item) => item.confirmedAnswer);
  const find = (id: string) => saved.find((item) => item.questionId === id);
  const company = find("company.legal_name");
  const product = find("product.name");
  const capability = find("product.capability");
  const delivery = find("product.delivery");
  const groups = [
    {
      title: "Full answers & evidence",
      ids: ["company.legal_name", "product.name", "product.capability", "product.delivery"],
    },
    { title: "Product limits & permitted claims", ids: ["product.limitations", "product.promise"] },
    {
      title: "Evidence & delivery details",
      ids: ["product.proof", "product.ownership", "product.runner"],
    },
    {
      title: "Target market & search preferences",
      ids: data.knowledge
        .filter((item) => item.scope === "play" || item.scope === "profile")
        .map((item) => item.questionId),
    },
  ];

  return (
    <div className="grid gap-4">
      <PageHeading
        title="Company & product"
        action={
          !current ? (
            <Link to="/discovery" className="action-link">
              Target markets <span aria-hidden="true">→</span>
            </Link>
          ) : undefined
        }
      />
      {data.sampleAvailable ? <SampleLoadPanel /> : null}
      {current ? (
        <div className="grid gap-3">
          <p className="text-xs text-muted">
            {data.knowledge.filter((item) => item.status === "confirmed").length} of{" "}
            {data.knowledge.length} answers confirmed
            {current.confirmedAnswer ? " · Reviewing a change" : ""}
          </p>
          <QuestionCard key={current.questionId} item={current} />
        </div>
      ) : null}
      {company ? (
        <Panel className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <h2 className="min-w-0 break-words text-lg font-medium">{company.confirmedAnswer}</h2>
          <EditAnswer item={company} label="Edit company" />
        </Panel>
      ) : null}
      {product || capability || delivery ? (
        <Panel className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="min-w-0 break-words text-xl font-medium">
              {product?.confirmedAnswer ?? "Your product"}
            </h2>
            {product ? <EditAnswer item={product} label="Edit product name" /> : null}
          </div>
          <div className="mt-4 grid gap-5 md:grid-cols-2">
            {capability ? <SummaryAnswer item={capability} label="What it does" /> : null}
            {delivery ? <SummaryAnswer item={delivery} label="Offer" /> : null}
          </div>
        </Panel>
      ) : null}
      {saved.length ? (
        <details className="rounded-md border border-line bg-cream">
          <summary className="cursor-pointer px-5 py-4 text-sm font-medium">Details</summary>
          <div className="grid gap-3 border-t border-line p-4">
            {groups.map((group) => {
              const items = saved.filter((item) => group.ids.includes(item.questionId));
              if (!items.length) return null;
              return (
                <details key={group.title} className="rounded-md border border-line">
                  <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
                    {group.title}
                  </summary>
                  <div className="grid gap-3 border-t border-line p-3">
                    {items.map((item) => (
                      <ConfirmedCard key={item.id} item={item} />
                    ))}
                  </div>
                </details>
              );
            })}
          </div>
        </details>
      ) : null}
    </div>
  );
}

function SummaryAnswer({ item, label }: { item: KnowledgeItem; label: string }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xs font-medium text-muted">{label}</h3>
        <EditAnswer item={item} label={`Edit ${label.toLowerCase()}`} />
      </div>
      <p className="mt-2 line-clamp-3 break-words text-sm leading-6">{item.confirmedAnswer}</p>
    </div>
  );
}

function EditAnswer({
  item,
  label = `Edit ${uiText(item.question)}`,
}: {
  item: KnowledgeItem;
  label?: string;
}) {
  const start = useStartCorrectedReview();
  return (
    <div>
      <Button
        variant="outline"
        aria-label={label}
        disabled={start.isPending}
        onClick={() => start.mutate({ questionId: item.questionId })}
      >
        {start.isPending ? "Opening…" : "Edit"}
      </Button>
      {start.error ? (
        <div className="mt-3">
          <ErrorNote message={mutationMessage(start.error)} />
        </div>
      ) : null}
    </div>
  );
}

function SampleLoadPanel() {
  const load = useLoadMiningSample();
  return (
    <Panel className="p-6">
      <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-teal">
        Sample data
      </span>
      <h2 className="mt-2 font-display text-lg">Load ONE for Mining sample</h2>
      <p className="mt-2 max-w-xl text-sm text-muted">
        Adds sample company and product answers so you can try the app.
      </p>
      <Button className="mt-4" disabled={load.isPending} onClick={() => load.mutate(undefined)}>
        {load.isPending ? "Loading sample…" : "Load ONE for Mining sample"}
      </Button>
      {load.error ? (
        <div className="mt-3">
          <ErrorNote message={mutationMessage(load.error)} />
        </div>
      ) : null}
    </Panel>
  );
}

function QuestionCard({ item }: { item: KnowledgeItem }) {
  const [editing, setEditing] = useState(
    Boolean(item.confirmedAnswer) && item.proposedAnswer === item.confirmedAnswer,
  );
  const [answer, setAnswer] = useState(
    item.proposedAnswer ?? item.confirmedAnswer ?? uiText(item.recommendation),
  );
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  const propose = useProposeAnswer();
  const confirm = useConfirmAnswer();
  const research = useResearchQuestion();
  const error = propose.error ?? confirm.error ?? research.error;
  const busy = propose.isPending || confirm.isPending || research.isPending;

  useEffect(() => {
    if (item.proposedAnswer) setAnswer(item.proposedAnswer);
    else setAnswer(item.confirmedAnswer ?? uiText(item.recommendation));
  }, [item.questionId, item.proposedAnswer, item.confirmedAnswer, item.recommendation]);

  return (
    <Panel className="p-5">
      <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-teal">
        Question {item.sortOrder} · {uiLabel(item.scope)}
      </span>
      <h2
        ref={heading}
        tabIndex={-1}
        className="mt-3 max-w-[680px] text-xl font-medium leading-snug"
      >
        {uiText(item.question)}
      </h2>
      <details className="mt-4 rounded-md border border-line p-3 text-sm">
        <summary className="cursor-pointer text-muted">Research & suggested answer</summary>
        <div className="mt-3 grid gap-3">
          <div>
            <b className="text-xs">Evidence</b>
            <p className="mt-1 text-xs text-muted">{uiText(item.evidence)}</p>
          </div>
          <div>
            <b className="text-xs">Assessment</b>
            <p className="mt-1 text-xs text-muted">{uiText(item.inference)}</p>
          </div>
          <div>
            <b className="text-xs">Suggested answer</b>
            <p className="mt-1 text-sm">{uiText(item.recommendation)}</p>
          </div>
        </div>
      </details>

      {item.status !== "proposed" || editing ? (
        <form
          className="mt-5 grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            propose.mutate(
              { questionId: item.questionId, answer },
              { onSuccess: () => setEditing(false) },
            );
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
              Review answer
            </Button>
          </div>
        </form>
      ) : (
        <div className="mt-5 grid gap-3">
          <p className="rounded-[8px] bg-ok-bg px-3 py-2 text-xs text-teal">
            Your answer: {item.proposedAnswer}
          </p>
          <Button disabled={busy} onClick={() => confirm.mutate({ questionId: item.questionId })}>
            Confirm answer
          </Button>
          <Button variant="outline" disabled={busy} onClick={() => setEditing(true)}>
            Edit answer
          </Button>
        </div>
      )}
      {error ? (
        <div className="mt-3">
          <ErrorNote message={mutationMessage(error)} />
        </div>
      ) : null}
    </Panel>
  );
}

function ConfirmedCard({ item }: { item: KnowledgeItem }) {
  return (
    <div className="rounded-md border border-line p-4">
      <h3 className="text-sm font-medium">{uiText(item.question)}</h3>
      <p className="mt-2 whitespace-pre-wrap break-words text-sm">{item.confirmedAnswer}</p>
      <details className="mt-2 text-xs text-muted">
        <summary className="cursor-pointer">Evidence</summary>
        <p className="mt-2">{uiText(item.evidence)}</p>
      </details>
      <div className="mt-3">
        <EditAnswer item={item} />
      </div>
    </div>
  );
}
