# Sanitized execution and handoff

Date: 2026-10-28. Disposable cloud scratch clone, Linux 6.18.55 x86_64,
Node v24.22.1, npm 11.9.0. No named published-environment selector was exposed;
the explicitly authorized scratch checkout was used.

`git fetch origin codex/local-app-integration` returned exactly
`8838363ef64698f92ac57ac06d564b3d72d4701f`, verified before edits. Branch:
`codex/concurrent-actions-acceptance-20261028`. Only
`operator/acceptance/concurrent-actions/` changed. The final commit SHA is the
commit containing this record (also recorded in the PR handoff).

The launcher exposes no parent model/effort controls or effective model identity.
One inherited-settings subagent performed read-only review of the handoff CAS
and this test implementation; it owned no writable files and ran no tests.
No concrete production defect was identified. It requested clearer socket-counter
wording, incorporated here. No other agent or production path was modified.

Commands from `operator/`:

| Command | Result |
| --- | --- |
| `npm ci --no-audit --no-fund` | Exit 0; 479 packages; no lockfile change |
| `npx prettier --write acceptance/concurrent-actions/*.mjs` | Exit 0 |
| `npx eslint acceptance/concurrent-actions/*.mjs` | Exit 0 |

Earlier runs were intentionally red: 19/20 then 20/21. The first exposed a test
expecting null instead of the documented eligibility refusal after restore resets
approval. The second exposed an overbroad event assertion treating archive audit
rows as delivery. Both test expectations were corrected against checked source;
production behavior was not changed and no failure was skipped.

Test source SHA-256 identities:

```text
e4244e635af49a8c9cdcd777fe8d2cd218bca8319879d7970d6e2e030d44af7b concurrent-actions.test.mjs
05999b3878f9ee9ac7f4d34c60a463f05e3527481ac0b1ecdf4b5838ec11e635 socket-fence.mjs
eb7834e29a6c2661eb14acca5e9833078ef0b321b45358298f85bb9f87801747 socket-fence.test.mjs
```

No actual send/spend: every workflow case checks zero provider/fetch calls,
zero calls to fenced socket APIs, zero DB spend/spent grants, no dispatch
stamp, stored Gmail URL or live lease; audit kinds are restricted to manual
handoff and the two documented archive restore audit kinds. The fence self-test
has four intentional blocked API calls in a separate test process.

Limits/next handoff: scoped handler/PGlite concurrency is complete. True HTTP,
CSRF/authentication, multi-tab browser, interrupted TCP response and durable
restart are unproved here; the shared harness replaces framework/auth admission
and DB lifecycle, so it cannot supply those claims. Integrate with the separately
owned browser/runtime lane before attempting that matrix. Owner/Mac acceptance
and LOCAL-07 remain open. No merge, deployment, CI polling, real provider,
credentials, owner DB, SMTP or Gmail navigation was performed. Focused acceptance
and lint are applicable to these test-only files; full app build/tests were not
rerun or claimed.

Final verification: `node --test acceptance/concurrent-actions/*.test.mjs`
exit 0: 22 tests passed, 0 failed/cancelled/skipped/todo, 49908.907752 ms.
`git diff --cached --check` exit 0 before commit. All test processes exited;
no runtime/background job remains.
