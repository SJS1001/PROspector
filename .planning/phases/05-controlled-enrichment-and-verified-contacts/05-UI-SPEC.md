# Phase 05 — UI Design Contract: Controlled Enrichment and Verified Contacts

**Status:** Verified design contract (checker loop completed 2026-07-30)
**Scope:** Owner-only review and control surface for bounded enrichment authority, contact evidence/verification/freshness, and identity resolution.

## Design Intent

Make the safety state unmistakable. The default view is evidence before action: a user should be able to tell, at a glance, whether a contact is only a suggestion, whether the prospect is eligible, what exact authority exists, and why an action is blocked. UI never implies provider enablement or authority.

## Information Architecture

Within the existing Prospect Workspace, add a **Contacts** leaf with four ordered sections:

1. **Current eligibility** — `ContactReady`, `NeedsReview`, `No eligible contact`, or `NonContactable` status; exact current blocker and the contributing profile configuration/freshness timestamp.
2. **Verified contacts** — each eligible email/phone shows class, method, source, verification time, freshness deadline, confidence, Contact/Organization association, and scoped relevance. Phone copy is **Verified business phone** only when eligible.
3. **Contact suggestions** — visually and semantically separate rows for generated, inferred, directory-only, domain-valid, MX-only, stale, and invalid data. Heading and badge always say **Contact Suggestion**; no export/package/call/send affordance appears here.
4. **Authority and identity review** — grant draft/history, exact bound provider/prospects/operation/units/cost/currency/expiry, quote, budget/reservation/settlement/reconciliation outcome, plus merge/split suggestions and impact preview.

The primary action sequence is deliberately two-step: **Create enrichment grant** then **Run granted operation**. The latter is disabled until the exact committed, unexpired, unconsumed grant and all prerequisites pass. Its disabled explanation names the first unmet predicate, e.g. “No current single-use grant for this prospect and operation.”

## States and Copy

| State | Visual treatment | Required copy / behavior |
|---|---|---|
| Eligible and fresh | restrained positive status + accessible text | “Verified — eligible for downstream review until [date].” Show class and evidence; do not claim package/export/send authorization. |
| Suggestion / domain/MX/pattern | neutral-warning badge, never positive green | “Contact Suggestion — not verified for enrichment, package approval, export, calling, or sending.” |
| Stale | warning status + freshness date | “Needs review — verification is stale. Reconfirm before downstream use.” |
| Invalid | destructive status + evidence | “Invalid contact point — retained as evidence, not eligible.” |
| Grant absent/mismatch/expired/reused/over-budget | disabled control + bounded reason | “No provider call will be made.” Never offer a fallback provider or retry shortcut. |
| Reserved / in flight | progress/status, non-dismissive | “Worst-case cost reserved. Provider outcome pending.” |
| Uncertain charge | destructive-warning status | “Charge or provider acceptance is uncertain. Reservation remains held for reconciliation; no retry is available.” |
| Identity ambiguity | review card, not inline auto-fix | “Review identity suggestion.” Show candidates, source lineage, scoped association impact, and preserved suppression notice. |

## Interaction and Safety Contract

- Grant creation requires an explicit confirmation summary of exact provider, prospect list, operation, units, maximum cost, currency, expiry, and one-time nature. It is not a modal confirmation of an actual provider call.
- Run action presents the same immutable grant digest/summary and reservation maximum. A request/result race, stale data, or unknown network outcome reloads the authoritative projection; the client does not assume the operation succeeded or retry it.
- Result rows expose sources as safe links/reference labels and bounded excerpts. Render all external data as text; never execute provider/source content.
- Identity merge/split opens a dedicated review with before/after associations, provenance count, Market Play relevance, and “suppression subjects preserved” invariant. The irreversible-looking action is worded **Confirm merge** / **Confirm split**, but history remains retained.
- No click-to-call, send, package approval, or CRM export control exists in this phase UI. If later shared shell controls render, they remain disabled with “Available in a later governed workflow.”

## Accessibility and Responsive Contract

- Use semantic headings, table/list labels, native buttons, and status text in addition to color. Announce reservation/blocked/reconciliation changes through an appropriate live region without repeating sensitive values.
- Every disabled action has adjacent explanatory text (not title-only); keyboard focus can reach the explanation.
- On narrow screens, contact rows become labelled key/value cards; preserve class, method, source, time, freshness, and eligibility before optional metadata. Grant summary and confirm action remain visible without horizontal clipping.
- Preserve the existing Phase 1/2 visual language, spacing, typography, focus treatment, and pure-leaf/data-owner split. Do not add a component library or third-party registry block.

## Checker Loop

| Dimension | Verdict | Resolution |
|---|---|---|
| Scope / safety | PASS | Separates review/grant from provider execution and excludes later effects. |
| Information hierarchy | PASS | Eligibility → verified evidence → suggestions → authority/identity mirrors decision order. |
| State coverage | PASS | Covers missing/mismatched/reused/expired authority, stale/invalid contacts, reservation, uncertainty, and ambiguity. |
| Accessibility | PASS | Textual statuses, semantic controls, focusable explanations, responsive order, live updates. |
| Consistency | PASS | Reuses established shell and transport/pure-leaf patterns; no library addition. |
| Content clarity | PASS | Copy explicitly states ineligibility and zero-call behavior; never overclaims verification or legal approval. |

**Checker result:** APPROVED (6/6). No revision required.
