---
phase: 1
slug: private-pilot-boundary
status: approved
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-29
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node test runner, Vite SSR module loading, and Miniflare 4 |
| **Config file** | `site/package.json`; no separate runner config |
| **Quick run command** | `cd site && node --test tests/pilot-access.test.mjs tests/capability-state.test.mjs tests/object-storage.test.mjs tests/capabilities-route.test.mjs` |
| **Full suite command** | `cd site && npm run lint && npm test` |
| **Estimated runtime** | Quick: <30 seconds; full: <120 seconds |

---

## Sampling Rate

- **After every task commit:** Run the targeted test file named by the task and the quick command once all Wave 0 files exist.
- **After every plan wave:** Run `cd site && npm run lint && npm test`.
- **Before `/gsd:verify-work`:** Full suite must be green and both hosted manual checks must be recorded.
- **Max feedback latency:** 30 seconds for task-level automated checks.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 01-W0-01 | TBD | 0 | REQ-company-workspace-isolation | T-01 spoofed/second principal | Non-owner receives neutral denial and cannot read or bootstrap | integration | `cd site && node --test tests/pilot-access.test.mjs` | ❌ W0 | ⬜ pending |
| 01-W0-02 | TBD | 0 | REQ-private-human-governed-gtm | T-02 forged proof state | Only evidence records produce `proven`; bindings alone remain `unproven` | unit | `cd site && node --test tests/capability-state.test.mjs` | ❌ W0 | ⬜ pending |
| 01-W0-03 | TBD | 0 | REQ-company-workspace-isolation | T-03 cross-prefix object access | R2 keys are server-derived and cross-workspace access is impossible | unit/integration | `cd site && node --test tests/object-storage.test.mjs` | ❌ W0 | ⬜ pending |
| 01-W0-04 | TBD | 0 | Both | T-04 capability leak | Capability route is no-store, owner-only, and exposes no email or workspace detail to denials | route | `cd site && node --test tests/capabilities-route.test.mjs` | ❌ W0 | ⬜ pending |
| 01-REG-01 | TBD | any | REQ-private-human-governed-gtm | T-05 mutation bypass | Origin, Fetch Metadata, intent, CSRF, type, and body bounds fail closed | integration | `cd site && node --test tests/request-security.test.mjs tests/interview-handler.test.mjs` | ✅ | ⬜ pending |
| 01-REG-02 | TBD | any | REQ-private-human-governed-gtm | T-06 adjacent-state authority | Answer remains separate from Confirmation and no later effect control is enabled | integration/render | `cd site && node --test tests/interview-repository.test.mjs tests/fixture-safety.test.mjs` | ✅ | ⬜ pending |
| 01-REG-03 | TBD | final | Both | T-07 UI overclaims capability | Pilot Status renders Proven/Blocked/Unproven and disabled broader workflows | render | `cd site && node --test tests/rendered-html.test.mjs tests/fixture-safety.test.mjs` | ✅ extend | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `site/tests/pilot-access.test.mjs` — single-owner admission, neutral denial, and no second workspace bootstrap.
- [ ] `site/tests/capability-state.test.mjs` — evidence projection and binding-presence negative case.
- [ ] `site/tests/object-storage.test.mjs` — provider-neutral port, workspace prefix, digest/delete/absence lifecycle.
- [ ] `site/tests/capabilities-route.test.mjs` — authenticated/unauthorized route response and data minimization.
- [ ] Update existing handler/repository tests that currently expect an outsider to bootstrap a second workspace.

No new test framework or package is required.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| R2 write/read/digest/delete/absence persists through the hosted adapter and records a proof/audit ID | Both | Local mocks cannot establish hosted binding durability | Sign in as the owner; run the fixed controlled probe once; confirm `proven`, evidence timestamp/reference, exact digest match, deletion, and subsequent absence; inspect worker logs without exposing payload or secret. |
| A controlled second real principal receives the neutral private-workspace denial and cannot read route, row, object, or capability evidence | REQ-company-workspace-isolation | Requires a second identity asserted by the actual hosting boundary | Access the private site as the controlled second principal; request the app, interview API, capability API, and probe mutation; confirm denial bodies contain no company/workspace/audit/capability identifiers and no new workspace/object/audit row is created. |
| Deployment secrets exist without appearing in Git, client bundles, responses, or logs | Both | Secret-store existence and hosted bundle/log behavior are control-plane properties | Inspect binding names/status only, search repository/build output for secret values using a locally supplied value without printing it, exercise an error path, and confirm logs/responses contain no value. |

---

## Validation Sign-Off

- [x] All anticipated implementation tasks have an automated test family or an explicit Wave 0 dependency.
- [x] Sampling continuity: every task can run a targeted automated command.
- [x] Wave 0 lists every missing test reference.
- [x] No watch-mode flags.
- [x] Automated feedback target is under 30 seconds.
- [x] `nyquist_compliant: true` set in frontmatter.

**Approval:** approved 2026-07-29; `wave_0_complete` remains false until the missing tests are created and green.
