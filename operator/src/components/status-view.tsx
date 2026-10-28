import { BriefView } from "@/components/brief-view";
import { Panel, ErrorNote } from "@/components/shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { mutationMessage, useLoadMiningSample, useWorkspace } from "@/lib/workspace";

export function StatusView() {
  const { data } = useWorkspace();
  return (
    <div className="grid gap-6">
      <BriefView />
      {data?.sampleAvailable ? <SampleOffer /> : null}
    </div>
  );
}

export function CapabilityDiagnostics() {
  const { data } = useWorkspace();
  if (!data) return null;
  return (
    <details className="rounded-[12px] border border-line bg-cream p-5">
      <summary className="cursor-pointer text-sm font-medium">Diagnostics</summary>
      <div className="mt-4 grid gap-3">
        {data.capabilities.map((item) => (
          <article key={item.id} className="rounded-[10px] border border-line p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-sm font-medium">{item.name}</h3>
              <Badge
                tone={
                  item.status === "proven" ? "ok" : item.status === "blocked" ? "warn" : "neutral"
                }
              >
                {item.status}
              </Badge>
            </div>
            <p className="mt-2 text-sm text-muted">{item.reason}</p>
          </article>
        ))}
      </div>
    </details>
  );
}

function SampleOffer() {
  const load = useLoadMiningSample();
  return (
    <Panel className="p-6">
      <details>
        <summary className="cursor-pointer text-sm font-medium">Try sample data</summary>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Adds confirmed Digitalrain, ONE and operating-plant sample answers.
        </p>
        <Button className="mt-4" disabled={load.isPending} onClick={() => load.mutate(undefined)}>
          {load.isPending ? "Loading sample…" : "Load ONE for Mining sample"}
        </Button>
      </details>
      {load.error ? (
        <div className="mt-3">
          <ErrorNote message={mutationMessage(load.error)} />
        </div>
      ) : null}
    </Panel>
  );
}
