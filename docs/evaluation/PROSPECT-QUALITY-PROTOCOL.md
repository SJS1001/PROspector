# Prospect quality evaluation: owner labeling protocol (issue #7)

Status: DRAFT for owner review, 2026-11-09. Nothing here is accepted, frozen, or run.

This document is the reviewable protocol for issue #7. It builds on, and does not replace:

- `docs/PROSPECT-QUALITY-EVALUATION.md` (metric definitions, cost and time accounting, report shape).
- `site/domain/prospect-quality-evaluation.ts` (synthetic two-arm metric reducer, already merged).
- `docs/implementation-lanes/2026-09-08-contact-provider-public-research.md` (public-documentation provider comparison).

This protocol adds what those do not cover: who produces the quality labels, how Jev's draft labels are measured against the owner, and which parts cannot happen yet.

## 1. Evidence classes

| Class | What it is | May support a quality claim? |
|---|---|---|
| Synthetic harness | Fictional companies and people, `.invalid` references, run offline (`site/tests/fixtures/*`) | No. It proves formulas only. |
| Authorized provider trial | A later, separately authorized run with a real provider account and a spend limit | Only for provider behavior, and only after the owner approves the frozen protocol. BLOCKED. |
| Operating evidence | Real use of the product over an observation window | Yes, the only class that can. BLOCKED. |

Every machine report carries `evidenceClass` and `operationalAcceptance: false`. A passing synthetic run is never quality evidence.

## 2. Label roles

- **Owner labels are the independent ground truth.** They are made by the owner (or an owner-named reviewer) and are never replaced by a model.
- **Jev labels are drafts.** Jev (the TypeSafe decision model, reached through OpenRouter `POST https://openrouter.ai/api/alpha/decisions`, see `COMPLETION.md` "OpenRouter and Jev") proposes `relevant`, `irrelevant`, or `uncertain` plus a one-sentence reason per target. A draft is a work aid. It is never ground truth, never a verification, and never promotes a Prospect or contact point.
- **Application scores and provider labels** (`verified`, `likely-to-engage`, confidence numbers) are inputs under test, never labels. A provider label is not application verification.
- **Jev must not label its own pipeline's outputs as accepted truth.** Any target surfaced or scored by a Jev-backed step is marked `producedByJevPipeline`. Those targets get owner labels only. They are excluded from the Jev-vs-owner agreement sample and from any later "Jev may label more" scope.

## 3. Representative target set

1. Source: the confirmed Company, Product, Market Play and Customer Profile (not yet confirmed in this environment; see section 9).
2. Closed set, frozen before labeling, with explicit strata: `positive` (expected fits), `borderline`, `negative` (expected non-fits). Each stratum needs at least 3 adjudicated targets for the agreement test.
3. Identical target IDs are used for the `system` arm and the `manual` arm (the owner's current manual process), so quality and operator time compare on the same targets.
4. The owner records the manual-process result (what they would have found, minutes spent, cost) for the same targets. This is the comparator for `docs/PROSPECT-QUALITY-EVALUATION.md` paired deltas.
5. Real company names live only in the owner's private sheet, never in the repository. The repository holds the blank template and synthetic fixtures.

## 4. Owner labeling procedure

Sheet template: `docs/evaluation/owner-labeling-sheet-template.csv` (columns are pinned by `OWNER_LABELING_SHEET_COLUMNS` in `site/domain/label-agreement.ts`, and a test checks the header).

1. Freeze the target set, strata and thresholds (section 6) and record a timestamp. Changing any of them afterwards is a new protocol version.
2. Build the sheet from target IDs only. The owner works **blind to the Jev draft and to the application score**: the sheet has no Jev column. `owner_blinded_to_jev_draft` must be `true`; the scorer rejects any row where it is not.
3. Per target the owner records: `owner_relevance_label` (`relevant`, `irrelevant`, `unknown`) with a one-sentence reason; `owner_evidence_label` per material claim (`supported_current`, `supported_stale`, `unsupported`, `unknown`); `owner_organization_match` (`correct`, `incorrect`, `ambiguous`, `unknown`). Person identity, current affiliation and role labels follow the vocabulary in `docs/PROSPECT-QUALITY-EVALUATION.md`.
4. `unknown` is allowed and honest. Unknown targets are reported as owner-unresolved. They are not counted as agreement or disagreement, and they are not dropped from the report.
5. Disagreements between reviewers (if more than one) get a documented second review. The adjudication is recorded and not edited afterwards.

## 5. Jev draft procedure and the agreement measurement

Sample size: about 25 adjudicated prospects drawn from the frozen set across all strata, so the proposed ~25 sample is the minimum, not a target to stop at. Because some owner labels will be `unknown`, draw a few more than 25.

1. Only after the owner labels are sealed, Jev drafts a label and reason for the same sample (offline fixtures here; a live call needs the owner's OpenRouter key and spend limit, section 9). The draft is stored apart from the owner sheet.
2. `site/domain/label-agreement.ts` computes: raw agreement with Wilson 95% interval, Cohen's kappa, false-relevant rate (Jev says relevant where the owner says irrelevant), false-irrelevant rate, Jev abstain rate (`uncertain` never counts as agreement), and per-stratum agreement.
3. Jev rows with a missing reason, owner rows that were not blinded, duplicate IDs, and undeclared strata are rejected, not repaired.

### Threshold for Jev to label more

Proposed starting values (owner to confirm or change before freezing; they are fixed in the fixture and must not be loosened after seeing results):

| Gate | Value |
|---|---|
| Adjudicated sample (excluding owner-unknown and Jev-pipeline targets) | at least 25 |
| Adjudicated targets per stratum | at least 3 |
| Raw agreement | at least 0.85 |
| Agreement Wilson 95% lower bound | at least 0.70 |
| Cohen's kappa | at least 0.60 |
| False-relevant rate | at most 0.15 |

All gates must hold. If any fails, the decision is `owner_labels_only` and the report lists each failed gate. If all hold, the decision is `jev_may_draft_more_with_spot_checks`, which still means:

- Jev outputs remain drafts (`jevLabelsAreGroundTruth` is always `false`).
- Each batch of Jev drafts gets an owner spot check of at least 20% of the batch and at least 10 adjudicated rows.
- If spot-check agreement falls below 0.80, Jev's permission is revoked and the owner returns to owner-only labels until a new full agreement sample clears.
- A spot check below the minimum fraction or size is `insufficient_spot_check` and does not renew permission.

Jev-labelled rows are never used to compute the headline quality metrics as if they were owner truth. They may only be used to prioritize which targets the owner reviews first.

## 6. Quality, cost and time acceptance

Metric definitions, denominators and formulas are in `docs/PROSPECT-QUALITY-EVALUATION.md` and are not repeated here: relevance precision, closed-set recall, evidence correctness (including stale evidence), organization accuracy and false-match rate, person identity and current-role accuracy, verification yield, usable-target definition, operator active minutes per usable target, and known and at-risk cost per usable target including no-result, partial and uncertain charges.

Rules added by this protocol:

- Thresholds are set by the owner before any real result is seen. They are never changed to reach the seven-Prospect operating target.
- Losses and uncertainty are reported as measured: unknown counts, ambiguous counts, stale counts, no-result and partial charges, and sample-size limits stay in the report.
- Zero denominators are `unavailable`, never zero and never passing.

## 7. Provider semantics, freshness and reuse

The comparison of Apollo, Hunter, People Data Labs, RocketReach and ZoomInfo is in `docs/implementation-lanes/2026-09-08-contact-provider-public-research.md` (public documentation only, several cells `unknown`). For the trial the owner must resolve, per chosen provider:

- what each provider status means and which of them, if any, may be an input to application eligibility (none is verification on its own);
- the freshness mapping from provider fields (for example source last-seen dates) to the application's freshness rule, and what counts as `supported_stale`;
- permitted reuse and storage under the provider's terms (many cells are `unknown` today);
- API constraints: rate limits, per-call credit cost, and whether no-result and partial lookups are charged. These feed the cost ledger as `complete`, `no_result`, `partial` or `uncertain` charges.

## 8. What is in the repository now

| Item | Path | Status |
|---|---|---|
| Metric definitions and synthetic reducer | `docs/PROSPECT-QUALITY-EVALUATION.md`, `site/domain/prospect-quality-evaluation.ts` | Pre-existing, merged |
| Jev-vs-owner agreement scorer | `site/domain/label-agreement.ts` | New, synthetic only |
| Synthetic label fixture (32 fictional targets) | `site/tests/fixtures/label-agreement-v1.json` | New |
| Tests | `site/tests/label-agreement.test.mjs` | New |
| Owner labeling sheet template | `docs/evaluation/owner-labeling-sheet-template.csv` | New, blank |

The scorer is runtime-unreachable (no application module imports it) and performs no I/O.

## 9. Not yet possible (blocked)

| Item | Blocked on |
|---|---|
| Confirmed Customer Profile and representative real target set | Owner onboarding decision and owner-supplied targets |
| Owner labels for the ~25 sample | The owner's own time; no model can substitute |
| Live Jev drafts | The owner adds an OpenRouter key and sets a spend limit (`COMPLETION.md`, owner authorization 2026-11-09) |
| Manual-process comparator (time, cost) | The owner recording it for the same targets |
| Provider trial and real cost per usable prospect | Owner-added contact-provider account, quote and spend limit; separate authorization of the frozen protocol |
| Operating evidence | Phase 7 evaluation after the above |

No purchase, real contact lookup, live provider call, or real personal data is part of this protocol's current deliverable.
