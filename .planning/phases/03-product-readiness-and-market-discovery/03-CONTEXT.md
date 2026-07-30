# Phase 3: Product Readiness and Market Discovery - Context

**Gathered:** 2026-07-30  
**Status:** Ready for planning  
**Mode:** Autonomous synthesis of accepted Direction, implementation specification, ADRs, and Phase 2 authority decisions

<domain>
## Phase Boundary

Make a Product Ready only from complete Confirmed Knowledge, atomically create its immutable Product Discovery Configuration and product-level discovery work, and let the owner decide what to do with a bounded set of evidence-backed Market Play proposals. This phase does not create a Ready Profile, start prospecting, create Accounts/Targets/Prospects, collect contacts, spend money, or activate outbound work.

</domain>

<decisions>
## Implementation Decisions

### Readiness as a visible, fail-closed authority decision
- **D-01:** Calculate Product readiness as a pure, server-authoritative checklist that returns every missing item: capability, limitation, delivery, proof, ownership, claim guardrail, source policy, discovery policy, and default-runner policy. Fixture text, a client-side flag, or a merely Proposed Knowledge record can never satisfy an item.
- **D-02:** The Ready mutation must require the Product's expected revision and the exact Confirmed Knowledge/version set. It atomically records audit history, creates a canonical-digest immutable Product Discovery Configuration, creates/reuses exactly one `initial:product:{product_id}:{configuration_id}` discovery run, enables the manual control, and creates the monthly Product schedule. Retried/lost responses return the authoritative prior result; races yield one configuration/run/schedule.
- **D-03:** A Product may become Ready with zero Market Plays, Customer Profiles, or Offers. Phase 3 must not invent placeholders to satisfy readiness.
- **D-04:** Ready status does not authorize future operational effects. Paused, archived, stale, missing-gate, failed configuration, or authority-unknown states fail closed; an exhausted initial run is visible as `Needs attention` and never silently rolls back readiness or creates a second run.

### Replayable, bounded Product Market Discovery
- **D-05:** Every initial, monthly, manual, and material-change run is Product-scoped and pins the Product Discovery Configuration, runner/instruction/schema/tool policies, source and discovery policies, exact trigger, run window/watermark, and deterministic submission/result lineage. Historical results always replay their pinned snapshot rather than a current pointer.
- **D-06:** Discovery intake is untrusted. It accepts only bounded, schema-validated sourced findings through the application boundary; source text is data, not instructions. The application owns access, schedules, trigger idempotency, result caps, provenance validation, state transitions, and audit. No runner credential, provider credential, or silent provider fallback enters the product.
- **D-07:** Surface at most three proposals for each run, after server-side validation and ordering. Each proposal must show the problem match, audience/customer type, likely buyer, concrete examples, cited evidence, risks, Product fit, and collision/relationship to existing Plays. A partial or malformed response is authority-unknown, renders no action controls, and may be refreshed only with an explicit read.
- **D-08:** Fingerprint Product + market/audience + problem deterministically; retain immutable proposal versions, evidence lineage, and split/merge lineage. Duplicate/colliding proposals do not become a second accepted market merely by rediscovery.

### Owner review is a Market Play interview entry, not downstream activation
- **D-09:** The owner makes one immutable Explore, Defer, or Dismiss decision against the exact proposal revision/digest with a reason where required. Request idempotency and optimistic revisions ensure two tabs/retries create one authoritative decision and visible conflict/history.
- **D-10:** Explore creates or opens a Draft Market Play Consensus Interview from the scoped proposal snapshot. It never makes a Customer Profile Ready, queues prospecting, creates Accounts/Targets/Prospects, authorizes contact collection, or activates outbound work. Draft Play activation remains a separate later authority decision.
- **D-11:** Defer applies a 90-day cooldown; Dismiss applies a 180-day cooldown. A materially new, evidenced finding may reopen the exact fingerprint with explicit lineage; elapsed time, duplicated text, or a runner retry does not bypass cooldown.

### Authority gates carried forward
- **D-12:** Only the admitted owner and trusted server-derived workspace may read or mutate readiness/discovery state. Routes remain wiring-only and all consequential mutations require the existing same-origin, Fetch Metadata, CSRF, intent-header, bounded-body, and neutral-denial contracts.
- **D-13:** Product discovery is not permission for an external or paid effect. Its release/gate design must remain absent or fail closed until the relevant earlier hosted capability proofs, later runner/scheduler proof, explicit authority, and future phase conditions are accepted. Market-fit suggestions are Proposed/Draft work only, never accepted Customer Profile truth.

### Claude's Discretion
- Exact D1 normalization, module/file boundaries, UI component decomposition, schedule implementation, proposal ranking among equally valid items, pagination, and copy may follow established repository patterns only if the immutability, bounded-result, cooldown, audit, replay, and authority contracts above remain exact.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Product and discovery contract
- `docs/DIRECTION.md` §§ Readiness and automatic work; Discovery and qualification — Product checklist, zero-placeholder readiness, Product-level discovery triggers, maximum three proposals, and Explore/Defer/Dismiss boundary.
- `docs/IMPLEMENTATION-SPEC.md` §§ 4, 5, 7, 8, 15 — immutable Product Discovery Configuration, atomic readiness, job/schedule/watermark rules, hostile-source containment, and untrusted runner limits.
- `docs/IMPLEMENTATION-PLAN.md` § Slice 2.3 — proposal contents, immutable fingerprint/decision lineage, cooldowns, material-evidence reopen, and no-prospecting acceptance boundary.
- `.planning/REQUIREMENTS.md` §§ Product Discovery — accepted `REQ-product-readiness` and `REQ-market-discovery` wording and ownership.

### Authority and commercial model
- `docs/adr/0001-generic-company-product-play-model.md` — fixed hierarchy and Market Play scope boundary.
- `docs/adr/0002-confirmed-knowledge-and-effective-configuration.md` — Confirmed Knowledge authority and immutable Product Discovery Configuration.
- `docs/adr/0003-untrusted-runners-and-human-gates.md` — runner submission-only boundary and application-owned consequential authority.
- `docs/adr/0005-advisory-compliance-hard-suppression.md` — advisory compliance boundary; discovery does not represent legal approval.
- `.planning/phases/02-consensus-knowledge-and-commercial-model/02-CONTEXT.md` — Phase 2 immutable knowledge, concurrency, proposed/confirmed, drift, and replacement decisions that Phase 3 must consume rather than reinterpret.
- `.planning/phases/02-consensus-knowledge-and-commercial-model/02-PATTERNS.md` — admitted-principal, D1, immutable snapshot, idempotency, neutral-denial, and zero-effect test patterns.

### Pilot safety and evidence boundary
- `.planning/PROJECT.md` §§ Constraints and Context — current capability boundary, private pilot limits, and no automatic authority.
- `.planning/STATE.md` §§ Blockers/Concerns — unresolved hosted principal, scheduler/runner callback, and OAuth/export evidence gates that remain non-substitutable.
- `docs/WAVE-0-CAPABILITY-REPORT.md` — accepted capability evidence and release constraints; code presence is not credit for broader effects.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `site/domain/interview.ts` and `site/domain/interview-handler.ts` establish immutable reviewed snapshots, expected revisions, idempotency, trusted admission, bounded bodies, consumed CSRF, and neutral denial.
- `site/db/schema.ts`, existing D1 migrations, and Phase 2's planned D1 helper/test contracts establish additive relational constraints, transactions, audit records, and race testing.
- `site/app/prospector-app.tsx` and Phase 2 Knowledge workspace patterns establish authoritative projection loading, explicit authority-unknown handling, and disabled-effect surfaces.

### Established Patterns
- Domain functions receive admitted principals plus DB/port dependencies; route modules only inject provider bindings.
- A server-constructed immutable digest carries authority; client IDs select/retry a request but never grant scope.
- Consequential mutations pair a positive test with forbidden-operational-table zero-delta assertions.

### Integration Points
- Extend the Phase 2 commercial/knowledge authority and schema; do not create a parallel Product source of truth.
- Add a Product readiness and discovery projection/API/UI behind the existing owner admission and Phase 1 capability release boundary.
- Keep Profile readiness/prospecting and all contact, enrichment, export, and outbound tables/actions disabled/unwritten in Phase 3.

</code_context>

<specifics>
## Specific Ideas

- The Product-level seeded path is `Digitalrain -> ONE`; `ONE for Mining -> Operating` remains a Draft/nurture Market Play/Profile context until its own future readiness gates.
- Proposal cards should make evidence, inference, Product fit, collision risk, cooldown, and the distinction between “suggested market” and “accepted commercial profile” visually explicit.
- Manual discovery is visible only after Ready; monthly discovery exists even with no Plays, Profiles, or Offers.

</specifics>

<deferred>
## Deferred Ideas

- Activating a Customer Profile, profile schedule, untrusted runner assignment, Signals, Accounts, Targets, Candidates, deterministic qualification, and prospect review belong to Phase 4.
- Paid enrichment, verified contacts, Gmail, calling, suppression enforcement at an outbound boundary, CRM export, and workspace restore belong to Phases 5–7.
- Any discovered market-fit suggestion beyond the three-proposal bounded Product workflow remains Proposed/Draft context and is not an accepted customer profile or scope expansion.

</deferred>

---

*Phase: 03-product-readiness-and-market-discovery*  
*Context gathered: 2026-07-30*
