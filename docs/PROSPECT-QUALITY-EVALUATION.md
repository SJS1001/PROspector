# Prospect quality evaluation protocol

## Purpose and authority boundary

This protocol defines how PROspector quality, contact coverage, operator time,
and cost will be measured. The checked implementation is a **synthetic
calculation harness only**. It cannot read or write application state, select a
provider, establish that a contact point is verified, qualify a Prospect,
create an export, or authorize any external effect. A passing synthetic fixture
means only that the metric formulas and failure behavior work as specified.

Any provider trial is a later, separately authorized activity. Before such a
trial, the owner must approve the frozen target cohort, independent labels,
manual comparator, thresholds, provider/account, maximum spend, handling of
private data, and observation window. Results from a provider label are never
treated as application verification or independent ground truth.

## Pre-registration and cohort

One evaluation version freezes, before results are examined:

- protocol ID, revision, timestamp, currency, thresholds, and sample minimum;
- a closed target set with explicit strata and one independent owner label per
  target: `relevant`, `irrelevant`, or `unknown`;
- identical target IDs for the `system` and `manual` arms;
- the evidence, organization, person, role, affiliation, and current-contact
  label vocabulary below; and
- the active-time and cost accounting rules.

The evaluator emits separate protocol, cohort, and complete-evaluation SHA-256
digests. Changing a threshold, stratum, target, label, observation, time row,
or cost row changes the applicable digest and is a new evaluation version.
Thresholds must not be loosened after results are seen to reach the
seven-Prospect operating target. Both arms must explicitly attest complete
active-time and cost ledgers; partial coverage is rejected instead of being
misreported as zero.

The representative real cohort must eventually be drawn from the confirmed
Company, Product, Market Play, and Customer Profile, with documented coverage
of expected positive, negative, and borderline cases. The local fixture uses
fictional opaque IDs and `.invalid` references and is not representative
evidence.

## Independent labelling

Owner labels are recorded independently of the application score and provider
claims. A real protocol should use a blinded first pass, a documented second
review for disagreements, and an immutable adjudication record. `unknown`
labels stay in the denominator as failures where a metric applies and are
reported as uncertainty; they are never silently dropped.

Evidence labels apply to each material claim:

- `supported_current`: the cited source supports the claim and is current under
  the frozen source policy;
- `supported_stale`: the source supports the claim but is not current;
- `unsupported`: the cited material does not support the claim; or
- `unknown`: the reviewer cannot establish support.

Organization matches are `correct`, `incorrect`, `ambiguous`, or `unknown`.
Returned people are independently labelled for identity, current affiliation,
and role. Contact eligibility is `current_eligible` only when separate trusted
evidence would satisfy the application's mailbox/source-verified business-point
and freshness rules; provider terminology or numeric confidence cannot promote
it.

## Metrics

Every count uses distinct frozen target or contact-attempt IDs. Duplicate rows
are rejected rather than averaged away.

| Metric | Exact definition |
|---|---|
| Closed-set recall | adjudicated relevant targets surfaced / all adjudicated relevant targets in the frozen cohort |
| Surfaced relevance precision | surfaced targets labelled relevant / all surfaced targets; `unknown` is not a success |
| Material-evidence coverage | surfaced targets presenting at least one material claim / all surfaced targets |
| Evidence support accuracy | material claims labelled `supported_current` / all material claims presented |
| Organization accuracy | surfaced targets with an independently confirmed organization match / all surfaced targets |
| Organization false-match rate | surfaced targets labelled `incorrect` / all surfaced targets; ambiguous/unknown remain separately reported |
| Person identity accuracy | returned people labelled correct / all returned people |
| Current-role accuracy | returned people with correct identity, correct role, and current affiliation / all returned people |
| Verification yield | unique attempts producing a current eligible point / all unique contact attempts |
| Relevant-target contact coverage | surfaced relevant targets with at least one current eligible point / all surfaced relevant targets |
| Evaluation-usable target | a distinct surfaced relevant target with a correct organization, at least one material claim and all such claims current/supported, plus one correctly identified, currently affiliated, correct-role person with a current eligible point |
| Active minutes per usable target | sum of non-overlapping recorded operator-active intervals / evaluation-usable targets |
| Known cost per usable target | all documented actual charges, including no-result and partial charges / evaluation-usable targets |
| At-risk cost per usable target | documented actual charges plus unresolved reserved amounts, including uncertain outcomes / evaluation-usable targets |

`Evaluation-usable` is benchmarking terminology only. It does not create or
change an application Prospect, ContactReady, PackageReady, or ExportReady
state. Zero denominators are `unavailable`, never zero and never passing.
Proportions include Wilson 95% intervals. The report also preserves outcome
counts for complete, no-result, partial, and uncertain attempts and charges.

The system arm is checked against predeclared absolute thresholds and against
the manual arm's paired metrics using the predeclared maximum regression.
Cost and time caps are owner policy inputs that must be fixed before a real
trial. Synthetic values exercise the calculation and imply no production
policy.

## Cost and time accounting

Both arms use the same ISO currency and observation window. Cost records retain
their outcome. Known actual charges always count, even when the result is empty,
partial, or unusable. An uncertain charge retains its unresolved reservation;
the at-risk total is actual plus unresolved reserved cost. Currency mismatch,
negative values, duplicate charge IDs, or an unresolved amount on a settled
complete, no-result, or partial result invalidate the evaluation. An uncertain
provider result can never be labelled a current eligible contact.

Time is recorded as operator-active intervals, not wall-clock job duration.
Intervals may not overlap, run backwards, fall outside the frozen observation
window, or reference a target outside the cohort. Unattended runner/provider
wait time is reported separately by a future authorized trial and is not
operator time. Acceptance retains exact elapsed milliseconds through the cap
comparison and rounds only the displayed minute values.

## Report and limitations

The report must show both arms, absolute values, paired deltas, 95% intervals,
all denominators, unusable reasons, unknown/ambiguous counts, no-result/partial/
uncertain counts, actual and at-risk costs, and sample-size limitations. It must
not claim quality from a synthetic fixture, an application score, a provider
success label, or seven Export-ready transitions.

The machine report splits supported/stale/unsupported/unknown evidence;
correct/incorrect/ambiguous/unknown organization, identity, and role labels;
current/not-current/unknown affiliation; and every contact eligibility class.
It includes counts for every declared stratum and identifies below-minimum,
single-item, unknown-label, and not-individually-powered sample limitations.

## Dependencies for real evidence

The synthetic harness can run without those dependencies. A real evaluation
requires all of the following and cannot substitute local fixtures for them:

1. completed generic onboarding and a confirmed, owner-approved Customer
   Profile;
2. the supported no-known-person discovery workflow;
3. accepted Phase 4 qualification/provenance and Phase 5 contact-verification
   authority;
4. an owner-approved representative cohort, manual comparison, quality labels,
   time/cost thresholds, privacy handling, and sample size;
5. a separately selected and authorized provider/account with documented
   semantics, freshness mapping, reuse constraints, quote, credentials, and
   bounded spend; and
6. a separately authorized trial and later Phase 7 operating evaluation.

No provider purchase, real contact lookup, credential entry, export, schedule,
prospecting run, or outbound communication is authorized by this document.
