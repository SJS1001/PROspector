# Understandable prospect explanations — 2026-10-29

## Delivered

Prospect records now lead with five short answers: what the company/site does, what is happening, its unresolved problem (if supported), where the seller's product could help, and what to find out next. The existing dark palette is unchanged. Scores and technical assessment details are collapsed. List cards show the situation and whether a need is established instead of raw scraped text.

Sources have clickable article titles, a short situation summary, the retrieval date, and collapsed supporting passages. The article reader removes navigation, scripts, menus and surrounding page furniture, prefers article content, and decodes HTML entities. Keeping a bounded HTML head intact fixes a large-style-block parsing failure observed on the International Mining article.

Explanations use the saved search profile and configured provider. Facts require exact supporting passages from the retrieved page; possible fit is explicitly conditional. New searches cannot pass qualification based on keyword scores alone when the explanation establishes no unresolved problem. Explanation failure retains the source for review and allows a retry from the record. Updating an existing explanation preserves its score, qualification and workflow state, and uses a revision check to prevent overwriting concurrent changes. Explanations survive backup/restore; invalid imported source links are rejected.

## Real-data result

The three existing live records were refreshed from their actual public source pages using the saved Anthropic configuration:

- Centinela: existing SIRO MINCO deployment and a second concentrator under construction. An opening for ONE is conditional on decisions not already covered by those systems.
- Los Pelambres: existing SIROSAG improvements and other technology trials. The next question concerns decisions or data outside the existing systems.
- MMG Dugald River: a successful flotation digital twin. The next question concerns unmet decisions beyond that scope.

All three correctly state that the source does not establish an unresolved problem. They remain research candidates with insufficient evidence, not qualified sales opportunities. No new full search or outreach was run in this follow-up.

## Verification

- Full operator suite: 356 passed (289 script tests + 67 source tests), zero failures.
- TypeScript and production build passed. Lint has zero errors and three existing unused-symbol warnings.
- Regression coverage includes article extraction, oversized style blocks, exact quote validation, malformed explanations, safe source URLs, and archive round-trip/rejection.
- All three existing live records generated explanations successfully. A retrieval error was visible and retry succeeded after the parser correction.
- Browser: sources expose HTTPS anchors; supporting passages open by keyboard; 390px layout has no horizontal overflow; Centinela's saved explanation survives a managed restart.
- Latest production build is running under App launcher. An actual Mac reboot was not performed.
- React Doctor reports 47/100 across the branch's changed files, including existing SearchMonitor complexity. This is not a clean whole-app quality certification.

## Limits

Exact quotation checks establish that cited text exists, not that every generated interpretation logically follows from it. Summaries and conditional fit still need human judgment. Source-tier classification remains conservative. Automated checks cover extraction and explanation validation; this follow-up's live checks exercised the existing-record explanation path. A complete new search with automatic explanations was not rerun. This report supplies local operator evidence only, not hosted acceptance. Credentials and owner records are excluded from Git.
