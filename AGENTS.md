# PROspector agent entrypoint

Before changing this repository, read these committed sources of truth in order:

1. `docs/CODEX-CONTINUATION.md`
2. `docs/GREENFIELD-BASELINE.md`
3. `.planning/STATE.md`
4. `.planning/ROADMAP.md`
5. `.planning/phases/02-consensus-knowledge-and-commercial-model/02-ACTIVATION.md`
6. The active Phase 2 `02-REVIEW.md`, `02-SECURITY.md`, and `02-UI-REVIEW.md`
7. The current plan and every dependency summary named by that plan

Before proposing or reviewing any local Phase 4–7 product-composition work,
also read `.planning/LOCAL-DEMO-COMPOSITION.md`. It is an explicitly
unaccepted dependency track and does not change plan credit or external gates.

The original private Sites project is inaccessible and permanently retired from the execution path. Do not resolve, inspect, access, migrate, restore, modify, clone, or depend on it. Future environments must be greenfield and require separate provisioning authority. Never display, copy, rotate, remove, or commit secret values or private hosted data.

Plans that require a real principal, hosted control-plane action, database evidence, deployment authority, or an explicit owner decision remain incomplete until that exact evidence exists. Local tests, fixtures, prose, digests, and status rows cannot substitute for those checkpoints. Do not create a completion summary for a blocked plan.

Use Node.js 22.13 or newer. From `site/`, install with `npm ci` and verify with `npm test` and `npm run lint`. Miniflare tests require loopback permission in restricted Codex environments; a loopback `EPERM` is an environment restriction, not permission to weaken the tests or runtime.

GSD skills and `gsd-sdk` are optional account tooling. When unavailable, execute the checked repository `*-PLAN.md` files directly in dependency order and maintain their summaries, audits, and state records in Git.

CI execution must follow [`docs/CI-RUNNER-POLICY.md`](docs/CI-RUNNER-POLICY.md):
GitHub-hosted Actions runners are prohibited. Use only repository-controlled
self-hosted local runners or approved non-GitHub cloud execution. Run
`node --test tests/ci-runner-policy.test.mjs` after changing CI configuration.

Every future coding session must read root `COMPLETION_LEDGER.md` before editing
and update it before the session ends. That includes a session that makes no
product change, fails, or stops on a blocker: record the no-change, failure, or
blocker reason, the command and counts when any were run, the source SHA, the
time, and the session. Keep the 17 v1 requirement IDs fixed. Plan credit 26/74
is a separate ledger and is not requirement acceptance or a product percent.
Do not mark a requirement `verified` without requirement-scoped proof that
satisfies its acceptance text. Run `node --test tests/completion-ledger.test.mjs`
after changing the ledger or `scripts/verify-completion-ledger.mjs`. This check
is a repository guard, not a guarantee that every external agent will run it.
