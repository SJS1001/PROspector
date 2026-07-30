# Phase 06 — UI Design Contract: Governed Outreach and Suppression

**Status:** Verified design contract (checker loop completed 2026-07-30)
**Scope:** Owner-only package/message review, Gmail readiness and draft delivery queue, manual verified-phone workflow, and Company-wide suppression controls.

## Design Intent

Make the distinction between preparation, approval, and an external effect impossible to miss. The page should lead with why outreach is currently allowed or blocked, then show the exact immutable thing that could be approved. A green package is never a green message, a drafted email is never sent, and a phone link is never a dialer or proof of a call.

## Information Architecture

Within the existing **Prospect Workspace**, add an ordered **Outreach** leaf. It must render these sections in order:

1. **Current outreach eligibility** — authoritative Package/Message/Call state and the first blocking predicate: Prospect/Profile availability, contact verification/freshness, suppression, package/message approval, sender/connection, drift, or compliance acknowledgement. Show configuration and contact-point freshness timestamps.
2. **Outreach Package review** — immutable evidence/source references, recommended angle, claim guardrails, selected role/contact points, derived call script, all draft Message Versions, exact SHA-256 digest, dependency/expiry/revocation status, and package-approval audit snapshot. Primary control: **Approve package for CRM eligibility**; its adjacent copy says “This does not approve or send email.”
3. **Gmail drafts and approvals** — each Message Version is a separate card: From/Reply-To, normalized recipients, subject/body preview, link/attachment/thread/schedule summary, message digest, compliance acknowledgement/basis, approval state/expiry, and outbox state. The action is **Approve this message for queued Gmail delivery**; it is absent/disabled until all predicates pass. A queued/delivered status never implies package reusability for another message.
4. **Manual verified phone** — only a fresh eligible business phone can show **Open verified business phone**. It presents the package-derived script and a post-call form for allowed outcome/reasoned note. The `tel:` action is labelled “Opens your device’s calling app; PROspector does not place or record calls.”
5. **Suppression and stop history** — current Company-wide normalized scope(s), reason/source/effective time, aliases affected, unsubscribe/opt-out/reply/bounce/owner event, matching pending-work cancellation state, and append-only audit. Add suppression is a separate explicit owner command, not a switch on a contact card.
6. **Delivery and reconciliation history** — concise states for Pending, Leased, Dispatching, Sent, Cancelled, Failed before dispatch, Delivery unknown, reply, and bounce. `Delivery unknown` explains that no automatic resend will occur and offers owner reconciliation, not a resend button.

## States and Copy

| State | Visual treatment | Required copy / behavior |
|---|---|---|
| No Package / incomplete package | neutral blocked panel | “Create a complete Outreach Package from current evidence before review.” No message/send control. |
| Package ready, unapproved | review card with digest/status text | “Package approval permits CRM eligibility only. Each email still needs its own approval.” |
| Package invalid/expired/drifted | warning/destructive panel with dependency | “Package approval is no longer current because [reason]. Review a new immutable version.” |
| Draft message, not approved | neutral card and approval summary | “Draft only — no Gmail delivery is authorized.” |
| Message changed/rescheduled | warning plus old/new digest | “This message changed. Previous approval cannot be used.” |
| Missing Gmail authorization / degraded connection | disabled action + bounded reason | “Gmail delivery is unavailable. No email will be sent.” Never expose credentials or a provider fallback. |
| Queued / leased / dispatching | status timeline, non-dismissive | “Queued for controlled delivery” / “Dispatch lease held; current safety checks are running.” No “sent” promise. |
| Delivery unknown | destructive-warning timeline | “Gmail acceptance could not be confirmed. PROspector will not resend automatically.” |
| Fresh verified business phone | restrained positive text + source/time | “Verified business phone — eligible for manual calling while current.” |
| Stale/suggestion/suppressed phone | warning/destructive, no active `tel:` action | “Phone is not eligible for calling: [reason].” |
| `do_not_call` / unsubscribe / opt-out | destructive status and event time | “Suppression recorded before this outcome was completed. Matching outreach is blocked.” |
| Missing/inconsistent basis, acknowledgement, sender, or unsubscribe | warning and exact missing field | “Compliance guidance is advisory; required send safeguards are incomplete. No email will be sent.” |

## Interaction and Safety Contract

- Every mutation uses the existing owner-only CSRF/same-origin transport and receives an authoritative reloaded projection. Pending controls retain the reviewed digest and disable competing actions; a lost response is resolved by reload, never by client retrying a send/call outcome.
- Package and message approval are two visually separate confirmations. Their confirmation surfaces show the exact digest, immutable field summary, expiry, configuration/dependency/contact freshness, and scope of authority. The message confirmation explicitly says it queues controlled delivery; it does not promise delivery.
- Read-only draft previews render bodies, reply excerpts, evidence, and provider-derived text as escaped data. Links show normalized destinations; attachments expose name/type/size/digest without browser-executed preview.
- The call script is visibly labelled **Derived from approved Outreach Package [digest]**. It is not editable on the call form. Notes are bounded and described as operator-entered; only the six allowed outcomes are selectable. Selecting `do_not_call` requires a reason confirmation whose copy says suppression is written before the outcome is recorded.
- Suppression creation requires a summary of scope (exact email/domain/E.164 phone/Contact/Organization/all Company), channel, reason, source event, and affected aliases/current work. It has no “temporarily ignore” or per-message exception control.
- Unsubscribe/reply/bounce/paused/drifted/revoked states remove or truly disable relevant follow-up/message/call actions with adjacent explanations. A stale tab cannot preserve active controls after the refreshed projection.
- The UI shows compliance guidance as advisory and the operator acknowledgement as a record; it never displays “legally approved,” jurisdiction verdicts, or a consent inference.

## Accessibility and Responsive Contract

- Use semantic page/section headings, labelled lists/tables, native buttons, form labels, and status text in addition to color. Announce outbox/reconciliation/suppression changes through a concise live region that omits sensitive content.
- Every disabled/absent action has an adjacent visible explanation; keyboard users can reach the explanatory content. Destructive suppression and `do_not_call` confirmations receive focus and preserve a keyboard-operable cancel path.
- On narrow screens, package/message cards become labelled key/value stacks. Preserve status, exact digest/version, recipient/sender summary, contact freshness/suppression, and blocker explanation before body/evidence detail. Never put the explanation behind horizontal scroll or hover-only affordances.
- Preserve the established Phase 1/2 typography, spacing, focus treatment, restrained status palette, server transport owner, and pure-leaf/data-owner split. Do not introduce a component library, rich-text editor, third-party email client, or dialer UI.

## Checker Loop

| Dimension | Verdict | Resolution |
|---|---|---|
| Scope / safety | PASS | Separates package/message authority, confines phone to manual verified click-to-call, and states no provider enablement. |
| Information hierarchy | PASS | Current blockers precede package, message, call, suppression, and reconciliation decisions. |
| State coverage | PASS | Covers stale/invalid approval, missing connection/safeguards, lease, unknown delivery, every phone state, and stop events. |
| Accessibility | PASS | Requires native controls, textual status, focusable explanations, live updates, and responsive safety ordering. |
| Consistency | PASS | Reuses existing owner-only transport/pure-leaf/manual CSS contract with no new UI/provider library. |
| Content clarity | PASS | Copy distinguishes draft, queued delivery, sent/unknown, advisory compliance, and manual call without legal or effect overclaim. |

**Checker result:** APPROVED (6/6). No revision required.
