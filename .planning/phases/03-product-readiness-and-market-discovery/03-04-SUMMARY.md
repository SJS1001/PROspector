---
phase: 03-product-readiness-and-market-discovery
plan: "04"
subsystem: domain
tags: [market-discovery, untrusted-input, proposal-lineage, cooldown]
requires:
  - phase: 03-product-readiness-and-market-discovery
    provides: additive discovery persistence
provides:
  - bounded untrusted discovery-submission seam
  - replayable discovery run and proposal authority
  - immutable Explore, Defer, and Dismiss decisions
affects: [03-05, 03-06, 03-07]
key-files:
  created:
    - site/domain/discovery-submission.ts
    - site/domain/market-discovery.ts
  modified: [site/tests/market-discovery-repository.test.mjs]
requirements-completed: [REQ-market-discovery]
completed: 2026-07-30
---

# Phase 3 Plan 04: Bounded Market Discovery Summary

**Product discovery now freezes configuration and window authority, accepts only bounded observations, caps proposals at three, and preserves immutable owner decisions and cooldown history.**

## Accomplishments

- Added reject-only normalization for untrusted findings with no provider, retrieval, or runner capability.
- Added initial/monthly/manual/material-change run replay, successful-only watermark advancement, deterministic ranking, evidence attachment, and collision/split/merge lineage.
- Added exact-revision Explore/Defer/Dismiss decisions, Draft-only Explore, cooldowns, material reopen, and race convergence.

## Task Commits

1. Implement bounded Market Discovery — `7f1b7f6`
2. Harden stale decision and discovery races — `f6d59ae`
3. Bind run, proposal, watermark, and proof races — `04a4a6a`

## Verification

- Current Market Discovery repository suite — PASS, 12/12 inside `npm run test:phase3`.
- Current focused Phase 3 command — PASS, 29/29 after build.

## Deviations from Plan

- Two follow-up hardening commits were required after the initial implementation to make losing/stale operations leave no proposal, evidence, lineage, decision, or watermark authority.

## Self-Check: PASSED

- Proposal cap, cooldown, collision lineage, replay, and zero-effect assertions are green.
- No Profile readiness or later operational authority is created.
