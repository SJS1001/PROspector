# Phase 5: Controlled Enrichment and Verified Contacts - Context

**Gathered:** 2026-07-30
**Status:** Ready for planning
**Mode:** Autonomous smart-discuss synthesis of accepted Direction, ADRs, specification, roadmap, and Phase 1/2 planning contracts

<domain>
## Phase Boundary

Turn an **Approved** Phase 4 Prospect into a current `ContactReady` projection only when it has at least one fresh, eligible business contact point. Phase 5 owns the provider-neutral enrichment request/grant/reservation/reconciliation boundary; immutable contact-point provenance and verification; Contact Strategy freshness; identity merge/split review; and owner-facing review of authority and results. It does not activate a provider, add packages, spend money, scrape, send, call, export, create outreach packages, or manage suppression. Later Phase 6/7 boundaries consume Phase 5 eligibility and must recheck it.
</domain>

<decisions>
## Locked Implementation Decisions

### Provider-neutral, fail-closed authority

- A contact-provider port is injected at the boundary; domain records never embed a provider SDK, credential, endpoint, or provider-specific state as authority.
- Before a paid call, the owner creates an immutable, random-nonce, **single-use** enrichment grant binding exact provider identity/version, approved Prospect IDs, permitted operation, maximum units, maximum monetary cost and currency, expiry, owner, and operation key. A grant is not a generic wallet or retry permission.
- In one durable transaction, validate admitted owner/workspace scope, current Prospect approval/effective configuration, grant fields/expiry/reuse, non-expired versioned quote/catalog, matching currency, and profile/workspace/provider budget; reserve worst-case units and cost under a unique operation key. Commit before calling the port.
- Missing, stale, mismatched, already-consumed, unbounded, over-unit, over-cost, currency-mismatched, stale-price, non-approved, or over-budget authority results in **zero provider calls** and an auditable blocked outcome. The adapter cannot decide to call anyway.
- Settlement records actual documented billable units/cost; unused reservation is released. Timeout, ambiguous acceptance, or uncertain charge remains reserved and `NeedsReconciliation`; it is never retried, switched to another provider, or silently extended. Partial results settle only documented billable units.
- Separately billed Runner work uses its own immutable provider/model/catalog/scope/per-run/monthly/currency/expiry/retry grant and reservation. It cannot borrow a paid-enrichment grant or budget, and enrichment cannot borrow Runner authority.

### Verification, provenance, and freshness

- A `contact_point` is immutable evidence-bearing data associated with a Company-wide Contact and normalized email or E.164 business phone. Preserve source/excerpt/object reference and content hash, retrieval/verification time, method, provider/catalog version where relevant, confidence, class, and lineage; confidence never overrides class.
- Classes are exactly `suggested`, `domain_valid`, `mailbox_verified`, `source_verified`, and `invalid`. Generated, inferred/pattern-guessed, directory-only, domain-valid, and MX-only observations are visibly labelled **Contact Suggestion** and stay ineligible.
- Only `mailbox_verified` and `source_verified` points can form an Enriched Contact/current `ContactReady` projection. `source_verified` means the exact business point is published by an authoritative source and reconfirmed; `mailbox_verified` means mailbox-level verification. A phone is eligible only as a verified business phone with its method/evidence.
- Contact Strategy is a versioned Profile configuration dependency, with defaults: mailbox-verified email 30 days; source-verified email 90 days; verified business phone 90 days. At expiry or invalidation, retain history but project the point as a Contact Suggestion and the Prospect as `NeedsReview` until reconfirmed.
- Freshness is re-evaluated at package approval, CRM export, click-to-call, and final send. These are downstream rechecks, not authority Phase 5 grants.

### Identity, relevance, and downstream containment

- Contact and Organization identity remain Company-wide; relevance, Accounts, Targets, evidence, qualification, and outreach associations remain Market Play/Profile scoped. A domain or matching name does not prove identity.
- Ambiguous matches create owner-reviewable merge or split **suggestions**, never automatic consolidation. A decision transaction preserves every source/lineage item, re-points scoped associations, and unions/retains every existing suppression subject for Phase 6 enforcement.
- Existing approvals/packages/export eligibility are projections, not overwritten state. Identity merge/split, contact invalidity/expiry, configuration/drift, suppression, or a new disqualifier makes affected downstream eligibility `NeedsReview`/`NonContactable` and invalidates dependent artifacts without deleting history.

### Operator experience

- The owner sees a distinct, read-first control surface: eligible vs suggestion/ineligible contact state; exact provenance/method/class/confidence/time; freshness countdown; identity ambiguity; grant scope/quote/budget reservation/settlement; and a precise blocked reason. Disabled controls explain the missing prerequisite without implying permission.
- No UI action gives authority by inference. Creating a grant and executing a granted operation are separate, explicit owner actions; result ingestion is defensive and never promotes a suggestion based on an adapter assertion alone.

### Claude's discretion

- Exact schema/table names, port interface shape, component decomposition, pagination, and neutral copy may follow the Phase 1/2 D1/React patterns, provided the immutable authority, transaction, provenance, scope, freshness, and zero-call invariants remain exact.
</decisions>

<upstream_inputs>
## Exact Required Upstream Inputs for Later Planning

Phase 5 must consume—not recreate—the following authoritative Phase 3/4 outputs. If any are absent, stale, cross-workspace, or not current, all mutation/provider paths fail closed.

| Upstream phase | Required input | Why Phase 5 needs it |
|---|---|---|
| 3 | Product/Market Play confirmed knowledge and active immutable configuration dependencies | validates current availability and later invalidates eligibility on material drift; no enrichment against draft/unavailable commercial authority |
| 4 | Owner `Approved` review decision for the exact Prospect, plus current Prospect/Profile/Account/Target IDs | narrows grants and prevents enrichment of candidates, qualified-but-unapproved, rejected, deferred, or cross-scope prospects |
| 4 | Immutable `profile_effective_config` ID/digest, including Contact Strategy, source/discovery policy, runner policy, geography/language, and claim/guardrail dependencies | governs contact eligibility/freshness and proves which policy authorized the operation |
| 4 | Reproducible qualification and cited Signal/source/excerpt lineage, source tiers/independence, scores, hard-gate result, and effective availability projection | preserves why the Prospect is approved and allows contact/package provenance to be replayed |
| 4 | Company-wide Organization/Contact identity records, aliases/merge lineage, scoped Account/Target/contact-relevance associations, and any unresolved identity proposals | attaches contacts correctly without treating domain/name hints as identity proof; supports merge/split review |
| 4 | Current lifecycle, cooldown, disqualifier, drift/suspension, and audit history | projects `NeedsReview` correctly and prevents a historical approval from authorizing a new provider effect |

Phase 4 must not supply credentials, provider authorization, contact verification assertions without evidence, suppression authorization, package/message approval, export authority, or a claim that an ordinary transition authorizes an external effect.
</upstream_inputs>

<canonical_refs>
## Canonical Refs

- `docs/DIRECTION.md`
- `docs/IMPLEMENTATION-SPEC.md` (sections 3, 10, 11, 14, 15, and release invariants)
- `docs/IMPLEMENTATION-PLAN.md` (Wave 2/3, especially Slices 2.5 and 3.1)
- `docs/adr/0001-generic-company-product-play-model.md`
- `docs/adr/0002-confirmed-knowledge-and-effective-configuration.md`
- `docs/adr/0003-untrusted-runners-and-human-gates.md`
- `docs/adr/0005-advisory-compliance-hard-suppression.md`
- `docs/MIGRATION-ONE-MINING.md`
- `.planning/ROADMAP.md`
- `.planning/REQUIREMENTS.md`
- `.planning/phases/01-private-pilot-boundary/01-CONTEXT.md`
- `.planning/phases/02-consensus-knowledge-and-commercial-model/02-CONTEXT.md`
</canonical_refs>

<deferred>
## Deferred / Explicitly Out of Scope

- Live provider enablement, credentials, package installation, paid calls, scraping, Runner execution, and any spend.
- Outreach Package/message generation or approval, Gmail, click-to-call, suppression mutation, CRM export, and workspace export/restore (Phases 6–7).
- Changing Phase 3 readiness/Market Discovery or Phase 4 runner, qualification, review, schedule, and prospecting contracts.
</deferred>
