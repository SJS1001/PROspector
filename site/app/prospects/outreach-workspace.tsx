"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  BLOCKED_OUTREACH_PROJECTION, callKey, draftKey, EMPTY_CALL_FORM, EMPTY_SUPPRESSION_FORM, normalizeOutreachProjection, OutreachSections, reasonText,
  type CallForm, type Confirming, type OutreachCallCard, type OutreachDraftCandidate, type OutreachInteraction, type OutreachMessageCard, type OutreachPackageCard,
  type OutreachProjection, type SuppressionForm,
} from "./outreach-leaves";

/**
 * Sole Outreach transport owner (06-08, local). Commands carry projected
 * locators and the owner's reviewed digests only; the server derives sender,
 * recipients, eligibility and authority. Nothing here sends, dials or retries:
 * an unknown outcome keeps its key for the owner's own retry, and an expired
 * CSRF token stops with a reload prompt instead of refreshing and resubmitting.
 */

export const OUTREACH_API = "/api/outreach";
export const OUTREACH_INTENT_HEADER = "outreach-mutation";

export type OutreachOutcome =
  | Readonly<{ kind: "applied"; projection: OutreachProjection }>
  | Readonly<{ kind: "refused"; reasonCodes: readonly string[]; projection: OutreachProjection | null }>
  | Readonly<{ kind: "invalid"; error: string }>
  | Readonly<{ kind: "session_expired" }>
  | Readonly<{ kind: "unknown" }>
  | Readonly<{ kind: "unauthorized" }>;

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

function intentName(body: Readonly<Record<string, unknown>>) {
  return JSON.stringify(Object.keys(body).sort().map((key) => [key, body[key]]));
}

async function readJson(response: Response): Promise<Record<string, unknown> | null> {
  try {
    const value = await response.json() as unknown;
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

/**
 * One POST per call. The idempotency key is per intent: it is reused only after
 * an unknown outcome (so the owner's own retry is a replay) and dropped after
 * any definitive answer. `queue_message` carries no key because the outbox is
 * idempotent by message approval.
 */
export async function postOutreachMutation(fetcher: Fetcher, body: Readonly<Record<string, unknown>>, keys: Map<string, string>): Promise<OutreachOutcome> {
  const keyed = body.action !== "queue_message";
  const name = intentName(body);
  let payload: Record<string, unknown> = { ...body };
  if (keyed) {
    const key = keys.get(name) ?? crypto.randomUUID();
    keys.set(name, key);
    payload = { ...body, idempotencyKey: key };
  }
  const settle = () => { if (keyed) keys.delete(name); };
  let response: Response;
  try {
    response = await fetcher(OUTREACH_API, {
      method: "POST", credentials: "same-origin",
      headers: { "content-type": "application/json", "x-prospector-intent": OUTREACH_INTENT_HEADER },
      body: JSON.stringify(payload),
    });
  } catch {
    return Object.freeze({ kind: "unknown" });
  }
  if (response.status >= 500) return Object.freeze({ kind: "unknown" });
  const json = await readJson(response);
  if (response.status === 404) { settle(); return Object.freeze({ kind: "unauthorized" }); }
  if (response.status === 403 && json?.error === "invalid_csrf_token") { settle(); return Object.freeze({ kind: "session_expired" }); }
  if (response.status === 200 || response.status === 409) {
    const command = json && typeof json.command === "object" && json.command ? json.command as Record<string, unknown> : null;
    const projection = normalizeOutreachProjection(json?.projection);
    if (!command) return Object.freeze({ kind: "unknown" });
    if (response.status === 409 || command.status === "refused") {
      settle();
      const reasonCodes = Array.isArray(command.reasonCodes) ? command.reasonCodes.filter((code): code is string => typeof code === "string").slice(0, 16) : [];
      return Object.freeze({ kind: "refused", reasonCodes: Object.freeze(reasonCodes), projection });
    }
    if (!projection) return Object.freeze({ kind: "unknown" });
    settle();
    return Object.freeze({ kind: "applied", projection });
  }
  settle();
  return Object.freeze({ kind: "invalid", error: typeof json?.error === "string" ? json.error.slice(0, 64) : "invalid_request" });
}

export async function fetchOutreachProjection(fetcher: Fetcher): Promise<Readonly<{ status: number; projection: OutreachProjection | null }>> {
  const response = await fetcher(OUTREACH_API, { headers: { accept: "application/json" }, credentials: "same-origin" });
  if (!response.ok) return { status: response.status, projection: null };
  return { status: response.status, projection: normalizeOutreachProjection(await readJson(response)) };
}

type Notice = Readonly<{ kind: "loading" | "ready" | "applied" | "refused" | "unknown" | "csrf" | "error"; text: string }>;

const APPLIED_TEXT: Readonly<Record<string, string>> = Object.freeze({
  approve_package: "Package approval recorded for CRM eligibility only. No email was approved or sent.",
  approve_message: "Message approval recorded for this exact message. Nothing was queued or sent.",
  queue_message: "Queued for controlled delivery. No email has been sent by this action.",
  record_suppression: "Suppression recorded. Matching queued work was cancelled first.",
  record_call_outcome: "Call outcome recorded. It authorizes no follow-up.",
  draft_package: "Draft package and email draft created from current evidence. Nothing was approved or sent.",
});

export function OutreachWorkspace({ onAuthUnavailable }: { onAuthUnavailable?: () => void }) {
  const [projection, setProjection] = useState<OutreachProjection>(BLOCKED_OUTREACH_PROJECTION);
  const [notice, setNotice] = useState<Notice>({ kind: "loading", text: "Loading current outreach status…" });
  const [pending, setPending] = useState(true);
  const [reviewed, setReviewed] = useState<Record<string, boolean>>({});
  const [callForms, setCallForms] = useState<Record<string, CallForm>>({});
  const [suppressionForm, setSuppressionForm] = useState<SuppressionForm>(EMPTY_SUPPRESSION_FORM);
  const [confirming, setConfirming] = useState<Confirming>(null);
  const [draftForms, setDraftForms] = useState<Record<string, string>>({});
  const keys = useRef(new Map<string, string>());
  const busy = useRef(false);

  // Callers are already pending (initial state, or inside submit), so no state is set before the first await.
  const load = useCallback(async (after?: Notice) => {
    try {
      const result = await fetchOutreachProjection(fetch);
      if (result.status === 404) { onAuthUnavailable?.(); return; }
      if (!result.projection) { setProjection(BLOCKED_OUTREACH_PROJECTION); setNotice({ kind: "error", text: "Outreach status could not be loaded. Everything stays blocked. Reload to try again." }); return; }
      setProjection(result.projection);
      setNotice(after ?? { kind: "ready", text: "Outreach status loaded. No outside service was contacted (0 provider calls)." });
    } catch {
      setProjection(BLOCKED_OUTREACH_PROJECTION);
      setNotice({ kind: "error", text: "Outreach status could not be loaded. Everything stays blocked. Reload to try again." });
    } finally {
      setPending(false);
    }
  }, [onAuthUnavailable]);

  useEffect(() => { void Promise.resolve().then(() => load()); }, [load]);

  const submit = useCallback(async (body: Record<string, unknown>) => {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setNotice({ kind: "loading", text: "Saving…" });
    try {
      const outcome = await postOutreachMutation(fetch, body, keys.current);
      const action = String(body.action);
      if (outcome.kind === "unauthorized") { onAuthUnavailable?.(); return; }
      if (outcome.kind === "session_expired") {
        // Owner rule: never resubmit after an expired token. Ask for a reload.
        setNotice({ kind: "csrf", text: "Your session check expired, so nothing was saved. Reload the page, review again, then retry." });
        return;
      }
      if (outcome.kind === "unknown") {
        // Read the authoritative state; the key is kept so a retry of the same intent replays instead of duplicating.
        await load({ kind: "unknown", text: "PROspector could not confirm whether this was saved. The status below was reloaded; check it before you retry. A retry of the same action will not duplicate it." });
        return;
      }
      if (outcome.kind === "invalid") { setNotice({ kind: "error", text: `${reasonText(outcome.error === "invalid_command" ? "invalid_command" : "invalid_request")} Nothing changed.` }); return; }
      setConfirming(null);
      if (outcome.kind === "refused") {
        if (outcome.projection) setProjection(outcome.projection);
        setNotice({ kind: "refused", text: `Refused. ${outcome.reasonCodes.map(reasonText).join(" ") || "Current checks did not pass."} Nothing was sent.` });
        return;
      }
      setProjection(outcome.projection);
      setReviewed({});
      if (action === "record_call_outcome") setCallForms({});
      if (action === "record_suppression") setSuppressionForm(EMPTY_SUPPRESSION_FORM);
      if (action === "draft_package") setDraftForms({});
      setNotice({ kind: "applied", text: APPLIED_TEXT[action] ?? "Saved." });
    } finally {
      busy.current = false;
      setPending(false);
    }
  }, [load, onAuthUnavailable]);

  const interaction: OutreachInteraction = {
    pending, reviewed, callForms, suppressionForm, confirming, draftForms,
    onDraftChange: (key, value) => setDraftForms((current) => ({ ...current, [key]: value })),
    onDraft: (candidate: OutreachDraftCandidate) => {
      // Locators and the owner's confirmation only; the server derives evidence, content and sender.
      const confirmation = (draftForms[draftKey(candidate)] ?? "").trim();
      void submit({
        action: "draft_package", prospectId: candidate.prospectId, contactId: candidate.contactId,
        ...(candidate.recipientConfirmationRequired && confirmation ? { confirmedRecipientEmail: confirmation } : {}),
      });
    },
    onReview: (key, value) => setReviewed((current) => ({ ...current, [key]: value })),
    onApprovePackage: (card: OutreachPackageCard) => void submit({ action: "approve_package", packageVersionId: card.packageVersionId, reviewedDigest: card.artifactDigest }),
    onApproveMessage: (card: OutreachMessageCard) => {
      if (!card.recipientAuthority) return;
      void submit({ action: "approve_message", messageVersionId: card.messageVersionId, reviewedDigest: card.artifactDigest, packageApprovalId: card.recipientAuthority.packageApprovalId, acknowledgementDigest: card.recipientAuthority.acknowledgementDigest });
    },
    onQueue: (card: OutreachMessageCard) => { if (card.approval) void submit({ action: "queue_message", messageApprovalId: card.approval.id }); },
    onCallChange: (key, patch) => setCallForms((current) => ({ ...current, [key]: { ...(current[key] ?? EMPTY_CALL_FORM), ...patch } })),
    onRecordCall: (card: OutreachCallCard) => {
      const form = callForms[callKey(card)] ?? EMPTY_CALL_FORM;
      const number = form.number.trim();
      void submit({
        action: "record_call_outcome", packageApprovalId: card.packageApprovalId, phoneObservationId: card.phoneObservationId,
        expectedDecisionDigest: card.decision.decisionDigest, outcome: form.outcome, notes: form.notes.trim(),
        ...(form.outcome === "do_not_call" && number ? { confirmedPhoneE164: number } : {}),
      });
    },
    onSuppressionChange: (patch) => setSuppressionForm((current) => ({ ...current, ...patch })),
    onConfirm: (next) => setConfirming(next),
    onConfirmSuppression: () => {
      const form = suppressionForm;
      void submit({
        action: "record_suppression", subjectKind: form.subjectKind, channel: form.channel, reason: form.reason, confirmed: true,
        ...(form.subjectKind === "company" ? {} : { value: form.value.trim() }),
      });
    },
  };

  return <div className="outreach-workspace">
    <header className="page-heading">
      <p className="eyebrow">OUTREACH · OWNER-ONLY</p>
      <h1>Outreach</h1>
      <p>Review what would be sent, keep the do not contact list, and record the calls you make yourself. PROspector does not send email or place calls from this screen, and no outside service is contacted (0 provider calls).</p>
    </header>
    <p role="status" aria-live="polite" className={`outreach-notice outreach-notice-${notice.kind}`}>{notice.text}</p>
    {notice.kind === "csrf" && <p><button type="button" onClick={() => window.location.reload()}>Reload page</button></p>}
    <OutreachSections projection={projection} interaction={interaction} />
  </div>;
}
