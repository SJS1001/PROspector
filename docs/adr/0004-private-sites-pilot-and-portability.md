# ADR-0004: Private Sites pilot with a portability boundary

- Status: Accepted for an owner-only pilot with one narrow low-sensitivity decision; broader production activation remains conditional
- Date: 2026-07-29

## Context

The pilot needs a private hosted application and durable operational data now. Codex Sites is available but is a beta service, has plan limits, and did not offer a data-residency commitment at the time of this decision.

## Decision

Use one private Codex Site per Company for the pilot, D1 for structured state,
and R2 for documents and exports. Keep business logic behind provider-neutral
ports. Permit one live, low-sensitivity company policy only: historian
connectivity counts as partial data readiness until access is sourced. It must
follow a separate Answer → Confirmation lifecycle and must not affect scoring
until that integration is independently proven. Do not import sensitive pilot
data until the remaining capability spike proves authentication, server
authorization, storage, scheduling, runner callbacks, Gmail OAuth, secrets,
audit, export/restore, and observability.

Company Workspace Export is the exit boundary. A clean-deployment restore test is required before pilot activation.

## Consequences

- The pilot can ship quickly with private access.
- Provider limits and lack of residency are accepted pilot risks.
- Failed spike criteria trigger a host change without changing the domain model.
- The owner subject is derived with a server-secret HMAC rather than storing or
  hashing the email directly. Secret rotation requires a coordinated identity
  migration to avoid orphaning the workspace.
- There is no self-service deletion yet; the approved decision can only be
  removed through owner-requested pilot teardown until deletion is built.

## Capability checkpoint — 2026-07-29

Version 1 of the fixture-only pilot was deployed from site source commit
`04ace2d04da5493b354ec9cf806c811257b85fc9` at
`https://prospector-steven-pilot.djstif.chatgpt.site`.

After implementation red-team, version 2 replaced it from site source commit
`1024e422636a3eea80636562f2b487a9eed58d9a`. Version 2 persistently labels all
data as synthetic and disables every control that could appear to make a
durable decision or external action.

Version 3, from site source commit
`e8f83d92cb189b5b6bd030da30b9ac0a6520860d`, adds a rendered regression test
that verifies those consequential controls carry the native `disabled`
attribute across all six views.

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

## Capability checkpoint — private version 5

Version 4 introduced a live decision but collapsed answer and confirmation
into one click. A clean product and security challenge rejected that lifecycle
and the stale fixture-only boundary. Version 5 supersedes it from source commit
`d5552cdcd7c1539ced00429ea657770f47594d84`.

Version 5 separates Answer from Confirmation; binds idempotency keys to exact
operation semantics; labels the premise and provenance honestly; treats the
confirmed policy as inert until scoring integration; uses a server-secret HMAC
owner subject; streams request bodies under an 8 KiB limit; and requires an
expiring, one-time, owner-bound CSRF token in addition to Origin, Fetch Metadata,
and intent checks. Local tests cover route-handler identity denial, token replay,
cross-owner identifiers, retries, concurrent writes, reload, and the exact
two-stage state transition.

The Sites secret is configured and the private deployment succeeded. An
authenticated hosted browser create/reload/confirm proof is still outstanding,
so D1 durability at the hosted edge and provider-session rotation remain
partial. The narrow policy exception does not authorize real leads, contacts,
outreach, schedules, Gmail, imports, or exports.
