---
phase: 02-consensus-knowledge-and-commercial-model
plan: "12"
subsystem: hosted-release-prerequisite
tags: [sites, d1, principal-isolation, read-only-baseline]
requires:
  - phase: 02-consensus-knowledge-and-commercial-model
    provides: fixed read-only preflight tooling and blocked release ledger
provides:
  - accepted real-principal isolation and zero-delta prerequisite
  - accepted redacted read-only hosted-D1 old-schema baseline
affects: [02-13, hosted-release]
key-files:
  created:
    - .planning/phases/02-consensus-knowledge-and-commercial-model/02-12-SUMMARY.md
  modified:
    - .planning/phases/02-consensus-knowledge-and-commercial-model/02-ACTIVATION.md
key-decisions:
  - "The owner accepted the complete redacted external evidence set; raw hosted control-plane material stays outside Git."
  - "Acceptance permits only the ordered compatibility deployment in Plan 02-13; all later migration and activation gates remain separate."
requirements-completed: [REQ-commercial-hierarchy, REQ-consensus-interview, REQ-versioned-knowledge-and-drift]
completed: 2026-08-01
---

# Phase 02 Plan 12: Hosted prerequisite acceptance Summary

**The owner accepted the complete redacted real-principal and old-schema evidence set required before the Phase 2 compatibility deployment.**

## Accepted evidence

- A separately signed-in principal was denied at the private app boundary and the required protected APIs.
- The owner confirmed zero D1, R2, and audit delta from that controlled check.
- A read-only hosted-D1 baseline was accepted for the exact 0000–0003 schema, foreign-key health, protected historian digest/count baseline, forbidden-table counts, and absent `consensus_knowledge` gate.

The underlying control-plane results, identifiers, counts, and digests are deliberately excluded from Git and this summary.

## Boundaries retained

No deployment, migration, access-policy change, secret operation, upload, gate activation, discovery, prospecting, contact, schedule, export, spend, Gmail, calling, messaging, or outbound effect occurred in this plan.

## Verification

- `cd site && npm test` — PASS with required Miniflare loopback permission.
- `cd site && npm run lint` — PASS.
- `cd site && node --test tests/phase2-hosted-preflight.test.mjs` — PASS.

## Next phase readiness

Plan 02-13 may deploy only the exact, backward-compatible, fail-closed source to the existing private Sites project while the hosted schema remains 0003.
