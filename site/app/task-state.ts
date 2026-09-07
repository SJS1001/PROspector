"use client";

import { createElement } from "react";

/**
 * Plain-language task readiness. This is a presentation-only mapping: it
 * never infers eligibility, authority, or an operational decision, and it
 * carries no ID or digest. Callers derive the state from data they already
 * hold; this module only renders it consistently.
 */
export type WorkspaceTaskState = "ready" | "action_needed";

export const TASK_STATE_LABELS: Readonly<Record<WorkspaceTaskState, string>> = Object.freeze({
  ready: "Ready",
  action_needed: "Action needed",
});

export function TaskStateBadge({ state }: { state: WorkspaceTaskState }) {
  return createElement(
    "span",
    { className: `task-state ${state}` },
    TASK_STATE_LABELS[state],
  );
}
