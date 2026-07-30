---
phase: 01-private-pilot-boundary
plan: "05"
subsystem: hosting
tags: [codex-sites, r2, csrf, hosted-proof, isolation]
requires:
  - phase: 01-private-pilot-boundary
    provides: Owner admission, capability projection, D1 audit evidence, and fixed R2 proof route
provides:
  - Exact-source private Sites version 10 deployment
  - Hosted R2 write/read/digest/delete/absence evidence durable after reload
  - Cookie-only one-time mutation token transport with clean fresh-client logs
  - Redacted hosted proof record and repeatable boundary harness
affects: [phase-2, hosted-validation, security, all-later-phases]
tech-stack:
  added: []
  patterns: [exact-source subtree deployment, redacted proof harness, HttpOnly one-time mutation cookie]
key-files:
  created:
    - .planning/phases/01-private-pilot-boundary/01-HOSTED-PROOF.md
    - .planning/phases/01-private-pilot-boundary/01-VERIFICATION.md
  modified:
    - site/scripts/hosted-boundary-proof.mjs
    - site/domain/csrf.ts
    - site/domain/capability-handler.ts
    - site/domain/interview-handler.ts
    - docs/WAVE-0-CAPABILITY-REPORT.md
key-decisions:
  - "Keep the site owner-only and defer the non-substitutable second-principal check rather than enabling an application invitation."
  - "Move one-time mutation tokens out of response JSON and custom headers into a short-lived secure HttpOnly cookie."
patterns-established:
  - "Hosted proof records only statuses, timestamps, opaque references, and deployment identifiers."
  - "Human-required evidence may be deferred for continued implementation but cannot authorize later external effects."
requirements-completed:
  - REQ-private-human-governed-gtm
  - REQ-company-workspace-isolation
duration: 1h 33m
completed: 2026-07-30
---

# Phase 1 Plan 5: Hosted Boundary Proof Summary

**Private Sites version 10 deployed from exact tested source with durable hosted R2 evidence and log-safe cookie mutation protection**

## Performance

- **Duration:** 1h 33m
- **Started:** 2026-07-30T14:30:00Z
- **Completed:** 2026-07-30T16:03:18Z
- **Tasks:** 2 automated tasks complete; 1 real-identity checkpoint deferred
- **Files modified:** 13

## Accomplishments

- Pushed the exact site subtree, saved Sites version 10, and deployed it privately with runtime configuration revision 2.
- Ran the fixed R2 write/read/digest/delete/absence proof and verified the accepted evidence remained Proven after reload.
- Found and removed one-time CSRF values from custom-header logs, then demonstrated a fresh version-10 request with a redacted Cookie and no deprecated header.
- Preserved all live data, scheduler, Runner, Gmail, import/export, outreach, calling, and paid-work gates as blocked or unproven.

## Task Commits

1. **Build and harden hosted proof harness** — `26f7331`
2. **Remove mutation tokens from worker-visible custom headers** — `e74ed96`
3. **Record exact version-10 hosted evidence** — `ae53d4e`

## Files Created/Modified

- `site/scripts/hosted-boundary-proof.mjs` — Redacted denial, mutation-negative, storage, replay, and durable reload harness.
- `site/domain/csrf.ts` — Short-lived secure HttpOnly cookie transport helpers.
- `site/domain/capability-handler.ts` — Cookie-issued and cookie-consumed fixed proof API.
- `site/domain/interview-handler.ts` — Cookie-issued and cookie-consumed interview mutations.
- `.planning/phases/01-private-pilot-boundary/01-HOSTED-PROOF.md` — Exact deployment and safe hosted outcomes.
- `docs/WAVE-0-CAPABILITY-REPORT.md` — Accepted boundary for version 10.

## Decisions Made

- Kept the deployment custom/owner-only with no groups and no application invitation.
- Deferred the real second-principal checkpoint under the user's instruction to continue all phases; the missing evidence remains visible in `01-VERIFICATION.md` and grants no later authority.

## Deviations from Plan

### Auto-fixed Issues

**1. Security: mutation token appeared in Sites request logs**

- **Found during:** Hosted log inspection after the first owner storage proof.
- **Issue:** Sites did not redact the application-specific CSRF request header.
- **Fix:** Moved the one-time value to a secure HttpOnly cookie, removed it from JSON/client state, updated the harness and tests, redeployed, and repeated the proof from a fresh tab.
- **Verification:** Lint, production build, 15/15 tests, React Doctor 100/100, hosted HTTP 200 proof, Cookie redacted, deprecated header absent.
- **Committed in:** `e74ed96`

**Total deviations:** 1 security correction. **Impact:** Stronger log hygiene without widening capability or authority.

## Issues Encountered

- A stale pre-version-10 browser tab sent the deprecated header once after deployment. Its value is not recorded. The accepted fresh-client proof contains no such header.
- The real second Sites principal and owner-session mutation-negative checks require operator authentication material that the automated verifier intentionally cannot extract.

## User Setup Required

Server-only owner configuration is complete. Human verification still requires a controlled second signed-in account; see `01-VERIFICATION.md`.

## Next Phase Readiness

- Phase 2 implementation may proceed against the owner-only D1/R2 boundary.
- Hosted cross-principal isolation remains `human_needed`; live operational data and external effects must remain disabled until it is proven.

---
*Phase: 01-private-pilot-boundary*
*Completed: 2026-07-30 with human validation deferred*
