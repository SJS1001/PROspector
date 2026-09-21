import { Link } from "@tanstack/react-router";
import { PageHeading, Panel, ErrorNote } from "@/components/shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { nextAction } from "@/lib/domain/journey";
import { useWorkspace } from "@/lib/workspace";

export function BriefView() {
  const { data, isPending, isError } = useWorkspace();
  if (isPending) return <p className="text-sm text-muted">Reading persisted Phase 4 state…</p>;
  if (isError || !data) return <ErrorNote message="Morning Brief unavailable. No action was attempted." />;

  const generated = new Date(data.generatedAt).toLocaleString("en-CA", {
    timeZone: "America/Toronto",
    hourCycle: "h23",
  });
  const action = nextAction(data);
  const play = data.profile.snapshot?.play ?? "Profile not activated";
  const product = data.profile.snapshot?.product ?? "Product";

  return (
    <div className="grid gap-6">
      <PageHeading
        eyebrow="Read-only operating view"
        title="Morning Brief"
        copy="Weekday operating snapshot in America/Toronto. If a morning run is due, start it from Prospects."
        action={
          <Link
            to={action.href}
            className="inline-flex min-h-11 items-center justify-center rounded-[10px] border border-green bg-green px-4 text-sm font-semibold text-cream"
          >
            {action.label}
          </Link>
        }
      />

      <article className="rounded-[12px] border border-line bg-cream p-6">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-teal">Active profile</span>
            <h2 className="mt-2 font-display text-2xl">{play}</h2>
            <p className="mt-1 text-sm text-muted">
              {data.companyName} · {product} · generated {generated} Toronto
            </p>
          </div>
          <Badge tone={data.profile.status === "active" ? "ok" : "warn"}>
            {data.profile.status === "active" ? "Ready" : data.profile.status}
          </Badge>
        </header>
        <p className="mt-4 text-sm text-muted">{action.copy}</p>
        {data.morningDue ? (
          <p className="mt-3 text-sm text-amber">Morning cycle is due. Run Find Prospects from the Prospects view.</p>
        ) : null}
        <dl className="mt-6 grid gap-3 sm:grid-cols-2">
          <Stat label="Qualified in queue" value={data.brief.qualified} />
          <Stat label="Reviewed" value={data.brief.reviewed} />
        </dl>
      </article>

      <Panel className="p-6">
        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-teal">Toronto week</span>
        <h2 className="mt-2 font-display text-lg">Weekly outcome</h2>
        <p className="mt-2 text-sm text-muted">
          Target is seven newly export-ready operating prospects this Toronto week ({data.brief.weekStart} – {data.brief.weekEnd}). Greenfield Draft does not count.
        </p>
        <dl className="mt-5 grid gap-3 sm:grid-cols-4">
          <Stat label="Export-ready" value={`${data.brief.weekExportReady} / ${data.brief.weekTarget}`} />
          <Stat label="Approved" value={data.brief.approved} />
          <Stat label="Rejected" value={data.brief.rejected} />
          <Stat label="Greenfield" value={data.brief.greenfield} />
        </dl>
      </Panel>

      <Panel className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-teal">Handoff preview</span>
            <h2 className="mt-2 font-display text-lg">CRM preview</h2>
            <p className="mt-2 max-w-2xl text-sm text-muted">
              Eligible contacts can be downloaded as CRM CSV from Connections. Greenfield rows stay out of the weekly target.
            </p>
          </div>
          <Badge tone={data.crm.authorized ? "ok" : "warn"}>{data.crm.authorized ? "CSV ready" : "No eligible rows"}</Badge>
        </div>
        <dl className="mt-5 grid gap-3 sm:grid-cols-2">
          <Stat label="Eligible" value={data.crm.eligibleCount} />
          <Stat label="Excluded" value={data.crm.excludedCount} />
        </dl>
        {data.crm.rows.length === 0 ? (
          <p className="mt-5 text-sm text-muted">No approved prospects in the CRM preview.</p>
        ) : (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-[10px] font-bold uppercase tracking-[0.12em] text-muted">
                  <th className="py-2 pr-4">Account</th>
                  <th className="py-2">Reason</th>
                </tr>
              </thead>
              <tbody>
                {data.crm.rows.map((row) => (
                  <tr key={row.accountName} className="border-b border-line last:border-0">
                    <td className="py-3 pr-4 font-medium">{row.accountName}</td>
                    <td className="py-3 text-muted">{row.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel className="p-6">
        <h2 className="text-lg font-medium">Operating notes</h2>
        <p className="mt-2 text-sm text-muted">
          Morning hunts fire weekdays after 06:00 Toronto when an xAI key is saved. Monthly discovery runs once per month. Restore a workspace JSON from Connections.
        </p>
        <div className="mt-5">
          <Link to={action.href}>
            <Button>{action.label}</Button>
          </Link>
        </div>
      </Panel>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-[12px] border border-line p-4">
      <dt className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted">{label}</dt>
      <dd className="mt-2 font-display text-3xl leading-none">{value}</dd>
    </div>
  );
}
