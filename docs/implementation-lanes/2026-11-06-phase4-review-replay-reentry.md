# Phase 4 local correctness — review replay, reject re-entry, candidate key binding

**Date:** 2026-11-06 (America/Toronto)  
**Branch:** `fix/phase4-review-replay-reentry-keybinding`  
**Base:** `origin/main` @ `96981f44f9a94a83cdd9f5582c3107c6ca0eff0d`  
**Plans referenced:** `04-07` (review/cooldown/re-entry contract); handoff defects from `docs/PROSPECTOR-HANDOFF-2026-09-10.md`  
**Credit:** none — local correctness only; no Phase 4 summary, phase acceptance, hosted, provider, or effect authority

## Overlap note

Open PR #124 (`grok/phase4-review-replay-reentry`) already contained this slice against an older base (57 commits behind `main`). Related open PRs #112/#113 overlap partially. This branch re-applies the same contracts on current `main` without modifying those remote branches and without merging them.

## Code changes

1. `site/domain/prospect-review.ts`
   - `decideQualifiedProspect` looks up idempotency before mutable qualified-state checks so an exact successful owner retry replays after approve/reject.
   - Rejected prospects may re-enter on Material Signal, after 90-day cooldown expiry (`review_date_due`), or via sourced disproof (Plan 04-07). Ordinary evidence during an active cooldown still fails closed.

2. `site/domain/profile-readiness.ts`
   - Candidate create/activate replay only when the supplied idempotency key owns the same operation digest.
   - Same digest / different key conflicts instead of returning another caller's resource.
   - Activation winner lookup can bind an owned `authority_command_id`.

3. Tests
   - `site/tests/profile-prospecting-contract.test.mjs` — exact replay, changed-payload conflict, candidate key ownership, reject cooldown expiry re-entry.
   - `site/tests/prospecting-ingestion.test.mjs` — Material Signal re-entry during cooldown, then separate sourced-disproof path after clearing the successor.

## Evidence

- Focused: `node --test tests/profile-prospecting-contract.test.mjs tests/prospecting-ingestion.test.mjs` → **17/17 pass** (recorded before canonical gate).
- Lint: `npm run lint` → pass.
- Canonical `npm test` (includes production build via `npm run build && node scripts/run-test-suite.mjs`): **exit 0** on 2026-11-06 (America/Toronto). Terminal evidence: `/home/box/.cursor/projects/workspace/terminals/115346.txt` (`status: succeeded`, `elapsed_ms: 3256720`). No `fail N` suite summaries with N>0 and no assertion failures in that log.

## Explicit non-claims

- Does not create `04-07-SUMMARY.md` or any Phase 4–7 plan credit.
- Does not satisfy Plans `02-99`, `03-09`–`03-11`, `04-11`/`04-12`, or any hosted/provider/second-principal gate.
- Does not compose providers, credentials, live data, exports, schedules, or outbound effects.
