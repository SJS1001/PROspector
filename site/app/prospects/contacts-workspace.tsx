import React, { useEffect, useRef, useState } from "react";
import { ContactsReadFirst, DisabledContactAction, type ContactsProjection } from "./contact-leaves";
import { beginConfirmationRequest, canSubmitContactConfirmation as canSubmit, finishAuthorityRefresh, INITIAL_CONTACT_CONFIRMATION_STATE, invalidateContactConfirmation, isCurrentConfirmationRequest, setExplicitConfirmation, startAuthorityRefresh, type ContactConfirmationState } from "./contact-confirmation-state";

const blocked: ContactsProjection = { capability: { available: false, status: "blocked", reason: "Contacts are unavailable until the separate capability gate is proven." }, eligibility: [], verifiedContacts: [], suggestions: [], needsReview: [], identity: [], authority: { stage: "reject_only", grantCreation: "blocked", operation: "blocked", providerCall: false } };
type Notice = { kind: "loading" | "authority" | "transport" | "csrf" | "server"; text: string };

/** This is the sole Contacts transport owner. It never holds provider authority:
 * GET refreshes the owner projection/CSRF and POST remains reject-only. */
export function ContactsWorkspace({ initialProjection = blocked }: { initialProjection?: ContactsProjection }) {
  const [projection, setProjection] = useState(initialProjection), [confirmation, setConfirmation] = useState(INITIAL_CONTACT_CONFIRMATION_STATE), [notice, setNotice] = useState<Notice>({ kind: "loading", text: "Loading authoritative Contacts status…" });
  const confirmationRef = useRef<ContactConfirmationState>(INITIAL_CONTACT_CONFIRMATION_STATE);
  const { authorityReady, confirmed, pending } = confirmation;
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  function commitConfirmation(next: ContactConfirmationState) { confirmationRef.current = next; setConfirmation(next); }
  function setAuthorityReady(ready: boolean) { commitConfirmation({ ...confirmationRef.current, authorityReady: ready, confirmed: ready ? confirmationRef.current.confirmed : false }); }
  function setConfirmed(value: boolean) { commitConfirmation(setExplicitConfirmation(confirmationRef.current, value)); }
  async function refresh() {
    const started = startAuthorityRefresh(confirmationRef.current); commitConfirmation(started); const generation = started.generation;
    setAuthorityReady(false);
    setNotice({ kind: "loading", text: "Loading authoritative Contacts status…" });
    try {
      const response = await fetch("/api/contacts", { headers: { accept: "application/json" }, credentials: "same-origin" });
      if (generation !== confirmationRef.current.generation) return false;
      if (!response.ok) { setNotice({ kind: response.status === 404 ? "authority" : "server", text: response.status === 404 ? "Contacts are unavailable outside the private owner workspace." : "Contacts status is temporarily unavailable. Reload and try again." }); return false; }
      const body = await response.json();
      if (generation !== confirmationRef.current.generation) return false;
      setProjection(body); commitConfirmation(finishAuthorityRefresh(confirmationRef.current, generation, true)); setNotice({ kind: "authority", text: body.capability?.reason ?? "Contacts capability remains blocked. No provider call will be made." }); return true;
    } catch { if (generation === confirmationRef.current.generation) { commitConfirmation(finishAuthorityRefresh(confirmationRef.current, generation, false)); setNotice({ kind: "transport", text: "Contacts status could not be loaded. Check your connection and reload; no provider call was made." }); } return false; }
  }
  // The first load is intentionally once-per-mount; later refreshes are explicit response handling.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void Promise.resolve().then(refresh); }, []);
  async function requestConfirmation() {
    const submission = beginConfirmationRequest(confirmationRef.current); if (!submission) return;
    commitConfirmation(submission.state);
    try {
      const response = await postContactConfirmation(fetch, { authorityReady: true, confirmed: true, pending: false, idempotencyKey });
      if (!response) return;
      if (!isCurrentConfirmationRequest(confirmationRef.current, submission.generation)) return;
      if (response.status === 409) { setNotice({ kind: "authority", text: "Contacts capability is blocked. No provider call will be made; the authoritative status was refreshed." }); await refresh(); return; }
      if (response.status === 403) { setNotice({ kind: "csrf", text: "Request protection expired. Contacts status was refreshed; confirm again before retrying." }); await refresh(); return; }
      if (!response.ok) { commitConfirmation(invalidateContactConfirmation(confirmationRef.current)); setNotice({ kind: "server", text: "Contacts request result is unknown. Reload authoritative status and confirm again; no retry was attempted." }); return; }
      await refresh();
    } catch { if (isCurrentConfirmationRequest(confirmationRef.current, submission.generation)) { commitConfirmation(invalidateContactConfirmation(confirmationRef.current)); setNotice({ kind: "transport", text: "Contacts request result is unknown. Reload authoritative status and confirm again; no retry was attempted." }); } }
  }
  return <section className="contacts-workspace" aria-labelledby="contacts-workspace"><header className="page-heading"><span className="eyebrow">CONTACTS · OWNER-ONLY</span><h1 id="contacts-workspace">Contacts</h1><p>Evidence is shown before action. This local preparation surface has no live contact data or provider access.</p></header><ContactsReadFirst projection={projection}/><fieldset className="panel"><legend>Stage 1 — grant confirmation</legend><p>The immutable server tuple and digest are unavailable until a future accepted capability gate. Confirmation creates no provider request.</p><label><input type="checkbox" checked={confirmed} disabled={!authorityReady || pending} onChange={(event) => setConfirmed(event.target.checked)}/> I understand this creates no provider request.</label><p><button type="button" disabled={!authorityReady || !confirmed || pending} onClick={() => void requestConfirmation()}>Create grant confirmation</button></p><p role="status" aria-live="polite" data-status={notice.kind}>{notice.text}</p></fieldset><fieldset className="panel"><legend>Stage 2 — granted operation</legend><DisabledContactAction explanationId="contacts-granted-operation-explanation" explanation="Unavailable: a separate accepted grant and committed reservation are required." >Run granted operation</DisabledContactAction></fieldset></section>;
}

export function canSubmitContactConfirmation(input: { authorityReady: boolean; confirmed: boolean; pending: boolean }) { return canSubmit(input); }
export async function postContactConfirmation(fetcher: typeof fetch, input: { authorityReady: boolean; confirmed: boolean; pending: boolean; idempotencyKey: string }) {
  if (!canSubmitContactConfirmation(input)) return null;
  return fetcher("/api/contacts", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json", "x-prospector-intent": "contacts-mutation" }, body: JSON.stringify({ action: "create_grant_confirmation", prospectId: "synthetic-preview-only", expectedProspectRevision: 1, idempotencyKey: input.idempotencyKey }) });
}
