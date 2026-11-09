# Issue #11 — browser acceptance run, 2026-11-09

**Repository:** `https://github.com/SJS1001/PROspector.git`
**Issue:** [#11](https://github.com/SJS1001/PROspector/issues/11)
**Branch:** `claude/issue-11-browser-journey-run` (local, not pushed)
**Base:** `5f53cb4` (origin/main `e6cfa70` plus the 2026-11-09 owner-authorization record)
**Validated head:** `bcc6935322616f4e92a51fbe6ac7f3d7b4935d06`
**Authority:** the 2026-11-09 owner authorization, local and synthetic only.
This record earns no plan credit, verifies no requirement, and makes no
hosted, identity, or provider claim.

## Environment

| Item | Value |
|---|---|
| Host | the owner's MacBook, macOS 27.0.1, arm64 |
| Node | v24.16.0 (the repository requires 22.13 or newer) |
| Playwright | 1.63.0 |
| Browser | Chromium headless shell revision **1243** (the revision pinned by `playwright-core/browsers.json`), copied into the lane cache `site/.local/playwright-browsers` from the user's Playwright cache. Nothing was downloaded. |
| Dependencies | `npm ci` from the local npm cache. The registry was not reachable from the sandbox and was not needed. |
| Executor | Claude Code subagent in an isolated git worktree. |
| Sandbox | Every browser lane binds a loopback port. Inside the command sandbox that bind fails with `listen EPERM 127.0.0.1`, so the lanes and the Vite-backed unit tests were run outside the command sandbox. No test or runtime was weakened to get around this. |

## Commands and results at `bcc6935`

From `site/`. These are real exit codes. The full `npm test` suite was **not** run,
because other agents were using this machine.

| Command | Result |
|---|---|
| `npm run build` | exit 0 (run at base. Neither commit touches source) |
| `npm run test:browser` (onboarding lane) | exit 0, **2 passed**, zero-effect verifier `forbiddenRows=0 objectRows=0 multipartRows=0` |
| `npm run test:browser:operator-journey` (E1 lane) | exit 0, **2 passed**, `persistenceDelta=0 externalEffects=0`, composition requests `GET,POST,POST,POST,POST,GET`, verifier `forbiddenRows=0 r2Objects=0 r2Multipart=0` |
| `npm run test:browser:person-discovery` (C4 lane) | exit 0, **1 passed**, verifier `forbiddenRows=0 r2Objects=0 r2Multipart=0` |
| `node --test --test-concurrency=1 tests/person-discovery-c4-boundary.test.mjs` | 6 pass / 0 fail |
| `node --test --test-concurrency=1 tests/browser-acceptance-foundation.test.mjs` | 5 pass / 0 fail |
| `node --test --test-concurrency=1 tests/local-demo-boundary.test.mjs` | 5 pass / 0 fail |
| `npx eslint` on the three changed files | exit 0 |
| `npx tsc --noEmit -p tsconfig.json` | exit 2 with 739 errors, none in `tests/browser/`. The package has no typecheck script, the errors come from the base tree, and this run did not investigate them. |

## Failures found and fixed

### 1. The C4 lane failed on its first run since PR #82

At base `5f53cb4` the onboarding and E1 lanes passed. **The C4 lane failed** at
`person-discovery-c4.spec.ts:74`. After the restart, the test expected a
`ContactReady` row under *Verified contacts*, but the screen showed none.

Diagnosis: a temporary probe read `/api/contacts` before and after the restart.
Both times the contact came back as `NeedsReview` with
`contact_attestation_unavailable`, so the restart was not the cause.
`domain/contacts-handler.ts:110` uses a settlement attestor only when the
immutable `controlled_enrichment` Phase 5 gate exists. The synthetic C4 consumer
must never create that gate:

- `tests/person-discovery-verification-consumer.test.mjs` asserts that
  `phase_activation_gates` is 0.
- `tests/person-discovery-c4-boundary.test.mjs` forbids the consumer from
  fabricating activation evidence.

The gate on the attestor came in at `bb57434` (Sept 5), before PR #82 (Sept 9).
PR #82 added both the browser assertion and a verifier expectation of
`phase_activation_gates: 1`. Both disagree with the code and with that PR's own
unit tests, and no browser run of this lane after #82 is recorded.

Fix (`2153fd8`, tests and verifier only, gate unchanged):

- The spec now pins the fail-closed projection. The Verified contacts list is
  empty, Eligibility shows exactly one `NeedsReview` row ending
  `contact_attestation_unavailable`, and no exact `ContactReady` text appears
  anywhere.
- `scripts/verify-person-discovery-c4.mjs` puts `phase_activation_gates` back in
  the forbidden (zero) set.

**Owner/runtime question left open:** the in-session notice still says
"ContactReady — fresh verified evidence is now persisted…", which comes from
the C4 verification endpoint's own result. Meanwhile the server's Contacts
recheck refuses to show it as ready. If the owner wants the C4 lane to *show*
ContactReady, the projection needs a deliberate dev-only attestor admission,
and that is a gate decision. This run did not make it. The notice copy belongs
to issue #8.

### 2. The local-handoff stage was reached but not asserted

The E1 composition journey reaches *Phase 7 · CRM handoff precondition* but
never asserted anything about it. Commit `bcc6935` adds assertions that the
supported screen shows 0 eligible rows, `Materialization: refused`, and the
no-export-payload statement. Only the eligible-row count is data-driven
(`crmPreview.realAdmissionCount`); the other two are fixed JSX copy in
`app/local-demo/_screen.tsx`. No handoff happens: this proves the refusal is
shown, not that a local handoff stage exists.

## Acceptance reconciliation

| # | Criterion | Status at `bcc6935` |
|---|---|---|
| 1 | Clean-workspace synthetic journey | **Not met.** onboarding → confirmed knowledge → readiness pass in the onboarding lane. Prospect review and exact approvals pass in E1 test 1. Fictional person/contact verification is **not accepted**: the C4 lane passes only because it now pins the fail-closed outcome (the Contacts projection is `NeedsReview` / `contact_attestation_unavailable`, never `ContactReady`). Local handoff is **not exercised**: E1 test 2 shows a refused CRM precondition, and two of its three new assertions check fixed copy. **Fake research run: not met.** `domain/research-run-journey.ts` is test-DI only, and its header says it must not be composed without the owner's amendment to Plan 04-08 Task 2. `.planning/LOCAL-DEMO-COMPOSITION.md` also forbids composing a runner or retrieval port. The stages run across three separate lanes, not one continuous workspace. |
| 2 | Supported screens, no direct authority insertion | **Partly met; needs owner review.** Onboarding and E1 seed starting state through dev-gated routes and drive transitions through the screens. C4 seeds an already-Approved Prospect, and its dev-only "Run local synthetic verification" endpoint writes `enrichment_grants`, `provider_quotes`, budget accounts, reservations and an eligible `ContactReady` snapshot outside the gated enrichment flow. That predates this branch and is dev-gated, but it is more than starting state. The C4 fix keeps the `controlled_enrichment` gate absent rather than inserting one. |
| 3 | Keyboard, focus, labels, announcements, contrast, zoom, layouts | **Automated checks pass at this head; C4's were not passing before it.** At base `5f53cb4`, onboarding and E1 passed, but C4 failed at spec:74 before its 360px reflow, Tab check and Axe ran. At `bcc6935` all lanes pass: Axe critical/serious = none, visible-focus walk, live-region announcements, 320px reflow and 200% text in E1, and 360px reflow plus Tab check in C4. No manual screen-reader test. |
| 4 | Stale tabs, interruption, expiry, uncertain operations, safe resumption | **Automated checks pass at this head; C4's were not passing before it.** E1 (CSRF expiry, lost response, 200/409 two-tab race, no retry, restart durability) passed at base and at `bcc6935`. The C4 two-tab 200/409 race and restart passed only after the `2153fd8` fix. |
| 5 | Record source, environment, evidence, failures, blockers | This document. |
| 6 | Separate gates preserved | Met. No gate was relaxed, and the C4 verifier now forbids `phase_activation_gates` again. |

## What remains unproven

- **The fake research run stage**, which needs the owner's decision on Plan 04-08 Task 2 and the local-demo boundary.
- **One continuous single-workspace journey** across all stages. Today it is three lanes.
- **Hosted identity acceptance.** No hosted target exists, and the owner has deferred it.
- **Live provider acceptance.** There are no credentials, and no spend limit is set.
- **The full canonical `npm test` and `npm run lint` at this head.** They were not run here.
- **Manual assistive-technology testing.** Only automated Axe and live-region checks ran.
- **Accepted contact verification.** C4 now pins a contradiction for the owner: the in-session notice says `ContactReady` was persisted, the DB holds an eligible `ContactReady` snapshot (verifier EXACT), and the server projection refuses it as `NeedsReview` with no activation gate. PR #82 had accepted `ContactReady` in the projection through a dev-only `localDemoAttestor` in `app/api/contacts/route.ts`, which `domain/contacts-handler.ts:110` ignores without the gate. Owner decision needed: admit a dev-only gate, or drop the attestor and fix the notice (copy belongs to issue #8).

## Boundary

No hosted, Cloudflare, Access, provider, credential, real-data, export, send,
call, or spend action. The retired Sites project was not accessed. No plan or
requirement status was changed, and no `*-SUMMARY.md` was created.
