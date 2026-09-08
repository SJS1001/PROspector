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

| Provider | Person-discovery surface | Known-contact verification surface | Evidence/freshness semantics (as published) | Reuse/redistribution limits (as published) | Rate limits (as published) | Pricing/cost shape (as published) | Account/API prerequisites |
|---|---|---|---|---|---|---|---|
| **Apollo.io** | People API Search — filtered prospect search; explicitly does **not** return email/phone in the search response itself (separate enrichment call required); capped at 50,000 records per search (100/page × 500 pages) | Email verification labels each email `verified`, `unverified`, or `likely-to-engage` from Apollo's internal signals plus SMTP-style checks; a third-party review reports observed real-world bounce rates of roughly 3–9% against Apollo-labelled-verified lists — i.e., the label is not a freshness/deliverability guarantee | Freshness mechanism not found in the snippets reviewed — `unknown — requires owner follow-up` | Not found in the snippets reviewed — `unknown — requires owner follow-up`; a full ToS/DPA read is required before this can be answered | Fixed-window: a per-plan cap on calls per minute/hour/day; exceeding it returns HTTP 429 | Credit-based: 1 credit per personal email pulled, 8 credits per phone number (up to 9 credits for a full email+phone enrichment) | Account + API key; plan-gated credit allotment |
| **Hunter.io** | Domain Search (find people/emails at a known domain) and Discover (find companies) are the discovery-shaped endpoints | Email Finder (find one person's likely email) and Email Verifier are the known-contact-shaped endpoints; Hunter shows the specific source URL and discovery date behind each found address | Each found email is shown with its source URL and discovery date, letting a caller judge staleness itself; a verifier result carries only a verification timestamp, not an ongoing freshness signal — a 2026-search summary explicitly notes "an address verified 6 months ago may no longer be valid" | Not found in the snippets reviewed — `unknown — requires owner follow-up` | Domain Search / Email Finder / Enrichment: 15 req/s, 500/min. Email Verifier: 10 req/s, 300/min. Discover: 5 req/s, 50/min. Exceeding returns HTTP 429 | Not detailed in the snippets reviewed beyond tiered plans — `unknown — requires owner follow-up` for exact figures | Account + API key |
| **People Data Labs (PDL)** | Person Search API (bulk/filtered search over PDL's dataset) is the discovery-shaped surface (endpoint not directly confirmed in the snippets reviewed — inferred from product naming, so treat as `unconfirmed`) | Person Enrichment API (`POST /v5/person/enrich`) — a one-to-one match against a known identifier, explicitly a "known-person" shape | PDL's dataset is stated to update **monthly by default** — the coarsest refresh cadence found among the candidates reviewed | Not found in the snippets reviewed — `unknown — requires owner follow-up`; the search explicitly turned up no ToS/redistribution detail | 100 requests/minute default for free accounts; 1,000/minute default for paying accounts; a Bulk Enrichment endpoint exists to raise effective per-request throughput | Charged per match (per successful enrichment) | Account + API key |
| **RocketReach** | People Search API (`/search`) — filtered prospect search | People Lookup API (`/lookupProfile`) — resolves one profile via name/employer/LinkedIn URL/profile ID (the ID a `/search` call returns); a Bulk People Lookup API also exists | 1 credit is consumed only when a verified email or phone is actually found; a lookup that finds nothing is generally refunded, i.e., a "no-result" outcome does not itself carry the same charge as a "found" one — freshness mechanism beyond that was not found in the snippets reviewed | Not found in the snippets reviewed — `unknown — requires owner follow-up` | HTTP 429 on excess; the exact numeric plan-tier caps live behind RocketReach's own rate-limits doc page, which this session could not fetch directly — `unknown — requires owner follow-up` for exact numbers | Annual seat+credit plans seen in third-party pricing summaries: Essentials $399/yr (1,200 lookups/yr), Pro $899/yr (3,600/yr), Ultimate $2,099/yr (full API access); overage roughly $0.30–$0.45/lookup; custom/enterprise pricing from ~$6,000/yr. These figures come from third-party pricing-comparison sites, not RocketReach's own pricing page directly, and should be treated as indicative, not authoritative, until confirmed against the primary source | Account (+ API access tier for programmatic use) |
| **ZoomInfo** | Person Search — filtered discovery, but "there are restrictions on which data points you are able to search by and what content you can receive back," gated by the specific contract's Service Level Agreement | Not clearly distinguished as a separate surface in the snippets reviewed — `unknown — requires owner follow-up` | Not found in the snippets reviewed — `unknown — requires owner follow-up` | Explicit and strict, per ZoomInfo's own License Terms and Conditions: API credentials may not be embedded in third-party applications; API access may not be used to build audience segmentation outside ZoomInfo's own services; "no posting, copying, transmission, retransmission, distribution, redistribution, publication, republication, decompilation, disassembling, reverse engineering, or otherwise reproducing, storing, transmitting, modifying, or commercially exploiting any Proprietary Materials in any form or by any means, for any purpose... without express written permission." This is the strictest reuse posture among the candidates reviewed | Not published generally — "specific details about your account's limits and restrictions" are obtained by emailing `partnerAPI@zoominfo.com`, i.e., contract-specific rather than a public numeric limit | Not found in the snippets reviewed — `unknown — requires owner follow-up`; ZoomInfo is widely known as a contract/quote-based enterprise product rather than self-serve, which is consistent with the contract-gated language above | A negotiated contract/SLA, not a self-serve signup, appears to be the norm based on the language found |

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
