# PROspector Implementation Plan

Status: Ready for adversarial review

The build proceeds only when the preceding gate has evidence. “Complete” means the acceptance tests pass; it does not mean files merely exist.

## Technical shape

- Web application: TypeScript, React, server routes/actions, strict schemas.
- Pilot host: private Codex Site, conditional on Wave 0.
- Structured state: D1 migrations and repositories.
- Files/exports: R2 through an object-store port.
- Testing: unit, repository/integration, browser end-to-end, abuse/concurrency, and restore drills.
- External adapters: identity, scheduling, runner, contact provider, Gmail, and export delivery.
- Legacy Python enrichment: never imported by the production application; retained only as migration evidence until removal is safe.

The web app lives under `site/` so existing source materials remain inspectable without becoming runtime dependencies.

## Wave 0 — prove the pilot platform

### Build

1. Initialize the Sites application and verify local development/build.
2. Create provider-neutral ports and a fake adapter suite.
3. Bind a disposable D1 database and R2 bucket.
4. Prove private identity and server-derived Company Workspace scope.
5. Prove server-only secrets and client non-disclosure.
6. Prove browser session rotation/cookie settings and CSRF enforcement for all consequential mutations.
7. Prove a scheduled job with idempotent slot key, retry, overlap, misfire, and timezone behavior.
8. Prove an external Runner assignment callback with expiry, revocation, idempotency, payload/rate/queue limits, and model-spend reservation.
9. Prove Gmail OAuth redirect/state/PKCE, authoritative account/sender binding, durable encrypted refresh credentials, disconnect/reconnect, and restricted thread sync using a real controlled test account. A stub may test the port but cannot satisfy Gate W0.
10. Prove encrypted bounded export and clean-deployment restore for a fixture workspace.
11. Prove audit retrieval, operational errors, and owner-visible failed-job state.

### Gate W0

- Private unauthenticated requests are denied.
- Cross-principal fixture access is denied at route, row, and object layers.
- D1/R2 data survives deployment and is not present in Git/build assets.
- Schedule and runner abuse tests pass.
- CSRF, session rotation, queue/rate, and model-spend abuse tests pass at the contract limits.
- The browser never receives secrets or unrestricted storage credentials.
- Export/restore fixture equality and tamper failure pass.
- Real test-account Gmail evidence covers state/PKCE, callback allowlist, protected refresh token, minimum scopes, originated-thread filtering, disconnect, token failure, and recovery. Without it W0 remains blocked or the host changes.
- Sites limitations and fallback decision are recorded in ADR-0004.

If any critical capability is unavailable, stop sensitive-data work and implement the same ports on a compatible host. Do not weaken the contract to fit the host.

## Wave 1 — knowledge foundation

### Slice 1.1: application shell and authorization

- Build the six primary routes and readiness-aware navigation.
- Add owner session enforcement to every server route/action.
- Add CSRF/Origin/Fetch-Metadata enforcement and secure session rotation to every state-changing route/action.
- Add append-only audit service and owner-visible activity.
- Add error boundary, empty/loading states, and accessible responsive layout.

Acceptance: new deployment opens Consensus Interview; seeded Ready workspace opens Morning Brief; unauthorized and cross-scope tests pass.

### Slice 1.2: domain schema and repositories

- Add D1 migrations for workspace, versions, knowledge, commercial hierarchy, sources, typed Product/Profile configurations, Market Play Proposals/decisions, jobs, and audit.
- Enforce workspace and parent constraints in repositories.
- Add optimistic revisions and transaction helpers.
- Add fixture factories for Digitalrain and a second isolated test Company.

Acceptance: migration up/down policy is documented; constraints reject orphans/cross-workspace references; repository contract tests pass.

### Slice 1.3: Consensus Interview

- Implement one active question, answer history, researched facts, labelled inference, recommendation, and explicit confirmation.
- Persist Interview Sessions, versioned Questions, Answers, Recommendations, and Confirmations with optimistic revisions, exactly-one-active-question, idempotent retries, supersession, and conflict handling.
- Store Proposed and Confirmed Knowledge versions with scope and provenance.
- Generate versioned Knowledge Documents from structured state.
- Implement conflict and drift decisions: accept, reject, correct, rescope.
- Record immutable dependency edges and pause affected outbound on high-risk drift.
- Implement impact preview, replacement typed-configuration activation, Product-change fan-out, schedule rollover, run disposition, requalification, and dependent package/message invalidation.

Acceptance: proposals cannot affect readiness; confirmation changes only its scope; changed sources create drift; dependency tests pause only affected artifacts; resume/retry/concurrent-tab/stale-confirmation tests preserve exactly one active question and one resulting decision.

### Slice 1.4: hierarchy, reuse, and readiness

- Create/edit/archive Company, Products, Market Plays, Profiles, and Offers.
- Implement Product-vs-Market-Play decision guidance.
- Implement same-Company Reuse Suggestions.
- Implement Reusable Knowledge Package allowlist, scan, source confirmation, import-as-proposed, and destination confirmation.
- Implement Product Discovery and Profile Effective readiness checklists/configurations, complete Product/Play/Profile lifecycle matrices/cascades, and idempotent initial job creation.

Acceptance: Draft controls remain hidden; concurrent Ready requests create one typed configuration/run/schedule; package PII/secret fixtures fail closed; historical configurations replay.

### Slice 1.5: import/export

- Implement versioned ONE for Mining import using `MIGRATION-ONE-MINING.md`.
- Stage the hash-verified July 24 artifacts through configuration-independent `import_batch`/`import_item`/`identity_proposal` records: 13 proposed Operating items, 8 Greenfield historical proposals/context, and 4 Channel/Multiplier Organization-strategy proposals. Before identity review/readiness there are zero Accounts/Prospects. Preserve 9 missing-pain records and zero contacts. After Profile activation, promote only reviewed eligible Operating items with full lineage. Use a checked-in synthetic shape fixture for CI, never copied operational data.
- Implement encrypted Company Workspace Export, dry-run report, restore, checksums, authentication, and signed delivery.

Acceptance: import is idempotent before readiness; typed counts persist with zero Accounts/Prospects; reviewed identity + valid Profile activation promotes only eligible Operating items deterministically; placeholders cannot satisfy readiness; legacy certification/MX data maps safely; clean restore equals source fixture and schedules remain off until activation.

### Gate W1

- All Wave 0 evidence remains green.
- Domain, authorization, versioning, readiness, drift, reuse, import, export, restore, accessibility, and browser tests pass.
- No personal data, credentials, runtime DB, or export artifacts are tracked by Git.
- A clean adversarial review has no unresolved blocker/high finding for Wave 1.

## Wave 2 — discovery and review

### Slice 2.1: run control and Runner Connections

- Add Product/Profile runner settings and connection health.
- Implement assignment creation, minimized context endpoint, short-lived token verification, append-only submission, schema/provenance validation, and run manifest.
- Add explicit labelled retry with another provider and prohibit silent failover.
- Add billed-Runner grants, price versions, monetary reservations/settlement, and exact durable abuse limits.
- Add fake runner and Codex task instructions for local/end-to-end testing.

Acceptance: expired/revoked/replayed/cross-assignment/oversized/rate-limited submissions fail; queue/audit caps hold; actual plus reserved model spend stays within the grant; no runner can confirm knowledge, score directly, spend without a grant, approve, or send.

### Slice 2.2: safe source ingestion

- Add fetch policy, SSRF guards, redirects/size/MIME/decompression limits, source hashing, and sandboxed text extraction.
- Add upload scanning and escaped source rendering.
- Add malicious-page fixtures and schema-fuzz tests.

Acceptance: private-network, mixed-DNS, rebinding, redirect, proxy, and unsafe-scheme fetches fail at connect time; active HTML never executes; malicious instructions remain quoted evidence.

### Slice 2.3: Market Discovery

- Run on Product readiness, monthly schedule, manual request, and material Product change.
- Limit surfaced proposals to three for every run trigger.
- Show evidence, audience, buyer, examples, fit, risks, and existing-play collision.
- Add Explore/Defer/Dismiss with reasons and cooling behavior.
- Add immutable proposal versions/decisions, Product-market-audience-problem fingerprints, 90-day deferral, 180-day dismissal, material-evidence reopen, concurrency, and split/merge lineage.

Acceptance: proposals cannot start prospecting/outreach; Explore creates Draft Play/interview; dismissed duplicates do not recur without material evidence.

### Slice 2.4: Prospecting and qualification

- Implement Signals, deterministic source-tier registry, underlying-origin/independence groups, recency, fingerprints, Candidate Accounts, Targets, Account Context, and material-signal lineage.
- Implement deterministic versioned rubric engine and Mining Operating rubric.
- Implement Candidate/Qualified/NotQualified/InsufficientEvidence/Disqualified state machine and cooldown/reopen rules.
- Add consolidated Morning Brief grouped Product -> Play -> Profile.

Acceptance: identical signal deduplicates; Tier 3 alone and old context cannot qualify; score/anchors/gates replay exactly; seven/week never weakens gates; run window/watermark tests pass.

### Slice 2.5: review and prospect workspace

- Build Review Queue with evidence, score explanation, Target, conflicts, and Approve/Reject/Defer.
- Build Prospect Workspace with scoped timeline, contacts, package state, and audit.
- Implement Organization/Contact merge suggestions and reviewed merge/split lineage.
- Add CSV preview placeholders without export eligibility until Wave 3.

Acceptance: review transitions require owner/reason; rejected/deferred cooldowns work; cross-play suggestion performs its own evidence/qualification; merge/split preserves suppression/provenance.

### Gate W2

- Runner abuse, prompt injection, source provenance, schedule, scoring, deduplication, state-machine, identity, accessibility, and end-to-end tests pass.
- A Mining fixture produces explainable results from its immutable Profile Effective Configuration.
- A clean adversarial review has no unresolved blocker/high finding for Waves 1-2.

## Wave 3 — controlled enrichment and outreach

### Slice 3.1: approved enrichment

- Add approval grant UI and durable cost reservation ledger.
- Add contact-provider port and fake provider before any live provider.
- Store Contact Suggestions and verification classes separately.
- Implement versioned Contact Strategy freshness and enforce it at package/export/call/send boundaries.
- Implement per-Prospect/profile/workspace budgets and reconciliation.
- Remove/disable all production reachability to legacy MCP enrichment.

Acceptance: generated/MX-only contacts fail every Enriched Contact/export/send path; absent/reused/expired/mismatched/stale-price/unbounded-cost/currency/over-budget grants make zero provider calls; concurrent actual-plus-reserved cost cannot overspend.

### Slice 3.2: Outreach Packages and phone

- Generate sourced angle, claim dependencies, selected contact, email drafts, and call script.
- Add Package Review and immutable package digest approval, expiry, revocation, and invalidation.
- Add verified business phone display, `tel:` click-to-call, outcomes, notes, and follow-up.
- Write do-not-call suppression in the same transaction as its outcome.

Acceptance: package cannot exceed guardrails/evidence; package mutation/dependency/configuration/contact change invalidates approval and Export-ready eligibility; wrong/unverified phone is ineligible; do-not-call immediately blocks all matching calls.

### Slice 3.3: Gmail and immutable approval

- Implement Gmail connection/disconnect/health and protected refresh credentials.
- Persist authoritative Google subject/mailbox/verified aliases/scopes/secret reference/status and reject state replay, account swap, partial scopes, subject mismatch, and wrong From.
- Build canonical message versions and SHA-256 approval digests.
- Build transactional outbox, suppression/drift rechecks, idempotent delivery, reconciliation, and owner-visible errors.
- Sync only originated threads and minimize reply/bounce data.
- Add deterministic RFC Message-ID reconciliation and `DeliveryUnknown` owner workflow; never automatically resend an ambiguous Gmail request.
- Add opaque idempotent unsubscribe endpoint and fail-closed reply opt-out processing that writes Company suppression.
- Instantiate every follow-up as a new immutable message requiring its own approval; rescheduling invalidates approval.

Acceptance: every canonical mutation, stale approval, opt-out race, drift, duplicate request, disconnect, account/sender mismatch, and uncertain provider outcome behaves per contract; fault injection after provider acceptance produces one call and `DeliveryUnknown` reconciliation, never an automatic resend.

### Slice 3.4: suppression and retention

- Add normalized suppression subjects, imports, alias review, merge union, deletion survival, and export/restore.
- Implement retention inventory, owner review, deletion propagation, and backup-limit disclosure.
- Add reply/bounce stop logic and scheduled-follow-up cancellation.

Acceptance: link/reply/duplicate/alias/import/race/click-to-call/restore tests prove suppression wins; time-travel deletion covers every inventory row, R2/cache/log/adapter copy, and never removes required tombstones.

### Slice 3.5: CRM Handoff

- Produce versioned CSV, one row per eligible, non-suppressed Enriched Contact with stable Prospect ID. Suppressed subjects are omitted from contactable rows and represented only in a separately labelled non-contactable manifest when needed for CRM suppression import.
- Include account/target, score/evidence links, selected role, verification metadata, offer, approved package reference, activity status, and source workspace/run IDs.
- Escape spreadsheet formulas, use UTF-8, and provide manifest/checksum.

Acceptance: incomplete/unverified/unapproved records are absent; formula-injection fixtures are neutralized; seven Prospect fixtures can produce more than seven contact rows without duplicate Prospect identity.

### Gate W3

- Every release invariant in `IMPLEMENTATION-SPEC.md` passes.
- Gmail uses a test account before any real recipient.
- Paid provider uses a sandbox/fake before a real key.
- Data-retention and export/restore drills pass with outreach/suppression data.
- React diagnostics, type checks, tests, production build, and browser smoke tests are clean.
- A final independent adversarial review has no unresolved blocker/high finding.

## Deployment and pilot activation

1. Publish a private Site from the exact reviewed commit.
2. Apply D1 migrations and create R2 bindings/secrets.
   Use expand/migrate/contract, take a verified encrypted export first, and record invariant checks/rollback trigger.
3. Verify private access, owner identity, audit, and no client secret exposure.
4. Restore only non-sensitive fixture data and run production smoke tests.
5. Connect the operator's chosen AI Runner; do not paste subscription credentials.
6. Connect Gmail with the minimum scopes and send only to a controlled test mailbox.
7. Import Digitalrain/ONE/Mining as Proposed Knowledge and historical Candidate data.
8. Complete the in-app operator readiness review.
9. Activate Market Discovery and the Operating profile schedule.
10. Export and restore the activated workspace once before relying on the Site as system of record.

## Definition of complete

The requested build is complete when:

- all four gates (W0, W1, W2, and W3) and every release invariant pass;
- the private Site is deployed and owner access verified;
- the generic interview can create a second fixture Product/Market Play without Mining assumptions;
- the ONE for Mining seed imports without unsafe promotion;
- a full fake-provider flow reaches CRM CSV and a controlled Gmail test send;
- a Company Workspace can be exported and restored into a clean deployment;
- the final red-team loop has no unresolved blocker/high finding;
- known medium/low residual risks are documented with owners and follow-up dates.
