---
phase: 01-private-pilot-boundary
plan: "03"
subsystem: storage
tags: [capability-evidence, r2, provider-port, sha256, cleanup-proof]
requires:
  - phase: 01-private-pilot-boundary
    plan: "01"
    provides: Failing capability and storage proof contracts
provides:
  - Exact evidence-backed capability status projection
  - Opaque workspace-scoped object-storage port
  - Cloudflare R2 adapter isolated from domain code
  - Fixed write/read/digest/delete/absence proof lifecycle
affects: [01-04, 01-05, capability-status, hosted-r2-proof]
tech-stack:
  added: []
  patterns: [provider-neutral port, server-derived opaque namespace, complete-lifecycle proof, cleanup-on-failure]
key-files:
  created:
    - site/domain/capabilities.ts
    - site/domain/ports/object-storage.ts
    - site/adapters/cloudflare/r2-object-storage.ts
  modified:
    - site/tests/object-storage.test.mjs
key-decisions:
  - Treat a present prerequisite without accepted evidence as unproven, never proven.
  - Scope storage adapters at construction and expose only validated opaque probe IDs to domain code.
  - Require confirmed absence after deletion and return blocked evidence for every incomplete lifecycle.
requirements-completed:
  - REQ-private-human-governed-gtm
  - REQ-company-workspace-isolation
duration: 10 min
completed: 2026-07-29
---

# Phase 1 Plan 3: Capability and Storage Core Summary

Capability truth now comes from current accepted evidence, while storage proof is a fixed provider-neutral lifecycle under an opaque owner-workspace namespace.

## Performance

- **Duration:** 10 min
- **Started:** 2026-07-30T00:05:00Z
- **Completed:** 2026-07-30T00:15:00Z
- **Tasks:** 2
- **Files:** 4

## Accomplishments

- Implemented the exact Proven, Blocked, and Unproven projection with freshness, completeness, and safe-display rules.
- Added an object port that cannot accept a bucket, workspace selector, arbitrary key, or request payload.
- Implemented and tested R2 isolation plus cleanup behavior for corrupt reads, failed deletes, and residual objects.

## Task Commits

1. **Implement evidence-backed capability projection** — `8d29435`
2. **Implement workspace-scoped object port and fixed proof lifecycle** — `8afc3dc`

## Verification

- `node --test tests/capability-state.test.mjs` — PASS.
- `node --test tests/object-storage.test.mjs tests/capability-state.test.mjs` — PASS, 4/4.
- `npm run lint` — PASS.
- `npm test` — build PASS; 10/12 tests PASS. The only remaining RED tests are the capability handlers and legacy capability route replacement owned by Plan 04.
- Source checks confirm no `R2Bucket` or provider import appears under `site/domain/`.

## Deviations from Plan

### Auto-fixed Issues

**[Rule 2 - Testability] Workspace prefix helper is asynchronous**

- **Found during:** Task 2
- **Issue:** A cryptographically opaque prefix cannot be derived safely with Web Crypto through a synchronous helper.
- **Fix:** Made `workspaceObjectPrefix` and the key constructor asynchronous and updated the contract test to await them.
- **Files modified:** `site/domain/ports/object-storage.ts`, `site/tests/object-storage.test.mjs`
- **Verification:** Opaque SHA-256 prefix, traversal rejection, and R2 adapter tests pass.
- **Commit:** `8afc3dc`

**[Rule 3 - Wave dependency] Full suite retains the Plan 04 route RED tests**

- **Found during:** Plan verification
- **Issue:** The capability handler and secure route are intentionally not part of the provider-neutral domain core.
- **Fix:** Verified every Plan 03 test and retained the two downstream failures for Plan 04.
- **Verification:** Build and lint pass; 10/12 tests pass and both failures name Plan 04 artifacts.
- **Commit:** No code change.

**Total deviations:** 2 auto-handled (1 secure interface adjustment, 1 planned wave dependency). **Impact:** Stronger namespace opacity and no scope expansion.

## Issues Encountered

None.

## Self-Check: PASSED

- Capability status is exactly `proven | blocked | unproven`.
- Binding/configuration presence alone cannot produce Proven.
- Domain code contains no R2 provider type or import.
- Cross-prefix IDs, digest mismatch, delete failure, and residual-object cases cannot produce successful proof.
- Success evidence contains no payload, raw workspace ID, bucket handle, secret, or owner identity.

## Next Phase Readiness

Ready for `01-04`: wire owner-only capability APIs, audit the fixed proof, and build the Pilot Status surface.

---
*Phase: 01-private-pilot-boundary*
*Completed: 2026-07-29*
