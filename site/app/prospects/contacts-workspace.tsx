import React, { useEffect, useRef, useState } from "react";
import { BLOCKED_CONTACTS_PROJECTION, ContactsReadFirst, DisabledContactAction, normalizeContactsProjection, type ContactsProjection } from "./contact-leaves";
import { beginConfirmationRequest, canSubmitContactConfirmation as canSubmit, finishAuthorityRefresh, INITIAL_CONTACT_CONFIRMATION_STATE, invalidateContactConfirmation, isCurrentConfirmationRequest, setExplicitConfirmation, startAuthorityRefresh, type ContactConfirmationState } from "./contact-confirmation-state";

type Notice = { kind: "loading" | "authority" | "transport" | "csrf" | "server"; text: string };
export type ContactsProjectionFetch = { status: number; projection: ContactsProjection | null };

/** GET-only boundary shared by normal and unknown-outcome refreshes. */
export async function fetchContactsProjection(fetcher: typeof fetch): Promise<ContactsProjectionFetch> {
  const response = await fetcher("/api/contacts", { headers: { accept: "application/json" }, credentials: "same-origin" });
  if (!response.ok) return { status: response.status, projection: null };
  try { return { status: response.status, projection: normalizeContactsProjection(await response.json()) }; } catch { return { status: response.status, projection: null }; }
}
export type UnknownConfirmationRecovery = { generation: number; state: ContactConfirmationState };
export function beginUnknownContactConfirmationRecovery(state: ContactConfirmationState): UnknownConfirmationRecovery {
  const refreshed = startAuthorityRefresh(invalidateContactConfirmation(state));
  return { generation: refreshed.generation, state: refreshed };
}
export async function finishUnknownContactConfirmationRecovery(fetcher: typeof fetch, recovery: UnknownConfirmationRecovery): Promise<{ generation: number; state: ContactConfirmationState; projection: ContactsProjection | null; status: number | null }> {
  try {
    const result = await fetchContactsProjection(fetcher);
    return { generation: recovery.generation, state: finishAuthorityRefresh(recovery.state, recovery.generation, result.projection !== null), projection: result.projection, status: result.status };
  } catch { return { generation: recovery.generation, state: finishAuthorityRefresh(recovery.state, recovery.generation, false), projection: null, status: null }; }
}
export function applyUnknownContactConfirmationRecovery(current: ContactConfirmationState, recovery: { generation: number; state: ContactConfirmationState }) { return current.generation === recovery.generation ? recovery.state : current; }

/** This is the sole Contacts transport owner. It never holds provider authority:
 * GET refreshes the owner projection/CSRF and POST remains reject-only. */
export function ContactsWorkspace({ initialProjection = BLOCKED_CONTACTS_PROJECTION }: { initialProjection?: ContactsProjection }) {
  const [projection, setProjection] = useState(initialProjection), [confirmation, setConfirmation] = useState(INITIAL_CONTACT_CONFIRMATION_STATE), [notice, setNotice] = useState<Notice>({ kind: "loading", text: "Loading authoritative Contacts status…" });
  const confirmationRef = useRef<ContactConfirmationState>(INITIAL_CONTACT_CONFIRMATION_STATE);
  const { authorityReady, confirmed, pending } = confirmation;
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  function commitConfirmation(next: ContactConfirmationState) { confirmationRef.current = next; setConfirmation(next); }
  function setConfirmed(value: boolean) { commitConfirmation(setExplicitConfirmation(confirmationRef.current, value)); }
  async function refresh() {
    const started = startAuthorityRefresh(confirmationRef.current); commitConfirmation(started); const generation = started.generation;
    setNotice({ kind: "loading", text: "Loading authoritative Contacts status…" });
    try {
      const result = await fetchContactsProjection(fetch);
      if (generation !== confirmationRef.current.generation) return false;
      if (!result.projection) { commitConfirmation(finishAuthorityRefresh(confirmationRef.current, generation, false)); setNotice({ kind: result.status === 404 ? "authority" : "server", text: result.status === 404 ? "Contacts are unavailable outside the private owner workspace." : "Contacts status is temporarily unavailable. Reload and try again." }); return false; }
      setProjection(result.projection); commitConfirmation(finishAuthorityRefresh(confirmationRef.current, generation, true)); setNotice({ kind: "authority", text: result.projection.capability.reason }); return true;
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
      if (!response.ok) { await recoverUnknownConfirmation("server"); return; }
      await refresh();
    } catch { if (isCurrentConfirmationRequest(confirmationRef.current, submission.generation)) await recoverUnknownConfirmation("transport"); }
  }
  async function recoverUnknownConfirmation(kind: "server" | "transport") {
    const recovery = beginUnknownContactConfirmationRecovery(confirmationRef.current); commitConfirmation(recovery.state);
    setNotice({ kind, text: "Contacts request result is unknown. Reloading authoritative status; no retry was attempted." });
    const completed = await finishUnknownContactConfirmationRecovery(fetch, recovery);
    if (confirmationRef.current.generation !== completed.generation) return;
    if (completed.projection) setProjection(completed.projection);
    commitConfirmation(applyUnknownContactConfirmationRecovery(confirmationRef.current, completed));
    setNotice(completed.projection ? { kind: "authority", text: completed.projection.capability.reason } : completed.status === 404 ? { kind: "authority", text: "Contacts are unavailable outside the private owner workspace." } : { kind: completed.status === null ? "transport" : "server", text: "Contacts status is temporarily unavailable. Reload and try again." });
  }
  return <section className="contacts-workspace" aria-labelledby="contacts-workspace"><header className="page-heading"><span className="eyebrow">CONTACTS · OWNER-ONLY</span><h1 id="contacts-workspace">Contacts</h1><p>Evidence is shown before action. This local preparation surface has no live contact data or provider access.</p></header><ContactsReadFirst projection={projection}/><fieldset className="panel"><legend>Stage 1 — grant confirmation</legend><p>The immutable server tuple and digest are unavailable until a future accepted capability gate. Confirmation creates no provider request.</p><label><input type="checkbox" checked={confirmed} disabled={!authorityReady || pending} onChange={(event) => setConfirmed(event.target.checked)}/> I understand this creates no provider request.</label><p><button type="button" disabled={!authorityReady || !confirmed || pending} onClick={() => void requestConfirmation()}>Create grant confirmation</button></p><p role="status" aria-live="polite" data-status={notice.kind}>{notice.text}</p></fieldset><fieldset className="panel"><legend>Stage 2 — granted operation</legend><DisabledContactAction explanationId="contacts-granted-operation-explanation" explanation="Unavailable: a separate accepted grant and committed reservation are required." >Run granted operation</DisabledContactAction></fieldset></section>;
}

export function canSubmitContactConfirmation(input: { authorityReady: boolean; confirmed: boolean; pending: boolean }) { return canSubmit(input); }
export async function postContactConfirmation(fetcher: typeof fetch, input: { authorityReady: boolean; confirmed: boolean; pending: boolean; idempotencyKey: string }) {
  if (!canSubmitContactConfirmation(input)) return null;
  return fetcher("/api/contacts", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json", "x-prospector-intent": "contacts-mutation" }, body: JSON.stringify({ action: "create_grant_confirmation", prospectId: "synthetic-preview-only", expectedProspectRevision: 1, idempotencyKey: input.idempotencyKey }) });
}
