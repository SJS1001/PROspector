# Isolated browser workflow acceptance

**Status: Mac native containment verified; integrated workflow results are recorded in EVIDENCE.md and last-run.json.** This lane started from
`8838363ef64698f92ac57ac06d564b3d72d4701f` on
`codex/local-app-integration`. It adds no production seam, auth bypass, dependency,
route, migration, workflow, or default change. Other lanes need not import it.
LOCAL-07 owner acceptance and real-provider quality remain open.

## Run

Use Node >=22.15, macOS with **/usr/bin/sandbox-exec**, unused loopback ports
**8080 and 8082**, and the repository checkout. Linux intentionally fails closed.
Do not launch this against an ordinary owner data directory.

```sh
cd operator
npm ci
cd acceptance/browser-workflow
npm ci
npx playwright install chromium
npm run test:unit
npm run test:native # macOS: OS policy + native descendant/worker probes
npm test
```

`npm test` clears old workflow evidence before running fence/adapter tests, then a foreground orchestrator. A failed unit stage cannot retain a prior PASS. A missing
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

`graph.mjs` traverses runtime imports from the production shutdown entry, real `fns.ts` and owner auth, including
literal dynamic imports. It rejects unreviewed source/package edges. The runner
compares its 33-file path/import/hash result with `reviewed-graph.json`. New source
requires explicit review and manifest regeneration; do not regenerate merely to
hide drift. UI/framework dependency code is outside that source manifest and
remains pinned by the operator lockfile. This is a reviewed-source test fence,
not an OS sandbox for malicious native addons or arbitrary code execution.

The public runner clears stale evidence, then runs the entire internal
orchestrator under the checked `macos-network.sb` using absolute
`/usr/bin/sandbox-exec`. The initial child inherits only PATH, HOME, LANG, TMPDIR
and optional PLAYWRIGHT_BROWSERS_PATH; NODE_OPTIONS/preload flags are excluded.
All build/setup, server, native subprocess, worker and Chromium descendants
inherit this OS network policy. It denies network operations except TCP to/from
SBPL's **localhost host set on ports 8080 and 8082**. SBPL does not accept
127.0.0.1 as a literal host filter. This is not an exact IPv4-only OS rule;
localhost includes IPv6, and its host-set interpretation belongs to macOS.
8082 is the fixed Playwright WebSocket transport; the application uses 8080.
Both ports are permitted to the whole tree, including native application
children. This is an explicit capability, not per-process isolation.

Before importing application/dependency code, containment admission runs a
fresh uninstrumented Node child. It requires EPERM/EACCES for numeric IPv4 and
IPv6 localhost on forbidden port 8081, TEST-NET external IPv4/IPv6 TCP, and UDP.
ECONNREFUSED, timeout, successful connect, or probe failure never count as OS
denial. The exact reproduced `process.binding("spawn_sync").spawn` primitive
and a worker repeat these checks, proving inheritance. The first check is
always numeric forbidden localhost; direct invocation outside a working policy
fails before any external probe. Initial admission also binds its own positive
listeners on 8080/8082, then proves allowed native-child traffic and closes
both before app/browser launch. Port collision blocks rather than probing
another installation. Every server start independently repeats denial probes
before installing JS instrumentation. Unsupported/missing/rejected containment
fails closed; there is no environment override or uncontained fallback.

`guard.mjs` installs `instrumentation.mjs` only after OS admission. Those JS
patches deny ordinary outbound sockets, TLS, HTTP(S)/HTTP2, DNS/Resolvers, UDP,
fetch/WebSocket, child processes and workers; they narrow ordinary server APIs
to the exact inbound 127.0.0.1:8080 listener. Native bindings demonstrably bypass
these patches; their tests explicitly retain that regression instead of calling
the patches an OS sandbox. The OS policy constrains descendant socket traffic,
not process creation. It does not isolate filesystem access, credentials,
Mach/other IPC, host brokers, arbitrary malicious code or compromised kernels.
Run only reviewed pinned code with fictional data; the profile is not a general
hostile-code sandbox or a proof against delegated host-service effects.

A child-specific binding event must precede every HTTP request. Caught JS
denials still fail the final verdict, including teardown. No stale lock is
deleted. DB inspection/fault injection waits for full server exit/lock release;
each inspection client closes before restart. Tests of native denial are
separate from the workflow's zero-forbidden-attempt counter; those intentional
preflight attempts never imply a complete browser journey.

Browser-context routing is installed before creating any pages, covers popup
first navigation, blocks service workers and all WebSockets, and allows only
`http://127.0.0.1:8080`. Exact Gmail compose URLs are recorded in memory then
aborted; Gmail is never navigated. Local requests use `route.fetch` with
`maxRedirects: 0`; HTTP redirects are refused before delivery because Playwright
`continue` does not reroute every redirect hop. This acceptance runtime therefore
requires redirect-free responses. DNS/background browser flags supplement these
routes. Direct foreign/alternate-loopback negative probes run before workflows;
redirect refusal and WebSocket closure also have deterministic route-contract tests.
The historical browser probes ran with the acquired pinned headless shell and refused both targets;
the integrated Mac execution is recorded separately in EVIDENCE.md.
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
- Primary journey actions use real Tab/Shift+Tab traversal, Enter/Space, typing
  and native select type-ahead, including visible navigation links and the skip
  link. The helper checks active focus, focus-visible/indicator, viewport fit and
  obstruction. Separate stale/mutation/replay probe tabs may use pointer activation.
- Layout samples at 320/360/768px check document/task/control horizontal fit and
  associated field labels across main screens, confirmation states and actions.
  Cancel/Escape checks require opener focus restoration; review rejection also
  checks retained reason and no POST. These are bounded geometry/focus checks,
  not a full assistive-technology or device-browser audit.
- Recovery probes cover failed download before dispatch, lost post-commit mutation
  response without replay, bounded workspace-read failure and keyboard retry,
  oversized/truncated archive rejection, consent/error reset on same-file
  reselection, valid restore and canonical reload/restart preservation. Fictional
  bytes use the file-input API; the native OS file chooser is excluded.
- Actual browser download bytes: strict UTF-8, CRLF, eight parsed columns,
  stable IDs, eligible rows, suggestion/suppression exclusions; fixture fields
  include quotes, commas, embedded newline, Unicode, `=`, whitespace/control
  before `+`/`-`, and BOM before `@`, with exact inert parsed-cell assertions.

Archive/DB/auth production repairs belong to lane F and UI polish to lane G.
The exact executed source and counts belong in EVIDENCE.md and last-run.json;
the public run at `b411707` passed: 46 units, 483 keyboard actions, 285 layout
samples, 10 cancellation cases, two workflows and four recovery scenarios.
This harness does not claim concurrent handoff election, every suppression scope, every archive corruption/rollback
variant, saved-provider restart, an overnight-open simulation, native file
chooser usability, real-provider quality or owner acceptance. Separate suites
cover additional database/auth/archive cases; keep their evidence distinct.
The [owner guide](../../../docs/LOCAL-APP-FINAL-ACCEPTANCE.md) covers private setup
and usefulness/provenance/time/cost judgment after engineering acceptance.

## Current handoff

See [EVIDENCE.md](EVIDENCE.md) and [last-run.json](last-run.json). Official
pinned-artifact acquisition is resolved; [ARTIFACT.md](ARTIFACT.md) records the
failed CDN response and reproducible official Google download/cache recovery.
Failure evidence retains harness code locations, fixed error classifications,
network error codes and fence counts, never selector contents or runtime logs.
No workflow, Mac or owner acceptance follows merely from browser launch.
