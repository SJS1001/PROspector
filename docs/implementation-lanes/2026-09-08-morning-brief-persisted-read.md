# Morning Brief persisted-read candidate

**Recorded:** 2026-09-08
**Branch:** `claude/p7-morning-brief-persisted-read`
**Base:** `9746320` on `origin/main`, verified exact before any edit

This is a local candidate record, not a plan summary, phase-acceptance record,
provider authorization, hosted-evidence substitute, or permission to perform an
external effect. **No Phase 7 plan or phase credit is claimed and no
`07-xx-SUMMARY.md` was created.**

## Owned files

| File | Change |
| --- | --- |
| `site/domain/morning-brief.ts` | modified: independent sections; `profileName` split from persisted `profileLifecycle`; review-funnel section |
| `site/domain/morning-brief-read.ts` | new: SELECT-only persisted read |
| `site/tests/morning-brief-read.test.mjs` | new: 12 focused cases on a disposable D1 fixture |
| `site/tests/morning-brief.test.mjs` | modified: section-degradation, funnel and restore cases |
| `docs/implementation-lanes/2026-09-08-morning-brief-persisted-read.md` | new: this record |

No other file is touched. Specifically **no** `package.json`, `db/schema.ts`,
`drizzle/**` migration or journal, `worker/**`, `app/**`, route, UI, browser, or
Playwright file, and no shared test helper. `tests/helpers/d1.mjs` and
`tests/helpers/phase4.mjs` are read and imported, never modified.

## Schema and transaction ownership

**None, by construction.** This lane allocates no migration index, edits no
schema, opens no transaction, and issues no `INSERT`, `UPDATE`, `DELETE`, or
DDL. Every database statement is a `SELECT`, and a focused test asserts that by
scanning the module source. Plan 07-04's migration index remains unallocated and
free for whichever lane executes it.

## Prohibition check performed before editing

`07-PREPARATION.md` states, verbatim, that "Actually persisting those
transitions is Plan 07-04 work and is not authorized by this lane", and its stop
condition bars persistence outright. `07-04-PLAN.md` is additionally
non-executable while its `NNNN` migration placeholder stands, and it depends on
Plans 07-01/07-02/07-03, which each depend on Plan 06-10 — an `autonomous:
false` plan holding two blocking human gates, an independent pre-composition
review and an owner authorization naming a controlled Google/Gmail account and a
separately authorized greenfield deployment. No summary exists for any of them.

**This lane therefore creates no persistence.** It reads only records that the
checked schema already persists.

## What is actually persisted, and what is not

Available and authoritative:

- scope, from `workspaces` → `workspace_companies` → `companies` → `products`
  → `market_plays` → `customer_profiles`, plus the active
  `typed_configurations` row (`owner_type='profile'`, `kind='profile_effective'`,
  `active=1`) for the configuration digest;
- the Phase 4 recurring schedule, from `prospecting_schedules` joined to its
  `authority_commands` row;
- review-funnel counts, from `prospect_review_decisions`, `prospect_cooldowns`,
  and `prospect_reentry_events`. Migration `0007_profile_prospecting.sql`
  carries `prospect_review_immutable_update` and
  `prospect_review_immutable_delete` triggers plus cooldown and re-entry
  equivalents, so these are database-enforced append-only facts.

Genuinely absent, and reported unavailable rather than approximated:

- **the weekly Export-ready cohort.** `ExportReady` appears nowhere in
  `db/schema.ts`, `domain/`, `app/`, or any migration;
  `profile_prospects.state` admits only `qualified`, `approved`, `rejected`,
  `deferred`, `cooled_down`; no prospect state-transition history table exists;
  and `profile_prospects` carries no immutability trigger, so its state is
  mutated in place with no transition record. The repository already pins this
  in `tests/weekly-outcome-persisted-state-conformance.test.mjs`, which lists
  `ExportReady` in `UNBACKED_PROSPECT_STATES`;
- **handoff eligibility**, which needs Phase 5 verification and Phase 6 package
  and suppression authority, neither composed;
- **workspace origin**, which is not persisted at all. The section reports
  unavailable with `restoredEffectsFenced` left closed rather than assuming an
  original workspace.

## Corrected modelling defect

The projector previously typed `profileLifecycle` as `"Operating" | "Draft"`.
That conflated two distinct persisted facts: `domain/commercial-model.ts` seeds
profiles *named* `Operating` and `Greenfield`, while
`customer_profiles.lifecycle` is a separate `draft | ready | paused | archived`
enum. No domain evidence maps one onto the other, so the scope now carries
`profileName` and `profileLifecycle` separately and equates neither. The weekly
reducer keeps its own Operating/Draft vocabulary; the brief cross-checks only
the five stable identifiers against it and deliberately does not compare
lifecycles.

## Review counts are not outcomes

The funnel section is labelled with a fixed note, exposes
`countsExportReadyOutcomes: false`, and no arithmetic anywhere converts a review
decision into an Export-ready outcome. A focused case seeds five approvals
against an unavailable weekly section and asserts the two never meet.

## Validation

From `site/` on Node.js `v22.22.2` after a clean `npm ci`. Per the active
instruction, broad validation lanes were not re-run while the dedicated lanes
are live; this is focused evidence only.

| Command | Result |
| --- | --- |
| `node --test --test-concurrency=1 tests/morning-brief-read.test.mjs` | PASS 12/12 |
| `node --test --test-concurrency=1 tests/morning-brief.test.mjs` | PASS 11/11 |
| `node --test --test-concurrency=1 tests/outreach-preparation-boundary.test.mjs tests/weekly-outcome.test.mjs tests/weekly-outcome-persisted-state-conformance.test.mjs tests/morning-brief.test.mjs` | PASS 27/27 |
| `npx eslint` on all four touched files | clean |
| `npx tsc -p tsconfig.json` | no error attributable to these files |
| `git diff --check` | clean |

`tsc -p tsconfig.json` reports 287 pre-existing `Cannot find name 'D1Database'`
errors across `app/` and `domain/` because bare `tsc` does not supply the
Cloudflare ambient types the vinext build provides. `morning-brief-read.ts`
shares that pre-existing condition and introduces no error of its own.

Mutation checks, each reverted immediately, both modules byte-identical
afterwards:

| Mutation | Result |
| --- | --- |
| weekly section reports a zero cohort instead of unavailable | 9 pass, 2 fail |
| restore fence opens when workspace origin is absent | 10 pass, 1 fail |
| funnel decision/Prospect coherence check removed | 10 pass, 1 fail |
| scope query drops its owner filter | 10 pass, 1 fail |
| schedule reports enabled regardless of `execution_state` | 10 pass, 1 fail |
| distinct Prospect count replaced by the decision count | 10 pass, 1 fail |
| funnel query drops profile scoping | 11 pass, 1 fail |

The last mutation initially **survived**: the isolation case covered two
workspaces but not two profiles inside one. A sibling-profile case was added,
after which the mutation fails as it should.

## Status and remaining dependencies

Not composed into `worker/index.ts`, `app/`, or any route; nothing imports
`morning-brief-read.ts` except its own test. It is an unaccepted local
candidate in the same category as `domain/weekly-outcome.ts` and
`domain/crm-csv-codec.ts`, which `07-PREPARATION.md` records as
"Runtime-directory cores created outside this lane".

Remaining dependencies, neither of which this lane may satisfy:

1. **UI.** No owner surface renders this brief. That work touches
   `app/prospector-app.tsx` and the shell, currently owned by the Work Unit D
   operator-interface lane, and needs separate coordination.
2. **Persistence.** A usable weekly cohort needs the Plan 07-04 handoff/recovery
   schema and repository, blocked behind Plans 07-01/07-02/07-03 and Plan 06-10's
   owner and review gates.

## External-state statement

Local files and the local Node/Vite/Miniflare test path only. No Cloudflare, no
retired Sites project, no R2, no hosted service, no provider account, no
credential, no real identity or data, no export, delivery, Gmail, telephony,
prospecting, schedule mutation, archive, restore, or outbound communication. All
test data is synthetic and lives in a disposable in-memory D1 fixture.
