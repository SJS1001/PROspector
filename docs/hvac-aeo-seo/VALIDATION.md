# Validation ledger

## Purpose

This ledger prevents the HVAC resource from turning a plausible tactic into an
unsupported promise. It validates the **reasoning and artifact structure**; it
does not validate any contractor's future implementation, profile, ranking,
lead volume, legal compliance, or revenue.

**Evidence snapshot:** 2026-08-27

## Validation method

1. Prefer the authority that owns the rule or fact: platform documentation,
   regulator, government program, official standard, or equipment authority.
2. Preserve jurisdiction, scope, publication/update date, and guarantee limits.
3. Separate:
   - mandatory policy or regulation;
   - official recommendation;
   - semantic eligibility or interoperability;
   - empirical observation;
   - inference for contractor implementation;
   - experiment.
4. Require contractor-specific evidence before publishing operating facts.
5. Define a field test for recommendations whose value depends on local demand,
   competition, capacity, or implementation quality.
6. Recheck volatile sources on the maintenance schedule below.

## Core claim matrix

| ID | Claim or recommendation | Class | Primary evidence | Confidence | What would invalidate or limit it? | Contractor-specific validation |
|---|---|---|---|---|---|---|
| V-01 | Local results are primarily based on relevance, distance, and prominence. | Platform explanation | [Google local ranking](https://support.google.com/business/answer/7091?hl=en) | High for Google | Google changes its published framework; another platform is being discussed. | Compare profile visibility and qualified interactions by legitimate geography; never infer that content changed distance. |
| V-02 | A service-area HVAC business without a customer-facing storefront should hide its address and generally use one profile for its service area. | Platform policy | [Google representation rules](https://support.google.com/business/answer/3038177?hl=en), [service areas](https://support.google.com/business/answer/9157481?hl=en) | High for Google | The business is a legitimate hybrid/storefront or has separately staffed locations. | Verify each location's signage, staffing, customer access, ownership, and platform status. |
| V-03 | Fake, paid, incentivized, selectively positive, or pressured Google reviews are prohibited. | Platform policy | [Google contribution policy](https://support.google.com/contributionpolicy/answer/7400114?hl=en) | High | Policy changes or the review occurs on another platform with different rules; regulatory law may be stricter. | Audit solicitation templates, recipient selection, incentives, agency conduct, employees, and review patterns. |
| V-04 | Fake or misleading reviews/testimonials can create U.S. and Canadian regulatory exposure. | Regulation/guidance | [FTC rule Q&A](https://www.ftc.gov/business-guidance/resources/consumer-reviews-testimonials-rule-questions-answers), [Competition Bureau guidance](https://competition-bureau.canada.ca/en/deceptive-marketing-practices-digest-volume-1) | High within named jurisdictions | Different jurisdiction or fact pattern; guidance is not individualized legal advice. | Obtain jurisdiction-specific legal review for incentive, testimonial, influencer, suppression, email/SMS, or recording programs. |
| V-05 | Foundational SEO remains the baseline for Google's generative features; unnecessary `llms.txt` and AEO/GEO hacks are not priorities. | Official platform guidance | [Google generative-AI guide](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide) | High for Google | Another engine documents a distinct requirement; Google guidance changes. | Fix crawl/index/content defects first; treat other-engine tactics as bounded experiments. |
| V-06 | Indexability and snippet eligibility are prerequisites for Google's generative Search features, but do not guarantee inclusion. | Official platform guidance | [Google generative-AI guide](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide), [How Search works](https://developers.google.com/search/docs/fundamentals/how-search-works) | High for Google | Platform implementation changes. | Use URL Inspection and Search Console; report eligibility separately from appearance. |
| V-07 | City/service doorway pages and scaled low-value generated pages are unsafe strategies. | Platform policy | [Google spam policies](https://developers.google.com/search/docs/essentials/spam-policies) | High for Google policy | A page has genuinely distinct user value and a browsable architecture; policy wording changes. | Require the local-page evidence contract and manually review similarity before publishing. |
| V-08 | `HVACBusiness` is a valid Schema.org type; structured data does not guarantee a Google rich result. | Standard plus platform guidance | [Schema.org HVACBusiness](https://schema.org/HVACBusiness), [Google Local Business](https://developers.google.com/search/docs/appearance/structured-data/local-business) | High | Vocabulary or Google support changes; visible content does not match markup. | Parse JSON, compare every property with visible current facts, run Rich Results Test/URL Inspection where applicable. |
| V-09 | `Service` markup is semantic vocabulary, not a promised standalone Google service rich result. | Standard plus platform support list | [Schema.org Service](https://schema.org/Service), [Google supported gallery](https://developers.google.com/search/docs/appearance/structured-data/search-gallery) | High as of snapshot | Google adds a supported Service feature. | Do not attach a ranking/rich-result KPI to Service markup; use it for accurate machine-readable semantics. |
| V-10 | An HVAC firm's own pages are ineligible for Google's star-review feature when the firm controls the reviews about itself, including through an embedded third-party review widget. | Platform guidance | [Google review-snippet guidelines](https://developers.google.com/search/docs/appearance/structured-data/review-snippet) | High for Google | Google changes review-snippet eligibility. | Audit visible reviews, widgets, rendered schema, and Search Console manual actions/enhancement reports. |
| V-11 | FAQ content may help users, but Google stopped showing FAQ rich results on May 7, 2026 and removed the feature documentation in June 2026. | Platform changelog | [Google Search documentation updates](https://developers.google.com/search/updates) | High for Google as of snapshot | Google restores the feature or another platform has different support. | Judge FAQs on user comprehension, lead quality, and support value—not rich-result promises. |
| V-12 | U.S. refrigerant handling claims must respect EPA Section 608 scope and cannot be generalized into a universal contractor license. | Regulation/guidance | [U.S. EPA Section 608](https://www.epa.gov/section608/section-608-technician-certification) | High in U.S. scope | Different country, equipment, or activity; state/local rules add requirements. | Verify individual certification and separate federal, state, local, and business-license claims. |
| V-13 | HVAC health, efficiency, duct-cleaning, savings, and warranty claims need claim-appropriate substantiation. | Regulator/official technical guidance | [EPA filtration](https://www.epa.gov/indoor-air-quality-iaq/air-cleaners-and-air-filters-home), [EPA duct cleaning](https://www.epa.gov/indoor-air-quality-iaq/should-you-have-air-ducts-your-home-cleaned), [Competition Bureau claims](https://competition-bureau.canada.ca/en/deceptive-marketing-practices/types-deceptive-marketing-practices/false-or-misleading-representations-and-deceptive-marketing-practices) | High within scope | Exact product evidence or jurisdiction differs. | Technical reviewer checks every strong claim, qualification, cited source, and general impression before publish. |
| V-14 | Mobile content must be complete and responsive; accessibility is an operating and conversion requirement. | Platform guidance plus standard | [Google mobile-first](https://developers.google.com/search/docs/crawling-indexing/mobile/mobile-sites-mobile-first-indexing), [WCAG 2.2](https://www.w3.org/TR/wcag/) | High | None for the design objective; jurisdictional conformance duties vary. | Keyboard, screen-reader, zoom/reflow, target-size, focus, error, and mobile task tests. |
| V-15 | Search Console and Analytics answer different questions and should not be expected to match exactly. | Official platform guidance | [Google Search Console and Analytics](https://developers.google.com/search/docs/monitor-debug/google-analytics-search-console) | High | Tracking or reporting product changes. | Reconcile trends, event definitions, consent impact, and known data gaps rather than forcing equality. |
| V-16 | Business outcomes must be measured through qualified leads, confirmed bookings, and closed work. | Contractor operating inference | GA4 provides recommended lead lifecycle events; this package defines the business hierarchy. | Medium-high | The contractor has a different verified operating model. | Define transitions with owner and CRM evidence; audit a sample from click/call through job outcome. |
| V-17 | One AI response is insufficient evidence of visibility. | Empirical research | [Quantifying Uncertainty](https://arxiv.org/abs/2603.08924) | Medium | Study covers limited topics/platforms and future systems may differ. | Use repeated, versioned samples and report variance, platform conditions, and missing information. |
| V-18 | Raw growth in AI referrals can be confounded by platform growth. | Empirical research | [Disentangling AEO from Platform Growth](https://arxiv.org/abs/2606.04362) | Medium | Single-domain study with a short/noisy pre-period; authors call effect suggestive. | Use historical baseline, untreated/comparison pages where possible, annotations, and referral share—not raw multiple alone. |
| V-19 | Many conversational-SEO tricks may be ineffective or harmful; traditional source quality/ranking remains important. | Empirical research plus platform guidance | [C-SEO Bench](https://arxiv.org/abs/2506.11097), [Google AI guide](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide) | Medium-high | Bench domains/tasks differ from local HVAC; future engines change. | Keep AI-specific changes in controlled experiments and monitor traditional Search plus lead outcomes for harm. |
| V-20 | OpenAI crawler controls and referral parameters can support ChatGPT discoverability measurement. | Official platform guidance | [OpenAI publisher FAQ](https://help.openai.com/en/articles/12627856-publishers-and-developers-faq) | High for documented behavior | OpenAI changes user agents, URLs, or referral behavior; traffic loses parameters. | Inspect robots, server logs where lawful, and analytics referrals; do not infer training or ranking from crawl activity. |
| V-21 | Google's dedicated generative-AI Search Console reports expose impressions and page, country, device, and date views, but were available only to a subset of sites at the snapshot date. | Official platform announcement | [Google generative-AI performance reports](https://developers.google.com/search/blog/2026/06/gen-ai-performance-reports) | High for announced scope | Rollout, dimensions, or product behavior changes. | Use the report only when present; preserve ordinary Search Console and business-outcome measurement rather than inventing unavailable AI data. |

## Artifact validation checklist

Checked items describe this documentation snapshot and its examples only. They
do not represent a live contractor implementation. Exact commands, exceptions,
digests, and the independent review are recorded in
[`VALIDATION-RESULTS.md`](VALIDATION-RESULTS.md).

### Content integrity

- [x] Every mandatory or platform-specific statement resolves to the owning
      source directly or through the evidence crosswalk.
- [x] Every empirical result names its method limit.
- [x] Every inference is written as an implementation recommendation, not a
      search-engine fact.
- [x] No ranking, citation, lead, or revenue guarantee appears.
- [x] No legal guidance is presented as jurisdiction-neutral legal advice.
- [x] No unsafe repair instruction appears.
- [x] No private address, credential, policy document, customer data, or hosted
      evidence appears.

### Structured-data examples

- [x] Each `.jsonld` file parses as JSON.
- [x] Placeholder values are visibly non-production.
- [x] The hybrid example uses a fictional customer-facing public address.
- [x] The service-area example does not expose a hidden street address.
- [x] The Service example is described as semantic markup, not a guaranteed
      Google rich-result feature.
- [x] No self-serving `aggregateRating` appears.

### Link integrity

- [x] Every local relative link and referenced target resolves.
- [x] Every external URL receives an HTTP response or is documented as a
      bot-protected/manual-check source.
- [x] Automated redirect destinations are reviewed for unexpected domain
      changes; exceptions are named in the validation receipt.
- [ ] Regulatory/platform links are rechecked quarterly.

### UX contract integrity

- [x] Emergency guidance is distinct from lead capture and blocks on live local
      authority review.
- [x] Request received is distinct from appointment confirmed.
- [x] Service-area-only pages do not imply a storefront.
- [x] The contract requires keyboard, focus, zoom, mobile, error, recovery,
      privacy, and emergency-route tests.
- [x] Trust badges must be traceable to issuer, scope, and current evidence.

### Live implementation checks

- [ ] Primary tasks pass keyboard, focus, zoom, mobile, error, and recovery tests.
- [ ] Emergency routes, data flows, forms, tracking, consent, access controls,
      retention/deletion, and incident handling pass in the served jurisdiction.
- [ ] Contractor facts, profiles, credentials, calls, bookings, and outcomes are
      validated against authorized live systems.

## Field validation design

Before a contractor calls the playbook successful, collect:

1. baseline and post-change windows with seasonal/context annotations;
2. exact changed pages and dates;
3. Business Profile, Search Console, Analytics, phone/form, booking, CRM/job, and
   capacity evidence available under the contractor's authority;
4. qualified and disqualified lead reasons;
5. confirmed booking and sold-job evidence;
6. page-specific harms such as spam, wrong-area demand, missed calls, slow pages,
   accessibility failures, or capacity overload;
7. repeated AI samples with the platform and retrieval conditions recorded;
8. an owner decision to keep, revise, roll back, or continue testing.

## Maintenance schedule

| Evidence | Recheck |
|---|---|
| Google Business Profile and review policies | Quarterly and before profile restructuring |
| Google Search, AI feature, spam, and structured-data guidance | Quarterly and before a major release |
| OpenAI crawler guidance | Quarterly |
| FTC and Competition Bureau review/advertising guidance | Quarterly; obtain counsel for a live program |
| HVAC licenses, insurance, certifications, warranties | At expiry/change and at least quarterly |
| Rebates, credits, utility and permit claims | Immediately before publication and campaign reuse |
| Equipment performance and matched-system claims | Per model combination and before quote/content reuse |
| Safety and indoor-air guidance | Before publishing or materially revising affected content |
| Accessibility and Core Web Vitals standards | At implementation and major redesign |
| Empirical AI-search research | Semiannually; retain method limits |

## Known residual risks

- Search and AI systems change without synchronizing every public document.
- Google and OpenAI guidance does not describe every ranking or citation signal.
- HVAC licensing, advertising, rebates, recording, consent, telemarketing, and
  privacy are jurisdiction-specific.
- A technically correct page can still convert poorly or attract unserviceable
  demand.
- Call-tracking and CRM data can be incomplete, duplicated, or privacy-limited.
- AI visibility studies may not generalize from benchmark prompts or consumer
  products to local HVAC recommendations.
- The current package has no contractor-specific field data; implementation and
  outcome claims therefore remain unproven.
