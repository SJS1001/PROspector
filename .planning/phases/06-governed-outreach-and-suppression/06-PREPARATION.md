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
runtime import of the preparation state machine.

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
