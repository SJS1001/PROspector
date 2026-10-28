# Local app — Lane D regression and acceptance verification

Status: Lane D fixes/review complete; draft delivery only. LOCAL-07 remains open.
Owner/Mac/provider acceptance is not performed.

## Authority and source

Owner-authorized local `operator/` verification only. No hosted work, actual SMTP,
paid reveal, provider spending, deployment, merge, settings or secrets changes.
Fictional fixtures and stubbed providers only. Other lanes own startup/auth/db
(A), workflow/CSV (B), archive/restore (C); D owns general test harness, stale
fixtures, isolated acceptance checks and integration evidence.

- Expected and fetched source: `operator-os` / PR #125 at
  `2d476b9d2e6bc37f1352444dd95de58b5537f798`; no advancement observed.
- D branch: `codex/local-regression-verification`.
- Checklist read from PR #126 head
  `1c72dd17b7f6417a41d2180adf99facbc6cadc34`, without changing source base.
- Node: v24.19.0, Linux managed cloud. Git fetch required sandbox escalation
  because the sandbox could not connect to the configured proxy; approved fetch passed.
- Required AGENTS continuation, baseline, state/roadmap, activation/reviews,
  current 02-99 plan and 02-22 dependency summary, local composition and CI policy read.
  The user's local-app scope does not confer hosted-plan acceptance.
- Sub-agent controls available: bounded implementation requested
  `gpt-6.1-terra` / `medium`; independent adversarial reviewer requested
  `gpt-6-astra` / `high`. Both agents were used; no effective runtime model ID
  was independently exposed beyond the requested spawn settings.
  These are requested tool settings, not independently verified runtime identities.

## Action log

1. Verified clean initial checkout and GitHub source identity; fetched source and
   checklist refs; created isolated D branch directly from source.
2. Started locked operator dependency installation; baseline test/lint reproduction pending.
3. Assigned existing script fixture/tests to bounded implementation sub-agent;
   parent owns acceptance suite and evidence. No other lane's production behavior owned.

## Verification and integration

Fresh results below supersede historical observations only for this exact
local candidate. They do not establish a release or integrated acceptance.
4. Reproduced the exact historical baseline with child-process permission:
   scripts 177/195 pass, 18 fail, exit 1; independently selected six
   domain/auth/retrieval files 64/64 pass, exit 0; lint exit 1 with one
   `no-empty` error and six warnings. Sandboxed `spawnSync` EPERM results were
   environmental, excluded from application counts; no assertion was weakened.
5. Repaired six script fixture files. Eight PWA cases now use an empty temporary
   workspace instead of accidentally reading PROspector branding. Auth tests
   assert default-on and use explicit isolated auth-off fixtures for precedence
   and symlink behavior. Migration inventory now pins the eight shipped root
   migrations including auth, retaining schema-copy byte comparison. Four
   obsolete private-template-document assertions were replaced by runtime
   marker-aging, CLI-option and staged-write boundary assertions. Total script
   count remains 195. Temporary fixtures are cleaned.
6. Preserved the failing public-asset assertion: the runtime still references
   absent `public/__grok/icon-180.png`. Lane A must supply tracked/generated
   assets or change the supported public contract and its validation together.
7. Fixed the sole lint error with an explanatory comment in the existing
   malformed-token catch. No behavior change, auth relaxation or fns.ts edit.
8. Added `scripts/test-all.mjs`: both groups run despite earlier failure,
   aggregate failure remains nonzero, each child has a 180-second bound. Source
   discovery also executes the baseline-omitted vault test and three
   qualify-Jev tests (68 source tests total).
9. Added isolated real-handler/SQL acceptance contracts and a browser/manual
   matrix in `operator/acceptance/README.md`. Independent review found and
   corrected invalid contact-kind/digest fixtures, unsafe restored-authority
   comparisons, import-graph gaps, result-parser mismatch and effect-counter
   reset gaps before committing. The suite uses actual preparation/approval
   handlers; no fabricated approval digest is accepted as happy-path evidence.
10. Committed candidate `51b449ef3a1e43ce3ab3a366128b663eeae8edbb`.
    Merge-base with `origin/operator-os` is exactly the expected source above.

## Integration availability and contracts

At completion of independent fixes/review preparation, GitHub open-PR title
searches returned none of these candidates:

- A: `Local app: durable startup and owner access`
- B: `Local app: explicit manual outreach workflow`
- C: `Local app: transactional portable backup and restore`

Therefore **no combined integration branch or integrated success is claimed**.
No conflict resolution was performed. Do not wait/poll for these lanes; use the
following once their reviewed immutable heads exist. D changes no `fns.ts`;
combine B's manual actions/message approval/handoff/suppression/CSV/schedule
sections with C's exportArchive/restoreArchive sections, preserving both sets
of function boundaries. A's configuration/auth/storage/public-assets changes
must be included before claiming a usable local app. If A adds migrations,
update D's exact migration-inventory fixture to the reviewed full ordered list.
If B/C add handler dependencies, review and explicitly extend D's test-only
allowlist/stubs; never replace it with unrestricted imports. Preserve the
separate browser/auth/storage gate because this harness stubs those seams.

### Disposable integration commands

First obtain each PR number and exact head from GitHub (owner-approved source,
not an unreviewed moving branch). Substitute those numbers/SHAs below; all
commands operate in a clean disposable worktree, never the owner's active tree.
No GitHub merge, force push, workflow edit or deployment is part of this step.

```sh
git fetch origin operator-os:refs/remotes/origin/operator-os
git fetch origin pull/<A_PR>/head:refs/remotes/origin/local-lane-a
git fetch origin pull/<B_PR>/head:refs/remotes/origin/local-lane-b
git fetch origin pull/<C_PR>/head:refs/remotes/origin/local-lane-c
git fetch origin codex/local-regression-verification:refs/remotes/origin/local-lane-d
# Verify each ref equals its reviewed immutable head; stop on a mismatch.
git rev-parse origin/operator-os origin/local-lane-a origin/local-lane-b origin/local-lane-c origin/local-lane-d
# For each candidate, expected source must be an ancestor; inspect all extra commits.
git merge-base --is-ancestor 2d476b9d2e6bc37f1352444dd95de58b5537f798 <REVIEWED_HEAD>
git log --oneline 2d476b9d2e6bc37f1352444dd95de58b5537f798..<REVIEWED_HEAD>
git diff --stat 2d476b9d2e6bc37f1352444dd95de58b5537f798..<REVIEWED_HEAD>
git worktree add -b codex/local-integration-review ../PROspector-local-integration <VERIFIED_OPERATOR_HEAD>
cd ../PROspector-local-integration
git merge --no-ff --no-edit <A_HEAD> <B_HEAD> <C_HEAD> <D_HEAD>
# If conflicts occur: inspect each; preserve both lanes' boundaries; do not take
# an entire fns.ts from one side. Record resolutions and commit locally only.
cd operator
npm ci
env -u DATABASE_URL npm run build
npm run typecheck
npm run lint
npm test
node scripts/test-all.mjs
node --test acceptance/local-contracts.test.mjs
# Then execute acceptance/README.md browser/manual cases under its effect fences.
```

Run all commands and record each exit/count even if `npm test` short-circuits.
Do not claim green integration if a missing public asset or any release
contract remains red. Baseline safety failures are not approved behavior.
Archive checks must preserve semantic history and suppression while disabling
live sending/scheduling/grants/leases; format updates are not permission to
restore active authority. Add C's full collection inventory, failure-injection
rollback tests and B's concurrent/replay tests to the integrated evidence.

### Local synchronization after later approval

Before synchronizing the owner's Mac: save/commit local changes, take a supported
backup of existing user data, fetch, inspect the current local/remote heads and
check ancestry. After separately authorized merges into `operator-os`, use
`git switch operator-os` and `git merge --ff-only origin/operator-os` only on a
clean tree. If it cannot fast-forward, stop and reconcile the owner commits;
never reset/force-push them away. Reinstall operator dependencies, use A's
supported data directory/owner recovery, and rerun the local acceptance matrix.
PR #125 remains unmerged into main; main cannot run this app until that separate
merge is authorized. After that eventual merge, fast-forward main and verify
identical local/remote SHA and clean status; do not deploy.

## Exact candidate verification

All final application commands below ran at commit
`51b449ef3a1e43ce3ab3a366128b663eeae8edbb`, operator tree
`71334f3403737a51127d8bdbd0d3bdca6bd60669`, Node `v24.19.0`, Linux,
2026-10-28. The subsequent handoff commit changes only this evidence document.
No build result is inferred from compilation, and no test pass is inferred from
a process exit alone. Generated `.vercel` build output was removed, not committed.

| Command (from operator/) | Observed result | Exit |
| --- | --- | --- |
| `npm ci` at unchanged source lockfile | 479 packages installed | 0 |
| `env -u DATABASE_URL npm run build` | Production bundle built; external DB migration explicitly skipped | 0 |
| `npm run typecheck` | No TypeScript errors | 0 |
| `npm run lint` | 0 errors; original 6 warnings remain in other lanes' code | 0 |
| `npm test` | Script stage 194 pass / 1 fail / 195 total; chained domain stage not reached | 1 |
| `node scripts/test-all.mjs` | Scripts 194/195 (exit 1), independently all source tests 68/68 (exit 0), no skips | 1 |
| Six original domain/auth/retrieval files, independent command below | 64/64 pass, no skips | 0 |
| `node --test acceptance/local-contracts.test.mjs` | 6 pass / 8 fail / 14 total; no skips | 1 |
| `git diff --check` and scoped ESLint | Passed | 0 |

Exact independent original-domain command:

```sh
node --experimental-strip-types --test src/lib/app-data/app-data.test.ts src/lib/app-data/readiness-schedule.test.ts src/lib/auth/gate-identity.test.ts src/lib/auth/sign-in-gate.test.ts src/lib/domain/qualify.test.ts src/lib/server/retrieve.test.ts
```

Acceptance pass cases: foreign-workspace handler denial, stale digest refusal,
exact approved compose contents with delivery-unconfirmed status, email/domain/
all suppression refusal. These are handler/SQL checks, not HTTP/auth or browser
proof. Acceptance failures are actionable production gaps:

| Owner | Failure observed | Required integration correction |
| --- | --- | --- |
| A | `public/__grok/icon-180.png` absent, still referenced by PWA runtime | Supply required tracked/generated public assets and supported local startup contract. |
| B | Fictional configured Gmail values reach refusing SMTP stub | Disable SMTP path server-side, retain explicit compose only. The recorded stub attempt is a test failure; no real delivery occurred. |
| B | Contact and organization suppressions allow handoff | Recheck complete current suppression scope before handoff. Phone scope still needs focused/runtime acceptance. |
| B | Already-sent message permits another handoff | Reject replay/reapproval that would regain unsafe authority; verify concurrent tabs. |
| B | CSV quotes correctly but formula prefix remains active | Neutralize formula text, including whitespace/control/BOM variants in the manual matrix. |
| B | Suppressed eligible contact remains in CSV | Re-evaluate complete eligibility/suppression at export time. |
| C | Corrupt digest is accepted by restore | Validate integrity/version/references before any writes; verify unchanged DB on rejection. |
| C | Empty-DB roundtrip restores none of contacts/messages/packages/suppressions | Implement complete transactional inventory restore with safe inactive authority and rollback evidence. |

The archive-corruption case currently fails at the expected rejection before
its zero-delta assertion can run; **zero delta is not claimed**. The roundtrip
case fails at semantic-record comparison before its inactive-authority checks;
**safe restored authority is not claimed**. The SMTP case fails on a counted
refusing stub; **zero attempted provider invocations is not claimed**, only zero
real provider/network effects in this harness. These distinctions prevent
partial assertion execution from becoming false acceptance evidence.

## Independent review and remaining acceptance

Reviewer requested `gpt-6-astra` high inspected exact candidate `51b449e` and
closed all introduced high/medium harness findings. Verdict: D is suitable as
regression and failing release-contract scaffolding; **application release
acceptance remains blocked**. The reviewer independently ran the new runner
(194/195 scripts, 68/68 source, exit 1) before the final fixture/allowlist edits,
reviewed the corrected acceptance log, and checked the exact final diff. It
did not claim an independent exact-final acceptance rerun or runtime-model
attestation. Parent final command counts are the table above.

Remaining shortest path: combine reviewed A/B/C/D heads, resolve the explicit
public-asset and eight acceptance failures, run A's real startup/owner/durable
restart regressions, B's concurrency/stale approvals/phone suppression checks,
C's full-inventory/rollback tests, then the browser/manual matrix. Two daily
workflows and recovery on the owner's Mac, actual owner acceptance, and any
separately authorized provider quality/cost assessment remain **unperformed**.
LOCAL-01/03/06/07 are not certified by these tests. No hosted plan credit,
release merge, deployment, paid reveal, actual SMTP delivery, external-provider
spending, secret/configuration change, scheduled routine or reminder occurred.
