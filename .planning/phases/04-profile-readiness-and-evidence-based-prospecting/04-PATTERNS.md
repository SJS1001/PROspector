---
phase: 04
status: prepared-dependency-blocked
created: 2026-07-30
---

# Phase 4 — Implementation Patterns

## Pattern map

| Concern | Pattern to preserve | Closest existing analog |
|---|---|---|
| Admission | derive admitted principal/workspace server-side before every lookup; neutral denial otherwise | `site/domain/interview.ts`, `site/domain/pilot-access.ts` |
| Mutation security | central same-origin/Fetch-Metadata/CSRF/type/size validation before domain command | `site/domain/request-security.ts` |
| Route boundary | thin dependency-injected route; handler maps typed result/conflict only | `site/domain/interview-handler.ts` and `site/app/api/interview/route.ts` |
| Immutable command | canonical input/digest + expected revision + idempotency + audit event + fresh projection | `site/domain/interview.ts` / Phase 2 plans |
| D1 concurrency | unique indexes plus FK-backed authority-command guard; do not rely on zero-row guarded UPDATE | Phase 2 migration/repository pattern |
| Schema testing | additive numbered migration, full chain fixture, forbidden-table before/after snapshot | `site/drizzle/*`, `site/tests/helpers/d1.mjs` |
| UI authority | one transport/mutation owner; leaves receive typed projection/callbacks and never fetch/retry/parse | Phase 2 `KnowledgeWorkspace` pattern |
| Controls | actual native `disabled` plus adjacent boundary copy; no visual-only safety | `site/app/prospector-app.tsx`, `site/app/globals.css` |

## New Phase 4 deep modules

Keep mechanics behind a small set of deep domain interfaces rather than spreading state checks across routes/UI:

```text
profile-readiness.ts     completeness projection, candidate/activate/read
prospecting-schedule.ts  slot reservation, watermark/misfire policy, run lifecycle
runner-assignment.ts     issue/revoke/validate bounded assignments and submissions
source-policy.ts         retrieval normalization, tiering, origin/independence, recency
qualification.ts         pure rubric evaluator and canonical assessment output
prospect-review.ts       state transitions, cooldown/re-entry, immutable decisions
ports/{scheduler,runner,retrieval}.ts
```

The exact file names are discretionary. The boundary is not: a UI component or provider adapter must not implement readiness, source tiering, qualification, or review eligibility.

## Transaction pattern

Every consequential mutation follows this shape:

1. Resolve admitted workspace and current authoritative rows.
2. Validate exact scope, status, predecessor/configuration references, expected revisions, and strict input fields.
3. Canonicalize allowed input in fixed order and calculate operation digest.
4. Return an existing result only when the same idempotency key and digest match; conflict on key reuse with a different digest.
5. Insert an authority command guarded by current state and FK-reference it from immutable version/event rows.
6. Insert/update only the narrowly authorized current projection, append audit/event records, and rely on unique indexes as final race arbiters.
7. Reload and return a fresh authoritative projection. A lost response is recovered by a read, never an automatic mutation retry.

## Configuration activation invariant

Candidate creation and activation are distinct commands. Activation must atomically: revalidate candidate and parents, make exactly one configuration active, preserve the prior version, create exactly one initial run, establish/update the profile schedule, append audit/run/schedule events, and return a projection. It must not create Contacts, Enriched Contacts, grants, Packages, messages, sends, exports, or provider work. Replacement directives may be recorded but are executed only by the owning capability.

## Runner assignment invariant

Treat runner credentials like a capability with one narrow path: `assignment -> bounded submission`. Store token hashes, not bearer values. Submission parser uses an allowlist and rejects unknown authority-bearing fields. A runner can create no rows except accepted immutable submission/finding/proposal records under its assigned run, and even those require server normalization. The application alone moves `Queued -> Assigned -> Running -> Submitted -> Validating -> Succeeded|Rejected|Failed|Cancelled|Expired` and emits every event.

## Evidence and qualification invariant

Separate these stages:

```text
retrieved source -> sanitized observation -> application source policy
-> immutable Signal/Candidate -> pure assessment -> Prospect projection
```

No stage mutates a prior fact. The pure evaluator receives already-validated structured evidence plus an exact configuration; it emits a canonical assessment with no I/O. The caller persists its output, then—and only for `Passed`—moves a Candidate to Qualified. Tier, source independence, recency, and hard disqualifiers are trusted service inputs, never model claims.

## UI invariant

Render the authoritative configuration/evidence/assessment before decision controls. Pending actions retain the exact snapshot and disable competitors. Unknown/malformed/stale authority removes mutation controls. Text is always paired with color for tier, readiness, outcome, and run status. Every later-phase action is absent or truly disabled with a visible explanation.

## Forbidden-effect manifest extension

Extend the existing Phase 2 snapshot helper whenever Phase 4 adds an operational table. Profile configuration/run/evidence/assessment/review tables become expected Phase 4 deltas. At minimum, the prohibited delta manifest continues to cover Contact/Enriched Contact records, enrichment grants/charges, Outreach Packages, message approvals/messages, sends/call events, CRM exports, workspace exports/restores, credentials, and provider secrets. A passed prospect review must be proven to leave all of them unchanged.

## Anti-patterns

- Browser-provided configuration/runner/scope IDs treated as authority.
- A model’s source tier, score, or recommendation accepted without trusted recomputation.
- Generic crawler or bearer token with workspace-wide read/write permission.
- A schedule key lacking intended local time plus UTC offset.
- Evidence groups based solely on URL, allowing syndications to count twice.
- Readiness mutation that creates only a candidate but calls it Ready, or activation that silently creates work twice on retry.
- Qualification/review function that also starts enrichment/outreach/export.
- UI green badges rendered from cached/optimistic client state.
