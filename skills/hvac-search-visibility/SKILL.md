---
name: hvac-search-visibility
description: Research, design, audit, or improve local SEO, answer-engine visibility, contractor website UX, Business Profile governance, structured data, reviews, and measurement for residential HVAC contractors. Use for HVAC search strategy and implementation packages; do not use as a substitute for trade, legal, safety, or live-platform authority.
---

# HVAC Search Visibility

Build evidence-grounded search and conversion systems for HVAC contractors.
Prioritize truthful local-business representation, homeowner safety, qualified
leads, and booked work over rankings, chatbot anecdotes, or AEO folklore.

## Essential boundaries

- Treat the contractor's facts, platform access, credentials, customer data,
  profiles, and production systems as unverified until authorized evidence
  exists.
- Never fabricate or infer locations, staffing, licenses, insurance,
  certifications, availability, response time, prices, rebates, savings,
  warranties, reviews, case studies, or results.
- Do not create doorway-location pages, fake profiles, review gating,
  self-serving rating schema, bot-only promotional content, or unsafe repair
  guidance.
- Do not equate valid schema, indexability, impressions, citations, crawler
  visits, or passing local tests with rankings, leads, legal compliance, or
  revenue.
- Keep emergency information independent of lead capture and sales routing.
- Require separate trade- and jurisdiction-specific overlays before adapting
  the workflow to plumbing, electrical, roofing, insulation, windows, or other
  home-improvement trades.

Read [references/evidence-and-safety.md](references/evidence-and-safety.md)
before producing substantive guidance. It defines the evidence classes,
source hierarchy, safety boundary, and operating gates.

## Choose the task mode

### Audit an existing contractor presence

Use when reviewing a website, resource collection, Business Profile plan,
content program, schema, reviews, analytics, or UX.

1. Establish the exact artifact and whether live-platform or customer evidence
   is authorized.
2. Inventory claims and classify them using the evidence model.
3. Compare the artifact with current owning-platform, regulator, standards, and
   HVAC-authority sources. Browse current primary sources because platform,
   legal, rebate, and feature details are volatile.
4. Separate factual defects, policy violations, safety/privacy risks,
   implementation gaps, hypotheses, and outcome-evidence gaps.
5. Report what documentation proves and what still requires live field evidence.

Read [references/validation-and-challenge.md](references/validation-and-challenge.md)
before calling an audit complete.

### Create or overhaul a contractor program

Use when producing an HVAC-focused resource, playbook, content architecture,
UX contract, implementation backlog, or 30/60/90 program.

Read [references/deliverables.md](references/deliverables.md), then build only
the deliverables the user needs. Preserve these dependency gates:

1. contractor truth and authority;
2. data governance and measurement definitions;
3. bounded Business Profile change control;
4. website, conversion, privacy, accessibility, and emergency UX;
5. service/local content with claim and safety review;
6. neutral review and off-page operations;
7. AI visibility experiments after the ordinary local-search foundation.

Do not describe a design contract as coded UI or an implementation plan as a
deployed system.

### Work on schema, reviews, or AI visibility

Read [references/schema-reviews-ai.md](references/schema-reviews-ai.md) when the
request materially involves JSON-LD, review solicitation, crawler controls,
ChatGPT/Google AI visibility, FAQ/AEO claims, or AI measurement.

Use templates from `assets/` as fictional starting points. Replace placeholder
facts only with user-authorized, current, visible evidence. Never copy an asset
into production unchanged.

## Evidence workflow

For every important recommendation, record both:

- the source family: regulator/law, platform, standard, official HVAC/safety,
  empirical research, or experiment;
- the operating disposition: requirement, official recommendation, eligibility
  condition, hypothesis, or experiment.

Keep the nearby source, jurisdiction/product scope, checked date, limitation,
contractor-specific test, and recheck trigger. If evidence is mixed, reduce the
claim instead of hiding the disagreement.

Use current primary sources. Practitioner posts and vendor tools may suggest a
bounded experiment but cannot establish a platform rule, legal requirement,
safety instruction, or causal outcome.

## Validation and handoff

Before completion:

1. Run local structural checks, including
   `node scripts/validate-package.mjs <output-directory>` when the output is a
   Markdown/JSON package.
2. Verify current external sources and record bot/transport exceptions instead
   of silently treating them as success.
3. Distinguish package validation from live implementation and field outcomes.
4. Challenge the strongest safety, privacy, profile-change, evidence-integrity,
   and completion claims independently when the user requests adversarial
   validation or when claiming the package itself is validated.
5. Preserve findings and triage every one as valid, invalid,
   needs-investigation, or severity-adjusted. Ground-truth all high-severity
   findings before acting.
6. Leave live checks explicitly open until the exact authorized evidence exists.

Lead the final handoff with what was produced, what passed, what remains open,
and whether the result is documentation, coded UI, or a deployed system.
