"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CommercialHierarchyNode, CommercialModelProjection } from "../../domain/commercial-model";
import type { InterviewState } from "../../domain/interview";
import { CommercialModelView, type CommercialCommand } from "./commercial-model";
import { ConsensusInterviewView, type InterviewAnswerCommand, type InterviewDecisionCommand } from "./consensus-interview";
import { DriftReplacementsView, type DriftProjection, type ReplacementActivationCommand, type ReplacementCandidateCommand, type ReplacementProjection } from "./drift-replacements";
import { KnowledgeLibraryView, type KnowledgeIntakeCommand, type KnowledgeItemProjection, type KnowledgeReviewCommand } from "./knowledge-library";

export const KNOWLEDGE_LOCAL_VIEWS = ["Commercial Model", "Interview", "Knowledge Library", "Drift & Replacements"] as const;
export const CONTROLLED_PILOT_BOUNDARY_COPY = "Commercial knowledge is live. Discovery, prospecting, contacts, schedules, exports, credentials, paid work, and outbound effects remain disabled.";
export const HIERARCHY_SCOPE_LEGEND = ["Company", "Product", "Market Play", "Customer Profile", "Offer"] as const;

type LocalView = (typeof KNOWLEDGE_LOCAL_VIEWS)[number];
type Projection = { commercial: CommercialModelProjection; interview: InterviewState; library: KnowledgeItemProjection[]; drift: DriftProjection[]; replacements: ReplacementProjection[] };
type WorkspaceState = { kind: "loading" } | { kind: "ready"; value: Projection } | { kind: "unavailable"; message: string } | { kind: "unauthorized" } | { kind: "unknown"; message: string };

export function KnowledgeWorkspace({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [state, setState] = useState<WorkspaceState>({ kind: "loading" });
  const [view, setView] = useState<LocalView>("Interview");
  const [pending, setPending] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const operationKeys = useRef(new Map<string, string>());

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const response = await fetch("/api/knowledge", { credentials: "same-origin", cache: "no-store" });
      if (response.status === 404) { onUnauthorized(); setState({ kind: "unauthorized" }); return; }
      if (!response.ok) { setState({ kind: "unavailable", message: "Authoritative knowledge could not be loaded. No authority has changed. Retry the knowledge load." }); return; }
      const value = normalizeProjection(await response.json());
      setState({ kind: "ready", value });
      setNotice(null);
    } catch {
      setState({ kind: "unavailable", message: "Authoritative knowledge could not be loaded. No authority has changed. Retry the knowledge load." });
    }
  }, [onUnauthorized]);

  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);

  const keyFor = useCallback((logicalKey: string) => {
    const existing = operationKeys.current.get(logicalKey);
    if (existing) return existing;
    const key = crypto.randomUUID();
    operationKeys.current.set(logicalKey, key);
    return key;
  }, []);

  const dispatch = useCallback(async (action: string, logicalKey: string, fields: Record<string, unknown>) => {
    if (state.kind !== "ready") return;
    const operationKey = keyFor(logicalKey);
    setPending(logicalKey); setNotice(null);
    try {
      const post = () => fetch("/api/knowledge", {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "content-type": "application/json", "x-prospector-intent": "knowledge-mutation" },
        body: JSON.stringify({ action, idempotencyKey: operationKey, ...fields }),
      });
      let response = await post();
      if (response.status === 404) { onUnauthorized(); setState({ kind: "unauthorized" }); return; }
      if (response.status === 403) {
        const refreshed = await fetch("/api/knowledge", { credentials: "same-origin", cache: "no-store" });
        if (refreshed.status === 404) { onUnauthorized(); setState({ kind: "unauthorized" }); return; }
        if (!refreshed.ok) throw new Error("csrf_recovery_unavailable");
        response = await post();
      }
      if (response.status === 409) { setNotice("This item changed in another tab. Your action was not applied. Review the current version before continuing."); return; }
      if (!response.ok) throw new Error("mutation_unavailable");
      const value = normalizeProjection(await response.json());
      operationKeys.current.delete(logicalKey);
      setState({ kind: "ready", value });
    } catch {
      setNotice("The outcome could not be verified. Nothing will be retried automatically. Check the current version.");
    } finally { setPending(null); }
  }, [keyFor, onUnauthorized, state.kind]);

  if (state.kind === "loading") return <section className="panel loading-state" role="status">Loading authoritative knowledge…</section>;
  if (state.kind === "unauthorized") return null;
  if (state.kind !== "ready") return <section className="error-state" role="alert"><p>{state.message}</p><button className="outline" type="button" onClick={() => void load()}>Retry knowledge load</button></section>;

  const { commercial, interview, library, drift, replacements } = state.value;
  const mutating = pending !== null;
  const scope = commercial.path;
  const disabled = mutating ? <p className="saved" role="status">{pendingCopy(pending)} Other actions are temporarily disabled.</p> : null;
  const knowledgeCounts = countsByDestination(library);
  const locatedLibrary = withKnowledgeLocators(library, commercial);
  return <section className="knowledge-workspace" aria-live="polite">
    <div className="page-heading"><div><span className="eyebrow">OWNER-SCOPED · VERSIONED KNOWLEDGE</span><h1>Consensus knowledge</h1><p>Build the commercial model, review one decision at a time, and keep every source, version, and downstream impact visible.</p></div><button className="primary" type="button" onClick={() => setView("Interview")}>Review current question</button></div>
    <nav className="knowledge-local-nav" aria-label="Knowledge views">{KNOWLEDGE_LOCAL_VIEWS.map((item) => <button key={item} type="button" aria-current={view === item ? "page" : undefined} onClick={() => setView(item)}>{item}</button>)}</nav>
    <nav className="knowledge-scope" aria-label="Current commercial scope">{scope.map((node, index) => <button key={node.id} type="button" aria-current={index === scope.length - 1 ? "page" : undefined} onClick={() => setView("Commercial Model")}>{node.name}</button>)}</nav>
    {notice && <section className="error-state" role="alert"><p>{notice}</p><button className="outline" type="button" onClick={() => void load()}>Check current version</button></section>}
    {disabled}
    <fieldset className="knowledge-action-boundary" disabled={mutating}><legend className="sr-only">Authoritative knowledge actions</legend>
      {view === "Commercial Model" && <CommercialModelView projection={commercial} knowledgeCounts={knowledgeCounts} operationKey="commercial" onCreateDraft={(command) => void dispatch("create_hierarchy_draft", `draft:${command.type}:${command.parentId}:${command.name}`, draftPayload(command))} onProposeChange={(node) => void dispatch("propose_owner_edit", `owner-edit:${node.id}`, proposalPayload(node, commercial))} />}
      {view === "Interview" && <InterviewPane state={interview} commercial={commercial} pendingAction={pending} dispatch={dispatch} />}
      {view === "Knowledge Library" && <KnowledgeLibraryView items={locatedLibrary} operationKey="library" pendingAction={pending} onIntake={(command) => void dispatch(command.action, `${command.action}:${command.source.reference}:${command.text}`, intakePayload(command))} onReviewProposal={(command) => void dispatch("review_knowledge_proposal", `review:${command.proposalId}:${command.decision}`, reviewPayload(command))} onProposeChange={(item) => void dispatch("propose_owner_edit", `owner-edit:${item.id}`, proposalPayload(item))} />}
      {view === "Drift & Replacements" && <DriftReplacementsView drift={drift} candidates={replacements} operationKey="replacement" pendingAction={pending} onCreateCandidate={(command) => void dispatch("create_replacement_candidate", `candidate:${command.proposedVersionId}`, candidatePayload(command))} onActivateReplacement={(command) => void dispatch("activate_replacement", `activate:${command.candidateId}`, activationPayload(command))} />}
    </fieldset>
  </section>;
}

function InterviewPane({ state, commercial, pendingAction, dispatch }: { state: InterviewState; commercial: CommercialModelProjection; pendingAction: string | null; dispatch: (action: string, logicalKey: string, fields: Record<string, unknown>) => Promise<void> }) {
  if (state.status === "uninitialized") return <section className="panel"><h2>Commercial workspace is unavailable</h2><p>Authoritative workspace initialization must be completed by the admitted server boundary.</p></section>;
  return <div className="interview-layout"><ConsensusInterviewView state={state} pendingAction={pendingAction} answerOperationKey="interview-answer" decisionOperationKey="interview-decision" onSubmitAnswer={(command) => void dispatch("submit_interview_answer", `answer:${command.questionId}:${command.expectedRevision}`, answerPayload(command))} onRecordDecision={(command) => void dispatch("record_interview_decision", `decision:${command.answerId}:${command.decision}`, decisionPayload(command))} /><aside className="panel interview-scope" aria-label="Interview scope"><span className="eyebrow">CURRENT COMMERCIAL SCOPE</span><h2>{commercial.workspace.companyName}</h2><ol>{commercial.path.map((node, index) => <li key={node.id} className={index === commercial.path.length - 1 ? "current" : "done"}><span>{node.type.replaceAll("_", " ")}</span><b>{node.name}</b></li>)}</ol><p>One owner decision is reviewed against this displayed commercial scope. Later operational effects remain disabled.</p></aside></div>;
}

function draftPayload(command: CommercialCommand) { return { type: command.type, parentId: command.parentId, name: command.name, expectedRevision: command.expectedRevision }; }
function proposalPayload(source: CommercialHierarchyNode | KnowledgeItemProjection, commercial?: CommercialModelProjection) { const locator = "parentId" in source ? source.name : source.destination.locator ?? (commercial ? commercialLocator(commercial, source.destination.id) : undefined); if (!locator) throw new Error("destination_locator_unavailable"); const destination = { scopeType: "parentId" in source ? source.type : source.destination.scopeType, locator }; return { destination, kind: "owner_edit", text: "Owner requested a proposed change from the displayed authoritative scope.", source: { reference: `owner-ui:${source.id}`, custody: "owner-entered workspace change", retrievedAt: Date.now() }, privacy: "private", license: { use: "owner review" }, reuseEligibility: "owner_edit" }; }
function intakePayload(command: KnowledgeIntakeCommand) { const { operationKey, ...payload } = command; void operationKey; return payload; }
function reviewPayload(command: KnowledgeReviewCommand) { const { operationKey, ...payload } = command; void operationKey; return payload; }
function answerPayload(command: InterviewAnswerCommand) { const { operationKey, value, ...payload } = command; void operationKey; return { ...payload, ...(value ? { value: { excerpt: value } } : {}) }; }
function decisionPayload(command: InterviewDecisionCommand) { const { operationKey, value, ...payload } = command; void operationKey; return { ...payload, ...(value ? { value: { excerpt: value } } : {}) }; }
function candidatePayload(command: ReplacementCandidateCommand) { return { currentVersionId: command.currentVersionId, proposedVersionId: command.proposedVersionId, ownerType: command.ownerType, ownerId: command.ownerId, kind: command.kind, expectedOwnerRevision: command.expectedOwnerRevision, manifest: {}, riskKind: "capability", dependencyEdges: [], artifacts: [] }; }
function activationPayload(command: ReplacementActivationCommand) { const { operationKey, ...payload } = command; void operationKey; return payload; }
function commercialLocator(commercial: CommercialModelProjection, id: string) { return [...commercial.path, ...commercial.products, ...commercial.plays, ...commercial.profiles, ...commercial.offers].find((node) => node.id === id)?.name; }
function withKnowledgeLocators(items: readonly KnowledgeItemProjection[], commercial: CommercialModelProjection) { return items.map((item) => ({ ...item, destination: { ...item.destination, locator: item.destination.locator ?? commercialLocator(commercial, item.destination.id) } })); }
function countsByDestination(items: readonly KnowledgeItemProjection[]) { const counts = new Map<string, { confirmed: number; proposed: number }>(); for (const item of items) { const current = counts.get(item.destination.id) ?? { confirmed: 0, proposed: 0 }; if (item.type === "knowledge_version") current.confirmed += 1; else current.proposed += 1; counts.set(item.destination.id, current); } return counts; }
function pendingCopy(pending: string) { if (pending.startsWith("answer:")) return "Submitting answer…"; if (pending.startsWith("decision:")) return "Recording owner decision…"; if (pending.startsWith("review:")) return "Recording proposal review…"; if (pending.startsWith("candidate:")) return "Creating replacement candidate…"; if (pending.startsWith("activate:")) return "Activating replacement…"; if (pending.startsWith("owner-edit:")) return "Creating Proposed Knowledge…"; if (pending.startsWith("draft:")) return "Creating hierarchy draft…"; return "Creating Proposed Knowledge…"; }

function normalizeProjection(value: unknown): Projection {
  if (!isRecord(value) || !isRecord(value.commercial) || !isRecord(value.interview) || !Array.isArray(value.library) || !Array.isArray(value.drift) || !Array.isArray(value.replacements)) throw new Error("malformed_projection");
  const commercial = value.commercial as unknown as CommercialModelProjection;
  if (!Array.isArray(commercial.path) || !commercial.path.length || !commercial.path.every(validNode)) throw new Error("malformed_commercial_projection");
  const interview = value.interview as InterviewState;
  if (typeof interview.status !== "string") throw new Error("malformed_interview_projection");
  return { commercial, interview, library: value.library as KnowledgeItemProjection[], drift: value.drift as DriftProjection[], replacements: value.replacements as ReplacementProjection[] };
}
function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function validNode(value: unknown): value is CommercialHierarchyNode { return isRecord(value) && typeof value.id === "string" && typeof value.name === "string" && typeof value.type === "string"; }
