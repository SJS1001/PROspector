# Issue #11 — guarded fictional CRM handoff preview journey

**Prepared:** 2026-09-08
**Repository:** `https://github.com/SJS1001/PROspector.git`
**Issue:** [#11](https://github.com/SJS1001/PROspector/issues/11), the local-handoff stage
**Lane branch:** `claude/issue-11-crm-preview-journey`
**Status:** **merged to `main` as PR #71 (`eebf1d1`) on 2026-09-08 at 17:41Z, and
the journey has still never been executed anywhere.** The draft banner this
document carried — "not for merge until both dependencies land and the combined
tree is validated" — was overtaken by events: both dependencies did land (PR #67
and PR #69, merged minutes later), but the exact-head validation it asked for has
not happened. Nothing here is a pass claim.

## Isolated combined dependency checkout

This branch exists so the journey can be written against the real screen instead
of a substitute. It is base plus two unmerged dependencies, merged in order with
no conflict:

| Component | Exact SHA |
|---|---|
| base `main` | `f7d8fc058dc4516b4cbf852c7bb74da65fc3e734` |
| CRM handoff decision seam + gated route (PR #67) | `de93e936…` on `claude/issue11-csv-handoff-contract` |
| fictional preview trigger, `local-demo/_screen.tsx` (UI8) | `7e1078b44975115e90877378a77f3ae863de71a4` on `claude/issue-8-crm-handoff-preview-ui` |
| this lane's combined head | `d9a345cb3e87d8a983d06d91e00bdad4e2ea9ffc` before the test commit |

Both dependencies are based on `f7d8fc0` and touch disjoint files, so the merge
is mechanical. **This branch must not merge before them**, and it will be
re-based forward onto whatever they actually land as.

## What the journey drives

`site/tests/browser/operator-journey-e1.spec.ts`, one added `test()`. It is a
second journey in the lane that already owns this isolation — no fourth lane, no
new runner, and **no new binding**: the preview route is gated by `LOCAL_DEMO`,
same-origin, and owner admission, so the closed additional-binding allowlist is
untouched.

It drives `/local-demo` and its trigger — **the supported screen, not the
endpoint.** Driving `POST /api/local-demo/crm-handoff-preview` directly would be
the substitute the issue's second criterion forbids, and would have proved
nothing about what an owner actually sees.

What it pins:

1. **The refusal is the seam.** The screen must report zero rows admitted, with
   the refused count accounting for every demo row, read out of the rendered
   summary rather than the payload. `projectCrmHandoff` consults
   `recheckForCrmExport`, which never returns an unblocked recheck, so no row can
   be admitted; a test that only proved a preview rendered would miss this
   entirely. The counts are matched structurally, so adding a demo row does not
   silently weaken the assertion.
2. **The framing is visible before and after.** `FICTIONAL · NOT APPROVED FOR
   EXPORT` is present before the run, and `Fictional and unapproved.` after it.
3. **No export affordance exists.** No `[download]`, no `blob:` or `data:`
   anchor anywhere on the screen; the response carries `cache-control: no-store`
   and **no** `Content-Disposition`. A handoff that offered a file would be an
   export, so it must not even be shaped like one.
4. **Exactly one request leaves the browser**, and it is the preview endpoint.
   All external origins are blocked and asserted empty.
5. **Accessibility**, consistent with the rest of the lane: Axe finds no critical
   or serious violation, and the screen holds at 320px with no horizontal
   document scroll.
6. **Nothing persists.** After a runtime restart the screen is back to its
   pre-run state with no preview. The lane's zero-effect verifier proves the same
   at the database and object-store level.

## Validation on the combined tree

Head validated: this branch. True exits only.

| Command | Result |
|---|---|
| `npm run build` | exit 0 |
| `npx eslint . --ignore-pattern dist --ignore-pattern .next` | exit 0 |
| `node --test tests/production-bundle-boundary.test.mjs` | 6 pass / 0 fail, exit 0 |
| `node --test tests/browser-acceptance-foundation.test.mjs` | 5 pass / 0 fail, exit 0 |
| `node --test tests/local-demo-boundary.test.mjs` | 5 pass / 0 fail, exit 0 |
| `node --test tests/crm-handoff-projection.test.mjs` | 8 pass / 0 fail, exit 0 |
| `node --test tests/crm-handoff-preview-route.test.mjs` | 5 pass / 0 fail, exit 0 |

No canonical suite was run here — one is already live as `exec81223` on the
coordinator runner, and duplicating it is forbidden.

**The new journey is not executed here.** It needs one run of
`npm run test:browser:operator-journey` on the exact combined head, by the
attributed executor. If the 320px assertion fails, the defect is in the
local-demo screen's stylesheet and belongs to the UI owner: this lane makes no
source edit and will report rather than repair.

## Known gap in a dependency — reported, not fixed here

PR #67's `route.ts` cites `tests/production-bundle-boundary.test.mjs` as its
guard, but that suite's local-demo case is a **closed three-literal
enumeration**, not a sweep, so `crm_handoff_local_demo_preview`,
`fictional.buyer@example.test` and its siblings are currently unguarded against
`dist/`. Reported on PR #67; the CSV owner is authorized to add that regression
after their canonical run terminates. This lane did not edit that file.

## Boundary

Browser specs and lane evidence only — no source, route, or fixture-runtime
edit. No hosted, Cloudflare, provider, credential, real-data, export delivery,
email, call, schedule, or outbound action. The research runtime remains held
separately and no research stage is attempted. **Issue #11 stays open**: this
closes the local-handoff stage's coverage once validated, not the issue.
