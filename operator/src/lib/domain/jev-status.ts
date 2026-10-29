import type { ProspectingRun } from "./types";

export function jevStatus(run: Pick<ProspectingRun, "progress" | "status">) {
  const j = run.progress?.jev;
  const active = run.status === "running" || run.status === "queued";
  if (!j) return "JEV · not recorded for this search";
  if (!j.configured) return "JEV · not connected";
  if (j.applied)
    return `JEV · scoring used for ${j.applied} source${j.applied === 1 ? "" : "s"}${j.failed ? ` · ${j.failed} failed` : ""}`;
  if (j.reviewed)
    return `JEV · ${j.reviewed} reviewed; basic scoring kept${j.failed ? ` · ${j.failed} failed` : ""}`;
  if (j.failed) return "JEV · unavailable; basic scoring kept";
  if (j.attempted > j.reviewed + j.failed)
    return active ? "JEV · checking evidence…" : "JEV · check interrupted";
  return active ? "JEV · waiting for sources" : "JEV · no sources to review";
}
