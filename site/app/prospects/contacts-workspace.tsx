import React, { useEffect, useState } from "react";
import { ContactsReadFirst, DisabledContactAction, type ContactsProjection } from "./contact-leaves";

const blocked: ContactsProjection = { capability: { available: false, status: "blocked", reason: "Contacts are unavailable until the separate capability gate is proven." }, eligibility: [], verifiedContacts: [], suggestions: [], needsReview: [], identity: [], authority: { stage: "reject_only", grantCreation: "blocked", operation: "blocked", providerCall: false } };
type Notice = { kind: "loading" | "authority" | "transport" | "csrf" | "server"; text: string };

/** This is the sole Contacts transport owner. It never holds provider authority:
 * GET refreshes the owner projection/CSRF and POST remains reject-only. */
export function ContactsWorkspace({ initialProjection = blocked }: { initialProjection?: ContactsProjection }) {
  const [projection, setProjection] = useState(initialProjection), [confirmed, setConfirmed] = useState(false), [pending, setPending] = useState(false), [authorityReady, setAuthorityReady] = useState(false), [notice, setNotice] = useState<Notice>({ kind: "loading", text: "Loading authoritative Contacts status…" });
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  async function refresh() {
    setAuthorityReady(false);
    setNotice({ kind: "loading", text: "Loading authoritative Contacts status…" });
    try {
      const response = await fetch("/api/contacts", { headers: { accept: "application/json" }, credentials: "same-origin" });
      if (!response.ok) { setAuthorityReady(false); setNotice({ kind: response.status === 404 ? "authority" : "server", text: response.status === 404 ? "Contacts are unavailable outside the private owner workspace." : "Contacts status is temporarily unavailable. Reload and try again." }); return false; }
      const body = await response.json(); setProjection(body); setAuthorityReady(true); setNotice({ kind: "authority", text: body.capability?.reason ?? "Contacts capability remains blocked. No provider call will be made." }); return true;
    } catch { setAuthorityReady(false); setNotice({ kind: "transport", text: "Contacts status could not be loaded. Check your connection and reload; no provider call was made." }); return false; }
  }
  useEffect(() => { void Promise.resolve().then(refresh); }, []);
  async function requestConfirmation() {
    if (!canSubmitContactConfirmation({ authorityReady, confirmed, pending })) return;
    setPending(true);
    try {
      const response = await postContactConfirmation(fetch, { authorityReady, confirmed, pending, idempotencyKey });
      if (!response) return;
      if (response.status === 409) { setNotice({ kind: "authority", text: "Contacts capability is blocked. No provider call will be made; the authoritative status was refreshed." }); await refresh(); return; }
      if (response.status === 403) { setNotice({ kind: "csrf", text: "Request protection expired. Contacts status was refreshed; confirm again before retrying." }); await refresh(); return; }
      if (!response.ok) { setNotice({ kind: "server", text: "Contacts request was unavailable. No provider call was made." }); return; }
      await refresh();
    } catch { setNotice({ kind: "transport", text: "Contacts request could not be sent. No provider call was made." }); }
    finally { setPending(false); }
  }
  return <section className="contacts-workspace" aria-labelledby="contacts-workspace"><header className="page-heading"><span className="eyebrow">CONTACTS · OWNER-ONLY</span><h1 id="contacts-workspace">Contacts</h1><p>Evidence is shown before action. This local preparation surface has no live contact data or provider access.</p></header><ContactsReadFirst projection={projection}/><fieldset className="panel"><legend>Stage 1 — grant confirmation</legend><p>The immutable server tuple and digest are unavailable until a future accepted capability gate. Confirmation creates no provider request.</p><label><input type="checkbox" checked={confirmed} disabled={!authorityReady || pending} onChange={(event) => setConfirmed(event.target.checked)}/> I understand this creates no provider request.</label><p><button type="button" disabled={!authorityReady || !confirmed || pending} onClick={() => void requestConfirmation()}>Create grant confirmation</button></p><p role="status" aria-live="polite" data-status={notice.kind}>{notice.text}</p></fieldset><fieldset className="panel"><legend>Stage 2 — granted operation</legend><DisabledContactAction explanationId="contacts-granted-operation-explanation" explanation="Unavailable: a separate accepted grant and committed reservation are required." >Run granted operation</DisabledContactAction></fieldset></section>;
}

export function canSubmitContactConfirmation(input: { authorityReady: boolean; confirmed: boolean; pending: boolean }) { return input.authorityReady && input.confirmed && !input.pending; }
export async function postContactConfirmation(fetcher: typeof fetch, input: { authorityReady: boolean; confirmed: boolean; pending: boolean; idempotencyKey: string }) {
  if (!canSubmitContactConfirmation(input)) return null;
  return fetcher("/api/contacts", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json", "x-prospector-intent": "contacts-mutation" }, body: JSON.stringify({ action: "create_grant_confirmation", prospectId: "synthetic-preview-only", expectedProspectRevision: 1, idempotencyKey: input.idempotencyKey }) });
}
