---
phase: 04
status: prepared-dependency-blocked
created: 2026-07-30
---

# Phase 4 — Validation Strategy

## Test architecture

Use the existing Node built-in test runner, Vite module loading, Miniflare D1 helper, and `cd site && npm test && npm run lint && npm run build` full gate. Add no test framework or live provider requirement. Every authority-positive test must also assert forbidden-table zero deltas for downstream contacts, grants/spend, packages, messages, sends, exports, and workspace archive state.

## Requirement map

| Requirement | Secure behavior | Tests/gates |
|---|---|---|
| REQ-profile-readiness | all items required; candidate/activation separate; immutable config; exactly one initial run and schedule; race/retry safe | D1 readiness repository + handler + UI tests; concurrent activation/retry tests; blocked predecessor tests |
| REQ-deterministic-qualification | pure five-dimension rubric, threshold/gates/hard disqualifiers/outcome/re-entry order are reproducible | table-driven pure evaluator tests; D1 assessment/prospect-state tests; fixture replay determinism |
| REQ-evidence-provenance | trusted tiering, full provenance, 24-hour overlap, 30-day context rule, independence/repost containment | source-policy/retrieval validation tests; date/watermark/DST tests; evidence UI tests |
| REQ-untrusted-runner-boundary | assignment-bound short-lived revocable quotas; append-only schema-checked submission; complete ledger; no stored credential/failover | runner token/handler integration tests; fuzzed unknown-field tests; source scans; controlled hosted callback proof |

## Required test cases

1. Profile cannot become candidate/active when any readiness category, active parent authority, Offer, source policy, runner policy, timezone, or rubric field is absent/stale/wrong-scoped.
2. Candidate creation and activation use separate exact digests; stale/concurrent/same-key retries yield at most one active configuration, one initial run, and one schedule slot.
3. A replacement candidate does not change the current configuration; only activation rolls future work and preserves historical assessment references.
4. Browser mutations reject missing/conflicting identity, Origin, Fetch Metadata, CSRF, content type, bounded body, client workspace/configuration/runner authority, and stale revisions.
5. Scheduled Profile runs have separate owner/slot keys from Product runs; DST fall-back does not duplicate a slot; overlapping scheduled work is `SkippedOverlap`; manual work is separately idempotent; watermark moves only after success; the source window overlaps 24 hours.
6. Assignment token failures cover wrong audience/run/profile/configuration, expired/revoked/replayed nonce, quota/size overrun, unknown field, terminal-state leap, token disclosure, and a provider/model retry without explicit owner assignment.
7. A valid runner submission records required provenance but cannot set tier, outcome, qualification, review, active configuration, budget, credential, or downstream state.
8. Retrieval rejects unsafe URL/address/redirect/mime/bytes/decompression cases and source text is escaped in rendered HTML. Tier 1/2/3, underlying origin, syndication, subsidiary-release, and independent-publisher fixtures produce deterministic grouping.
9. Qualification fixtures cover every 0/1/2 anchor, exactly 7 pass, 6 fail, pain/timing zero gate, Tier 3-only fail, same-independence-group failure, missing evidence insufficiency, every hard disqualifier, tie ordering, and fixed configuration replay.
10. Review tests require owner reason/date as applicable; enforce Reject’s 90-day cooldown, Defer review date, Material Signal re-entry, disqualification proof-to-reopen, idempotent decision, and zero downstream effects.
11. Render tests prove scope/configuration/evidence/outcome text, disabled/absent later-phase controls, native disabled state, 44px interaction targets, text-plus-color statuses, focus visibility, responsive evidence cards, and explicit unknown/stale/unauthorized states.

## Manual/hosted gates

| Gate | Pass evidence | Failure behavior |
|---|---|---|
| Phase 3 prerequisite review | exact active Product/Play/Offer/policy/scheduler outputs meet `04-CONTEXT.md` matrix | no Phase 4 planning or implementation |
| Runner callback/connection proof | pre-authorized non-production runner assignment shows expiry/revocation/quota enforcement and complete redacted ledger | runner capability stays blocked; no schedule activation |
| Scheduler proof | controlled Profile schedule records timezone/DST slot, successful watermark, and 24-hour overlap without external effects | schedule remains blocked |
| Independent exact-source review | zero blocker/high findings across schema, runner boundary, retrieval, qualification, and forbidden effects | no deploy/activation |
| Owner lifecycle UAT | owner completes readiness, inspects a submitted evidence chain, reproduces a qualification, and performs each review decision without a downstream effect | phase incomplete |

`human_needed`, an unverified provider binding, test fixture success, or a UI state alone never satisfy a hosted gate.

## Sampling

- Per implementation task: focused Node test file(s), then `cd site && npm test`.
- Per wave: `cd site && npm test && npm run lint`.
- Before any source deployment: `cd site && npm test && npm run lint && npm run build`.
- Before phase verification: all automated tests green plus every manual gate approved with redacted evidence references.

## Planning blocker

This validation map is intentionally not decomposed into plan task IDs. That decomposition must wait for Phase 3’s actual schema/port/schedule authority and Phase 4’s resulting plan topology.
