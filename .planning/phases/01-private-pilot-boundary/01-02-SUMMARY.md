---
phase: 01-private-pilot-boundary
plan: "02"
subsystem: auth
tags: [single-owner, trusted-identity, hmac-principal, neutral-denial, csrf]
requires:
  - phase: 01-private-pilot-boundary
    plan: "01"
    provides: Failing owner-only admission and route-isolation contract
provides:
  - Normalized server-only pilot-owner admission
  - Owner admission before interview D1, CSRF, and request-body operations
  - Neutral non-cacheable denial for missing and mismatched identities
affects: [01-04, 01-05, capability-routes, hosted-proof]
tech-stack:
  added: []
  patterns: [admission-before-resolution, server-only allowlist, neutral private-resource denial]
key-files:
  created:
    - site/domain/pilot-access.ts
    - .planning/phases/01-private-pilot-boundary/01-USER-SETUP.md
  modified:
    - site/domain/interview-handler.ts
    - site/app/api/interview/route.ts
    - site/tests/pilot-access.test.mjs
    - site/tests/interview-handler.test.mjs
key-decisions:
  - Return the same non-cacheable 404 and stable code for missing, invalid, or mismatched identities.
  - Keep the owner email only in Sites server runtime configuration and inject it into domain admission.
  - Preserve repository APIs as trusted internal operations and enforce public admission before any repository call.
requirements-completed:
  - REQ-private-human-governed-gtm
  - REQ-company-workspace-isolation
duration: 11 min
completed: 2026-07-29
---

# Phase 1 Plan 2: Single-Owner Admission Summary

Trusted Sites identity is now compared with one server-configured owner before any workspace read, CSRF operation, body processing, or interview mutation.

## Performance

- **Duration:** 11 min
- **Started:** 2026-07-30T00:00:00Z
- **Completed:** 2026-07-30T00:11:00Z
- **Tasks:** 2
- **Files:** 6

## Accomplishments

- Added case-insensitive, trimmed, format-checked owner admission with protected HMAC principal derivation only after a match.
- Wired both interview methods to deny missing and second principals before touching D1.
- Kept all Origin, Fetch Metadata, intent, one-time CSRF, JSON type, body-size, concurrency, idempotency, and separate-confirmation behavior green.

## Task Commits

1. **Implement normalized single-owner admission** — `a78e7a5`
2. **Wire admission before interview reads and mutations** — `4810b7e`

## Verification

- `node --test tests/pilot-access.test.mjs` — PASS.
- `node --test tests/pilot-access.test.mjs tests/interview-handler.test.mjs tests/interview-repository.test.mjs tests/request-security.test.mjs` — PASS, 4/4.
- `npm run lint` — PASS.
- `npm test` — build PASS; 6 existing/owner-boundary tests PASS and 5 deliberate Wave 0 tests remain RED for modules owned by Plans 03 and 04.
- Source checks confirm `PILOT_OWNER_EMAIL` appears only in server route wiring and admission occurs before request/D1 operations.

## Deviations from Plan

### Auto-fixed Issues

**[Rule 1 - Test bug] Neutral-code privacy assertion matched its own required word**

- **Found during:** Task 2
- **Issue:** The negative-response regex rejected the required `private_workspace_unavailable` code merely because it contains “workspace.”
- **Fix:** Narrowed the leak check to actual workspace IDs and sensitive owner/company/audit/capability data.
- **Files modified:** `site/tests/interview-handler.test.mjs`, `site/tests/capabilities-route.test.mjs`
- **Verification:** Owner-boundary suite passes and the exact neutral body remains asserted.
- **Commit:** `4810b7e`

**[Rule 3 - Wave dependency] Full suite contains expected downstream RED contracts**

- **Found during:** Plan verification
- **Issue:** Plan 01 intentionally added tests for capability, storage, and route modules that Plans 03 and 04 create.
- **Fix:** Verified the entire build and every Plan 02 test; retained the five downstream RED failures so their GREEN owners cannot be skipped.
- **Verification:** Build and lint pass; only the named Phase 1 Wave 0 tests fail.
- **Commit:** No code change.

**Total deviations:** 2 auto-handled (1 test correction, 1 planned wave dependency). **Impact:** Owner admission is complete; no downstream capability was falsely claimed.

## Issues Encountered

- Hosted runtime still needs the actual `PILOT_OWNER_EMAIL` configured without committing or displaying it. This is tracked in `01-USER-SETUP.md` and automated deployment proof.

## Self-Check: PASSED

- Owner, missing identity, invalid config, case normalization, and second-principal tests pass.
- Denied requests create no workspace, interview, knowledge, audit, or CSRF state.
- Owner Answer and Confirmation behavior remains durable, concurrent-safe, idempotent, and non-cacheable.
- No invitation, role, workspace selector, client identity source, or secret value was introduced.

## Next Phase Readiness

Ready for `01-03`: implement the evidence-backed capability projection and provider-neutral fixed storage proof.

---
*Phase: 01-private-pilot-boundary*
*Completed: 2026-07-29*
