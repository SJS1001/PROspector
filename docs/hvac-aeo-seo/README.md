# HVAC Search and Answer Visibility

> An evidence-grounded, contractor-specific resource for earning local discovery, useful
> AI citations, and qualified HVAC leads without fake reviews, doorway pages,
> unsafe advice, or unmeasured content production.

**Evidence snapshot:** 2026-08-27

**Primary audience:** owner-operated and multi-location residential HVAC firms,
their marketing leads, and the agencies or developers who support them.

**Secondary audience:** plumbing, electrical, roofing, insulation, windows, and
other home-improvement contractors adapting the same controls. This is a
transferable framework, not a validated safety or licensing playbook for those
trades; each trade needs its own jurisdiction-specific hazard, credential,
permit, and claims overlay before use.

This resource is inspired by
[`awesome-aeo-seo`](https://github.com/discoveredlabs/awesome-aeo-seo), but it is
not a copy or a vendor catalog. It rebuilds the subject around the realities of
a local service business: proximity, service-area eligibility, licenses,
reviews, seasonal demand, emergency intent, safety claims, phone calls,
estimates, dispatch capacity, and booked revenue.

## What this package is—and is not

This is an implementation-ready **research and operating resource**: a curated
evidence base, staged playbook, UI/UX design contract, validation ledger,
contribution standard, and safe examples. It is more than a prompt library, but
it is not a coded or deployed contractor website. [`UX-SPEC.md`](UX-SPEC.md)
defines layouts, interaction states, accessibility criteria, and acceptance
tests for a future implementation; passing those tests still requires a real
frontend, a real contractor's approved facts, and field validation.

Nothing in this package creates or verifies a Business Profile, license,
listing, crawler rule, analytics property, appointment, lead, ranking, citation,
or sale. No hosted system or retired private project was accessed or changed.

## Start here

For an HVAC contractor, the priority order is:

1. **Represent the real business accurately.** Use one eligible Google Business
   Profile per legitimate staffed location, use the real-world business name,
   and configure a service-area business correctly. Google can suspend profiles
   that violate its representation rules. [P1, P2]
2. **Make every public fact consistent.** Name, phone, URL, hours, address or
   hidden-address status, service areas, licenses, and emergency availability
   must agree across the website and major profiles.
3. **Earn genuine reviews from genuine customers.** Do not gate, buy, fabricate,
   pressure, or selectively solicit positive reviews. Google prohibits those
   practices, and deceptive reviews can also create regulatory exposure. [P3,
   R1, R2]
4. **Build useful service pages before publishing articles.** Each real service
   needs a page that explains who it is for, symptoms, options, process, local
   constraints, proof, price factors, and the next step.
5. **Publish local expertise that another site cannot reproduce.** Use original
   job photos, measured outcomes, equipment combinations, climate context,
   permit or rebate sources, technician review, and explicit assumptions.
6. **Design for the stressed mobile homeowner.** Make emergency guidance,
   calling, scheduling, service-area confirmation, trust evidence, and form
   recovery obvious and accessible.
7. **Make the site crawlable and unambiguous.** Maintain canonical URLs, an XML
   sitemap, indexable public pages, consistent internal links, and truthful
   structured data. [P4, P5]
8. **Measure through the revenue event.** Search impressions and AI mentions are
   diagnostic metrics. Qualified calls, booked estimates, sold work, revenue,
   gross profit, cancellations, and capacity are operating metrics.
9. **Treat AI visibility as an additional discovery surface.** Google states
   that its generative features use the core Search index and ranking systems.
   Foundational SEO and non-commodity content remain the priority. [P6]
10. **Test uncertain tactics as experiments.** Never present `llms.txt`, content
    chunking, a schema object, or a single chatbot response as a proven ranking
    intervention. Google specifically says unnecessary AI text files and AEO/GEO
    hacks can be ignored. [P6]

The executable implementation sequence is in
[`PLAYBOOK.md`](PLAYBOOK.md). The conversion and interface contract is in
[`UX-SPEC.md`](UX-SPEC.md). Evidence classifications and claim tests are in
[`VALIDATION.md`](VALIDATION.md). The underlying first-party regulatory,
platform, standards, and HVAC research is preserved in
[`PRIMARY-SOURCE-RESEARCH.md`](PRIMARY-SOURCE-RESEARCH.md). Additions must meet
the evidence and disclosure rules in [`CONTRIBUTING.md`](CONTRIBUTING.md). The
normative playbook and UX groups resolve to evidence and operating disposition
in [`EVIDENCE-CROSSWALK.md`](EVIDENCE-CROSSWALK.md).

## Evidence labels

Every recommendation in this package should resolve to one of these labels:

| Label | Meaning | How to use it |
|---|---|---|
| **R** | Law, regulation, or regulator guidance | Treat as a compliance boundary; confirm jurisdiction and obtain counsel where needed. |
| **P** | Platform policy, eligibility rule, or first-party platform guidance | Treat as controlling for that platform, while recognizing that eligibility never guarantees visibility. |
| **S** | Open standard or official vocabulary | Use for interoperability; do not imply a ranking benefit unless a platform says so. |
| **O** | Official HVAC, energy, safety, or accessibility guidance | Use as a source for factual content and operating quality, within its stated jurisdiction and scope. |
| **E** | Peer-reviewed or author-published empirical research | Treat as evidence with method limits, not a universal platform rule. |
| **X** | Experimental tactic or unverified practitioner hypothesis | Keep out of the baseline; test only after measurement and guardrails exist. |

These letters classify the **source or evidence family**. The research record
also classifies the **operating disposition** as `[REQ]`, `[REC]`, `[ELIG]`,
`[HYP]`, or `[EXP]`. The two are complementary, not interchangeable. Inline
labels are used for compact source references; the crosswalk supplies both
classifications for grouped prescriptions in the playbook, UX specification,
and examples.

## Contents

- [What this package is—and is not](#what-this-package-isand-is-not)
- [How local and AI discovery fit together](#how-local-and-ai-discovery-fit-together)
- [Google Business Profile and local discovery](#google-business-profile-and-local-discovery)
- [Contractor trust and HVAC truth](#contractor-trust-and-hvac-truth)
- [Website and content architecture](#website-and-content-architecture)
- [Structured data](#structured-data)
- [Reviews, testimonials, and reputation](#reviews-testimonials-and-reputation)
- [Conversion UX and accessibility](#conversion-ux-and-accessibility)
- [Measurement and evaluation](#measurement-and-evaluation)
- [AI discovery and experimental tactics](#ai-discovery-and-experimental-tactics)
- [Rejected shortcuts](#rejected-shortcuts)
- [Source index](#source-index)

## How local and AI discovery fit together

An HVAC contractor competes on several overlapping surfaces:

1. **Google Maps and local results** depend heavily on relevance, distance, and
   prominence. Complete business information, reviews, and links contribute,
   but no content tactic changes the searcher's physical distance. [P7]
2. **Traditional organic results** depend on crawlability, indexability,
   relevance, quality, and many query-specific signals. Google does not
   guarantee crawling, indexing, or serving. [P4]
3. **Google generative results** retrieve from the Search index and use related
   query fan-out. A page must first be indexable and snippet-eligible. [P6]
4. **ChatGPT search** may discover public pages through OAI-SearchBot. OpenAI
   documents crawler control separately from GPTBot training control and adds a
   `utm_source=chatgpt.com` parameter to referral links. [P8]
5. **Recommendation and comparison answers** are non-deterministic. Research
   warns that single runs are misleading and that traditional source ranking
   can outperform conversational-optimization tricks. [E1, E2]

The practical conclusion is not “optimize separately for every answer engine.”
It is: create an accurate local entity, publish distinctive evidence that is
easy to retrieve, and measure each surface without pretending they are the same.

### High-value query families

Use query families to organize customer needs, not to mass-produce pages:

- **Urgent failure:** no heat, no cooling, leaking unit, frozen coil, unusual
  smell, alarm, breaker trip, or system not starting.
- **Diagnosis:** short cycling, uneven rooms, noise, humidity, poor airflow,
  high bill, or repeated repair.
- **Repair decision:** likely causes, diagnostic process, repair ranges, part
  availability, warranty, and repair-versus-replace criteria.
- **Replacement decision:** equipment type, sizing, load calculation, ductwork,
  efficiency, cold-climate performance, total installed cost, incentives,
  financing, and commissioning.
- **Maintenance:** homeowner-safe checks, professional inspection scope,
  seasonal timing, and service-plan terms.
- **Trust:** license, insurance, technician qualifications, workmanship,
  equipment certification, permits, warranty responsibility, and complaint
  resolution.
- **Local constraints:** climate, utility rates, rebates, permitting, housing
  stock, service radius, and realistic arrival windows.

## Google Business Profile and local discovery

### Required operating practices

- Follow Google's real-world naming and eligibility rules. Do not add city,
  service, “24/7,” or keyword text to the business name unless it is genuinely
  part of the recognized name. [P1]
- A service-area business that does not receive customers at its address should
  hide the address. It may have one profile for the overall area it serves;
  additional profiles require legitimate separately staffed locations. [P1,
  P2]
- Configure specific service areas. Google currently allows up to 20 and says
  the overall boundary generally should not exceed about two hours of driving
  from the business base. [P2]
- Use a phone number that reaches the actual location or business. Do not use a
  disconnected tracking number or lead broker identity as the only durable
  public identity. [P1]
- Keep regular and special hours current. If “24-hour emergency service” is
  advertised, define what is actually staffed and what response customers can
  expect.
- Use the most accurate primary category and only applicable additional
  categories. Describe services in the dedicated fields instead of distorting
  the business name.
- Upload authentic photos of technicians, vehicles, equipment, completed work,
  and the legitimate premises. Obtain permission before showing customers,
  addresses, identifying home details, or license plates.

### Local authority sources

- [P7 — Google: improve local ranking](https://support.google.com/business/answer/7091?hl=en)
  — defines relevance, distance, and prominence and identifies complete data,
  reviews, and links as relevant inputs.
- [P1 — Google: represent your business](https://support.google.com/business/answer/3038177?hl=en)
  — controlling profile identity, address, category, and service-area rules.
- [P2 — Google: manage service areas](https://support.google.com/business/answer/9157481?hl=en)
  — service-area versus hybrid classification and geographic limits.
- [P9 — Google: Business Profile performance](https://support.google.com/business/answer/9918094?hl=en)
  — official definitions for calls, website clicks, views, searches, and other
  profile interactions.
- [P10 — Google Local Services screening](https://support.google.com/localservices/answer/6226575?hl=en-EN)
  — location- and category-dependent checks that may include registration,
  insurance, licenses, reviews, owners, and field workers.

## Contractor trust and HVAC truth

HVAC content can affect expensive purchasing decisions and can cross into fire,
electrical, refrigerant, combustion, carbon-monoxide, and health risks. A page
that is optimized but wrong is a liability.

### Evidence blocks to maintain

Publish only evidence the business can keep current:

- legal business name and any registered trade name;
- public license numbers with issuing authority and verification link where
  legally appropriate;
- insurance status without publishing private policy documents or unnecessary
  identifiers;
- technician certifications with holder, scope, issuer, and current status;
- manufacturer-authorized dealer claims only while authorization is current;
- warranties with issuer, covered party, duration, exclusions, registration
  requirements, and whether labor is separate from equipment coverage;
- equipment model combinations and certified performance references;
- permits and inspections described for the actual jurisdiction;
- rebates and tax incentives with official source, eligibility conditions,
  expiry date, and a “verify before purchase” warning;
- case studies with consent, date, climate/location context, equipment, scope,
  assumptions, measurements, and limitations.

### HVAC primary sources

- [O1 — U.S. EPA Section 608 certification](https://www.epa.gov/section608/section-608-technician-certification)
  — U.S. refrigerant-handling certification requirements. It is not a universal
  contractor license and does not replace state or local requirements.
- [O2 — ENERGY STAR contractor resources](https://www.energystar.gov/partner-resources/products_partner_resources/retailer-resources/air-source-heat-pumps-resources-contractors)
  — training, quality-installation, and homeowner communication resources.
- [O3 — ENERGY STAR installation guidance](https://www.energystar.gov/products/energy_star_home_upgrade/clean_heating_cooling)
  — contractor selection, installation quality, and maintenance guidance.
- [O4 — U.S. DOE heat-pump systems](https://www.energy.gov/energysaver/heat-pump-systems)
  — technology and climate context; local costs, incentives, and suitability
  still require current regional evidence.
- [O5 — ENERGY STAR hiring guidance](https://www.energystar.gov/saveathome/heating-cooling/10-tips-hiring)
  — what homeowners are told to verify when choosing an HVAC contractor.
- [O6 — ENERGY STAR maintenance checklist](https://www.energystar.gov/saveathome/heating-cooling/maintenance-checklist)
  — separates professional inspection activities from simple homeowner tasks.
- [O7 — U.S. EPA indoor-air filters](https://www.epa.gov/indoor-air-quality-iaq/air-cleaners-and-air-filters-home)
  — filtration can supplement source control and ventilation but does not remove
  all pollutants.
- [O8 — U.S. EPA duct-cleaning guidance](https://www.epa.gov/indoor-air-quality-iaq/should-you-have-air-ducts-your-home-cleaned)
  — rejects sweeping health claims and routine-cleaning claims unsupported by
  evidence.
- [O9 — AHRI certified product directory](https://www.ahridirectory.org/)
  — verify matched-system performance rather than citing an unmatched model's
  rating.

### Safety-content boundary

Classify every proposed article or answer:

| Class | Examples | Publishing rule |
|---|---|---|
| Green | filter inspection, thermostat settings, keeping an outdoor unit clear | May provide bounded homeowner steps with manufacturer-specific caveats. |
| Yellow | condensate symptoms, airflow diagnosis, breaker state, equipment reset | Explain observation and stop conditions; do not encourage panel work, repeated resets, bypasses, or disassembly. Require technician review. |
| Red | gas smell, CO alarm, refrigerant handling, combustion, cracked heat exchanger, electrical modification | Provide emergency/authority guidance only. Do not publish repair instructions as a lead-generation tactic. Cite the relevant emergency, manufacturer, utility, fire, or regulatory source. |

All technical content must identify the qualified reviewer and review date. A
generative model may assist with organization, but it must not be the factual
authority.

## Website and content architecture

### Minimum information architecture

```text
Home
├── Heating
│   ├── Furnace repair
│   ├── Furnace installation
│   ├── Boiler service (only if actually offered)
│   └── No-heat / emergency service
├── Cooling
│   ├── Air-conditioner repair
│   ├── Air-conditioner installation
│   └── No-cooling / emergency service
├── Heat pumps
│   ├── Repair
│   ├── Installation and replacement
│   └── Cold-climate and dual-fuel guidance
├── Indoor air and ducts (only supported services)
├── Maintenance plans
├── Service areas
│   └── One substantive page per genuinely distinct served area
├── Projects / case studies
├── Learning centre
├── About, credentials, warranties, and financing
└── Contact / schedule
```

Do not create a page for every city-service permutation. Google defines doorway
abuse to include substantially similar regional or city pages that funnel users
to the same destination. Scaled low-value AI pages can also violate spam policy.
[P11]

### Service-page contract

Every service page should answer:

1. Is the service available in the visitor's area, and when?
2. What symptoms or situations is it appropriate for?
3. What is safe to check before calling, and when should the visitor stop?
4. What will the technician inspect or measure?
5. What options may follow from the diagnosis?
6. Which local factors affect cost and timing?
7. What proof demonstrates competence for this exact service?
8. What does the warranty cover and exclude?
9. What is the next step, and what happens after the visitor submits?

Use the implementation brief in
[`examples/SERVICE-PAGE-BRIEF.md`](examples/SERVICE-PAGE-BRIEF.md).

### Local-page contract

A location page is justified only when it contains material local value, such
as a staffed location, a distinct service boundary, different permitting or
utility context, documented local project evidence, different climate or
housing conditions, or different dispatch details. Each page must state the
truth about whether the contractor has a public location there.

### Content evidence hierarchy

Prefer, in order:

1. current law, regulator, municipality, utility, or safety authority;
2. manufacturer installation and service documentation for the exact equipment;
3. recognized standards and certified product directories;
4. the contractor's own dated measurements, photos, and job records;
5. peer-reviewed or transparent empirical research;
6. trade-association education with disclosed scope;
7. practitioner commentary;
8. generated summaries or unattributed claims.

Lower levels cannot silently override higher levels.

## Structured data

Structured data helps machines classify visible page content. It does not make
unsupported claims true, and Google does not guarantee a rich result even when
markup is valid. [P5]

### Baseline

- Use [`HVACBusiness`](https://schema.org/HVACBusiness) when it accurately
  describes the business. It is a subtype of `HomeAndConstructionBusiness` and
  `LocalBusiness`. [S1]
- Include only public, page-visible, current facts.
- Use the most specific truthful type, a stable canonical URL, business name,
  public phone, public customer-facing address when one legitimately exists,
  hours, logo/images, and service-area information.
- Use [`Service`](https://schema.org/Service) and
  [`areaServed`](https://schema.org/areaServed) as semantic vocabulary where
  useful, but do not promise a Google service rich result; `Service` is not a
  standalone feature in Google's supported rich-result gallery. [S2, P12]
- Do not add self-serving review or aggregate-rating markup. An HVAC firm's own
  pages are ineligible for Google's star-review feature when the firm controls
  the reviews about itself, including reviews shown through an embedded
  third-party widget. [P19]
- Do not present FAQ markup as an AEO tactic. Google stopped showing FAQ rich
  results on May 7, 2026 and removed the feature documentation in June 2026.
  Keep useful question-and-answer content visible for people, without promising
  a special search display. [P13]
- Validate syntax, compare markup with visible content, run Google's Rich
  Results Test for supported features, and inspect deployed URLs in Search
  Console.

Examples:

- [`examples/HYBRID-HVAC-BUSINESS.jsonld`](examples/HYBRID-HVAC-BUSINESS.jsonld)
- [`examples/SERVICE-AREA-HVAC-BUSINESS.jsonld`](examples/SERVICE-AREA-HVAC-BUSINESS.jsonld)
- [`examples/HVAC-SERVICE.jsonld`](examples/HVAC-SERVICE.jsonld)

The service-area example intentionally omits a street address. It therefore
does **not** satisfy the address requirement for Google's currently documented
Local Business rich-result implementation, although it remains general
Schema.org vocabulary. Do not expose a hidden residential address merely to
pursue rich-result eligibility; privacy and truthfulness take precedence.

## Reviews, testimonials, and reputation

### Safe review-request rule

Ask real customers for an honest review without an incentive, requested rating,
requested wording, on-premises pressure, employee quota, or selective positive
filter. Provide the same opportunity regardless of whether internal feedback
was positive or negative. [P3]

Use [`examples/REVIEW-REQUEST-SOP.md`](examples/REVIEW-REQUEST-SOP.md) as the
operating contract.

### Regulatory sources

- [R1 — FTC Consumer Reviews and Testimonials Rule Q&A](https://www.ftc.gov/business-guidance/resources/consumer-reviews-testimonials-rule-questions-answers)
  — U.S. guidance on fake reviews, sentiment-conditioned incentives, insider
  reviews, suppression, and testimonials.
- [R2 — Competition Bureau Canada: online reviews](https://competition-bureau.canada.ca/en/deceptive-marketing-practices-digest-volume-1)
  — Canadian guidance on astroturfing, authenticity, and undisclosed material
  connections.
- [R3 — Competition Bureau Canada: false or misleading representations](https://competition-bureau.canada.ca/en/deceptive-marketing-practices/types-deceptive-marketing-practices/false-or-misleading-representations-and-deceptive-marketing-practices)
  — performance, warranty, environmental, test, and testimonial claims require
  appropriate substantiation and must not create a materially misleading
  general impression.
- [P3 — Google Maps user-contribution policy](https://support.google.com/contributionpolicy/answer/7400114?hl=en)
  — prohibits fake, paid, incentivized, biased, selectively solicited, and
  pressured reviews.

These sources are jurisdiction-specific and are not legal advice. Email, SMS,
telemarketing, recording, privacy, contractor advertising, and rebate rules
also vary by country, province/state, and municipality.

## Conversion UX and accessibility

An HVAC visitor may be cold, hot, worried, on a phone, using one hand, or trying
to decide whether a situation is dangerous. The interface must not make that
person decode marketing language before finding the correct action.

Baseline requirements:

- Put the real service area, current availability, and primary phone action near
  the top of the page.
- Separate “possible emergency” from ordinary booking without using fear to
  manufacture urgency.
- Make tap targets at least WCAG 2.2's 24 by 24 CSS pixel minimum or provide the
  required spacing; use larger targets for the primary call and schedule
  actions. [S3]
- Preserve visible keyboard focus, descriptive labels, logical focus order,
  text-based errors, and recovery after submission failure. [S4]
- Use responsive design and keep mobile content equivalent to desktop content.
  Google uses mobile-first indexing and recommends responsive design. [P14]
- Prevent sticky call bars, chat widgets, cookie notices, or finance banners
  from obscuring content or keyboard focus.
- Show what will happen after a form submission and when the customer should
  expect contact. Never imply an appointment is booked when only a request was
  received.
- Provide a direct non-form contact path.
- Do not preselect financing, marketing consent, or add-on work.

See [`UX-SPEC.md`](UX-SPEC.md) for page layouts, interaction states, and
acceptance criteria.

## Measurement and evaluation

### Measurement hierarchy

| Level | Primary measures | Decision supported |
|---|---|---|
| Business | booked jobs, sold jobs, revenue, gross profit, cancellation, capacity | Is the program producing valuable work the company can serve? |
| Lead quality | qualified calls/forms, service match, geography match, appointment rate | Are discovery surfaces attracting the right demand? |
| Conversion | call clicks, connected calls, form completion, booking completion | Can visitors complete the intended task? |
| Local discovery | Business Profile searches, calls, website clicks, bookings, views | How are Maps and Search profile interactions changing? [P9] |
| Organic discovery | Search Console clicks, impressions, queries, pages, geography, device | Which search demand and pages changed? [P15] |
| AI discovery | identified referral sessions, cited URLs, assisted leads, repeated prompt samples; Google's dedicated generative-AI impressions when the report is available | Is AI discovery observable beyond anecdotes? [P8, P20, E2] |
| Technical | indexing, crawl errors, Core Web Vitals, form errors, uptime | Are technical defects constraining discovery or conversion? |

Google describes Search Console as the source of truth for Google Search
performance and Analytics as the source of truth for on-site behavior. Their
counts are not expected to match exactly. [P15]

As of this evidence snapshot, Google was rolling its dedicated Search Console
generative-AI reports out only to a subset of sites. Those reports expose
impressions plus page, country, device, and date views; they do not replace
lead-quality or booked-revenue evidence, and a contractor must not fabricate a
report that its property does not have. [P20]

GA4's recommended lead events include `generate_lead`, `qualify_lead`,
`working_lead`, `close_convert_lead`, and corresponding disqualification or
unconverted outcomes. [P16] Use those names only if the business process can
set them truthfully.

### Evaluation rules

- Establish at least 8–13 weeks of baseline data when possible and compare
  year-over-year for strongly seasonal demand.
- Annotate weather extremes, promotions, outages, staffing or dispatch changes,
  price changes, tracking changes, and major platform changes.
- Change bounded groups of pages rather than the entire site at once.
- Define success, harm, and rollback thresholds before publishing.
- Do not call correlation causal. A 5× increase in AI referrals can reflect
  platform growth rather than the intervention; one 2026 natural experiment
  found that a large part of raw growth was a platform tailwind. [E3]
- Do not rank contractors from one chatbot response. Repeated sampling research
  reports substantial citation variability. [E2]
- Keep phone tracking operationally safe: preserve a stable primary identity,
  test number forwarding, disclose recording where required, and audit missed
  or misrouted calls.

## AI discovery and experimental tactics

### Baseline AI readiness

- Keep important pages public, indexable, internally linked, and useful without
  JavaScript-only interaction.
- Allow or disallow crawlers deliberately. OpenAI says OAI-SearchBot controls
  inclusion in ChatGPT summaries and snippets, while GPTBot controls potential
  training use. [P8]
- Make headings, controls, and form labels clear to people and assistive
  technologies. This also helps browser agents interpret the page.
- Lead with the direct answer, then give assumptions, evidence, alternatives,
  risks, and the contractor's local proof.
- Use explicit dates on cost, rebate, regulation, equipment, and performance
  content.
- Keep the same factual identity across the website and trusted third-party
  sources.

### Research worth understanding

- [E4 — GEO: Generative Engine Optimization](https://arxiv.org/abs/2311.09735)
  — KDD 2024 paper that introduced a benchmark and reported domain-dependent
  visibility effects. It does not prove that a tactic improves local HVAC leads.
- [E1 — C-SEO Bench](https://arxiv.org/abs/2506.11097)
  — NeurIPS 2025 benchmark reporting that many conversational-SEO methods were
  ineffective or harmful while traditional source-ranking strategies performed
  better.
- [E5 — What Gets Cited](https://arxiv.org/abs/2605.25517)
  — controlled two-document RAG testbed; topical relevance and list position
  dominated, with smaller effects for price and recency. Its injected-context
  design is not a field test of local search.
- [E2 — Quantifying Uncertainty in AI Visibility](https://arxiv.org/abs/2603.08924)
  — repeated-sampling study showing unstable citation distributions and warning
  against single-run estimates.
- [E3 — Disentangling AEO from Platform Growth](https://arxiv.org/abs/2606.04362)
  — single-domain natural experiment that explicitly reports a suggestive, not
  conclusive, intervention effect after controlling for platform growth.

### Experimental backlog

These items remain **X**, not baseline recommendations:

- `llms.txt` or AI-specific text mirrors;
- serving different content to AI crawlers;
- AI-assist widgets that send the current page to a model;
- automated citation-monitoring scores without repeated samples and uncertainty;
- model-specific wording or tokenizer optimization;
- self-hosted RAG or MCP feeds for a small contractor site;
- autonomous content rewriting or publishing;
- promotional Reddit threads or covert community seeding.

An experiment may advance only when it has a stated hypothesis, eligible pages,
baseline, control or comparison, cost limit, safety review, success/harm
thresholds, and rollback plan.

## Rejected shortcuts

The following practices are excluded from this resource:

- fake locations, virtual offices, rented mailboxes, or unstaffed profile clones;
- keyword-stuffed business names;
- one near-duplicate page per city and service;
- AI-generated pages with no contractor-specific evidence;
- fake, paid, incentivized, employee, family, or competitor reviews without
  required independence and disclosure;
- review gating or asking only apparently satisfied customers;
- fabricated licenses, certifications, awards, case studies, prices, savings,
  response times, “best” claims, guarantees, or rebates;
- self-serving review schema intended to manufacture stars;
- cloaking or AI-bot-only promotional content;
- unsafe do-it-yourself repair instructions involving refrigerant, combustion,
  electrical panels, gas, or safety controls;
- health, air-quality, energy-savings, environmental, or payback claims without
  evidence appropriate to the claim;
- rankings, traffic, impressions, or chatbot mentions presented as booked-job
  success;
- automatic publishing or automatic responses to reviews.

## Source index

### Platform and search sources

- **P1:** [Google Business Profile representation guidelines](https://support.google.com/business/answer/3038177?hl=en)
- **P2:** [Google service-area management](https://support.google.com/business/answer/9157481?hl=en)
- **P3:** [Google Maps prohibited and restricted content](https://support.google.com/contributionpolicy/answer/7400114?hl=en)
- **P4:** [How Google Search works](https://developers.google.com/search/docs/fundamentals/how-search-works)
- **P5:** [Google Local Business structured data](https://developers.google.com/search/docs/appearance/structured-data/local-business)
- **P6:** [Google generative-AI optimization guide](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide)
- **P7:** [Google local-ranking guidance](https://support.google.com/business/answer/7091?hl=en)
- **P8:** [OpenAI publisher and developer crawler FAQ](https://help.openai.com/en/articles/12627856-publishers-and-developers-faq)
- **P9:** [Google Business Profile performance](https://support.google.com/business/answer/9918094?hl=en)
- **P10:** [Google Local Services screening and verification](https://support.google.com/localservices/answer/6226575?hl=en-EN)
- **P11:** [Google Search spam policies](https://developers.google.com/search/docs/essentials/spam-policies)
- **P12:** [Google supported structured-data gallery](https://developers.google.com/search/docs/appearance/structured-data/search-gallery)
- **P13:** [Google Search documentation updates](https://developers.google.com/search/updates)
- **P14:** [Google mobile-first indexing practices](https://developers.google.com/search/docs/crawling-indexing/mobile/mobile-sites-mobile-first-indexing)
- **P15:** [Using Search Console and Google Analytics together](https://developers.google.com/search/docs/monitor-debug/google-analytics-search-console)
- **P16:** [GA4 recommended lead-generation events](https://support.google.com/analytics/answer/9267735?hl=en-EN)
- **P17:** [Google sitemap guidance](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)
- **P18:** [Google canonicalization guidance](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls)
- **P19:** [Google review-snippet structured-data guidelines](https://developers.google.com/search/docs/appearance/structured-data/review-snippet)
- **P20:** [Google Search generative-AI performance reports](https://developers.google.com/search/blog/2026/06/gen-ai-performance-reports)

### Standards, regulation, and HVAC sources

- **S1:** [Schema.org HVACBusiness](https://schema.org/HVACBusiness)
- **S2:** [Schema.org Service](https://schema.org/Service)
- **S3:** [WCAG 2.2 target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)
- **S4:** [WCAG 2.2 understanding documents](https://www.w3.org/WAI/WCAG22/Understanding/)
- **R1:** [FTC Consumer Reviews and Testimonials Rule Q&A](https://www.ftc.gov/business-guidance/resources/consumer-reviews-testimonials-rule-questions-answers)
- **R2:** [Competition Bureau Canada online-review guidance](https://competition-bureau.canada.ca/en/deceptive-marketing-practices-digest-volume-1)
- **R3:** [Competition Bureau Canada false or misleading representations](https://competition-bureau.canada.ca/en/deceptive-marketing-practices/types-deceptive-marketing-practices/false-or-misleading-representations-and-deceptive-marketing-practices)
- **O1:** [U.S. EPA Section 608 certification](https://www.epa.gov/section608/section-608-technician-certification)
- **O2:** [ENERGY STAR contractor resources](https://www.energystar.gov/partner-resources/products_partner_resources/retailer-resources/air-source-heat-pumps-resources-contractors)
- **O3:** [ENERGY STAR clean heating and cooling](https://www.energystar.gov/products/energy_star_home_upgrade/clean_heating_cooling)
- **O4:** [U.S. DOE heat-pump systems](https://www.energy.gov/energysaver/heat-pump-systems)
- **O5:** [ENERGY STAR contractor hiring guidance](https://www.energystar.gov/saveathome/heating-cooling/10-tips-hiring)
- **O6:** [ENERGY STAR maintenance checklist](https://www.energystar.gov/saveathome/heating-cooling/maintenance-checklist)
- **O7:** [U.S. EPA air cleaners and filters](https://www.epa.gov/indoor-air-quality-iaq/air-cleaners-and-air-filters-home)
- **O8:** [U.S. EPA duct-cleaning guidance](https://www.epa.gov/indoor-air-quality-iaq/should-you-have-air-ducts-your-home-cleaned)
- **O9:** [AHRI certified product directory](https://www.ahridirectory.org/)

## Maintenance contract

- Recheck platform and regulatory sources every quarter.
- Recheck rebate, tax-credit, licensing, and utility sources before every
  publication or campaign that names them.
- Preserve the evidence label and retrieved date for new resources.
- Reject vendor submissions that do not disclose methodology, commercial
  interest, and applicability limits.
- Do not report this resource as proving rankings, citations, leads, or revenue.
  Those outcomes require contractor-specific implementation and field data.
