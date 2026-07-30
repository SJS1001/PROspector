---
phase: 02
slug: consensus-knowledge-and-commercial-model
status: approved
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-30
---

# Phase 02 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js built-in test runner with Miniflare D1 integration |
| **Config file** | none — tests are `site/tests/*.test.mjs` and construct Vite/Miniflare directly |
| **Quick run command** | `cd site && npm test` |
| **Full suite command** | `cd site && npm test && npm run lint` |
| **Estimated runtime** | under 30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd site && npm test`
- **After every plan wave:** Run `cd site && npm test && npm run lint`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

Every consequential Phase 2 mutation test must pair its positive authority assertion with a zero-delta assertion for the forbidden operational tables: Runs, Accounts, Signals, Contacts, Candidates, Prospects, schedules, approvals, exports, and messages.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 01 | 0 | All three | T-02-01 | Full migration chain and reusable forbidden-table counts preserve legacy authority | D1 migration integration | `cd site && npm test` | ❌ W0 | ⬜ pending |
| 02-01-02 | 01 | 1 | REQ-commercial-hierarchy | T-02-02 | Exact Company→Product→Market Play→Customer Profile→Offer parentage and workspace scoping are database-enforced | D1 integration | `cd site && npm test` | ❌ W0 | ⬜ pending |
| 02-01-03 | 01 | 1 | REQ-commercial-hierarchy | T-02-03 | Client-supplied workspace or scope identifiers grant no authority and denials remain neutral | handler integration | `cd site && npm test` | ❌ W0 | ⬜ pending |
| 02-02-01 | 02 | 1 | REQ-versioned-knowledge-and-drift | T-02-04 | Every intake creates a Proposed record with immutable provenance, privacy, license, and destination | D1 integration | `cd site && npm test` | ❌ W0 | ⬜ pending |
| 02-02-02 | 02 | 1 | REQ-consensus-interview | T-02-05 | Evidence, inference, recommendation, prerequisites, and exact decision snapshot remain distinct | D1 integration | `cd site && npm test` | ⚠ extend | ⬜ pending |
| 02-02-03 | 02 | 1 | REQ-consensus-interview | T-02-06 | Accept, Reject, Correct, and Rescope validate their reason/destination contracts; only allowed actions append Knowledge Versions | D1 integration | `cd site && npm test` | ❌ W0 | ⬜ pending |
| 02-02-04 | 02 | 1 | REQ-consensus-interview | T-02-07 | Retry, response loss, two-tab races, stale revisions, supersession, and one-active-question invariants are deterministic | concurrency integration | `cd site && npm test` | ⚠ extend | ⬜ pending |
| 02-02-05 | 02 | 1 | REQ-consensus-interview | T-02-08 | Origin, intent, content type, body limit, CSRF, replay, and cross-owner checks protect every new command | handler security | `cd site && npm test` | ⚠ extend | ⬜ pending |
| 02-03-01 | 03 | 2 | REQ-versioned-knowledge-and-drift | T-02-09 | Confirmed values are immutable and predecessor/successor plus decision lineage are preserved | D1 integration | `cd site && npm test` | ❌ W0 | ⬜ pending |
| 02-03-02 | 03 | 2 | REQ-versioned-knowledge-and-drift | T-02-10 | Risk uses the allowlist and impact reaches only dependency-linked artifacts | unit + D1 integration | `cd site && npm test` | ❌ W0 | ⬜ pending |
| 02-03-03 | 03 | 2 | REQ-versioned-knowledge-and-drift | T-02-11 | Preview digest, inactive candidate, separate activation, idempotency, stale/race rejection, and preserved prior config are enforced | D1 concurrency | `cd site && npm test` | ❌ W0 | ⬜ pending |
| 02-04-01 | 04 | 3 | REQ-commercial-hierarchy | T-02-12 | Commercial Model tree, scope path, semantic states, and disabled later-phase controls match the approved UI contract | rendered/source regression | `cd site && npm test` | ❌ W0 | ⬜ pending |
| 02-04-02 | 04 | 3 | All three | T-02-13 | Every Phase 2 command leaves all forbidden operational tables unchanged | boundary integration | `cd site && npm test` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `site/tests/helpers/d1.mjs` — full migration application, table-count snapshots, and race helpers.
- [ ] `site/tests/commercial-model-repository.test.mjs` — hierarchy, foreign keys, seed, identity/scoping, and revisions.
- [ ] `site/tests/knowledge-repository.test.mjs` — proposal, provenance, decision, version, reuse, and boundary behavior.
- [ ] `site/tests/drift-replacement.test.mjs` — dependency reach, risk, preview, activation, races, and zero operational effects.
- [ ] `site/tests/knowledge-handler.test.mjs` — owner admission, request validation, CSRF, neutral denial, and exact conflicts.
- [ ] `site/tests/knowledge-ui.test.mjs` — four views, semantic states/copy, native-disabled later controls, and responsive source assertions.
- [ ] A shared forbidden-table zero-delta helper used by every Phase 2 mutation test.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Hosted legacy preflight before enabling Phase 2 writes | All three | The local suite cannot inspect the existing private hosted D1 control plane | On the existing Sites project, inspect migration version plus row counts/digests without exposing values; confirm migrations 0000–0003 are present and record only opaque proof references. Keep writes disabled if counts or digests differ from the approved baseline. |
| Real second-principal denial | REQ-commercial-hierarchy | Local synthetic identities cannot prove the Sites trusted-edge principal boundary | From a separately authenticated invited account, attempt the owner route and each Phase 2 mutation; verify neutral denial and zero database changes. Do not grant later operational authority. |
| Untrusted upload activation gate | REQ-versioned-knowledge-and-drift | Malware scanning/quarantine requires an external scanning service not authorized in Phase 2 | Keep runtime file upload disabled. Before any later enablement, upload a benign file and an EICAR test sample into quarantine; verify only the benign file can be released after scan and that neither can enter Confirmed Knowledge directly. |

These manual gates may remain deferred while autonomous build work continues. Their absence cannot be used to enable hosted Phase 2 writes, untrusted uploads, discovery, prospecting, enrichment, exports, paid work, or outbound effects.

---

## Validation Sign-Off

- [x] All anticipated tasks have an automated command or Wave 0 dependency
- [x] Sampling continuity: no three consecutive tasks lack automated verification
- [x] Wave 0 covers every currently missing test reference
- [x] No watch-mode flags
- [x] Feedback latency target is under 30 seconds
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-07-30; Wave 0 execution pending
