# Anthropic live search and progress — 2026-10-29

## Delivered

Anthropic prospect searches now invoke the web_search tool using the saved model and optional workspace header. A search must include a successful web-search result and finish normally before candidates are accepted. Provider errors, tool errors, truncated output and malformed candidate JSON are explicit failures; valid empty candidate arrays remain valid empty results. Research is bounded to two provider responses, five tool uses per response, and a shared three-minute timeout.

The dark search monitor shows an animated running indicator, elapsed time, Search the web / Check sources / Save results stages, counters, and collapsed activity details. Progress is persisted and polled, so reloading keeps the current run visible and prevents duplicate starts. Web-search counts update when the provider response arrives; individual queries are not streamed. Reduced-motion styles and a narrow-screen layout are supported.

Source retrieval rejects PDFs, binary/NUL content and empty pages. Retrieved source failures cannot fall back to an AI-provided excerpt. Saving prospects, evidence and the completed run is atomic. Transient progress is excluded from the existing version-one backup archive format. Prospect detail routing now renders its child page correctly.

## Real-data verification

The first live run used five web searches and checked nine candidates, then exposed a binary-source database error. It saved no prospects. The retrieval guard and atomic save fixes were applied before rerunning.

The second live run completed in 29 seconds with five Anthropic web searches and three saved prospects:

| Prospect | Score | Qualification |
| --- | --- | --- |
| Antofagasta Minerals — Centinela concentrator | 8/10 | Not enough evidence |
| Antofagasta Minerals — Los Pelambres concentrator | 8/10 | Not enough evidence |
| MMG Dugald River | 5/10 | Not enough evidence |

The UI identifies these as search results, separate from the seven existing sample records. All three persisted through a managed app restart. List-to-detail and return navigation worked, and the Sources disclosure opened by keyboard.

Saved source pages were independently opened and checked:

- [International Mining, 27 March 2026](https://im-mining.com/2026/03/27/antofagasta-plc-copper-growth-delivery-going-hand-in-hand-with-innovation/) discusses SIRO deployment at Centinela and Los Pelambres.
- [MMG, 20 July 2026](https://www.mmg.com/investors/news-centre/169701/) describes Dugald River's digital twin and names the staff mentioned in the result.

These are real discoveries, not three qualified leads. Qualification rules were unchanged. No outreach was sent. Source snippets still include navigation boilerplate on some pages, and source-tier classification remains conservative; improving extraction and classification is a separate follow-up. Named people are source mentions, not verified contacts.

## Checks

- Full operator test suite: 350 passed (284 script tests + 66 source tests), zero failures.
- TypeScript and production build passed; repeated after the detail-route correction.
- Lint: zero errors, three pre-existing unused-symbol warnings.
- React Doctor: 77/100, one changed-scope complexity warning in SearchMonitor; no remaining index-key warning.
- Browser: active-run reload, disabled duplicate start, successful and failed progress states, 390px monitor layout, keyboard disclosure, result/detail navigation, and restart persistence verified.
- Latest production build is running under the installed App launcher service.

This is local operator evidence only. It does not satisfy hosted phase acceptance gates. No credentials, owner data, workflow settings or generated prospect records are committed to Git.
