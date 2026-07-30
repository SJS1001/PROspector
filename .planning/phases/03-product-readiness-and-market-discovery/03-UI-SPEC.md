---
phase: 3
slug: product-readiness-and-market-discovery
status: draft
shadcn_initialized: false
preset: none
created: 2026-07-30
---

# Phase 3 — UI Design Contract

> Visual and interaction contract for Product readiness and Product-level Market Discovery. This contract extends the accepted Phase 1/2 manual UI language; it does not authorize a later operational surface.

---

## Scope and Sources

This phase lets the owner determine whether a **Product** has complete, confirmed policy, activate a replayable immutable **Product Discovery Configuration**, and review bounded **Market Play Proposals**. It must make the difference between a market hypothesis, a Draft Market Play, a Customer Profile, and a prospecting capability unmistakable.

Authoritative inputs used:

- `REQUIREMENTS.md` and `ROADMAP.md`: readiness must require every listed Product policy item; each discovery trigger shows no more than three evidence-backed proposals; Explore, Defer, and Dismiss must not activate prospecting.
- `docs/DIRECTION.md`, `docs/IMPLEMENTATION-SPEC.md`, and accepted ADR-0001 through ADR-0005: Product scope, immutable configuration/run provenance, owner-only authority, untrusted runners, explicit knowledge confirmation, and the owner-only private-pilot boundary.
- `02-CONTEXT.md` and `02-UI-SPEC.md`: the exact commercial hierarchy, Product-owned knowledge, Proposed versus Confirmed Knowledge, immutable replacement authority, scope display, manual CSS system, and Phase 2 state/accessibility patterns.
- `site/app/globals.css` and `site/app/prospector-app.tsx`: current tokens, shell, responsive behavior, focus treatment, panel grammar, and native semantic controls.

Out of scope:

- Customer Profile readiness, profile schedules, profile prospecting, Accounts, Targets, Signals, Candidates, Prospects, qualification, review queue, enrichment, spend, contacts, exports, calling, Gmail, or outreach.
- Creating a Customer Profile, Offer, Account, or Prospect from a Market Play Proposal.
- Treating a suggested audience, buyer, customer type, or example inside a proposal as an accepted Customer Profile or confirmed commercial knowledge.
- Auto-activation, auto-retry with new authority, silent runner/provider failover, or a Market Discovery result that itself changes Product/Market Play lifecycle.
- shadcn initialization, a component-library migration, and all third-party registry blocks.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | Existing manual brownfield CSS using the current Tailwind CSS import |
| Preset | Not applicable |
| Component library | None; React with semantic native HTML |
| Icon library | None; text labels and simple CSS/native glyphs only |
| Font | Geist Sans for interface text; Geist Mono for configuration, run, proposal, digest, source, and audit identifiers |
| Visual language | Paper canvas, white bordered panels, deep-green owner authority actions, restrained lime focus, green completed/ready states, amber proposed/attention states, red only for errors/conflicts |
| Primary focal point | The first full-width Readiness or Discovery summary panel for the selected Product. Within it, the Product name, authoritative lifecycle/readiness or run state, and the single currently eligible primary CTA form the visual focal point; never use proposal cards, status badges, or secondary lifecycle actions to compete with it. |

Do not initialize shadcn. Reuse `.app-shell`, `.rail`, `.canvas`, `.topbar`, `.fixture-banner`, `.content`, `.page-heading`, `.panel`, `.primary`, `.outline`, `.loading-state`, `.error-state`, `.status-badge`, and Phase 2’s hierarchy/scope/provenance patterns. Add purpose-named readiness and discovery classes only; do not create a parallel visual grammar.

---

## Information Architecture

### Entry and navigation

1. Add **Market Discovery** as the third primary destination in the established rail, after **Knowledge** and before later unavailable destinations. It is a Product-level surface, never a Profile or prospecting surface.
2. The destination opens to the last owner-selected Product when one is available; otherwise it opens to an explicit Product picker. Never infer Product scope from the most recently viewed Market Play or Profile.
3. Keep **Knowledge** and **Pilot Status** accessible. Product readiness uses Confirmed Knowledge supplied by Phase 2; the owner goes to Knowledge to repair missing or disputed policy.
4. Keep the controlled-pilot banner on every Phase 3 view. Use: **Product discovery can create bounded Market Play proposals. Prospecting, contacts, schedules for Customer Profiles, spend, exports, and outbound effects remain unavailable until their separate gates are met.**
5. Do not show **Find prospects**, **Create prospect**, **Add contact**, **Run profile**, or any equivalent control. If an older fixture control remains rendered, it is native `disabled` with adjacent text **Available after a Customer Profile is Ready in a later governed phase.**

### Product context

Below the page heading, show an explicit breadcrumb path:

`Digitalrain / ONE / Market Discovery`

- Each ancestor is a real link/button with a minimum 44px target. `ONE` is the selected Product; Market Discovery is `aria-current="page"`.
- Show Product lifecycle (**Draft**, **Ready**, **Paused**, or **Archived**) with text plus a labelled status badge.
- Never use an existing Market Play, its Customer Profiles, or its Offers to satisfy readiness, prefill a configuration, or imply that discovery is scoped to that Play.
- Every readiness item, configuration, run, proposal, and decision repeats **Product: {name}** and its immutable/revision reference in visible text. Breadcrumbs alone are not authority evidence.

### Local navigation and fixed page order

Within Market Discovery, use a labelled local navigation row in this exact order: **Readiness**, **Discovery**, **Proposal history**. Use links or buttons with `aria-current`; do not create keyboard-incomplete ARIA tabs.

The Readiness view appears in this fixed order:

1. Product heading, lifecycle, and authority summary.
2. Readiness checklist with every required policy category.
3. Readiness consequence panel.
4. Current or latest immutable Product Discovery Configuration, if one exists.
5. Initial-run and monthly-schedule status, if Product is Ready.

The Discovery view appears in this fixed order:

1. Selected Product and active configuration/run summary.
2. Primary discovery control or its unavailable reason.
3. Latest run state and provenance.
4. Current surfaced Market Play Proposals (maximum three for the selected trigger).
5. Boundary note explaining that proposals cannot activate prospecting.

Proposal history lists active/reopened proposals before deferred/dismissed history. Historical versions and older evidence are behind native disclosures, never omitted.

---

## Product Readiness Contract

### Readiness summary and checklist

Use a full-width `.panel` summary. It contains Product lifecycle badge, one-sentence outcome, a count formatted **{complete} of 9 confirmed**, and a plain-language next step. Do not render a percentage, progress ring, or optimistic completion state.

Render these nine required checklist rows in this stable order:

1. **Capabilities**
2. **Limitations**
3. **Delivery**
4. **Proof**
5. **Ownership**
6. **Claim guardrails**
7. **Source policy**
8. **Market-discovery policy**
9. **Default runner policy**

Each row contains, in order: a full text state (**Confirmed**, **Missing**, **Proposed**, **Stale**, or **Needs review**), a concise condition, immutable Confirmed Knowledge Version(s) when satisfied, and a secondary link **Review in Knowledge**. A row is satisfied only by the server’s current confirmed-version/revision projection. A visible value, a Draft value, runner output, a proposal, fixture content, or client cache never counts as confirmed.

Use a green **Confirmed** treatment only for a complete current server projection. Use amber for Missing, Proposed, Stale, or Needs review. Every treatment has text; color and checkmarks are supplementary only.

### Readiness action and outcome

- While any row is unmet, do not render an enabled readiness action. Show a disabled native button **Make Product Ready** with the adjacent sentence **Complete every confirmed Product policy item before readiness can be activated.**
- When all nine rows are confirmed and the Product is Draft, show the single primary CTA **Make Product Ready**. Immediately above it show: **This creates an immutable Product Discovery Configuration, queues one initial Market Discovery Run, and schedules monthly discovery. It does not create or activate a Market Play, Customer Profile, Offer, prospect, contact, or outbound effect.**
- This action is owner-only. Before submit, show exact Product name, expected Product revision, the nine referenced version IDs, and the resulting configuration scope. The server remains authoritative; this review does not make a client snapshot authoritative.
- During submission, preserve the full checklist and disable competing readiness/mutation controls. Label progress **Creating Product Discovery Configuration…**.
- On success, replace the action with **Product Ready** plus immutable configuration ID/digest, owner/audit reference, initial run ID, and monthly schedule summary. Move focus to the **Product Ready** result heading.
- A duplicate/reloaded logical request renders the same authoritative result, never a second configuration, initial run, or schedule.
- If the expected revision or any prerequisite version changed, show the stale state in this contract; never let the owner confirm against an updated hidden checklist.

### Immutable configuration card

For an active or historical Product Discovery Configuration, render a read-only card containing:

1. **Product Discovery Configuration** status: **Active**, **Historical**, or **Replacement candidate — not active**.
2. Product path, immutable configuration ID, canonical digest, created/activated time in `America/Toronto`, and owner/audit reference.
3. Exact versioned inputs grouped as Company knowledge; Product capability/limitation/delivery/proof/ownership/claim guardrail knowledge; source/discovery policy; compliance posture; and runner/instruction/output-schema/tool-policy versions.
4. The exact scope statement: **This Product configuration is valid with zero Market Plays, Customer Profiles, or Offers.**
5. Run and schedule references governed by this configuration.

No field is editable in the card. A Product knowledge change remains the Phase 2 Proposed Knowledge/replacement workflow; it must not mutate this card or silently rerun discovery.

### Lifecycle boundary

Display lifecycle transition controls only when their semantic state permits them. **Pause Product** and **Archive Product** are consequential actions and require a native confirmation dialog/explicit confirmation panel that names the Product and explains the effect before committing. Use exact copy:

- Pause: **Pause ONE? New Market Discovery Runs will not start. Work not yet submitted will be cancelled. Existing results remain historical proposals.**
- Archive: **Archive ONE? New Market Discovery Runs will not start. Restoring this Product returns it to Draft and requires fresh readiness activation. Historical configurations, runs, and proposals are preserved.**

Use destructive red only for **Archive Product**. Pausing is amber/attention, not destructive red. A resume action never implies that independent downstream entities resume or that a changed dependency is reviewed; this phase must state any remaining reason codes.

---

## Discovery Run Contract

### Run origin and status

Every run card displays its exact trigger: **Initial**, **Manual**, **Monthly**, or **Material Product change**; immutable configuration ID/digest; scheduled time and actual start in `America/Toronto`; source window; provider/model; instruction version; attempt; and opaque run/audit IDs in Geist Mono.

Use these labels exactly: **Queued**, **Assigned**, **Running**, **Submitted**, **Validating**, **Succeeded**, **Rejected**, **Failed**, **Cancelled**, **Expired**, **Skipped overlap**, and **Needs attention**. Do not label an assigned runner, a submitted result, or an incomplete response as a successful discovery result.

`Succeeded` means validation completed under the displayed configuration. It does not mean a Market Play is active, a Profile is ready, or prospecting may start.

### Manual discovery control

- Before Ready, use native disabled **Discover markets** with **Make this Product Ready before running Market Discovery.**
- When Ready and effectively available, show the one primary action **Discover markets**. The primary action’s only effect is to request one manual Product-level discovery run under the shown immutable configuration.
- Before confirmation/submission, state **Manual discovery produces at most three Market Play proposals. It cannot create a Customer Profile or start prospecting.**
- While request is pending, label **Queuing Market Discovery…** and disable duplicate controls. A retry/lost response checks the authoritative run rather than creating another run.
- A paused/archived Product renders the control disabled with its exact reason; do not present manual discovery as a bypass.
- A scheduled overlap is not failure: render **Skipped overlap** with the existing active run reference. Manual runs may queue separately only when the server accepts them.

### Runner and evidence boundary

Runner-supplied material is presented as untrusted submitted material until application validation. The UI must not use language such as “runner confirmed,” “AI-approved,” or “validated market.” Source excerpts are text only; never raw HTML. Source links announce that they open in a new tab.

The run detail’s evidence summary shows source title/domain, source tier if the application assigned one, publication/event date when known, retrieval time, short bounded excerpt, and source reference. It separates **Evidence**, **Inference**, and **Proposal rationale** into individually labelled sections. An unavailable, invalid, or partial response produces no proposal controls.

---

## Market Play Proposal Contract

### Proposal is not a Customer Profile

A **Market Play Proposal** is a bounded Product-level hypothesis. It is neither a confirmed Market Play nor a Customer Profile. Customer type, likely buyer, audience, and example organizations are proposal context only; they are not a profile, account, contact, candidate, prospect, or authorization for later work.

Every proposal card must repeat this boundary note verbatim:

**This is a Product-level market suggestion, not an accepted Customer Profile. Explore opens a Draft Market Play interview; it does not make a Profile Ready or start prospecting.**

### Proposal card composition

For each surfaced proposal, render in this order:

1. **Market Play Proposal** label, lifecycle badge (**New**, **Reopened**, **Deferred**, **Dismissed**, or **Explored**), and immutable proposal version/reference.
2. Proposed market category and problem family; do not use the word “Profile” in the heading.
3. **Problem match** with Product capability/limitation context.
4. **Customer audience** and **Likely buyer**, explicitly labelled **Suggested context — not a Customer Profile**.
5. **Examples**, explicitly labelled as evidence examples, never imported accounts or leads.
6. **Product fit** and **Risks / limitations**.
7. **Evidence** cards with source/provenance and a separate **Inference** panel, if any.
8. Product path, run trigger, configuration ID/digest, material-evidence fingerprint, run/proposal/audit references, and timestamps.
9. Owner decision controls or authoritative immutable decision result.

Do not surface more than three current proposal cards for one run trigger. A count label must read **{n} of 3 proposals surfaced for this {trigger} run**. If deduplication attaches evidence to an existing proposal, render it as an added immutable version/history entry, not a duplicate card.

### Owner decisions

Only an owner can decide. All decisions are immutable and act on the exact proposal version/fingerprint shown.

| Action | UI contract | Result |
|--------|-------------|--------|
| Explore | Primary CTA **Explore this Market Play**. Review panel repeats Product, proposal version/fingerprint, evidence summary, and boundary note. | Creates one Draft Market Play and opens its Draft Market Play Consensus Interview. No Customer Profile, Offer, Account, Target, Signal, Candidate, Prospecting Run, schedule, spend, contact, export, or outbound authority is created. |
| Defer | Secondary CTA **Defer proposal** reveals required reason and review date; prefill the default 90-day date but require the visible date to be recorded. | Stores immutable decision/history. It remains unavailable for ordinary repetition until its review date or qualifying material evidence reopens it. |
| Dismiss | Secondary/destructive CTA **Dismiss proposal** requires a reason and an explicit confirmation panel. | Stores immutable decision/history and applies 180-day cooldown. It is not deleted and cannot be silently resurfaced by repetition/republication. |

Use **Explore this Market Play** as the only green primary CTA per proposal decision surface. Defer is neutral/amber secondary. Dismiss uses a red outlined action only after confirmation; it must never be the default focused action.

On decision submit, freeze the reviewed evidence and disable competing actions. Use **Exploring Market Play…**, **Deferring proposal…**, or **Dismissing proposal…**. On success replace controls with decision, reason/date where applicable, created Draft Market Play/interview link for Explore, exact proposal version/fingerprint, owner/time, and audit reference. Do not leave a second enabled decision path.

### Cooldown and reopening

- Defer requires and displays **Review on {date}**; default is 90 days.
- Dismiss displays **Dismissed until {date}**; its cooldown is 180 days.
- Reopen early only when an owner-visible new source/event has a different material-evidence fingerprint that changes problem match, audience, Product fit, or risk. State the changed field and evidence comparison.
- Repetition, republication, or an overlapping run is not material evidence. Render **Not reopened — no material evidence change** and keep the prior decision readable.
- An owner correction that splits/merges proposal fingerprints is an audited lineage event. The UI shows old and new fingerprints, relationship, reason, and references; it never silently replaces proposal identity.

---

## Interaction and State Contract

| State | Contract |
|-------|----------|
| Initial loading | Show **Loading authoritative Product readiness…** or **Loading Market Discovery…** in one neutral bordered panel. Do not show cached Ready badges, proposal counts, or enabled actions. |
| Incomplete readiness | Show every unmet checklist row and disabled **Make Product Ready**; never collapse missing requirements into an unexplained count. |
| Ready activation pending | Preserve the exact checklist/revision snapshot, disable competing mutations, and show **Creating Product Discovery Configuration…**. |
| Ready activation success | Show authoritative Ready state, immutable configuration and initial-run/schedule references; move focus to the result heading. |
| Stale readiness revision | `role="alert"`: **This Product changed in another tab. Readiness was not activated. Review the current checklist before continuing.** Provide **Load current Product**. |
| Configuration replacement required | Show **This Product has a proposed configuration replacement. Discovery continues only under the active configuration shown.** Link to the Phase 2 replacement review; do not offer a mutable inline edit. |
| Discovery queue pending | Preserve active configuration and prior run result; disable duplicate queue controls and show **Queuing Market Discovery…**. |
| Run processing | Show monotonic state and run provenance. Do not call in-progress evidence a proposal or a successful run. |
| Failed/exhausted run | Show **Market Discovery needs attention. Product readiness remains active; no proposals were accepted from this run.** Provide **Review run details** and, only if the Product remains effectively available, **Discover markets** as a new explicit manual request. |
| Unknown network outcome | `role="alert"`: **The outcome could not be verified. Nothing will be retried automatically. Check the current discovery status.** The check is read-only. |
| Partial/malformed response | Treat the response as authority-unknown. Hide every mutation/action, including **Make Product Ready**, **Discover markets**, **Pause Product**, **Archive Product**, resume/lifecycle controls, and **Explore this Market Play**, **Defer proposal**, and **Dismiss proposal**. Show `role="alert"`: **Authoritative discovery results could not be verified. Reload this view.** The only available control is explicit **Reload this view**; it performs a fresh read and no mutation. |
| Read error / authority unknown | Treat a failed Product/read request as authority-unknown. Reveal no enabled mutation/action controls, including **Make Product Ready**, **Discover markets**, lifecycle controls, or proposal decisions, and do not retain an enabled action from a prior render. Show `role="alert"`: **Authoritative Product discovery could not be loaded. No readiness, run, or proposal authority has changed. Reload this view.** The only available control is explicit **Reload this view**; it performs a fresh read and no mutation. |
| No proposals | Heading **No Market Play proposals from this run**; body **This completed discovery run surfaced no bounded market hypotheses. No Market Play, Customer Profile, or prospecting activity was created.** |
| Proposal decision pending | Preserve exact proposal/evidence snapshot, disable all three decisions, and use the action-specific progress label. |
| Decision completed elsewhere | Render authoritative result with **This proposal decision was completed in another tab.** Do not offer another decision. |
| Deferred/dismissed proposal | Keep the immutable decision, reason, cooldown/review date, evidence, and lineage visible in history; never hide it as if it never existed. |
| Unauthorized | Reuse Phase 1 full-page **Private workspace unavailable** state. Reveal no Company/Product name, lifecycle, counts, configuration/run IDs, evidence, proposals, or source references. |

Background refresh never steals focus, discards an unsent Defer/Dismiss reason, or silently swaps the proposal/version under review.

---

## Spacing Scale

Use the established values only, all multiples of four:

| Token | Value | Usage |
|-------|-------|-------|
| xs | 4px | Badge/glyph gaps and compact metadata separation |
| sm | 8px | Inline run metadata, checklist controls, and action groups |
| md | 16px | Card gaps, proposal rows, and mobile page inset |
| lg | 24px | Panel padding and section separation |
| xl | 32px | Desktop readiness/discovery layout gap |
| 2xl | 48px | Major workflow grouping |
| 3xl | 64px | Reserved page-level separation |

Inherited exceptions: 248px rail, 68px sticky top bar, `4.2vw` desktop content inset, 9px panel radius, 7px control radius, 12px status-pill radius, and 300–320px contextual rail where reused. Enabled action targets are at least 44px high. Do not introduce arbitrary values for proposal-grid or checklist density.

---

## Typography

Use exactly four sizes and two weights: regular `400` and strong `760`.

| Role | Size | Weight | Line Height |
|------|------|--------|-------------|
| Body | 12px | 400 | 1.55 |
| Label | 10px | 760 | 1.2 |
| Heading | 16px | 760 | 1.2 |
| Display / Product state | 28px | 760 | 1.05 |

- Labels may use uppercase with `1.15px` letter spacing.
- Configuration IDs/digests, run IDs, proposal versions/fingerprints, source references, and audit IDs use Geist Mono at 12px/400 and wrap anywhere.
- Never communicate lifecycle, authority, cooldown, run state, or proposal status through weight, case, or color alone.

---

## Color

### 60/30/10 composition

| Role | Value | Usage |
|------|-------|-------|
| Dominant (60%) | `#f4f6f2` | Page canvas, neutral history, configuration/run metadata surfaces |
| Secondary (30%) | `#ffffff` | Readiness checklist, configuration, run, proposal, and decision panels |
| Accent (10%) | `#194b38` | Active local navigation, one primary action on the current surface, selected Product context, and visible focus emphasis |
| Destructive | `#a84b3e` | Archive Product, Dismiss proposal confirmation, errors, and unresolved conflicts only |

Accent is reserved for the active Market Discovery destination, **Make Product Ready**, **Discover markets**, **Explore this Market Play**, selected Product context, and focus outlines. Do not use accent on every proposal, source link, run, badge, or green lifecycle status.

### Semantic colors

| State | Foreground | Background | Border |
|-------|------------|------------|--------|
| Confirmed / Ready / succeeded | `#2a725b` | `#e8f5ee` | `#cbe0d2` |
| Proposed / Missing / Deferred / attention / paused | `#735c25` | `#fff8df` | `#d9a441` |
| Neutral / historical / dismissed / superseded | `#66736d` | `#f4f6f2` | `#dfe5df` |
| Conflict / error | `#842f2f` | `#fff5f5` | `#e8caca` |

Use `#17231e` for primary text, `#66736d` for supporting text, `#dfe5df` for borders, and `#c9f45b` only as the existing restrained focus/active highlight on dark green. Every semantic treatment includes a visible text label and, where helpful, a glyph.

---

## Copywriting Contract

| Element | Copy |
|---------|------|
| Page eyebrow | PRODUCT-LEVEL · OWNER-GOVERNED |
| Page title | Market Discovery |
| Page introduction | Confirm Product policy, create a replayable discovery configuration, and review bounded market hypotheses without starting prospecting. |
| Incomplete readiness message | Complete every confirmed Product policy item before readiness can be activated. |
| Readiness CTA | Make Product Ready |
| Readiness boundary | This creates an immutable Product Discovery Configuration, queues one initial Market Discovery Run, and schedules monthly discovery. It does not create or activate a Market Play, Customer Profile, Offer, prospect, contact, or outbound effect. |
| Manual discovery CTA | Discover markets |
| Manual discovery boundary | Manual discovery produces at most three Market Play proposals. It cannot create a Customer Profile or start prospecting. |
| Proposal boundary | This is a Product-level market suggestion, not an accepted Customer Profile. Explore opens a Draft Market Play interview; it does not make a Profile Ready or start prospecting. |
| Explore CTA | Explore this Market Play |
| Defer CTA | Defer proposal |
| Dismiss CTA | Dismiss proposal |
| Empty state heading | No Market Play proposals from this run |
| Empty state body | This completed discovery run surfaced no bounded market hypotheses. No Market Play, Customer Profile, or prospecting activity was created. |
| Read error | Authoritative Product discovery could not be loaded. No readiness, run, or proposal authority has changed. Reload this view. |
| Stale conflict | This Product changed in another tab. Readiness was not activated. Review the current checklist before continuing. |
| Destructive confirmation | Archive Product: **Archive {Product}? New Market Discovery Runs will not start. Restoring this Product returns it to Draft and requires fresh readiness activation. Historical configurations, runs, and proposals are preserved.** Dismiss proposal: **Dismiss this Market Play proposal? The decision and reason are retained, and the proposal is cooled for 180 days.** |

Use **Product Discovery Configuration**, **Market Discovery Run**, **Market Play Proposal**, **Draft Market Play**, **Customer Profile**, **Confirmed Knowledge**, **Proposed Knowledge**, **Explore**, **Defer**, and **Dismiss** exactly. Avoid “market validated,” “ready profile,” “lead,” “prospect,” “AI-approved,” “saved market,” or “activated” for a proposal decision.

---

## Responsive Contract

- Above 1050px, render readiness summary/checklist plus configuration context as a flexible two-column layout only when the main column retains at least 640px. Proposal cards may use two columns when each is at least 320px.
- At 1050px and below, stack contextual rail/configuration below the primary checklist or proposal content.
- At 760px and below, retain the stacked shell and 16px page inset. Local navigation is horizontally scrollable with visible text labels. Checklist rows, configuration input groups, run metadata, and proposal sections stack in semantic order.
- At 480px and below, action groups stack full width. **Explore this Market Play**, **Defer proposal**, and **Dismiss proposal** remain visible without horizontal scrolling and preserve their text labels.
- No card has fixed height. Long Product names, policy values, source excerpts, reasons, date labels, IDs, fingerprints, and dependency paths wrap without clipping.

---

## Accessibility Contract

- Use one page `h1`; use `h2` for Readiness, Discovery, each proposal heading, and decision history; use `h3` for checklist, configuration, run, evidence, inference, risk, and decision sub-sections.
- Status badges always expose full text; decorative glyphs are `aria-hidden="true"`.
- Readiness and decision errors/conflicts use `role="alert"`. Successful Ready activation and completed owner decisions use one polite live region; do not announce each background update or card.
- Enabled controls have visible 2px focus outline with 2px offset and minimum 44px target. Focus moves only after an explicit action/navigation: to **Product Ready** after successful readiness activation, to the Draft Market Play interview heading after Explore navigation, and to the first invalid reason/date field after a failed Defer/Dismiss submit.
- Native disabled controls repeat the blocking reason in adjacent visible copy. Do not rely on a tooltip.
- Use native `<details>`/`<summary>` for historical evidence/run/proposal versions. Disclosure is local state and never performs a mutation.
- Proposal audience, likely buyer, examples, evidence, risks, and boundary note are visible without hover. External links identify themselves as opening in a new tab.
- Render source excerpts and runner content as text, never raw HTML. Respect `prefers-reduced-motion`; no animated run/progress visual conveys the only status.

---

## UI Validation Contract

The Phase 3 UI is acceptable only when rendered/UI tests prove all of the following:

1. A Draft Product shows all nine required readiness rows; any non-confirmed row keeps **Make Product Ready** natively disabled with the exact next-step copy.
2. A complete confirmed checklist displays an explicit pre-activation review and the Ready action; success renders one authoritative configuration, one initial run reference, and one monthly schedule summary. Repeated/reloaded requests do not display duplicate artifacts.
3. Readiness uses only Product/Company confirmed policy; it succeeds with zero Market Plays, Customer Profiles, and Offers, and the resulting card states that scope explicitly.
4. A stale Product or prerequisite revision produces the exact alert, preserves the old snapshot, hides/blocks mutation, and provides **Load current Product**.
5. Manual discovery is unavailable before Ready, enabled only for an effectively available Ready Product, and cannot be used while paused/archived. Its review copy states the three-proposal cap and no-prospecting boundary.
6. Run cards expose trigger, configuration ID/digest, timestamps, source window, provider/model, instruction version, attempt, and monotonic state. `Submitted`/partial/failed output cannot render proposal controls or a success claim.
7. Partial/malformed results and read-error authority-unknown states render no enabled mutation/action control: **Make Product Ready**, **Discover markets**, every lifecycle control, and every proposal decision are hidden or disabled; an explicit **Reload this view** is the only available control and performs a read only.
8. One trigger visibly renders no more than three surfaced Market Play Proposal cards and the exact **{n} of 3** label. Dedupe attaches new evidence/history to an existing fingerprint instead of a duplicate active card.
9. Every proposal visibly labels audience/likely buyer/examples as suggested context and repeats the verbatim market-suggestion/not-Customer-Profile boundary note.
10. Explore is owner-only, creates/navigates only to a Draft Market Play interview, and never renders a Ready Profile, prospecting control, Account, Target, Signal, Candidate, Prospect, schedule, contact, spend, export, or outbound effect.
11. Defer requires reason plus visible review date (default 90 days); Dismiss requires reason plus explicit confirmation and shows 180-day cooldown. Both results preserve immutable history and do not disappear.
12. Reopen requires an evidenced material-fingerprint change and displays the changed field/reference; repetition/republication alone remains closed with the exact non-reopen state.
13. Unauthorized rendering exposes no private Product, configuration, run, proposal, source, count, or navigation data; it uses the accepted Phase 1 access state.
14. Keyboard/focus tests verify 44px enabled targets, visible focus, disabled reasons, action-specific pending labels, focus outcome, full-text badges, readable mobile stack, text-only untrusted content, and no color-only state.

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | None | Not applicable — shadcn is not initialized |
| Third-party registries | None | Not applicable |

Phase 3 continues the accepted manual/native component system. Any later registry request requires separate `shadcn view` safety vetting before it may enter a UI contract.

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS
- [ ] Dimension 2 Visuals: PASS
- [ ] Dimension 3 Color: PASS
- [ ] Dimension 4 Typography: PASS
- [ ] Dimension 5 Spacing: PASS
- [ ] Dimension 6 Registry Safety: PASS
- [ ] Operational authority and validation contract: PASS

**Approval:** pending checker verification
