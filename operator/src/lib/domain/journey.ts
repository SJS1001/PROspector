import type { WorkspaceDTO } from "@/lib/domain/types";

export const TASKS = [
  { id: "status", label: "Today", href: "/", unlock: "always" },
  { id: "knowledge", label: "Company", href: "/knowledge", unlock: "always" },
  { id: "discovery", label: "Target markets", href: "/discovery", unlock: "interview" },
  { id: "prospects", label: "Searches", href: "/prospects", unlock: "product" },
  { id: "review", label: "Prospect review", href: "/review", unlock: "profile" },
  { id: "brief", label: "Today", href: "/brief", unlock: "profile" },
  { id: "contacts", label: "Contacts", href: "/contacts", unlock: "approved" },
  { id: "outreach", label: "Drafts & sending", href: "/outreach", unlock: "approved" },
  { id: "settings", label: "Settings", href: "/settings", unlock: "always" },
] as const;

export type TaskId = (typeof TASKS)[number]["id"];

export const NAVIGATION_GROUPS: { label: string; tasks: TaskId[]; direct?: boolean }[] = [
  { label: "Today", tasks: ["status"], direct: true },
  { label: "Your business", tasks: ["knowledge"] },
  { label: "Prospecting", tasks: ["discovery", "prospects", "review"] },
  { label: "Outreach", tasks: ["contacts", "outreach"] },
  { label: "Settings", tasks: ["settings"], direct: true },
];

export function unlockedSet(
  data: Pick<WorkspaceDTO, "interviewComplete" | "product" | "profile" | "brief">,
) {
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
    return {
      href: "/knowledge",
      label: "Continue interview",
      copy: "Confirm your business details to get started.",
    };
  }
  if (data.product.status !== "active") {
    return {
      href: "/discovery",
      label: "Make the product ready",
      copy: "Review the product settings before starting market discovery.",
    };
  }
  if (!data.draftPlays.some((play) => play.status === "confirmed")) {
    return {
      href: "/discovery",
      label: "Confirm a draft play",
      copy: "Choose a market and confirm its audience and buyer.",
    };
  }
  if (data.profile.status !== "active") {
    return {
      href: "/prospects",
      label: "Activate the customer profile",
      copy: "Review your search settings before finding prospects.",
    };
  }
  if (data.brief.qualified > 0) {
    return {
      href: "/review",
      label: "Review qualified prospects",
      copy: `${data.brief.qualified} waiting for an owner decision.`,
    };
  }
  if (data.brief.approved > 0) {
    return {
      href: "/contacts",
      label: "Review contacts",
      copy: "Suggestions stay labelled. Nothing is sent.",
    };
  }
  return {
    href: "/prospects",
    label: "Find Prospects",
    copy: "Search public sources using your confirmed target profile.",
  };
}
