# Primary-source research: AEO/SEO for HVAC and home-improvement contractors

**Research status:** evidence baseline, not an implementation or completion claim

**Reviewed:** 2026-08-27

**Source standard:** official platform documentation, legislation/regulator guidance, standards bodies, government energy/safety programs, and certification-program owners. Secondary SEO commentary was excluded.
**Geographic scope:** Google documentation is generally global but individual products and features vary by market. Legal examples cover the United States and Canada, with Ontario examples where a concrete provincial rule is useful. State, provincial, territorial, municipal, trade, utility, privacy, telemarketing, accessibility, and call-recording rules still require local review.

This document is the evidence base for adapting an “awesome AEO/SEO” resource to HVAC and adjacent home-improvement contractors. It separates what an official source actually establishes from what should be tested. It is not legal, licensing, tax, engineering, health, or safety advice.

## Evidence labels

Every prescriptive statement should resolve to one of these labels when it is converted into a playbook, prompt, checklist, or UI control, either inline or through the package's explicit evidence crosswalk:

| Label | Meaning | Required treatment |
|---|---|---|
| **[REQ] Proven requirement** | An explicit platform rule, law/regulator rule, or certification requirement within its stated scope. | Cite the controlling source, name the jurisdiction/product, and block publication or activation when material evidence is missing. |
| **[REC] Official recommendation** | Advice stated by the responsible platform, standards body, or regulator, but not an eligibility guarantee. | Adopt by default; document a reason when departing from it. |
| **[ELIG] Eligible, not guaranteed** | A condition that can make content eligible for a search feature or treatment. | Never promise appearance, ranking, traffic, a badge, or a lead outcome. |
| **[HYP] Empirical hypothesis** | A plausible contractor-market tactic not established by the official sources as a ranking cause. | Define a baseline, success metric, confounders, and review date before testing. |
| **[EXP] Experimental tactic** | Emerging behavior or integration with unstable evidence or support. | Isolate, limit effort and risk, and do not make it a dependency of the core program. |

An official source can establish a fact without making it a requirement. For example, Google says local results are mainly based on relevance, distance, and prominence; that does **not** prove a fixed weighting or authorize a promise that any action will improve rank.

## Executive conclusions

1. **The durable core is ordinary local SEO and trustworthy contractor information.** Google’s current generative-AI guidance says established SEO fundamentals still apply and describes AEO/GEO optimization as SEO, not a separate technical channel. There is no special Google AI schema, no required content “chunking,” and Google Search does not use `llms.txt`. Pages must first be indexed and eligible to show a snippet to be eligible for Google’s generative AI Search experiences; actual inclusion is never guaranteed. **[REC][ELIG]** ([Google AI features and your website](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide), last updated 2026-07-10)
2. **A service-area contractor must not manufacture storefronts or city pages.** Google requires one profile for a service-area business at its central location, requires the address to be hidden when customers are not served there, disallows most virtual offices, and expects the service area to remain accurate and generally within about two hours’ driving time. Doorway pages, city/region blocks, and scaled low-value pages can violate Search spam policies. **[REQ]** ([Business Profile representation guidelines](https://support.google.com/business/answer/3038177?hl=en); [service areas](https://support.google.com/business/answer/9157481?hl=en); [Google Search spam policies](https://developers.google.com/search/docs/essentials/spam-policies))
3. **Structured data describes reality; it does not create it.** `HVACBusiness` and `Service` are valid Schema.org vocabulary, but Google’s supported search features and policies are narrower. Correct markup creates eligibility only, never a rich-result guarantee. Google’s LocalBusiness documentation requires a physical address for its LocalBusiness rich-result implementation, while a service-area business may be required to hide a residential address in Business Profile. A contractor must not expose a private address merely to pursue markup eligibility. **[REQ][ELIG]** ([Google structured-data policies](https://developers.google.com/search/docs/appearance/structured-data/sd-policies); [Google LocalBusiness](https://developers.google.com/search/docs/appearance/structured-data/local-business); [Schema.org HVACBusiness](https://schema.org/HVACBusiness))
4. **Review integrity is a hard boundary.** Google prohibits paid or incentivized reviews, review gating, pressure, competitor attacks, conflicts of interest, and incentives to remove negative reviews. U.S. FTC and Canadian Competition Act rules independently prohibit material forms of fake, misleading, undisclosed, or unsubstantiated promotion. **[REQ]** ([Google Maps user-contributed content policy](https://support.google.com/contributionpolicy/answer/7400114?hl=en); [FTC final review rule announcement](https://www.ftc.gov/news-events/news/press-releases/2024/08/federal-trade-commission-announces-final-rule-banning-fake-reviews-testimonials), 2024-08-14; [Competition Act, section 74.01](https://laws-lois.justice.gc.ca/eng/acts/C-34/section-74.01.html), current page consulted 2026-08-27)
5. **HVAC trust requires verifiable scope, not badge accumulation.** Licences, refrigerant credentials, insurance, lead-safe certification, manufacturer status, AHRI matches, ENERGY STAR claims, and rebate eligibility answer different questions. The resource should record issuing body, credential identifier or public registry link where lawful, covered trade/entity, territory, and expiry/recheck date. **[REQ][REC]**
6. **Measure qualified commercial outcomes, not “AI visibility” alone.** Search Console, Business Profile Performance, GA4 recommended lead events, ad call conversions, and an authorized CRM can form a measurement chain. Rank tests, citations, impressions, and AI appearances are diagnostic observations, not revenue or proof of causation. **[REC][HYP]**

## 1. Google Business Profile and local discovery

### What Google establishes

- **[REQ] Represent the business as it exists in the real world.** Use the real-world business name, choose the fewest categories needed to describe the core business, and normally maintain one profile per business. Adding service, city, phone, or marketing keywords to the name is not authorized unless they are part of the consistently used real-world name. ([Business Profile representation guidelines](https://support.google.com/business/answer/3038177?hl=en); [category guidance](https://support.google.com/business/answer/7249669?hl=en))
- **[REQ] Configure the operating model accurately.** A service-area business visits customers and does not serve them at its address; a hybrid business both receives customers at a staffed location and visits them. A service-area business must hide its address. ([Google service-area guidance](https://support.google.com/business/answer/9157481?hl=en))
- **[REQ] Do not use a virtual office as a location unless it is staffed by the contractor’s team during stated hours and customers can be received there.** A co-working location is not eligible merely because mail can be received there. ([Business Profile representation guidelines](https://support.google.com/business/answer/3038177?hl=en))
- **[REQ] Keep service areas concrete and plausible.** Google supports up to 20 named cities, postal codes, or other areas rather than a radius, and advises that the overall area normally should not exceed about two hours’ driving time from the base. If substantially larger, consider whether there are genuinely separate staffed locations rather than inventing listings. ([Google service-area guidance](https://support.google.com/business/answer/9157481?hl=en))
- **[REC] Complete and verify the profile; keep hours, contact details, categories, services, photos, and responses current.** Google says complete and accurate information helps it match a profile to relevant searches. ([How to improve local ranking](https://support.google.com/business/answer/7091?hl=en))
- **[REC] Treat reviews and owner responses as customer operations, not a keyword insertion surface.** Google says reviews and links are among the inputs that can inform prominence. It does not disclose a formula and says there is no way to request or pay for better local ranking. ([How to improve local ranking](https://support.google.com/business/answer/7091?hl=en))
- **[REC] Use the most specific primary category that describes the main business and only additional categories that describe other actual core services.** Categories can affect local ranking; they are not public keyword tags. ([Business Profile categories](https://support.google.com/business/answer/7249669?hl=en))
- **[REC] List only real services and accurate descriptions/prices.** Google may highlight a listed service when it matches a local query. This is a display possibility, not a ranking or lead guarantee. ([Manage services](https://support.google.com/business/answer/9455399?hl=en))

Google describes local results as mainly based on **relevance, distance, and prominence**. Distance is inherently user-dependent. Prominence includes information Google has about a business across the web, including links and reviews. Treat this model as orientation, not a scoring recipe. ([How to improve local ranking](https://support.google.com/business/answer/7091?hl=en))

### HVAC adaptation

| Resource component | Evidence class | Validation before use |
|---|---|---|
| Profile identity worksheet: legal/trading name, real public location or SAB, phone, URL, hours, emergency-hours truth, primary category, secondary categories | **[REQ][REC]** | Owner attestation plus live-profile comparison; no credentials or locations inferred from website copy. |
| Service-area worksheet capped at 20 supported areas | **[REQ]** | Dispatch/coverage confirmation and travel-time reality; do not populate every nearby municipality automatically. |
| Service catalogue aligned to performed work | **[REC]** | Operations owner confirms each service, availability, prerequisites, and any jurisdictional restriction. |
| Weekly photo/post/review cadence | **[HYP]** | Test for customer usefulness and profile actions; do not describe cadence itself as a local ranking factor. |
| “Near me” keyword additions to the profile name | **Reject: [REQ] conflict** | Unless the words are genuinely in the real-world business name, block them. |

Business Profile information can also be compiled from the owner, public web sources, third parties, users, and Google interactions. Identity consistency and monitoring therefore matter, but no source supports a claim that exact text repetition across every citation is a standalone ranking formula. ([How Google sources Business Profile information](https://support.google.com/business/answer/2721884?hl=en))

## 2. Google Search, generative AI, and contractor content

### Eligibility and content quality

- **[REQ] Meet Search’s technical baseline and spam policies.** Google states that satisfying Search Essentials does not guarantee crawling, indexing, or serving. ([Google Search Essentials](https://developers.google.com/search/docs/essentials), last updated 2025-12-10)
- **[ELIG] For Google generative AI Search features, a page must be indexed and eligible to appear with a snippet.** Eligibility does not guarantee selection, citation, or traffic. ([Google AI features and your website](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide), last updated 2026-07-10)
- **[REC] Publish original, people-first material that demonstrates real experience and makes authorship, method, and purpose clear.** Google recommends original reporting/research/analysis, substantial value, sources, author expertise, and first-hand experience. It says E-E-A-T is not one single ranking factor; trust is the most important aspect of the concept, with stronger scrutiny for content affecting safety or financial stability. ([Creating helpful, reliable, people-first content](https://developers.google.com/search/docs/fundamentals/creating-helpful-content), last updated 2025-12-10)
- **[REC] Disclose meaningful automation when a reader would reasonably ask how content was produced.** AI can help with research and structure, but mass-generating pages without added value can violate scaled-content-abuse rules. ([Google guidance on generative AI content](https://developers.google.com/search/docs/fundamentals/using-gen-ai-content); [helpful-content guidance](https://developers.google.com/search/docs/fundamentals/creating-helpful-content))
- **[REQ] Do not create doorway or scaled-content systems.** Google identifies multiple city/region pages that funnel users to one destination, substantially similar search-result-like pages, large volumes of low-value content, and blocks of cities/phone numbers as possible doorway, scaled-content, or keyword-stuffing abuse. The production method—human, automated, or mixed—does not excuse manipulation. ([Google Search spam policies](https://developers.google.com/search/docs/essentials/spam-policies))

### What the official AI guidance rules out

The HVAC resource should state these points plainly:

- **[REC] Do not build a Google strategy around `llms.txt`.** Google says Search does not use it. ([Google AI features and your website](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide); documentation clarification logged 2026-06-15 in [Google Search documentation updates](https://developers.google.com/search/updates))
- **[REC] Do not claim that Google requires special AEO schema, content chunking, question-answer formatting, or a rewrite for AI.** Google says no special optimization is required beyond normal SEO and people-first content. Structured data should match visible content. ([Google AI features and your website](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide))
- **[REC] Do not manufacture mentions, citations, or reviews for AI systems.** Google explicitly warns against inauthentic mentions, and its link/review policies independently prohibit manipulation. ([Google AI features and your website](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide); [spam policies](https://developers.google.com/search/docs/essentials/spam-policies))
- **[EXP] Browser/agent friendliness and emerging agentic protocols may be explored only after crawlability, accurate service data, accessible forms, and measurement are sound.** Google describes agentic behavior as emerging rather than a prerequisite. ([Google AI features and your website](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide))

Google’s search documentation changed materially in 2026: the AI-feature guide was added 2026-05-15, generative-AI reporting began rolling out to a subset of Search Console properties in June, and FAQ rich-result documentation was removed after that result type stopped appearing. A contractor kit must recheck live support rather than preserving stale prompt claims. ([Google Search documentation updates](https://developers.google.com/search/updates); [generative AI performance reporting announcement](https://developers.google.com/search/blog/2026/06/gen-ai-performance-reports))

### Recommended HVAC information architecture

These are contractor hypotheses and editorial controls, not claims of rank causation:

| Content object | Classification | Required evidence and safety controls |
|---|---|---|
| Core service page for a service actually sold | **[HYP]** | Scope, exclusions, customer decision criteria, author/reviewer, last reviewed date, real photos where consent permits. |
| Emergency-service page | **[HYP]** | Actual staffed availability, covered geography, response-time wording approved by operations, call route tested. Never claim 24/7 or a guaranteed arrival time without operational proof. |
| City/service-area page | **[HYP]** with spam risk | Publish only where the contractor has meaningful area-specific proof and useful differences: service constraints, permits, climate/equipment context, representative work with consent, or local program links. Block templated swaps of place names. |
| Equipment/system guide | **[HYP]** | Named model/category, climate and home assumptions, independent certification links, sizing/install caveats, and date. Avoid universal savings or comfort guarantees. |
| Pricing/cost guide | **[HYP]** | Date, market, included/excluded work, ranges and assumptions, tax/permit/financing caveats. No bait price. |
| Rebate/credit page | **[HYP]** | Link to current government/utility program, eligibility owner, date checked, expiry/recheck, and “customer must confirm” language. Do not infer approval. |
| Case study | **[HYP]** | Customer consent, non-sensitive location granularity, baseline, work performed, equipment match, measured versus estimated outcomes, and no unsupported typicality claim. |
| Diagnostic or DIY article | **[HYP]** | Qualified technical review and explicit stop points for electricity, combustion, refrigerants, structural work, confined spaces, lead/asbestos/mould, and any regulated activity. Do not turn a marketing article into unsafe trade instruction. |
| Question-and-answer block | **[HYP]** | Use only where it helps customers. FAQ structured-data visibility is not a current strategy; Google stopped showing the FAQ rich-result type in 2026. ([Search documentation updates](https://developers.google.com/search/updates)) |

## 3. Structured data: useful description, narrow search promises

### Supported conclusions

- **[ELIG] Google recommends JSON-LD and requires structured data to represent visible, accurate, relevant, current page content.** Correct markup creates eligibility only; algorithms can choose not to show a rich result. Google’s documentation, rather than the full Schema.org vocabulary, defines what Google Search supports. ([Introduction to structured data](https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data); [structured-data policies](https://developers.google.com/search/docs/appearance/structured-data/sd-policies), last updated 2026-07-10)
- **[ELIG] `HVACBusiness` is a valid Schema.org subtype of `HomeAndConstructionBusiness` and `LocalBusiness`; `Service` is a generic service type.** Properties such as `areaServed`, `hasCredential`, and `hasCertification` can describe facts when accurate. Their presence does not imply a Google rich-result feature. ([Schema.org HVACBusiness](https://schema.org/HVACBusiness); [Schema.org Service](https://schema.org/Service); [Schema.org areaServed](https://schema.org/areaServed))
- **[REQ for Google’s documented LocalBusiness feature] Google lists `name` and a physical `address` as required properties.** It recommends the most specific business type. This creates a real tension for a home-based SAB whose address must be hidden in Business Profile. Do not publish a private or customer-ineligible address to satisfy markup. ([Google LocalBusiness structured data](https://developers.google.com/search/docs/appearance/structured-data/local-business); [Business Profile service-area rules](https://support.google.com/business/answer/9157481?hl=en))
- **[REQ] Review markup must follow review-content policies.** Reviews must be visible, genuine, and not aggregated from other websites. Google does not show self-serving review stars for `LocalBusiness` or `Organization` pages, including when a business embeds a third-party review widget on its own site. ([Google review-snippet documentation](https://developers.google.com/search/docs/appearance/structured-data/review-snippet))

### Safe implementation model

1. **[REQ]** Generate markup from a controlled facts record, not from free-form prompts.
2. **[REQ]** Validate that every asserted name, address, telephone, opening hour, service, credential, area, rating, price, and URL is visible and current where the applicable policy requires it.
3. **[REC]** Use the most specific truthful type, commonly `HVACBusiness`; use `Service` objects only to describe actual service offerings and relationships.
4. **[REC]** Test syntax with Google’s Rich Results Test where a Google feature is supported, validate general vocabulary separately, and monitor Search Console enhancement reports. A successful validator is not proof of display.
5. **[REQ]** For an address-hidden SAB, default to privacy and Business Profile compliance. Have a knowledgeable reviewer decide whether limited accurate organization/service vocabulary is useful; do not claim LocalBusiness rich-result eligibility without satisfying Google’s documented requirements.
6. **[REQ]** Do not add FAQ markup as an “AEO hack,” fabricate `aggregateRating`, copy ratings from Google, or mark up testimonials to obtain self-serving stars.

## 4. Reviews, testimonials, endorsements, and reputation

### Platform controls

Google requires reviews to reflect genuine, unbiased experiences. It prohibits paying for reviews, products/services/discounts in exchange for reviews, incentives conditioned on revision or removal of negative reviews, solicitation of only positive reviews, discouraging negative reviews, pressuring reviewers, dictating review content, competitor attacks, and reviews shaped by conflicts of interest. Honest requests that do not influence content or rating are permitted. **[REQ for Google Maps/Business Profile]** ([Google Maps user-contributed content policy](https://support.google.com/contributionpolicy/answer/7400114?hl=en); [Google incentivized review guidance](https://support.google.com/contributionpolicy/answer/16597558?hl=en))

Accordingly, the HVAC resource should include a neutral all-customer request template and should reject:

- “Leave five stars for a gift card.”
- Sending satisfied customers to Google while routing dissatisfied customers only to a private form.
- Staff, family, agency, vendor, or competitor reviews that hide the relationship.
- AI-generated customer personas or testimonials.
- A discount offered only after a negative review is removed or changed.

### United States

- **[REQ, U.S. federal scope]** The FTC’s Consumer Reviews and Testimonials Rule addresses fake or false reviews and testimonials, purchasing or procuring reviews when the business knew or should have known they were false, compensation conditioned on positive or negative sentiment, undisclosed insider relationships, controlled review sites, review suppression, and fake social influence indicators. The final rule was announced and published 2024-08-14. ([FTC final rule announcement](https://www.ftc.gov/news-events/news/press-releases/2024/08/federal-trade-commission-announces-final-rule-banning-fake-reviews-testimonials); [16 CFR Part 465 final-rule record](https://www.ftc.gov/legal-library/browse/federal-register-notices/16-cfr-part-465-trade-regulation-rule-use-consumer-reviews-testimonials-final-rule))
- **[REQ, U.S. advertising scope]** Endorsements must be truthful, substantiated, and accompanied by clear and conspicuous disclosure of material connections. A dramatic customer result cannot silently stand in for a typical result. ([FTC Endorsement Guides FAQ](https://www.ftc.gov/business-guidance/resources/ftcs-endorsement-guides-what-people-are-asking), revised 2023; [FTC advertising FAQ for small business](https://www.ftc.gov/business-guidance/resources/advertising-faqs-guide-small-business))

### Canada

- **[REQ, Canadian federal scope]** Competition Act section 74.01 prohibits materially false or misleading representations and requires adequate and proper testing for performance, efficacy, and life claims. It also addresses environmental benefit claims, misleading warranty/repair availability, and drip pricing. Both literal wording and general impression matter. ([Competition Act, section 74.01](https://laws-lois.justice.gc.ca/eng/acts/C-34/section-74.01.html); [Competition Bureau false-or-misleading representations guidance](https://competition-bureau.canada.ca/en/deceptive-marketing-practices/types-deceptive-marketing-practices/false-or-misleading-representations))
- **[REQ, Canadian federal scope]** A testimonial must have the endorser’s written permission and remain consistent with what they approved; it must not be quoted out of context. ([Competition Bureau guidance on tests and testimonials](https://competition-bureau.canada.ca/en/deceptive-marketing-practices/types-deceptive-marketing-practices/use-tests-or-testimonials))
- **[REQ, Canadian federal scope]** A material relationship with an influencer or endorser must be disclosed prominently and in context; the endorser must have actually used the product or service and cannot make unsupported broad performance claims. ([Competition Bureau influencer-marketing guidance](https://competition-bureau.canada.ca/en/deceptive-marketing-practices/types-deceptive-marketing-practices/influencer-marketing-and-competition-act), modified 2022-01-19)
- **[REQ, Canadian federal scope]** Environmental claims require substantiation, and the Competition Bureau’s guidance is evolving with statutory amendments. Claims such as “green,” “zero emissions,” or “carbon neutral” require current legal review and appropriately scoped evidence. ([Competition Bureau environmental-claims guidance](https://competition-bureau.canada.ca/en/how-we-foster-competition/education-and-outreach/environmental-claims-and-greenwashing))

State/provincial consumer law, privacy, platform contracts, professional rules, and class-action exposure can add obligations. The resource should route legal claims through an identified reviewer rather than convert this section into universal legal advice.

## 5. Local Services Ads and screening

- **[REQ for participation]** Google’s Local Services Ads screening and verification vary by business type, category, and country and may include business, owner, service-professional, licence, insurance, and background checks. HVAC can receive additional screening in supported U.S. markets because it is treated as an urgent category. ([Local Services provider qualification](https://support.google.com/localservices/answer/6230381?hl=en); [screening process](https://support.google.com/localservices/answer/6226575/); [U.S. screening requirements](https://support.google.com/localservices/answer/12174778?hl=en))
- **[REQ for participation]** Advertisers remain responsible for applicable licensing, insurance, privacy, regulatory, and policy compliance. Uploaded documents must follow the live product process. ([Local Services platform policies](https://support.google.com/adspolicy/answer/6245891?hl=en); [uploading verification documents](https://support.google.com/localservices/answer/11455354?hl=en))
- **[ELIG]** Passing the applicable process can create eligibility for a Google verification badge or ad treatment. It is not blanket government approval, a promise of lead quality, an organic ranking factor, or a substitute for local trade compliance. ([Google Verified badge](https://support.google.com/localservices/answer/16498018?hl=en))

The resource should never hard-code a universal checklist. It should store country, region, category, legal entity, check owner, current dashboard status, source URL, and recheck date. Verification screens and documentation may contain sensitive personal or business data; do not publish or reuse them as marketing content.

## 6. Contractor trust, equipment evidence, and safety boundaries

### Credential model

Every public trust claim should be normalized as:

`claim → holder → issuing body → scope/trade → jurisdiction → identifier/public registry (if lawful) → issued/expiry dates → last independently checked → evidence owner`

“Licensed and insured” without the licensed entity, trade, territory, and current status is weak evidence. Manufacturer dealer status is a private program credential, not a public trade licence. Insurance is not a certification of workmanship. A badge must link to or name its issuer and scope; an expired or unverifiable badge must be removed.

### United States examples

- **[REQ, U.S. refrigerant scope]** Technicians who maintain, service, repair, or dispose of equipment that could release regulated refrigerants must pass an EPA-approved Section 608 test. EPA says the technician credential does not expire. Verify the credential and scope; do not imply that it is a general contractor licence. ([EPA Section 608 technician certification](https://www.epa.gov/section608/section-608-technician-certification), updated 2026-03-23; [approved certification programs](https://www.epa.gov/section608/certification-programs-section-608-technicians))
- **[REQ, applicable U.S. lead-renovation scope]** Paid work that disturbs painted surfaces in many pre-1978 homes and child-occupied facilities is governed by EPA’s Renovation, Repair and Painting program, including certified firms/renovators and required work practices. Authorized state or tribal programs can differ. ([EPA RRP guidance for contractors](https://www.epa.gov/lead/renovation-repair-and-painting-program-contractors), updated 2026-03-31; [RRP firm certification](https://www.epa.gov/lead/renovation-repair-and-painting-program-firm-certification), updated 2026-05-27)
- **[REC]** State/local contractor, mechanical, electrical, gas, permit, bond, and insurance requirements must be verified with the actual authority for the service location. EPA credentials do not replace them.

### Canada and Ontario examples

- **[REQ, Ontario scope]** Refrigeration and Air Conditioning Systems Mechanic (313A) is a compulsory trade in Ontario. Legal practice requires the applicable registered training, provisional, or qualification status, which can be checked in the public register. ([Skilled Trades Ontario 313A trade information](https://www.skilledtradesontario.ca/trade-information/refrigeration-and-air-conditioning-systems-mechanic/))
- **[REQ, Ontario fuel scope]** Fuel-related contractors generally must be registered with the Technical Standards and Safety Authority and employ people holding the appropriate certificates for the work. ([TSSA contractor registration and certification](https://www.tssa.org/contractor-registration-and-certification))
- **[REQ, Canadian federal-jurisdiction halocarbon scope]** Federal halocarbon rules require appropriately certified persons for covered systems under federal jurisdiction, while provinces and territories govern much other handling. An environmental-awareness certificate is not the same thing as a trade qualification. ([Environment and Climate Change Canada federal halocarbon information](https://www.canada.ca/en/environment-climate-change/services/air-pollution/issues/ozone-layer/measures-protect/federal-halocarbon-regulations-information.html))
- **[REQ, Ontario consumer-contract scope]** Renovation businesses must follow applicable consumer-contract, estimate, representation, permit, and cancellation rules. A contractor marketing resource should link to live provincial guidance rather than generate generic contract terms. ([Ontario guide for renovation and roofing businesses](https://www.ontario.ca/page/guide-home-renovation-and-roofing-businesses); [Ontario homeowner renovation rights](https://www.ontario.ca/page/your-rights-when-starting-home-renovations-or-repairs))

### Equipment, efficiency, and savings claims

- **[REC]** AHRI certification and the AHRI Directory can support an equipment-match/performance claim for a listed certified combination. Record the directory reference and exact matched components; do not transfer a rating from one combination to another. ([AHRI certification](https://www.ahrinet.org/certification); [AHRI Directory](https://www.ahridirectory.org/))
- **[REC]** ENERGY STAR-labeled products are subject to third-party certification against program criteria, but the label is not a guarantee of a household’s bill savings, comfort, sizing, installation quality, or rebate eligibility. Use the current criteria and exact model/system. ([How ENERGY STAR certification works](https://www.energystar.gov/about/how-energy-star-works/energy-star-certification); [air-source heat-pump criteria](https://www.energystar.gov/products/air_source_heat_pumps/key-product-criteria))
- **[REQ for truthful claim scope]** DOE’s statement that air-source heat pumps can reduce electricity use for heating by up to 75% is specifically relative to electric-resistance heating. It must not be generalized to every fuel, climate, home, tariff, or installation. ([DOE Energy Saver: heat-pump systems](https://www.energy.gov/energysaver/heat-pump-systems))
- **[REC, Canada]** Natural Resources Canada emphasizes qualified contractors, accurate sizing, distribution-system suitability, climate/region differences, and the AHRI number when assessing a heat pump. Savings and program eligibility vary. ([NRCan heat-pump guidance](https://natural-resources.canada.ca/energy-efficiency/home-energy-efficiency/canada-greener-homes-initiative/heat-pumps); [NRCan tools for HVAC professionals](https://natural-resources.canada.ca/energy-efficiency/home-energy-efficiency/canada-greener-homes-initiative/heat-pump-resources-tools-hvac-professionals))

### Claim guardrails

Block or escalate these claims unless the named evidence exists:

- “Guaranteed X% savings,” “pays for itself,” or a universal payback period without home, weather, fuel, tariff, operating, maintenance, financing, and installation assumptions.
- “Rebate eligible” without exact matched equipment, customer/property/work eligibility, current program date, and the program administrator’s decision.
- “Zero emissions,” “carbon neutral,” “non-toxic,” “safe,” “mould-free,” or health outcomes without suitable scientific/legal substantiation and scope.
- “Government certified,” “EPA approved contractor,” or similar wording when the evidence is a technician credential, product listing, private manufacturer program, or limited-scope badge.
- Diagnostic instructions that encourage unqualified handling of electrical, gas, combustion, refrigerant, structural, lead, asbestos, or other regulated hazards.

## 7. Accessibility, mobile usability, and page experience

- **[REC] Use WCAG 2.2 as the current technical accessibility target.** WCAG 2.2 is a W3C Recommendation dated 2024-12-12. It is a standard, not a statement that the same legal threshold applies in every jurisdiction. ([W3C WCAG 2.2](https://www.w3.org/TR/WCAG22/))
- **[REQ where applicable, Ontario]** Ontario’s AODA web guidance states that designated public-sector organizations and businesses/non-profits with 50 or more employees must make qualifying public web content conform to WCAG 2.0 Level AA, subject to the stated dates and exceptions. Applicability and current law must be checked. ([Ontario web-accessibility guidance](https://www.ontario.ca/page/how-make-websites-accessible))
- **[REQ where applicable, U.S.]** U.S. Department of Justice guidance says the ADA applies to web content for covered state/local governments and public accommodations, while the cited guidance does not itself prescribe a detailed Title III web standard and identifies WCAG as helpful technical guidance. Obtain jurisdiction-specific advice. ([DOJ web accessibility guidance](https://www.ada.gov/resources/web-guidance/), 2022-03-18)
- **[REC] Build mobile parity.** Google uses the mobile version of a site for indexing and ranking and strongly recommends a mobile-friendly site, with responsive design the easiest pattern. Important content, metadata, structured data, images, and alt text should be equivalent on mobile. ([Google mobile-first indexing best practices](https://developers.google.com/search/docs/crawling-indexing/mobile/mobile-sites-mobile-first-indexing))
- **[REC] Treat Core Web Vitals as user experience and one input, not a rank guarantee.** Google says Core Web Vitals are used by ranking systems but there is no single page-experience signal and strong scores do not guarantee top ranking. Current “good” field thresholds at the 75th percentile are LCP at or below 2.5 seconds, INP at or below 200 ms, and CLS at or below 0.1. ([Google page-experience guidance](https://developers.google.com/search/docs/appearance/page-experience), last updated 2025-12-10; [Web Vitals](https://web.dev/articles/vitals), last updated 2024-10-31)

For an HVAC site, **[HYP]** the highest-value usability checks are often an operable click-to-call control, correct emergency hours, keyboard- and screen-reader-usable forms, useful error messages, visible consent text, address privacy, fast real-device rendering, and a non-scripted fallback contact path. Validate these through task testing and field performance; do not present them as disclosed ranking factors.

## 8. Measurement and attribution

### Official measurement surfaces

- **[REC] Search Console:** track clicks, impressions, CTR, pages, queries, countries/devices, and branded versus non-branded demand. Google advises focusing more on trends than the average-position metric. Search Console data is Search performance, not booked work. ([Search Console performance common tasks](https://support.google.com/webmasters/answer/17010961?hl=en); [metric definitions](https://support.google.com/webmasters/answer/7042828?hl=en))
- **[REC] Business Profile Performance:** for verified profiles, track views, searches, directions, call-button clicks, website clicks, and supported messages/bookings. Some metrics can combine organic and Ads activity, so preserve the definition and source. ([Business Profile Performance](https://support.google.com/business/answer/9918094?hl=en))
- **[REC] GA4:** use recommended lifecycle events where they match the process, including `generate_lead`, `qualify_lead`, `disqualify_lead`, `working_lead`, `close_convert_lead`, and `close_unconvert_lead`, with value/currency where appropriate. Mark meaningful events as key events and test form tracking. ([GA4 recommended events](https://developers.google.com/analytics/devguides/collection/ga4/reference/events); [GA4 key events](https://support.google.com/analytics/answer/9267568?hl=en); [GA4 form interactions](https://support.google.com/analytics/answer/12941105?hl=en))
- **[REC] Call/ads measurement:** distinguish a call click from a completed or qualified call. Google Ads can count calls using a duration threshold or supported lead-quality processes, and offline outcomes can be imported where identifiers, consent, and product support allow. Features and availability vary by country. ([Google Ads call conversions](https://support.google.com/google-ads/answer/6095882?hl=en); [call reporting](https://support.google.com/google-ads/answer/7180997?hl=en); [offline call conversions](https://support.google.com/google-ads/answer/6275629?hl=en))
- **[REC] Attribution is a model, not ground truth.** GA4 can assign fractional/modelled credit; report the attribution model and do not equate one source’s assigned credit with causality. ([GA4 attribution](https://support.google.com/analytics/answer/10597962?hl=en))

### Contractor outcome ladder

Use the highest authorized level available and retain source definitions:

1. **Booked/completed qualified job, accepted estimate, gross revenue or contribution** in the operating system of record.
2. **Qualified opportunity** with service, geography, urgency, contactability, and disqualification reason.
3. **Lead event** such as a connected call, validated form, chat, or booking.
4. **Platform action** such as a Business Profile call-button or website click.
5. **Search engagement** such as a Search Console click or impression.
6. **Diagnostic visibility** such as rank observations, AI citations, crawler visits, or unverified third-party scores.

Levels 4–6 must not be reported as customers or revenue. Call recording, transcripts, CRM uploads, enhanced conversions, identity matching, and cross-platform joins can trigger privacy, consent, retention, security, employment, or telecommunications duties that vary by location. **[REQ where applicable]** Obtain approval for the data flow; minimize collection; define retention and access; never put secrets or customer personal information into prompts or public research.

### Validation protocol for tactics

Every **[HYP]** or **[EXP]** tactic should record:

- hypothesis and customer problem;
- exact pages/locations and start date;
- baseline window and primary outcome (prefer qualified/booked outcomes);
- guardrails such as spam, accessibility, review integrity, safety, and lead quality;
- known confounders: seasonality, weather, promotions, media spend, staffing, inventory, outages, and profile edits;
- Search Console/GBP/GA4/CRM definitions and access owner;
- decision date and predeclared keep/change/stop threshold.

An 8–12 week comparison may be a useful **[HYP]** for non-emergency changes, but HVAC seasonality and weather can overwhelm a short test. No fixed window proves causality. Preserve annotations and compare year-over-year or matched-weather periods where possible.

## 9. Ethical off-page and community participation

- **[REC] Earn attention through useful work.** Google recommends telling relevant communities about a site and creating unique, compelling content that people naturally want to reference. ([Google Search Essentials](https://developers.google.com/search/docs/essentials); [Google site-position FAQ](https://developers.google.com/search/help/site-position-in-search-faq?hl=en))
- **[REQ] Do not buy or automate ranking links.** Google treats paid links that pass ranking credit, excessive link exchanges, automated link creation, low-quality directory links, optimized forum/comment links, and similar schemes as link spam. Paid/sponsored placements must be qualified with `rel="sponsored"` or `rel="nofollow"` as applicable. ([Google Search spam policies](https://developers.google.com/search/docs/essentials/spam-policies))

Useful contractor participation can include **[HYP]** public permit/maintenance explainers reviewed by the competent authority, trade-school and workforce participation, community safety events, legitimate chambers/associations, disaster-recovery information, original local climate/equipment data, and cooperative resources with utilities or non-profits. The goal is public value and accurate attribution. Do not require followed links, seed fake community accounts, barter reviews, conceal sponsorship, or turn emergency events into fabricated authority.

## 10. AI crawler and snippet controls

Crawler controls are publication-governance choices, not proven rank tactics.

| System/control | Officially documented effect | Classification and limits |
|---|---|---|
| Googlebot | Crawls content for Google Search, subject to supported robots controls. | **[REQ for desired crawlability]** Blocking can prevent Google from seeing page directives or content. ([Google common crawlers](https://developers.google.com/crawling/docs/crawlers-fetchers/google-common-crawlers), last updated 2026-07-14) |
| `Google-Extended` | A robots token used to manage whether content may help train future Gemini models and ground Gemini/Vertex AI; it is not a separate HTTP user-agent. Google says it does not affect Google Search inclusion or ranking. | **[REQ as a publisher governance decision]** Do not describe it as an SEO boost. ([Google common crawlers](https://developers.google.com/crawling/docs/crawlers-fetchers/google-common-crawlers)) |
| Google `noindex`, `nosnippet`, `max-snippet`, `data-nosnippet` | Controls indexing or snippet use within the documented scope. The crawler must be able to access the page/directive. | **[REQ where suppression is intended]** Test carefully; robots.txt blocking can prevent the directive from being observed. ([Google robots meta documentation](https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag)) |
| OpenAI `OAI-SearchBot` | Controls discoverability and use for summaries/citations in ChatGPT Search. | **[REQ as a publisher choice]** Separate from training. OpenAI notes that `noindex` may be needed to suppress even a title/link in some circumstances. ([OpenAI publisher and developer FAQ](https://help.openai.com/en/articles/12627856-publishers-and-developers-faq)) |
| OpenAI `GPTBot` | Controls potential model-training collection. | **[REQ as a publisher choice]** It is separate from `OAI-SearchBot`; choose each intentionally. ([OpenAI publisher and developer FAQ](https://help.openai.com/en/articles/12627856-publishers-and-developers-faq)) |
| Perplexity `PerplexityBot` | Perplexity documents it as supporting search-result surfacing, not foundation-model training. | **[REQ as a publisher choice]** Allow only if desired and verify the current user agent/IP documentation. ([Perplexity crawler documentation](https://docs.perplexity.ai/docs/resources/perplexity-crawlers)) |
| Perplexity `Perplexity-User` | Perplexity documents it as user-triggered fetching and says it may not respect robots.txt. | **[EXP]** Use current IP/UA controls and security policy if this distinction matters. ([Perplexity crawler documentation](https://docs.perplexity.ai/docs/resources/perplexity-crawlers)) |
| `llms.txt` | Google Search explicitly says it is not used. Other systems may have different or evolving behavior. | **[EXP]** Never make it a core Google requirement; cost-limit any experiment and revalidate support. ([Google AI features and your website](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide)) |

User agents can be spoofed. A production control should verify current publisher documentation, consider published IP ranges where available, confirm CDN/WAF behavior, and test both intended access and intended denial. Never block a security-critical path solely because a claimed bot name looks familiar.

## 11. Regional variability and review ownership

| Topic | Why it varies | Required owner/check |
|---|---|---|
| Business Profile and Local Services Ads | Category and feature availability, screening, badge, country and market | Profile/ads owner checks current official help and live account; no credential screenshots published. |
| Trade and contractor licensing | Country, state/province/territory, municipality, trade, job value/scope | Licensed principal or compliance owner checks public regulator/registry. |
| Refrigerants, fuel, electrical, permits, lead/asbestos/mould | System type, building age, jurisdiction, disturbance scope | Qualified trade/safety reviewer; escalate before actionable instructions or claims. |
| Rebates, tax credits, financing | Customer, property, income, exact matched equipment, program date, installer, audit | Program owner/current primary program source; customer eligibility never assumed. |
| Testimonials, price, environmental and performance claims | Federal plus state/provincial consumer law and platform policy | Legal/compliance reviewer; preserve consent, substantiation, and dates. |
| Accessibility | Entity size/type, jurisdiction, content date, service relationship | Accessibility owner and legal review; target WCAG 2.2 technically even when a law names an older version. |
| Calls, analytics, recordings and uploads | Consent, notice, cross-border transfer, retention, vendor terms | Privacy/security owner; data-minimization and deletion schedule. |

## 12. Release gates for an HVAC AEO/SEO resource

The adapted repository should not ship a prompt library without these controls:

1. **Claim evidence gate:** every licence, insurance, certification, rebate, price, response time, savings, environmental, safety, review, and service-area claim has a source, owner, jurisdiction, last-check date, and recheck/expiry rule.
2. **Content integrity gate:** author/reviewer and method are named; copied or generated material has been checked against primary sources and actual operations; no fabricated experience, job, quote, customer, location, statistic, or credential.
3. **Local identity gate:** profile and site reflect the real operating model; hidden-address rules, one-profile rules, categories, hours, and service areas are checked.
4. **Spam gate:** no doorway city generation, scaled low-value pages, keyword/city blocks, bought links, fake mentions, copied reviews, review gating, or self-serving review-star scheme.
5. **Safety/legal gate:** regulated work and hazardous diagnostic advice receive competent human review; jurisdiction is explicit; absence of evidence blocks the claim.
6. **Structured-data gate:** markup is generated from validated visible facts, passes syntax checks, and is represented as eligibility—not a guaranteed display.
7. **Accessibility/mobile gate:** critical tasks pass keyboard, screen-reader, error-state, zoom, contrast, mobile-device, and low-bandwidth checks; field Core Web Vitals are monitored.
8. **Measurement gate:** qualified lead/booked-job definitions, source limitations, consent, retention, and attribution model are documented before an outcome claim is made.
9. **Change-control gate:** primary sources are rechecked on a schedule and after platform/legal/program changes. Stale FAQs, badges, rebates, screening steps, and schema features are removed.

## 13. Independent adversarial challenge specification

The work product should be challenged by a reviewer or agent that did not author it and is given the live source set plus the rendered output, not the author’s conclusions. The challenger should attempt to falsify it across these tracks:

1. **Policy conflict:** Can a recommended action create an ineligible profile, doorway page, scaled-content abuse, link scheme, self-serving review markup, or review manipulation?
2. **Unsupported causality:** Does any sentence turn correlation, eligibility, or official advice into a ranking, citation, traffic, lead, savings, rebate, or revenue guarantee?
3. **Credential laundering:** Does any badge or credential imply a broader holder, service, territory, current status, or government approval than the source proves?
4. **Jurisdiction collapse:** Is a U.S., Canadian, Ontario, Google-product, or program-specific rule presented as universal?
5. **Safety failure:** Could a homeowner be encouraged to perform regulated or hazardous work, delay emergency response, or rely on an unsupported health/safety claim?
6. **Privacy/security failure:** Does the output reveal a hidden home address, customer information, policy/certificate data, call recording, secret, or private evidence?
7. **Measurement illusion:** Are impressions, rankings, AI citations, call clicks, or modelled attribution described as qualified leads, booked jobs, or causal lift?
8. **Staleness:** Have schema features, AI reports, Local Services screening, rebates, credentials, statutes, crawler controls, or platform policies changed since the recorded date?
9. **Accessibility exclusion:** Can a keyboard-only, screen-reader, low-vision, cognitive, mobile, or low-bandwidth user complete the contact/booking task?
10. **Operational mismatch:** Do stated hours, geography, emergency availability, financing, inventory, prices, service types, or response times differ from what dispatch and sales can actually deliver?

Severity should be explicit: **BLOCK** for legal/policy/safety/privacy/fabrication conflicts or unsupported completion claims; **HIGH** for materially misleading eligibility, credential, location, or measurement claims; **MEDIUM** for validation gaps and fragile assumptions; **LOW** for clarity and maintainability. A blocker remains open until the exact missing evidence or owner decision exists. Fixtures, prose, screenshots, schema validation, and passing tests do not substitute for a real licence check, profile state, program decision, data authorization, or qualified technical/legal review.

## Source maintenance note

“Last updated” dates above are included only where the official page exposed a clear date during review. Undated live help pages were accessed on 2026-08-27 and should be treated as mutable. Before converting this research into production copy, automation, UI, or customer advice, re-open the cited official page, record the version/review date, and confirm the applicable region and business state.
