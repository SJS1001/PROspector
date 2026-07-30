---
phase: 02
slug: consensus-knowledge-and-commercial-model
status: approved
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-30
updated: 2026-07-30
plan_count: 20
task_count: 34
---

# Phase 02 — Validation Strategy

> Final validation map for the revised 20-plan/34-task implementation and fail-closed hosted release.

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
- Before `/gsd:verify-work`: all automated checks and Plans 12, 15, 17, 18, and 20 must be explicitly approved; `human_needed` is paused/incomplete.
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
| 02-13-01 | 13 | 11 | all | T-02-19 | Existing-project compatibility deploy; old-schema GET neutral/POST 503 | deployment gate | `cd site && npm test && npm run lint && npm run build` | pending |
| 02-14-01 | 14 | 12 | all | T-02-21 | Apply exact additive 0004 only | migration gate | `cd site && node --test tests/migration-chain.test.mjs && npm run lint` | pending |
| 02-14-02 | 14 | 12 | all | T-02-22 | Post counts/digests/FKs/gate absence | hosted read-only gate | `cd site && node --test tests/phase2-hosted-preflight.test.mjs && npm test` | pending |
| 02-15-01 | 15 | 13 | all | T-02-23 | Fresh independent exact-source review, zero BLOCKER/HIGH | blocking review gate | `cd site && npm test && npm run lint && npm run build` | pending |
| 02-16-01 | 16 | 14 | all | T-02-24 | Deploy exact reviewed source; gate absent/POST 503 | deployment gate | `cd site && npm test && npm run lint && npm run build && node --test tests/phase2-gate.test.mjs` | pending |
| 02-17-01 | 17 | 15 | all | T-02-26 | Real post-deploy principal/negative/log/zero-delta proof | blocking hosted gate | `cd site && npm test && npm run lint && node --test tests/phase2-hosted-preflight.test.mjs tests/phase2-gate.test.mjs` | pending |
| 02-18-01 | 18 | 16 | all | T-02-29 | Separate explicit consensus_knowledge-only authorization | blocking decision | `cd site && node --test tests/phase2-gate.test.mjs && node scripts/phase2-gate.mjs --help` | pending |
| 02-19-01 | 19 | 17 | all | T-02-30 | Exact gate insert, same-tuple retry, Proposed-only smoke, zero effects | hosted activation gate | `cd site && node --test tests/phase2-gate.test.mjs tests/knowledge-handler.test.mjs && npm test && npm run lint` | pending |
| 02-20-01 | 20 | 18 | all | T-02-32 | Complete hosted owner lifecycle, safe intake provenance, disabled upload/effects | blocking UAT gate | `cd site && npm test && npm run lint && npm run build` | pending |

## Wave 0 Requirements

- [ ] `site/tests/helpers/d1.mjs` applies 0000-0004, seeds all legacy cases, races commands, and snapshots the full forbidden manifest.
- [ ] Repository/handler/drift/UI RED contracts exist before production owners and fail only on missing production behavior.
- [ ] Handler tests cover repository research, bounded plain-text import, same-Company/same-Product reuse, allowlisted package intake, rejected file/multipart/upload, and schema-0003 compatibility.
- [ ] All leaves are pure typed projections/callbacks; `KnowledgeWorkspace` alone owns fetch, CSRF, idempotency, unknown-outcome, and retry behavior.
- [ ] Preflight/gate CLIs have local fake-spawn security tests before any hosted use.

## Manual / Hosted Gates

| Plan | Gate | Pass signal | Failure behavior |
|---:|---|---|---|
| 12 | Real Phase 1 second principal plus read-only schema-0003 baseline before any deploy/migration | `approved old-schema baseline` | `human_needed` pauses; no SUMMARY/deploy/migration |
| 13 | Exact backward-compatible deployment to existing private project and hosted old-schema route proof | recorded terminal deploy + neutral GET/503 POST | stop; gate absent |
| 14 | Exact additive 0004 plus post counts/digests/FKs | accepted post-migration proof | stop; deployed POST remains 503 |
| 15 | Fresh independent exact-source review | `approved independent review` | `human_needed` pauses; no exact-source deploy |
| 16 | Exact reviewed-source deploy with gate absent | source/version equality + POST 503 | stop; gate absent |
| 17 | Real deployed second principal, owner negative matrix, clean logs | `approved deployed boundary proof` | `human_needed` pauses; no authorization request |
| 18 | Separate owner authorization for only consensus_knowledge | exact scoped authorization phrase | silence/generic approval/human_needed pauses; no write |
| 19 | Fixed exact gate insert and scoped smoke | one exact row + zero side effects | stop blocked; never broaden/update/delete |
| 20 | Hosted owner lifecycle and requirement proof | `approved Phase 2 owner lifecycle` | `human_needed` pauses; phase incomplete |

The existing private Sites project is reused throughout. No plan may clone, replace, delete, rename, or expose it, or reveal/rotate/remove secret values. Arbitrary file upload remains disabled because no scanner/release provider is authorized.

## Validation Sign-Off

- [x] Map matches 20 plans and 34 tasks.
- [x] Every task has an automated command; hosted/manual evidence remains explicitly non-substitutable.
- [x] Focused local sampling targets under 30 seconds; no watch flags.
- [x] `human_needed` is pause/incomplete, never acceptance or done.
- [x] Old-schema proof precedes deployment/migration; exact reviewed source precedes activation.
- [x] Separate consensus_knowledge authorization and final owner lifecycle are required.

**Approval:** approved revision 2026-07-30; execution pending
