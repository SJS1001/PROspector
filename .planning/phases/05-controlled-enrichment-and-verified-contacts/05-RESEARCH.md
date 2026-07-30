# Phase 5: Controlled Enrichment and Verified Contacts — Technical Research

**Status:** Planning-ready, provider-neutral; no live provider research or integration authorized.

<research_findings>
## Established Architecture to Extend

The accepted technical shape is a private server-authorized Site with D1 repositories and ports for identity, storage, objects, scheduler, runner, contact, mail, export, and clock. Phase 1 establishes admitted principal/capability/audit patterns; Phase 2 establishes immutable versioned authority, D1 migrations, server-derived scope, expected-revision/idempotency safety, and pure UI leaves. Phase 5 should extend these patterns, not introduce a provider-centric subsystem.

`docs/IMPLEMENTATION-SPEC.md` already defines the canonical records: `contact`, `contact_point`, `approval_grant`, `budget_account`, `audit_event`, profile effective configuration, scoped relevance, and append-only suppression. It locks verification classes, default freshness, paid enrichment reservation/settlement, and no-call failure conditions. These are design constraints, not alternatives to choose.

## Recommended Technical Shape

1. **Authority service** validates admitted workspace, exact Approved Prospect, active profile effective configuration, grant tuple, quote/catalog version, currency, and actual-plus-reserved caps. It returns a typed block result before any port acquisition/call.
2. **Reservation repository transaction** atomically creates a reservation and consumes the single-use grant using unique guards. Provider invocation is structurally unreachable unless this returns a committed reservation.
3. **Provider port** receives only the normalized authorized assignment and returns a bounded provider outcome/evidence envelope. A fake provider is the first implementation; provider enablement remains a later human-controlled release gate.
4. **Defensive ingestion/projector** checks submitted evidence against the request and recognized method/class rules, persists immutable observations/provenance, and derives eligibility/freshness. It cannot turn a suggestion into eligible merely because a provider says so.
5. **Identity resolution service** creates proposals and impact previews; only an owner decision performs the transactional merge/split. It preserves records and all downstream invalidation/suppression effects.
6. **Owner UI** displays preconditions, grant scope, price and reservation, evidence, freshness, current eligibility, and blocked/reconciliation states without turning visual state into authority.

## Research Conclusions / Decisions for Planner

| Question | Conclusion |
|---|---|
| Which provider? | No selection. Implement the port + fake contract first; a real provider needs separate explicit authority, sandbox/fake evidence, credentials, and release gate. |
| Can an AI/Runner verify or spend? | No. It can submit bounded sourced findings only. Application validates authority, evidence, classes, budget, and transitions. Separately billed Runner grants are distinct. |
| Is a domain/MX/pattern email usable? | No. It remains `suggested`/`domain_valid`, visibly a Contact Suggestion, and is blocked from ContactReady, package, export, call, and send. |
| Does Approved prospect authorize enrichment? | No. It is a prerequisite only; a current exact single-use enrichment grant and reservation are independently required. |
| How are timeouts handled? | `uncertain` reservation and reconciliation; no retry, resend, provider switch, or release without documented resolution. |
| How do stale contacts behave? | Preserve history, downgrade current eligibility, and project downstream state to `NeedsReview` until reconfirmed. |
| How is portability maintained? | Provider-neutral port, normalized evidence envelope, immutable catalog/quote metadata, and no provider secret or SDK state in domain records. |

## Planning Risks and Required Mitigations

| Risk | Required mitigation |
|---|---|
| Double call/spend under retries or concurrency | Unique operation key, grant-consumption guard, transactionally reserved worst case, idempotency/expected revision, race tests with zero extra calls |
| Unknown provider acceptance | Leave cost reserved; reconcile explicitly; use provider idempotency key only as a supplemental adapter capability |
| Fake/weak verification promotion | Class allowlist, source/method/time/provenance validation, class-not-confidence eligibility rule, negative tests for every suggestion source |
| Configuration/drift changes after result | Eligibility projection uses current configuration and rechecks at downstream boundaries; invalidate rather than overwrite history |
| Cross-play/wrong identity contact attachment | Exact workspace/Contact/Organization/scoped relevance joins and owner-reviewed merge/split suggestions |
| Legacy bypass | Remove/disable production reachability to legacy MCP enrichment; static/route tests prove it cannot be exposed |
</research_findings>

<implementation_constraints>
## Non-negotiable Constraints

- No provider enablement, package installation, provider call, scrape, send, call, deployment, or spend belongs to this preparation task.
- No real contact/import fixture or credential may enter Git, logs, test output, or planning artifacts.
- The planner must schedule a fake-provider contract and zero-call negative tests before a live adapter; actual real-provider use requires the accepted Wave 3 controlled test-provider/account gate.
- Currency is not convertible by inference. A matching bounded quote/catalog and exact currency are required.
- Contact verification and enrichment authority do not create suppression, outreach, export, or message approval authority.
</implementation_constraints>
