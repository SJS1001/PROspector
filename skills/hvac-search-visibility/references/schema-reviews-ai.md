# Structured data, reviews, and AI visibility

Read this reference when the request involves schema, review operations,
crawler controls, AEO/GEO claims, or AI measurement.

## Structured data

- Use `HVACBusiness` only when it accurately describes the business.
- Mark up only current, page-visible, public facts.
- Use `Service` and `areaServed` as semantic vocabulary without promising a
  standalone Google service rich result.
- Google feature documentation, not the entire Schema.org vocabulary, controls
  Google rich-result eligibility.
- A hidden-address service-area example can remain semantic Schema.org data but
  does not satisfy Google's documented LocalBusiness rich-result address
  requirement. Never reveal a private residential address to chase eligibility.
- Do not add self-serving review or `aggregateRating` markup to a contractor's
  own LocalBusiness/Organization pages, including through embedded third-party
  widgets.
- Recheck current FAQ support. Do not present FAQ markup as an AEO tactic.
- Validate JSON syntax, visible-content parity, applicable rich-result rules,
  and deployed URL behavior separately.

Use the fictional files in `assets/` as templates only.

## Neutral review operations

An eligible request needs:

- a genuine completed interaction;
- a neutral rule unrelated to satisfaction or predicted sentiment;
- a stable interaction and request key;
- cross-channel deduplication and a documented cooldown/frequency cap;
- lawful contact and applicable notice/consent;
- opt-out and durable suppression checks;
- no on-premises pressure, employee quota, desired rating, wording, keyword,
  city, technician name, incentive, or removal condition.

Responses must avoid exposing customer, address, equipment, billing, diagnosis,
or dispute details. Do not condition resolution on review revision/removal. A
human with case context reviews any generated response.

Recheck the current rules of the exact review platform and jurisdiction.

## AI visibility baseline

Ordinary crawlability, indexability, people-first content, useful original
evidence, and trusted local-business facts come first. Do not assume a separate
technical AEO channel.

For Google, recheck its current AI optimization guide and documentation updates.
Historically volatile claims include `llms.txt`, special AI schema, content
chunking, FAQ rich results, and dedicated AI reporting.

For OpenAI, recheck the current publisher FAQ. Treat search discoverability
controls and training controls separately; do not infer ranking, citation, or
training from crawler activity.

### Experiments

Classify AI-specific rewrites, AI text mirrors, agent protocols, citation
monitoring, and prompt-format tactics as `[EXP]` or `[HYP]` unless current owning
platform evidence supports them.

Record:

- exact page group and hypothesis;
- baseline and comparison;
- platform/model/date/region and retrieval conditions;
- repeated samples and variability;
- traditional Search and lead-quality guardrails;
- predeclared keep/change/stop rule;
- rollback plan.

One chatbot answer is not stable visibility evidence. Raw AI referral growth can
also reflect platform growth rather than the intervention.

## Current sources to verify

- [Schema.org HVACBusiness](https://schema.org/HVACBusiness)
- [Schema.org Service](https://schema.org/Service)
- [Google LocalBusiness documentation](https://developers.google.com/search/docs/appearance/structured-data/local-business)
- [Google review snippets](https://developers.google.com/search/docs/appearance/structured-data/review-snippet)
- [Google supported structured-data gallery](https://developers.google.com/search/docs/appearance/structured-data/search-gallery)
- [Google AI optimization guide](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide)
- [Google Search documentation updates](https://developers.google.com/search/updates)
- [OpenAI publisher FAQ](https://help.openai.com/en/articles/12627856-publishers-and-developers-faq)
- [Google review policy](https://support.google.com/contributionpolicy/answer/7400114?hl=en)
- [FTC review rule Q&A](https://www.ftc.gov/business-guidance/resources/consumer-reviews-testimonials-rule-questions-answers)
