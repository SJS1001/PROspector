"use client";

import { useEffect, useRef, useState } from "react";
import type { CommercialHierarchyNode } from "../../domain/commercial-model";
import type { InterviewDestination, InterviewState } from "../../domain/interview";
import {
  CommercialDestinationSelect,
  resolveProjectedCommercialDestination,
  selectedCommercialDestination,
  type ExactCommercialDestination,
} from "./commercial-destination-select";

type QuestionProjection = Extract<InterviewState, { status: "active" }>["question"];
export type InterviewAnswerCommand = { questionId: string; expectedRevision: number; answer: "use_recommendation" | "write_correction" | "change_scope"; value?: string; reason?: string; destination?: InterviewDestination; operationKey: string };
export type InterviewDecisionCommand = { answerId: string; expectedSessionRevision: number; expectedQuestionRevision: number; decision: "accept" | "reject" | "correct" | "rescope"; value?: string; reason?: string; destination?: InterviewDestination; operationKey: string };
const NO_DESTINATIONS: readonly CommercialHierarchyNode[] = [];

export function ConsensusInterviewView({
  state,
  destinations = NO_DESTINATIONS,
  answerOperationKey,
  decisionOperationKey,
  onSubmitAnswer,
  onRecordDecision,
  pendingAction,
  issue,
}: {
  state: InterviewState;
  destinations?: readonly CommercialHierarchyNode[];
  answerOperationKey: string;
  decisionOperationKey: string;
  onSubmitAnswer(command: InterviewAnswerCommand): void;
  onRecordDecision(command: InterviewDecisionCommand): void;
  pendingAction?: string | null;
  issue?: "stale" | "other_tab" | "superseded" | "network_unknown" | "malformed" | null;
}) {
  const confirmationHeading = useRef<HTMLHeadingElement>(null);
  const [answer, setAnswer] = useState<InterviewAnswerCommand["answer"]>("use_recommendation");
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const [destinationId, setDestinationId] = useState("");
  const [decision, setDecision] = useState<InterviewDecisionCommand["decision"] | null>(null);

  useEffect(() => {
    if (state.status === "awaiting_confirmation") confirmationHeading.current?.focus();
  }, [state.status]);

  if (issue) return <section className="error-state" role="alert"><h2>Current authority needs checking</h2><p>{issueCopy(issue)} Use the working “Load current version” control above this view.</p></section>;
  if (state.status === "uninitialized") return <section className="panel"><h2>Interview unavailable</h2><p>Initialize the admitted commercial workspace before reviewing authority.</p></section>;
  if (state.status === "review_required") return <section className="panel" role="alert"><h2>Review required</h2><p>An earlier decision has no complete immutable snapshot. It is read-only until the workspace provides a replacement review.</p></section>;
  if (state.status === "confirmed") return <section className="panel" aria-live="polite"><h2>Confirmed result</h2><p>Authoritative result recorded. No operational effect has been enabled.</p><dl className="confirmation-proof"><div><dt>Knowledge Version</dt><dd>{state.confirmed.knowledgeVersionId}</dd></div><div><dt>Audit reference</dt><dd>{state.confirmed.auditEventId}</dd></div><div><dt>Confirmed (Toronto)</dt><dd>{toronto(state.confirmed.confirmedAt)}</dd></div></dl></section>;

  const projectedDestination = resolveProjectedCommercialDestination(destinations, state.question.destination);
  if (!projectedDestination) return <section className="error-state" role="alert"><h2>Question authority could not be verified</h2><p>The projected question destination does not match the authorized commercial hierarchy. Answer and decision controls are unavailable. Load the current version.</p></section>;

  if (state.status === "active") {
    return <ActiveQuestion
      state={state}
      destinations={destinations}
      projectedDestination={projectedDestination}
      destinationId={destinationId}
      setDestinationId={setDestinationId}
      answer={answer}
      setAnswer={setAnswer}
      value={value}
      setValue={setValue}
      reason={reason}
      setReason={setReason}
      operationKey={answerOperationKey}
      pendingAction={pendingAction}
      onSubmitAnswer={onSubmitAnswer}
    />;
  }

  const selectedDestination = selectedCommercialDestination(destinations, destinationId);
  const rescopeUnavailable = decision === "rescope" && !selectedDestination;
  const decisionLabel = pendingAction?.startsWith(`decision:${state.answer.id}:`)
    ? decision === "correct" ? "Recording correction…" : decision === "rescope" ? "Recording rescope…" : decision === "accept" ? "Accepting answer…" : "Rejecting answer…"
    : decision === "correct" ? "Record correction" : decision === "rescope" ? "Record rescope" : decision === "accept" ? "Accept" : decision === "reject" ? "Reject" : "Choose an owner decision";
  return <section className="panel question-card">
    <QuestionSnapshot question={state.question} destination={projectedDestination} />
    <h2 ref={confirmationHeading} tabIndex={-1}>Confirm submitted answer</h2>
    <p>This action is separate from answer submission and is recorded against the exact snapshot shown.</p>
    <dl className="confirmation-proof"><div><dt>Stored answer / proposal digest</dt><dd>{state.answer.operationDigest}</dd></div><div><dt>Question revision</dt><dd>{state.question.revision}</dd></div><div><dt>Destination</dt><dd>{scopeLabel(projectedDestination.scopeType)} / {projectedDestination.locator}</dd></div><div><dt>Prerequisite Knowledge Versions</dt><dd>{state.question.prerequisiteKnowledge.length}</dd></div></dl>
    {state.question.id === "hierarchy_completion_offer" && <p>No Offer exists yet. Only Accept, Correct, or Rescope of this exact stored proposal creates the first Offer under the displayed Customer Profile. Reject creates none.</p>}
    <form onSubmit={(event) => {
      event.preventDefault();
      if (!decision || rescopeUnavailable) return;
      onRecordDecision({
        answerId: state.answer.id,
        expectedSessionRevision: state.session.revision,
        expectedQuestionRevision: state.question.revision,
        decision,
        ...(decision === "correct" ? { value: value.trim(), reason: reason.trim() } : {}),
        ...(decision === "rescope" && selectedDestination ? { value: selectedDestination.locator, reason: reason.trim(), destination: selectedDestination } : {}),
        operationKey: decisionOperationKey,
      });
    }}>
      <fieldset><legend>Owner decision</legend>
        {(["accept", "reject", "correct", "rescope"] as const).map((choice) => <label key={choice}><input type="radio" name="interview-decision" checked={decision === choice} disabled={choice === "rescope" && !destinations.length} onChange={() => setDecision(choice)} />{choice[0].toUpperCase() + choice.slice(1)}</label>)}
        {decision === "correct" && <><label>Corrected value<input required value={value} onChange={(event) => setValue(event.target.value)} /></label><label>Reason<textarea required value={reason} onChange={(event) => setReason(event.target.value)} /></label></>}
        {decision === "rescope" && <><CommercialDestinationSelect destinations={destinations} value={destinationId} onChange={setDestinationId} label="Confirmed destination" /><label>Reason<textarea required value={reason} onChange={(event) => setReason(event.target.value)} /></label></>}
      </fieldset>
      <button className="primary" type="submit" disabled={!decision || rescopeUnavailable}>{decisionLabel}</button>
    </form>
  </section>;
}

function ActiveQuestion({ state, destinations, projectedDestination, destinationId, setDestinationId, answer, setAnswer, value, setValue, reason, setReason, operationKey, pendingAction, onSubmitAnswer }: {
  state: Extract<InterviewState, { status: "active" }>;
  destinations: readonly CommercialHierarchyNode[];
  projectedDestination: ExactCommercialDestination;
  destinationId: string;
  setDestinationId(id: string): void;
  answer: InterviewAnswerCommand["answer"];
  setAnswer(answer: InterviewAnswerCommand["answer"]): void;
  value: string;
  setValue(value: string): void;
  reason: string;
  setReason(reason: string): void;
  operationKey: string;
  pendingAction?: string | null;
  onSubmitAnswer(command: InterviewAnswerCommand): void;
}) {
  const selectedDestination = selectedCommercialDestination(destinations, destinationId);
  const scopeUnavailable = answer === "change_scope" && !selectedDestination;
  return <section className="panel question-card active-question-card">
    <QuestionSnapshot question={state.question} destination={projectedDestination} />
    <h2>{state.question.prompt}</h2>
    <form onSubmit={(event) => {
      event.preventDefault();
      if (scopeUnavailable) return;
      onSubmitAnswer({
        questionId: state.question.id,
        expectedRevision: state.question.revision,
        answer,
        ...(answer === "write_correction" ? { value: value.trim(), reason: reason.trim() } : {}),
        ...(answer === "change_scope" && selectedDestination ? { value: selectedDestination.locator, reason: reason.trim(), destination: selectedDestination } : {}),
        operationKey,
      });
    }}>
      <fieldset><legend>Your answer</legend>
        {(["use_recommendation", "write_correction", "change_scope"] as const).map((choice) => <label key={choice}><input type="radio" name="interview-answer" checked={answer === choice} disabled={choice === "change_scope" && !destinations.length} onChange={() => setAnswer(choice)} />{choice === "use_recommendation" ? "Use recommendation" : choice === "write_correction" ? "Write correction" : "Change scope"}</label>)}
        {answer === "write_correction" && <><label>Corrected value<input required value={value} onChange={(event) => setValue(event.target.value)} /></label><label>Reason<textarea required value={reason} onChange={(event) => setReason(event.target.value)} /></label></>}
        {answer === "change_scope" && <><CommercialDestinationSelect destinations={destinations} value={destinationId} onChange={setDestinationId} label="Confirmed destination" /><label>Reason<textarea required value={reason} onChange={(event) => setReason(event.target.value)} /></label></>}
      </fieldset>
      <button className="primary" type="submit" disabled={scopeUnavailable}>{pendingAction?.startsWith(`answer:${state.question.id}:`) ? "Submitting answer…" : "Submit answer for confirmation"}</button>
    </form>
    <p className="saved">Saving an answer does not create Confirmed Knowledge. A separate owner confirmation is required.</p>
  </section>;
}

function QuestionSnapshot({ question, destination }: { question: QuestionProjection; destination: ExactCommercialDestination }) {
  return <div className="question-authority">
    <span className="question-number">QUESTION {question.ordinal} · {scopeLabel(destination.scopeType).toUpperCase()} · REVISION {question.revision}</span>
    <p><b>Authoritative destination:</b> {scopeLabel(destination.scopeType)} / {destination.locator} · <code>{destination.id}</code></p>
    <section><h3>Evidence</h3>{question.evidenceFindings.length ? question.evidenceFindings.map((finding) => <article key={evidenceFindingKey(finding)} className="evidence-finding">{finding.sourceTitle && <b>{finding.sourceTitle}</b>}<dl className="confirmation-proof">{finding.sourceType && <div><dt>Source type</dt><dd>{finding.sourceType}</dd></div>}{finding.sourceRef && <div><dt>Source reference</dt><dd>{finding.sourceRef}</dd></div>}{typeof finding.publishedAt === "number" && <div><dt>Published (Toronto)</dt><dd>{toronto(finding.publishedAt)}</dd></div>}{typeof finding.retrievedAt === "number" && <div><dt>Retrieved (Toronto)</dt><dd>{toronto(finding.retrievedAt)}</dd></div>}</dl><p>{finding.excerpt}</p></article>) : <p>No structured evidence findings are present in this authoritative question snapshot.</p>}</section>
    <section><h3>Inference</h3>{question.inferenceDetail ? <><b>{question.inferenceDetail.label}</b><p>{question.inferenceDetail.value}</p></> : <p>No structured inference is present in this authoritative question snapshot.</p>}</section>
    <section className="recommendation"><h3>Recommendation</h3>{question.recommendationDetail ? <><p>{question.recommendationDetail.rationale}</p>{question.recommendationDetail.value && <p><b>Recommended value:</b> {question.recommendationDetail.value.excerpt}</p>}</> : <p>No structured recommendation is present in this authoritative question snapshot.</p>}</section>
    <section><h3>Prerequisite Knowledge Versions</h3>{question.prerequisiteKnowledge.length ? <ul>{question.prerequisiteKnowledge.map((item) => <li key={`${item.id}:${item.digest}`}><code>{item.id}</code> · <code>{item.digest}</code></li>)}</ul> : <p>None recorded for this question snapshot.</p>}</section>
  </div>;
}

function scopeLabel(scopeType: InterviewDestination["scopeType"]) {
  return scopeType.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function evidenceFindingKey(finding: QuestionProjection["evidenceFindings"][number]) {
  return [finding.sourceRef, finding.sourceTitle, finding.sourceType, finding.publishedAt, finding.retrievedAt, finding.excerpt].join("\u001f");
}

function issueCopy(issue: NonNullable<Parameters<typeof ConsensusInterviewView>[0]["issue"]>) {
  return issue === "network_unknown"
    ? "The result is unknown. No action was retried."
    : issue === "malformed"
      ? "The server projection was incomplete; mutation controls are hidden."
      : issue === "other_tab"
        ? "Answer submitted in another tab."
        : issue === "superseded"
          ? "This question is no longer active. Your draft was not saved."
          : "Another owner action may have changed this snapshot. Refresh before acting.";
}

function toronto(value: number) {
  return new Date(value).toLocaleString("en-CA", { timeZone: "America/Toronto", dateStyle: "medium", timeStyle: "short" });
}
