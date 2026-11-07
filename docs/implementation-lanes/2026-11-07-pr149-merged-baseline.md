# PR #149 merged baseline — independent review and evidence record

**Date:** 2026-11-07
**Merged main:** `cb0c690d227d0397e61c86fb15f034e3dfd524ee`
**Integrated source:** `cde8db7e5f6d2bfe05fbfa0d9d19df00355124dc`
**Tree (both commits):** `2d363101c18b76dfb63768ece987ef3f5ad629e1`
**Review result:** no local code defect filed. Planning evidence only. Plan credit remains 26/74. All 17 v1 requirements remain unaccepted.

## Merge identity

GitHub merged PR #149 (`integrate/parallel-local-20261107`) into `main` at 2026-11-07T20:10:28Z. `git log -1` on `origin/main` shows parents `96981f44f9a94a83cdd9f5582c3107c6ca0eff0d` and `cde8db7e5f6d2bfe05fbfa0d9d19df00355124dc`. `git merge-base --is-ancestor` accepts `cde8db7` as an ancestor of `cb0c690`. `git rev-parse` of both trees is identical, so the merge did not resolve content differently from the frozen integrated HEAD.

The integrated HEAD contains PRs #143, #144, #145, #146, #147, #148, and the PR #150 diagnostic follow-up. It does not contain open PRs #112–#124. In particular it does not contain PR #118.

GitHub check-runs for `cb0c690d227d0397e61c86fb15f034e3dfd524ee` returned `total_count: 0`. The combined status for `cde8db7e5f6d2bfe05fbfa0d9d19df00355124dc` returned `state: pending`, `total_count: 0`, and an empty status list. Zero recorded hosted checks are an empty result, not a passing CI conclusion.

## Parent-attested local proof

The parent reports this proof for source `cde8db7e5f6d2bfe05fbfa0d9d19df00355124dc`. This session did not re-run it and did not read `/tmp/prospector-integration-final-gate`.

| Evidence | Parent report |
|---|---|
| Command | `PROSPECTOR_D1_DIAG=1 npm test` from `site/`, including the production build |
| Window | 2026-11-07 13:02:46 EST through 14:04:31 EST |
| Exit | 0 |
| File summary | 1071 pass, 0 fail, 0 skip |
| Tree | clean, same HEAD |
| Focused + lint | 123 focused tests, lint 0 errors |
| Browser | separate lane 2/2 plus zero-effects |

That run is local validation of one clean execution. It does not accept a plan, a phase, or a v1 requirement. It does not prove the earlier full-gate failures were environmental, and it does not prove a product fix.

## Independent review

Scope was the merged tree: correctness, tenant isolation, auth boundary, replay, and zero-effects for the #143–#150 slices, plus the known #118 versus #145 migration-index collision and the PR #150 diagnostic closure. No source file in `site/` was edited by this review.

### No code defect filed

No concrete local bug or demonstrated tenant-isolation break met the bar for a patch.

Reviewed behavior that holds on this tree:

| Contract | Where | What the source does |
|---|---|---|
| One issued assignment per workspace and run | `site/drizzle/0021_runner-ingestion-integrity.sql` lines 7–10 and 16–71; `site/db/schema.ts` partial unique index `runner_assignment_active_run_unique` | Partial unique index plus a BEFORE INSERT trigger that aborts when another issued row exists or the run binding is not the active mutable run or the audited retryable partial. |
| One complete received submission per workspace and run | same SQL lines 11–14 and 75–111; schema index `runner_submission_complete_run_unique` | Partial unique index on `status = 'received'` and payload status `complete`. Snapshot `site/drizzle/meta/0021_snapshot.json` records both `where` clauses, and `site/tests/migration-source-of-truth.test.mjs` lines 77–99 pins them. |
| Reissue only after audited expiry or a trusted retryable partial | `site/domain/runner-assignment.ts` lines 16–38 | Issue is blocked when any received submission exists unless the run is `submitted` and a consumed partial has the `partial_submission_retryable` terminal. Expiry of an already-due issued row is an audited update in the same batch as the successor insert. |
| Second success cannot advance another watermark | `site/domain/prospecting-ingestion.ts` lines 47–57 and 181–189 | A partial whose retryable terminal already exists replays. A partial on an already `succeeded` run fails closed. A succeeded run whose ledger names another submission id fails closed before another success terminal is appended. |
| Review replay survives the state change | `site/domain/prospect-review.ts` lines 79–88 | The idempotency lookup uses `input.expectedRevision` and runs before the mutable qualified-state checks. A changed payload still conflicts. |
| Reject re-entry matches Plan `04-07` | `site/domain/prospect-review.ts` lines 55–62 | Material Signal, cooldown expiry, or sourced disproof can reopen. An active cooldown without one of those kinds still fails. |
| Profile key binds the operation digest | `site/domain/profile-readiness.ts` lines 122–131 and 150–159 | Same digest with another key conflicts. Same key with another digest conflicts. The workspace id is taken from the admitted principal. |
| Queue admission is reject-only unless a trusted port authorizes the exact tuple | `site/domain/prospecting-run-admission.ts` lines 55–77 and 109–125 | Default port returns `denied`. The SQL filters `workspace_id`. A foreign workspace id is rejected in `site/tests/prospecting-run-admission.test.mjs` line 70. `site/worker` does not import the module. The owner browser route still returns 409 for `issue_assignment` (`site/tests/profile-prospecting-integration.test.mjs` lines 53–54). Initial runs stay `blocked_missing_capability` until that internal seam is called. |
| Phase 7 frozen handoff cannot outlive included-row clocks | `site/preparation/phase7-handoff-eligibility.ts` lines 201–224 | Included-row verification or package-approval expiry rejects the whole frozen projection. Excluded rows are not consulted. Every authorization flag stays false and effects stay zero. |
| Phase 5 digest copy keeps own data | `site/preparation/synthetic-enrichment-prerequisite-plan.ts` with `site/tests/synthetic-enrichment-prerequisite-plan.test.mjs` lines 458 and 482–521 | Numeric keys outside index space and own `__proto__` data are bound or rejected. The module grants no provider call. |
| Release manifest was not extended | `.planning/phases/02-consensus-knowledge-and-commercial-model/02-99-MIGRATION-MANIFEST.md` | The manifest still ends at `0019_person_discovery.sql` (20 rows). Checked journal head is `0021_runner-ingestion-integrity`. Hosted Stage 2 evidence remains `0000`–`0009`. `site/scripts/greenfield-runtime-config.mjs` lines 146–158 names the checked head for a local prepare candidate; that pin follows the chain and does not apply SQL to the hosted database. |

Items inspected and left unfiled:

- `activationWinner` in `site/domain/profile-readiness.ts` joins `prospecting_runs` and `prospecting_schedules` on configuration id after the activation row is already constrained by `workspace_id`. Configuration ids are server-minted. No cross-tenant read was demonstrated.
- `admitProspectingRunToQueue` takes a caller-supplied workspace id and has no principal argument. It is an internal trusted seam, the default port denies, and no route calls it.
- The first statement of `0021_runner-ingestion-integrity.sql` expires issued rows that are already past `expires_at` at apply time and does not write an audit row. Local fixtures apply it to an empty database. Hosted apply of `0021` is not authorized.
- `disposeFixtureRuntime` in `site/tests/helpers/d1.mjs` lines 316–328 surfaces the Miniflare dispose error when Vite close also throws. `site/tests/d1-runtime-diagnostics.test.mjs` lines 253–264 require that ordering. Diagnostic emit failures are swallowed at lines 252–254 so they cannot replace the original operation error, which is rethrown at lines 268–275.

### PR #150 secret-logging and error-masking closure

The merged sanitizer still closes the diagnostic disclosure and masking findings:

- `sanitizeRuntimeError` (`site/tests/helpers/d1.mjs` lines 181–214) keeps an allowlisted name and an allowlisted string code, classifies the message into fixed tokens, and omits the message, URL, query, and code object.
- Own getters are not invoked (`readClosedField`, lines 129–148). The tests at `site/tests/d1-runtime-diagnostics.test.mjs` lines 109–210 use synthetic secret, token, password, and throwing getters.
- Instrumented `run` and `batch` rethrow the original object (test lines 212–224). `PROSPECTOR_D1_DIAG=0` writes nothing and does not read hostile getters (test lines 227–237).
- Default diagnostics are on unless the variable is `0` (line 125–127). The parent canonical command set `PROSPECTOR_D1_DIAG=1` explicitly. Either setting is observational. Neither retries a socket failure.

This session did not re-execute that test file. The closure claim is a source reading of the merged tree, plus the parent statement that the full suite on that same tree exited 0.

### Duplicate PR overlap and the 0021 collision

| PR | State against merged main | Disposition |
|---|---|---|
| #143–#148, #150 | Content is in `cde8db7` / `cb0c690` | Merged by #149. |
| #112, #113, #124 | Open. Overlap the review-replay slice that #143 carried. | Not merged. Their branches were not modified. |
| #114 | Open. #145 adapted the lease shape and installed it on the full chain. | Not merged. `0021` on main is the #145 migration, not a second copy of #114. |
| #118 | Open at `2cbd14fe4fd358db5be3586ee1c0c962015653ac`. Files include `site/drizzle/0021_prospect-transition-history.sql` and journal idx 21. | Not in the #149 tree. Merging it unchanged collides with `site/drizzle/0021_runner-ingestion-integrity.sql` and `site/drizzle/meta/_journal.json` idx 21. |

The collision is real and future. It is not a defect inside the merged 0021 file. Rewriting merged `0021` would discard the lease that the canonical run already covered. The safe repair is on the #118 branch: rebase onto `cb0c690` and allocate idx 22. This evidence change does not do that rebase and does not add a second history migration.

### Reliability: proven versus hypothesis

| Observation | Status |
|---|---|
| Parent canonical run on `cde8db7` exited 0 with diagnostics enabled | Parent-attested. Not re-run here. |
| PR #145 standalone canonical failure in `prospecting-ingestion-lifecycle` / later enrichment `fetch failed` + `SocketError: other side closed` after a multi-minute stall | Historical, from the PR #150 body and the #145 lane record. Unchanged code path. Cause not established. |
| PR #146 `overlapping enrichment reservations…` `fetch failed` / `read ECONNRESET` | Historical. Cause not established. |
| PR #148 contacts high-water test `fetch failed` / `read ECONNRESET` | Historical. Cause not established. |
| PR #147 `commercial hierarchy enforces exact parentage…` expected 2 fulfillments and observed 1, after about 270s | Historical. `site/tests/commercial-model-repository.test.mjs` lines 59–70 still requires 2 fulfillments. The two calls use different idempotency keys against an already initialized workspace (`site/domain/commercial-model.ts` lines 45–87). The same assertion passed in seconds on other PRs. The losing rejection text was not captured, so a socket drop and a logic rejection are both still possible. |
| Reported 12:50 focused diagnostic: 8 pass, 1 cancelled, different pending promise | Reported with the review task. Not re-read from coordinator receipts. It is a different signature from `ECONNRESET` and is not socket proof. |
| PR #150 instrumentation | Classifies and preserves the original error. It does not change timeouts, add retries, or alter authority writes. A later green run cannot be read as proof that the instrumentation fixed the stalls. |

No bounded re-execution was started. One more pass of the commercial race or the long Miniflare files would not identify the cause, and the parent full run already exists.

## Acceptance gap matrix

Local validation and formal acceptance stay separate. `.planning/REQUIREMENTS.md` leaves all 17 v1 requirements unchecked. `.planning/STATE.md` still records 26 completion credits out of 74 active plans. This change adds no `*-PLAN.md` and no `*-SUMMARY.md`. Phase plan files under `.planning/phases` remain 74. The extra two `*-PLAN.md` paths are `docs/IMPLEMENTATION-PLAN.md` and `strategy/SALES-MARKETING-PLAN.md`, which are outside the ledger. Summary files remain 27, and the invalidated Plan 02-13 summary still earns no credit.

| ID | Source | Class | Exact proof still required | What #149's local run cannot supply |
|---|---|---|---|---|
| REQ-private-human-governed-gtm, REQ-company-workspace-isolation | `.planning/REQUIREMENTS.md`; Plan `02-99`; `.planning/phases/02-consensus-knowledge-and-commercial-model/02-ACTIVATION.md` | Owner / hosted | A new empty greenfield target shows owner versus non-owner isolation, authenticated negative mutations, zero D1/R2 delta, secret/log hygiene, and a fresh exact-release review. | Synthetic principals and a local suite. Stage 3B Worker attachment and the effective one-hour session are still unverified. |
| REQ-commercial-hierarchy, REQ-consensus-interview, REQ-versioned-knowledge-and-drift | Phase 2 plans `02-22` (local credit only) and `02-99` | Owner / hosted | Terminal Plan `02-99` acceptance on that same target, including the private boundary and explicit owner acceptance. | Local commercial-init tests, including a green concurrent init. |
| REQ-product-readiness, REQ-market-discovery | Plans `03-09`, `03-10`, `03-11` | Owner / hosted | Owner authorization, the controlled private hosted no-effect proof, and owner lifecycle acceptance. | Local Plans `03-01`–`03-08`, which already have summaries and still do not accept the phase. |
| REQ-profile-readiness, REQ-deterministic-qualification, REQ-evidence-provenance, REQ-untrusted-runner-boundary | Plans `04-01`–`04-12`, especially `04-04`, `04-07`, `04-09`, `04-11`, `04-12` | Mixed | Local slices now on main cover replay, reject re-entry, key binding, the exclusive run lease, and the cross-card pending regression. Formal credit still needs Phase 3 acceptance plus the hosted profile proof in `04-11`/`04-12`: exact reviewed source, configuration, migration, private boundary, and zero effects on an authorized greenfield target. No `04-xx-SUMMARY.md` is authorized from the local run. | The canonical exit 0. Creating a summary from it would claim a plan the predecessor gates do not allow. |
| REQ-controlled-enrichment, REQ-contact-verification | Plans `05-01`–`05-09`; `05-PREPARATION.md` | Local preparation versus provider / owner | Preparation may stay synthetic and reject-only. Plan execution needs Phase 4 acceptance, a scoped single-use grant, and provider proof that missing or reused authority makes zero calls. | The snapshot-copy guard in the Phase 5 preparation module. |
| REQ-immutable-outreach-approval, REQ-hard-company-suppression | Plans `06-01`–`06-13`; Plan `06-11` blocks execution | Dependency / provider / owner | Predecessor acceptance, then real Gmail or manual-call proof with transactional suppression. Outbox states `dispatching`, `sent`, and `delivery_unknown` stay structurally unreachable until that authority exists. | Phase 6–7 preparation guard updates. |
| REQ-crm-and-workspace-exports, REQ-initial-operating-target | Plans `07-01`–`07-10`; Plans `07-07` and `07-10` | Dependency / owner | Plan `06-10` completion, then archive capability selection, the weekday 06:00 America/Toronto operating proof, and a clean restore drill. The weekly reducer still models states that `profile_prospects.state` cannot store. | The synthetic handoff-expiry recheck. It grants no CSV bytes, persistence, or export. |
| Checked migration `0021` | `site/drizzle/0021_runner-ingestion-integrity.sql`; manifest cited above | Hosted apply is a separate owner decision | An authorized empty-target apply, journal row, and post-apply inventory. Until then the hosted database remains at the Stage 2 `0000`–`0009` evidence. | Local Miniflare application of the checked chain. |
| Open PR #118 | GitHub PR #118 head `2cbd14fe` | Future integration | Rebase onto `cb0c690` and move the history migration to idx 22, with its own focused proof. | Merging #149. |
| Full-gate `ECONNRESET` and the 2-versus-1 commercial init | PR #150 body; `site/tests/commercial-model-repository.test.mjs` lines 59–70 | Unproven reliability | A captured sanitized rejection from a failing run, or a demonstrated code path that rejects one racer without a socket error. | One green combined run with diagnostics enabled. |

## Smallest next implementation chunk

Not this change. No product contract is clear enough to execute here:

- Plans `02-99` and `03-09`–`03-11` need owner and hosted evidence that is absent.
- Plans `04-11` and `04-12` need that same hosted proof. The local `04-04` / `04-07` / `04-09` truths are already on main.
- Phase 5–7 plan execution remains dependency-gated. More synthetic placeholders are outside the preparation caps already recorded in `07-PREPARATION.md`.

The next code change, when a later branch is authorized to continue PR #118, is a rebase onto `cb0c690` that keeps merged `0021_runner-ingestion-integrity` and gives the prospect-transition history its own next index. That work stays on the #118 line. This branch does not start it, does not merge anything else, and does not touch the separate parallel qualification run.

## Commands actually run in this review

```text
git fetch origin main
git rev-parse HEAD origin/main
git log -1 --format='%H %P %s' origin/main
git merge-base --is-ancestor cde8db7e5f6d2bfe05fbfa0d9d19df00355124dc origin/main
git rev-parse 'cde8db7^{tree}' 'origin/main^{tree}'
git diff --stat cde8db7e5f6d2bfe05fbfa0d9d19df00355124dc origin/main
gh pr view 149 / 118 / 150
gh api repos/SJS1001/PROspector/commits/cb0c690d227d0397e61c86fb15f034e3dfd524ee/check-runs
gh api repos/SJS1001/PROspector/commits/cde8db7e5f6d2bfe05fbfa0d9d19df00355124dc/status
```

Not run: `npm test`, `npm run lint`, `npm run build`, browser lanes, hosted calls, provider calls, deploys, or any command against `/tmp/prospector-integration-final-gate`.

## Non-claims

No plan summary, requirement checkbox, phase checkbox, hosted apply, provider connection, deployment, contact, review promotion, or outbound effect is authorized by this record. The operator local-release note in `docs/CODEX-CONTINUATION.md` remains a separate personal-use checkpoint and is not this merge.
