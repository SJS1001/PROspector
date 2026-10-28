import { useEffect, useRef, useState } from "react";
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
  const saved = data.knowledge.filter((item) => item.confirmedAnswer);
  const find = (id: string) => saved.find((item) => item.questionId === id);
  const company = find("company.legal_name");
  const product = find("product.name");
  const capability = find("product.capability");
  const delivery = find("product.delivery");
  const groups = [
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
        eyebrow="Your business"
        title="Company & product"
        copy={
          current
            ? "Answer one question, then review and confirm it."
            : "Your saved business details. Open a section to review or update it."
        }
        action={
          !current ? (
            <Link to="/discovery">
              <Button>Review target markets</Button>
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
          <div className="min-w-0">
            <p className="text-xs text-muted">Company</p>
            <h2 className="mt-1 break-words text-lg font-medium">{company.confirmedAnswer}</h2>
          </div>
          <div className="flex items-center gap-3">
            <Badge tone="ok">Saved</Badge>
            <EditAnswer item={company} label="Edit company" />
          </div>
        </Panel>
      ) : null}
      {product || capability || delivery ? (
        <Panel className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs text-muted">Product</p>
              <h2 className="mt-1 break-words text-xl font-medium">
                {product?.confirmedAnswer ?? "Your product"}
              </h2>
            </div>
            {product ? <EditAnswer item={product} label="Edit product name" /> : null}
          </div>
          <div className="mt-4 grid gap-5 md:grid-cols-2">
            {capability ? <SummaryAnswer item={capability} label="What it does" /> : null}
            {delivery ? <SummaryAnswer item={delivery} label="Offer & delivery" /> : null}
          </div>
        </Panel>
      ) : null}
      {groups.map((group) => {
        const items = saved.filter((item) => group.ids.includes(item.questionId));
        if (!items.length) return null;
        return (
          <details key={group.title} className="rounded-md border border-line bg-cream">
            <summary className="cursor-pointer px-5 py-4 text-sm font-medium">
              {group.title}
              <span className="ml-2 text-xs font-normal text-muted">{items.length} saved</span>
            </summary>
            <div className="grid gap-3 border-t border-line p-4">
              {items.map((item) => (
                <ConfirmedCard key={item.id} item={item} />
              ))}
            </div>
          </details>
        );
      })}
    </div>
  );
}

function SummaryAnswer({ item, label }: { item: KnowledgeItem; label: string }) {
  return (
    <div className="min-w-0">
      <h3 className="text-xs font-medium text-muted">{label}</h3>
      <p className="mt-2 line-clamp-3 break-words text-sm leading-6">{item.confirmedAnswer}</p>
      <details className="mt-2 text-xs">
        <summary className="cursor-pointer text-muted">Full answer & evidence</summary>
        <p className="mt-3 whitespace-pre-wrap break-words text-sm">{item.confirmedAnswer}</p>
        <p className="mt-2 text-muted">{item.evidence}</p>
      </details>
      <div className="mt-3">
        <EditAnswer item={item} label={`Edit ${label.toLowerCase()}`} />
      </div>
    </div>
  );
}

function EditAnswer({
  item,
  label = "Start corrected review",
}: {
  item: KnowledgeItem;
  label?: string;
}) {
  const start = useStartCorrectedReview();
  return (
    <div>
      <Button
        variant="outline"
        disabled={start.isPending}
        onClick={() => start.mutate({ questionId: item.questionId })}
      >
        {start.isPending ? "Opening…" : label}
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
        Optional fixture
      </span>
      <h2 className="mt-2 font-display text-lg">Load ONE for Mining sample</h2>
      <p className="mt-2 max-w-xl text-sm text-muted">
        This loads Digitalrain fixtures so you can walk the rest of the OS.
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
    item.proposedAnswer ?? item.confirmedAnswer ?? item.recommendation,
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
    else setAnswer(item.confirmedAnswer ?? item.recommendation);
  }, [item.questionId, item.proposedAnswer, item.confirmedAnswer, item.recommendation]);

  return (
    <Panel className="p-5">
      <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-teal">
        Question {item.sortOrder} · {item.scope}
      </span>
      <h2
        ref={heading}
        tabIndex={-1}
        className="mt-3 max-w-[680px] text-xl font-medium leading-snug"
      >
        {item.question}
      </h2>
      <details className="mt-4 rounded-md border border-line p-3 text-sm">
        <summary className="cursor-pointer text-muted">Research & suggested answer</summary>
        <div className="mt-3 grid gap-3">
          <div>
            <b className="text-xs">Evidence</b>
            <p className="mt-1 text-xs text-muted">{item.evidence}</p>
          </div>
          <div>
            <b className="text-xs">Assessment</b>
            <p className="mt-1 text-xs text-muted">{item.inference}</p>
          </div>
          <div>
            <b className="text-xs">Suggested answer</b>
            <p className="mt-1 text-sm">{item.recommendation}</p>
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
              Submit answer for confirmation
            </Button>
          </div>
        </form>
      ) : (
        <div className="mt-5 grid gap-3">
          <p className="rounded-[8px] bg-ok-bg px-3 py-2 text-xs text-teal">
            Proposed: {item.proposedAnswer}
          </p>
          <Button disabled={busy} onClick={() => confirm.mutate({ questionId: item.questionId })}>
            Confirm submitted answer
          </Button>
          <Button variant="outline" disabled={busy} onClick={() => setEditing(true)}>
            Edit submitted answer
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
      <h3 className="text-sm font-medium">{item.question}</h3>
      <p className="mt-2 whitespace-pre-wrap break-words text-sm">{item.confirmedAnswer}</p>
      <details className="mt-2 text-xs text-muted">
        <summary className="cursor-pointer">Evidence</summary>
        <p className="mt-2">{item.evidence}</p>
      </details>
      <div className="mt-3">
        <EditAnswer item={item} />
      </div>
    </div>
  );
}
