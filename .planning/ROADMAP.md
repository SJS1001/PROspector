# Roadmap: PROspector

## Overview

PROspector moves from its narrow hosted interview proof to a safe private operating pilot through seven vertical delivery boundaries. The sequence first proves the owner-only workspace and provider-portability boundary, then completes confirmed commercial knowledge, Product discovery, Profile-specific prospecting, verified contacts, governed outreach, and finally CRM handoff plus clean recovery of the seeded ONE for Mining operation. Existing code is audited in the phase that owns its behavior; no phase starts as complete merely because a partial implementation exists.

**Granularity:** Standard (default; no project config was present)  
**Coverage:** 17/17 v1 requirements mapped exactly once

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): planned milestone work.
- Decimal phases (2.1, 2.2): urgent insertions added after planning.

- [ ] **Phase 1: Private Pilot Boundary** - The owner can access one isolated, auditable workspace while sensitive data and external effects remain fail-closed behind proven capability gates.
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
- [ ] `01-01-PLAN.md` — Create the failing single-owner, evidence-state, storage, and route contracts.
- [ ] `01-02-PLAN.md` — Enforce server-only single-owner admission before every interview operation.
- [ ] `01-03-PLAN.md` — Build the provider-neutral capability and object-storage proof core.
- [ ] `01-04-PLAN.md` — Wire secure capability APIs and the verified Pilot Status UI.
- [ ] `01-05-PLAN.md` — Deploy exact source and complete controlled hosted boundary proof.

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
**Plans**: TBD  
**UI hint**: yes

### Phase 3: Product Readiness and Market Discovery
**Goal**: The owner can make a Product Ready from complete confirmed policy and receive bounded, replayable Market Play proposals without activating prospecting.  
**Depends on**: Phase 2  
**Requirements**: REQ-product-readiness, REQ-market-discovery  
**Success Criteria** (what must be TRUE):
  1. The owner can see every unmet Product readiness item and cannot activate readiness until capability, limitation, delivery, proof, ownership, guardrail, source/discovery, and default-runner policy is confirmed.
  2. Product readiness atomically creates an immutable Product Discovery Configuration, queues exactly one initial discovery run, reveals manual discovery, and schedules monthly discovery even when no Play, Profile, or Offer exists.
  3. Monthly, manual, and material-change discovery each surface no more than three evidence-backed proposals that show the problem match, audience, likely buyer, examples, risks, and Product fit.
  4. The owner can Explore, Defer, or Dismiss a proposal with durable history and cooldown behavior; Explore opens a Draft Market Play interview and never makes a Profile Ready or starts prospecting.
**Plans**: TBD  
**UI hint**: yes

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
**Plans**: TBD  
**UI hint**: yes

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
**Plans**: TBD  
**UI hint**: yes

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
**Plans**: TBD  
**UI hint**: yes

### Phase 7: Mining Pilot Handoff and Recovery
**Goal**: The owner can operate the seeded ONE for Mining workflow through auditable CRM handoff and prove that the complete private workspace is portable and recoverable.  
**Depends on**: Phase 6  
**Requirements**: REQ-crm-and-workspace-exports, REQ-initial-operating-target  
**Success Criteria** (what must be TRUE):
  1. The owner can review the seeded `Digitalrain -> ONE -> ONE for Mining -> Operating` hierarchy with Greenfield remaining Draft/nurture and activate Operating weekdays at 06:00 America/Toronto only after its in-application readiness review.
  2. Morning Brief and Exports & History report the first transition of each Prospect to Export-ready within the Monday–Sunday America/Toronto week, target seven new Export-ready Prospects, and continue to show rejections, deferrals, enrichment failures, reversals, and review delays without weakening gates.
  3. CRM Handoff produces a CSV with one row per currently eligible Enriched Contact and a stable Prospect ID, so contact-row count remains distinct from the weekly Export-ready Prospect count.
  4. Recent owner reauthentication can create an audited, passphrase-encrypted, versioned workspace archive containing canonical records, content-addressed objects, decisions, history, and suppression/deletion tombstones without storing the passphrase.
  5. The owner can review a restore dry run and restore the archive into a clean compatible deployment with schedules and sending disabled; tampering, wrong passphrase, version skew, unauthorized access, and expired delivery fail closed before release.
**Plans**: TBD  
**UI hint**: yes

## Progress

**Execution Order:** Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6 → Phase 7

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Private Pilot Boundary | 2/5 | In Progress | - |
| 2. Consensus Knowledge and Commercial Model | 0/TBD | Not started | - |
| 3. Product Readiness and Market Discovery | 0/TBD | Not started | - |
| 4. Profile Readiness and Evidence-Based Prospecting | 0/TBD | Not started | - |
| 5. Controlled Enrichment and Verified Contacts | 0/TBD | Not started | - |
| 6. Governed Outreach and Suppression | 0/TBD | Not started | - |
| 7. Mining Pilot Handoff and Recovery | 0/TBD | Not started | - |
