# Guarded LOCAL_DEMO composition track

**Status:** accepted only for the strictly local, zero-effect composition track

**Recorded:** 2026-09-09

**Scope:** bounded local scenario-projection and UX composition only

**Acceptance credit:** none

## Purpose

Substantial Phase 4–7 implementation is now merged on `main`, including
profile/prospecting workflows, fictional contact/enrichment boundaries,
governed-outreach and suppression cores, morning/weekly outcome projections,
CRM preview, and local portability foundations. Those artifacts remain a mix
of locally wired, test-only, reject-only, and runtime-unreachable work. Their
presence does not satisfy their checked plans or their predecessor, hosted,
provider, credential, real-principal, human-review, or owner-acceptance gates.

The supported-screen journey now composes the merged Phase 4–7 UX into a
coherent fictional story. It demonstrates the operator moving from a ready synthetic
Profile and qualified Prospect through fictional contact/enrichment review,
exact Package and Message review, suppression and manual-call outcomes, and
the weekly/CRM/portability surfaces. Existing focused tests and separate
browser lanes prove individual seams; they do not prove this cross-phase UX
ordering, state hand-off, reload behavior, or fail-closed presentation as one
journey. This is implementation and local acceptance evidence only, with no
formal phase or production acceptance credit.

The composition endpoint exists in source only as `route.localdemo`. The
repository-pinned operator browser runner copies that shell into its disposable
runtime as `route.ts`; production discovery never sees it. The shell completes
the development/flag/Access-disabled/loopback/owner checks for every request
and, for a progression command, same-origin, one-time CSRF, current revision,
fixed workspace, and HMAC-signed scenario authority checks before dynamically
importing the composition handler. GET only initializes or resumes a transient
15-minute session. POST advances one of four in-memory display revisions. A
reload resumes within that disposable runtime; a runtime restart invalidates
the cookies and authority and starts at revision zero. Neither operation writes
D1, R2, filesystem, browser storage, or an external service.

The legacy `/api/local-demo/crm-handoff-preview` route was removed. Phase 7 CRM
presentation is metadata and refusal evidence inside the single composition:
eligible-row count, field count, and `materializationAuthorized=false`. It
creates no CSV text, bytes, codec call, download, clipboard, blob, or data URL.

The browser case snapshots row counts in every local SQLite/D1 and R2 backing
store immediately before the composition journey and again after progression
and reload; all snapshots must be identical. It
also captures every browser request during that window and requires every
origin to be the exact loopback runtime. The lane's final verifier separately
checks the aggregate E1 bootstrap/review state, forbidden-table emptiness, and
zero R2 objects/multipart uploads. That aggregate verifier is not presented as
proof that bootstrap wrote nothing; the around-journey snapshot is the
composition-specific zero-persistence evidence.

## Exact proposed boundary

The owner's repeated authorization accepts this track only for development-gated
`LOCAL_DEMO` composition, fictional fixtures/projections, supported-screen UI,
and local automated or browser acceptance evidence needed for that journey.
Every entry point must
require all of the existing development, exact `LOCAL_DEMO`, loopback,
same-origin, and synthetic-owner fences. Production builds must continue to
exclude demo fixtures and routes. Inputs must be fixed fictional/disposable
data; caller-supplied identity, address, message, phone, provider, credential,
file, or target material must fail closed.

This track proposes no ordinary mutation endpoint and no relaxation of one.
Scenario reads or changes must use only dedicated development-only local-demo
seams whose implementation is reached by dynamic import after the complete
guard. They may project fictional state but may not compose a retrieval,
runner, enrichment, mail, phone, export, delivery, archive, or restore port.

The composed story may describe future decisions and may render deterministic
fictional projections. It must not turn preparation-only modules into
production runtime authority, relax an existing reject-only decision, or claim
that any external event occurred. Where an underlying real boundary is still
blocked, the UX must say so and keep the fictional preview visibly separate
from an empty/refused real decision.

This limited acceptance grants **no**:

- Phase 4, 5, 6, or 7 plan, requirement, phase, or milestone completion credit;
- satisfaction of any `depends_on`, hosted, provider, credential,
  real-principal, security/privacy review, or human-acceptance checkpoint;
- hosted target, Cloudflare, Access, route, deployment, secret, schedule, or
  control-plane action;
- provider selection/composition/invocation, network call, spend, Gmail,
  mailbox, telephone, runner, callback, retry, or outbound effect;
- use of real or production data, contacts, addresses, phone numbers, message
  bodies, credentials, tokens, provider responses, or protected references;
- D1/R2/filesystem/browser-storage persistence authority, migration, import,
  archive, restore, or durable state claim;
- CSV/file/archive byte delivery, download, clipboard transfer, external
  export, or CRM handoff authority.

Any later request for one of those capabilities requires its checked plan and
a separate exact authorization. A passing local journey cannot be cited as
substitute evidence.

## Dependency order

Work within this accepted local-only track must preserve the
product authority order even though every record is fictional and non-durable:

1. Reuse the accepted local identity/onboarding/Knowledge and Product/Offer
   foundation; do not reopen Plan 02-99 or Plans 03-09–03-11.
2. Compose the existing Phase 4 ready-Profile, qualification, provenance, and
   owner prospect-review projection before exposing later actions. Model
   discovery without invoking a runner/retrieval port or claiming a run.
3. Compose Phase 5 fictional suggestion → verification-intent → visibly
   fictional `ContactReady`-shaped projection only after an approved Prospect;
   keep the real provider and persistence decisions refused.
4. Compose Phase 6 exact Package review before exact Message review, then show
   suppression/current-state rechecks before any fictional dispatch or manual
   outcome. This is an approval/suppression preview only: no preparation-module
   runtime import, usable `mailto:`/`tel:` target, outbox dispatch, or provider
   invocation. Effect counters remain false/zero.
5. Compose Phase 7 morning/weekly outcome and CRM/portability previews only
   from the preceding fictional projections. Real admission stays empty,
   export/download stays absent, and restore remains a compatibility preview.
   The integrated CRM preview may render field names, row-shaped fictional
   values, counts, and refusal reasons, but must not call the CSV codec or
   materialize CSV text/bytes.
6. Run the supported-screen browser journey, restart/reload and accessibility
   checks where applicable, production-bundle exclusion checks, canonical
   tests/lint, and exact zero-effect assertions.

Parallel implementation would be permitted only for independent seams with
non-overlapping ownership. The final composition and browser proof wait for
steps 2–5 in order. No `*-SUMMARY.md` may be created from this track.

## Exact zero-effect verification

Every slice must record its exact base/head and true exits for focused tests,
the applicable lint/build commands, and `git diff --check`. The corrective
slice deliberately leaves the full `npm test` lane to its integration owner.
Browser-affecting work must run the applicable checked browser command with the
repository-pinned Chromium revision and its after-run verifier. A mismatched
browser is not evidence.

The exact-head evidence must prove:

1. Only development mode plus exact `TRUSTED_IDENTITY_PROVIDER=local-demo`,
   `LOCAL_DEMO=1`, disabled Cloudflare configuration, canonical loopback host,
   same-origin mutation, owner admission, and fresh CSRF can admit the scenario.
   Missing/conflicting bindings, non-loopback, foreign Origin, non-owner,
   stale authority, and cross-workspace input deny.
2. Every identifier, person, company, address-like value, source, outcome, and
   cost is visibly fictional; no secret, credential, real identity/data, or
   retired-Sites identifier is present.
3. The captured request log has no non-loopback destination. Provider, runner,
   spend, mail, phone, schedule, export/delivery, archive, restore, and all
   other external-effect counters are literally zero. There is no retry after
   a denial, stale conflict, uncertain result, or lost response.
4. A fresh production build has no source maps, unresolved build-mode gate,
   demo identity, scenario binding value, local-demo route body, representative
   fixture marker, or ordinary-route import of the scenario. Local-demo URLs
   behave as unknown in production.
5. The integrated UI has no CSV bytes, `Content-Disposition`, download,
   clipboard, `blob:`, `data:`, `mailto:`, or `tel:` affordance.

Any nonzero effect, real-data input, unclassified durable object, production
reachability, missing negative proof, or dependency drift fails the slice and
blocks downstream LOCAL_DEMO work.

## Stop conditions

Stop immediately if the work would require a hosted resource, network/provider
port, credential or protected reference, real data, persistent write,
migration, scheduler, CSV materialization, export/download, outbound action,
production route, or a change to a checked plan's formal dependency or
acceptance contract. Record the gap instead of simulating evidence or widening
authority.
