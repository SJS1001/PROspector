# Synthesized Technical Constraints

## Trusted application boundary

- source: /Users/stevensmith/Documents/PROspector/docs/IMPLEMENTATION-SPEC.md
- type: protocol
- content: Trusted application code owns authentication, authorization, schemas, state transitions, readiness, qualification, budgets, approvals, suppression, audit, exports, and sends. AI, web/upload/import, provider, Gmail, and browser identifiers are untrusted proposals only. External systems are accessed exclusively through the nine named provider ports; domain services cannot import provider SDKs directly.

## Principal and authorization contract

- source: /Users/stevensmith/Documents/PROspector/docs/IMPLEMENTATION-SPEC.md
- type: api-contract
- content: Derive workspace and principal from verified server sessions or runner tokens. Enforce authorization in handlers and repositories, generate object keys server-side, disable pilot invitations, and provide negative cross-principal tests for every sensitive capability. Owner recovery has no application backdoor.

## Browser session and CSRF contract

- source: /Users/stevensmith/Documents/PROspector/docs/IMPLEMENTATION-SPEC.md
- type: api-contract
- content: Accept hosting identity only from trusted edge headers. Use secure, HttpOnly, host-only, rotated, revocable short-lived sessions when cookies are used. Every browser mutation requires Origin, Fetch Metadata, and an unpredictable session-bound CSRF token; OAuth uses independent one-time state and PKCE. Missing/conflicting proof fails closed.

## Core domain record schema

- source: /Users/stevensmith/Documents/PROspector/docs/IMPLEMENTATION-SPEC.md
- type: schema
- content: Mutable rows carry opaque UUIDv7 ID, workspace ID, timestamps, and optimistic revision; version rows are append-only. Implement the stated parent/cardinality and uniqueness rules for workspace, principals, commercial hierarchy, knowledge/configuration, proposals, identities, signals/prospects, outreach, grants/suppression, runs/imports, interview state, audit, exports, Gmail, and budgets.

## Typed configuration schema

- source: /Users/stevensmith/Documents/PROspector/docs/IMPLEMENTATION-SPEC.md
- type: schema
- content: Product Discovery Configuration and Profile Effective Configuration are immutable, typed, canonically digested snapshots of every governing knowledge/policy/runner version. Runs and downstream artifacts reference the appropriate type; historical replay never follows a current pointer.

## Atomic readiness protocol

- source: /Users/stevensmith/Documents/PROspector/docs/IMPLEMENTATION-SPEC.md
- type: protocol
- content: Readiness is a pure function returning all unmet requirements. Revision check, referenced-version validation, configuration creation, audit, unique initial run, and recurring schedule commit atomically. Initial run keys are deterministic; retries are bounded; exhausted jobs require attention without undoing Ready.

## Lifecycle and effective availability

- source: /Users/stevensmith/Documents/PROspector/docs/IMPLEMENTATION-SPEC.md
- type: protocol
- content: Enforce owner-only Product, Play, and Profile lifecycle matrices. Keep persisted local lifecycle separate from derived Effective Availability. Ancestor pause/archive writes suspension reasons, cancels unleased work, and invalidates approvals without rewriting child lifecycle. Every run/export/call/send recomputes availability at the action boundary.

## Ready configuration rollover

- source: /Users/stevensmith/Documents/PROspector/docs/IMPLEMENTATION-SPEC.md
- type: protocol
- content: Editing confirmed state on Ready entities produces impact preview and proposed replacement configurations. Activation atomically repoints future schedules, audits, and requalifies affected unreviewed Prospects; old queued work is cancelled, submitted work is historical, downstream eligibility and approvals are invalidated, and contacted/exported history stays on its original snapshot.

## Consensus Interview state machine

- source: /Users/stevensmith/Documents/PROspector/docs/IMPLEMENTATION-SPEC.md
- type: protocol
- content: Sessions use Open/AwaitingAnswer/AwaitingConfirmation/Completed/Paused/Archived, with at most one active question. Answers and confirmations are immutable, revision-checked, digest-bound owner actions. Idempotent retries converge; stale/concurrent conflicts never create duplicate active questions or confirmations; correction/rescope appends truth rather than overwriting it.

## Configuration-independent imports

- source: /Users/stevensmith/Documents/PROspector/docs/IMPLEMENTATION-SPEC.md
- type: schema
- content: Uploads create immutable import batches/items and identity proposals before readiness. They cannot create Runs, Accounts, Signals, Candidates, or Prospects. Promotion is a separate owner transaction after identity review and valid destination activation. Identical hashes/version are idempotent; changed artifacts create new batches.

## Jobs, schedules, and queues

- source: /Users/stevensmith/Documents/PROspector/docs/IMPLEMENTATION-SPEC.md
- type: protocol
- content: Run transitions are monotonic and evented; runner submissions cannot choose terminal state. Product and Profile schedules have independent owners, watermarks, slot keys, and concurrency. DST-safe slot keys prevent duplicates, overlaps are recorded, misfires are bounded, successful discovery alone advances the watermark, and signal fingerprints preserve material-change lineage.

## Safe source ingestion

- source: /Users/stevensmith/Documents/PROspector/docs/IMPLEMENTATION-SPEC.md
- type: protocol
- content: Retrieval accepts HTTPS only, validates and pins public DNS/IP on each redirect, blocks local/metadata/proxy paths, bounds redirects/bytes/MIME/decompression/time, scans uploads, sandboxes extraction, strips active content, and renders source text as escaped data. Runner input/output is minimized, schema-bounded, and provenance-required.

## Deterministic qualification engine

- source: /Users/stevensmith/Documents/PROspector/docs/IMPLEMENTATION-SPEC.md
- type: protocol
- content: Application code assigns source tiers and calculates rubric results from cited observations. The Mining rubric uses five 0–2 dimensions, >=7/10, pain/timing >=1, no hard disqualifier, required evidence, and defined independent-source rules. Missing evidence scores zero; outcomes distinguish Passed, NotQualified, InsufficientEvidence, and Disqualified.

## Prospect state machine

- source: /Users/stevensmith/Documents/PROspector/docs/IMPLEMENTATION-SPEC.md
- type: protocol
- content: Enforce only the enumerated qualification, review, contact, package, export, and contacted transitions. A transition never implies authorization for an external effect. Current downstream eligibility is a projection over immutable history and can become NeedsReview or NonContactable without deleting prior decisions.

## Contact identity and freshness

- source: /Users/stevensmith/Documents/PROspector/docs/IMPLEMENTATION-SPEC.md
- type: protocol
- content: Verification classes are suggested, domain_valid, mailbox_verified, source_verified, and invalid; only mailbox/source verified points qualify downstream. Re-evaluate configured freshness at package, export, call, and send. Ambiguous identity creates suggestions; owner-reviewed merge/split preserves lineage, associations, sources, and suppression.

## Market Play Proposal identity

- source: /Users/stevensmith/Documents/PROspector/docs/IMPLEMENTATION-SPEC.md
- type: schema
- content: Fingerprint proposals by Product, normalized market category, audience, and problem family. Keep immutable versions and owner decisions; surface at most three per trigger. Explore creates Draft only, Defer defaults to 90 days, Dismiss to 180 days, and early reopen requires materially distinct evidence.

## Outreach Package approval

- source: /Users/stevensmith/Documents/PROspector/docs/IMPLEMENTATION-SPEC.md
- type: protocol
- content: Canonically hash Prospect/Contact/configuration IDs, evidence/source hashes, angle, guardrail dependencies, contact points, call script, and draft message IDs. Owner approval binds the exact SHA-256 digest, is immutable/audited/expiring, and invalidates on any dependency change. It enables CRM eligibility only, not sending.

## Paid enrichment reservation

- source: /Users/stevensmith/Documents/PROspector/docs/IMPLEMENTATION-SPEC.md
- type: protocol
- content: Single-use immutable grants bind provider, Prospects, operation, units, maximum cost/currency, expiry, actor, and nonce. Reserve worst-case monetary cost durably before the provider call, then settle/reconcile. Any absent, stale, mismatched, unbounded, reused, or over-budget authority yields zero provider calls.

## Runner resource and budget limits

- source: /Users/stevensmith/Documents/PROspector/docs/IMPLEMENTATION-SPEC.md
- type: nfr
- content: Billed Runners need immutable provider/model/catalog/scope/per-run/monthly/currency/expiry/retry grants and pre-assignment reservations. Durably enforce the stated per-owner/workspace active/queued/manual/submission/token/audit limits, lockouts, emergency stops, and body/cardinality bounds; prove no over-budget calls under distributed bursts.

## Gmail connection and send protocol

- source: /Users/stevensmith/Documents/PROspector/docs/IMPLEMENTATION-SPEC.md
- type: protocol
- content: Bind connection to workspace, principal, Google subject, mailbox/verified aliases, exact scopes, protected secret reference, and status. Canonically hash every message field. Transactional outbox consumes approval after current checks, then a fenced lease rechecks all safety state. Ambiguous provider acceptance becomes DeliveryUnknown and is never automatically resent.

## Suppression and unsubscribe

- source: /Users/stevensmith/Documents/PROspector/docs/IMPLEMENTATION-SPEC.md
- type: protocol
- content: Append-only suppression covers exact email/domain, E.164 phone, Contact, Organization, or all Company outreach and unions through reviewed merges. Opaque bounded unsubscribe tokens write suppression transactionally before generic success. Explicit opt-out replies fail closed immediately; ambiguous replies pause for owner review.

## Gmail sync and phone boundary

- source: /Users/stevensmith/Documents/PROspector/docs/IMPLEMENTATION-SPEC.md
- type: protocol
- content: Gmail requests minimal scopes and syncs only originated thread status with minimized reply data. Phone remains manual: verified business numbers, server-authorized tel links, package-derived scripts, enumerated outcomes, and same-transaction do-not-call suppression.

## Retention and deletion inventory

- source: /Users/stevensmith/Documents/PROspector/docs/IMPLEMENTATION-SPEC.md
- type: nfr
- content: Apply the specified retention periods to proposed knowledge, raw sources, prospects, contacts, Gmail excerpts, audits, suppressions, exports, documents, configurations, runner artifacts, activities, OAuth state, provider copies, caches, and logs. Deletion propagates through derived/R2 copies while retaining necessary minimized audit and suppression tombstones.

## Workspace export and restore

- source: /Users/stevensmith/Documents/PROspector/docs/IMPLEMENTATION-SPEC.md
- type: protocol
- content: Recent owner reauthentication produces an audited, passphrase-encrypted, authenticated archive with canonical records, content-addressed objects, schemas, checksums, signature/HMAC, and tombstones. Restore uses bounded staging; rejects traversal/link/collision/archive bombs; verifies schema, integrity, counts, and workspace consistency; commits atomically with schedules/sending off.

## Reusable Knowledge Package

- source: /Users/stevensmith/Documents/PROspector/docs/IMPLEMENTATION-SPEC.md
- type: schema
- content: Versioned positive allowlist permits selected knowledge, authorized excerpts, provenance/license, guardrails, and approval metadata only. PII/secrets/private refs/outreach/suppression block export. Source confirms exact digest; destination imports as Proposed Knowledge and confirms every use.

## Audit and observability

- source: /Users/stevensmith/Documents/PROspector/docs/IMPLEMENTATION-SPEC.md
- type: nfr
- content: Append actor, action, subject, workspace, request/assignment, time, outcome, version/digest, and bounded reason without copying secrets or message bodies into logs. Monitor queues, jobs, providers, budgets, runner rejection, sends, suppression, export/restore, schedules, and retention with owner-visible action states.

## D1 change and recovery policy

- source: /Users/stevensmith/Documents/PROspector/docs/IMPLEMENTATION-SPEC.md
- type: protocol
- content: Use expand/migrate/contract releases with compatibility, additive migrations, bounded idempotent data moves, invariant verification, and delayed destructive contraction. Failure pauses traffic and rolls back compatible code; data recovery restores the verified pre-migration encrypted export into a clean deployment, never a lossy down script.

## Release invariants

- source: /Users/stevensmith/Documents/PROspector/docs/IMPLEMENTATION-SPEC.md
- type: nfr
- content: Real data and external effects remain blocked until all 24 enumerated invariants pass, including isolation, concurrent readiness, historical replay, contact eligibility, budget authority, immutable approvals, suppression races, drift, schedule/DST behavior, runner replay/abuse, Gmail uncertainty, CSRF/OAuth, retention, restore hardening, import staging, lifecycle availability, and Consensus Interview concurrency.

## Pilot technical shape

- source: /Users/stevensmith/Documents/PROspector/docs/IMPLEMENTATION-PLAN.md
- type: schema
- content: Build a private server-authorized Codex Site using D1 repositories and R2 objects behind identity/storage/object/scheduler/runner/contact/mail/export/clock ports. Keep schemas, migrations, app code, fixtures, and tests in Git; keep secrets and operational data out.

## Wave 0 capability gate

- source: /Users/stevensmith/Documents/PROspector/docs/IMPLEMENTATION-PLAN.md
- type: nfr
- content: Before sensitive data, prove owner identity, cross-principal denial, D1/R2 durability and isolation, mutation controls, scheduler, runner callbacks, controlled Gmail OAuth, secrets, audit/observability, and encrypted export/restore. Failure selects a compatible host without changing the domain model.

## Wave 1 knowledge-foundation gate

- source: /Users/stevensmith/Documents/PROspector/docs/IMPLEMENTATION-PLAN.md
- type: nfr
- content: Deliver authorized shell/repositories, versioned knowledge and Consensus Interview, hierarchy/readiness/drift/reuse, safe import, and encrypted export/restore. All Wave 0 evidence, domain/security/browser/accessibility tests, Git data hygiene, and a clean adversarial review must pass.

## Wave 2 discovery-and-review gate

- source: /Users/stevensmith/Documents/PROspector/docs/IMPLEMENTATION-PLAN.md
- type: nfr
- content: Deliver runner control, safe source ingestion, Market Discovery, deterministic prospecting/qualification, Review Queue, identity lineage, and prospect workspace. Abuse, provenance, schedule, scoring, state-machine, accessibility, E2E, and clean adversarial evidence must pass.

## Wave 3 enrichment-and-outreach gate

- source: /Users/stevensmith/Documents/PROspector/docs/IMPLEMENTATION-PLAN.md
- type: nfr
- content: Deliver granted enrichment, immutable packages, manual phone, Gmail approval/outbox/reconciliation/unsubscribe, suppression/retention, and safe CRM CSV. All release invariants, controlled test providers/accounts, data drills, diagnostics/build/smoke tests, and final clean adversarial review must pass.

## Deployment activation sequence

- source: /Users/stevensmith/Documents/PROspector/docs/IMPLEMENTATION-PLAN.md
- type: protocol
- content: Publish the exact reviewed private commit; migrate/bind secrets with verified export; verify access/audit; restore fixtures and smoke test; connect controlled Runner and Gmail; import legacy data only as proposed/history; complete readiness; activate schedules; then prove activated workspace export/restore.

## Definition of implementation complete

- source: /Users/stevensmith/Documents/PROspector/docs/IMPLEMENTATION-PLAN.md
- type: nfr
- content: Completion requires all W0–W3 gates and release invariants, verified private deployment, generic non-Mining interview proof, safe Mining seed import, full fake-provider path to CRM CSV and controlled Gmail send, clean workspace restore, clean final red-team loop, and owned dated residual risks.

## Mining migration target

- source: /Users/stevensmith/Documents/PROspector/docs/MIGRATION-ONE-MINING.md
- type: schema
- content: Target Digitalrain -> ONE -> ONE for Mining -> Operating mineral-processing sites, with Greenfield Draft, weekdays 06:00 America/Toronto, and seven Export-ready Prospects weekly.

## Legacy source classification

- source: /Users/stevensmith/Documents/PROspector/docs/MIGRATION-ONE-MINING.md
- type: protocol
- content: Import each enumerated legacy artifact according to its proposed source/seed/context/document/strategy/instruction/operations classification. Never treat Git presence as active authority, deploy legacy enrichment, import drafts as approvals, or let placeholders become claims.

## Confirmed migration seed

- source: /Users/stevensmith/Documents/PROspector/docs/MIGRATION-ONE-MINING.md
- type: protocol
- content: The enumerated hierarchy, priority, rubric, evidence rules, schedule/target, reveal budget, Gmail/manual-phone choice, suppression/approval rules, and proposed templates may stage as a dated confirmed seed but still require final in-application readiness review.

## July 24 import schema

- source: /Users/stevensmith/Documents/PROspector/docs/MIGRATION-ONE-MINING.md
- type: schema
- content: Format `one-mining-history/v1` validates exact artifact hashes and maps 25 source objects into 13 Operating Candidate proposals, 8 Greenfield proposals/context, and 4 Channel/Multiplier strategy proposals, preserving 9 missing-pain rows and creating zero Contacts or automatically Qualified/Approved records. IDs are deterministic UUIDv5; composite names remain unresolved.

## Mining pre-activation review

- source: /Users/stevensmith/Documents/PROspector/docs/MIGRATION-ONE-MINING.md
- type: nfr
- content: Before activation, confirm Product claims/guardrails, disputed wording, rubric and hard gates, geography/languages/providers/compliance copy, Offer viability evidence, stale sources, every imported identity/proposal, and absence of contact/suppression/credential/private-source material from Git.

## Migration acceptance contract

- source: /Users/stevensmith/Documents/PROspector/docs/MIGRATION-ONE-MINING.md
- type: nfr
- content: Import is path/hash/version-idempotent and fully provenance-traceable. Placeholders/conflicts cannot satisfy readiness; legacy certification becomes Candidate, MX/generated contacts remain Suggestions, changed sources create drift proposals, and operational artifacts enter only through authenticated ignored upload while CI uses synthetic fixtures.
