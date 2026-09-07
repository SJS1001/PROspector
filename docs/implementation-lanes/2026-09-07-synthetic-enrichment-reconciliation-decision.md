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

This lane adds that missing description only.

## Scope

`site/domain/synthetic-enrichment-reconciliation-decision.ts` is a pure,
deterministic decision over three fictional inputs:

- one already-recorded synthetic uncertain reservation (`timeout` or
  `ambiguous` only) carrying its exact grant, operation key, provider identity
  and version, catalog reference, quote revision, configuration binding, durable
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

- `node --test --test-concurrency=1 tests/synthetic-enrichment-reconciliation-decision.test.mjs` — 13/13.
- `node scripts/run-test-suite.mjs tests/enrichment-contract.test.mjs tests/controlled-enrichment-integration.test.mjs tests/contacts-command-service.test.mjs tests/contacts-ui.test.mjs` — 6/6, 22/22, 4/4, 11/11.
- `node scripts/run-test-suite.mjs tests/contact-eligibility.test.mjs tests/identity-resolution.test.mjs tests/synthetic-enrichment-prerequisite-plan.test.mjs` — all green.
- `npm run lint` — clean.

### Full-suite sweep

**Status: re-run in progress — the numbers in this section are pre-repair and
will be replaced.**

An initial sweep ran the 80 `site/tests/*.test.mjs` files following
`greenfield-target-config.test.mjs`, each in its own process and non-stopping so
no single failure could hide the rest: **80 files, 602 passing, 2 failing**.
Both failures were pre-existing. The candidate's own suite passed 13/13.

That sweep predates the four repairs recorded below. A complete sweep over all
119 test files is running against the current head; this section will be
replaced with its exact tally. Until then, treat the counts above as describing
the pre-repair tree only, and do not cite them as the current result.

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
  `migration_manifest_mismatch`. **The manifest is not stale and the gate is
  correct.** `02-99-MIGRATION-MANIFEST.md` pins exactly ten files, `0000`
  through `0009`, and its verification contract stops the release on any
  additional migration. `0010` through `0019` have since landed locally, so
  the gate fires as designed. `.planning/STATE.md` records the hosted D1
  target still at `0009` — ten journal rows, 92 tables, 206 indexes, 149
  triggers, no pending migration — and nothing records `0010` through `0019`
  being applied remotely. Extending the manifest would assert release evidence
  for a chain never applied to or verified against the target, so it was not
  done. **The two tests were corrected instead** (see below); the gate stays
  armed and no evidence changed.
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

### Corrected release-gate expectations

`site/tests/greenfield-target-config.test.mjs` assumed a `drizzle/` holding
exactly the manifest's ten files. Both failing cases were corrected to assert
the gate's real current behaviour rather than to disarm it:

- The former "prepares one private fail-closed target candidate" case now
  asserts the release stops with `migration_manifest_mismatch`, writes no
  candidate, and leaks no private mapping value; it is renamed accordingly.
- The no-overwrite case still proves its actual safety property — an existing
  private candidate survives — and records that the manifest gate now aborts
  ahead of the `output_exists` check.

Both assertions pin the current blocking code deliberately, so refreshing the
manifest against a future authorized remote apply fails them loudly and prompts
the revert. Direct happy-path coverage of candidate preparation is **suspended,
not deleted**: restoring it needs either that manifest refresh or an injectable
migration root in `site/scripts/greenfield-target-config.mjs`, which is shared
Phase 2 release tooling outside this lane. The suite passes 6/6 and lint is
clean.

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
