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
5. Confirm the current Phase 2 code/security audit results and note the source revision of the UI review, then resume Phase 2 from Plan 02-12 after reading `02-ACTIVATION.md`. Plan 02-12 is a real hosted-evidence checkpoint, not an implementation task that can be marked complete locally.
6. Use `gpt-5.6-terra` medium for implementation/planning, Terra low for routine checks, and Sol medium only for final security/red-team or a demonstrated hard blocker.

Do not rely on a Codex conversation, local task IDs, or uncommitted work as authority. Git commits and repository artifacts are the portable source of truth.

GSD skills and `gsd-sdk` are account-level tools, not repository dependencies. If they are unavailable in the new account, follow the checked `*-PLAN.md` files directly, preserve their dependency order and human checkpoints, write the matching `*-SUMMARY.md` only when a plan is genuinely complete, and run the repository verification commands.

## Paste-ready prompt for another Codex account

> Continue the PROspector project from `https://github.com/SJS1001/PROspector.git` on branch `codex/generic-prospector-pilot`. Read `AGENTS.md`, `docs/CODEX-CONTINUATION.md`, `.planning/STATE.md`, `.planning/ROADMAP.md`, and the Phase 2 activation/audit files before changing anything. Treat Git and committed repository artifacts as the source of truth, preserve all human/hosted evidence gates, keep the existing Sites project private, never create a replacement Sites project, and never reveal or alter secrets. Install with `cd site && npm ci`, run `npm test` and `npm run lint`, and preserve the clean local implementation. Plan 02-12 remains blocked until its real-principal and hosted D1 prerequisites genuinely exist. Phase 3 local Plans 03-01 through 03-08 and their summaries are committed; this is local-plan credit only, while Plans 03-09 through 03-11 remain human/hosted gates. Phase 4 has a clean local candidate but remains hosted/human-gated. Phase 5 has a verified, reject-only local preparation checkpoint at `c3233abf4e752afb5ca4e9d0a588852a4aaae07f`; it completes no Phase 5 plan. Continue only in dependency order and never fabricate completion evidence.

## Current state

- Phase 1 automated build is complete; real second-principal and control-plane proof remains non-substitutable and must not be fabricated.
- Phase 2 has 20 independently verified plans. Plans 02-01 through 02-11 are implemented locally and have summaries.
- Phase 2 completed locally: Wave 0 RED contracts, exact `uuid@14.0.1` approval, additive migration `0004_consensus_knowledge.sql`, commercial hierarchy authority, and Proposed/Confirmed Knowledge authority.
- Phase 2 Plan 02-12 is blocked on two non-substitutable prerequisites: a real second signed-in principal for hosting-boundary denial/zero-state-delta proof, and an owner-side read-only hosted D1 baseline for migrations 0000-0003. No `02-12-SUMMARY.md` exists by design.
- Phase 2 Plans 02-13 through 02-20 remain dependency-blocked behind Plan 02-12.
- Independent Phase 2 code, security, and UI audits are recorded in `02-REVIEW.md`, `02-SECURITY.md`, and `02-UI-REVIEW.md`. The final code re-review after `2e879dc` and `45bcdc1` is clean; security has no open local implementation threats. Hosted evidence remains separate and blocked.
- Phase 3 Plans 03-01 through 03-08 have committed local implementation, tests, UI, race hardening, a fail-closed offline release preflight, and matching summaries. They count as local-plan completion only; the phase and its requirements remain unaccepted while Phase 2 and the external gates are incomplete.
- Phase 3 Plans 03-09 through 03-11 require explicit owner authorization, controlled hosted proof, and owner lifecycle acceptance. They remain incomplete and cannot be replaced by local evidence.
- Phase 4 context/research/UI/validation and 12 checked plans are committed. Wave 1 is underway: RED contracts and additive profile-prospecting persistence are committed, but no Phase 4 plan summary exists.
- Phase 5 has 9 checked plans and a bounded local-only preparation lane. Checkpoint `c3233abf4e752afb5ca4e9d0a588852a4aaae07f` is pushed, independently reviewed clean, and verified by full test/lint/build on an isolated non-CI Mac Studio checkout. Provider composition and activation remain reject-only; no Phase 5 plan is complete.
- Phase 6 preparation and 13 checked plans are committed; execution has not started.
- Phase 7 preparation was integrated at `fc3f46f` and `e39ef11`.
- Later-phase local preparation does not satisfy Phase 2 or Phase 3 hosted/human gates and grants no operational authority.

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

- The latest clean Phase 2 re-review after `2e879dc` and `45bcdc1` verified CR-09 through CR-11 and WR-07 closed, including server-derived candidate authority, reduced UI mutation payloads, and forged/stale request rejection.
- `npm test` and `npm run lint` passed at that Phase 2 review checkpoint. Subsequent branch commits add Phase 3/4 work and test-runner isolation, so rerun the canonical commands before treating the current checkout as verified.
- Phase 3 has a focused local `test:phase3` contract and an offline fail-closed release preflight. The preflight must remain nonzero without the required owner/hosted evidence; that result is expected and is not a local implementation failure.
- Phase 5 local preparation checkpoint `c3233abf4e752afb5ca4e9d0a588852a4aaae07f` passed `npm test`, `npm run lint`, and `npm run build` on an isolated non-CI Mac Studio checkout. Independent exact-source and persistence/security reviews found no blocker, high, or medium issue. This is local preparation evidence only and cannot satisfy its upstream or activation gates.
- A sandbox-only Miniflare loopback `EPERM` is an environment restriction; rerun with loopback permission rather than weakening tests or runtime.
- No completion summary may be created for a blocked plan. Local code, fixtures, tests, digests, and status prose do not satisfy Plans 02-12 or 03-09 through 03-11.

## Suggested skills for the next account

- `gsd-autonomous` to continue the milestone loop.
- `gsd-execute-phase` for current Phase 2 plans.
- `gsd-code-review`, `gsd-secure-phase`, `gsd-ui-review`, and `red-team` at their defined gates.
- `sites:sites-building` followed by `sites:sites-hosting` only for reviewed, authorized deployment work.
