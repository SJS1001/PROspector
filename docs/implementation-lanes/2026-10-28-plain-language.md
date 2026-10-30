# Plain-language audit — 2026-10-28

The owner could not tell what “Confirm a draft play” meant. The current local app
now names the task and its result in everyday language. Dark colors and the
existing grouped navigation and collapsed details are retained.

## Findings and changes

| Previous wording | Current wording |
| --- | --- |
| Confirm a draft play | Confirm your target market |
| Activate product configuration | Confirm product & find markets |
| Activate profile configuration | Confirm settings & start searches |
| Accounts per hunt | Companies per search |
| Run public-source reveal | Find published contact details |
| Prepare package / Approve package | Create brief / Approve brief |
| Add suppression | Add to do-not-contact list |
| Material signal / Re-entry | What changed? / Review again |
| Greenfield Draft | Save as planned site |
| Digest | Version ID |
| Pain strength / Commercial viability | Customer need / Buying potential |
| Handed off | Gmail requested · delivery unconfirmed |

Reviewed current local screens: Today, Company, Target markets, Searches,
prospect details, Prospect review, Contacts, Drafts & sending, Settings,
diagnostics, and backup/restore. Also searched routes, server-generated errors,
interview defaults, provider hints, status values, and the separate `site/app`
implementation. All sixteen default interview questions have display translations.

A presentation-only mapping translates known older system strings, so saved
questions and common errors receive the same wording. Unknown strings pass
through unchanged. Confirmed and proposed owner answers remain verbatim. Stored
status values, IDs, approval hashes, backend rules and catalog constants are
unchanged. Technical identifiers remain accessible in collapsed details.
AI-generated text and owner-authored text are not indiscriminately rewritten.

Buttons that initiate AI work explicitly say that they start searches. Gmail
wording distinguishes a request to open compose from delivery confirmation.

## Separate legacy application

The repository's `site/app` UI also contains jargon, including “Load current
authority” in `prospecting/profile-readiness.tsx`, and “Proposed Knowledge” /
“owner promotion decision” in `knowledge/knowledge-library.tsx`. That separate
Cloudflare application is not served by the owner's local `operator` runtime.
It is recorded here for a future hosted-app copy pass rather than represented
as fixed in this local-app change. Internal schema names and historical design
documents retain their domain terminology.

## Verification

- Production build and typecheck passed; lint has zero errors and three existing warnings.
- Operator regression suite: 258 script tests + 64 source tests passed.
- Changed-file React Doctor reported no issues.
- Contained browser acceptance passed: 46 harness unit tests, two fictional workflows,
  558 keyboard actions, 312 layout samples at 320/360/768px, ten cancellation
  cases and four recovery scenarios. Zero unexpected browser requests or forbidden
  provider attempts; both Gmail compose requests were aborted.
- The first browser run reached both workflows, then failed on an obsolete recovery
  selector. Updated only the selector text and reran the complete suite successfully.
- Two final Settings help strings changed “paid contact reveal” to “paid contact
  lookups” after the browser test build; the final production build passed and its
  generated Settings asset contains the replacement. These static wording changes
  did not receive another full browser run.
- Owner app restarted on loopback port 8080 and serves HTTP. The browser connector
  could list the owner tab but could not acquire it (“browser.user is unavailable”),
  so a refreshed owner-data UI inspection was not completed this turn.

These checks use fictional data and stubbed providers; real-provider usefulness
and the owner's acceptance remain separate.
The first operator regression run was invalid because foundation readiness
mistook the running owner app for the disposable test server. Added an occupied-
port preflight and verified that it rejects before HTTP requests. The owner app
was then stopped cleanly for isolated verification. The invalid run failed at
read/status assertions; inspected paths did not perform a successful owner
workspace mutation. Fixture writes and password resets use a temporary directory.
