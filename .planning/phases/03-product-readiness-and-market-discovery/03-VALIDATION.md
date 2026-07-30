---
phase: 03
slug: product-readiness-and-market-discovery
status: proposed
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-30
---

# Phase 03 — Validation Strategy

> Executable validation map for Product readiness and bounded Market Play discovery. The phase may prove persistence, replay, UI, and zero-effect behavior locally. It must not activate hosted scheduling, a Runner/provider, web retrieval, prospecting, contacts, or outreach without a separate accepted capability gate. [VERIFIED: `docs/WAVE-0-CAPABILITY-REPORT.md`; ADR-0003]

## Test Infrastructure

| Property | Value |
|---|---|
| Framework | Node.js built-in test runner with Miniflare D1 integration. [VERIFIED: `site/package.json`; `site/tests/helpers/d1.mjs`] |
| Config | none — tests construct Vite/Miniflare fixtures directly. [VERIFIED: `site/tests/helpers/d1.mjs`] |
| Focused command | `cd site && node --test tests/<phase3-file>.test.mjs` |
| Full local gate | `cd site && npm test && npm run lint && npm run build`. [VERIFIED: `site/package.json`] |
| Local feedback target | focused samples under 30 seconds; hosted capability gates are deliberately manual and excluded. [ASSUMED] |

Every successful authority test must pair its intended durable-row assertions with a forbidden-effect zero-delta assertion. For this phase, the forbidden manifest includes Profile readiness, prospecting runs/schedules, Accounts, Targets, Signals, Candidates, Prospects, Contacts, paid-provider grants/calls, Gmail/calling, exports, and outreach approvals/messages. [VERIFIED: `.planning/ROADMAP.md`; Phase 3 boundary]

## Sampling Rate

- While intentionally RED future Phase 3 suites still exist, a completed local wave may pass on its named passing pre-existing baseline subset plus `npm run build && npm run lint`; this is the only permitted sampling exception, and `npm test` is intentionally not required until the wave's relevant Phase 3 suites are green. [VERIFIED: `site/package.json`]
- After an implementation task turns its relevant Phase 3 suite green: run its focused test and then `cd site && npm test`; once the relevant suites are green, a full `npm test` is required and the sampling exception no longer applies to that wave. [VERIFIED: `site/package.json`]
- After every local wave whose relevant Phase 3 suites are green: run `cd site && npm test && npm run lint`. [VERIFIED: `site/package.json`]
- Before any source deployment: run `cd site && npm test && npm run lint && npm run build`. [VERIFIED: `site/package.json`]
- Before `/gsd:verify-work`: full local suite is green and every capability gate below is accepted; `human_needed`, `unproven`, or `blocked` is incomplete, never a pass. [VERIFIED: `docs/WAVE-0-CAPABILITY-REPORT.md`]

## Per-Task Verification Map

Task identifiers intentionally describe planner-sized outcomes; the planner assigns final plan/wave numbers without weakening these checks. [ASSUMED]

| Task ID | Requirement | Threat | Secure behavior | Test / gate | Automated command | Status |
|---|---|---|---|---|---|---|
| 03-01 | both | T-03-01 | RED contracts cover migration, readiness atomicity, replacement activation/material-change lineage, bounded discovery, immutable owner proof authorization/consumption, UI navigation/picker, and zero effects. | RED suites | `cd site && ! node --test tests/product-readiness-repository.test.mjs && ! node --test tests/market-discovery-repository.test.mjs && ! node --test tests/discovery-handler-ui.test.mjs && node --test tests/request-security.test.mjs tests/pilot-access.test.mjs && npm run build` | pending |
| 03-02 | both | T-03-03 | Additive schema/helper implementation applies the full chain and supports immutable replacement/material-change lineage, private-proof authorization/consumption, and forbidden-effect snapshots. | D1 migration | `cd site && node --test tests/product-readiness-repository.test.mjs --test-name-pattern="migration|schema|forbidden" && node --test tests/request-security.test.mjs tests/pilot-access.test.mjs && npm run build && npm run lint` | pending |
| 03-03 | REQ-product-readiness | T-03-05 | Readiness/Ready command uses confirmed versions only and atomically/replay-safely creates configuration/run/schedule/audit; confirmed Phase 2 replacement activation creates one material trigger. | D1 concurrency | `cd site && node --test tests/product-readiness-repository.test.mjs && npm test` | pending |
| 03-04 | REQ-market-discovery | T-03-08 | Local fixed synthetic submissions validate gate/provenance/audit/idempotency, cap every trigger, retain pinned lineage, dedup races, and persist immutable proposals. | D1 concurrency | `cd site && node --test tests/market-discovery-repository.test.mjs --test-name-pattern="submission|synthetic|cap|fingerprint|race|replay|trigger" && npm test` | pending |
| 03-05 | both | T-03-11 | Owner handler/read route protects mutations; private synthetic proof is gate-bound and records no provider/network attempt. | handler integration | `cd site && node --test tests/discovery-handler-ui.test.mjs --test-name-pattern="handler|owner|origin|CSRF|neutral|synthetic" && npm test` | pending |
| 03-06 | both | T-03-14 | UI uses typed read models; third primary Market Discovery navigation, last-selected Product picker, Knowledge/Pilot access, and blocked/unknown states are explicit. | render/security | `cd site && node --test tests/discovery-handler-ui.test.mjs --test-name-pattern="readiness|proposal|navigation|picker|unknown|synthetic" && npm test` | pending |
| 03-07 | both | T-03-17 | Full local authority, race, synthetic-proof, UI, and zero-effect regression suite is green. | local wave gate | `cd site && npm run test:phase3 && npm test && npm run lint` | pending |
| 03-08 | both | T-03-18 | Offline preflight recognizes only the owner-authorized private synthetic proof and defaults all transport capability BLOCKED. | preflight unit | `cd site && node --test tests/phase3-release-preflight.test.mjs && npm test && npm run lint` | pending |

## Capability / Hosted Gates

| Gate | Pass signal | Required evidence | Failure behavior |
|---|---|---|---|
| Local no-effect gate | Full Phase 3 test suite proves readiness/proposal lifecycle while forbidden external/Phase 4-7 state remains unchanged. [ASSUMED] | committed local test output and reviewed source. [ASSUMED] | Stop implementation progression; do not activate a scheduler or Runner. |
| Private synthetic hosted proof | An immutable server-derived owner authorization binds workspace owner, Product ID, expected revision, exact source revision, migration/fixture digest, expiry, and opaque evidence reference; a separate immutable consumption permits one submission and only same-operation replay. The exact deployment accepts only that fixed non-network fixture, records provenance/audit/configuration/run/proposal identity, and proves zero external/downstream effects. | confirmed Consensus Interview decision; controlled server activation record; green local suite; deployed identity; sanitized authorization/consumption/audit and negative-effect references. | `human_needed` pauses; absent/expired/cross-Product/digest-mismatched/reused proof fails closed and no fixture proof means Phase 3 owner-lifecycle acceptance is incomplete. |
| Hosted scheduler capability | An exact reviewed deployment demonstrates idempotent scheduled dispatch, duplicate/overlap/misfire/DST handling, capability recheck, and clean logs with no unapproved provider action. [VERIFIED: `docs/IMPLEMENTATION-SPEC.md` §7; `docs/WAVE-0-CAPABILITY-REPORT.md`] | separate owner authorization plus hosted proof reference. [VERIFIED: ADR-0003; capability report] | BLOCKED outside Phase 3; schedules remain durable intent only. |
| Runner/retrieval capability | An exact reviewed implementation proves assignment-bound/revocable/quota-limited runner ingress and the full safe retrieval boundary before public evidence collection. [VERIFIED: ADR-0003; `docs/IMPLEMENTATION-SPEC.md` §8] | separate owner authorization, provider/runner proof, and security review. [VERIFIED: ADR-0003; capability report] | No provider credentials, crawling, model call, or external discovery activation. |
| Final owner lifecycle | Owner proves Product readiness, blocked execution, bounded fixture-backed proposal review, cooldown, and Draft-only Explore in the deployed private workspace. | exact source/deployment identity plus private synthetic-proof evidence above. | `human_needed` pauses; phase remains incomplete. |

## Wave 0 Requirements

- [ ] Extend D1 fixtures to apply the exact 0000-0005 migration sequence and snapshot all forbidden Phase 3 operational effects. [ASSUMED]
- [ ] Create RED contracts for readiness atomicity, manifest replay, replacement/material-change behavior, all trigger types, cap/fingerprint races, cooldown/reopen, and decision zero deltas. [VERIFIED: `docs/IMPLEMENTATION-SPEC.md` §§5,7,12]
- [ ] Create handler contracts that prove absent/unproven capability produces no provider/network attempt and that untrusted input cannot select Product scope, configuration, cap, or terminal status. [VERIFIED: ADR-0003; `docs/WAVE-0-CAPABILITY-REPORT.md`]
- [ ] Create render contracts that distinguish accepted hierarchy from discovery suggestions and never make a Proposal look like a Customer Profile or active prospecting. [VERIFIED: `CONTEXT.md`; `.planning/ROADMAP.md`]

## Validation Sign-Off

- [ ] All successful Product readiness paths assert configuration/run/schedule/audit atomicity and full forbidden-effect zero delta.
- [ ] All trigger paths share one cap/fingerprint/cooldown contract and include replay/concurrency tests.
- [ ] Discoveries are clearly typed as proposals, with evidence and owner decisions distinct from accepted customer profiles.
- [ ] Owner-authorized private synthetic hosted proof is recorded with immutable server-derived authorization/consumption, fixture provenance, audit/idempotency, and zero-effect evidence; tests reject absent, expired, cross-Product, digest-mismatched, and replay-abuse records.
- [ ] Scheduler/Runner/retrieval remains a separately authorized, BLOCKED future capability and never counts as Phase 3 transport validation.

**Approval:** proposed; requires Phase 3 plan task mapping and explicit capability-gate decisions before execution.
