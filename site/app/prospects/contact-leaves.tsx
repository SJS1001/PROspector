import React from "react";

export type ContactProjectionRow = { id: string; contactId: string; prospectId: string; state: string; eligible: boolean; reasonCodes: readonly string[]; observations?: readonly ContactObservationProjection[] };
export type ContactObservationProjection = { kind: string; verificationClass: string; method: string; verifiedAt: number | null };
export type IdentityProjectionRow = { id: string; subjectKind: string; kind: string; revision: number; candidateRevisions: readonly { subjectId: string; revision: number }[]; sourceLineageIds: readonly string[] };
export type ContactsProjection = { capability: { available: boolean; status: string; reason: string }; eligibility: readonly ContactProjectionRow[]; verifiedContacts: readonly ContactProjectionRow[]; suggestions: readonly ContactProjectionRow[]; needsReview: readonly ContactProjectionRow[]; identity: readonly IdentityProjectionRow[]; authority: { stage: string; grantCreation: string; operation: string; providerCall: boolean } };

const MAX_ROWS = 20;
const CONTACT_STATES = ["ContactReady", "ContactSuggestion", "NeedsReview", "NonContactable"] as const;
const REASON_CODES = ["contact_attestation_invalid", "contact_attestation_unavailable", "contact_authority_configuration_mismatch", "contact_authority_scope_mismatch", "contact_configuration_mismatch", "contact_evidence_invalid", "contact_evidence_stale", "contact_lineage_drifted", "contact_scope_mismatch", "invalid_contact_authority", "invalid_contact_input", "invalid_contact_strategy", "invalid_contact_target", "invalid_evaluation_time", "no_contact_evidence", "verification_class_ineligible", "verification_pending"] as const;
const OBSERVATION_KINDS = ["email", "phone"] as const;
const VERIFICATION_CLASSES = ["suggested", "domain_valid", "mailbox_verified", "source_verified", "invalid"] as const;
const VERIFICATION_METHODS = ["pattern_inference", "domain_validation", "mailbox_verification", "authoritative_source_reconfirmed"] as const;

const BLOCKED_CAPABILITY_REASON = "Contacts are unavailable until the separate capability gate is proven.";
export const BLOCKED_CONTACTS_PROJECTION: ContactsProjection = Object.freeze({ capability: { available: false, status: "blocked", reason: BLOCKED_CAPABILITY_REASON }, eligibility: [], verifiedContacts: [], suggestions: [], needsReview: [], identity: [], authority: { stage: "reject_only", grantCreation: "blocked", operation: "blocked", providerCall: false } });

/** Reject malformed server JSON before it can make a control ready or reach a leaf.
 * Public references remain useful only when they match the server's opaque-ID form. */
export function normalizeContactsProjection(value: unknown): ContactsProjection | null {
  if (!record(value) || !capability(value.capability) || !authority(value.authority) || ![value.eligibility, value.verifiedContacts, value.suggestions, value.needsReview, value.identity].every(Array.isArray)) return null;
  return { capability: { available: false, status: "blocked", reason: BLOCKED_CAPABILITY_REASON }, eligibility: contactRows(value.eligibility), verifiedContacts: contactRows(value.verifiedContacts), suggestions: contactRows(value.suggestions), needsReview: contactRows(value.needsReview), identity: identityRows(value.identity), authority: value.authority };
}

/** A read-only presentation of server-projected, opaque identifiers and status.
 * It intentionally omits contact values, source locators, and provider details. */
export function ContactsReadFirst({ projection }: { projection: ContactsProjection }) {
  const safe = normalizeContactsProjection(projection) ?? BLOCKED_CONTACTS_PROJECTION;
  return <>
    <section className="panel contacts-eligibility" aria-labelledby="contacts-eligibility"><h2 id="contacts-eligibility">Eligibility</h2><p role="status">{safe.capability.reason}</p><p>No provider call will be made.</p><ContactRows rows={safe.eligibility} empty="No eligibility status is currently projected." /></section>
    <section className="panel" aria-labelledby="verified-contacts"><h2 id="verified-contacts">Verified contacts</h2><p>Only current server-projected ContactReady status is shown; contact values remain hidden.</p><ContactRows rows={safe.verifiedContacts} empty="No current mailbox-verified or source-verified business contact points are projected." /></section>
    <section className="panel" aria-labelledby="contact-suggestions"><h2 id="contact-suggestions">Contact Suggestions</h2><p>Suggestions are not ContactReady and cannot be used for outreach, calling, export, or CRM.</p><ContactRows rows={safe.suggestions} empty="No contact suggestions are currently projected." /><h3>Needs review</h3><ContactRows rows={safe.needsReview} empty="No contacts currently require review." /></section>
    <section className="panel" aria-labelledby="authority-identity"><h2 id="authority-identity">Authority and identity</h2><p>Grant creation, reservation, and identity changes are blocked. Stale contacts need review; uncertain reservations have no retry path.</p>{safe.identity.length ? <ul>{safe.identity.map((row) => <li key={row.id}>Identity {row.subjectKind} {row.kind}, revision {row.revision}; {row.candidateRevisions.length} candidate{row.candidateRevisions.length === 1 ? "" : "s"} and {row.sourceLineageIds.length} lineage record{row.sourceLineageIds.length === 1 ? "" : "s"}.</li>)}</ul> : <p>No identity suggestions are currently projected.</p>}</section>
  </>;
}

function ContactRows({ rows, empty }: { rows: readonly ContactProjectionRow[]; empty: string }) { return rows.length ? <ul>{rows.map((row) => <li key={row.id}><strong>{row.state}</strong> for contact {row.contactId} on prospect {row.prospectId}{row.reasonCodes.length ? <> — {row.reasonCodes.join(", ")}</> : null}{row.observations?.length ? <ul aria-label="Contact evidence">{row.observations.map((item, index) => <li key={`${row.id}-evidence-${index}`}><dl><dt>Observation kind</dt><dd>{item.kind}</dd><dt>Verification class</dt><dd>{item.verificationClass}</dd><dt>Verification method</dt><dd>{item.method}</dd><dt>Verified at</dt><dd>{verifiedTime(item.verifiedAt)}</dd></dl></li>)}</ul> : <p>No bounded verification evidence is available for this contact.</p>}</li>)}</ul> : <p>{empty}</p>; }
function contactRows(value: unknown) { return Array.isArray(value) ? value.slice(0, MAX_ROWS).map(contactRow).filter((row): row is ContactProjectionRow => row !== null) : []; }
function identityRows(value: unknown) { return Array.isArray(value) ? value.slice(0, MAX_ROWS).map(identityRow).filter((row): row is IdentityProjectionRow => row !== null) : []; }
function contactRow(value: unknown): ContactProjectionRow | null { if (!record(value) || !opaqueId(value.id) || !opaqueId(value.contactId) || !opaqueId(value.prospectId) || !member(value.state, CONTACT_STATES) || typeof value.eligible !== "boolean" || !reasonCodes(value.reasonCodes)) return null; const observations = value.observations === undefined ? undefined : observationsFor(value.observations); if (observations === null) return null; return { id: value.id, contactId: value.contactId, prospectId: value.prospectId, state: value.state, eligible: value.eligible, reasonCodes: value.reasonCodes, ...(observations === undefined ? {} : { observations }) }; }
function observationsFor(value: unknown): readonly ContactObservationProjection[] | null { if (!Array.isArray(value) || value.length > 32) return null; const observations = value.map(observation); return observations.every((item): item is ContactObservationProjection => item !== null) ? observations : null; }
function observation(value: unknown): ContactObservationProjection | null { return record(value) && member(value.kind, OBSERVATION_KINDS) && member(value.verificationClass, VERIFICATION_CLASSES) && member(value.method, VERIFICATION_METHODS) && (value.verifiedAt === null || validTimestamp(value.verifiedAt)) ? { kind: value.kind, verificationClass: value.verificationClass, method: value.method, verifiedAt: value.verifiedAt } : null; }
function identityRow(value: unknown): IdentityProjectionRow | null { if (!record(value) || !opaqueId(value.id) || !member(value.subjectKind, ["contact", "organization"]) || !member(value.kind, ["merge", "split"]) || !positive(value.revision) || !Array.isArray(value.candidateRevisions) || value.candidateRevisions.length > 100 || !opaqueIds(value.sourceLineageIds, 100)) return null; const candidateRevisions = value.candidateRevisions.map((item) => record(item) && opaqueId(item.subjectId) && positive(item.revision) ? { subjectId: item.subjectId, revision: item.revision } : null); return candidateRevisions.every((item): item is { subjectId: string; revision: number } => item !== null) ? { id: value.id, subjectKind: value.subjectKind, kind: value.kind, revision: value.revision, candidateRevisions, sourceLineageIds: value.sourceLineageIds } : null; }
function capability(value: unknown): value is ContactsProjection["capability"] { return record(value) && value.available === false && value.status === "blocked" && typeof value.reason === "string" && value.reason.length <= 240; }
function authority(value: unknown): value is ContactsProjection["authority"] { return record(value) && value.stage === "reject_only" && value.grantCreation === "blocked" && value.operation === "blocked" && value.providerCall === false; }
function reasonCodes(value: unknown): value is readonly string[] { return Array.isArray(value) && value.length <= 32 && value.every((item) => member(item, REASON_CODES)); }
function opaqueIds(value: unknown, maximum: number): value is readonly string[] { return Array.isArray(value) && value.length <= maximum && value.every(opaqueId); }
function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }
function opaqueId(value: unknown): value is string { return typeof value === "string" && value.length > 0 && value.length <= 160 && /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(value) && !/^\d{7,15}$/.test(value.replace(/[-_]/g, "")); }
function positive(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value > 0; }
function validTimestamp(value: unknown): value is number { return positive(value) && value <= 8_640_000_000_000_000; }
function member<T extends readonly string[]>(value: unknown, allowed: T): value is T[number] { return typeof value === "string" && allowed.includes(value); }
function verifiedTime(timestamp: number | null) { if (timestamp === null) return "Unknown verification time"; try { return new Date(timestamp).toISOString(); } catch { return "Unknown verification time"; } }

export function DisabledContactAction({ children, explanation, explanationId }: { children: string; explanation: string; explanationId: string }) { return <p><button type="button" disabled aria-describedby={explanationId}>{children}</button> <span id={explanationId} tabIndex={0}>{explanation}</span></p>; }
