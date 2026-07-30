---
phase: 04
slug: profile-readiness-and-evidence-based-prospecting
status: prepared-dependency-blocked
gathered: 2026-07-30
---

# Phase 4: Profile Readiness and Evidence-Based Prospecting — Context

**Status:** Ready for research and design; not ready for executable implementation planning until the Phase 3 input contract below exists.

<domain>
## Phase Boundary

For an active Market Play and Offer, the owner completes every Customer Profile readiness decision, activates an immutable Profile Effective Configuration, receives evidence-backed runner submissions through tightly constrained assignments, and reviews application-calculated prospect outcomes. This phase owns Profile readiness, prospective-run scheduling, runner containment, source provenance, deterministic qualification, and owner review decisions. It does not enrich contacts, spend money, create outreach packages, export CRM rows, or send anything.
</domain>

<decisions>
## Locked Implementation Decisions

### Readiness is an explicit, atomic authority boundary
- A Profile stays Draft until the owner can see and confirm every required readiness item: Product/Offer; fit/target/disqualifiers; pains/outcomes and buyer/champion/validator roles; signals/recency/source hierarchy; geography/language/compliance posture; rubric/pass rule; proof/claim guardrails; contact/outreach strategy; schedule/timezone/output policy.
- Completing the final item is not activation. A separate owner activation transaction creates exactly one immutable Profile Effective Configuration, queues exactly one initial Prospecting Run, reveals **Find Prospects**, and enables the timezone-aware recurring schedule.
- Any later knowledge change creates a replacement candidate; it never changes an active Profile configuration in place. Future schedules move only after explicit activation. In-flight submissions finish as historical proposals and unreviewed prospects are requalified only through recorded dependency directives.

### Runner contributions are untrusted and minimized
- A runner receives a short-lived, revocable, nonce-bearing, assignment-bound connection containing only the confirmed Profile snapshot, bounded source window, allowed tools, quotas, and submission schema required for that assignment.
- Runner output may append sourced observations and status only. Trusted application code assigns source tier, validates URLs and provenance, deduplicates, applies state transitions, and calculates qualification.
- Every run and assignment preserves provider, model, instruction version, tool configuration, Profile configuration, sources, transformations, assignment, grants, attempt, and terminal reason. Credentials are configured outside PROspector and are neither stored nor displayed. There is no automatic provider failover.

### Evidence is an inspectable immutable chain
- Every Signal must visibly preserve URL, application-assigned source tier, publication/event dates when known, retrieval time, bounded supporting excerpt, publisher/underlying-origin identity, independence group, retrieval lineage, and configuration/run references.
- Tier 3 never qualifies alone. A successful discovery window overlaps its prior successful watermark by 24 hours. Evidence older than 30 days is Account Context unless reconfirmed.
- Retrieval and interpretation stay separate. Source text is escaped data, never executable instruction; runner input receives sanitized excerpts, not cookies, credentials, raw private documents, or privileged browsing authority.

### Qualification is deterministic, recorded, and explainable
- The initial ONE for Mining Operating rubric has five integer 0–2 dimensions: account fit, pain strength, timing/urgency, data readiness, and commercial viability.
- Passing requires score >= 7/10, pain >= 1, timing >= 1, no hard disqualifier, all required evidence fields, and either one Tier 1 or two independent Tier 2 sources. Missing rubric evidence scores 0; it is never inferred upward.
- Outcomes are exactly `Passed`, `NotQualified`, `InsufficientEvidence`, or `Disqualified`. The application stores the full immutable assessment: configuration digest, anchors, inputs, source IDs/tiers/independence, gate checks, score breakdown, outcome, and deterministic tie order.
- Hard disqualifiers are: wrong target type/status/geography/language; no relevant processing operation; explicit no-solicitation; duplicate active prospect for Account/Target/Offer; or an Offer blocked by a Product limitation.

### Owner review controls subsequent state, not external effects
- Only a `Passed` assessment can create a Qualified Prospect. The owner selects Approve, Reject, or Defer with a reason against the exact qualification record.
- Rejected Prospects cool for 90 days unless a Material Signal occurs. Deferred Prospects re-enter only on their review date or a Material Signal. Disqualified candidates re-open only when sourced evidence disproves the hard gate.
- State changes are auditable and visible in funnel loss counts. No review decision authorizes enrichment, exports, contact, Gmail, calling, spend, or outreach.

### Claude's Discretion
- Module names, schema normalization, scheduling primitive, and component composition should follow the established TypeScript, D1/Drizzle, Node-test, and manual CSS patterns.
- The planner may split the phase into schema/domain, runner boundary, retrieval/evidence, scheduling, qualification/review, UI, and hosted-gate work only after Phase 3 produces the required exact authorities.
</decisions>

<phase3_inputs>
## Required Phase 3 Inputs for the Later Planner

Phase 4 has a hard dependency on Phase 3. The planner must read the Phase 3 summary, verification, API/schema contract, and configuration artifacts and reject planning if any item below is absent or still proposed.

| Required Phase 3 output | Exact Phase 4 consumer | Acceptance condition |
|---|---|---|
| Active `Product Discovery Configuration` | runner/default policy and product-limitation hard gate | Immutable ID/digest, Product scope, source policy, discovery policy, runner reference, claim guardrails, and activation lineage are readable. |
| Operator-accepted `Market Play` | Profile parent scope and Account/Target boundaries | Immutable Market Play identity/version is active, not merely a surfaced proposal; decision/audit lineage is available. |
| Confirmed or activated `Offer` within the Play/Profile path | qualification identity and duplicate fingerprint | Offer ID/digest, exact Product/Play parentage, and delivery/limitation dependencies are resolvable. |
| Phase 3 runner-policy contract | Profile default runner selection | Named runner reference/adapter boundary, allowed connection metadata, and a no-credential-storage invariant are established; no runner callback is implicitly authorized by readiness. |
| Product discovery watermark/slot semantics | separate Profile scheduling design | Phase 3 documents its schedule owner, slot key, timezone/DST behavior, success watermark, overlap, misfire, and active-run policy so Profile semantics cannot collide. |
| Market-Play source-policy decisions | application tiering and evidence validation | Tier assignment rules, allowlists/owner-review mechanisms, publisher/origin/independence representation, and authority lineage are available. |
| Phase 3 drift/replacement directives | Profile configuration rollover | Product/Play change records state the dependency graph and contain directives for future schedules, in-flight results, and requalification. |
| Phase 3 migration/schema and boundary proof | additive migration and release gate | Full migration-chain state, forbidden-table manifest, owner-admission/CSRF patterns, and unresolved hosted blockers are documented. |

**Current blocker:** `.planning/phases/03-product-readiness-and-market-discovery/` is absent. No Phase 4 plan may invent Product readiness, Market Play acceptance, Offer activation, source policy, runner policy, or schedule semantics.
</phase3_inputs>

<canonical_refs>
## Canonical References

Downstream agents must read these before planning or implementing:

- `docs/DIRECTION.md` — accepted Product, Profile, evidence, runner, scoring, review, and safety decisions.
- `docs/IMPLEMENTATION-SPEC.md` — required trust boundary, configuration, job, retrieval, qualification, and prospect-state invariants.
- `docs/adr/0001-generic-company-product-play-model.md` — hierarchy and Company-wide identity versus Play-scoped state.
- `docs/adr/0002-confirmed-knowledge-and-effective-configuration.md` — immutable configuration and dependency behavior.
- `docs/adr/0003-untrusted-runners-and-human-gates.md` — runner containment and application authority.
- `docs/adr/0005-advisory-compliance-hard-suppression.md` — advisory posture and hard downstream suppression boundary.
- `.planning/ROADMAP.md` — Phase 4 goal, dependency, requirements, and success criteria.
- `.planning/REQUIREMENTS.md` — REQ-profile-readiness, REQ-deterministic-qualification, REQ-evidence-provenance, and REQ-untrusted-runner-boundary.
- `.planning/phases/02-consensus-knowledge-and-commercial-model/02-CONTEXT.md` — prior knowledge/configuration decisions and Phase 4 boundary.
- `.planning/phases/02-consensus-knowledge-and-commercial-model/02-PATTERNS.md` — repository, authorization, immutable mutation, migration, and UI patterns to preserve.
</canonical_refs>

<specifics>
## Specific Ideas

- Preserve the established seeded hierarchy: `Digitalrain / ONE / ONE for Mining / Operating`; Greenfield remains Draft/nurture.
- The Operating schedule target is weekdays at 06:00 America/Toronto, but scheduler provisioning and any hosted callback proof remain subject to the Phase 3 contract and release gates.
- The owner should always be able to answer: what configuration produced this result, what evidence supports it, why it passed/failed, what a runner was allowed to do, and whether an action is still blocked.
</specifics>

<deferred>
## Deferred Ideas

- Paid enrichment and verified contact promotion: Phase 5.
- Package/message approval, Gmail, manual calling, and suppression enforcement: Phase 6.
- CRM handoff, weekly operating target, and workspace export/restore: Phase 7.
- Multi-user profiles, automated legal adjudication, autonomous prospect approval, autonomous send, credential storage, broad browsing tools, and a CRM pipeline are out of scope.
</deferred>

---

*Prepared 2026-07-30 from accepted Direction, Implementation Contract, ADRs, and Phases 1–2 artifacts.*
