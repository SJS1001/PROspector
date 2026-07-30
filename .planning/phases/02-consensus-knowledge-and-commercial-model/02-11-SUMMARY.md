---
phase: 02-consensus-knowledge-and-commercial-model
plan: "11"
subsystem: release-security
tags: [d1, wrangler, preflight, activation-gate, evidence-ledger]
requires:
  - phase: 02-consensus-knowledge-and-commercial-model
    provides: additive 0004 schema, absent activation gate, and owner-gated Knowledge boundary
provides:
  - fixed, redacted old-schema and post-migration D1 preflight command construction
  - exact eight-field consensus_knowledge gate inspection and deferred activation contract
  - blocked, non-authorizing hosted-release evidence ledger
affects: [02-12, 02-14, 02-18, 02-19, hosted-release]
tech-stack:
  added: []
  patterns: [fixed Wrangler argument arrays, canonical tuple digest, fail-closed release evidence]
key-files:
  created:
    - site/scripts/phase2-hosted-preflight.mjs
    - site/scripts/phase2-gate.mjs
    - .planning/phases/02-consensus-knowledge-and-commercial-model/02-ACTIVATION.md
  modified: []
key-decisions:
  - "Preflight accepts only the fixed modes and conservative database names; it retains raw child output and fails closed pending a reviewed hosted result adapter."
  - "The gate accepts the canonical eight fields in order, hashes exactly that serialization, and reserves activate for Plan 19."
  - "The evidence ledger starts blocked and documents cannot grant activation authority."
patterns-established:
  - "Release CLIs must use fixed argument arrays, no caller SQL, and redacted status-only output."
  - "The sole possible Phase 2 intake scope is bounded UTF-8 import_plain_text to Proposed Knowledge; uploads and later effects remain excluded."
requirements-completed: [REQ-commercial-hierarchy, REQ-consensus-interview, REQ-versioned-knowledge-and-drift]
duration: 20min
completed: 2026-07-30
---

# Phase 02 Plan 11: Hosted preflight and consensus gate Summary

**Fixed D1 release tooling now keeps hosted migration evidence read-only, confines the future gate to a canonical authorization tuple, and records every release stage as blocked.**

## Accomplishments

- Added fixed old-schema, post-migration, and gate-inspection command construction with conservative database validation, read-only SQL allowlisting, and redaction tests.
- Added a fixed `consensus_knowledge` gate interface with eight canonical fields, deterministic SHA-256 tuple digests, inspection classification, and a single immutable insert path reserved for Plan 19.
- Initialized a status-only release ledger preserving the private project, secret, upload, and later-capability boundaries.

## Task Commits

1. **Task 1: Implement fixed read-only hosted evidence queries** — `3c3139f` (feat)
2. **Task 2: Implement the separately authorized narrow gate writer** — `2668935` (feat)
3. **Task 3: Initialize the non-authorizing release ledger** — `2295d7b` (docs)

## Verification

- `cd site && node --test tests/phase2-hosted-preflight.test.mjs` — PASS (2/2).
- `cd site && node --test tests/phase2-gate.test.mjs` — PASS (2/2).
- Both CLI `--help` commands — PASS.
- `cd site && npm test` — PASS (37/37).
- `cd site && npm run lint` — PASS.
- `cd site && npm run build` — PASS.
- `git diff --check` — PASS.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- This isolated worktree did not contain `site/node_modules`; `npm ci` restored lockfile-pinned dependencies without changing project files.

## User Setup Required

None. No hosted command, migration, deployment, or gate activation ran.

## Next Phase Readiness

- Plan 12 can invoke the read-only preflight only after its human gate; Plans 18–19 retain the separate authorization and activation sequence.
- The Phase 1 real-principal prerequisite and all ledger stages remain blocked.

## Self-Check: PASSED

*Phase: 02-consensus-knowledge-and-commercial-model*
*Completed: 2026-07-30*
