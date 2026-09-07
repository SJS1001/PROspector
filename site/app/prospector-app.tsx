"use client";

import { useCallback, useEffect, useState } from "react";
import { KnowledgeWorkspace } from "./knowledge/knowledge-workspace";
import { DiscoveryWorkspace } from "./discovery/discovery-workspace";
import {
  ProspectingWorkspace,
  type ProspectingProjection,
} from "./prospecting/prospecting-workspace";
import { ContactsWorkspace } from "./prospects/contacts-workspace";
import {
  WORKSPACE_VIEWS,
  workspaceTaskLabel,
  workspaceViewFromParam,
  workspaceViewParam,
  type WorkspaceTaskId,
} from "./workspace-view";
import { OperatorScopeProvider, useOperatorScope } from "./operator-context";
import { TaskStateBadge } from "./task-state";

type CapabilityStatus = "proven" | "blocked" | "unproven";
type CapabilityItem = {
  id: string;
  name: string;
  status: CapabilityStatus;
  reason: string;
  unavailableEffects: string[];
  checkedAt?: number;
  evidenceReference?: string;
};
export type CapabilityApiState = {
  ok: true;
  owner: { admitted: true };
  workspace: { companyName: string };
  overallStatus: CapabilityStatus;
  capabilities: CapabilityItem[];
};
const TORONTO_TIMESTAMP_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Toronto",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

// Kept as a stable source-level copy contract while the rendered controls live in KnowledgeWorkspace.
export const KNOWLEDGE_FLOW_COPY = ["Consensus Interview", "Submit answer for confirmation", "Confirm submitted answer", "Start corrected review", "Applying this policy to scoring and prospecting remains disabled"] as const;

export function ProspectorApp(props: {
  initialView?: WorkspaceTaskId;
  initialAccess?: "authorized" | "unauthorized";
  initialCapabilityState?: CapabilityApiState | null;
  initialProspectingProjection?: ProspectingProjection;
} = {}) {
  return (
    <OperatorScopeProvider>
      <ProspectorAppShell {...props} />
    </OperatorScopeProvider>
  );
}

function ProspectorAppShell({
  initialView = "status",
  initialAccess = "authorized",
  initialCapabilityState = null,
  initialProspectingProjection = EMPTY_PROSPECTING_PROJECTION,
}: {
  initialView?: WorkspaceTaskId;
  initialAccess?: "authorized" | "unauthorized";
  initialCapabilityState?: CapabilityApiState | null;
  initialProspectingProjection?: ProspectingProjection;
}) {
  const [view, setView] = useState<WorkspaceTaskId>(initialView);
  const [access, setAccess] = useState(initialAccess);
  const [resolvedCompanyName,setResolvedCompanyName]=useState(initialCapabilityState?.workspace.companyName?.trim()||"");
  const companyLabel=resolvedCompanyName||"Company setup";
  const operatorScope = useOperatorScope();
  const { setCompany } = operatorScope;
  const handleUnauthorized = useCallback(
    () => setAccess("unauthorized"),
    [],
  );
  const navigateToView = useCallback((nextView: WorkspaceTaskId) => {
    setView(nextView);
    const url = new URL(window.location.href);
    const parameter = workspaceViewParam(nextView);
    if (parameter) url.searchParams.set("view", parameter);
    else url.searchParams.delete("view");
    const destination = `${url.pathname}${url.search}${url.hash}`;
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (destination !== current) window.history.pushState(null, "", destination);
  }, []);

  useEffect(() => {
    const restoreView = () => {
      const parameter = new URL(window.location.href).searchParams.get("view");
      setView(workspaceViewFromParam(parameter));
    };
    window.addEventListener("popstate", restoreView);
    return () => window.removeEventListener("popstate", restoreView);
  }, []);

  // Presentation-only: mirror the resolved company name into the shared
  // operator scope trail. This grants no authority and issues no request.
  useEffect(() => {
    setCompany(resolvedCompanyName || null);
  }, [resolvedCompanyName, setCompany]);

  if (access === "unauthorized") return <PrivateWorkspaceUnavailable />;

  return (
    <main className="app-shell">
      <aside className="rail" aria-label="Primary navigation">
        <div className="brand-block">
          <div className="brand-mark" aria-hidden="true">P</div>
          <div><strong>PROspector</strong><span>GTM operating system</span></div>
        </div>

        <div className="workspace-picker">
          <span>COMPANY</span>
          <button type="button" onClick={() => navigateToView("company-products")}><b>{companyLabel}</b><small>Owner workspace</small></button>
        </div>

        <nav>
          {WORKSPACE_VIEWS.map((item) => (
            <button key={item.id} type="button" className={view === item.id ? "active" : ""} aria-current={view === item.id ? "page" : undefined} onClick={() => navigateToView(item.id)}>
              {item.label}
              {item.id === "company-products" && (
                <TaskStateBadge state={resolvedCompanyName ? "ready" : "action_needed"} />
              )}
            </button>
          ))}
        </nav>

        <div className="rail-foot">
          <button type="button" onClick={() => navigateToView("status")}>Pilot settings <span>→</span></button>
        </div>
      </aside>

      <section className="canvas">
        <header className="topbar">
          <div className="crumbs"><strong>{companyLabel}</strong><b>/</b><span>{workspaceTaskLabel(view)}</span></div>
          <div className="top-actions">
            <div className="avatar" title="Owner">O</div>
          </div>
        </header>

        <div className="fixture-banner" role="status">
          <strong>Controlled capability pilot</strong>
          <span>Commercial knowledge is live. Discovery, prospecting, contacts, schedules, exports, credentials, paid work, and outbound effects remain disabled.</span>
        </div>

        <div className="content">
          {view === "status" && <PilotStatus initialState={initialCapabilityState} onUnauthorized={handleUnauthorized} />}
          {view === "company-products" && <KnowledgeWorkspace onUnauthorized={handleUnauthorized} onCompanyResolved={setResolvedCompanyName} />}
          {view === "market-discovery" && <DiscoveryWorkspace onUnauthorized={handleUnauthorized} />}
          {(view === "review-prospects" || view === "prospects") && (
            <ProspectingWorkspace
              projection={initialProspectingProjection}
              mode={view === "review-prospects" ? "review" : "prospects"}
              onUnauthorized={handleUnauthorized}
            />
          )}
          {view === "contacts" && <ContactsWorkspace />}
        </div>
      </section>
    </main>
  );
}

function PageHeading({ eyebrow, title, copy, action }: { eyebrow: string; title: string; copy: string; action?: React.ReactNode }) {
  return <div className="page-heading"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{copy}</p></div>{action}</div>;
}

function PrivateWorkspaceUnavailable() {
  return <main className="access-screen">
    <section role="alert">
      <span>PRIVATE PILOT</span>
      <h1>Private workspace unavailable</h1>
      <p>This private pilot could not verify an authorized owner. Sign in with the approved account or contact the pilot administrator.</p>
    </section>
  </main>;
}

const broaderUnavailable = [
  ["Product discovery and prospecting", "Product and Profile readiness are not proven; only synthetic fixtures may be shown."],
  ["Leads, contacts, and imports", "No authenticated live-data intake or eligibility gate is active."],
  ["Schedules, runners, and paid work", "Scheduler, assignment, callback, quota, and spend-authority gates are not proven."],
  ["Credentials and provider effects", "Controlled provider-account and secrets-use proof is not complete."],
  ["Gmail, calling, and outreach", "Package, message, freshness, suppression, compliance, and final-effect gates are not proven."],
  ["CRM handoff and workspace export/restore", "Live eligibility, encryption, delivery, integrity, and clean-restore proof belong to Phase 7."],
] as const;

function PilotStatus({
  initialState,
  onUnauthorized,
}: {
  initialState: CapabilityApiState | null;
  onUnauthorized: () => void;
}) {
  const [state, setState] = useState<CapabilityApiState | null>(initialState);
  const [error, setError] = useState(false);
  const [runningProof, setRunningProof] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = await fetchCapabilityState();
      if (result.kind === "unauthorized") {
        onUnauthorized();
        return;
      }
      setState(result.value);
      setError(false);
    } catch {
      setState(null);
      setError(true);
    }
  }, [onUnauthorized]);

  async function runStorageProof() {
    if (!state) return;
    setRunningProof(true);
    setError(false);
    try {
      const primed = await fetchCapabilityState();
      if (primed.kind === "unauthorized") {
        onUnauthorized();
        return;
      }
      setState(primed.value);
      const response = await fetch("/api/capability-probe", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
          "x-prospector-intent": "capability-proof",
        },
        body: "{}",
      });
      if (response.status === 404) {
        onUnauthorized();
        return;
      }
      if (!response.ok) throw new Error("proof_unavailable");
      await load();
    } catch {
      setError(true);
    } finally {
      setRunningProof(false);
    }
  }

  if (!state && !error) {
    return <section className="pilot-loading" role="status">Checking accepted capability evidence…</section>;
  }

  if (error || !state) {
    return <section className="pilot-error" role="alert">
      <h1>Capability status could not be loaded.</h1>
      <p>Nothing has been enabled. Retry the status check.</p>
      <button className="outline" type="button" onClick={() => void load()}>Retry status check</button>
    </section>;
  }

  const counts = countStatuses(state.capabilities);
  const storage = state.capabilities.find((item) => item.id === "r2_object_lifecycle");
  const storageBindingBlocked =
    storage?.status === "blocked" && /binding is unavailable/i.test(storage.reason);

  return <div className="pilot-status">
    <PageHeading
      eyebrow="OWNER-ONLY · CONTROLLED PILOT"
      title="Private pilot boundary"
      copy="See what is proven, what is blocked, and what remains unproven before any broader operation can begin."
      action={<button className="primary" type="button" onClick={reviewEvidence}>Review capability evidence</button>}
    />

    <section className="panel boundary-summary" aria-live="polite">
      <div>
        <StatusBadge status={state.overallStatus} />
        <h2>{overallCopy(state.overallStatus)}</h2>
        <p>Later workflow gates remain separate and disabled.</p>
      </div>
      <dl>
        <div><dt>Proven</dt><dd>{counts.proven}</dd></div>
        <div><dt>Blocked</dt><dd>{counts.blocked}</dd></div>
        <div><dt>Unproven</dt><dd>{counts.unproven}</dd></div>
      </dl>
    </section>

    <section className="panel owner-boundary">
      <div>
        <span>OWNER ACCESS</span>
        <h2>Private pilot owner</h2>
        <p>Trusted server identity is admitted without displaying raw identity data.</p>
      </div>
      <div>
        <span>COMPANY WORKSPACE</span>
        <h2>{state.workspace.companyName}</h2>
        <p>One owner-scoped workspace. Invitations and workspace switching are unavailable.</p>
        <ul>
          <li>Route admission is enforced before data access.</li>
          <li>Row operations derive scope from the admitted principal.</li>
          <li>Object operations use an opaque server-derived prefix.</li>
          <li>Controlled second-principal hosted proof remains required.</li>
        </ul>
      </div>
    </section>

    <section className="capability-section" aria-labelledby="capability-heading">
      <div className="section-title">
        <div><span>ACCEPTED EVIDENCE</span><h2 id="capability-heading">Capability evidence</h2></div>
        <button className="outline" type="button" disabled={runningProof || storageBindingBlocked} onClick={() => void runStorageProof()}>
          {runningProof ? "Running storage proof…" : "Run storage proof"}
        </button>
      </div>
      <div className="capability-grid">
        {state.capabilities.map((item) => <CapabilityCard key={item.id} item={item} />)}
      </div>
    </section>

    <section className="panel unavailable-panel">
      <h2>Broader operation remains disabled</h2>
      <div>
        {broaderUnavailable.map(([name, reason]) => <article key={name}>
          <div><h3>{name}</h3><StatusBadge status="blocked" /></div>
          <p>{reason}</p>
        </article>)}
      </div>
    </section>

    <section className="proof-note">
      <h2>What counts as proof?</h2>
      <p>A capability is Proven only when its complete accepted hosted check is recorded. Configuration presence and UI availability do not count. Failed, partial, missing, or unreadable evidence keeps the capability disabled.</p>
    </section>
  </div>;
}

function CapabilityCard({ item }: { item: CapabilityItem }) {
  const unavailable = item.unavailableEffects.join(", ");
  return <article className="capability-card" data-status={item.status} tabIndex={-1}>
    <div><h3>{item.name}</h3><StatusBadge status={item.status} /></div>
    <p className="capability-result">{capabilitySentence(item)}</p>
    <p><b>Why</b>{item.reason}</p>
    <p><b>Unavailable while not proven</b>{item.status === "proven" ? "Later workflow gates remain separate." : unavailable}</p>
    <details>
      <summary>View evidence</summary>
      <dl>
        <div><dt>Demonstrated</dt><dd>{item.status === "proven" ? item.reason : "Complete accepted evidence is not recorded."}</dd></div>
        <div><dt>Checked</dt><dd>{item.checkedAt ? <><span>{formatToronto(item.checkedAt)}</span><span className="sr-only">{new Date(item.checkedAt).toISOString()}</span></> : "Not recorded"}</dd></div>
        <div><dt>Environment</dt><dd>Private pilot</dd></div>
        <div><dt>Reference</dt><dd className="evidence-reference">{item.evidenceReference ?? "Not recorded"}</dd></div>
        <div><dt>Boundary effect</dt><dd>{item.status === "proven" ? "This control may be relied on within Phase 1 only." : unavailable}</dd></div>
      </dl>
    </details>
  </article>;
}

function StatusBadge({ status }: { status: CapabilityStatus }) {
  const label = status[0].toUpperCase() + status.slice(1);
  const glyph = status === "proven" ? "✓" : status === "blocked" ? "!" : "—";
  return <span className={`status-badge ${status}`}><i aria-hidden="true">{glyph}</i>{label}</span>;
}

function countStatuses(items: CapabilityItem[]) {
  const counts = { proven: 0, blocked: 0, unproven: 0 };
  for (const item of items) counts[item.status] += 1;
  return counts;
}

function reviewEvidence() {
  const target = document.querySelector<HTMLElement>(
    '.capability-card[data-status="blocked"], .capability-card[data-status="unproven"], .capability-card[data-status="proven"]',
  );
  target?.focus();
  target?.scrollIntoView({ behavior: "smooth", block: "center" });
}

function overallCopy(status: CapabilityStatus) {
  if (status === "proven") return "All required Phase 1 controls have accepted evidence.";
  if (status === "blocked") return "The private pilot boundary is blocked.";
  return "The private pilot boundary is not proven yet.";
}

function capabilitySentence(item: CapabilityItem) {
  if (item.status === "proven") return `${item.name} is proven. ${item.reason}`;
  if (item.status === "blocked") return `${item.name} is blocked because ${item.reason}`;
  return `${item.name} is unproven because accepted evidence has not been recorded.`;
}

function formatToronto(value: number) {
  const parts = TORONTO_TIMESTAMP_FORMATTER.formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")} ${part("hour")}:${part("minute")} America/Toronto`;
}

function normalizeCapabilityState(value: unknown): CapabilityApiState {
  if (!value || typeof value !== "object") throw new Error("invalid_capability_state");
  const candidate = value as Partial<CapabilityApiState>;
  if (
    candidate.ok !== true ||
    !candidate.workspace ||
    typeof candidate.workspace.companyName !== "string" ||
    !Array.isArray(candidate.capabilities)
  ) {
    throw new Error("invalid_capability_state");
  }
  const capabilities = candidate.capabilities.map((item) => {
    if (
      !item ||
      typeof item.id !== "string" ||
      typeof item.name !== "string" ||
      !["proven", "blocked", "unproven"].includes(item.status) ||
      typeof item.reason !== "string" ||
      !Array.isArray(item.unavailableEffects)
    ) {
      throw new Error("invalid_capability_item");
    }
    return item;
  });
  const overallStatus =
    candidate.overallStatus === "proven" ||
    candidate.overallStatus === "blocked" ||
    candidate.overallStatus === "unproven"
      ? candidate.overallStatus
      : "unproven";
  return {
    ok: true,
    owner: { admitted: true },
    workspace: candidate.workspace,
    overallStatus,
    capabilities,
  };
}

async function fetchCapabilityState(): Promise<
  | { kind: "authorized"; value: CapabilityApiState }
  | { kind: "unauthorized" }
> {
  const response = await fetch("/api/capabilities", {
    credentials: "same-origin",
    cache: "no-store",
  });
  if (response.status === 404) return { kind: "unauthorized" };
  if (!response.ok) throw new Error("status_unavailable");
  return {
    kind: "authorized",
    value: normalizeCapabilityState(await response.json()),
  };
}


const EMPTY_PROSPECTING_PROJECTION: ProspectingProjection = Object.freeze({
  authority: "owner",
  readiness: null,
  runs: [],
  evidence: [],
  assessments: [],
  queue: [],
});
