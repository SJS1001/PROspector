# Reliable local app: integration report and remaining tasks

2026-10-28. Target: one-owner local app for personal use, using `operator/` on `operator-os`. No hosted phase credit changes.

## Candidate and synchronization

Branch `codex/local-app-integration` starts at `operator-os` commit `2d476b9d2e6bc37f1352444dd95de58b5537f798`. It integrates the implementation, acceptance and hardening work from PRs #127–#141; draft PR #131 is the single integrated review candidate. The final browser-tested source is `76976635c0267bd3f9a5d7f2b5392b2ef59dd3fd`, including the CSV repair at `60f481f` and keyboard/reflow/recovery repairs. The final evidence/documentation checkpoint changes no production source. The candidate is published on the matching GitHub branch; the final live-ref comparison is recorded in the external session handoff. The only cherry-pick conflict was the import list in `fns.ts`; both lanes' function changes were retained. The original checklist from PR #126 is included at `docs/LOCAL-APP-TASKS.md`.

GitHub `main` remains `29af13c4e794e6cc3f7dabbcc792eacb488a89ef`. The local app is not on main. The integration branch is the review/release candidate; do not merge the source PRs again on top of it. Refresh remote refs before an approved merge. The original checkout and its untracked `error.log` are preserved.

## Integration findings resolved

- The archive adapter referenced a removed DB export. It now uses the same migrated durable client and pinned transaction callback as the app.
- Normal workspace loading overwrote restored knowledge metadata. Seed insertion now leaves existing knowledge rows intact.
- Archive validation omitted the manual lane's `handed_off` and `manual_handoff` classifications. Both now round-trip.
- An older archive could erase a consumed handoff and allow another compose URL. Restore now rejects the whole transaction before mutation when it would erase current terminal/message handoff history. Export a current archive before recovery.
- Legacy sent/Gmail states remain terminal after restore. Cross-owner restoration maps message IDs to the canonical preparation identity, preventing a fresh duplicate message from bypassing history.
- Updated stale hosting tests and manual-action harness to assert the exact local Node/Host/Origin boundary. Provider fences remain intact.
- Owner-auth throttling no longer trusts spoofable client IP headers; the combined Mac HTTP auth checks passed 18/18.
- The production Node entry now drains HTTP requests before closing PGlite and releasing its database lock. This repairs the shutdown/restart failure reached by the real browser workflow.
- Browser acceptance now admits the complete process tree only under the reviewed macOS network policy. Its outer test launcher invalidates old PASS evidence before unit checks, including when those checks fail.
- PGlite's plain-text result decoding stripped a leading BOM from stored contact names even though the database bytes were intact. The CSV contact projection now uses `to_json(c.full_name)` to preserve the value through both PGlite and PostgreSQL drivers; the real-database manual-workflow regressions passed 31/31.

## Mac verification

Darwin arm64, Node v24.16.0, npm 11.13.0. The fresh dependency installation used `npm ci --no-audit --no-fund`: exit 0, 471 packages. Earlier serial tests include the auth, shutdown and CSV repairs through `60f481f`. The expanded 255+84 suite passed immediately before the final ReviewCard UI/harness change, with no later server changes; it is not presented as an exact-final-source full-suite rerun. After that change, build/typecheck passed, lint had zero errors/3 existing warnings and component checks passed 7/7. The final public browser command passed at `7697663`.

| Check | Result |
| --- | --- |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0; zero errors, 3 existing warnings |
| `npm run build` | exit 0; local Node output and PGlite assets generated |
| Earlier operator `npm test` | exit 0; 255 script + 64 source tests, zero failures |
| `node scripts/test-all.mjs` immediately before final ReviewCard UI/harness change | exit 0; 255 script + 84 source tests, zero failures; no later server changes |
| `node --test acceptance/local-contracts.test.mjs` | exit 0; 18 passed, zero skipped/failing |
| Earlier combined handler/archive/concurrency/component-focus/CSS acceptance | exit 0; 49 passed, zero failures; historical combined result |
| Component checks after final ReviewCard change | exit 0; 7 passed |
| Durable HTTP restart acceptance | final rerun: exit 0; 2 passed; saved ciphertext digest and workflow-table counts unchanged; automatic/outbound calls zero |
| `node --test acceptance/auth-runtime/*.test.mjs` | final combined Mac run: exit 0; 18 passed |
| Browser harness units at `7697663` | exit 0; 46 passed, zero failures/skips |
| Browser harness public `npm test` at `7697663` | exit 0; 46 units and complete contained Mac workflow PASS; 359 keyboard actions, 282 layout samples, 10 cancellation cases, four recovery scenarios |
| Manual-workflow real-database regression cases | exit 0; 31 passed, including exact CSV BOM bytes |
| Independent source review | archive replay, native containment, stale-evidence and CSV driver projection reviewed; no remaining high/medium findings reported |
| `git diff --check` | exit 0 |

Fixed-port HTTP suites must run serially. An earlier concurrent run collided on 8080 and is invalid evidence; the valid results above come from serial runs at the source scopes stated.

The script suite includes production/dev HTTP owner admission, negative Host/Origin/proxy checks, persisted-session restart/logout/password recovery, separate-process durable DB checks, and the new real archive-adapter roundtrip/reload/rollback/restart check. Source tests include the archive inventory, corruption/reference/ownership rejection and overlapping transactional restores. The 18 handler contracts exercise real workflow handlers with fictional PGlite and hard-failing provider stubs, including three backup/replay regressions. Handler contracts do not substitute for HTTP or browser evidence.

Built-app smoke: started the production launcher against a newly enrolled disposable fictional owner and physical temporary data directory. In the in-app browser, unlocked the workspace, navigated Home → Connections, downloaded a valid version-1 JSON archive (19 tables, 16 seed knowledge items, checksum present), and signed out to the unlock page. Captured screenshot outside Git in the parent handoff directory. Stopped the disposable runtime. No real provider keys/data, Gmail invocation, email, paid lookup or deployment was used. This is a browser smoke, not the full acceptance matrix.

The integrated timestamp regression reproduced a real PGlite `Date` reaching `ranToday` and throwing on `.startsWith`. Workspace timestamp DTOs now normalize to ISO strings and daily-run comparison accepts actual driver dates. The pinned Playwright 1.63.0 / Chromium 1243 (153.0.8010.12) installed normally on this Mac, and the native-contained browser has executed two fictional workflows with restart, stale-tab replay refusal, changed-message refusal/reapproval and suppression-before-handoff refusal. Gmail navigation was aborted by the fence. The earlier browser rerun at `5eb5c1e` passed with two fictional workflows across restart and matching canonical workspace digests. It verified stale/replayed handoff and changed-approval refusal, email suppression with CSV exclusion, and seven CSV edge rows including exact BOM bytes. Both compose navigations were aborted; unexpected and forbidden network counts were zero. Fictional stubs recorded 2 hunt, 2 discovery and 6 retrieve calls. Teardown passed. The native macOS policy provides network isolation only; this result makes no filesystem isolation claim.

The earlier `5eb5c1e` run checked selected 360px bounds and keyboard unlock recovery. The expanded run exercises both primary journeys with Tab/Shift+Tab, Enter/Space, typing and native select type-ahead; visible navigation and the skip link replace direct route jumps. It samples 320/360/768px across main screens, confirmation/error states and actions, checking horizontal fit, associated field labels and visible, unobscured on-screen keyboard focus. Cancel/Escape checks include restored opener focus without provider work. Separate stale/mutation/replay probe tabs may use pointer activation. At `7697663`, the public browser command passed with 359 keyboard actions, 282 layout samples and 10 cancellation cases. Review rejection Cancel/Escape preserved its reason and generated no POST; all cancellation cases restored opener focus.

Recovery scope includes a failed download before dispatch, a lost response after a committed mutation with authoritative refresh and no replay, bounded failed workspace reads plus keyboard retry, and oversized/truncated archive rejection followed by same-file reselection and valid restore/reload/restart checks. Archive bytes are supplied using the file-input API; native OS file chooser interaction is excluded. Bounded startup/reload observations do not simulate an overnight-open browser. Real-provider usefulness, provenance, time/cost and owner acceptance remain open; see [the owner acceptance guide](../LOCAL-APP-FINAL-ACCEPTANCE.md).

## Shortest remaining task list

- [x] Combine the four lanes on one candidate branch and resolve integration failures.
- [x] Verify local startup, durable state, manual safeguards and archive safety with fictional automated evidence on this Mac.
- [x] Integrate the final auth/browser repairs, review their source and pass the complete checks at the resulting checkpoint.
- [x] Verify built-app owner login/navigation/backup download/logout in the browser.
- [x] Pass the contained Mac browser suite at `7697663`: two fictional workflows, exact CSV bytes, full primary keyboard journey, 320/360/768px geometry/focus checks, 10 cancellation cases and four recovery scenarios. Broader variants remain limited to each suite's actual scope; native file chooser, overnight-open simulation and real-provider quality are excluded.
- [ ] Owner acceptance: privately configure the personal installation if needed, choose explicit bounds for any live provider work, and assess two useful daily workflows for provenance, time and cost using [the owner guide](../LOCAL-APP-FINAL-ACCEPTANCE.md). Automated restart/recovery drills need not be repeated by the owner. Mechanics passing does not prove prospect quality.
- [ ] Review and approve the integration PR merge into `operator-os`; no merge is performed by this report.
- [ ] After the approved merge, fast-forward the chosen local release checkout and verify its commit equals GitHub. Moving the local app into main is a separate branch decision because main currently contains the hosted app.

Use `operator/README.md` for start/stop, data location and recovery. Keep Cloudflare deployment, automatic SMTP, paid reveal, unattended scheduling, extra providers and desktop packaging off the completion path. The automated implementation is reviewable; LOCAL-07 owner acceptance remains open.
