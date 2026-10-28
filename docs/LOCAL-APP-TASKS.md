# Reliable local app — shortest completion path

Updated: 2026-10-28. Owner's target: **a reliable local app for personal use**.

Use the existing `operator/` application in [PR #125](https://github.com/SJS1001/PROspector/pull/125) as the implementation foundation. Deliver one owner, one company, durable local data, manual runs and explicit Gmail compose handoff first. Browser launch is sufficient for this release.

This checklist defines the local release separately from the hosted `site/` programme. It does not complete hosted plans or authorize provisioning, deployment, provider spend, email delivery or use of the retired original target. A checked implementation task needs its own recorded verification; writing this list does not accept the app.

## Current integration checkpoint

The combined candidate is now on `codex/local-app-integration`, based on `operator-os`, integrating PRs #127–#130. See [the integration report](implementation-lanes/2026-10-28-local-integration.md) for current evidence and remaining tasks. The unchecked detailed items below are the original release criteria, not a claim that implementation has not started. Owner acceptance remains open.

## Synchronization checkpoint

- [x] **SYNC-01 — Update local main from GitHub.** Fast-forwarded the clean checkout from `599ed1bbbf1bab09a0fd372f88cb4007ada3b7c5` to `29af13c4e794e6cc3f7dabbcc792eacb488a89ef`; local main and live GitHub main matched, 0 ahead / 0 behind. No source conflicts or local source edits existed.
- [x] **SYNC-02 — Refresh the proposed local-app source.** Fetched `operator-os`; PR #125 remains open at `2d476b9d2e6bc37f1352444dd95de58b5537f798`. Its source is available through `origin/operator-os`; it is not part of main and was not merged.

Check the exact branch being used, rather than assuming a clean main includes the unmerged local app. The parent directory's ZIP and review files are outside the Git checkout.

## Execution order

Work down this list in one implementation lane. Stabilize configuration and persistence before repairing tests whose assumptions depend on them. Use fictional data and stubbed providers until the separately authorized real-provider acceptance step.

| Order | Task | Depends on | Completion evidence |
|---|---|---|---|
| 1 | LOCAL-01: reproducible local startup and owner access | SYNC-01/02 | Fresh checkout launches on loopback; owner access and negative requests verified |
| 2 | LOCAL-02: manual actions and no automatic dispatch | LOCAL-01 | No SMTP send, paid reveal or background provider work from startup, retry or restore |
| 3 | LOCAL-03: persistent workspace and stable identity | LOCAL-01/02 | Process restart preserves workspace and credentials without exposing values |
| 4 | LOCAL-04: complete backup and restore | LOCAL-03 | Empty-database round-trip, corruption rejection and rollback pass |
| 5 | LOCAL-05: clean verification commands | LOCAL-01–04 | Install, build, typecheck, lint and the complete operator test command pass |
| 6 | LOCAL-06: useful end-to-end workflow and CSV | LOCAL-01–05 | Browser journey and separately bounded provider-quality evidence |
| 7 | LOCAL-07: owner acceptance and release checkpoint | LOCAL-06 | Two complete daily workflows, recovery drill, reviewed commit and owner acceptance |

### LOCAL-01 — Make local startup and owner access reproducible

- [ ] Work on a dedicated fix branch based on the refreshed PR #125 head; inspect any branch-specific rules first. Do not merge it merely to get its files locally.
- [ ] Bind the application to loopback. Choose and document a supported local owner-access mechanism, including first-run setup, restart and recovery. Preserve server-side origin/CSRF checks and workspace ownership.
- [ ] Remove dependence on private sandbox assets/configuration and sandbox-only OAuth callbacks. A clean checkout must contain or generate every required public asset and configuration template.
- [ ] Verify documented install/start commands on this Mac, successful owner access, denied unauthorized access and rejected cross-origin mutations. Record commands and results without secret values.

### LOCAL-02 — Keep the first release manual and prevent accidental effects

- [ ] Disable automatic SMTP dispatch server-side. Current `openInGmail` accepts already-sent states and its unconditional lease update does not elect one concurrent sender. Hiding the button is insufficient.
- [ ] Retain exact package/message approval and explicit compose handoff with current suppression rechecks. Display handoff/delivery-unconfirmed status accurately; never infer delivery from opening compose.
- [ ] Make morning work an explicit action. Startup, reload, an overnight-open browser and restore must not trigger provider work implicitly. Disable paid contact reveal by default.
- [ ] Verify duplicate requests, concurrent tabs, stale approvals, suppression changes and restart cannot send or spend. Test with instrumented stubs; no real email is needed for these checks.

### LOCAL-03 — Preserve the workspace across restarts

- [ ] Replace the in-memory PGlite fallback with durable local storage in a stable user-data directory. Include migrations, restrictive permissions and a clear supported database path.
- [ ] Persist the owner/session and vault configuration needed to reopen the workspace. Keep secrets out of Git, browser bundles, logs and portable plaintext exports.
- [ ] Enter a fictional workspace with prospects, contacts, approvals and suppressions; stop the server, restart it and compare records and history. Verify saved provider configuration remains usable through a stub without displaying its secret.

### LOCAL-04 — Make backup and restore trustworthy

- [ ] Define a versioned backup covering the full agreed workspace and decision/message history. Current restore only reloads interview answers despite exporting other collections.
- [ ] Validate format/version, integrity and references before applying a transactional restore. Reject unsupported/corrupt archives without partial writes. Keep provider secrets excluded unless an explicit encrypted format is implemented.
- [ ] Restore into an empty local database and compare every agreed collection, including suppression and approvals/history. Prove interrupted restore rolls back and restored state does not re-enable sends, schedules or paid grants.

### LOCAL-05 — Repair and pass the real verification commands

- [ ] Reconcile stale template/auth/metadata fixtures with the supported local contract; supply required tracked assets and fix the lint error. Preserve meaningful safety assertions rather than deleting them to get green output.
- [ ] From a fresh operator checkout run `npm ci`, `npm run build`, `npm run typecheck`, `npm run lint` and the complete `npm test`. Record the exact source commit, environment, exit status and positive test counts.
- [ ] Include server/database regression checks for persistence, restore, ownership, suppression, replay and concurrent commands; passing pure reducers alone is insufficient.

Review baseline, not a fresh result for future fixes: at operator head `2d476b9`, build and typecheck passed; the script-test stage had 177 passes / 18 failures, preventing the chained domain stage from running. Separately executed domain/auth/retrieval tests passed 64/64. Lint reported one error and six warnings. Re-run after fixes; these figures are not release acceptance.

### LOCAL-06 — Prove one useful daily workflow

- [ ] Exercise the actual browser/server/database path: company interview → confirmed knowledge → ready product/profile → manual prospect run → evidence-backed qualification → owner review → eligible contact → package approval → exact-message approval → explicit compose → CRM handoff.
- [ ] Verify CSV escaping, spreadsheet-formula handling, eligible rows, suppression, useful error recovery, keyboard operation and narrow-screen use. Include reload, two tabs, interrupted requests and restart.
- [ ] Configure one AI provider and one contact route only when their separately authorized bounded use is available. Compare a small owner-labelled sample with manual research; record useful matches, contact provenance/freshness, time and cost. Offline fixtures demonstrate mechanics, not real prospect quality.

### LOCAL-07 — Accept and checkpoint the local release

- [ ] Complete the daily workflow twice, including restart and an empty-database recovery drill. Record remaining limitations plainly and obtain the owner's local-use acceptance.
- [ ] Write a short runbook: start/stop, data location, backups/restore, provider setup, manual morning action and recovery from errors. Reconcile continuation pointers so future work finds this local target without changing hosted phase credit.
- [ ] Review the final source and verification evidence before requesting merge approval for the local-app PR. After an authorized merge, fast-forward local main and verify clean status plus identical local/GitHub commits. Do not deploy as part of local acceptance.

## Keep outside this release's critical path

Defer Cloudflare provisioning/Access/hosted proof, unattended scheduling, automatic SMTP, paid reveal, additional AI providers, Electron packaging and installers. Preserve their existing gates. Do not merge all remaining hosted PRs into the local app; reuse individual components only when they reduce a demonstrated local gap.

Main's guarded demo smoke failure and review-retry ordering defect remain separate `site/` work. This local checklist does not mark them fixed or close the hosted contact, quality, UI or browser-acceptance issues by analogy.

## Next executable task

Review the combined integration candidate and complete the remaining owner/browser acceptance in the linked integration report. Merge only after owner approval; then update the local release checkout to the approved branch. No hosted deployment is required.
