# Cloud Morning Brief projector lane

## Scope

- Branch: `claude/p7-outcome-recovery-verifier`
- Base: `5c3440e11dc32beaed7dfc3d6e1bf11aafd3945c` on
  `origin/codex/generic-onboarding-integration`, verified exact before any edit
- Owned files (no shared file is touched):
  - `site/domain/morning-brief.ts`
  - `site/tests/morning-brief.test.mjs`
  - `docs/implementation-lanes/cloud-morning-brief.md`

This lane does not edit `site/package.json`, `site/db/schema.ts`, any
`site/drizzle/**` migration or journal entry, `site/worker/**`,
`site/scripts/run-test-suite.mjs`, `.planning/ROADMAP.md`, `.planning/STATE.md`,
`docs/CODEX-CONTINUATION.md`, or any phase preparation/plan record. The suite
runner discovers `tests/*.test.mjs` by directory listing, so the new focused
suite needed no shared-runner change.

## Gap selected

`2026-09-05-completion-inventory.md` records Phase 7 as `0/10` plans with "CSV
and weekly cores only", and names the missing Morning Brief as remaining work.
`site/domain/weekly-outcome.ts` and `site/domain/crm-csv-codec.ts` exist as
independent cores, but nothing composed the weekly cohort with the upstream
schedule state, the handoff readiness counts, or the restored-workspace fence.
The `07-CONTEXT.md` Recurring-schedule authority allocation and the
`07-UI-SPEC.md` Morning Brief reading order specify that composition precisely,
and every one of its invariants is decidable offline from supplied values.

This lane implements that composition and nothing else. It is deliberately the
reporting/preview/recovery-state seam rather than any of the gated capabilities:
it creates no export, reads no eligibility row, touches no target, and claims no
recovery.

## Interface and behavior

`composeMorningBrief(input)` is a pure reducer. It accepts a brief scope
(generic Workspace/Company/Product/Market Play/Profile IDs, `Operating` or
`Draft` lifecycle, active configuration digest), an exact UTC `asOf` instant, a
weekly-outcome history snapshot, an optional upstream schedule observation, an
optional counts-only handoff readiness preview, a workspace origin, and bounded
Greenfield profile notes.

Composition with the existing weekly core:

- The brief never accepts a caller-supplied weekly projection. It binds the
  supplied history to its own scope and `asOf`, then derives the projection by
  calling `reduceWeeklyOutcome` itself, so a forged `status: "available"` object
  cannot be injected. A forged projection fails closed as
  `weekly_outcome_unavailable` with the reducer's own reason codes.
- Scope or `asOf` divergence between the brief and the history returns
  `weekly_history_scope_mismatch` or `weekly_history_as_of_mismatch`; neither
  reports a zero outcome.
- The weekly panel carries the target of seven, the Monday–Sunday local week
  with its UTC offsets, the first-transition cohort with audit references, and
  the fixed explanatory sentence required by `07-UI-SPEC.md`. The ten funnel
  losses stay in a separate panel and never increase the cohort.

Schedule reporting (Phase 4 remains the sole authority):

- The definition is fixed at `weekdays · 06:00 · America/Toronto` with upstream
  authority `phase4_profile_readiness`. The panel is
  `changeableFromThisSurface: false` and there is no activation entry point.
- A definition mismatch, foreign profile, configuration digest drift, wrong
  upstream authority, future observation, or an observation older than 24 hours
  returns `blocked` with sorted reason codes and `reportedState: null`. A
  missing observation returns `unknown`. A blocked or unknown schedule panel
  does not suppress the weekly outcome.

Restored-workspace fence:

- A restored workspace without a fresh upstream activation reports
  `disabled_pending_fresh_upstream_activation` and `reportedState: "disabled"`
  even when the observation carried `enabled`.
- An activation only counts when it is strictly after the restore instant and
  at or before `asOf`; otherwise the target stays pending.
- `restoredEffectsFenced` stays true for a restored workspace regardless of
  activation, and `authority.verifyRecovery` / `authority.applyRestore` /
  `effects.restoresApplied` are permanently false/false/zero. Nothing here
  verifies an archive, decrypts an envelope, inspects a target, or asserts that
  any recovery happened.

Handoff readiness preview (counts only):

- The preview carries a snapshot reference, evaluation time, four counts, the
  closed eleven-reason exclusion ledger, and configuration/package/suppression
  dependency references. It carries no row, contact value, CSV byte, artifact
  checksum, delivery handle, or provider handle.
- The unique eligible Prospect count may never exceed the eligible contact-row
  count or the Export-ready population, and rows require at least one Prospect.
  A stale, future-dated, configuration-drifted, self-inconsistent, or absent
  preview returns `blocked` with `counts`, `exclusions`, and `dependencies` all
  null rather than a partially trusted number.
- `materializableFromThisSurface` is always false.

Fail-closed input handling: exact record shapes, dense arrays, accessor and
proxy-reported accessor descriptors, symbol keys, non-plain prototypes, extra or
missing fields, malformed digests/instants, fractional/negative/over-cap counts,
duplicate or self-referential Greenfield profiles, and identifier-shaped raw
contact values (an address separator or a phone-length digit run in any accepted
ID or label) all reject. Every result — available or not — is deeply frozen and
carries the all-false `authority` and all-zero `effects` records.

## Authority boundary

- No database, repository, route, persistence, scheduler, runner, provider,
  export, delivery, archive, restore, environment, filesystem, or network port.
  The module's only import is `./weekly-outcome`; a focused test asserts that.
- Not composed into `site/worker/**`, `site/app/**`, or any route. No runtime
  surface imports it.
- No preparation-only module is imported, and no preparation module was added.
  The Phase 7 preparation lane stop condition in `07-PREPARATION.md` closes that
  synthetic-placeholder line; this is a domain candidate in the same category as
  the existing `weekly-outcome.ts` and `crm-csv-codec.ts` cores, not a
  replacement for Plan 07-02 or later execution.
- An `available` brief describes the supplied values. It is not evidence that a
  transition, schedule state, eligibility snapshot, or restore is real, and it
  earns no Phase 7 plan or phase credit. No `07-xx-SUMMARY.md` was created.

## Validation

All commands from `site/` on Node.js `v22.22.2` after a clean `npm ci`.

| Command | Result |
| --- | --- |
| `node --test --test-concurrency=1 tests/morning-brief.test.mjs` | PASS 9/9 |
| `node --test --test-concurrency=1 tests/morning-brief.test.mjs tests/weekly-outcome.test.mjs tests/crm-csv-codec.test.mjs tests/outreach-preparation-boundary.test.mjs tests/phase7-preparation-weekly-outcome.test.mjs` | PASS 41/41 |
| `npx eslint domain/morning-brief.ts tests/morning-brief.test.mjs` | PASS |
| `npx tsc --noEmit --strict --target ES2022 --lib ES2022,DOM --module ESNext --moduleResolution Bundler --skipLibCheck domain/morning-brief.ts` | PASS |
| `npm audit --omit=dev` | 0 vulnerabilities |
| `git diff --check` | clean |

The static composition guard in `tests/outreach-preparation-boundary.test.mjs`
passes with the new domain file present, proving it introduces no provider,
effect, or preparation-import pattern into the scanned runtime tree.

Mutation check of the focused suite (each mutation reverted; the committed
module is byte-identical to the pre-mutation file):

- removing the restored-target schedule fence fails it;
- letting a blocked handoff panel emit its counts fails it;
- disabling the raw-identity fence fails it;
- dropping the weekly `asOf` binding fails it.

## External-state statement

This unit used only local files and the local Node/Vite test path. It did not
touch Cloudflare, the retired Sites project, R2, D1, a hosted service, a
provider account, credentials, real identities or data, exports, delivery,
Gmail, telephony, prospecting, schedules, archives, restores, or outbound
communication. No storage was written outside the repository worktree and the
local build output. No owner gate was consumed or claimed.
