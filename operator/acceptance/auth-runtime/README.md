# Built HTTP auth boundary acceptance

Run from `operator/`, alone on port 8080, on Linux or macOS with Node >=22.15
(macOS requires `lsof` and `ps`):

```sh
npm ci --no-audit --no-fund
env -u DATABASE_URL npm run build
node --test acceptance/auth-runtime/boundaries.test.mjs
node --test acceptance/auth-runtime/listener-proof.test.mjs
```

This suite is intentionally separate from the general test command. A red
security regression is a failure, not a skip or accepted release condition.
It uses the real built Node launcher, production request guards, Better Auth,
password hashing, cookie signing and durable PGlite. Production source is never
replaced. Function IDs come from the current build; requests use TanStack's
Seroval wire format, RPC header and error decoder.

Only new physical temporary directories outside the checkout are used. The
child environment is allowlisted, excluding inherited provider credentials,
owner paths, DATABASE_URL and NODE_OPTIONS. A test-only Node preload forbids
all outbound TCP/TLS socket connections in the launcher and its built server;
a self-check proves it throws and records attempts. The run requires zero
runtime attempts. Accepted inbound HTTP sockets are unaffected. No provider
workflow, Gmail navigation, SMTP or paid operation is invoked. This is Node
socket instrumentation, not an OS firewall or a claim about arbitrary native
subprocesses. The offline Vite/PGlite fixture is not provider-dependent.

The non-owner and expired-session fixtures are inserted offline only into the
disposable auth tables, and signed with Better Auth's actual public cookie
serializer using that disposable installation's key. Production auth and
owner admission remain intact. A valid non-owner session is first recognized
by the auth endpoint, then refused by protected reads and mutations.

A genuine owner mutation and read initialize the workspace before baseline.
Around anonymous/non-owner/expired, Host/Origin/proxy/fetch metadata/referrer,
malformed input and export cases, stopped-process snapshots compare sorted
full rows from every public table except `user`, `account`, `session` and
`verification`. Authentication bookkeeping is excluded explicitly. A second
comparison covers logout/lockout. No raw rows or secrets are printed. Listener
proof reads Linux `/proc/net/tcp{,6}` plus the child socket descriptors, or
macOS `lsof` machine fields. Both require exactly one port-8080 listener at
IPv4 127.0.0.1, owned by the launcher's exact immediate server-child PID.
Linux uses `/proc` PID/PPID/NSpid and PID-namespace identity (including nested
containers); macOS uses `ps` PID/PPID inventory. Unknown platforms and unavailable/malformed inventory
fail closed. Parsing fixtures cover macOS positive/negative cases; actual
macOS runtime acceptance must still run there. HTTP uses non-pooled sockets
so idle keep-alive connections do not delay teardown. Port availability is checked by binding before any
HTTP request, so an existing app is never probed.

Production has no synchronizer CSRF token. The missing-CSRF case is accurately
implemented as missing required Origin; same-origin or foreign Referer does
not substitute for it. A made-up CSRF header cannot override foreign Origin.
Malformed function input must decode to an actual RPC Error, including when
TanStack returns HTTP 200. Error responses, RPC errors, archive and runtime
logs are scanned for disposable passwords, owner signing/hash/vault material,
provider sentinel and known session tokens. Intentional authenticated
get-session responses are not claimed to exclude the session token.

Session checks cover cookie attributes, valid non-owner, expiry, tampering,
persistence across process restart, logout revocation and password throttling.
The throttle matrix tries rotating IPv4 addresses, IPv6, chains, malformed
and alternate IP headers, wrong and correct passwords, and verifies no session
is issued during lockout. The loopback single-owner runtime deliberately
ignores all IP headers and shares one per-path throttle budget. Better Auth's
in-memory throttle resets on process restart; cooldown expiry is not asserted.
Password-reset and full recovery acceptance remain owned by the existing
foundation/restart lanes. This suite proves no browser or Mac owner acceptance.
