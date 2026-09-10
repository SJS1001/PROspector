"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

type DemoState = "checking" | "ready" | "unavailable";
type Stage = Readonly<{ id: string; immutableDigest: string; predecessorId?: string; predecessorDigest?: string }>;
type Composition = Readonly<{
  kind: "local_demo_composition";
  fictional: true;
  disposable: true;
  prospect: Stage & { qualification: "qualified" };
  ownerProspectApproval: Stage & { decision: "approved" };
  contactSuggestion: Stage & { state: "ContactSuggestion" };
  verificationIntent: Stage & { providerInvocation: false; verified: false };
  contactReady: Stage & { state: "ContactReady"; admitted: false };
  package: Stage & { exact: true; admitted: false };
  message: Stage & { exact: true; admitted: false };
  suppression: Stage & { outcome: "blocked" };
  manualCallOutcome: Stage & { outcome: "not_attempted"; phoneTargetPresent: false };
  morningBrief: Stage & { actionableCount: 0 };
  weeklyPreview: Stage & { realAdmissionCount: 0 };
  crmPreview: Stage & { realAdmissionCount: 0; materializationAuthorized: false; fieldCount: 7 };
  portabilityPreview: Stage & { compatibility: "synthetic_contract_match"; restoreAuthorized: false };
  effects: { persistence: false; browserStorage: false; network: false; providerInvocation: false; outbound: false; export: false; effectCount: 0 };
}>;

const orderedKeys = ["contactSuggestion", "verificationIntent", "contactReady", "package", "message", "suppression", "manualCallOutcome", "morningBrief", "weeklyPreview", "crmPreview", "portabilityPreview"] as const;

export function normalizeLocalDemoComposition(value: unknown): Composition | null {
  if (!value || typeof value !== "object") return null;
  const body = value as Record<string, unknown>;
  if (body.kind !== "local_demo_composition" || body.fictional !== true || body.disposable !== true) return null;
  const prospect = body.prospect as Stage | undefined;
  if (!prospect || typeof prospect.id !== "string" || typeof prospect.immutableDigest !== "string") return null;
  const approval = body.ownerProspectApproval as Stage & { reviewedProspectId?: string; reviewedProspectDigest?: string } | undefined;
  if (!approval || approval.reviewedProspectId !== prospect.id || approval.reviewedProspectDigest !== prospect.immutableDigest) return null;
  let predecessor = approval;
  for (const key of orderedKeys) {
    const stage = body[key] as Stage | undefined;
    if (!stage || stage.predecessorId !== predecessor.id || stage.predecessorDigest !== predecessor.immutableDigest) return null;
    predecessor = stage;
  }
  const effects = body.effects as Record<string, unknown> | undefined;
  if (!effects || effects.effectCount !== 0 || Object.entries(effects).some(([key, state]) => key !== "effectCount" && state !== false)) return null;
  const crm = body.crmPreview as Record<string, unknown>;
  if (crm.materializationAuthorized !== false || crm.realAdmissionCount !== 0) return null;
  return body as Composition;
}

export function LocalDemoScreen() {
  const [state, setState] = useState<DemoState>("checking");
  const [composition, setComposition] = useState<Composition | null>(null);

  useEffect(() => {
    let mounted = true;
    void fetch("/api/local-demo/composition", { method: "POST", cache: "no-store", credentials: "same-origin" })
      .then(async (response) => response.ok ? normalizeLocalDemoComposition(await response.json()) : null)
      .then((result) => {
        if (!mounted) return;
        setComposition(result);
        setState(result ? "ready" : "unavailable");
      })
      .catch(() => { if (mounted) setState("unavailable"); });
    return () => { mounted = false; };
  }, []);

  return (
    <main className="local-demo-screen" data-local-demo-visible="true" data-demo-state={state}>
      <header>
        <span>LOCAL_DEMO · FICTIONAL · ZERO EFFECT</span>
        <h1>Supported Phase 4–7 local journey</h1>
        <p>One deterministic, disposable composition. It grants no production, provider, persistence, outbound, export, or restore authority.</p>
        <Link href="/?view=knowledge">Open Consensus Knowledge <span aria-hidden="true">→</span></Link>
        <p role="status" aria-live="polite">{state === "checking" ? "Checking the guarded composition…" : state === "ready" ? "Guarded composition ready." : "Local demo unavailable."}</p>
      </header>
      {composition ? <CompositionJourney composition={composition} /> : null}
    </main>
  );
}

function CompositionJourney({ composition }: Readonly<{ composition: Composition }>) {
  return (
    <div data-composition-id="local-demo-phase4-through-phase7-v1">
      <section><h2>Phase 4 · Profile and Prospect review</h2><p>Qualified fictional Prospect; owner review: {composition.ownerProspectApproval.decision}.</p></section>
      <section><h2>Phase 5 · Fictional contact review</h2><p>{composition.contactSuggestion.state} → {composition.contactReady.state}-shaped only. Provider invoked: no; admitted: no.</p></section>
      <section><h2>Phase 6 · Package, Message, and current-state checks</h2><ol><li>Exact Package reviewed before Message.</li><li>Exact Message reviewed after Package.</li><li>Suppression result: blocked.</li><li>Manual-call outcome: not attempted; no phone target exists.</li></ol></section>
      <section><h2>Phase 7 · Morning Brief</h2><p>Actionable real items: {composition.morningBrief.actionableCount}. Fictional projection only.</p></section>
      <section><h2>Phase 7 · Weekly result</h2><p>Real admissions: {composition.weeklyPreview.realAdmissionCount}. All displayed outcomes are synthetic metadata.</p></section>
      <section><h2>Phase 7 · CRM handoff precondition</h2><dl><dt>Eligible rows</dt><dd>{composition.crmPreview.realAdmissionCount}</dd><dt>Field count</dt><dd>{composition.crmPreview.fieldCount}</dd><dt>Materialization</dt><dd>refused</dd></dl><p>Only synthetic schema metadata is shown; no export payload is created.</p></section>
      <section><h2>Phase 7 · Portability compatibility</h2><dl><dt>Compatibility</dt><dd>{composition.portabilityPreview.compatibility}</dd><dt>Restore authority</dt><dd>{String(composition.portabilityPreview.restoreAuthorized)}</dd></dl></section>
      <footer><p>Effects: {composition.effects.effectCount}. No writes, network calls, provider invocations, outbound actions, exports, browser storage, or durable state.</p></footer>
    </div>
  );
}
