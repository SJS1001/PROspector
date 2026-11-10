# Canonical test-runner observability (`--no-bail`)

**Date:** 2026-09-07
**Branch:** `claude/test-runner-no-bail`
**Base:** `codex/generic-onboarding-integration` at
`897159419d51300aae6bfe473e015bc651a9b49e`
**Owned files:** `site/scripts/run-test-suite.mjs`,
`site/tests/run-test-suite.test.mjs`, this record.

This is local test-tooling work. It earns no plan or phase completion credit and
changes no hosted, provider, credential, real-data, export, or outbound
authority. The retired Sites project was not accessed and no preflight lane was
run.

## Gap

`site/scripts/run-test-suite.mjs` stopped at the first failing file, so canonical
`npm test` could never report the state of the whole suite in one pass. The
recorded consequence is in `.planning/STATE.md`: the migration source-of-truth
validation had to be gathered "in three segments totalling 155, 34, and 537
passing cases" purely because the runner halts. Every lane that hits an
unrelated pre-existing failure pays the same cost, and the files after the
failure had no recorded status at all — they were neither passing nor named.

## What changed

### Opt-in continuation

`--no-bail` runs every remaining file in the same order after a failure. The run
still exits non-zero, no file is ever re-run, and no failure is downgraded. The
flag is opt-in: with no flag the runner still stops at the first failing file.

### Per-file results

Both modes now print one line per file after the inherited child output:

```
Test suite results: 3 files · 1 passed · 1 failed · 1 not run
  PASS      tests/a.test.mjs
  FAIL(1)   tests/b.test.mjs
  NOT RUN   tests/c.test.mjs

Stopped at the first failing file. Re-run with --no-bail to execute the
remaining files in the same order; failures are still reported and never retried.
```

A file the run never reached is reported as `NOT RUN`, never as a pass. That
distinction is the point: the previous output left those files silent.

### Argument validation

Flags are now separated from paths. An unknown option, an empty path, or a
requested file that does not exist is a usage error that exits **2** before any
file runs, so a malformed invocation is distinguishable from a genuine suite
failure (which keeps the failing file's own exit code). `--` ends option
parsing. Previously an unknown option was treated as a file name and surfaced
several steps later as an unhandled `ENOENT` rejection.

### Fail-open closed: nested test context

`node --test` refuses to run test files when it detects an inherited
`NODE_TEST_CONTEXT`, and **exits zero for the files it skipped**. A runner
invoked from inside another test therefore reported a clean pass for work that
never executed. The runner now clears that marker for its children.
`tests/run-test-suite.test.mjs` covers it directly, and every other case in that
file depends on the fix, since they all spawn the runner from within
`node --test`.

## Preserved exactly

- **Default fail-fast.** Without `--no-bail` the loop still stops at the first
  failing file; the files after it are not scanned, not executed, and not
  throttled against.
- **Aggregate exit code.** `process.exitCode` is the first failing file's own
  status. In default mode only one failure can occur, so this is identical to
  the previous `process.exitCode = status`.
- **Serial execution.** Children still run `--test --test-concurrency=1`, one
  file at a time.
- **macOS drain window.** The `process.platform === "darwin"` guard, the
  12-fixture window, and the 30-second drain are unchanged, and the not-run
  branch short-circuits ahead of the fixture scan so a skipped file cannot
  consume the window.
- **Existing invocations.** `npm test` and `npm run test:phase3` pass no flags
  and behave as before.

## Coverage

`site/tests/run-test-suite.test.mjs` — 11 cases. Fixtures are written into
`site/.local/` (already git-ignored, and outside `tests/` so the runner's own
directory discovery can never pick one up) and removed in a `finally`. Each
fixture appends its own name to one marker file, so a skipped file and a
silently retried file are both observable rather than inferred.

| Case | Proves |
|---|---|
| default stop | third file is `NOT RUN`, exit 1, marker holds exactly the first two |
| `--no-bail` continuation | all four files run once in order, exit still non-zero |
| several failures | one non-zero aggregate, both failures reported |
| first failing status | source-pinned (see limitation below) |
| selected passing set | only the selection runs, exit 0, no directory fallback |
| `--` | ends option parsing |
| unknown option | exit 2, usage text, no file runs |
| missing file | exit 2, fails closed before any file runs |
| empty path | exit 2 |
| nested test context | files execute instead of reporting a silent pass |
| serial + drain window | `--test-concurrency=1`, darwin guard, 12-window, 30s delay, not-run branch ordering |

**Limitation, stated rather than worked around:** `node --test` exits 1 for
every kind of failure, including a test file that calls `process.exit(3)`. A
second distinct status cannot be produced through a fixture, so "only the first
failing status is kept" is pinned at the source rather than asserted through an
exit code the runner can never observe. This was verified empirically before the
case was written.

## Validation

Node.js `v22.22.2` (repository minimum is 22.13). Run against this branch.

- `cd site && npm ci` — 514 packages, clean.
- `node --test --test-concurrency=1 tests/run-test-suite.test.mjs` — **11/11**.
- `npm run lint` — **clean** (repository-wide, unchanged config).
- Real-suite regression through the modified runner, 14 alphabetically-first
  suites: `node scripts/run-test-suite.mjs --no-bail tests/browser-acceptance-foundation.test.mjs … tests/contact-receipt-binding-integrity.test.mjs` — **14 files · 14 passed · 0 failed**, exit 0. This slice includes Miniflare/D1 fixture suites, so serial execution and the fixture accounting are exercised on real subjects.
- Real passing selection: `weekly-outcome`, `crm-csv-codec`,
  `phase7-preparation-csv-policy-definition` — 3 passed, exit 0.
- Default versus `--no-bail` on the same real three-file set with dependencies
  deliberately absent: default reported `1 failed · 2 not run` and exited 1;
  `--no-bail` reported `3 failed` and exited 1. The failures there were the
  absent `node_modules`, not a code result; the comparison is included only
  because it exercises both control paths on real paths.

### Not run, and why

- **Canonical `npm test` was not run.** It builds and then executes 120+ suites,
  and `.planning/STATE.md` records two failures on this base that this lane does
  not own — `production-bundle-boundary` case 3 (in-flight build-boundary work)
  and a `contact-verifier-batch-integrity` flake. Running it would neither
  validate this change nor be attributable to it, and other writers have
  validation in flight.
- **Browser lanes were not run.** They are environment-blocked on this image
  (pinned Chromium revision unavailable) and are unrelated to this change.
- `npm audit` was not run; no dependency changed.

## Boundary

No shared document was modified: `.planning/STATE.md`, `.planning/ROADMAP.md`,
`docs/CODEX-CONTINUATION.md`, and every other writer's files are untouched. This
lane owns only the two files above and this record. The branch is pushed as a
candidate for independent review; it was not merged, self-approved, or opened as
a pull request, and no other lane's validation was interrupted.
