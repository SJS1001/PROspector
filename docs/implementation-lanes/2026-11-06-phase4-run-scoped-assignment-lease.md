# Phase 4 local correctness — run-scoped assignment / ingestion lease (04-04)

## Scope

Bounded local correctness for Plan `04-04` residual concurrency:

1. At most one **issued** runner assignment per `(workspace, run)` (partial unique index + tightened insert trigger).
2. At most one **complete** received submission per `(workspace, run)`.
3. Assignment reissue only after audited expiry of prior issued capability, or after trusted `partial_submission_retryable` terminal for consumed partials.
4. Trusted ingestion serializes per run: a second concurrent complete path cannot advance a second watermark/success for the same run.

No hosted Sites/D1/R2 proof, no provider credentials, no live data, no outbound, no schedules, no phase/plan acceptance credit.

## Overlap / attribution

- Independent branch from `origin/main` (`96981f4`).
- Design and SQL/domain shape adapted from open PR #114 (`codex/phase4-ingestion-integrity`, commits `aaf3f44` / `e8e2afe`) without rewriting that branch or merging it.
- Does **not** depend on unmerged PR #143 or #144.
- Does **not** claim PR #114 is obsolete; owner may close either after review.
- **Necessary adaptation:** PR #114 left fixtures on `applyMigrations` (0000–0009 only). This branch switches runner-assignment and prospecting-ingestion fixtures to `applyPersonDiscoveryMigrations` so `0021` unique indexes and rewritten triggers actually install; otherwise the new concurrent-reissue regression fails open (2 successors).
- Additional adaptations vs PR #114 (required once 0021 is actually installed):
  - Trigger abort regex accepts `exact exclusive run binding` (0021) as well as historical `exact mutable run binding`.
  - Neutral-capability race test expires the short-TTL issued capability before admitting a successor live assignment (exclusive active-run lease).
  - Greenfield runtime-config Access fixtures retargeted to checked-chain head `0021` identity/digest (same pattern as prior head-pin updates when the chain grows).

## Files

- `site/drizzle/0021_runner-ingestion-integrity.sql` + `meta/0021_snapshot.json` + journal entry `idx 21`
- `site/db/schema.ts` — `runner_assignment_active_run_unique`, `runner_submission_complete_run_unique`
- `site/domain/runner-assignment.ts` — expire-before-reissue; block issue when any received submission exists unless retryable partial
- `site/domain/prospecting-ingestion.ts` — run-scoped succeeded-submission guard; fail closed on conflicting complete
- Tests: `runner-assignment.test.mjs`, `prospecting-ingestion.test.mjs`, `migration-source-of-truth.test.mjs`

## Evidence (filled as gates complete)

- Focused: **pass** — `node --test tests/runner-assignment.test.mjs tests/prospecting-ingestion.test.mjs tests/migration-source-of-truth.test.mjs` → tests 34, pass 34, fail 0 (terminals/115353.txt, exit 0, ~126s).
- Lint: **pass** — `npm run lint` exit 0.
- Canonical `npm test` (first run, commit `a3e0a9d`): **failed** 3/N in `greenfield-runtime-config.test.mjs` with `release_migration_mismatch` because fixtures still pinned `canonical-chain-0020-…` while migration `0021` advanced the checked chain head. Log `/tmp/lease-canonical-115354.log` (suite hung after those failures; process killed).
- Follow-up: updated `site/tests/greenfield-runtime-config.test.mjs` pins to `canonical-chain-0021-runner-ingestion-integrity` / digest `acdcadbc…f02c79`. Focused greenfield 6/6, lease+ingestion+migration 34/34, lint pass.
- Canonical `npm test` (after pin fix): **RESTARTED** — do **not** treat as pass until terminal `exit_code: 0`. Log: `/tmp/lease-canonical-115357.log`.

## Non-claims

Local correctness / regression only. No Phase 4 acceptance, hosted proof, or runner transport activation.
