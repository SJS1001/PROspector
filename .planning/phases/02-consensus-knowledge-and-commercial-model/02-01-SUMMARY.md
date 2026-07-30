---
phase: 02-consensus-knowledge-and-commercial-model
plan: "01"
subsystem: testing
tags: [d1, miniflare, migrations, commercial-model, knowledge-authority]
requires:
  - phase: 01-private-pilot-boundary
    provides: owner-scoped historian interview and D1 persistence conventions
provides:
  - Full-chain D1 fixture and legacy historian contract
  - RED commercial hierarchy and immutable knowledge repository contracts
affects: [02-04, 02-05, 02-06, 02-07, phase-2-hosted-proof]
tech-stack:
  added: []
  patterns: [full ordered migration fixture, forbidden operational-table snapshots, immutable authority RED contracts]
key-files:
  created:
    - site/tests/helpers/d1.mjs
    - site/tests/migration-chain.test.mjs
    - site/tests/commercial-model-repository.test.mjs
    - site/tests/knowledge-repository.test.mjs
  modified: []
key-decisions:
  - "Wave 0 tests deliberately require the exact 0000-0004 chain rather than creating a latest-schema fixture."
  - "Every future Phase 2 authority mutation must compare the complete forbidden operational-table manifest before and after."
requirements-completed: [REQ-commercial-hierarchy, REQ-versioned-knowledge-and-drift]
duration: 25min
completed: 2026-07-30
---

# Phase 2 Plan 01: Full-chain D1 and authority RED contracts Summary

**Miniflare contracts now preserve legacy historian lineage across the required 0000-0004 chain and specify inert commercial and knowledge authority behavior before production code exists.**

## Performance

- **Duration:** 25 min
- **Started:** 2026-07-30T17:03:00Z
- **Completed:** 2026-07-30T17:28:47Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments

- Added a shared full-chain D1 fixture with exact migration ordering, bound/unbound/coexistence historian fixtures, race helper, row counter, and complete forbidden operational manifest.
- Added RED migration assertions for foreign keys, legacy counts/digests, one Company per workspace, authority binding idempotence, and review-required quarantine.
- Added RED repository contracts for the exact commercial hierarchy, inert scope/identity behavior, proposed knowledge provenance, immutable review decisions, and reuse exclusions.

## Task Commits

1. **Task 1: Build full-chain D1 and forbidden-effect test infrastructure** - `42b81fc` (test)
2. **Task 2: Specify the commercial hierarchy and scope contract** - `964cb94` (test)
3. **Task 3: Specify proposed and confirmed knowledge authority** - `e89de9e` (test)

## Files Created/Modified

- `site/tests/helpers/d1.mjs` - shared Miniflare, migration, historian-fixture, race, and forbidden-effect helpers.
- `site/tests/migration-chain.test.mjs` - additive migration/backfill RED contract.
- `site/tests/commercial-model-repository.test.mjs` - commercial hierarchy and scoping RED contract.
- `site/tests/knowledge-repository.test.mjs` - provenance, review, immutability, reuse, and zero-effect RED contract.

## Decisions Made

- Required migration fixtures seed only pre-0004 historian state, then make the missing 0004 file/backfill the explicit RED boundary.
- The forbidden manifest records absent tables explicitly, so a later schema addition cannot be silently skipped by a zero-effect assertion.

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None - these are intentionally failing test contracts, not production stubs.

## Issues Encountered

- The three test files intentionally fail until Plan 04 supplies `0004_consensus_knowledge.sql`; after that they will expose the missing repository exports/behavior owned by Plan 05.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 03's UUID package-legitimacy checkpoint and Plan 04's additive migration are the next required gates.
- This plan added no schema, routes, or operational effects.

## Self-Check: PASSED

- Confirmed all four contract files exist.
- Confirmed task commits `42b81fc`, `964cb94`, and `e89de9e` exist.

---
*Phase: 02-consensus-knowledge-and-commercial-model*
*Completed: 2026-07-30*
