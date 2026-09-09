# Contributing to HVAC Search and Answer Visibility

This collection accepts useful, verifiable additions for HVAC and adjacent
home-improvement contractors. It is not a lead-generation marketplace, an
affiliate catalog, or a place to promote an SEO product through an untested
claim.

## Before proposing a change

Read:

1. [`README.md`](README.md) for scope and evidence labels;
2. [`PRIMARY-SOURCE-RESEARCH.md`](PRIMARY-SOURCE-RESEARCH.md) for the current
   evidence base;
3. [`VALIDATION.md`](VALIDATION.md) for claim tests and maintenance rules;
4. the artifact you intend to change.

Check whether a first-party authority already answers the question. Prefer the
platform that owns a feature, the regulator that enforces a rule, the standards
body that owns a specification, or the official program owner over an agency
article summarizing it.

## What a useful contribution contains

Every substantive recommendation must provide:

- the exact claim being made;
- an evidence label from the main README;
- a direct source URL, with jurisdiction and scope where relevant;
- the date the source was checked;
- what the source does **not** prove;
- a contractor-specific validation or acceptance test;
- safety, privacy, accessibility, and review-policy implications;
- a removal or recheck condition for volatile guidance.

Implementation examples must use fictional `.invalid` domains, placeholder
phone numbers and addresses, and no private customer, employee, credential, or
hosted-system data.

## Evidence bar

### Platform and policy claims

Use current first-party documentation. A structured-data vocabulary entry can
prove that a type exists; it cannot prove Google displays or ranks it. A vendor
case study can suggest a test; it cannot establish a platform rule.

### Legal, license, rebate, and safety claims

Name the jurisdiction, activity, responsible authority, and effective or
checked date. Do not turn a federal technician credential into a universal
business license, imply that a badge is government approval, or publish a
rebate as guaranteed eligibility. Mark legal material as general information,
not individualized advice.

### Performance claims

State the baseline, intervention, unit of analysis, time window, comparison,
sample size, confounders, and business outcome. Rankings, impressions, crawler
visits, or a chatbot mention alone are not contractor ROI.

### AI and AEO claims

An AI-specific tactic belongs in the baseline only when an owning platform or
replicated evidence supports it. Otherwise label it experimental and define a
bounded test with success, harm, and rollback thresholds. Repeated prompts are
required for conversational visibility observations because a single response
is not stable evidence.

## Automatic rejection conditions

A proposed addition is rejected when it contains any of the following:

- paid placement, an affiliate link, undisclosed commercial interest, or a
  vendor entry without decision-useful methodology;
- guaranteed rankings, citations, leads, savings, response times, rebates,
  health outcomes, or equipment performance;
- fake, gated, pressured, selectively positive, or undisclosed incentivized
  reviews;
- doorway-location templates or scaled low-value generated pages;
- self-serving rating markup or FAQ markup presented as a current Google rich
  result tactic;
- invented licenses, certifications, service areas, staffing, hours, prices,
  case studies, or customer proof;
- unsafe DIY instructions involving regulated or hazardous work;
- a copied statistic with no traceable primary source and method context;
- secret values, private hosted data, customer information, or a residential
  address that the business must keep hidden.

## Change checklist

- [ ] The addition solves a real contractor or homeowner decision problem.
- [ ] Claims are labeled and linked to the strongest available source.
- [ ] Jurisdiction and guarantee limits are explicit.
- [ ] The primary source was checked on the stated date.
- [ ] The implementation test and failure/rollback condition are defined.
- [ ] Links and JSON examples pass the package validation checks.
- [ ] The change does not conflict with the review, spam, safety, or privacy
      controls.
- [ ] Volatile platform or program guidance has a recheck trigger.

## Review standard

Reviewers should challenge the strongest claim first, follow every cited source
to confirm it supports the nearby wording, and distinguish syntax validation
from field validation. Clean prose and a passing validator do not prove a live
profile, ranking, legal status, lead, booking, or sale.

When evidence is mixed, preserve the disagreement and reduce the claim. When a
source has changed, remove or rewrite the stale tactic rather than keeping it
for completeness.
