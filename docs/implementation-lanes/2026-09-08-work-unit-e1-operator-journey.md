# Work Unit E1 — reachable-surface browser acceptance

**Prepared:** 2026-09-08
**Repository:** `https://github.com/SJS1001/PROspector.git`
**Base:** `main` at `f490555da8df5d1c91ba5b59e755990d9e31e6f8`
**Merged:** PR #50 merged to `main` on 2026-09-08T16:33:18Z as
`e0c93d2cb8f253382b2a242e0ce62f3f0d92944a`, carrying lane head
`bff326f67443b42c148dc898cebc3e3e99cc67e0`
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

Run at head `bff326f6`, and re-run after merging `main` `9746320f` forward
into the lane (local head `49cadf65`) to prove the merge result. Every
command's true exit is recorded.

| Command | Result |
|---|---|
| `npm test` (full Node suite: build + all 133 suites) | 917 pass / 0 fail, exit 0 |
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

The Chromium journeys are **not** executed by this container; they are proven
by the external attributed executor receipt recorded below. Nothing in this
table is a browser result, and no browser claim rests on this container.

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

## Browser evidence — external attributed executor

The Chromium journeys could not be executed in this container (see the
environment note below), so they were run by an external attributed executor
and the receipt is recorded here rather than claimed as this container's work.

**Validated head:** `bff326f67443b42c148dc898cebc3e3e99cc67e0` — before and
after are the same SHA; the run changed nothing (`git status` clean at the end).
**Environment:** isolated Hetzner container `prospector-e1-validation-2`
(`b0312fafdac00d960184d043852664b530e4790f0c9e2c50e53a3df0dfd959f5`, exit 0,
`oom=false`), Node 24.18.1, **officially downloaded Chromium 1243 — no shim and
no `executablePath` override**, i.e. the supported install matching the pinned
`@playwright/test` 1.63.0.

| Lane | Result |
|---|---|
| `npm run test:browser` (onboarding) | exit 0, 2 passed, 54.4s |
| `npm run test:browser:person-discovery` | exit 0, 1 passed, 21.8s |
| `npm run test:browser:operator-journey` (E1) | exit 0, 1 passed, 25.3s |

All three zero-effect verifiers passed: `forbiddenRows` 0 and zero R2 effects.
Raw logs are retained by the coordinator with the container.

This receipt therefore covers the E1 operator journey, the onboarding reflow
parity, and the onboarding seed-absence assertions at `bff326f6`. The only
commit added after it is the merge of `main` (PR #49: assertions inside
`tests/fixture-safety.test.mjs` and `tests/rendered-html.test.mjs`, plus one
lane document). That merge touches no browser spec, no application module, and
no fixture the lanes drive, so it does not disturb the evidence; the full Node
suite was re-run on the merged head and is recorded above.

## Environment note — this container cannot run the pinned browser

The receipt above exists because the supported install cannot supply the pinned
browser *here*. Verified in this container:

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
used either. No lane, pin, or fence was weakened to work around this: the fix
was to execute on an environment that carries the pinned revision, which is what
the receipt above records.


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
