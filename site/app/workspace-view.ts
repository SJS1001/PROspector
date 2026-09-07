/**
 * Stable route identity is separate from the label shown to the operator, so
 * relabeling a task never changes its URL slug or the identity other code
 * keys on. Only tasks backed by a real service are listed; Morning Brief and
 * Exports & History are intentionally absent until those services exist.
 */
export const WORKSPACE_VIEWS = [
  { id: "status", label: "Status", slug: null },
  { id: "company-products", label: "Company & products", slug: "company-products" },
  { id: "market-discovery", label: "Market discovery", slug: "market-discovery" },
  { id: "review-prospects", label: "Review prospects", slug: "review-prospects" },
  { id: "prospects", label: "Prospects", slug: "prospects" },
  { id: "contacts", label: "Contacts", slug: "contacts" },
] as const;

export type WorkspaceTaskId = (typeof WORKSPACE_VIEWS)[number]["id"];

export function workspaceTaskLabel(id: WorkspaceTaskId): string {
  return WORKSPACE_VIEWS.find((view) => view.id === id)?.label ?? id;
}

export function workspaceViewFromParam(value: unknown): WorkspaceTaskId {
  if (typeof value !== "string") return "status";
  return WORKSPACE_VIEWS.find((view) => view.slug === value)?.id ?? "status";
}

export function workspaceViewParam(id: WorkspaceTaskId): string | null {
  return WORKSPACE_VIEWS.find((item) => item.id === id)?.slug ?? null;
}
