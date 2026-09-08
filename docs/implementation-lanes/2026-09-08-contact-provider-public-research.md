# Contact-enrichment candidate provider research (public documentation only)

Date: 2026-09-08
Related: [issue #7](https://github.com/SJS1001/PROspector/issues/7),
`docs/PROSPECT-QUALITY-EVALUATION.md`,
`.planning/phases/05-controlled-enrichment-and-verified-contacts/05-RESEARCH.md`

## Purpose and authority boundary

This document compares publicly documented characteristics of candidate
contact-enrichment providers as **research inputs only**. It does not select,
recommend, connect to, or authorize any provider. Consistent with
`05-RESEARCH.md`'s "No selection. Implement the port + fake contract first; a
real provider needs separate explicit authority..." — that gate blocks
provider *selection*, *connection*, *account creation*, and *spend*. It does
not block reading a provider's own published documentation. This document
does exactly that and nothing more.

No account was created, no credential was used, no API call was made, and no
real contact data was looked up or stored. Every figure below comes from
public marketing/documentation pages and, in several cases, from third-party
summaries of those pages (noted explicitly) rather than a page this session
fetched directly — see "Method and a fetch restriction" below.

A provider label is never application verification. Per
`docs/PROSPECT-QUALITY-EVALUATION.md`, contact eligibility is
`current_eligible` only when the application's own mailbox/source-verified
business-point and freshness rules are satisfied; a provider's own
"verified"/"valid" status is an input claim to check against those rules, not
a substitute for them.

## Method and a fetch restriction

Research used web search summaries; direct `WebFetch` of the providers' own
documentation domains (`docs.apollo.io`, `hunter.io`) was attempted and
**blocked by this session's network egress proxy** (`EGRESS_BLOCKED`,
2026-09-08) before any provider page loaded. That block is an environment
control, not a workaround target — it is not being bypassed here. As a
result, most rows below are backed by search-engine result snippets that
themselves quote or summarize the providers' public pages, with the original
URL cited. Where a figure could not be corroborated this way, it is marked
`unknown — requires owner follow-up` rather than guessed. All access dates
are 2026-09-08 unless noted.

## Candidate comparison

Every cell below is backed by the numbered source in the "Primary source(s)"
column; full links are in "Sources and access dates". A cell marked
`unknown — requires owner follow-up` was not found and is not guessed.

| Provider | Person-discovery surface | Known-contact verification surface | Returned fields (as published) | Evidence/freshness semantics (as published) | Reuse/redistribution limits (as published) | Rate limits (as published) | Pricing/cost shape (as published) | Account/API prerequisites | Primary source(s) |
|---|---|---|---|---|---|---|---|---|---|
| **Apollo.io** | People API Search — filtered prospect search; explicitly does **not** return email/phone in the search response itself (separate enrichment call required); capped at 50,000 records per search (100/page × 500 pages) | People Enrichment — one-to-one match returning a Person object; email verification labels each email `verified`, `unverified`, or `likely-to-engage` from Apollo's internal signals plus SMTP-style checks; a third-party review reports observed real-world bounce rates of roughly 3–9% against Apollo-labelled-verified lists — i.e., the label is not a freshness/deliverability guarantee | Person object: `id`, `first_name`, `last_name`, `name`, `title`, `seniority`, `email`, `email_status`, `linkedin_url`, `phone_numbers[]`, nested `organization` (itself carrying `id`, `name`, `website_url`, `primary_domain`, `linkedin_url`, `industry`, `estimated_num_employees`, `annual_revenue`, `city`, `state`, `country`). No explicit per-field freshness/source-provenance field found | Freshness mechanism beyond `email_status` not found in the material reviewed — `unknown — requires owner follow-up` | Not found in the material reviewed — `unknown — requires owner follow-up`; a full ToS/DPA read is required before this can be answered | Fixed-window: a per-plan cap on calls per minute/hour/day; exceeding it returns HTTP 429 | Credit-based: 1 credit per personal email pulled, 8 credits per phone number (up to 9 credits for a full email+phone enrichment) | Account + API key; plan-gated credit allotment | [1][2][3] |
| **Hunter.io** | Domain Search (find people/emails at a known domain) and Discover (find companies) are the discovery-shaped endpoints | Email Finder (find one person's likely email) and Email Verifier are the known-contact-shaped endpoints | Per-email result: a `confidence` score, plus a `sources[]` array (each source: `domain`, `uri`, `extracted_on`, `last_seen_on`, `still_on_page`), capped at 20 sources per address | `sources[].extracted_on` records first-seen date and `sources[].last_seen_on` records last-seen date, letting a caller judge staleness directly per claim; a verifier result carries only a verification timestamp, not an ongoing freshness signal — reviewed material explicitly notes "an address verified 6 months ago may no longer be valid" | Not found in the material reviewed — `unknown — requires owner follow-up` | Domain Search / Email Finder / Enrichment: 15 req/s, 500/min. Email Verifier: 10 req/s, 300/min. Discover: 5 req/s, 50/min. Exceeding returns HTTP 429 | Not detailed in the material reviewed beyond tiered plans — `unknown — requires owner follow-up` for exact figures | Account + API key | [4][5][6] |
| **People Data Labs (PDL)** | Person Search API (bulk/filtered search over PDL's dataset) is the discovery-shaped surface (endpoint not directly confirmed in the material reviewed — inferred from product naming, so treat as `unconfirmed`) | Person Enrichment API (`POST /v5/person/enrich`) — a one-to-one match against a known identifier, explicitly a "known-person" shape, returning a `likelihood` match-confidence score (1 = low, 10 = highest) alongside the profile | Profile fields with populated data include `id`, `full_name`, `sex`, `linkedin_url`, `industry`, `job_title`, `job_title_levels`, `job_company_name`, `job_company_website`, `location_name`, plus `emails` and `experience`; a field with no data is returned as `null`; nested objects (e.g. `education`) are boolean-only (`true`/absent) in the cheaper Preview Enrichment response rather than the full Enrichment response | PDL's dataset is stated to update **monthly by default** — the coarsest refresh cadence found among the candidates reviewed; the `likelihood` score is a match-confidence signal, not a freshness signal | Not found in the material reviewed — `unknown — requires owner follow-up`; search explicitly turned up no ToS/redistribution detail | 100 requests/minute default for free accounts; 1,000/minute default for paying accounts; a Bulk Enrichment endpoint exists to raise effective per-request throughput | Charged per match (per successful enrichment) | Account + API key | [7][8][9] |
| **RocketReach** | People Search API (`/search`) — filtered prospect search | People Lookup API (`/lookupProfile`) — resolves one profile via name/employer/LinkedIn URL/profile ID (the ID a `/search` call returns); a Bulk People Lookup API also exists | Reviewed material confirms `id`, `name`, `current_title`, `current_employer`, work email, personal email, phone number, and LinkedIn URL are returned, but the complete field-by-field schema (e.g., an explicit per-field source/date, or a "teaser" preview field) was **not confirmed** against RocketReach's own reference page — `unknown — requires owner follow-up` for the exact schema | 1 credit is consumed only when a verified email or phone is actually found; a lookup that finds nothing is generally refunded, i.e., a "no-result" outcome does not itself carry the same charge as a "found" one — freshness mechanism beyond that was not found in the material reviewed | Not found in the material reviewed — `unknown — requires owner follow-up` | HTTP 429 on excess; the exact numeric plan-tier caps live behind RocketReach's own rate-limits doc page, which this session could not fetch directly — `unknown — requires owner follow-up` for exact numbers | Annual seat+credit plans seen in third-party pricing summaries: Essentials $399/yr (1,200 lookups/yr), Pro $899/yr (3,600/yr), Ultimate $2,099/yr (full API access); overage roughly $0.30–$0.45/lookup; custom/enterprise pricing from ~$6,000/yr. These figures come from third-party pricing-comparison sites, not RocketReach's own pricing page directly, and should be treated as indicative, not authoritative, until confirmed against the primary source | Account (+ API access tier for programmatic use) | [10][11][12] |
| **ZoomInfo** | Person Search — filtered discovery; the Search Contacts API explicitly does **not** return emails, phone numbers, or other engagement data in search results (a separate Enrich Contact call is required), and more generally "there are restrictions on which data points you are able to search by and what content you can receive back," gated by the specific contract's Service Level Agreement | Enrich Contact API — returns engagement-usable data (email, phone) for contacts identified via search; a described end-to-end workflow returns name, title, company, email, phone, an accuracy score, and source metadata | Fields named in reviewed material: `company` (nested `id`, `name`, `employeeCount`, `primaryIndustry`), `country`, `email`, `jobTitle`, `directPhoneDoNotCall`, `directPhoneAlt`, `mobilePhoneAlt`, `emailAlt`, `withinCalifornia`/`withinCanada`/`withinEu`, `metroArea`, `personHasMoved`, `region`, `state`, `street`, `zipCode`; an accuracy/confidence score and source metadata are described as part of the enrich workflow but not itemized as named fields | Not found in the material reviewed — `unknown — requires owner follow-up`, though a `personHasMoved` flag suggests some staleness signal exists | Explicit and strict, per ZoomInfo's own License Terms and Conditions: API credentials may not be embedded in third-party applications; API access may not be used to build audience segmentation outside ZoomInfo's own services; "no posting, copying, transmission, retransmission, distribution, redistribution, publication, republication, decompilation, disassembling, reverse engineering, or otherwise reproducing, storing, transmitting, modifying, or commercially exploiting any Proprietary Materials in any form or by any means, for any purpose... without express written permission." This is the strictest reuse posture among the candidates reviewed | Not published generally — "specific details about your account's limits and restrictions" are obtained by emailing `partnerAPI@zoominfo.com`, i.e., contract-specific rather than a public numeric limit | Not found in the material reviewed — `unknown — requires owner follow-up`; ZoomInfo is widely known as a contract/quote-based enterprise product rather than self-serve, which is consistent with the contract-gated language above | A negotiated contract/SLA, not a self-serve signup, appears to be the norm based on the language found | [13][14][15][16] |

## Sources and access dates

All accessed 2026-09-08. "Primary" = the provider's own documentation/legal
page; "secondary" = a third party's page that itself quotes or summarizes a
provider's public material (used only where this session's search tooling
surfaced the provider's own wording second-hand, or where a primary page's
content could not be independently loaded — see "Method and a fetch
restriction" above).

1. Primary — [Apollo Developer Docs: People API Search](https://docs.apollo.io/reference/people-api-search)
2. Primary — [Apollo Developer Docs: People Enrichment](https://docs.apollo.io/reference/people-enrichment)
3. Primary — [Apollo Developer Docs: Rate Limits](https://docs.apollo.io/reference/rate-limits)
4. Primary — [Hunter API Reference V2](https://hunter.io/api-documentation/) (Domain Search, Email Finder, Email Verifier, Discover endpoints and rate limits)
5. Primary — [Hunter Help Center: Domain Search — Find emails from companies](https://help.hunter.io/en/articles/1830792-domain-search-find-emails-from-companies) (`sources[]` fields, confidence)
6. Secondary — [Hunter Help Center: Hunter API overview](https://help.hunter.io/en/articles/1970956-hunter-api) (general endpoint/rate-limit summary)
7. Primary — [PDL Docs: Reference — Person Enrichment API](https://docs.peopledatalabs.com/docs/reference-person-enrichment-api)
8. Primary — [PDL Docs: Output Response — Person Enrichment API](https://docs.peopledatalabs.com/docs/output-response-person-enrichment-api) (returned fields, `likelihood` score, null-field behavior)
9. Primary — [PDL Docs: Preview Enrichment API](https://docs.peopledatalabs.com/docs/preview-enrichment-api) (nested-object boolean-only behavior; monthly dataset refresh)
10. Primary — [RocketReach API Reference](https://docs.rocketreach.co/reference/rocketreach-api)
11. Primary — [RocketReach API Reference: People Lookup API / Person Enrichment API](https://docs.rocketreach.co/reference/people-lookup-api)
12. Secondary — third-party pricing-comparison pages (RocketReach's own current pricing page was not independently loaded by this session): [SalesIntel — RocketReach Pricing & Plans 2026](https://salesintel.io/blog/rocketreach-pricing-plans/), [Cleanlist — RocketReach Pricing Guide 2026](https://www.cleanlist.ai/blog/2026-03-19-rocketreach-pricing-guide)
13. Primary — [ZoomInfo Docs: General Overview of ZoomInfo APIs](https://docs.zoominfo.com/docs/general-overview)
14. Primary — [ZoomInfo Docs: Search Contacts](https://docs.zoominfo.com/reference/searchinterface_searchcontact) (search-vs-enrich field split)
15. Primary — [ZoomInfo License Terms and Conditions](https://www.zoominfo.com/legal/ltc) (reuse/redistribution restrictions)
16. Primary — [ZoomInfo Support: Service Level Agreement](https://help.zoominfo.com/18440-partners/service-level-agreement) (contract-gated limits; `partnerAPI@zoominfo.com`)

## Person-discovery vs. known-contact-verification, as a cross-provider pattern

Every candidate reviewed exposes (at least notionally) two different surface
shapes, matching the distinction PROspector's own protocol draws between
"surfaced" targets and "returned" contacts:

- a **discovery/search** surface that takes loose criteria (a domain, a
  company, a name, filters) and returns *candidate* people or profile IDs,
  generally without a mailbox/phone in the same response; and
- a **verification/enrichment/lookup** surface that takes one specific known
  identifier (an email, a profile ID, a name+employer pair) and returns a
  bounded claim about that one person, often carrying the provider's own
  confidence/verification label.

None of the five reviewed providers' own labels ("verified", "likely-to-
engage", a match/confidence score) were described in the material reviewed as
meeting PROspector's `current_eligible` bar on their own — each still
requires the application's independent mailbox/source-verified and freshness
check, consistent with `05-RESEARCH.md`'s "Fake/weak verification promotion"
risk and its "class allowlist, source/method/time/provenance validation,
class-not-confidence eligibility rule" mitigation.

## Unknown terms requiring owner follow-up

These are not resolved by this document and need either a primary-source
document fetch (from a network context that is not blocked, or via one
authorized owner-provided document/screenshot) or a direct question to the
provider before any provider selection:

1. Apollo.io and Hunter.io: exact data reuse/redistribution/storage terms —
   not found in the reviewed material; requires reading each provider's own
   Terms of Service / Data Processing Agreement directly.
2. People Data Labs: exact reuse/redistribution terms, and independent
   confirmation of the discovery-endpoint name/path (inferred, not directly
   confirmed).
3. RocketReach: exact numeric rate-limit tiers (its own rate-limits doc page
   could not be fetched); reuse/redistribution terms; independent
   confirmation that the third-party pricing figures above match
   RocketReach's own current pricing page.
4. ZoomInfo: exact discovery-vs-verification surface split, freshness
   semantics, and numeric rate limits — all stated to be contract-specific
   rather than published, so these can only be resolved through a direct,
   separately authorized commercial conversation, not further public
   research.
5. For every candidate: privacy/consent basis for the underlying personal
   data (relevant given PROspector handles real people's contact
   information), and whether any candidate publishes an explicit SLA for
   data-accuracy or freshness guarantees beyond a marketing claim.

## What this document is not

It is not a provider selection, recommendation ranking, cost model, contract
review, or authorization to proceed with any candidate. It creates no
account, uses no credential, makes no API call, and touches no real contact
data. It does not change any Phase 4/5/7 gate, `05-RESEARCH.md`'s own
no-selection conclusion, or `docs/PROSPECT-QUALITY-EVALUATION.md`'s
dependencies-for-real-evidence list — it is additional, narrowly scoped
input for whoever eventually makes that separately authorized decision.
