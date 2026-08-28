# Phase 6 greenfield local-only preparation authority

**Status:** Owner-authorized preparation; no Phase 6 plan execution or completion

## Decision

The 2026-08-27 greenfield reset authorizes the next safe local preparation step
while preserving the exact Phase 4/5 predecessor matrix and every external
effect gate. This bounded lane does not execute, complete, supersede, or amend
Plans 06-01 through 06-13 and creates no plan summary.

The first preparation slice adds a static production-composition boundary that
must stay green while later pure domain work is developed. It proves only that
the checked application currently has no direct Gmail or telephony provider
SDK/endpoint, credential binding, or static mail/call effect.

The second preparation slice adds a closed, in-memory, synthetic-only approval
and suppression state machine under `site/preparation/`. The application,
domain services, adapters, routes, workers, and local runtime do not import or
compose it. It models future authority and prohibitions without creating
runtime authority, persistence, an outbox, a contact action, or an effect.

The third preparation slice adds a separate canonical synthetic Outreach
Package and Message artifact builder. It freezes every future approval-bearing
field, derives the call script from package authority, computes deterministic
SHA-256 digests, and projects exact invalidation reasons. It remains outside
runtime composition and has no persistence, export, provider, or outbound seam.

The fourth preparation slice adds a minimized synthetic final-dispatch
recheck and lease-decision contract. It binds the complete current scope,
artifact, approval, sender, policy, suppression/stop dependency, dispatch-key,
outbox-item, and lease-fence tuple. It can describe that a future boundary
would pass, but explicitly grants no provider-invocation authority and performs
no state transition or effect.

The fifth preparation slice adds a minimized synthetic originated-event and
stop-rule decision contract. It classifies an already-resolved reply or bounce,
binds it to one known synthetic originated message/thread and current
connection/dependency authority, and describes which matching email follow-ups
would cancel or pause. It never reads a mailbox, authenticates an event, finds
work, records a stop rule, cancels work, or performs an effect.

The sixth preparation slice adds a minimized synthetic DeliveryUnknown and
manual-reconciliation decision contract. It binds one ambiguous provider
attempt to the exact synthetic dispatch, message artifact, connection,
originated message/thread, reconciliation dependencies, marker digests, and
lease generation. It can describe how a later pre-resolved observation would
classify the item, but it never reads a provider, records the observation,
changes delivery state, retries, or performs an effect.

## Mandatory safeguards

1. Use synthetic data and local files only. Do not use real prospects,
   contacts, messages, numbers, recipients, exports, or production identities.
2. Do not add or call Gmail, Google OAuth, telephony, dialer, messaging, CRM,
   enrichment, scheduler, or other provider packages/endpoints.
3. Do not add secrets, credentials, provider bindings, static `mailto:` or
   `tel:` effects, an outbox worker, a send route, or a call action.
4. Preserve the reject-only provider boundary and the blocking Phase 4/5
   predecessor matrix in Plan 06-11.
5. Do not create a `06-xx-SUMMARY.md`, claim Phase 6 execution, or mark a Phase
   6 requirement complete from this lane.

## Verified local preparation slices

### Static composition guard

`site/tests/outreach-preparation-boundary.test.mjs` rejects direct Gmail or
telephony packages/endpoints/bindings, static mail/call effects, and any
runtime import of every module under `site/preparation/`.

### Synthetic approval and suppression state machine

`site/preparation/outreach-approval-suppression.ts` and its focused suite prove:

- immutable Package approval and independent Message approval;
- Package approval alone can reach only future CRM-eligibility preparation;
- Message approval can reach only `ready_for_future_composition`, never an
  outbox, send, call, export, provider, or durable mutation;
- exact email, owner-confirmed email domain, E.164 synthetic phone, Contact,
  Organization, and Company scopes produce append-only channel prohibitions;
- an effective suppression blocks later approval and wins when it becomes
  effective after historical approval;
- exact replay is stable, changed-key reuse conflicts, suppression cannot be
  removed, and stale/forged/cross-artifact/accessor/proxy/non-synthetic inputs
  fail closed; and
- every state and projection retains literal zero effect counters.

This is preparation evidence only. It does not satisfy Plan 06-11, execute
Plans 06-01, 06-03, or 06-04, or authorize the application to import this
module.

### Canonical synthetic Outreach Package and Message artifacts

`site/preparation/outreach-artifacts.ts` and its focused suite prove:

- an Outreach Package digest binds the exact workspace, Company, prospect,
  Contact, Profile configuration and digest, qualification/source hashes,
  recommended angle, claim guardrail versions, selected verified synthetic
  contact points, complete Message version set, and creation time;
- the package-derived call script binds the opening, deduplicated evidence
  hashes, and claim guardrail versions without accepting a caller-supplied
  script;
- a Message digest binds its package/configuration, sender, recipients,
  subject, text and HTML bodies, links, attachments, thread/reply identity,
  intended send time, and timezone; edits and rescheduling change the digest;
- current package/message recomputation names digest drift, stale or withdrawn
  authority, high-risk drift, suppression, revoked dependencies, and approval
  expiry as fail-closed invalidations;
- only `.invalid` recipients/links, fictional 555-01xx numbers, synthetic IDs,
  safe content and closed plain-data shapes are admitted; forged artifact
  copies and hostile accessors fail closed; and
- artifacts, derived script, and projections are deeply immutable and retain
  literal zero effect counters.

This is an artifact and invalidation contract only. It does not persist an
artifact, approve one, compose a provider payload, create a draft/outbox,
export data, send, call, execute Plan 06-03, or grant Phase 6 completion credit.

### Synthetic final-dispatch recheck and lease decision

`site/preparation/outreach-dispatch-decision.ts` and its focused suite prove:

- the candidate digest binds exact workspace/Company/prospect/Contact scope,
  outbox identity, dispatch key, Profile configuration, Package/Message
  artifacts, separate approval IDs/expiries, sender connection/identity,
  unsubscribe/compliance/basis authority, suppression and stop dependency
  sets, and a short monotonic lease generation/holder/window;
- the final projection independently compares the current candidate, scope,
  artifacts, approvals, sender and policy authorities, dependency sets, and
  exact lease fence;
- expired or swapped leases, invalid/expired approvals, stale artifacts,
  unavailable Profile/Prospect/Contact/sender/unsubscribe/compliance/basis,
  pause or availability loss, high-risk drift, suppression, a stop rule,
  missing approval consumption, any prior provider attempt, or any non-fresh
  delivery state yields a named rejection;
- malformed, duplicate, sparse, accessor-backed, forged, non-synthetic, and
  extra-field inputs fail closed; and
- even a complete current tuple returns
  `synthetic_recheck_passed_no_authority` with
  `providerInvocationAuthorized: false` and literal zero effect counters.

This contract creates no outbox row, lease claim, dispatching transition,
provider envelope, capability, persistence, reconciliation record, send, call,
or export. It does not execute Plan 06-06 and grants no Phase 6 completion
credit.

### Synthetic originated-event and stop-rule decision

`site/preparation/originated-stop-decision.ts` and its focused suite prove:

- a minimized event digest binds exact workspace/Company/Contact,
  connection/connection-subject, known originated message/thread, event kind,
  synthetic sender or bounce class, subject/excerpt digests, suppression/stop
  dependency sets, and occurrence time;
- a confirmed reply or hard/soft bounce describes cancellation of matching
  email follow-ups, while an ambiguous reply describes a pause for review;
- only matching pending work and leases that have not crossed the recorded
  pre-call/provider-attempt fence are eligible; later leased/dispatching work is
  reported separately and terminal work is never presented as cancellable;
- changed events or authority, inactive/unpinned connections, unknown
  originated identity, changed dependency sets, duplicates, future events,
  malformed or hostile plain-data shapes, and forged artifacts fail closed;
- the `eventAuthenticationValid` field is only a synthetic pre-resolved input
  to this pure contract. It is not provider evidence and this module performs
  no mailbox/provider authentication or discovery; and
- every result keeps `persistenceAuthorized` and `cancellationAuthorized`
  false with literal zero effect counters.

This contract receives a bounded caller-supplied synthetic work set and only
describes `wouldCancel`/`wouldPause` identifiers. It creates no event, stop
rule, suppression, pause, cancellation, audit, lease transition, provider
request, send, call, or export. Runtime code may not import it. It does not
execute Plans 06-04 or 06-06 and grants no Phase 6 completion credit.

### Synthetic DeliveryUnknown and reconciliation decision

`site/preparation/delivery-unknown-decision.ts` and its focused suite prove:

- the canonical DeliveryUnknown artifact binds the exact synthetic workspace,
  Company, prospect, Contact, outbox/dispatch, Message artifact, connection and
  subject, originated message/thread pair, RFC Message-ID and marker digests,
  reconciliation dependency set, lease generation, ambiguity class, one
  provider attempt, and observation time;
- accepted-response loss, unknown request transmission, and post-acceptance
  persistence failure all remain `delivery_unknown` and can never authorize an
  automatic retry or another provider invocation;
- only an exact pre-resolved observation of the stored originated message and
  thread can describe a future `sent` resolution. Absence, conflicting
  evidence, or an unavailable connection remains `delivery_unknown` and
  requires owner review and a new Message version before any future
  transmission;
- every current scope, artifact, connection, digest, dependency set, lease
  generation, recorded-state, one-attempt/zero-retry, connection-authority,
  observation-origin, replay, and time condition is rechecked; cross-paired,
  stale, malformed, duplicate, accessor-backed, forged, non-synthetic, and
  extra-field inputs fail closed;
- `observationAuthenticated` and `observationOriginRestricted` are only
  synthetic pre-resolved inputs. They are not provider evidence and this
  module performs no mailbox/provider discovery or authentication; and
- every result keeps persistence, reconciliation, automatic-retry, and
  provider-invocation authority false with literal zero effect counters.

This contract creates no DeliveryUnknown row, reconciliation observation,
audit, delivery-state transition, retry, provider request, send, call, or
export. Runtime code may not import it. It does not execute Plan 06-06 and
grants no Phase 6 completion credit.

## Deferred adapters and exact external decision

The unselected greenfield host and provider are explicit deferred adapters,
not blockers to unrelated local preparation. Continue local synthetic and
reject-by-default work in bounded slices. Stop before the first real target or
provider composition.

The next external decision is not needed for this local lane. When local
readiness eventually reaches that boundary, the owner must separately name and
authorize one new empty greenfield target, its private owner/controller, and
the exact synthetic acceptance drill. Gmail/telephony/provider authorization
remains a later, separate decision and cannot be bundled with target selection.

## Stop condition

Stop before any provider composition, credential handling, hosted action,
production data, real prospecting, enrichment call, export, Gmail request,
phone effect, or external communication. Each requires separate checked
authority after predecessor acceptance.
