# ADR-0004: Private Sites pilot with a portability boundary

- Status: Accepted, conditional on capability spike
- Date: 2026-07-29

## Context

The pilot needs a private hosted application and durable operational data now. Codex Sites is available but is a beta service, has plan limits, and did not offer a data-residency commitment at the time of this decision.

## Decision

Use one private Codex Site per Company for the pilot, D1 for structured state, and R2 for documents and exports. Keep business logic behind provider-neutral ports. Do not import sensitive pilot data until a capability spike proves authentication, server authorization, storage, scheduling, runner callbacks, Gmail OAuth, secrets, audit, export/restore, and observability.

Company Workspace Export is the exit boundary. A clean-deployment restore test is required before pilot activation.

## Consequences

- The pilot can ship quickly with private access.
- Provider limits and lack of residency are accepted pilot risks.
- Failed spike criteria trigger a host change without changing the domain model.
