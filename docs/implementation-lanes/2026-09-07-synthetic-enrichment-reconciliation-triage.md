# Synthetic enrichment reconciliation triage

Date: 2026-09-07

## Relationship to the statement-based closure decision

PR #13 (`ebcf9b1edcd0a1e38f810f377a7aa0b75857efd1`) adds
`site/domain/synthetic-enrichment-reconciliation-decision.ts`, which owns
**closure**: given an owner-transcribed provider billing statement, it projects
a future `settled` (partial only, capped at the reservation, remainder released)
or `released` state, or holds. That module is the product for terminal state and
amounts, and this lane does not duplicate, replace, or compete with it.

PR #13 admits exactly two of the eight canonical post-claim reasons. Its
`UncertainReason` type is `"timeout" | "ambiguous"`, enforced when the subject is
normalized; every other canonical reason throws
`synthetic_uncertain_enrichment_reservation_invalid`. Verified empirically
against that exact commit by feeding all eight canonical values to
`buildSyntheticUncertainReservation`:

| Canonical reason | Statement-based closure decision |
|---|---|
| `timeout` | accepted |
| `ambiguous` | accepted |
| `provider_port_mismatch` | rejected as invalid |
| `invalid_provider_outcome` | rejected as invalid |
| `invalid_assignment` | rejected as invalid |
| `invalid_evidence` | rejected as invalid |
| `provider_throw` | rejected as invalid |
| `settlement_failure` | rejected as invalid |

## Scope

This local-only candidate answers the question that comes *before* closure, for
all eight reasons: could a provider request even exist for this reason, so that
a billing statement is applicable at all, and must durable state be re-read
first. It consumes only an immutable, branded, digest-bound synthetic case and
returns a frozen routing description.

| Reason | Provider invocation | Statement | Covered by closure decision | Route |
|---|---|---|---|---|
| `timeout` | attempted | applicable | yes | statement-based closure decision |
| `ambiguous` | attempted | applicable | yes | statement-based closure decision |
| `provider_port_mismatch` | not attempted | inapplicable | no | no statement possible |
| `invalid_provider_outcome` | attempted | applicable | no | statement-based closure decision |
| `invalid_assignment` | not attempted | inapplicable | no | no statement possible |
| `invalid_evidence` | attempted | applicable | no | statement-based closure decision |
| `provider_throw` | indeterminate | applicable | no | statement-based closure decision |
| `settlement_failure` | attempted | applicable | no | durable state re-read required |

A statement is inapplicable only for the two reasons where the runtime provably
returns before `invokePort`, so no provider request and therefore no billing
line can exist.

A second dimension covers the two unclosed `executeEnrichmentOperation` results.
When the case records `reconciliation_persistence_failure`, even the
reconciliation marker is absent and the durable row may still read `invoking`.
The closure decision requires an exact `needs_reconciliation` row and otherwise
holds with `reservation_not_uncertain`, so every reason then routes to
`durable_state_reread_required` instead.

A coverage projection replays a set of already-routed cases and reports
`complete` only when all eight canonical reasons appear exactly once within one
workspace, with distinct reservations and exact recomputed digests. Routing only
`timeout` and `ambiguous` reports `incomplete` and names the six missing
reasons.

## Deliberate non-authority

The module has no import at all: no adapter, persistence, D1, route, browser,
provider-port, credential, environment, network, contact-coordinate, or
source-locator dependency. The canonical reason union is restated locally rather
than imported so this triage cannot compose with the runtime authority; a
focused test parses `domain/enrichment-authority.ts` and fails if the
restatement drifts, and separately proves that every reason the runtime passes
to `reconcile()` has an explicit row.

It projects **no** terminal state, settled or released amount, or charge. A test
asserts the source contains no `projectedFutureState`, `projectedTerminalReason`,
`documentedUnits`, `documentedCostMinor`, `releasedUnits`, `"settled"`,
`"released"`, or `"partial"`, and every result carries literal
`settlementAuthority: "none"` alongside `retryAuthority`,
`providerCallAuthority`, `persistenceAuthority`, and `effectAuthority` of
`"none"`. Settlement remains wholly the closure decision's product.

The delegate is referenced by its exported decision function name
(`decideSyntheticEnrichmentReconciliation`), never by its module path, so this
reference cannot trip that module's own composition guard — which scans `app`,
`worker`, `adapters`, and `scripts` for its module path. Runtime and production
import this triage nowhere; a focused test scans every non-test source file to
keep it unreachable.

This describes how a stranded reservation *would* be routed. It does not
reconcile, close, settle, release, retry, re-invoke, select a provider, call a
provider, read or write durable state, mutate a reservation, admit contact
evidence, export, or reach a host.

Phase 4 acceptance, controlled-enrichment activation, real reconciliation
evidence, owner review authority, persistence composition, provider selection,
and credentials remain separate gates. This candidate completes no Phase 5 plan,
earns no phase credit, and creates no `05-*-SUMMARY.md`.

## Open review finding for PR #13 (not applied)

PR #13's test lists `provider_throw` under `badSubjects` labelled *"retryable
reason"*. In the checked runtime, `enrichment-operation.ts:73` routes a thrown
port to `markNeedsReconciliation` exactly like `timeout`, the module header
states *"No retry or provider switch is available"*, and
`claimCommittedInvocation` only moves `reserved -> invoking`. A `provider_throw`
reservation is therefore stranded exactly as permanently as a `timeout` one, so
the "retryable" label does not hold and rejecting it leaves that reservation
unclosed. Recorded here for PR #13's owner; nothing in PR #13 was edited.

## Focused checks

On Node.js `v22.22.2` in this checkout:

- `node --test tests/synthetic-enrichment-reconciliation-triage.test.mjs` —
  11/11 pass.
- `npm run lint` — clean.
- `node --test tests/synthetic-enrichment-prerequisite-plan.test.mjs
  tests/prospect-quality-evaluation.test.mjs
  tests/outreach-preparation-boundary.test.mjs` — 31/31 pass (these suites scan
  every source file, so they cover the new module's unreachability).
- `node --test tests/enrichment-contract.test.mjs
  tests/enrichment-operation-preflight-integrity.test.mjs
  tests/enrichment-boundary-input-snapshot.test.mjs
  tests/controlled-enrichment-integration.test.mjs` — 20/20 pass.

The canonical `npm test` gate (which runs the production build first) and
`npm audit --omit=dev` were not run in this lane.
