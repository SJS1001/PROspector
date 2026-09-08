# Issue #11 — complete browser journey and accessibility acceptance

**Prepared:** 2026-09-08
**Repository:** `https://github.com/SJS1001/PROspector.git`
**Issue:** [#11 — Establish complete browser journey and accessibility acceptance](https://github.com/SJS1001/PROspector/issues/11)
**Base:** `main` at `d051fccd874a407802b3cc2988a2f7643f733225`
**Lane branch:** `claude/issue-11-browser-journey`
**Predecessor record:**
[`2026-09-08-work-unit-e1-operator-journey.md`](2026-09-08-work-unit-e1-operator-journey.md)

## Ownership

This lane is held by the incumbent E1 browser owner. It edits only browser
specs, browser fixtures, and lane evidence. It does not edit the operator
shell, the interview, the Contacts runtime, or any other shared UI module: two
of issue #11's journey stages need runtime seams that do not exist, and those
are reported below for the coordinator rather than built here.

At the time of writing no other branch has touched `site/tests/browser/` since
PR #50 merged, so there is one writer for this scope.

## Recorded coordination decision

Owner-approved, superseding any blanket pause: independent Claude cloud coding
and required canonical validation may proceed on this isolated cloud container.
The one-heavy-tree MacBook limit applies to that physical machine only. Existing
Hetzner/Studio validation is arranged by the coordinator; a previous browser
success is compatibility evidence, not a capacity reservation. No new approval
is needed for already-scoped local/synthetic fixes, tests, PRs and review fixes.
Real-data, provider, credential, hosted, outbound and export boundaries stand
unchanged. Zero registered checks is not passing CI.

## Reconciliation against current `main`

Each acceptance checkbox, judged against `d051fcc` and against real receipts —
not against intent.

### 1. Repeatable clean-workspace synthetic journey

| Stage | Covered by | Status |
|---|---|---|
| onboarding | `tests/browser/onboarding.spec.ts` | met |
| confirmed knowledge | `tests/browser/onboarding.spec.ts` | met |
| readiness | `tests/browser/onboarding.spec.ts` | met |
| fake research run | — | **blocked, see Unmet prerequisites** |
| prospect review | `tests/browser/operator-journey-e1.spec.ts` | met |
| fictional person/contact verification | `tests/browser/person-discovery-c4.spec.ts` | met |
| exact approvals | `tests/browser/operator-journey-e1.spec.ts` | met |
| local handoff | — | **blocked, see Unmet prerequisites** |

### 2. Supported screens/services, no direct authority insertion

Met, and deliberately not widened. Each lane seeds only the *starting state* of
its journey through a dev-gated, loopback-only, owner-admitted local-demo route,
then drives every governed transition through the real screens. The two blocked
stages are exactly the ones that could only be produced by inserting authority
directly, so they are reported instead of faked.

### 3. Keyboard, focus, labels, announcements, contrast, zoom, layouts

| Criterion | Before this branch | Now |
|---|---|---|
| keyboard navigation | one `Tab`, asserted only to leave `<body>` | every one of the first 12 tab stops asserted, and at least three controls must be reachable |
| visible focus | **not asserted anywhere** | every focused control must match `:focus-visible` and paint an outline or shadow |
| labels | Axe (`label`, `aria-*`) | unchanged, met |
| screen-reader announcements | **not asserted** — notices were matched anywhere on the page | each fail-closed notice must resolve inside `[aria-live="polite"][role="alert"]`, exactly once |
| contrast | Axe (`color-contrast`) | unchanged, met |
| zoom | **not asserted** | 320px (WCAG 1.4.10, a 1280×1024 window at 400%) and 200% text resize (WCAG 1.4.4) must both hold with no horizontal document scroll |
| narrow/desktop layouts | 760 / 480 / 360 / 1280 | plus 320 |

### 4. Stale tabs, interruption, expiry, uncertain operations, safe resumption

Already met by the E1 journey and unchanged here: CSRF expiry (403, one POST,
unverified notice), lost response (`connectionreset`, one POST, same notice),
two-tab race (exactly one 200 and one 409, one POST each, loser told it was not
applied), no automatic retry after a settle window, and restart durability.

### 5. Record exact source/environment, evidence, failures, blockers

Met by the E1 lane record and by this document. Source, synthetic browser,
hosted identity and live provider acceptance are kept separate; the browser
receipt is attributed to its executor and its environment.

### 6. Preserve the separate gates

Met and untouched. This branch adds no gate, relaxes none, and the three
zero-effect verifiers remain the authority on forbidden rows and R2 effects. A
browser pass does not replace them and is not presented as doing so.

## What this branch changes

- `site/tests/browser/operator-journey-e1.spec.ts` — the visible-focus,
  announcement, 320px and 200%-text assertions above. No new journey and no
  second fixture: the criteria are added to the journey that already owns this
  surface, per "extend existing checks rather than duplicate them".
- `docs/implementation-lanes/2026-09-08-work-unit-e1-operator-journey.md` — the
  attributed browser receipt, the merged E1 head, and the full Node suite.
- this record.

## Unmet prerequisites — for the coordinator, not for this lane

Two stages named in acceptance criterion 1 cannot be driven through supported
screens because the services are not composed into any route. Verified at
`d051fcc`:

| Stage | Module | Runtime importers in `app/`, `domain/`, `worker/`, `adapters/` |
|---|---|---|
| fake research run | `site/domain/ports/retrieval.ts` | none |
| local handoff | `site/domain/crm-csv-codec.ts` | none |

Composing either would be a runtime change outside this lane's file ownership,
and inserting the resulting state directly is what criterion 2 forbids. **Issue
#11 therefore cannot be fully closed by browser work alone**; it needs those two
seams from whoever owns the runtime, after which this lane can extend the
journey to cover them.

## Validation

Run on this branch at base `d051fcc`. True exits only.

| Command | Result |
|---|---|
| `npm run build` | exit 0 |
| `npx eslint . --ignore-pattern dist --ignore-pattern .next` | exit 0 |
| `node --test tests/browser-acceptance-foundation.test.mjs` | 5 pass / 0 fail, exit 0 |
| `node --test tests/production-bundle-boundary.test.mjs` | 6 pass / 0 fail, exit 0 |
| `node --test tests/local-demo-boundary.test.mjs` | 5 pass / 0 fail, exit 0 |

The full Node suite (`npm test`, 133 suites, 917 pass, 0 fail, exit 0) was run
on the immediately preceding head and is recorded in the E1 lane document.

**The new assertions were executed, and one of them failed on a real defect.**
The attributed executor installed the official Chromium 1243 in the retained
isolated container `prospector-pr62-validation` and ran the lane at exact head
`0ba6eaeb5f79f84bb92329e6268f2e50056ffbff`:

```
tests/browser/operator-journey-e1.spec.ts:35
  clientWidth 320, scrollWidth 469, expected <= 321
  offender: .assessment.outcome-passed > HEADER / P / DL, right 469.125,
            under .prospecting-panel.prospect-workspace
```

`npm test` and lint were not reached: the lane fails fast. Screenshot and error
context are retained at
`/tmp/prospector/site/.local/browser-acceptance-failures-e1-zGvjFH/operator-journey-e1-a-qual-9a184-hen-one-tab-wins-the-review/`.

**This is a source defect, not a test defect, and the assertion stays as
written.** The browser-environment blocker recorded earlier is resolved and
withdrawn: the pinned browser was obtained and the journey did run.

### Root cause, for the source owner

Two facts in `site/app/prospecting/prospecting-workspace.tsx` combine:

1. Its `min-width:0` rule lists `.prospecting>*`, `.prospecting-panel>*` and
   `.review-queue article>*` — but **not** `.assessment>*`. `.assessment` is a
   grid container, so its children keep `min-width:auto` and can push it past
   the viewport.
2. `overflow-wrap:anywhere` is applied to `.prospecting code`, `small`, `dd`,
   `blockquote` and `.scope-path` — but **not** to the assessment card's
   paragraph. `prospect-workspace.tsx:351` renders
   `Candidate {value(item.candidate_id)} · configuration {value(item.configuration_digest)}`,
   and `value()` returns a bare string, not a `<code>`. A 64-character
   configuration digest therefore has no break opportunity, giving that grid a
   min-content width of ~469px.

Both real and synthetic digests are 64 hex characters, so this reproduces
outside the fixture. The minimal repair is to extend the existing `min-width:0`
list to `.assessment>*` and give the assessment paragraph the same
`overflow-wrap:anywhere` the rest of the task already uses — no new breakpoint
required.

That file is outside this lane's ownership. The source-only fix is assigned to
the incumbent issue-8 UI owner on a separate branch; this lane makes no
competing edit and awaits the fixed combined revision for an exact-head rerun.
**No claim is made that the current head passes.**


## Boundary

No hosted, Cloudflare, Access, provider, credential, real-data, export delivery,
email, call, schedule, or outbound action was performed or enabled. No
migration, bootstrap, or shared roadmap/state document was modified. The retired
Sites project was not accessed. Local and synthetic results do not establish
live acceptance, and this lane earns no phase or plan completion credit.
