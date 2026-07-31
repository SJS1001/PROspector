import React from "react";

export type ContactProjectionRow = {
  id: string; contactId: string; prospectId: string; state: string; eligible: boolean;
  reasonCodes: readonly string[]; observations?: readonly { verificationClass: string }[];
};
export type IdentityProjectionRow = {
  id: string; subjectKind: string; kind: string; revision: number;
  candidateRevisions: readonly { subjectId: string; revision: number }[]; sourceLineageIds: readonly string[];
};
export type ContactsProjection = {
  capability: { available: boolean; status: string; reason: string };
  eligibility: readonly ContactProjectionRow[]; verifiedContacts: readonly ContactProjectionRow[];
  suggestions: readonly ContactProjectionRow[]; needsReview: readonly ContactProjectionRow[];
  identity: readonly IdentityProjectionRow[];
  authority: { stage: string; grantCreation: string; operation: string; providerCall: boolean };
};

const MAX_ROWS = 20;

/** A read-only presentation of server-projected, opaque identifiers and status.
 * It intentionally omits contact values, source locators, and provider details. */
export function ContactsReadFirst({ projection }: { projection: ContactsProjection }) {
  const eligibility = contactRows(projection.eligibility), verified = contactRows(projection.verifiedContacts);
  const suggestions = contactRows(projection.suggestions), review = contactRows(projection.needsReview), identity = identityRows(projection.identity);
  return <>
    <section className="panel contacts-eligibility" aria-labelledby="contacts-eligibility"><h2 id="contacts-eligibility">Eligibility</h2><p role="status">{text(projection.capability.reason, "Contacts status is unavailable.")}</p><p>No provider call will be made.</p><ContactRows rows={eligibility} empty="No eligibility status is currently projected." /></section>
    <section className="panel" aria-labelledby="verified-contacts"><h2 id="verified-contacts">Verified contacts</h2><p>Only current server-projected ContactReady status is shown; contact values remain hidden.</p><ContactRows rows={verified} empty="No current mailbox-verified or source-verified business contact points are projected." /></section>
    <section className="panel" aria-labelledby="contact-suggestions"><h2 id="contact-suggestions">Contact Suggestions</h2><p>Suggestions are not ContactReady and cannot be used for outreach, calling, export, or CRM.</p><ContactRows rows={suggestions} empty="No contact suggestions are currently projected." /><h3>Needs review</h3><ContactRows rows={review} empty="No contacts currently require review." /></section>
    <section className="panel" aria-labelledby="authority-identity"><h2 id="authority-identity">Authority and identity</h2><p>Grant creation, reservation, and identity changes are blocked. Stale contacts need review; uncertain reservations have no retry path.</p>{identity.length ? <ul>{identity.map((row) => <li key={row.id}>Identity {row.subjectKind} {row.kind}, revision {row.revision}; {row.candidateRevisions.length} candidate{row.candidateRevisions.length === 1 ? "" : "s"} and {row.sourceLineageIds.length} lineage record{row.sourceLineageIds.length === 1 ? "" : "s"}.</li>)}</ul> : <p>No identity suggestions are currently projected.</p>}</section>
  </>;
}

function ContactRows({ rows, empty }: { rows: readonly ContactProjectionRow[]; empty: string }) {
  return rows.length ? <ul>{rows.map((row) => <li key={row.id}><strong>{text(row.state, "Unknown status")}</strong> for contact {text(row.contactId, "unknown")} on prospect {text(row.prospectId, "unknown")}{row.reasonCodes.length ? <> — {row.reasonCodes.join(", ")}</> : null}{row.observations?.length ? <> — {row.observations.map((item) => item.verificationClass).join(", ")}</> : null}</li>)}</ul> : <p>{empty}</p>;
}
function contactRows(value: readonly ContactProjectionRow[]) { return Array.isArray(value) ? value.filter(contactRow).slice(0, MAX_ROWS) : []; }
function identityRows(value: readonly IdentityProjectionRow[]) { return Array.isArray(value) ? value.filter(identityRow).slice(0, MAX_ROWS) : []; }
function contactRow(value: unknown): value is ContactProjectionRow { if (!record(value) || !id(value.id) || !id(value.contactId) || !id(value.prospectId) || !short(value.state, 64) || typeof value.eligible !== "boolean" || !strings(value.reasonCodes, 32)) return false; return value.observations === undefined || Array.isArray(value.observations) && value.observations.every((item) => record(item) && short(item.verificationClass, 64)); }
function identityRow(value: unknown): value is IdentityProjectionRow { return record(value) && id(value.id) && short(value.subjectKind, 64) && short(value.kind, 64) && Number.isSafeInteger(value.revision) && value.revision > 0 && Array.isArray(value.candidateRevisions) && value.candidateRevisions.length <= 100 && value.candidateRevisions.every((item) => record(item) && id(item.subjectId) && Number.isSafeInteger(item.revision) && item.revision > 0) && strings(value.sourceLineageIds, 100); }
function strings(value: unknown, maximum: number): value is readonly string[] { return Array.isArray(value) && value.length <= maximum && value.every((item) => short(item, 160)); }
function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }
function id(value: unknown) { return short(value, 160); }
function short(value: unknown, maximum: number): value is string { return typeof value === "string" && value.trim().length > 0 && value.length <= maximum; }
function text(value: unknown, fallback: string) { return short(value, 240) ? value : fallback; }

export function DisabledContactAction({ children, explanation, explanationId }: { children: string; explanation: string; explanationId: string }) {
  return <p><button type="button" disabled aria-describedby={explanationId}>{children}</button> <span id={explanationId} tabIndex={0}>{explanation}</span></p>;
}
