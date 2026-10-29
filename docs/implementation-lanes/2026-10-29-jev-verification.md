# JEV connection and search contribution — 2026-10-29

The saved TypeSafe connection works after correcting the scoring request. A live check returned `jev-1.14.0` and valid answers to all nine questions. A real prospect search used JEV scoring for two sources and changed both assessments, with zero JEV failures.

## Repair and visibility

- Changed score criteria from a numbered object to an ordered array, matching https://docs.typesafe.ai/primitives/score. Validate all requested answers, ranges, choices, confidence and optional model name before merging; malformed responses cannot look like successful reviews.
- Preserve basic scoring on timeout, rejected credentials, rate limits or other failures, and report a safe error instead of silently swallowing it. Provider response bodies and keys are not exposed.
- Settings → Connections & search settings → JEV now says **Key saved**, with **Test JEV connection**. The authenticated server function tests the saved connection using synthetic text and the same nine-question scoring contract.
- Each live search and history entry records attempted, answered, applied, changed, failed and saved-with-JEV counts. Applied includes accepted judgments that agree with basic scoring; changed counts actual score or decision changes. Saved-result counts are committed with the result transaction.
- One-line status, collapsed details, existing dark colors. Older searches say **not recorded**; no historical usage is fabricated.

## Live evidence

Run `be06587e0315fcaaba3fcaf2`, October 29 19:49:33–19:50:57 UTC:

- 10 web searches, four candidate sources checked.
- Kinross Gold and Integra Resources: both JEV requests answered; both scoring judgments used and changed the assessments.
- Both candidates were subsequently rejected by the independent unresolved-problem evidence rule.
- Teck and BHP sources could not be retrieved, so JEV was not called for them.
- JEV: 2 attempted, 2 answered, 2 applied, 2 changed, 0 failed; model `jev-1.14.0`.
- Zero new prospects saved. This validates JEV's contribution, not the discovery of new qualified opportunities.

## Verification

- Full suite: 383 passed (294 script + 89 source tests).
- Final saved-count adjustment and strengthened response-validation tests: focused tests passed.
- Typecheck and production build passed. Lint: zero errors, three existing warnings.
- React Doctor: 47/100 across branch changes; existing complexity warnings in opportunity summary and search monitor.
- Browser: connection button succeeds; running and completed status match stored counts; keyboard opens details; 390px Settings/Searches layouts have no horizontal overflow; no page errors; completed counts survive reload and managed launcher restart; history distinguishes newly recorded usage from older unknown usage.
- In-app browser control was unavailable; checked the local application using Playwright Chromium.
- The dev-only auth-invariant script could not inspect a dev-server flag in this production setup. New function uses existing auth middleware; live same-origin request succeeds, missing-origin request is rejected.

No credentials committed, qualification rules weakened, outreach sent or PR merged. JEV inbox/copy helpers remain outside this search-focused scope. Connection-test status is for that check; per-search history is the persisted record of actual usage.
