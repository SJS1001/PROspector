# Built HTTP auth/mutation boundary lane

2026-10-28. Scope: `operator/acceptance/auth-runtime/` and this report only.
Base verified before edits: `8838363ef64698f92ac57ac06d564b3d72d4701f` from
`codex/local-app-integration`. Disposable cloud checkout; no published runtime
selector was exposed. No other lane's files or production source changed.

## Evidence and commands

Linux 6.18.55 x86_64, Node v24.22.1, npm 11.9.0. Installed lockfile versions:
Better Auth 1.6.30, better-call 1.4.0, Seroval 1.6.5.

- `git fetch origin codex/local-app-integration` — exit 0.
- `git checkout -b codex/auth-runtime-boundaries 8838363ef64698f92ac57ac06d564b3d72d4701f` — exit 0.
- `git rev-parse HEAD` — exact base above, before edits.
- `cd operator && npm ci --no-audit --no-fund` — exit 0, 479 packages.
- `env -u DATABASE_URL npm run build` — exit 0, production Node bundle and PGlite assets built.
- Focused lint, final suite counts and exact handoff SHA recorded below after execution.

The strong scoped security reviewer was explicitly launched as GPT-6 Astra,
high reasoning, read-only. Parent model/effort controls and effective metadata
are not exposed by this launcher. Reviewer-requested fixes included genuine
successful protected POST control, actual signed non-owner session, correct
TanStack transport, zero-delta snapshots around the negative cases, bind-only
preflight, process-group teardown, RPC error scanning, and outbound-denial
telemetry. All were applied within the owned acceptance paths.

## Reproduced cross-scope security finding

**High: untrusted forwarded IP bypasses password lockout.** After repeated
incorrect owner-password attempts produce 429, a correct password also gets
429. Repeating the wrong password with `X-Forwarded-For: 192.0.2.123` instead
gets 401, demonstrating another password verification attempt is admitted.
The regression expects 429 and remains failing. No production workaround or
auth bypass was introduced.

Source handoff: `operator/src/lib/auth/local-request.ts` rejects Forwarded,
X-Forwarded-Host and X-Forwarded-Proto but permits X-Forwarded-For.
`operator/src/lib/auth/server.ts` leaves Better Auth's IP resolution defaults.
The installed Better Auth resolver trusts X-Forwarded-For for rate-limit keys.
The production-auth owner should reject untrusted IP authority or explicitly
configure rate-limit identity for this loopback-only server, then rerun this
suite. Rotating multiple IPs and cooldown expiry are not needed to establish
this reproduced bypass and were not run.

## Limits and handoff

See the suite README for isolation, fixture provenance, full-table comparison
and secret-scan boundaries. Only fictional credentials/data were used. No
owner database, real provider, SMTP, Gmail navigation, paid call, deployment,
merge, repository setting, workflow change or CI run occurred. No browser,
Mac owner, provider quality or release acceptance is claimed. LOCAL-07 and all
hosted gates remain open. Test processes are stopped and disposable state is
removed before handoff. The suite must remain red until the production owner
fixes the lockout bypass; do not waive it to close acceptance.

## Final execution record

Exact tested acceptance source commit:
`795d85315d04aebc1c838db046591e7728f551db` (published suite; this report is the subsequent
documentation-only commit). The locally tested commit was
`893cbccec9ec6acbd105bafdc7e6abd32d266a46`; its Git tree is identical to the
published suite tree `8aeddff2ef0144df3fb856f3d3a4d5079ee7fc57`. Git HTTPS push lacked CLI
credentials, so publication used the authorized GitHub Git-data connection. The production build remains the verified exact
base; no production file changed between build and execution.

- `npx --no-install eslint acceptance/auth-runtime/*.mjs` — exit 0.
- `node --test acceptance/auth-runtime/boundaries.test.mjs` — exit 1;
  12 total test nodes, 10 passed, 2 failed, zero cancelled/skipped/todo.
  Eleven are child cases: ten pass; the sole substantive failing child is
  the X-Forwarded-For lockout assertion (`401 !== 429`). The other failed node
  is its parent, not a second defect. Final run duration: 37.848 seconds.
- The normal lockout and correct-password-during-lockout assertions passed
  before the forwarded-IP regression failed.
- Both offline full non-auth public-table digest comparisons passed: no
  workspace delta around negative boundaries/export or logout/lockout.
- Loopback listener, positive owner mutation, authenticated non-owner and
  expired-session denials, 13-case authority matrix over three mutation
  endpoints, malformed auth/RPC input, auth route allowlist, tampered cookie,
  secret absence in errors/export/logs, session restart and logout passed.
- Outbound fence self-check passed; runtime outbound attempts were exactly
  zero. All runtime/launcher/fixture processes finished in the foreground;
  disposable directories were removed. No test is left running.
- `git diff --check` — exit 0. Changes are restricted to the two owned paths.

Handoff: production-auth owner must repair the forwarded-IP rate-limit key
boundary and rerun the documented command. Integration owner should preserve
this red regression and keep acceptance open. The draft PR targets
`codex/local-app-integration`; no merge or CI polling is part of this lane.
