# Search for problems ONE can help investigate

## Result

The search now starts with current operating problems, uses the confirmed product capabilities and limits, and saves a lead only when it has a dated source, an exact supporting quotation, an ongoing problem, and a specific operating decision that ONE could plausibly help investigate. Product fit remains a hypothesis; the evidence does not establish buying intent or access to data.

## Implementation

- Prioritize recent production reports and named plants; reject successful technology stories, solved problems, and physical constraints without a diagnostic decision.
- Require explicit publication metadata within 18 months, independently of the retrieval date. Old reports preceding a now-past planned repair require an outcome update.
- Permit one feedback search if the first batch has no acceptable leads. Two proposal passes, each allowing two Anthropic calls for a paused response and five web searches per call: worst-case 20 search uses, not an unlimited loop.
- Validate generated factual quotations against retrieved text. Keep operating-decision and data-access claims conditional.
- Read up to 64,000 article characters because site operating sections can follow lengthy financial tables. Preserve the existing response-size, HTTPS and content-type limits.
- Show the problem first on result cards, publication and checked dates in Sources, and collapse decision/data details and summary refresh controls.
- Keep qualification thresholds and transactional result saving unchanged.

## Live verification on October 29

Four live searches were used while refining the strategy. The latest completed five web searches, checked four candidates, and saved two records in 73 seconds. Neither passed the separate qualification rule.

1. **Teck, Quebrada Blanca (Chile).** Its October 29 report says recovery was 81.1%, lower than Q2, with wet material, higher clay content and limited feed choices; recovery improvement work continues. ONE might help relate feed conditions to plant recovery using existing operating and lab data, if that decision is not already adequately supported. Existing Teck improvement work must be acknowledged.
   - Saved result: http://127.0.0.1:8080/prospects/3f058f187df1a9a7173f5fad
   - Saved source: https://www.manilatimes.net/2026/10/29/tmt-newswire/globenewswire/teck-reports-unaudited-third-quarter-results-for-2026/2456849/amp
2. **First Quantum, Kansanshi S3 (Zambia).** The October 28 report shows S3 recovery of 80% versus 82% in Q2 and describes feed-quality effects and an ongoing cleaner-recovery validation strategy. ONE might help connect feed, historian and plant-trial data to evaluate operating changes. This is not a claim that the mine lacks its own analysis or that total production declined.
   - Saved result: http://127.0.0.1:8080/prospects/02fc2c66bdde430062361867
   - Saved source: https://www.financialcontent.com/article/gnwcq-2026-10-28-first-quantum-minerals-reports-third-quarter-2026-results
   - Independently checked company report: https://www.first-quantum.com/news/first-quantum-minerals-reports-third-quarter-2026-results/

The initial FQM explanation was weak because extraction stopped before the operating section. After increasing the article limit and specifying the target site in the explanation request, the UI's **Update summary → Read source again** produced the site-specific explanation above. It preserved the assessment outcome and score.

An earlier Capstone Pinto Valley result relied on a July report preceding a planned September shutdown. It was deferred in the UI to November 12 with a reason requesting a current operating update. The record was preserved. Successful technology stories and unsupported candidates were not admitted by the new search gate.

## Checks

- Full operator suite: **360 passed** (293 script tests, 67 source tests), zero failures. Includes real hunt orchestration with stubbed external providers, rejected-first-batch feedback, bounded empty results, publication dates, quotation validation, and late article content.
- Typecheck and production build passed. After the final refresh-button addition, typecheck/build and live refresh were repeated; the full suite was not repeated for that UI-only addition.
- Lint: zero errors, three existing unused-symbol warnings. React Doctor branch-wide result remains 47/100, including existing SearchMonitor complexity; this is not a clean score.
- Latest build restarted through App launcher and is running locally. Browser verified both summaries, clickable source anchors, dates and supporting passages.
- No outreach sent, no owner data or credentials committed, no hosted deployment or PR merge.

## Limits

The model can still misinterpret a quotation even when its text is exact. Both leads need an identified decision owner, available data, and confirmation that the existing improvement team has an unmet analytical need. Reports behind unavailable pages or without recognized date metadata are conservatively skipped. HTML extraction remains bounded and does not read PDFs. Company-name variations can create duplicate records (Teck appeared in two development runs); the two companies above are not a count of all stored records. Scores remain a separate conservative qualification mechanism.
