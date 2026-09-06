import React, { useEffect, useRef, useState } from "react";

const ENDPOINT = "/api/contacts/person-discovery";
const PEOPLE_LIMIT = 5;
type Channel = "email" | "phone";
type DiscoveryStatus = "not_started" | "requested" | "completed" | "needs_reconciliation" | "stale_authority";
type Decision = "no_match" | "create_new" | "link_existing";
type Notice = { kind: "loading" | "ready" | "error" | "stale"; text: string };
type Candidate = Readonly<{
  candidateId: string;
  ordinal: number;
  state: "suggestion_not_contact" | "payload_unavailable";
  eligible: false;
  displayName?: string;
  roleTitle?: string;
  roleSummary?: string;
  candidateDigest?: string;
  provenance?: {
    sourceReference: string;
    excerpt: string;
    retrievedAt: number;
  } | null;
}>;
type PersonPage = Readonly<{
  runId: string | null;
  resultDigest: string | null;
  status: DiscoveryStatus;
  items: readonly Candidate[];
  pageInfo: {
    limit: 5;
    returned: number;
    hasNext: boolean;
    nextCursor: string | null;
  };
}>;
type Prospect = Readonly<{
  prospectId: string;
  prospectRevision: number;
  label: string;
  knownPerson: boolean;
}>;
type Contact = Readonly<{
  contactId: string;
  contactRevision: number;
  label: string;
}>;
type Relevance = Readonly<{
  relevanceId: string;
  prospectId: string;
  contactId: string;
  contactRevision: number;
  contactLabel: string;
  decisionId: string;
  roleTitle: string;
  current: true;
  verificationChannels: readonly Channel[];
}>;
type StaleObservation = Readonly<{
  sourceObservationId: string;
  relevanceId: string;
  channel: Channel;
  verifiedAt: number;
  status: "stale";
}>;
export type PersonDiscoveryProjection = Readonly<{
  capability: "reject_only" | "test_composed_only";
  approvedProspects: readonly Prospect[];
  linkableContacts: readonly Contact[];
  people: PersonPage;
  history: {
    runs: readonly {
      runId: string;
      prospectId: string;
      state: "requested" | "completed" | "needs_reconciliation";
      resultDigest: string | null;
    }[];
    decisions: readonly {
      decisionId: string;
      runId: string;
      prospectId: string;
      decision: Decision;
      candidateId: string | null;
      contactId: string | null;
    }[];
    relevance: readonly Relevance[];
    verificationIntents: readonly {
      intentId: string;
      relevanceId: string;
      intent: "initial_verification" | "stale_refresh";
      channel: Channel;
      sourceObservationId: string | null;
      effect: "intent_only";
    }[];
    staleTrustedObservations: readonly StaleObservation[];
  };
}>;

type PersonDiscoveryUiState = Readonly<{
  candidateId: string;
  contactId: string;
  relevanceId: string;
  channel: Channel | "";
  decision: Decision | "";
  confirmed: boolean;
  cursor: string | null;
  previous: readonly (string | null)[];
  notice: Notice;
  pending: boolean;
}>;
const initialPersonDiscoveryUiState: PersonDiscoveryUiState = Object.freeze({
  candidateId: "",
  contactId: "",
  relevanceId: "",
  channel: "",
  decision: "",
  confirmed: false,
  cursor: null,
  previous: Object.freeze([]),
  notice: {
    kind: "loading" as const,
    text: "Loading person-discovery status…",
  },
  pending: false,
});
export function personDiscoveryUrl(prospectId: string, cursor: string | null = null) {
  const query = new URLSearchParams({ prospectId });
  if (cursor) query.set("peopleCursor", cursor);
  return `${ENDPOINT}?${query}`;
}
export async function postPersonDiscoveryCommand(fetcher: typeof fetch, command: Record<string, unknown>) {
  return fetcher(ENDPOINT, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "content-type": "application/json",
      "x-prospector-intent": "person-discovery-mutation",
    },
    body: JSON.stringify(command),
  });
}

export function normalizePersonDiscoveryProjection(value: unknown): PersonDiscoveryProjection | null {
  if (
    !exact(value, ["capability", "approvedProspects", "linkableContacts", "people", "history"]) ||
    !member(value.capability, ["reject_only", "test_composed_only"]) ||
    !Array.isArray(value.approvedProspects) ||
    !Array.isArray(value.linkableContacts) ||
    !record(value.people) ||
    !exact(value.history, ["runs", "decisions", "relevance", "verificationIntents", "staleTrustedObservations"]) ||
    !Array.isArray(value.history.runs) ||
    !Array.isArray(value.history.decisions) ||
    !Array.isArray(value.history.relevance) ||
    !Array.isArray(value.history.verificationIntents) ||
    !Array.isArray(value.history.staleTrustedObservations)
  )
    return null;
  const approvedProspects = value.approvedProspects.map(prospect),
    linkableContacts = value.linkableContacts.map(contact),
    people = personPage(value.people),
    runs = value.history.runs.map(run),
    decisions = value.history.decisions.map(decisionRecord),
    relevance = value.history.relevance.map(relevanceRow),
    verificationIntents = value.history.verificationIntents.map(intent),
    staleTrustedObservations = value.history.staleTrustedObservations.map(staleObservation);
  if (
    !approvedProspects.every(isPresent) ||
    !linkableContacts.every(isPresent) ||
    !people ||
    !runs.every(isPresent) ||
    !decisions.every(isPresent) ||
    !relevance.every(isPresent) ||
    !verificationIntents.every(isPresent) ||
    !staleTrustedObservations.every(isPresent)
  )
    return null;
  if (
    !unique(approvedProspects, "prospectId") ||
    !unique(approvedProspects, "label") ||
    !unique(linkableContacts, "contactId") ||
    !unique(people.items, "candidateId") ||
    !unique(runs, "runId") ||
    !unique(decisions, "decisionId") ||
    !unique(relevance, "relevanceId") ||
    !unique(relevance, "contactId") ||
    !unique(verificationIntents, "intentId") ||
    !unique(staleTrustedObservations, "sourceObservationId")
  )
    return null;
  const prospectIds = new Set(approvedProspects.map((item) => item.prospectId));
  const runIds = new Set(runs.map((item) => item.runId));
  const decisionIds = new Set(decisions.map((item) => item.decisionId));
  const relevanceIds = new Set(relevance.map((item) => item.relevanceId));
  if (
    runs.some((item) => !prospectIds.has(item.prospectId)) ||
    decisions.some((item) => !runIds.has(item.runId) || !prospectIds.has(item.prospectId)) ||
    relevance.some((item) => !prospectIds.has(item.prospectId) || !decisionIds.has(item.decisionId)) ||
    verificationIntents.some((item) => !relevanceIds.has(item.relevanceId)) ||
    staleTrustedObservations.some((item) => !relevanceIds.has(item.relevanceId)) ||
    (people.runId !== null && !runIds.has(people.runId))
  )
    return null;
  return {
    capability: value.capability as PersonDiscoveryProjection["capability"],
    approvedProspects,
    linkableContacts,
    people,
    history: {
      runs: runs as PersonDiscoveryProjection["history"]["runs"],
      decisions: decisions as PersonDiscoveryProjection["history"]["decisions"],
      relevance,
      verificationIntents: verificationIntents as PersonDiscoveryProjection["history"]["verificationIntents"],
      staleTrustedObservations,
    },
  };
}

export function PersonDiscoveryWorkspace({
  fetcher = fetch,
  idFactory = () => crypto.randomUUID(),
}: Readonly<{ fetcher?: typeof fetch; idFactory?: () => string }> = {}) {
  const [projection, setProjection] = useState<PersonDiscoveryProjection | null>(null);
  const [selectedProspectId, setSelectedProspectId] = useState("");
  const [ui, setUi] = useState<PersonDiscoveryUiState>(initialPersonDiscoveryUiState);
  const mutationPending = useRef(false);
  const statusRef = useRef<HTMLParagraphElement>(null);
  const chosen = projection?.approvedProspects.find((item) => item.prospectId === selectedProspectId) ?? null;
  const discoveryAuthority = chosen && !chosen.knownPerson ? chosen : null;
  const candidate =
    projection?.people.items.find((item) => item.candidateId === ui.candidateId && item.state === "suggestion_not_contact") ?? null;
  const selectedContact = projection?.linkableContacts.find((item) => item.contactId === ui.contactId) ?? null;
  const currentDecision =
    projection?.history.decisions.find((item) => item.prospectId === selectedProspectId && item.runId === projection.people.runId) ?? null;
  const currentRelevance = projection?.history.relevance.filter((item) => item.current && item.prospectId === selectedProspectId) ?? [];
  const relevance =
    currentRelevance.find((item) => item.relevanceId === ui.relevanceId) ?? (currentRelevance.length === 1 ? currentRelevance[0] : null);
  const stale =
    relevance && ui.channel
      ? (projection?.history.staleTrustedObservations.find(
          (item) => item.relevanceId === relevance.relevanceId && item.channel === ui.channel,
        ) ?? null)
      : null;
  const resultDigest =
    projection?.people.resultDigest ??
    projection?.history.runs.find((item) => item.runId === projection.people.runId)?.resultDigest ??
    null;
  const runtimeActive = projection?.capability === "test_composed_only";
  const canDiscover = runtimeActive && !!discoveryAuthority && !currentDecision && !ui.pending;
  const canVerify = runtimeActive && !!chosen && !!relevance && !ui.pending;
  const decisionReady =
    !!ui.decision && ui.confirmed && (ui.decision === "no_match" || !!candidate) && (ui.decision !== "link_existing" || !!selectedContact);
  const focusStatus = () => queueMicrotask(() => statusRef.current?.focus());
  const setNotice = (notice: Notice) => setUi((state) => ({ ...state, notice }));
  const resetReview = () =>
    setUi((state) => ({
      ...state,
      candidateId: "",
      contactId: "",
      relevanceId: "",
      channel: "",
      decision: "",
      confirmed: false,
    }));
  async function load(prospectId: string, cursor: string | null, preserveNotice = false): Promise<void> {
    if (!prospectId) return;
    setUi((state) => ({
      ...state,
      pending: true,
      ...(preserveNotice
        ? {}
        : {
            notice: {
              kind: "loading",
              text: "Loading authoritative person-discovery status…",
            },
          }),
    }));
    try {
      const response = await fetcher(personDiscoveryUrl(prospectId, cursor), {
        headers: { accept: "application/json" },
        credentials: "same-origin",
      });
      if (response.status === 409) {
        setUi((state) => ({
          ...state,
          candidateId: "",
          contactId: "",
          relevanceId: "",
          channel: "",
          decision: "",
          confirmed: false,
          cursor: null,
          previous: [],
          notice: {
            kind: "stale",
            text: "This list changed while you were reviewing it. The first page was reloaded; select a person again.",
          },
        }));
        if (!preserveNotice) await load(prospectId, null, true);
        return;
      }
      if (!response.ok) {
        setNotice({
          kind: "error",
          text: "Person discovery is unavailable. Reload and try again; no provider call was made.",
        });
        return;
      }
      const parsed = normalizePersonDiscoveryProjection(await response.json());
      if (!parsed) {
        setNotice({
          kind: "error",
          text: "The person-discovery response was incomplete. No action was taken.",
        });
        return;
      }
      setProjection(parsed);
      setUi((state) => ({
        ...state,
        cursor,
        pending: false,
        candidateId: "",
        contactId: "",
        relevanceId: parsed.history.relevance.length === 1 ? parsed.history.relevance[0].relevanceId : "",
        channel: "",
        decision: "",
        confirmed: false,
        notice: preserveNotice
          ? state.notice
          : {
              kind: "ready",
              text:
                parsed.capability === "reject_only"
                  ? "Person discovery is unavailable in this runtime. No provider call can be made."
                  : "Authoritative person-discovery status loaded.",
            },
      }));
    } catch {
      setNotice({
        kind: "error",
        text: "Person discovery could not be loaded. Check your connection; no provider call was made.",
      });
    } finally {
      setUi((state) => ({ ...state, pending: false }));
      focusStatus();
    }
  }
  useEffect(() => {
    void fetcher(ENDPOINT, {
      headers: { accept: "application/json" },
      credentials: "same-origin",
    })
      .then(async (response) => (response.ok ? normalizePersonDiscoveryProjection(await response.json()) : null))
      .then((value) => {
        if (!value) {
          setNotice({
            kind: "error",
            text: "Person discovery is unavailable. No provider call was made.",
          });
          return;
        }
        setProjection(value);
        const first = value.approvedProspects.find((item) => !item.knownPerson) ?? value.approvedProspects[0];
        if (first) {
          setSelectedProspectId(first.prospectId);
          void load(first.prospectId, null);
        } else
          setNotice({
            kind: "ready",
            text: "No current approved prospect is available.",
          });
      })
      .catch(() =>
        setNotice({
          kind: "error",
          text: "Person discovery could not be loaded. No provider call was made.",
        }),
      ); // initial read only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  async function recoverUnknown(message: string) {
    if (!selectedProspectId) return;
    setNotice({ kind: "stale", text: message });
    await load(selectedProspectId, null, true);
  }
  async function command(body: Record<string, unknown>, unknown: string) {
    if (mutationPending.current) return;
    mutationPending.current = true;
    setUi((state) => ({ ...state, pending: true }));
    try {
      const response = await postPersonDiscoveryCommand(fetcher, body);
      if (!response.ok) await recoverUnknown(unknown);
      else if (selectedProspectId) await load(selectedProspectId, null);
    } catch {
      await recoverUnknown(unknown);
    } finally {
      mutationPending.current = false;
      setUi((state) => ({ ...state, pending: false }));
      focusStatus();
    }
  }
  function startDiscovery() {
    if (!canDiscover || projection?.people.status === "requested" || projection?.people.status === "needs_reconciliation") return;
    resetReview();
    void command(
      {
        action: "start_person_discovery",
        prospectId: discoveryAuthority.prospectId,
        expectedProspectRevision: discoveryAuthority.prospectRevision,
        maxCandidates: 20,
        maxProvenancePerCandidate: 8,
        idempotencyKey: idFactory(),
      },
      "The request result is unknown. Status was refreshed; it was not retried.",
    );
  }
  function recordDecision() {
    if (!canDiscover || !projection?.people.runId || !resultDigest || !decisionReady) return;
    void command(
      {
        action: "decide_person_discovery",
        runId: projection.people.runId,
        expectedResultDigest: resultDigest,
        decision: ui.decision,
        candidateId: ui.decision === "no_match" ? null : candidate!.candidateId,
        existingContactId: ui.decision === "link_existing" ? selectedContact!.contactId : null,
        expectedProspectRevision: discoveryAuthority.prospectRevision,
        idempotencyKey: idFactory(),
      },
      "The decision result is unknown. Status was refreshed; it was not retried.",
    );
  }
  function verificationIntent(kind: "initial_verification" | "stale_refresh") {
    if (
      !canVerify ||
      !chosen ||
      !relevance ||
      !ui.channel ||
      !relevance.verificationChannels.includes(ui.channel) ||
      (kind === "stale_refresh" && !stale)
    )
      return;
    void command(
      {
        action: "record_verification_intent",
        relevanceId: relevance.relevanceId,
        intent: kind,
        channel: ui.channel,
        sourceObservationId: kind === "stale_refresh" ? stale!.sourceObservationId : null,
        expectedProspectRevision: chosen.prospectRevision,
        expectedContactRevision: relevance.contactRevision,
        idempotencyKey: idFactory(),
      },
      "The verification intent result is unknown. Status was refreshed; it was not retried.",
    );
  }
  function selectProspect(id: string) {
    setSelectedProspectId(id);
    setUi((state) => ({
      ...state,
      cursor: null,
      previous: [],
      candidateId: "",
      contactId: "",
      relevanceId: "",
      channel: "",
      decision: "",
      confirmed: false,
    }));
    if (id) void load(id, null);
  }
  function move(direction: "next" | "previous") {
    if (!selectedProspectId || ui.pending) return;
    if (direction === "next" && projection?.people.pageInfo.nextCursor) {
      setUi((state) => ({
        ...state,
        previous: [...state.previous, state.cursor],
      }));
      void load(selectedProspectId, projection.people.pageInfo.nextCursor);
    }
    if (direction === "previous" && ui.previous.length) {
      const prior = ui.previous[ui.previous.length - 1] ?? null;
      setUi((state) => ({ ...state, previous: state.previous.slice(0, -1) }));
      void load(selectedProspectId, prior);
    }
  }
  const serviceReason = !runtimeActive
    ? "Unavailable: this ordinary runtime has no authorized discovery service, so no provider call can be made."
    : !discoveryAuthority
      ? chosen?.knownPerson
        ? "Discovery is complete because a current person is linked to this prospect."
        : "Choose a current approved prospect with no known person first."
      : currentDecision
        ? "This discovery run already has a recorded terminal decision."
        : ui.pending
          ? "Wait for the current request to finish."
          : "";
  return (
    <section className="person-discovery-workspace" aria-labelledby="person-discovery-heading">
      <header>
        <span className="eyebrow">CONTACTS · PERSON DISCOVERY</span>
        <h2 id="person-discovery-heading">Find suitable people</h2>
        <p>
          Discovery suggests people for review. Verification is a separate explicit step. Neither step calls an external service in this
          runtime.
        </p>
      </header>
      <p ref={statusRef} tabIndex={-1} role="status" aria-live="polite" data-status={ui.notice.kind}>
        {ui.notice.text}
      </p>
      <fieldset className="panel">
        <legend>Approved prospect</legend>
        <label>
          Approved prospect{" "}
          <select
            aria-label="Approved prospect"
            value={selectedProspectId}
            disabled={ui.pending}
            onChange={(event) => selectProspect(event.target.value)}
          >
            <option value="">Select an approved prospect</option>
            {projection?.approvedProspects.map((item) => (
              <option key={item.prospectId} value={item.prospectId}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        {discoveryAuthority ? (
          <p>
            <strong>No known person</strong> is linked to this approved prospect.
          </p>
        ) : chosen?.knownPerson ? (
          <p>A current person is linked. You may record a separate verification intent below.</p>
        ) : (
          <p>Select a current approved prospect.</p>
        )}
      </fieldset>
      <section className="panel" aria-labelledby="discovery-run-heading">
        <h3 id="discovery-run-heading">Discovery run</h3>
        <p>{runMessage(projection?.people.status ?? "not_started")}</p>
        {serviceReason || projection?.people.status === "requested" || projection?.people.status === "needs_reconciliation" ? (
          <DisabledAction
            id="find-suitable-people-reason"
            text={
              serviceReason ||
              (projection?.people.status === "requested"
                ? "A discovery run is already requested. Wait for its authoritative result; it will not be retried automatically."
                : "This outcome needs reconciliation before another discovery run can be requested.")
            }
          >
            Find suitable people
          </DisabledAction>
        ) : (
          <button type="button" className="primary" onClick={startDiscovery}>
            Find suitable people
          </button>
        )}
      </section>
      {projection?.people.status === "completed" ? (
        <section className="panel" aria-labelledby="suggested-people-heading">
          <h3 id="suggested-people-heading">Suggested people</h3>
          <p>Every result is a suggestion, not a Contact. No send, call, export, package, or verified-contact control is available here.</p>
          {projection.people.items.length ? (
            <ul className="person-candidate-list">
              {projection.people.items.map((item) =>
                item.state === "payload_unavailable" ? (
                  <li key={item.candidateId}>
                    <strong>Suggestion unavailable</strong>
                    <p>Its retained review data is no longer available. Select another current suggestion.</p>
                  </li>
                ) : (
                  <li key={item.candidateId}>
                    <label>
                      <input
                        type="radio"
                        name="person-candidate"
                        checked={ui.candidateId === item.candidateId}
                        disabled={!!currentDecision || ui.pending}
                        onChange={() =>
                          setUi((state) => ({
                            ...state,
                            candidateId: item.candidateId,
                            confirmed: false,
                          }))
                        }
                      />{" "}
                      <strong>Suggested person — not yet a contact</strong>
                    </label>
                    <dl>
                      <div>
                        <dt>Name</dt>
                        <dd>{item.displayName}</dd>
                      </div>
                      <div>
                        <dt>Title</dt>
                        <dd>{item.roleTitle}</dd>
                      </div>
                      <div>
                        <dt>Role</dt>
                        <dd>{item.roleSummary}</dd>
                      </div>
                      <div>
                        <dt>Source</dt>
                        <dd>
                          {item.provenance ? item.provenance.sourceReference : "No retained source is available for this suggestion."}
                        </dd>
                      </div>
                      <div>
                        <dt>Retrieved</dt>
                        <dd>{item.provenance ? new Date(item.provenance.retrievedAt).toISOString().slice(0, 10) : "Not available"}</dd>
                      </div>
                      <div>
                        <dt>State</dt>
                        <dd>Not eligible for contact actions</dd>
                      </div>
                    </dl>
                    {item.provenance ? (
                      <details>
                        <summary>Review bounded evidence</summary>
                        <p>{item.provenance.excerpt}</p>
                      </details>
                    ) : null}
                  </li>
                ),
              )}
            </ul>
          ) : (
            <p>No suitable people were returned. You may explicitly record No match.</p>
          )}
          <PersonPageControls
            info={projection.people.pageInfo}
            canGoBack={ui.previous.length > 0}
            loading={ui.pending}
            onPrevious={() => move("previous")}
            onNext={() => move("next")}
          />
        </section>
      ) : null}
      {currentDecision ? (
        <section className="panel" aria-labelledby="recorded-person-decision">
          <h3 id="recorded-person-decision">Decision recorded</h3>
          <p>
            <strong>{decisionLabel(currentDecision.decision)}</strong> is the terminal result for this discovery run. It cannot be changed
            or submitted again.
          </p>
        </section>
      ) : projection?.people.status === "completed" && discoveryAuthority ? (
        <fieldset className="panel">
          <legend>Explicit owner decision</legend>
          <p>Choose one outcome. Nothing is selected automatically.</p>
          <label>
            <input
              type="radio"
              name="person-decision"
              checked={ui.decision === "no_match"}
              disabled={ui.pending}
              onChange={() =>
                setUi((state) => ({
                  ...state,
                  decision: "no_match",
                  confirmed: false,
                }))
              }
            />{" "}
            No match
          </label>
          <label>
            <input
              type="radio"
              name="person-decision"
              checked={ui.decision === "create_new"}
              disabled={ui.pending}
              onChange={() =>
                setUi((state) => ({
                  ...state,
                  decision: "create_new",
                  confirmed: false,
                }))
              }
            />{" "}
            Create new person
          </label>
          <label>
            <input
              type="radio"
              name="person-decision"
              checked={ui.decision === "link_existing"}
              disabled={ui.pending}
              onChange={() =>
                setUi((state) => ({
                  ...state,
                  decision: "link_existing",
                  confirmed: false,
                }))
              }
            />{" "}
            Link existing person
          </label>
          {ui.decision === "link_existing" ? (
            <label>
              Exact existing Contact{" "}
              <select
                aria-label="Exact existing Contact"
                value={ui.contactId}
                disabled={ui.pending}
                onChange={(event) =>
                  setUi((state) => ({
                    ...state,
                    contactId: event.target.value,
                    confirmed: false,
                  }))
                }
              >
                <option value="">Select one current Contact</option>
                {projection.linkableContacts.map((item) => (
                  <option key={item.contactId} value={item.contactId}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label>
            <input
              type="checkbox"
              checked={ui.confirmed}
              disabled={!ui.decision || ui.pending}
              onChange={(event) =>
                setUi((state) => ({
                  ...state,
                  confirmed: event.target.checked,
                }))
              }
            />{" "}
            I confirm this explicit decision.
          </label>
          {!decisionReady || !canDiscover ? (
            <DisabledAction
              id="record-person-decision-reason"
              text={
                !canDiscover
                  ? serviceReason || "This action is unavailable in the current runtime."
                  : ui.decision === "link_existing" && !selectedContact
                    ? "Select one exact current Contact before linking."
                    : ui.decision === "no_match"
                      ? "Confirm the No match decision before recording it."
                      : !candidate
                        ? "Select one current suggested person before recording this decision."
                        : "Confirm this explicit decision before recording it."
              }
            >
              Record decision
            </DisabledAction>
          ) : (
            <button type="button" onClick={recordDecision}>
              Record decision
            </button>
          )}
        </fieldset>
      ) : null}
      {currentRelevance.length ? (
        <fieldset className="panel">
          <legend>Verify business contact details</legend>
          <p>A person link is not verification. Recording an intent never calls a provider or makes any contact detail eligible.</p>
          {currentRelevance.length > 1 ? (
            <label>
              Linked Contact{" "}
              <select
                aria-label="Linked Contact"
                value={ui.relevanceId}
                disabled={ui.pending}
                onChange={(event) =>
                  setUi((state) => ({
                    ...state,
                    relevanceId: event.target.value,
                    channel: "",
                  }))
                }
              >
                <option value="">Select one current linked Contact</option>
                {currentRelevance.map((item) => (
                  <option key={item.relevanceId} value={item.relevanceId}>
                    {item.contactLabel} · {item.roleTitle}
                  </option>
                ))}
              </select>
            </label>
          ) : relevance ? (
            <p>
              Current linked Contact: <strong>{relevance.contactLabel}</strong> · {relevance.roleTitle}
            </p>
          ) : null}
          {relevance ? (
            <label>
              Contact channel{" "}
              <select
                aria-label="Contact channel"
                value={ui.channel}
                disabled={ui.pending}
                onChange={(event) =>
                  setUi((state) => ({
                    ...state,
                    channel: event.target.value as Channel | "",
                  }))
                }
              >
                <option value="">Choose email or phone</option>
                {relevance.verificationChannels.map((channel) => (
                  <option key={channel} value={channel}>
                    {channel === "email" ? "Email" : "Phone"}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {canVerify && ui.channel ? (
            <button type="button" onClick={() => verificationIntent("initial_verification")}>
              Record initial verification intent
            </button>
          ) : (
            <DisabledAction
              id="verify-contact-details-reason"
              text={
                !relevance
                  ? "Select one current linked Contact."
                  : !ui.channel
                    ? "Choose email or phone before recording an initial verification intent."
                    : serviceReason || "The current runtime cannot record a verification intent."
              }
            >
              Record initial verification intent
            </DisabledAction>
          )}
          {stale && canVerify ? (
            <button type="button" onClick={() => verificationIntent("stale_refresh")}>
              Record stale verification refresh
            </button>
          ) : (
            <DisabledAction
              id="refresh-verification-unavailable"
              text={
                !ui.channel
                  ? "Choose email or phone to check for stale trusted evidence."
                  : "No stale trusted evidence for this Contact and channel is available to refresh."
              }
            >
              Record stale verification refresh
            </DisabledAction>
          )}
          <p>Generated, directory, domain, or MX data is never eligible.</p>
        </fieldset>
      ) : null}
    </section>
  );
}
export function PersonPageControls({
  info,
  canGoBack,
  loading,
  onPrevious,
  onNext,
}: {
  info: PersonPage["pageInfo"];
  canGoBack: boolean;
  loading: boolean;
  onPrevious(): void;
  onNext(): void;
}) {
  const previousReason = loading ? "Wait for the current page request to finish." : "There is no earlier people page.";
  const nextReason = loading ? "Wait for the current page request to finish." : "There is no later people page.";
  return (
    <nav className="person-page-controls" aria-label="Suggested people pages">
      <span>Showing {info.returned} people on this page.</span>
      {loading || !canGoBack ? (
        <DisabledAction id="previous-people-reason" text={previousReason}>
          Previous people
        </DisabledAction>
      ) : (
        <button type="button" onClick={onPrevious}>
          Previous people
        </button>
      )}
      {loading || !info.hasNext || !info.nextCursor ? (
        <DisabledAction id="next-people-reason" text={nextReason}>
          Next people
        </DisabledAction>
      ) : (
        <button type="button" onClick={onNext}>
          Next people
        </button>
      )}
    </nav>
  );
}
export function DisabledAction({ children, text, id }: { children: string; text: string; id: string }) {
  return (
    <span className="disabled-action">
      <button type="button" disabled aria-describedby={id}>
        {children}
      </button>
      <span id={id} tabIndex={0}>
        {text}
      </span>
    </span>
  );
}
function runMessage(status: DiscoveryStatus) {
  return (
    {
      not_started: "No discovery run has been requested.",
      requested: "Discovery is requested. Wait for an authoritative result; do not retry automatically.",
      completed: "The latest discovery run is complete. Review suggestions before deciding.",
      needs_reconciliation: "The latest discovery outcome needs reconciliation. It was not retried.",
      stale_authority: "The prior authority is stale. Reload and select a current approved prospect.",
    } as const
  )[status];
}
function decisionLabel(value: Decision) {
  return value === "no_match" ? "No match" : value === "create_new" ? "Create new person" : "Link existing person";
}
function prospect(value: unknown): Prospect | null {
  return record(value) &&
    exact(value, ["prospectId", "prospectRevision", "label", "knownPerson"]) &&
    opaque(value.prospectId) &&
    positive(value.prospectRevision) &&
    text(value.label, 160) &&
    typeof value.knownPerson === "boolean"
    ? (value as Prospect)
    : null;
}
function contact(value: unknown): Contact | null {
  return record(value) &&
    exact(value, ["contactId", "contactRevision", "label"]) &&
    opaque(value.contactId) &&
    positive(value.contactRevision) &&
    text(value.label, 160)
    ? (value as Contact)
    : null;
}
function personPage(value: Record<string, unknown>): PersonPage | null {
  if (!exact(value, ["runId", "status", "items", "pageInfo"]) && !exact(value, ["runId", "status", "items", "pageInfo", "resultDigest"]))
    return null;
  if (
    (value.runId !== null && !opaque(value.runId)) ||
    (value.resultDigest !== undefined && value.resultDigest !== null && !digest(value.resultDigest)) ||
    !member(value.status, ["not_started", "requested", "completed", "needs_reconciliation", "stale_authority"]) ||
    !Array.isArray(value.items) ||
    !record(value.pageInfo)
  )
    return null;
  const items = value.items.map(candidate),
    pageInfo = page(value.pageInfo);
  if (
    !items.every(isPresent) ||
    !pageInfo ||
    pageInfo.returned !== items.length ||
    (value.status === "completed" ? !opaque(value.runId) || !digest(value.resultDigest) : items.length !== 0)
  )
    return null;
  return {
    runId: value.runId,
    resultDigest: digest(value.resultDigest) ? value.resultDigest : null,
    status: value.status as DiscoveryStatus,
    items,
    pageInfo,
  };
}
function candidate(value: unknown): Candidate | null {
  if (
    !record(value) ||
    !opaque(value.candidateId) ||
    !ordinal(value.ordinal) ||
    value.eligible !== false ||
    !member(value.state, ["suggestion_not_contact", "payload_unavailable"])
  )
    return null;
  if (value.state === "payload_unavailable")
    return exact(value, ["candidateId", "ordinal", "state", "eligible"])
      ? {
          candidateId: value.candidateId,
          ordinal: value.ordinal,
          state: "payload_unavailable",
          eligible: false,
        }
      : null;
  const allowed = exact(value, [
    "candidateId",
    "ordinal",
    "displayName",
    "roleTitle",
    "roleSummary",
    "candidateDigest",
    "provenance",
    "state",
    "eligible",
  ]);
  const provenance = value.provenance === null ? null : provenanceRow(value.provenance);
  return allowed &&
    text(value.displayName, 160) &&
    text(value.roleTitle, 160) &&
    text(value.roleSummary, 1000) &&
    digest(value.candidateDigest) &&
    (value.provenance === null || !!provenance)
    ? {
        candidateId: value.candidateId,
        ordinal: value.ordinal,
        displayName: value.displayName,
        roleTitle: value.roleTitle,
        roleSummary: value.roleSummary,
        candidateDigest: value.candidateDigest,
        provenance,
        state: "suggestion_not_contact",
        eligible: false,
      }
    : null;
}
function provenanceRow(value: unknown): Candidate["provenance"] {
  return record(value) &&
    exact(value, ["sourceReference", "excerpt", "retrievedAt"]) &&
    text(value.sourceReference, 1000) &&
    text(value.excerpt, 1000) &&
    positive(value.retrievedAt)
    ? {
        sourceReference: value.sourceReference,
        excerpt: value.excerpt,
        retrievedAt: value.retrievedAt,
      }
    : null;
}
function run(value: unknown): PersonDiscoveryProjection["history"]["runs"][number] | null {
  return record(value) &&
    exact(value, ["runId", "prospectId", "state", "resultDigest"]) &&
    opaque(value.runId) &&
    opaque(value.prospectId) &&
    member(value.state, ["requested", "completed", "needs_reconciliation"]) &&
    (value.state === "requested" ? value.resultDigest === null : digest(value.resultDigest))
    ? (value as PersonDiscoveryProjection["history"]["runs"][number])
    : null;
}
function relevanceRow(value: unknown): Relevance | null {
  return exact(value, [
    "relevanceId",
    "prospectId",
    "contactId",
    "contactRevision",
    "contactLabel",
    "decisionId",
    "roleTitle",
    "current",
    "verificationChannels",
  ]) &&
    opaque(value.relevanceId) &&
    opaque(value.prospectId) &&
    opaque(value.contactId) &&
    positive(value.contactRevision) &&
    text(value.contactLabel, 160) &&
    opaque(value.decisionId) &&
    text(value.roleTitle, 160) &&
    value.current === true &&
    Array.isArray(value.verificationChannels) &&
    value.verificationChannels.length > 0 &&
    value.verificationChannels.length <= 2 &&
    value.verificationChannels.every((channel) => member(channel, ["email", "phone"])) &&
    new Set(value.verificationChannels).size === value.verificationChannels.length
    ? (value as Relevance)
    : null;
}
function decisionRecord(value: unknown): PersonDiscoveryProjection["history"]["decisions"][number] | null {
  if (
    !exact(value, ["decisionId", "runId", "prospectId", "decision", "candidateId", "contactId"]) ||
    !opaque(value.decisionId) ||
    !opaque(value.runId) ||
    !opaque(value.prospectId) ||
    !member(value.decision, ["no_match", "create_new", "link_existing"])
  )
    return null;
  const validShape =
    value.decision === "no_match"
      ? value.candidateId === null && value.contactId === null
      : opaque(value.candidateId) && opaque(value.contactId);
  return validShape ? (value as PersonDiscoveryProjection["history"]["decisions"][number]) : null;
}
function intent(value: unknown): PersonDiscoveryProjection["history"]["verificationIntents"][number] | null {
  return exact(value, ["intentId", "relevanceId", "intent", "channel", "sourceObservationId", "effect"]) &&
    opaque(value.intentId) &&
    opaque(value.relevanceId) &&
    member(value.intent, ["initial_verification", "stale_refresh"]) &&
    member(value.channel, ["email", "phone"]) &&
    value.effect === "intent_only" &&
    (value.intent === "initial_verification" ? value.sourceObservationId === null : opaque(value.sourceObservationId))
    ? (value as PersonDiscoveryProjection["history"]["verificationIntents"][number])
    : null;
}
function staleObservation(value: unknown): StaleObservation | null {
  return record(value) &&
    exact(value, ["sourceObservationId", "relevanceId", "channel", "verifiedAt", "status"]) &&
    opaque(value.sourceObservationId) &&
    opaque(value.relevanceId) &&
    member(value.channel, ["email", "phone"]) &&
    positive(value.verifiedAt) &&
    value.status === "stale"
    ? (value as StaleObservation)
    : null;
}
function page(value: Record<string, unknown>): PersonPage["pageInfo"] | null {
  return exact(value, ["limit", "returned", "hasNext", "nextCursor"]) &&
    value.limit === PEOPLE_LIMIT &&
    nonNegative(value.returned) &&
    value.returned <= PEOPLE_LIMIT &&
    typeof value.hasNext === "boolean" &&
    (value.nextCursor === null || cursor(value.nextCursor)) &&
    value.hasNext === (value.nextCursor !== null)
    ? {
        limit: 5,
        returned: value.returned,
        hasNext: value.hasNext,
        nextCursor: value.nextCursor,
      }
    : null;
}
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function exact(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (!record(value)) return false;
  const actual = Object.keys(value).sort(),
    expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}
function unique<T extends object>(values: readonly T[], key: keyof T) {
  const seen = new Set<unknown>();
  return values.every((value) => {
    if (seen.has(value[key])) return false;
    seen.add(value[key]);
    return true;
  });
}
function member<T extends readonly string[]>(value: unknown, choices: T): value is T[number] {
  return typeof value === "string" && choices.includes(value);
}
function opaque(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]{0,159}$/.test(value);
}
function digest(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}
function positive(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}
function ordinal(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value < 20;
}
function nonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
function cursor(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value) && value.length <= 1200;
}
function text(value: unknown, maximum: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maximum;
}
function isPresent<T>(value: T | null): value is T {
  return value !== null;
}
