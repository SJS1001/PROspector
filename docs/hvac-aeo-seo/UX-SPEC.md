# HVAC contractor search and conversion UX specification

## Design premise

The primary user is not browsing a brand experience at leisure. They may be
uncomfortable, worried about safety, comparing a major purchase, holding a
phone in one hand, or trying to understand whether the contractor serves their
home. The interface must reduce uncertainty without manufacturing fear.

## User states

| State | User question | Primary interface response |
|---|---|---|
| Possible emergency | “Is this dangerous?” | Clear stop/escalation guidance from an appropriate authority; do not bury it beneath a lead form. |
| Urgent loss of heating/cooling | “Can someone help, where, and when?” | Service-area check, truthful availability, call action, and request fallback. |
| Diagnosing symptoms | “What might be wrong?” | Bounded causes, safe observations, stop conditions, and what a technician will test. |
| Repair decision | “Is repair sensible?” | Age, condition, failure, warranty, part, cost, and recurrence factors without a predetermined sales answer. |
| Replacement decision | “Which system and contractor should I choose?” | Load/sizing process, options, total-scope factors, proof, warranties, incentives, and estimate request. |
| Maintenance | “What should be done and when?” | Homeowner-safe tasks separated from professional inspection work. |
| Trust verification | “Is this company legitimate?” | Verifiable identity, license/insurance posture, people, projects, reviews, complaint path, and written terms. |

## Global interface contract

### Header

- recognizable business name and logo;
- “Serving [real region]” or location selector;
- current-hours/availability language derived from an owned data source;
- primary `Call` and secondary `Request service` actions;
- keyboard-operable navigation;
- no rotating promotional carousel.

### Mobile action bar

- appears only when it does not cover content, consent controls, or focused
  elements;
- contains at most two primary actions;
- uses descriptive text such as `Call service team`, not an unlabeled icon;
- does not claim “Book now” when the action only submits a request;
- preserves safe-area insets and zoom/reflow.

### Emergency strip

Show only on relevant pages or when deliberately selected by the visitor.

```text
Possible gas smell or carbon-monoxide alarm?
Get everyone outside immediately. From a safe location, call local emergency
services and the gas utility. Do not re-enter until the responsible authority
says it is safe.
[Call emergency services] [View local authority steps]
```

The emergency action must not be routed through the contractor's sales queue as
the only option. Block publication until a qualified reviewer has bound the
wording, phone targets, and no-reentry precautions to the live fire, emergency,
gas-utility, and regulator guidance for the served jurisdiction. The emergency
route must never require form completion, tracking consent, account creation, or
sales-queue interaction. Representative authority examples are
[Ontario carbon-monoxide safety](https://www.ontario.ca/page/carbon-monoxide-safety),
[Enbridge Gas Ontario leak safety](https://www.enbridgegas.com/ontario/safety/smell-gas),
and the [U.S. CPSC carbon-monoxide center](https://www.cpsc.gov/Safety-Education/Safety-Education-Centers/Carbon-Monoxide-Information-Center);
they do not replace local review.

### Trust strip

Display a small number of verifiable facts:

- years in operation only if documented;
- license number/authority where appropriate;
- insured status without exposing private documents;
- current manufacturer or training credentials;
- review count/rating retrieved from the source rather than hard-coded forever;
- service or workmanship warranty with a link to terms.

Never use vague badges such as “certified,” “approved,” or “#1” without naming
the issuer, scope, date, and evidence.

## Home page structure

```text
┌──────────────────────────────────────────────────────────┐
│ Safety strip when context requires it                    │
├──────────────────────────────────────────────────────────┤
│ Logo | Serving area | Hours/availability | Call | Request│
├──────────────────────────────────────────────────────────┤
│ Direct value statement                                   │
│ Exact services + real geography + truthful next step     │
│ [Call service team] [Request an appointment]             │
│ Service-area confirmation                                │
├──────────────────────────────────────────────────────────┤
│ What do you need?                                        │
│ No heat | No cooling | Repair | Replace | Maintain       │
├──────────────────────────────────────────────────────────┤
│ Verifiable trust evidence                                │
├──────────────────────────────────────────────────────────┤
│ Service summaries with distinct destinations             │
├──────────────────────────────────────────────────────────┤
│ Recent local project evidence                            │
├──────────────────────────────────────────────────────────┤
│ How diagnosis, estimate, scheduling, and work proceed    │
├──────────────────────────────────────────────────────────┤
│ Cost factors, financing terms, rebates with dates        │
├──────────────────────────────────────────────────────────┤
│ Reviews/testimonials with provenance                     │
├──────────────────────────────────────────────────────────┤
│ Helpful answers + last-reviewed dates                    │
├──────────────────────────────────────────────────────────┤
│ Contact, service areas, policies, accessibility, privacy │
└──────────────────────────────────────────────────────────┘
```

## Service page structure

1. **Direct scope:** service, area, availability, and who it is for.
2. **Primary actions:** call and request, using different language for immediate
   connection versus asynchronous follow-up.
3. **Safety boundary:** only when relevant.
4. **Symptoms:** scannable links to the relevant diagnostic explanation.
5. **What happens:** arrival/diagnostic process without promising unsupported
   times or outcomes.
6. **Options:** repair, monitor, or replace criteria where applicable.
7. **Cost factors:** dated range only when supported; otherwise explain factors
   and estimate process.
8. **Exact proof:** technicians, tools, projects, measurements, credentials, and
   reviews relevant to the service.
9. **Warranty and responsibility:** equipment, labor, registration, exclusions,
   and who handles a problem.
10. **Local context:** climate, permits, utility/incentive source, housing stock,
    or dispatch details that genuinely apply.
11. **Questions:** visible answers regardless of FAQ rich-result eligibility.
12. **Final next step:** repeat scope, response expectation, and alternate
    contact path.

## Location page structure

The page must state one of:

- “Visit our staffed location at …” when customers genuinely can; or
- “We serve homes in …; this is a service area, not a storefront.”

Required local evidence:

- boundary or neighborhoods actually served;
- local phone/dispatch relationship where legitimate;
- relevant climate, permit, utility, rebate, or housing context;
- at least one consented project, technician, or operating detail tied to the
  area when available;
- realistic scheduling and exclusions;
- links to the exact services available there.

A city name inserted into a generic page is not a location experience.

## Request-service flow

### Recommended fields

Start with the minimum needed to route and respond:

- service address or postal/ZIP code for eligibility;
- service need/category;
- urgency without implying emergency dispatch;
- name;
- phone and/or email with a clearly stated contact expectation;
- short optional description;
- consent controls required for the intended contact method and jurisdiction.

Avoid asking for equipment serial numbers, detailed household information,
financing data, or account creation before the business needs it.

### Privacy and contact controls

- Explain the purpose of each collected field at or before collection.
- Keep residential address, contact details, problem descriptions, recordings,
  and identifiers out of URLs, analytics dimensions, ad parameters, public
  logs, session-replay capture, and AI prompts.
- Collect marketing consent separately from a service-response request where
  the applicable law or channel requires it; refusal must not block emergency
  information.
- Provide the business identity, intended contact channels, expected response,
  and a usable privacy notice before submission.
- Do not enable call recording, transcription, session replay, or sensitive-field
  capture until the Stage 1 data-governance gate authorizes it for the served
  jurisdiction and vendors.
- Support correction, access, deletion, and communication opt-out workflows as
  required by the approved policy; never promise deletion where a documented
  legal retention duty applies.

### States

| State | Required behavior |
|---|---|
| Initial | Labels remain visible; required fields and expected response are clear. |
| Service-area mismatch | Explain that the address is outside the current area; do not imply a booking. Offer a neutral next step if one exists. |
| Validation error | Identify the field and problem in text, move focus appropriately, and preserve valid input. |
| Submitting | Prevent accidental duplicate submission while keeping status perceivable. |
| Network/server error | State that the request was not confirmed, preserve recoverable input, and provide a phone alternative. |
| Received | Display a stable request reference and expected response; do not call it an appointment. |
| Confirmed appointment | Display only after operational acceptance, with date/time, location, contact method, and change/cancel path. |

The implementation must also test consent refusal, channel opt-out, duplicate
submission, deletion/access request routing, session-replay masking, and the
absence of personal data from analytics and prompt payloads.

## Content presentation

- Put the answer before the history lesson.
- Use headings that describe decisions and symptoms, not keyword variants.
- Keep critical qualifications beside the claim, not in an unrelated footer.
- Tables are appropriate for repeated option comparisons but must reflow or
  remain understandable on small screens.
- Provide descriptive image alt text when the image contributes information;
  use empty alt text for decorative images.
- Caption project images with date, general area, equipment/scope, result, and
  consent-safe context.
- Show `Reviewed by` and `Last reviewed` for technical, cost, rebate, and safety
  content.
- Make phone numbers selectable and readable; never rely on an icon alone.

## Accessibility acceptance

Use WCAG 2.2 AA as the design target, recognizing that conformance requires a
complete implementation review.

- minimum target size or spacing meets SC 2.5.8;
- keyboard focus is visible and not obscured;
- headings and landmarks expose a logical structure;
- form controls have persistent labels and useful instructions;
- errors are identified in text and associated with their fields;
- status changes are announced appropriately;
- zoom to 200% and reflow at narrow widths preserve content and function;
- color is not the only indicator;
- text and non-text contrast meet applicable criteria;
- motion is nonessential and reduced-motion preferences are respected;
- the call/request path works without a mouse, drag, or timed interaction.

Primary references:

- [WCAG 2.2](https://www.w3.org/TR/wcag/)
- [WCAG 2.2 understanding documents](https://www.w3.org/WAI/WCAG22/Understanding/)
- [Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)
- [Error Identification](https://www.w3.org/WAI/WCAG22/Understanding/error-identification)
- [Google mobile-first indexing](https://developers.google.com/search/docs/crawling-indexing/mobile/mobile-sites-mobile-first-indexing)

## Performance acceptance

Use field data at the 75th percentile when available. Current “good” Core Web
Vitals thresholds are:

- LCP at or below 2.5 seconds;
- INP at or below 200 milliseconds;
- CLS at or below 0.1.

These are experience thresholds, not a guarantee of ranking or conversion.
Reference: [web.dev Core Web Vitals thresholds](https://web.dev/articles/defining-core-web-vitals-thresholds).

## Prohibited UX patterns

- fake countdowns or “technician slots remaining” values;
- preselected marketing or financing consent;
- inaccessible chat widgets that cover primary actions;
- phone-number swaps that break identity or fail when scripts are blocked;
- forms that discard all data after a correctable error;
- success screens that imply a confirmed booking when only a lead exists;
- review widgets that hide negative reviews while claiming completeness;
- stock photos presented as local work;
- badges without issuer and scope;
- emergency warnings used primarily to pressure a sale;
- pricing without date, assumptions, inclusions, and exclusions;
- city-switcher pages that imply nonexistent offices.

## UX validation sessions

Test at least these scenarios with representative users or an independent
reviewer:

1. No heat on a winter evening, using a phone with one hand.
2. Carbon-monoxide alarm or gas-smell concern; the user must reach the correct
   authority without entering a sales funnel.
3. Replacement comparison on a small phone at 200% zoom.
4. Service-address rejection with a clear and respectful explanation.
5. Form submission failure followed by recovery.
6. Keyboard-only appointment request.
7. Screen-reader review of services, credentials, form labels, errors, and
   confirmation.
8. Customer verifying whether a location is a storefront or service area.
9. Customer checking a license, warranty, rebate, or “certified” claim.
10. Customer attempting to change or cancel a confirmed appointment.
