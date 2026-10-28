import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
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
  Lock,
  Mail,
  Cable,
} from "lucide-react";
import { UserButton } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useWorkspace, workspaceKey } from "@/lib/workspace";
import { cn } from "@/lib/utils";
import { AccessScreen } from "@/components/access-screen";
import { TASKS, taskUnlocked } from "@/lib/domain/journey";
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
  brief: { qualified: 0, approved: 0, rejected: 0, deferred: 0, reviewed: 0, weekExportReady: 0, weekTarget: 7, weekStart: "", weekEnd: "", greenfield: 0 },
};

export function Shell({ children }: { children: React.ReactNode }) {
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

  return (
    <div className="app-window">
      <a className="skip-link" href="#operator-task" onClick={(event) => {
        // Keep this local focus action out of router hash/history restoration.
        // Otherwise a later render can scroll away from the owner's form field.
        event.preventDefault();
        const task = document.getElementById("operator-task");
        task?.focus({ preventScroll: true });
        task?.scrollIntoView({ block: "start" });
      }}>
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
        <aside className="border-b border-line bg-forest-2 lg:flex lg:h-[calc(100dvh-40px)] lg:flex-col lg:border-b-0 lg:border-r">
          <nav aria-label="Workspace" className="flex gap-1 overflow-x-auto px-2 py-2 lg:grid lg:gap-0.5 lg:px-2 lg:py-3">
            {TASKS.map((item) => {
              const Icon = ICONS[item.id];
              const active = item.id === task;
              const open = taskUnlocked(item.unlock, gate);
              return (
                <Link
                  key={item.id}
                  to={item.href}
                  onFocus={(event) => {
                    // Rapid tabbing through the narrow horizontal navigation can
                    // leave the final link clipped by an earlier native scroll.
                    const link = event.currentTarget;
                    requestAnimationFrame(() => {
                      if (link === document.activeElement)
                        link.scrollIntoView({ block: "nearest", inline: "nearest" });
                    });
                  }}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-11 shrink-0 items-center gap-2.5 rounded-sm px-2.5 text-sm text-muted",
                    active && "bg-cream text-ink",
                    !open && "opacity-40",
                  )}
                >
                  <Icon className="size-4" strokeWidth={1.6} />
                  <span>{item.label}</span>
                  {!open ? <Lock className="ml-auto size-3 text-subtle" /> : null}
                  {open && item.id === "review" && queueCount > 0 ? (
                    <em className="ml-auto min-w-5 rounded-sm bg-lime px-1.5 text-center text-2xs font-semibold not-italic text-paper">
                      {queueCount}
                    </em>
                  ) : null}
                </Link>
              );
            })}
          </nav>
          <div className="mt-auto hidden border-t border-line px-3 py-3 lg:block">
            <p className="text-2xs text-subtle">Keys stay on this machine. Nothing ships until you approve it.</p>
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
          <div id="operator-task" className="px-4 py-6 lg:px-8 lg:py-8" tabIndex={-1}>
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
  eyebrow: string;
  title: string;
  copy: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="max-w-xl">
        <p className="text-2xs font-medium text-subtle">{eyebrow}</p>
        <h1 className="mt-1 text-2xl font-medium tracking-tight text-ink">{title}</h1>
        <p className="mt-1.5 text-sm text-muted">{copy}</p>
      </div>
      {action}
    </div>
  );
}

export function Panel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-md border border-line bg-cream", className)}>{children}</section>
  );
}

export function ErrorNote({ message }: { message: string }) {
  const alert = useRef<HTMLParagraphElement>(null);
  useEffect(() => { alert.current?.focus(); }, [message]);
  return (
    <p ref={alert} tabIndex={-1} role="alert" className="rounded-sm border border-red/30 bg-danger-bg px-3 py-2 text-xs text-red">
      {message}
    </p>
  );
}

export function WorkspaceLoadError({ message }: { message: string }) {
  const queryClient = useQueryClient();
  const isFetching = useIsFetching({ queryKey: workspaceKey }) > 0;
  return <div className="grid gap-3">
    <ErrorNote message={message} />
    <Button disabled={isFetching} onClick={() => void queryClient.refetchQueries({ queryKey: workspaceKey })}>Retry loading workspace</Button>
  </div>;
}
