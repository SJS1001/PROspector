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
| local handoff | `tests/browser/operator-journey-e1.spec.ts` | written and merged (PR #71), **never executed** |

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
| fake research run | `site/domain/ports/retrieval.ts` | **still none** |
| local handoff | `site/domain/crm-csv-codec.ts` | ~~none~~ → now imported by `domain/crm-handoff-projection.ts` and the dev-gated `app/api/local-demo/crm-handoff-preview/_handler.ts` (PR #67) |

**Update, verified at `main` `8d5f453`:** the handoff half of this table is
resolved and the research half is not. `crm-csv-codec.ts` now has runtime
importers — note they are a domain module and a *dev-gated* local-demo handler,
not a production route, so real admission stays zero. `ports/retrieval.ts` still
has no importer anywhere in `app/`, `domain/`, `worker/` or `adapters/`, so the
research stage still has no seam to drive.

Composing either would be a runtime change outside this lane's file ownership,
and inserting the resulting state directly is what criterion 2 forbids. **Issue
#11 therefore cannot be fully closed by browser work alone**; it needs those two
seams from whoever owns the runtime, after which this lane can extend the
journey to cover them.

Both have since been dispatched: the CSV owner now holds a narrow, explicit
fictional in-memory preview authority for the handoff stage, and the research
route remains a separate dependency-injection-only ruling that is still pending.
Neither is composed at the base recorded above.

**Issue #11 stays open regardless of this PR.** Closure requires genuinely
composed journeys through those services. A seeded starting state is a legitimate
fixture for the stages that *are* composed — every governed transition in them is
driven through the real screens — but it is not a substitute for a stage whose
service does not exist, and this lane will not present one as though it were.

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

### Historical — superseded, preserved deliberately

**Revision `0ba6eaeb5f79f84bb92329e6268f2e50056ffbff`, 2026-09-08 (before PR #65
landed the source fix).** This record is kept because the defect was real and
the assertion that caught it must not be quietly re-litigated. It is **not**
evidence about any current head; the current evidence is recorded separately
below under *Official receipt*.

At that revision the new assertions were executed and one failed on a real
defect. The attributed executor installed the official Chromium 1243 in the
retained isolated container `prospector-pr62-validation` and ran the lane at that
exact head:

```
tests/browser/operator-journey-e1.spec.ts:35
  clientWidth 320, scrollWidth 469, expected <= 321
  offender: .assessment.outcome-passed > HEADER / P / DL, right 469.125,
            under .prospecting-panel.prospect-workspace
```

`npm test` and lint were not reached in **that** run, because the lane stops at
its first failing assertion. Screenshot and error context are retained at
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

That file is outside this lane's ownership. The source-only fix is
`claude/issue-8-320px-overflow-fix` at `448531b2eec166cb796f4f05f1a015956a911db4`
(PR #65), owned by the incumbent issue-8 UI owner. This lane made no competing
edit and inspected it read-only: `.assessment>p{overflow-wrap:anywhere}` is the
load-bearing change and is correct. The separate `min-width:0` repair is not
needed, because `overflow-wrap:anywhere` — unlike `break-word` — reduces
intrinsic min-content size, so the grid item's `min-width:auto` resolves small on
its own. Two clauses in that fix are inert or redundant; both are reported on
PR #65 and neither is blocking.

**No claim is made that any head passes.** The lane fails fast: it stopped at the
third width of the reflow loop, so the 200% text-resize assertion, the
visible-focus walk, the three announcement assertions, journey steps 1–6, and
`npm test`/lint have never been evaluated on any head. A green 320px does not
imply a green lane, and focused source tests are not evidence for any of it. Once
PR #65 is reviewed and merged, this lane merges `main` forward normally and
publishes the exact combined SHA for one official browser and canonical
validation. No duplicate suite is run in the meantime.


## Combined revision — one official validation is now due

Both halves are on `main`, and this is the exact revision the single official
browser and canonical validation should run against:

| Merged | PR | Merge commit |
|---|---|---|
| 2026-09-08T17:24:47Z | #65 — the source fix (`448531b`) | `060d7169e3cc88727044c4fa05da3a1536544982` |
| 2026-09-08T17:25:12Z | #62 — this lane's assertions (`7e81b46`) | `fe11d6d0d5ea290a43336753e07b10963ef048ab` |

**Exact combined SHA: `main` at `f7d8fc058dc4516b4cbf852c7bb74da65fc3e734`.**

Verified present at that SHA: `site/app/globals.css:27` carries
`.assessment>p { overflow-wrap:anywhere; }`, and
`site/tests/browser/operator-journey-e1.spec.ts` carries the 320px width in the
reflow loop plus `assertTextResizeHolds`, `assertVisibleFocus` and the three
`assertAnnounced` calls.

What that validation still has to establish, none of which any run has reached:

- `npm run test:browser:operator-journey` past line 35 — the 200% text-resize
  assertion, the visible-focus walk, the three announcement assertions, and
  journey steps 1–6 (CSRF expiry, lost response, the 200/409 two-tab race,
  restart durability).
- `npm run test:browser` and `npm run test:browser:person-discovery`, whose
  onboarding reflow parity and seed-absence assertions were last proven at
  `bff326f6`, several merges ago.
- `npm test` and lint, which fail-fast prevented on the failing head.

No claim is made here that `f7d8fc0` passes. This lane ran no duplicate suite.


## Exact-tree reconciliation at `f7d8fc0`

Read-only, against the tree rather than against intent:

| Checked | Result |
|---|---|
| `tests/browser/operator-journey-e1.spec.ts` | byte-identical to the merged PR #62 head — no post-merge drift, all assertions intact |
| three lanes present | `onboarding`, `operator-journey-e1`, `person-discovery-c4` |
| lane wiring | `playwright.config.ts` still derives `testMatch` from the lane name; all three `test:browser*` scripts present |
| binding allowlist | still closed: `PROSPECTOR_PERSON_DISCOVERY_C4` and `PROSPECTOR_OPERATOR_JOURNEY_E1` only |
| every selector the E1 spec drives | present in `site/app/` — the two headings, `Customer Profile`, `Selected Profile`, `Owner reason`, `Approve prospect`, `No qualified prospects to review` |
| both notice strings | present verbatim at `prospecting-workspace.tsx:32` and `:34` (the unknown notice is asserted by prefix, which substring matching satisfies) |
| the live region the announcement assertions require | `prospecting-workspace.tsx:168-171` — `aria-live="polite"` with `role="alert"` for `stale` and `unknown` |
| the source fix | `globals.css:27` carries `.assessment>p { overflow-wrap:anywhere; }` |

Nothing merged after PR #62 disturbed the lane.

## The one official run

Exact revision: **`main` at `f7d8fc058dc4516b4cbf852c7bb74da65fc3e734`**. From
`site/`:

```
npm run test:browser:operator-journey     # the complete journey
npm test                                  # canonical: build + all Node suites
npm run lint
```

**How the official runner actually executes these.** It runs each stage
independently so that every stage reports its own exit code, rather than
short-circuiting the sequence at the first non-zero exit. An earlier revision of
this document described it as stop-at-first-failure; that was not an accurate
description of the official run and is corrected here. A later stage's absence
from the receipt therefore means *not yet reported*, not *skipped because an
earlier stage failed*.

Separately, and not the same thing: the browser lane itself stops at its first
failing assertion, which is why the historical `0ba6eae` run reached nothing
past `operator-journey-e1.spec.ts:35`.

No duplicate run was performed here.

## Official receipt — operator journey PASSED at `f7d8fc0`

The single official run was executed on the coordinator runner against immutable
`main` `f7d8fc058dc4516b4cbf852c7bb74da65fc3e734`:

| Lane | Result |
|---|---|
| `npm run test:browser:operator-journey` | **1/1 passed, 25.1s**, `STAGE_EXIT browser=0` |
| zero-effect verifier | `forbiddenRows=0`, `r2Objects=0`, `r2Multipart=0` |

Because the lane ran to completion rather than stopping at a failing assertion,
this receipt covers every assertion in **that one spec** — the 320px reflow that
previously failed, the 200% text resize, the visible-focus walk, the three
live-region announcements, and journey steps 1–6.

**It covers one lane of three.** The base onboarding lane and the
person-discovery C4 lane are queued and have *not* run at this revision; nothing
here says or implies that all browser lanes passed.

**This is not full acceptance.** Canonical is still live on the coordinator
runner as `exec81223`; lint is pending; the base onboarding lane and the
person-discovery C4 lane are queued sequentially after it. Nothing about those
is claimed here.

## Remaining acceptance coverage — precise, not blanket

| Criterion | Coverage | Last actually proven |
|---|---|---|
| 320px reflow | asserted | **`f7d8fc0` — passed** |
| 200% text resize | asserted | **`f7d8fc0` — passed** |
| visible focus | asserted | **`f7d8fc0` — passed** |
| screen-reader announcements | asserted | **`f7d8fc0` — passed** |
| journey steps 1–6 (CSRF expiry, lost response, 200/409 race, durability) | asserted | **`f7d8fc0` — passed** |
| onboarding reflow parity + seed absence | asserted | `bff326f6` — **re-run queued**, not yet proven at `f7d8fc0` |
| person-discovery C4 lane | asserted | `bff326f6` — **re-run queued**, not yet proven at `f7d8fc0` |
| keyboard navigation, labels, contrast, 760/480/360/1280 | asserted | E1 portion at `f7d8fc0`; onboarding and C4 portions queued |
| canonical Node suite | — | **live as `exec81223`, no result yet** |
| lint | — | **pending** |
| research run stage | **not written** | service not composed; runtime held separately |
| local handoff stage | **in progress** | dependencies now exist — see below |

## Next browser-owned slice: the guarded fictional CSV preview

Read from `claude/issue11-csv-handoff-contract` at `de93e93` (PR #67), read-only.
The contract a browser journey must pin, once the UI trigger exists:

- `POST /api/local-demo/crm-handoff-preview`, no request body, no
  caller-supplied rows; 404 unless local-demo, same-origin, and owner-admitted.
- `decision.admitted` is `[]` and `admittedRowCount` is 0. This is the real
  seam: `projectCrmHandoff` consults `recheckForCrmExport`, which never returns
  an unblocked recheck, so every candidate is refused. A journey must assert the
  empty admission, not merely that a preview rendered.
- `preview.previewRowsAreFictionalAndUnadmitted` is `true`, and the preview is
  visibly separated from the decision in the UI — the rows shown were refused.
- `exportAuthorized`, `deliveryAuthorized`, `downloadAuthorized`,
  `persistenceAuthorized` and `providerInvocationAuthorized` are all `false`.
- No download is offered: no `Content-Disposition`, no `blob:`/`data:` anchor,
  no `download` attribute anywhere on the screen, and `cache-control: no-store`.
- Nothing persists: a runtime restart leaves no artifact and no row.

**This slice is not startable yet.** The trigger belongs to the issue-8 UI owner
and does not exist at `de93e93`; a browser journey needs a supported screen to
drive, and seeding past a missing control is what criterion 2 forbids. When the
trigger lands, the work goes on a fresh isolated branch, touches browser specs
and fixtures only, and changes no source. The research runtime stays held
separately and is not part of this slice.


## Boundary

No hosted, Cloudflare, Access, provider, credential, real-data, export delivery,
email, call, schedule, or outbound action was performed or enabled. No
migration, bootstrap, or shared roadmap/state document was modified. The retired
Sites project was not accessed. Local and synthetic results do not establish
live acceptance, and this lane earns no phase or plan completion credit.
