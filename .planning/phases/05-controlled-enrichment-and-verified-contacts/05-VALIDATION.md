---
phase: 05
slug: controlled-enrichment-and-verified-contacts
status: planning-ready
nyquist_compliant: true
created: 2026-07-30
---

# Phase 05 — Validation Strategy

## Test Infrastructure and Sampling

Use the existing Node built-in test runner with Miniflare D1 integration. Tests must inject a fake `ContactProviderPort`; they must never carry real credentials, provider calls, contact data, or paid requests.

- Focused domain/repository test after each task; `cd site && npm test` after each local code task.
- Wave gate: `cd site && npm test && npm run lint && npm run build`.
- No watch mode; focused checks should target under 30 seconds.
- Any request that would use a real provider, credential, spend, deployment, or live contact is a human-controlled release gate and remains blocked here.

## Verification Map

| Area | Threat / failure | Required proof |
|---|---|---|
| Admission/scope | client picks another workspace/prospect or unapproved Prospect | cross-principal/cross-workspace and every non-Approved lifecycle case returns blocked with provider fake call count `0` and no grant/reservation/contact mutation |
| Grant tuple | missing, expired, reused, altered provider/prospect/operation/units/cost/currency/expiry | exhaustive table-driven negatives: `0` provider calls; immutable audit records bounded blocked reason only |
| Quote/budget | stale/missing quote, unbounded cost, currency mismatch, concurrent cap race | transaction/race test proves actual + reserved never exceeds grant/profile/workspace cap; no call before committed reservation |
| Idempotency | browser retry, duplicate submit, distributed burst | unique operation key/grant consume race produces one reservation/call maximum; unknown outcome does not issue retry |
| Settlement | partial, provider error, timeout, uncertain charge | documented actual settles only billable units; unused releases; timeout/ambiguous acceptance remains reserved and requires reconciliation |
| Port containment | adapter bypass/legacy MCP reachability | fake port cannot be invoked except after reservation; static/route test proves `enrichment/mcp_server.py` has no production path |
| Verification class | generated/pattern/directory/domain/MX/provider-confidence promotion | each becomes suggestion/ineligible; only mailbox/source verified and fresh can reach ContactReady; numeric confidence cannot override class |
| Evidence/provenance | missing source/method/time/configuration, forged adapter output | defensive ingestion rejects or records ineligible evidence; immutable source/hash/time/method/class lineage is replayable |
| Freshness | stale point remains usable later | boundary projector tests at package, export, call, and send mark `NeedsReview` and block later eligibility without deleting history |
| Identity | automatic bad merge / lost associations or suppression | ambiguous identity only creates suggestion; owner merge/split transaction retains sources, scoped relevance, merge lineage, and every suppression subject |
| UI | safety state hidden or disabled control unexplained | render/accessibility tests assert Contact Suggestion wording, class/method/time/freshness, disabled reason, no later-phase action, keyboard-visible explanatory text |

## Required Test Fixtures

- One admitted owner workspace and one denied principal; synthetic Approved Prospect plus every non-approved lifecycle state.
- Current and drifted Profile Effective Configurations with a Contact Strategy; synthetic organization/contact/relevance/identity conflict graph.
- Fake quote/catalog variants and fake provider outcomes: verified, suggested, invalid, partial, rejection, timeout, ambiguous acceptance.
- Budget ledgers at exact cap and competing concurrent reservations; no real provider identifiers, API keys, emails, phone numbers, or organization data.

## Manual / Release Gates (Not Authorized by This Task)

| Gate | Pass signal | Fail-closed behavior |
|---|---|---|
| Fake-provider contract and zero-call negatives | independent test evidence accepted | no real adapter/provider enablement |
| Controlled test provider/account authorization | separate owner authorization with bounded scope/cost | no credential binding, call, or spend |
| Provider quote/catalog and reconciliation drill | documented bounded reservation/settlement/uncertainty outcomes | keep capability absent/disabled |
| Wave 3 adversarial review | no unresolved blocker/high finding | no live enrichment path |

## Sign-off Criteria

- All five roadmap success criteria have at least one positive and one zero-effect negative proof.
- Every provider-call denial assertion also checks zero provider call count and zero unauthorized durable mutation.
- The phase cannot be marked complete from UI/demo behavior alone: concurrency, uncertain-charge, freshness, identity, and downstream recheck proofs are mandatory.
