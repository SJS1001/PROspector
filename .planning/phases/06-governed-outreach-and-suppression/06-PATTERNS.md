---
phase: 06
status: prepared-dependency-blocked
created: 2026-07-30
---

# Phase 6 — Implementation Patterns

## Pattern Map

| Concern | Pattern to preserve | Closest established analog / contract |
|---|---|---|
| Admission | derive principal/workspace from trusted server session before every read/mutation; neutral failure on denial | `site/domain/interview.ts`, `site/domain/pilot-access.ts` |
| Mutation security | same-origin, Fetch Metadata, CSRF, bounded strict JSON before command dispatch | `site/domain/request-security.ts`, `site/domain/interview-handler.ts` |
| Authority command | canonical allowed input + digest + expected revision + idempotency + immutable audit + fresh projection | `site/domain/commercial-model.ts`, Phase 2 patterns |
| D1 concurrency | unique constraints/FK-backed authority commands are final race arbiters; never rely only on a zero-row update | Phase 2/4 pattern and implementation contract |
| Immutable configuration dependency | versions point to exact configuration/knowledge/contact artifacts; drift invalidates projections rather than history | ADR-0002 and `artifact_configuration_dependencies` |
| Provider separation | domain depends on narrow port; adapter/composition owns platform bindings and secret reference | `ObjectStoragePort`/capability dependency pattern; required `MailPort` |
| Activity/audit | append-only minimal event plus bounded reason/digests; no secret/message/reply body in generic logs | `audit_events`, implementation contract §22 |
| UI authority | one data/transport owner; pure leaves render typed server projections and do not retry/authorize | `site/app/prospector-app.tsx`, Phase 2 UI pattern |

## Suggested Deep Module Boundaries

```text
outreach-package.ts    canonical package/version/dependency/approval commands
message-version.ts     canonical message artifacts and independent approvals
outbox.ts              atomic enqueue, lease/fence, dispatch/reconciliation state
suppression.ts         normalized subject resolution, tombstone/opt-out transactions
manual-call.ts         authorized phone/script projection and outcome/note commands
ports/mail.ts          minimal provider-neutral dispatch/reconcile/sync contract
adapters/gmail.ts      Gmail-specific OAuth/API only; no domain authority
```

No route, React component, browser script, or Gmail adapter may decide package/message eligibility, consume approval, construct a suppression exception, or transition an outbox state without the trusted domain service.

## Consequential Mutation Pattern

1. Derive admitted owner and workspace on the server.
2. Read exact current rows and validate scope, availability, revisions, configuration/dependency, verification/freshness, and strict input schema.
3. Canonicalize only allowed fields in fixed order and calculate the operation/artifact digest.
4. Return an existing result only for the same idempotency key and digest; conflict on different reuse.
5. Insert a guarded authority command, immutable version/approval/activity/outbox row, dependency edges, and bounded audit event in the same transaction.
6. Use unique indexes and fence generation to arbitrate competing mutations; reload an authoritative projection after commit.
7. No external call occurs until a separate worker reaches its fenced latest-state decision point.

For public unsubscribe, the same pattern omits owner admission but verifies the one-way opaque token digest and returns only a generic result; it has no read capability.

## Outbox and Suppression Invariants

- `Pending` arises only from the enqueue transaction after all current predicates pass and consumes the exact message approval once.
- Every provider dispatch uses a short exclusive lease with a monotonic generation. State updates require the matching generation, so a stale worker cannot finalize a newer lease.
- A send key is unique per immutable Message Version/approved dispatch intent. Gmail markers assist reconciliation but do not constitute idempotency authority.
- Any ambiguous provider boundary yields `DeliveryUnknown`, never a scheduler/browser retry.
- Suppression writer and resolver share one canonical normalization library. All outbound/call paths recheck the resolver from authoritative current rows at action time.
- `do_not_call`, unsubscribe, and explicit opt-out persist tombstone before a successful response/activity. Tombstones survive identity changes, deletion, import/export, and restore.

## Credential and Adapter Invariants

- Store only a protected-secret reference/version and bounded connection metadata. Raw OAuth state/code, PKCE verifier, refresh token, access token, and SMTP/Gmail credentials are neither D1 values nor UI/audit/log/export content.
- Gmail is the launch implementation of `MailPort`, not a domain dependency. Its scope check, sender/alias validation, OAuth callback validation, and reconciliation are adapter concerns, while approval/suppression/outbox authority stays in the domain.
- No fallback mail provider, automatic reconnect/account swap, or adapter-directed resend exists.

## UI Invariants

- Render evidence, recipient/contact verification/freshness, package/message digests, dependencies, suppression state, sender identity, acknowledgement/basis, and exact blocker before an action control.
- Controls communicate their precise scope: **Approve package for CRM eligibility**, **Approve this message for queued Gmail delivery**, **Open verified business phone**, **Record call outcome**, **Add suppression**. Never label any as legal approval or an automatic send/call.
- Native disabled controls have adjacent textual reasons; safe links and `tel:` controls vanish or disable on stale/blocked projections. Optimistic state cannot turn an unavailable action into an enabled one.
- Message body/reply/source text is escaped and rendered as data. Narrow layouts preserve safety status and action explanations before optional metadata.

## Anti-Patterns

- A boolean `approved` on a mutable package/message, or treating package approval as message approval.
- Creating a Gmail request directly from a route/button, allowing the adapter to consume approval, or retrying after ambiguous acceptance.
- Using browser-held OAuth credential/state or storing refresh tokens in D1/audit/logs.
- A static `tel:` href, click-to-call from an unverified/stale number, or allowing a call click to record contact activity automatically.
- Suppression checked only when rendering/approval rather than in enqueue, lease, dispatch, and call-outcome transactions.
- Treating an advisory compliance warning or ContactReady projection as consent/sender/Gmail authorization.
- Normalizing email aliases by provider folklore or deleting tombstones during merge/import/restore.
