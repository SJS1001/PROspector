# Claude Cloud implementation transfer

**Prepared:** 2026-09-06
**Repository:** `https://github.com/SJS1001/PROspector.git`
**Branch:** `codex/generic-onboarding-integration`
**Integration checkpoint:** `165c6c7c8c8553863f24ad4e1d342d1d8cfdf8b8`
**Draft review:** `https://github.com/SJS1001/PROspector/pull/12`

## Cloud candidate status — 2026-09-06

The two initial cloud implementation lanes have produced clean, pushed
candidates. Neither candidate is integrated yet because its required executable
runtime proof is still missing. These are implementation candidates, not
acceptance evidence and not permission to consume the canonical preflight lane.

- **Work unit A:** branch `codex/issue-11-browser-foundation`, commit
  `a5be61d278872c8fe9f692a656a3fc2335484d9a`. GitHub verifies that this is one
  commit directly on transfer checkpoint
  `165c6c7c8c8553863f24ad4e1d342d1d8cfdf8b8`. Static foundation tests passed
  2/2, Playwright discovered one test, lint and lockfile dry-run checks passed.
  Executable Chromium proof remains missing: run `npm ci`, install the pinned
  Chromium runtime, and run `npm run test:browser` in an isolated capable cloud
  runner. Do not integrate until visible rendering, restart persistence,
  adversarial origin denial, and the post-run zero-effect verifier all pass.
- **Work unit B:** branch `codex/offer-readiness-workflow`, commit
  `6dca353d86cff93552fa32101e29a707f3d69c64`. GitHub verifies two commits
  directly ahead of the same transfer checkpoint. Repository-wide and focused
  lint plus diff integrity passed. The Miniflare-backed focused runtime tests
  were not executed, so stale-tab, race, rejection, rescope, and exact-lineage
  acceptance remain unproven. Run the focused unit/integration tests in a
  loopback-capable isolated cloud runner before integration.

The actual cloud task records are `6a9cbc45-99ac-83ea-af1b-5504b4727805`
(A) and `6a9cbc41-c2b8-83ea-a05e-d617b684c4f4` (B). They are coordination
locators only; Git branches, commits, and reproducible validation results remain
the durable authority. Do not launch duplicate A/B writers. Keep work unit C
serialized behind one schema owner, and start D only after validated B and C
are integrated.

This is the durable transfer from local Codex implementation to Claude Cloud.
Fetch the branch and require the exact clean integration checkpoint before
starting. Do not rely on chat history. Read `AGENTS.md`, `docs/CODEX-CONTINUATION.md`,
`docs/GREENFIELD-BASELINE.md`, `.planning/STATE.md`, `.planning/ROADMAP.md`, and
the plan/dependency records named there.

## Landed at the transfer base

- `6c5ba35` adds a pure, synthetic prospect-quality evaluator and pre-registered
  comparison protocol. Its final focused suite passed 15/15 and two adversarial
  reviews closed all exact-ratio, effort-time, timestamp, missingness, bounds,
  determinism, and runtime-isolation findings. It is runtime-unreachable and
  always reports `operationalAcceptance: false`.
- `3320f26` adds guarded generic LOCAL_DEMO onboarding: blank read-only setup,
  atomic Company + first Product authority, explicit first Market Play and
  Customer Profile, generic interview progression, and completion only after
  current confirmed Profile `fit` Knowledge. It removes runtime read seeding and
  the default user path into the legacy Mining fixture. Hosted onboarding remains
  activation-gated and fail closed.
- Integration-owner verification at `3320f26`: onboarding/request tests 3/3,
  UI/handler/interview tests 19/19, commercial/knowledge regressions 9/9,
  local-demo boundary 5/5, lint, and diff integrity all passed. The canonical
  full suite, production build, and real browser journey were intentionally left
  for cloud capacity.

## Cloud work unit A — onboarding browser proof

**Base:** `3320f2630d5a8bbd8617d1a674a272abf9a4e9ba`
**Scope:** issue #11 foundation, A0/A1 only.
**Files:** `site/package.json`, `site/package-lock.json`, new
`site/playwright.config.ts`, `site/scripts/run-browser-acceptance.mjs`,
`site/scripts/verify-browser-zero-effects.mjs`, browser specs, and
`docs/BROWSER-ACCEPTANCE.md`.

Pin Playwright and axe. Start the exact documented Vite/Miniflare command on a
reserved loopback port with a unique ignored state root; one worker, no reused
server, same-origin network deny, no HAR/storage state/cookie artifacts, and
failure-only synthetic screenshots. Prove visible hydration with no overlay,
then use only rendered controls and public routes to create Northstar / Harbor
Pulse / Port Operations / Bulk Terminal Operators, complete the generic fit
interview, reload/restart, and verify persistence plus zero forbidden-effect
rows. Do not add a seeder or authority backdoor. Keep `test:browser` separate
from canonical unit tests until stable. Dependency installation/browser download
is a visible cloud resource step, not provider activation.

## Cloud work unit B — Offer and readiness completion

**Base:** latest clean branch after A, or an isolated branch from `3320f26` if
files do not overlap A.
**Scope:** issue #9.
**Acceptance:** finish the supported Company/Product/Play/Profile question
sequence; explicit missing-evidence handling; correct continuation after Accept,
Reject, Correct, and Rescope; make Explore open an actionable interview; reach
the first Offer only through its confirmed-lineage contract; reach Product and
Profile readiness through supported screens. Prove reload, stale tabs, races,
rejection, and rescope without duplicate or silently confirmed knowledge.
Preserve separate answer and confirmation. Use synthetic local data only.

## Cloud work unit C — no-known-person discovery

**Base:** latest clean branch after onboarding; serialize its migration with any
other schema writer.
**Scope:** issue #6.
**Primary artifacts:** next available forward-only migration and schema snapshot;
new provider-neutral `person-discovery-port.ts`, `person-discovery.ts`, and
repository; Contacts handler/service/projection/UI extensions; focused domain,
integration, handler, and UI tests; implementation-lane record.

Add immutable discovery runs, bounded provenance-backed candidates, explicit
owner no-match/create-new/link-existing decisions, Prospect-to-Contact role
relevance, and distinct initial-verification versus stale-refresh intent. A
candidate is never a Contact and suggested/generated details never become
eligible. Production port remains unconfigured and command composition remains
reject-only; tests inject a zero-network fake. No Approved Prospect may be
manufactured by onboarding—the tests may use an explicit synthetic Phase 4
fixture. Prove replay/races, ambiguity, stale/foreign scope rejection, no-match
zero contact rows, refresh history, timeout no-auto-retry, zero unauthorized
writes/calls, and pagination-generation invalidation.

## Cloud work unit D — coherent operator interface

**Dependency:** B and C.
**Scope:** issue #8.
**Primary files:** `site/app/workspace-view.ts`, `prospector-app.tsx`, `page.tsx`,
new presentation-only `operator-context.ts` and shared task-state component,
existing Knowledge/Discovery/Prospecting/Contacts leaves, CSS, and focused UI
tests.

Show only real tasks: Status, Company & products, Market discovery, Review
prospects, Prospects, Contacts. Hide Morning Brief, Exports, global Search, and
runner placeholders until their services exist. Separate stable route IDs from
labels. Client context is presentation-only, clears descendants on parent
change, and never grants authority. Use plain-language state mappings and keep
technical IDs/digests in collapsed records. Preserve the Contacts disclosure
hold and all no-auto-retry/idempotency behavior.

## Cloud work unit E — full browser acceptance

**Dependency:** A through D plus local-only synthetic runtime seams for the
remaining research, contact, outreach approval, and CRM handoff services.
Extend A through prospect review, fictional person discovery/verification,
Package and Message approval without dispatch, and local CSV materialization.
Add two-tab stale conflict, lost-response reconciliation, CSRF expiry, restart
resume, axe/focus/reflow coverage, and a post-run database zero-effect verifier.
VoiceOver announcements and real 200% zoom remain a short manual evidence step.
Browser proof does not substitute for hosted principal, recovery, or live
provider acceptance.

## Authority and resource boundary

- Cloud implementation may use up to the owner-approved additional cloud
  capacity for independent non-overlapping worktrees. Use one schema owner at a
  time and one integration controller.
- Use efficient implementation/review models by default; reserve strongest
  reasoning for final security/integration assessment. Keep histories compact
  and transfer through commits, not chat.
- Never access the retired Sites project. Do not provision or mutate hosting,
  Access, accounts, providers, credentials, secrets, real data, schedules,
  exports to recipients, Gmail, telephony, calls, or outbound effects.
- Do not run the canonical preflight lane until the owner/controller releases
  it. Focused tests and isolated browser/local-runtime checks are permitted.
- Stage 3B hosted work and all real-principal/provider/production acceptance are
  separate owner gates and are not implied by this transfer.

## Exact next action

Launch Cloud work unit A from the clean transfer base while a separate read-only
cloud planner decomposes work unit B. Do not start migration work unit C until a
single schema owner is named and the current highest migration/journal state is
re-read from the integration branch.
