# Browser acceptance boundary

`cd site && npm run test:browser` is the isolated, local-only A0/A1 browser
acceptance lane. It is intentionally separate from `npm test` and from every
canonical preflight or hosted acceptance command.

The runner creates a unique ignored state root below `site/.local`, applies the
checked `0000`–`0009` migration chain to that disposable Miniflare D1 runtime,
reserves a new `127.0.0.1` port, and runs one Chromium worker with no retries or
server reuse. The single scenario starts the documented Vite/Miniflare command:

```text
npm run dev -- --port <reserved> --host 127.0.0.1 --strictPort
```

It proves a visibly hydrated blank onboarding screen with no error overlay,
then uses rendered controls to create the synthetic hierarchy `Northstar` →
`Harbor Pulse` → `Port Operations` → `Bulk Terminal Operators`. It submits and
separately accepts owner-written interview answers until that exact Customer
Profile has current confirmed `fit` Knowledge. The server is terminated and
started again against the same isolated state root before the hierarchy and fit
version are re-read through the rendered UI.

Browser routing permits only the reserved same origin. The scenario also proves
that a forged cross-origin mutation is denied before any workspace exists. No
HAR, trace, video, storage-state, cookie, download, or success screenshot is
created. Playwright screenshots are synthetic and failure-only beneath the
ignored run artifact directory, which is deleted after success. The runner
passes only fixed synthetic local-demo identity values to child processes and
does not forward provider or Cloudflare credentials.

After the browser closes, `verify-browser-zero-effects.mjs` opens the persisted
SQLite file read-only, requires exactly one synthetic workspace and confirmed
fit version, and proves every Phase 2 plus Phase 3–5 operational table is absent
or empty. It also requires zero local R2 objects and incomplete multipart rows.
If an earlier browser or server check fails, the runner invokes the
verifier in explicitly incomplete mode: it still proves zero forbidden rows but
does not claim onboarding completion. It emits only table presence/counts and
then the runner removes the disposable state. This proves local browser behavior only; it grants no hosted,
production, provider, prospecting, export, email, call, schedule, credential, or
outbound-effect authority.

Playwright and axe are exact devDependency pins. Install the matching Chromium
binary explicitly with `npx playwright install chromium`. Browser installation
is a local tool download, not provider activation. If the binary or loopback
permission is unavailable, record that as an environment blocker; do not weaken
the one-worker, persistence, network-deny, or zero-effect checks.
