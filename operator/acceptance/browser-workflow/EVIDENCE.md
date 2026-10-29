# PR #142 review verification — 2026-10-29

Tested the working-tree review corrections on base
`5590680e01efd5fe6b010b0c4f27bd07561c94db`. This section and `last-run.json`
supersede prior browser results.

- Full app suite: 384 passed (295 scripts + 89 source); typecheck and production
  build passed. Lint: zero errors, three existing warnings.
- Public contained browser test: PASS; 46 harness units, two complete fictional
  workflows, 554 keyboard actions, 306 layouts, ten cancellation cases,
  and four recovery scenarios. Startup/reload and managed restart preserve state.
- Explicit review updated the 33-file runtime graph for SQLite locking and the
  search/opportunity modules. Fictional evidence now includes current publication
  metadata and exact-quote explanations required by the production evidence gate.
  JEV requests remain forbidden; only its safe error formatter is available.
- Stub counts: hunt 2, discovery 2, retrieve 4, explanation 2. Unexpected browser
  requests and forbidden provider attempts: zero. Both compose requests aborted.
- Restored distinct company/site labels and supplied confirmed product constraints
  to opportunity refresh; focused regression included in the full suite.
- Actual macOS reboot remains a guided owner check, distinct from server restart.
  These fictional checks do not establish live provider quality or email delivery.

See [the review report](../../../docs/implementation-lanes/2026-10-29-pr142-review.md).

---

# Plain-language verification — 2026-10-28

Tested the working-tree delta on base `ad0427cb1627eeab29411c073564dfbdfaef397d`
on `codex/local-app-integration`. This section and `last-run.json` supersede the
previous browser counts below.

- Current local UI uses target market, search settings, published contact details,
  brief, do-not-contact list and plain status/error labels. Saved owner answers,
  backend identifiers, approval hashes and dark theme tokens remain unchanged.
- Full operator regression suite: 258 script + 64 source tests passed. Production
  build and typecheck passed; lint zero errors/three prior warnings. Changed-file
  React Doctor reported no issues.
- Contained browser acceptance PASS: 46 harness units, two complete fictional
  workflows, 558 keyboard actions, 312 layouts at 320/360/768px, ten cancellation
  cases and four recovery scenarios. Zero unexpected browser requests or forbidden
  provider attempts; both Gmail compose requests aborted.
- Initial browser attempt completed the workflows but failed on an obsolete
  recovery button selector. Updated wording selectors and reran the whole suite.
- Two final Settings help sentences changed “paid contact reveal” to “paid contact
  lookups” after the browser build. Final production rebuild passed and the
  generated Settings asset was checked; no additional browser run for these words.
- Owner runtime restarted successfully on loopback 8080. Browser tab acquisition
  failed despite successful tab listing; no refreshed owner-data UI inspection is
  claimed. No intentional owner-data edits or real provider work were performed.
- Added a foundation-test occupied-port preflight after an invalid initial
  regression run contacted the owner listener. Verified rejection before HTTP,
  stopped the owner app, then ran the passing isolated suite. See the audit report
  for the incident scope.

Fictional/provider-stubbed checks do not establish real-provider quality, email
delivery, native file chooser usability, physical-device or assistive-technology
coverage, overnight behavior, or owner acceptance.

---

# App-wide copy verification — 2026-10-28

Tested the working-tree delta on base `5c2c09d26a5dd144b80eb744c55fef3fbbd2eb37`
on `codex/local-app-integration`; this commit includes that tested source delta.
This section and `last-run.json` supersede the browser counts below.

- Simplified Today, Target markets, Searches/prospects, Review, Contacts, Outreach,
  Settings, Diagnostics and backup/restore. Supporting information is collapsed
  under its category; errors, approval controls and action consequences remain.
  No theme tokens or backend authorization rules changed.
- Typecheck and production build passed. Lint: zero errors, three existing
  unused-variable warnings. Operator regressions: 255 script + 64 source tests
  passed before the final verified-contact warning condition; the final focused
  UI suite passed 4/4. Changed-file React Doctor reported no issues.
- Final contained browser acceptance: PASS, 46 units, two fictional workflows,
  558 keyboard actions, 312 layout samples at 320/360/768px, 10 cancellation
  cases and four recovery scenarios. Zero unexpected browser requests or
  forbidden provider attempts; both Gmail compose requests were aborted.
- All seven Settings groups are keyboard-accessible and initially collapsed.
  Version details remain accessible. Verified contact fixtures no longer display
  an unverified-mailbox warning. Existing confirmation, restart, CSV, suppression
  and recovery checks passed with the simplified layouts.
- Rebuilt owner app is running on loopback port 8080. Today and Settings were
  inspected read-only with saved owner data; Settings screenshot retained in
  the local UI review folder outside Git. No owner records were changed.

Fictional/provider-stubbed acceptance does not establish real-provider quality,
email delivery, native file chooser usability, physical-device or assistive-
technology coverage, overnight behavior, or owner acceptance.

---

# Company follow-up verification — 2026-10-28

Tested the working-tree changes on base `fb3672bb71f51341dbb3f5dc7726e178f0906d5b`
on `codex/local-app-integration`; this commit includes that tested source delta.
This section and `last-run.json` supersede the previous browser counts below.

- Company removes introductory/repeated copy and Saved badges. Short Edit controls
  retain descriptive accessible names. Full verbatim answers, evidence and
  supporting categories sit under one initially closed Details disclosure.
- Navigation padlocks are removed; destination prerequisites remain unchanged.
  The existing dark palette and saved owner data are unchanged.
- Typecheck and production build passed. Lint: zero errors, three existing
  warnings. Focused manual workflow UI tests: 4/4 passed. React Doctor scoped
  to files changed from HEAD: no issues; the broader historical scan was not clean.
- Contained browser acceptance passed: 46 units, two fictional workflows,
  483 keyboard actions, 279 layout samples, 10 cancellation cases and four
  recovery scenarios. Zero unexpected requests or forbidden provider attempts.
- Nested Company disclosures are keyboard-tested. Both correction proposals
  preserve saved answers until confirmation; confirmed changes survive reload.
- Actual owner Company rendering inspected read-only at desktop and 320px.
  At 320px, document width equals viewport width. Details starts collapsed;
  full answers/evidence remain accessible. No owner answers were edited.

The earlier broader regression counts below are historical, not rerun claims
for this follow-up. Real-provider usefulness and owner acceptance remain separate.

---

# UI simplification verification — 2026-10-28

Browser-tested source: `b411707ae6e3d1e5ce503bfc0276dd68afc48f81` on
`codex/local-app-integration`. This supersedes the earlier UI/browser checkpoint
below. The following documentation/evidence commit changes no production source.

- Public contained `npm test`: PASS, 46 unit tests and two complete fictional
  workflows, including full server restart, exact compose checks and CSV bytes.
- 483 real keyboard actions; 285 layout samples at 320/360/768px; 10 Cancel/Escape
  cases; four error-recovery scenarios. Zero unexpected browser requests and
  forbidden provider attempts; both Gmail compose requests aborted.
- Company saved summaries and keyboard disclosures verified. Two correction
  proposals preserve the saved answer until confirmation; confirmed changes
  survive reload. The fictional company name is restored for subsequent checks.
- A backup failure arriving after its section is collapsed reopens the section
  and focuses visible feedback. Mobile focus scrolling keeps complete controls
  in view; this defect was found by the browser suite and repaired before PASS.
- Final source typecheck, lint and production build passed. Lint retains three
  existing unused-variable warnings. Before the final focus-only shell patch,
  expanded script/source regressions passed 255+84; contracts/archive/concurrency/
  component/layout checks passed 51; durable restart 2; auth runtime 18;
  passwordless local-access HTTP/browser 1; final component rerun 7.
- The reviewed graph retains all 29 source paths/import edges. Five hashes were
  reconciled after reviewing the preceding passwordless local-access change;
  the UI implementation changes no backend behavior.
- Actual local app rebuilt/restarted and inspected with the owner's existing
  saved Company data: compact summaries, grouped navigation, existing dark
  palette. At 320px, document width equals viewport width and mobile Menu opens.
  This inspection made no owner data mutations or provider calls.

The automated browser harness uses optional password mode; the separate local
access suite verifies the default passwordless mode and request boundaries.
These checks do not establish real-provider quality, email delivery, native OS
file chooser usability, physical-device/cross-browser or assistive-technology
coverage, overnight behavior, or owner acceptance. See the owner guide and the
[UI implementation report](../../../docs/implementation-lanes/2026-10-28-ui-simplification.md).

---

# Integrated Mac verification — 2026-10-28

Final browser-tested source: `76976635c0267bd3f9a5d7f2b5392b2ef59dd3fd` on
`codex/local-app-integration`. This section supersedes earlier browser coverage
claims below. `last-run.json` records the actual run; the following evidence/docs
checkpoint changes no production source. Darwin arm64, Node 24.16.0, isolated
Playwright 1.63.0, Chromium 1243/153.0.8010.12.

- Public `npm test`: exit 0, 46 unit tests pass and contained browser verdict PASS.
- Whole-process-tree macOS Seatbelt network admission and descendant/worker probes
  pass. This is network isolation; filesystem and IPC isolation are not claimed.
- Two complete fictional UI workflows pass, including all 16 interview confirmations,
  manual discovery/prospecting, qualification, review, contact/package/message
  approvals and exact Gmail compose handoff. Both compose requests were aborted;
  delivery remains unconfirmed.
- Primary journeys record 359 real keyboard actions through Tab/Shift+Tab,
  Enter/Space, typing and native select type-ahead. Navigation uses visible links
  and the skip link. Focus checks require active focus, focus-visible/indicator,
  viewport fit and no obstruction. Separate stale/mutation/replay probe tabs may
  use pointer activation; DOM inspection is not keyboard interaction.
- 282 layout samples at 320/360/768px cover main screens, confirmation/error states
  and actions, checking document/task/control horizontal fit and field labels.
  The primary journey runs at 360px. This is not a full assistive-technology,
  visual-contrast, physical-device or cross-browser audit.
- 10 cancellation cases exercise Cancel and Escape with opener focus restored.
  Review rejection additionally preserves the reason and produces no POST.
- Four recovery scenarios pass: pre-dispatch download failure with unchanged
  data; lost post-commit response with exactly one persisted mutation,
  authoritative UI refresh and no replay; bounded failed workspace reads with
  focused error and keyboard retry; oversized/truncated archive rejection,
  same-file consent/error reset and valid restore with reload/restart preservation.
  Archive bytes use the file-input API; native OS file chooser UX is excluded.
- Graceful shutdown/restart preserves canonical workspace state and releases the
  database lock. Bounded startup/reload observations show no automatic provider
  work; they do not simulate an overnight-open browser.
- Anonymous/foreign-origin requests, stale replay, changed approvals and
  suppression before handoff are refused. UI suppression excludes the contact
  from the next actual CSV download.
- Download bytes pass strict UTF-8/CSV parsing, exact formula neutralization,
  leading-BOM/control/newline/quote/Unicode, identity and eligibility checks.
  The edge export has seven eligible rows. A separate real-PGlite regression
  verifies stored BOM bytes and the JSON projection preserves driver output.
- Fictional stub calls: hunt 2, discovery 2, retrieve 6. Aborted compose 2;
  unexpected browser requests 0 and forbidden provider attempts 0. Teardown passed.

After the final ReviewCard UI/harness change, production build/typecheck passed,
lint had zero errors/three existing warnings, and component checks passed 7/7.
The expanded operator suite passed 255+84 immediately before that change, with
no later server changes. Earlier operator 255+64, auth 18/18 and combined 49/49
remain evidence at their recorded sources, not an exact-final-source rerun.
See [the integration report](../../../docs/implementation-lanes/2026-10-28-local-integration.md).

Real-provider usefulness, provenance/freshness, time/cost and owner acceptance
remain open. Follow [the owner guide](../../../docs/LOCAL-APP-FINAL-ACCEPTANCE.md);
the owner need not repeat the automated recovery drills. No live provider,
email delivery, GitHub merge, deployment or hosted-plan completion is claimed.

---

## Historical records below

These records retain the limits and next steps observed at their original
checkpoints. Their pending browser/keyboard/recovery items are superseded by
the final Mac evidence above; they are not current instructions.

# Historical native boundary / strict CSV correction — 2026-10-28

Base: PR139 `cc2464645f52b50256b8acbdf5583c0e6129886b`.
Ownership: only `operator/acceptance/browser-workflow/`.
This section supersedes earlier statements that JS guards contain native APIs.
Historical browser evidence below is unchanged and is not proof of this wrapper.

Independent reproduction, before fixes: under the previous `guard.mjs`,
`process.binding("spawn_sync").spawn` launched a harmless Node child and returned
its deliberate exit status 23. The old CSV parser accepted `ab"cd"\r\n` as
`abcd`. No reviewer thread-reading tool was available; both defects were
reproduced independently rather than importing the unseen local review commit.

The runner now wraps the complete tree with checked macOS Seatbelt policy.
JS patches moved to `instrumentation.mjs` and apply only in the application
server after independent OS-denial probes. Native child/worker denial checks
and an owned-listener positive probe are in `native-probe.mjs`; fixed browser
transport is 127.0.0.1:8082. Exact capabilities and limitations are in README.
Linux/missing/failed policy stays blocked, with no environment bypass. Stale
PASS evidence is replaced before launch; nonzero child exit cannot pass.

CSV uses a field-state parser: quotes can only begin a field; a closing quote
must precede comma/CRLF; quotes escape only by doubling; record boundaries are
CRLF. Strict UTF-8 decode preserves leading BOM instead of dropping bytes.
Tests include malformed quote placement, unterminated/missing-CRLF rows,
Unicode/control/embedded-newline values and the actual download consumer that
previously accepted malformed quoting as the expected account name.

Linux x86_64, Node v24.22.1, npm 11.9.0, foreground evidence:

- `cd operator && npm ci --no-audit --no-fund`: exit 0, 479 packages.
- `npm run test:unit` in this directory: 44 passed, zero failures/skips.
- `npm test`: exit 1 as intended; 44 unit cases pass, then native containment
  preflight blocks before build/DB/server/browser launch on Linux.
- Owned-path ESLint: exit 0, zero errors/warnings. Also fixes the nine reported
  empty-catch/unnecessary-escape errors, now in orchestrator/workflow sources.
- `git diff --check`: exit 0.

Parent Mac handoff (not executed in this Linux environment):

```sh
cd operator/acceptance/browser-workflow
npm run test:native
npm test
```

`test:native` is exactly `/usr/bin/sandbox-exec -f macos-network.sb node
native-probe.mjs --positive`. It must print `NATIVE_CONTAINMENT_PROBES_PASSED`
and exit 0. Kernel/profile/Chromium compatibility remains unverified here.
The parent owns the combined full browser run and fns/auth source review.
**No reviewed-graph entries/hashes changed.** Reconcile only after substantive
review of the parent's changed source; never blindly regenerate the manifest.

One inherited read-only reviewer was used. Parent launcher exposed no model/
effort selection or runtime-model attestation; no override was selected. The
reviewer independently reran focused tests, and identified/fixed an intermediate
mistake that installed server JS patches in the orchestrator. Final source
keeps only OS admission in the orchestrator, so build/HTTP lifecycle APIs remain
available inside the policy. No broad suite/browser acceptance, real providers,
owner data, secrets, settings/workflows, merge or deployment is claimed.

---

# Historical artifact recovery and real-browser handoff — 2026-10-28

PR132 start verified: `34bbfcde7f00679f80b922b2da9153dd16c893d8`.
`git merge-base --is-ancestor 8838363ef64698f92ac57ac06d564b3d72d4701f HEAD`
exited 0 before edits. Own branch: `codex/browser-artifact-recovery`;
draft target: `codex/browser-workflow-acceptance` (stacked on PR132).
Tested harness source: `2aeb39e2f0dc86a8c0cdc58409f831beff2129d3`.
The subsequent evidence commit changes only this record and `last-run.json`.
All modified paths remain under `operator/acceptance/browser-workflow/`.

Environment: Linux x86_64, Node v24.22.1, npm 11.9.0; isolated Playwright
1.63.0, Chromium headless shell 1243 / 153.0.8010.12.
No parent model/effort selection was exposed; inherited effective model/effort
metadata was not available. One scoped inherited subagent performed read-only
harness review and source diagnosis; no model overrides or agent writes occurred.

## Commands and observed results

- `cd operator && npm ci --no-audit --no-fund`: exit 0, 479 packages.
- `cd acceptance/browser-workflow && npm ci --no-audit --no-fund`: exit 0, 2 packages.
- `npx playwright install chromium` and `npx playwright install chromium --only-shell`:
  each exit 1 after five invalid-ZIP responses. CDN response: 200, HTML, 195 bytes,
  title `Site Unavailable`.
- Official Google CfT exact-version download: 200, ZIP, 119809080 bytes;
  CRC validation passed. SHA-256 and cache reproduction: [ARTIFACT.md](ARTIFACT.md).
  `--version`: `Google Chrome for Testing 153.0.8010.12`. No alternative browser,
  executable override, third-party mirror or package modification.
- Isolated browser/fence probe under a 20-second shell timeout: exit 0;
  launch/connect/context/page, external-origin `ERR_BLOCKED_BY_CLIENT`, page close.
- `npm test` on the tested harness source: **exit 1**; 22 fence/adapter tests
  passed, zero skipped; isolated build and guarded server/auth smoke passed;
  real browser failed at the first prospect workflow. See `last-run.json`.
- `git diff --check`: exit 0. Prettier applied to changed JavaScript/docs.

## Harness corrections

Negative origin probes now use one disposable page each, require the specific
blocked-by-client error, and have explicit five-second navigation/close bounds.
Reusing the denied-navigation page previously interrupted the workflow's root
navigation with `chrome-error://chromewebdata/`. Context operations now have
30-second bounds; fixed checkpoint labels expose progress. Two exploratory runs
were interrupted after stalled waits (exit 130); neither is a passing result.
A follow-up auth-session HTTP probe returned connection refused before the next
runtime launched. No earlier interrupted run is used as final evidence.

The interview uses a task-scoped textbox with an Answer prefix: the prior exact
label lookup timed out on the populated wrapping textarea. Unlock waits use one
combined locator rather than leaving a losing Promise.race locator pending.
Failures retain code locations, fixed classifications and fence/stub counts,
rather than writing diagnostics into a scratch directory that is then deleted.
The prospect probe retains counts and only one allowlisted known UI error;
other alert text is replaced with `unclassified-ui-error`.

## Executed browser subset and exact blocker

Both external and alternate-loopback negative probes refused before any workflow.
Real owner browser login and 16/16 interview submissions/confirmations passed.
Product activation, explicit manual discovery and explored/confirmed draft play
passed. Profile activation invoked fictional hunt once and retrieval once;
manual/initial discovery stubs ran twice. The first prospect card never appeared.
The UI alert was exactly `item.startedAt.startsWith is not a function`.
The final runtime/browser forbidden-attempt counts are zero, including teardown;
no compose request occurred. These counts do not claim that later actions passed.

Cross-scope production finding (not repaired here):
`operator/src/lib/server/fns.ts:288` maps `row.started_at` unchanged to
`startedAt`; `fns.ts:629` then calls `item.startedAt.startsWith(today)`.
`operator/migrations/0003_prospecting.sql:25` defines `started_at` as timestamptz.
A separate fresh in-memory PGlite SELECT of a fictional timestamptz returned a
JavaScript Date (`typeof` object; `startsWith` undefined), confirming the adapter
shape mismatch. The real-browser alert plus these source locations identify the
normalization defect; no row-count/transaction-success inference is made from a
failed workspace projection. Production timestamps must be normalized by their
owning lane; do not change the provider stubs to conceal it or weaken auth.

## Historical unexecuted assertions / next handoff

The first prospect's rendered qualification/owner review, public-source contact
reveal/parser, package approval, exact-message approval, recipient/subject/body
compose checks, aborted Gmail handoff and delivery-unconfirmed labels remain
unexecuted. So do first-workflow CSV bytes, canonical restart comparison,
startup/reload no-work observations, the entire second workflow, changed-message
refusal/reapproval, suppression-before-handoff refusal and CSV exclusion,
stale-tab replay refusal, post-handoff suppression, and all CSV edge-byte cases.
The suite attempted those in order but stopped at the first prospect-card wait;
**zero complete daily workflows** are claimed.

Resume after the owning lane repairs the timestamp projection and makes an
explicit reviewed integration decision. This harness's 27-file reviewed source
graph must reject changed production bytes until independently reviewed; never
regenerate the manifest merely to hide drift. Then rerun `npm test` in this
same directory with the pinned shell. Archive, concurrency, restart-test, auth,
keyboard, responsive and owner/Mac acceptance remain their respective lanes.
No production edits, owner data, real credentials/providers, paid calls, SMTP,
Gmail navigation, merge, deployment, settings/workflow edits or CI polling occurred.
Runtime processes were stopped by the final orchestrator before handoff.

---

## Historical PR132 evidence (before artifact recovery)

# Browser lane evidence and blocker — 2026-10-28

Base verified before edits: `8838363ef64698f92ac57ac06d564b3d72d4701f`.
Branch: `codex/browser-workflow-acceptance`; target: `codex/local-app-integration`.
All changes are inside `operator/acceptance/browser-workflow/`.

Environment: Linux x64, Node `v24.22.1`, npm `11.9.0`.
Installed package observed: Playwright `1.63.0`; browsers.json pins Chromium and
headless shell revision `1243`, version `153.0.8010.12`.

| Command/check                                                                           | Observed outcome                                                                                                                   |
| --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `git ls-remote ... refs/heads/codex/local-app-integration`; clone; `git rev-parse HEAD` | Exact required SHA verified; own branch created, no main checkout                                                                  |
| `cd operator && npm ci`                                                                 | Exit 0, 479 packages                                                                                                               |
| `cd acceptance/browser-workflow && npm ci`                                              | Exit 0, 2 packages; isolated lockfile                                                                                              |
| `npx playwright install chromium`                                                       | Exit 1; all five download attempts returned non-ZIP content                                                                        |
| `npx playwright install chromium --only-shell`                                          | Exit 1; all five attempts returned non-ZIP content                                                                                 |
| HTTP headers for the pinned ZIP                                                         | HTTP 200, `content-type: text/html`, `content-length: 195`; no usable browser archive                                              |
| `node --test fences.test.mjs stubs.test.mjs`                                            | 21 passed, zero skipped/failing at recorded run                                                                                    |
| `npm test`                                                                              | Exit 1 at `pinned-browser-launch`; explicit blocked verdict, not a pass                                                            |
| Isolated Vite build + local PGlite asset copy                                           | Exit 0; required provider interceptions observed                                                                                   |
| Real built server under outbound guards                                                 | Starts at exact loopback origin; child binding acknowledged before HTTP                                                            |
| Real HTTP auth smoke                                                                    | Anonymous session null; signup 404; missing/foreign Origin and cross-site POST 403; bad password 401; owner login/session succeeds |
| Canonical before/after negative HTTP snapshots                                          | All 13 workspace-table counts zero; identical SHA-256 digest                                                                       |
| Final forbidden provider/socket attempts                                                | 0, including teardown                                                                                                              |
| Browser workflow twice / CSV / approval / suppression assertions                        | **NOT EXECUTED**: pinned browser unavailable                                                                                       |
| Mac / owner daily workflow / recovery / acceptance                                      | Outstanding; no acceptance claim                                                                                                   |

The last-run artifact records only counts/digests, classifications and versions;
it does not contain the generated owner password, cookies, provider values or raw
server diagnostics. Tests run in foreground and processes are stopped before
handoff. No reminder, delayed message, CI polling, deploy or merge was created.

Two explicitly scoped subagents were used. Exposed controls allowed
`gpt-6.1-sol` / `medium` for `workflow.mjs` implementation and `gpt-6-astra` /
`high` for read-only security review. The parent launcher exposed no model/effort
selection. Security review corrections include listener ownership acknowledgement,
constructor-path socket/DNS/process guards, redirect refusal, package/stub
interception assertions, sanitized diagnostics and post-teardown counters. A
reported generated-stub newline concern was independently checked by executing
the emitted modules; NDJSON tests pass. Source review is not browser evidence.
