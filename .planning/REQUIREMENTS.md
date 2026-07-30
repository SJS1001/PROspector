# Requirements: PROspector

**Defined:** 2026-07-29  
**Core Value:** The owner can turn explicitly confirmed commercial knowledge into evidence-backed, export-ready prospects and individually approved outreach without surrendering control of truth, spend, suppression, or external actions.

## v1 Requirements

Requirements for the initial private operating pilot. Each requirement maps to exactly one roadmap phase.

### Product Boundary and Workspace

- [x] **REQ-private-human-governed-gtm**: The operator can use PROspector as a private, human-governed go-to-market workspace in which consequential knowledge and external actions require explicit confirmation, no workflow silently authorizes spend or outreach, and no CRM opportunity/revenue model is introduced.
- [x] **REQ-company-workspace-isolation**: The owner can operate exactly one isolated Company Workspace whose data is not pooled, whose pilot invitations are disabled, and whose history is auditable and exportable.

### Commercial Knowledge

- [ ] **REQ-commercial-hierarchy**: The operator can represent `Company -> Product -> Market Play -> Customer Profile -> Offer`, with Company-wide Organization/Contact identity and Market Play-specific Account, Target, relevance, evidence, qualification, and outreach state.
- [ ] **REQ-consensus-interview**: The operator can complete a research-first, one-question-at-a-time Consensus Interview that visibly separates evidence, inference, recommendation, and confirmed knowledge and records explicit confirmation, correction, rejection, or rescoping.
- [ ] **REQ-versioned-knowledge-and-drift**: The operator can review Proposed Knowledge and drift without mutating Confirmed Knowledge or active typed configurations in place; replacement activation preserves snapshots, invalidates affected approvals, and pauses only dependency-reached high-risk outbound.

### Product Discovery

- [ ] **REQ-product-readiness**: The operator can make a Product Ready only after confirming its complete capability, limitation, delivery, proof, ownership, guardrail, source/discovery, and runner policy; readiness creates an immutable Product Discovery Configuration and starts initial, manual, and monthly discovery without placeholder Plays, Profiles, or Offers.
- [ ] **REQ-market-discovery**: The operator can receive at most three bounded, evidence-backed Market Play proposals per monthly, manual, or material-change trigger and choose Explore, Defer, or Dismiss without automatically activating prospecting.

### Profile Prospecting

- [ ] **REQ-profile-readiness**: The operator can make a Customer Profile Ready only after confirming its complete fit, target, disqualifier, role, signal, geography/language, rubric, proof/guardrail, contact, outreach, schedule/timezone, compliance, and output policy; readiness creates an immutable Profile Effective Configuration and activates initial and recurring prospecting.
- [ ] **REQ-deterministic-qualification**: The operator can review qualification outcomes calculated by application code from cited observations under the exact Profile Effective Configuration, including the accepted Mining rubric, hard gates, explicit failure states, and reasoned Approve/Reject/Defer cooldown behavior.
- [ ] **REQ-evidence-provenance**: The operator can inspect every Signal's URL, source tier, publication/event dates, retrieval time, and supporting excerpt; Tier 3 evidence cannot qualify alone, discovery overlaps by 24 hours, and evidence older than 30 days is context unless reconfirmed.
- [ ] **REQ-untrusted-runner-boundary**: The operator can use replaceable AI Runners through short-lived, assignment-bound, revocable, quota-limited connections while every run records its provider/model, instructions, tools, configuration, sources, transformations, assignment, and grants and no credentials or silent failover enter PROspector.

### Contacts and Spend

- [ ] **REQ-controlled-enrichment**: The operator can authorize paid enrichment only with a single-use provider/prospect/unit/cost/expiry-bound grant and separately billed model work only within explicit per-run and monthly budgets; retry or failover never inherits spend authority.
- [ ] **REQ-contact-verification**: The operator can distinguish Contact Suggestions from eligible Enriched Contacts using recorded source, method, confidence, verification class, and freshness; generated, pattern-guessed, directory-only, or MX-only contact points cannot enter enrichment, export, approval, calling, or sending.

### Governed Outreach

- [ ] **REQ-immutable-outreach-approval**: The operator can separately approve an immutable Outreach Package and each exact Gmail message; final dispatch uses a send lease and rechecks digest, suppression, approval, entity/configuration state, drift, sender identity, and compliance acknowledgement, while replies and bounces stop applicable follow-ups.
- [ ] **REQ-hard-company-suppression**: The operator can create and audit Company-wide email, phone, Contact, Organization, or all-outreach suppression that is enforced transactionally at call/send time, includes sender identity and working unsubscribe controls, and survives deletion, import, export, merge, and restore.

### Handoff, Recovery, and Operating Target

- [ ] **REQ-crm-and-workspace-exports**: The owner can produce a CRM Handoff CSV with one row per eligible Enriched Contact and stable Prospect ID, and separately create an authenticated, audited, encrypted, versioned Company Workspace archive that restores cleanly into a compatible deployment.
- [ ] **REQ-initial-operating-target**: The operator can run the seeded `Digitalrain -> ONE -> ONE for Mining -> Operating` workflow weekdays at 06:00 America/Toronto, keep Greenfield Draft/nurture, and report seven newly Export-ready Prospects per Monday–Sunday week while showing all funnel losses and preserving every quality gate.

## v2 Requirements

### Future Collaboration and Policy

- Multi-user invitations and scoped roles within the same Company Workspace.
- Jurisdiction-specific blocking rules layered on top of the pilot's advisory compliance posture.
- Additional Product and Market Play operating seeds beyond ONE for Mining.

These items are acknowledged directions, not committed v1 scope. Promotion to v1 requires new accepted requirements and roadmap remapping.

## Out of Scope

| Feature | Reason |
|---------|--------|
| CRM opportunities, forecasts, proposals, contracts, revenue, or customer lifecycle | PROspector ends at limited outreach activity and CRM handoff. |
| Shared cross-Company prospect database | Conflicts with the locked one-workspace isolation model. |
| Autonomous sending, spend, readiness, or knowledge confirmation | Conflicts with human governance and immutable approval decisions. |
| Contact scraping or use of generated/MX-only addresses | Such points remain ineligible Contact Suggestions. |
| Dialer, call recording, SMS, or automated calling | Launch phone workflow is manual click-to-call only. |
| Representation of legal approval | Pilot compliance is advisory; the operator remains accountable. |
| Live operational data or effects before release gates pass | The accepted capability boundary prohibits them. |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| REQ-private-human-governed-gtm | Phase 1 | Complete |
| REQ-company-workspace-isolation | Phase 1 | Complete |
| REQ-commercial-hierarchy | Phase 2 | Pending |
| REQ-consensus-interview | Phase 2 | Pending |
| REQ-versioned-knowledge-and-drift | Phase 2 | Pending |
| REQ-product-readiness | Phase 3 | Pending |
| REQ-market-discovery | Phase 3 | Pending |
| REQ-profile-readiness | Phase 4 | Pending |
| REQ-deterministic-qualification | Phase 4 | Pending |
| REQ-evidence-provenance | Phase 4 | Pending |
| REQ-untrusted-runner-boundary | Phase 4 | Pending |
| REQ-controlled-enrichment | Phase 5 | Pending |
| REQ-contact-verification | Phase 5 | Pending |
| REQ-immutable-outreach-approval | Phase 6 | Pending |
| REQ-hard-company-suppression | Phase 6 | Pending |
| REQ-crm-and-workspace-exports | Phase 7 | Pending |
| REQ-initial-operating-target | Phase 7 | Pending |

**Coverage:**

- v1 requirements: 17 total
- Mapped to phases: 17
- Unmapped: 0 ✓
- Duplicate phase ownership: 0 ✓

---
*Requirements defined: 2026-07-29*  
*Last updated: 2026-07-29 after approved ingest synthesis and roadmap creation*
