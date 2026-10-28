# Local auth lockout trust-boundary fix

2026-10-28. Started from requested PR #138 head
`4d00d1b42b4a5083cb9c0ae68e3521e8c603e660`, based on integration
`8838363ef64698f92ac57ac06d564b3d72d4701f`. Scope: production
`operator/src/lib/auth/server.ts`, focused `operator/acceptance/auth-runtime/`
regressions, and this report. No fns.ts, browser harness, workflow, settings,
provider, owner database, secret, merge, or deployment change.

Published production-only commit: `7b38df3b1acb9849e368365296433b8edc405c14`.
Its tree equals local tested production commit
`5e5b1d3789f37ec5231492355b36d1b66a03030e`. Git HTTPS push had no CLI
credential; publication used the authorized GitHub Git-data connection.
Parent can cherry-pick the published production commit separately. The PR
includes #138's two inherited test/report commits; subsequent changes are
acceptance/report only.

Better Auth 1.6.30 defaults to trusting X-Forwarded-For. Configuring
`advanced.ipAddress.ipAddressHeaders: []` prevents every client-controlled
header from choosing a throttle identity. Tracking/rate limiting stay enabled.
The production fallback is one shared per-path bucket, matching the actual
supported single-owner IPv4-loopback launcher with no trusted proxy boundary.
No fake socket IP or trusted-proxy chain is synthesized. Host/Origin/JSON/body
size guards, sessions, logout and CSRF semantics remain intact.

## Verification

Linux x86_64, Node v24.22.1. Foreground commands; only newly created fictional
disposable directories. HTTP child environment is allowlisted; test-only
outbound TCP/TLS denial remains enabled.

- `npm ci --no-audit --no-fund`: exit 0, 479 packages.
- `env -u DATABASE_URL npm run build`: exit 0 before red and after production fix.
- Unmodified `node --test acceptance/auth-runtime/boundaries.test.mjs`: exit 1;
  X-Forwarded-For bypass reproduced as 401 instead of 429.
- `npm run typecheck`: exit 0.
- `npm test`: exit 0, 251 script plus 64 source tests passed, including HTTP
  foundation/restart/recovery, DB and existing auth tests.
- `npm run lint`: exit 0, three existing warnings, no errors.
- Focused ESLint and `git diff --check`: exit 0.
- `node --test acceptance/auth-runtime/listener-proof.test.mjs`: exit 0, 5/5.
- Final standalone `node --test acceptance/auth-runtime/boundaries.test.mjs`:
  **exit 1; 12 passed, 1 failed (parent teardown), 13 total**. Every child case
  passed: listener/child/inode ownership, owner controls, existing negative
  guards, session persistence/logout, ten spoofed IP-header variants with
  wrong/correct passwords, rotating IPs from attempt one [401,401,401,429].
  The enclosing test fails because final launcher shutdown exceeds ten seconds
  and is group-SIGKILLed. Post-lockout workspace digest and final zero-outbound
  assertions are not reached. This is not green full acceptance.

Intermediate runs corrected my new retry-header assertion (the actual header
is X-Retry-After), PID namespace translation, and inaccessible unrelated /proc
entries. One overlapping run exited without final diagnostics. No incomplete
run counts as passing. Teardown recognizes signaled children and sends graceful
termination to the launcher, which forwards it, retaining bounded group SIGKILL.
The final shutdown failure remains open for the parent's serial combined/Mac run.

## Portable proof, review and limits

Linux uses /proc/net/tcp{,6}, exact PID namespace identity, NSpid translation,
outer PID/PPid lineage and exact immediate server-child socket inode. Hidden
unrelated processes may be skipped; required launcher/child evidence must be
positively identified. macOS uses ps PID/PPID and lsof -nP -iTCP:8080
-sTCP:LISTEN -F pftn. Both require exactly one IPv4 127.0.0.1:8080 listener
owned by the launcher's immediate child. Unknown platforms or unavailable/
malformed required evidence fail closed. Fixtures cover wildcard/IPv6/wrong
port/PID/duplicate/missing records and nested PID mapping. Actual Mac execution
is unverified here and remains for the parent's run.

One read-only independent reviewer found no concrete issue in production or
harness changes. Model/effort were inherited; stronger effective controls or
attestation are unavailable from this launcher. Reviewer ran no tests/servers.

Existing limits: throttle memory resets on restart; local callers can temporarily
exhaust the shared budget; cooldown expiry is untested. No Mac/browser/owner/
provider/release acceptance or hosted phase credit is claimed. No production
bypass, polling, reminders, merge or deployment. Parent must resolve teardown
and pass serial full HTTP acceptance before treating the overall suite as green.
