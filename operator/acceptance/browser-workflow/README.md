# Isolated browser workflow acceptance

**Status: pinned browser acquired; workflow acceptance remains open.** This lane starts from
`8838363ef64698f92ac57ac06d564b3d72d4701f` on
`codex/local-app-integration`. It adds no production seam, auth bypass, dependency,
route, migration, workflow, or default change. Other lanes need not import it.
LOCAL-07, Mac acceptance, and real-provider quality remain open.

## Run

Use Node >=22.15, an unused **127.0.0.1:8080**, and the repository checkout.
Do not launch this against an ordinary owner data directory.

```sh
cd operator
npm ci
cd acceptance/browser-workflow
npm ci
npx playwright install chromium
npm test
```

`npm test` runs fence/adapter tests, then a foreground orchestrator. A missing
browser or any denial/failure exits nonzero. No retries, skip, alternate browser,
executable override, external credentials, deployment, or CI polling exists.
Playwright is pinned to **1.63.0**, Chromium **1243 / 153.0.8010.12**, with its own
lockfile. Version and local package resolution are checked at runtime. Headless
execution uses the package's corresponding pinned headless shell.

The orchestrator copies only checked source, migrations, scripts, public assets,
configuration and package manifests into a fresh physical temporary directory.
It enrolls a random disposable fictional owner over stdin. The server receives
an explicit environment allowlist and a new data directory outside the checkout;
no owner environment, DB, provider keys, or `.env` files are inherited. Passwords,
cookies, raw server logs and temporary DB records are not retained. The runtime
is stopped and deleted before exit. Only sanitized `last-run.json` remains.

## Boundaries

The disposable Vite config substitutes normalized absolute provider leaf IDs
before bundling. Required `llm`, `retrieve` and `jev-tasks` interceptions are
asserted. Real discovery/hunt, qualification, reveal parsing, workspace handlers,
authentication, vault, SQL adapter and migrations remain in use. The LLM/page
stubs return only labelled Fictional Quarry / Fictional Plant data under
`fictionalquarry.example`; unknown prompts/pages reject. Paid/mail/inbox/vendor
adapters hard-fail and count attempted invocation. Expected stub calls are
separate from actual provider/network attempts, which must remain zero.

`graph.mjs` traverses runtime imports from real `fns.ts` and owner auth, including
literal dynamic imports. It rejects unreviewed source/package edges. The runner
compares its 27-file path/import/hash result with `reviewed-graph.json`. New source
requires explicit review and manifest regeneration; do not regenerate merely to
hide drift. UI/framework dependency code is outside that source manifest and
remains pinned by the operator lockfile. This is a reviewed-source test fence,
not an OS sandbox for malicious native addons or arbitrary code execution.

Before importing the built server, `guard.mjs` denies outbound socket connect,
TLS, HTTP(S)/HTTP2, DNS resolution (including Resolver instances), UDP,
fetch/WebSocket, child processes and workers. It allows only the exact inbound
listener; Node's numeric-loopback lookup is answered in memory without a DNS
resolver. A child-specific binding event must exist before any HTTP request, so
a port collision cannot send acceptance traffic to another installation. Caught
denials still fail the final verdict, including after teardown. No stale lock is
deleted. DB inspection/fault injection happens only after full server exit and
lock release; each inspection client closes before restart.

Browser-context routing is installed before creating any pages, covers popup
first navigation, blocks service workers and all WebSockets, and allows only
`http://127.0.0.1:8080`. Exact Gmail compose URLs are recorded in memory then
aborted; Gmail is never navigated. Local requests use `route.fetch` with
`maxRedirects: 0`; HTTP redirects are refused before delivery because Playwright
`continue` does not reroute every redirect hop. This acceptance runtime therefore
requires redirect-free responses. DNS/background browser flags supplement these
routes. Direct foreign/alternate-loopback negative probes run before workflows;
redirect refusal and WebSocket closure also have deterministic route-contract tests.
The browser probes ran with the acquired pinned headless shell and refused both targets.
They use a disposable page, closed before opening the workflow page.

## Auth and workflow evidence

The built HTTP smoke uses real owner login/session admission and tests anonymous
session state, signup absence, missing/foreign Origin and cross-site POST denial,
and unchanged canonical workspace rows. This app uses exact Origin/Host checks;
there is no separate CSRF token to pretend to verify.

The browser specification covers the following assertions; consult `last-run.json`
and EVIDENCE.md for the exact executed subset:

- Sixteen fictional interview submissions and confirmations; product activation,
  manual discovery, explored/confirmed draft play, profile activation and manual
  prospect run; application qualification, owner review and real reveal parser.
- Package and exact message approval, exact compose recipient/subject/body,
  aborted Gmail, delivery-unconfirmed labels, stale-tab replay refusal.
- Two workflows with full server restart and canonical DB comparison. Startup /
  reload checks compare DB state and adapter counts in a bounded observation
  window; they do not simulate an overnight-open tab.
- Stopped-DB fault injection changes an approved message; stale handoff must
  refuse, then real UI draft/reapproval is required. Another fixed probe inserts
  an email suppression after approval and checks refusal plus CSV exclusion.
  Removing only that harness-owned probe resets the disposable test; it supplies
  no production suppression-removal capability.
- Actual browser download bytes: strict UTF-8, CRLF, eight parsed columns,
  stable IDs, eligible rows, suggestion/suppression exclusions; fixture fields
  include quotes, commas, embedded newline, Unicode, `=`, whitespace/control
  before `+`/`-`, and BOM before `@`, with exact inert parsed-cell assertions.

Archive/DB/auth production repairs belong to lane F and UI polish to lane G.
This harness does not claim concurrent handoff election, interrupted response,
every suppression scope, archive corruption/rollback, saved-provider restart,
keyboard/mobile usability, real-provider quality, Mac recovery or owner
acceptance. Keep the broader acceptance matrix open.

## Current handoff

See [EVIDENCE.md](EVIDENCE.md) and [last-run.json](last-run.json). Official
pinned-artifact acquisition is resolved; [ARTIFACT.md](ARTIFACT.md) records the
failed CDN response and reproducible official Google download/cache recovery.
Failure evidence retains harness code locations, fixed error classifications,
network error codes and fence counts, never selector contents or runtime logs.
No workflow, Mac or owner acceptance follows merely from browser launch.
