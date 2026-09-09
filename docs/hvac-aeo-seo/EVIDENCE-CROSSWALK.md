# Evidence and operating-disposition crosswalk

## Purpose

This crosswalk makes the package's two classifications explicit:

- `R/P/S/O/E/X` identifies the source or evidence family defined in
  [`README.md`](README.md).
- `[REQ]/[REC]/[ELIG]/[HYP]/[EXP]` identifies the operating disposition defined
  in [`PRIMARY-SOURCE-RESEARCH.md`](PRIMARY-SOURCE-RESEARCH.md).

A row applies to every normative statement in the named scope unless a narrower
inline label overrides it. Mixed rows name more than one disposition because a
workflow can combine a hard policy boundary with a recommended implementation
and a contractor-specific hypothesis. The acceptance or validation column is
what prevents the recommendation from becoming an unsupported promise.

## README guidance

| Scope | Disposition | Evidence family | Acceptance or limit |
|---|---|---|---|
| Start-here identity and Business Profile controls | `[REQ][REC]` | P1, P2, P7 | Confirm real location, ownership, service area, and current platform state; no ranking promise. |
| Review integrity | `[REQ]` | P3, P19, R1, R2 | Genuine interaction, neutral request, no gating/incentive/pressure, self-serving schema excluded. |
| Service and location content architecture | `[REC][HYP]` | P4, P6, P11, O2–O9 | Publish only actual services and materially distinct local value; field-test qualified demand and spam harm. |
| HVAC credential, performance, rebate, health, and safety claims | `[REQ][REC]` | R3, O1–O9 | Claim-level technical/jurisdiction review, current evidence, explicit assumptions, and stop points. |
| Structured data baseline | `[REQ][ELIG]` | P5, P12, P13, P19, S1, S2 | Visible factual parity and syntax validation; eligibility is not display or ranking. |
| Conversion and accessibility guidance | `[REC]` plus `[REQ where applicable]` | S3, S4, P14 | Keyboard, zoom, mobile, error/recovery and jurisdictional review; no legal-conformance overclaim. |
| Measurement hierarchy | `[REC][HYP]` | P9, P15, P16, P20, E2, E3 | Preserve definitions and confounders; business outcomes outrank diagnostic visibility. |
| AI readiness baseline | `[REC][ELIG]` | P6, P8 | Ordinary indexability and useful content first; no citation guarantee. |
| AI experimental backlog | `[EXP]` | X plus E1–E5 | Isolate, repeat samples, cap effort, declare harm/rollback, and preserve ordinary search outcomes. |

## Playbook

| Scope | Disposition | Evidence family | Acceptance or limit |
|---|---|---|---|
| Stage 0 truth inventory and stop conditions | `[REQ][REC]` | P1–P3, P10, R1–R3, O1–O9 | Named evidence owner, public-display permission, unresolved decision blocks affected work. |
| Stage 1 data-governance gate | `[REQ where applicable][REC]` | regulator duties vary; primary research §8 | Approved field-level data flow, least privilege, retention/deletion, consent/recording tests, no PII in analytics or prompts. |
| Stage 1 measurement events and baseline | `[REC][HYP]` | P9, P15, P16, P20 | Instrument only approved fields; validate event semantics and reconcile without claiming causality. |
| Stage 2 profile change-control gate | `[REQ][REC]` | P1, P2, P10 | Authorized actor, prior-state evidence, last-owner protection, bounded change set, recovery and suspension runbook. |
| Stage 2 profile target state | `[REQ][REC]` | P1, P2, P7, P10 | Platform eligibility and truthful identity; visibility is not guaranteed. |
| Stage 3 website and conversion foundation | `[REC][ELIG]` | P4–P6, P11–P18, S1–S4 | Crawl/index tests, accessible task tests, visible/schema parity, no rich-result promise. |
| Stage 4 content order | `[HYP]` | P6, P11, O2–O9 | Contractor may reorder using verified need, margin, capacity, safety, and baseline data. |
| Stage 4 evidence and release gates | `[REQ][REC]` | P3, P6, P11, R1–R3, O1–O9 | Technical, safety, claim, consent, accessibility, and duplication review before publish. |
| Stage 5 review and off-page work | `[REQ][REC]` | P3, P19, R1, R2 | Neutral, deduplicated solicitation and source-relevant listings; no paid/manipulated proof. |
| Stage 6 AI evaluation | `[HYP][EXP]` | P6, P8, P20, E1–E5 | Repeated versioned samples, comparison pages, diagnostic-only interpretation, bounded rollback. |
| 30/60/90 sequencing | `[HYP]` | grouped rows above | Owner may change timing for risk/capacity; no phase is complete without its evidence gates. |

## UX specification

| Scope | Disposition | Evidence family | Acceptance or limit |
|---|---|---|---|
| Global shell, mobile actions, and content hierarchy | `[REC]` | P14, S3, S4 | Keyboard, focus, zoom/reflow, mobile and obstruction tests. |
| Emergency strip and route | `[REQ where applicable][REC]` | O plus live local fire/emergency/gas authority | Block until localized; leave immediately, call from safety, no sales/consent dependency, no re-entry until authorized. |
| Trust and credential presentation | `[REQ][REC]` | P1, P10, R3, O1–O3, O9 | Issuer, holder, scope, territory, status, date, and verification path must match. |
| Service/location page modules | `[REC][HYP]` | P6, P11, O2–O9 | Real service/local evidence and user testing; no doorway template or conversion guarantee. |
| Request-service fields and states | `[REC]` plus `[REQ where applicable]` | S4 and primary research §8 | Minimize fields, distinguish request from confirmation, test errors/recovery and lawful contact controls. |
| Privacy and contact controls | `[REQ where applicable][REC]` | primary research §8 | Approved data flow; PII exclusion from URLs/analytics/prompts; consent, opt-out, retention and rights tests. |
| Content, accessibility, performance, and prohibited patterns | `[REC]` plus `[REQ where applicable]` | S3, S4, P11, P14 | Human task tests and technical measurements; jurisdiction-specific accessibility/legal review remains required. |

## Examples and governance

| Scope | Disposition | Evidence family | Acceptance or limit |
|---|---|---|---|
| Hybrid HVAC JSON-LD | `[ELIG]` | P5, S1 | Replace fictional values with approved visible facts; public customer-facing address required for the documented Google feature. |
| Address-hidden service-area JSON-LD | `[REC]` semantic only | P2, P5, S1 | Preserve address privacy; does not satisfy Google's documented LocalBusiness rich-result address requirement. |
| Service JSON-LD | `[REC]` semantic only | P12, S2 | No standalone Google Service rich-result or ranking promise. |
| Service-page brief | `[REC][HYP]` with `[REQ]` release gates | P6, P11, R3, O1–O9, S3, S4 | Contractor-specific proof and technical/safety/claim/accessibility review before publication. |
| Review-request SOP | `[REQ][REC]` | P3, P19, R1, R2 | Neutral completed-interaction rule, idempotency, cooldown/frequency, suppression, and audit evidence. |
| Validation ledger | `[REC]` governance | all cited source families | A checked result needs a separate dated receipt; unchecked items are not completion evidence. |
| Contribution rules | `[REQ]` for this package | all source families | Reject commercial bias, unsupported claims, secrets, unsafe guidance, and evidence-free tactics. |

## Coverage rule

New or materially changed normative sections must update this crosswalk or carry
an inline operating-disposition label and source identifier. The package
validator checks that every required artifact remains represented here; a human
reviewer must still verify that the row actually fits the nearby prescription.
