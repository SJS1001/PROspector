---
phase: 02
slug: consensus-knowledge-and-commercial-model
status: incident_revised
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-30
updated: 2026-08-25
plan_count: 15
task_count: 32
---

# Phase 02 — Validation Strategy

> Incident-revised validation map for 15 active plans and 32 tasks. Seven
> obsolete hosted-release plans are preserved as `*.retired.md` history outside
> GSD executor discovery and are not executable validation entries.

## Test Infrastructure

| Property | Value |
|---|---|
| Framework | Node.js built-in test runner with Miniflare D1 integration |
| Config | none — `site/tests/*.test.mjs` construct Vite/Miniflare directly |
| Quick sample | `cd site && npm test` |
| Full local gate | `cd site && npm test && npm run lint && npm run build` |
| Local feedback target | under 30 seconds for focused task samples |

Every consequential Phase 2 mutation test pairs its positive authority assertion with a complete forbidden-table zero-delta assertion. Hosted deployment, migration, real-principal, review, authorization, activation, and owner-lifecycle checks are ordered manual/control-plane gates; local automation never substitutes for them.

## Sampling Rate

- After every local code task: run its focused command, then `cd site && npm test`.
- After every local wave: run `cd site && npm test && npm run lint`.
- Before a source deployment: run `cd site && npm test && npm run lint && npm run build`.
- Before `/gsd:verify-work`: the separately checked recovery/replacement release sequence must have executed and Plan 02-99 must be atomically rebased after its terminal successor. Fresh Phase 2 verification and exact terminal owner acceptance remain mandatory; Plan 02-21 design/drafting approval alone cannot advance verification or completion.
- No watch mode. Focused local samples target less than 30 seconds; hosted gates are deliberately manual and excluded from the latency target.

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat | Secure behavior | Test / gate | Automated command | Status |
|---|---:|---:|---|---|---|---|---|---|
| 02-01-01 | 01 | 1 | all | T-02-01 | Full 0000-0004 chain, legacy lineage, forbidden snapshots | D1 integration RED | `cd site && node --check tests/helpers/d1.mjs && node --check tests/migration-chain.test.mjs && ! node --test tests/migration-chain.test.mjs` | pending |
| 02-01-02 | 01 | 1 | hierarchy | T-02-02 | Exact parentage/seed/scope/races; generic Offer rejected | D1 integration RED | `cd site && node --check tests/commercial-model-repository.test.mjs && ! node --test tests/commercial-model-repository.test.mjs` | pending |
| 02-01-03 | 01 | 1 | knowledge | T-02-03 | All origins/provenance/immutability/quarantine contracts | D1 integration RED | `cd site && node --check tests/knowledge-repository.test.mjs && ! node --test tests/knowledge-repository.test.mjs` | pending |
| 02-02-01 | 02 | 2 | interview | T-02-05 | Four decisions, exact snapshots, first-Offer lineage, retry/race convergence | D1 + handler RED | `cd site && node --check tests/interview-repository.test.mjs && node --check tests/interview-handler.test.mjs && ! node --test tests/interview-repository.test.mjs tests/interview-handler.test.mjs` | pending |
| 02-02-02 | 02 | 2 | all | T-02-06 | Closed safe intake, old-schema, admission/CSRF/gate negatives | handler integration RED | `cd site && node --check tests/knowledge-handler.test.mjs && ! node --test tests/knowledge-handler.test.mjs` | pending |
| 02-02-03 | 02 | 2 | knowledge | T-02-07 | Reached drift, replacement split, UI authority states | D1 + render RED | `cd site && node --check tests/drift-replacement.test.mjs && node --check tests/knowledge-ui.test.mjs && ! node --test tests/drift-replacement.test.mjs tests/knowledge-ui.test.mjs` | pending |
| 02-03-01 | 03 | 1 | all | T-02-SC | Exact uuid@14.0.1 human legitimacy gate | blocking human | `cd site && npm view uuid@14.0.1 name version repository.url scripts.postinstall --json && ! npm ls uuid --depth=0` | pending |
| 02-04-01 | 04 | 3 | all | T-02-SC | Exact approved package pin only | package check | `cd site && npm ls uuid --depth=0 && node -e "import('uuid').then(({v7})=>{const id=v7(); if(!/^[0-9a-f-]{36}$/.test(id)) process.exit(1)})"` | pending |
| 02-04-02 | 04 | 3 | all | T-02-01 | Additive 0004, constraints/backfill, complete gate tuple, no gate/Offer/effects | D1 migration | `cd site && npm run db:generate -- --name consensus_knowledge --help >/dev/null && node --test tests/migration-chain.test.mjs && npm run lint` | pending |
| 02-05-01 | 05 | 4 | hierarchy | T-02-02 | Commercial aggregate, exact seed, Draft-only hierarchy | D1 integration | `cd site && node --test tests/commercial-model-repository.test.mjs` | pending |
| 02-05-02 | 05 | 4 | knowledge | T-02-03 | Reachable repository/import/reuse/package proposals and immutable review | D1 integration | `cd site && node --test tests/knowledge-repository.test.mjs && npm run lint` | pending |
| 02-06-01 | 06 | 5 | interview | T-02-05 | Research-first two-stage transactional interview and first-Offer lineage | D1 concurrency | `cd site && node --test tests/interview-repository.test.mjs tests/knowledge-repository.test.mjs && npm run lint` | pending |
| 02-07-01 | 07 | 5 | knowledge | T-02-07 | Deterministic dependency-reached drift | unit + D1 | `cd site && node --test tests/drift-replacement.test.mjs --test-name-pattern="drift|reach|risk|impact"` | pending |
| 02-07-02 | 07 | 5 | knowledge | T-02-07 | Separate candidate/activation and preserved history | D1 concurrency | `cd site && node --test tests/drift-replacement.test.mjs && npm run lint` | pending |
| 02-08-01 | 08 | 6 | all | T-02-06 | Old-schema safe, closed safe intake, gated secure handler | handler integration | `cd site && node --test tests/knowledge-handler.test.mjs tests/interview-handler.test.mjs` | pending |
| 02-08-02 | 08 | 6 | all | T-02-06 | Thin trusted-identity route with no upload/provider bypass | route/lint | `cd site && node --test tests/knowledge-handler.test.mjs && npm run lint` | pending |
| 02-09-01 | 09 | 7 | hierarchy | T-02-12 | Pure hierarchy leaf, semantic five-level model | render/source | `cd site && node --test tests/knowledge-ui.test.mjs --test-name-pattern="commercial|hierarchy|scope"` | pending |
| 02-09-02 | 09 | 7 | interview | T-02-12 | Pure interview leaf and exact two-stage states | render/source | `cd site && node --test tests/knowledge-ui.test.mjs --test-name-pattern="interview|question|confirmation|conflict"` | pending |
| 02-09-03 | 09 | 7 | knowledge | T-02-08 | Safe intake UI, proposal/review/drift/replacement, no file upload | render/source | `cd site && node --test tests/knowledge-ui.test.mjs && npm run lint` | pending |
| 02-10-01 | 10 | 8 | all | T-02-13 | Sole transport/CSRF/key/retry owner and shell composition | render/security | `cd site && node --test tests/knowledge-ui.test.mjs tests/rendered-html.test.mjs tests/fixture-safety.test.mjs` | pending |
| 02-10-02 | 10 | 8 | all | T-02-08 | Approved responsive/accessibility design contract | full local | `cd site && npm test && npm run lint` | pending |
| 02-11-01 | 11 | 9 | all | T-02-14 | Fixed redacted old/post-migration read-only proof | CLI security | `cd site && node --test tests/phase2-hosted-preflight.test.mjs && node scripts/phase2-hosted-preflight.mjs --help` | pending |
| 02-11-02 | 11 | 9 | all | T-02-15 | Fixed exact consensus_knowledge gate writer, not executed | CLI security | `cd site && node --test tests/phase2-gate.test.mjs && node scripts/phase2-gate.mjs --help` | pending |
| 02-11-03 | 11 | 9 | all | T-02-16 | Blocked non-authorizing ordered ledger | static check | `rg -n "status: blocked|human_needed.*pause|existing private Sites project|consensus_knowledge|arbitrary file upload|never grants authority" .planning/phases/02-consensus-knowledge-and-commercial-model/02-ACTIVATION.md` | pending |
| 02-12-01 | 12 | 10 | all | T-02-17 | Real Phase 1 principal proof and read-only old-schema baseline | blocking hosted gate | `cd site && npm test && npm run lint && node --test tests/phase2-hosted-preflight.test.mjs` | pending |
| 02-13-01 | 13 | 11 | all | T-02-19 | Historical compatibility deployment whose schema-0003 premise is contradicted; preserve evidence and never rerun | invalidated incident gate | `rg -n "INVALIDATED|incident-blocked|superseded" .planning/phases/02-consensus-knowledge-and-commercial-model/02-13-SUMMARY.md .planning/phases/02-consensus-knowledge-and-commercial-model/02-ACTIVATION.md` | invalidated |
| 02-21-01 | 21 | 11 | all | T-02-35 | Exact read-only journal/schema/constraint/trigger/index/FK/invariant/provider-audit classification or explicit unsupported surfaces | blocking read-only gate | `rg -n "classified_schema_fingerprint|d1_migrations|sqlite_schema|foreign_key_check|provider.*actor|partial/mixed/unknown|recovery_not_authorized" .planning/phases/02-consensus-knowledge-and-commercial-model/02-INCIDENT-RECONCILIATION.md .planning/phases/02-consensus-knowledge-and-commercial-model/02-ACTIVATION.md` | pending |
| 02-21-02 | 21 | 11 | all | T-02-36, T-02-37 | Retire 02-14..20 from discovery and write one design-only recovery contract without executable artifacts/rehearsal | static planning gate | `test -z "$(gsd-sdk query phase-plan-index 02 | rg '\"id\": \"02-(14|15|16|17|18|19|20)\"')" && rg -n "classified_schema_fingerprint|forward_reconciliation|provider_supported_restore|future checked plan|no executable" .planning/phases/02-consensus-knowledge-and-commercial-model/02-INCIDENT-RECOVERY.md` | pending |
| 02-21-03 | 21 | 11 | all | T-02-37 | Independent design review with no artifact, rehearsal, provider environment, plan, or write authority | blocking design-review gate | `rg -n "incident_recovery_design_review_reference|design.*digest|gate.*CSRF|deny-all|design only|BLOCKER|HIGH" .planning/phases/02-consensus-knowledge-and-commercial-model/02-INCIDENT-RECOVERY.md .planning/phases/02-consensus-knowledge-and-commercial-model/02-ACTIVATION.md` | pending |
| 02-21-04 | 21 | 11 | all | T-02-38 | Exact authorization permits only drafting/checking a future plan with its own later artifact-bound owner checkpoint | blocking drafting decision | `rg -n "phase2_incident_recovery_plan_draft|recovery_design_digest|incident_recovery_design_review_reference|drafted and checked|does not authorize.*run|no hosted write" .planning/phases/02-consensus-knowledge-and-commercial-model/02-INCIDENT-RECOVERY.md .planning/phases/02-consensus-knowledge-and-commercial-model/02-ACTIVATION.md` | pending |
| 02-99-01 | 99 | 12 | all | T-02-39, T-02-40 | After atomic dependency/wave rebase and every successor summary, create fresh independent exact-target Phase 2 verification from checked/redacted evidence only | independent terminal verification | `! rg -n '^wave: 12$|^depends_on: \["02-21"\]$' .planning/phases/02-consensus-knowledge-and-commercial-model/02-99-PLAN.md && rg -n "status: passed|terminal_successor|predecessor_plan_summary_manifest|REQ-commercial-hierarchy|REQ-consensus-interview|REQ-versioned-knowledge-and-drift|D-01|D-16|classified_schema_fingerprint|recovery_artifact_digest|deployed_source_digest|forbidden.*zero|no hosted" .planning/phases/02-consensus-knowledge-and-commercial-model/02-VERIFICATION.md` | pending |
| 02-99-02 | 99 | 12 | all | T-02-41 | Consume fresh passed verification and require exact artifact/target/evidence-bound owner acceptance; performs no hosted action | blocking terminal acceptance | `test -z "$(gsd-sdk query phase-plan-index 02 | rg '\"id\": \"02-(14|15|16|17|18|19|20)\"')" && rg -n "status: passed|classified_schema_fingerprint|recovery_artifact_digest|terminal_successor" .planning/phases/02-consensus-knowledge-and-commercial-model/02-VERIFICATION.md .planning/phases/02-consensus-knowledge-and-commercial-model/02-ACTIVATION.md` | pending |

## Wave 0 Requirements

- [ ] `site/tests/helpers/d1.mjs` applies 0000-0004, seeds all legacy cases, races commands, and snapshots the full forbidden manifest.
- [ ] Repository/handler/drift/UI RED contracts exist before production owners and fail only on missing production behavior.
- [ ] Handler tests cover repository research, bounded plain-text import, same-Company/same-Product reuse, allowlisted package intake, rejected file/multipart/upload, and schema-0003 compatibility.
- [ ] All leaves are pure typed projections/callbacks; `KnowledgeWorkspace` alone owns fetch, CSRF, idempotency, unknown-outcome, and retry behavior.
- [ ] Preflight/gate CLIs have local fake-spawn security tests before any hosted use.

## Manual / Hosted Gates

| Plan | Gate | Pass signal | Failure behavior |
|---:|---|---|---|
| 12 | Historical real-principal/read-only schema-0003 evidence retained as accepted Plan 12 credit | `approved old-schema baseline` (2026-08-01 history only) | Cannot classify current live schema or authorize recovery |
| 13 | Invalidated compatibility deployment history | no valid pass signal; schema-0003 premise contradicted | Preserve summary as invalidated evidence; never rerun |
| 21 Task 1 | Exact remaining read-only provenance on the same private target | `approved Phase 2 read-only provenance bundle <classified_schema_fingerprint> <provenance_evidence_reference>` | `human_needed` pauses; no design or SUMMARY |
| 21 Task 3 | Independent review of the design-only recovery contract | `approved Phase 2 incident recovery design review <classified_schema_fingerprint> <recovery_design_digest> <incident_recovery_design_review_reference>` | `human_needed` pauses; no drafting authority |
| 21 Task 4 | Separate authority only to draft/check a future path-specific plan | exact twelve-field `authorize drafting phase2 incident recovery plan ...` signal from Plan 02-21 | silence/generic/prior approval pauses; no future plan or write |
| 99 Task 2 | Terminal Phase 2 acceptance after Task 1 creates fresh independent verification | exact ten-field `approved Phase 2 recovered release and terminal acceptance ...` signal from Plan 02-99 | `human_needed`, stale dependency/wave, missing successor summary, or stale/failed verification keeps Phase 2 incomplete |

Plans 02-14 through 02-20 are retained only as `02-14-PLAN.retired.md`
through `02-20-PLAN.retired.md`; they must not appear in
`gsd-sdk query phase-plan-index 02` and have no executable gate. The existing
private Sites project is reused throughout. No plan may clone, replace, delete,
rename, or expose it, create a recovery environment, run a restore drill, or
reveal/rotate/remove secret values. Arbitrary file upload remains disabled
because no scanner/release provider is authorized.

## Validation Sign-Off

- [x] Map matches 15 active plans and 32 tasks; seven retired hosted-release plans are outside discovery and task counts.
- [x] Every task has an automated command; hosted/manual evidence remains explicitly non-substitutable.
- [x] Focused local sampling targets under 30 seconds; no watch flags.
- [x] `human_needed` is pause/incomplete, never acceptance or done.
- [x] Plan 02-21 ends at design review and exact authority only to draft/check a future plan; no execution or write is authorized.
- [x] Any future recovery plan must add local rehearsal, exact-artifact review, backup/restore proof, and a separate artifact-bound owner checkpoint before a hosted write.
- [x] Canonical Plan 02-99 remains after Plan 02-21 and prevents Phase 2 completion until future planning atomically rebases it after the executed terminal successor and fresh verification/owner acceptance pass.

**Approval:** incident revision 2026-08-25; Plan 02-21 read-only checkpoint pending
