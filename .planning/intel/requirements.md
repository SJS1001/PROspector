# Synthesized Product Requirements

## REQ-private-human-governed-gtm

- source: /Users/stevensmith/Documents/PROspector/docs/DIRECTION.md
- scope: product boundary
- description: PROspector must be a private, human-governed go-to-market operating system, not a CRM, contact scraper, or autonomous sender.
- acceptance criteria:
  - The operator explicitly confirms consequential knowledge and external actions.
  - The application does not model opportunities, forecasts, contracts, revenue, or customers.
  - No workflow autonomously sends outreach or silently authorizes spend.

## REQ-company-workspace-isolation

- source: /Users/stevensmith/Documents/PROspector/docs/DIRECTION.md
- scope: Company Workspace
- description: Each private deployment must contain exactly one isolated Company Workspace.
- acceptance criteria:
  - Company data is not pooled into a shared prospect database.
  - The pilot is owner-only; future users can only be invited into that same Company.
  - Company Workspace data and history are auditable and exportable.

## REQ-commercial-hierarchy

- source: /Users/stevensmith/Documents/PROspector/docs/DIRECTION.md
- scope: Company, Product, Market Play, Customer Profile, Offer
- description: The product must represent the canonical commercial hierarchy and keep shared versus market-specific state correctly scoped.
- acceptance criteria:
  - The hierarchy is `Company -> Product -> Market Play -> Customer Profile -> Offer`.
  - Product owns core capability and claim guardrails; Play owns market context; Profile owns fit and execution policy; Offer is the concrete entry point.
  - Organization and Contact identity are Company-wide while Account, Target, relevance, qualification, and outreach are Market Play-specific.

## REQ-consensus-interview

- source: /Users/stevensmith/Documents/PROspector/docs/DIRECTION.md
- scope: Consensus Interview
- description: A new workspace must use a one-question-at-a-time interview that researches first and obtains explicit operator confirmation.
- acceptance criteria:
  - Evidence, inference, recommendation, and confirmed knowledge are visibly distinct.
  - Each question is decision-bearing and presented one at a time.
  - Operator confirmation, correction, rejection, or rescoping is explicit and auditable.

## REQ-versioned-knowledge-and-drift

- source: /Users/stevensmith/Documents/PROspector/docs/DIRECTION.md
- scope: Confirmed Knowledge, Proposed Knowledge, Knowledge Drift
- description: Confirmed Knowledge must remain authoritative and immutable through versioned changes and dependency-scoped drift handling.
- acceptance criteria:
  - Uploads, edits, and research create Proposed Knowledge rather than changing active behavior.
  - Active typed configurations are never mutated in place.
  - High-risk drift pauses only outbound artifacts whose dependency graph reaches the challenged knowledge.
  - Activation of a replacement configuration preserves historical snapshots and invalidates affected approvals.

## REQ-product-readiness

- source: /Users/stevensmith/Documents/PROspector/docs/DIRECTION.md
- scope: Product readiness
- description: Product readiness must require complete confirmed Product policy and create an immutable Product Discovery Configuration.
- acceptance criteria:
  - Capability, limitation, delivery, proof, ownership, guardrails, source/discovery policy, and default runner are confirmed.
  - Readiness starts an initial Market Discovery Run, exposes manual discovery, and schedules monthly discovery.
  - Product readiness requires no placeholder Market Play, Profile, or Offer.

## REQ-profile-readiness

- source: /Users/stevensmith/Documents/PROspector/docs/DIRECTION.md
- scope: Customer Profile readiness
- description: Profile readiness must require the complete fit, evidence, scoring, contact, outreach, schedule, and compliance contract.
- acceptance criteria:
  - Product/Offer, fit, target, disqualifiers, roles, signals, geography/language, rubric, proof/guardrails, strategies, schedule/timezone, and target are confirmed.
  - Readiness creates an immutable Profile Effective Configuration.
  - The first Prospecting Run and recurring schedule start only after readiness; draft controls remain hidden.

## REQ-market-discovery

- source: /Users/stevensmith/Documents/PROspector/docs/DIRECTION.md
- scope: Product-level Market Discovery
- description: Market Discovery must produce bounded, evidence-backed Market Play proposals without activating prospecting.
- acceptance criteria:
  - Runs occur monthly, on demand, and after material Product change.
  - Each trigger surfaces at most three proposals with evidence, audience, buyer, examples, risks, and Product fit.
  - Explore creates a Draft Play interview; Defer and Dismiss preserve their decisions; none automatically activates a Profile.

## REQ-deterministic-qualification

- source: /Users/stevensmith/Documents/PROspector/docs/DIRECTION.md
- scope: Prospecting and qualification
- description: Prospect qualification must be deterministic under the exact Profile Effective Configuration.
- acceptance criteria:
  - AI supplies cited observations only; application code validates sources, hard gates, scores, and explanations.
  - The Mining Operating rubric has five 0–2 dimensions, passes at 7/10, requires non-zero pain and timing, and fails on any hard disqualifier.
  - Review outcomes are Approve, Reject, or Defer with a reason and defined cooldown/re-entry behavior.

## REQ-evidence-provenance

- source: /Users/stevensmith/Documents/PROspector/docs/DIRECTION.md
- scope: Signals and evidence
- description: Every Signal must preserve sufficient provenance, source tier, timing, and excerpt evidence.
- acceptance criteria:
  - Store URL, tier, publication/event dates, retrieval time, and supporting excerpt.
  - Tier 3 evidence cannot qualify a Prospect alone.
  - Normal discovery overlaps by 24 hours and evidence older than 30 days is context unless reconfirmed.

## REQ-controlled-enrichment

- source: /Users/stevensmith/Documents/PROspector/docs/DIRECTION.md
- scope: contact enrichment and spend
- description: Paid enrichment and separately billed model work must require explicit bounded authority.
- acceptance criteria:
  - Paid enrichment uses a single-use provider/prospect/unit/cost/expiry-bound grant.
  - Separately billed AI work has owner-approved per-run and monthly monetary budgets.
  - Retry or provider failover never inherits spend authority silently.

## REQ-contact-verification

- source: /Users/stevensmith/Documents/PROspector/docs/DIRECTION.md
- scope: Contacts and CRM eligibility
- description: Suggested or MX-only contact points must remain ineligible for enrichment, export, approval, or sending.
- acceptance criteria:
  - Generated, pattern-guessed, and MX-only addresses remain Contact Suggestions.
  - Eligible contact points record source, method, confidence, and verification time.
  - Only provider/mailbox-level or authoritative source-verified business addresses become Enriched Contacts.

## REQ-immutable-outreach-approval

- source: /Users/stevensmith/Documents/PROspector/docs/DIRECTION.md
- scope: Outreach Packages, Gmail, messages
- description: Outreach Packages and individual messages must use separate immutable approvals with final send-boundary checks.
- acceptance criteria:
  - Package approval does not approve a message.
  - Message approval binds sender, recipients, subject, body, links, attachments, thread, and scheduled time; any change invalidates it.
  - Final Gmail dispatch rechecks digest, suppression, approval, entity state, drift, and compliance acknowledgement under a send lease.
  - Replies, bounces, suppression, and pause cancel applicable follow-ups.

## REQ-hard-company-suppression

- source: /Users/stevensmith/Documents/PROspector/docs/DIRECTION.md
- scope: suppression and compliance
- description: Suppression must be a hard Company-wide prohibition despite the pilot's advisory legal posture.
- acceptance criteria:
  - Exact email, phone, Contact, and Organization suppression is checked at send time.
  - Sender identity, working unsubscribe, immutable approval, evidence retention, and explicit advisory wording are enforced.
  - Suppression tombstones survive record deletion, import, export, and restore.

## REQ-crm-and-workspace-exports

- source: /Users/stevensmith/Documents/PROspector/docs/DIRECTION.md
- scope: CRM Handoff and Company Workspace Export
- description: CRM Handoff and full workspace portability must remain distinct export products.
- acceptance criteria:
  - CRM Handoff is a CSV with one row per eligible Enriched Contact and stable Prospect ID.
  - Workspace Export is authenticated, auditable, encrypted, versioned, and restorable.
  - A clean-deployment restore is a release gate.

## REQ-untrusted-runner-boundary

- source: /Users/stevensmith/Documents/PROspector/docs/DIRECTION.md
- scope: AI Runners
- description: AI Runners must be replaceable, untrusted, assignment-scoped contributors.
- acceptance criteria:
  - Every run records provider/model, instructions, tools, configuration, sources, transformations, assignment, and grants.
  - Runner Connections are short-lived, scoped, revocable, quota-bound, and append-only for submissions.
  - There is no silent provider failover, and credentials are never pasted into or stored by PROspector.

## REQ-initial-operating-target

- source: /Users/stevensmith/Documents/PROspector/docs/DIRECTION.md
- scope: ONE for Mining Operating pilot
- description: Seed the initial operating workflow without weakening quality gates to meet an outcome target.
- acceptance criteria:
  - Seed hierarchy is Digitalrain -> ONE -> ONE for Mining -> Operating; Greenfield remains Draft/nurture.
  - Operating runs weekdays at 06:00 America/Toronto.
  - Report seven newly Export-ready Prospects per Monday–Sunday week while preserving visible funnel losses and all quality gates.
