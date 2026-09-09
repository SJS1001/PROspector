# Synthetic enrichment reconciliation decision

Date: 2026-09-07

## Checkpoint

**Branch:** `claude/phase5-p5-audit`
**Candidate commit:** `ebcf9b1edcd0a1e38f810f377a7aa0b75857efd1`
**Base:** `main` at `95e9eccb`, the commit merging pull request #12
(`codex/generic-onboarding-integration` into `main`), itself over
`0b7935ce990addb9bce3da399d655f0b357038fa`
**Review:** `https://github.com/SJS1001/PROspector/pull/13`

The work started from `codex/generic-onboarding-integration`. That branch was
merged into `main` by pull request #12, so GitHub retargeted pull request #13
onto `main`; `95e9eccb` is reachable from `main` and not from
`codex/generic-onboarding-integration`.

This branch is periodically rebased onto its advancing base by the repository
owner, so the candidate commit SHA above moves. Pull request #13 is the stable
locator; treat the SHA as the checkpoint at the time of writing and re-read the
pull request head if they disagree.

Every rebase so far has replayed the candidate unchanged. The lineage is
`2621534a604bfebadca2b0d370530b62040b564c` (original, over base
`5c3440e11dc32beaed7dfc3d6e1bf11aafd3945c`) to
`38f5c477beb308a3a74be370cbf805ccb54e2e28` (over `0b7935c`) to
`ebcf9b1` (over `95e9eccb`). All three carry the identical patch id
`bf2eb6f5399a7ecd8a0ccaab119c89abe0b166a1`, the same three files, and
`+924/-0`; no rebase changed candidate content, and `0b7935c` to `95e9eccb`
is an empty file-level diff.

The base commit `0b7935c` initializes replacement workspace fixtures in
`site/tests/drift-replacement.test.mjs`. It repairs one of the pre-existing
failures recorded below and touches no candidate file.

## Gap this closes

`executeEnrichmentOperation` records `needs_reconciliation` for a timeout, an
ambiguous acceptance, or any post-claim integrity failure, and then stops. That
stop is correct: the locked Phase 5 decisions forbid retry, provider switch, and
silent expiry extension for an uncertain charge.

Nothing in the checked Phase 5 code, however, describes how such a reservation is
ever honestly closed. `EnrichmentAuthorityRepository` exposes `settleReservation`
and `markNeedsReconciliation`, and `enrichment-repository.ts` will accept a
settlement whose latest event is `needs_reconciliation`, but no caller reaches
that path: `executeEnrichmentOperation` only settles a reservation it has just
claimed from `reserved`, and `contacts-command-service.ts` exposes only
`createGrant`, `runGrantedOperation`, `applyIdentityMerge`, and
`applyIdentitySplit`. An uncertain reservation therefore holds its worst-case
units and cost against the grant, profile, workspace, and provider budgets
permanently, and `05-PATTERNS.md`'s requirement that "reconciliation is a
distinct audited state transition" has no executable description.

This lane added that missing description only. A 2026-09-09 local follow-up
widened the same statement-based decision from only `timeout`/`ambiguous` to
all six runtime reasons for which a provider request was attempted or may have
been attempted: `timeout`, `ambiguous`, `invalid_provider_outcome`,
`invalid_evidence`, `provider_throw`, and `settlement_failure`. The two reasons
that occur before provider invocation (`provider_port_mismatch` and
`invalid_assignment`) remain invalid inputs because no billing statement can
exist for them.

## Scope

`site/domain/synthetic-enrichment-reconciliation-decision.ts` is a pure,
deterministic decision over three fictional inputs:

- one already-recorded synthetic uncertain reservation carrying one of the six
  statement-applicable runtime reasons, plus its exact grant, operation key,
  provider identity and version, catalog reference, quote revision, configuration binding, durable
  revision, acknowledgement digest, reserved units/cost, and currency;
- one owner-transcribed synthetic provider billing statement whose outcome is
  `documented_charge`, `documented_no_charge`, or `undocumented`; and
- the current durable authority observed at decision time.

It projects at most one of two future states — settle the documented billable
amount, or release a documented no-charge reservation — and otherwise holds.

## Fail-closed rules

- Reject by default. Only an admitted owner, an unchanged `needs_reconciliation`
  row at its exact recorded durable revision and acknowledgement digest, a
  consumed grant, an owner-reviewed statement, and a disabled-effects fence can
  produce a resolvable result.
- Every statement binding — reservation, workspace, grant, operation key,
  provider identity and version, catalog reference, quote revision, currency —
  must match the uncertain reservation exactly.
- A statement observed before the uncertainty was recorded, or after the
  evaluation time, is rejected.
- A documented charge may never exceed the committed reservation in units or
  cost, and must document at least one unit. A no-charge statement that
  documents an amount is rejected.
- `undocumented` always holds. Absence of evidence is never inferred as either a
  successful or a failed charge.
- A documented charge can only ever project `partial`. The operation's contact
  outcome was never observed, so `completed` is unreachable by reconciliation.
- Any remaining worst-case reservation is released rather than carried forward
  as spare authority for another operation.
- Malformed, accessor-bearing, extra-key, missing-key, non-synthetic, and
  unbranded (structurally forged) material throws rather than resolving.

## Deliberate non-authority

The module imports nothing. It has no repository, D1, route, browser,
provider-port, credential, contact-coordinate, or external-effect dependency.
Every result — resolvable or held — carries `persistenceAuthorized`,
`retryAuthorized`, `providerSwitchAuthorized`, `expiryExtensionAuthorized`,
`providerInvocationAuthorized`, `budgetIncreaseAuthorized`, and
`contactEvidencePromotionAuthorized` as literal `false`, and all six effect
counters as literal `0`. A billing statement documents money only; its
`providerEvidence` field is permanently `false`, so no verification class can be
gained through reconciliation.

`site/app`, `site/worker`, `site/adapters`, and `site/scripts` compose it
nowhere, and a test enforces that.

## Validation

Run from `site/` on Node.js `v22.22.2`. The results below were produced on
the original tree `2621534a`. Each later rebase replayed the identical
candidate patch onto an unchanged file-level base, so they describe the
current checkpoint unchanged.

### 2026-09-09 reason-coverage follow-up

The follow-up was rebased onto authoritative `main` at
`5bcca58149279dc6a57c1e822a54df00542b4fc5` and validated with Node.js
`v24.19.0`:

- the combined decision/triage focused suites passed 25/25;
- repository-wide `npm run lint` passed;
- `npm run build` passed; and
- `git diff --check` passed.

A broader Phase 5 suite aggregation was not run: the execution safety reviewer
rejected that command because it could not establish that a Cloudflare-related
test path was purely local under the task's no-Cloudflare boundary. The block
was not bypassed. The changed modules' own suites statically prove no imports,
runtime composition, provider port, network, persistence, credential, contact
coordinate, or nonzero effect counter.

- `node --test --test-concurrency=1 tests/synthetic-enrichment-reconciliation-decision.test.mjs` — 13/13.
- `node scripts/run-test-suite.mjs tests/enrichment-contract.test.mjs tests/controlled-enrichment-integration.test.mjs tests/contacts-command-service.test.mjs tests/contacts-ui.test.mjs` — 6/6, 22/22, 4/4, 11/11.
- `node scripts/run-test-suite.mjs tests/contact-eligibility.test.mjs tests/identity-resolution.test.mjs tests/synthetic-enrichment-prerequisite-plan.test.mjs` — all green.
- `npm run lint` — clean.

### Full-suite sweep

Measured on `main` at `b11df33b44094126cfde94d22d3f93de1906b6c6`, after this
candidate and its follow-up were merged. The production build passed, then every
`site/tests/*.test.mjs` file ran in its own process in one non-stopping sweep so
no failure could hide another: **125 files, 125 producing a result, 840 passing,
3 failing.**

The candidate's own suite passed **13/13**.

All three failures are in one file, `site/tests/production-bundle-boundary.test.mjs`,
and none belongs to this candidate: the sweep ran on a worktree byte-identical to
`origin/main` with no local commits, so it measures `main` alone. That file is a
separate pre-existing finding, recorded below.

### Pre-existing failures on the base branch

None is caused by this candidate. Each was attributed the same way: the
candidate's commits change no file involved, and the failure reproduces at the
base with the candidate files absent. Because of them the canonical `npm test`
gate does not pass end-to-end on this base independently of this work.

- `site/tests/drift-replacement.test.mjs` — 3/6 failed with
  `Commercial workspace is unavailable` / `knowledge_conflict` at
  `site/domain/knowledge.ts:435`. Repaired on the base branch by `0b7935c`.
- `site/tests/fixture-safety.test.mjs` — 1/1 failed with
  `Approve disabled must render with the native disabled attribute`. **Not a
  safety regression.** The Approve and Defer controls lived only inside the
  seeded sample signal rows; `3320f26` emptied that fixture (`const signals =
  []`), so `SignalRow` renders zero times and no approve/defer control renders
  at all — safer than a disabled one. `Prospecting disabled`, `CSV disabled`,
  and `Export disabled` still render natively disabled. **Repaired in this
  branch** (see below).
- `site/tests/greenfield-target-config.test.mjs` — 2/6 failed with
  `migration_manifest_mismatch`. The manifest was not stale and the gate was
  correct: it pinned ten files while the local chain had grown to twenty, and
  the hosted target remains at `0009`. This lane pinned the tests to that
  fail-closed behaviour rather than extend the manifest. `main` has since
  extended it in `5cafe71` under an explicit no-hosted-evidence disclaimer, so
  the pins were removed and the original expectations restored. **Resolved.**
- `site/tests/production-bundle-boundary.test.mjs` — 2/5 pass, **3 fail on
  `main` and remain open.** The build-mode gate folds correctly, but the dead
  branch is not eliminated, so `dist/server/index.js` still carries the
  `app/runtime-identity.ts` DEMO identity constant, the local-demo routes, and
  the C4 synthetic acceptance fixtures. This is a genuine deployment-boundary
  finding rather than a stale assertion, and its own comment explains why
  nothing else catches it: `rendered-html.test.mjs` only `access()`es the
  bundle and `greenfield-target-config.mjs` only SHA-256s the tree, which
  digests a leaking bundle as happily as a clean one. Fixing it is a build
  configuration or source-reachability change, not a test edit, so this lane
  did not touch it. No artifact is exposed today: Stage 3A left the Worker with
  no route, `workers_dev=false`, and `preview_urls=false`.
- `site/tests/rendered-html.test.mjs` and `site/tests/workspace-view.test.mjs`
  — stale assertions left by the generic onboarding rework `3320f26`, which
  removed the hardcoded personal greeting, the seeded sample prospects, and the
  unconditional `initialView` pass-through. **Repaired in this branch** (see
  below); `site/app` itself was not changed.

### Repaired stale assertions — superseded upstream

Three assertions in `site/tests/rendered-html.test.mjs` and
`site/tests/workspace-view.test.mjs`, plus the `site/tests/fixture-safety.test.mjs`
control guard, still expected legacy-fixture copy that the generic onboarding
rework `3320f26` had removed. This lane repaired all of them.

`main` then landed `4ec377d` (Work Unit D, the coherent operator interface),
which rewrote the same three files against the reconstructed UI. Merging `main`
into this branch conflicted on exactly those files and **`main`'s versions were
taken in full**; all three are now byte-identical to `main`. This lane's repairs
are therefore superseded and carry no remaining diff.

The diagnosis was independently confirmed rather than discarded. Work Unit D
reached the same conclusions: the fixture-era labels must be asserted *absent*
rather than disabled, and the property they stood for must be stated directly as
a no-enabled-consequential-control guard. Its guard keys on consequential verbs
(`Approve`, `Defer`, `Reject`, `CSV`, `Export`, `Send`, `Call`, `Dispatch`, …)
with its own anti-vacuity floor, which is more maintainable than this lane's
allowlist of inert labels, so nothing was carried forward.

### Corrected release-gate expectations — resolved upstream

`site/tests/greenfield-target-config.test.mjs` assumed a `drizzle/` holding
exactly the manifest's ten files. This lane declined to extend the manifest,
because `0010` through `0019` were never applied to or verified against the
hosted target and asserting otherwise would have fabricated release evidence.
Instead both failing cases were pinned to the gate's real behaviour
(`migration_manifest_mismatch`), deliberately so that a future manifest refresh
would fail them loudly rather than drift silently.

`main` then landed `5cafe71`, which extended the manifest to all twenty
migrations and updated `site/scripts/greenfield-target-config.mjs` accordingly.
That extension is sound: the ten pre-existing rows are unchanged and were
independently recomputed byte-for-byte, the expected row count now derives from
the checked Drizzle journal rather than a literal, and it states explicitly that
"the appended migrations were not applied remotely and carry no hosted
evidence" with the recorded remote journal remaining at ten rows. Local bytes
are described; the hosted boundary is preserved.

The pins fired exactly as intended and are now removed:
`site/tests/greenfield-target-config.test.mjs` is restored to its pre-pin
content and passes 6/6 against the extended manifest. **The suspended
happy-path coverage of candidate preparation is restored** — that gap is
closed, and the release gate remains armed on any future drift.

### Strengthened the fixture-safety guard

`site/tests/fixture-safety.test.mjs` asserted that five consequential controls
render natively disabled. Two of them, Approve and Defer, no longer render at
all because their sample fixture is gone. Rather than re-add a fixture to
satisfy the assertion, the test now:

- keeps asserting the three controls that do render are natively disabled;
- asserts Approve and Defer are absent entirely; and
- adds the property those labels stood for, stated directly: **no consequential
  control may render enabled.** Every enabled button must match a named list of
  inert navigation and read-only reload controls, so any future enabled Approve,
  Send, Export, or Run control fails the test until it is deliberately listed.

A rendered probe across all six views confirmed the current state: 80 buttons,
58 enabled, and every enabled one is inert navigation (`Pilot Status`,
`Morning Brief`, `Knowledge`, `Market Discovery`, `Review Queue`, `Prospects`,
`Exports & History`, `Company setup`, `Pilot settings`, `Open queue`, `Continue
setup`, `Load current authority`). The new guard was negative-controlled by
removing one known label, which fails it with the exact offending control named.
Coverage is strictly stronger than before; the suite passes 1/1 and lint is
clean.

## Boundary

This is bounded local preparation under
`.planning/phases/05-controlled-enrichment-and-verified-contacts/05-PREPARATION.md`.
It uses fictional data only. No provider, credential, secret, account, quote,
paid request, spend, hosted target, Sites project, deployment, real contact, or
outbound effect was used or enabled. Production contact-provider composition and
Phase 5 activation remain reject-only and unconfigured.

It executes and completes no Phase 5 plan, changes no `depends_on` contract,
earns no phase credit, and creates no `05-*-SUMMARY.md`. Phase 4 acceptance,
Plans `05-01` through `05-09`, persistence composition of this decision, an
owner-facing reconciliation command, provider selection, credentials, and the
live-provider release gate all remain separate, non-substitutable checkpoints.
