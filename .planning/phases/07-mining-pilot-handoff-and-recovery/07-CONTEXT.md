---
phase: 07
slug: mining-pilot-handoff-and-recovery
status: planning-ready
source: accepted-direction-spec-adrs-and-sanitized-fixtures
created: 2026-07-30
---

# Phase 7: Mining Pilot Handoff and Recovery — Context

<domain>
## Phase Boundary

Phase 7 proves that a ready, seeded operating workflow can be understood at the start of the day, handed to an external CRM through a deterministic CSV, and recovered as a complete portable workspace. It owns outcome reporting, export eligibility projection and materialization, archive/restore, and their audit/recovery evidence.

It is not a CRM, an enrichment/outreach/scheduling implementation, a live pilot activation, or a second Product. Mining is the accepted first Market Play; the services, records, archive format, and UI must remain generic across companies, products, and market plays.
</domain>

<decisions>
## Locked Decisions

### Seeded Mining operating view

- Render the accepted hierarchy exactly as `Digitalrain -> ONE -> ONE for Mining -> Operating`; show `Greenfield` separately as Draft/nurture, never active by implication.
- Operating weekday schedule visibility is `06:00 America/Toronto`, including its local timezone and current enabled/disabled state. It remains disabled until the in-application readiness review and upstream capability gates are accepted; this phase never schedules a runner.
- Morning Brief is an owner read surface. It reports the current Monday–Sunday America/Toronto weekly cohort and funnel losses, rather than treating a target as permission to relax qualification, review, verification, package approval, or suppression.

### Seven-lead weekly outcome

- The weekly target is exactly **seven newly Export-ready Prospects**, counted by the first transition of each stable Prospect ID to Export-ready during the local Monday–Sunday week.
- Count one Prospect once even if it has several eligible contacts, is re-exported, or later reverses to `NeedsReview`/`NonContactable`. Keep the first-transition audit reference and timezone offset used for the weekly bucket.
- Rejections, deferrals, enrichment failures/uncertain outcomes, reversals, current review delays, and blocked/ineligible contacts remain visible as separately labelled funnel losses. They are never counted as Export-ready or hidden to reach seven.

### CSV CRM handoff only

- CSV is the only launch CRM handoff. There is no CRM connection, sync, opportunity, forecast, deal, contract, revenue, or customer state in scope.
- Materialize one row per **currently eligible, fresh, non-suppressed Enriched Contact** belonging to a currently Export-ready Prospect with a current approved package. Include stable Prospect ID, generic Company/Product/Market Play/Profile identifiers, account/target, selected role, verification class/method/time, score/evidence references, offer/package reference, activity status, source workspace/run IDs, and export manifest reference.
- The row count is deliberately distinct from the seven-Prospect weekly metric. A Prospect may produce multiple contact rows; one contact must not duplicate for the same deterministic row identity.
- CSV bytes are deterministic: UTF-8, fixed header/field order, RFC 4180 quoting/newlines, spreadsheet-formula neutralization for cells beginning with `=`, `+`, `-`, or `@`, canonical sort by stable Prospect ID then Contact ID/contact-point ID, and a manifest with schema version, selection timestamp, row count, SHA-256 checksum, source workspace ID, and policy/configuration/package digests.
- Repeat requests with the same frozen eligibility snapshot and export definition return the same artifact/checksum; a changed snapshot produces a new immutable export version. Download/delivery expiry or failure never changes eligibility or silently regenerates a different file.

### Duplicate, suppression, and reversals

- Deduplicate export rows by the stable current eligible contact-point identity plus stable Prospect ID, not by display name, email string, or a CRM-provided identifier. Preserve the reason and source identity in the manifest/audit trail.
- Evaluate Company-wide suppression transactionally before snapshot/materialization. Suppressed subjects are omitted from contactable CSV rows; when needed, create a separately labelled non-contactable suppression manifest, never a contactable row.
- Recheck the current eligibility projection at export time: stale/invalid contact verification, package invalidation/revocation, disqualification, high-risk drift, identity merge/split, deletion, or suppression blocks/reverses current export eligibility without rewriting historical transition/export/audit facts.

### Archive, dry run, restore, and replay

- A recently reauthenticated owner creates an audited, versioned archive only after a current authorization/reauth check. The passphrase is supplied only for the operation, uses a documented authenticated encryption/KDF envelope, and is never stored in D1, R2 metadata, logs, browser persistence, audit payloads, or Git.
- Archive canonical records, immutable decisions/history/audit, content-addressed object bytes and references, manifests/checksums, configuration/version dependencies, export metadata/artifacts, and suppression/deletion tombstones. Exclude credentials, OAuth refresh tokens, bearer tokens, raw passphrases, and environment secrets.
- Restore is two-stage: a read-only dry run verifies owner authorization, artifact expiry, manifest/signatures/checksums, passphrase authentication, archive/schema compatibility, object completeness, referential/invariant checks, and target cleanliness before any target write; only an explicit owner restore can apply the verified archive into a clean compatible deployment.
- Restore/replay is deterministic and idempotent. Preserve stable IDs, append-only history, content hashes, configuration/package/export digests, and tombstones; do not replay external effects. The clean target begins with all schedules, runners, Gmail/send outbox, provider calls, and delivery disabled/pause-fenced.
- Tampered bytes/manifest, wrong passphrase, expired delivery, unauthorized principal, non-clean target, missing objects, version skew, or failed invariant aborts before release, records a minimized audit outcome, and leaves target operational state unchanged.

### Audit and scope fences

- Audit every schedule-readiness view, weekly cohort calculation/version, export request/snapshot/materialization/download/expiry, duplicate/suppression exclusion, reauth authorization, archive creation/delivery, dry run, restore attempt/result, replay/invariant failure, and disabled-effect fence. Audit stores actor, workspace, immutable subject/version/digest, bounded outcome/reason, and time—not passphrases, credentials, raw archive contents, or raw sensitive contacts beyond justified references.
- Mining brochure/deck claims are proposed source evidence, not proof of outcomes. The sanitized `enrichment/sample_leads.json` may supply only non-production fixtures such as Operating/Greenfield segregation, one disqualified record, and formula-safe CSV cells; it must not be represented as live leads or imported operational data.

### Claude's discretion

- Exact table names, archive container and crypto library selection, UI component decomposition, pagination, and port/interface names may follow established server-authorized D1/R2/port patterns, provided all deterministic, suppression, fail-closed, no-external-effect, and generic-model constraints above are preserved.
</decisions>

<upstream_inputs>
## Exact Required Inputs from Phases 3–6

| Phase | Required authoritative input | Required use in Phase 7 |
|---|---|---|
| 3 | Confirmed Company/Product/Market Play hierarchy, immutable Product discovery configuration/dependency graph, Market Play state, and product readiness/audit history | Scope seeded hierarchy and archive/replay; distinguish generic hierarchy from Mining fixture labels; detect unavailable/drifted authority. |
| 4 | Active Operating/Greenfield Profile effective configurations, readiness decision, schedule definition/status/timezone, Prospect IDs/lifecycle first-transition history, qualification score/evidence/source lineage, review decisions/cooldowns/delays, and runner/run audit history | Calculate exact seven-lead cohort and losses, show schedule visibility, decide current Prospect eligibility, and archive/replay deterministic history. |
| 5 | Current Organization/Contact/contact-point identity and merge/split lineage, verification observations/class/method/freshness, contact eligibility projection, enrichment grants/reservations/outcomes including failures/uncertainty, and provenance | Select current CRM rows, explain exclusion/reversal, preserve identity/provenance during restore, and avoid treating suggestions as Enriched Contacts. |
| 6 | Current approved Outreach Package and immutable digest/expiry/revocation dependencies, company-wide suppression tombstones/aliases/deletion survival, current outbound/activity/stop state, CRM eligibility projection, and schedule/send pause controls | Require package approval for Export-ready CSV rows, omit suppressions transactionally, preserve tombstones, and guarantee restored schedules/sending stay disabled. |

Missing, stale, cross-workspace, unverified, drifted, suppressed, revoked, or otherwise non-current inputs cause the affected report/export/restore release to fail closed. Phase 7 must consume these projections and histories; it must not recreate qualification, enrichment, package approval, sending, or suppression authority.
</upstream_inputs>

<canonical_refs>
## Canonical References

- `docs/DIRECTION.md` — product boundaries, CSV-only CRM handoff, portability, initial seven-lead Mining target.
- `docs/IMPLEMENTATION-SPEC.md` sections 3, 7, 10, 11, 13, 17, 19, 20, 22, and 24 — states, eligibility, suppression, retention, export/restore, audit, release invariants.
- `docs/IMPLEMENTATION-PLAN.md` Wave 3 Slices 3.4–3.5 and deployment/complete gates — intended CSV and recovery proof shape.
- `docs/MIGRATION-ONE-MINING.md` — accepted Mining seed, Operating/Greenfield split, 06:00 America/Toronto schedule, seven target, fixture classification.
- `docs/adr/0001-generic-company-product-play-model.md` — generic hierarchy boundary.
- `docs/adr/0002-confirmed-knowledge-and-effective-configuration.md` — versioned authority and drift.
- `docs/adr/0003-untrusted-runners-and-human-gates.md` — bounded runner/effect separation.
- `docs/adr/0004-private-sites-pilot-and-portability.md` — private pilot/portable workspace and outstanding capability gates.
- `docs/adr/0005-advisory-compliance-hard-suppression.md` — Company-wide suppression wins.
- `source/Digitalrain-ONE-for-Mining.md` and `source/Miningbrochure.md` — proposed Mining positioning only, including illustrative-not-audited caveat.
- `enrichment/sample_leads.json` — sanitized, synthetic fixture evidence only.
- `.planning/phases/04-profile-readiness-and-evidence-based-prospecting/04-CONTEXT.md` and `.planning/phases/04-profile-readiness-and-evidence-based-prospecting/04-PATTERNS.md` — Phase 4 upstream contracts.
- `.planning/phases/05-controlled-enrichment-and-verified-contacts/05-CONTEXT.md`, `05-RESEARCH.md`, `05-PATTERNS.md`, and `05-VALIDATION.md` — Phase 5 upstream contracts.
</canonical_refs>

<deferred>
## Explicitly Out of Scope

- CRM integration/synchronization or CRM business objects.
- Actual schedule activation, runner execution, enrichment, provider calls/spend, Gmail/calling/sending, deployment, or use of live/private lead files.
- New qualification, contact-verification, package-approval, suppression, retention, or identity rules owned by earlier phases.
- Any Mining-specific schema branch, hard-coded company/product/play assumption, or assertion that illustrative source material proves a pilot result.
</deferred>

---

*Prepared from accepted direction, implementation contract, ADRs, prior phase preparation, and sanitized repository fixtures.*
