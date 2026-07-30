# PROspector Product Direction

Status: Accepted for implementation

Decision date: 2026-07-29

## Product promise

PROspector is a private, human-governed go-to-market operating system. It learns what a Company sells, helps the operator reach explicit agreement about the customers worth pursuing, finds evidence-backed prospects, and prepares controlled outreach. It is not a CRM, a contact scraper, or an autonomous sender.

The first pilot migrates Digitalrain's ONE for Mining work, but the product and data model are generic. ONE for Marine and future markets become separate Market Plays when they share ONE's core capability and roadmap; they become separate Products only when the capability, delivery model, roadmap, or commercial identity materially diverges.

## Product principles

1. Research facts before asking the operator.
2. Ask one decision-bearing question at a time.
3. Separate evidence, inference, proposal, and confirmed knowledge.
4. Never silently change confirmed knowledge or active outbound.
5. Scope knowledge to Company, Product, or Market Play and promote it only with confirmation.
6. Keep each Customer Profile's evidence, score, schedule, contacts, and outreach independent.
7. Treat AI Runners and all retrieved content as untrusted contributors, never as the system of record.
8. Require explicit operator approval for paid enrichment and each exact outbound message.
9. Make every consequential action explainable, auditable, exportable, and reversible where possible.
10. Prefer a portable pilot architecture over provider lock-in.

## Company and product structure

One private deployment contains exactly one Company Workspace. It is owner-only for the pilot and can later invite users into that same Company. Company data is never pooled into a shared prospect database.

The commercial hierarchy is:

`Company -> Product -> Market Play -> Customer Profile -> Offer`

- Product owns core capabilities, limitations, delivery, proof, ownership, and claim guardrails.
- Market Play owns a distinct market, problem set, audience, language, evidence rules, and offers.
- Customer Profile owns fit, disqualifiers, pains, roles, source hierarchy, qualification rubric, contact strategy, outreach strategy, schedule, timezone, and output target.
- Offer is the concrete entry point a profile is being qualified for.

An Organization has one identity within a Company. An Account is that Organization viewed through one Market Play. A Target is the site, project, fleet, business unit, or other operational unit to which the offer applies. Contact identity is Company-wide; relevance and outreach are Market Play-specific.

## Consensus Interview and knowledge

A new workspace opens into a one-question-at-a-time Consensus Interview. The interview researches public and uploaded material first, labels evidence and inference, recommends a choice when judgment is required, and asks the operator to confirm the decision.

Structured Confirmed Knowledge is authoritative. Human-readable Knowledge Documents are generated, versioned projections of that state. New uploads and edits create Proposed Knowledge. Differences from confirmed state create Knowledge Drift, which the operator accepts, rejects, corrects, or rescopes.

High-risk Drift challenges a capability, proof point, claim guardrail, offer, or suppression. It pauses only outbound artifacts that depend on the challenged knowledge. The dependency is explicit: source -> knowledge version -> typed configuration -> outreach artifact.

Accepting a change against a Ready Product/Profile does not mutate its active configuration. PROspector shows an impact preview, creates the applicable replacement Product Discovery or Profile Effective Configuration, and asks the operator to activate it. Activation rolls future schedules to the new configuration, lets already-submitted results finish only as historical proposals, requalifies unreviewed Prospects where applicable, invalidates dependent Outreach Packages/messages, and leaves contacted/exported history on its original configuration. High-risk outbound stays paused until the replacement configuration and affected artifacts are explicitly reactivated.

Reuse follows this order:

1. confirmed knowledge from the same Company;
2. an explicitly authorized Reusable Knowledge Package;
3. public templates and research;
4. a new operator question.

Every reuse is a suggestion requiring destination confirmation. Cross-Company packages use a positive allowlist, retain provenance and licensing, and exclude contacts, prospects, outreach, suppression, secrets, and unapproved private sources.

## Readiness and automatic work

A Product becomes Ready only after the operator confirms its capabilities, limitations, delivery, proof, ownership, claim guardrails, source policy, discovery policy, and default runner. Readiness creates a Product Discovery Configuration, starts the first Market Discovery Run, reveals a manual Discover Markets control, and schedules monthly discovery. It requires no placeholder Market Play, Profile, or Offer.

A Customer Profile becomes Ready only after the operator confirms:

- Product and Offer;
- account fit, target definition, and hard disqualifiers;
- pains, desired outcomes, buyer, champion, and validator roles;
- qualifying signals, recency, and source hierarchy;
- geography, language, and compliance posture;
- a complete scoring rubric and pass rule;
- proof and claim guardrails;
- contact and outreach strategies;
- schedule, timezone, and output target.

Profile readiness creates an immutable Profile Effective Configuration. The first Prospecting Run starts immediately, the Find Prospects control becomes visible, and the profile's schedule is activated. Draft controls remain hidden.

## Discovery and qualification

Market Discovery is a Product-level workflow governed by a Product Discovery Configuration. It runs monthly, on demand, and after a material Product change. Every run, regardless of trigger, produces at most three Market Play Proposals. Each proposal states the problem match, evidence, customer type, examples, likely buyer, risks, and Product fit. The operator chooses Explore, Defer, or Dismiss. Explore starts a Draft Play interview; a separate activation decision is required before Profile readiness and it never activates prospecting automatically.

Prospecting is Customer Profile-specific. Its lifecycle is:

`Signal -> Candidate Account -> Qualified Prospect -> Approved Prospect -> Enriched Contact -> Outreach Package -> CRM Handoff`

Qualification is deterministic under the Profile Effective Configuration. AI may extract evidence and suggest mappings; application code validates sources, applies hard gates, calculates the score, and records the explanation.

The initial ONE for Mining Operating profile uses five 0-2 dimensions: account fit, pain strength, timing/urgency, data readiness, and commercial viability. It passes at 7/10 only when pain and timing are both non-zero and no hard disqualifier applies. Exact scoring anchors are defined in the migration manifest before activation.

Review decisions are Approve, Reject, or Defer and require a reason. The same signal is never duplicated. A rejected prospect cools for 90 days unless a Material Signal appears. A deferred prospect returns on its review date or a Material Signal. An Export-ready Prospect is suppressed from rediscovery unless a distinct Target or opportunity appears.

## Evidence

Every Signal stores its source URL, source tier, publication date, event date when known, retrieval time, and a short supporting excerpt. Tier 1 is the organization, owner, regulator, or formal filing. Tier 2 is reputable trade or business reporting. Tier 3 is an aggregator, social post, or forum. Tier 3 cannot qualify a prospect by itself.

Normal discovery covers the period since the last successful run with a 24-hour overlap. A Signal normally must be current or reconfirmed within 30 days; older material is Account Context only.

## Human control, contacts, and outreach

Paid enrichment requires a single-use approval grant bound to provider, prospect set, maximum units/cost, and expiry. The initial Mining budget is two paid reveals per approved prospect: champion and economic buyer. Additional spend requires new approval.

Subscription-backed AI work may run within the externally configured subscription limits. Any AI Runner that creates separately billed API usage requires an owner-approved per-run and monthly monetary budget before automatic or manual work starts. Retry and failover never inherit spend authority silently.

Generated or pattern-guessed email addresses and MX-only checks remain Contact Suggestions. They cannot become Enriched Contacts, appear in CRM Handoff, be approved for sending, or be sent. Every verified contact point records source, method, confidence, and verification time. Provider/mailbox-level or source-verified business addresses are eligible.

Gmail is the only launch sender. Outreach Packages have their own immutable operator approval before CRM Handoff; approving a package does not approve any message. Each message approval binds an immutable message version: sender, recipient, subject, body, links, attachments, thread, and scheduled time. Any change invalidates approval. At final provider dispatch, the application holds a short send lease and rechecks message digest, suppression, approval expiry, entity state, high-risk drift, and compliance acknowledgement. Suppression, pause, archive, or drift also cancels matching pending outbox items.

Gmail sync is limited to PROspector-originated threads and records delivery, replies, and bounces. Reply, bounce, or suppression stops pending follow-up. Phone support is manual: verified business number, click-to-call, a script derived from the Outreach Package, and manual outcome/notes. There is no dialer, recording, SMS, or automated calling.

Suppression is a hard Company-wide prohibition. Normalized email addresses and phone numbers, Contact identities, and Organization-wide prohibitions are checked at send time. Suppression tombstones survive record deletion, import, export, and restore.

## Compliance posture

PROspector is not legal counsel. The operator explicitly chose an advisory compliance model for the pilot rather than a jurisdiction engine that independently decides legality. The application records recipient jurisdiction, claimed lawful basis or consent basis, sender identity, unsubscribe capability, operator acknowledgement, and source evidence. It warns when these are absent or inconsistent.

The following remain hard product controls regardless of that advisory posture:

- no contact after an explicit opt-out or do-not-call request;
- sender identity and a working unsubscribe path on outbound email;
- immutable per-message approval and an immediate send-time suppression check;
- retention of the operator's decision and the evidence presented;
- no representation that PROspector has supplied legal approval.

This is a consciously accepted risk and replaces the legacy Mining README's broader, ambiguous “honor” rule. A future Compliance Policy module may add jurisdiction-specific blocking rules without changing the core lifecycle.

## Exports and CRM boundary

PROspector records limited outreach activity, not opportunities, forecasts, proposals, contracts, revenue, or customers.

CRM Handoff is CSV for launch. It has one row per Enriched Contact and a stable Prospect ID, so seven Export-ready Prospects may produce more than seven rows.

Company Workspace Export is separate: an authenticated, auditable, encrypted, versioned, restorable archive of structured data, documents, objects, decisions, history, suppression tombstones, and manifests. Restore into a clean compatible deployment is a release gate.

## AI Runners

The pilot uses the operator's Codex subscription for interactive build work and eligible Codex scheduled tasks. Independently hosted model calls require provider API billing. The settings surface distinguishes subscription connections from API keys. Subscription credentials are configured outside PROspector and are never pasted or stored. API keys live only in protected hosting secrets.

Each Product and Customer Profile chooses a default AI Runner. Every run records provider, model, instruction version, tool configuration, typed configuration, sources, transformations, assignment, and approval grants. There is no silent failover. A retry with another provider is explicit and labelled.

Runner Connections are short-lived, assignment-bound, scoped, revocable credentials. They expose only minimized confirmed context, accept append-only sourced submissions, and enforce audience, expiry, nonce, idempotency, state transitions, quotas, and size limits. Retrieved text and runner output are untrusted and sanitized before storage or display.

## Pilot architecture

The pilot is a private Codex Site with server-rendered authorization, D1 for structured operational state, and R2 for documents and export artifacts. Secrets and live operational data never enter Git. The repository holds application code, schemas, templates, migrations, tests, and non-sensitive product documentation.

Provider-specific code sits behind ports for identity, storage, objects, scheduling, model runners, contact enrichment, Gmail, and export delivery. A capability spike must prove the required Sites features before the pilot imports sensitive operational data. Full workspace export is the portability boundary.

## Initial experience

The application has six primary surfaces:

1. Morning Brief
2. Knowledge
3. Market Discovery
4. Review Queue
5. Prospect Workspace
6. Exports & History

A new deployment starts in the Consensus Interview. An established deployment starts in Morning Brief. Controls appear only when the governing Product or Customer Profile is Ready.

## Initial operating target

The migration seed is Digitalrain -> ONE -> ONE for Mining -> Operating. Greenfield remains Draft/nurture. The Operating profile runs weekdays at 06:00 America/Toronto. Discovery is paced to keep enough Qualified Prospects in review; the operator's outcome goal is seven newly Export-ready Prospects per Monday-Sunday week in America/Toronto. Rejections, deferrals, enrichment failures, and review delays remain visible funnel losses and never weaken quality gates or get silently counted as Export-ready.
