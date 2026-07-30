---
phase: 06
slug: governed-outreach-and-suppression
status: prepared-dependency-blocked
researched: 2026-07-30
confidence: high-for-contract-medium-for-integration
---

# Phase 6 — Technical Research

## Summary

Phase 6 is a trusted, immutable-artifact system wrapped around two deliberately narrow external boundaries: a provider-neutral mail adapter (Gmail only at launch) and a human-operated `tel:` link. Its safety condition is not “the UI showed Approved”; it is a fresh fenced transaction immediately before the only external call.

```text
Approved Prospect + fresh eligible Contact + active Profile Configuration
  -> canonical Outreach Package -> owner package approval
  -> canonical Message Version -> owner message approval
  -> atomic current-state recheck + one Outbox item
  -> fenced lease + latest-state recheck -> MailPort dispatch
  -> Sent | FailedBeforeDispatch | DeliveryUnknown

fresh verified business phone + approved Package -> server-authorized tel: link
  -> package-derived script -> manual outcome/note -> activity
                                      \-> do_not_call: suppression first

unsubscribe / opt-out reply / bounce / owner suppression
  -> append-only suppression + cancel affected current work
```

## Recommended Technical Shape

| Responsibility | Trusted owner | Boundary / non-owner |
|---|---|---|
| Artifact canonicalization | package/message service | UI only edits draft input; adapter never constructs approval authority |
| Owner command/admission | route handler plus authority service | browser-supplied workspace/principal never trusted |
| Current eligibility | availability/suppression projector | cached client state and historical approval do not decide |
| Atomic enqueue | D1 outbox repository transaction | Gmail adapter cannot enqueue itself |
| Dispatch/reconciliation | leased outbox worker + `MailPort` | Gmail response is evidence, not final state authority |
| Gmail credentials | composition/secret-reference adapter | D1/domain/UI/log/audit never receives raw credential |
| Manual phone activity | call-workflow service | `tel:` link cannot log outcome or bypass recheck |
| Suppression | normalized-subject resolver + tombstone repository | imported/browser/provider claims are normalized and checked transactionally |
| Auditing | append-only audit/activity writer | general logs contain digests and bounded reason codes, not bodies/tokens |

The final names are discretionary, but preserve deep modules such as `outreach-package`, `message-version`, `outbox`, `suppression`, `manual-call`, `mail-port`, and a thin adapter/composition layer. Reuse the Phase 2 admitted-principal, authority-command, canonical digest, idempotency, D1 uniqueness, audit, and pure-leaf patterns.

## Immutable Artifact and Approval Model

Create version rows rather than mutable approved drafts. A package creation command reads the admitted workspace plus exact current predecessor projections, serializes a fixed-order allowlist of fields, hashes it, stores the immutable package/version/dependency edges, and returns a server projection. A message-version command does the same with all content and schedule fields. Unrecognized fields are rejected; HTML and external text remain sanitized display data, not executable markup.

Approval is another expected-revision/idempotent owner command against a reviewed snapshot digest. It must atomically assert that the version is still the current proposed artifact and all selected contacts/configuration/claims are eligible, insert an immutable approval record, and append audit evidence. Do not use an approval boolean on a mutable row. A new version is needed for every canonical change, including “only” a scheduled-time change. Package approval is separate from message approval even where a message belongs to an approved package.

Persist explicit dependency edges from package/message/approval/outbox to the profile configuration, knowledge/Claim Guardrail versions, prospect/contact/contact-point and suppression resolution snapshot. Drift/replace/pause/archive and contact freshness operations can then invalidate/cancel affected projections without broad text searching.

## Outbox, Idempotency, and Unknown Acceptance

The enqueue command is the sole path to a `Pending` item. Within one transaction it must use an idempotency key and operation digest, lock/re-read the message/version approval and latest eligibility, consume the message approval exactly once, create one unique send key, write the outbox item, and append audit events. Same key/same digest returns the existing result; same key/different digest conflicts. D1 unique indexes/FK-backed authority commands, not a zero-row guarded update alone, arbitrate concurrency.

The worker claims only a `Pending` item using a short lease with incrementing fence generation. Before provider invocation it re-reads exact digest, approval, all resolved suppressions, ancestor/Profile/Prospect state, package approval, connection/From identity, unsubscribe token/path, compliance/basis acknowledgement, and high-risk drift. Record `Dispatching` with the lease generation immediately before one adapter invocation. A cancellation racing a lease must be serialized to a bounded decision point before invocation; cancellation/lease generation conditions protect against a stale worker.

Gmail's lack of an application idempotency key is a core design fact. Provide a deterministic RFC Message-ID and bounded artifact marker to support targeted reconciliation, not automatic deduplication. If a request could have crossed the provider boundary, preserve `DeliveryUnknown` with no automatic second call. The reconciliation action can locate the message only within stored PROspector-originated IDs/context; if it cannot prove delivery, owner intervention creates a fresh message version/approval for any future transmission.

## Gmail Authorization and Adapter Boundary

Model connection setup as a separately gated lifecycle, not as a side effect of clicking Send. OAuth state is one-time/high-entropy/short-lived, workspace+principal+redirect+attempt bound, and carries a PKCE verifier digest. The adapter verifies issuer/audience/state/PKCE/subject/scopes, records only non-secret connection metadata and a protected secret reference/version, and audits failures with bounded reason codes. Account swapping, replay, partial scopes, wrong redirect, unknown secret reference, revoked/degraded status, or an unverified From/alias returns a fail-closed dependency result.

`MailPort` should accept a fully authorized minimal dispatch envelope (message artifact identifiers/digests, approved sender identity, recipient envelope, rendered MIME parts/attachments, deterministic marker) and return a normalized outcome envelope. It must not be able to discover arbitrary workspace contacts, persist domain state, choose credentials, select a fallback provider, or consume approvals. A fake mail port with controllable pre-transmission failure, accepted-but-lost response, mismatch, reply, and bounce outcomes is the first implementation target. Gmail OAuth/SDK installation/authentication is a later owner-authorized release gate.

## Suppression Resolution and Manual Phone

Keep canonical normalized subjects and a resolver rather than sprinkling string comparisons across callers. Resolver input is the current Company/Contact/Organization/contact point plus channel; output is a reasoned, immutable-safe blocked/allowed projection. It must evaluate exact email, confirmed domain alias, E.164 phone, Contact, Organization, and all-Company tombstones, including merge/split aliases. Tombstones are append-only and export/restore durable.

Unsubscribe, explicit opt-out replies, and manual `do_not_call` must call one suppression-writing transaction before they return a success or activity status. The same transaction inserts/cancels pending and unleased follow-ups. Ambiguous replies pause only; they do not guess consent or opt-out. The public unsubscribe endpoint sees only an opaque token digest and provides a generic response regardless of replay/validity to avoid contact disclosure.

Manual calling is an activity workflow, not an adapter. The server projects a fresh verified business phone, current authorized `tel:` target, immutable package-derived script, and allowed outcomes. On outcome submission, it rechecks availability/suppression and records bounded notes; `do_not_call` inserts suppression first. It cannot open a dialer, record audio, autodial, or treat a click as a completed call.

## Planning Risks and Required Mitigations

| Risk | Required mitigation |
|---|---|
| Package approval accidentally treated as send approval | distinct immutable approval types and negative tests proving PackageReady has no outbox/send mutation |
| Changed draft/reschedule sent under stale approval | canonical field allowlist/digest + version-only mutation + approval invalidation/recheck |
| Duplicate Gmail request during retry/race | unique outbox send key, approval consumption, fenced lease, fault-injection assertions of one adapter invocation |
| Gmail may have accepted a request | terminal `DeliveryUnknown`, bounded reconciliation, no automatic resend/failover |
| Opt-out/suppression loses race with queued work | subject resolver plus transactional enqueue and lease pre-call recheck/cancellation race tests |
| Credential or OAuth data leaks | secret references only, structured redaction/source scans, negative DB/log/export/browser assertions |
| Stale or suggestion phone/email becomes outreach eligible | Phase 5 class/freshness recheck at package/call/send and zero-effect negative tests |
| Call script is altered into unapproved claims | derive it only from package version; package edit/version invalidates approval |
| Advisory compliance represented as legal clearance | explicit advisory copy and a required acknowledgement/basis/sender/unsubscribe predicate without legal verdict |
| Gmail-specific logic contaminates domain | `MailPort` fake contract first; Gmail adapter is isolated and no silent provider failover |

## Preconditions and Current Blocker

Phase 6 cannot be decomposed into executable implementation plans until Phase 4 and Phase 5 provide the exact accepted input matrix in `06-CONTEXT.md`. In particular, a planner needs implemented current-availability, configuration/dependency, qualification/review, ContactReady/freshness, identity merge/suppression-subject, idempotency/audit, schema/migration, and route-security contracts. This work must also retain Phase 4's dependency on absent Phase 3 authority rather than fabricate it.

## No-Effect Preparation Boundary

This research authorizes only provider-neutral design and fake-port/testing plans. It does not authorize provider/package installation, Gmail OAuth, credentials, sending, calling, external message lookup, contact scraping, spend, deployment, or real data. Any live Gmail binding requires separately accepted fake-port proof, exact-scope/secret handling review, controlled test-account authorization, and release-gate evidence.
