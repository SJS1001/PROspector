---
phase: 04
slug: profile-readiness-and-evidence-based-prospecting
status: approved
created: 2026-07-30
---

# Phase 4 — UI Design Contract

## Scope and visual continuity

Extend the existing manual React/CSS system; do not initialize shadcn or add a component/icon library. Reuse the dark rail, paper canvas, bordered white panels, deep-green owner actions, amber proposal/needs-attention states, lime focus, Geist Sans, and Geist Mono for immutable references. Preserve the controlled-pilot banner and label later-phase contact, export, spending, and outbound controls as unavailable rather than implying readiness enables them.

The Phase 4 primary surfaces are **Profile Readiness**, **Prospect Workspace**, and **Review Queue**. Knowledge remains the source of confirmed Profile input. All views repeat a visible scope path, configuration status/ID, and current evidence authority; breadcrumb alone never carries authority.

## Color, typography, and spacing

Inherit the established Phase 2 composition: paper `#f4f6f2` is the dominant canvas (about 60%), white `#ffffff` bordered panels are secondary (about 30%), and deep green `#194b38` is the limited accent (about 10%). Reserve the accent for one current-surface primary action, active local navigation, selected scope context, and keyboard focus treatment. Source links, ordinary badges, secondary actions, and routine status controls remain neutral. Use amber for proposal/needs-attention states; reserve `#a84b3e` red text for the irreversible **Reject prospect** decision and hard-disqualifier treatment, never as the sole signal.

Inherit the Phase 2 four-size/two-weight scale: 10px labels, 12px body/monospace metadata (body line-height 1.55), 16px headings, and 28px page display; use weights 400 and 760 only. Inherit the 4px-based spacing tokens `4, 8, 16, 24, 32, 48, 64px`; no new values are introduced outside existing shell geometry.

## Information architecture

1. **Profile Readiness** opens when the selected Profile is Draft. It is a single ordered checklist, not a chat: Scope & Offer; Fit & Targets; Roles & Outcomes; Signals & Sources; Geography & Compliance; Rubric; Proof & Guardrails; Contact & Outreach Policy; Schedule & Output; Review.
2. **Prospect Workspace** is visible only after a Profile Effective Configuration is active. It contains a compact current-configuration card, run state/assignment ledger, evidence list, candidates, and immutable qualification outcomes.
3. **Review Queue** lists only currently Qualified Prospects. It provides owner Approve, Reject, and Defer decisions; it does not show enrichment, package, export, or sending controls as enabled.
4. Keep the Phase 2 Knowledge local navigation and Pilot Status. Do not add a rail destination for runners, credentials, schedules, or source administration.

The visual focal point is deliberate: the first incomplete/blocked readiness item on Profile Readiness; the active run’s evidence summary in Prospect Workspace; and the next Qualified Prospect needing an owner decision in Review Queue. Scores and runner status never become the focal point through accent color alone.

## Profile Readiness contract

### Checklist and confirmation

- Each item shows `Complete`, `Needs confirmation`, or `Blocked by prerequisite`, with a concise requirement summary and the exact confirmed knowledge/configuration reference that supplies it.
- Never infer a value from a nearby Product, Market Play, or Profile draft. An absent Offer/active Market Play/Phase 3 authority has a blocking state with a link to the authoritative predecessor record.
- The Review step presents the complete frozen candidate: profile path, Product/Play/Offer, typed policy versions, rubric, source policy, runner policy, schedule/timezone, output target, and candidate digest.
- Primary action: **Create Profile configuration candidate**. Success produces **Candidate — not active**; no runner or schedule starts.
- Separate primary action on the candidate: **Activate Profile configuration**. Its confirmation copy states: **Activation preserves history, queues one initial prospecting run, and starts this profile’s schedule. It does not authorize contact, spend, export, or outreach.**
- On success, replace controls with configuration digest, owner/audit reference, initial-run ID/status, schedule summary, and the newly available **Find Prospects** action.

### Completeness and failure states

| State | Required presentation |
|---|---|
| Missing required item | Inline `role="alert"`: **This profile is not ready. Confirm the required item before creating a configuration candidate.** |
| Stale predecessor | **The Product, Market Play, or Offer changed. Load the current authority before continuing.** Hide activation. |
| Candidate changed elsewhere | **This candidate changed in another tab. Your action was not applied.** Provide **Load current candidate**. |
| Unknown outcome | **The outcome could not be verified. Nothing will be retried automatically. Check the current profile configuration.** |
| Unauthorized/malformed | Reuse the Phase 1 neutral unavailable state. Do not reveal company, profile, run, or evidence details. |
| No readiness items | **No readiness items are available** — **Load the current Product, Market Play, Offer, and Phase 3 authorities before preparing this profile.** Provide **Load current authority**. |

## Prospect Workspace contract

### Configuration and run ledger

The header always contains the Profile path, **Active configuration**, immutable digest, schedule/timezone, current run status, and last successful watermark. A run card displays trigger (initial/manual/scheduled/material-change), slot key/local instant/offset, source window, configuration and instruction versions, provider/model, assignment ID, quotas, expiry, attempt, and terminal reason.

**Find Prospects** appears only with an active configuration. It opens an explicit confirmation of the scoped source window and quota, then queues a manual run; it never accepts a browser-supplied runner, configuration, tool, credential, or arbitrary source URL. Pending, overlap-skipped, expired, failed, rejected, and succeeded runs use text labels in addition to color. There is no Retry-with-another-provider control; a later explicit owner assignment is required.

### Evidence-first candidate detail

Candidate cards show outcome and score only after the evidence summary. The evidence table has: source title/domain, URL, application-assigned tier, publisher and underlying origin, independence group, publication/event date, retrieval time, excerpt, recency state, and lineage to run/assignment/configuration. Excerpts are escaped, bounded text; source links warn that they open externally.

Use the following visible labels:

- `Tier 1`, `Tier 2`, or `Tier 3` assigned by application rules.
- **Account Context — reconfirmation required** for material evidence older than 30 days.
- **Insufficient independent evidence** when sources do not satisfy the qualifying independence rule.
- **Runner-submitted observation — application validation pending** before a trusted assessment exists.

Never show a runner assertion as a confirmed fact, nor let a Tier 3 card display a qualifying badge on its own.

When a completed run has no qualifying candidate, show **No prospects found in this run** — **The scoped source window completed without a qualifying candidate. Review the run ledger and evidence before starting another permitted run.** Provide **Review run ledger**. When the active configuration has no evidence yet, show **No evidence submitted yet** — **Evidence appears only after a bounded runner assignment or permitted run records validated observations.** Do not imply a run is authorized or in progress.

## Qualification contract

The immutable assessment panel shows each Mining dimension’s 0/1/2 anchor, assigned score, cited evidence IDs, total, threshold, pain/timing gate, source-independence gate, missing fields, hard-disqualifier results, deterministic tie-order inputs, profile configuration digest, and final outcome.

| Outcome | Presentation | Queue behavior |
|---|---|---|
| Passed | Green **Qualified** plus full explanation | Enters Review Queue; does not imply any external effect. |
| NotQualified | Neutral **Below threshold** with breakdown | Not in active queue; re-entry condition is shown. |
| InsufficientEvidence | Amber **More evidence required** with absent fields | Not in active queue; never silently upgraded. |
| Disqualified | Red-text **Hard disqualifier** and exact sourced gate | Not in active queue; show the evidence needed to reopen. |

Score color never stands alone. Never write `AI qualified`; write **Application-calculated qualification**.

## Review Queue contract

Each card repeats Account/Target/Offer, score/outcome, configuration digest, evidence freshness, current cooldown/review status, and a direct link to the assessment. It exposes exactly:

- **Approve prospect** — requires an owner reason and records `Approved`; show **Approved prospects still require governed contact verification.**
- **Reject prospect** — requires a reason and displays the 90-day cooldown plus Material Signal exception.
- **Defer prospect** — requires a reason and a review date; it may return on that date or Material Signal.

Reject first opens an in-context confirmation: **Rejecting this prospect starts a 90-day cooldown unless a Material Signal appears. Confirm rejection.** During a mutation, retain the reviewed immutable assessment, disable competing decisions, and use action-specific copy. After success render the authoritative decision, timestamp, audit reference, and cool-down/re-entry rule. Network failures never auto-retry or reapply a review decision.

When no Qualified Prospect is current, show **No qualified prospects to review** — **Prospects appear here only after application-calculated qualification passes. Review the current run evidence or find prospects when the active configuration permits.** Provide **View prospect evidence**. Do not substitute a runner-generated recommendation or a below-threshold candidate into the queue.

## Accessibility and responsive behavior

- All scope links, decision controls, run actions, source links, and disclosures have 44px minimum targets and visible keyboard focus.
- Checklist status, source tier, readiness, outcome, and run state include text; color is supplementary.
- Tables collapse to labelled stacked evidence cards below 760px. The readiness checklist remains ordered and the Review Queue has a single-column layout.
- The active mutation result/status is announced with `aria-live="polite"`; stale/conflict and malformed-authority errors use `role="alert"`.
- Native `details/summary` may disclose full lineage and historical runs; active configuration, outcome, and blocking prerequisites remain visible without expansion.

## Out of scope

Do not expose contact enrichment, paid grants, verified contact details, CRM export, Gmail/OAuth, calling, message/package approval, or send/suppression mutation in this phase. A review approval must be clearly described as a prospect-state decision only.

## Registry Safety

No shadcn or third-party registry blocks are used. Phase 4 uses established manual React/CSS and native HTML only.

---

*Phase 3 authorities are a prerequisite to activating the described UI; absent authorities render explicit blocked states.*
