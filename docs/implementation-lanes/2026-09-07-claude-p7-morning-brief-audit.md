# Phase 7 Morning Brief lane — evidence audit and push blocker

**Recorded:** 2026-09-07
**Branch:** `claude/p7-outcome-recovery-verifier`
**Base:** `5c3440e11dc32beaed7dfc3d6e1bf11aafd3945c` on
`origin/codex/generic-onboarding-integration`, verified exact before any edit
**Implementation commit:** `25423d0` (`feat: add pure zero-effect Morning Brief projector`)

This is an evidence audit, not a plan summary, phase-acceptance record, provider
authorization, hosted-evidence substitute, or permission to perform an external
effect. No `07-xx-SUMMARY.md` was created and no plan or phase credit is claimed.

## External gate: branch push — blocked, then owner-authorized and completed

`git push -u origin claude/p7-outcome-recovery-verifier` was attempted once and
rejected by the environment's git proxy before any network write:

```text
remote: access denied by the git proxy: SJS1001/PROspector is not in this
session's authorized repository set, so the proxy will not inject a credential
for it. To fix, add the repository to the session's sources.
fatal: unable to access 'https://github.com/SJS1001/PROspector.git/':
The requested URL returned error: 403
```

Reads are permitted in this session — `git fetch origin
codex/generic-onboarding-integration` succeeded and resolved to exactly
`5c3440e11dc32beaed7dfc3d6e1bf11aafd3945c` — but writes require the owner to add
this repository to the session's authorized source set. `curl -sS
"$HTTPS_PROXY/__agentproxy/status"` reports `enabled: true`, `selective: false`,
`gitConfigInjection: true`, and no recent relay failures, so this is an
authorization boundary rather than a transient network or TLS fault.

The blocker was not worked around. No credential was extracted, broadened,
substituted, or created; no alternate remote, host, mirror, or transport was
tried; TLS verification and `HTTPS_PROXY` were left untouched; and the push was
not retried. The work is committed locally on its own branch and is portable
once the owner authorizes the repository for this session.

### Resolution

The owner then directed the push and authorized the repository for this session
through the environment's own repository-attachment mechanism, which performs
the authorization check server-side and injects the credential. That is the
exact remedy the proxy error named; it is not a workaround of it. Nothing about
the earlier record changes: no credential was extracted, broadened, substituted,
or created, no alternate remote/host/mirror/transport was used, and TLS
verification and `HTTPS_PROXY` remained untouched throughout.

With the repository attached, `git push -u origin
claude/p7-outcome-recovery-verifier` succeeded and created the branch on the
remote. A follow-up `git fetch` confirms
`origin/claude/p7-outcome-recovery-verifier` resolves to exactly
`6e437a53db834387031a1f0afa7126ead8ea7a89`, byte-identical to the local head,
with a clean worktree.

The branch is **pushed but not merged**, and no pull request was opened. It
remains an unaccepted local candidate: publication to a branch is not review,
acceptance, plan credit, or authority of any kind.

## Other external, storage, and owner gates

None were consumed, satisfied, or claimed by this lane:

- **Cloudflare / hosted target.** Not contacted. No Worker, version, deployment,
  route, Access application or policy, secret, Cron trigger, or dashboard action.
  Stage 3B Worker attachment and the effective one-hour session remain unverified
  exactly as `.planning/STATE.md` records them.
- **Retired Sites project.** Not resolved, inspected, accessed, migrated,
  restored, modified, cloned, or depended on.
- **D1 / R2 / storage.** No remote read or write. No migration, journal entry,
  schema change, snapshot, or `site/drizzle/**` edit; this lane allocated no
  migration index and is not a schema owner. R2 was not contacted; no object,
  archive, or artifact was created anywhere. The only bytes written were the
  three committed files and the local build output under `site/`.
- **Providers and credentials.** No provider selection, account, key, OAuth
  client, cookie, or token. No secret value was displayed, copied, rotated,
  removed, or committed.
- **Real data and outbound effects.** No real prospect, contact, lead file, or
  private hosted data. No prospecting, enrichment, export materialization,
  export delivery or download, Gmail, mail, call, schedule activation, runner
  work, archive creation, restore, or outbound communication.
- **Owner decisions.** None requested, inferred, or represented as given. Plan
  02-99, Plans 03-09 through 03-11, Plan 06-10, and the Plan 07-07
  archive-capability and clean-target gate all remain incomplete and
  non-substitutable.

## What was implemented and why it is safe

`site/domain/morning-brief.ts` composes the existing `reduceWeeklyOutcome` core
with a read-only upstream Phase 4 schedule observation, a counts-only CRM
handoff readiness preview, and a restored-workspace fence. The full interface,
behaviour, and authority boundary are recorded in
[`cloud-morning-brief.md`](cloud-morning-brief.md).

Selection rationale: `2026-09-05-completion-inventory.md` records Phase 7 at
`0/10` plans with "CSV/weekly cores only" and names the missing Morning Brief.
`domain/weekly-outcome.ts` and `domain/crm-csv-codec.ts` existed as isolated
cores with nothing composing the weekly cohort, the upstream schedule state, the
handoff counts, and the restored-target fence. Every invariant in that
composition is decidable offline from supplied values, so it is the
highest-value gap reachable without a target, provider, credential, real datum,
or migration.

Deliberate scope limits:

- No `site/preparation/` module was added. `07-PREPARATION.md` closes the
  Phase 7 synthetic-preparation line; this is a `site/domain/` candidate in the
  same unaccepted-candidate category as the two existing cores, not a
  substitute for Plan 07-02 or later execution.
- No shared file was touched: `site/package.json`, `site/db/schema.ts`,
  `site/drizzle/**`, `site/worker/**`, `site/scripts/run-test-suite.mjs`,
  `.planning/ROADMAP.md`, `.planning/STATE.md`, `docs/CODEX-CONTINUATION.md`,
  and every phase plan/preparation record are unchanged. The suite runner
  discovers `tests/*.test.mjs` by directory listing, so the new focused suite
  required no shared-runner edit.
- Plan 07-04's repository seam and Plan 07-05's repository composition were not
  built. The projector takes injected descriptors instead, so it needs no
  schema, migration, or persistence.
- Nothing archive-, restore-, or crypto-shaped was implemented. The lane reports
  a restored workspace and permanently denies `verifyRecovery` and
  `applyRestore`; it verifies no envelope, decrypts nothing, inspects no target,
  and asserts no recovery occurred.
- An `available` brief describes the values it was handed. It is not evidence
  that a transition, schedule state, eligibility snapshot, or restore is real.

## Validation performed

From `site/` on Node.js `v22.22.2` after a clean `npm ci`:

| Command | Result |
| --- | --- |
| `node --test --test-concurrency=1 tests/morning-brief.test.mjs` | PASS 9/9 |
| `node --test --test-concurrency=1 tests/morning-brief.test.mjs tests/weekly-outcome.test.mjs tests/crm-csv-codec.test.mjs tests/outreach-preparation-boundary.test.mjs tests/phase7-preparation-weekly-outcome.test.mjs` | PASS 41/41 |
| `npx eslint domain/morning-brief.ts tests/morning-brief.test.mjs` | PASS |
| `npx tsc --noEmit --strict --target ES2022 --lib ES2022,DOM --module ESNext --moduleResolution Bundler --skipLibCheck domain/morning-brief.ts` | PASS |
| `npm run build` (production build) | PASS |
| `npm run lint` (whole project) | PASS |
| `npm audit --omit=dev` | 0 vulnerabilities |
| `git diff --check` | clean |

The static composition guard in `tests/outreach-preparation-boundary.test.mjs`
passes with the new domain file present, proving the addition introduces no
provider, effect, or preparation-import pattern into the scanned runtime tree.

Mutation check of the focused suite — each mutation reverted afterwards, and the
committed module is byte-identical to the pre-mutation file:

| Mutation | Focused suite |
| --- | --- |
| remove the restored-target schedule fence | 8 pass, 1 fail |
| let a blocked handoff panel emit its counts | 8 pass, 1 fail |
| disable the raw-identity fence | 8 pass, 1 fail |
| drop the weekly `asOf` binding | 8 pass, 1 fail |

### Canonical gate status: five pre-existing suite failures

**The canonical `npm test` does not pass on this branch, and it does not pass on
the base commit either.** It exited `1`. The suite runner stops at the first
failing file, so it halted long before reaching most suites, including this
lane's own.

Five suite files fail. Each was re-run alone on a detached checkout of the
untouched base `5c3440e11dc32beaed7dfc3d6e1bf11aafd3945c`, with this lane's
three files absent from the worktree, and each reproduced identically:

| Suite | Failure | On this branch | On untouched base `5c3440e` |
| --- | --- | --- | --- |
| `tests/drift-replacement.test.mjs` | 3 of 6 tests fail with `Commercial workspace is unavailable` / `knowledge_conflict`, thrown from `domain/knowledge.ts:435` (`workspaceForKnowledge`) through a Miniflare D1 fixture | 3 pass, 3 fail | 3 pass, 3 fail |
| `tests/fixture-safety.test.mjs` | its single test fails: `Approve disabled must render with the native disabled attribute` | 0 pass, 1 fail | 0 pass, 1 fail |
| `tests/greenfield-target-config.test.mjs` | 2 of 6 tests fail with `migration_manifest_mismatch`, diagnosed below; the overwrite case reports that code instead of the expected `output_exists` only because manifest verification runs first | 4 pass, 2 fail | 4 pass, 2 fail |
| `tests/rendered-html.test.mjs` | its build/source smoke fails: the rendered source no longer matches `/Good morning, Steven/` | 3 pass, 1 fail | 3 pass, 1 fail |
| `tests/workspace-view.test.mjs` | navigation smoke fails: the worker source no longer matches `/initialView=\{initialView\}/` | 1 pass, 1 fail | 1 pass, 1 fail |

All five are therefore pre-existing conditions of this checkpoint or this
environment. None involves `domain/morning-brief.ts`, which no other module
imports. This lane does not fix them and makes no claim about their cause; they
are recorded here so the next account does not mistake them for regressions
introduced by this branch, and so no reader mistakes this lane for a green
canonical gate.

All five have since been diagnosed read-only, below. **None is a product
defect.** Four are stale test assertions and the fifth is a release gate
correctly refusing an outgrown migration chain. Each fix belongs to the lane
that owns the file; this lane changed none of them.

#### Correction: the `migration_manifest_mismatch` is not byte drift

An earlier revision of this document stated that this failure means "the checked
migration manifest no longer matches the migration bytes it is bound to." **That
was wrong**, and it is corrected here because it would send the next account
hunting for tampering that did not occur.

Every one of the ten manifest digests still matches its file byte-for-byte. All
ten were recomputed from `site/drizzle/` against
`02-99-MIGRATION-MANIFEST.md`: zero digest mismatches.

The actual cause is a set-equality check, not an integrity check. The manifest's
own verification contract requires the tree to hold "exactly these ten SQL files
in this lexical order and no other migration", and
`verifyMigrationManifest` in `site/scripts/greenfield-target-config.mjs`
compares the full sorted `.sql` filename list against those ten names before
computing any digest. `site/drizzle/` now holds twenty files: the pinned
`0000`-`0009` chain plus `0010` through `0019`, added by the later Phase 4, 5,
6 outreach and person-discovery lanes. The name lists differ, so the function
throws at the list comparison and never reaches the digest loop.

This is therefore the guard behaving exactly as designed: a fail-closed Stage 2
release gate correctly refusing to prepare a target candidate from a tree that
has grown past its pinned release chain. The manifest is bound to source
`46d082e962c4acc1771e92ad300d61913d50ead4` and was captured on 2026-09-02, when
the chain ended at `0009`; ten migrations have landed since.

The second failing test in that file, "the CLI never overwrites an existing
target candidate", is a knock-on: `verifyMigrationManifest` runs early in
`prepareGreenfieldTarget`, long before the `EEXIST` to `output_exists` mapping,
so the manifest code surfaces instead of the expected one.

Resolving this is a genuine Plan 02-99 decision for the schema owner — re-pin
the manifest to the current chain, or scope the verifier to the released prefix
— and it is explicitly not this lane's call. Nothing in `02-99` territory, the
manifest, the verifier, or `site/drizzle/` was modified. This diagnosis is
read-only: no Cloudflare, hosted, or remote action was involved in producing it.

#### Diagnosis of the other four failures

Each was investigated read-only on this checkpoint. No source, test, fixture, or
migration was modified, and no Cloudflare, hosted, or remote action was
involved.

**`tests/rendered-html.test.mjs` — stale assertion; the source is correct.**
It asserts `app/prospector-app.tsx` matches `/Good morning, Steven/`. That
hardcoded personal greeting no longer exists anywhere under `app/`; it was
replaced by the generic `title="Morning brief"` in `PageHeading`
(`app/prospector-app.tsx:442`) by commit `3320f26`, "feat: add guarded generic
company onboarding". The assertion now enforces precisely what the project
deliberately removed — an owner's first name hardcoded into rendered output —
so the test is the side that should change, not the source.

**`tests/workspace-view.test.mjs` — stale assertion against changed source.**
It asserts `app/page.tsx` matches the literal `/initialView=\{initialView\}/`.
Line 49 now reads
`initialView={blankLocalOnboarding && initialView === "Pilot Status" ? "Knowledge" : initialView}`,
a blank-workspace redirect to Knowledge added by the onboarding lane. The
behaviour the test intends to cover is intact — `page.tsx:22` still calls
`workspaceViewFromParam(requestedView)` and the prop is still passed — but an
exact-text regex cannot survive the conditional. The assertion needs widening.

**`tests/fixture-safety.test.mjs` — stale assertion over a dead render path.**
It asserts `<button disabled>Approve disabled</button>` appears in the SSR
output. The label still exists and is still natively disabled
(`app/prospector-app.tsx:492`), but it lives inside `SignalRow`, which is fed
from `const signals = []` (`app/prospector-app.tsx:44`). That fixture lead list
was deliberately emptied, so `SignalRow` never renders and Morning Brief shows
`No prospects match that search.` instead. The same situation was already
handled deliberately elsewhere in that file: `KNOWLEDGE_FLOW_COPY` (line 47)
was kept as an explicit source-level copy contract when the Knowledge controls
moved out of the rendered tree. No equivalent was kept for the Approve/Defer
labels; the same remedy applies.

**`tests/drift-replacement.test.mjs` — missing workspace bootstrap in the
test.** This one is not a text assertion. All three failing cases call
`createD1Fixture` and `applyMigrations`, then immediately
`createKnowledgeProposal`. `workspaceForKnowledge` (`domain/knowledge.ts:300`)
requires a `workspaces` → `workspace_companies` → `companies` row for the
principal and raises `KnowledgeConflictError("Commercial workspace is
unavailable")` when none exists. No migration creates a workspace: `0004` only
back-fills `companies` and `workspace_companies` *from existing* `workspaces`
rows. Workspace creation now lives solely in the guarded onboarding paths,
`domain/onboarding.ts:60` and `domain/commercial-model.ts:57`. A seeding helper
does exist at `tests/helpers/d1.mjs:158`, but this suite never calls it and its
principal subject is `replacement-owner` while the helper seeds
`owner-${suffix}`. The authority guard is behaving correctly; the test is
missing a bootstrap step it once received implicitly. Whether
`createKnowledgeProposal` previously auto-created the workspace is a question
for the owning lane — `domain/knowledge.ts` does not import
`domain/commercial-model.ts`, and this error path has not changed since
`5826816`.

### Progressive suite results on this exact source

Because the runner halts on the first failure, the suite was re-run with the
already-diagnosed files excluded, so that later suites — including this lane's —
could be reached:

| Run | Result |
| --- | --- |
| `npm test` (build + all suites) | build PASS; 104 tests pass across 23 files, then exit 1 at `drift-replacement` |
| build + all suites except `drift-replacement` | build PASS; 149 tests pass across 32 files, then exit 1 at `fixture-safety` |
| all suites except `drift-replacement` and `fixture-safety` | 183 tests pass across 37 files, then exit 1 at `greenfield-target-config` |
| the 80-file tail after `greenfield-target-config`, excluding all three | restarted on `8125a73`; 532 tests pass across 69 files, then exit 1 at `rendered-html` |
| the final 9 files after `rendered-html`, excluding all four | 46 tests pass across 9 files, 1 fail at `workspace-view` |

Every suite file in the repository has now been executed on this branch. Across
the four runs, **every test passes except the ten belonging to the five
pre-existing failures above**, each of which reproduces identically on the
untouched base commit.

**`tests/morning-brief.test.mjs` passes under the canonical runner.** The
earlier revision of this document recorded that it had never been reached,
because it sorts after `greenfield-target-config` and the first tail run was
stopped before it got there. That gap is now closed. The tail was restarted on
commit `8125a73` with a clean worktree, and this lane's suite ran as file #22 of
that list, in canonical-runner sequencing after the fixture-heavy Miniflare
suites rather than standalone:

```text
ok 1 - composes the weekly cohort, separate handoff counts, and a current upstream schedule with zero authority
ok 2 - a restored workspace reports the schedule disabled pending a fresh upstream activation
ok 3 - absent, drifted, misdefined, foreign, future, and stale schedule evidence never reports a state
ok 4 - absent, stale, future, drifted, or self-inconsistent handoff readiness withholds every count
ok 5 - weekly history that is unavailable, out of scope, out of time, or a forged projection blocks the brief
ok 6 - a Draft profile scope contributes no cohort, contacts, or losses
ok 7 - hostile, malformed, and non-plain input shapes fail closed
ok 8 - identifier-shaped raw contact values are rejected rather than reported
ok 9 - the module composes no port, provider, effect, or preparation dependency
1..9
# tests 9
# pass 9
# fail 0
# duration_ms 4822.992487
```

That tail then ran to completion. The five pre-existing failures are excluded
from these lists by construction, so no run recorded here is a canonical
`npm test` pass, and nothing in this lane claims one.

`tests/weekly-outcome.test.mjs`, the existing core this projector composes,
also passes 9/9 in the same sequencing.

The evidence this lane holds is therefore: the focused suite standalone (9/9),
the combined five-suite focused lane (41/41), the same suite under the canonical
runner (9/9), the production build, the whole-project lint, the strict
typecheck, the production audit, the diff check, and the mutation results above.

### Exact next validation action

Every suite file has been run on this branch, so no further validation of this
lane is outstanding. What remains is not this lane's work:

All five pre-existing failures are diagnosed above and none requires further
investigation. What each needs is a decision by the lane that owns the file:

| Suite | Remedy, for the owning lane |
| --- | --- |
| `tests/greenfield-target-config.test.mjs` | Plan 02-99 decision: re-pin the manifest to the current chain, or scope the verifier to the released `0000`-`0009` prefix |
| `tests/rendered-html.test.mjs` | drop or replace the `/Good morning, Steven/` assertion; the source is correct |
| `tests/workspace-view.test.mjs` | widen the `initialView` regex to admit the conditional form |
| `tests/fixture-safety.test.mjs` | render a signal fixture, or keep an explicit source-level copy contract as `KNOWLEDGE_FLOW_COPY` already does |
| `tests/drift-replacement.test.mjs` | bootstrap a workspace for the test principal before the first `createKnowledgeProposal` call |

Until those are settled, the canonical `npm test` cannot pass on this
checkpoint, for reasons that have nothing to do with Phase 7.

## Status

Local implementation is complete and committed at `25423d0`. The branch is
pushed to `origin/claude/p7-outcome-recovery-verifier` at
`6e437a53db834387031a1f0afa7126ead8ea7a89` and is unmerged, with no pull request
opened. This lane earns no Phase 7 plan or phase credit, grants no
runtime, persistence, export, delivery, archive, restore, hosted, provider, or
outbound authority, and changes no gate recorded in `.planning/STATE.md` or
`docs/CODEX-CONTINUATION.md`.

Validation stops short of a canonical-gate pass, and deliberately says so: the
canonical `npm test` exits 1 on this branch and on its base alike, for five
pre-existing reasons this lane did not introduce and did not fix. This lane's
own suite is proven standalone, in its focused lane, and under the canonical
runner.
