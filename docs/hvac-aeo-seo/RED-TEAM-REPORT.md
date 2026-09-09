# Red-Team Report: docs/hvac-aeo-seo integrated artifact

## Verdict

BLOCKED

## Scope Attacked

- Target type: written analysis | plan/spec
- Artifact reviewed: all 11 files in `docs/hvac-aeo-seo/`, including research, playbook, UX specification, validation ledger, contribution rules, and examples
- Goal being tested: determine whether the package is accurate, safe, independently verifiable, executable, and honest about documentation versus implementation
- Evidence available: line-numbered target files; repository instructions; branch/HEAD/status; JSON parsing; relative-link resolution; external-link probes; current primary-source spot checks
- Evidence missing: a durable validation receipt, completed artifact checklist, rendered UI, contractor field evidence, jurisdiction-specific legal/safety approval, and production rollout evidence
- Omitted lanes/residual risk: runtime code, deployed UI, live Business Profiles, production analytics, and contractor-specific outcomes were not reviewed because none exists in the target

## Executive Summary

- The package cannot call itself “validated”: its validation checklist is entirely unchecked, and the claimed repository checks do not exercise these untracked documents.
- The executable documents discard the package’s own evidence-label contract, making requirements, recommendations, hypotheses, and experiments indistinguishable.
- The emergency UX contains conditional, underspecified escalation language that can delay emergency contact in a gas-leak or carbon-monoxide scenario.
- The package is unusually strong on rejecting ranking folklore, deceptive reviews, unsafe repairs, fabricated credentials, and revenue overclaims, but those strengths do not cure the validation, safety, privacy, and rollout gaps below.

## Findings

### BLOCKER

#### B1. “Validated” is an unsupported completion claim

- Evidence: `README.md:3-5` describes the package as “A validated, contractor-specific resource.” `VALIDATION.md:55-93` leaves every content, structured-data, link, and UX validation item unchecked. `git status --short -- docs/hvac-aeo-seo` reports only `?? docs/hvac-aeo-seo/`; consequently, `git diff --check -- docs/hvac-aeo-seo` exits 0 without examining these files. The `site/package.json` test and lint scripts exercise the application tree, and no site test or script references `docs/hvac-aeo-seo`.
- Impact: JSON parsing, application tests, lint, and a clean tracked diff can all pass while factual claims, Markdown, links, and UX guidance in the target remain wrong. Readers receive false assurance at the package’s first substantive claim.
- Why this is BLOCKER: “Validated” is the artifact’s lead readiness claim, but the supplied evidence cannot prove it and the artifact’s own validation record shows no completed checks.
- Recommended fix: Either change the status to an evidence-informed draft or add a tracked validation receipt identifying the exact commit/files, commands, source-review results, redirect destinations, exceptions, reviewer, and completed checklist.
- Verification required: Run a package-specific validator against staged/tracked files covering JSON, Markdown targets and anchors, source freshness, evidence-label coverage, schema semantics, privacy placeholders, and recorded link exceptions; then obtain independent sign-off on the exact artifact digest.

### HIGH

#### H1. The playbook and UX contract violate their own evidence-label requirement

- Evidence: `README.md:68-77` says every recommendation should resolve to an evidence label. `PRIMARY-SOURCE-RESEARCH.md:12-20` says every prescriptive statement converted into a playbook, checklist, prompt, or UI control should carry `[REQ]`, `[REC]`, `[ELIG]`, `[HYP]`, or `[EXP]`. `PLAYBOOK.md`, `UX-SPEC.md`, and the example Markdown files contain none of those labels. Material prescriptions such as the publication order at `PLAYBOOK.md:177-187` and request-flow requirements at `UX-SPEC.md:144-171` are therefore unclassified. The README also uses a different `R/P/S/O/E/X` taxonomy without a crosswalk.
- Impact: A contractor cannot distinguish a platform or legal requirement from official advice, an operating inference, or an experiment. That defeats the package’s main protection against stale AEO folklore and unsupported causality.
- Recommended fix: Adopt one taxonomy or publish an exact crosswalk, then attach a class and source/validation identifier to every normative playbook, UX, and example requirement.
- Verification required: An automated coverage check plus independent review must prove every normative statement resolves to a source-backed requirement, recommendation, inference, or experiment.

#### H2. The emergency UX can delay required emergency contact

- Evidence: `UX-SPEC.md:46-50` proposes “Possible gas smell or carbon-monoxide alarm? Leave the area and follow your local … guidance” followed by “Call emergency services if instructed.” `README.md:232-244` requires red-class content to cite the relevant emergency, fire, utility, manufacturer, or regulatory authority, but the source index at `README.md:573-590` contains no gas-leak, carbon-monoxide-alarm, fire-service, or utility emergency source.
- Impact: A homeowner can leave the building but delay calling emergency services or the gas utility while looking for further instructions. Current CPSC and Ontario gas-utility guidance directs occupants to leave immediately and call from a safe location; a contractor sales page must not introduce ambiguity.
- Recommended fix: Block publication until a jurisdiction-specific authority record supplies exact instructions and emergency contacts. Remove “if instructed,” require immediate contact from a safe location where the authority says so, and include supported no-reentry/electronics/switch precautions.
- Verification required: Qualified safety review against the live local fire/utility/regulatory source, followed by a user test proving the emergency route never enters or depends on the sales funnel.

#### H3. Production measurement is prescribed without an executable privacy and security gate

- Evidence: `PRIMARY-SOURCE-RESEARCH.md:222` requires data-flow approval, collection minimization, retention, and access definitions. `PLAYBOOK.md:44-48` calls for analytics, call tracking, CRM ownership, historical lead, revenue, and capacity data; `PLAYBOOK.md:77-87` adds call IDs, stable lead IDs, service and geography qualification, booking, and CRM outcomes. The Stage 1 acceptance list at `PLAYBOOK.md:107-114` contains no data map, purpose limitation, retention/deletion rule, access control, vendor approval, consent proof, recording control, or incident handling. `UX-SPEC.md:148-159` adds residential address, name, phone, email, and service details.
- Impact: Residential PII and call/CRM data can be copied among analytics, phone, agency, and CRM systems under the vague phrase “where permitted,” creating privacy, disclosure, retention, and cross-border risk.
- Recommended fix: Add a blocking data-governance stage before measurement: field-level data map, lawful purpose/consent, destination and vendor inventory, minimization, retention/deletion, role access, recording/transcript handling, breach ownership, and prohibited prompt/public-data flows.
- Verification required: Jurisdiction-approved data-flow record and negative tests showing opt-outs, deletion, access restrictions, recording controls, and PII exclusion from analytics parameters and AI prompts.

#### H4. High-impact Business Profile changes lack rollout, recovery, and lockout controls

- Evidence: `README.md:24-27` acknowledges that profile-rule violations can cause suspension. `PLAYBOOK.md:120-135` directs changes to identity, category, phone, URL, hours, service areas, services, images, managers, and Local Services verification. Its acceptance criteria at `PLAYBOOK.md:137-145` describe only the desired end state; there is no current-state snapshot, exact change log, last-owner protection, batch sequencing, re-verification contingency, suspension monitoring, appeal path, or rollback decision.
- Impact: A contractor can lose profile access, trigger re-verification or suspension, break phone/URL attribution, or remove a legitimate manager while executing a supposedly bounded playbook.
- Recommended fix: Require an authorized actor, pre-change export/screenshots, verified last-owner invariant, one bounded change set at a time, post-change monitoring, access-recovery contacts, and an explicit suspension/re-verification response plan.
- Verification required: Human-approved runbook and a dry run demonstrating actor authority, recoverable prior values, manager-removal safeguards, monitoring, and stop conditions.

### MEDIUM

#### M1. The service-area schema guidance understates definite Google rich-result ineligibility

- Evidence: `PRIMARY-SOURCE-RESEARCH.md:103` correctly states that Google documents physical `address` as required for its LocalBusiness feature. `SERVICE-AREA-HVAC-BUSINESS.jsonld:1-36` omits it, but `README.md:357-360` says this “may reduce eligibility.”
- Impact: Readers may believe the address-hidden example remains conditionally eligible for Google’s documented LocalBusiness rich result. It does not satisfy the required-property definition, although it can remain valid Schema.org vocabulary.
- Recommended fix: State that the example does not qualify for Google’s documented LocalBusiness rich-result implementation while the address is omitted, and distinguish that from general semantic validity.

#### M2. The review SOP lacks deduplication and frequency controls

- Evidence: `examples/REVIEW-REQUEST-SOP.md:11-22` defines customer eligibility, while its audit fields at `examples/REVIEW-REQUEST-SOP.md:63-73` omit a stable interaction/request key, prior-request count, cooldown, channel frequency cap, and suppression reason.
- Impact: A neutral CRM rule, technician workflow, and agency automation can each request a review from the same customer. The selection remains sentiment-neutral but becomes repeated pressure and cannot be audited reliably.
- Recommended fix: Add idempotent job/interaction keys, cross-channel deduplication, a documented maximum frequency/cooldown, and durable opt-out/suppression checks.

#### M3. Adjacent home-improvement applicability is broader than the safety evidence supplied

- Evidence: `README.md:8-11` names plumbing, electrical, roofing, insulation, and windows as a secondary audience. The actionable safety model at `README.md:232-244` and credential/safety research at `PRIMARY-SOURCE-RESEARCH.md:151-189` primarily cover HVAC, refrigerants, fuel, lead disturbance, and equipment claims.
- Impact: Adjacent contractors can mistake the package for a ready operating playbook despite missing trade-specific controls for falls, structural work, energized service, potable-water contamination, excavation, asbestos, and other jurisdictional hazards.
- Recommended fix: Label adjacent-trade use as a framework requiring a separate trade-specific safety/licensing overlay, or supply and validate those overlays before naming those audiences.

### LOW

#### L1. The research checklist contains a duplicated item

- Evidence: `PRIMARY-SOURCE-RESEARCH.md:230` repeats “baseline window and primary outcome” twice.
- Impact: Minor editorial noise in a document intended to model rigorous validation.
- Recommended fix: Remove the duplicate line.

## Clean Attack Notes

Not applicable; findings are listed above.

## Triage Requirements For Main Agent

- Ground-truth every BLOCKER and HIGH before accepting it.
- For each BLOCKER/HIGH, record: `valid`, `invalid`, `needs-investigation`, or `severity-adjusted`.
- Auto-fix only mechanical BLOCKERs with clear point fixes.
- Escalate user-decision BLOCKERs instead of silently rewriting scope or policy.
- Surface MEDIUM and LOW findings to the user unless explicitly out of scope.
