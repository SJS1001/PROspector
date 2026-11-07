# Phase 6–7 isolated local preparation maintenance — 2026-11-07

## Scope and coordination

- Base: `96981f44f9a94a83cdd9f5582c3107c6ca0eff0d` (`origin/main`).
- Worktree: `/workspace/PROspector-phase67`.
- Branch: `test/phase67-parallel-prep-20261107`.
- Exclusive changes: pure Phase 7 handoff-eligibility preparation module, its
  focused test, and this evidence record. No UI, Phase 5, runtime composition,
  schema, migration, dependency, shared planning-ledger, or other lane changes.
- Existing PRs #120, #121, #123 concern other contracts; this does not duplicate
  their CSV artifact, outreach command, or manual-call service work.

## Confirmed correctness gap and repair

An unchanged synthetic eligibility snapshot remained classified as current
when the evaluation clock advanced to or beyond an included contact point's
verification expiry or its Prospect's Package approval expiry. Existing tests
checked expiry during construction but not delayed re-evaluation of the same
immutable digest. A new regression reproduced this defect (12 passed / 1
failed before the repair, at the exact verification-expiry boundary).

Evaluation now independently checks included rows against the current clock
and names `handoff_verification_expired` and
`handoff_package_approval_expired`. One expired included row rejects the whole
frozen projection rather than silently rewriting it. Excluded generated,
MX-only, or Company-suppressed material remains excluded and cannot poison an
unrelated eligible row merely by aging. Snapshot digests and historical counts
remain immutable; no projection or decision acquires effect authority.

## Verification

On Node.js `v24.22.1`:

- `cd site && node --test tests/phase7-preparation-*.test.mjs tests/outreach-preparation-boundary.test.mjs`: **108/108 passed**.
- Targeted ESLint for the changed module and test: **passed**.
- Full canonical test/build: **not run / pending coordination** so this lane
  does not compete with PR #145's full validation. No full-green claim.
- Existing ignored dependency installation is reused via an ignored
  worktree-local `node_modules` symlink; no install, package, or lockfile change.

## Gates and next boundary

This repairs an existing pure synthetic contract; it does not extend the
already-complete bounded preparation line or execute any Phase 6/7 plan.
Phase 6 predecessor acceptance remains blocked at 06-11; Phase 7 depends on
06-10, and archive capability selection remains blocked at 07-07. No phase
summary or formal credit is created. Approval immutability, paid-enrichment
scope, Company suppression, generated/MX-only exclusion, and human governance
are unchanged. No provider, credential, real data, hosted operation, durable
mutation, schedule, export bytes, outbound effect, or merge occurred.
