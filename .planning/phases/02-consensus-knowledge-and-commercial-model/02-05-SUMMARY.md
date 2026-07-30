---
phase: 02-consensus-knowledge-and-commercial-model
plan: "05"
subsystem: domain-authority
tags: [d1, uuidv7, commercial-hierarchy, proposed-knowledge, immutable-versions]
requires:
  - phase: 02-consensus-knowledge-and-commercial-model
    provides: Additive 0004 authority schema, immutable lineage tables, and uuid@14 v7
provides:
  - Owner-derived Company -> Product -> Market Play -> Customer Profile aggregate
  - Immutable Proposed Knowledge intake, owner review, and Confirmed Version records
affects: [02-06, 02-07, 02-08, knowledge-handler, knowledge-ui, drift]
tech-stack:
  added: []
  patterns: [principal-derived workspace, prepared D1 authority commands, immutable snapshot digests, fail-closed quarantine]
key-files:
  created: [site/domain/commercial-model.ts, site/domain/knowledge.ts]
  modified: []
key-decisions:
  - "Commercial initialization seeds exactly Digitalrain -> ONE -> ONE for Mining with Operating and Greenfield Draft/nurture profiles, never an Offer."
  - "All knowledge intake is immutable Proposed state; only Accept, Correct, or Rescope appends a Confirmed Version."
patterns-established:
  - "Use the admitted principal to resolve the workspace before every locator and bind all D1 statements."
  - "Model uploads only as opaque quarantined custody metadata; no content read, render, parser, or release path is exposed."
requirements-completed: [REQ-commercial-hierarchy, REQ-versioned-knowledge-and-drift]
duration: 24min
completed: 2026-07-30
---

# Phase 02 Plan 05: Commercial and Knowledge Authority Summary

**Owner-scoped commercial hierarchy and immutable Proposed-to-Confirmed knowledge authority backed by D1 lineage, revision guards, and zero operational writes.**

## Performance

- **Duration:** 24 min
- **Started:** 2026-07-30T17:34:00Z
- **Completed:** 2026-07-30T17:58:33Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Added a principal-derived commercial aggregate that initializes the exact Digitalrain hierarchy, limits generic creation to Draft Product/Play/Profile entities, and preserves Offer creation for confirmed hierarchy-interview lineage only.
- Added immutable provenance-bearing Proposed Knowledge intake for edits, research metadata, plain text, reuse, packages, and quarantined uploads.
- Added owner decision review with idempotent append-only Confirmed Versions for Accept/Correct/Rescope, auditable Reject decisions, and cross-Company fail-closed exclusions.

## Task Commits

1. **Task 1: Implement the authoritative commercial aggregate** — `1a1a390` (feat)
2. **Task 2: Implement proposed and confirmed knowledge authority** — `5826816` (feat)

## Files Created/Modified

- `site/domain/commercial-model.ts` — owner-scoped hierarchy projection, seed, Draft creation, and confirmed-lineage Offer materialization helper.
- `site/domain/knowledge.ts` — proposal provenance, quarantine, review decisions, immutable versions, and reuse controls.

## Decisions Made

- The fixed seed contains no Offer and both initial Profiles retain Draft/nurture presentation.
- Operational associations remain projection-only; neither commercial nor knowledge authority writes a forbidden operational table.

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None. Quarantined upload metadata is intentionally unreadable and non-reviewable until a future approved scanner exists.

## Issues Encountered

- The D1/Vite repository harness requires its normal local loopback listener; focused verification was run in that approved test environment.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 06 can connect confirmed hierarchy-interview decisions to the transaction-only Offer materialization helper.
- Knowledge handlers, UI, and drift work can consume the immutable projections without enabling operational effects.

## Self-Check: PASSED

- `site/domain/commercial-model.ts` and `site/domain/knowledge.ts` exist.
- Task commits `1a1a390` and `5826816` exist in git history.

---
*Phase: 02-consensus-knowledge-and-commercial-model*
*Completed: 2026-07-30*
