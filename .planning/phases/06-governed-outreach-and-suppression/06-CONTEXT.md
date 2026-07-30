---
phase: 06
slug: governed-outreach-and-suppression
status: prepared-dependency-blocked
gathered: 2026-07-30
---

# Phase 6: Governed Outreach and Suppression — Context

**Status:** Architecture and UI are prepared. Executable planning is blocked until the exact Phase 4 and Phase 5 inputs below exist as accepted, active records with verification evidence.

<domain>
## Phase Boundary

For an approved prospect with a currently eligible verified business contact, the owner can create an immutable Outreach Package, review and approve its exact contents, separately approve each exact Gmail draft, and use a manual verified-phone workflow.  The trusted application enforces Company-wide suppression, preserves immutable approval/audit evidence, and fails closed at credential, consent, and provider boundaries.

This phase owns package/message artifacts, Gmail connection authorization boundary, transactional outbox/send lease, Gmail-originated-thread status ingestion, manual click-to-call/script/outcome/notes, unsubscribe/reply/bounce stop rules, suppression tombstones, and their audit/invalidations. It does not select a mail provider beyond the already-locked Gmail launch adapter, authenticate Gmail, transmit email, dial/record calls, scrape contacts, spend money, export CRM rows, or introduce legal adjudication.
</domain>

<decisions>
## Locked Implementation Decisions

### Package approval and message approval are different authorities

- An Outreach Package is a canonical immutable version containing Prospect/Contact/Profile Effective Configuration IDs, qualifying evidence/source hashes, recommended angle, Claim Guardrail dependencies, selected role/contact points, package-derived call script, and the complete set of draft Message Version IDs. Sorted canonical JSON receives a SHA-256 digest.
- The owner approves exactly that package digest; the immutable, audited approval expires under the configured policy (pilot default 30 days). Any package field/dependency, selected contact verification/freshness, profile configuration, or revocation change invalidates it.
- A valid Package approval makes the Prospect currently eligible for PackageReady/CRM handoff only. It neither sends, schedules, nor approves a Gmail message.
- Each Gmail Message Version independently binds sender/From/Reply-To, normalized To/CC/BCC, subject, UTF-8 text/HTML bodies, ordered normalized links, attachment identity/metadata/digest, thread/reply IDs, intended send time/timezone, Package ID, and Profile Effective Configuration ID. Every canonical-field edit, including rescheduling, creates a new digest and demands a new owner approval with explicit compliance acknowledgement.

### Gmail is launch-specific behind a provider-neutral trusted port

- Domain services depend on `MailPort`, a `ClockPort`, and repository interfaces. Gmail OAuth/API SDK code lives only in an adapter/composition layer; domain/UI code must not import a provider SDK or accept provider responses as authority.
- The sole launch adapter is Gmail. Connection metadata may identify workspace, connecting principal, Google subject, canonical mailbox, verified send-as aliases, exact granted scopes, protected secret reference/version, status, and bounded verification metadata. Refresh tokens, OAuth codes, bearer tokens, and raw secret material never enter D1, browser state, logs, exports, audit detail, fixtures, or planning artifacts.
- Authorization is not credential enablement: an absent/revoked/degraded connection, partial scope, OAuth state/PKCE replay, account swap, subject mismatch, unverified From, missing protected-secret reference, or adapter health uncertainty blocks send with zero provider calls. Reconnect cannot silently select a different mailbox/subject.
- Gmail sync is restricted to stored PROspector-originated thread/message identifiers. It persists only delivery classification, bounce metadata, reply time/sender, bounded subject, and minimized excerpt needed for stop logic; it never imports a mailbox.

### Draft-to-send is a fenced transaction, never a browser effect

- Owner approval enqueues at most one transactional-outbox item with a unique send key after one atomic transaction checks exact unused/unexpired approval, digest, owner identity, all suppression subjects, Package/Profile/Prospect availability, high-risk drift, connected sender identity, working unsubscribe path, recipient jurisdiction/basis fields, and compliance acknowledgement. Approval consumption and outbox creation are atomic and idempotent.
- The worker acquires a short exclusive lease with a monotonically fenced generation and rechecks those predicates at the latest committed revisions before it records `Dispatching` and invokes `MailPort`. Suppression, pause, archive, approval revocation, and drift cancel pending/unleased work; a race against an acquired lease resolves at the lease's bounded pre-call decision point, with the new blocker winning before a provider call.
- Gmail has no application idempotency guarantee. Set deterministic RFC `Message-ID` and a bounded PROspector marker solely for reconciliation; do not infer Gmail deduplication. `Pending -> Leased -> Dispatching -> Sent`, `Cancelled`, `FailedBeforeDispatch`, and `DeliveryUnknown` are explicit durable states.
- A failure known to precede request transmission can be retried under the same controlled outbox authority. Once acceptance is ambiguous, record `DeliveryUnknown`, search only the connected originated-mail context for the marker, and require owner reconciliation. Never automatically resend; a second send requires a new immutable message version and approval.
- Follow-up templates are not approvals. A follow-up is a new Message Version after the preceding touch and stop rules allow it; reply, bounce, suppression, pause, package invalidation, archive, or high-risk drift cancels applicable pending follow-ups.

### Suppression is a Company-wide, append-only transactional prohibition

- Suppress exact normalized email, owner-confirmed email-domain equivalence where applicable, E.164 phone, Contact ID, Organization ID, or all Company outreach. A tombstone records channel, reason, source event, effective time, aliases known at creation, actor, and audit lineage.
- Exact email is always distinct. Store a provider-neutral base form only when the owner confirms equivalence; never assume dot/tag treatment. Normalize phones to E.164. Contact/Organization merge or split preserves and unions relevant suppression subjects; deletion, import, export, restore, rediscovery, and alias resolution retain the tombstone.
- Every package approval, CRM-eligibility projection, click-to-call render/activation, outbox creation, leased dispatch, reply/bounce handler, and inbound unsubscribe path resolves all current subjects transactionally. Cached UI eligibility is never authority.
- Unsubscribe uses an HTTPS opaque high-entropy token stored only as a digest and bound to workspace/message/Contact/normalized email/scope. The public endpoint is rate-limited, replay-safe, generic in response, reveals no contact data, and writes durable suppression before reporting success. Explicit opt-out replies and `do_not_call` outcomes likewise write suppression before their success/activity transaction completes. Ambiguous replies pause matching work for owner review.

### Phone support remains a controlled manual activity

- Only a fresh source- or provider-verified business phone (Phase 5 eligibility) may present click-to-call. The `tel:` href is rendered only after current server-side suppression/availability authorization and its activation rechecks; a stale page fails closed.
- The call script is a non-editable derived projection of the approved Outreach Package, with evidence/claim dependencies and advisory compliance context visible. Editing the package regenerates the script/version and invalidates approval; the call UI never substitutes arbitrary free-text as a package script.
- Supported outcomes are exactly `connected`, `voicemail`, `no_answer`, `wrong_number`, `do_not_call`, and `follow_up`, with reasoned bounded manual notes. `do_not_call` atomically writes suppression before the activity completes; reply/bounce/suppression/pause/drift conditions prevent follow-up. No dialer, recording, SMS, automatic calling, or claimed call completion exists.

### Compliance is advisory but explicit consent/suppression controls fail closed

- The UI records recipient jurisdiction, claimed lawful/consent basis, source evidence, sender identity, working unsubscribe, and the owner's acknowledgement of advisory guidance. It warns on absence/inconsistency and never calls this legal approval.
- An absent, stale, wrong-scope, or mismatched acknowledgement/basis/unsubscribe/sender identity is a hard pre-dispatch/click-to-call block. A contact-verification or package approval never implies consent, Gmail authorization, or message-send authority.
</decisions>

<phase_inputs>
## Exact Phase 4 and Phase 5 Inputs Required Before Implementation Planning

The later planner must reject Phase 6 planning if any row is absent, only proposed, wrong-scoped, stale where noted, or lacks its immutable/audit lineage. It must consume the actual Phase 4/5 summaries, verification reports, schemas, migrations, APIs, and release-boundary evidence—not substitute hypothetical records from this document.

| Required predecessor output | Exact Phase 6 consumer | Acceptance condition |
|---|---|---|
| Phase 4 `Approved` Prospect and immutable qualification/review decision | Package subject and eligibility start | Owner decision has reason, exact Prospect/Account/Target/Offer/Profile scope, current effective availability, configuration digest, source/evidence hashes, and no unresolved disqualifier/cooldown. Approval alone creates no contact or send authority. |
| Active Profile Effective Configuration from Phase 4 | Package/message dependency and send/call recheck | Immutable ID/digest, ancestry (Company/Product/Play/Profile/Offer), Claim Guardrails, outreach strategy, compliance posture, schedule/state projection, drift dependency graph, and replacement invalidation semantics are queryable. |
| Phase 4 lifecycle/availability and pause/archive/drift command contract | Stop rules and leased-dispatch race handling | Current reason-code projection plus transactional hooks/events for pause, archive, replacement activation, and high-risk drift are proven; pending work can be found/cancelled without scanning untrusted data. |
| Phase 4 identity/relevance model | Recipient/package/suppression scope | Company-wide Organization/Contact identity, Play-scoped Account/relevance, aliases/merge lineage, and exact Prospect-to-contact association rules are implemented and cross-workspace tested. |
| Phase 4 immutable command/audit/migration pattern | Every owner command and artifact history | Server-derived workspace/admission, expected revision, idempotency-key/digest collision semantics, authority-command guard, append-only audit, additive migration chain, and forbidden-effect snapshots are established. |
| Phase 5 ContactReady projection | Email/phone eligibility | An `Approved` Prospect has an associated Contact with scoped relevance and an eligible Enriched Contact point; generated/pattern/directory/domain/MX suggestions cannot be selected. |
| Phase 5 verification/freshness evidence | Package approval, click-to-call, send rechecks | Each selected point has class, method, source/provenance, verified time, channel freshness policy, current freshness result, normalized email or E.164 number, and stale-to-NeedsReview behavior proven at downstream boundaries. |
| Phase 5 identity merge/split and suppression-preservation contract | Company-wide suppression resolution | Merge/split is owner-reviewed and transactional, preserves source/relevance/alias lineage and all current/historical suppression subjects, and exposes a queryable subject-resolution projection. |
| Phase 5 no-provider-call/reservation boundary | Separation of authority concerns | Contact enrichment grants, budgets, provider outcomes, and verification evidence are distinguishable from outreach authorization; no Phase 5 operation can create a package/message/send permission. |
| Phase 5 foreign-origin/owner admission proof | Gmail, call, package, and suppression routes | Current route security pattern and negative cross-principal/cross-workspace tests cover downstream mutation extensions. |

**Current blocker:** Phase 4 and Phase 5 are preparation artifacts only. Their directories do not contain implemented summaries/verification/migration/API contracts. Do not create Phase 6 implementation plans until both phases have delivered and independently verified the exact rows above; Phase 4 itself remains blocked on absent Phase 3 authority.
</phase_inputs>

<canonical_refs>
## Canonical References

- `docs/DIRECTION.md` — accepted outreach, phone, suppression, compliance, architecture boundaries.
- `docs/IMPLEMENTATION-SPEC.md` §§13, 16–18, 22, 24 — required immutable artifacts, Gmail/outbox, manual phone, audit, and release invariants.
- `docs/adr/0002-confirmed-knowledge-and-effective-configuration.md` — immutable configuration/dependency invalidation.
- `docs/adr/0003-untrusted-runners-and-human-gates.md` — application authority and immutable per-message approval.
- `docs/adr/0005-advisory-compliance-hard-suppression.md` — advisory compliance plus hard suppression boundary.
- `.planning/phases/04-profile-readiness-and-evidence-based-prospecting/04-{CONTEXT,PATTERNS,RESEARCH,VALIDATION}.md`.
- `.planning/phases/05-controlled-enrichment-and-verified-contacts/05-{CONTEXT,PATTERNS,RESEARCH,VALIDATION,UI-SPEC}.md`.
</canonical_refs>

<deferred>
## Deferred / Out of Scope

- Live Gmail OAuth, credentials, scopes, test mailbox, email dispatch, inbound mailbox access, provider SDK/package installation, or external provider selection.
- Dialer, recording, SMS, automated calls, phone enrichment, scrape/import of real contacts, paid work, deployments, and CRM handoff/export implementation.
- Jurisdiction rules engine, representation of legal approval, multi-user authorization, and autonomous message/package approval.
</deferred>

---

*Prepared 2026-07-30 from accepted Direction, Implementation Contract, ADRs, and Phase 4/5 planning artifacts.*
