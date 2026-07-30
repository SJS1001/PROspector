"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { InterviewState } from "../domain/interview";

type InterviewApiState = InterviewState;

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
type View = "Pilot Status" | "Morning Brief" | "Knowledge" | "Market Discovery" | "Review Queue" | "Prospects" | "Exports & History";

const views: { label: View; key: string }[] = [
  { label: "Pilot Status", key: "01" },
  { label: "Morning Brief", key: "02" },
  { label: "Knowledge", key: "03" },
  { label: "Market Discovery", key: "04" },
  { label: "Review Queue", key: "05" },
  { label: "Prospects", key: "06" },
  { label: "Exports & History", key: "07" },
];

const signals = [
  { company: "Eldorado Gold", target: "McIlvenna Bay", signal: "First concentrate produced; ramp-up toward 4,900 t/d", score: 9, tier: "T1", age: "2h", status: "Review" },
  { company: "Boliden", target: "Odda expansion", signal: "Commissioning activity and production ramp underway", score: 8, tier: "T1", age: "4h", status: "Review" },
  { company: "Alamos Gold", target: "Island Gold Phase 3+", signal: "Shaft expansion enters operational transition", score: 8, tier: "T2", age: "6h", status: "Review" },
  { company: "Covalent Lithium", target: "Mt Holland", signal: "Concentrator optimization remains a stated priority", score: 7, tier: "T2", age: "9h", status: "Needs evidence" },
];

const discovery = [
  { market: "Bulk materials terminals", fit: "High", reason: "Shared uptime and fragmented equipment-data problem", buyer: "Terminal operations director" },
  { market: "Marine port operations", fit: "Medium", reason: "ONE capabilities transfer; proof and buyer language differ", buyer: "Port operations VP" },
];

export function ProspectorApp({
  initialView = "Pilot Status",
  initialAccess = "authorized",
  initialCapabilityState = null,
}: {
  initialView?: View;
  initialAccess?: "authorized" | "unauthorized";
  initialCapabilityState?: CapabilityApiState | null;
} = {}) {
  const [view, setView] = useState<View>(initialView);
  const [access, setAccess] = useState(initialAccess);
  const [profile, setProfile] = useState("Operating sites");
  const [query, setQuery] = useState("");

  const filteredSignals = useMemo(
    () => signals.filter((item) => `${item.company} ${item.target} ${item.signal}`.toLowerCase().includes(query.toLowerCase())),
    [query],
  );

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
          <button type="button"><b>Digitalrain</b><small>Owner workspace</small></button>
        </div>

        <nav>
          {views.map((item) => (
            <button key={item.label} type="button" className={view === item.label ? "active" : ""} onClick={() => setView(item.label)}>
              <span>{item.key}</span>{item.label}
              {item.label === "Review Queue" && <em>4 sample</em>}
            </button>
          ))}
        </nav>

        <div className="rail-foot">
          <div className="runner"><i /><div><b>Codex runner</b><span>Not connected · fixture mode</span></div></div>
          <button type="button" onClick={() => setView("Pilot Status")}>Pilot settings <span>→</span></button>
        </div>
      </aside>

      <section className="canvas">
        <header className="topbar">
          <div className="crumbs"><span>Digitalrain</span><b>/</b><span>ONE</span><b>/</b><strong>ONE for Mining</strong></div>
          <div className="top-actions">
            <label className="search"><span>⌕</span><input aria-label="Search prospects" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search" /></label>
            <button className="quiet" type="button" disabled>No live runs</button>
            <div className="avatar" title="Owner">SS</div>
          </div>
        </header>

        <div className="fixture-banner" role="status">
          <strong>Controlled capability pilot</strong>
          <span>Only the owner-scoped Consensus Interview is live. Prospecting, contacts, imports, schedules, exports, credentials, Gmail, calling, paid work, and provider effects remain disabled until their own gates are proven.</span>
        </div>

        <div className="content">
          {view === "Pilot Status" && <PilotStatus initialState={initialCapabilityState} onUnauthorized={() => setAccess("unauthorized")} />}
          {view === "Morning Brief" && <MorningBrief profile={profile} setProfile={setProfile} items={filteredSignals} setView={setView} />}
          {view === "Knowledge" && <Knowledge setView={setView} />}
          {view === "Market Discovery" && <MarketDiscovery />}
          {view === "Review Queue" && <ReviewQueue items={filteredSignals} />}
          {view === "Prospects" && <Prospects items={filteredSignals} />}
          {view === "Exports & History" && <Exports />}
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
  return new Date(value).toLocaleString("en-CA", {
    timeZone: "America/Toronto",
    dateStyle: "medium",
    timeStyle: "short",
  });
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

function MorningBrief({ profile, setProfile, items, setView }: { profile: string; setProfile: (value: string) => void; items: typeof signals; setView: (view: View) => void }) {
  return <>
    <PageHeading eyebrow="WEDNESDAY · 29 JULY · SYNTHETIC FIXTURE" title="Good morning, Steven." copy="A non-operational example of how evidence-backed work will be separated from decisions." action={<button className="primary" type="button" disabled title="Available after Wave 0">Prospecting disabled</button>} />

    <div className="context-strip">
      <div><span>PRODUCT</span><b>ONE</b><small>Fixture · Ready example</small></div>
      <div><span>MARKET PLAY</span><b>ONE for Mining</b><small>Fixture · Ready example</small></div>
      <label><span>CUSTOMER PROFILE</span><select value={profile} onChange={(event) => setProfile(event.target.value)}><option>Operating sites</option><option>Greenfield projects</option></select><small className={profile === "Operating sites" ? "ready" : "draft"}>{profile === "Operating sites" ? "Ready · weekdays 06:00" : "Draft · runs disabled"}</small></label>
    </div>

    <section className="metrics" aria-label="Weekly metrics">
      <article><span>SAMPLE EXPORT-READY</span><strong>3 <small>/ 7</small></strong><div className="meter"><i style={{ width: "43%" }} /></div><p>Illustrative target only</p></article>
      <article><span>SAMPLE REVIEW QUEUE</span><strong>4</strong><p>Fixture records · actions disabled</p></article>
      <article><span>SAMPLE SIGNALS</span><strong>11</strong><p>Illustrative source mix</p></article>
      <article className="risk"><span>LIVE OUTBOUND</span><strong>Off</strong><p>Wave 0 safety gate</p></article>
    </section>

    <div className="two-column">
      <section className="panel review-panel">
        <div className="panel-title"><div><span>TODAY’S PRIORITY</span><h2>Evidence review</h2></div><button type="button" onClick={() => setView("Review Queue")}>Open queue →</button></div>
        <div className="signal-list">
          {items.slice(0, 3).map((item) => <SignalRow key={item.company} item={item} />)}
          {!items.length && <div className="empty">No prospects match that search.</div>}
        </div>
      </section>

      <aside className="side-stack">
        <section className="panel interview-card">
          <span className="eyebrow">KNOWLEDGE</span><h2>One policy decision can be recorded now.</h2>
          <p>Should evidence of a connected plant historian count as full data readiness, or only partial readiness until access is confirmed?</p>
          <div className="evidence-note"><b>Recommendation</b><span>Count it as partial. Connected systems show feasibility, not permission or usable access.</span></div>
          <button className="dark" type="button" onClick={() => setView("Knowledge")}>Answer in Consensus Interview</button>
        </section>
        <section className="panel run-card">
          <div className="panel-title"><div><span>SCHEDULE FIXTURE</span><h2>Not activated</h2></div><i className="pulse" /></div>
          <dl><div><dt>Planned window</dt><dd>Last success + 24h overlap</dd></div><div><dt>Runner</dt><dd>Not connected</dd></div><div><dt>Budget</dt><dd>No authority granted</dd></div></dl>
        </section>
      </aside>
    </div>

    <section className="panel discovery-tease">
      <div><span className="eyebrow">MARKET DISCOVERY</span><h2>A neighboring market may fit ONE.</h2><p>Bulk materials terminals show a similar uptime and fragmented equipment-data problem. This is a proposal—not an active market.</p></div>
      <div className="fit"><span>PRODUCT FIT</span><b>High</b><small>4 corroborating sources</small></div>
      <button className="outline" type="button" onClick={() => setView("Market Discovery")}>Review proposal</button>
    </section>
  </>;
}

function SignalRow({ item }: { item: (typeof signals)[number] }) {
  return <article className="signal-row">
    <div className="score"><b>{item.score}</b><span>/10</span></div>
    <div className="signal-copy"><div><strong>{item.company}</strong><span>· {item.target}</span></div><p>{item.signal}</p><small><b>{item.tier}</b> Synthetic source tier · {item.age} sample age · {item.status}</small></div>
    <div className="row-actions"><button type="button" disabled title="Requires a persisted, audited decision workflow">Approve disabled</button><button type="button" disabled title="Requires a persisted, audited decision workflow">Defer disabled</button></div>
  </article>;
}

function Knowledge({ setView }: { setView: (view: View) => void }) {
  const [interview, setInterview] = useState<InterviewApiState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pendingKey = useRef<string | null>(null);

  const loadInterview = useCallback(async (cancelled?: () => boolean) => {
    try {
      const response = await fetch("/api/interview", {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!response.ok) throw new Error("The secure interview could not be loaded.");
      const value = await response.json() as InterviewApiState;
      if (!cancelled?.()) {
        setInterview(value);
        setError(null);
      }
    } catch (cause) {
      if (!cancelled?.())
        setError(cause instanceof Error ? cause.message : "The secure interview could not be loaded.");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/interview", {
          credentials: "same-origin",
          cache: "no-store",
        });
        if (!response.ok) throw new Error("The secure interview could not be loaded.");
        const value = await response.json() as InterviewApiState;
        if (!cancelled) {
          setInterview(value);
          setError(null);
        }
      } catch (cause) {
        if (!cancelled)
          setError(cause instanceof Error ? cause.message : "The secure interview could not be loaded.");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function mutate(body: Record<string, unknown>) {
    if (!interview) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/interview", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
          "x-prospector-intent": "interview-mutation",
        },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        let message = "The decision was not saved.";
        try {
          const failure = await response.json() as { message?: string };
          message = failure.message ?? message;
        } catch {
          // The status is authoritative even if an intermediary returned no JSON.
        }
        throw new Error(message);
      }
      const value = await response.json() as InterviewApiState;
      pendingKey.current = null;
      setInterview(value);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The decision was not saved.");
      await loadInterview();
    } finally {
      setBusy(false);
    }
  }

  function submit() {
    if (interview?.status !== "active") return;
    pendingKey.current ??= crypto.randomUUID();
    void mutate({
      action: "submit_recommendation_answer",
      questionId: interview.question.id,
      expectedRevision: interview.question.revision,
      idempotencyKey: pendingKey.current,
    });
  }

  function confirm() {
    if (interview?.status !== "awaiting_confirmation") return;
    pendingKey.current ??= crypto.randomUUID();
    void mutate({
      action: "confirm_submitted_answer",
      answerId: interview.answer.id,
      expectedSessionRevision: interview.session.revision,
      idempotencyKey: pendingKey.current,
    });
  }

  function restartReview() {
    if (interview?.status !== "review_required") return;
    pendingKey.current ??= crypto.randomUUID();
    void mutate({
      action: "restart_unbound_review",
      idempotencyKey: pendingKey.current,
    });
  }

  return <>
    <PageHeading eyebrow="OWNER-SCOPED · LIVE D1 SLICE" title="Consensus Interview" copy="This is the first persisted workflow. Evidence and inference remain separate until your explicit confirmation is written with an audit event." />
    <div className="knowledge-layout">
      <section className="panel question-card">
        {!interview && !error && <div className="loading-state">Loading the owner-scoped interview…</div>}
        {error && <div className="error-state" role="alert">{error} <button type="button" onClick={() => { setError(null); void loadInterview(); }}>Retry</button></div>}
        {interview?.status === "uninitialized" && <>
          <span className="question-number">SECURE WORKSPACE SETUP</span>
          <h2>Initialize Digitalrain’s private knowledge workspace?</h2>
          <p className="question-copy">This creates one owner-scoped workspace, one interview session, and an append-only initialization audit event. It does not activate prospecting or external services.</p>
          <button className="primary" type="button" disabled={busy} onClick={() => void mutate({ action: "bootstrap" })}>{busy ? "Initializing…" : "Initialize secure workspace"}</button>
        </>}
        {interview?.status === "active" && <>
          <span className="question-number">QUESTION 01 · COMPANY KNOWLEDGE · REVISION {interview.question.revision}</span>
          <h2>{interview.question.prompt}</h2>
          <p className="question-copy">This records a policy proposal only. Applying it to scoring and prospecting remains a later, separately tested integration.</p>
          <div className="finding-grid"><div><b>Policy premise · not external evidence</b><p>{interview.question.premise}</p></div><div><b>Inference</b><p>{interview.question.inference}</p></div></div>
          <div className="saved">Provenance: {interview.question.provenance}</div>
          <div className="recommendation"><span>RECOMMENDED</span><b>Score 1 — partial readiness</b><p>{interview.question.recommendation}</p></div>
          <div className="answer-actions"><button className="selected" type="button" disabled={busy} onClick={submit}>{busy ? "Submitting…" : "Submit answer for confirmation"}</button><button type="button" disabled title="Correction history is the next slice">Correct disabled</button><button type="button" disabled title="Deferral history is the next slice">Defer disabled</button></div>
          <div className="saved">This first step records an answer and audit event. It does not create confirmed knowledge.</div>
        </>}
        {interview?.status === "awaiting_confirmation" && <>
          <span className="question-number">CONFIRM SUBMITTED ANSWER · SESSION REVISION {interview.session.revision}</span>
          <h2>Confirm historian connectivity as partial readiness?</h2>
          <p className="question-copy">Your submitted answer is saved, but it is not confirmed knowledge yet. This separate action creates the versioned policy and confirmation audit event.</p>
          <div className="finding-grid"><div><b>Submitted answer</b><p>Accept the recommendation: score 1, partial readiness.</p></div><div><b>Boundary</b><p>Scoring integration remains disabled and no current prospect is qualified.</p></div></div>
          <div className="recommendation"><span>READY FOR OWNER CONFIRMATION</span><b>Score 1 — partial readiness</b><p>{interview.question.recommendation}</p></div>
          <div className="answer-actions"><button className="selected" type="button" disabled={busy} onClick={confirm}>{busy ? "Confirming…" : "Confirm submitted answer"}</button><button type="button" disabled title="Reject and correction history are the next slice">Reject disabled</button><button type="button" disabled title="Rescoping is the next slice">Rescope disabled</button></div>
          <div className="saved">Submitted {new Date(interview.answer.submittedAt).toLocaleString("en-CA", { timeZone: "America/Toronto", dateStyle: "medium", timeStyle: "short" })}</div>
        </>}
        {interview?.status === "review_required" && <>
          <span className="question-number">REVIEW REQUIRED · EARLIER DECISION QUARANTINED</span>
          <h2>This policy must be reviewed again.</h2>
          <p className="question-copy">An earlier answer was saved without an immutable snapshot of the exact policy shown. It is not treated as confirmed knowledge. Restarting preserves its audit history, marks any derived knowledge superseded, and opens the corrected two-stage review.</p>
          <div className="answer-actions"><button className="selected" type="button" disabled={busy} onClick={restartReview}>{busy ? "Restarting…" : "Start corrected review"}</button></div>
        </>}
        {interview?.status === "confirmed" && <>
          <span className="question-number">CONFIRMED KNOWLEDGE · VERSIONED</span>
          <h2>Historian evidence counts as partial readiness.</h2>
          <div className="recommendation confirmed-knowledge"><span>CONFIRMED BY OWNER</span><b>Score {interview.confirmed.value.score} — {interview.confirmed.value.classification.replaceAll("_", " ")}</b><p>{interview.confirmed.value.rationale}</p></div>
          <dl className="confirmation-proof"><div><dt>Knowledge version</dt><dd>{interview.confirmed.knowledgeVersionId}</dd></div><div><dt>Audit event</dt><dd>{interview.confirmed.auditEventId}</dd></div><div><dt>Confirmed</dt><dd>{new Date(interview.confirmed.confirmedAt).toLocaleString("en-CA", { timeZone: "America/Toronto", dateStyle: "medium", timeStyle: "short" })}</dd></div></dl>
          <div className="saved">Recorded in D1. Applying this policy to scoring and prospecting remains disabled pending integration proof.</div>
        </>}
      </section>
      <aside className="panel scope-card"><span className="eyebrow">CURRENT SCOPE</span><h3>{interview && interview.status !== "uninitialized" ? interview.workspace.companyName : "Digitalrain"}</h3><ol><li className={interview?.status === "confirmed" ? "done" : "current"}>Company knowledge <span>{interview?.status === "confirmed" ? "1 confirmed" : interview?.status === "awaiting_confirmation" ? "Awaiting confirmation" : interview?.status === "review_required" ? "Review required" : "In progress"}</span></li><li>Product · ONE <span>Fixture only</span></li><li>Play · Mining <span>Fixture only</span></li><li>Profile · Operating <span>Fixture only</span></li></ol><button className="outline" type="button" onClick={() => setView("Morning Brief")}>Return to brief</button></aside>
    </div>
  </>;
}

function MarketDiscovery() {
  return <><PageHeading eyebrow="PRODUCT · ONE · SYNTHETIC FIXTURE" title="Market Discovery" copy="An interaction example only. No proposal is persisted or activated." action={<button className="primary" type="button" disabled title="Available after Wave 0">Discovery disabled</button>} /><div className="proposal-grid">{discovery.map((item) => <article className="panel proposal" key={item.market}><span className="fit-pill">Synthetic · {item.fit} fit</span><h2>{item.market}</h2><p>{item.reason}</p><dl><div><dt>Likely buyer</dt><dd>{item.buyer}</dd></div><div><dt>Risk</dt><dd>Proof and language need market validation</dd></div></dl><div className="proposal-actions"><button type="button" disabled>Explore disabled</button><button type="button" disabled>Defer disabled</button><button type="button" disabled>Dismiss disabled</button></div></article>)}</div></>;
}

function ReviewQueue({ items }: { items: typeof signals }) {
  return <><PageHeading eyebrow="OPERATING SITES · SYNTHETIC FIXTURE" title="Review Queue" copy="A layout preview. Qualification and decisions are not yet operational." /><section className="panel queue"><div className="queue-head"><span>SCORE</span><span>PROSPECT & SIGNAL</span><span>EVIDENCE</span><span>DECISION</span></div>{items.map((item) => <SignalRow key={item.company} item={item} />)}</section></>;
}

function Prospects({ items }: { items: typeof signals }) {
  return <><PageHeading eyebrow="ONE FOR MINING · SYNTHETIC FIXTURE" title="Prospect Workspace" copy="A layout preview. No account or qualification shown here exists in live storage." /><section className="prospect-grid">{items.map((item) => <article className="panel prospect-card" key={item.company}><div className="prospect-top"><span>Synthetic · {item.tier}</span><b>{item.score}/10 sample</b></div><h2>{item.company}</h2><p>{item.target}</p><div className="mini-steps"><i className="on" /><i className="on" /><i /><i /><i /></div><small>Fixture candidate · not operationally qualified</small><button className="outline" type="button" disabled>Prospect disabled</button></article>)}</section></>;
}

function Exports() {
  return <><PageHeading eyebrow="PORTABILITY & HANDOFF" title="Exports & History" copy="These controls stay disabled until live eligibility and restore safety are proven." /><div className="export-grid"><section className="panel export-card"><span className="file-mark">CSV</span><h2>CRM Handoff</h2><p>Planned: one row per verified, non-suppressed contact with stable Prospect IDs and approved package references.</p><dl><div><dt>Eligible now</dt><dd>0 live prospects</dd></div><div><dt>Last export</dt><dd>Never</dd></div></dl><button className="primary" type="button" disabled title="Available after Wave 3">CSV disabled</button></section><section className="panel export-card"><span className="file-mark safe">LOCK</span><h2>Company Workspace Export</h2><p>Planned: encrypted, versioned, integrity-checked knowledge, history, objects, and suppression tombstones.</p><dl><div><dt>Restore drill</dt><dd>Not yet completed</dd></div><div><dt>Hosted retention</dt><dd>Not activated</dd></div></dl><button className="outline" type="button" disabled title="Available after Wave 0">Export disabled</button></section></div></>;
}
