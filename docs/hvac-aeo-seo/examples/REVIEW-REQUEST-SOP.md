# Neutral customer review-request SOP

## Purpose

Request honest feedback from actual customers without manipulating rating,
sentiment, content, timing, revision, or removal.

This operating example must be checked against the current platform rules and
the contractor's jurisdiction before use.

## Eligibility rule

A customer may receive the request when all are true:

- the customer had a genuine completed interaction covered by the review
  platform;
- the request is selected by a neutral, consistently applied rule;
- the customer has not opted out of the communication channel;
- contact is lawful and consistent with the original relationship and consent;
- the request is not triggered by an internal “satisfied customer” score;
- no request has already been sent for the same completed interaction;
- the customer and channel are outside the contractor's documented cooldown and
  frequency cap across CRM, technician, agency, and automated workflows;
- no durable review-request suppression or channel opt-out applies;
- the recipient is not being asked to review while pressured on the premises;
- the business is not asking employees to meet a review quota.

## Prohibited conduct

- buying or fabricating reviews;
- asking employees, owners, agencies, family, partners, or competitors to pose
  as independent customers;
- offering payment, discounts, gifts, entries, services, or other benefits in
  exchange for a review, a positive review, revision, or removal;
- asking only customers believed to be happy;
- requesting a star rating, positive sentiment, technician name, keyword,
  service, city, or scripted wording;
- preventing or discouraging negative feedback;
- threatening, harassing, or publicly exposing a reviewer;
- automatically generating a review for the customer;
- posting through the customer's device or account;
- presenting selected testimonials as all or representative reviews when that
  creates a misleading impression.

## Example request

> Thank you for choosing [Business]. If you would like to share an honest review
> of your experience, you can do so here: [platform link]. Feedback is optional,
> and we welcome it whether your experience was positive or negative. For help
> with an unresolved service issue, contact [service contact].

Do not add a reward, desired rating, desired wording, or pressure language.

## Response contract

- respond professionally and without revealing customer, address, equipment,
  billing, diagnosis, or dispute details that are not appropriate for public
  disclosure;
- acknowledge the concern without fabricating agreement or evidence;
- offer a private resolution path;
- do not condition resolution on a review change or removal;
- flag content through the platform only for a legitimate policy reason;
- preserve evidence and escalate credible safety, discrimination, fraud,
  privacy, legal, or regulatory issues appropriately;
- never use a generated response without human review and case context.

## Audit fields

- customer/job eligibility basis;
- stable interaction key and idempotent request key;
- neutral selection rule/version;
- request timestamp and channel;
- prior-request count, last-request timestamp, cooldown/frequency rule, and
  cross-channel deduplication result;
- template version;
- platform destination;
- opt-out and durable suppression state/reason;
- response owner and timestamp;
- escalation category without unnecessary customer details;
- any incentive program reviewed separately and excluded from platform reviews.

## Primary sources

- [Google Maps prohibited and restricted content](https://support.google.com/contributionpolicy/answer/7400114?hl=en)
- [FTC Consumer Reviews and Testimonials Rule Q&A](https://www.ftc.gov/business-guidance/resources/consumer-reviews-testimonials-rule-questions-answers)
- [Competition Bureau Canada online-review guidance](https://competition-bureau.canada.ca/en/deceptive-marketing-practices-digest-volume-1)
