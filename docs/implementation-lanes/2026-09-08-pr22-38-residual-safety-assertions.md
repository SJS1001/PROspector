# PR22/PR38 residual safety assertions — implementation note

**Date:** 2026-09-08
**Base:** `origin/main` at `f490555da8df5d1c91ba5b59e755990d9e31e6f8`
**Scope:** `site/tests/fixture-safety.test.mjs`, `site/tests/rendered-html.test.mjs`, and this record

## What this is

Tests only. No production, runtime, fixture, migration, or planning file changed.

PR #22 (`claude/fixture-safety-governed-controls` @ `0ff8a4c`) and PR #38
(`claude/task-d-ui` @ `f018a70`) are both open and both conflict with main. The
runtime UI they were written against has already landed on main: PR #38 replays
the merged `4ec377d`. Replaying either branch would reintroduce a stale shell.

This note records the residual assessment: which safety assertions those two
branches carry that main does **not**, restricted to the two categories under
review — generic branding and no commercial scope, and natively disabled
controls.

## Rejected as superseded

PR #22's per-label contract is not ported. It asserts that
`Prospecting disabled`, `Approve disabled`, `Defer disabled`, `CSV disabled` and
`Export disabled` are **present**. Main asserts the opposite — that each is
**absent** — because the Morning Brief, Exports and SignalRow that rendered them
were removed. Porting the presence list would contradict main and re-pin brittle
labels to a retired fixture. Its retired-control guard is likewise superseded:
main proves those controls render nowhere at all, which is strictly stronger
than proving they render disabled.

Main's generalized `CONSEQUENTIAL` verb list, its non-vacuity floor, its
`aria-describedby` reason requirements, its later-phase reason-adjacency regex,
and every DEV/local-demo fence are preserved unchanged.

## Residual 1 — a control may claim a state it does not hold

`CONSEQUENTIAL` is a verb list, so it cannot cover a control whose verb is not
on it. `Buy credits disabled` is the live example: a spend-authority control
matched by no word in that list and named by no other assertion in the file.

Evidence: rendering `Buy credits` enabled while leaving its label unchanged is
accepted by main's `fixture-safety.test.mjs`, which passes 2/2 against that
mutation.

The residual holds every control to its own label instead: one that tells the
operator it is disabled must carry the native disabled attribute. It needs no
maintenance as controls are added, and it is additive — main's verb list keeps
covering controls whose labels make no such claim.

## Residual 2 — the shell's generic scope is satisfied but unasserted

Ported from PR #38. Main's `prospector-app.tsx` contains
`No commercial scope has been read yet` and contains no `Good morning, <Name>`,
no `Digitalrain`, and no `ONE for Mining` — but `rendered-html.test.mjs` asserts
none of this, so nothing stops a seed Company, a seed Market Play, or a
personalised owner greeting being baked back into the shell.

## Validation

From `site/` on Node.js 22.13 or newer:

```bash
node --test --test-concurrency=1 tests/fixture-safety.test.mjs tests/rendered-html.test.mjs
npm test
npm run lint
```

Both residuals were mutation-checked against a scratch mirror; the repository
source was never modified. Five real regressions are caught — the spend control
rendered enabled, the whole later-phase group enabled, a seed Company, a seed
Market Play, and a personalised greeting — and one control case is correctly
not caught: a non-consequential control that claims no disabled state may render
enabled.

An earlier version of the spend-control mutation inserted a button at the wrong
`</section>` and rendered nothing, so it appeared to be missed. It is recorded
here because the corrected in-place mutation is what establishes the gap.

## Authority

Local test evidence only. It changes no runtime, persistence, hosting,
provider, credential, export, or outbound behaviour, activates nothing, and
earns no plan or phase completion credit. STATE and roadmap records remain the
docs incumbent's.
