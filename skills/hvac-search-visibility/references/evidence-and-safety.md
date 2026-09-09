# Evidence, authority, and safety model

Read this reference for every substantive use of the skill.

## Two complementary classifications

Classify both the evidence source and the action it supports.

### Source family

| Code | Source family | What it can establish |
|---|---|---|
| `R` | Law, regulator, or enforcement guidance | A scoped legal/compliance boundary; not individualized advice. |
| `P` | Owning-platform policy or first-party guidance | Rules, eligibility, and documented product behavior for that platform. |
| `S` | Standard or official vocabulary | Interoperability or design criteria; not ranking causation. |
| `O` | Official HVAC, energy, product, safety, or program owner | Technical facts within the source's product, activity, and jurisdiction. |
| `E` | Empirical research with disclosed method | Observed effects and uncertainty within the study design. |
| `X` | Practitioner hypothesis or experiment | A test candidate only. |

### Operating disposition

| Label | Meaning | Required treatment |
|---|---|---|
| `[REQ]` | Explicit rule or requirement in scope | Cite the owner and block the affected action when evidence is missing. |
| `[REC]` | Official recommendation or robust operating default | Adopt by default or document why it does not fit. |
| `[ELIG]` | Eligibility condition without outcome guarantee | Never promise display, ranking, traffic, badge, or lead. |
| `[HYP]` | Contractor-market hypothesis | Define baseline, outcome, confounders, and stop rule. |
| `[EXP]` | Emerging or unstable tactic | Isolate, cap effort/risk, and keep it out of core dependencies. |

Every material recommendation should resolve to both classifications inline or
through an explicit crosswalk.

## Source hierarchy

Prefer, in order:

1. the platform that owns the feature or policy;
2. legislation, regulator, utility, municipality, or program owner;
3. the standards or certification body that owns the vocabulary/credential;
4. peer-reviewed or author-published research with inspectable methods;
5. practitioner material as a hypothesis only.

Record the URL, checked date, jurisdiction/product scope, limitation, recheck
trigger, and contractor-specific evidence needed. Browse current sources for
every live engagement: search features, Business Profile rules, review policy,
licenses, rebates, accessibility duties, privacy, recording, consent, and AI
reporting can change.

## Contractor truth register

Do not publish or change live systems until an authorized owner can prove:

- canonical business name and ownership;
- each legitimate staffed/customer-facing location and hidden-address status;
- actual service areas and drive-time constraints;
- actual service and negative-scope catalog;
- staffed hours, after-hours behavior, and response-time wording;
- license, insurance, certification, badge, manufacturer relationship, holder,
  scope, territory, status, expiry, and verification source;
- warranty, guarantee, price, financing, savings, rebate, and tax language;
- equipment combinations and performance evidence;
- customer consent for photos, case studies, testimonials, and public details;
- ownership of domains, phone numbers, profiles, analytics, CRM, booking, and
  call-tracking systems.

Missing evidence blocks only the affected claim or action; it does not grant
permission to invent a placeholder that looks real.

## Safety-content boundary

Classify every proposed answer, article, diagnostic, chatbot instruction, or
conversion component.

| Class | Typical material | Treatment |
|---|---|---|
| Green | bounded filter/thermostat/clearance checks | Homeowner steps may be appropriate with manufacturer and system caveats. |
| Amber | symptoms with multiple causes, water/ice/noise, airflow, breaker or vent observations | Limit to observation, safe stop points, and professional escalation; qualified technical review required. |
| Red | gas odor, CO alarm/symptoms, fire, refrigerant, combustion controls, electrical panels, flooded equipment, lead/asbestos/mould, confined space | Do not provide repair instructions. Use live local emergency/regulator/utility guidance and route away from sales. |

Emergency UX must:

- tell occupants to leave immediately when the owning local authority does;
- direct contact from a safe location to the appropriate emergency service and
  utility;
- prohibit re-entry until the responsible authority says it is safe;
- avoid forms, account creation, tracking consent, AI chat, or the contractor's
  sales queue as a prerequisite;
- be localized and approved before publication.

Representative sources to recheck, not universal wording:

- [Ontario carbon-monoxide safety](https://www.ontario.ca/page/carbon-monoxide-safety)
- [Enbridge Gas Ontario gas-leak safety](https://www.enbridgegas.com/ontario/safety/smell-gas)
- [U.S. CPSC carbon-monoxide guidance](https://www.cpsc.gov/Safety-Education/Safety-Education-Centers/Carbon-Monoxide-Information-Center)

## Claims and credentials

- Separate technician certification, contractor/business license, local permit,
  insurance, manufacturer authorization, product certification, and platform
  screening. Never collapse them into “licensed and certified.”
- A platform badge is not government approval or a quality/ranking guarantee.
- Matched-system ratings do not establish field performance in every home.
- Scope savings, comfort, IAQ, duct-cleaning, environmental, payback, warranty,
  and “best” claims to the evidence and assumptions.
- Treat rebate and tax content as volatile. Name the program owner, checked
  date, eligibility authority, expiration/recheck point, and customer-confirmation
  requirement.

Useful primary sources to recheck:

- [EPA Section 608](https://www.epa.gov/section608/section-608-technician-certification)
- [EPA air cleaners and filters](https://www.epa.gov/indoor-air-quality-iaq/air-cleaners-and-air-filters-home)
- [EPA duct-cleaning guidance](https://www.epa.gov/indoor-air-quality-iaq/should-you-have-air-ducts-your-home-cleaned)
- [ENERGY STAR contractor guidance](https://www.energystar.gov/saveathome/heating-cooling/10-tips-hiring)
- [AHRI directory](https://www.ahridirectory.org/)
- [Competition Bureau misleading-claims guidance](https://competition-bureau.canada.ca/en/deceptive-marketing-practices/types-deceptive-marketing-practices/false-or-misleading-representations-and-deceptive-marketing-practices)

## Data-governance gate

Before analytics, call tracking, CRM joins, recordings, transcripts, session
replay, ad uploads, or AI processing, record for every field and identifier:

- customer/operating purpose and minimum necessary value;
- collection surface, destination, vendor, and processing region;
- jurisdiction-specific notice, consent/lawful basis, and opt-out;
- read/export/correct/delete roles;
- retention, deletion, backup, legal-hold, and incident ownership;
- recording/transcription controls;
- contract and credential owner.

Prohibit residential addresses, contact details, free-text problems, recordings,
and stable lead IDs in URLs, ad parameters, analytics dimensions, public logs,
public research, or AI prompts by default. Specify synthetic tests for consent
refusal, opt-out, access, deletion, suppression, least privilege, retention,
recording, session-replay masking, incident routing, and PII leakage. Do not say
those tests passed until they ran against an authorized implementation.

## Core platform sources to recheck

- [Google Business Profile representation rules](https://support.google.com/business/answer/3038177?hl=en)
- [Google service-area rules](https://support.google.com/business/answer/9157481?hl=en)
- [Google local ranking explanation](https://support.google.com/business/answer/7091?hl=en)
- [Google review policy](https://support.google.com/contributionpolicy/answer/7400114?hl=en)
- [Google Search spam policies](https://developers.google.com/search/docs/essentials/spam-policies)
- [Google AI optimization guide](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide)
- [Google LocalBusiness structured data](https://developers.google.com/search/docs/appearance/structured-data/local-business)
- [Google review snippets](https://developers.google.com/search/docs/appearance/structured-data/review-snippet)
- [Google Search documentation updates](https://developers.google.com/search/updates)
- [OpenAI publisher and crawler FAQ](https://help.openai.com/en/articles/12627856-publishers-and-developers-faq)
- [FTC consumer reviews rule Q&A](https://www.ftc.gov/business-guidance/resources/consumer-reviews-testimonials-rule-questions-answers)
- [WCAG 2.2](https://www.w3.org/TR/WCAG22/)
