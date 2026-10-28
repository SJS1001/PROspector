# Durable restart acceptance lane — 2026-10-28

Scope: `operator/acceptance/durable-restart/` and this handoff only. No production,
auth, archive, workflow, hosting, settings or other acceptance-lane edits.

## Provenance and execution

- Repository: `SJS1001/PROspector`; disposable cloud scratch clone.
- Fetched `codex/local-app-integration`; verified exact pre-edit base
  `8838363ef64698f92ac57ac06d564b3d72d4701f`.
- Branch: `codex/durable-restart-acceptance-20261028`.
- Linux 6.18.55, x64; Node v24.22.1; npm 11.9.0;
  PGlite 0.5.8; TypeScript 5.9.3.
- No named environment selector was exposed; the authorized disposable checkout
  was sufficient. One read-only scoped subagent reviewed transport/design and
  teardown/evidence claims. Parent/child effective model and reasoning settings
  were not exposed; no claim of a requested model override is made.

Read the repository entrypoint and required continuation, local task, integration,
operator and acceptance runbooks, plus the baseline/planning authority records.
The local owner instruction authorizes this durable fictional lane; historical
hosted/demo limits and acceptance gates remain unchanged.

## Implementation and evidence

The built production server runs as a separate real HTTP process on exact
`http://127.0.0.1:8080`. CLI enrollment creates a fresh owner in an outside-checkout
physical temporary directory. The runtime inherits an allowlisted environment
with no remote database or provider credentials. Test-only preload replaces
exactly discovery, hunt and public reveal provider boundaries; real owner auth,
HTTP serialization, validators, workflow handlers, encryption, migrations and
durable PGlite remain in use. No handler-only evidence is claimed as process proof.

Actual HTTP creates/updates confirmed fictional interview knowledge, a proposal
and confirmed play, a qualified/reviewed fictional prospect, public-source contact,
exact approved package/message, saved encrypted fictional configuration and a
domain suppression. Every intermediate runtime is fully stopped and its DB lock
released before a separate process reads the same physical database for IDs and
digests. The final restart compares canonical rows across the public-table
inventory, excluding auth session/account/verification and representing secrets
only by ciphertext digest. Review history, run rows, approval fields, suppression,
owner identity and migration rows are preserved. Required workflow collections
are nonempty and the message remains approved.

The original session remains valid after restart. Logout revokes it, and a fresh
password login returns the same owner. A saved fictional provider key is read
through the real vault by the discovery adapter, and by the hunt adapter after a
complete process stop/restart. No key/cookie/hash/snapshot is committed or printed
by successful tests.

Runtime Node fetch/TCP/TLS/UDP paths deny and count attempted outbound work.
Independent fence self-tests verify four refusals before connection. Explicit
setup invokes exactly one discovery, one hunt and one reveal adapter. Every
startup and repeated workspace HTTP read leaves counters unchanged; the final
sequence has no network attempts. These are HTTP read/reload-equivalent checks,
not a browser reload or overnight-tab claim.

Commands run from `operator/`:

| Command | Result |
| --- | --- |
| `npm ci --no-audit --no-fund` | exit 0; 479 packages |
| `env -u DATABASE_URL npm run build` | exit 0; production output and PGlite assets generated |
| `node_modules/.bin/eslint acceptance/durable-restart/*.mjs` | exit 0; no findings |
| `node --test acceptance/durable-restart/*.test.mjs` | exit 0; 2 passed, zero failed/skipped |
| `git diff --check` | exit 0 |

The process case takes approximately one minute and performs five complete
server lifecycles against the same directory. All tests run in the foreground;
no test runtime remains running at handoff.

## Limits and findings

An early 10-second shutdown deadline timed out once during harness development.
A temporary diagnostic PGlite-close handler isolated the row comparison; it was
removed. Two subsequent default production SIGTERM runs passed with no diagnostic
handler. This is an unconfirmed timing observation, not an asserted production
defect. The final harness permits 20 seconds, fails on timeout, kills/reaps before
cleanup, and never removes a stale lock to manufacture a passing restart.

The Node API fence is not an OS firewall or a native-addon sandbox. Adapter results
are fictional fixtures, so provider quality, source evaluation and real-provider
cost/provenance remain unproved. The driver bypasses no auth, but starts the built
server directly; launcher-wrapper behavior belongs to existing foundation tests.
Browser mount/reload, overnight tabs, archive recovery, race/auth matrices,
keyboard/responsive behavior and owner acceptance belong to their respective
lanes. No owner database, real provider, paid call, SMTP, Gmail navigation, merge,
deployment or CI run was used. No reproducible cross-scope production defect was
found. LOCAL-07 and all hosted gates remain open.

## Handoff

Run the commands in `operator/acceptance/durable-restart/README.md` on the intended
combined candidate. Bundle function-name drift fails closed instead of silently
removing instrumentation. Review this lane's scoped diff and integrate only through
the draft PR against `codex/local-app-integration`; no merge is authorized here.
The final commit SHA is carried by the draft PR and final handoff, avoiding a
self-referential source-SHA claim inside its own commit. No further CI polling or
scheduled follow-up is required.
