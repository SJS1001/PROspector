---
phase: 02-consensus-knowledge-and-commercial-model
plan: "07"
subsystem: domain-authority
tags: [d1, drift, dependency-graph, replacement, idempotency, immutable-configuration]
requires:
  - phase: 02-consensus-knowledge-and-commercial-model
    provides: immutable knowledge versions, configuration dependency tables, and owner-scoped D1 conventions
provides:
  - Deterministic source/version/configuration/artifact reach evaluation
  - Closed high-risk allowlist with reached-only containment projection
  - Separate immutable replacement candidate and exact-digest activation authority
affects: [02-08, 02-09, phase-3-readiness, future-operational-directive-consumers]
tech-stack:
  added: []
  patterns: [stable dependency snapshots, digest-bound authority commands, operationally inert directives]
key-files:
  created:
    - site/domain/drift.ts
    - site/domain/replacement.ts
  modified: []
key-decisions:
  - "Unknown drift kinds are standard and never infer a pause."
  - "Only artifacts reached through persisted dependency edges appear in a preview."
  - "Activation is a second idempotent command with exact impact digest and revision guards."
requirements-completed: [REQ-versioned-knowledge-and-drift]
duration: 18min
completed: 2026-07-30
---

# Phase 2 Plan 07: Dependency-reached drift and immutable replacement Summary

**Deterministic drift snapshots now constrain containment to recorded dependency reach, while inactive replacement candidates require a separate exact-digest activation command.**

## Performance

- **Duration:** 18 min
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Added a pure, sorted graph traversal with cycle/duplicate tolerance, closed risk classification, and stable impact categories for future schedules, in-flight history, requalification, invalidation, reactivation, and contacted/exported history.
- Added candidate authority that validates confirmed knowledge lineage, current configuration revision, and exact immutable impact before creating an inactive configuration.
- Added a distinct activation authority with idempotency and revision guards that changes only the active typed-configuration pointer, preserves the prior configuration, and records later-consumer directives without operational work.

## Task Commits

1. **Task 1: Implement deterministic reached-only drift evaluation** — `681d0f5` (feat)
2. **Task 2: Implement separate replacement candidate and activation transactions** — `27f8ffa` (feat)

## Files Created/Modified

- `site/domain/drift.ts` — pure high-risk classification, dependency reach, and stable immutable impact projection.
- `site/domain/replacement.ts` — owner-scoped D1 candidate, activation, and read authority.

## Decisions Made

- High risk is exactly capability, claim_guardrail, offer, proof_point, and suppression; every other kind is standard.
- The preview digest is SHA-256 over a stable impact snapshot and must match precisely at activation.
- No candidate is activated on creation; an owner must issue an independent activation idempotency key.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- The initial focused test command could not load Vite because this isolated worktree had no installed `site/node_modules`; `npm ci` restored the lockfile-defined local dependencies without changing project files.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 08 can expose read-only previews and closed owner commands without broadening operational authority.
- Future phases may consume the recorded directives only after their own capability gates; this plan performs no Runs, schedules, prospects, qualifications, approvals, packages, messages, exports, contacts, or provider work.

## Verification

- `cd site && node --test tests/drift-replacement.test.mjs` — PASS (3/3).
- `cd site && npm run lint` — PASS.
- `git diff --check` — PASS.
- Drift module grep confirms no D1/database import or forbidden operational-table mutation path.

## Self-Check: PASSED

- Confirmed both owned domain files exist and task commits `681d0f5` and `27f8ffa` are present.
- Confirmed the full specified Plan 07 verification command passes.

---
*Phase: 02-consensus-knowledge-and-commercial-model*
*Completed: 2026-07-30*
