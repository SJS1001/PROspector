# Contacts pagination candidate (2026-09-05)

## Scope

This local-only candidate replaces the Contacts reader's unbounded history reads
and silent browser truncation with three independent, exact 20-row pages returned
by one owner-authenticated GET:

- `contactsPage` contains the newest eligibility snapshot per
  prospect/contact pair at the page high-water tuple;
- `identityPage` contains owner-scoped identity suggestions; and
- `approvedProspects` contains only prospects satisfying the exact current grant
  issuance predicates.

Each page includes the closed `contacts-page-info/v1` object with the limit, total,
returned count, next-page state, and an optional opaque next cursor. Cursor query
names are exact. Unknown, duplicate, malformed, cross-feed, cross-workspace, or
cross-principal cursors fail with HTTP 400. HMAC authentication uses the explicit
`prospector.contacts.cursor.v2` domain and binds each cursor to its feed,
workspace, principal, exact feed generation, high-water `(time,id)` tuple, and
keyset. Each cursor also carries a signed server-derived capability epoch composed
from the code/build epoch and the request-time active-command state plus the
non-secret active and complete verification key-ID set of the effective attestor.
Any active or attestor-enabled composition must provide an explicit server-side
build epoch; absence fails closed. The current reject-only route may use the safe
inactive code/schema default, while a future hosted adapter must bind actual
deployment/version metadata and rotate it whenever cursor semantics or capability
composition changes. A deployment, verification-set, or authority-composition
change therefore invalidates an old cursor with HTTP 409 without trusting browser
input or exposing key material. Future high-water tuples,
unordered or duplicate query rows, and keysets not strictly after the prior key
fail closed.
Migration 0018 backfills a zero generation for every existing workspace, while
source-table triggers UPSERT and advance the affected feed generation for new
workspaces and every insert, update, or delete. Every source update advances the
old workspace and, when the row moves, the distinct new workspace. Phase-activation gate inserts,
updates, workspace moves, and deletes conservatively advance all three feeds.
Generation values are exact non-negative integers capped below JavaScript's unsafe
integer boundary; triggers abort before overflow. The handler reads all three
generations before the gate/capability read and after assembling the pages; stale
cursors, gate changes, and mid-request writes return HTTP 409 instead of returning
mixed authority. Contacts freshness is
always re-evaluated at the current request time; an old cursor cannot preserve
expired evidence. Approved-prospect cursors additionally bind a domain-separated
digest of the exact Approved feed generation as well as the top tuple. Relevant
prospect, configuration, candidate, or assessment writes advance that generation,
so a later issuance-predicate change returns HTTP 409 `contacts_page_drifted`
without loading or imposing a ceiling on the complete Approved set.

The browser keeps separate cursor histories for Contacts, Identity Suggestions,
and Approved Prospects. Next/Previous on one feed preserves the locations of the
other two. Every navigation or full refresh synchronously clears both prospect and
identity selections/confirmations before reading authority. Identity controls and
requests remain disabled until authority is ready and while page loading or any
identity mutation is pending. A synchronous client authority guard closes queued
event races before React state renders. After an unknown identity result, only a
successful authoritative GET retires the one-shot attempt latch and reopens the
controls; the original idempotency key remains bound to that suggestion so a later
separately explicit action converges safely. Failed recovery remains closed. There
is no automatic selection, POST retry, or provider action.

## Bounded evidence verification

Only observations that are referenced by the selected contact snapshots are
loaded, with one workspace-scoped `json_each` set query. Exact snapshot linkage
and current freshness are checked before reservation IDs enter the verification
set. Settlement verification then uses two set queries: one for the latest
terminal headers, and one for the requested receipts/observations. Each
reservation retains the existing complete terminal-state, canonical observation
list, receipt digest, settlement material, and bound-attestor checks, with a
101-row sentinel enforcing the existing 100-receipt limit. Each of the 20 contact
rows may carry the server contract's exact maximum of 100 observations, so up to
2,000 referenced observations/reservations are supported without per-reservation queries; malformed
or over-bound settlement groups downgrade only their affected rows to review.

## Deliberate non-changes

- Stage 2 remains disabled and its disclosure hold remains in force.
- `providerCall` remains false and the production route still composes no command
  service, provider, credential, or external effect.
- Generated additive migration `0018_massive_blizzard.sql` adds the three measured
  page-order indexes for eligibility snapshots, owner identity suggestions, and
  active approved prospects, plus the generation table/triggers required for
  cross-request stability. Focused `EXPLAIN QUERY PLAN` evidence confirms these
  orderings use the named indexes without a temporary B-tree. Exact `total` counts
  remain workspace-bounded scans and can therefore grow with the current set; the
  implementation does not load those rows into application memory and this
  candidate does not claim constant storage work for totals.
- This does not claim Plan 05-07 completion or hosted readiness.

## Acceptance evidence

Focused tests cover exact metadata at 0/20/21/large counts, cursor tampering,
secret rotation and scope/feed/query rejection, stable/future high-water tuples,
generation drift for same-time/backdated inserts and in-place/dependent writes,
phase-gate insertion/deletion/workspace-move invalidation, capability-epoch
rotation, gate-read fencing, safe-generation overflow rejection, strict row order,
sentinel validation, independent browser page history, synchronous identity reset
and disabled controls during a delayed fetch, an integrated 25-reservation page using exactly
one observation query and two settlement queries, the per-reservation receipt
sentinel, a 2,001-row Approved total without availability loss, populated additive
migration/backfill/UPSERT triggers, foreign-key check, and named-index query plans.
Existing Contacts handler/UI tests remain the
compatibility gate for owner admission, privacy projection, command closure, CSRF,
and default-deny behavior.
