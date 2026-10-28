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
