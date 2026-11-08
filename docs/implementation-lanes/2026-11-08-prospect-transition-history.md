# Prospect transition history on migration 0022

**Date:** 2026-11-08
**Base:** `origin/main` `cb0c690d227d0397e61c86fb15f034e3dfd524ee`
**Source shape:** open PR #118 at `2cbd14fe4fd358db5be3586ee1c0c962015653ac`, retargeted onto current main. The published branch `codex/prospect-transition-history` was not rebased, amended, or force-pushed.

## Why this is still relevant

`reduceWeeklyOutcome` counts the first transition to `ExportReady`, but `profile_prospects.state` only stores `qualified`, `approved`, `rejected`, `deferred`, and `cooled_down`. PR #118 added an owner-admitted ledger for the reducer's vocabulary. Merged `0021_runner-ingestion-integrity` already occupies journal index 21, so landing #118 unchanged collides. This slice keeps that merged migration and adds `0022_prospect-transition-history.sql`.

## What it does

- Append-only `prospect_transition_events`, tenant- and revision-bound, immutable under update and delete.
- `recordProspectTransition` admits one owner subject, replays an exact idempotency key, and conflicts when the same key changes.
- `readWeeklyOutcomeFromTransitionHistory` feeds the existing pure reducer. It does not export, persist a CRM file, or call a provider.
- `profile_prospects.state` is unchanged. `cooled_down` stays unmapped. `contact_linked` stays unbacked.
- The release manifest `02-99-MIGRATION-MANIFEST.md` is unchanged and still ends at `0019`. Hosted apply of `0022` is not authorized.
- No `07-04-SUMMARY.md`. Plan credit stays 26/74. Plan 07-04 remains the larger handoff/recovery schema and is not executed here.

## Reliability

Two different observations:

- On 2026-11-08 the existing post-init commercial race (`commercial hierarchy enforces exact parentage…`) passed three times, each in about 7 seconds, with both calls fulfilled. That does not explain or close the earlier 270-second run that fulfilled 1 of 2. The enrichment, contacts, and profile `ECONNRESET` / `other side closed` paths were not re-run and are not claimed fixed.
- A stronger probe, two `initializeCommercialModel` calls on an empty database, produced no result for more than 10 minutes. `workerd` stayed alive and the log stayed empty. The process was killed. Miniflare's D1 proxy was holding two overlapping writes on one loopback connection.

`site/tests/helpers/d1.mjs` now queues top-level operations per fixture database. A batch that calls statement methods reenters instead of waiting on itself. `ensureCompany`, `ensureProduct`, `ensurePlay`, and `ensureProfile` treat a unique-constraint failure as "read the winner" and still throw every other error. After that change, `concurrent first-time commercial initialization converges on one hierarchy` passed in 5.6 seconds: 2 fulfilled, 1 company, 1 `ONE` product. The diagnostic file passed 9/9 with 0 cancelled. That is not the reported 8-pass/1-cancelled pending-promise result, which was not reproduced.

## Focused proof before the canonical suite

`node scripts/run-test-suite.mjs` on the transition files, with `--test-concurrency=1` inside the runner, exited 0:

- `d1-runtime-diagnostics` 9/9, 0 cancelled
- `greenfield-runtime-config` 6/6
- `migration-source-of-truth` 15/15, including the 0022 snapshot chain and a clean full-chain install
- `prospect-transition-history` 4/4
- `weekly-outcome-persisted-state-conformance` 4/4
- `weekly-outcome` 9/9
- `zero-effects-verifier` 11/11
- `commercial-model-repository` 2/2 on that pass, then 3/3 after the queue

ESLint on the touched runtime and test files exited 0. The canonical `npm test` is a separate later run and is not claimed by this section until its exit code exists.
