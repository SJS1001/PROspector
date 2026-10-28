# Concurrent-action handler acceptance

Bounded fictional acceptance for base `8838363ef64698f92ac57ac06d564b3d72d4701f`.
Only this directory is owned by this lane; no production edits.

From `operator/`, Node >=22.15:

```sh
npm ci --no-audit --no-fund
node --test acceptance/concurrent-actions/*.test.mjs
npx eslint acceptance/concurrent-actions/*.mjs
git diff --check
```

The suite reuses the checked `../handler-harness.mjs`: actual fns.ts validators,
workflow handlers, SQL migrations, manual-workflow CAS and archive transactions
run against disposable in-memory PGlite. Its synthetic framework/auth adapter is
**test-only**, not HTTP or production authentication evidence. No owner directory,
provider credentials, real data, browser, Gmail navigation or send is used.

`socket-fence.mjs` loads first and refuses TCP, TLS and UDP connect/send in this
process, including loopback. The existing harness denies fetch, uses counted
hard-failing provider adapters and rejects unreviewed application imports. This
is an in-process runtime fence, not an OS sandbox or OS egress telemetry. Its
separate-process self-test intentionally exercises four blocked APIs. Workflow
cases require zero provider/fetch invocations and zero calls to fenced socket
APIs, zero recorded spend/paid grants, zero delivery events other than explicit
manual handoff and the two documented archive-restore audit kinds, and no dispatch timestamp, stored URL or live lease.

Two simultaneous requests are actual concurrent handler promises over one real
PGlite instance. A query barrier lets both finish their current-state read before
either claims the message. Other barriers commit a changed message body, contact
address, package body, approval timestamp or suppression before the real CAS.
The gate never supplies SQL results or replaces the write. Six suppression
scopes include case/whitespace and normalized phone matching, and each verifies
current CSV exclusion. An additional barrier checks suppression before approval.

Lost-response evidence deliberately discards a completed handler result, reloads
workspace through the real handler, and replays the stale request. It does not
simulate TCP cancellation or a browser reload. Restore evidence uses actual
archive handlers and a fresh in-memory database, with live approvals reset;
reapproving the restored package still cannot reset a terminal message. An older
archive is refused without erasing the handoff event.

HTTP/browser prerequisite remains open: the shared harness replaces framework
and auth admission and has no instrumented built-app HTTP server. This scope
therefore does not prove real tabs, HTTP abort timing, durable process restart,
HTTP/CSRF/auth, browser request fencing or Mac owner acceptance. Those paths
remain owned by their respective lanes. Do not close LOCAL-07 from this result.
