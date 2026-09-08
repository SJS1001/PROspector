# Issue #7 evaluation lane — status and prior-ownership report

Date: 2026-09-08
Issue: [SJS1001/PROspector#7](https://github.com/SJS1001/PROspector/issues/7) —
"[P1] Define and measure prospect quality, contact coverage and operating cost"

## Starting HEAD and prior ownership discovered

Before any change in this lane, `codex/generic-onboarding-integration` was at
`bfdb58c` (26 commits behind `origin/main`'s `e0c93d2`), diverging only by a
single `.planning/STATE.md` addition. This lane first merged `origin/main`
into the branch (merge commit `61bc40c`, no conflicts) so new work sits on the
current baseline; it did not edit `.planning/STATE.md` or any other shared
file.

Searching history on that baseline for issue-7 material found no open pull
request, no branch, and no `docs/implementation-lanes` file referencing issue
7. It did find that **the issue's first deliverable — "a reviewable evaluation
protocol and fixtures" — already exists on `main`**, committed directly by the
repository owner (`Steven <steven@digitalrain.ai>`) in `6c5ba35` ("feat: add
synthetic prospect quality evaluation", 2026-09-05, no associated PR):

- `docs/PROSPECT-QUALITY-EVALUATION.md` — the pre-registration/labelling/
  metrics/accounting/reporting protocol document.
- `site/domain/prospect-quality-evaluation.ts` — a pure, dependency-free,
  runtime-unreachable synthetic reducer (`evaluateProspectQuality`).
- `site/tests/fixtures/prospect-quality-evaluation-v1.json` — a fictional,
  `.invalid`-referenced two-arm cohort fixture.
- `site/tests/prospect-quality-evaluation.test.mjs` — 15 focused cases,
  including a source-scan that asserts no runtime module imports the
  evaluator and the module itself performs no I/O.

Re-run in this lane on the current merged HEAD (`npm ci`, then
`node --test tests/prospect-quality-evaluation.test.mjs`, focused rather than
the full canonical suite per this lane's validation scope): **15/15 pass**,
unchanged. This lane made **no edit** to any of the four files above — they
are an existing writer's active, working deliverable, and duplicating them
would violate this lane's non-duplication boundary. This document is that
required "report exact evidence if found" instead.

## Mapping the existing harness to the issue-7 acceptance checklist

| Issue-7 checklist item | Status | Evidence |
|---|---|---|
| Specify measurable acceptance for relevance, evidence correctness, role/person accuracy, verification yield, false matches and stale evidence | **Done** (synthetic contract) | `PROSPECT-QUALITY-EVALUATION.md` "Metrics" table; `prospect-quality-evaluation.ts:139-181` (`closedSetRecall`, `relevancePrecision`, `evidenceAccuracy` incl. `supported_stale`, `organizationAccuracy`/`organizationFalseMatchRate`, `personIdentityAccuracy`, `currentRoleAccuracy`, `verificationYield`) |
| Measure operator time and total cost per usable prospect, including no-result, partial and uncertain provider charges | **Done** (synthetic contract) | `prospect-quality-evaluation.ts:244-298` (`activeMinutesPerUsable`, `knownCostMinorPerUsable`, `atRiskCostMinorPerUsable`, `contactOutcomeCounts`, `chargeOutcomeCounts` all carry `no_result`/`partial`/`uncertain`) |
| Distinguish a synthetic evaluation harness from separately authorized provider trials and actual operating evidence | **Done** | `PROSPECT-QUALITY-EVALUATION.md` "Purpose and authority boundary" and "Dependencies for real evidence"; every report carries `evidenceClass: "synthetic_only"` and `operationalAcceptance: false` (`prospect-quality-evaluation.ts:100,108`) |
| Report observed losses, uncertainty and sample limitations; do not adjust quality gates merely to reach a numeric target | **Contract done; no real observation exists** | `limitations` array and `sample` projection (`prospect-quality-evaluation.ts:129,344-362`) compute correctly against any input, but no owner-labelled real cohort has been run through it yet — see gaps below |
| Define a representative target set, independent owner quality labels and comparison with the current manual process | **Not started; owner-only prerequisite** | Protocol names the requirement (`PROSPECT-QUALITY-EVALUATION.md` "Pre-registration and cohort", "Dependencies for real evidence" item 4) but the fixture is explicitly fictional/`.invalid` and not representative |
| Document candidate provider semantics, evidence/freshness mapping, permitted reuse and account/API constraints without treating provider labels as application verification | **Partially done at a policy level; no named-provider research exists** | `.planning/phases/05-controlled-enrichment-and-verified-contacts/05-RESEARCH.md` fixes provider-neutral semantics (no provider selected; verification class/method/time rules; a provider label alone never promotes eligibility) — see gap below |

## Remaining gaps and owner-labelled/live-trial prerequisites

These are not satisfied by the synthetic harness and cannot be satisfied
locally under this lane's boundary (no external providers, accounts,
credentials, real identities, real data, outbound calls, exports, or hosted
actions):

1. **No representative real cohort exists.** `PROSPECT-QUALITY-EVALUATION.md`
   requires the real cohort be drawn from a confirmed Company, Product, Market
   Play, and Customer Profile with documented positive/negative/borderline
   coverage. That data does not exist yet in this environment and its
   creation is an owner/product decision, not an evaluation-harness change.
2. **No independent owner labels exist.** Relevance, evidence, organization,
   identity, role, and eligibility labels must be produced by a blinded
   owner/reviewer pass per the protocol's "Independent labelling" section;
   none has been run.
3. **No manual-process comparator has been measured.** The harness computes
   `pairedDelta` and manual-non-inferiority checks once both arms exist, but
   no real "manual" arm data (time, cost, outcomes) has been recorded.
4. **No named candidate provider has been selected or researched.**
   `05-RESEARCH.md` intentionally makes no provider selection under Phase 5's
   own gate ("No selection. Implement the port + fake contract first; a real
   provider needs separate explicit authority..."). Naming and vetting actual
   providers (evidence/freshness mapping, reuse terms, account/API limits,
   pricing) requires owner authorization to engage an external service and is
   out of this lane's boundary — it is not something a local documentation
   pass can respons­ibly originate without becoming premature provider
   selection.
5. **No provider trial, real contact lookup, or paid benchmark run has
   occurred or is authorized here.** Per the issue's own execution boundary
   and `AGENTS.md`, this remains blocked pending a separate owner
   authorization naming the frozen cohort, labels, manual comparator,
   thresholds, provider/account, spend cap, privacy handling, and observation
   window.
6. **Phase 4/5/7 acceptance gates are unchanged and unaffected.** This lane
   extends measurement scope only; it created, modified, and satisfies no
   phase gate, `depends_on` contract, or shared roadmap/state record.

Issue #7 is **not** complete while items 1–5 remain open. This report exists
so a future writer (owner-directed or otherwise) can pick up exactly where
the existing harness leaves off instead of re-deriving or duplicating it.

## Coordination note

An owner-approved coordination update received during this lane confirmed
independent Claude cloud coding and required canonical validation may proceed
on this isolated cloud container (the one-heavy-tree limit applies only to a
separate physical MacBook host, not globally), that this lane should not wait
on unrelated census/patch/other-issue work, that one writer per scope and no
duplicate live test runs still apply, and that already-scoped local/synthetic
fixes, tests, and review fixes need no further approval. It reaffirmed the
existing real-data/provider/credentials/hosted/outbound/export boundaries.
This lane found no other writer touching
`docs/implementation-lanes/issue-7-evaluation.md` or a new issue-7-specific
evaluation module, so no overlap exists to coordinate. Consistent with the
already-scoped "focused validation, no redundant broad/heavy suite" boundary
for this lane, and because no shared/runtime file was edited, this lane still
ran only the focused `node --test tests/prospect-quality-evaluation.test.mjs`
validation recorded above rather than the full canonical suite.

## What this lane did and did not change

- Read (did not edit): `AGENTS.md`, `docs/CODEX-CONTINUATION.md`,
  `docs/GREENFIELD-BASELINE.md`, `.planning/STATE.md`, `.planning/ROADMAP.md`,
  `02-ACTIVATION.md`, issue #7 and its (empty) comment thread,
  `05-RESEARCH.md`, `docs/PROSPECT-QUALITY-EVALUATION.md`,
  `site/domain/prospect-quality-evaluation.ts`,
  `site/tests/prospect-quality-evaluation.test.mjs`.
- Merged `origin/main` into `codex/generic-onboarding-integration`
  (`61bc40c`) to bring the branch current; no conflicts, no shared-file edits
  beyond the merge itself.
- Added this file only. No runtime, UI, schema, package, or planning file was
  edited. No new evaluation module or test was added, because the exact
  requested synthetic-harness deliverable already exists, is already merged
  to `main`, and re-implementing it would duplicate an existing writer's
  work rather than extend it.
- Ran focused validation only: `npm ci` and
  `node --test tests/prospect-quality-evaluation.test.mjs` (15/15 pass). Did
  not run the full canonical `npm test`/`npm run lint` suite or any browser
  acceptance suite, per this lane's "focused validation, no redundant
  broad/heavy suite" boundary.
- No external provider, account, credential, real identity, real data,
  outbound call, export, or hosted action was used, enabled, or requested.
  The retired Sites project was not accessed.
