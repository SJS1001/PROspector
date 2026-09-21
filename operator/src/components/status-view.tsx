import { Link } from "@tanstack/react-router";
import { PageHeading, Panel, ErrorNote } from "@/components/shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { nextAction } from "@/lib/domain/journey";
import { mutationMessage, useLoadMiningSample, useWorkspace } from "@/lib/workspace";
import type { CapabilityStatus } from "@/lib/domain/types";

function toneFor(status: CapabilityStatus) {
  if (status === "proven") return "ok" as const;
  if (status === "blocked") return "warn" as const;
  return "neutral" as const;
}

function overallCopy(status: CapabilityStatus) {
  if (status === "proven") return "Private site is operating inside its proven boundary.";
  if (status === "blocked") return "Some later gates remain blocked on purpose.";
  return "Capability evidence is still being gathered.";
}

export function StatusView() {
  const { data, isPending, isError, refetch } = useWorkspace();
  if (isPending) return <p className="text-sm text-muted">Checking accepted capability evidence…</p>;
  if (isError || !data) {
    return (
      <Panel className="p-6">
        <h1 className="font-display text-2xl">Capability status could not be loaded.</h1>
        <p className="mt-2 text-sm text-muted">Nothing has been enabled. Retry the status check.</p>
        <Button className="mt-4" variant="outline" onClick={() => void refetch()}>
          Retry status check
        </Button>
      </Panel>
    );
  }

  const overall = data.capabilities.every((item) => item.status !== "blocked")
    ? "proven"
    : data.capabilities.some((item) => item.status === "proven")
      ? "blocked"
      : "unproven";
  const counts = {
    proven: data.capabilities.filter((item) => item.status === "proven").length,
    blocked: data.capabilities.filter((item) => item.status === "blocked").length,
    unproven: data.capabilities.filter((item) => item.status === "unproven").length,
  };
  const action = nextAction(data);

  return (
    <div className="grid gap-6">
      <PageHeading
        eyebrow="Owner-only · private site"
        title="Private pilot boundary"
        copy="See what is proven, what is blocked, and what remains unproven before any broader operation can begin."
        action={
          <Link
            to={action.href}
            className="inline-flex min-h-11 items-center justify-center rounded-[10px] border border-green bg-green px-4 text-sm font-semibold text-cream"
          >
            {action.label}
          </Link>
        }
      />

      {data.sampleAvailable ? <SampleOffer /> : null}

      <Panel className="grid gap-6 p-6 lg:grid-cols-[1fr_auto] lg:items-center">
        <div>
          <Badge tone={toneFor(overall)}>{overall}</Badge>
          <h2 className="mt-3 font-display text-xl">{overallCopy(overall)}</h2>
          <p className="mt-1 text-sm text-muted">
            {action.copy} Add Apollo, Gmail, and xAI in Connections when you want paid reveal or mailbox send.
          </p>
        </div>
        <dl className="grid grid-cols-3 gap-3">
          {(["proven", "blocked", "unproven"] as const).map((key) => (
            <div key={key} className="min-w-16 rounded-[12px] border border-line p-4 text-center">
              <dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted">{key}</dt>
              <dd className="mt-2 font-display text-[28px] leading-none">{counts[key]}</dd>
            </div>
          ))}
        </dl>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel className="p-6">
          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-teal">In this site</span>
          <h2 className="mt-2 font-display text-lg">Owner workspace</h2>
          <p className="mt-2 text-sm text-muted">
            Signed-in visitors get their own owner workspace. Activate a profile,
            then Find Prospects. Decisions you make here persist. They do not leak
            to anyone else.
          </p>
          <ul className="mt-4 grid gap-2 text-sm text-muted">
            <li>Company, product, play and profile knowledge must be confirmed before hunting.</li>
            <li>Find Prospects retrieves public pages; application code scores them.</li>
            <li>Review requires a reason and binds to the exact assessment revision.</li>
          </ul>
        </Panel>
        <Panel className="p-6">
          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-teal">Still locked</span>
          <h2 className="mt-2 font-display text-lg">External effects</h2>
          <p className="mt-2 text-sm text-muted">
            This is a private operating site, not a sender. No Gmail, no paid reveal, no CRM
            file leaves this workspace.
          </p>
          <ul className="mt-4 grid gap-2 text-sm text-muted">
            <li>Contact suggestions cannot become enriched contacts.</li>
            <li>Outreach packages cannot be dispatched.</li>
            <li>Seeded mining fixtures remain labelled until a live run replaces the queue.</li>
          </ul>
        </Panel>
      </div>

      <div>
        <div className="mb-4 flex items-end justify-between gap-4">
          <h2 className="font-display text-lg">Capability evidence</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {data.capabilities.map((item) => (
            <article key={item.id} className="rounded-[12px] border border-line bg-cream p-6">
              <div className="flex items-start justify-between gap-4">
                <h3 className="font-display text-base">{item.name}</h3>
                <Badge tone={toneFor(item.status)}>{item.status}</Badge>
              </div>
              <p className="mt-3 text-sm text-muted">{item.reason}</p>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}

function SampleOffer() {
  const load = useLoadMiningSample();
  return (
    <Panel className="p-6">
      <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-teal">Sample</span>
      <h2 className="mt-2 font-display text-lg">Load ONE for Mining sample</h2>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        Confirms Digitalrain, ONE, and the operating-plants play so you can walk this private
        site without a blank interview. Paid enrichment, Gmail send, and CRM files stay locked.
      </p>
      <Button className="mt-4" disabled={load.isPending} onClick={() => load.mutate(undefined)}>
        {load.isPending ? "Loading sample…" : "Load ONE for Mining sample"}
      </Button>
      {load.error ? (
        <div className="mt-3">
          <ErrorNote message={mutationMessage(load.error)} />
        </div>
      ) : null}
    </Panel>
  );
}
