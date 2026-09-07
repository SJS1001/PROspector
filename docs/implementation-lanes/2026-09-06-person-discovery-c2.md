# Person discovery C2: closed transport and read projection

**Base:** `debc9a3da0f9d0d8e2d3470a23b3a2e901cfc13c`
**Scope:** issue #6, C2 only

## Delivered boundary

`person-discovery-handler.ts` is a separate, owner-admitted Contacts child
transport. It accepts only bounded, exact-key JSON commands for a start,
explicit no-match/create/link decision, or verification intent. Workspace,
principal, approved Prospect, current configuration, completed run, and
relevance authority are always re-derived on the server. CSRF, same-origin,
optimistic revisions, idempotency, and C1's transaction-level authority checks
remain mandatory.

The only route composition deliberately supplies **no** discovery service. It
therefore exposes a read projection but rejects every mutation with capability
unavailable. Tests may inject C1's branded zero-network fake directly into the
handler; there is no app/runtime binder for it.

The projection labels each candidate `suggestion_not_contact`, `eligible:false`.
It preserves the latest immutable run's `requested`, `completed`, or
`needs_reconciliation` state; an empty completed run remains completed with its
run/result identity rather than being represented as a new run.
It exposes read-only run terminal state, bounded candidate page, owner
decisions, scoped Prospect-to-Contact relevance, and verification **intent**
history without representing a candidate as a Contact or a verification intent
as verified evidence. `peopleCursor` is separately signed and binds workspace,
owner principal, Prospect revision, current configuration digest, current run
result digest, generation, high-water, and after key. Its page size is five,
so ordinary multi-page behavior is exercised without weakening C1's per-run
candidate maximum. It cannot be substituted
for existing Contacts, identity, or approved-Propect cursors.

## Explicit exclusions

No migration, provider, credential, contact-point evidence, ContactReady
promotion, network call, persistence outside C1 commands, export, schedule,
mail, telephone, hosted state, or outbound effect is added. At read time an
expired or already-redacted candidate becomes `payload_unavailable`: its raw
name, role, and candidate digest are not returned. A mutation/redaction between
pages advances C1's generation and invalidates the signed cursor. C1 also
rejects decisions on a candidate at or after its retention expiry inside the
transaction guard; presentation is not the authority fence.

## Adversarial handler coverage

The focused C2 suite exercises the real handler with the C1 test-only,
zero-network port. It proves create-new, no-match, link-existing and
initial-verification command paths; exact durable start/decision/intent replay
after disposable projection drift; rejection of changed command fields without
extra discovery, Contact, relevance, intent, evidence, or eligibility rows;
and reject-only production-shaped composition. It also covers foreign origin,
wrong intent/content type, oversize/extraneous bodies, outsider admission,
malformed service replies, finite public reason allowlists, and CSRF-gated
capability rejection.

Pagination evidence covers 0, 5, 6, and 20 candidate states, five-row pages,
stable initial high-water traversal, HMAC tamper rejection, Prospect cursor
substitution rejection (including an unavailable target), and generation drift
after a mutation. A completed cursor is also invalid once a later current run
is in reconciliation. Projection selection uses a current-authority SQL
predicate before its 100-row display bound, so historical rows cannot crowd out
a current Approved Prospect. Known-person state derives from current
Contact/relevance/run lineage, not retained candidate payload. Expiry/redaction
therefore remains payload-free without erasing current relationship state. The
route-level local-demo regression proves a valid CSRF POST still receives the
unavailable capability, with no composed service/provider. C1 suites retain the
lifecycle/configuration/ancestor TOCTOU, retention, and concurrent durable
winner assertions underneath the handler; no test composes a provider or
authorizes an external effect.

## Closure evidence — 2026-09-06

The C2 handler suite now proves the transport rejects every wrong-action
accepted payload, empty or malformed action-matched nested accepted record,
impossible run state/result pair, malformed candidate array, and
blocked/conflict reason outside that action's finite allowlist. The public
accepted-run validator requires an exact envelope and the exact
`operationKey === pd_${requestDigest}` binding, state-correlated
result/reason/candidate shape, and bounded exact candidates/provenance. A
redacted candidate key must be exactly `redacted:${candidate.id}`; live keys
remain constrained to the exact bounded `candidate:<64-lowercase-hex>` digest
contract. Decision and intent envelopes are exact too. Those denials make no
extra fake call and add no run, decision, Contact, relevance, intent, effect,
authority-command, or audit row beyond the fixture baseline.

Exact stored decision and verification-intent replays survive each independent
Company, Product, Market Play, Profile, Prospect, and effective-configuration
drift; any changed same-key field conflicts with no extra discovery or
business/effect write. Real concurrent handler requests prove one durable
start winner and one durable owner-decision winner. The suite also proves
single-use CSRF, legacy-owner admission without outsider admission, and a
stale-authority GET projection.

Each expiry case starts from a fresh completed, undecided candidate. At the
candidate expiry instant and one millisecond afterward, both `create_new` and
`link_existing` return the specific `candidate_unavailable` denial before the
physical retention sweep, with no decision, Contact, relevance,
authority-command, audit, or fake-provider call. A cursor is minted only after
the decision/relevance generation changes, proven valid immediately before
physical redaction, then proven to drift solely because that redaction advances
generation. An uncursored expiry projection is neutral and payload free.
Existing Contact/relevance lineage keeps `knownPerson` true after historical
candidate payload is physically redacted.

Executed sequentially with loopback-capable Miniflare fixtures: all sixteen
`person-discovery-handler` cases; all three core `person-discovery` cases; all
ten recovery/retention cases; all four authority-fence cases; and all four
migration/production-port cases. No provider, credential, hosted target,
outbound effect, UI composition, or migration was added by C2.

## Next work

C3 owns the operator UI only. C4 owns an integrated synthetic local acceptance
journey and restart/two-tab proof. Neither may compose a real provider or claim
Phase 5 completion.
