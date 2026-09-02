# Roadmap: PROspector

## Overview

PROspector moves from its narrow hosted interview proof to a safe private operating pilot through seven vertical delivery boundaries. The sequence first proves the owner-only workspace and provider-portability boundary, then completes confirmed commercial knowledge, Product discovery, Profile-specific prospecting, verified contacts, governed outreach, and finally CRM handoff plus clean recovery of the seeded ONE for Mining operation. Existing code is audited in the phase that owns its behavior; no phase starts as complete merely because a partial implementation exists.

**Granularity:** Standard (default; no project config was present)  
**Coverage:** 17/17 v1 requirements mapped exactly once

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): planned milestone work.
- Decimal phases (2.1, 2.2): urgent insertions added after planning.

- [x] **Phase 1: Private Pilot Boundary** - The owner can access one isolated, auditable workspace while sensitive data and external effects remain fail-closed behind proven capability gates. (completed 2026-07-30)
- [ ] **Phase 2: Consensus Knowledge and Commercial Model** - The owner can establish the commercial hierarchy and govern confirmed knowledge through a versioned Consensus Interview and drift workflow.
- [ ] **Phase 3: Product Readiness and Market Discovery** - A Ready Product can run replayable discovery and present bounded Market Play proposals for operator decisions.
- [ ] **Phase 4: Profile Readiness and Evidence-Based Prospecting** - A Ready Profile can schedule scoped runners, preserve evidence, qualify deterministically, and present prospects for review.
- [ ] **Phase 5: Controlled Enrichment and Verified Contacts** - Approved prospects can gain fresh, provenance-backed contact points only under bounded spend authority.
- [ ] **Phase 6: Governed Outreach and Suppression** - The operator can approve exact packages/messages and use Gmail or manual calling with transactional Company-wide suppression.
- [ ] **Phase 7: Mining Pilot Handoff and Recovery** - The seeded Operating workflow can report its weekly outcome, export CRM-ready contacts, and restore the complete workspace into a clean deployment.

## Phase Details

### Phase 1: Private Pilot Boundary
**Goal**: The owner can safely use a private, isolated, portable pilot boundary in which human authority is explicit and unproven capabilities cannot expose sensitive data or create external effects.  
**Depends on**: Nothing (first phase)  
**Requirements**: REQ-private-human-governed-gtm, REQ-company-workspace-isolation  
**Success Criteria** (what must be TRUE):
  1. A signed-in owner can access exactly one Company Workspace, while an unauthorized or second principal is denied across routes, rows, and objects and pilot invitations remain unavailable.
  2. The operator must explicitly confirm consequential knowledge and authorize spend or outreach; no workflow silently sends, spends, or introduces CRM opportunity, forecast, contract, revenue, or customer state.
  3. The owner can see an auditable capability status that keeps real leads, contacts, credentials, imports, schedules, exports, and provider effects disabled until their accepted gates are proven.
  4. Controlled hosted proof demonstrates trusted identity, D1 and R2 durability/isolation, mutation protection, secrets handling, audit visibility, and provider-neutral boundary behavior without placing secrets or operational data in Git.
**Plans**: 5 plans
**UI hint**: yes

Plans:
- [x] `01-01-PLAN.md` — Create the failing single-owner, evidence-state, storage, and route contracts.
- [x] `01-02-PLAN.md` — Enforce server-only single-owner admission before every interview operation.
- [x] `01-03-PLAN.md` — Build the provider-neutral capability and object-storage proof core.
- [x] `01-04-PLAN.md` — Wire secure capability APIs and the verified Pilot Status UI.
- [x] `01-05-PLAN.md` — Deploy exact source and complete controlled hosted boundary proof. The second-real-principal checkpoint remains visibly deferred and grants no later authority.

### Phase 2: Consensus Knowledge and Commercial Model
**Goal**: The owner can establish authoritative commercial knowledge and scope it correctly through a research-first, versioned, auditable decision workflow.  
**Depends on**: Phase 1  
**Requirements**: REQ-commercial-hierarchy, REQ-consensus-interview, REQ-versioned-knowledge-and-drift  
**Success Criteria** (what must be TRUE):
  1. The owner can model `Company -> Product -> Market Play -> Customer Profile -> Offer`, share Organization and Contact identity Company-wide, and keep Account, Target, relevance, evidence, qualification, and outreach scoped to the correct Market Play.
  2. The Consensus Interview presents one decision-bearing question at a time with researched evidence, labelled inference, and a recommendation, then records a separate explicit Accept, Reject, Correct, or Rescope action.
  3. Reloads, retries, stale tabs, and concurrent answers converge on one authoritative active question and never create duplicate answers, confirmations, or hidden overwrites.
  4. Uploads, imports, research, edits, and reusable knowledge enter as Proposed Knowledge with provenance; the owner can review and promote them without creating unauthorized Runs, Accounts, Contacts, or Prospects.
  5. The owner can inspect drift impact, activate immutable replacement configurations, preserve historical snapshots, invalidate affected approvals, and pause only high-risk outbound reached by the recorded dependency graph.
**Plans**: 14 active plans; incident Plans 02-13 through 02-21 and the old recovery Plan 02-99 are preserved as retired history outside executor discovery
**UI hint**: yes

Plans:
- [x] `02-01-PLAN.md` — Create full-chain D1, commercial-model, and immutable-knowledge Wave 0 contracts.
- [x] `02-02-PLAN.md` — Create interview concurrency, secure handler, drift/replacement, and Knowledge UI Wave 0 contracts.
- [x] `02-03-PLAN.md` — Complete the blocking `uuid@14.0.1` package-legitimacy checkpoint.
- [x] `02-04-PLAN.md` — Add the audited UUIDv7 dependency and additive authority schema/backfill.
- [x] `02-05-PLAN.md` — Implement the owner-scoped commercial aggregate and Proposed/Confirmed Knowledge authority.
- [x] `02-06-PLAN.md` — Generalize the research-first, two-stage, concurrency-safe Consensus Interview.
- [x] `02-07-PLAN.md` — Implement dependency-reached drift and separate immutable replacement activation.
- [x] `02-08-PLAN.md` — Expose owner-only, CSRF-protected, activation-gated Knowledge APIs.
- [x] `02-09-PLAN.md` — Build Commercial Model, Interview, Knowledge Library, and Drift leaf views.
- [x] `02-10-PLAN.md` — Compose and style the authoritative Knowledge workspace while preserving disabled effects.
- [x] `02-11-PLAN.md` — Build fixed hosted preflight/gate tooling and a blocked release ledger.
- [x] `02-12-PLAN.md` — Accept real-principal isolation and the read-only old-schema baseline.
- [ ] `02-13-PLAN.md` — **RETIRED INCIDENT HISTORY:** its prior acceptance is invalidated and earns no completion credit.
- [x] `02-22-PLAN.md` — Recorded the owner-directed greenfield reset and proved a fresh disposable local baseline from the checked migration chain without claiming anything about the original target.
- [ ] `02-99-PLAN.md` — **FUTURE GREENFIELD TARGET BARRIER:** requires separately authorized evidence from a new empty target and cannot be completed by local fixtures.

Retired incident history (not active plans; GSD executor discovery must omit them):

- `02-14-PLAN.retired.md` — Original clean-schema-0003-to-reviewed-0004 contract; permanently invalid for the current target.
- `02-15-PLAN.retired.md` through `02-20-PLAN.retired.md` — Original review/deploy/activation/lifecycle sequence; preserve only as evidence of the invalidated release design and never execute.
- `02-21-PLAN.retired.md` and `02-99-RECOVERY-PLAN.retired.md` — Original-target provenance/recovery sequence; permanently superseded by the owner-directed greenfield baseline.

**Incident disposition (updated 2026-08-27):** The owner permanently retired
the inaccessible original target and intentionally waived its missing journal,
schema, and provider provenance because none of its state will be reused. This
does not claim that any migration occurred or accept any historical schema.
The checked repository plus a freshly created empty local database is the new
authoritative starting point. All future environments must be greenfield and
must prove their own exact source, migration, privacy, and zero-effect state.
No hosted write, target provisioning, provider, credential, production data,
export, or outbound effect is authorized. See `docs/GREENFIELD-BASELINE.md` and
ADR-0006; the forensic and reconciliation files remain historical evidence.

### Phase 3: Product Readiness and Market Discovery
**Goal**: The owner can make a Product Ready from complete confirmed policy and receive bounded, replayable Market Play proposals without activating prospecting.  
**Depends on**: Phase 2  
**Requirements**: REQ-product-readiness, REQ-market-discovery  
**Success Criteria** (what must be TRUE):
  1. The owner can see every unmet Product readiness item and cannot activate readiness until capability, limitation, delivery, proof, ownership, guardrail, source/discovery, and default-runner policy is confirmed.
  2. Product readiness atomically creates an immutable Product Discovery Configuration, queues exactly one initial discovery run, reveals manual discovery, and schedules monthly discovery even when no Play, Profile, or Offer exists.
  3. Monthly, manual, and material-change discovery each surface no more than three evidence-backed proposals that show the problem match, audience, likely buyer, examples, risks, and Product fit.
  4. The owner can Explore, Defer, or Dismiss a proposal with durable history and cooldown behavior; Explore opens a Draft Market Play interview and never makes a Profile Ready or starts prospecting.
**Plans**: 11 plans
**UI hint**: yes

Plans:
- [x] `03-01-PLAN.md` through `03-08-PLAN.md` — Local implementation, UI, tests, hardening, fail-closed offline preflight, and plan summaries are committed. This is local-plan credit only; Phase 2 and Phase 3 acceptance remain outstanding.
- [ ] `03-09-PLAN.md` — Obtain exact owner authorization for the narrow private synthetic hosted proof.
- [ ] `03-10-PLAN.md` — Perform the controlled private hosted no-effect proof.
- [ ] `03-11-PLAN.md` — Accept the owner lifecycle and record the separate transport-capability disposition.

### Phase 4: Profile Readiness and Evidence-Based Prospecting
**Goal**: The owner can activate a complete Customer Profile and receive explainable, deterministically qualified prospects from scoped, untrusted runner contributions.  
**Depends on**: Phase 3  
**Requirements**: REQ-profile-readiness, REQ-deterministic-qualification, REQ-evidence-provenance, REQ-untrusted-runner-boundary  
**Success Criteria** (what must be TRUE):
  1. The owner can see every unmet Profile readiness item; complete readiness atomically creates an immutable Profile Effective Configuration, queues one initial Prospecting Run, reveals Find Prospects, and activates the timezone-aware recurring schedule.
  2. Each runner receives only a minimized, assignment-bound scope through a short-lived, revocable, quota-limited connection, and the owner can inspect provider/model, instructions, tools, configuration, sources, transformations, assignment, and grants with no credential storage or silent failover.
  3. Every Signal shows its URL, application-assigned tier, publication/event dates, retrieval time, excerpt, and lineage; Tier 3 cannot qualify alone, successful discovery uses a 24-hour overlap, and material evidence older than 30 days is context unless reconfirmed.
  4. Application code reproduces the five-dimension Mining score, 7/10 threshold, non-zero pain/timing rule, independent-source requirement, and hard disqualifiers from the recorded configuration, with explicit Passed, NotQualified, InsufficientEvidence, or Disqualified outcomes.
  5. The Review Queue lets the owner Approve, Reject, or Defer a Qualified Prospect with a reason, preserves cooldown/re-entry rules and visible funnel losses, and never treats a state transition as authorization for the next external effect.
**Plans**: 12 plans
**UI hint**: yes

Plans:
- [ ] `04-01-PLAN.md` — Establish Wave 1 profile-prospecting RED contracts. Contracts are committed; no summary exists.
- [ ] `04-02-PLAN.md` through `04-12-PLAN.md` — Checked implementation and acceptance sequence; additive persistence is committed and later dependency gates remain in force.

### Phase 5: Controlled Enrichment and Verified Contacts
**Goal**: The owner can obtain usable business contact points for approved prospects without exceeding explicit authority or promoting unverified suggestions.  
**Depends on**: Phase 4  
**Requirements**: REQ-controlled-enrichment, REQ-contact-verification  
**Success Criteria** (what must be TRUE):
  1. Before any paid provider call, the owner must issue a single-use grant bounded by provider, prospects, operation, units, maximum cost/currency, and expiry; missing, stale, mismatched, reused, or over-budget authority produces zero calls.
  2. Separately billed runner work remains within owner-approved per-run and monthly monetary budgets, and retries, uncertain charges, or provider changes never borrow or silently extend authority.
  3. Generated, inferred, directory-only, domain-valid, or MX-only details remain visibly labelled Contact Suggestions and cannot enter Enriched Contact, CRM export, package approval, click-to-call, or send eligibility.
  4. Eligible business contact points show authoritative source or mailbox verification, method, confidence, and time; freshness is rechecked at package, export, call, and send boundaries and stale points return to NeedsReview.
  5. The owner can review ambiguous identity merge/split suggestions while preserving source lineage, Market Play relevance, contact associations, and every suppression subject.
**Plans**: 9 plans
**UI hint**: yes

Plans:
- [ ] `05-01-PLAN.md` through `05-09-PLAN.md` — Checked controlled-enrichment and verified-contact sequence; execution has not started.

### Phase 6: Governed Outreach and Suppression
**Goal**: The operator can prepare and execute tightly controlled Gmail and manual-call outreach while exact approvals and Company-wide suppression win every race.  
**Depends on**: Phase 5  
**Requirements**: REQ-immutable-outreach-approval, REQ-hard-company-suppression  
**Success Criteria** (what must be TRUE):
  1. The owner can review and approve an Outreach Package's exact evidence, claims, contacts, script, and draft set, while package approval enables CRM eligibility only and never approves a message.
  2. Every Gmail message requires its own immutable approval binding sender, recipients, subject, bodies, links, attachments, thread, and scheduled time; any edit or reschedule invalidates approval.
  3. Final dispatch holds a fenced send lease and rechecks the exact digest, approval, package/configuration/entity state, sender identity, unsubscribe, compliance acknowledgement, drift, and current suppression; ambiguous Gmail acceptance becomes DeliveryUnknown and is never resent automatically.
  4. Exact email/domain, E.164 phone, Contact, Organization, and all-Company suppression is enforced transactionally at call/send time, survives deletion/import/export/restore and identity merges, and is written before unsubscribe or explicit do-not-contact success is reported.
  5. Reply, bounce, suppression, pause, archive, or high-risk drift stops applicable follow-ups; manual phone remains verified-number click-to-call with a package-derived script and reasoned manual outcome, while compliance guidance is visibly advisory rather than legal approval.
**Plans**: 13 plans
**UI hint**: yes

Plans:
- [ ] `06-01-PLAN.md` through `06-13-PLAN.md` — Checked predecessor acceptance, governed-outreach, Gmail composition, manual-call, suppression, and release sequence; execution has not started.

**Greenfield preparation:** `06-PREPARATION.md` authorizes only local synthetic
fail-closed boundary work. The static provider/effect guard and isolated
approval/suppression state machine are verified. A separate canonical
synthetic Package/Message builder binds every future approval-bearing field,
derives the call script, hashes immutable snapshots, and projects exact
invalidation. A minimized synthetic final-dispatch recheck/lease decision binds
the complete current authority and fence tuple while always denying provider
invocation authority. A separate originated reply/bounce contract projects
which matching synthetic email follow-ups would cancel or pause while denying
persistence and cancellation authority. A canonical DeliveryUnknown contract
binds one ambiguous synthetic attempt and classifies only exact, pre-resolved
originated-message observations while denying persistence, reconciliation,
retry, and provider authority. A suppression-before-success contract binds
synthetic unsubscribe/explicit-opt-out intent and proves exact tombstone,
cancellation, source, and success receipt ordering while denying persistence,
cancellation, response, and provider authority. A manual-call contract binds a
fresh fictional source-verified phone and Package-derived script, rechecks
eligibility, and proves bounded outcome plus `do_not_call` ordering while
creating no phone target, activity, suppression, follow-up, or effect. Runtime
code imports no preparation module and every effect counter is zero. A
minimized synthetic audit-envelope contract binds the eight closed preparation
decisions to exact actor/subject/fence shapes and projects append or exact
replay without creating a logger or persistence seam. A synthetic
identity-change suppression resolver unions all merge-source reach and carries
the complete scoped union to both split results, rejecting subject transplant
or topology ambiguity without mutating identities or tombstones. A separate
atomic-receipt contract binds identity transition, suppression-index
preservation, eligibility invalidation, audit append, and transaction
completion into one deterministic hash chain; empty state describes the whole
future write and only an exact complete set replays, while every partial or
transplanted view rejects. A suppression-retention contract then projects an
exact delete/import/export/archive/restore lineage that keeps the complete
subject, alias, deletion-tombstone, and non-contactable suppression-manifest
union across every boundary. Empty or partial views authorize nothing. This
does not satisfy Plan 06-11, execute a Phase 6 or Phase 7 plan, enable
persistence/export/archive/restore/provider/effect authority, or earn
completion credit. A final cross-contract preparation bundle binds the twelve
verified boundaries by synthetic ID and digest in one exact DAG while keeping
email dispatch, stop/suppression, manual call, and identity/retention as
separate modeled branches. Its two terminal references are compatibility
metadata only: it claims no branch occurred, grants no runtime or effect
authority, and earns no plan or phase credit.

### Phase 7: Mining Pilot Handoff and Recovery
**Goal**: The owner can operate the seeded ONE for Mining workflow through auditable CRM handoff and prove that the complete private workspace is portable and recoverable.  
**Depends on**: Phase 6  
**Requirements**: REQ-crm-and-workspace-exports, REQ-initial-operating-target  
**Success Criteria** (what must be TRUE):
  1. The owner can review the seeded `Digitalrain -> ONE -> ONE for Mining -> Operating` hierarchy with Greenfield remaining Draft/nurture and see the upstream Phase 4 weekday `06:00 America/Toronto` schedule state. Phase 7 never authorizes, provisions, or activates that schedule.
  2. Morning Brief and Exports & History report the first transition of each Prospect to Export-ready within the Monday–Sunday America/Toronto week, target seven new Export-ready Prospects, and continue to show rejections, deferrals, enrichment failures, reversals, and review delays without weakening gates.
  3. CRM Handoff produces a CSV with one row per currently eligible Enriched Contact and a stable Prospect ID, so contact-row count remains distinct from the weekly Export-ready Prospect count.
  4. Recent owner reauthentication can create an audited, passphrase-encrypted, versioned workspace archive containing canonical records, content-addressed objects, decisions, history, and suppression/deletion tombstones without storing the passphrase.
  5. The owner can review a restore dry run and restore the archive into a clean compatible deployment with schedules and sending disabled; tampering, wrong passphrase, version skew, unauthorized access, and expired delivery fail closed before release.
**Plans**: 10 plans
**UI hint**: yes

Plans:
- [ ] `07-01-PLAN.md` through `07-10-PLAN.md` — Checked Mining pilot handoff, CRM CSV, encrypted archive, and clean-restore sequence; execution has not started.

**Greenfield preparation:** `07-PREPARATION.md` authorizes only local synthetic
fail-closed boundary work while Plan 06-10 and every Phase 7 dependency remain
incomplete. Its first pure candidate models a supplied IANA-timezone
Monday-Sunday week, counts each stable Prospect only at its earliest supplied
Export-ready transition, keeps ten funnel-loss categories separate, excludes
Draft profiles, and proves generic non-Mining scope. Modeled transitions are
not outcome or provenance evidence, runtime code imports no preparation
module, and schedule, runner, persistence, CSV/export, provider, plan, and all
effect authority remain false/zero. A second pure candidate models only the
current handoff eligibility projection: stable Prospect plus contact-point
identity, distinct unique-Prospect/contact-row counts, exact exclusion reasons,
and suppression-only non-contactable references. It cannot serialize, persist,
deliver, download, export, or invoke a provider. A third candidate models only
immutable request/version semantics: first/next version projection, exact
idempotent replay, and fail-closed same-key/history conflicts. It cannot create
or mutate history, serialize, persist, deliver, download, export, or invoke a
provider. These candidates execute no Phase 7 plan and earn no completion
credit.

## Progress

**Execution Order:** Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6 → Phase 7

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Private Pilot Boundary | 5/5 | Complete   | 2026-07-30 |
| 2. Consensus Knowledge and Commercial Model | 13/14 active | Plan 02-22 verified the greenfield local baseline; new Plan 02-99 preserves future greenfield target acceptance; original-target recovery plans are retired | - |
| 3. Product Readiness and Market Discovery | 8/11 | Local plans complete; blocked on Phase 2 acceptance and 03-09..11 external gates | - |
| 4. Profile Readiness and Evidence-Based Prospecting | 0/12 | Wave 1 underway; dependency-gated | - |
| 5. Controlled Enrichment and Verified Contacts | 0/9 | Planned; dependency-gated | - |
| 6. Governed Outreach and Suppression | 0/13 | Planned; dependency-gated | - |
| 7. Mining Pilot Handoff and Recovery | 0/10 | Planned; dependency-gated | - |
