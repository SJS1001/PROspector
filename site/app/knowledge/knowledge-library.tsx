"use client";

import { useState } from "react";
import type { CommercialHierarchyNode } from "../../domain/commercial-model";
import { CommercialDestinationSelect, selectedCommercialDestination } from "./commercial-destination-select";

type KnowledgeProjectionBase = { id: string; type: "knowledge_proposal" | "knowledge_version"; revision?: number; status?: string; origin?: string; kind: string; digest: string; destination: { scopeType: string; id: string; locator?: string }; provenance?: { reference?: string; custody?: string; retrievedAt?: number; privacy?: string; license?: { use?: string }; reuseEligibility?: string }; successorLineage?: { decision?: string }; immutable: true };
type RenderableKnowledgeItemProjection = KnowledgeProjectionBase & { value: { excerpt?: string }; quarantine?: undefined };
type QuarantinedKnowledgeItemProjection = KnowledgeProjectionBase & { type: "knowledge_proposal"; value?: never; quarantine: { status: string } };
export type KnowledgeItemProjection = RenderableKnowledgeItemProjection | QuarantinedKnowledgeItemProjection;
export type KnowledgeIntakeCommand = { action: "propose_repository_research" | "import_plain_text" | "propose_reuse" | "propose_allowlisted_package"; destination: { scopeType: string; id?: string; locator: string }; kind: string; text: string; source: { reference: string; custody: string; retrievedAt: number }; privacy: "public" | "private" | "restricted"; license: { use: string }; reuseEligibility: string; operationKey: string };
export type KnowledgeReviewCommand = { proposalId: string; expectedRevision: number; decision: "accept" | "reject" | "correct" | "rescope"; correction?: string; destination?: { scopeType: "company" | "product" | "market_play" | "customer_profile" | "offer"; id: string; locator: string }; operationKey: string };
const NO_DESTINATIONS: readonly CommercialHierarchyNode[] = [];

export function KnowledgeLibraryView({
  items,
  destinations = NO_DESTINATIONS,
  operationKey,
  onIntake,
  onReviewProposal,
  onProposeChange,
  pendingAction,
  issue,
}: {
  items: readonly KnowledgeItemProjection[];
  destinations?: readonly CommercialHierarchyNode[];
  operationKey: string;
  onIntake(command: KnowledgeIntakeCommand): void;
  onReviewProposal(command: KnowledgeReviewCommand): void;
  onProposeChange(item: KnowledgeItemProjection): void;
  pendingAction?: string | null;
  issue?: string | null;
}) {
  const proposed = items.filter((item) => item.type === "knowledge_proposal");
  const confirmed = items.filter((item) => item.type === "knowledge_version");
  const [tab, setTab] = useState<"proposed" | "confirmed">(proposed.length ? "proposed" : "confirmed");
  if (issue) return <section className="error-state" role="alert">Knowledge authority is unknown: {issue}. Mutation controls are hidden until you load the current version.</section>;
  const visible = tab === "proposed" ? proposed : confirmed;
  return <section className="knowledge-library-view">
    <div className="panel"><h2>Knowledge Library</h2><p>Every card names its destination; proposed content has no authority until an owner promotion decision.</p><div aria-label="Knowledge status"><button type="button" aria-current={tab === "proposed" ? "page" : undefined} onClick={() => setTab("proposed")}>Proposed ({proposed.length})</button><button type="button" aria-current={tab === "confirmed" ? "page" : undefined} onClick={() => setTab("confirmed")}>Confirmed ({confirmed.length})</button></div></div>
    {tab === "proposed" && <IntakePanels destinations={destinations} operationKey={operationKey} onIntake={onIntake} />}
    {!visible.length
      ? <section className="panel"><h3>{tab === "proposed" ? "No proposed knowledge to review" : "No confirmed knowledge at this scope"}</h3><p>{tab === "proposed" ? "New research, uploads, imports, edits, and reuse suggestions will appear here before they can become authoritative." : "Complete the current interview or promote a reviewed proposal to establish authoritative knowledge."}</p></section>
      : visible.map((item) => <KnowledgeCard key={item.id} item={item} destinations={destinations} operationKey={operationKey} onReviewProposal={onReviewProposal} onProposeChange={onProposeChange} pendingAction={pendingAction} />)}
  </section>;
}

function IntakePanels({ destinations, operationKey, onIntake }: { destinations: readonly CommercialHierarchyNode[]; operationKey: string; onIntake(command: KnowledgeIntakeCommand): void }) {
  const [kind, setKind] = useState("evidence");
  const [text, setText] = useState("");
  const [source, setSource] = useState("");
  const company=destinations.find((item)=>item.type==="company");
  const submit = (action: KnowledgeIntakeCommand["action"], custody: string, eligibility: string) => {
    if (company&&text.trim() && source.trim()) onIntake({ action, destination: { scopeType: "company", id:company.id, locator:company.name }, kind, text, source: { reference: source, custody, retrievedAt: Date.now() }, privacy: "public", license: { use: "owner review" }, reuseEligibility: eligibility, operationKey });
  };
  return <section className="panel"><h2>Safe intake</h2><p>Each action creates Proposed Knowledge only. The application records source metadata; it does not fetch URLs.</p><label>Knowledge kind <input value={kind} onChange={(event) => setKind(event.target.value)} /></label><label>Plain-text excerpt <textarea maxLength={6000} value={text} onChange={(event) => setText(event.target.value)} /></label><label>Source reference or immutable reuse reference <input value={source} onChange={(event) => setSource(event.target.value)} /></label><div><button disabled={!company} type="button" onClick={() => submit("propose_repository_research", "public / owner-authorized", "repository_research")}>Record repository research as Proposed Knowledge</button><button disabled={!company} type="button" onClick={() => submit("import_plain_text", "owner-provided UTF-8 text", "plain_text_only")}>Import plain text as Proposed Knowledge</button><button disabled={!company} type="button" onClick={() => submit("propose_reuse", "same-Company / same-Product confirmed", "company_only")}>Reuse confirmed knowledge as Proposed Knowledge</button><button disabled={!company} type="button" onClick={() => submit("propose_allowlisted_package", "allowlisted package", "allowlisted_package")}>Reuse allowlisted package as Proposed Knowledge</button></div><p className="saved">Plain UTF-8 text only, maximum 6,000 characters. No file picker, drag-and-drop, multipart upload, parser, scanner, quarantine release, filename/path authority, or operational import is available. Contacts, prospects, outreach, suppression, secrets, and unapproved private sources cannot be promoted.</p></section>;
}

function KnowledgeCard({
  item,
  destinations,
  operationKey,
  onReviewProposal,
  onProposeChange,
  pendingAction,
}: {
  item: KnowledgeItemProjection;
  destinations: readonly CommercialHierarchyNode[];
  operationKey: string;
  onReviewProposal(command: KnowledgeReviewCommand): void;
  onProposeChange(item: KnowledgeItemProjection): void;
  pendingAction?: string | null;
}) {
  const [decision, setDecision] = useState<KnowledgeReviewCommand["decision"]>("accept");
  const [correction, setCorrection] = useState("");
  const [destinationId, setDestinationId] = useState("");
  const isProposal = item.type === "knowledge_proposal";
  const quarantined = Boolean(item.quarantine);
  const excerpt = quarantined ? "Quarantined upload content is withheld. Only custody metadata and its opaque digest are available." : item.value?.excerpt ?? "No plain-text excerpt is present.";
  const selectedDestination = selectedCommercialDestination(destinations, destinationId);
  const rescopeUnavailable = decision === "rescope" && !selectedDestination;
  const reviewLabel = pendingAction?.startsWith(`review:${item.id}:`)
    ? decision === "correct" ? "Recording correction…" : decision === "rescope" ? "Recording rescope…" : decision === "accept" ? "Accepting proposal…" : "Rejecting proposal…"
    : decision === "correct" ? "Record correction" : decision === "rescope" ? "Record rescope" : decision === "accept" ? "Accept" : "Reject";

  return <article className="panel">
    <span className={isProposal ? "knowledge-status knowledge-status--proposed" : "knowledge-status knowledge-status--confirmed"}>{isProposal ? "Proposed Knowledge" : "Confirmed Knowledge"}</span>
    <h2>{item.kind}</h2><p>{excerpt}</p>
    <dl className="confirmation-proof"><div><dt>Destination</dt><dd>{item.destination.scopeType} / {item.destination.locator ?? item.destination.id}</dd></div><div><dt>Immutable reference</dt><dd>{item.id}</dd></div><div><dt>Digest</dt><dd>{item.digest}</dd></div><div><dt>Origin / custody</dt><dd>{item.origin ?? "confirmed lineage"} / {item.provenance?.custody ?? "not recorded"}</dd></div><div><dt>Provenance / privacy / license</dt><dd>{item.provenance?.reference ?? "not recorded"} / {item.provenance?.privacy ?? "not recorded"} / {item.provenance?.license?.use ?? "not recorded"}</dd></div><div><dt>Reuse / decision lineage</dt><dd>{item.provenance?.reuseEligibility ?? "not recorded"} / {item.successorLineage?.decision ?? "not recorded"}</dd></div>{item.quarantine && <div><dt>Quarantine status</dt><dd>{item.quarantine.status}</dd></div>}</dl>
    {item.quarantine
      ? <><p className="saved">Proposed Knowledge has no authority until you promote it.</p><p className="contract-gap" role="note">This metadata-only quarantined proposal cannot be rendered, reviewed, or promoted. No upload release action is available in this pilot.</p></>
      : isProposal
        ? <><p className="saved">Proposed Knowledge has no authority until you promote it.</p><form onSubmit={(event) => {
          event.preventDefault();
          if (rescopeUnavailable) return;
          onReviewProposal({
            proposalId: item.id,
            expectedRevision: item.revision ?? 1,
            decision,
            ...(decision === "correct" ? { correction: correction.trim() } : {}),
            ...(decision === "rescope" && selectedDestination ? { destination: selectedDestination } : {}),
            operationKey,
          });
        }}><fieldset><legend>Review proposal against this exact snapshot</legend>
          {(["accept", "reject", "correct", "rescope"] as const).map((choice) => <label key={choice}><input type="radio" name={`proposal-${item.id}`} checked={decision === choice} disabled={choice === "rescope" && !destinations.length} onChange={() => setDecision(choice)} />{choice[0].toUpperCase() + choice.slice(1)}</label>)}
          {decision === "correct" && <label>Corrected plain text<input required value={correction} onChange={(event) => setCorrection(event.target.value)} /></label>}
          {decision === "rescope" && <CommercialDestinationSelect destinations={destinations} value={destinationId} onChange={setDestinationId} label="Confirmed destination" />}
          {!destinations.length && <p className="control-reason">Rescope is unavailable until the server returns the authorized commercial hierarchy.</p>}
        </fieldset><button className="primary" type="submit" disabled={rescopeUnavailable}>{reviewLabel}</button></form></>
        : <><p className="saved">Confirmed Knowledge is read-only. Version, decision, Toronto confirmation time, audit references, supersedes, and dependencies are immutable server lineage.</p><button type="button" className="outline" disabled={!item.destination.locator} onClick={() => item.destination.locator && onProposeChange(item)}>{pendingAction === `owner-edit:${item.id}` ? "Creating proposal…" : "Propose change"}</button>{!item.destination.locator && <p className="contract-gap" role="note">Propose change is unavailable until the server returns the destination display locator required to resolve this exact scope safely.</p>}</>}
  </article>;
}
