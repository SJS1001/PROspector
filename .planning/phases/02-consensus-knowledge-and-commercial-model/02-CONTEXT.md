# Phase 2: Consensus Knowledge and Commercial Model - Context

**Gathered:** 2026-07-30
**Status:** Ready for planning
**Mode:** Autonomous synthesis of previously accepted Direction, implementation specification, ADR-0001, and ADR-0002

<domain>
## Phase Boundary

Deliver the authoritative commercial hierarchy and the complete research-first Consensus Interview/knowledge-drift workflow. This phase owns Company, Product, Market Play, Customer Profile, Offer, Company-wide Organization/Contact identity, scoped commercial relationships, Proposed and Confirmed Knowledge, immutable decisions, replacement configuration impact, and concurrency-safe interview behavior. It does not activate Product discovery, prospecting, enrichment, Gmail, calling, exports, or external Runner work.

</domain>

<decisions>
## Implementation Decisions

### Commercial Hierarchy and Scope
- Preserve `Company -> Product -> Market Play -> Customer Profile -> Offer` exactly.
- Product owns reusable capability, limitation, delivery, proof, ownership, and claim-guardrail truth; Market Play owns market/problem/audience/language/evidence/offer context; Customer Profile owns fit, disqualifiers, roles, signals, rubric, proof/contact/outreach policy, schedule, timezone, and output target.
- Organization and Contact identities are unique Company-wide. Account, Target, relevance, evidence, qualification, and outreach associations are Market Play/Profile scoped.
- ONE for Mining and ONE for Marine are separate Market Plays while they share ONE's capability/delivery/roadmap; divergence in those fundamentals requires a separate Product.

### Consensus Interview and Concurrency
- Research public and uploaded material before asking; present one decision-bearing question at a time with facts and source references, labelled inference, a recommendation, and prerequisite knowledge versions.
- Answer submission and confirmation remain separate immutable steps. Confirmation actions are Accept, Reject, Correct, and Rescope against exact answer/proposal/prerequisite digests.
- At most one Active question exists per session. Expected revisions, idempotency keys, immutable snapshots, and transactional uniqueness make reloads/retries converge and make stale or concurrent conflicts visible.
- Accept, Correct, and Rescope append Knowledge Versions; no action overwrites confirmed truth. Superseded questions and unconfirmed answers retain lineage and audit history.

### Proposed Knowledge, Imports, and Reuse
- Uploads, imports, research, edits, and reusable knowledge always enter as Proposed Knowledge with provenance, source/custody, privacy, licensing, and destination scope.
- Proposal review and promotion are separate owner actions. Phase 2 promotion may create knowledge/hierarchy authority only; it cannot create Runs, Accounts, Signals, Contacts, Candidates, or Prospects.
- Reuse order is same-Company confirmed knowledge, same-Product knowledge, then explicitly allowlisted cross-Company packages. Every destination requires confirmation.
- Cross-Company reuse excludes contacts, prospects, outreach, suppression, secrets, and unapproved private sources and preserves provenance/licensing.

### Drift and Replacement Authority
- Differences from confirmed state create Knowledge Drift with an explicit dependency graph: source -> knowledge version -> typed configuration -> affected artifact.
- High-risk drift covers capability, proof point, claim guardrail, offer, or suppression and pauses only dependency-reached outbound artifacts.
- Accepted changes to Ready entities never mutate active configurations. The owner receives an impact preview and activates an immutable replacement in a separate transaction.
- Replacement activation preserves history, rolls future schedules, keeps in-flight results as historical proposals, requalifies only affected unreviewed prospects, invalidates dependent approvals/packages/messages, and requires explicit reactivation where necessary.

### Claude's Discretion
- Exact table normalization, repository module boundaries, UI component decomposition, pagination, and copy may follow current D1/React patterns as long as the locked state, scope, audit, concurrency, and authority contracts remain exact.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `site/domain/interview.ts` already implements owner-scoped sessions, immutable question snapshots, answer/confirmation separation, idempotency, conflict handling, and legacy review quarantine.
- `site/domain/interview-handler.ts` supplies trusted admission, bounded JSON, one-time cookie mutation protection, and neutral denial.
- `site/db/schema.ts` and four migrations establish D1/Drizzle conventions for immutable IDs, revisions, audit events, and unique owner/workspace relationships.
- `site/app/prospector-app.tsx` contains the initial Consensus Interview surface and the disabled generic Company/Product/Play/Profile shell.

### Established Patterns
- Domain functions receive admitted principals and database/port dependencies; route files contain provider wiring only.
- Immutable records plus append-only audit events carry authority; projections never infer authority from bindings or fixture state.
- Consequential mutations require same-origin metadata, an intent header, bounded JSON, and a consumed one-time HttpOnly cookie.
- IDs and deterministic operation digests are server-derived; client identifiers never grant workspace scope.

### Integration Points
- Extend D1 schema/migrations and `site/domain/interview.ts` rather than creating a parallel persistence model.
- Extend `/api/interview` or add narrowly-scoped knowledge/hierarchy APIs through injected domain handlers and `getChatGPTUser` admission.
- Replace fixture hierarchy/knowledge panels in `ProspectorApp` only with admitted D1 projections; broader operational controls remain disabled.
- Feed future Phase 3 readiness exclusively from Confirmed Knowledge and immutable typed configuration outputs created here.

</code_context>

<specifics>
## Specific Ideas

- The initial Company/Product/Play/Profile seed is `Digitalrain -> ONE -> ONE for Mining -> Operating`; Greenfield remains Draft/nurture.
- Preserve the already-confirmed historian data-readiness policy and its legacy quarantine/audit lineage while evolving the generic model.
- The UI should make evidence, inference, recommendation, proposed knowledge, confirmed knowledge, drift risk, dependency impact, and required owner action visually distinct.

</specifics>

<deferred>
## Deferred Ideas

- Product readiness and Market Discovery activation belong to Phase 3.
- Profile readiness, schedules, Runner assignments, evidence qualification, and Accounts/Prospects belong to Phase 4.
- Contact enrichment, outbound, suppression, CSV handoff, and workspace restore remain in Phases 5–7.

</deferred>
