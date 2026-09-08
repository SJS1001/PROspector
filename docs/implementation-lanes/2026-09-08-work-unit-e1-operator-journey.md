# Work Unit E1 — reachable-surface browser acceptance

**Prepared:** 2026-09-08
**Repository:** `https://github.com/SJS1001/PROspector.git`
**Base:** `codex/generic-onboarding-integration` at
`72b16445806314fd132c082211a3c6bddbe04323`
**Lane branch:** `claude/task-e1-browser-acceptance`
**Predecessor records:**
[`2026-09-06-claude-cloud-transfer.md`](2026-09-06-claude-cloud-transfer.md),
[`2026-09-07-work-unit-d-operator-interface.md`](2026-09-07-work-unit-d-operator-interface.md)

Work Unit E as written is not startable: it depends on "local-only synthetic
runtime seams for the remaining research, contact, outreach approval, and CRM
handoff services", and three of those four do not exist. This unit is the half
that is reachable today. It grants no hosted, provider, credential, enrichment,
export, email, call, schedule, or outbound authority, composes no new service,
and consumes no external-effect gate. The retired Sites project was not
accessed.

## Why E was split

| Seam E depends on | Module | Composed into a route? | Verdict |
|---|---|---|---|
| Contact / person discovery | `/api/contacts`, `/api/contacts/person-discovery`, the C4 local-demo route | yes | ready, covered by C4 |
| Research / retrieval | `domain/ports/retrieval.ts` | no importers in `app/`, `domain/`, `worker/`, `adapters/` | missing |
| Outreach approval | `preparation/outreach-*.ts` | no — and prohibited | blocked |
| CRM handoff (CSV) | `domain/crm-csv-codec.ts` | no route imports it | missing |

The two blocked seams are hard-gated, not merely absent.
`06-PREPARATION.md:100` mandates a static guard forbidding "runtime import of
every module under `site/preparation/`", and Message approval "can reach only
`ready_for_future_composition`". `07-PREPARATION.md:30` forbids preparation
modules from using "D1/R2, filesystem writes, network/provider ports, routes,
workers, UI". Composing either into runtime would exceed the authorization those
phases hold, so **E2 — approval and CRM handoff acceptance — remains blocked and
is not attempted here.**

## What E1 adds

A third browser lane, `operator-journey-e1`, beside the existing `onboarding`
and `person-discovery-c4` lanes. It drives the Review prospects task — the one
governed decision surface that was reachable but had no browser coverage — and
the three cross-cutting behaviours E names that no lane exercised.

One journey, in order:

1. **Prospect review.** The lane seeds one `qualified` Prospect with no review
   decision, selects the ready Customer Profile the way an operator would, and
   renders it in the queue. Axe finds no critical or serious violation.
2. **Reflow.** The task holds at 760px and 480px with no horizontal document
   scroll, and keyboard focus is still reachable.
3. **CSRF expiry.** The token the page holds is dropped before the mutation. The
   server answers 403; the operator is told the outcome could not be verified
   and that nothing will be retried. Exactly one POST leaves the browser.
4. **Lost-response reconciliation.** The next mutation is aborted in flight, so
   no response ever arrives. The same fail-closed notice appears, still after
   exactly one attempt, with no automatic retry.
5. **Two-tab stale conflict.** Two contexts load the same authoritative
   revision and both approve. Exactly one 200 and one 409; each tab issues
   exactly one POST; the loser is told its action was not applied and does not
   retry.
6. **Durability.** After a runtime restart the decided Prospect has left the
   queue.

The post-run verifier then proves the database agrees: exactly one review
decision on the E1 Prospect, `approve`, its owner reason persisted, and the
Prospect at revision 2 — so steps 3 and 4 wrote nothing at all. Zero forbidden
rows, zero R2 objects, and discovery, contacts, outreach, and enrichment tables
all still empty.

## Two defects this found

**A real 480px overflow in the prospecting task.** `app/prospecting/
prospecting-workspace.tsx` carries its own stylesheet with a 760px breakpoint
and nothing below it. At 480px the task forced the document to 511px. Grid items
default to `min-width:auto`, so one wide descendant stretched the whole panel.
Fixed by giving the grid items `min-width:0` and adding a 480px block that
reduces panel padding and stacks the card headers. Both breakpoints now hold.

**No reflow coverage in the onboarding lane.** It ran Axe but never resized.
It now checks the same two breakpoints and keyboard reachability, matching the
other two lanes.

## Files

- `site/domain/operator-journey-e1-acceptance.ts` *(new)* — the fixture. It
  reuses the C4 seed for the shared hierarchy, then adds one Organization,
  Account, Target, candidate, Passed assessment, and `qualified` Prospect. The
  Review Queue projection inner-joins the candidate to its Target, Account, and
  Organization, so a reviewable Prospect needs that identity chain.
- `site/app/api/local-demo/operator-journey-e1/route.ts`, `_handler.ts` *(new)* —
  the same dev-gated boundary the C4 route uses: a thin route whose body lives in
  a `_`-prefixed sibling reached only through a dynamic import inside an
  `import.meta.env.DEV` branch, so Rollup drops the chunk.
- `site/scripts/operator-journey-browser-boundary.mjs`,
  `operator-journey-browser-bootstrap.mjs`,
  `run-operator-journey-acceptance.mjs`, `verify-operator-journey-e1.mjs`
  *(new)* — the lane's bindings, full-chain bootstrap, isolated runner, and
  zero-effect verifier.
- `site/tests/browser/operator-journey-e1.spec.ts` *(new)* — the journey.
- `site/scripts/browser-acceptance-boundary.mjs` — the additional-binding
  allowlist gains the E1 binding. It stays a closed allowlist: a lane may only
  add a binding named there, with exactly that value.
- `site/playwright.config.ts` — three named lanes; `testMatch` now derives from
  the lane name.
- `site/package.json` — `test:browser:operator-journey`.
- `site/app/prospecting/prospecting-workspace.tsx` — the reflow fix.
- `site/tests/browser/onboarding.spec.ts` — reflow parity.
- `site/tests/production-bundle-boundary.test.mjs` — a new case asserting the E1
  fixture literals never reach `dist/`.

## Validation

- `npm run test:browser:operator-journey` — 1/1, verifier passed.
- `npm run test:browser:person-discovery` — 1/1, unchanged.
- `npm run test:browser` — 2/2 with the added reflow checks.
- `npm run build` and `npm run lint` — clean.
- `tests/production-bundle-boundary.test.mjs` — 6/6, including the new E1 case.
- `browser-acceptance-foundation`, `profile-prospecting-ui`, `rendered-html`,
  `fixture-safety`, `local-demo-boundary` — all green.

### Environment note

The pre-installed Chromium in this runner is build 1194; the pinned
`@playwright/test` 1.63.0 resolves build 1243. The lanes were executed against a
version shim built **inside the gitignored `site/.local/playwright-browsers`
cache** — no repository file was changed to accommodate it, and
`playwright.config.ts` still carries no `executablePath`. A runner whose Chromium
matches the pin needs no shim.

## Boundary

No hosted, Cloudflare, Access, provider, credential, real-data, export delivery,
email, call, schedule, or outbound action was performed or enabled. No migration,
bootstrap, or shared roadmap/state document was modified. Every new binding is
development-only, loopback-only, and owner-admitted. This unit earns no phase or
plan completion credit, and Work Unit E2 remains blocked on Phase 6/7
authorization.
