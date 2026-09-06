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

## Next work

C3 owns the operator UI only. C4 owns an integrated synthetic local acceptance
journey and restart/two-tab proof. Neither may compose a real provider or claim
Phase 5 completion.
