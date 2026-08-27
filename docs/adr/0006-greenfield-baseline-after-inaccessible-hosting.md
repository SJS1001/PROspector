# ADR-0006: Greenfield baseline after inaccessible hosting provenance

- Status: Accepted
- Date: 2026-08-27

## Context

The original private hosted project cannot be accessed reliably and its
migration journal, exact schema, and provider audit provenance cannot be
completed. Continuing to wait for that evidence prevents unrelated local work,
while treating the partial observations as proof would be unsafe.

## Decision

Permanently abandon the original hosted project as an execution dependency.
Retain its incident artifacts as history, waive the missing migration evidence,
and make no claim that a migration occurred. Use the checked repository plus a
fresh, empty, locally attested database as the new authoritative baseline.

All future environments must be newly provisioned greenfield targets. They may
not copy or depend on original-project data, objects, backups, journals,
credentials, identifiers, or provenance. Provisioning, credentials, production
data, providers, outreach, exports, and activation remain separate gates.

## Consequences

- Plans that inspect or recover the original target are retired, not completed.
- Historical hosted evidence earns no greenfield migration or release credit.
- Local implementation and synthetic preparation may continue from the clean
  checked baseline while external-effect adapters remain reject-only.
- A future hosted release must prove its own empty target, exact checked source,
  applied migration chain, private access, and negative-effect state.
- Nothing in this ADR authorizes a hosted write or selects a hosting provider.
