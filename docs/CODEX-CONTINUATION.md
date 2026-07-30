# PROspector cross-account continuation handoff

**Created:** 2026-07-30  
**Repository:** `https://github.com/SJS1001/PROspector.git`  
**Branch:** `codex/generic-prospector-pilot`  
**Checkpoint before this handoff:** `0c6c8f0`  
**Focus:** Continue all remaining GSD phases while preserving private hosting and authority gates.

## Resume from another Codex account

1. Confirm the other account has GitHub read/write access to `SJS1001/PROspector`.
2. Clone the repository or open the saved project, fetch, and switch to `codex/generic-prospector-pilot`.
3. Read this file, `.planning/STATE.md`, `.planning/ROADMAP.md`, and the current phase's `*-PLAN.md`/`*-SUMMARY.md` files.
4. Run `gsd-sdk query init.execute-phase 2`. The next local plans are 02-06 and 02-07, which are dependency-safe to execute in parallel after 02-05.
5. Use `gpt-5.6-terra` medium for implementation/planning, Terra low for routine checks, and Sol medium only for final security/red-team or a demonstrated hard blocker.

Do not rely on a Codex conversation, local task IDs, or uncommitted work as authority. Git commits and repository artifacts are the portable source of truth.

## Current state

- Phase 1 automated build is complete; real second-principal and control-plane proof remains non-substitutable and must not be fabricated.
- Phase 2 has 20 independently verified plans. Plans 02-01 through 02-05 are complete.
- Phase 2 completed locally: Wave 0 RED contracts, exact `uuid@14.0.1` approval, additive migration `0004_consensus_knowledge.sql`, commercial hierarchy authority, and Proposed/Confirmed Knowledge authority.
- Phase 2 next: execute 02-06 generalized interview and 02-07 drift/replacement in parallel; then continue 02-08 onward in dependency order.
- Phase 4 preparation was integrated at `91d59cc`.
- Phase 5 preparation was integrated at `9eb7e7f`.
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
- Code continuation through GitHub is cross-account portable. Sites deployment administration may remain account-scoped; absence of Sites sharing does not authorize a second project.
- Hosted Phase 2 writes remain fail-closed until the ordered preflight, compatible deploy, additive migration, exact-source review/deploy, real-principal boundary proof, explicit eight-field authorization tuple, narrow `consensus_knowledge` activation, and owner lifecycle proof all pass.
- Missing human/external evidence must pause its activation plan and create no completion summary.

## Safety boundaries

- No discovery, prospecting, enrichment, exports, spend, Gmail, calling, scheduling, Runner work, messages, or outbound effects may be activated by Phase 2 work.
- Runtime arbitrary file upload stays disabled until real quarantine/scanning/release infrastructure is proven.
- Bounded UTF-8 `import_plain_text` may create Proposed Knowledge only; it grants no operational authority.
- Do not commit credentials, provider keys, cookies, tokens, private lead data, or raw hosted evidence.

## Verification baseline

- After Plan 02-05, commercial and knowledge repository suites pass 5/5 and lint passes.
- Migration 0000–0004 focused suite passes 3/3.
- The remaining intended RED failures belong to Plans 02-06 through 02-10 until their production owners are implemented.
- Before merging parallel work, run the plan-specific focused tests; after each wave, run `cd site && npm test && npm run lint` when the validation contract says the full suite is expected green.

## Suggested skills for the next account

- `gsd-autonomous` to continue the milestone loop.
- `gsd-execute-phase` for current Phase 2 plans.
- `gsd-code-review`, `gsd-secure-phase`, `gsd-ui-review`, and `red-team` at their defined gates.
- `sites:sites-building` followed by `sites:sites-hosting` only for reviewed, authorized deployment work.
