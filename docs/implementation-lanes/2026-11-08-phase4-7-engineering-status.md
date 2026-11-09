# Phase 4–7 engineering status (not acceptance)

This note records what is in the tree. It does not create a plan summary, does not change `.planning/STATE.md`, and does not check a v1 requirement. Formal credit stays 26/74 until a plan’s own summary criteria and its contractual predecessors both exist. A missing `*-SUMMARY.md` is not evidence that the code is missing.

Evidence baseline: `dc12fd32627ef5848e8b9977ab6ef6deab5ffbf0` ran `site` `npm test` with 1077 passes, 0 failures, 0 cancelled, 0 skipped. That run is test proof for that tree, not owner acceptance. This branch is an ordinary descendant. It adds one schedule behavior and one focused test. The full suite on this SHA is recorded separately and does not replace the predecessor gates below.

Labels:

- **Present.** The plan’s named files exist. Where a focused suite is named, it is in `site/tests` and was part of the dc12fd3 suite unless this note says otherwise. Credit is still blocked by the predecessor chain.
- **Partial.** Some named behavior or named file is absent. The gap is described. Credit is not awarded.
- **Blocked.** The plan’s own `depends_on` or task text requires hosted, owner, or provider proof that this workspace cannot produce. Local files, when present, do not satisfy that gate.

## External inputs that remain outside this workspace

These are the smallest decisions or proofs a person has to supply. Nothing here performs them.

1. Plan 03-11: owner lifecycle acceptance and the transport-capability disposition for the greenfield target. Plan 04-01 depends on 03-11, so 04-01 through 04-12 cannot be credited before that record exists.
2. Plan 04-11: an independent exact-source review, then a narrow hosted scheduler/evidence proof on an authorized empty greenfield target.
3. Plan 04-12: owner acceptance of that hosted proof.
4. Plan 05-09: exact-source review and a reject-only private-boundary proof with zero provider calls. A real provider grant is a later, separate authority and is not assumed.
5. Plans 06-10, 06-11, and 06-13: the predecessor review, then an authorized Gmail or manual-call boundary with transactional suppression. Outbox `dispatching`, `sent`, and `delivery_unknown` stay unreachable until that authority exists.
6. Plans 07-07 and 07-10: archive capability, a weekday 06:00 America/Toronto operating proof, and a restore drill. Plan 07-04 still names migration index `NNNN` and says to stop rather than invent the index.

## Phase 4

| Plan | Depends on | Status | Evidence |
| --- | --- | --- | --- |
| 04-01 | 03-11 | Present, credit blocked | RED contract file exists and the original “fails because unimplemented” mode is obsolete. Summary still requires 03-11. |
| 04-02 | 04-01 | Present, credit blocked | `0007_profile_prospecting.sql` and the chain tests are in the tree. |
| 04-03 | 04-02 | Present, credit blocked | Readiness and activation fail closed. A late slot previously advanced the schedule without a run row. This branch writes an append-only `skipped_misfire` run and event, leaves the schedule state inside `blocked_missing_capability`, and covers that path in `site/tests/prospecting-schedule-misfire.test.mjs`. No new migration: `prospecting_runs.execution_state` is unconstrained text. The digest head stays `0022_prospect-transition-history`. |
| 04-04 | 04-02 | Present, credit blocked | Runner lease and ingestion code, including migration `0021_runner-ingestion-integrity` on main. |
| 04-05 | 04-03, 04-04 | Present, credit blocked | Evidence lineage files exist. Retrieval stays disabled. |
| 04-06 | 04-02, 04-05 | Present, credit blocked | Rubric module and tests exist. |
| 04-07 | 04-03, 04-05, 04-06 | Present, credit blocked | Review, cooldown, and re-entry code exist. |
| 04-08 | 04-04, 04-07 | Present, credit blocked | `prospecting-handler.ts` closes the manual Find Prospects command to `action`, `profileId`, and `idempotencyKey`. |
| 04-09 | 04-08 | Present, credit blocked | Workspace and review queue exist. Approve and Defer stay disabled until a reason is present. |
| 04-10 | 04-09 | Present, credit blocked | `profile-prospecting-integration.test.mjs` exists and was in the dc12fd3 suite. This branch’s misfire test is additional. |
| 04-11 | 04-10 | Blocked | `autonomous: false`. Needs the hosted review named above. |
| 04-12 | 04-11 | Blocked | `autonomous: false`. Needs owner acceptance of the hosted proof. |

## Phase 5

| Plan | Depends on | Status | Evidence |
| --- | --- | --- | --- |
| 05-01 | 04-12 | Present, credit blocked | Contract tests exist. Formal start still waits on 04-12. |
| 05-02 | 05-01 | Present, credit blocked | Named persistence files exist. |
| 05-03 | 05-02 | Present, credit blocked | Grant and reservation files exist. |
| 05-04 | 05-02 | Present, credit blocked | Contact eligibility files exist. |
| 05-05 | 05-02 | Present, credit blocked | Identity resolution files exist. |
| 05-06 | 05-03, 05-04, 05-05 | Present, credit blocked | Fake provider port files exist. No live provider is configured or called. |
| 05-07 | 05-06 | Present, credit blocked | Contacts control-surface files exist. |
| 05-08 | 05-07 | Present, credit blocked | Named integration files exist and were in the dc12fd3 suite. |
| 05-09 | 05-08 | Blocked | `autonomous: false`. Needs the reject-only private-boundary proof. |

## Phase 6

| Plan | Depends on | Status | Evidence |
| --- | --- | --- | --- |
| 06-01 | 05-09, 06-11 | Blocked | Contract tests named by the plan are absent: `outreach-artifacts.test.mjs`, `outreach-dispatch.test.mjs`, `suppression.test.mjs`, `manual-call.test.mjs`. Predecessors are external. |
| 06-02 | 06-01 | Partial | Four of five named files exist. `site/tests/outreach-artifacts.test.mjs` does not. Cannot start ahead of 06-01. |
| 06-03 | 06-02 | Partial | `outreach-package.ts`, `message-version.ts`, and `outreach-artifacts.test.mjs` are absent. |
| 06-04 | 06-02 | Partial | `suppression.ts`, `outreach-stop-rules.ts`, and `suppression.test.mjs` are absent. |
| 06-05 | 06-02 | Present, credit blocked | Named files exist. The predecessor chain is not accepted. |
| 06-06 | 06-03, 06-04, 06-05 | Partial | `originated-mail-sync.ts`, `outreach-stop-rules.ts`, `outreach-dispatch.test.mjs`, and `suppression.test.mjs` are absent. |
| 06-07 | 06-03, 06-04 | Partial | `manual-call.ts` and `manual-call.test.mjs` are absent. |
| 06-08 | 06-06, 06-07 | Partial | Handler, workspace, leaves, and `outreach-ui.test.mjs` are absent. |
| 06-09 | 06-08 | Blocked | Named integration and UI tests are absent, and the plan’s hosted wording is not locally satisfiable. |
| 06-10 | 06-09, 06-11 | Blocked | `autonomous: false`. |
| 06-11 | 04-12, 05-09 | Blocked | `autonomous: false`. |
| 06-12 | 06-10 | Partial | Worker, mail sync, and the named dispatch tests are absent. Depends on the hosted gate. |
| 06-13 | 06-12 | Blocked | `autonomous: false`. |

## Phase 7

| Plan | Depends on | Status | Evidence |
| --- | --- | --- | --- |
| 07-01 | 06-10 | Partial | `site/tests/mining-handoff-ui.test.mjs` is absent. Predecessor is external. |
| 07-02 | 06-10 | Partial | `site/tests/crm-handoff.test.mjs` is absent. |
| 07-03 | 06-10 | Partial | `site/tests/workspace-recovery.test.mjs` is absent. |
| 07-04 | 07-01, 07-02, 07-03 | Blocked | The plan still says `NNNN` and forbids guessing the migration index. `handoff-recovery-repository.ts` and that migration are absent. Transition history `0022` is not this plan. |
| 07-05 | 07-04 | Present, credit blocked | Named files exist. 07-04 is not done. |
| 07-06 | 07-04 | Partial | `export-delivery.ts`, `crm-handoff.ts`, and `crm-handoff.test.mjs` are absent. |
| 07-07 | 07-04 | Blocked | `autonomous: false`. Archive and operating proof are external. |
| 07-08 | 07-04, 07-07 | Blocked | Archive, verifier, and restore files are absent, and 07-07 is external. |
| 07-09 | 07-05, 07-06, 07-08 | Blocked | Handler, workspace, and UI test are absent. |
| 07-10 | 07-09 | Blocked | `autonomous: false`. Named integration tests are absent. |

## Next executable local task

The earliest plan that both lacks named local files and is not itself an external gate is 06-01, and it is not executable: it depends on 05-09 and 06-11. The next safe local increment inside already-landed code is the overlap path in `reconcileProspectingSchedules`, which still stores `skipped_overlap` on `prospecting_schedules.execution_state` even though that column’s declared set is `blocked_missing_capability`, `active`, `paused`, and `archived`. SQL does not check the set. A later change can record the overlap on the run, which it already does, and stop writing the undeclared schedule state. That is not done in this batch.

Historical Miniflare `ECONNRESET`, `other side closed`, and the post-init “expected 2 fulfilled, got 1” cancellation remain unexplained. This note does not treat a green suite as that cause.
