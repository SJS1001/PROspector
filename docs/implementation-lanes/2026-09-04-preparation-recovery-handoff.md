# Phase 6 preparation-recovery stop handoff

**Stopped:** 2026-09-04 at owner request  
**Branch:** `codex/cloud-wave1-integration`  
**Committed base:** `4ff718669a7539122abeebd0a9411dbc1aa25760`  
**Worktree:** intentionally dirty; do not discard or overwrite the files listed below

## Uncommitted candidate

The worktree contains an unfinished, local-only migration `0017` candidate for
append-only void/reprepare recovery of an expired inert dispatch preparation.
It remains provider-free, runtime-unreachable, and zero-effect. No commit or
push was made after the stop request.

Modified or untracked files:

- `site/db/schema.ts`
- `site/domain/outbox.ts`
- `site/drizzle/meta/_journal.json`
- `site/drizzle/0017_governed-outreach-preparation-recovery.sql` (untracked)
- `site/drizzle/meta/0017_snapshot.json` (untracked)
- `site/tests/helpers/outreach-fixture.mjs`
- `site/tests/outreach-persistence.test.mjs`

The candidate currently adds:

- one immutable lifecycle-event table with only
  `voided_before_invocation` and `reprepared_no_invocation` events;
- exact expiry, lease-generation, owner, current-authority, suppression and
  unsafe-history database fences;
- an application-level canonical digest-chain verifier so a structurally valid
  forged database event cannot reopen recovery through the repository;
- closed-input repository methods for explicit expiry void and fresh-receipt
  repreparation;
- focused upgrade, two-cycle, concurrency, hostile-input, forgery,
  immutability, stale-terminal and changed-authority tests.

Independent schema and security reviewers reported no remaining high or medium
static finding after three corrections: typed self-FK inference, exact workspace
owner matching on void, and a stale terminal-event fence after void.

## Validation evidence at stop

Passed before the complete focused lane:

- touched-file ESLint for `domain/outbox.ts`, `db/schema.ts`, the fixture and
  persistence test;
- migration metadata JSON parsing;
- `git diff --check`;
- migration-only smoke: 1/1;
- new focused recovery tests: 4/4 across the upgrade, two-cycle,
  forged-digest/stale-terminal, and denial cases.

The complete focused command finished (it is not still running):

```text
node --test tests/outreach-persistence.test.mjs tests/migration-cloudflare-importer-compatibility.test.mjs
49 tests: 47 passed, 2 failed, duration 433723 ms
```

Both failures have the same diagnosed staged-schema compatibility cause:
`claimDispatchLease` now queries `outreach_dispatch_attempt_preparations`
before migration `0016` exists in the two upgrade-boundary tests. Exact error:

```text
D1_ERROR: no such table: outreach_dispatch_attempt_preparations: SQLITE_ERROR
```

Failing tests:

1. `0016 upgrades populated 0015 state without inferring an attempt and can prepare the current receipt`
2. `0015 fences a legacy dispatching history from retry and receipt authority`

## Exact next action

Resume in this same worktree. Add a narrowly scoped optional preparation-table
read for `claimDispatchLease` that treats only the verified SQLite/D1
`no such table: outreach_dispatch_attempt_preparations` condition as the
pre-0016 migration state; rethrow every other database error. Do not weaken the
post-0016 canonical lifecycle check. Then rerun the two failed tests, the four
new recovery tests, touched lint/diff checks, and finally the complete focused
outreach/importer lane. If green, update the Phase 6 persistence documentation
and continuation ledger, obtain final independent review, then commit and push
one cohesive candidate.

## External-state statement

This interrupted unit used only the local disposable D1/Miniflare test path.
It did not use CI runners, the preflight lane, Cloudflare/Sites, a hosted
service, a provider account, credentials, real identities/data, exports,
Gmail/telephony, prospecting, or outbound communication.
