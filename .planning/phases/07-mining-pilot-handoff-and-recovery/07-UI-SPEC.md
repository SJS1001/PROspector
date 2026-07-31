---
phase: 07
slug: mining-pilot-handoff-and-recovery
status: draft
shadcn_initialized: false
preset: none
created: 2026-07-30
---

# Phase 7 — UI Design Contract

> Visual and interaction contract for the owner-only Morning Brief, CSV CRM Handoff, and workspace recovery evidence. Mining is an accepted seed, not a special product mode.

---

## Scope and sources

Phase 7 adds three owner-read/owner-controlled surfaces to the established private workspace: **Morning Brief**, **Exports & History**, and **Workspace Recovery**. They explain the current operating state and expose only the governed export/recovery requests defined below. They never become a CRM, campaign console, scheduler, enrichment console, or restore automation screen.

Authoritative inputs are the Phase 7 `CONTEXT.md`, `RESEARCH.md`, `PATTERNS.md`, and `VALIDATION.md`; the accepted Direction, implementation contract, and ADRs; and the Phase 3–6 projections named in `07-CONTEXT.md`. The UI consumes server-owned projections and immutable audit/manifest references. A client path, selected workspace, reported target, artifact key, restore target, or displayed green status is never authority.

The accepted initial path renders exactly `Digitalrain → ONE → ONE for Mining → Operating`. `Greenfield` renders separately as **Draft / nurture**. This visible example must be parameterized from the generic `Company → Product → Market Play → Customer Profile → Offer` hierarchy. Do not branch behavior, storage schema, or eligibility on any Mining label.

Out of scope: CRM connection/sync or CRM opportunity/revenue/customer state; runner scheduling or activation; enrichment, spend, calling, Gmail/sending, provider delivery, deployment, live lead import, and use of private lead files. A Phase 7 interface may report that an operation is disabled; it must not provide an action which could enable it.

---

## Design system

| Property | Value |
|---|---|
| Tool | Existing manual brownfield CSS using the current Tailwind CSS import |
| Preset | Not applicable |
| Component library | None; semantic native HTML and established React components |
| Icon library | None; text labels and simple native/CSS glyphs only |
| Font | Geist Sans for interface text; Geist Mono for stable IDs, UTC offsets, digests, manifests, schema versions, and audit references |
| Visual language | Existing dark rail, paper canvas, white bordered panels, deep-green owner action, lime focus, restrained green success, amber attention/blocked, and red failure language |

Do not initialize shadcn. Reuse the established shell, banner, panel, status, button, loading, error, mobile-stack, and pure-leaf/data-owner patterns. New purpose-named Phase 7 classes may extend them; a new visual grammar may not.

---

## Spacing scale

| Token | Value | Usage |
|---|---:|---|
| xs | 4px | Badge internals and compact metadata gaps |
| sm | 8px | Inline status and row gaps |
| md | 16px | Default card/list gap and mobile inset |
| lg | 24px | Card padding and section separation |
| xl | 32px | Desktop layout gaps |
| 2xl | 48px | Major surface groups |
| 3xl | 64px | Page-level separation |

Exceptions inherited from the shell only: fixed rail `248px`, sticky top bar `68px`, desktop content inset `4.2vw`, panel radius `9px`, button radius `7px`, and status-pill radius `12px`. Every enabled control and any focusable disclosure is at least `44px` high; no new arbitrary spacing values are introduced.

## Typography

Use exactly four sizes and two weights.

| Role | Size | Weight | Line height |
|---|---:|---:|---:|
| Label | 10px | 760 | 1.2 |
| Body and mono metadata | 12px | 400 | 1.55 |
| Heading | 16px | 760 | 1.2 |
| Display | 28px | 760 | 1.05 |

Labels may be uppercase with `1.15px` letter spacing. Identifiers, checksums, and digests wrap anywhere and never require horizontal scrolling. Weight, color, a glyph, or position alone never conveys a safety state.

## Color

| Role | Value | Usage |
|---|---|---|
| Dominant (60%) | `#f4f6f2` | Page canvas and neutral evidence areas |
| Secondary (30%) | `#ffffff` | Panels, tables/cards, top bar, disclosures |
| Accent (10%) | `#194b38` | One primary CTA per surface, active rail/local navigation, selected scope context, and visible keyboard focus |
| Destructive | `#a84b3e` | Failed/tampered/archive-incompatible states and explicit destructive recovery warning only |

Use the established semantic treatments: positive `#2a725b` on `#e8f5ee`, attention/blocked `#735c25` on `#fff8df`, neutral `#66736d` on paper, and error `#842f2f` on `#fff5f5`. Accent is reserved for **Review weekly evidence**, **Create CSV handoff**, **Review recovery evidence**, and their active navigation/context—not totals, ordinary links, success badges, or every enabled control.

---

## Shared safety and scope contract

- Repeat the selected hierarchy path, Profile lifecycle, active configuration digest, data-as-of timestamp, and a safe audit/reference ID on every Phase 7 surface. A breadcrumb is context, not eligibility proof.
- The controlled-pilot banner remains visible: **Controlled pilot — all displayed records are illustrative or synthetic until the required Phase 3–6 authority and Phase 7 release gates are accepted. This Phase 7 surface cannot change schedules, providers, outreach, or restore effects; restored targets remain disabled.**
- Attach one explicit provenance label to any non-live sample: **Synthetic fixture — not a lead, contact, pilot outcome, or import.** Mining source/deck evidence is labelled **Proposed source evidence**; masked Mining figures are labelled **Illustrative — not outcome evidence**. Never use “live,” “proved,” or “ready to send” for those materials.
- Use four textual status families: **Current**, **Needs review**, **Blocked**, and **Historical**. For recovery also use **Verified dry run**, **Restore blocked**, and **Restored — effects disabled**. All include plain-language reason, checked time, and safe reference.
- Every server mutation/request has a pending state that disables competing controls, retains the immutable summary, and announces one result. Unknown network outcomes reload the authoritative projection; no request, download, restore, or retry is automatically replayed.
- Unauthorized/malformed scope renders the established neutral **Private workspace unavailable** screen and reveals no hierarchy, counts, contacts, artifacts, manifests, or audit references.

---

## Information architecture

### Morning Brief

Morning Brief is the signed-in operating landing view when an established workspace exists. Its fixed reading order is:

1. Scope/context strip: `Digitalrain → ONE → ONE for Mining → Operating`, **Operating — current profile**, active configuration digest, and **Greenfield — Draft / nurture; not active**.
2. **Weekly outcome** focal panel: exactly **7 newly Export-ready Prospects** for the current Monday–Sunday week in `America/Toronto`; include the explicit week start/end dates and UTC offsets used. This is a target and outcome measure, never a permission or readiness claim.
3. **Schedule and readiness** panel: `Weekdays · 06:00 · America/Toronto`, stated enabled/disabled state, upstream readiness/gate reference, and a visible no-effect explanation. It is a read-only status; do not render Start, Enable, Run now, or Schedule controls.
4. **Funnel losses**: labelled counts for rejection, deferral, enrichment failed, enrichment uncertain, review delay, stale/invalid contact, package revoked/expired, suppression, high-risk drift, and reversal to `NeedsReview`/`NonContactable`. “Other blocked” is permitted only with a visible bounded reason breakdown.
5. **Current handoff readiness**: Export-ready Prospect count and separately labelled **eligible contact rows** count; show the current approved package/configuration dependency and explicit exclusions.
6. **Evidence and recent audit**: immutable weekly-cohort version/audit reference, calculation as-of time, latest export/recovery summaries, and a disclosure for non-sensitive loss definitions.

The weekly numeral is the visual focal point, but never green by itself and never paired with an implication that a schedule, handoff, or external effect is enabled. Its required explanatory text is: **Counts each stable Prospect once, at its first Export-ready transition this local week. CSV contact rows, re-exports, and later reversals do not increase this target.**

Greenfield appears as a separate, muted Draft/nurture card with: **Greenfield is not an active operating profile. It contributes no schedule, weekly outcome, handoff, or runner activity.** It is not a filter option that may silently mix its records into Operating.

### Exports & History — CSV CRM Handoff

Add a local view named **CSV CRM Handoff** within the existing **Exports & History** destination. It owns one server-authorized request flow and shows, in order:

1. Current selection definition and dependencies: current Export-ready Prospect, current approved package, fresh verified contact/contact point, transaction-time Company-wide suppression fence, source workspace ID, and configuration/package digests.
2. Two non-interchangeable metric cards: **Export-ready Prospects** and **Eligible contact rows**. The second says: **One Prospect can contribute more than one row. Contact rows are not the weekly seven-lead metric.**
3. Eligibility/exclusion ledger: included count plus duplicate, suppression, stale verification, invalid verification, no approved package, disqualified, high-risk drift, identity merge/split, and other current-ineligible counts. Each non-zero exclusion has a labelled reason; no hidden “filtered” total.
4. Frozen snapshot/manifest summary and the single primary control **Create CSV handoff**.
5. Immutable handoff history, newest first: manifest ID, schema version, selection time, row count, unique Prospect count, SHA-256 of exact persisted bytes, source workspace ID, configuration/package/policy digests, delivery state/expiry, and audit references.

This is CSV delivery only. Do not display CRM provider selection, Connect CRM, Sync, Push, pipeline stages, opportunities, revenue, forecasts, deals, customers, or a CRM identifier field. The button creates a governed CSV artifact and manifest; it does not send contacts to any external system.

#### CSV request, duplicate, and suppression states

The confirmation summary for **Create CSV handoff** must visibly state the frozen selection timestamp, the two distinct counts, schema version, active package/configuration digests, and: **The server rechecks eligibility and Company-wide suppression before it materializes this file. No CRM sync or outreach will occur.**

| State | Required presentation and behavior |
|---|---|
| Eligible snapshot | Show **Current eligibility snapshot** with included row count and distinct Prospect count; request remains available only when all dependencies are current. |
| Duplicate contact-point identity | Show **Duplicate excluded** with stable Prospect/contact-point reference and safe reason. It is deduplicated by stable identity, never displayed name/email/CRM ID. |
| Suppression | Show **Suppressed — non-contactable** with bounded subject class/reason and tombstone/audit reference. Omit it from contactable rows. A separately downloadable/viewable manifest, if authorized, is titled **Non-contactable suppression manifest** and contains no contactable CSV row. |
| Eligibility reversal | Show **No longer eligible** with current cause such as stale verification, package revocation, disqualification, drift, merge/split, deletion, or suppression. Historical exports remain Historical; their bytes are not edited. |
| Same frozen definition retry | Show **Existing deterministic handoff** with its checksum and byte-identical artifact; do not make a fresh artifact. |
| Changed snapshot | Show **New handoff version required** with the changed dependency/snapshot reference. Historical artifact stays immutable. |
| Delivery expired/failed | Show **Delivery unavailable** and the expiry/failure time. Provide **Review manifest**; never silently re-create or alter a file, eligibility, or checksum. |

The CSV preview, when rendered, is a non-editable table and has a persistent label: **Preview only — server materializes deterministic UTF-8 CSV bytes.** It displays formula-neutralized cells as text and must never execute spreadsheet formula syntax. A download, if delivery authorization is current, is a secondary action labelled **Download CSV handoff**; it does not trigger a rebuild. The UI shows a fixed-column/schema disclosure, canonical row-order statement, and checksum, but never lets the operator reorder fields, edit rows, or choose browser CSV formatting.

### Workspace Recovery

Expose **Workspace Recovery** as a local view within **Exports & History**, after CSV CRM Handoff. It is a recovery evidence surface—not an operational restore console—and uses this fixed sequence:

1. **Archive boundary**: what is included (canonical records, immutable history/audit, object bytes/references, manifests/checksums, dependencies, export artifacts, suppression/deletion tombstones) and what is excluded (credentials, OAuth/bearer tokens, raw passphrases, environment secrets).
2. **Authorization and archive readiness**: owner reauthentication freshness, authorization result, archive format/schema compatibility, archive inventory, encrypted-envelope version, safe archive/audit reference, and delivery expiry. Never render/store/log a passphrase value or hint.
3. **Dry run evidence**: a read-only verification result covering authorization, expiry, manifest/signature/checksum, passphrase authentication, compatibility, object completeness, referential/invariant checks, clean target, and zero target writes/effects.
4. **Explicit restore evidence**: only after a successful dry run, render the approved archive/target compatibility summary and an explicit owner-only **Restore verified archive** confirmation. The confirmation must name the clean compatible target, dry-run result, restore nonce, and: **This applies no schedule, runner, send, provider, or delivery authority. All effects remain disabled after restore.**
5. **Replay and audit ledger**: archive creation/delivery, dry runs, restore attempts/results, replay/invariant result, target-effect fence, timestamps, actor role (not raw identity), bounded outcome/reason, stable digest/reference, and no raw contact/archive/passphrase content.

The recovery screen may expose **Create encrypted workspace archive**, **Run read-only dry run**, and **Restore verified archive** only where upstream capability gates and recent owner reauthentication permit the respective governed server request. It never provides an automatic restore, overwrite, retry bypass, target picker from client input, passphrase persistence, or effect-enable action. All three controls use native `disabled` when their predicate fails and show the first unmet predicate in adjacent visible copy.

#### Recovery state and confirmation contract

| State | Required copy / behavior |
|---|---|
| Reauth missing/stale | **Recent owner reauthentication is required before an archive operation. No archive was created.** Disable archive/dry-run/restore controls. |
| Archive unavailable | **Workspace archive is unavailable until authorization, encryption capability, and delivery gates are proven. No workspace data was exported.** |
| Archive created | **Encrypted archive created.** Show safe manifest/checksum, format version, delivery expiry, and audit reference; never show the passphrase. |
| Dry run pending | **Verifying archive and clean target without writing target data…** Disable competing recovery controls and retain the exact archive/target summary. |
| Dry run verified | **Dry run verified — no target data, schedules, runners, sends, providers, or delivery state changed.** Make the explicit restore confirmation available; do not restore automatically. |
| Tampered/wrong passphrase/unauthorized/expired | **Archive verification failed. No target data or operational state changed.** Do not distinguish wrong passphrase from tampering to an untrusted caller. |
| Non-clean/missing object/version skew/invariant failure | **Restore blocked. The target remains unchanged. Review the bounded recovery evidence before preparing a clean compatible target.** |
| Restore applying | **Applying the verified archive to the approved clean target…** Disable all recovery controls; do not expose a cancel-as-success or retry action. |
| Restore complete | **Restore complete — all schedules, runners, outboxes, providers, and delivery remain disabled.** Show replay/invariant/effect-fence result and audit reference. |
| Unknown request outcome | **The recovery outcome could not be verified. Nothing will be retried automatically. Load the current recovery audit.** Provide **Load recovery audit**. |

`Restore verified archive` has a destructive confirmation because it writes to a clean target. The final confirmation copy is exactly: **Restore this verified archive into the approved clean compatible target? This cannot enable schedules, runners, sends, provider calls, or delivery. The target must remain clean and all effects will stay disabled.** The confirmation control is unavailable until the server reports a current successful dry run and a matching archive/target/nonce.

---

## Loading, empty, error, and blocked states

| Surface/state | Required copy and behavior |
|---|---|
| Morning Brief loading | **Loading current weekly outcome and readiness evidence…** Do not show cached counts as current or a green placeholder. |
| Morning Brief empty | **No weekly outcome evidence is available.** **Load current Phase 3–6 authority and immutable transition history before interpreting the seven-lead target.** Show no implied zero-success result. |
| Morning Brief error | **Morning Brief could not load current evidence. Nothing has been scheduled or enabled.** Provide **Retry Morning Brief**. |
| Schedule blocked | **Schedule state is reported from Phase 4 only — weekday 06:00 America/Toronto is not current upstream. This view cannot enable it or start a runner.** |
| Handoff loading | **Loading current eligibility projection and immutable handoff history…** No artifact/download action is enabled. |
| Handoff empty | **No eligible contact rows are available for CSV handoff.** **Export-ready Prospects, fresh verified contacts, an approved package, and no Company-wide suppression are required.** |
| Handoff error | **CSV handoff could not load the current eligibility projection. No file was created or delivered.** Provide **Retry handoff status**. |
| Handoff blocked | **CSV handoff is blocked by {first current predicate}. No CRM sync, contact delivery, or outreach will occur.** |
| Recovery loading | **Loading archive and recovery evidence…** Do not infer archive availability or dry-run success. |
| Recovery empty | **No authorized archive or recovery evidence is available.** **A recent owner reauthentication and accepted archive capability gate are required before recovery can begin.** |
| Recovery error | **Recovery status could not be loaded. No archive, dry run, restore, or external effect was started.** Provide **Retry recovery status**. |
| Missing Phase 3–6 input | **This Phase 7 view is blocked because {authoritative input} is missing, stale, cross-workspace, revoked, suppressed, or drifted. Load the current upstream authority.** Show the owning Phase and safe reference; do not recreate the rule locally. |
| Synthetic/illustrative sample | **Synthetic fixture — illustrative only. It does not prove a pilot outcome and cannot be exported, restored as live data, or used to enable an operation.** |

---

## Accessibility and responsive contract

- Use one `h1` per surface, `h2` for sections, and `h3` for metric cards, loss groups, manifest/archive records, and recovery checks. Use native tables with captions and row/column headers for metrics, exclusions, handoff history, and audit ledgers; on narrow screens, transform rows into labelled key/value cards without losing labels or order.
- Every status includes a word, glyph, and concise reason in addition to color. Use `aria-live="polite"` only for the active request result; use `role="alert"` for blocking/stale/malformed/verification-failure states. Never announce all metrics on background refresh.
- Enabled buttons, summary/disclosure controls, scope links, manifest links, and download actions have visible `2px` focus outline with `2px` offset and `44px` minimum target. Native disabled controls retain an adjacent persistent reason; no tooltip or hover-only condition is required to understand why.
- `details/summary` may disclose checksum, schema, exclusion/audit detail, and archive inventory. The weekly target definition, Prospect-vs-contact-row distinction, schedule disabled state, dry-run result, effect fence, and first blocker remain visible without expansion.
- Above `1050px`, use a two-column supporting layout beside the focal metric/primary ledger only when cards retain at least `320px`; otherwise stack. At `760px` and below, use a single-column layout with `16px` inset; tables become labelled cards, counts stay next to their labels, and no critical column is clipped or hidden. At `480px`, stack action/metadata groups and allow monospaced identifiers to wrap.
- External/source content, immutable references, CSV preview cells, and bounded audit reason text render as escaped text. Links clearly state when they open externally. No hover, animation, color, or screen position alone communicates eligibility, recovery safety, or evidence provenance. Respect `prefers-reduced-motion`; no pulsing status indicator.

---

## Copywriting contract

| Element | Copy |
|---|---|
| Morning Brief title | Morning Brief |
| Weekly metric label | Newly Export-ready Prospects this week |
| Weekly target definition | Counts each stable Prospect once, at its first Export-ready transition this local week. CSV contact rows, re-exports, and later reversals do not increase this target. |
| Schedule label | Operating schedule visibility |
| Greenfield state | Greenfield — Draft / nurture; not active |
| Handoff primary CTA | Create CSV handoff |
| Handoff empty | No eligible contact rows are available for CSV handoff. Export-ready Prospects, fresh verified contacts, an approved package, and no Company-wide suppression are required. |
| Handoff error | CSV handoff could not load the current eligibility projection. No file was created or delivered. |
| Handoff disabled | CSV handoff is blocked by {first current predicate}. No CRM sync, contact delivery, or outreach will occur. |
| Recovery primary CTA | Review recovery evidence |
| Archive CTA | Create encrypted workspace archive |
| Dry-run CTA | Run read-only dry run |
| Restore CTA | Restore verified archive |
| Recovery empty | No authorized archive or recovery evidence is available. A recent owner reauthentication and accepted archive capability gate are required before recovery can begin. |
| Recovery error | Recovery status could not be loaded. No archive, dry run, restore, or external effect was started. |
| Restore confirmation | Restore this verified archive into the approved clean compatible target? This cannot enable schedules, runners, sends, provider calls, or delivery. The target must remain clean and all effects will stay disabled. |
| Synthetic label | Synthetic fixture — not a lead, contact, pilot outcome, or import. |
| Illustrative label | Illustrative — not outcome evidence. |

Use **CSV CRM Handoff** only for the export boundary, and **Company Workspace Archive** only for the full portable archive. Do not shorten either to “CRM export” or “backup” where that would hide the scope/determinism/recovery constraints.

---

## Registry safety

| Registry | Blocks used | Safety gate |
|---|---|---|
| None | None | Not applicable — manual brownfield system; no third-party registry or component block is permitted or used, verified 2026-07-30 |

---

## Acceptance checklist

- [ ] Morning Brief identifies exactly seven newly Export-ready stable Prospects by first local-week transition, not CSV rows or current status.
- [ ] Operating and Greenfield are visibly segregated; Greenfield is Draft/nurture and never active by implication.
- [ ] Weekday `06:00 America/Toronto` schedule visibility includes timezone/state and cannot enable, run, or schedule work.
- [ ] Funnel losses are separately labelled, visible, and never counted toward seven.
- [ ] CSV CRM Handoff makes eligible contact-row count distinct from Export-ready Prospect count and contains no CRM integration or CRM objects.
- [ ] Snapshot, deterministic checksum/manifest, duplicate identity, suppression, eligibility reversal, expiry/failure, and immutable-history states are explicit.
- [ ] Recovery explains archive exclusions, reauthentication, dry-run-first, clean-target restore, replay/invariants, audit, zero-write failure, and all-effects-disabled release state.
- [ ] Loading, empty, error, blocked, disabled, unknown-outcome, unauthorized, synthetic, proposed, and illustrative states fail closed with the specified copy.
- [ ] All controls and evidence satisfy the declared keyboard, text-status, focus, semantic, live-region, responsive, and escaped-content requirements.
- [ ] The implementation uses generic Company/Product/Market Play/Profile records and a second synthetic non-Mining fixture; Mining labels are never behavioral conditions.

---

## Checker sign-off

- [x] Dimension 1 Scope / contract compliance: PASS
- [x] Dimension 2 Information hierarchy: PASS
- [x] Dimension 3 Interaction / safety / authority: PASS
- [x] Dimension 4 States / recovery: PASS
- [x] Dimension 5 Accessibility: PASS
- [x] Dimension 6 Implementation readiness / consistency: PASS
- [x] Registry safety: PASS — no registry used

**Approval:** APPROVED — independent UI-spec check completed 2026-07-30; no blocking findings.
