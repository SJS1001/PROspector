# Reliable local app: integration report and remaining tasks

2026-10-28. Target: one-owner local app for personal use, using `operator/` on `operator-os`. No hosted phase credit changes.

## Candidate and synchronization

Branch `codex/local-app-integration` starts at `operator-os` commit `2d476b9d2e6bc37f1352444dd95de58b5537f798`. It combines all seven implementation commits from draft PRs #128 (foundation), #130 (manual workflow), #129 (archive), and #127 (regressions). The only cherry-pick conflict was the import list in `fns.ts`; both lanes' function changes were retained. The original checklist from PR #126 is included at `docs/LOCAL-APP-TASKS.md`.

GitHub `main` remains `29af13c4e794e6cc3f7dabbcc792eacb488a89ef`. The local app is not on main. The integration branch is the review/release candidate; do not merge the four source PRs again on top of it. Refresh remote refs before an approved merge. The original checkout and its untracked `error.log` are preserved.

## Integration findings resolved

- The archive adapter referenced a removed DB export. It now uses the same migrated durable client and pinned transaction callback as the app.
- Normal workspace loading overwrote restored knowledge metadata. Seed insertion now leaves existing knowledge rows intact.
- Archive validation omitted the manual lane's `handed_off` and `manual_handoff` classifications. Both now round-trip.
- An older archive could erase a consumed handoff and allow another compose URL. Restore now rejects the whole transaction before mutation when it would erase current terminal/message handoff history. Export a current archive before recovery.
- Legacy sent/Gmail states remain terminal after restore. Cross-owner restoration maps message IDs to the canonical preparation identity, preventing a fresh duplicate message from bypassing history.
- Updated stale hosting tests and manual-action harness to assert the exact local Node/Host/Origin boundary. Provider fences remain intact.

## Mac verification

Darwin arm64, Node v24.16.0, npm 11.13.0. Fresh dependency installation used `npm ci --no-audit --no-fund`: exit 0, 471 packages. All checks below ran on the combined candidate after production fixes; later changes are documentation plus an exact-Host improvement to the foreign-Origin test fixture, whose focused seven tests passed again.

| Check | Result |
| --- | --- |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0; 3 unused-variable warnings, no errors |
| `npm run build` | exit 0; local Node output and PGlite assets generated |
| `npm test` | exit 0; 251 script + 64 source tests, zero failures |
| `node scripts/test-all.mjs` | exit 0; 251 script + 84 source tests, zero failures |
| `node --test acceptance/local-contracts.test.mjs` | exit 0; 17 passed, zero skipped/failing |
| Independent source review and acceptance rerun | no remaining concrete high/medium findings; 17/17 passed |
| `git diff --check` | exit 0 |

The script suite includes production/dev HTTP owner admission, negative Host/Origin/proxy checks, persisted-session restart/logout/password recovery, separate-process durable DB checks, and the new real archive-adapter roundtrip/reload/rollback/restart check. Source tests include the archive inventory, corruption/reference/ownership rejection and overlapping transactional restores. The 17 handler contracts exercise real workflow handlers with fictional PGlite and hard-failing provider stubs, including three backup/replay regressions. Handler contracts do not substitute for HTTP or browser evidence.

Built-app smoke: started the production launcher against a newly enrolled disposable fictional owner and physical temporary data directory. In the in-app browser, unlocked the workspace, navigated Home → Connections, downloaded a valid version-1 JSON archive (19 tables, 16 seed knowledge items, checksum present), and signed out to the unlock page. Captured screenshot outside Git in the parent handoff directory. Stopped the disposable runtime. No real provider keys/data, Gmail invocation, email, paid lookup or deployment was used. This is a browser smoke, not the full acceptance matrix.

## Shortest remaining task list

- [x] Combine the four lanes on one candidate branch and resolve integration failures.
- [x] Verify local startup, durable state, manual safeguards and archive safety with fictional automated evidence on this Mac.
- [x] Review the combined source independently and pass the complete checks.
- [x] Verify built-app owner login/navigation/backup download/logout in the browser.
- [ ] Complete the fenced browser matrix in `operator/acceptance/README.md`: full fictional journey twice, concurrent/stale tabs, suppression, recovery and narrow-screen/keyboard behavior. Current provider stubs are handler-only; provider-dependent browser steps need a separate instrumented runtime with outbound server/browser network fences.
- [ ] Owner acceptance: complete two useful daily workflows, including restart and an empty-database recovery drill. Any real-provider quality/cost sample requires separate bounded authorization; mechanics passing does not prove prospect quality.
- [ ] Review and approve the integration PR merge into `operator-os`; no merge is performed by this report.
- [ ] After the approved merge, fast-forward the chosen local release checkout and verify its commit equals GitHub. Moving the local app into main is a separate branch decision because main currently contains the hosted app.

Use `operator/README.md` for start/stop, data location and recovery. Keep Cloudflare deployment, automatic SMTP, paid reveal, unattended scheduling, extra providers and desktop packaging off the completion path. The automated implementation is reviewable; LOCAL-07 owner acceptance remains open.
