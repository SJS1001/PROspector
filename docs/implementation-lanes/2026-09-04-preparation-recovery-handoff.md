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

## 2026-09-05 continuation on `codex/cloud-p6-outreach-recovery`

- **Base:** `codex/cloud-wave1-integration` at
  `ba697b73b9b53f6c48788006b757ea464085f7dd`, verified exact before any edit.
- **Branch:** `codex/cloud-p6-outreach-recovery`, created from that SHA.
- **Scope:** sole schema/journal/outbox writer for this lane; no provider or
  runtime composition, no hosted action, no merge to `main` or the integration
  branch.

The candidate described above is no longer an uncommitted worktree: it was
checkpointed in `cb2fe6a` and the staged-migration compatibility fix from the
"exact next action" landed in `ba697b7` as `readDispatchAttemptPreparationForLease`
plus `isMissingPreparationTable` in `site/domain/outbox.ts`. The two
upgrade-boundary tests that failed at the stop now pass.

### Adversarial regression added

`site/tests/outreach-persistence.test.mjs` gains one test, *lease compatibility
catch admits only the exact missing preparation table and rethrows every
unrelated database error*. It wraps the disposable D1 binding in a statement
interceptor (`interceptStatements`) that faults exactly one statement pattern per
run and counts the fault, so no case can pass vacuously. Against a fully
migrated fixture holding an expired inert attempt it proves:

- the intact read blocks a fresh lease (`lease_unavailable`);
- the exact `no such table: outreach_dispatch_attempt_preparations` condition,
  including below a two-level D1 `cause` chain, is read as the pre-0016 state
  and the 0017 database lease fence still blocks the lease with zero effect;
- every unrelated failure is rethrown by identity with zero effect: the missing
  0017 lifecycle table, a longer table name sharing the prefix, a
  schema-qualified `main.` reference, a missing joined table, a missing column,
  `SQLITE_BUSY`, a constraint failure naming the table, a `TypeError`, a cyclic
  `cause` chain (proves the bounded walk terminates), an unrelated `cause`
  chain, a plain object and a string primitive carrying the exact message,
  synchronous and asynchronous throws;
- the catch is scoped to the preparation read only: the same exact message
  raised by the latest-event read or by the lifecycle read is rethrown;
- the catch belongs to the lease path only: `voidExpiredDispatchPreparation`
  and `reprepareDispatchAttempt` rethrow the exact condition;
- afterwards the database is intact: explicit expiry void reopens exactly one
  new lease generation.

### Migration 0017 recovery inspection

Inspected `site/drizzle/0017_governed-outreach-preparation-recovery.sql`, the
`outreach_dispatch_attempt_preparation_events` definition in
`site/db/schema.ts`, `site/drizzle/meta/0017_snapshot.json`, `_journal.json`,
and the repository recovery paths (`claimDispatchLease`,
`voidExpiredDispatchPreparation`, `reprepareDispatchAttempt`,
`verifyDispatchPreparationLifecycle`).

Static review found no recovery defect: the void guard, repreparation guard,
recreated lease fence, voided-terminal fence, sequence/kind/reason/time/digest
checks, self-FK, and immutability triggers agree with the application-level
canonical digest chain and with each other. Metadata is aligned: the table and
index DDL that `drizzle-kit generate` derives from `db/schema.ts` matches the
0017 SQL line for line, the generated snapshot for every table equals
`0017_snapshot.json`, `prevId` chains to the 0016 snapshot id, and journal entry
17 is the last entry with a monotonic `when`.

A throwaway empirical probe (not committed) exercised sequences beyond the
committed tests and every outcome matched the intended design:

- void gen 1, lease gen 2 with a receipt but no repreparation, lease gen 2
  expires, lease gen 3 claims, receipt gen 3, repreparation against the gen 1
  void succeeds; a stale repreparation against the gen 2 receipt is blocked;
- the 0016 `prepareDispatchAttempt` path on a recovered item is blocked
  (`attempt_unavailable`), never a cross-path replay;
- an early claim by another worker, a same-holder claim replay after
  repreparation, a post-expiry claim without a void, and a void with a stale
  expected generation are all blocked; the correct void succeeds and a later
  void call replays the same event;
- a hand-written `failed_before_dispatch` event after expiry is rejected by the
  outbox event trigger, so the pre-void stale-terminal path is unreachable.

One staged-boundary behaviour is deliberate and unchanged: on a database at
0016 that already holds a preparation but not migration 0017,
`claimDispatchLease` throws `no such table:
outreach_dispatch_attempt_preparation_events` rather than returning
`lease_unavailable`. The 0016 fence blocks that lease at the database level in
either case, the repository is runtime-unreachable, and widening the catch to a
second table would contradict the closed compatibility rule the regression now
locks. The regression asserts that this error is rethrown.

No change to `site/domain/outbox.ts`, `site/db/schema.ts`, the 0017 SQL,
snapshot, journal, or fixture was required.

### Validation evidence
All on the local disposable D1/Miniflare path, from `site/`:

- baseline before edits, `node --test tests/outreach-persistence.test.mjs
  tests/migration-cloudflare-importer-compatibility.test.mjs`: 49 tests,
  49 passed, 0 failed (702547 ms);
- the same command with the new regression: 50 tests, 50 passed, 0 failed
  (713135 ms);
- mutation check of the regression (each mutation reverted afterwards, the
  committed `outbox.ts` is byte-identical to the base): swallowing every error
  fails it, loosening the match to `no such table` fails it, and dropping the
  `cause` walk fails it;
- touched-file ESLint for `domain/outbox.ts`, `db/schema.ts`,
  `tests/helpers/outreach-fixture.mjs`, and `tests/outreach-persistence.test.mjs`:
  clean;
- `git diff --check`: clean;
- migration metadata: `_journal.json`, `0016_snapshot.json`, and
  `0017_snapshot.json` parse; `drizzle-kit generate` against the committed
  metadata reports no schema changes; a generate into a scratch directory
  produced table and index DDL equal to the 0017 SQL and a snapshot equal to
  `0017_snapshot.json` for every table.

### External-state statement

This unit used only the local disposable D1/Miniflare test path and a
throwaway `drizzle-kit` scratch output. It did not use CI runners, the
preflight lane, Cloudflare/Sites, a hosted service, a provider account,
credentials, real identities or data, exports, Gmail/telephony, prospecting, or
outbound communication.
