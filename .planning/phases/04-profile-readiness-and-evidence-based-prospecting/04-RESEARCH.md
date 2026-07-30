---
phase: 04
slug: profile-readiness-and-evidence-based-prospecting
status: prepared-dependency-blocked
researched: 2026-07-30
confidence: high-for-contract-medium-for-integration
---

# Phase 4 — Technical Research

## Summary

Phase 4 should be built as a trusted application pipeline around untrusted submissions:

```text
Active Product/Play/Offer + confirmed Profile inputs
  -> immutable Profile Effective Configuration (owner activation)
  -> schedule/manual trigger -> trusted Run + bounded Assignment
  -> runner append-only sourced submission
  -> retrieval/provenance validation -> Signal/Candidate projection
  -> pure deterministic qualification -> immutable Assessment
  -> Qualified Prospect -> owner review decision
```

The database, trusted handler, and UI own every arrow except the runner submission. A Runner can never activate a profile, select a different configuration, set a source tier, calculate the authority result, set a terminal run state, or approve a prospect. This preserves ADR-0003 and the implementation contract while keeping adapters replaceable.

## Preconditions and current blocker

The Phase 3 directory does not exist. Phase 4 research is therefore deliberately architecture-ready but not implementation-plan-ready. A later planner must consume the exact Phase 3 input matrix in `04-CONTEXT.md`, especially active Product Discovery Configuration, accepted Market Play, active Offer, runner/source policy, scheduler semantics, drift directives, migration chain, and hosted-boundary evidence.

Until then, no implementation may manufacture a Product Ready state, accept a discovery proposal as an active Market Play, infer an Offer, or reuse Product scheduling rules without their documented slot/watermark contract.

## Recommended domain boundaries

| Responsibility | Trusted owner | Must not own it |
|---|---|---|
| Profile readiness/configuration | profile-readiness service + atomic D1 transaction | runner/UI optimistic state |
| Run scheduling/slot reservation | scheduler service/repository | browser or runner callback |
| Assignment issuance/revocation | runner-connection service | provider adapter or client |
| Retrieval safety and source normalization | retrieval/source-policy service | runner tier assertion |
| Runner submission ingestion | schema-validating handler | state-transition authority |
| Qualification | pure rubric evaluator invoked by trusted service | model prompt or UI |
| Prospect review/cooldowns | trusted prospect-state service | qualification/effect handler |
| Rendering/transport | one workspace transport owner + pure leaves | leaf components |

All repositories start from an admitted principal/workspace context and bind workspace scope in every query. Domain code receives port interfaces; Cloudflare scheduler/model bindings stay in adapters. Existing `site/domain/request-security.ts`, `site/domain/interview-handler.ts`, and `site/domain/interview.ts` establish the desired route-handler/domain split, expected-revision/idempotency behavior, and admitted-workspace pattern.

## Immutable configuration and readiness

Represent readiness as a typed projection over confirmed inputs, not editable fields on a Profile. The candidate creation transaction reads the exact parent/configuration versions, confirms completeness, serializes canonical fixed-order JSON, hashes it, creates an inactive candidate, and writes authority/audit records. Activation revalidates the candidate digest/revisions, atomically marks it active, creates the initial run and schedule, and returns an authoritative projection.

Activation needs a uniqueness/race guard: at most one active Profile Effective Configuration for the Profile and one initial run per configuration. A response-loss retry with the same operation digest returns the original result; a stale candidate conflicts without schedule/run creation. Do not use a batch guarded `UPDATE` as the only protection because D1 can continue after a zero-row update; retain the Phase 2 FK-backed authority-command/unique-index strategy.

The configuration must contain immutable references/digests for Company, Product, Market Play, Profile, Offer, readiness inputs, Product configuration, source policy, rubric, claim guardrails, contact/outreach strategies, compliance posture, runner policy, schedule/timezone, output policy, and instruction version. These values make later qualification/review reproducible even after replacement activation.

## Scheduling and runs

Profile schedules are independent of Product Market Discovery schedules. Reuse only the already-proven Phase 3 scheduler abstraction, not its owner key or watermark. The Profile slot key should include run kind, Profile ID, intended local timestamp, and timezone offset to prevent a DST duplicate while separating owner types. One active scheduled run may exist per Profile/slot; an overlapping scheduled attempt records `SkippedOverlap`, while a manual request is separately queued under its own idempotency authority.

The first run is created only by configuration activation. Manual runs require a currently active configuration and a trusted server-selected source window; readiness must not expose a generic work-launch endpoint. Watermark moves only after `Succeeded`. Normal discovery has a 24-hour overlap from last successful watermark; misfires at most 24 hours old run once and older misfires are recorded as skipped. Record intended/actual start, trigger, configuration/instruction/provider/model, source window, attempt, assignment, and monotonic event history.

## Runner connection and submission containment

Issue a short-lived assignment token that is audience-bound to the runner endpoint and contains/addresses: assignment ID, run ID, workspace/profile/configuration IDs, expiry, nonce, quota/byte limits, allowed tool set, and submission idempotency scope. Store only a token hash plus revocation/consumption state. Validate signature/hash, audience, expiry, nonce, assignment/run/configuration match, quota, body size, strict schema, and state before accepting each submission.

Runner submissions are append-only findings/status proposals. Require HTTPS URLs, bounded excerpts, claimed dates, source references, and transformation metadata. Ignore/reject fields that attempt source-tier assignment, qualification outcome, review state, configuration activation, runner/provider switching, budget/grant authorization, arbitrary credentials, or state jumps. Submission records preserve raw bounded normalized payload/digest and sanitized display projection. A failed/expired/revoked token never leaks run or workspace details.

No silent failover: a provider/model retry is a new owner-visible assignment with an explicit reason and its own record. The later plan must preserve no-credential-storage in the database/UI/logs and test it as a negative assertion.

## Retrieval, provenance, and source independence

Follow the accepted implementation contract: fetch HTTPS only; independently resolve and validate every address; reject any redirect resolution containing private, loopback, link-local, metadata, non-routable, or mixed public/private addresses; pin an allowed resolved address at connect; revalidate after redirect; cap redirect count/bytes/MIME/decompression/time; sandbox extract; escape rendered text.

Source tiering belongs to application source policy: Tier 1 is verified organization/owner/regulator/formal filing; Tier 2 is allowed or owner-reviewed editorial publisher; Tier 3 is all else. Persist publisher ID, underlying-origin ID, and a deterministic independence-group ID so reposts, syndications, subsidiaries repeating a release, and articles based on the same filing do not count as independent. Old evidence remains visible but is `Account Context` unless reconfirmed within 30 days. Fingerprint normalized source/event/profile facts; a Material Signal creates a successor Signal linked to its predecessor rather than mutating history.

## Deterministic qualification

Implement Mining qualification as a pure, total function over validated evidence and an exact Profile Effective Configuration. It should produce canonical structured output rather than throwing for ordinary insufficiency:

1. Reject untrusted/incomplete inputs to `InsufficientEvidence` with missing-field list.
2. Apply hard disqualifiers and return `Disqualified` with exact gate/evidence.
3. Score five dimensions using fixed integer anchors; absent support is 0.
4. Enforce total >= 7, pain >= 1, timing >= 1, and one Tier 1 or two independent Tier 2 sources.
5. Return `Passed` or `NotQualified` with anchors, score, sources, gate results, recency, and tie sort inputs.

Persist an immutable assessment with all source IDs/hashes, tier/independence observations, config/rubric digest, evaluation version, outcome, and explanation. Only the trusted service turns `Passed` into `Qualified`. The same source/event/profile fingerprint cannot create a duplicate active prospect; stable sort is pain, timing, account fit, freshest material event, then Prospect ID.

## Review state

Owner decisions are separate expected-revision/idempotent commands against the assessment and current prospect projection. Reject requires reason and computes a 90-day cooldown; Defer requires reason and review date; Approve changes only `Qualified -> Approved`. Material Signal and Profile-configuration replacement have explicit, recorded re-entry behavior. No command writes contact, enrichment, package, export, message, send, or spend state.

## Existing patterns to reuse

| Existing asset | Phase 4 use |
|---|---|
| `site/domain/request-security.ts` | mutation admission, Origin/Fetch Metadata/CSRF/content-type/bounded-body rejection |
| `site/domain/interview-handler.ts` | thin route dependency injection and normalized domain conflict mapping |
| `site/domain/interview.ts` | admitted workspace resolution, immutable answer/decision separation, operation digest, expected revision |
| `site/db/schema.ts` and numbered `site/drizzle` migrations | additive Drizzle/D1 schema and migration-chain test convention |
| `site/tests/helpers/d1.mjs` | full-chain Miniflare fixture, race helpers, forbidden-table snapshots |
| `site/app/prospector-app.tsx` / `site/app/globals.css` | shell, native controls, panel and responsive visual language |
| Phase 2 `KnowledgeWorkspace` planning pattern | single transport/CSRF/idempotency owner with pure typed UI leaves |

## Do not do

- Do not couple domain services to a model, scheduler, or Cloudflare SDK.
- Do not make a runner bearer token a general workspace API or grant it browser/session authority.
- Do not allow application tiers to be accepted from a runner, publisher string, or UI selection.
- Do not trust a model’s score, claimed independent sources, dates, or disqualifier result.
- Do not mutate an active Profile configuration, Signal, assessment, or review history in place.
- Do not treat a passed qualification or approval as authority for any Phase 5–7 effect.
- Do not add a generic URL fetch, arbitrary credential input, silent fallback, contact storage, paid work, or source text rendered as HTML.

## Planning readiness decision

**Research conclusion:** Prepare a Phase 4 plan only after Phase 3 has a verified output directory containing the required input contract and the Phase 1/2 boundary proofs it depends upon. This package intentionally does not create `04-PLAN.md` files.
