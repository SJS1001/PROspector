# Batch 10: site: make the lane-bootstrap foreign-key checks real and the discovery replay test a real replay

Severity: low. App: site. Base branch: `claude/owner-local-completion-20261109`.

Files: `site/scripts/person-discovery-browser-bootstrap.mjs`, `site/scripts/operator-journey-browser-bootstrap.mjs`, `site/tests/discovery-handler-ui.test.mjs`

Findings: C4 and E1 browser-lane bootstrap foreign-key check can never fail; Discovery 'replay-safe' guarantee is regex-only, and the behavioural 'replayToken' step never replays a token

## Brief

Repo: PROspector. Work only in site/. Base branch: claude/owner-local-completion-20261109. Before editing, read AGENTS.md and the root COMPLETION_LEDGER.md.

GOAL: one PR making two test guards able to fail. No product behaviour changes.

FINDING 1 (low). site/scripts/person-discovery-browser-bootstrap.mjs:22-26 and site/scripts/operator-journey-browser-bootstrap.mjs:22-26 run `wrangler d1 execute ... PRAGMA foreign_key_check` without --json and fail only if `check.status !== 0 || /\"results\":\[\[[^\]]/.test(check.stdout)`. Wrangler 4.116 pretty-prints `"results": [` with a space, and violation rows are objects (`[{`), so the regex never matches and FK violations with exit 0 print 'ready'. site/scripts/local-bootstrap.mjs already does this correctly (--json, JSON.parse, payload[0].results; see readRows and tests/local-bootstrap.test.mjs query()).
Required fix: in both bootstraps, pass --json, JSON.parse stdout, and throw on a parse failure, a non-array envelope, a missing payload[0].results array, or a non-empty results array. Prefer extracting a small shared helper ONLY if local-bootstrap.mjs already exports one. Otherwise implement it inline in each file; do not edit local-bootstrap.mjs.
Test first: add a test (for example site/tests/lane-bootstrap-fk-check.test.mjs) that exercises the parsing/decision function with three cases: a real wrangler-shaped JSON envelope with an empty results array (pass), the same with a violation row object (fail), and non-JSON stdout (fail). Export the decision function from each script (or a module-level function) so it is testable without wrangler or loopback.

FINDING 2 (low, test quality). site/tests/discovery-handler-ui.test.mjs:93-94 names a variable replayToken, but it is a fresh token from a new GET. The earlier cross-origin 403 is rejected by validateSameOriginMutation before consumeCsrfToken, so it never uses a token, and the asserted 409 comes from a command conflict (productId 'anything'). The 'D-12 ... replay-safe' test (:100-122) only regex-matches source text (/consumeCsrfToken/, /409/, /413/, /8192/). The handler (domain/discovery-handler.ts:67-80) is currently correct; this is a coverage gap.
Required fix: in the D1 boundary test, send a valid mutation with token T (one that reaches consumeCsrfToken, for example read_current_state or an action that returns a deterministic result), then send the same T again and assert 403 {error:'invalid_csrf_token'} with no state change. Add a body over MAX_DISCOVERY_BODY_BYTES (8192) with a fresh valid token and assert 413 payload_too_large before dispatch (no state change). Remove the regex-only 'replay-safe' assertions, or rename that test to state that it checks source structure only. Do not edit domain/discovery-handler.ts.

FOCUSED COMMANDS (from site/, after npm ci): `node --test tests/lane-bootstrap-fk-check.test.mjs`, `npm run build && node scripts/run-test-suite.mjs tests/discovery-handler-ui.test.mjs tests/local-bootstrap.test.mjs`, `npm run lint`. Optionally (local only) `npm run test:browser:person-discovery` and `npm run test:browser:operator-journey` to confirm the bootstraps still reach 'ready' on a clean chain. From the repo root, run `node --test tests/completion-ledger.test.mjs`. Miniflare/wrangler needs loopback. EPERM is an environment limit: record it, never weaken tests.
CONSTRAINTS: local and synthetic only. Do not use wrangler against any remote or hosted D1 (local --local only), and do not touch migrations. Take no plan credit and mark no requirement verified. Edit only the listed files plus the new test file. Before ending, append a COMPLETION_LEDGER.md session entry with the changes, the commands run with counts, the SHA, the time and the session. If the ledger conflicts with another batch, keep both entries.
