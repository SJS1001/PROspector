# Phase 05 — Implementation Pattern Map

## Pattern Rules

| Concern | Required pattern | Reuse / avoid |
|---|---|---|
| Admission and scope | Start every read/write from the admitted principal's server-derived workspace; join exact parents and current effective availability | Reuse `site/domain/interview.ts` owner-scoped service boundary; never accept workspace/prospect scope from client IDs alone |
| Authority | Immutable `approval_grant` + server-generated nonce/digest + expected revision/idempotency key | Reuse Phase 2 append-only decisions; do not infer authority from button state, adapter response, or prior success |
| Provider portability | Narrow `ContactProviderPort` injected only at composition edge, returning bounded normalized evidence/outcome | Keep adapters replaceable; no SDK types/keys in domain/UI/schema authority |
| Spend | Transactional reservation ledger with unique operation key and `reserved/settled/uncertain/released` outcomes | Reuse budget-account model in `IMPLEMENTATION-SPEC`; never call then “check budget”, auto-retry, or fail over |
| Contact state | Immutable contact-point observations plus a current eligibility projection | Do not update a suggestion in place into verified or let numeric confidence override class |
| Identity | Suggestion → explicit merge/split decision → transactional re-point with lineage | Reuse Company-wide identity/scoped relevance distinction; never auto-merge on email domain/name |
| UI transport | One owner surface owns fetch/CSRF/idempotency/unknown outcome/retry; pure leaves render supplied projections | Reuse `ProspectorApp` pattern; never let a leaf directly call providers |
| Audit | Append actor/action/subject/workspace/request-or-operation/time/outcome/digest/bounded reason | Do not log credentials, raw provider payloads, full contact values beyond justified canonical audit references, or message bodies |

## State and Transaction Boundary

```text
Approved Prospect + current Profile Effective Config
  -> owner creates immutable grant (no call)
  -> validate all scope/quote/budget conditions
  -> reserve worst case atomically
  -> provider port call
  -> defensive result ingestion
  -> immutable contact-point evidence
  -> eligible projection only for mailbox_verified/source_verified + fresh
  -> ContactReady, otherwise NeedsReview / Contact Suggestion / reconciliation
```

The reservation transaction must include the grant consume guard and all cap checks. The provider call happens only after commit. Reconciliation is a distinct audited state transition; no state treats a timeout as a successful verification.

## Suggested Pure Domain Interfaces

- `validateEnrichmentAuthority(input, projection, quote, now) -> ValidatedOperation | BlockedReason`
- `reserveEnrichment(operation) -> Reservation` (repository transaction; consumes grant)
- `ContactProviderPort.enrich(request) -> ProviderOutcome` (only after reservation)
- `ingestContactEvidence(reservation, outcome) -> ContactPointObservation[]` (schema/provenance validation)
- `projectContactEligibility(points, strategy, availability, now) -> ContactEligibility`
- `planIdentityResolution(suggestion) -> ImpactPreview`; `applyIdentityResolution(decision) -> audit + transactional associations`

Inputs and outputs must be typed/bounded, canonicalized before hashing, and use opaque IDs. The port never receives a credential in the browser and never receives wider prospect/workspace data than the assignment requires.

## Data Integrity Checks

- Partial unique index/key for one reservation per workspace + grant + operation key; a consumed/reused grant cannot open a second reservation.
- Check constraints/enums for verification class, reservation state, currency, and operation type; quote/catalog version and expiry are stored with the reservation.
- Every contact-point evidence row references Contact, workspace, source/provenance, method, observed/verified timestamps, and policy/configuration version.
- Current eligibility is derived from immutable records plus current configuration/availability; it is recalculated at every downstream boundary.
- Merge/split moves associations in one transaction and leaves source/alias/old identity lineage and suppression subjects intact.

## Anti-patterns

- Shipping/reusing `enrichment/mcp_server.py`, legacy Hunter paths, or any production-reachable MCP provider route.
- Calling a provider before durable reservation, treating retry as free, reconciling an uncertain charge by reissuing it, or carrying authority across provider/currency changes.
- Promoting MX/domain/pattern guesses, directories, adapter “confidence”, or imported hints into Enriched Contact.
- Treating Phase 4 Approved, a current `ContactReady`, a package, or an identity merge as external-effect authority.
- Mutating contact evidence/identity history destructively or dropping suppression subjects during merge/split.
