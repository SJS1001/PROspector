# Contacts runtime-boundary candidate — 2026-09-05

## Scope

This candidate connects the owner-only Contacts HTTP/UI boundary to a narrow,
provider-neutral injected command service. It is local/synthetic preparation,
not completion evidence for Phase 5 Plan 05-07.

The boundary models four closed command shapes for dependency-injected tests:

- create a grant from an authoritative projected prospect ID and prospect revision;
- run an already-issued opaque grant ID;
- apply a server-projected identity merge suggestion; and
- apply a server-projected identity split suggestion.

The handler derives workspace and principal on the server. Browser input cannot
supply provider configuration, workspace/owner identity, operation or reservation
authority, budgets, quote material, nonce, candidate sets, or association sets.
Responses are copied into closed DTOs that omit contact coordinates, source
locators, owner subjects, attestations, credentials, provider responses, and raw
evidence.

## Fail-closed composition

Production routing intentionally injects neither a command service nor a Phase 4
acceptance predicate. Every durable command requires all three conditions before
the service can be called:

1. a command service is explicitly injected;
2. a server predicate verifies Phase 4 acceptance for the derived workspace and
   principal; and
3. the immutable `controlled_enrichment` activation tuple verifies.

Missing or false conditions return HTTP 409 before any command-service call. No
provider adapter, quote, budget, assignment, activation row, contact data, or
external effect is created by this slice.

`run_granted_operation` and `apply_identity_split` also require their own explicit
server predicates. Those predicates default to false and production injects
neither. The UI keeps Stage 2 and split disabled pending an owner decision about
displaying the complete immutable authority needed to make those actions safely
reviewable.

## Browser behavior

The client accepts active authority only from a normalized server projection.
Stage 1 uses a verified projected prospect ID and prospect revision. Stage 2 stays
disabled until the complete immutable grant summary is approved for owner display.
Merge requires the owner to choose a primary from at least two projected candidates;
split remains disabled until its exact impact can be displayed.
Contact Suggestions and stale rows remain unusable. An unknown POST outcome causes
one GET refresh and never an automatic POST retry.

Observation projection exposes a bounded source category, freshness state, and
verification time. The raw `source_reference` locator remains hidden. This
candidate does not add an exact-source digest, so it cannot complete Plan 05-07.

## Remaining activation boundary

An independently verifiable Phase 4 acceptance anchor, owner approval for the
complete owner-visible authority summary, and a separately reviewed runtime
composition remain absent. A future plan must supply all three and bind a real
service without weakening the closed request/response contracts. Real provider
selection, credentials, persistence composition, exports, contact coordinates,
and external calls remain outside this candidate. No `05-07-SUMMARY.md` is
created and this document is not Plan 05-07 completion evidence.

## Focused verification

Run from `site/`:

```text
node --test tests/contacts-ui.test.mjs tests/enrichment-contract.test.mjs tests/identity-resolution.test.mjs tests/identity-persistence-repository.test.mjs
```

The Contacts tests cover owner/origin/intent/body/CSRF admission, both activation
gates and zero-call denial, minimal frozen service commands, result sanitization,
settled and reconciliation outcomes, identity merge/split shape, local-demo CSRF
cookie mode, active client normalization, separate confirmations, and GET-only
unknown-outcome recovery.
