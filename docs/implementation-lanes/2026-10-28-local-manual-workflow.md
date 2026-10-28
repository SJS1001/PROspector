# Lane B — explicit manual outreach workflow

Source/base: `operator-os` at `2d476b9d2e6bc37f1352444dd95de58b5537f798` (PR #125).
Fix branch: `codex/lane-b-manual-outreach`; target: `operator-os`.
Scope: LOCAL-02, workflow safety after restore in LOCAL-04, eligible manual handoff/CSV in LOCAL-06. No hosted plan or owner/Mac/provider acceptance credit.

## Action log

- 2026-10-28: GitHub connector verified source head equals expected base. Shell `git fetch origin` failed because configured proxy refused connections. Retrieved the missing objects through the authenticated GitHub connector, verified all blob/tree hashes and reconstructed the exact source commit hash locally. Created the fix branch from that exact commit; did not switch to checklist source.
- Read branch AGENTS.md, continuation, greenfield baseline, state/roadmap, Phase 2 activation/review/security/UI records, current 02-99 plan and 02-22 dependency summary, local composition boundary, CI policy, and `docs/LOCAL-APP-TASKS.md` from `codex/local-completion-checklist`. Current owner instruction authorizes this separate operator lane; historical hosted gates remain incomplete.
- Runtime Node `v24.19.0`. Offline dependency installation failed on uncached lockfile packages. With execution-tool network permission, `npm ci --cache /workspace/.npm --no-audit --no-fund --fetch-retries=0 --fetch-timeout=20000` completed, exit 0, 479 packages installed. No dependency pins or CI workflow changes.
- Requested UI implementation sub-agent: `gpt-6.1-terra`, medium reasoning; file ownership is components shell/brief/outreach/contacts/settings/status, workspace hooks and one UI regression file. Controls expose those requested settings, not independent verification of the underlying model. Root effective model identifier is not exposed. Independent security reviewer requested `gpt-6.1-sol`, high reasoning, read-only implementation ownership and its own report. These two scoped agents were used; no runtime attestation beyond exposed controls is claimed.
- Confirmed baseline hazards: SMTP in `openInGmail`, repeat sent-state admission, unconditional lease update, mount-triggered `tickSchedule`, incomplete CSV eligibility and no formula handling.

- The supported network permission also allowed `git fetch --refetch origin operator-os:refs/remotes/origin/operator-os codex/local-completion-checklist:refs/remotes/origin/codex/local-completion-checklist`, exit 0. This completed the source history and verified `origin/operator-os` still equals the exact base above. The earlier connector reconstruction is not a substitute for this successful fetch.
- Replaced the SMTP/AI handoff path with a parameterized SQL compare-and-set and atomic delivery-unconfirmed event. Current owner, approved Passed prospect, eligible published/verified contact, package approval/content, exact message digest/acknowledgement and all six suppression scopes are required. One winner receives the complete compose URL; URLs are never stored or replayed and no sent timestamp is written.
- Prevented prepare/approve from rearming handed-off or legacy sent states. Independent review reproduced a contact-transplant race in the first candidate; direct target relationship predicates and two regressions close it.
- Removed automatic shell tick, inbox scans, credit refreshes, and scheduled processing. Legacy tick requires literal manual intent and starts only the existing manual hunt. Saved/restored schedule flags cannot enable processing. Paid contact adapters are absent from the action; public-source lookup remains explicitly triggered. Saving keys has no provider callback.
- CSV and its preview share current eligibility, package approval and suppression checks, deterministic ordering, stable prospect/contact IDs, quote/newline escaping and formula-prefix protection. Gmail UI reserves a blank window synchronously before claiming a handoff, refuses the mutation if popups are blocked, and navigates only the returned Gmail URL.

## Verification evidence

Environment: Linux cloud task, Node `v24.19.0`, npm `11.9.0`; base as above. All commands below run from `operator/` except Git checks. Final implementation source is the commit containing this record; independent review records SHA-256 file identities. No lockfile, workflow, migration, db/auth implementation or hosted `site/` changes.

| Command | Exit / positive evidence |
| --- | --- |
| `npm ci --cache /workspace/.npm --no-audit --no-fund --fetch-retries=0 --fetch-timeout=20000` | 0; 479 packages |
| `node --test scripts/manual-workflow.test.mjs scripts/manual-workflow-actions.test.mjs scripts/manual-workflow-ui.test.mjs` | 0; **41 pass, 0 fail**, 0 skipped/cancelled (30 database, 7 server-action/middleware, 4 UI source-contract cases) |
| `npm run typecheck` | 0; final candidate |
| `npm run build` | 0; final candidate. Local build only; external migration skipped because DATABASE_URL is unset. |
| `npm test` | 1; **218 pass, 18 fail**, 0 skipped/cancelled. Script stage fails before chained domain stage. The 18 failures are unchanged template/brand/auth-env/metadata/migration-layout/missing skill-assets failures; no assertions weakened. |
| `node --experimental-strip-types --test src/lib/app-data/app-data.test.ts src/lib/app-data/readiness-schedule.test.ts src/lib/auth/gate-identity.test.ts src/lib/auth/sign-in-gate.test.ts src/lib/domain/qualify.test.ts src/lib/server/retrieve.test.ts` | 0; **64 pass, 0 fail**, 0 skipped/cancelled |
| `npm run lint` | 1; baseline `src/lib/app-data/client.server.ts:281` empty block error; four warnings. Lane D owns this repair. |
| `./node_modules/.bin/eslint src/lib/server/fns.ts src/lib/server/manual-workflow.ts src/lib/workspace.ts src/components/{shell,brief-view,outreach-view,contacts-view,settings-view,status-view}.tsx scripts/manual-workflow*.test.mjs` | 0; no errors, one pre-existing unused `DraftPlay` import warning in fns.ts |
| `git diff --check` | 0 |

Default sandbox child test execution sometimes reports file-level totals only; the case-level totals above come from the permitted foreground runs, not inferred totals. Full-suite 218 includes the 41 new focused cases. Independent review separately ran database 30/30 and UI 4/4; see [security review](2026-10-28-local-manual-workflow-security.md).

Database evidence uses checked migrations and fictional PGlite state. It covers eligible handoff, exact content, arbitrary IDs, foreign ownership, eight concurrent calls/one winner, replay, stale package/message/contact state, all suppression scopes after approval, suppression between validation and CAS, relationship transplant, terminal reset refusal, CSV, and durable database close/reopen. Server-action tests execute transpiled source handlers and the existing middleware with stubbed authentication/provider dependencies; foreign Origin with cross-site/same-site Fetch Metadata returns 403 before database/provider access. They are not HTTP/browser acceptance and do not replace Lane A's local owner-access/CSRF acceptance.

## Integration and owner handoff

Target this draft PR at `operator-os`; do not merge to main as part of this lane. Combine these precise fns.ts regions with other lanes: imports; workflow capability copy; message URL/CRM eligibility projection in `loadWorkspace`; `requestEnrichmentGrant`; `prepareMessage`; `approveMessage`; `openInGmail`; `approvePackage`; schedule/provider-callback guards in `saveConnections`; `exportCrmCsv`; `tickSchedule`. The new helper owns only manual message/CSV logic. Do not overwrite the entire fns.ts file. Lane A retains db/auth/startup ownership; Lane C retains `exportArchive`/`restoreArchive` and archive UI ownership; Lane D retains general harness repairs.

API integration: package/message approvals now require displayed `expectedDigest`; message approval requires literal `acknowledged: true`; tick requires `{manual:true}`; Gmail returns `{workspace,url}` with nullable URL. Older tabs fail closed and should reload. Existing message digests must be redrafted/reapproved because approval now binds the package approval revision. Terminal handoffs/sent rows cannot be redrafted. CSV adds `contact_id` and requires an approved package plus current eligible contact/prospect; fewer rows than the old export is intentional.

Lane C must preserve terminal handoff status and `manual_handoff` delivery events when restoring history, invalidate any stale approval as required by its archive contract, and keep schedules/paid reveal inert. This lane makes no archive round-trip claim. A lost handoff response stays delivery-unconfirmed; inspect Gmail manually and do not retry by editing database state.

Owner flow after integration: explicitly run morning work from Morning Brief; use public-source lookup on an approved prospect; approve the displayed package, draft and approve the exact message, then choose Open in Gmail. Sending is a separate owner action inside Gmail. Record reply/bounce/unsubscribe manually. CSV includes only currently eligible contacts.

Limitations: no real SMTP, Gmail navigation/delivery, paid reveal, live AI/provider call, private hosted data, retired Sites access, deployment, merge, settings/secrets change or CI workflow change occurred. No rendered browser journey, narrow-screen/keyboard acceptance, Mac startup, real-provider quality/cost, complete restore drill or owner acceptance was performed. PGlite concurrent callers are tested; independent PostgreSQL-session concurrency is not claimed. LOCAL-01/03/04 archive work, Lane D's full-suite cleanup and LOCAL-07 acceptance remain integration work; this record grants no hosted/formal phase completion credit.
