# PROspector cross-account continuation handoff

**Created:** 2026-07-30  
**Repository:** `https://github.com/SJS1001/PROspector.git`  
**Branch:** `codex/generic-prospector-pilot`  
**Portable checkpoint:** use the latest `origin/codex/generic-prospector-pilot` commit  
**Focus:** Continue all remaining GSD phases while preserving private hosting and authority gates.

## Fresh isolated pilot ownership

For the separately authorized fresh PROspector pilot, use the non-secret
deployment ownership record in [`DEPLOYMENT-OWNERSHIP.md`](DEPLOYMENT-OWNERSHIP.md).
It does not change the preservation requirements for the original deployment
or authorize access to it.

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
5. Read `.planning/forensics/report-20260824-140458.md`, `02-INCIDENT-RECONCILIATION.md`, `02-21-PLAN.md`, and terminal barrier `02-99-PLAN.md` after the Phase 2 activation and audit files. Plan 02-13 acceptance is invalidated; the original Plans 02-14 through 02-20 are preserved as `*.retired.md` history outside executor discovery. Plan 02-21 permits only completion of the remaining read-only provenance, one local design-only recovery contract, independent design review, and a separate decision that may authorize only drafting/checking a future plan. Plan 02-21 completion leaves Phase 2 incomplete at Plan 02-99. No executable recovery artifact, rehearsal, provider recovery environment, future execution plan, or hosted recovery write is authorized.
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

> Continue the PROspector project from `https://github.com/SJS1001/PROspector.git` on branch `codex/generic-prospector-pilot`. Read `AGENTS.md`, `docs/CODEX-CONTINUATION.md`, `.planning/STATE.md`, `.planning/ROADMAP.md`, the Phase 2 activation/audit files, `.planning/forensics/report-20260824-140458.md`, `02-INCIDENT-RECONCILIATION.md`, `02-21-PLAN.md`, and `02-99-PLAN.md` before changing anything. Treat Git and committed repository artifacts as the source of truth, preserve all human/hosted evidence gates, keep the existing Sites project private, never create a replacement Sites project, and never reveal or alter secrets. Plan 02-13 acceptance is invalidated. Owner-authorized read-only inspection now rules out a complete reviewed `b93c71d…` 0004 and aligns the live columns with a superseded pre-`e66dbf0` family, but exact journal/constraint/trigger/index/FK state, actor, mechanism, and time remain unknown; classification is `partial/mixed/unknown`. The original Plans 02-14 through 02-20 are preserved verbatim as `*.retired.md` history outside GSD executor discovery and cannot be resumed. Plan 02-21 permits only the remaining provider-supported read-only evidence, one local design-only recovery contract, independent design review, and a separate decision that may authorize only drafting/checking a future path-specific plan. It creates no executable artifact, rehearsal, provider recovery environment, restore drill, future execution plan, or hosted write. Plan 02-99 is the canonical terminal barrier: future planning must atomically move it after the replacement sequence's terminal successor, and it cannot summarize until that sequence executes, fresh Phase 2 verification passes, and the owner accepts the exact artifact/target/evidence tuple. Keep every hosted write frozen and the gate absent. Phase 3 Plans 03-01 through 03-08 remain local-only completion credit; later phases remain dependency-gated. Never fabricate completion evidence or improvise a rollback or repair.

## Current state

- Phase 1 automated build is complete; real second-principal and control-plane proof remains non-substitutable and must not be fabricated.
- Phase 2 has 15 active plans and 32 tasks. Plans 02-01 through 02-12 retain accepted completion credit. The Plan 02-13 summary is preserved only as invalidated incident history and does not count as completion. Plan 02-21 is the non-autonomous incident classification/recovery-design plan and has no summary. Plan 02-99 is the non-autonomous two-task verification/terminal-acceptance barrier and also has no summary. Seven obsolete hosted-release plans, 02-14 through 02-20, remain preserved as retired non-plan history outside executor discovery.
- Phase 2 local implementation includes Wave 0 RED contracts, exact `uuid@14.0.1` approval, the reviewed `0004_consensus_knowledge.sql` file, commercial hierarchy authority, and Proposed/Confirmed Knowledge authority. The local migration file is not evidence of what ran against hosted D1.
- Phase 2 Plan 02-12 records the owner-accepted redacted real-principal denial/zero-state-delta proof and read-only hosted D1 baseline available on 2026-08-01. It does not classify the current live schema or repair the later incident.
- On 2026-08-01, the Sites-owning account restored the original project from temporary public access to custom owner-only access (one owner, no other users, groups, or editors). That restoration alone was not evidence for Plan 02-12; the owner separately accepted the later redacted Plan 02-12 evidence set.
- The 2026-08-24 forensic report invalidates Plan 02-13 acceptance: a supplied read-only observation contradicts the required schema-0003/no-migration premise, and Git proves the deployed source was reconstructed from superseded blobs rather than the reviewed Phase 2 lineage.
- The exact applied migration digest, migration mechanism, actor, time, journal state, and live schema completeness are unknown. The original Plans 02-14 through 02-20 are structurally retired from GSD discovery and cannot be executed.
- Owner-authorized read-only inspection on 2026-08-25 resolved the same private owner-only project at version 11/source `e07e3f9`, confirmed zero gate rows, and obtained a complete 42-table overview. The observed 0004-family columns rule out a complete reviewed `b93c71d…` schema and align with a superseded pre-`e66dbf0` family, but cannot distinguish exact `aa89768…` from an intermediate variant without the missing journal, canonical schema, trigger/index/FK, invariant, and provider-audit evidence. No normal 0005–0009 tables were observed.
- Independent Phase 2 code, security, and UI audits are recorded in `02-REVIEW.md`, `02-SECURITY.md`, and `02-UI-REVIEW.md`. Their clean local results apply to reviewed mainline source, not the divergent deployed artifact, and authorize no hosted action.
- Phase 3 Plans 03-01 through 03-08 have committed local implementation, tests, UI, race hardening, a fail-closed offline release preflight, and matching summaries. They count as local-plan completion only; the phase and its requirements remain unaccepted while Phase 2 and the external gates are incomplete.
- Phase 3 Plans 03-09 through 03-11 require explicit owner authorization, controlled hosted proof, and owner lifecycle acceptance. They remain incomplete and cannot be replaced by local evidence.
- Phase 4 context/research/UI/validation and 12 checked plans are committed. Wave 1 is underway: RED contracts and additive profile-prospecting persistence are committed, but no Phase 4 plan summary exists.
- Phase 5 has 9 checked plans and a bounded local-only preparation lane. Checkpoint `c3233abf4e752afb5ca4e9d0a588852a4aaae07f` is pushed, independently reviewed clean, and verified by full test/lint/build on an isolated non-CI Mac Studio checkout. Provider composition and activation remain reject-only; no Phase 5 plan is complete.
- Phase 6 preparation and 13 checked plans are committed; execution has not started.
- Phase 7 preparation was integrated at `fc3f46f` and `e39ef11`.
- Later-phase local preparation does not satisfy Phase 2 or Phase 3 hosted/human gates and grants no operational authority.
- Safe resume is Plan 02-21 Task 1: finish the remaining provider-supported read-only journal/schema/provider-audit evidence on the same existing private project. One local design-only recovery contract and independent design review may follow in the checked order. A later exact owner decision may authorize only drafting/checking a future path-specific plan; that future plan must contain its own artifact-bound owner checkpoint before any write. Plan 02-99 remains incomplete throughout and must later be atomically rebased after the replacement terminal successor. All hosted writes remain frozen and the gate must remain absent.
- The current reviewed checkout includes a fail-closed `incident-provenance` mode in `site/scripts/phase2-hosted-preflight.mjs` for the D1 portion of that checkpoint. It uses only fixed reads, double-collects a target/time-bound redacted envelope, and always remains partial while protected/audit digests and provider binding/audit are external. Its 17 focused contracts, full suite/build, lint, and independent BLOCKER/HIGH review pass. It has not been run against the hosted target and is not Task 1 evidence or approval.

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
- The Phase 2 release order is interrupted by the schema/source incident. The 2026-08-25 read-only inspection narrows the state to `partial/mixed/unknown` with strong evidence of a superseded schema family but does not complete provenance. Do not deploy, migrate, compensate, restore, alter access, run a gate writer, create a recovery environment, or perform any other hosted write. Plan 02-21 ends at design review and authority only to draft/check a future plan; it cannot authorize execution. Plan 02-99 prevents design completion from being treated as Phase 2 completion and itself performs no hosted action.
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
- No completion summary may be created for a blocked plan. The existing `02-13-SUMMARY.md` is retained only as clearly invalidated incident history and earns no completion credit. Local code, fixtures, tests, digests, and status prose do not satisfy Plan 02-21, terminal Plan 02-99, or Plans 03-09 through 03-11; retired 02-14 through 02-20 cannot be completed or resumed.

## Safe next action

Do not start a hosted execution or recovery workflow. Resume Plan 02-21 Task 1
only: an owner-authorized account may collect the remaining redacted,
target-bound, read-only journal, canonical schema, trigger/index/FK, invariant,
and provider-audit evidence specified by `02-INCIDENT-RECONCILIATION.md`. The
checked incident-only collector may be used from the verified current checkout
only with the exact immutable target and owner-held provider access; its partial
output must be combined with separate provider binding/audit and protected-data
digest evidence before owner approval. One
local design-only recovery contract and independent design review may then
proceed in Plan 02-21. A fresh explicit owner decision may authorize only
drafting/checking a new path-specific plan. That future plan must separately
require exact implemented source/recovery digests, backup/restore evidence,
target/actor binding, independent exact-artifact review, rollback boundary,
stop conditions, and another explicit owner checkpoint before any hosted
write. Future planning must atomically move terminal Plan 02-99 after the
replacement sequence's true terminal successor. Phase 2 remains incomplete
until that sequence executes, fresh verification passes, and Plan 02-99
receives exact artifact/target/evidence-bound owner acceptance.
