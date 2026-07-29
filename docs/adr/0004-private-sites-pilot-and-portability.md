# ADR-0004: Private Sites pilot with a portability boundary

- Status: Accepted for a non-sensitive owner-only fixture pilot; production activation remains conditional
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

## Capability checkpoint — 2026-07-29

Version 1 of the fixture-only pilot was deployed from site source commit
`04ace2d04da5493b354ec9cf806c811257b85fc9` at
`https://prospector-steven-pilot.djstif.chatgpt.site`.

The deployment proved an owner-only custom access policy: the sole allowlisted
user is Steven Smith, there are no allowed groups, and an unauthenticated
request to `/api/capabilities` returned `401 Sign in required`. The build and
packaging path includes declared D1 and R2 bindings, and their local simulated
probes pass.

This does **not** complete Wave 0. Authenticated D1/R2 durability, session and
mutation controls, hosted scheduling, Runner callbacks, controlled-account
Gmail OAuth, encrypted export/restore, and operational recovery remain
unproven. Therefore the deployed site may contain only synthetic fixtures and
must not receive real leads, personal data, credentials, or external-effect
authority. Sensitive-data activation remains blocked until the Wave 0 report
is fully green or a compatible host is selected.
