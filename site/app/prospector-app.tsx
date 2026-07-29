"use client";

import { useMemo, useState } from "react";

type View = "Morning Brief" | "Knowledge" | "Market Discovery" | "Review Queue" | "Prospects" | "Exports & History";

const views: { label: View; key: string }[] = [
  { label: "Morning Brief", key: "01" },
  { label: "Knowledge", key: "02" },
  { label: "Market Discovery", key: "03" },
  { label: "Review Queue", key: "04" },
  { label: "Prospects", key: "05" },
  { label: "Exports & History", key: "06" },
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

export function ProspectorApp() {
  const [view, setView] = useState<View>("Morning Brief");
  const [profile, setProfile] = useState("Operating sites");
  const [decisions, setDecisions] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");

  const filteredSignals = useMemo(
    () => signals.filter((item) => `${item.company} ${item.target} ${item.signal}`.toLowerCase().includes(query.toLowerCase())),
    [query],
  );

  function decide(company: string, decision: string) {
    setDecisions((current) => ({ ...current, [company]: decision }));
  }

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
              {item.label === "Review Queue" && <em>4</em>}
            </button>
          ))}
        </nav>

        <div className="rail-foot">
          <div className="runner"><i /><div><b>Codex runner</b><span>Connected · advisory</span></div></div>
          <button type="button" onClick={() => setView("Knowledge")}>Workspace settings <span>→</span></button>
        </div>
      </aside>

      <section className="canvas">
        <header className="topbar">
          <div className="crumbs"><span>Digitalrain</span><b>/</b><span>ONE</span><b>/</b><strong>ONE for Mining</strong></div>
          <div className="top-actions">
            <label className="search"><span>⌕</span><input aria-label="Search prospects" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search" /></label>
            <button className="quiet" type="button">Last run 06:00</button>
            <div className="avatar" title="Owner">SS</div>
          </div>
        </header>

        <div className="content">
          {view === "Morning Brief" && <MorningBrief profile={profile} setProfile={setProfile} query={query} items={filteredSignals} decisions={decisions} decide={decide} setView={setView} />}
          {view === "Knowledge" && <Knowledge setView={setView} />}
          {view === "Market Discovery" && <MarketDiscovery />}
          {view === "Review Queue" && <ReviewQueue items={filteredSignals} decisions={decisions} decide={decide} />}
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

function MorningBrief({ profile, setProfile, items, decisions, decide, setView }: { profile: string; setProfile: (value: string) => void; query: string; items: typeof signals; decisions: Record<string, string>; decide: (company: string, decision: string) => void; setView: (view: View) => void }) {
  return <>
    <PageHeading eyebrow="WEDNESDAY · 29 JULY" title="Good morning, Steven." copy="Your evidence-backed work for today, separated from what still needs judgment." action={<button className="primary" type="button">Run prospecting <span>↗</span></button>} />

    <div className="context-strip">
      <div><span>PRODUCT</span><b>ONE</b><small>Ready</small></div>
      <div><span>MARKET PLAY</span><b>ONE for Mining</b><small>Ready</small></div>
      <label><span>CUSTOMER PROFILE</span><select value={profile} onChange={(event) => setProfile(event.target.value)}><option>Operating sites</option><option>Greenfield projects</option></select><small className={profile === "Operating sites" ? "ready" : "draft"}>{profile === "Operating sites" ? "Ready · weekdays 06:00" : "Draft · runs disabled"}</small></label>
    </div>

    <section className="metrics" aria-label="Weekly metrics">
      <article><span>EXPORT-READY THIS WEEK</span><strong>3 <small>/ 7</small></strong><div className="meter"><i style={{ width: "43%" }} /></div><p>4 remain · quality gates unchanged</p></article>
      <article><span>AWAITING YOUR REVIEW</span><strong>{Object.keys(decisions).length ? 4 - Object.keys(decisions).length : 4}</strong><p>2 high-confidence · 2 need context</p></article>
      <article><span>ACTIVE SIGNALS</span><strong>11</strong><p>8 Tier 1 · 3 independent Tier 2</p></article>
      <article className="risk"><span>OUTBOUND PAUSED</span><strong>0</strong><p>No drift or suppression conflicts</p></article>
    </section>

    <div className="two-column">
      <section className="panel review-panel">
        <div className="panel-title"><div><span>TODAY’S PRIORITY</span><h2>Evidence review</h2></div><button type="button" onClick={() => setView("Review Queue")}>Open queue →</button></div>
        <div className="signal-list">
          {items.slice(0, 3).map((item) => <SignalRow key={item.company} item={item} decision={decisions[item.company]} decide={decide} />)}
          {!items.length && <div className="empty">No prospects match that search.</div>}
        </div>
      </section>

      <aside className="side-stack">
        <section className="panel interview-card">
          <span className="eyebrow">KNOWLEDGE</span><h2>One decision will sharpen the next run.</h2>
          <p>Should evidence of a connected plant historian count as full data readiness, or only partial readiness until access is confirmed?</p>
          <div className="evidence-note"><b>Recommendation</b><span>Count it as partial. Connected systems show feasibility, not permission or usable access.</span></div>
          <button className="dark" type="button" onClick={() => setView("Knowledge")}>Answer in Consensus Interview</button>
        </section>
        <section className="panel run-card">
          <div className="panel-title"><div><span>NEXT RUN</span><h2>Thursday, 06:00</h2></div><i className="pulse" /></div>
          <dl><div><dt>Window</dt><dd>Last success + 24h overlap</dd></div><div><dt>Runner</dt><dd>Codex · scoped context</dd></div><div><dt>Budget</dt><dd>No paid enrichment</dd></div></dl>
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

function SignalRow({ item, decision, decide }: { item: (typeof signals)[number]; decision?: string; decide: (company: string, decision: string) => void }) {
  return <article className="signal-row">
    <div className="score"><b>{item.score}</b><span>/10</span></div>
    <div className="signal-copy"><div><strong>{item.company}</strong><span>· {item.target}</span></div><p>{item.signal}</p><small><b>{item.tier}</b> Primary evidence · {item.age} ago</small></div>
    {decision ? <div className={`decision ${decision.toLowerCase()}`}>{decision}</div> : <div className="row-actions"><button type="button" onClick={() => decide(item.company, "Approved")}>Approve</button><button type="button" onClick={() => decide(item.company, "Deferred")}>Defer</button></div>}
  </article>;
}

function Knowledge({ setView }: { setView: (view: View) => void }) {
  const [answer, setAnswer] = useState<string | null>(null);
  return <>
    <PageHeading eyebrow="CONFIRMED KNOWLEDGE" title="Consensus Interview" copy="One question at a time. Evidence and inference stay separate until you confirm the decision." />
    <div className="knowledge-layout">
      <section className="panel question-card">
        <span className="question-number">QUESTION 08 OF 11 · OPERATING SITES</span>
        <h2>How should historian evidence affect data-readiness scoring?</h2>
        <p className="question-copy">A public source confirms that a site operates a connected plant historian, but does not confirm that Digitalrain could access the data.</p>
        <div className="finding-grid"><div><b>Evidence</b><p>A connected historian makes technical integration plausible.</p></div><div><b>Inference</b><p>Access, quality, and internal permission are still unknown.</p></div></div>
        <div className="recommendation"><span>RECOMMENDED</span><b>Score 1 — partial readiness</b><p>Reserve score 2 for sourced evidence that usable operational data is accessible.</p></div>
        <div className="answer-actions"><button className={answer === "accept" ? "selected" : ""} type="button" onClick={() => setAnswer("accept")}>Accept recommendation</button><button className={answer === "correct" ? "selected" : ""} type="button" onClick={() => setAnswer("correct")}>Correct it</button><button className={answer === "defer" ? "selected" : ""} type="button" onClick={() => setAnswer("defer")}>Decide later</button></div>
        {answer && <div className="saved">Decision staged. Confirmed knowledge changes only when you finish this step.</div>}
      </section>
      <aside className="panel scope-card"><span className="eyebrow">CURRENT SCOPE</span><h3>Operating sites</h3><ol><li className="done">Company <span>Confirmed</span></li><li className="done">Product · ONE <span>Ready</span></li><li className="done">Play · Mining <span>Ready</span></li><li className="current">Profile · Operating <span>8 / 11</span></li></ol><button className="outline" type="button" onClick={() => setView("Morning Brief")}>Return to brief</button></aside>
    </div>
  </>;
}

function MarketDiscovery() {
  const [choice, setChoice] = useState<Record<string, string>>({});
  return <><PageHeading eyebrow="PRODUCT · ONE" title="Market Discovery" copy="Evidence-backed places ONE may fit. Nothing activates until you explore and confirm it." action={<button className="primary" type="button">Discover markets</button>} /><div className="proposal-grid">{discovery.map((item) => <article className="panel proposal" key={item.market}><span className="fit-pill">{item.fit} fit</span><h2>{item.market}</h2><p>{item.reason}</p><dl><div><dt>Likely buyer</dt><dd>{item.buyer}</dd></div><div><dt>Risk</dt><dd>Proof and language need market validation</dd></div></dl>{choice[item.market] ? <div className="saved">Marked {choice[item.market]}</div> : <div className="proposal-actions"><button type="button" onClick={() => setChoice({ ...choice, [item.market]: "Explore" })}>Explore</button><button type="button" onClick={() => setChoice({ ...choice, [item.market]: "Deferred" })}>Defer</button><button type="button" onClick={() => setChoice({ ...choice, [item.market]: "Dismissed" })}>Dismiss</button></div>}</article>)}</div></>;
}

function ReviewQueue({ items, decisions, decide }: { items: typeof signals; decisions: Record<string, string>; decide: (company: string, decision: string) => void }) {
  return <><PageHeading eyebrow="OPERATING SITES" title="Review Queue" copy="Qualification is explainable. Your decision controls whether enrichment can begin." /><section className="panel queue"><div className="queue-head"><span>SCORE</span><span>PROSPECT & SIGNAL</span><span>EVIDENCE</span><span>DECISION</span></div>{items.map((item) => <SignalRow key={item.company} item={item} decision={decisions[item.company]} decide={decide} />)}</section></>;
}

function Prospects({ items }: { items: typeof signals }) {
  return <><PageHeading eyebrow="ONE FOR MINING" title="Prospect Workspace" copy="Account identity is shared. Evidence, qualification, contacts, and outreach remain play-specific." /><section className="prospect-grid">{items.map((item) => <article className="panel prospect-card" key={item.company}><div className="prospect-top"><span>{item.tier}</span><b>{item.score}/10</b></div><h2>{item.company}</h2><p>{item.target}</p><div className="mini-steps"><i className="on" /><i className="on" /><i /><i /><i /></div><small>Qualified · awaiting operator review</small><button className="outline" type="button">Open prospect</button></article>)}</section></>;
}

function Exports() {
  return <><PageHeading eyebrow="PORTABILITY & HANDOFF" title="Exports & History" copy="CRM handoff stays separate from a complete, restorable Company Workspace export." /><div className="export-grid"><section className="panel export-card"><span className="file-mark">CSV</span><h2>CRM Handoff</h2><p>One row per verified, non-suppressed contact with stable Prospect IDs and approved package references.</p><dl><div><dt>Eligible now</dt><dd>3 prospects · 5 contacts</dd></div><div><dt>Last export</dt><dd>Never</dd></div></dl><button className="primary" type="button">Preview CSV</button></section><section className="panel export-card"><span className="file-mark safe">LOCK</span><h2>Company Workspace Export</h2><p>Encrypted, versioned, integrity-checked knowledge, history, objects, and suppression tombstones.</p><dl><div><dt>Restore drill</dt><dd>Required before activation</dd></div><div><dt>Hosted retention</dt><dd>7 days</dd></div></dl><button className="outline" type="button">Prepare export</button></section></div></>;
}
