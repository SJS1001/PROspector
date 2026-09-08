# Work Unit E1 — reachable-surface browser acceptance

**Prepared:** 2026-09-08
**Repository:** `https://github.com/SJS1001/PROspector.git`
**Base:** `main` at `f490555da8df5d1c91ba5b59e755990d9e31e6f8`
**Lane branch:** `claude/task-e1-operator-journey`
**Reconciled from:** `claude/task-e1-browser-acceptance` at
`cc4c7f960f9da8eaa2606af61d4f28454d3afbd7`, which remains on the remote; the
stale STATE claims in `bfdb58c` are deliberately excluded (that commit is not an
ancestor of `main`)
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
- `site/tests/browser/onboarding.spec.ts` — reflow parity, plus two assertions
  that a blank workspace shows no `Digitalrain` or `ONE for Mining` seed at the
  first supported screen and again after the restart. The lane already drove
  blank non-Digitalrain onboarding (`Northstar` / `Harbor Pulse` /
  `Port Operations` / `Bulk Terminal Operators`) through supported screens with
  no SQL or fixture authority; the seed-absence check is what was missing.
- `site/tests/production-bundle-boundary.test.mjs` — a new case asserting the E1
  fixture literals never reach `dist/`.

## Validation

Run at head `362d023` on base `f490555`. Every command's true exit is recorded.

| Command | Result |
|---|---|
| `npm run build` | exit 0 |
| `npx eslint . --ignore-pattern dist --ignore-pattern .next` | exit 0 |
| `node --test tests/production-bundle-boundary.test.mjs` | 6 pass / 0 fail, exit 0 |
| `node --test tests/onboarding-repository.test.mjs` | 2 pass / 0 fail, exit 0 |
| `node --test tests/browser-acceptance-foundation.test.mjs` | 5 pass / 0 fail, exit 0 |
| `node --test tests/migration-source-of-truth.test.mjs` | 12 pass / 0 fail, exit 0 |
| `node --test tests/fixture-safety.test.mjs` | 2 pass / 0 fail, exit 0 |
| `node --test tests/rendered-html.test.mjs` | 4 pass / 0 fail, exit 0 |
| `node --test tests/workspace-view.test.mjs` | 2 pass / 0 fail, exit 0 |
| `node --test tests/local-demo-boundary.test.mjs` | 5 pass / 0 fail, exit 0 |
| `node --test tests/operator-interface-ui.test.mjs` | 10 pass / 0 fail, exit 0 |

**The Chromium journeys in this lane are NOT proven at this head.** See the
environment blocker below. The three browser specs — the E1 operator journey,
the onboarding reflow parity, and the onboarding seed-absence assertions — are
authored and lint-clean but unexecuted here, and no claim is made that they
pass. The production-bundle fence, the seed module, the boundary allowlist, and
the reflow CSS fix are all covered by the executed suites above.

## Withdrawn evidence

An earlier run of this lane on `cc4c7f9` reported the three browser lanes as
passing. That run drove Chromium build 1194 through a version shim in the
gitignored browser cache while `@playwright/test` 1.63.0 pins build 1243.
`.planning/STATE.md` on `main` records that substituting a mismatched browser
build is "not permission to weaken the lanes, relax their exact pin, or
substitute a mismatched browser build". That evidence is therefore withdrawn and
must not be cited as proof of this lane. The shim was never committed — no
repository file was changed to accommodate it, and `playwright.config.ts`
carries no `executablePath` — so nothing needs reverting; only the claim is
retracted.

## Environment blocker — pinned browser unobtainable

The supported install cannot supply the pinned browser in this environment, and
this was verified here rather than taken from the record:

```
curl https://cdn.playwright.dev/.../chromium/1243/chromium-linux.zip
  -> curl: (56) CONNECT tunnel failed, response 403
curl https://playwright.azureedge.net/builds/chromium/1243/chromium-linux.zip
  -> curl: (56) CONNECT tunnel failed, response 403
```

The image ships `chromium-1194` and `chromium_headless_shell-1194`;
`playwright-core/browsers.json` requires `chromium-1243` and
`chromium-headless-shell-1243`. The lanes deliberately scrub
`PLAYWRIGHT_BROWSERS_PATH` to their own cache, so an inherited build cannot be
used either. `.planning/STATE.md` on `main` already records this same
restriction independently.

Three routes are therefore all closed: the normal supported install is blocked
by network policy, an arbitrary downgrade or `executablePath` workaround is
forbidden, and the old shim is withdrawn above. **The Chromium journeys need an
environment carrying the pinned revision.** No lane, pin, or fence was weakened
to work around it.

## Coverage already owned elsewhere — not duplicated

A focused negative case rejecting a second differently named company was
requested. It already exists and is owned by
`site/tests/onboarding-repository.test.mjs`: after `Acme Marine` / `Fleet ONE`
is created, a second `Other` / `Other` initialization rejects with
`/already initialized/`, and the suite then asserts exactly one row in
`workspaces`, `companies`, `workspace_companies`, `products`, and
`interview_sessions`, so no second company graph is created. The same suite
proves a blank read is `company_product_required` over zero workspaces. It
passes 2/2 at this head. Adding a second copy would duplicate a validator, so
this lane does not.

## Boundary

No hosted, Cloudflare, Access, provider, credential, real-data, export delivery,
email, call, schedule, or outbound action was performed or enabled. No migration,
bootstrap, or shared roadmap/state document was modified. Every new binding is
development-only, loopback-only, and owner-admitted. This unit earns no phase or
plan completion credit, and Work Unit E2 remains blocked on Phase 6/7
authorization.
