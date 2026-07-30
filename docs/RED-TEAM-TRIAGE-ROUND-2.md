# Clean Adversarial Review Triage — Round 2

Verdict received: `BLOCKED` from both product and security attackers. All blocker/high claims were checked against the cited artifacts. This file records the resolution before the next clean review.

## Product review

| Finding | Disposition | Resolution |
|---|---|---|
| Outreach Package approval missing | valid | Added canonical package digest, owner review/approval, expiry/revocation/invalidation, Package Review workflow, and mutation tests. Message approval remains separate. |
| July 24 inputs missing from Git | severity-adjusted then fixed | The owner-supplied files exist outside Git. Their paths, SHA-256 hashes, schema mapping, custody rule, exact counts, and synthetic-CI requirement are now in the migration manifest. |
| Gmail stub could pass W0 | valid | Stub no longer satisfies W0. A real controlled Google account and deployed-host OAuth evidence are mandatory or the host changes. |
| Active configuration rollover undefined | valid | Added impact preview, replacement snapshot activation, schedule rollover, in-flight disposition, requalification, invalidation, pause, and history rules. |
| Outbox race after safety checks | valid | Added bounded send lease, final fresh validation/fencing, pending cancellation, and latch-controlled race tests. |
| Product/Profile schedule mismatch | valid | Added typed Product/Profile schedule owners, independent keys, watermarks, and concurrency. |
| Source tier/independence undefined | valid | Added application-assigned tier rules, publisher/origin lineage, independence groups, override versioning, and fixtures. |
| Prospect invalidation paths missing | valid | Downstream readiness is now a current eligibility projection over immutable history, with `NeedsReview`/`NonContactable` causes and restoration rules. |
| Seven/week mixed funnel stages | valid | Separated discovery/Qualified queue pacing from the Monday-Sunday Export-ready outcome count and funnel losses. |
| Profile absent from Knowledge Scope | valid | Customer Profile is now first-class and the default is the narrowest active scope. |
| Ready Market Play persisted and derived | valid | Ready is derived from an Active, non-paused/non-archived Play with at least one Ready Profile; persisted field is lifecycle only. |
| Suppression absent from CRM rule | valid | Contactable rows exclude all suppressed subjects; optional suppression import is separate and clearly non-contactable. |
| README unsafe quick start | valid | Removed; root now warns that no production quick start exists until gates pass. |

Medium findings were also fixed: the migration has field mappings/stable IDs/counts; every follow-up is a new approved message; Motion is explicitly a legacy mapping term; completion names all four gates.

## Security review

| Finding | Disposition | Resolution |
|---|---|---|
| Send race, Gmail stub, migration inputs | valid | Same resolutions as above. |
| Browser CSRF undefined | valid | Added secure session cookie/rotation plus Origin, Fetch Metadata, session-bound token, and foreign-origin tests for every consequential action. |
| Gmail connection/account/sender binding missing | valid | Added authoritative connection record, Google subject/mailbox/verified aliases/scopes/secret ref/status, one-time state/PKCE, and mismatch tests. |
| Ambiguous Gmail outcome could duplicate | valid | Added deterministic reconciliation marker, explicit `DeliveryUnknown`, no automatic retry after possible acceptance, and owner resolution. |
| Unsubscribe path not executable | valid | Added opaque bound idempotent endpoint and fail-closed reply opt-out flow writing suppression before success. |
| Retention inventory incomplete | valid | Added every identified record/object/cache/log/provider class, triggers, maximums, actions, and exceptions. |
| Billed model work lacked budget | valid | Added immutable per-run/monthly grants, price versions, worst-case reservation, settlement, retry/failover rule, and concurrency tests. |
| Runner/manual abuse limits vague | valid | Added exact durable active/queue/manual/submission/token/audit limits, backpressure, emergency pause, and burst tests. |
| Enrichment reserved units but not money | valid | Added currency and versioned price quote, worst-case monetary reservation, stale/unbounded fail-close, uncertain/partial reconciliation. |

Medium security findings were also fixed: connect-time DNS/IP pinning; server-side suppression recheck for click-to-call; unsafe README path; bounded streaming ZIP restore with path/size/ratio rules; expand/migrate/contract database recovery policy.
