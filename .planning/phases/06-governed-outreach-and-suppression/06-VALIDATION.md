---
phase: 06
slug: governed-outreach-and-suppression
status: prepared-dependency-blocked
nyquist_compliant: true
created: 2026-07-30
---

# Phase 6 — Validation Strategy

## Test Infrastructure and Sampling

Use the existing Node built-in test runner and Miniflare D1 integration. Every mail test injects a fake `MailPort`; no test uses a Gmail SDK, credentials, OAuth authorization, network delivery, real email/phone/contact, or live provider. Keep focused tests under 30 seconds; after each implementation task run `cd site && npm test`, and at each wave run `cd site && npm test && npm run lint && npm run build`.

All negative authorization/provider tests assert both the expected blocked state and `fakeMailPort.calls === 0`, along with zero unauthorized durable mutation. No simulated call may open a dialer or use a real `tel:` target.

## Verification Map

| Area | Threat / failure | Required proof |
|---|---|---|
| Admission/CSRF/scope | foreign, cross-principal, cross-workspace, client-selected subject, stale revision | all owner mutations deny before artifact/approval/outbox/tombstone mutation; public unsubscribe has no read disclosure |
| Package immutability | changed evidence/contact/script/configuration/claim/expiry appears approved | canonical digest fixtures and version-only mutation prove invalidation; package approval alone creates no Message approval/outbox/provider call |
| Message immutability | subject/body/link/attachment/thread/sender/recipient/schedule edit reused | exhaustive canonical-field table creates a new digest/version and blocks old approval; reschedule requires reapproval |
| Contact/freshness | suggestion, stale/wrong-scope/unverified point becomes selectable | Phase 5 class/freshness matrix blocks package/call/send with zero outbox/call; current recheck overrides cached UI |
| Consent/compliance/sender | missing basis/acknowledgement/unsubscribe, wrong From/alias, partial connection scope | enqueue and lease recheck fail closed with zero `MailPort` calls; UI states advisory—not legal approval |
| Outbox/idempotency | duplicate click/retry/concurrent enqueue | same command returns original; key reuse conflict; exactly one approval consumption/outbox/send key and one fake call maximum |
| Lease/races | suppression/pause/archive/drift/revocation after approval or enqueue | deterministic interleavings prove cancellation wins before provider call; stale fence holder cannot dispatch/finalize |
| Unknown Gmail acceptance | adapter accepts then response/write is lost | exactly one fake call, durable `DeliveryUnknown`, marker-only reconciliation, zero automatic retry/alternate-provider call |
| Gmail boundary | OAuth replay/swap/wrong redirect/subject/From, secret exposure, broad mailbox sync | adapter contract negatives fail closed; scans/assertions show secret refs only; sync accepts only stored originated IDs and minimized fields |
| Suppression | alias/domain/phone/Contact/Organization/all-Company tombstone bypass | normalized-subject table and merge/split/delete/import/export/restore fixtures block every matching channel at package/enqueue/lease/call points |
| Unsubscribe/opt-out | success before durable tombstone, replay leaks data, ambiguous reply sends follow-up | generic response/replay tests; tombstone-before-success; explicit opt-out stops work; ambiguous reply pauses for review |
| Manual phone | unverified/stale/static link, freeform script, outcome race | server projection/activation recheck; script equality to approved package; allowed outcomes/notes only; `do_not_call` persists suppression before activity |
| Stop logic | reply/bounce/suppression/pause/drift permits a follow-up | one event cancels every applicable `Pending`/unleased item; a new follow-up requires a new version and approval |
| Audit/minimization | audit/log contains tokens/full bodies/reply content | event schemas/source scans assert digest/bounded metadata only and record actor/action/subject/outcome/reason/fence references |
| UI/accessibility | safety state obscured or disabled control unexplained | render tests require status text + color, native disable + adjacent reason, keyboard/focus behavior, responsive safe ordering, and non-legal copy |

## Required Synthetic Fixtures

- Admitted owner workspace and denied/cross-workspace principals; active/paused/archived/drifted ancestor/Profile/Prospect configurations.
- Approved Prospect with exact immutable qualification/review/evidence/claim dependencies, plus invalid/stale/replaced alternatives.
- Company-wide Contact/Organization/alias graph with fresh verified, stale verified, source/mailer verified, and every ineligible Contact Suggestion class; synthetic E.164 and opaque placeholder email values only.
- Fake mail outcomes: pre-transmission rejection, success, accepted-then-timeout, retryable preflight failure, wrong sender/alias, reply, bounce, explicit opt-out, and unknown reconciliation result.
- Competing outbox leases, concurrent enqueue/suppression/pause/drift transactions, deterministic clock, opaque unsubscribe token digests, and redacted fake connection metadata.

## Manual / Release Gates (Not Authorized by This Preparation Task)

| Gate | Pass signal | Fail-closed behavior |
|---|---|---|
| Predecessor acceptance review | Phase 4/5 input matrix in `06-CONTEXT.md` is implemented and independently verified | no executable Phase 6 plan/implementation |
| Fake `MailPort` adversarial contract | all zero-call, race, unknown-acceptance, and secret-minimization tests accepted | Gmail adapter/capability remains absent |
| Gmail controlled test-account authorization | separate owner authorization covers exact scopes, test mailbox/alias, protected secret handling, and redacted evidence | no OAuth binding, credential, or Gmail request |
| Gmail callback/sender/reconciliation drill | account-swap, partial-scope, wrong-From, state replay, revocation, disconnect, and ambiguous-delivery evidence pass | connection/sending remains disabled |
| Manual-call UAT | owner sees verified-number/script/blocked reasons and records every allowed synthetic outcome without a dialer | phone action remains disabled |
| Independent security/privacy review | no unresolved blocker/high finding across auth, suppression, OAuth, outbox, race, audit, and retention | no release/activation |

## Sign-off Criteria

- All five Phase 6 roadmap success criteria have positive proof and zero-effect negative proof.
- A suppression created after any historical approval but before provider dispatch wins every tested race with zero provider calls.
- Ambiguous Gmail acceptance has one fake provider call, reaches `DeliveryUnknown`, and never triggers automated resend.
- Package approval is demonstrably insufficient for sending; every actual send is bound to a current exact message approval and all lease-time predicates.
- Audit/reconciliation and manual-call evidence are complete while secrets, full message/reply bodies, and real contact data remain absent.
