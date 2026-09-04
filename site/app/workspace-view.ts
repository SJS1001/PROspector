export const WORKSPACE_VIEWS = [
  { label: "Pilot Status", key: "01", slug: null },
  { label: "Morning Brief", key: "02", slug: "morning-brief" },
  { label: "Knowledge", key: "03", slug: "knowledge" },
  { label: "Market Discovery", key: "04", slug: "market-discovery" },
  { label: "Review Queue", key: "05", slug: "review-queue" },
  { label: "Prospects", key: "06", slug: "prospects" },
  { label: "Exports & History", key: "07", slug: "exports-history" },
] as const;

export type WorkspaceView = (typeof WORKSPACE_VIEWS)[number]["label"];

export function workspaceViewFromParam(value: unknown): WorkspaceView {
  if (typeof value !== "string") return "Pilot Status";
  return WORKSPACE_VIEWS.find((view) => view.slug === value)?.label ?? "Pilot Status";
}

export function workspaceViewParam(view: WorkspaceView): string | null {
  return WORKSPACE_VIEWS.find((item) => item.label === view)?.slug ?? null;
}
