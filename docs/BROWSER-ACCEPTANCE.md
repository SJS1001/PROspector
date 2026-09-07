# Browser acceptance boundary

`cd site && node scripts/run-browser-acceptance.mjs` is the isolated, local-only A0/A1 browser
acceptance lane. It is intentionally separate from `npm test` and from every
canonical preflight or hosted acceptance command.

The runner creates a unique ignored state root below `site/.local`, applies the
checked `0000`–`0009` migration chain to that disposable Miniflare D1 runtime,
reserves a new `127.0.0.1` port, and runs one Chromium worker with no retries or
server reuse. Bootstrap, Miniflare, and the read-only zero-effect verifier use
the same validated absolute persistence path inside that per-run state root.
Child processes receive a disposable `HOME`, config, cache, temp,
and npm user/global-config paths. An explicit acceptance mode creates a per-run
runtime root containing only allowlisted source symlinks, so Vite discovers no
project `.env*`, `.dev.vars*`, `.npmrc`, or caller account configuration.
Wrangler receives an empty secret allowlist and only the fixed synthetic demo
bindings. The Chromium binary cache is the explicit,
non-secret, ignored `site/.local/playwright-browsers` directory and is the only
cache deliberately retained between runs. The single scenario starts Vite
directly with the current Node executable, avoiding both npm configuration and
Vinext CLI dotenv discovery:

```text
node node_modules/vite/bin/vite.js --config vite.config.ts --port <reserved> --host 127.0.0.1 --strictPort
```

It proves a visibly hydrated blank onboarding screen with no error overlay,
then uses rendered controls to create the synthetic hierarchy `Northstar` →
`Harbor Pulse` → `Port Operations` → `Bulk Terminal Operators`. It submits and
separately accepts owner-written interview answers, requires every accepted
answer to remain on a visible `Confirmed result` with the next authoritative
queue position, and continues until that exact Customer Profile has current
confirmed `fit` Knowledge. The scenario reads the rendered
authoritative progression instead of assuming a question count. A checked
32-step safety bound makes queue expansion fail visibly and require contract
review rather than silently truncating the journey. The server is terminated and
started again against the same isolated state root before the hierarchy and fit
version are re-read through the rendered UI.

Browser routing permits only the reserved same origin. The scenario also proves
that a forged cross-origin mutation is denied before any workspace exists. No
HAR, trace, video, storage-state, cookie, download, or success screenshot is
created. Playwright screenshots are synthetic and failure-only beneath the
ignored run artifact directory, which is deleted after success. The runner
supplies the fixed synthetic local-demo identity only through the acceptance
Worker binding allowlist and does not forward provider or Cloudflare
credentials. Ordinary `npm run dev` behavior is unchanged outside this explicit
acceptance mode.

`node scripts/run-browser-acceptance.mjs --admission-only` is the narrow
diagnostic regression for the same generated runtime, server launcher, and real
Chromium path. It requires `/api/interview` to admit the single fixed synthetic
owner and then runs the incomplete zero-effect check; it does not claim the full
onboarding journey passed.

After the browser closes, `verify-browser-zero-effects.mjs` opens the persisted
SQLite file read-only, requires exactly one synthetic workspace and confirmed
fit version, and proves every operational table covered by the authoritative
`0000`–`0009` browser contract is absent or empty. Tables introduced only by
later local candidate migrations are outside this lane's schema and completion
scope: those migrations are not applied, and this verifier makes no claim about
their rows. It also requires zero local R2 objects and incomplete multipart
rows.
If an earlier browser or server check fails, the runner invokes the
verifier in explicitly incomplete mode: it still proves zero forbidden rows but
does not claim onboarding completion. It emits only table presence/counts and
then the runner removes the disposable state. This proves local browser behavior only; it grants no hosted,
production, provider, prospecting, export, email, call, schedule, credential, or
outbound-effect authority.

Playwright and axe are exact devDependency pins. Install the matching Chromium
binary explicitly with
`PLAYWRIGHT_BROWSERS_PATH=.local/playwright-browsers npx playwright install chromium`.
Browser installation
is a local tool download, not provider activation. If the binary or loopback
permission is unavailable, record that as an environment blocker; do not weaken
the one-worker, persistence, network-deny, or zero-effect checks.

## Person discovery C4 lane

`cd site && npm run test:browser:person-discovery` is a second, isolated acceptance
lane. It does not extend or replace A0/A1. Its generated Worker configuration is
the only place that contains the exact
`PROSPECTOR_PERSON_DISCOVERY_C4=synthetic-zero-network-c4-v1` binding. Runtime
composition additionally requires Vite development mode, local-demo admission,
and a loopback request. Ordinary local development, hosted builds, and the A0/A1
lane therefore receive no person-discovery service and remain reject-only.

C4 applies the complete checked `0000`–`0019` chain to one disposable absolute
Miniflare state path. A guarded local-only route seeds one synthetic Approved
Prospect with its current Product, Market Play, Customer Profile, Offer,
configuration, run, candidate, assessment, and explicit review ancestry. This is
not onboarding and creates no schedule. The secretless deterministic adapter
returns bounded synthetic person suggestions without `fetch` or any provider SDK.

Real Chromium starts directly on `/contacts`, reviews provenance, explicitly
creates one Contact relation, and records separate email and phone verification
intents. Two isolated owner browser contexts submit the same terminal decision;
exactly one wins and the stale request receives `409`, refreshes, and is never
retried. The runtime then restarts against the same state and the rendered
decision must hydrate. The journey also checks status focus, keyboard focus,
serious/critical Axe findings, 360px reflow, hydration overlays, and an allowlist
that aborts every non-loopback browser request.

The read-only C4 verifier requires exact synthetic row counts. Suggestion and
Contact IDs remain distinct, both intents remain unverified, schedules and R2 are
empty, and contact evidence/eligibility/receipts, enrichment authority/spend,
outreach/messages/outbox, exports, and other effect-bearing tables remain empty.
The per-run state and success artifacts are deleted after verification. This is
synthetic local acceptance evidence only and grants no provider, hosted,
production, prospecting, export, email, call, schedule, credential, or outbound
authority.
