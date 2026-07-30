"use client";

import { useEffect, useRef, useState } from "react";
import type { CommercialHierarchyNode } from "../../domain/commercial-model";
import type { DependencyEdge, ReachedArtifact } from "../../domain/drift";
import { CommercialDestinationSelect, resolveProjectedCommercialDestination, selectedCommercialDestination } from "./commercial-destination-select";

type PublicScopeType = "company" | "product" | "market_play" | "customer_profile" | "offer";
type ProjectedDestination = { scopeType: PublicScopeType; id: string; locator?: string };
type DriftReviewBinding = { action: "review_knowledge_proposal"; proposalId: string; expectedRevision: number; predecessorVersionId: string; destination: ProjectedDestination; decisions: readonly DriftDecision[] };
type DriftDecision = "accept" | "reject" | "correct" | "rescope";
type CandidateArtifact = { artifactId: string; artifactType?: string; status?: string };
export type DriftProjection = {
  id: string;
  riskKind: string;
  status: "eligible" | "open" | "resolved" | string;
  currentVersionId?: string;
  proposedVersionId?: string;
  currentValue?: string | null;
  proposedValue?: string | null;
  provenance?: Record<string, unknown> | null;
  destination?: ProjectedDestination;
  review?: DriftReviewBinding | null;
  paths?: readonly string[];
  artifacts?: readonly ReachedArtifact[];
  counts?: Record<string, unknown>;
  containment?: string | null;
  impactDigest?: string | null;
  replacementCandidateId?: string | null;
  candidate?: Omit<ReplacementCandidateCommand, "operationKey"> | null;
  dependencyKnowledgeVersionIds?: readonly string[];
};
export type ReplacementProjection = {
  id: string;
  revision: number;
  status: string;
  digest?: string;
  currentConfigurationId?: string | null;
  candidateConfigurationId?: string | null;
  impactDigest?: string | null;
  proposedVersionId?: string | null;
  expectedOwnerRevision?: number;
  driftDecision?: string | null;
  previousSnapshot?: { id: string; digest?: string | null; manifest?: Record<string, unknown> | null } | null;
  candidateSnapshot?: { id: string; digest?: string | null; manifest?: Record<string, unknown> | null } | null;
  activation?: { id: string; activatedAt: number; activatedBy?: string | null; auditEventId?: string | null; previousConfigurationId?: string | null; nextConfigurationId: string; expectedOwnerRevision: number } | null;
  activatedAt?: number | null;
  activatedBy?: string | null;
  auditEventId?: string | null;
  immutable?: true;
};
export type ReplacementCandidateCommand = { currentVersionId: string; proposedVersionId: string; ownerType: "product" | "profile"; ownerId: string; kind: "product_discovery" | "profile_effective"; manifest: Record<string, unknown>; riskKind: string; dependencyEdges: readonly DependencyEdge[]; artifacts: readonly CandidateArtifact[]; expectedOwnerRevision: number; operationKey: string };
export type DriftReviewCommand = { proposalId: string; expectedRevision: number; predecessorVersionId: string; decision: DriftDecision; correction?: { excerpt: string }; destination?: { scopeType: PublicScopeType; id: string; locator: string }; operationKey: string };
export type ReplacementActivationCommand = { candidateId: string; impactDigest: string; expectedOwnerRevision: number; expectedCandidateRevision: number; operationKey: string };
const NO_DESTINATIONS: readonly CommercialHierarchyNode[] = [];

export function DriftReplacementsView({
  drift,
  candidates,
  destinations = NO_DESTINATIONS,
  operationKey,
  onCreateCandidate,
  onReviewDrift,
  onActivateReplacement,
  pendingAction,
  issue,
}: {
  drift: readonly DriftProjection[];
  candidates: readonly ReplacementProjection[];
  destinations?: readonly CommercialHierarchyNode[];
  operationKey: string;
  onCreateCandidate(command: ReplacementCandidateCommand): void;
  onReviewDrift(command: DriftReviewCommand): void;
  onActivateReplacement(command: ReplacementActivationCommand): void;
  pendingAction?: string | null;
  issue?: string | null;
}) {
  if (issue) return <section className="error-state" role="alert">Drift authority is unknown: {issue}. Candidate, review, and activation controls are hidden until the current version can be checked.</section>;
  const unresolved = drift.filter((item) => item.status !== "resolved");
  const resolved = drift.filter((item) => item.status === "resolved");
  return <section className="drift-replacements-view">
    <section className="panel"><h2>Drift &amp; Replacements</h2><p>Unresolved drift appears first. Candidate creation, Drift review, and replacement activation are separate exact-snapshot decisions.</p></section>
    {unresolved.map((item) => <DriftCard key={item.id} item={item} destinations={destinations} operationKey={operationKey} onCreateCandidate={onCreateCandidate} onReviewDrift={onReviewDrift} pendingAction={pendingAction} />)}
    {!unresolved.length && <section className="panel"><h3>No unresolved knowledge drift</h3><p>Confirmed knowledge and active configurations currently have no recorded differences requiring owner review.</p></section>}
    <section aria-label="Replacement candidates">{candidates.map((candidate) => <CandidateCard key={candidate.id} candidate={candidate} operationKey={operationKey} onActivateReplacement={onActivateReplacement} pendingAction={pendingAction} />)}</section>
    <details><summary>Resolved drift and activation history ({resolved.length})</summary>{resolved.map((item) => <DriftCard key={item.id} item={item} destinations={destinations} operationKey={operationKey} onCreateCandidate={onCreateCandidate} onReviewDrift={onReviewDrift} pendingAction={pendingAction} />)}</details>
  </section>;
}

function DriftCard({ item, destinations, operationKey, onCreateCandidate, onReviewDrift, pendingAction }: {
  item: DriftProjection;
  destinations: readonly CommercialHierarchyNode[];
  operationKey: string;
  onCreateCandidate(command: ReplacementCandidateCommand): void;
  onReviewDrift(command: DriftReviewCommand): void;
  pendingAction?: string | null;
}) {
  const [decision, setDecision] = useState<DriftDecision>("accept");
  const [correction, setCorrection] = useState("");
  const [destinationId, setDestinationId] = useState("");
  const artifacts = item.artifacts ?? [];
  const projectedDestination = resolveProjectedCommercialDestination(destinations, item.destination);
  const review = validReviewBinding(item.review, item, projectedDestination);
  const selectedDestination = selectedCommercialDestination(destinations, destinationId);
  const rescopeUnavailable = decision === "rescope" && !selectedDestination;
  const candidate = validCandidateBinding(item.candidate, item, destinations, projectedDestination);
  const highRisk = ["capability", "proof_point", "claim_guardrail", "offer", "suppression"].includes(item.riskKind);
  return <article className="panel">
    <span className={highRisk ? "drift-risk drift-risk--high" : "drift-risk"}>{highRisk ? "High-risk drift" : "Standard drift"} · {item.riskKind}</span>
    <h2>{item.status === "eligible" ? "Eligible replacement" : `Knowledge Drift ${item.id}`}</h2>
    <dl className="confirmation-proof">
      <div><dt>Current / proposed</dt><dd>{item.currentValue ?? "Not included in projection"} / {item.proposedValue ?? "Not included in projection"}</dd></div>
      <div><dt>Current / proposed versions</dt><dd>{item.currentVersionId ?? "Not included in projection"} / {item.proposedVersionId ?? "Not included in projection"}</dd></div>
      <div><dt>Destination</dt><dd>{projectedDestination ? `${projectedDestination.scopeType} / ${projectedDestination.locator} / ${projectedDestination.id}` : "Authority unavailable"}</dd></div>
      <div><dt>Source / provenance</dt><dd>{item.provenance ? JSON.stringify(item.provenance) : "Not included in projection"}</dd></div>
      <div><dt>Containment</dt><dd>{item.containment ?? "Not included in projection"}</dd></div>
      <div><dt>Exact impact digest</dt><dd>{item.impactDigest ?? "Not included in projection"}</dd></div>
    </dl>
    <h3>Dependency paths</h3>{item.paths?.length ? <ul>{item.paths.map((path) => <li key={path}>{path}</li>)}</ul> : <p>No dependency paths are included in this projection.</p>}
    <h3>Impact preview</h3>{artifacts.length ? <ul>{artifacts.map((artifact) => <li key={`${artifact.artifactType}:${artifact.artifactId}`}>{artifact.artifactType} / {artifact.status}: {artifact.artifactId}</li>)}</ul> : <p>No reached artifacts are included in this projection.</p>}
    {item.dependencyKnowledgeVersionIds?.length ? <p>Configuration Knowledge Versions: {item.dependencyKnowledgeVersionIds.join(", ")}</p> : null}

    {item.status === "eligible" && <>
      <button className="primary" type="button" disabled={!candidate} onClick={() => candidate && onCreateCandidate({ ...candidate, operationKey })}>{pendingAction?.startsWith("candidate:") ? "Creating replacement candidate…" : "Create replacement candidate"}</button>
      {!candidate && <p className="contract-gap" role="note">Candidate creation is unavailable until the server returns a matching exact current/proposed version pair, configuration owner and kind, manifest, dependency graph, artifacts, risk kind, and owner revision for authorized commercial nodes.</p>}
    </>}

    {item.status === "open" && (review ? <form onSubmit={(event) => {
      event.preventDefault();
      if (rescopeUnavailable) return;
      onReviewDrift({
        proposalId: review.proposalId,
        expectedRevision: review.expectedRevision,
        predecessorVersionId: review.predecessorVersionId,
        decision,
        ...(decision === "correct" ? { correction: { excerpt: correction.trim() } } : {}),
        ...(decision === "rescope" && selectedDestination ? { destination: selectedDestination } : {}),
        operationKey,
      });
    }}>
      <fieldset><legend>Review this exact Drift proposal</legend>
        {review.decisions.map((choice) => <label key={choice}><input type="radio" name={`drift-${item.id}`} checked={decision === choice} onChange={() => setDecision(choice)} />{choice[0].toUpperCase() + choice.slice(1)}</label>)}
        {decision === "correct" && <label>Corrected plain text<input required value={correction} onChange={(event) => setCorrection(event.target.value)} /></label>}
        {decision === "rescope" && <CommercialDestinationSelect destinations={destinations} value={destinationId} onChange={setDestinationId} label="Confirmed destination" />}
      </fieldset>
      <button className="primary" type="submit" disabled={rescopeUnavailable}>{pendingAction?.startsWith(`drift-review:${review.proposalId}:`) ? "Recording Drift review…" : decision === "correct" ? "Record correction" : decision === "rescope" ? "Record rescope" : decision === "accept" ? "Accept Drift proposal" : "Reject Drift proposal"}</button>
    </form> : <p className="contract-gap" role="note">Drift review is unavailable because its proposal, revision, predecessor, destination, or decision binding does not match the projected commercial authority.</p>)}
  </article>;
}

function CandidateCard({ candidate, operationKey, onActivateReplacement, pendingAction }: { candidate: ReplacementProjection; operationKey: string; onActivateReplacement(command: ReplacementActivationCommand): void; pendingAction?: string | null }) {
  const activeHeading = useRef<HTMLHeadingElement>(null);
  const active = candidate.status === "activated";
  useEffect(() => { if (active) activeHeading.current?.focus(); }, [active]);
  const activation = validActivationBinding(candidate);
  return <article className="panel">
    <span className={active ? "knowledge-status knowledge-status--confirmed" : "knowledge-status knowledge-status--proposed"}>{active ? "Replacement active" : "Candidate — not active"}</span>
    <h2 ref={activeHeading} tabIndex={active ? -1 : undefined}>{active ? "Replacement active" : "Replacement candidate"}</h2>
    <dl className="confirmation-proof">
      <div><dt>Proposed Knowledge Version</dt><dd>{candidate.proposedVersionId ?? "Not included in projection"}</dd></div>
      <div><dt>Candidate configuration</dt><dd>{candidate.candidateConfigurationId ?? "Not included in projection"}</dd></div>
      <div><dt>Preserved prior snapshot</dt><dd>{candidate.currentConfigurationId ?? "Not included in projection"}</dd></div>
      <div><dt>Exact impact digest</dt><dd>{candidate.impactDigest ?? "Not included in projection"}</dd></div>
      <div><dt>Drift decision</dt><dd>{candidate.driftDecision ?? "Pending owner review"}</dd></div>
      {candidate.previousSnapshot && <div><dt>Previous configuration digest</dt><dd>{candidate.previousSnapshot.digest ?? "Not included in projection"}</dd></div>}
      {candidate.candidateSnapshot && <div><dt>Candidate configuration digest</dt><dd>{candidate.candidateSnapshot.digest ?? "Not included in projection"}</dd></div>}
      {active && candidate.activation && <><div><dt>Activated (Toronto)</dt><dd>{toronto(candidate.activation.activatedAt)}</dd></div><div><dt>Owner</dt><dd>{candidate.activation.activatedBy ?? "Not included in projection"}</dd></div><div><dt>Audit reference</dt><dd>{candidate.activation.auditEventId ?? "Not included in projection"}</dd></div><div><dt>Activation lineage</dt><dd>{candidate.activation.previousConfigurationId ?? "none"} → {candidate.activation.nextConfigurationId}</dd></div></>}
    </dl>
    {!active && <><h3>Activation boundary</h3><p>Activation preserves the current snapshot as history, moves future work to this immutable replacement, and invalidates only the dependent approvals shown above. It does not authorize any later operational effect.</p><button className="primary" type="button" disabled={!activation} onClick={() => activation && onActivateReplacement({ ...activation, operationKey })}>{pendingAction === `activate:${candidate.id}` ? "Activating replacement…" : "Activate replacement"}</button>{!activation && <p className="contract-gap" role="note">Activation is unavailable until the exact Drift proposal is accepted and the server returns the current/candidate configuration references, approved Knowledge Version, impact digest, and current owner and candidate revisions.</p>}</>}
  </article>;
}

function validReviewBinding(review: DriftReviewBinding | null | undefined, item: DriftProjection, destination: ReturnType<typeof resolveProjectedCommercialDestination>) {
  if (!review || review.action !== "review_knowledge_proposal" || !destination) return null;
  if (!review.proposalId || !Number.isInteger(review.expectedRevision) || review.expectedRevision < 1 || !review.predecessorVersionId) return null;
  if (review.predecessorVersionId !== item.currentVersionId || review.destination.id !== destination.id || review.destination.scopeType !== destination.scopeType) return null;
  const expected = ["accept", "reject", "correct", "rescope"];
  if (review.decisions.length !== expected.length || expected.some((decision) => !review.decisions.includes(decision as DriftDecision))) return null;
  return review;
}

function validCandidateBinding(
  candidate: Omit<ReplacementCandidateCommand, "operationKey"> | null | undefined,
  item: DriftProjection,
  destinations: readonly CommercialHierarchyNode[],
  destination: ReturnType<typeof resolveProjectedCommercialDestination>,
) {
  if (item.status !== "eligible" || !candidate || !destination) return null;
  if (candidate.currentVersionId !== item.currentVersionId || candidate.proposedVersionId !== item.proposedVersionId || candidate.riskKind !== item.riskKind) return null;
  if (!Number.isInteger(candidate.expectedOwnerRevision) || candidate.expectedOwnerRevision < 1) return null;
  if (!candidate.manifest || typeof candidate.manifest !== "object" || Array.isArray(candidate.manifest)) return null;
  if (!Array.isArray(candidate.dependencyEdges) || !Array.isArray(candidate.artifacts)) return null;
  const owner = destinations.find((node) => node.id === candidate.ownerId);
  const ownerScope = candidate.ownerType === "product" ? "product" : "customer_profile";
  if (!owner || owner.type !== ownerScope) return null;
  if (!["product_discovery", "profile_effective"].includes(candidate.kind)) return null;
  return candidate;
}

function validActivationBinding(candidate: ReplacementProjection): Omit<ReplacementActivationCommand, "operationKey"> | null {
  if (!["proposed", "candidate_not_active"].includes(candidate.status) || candidate.driftDecision !== "accept") return null;
  if (!candidate.id || !candidate.currentConfigurationId || !candidate.candidateConfigurationId || !candidate.proposedVersionId || !candidate.impactDigest) return null;
  if (!Number.isInteger(candidate.expectedOwnerRevision) || candidate.expectedOwnerRevision! < 1 || !Number.isInteger(candidate.revision) || candidate.revision < 1) return null;
  if (candidate.previousSnapshot?.id !== candidate.currentConfigurationId || candidate.candidateSnapshot?.id !== candidate.candidateConfigurationId) return null;
  return {
    candidateId: candidate.id,
    impactDigest: candidate.impactDigest,
    expectedOwnerRevision: candidate.expectedOwnerRevision!,
    expectedCandidateRevision: candidate.revision,
  };
}

function toronto(value: number) {
  return new Date(value).toLocaleString("en-CA", { timeZone: "America/Toronto", dateStyle: "medium", timeStyle: "short" });
}
