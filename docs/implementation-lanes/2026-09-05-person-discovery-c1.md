# Person discovery C1: governed local authority boundary

**Prepared:** 2026-09-05
**Base checkpoint:** `14642909290dec855467ab79a3542f47cce1e72a`
**Candidate branch:** `codex/person-discovery-workflow`
**Scope:** issue #6, work unit C1 only

## What C1 establishes

Migration `0019_person_discovery.sql` is additive and forward-only. It adds
immutable discovery runs and events, bounded candidates and provenance, explicit
owner decisions, Prospect-to-Contact role relevance, and verification intents.
Every consequential insert is workspace-scoped and backed by the complete live
ancestry: active Company, ready Product, active Market Play, ready Profile,
current Approved Prospect, exact configuration digest/revision, owner subject,
and workspace revision. Owner decisions and verification intents also bind a
canonical authority command and audit event in the same transaction. New rows
increment the existing bounded Contacts projection
generation; they do not introduce a second cursor authority.

The domain boundary accepts only a branded fake minted from a test-owned helper;
no production or app module exports that binder. Production builds additionally
reject the test brand. The production port is unavailable and has no endpoint,
provider, credential, transport, or retry capability. A completed discovery candidate remains historical evidence:
it is not a Contact, contact-point observation, verification receipt, or
eligibility snapshot. Candidate display/role payloads expire after 90 days and
provenance source/excerpt payloads after at most 24 months. Audited redaction
keeps immutable digests and structural history while removing raw personal text.

An owner must select exactly one terminal decision:

- `no_match` records the immutable decision and creates no Contact, relevance,
  or contact evidence;
- `create_new` atomically creates one same-workspace Contact, the decision, and
  the role-relevance binding; or
- `link_existing` atomically binds one explicitly identified same-workspace
  Contact. No candidate name or identity digest is used for automatic matching.

Verification is recorded as an intent only. `initial_verification` cannot name a
source observation. `stale_refresh` must name an expired verified observation
for the same Contact and current configuration. Its channel-specific freshness
window and policy digest are pinned from the exact active Contact Strategy; no
hard-coded freshness default is authority. A newer trusted observation suppresses
refresh only when it belongs to that exact current configuration, and the same
test is repeated inside the atomic intent transaction to close precheck races.
Neither intent authorizes a provider call or creates eligible evidence.

Same-key/same-digest replay returns the original durable result. Changed reuse,
stale or foreign authority, invalid lifecycle, invalid decision shapes, and
write races fail closed. Timeout, unknown, malformed, and over-cap test outcomes
become `needs_reconciliation`; the service does not retry them automatically.
The test-only port receives an AbortSignal and bounded deadline. If a process
dies after persisting `requested`, a later same-digest replay fences the stale
request into reconciliation instead of issuing a second provider call.
Fresh idempotency keys carrying the same canonical semantic request reuse the
same run, including concurrent writers. If that semantic run is an expired
`requested` record, exact-key and fresh-key callers both fence it into
reconciliation without a second provider invocation. Historical terminalization
is allowed even if Company, Product, Market Play, Profile, Prospect, or
configuration authority has since drifted; current authority still gates every
new invocation and consequential action. A completion that wins a stale-request
recovery race is replayed as the durable terminal result. Deadline expiry is
recorded distinctly as `timeout`; other provider exceptions remain unknown.

Candidate keys are server-derived digests; providers cannot choose identity
keys. Business prose and source references use separate conservative positive
admission shapes plus explicit rejection for contact points, IP literals,
obfuscated phone/email forms, URL userinfo/query/fragment material, private-key
markers, high-entropy opaque runs, and tested common provider-token prefixes.
Legitimate Unicode business prose, punctuation, and HTTPS references without
credentials, query, or fragment material remain supported. Percent escapes are
canonically decoded to a bounded fixed point before either prose or source
admission; malformed or over-depth encodings fail closed while ordinary percentage
prose and canonical URL escapes remain supported. This minimization is a bounded
C1 admission contract, not a claim that arbitrary future secret formats can be
recognized exhaustively; future provider projection must retain the same strict
shape and add provider-specific review.

## C1 executable evidence

From `site/` with Node.js 22.13 or newer and loopback permission:

```text
node --test tests/person-discovery-migration.test.mjs tests/person-discovery.test.mjs \
  tests/person-discovery-recovery-retention.test.mjs \
  tests/person-discovery-authority-fences.test.mjs
```

The focused suite covers migration metadata/application, immutability and
generation invalidation, candidate-not-Contact, no-match zero authority writes,
create/link atomicity and races, replay conflicts, stale/foreign authority,
bounded canonical payload rejection, importer-safe triggers, deadline/restart
recovery, audited expiry/redaction, lifecycle/TOCTOU fences, canonical command
and audit bindings, non-default Contact Strategy freshness, preservation of
programmer errors, semantic deduplication, terminal-winner and retention races,
production-shaped `observed` source-candidate compatibility, newer-fresh-source
suppression with an exact-current-configuration transaction fence, a
production-bundle fake-port spoof assertion, server-derived candidate identity,
and zero provider/evidence effects. Touched files are also
linted directly. These checks
are C1 evidence only; they are not the held canonical preflight and do not make
Phase 5 complete.

The ordinary Wrangler local bootstrap intentionally remains at migrations
`0000`–`0009`. Migration `0018_massive_blizzard.sql` predates C1 and is not safe
for Wrangler's whole-file importer because its generated triggers contain nested
`CASE ... END` tokens. Therefore C1 is deliberately unavailable in the ordinary
local runtime until that separate predecessor migration is normalized and its
full chain is reverified. Focused C1 fixtures apply `0010`–`0019` statement by
statement; that is test evidence, not a runtime activation claim.

## Remaining work unit C

### C2 — guarded transport and projection

Add owner-authenticated handlers and Contacts projections over the C1 service.
Bind optimistic revisions and anti-CSRF/origin rules at transport boundaries;
preserve stable pagination and generation invalidation. Runtime composition must
still use the unavailable production port until a separate provider decision and
credential authority exist. Add handler and projection tests, including stale
tabs and outsider denial.

### C3 — Contacts operator UI

Render current Approved Prospects with no known person, immutable candidate
provenance, explicit no-match/create/link decisions, and clear reconciliation
states. Keep candidates visually distinct from Contacts and verification intent
distinct from verified contactability. Add accessibility, stale-state, and
plain-language UI tests.

### C4 — integrated synthetic acceptance

Exercise the public local path from an existing explicit synthetic Approved
Prospect through discovery, owner decision, and verification intent across a
runtime restart and two-tab conflicts. Prove literal zero network, provider,
outbound, export, and eligibility effects. A later real provider or hosted test
requires its own owner gate and must not reinterpret C1 records as provider
acceptance.

Do not create a Phase 5 summary or claim Phase 5 completion from this slice.
