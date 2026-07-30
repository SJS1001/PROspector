# PROspector agent entrypoint

Before changing this repository, read these committed sources of truth in order:

1. `docs/CODEX-CONTINUATION.md`
2. `.planning/STATE.md`
3. `.planning/ROADMAP.md`
4. `.planning/phases/02-consensus-knowledge-and-commercial-model/02-ACTIVATION.md`
5. The active Phase 2 `02-REVIEW.md`, `02-SECURITY.md`, and `02-UI-REVIEW.md`
6. The current plan and every dependency summary named by that plan

Preserve the existing private Sites project. Do not create, clone, replace, rename, delete, or publicize a Sites project as a workaround for account-scoped access. Never display, copy, rotate, remove, or commit secret values or private hosted data.

Plans that require a real principal, hosted control-plane action, database evidence, deployment authority, or an explicit owner decision remain incomplete until that exact evidence exists. Local tests, fixtures, prose, digests, and status rows cannot substitute for those checkpoints. Do not create a completion summary for a blocked plan.

Use Node.js 22.13 or newer. From `site/`, install with `npm ci` and verify with `npm test` and `npm run lint`. Miniflare tests require loopback permission in restricted Codex environments; a loopback `EPERM` is an environment restriction, not permission to weaken the tests or runtime.

GSD skills and `gsd-sdk` are optional account tooling. When unavailable, execute the checked repository `*-PLAN.md` files directly in dependency order and maintain their summaries, audits, and state records in Git.
