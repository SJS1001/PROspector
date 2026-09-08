# Issue #5 — generic company onboarding: evidence and closure recommendation

**Prepared:** 2026-09-08
**Repository:** `https://github.com/SJS1001/PROspector.git`
**Base:** `main` at `e0c93d2cb8f253382b2a242e0ce62f3f0d92944a`
**Lane branch:** `claude/issue5-generic-onboarding`
**Issue:** [#5 — Support generic company onboarding from a blank workspace](https://github.com/SJS1001/PROspector/issues/5)

This is an audit lane, not an implementation lane. Ownership for this issue was
scoped to the generic bootstrap/commercial-initialization domain —
`site/domain/commercial-model.ts`, `site/domain/onboarding.ts`, and their
focused tests — plus this evidence doc. Interview sequencing (issue #9),
shell/UI (issue #8), browser suites/fixtures (issue #11), Contacts, schema,
`package.json`, and shared planning documents were explicitly out of scope and
were not edited.

## Finding

Within the owned domain, issue #5's acceptance criteria are already met by
code merged onto `main` before this lane started (via the prior
`codex/generic-onboarding-integration` and `claude/task-e1-operator-journey`
work). No residual defect was found inside `commercial-model.ts`,
`onboarding.ts`, or their two focused test files. **No code was changed in
this lane.**

### Acceptance bullets, checked against current `main`

1. **"Let the admitted owner supply their company and product information
   through supported screens."** `onboarding.ts:51`
   (`initializeOwnerCompanyProduct`) takes `companyName`/`productName` as
   caller-supplied input, validated by `name()` (`onboarding.ts:104`), and
   writes them straight through — no literal company/product name anywhere in
   the file. Wired at `knowledge-handler.ts:90`
   (`case "initialize_owner_workspace"`). The UI screen itself
   (`app/knowledge/...`, `tests/browser/onboarding.spec.ts`) is issue #8/#11
   territory and is not re-verified here.

2. **"Treat the Mining seed as an explicit example; do not automatically
   impose it on another company."** `commercial-model.ts`'s
   `initializeCommercialModel`/`ensureCompany`/`ensureProduct`/`ensurePlay`
   (lines 45–88, 190–193) still hard-code
   `Digitalrain -> ONE -> ONE for Mining -> Operating/Greenfield`. That is by
   design: `docs/GENERIC-ONBOARDING.md:3` states this initializer "remains an
   explicit test/example helper and is not called by runtime reads," and a
   repository-wide search confirms `initializeCommercialModel` has no caller
   outside test files — `onboarding.ts` and `knowledge-handler.ts`'s onboarding
   dispatch never reach it. `commercial-model-repository.test.mjs` pins the
   seed as exact and inert. Within the files this lane owns, the Mining seed is
   correctly fenced off from the generic path. (A separate, live escape hatch
   exists outside this scope — see **Handoff** below.)

3. **"Derive company/product/profile context and owner-facing labels from
   current workspace data throughout the UI."** `onboarding.ts`'s
   `readOnboardingProjection` (line 20) and `commercial-model.ts`'s
   `readCommercialModel` (line 90) both project every name/id/revision from
   stored rows only. The shell-side consumption of this data
   (`app/prospector-app.tsx`) is issue #8 territory; spot-checking it showed a
   generic `"Company setup"` fallback rather than a hard-coded company name,
   consistent with this bullet, but that file is not owned or re-verified here.

4. **"Show incomplete setup, next required decisions and resumable
   progress."** `OnboardingProjection`'s status union
   (`onboarding.ts:11-16`) models exactly this:
   `company_product_required -> market_play_required ->
   customer_profile_required -> profile_fit_required` (carrying
   `interviewQueueDigest` for resumability) `-> complete` (carrying
   `fitKnowledgeVersionId`). Covered by both focused tests below.

5. **"Prove a blank non-Digitalrain workspace can reach its first usable
   profile without code/SQL edits or fixture-created authority, using the
   completed interview flow."** Proven at the domain layer, with no SQL or
   fixture bypass: `onboarding-repository.test.mjs`'s first case drives
   `Acme Marine` / `Fleet ONE` from zero workspaces through
   `initializeOwnerCompanyProduct` -> `createOnboardingDraft` (market play,
   then customer profile) -> a real interview loop
   (`advanceLocalInterview` / `submitInterviewAnswer` /
   `recordInterviewDecision`) to `status: "complete"` with a confirmed `fit`
   Knowledge Version, and explicitly asserts zero rows with
   `name LIKE '%Mining%'` (`onboarding-repository.test.mjs:31`) along the way.
   This is domain/handler-level proof only; it does not extend to the browser
   or to a hosted/production deployment (see **Boundary** below).

### Validation run at this head

Base `e0c93d2` (`origin/main`), from `site/`:

| Command | Result |
|---|---|
| `node --test tests/commercial-model-repository.test.mjs tests/onboarding-repository.test.mjs` | 4 pass / 0 fail, exit 0 |

The two suites cover: exact/inert Mining seed and generic-hierarchy parentage,
scope, and race enforcement (`commercial-model-repository.test.mjs`); blank
reads being pure, one resumable graph per owner, idempotent replay, rejection
of a second differently-named company with exact row counts, full progression
to `complete` through real interview calls, sibling-product addition after
completion, and a concurrent-initialization race producing exactly one
surviving graph with no orphans (`onboarding-repository.test.mjs`). No other
suite was run in this lane; broader/canonical `npm test` and the browser lanes
remain the responsibility of their respective owners and are not claimed here.

## Handoff — one defect outside this lane's ownership

`site/domain/interview.ts:1` still exports `PILOT_COMPANY_NAME = "Digitalrain"`,
and `bootstrapInterview` (`interview.ts:418-437`) unconditionally
`INSERT OR IGNORE`s a workspace named `"Digitalrain"` for whichever principal
calls it. This is wired live: `action: "bootstrap"` remains in the
`INTERVIEW_ACTIONS` allowlist and is dispatched at
`interview-handler.ts:77-78,175-176`, reachable from any admitted owner via
`/api/interview`. No current frontend code calls `action: "bootstrap"`
(confirmed by search across `site/app`), so it is currently unreached in
practice, but nothing prevents it being called (a stale client, a manual
replay, or future code), and no test asserts it is unreachable or disabled. If
triggered for an owner with no workspace yet, it silently creates a
`"Digitalrain"`-named workspace instead of routing them through generic
onboarding — a live violation of acceptance bullet 2, but in `interview.ts` /
`interview-handler.ts`, which is issue #9's owned territory
(its own evidence already points at `interview.ts:703` for a related
session-completion concern). Recorded here for the issue #9 owner to pick up;
not fixed in this lane.

## Boundary

No multitenancy, real identities/data, hosted, provider, account, credential,
outbound, or export effect was introduced, exercised, or proposed. No
migration, schema, `package.json`, Contacts, shell/UI, browser
suite/fixture, or shared planning document (`STATE.md`, `ROADMAP.md`,
`REQUIREMENTS.md`, `PROJECT.md`) was modified. This lane earns no plan or
phase completion credit and does not establish live/hosted acceptance; the
test results above are local and synthetic only.

## Recommendation

Close the generic-bootstrap/commercial-initialization portion of issue #5 as
already met by existing code on `main`, on the evidence above. Full issue
closure should still wait on:

- the `interview.ts` bootstrap escape hatch being closed or fenced under
  issue #9,
- browser-level proof of bullets 1 and 5 (`tests/browser/onboarding.spec.ts`
  is authored but unexecuted in this environment per
  [`2026-09-08-work-unit-e1-operator-journey.md`](2026-09-08-work-unit-e1-operator-journey.md)),
  owned by issue #11's browser-suite lane,

both outside this lane's ownership.
