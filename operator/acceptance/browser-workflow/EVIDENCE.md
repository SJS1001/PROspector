# Artifact recovery and real-browser handoff — 2026-10-28

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

## Exact unexecuted assertions / next handoff

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
