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
5. Read `.planning/forensics/report-20260824-140458.md` after the Phase 2 activation and audit files. Plan 02-13 acceptance is invalidated by a hosted schema/source incident, Plan 02-14 and every later Phase 2 plan are non-executable, and the only permissible next action is owner-authorized read-only schema/journal/audit reconciliation on the same existing private project.
6. Use `gpt-5.6-terra` medium for implementation/planning, Terra low for routine checks, and Sol medium only for final security/red-team or a demonstrated hard blocker.

Do not rely on a Codex conversation, local task IDs, or uncommitted work as authority. Git commits and repository artifacts are the portable source of truth.

GSD skills and `gsd-sdk` are account-level tools, not repository dependencies. If they are unavailable in the new account, follow the checked `*-PLAN.md` files directly, preserve their dependency order and human checkpoints, write the matching `*-SUMMARY.md` only when a plan is genuinely complete, and run the repository verification commands.

## Multi-account baton protocol

Use Codex accounts sequentially, with Git as the shared memory. Do not run two writing accounts against this branch at the same time.

1. Start every account by fetching and fast-forwarding `codex/generic-prospector-pilot`; require a clean worktree and read the committed state before selecting work.
2. Classify the account before acting. If it resolves the exact existing Sites project, it is the **hosted-gate account** and may perform only the currently authorized Sites/D1 evidence step. If it cannot resolve the project, it is a **local-work account** and must never create a substitute project or claim hosted evidence.
3. The hosted-gate account must restore owner-only/private access if the site was temporarily made public before continuing Plan `02-12`. Public visitor access grants neither project administration nor valid private-boundary evidence.
4. Take one bounded executable plan or maintenance unit per account. Use subagents only for independent implementation/review work with non-overlapping ownership.
5. When roughly one quarter of that account's usable context remains, stop accepting new scope. Finish verification, update truthful state/evidence references, commit atomically, and push.
6. End every baton turn with a clean worktree, the full pushed SHA, and the exact next executable or blocked plan. Never leave another account dependent on chat history, a local stash, an uncommitted diff, or a task ID.
7. If a required real principal, hosted baseline, owner decision, credential, or control-plane capability is absent, record the exact blocker and switch accounts; do not spend tokens rebuilding local substitutes.

The Sites-owning account should be reserved for short hosted checkpoints. Other accounts should handle authorized local implementation, tests, documentation, and independent review. All accounts use Terra medium by default, Terra low for routine inspection, and Sol only for a demonstrated hard security/reasoning gate.

## Paste-ready prompt for another Codex account

> Continue the PROspector project from `https://github.com/SJS1001/PROspector.git` on branch `codex/generic-prospector-pilot`. Read `AGENTS.md`, `docs/CODEX-CONTINUATION.md`, `.planning/STATE.md`, `.planning/ROADMAP.md`, the Phase 2 activation/audit files, and `.planning/forensics/report-20260824-140458.md` before changing anything. Treat Git and committed repository artifacts as the source of truth, preserve all human/hosted evidence gates, keep the existing Sites project private, never create a replacement Sites project, and never reveal or alter secrets. Plan 02-13 acceptance is invalidated because its schema-0003 premise is contradicted and the deployed source was not the reviewed Phase 2 lineage. The exact applied migration digest and actor are unknown. Plans 02-14 through 02-20 are non-executable, all hosted writes remain frozen, and the gate must remain absent. The only permissible next action is owner-authorized read-only schema, migration-journal, and provider-audit reconciliation on the same existing private project. Phase 3 Plans 03-01 through 03-08 remain local-only completion credit; later phases remain dependency-gated. Never fabricate completion evidence or improvise a rollback or repair.

## Current state

- Phase 1 automated build is complete; real second-principal and control-plane proof remains non-substitutable and must not be fabricated.
- Phase 2 has 20 checked plans. Plans 02-01 through 02-12 retain accepted completion credit. The Plan 02-13 summary is preserved only as invalidated incident history and does not count as completion.
- Phase 2 local implementation includes Wave 0 RED contracts, exact `uuid@14.0.1` approval, the reviewed `0004_consensus_knowledge.sql` file, commercial hierarchy authority, and Proposed/Confirmed Knowledge authority. The local migration file is not evidence of what ran against hosted D1.
- Phase 2 Plan 02-12 records the owner-accepted redacted real-principal denial/zero-state-delta proof and read-only hosted D1 baseline available on 2026-08-01. It does not classify the current live schema or repair the later incident.
- On 2026-08-01, the Sites-owning account restored the original project from temporary public access to custom owner-only access (one owner, no other users, groups, or editors). That restoration alone was not evidence for Plan 02-12; the owner separately accepted the later redacted Plan 02-12 evidence set.
- The 2026-08-24 forensic report invalidates Plan 02-13 acceptance: a supplied read-only observation contradicts the required schema-0003/no-migration premise, and Git proves the deployed source was reconstructed from superseded blobs rather than the reviewed Phase 2 lineage.
- The exact applied migration digest, migration mechanism, actor, time, journal state, and live schema completeness are unknown. Plan 02-14 cannot safely apply the current migration, and Plans 02-14 through 02-20 are non-executable.
- Independent Phase 2 code, security, and UI audits are recorded in `02-REVIEW.md`, `02-SECURITY.md`, and `02-UI-REVIEW.md`. Their clean local results apply to reviewed mainline source, not the divergent deployed artifact, and authorize no hosted action.
- Phase 3 Plans 03-01 through 03-08 have committed local implementation, tests, UI, race hardening, a fail-closed offline release preflight, and matching summaries. They count as local-plan completion only; the phase and its requirements remain unaccepted while Phase 2 and the external gates are incomplete.
- Phase 3 Plans 03-09 through 03-11 require explicit owner authorization, controlled hosted proof, and owner lifecycle acceptance. They remain incomplete and cannot be replaced by local evidence.
- Phase 4 context/research/UI/validation and 12 checked plans are committed. Wave 1 is underway: RED contracts and additive profile-prospecting persistence are committed, but no Phase 4 plan summary exists.
- Phase 5 has 9 checked plans and a bounded local-only preparation lane. Checkpoint `c3233abf4e752afb5ca4e9d0a588852a4aaae07f` is pushed, independently reviewed clean, and verified by full test/lint/build on an isolated non-CI Mac Studio checkout. Provider composition and activation remain reject-only; no Phase 5 plan is complete.
- Phase 6 preparation and 13 checked plans are committed; execution has not started.
- Phase 7 preparation was integrated at `fc3f46f` and `e39ef11`.
- Later-phase local preparation does not satisfy Phase 2 or Phase 3 hosted/human gates and grants no operational authority.
- Safe resume is limited to an owner-authorized read-only schema, migration-journal, and provider-audit reconciliation on the same existing private project. All hosted writes remain frozen, the gate must remain absent, and no destructive rollback or forward repair is authorized.

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
- The Phase 2 release order is currently interrupted by the 2026-08-24 schema/source incident. Do not deploy, migrate, compensate, alter access, run a gate writer, or perform any other hosted write until the live database is classified through the owner-authorized read-only reconciliation and a later explicit owner decision authorizes a reviewed recovery path.
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
- Repository maintenance checkpoint `b794e89` patches the production-bundled React server component and coherent Cloudflare/Vite dependencies. A fresh install passed the three affected receipt/eligibility tests twice before build, then the full suite, lint, build, and Drizzle check. `npm audit --omit=dev` reports zero findings. The residual full-audit findings are confined to local ESLint/brace-expansion and Drizzle/esbuild-kit chains; npm offers only breaking or regressive replacements, so they remain recorded development-tool debt rather than runtime exposure.
- A sandbox-only Miniflare loopback `EPERM` is an environment restriction; rerun with loopback permission rather than weakening tests or runtime.
- No completion summary may be created for a blocked plan. The existing `02-13-SUMMARY.md` is retained only as clearly invalidated incident history and earns no completion credit. Local code, fixtures, tests, digests, and status prose do not satisfy the incident reconciliation, Plans 02-14 through 02-20, or Plans 03-09 through 03-11.

## Safe next action

Do not start an execution or hosting workflow. An owner-authorized account may
collect only the redacted, target-bound, read-only schema, migration-journal,
and provider-audit provenance bundle specified by
`.planning/forensics/report-20260824-140458.md`. Any later write requires a
fresh explicit owner decision naming the classified live schema, reviewed
recovery method, exact source/migration or reconciliation digests, backup and
restore evidence, target binding, independent review, and stop conditions.
