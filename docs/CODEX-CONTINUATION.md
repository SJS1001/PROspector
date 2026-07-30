# PROspector cross-account continuation handoff

**Created:** 2026-07-30  
**Repository:** `https://github.com/SJS1001/PROspector.git`  
**Branch:** `codex/generic-prospector-pilot`  
**Portable checkpoint:** use the latest `origin/codex/generic-prospector-pilot` commit  
**Focus:** Continue all remaining GSD phases while preserving private hosting and authority gates.

## Resume from another Codex account

1. Confirm the other account has GitHub read/write access to `SJS1001/PROspector`.
2. Clone the repository or open the saved project, fetch, and switch to `codex/generic-prospector-pilot`:

   ```bash
   git clone https://github.com/SJS1001/PROspector.git
   cd PROspector
   git fetch origin
   git switch --track origin/codex/generic-prospector-pilot
   ```

   If the branch already exists locally, use `git switch codex/generic-prospector-pilot` followed by `git pull --ff-only`.
3. Read this file, `.planning/STATE.md`, `.planning/ROADMAP.md`, and the current phase's `*-PLAN.md`/`*-SUMMARY.md` files.
4. Install and verify the application from `site/` with Node.js 22.13 or newer: `npm ci`, `npm test`, and `npm run lint`.
5. First remediate and independently re-review the open local findings in `02-REVIEW.md`, `02-SECURITY.md`, and `02-UI-REVIEW.md`. Then resume Phase 2 from Plan 02-12 after reading `02-ACTIVATION.md`. Plan 02-12 is a real hosted-evidence checkpoint, not an implementation task that can be marked complete locally.
6. Use `gpt-5.6-terra` medium for implementation/planning, Terra low for routine checks, and Sol medium only for final security/red-team or a demonstrated hard blocker.

Do not rely on a Codex conversation, local task IDs, or uncommitted work as authority. Git commits and repository artifacts are the portable source of truth.

GSD skills and `gsd-sdk` are account-level tools, not repository dependencies. If they are unavailable in the new account, follow the checked `*-PLAN.md` files directly, preserve their dependency order and human checkpoints, write the matching `*-SUMMARY.md` only when a plan is genuinely complete, and run the repository verification commands.

## Paste-ready prompt for another Codex account

> Continue the PROspector project from `https://github.com/SJS1001/PROspector.git` on branch `codex/generic-prospector-pilot`. Read `AGENTS.md`, `docs/CODEX-CONTINUATION.md`, `.planning/STATE.md`, `.planning/ROADMAP.md`, and the Phase 2 activation/audit files before changing anything. Treat Git and committed repository artifacts as the source of truth, preserve all human/hosted evidence gates, keep the existing Sites project private, never create a replacement Sites project, and never reveal or alter secrets. Install with `cd site && npm ci`, run the tests and lint, remediate and re-review open local Phase 2 findings, then stop at Plan 02-12 unless the named real-principal and hosted D1 prerequisites are genuinely available. Continue later plans only in dependency order and never fabricate completion evidence.

## Current state

- Phase 1 automated build is complete; real second-principal and control-plane proof remains non-substitutable and must not be fabricated.
- Phase 2 has 20 independently verified plans. Plans 02-01 through 02-11 are implemented locally and have summaries.
- Phase 2 completed locally: Wave 0 RED contracts, exact `uuid@14.0.1` approval, additive migration `0004_consensus_knowledge.sql`, commercial hierarchy authority, and Proposed/Confirmed Knowledge authority.
- Phase 2 Plan 02-12 is blocked on two non-substitutable prerequisites: a real second signed-in principal for hosting-boundary denial/zero-state-delta proof, and an owner-side read-only hosted D1 baseline for migrations 0000-0003. No `02-12-SUMMARY.md` exists by design.
- Phase 2 Plans 02-13 through 02-20 remain dependency-blocked behind Plan 02-12.
- Independent Phase 2 code, security, and UI audits are recorded in `02-REVIEW.md`, `02-SECURITY.md`, and `02-UI-REVIEW.md`; local remediation work must be integrated and re-audited before any hosted activation.
- Phase 4 preparation was integrated at `91d59cc`.
- Phase 5 preparation was integrated at `9eb7e7f`.
- Phase 6 preparation was integrated at `f60ad82`.
- Phase 7 preparation was integrated at `fc3f46f` and `e39ef11`.
- Phase 3 context, research, validation, patterns, approved UI contract, and 11 independently checked plans were integrated at `dfa51f2`. Execution remains gated on Phase 2 completion and the explicit capability evidence named in those plans.

Use these existing artifacts rather than restating product decisions:

- `docs/DIRECTION.md`
- `docs/IMPLEMENTATION-SPEC.md`
- `docs/adr/`
- `.planning/phases/02-consensus-knowledge-and-commercial-model/`
- `.planning/phases/04-profile-readiness-and-evidence-based-prospecting/`
- `.planning/phases/05-controlled-enrichment-and-verified-contacts/`

## Hosting and external authority

- Reuse Sites project `appgprj_6a6a2e5c533081919e9c47dd6dd6ceba` only.
- Production URL: `https://prospector-steven-pilot.djstif.chatgpt.site/`.
- Keep the site private. Never clone, replace, delete, rename, or make it public as a workaround.
- Never display, copy, rotate, or remove secret values.
- Safe runtime binding names are `DB`, `FILES`, `PILOT_OWNER_EMAIL`, and `OWNER_SUBJECT_PEPPER`. Their names may be documented; their values must never be copied into chat, Git, logs, screenshots, or handoff artifacts.
- Code, plans, decisions, tests, and safe evidence references are portable through GitHub. Each Codex account must independently have GitHub access to the repository.
- Sites deployment administration is not made portable by GitHub. The existing Sites project is owner/workspace scoped; an account that cannot resolve the project must use the platform's supported same-workspace collaboration or ownership procedure. Absence of cross-account Sites sharing does not authorize a second project.
- Hosted Phase 2 writes remain fail-closed until the ordered preflight, compatible deploy, additive migration, exact-source review/deploy, real-principal boundary proof, explicit eight-field authorization tuple, narrow `consensus_knowledge` activation, and owner lifecycle proof all pass.
- Missing human/external evidence must pause its activation plan and create no completion summary.

## Safety boundaries

- No discovery, prospecting, enrichment, exports, spend, Gmail, calling, scheduling, Runner work, messages, or outbound effects may be activated by Phase 2 work.
- Runtime arbitrary file upload stays disabled until real quarantine/scanning/release infrastructure is proven.
- Bounded UTF-8 `import_plain_text` may create Proposed Knowledge only; it grants no operational authority.
- Do not commit credentials, provider keys, cookies, tokens, private lead data, or raw hosted evidence.

## Verification baseline

- After Plan 02-11, the canonical local suite passes 37/37 with loopback permission. Lint and build pass. A sandbox-only Miniflare loopback `EPERM` is not a product regression; rerun with loopback permission rather than changing code to bypass it.
- Migration 0000–0004 focused suite passes 3/3.
- No intended local RED failures remain through Plan 02-11. Plans 02-12 onward contain non-substitutable hosted evidence and authorization checkpoints.
- Before merging parallel work, run the plan-specific focused tests; after each wave, run `cd site && npm test && npm run lint` when the validation contract says the full suite is expected green.

## Suggested skills for the next account

- `gsd-autonomous` to continue the milestone loop.
- `gsd-execute-phase` for current Phase 2 plans.
- `gsd-code-review`, `gsd-secure-phase`, `gsd-ui-review`, and `red-team` at their defined gates.
- `sites:sites-building` followed by `sites:sites-hosting` only for reviewed, authorized deployment work.
