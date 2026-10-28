# Durable process/HTTP acceptance

Run from `operator/`, Node >=22.15, with port 8080 unused:

```sh
npm ci --no-audit --no-fund
env -u DATABASE_URL npm run build
node --test acceptance/durable-restart/*.test.mjs
```

This lane launches the actual built `.output/server/index.mjs` process at the
supported exact loopback origin. It does not test the launcher wrapper or a
browser. Each run enrolls a new fictional owner through the CLI and uses a
physical temporary directory outside the checkout. Child environments are
allowlisted rather than inheriting provider credentials. No owner database is
opened. Children are awaited, and the temporary directory is removed in teardown.

The driver uses actual owner password login, persisted cookies and the installed
TanStack/Seroval server-function HTTP protocol. Production owner admission,
validators, handlers, migrations, DB adapter and vault remain intact. Knowledge
proposal/confirmation, product/play/profile activation, prospect review, public
contact enrichment, package/message preparation and exact approval, connection
saving and suppression all use admitted HTTP paths. No fixture SQL is run by the
driver. The provider test adapters return/write only labelled fictional results.
This proves handler integration with those adapters, not real discovery quality.

`runtime.mjs` is a test-only Node preload; production never imports it. Its
source hook requires exactly three checked built provider functions and substitutes
fictional discovery/hunt/reveal adapters. The discovery and hunt stubs verify the
saved fictional key through the real vault reader, including after restart.
The same preload denies and counts Node fetch, outbound TCP, TLS and UDP socket
creation. `fence.test.mjs` verifies all four denial paths before any connection.
The fence is Node API instrumentation, not an OS firewall or a claim about arbitrary
native addons. The driver HTTP client is outside that child fence.

Only explicit activation/enrichment may increment the expected adapter sequence:
`discovery`, `hunt`, `reveal`. Every process startup and repeated authenticated
workspace HTTP reads must leave counts unchanged; any network denial also fails
the sequence assertion. This is HTTP read/reload-equivalent evidence. It cannot
prove browser mounting, an overnight tab, keyboard use, or browser reload effects.
No compose/Gmail navigation, paid call, SMTP, archive or restore is performed.

The server receives SIGTERM, must exit within 20 seconds, and must release its
DB lock before the separate snapshot reader opens the same durable database.
Timeouts fail; cleanup kills and reaps the child before removing disposable data.
There is no synthetic shutdown handler and no manual stale-lock removal on the
passing path. Intermediate complete stops let the driver obtain exact IDs and
digests from persisted rows without bypassing mutation admission.

The final before/after snapshots compare all inventoried public tables, with
canonical row ordering and every workflow field retained (including timestamps,
approvals, review history, run status and suppression). Auth `session`, `account`
and `verification` are excluded: session revocation and fresh reauthentication
are tested over HTTP, and snapshots must not contain password hashes/tokens.
`operator_secrets` is represented only by a ciphertext-row SHA-256 digest.
The `user` identity and migration inventory remain in the comparison. Required
workflow tables must be populated, and the message must remain approved across
the final restart. Failure output identifies only a changed table, not its rows.
Temporary snapshots, cookies, keys and owner files are never committed.

The release's browser, owner-use, recovery and provider-quality gates remain open.
See `docs/implementation-lanes/2026-10-28-durable-restart.md` for exact evidence.
