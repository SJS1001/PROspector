---
phase: 02-consensus-knowledge-and-commercial-model
audit: security
asvs_level: 1
block_on: HIGH
status: blocked_external
audited: 2026-07-30
implementation_threats_closed: 17
implementation_threats_open: 0
external_threats_blocked: 2
threats_total: 19
---

# Phase 2 security re-audit

## Result

**LOCAL IMPLEMENTATION SECURED; PHASE RELEASE BLOCKED ON EXTERNAL EVIDENCE.**

## Greenfield continuation update — 2026-09-03

T-02-17 and T-02-18 below describe the retired Sites release and are preserved
only as historical threat evidence. They must not be tested against that
target. Their active greenfield equivalents remain open under Plan 02-99:
fresh owner/non-owner isolation with zero delta, and exact checked
source/migration/integrity evidence for the new target, followed by negative
mutation, secret/log, zero-effect, and exact-release review evidence. Stages
1–2 prove the exact empty D1/R2 migration baseline. Revised Stage 3A created
one bootstrap Worker version/deployment and authenticated read-only evidence
proved production and preview routing disabled, no custom route/domain, zero
Cron, and zero D1/R2 delta. No Access policy, secret, final runtime version,
application request, real-principal denial, negative-mutation proof, or owner
acceptance exists. The unreachable shell closes no identity or release threat.

- Authored threats closed: **17/19**.
- Local implementation threats open: **0**.
- External hosted threats blocked: **2/19** — T-02-17 and T-02-18.
- Accepted risks used to close threats: **none**.

Commits `1b4049b` and `af0d4c4` close the prior local authority, gate, custody, concurrency, and legacy-read findings. They do not satisfy Plan 02-12 or authorize hosted deployment, migration, or activation.

## Scope and method

- Re-read the ordered repository continuation sources, active audits, Plan 02-12, and its Plan 02-11 dependency summary.
- Re-verified the complete unique threat register authored by Plans 02-01 through 02-12 against current code, migration, tests, and the blocked activation ledger.
- Treated local implementation controls separately from real-principal and hosted-D1 evidence. Local tests, fixtures, code structure, digests, and prose are not substitutes for T-02-17 or T-02-18.
- Implementation remained read-only. Only this report was updated.

## Threat verification

| Threat ID | Category | Disposition | Status | Implementation evidence or exact blocker |
|---|---|---|---|---|
| T-02-01 | Tampering / Repudiation | mitigate | CLOSED (local) | Full 0000–0004 bound, legacy-unbound, and coexistence invariants pass in `site/tests/migration-chain.test.mjs:24-64`; migration backfill and quarantine are implemented in `site/drizzle/0004_consensus_knowledge.sql:432-451`. Hosted execution remains an external release stage, not a missing local mitigation. |
| T-02-02 | Elevation of Privilege | mitigate | CLOSED | Workspace is principal-derived and parent resolution is workspace-scoped in `site/domain/commercial-model.ts:124-127,191-194`. Draft entity/audit inserts now depend on the successfully guarded authority command at `site/domain/commercial-model.ts:137-160`. |
| T-02-03 | Information Disclosure | mitigate | CLOSED | Intake validates bounded plain text and provenance in `site/domain/knowledge.ts:19-23,132-134`; fixtures use synthetic bounded content in `site/tests/knowledge-repository.test.mjs:13-24`. |
| T-02-04 | Tampering / Repudiation | mitigate | CLOSED | Knowledge review uses an exact operation digest, rejects changed-payload key reuse, and makes later writes depend on a guarded authority command in `site/domain/knowledge.ts:66-109`. Confirmed semantic fields are immutable at `site/drizzle/0004_consensus_knowledge.sql:445-446`. |
| T-02-05 | Tampering / Repudiation | mitigate | CLOSED | Generalized decision preparation, version/decision writes, session/question transition, confirmation, binding, audit, and optional Offer now execute in one D1 batch at `site/domain/interview.ts:654-689`; failure-injection coverage proves rollback in `site/tests/knowledge-repository.test.mjs:129-162`. |
| T-02-06 | Spoofing / Elevation | mitigate | CLOSED (local) | Owner admission precedes schema/request/gate work; POST enforces origin, intent, JSON, bounded body, one-time owner CSRF, and neutral errors at `site/domain/knowledge-handler.ts:53-75`. Real-principal hosted proof is separately T-02-17. |
| T-02-07 | Tampering | mitigate | CLOSED | Closed request discriminants and bounded arrays are enforced in `site/domain/knowledge-handler.ts:78-137,171-182`; replacement activation separately revalidates exact digest/revisions in `site/domain/replacement.ts:78-107`. |
| T-02-08 | Information Disclosure / Tampering | mitigate | CLOSED | Quarantined intake persists a digest and empty excerpt rather than raw content at `site/domain/knowledge.ts:21-35`; projections withhold the value at `site/domain/knowledge.ts:124`; tests prove the raw content is absent from persistence and library output at `site/tests/knowledge-repository.test.mjs:56-71`. |
| T-02-09 | Tampering | mitigate | CLOSED | The handler admits only enumerated dependency edge types with bounded cardinality (`site/domain/knowledge-handler.ts:181-182`), and drift output is deduplicated and deterministically sorted (`site/domain/drift.ts:99-133`). |
| T-02-10 | Tampering / Repudiation | mitigate | CLOSED | Replacement candidates bind current/candidate/configuration/dependency state into exact immutable digests at `site/domain/replacement.ts:45-52,55-75`; changed-payload key reuse is rejected at `site/domain/replacement.ts:50-53`. |
| T-02-11 | Elevation | mitigate | CLOSED | Activation is a distinct owner-scoped transaction requiring the exact preview digest and current revisions, with a unique active-configuration index (`site/domain/replacement.ts:78-107`; `site/drizzle/0004_consensus_knowledge.sql:390-392`). |
| T-02-12 | Information Disclosure | mitigate | CLOSED (local) | The client hides unauthorized/malformed authority and uses no-store fetches (`site/app/knowledge/knowledge-workspace.tsx:26-38,78-80`); the server returns neutral no-store/nosniff responses (`site/domain/knowledge-handler.ts:166-168`). Hosted edge proof is separately T-02-17. |
| T-02-13 | Elevation | mitigate | CLOSED (local, fail-closed) | `writesActivated` now loads exactly one complete tuple, recomputes SHA-256 over the canonical eight-field order, and compares it to `tuple_digest` at `site/domain/knowledge-handler.ts:149-160`. More strongly, the current migration rejects every gate insert pending a future trusted server authorization anchor at `site/drizzle/0004_consensus_knowledge.sql:422-425`. No local path can activate writes. |
| T-02-14 | Tampering / Disclosure | mitigate | CLOSED (local) | Preflight permits only fixed modes/database values and fixed `SELECT`/`PRAGMA` argument arrays, filters the report, and fails closed without a reviewed result adapter (`site/scripts/phase2-hosted-preflight.mjs:8-57`). Actual hosted baseline evidence is separately T-02-18. |
| T-02-15 | Elevation | mitigate | CLOSED (risk surface removed) | The prior gate writer no longer exists. `activate` throws `activation_not_authorized`, command construction emits one read-only inspection query, and the schema independently rejects inserts (`site/scripts/phase2-gate.mjs:21-42`; `site/drizzle/0004_consensus_knowledge.sql:422-425`). Plan 19 must design and re-audit a trusted authorization anchor before any activation path is restored. |
| T-02-16 | Repudiation | mitigate | CLOSED (local) | `02-ACTIVATION.md:1-23` keeps ordered release stages explicit and blocked and states that the ledger never grants authority. Its blocked statuses are truthful control-plane state, not local implementation gaps. |
| T-02-17 | Spoofing | mitigate | **BLOCKED — EXTERNAL EVIDENCE** | No controlled second real signed-in principal/zero-state-delta proof exists. `02-ACTIVATION.md:7` remains `human_needed`. Mocks and local principals cannot close this threat. |
| T-02-18 | Tampering / Disclosure | mitigate | **BLOCKED — EXTERNAL EVIDENCE** | No accepted read-only hosted D1 schema-0003 baseline exists. `02-ACTIVATION.md:8` remains `human_needed`; no hosted query, deployment, or migration was performed. |
| T-02-SC | Tampering / Elevation | mitigate | CLOSED | `uuid` remains pinned exactly to `14.0.1` in `site/package.json`; authority modules statically import only `v7`. Plans 02-11/12 add no dependency. |

## Prior local findings rechecked

| Prior risk | Re-audit result |
|---|---|
| Fabricated gate evidence / incomplete tuple validation | CLOSED — activation CLI removed, schema inserts prohibited, handler canonical digest recomputation present. |
| Stale knowledge review committing authority | CLOSED — guarded authority-command insert is a required FK dependency; concurrent-review test proves one decision/version. |
| First Offer bound to the wrong Profile | CLOSED — helper and D1 trigger require confirmed version scope ID to equal the Offer Profile. |
| Split interview decision transactions | CLOSED — all authority writes are one batch with rollback failure-injection coverage. |
| Quarantined content disclosure | CLOSED — raw content is neither stored in excerpt/proposal authority nor returned in projections. |
| Draft parent revision race | CLOSED — child and audit depend on the guarded command and missing creation is rejected. |
| Changed-payload idempotency-key reuse | CLOSED — operation digests are compared for review and replacement candidate retries. |
| Confirmed-version semantic mutation | CLOSED — trigger covers item, proposal, decision, command, scope, kind, value, digest, and source fields. |

## Residual blockers

### Local implementation blockers

None found.

### External hosted blockers

| Threat ID | Non-substitutable evidence required | Current state |
|---|---|---|
| T-02-17 | Real second signed-in principal denied across the private Sites boundary with zero owner D1/R2/audit delta | `human_needed`; Plan 02-12 incomplete |
| T-02-18 | Read-only hosted D1 baseline proving exact migrations 0000–0003, protected counts/digests, empty FK violations, forbidden-table counts, and absent Phase 2 gate | `human_needed`; Plan 02-12 incomplete |

Plans 02-13 through 02-20 remain dependency-blocked. This audit does not authorize a deployment, migration, gate write, secret operation, or control-plane change.

## Accepted risks

None. ADR-0004 and ADR-0005 contain broader pilot risk decisions, but neither accepts T-02-17 or T-02-18.

## Unregistered flags

None. The current blocked hosted stages map to the authored Plan 02-12 threats and later ordered release gates.

## Verification and audit trail

- Node.js: `v24.16.0` (satisfies the repository minimum of 22.13).
- `cd site && npm ci` — PASS.
- `cd site && npm test` — PASS, 42/42.
- `cd site && npm run lint` — PASS.
- Re-audited current HEAD containing `1b4049b` and `af0d4c4`.
- No implementation, hosted resource, access policy, database, deployment, gate, or secret was modified by this audit.
