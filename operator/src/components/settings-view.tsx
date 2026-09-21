import { useState } from "react";
import { PageHeading, Panel, ErrorNote } from "@/components/shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { mutationMessage, useExportArchive, useExportCrm, useRestoreArchive, useSaveConnections, useWorkspace } from "@/lib/workspace";

export function SettingsView() {
  const { data, isPending, isError } = useWorkspace();
  const save = useSaveConnections();
  const csv = useExportCrm();
  const archive = useExportArchive();
  const restore = useRestoreArchive();
  const [xai, setXai] = useState("");
  const [apollo, setApollo] = useState("");
  const [zoominfo, setZoominfo] = useState("");
  const [gmailUser, setGmailUser] = useState("");
  const [gmailPass, setGmailPass] = useState("");
  const [budget, setBudget] = useState("");

  if (isPending) return <p className="text-sm text-muted">Loading connections…</p>;
  if (isError || !data) return <ErrorNote message="Connections could not be loaded." />;

  return (
    <div className="grid max-w-2xl gap-6">
      <PageHeading
        eyebrow="This machine"
        title="Connections"
        copy="Paste your own keys. They stay in this workspace. Leave a field blank to keep the saved value. Apollo spend still requires a per-prospect grant."
      />

      <Panel className="grid gap-4 p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-medium">xAI</h2>
          <Badge tone={data.connections.xai ? "ok" : "warn"}>{data.connections.xai ? "Ready" : "Missing"}</Badge>
        </div>
        <p className="text-sm text-muted">Used for market discovery and Find Prospects. Create a key at x.ai.</p>
        <input className="field" type="password" autoComplete="off" placeholder="xai-…" value={xai} onChange={(e) => setXai(e.target.value)} />
      </Panel>

      <Panel className="grid gap-4 p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-medium">Apollo</h2>
          <Badge tone={data.connections.apollo ? "ok" : "warn"}>{data.connections.apollo ? "Ready" : "Missing"}</Badge>
        </div>
        <p className="text-sm text-muted">
          Paid people search and mailbox reveal. Credits are billed by Apollo, not by PROspector. A grant is still required per prospect.
        </p>
        <input className="field" type="password" autoComplete="off" placeholder="Apollo API key" value={apollo} onChange={(e) => setApollo(e.target.value)} />
      </Panel>

      <Panel className="grid gap-4 p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-medium">ZoomInfo</h2>
          <Badge tone={data.connections.zoominfo ? "ok" : "warn"}>{data.connections.zoominfo ? "Saved" : "Optional"}</Badge>
        </div>
        <p className="text-sm text-muted">Key is stored. Reveal still prefers Apollo when both exist. ZoomInfo search is not billed until a grant uses it.</p>
        <input className="field" type="password" autoComplete="off" placeholder="ZoomInfo key" value={zoominfo} onChange={(e) => setZoominfo(e.target.value)} />
      </Panel>

      <Panel className="grid gap-4 p-5">
        <h2 className="text-sm font-medium">Monthly spend cap</h2>
        <p className="text-sm text-muted">
          Used {Math.round(data.connections.spendUsedCents / 100)} of {Math.round(data.connections.monthlyBudgetCents / 100)} USD this Toronto month. Apollo grants cannot exceed this cap.
        </p>
        <input className="field" inputMode="decimal" placeholder="50" value={budget} onChange={(e) => setBudget(e.target.value)} />
      </Panel>

      <Panel className="grid gap-4 p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-medium">Gmail</h2>
          <Badge tone={data.connections.gmail ? "ok" : "warn"}>{data.connections.gmail ? data.connections.gmailUser : "Missing"}</Badge>
        </div>
        <p className="text-sm text-muted">
          Use a Google app password, not your normal password. Sending still needs a separate message approval.
        </p>
        <input
          className="field"
          type="email"
          placeholder="you@company.com"
          value={gmailUser}
          onChange={(e) => setGmailUser(e.target.value)}
        />
        <input
          className="field"
          type="password"
          autoComplete="off"
          placeholder="App password"
          value={gmailPass}
          onChange={(e) => setGmailPass(e.target.value)}
        />
      </Panel>

      <div className="flex flex-wrap gap-2">
        <Button
          disabled={save.isPending}
          onClick={() =>
            save.mutate({
              xai,
              apollo,
              gmailUser,
              gmailPass,
              zoominfo,
              monthlyBudgetCents: budget ? Math.round(Number(budget) * 100) : undefined,
            })
          }
        >
          {save.isPending ? "Saving…" : "Save connections"}
        </Button>
        <Button variant="outline" disabled={csv.isPending} onClick={() => csv.mutate()}>
          {csv.isPending ? "Building…" : "Download CRM CSV"}
        </Button>
        <Button variant="outline" disabled={archive.isPending} onClick={() => archive.mutate()}>
          {archive.isPending ? "Building…" : "Download workspace"}
        </Button>
        <label className="inline-flex min-h-11 items-center">
          <input
            type="file"
            accept="application/json"
            className="text-xs text-muted"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              void file.text().then((text) => restore.mutate({ json: text }));
            }}
          />
        </label>
      </div>
      {save.error ? <ErrorNote message={mutationMessage(save.error)} /> : null}
      {csv.error ? <ErrorNote message={mutationMessage(csv.error)} /> : null}
      {archive.error ? <ErrorNote message={mutationMessage(archive.error)} /> : null}
      {restore.error ? <ErrorNote message={mutationMessage(restore.error)} /> : null}
      {save.isSuccess ? <p className="text-sm text-muted">Saved. Keys are not shown again.</p> : null}
    </div>
  );
}
