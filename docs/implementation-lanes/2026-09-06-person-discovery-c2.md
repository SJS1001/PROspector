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

## Next work

C3 owns the operator UI only. C4 owns an integrated synthetic local acceptance
journey and restart/two-tab proof. Neither may compose a real provider or claim
Phase 5 completion.
