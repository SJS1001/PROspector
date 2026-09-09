# TodayAir Auburn HVAC search-visibility audit

Audit date: 2026-08-27 (America/Toronto; some server observations were dated 2026-08-28 UTC)

Audited property: [gettodayair.com](https://gettodayair.com/)

Market in scope: Auburn, Alabama, with secondary review of Opelika, Phenix City, and the broader service area claimed on the website.

## Executive finding

TodayAir has a credible starting platform: a polished mobile experience, focused Auburn service pages, working online booking, a crawlable site, strong customer proof, and an active Google Business Profile. Identity, safety, consumer-protection, privacy, and content-parity fixes are the highest-risk prerequisites before measured growth experiments. Search Console, profile, lead, and booked-job baselines are needed before claiming which growth tactic will improve visibility fastest.

The most important findings are:

1. **Business identity needs a controlled source of truth.** The static website, dynamic call tracking, Google Business Profile, and third-party listings expose different phone numbers. The website says the office is "By Appointment Only" and publishes limited office hours, while Google Maps displays the address and "Open 24 hours." The footer license identifier could not be reconciled with the self-reported trade-license number shown by a third party. These may each have legitimate explanations, but they require owner verification before edits.
2. **Several schema objects do not describe the page on which they appear.** The AC repair page emits a generic HVAC service object whose URL and `@id` point to `/hvac-services/`, and multiple FAQ schemas contain questions that differ from the visible FAQs. This should be corrected before expanding schema.
3. **The site is close to being a good answer source, but some claims weaken trust.** The indoor-air-quality page says equipment can "eliminate nearly all pollution and allergens," which is materially broader than EPA guidance. Service promises, pricing, availability, guarantees, and license statements also need explicit substantiation and expiry/owner controls.
4. **Three customer-facing risk paths need immediate correction.** The financing page contains internally inconsistent payment math and specific credit terms that require lender/compliance review; the review-request page asks only happy customers and its platform buttons lead to `#`; and the heating page treats unusual smells as a repair lead without first stating gas/CO emergency boundaries.

No ranking, traffic, lead, or revenue uplift is promised. Search Console, Business Profile performance, analytics, CRM, call-tracking configuration, and official license evidence were not available, so conclusions that require those systems remain open checkpoints.

## What was tested

- Live desktop and 390-by-844 mobile rendering in a browser.
- Navigation, telephone links, the Housecall Pro booking overlay, forms, headings, visible copy, reviews, and footer details. No form was submitted.
- `robots.txt`, XML sitemaps, KML location feed, status codes, redirects, canonicals, titles, descriptions, headings, and JSON-LD.
- The homepage, six core service pages, maintenance, service-area hub, Auburn-oriented homepage/service hub, Opelika and Phenix City pages, About, Contact, Reviews, Offers, Financing, Careers, Privacy, Thank You, Review Us, and two author archives.
- Public Google Maps listing, non-localized web-search results, and selected third-party citations.
- Current official Google Search, Google Business Profile, Alabama HACR Board, EPA, and ENERGY STAR guidance.

## Evidence conventions

| Label | Meaning |
| --- | --- |
| Verified-live | Observed directly on the public website, public Google Maps listing, or HTTP response during this audit. |
| Verified-official | Supported by an official platform, regulator, or government source. |
| Secondary | Reported by a third party and not treated as authoritative. |
| Inference | A reasoned recommendation from verified observations, not a proven ranking cause. |
| Owner checkpoint | Requires owner, vendor, analytics, CRM, or regulatory evidence before release. |

## Scorecard

| Area | Assessment | Why |
| --- | --- | --- |
| Crawlability and canonicalization | Strong baseline | Public pages return 200, unknown URLs return 404, HTTP/www/non-trailing variants redirect to one HTTPS canonical, and robots.txt declares the sitemap. |
| Transactional on-page targeting | Good | Core pages have one clear H1, Auburn intent in titles, descriptive copy, FAQs, service CTAs, and internal links. |
| Index hygiene | Needs work | Thank-you and two thin author archives are indexable and included in sitemaps. Review-request and privacy utility pages are also indexable. |
| Entity and schema consistency | High risk | Incomplete homepage entity data, copied AC-repair service schema, mismatched FAQ markup, and no schema on several important local/trust pages. |
| Google Business Profile | Strong asset with governance gaps | Public listing shows 5.0 from 61 reviews, booking, recent posts, photos, owner responses, and the HVAC contractor category; phone, address eligibility, and hours need reconciliation. |
| Local landing-page system | Early | Auburn is covered; Opelika and Phenix City have pages. The broad service-area list is not backed by a governed, evidence-led location architecture. |
| Trust and expertise | Promising | Family story, owner accountability, technician/customer detail, real reviews, transparent offers, and local imagery are strong. License, hours, guarantee, and health claims need tighter evidence. |
| Conversion UX | Good with fixable friction | Mobile call and booking paths are prominent and booking opens correctly. The lead form asks for five required fields plus required SMS consent, lacks autocomplete hints, the homepage reviews link redirects incorrectly, and all three `/review-us/` platform buttons currently point to `#`. |
| Consumer safety/compliance | Needs immediate review | IAQ, financing, review-request, and heating-emergency copy each has a specific evidence, policy, math, or safety defect. This is a release gate, not a request for the SEO team to provide legal advice. |
| Measurement | Unknown | No Search Console, Business Profile performance, analytics, CRM, or call-tracking configuration was available. |
| Core Web Vitals | Unknown | Google PageSpeed API quota was unavailable during the audit; field data and a controlled Lighthouse run are still required. |

## Verified strengths to preserve

1. **Focused transactional pages.** AC repair, AC installation, heating repair, HVAC services, indoor air quality, and ductwork each have an Auburn-focused title, description, canonical, H1, useful body copy, and visible FAQs.
2. **Good mobile first impression.** At 390 pixels wide, the logo, menu, tap-to-call bar, emergency promise, headline, booking CTA, financing CTA, and branded truck are legible and visually coherent above the fold.
3. **Booking is functional.** The apparent `href="#"` "Book Online" links are enhanced by the Housecall Pro script and opened the booking dialog during the audit. They should not be classified as broken solely from raw HTML.
4. **Call tracking appears intentional.** Static HTML and JSON-LD use `(334) 454-3447`, while the rendered browser used an Invoca-inserted `(334) 779-7835`. Dynamic number insertion is not inherently an NAP defect if the canonical number remains machine-readable and configured as an alternate in local profiles.
5. **Public review proof is substantial.** The Google listing showed 61 reviews at 5.0, owner replies, customer photos, and topics related to diagnosis, repair, and installation.
6. **The Business Profile is being maintained.** It showed recent posts, owner-uploaded media, online booking, online estimates, installation service, and repair service.
7. **The brand has real differentiators.** Same-day/after-hours positioning, the Owner's Card, family ownership, straightforward pricing, financing, and the maintenance plan are more memorable than generic "quality service" copy.
8. **Basic technical behavior is sound.** Robots allow public crawling; the sitemap is reachable; canonical variants redirect; the site returns a true 404; pages use self-referencing canonicals; and the homepage is eligible for large image/snippet previews.

## Priority action register

Priority definitions:

- P0: active identity, safety, consumer-protection, or platform-policy risk; resolve before promotion or growth work.
- P1: technical/content foundation to complete before scaling pages or schema; improves measurement, relevance, usability, and local conversion readiness.
- P2: build during days 31-90 after measurement and governance are in place.

| ID | Priority | Action | Evidence and rationale | Completion test | Owner |
| --- | --- | --- | --- | --- | --- |
| ID-01 | P0 | Create and approve one business-identity record. | Verified-live: static website/JSON-LD use `334-454-3447`; Invoca inserted `334-779-7835`; Google Maps displayed `334-956-6300`. Google says business information should be complete, accurate, and consistently represent the real business. | Signed record contains legal entity, public brand, canonical local number, tracking numbers and purpose, address mode, office/customer hours, emergency availability, primary category, service areas, and current license evidence. | Owner + local SEO vendor |
| ID-02 | P0 | Reconcile Business Profile address and hours with actual operations. | Verified-live: site says `1021 Ronald Ln.` is "By Appointment Only," publishes weekday office hours, and limits weekend wording; Maps displayed the address and "Open 24 hours." Verified-official: a service-area business that does not receive customers at its address should hide that address; a shown storefront must be staffed and able to receive customers during stated hours. | Owner documents whether the address has permanent signage, is staffed, and receives customers. GBP and site separately state office hours and 24/7 emergency/dispatch availability without contradiction. | Owner + GBP manager |
| ID-03 | P0 | Verify and correct the public license identifier. | Verified-live: footer says `License Number 108440793`. Secondary: Angi reports self-reported trade license `2024264` expiring 2026-12-31; BuildZoom says it could not verify the license. The Alabama HACR lookup requires interactive criteria and a verification code, so this audit did not verify either number. | Current Alabama HACR license certificate or primary-source lookup is retained; website, schema, GBP where applicable, and major citations show the correct identifier and licensee name. | Owner/compliance |
| FN-01 | P0 | Pause and correct specific financing advertising after lender/compliance review. | Verified-live: the page advertises a 180-month term at `8.99% interest`, says a `$10,000` system would be `$99/month` using a `1% payment factor`, and advertises `12 months, no interest, no payment`. One percent of $10,000 is $100, not $99; a standard fully amortizing 180-month payment at 8.99% is approximately $101.37, so the example cannot be validated from the stated terms. Verified-official: CFPB Regulation Z requires advertised credit terms to be actually available, clear/conspicuous, and accompanied by additional disclosures when triggering terms such as payment amount or repayment period are used. | Lender supplies current approved creative and complete terms; owner/counsel approves it; arithmetic reproduces; `APR`/repayment/deferred-interest details are accurate and proximate; expired offers cannot remain live. | Owner + lender + counsel/compliance |
| SD-01 | P1 | Replace copied AC-repair service schema. | Verified-live: `/ac-repair/` emits a `Service` named "HVAC Repair & Installation" whose `@id` and URL point to `/hvac-services/`; its FAQ `@id` also points there. | AC repair schema names AC repair, uses the AC repair canonical and unique `@id`, accurately describes offered work, and references the canonical business entity. Page-to-markup parity is manually checked; Schema.org Validator passes. Rich Results Test is used only for Google-supported result types, not as a substantive test of generic `Service` schema. | Developer/SEO |
| SD-02 | P1 | Make FAQ markup exactly match visible questions and answers, or remove it. | Verified-live: AC repair, HVAC services, indoor-air-quality, and ductwork FAQ JSON-LD differs from the visible FAQ headings. Verified-official: structured data must be a true representation of visible page content. Google generally limits FAQ rich results to authoritative government and health sites, so the markup has little commercial upside. | For every marked-up FAQ, visible question and answer text matches JSON-LD in meaning and scope; otherwise no FAQ schema is emitted. | Developer/content |
| CL-01 | P0 | Rewrite unsupported IAQ and health-adjacent claims. | Verified-live: the IAQ page says the right equipment can "eliminate nearly all pollution and allergens." Verified-official: EPA says filters and air cleaners can reduce some pollutants but cannot remove all pollutants; source control and ventilation remain primary. | Claims describe the specific device, pollutant/particle type, test basis, conditions, and limitations. General medical-symptom claims are removed or supported by an appropriate source and disclaimer. | Content + owner |
| SF-01 | P0 | Put life-safety stop conditions before heating-repair conversion copy. | Verified-live: the heating page lists "unusual smells" among repair signs and routes users to 24/7 contractor service without distinguishing fuel gas or CO emergencies. Verified-official: CPSC says suspected gas leaks require leaving immediately and calling the gas supplier or 911 from outside; suspected CO poisoning requires fresh air and 911. | Page, chat, booking, and call scripts put emergency authority/utility routing before contractor conversion for gas odor, CO alarm/symptoms, active fire, flooded/energized equipment, and electrical arcing/shock. Ordinary HVAC odors/problems are discussed only after those boundaries. | Operations + safety reviewer + content |
| RV-00 | P0 | Replace positive-sentiment review gating with a neutral, working request page. | Verified-live: `/review-us/` says "If you liked our service" and asks only customers who experienced the company's "triumphs"; prompts emphasize the best thing, recommendation, and reuse. Its Yelp, Google, and Facebook buttons all use `href="#"`. Verified-official: Google prohibits soliciting content that does not reflect a genuine experience and prohibits rating manipulation. | Every customer receives the same neutral request regardless of sentiment; prompts ask for an honest account without steering; working links go to approved platform destinations; unhappy feedback is not diverted; channel consent, opt-out, suppression, deduplication, and frequency caps are tested. | Operations + developer |
| IX-01 | P1 | Noindex and remove low-value utility/archive URLs from XML sitemaps. | Verified-live: `/thank-you/`, `/author/ryno419/`, and `/author/ryno-content/` return 200 and are indexable; the author pages have no meta description, share `Our Blog` as H1, and expose no useful authored content. | Thank-you and empty author archives return `noindex,follow`, are absent from XML sitemaps, and are not internally promoted. Decide separately whether `/review-us/` and privacy need indexing. | Developer/SEO |
| UX-01 | P1 | Fix the homepage reviews URL. | Verified-live: "View All Reviews" uses `/testimonials/ ` with trailing whitespace; the encoded path redirects to the homepage, not the testimonials page. | CTA resolves directly to `https://gettodayair.com/testimonials/` with one 200 response. | Developer |
| CV-01 | P1 | Separate emergency conversion from long-form lead capture. | Verified-live: the footer/sidebar form requires first name, last name, phone, email, message, and SMS consent through ARIA validation. Emergency users already have prominent tap-to-call and booking paths. | Emergency CTA calls the dispatch number; booking opens Housecall Pro; estimate/contact form uses the minimum operational fields. Marketing consent is separated from transactional contact and reviewed by counsel/vendor. | Owner + developer |
| CV-02 | P1 | Add form autocomplete and clearer response expectations. | Verified-live: name, phone, and email inputs expose no `autocomplete` tokens. Copy promises fast and 60-second booking but does not consistently say when a submitted form will be answered. | Inputs use appropriate autocomplete tokens; confirmation and adjacent copy state channel-specific response expectations without guaranteeing unavailable response times. | Developer/operations |
| ON-01 | P1 | Clarify offers and service-call language. | Verified-live: homepage says `$89 flat service call - waived if we're late`; another offer says Lee County service-call fee is waived; pages also promote free estimates. | A plain-language pricing block distinguishes diagnostic/service-call fee, repair estimate, replacement estimate, after-hours fee, geographic eligibility, expiration, and combination rules. Claims match dispatch and invoicing rules. | Owner/content |
| SD-03 | P1 | Build one canonical HVAC business entity and extend it carefully. | Verified-live: homepage entity has name/address/logo but no telephone, geo, opening hours, area served, or `sameAs`; service pages have a different handcrafted entity shape; major trust/location pages have no JSON-LD. KML lacks phone and coordinates. | One `@id` is reused sitewide. Verified name, canonical phone, eligible address, URL, logo, `sameAs`, geo, hours, and service areas are included only after owner approval. Location/service pages reference the entity rather than inventing new businesses. | Developer/SEO |
| LA-01 | P1 | Rebuild the service-area hub around real operating coverage. | Verified-live: hub H1 is only "Proudly Serving," title lacks Auburn/East Alabama, and the site lists many towns across six counties but has only Opelika and Phenix City detail pages. | Hub explains dispatch base, primary/secondary coverage, service types, scheduling limitations, and links only to approved location pages. Title/H1 identify the real region. | Operations + content |
| LA-02 | P1 | Strengthen—not clone—the Opelika and Phenix City pages. | Verified-live: both pages are substantial but structurally similar, target mainly AC repair/installation, lack local schema, and the Phenix City page exposes duplicated FAQ heading sets. | Each page has verified local job proof, locally relevant logistics, real services, unique FAQs, a local review/project, correct heading structure, canonical entity reference, and no unsupported office/location claim. | Content + developer |
| IA-01 | P1 | Add breadcrumbs and a deliberate service hierarchy. | Verified-live: pages have no visible breadcrumb or `BreadcrumbList`; the homepage "System Replacement & Installation" card points to the generic HVAC hub instead of the existing AC installation page. | Home > Service/Area > Page breadcrumbs are visible and marked up; cards and contextual links point to the most specific intent-matching URL. | Developer/SEO |
| GBP-01 | P1 | Complete a controlled GBP audit with owner access. | Public data is strong, but categories, services, service areas, canonical secondary phone, call history, edits, and performance cannot be fully verified publicly. | Export/screenshot records primary and secondary categories, services, address mode, 20-or-fewer accurate service areas, hours, canonical plus tracking phones, booking URL, UTM rules, users, and change log. | Owner + GBP manager |
| RV-01 | P1 | Continue compliant review acquisition and response. | Verified-live: 61-review 5.0 profile and owner replies are a strong asset. Verified-official: reviews should reflect genuine experience; incentives and review manipulation are prohibited. | Every completed job receives a neutral review request; no incentive, gating, or requested sentiment; response SLA and escalation policy are documented; review topics feed service-page improvements. | Operations |
| DG-01 | P1 | Approve a data-governance design before joining analytics, calls, bookings, and CRM records. | The measurement plan spans GA4, GBP, Invoca, Housecall Pro, and the CRM. Those systems can contain phone numbers, recordings/transcripts, addresses, appointment details, and customer outcomes. Verified-official: FTC guidance recommends data minimization, need-to-know access, retention/deletion rules, and written vendor-security requirements. | A field-level data map documents purpose, lawful/contractual basis, consent/notice, recording rules, source of truth, roles, access, encryption, retention, deletion/backups, incident response, vendor use, and prohibited fields. Only approved pseudonymous IDs and necessary fields are joined. Synthetic tests cover consent refusal, suppression, deletion, unauthorized access, and PII leakage to URLs/analytics/ad dimensions. | Owner + privacy/security + vendors |
| CT-01 | P2 | Publish an evidence-led Auburn answer library. | Inference from observed SERPs and Google's AI guidance: competitors expose repair-vs-replace, compressor cost, mini-split, and service-specific resources; TodayAir has no useful public blog/library despite indexable empty author archives. | Publish only owner-reviewed, technically sourced articles with a direct answer, Auburn context, named reviewer, last-reviewed date, internal links, and a conversion path. | Technical reviewer + content |
| PR-01 | P2 | Add local project and proof pages. | The site has strong reviews and branded imagery but little indexable first-party job evidence. Unique local proof is harder to commoditize and supports both customers and search systems. | Each approved case study includes city (not private address), system/problem, diagnosis, options, work performed, measured outcome where available, technician/reviewer, photos with permission, and related-service link. | Operations + content |
| AU-01 | P2 | Improve meaningful image text alternatives and mobile menu labeling. | Verified-live: many empty-alt images are decorative, but meaningful family/service imagery also lacks useful alternatives; the mobile menu button had no accessible name in the browser accessibility tree. | Decorative images remain empty-alt; informative images have concise purpose-based alt; mobile menu has an accessible name and state. | Developer/content |
| CWV-01 | P2 | Establish a field-performance baseline before optimization. | Core Web Vitals were not verified. The public PageSpeed API returned quota exhausted during this audit, and browser timing from one session is not a valid field baseline. | Search Console CWV export plus repeatable mobile Lighthouse tests for key templates are saved; work is prioritized by LCP, INP, CLS, and conversion impact. | Developer/SEO |

## Page-level recommendations

| URL | Keep | Change next |
| --- | --- | --- |
| `/` | Strong Auburn title/H1, mobile hero, differentiated promise, service cards, reviews, offers, service coverage. | Fix reviews URL; reconcile entity data; make pricing language unambiguous; link installation card to the specific installation page; consider a concise emergency decision block. |
| `/hvac-services/` | Useful service hub and Auburn relevance. | Ensure it remains a hub rather than competing with every child page; align visible/schema FAQs; add paths to installation, repair, maintenance, heat-pump/ductless pages only if real. |
| `/ac-repair/` | Good symptom, diagnostics, urgency, and Auburn content. | Correct copied Service/FAQ schema; replace generic/cross-service diagnostic language; substantiate same-day and 24/7 availability; explain refrigerant leak/recharge process accurately. |
| `/ac-installation/` | Clear installation intent and comparatively well-aligned schema. | Add verified load-calculation/sizing process, efficiency/options decision framework, permit/rebate caveats, warranties, and project proof. ENERGY STAR recommends proper sizing using Manual J. |
| `/heating-repair/` | Clear Auburn heating-repair intent and aligned visible/schema questions. | Clarify furnace vs heat-pump capability, emergency safety boundaries, brands/equipment actually serviced, and repair-vs-replace criteria. |
| `/indoor-air-quality/` | Useful topic coverage and Auburn humidity relevance. | Remove absolute pollutant/allergen and symptom claims; distinguish filtration, source control, ventilation, humidity, UV, and testing; cite EPA/technical sources. |
| `/ductwork/` | Clear duct repair/cleaning/airflow intent. | Align FAQ schema; distinguish inspection, sealing, repair, replacement, and cleaning; avoid implying cleaning is universally needed; add diagnostic proof. |
| `/maintenance-plan/` | Concrete membership value and conversion intent. | Add exact inclusions/exclusions, renewal/cancellation, priority meaning, equipment limits, service-area eligibility, and `Service`/`Offer` markup only where accurate. |
| `/service-areas/` | Broad coverage signal and links to two city pages. | Use an Auburn/East Alabama title/H1, organize primary vs secondary coverage, and remove or qualify towns not supported by dispatch/job evidence. |
| `/service-areas/opelika-al/` | Substantial local page with repair/installation information. | Add unique operating proof, full real service coverage, route expectations, local project/review, canonical entity reference, and owner-reviewed FAQ. |
| `/service-areas/phenix-city-al/` | Substantial city page. | Remove duplicate FAQ heading structure, strengthen genuinely unique Phenix City evidence, and confirm the travel/service promise. |
| `/about-us/` | Excellent founder story, Auburn ties, family detail, and trust positioning. | Add verified license/certification/insurance language, named technician credentials where permitted, editorial reviewer information, and appropriate Organization/person relationships. |
| `/contact-us/` | Clear contact path. | Add Auburn in title/description, distinguish office visits from field service, state response expectations, and ensure identity/hours match GBP. |
| `/testimonials/` | Useful first-party display of Google-attributed reviews. | Fix inbound homepage link; link to the source profile where appropriate; add review date/service context when available; do not add self-serving aggregate-rating schema. |
| `/review-us/` | A dedicated feedback path can support review velocity. | Replace positive-only framing with a neutral request, remove leading prompts, repair all platform links, and make the same request available to every customer. Consider `noindex` because this is a utility/conversion page. |
| `/financing/` | Financing can reduce purchase friction and the page identifies the lender. | Do not publish or promote the current numerical example until lender/compliance approval. Correct math; use APR and complete repayment/deferred-interest disclosures as applicable; add effective/expiry dates and an owned review process. |

## Recommended information architecture

Do not create every possible page immediately. Confirm services and job economics first.

```text
Home / Auburn HVAC
├── HVAC Services
│   ├── AC Repair
│   ├── AC Installation & Replacement
│   ├── Heating Repair
│   ├── Maintenance / Total Care
│   ├── Indoor Air Quality
│   └── Ductwork & Airflow
├── Service Areas
│   ├── Opelika
│   └── Phenix City
├── Projects / Local Work
├── HVAC Answers
├── Reviews
├── About
└── Contact / Book
```

Potential service pages should be released only if TodayAir actually offers them, has qualified technicians, and can supply distinct proof:

- Heat-pump repair and installation.
- Ductless mini-split service.
- Heating/furnace installation.
- Thermostat and controls.
- Emergency HVAC service.
- Commercial/light-commercial HVAC, if it is genuinely staffed and strategically desired.

## Answer-engine and content plan

Google's current guidance says there is no special technical requirement for AI Overviews or AI Mode beyond eligibility in normal Search and helpful, reliable, people-first SEO. Treat "AEO" as a content and evidence discipline, not a separate ranking loophole.

### First six answer assets

1. **AC running but not cooling in Auburn: safe checks before you call.** Include thermostat/filter/breaker/condensate checks, explicit stop conditions, and no DIY refrigerant/electrical instructions.
2. **AC repair versus replacement in Auburn.** Explain age, repair history, comfort, load/sizing, refrigerant/equipment availability, warranty, and financing without fabricated cost ranges.
3. **What an Auburn AC diagnostic visit includes.** Show the real TodayAir procedure, what the service-call fee covers, what is quoted separately, and what evidence the homeowner receives.
4. **Why Auburn homes feel humid even when the AC runs.** Explain sizing, runtime, duct leakage, ventilation, drainage, and measurement; avoid diagnosing from symptoms alone.
5. **Heat pump versus conventional cooling/heating for East Alabama.** Cover use cases, sizing, backup heat, ductwork, comfort, and current incentive links reviewed at publication time.
6. **HVAC maintenance checklist for Alabama seasons.** Separate homeowner-safe tasks from licensed work and connect to the maintenance plan without turning the article into an ad.

### Required content contract

Every answer page should contain:

- A concise direct answer near the top, at the length required for accuracy; no arbitrary word count is an AI-visibility requirement.
- "When to stop and call" safety boundaries.
- Local context that can be verified, not just city-name substitution.
- Named technical reviewer and last-reviewed date.
- Source links for health, safety, energy, regulatory, and incentive claims.
- Photos, diagrams, or job evidence TodayAir owns or has permission to use.
- A relevant service CTA and two or three contextual internal links.
- No invented pricing, savings, response time, warranty, certification, or service-area fact.

## 30/60/90-day implementation plan

### Days 0-7: identity and risk closure

1. Owner approves the business-identity record and supplies the current HACR license evidence.
2. Reconcile GBP address mode, hours, canonical/trackable phone configuration, and website disclosures.
3. Fix the reviews link.
4. Noindex/remove utility and empty author archives from sitemaps.
5. Correct or remove mismatched Service/FAQ schema.
6. Rewrite IAQ overclaims and review all absolute promises: same-day, 24/7, 100%, free, no fee, waived if late, and 60 seconds.
7. Replace the financing example with current lender-approved terms, repair and neutralize the review-request page, and add heating gas/CO emergency instructions.

P0 release gate: no unresolved identity, license, address-eligibility, financing-ad, review-gating, IAQ-claim, or life-safety issue remains. Before adding new service/location pages, the P1 schema/content-parity and index-hygiene defects must also be closed.

### Days 8-30: conversion and local relevance

1. Complete the owner-access GBP audit and preserve its strong posts, media, reviews, replies, and booking.
2. Simplify contact paths and distinguish emergency calls, online booking, and non-urgent estimate requests.
3. Rework service-area hub and improve Opelika/Phenix City pages with actual operating proof.
4. Add breadcrumbs and correct intent-level internal links.
5. Add verified business/entity data and repair the KML location feed or remove it if it cannot be maintained.
6. Approve the field-level privacy/security design, then establish only the necessary GSC, GA4, GBP, Invoca, Housecall Pro, and CRM measurement joins.

Release gate: every published location/service claim has an owner, evidence, review date, and conversion path.

### Days 31-60: proof and answer assets

1. Publish two local project case studies.
2. Publish the first three answer assets after technical review.
3. Add original team/job photography with permissions and meaningful alt text.
4. Run field/lab performance baseline and fix the largest template bottlenecks.
5. Clean major citations after canonical NAP is approved; do not bulk-change tracking numbers without the call-tracking plan.

### Days 61-90: expansion by evidence

1. Publish the next three answer assets.
2. Add at most one or two service/location pages justified by booked-job data and operational capacity.
3. Build local links through real partnerships, suppliers/manufacturers, chambers/associations, community work, and project attribution—never purchased link schemes.
4. Compare page/query/lead cohorts and keep, revise, consolidate, or retire work based on evidence.

## Measurement and attribution

### Owner-access data required before a numeric forecast

- Search Console: 16 months of page/query/device/country performance, indexing, manual actions, links, and Core Web Vitals.
- Google Business Profile: search terms, calls, bookings, website clicks, directions, messages, photos, and profile edits.
- GA4 or equivalent: organic landing pages, engaged sessions, form starts/completions, tap-to-call, booking opens, and booking completions.
- Invoca: canonical number, number pools, source replacement rules, session/cookie expiry, spam filtering, and call outcomes.
- Housecall Pro/CRM: lead source, job type, service area, booked rate, completed revenue, cancellations, and repeat/customer-plan status.
- Operations: actual after-hours coverage, average response windows, service-area capacity, technician qualifications, warranties, offer rules, and current license/insurance.

### KPI hierarchy

1. **Business outcomes:** qualified calls/bookings, booked-job rate, completed jobs, gross margin by service/area, and membership enrollments.
2. **Conversion diagnostics:** call answer rate, booking completion, form completion, lead-to-booked rate, and landing-page conversion by device.
3. **Search outcomes:** non-brand clicks/impressions, qualified query groups, page coverage, local-profile actions, review velocity, and citation accuracy.
4. **Quality controls:** indexable utility URLs, schema mismatches, claim-review age, Core Web Vitals, broken links, and accessibility regressions.

Use tagged booking/website URLs consistently, preserve the original landing page and source into the CRM, and report both leads and booked/completed work. Do not treat rankings, impressions, or raw calls as revenue.

Before any cross-system join, document the customer notice/consent path, call-recording/transcription rules, fields transferred, processors/vendors, access roles, retention/deletion, and incident response. Prefer pseudonymous event or lead IDs over copying phone numbers, recordings, message bodies, or addresses into analytics.

## Validation checklist

- [x] Public crawl and status-code checks completed.
- [x] Desktop and mobile rendered UX inspected.
- [x] Online booking opened successfully; no form submitted.
- [x] Public Google Maps profile inspected.
- [x] Titles, descriptions, H1s, canonicals, robots, sitemaps, KML, and JSON-LD sampled across all principal templates.
- [x] Official-source policy and safety checks performed.
- [ ] Search Console/analytics/CRM/call-tracking evidence supplied by owner.
- [ ] Official license evidence supplied and verified.
- [ ] GBP address eligibility and hours approved by owner.
- [ ] Rich Results Test and Schema.org Validator rerun after corrections.
- [ ] Core Web Vitals field data and controlled Lighthouse baseline captured.
- [x] Independent adversarial review completed against this audit; high-severity omissions were revalidated and added before delivery.

## Volatile-observation appendix

Public facts below record their observation conditions so they can be rechecked. HTML digests are change detectors for responses retrieved at `2026-08-28T02:41:59Z`; the source bodies and browser screenshots are not stored in this audit, so the hashes do not independently prove historical content. CDN optimization, personalization, or later edits may change a digest without changing the underlying finding.

| Claim group | Method and conditions | Observation and change detector | Recheck trigger |
| --- | --- | --- | --- |
| Homepage phone/booking/mobile UX | Rendered in the Codex in-app Chromium browser; 390x844 responsive check; no form submission. | Invoca scripts were present; rendered phone `334-779-7835`; Housecall Pro booking dialog opened. Homepage SHA-256 `4f49ed35aecb46336b5ae659b2238ae431c7fcbb05549a1bbfff5cfebe27ca84`. | Template, call-tracking, booking, or phone change. |
| Public Google profile | Google Maps query `TodayAir Auburn AL`; public profile viewed in an existing browser session; locale shown as Canada, so this is not an Auburn rank test. | Business `TodayAir`; category `HVAC contractor`; 5.0/61 reviews; address `1021 Ronald Ln`; `Open 24 hours`; phone `334-956-6300`; booking, recent post, owner replies, and photos present. | Any GBP edit or monthly audit. |
| Static entity and AC schema | Direct HTTPS fetch plus JSON-LD parse. | Static phone `334-454-3447`; copied AC `Service`/FAQ identifiers observed. AC repair SHA-256 `f357fbc65e4e92ccc2329893db7681591eda22c1253581bd328a94461b8bf87e`. | Schema/plugin/template deployment. |
| Financing claims | Direct HTTPS fetch and arithmetic reproduction. | 180 months, 8.99% interest, `$99/month`, `1% payment factor`, and `12 months, no interest, no payment` observed. One percent of $10,000 = $100; standard amortization from the stated principal/rate/term = approximately $101.37. Page SHA-256 `bbd4989d88906ee2a160a7bd597808509e96de706e5f9f7a096b2331dc6377f5`. | Lender offer, disclosure, or page change. |
| Review-request policy/links | Direct HTTPS fetch and anchor inspection. | Positive-only framing and leading prompts observed; Yelp/Google/Facebook anchors all `href="#"`. Page SHA-256 `32a47c447cc6204424c54427f4630e65ad5eb88de68ebef25565e5b989405703`. | Review SOP/page/vendor change. |
| Heating safety | Direct HTTPS fetch and visible-copy extraction. | `Unusual smells` routed into repair/24-7 copy without gas/CO stop condition. Page SHA-256 `ba7b0af6ab2cbf1ccb5256f18c39badd0380aafc034dbb5d6218f864c3b9487c`. | Heating/emergency copy or call-script change. |
| IAQ claims | Direct HTTPS fetch and visible-copy extraction. | `eliminate nearly all pollution and allergens` and health-symptom language observed. Page SHA-256 `021360fa022fd7a1aef2af8d209d4d426ec286e8ca8fb8d09a8989c7e799d0c6`. | IAQ copy/product change. |
| Crawl/location feeds | Direct HTTPS fetch. | Robots SHA-256 `91d6c28fde9760fc6ce8a9bbb84d724136fd42098cd68f2c20c287af8f23393e`; sitemap index `6c59ce5f0753bcfb344450b409afd07b145a2705cda4227e1d36aab481c5d349`; KML `649b3f99dd08e40b89defbcae7d97576188e502c6ce1c3c86205fdd71c8de9d4`. | SEO plugin, index policy, location, or sitemap change. |

The independent adversarial reviewer rechecked the financing, review-request, heating-safety, privacy, schema, FAQ, IAQ, indexability, testimonials-link, KML, license, and hours findings. Its initial verdict was blocked for implementation because financing, review gating, life safety, and data governance were omitted. Those four items were then independently revalidated and added as `FN-01`, `RV-00`, `SF-01`, and `DG-01`; medium findings on causal language, priority sequencing, evidence preservation, and arbitrary answer length were also corrected. The final independent recheck returned **READY**, with no unresolved BLOCKER or HIGH item; it retained a non-blocking limitation that raw HTML and browser screenshots were not stored with the audit.

## Source registry

### Audited property

- [TodayAir homepage](https://gettodayair.com/)
- [AC repair](https://gettodayair.com/ac-repair/)
- [AC installation](https://gettodayair.com/ac-installation/)
- [Heating repair](https://gettodayair.com/heating-repair/)
- [HVAC services](https://gettodayair.com/hvac-services/)
- [Indoor air quality](https://gettodayair.com/indoor-air-quality/)
- [Ductwork](https://gettodayair.com/ductwork/)
- [Service areas](https://gettodayair.com/service-areas/)
- [About TodayAir](https://gettodayair.com/about-us/)
- [Reviews](https://gettodayair.com/testimonials/)
- [XML sitemap index](https://gettodayair.com/sitemap_index.xml)

### Official sources

- [Google: tips to improve local ranking](https://support.google.com/business/answer/7091?hl=en)
- [Google: guidelines for representing your business](https://support.google.com/business/answer/3038177?hl=en)
- [Google: manage service areas](https://support.google.com/business/answer/9157481?hl=en)
- [Google: prohibited and restricted Business Profile content](https://support.google.com/business/answer/7400114?hl=en)
- [Google Search: LocalBusiness structured data](https://developers.google.com/search/docs/appearance/structured-data/local-business)
- [Google Search: general structured-data guidelines](https://developers.google.com/search/docs/appearance/structured-data/sd-policies)
- [Google Search: AI features and your website](https://developers.google.com/search/docs/appearance/ai-features)
- [Google Search: FAQ rich-result changes](https://developers.google.com/search/blog/2023/08/howto-faq-changes)
- [Alabama HACR Board: consumer license lookup entry point](https://hacr.alabama.gov/consumers/)
- [CFPB: Regulation Z, advertising](https://www.consumerfinance.gov/rules-policy/regulations/1026/24/)
- [CPSC: carbon-monoxide safety](https://www.cpsc.gov/Safety-Education/Safety-Education-Centers/Carbon-Monoxide-Information-Center)
- [CPSC: gas-connector and suspected-leak safety](https://www.cpsc.gov/s3fs-public/gas.pdf)
- [FTC: protecting personal information](https://www.ftc.gov/business-guidance/resources/protecting-personal-information-guide-business)
- [US EPA: indoor air quality](https://www.epa.gov/report-environment/indoor-air-quality)
- [US EPA: air cleaners and filters in the home](https://www.epa.gov/indoor-air-quality-iaq/air-cleaners-and-air-filters-home)
- [ENERGY STAR: proper HVAC sizing and Manual J](https://www.energystar.gov/products/ductless_heating_cooling)

### Secondary sources used only as conflict indicators

- [Angi TodayAir profile](https://www.angi.com/companylist/us/al/auburn/today-air-reviews-72879633.htm)
- [BuildZoom TodayAir profile](https://www.buildzoom.com/contractor/todayair)

## Explicit limitations

- Public Google Maps facts are a point-in-time observation and can change.
- Non-localized web-search results are directional and are not a local rank-grid test.
- Third-party license and directory data is not authoritative.
- Public HTML cannot prove whether tracking numbers are configured correctly inside GBP, Invoca, analytics, or the CRM.
- Page length and schema presence do not prove usefulness, ranking, or conversion.
- No private customer data, form submission, admin login, Search Console, analytics, CRM, or hosted control-plane action was used.
