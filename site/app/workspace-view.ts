/** The operator shell shows exactly the six tasks that have a real service.
 * A task's stable route identity is deliberately separate from its label so the
 * operator-facing wording can change without invalidating a bookmarked URL, and
 * so no label is ever used as a routing key. Contacts keeps its own admitted
 * route instead of a root `?view=` value. */
export const OPERATOR_TASKS = [
  { id: "status", label: "Status", param: null, href: "/" },
  { id: "knowledge", label: "Company & products", param: "knowledge", href: "/?view=knowledge" },
  { id: "market-discovery", label: "Market discovery", param: "market-discovery", href: "/?view=market-discovery" },
  { id: "review-queue", label: "Review prospects", param: "review-queue", href: "/?view=review-queue" },
  { id: "prospects", label: "Prospects", param: "prospects", href: "/?view=prospects" },
  { id: "contacts", label: "Contacts", param: null, href: "/contacts" },
] as const;

export type OperatorTask = (typeof OPERATOR_TASKS)[number];
export type OperatorTaskId = OperatorTask["id"];
export const CONTACTS_TASK_ID = "contacts" as const;
export type ShellTaskId = Exclude<OperatorTaskId, typeof CONTACTS_TASK_ID>;
export const DEFAULT_SHELL_TASK: ShellTaskId = "status";

export const SHELL_TASKS = OPERATOR_TASKS.filter(
  (task): task is Extract<OperatorTask, { id: ShellTaskId }> => task.id !== CONTACTS_TASK_ID,
);

export function isShellTask(id: OperatorTaskId): id is ShellTaskId {
  return id !== CONTACTS_TASK_ID;
}

/** Contacts has no root parameter, so `?view=contacts` is rejected exactly like
 * any unknown, removed, or non-string value: the shell falls back to Status. */
export function shellTaskFromParam(value: unknown): ShellTaskId {
  if (typeof value !== "string" || value === CONTACTS_TASK_ID) return DEFAULT_SHELL_TASK;
  const task = SHELL_TASKS.find((item) => item.param !== null && item.param === value);
  return task ? task.id : DEFAULT_SHELL_TASK;
}

export function shellTaskParam(id: ShellTaskId): string | null {
  return SHELL_TASKS.find((task) => task.id === id)?.param ?? null;
}

export function operatorTask(id: OperatorTaskId): OperatorTask {
  return OPERATOR_TASKS.find((task) => task.id === id) ?? OPERATOR_TASKS[0];
}

export function operatorTaskLabel(id: OperatorTaskId): string {
  return operatorTask(id).label;
}

export function operatorTaskHref(id: OperatorTaskId): string {
  return operatorTask(id).href;
}
