---
phase: 07
slug: mining-pilot-handoff-and-recovery
status: planning-ready
nyquist_compliant: true
created: 2026-07-30
---

# Phase 7 — Validation Strategy

## Test Infrastructure and Fixture Policy

Use the existing Node built-in runner and Miniflare D1/R2 test seams. Inject fake object/archive-delivery/clock ports. Tests use only synthetic records and sanitized fixtures; no credentials, live/private leads, real contact points, paid calls, sends, schedules, or deployment operations.

- Focus each module with deterministic clock/crypto test fixtures; run `cd site && npm test`, lint, and build as relevant after code tasks.
- Archive encryption tests use generated test passphrases only in process memory and fixed/randomness seams for test vectors; test outputs contain no secret values.
- A successful UI/demo does not substitute for byte-level CSV, suppression-race, archive-integrity, dry-run zero-write, restore replay, or effect-fence evidence.

## Verification Map

| Area | Threat / failure | Required proof |
|---|---|---|
| Seed/readiness/schedule | Mining labels accidentally activate Greenfield or schedule work | synthetic seed shows generic hierarchy, Operating vs Draft/nurture Greenfield, 06:00 America/Toronto visibility; absent readiness/gate leaves schedule disabled and invokes no scheduler. |
| Weekly cohort | CSV rows, re-export, reversal, UTC boundary, or multiple contacts inflate target | table-driven Monday–Sunday Toronto transitions prove one first ExportReady transition per Prospect; seven fixtures can yield >7 rows; reversal/losses remain visible but uncounted. |
| Funnel losses | quality gates hidden to hit target | rejection, deferral, enrichment failed/uncertain, review delay, stale, suppressed, drifted, and reversal fixtures render/count distinct labelled losses with no ExportReady increment. |
| CSV eligibility | unverified/stale/unapproved/cross-scope rows leak | every invalid upstream condition yields no contactable row; only current fresh verified non-suppressed contacts under a valid package are included. |
| Determinism | retries/order/locale alter CSV or duplicate row | same snapshot/version produces byte-identical UTF-8 CSV and SHA-256; shuffled inputs preserve canonical order; conflicting idempotency reuses no artifact. |
| CSV safety | spreadsheet formula/quoting/newline corruption | fixtures cover `= + - @`, quotes, comma, CR/LF, Unicode and null values; parser round-trip proves fixed headers and neutralized cells. |
| Duplicate and suppression | duplicate identity or alias/merge/restore bypass | stable Prospect+contact-point identity emits one row; exact/domain/contact/org/company tombstones and aliases omit rows transactionally; separate non-contactable manifest is labelled and non-contactable. |
| Audit/retention | sensitive values or missing decision trace | audit assertions require actor/workspace/subject/digest/outcome/time and reject passphrases, tokens, raw archive/contact payload; export delivery expiry blocks access without changing history. |
| Archive integrity | missing record/object/history/tombstone or tampering | manifest enumerates counts/hashes; deliberate byte, manifest, object, and tombstone defects fail before restore release. |
| Crypto/authorization | wrong passphrase, unauthorized/expired request, downgrade | each fails closed with no target write/release; supported envelope/schema/KDF only and audit uses bounded safe reason. |
| Dry run | verifier mutates clean target | dry run validates compatible clean target and returns report with zero D1 target/object writes, zero scheduler/provider/send calls. |
| Restore/replay | partial/non-clean/skewed restore or effect reactivation | clean compatible restore preserves IDs/history/hashes/tombstones and reprojects deterministically; non-clean/skew/missing object fails unchanged; restored queues/schedules/outbox/providers are disabled and fake ports have zero calls. |
| Generic model | Mining hard-code | repeat report/export/archive fixtures for a second synthetic company/product/play/profile and prove no label-dependent behavior. |
| UI accessibility | safety state implicit or target confused with permission | render tests assert target definition, distinct Prospect-vs-contact-row counts, timezone, loss reasons, disabled explanation, recovery status, keyboard-visible text, and no misleading CRM/scheduling action. |

## Required Fixture Set

- Synthetic generic hierarchy plus the sanitized Mining-shaped fixture: Operating, Greenfield/nurture, non-target, disqualified; add a second non-Mining company/product/play.
- Seven first-transition Prospects spanning America/Toronto week boundary, with several valid contact points, re-export/reversal cases, and all loss categories.
- Contact identity/merge aliases with each suppression subject type and current/stale/suggested/invalid verification variants.
- Archive containing canonical records, objects, history, export manifests, and tombstones; modified bytes/manifest/missing object/version/target/passphrase/authorization/expiry variants.

## Manual / Release Gates (Not Authorized by This Preparation)

| Gate | Pass signal | Fail-closed behavior |
|---|---|---|
| Upstream Phase 3–6 authoritative inputs accepted | exact readiness, qualification, verification, package, suppression, and pause projections exist | reports/export/restore release stays disabled. |
| Capability proof for chosen archive crypto/object/delivery path | maintained implementation plus test vectors and hosted capability evidence accepted | no sensitive workspace archive/delivery. |
| Clean compatible deployment restore drill | dry run and explicit restore match manifest/invariants with all effects disabled | no pilot activation/system-of-record reliance. |
| Adversarial recovery/export review | no unresolved blocker/high finding | no operational handoff/recovery acceptance. |

## Sign-off Criteria

- Each of the five Phase 7 roadmap success criteria has positive evidence and at least one fail-closed negative proof.
- Exactly seven is tested as a Prospect first-transition metric; CSV contact row count is separately tested and may exceed seven.
- Every denial proves zero unauthorized output/effect; restore denials additionally prove zero target state delta and zero external port call.
- Mining evidence is correctly labelled proposed/illustrative/synthetic, and generic second-play tests pass.
