import { uiText } from "@/lib/domain/plain-language";
import { CapabilityDiagnostics } from "@/components/status-view";
import { useState } from "react";
import { WorkspaceArchivePanel } from "@/components/workspace-archive-panel";
import { PageHeading, Panel, ErrorNote, WorkspaceLoadError } from "@/components/shell";
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
  if (isError || !data) return <WorkspaceLoadError message="Connections could not be loaded." />;

  const selected = llmProvider(provider || data.connections.llmProvider);

  return (
    <div className="grid max-w-2xl gap-6">
      <PageHeading title="Settings" />

      <Panel className="p-5">
        <h2 className="font-display text-lg">Overview</h2>
        <p className="mt-2 break-words text-sm text-muted">
          AI:{" "}
          {data.connections.llm
            ? `${data.connections.llmProviderLabel} · ${data.connections.llmModel}`
            : "Not connected"}{" "}
          · {data.connections.huntBatch} companies per search.
        </p>
        <p className="mt-2 text-sm text-muted">
          Spend: {Math.round(data.connections.spendUsedCents / 100)} /{" "}
          {Math.round(data.connections.monthlyBudgetCents / 100)} USD this month (Toronto).
        </p>
      </Panel>
      <details className="rounded-[12px] border border-line p-5">
        <summary className="cursor-pointer text-sm font-medium">
          Connections & search settings
        </summary>
        <div className="mt-4 grid gap-4">
          <details className="rounded-[12px] border border-line bg-cream p-4">
            <summary className="cursor-pointer text-sm font-medium">
              <span className="inline-flex max-w-full flex-wrap items-center gap-3 align-middle">
                <span>AI model</span>
                <Badge tone={data.connections.llm ? "ok" : "warn"}>
                  {data.connections.llm
                    ? `${data.connections.llmProviderLabel} · ${data.connections.llmModel}`
                    : "Missing"}
                </Badge>
              </span>
            </summary>
            <div className="mt-4 grid gap-4">
              <details className="text-xs text-muted">
                <summary className="cursor-pointer">Provider help</summary>
                <p className="mt-2">{uiText(selected.hint)}</p>
              </details>
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
                Live web search: {selected.search === "none" ? "Unavailable" : selected.search}.
              </p>
            </div>
          </details>

          <details className="rounded-[12px] border border-line bg-cream p-4">
            <summary className="cursor-pointer text-sm font-medium">
              <span className="inline-flex max-w-full flex-wrap items-center gap-3 align-middle">
                <span>Morning prospect runs</span>
                <Badge tone="neutral">Manual</Badge>
              </span>
            </summary>
            <div className="mt-4 grid gap-4">
              <p className="text-sm text-muted">Start morning runs from Today.</p>
              <label className="grid gap-1 text-xs text-muted">
                Companies per search (4–20)
                <input
                  className="field"
                  inputMode="numeric"
                  placeholder={String(data.connections.huntBatch)}
                  value={batch}
                  onChange={(event) => setBatch(event.target.value)}
                />
              </label>
            </div>
          </details>

          <details className="rounded-[12px] border border-line bg-cream p-4">
            <summary className="cursor-pointer text-sm font-medium">
              <span className="inline-flex max-w-full flex-wrap items-center gap-3 align-middle">
                <span>Jev (TypeSafe)</span>
                <Badge tone={data.connections.jev ? "ok" : "warn"}>
                  {data.connections.jev ? "Ready" : "Optional"}
                </Badge>
              </span>
            </summary>
            <div className="mt-4 grid gap-4">
              <p className="text-sm text-muted">Optional scoring and claim checks.</p>
              <input
                className="field"
                type="password"
                autoComplete="off"
                aria-label="TypeSafe / Jev API key"
                placeholder="TypeSafe / Jev API key"
                value={jev}
                onChange={(event) => setJev(event.target.value)}
              />
              <input
                className="field"
                autoComplete="off"
                aria-label="Jev optional HTTPS base URL"
                placeholder="Optional HTTPS base (default api.typesafe.ai/v1)"
                value={jevBase}
                onChange={(event) => setJevBase(event.target.value)}
              />
            </div>
          </details>

          <details className="rounded-[12px] border border-line bg-cream p-4">
            <summary className="cursor-pointer text-sm font-medium">
              <span className="inline-flex max-w-full flex-wrap items-center gap-3 align-middle">
                <span>Apollo</span>
                <Badge tone={data.connections.apollo ? "ok" : "warn"}>
                  {data.connections.apollo ? "Ready" : "Missing"}
                </Badge>
              </span>
            </summary>
            <div className="mt-4 grid gap-4">
              <p className="text-sm text-muted">
                Paid contact lookups are unavailable. Use public sources in Contacts.
              </p>
              {data.connections.apolloLeadLeft != null ? (
                <p className="text-sm">
                  Apollo ledger: {data.connections.apolloLeadLeft} of{" "}
                  {data.connections.apolloLeadLimit ?? "?"} lead credits remaining.
                </p>
              ) : (
                <p className="text-xs text-muted">No credit ledger is shown.</p>
              )}
              <input
                className="field"
                type="password"
                autoComplete="off"
                aria-label="Apollo API key"
                placeholder="Apollo API key"
                value={apollo}
                onChange={(e) => setApollo(e.target.value)}
              />
            </div>
          </details>

          <details className="rounded-[12px] border border-line bg-cream p-4">
            <summary className="cursor-pointer text-sm font-medium">
              <span className="inline-flex max-w-full flex-wrap items-center gap-3 align-middle">
                <span>ZoomInfo</span>
                <Badge tone={data.connections.zoominfo ? "ok" : "warn"}>
                  {data.connections.zoominfo ? "Saved" : "Optional"}
                </Badge>
              </span>
            </summary>
            <div className="mt-4 grid gap-4">
              <p className="text-sm text-muted">
                Paid contact lookups are unavailable in this release.
              </p>
              <input
                className="field"
                type="password"
                autoComplete="off"
                aria-label="ZoomInfo API key"
                placeholder="ZoomInfo key"
                value={zoominfo}
                onChange={(e) => setZoominfo(e.target.value)}
              />
            </div>
          </details>

          <details className="rounded-[12px] border border-line bg-cream p-4">
            <summary className="cursor-pointer text-sm font-medium">
              <span className="inline-flex max-w-full flex-wrap items-center gap-3 align-middle">
                Monthly spend cap
              </span>
            </summary>
            <div className="mt-4 grid gap-4">
              <p className="text-sm text-muted">
                {Math.round(data.connections.spendUsedCents / 100)} /{" "}
                {Math.round(data.connections.monthlyBudgetCents / 100)} USD this month (Toronto).
              </p>
              <input
                className="field"
                inputMode="decimal"
                aria-label="Monthly spend cap in USD"
                placeholder="50"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
              />
            </div>
          </details>

          <details className="rounded-[12px] border border-line bg-cream p-4">
            <summary className="cursor-pointer text-sm font-medium">
              <span className="inline-flex max-w-full flex-wrap items-center gap-3 align-middle">
                <span>Gmail</span>
                <Badge tone={data.connections.gmail ? "ok" : "warn"}>
                  {data.connections.gmail ? data.connections.gmailUser : "Missing"}
                </Badge>
              </span>
            </summary>
            <div className="mt-4 grid gap-4">
              <p className="text-sm text-muted">
                Opens approved messages in Gmail. Delivery remains unconfirmed.
              </p>
              {data.connections.inboxScannedAt ? (
                <p className="text-xs text-muted">
                  Last inbox scan {data.connections.inboxScannedAt.replace("T", " ").slice(0, 16)}{" "}
                  UTC.
                </p>
              ) : null}
              <input
                className="field"
                type="email"
                aria-label="Gmail email address"
                placeholder="you@company.com"
                value={gmailUser}
                onChange={(e) => setGmailUser(e.target.value)}
              />
              <input
                className="field"
                type="password"
                autoComplete="off"
                aria-label="Gmail app password"
                placeholder="App password"
                value={gmailPass}
                onChange={(e) => setGmailPass(e.target.value)}
              />
            </div>
          </details>

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
          </div>
        </div>
      </details>
      {save.error ? <ErrorNote message={mutationMessage(save.error)} /> : null}
      {save.isSuccess ? <p className="text-sm text-muted">Saved.</p> : null}
      <Panel className="p-5">
        <details>
          <summary className="cursor-pointer text-sm font-medium">
            Prospect export · {data.crm.eligibleCount} ready
          </summary>
          <p className="mt-2 text-sm text-muted">
            Eligibility and approvals are checked before download.
          </p>
          <Button
            className="mt-3"
            variant="outline"
            disabled={csv.isPending}
            onClick={() => csv.mutate()}
          >
            {csv.isPending ? "Building…" : "Download CRM CSV"}
          </Button>
        </details>
      </Panel>
      <details className="rounded-[12px] border border-line p-5">
        <summary className="cursor-pointer text-sm font-medium">Backup & restore</summary>
        <div className="mt-4">
          <WorkspaceArchivePanel />
        </div>
      </details>
      <CapabilityDiagnostics />
      {csv.error ? <ErrorNote message={mutationMessage(csv.error)} /> : null}
    </div>
  );
}
