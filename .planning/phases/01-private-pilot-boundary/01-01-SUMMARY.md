---
phase: 01-private-pilot-boundary
plan: "01"
subsystem: testing
tags: [security, authorization, capability-evidence, object-storage, node-test]
requires:
  - phase: project-bootstrap
    provides: Existing owner interview lifecycle, D1 schema, request guards, and pilot boundary decisions
provides:
  - Executable single-owner admission and neutral-denial contract
  - Evidence-backed capability-state contract
  - Workspace-scoped storage lifecycle and route-privacy contracts
affects: [01-02, 01-03, 01-04, private-pilot-boundary]
tech-stack:
  added: []
  patterns: [behavior-first security tests, in-memory storage failure fakes, negative authorization proof]
key-files:
  created:
    - site/tests/pilot-access.test.mjs
    - site/tests/capability-state.test.mjs
    - site/tests/object-storage.test.mjs
    - site/tests/capabilities-route.test.mjs
  modified:
    - site/tests/interview-handler.test.mjs
    - site/tests/interview-repository.test.mjs
key-decisions:
  - Use one neutral `private_workspace_unavailable` response for missing and mismatched identities.
  - Keep repository APIs trusted and prove outsider denial at the admission boundary before repository access.
  - Scope storage operations to opaque probe IDs and require put/read/digest/delete/absence for proof.
requirements-completed:
  - REQ-private-human-governed-gtm
  - REQ-company-workspace-isolation
duration: 12 min
completed: 2026-07-29
---

# Phase 1 Plan 1: Security Contract Summary

Behavior-first tests now make second-principal workspace creation, binding-presence capability claims, privacy leaks, and incomplete object cleanup executable failures.

## Performance

- **Duration:** 12 min
- **Started:** 2026-07-29T23:47:00Z
- **Completed:** 2026-07-29T23:59:13Z
- **Tasks:** 2
- **Files:** 6

## Accomplishments

- Replaced the permissive outsider-bootstrap fixture with neutral owner-only denial and zero-row-delta assertions.
- Preserved owner Answer and Confirmation idempotency, concurrency, snapshot, and audit coverage.
- Added deterministic contracts for capability evidence, fixed storage proof cleanup, cross-prefix rejection, and non-cacheable private route responses.

## Task Commits

1. **Lock the single-owner route and repository contract** — `fd2ce82`
2. **Lock capability evidence, object isolation, and route privacy contracts** — `c4d1f79`

## Files Created/Modified

- `site/tests/pilot-access.test.mjs` — owner, missing-identity, second-principal, neutral-denial, and zero-state-delta contract.
- `site/tests/capability-state.test.mjs` — exact three-state evidence projection contract.
- `site/tests/object-storage.test.mjs` — opaque prefix and complete lifecycle proof contract.
- `site/tests/capabilities-route.test.mjs` — owner-only, no-store, no-email, mutation-guard contract.
- `site/tests/interview-handler.test.mjs` — removes outsider bootstrap and locks denial before D1/CSRF work.
- `site/tests/interview-repository.test.mjs` — preserves owner concurrency while restricting outsider use to negative cross-owner calls.

## Verification

- `node --test tests/pilot-access.test.mjs tests/interview-handler.test.mjs tests/interview-repository.test.mjs` — RED as expected: owner-only handler currently returns the old anonymous status and has no configured-owner admission.
- `node --test tests/capability-state.test.mjs tests/object-storage.test.mjs tests/capabilities-route.test.mjs` — RED as expected: new domain contracts are not implemented and the existing capability route still exposes email/binding booleans.
- File, source-contract, deletion, and commit-history checks — PASS.

## Deviations from Plan

### Auto-fixed Issues

**[Rule 3 - Sequencing] New-module RED failures include missing-module resolution**

- **Found during:** Task 2
- **Issue:** The plan required tests to name exact imports for modules created only in Plans 03 and 04 while also requiring the initial RED run not to fail on import resolution. Both conditions cannot hold in a test-only Wave 0 plan.
- **Fix:** Kept the exact public import contracts and also included an immediately behavioral RED assertion against the existing capability route’s email and `Boolean(FILES)` leak.
- **Verification:** The route leak fails behaviorally and the missing imports precisely identify the implementation work owned by Plans 03 and 04.
- **Commits:** `c4d1f79`

**Total deviations:** 1 auto-resolved sequencing contradiction. **Impact:** No scope or security reduction; later GREEN plans have explicit interfaces to satisfy.

## Issues Encountered

None beyond the documented Wave 0 sequencing contradiction.

## Self-Check: PASSED

- All four Wave 0 files exist.
- Both task commits exist and contain no tracked-file deletions.
- Current unsafe behaviors are red; owner interview repository behavior remains green.
- No dependency, live provider call, real lead data, invitation, role, or arbitrary object API was introduced.

## Next Phase Readiness

Ready for `01-02`: implement normalized single-owner admission and wire it before every interview read or mutation.

---
*Phase: 01-private-pilot-boundary*
*Completed: 2026-07-29*
