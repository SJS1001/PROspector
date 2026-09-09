# Red-team triage and remediation

**Review received:** 2026-08-27

**Target:** `docs/hvac-aeo-seo/` integrated documentation artifact

**Original report:** [`RED-TEAM-REPORT.md`](RED-TEAM-REPORT.md)

This record preserves every finding. `Valid` means the cited defect existed in
the reviewed snapshot; it does not mean the original severity remains after
remediation. BLOCKER and HIGH findings were ground-truthed against the cited
files and, where applicable, the owning primary source.

## B1 — “Validated” was an unsupported completion claim

**Call: valid; mechanical blocker remediated.**

Ground-truth check:

- The reviewed README did lead with “A validated … resource.”
- The artifact checklist was unchecked.
- `git status` showed the package as untracked, so ordinary `git diff --check`
  did not inspect it.
- The application tests and lint passed but did not validate this documentation
  package.

Action:

- Changed the lead status to “evidence-grounded.”
- Split checked documentation controls from explicitly unchecked live-field
  checks in [`VALIDATION.md`](VALIDATION.md).
- Added the package-specific [`scripts/validate.mjs`](scripts/validate.mjs), this
  triage, the preserved independent report, and
  [`VALIDATION-RESULTS.md`](VALIDATION-RESULTS.md).
- Applied a no-index whitespace check to every untracked file rather than
  treating the tracked diff as evidence.

Residual limit: no live UI, contractor profile, data flow, credential, lead,
booking, ranking, citation, or revenue outcome is validated.

## H1 — Evidence taxonomies were disconnected from executable guidance

**Call: valid; remediated for grouped normative coverage.**

Ground-truth check:

- The README used source-family labels `R/P/S/O/E/X`.
- Primary research used operating dispositions
  `[REQ]/[REC]/[ELIG]/[HYP]/[EXP]` and originally said converted prescriptions
  should carry them.
- The playbook, UX spec, and examples did not contain either inline
  dispositions or a crosswalk.

Action:

- Clarified that source family and operating disposition are complementary.
- Added [`EVIDENCE-CROSSWALK.md`](EVIDENCE-CROSSWALK.md) covering every normative
  artifact group, with source IDs, disposition, and acceptance/limit.
- Updated the research wording to permit an explicit crosswalk.
- Added validator checks for evidence-ID definitions and crosswalk scopes.

Residual limit: automated checks prove crosswalk presence and ID integrity, not
that a future contributor classified a nuanced statement correctly; human
review remains required.

## H2 — Emergency copy could delay emergency contact

**Call: valid; remediated at specification level.**

Ground-truth check:

- The reviewed UX said “Call emergency services if instructed,” which made the
  call conditional.
- The source index lacked a gas-leak or carbon-monoxide emergency authority.
- [Ontario's carbon-monoxide guidance](https://www.ontario.ca/page/carbon-monoxide-safety)
  says occupants should get out immediately and call emergency services from
  outside.
- [Enbridge Gas Ontario](https://www.enbridgegas.com/ontario/safety/smell-gas)
  says to leave immediately and call its emergency number or 911 from a safe
  distance.
- [U.S. CPSC guidance](https://www.cpsc.gov/Safety-Education/Safety-Education-Centers/Carbon-Monoxide-Information-Center)
  says to get outside immediately and call 911 when CO poisoning is suspected.

Action:

- Removed the conditional language.
- Required immediate exit, an emergency/utility call from a safe location, and
  no re-entry until the responsible authority says it is safe.
- Made local authority binding and qualified safety review a publication
  blocker.
- Prohibited routing emergency action through forms, tracking consent, account
  creation, or the contractor sales queue.

Residual limit: the text is a design contract. A real implementation still
requires live local phone targets, jurisdictional safety approval, and task
testing.

## H3 — Measurement lacked an executable privacy/security gate

**Call: valid; remediated at playbook and UX-contract level.**

Ground-truth check:

- Primary research required approval, minimization, retention, and access
  controls.
- The reviewed Stage 1 prescribed call IDs, lead IDs, service addresses,
  analytics, CRM outcomes, and revenue without making those controls a blocking
  acceptance gate.

Action:

- Added a blocking field-level data-flow, purpose, consent, vendor, region,
  access, retention/deletion, recording/transcript, security, and incident-owner
  gate before measurement.
- Prohibited personal data in URLs, ad parameters, analytics dimensions, public
  logs, research, and AI prompts by default.
- Specified synthetic negative tests and acceptance criteria for opt-out, rights
  requests, least privilege, retention, recording, session replay, incident
  routing, and PII leakage.
- Added corresponding request-flow privacy and contact controls to the UX spec.

Residual limit: privacy law and lawful-basis decisions remain jurisdiction- and
vendor-specific; unresolved decisions block the affected live collection.

## H4 — Business Profile changes lacked rollout and recovery controls

**Call: valid; remediated at playbook level.**

Ground-truth check:

- The reviewed playbook proposed high-impact identity, category, phone, URL,
  service-area, manager, and verification changes.
- Its acceptance criteria did not require prior-state capture, bounded batches,
  last-owner protection, or a re-verification/suspension response.

Action:

- Added an authorized-actor and current-state capture gate.
- Required an exact change log, small coherent change sets, last-owner and
  phone/URL protection, post-change monitoring, and stop conditions.
- Required prewritten re-verification, suspension, access-recovery, and appeal
  handling before changes.

Residual limit: no live profile was changed or dry-run because this package has
no contractor authority or hosted control plane.

## M1 — Address-hidden schema eligibility was understated

**Call: valid; remediated.**

The README now states that omitting the required address means the example does
not satisfy Google's currently documented LocalBusiness rich-result
implementation, while distinguishing general Schema.org validity and preserving
address privacy.

## M2 — Review requests lacked deduplication and frequency controls

**Call: valid; remediated.**

The SOP now requires a stable interaction/request key, cross-channel
deduplication, a documented cooldown/frequency cap, and durable opt-out and
suppression evidence.

## M3 — Adjacent-trade applicability exceeded the safety evidence

**Call: valid; remediated.**

The secondary-audience statement now identifies this as a transferable
framework only and requires a separate trade- and jurisdiction-specific hazard,
credential, permit, and claims overlay before use.

## L1 — Duplicated research checklist item

**Call: invalid in the ground-truthed artifact.**

The cited validation protocol contains one instance of “baseline window and
primary outcome.” No duplicate existed when checked. No edit was made for this
finding.

## Post-remediation disposition

The original report's `BLOCKED` verdict accurately described the reviewed
snapshot. The mechanical completion-claim blocker and all valid documentation
findings have been remediated. Live implementation checks remain intentionally
open and cannot be converted into documentation evidence.

## Independent remediation-audit follow-up

The independent reviewer returned `PARTIALLY RESOLVED` and raised one new HIGH,
one MEDIUM, and one LOW item.

### NH1 — Validation receipt did not bind the remediated artifact

**Call: valid; remediated.**

The first receipt still described the pre-remediation 101-link set, had no final
manifest digest, and the crosswalk incorrectly cited measurement/privacy as
primary-research §9 instead of §8. The crosswalk references were corrected; all
104 current external Markdown URLs were probed again; current exceptions and
redirect results were recorded; and a reproducible SHA-256 manifest digest was
added after the final checks.

The package validator intentionally remains a deterministic local validator. It
does not pretend that heading presence proves source-to-claim semantics or that
network checks are stable; those limits are explicit in the validation receipt.

### NM1 — Triage implied privacy negative tests had run

**Call: valid; remediated.**

The wording now says the package **specified** synthetic negative tests and
acceptance criteria. Live execution remains open in the validation ledger and
receipt.

### NL1 — Two alleged adjacent duplicate accessibility lines

**Call: invalid after line-level ground truth.**

The cited playbook statement appears once in `PLAYBOOK.md`, and the cited target
size statement appears once in `UX-SPEC.md`. They are related requirements in
different artifacts, not adjacent duplicate lines. No removal was made.
