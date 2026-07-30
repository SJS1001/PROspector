"use client";

import { useEffect, useRef } from "react";

export type ReadinessProjection = {
  product: { id: string; name: string; revision: number; lifecycle: string };
  checklist: Array<{ category: string; status: string; condition?: string; versions?: Array<{ id: string; digest: string }> }>;
  confirmedVersions?: Array<{ id: string; digest: string; category?: string }>;
  configuration?: { id: string; digest: string; active?: boolean; immutable?: boolean } | null;
  initialRun?: { id: string; configurationId?: string; configurationDigest?: string; executionState?: string } | null;
  monthlySchedule?: { id: string; cadence?: string; executionState?: string; nextRunAt?: number } | null;
  manualDiscovery?: { available?: boolean; executionState?: string } | null;
  descendants?: { marketPlays?: number; customerProfiles?: number; offers?: number };
};

const categories = ["Capabilities", "Limitations", "Delivery", "Proof", "Ownership", "Claim guardrails", "Source policy", "Market-discovery policy", "Default runner policy"];

export function ProductReadinessView({ projection, pending, onMakeReady, onDiscover }: {
  projection: ReadinessProjection & { authority?: string; completeCount?: number };
  pending: string | null;
  onMakeReady: () => void;
  onDiscover: () => void;
}) {
  const result = useRef<HTMLHeadingElement>(null);
  const checklist = categories.map((category) => projection.checklist.find((item) => item.category === category) ?? { category, status: "missing", condition: "Not included in the authoritative projection.", versions: [] });
  const complete = projection.completeCount ?? checklist.filter((item) => item.status === "confirmed").length;
  const isReady = projection.product.lifecycle === "ready" && Boolean(projection.configuration);
  const canReady = complete === 9 && projection.product.lifecycle === "draft" && !pending;
  const canDiscover = isReady && projection.manualDiscovery?.available === true && !pending;
  useEffect(() => { if (isReady && !pending) result.current?.focus(); }, [isReady, pending]);

  return <section className="discovery-readiness" aria-label="Product readiness">
    <article className="panel readiness-summary">
      <div><span className={`readiness-badge readiness-${projection.product.lifecycle}`}>{label(projection.product.lifecycle)}</span><h2 tabIndex={-1} ref={result}>{isReady ? "Product Ready" : "Product readiness"}</h2></div>
      <p>Product: <b>{projection.product.name}</b> · revision <code>{projection.product.revision}</code></p>
      <p><b>{complete} of 9 confirmed</b>. {isReady ? "Discovery remains Product-scoped and immutable." : "Review every Product policy requirement before activation."}</p>
    </article>
    <section className="panel readiness-checklist"><h2>Confirmed Product policy</h2><ol>{checklist.map((item) => <li key={item.category} className={item.status === "confirmed" ? "confirmed" : "attention"}><div><b>{item.category}</b><span>{label(item.status)}</span></div><p>{item.condition ?? (item.status === "confirmed" ? "Current confirmed Product knowledge is present." : "A current confirmed Product knowledge version is required.")}</p>{item.versions?.length ? <ul>{item.versions.map((version) => <li key={version.id}><code>{version.id}</code><code>{version.digest}</code></li>)}</ul> : <p className="control-reason">No confirmed immutable version is projected.</p>}<a href="#knowledge">Review in Knowledge</a></li>)}</ol></section>
    {!isReady && <article className="panel readiness-action"><h2>Readiness consequence</h2><p>Creating readiness creates an immutable Product Discovery Configuration, queues one initial Market Discovery Run, and schedules monthly discovery. It does not create or activate a Market Play, Customer Profile, Offer, prospect, contact, or outbound effect.</p><button className="primary" type="button" disabled={!canReady} onClick={onMakeReady}>{pending === "ready" ? "Creating Product Discovery Configuration…" : "Make Product Ready"}</button>{!canReady && <p className="control-reason">Complete every confirmed Product policy item before readiness can be activated.</p>}</article>}
    {projection.configuration && <article className="panel configuration-card"><h2>Product Discovery Configuration</h2><p><b>{projection.configuration.active ? "Active" : "Historical"}</b> · Product: {projection.product.name}</p><dl><div><dt>Configuration ID</dt><dd><code>{projection.configuration.id}</code></dd></div><div><dt>Canonical digest</dt><dd><code>{projection.configuration.digest}</code></dd></div><div><dt>Scope</dt><dd>This Product configuration is valid with zero Market Plays, Customer Profiles, or Offers.</dd></div>{projection.initialRun && <div><dt>Initial run</dt><dd><code>{projection.initialRun.id}</code> · {label(projection.initialRun.executionState)}</dd></div>}{projection.monthlySchedule && <div><dt>Monthly schedule</dt><dd><code>{projection.monthlySchedule.id}</code> · {projection.monthlySchedule.cadence ?? "monthly"}</dd></div>}</dl></article>}
    <article className="panel manual-discovery"><h2>Market Discovery</h2><p>Manual discovery produces at most three Market Play proposals. It cannot create a Customer Profile or start prospecting.</p><button className="primary" type="button" disabled={!canDiscover} onClick={onDiscover}>{pending === "discover" ? "Queuing Market Discovery…" : "Discover markets"}</button>{!canDiscover && <p className="control-reason">{isReady ? "Market Discovery is unavailable until its server capability is effectively available." : "Make this Product Ready before running Market Discovery."}</p>}</article>
    <article className="panel future-phase-control"><button type="button" disabled>Find prospects</button><p>Available after a Customer Profile is Ready in a later governed phase.</p></article>
  </section>;
}

function label(value: string | undefined) { return (value ?? "unknown").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
