---
phase: 01-private-pilot-boundary
plan: "04"
subsystem: ui
tags: [capability-api, csrf, r2-proof, react, accessibility, server-rendering]
requires:
  - phase: 01-private-pilot-boundary
    plan: "02"
    provides: Single-owner trusted-identity admission
  - phase: 01-private-pilot-boundary
    plan: "03"
    provides: Evidence projection and provider-neutral storage proof
provides:
  - Owner-only capability read and fixed proof APIs
  - Audited R2 lifecycle proof with no caller-selected scope or payload
  - Server-gated default Pilot Status page
  - Eight-card evidence hierarchy and explicit broader-operation boundary
affects: [01-05, hosted-proof, production-deployment, all-later-phases]
tech-stack:
  added: []
  patterns: [injected route handler, server-loaded security state, native disclosure semantics, fail-closed client normalization]
key-files:
  created:
    - site/domain/capability-handler.ts
    - site/app/api/capability-runtime.ts
    - site/app/api/capability-probe/route.ts
  modified:
    - site/app/api/capabilities/route.ts
    - site/worker/index.ts
    - site/app/page.tsx
    - site/app/prospector-app.tsx
    - site/app/globals.css
    - site/tests/capabilities-route.test.mjs
    - site/tests/rendered-html.test.mjs
key-decisions:
  - Load accepted capability state in the server page so unauthorized HTML never contains the private shell.
  - Keep the only storage mutation fixed to an empty JSON body and server-derived workspace, key, and bytes.
  - Present proof status without activating any later workflow or treating configuration presence as proof.
requirements-completed:
  - REQ-private-human-governed-gtm
  - REQ-company-workspace-isolation
duration: 25 min
completed: 2026-07-29
---

# Phase 1 Plan 4: Secure Capability Surface Summary

The private site now opens on an owner-only Pilot Status page backed by non-cacheable evidence APIs and one fixed, audited R2 lifecycle proof.

## Performance

- **Duration:** 25 min
- **Started:** 2026-07-30T00:15:00Z
- **Completed:** 2026-07-30T00:40:00Z
- **Tasks:** 2
- **Files:** 10

## Accomplishments

- Removed owner email and binding booleans from capability responses.
- Added admission, same-origin, intent, one-time CSRF, bounded JSON, empty-body, failure, replay, and success proof coverage.
- Implemented the approved information hierarchy, exact evidence states, neutral unauthorized render, native disabled boundaries, and accessible evidence disclosures.
- Reached React Doctor 100/100 with no findings; lint, build, and all 13 tests pass.

## Task Commits

1. **Build owner-only capability read and fixed proof routes** — `8cb683f`
2. **Implement Pilot Status and preserve every disabled boundary** — `a3f832e`

## Verification

- Capability route/security suite — PASS, 7/7.
- Render/fixture/capability suite — PASS, 5/5.
- `npm run lint` — PASS.
- `npm test` — PASS, build plus 13/13 tests.
- `npx -y react-doctor@latest . --verbose --scope changed` — PASS, 100/100, no findings.
- Source checks find no email response, `Boolean(FILES)` proof claim, shadcn, registry, icon library, or enabled later-phase effect.

## Deviations from Plan

### Auto-fixed Issues

**[Rule 3 - Security/Testability] Added explicit domain handler and server runtime wiring**

- **Found during:** Task 1
- **Issue:** Testing route behavior without importing `cloudflare:workers`, and sharing identical GET/POST security dependencies, required seams not named in the plan file list.
- **Fix:** Added `site/domain/capability-handler.ts` and `site/app/api/capability-runtime.ts`; route files now contain only provider wiring.
- **Verification:** Unauthorized, origin, intent, CSRF, replay, fixed-body, missing-binding, failed-proof, and success tests pass.
- **Commit:** `8cb683f`

**[Rule 3 - Security] Added server-page admission and initial capability loading**

- **Found during:** Task 2
- **Issue:** Client-only authorization would ship the private application shell and company copy before a denial response.
- **Fix:** Updated `site/app/page.tsx` to obtain the owner-only capability view on the server and render the neutral screen when admission fails.
- **Verification:** Unauthorized static render contains no company, navigation, capability evidence, product/play, or audit reference.
- **Commit:** `a3f832e`

**[Rule 1 - React quality] Fixed three diagnostic findings**

- **Found during:** React Doctor and lint verification
- **Issue:** Module-pure callback placement, accumulator spreading, client effect fetching, and JSX inside `try` were flagged across the diagnostic passes.
- **Fix:** Moved pure work to module scope, used a linear counter, loaded initial capability data on the server, and returned JSX outside exception handling.
- **Verification:** React Doctor 100/100; ESLint PASS.
- **Commit:** `a3f832e`

**Total deviations:** 3 auto-fixed (2 security architecture, 1 React quality). **Impact:** Stronger privacy and clearer provider seams; no scope expansion into operational workflows.

## Issues Encountered

None.

## Self-Check: PASSED

- Both capability routes require owner admission and return non-cacheable protected JSON.
- The probe accepts no key, workspace, payload, capability ID, or effect request.
- Unauthorized HTML and API bodies reveal no owner or workspace evidence.
- The eight status cards, broader unavailable panel, and audit explanation render in the locked order.
- Every existing consequential fixture control remains natively disabled.
- Full local build, lint, test, and React diagnostics pass.

## Next Phase Readiness

Ready for `01-05`: deploy the exact tested source, run owner R2 proof, record hosted evidence, and complete the controlled second-principal checkpoint.

---
*Phase: 01-private-pilot-boundary*
*Completed: 2026-07-29*
