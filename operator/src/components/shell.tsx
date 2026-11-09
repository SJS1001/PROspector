import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  BookOpen,
  ClipboardCheck,
  Compass,
  LayoutDashboard,
  Sunrise,
  Users,
  Building2,
  Mail,
  Cable,
  Menu,
  ChevronDown,
} from "lucide-react";
import { UserButton } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useWorkspace, workspaceKey } from "@/lib/workspace";
import { cn } from "@/lib/utils";
import { AccessScreen } from "@/components/access-screen";
import { TASKS, NAVIGATION_GROUPS, nextAction, taskUnlocked } from "@/lib/domain/journey";
import { lockedTaskReason } from "@/lib/domain/review-gates";
import type { WorkspaceDTO } from "@/lib/domain/types";

const ICONS = {
  status: LayoutDashboard,
  knowledge: BookOpen,
  discovery: Compass,
  prospects: Building2,
  review: ClipboardCheck,
  brief: Sunrise,
  contacts: Users,
  outreach: Mail,
  settings: Cable,
} as const;

function taskFromPath(pathname: string) {
  if (pathname.startsWith("/knowledge")) return "knowledge";
  if (pathname.startsWith("/discovery")) return "discovery";
  if (pathname.startsWith("/brief")) return "brief";
  if (pathname.startsWith("/review")) return "review";
  if (pathname.startsWith("/contacts")) return "contacts";
  if (pathname.startsWith("/prospects")) return "prospects";
  if (pathname.startsWith("/outreach")) return "outreach";
  if (pathname.startsWith("/settings")) return "settings";
  return "status";
}

const EMPTY: Pick<WorkspaceDTO, "interviewComplete" | "product" | "profile" | "brief"> = {
  interviewComplete: false,
  product: { status: "draft", digest: null, snapshot: null, activatedAt: null, readiness: [] },
  profile: { status: "draft", digest: null, snapshot: null, activatedAt: null, readiness: [] },
  brief: {
    qualified: 0,
    approved: 0,
    rejected: 0,
    deferred: 0,
    reviewed: 0,
    weekExportReady: 0,
    weekTarget: 7,
    weekStart: "",
    weekEnd: "",
    greenfield: 0,
  },
};

export function Shell({ children }: { children: React.ReactNode }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { user, isPending } = useCurrentUserState();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const task = taskFromPath(pathname);
  const workspace = useWorkspace(Boolean(user));
  const company = workspace.data?.companyName ?? "New company";
  const queueCount = workspace.data?.brief.qualified ?? 0;
  const gate = workspace.data ?? EMPTY;

  if (isPending) return <AccessScreen mode="checking" />;
  if (!user) return <AccessScreen mode="login" />;

  const current = TASKS.find((item) => item.id === task) ?? TASKS[0];
  const nextHref = workspace.data ? nextAction(workspace.data).href : null;

  return (
    <div className="app-window">
      <a
        className="skip-link"
        href="#operator-task"
        onClick={(event) => {
          // Keep this local focus action out of router hash/history restoration.
          // Otherwise a later render can scroll away from the owner's form field.
          event.preventDefault();
          const task = document.getElementById("operator-task");
          task?.focus({ preventScroll: true });
          task?.scrollIntoView({ block: "start" });
        }}
      >
        Skip to workspace
      </a>
      <div className="app-titlebar">
        <span className="app-lights" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <strong className="text-xs font-medium text-ink">PROspector</strong>
        <span className="text-xs text-subtle">/</span>
        <span className="truncate text-xs text-muted">{company}</span>
        <span className="ml-auto hidden text-2xs text-subtle sm:block">Local operator</span>
      </div>

      <div className="grid min-h-0 lg:grid-cols-[220px_1fr]">
        <aside className="workspace-sidebar border-b border-line bg-forest-2 lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:self-start lg:border-b-0 lg:border-r">
          <button
            type="button"
            aria-expanded={mobileNavOpen}
            aria-controls="workspace-navigation"
            onClick={() => setMobileNavOpen(!mobileNavOpen)}
            className="flex min-h-11 w-full items-center gap-2 px-4 text-sm lg:hidden"
          >
            <Menu className="size-4" /> Menu{" "}
            <span className="ml-auto text-muted">{current.label}</span>
          </button>
          <nav
            id="workspace-navigation"
            aria-label="Workspace"
            className={cn(
              "gap-2 px-3 py-4 lg:grid lg:overflow-y-auto",
              mobileNavOpen ? "grid" : "hidden",
            )}
          >
            {NAVIGATION_GROUPS.map((group) => {
              const activeGroup =
                group.tasks.some((id) => id === task) ||
                (group.label === "Today" && task === "brief");
              const containsNext = group.tasks.some(
                (id) => TASKS.find((entry) => entry.id === id)?.href === nextHref,
              );
              const lockedReasons: string[] = [];
              for (const id of group.tasks) {
                const entry = TASKS.find((item) => item.id === id);
                if (!entry || taskUnlocked(entry.unlock, gate)) continue;
                const reason = lockedTaskReason(entry.unlock);
                if (reason) lockedReasons.push(reason);
              }
              const groupLater =
                !group.direct && !activeGroup && lockedReasons.length === group.tasks.length
                  ? lockedReasons[0]
                  : null;
              const links = group.tasks.map((id) => {
                const item = TASKS.find((entry) => entry.id === id)!;
                const Icon = ICONS[item.id];
                const active = item.id === task || (item.id === "status" && task === "brief");
                const open = taskUnlocked(item.unlock, gate);
                const later = open || active ? null : lockedTaskReason(item.unlock);
                const waiting = open && item.id === "review" && queueCount > 0 ? queueCount : 0;
                return (
                  <Link
                    key={item.id}
                    to={item.href}
                    aria-current={active ? "page" : undefined}
                    aria-label={
                      later
                        ? `${item.label}. ${later}`
                        : waiting
                          ? `${item.label}, ${waiting} waiting`
                          : undefined
                    }
                    onClick={() => {
                      setMobileNavOpen(false);
                      requestAnimationFrame(() =>
                        document.getElementById("operator-task")?.focus({ preventScroll: true }),
                      );
                    }}
                    className={cn(
                      "nav-link flex min-h-11 items-center gap-2.5 rounded-sm px-2.5 text-sm text-muted",
                      active && "bg-cream text-ink",
                    )}
                  >
                    <Icon aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.6} />
                    <span>{item.label}</span>
                    {waiting ? (
                      <em className="ml-auto min-w-5 rounded-sm bg-lime px-1.5 text-center text-2xs font-semibold not-italic text-paper">
                        {waiting}
                      </em>
                    ) : later ? (
                      <span className="ml-auto text-2xs text-subtle">Later</span>
                    ) : null}
                  </Link>
                );
              });
              return group.direct ? (
                <div key={group.label}>{links}</div>
              ) : (
                <details key={group.label} open={activeGroup || containsNext} className="group/nav">
                  <summary
                    aria-label={groupLater ? `${group.label}. ${groupLater}` : undefined}
                    className={cn(
                      "flex min-h-11 cursor-pointer list-none items-center justify-between rounded-sm px-2.5 text-sm [&::-webkit-details-marker]:hidden",
                      activeGroup ? "text-ink" : "text-muted",
                    )}
                  >
                    <span>{group.label}</span>
                    {groupLater ? <span className="text-2xs text-subtle">Later</span> : null}
                    <ChevronDown
                      aria-hidden="true"
                      className="size-3 transition-transform group-open/nav:rotate-180"
                    />
                  </summary>
                  <div className="ml-3 grid border-l border-line pl-2">{links}</div>
                </details>
              );
            })}
          </nav>
          <div className="mt-auto hidden border-t border-line px-3 py-3 lg:block">
            <p className="text-2xs text-subtle">Private workspace · On this Mac</p>
          </div>
        </aside>

        <section className="min-w-0 bg-paper">
          <header className="sticky top-0 z-20 flex h-12 items-center justify-between border-b border-line bg-paper px-4">
            <div className="flex min-w-0 items-center gap-2 text-xs text-muted">
              <span className="truncate font-medium text-ink">{current.label}</span>
            </div>
            <div className="flex items-center gap-3 text-ink [&_span]:max-w-[140px] [&_span]:truncate">
              <UserButton />
            </div>
          </header>
          <div
            id="operator-task"
            className="mx-auto max-w-[1320px] px-4 py-6 sm:px-6 lg:px-9 lg:py-8"
            tabIndex={-1}
            onFocusCapture={(event) => {
              const control = event.target;
              if (!control.matches("input,textarea,select,button,a[href],summary")) return;
              requestAnimationFrame(() => {
                if (document.activeElement !== control) return;
                const bounds = control.getBoundingClientRect();
                if (bounds.top < 56 || bounds.bottom > window.innerHeight)
                  control.scrollIntoView({ block: "nearest", inline: "nearest" });
              });
            }}
          >
            {children}
          </div>
        </section>
      </div>
    </div>
  );
}

export function PageHeading({
  eyebrow,
  title,
  copy,
  action,
}: {
  eyebrow?: string;
  title: string;
  copy?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="page-heading flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="max-w-xl">
        {eyebrow ? <p className="text-2xs font-medium text-subtle">{eyebrow}</p> : null}
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{title}</h1>
        {copy ? <p className="mt-1.5 text-sm text-muted">{copy}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Panel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("surface rounded-lg border border-line bg-cream", className)}>
      {children}
    </section>
  );
}

export function ErrorNote({ message }: { message: string }) {
  const alert = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    // A request may finish after its section is collapsed. Reveal feedback before focus.
    let ancestor = alert.current?.parentElement;
    while (ancestor) {
      if (ancestor.tagName === "DETAILS") (ancestor as HTMLDetailsElement).open = true;
      ancestor = ancestor.parentElement;
    }
    alert.current?.focus();
  }, [message]);
  return (
    <p
      ref={alert}
      tabIndex={-1}
      role="alert"
      className="rounded-sm border border-red/30 bg-danger-bg px-3 py-2 text-xs text-red"
    >
      {message}
    </p>
  );
}

export function WorkspaceLoadError({ message }: { message: string }) {
  const queryClient = useQueryClient();
  const isFetching = useIsFetching({ queryKey: workspaceKey }) > 0;
  return (
    <div className="grid gap-3">
      <ErrorNote message={message} />
      <Button
        disabled={isFetching}
        onClick={() => void queryClient.refetchQueries({ queryKey: workspaceKey })}
      >
        Retry loading workspace
      </Button>
    </div>
  );
}
