import React from "react";

/** One shared plain-language vocabulary for "where is this task right now".
 * Every operator surface reports state with these words; exact identifiers,
 * digests, and revisions belong in the closed technical record beside them. */
export const TASK_STATES = [
  "not-started",
  "in-progress",
  "needs-you",
  "waiting",
  "ready",
  "unavailable",
] as const;
export type TaskStateKind = (typeof TASK_STATES)[number];

export const TASK_STATE_LABEL: Readonly<Record<TaskStateKind, string>> = Object.freeze({
  "not-started": "Not started",
  "in-progress": "In progress",
  "needs-you": "Needs you",
  waiting: "Waiting",
  ready: "Ready",
  unavailable: "Unavailable",
});

/** Accepted capability evidence, in the same plain words. */
export const TASK_STATE_FOR_CAPABILITY: Readonly<Record<string, TaskStateKind>> = Object.freeze({
  proven: "ready",
  blocked: "unavailable",
  unproven: "not-started",
});

export type TechnicalDetail = Readonly<{ term: string; value: string }>;

export function TaskState({
  state,
  summary,
  technical = [],
  technicalLabel = "Technical details",
}: {
  state: TaskStateKind;
  summary: string;
  technical?: readonly TechnicalDetail[];
  technicalLabel?: string;
}) {
  return (
    <div className="task-state" data-task-state={state}>
      <p className="task-state-summary">
        <span className="task-state-badge">{TASK_STATE_LABEL[state]}</span>
        <span>{summary}</span>
      </p>
      {technical.length > 0 ? (
        <details className="task-state-technical">
          <summary>{technicalLabel}</summary>
          <dl>
            {technical.map((item) => (
              <div key={item.term}>
                <dt>{item.term}</dt>
                <dd>{item.value}</dd>
              </div>
            ))}
          </dl>
        </details>
      ) : null}
    </div>
  );
}
