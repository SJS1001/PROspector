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
