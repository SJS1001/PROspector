import { uiLabel, uiText } from "@/lib/domain/plain-language";
import { Link } from "@tanstack/react-router";
import { PageHeading, Panel, ErrorNote, WorkspaceLoadError } from "@/components/shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { nextAction } from "@/lib/domain/journey";
import { mutationMessage, useTickSchedule, useWorkspace } from "@/lib/workspace";

export function BriefView() {
  const { data, isPending, isError } = useWorkspace();
  const morning = useTickSchedule();
  if (isPending) return <p className="text-sm text-muted">Loading today’s work…</p>;
  if (isError || !data)
    return <WorkspaceLoadError message="Today could not be loaded. No action was attempted." />;
  const action = nextAction(data);
  const pendingPackages = data.packages.filter((item) => item.status === "draft").length;
  const pendingMessages = data.messages.filter((item) => item.status === "draft").length;
  const recent = [
    ...data.runs.map((run) => ({
      id: `search-${run.id}`,
      date: run.startedAt,
      title: `Prospect search · ${uiLabel(run.status)}`,
      detail: `${run.qualifiedCount} qualified of ${run.candidateCount} candidates`,
      reason: run.terminalReason,
    })),
    ...data.discoveryRuns.map((run) => ({
      id: `market-${run.id}`,
      date: run.startedAt,
      title: `Market search · ${uiLabel(run.status)}`,
      detail: `${run.proposalCount} proposals`,
      reason: run.terminalReason,
    })),
    ...data.deliveryEvents.map((event) => ({
      id: `event-${event.id}`,
      date: event.createdAt,
      title: uiLabel(event.kind),
      detail: uiText(event.note),
      reason: null,
    })),
  ]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5);

  return (
    <div className="grid gap-5">
      <PageHeading title="Today" />
      <Panel className="p-5">
        <h2 className="font-display text-lg">Next action</h2>
        <Link
          to={action.href}
          className="mt-4 inline-flex min-h-11 items-center justify-center rounded-[10px] border border-green bg-green px-4 text-sm font-semibold text-cream"
        >
          {action.label}
        </Link>
      </Panel>
      <dl className="grid gap-3 sm:grid-cols-3">
        <Stat label="Prospects to review" value={data.brief.qualified} />
        <Stat label="Briefs to approve" value={pendingPackages} />
        <Stat label="Messages to approve" value={pendingMessages} />
      </dl>
      <Panel className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-lg">This week</h2>
          <Badge tone={data.profile.status === "active" ? "ok" : "warn"}>
            {data.profile.status === "active" ? "Search ready" : `Search settings: ${uiLabel(data.profile.status)}`}
          </Badge>
        </div>
        <p className="mt-2 text-sm text-muted">
          <strong className="text-ink">
            {data.brief.weekExportReady} / {data.brief.weekTarget}
          </strong>{" "}
          prospects newly ready to export.
        </p>
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-muted">Details</summary>
          <p className="mt-3 text-muted">
            Toronto week {data.brief.weekStart} – {data.brief.weekEnd}. Planned sites do not count toward the target.
          </p>
          <p className="mt-2 text-muted">
            Workspace totals: {data.brief.reviewed} reviewed · {data.brief.approved} approved ·{" "}
            {data.brief.rejected} rejected · {data.brief.greenfield} planned sites.
          </p>
          <p className="mt-2 text-muted">
            CRM CSV: {data.crm.eligibleCount} eligible · {data.crm.excludedCount} excluded.
          </p>
          {data.crm.rows.length ? (
            <ul className="mt-3 grid gap-2">
              {data.crm.rows.map((row) => (
                <li key={row.accountName}>
                  <strong>{row.accountName}</strong>
                  <p className="text-muted">{row.reason}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-muted">No approved prospects in the CRM preview.</p>
          )}
          <Link to="/settings" className="mt-3 inline-block text-teal underline">
            Export and backup settings
          </Link>
        </details>
      </Panel>
      <Panel className="p-5">
        <details open={recent.some((item) => item.reason)}>
          <summary className="cursor-pointer text-sm font-medium">Recent work</summary>
          {recent.length ? (
            <ul className="mt-3 divide-y divide-line">
              {recent.map((item) => (
                <li key={item.id} className="py-3 text-sm">
                  <div className="flex flex-wrap justify-between gap-2">
                    <strong>{item.title}</strong>
                    <time className="text-xs text-muted" dateTime={item.date}>
                      {new Date(item.date).toLocaleString("en-CA", { timeZone: "America/Toronto" })}{" "}
                      Toronto
                    </time>
                  </div>
                  <p className="mt-1 text-muted">{item.detail}</p>
                  {item.reason ? <p className="mt-1 text-amber">{uiText(item.reason)}</p> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted">No activity yet.</p>
          )}
        </details>
      </Panel>
      <Panel className="p-5">
        <details open={data.morningDue}>
          <summary className="cursor-pointer text-sm font-medium">
            Morning search {data.morningDue ? <Badge tone="warn">Due</Badge> : null}
          </summary>
          <Button className="mt-3" disabled={morning.isPending} onClick={() => morning.mutate()}>
            {morning.isPending ? "Running…" : "Run morning search"}
          </Button>
        </details>
        {morning.error ? (
          <div className="mt-3">
            <ErrorNote message={mutationMessage(morning.error)} />
          </div>
        ) : null}
        {morning.isSuccess ? (
          <p className="mt-3 text-sm text-muted">Morning search complete.</p>
        ) : null}
      </Panel>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-[12px] border border-line bg-cream p-4">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-2 font-display text-2xl">{value}</dd>
    </div>
  );
}
