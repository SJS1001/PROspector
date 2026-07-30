"use client";

import { useState } from "react";

const boundary = "This is a Product-level market suggestion, not an accepted Customer Profile. Explore opens a Draft Market Play interview; it does not make a Profile Ready or start prospecting.";
export type Proposal = Record<string, unknown>;

export function ProposalCards({ authority, proposals, triggerLabel, pendingProposalId, onDecision }: { authority: string; proposals: readonly Proposal[]; triggerLabel: string; pendingProposalId: string | null; onDecision: (proposal: Proposal, decision: "explore" | "defer" | "dismiss", fields?: { reason?: string; reviewAt?: number; confirmed?: boolean }) => void }) {
  if (authority !== "known" || !proposals.every(isAuthoritativeProposal)) return <section className="panel discovery-unknown" role="alert"><h2>Authoritative discovery results could not be verified. Reload this view.</h2></section>;
  const surfaced = proposals.slice(0, 3);
  return <section className="proposal-cards" aria-label="Market Play proposals"><p className="proposal-count">{surfaced.length} of 3 proposals surfaced for this {triggerLabel} run</p>{surfaced.map((proposal) => <ProposalCard key={proposal.id} proposal={proposal} pending={pendingProposalId === proposal.id} onDecision={onDecision} />)}</section>;
}

export function isAuthoritativeProposal(value: unknown): value is Proposal {
  const proposal = objectValue(value);
  if (!proposal || !opaqueId(proposal.id) || !opaqueId(proposal.versionId) || !positiveRevision(proposal.version) || !positiveRevision(proposal.revision) || !digest(proposal.digest) || !digest(proposal.fingerprint) || !["new", "deferred", "dismissed", "explored"].includes(stringValue(proposal.status, ""))) return false;
  if (!["marketCategory", "audience", "problemFamily", "problemMatch", "likelyBuyer", "inference", "productFit"].every((field) => text(proposal[field]))) return false;
  if (!stringList(proposal.examples) || !stringList(proposal.risks) || !evidenceList(proposal.evidence)) return false;
  const run = objectValue(proposal.run); const configuration = objectValue(proposal.configuration);
  if (!run || !opaqueId(run.id) || !configuration || !opaqueId(configuration.id) || !digest(configuration.digest)) return false;
  if (proposal.rank !== null && (!Number.isSafeInteger(proposal.rank) || Number(proposal.rank) < 1 || Number(proposal.rank) > 3)) return false;
  if (!objectValue(proposal.collision) || !Array.isArray(proposal.evidenceLineage) || !Array.isArray(proposal.decisions) || typeof proposal.reopened !== "boolean") return false;
  if (proposal.cooldown !== null && (!objectValue(proposal.cooldown) || !positiveTimestamp(objectValue(proposal.cooldown)?.until))) return false;
  return proposal.decisions.every(validDecision);
}

function ProposalCard({ proposal, pending, onDecision }: { proposal: Proposal; pending: boolean; onDecision: (proposal: Proposal, decision: "explore" | "defer" | "dismiss", fields?: { reason?: string; reviewAt?: number; confirmed?: boolean }) => void }) {
  const [deferReason, setDeferReason] = useState(""); const [reviewDate, setReviewDate] = useState(defaultReviewDate()); const [dismissReason, setDismissReason] = useState(""); const [confirmed, setConfirmed] = useState(false);
  const decisions = Array.isArray(proposal.decisions) ? proposal.decisions as Proposal[] : [];
  const decided = decisions.length > 0 || ["deferred", "dismissed", "explored"].includes(proposal.status);
  const examples = Array.isArray(proposal.examples) ? proposal.examples.join(", ") : "";
  const risks = Array.isArray(proposal.risks) ? proposal.risks.join(", ") : "";
  const evidence = Array.isArray(proposal.evidence) ? proposal.evidence.filter((entry): entry is Proposal => Boolean(entry) && typeof entry === "object") : [];
  const run = objectValue(proposal.run); const configuration = objectValue(proposal.configuration); const cooldown = objectValue(proposal.cooldown); const collision = objectValue(proposal.collision);
  return <article className="panel proposal-card"><header><span className="readiness-badge">Market Play Proposal · {title(stringValue(proposal.status))}</span><code>{stringValue(proposal.id)}</code></header><h2>{stringValue(proposal.marketCategory)}</h2><p>{stringValue(proposal.problemFamily)}</p><p className="proposal-boundary">{boundary}</p><dl><Entry label="Problem match" value={proposal.problemMatch}/><Entry label="Customer audience" value={proposal.audience}/><Entry label="Likely buyer" value={proposal.likelyBuyer}/><Entry label="Examples" value={examples}/><Entry label="Product fit" value={proposal.productFit}/><Entry label="Risks / limitations" value={risks}/><Entry label="Fingerprint" value={proposal.fingerprint}/><Entry label="Proposal digest" value={proposal.digest}/><Entry label="Run" value={run?.id}/><Entry label="Configuration" value={configuration?.id}/></dl><section><h3>Suggested context — not a Customer Profile</h3><p>Audience, likely buyer, and examples are a Product-level suggestion only.</p></section><section><h3>Evidence</h3>{evidence.map((e, index) => <article className="evidence" key={`${stringValue(e.reference)}-${index}`}><b>{stringValue(e.title, "Source")}</b><span>{stringValue(e.domain, stringValue(e.reference))}</span><p>{stringValue(e.excerpt)}</p><code>{stringValue(e.reference)}</code></article>)}</section>{proposal.inference && <section><h3>Inference</h3><p>{stringValue(proposal.inference)}</p></section>}<details><summary>Collision, cooldown, and immutable history</summary><p>{typeof cooldown?.until === "number" ? `Cooldown until ${new Date(cooldown.until).toLocaleDateString("en-CA")}` : "No cooldown is projected."}</p><p>{collision?.relationship ? `Collision relationship: ${stringValue(collision.relationship)}` : "No collision is projected."}</p>{decisions.map((decision, index) => <p key={index}>{title(stringValue(decision.decision, "decision"))} · {stringValue(decision.reason, "immutable owner decision")}</p>)}</details>{decided ? <p className="immutable-result" aria-live="polite">Immutable owner decision recorded. Competing actions remain unavailable.</p> : <fieldset disabled={pending}><legend className="sr-only">Proposal decision controls</legend><button className="primary" type="button" onClick={() => onDecision(proposal, "explore", { confirmed: true })}>{pending ? "Exploring Market Play…" : "Explore this Market Play"}</button><details><summary>Defer proposal</summary><label>Reason<input value={deferReason} onChange={(event) => setDeferReason(event.target.value)} required /></label><label>Review on<input type="date" value={reviewDate} onChange={(event) => setReviewDate(event.target.value)} required /></label><button type="button" disabled={!deferReason || !reviewDate} onClick={() => onDecision(proposal, "defer", { reason: deferReason, reviewAt: Date.parse(`${reviewDate}T12:00:00Z`) })}>{pending ? "Deferring proposal…" : "Defer proposal"}</button></details><details><summary>Dismiss proposal</summary><label>Reason<input value={dismissReason} onChange={(event) => setDismissReason(event.target.value)} required /></label><label><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /> I confirm this immutable dismissal.</label><button className="destructive" type="button" disabled={!dismissReason || !confirmed} onClick={() => onDecision(proposal, "dismiss", { reason: dismissReason, confirmed: true })}>{pending ? "Dismissing proposal…" : "Dismiss proposal"}</button></details></fieldset>}</article>;
}
function Entry({ label, value }: { label: string; value: unknown }) { return <div><dt>{label}</dt><dd>{typeof value === "string" && /^(?:[0-9a-f]{32,}|[\w-]+$)/i.test(value) ? <code>{value}</code> : String(value ?? "Not included in projection")}</dd></div>; }
function defaultReviewDate() { const date = new Date(); date.setDate(date.getDate() + 90); return date.toISOString().slice(0, 10); }
function title(value: string) { return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function stringValue(value: unknown, fallback = "Not included in projection") { return typeof value === "string" ? value : fallback; }
function objectValue(value: unknown) { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null; }
function opaqueId(value: unknown) { return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
function digest(value: unknown) { return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value); }
function positiveRevision(value: unknown) { return Number.isSafeInteger(value) && Number(value) > 0; }
function positiveTimestamp(value: unknown) { return Number.isSafeInteger(value) && Number(value) > 0; }
function text(value: unknown) { return typeof value === "string" && value.trim().length > 0; }
function stringList(value: unknown) { return Array.isArray(value) && value.every(text); }
function evidenceList(value: unknown) { return Array.isArray(value) && value.length > 0 && value.every((entry) => { const evidence = objectValue(entry); return Boolean(evidence && text(evidence.reference) && text(evidence.publisher) && text(evidence.excerpt) && positiveTimestamp(evidence.observedAt) && digest(evidence.materialEvidenceFingerprint)); }); }
function validDecision(value: unknown) { const decision = objectValue(value); return Boolean(decision && opaqueId(decision.id) && ["explore", "defer", "dismiss"].includes(stringValue(decision.decision, "")) && ["explored", "deferred", "dismissed"].includes(stringValue(decision.status, "")) && digest(decision.digest) && opaqueId(decision.proposalId) && opaqueId(decision.proposalVersionId) && typeof decision.immutable === "boolean"); }
