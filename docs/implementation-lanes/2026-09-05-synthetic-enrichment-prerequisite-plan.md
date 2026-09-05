# Synthetic enrichment prerequisite plan

Date: 2026-09-05

## Scope

This local-only candidate is a pure, deterministic planner for the prerequisites of **known-contact verification/enrichment**. It accepts only an already-existing synthetic Contact, its confirmed same-workspace Prospect relevance and owner-approved role, an immutable synthetic grant snapshot, and an explicit synthetic cap policy.

The accepted result contains exactly four new zero-balance budget-account descriptions—grant, profile, workspace, and provider—and one canonical contact-evidence assignment. Budget-account IDs use the exact length-prefixed identity required by the durable reservation authority; the assignment ID is derived from canonical SHA-256 material. The planner normalizes account ordering, freezes its result, detects exact replay, and reports a conflict when valid material changes.

## Fail-closed rules

- The grant, Contact, and cap policy must each carry an exact current digest.
- The grant must be unexpired at the supplied synthetic evaluation time.
- Contact, relevance, role approval, policy, grant, Prospect, configuration, provider, and currency bindings must agree exactly.
- The policy must contain each of the four scopes once, with enough unit and cost headroom for the bounded grant.
- Missing, extra, foreign, stale, expired, mismatched, duplicate, or insufficient input is rejected.

## Deliberate non-authority

This module has no D1, persistence, route, browser, provider-port, credential, contact-coordinate, source-locator, or external-effect dependency. It returns descriptions only and grants both `persistenceAuthority: none` and `effectAuthority: none`. Runtime and production import it nowhere.

This covers preparation for verification/enrichment of a Contact that is already known and already related to the Prospect. It does **not** discover a new person, source new contact details, call an enrichment provider, verify an email or phone number, reserve money, write an assignment, or activate Stage 2.

Phase 4 acceptance, controlled-enrichment activation, real policy/principal evidence, persistence composition, provider selection and credentials remain separate gates. This candidate completes no Phase 5 plan, earns no phase credit, and creates no `05-*-SUMMARY.md`.
