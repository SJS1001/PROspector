# ADR-0004: Private Sites pilot with a portability boundary

- Status: Partially superseded by [ADR-0006](0006-greenfield-baseline-after-inaccessible-hosting.md); historical pilot record and provider-neutral portability rationale retained
- Date: 2026-07-29

## Supersession notice

[ADR-0006](0006-greenfield-baseline-after-inaccessible-hosting.md) supersedes
this record's original Sites project, hosting, and baseline choice. The original
private Sites project is inaccessible, retired, and permanently outside the
execution path. This record remains authoritative only as historical pilot
evidence and for its provider-neutral portability and recovery rationale.

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

## Capability checkpoint — private version 6

A second product attack found that version 5 Confirmation could derive policy
content from the then-current compiled constant instead of the exact payload
reviewed when the Answer was submitted. It also found that a version-4 record
could be interpreted as valid despite lacking the corrected checkpoint.

Version 6, source `04d037f14566c883a786b2fbfbcbb0e4f8787d8b`, stores a
canonical policy snapshot and digest in the immutable Answer. Pending review,
Confirmation, and the resulting Knowledge Version are all derived from that
snapshot. A tested drift case changes the question after submission and proves
the pending and confirmed policy remain the reviewed version.

Pre-snapshot records are never returned as confirmed knowledge. They enter an
explicit review-required state. Restarting the review preserves the old Answer
and Confirmation, appends a quarantine audit event, supersedes derived
knowledge, archives the old session, and opens a fresh two-stage review. The
legacy email-derived owner subject is migrated to the HMAC subject on first
access without rewriting prior audit events.

This closes the two product HIGH findings locally. Authenticated hosted
initialize/submit/reload/confirm/reload evidence remains outstanding and Wave 0
remains blocked for every broader capability.

## Capability checkpoint — private version 7

The final product attack found that two tabs could restart the same quarantined
legacy Answer with different idempotency keys and create two active replacement
sessions. Version 7, source
`99c14a124bec8f97a4b1db66d04d6a7ac2edc7c8`, derives the replacement
session, question, and quarantine audit identities from the legacy Answer
itself. Competing requests therefore converge on the same replacement.

The required race test runs two different keys concurrently and proves both
requests resolve to one authoritative active session, one active question, and
one quarantine audit. The private deployment succeeded with environment
revision 1. Authenticated hosted lifecycle proof remains the next evidence item
for this narrow slice; provider-session rotation and broader Wave 0 capabilities
remain blocked.

## Capability checkpoint — private version 8

The final security attack identified a coexistence case: version 5 could have
created a new HMAC-owner workspace while a version-4 SHA-owner workspace still
held an old confirmation. Returning the current workspace first would leave the
detached legacy knowledge marked confirmed.

Version 8, source `8af82949ad7b9a064836477cf656eea94bab9392`,
checks both owner subjects. When both workspaces exist, it retains the current
workspace and idempotently quarantines the detached legacy workspace: unbound
derived knowledge becomes superseded, sessions are archived, questions are
superseded, and one audit event is appended. Historical Answers and
Confirmations remain unchanged. Concurrent coexistence reads are tested and
produce one quarantine audit.

The private deployment succeeded with environment revision 1. Authenticated
hosted lifecycle proof and provider-session rotation remain explicitly open.

## Hosted owner lifecycle checkpoint — 2026-07-29

The signed-in owner session completed the approved two-stage path on private
version 8. The already-submitted Answer remained in `awaiting_confirmation`
after a full page reload. A separate owner confirmation created Knowledge
Version `kv_fc242a590384160214f64207` and Audit Event
`ae_fc242a590384160214f64207`. A second full reload returned the same confirmed
value and identifiers from hosted D1. Production logs show the corresponding
interview GET/POST/GET requests returned HTTP 200 with normal outcomes.

The authenticated capability endpoint also reported D1, R2, and private
identity headers present. This accepts Sites-hosted D1 for the narrow owner
policy slice. It does not prove R2 object durability, provider-session rotation,
hosted cross-principal isolation, or any broader Wave 0 capability.
