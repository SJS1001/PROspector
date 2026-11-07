# Phase 4 UI reconciliation and cross-card pending guard (04-09)

## Isolation and overlap

Independent worktree `/workspace/PROspector-ui`, branch
`fix/phase4-ui-pending-status`, based on `origin/main` at `96981f4`.
No dependency on PRs #143–145, no changes to their checkout, and no changes
to shared planning ledgers, migrations, schemas, domain logic, or dependencies.

The old handoff UI finding is partly stale: merged PR #115 (`29af13c`)
already supplies stale-readiness recovery, action-specific Approval/Rejection/
Deferral pending copy, card-local rejection confirmation, and focus restoration.
It also added component interaction tests and browser keyboard/reflow assertions.
Do not duplicate those production changes or claim they were newly implemented.

## Bounded remaining regression coverage

Plan 04-09 Task 2 requires competing decisions disabled while preserving the
immutable assessment. Existing pending tests mount only one card. Add a two-card
interaction regression that captures both approval callbacks before rerender:

- same-turn competing callbacks issue exactly one command for the first prospect;
- all Approve/Reject/Defer buttons on both cards become natively disabled;
- immutable assessment links stay present;
- one action-specific Approval pending status uses polite live announcement;
- settling the operation never retries and preserves the second card's draft.

No production changes were needed: the existing pending ref passes this stronger
regression. React component interaction is not real-browser acceptance.

## Exact local evidence

- `node --test tests/profile-prospecting-components.test.mjs tests/profile-prospecting-ui.test.mjs`: **15/15 pass**, actual exit 0 (~16 seconds), `/tmp/prospector-ui-focused.log`.
- `npm run lint`: **exit 0**, `/tmp/prospector-ui-lint.log`.
- `git diff --check`: pass.
- Worktree dependencies installed separately with checked lockfile, `npm ci --ignore-scripts`; no dependency file changes or shared node_modules.
- No full canonical suite started here while PR145's separate full suite was active.
- Browser assertions exist in `site/tests/browser/operator-journey-e1.spec.ts`;
  not executed by this lane. Pinned Playwright 1.63.0 unchanged. Browser reproof
  and this branch's canonical gate remain pending, not implicitly inherited from PR145.

## Gates / non-claims

Local regression coverage only. No phase/plan acceptance, no hosted proof,
provider access, live data, export, outbound, schedules, or merging.
