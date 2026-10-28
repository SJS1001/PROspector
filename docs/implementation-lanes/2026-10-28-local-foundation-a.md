# Lane A — local foundation action log

- Owner scope: LOCAL-01/03 in `operator/`; no workflow/archive `fns.ts`, hosted site, CI, provider or release actions.
- 2026-10-28: fetched origin and verified `operator-os` equals expected `2d476b9d2e6bc37f1352444dd95de58b5537f798`; no advanced commits. Created `codex/local-foundation-a` from that exact source.
- Scope read from `origin/codex/local-completion-checklist:docs/LOCAL-APP-TASKS.md` (PR #126), without switching source branches. Read branch AGENTS and required continuation/greenfield/planning/Phase 2 records. Current task is owner-authorized local implementation; hosted plan credit remains unchanged.
- Runtime: Linux, Node v24.19.0, npm 11.9.0. `npm ci --no-audit --no-fund`: exit 0, 479 packages installed.
- Tools expose model/effort controls but no effective-model attestation. Requested `gpt-6.1-terra` / medium for scoped database implementation and `gpt-6.1-sol` / high for independent security review. Primary model identity not runtime-verified. Two sub-agents used; no additional agents.
- File ownership: DB agent owns db.ts, local-data.mjs and focused DB tests. Main owns startup/auth/session/vault/public templates, foundation tests/runbook/log. Security agent read-only. No other lane files to be reverted.
- Implementation decision: CLI-only single-owner password enrollment using Better Auth's password hashing; fixed local sign-in endpoint, persistent owner ID and session signing configuration; no sandbox OAuth/gate/bearer fallback. Durable PGlite in stable private OS data directory. Add callback transaction contract for archive integration.
- Acceptance pending: Linux process-restart/negative HTTP/security tests, build/typecheck and scoped checks; owner Mac verification, real-provider quality, owner daily workflow and recovery acceptance remain unperformed.

## Implementation / handoff checkpoint

- Preserved all existing migrations and `fns.ts` function boundaries. No workflow/archive function patch from Lane A needs merging; combine Lane B/C's distinct function patches explicitly.
- Added `Sql.transaction(callback)`: callback receives pinned tagged/query `tx`; resolve commits, throw/reject rolls back, nested transactions reject. No outer client calls inside callback; await all operations. Lane C can integrate directly without API rewrites.
- Added stable OS data directory, exclusive process lock, private files, no automatic stale-lock removal, CLI owner setup/password recovery, and persistent Better Auth sessions. Default app startup rejects configured remote DB and binds exact 127.0.0.1:8080.
- Removed sandbox broker/gate/bearer runtime auth and preview bridge. Added tracked local manifest/config template and generated bundled PGlite WASM assets from locked npm package. No private asset/config required.
- Independent security reviewer found and verified fixes for missing-vault replacement/hidden failure, reset locking race, in-checkout private storage and vault parent-symlink bypass. Current source verdict: GO for Lane A, no high/medium finding. Independently ran DB test 2/2 exit 0, eight guard admission/denial assertions, recovery assertions, vault alias rejection and diff check exit 0.
- Preliminary build/typecheck exit 0. Initial HTTP regression exposed missing bundled PGlite assets; fixed build generation. Later HTTP run proved login/restart/logout/recovery but two negative-test transport/status assertions needed correction; final evidence below supersedes these preliminary results.
- Preliminary canonical lint reproduces existing `src/lib/app-data/client.server.ts:281` no-empty error and five warnings. General repair remains Lane D; no assertions weakened. Full test suite also retains sandbox-template assumptions for Lane D to reconcile with the local contract.

## Verified implementation checkpoint (Linux, 2026-10-28)

- `npm run typecheck`: exit 0.
- `npm run build`: exit 0; Node server output plus three PGlite package assets generated. Independent review compared copied assets byte-for-byte with installed package.
- `npm run test:foundation`: exit 0. DB tests **2 passed / 0 failed**; HTTP/recovery tests **9 passed / 0 failed** (8 leaf cases plus enclosing lifecycle). Separate write/read processes, three production-server starts and a dev-server start used fictional temporary data only. No real provider, SMTP or spend.
- HTTP evidence: owner sign-in 200, unauthenticated protected workspace 401, wrong password 401, foreign/missing Origin and raw hostile Host/proxy/fetch metadata 403, blocked signup/OAuth/change-password 404, form encoding 415. Sessions and seven fictional table snapshots survive process restart; logout and password reset revoke sessions. Dev login/manifest 200 and private file requests 403. Credential stub decrypts persisted fictional ciphertext after restart; no secret output.
- Exact unmodified SQL migrations remain `0001_auth.sql` through `0008_operating_complete.sql`; no schema reset or migration rewrite. Existing migrations have filename-only journal identity; checksum migration hardening is not claimed.
- Security re-review after final deltas: GO, no high/medium finding; explicitly bounded to Lane A foundation. Mac/owner/provider acceptance remains unperformed.

## Final clean-checkout evidence and integration instructions

Implementation source: `4abf8ef1d01a5f6e7fae12e9893af928a9ce21a4` (following `948fbe5dc972c57366fb2733f9d78ce160f7a50c`); both descend directly from `operator-os` base `2d476b9d2e6bc37f1352444dd95de58b5537f798`. The final follow-up commit updates this evidence only. Clean detached worktree: `/tmp/prospector-lane-a-clean`, with no private sandbox config/assets. Linux Node `v24.19.0`, npm `11.9.0`.

| Command / check | Exact result |
| --- | --- |
| `npm ci --no-audit --no-fund` | exit 0; 479 packages installed |
| `npm run owner:setup` with a fictional password on stdin and a new temporary `OPERATOR_DATA_DIR` | exit 0; password not echoed |
| `npm run build` | exit 0; generated Node server and package-supplied PGlite assets |
| `npm run typecheck` | exit 0 |
| `npm run test:foundation` | exit 0; **2/2 DB tests + 10/10 HTTP/recovery tests** (9 HTTP leaf cases and enclosing lifecycle); 0 failures |
| ESLint on all changed TS/TSX/JS foundation files | exit 0 |
| `git diff --check` | exit 0 |
| `npm run lint` | exit 1; **1 existing error / 5 warnings**; error remains `src/lib/app-data/client.server.ts:281` (`no-empty`) |
| Canonical `npm test` | exit 1; script stage **188 pass / 19 fail / 207 total**; chained domain stage therefore not executed by this command |
| Separate exact domain/auth/retrieval command from package.json | exit 0; all 6 files pass; direct execution exposes **64 cases passed / 0 failed** (25 + 3 + 24 + 3 + 7 + 2) |

Canonical failures are preserved and explicitly handed to Lane D: `brand-check.test.mjs` (3), `check-auth-invariant.test.mjs` (1), `grok-pwa-plugin.test.mjs` (10), `migration-plan.test.mjs` (1), `with-app-env.test.mjs` (3), `write-atomic.test.mjs` (1). They assert missing sandbox skill/config/assets or old template/hosting/auth wiring. The Nitro serverDir assertion is incompatible with the intentional local build; reconcile it to the local contract rather than re-enabling hosted middleware. No existing test assertion was deleted or weakened. A new direct-Node import extension regression was found and fixed in `4abf8ef`; the domain/auth/retrieval cases then passed 64/64.

The clean-checkout HTTP gate additionally proves authenticated owner workspace read 200 with fictional company content, active-session invalidation and old-password refusal after reset, and dev-mode password throttling (401/401/401/429). It launches production and development servers on loopback in foreground child processes, stops them within bounded waits, and removes only its own fictional temporary directories.

Integration:

1. Integrate the Lane A commits into `operator-os`; do not target main or replace the checklist branch. Preserve other lane commits.
2. Lane C: call `await sql.transaction(async tx => { ... })` for atomic restore; use only callback `tx`, await every operation, throw on any failure. No `fns.ts` hunk is supplied by Lane A; combine Lane B/C's distinct function patches without wholesale file replacement.
3. Lane B: use the persisted server-derived owner ID from unchanged middleware context. Foundation startup does not implement manual-only workflow/scheduler/provider controls; retain your server-side safeguards.
4. Lane D: retain new foundation tests, local manifest and Node build assets, adapt obsolete template checks to the supported local contract, and fix general lint/test issues in your lane. `npm run test:foundation` requires a build and free port 8080; run it sequentially with other app-server tests.
5. Owner/Mac verification remains required. LOCAL-01/03 implementation and Linux fixture evidence do not mark Mac launch, real provider acceptance, daily workflow, versioned archive recovery, or LOCAL-07 owner acceptance complete. No deployment, merge, SMTP delivery, paid reveal, real provider call/spend, workflow change, hosted provisioning or retired-project access occurred.

Draft PR title: **Local app: durable startup and owner access**. Branch: `codex/local-foundation-a`; base: `operator-os`. Stop after draft PR creation; no CI polling, reminders or scheduled follow-up.
