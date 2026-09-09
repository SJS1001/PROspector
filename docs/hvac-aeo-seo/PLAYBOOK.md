# HVAC search and answer visibility playbook

This playbook turns the curated evidence in [`README.md`](README.md) into a
bounded operating sequence. It assumes no platform access, spend authority,
production data, or publishing authority. Those must be granted separately by
the contractor.

## Definition of success

The program succeeds when it increases **qualified, serviceable, profitable
booked work** without misrepresenting the business, creating unsafe guidance,
violating platform or review policies, degrading customer experience, or
producing demand the operation cannot serve.

Rankings, impressions, page counts, generated articles, schema scores, AI
mentions, and citation counts are supporting signals, not the outcome.

## Roles and approvals

| Role | Owns | Cannot silently delegate |
|---|---|---|
| Business owner | services, service areas, pricing posture, promises, budget, publication, review policy | legal claims, license truth, warranties, publishing authority |
| Service manager | technical accuracy, safety boundary, diagnostic process, dispatch reality | approval of technical or emergency guidance |
| Marketing lead | research, briefs, profile maintenance, editorial calendar, reporting | fabricating operating facts or approving technical claims |
| Web owner | crawlability, accessibility, structured data, tracking, releases | production deploys without the site's release process |
| Legal/compliance adviser | jurisdiction-specific advertising, consent, recording, telemarketing, promotions | business operating decisions |

One person may hold several roles, but each approval remains explicit.

## Stage 0 — Evidence inventory and stop conditions

### Collect

- exact legal and public business names;
- each real staffed location and whether customers are received there;
- true service areas and practical drive-time boundaries;
- service catalog and services explicitly not offered;
- staffed hours, call-answering coverage, after-hours process, and realistic
  response language;
- licenses, insurance, certifications, manufacturer relationships, and expiry
  or verification sources;
- warranty and guarantee terms;
- brands and equipment actually serviced or installed;
- existing Business Profiles, Local Services Ads, directories, website,
  analytics, Search Console, call tracking, booking, and CRM ownership;
- historical lead, booking, revenue, gross-profit, capacity, and seasonality
  data available for lawful use;
- existing photos, projects, testimonials, and customer permissions.

### Stop if

- profile ownership or business identity is disputed;
- a location is virtual, unstaffed, or ineligible;
- the website, phone numbers, or analytics are controlled by an uncooperative
  third party;
- licenses, insurance, certifications, promises, or review provenance cannot be
  verified;
- the business cannot identify who approves technical and safety content;
- publishing would expose customer information or a hidden residential address;
- the business wants fake reviews, review gating, fake locations, or doorway
  pages.

### Deliverables

- evidence register with owner, source, last verified date, expiry, and public
  display permission;
- location and service-area truth table;
- service catalog and negative-scope list;
- risk register and unresolved owner decisions.

## Stage 1 — Data governance and measurement baseline

Do not implement tracking merely because a metric appears in this playbook.
Complete the data-governance gate before broad content changes or production
measurement.

### Blocking data-governance gate

For every field, identifier, recording, transcript, event, and join, record:

- the customer and operating purpose;
- the minimum collected value and whether it can be omitted, coarsened, or
  generated server-side;
- the collection surface and every destination system, vendor, region, and
  downstream recipient;
- the jurisdiction-specific lawful basis, notice, consent, and opt-out rule;
- the owner roles permitted to read, export, correct, or delete it;
- encryption, credential, audit, and incident-response ownership;
- the retention period, deletion mechanism, backup treatment, and any legal
  hold or recordkeeping duty;
- recording/transcription controls, including when recording is disabled;
- the contract or approval owner for analytics, call tracking, CRM, advertising,
  session replay, and AI vendors.

The following are prohibited by default:

- residential addresses, names, phone numbers, emails, free-text problem
  descriptions, call recordings, or stable lead IDs in URLs, ad parameters,
  analytics dimensions, public logs, public research, or AI prompts;
- session replay on unmasked service, contact, consent, payment, or account
  fields;
- copying full call recordings or transcripts between vendors when a bounded
  outcome code is sufficient;
- marketing reuse inferred from a service request without the required notice,
  consent, or existing-relationship rule;
- indefinite retention or agency/vendor access with no named business owner.

### Data-governance acceptance

- the approved data-flow record covers every collection field and destination;
- test traffic proves personal data is absent from URLs, analytics payloads,
  public logs, and AI prompts;
- least-privilege roles, vendor access, credential ownership, and revocation are
  tested;
- consent refusal and opt-out do not block safety information or necessary
  service-response paths;
- access, correction, deletion, suppression, retention expiry, and incident
  escalation are exercised with synthetic records;
- recording and transcription remain off until the applicable approval and
  notice/consent behavior are verified;
- unresolved jurisdiction, vendor, or retention decisions block the affected
  collection rather than being documented as a post-launch gap.

Implement only the approved measurement subset.

### Events

| Event | Trigger | Minimum evidence |
|---|---|---|
| `call_click` | visitor activates a telephone link | page, placement, device, source/medium where permitted |
| `call_connected` | tracking/phone system confirms a connection | call ID, duration rule, destination health |
| `generate_lead` | visitor submits a valid request | stable lead ID, requested service, area eligibility |
| `booking_requested` | visitor requests a date/time | request ID; do not call this booked |
| `booking_confirmed` | staff/system accepts an appointment | appointment ID and confirmation time |
| `qualify_lead` | business marks the lead serviceable and relevant | reason and responsible actor |
| `disqualify_lead` | business rejects the lead | controlled reason taxonomy |
| `close_convert_lead` | lead becomes a customer under the business definition | CRM/job evidence |
| `close_unconvert_lead` | lead closes without sale | controlled reason taxonomy |

GA4 officially recommends several of these lead lifecycle names, but the
business must define each transition before instrumenting it.

### Baseline report

Record at least weekly:

- qualified leads and booked jobs by source and landing page;
- booking, cancellation, no-show, and close rates;
- revenue and gross profit where available and authorized;
- Business Profile searches, calls, website clicks, bookings, and views;
- Search Console clicks, impressions, queries, pages, devices, and geography;
- dedicated Google generative-AI impressions and dimensions when that Search
  Console report is actually available to the property;
- AI referral sessions, landing pages, and assisted conversions;
- missed calls, form errors, spam leads, and service-area rejects;
- weather, promotions, staffing, capacity, tracking, and pricing annotations.

### Acceptance

- the blocking data-governance acceptance criteria above pass for every enabled
  event and destination;
- test leads reach the intended queue without creating live sales confusion;
- every primary phone number connects correctly;
- form success and failure are distinguishable;
- “request received” and “appointment confirmed” are separate states;
- source reporting reconciles to the extent the systems allow;
- known measurement gaps are documented.

## Stage 2 — Local entity and profile integrity

### Change-control gate

Before changing a live Business Profile or Local Services account:

- name the authorized actor and confirm the contractor retains at least one
  verified owner with tested recovery options;
- export or capture the current public fields, categories, service areas,
  services, photos, manager roster, verification state, and linked destinations;
- record the reason, source evidence, prior value, proposed value, approver, and
  rollback or recovery path for each change;
- group only a small, coherent change set and avoid simultaneously altering
  identity, ownership, location, phone, URL, and category unless the platform's
  required process demands it;
- prewrite the re-verification, suspension, access-loss, and appeal response,
  including the evidence owner and communication path;
- protect the last verified owner, unknown-access investigation, phone routing,
  and canonical URL from accidental removal;
- define post-change monitoring and a stop condition before applying anything.

### Work

1. Resolve one canonical business identity and one canonical URL per legitimate
   location.
2. Classify each location as storefront, service-area, or hybrid using Google's
   current rules.
3. Correct name, primary and secondary categories, phone, URL, hours, special
   hours, service areas, services, description, and attributes.
4. Connect each profile to the correct location page, not automatically to the
   home page.
5. Replace stock-only imagery with consented original evidence.
6. Establish an owner-controlled access roster; remove unknown managers through
   the platform's authorized workflow.
7. If using Local Services Ads, reconcile profile identity, licenses, insurance,
   worker roster, and verification status without claiming that platform
   verification is a universal quality guarantee.
8. Establish a monthly accuracy review and event-driven review for holidays,
   storms, moves, phone changes, hours, services, and licensing changes.

### Acceptance

- each change has an authorized actor, recoverable prior-state evidence, exact
  change log, approver, and monitoring result;
- last-owner, phone, URL, and manager-removal safeguards pass before and after
  the bounded change set;
- re-verification, suspension, or access loss invokes the response runbook and
  stops dependent changes;
- no fake or ineligible location exists;
- hidden addresses remain hidden in the profile and public website data;
- every public phone and URL works;
- service areas reflect actual operating capacity;
- advertised availability matches the answering and dispatch process;
- owner and manager access is understood;
- the evidence register supports every credential displayed.

## Stage 3 — Website foundation and conversion UX

### Work

- implement the information architecture in [`README.md`](README.md);
- use one canonical URL for each distinct service or location intent;
- make the mobile experience complete and responsive;
- put service-area confirmation, calling, and scheduling near the top;
- implement the emergency-content boundary in [`UX-SPEC.md`](UX-SPEC.md);
- add visible trust evidence with verification sources and dates;
- implement accessible labels, focus, target size, errors, and confirmations;
- remove broken forms, disconnected phone numbers, intrusive overlays, and
  misleading appointment language;
- produce an XML sitemap and inspect canonical, robots, `noindex`, redirect,
  status-code, and internal-link behavior;
- add truthful structured data after the visible page facts are stable.

### Acceptance

- every important public page returns the intended status and is indexable;
- the sitemap contains canonical public URLs only;
- primary content does not require user interaction to become crawlable;
- mobile and desktop carry equivalent primary content and metadata;
- a keyboard-only visitor can call, request service, recover from errors, and
  understand success;
- a failed submission preserves recoverable user input where appropriate;
- sticky elements do not obscure content or focus;
- schema parses as JSON and matches visible content;
- no self-serving rating or unsupported FAQ promise exists.

## Stage 4 — Service and local content

### Publish order

1. highest-revenue/highest-need core service pages;
2. emergency and diagnostic pages with safety review;
3. replacement and comparison pages;
4. maintenance and ownership pages;
5. substantive location pages;
6. project case studies;
7. supporting question pages only where a distinct user need remains.

### Brief requirements

Every content brief must include:

- primary job-to-be-done and adjacent questions;
- target service and legitimate service areas;
- direct answer and assumptions;
- safety class and required reviewer;
- primary and contractor-owned evidence;
- original contribution unavailable from generic articles;
- price date, range logic, exclusions, and update owner if cost is discussed;
- rebate, tax, permit, or regulation source and expiry if mentioned;
- proof block and customer-permission status;
- internal links and next step;
- success and harm metrics;
- review and expiry date.

### Quality gate

Reject publication when:

- the article could be published unchanged by any contractor in any city;
- technical claims lack a qualified reviewer;
- a generated source or another contractor is the factual authority;
- location text is swapped mechanically;
- cost, response, savings, or performance claims omit assumptions;
- customer photos or details lack permission;
- an emergency topic gives repair instructions instead of a safe stop/escalation;
- the CTA promises an appointment or arrival that operations have not accepted.

## Stage 5 — Reviews and earned local authority

### Review workflow

Use the policy in [`examples/REVIEW-REQUEST-SOP.md`](examples/REVIEW-REQUEST-SOP.md).
Request honest feedback from all eligible actual customers under a neutral rule.
Respond without disclosing private job details, arguing facts that cannot be
proved publicly, or pressuring the reviewer to change the rating.

### Earned authority workflow

Prioritize verifiable relationships:

- manufacturer dealer locators and current partner directories;
- utility and government contractor or rebate directories where eligibility is
  genuine;
- licensing authority records;
- local trade organizations and chambers with real membership;
- community sponsorships and partnerships that actually occurred;
- local reporting or expert contributions with editorial independence;
- useful answers in community forums with identity and material connections
  disclosed.

Do not buy undisclosed placement, create fake “best contractor” sites, seed
promotional Reddit threads, or publish competitor attacks.

### Acceptance

- review solicitation is neutral and documented;
- no incentive is conditioned on rating, sentiment, revision, or removal;
- no employee, owner, family, agency, or partner review appears independent
  without the required disclosure and platform eligibility;
- directory facts match the canonical business identity;
- every earned mention has a real-world basis.

## Stage 6 — Controlled AI visibility evaluation

Start only after Stages 0–5 are stable.

### Prompt set

Build a fixed, versioned set across:

- urgent service queries;
- repair-versus-replace questions;
- local contractor recommendations;
- equipment and fuel comparisons;
- cost and incentive questions;
- maintenance and indoor-air questions;
- branded fact checks.

For each prompt, record locale, date/time, platform, account/search mode where
known, exact prompt, response, cited URLs, brand mention, factual accuracy, and
whether a search was visibly used. Do not include customer or proprietary data.

### Evaluation

- sample repeatedly; never infer visibility from one run;
- separate brand mention, cited domain, cited URL, factual accuracy, sentiment,
  and referral traffic;
- compare against a stable competitor set without fabricating competitor claims;
- report uncertainty and missing platform details;
- treat changes in product behavior as a broken measurement assumption;
- connect AI referrals to qualified leads and booked work where possible.

### Experiment template

```text
Hypothesis:
Eligible pages:
Control/comparison:
Primary evidence:
Change:
Safety and policy review:
Start/end dates:
Success threshold:
Harm threshold:
Cost/time limit:
Rollback:
Result and uncertainty:
Decision:
```

## 30/60/90-day sequence

### Days 1–30: truth and measurement

- complete the evidence inventory;
- fix profile eligibility and identity defects;
- test every phone and lead path;
- establish lead-to-job measurement and weekly annotations;
- repair crawl/index, mobile, accessibility, and critical form failures;
- freeze fake-location, doorway-page, and unreviewed generated-content work.

### Days 31–60: service system

- rebuild the highest-value service pages;
- implement the UX contract;
- add accurate business and service structured data;
- launch the neutral review SOP;
- publish two to four original case studies or evidence-led answers;
- correct major directory inconsistencies.

### Days 61–90: local evidence and evaluation

- build justified local pages from real evidence;
- earn or correct authoritative local/manufacturer/utility listings;
- publish replacement, cost-factor, and comparison content with dated sources;
- start the fixed AI prompt panel and referral reporting;
- compare qualified leads, bookings, sold work, and capacity against baseline;
- keep, revise, or roll back work using predeclared thresholds.

## Weekly operating review

Ask in this order:

1. Did any public business fact, availability claim, credential, price, rebate,
   or warranty become stale?
2. Did any safety, privacy, review-policy, or platform-policy incident occur?
3. Did calls, forms, scheduling, tracking, or profile links fail?
4. Which sources produced serviceable qualified leads and booked work?
5. Which pages created value, confusion, low-quality leads, or capacity strain?
6. What changed outside the program: weather, staffing, promotions, platform,
   competitors, or tracking?
7. Which single bounded improvement or experiment is justified next?

## Completion boundary

This playbook is an implementation contract, not evidence that a contractor has
implemented it or achieved results. Completion requires the contractor-specific
acceptance evidence named at each stage.
