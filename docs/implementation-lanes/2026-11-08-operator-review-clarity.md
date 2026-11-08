# Operator review clarity — 2026-11-08

Base: PR #152 head `53ef14a42c52b2c5fb510738c4aedee24c26f8ab`. Product code under test for the socket reruns remains `c440ac76f56fdd70c205ced44171854d9c3cabd4` plus this operator-only change. Plan credit stays 26/74.

## Socket diagnosis

Each named historical failure was run twice, serially, with `PROSPECTOR_D1_DIAG=1` and `--test-concurrency=1`. Both passes exited 0. No `ECONNRESET`, `fetch failed`, or `other side closed` appeared in the logs.

| Test | Historical signature | Pass 1 | Pass 2 |
|---|---|---|---|
| overlapping enrichment reservations | ~106s, `read ECONNRESET` | 18.6s, exit 0 | 18.6s, exit 0 |
| forged enrichment assignment digests | ~316s, `SocketError: other side closed` | 16.7s, exit 0 | 16.7s, exit 0 |
| contacts 21-row high-water | ~303s, `read ECONNRESET` | 9.9s, exit 0 | 9.9s, exit 0 |
| validated partial callback replay | profile lifecycle failure on an earlier #145 run | 11.5s, exit 0 | 11.2s, exit 0 |

These passes do not identify the cause of the earlier stalls and are not a fix. The empty-database commercial init hang fixed on PR #152 is a separate, observed proxy stall.

## Review and navigation

Before: Approve, Reject, and Review later were clickable with an empty reason. The reason field used `required` outside a form, so the browser did not block the click. The server then rejected it. Locked journey steps used the same navigation treatment as ready steps.

After: those three actions stay disabled until the trimmed reason is present, and Review later also waits for a parseable date. The hint is associated with the controls. A pending save is a status message. Locked navigation keeps its destination and adds the existing gate in the accessible name plus a visible Later mark. The review count is part of the accessible name when the queue is open.

Component doubles in `operator/acceptance/keyboard/component-focus.test.mjs` passed 7/7, including rejection Cancel and Escape after a reason is entered, and the empty-reason click submits nothing. `review-gates.test.ts` passed 3/3.

Operator `npm ci` failed because `package-lock.json` is missing `lru-cache@11.5.3`. The dev server was not started, and no browser screenshot was captured. That is a lockfile environment gap, not a rendered-journey failure.
