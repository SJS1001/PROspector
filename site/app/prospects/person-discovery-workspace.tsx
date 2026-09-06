import React, { useEffect, useRef, useState } from "react";

const ENDPOINT = "/api/contacts/person-discovery";
const PEOPLE_LIMIT = 5;
type DiscoveryStatus = "not_started" | "requested" | "completed" | "needs_reconciliation" | "stale_authority";
type Decision = "no_match" | "create_new" | "link_existing";
type Notice = { kind: "loading" | "ready" | "error" | "stale"; text: string };
type Candidate = Readonly<{ candidateId: string; ordinal: number; state: "suggestion_not_contact" | "payload_unavailable"; eligible: false; displayName?: string; roleTitle?: string; roleSummary?: string }>;
type PersonPage = Readonly<{ runId: string | null; resultDigest: string | null; status: DiscoveryStatus; items: readonly Candidate[]; pageInfo: { limit: 5; returned: number; hasNext: boolean; nextCursor: string | null } }>;
type Prospect = Readonly<{ prospectId: string; prospectRevision: number; knownPerson: boolean }>;
type Relevance = Readonly<{ relevanceId: string; prospectId: string; contactId: string; decisionId: string; roleTitle: string }>;
export type PersonDiscoveryProjection = Readonly<{ capability: "reject_only" | "test_composed_only"; approvedProspects: readonly Prospect[]; people: PersonPage; history: { runs: readonly { runId: string; prospectId: string; state: "requested" | "completed" | "needs_reconciliation"; resultDigest: string | null }[]; relevance: readonly Relevance[]; verificationIntents: readonly { relevanceId: string; intent: "initial_verification" | "stale_refresh"; channel: "email" | "phone" }[] } }>;

export function personDiscoveryUrl(prospectId: string, cursor: string | null = null) {
  const query = new URLSearchParams({ prospectId });
  if (cursor) query.set("peopleCursor", cursor);
  return `${ENDPOINT}?${query}`;
}

/** Closed client transport: only server-projected locators and explicit choices
 * may cross this boundary. Workspace, provider, config, candidate contents, and
 * contact values never originate in the browser. */
export async function postPersonDiscoveryCommand(fetcher: typeof fetch, command: Record<string, unknown>) {
  return fetcher(ENDPOINT, { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json", "x-prospector-intent": "person-discovery-mutation" }, body: JSON.stringify(command) });
}

export function normalizePersonDiscoveryProjection(value: unknown): PersonDiscoveryProjection | null {
  if (!record(value) || !member(value.capability, ["reject_only", "test_composed_only"]) || !Array.isArray(value.approvedProspects) || !record(value.people) || !record(value.history) || !Array.isArray(value.history.runs) || !Array.isArray(value.history.relevance) || !Array.isArray(value.history.verificationIntents)) return null;
  const approvedProspects = value.approvedProspects.map(prospect), people = personPage(value.people), runs = value.history.runs.map(run), relevance = value.history.relevance.map(relevanceRow), verificationIntents = value.history.verificationIntents.map(intent);
  if (!approvedProspects.every(isPresent) || !people || !runs.every(isPresent) || !relevance.every(isPresent) || !verificationIntents.every(isPresent)) return null;
  return { capability: value.capability as PersonDiscoveryProjection["capability"], approvedProspects, people, history: { runs: runs as PersonDiscoveryProjection["history"]["runs"], relevance, verificationIntents: verificationIntents as PersonDiscoveryProjection["history"]["verificationIntents"] } };
}

export function PersonDiscoveryWorkspace() {
  const [projection, setProjection] = useState<PersonDiscoveryProjection | null>(null);
  const [selectedProspectId, setSelectedProspectId] = useState("");
  const [cursor, setCursor] = useState<string | null>(null);
  const [previous, setPrevious] = useState<readonly (string | null)[]>([]);
  const [selectedCandidateId, setSelectedCandidateId] = useState("");
  const [decision, setDecision] = useState<Decision | "">("");
  const [decisionConfirmed, setDecisionConfirmed] = useState(false);
  const [notice, setNotice] = useState<Notice>({ kind: "loading", text: "Loading person-discovery status…" });
  const [pending, setPending] = useState(false);
  const attempted = useRef(false);
  const statusRef = useRef<HTMLParagraphElement>(null);
  const chosen = projection?.approvedProspects.find((item) => item.prospectId === selectedProspectId) ?? null;
  const person = chosen && !chosen.knownPerson ? chosen : null;
  const candidate = projection?.people.items.find((item) => item.candidateId === selectedCandidateId && item.state === "suggestion_not_contact") ?? null;
  const currentRelevance = projection?.history.relevance.find((item) => item.prospectId === selectedProspectId) ?? null;
  const resultDigest = projection?.people.resultDigest ?? projection?.history.runs.find((item) => item.runId === projection.people.runId)?.resultDigest ?? null;
  const canMutate = projection?.capability === "test_composed_only" && !!person && !pending;

  function clearSelection(message?: string) {
    setSelectedCandidateId(""); setDecision(""); setDecisionConfirmed(false);
    if (message) setNotice({ kind: "stale", text: message });
  }
  function focusStatus() { queueMicrotask(() => statusRef.current?.focus()); }
  async function load(prospectId: string, nextCursor: string | null, recovery = false) {
    if (!prospectId) return;
    setPending(true); if (!recovery) setNotice({ kind: "loading", text: "Loading authoritative person-discovery status…" });
    try {
      const response = await fetch(personDiscoveryUrl(prospectId, nextCursor), { headers: { accept: "application/json" }, credentials: "same-origin" });
      if (response.status === 409) {
        setCursor(null); setPrevious([]); clearSelection("This list changed while you were reviewing it. The first page was reloaded; select a person again.");
        if (!recovery) return await load(prospectId, null, true);
        return;
      }
      if (!response.ok) { setNotice({ kind: "error", text: "Person discovery is unavailable. Reload and try again; no provider call was made." }); return; }
      const parsed = normalizePersonDiscoveryProjection(await response.json());
      if (!parsed) { setNotice({ kind: "error", text: "The person-discovery response was incomplete. No action was taken." }); return; }
      setProjection(parsed); setCursor(nextCursor); clearSelection();
      setNotice({ kind: "ready", text: parsed.capability === "reject_only" ? "Person discovery is unavailable in this runtime. No provider call can be made." : "Authoritative person-discovery status loaded." });
    } catch { setNotice({ kind: "error", text: "Person discovery could not be loaded. Check your connection; no provider call was made." }); }
    finally { setPending(false); focusStatus(); }
  }
  // C2's initial collection request intentionally has no prospect selector;
  // its selected follow-up runs only after the authoritative response arrives.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void fetch(ENDPOINT, { headers: { accept: "application/json" }, credentials: "same-origin" }).then(async (response) => response.ok ? normalizePersonDiscoveryProjection(await response.json()) : null).then((value) => { if (!value) { setNotice({ kind: "error", text: "Person discovery is unavailable. No provider call was made." }); return; } setProjection(value); const first = value.approvedProspects.find((item) => !item.knownPerson); if (first) { setSelectedProspectId(first.prospectId); void load(first.prospectId, null); } else setNotice({ kind: "ready", text: "No current approved prospect needs a person decision." }); }).catch(() => setNotice({ kind: "error", text: "Person discovery could not be loaded. No provider call was made." })); }, []);

  async function startDiscovery() {
    if (!canMutate || !person || attempted.current) return;
    attempted.current = true; setPending(true); clearSelection();
    const body = { action: "start_person_discovery", prospectId: person.prospectId, expectedProspectRevision: person.prospectRevision, maxCandidates: 20, maxProvenancePerCandidate: 8, idempotencyKey: crypto.randomUUID() };
    try { const response = await postPersonDiscoveryCommand(fetch, body); if (!response.ok) return await recoverUnknown("The request was not confirmed. Status was refreshed; it was not retried."); await load(person.prospectId, null); }
    catch { await recoverUnknown("The request result is unknown. Status was refreshed; it was not retried."); }
    finally { attempted.current = false; setPending(false); }
  }
  async function submitDecision() {
    if (!canMutate || !person || !projection?.people.runId || !resultDigest || !decision || !decisionConfirmed || (decision !== "no_match" && !candidate)) return;
    if (decision === "link_existing") { setNotice({ kind: "error", text: "Link existing person is unavailable until this projection supplies an exact current Contact selection. No link was attempted." }); focusStatus(); return; }
    attempted.current = true; setPending(true);
    const body = { action: "decide_person_discovery", runId: projection.people.runId, expectedResultDigest: resultDigest, decision, candidateId: decision === "no_match" ? null : candidate!.candidateId, existingContactId: null, expectedProspectRevision: person.prospectRevision, idempotencyKey: crypto.randomUUID() };
    try { const response = await postPersonDiscoveryCommand(fetch, body); if (!response.ok) return await recoverUnknown("The decision result is unknown. Status was refreshed; it was not retried."); await load(person.prospectId, null); }
    catch { await recoverUnknown("The decision result is unknown. Status was refreshed; it was not retried."); }
    finally { attempted.current = false; setPending(false); }
  }
  async function recoverUnknown(message: string) { if (selectedProspectId) { setNotice({ kind: "loading", text: message }); await load(selectedProspectId, null); } }
  function selectProspect(id: string) { setSelectedProspectId(id); setCursor(null); setPrevious([]); clearSelection(); if (id) void load(id, null); }
  function move(direction: "next" | "previous") { if (!selectedProspectId || pending) return; if (direction === "next" && projection?.people.pageInfo.nextCursor) { setPrevious((items) => [...items, cursor]); void load(selectedProspectId, projection.people.pageInfo.nextCursor); } if (direction === "previous" && previous.length) { const prior = previous[previous.length - 1] ?? null; setPrevious((items) => items.slice(0, -1)); void load(selectedProspectId, prior); } }

  return <section className="person-discovery-workspace" aria-labelledby="person-discovery-heading">
    <header><span className="eyebrow">CONTACTS · PERSON DISCOVERY</span><h2 id="person-discovery-heading">Find suitable people</h2><p>Discovery suggests people for review. It is separate from verification and never makes a provider call unless an authorized service exists.</p></header>
    <p ref={statusRef} tabIndex={-1} role="status" aria-live="polite" data-status={notice.kind}>{notice.text}</p>
    <fieldset className="panel"><legend>Approved prospect</legend><label>Prospect needing a person <select aria-label="Approved prospect needing a person" value={selectedProspectId} disabled={pending} onChange={(event) => selectProspect(event.target.value)}><option value="">Select an approved prospect</option>{projection?.approvedProspects.filter((item) => !item.knownPerson).map((item) => <option key={item.prospectId} value={item.prospectId}>Approved prospect</option>)}</select></label>{person ? <p><strong>No known person</strong> is linked to this approved prospect.</p> : <p>Select an approved prospect with no known person.</p>}</fieldset>
    <section className="panel" aria-labelledby="discovery-run-heading"><h3 id="discovery-run-heading">Discovery run</h3><p>{runMessage(projection?.people.status ?? "not_started")}</p>{projection?.capability === "reject_only" ? <DisabledDiscoveryAction explanationId="person-discovery-service-unavailable" explanation="Unavailable: this ordinary runtime has no authorized discovery service, so no provider call can be made.">Find suitable people</DisabledDiscoveryAction> : <button type="button" className="primary" disabled={!canMutate || projection?.people.status === "requested"} onClick={() => void startDiscovery()}>Find suitable people</button>}</section>
    {projection?.people.status === "completed" ? <section className="panel" aria-labelledby="suggested-people-heading"><h3 id="suggested-people-heading">Suggested people</h3><p>Every result is a suggestion, not a Contact. No send, call, export, package, or verified-contact control is available here.</p>{projection.people.items.length ? <ul className="person-candidate-list">{projection.people.items.map((item) => item.state === "payload_unavailable" ? <li key={item.candidateId}><strong>Suggestion unavailable</strong><p>Its retained payload is no longer available. Select another current suggestion.</p></li> : <li key={item.candidateId}><label><input type="radio" name="person-candidate" checked={selectedCandidateId === item.candidateId} onChange={() => { setSelectedCandidateId(item.candidateId); setDecisionConfirmed(false); }}/> <strong>Suggested person — not yet a contact</strong></label><dl><div><dt>Name</dt><dd>{item.displayName}</dd></div><div><dt>Title</dt><dd>{item.roleTitle}</dd></div><div><dt>Role</dt><dd>{item.roleSummary}</dd></div><div><dt>Provenance</dt><dd>Bounded evidence retained by the service</dd></div><div><dt>Time</dt><dd>Not returned in this bounded review projection</dd></div><div><dt>State</dt><dd>Not eligible for contact actions</dd></div></dl></li>)}</ul> : <p>No suitable people were returned. You may explicitly record No match.</p>}<PersonPageControls info={projection.people.pageInfo} canGoBack={previous.length > 0} loading={pending} onPrevious={() => move("previous")} onNext={() => move("next")}/></section> : null}
    {projection?.people.status === "completed" ? <fieldset className="panel"><legend>Explicit owner decision</legend><p>Choose one outcome. Nothing is selected automatically.</p><label><input type="radio" name="person-decision" value="no_match" checked={decision === "no_match"} onChange={() => { setDecision("no_match"); setDecisionConfirmed(false); }}/> No match</label><label><input type="radio" name="person-decision" value="create_new" checked={decision === "create_new"} disabled={!candidate} onChange={() => { setDecision("create_new"); setDecisionConfirmed(false); }}/> Create new person</label><label><input type="radio" name="person-decision" value="link_existing" checked={decision === "link_existing"} disabled aria-describedby="person-link-unavailable" onChange={() => undefined}/> Link existing person</label><p id="person-link-unavailable" tabIndex={0}>Unavailable: an exact current same-workspace Contact and revision are not in this read projection. A suggestion cannot be linked by name or guess.</p><label><input type="checkbox" checked={decisionConfirmed} disabled={!decision || pending} onChange={(event) => setDecisionConfirmed(event.target.checked)}/> I confirm this explicit decision.</label><button type="button" disabled={!canMutate || !decision || !decisionConfirmed || (decision !== "no_match" && !candidate)} onClick={() => void submitDecision()}>Record decision</button></fieldset> : null}
    {currentRelevance ? <fieldset className="panel"><legend>Verify business contact details</legend><p>A person link is not verification. A verification intent never calls a provider or makes any contact detail eligible.</p><DisabledDiscoveryAction explanationId="person-verification-revision-unavailable" explanation="Unavailable: this bounded read projection does not include the exact current Contact revision required by C2. No verification intent was submitted.">Verify business contact details</DisabledDiscoveryAction><DisabledDiscoveryAction explanationId="person-verification-refresh-unavailable" explanation="Unavailable: trusted-evidence freshness and its exact observation are not in this projection. No refresh was submitted.">Refresh verification</DisabledDiscoveryAction><p>Generated, directory, domain, or MX data is never eligible.</p></fieldset> : null}
  </section>;
}

export function PersonPageControls({ info, canGoBack, loading, onPrevious, onNext }: { info: PersonPage["pageInfo"]; canGoBack: boolean; loading: boolean; onPrevious(): void; onNext(): void }) { return <nav className="person-page-controls" aria-label="Suggested people pages"><span>Showing {info.returned} people on this page.</span><button type="button" disabled={loading || !canGoBack} onClick={onPrevious}>Previous people</button><button type="button" disabled={loading || !info.hasNext || !info.nextCursor} onClick={onNext}>Next people</button></nav>; }
export function DisabledDiscoveryAction({ children, explanation, explanationId }: { children: string; explanation: string; explanationId: string }) { return <p><button type="button" disabled aria-describedby={explanationId}>{children}</button> <span id={explanationId} tabIndex={0}>{explanation}</span></p>; }
function runMessage(status: DiscoveryStatus) { return ({ not_started: "No discovery run has been requested.", requested: "Discovery is requested. Wait for an authoritative result; do not retry automatically.", completed: "The latest discovery run is complete. Review suggestions before deciding.", needs_reconciliation: "The latest discovery outcome needs reconciliation. It was not retried.", stale_authority: "The prior authority is stale. Reload and select a current approved prospect." } as const)[status]; }
function prospect(value: unknown): Prospect | null { return record(value) && opaque(value.prospectId) && positive(value.prospectRevision) && typeof value.knownPerson === "boolean" ? { prospectId: value.prospectId, prospectRevision: value.prospectRevision, knownPerson: value.knownPerson } : null; }
function personPage(value: Record<string, unknown>): PersonPage | null { if (!exact(value, ["runId", "status", "items", "pageInfo"]) && !exact(value, ["runId", "status", "items", "pageInfo", "resultDigest"])) return null; if ((value.runId !== null && !opaque(value.runId)) || (value.resultDigest !== undefined && value.resultDigest !== null && !digest(value.resultDigest)) || !member(value.status, ["not_started", "requested", "completed", "needs_reconciliation", "stale_authority"]) || !Array.isArray(value.items) || !record(value.pageInfo)) return null; const items = value.items.map(candidate), pageInfo = page(value.pageInfo); return items.every(isPresent) && pageInfo ? { runId: value.runId, resultDigest: digest(value.resultDigest) ? value.resultDigest : null, status: value.status as DiscoveryStatus, items, pageInfo } : null; }
function candidate(value: unknown): Candidate | null { if (!record(value) || !opaque(value.candidateId) || !positive(value.ordinal) || value.eligible !== false || !member(value.state, ["suggestion_not_contact", "payload_unavailable"])) return null; if (value.state === "payload_unavailable") return exact(value, ["candidateId", "ordinal", "state", "eligible"]) ? { candidateId: value.candidateId, ordinal: value.ordinal, state: value.state as "payload_unavailable", eligible: false } : null; return exact(value, ["candidateId", "ordinal", "displayName", "roleTitle", "roleSummary", "candidateDigest", "state", "eligible"]) && text(value.displayName, 160) && text(value.roleTitle, 160) && text(value.roleSummary, 1000) && digest(value.candidateDigest) ? { candidateId: value.candidateId, ordinal: value.ordinal, displayName: value.displayName, roleTitle: value.roleTitle, roleSummary: value.roleSummary, state: value.state as "suggestion_not_contact", eligible: false } : null; }
function run(value: unknown): PersonDiscoveryProjection["history"]["runs"][number] | null { return record(value) && exact(value, ["runId", "prospectId", "state", "resultDigest"]) && opaque(value.runId) && opaque(value.prospectId) && member(value.state, ["requested", "completed", "needs_reconciliation"]) && (value.resultDigest === null || digest(value.resultDigest)) ? { runId: value.runId, prospectId: value.prospectId, state: value.state as "requested" | "completed" | "needs_reconciliation", resultDigest: value.resultDigest } : null; }
function relevanceRow(value: unknown): Relevance | null { return record(value) && exact(value, ["relevanceId", "prospectId", "contactId", "decisionId", "roleTitle"]) && opaque(value.relevanceId) && opaque(value.prospectId) && opaque(value.contactId) && opaque(value.decisionId) && text(value.roleTitle, 160) ? value as Relevance : null; }
function intent(value: unknown): PersonDiscoveryProjection["history"]["verificationIntents"][number] | null { return record(value) && member(value.intent, ["initial_verification", "stale_refresh"]) && member(value.channel, ["email", "phone"]) && opaque(value.relevanceId) ? { relevanceId: value.relevanceId, intent: value.intent as "initial_verification" | "stale_refresh", channel: value.channel as "email" | "phone" } : null; }
function page(value: Record<string, unknown>): PersonPage["pageInfo"] | null { return exact(value, ["limit", "returned", "hasNext", "nextCursor"]) && value.limit === PEOPLE_LIMIT && nonNegative(value.returned) && value.returned <= PEOPLE_LIMIT && typeof value.hasNext === "boolean" && (value.nextCursor === null || cursor(value.nextCursor)) && value.hasNext === (value.nextCursor !== null) ? { limit: 5, returned: value.returned, hasNext: value.hasNext, nextCursor: value.nextCursor } : null; }
function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); } function exact(value: Record<string, unknown>, keys: readonly string[]) { const actual = Object.keys(value).sort(), expected = [...keys].sort(); return actual.length === expected.length && actual.every((key, index) => key === expected[index]); } function member<T extends readonly string[]>(value: unknown, choices: T): value is T[number] { return typeof value === "string" && choices.includes(value); } function opaque(value: unknown): value is string { return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]{0,159}$/.test(value); } function digest(value: unknown): value is string { return typeof value === "string" && /^[a-f0-9]{64}$/.test(value); } function positive(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value > 0; } function nonNegative(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0; } function cursor(value: unknown): value is string { return typeof value === "string" && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value) && value.length <= 1200; } function text(value: unknown, maximum: number): value is string { return typeof value === "string" && value.length > 0 && value.length <= maximum; } function isPresent<T>(value: T | null): value is T { return value !== null; }
