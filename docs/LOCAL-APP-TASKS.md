# Reliable local app — shortest completion path

Updated: 2026-10-28. Owner's target: **a reliable local app for personal use**.

Use the existing `operator/` application in [PR #125](https://github.com/SJS1001/PROspector/pull/125) as the implementation foundation. Deliver one owner, one company, durable local data, manual runs and explicit Gmail compose handoff first. Browser launch is sufficient for this release.

This checklist defines the local release separately from the hosted `site/` programme. It does not complete hosted plans or authorize provisioning, deployment, provider spend, email delivery or use of the retired original target. A checked implementation task needs its own recorded verification; writing this list does not accept the app.

## Current release checkpoint — 2026-10-28

The owner accepted the app for personal local use by instruction ("assume the app is good") and authorized final GitHub integration. No further owner acceptance walkthrough is required. Real-provider result quality and cost have not been measured; that optional evaluation is not a blocker for the accepted local release.

The release adds **App launcher**, a native macOS menu bar app styled to match OPUS Master Control. Start opens the frontend/backend together; Stop and Restart shut down the managed server gracefully. The launcher opens at login; the backend starts on demand. See the [launcher guide](../operator/launcher/README.md).

Final launcher verification: 267 script + 64 source tests pass (331 total), including nine new controller tests. Lint has zero errors and three existing warnings. Native compile/sign/install and actual start/stop pass. The [release setup report](implementation-lanes/2026-10-28-app-launcher.md) records final UI checks and remaining limits. Earlier browser/access/recovery evidence is retained in the integration report and handoff.

PR #131 consolidates the local implementation into `main`; the final synchronization result is recorded in the release setup report. Hosted deployment and real-provider spending remain separate.

## Synchronization checkpoint

- [x] **SYNC-01 — Update local main from GitHub.** Fast-forwarded the clean checkout from `599ed1bbbf1bab09a0fd372f88cb4007ada3b7c5` to `29af13c4e794e6cc3f7dabbcc792eacb488a89ef`; local main and live GitHub main matched, 0 ahead / 0 behind. No source conflicts or local source edits existed.
- [x] **SYNC-02 — Refresh the proposed local-app source.** Fetched `operator-os`; PR #125 remains open at `2d476b9d2e6bc37f1352444dd95de58b5537f798`. Its source is available through `origin/operator-os`; it is not part of main and was not merged.

Check the exact branch being used, rather than assuming a clean main includes the unmerged local app. The entries above record the initial synchronization baseline. The parent directory's ZIP and review files are outside the Git checkout.

## Execution order

Integrate independent lanes into one candidate and run fixed-port runtime suites serially. Stabilize configuration and persistence before repairing tests whose assumptions depend on them. Use fictional data and stubbed providers until the separately authorized real-provider acceptance step.

| Order | Task | Depends on | Completion evidence |
|---|---|---|---|
| 1 | LOCAL-01: reproducible local startup and owner access | SYNC-01/02 | Fresh checkout launches on loopback; owner access and negative requests verified |
| 2 | LOCAL-02: manual actions and no automatic dispatch | LOCAL-01 | No SMTP send, paid reveal or background provider work from startup, retry or restore |
| 3 | LOCAL-03: persistent workspace and stable identity | LOCAL-01/02 | Process restart preserves workspace and credentials without exposing values |
| 4 | LOCAL-04: complete backup and restore | LOCAL-03 | Empty-database round-trip, corruption rejection and rollback pass |
| 5 | LOCAL-05: clean verification commands | LOCAL-01–04 | Install, build, typecheck, lint and the complete operator test command pass |
| 6 | LOCAL-06: useful end-to-end workflow and CSV | LOCAL-01–05 | Browser journey and separately bounded provider-quality evidence |
| 7 | LOCAL-07: owner acceptance and release checkpoint | LOCAL-06 | Automated fictional workflows/recovery evidence, reviewed commit and owner usefulness acceptance |

### LOCAL-01 — Make local startup and owner access reproducible

- [x] Work on a dedicated fix branch based on the refreshed PR #125 head; inspect any branch-specific rules first. Do not merge it merely to get its files locally.
- [x] Bind the application to loopback. Choose and document a supported local owner-access mechanism, including first-run setup, restart and recovery. Preserve server-side origin/CSRF checks and workspace ownership.
- [x] Remove dependence on private sandbox assets/configuration and sandbox-only OAuth callbacks. A clean checkout must contain or generate every required public asset and configuration template.
- [x] Verify documented install/start commands on this Mac, successful owner access, denied unauthorized access and rejected cross-origin mutations. Record commands and results without secret values.

### LOCAL-02 — Keep the first release manual and prevent accidental effects

- [x] Disable automatic SMTP dispatch server-side. Reject terminal/replayed handoffs and elect one concurrent handoff at the database boundary.
- [x] Retain exact package/message approval and explicit compose handoff with current suppression rechecks. Display handoff/delivery-unconfirmed status accurately; never infer delivery from opening compose.
- [x] Make morning work an explicit action. Startup, reload, an overnight-open browser and restore must not trigger provider work implicitly. Disable paid contact reveal by default.
- [x] Verify duplicate requests, concurrent tabs, stale approvals, suppression changes and restart cannot send or spend. Test with instrumented stubs; no real email is needed for these checks.

### LOCAL-03 — Preserve the workspace across restarts

- [x] Replace the in-memory PGlite fallback with durable local storage in a stable user-data directory. Include migrations, restrictive permissions and a clear supported database path.
- [x] Persist the owner/session and vault configuration needed to reopen the workspace. Keep secrets out of Git, browser bundles, logs and portable plaintext exports.
- [x] Enter a fictional workspace with prospects, contacts, approvals and suppressions; stop the server, restart it and compare records and history. Verify saved provider configuration remains usable through a stub without displaying its secret.

### LOCAL-04 — Make backup and restore trustworthy

- [x] Define a versioned backup covering the full agreed workspace and decision/message history. Restore the agreed collections and history, rather than only interview answers.
- [x] Validate format/version, integrity and references before applying a transactional restore. Reject unsupported/corrupt archives without partial writes. Keep provider secrets excluded unless an explicit encrypted format is implemented.
- [x] Restore into an empty local database and compare every agreed collection, including suppression and approvals/history. Prove interrupted restore rolls back and restored state does not re-enable sends, schedules or paid grants.

### LOCAL-05 — Repair and pass the real verification commands

- [x] Reconcile stale template/auth/metadata fixtures with the supported local contract; supply required tracked assets and fix the lint error. Preserve meaningful safety assertions rather than deleting them to get green output.
- [x] From a fresh operator checkout run `npm ci`, `npm run build`, `npm run typecheck`, `npm run lint` and the complete `npm test`. Record the exact source commit, environment, exit status and positive test counts.
- [x] Include server/database regression checks for persistence, restore, ownership, suppression, replay and concurrent commands; passing pure reducers alone is insufficient.

Review baseline, not a fresh result for future fixes: at operator head `2d476b9`, build and typecheck passed; the script-test stage had 177 passes / 18 failures, preventing the chained domain stage from running. Separately executed domain/auth/retrieval tests passed 64/64. Lint reported one error and six warnings. Re-run after fixes; these figures are not release acceptance.

### LOCAL-06 — Prove one useful daily workflow

- [x] Exercise the actual browser/server/database path with fictional provider stubs: company interview → confirmed knowledge → ready product/profile → manual prospect run → evidence-backed qualification → owner review → eligible contact → package approval → exact-message approval → explicit compose → CRM handoff.
- [x] Verify CSV escaping, spreadsheet-formula handling, eligible rows, suppression, focused error recovery, keyboard operation and 320/360/768px reflow. The final contained browser run includes reload, stale tabs, failed/lost responses and restart. Native file chooser, overnight-open simulation and a full assistive-technology/device audit are outside this bounded proof.
- [ ] Configure one AI provider and one contact route only when their separately authorized bounded use is available. Compare a small owner-labelled sample with manual research; record useful matches, contact provenance/freshness, time and cost. Offline fixtures demonstrate mechanics, not real prospect quality.

### LOCAL-07 — Accept and checkpoint the local release

- [x] Owner decision: personal local use accepted by explicit instruction on 2026-10-28. Further walkthrough waived. Live usefulness, provenance and cost evaluation remain optional and unmeasured.
- [x] Write a short runbook: start/stop, data location, backups/restore, provider setup, manual morning action and recovery from errors. Reconcile continuation pointers so future work finds this local target without changing hosted phase credit.
- Final integration: the owner authorized PR #131 into main. The merge result and clean local/GitHub commit comparison are recorded in the release handoff and completion response.

## Keep outside this release's critical path

Defer Cloudflare provisioning/Access/hosted proof, unattended scheduling, automatic SMTP, paid reveal, additional AI providers, Electron packaging and general distribution installers. The requested personal macOS menu bar launcher is included in this release. Preserve their existing gates. Do not merge all remaining hosted PRs into the local app; reuse individual components only when they reduce a demonstrated local gap.

Main's guarded demo smoke failure and review-retry ordering defect remain separate `site/` work. This local checklist does not mark them fixed or close the hosted contact, quality, UI or browser-acceptance issues by analogy.

## Daily use

Open **App launcher** and click **Start PROspector**. Review any live-provider connections privately before choosing a research run. No hosted deployment or further acceptance drill is required.
