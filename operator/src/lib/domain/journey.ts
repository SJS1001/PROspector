import type { WorkspaceDTO } from "@/lib/domain/types";

export const TASKS = [
  { id: "status", label: "Home", href: "/", unlock: "always" },
  { id: "knowledge", label: "Company", href: "/knowledge", unlock: "always" },
  { id: "discovery", label: "Markets", href: "/discovery", unlock: "interview" },
  { id: "prospects", label: "Prospects", href: "/prospects", unlock: "product" },
  { id: "review", label: "Review", href: "/review", unlock: "profile" },
  { id: "brief", label: "Brief", href: "/brief", unlock: "profile" },
  { id: "contacts", label: "People", href: "/contacts", unlock: "approved" },
  { id: "outreach", label: "Outreach", href: "/outreach", unlock: "approved" },
  { id: "settings", label: "Connections", href: "/settings", unlock: "always" },
] as const;

export type TaskId = (typeof TASKS)[number]["id"];

export function unlockedSet(data: Pick<WorkspaceDTO, "interviewComplete" | "product" | "profile" | "brief">) {
  const open = new Set<string>(["always"]);
  if (data.interviewComplete) open.add("interview");
  if (data.product.status === "active") open.add("product");
  if (data.profile.status === "active") open.add("profile");
  if (data.brief.approved > 0) open.add("approved");
  return open;
}

export function taskUnlocked(
  unlock: string,
  data: Pick<WorkspaceDTO, "interviewComplete" | "product" | "profile" | "brief">,
) {
  return unlockedSet(data).has(unlock);
}

export function nextAction(data: WorkspaceDTO) {
  if (!data.interviewComplete) {
    return { href: "/knowledge", label: "Continue interview", copy: "One decision-bearing question is waiting." };
  }
  if (data.product.status !== "active") {
    return { href: "/discovery", label: "Make the product ready", copy: "Discovery stays dark until the product is activated." };
  }
  if (!data.draftPlays.some((play) => play.status === "confirmed")) {
    return { href: "/discovery", label: "Confirm a draft play", copy: "Explore a proposal, then confirm audience and buyer. That does not start prospecting." };
  }
  if (data.profile.status !== "active") {
    return { href: "/prospects", label: "Activate the customer profile", copy: "Find Prospects stays hidden until the profile is frozen." };
  }
  if (data.brief.qualified > 0) {
    return { href: "/review", label: "Review qualified prospects", copy: `${data.brief.qualified} waiting for an owner decision.` };
  }
  if (data.brief.approved > 0) {
    return { href: "/contacts", label: "Review contacts", copy: "Suggestions stay labelled. Nothing is sent." };
  }
  return { href: "/prospects", label: "Find Prospects", copy: "Run a bounded public retrieval against the active profile." };
}
