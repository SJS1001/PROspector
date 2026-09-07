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

Every `site/tests/*.test.mjs` file was then run in its own process in one
non-stopping sweep, so no single failure could hide the rest: **80 files, 602
passing, 2 failing**. Both failures were pre-existing and are recorded below.
The candidate's own suite passed 13/13 in that sweep.

### Pre-existing failures on the base branch

None is caused by this candidate. Each was attributed the same way: the
candidate's commits change no file involved, and the failure reproduces at the
base with the candidate files absent. Because of them the canonical `npm test`
gate does not pass end-to-end on this base independently of this work.

- `site/tests/drift-replacement.test.mjs` — 3/6 failed with
  `Commercial workspace is unavailable` / `knowledge_conflict` at
  `site/domain/knowledge.ts:435`. Repaired on the base branch by `0b7935c`.
- `site/tests/fixture-safety.test.mjs` — 1/1 fails with
  `Approve disabled must render with the native disabled attribute`. Still
  open; untouched by this lane.
- `site/tests/greenfield-target-config.test.mjs` — 2/6 fail with
  `migration_manifest_mismatch`. The checked manifest is bound to migration
  source `46d082e962c4acc1771e92ad300d61913d50ead4` while `0010` through
  `0019` have since landed; this is stale-manifest drift, not a regression.
  Still open; resolving it is migration-manifest work outside this lane.
- `site/tests/rendered-html.test.mjs` and `site/tests/workspace-view.test.mjs`
  — stale assertions left by the generic onboarding rework `3320f26`, which
  removed the hardcoded personal greeting, the seeded sample prospects, and the
  unconditional `initialView` pass-through. **Repaired in this branch** (see
  below); `site/app` itself was not changed.

### Repaired stale assertions

Three assertions asserted removed legacy-fixture copy. Each was replaced with
the generic behaviour that superseded it plus a negative guard, so coverage is
preserved rather than deleted:

- `Good morning, Steven` → `title="Morning brief"`, and the old greeting pinned
  absent. `site/tests/knowledge-ui.test.mjs` already asserted this string must
  *not* appear, so the two suites had directly contradicted each other.
- `Sample export-ready` → the generic `EXPORT-READY` / `No eligible records`
  zero state, with the fixture copy pinned absent.
- `initialView={initialView}` → the prop is still asserted server-seeded, plus a
  new assertion for the blank-local-onboarding redirect from Pilot Status to
  Knowledge that replaced the unconditional pass-through.

Both suites now pass (6/6 across them), `site/tests/knowledge-ui.test.mjs` and
`site/tests/local-demo-boundary.test.mjs` still pass 15/15, and lint is clean.

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
