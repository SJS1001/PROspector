# Phase 4 local correctness — trusted run queue admission

**Date:** 2026-11-06 (America/Toronto)  
**Branch:** `fix/phase4-trusted-run-queue-admission`  
**Base:** `origin/main` @ `96981f44f9a94a83cdd9f5582c3107c6ca0eff0d`  
**Independence:** Independent of open PR #143 (review replay/reentry). Does not stack on it.  
**Plans / handoff:** Handoff medium defect in `docs/PROSPECTOR-HANDOFF-2026-09-10.md` (direct SQL `blocked_missing_capability → queued`); related Plans `04-03` (intent-only schedule; unproven transport blocked) and `04-04` (assignment only after queued run).  
**Credit:** none — local correctness only; no Phase 4 summary, phase acceptance, hosted, provider, or effect authority

## Overlap note

Open PR #116 (`codex/trusted-run-queue-transition`) already contained this slice against an older base (~58 commits behind `main`). Related PR #114 covers the separate run-scoped assignment/ingestion lease medium and was left untouched. This branch re-applies the admission contracts on current `main` without modifying those remote branches and without merging them.

## Code changes

1. `site/domain/prospecting-run-admission.ts` (new)
   - Reject-only default port (`createRejectOnlyProspectingRunAdmissionPort`).
   - `admitProspectingRunToQueue` moves exactly one durable run from `blocked_missing_capability` to `queued` only after a trusted exact-tuple capability decision.
   - Persists immutable `authority_commands` + sanitized audit evidence; exact idempotent replay; race at one revision admits exactly one winner.
   - Performs no dispatch, retrieval, provider call, assignment issuance, or other external effect.

2. `site/tests/prospecting-run-admission.test.mjs` (new) — focused unit/regression coverage.

3. `site/tests/profile-prospecting-integration.test.mjs` — replaces the test-only direct SQL queue mutation with the audited admission seam and a synthetic local trusted port.

## Evidence

- Focused (re-verified 2026-11-06 America/Toronto): `node --test tests/prospecting-run-admission.test.mjs tests/profile-prospecting-integration.test.mjs` → **9/9 pass**.
- Lint: `npm run lint` → **pass** (same session).
- Canonical `npm test` (includes production build): **exit 0** verified 2026-11-06 (America/Toronto). Log `/home/box/.cursor/projects/workspace/terminals/115347.txt` footer: `status: succeeded`, `exit_code: 0`, `elapsed_ms: 3239374` (~54 min). No failing suites / `ELIFECYCLE` in that log.

## Explicit non-claims

- Does not create any `04-xx-SUMMARY.md` or Phase 4–7 plan credit.
- Does not satisfy Plans `02-99`, `03-09`–`03-11`, `04-11`/`04-12`.
- Does not compose a real scheduler, runner callback, provider, credential, live data, export, spend, or outbound path.
- Production composition remains reject-only until a separately authorized trusted adapter exists.
