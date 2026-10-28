# Local operator acceptance — fictional data only

This is a release gate, not an assertion that the release is accepted. Keep
LOCAL-07 open until the owner completes two workflows and recovery on the Mac.
Run from `operator/` on the final combined candidate, with Node >=22.15 (the app minimum is 22.13; this isolated harness uses
`node:module.registerHooks`, introduced in 22.15). The original cloud run used Node 24.19.0; the combined Mac handler run uses Node 24.16.0.

```
npm ci
npm run build
npm run typecheck
npm run lint
npm test
node scripts/test-all.mjs
node --test acceptance/local-contracts.test.mjs
```

Use an environment with **no DATABASE_URL or provider credentials**. The build
currently includes a migrator; the recorded cloud run explicitly removed
DATABASE_URL from that command. Never use an owner database for tests.
`test-all.mjs` runs both stages even if scripts fail and discovers two source
regressions omitted from the baseline npm-test list. It does not hide failures.
The acceptance suite is separate so integration contract failures stay visibly red instead of being
skipped or redefined as safe behavior.

## Automated scope

`handler-harness.mjs` uses the real `fns.ts` handlers, validators, seed helpers,
and checked SQL migrations against a fresh in-memory PGlite per case. Archive
callbacks use a pinned real PGlite transaction; the real archive request guard
receives a synthetic exact-origin local POST. It replaces framework/auth
admission and the database lifecycle adapter. It
therefore proves **neither HTTP/CSRF/authentication nor durable app startup**.
The fictional owner IDs merely test handler-level workspace predicates.
Provider modules are hard-failing counted stubs; fetch is blocked; application
imports outside the reviewed source graph/stubs/crypto are denied. No real
provider, secret, network, SMTP or browser compose invocation occurs.

The happy path creates package/message digests through the actual handlers.
Checks cover cross-workspace denial, stale digest, exact compose contents,
SMTP refusal even with fictional configured values, five suppression scopes,
sent-message replay denial, CSV quoting/formulas/current suppression, corrupt
archive denial/zero knowledge delta, and semantic archive roundtrip with live
authority disabled. The reviewed combined contracts use displayed package/message approval
digests, published contact provenance, a returned-only Gmail URL with a
`handed_off`/delivery-unconfirmed audit event, and the v1 archive checksum.
Adapter/format changes must preserve these safety semantics. These cases are not a complete restore inventory,
transaction failure-injection proof, concurrent-send proof, or browser test.

## Browser/manual acceptance matrix (not performed)

Prerequisite: integrate A/B/C/D in a disposable worktree. Review all new imports
before widening the harness allowlist. Use A's documented local owner setup
and data-directory option with a newly created disposable directory, not the
owner's ordinary data directory. Use the pinned Playwright browser if automating;
do not substitute a different browser and claim identical evidence.

Before any workflow, the acceptance runtime must have provider adapters wired
to instrumented stubs and deny outbound server sockets. Browser request routing
must abort every origin except the exact loopback runtime; abort the Gmail
navigation after recording its URL. Browser blocking alone does not constrain
server-side providers. Never enter real provider keys, log session cookies, or
click Send. If these fences are unavailable, record BLOCKED rather than running
provider-dependent browser actions. Existing handler stubs are not browser
runtime stubs and must never be imported into production.

Use only Fictional Quarry, Fictional Plant, Fictional Person,
`person@quarry.example`, `blocked.example`, and labelled fictional evidence.
Record commit, OS/Node/browser versions, case, result, sanitized counts, and
remaining limitation. Keep screenshots/free-text free of credential values.

| Case                       | Procedure                                                                                                                                                                                                  | Required evidence                                                                                                                                                                       |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Clean launch/owner         | Fresh checkout; install/build; start using A runbook. Complete owner setup. Try unauthenticated, second-owner, foreign-Origin and missing-CSRF mutations.                                                  | Loopback-only listener; owner admitted; each negative refused and no workspace delta. Missing public assets are failures.                                                               |
| Durable restart            | Enter fictional interview/knowledge, prospect, contact, approvals and suppression; snapshot canonical rows/history. Stop fully, restart same data directory and reopen owner session.                      | Same owner/workspace and records; documented session reauthentication; synthetic saved provider configuration usable only via stub; no values in browser/log/export.                    |
| Full workflow twice        | Interview → confirm knowledge → ready product/profile → explicit manual run → qualify → review → eligible contact → approve package → approve exact message → compose handoff → CSV. Repeat after restart. | Actual browser/server/DB transitions, zero provider invocations, UI labels handoff/delivery unconfirmed. No work from startup/reload/overnight-open tab.                                |
| Approval/race              | Edit message after approval; try stale tab, duplicate/concurrent compose, already-sent state, changed contact/package, interrupted response/reload.                                                        | Fresh exact approval required; one coherent handoff outcome; zero sends/spend; no automatic retry or unsafe lease/approval resurrection.                                                |
| Suppression                | Add email/domain/contact/org/phone/all suppression after approval and in another tab before handoff/export.                                                                                                | Rejected compose and excluded CSV recipient, no provider call, preserved suppression/history. Check normalized phone and case variants.                                                 |
| CSV                        | Eligible and suggestion/suppressed contacts; commas, quotes, newlines, Unicode, `=1+1`, leading whitespace/control/BOM before `+`, `-`, `@`.                                                               | Parse exact column count/values; spreadsheet formulas inert; stable identity and only currently eligible contacts. Inspect bytes without opening a spreadsheet that evaluates formulas. |
| Archive roundtrip          | Export fictional workspace with every agreed collection/history and suppression; restore into a new empty directory; compare semantic inventory and references.                                            | Full C-declared inventory restored; no secrets; sending/scheduling/paid grants disabled; live leases/approvals reset as documented, historical evidence retained.                       |
| Archive rejection/rollback | Wrong version, tampered digest, broken references, duplicate IDs, foreign-owner data, truncation, injected DB failure midway and interrupted process.                                                      | Whole restore rejected/rolled back, before/after canonical snapshots equal; restart remains safe; suppression cannot be erased.                                                         |
| Usability/recovery         | Keyboard-only flow, focused error recovery, narrow 360px viewport, reload/two tabs; cancel an interrupted request.                                                                                         | Useful errors and focus, no hidden pending effects, no horizontal loss of critical actions.                                                                                             |

Real-provider quality/cost/provenance acceptance requires separate owner
authorization and is not covered here. The current task performs no paid
reveal, SMTP delivery, deployment, merge, hosted proof or owner acceptance.
