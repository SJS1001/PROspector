import { useState } from "react";
import { WorkspaceArchivePanel } from "@/components/workspace-archive-panel";
import { PageHeading, Panel, ErrorNote } from "@/components/shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LLM_PROVIDERS, llmProvider } from "@/lib/domain/llm";
import { mutationMessage, useExportCrm, useSaveConnections, useWorkspace } from "@/lib/workspace";

export function SettingsView() {
  const { data, isPending, isError } = useWorkspace();
  const save = useSaveConnections();
  const csv = useExportCrm();
  const [provider, setProvider] = useState("");
  const [model, setModel] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [llmKey, setLlmKey] = useState("");
  const [apollo, setApollo] = useState("");
  const [zoominfo, setZoominfo] = useState("");
  const [jev, setJev] = useState("");
  const [jevBase, setJevBase] = useState("");
  const [gmailUser, setGmailUser] = useState("");
  const [gmailPass, setGmailPass] = useState("");
  const [budget, setBudget] = useState("");
  const [batch, setBatch] = useState("");

  if (isPending) return <p className="text-sm text-muted">Loading connections…</p>;
  if (isError || !data) return <ErrorNote message="Connections could not be loaded." />;

  const selected = llmProvider(provider || data.connections.llmProvider);

  return (
    <div className="grid max-w-2xl gap-6">
      <PageHeading
        eyebrow="This machine"
        title="Connections"
        copy="Keys are encrypted on this machine and never shown again. Discovery and hunts use the model you pick here."
      />

      <Panel className="grid gap-4 p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-medium">AI model</h2>
          <Badge tone={data.connections.llm ? "ok" : "warn"}>
            {data.connections.llm ? `${data.connections.llmProviderLabel} · ${data.connections.llmModel}` : "Missing"}
          </Badge>
        </div>
        <p className="text-sm text-muted">{selected.hint}</p>
        <label className="grid gap-1 text-xs text-muted">
          Provider
          <select
            className="field"
            value={provider || data.connections.llmProvider}
            onChange={(event) => {
              setProvider(event.target.value);
              const next = llmProvider(event.target.value);
              if (!model) setModel(next.defaultModel);
            }}
          >
            {LLM_PROVIDERS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs text-muted">
          Model id
          <input
            className="field"
            autoComplete="off"
            placeholder={selected.defaultModel || "model-id"}
            value={model}
            onChange={(event) => setModel(event.target.value)}
          />
        </label>
        {selected.id === "custom" ? (
          <label className="grid gap-1 text-xs text-muted">
            HTTPS base URL
            <input
              className="field"
              autoComplete="off"
              placeholder="https://api.example.com/v1"
              value={baseUrl}
              onChange={(event) => setBaseUrl(event.target.value)}
            />
          </label>
        ) : null}
        <label className="grid gap-1 text-xs text-muted">
          API key
          <input
            className="field"
            type="password"
            autoComplete="off"
            placeholder="Paste key"
            value={llmKey}
            onChange={(event) => setLlmKey(event.target.value)}
          />
        </label>
        <p className="text-xs text-muted">
          Live web search: {selected.search === "none" ? "off — retrieval still drops invented URLs" : selected.search}.
        </p>
      </Panel>

      <Panel className="grid gap-4 p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-medium">Morning prospect runs</h2>
          <Badge tone="neutral">Manual</Badge>
        </div>
        <p className="text-sm text-muted">
          Start a due morning prospect run from Morning Brief. Discovery is a separate owner action; no inbox scan runs automatically.
        </p>
        <label className="grid gap-1 text-xs text-muted">
          Accounts per hunt (4–20)
          <input
            className="field"
            inputMode="numeric"
            placeholder={String(data.connections.huntBatch)}
            value={batch}
            onChange={(event) => setBatch(event.target.value)}
          />
        </label>
      </Panel>

      <Panel className="grid gap-4 p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-medium">Jev (TypeSafe)</h2>
          <Badge tone={data.connections.jev ? "ok" : "warn"}>{data.connections.jev ? "Ready" : "Optional"}</Badge>
        </div>
        <p className="text-sm text-muted">
          Decision model. Scores retrieved pages, classifies inbox mail, and blocks packages that invent claims. It does not search the web or send mail. Keyword scoring stays as backup.
        </p>
        <input
          className="field"
          type="password"
          autoComplete="off"
          aria-label="TypeSafe / Jev API key" placeholder="TypeSafe / Jev API key"
          value={jev}
          onChange={(event) => setJev(event.target.value)}
        />
        <input
          className="field"
          autoComplete="off"
          aria-label="Jev optional HTTPS base URL" placeholder="Optional HTTPS base (default api.typesafe.ai/v1)"
          value={jevBase}
          onChange={(event) => setJevBase(event.target.value)}
        />
      </Panel>

      <Panel className="grid gap-4 p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-medium">Apollo</h2>
          <Badge tone={data.connections.apollo ? "ok" : "warn"}>{data.connections.apollo ? "Ready" : "Missing"}</Badge>
        </div>
        <p className="text-sm text-muted">
          Paid contact reveal is unavailable in this release. Public-source reveal is available from Contacts.
        </p>
        {data.connections.apolloLeadLeft != null ? (
          <p className="text-sm">
            Apollo ledger: {data.connections.apolloLeadLeft} of {data.connections.apolloLeadLimit ?? "?"} lead credits remaining.
          </p>
        ) : (
          <p className="text-xs text-muted">No credit ledger is shown.</p>
        )}
        <input className="field" type="password" autoComplete="off" aria-label="Apollo API key" placeholder="Apollo API key" value={apollo} onChange={(e) => setApollo(e.target.value)} />
      </Panel>

      <Panel className="grid gap-4 p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-medium">ZoomInfo</h2>
          <Badge tone={data.connections.zoominfo ? "ok" : "warn"}>{data.connections.zoominfo ? "Saved" : "Optional"}</Badge>
        </div>
        <p className="text-sm text-muted">
          Paid contact reveal is unavailable in this release.
        </p>
        <input className="field" type="password" autoComplete="off" aria-label="ZoomInfo API key" placeholder="ZoomInfo key" value={zoominfo} onChange={(e) => setZoominfo(e.target.value)} />
      </Panel>

      <Panel className="grid gap-4 p-5">
        <h2 className="text-sm font-medium">Monthly spend cap</h2>
        <p className="text-sm text-muted">
          Used {Math.round(data.connections.spendUsedCents / 100)} of {Math.round(data.connections.monthlyBudgetCents / 100)} USD this Toronto month. Paid contact reveal is unavailable in this release.
        </p>
        <input className="field" inputMode="decimal" aria-label="Monthly spend cap in USD" placeholder="50" value={budget} onChange={(e) => setBudget(e.target.value)} />
      </Panel>

      <Panel className="grid gap-4 p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-medium">Gmail</h2>
          <Badge tone={data.connections.gmail ? "ok" : "warn"}>{data.connections.gmail ? data.connections.gmailUser : "Missing"}</Badge>
        </div>
        <p className="text-sm text-muted">
          Approved messages can be handed to Gmail compose. Delivery is unconfirmed; record replies, bounces, and unsubscribe requests manually.
        </p>
        {data.connections.inboxScannedAt ? (
          <p className="text-xs text-muted">Last inbox scan {data.connections.inboxScannedAt.replace("T", " ").slice(0, 16)} UTC.</p>
        ) : null}
        <input
          className="field"
          type="email"
          aria-label="Gmail email address" placeholder="you@company.com"
          value={gmailUser}
          onChange={(e) => setGmailUser(e.target.value)}
        />
        <input
          className="field"
          type="password"
          autoComplete="off"
          aria-label="Gmail app password" placeholder="App password"
          value={gmailPass}
          onChange={(e) => setGmailPass(e.target.value)}
        />
      </Panel>

      <div className="flex flex-wrap gap-2">
        <Button
          disabled={save.isPending}
          onClick={() =>
            save.mutate({
              xai: llmKey,
              llmKey,
              llmProvider: provider || data.connections.llmProvider,
              llmModel: model,
              llmBaseUrl: baseUrl,
              apollo,
              gmailUser,
              gmailPass,
              zoominfo,
              jev,
              jevBaseUrl: jevBase,
              monthlyBudgetCents: budget ? Math.round(Number(budget) * 100) : undefined,
              huntBatch: batch ? Number(batch) : undefined,
            })
          }
        >
          {save.isPending ? "Saving…" : "Save connections"}
        </Button>
        <Button variant="outline" disabled={csv.isPending} onClick={() => csv.mutate()}>
          {csv.isPending ? "Building…" : "Download CRM CSV"}
        </Button>
      </div>
      <WorkspaceArchivePanel />
      {save.error ? <ErrorNote message={mutationMessage(save.error)} /> : null}
      {csv.error ? <ErrorNote message={mutationMessage(csv.error)} /> : null}
      {save.isSuccess ? <p className="text-sm text-muted">Saved. Keys are not shown again.</p> : null}
    </div>
  );
}
