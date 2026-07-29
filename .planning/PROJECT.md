# PROspector

## What This Is

PROspector is a private, human-governed prospecting workspace for an owner-operator. It learns a Company, its Products, and its Market Plays through a research-first Consensus Interview; runs evidence-based morning prospecting; suggests discovered market fit; and supports controlled contact, Gmail, manual-call, CSV, and workspace-export workflows without becoming a CRM or autonomous sender.

The first operating pilot is Digitalrain's ONE for Mining workflow. The product model remains generic so additional Products and Market Plays can be introduced without embedding Mining-specific assumptions.

## Core Value

The owner can turn explicitly confirmed commercial knowledge into evidence-backed, export-ready prospects and individually approved outreach without surrendering control of truth, spend, suppression, or external actions.

## Requirements

### Validated

None yet. The existing hosted implementation proves a narrow, low-sensitivity Consensus Interview lifecycle with authenticated D1 persistence, but no complete v1 requirement or Wave gate is treated as validated until its roadmap phase is verified.

### Active

- [ ] Operate one private, owner-only Company Workspace with isolation, audit, and human gates.
- [ ] Build confirmed commercial knowledge through a research-first, one-question-at-a-time Consensus Interview.
- [ ] Activate immutable Product and Customer Profile configurations only after complete readiness review.
- [ ] Discover Market Play opportunities and qualify prospects deterministically from cited evidence.
- [ ] Enrich contacts only under bounded spend authority and strict verification eligibility.
- [ ] Prepare and dispatch outreach only through immutable approvals and Company-wide suppression enforcement.
- [ ] Produce CRM CSV handoff and encrypted, clean-restorable Company Workspace exports.
- [ ] Run the seeded ONE for Mining Operating workflow toward seven new Export-ready Prospects per week without weakening quality gates.

See `.planning/REQUIREMENTS.md` for the 17 accepted, traceable v1 requirements.

### Out of Scope

- CRM opportunity, pipeline, forecast, proposal, contract, revenue, or customer management — PROspector ends at controlled outreach and CRM handoff.
- Shared or pooled prospect databases across Companies — each private deployment contains one isolated Company Workspace.
- Autonomous knowledge confirmation, spend authorization, prospect approval, or outreach sending — consequential authority remains with the operator.
- Contact scraping or promotion of generated, pattern-guessed, directory-only, or MX-only addresses — these remain ineligible Contact Suggestions.
- Automated dialling, recording, SMS, or calling — launch phone support is verified-number click-to-call with a package-derived script and manual outcome.
- A jurisdiction engine that represents legal approval — pilot compliance guidance is advisory while universal suppression and message controls are hard-enforced.
- Pilot invitations and multi-user collaboration — the initial operator is the owner; future invitation capability requires a separate authorized scope.
- Provider-specific domain coupling — Sites, D1, R2, Gmail, schedulers, runners, contact providers, and delivery services remain behind named ports.

## Context

- The repository is brownfield. Existing application code and a deployed private capability slice are partial progress, not proof of roadmap completion.
- Nineteen accepted planning documents were synthesized on 2026-07-29. The synthesis found five compatible locked ADRs, 17 requirements, 41 implementation constraints, and no unresolved conflicts.
- The current hosted slice permits one low-sensitivity historian data-readiness policy through separate Answer and Confirmation actions. Real leads, contacts, schedules, imports, exports, provider credentials, and outbound effects remain prohibited until their capability and release gates pass.
- Hosted owner identity, D1 query/persistence, and the approved interview lifecycle have evidence. R2 write/read/delete durability, a second real principal, scheduler and runner callback proof, controlled Google OAuth, and a clean export/restore drill remain evidence gaps.
- Initial migration seed: `Digitalrain -> ONE -> ONE for Mining -> Operating`; Greenfield remains Draft/nurture. Operating is intended to run weekdays at 06:00 America/Toronto.
- The accepted implementation contract and locked ADRs override legacy scripts, README behavior, fixtures, or apparent existing functionality.

## Constraints

- **Authority**: Trusted application code owns authorization, schemas, state transitions, readiness, qualification, budgets, approvals, suppression, audit, exports, and sends — runners and external content may propose data but cannot grant authority.
- **Pilot runtime**: Use a private Codex Site with D1 structured state and R2 objects behind provider-neutral ports — capability failure selects a compatible host without changing the domain model.
- **Identity and isolation**: Derive principal and workspace from trusted server identity; enforce route, row, and object authorization with negative cross-principal proof — client identifiers never confer authority.
- **Browser security**: Every mutation must fail closed on missing or conflicting session, Origin, Fetch Metadata, CSRF, OAuth state, or PKCE proof.
- **Data model**: Preserve `Company -> Product -> Market Play -> Customer Profile -> Offer`, Company-wide Organization/Contact identity, and Market Play-specific Account/Target/prospecting state.
- **Knowledge and configuration**: Confirmed Knowledge and activated typed configurations are immutable, versioned authority — uploads, edits, imports, research, and reuse create proposals.
- **External effects**: Paid work requires bounded, single-use authority; each Gmail message requires approval of its exact immutable digest; every final action recomputes current availability and suppression.
- **Safety gate**: No sensitive pilot data or broader external effects until the accepted release invariants and applicable Wave 0–3 gates are proven.
- **Portability**: Full Company Workspace Export must be authenticated, audited, encrypted, versioned, and restorable into a clean compatible deployment.
- **Repository hygiene**: Secrets and live operational data never enter Git; legacy operational artifacts enter only through authenticated, ignored uploads.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Use the generic Company → Product → Market Play → Customer Profile → Offer hierarchy with one Company Workspace per pilot Site. | Separates shared commercial truth from market-specific execution while preserving a reusable product model. | Locked — ADR-0001 |
| Treat structured Confirmed Knowledge and immutable typed Effective Configurations as authority. | Prevents research, edits, and drift from silently changing active behavior or history. | Locked — ADR-0002 |
| Treat AI Runners as untrusted, scoped contributors and keep consequential gates in application code. | Contains model/provider risk and preserves human authority over spend and outbound effects. | Locked — ADR-0003 |
| Run the pilot privately on Sites/D1/R2 behind provider-neutral ports, with workspace export as the exit boundary. | Enables a narrow pilot without accepting provider lock-in or weakening recovery. | Locked — ADR-0004 |
| Keep legal/compliance judgment advisory while hard-enforcing sender identity, unsubscribe, immutable approval, and Company-wide suppression. | Preserves operator accountability while preventing universally unacceptable outreach behavior. | Locked — ADR-0005 |
| Treat existing implementation as unverified partial progress. | The current capability report authorizes only one narrow policy lifecycle and explicitly blocks broader live operation. | Accepted at roadmap bootstrap |
| Use seven vertical, user-verifiable phases with single-phase requirement ownership. | The accepted requirements cluster into coherent operating workflows and fit standard roadmap granularity. | Accepted at roadmap bootstrap |

## Evolution

After each phase, move only verified requirements from Active to Validated, record material decisions, and update the current capability boundary. Do not infer completion from code presence, fixture behavior, or deployment availability; require the phase success criteria and applicable safety gates to pass.

---
*Last updated: 2026-07-29 after approved ingest synthesis and roadmap bootstrap*
