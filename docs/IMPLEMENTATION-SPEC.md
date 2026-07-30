# PROspector Implementation Contract

Status: Required for pilot implementation

This document turns [DIRECTION.md](DIRECTION.md) into testable application invariants. Where legacy scripts disagree, this contract wins.

## 1. Trust boundaries

Trusted application code owns authentication, authorization, schemas, state transitions, readiness, qualification, budgets, approvals, suppression, audit, exports, and sends.

Untrusted inputs include AI Runner output, web pages, uploaded documents, imported files, contact providers, Gmail message content, and browser-submitted identifiers. Untrusted input can propose data; it cannot grant authority or directly change protected state.

External systems are reached only through these ports:

- `IdentityPort`
- `StructuredStorePort`
- `ObjectStorePort`
- `SchedulerPort`
- `RunnerPort`
- `ContactProviderPort`
- `MailPort`
- `ExportDeliveryPort`
- `ClockPort`

No domain service imports a Sites-, Gmail-, or model-provider SDK directly.

## 2. Principals and authorization

Every request derives `workspace_id` and principal from the verified server session or runner token. A client-supplied workspace ID is only a locator and never authority.

| Capability | Owner | Invited user (future) | Runner | Backend service |
|---|---:|---:|---:|---:|
| Read confirmed knowledge | yes | assigned scopes | assigned snapshot only | task-scoped |
| Propose knowledge/findings | yes | assigned scopes | assigned task only | no |
| Confirm knowledge/readiness | yes | optional future role | no | no |
| Review prospect | yes | optional future role | no | no |
| Grant paid enrichment | yes | no by default | no | validate/consume only |
| Approve/send message | yes | no by default | no | validate/execute only |
| Manage suppression | yes | assigned future role | submit detected opt-out only | enforce only |
| Export/restore workspace | yes + step-up | no | no | execute audited job |
| Manage invitations/runners/secrets | yes | no | no | no |

Pilot invitations are disabled. Future invitations require single-use expiry, verified acceptance, explicit role/scopes, revocation, session invalidation, and audit events. Owner recovery must use the hosting identity provider; there is no application backdoor.

Authorization is enforced in route handlers and repository queries. Object keys are server-generated from authorized row IDs. Every sensitive operation has a negative cross-principal test.

### Browser session and CSRF contract

Hosting identity is accepted only from the trusted edge headers on server execution. Application session cookies, when used, are `Secure`, `HttpOnly`, `SameSite=Lax` or stricter, host-only, rotated after sign-in/privilege change, and short-lived with server revocation. Every state-changing browser request requires same-origin `Origin` validation, Fetch Metadata (`Sec-Fetch-Site` is same-origin/same-site as explicitly allowed), and a session-bound unpredictable CSRF token. Missing or conflicting headers/tokens fail closed. OAuth callbacks use their own one-time state/PKCE contract and cannot perform unrelated mutations.

Foreign-origin tests cover knowledge confirmation, readiness/activation, review decisions, package/message approvals, spend grants, sends, suppression, runner settings, Gmail connection, export/restore, invitations, and deletion.

## 3. Core records and cardinality

All mutable domain rows contain `id`, `workspace_id`, `created_at`, `updated_at`, and optimistic `revision`. IDs are opaque UUIDv7 values. Version rows are append-only.

| Record | Parent/cardinality | Key constraints |
|---|---|---|
| `workspace` | deployment has exactly 1 | immutable company isolation ID |
| `principal` | workspace 1:N | unique provider subject |
| `company` | workspace exactly 1 | one active company version |
| `product` | company 1:N | lifecycle Draft/Ready/Paused/Archived |
| `market_play` | product 1:N | lifecycle Draft/Active/Paused/Archived; Ready is derived from child Profiles |
| `customer_profile` | market play 1:N | lifecycle Draft/Ready/Paused/Archived |
| `offer` | market play 1:N | versioned, at least one per Ready profile |
| `knowledge_item` | scoped to company/product/play/profile | kind + scope + current accepted version |
| `knowledge_version` | item 1:N | immutable value, provenance, decision |
| `source` | workspace 1:N | normalized URL/object ref + metadata |
| `source_excerpt` | source 1:N | bounded text + content hash |
| `product_discovery_config` | product 1:N | immutable Company/Product/discovery/source/runner references |
| `profile_effective_config` | profile 1:N | immutable full Play/Profile/Offer inherited references |
| `market_play_proposal` | product 1:N | immutable proposal versions and deterministic fingerprint |
| `proposal_decision` | proposal 1:N | Explore/Defer/Dismiss/reopen decision and evidence |
| `organization` | workspace 1:N | canonical identity, aliases, merge lineage |
| `account` | market play N:1 organization | unique play+organization |
| `target` | account 1:N | type + stable external/name key |
| `contact` | workspace 1:N | canonical person identity, merge lineage |
| `contact_point` | contact 1:N | email/phone + normalized value + provenance |
| `contact_relevance` | contact N:M account/profile | role and relevance are scoped |
| `signal` | account/target 1:N | fingerprint unique per profile/source/event |
| `prospect` | profile+account+target 1:N | lifecycle state + effective config |
| `qualification` | prospect 1:N | immutable inputs, result, explanation |
| `review_decision` | prospect 1:N | immutable Approve/Reject/Defer decision |
| `outreach_package` | prospect 1:N | immutable evidence/angle/script bundle + approval status/digest |
| `message_version` | package 1:N | canonical send artifact + digest |
| `approval_grant` | workspace 1:N | typed, immutable, expiring, single-use where required |
| `suppression` | workspace 1:N | append-only tombstone and normalized subjects |
| `activity` | prospect/contact 1:N | delivery/reply/bounce/call/note only |
| `run` | product/profile 1:N | immutable run manifest + state |
| `run_submission` | run 1:N | append-only runner result, idempotency unique |
| `audit_event` | workspace 1:N | append-only actor/action/subject/before/after metadata |
| `export_job` | workspace 1:N | manifest, checksum, expiry, restore result |
| `gmail_connection` | workspace 1:N | Google subject/mailbox/scopes/secret ref/status |
| `unsubscribe_token` | message/contact 1:N | opaque digest, scope, expiry/use state |
| `budget_account` | workspace/profile/runner/provider | currency, authorized/reserved/settled totals |
| `import_batch` | workspace 1:N | source format/version/hashes, custody, status, counts |
| `import_item` | batch 1:N | immutable raw-normalized item, typed proposed destination, review state |
| `identity_proposal` | import item/source 1:N | unresolved Organizations/relations/Targets, no Account/Prospect authority |
| `interview_session` | scope 1:N | purpose, lifecycle, active question pointer, revision |
| `interview_question` | session 1:N | immutable prompt/research/recommendation/version/status |
| `interview_answer` | question 1:N | immutable operator answer/version |
| `interview_confirmation` | answer/proposal 1:N | decision, resulting knowledge version, actor/revision |

## 4. Versioning and typed configuration

A Product Discovery Configuration contains immutable references to:

- Company knowledge versions relevant to discovery;
- Product version, capabilities, limitations, proof, and Claim Guardrails;
- source hierarchy/recency and market-discovery policy versions;
- compliance posture version;
- runner, instruction, output-schema, and tool-policy versions.

It belongs to a Product and is valid when the Product has zero Market Plays, Profiles, or Offers.

A Profile Effective Configuration contains immutable references to:

- Company knowledge versions;
- Product version and knowledge versions;
- Market Play version and knowledge versions;
- Customer Profile version;
- Offer version;
- qualification rubric version;
- source policy and recency version;
- claim guardrail versions;
- Contact Strategy version;
- Outreach Strategy version;
- schedule, timezone, and output policy version;
- compliance posture version;
- runner instruction and output-schema versions.

Each typed configuration stores a canonical JSON digest. A Product Market Discovery Run requires a Product Discovery Configuration. A Profile Prospecting Run and every downstream artifact require a Profile Effective Configuration. Historical records never follow a `current` pointer during replay. Product changes show fan-out impact and create a replacement Product configuration plus proposed replacement Profile configurations for affected Ready Profiles; each is explicitly activated under the rollover rules.

## 5. Readiness

Readiness evaluation is a pure function returning every unmet requirement. Product and Profile transitions use their respective checklist/configuration type. The transaction that changes Draft to Ready must:

1. compare the expected revision;
2. validate all referenced confirmed versions;
3. create the applicable Product Discovery Configuration or Profile Effective Configuration;
4. append the audit event;
5. enqueue the unique initial run and recurring schedule;
6. commit atomically.

The initial run key is `initial:{entity_type}:{entity_id}:{configuration_id}`. Repeated requests return the same job. Failed jobs retry with exponential backoff up to three attempts. Exhausted jobs surface `Needs attention`; they never roll back Ready state. Pausing or archiving prevents new starts and requests cancellation of work that has not submitted results. In-flight submissions remain recorded but cannot advance state while paused.

### Lifecycle matrices

Only the owner can change lifecycle state. Product transitions are `Draft -> Ready`, `Ready <-> Paused`, and any non-Archived state -> `Archived`; restore returns Archived to `Draft` and requires a fresh readiness activation. Market Play transitions are `Draft -> Active`, `Active <-> Paused`, and any non-Archived state -> `Archived`; restore returns to `Draft`. Profile transitions are `Draft -> Ready`, `Ready <-> Paused`, and any non-Archived state -> `Archived`; restore returns to `Draft`.

Persisted local lifecycle and derived Effective Availability are separate. Child lifecycle is never rewritten by an ancestor transition. Effective Availability is true only when the entity's local lifecycle allows the action, every ancestor is in its required state, the referenced typed configuration is active, and no suspension/drift/suppression blocker applies. The projection records a set of reason codes with subject IDs and revisions, such as `ProductPaused`, `PlayArchived`, or `ProfilePaused`.

- A Profile may retain local `Ready` while an ancestor is unavailable, but it is effectively suspended and cannot run/export/call/send.
- Derived Ready Market Play means Play local lifecycle is Active, Product local lifecycle is Ready, at least one child Profile local lifecycle is Ready, and the full ancestor/configuration availability projection passes.
- Pausing Product or Play writes an ancestor suspension event, cancels unleased descendant work, and invalidates current outbound approvals without mutating child lifecycle.
- Resuming an ancestor removes only its own suspension reason. Independently paused/archived children and other blockers remain. Descendants whose configuration dependencies changed become `NeedsReview` and do not silently resume.
- Archiving an ancestor creates an archive suspension, cancels unleased work, invalidates approvals, and preserves child lifecycle/history. Restoring returns that ancestor to Draft and keeps its suspension until fresh activation; descendants require availability/configuration review.
- Every run, export, click-to-call, and send computes Effective Availability from current revisions at the final action boundary.

State tests cover independently paused children, nested parent pause/resume, archive/restore, changed dependencies, and concurrent readiness/action races.

Concurrent readiness requests, retry after response loss, schedule overlap, and cancellation are mandatory tests.

### Ready configuration changes

Editing Confirmed Knowledge for a Ready entity creates a proposed replacement typed configuration and impact graph; it never mutates the active configuration. The owner reviews and activates the replacement in one transaction that creates the new configuration, repoints future schedule slots, records the audit event, and, for Profile configurations, enqueues requalification for unreviewed Prospects.

- queued/not-started runs on the old snapshot are cancelled;
- running/submitted runs may finish validation but their results remain historical proposals until re-evaluated under the new snapshot;
- unreviewed Candidate/Qualified Prospects receive new qualifications;
- Approved and downstream Prospects retain history but their current eligibility projection becomes `NeedsReview` when a dependency changed;
- dependent package approvals and message approvals are invalidated;
- exported/contacted history never changes snapshot;
- high-risk outbound remains paused until the owner activates the snapshot and reapproves affected artifacts.

Low-risk accepted changes use the same preview/activation mechanism but do not pause unrelated outbound. Tests cover rollover while schedules, runs, Prospects, packages, messages, exports, and pauses exist.

### Consensus Interview state machine

Session states are `Open`, `AwaitingAnswer`, `AwaitingConfirmation`, `Completed`, `Paused`, and `Archived`. At most one question has status `Active` per session, enforced by a unique transactional guard. A question version contains its scope, decision sought, researched facts with source refs, labelled inferences, recommendation, and prerequisite knowledge versions.

The owner submits an immutable Answer against the expected question/session revision. The transaction rejects stale/superseded questions, changes the question to `Answered`, creates proposed knowledge/recommendation as needed, and moves the session to `AwaitingConfirmation`. Confirmation is an explicit owner decision (`Accept`, `Reject`, `Correct`, or `Rescope`) against exact answer/proposal and prerequisite digests. Accept/Correct/Rescope appends the resulting Knowledge Version; none overwrite existing truth.

After confirmation, the application transactionally closes the question and either creates exactly one next Active question or marks Completed. Retry after response loss is idempotent by client operation key. Concurrent tabs, stale revisions, or conflicting answers yield a visible conflict and never create two active questions or two confirmations. Resume reloads the current authoritative state; superseding a question records lineage and invalidates its unconfirmed answers.

Tests cover resume, pause, retry, concurrent answers, stale confirmation, supersession, conflict correction/rescope, and exactly-one-active-question.

## 6. Configuration-independent import staging

Owner uploads first create an `import_batch` using format/version, artifact digests, privacy class, custody/source, expected schema/counts, and an idempotency key. Items are immutable, configuration-independent Proposed data; they are not application Runs, Accounts, Signals, Candidates, or Prospects.

Each `import_item` stores bounded normalized fields, content hash, source index, typed proposed destination, review state, and raw-object reference. Composite names create `identity_proposal` records. Review resolves Organization(s), relationships, and Target(s). Promotion is a separate owner transaction allowed only when the destination Product/Play/Profile is appropriately active with a valid typed configuration. It creates the authorized Account/Target/Signal/Candidate records with import lineage and marks the item promoted. Draft Greenfield and Channel/Multiplier items remain proposed context/strategy until separately modelled and activated.

Import reruns return the same batch by format/version+artifact hashes. Changed artifacts create a new batch and never mutate earlier items. Tests import the 25-item synthetic fixture before readiness with zero Accounts/Prospects, preserve typed counts, resolve selected identities, activate a Profile, and promote only reviewed eligible Operating items deterministically.

## 7. Jobs, schedules, and queues

Run states are:

`Queued -> Assigned -> Running -> Submitted -> Validating -> Succeeded`

Terminal alternatives are `Rejected`, `Failed`, `Cancelled`, and `Expired`. Transitions are monotonic and append an event. Runner submissions cannot set application terminal state.

- Every run has a UUID, idempotency key, trigger, scheduled time, actual start, typed configuration ID, instruction version, provider/model, source window, and attempt.
- Every schedule has a typed owner: Product for Market Discovery or Customer Profile for Prospecting. Each type owns an independent watermark and concurrency policy.
- Only one active scheduled run exists per schedule owner and slot.
- A slot key uses run type, owner ID, intended local schedule instant, and timezone offset, preventing DST duplicates without colliding Product and Profile work.
- If the prior scheduled run is active, the new slot is `SkippedOverlap`; manual runs may queue separately.
- Scheduler misfires within 24 hours run once; older misfires are recorded and skipped.
- Discovery covers `(last_successful_watermark - 24h, current_started_at]` and advances the watermark only on success.
- Profile run policy separately records discovery-candidate capacity and desired Qualified queue depth. The operating outcome target counts the first transition to Export-ready within a Monday-Sunday week in the profile timezone. Reversals remain reported; they do not retroactively turn another stage into success. Qualified overflow remains ordered by score, evidence freshness, then stable ID.
- Fingerprints prevent identical source/event/profile signals. Material change creates a new Signal linked to its predecessor.

## 8. Source ingestion and prompt-injection containment

Retrieval and model interpretation are separate tasks. The retrieval service:

- accepts HTTPS URLs only;
- resolves every A/AAAA answer itself, rejects mixed public/private sets, blocks loopback/link-local/private/metadata/non-routable ranges, pins an approved address at connect time, disables implicit proxies, and repeats validation/pinning after every redirect;
- limits redirects, bytes, MIME types, decompression, and time;
- stores content hash, retrieval time, resolved host, and response metadata;
- extracts text in a sandbox and strips scripts, active HTML, and embedded objects;
- scans uploads for malware and secrets before making them available;
- renders all source text as escaped quoted data.

Runner instructions state that source content is data, not instructions. Runners receive excerpts rather than credentials, cookies, raw private documents, or privileged tools. Submissions use strict schemas, bounded strings/arrays, HTTPS URL validation, allowed state values, and provenance requirements. The application rejects unknown fields where authority is involved.

## 9. Qualification

Rubrics consist of named dimensions with integer anchors, a total threshold, zero-score rules, hard disqualifiers, required evidence fields, missing-data behavior, and tie/order rules. Application code calculates the result; the runner supplies cited observations only.

Initial ONE for Mining Operating rubric:

| Dimension | 0 | 1 | 2 |
|---|---|---|---|
| Account fit | not an operating/ramping mineral-processing site or out of geography | plausible site but operating status/scope partly unconfirmed | named operating/ramping site in scope with relevant processing operation |
| Pain strength | no sourced relevant pain | indirect or one Tier-2 observation of a relevant pain | direct Tier-1 evidence or two independent sources showing a material relevant pain |
| Timing/urgency | no current trigger; only context older than 30 days | current but weak/early trigger or reconfirmed ongoing issue | current material event such as ramp-up, outage, recovery issue, expansion, or management priority |
| Data readiness | evidence data access is unavailable/prohibited | unknown or partial digital/OT evidence | evidence of historians, connected plant systems, digital program, or accessible operational data |
| Commercial viability | explicit disqualifier/no plausible buying path | buyer/ownership/budget path uncertain | identifiable owner and buyer roles with plausible diagnostic/subscription path |

Pass rule: total at least 7/10; pain and timing each at least 1; no hard disqualifier; at least one Tier-1 or two independent Tier-2 sources across the qualifying evidence; and all evidence fields populated. Missing evidence scores 0, never an inferred 1. Ties order by pain, timing, account fit, freshest material event, then stable prospect ID.

Source tier is assigned by application rules, not runner assertion. Tier 1 requires a verified authoritative domain or object belonging to the subject Organization, its owner, or its regulator/formal filing system. Tier 2 requires an allowlisted or operator-reviewed editorial publisher. Tier 3 is everything else, including social/forums/aggregators. Each excerpt records both publisher and underlying-origin IDs; reposts, syndications, subsidiaries repeating one owner release, and articles based on the same filing share an independence group. Two Tier-2 sources satisfy independence only when their independence-group IDs differ. Owner overrides require a reason, evidence, and audit and create a new source-policy version.

Hard disqualifiers for this profile are: not an operating/ramping mineral-processing Target, outside confirmed geography/language, no relevant processing operation, explicit no-solicitation restriction, duplicate active Prospect for the same account/target/offer, or evidence that the Offer cannot be delivered under a Product limitation.

Qualification outcomes are `Passed`, `NotQualified`, `InsufficientEvidence`, or `Disqualified`. A complete below-threshold score without a hard gate is `NotQualified`. Missing mandatory evidence is `InsufficientEvidence`; missing rubric fields still score 0. Both retain the immutable assessment, leave the active review queue, and may return to Candidate only after a Material Signal, a new Profile configuration, or the versioned review interval (90 days by Mining default). `Disqualified` requires a hard gate and reopens only when sourced evidence proves that gate no longer applies.

## 10. Prospect state machine

Allowed transitions:

- `Candidate -> Qualified` only from a passing immutable qualification.
- `Candidate -> NotQualified|InsufficientEvidence` from the corresponding immutable failed outcome.
- `Candidate -> Disqualified` only with recorded hard gate/evidence.
- `NotQualified|InsufficientEvidence -> Candidate` only after Material Signal, new Profile configuration, or review interval; `Disqualified -> Candidate` only after evidence invalidates the hard gate.
- `Qualified -> Approved|Rejected|Deferred` only by the owner.
- `Deferred -> Qualified` only on review date or Material Signal, using a new qualification.
- `Rejected -> Qualified` only after 90 days or Material Signal, using a new qualification.
- `Approved -> ContactReady` only with at least one eligible Enriched Contact.
- `ContactReady -> PackageReady` only with a complete Outreach Package.
- `PackageReady -> ExportReady` only with a valid Approved Outreach Package and complete non-suppressed CRM rows.
- `ExportReady -> Contacted` only after a validated send event or manually logged call.

No transition implies authorization for the next external side effect.

`ContactReady`, `PackageReady`, and `ExportReady` are current eligibility projections over immutable historical transitions. Contact expiry/invalidity, approval revocation, new disqualifier, accepted configuration change, Offer change, suppression, merge/split, or high-risk Drift can project `NeedsReview`, invalidate affected approvals, and block export/send without deleting history. Owner resolution creates a new qualification/package/approval and may restore eligibility. Suppression projects a contact row as `NonContactable`; Company-wide suppression blocks all downstream current eligibility.

## 11. Contact identity and verification

Contact point verification class is one of:

- `suggested`: generated, inferred, directory-only, or MX-only;
- `domain_valid`: domain accepts mail, but mailbox not verified;
- `mailbox_verified`: provider or technical mailbox-level verification;
- `source_verified`: exact business contact point published by an authoritative source and reconfirmed;
- `invalid`.

Only `mailbox_verified` and `source_verified` can satisfy Enriched Contact, CRM Handoff, approval, or send requirements. Numeric confidence does not override class.

Every Contact Strategy defines verification freshness by class and channel. Pilot defaults are 30 days for mailbox-verified email, 90 days for source-verified email, and 90 days for verified business phone. Package approval, CRM export, click-to-call, and final send re-evaluate freshness; stale points become Contact Suggestions/`NeedsReview` until reconfirmed. A strategy change creates a new Profile configuration.

Organization identity uses normalized legal name, domains, registration identifiers, and reviewed aliases. Contact identity uses normalized name, organization, exact contact points, and provenance. Ambiguous matches create a merge suggestion. Merge and split are owner decisions, retain lineage, re-point scoped associations transactionally, and never discard source history or suppression subjects.

## 12. Market Play Proposals

Proposal identity fingerprint is canonical Product ID + normalized market category + normalized customer audience + normalized problem family. Runs may create a new immutable version under an existing fingerprint but cannot create a second active proposal. Every run trigger is capped at three surfaced proposals.

Decisions are owner-only and immutable: Explore creates a Draft Market Play and opens its interview; Defer requires a review date (default 90 days); Dismiss cools for 180 days. Neither decision creates a Ready Profile. A deferred/dismissed proposal reopens early only when a new source/event with a different material-evidence fingerprint changes problem match, audience, Product fit, or risk. Repetition/republication does not qualify. Concurrent runs serialize on Product+fingerprint; losing inserts attach evidence to the existing proposal. Owner correction can split/merge fingerprints with lineage and audit.

## 13. Outreach Package approval

An Outreach Package version canonically contains its Prospect/Contact/Profile Effective Configuration IDs; qualifying evidence and source hashes; recommended angle; Claim Guardrail dependencies; selected role/contact points; call script; and the complete set of draft message-version IDs. Canonical JSON is hashed with SHA-256.

Only the owner can approve the exact digest. Approval is immutable, audited, and expires when configured (30 days by pilot default). Any field/dependency/contact verification/configuration change or owner revocation invalidates it. The Package Review UI shows evidence, claims, recipient/contact, scripts, and every draft. A valid package approval permits Export-ready/CRM Handoff only; each message still needs its own approval.

## 14. Paid enrichment

An enrichment approval grant contains provider, prospect IDs, permitted operation, maximum units and cost, currency, expiry, created-by principal, and a random nonce. It is stored immutable and consumed transactionally.

The provider call uses a durable reservation:

1. validate grant, Profile Effective Configuration, currency, and a non-expired versioned provider quote/catalog;
2. reserve units and worst-case monetary cost under a unique operation key, including taxes/fees/rounding where the provider exposes them;
3. commit reservation;
4. call provider;
5. record outcome and actual cost;
6. release unused reservation or mark uncertain for reconciliation.

Absent, expired, reused, mismatched, stale-price, unbounded-cost, currency-mismatched, or over-budget grants produce no provider call. Actual plus reserved spend can never exceed grant, profile, or workspace monetary caps. Uncertain charges remain reserved until reconciled; partial results settle only documented billable units. Legacy `enrichment/mcp_server.py` is not part of production and cannot be exposed.

## 15. AI Runner budgets and abuse limits

Subscription Runner limits are configured and enforced externally; PROspector still limits its own assignments. Separately billed API Runners require an immutable owner grant with provider/model, price-catalog version, run types/scopes, per-run maximum, monthly maximum/currency, expiry, and retry policy. A worst-case reservation occurs before assignment; settlement/reconciliation mirrors paid enrichment. No automatic retry or provider switch may exceed or borrow authority.

Pilot resource limits, configurable only downward without a reviewed version change:

- at most 1 active and 3 queued runs per schedule owner;
- at most 2 active assignments and 20 queued runs per workspace;
- at most 3 manual run requests per owner per 10 minutes and 20 per day;
- runner submission body at most 1 MiB, 500 findings, 100 sources, and 10 submissions per assignment;
- runner token validation at most 30 attempts per IP and 10 failed attempts per token digest per 5 minutes, followed by a 15-minute lockout and alert;
- at most 100 audit events per assignment minute before backpressure/rejection;
- no new paid/external work when queue, budget, provider-health, or emergency-pause limits fail.

Limits are enforced durably by workspace/owner/token keys, not process memory. Distributed burst/sustained tests prove backpressure, lockout, bounded storage, and zero over-budget calls.

## 16. Gmail connection, message approval, and sending

`gmail_connection` stores workspace, connecting principal, Google subject, canonical mailbox, verified send-as aliases, exact granted scopes, encrypted-secret reference and version, status (`Connecting|Connected|Degraded|Revoked|Disconnected`), created/refreshed/revoked times, and last verified token metadata. Refresh tokens never enter D1, logs, exports, or the browser.

OAuth state is one-time, high-entropy, short-lived, bound to workspace, principal, intended redirect, PKCE verifier digest, and connection attempt. Callback verifies issuer/audience/state/PKCE and Google subject; account swap, replay, partial scopes, and subject mismatch fail. A message From must equal the connected mailbox or an API-confirmed verified send-as alias. Reconnect cannot silently change subject/mailbox.

Canonical message content includes:

- workspace and account/prospect/contact IDs;
- Gmail sender identity and From/Reply-To;
- To, CC, and BCC normalized addresses;
- subject and UTF-8 text/HTML bodies;
- ordered links with normalized destinations;
- attachment IDs, filenames, media types, sizes, and SHA-256 digests;
- thread/reply identifiers;
- intended send time and timezone;
- Outreach Package and Profile Effective Configuration IDs.

Canonical JSON is serialized with sorted keys and hashed using SHA-256. Approval records the digest, approver, time, expiry, and explicit compliance acknowledgement. No edit is “non-substantive”: every changed canonical field creates a new version and digest.

Sending uses a transactional outbox. The database transaction locks the message and:

1. verifies unused approval, exact digest, expiry, and owner identity;
2. checks all suppression subjects;
3. checks high-risk drift dependencies;
4. confirms sender identity, unsubscribe path, recipient jurisdiction fields, and operator acknowledgement;
5. creates one outbox item with a unique send key and consumes approval.

Before the external Gmail call, the worker obtains a short exclusive send lease. While fencing dispatch, it revalidates exact digest, current approval, suppression, Product/Play/Profile/Prospect state, package approval, connected mailbox/alias, and high-risk Drift against the latest committed revisions. It then records `Dispatching` with the lease generation and performs one Gmail call. Suppression, pause, archive, approval revocation, and drift transactions cancel matching `Pending`/unleased items; if they race an acquired lease they wait for its bounded decision point and win before the call.

Gmail exposes no application idempotency key. PROspector sets a deterministic RFC Message-ID and bounded artifact marker for reconciliation, but never assumes Gmail deduplicates it. Outbox states are `Pending -> Leased -> Dispatching -> Sent`, with `Cancelled`, `FailedBeforeDispatch`, and `DeliveryUnknown`. A failure known to occur before request transmission may retry. Once bytes may have reached Gmail, the item becomes `DeliveryUnknown`; it is never automatically resent. The worker searches the connected originated-mail context for the deterministic Message-ID/marker, records `Sent` if found, and otherwise asks the owner to reconcile. A second send requires an explicit new message version and approval. Fault injection after Gmail acceptance but before response persistence must produce one provider call.

Sequence templates never carry approval. A follow-up becomes a new immutable Message Version only after the previous touch and stop rules allow it. It is presented for its own owner approval, has its own scheduled time/expiry/digest/outbox item, and is cancelled on reply, bounce, suppression, pause, package invalidation, or high-risk Drift. Rescheduling changes the digest and requires reapproval.

## 17. Suppression and unsubscribe

Suppression subjects can be exact normalized email, email-domain, E.164 phone, Contact ID, Organization ID, or all Company outreach. Each tombstone records channel, reason, source event, effective time, and aliases known at creation.

Exact plus-address variants are stored both exactly and under a provider-neutral base only when an owner confirms equivalence; the system never assumes all providers ignore dots or tags. Phone matching uses E.164. Contact/Organization merges union suppression subjects. Imports are applied before any schedule is activated. Tombstones are append-only and included in every export/restore.

Every outbound email contains an HTTPS unsubscribe URL with a high-entropy opaque token stored only as a digest and bound to workspace, message, Contact, normalized email, and suppression scope. The endpoint is idempotent, rate-limited, safe to replay, does not require login, reveals no contact data, and writes the suppression tombstone transactionally before returning a generic success response. Forwarded/tampered tokens can suppress only their bound subject and never grant reads.

Inbound replies matching explicit opt-out intent are fail-closed: they immediately pause matching pending items and create suppression before any future send. Ambiguous replies remain paused for owner review. Alias/merge/rediscovery tests prove the tombstone propagates to every matching association.

## 18. Gmail and phone

Gmail OAuth requests only the scopes needed to create/send PROspector messages and read PROspector-originated threads. Refresh credentials are protected hosting secrets, never D1 values or client-readable data. OAuth state, PKCE, redirect allowlist, token rotation/failure, disconnect, and audit are required.

Inbound sync locates stored Gmail thread/message IDs and persists only delivery classification, bounce metadata, reply timestamp, sender, bounded subject, and a minimized reply excerpt required for stop logic. It does not ingest the mailbox.

Phone numbers must be source- or provider-verified business numbers. Click-to-call uses a `tel:` link that is rendered and activated only after a current server-side suppression authorization; a stale UI action rechecks and fails closed. Scripts derive from the Outreach Package. Outcomes are `connected`, `voicemail`, `no_answer`, `wrong_number`, `do_not_call`, or `follow_up`; `do_not_call` writes suppression before the activity transaction completes.

## 19. Data minimization, retention, and deletion

Pilot defaults:

| Data | Retention |
|---|---|
| Proposed Knowledge rejected/dismissed | 12 months, then delete content; retain decision hash/reason |
| Raw retrieved source body | 90 days; retain URL, excerpt, hash, and metadata |
| Candidate/Disqualified prospect with no activity | 12 months after last material signal |
| Rejected prospect | 24 months for rediscovery reason, then minimize |
| Contact Suggestions | 90 days unless reviewed |
| Enriched Contacts and outreach | while purpose remains active, owner reviews annually |
| Minimized Gmail reply excerpt | 12 months; stop status and timestamp may remain |
| Audit events and approval evidence | 7 years by pilot policy |
| Suppression tombstones | for as long as outreach might resume |
| Exports | 7 days in hosted delivery storage unless owner deletes sooner |

Additional inventory:

| Data | Retention/deletion action |
|---|---|
| Uploaded/private documents | until superseded or owner deletion; annual purpose review; delete R2 body and extracted derivatives together |
| Confirmed Knowledge/version history | while workspace purpose remains; annual review; on workspace deletion remove values and retain only non-personal audit digests where required |
| Source excerpts/metadata | excerpt follows its knowledge/prospect purpose, maximum 24 months without reconfirmation; raw body remains 90 days |
| Runner tokens | digest until expiry + 30 days for abuse audit, then delete |
| Runner assignments/submissions | 12 months after terminal state; minimize cited excerpts according to source policy |
| Qualifications/review decisions | 24 months after prospect inactivity, then retain score/decision digest and delete personal evidence unless still required |
| Activities/bounces | 24 months; retain suppression-causing address digest/tombstone as long as outreach can resume |
| OAuth attempt/state | failed/unused 24 hours; successful attempt metadata 90 days; token secret follows connection revocation/provider policy |
| Provider/model copies | adapter records provider retention/data-use policy and deletion capability before activation; send deletion request on workspace/subject erasure when supported, otherwise disclose exception |
| Application/cache/log copies | cache maximum 24 hours; security logs 90 days; audit follows seven-year policy with content minimized to digests |

Deletion jobs remove derived values and R2 objects, retain necessary suppression and audit tombstones, and record completion. Exported copies are outside application control and are disclosed to the owner. Backup expiry follows the hosting provider; unsupported guarantees are surfaced before activation.

## 20. Workspace export and restore

Export requires a recent owner reauthentication. The job is audited and produces an encrypted ZIP containing:

- `manifest.json` with format version, application version, workspace ID, created time, counts, object list, and algorithm identifiers;
- newline-delimited canonical JSON per record type;
- R2 objects under content-addressed names;
- schema files and migration compatibility range;
- SHA-256 checksums for every entry;
- a manifest signature or HMAC whose verification key is delivered separately;
- suppression and deletion tombstones.

The archive is encrypted with an owner-supplied passphrase using a memory-hard KDF and authenticated encryption. Delivery uses an expiring signed URL, defaults to 15 minutes, and is single-purpose. The passphrase is never stored.

Restore streams into bounded staging and rejects absolute/traversal paths, symlinks/hardlinks, duplicate/case-colliding names, nested archives, more than 100,000 entries, any entry above 100 MiB, total uncompressed data above the configured workspace export ceiling, or expansion ratio above 20:1. It verifies authentication, signature, checksums, schema compatibility, referential integrity, object counts, and workspace consistency before committing atomically. No schedule or sender activates during restore. The owner reviews a dry-run report before activation.

Quarterly pilot drills export and restore into a clean deployment. Release requires one successful drill plus tamper, wrong-passphrase, version-skew, unauthorized, and expired-delivery negative tests.

## 21. Reusable Knowledge Packages

Package schema is versioned and positively allows only selected knowledge values, scope descriptions, public/authorized excerpts, provenance, license/use restrictions, claim guardrails, and source Company approval metadata. The exporter scans for emails, phones, contact/prospect IDs, secrets, private object refs, outreach text, and suppression records; any match blocks export pending correction.

The source owner confirms the exact package digest. The destination imports it as Proposed Knowledge and confirms every promoted use. Revocation prevents future imports and remains in lineage; it cannot silently rewrite already confirmed destination history.

## 22. Audit and observability

Audit events include actor type/ID, action, subject type/ID, workspace, request/assignment ID, time, outcome, previous/new version or digest, and bounded reason. Secrets, raw tokens, full reply bodies, and message bodies are referenced by digest rather than copied into general logs.

Operational signals include job latency/failure, queue depth, provider failure, budget reservation mismatch, rejected runner submissions, send reconciliation, suppression blocks, export/restore results, schedule misfires, and data-retention failures. Owner-visible alerts distinguish retryable failure from action required.

## 23. Database change and rollback policy

D1 changes use expand/migrate/contract releases. A release first deploys code compatible with old and new schemas, applies additive migrations, verifies counts/checksums/invariants, migrates bounded batches idempotently, then enables new writes. Destructive contract migrations occur only after at least one compatible release and a successful encrypted pre-migration Workspace Export/restore drill.

Migration failure, invariant mismatch, or elevated error rate triggers traffic pause and code rollback while additive schema remains compatible. Data rollback uses the verified pre-migration export into a clean deployment; production migrations never rely on lossy down scripts. Every release records migration ID, source/target versions, backup manifest, checks, operator, and recovery result.

## 24. Release invariants

The pilot cannot activate real data or external effects until tests prove:

1. cross-role and cross-workspace access is denied at routes, rows, and objects;
2. readiness is idempotent under concurrency;
3. historical qualification replays from its Profile Effective Configuration;
4. generated/MX-only contacts never enter export, approval, or send payloads;
5. paid providers receive no call without a valid single-use reservation;
6. every message mutation and stale approval blocks send;
7. suppression added between approval and send wins;
8. duplicate send requests create one Gmail operation;
9. malicious sources cannot cause privileged fetches, script execution, or schema/state escape;
10. expired/revoked/replayed/cross-assignment runner tokens fail;
11. export restores completely into a clean deployment and tampering fails closed;
12. paused or drift-affected outbound does not send;
13. Gmail disconnect/provider outage leaves reconciliable state and no silent failover;
14. retention/deletion removes derived and object data while preserving suppression;
15. schedule overlap, retry, misfire, and DST behavior match this contract.
16. package mutation, dependency drift, expiry, and revocation invalidate Package approval and current Export-ready eligibility.
17. suppression, pause, archive, or drift inserted after outbox creation but before provider dispatch produces zero external sends.
18. foreign-origin mutations fail across every consequential browser action.
19. Gmail account swap, partial scope, wrong From, state replay, and subject mismatch fail closed.
20. ambiguous Gmail acceptance produces `DeliveryUnknown` and never an automatic second call.
21. unsubscribe link/reply processing writes durable suppression before success and blocks rediscovery/send.
22. model and enrichment actual-plus-reserved spend never exceeds approved currency caps.
23. runner/manual burst limits bound assignments, queues, submissions, audit growth, and external calls.
24. a Ready Product with no Play/Profile/Offer completes replayable Market Discovery using a Product Discovery Configuration.
25. below-threshold and missing-evidence qualifications reach explicit cooldown states and reopen only by contract.
26. parent Draft/Paused/Archived states block child run/export/call/send under concurrency.
27. proposal duplicates/cooling/reopen rules hold across every trigger and concurrent run.
28. contact freshness is checked at package approval, export, click-to-call, and send.
