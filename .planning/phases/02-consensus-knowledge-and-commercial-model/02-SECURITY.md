---
phase: 02-consensus-knowledge-and-commercial-model
audit: security
asvs_level: 1
block_on: HIGH
status: open_threats
audited: 2026-07-30
---

# Phase 2 security audit

## Result

**OPEN_THREATS** — 10/17 authored threats are closed by implementation evidence; 7 remain open. No accepted risks were used to close a threat. This report treats the local implementation and hosted/control-plane evidence separately: local fixtures, tests, code, and an evidence ledger do not substitute for the mandated hosted proof.

## Scope and method

- Read the threat models in Plans 01–11; summaries 01–11; Phase 2 context, research, patterns, validation, and UI specification; direction, implementation specification, and ADRs 0001–0005.
- Read only the implementation and tests named by the plan summaries. Implementation files were not modified.
- Summary files contain no `## Threat Flags` section. The blocked hosted stages in `02-ACTIVATION.md` map to the existing threats below; there are no unregistered flags.
- Local test invocation of the repository suites did not reach a passing completion: `node --test tests/commercial-model-repository.test.mjs` reported both tests failing. This is not accepted as mitigation evidence.

## Threat register verification

| Threat ID | Category | Disposition | Status | Code evidence or gap |
|---|---|---|---|---|
| T-02-01 | Tampering / Repudiation | mitigate | **OPEN — BLOCKER** | Local full-chain coverage exists in `site/tests/migration-chain.test.mjs:24` and additive quarantine/backfill is present in `site/drizzle/0004_consensus_knowledge.sql:435`. The required hosted old-schema baseline, additive 0004 execution, and post-migration count/digest/foreign-key proof are all explicitly blocked in `02-ACTIVATION.md:8-11`. |
| T-02-02 | Elevation of Privilege | mitigate | CLOSED (local) | Workspace is derived from the admitted principal before locator resolution in `site/domain/commercial-model.ts:124-127`; draft parents are workspace-scoped in `site/domain/commercial-model.ts:191`; cross-workspace insert triggers exist at `site/drizzle/0004_consensus_knowledge.sql:403-414`. Forbidden operational snapshots are asserted by the repository contracts at `site/tests/commercial-model-repository.test.mjs:35,69`. |
| T-02-03 | Information Disclosure | mitigate | CLOSED | Test provenance is synthetic and bounded (`site/tests/knowledge-repository.test.mjs:18-24`); production intake rejects controls and HTML and bounds excerpts (`site/domain/knowledge.ts:103-105`). |
| T-02-04 | Tampering / Repudiation | mitigate | CLOSED (local) | Review derives an ordered operation digest and appends a decision/version rather than overwriting authority (`site/domain/knowledge.ts:63-73`); the migration rejects updates to immutable version authority fields (`site/drizzle/0004_consensus_knowledge.sql:430-431`). `uuid@14.0.1` is the exact installed dependency (`site/package.json:13-18`). |
| T-02-05 | Tampering / Repudiation | mitigate | CLOSED (local) | Interview answer and confirmation flows bind persisted snapshot digests and exact revisions (`site/domain/interview.ts:589-600,614-646`), with unique live-session protection in `site/drizzle/0004_consensus_knowledge.sql:393-394`. |
| T-02-06 | Spoofing / Elevation | mitigate | **OPEN — BLOCKER** | Local admission, neutral denial, origin/intent/content-type/body checks, and one-time CSRF are present in `site/domain/knowledge-handler.ts:53-75`, `site/domain/request-security.ts:6-60`, and `site/domain/csrf.ts:52-68`. But the required post-deploy real-principal/negative/log proof is blocked (`02-ACTIVATION.md:7,14`); local owner simulation is not substitutable evidence. |
| T-02-07 | Tampering | mitigate | CLOSED (local) | POST requires same-origin, intent, JSON, 8 KiB max, and a one-time CSRF token (`site/domain/knowledge-handler.ts:58-64`); drift traversal sorts reached results (`site/domain/drift.ts:99-100`); activation requires the exact preview digest and revision (`site/domain/replacement.ts:75-98`). |
| T-02-08 | Information Disclosure / Tampering | mitigate | CLOSED (local) | Quarantined content is neither readable nor reviewable (`site/domain/knowledge.ts:60,87`), custody is quarantine-only in the migration (`site/drizzle/0004_consensus_knowledge.sql:427-429`), handler responses are no-store/nosniff and opaque (`site/domain/knowledge-handler.ts:158-160`), and the route exposes no multipart/upload API (`site/app/api/knowledge/route.ts:8-21`). |
| T-02-09 | Tampering | mitigate | CLOSED (local) | Dependency-edge discriminants are closed at the boundary (`site/domain/knowledge-handler.ts:173`) and reached artifacts are deduplicated/sorted deterministically (`site/domain/drift.ts:99-133`). |
| T-02-10 | Tampering / Repudiation | mitigate | CLOSED (local) | Candidate creation computes immutable candidate and impact digests (`site/domain/replacement.ts:45-64`); activation separately rechecks the candidate/owner revisions and impact digest (`site/domain/replacement.ts:75-98`). |
| T-02-11 | Elevation | mitigate | CLOSED (local) | Only the admitted workspace is queried (`site/domain/replacement.ts:112-117`); activation is a distinct command guarded by revision/digest checks and a one-active-configuration index (`site/domain/replacement.ts:75-104`, `site/drizzle/0004_consensus_knowledge.sql:390-392`). |
| T-02-12 | Information Disclosure | mitigate | **OPEN — BLOCKER** | The local workspace hides unauthorized/malformed projections (`site/app/knowledge/knowledge-workspace.tsx:29-37,78-80`) and server responses are no-store. Required hosted private-shell/real-principal evidence has not run (`02-ACTIVATION.md:14,17`). |
| T-02-13 | Elevation | mitigate | **OPEN — BLOCKER** | The gate must be exact, not merely present. `writesActivated` checks only non-empty fields and a 64-character digest; it never recomputes/compares the canonical tuple digest (`site/domain/knowledge-handler.ts:149-153`). The schema trigger has the same defect (`site/drizzle/0004_consensus_knowledge.sql:422-426`). Further, the required authorization and gate activation are explicitly blocked (`02-ACTIVATION.md:15-16`). |
| T-02-14 | Tampering / Disclosure | mitigate | **OPEN — BLOCKER** | The preflight CLI has fixed `SELECT`/`PRAGMA` command arrays and redaction (`site/scripts/phase2-hosted-preflight.mjs:29-48`), but deliberately always stops with `release_result_adapter_required` (`site/scripts/phase2-hosted-preflight.mjs:51-57`). No hosted preflight evidence exists (`02-ACTIVATION.md:8,11`). |
| T-02-15 | Elevation | mitigate | **OPEN — BLOCKER** | Canonical fields/digest construction exists (`site/scripts/phase2-gate.mjs:9-26`), but activation inserts only when absent and never reads/verifies the existing row or detects a different existing tuple (`site/scripts/phase2-gate.mjs:47-54,67`). Thus same-tuple-only idempotency and single-field mismatch conflict are absent. |
| T-02-16 | Repudiation | mitigate | **OPEN — BLOCKER** | The ledger explicitly has non-authority semantics (`02-ACTIVATION.md:1-3,21`) but every ordered release/control-plane/lifecycle stage remains blocked (`02-ACTIVATION.md:7-17`). Documentation alone is not evidence of those controls. |
| T-02-SC | Tampering / Elevation | mitigate | CLOSED | The approved `uuid@14.0.1` pin is in `site/package.json:13-18`; authority modules import only `v7` (`site/domain/commercial-model.ts:1`, `site/domain/knowledge.ts:1`, `site/domain/replacement.ts:1`). No dynamic package loading was found in the Phase 2 implementation. |

## Open threats requiring remediation or evidence

| Threat ID | Expected mitigation | Files/evidence searched |
|---|---|---|
| T-02-01 | Hosted D1 preflight, additive migration, then matching post-migration counts/digests/lineage/FK evidence | `site/scripts/phase2-hosted-preflight.mjs`; `site/drizzle/0004_consensus_knowledge.sql`; `02-ACTIVATION.md` |
| T-02-06 | Real-principal hosted authorization, negative-path, and redacted log proof | `site/domain/knowledge-handler.ts`; `site/app/api/knowledge/route.ts`; `02-ACTIVATION.md` |
| T-02-12 | Hosted private-shell and owner lifecycle evidence | `site/app/knowledge/knowledge-workspace.tsx`; `02-ACTIVATION.md` |
| T-02-13 | Recompute the canonical eight-field digest at enforcement time; require reviewed, accepted hosted gate evidence | `site/domain/knowledge-handler.ts`; `site/drizzle/0004_consensus_knowledge.sql`; `site/scripts/phase2-gate.mjs`; `02-ACTIVATION.md` |
| T-02-14 | Execute and retain redacted hosted old-/post-schema preflight results through a reviewed result adapter | `site/scripts/phase2-hosted-preflight.mjs`; `02-ACTIVATION.md` |
| T-02-15 | Gate writer must inspect existing row, succeed only on the exact canonical tuple, and fail on every mismatch | `site/scripts/phase2-gate.mjs`; `site/tests/phase2-gate.test.mjs` |
| T-02-16 | Complete ordered control-plane evidence, independent review, exact-source deployment, and owner lifecycle; ledger text is not sufficient | `02-ACTIVATION.md` |

## Accepted risks

None. ADR-0004 and ADR-0005 contain broader pilot risk decisions, but neither documents acceptance of an open Phase 2 threat in this register.

## Unregistered flags

None. No Plan 01–11 summary supplied a `## Threat Flags` section, and the release ledger’s blocked stages map to T-02-01, T-02-06, T-02-12 through T-02-16.

## Audit trail

- Audited against ASVS Level 1 minimum with `block_on: HIGH`.
- Implementation was read-only; only this report was created.
- No hosted command, migration, deployment, gate write, secret operation, or control-plane change was performed.
- Re-run after fixing the T-02-13/T-02-15 code gaps and after Plans 12+ provide the required hosted, real-principal, migration, control-plane, log, authorization, and lifecycle evidence.
