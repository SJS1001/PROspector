# PROspector cross-account continuation handoff

**Created:** 2026-07-30  
**Repository:** `https://github.com/SJS1001/PROspector.git`  
**Branch:** `codex/generic-prospector-pilot`  
**Portable checkpoint:** use the latest `origin/codex/generic-prospector-pilot` commit  
**Focus:** Continue from the verified greenfield local baseline while preserving every external-effect gate.

## Fresh isolated pilot ownership

The original hosted project is inaccessible and permanently outside the
execution path. Read [`GREENFIELD-BASELINE.md`](GREENFIELD-BASELINE.md) before
planning or implementation. No future target has been selected or provisioned.

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
5. Read `docs/GREENFIELD-BASELINE.md`, completed Plan `02-22` and its summary, and terminal Plan `02-99`. The forensic report, incident reconciliation, Plans 02-13 through 02-21, and the old recovery Plan 02-99 are retained only as retired history. Never resume them or attempt original-project access.
6. Use `gpt-5.6-terra` medium for implementation/planning, Terra low for routine checks, and Sol medium only for final security/red-team or a demonstrated hard blocker.

Do not rely on a Codex conversation, local task IDs, or uncommitted work as authority. Git commits and repository artifacts are the portable source of truth.

GSD skills and `gsd-sdk` are account-level tools, not repository dependencies. If they are unavailable in the new account, follow the checked `*-PLAN.md` files directly, preserve their dependency order and human checkpoints, write the matching `*-SUMMARY.md` only when a plan is genuinely complete, and run the repository verification commands.

## Multi-account baton protocol

Use Codex accounts sequentially, with Git as the shared memory. Do not run two writing accounts against this branch at the same time.

1. Start every account by fetching and fast-forwarding `codex/generic-prospector-pilot`; require a clean worktree and read the committed state before selecting work.
2. Do not inspect or resolve the original hosted project from any account. It has no remaining execution role.
3. Treat all accounts as local-work accounts unless a later owner decision separately authorizes a named new greenfield target. Never infer hosted evidence from account access.
4. Take one bounded executable plan or maintenance unit per account. Use subagents only for independent implementation/review work with non-overlapping ownership.
5. When roughly one quarter of that account's usable context remains, stop accepting new scope. Finish verification, update truthful state/evidence references, commit atomically, and push.
6. End every baton turn with a clean worktree, the full pushed SHA, and the exact next executable or blocked plan. Never leave another account dependent on chat history, a local stash, an uncommitted diff, or a task ID.
7. If a required real principal, hosted baseline, owner decision, credential, or control-plane capability is absent, record the exact blocker and switch accounts; do not spend tokens rebuilding local substitutes.

Accounts may handle authorized local implementation, tests, documentation, and independent review. All accounts use Terra medium by default, Terra low for routine inspection, and Sol only for a demonstrated hard security/reasoning gate.

## Paste-ready prompt for another Codex account

> Continue PROspector from the latest `origin/codex/generic-prospector-pilot`. Read `AGENTS.md`, `docs/CODEX-CONTINUATION.md`, `docs/GREENFIELD-BASELINE.md`, `.planning/STATE.md`, `.planning/ROADMAP.md`, completed Plan `02-22` and its summary, terminal Plan `02-99`, and the preparation contract for any local lane you select. The original hosted project is inaccessible and permanently retired: do not resolve, inspect, access, migrate, restore, modify, clone, or depend on it. Its journal/schema/provenance evidence is intentionally waived because no old state will be reused; make no claim that a migration occurred. Use only the checked repository and a fresh empty local database as the authoritative baseline. Continue bounded local and synthetic preparation while providers, production data, credentials, prospecting, enrichment calls, Gmail, calling, external exports, schedules, and every hosted write remain separately gated. Never fabricate hosted evidence or create phase summaries for blocked checkpoints.

## Current state

- Phase 1 automated build is complete; real second-principal and control-plane proof remains non-substitutable and must not be fabricated.
- Phase 2 retains Plans 02-01 through 02-12 completion credit. Plans 02-13 through 02-21 and the old recovery Plan 02-99 are retired incident history and earn no new credit. Plan 02-22 establishes the verified greenfield local baseline; the new terminal Plan 02-99 keeps future hosted acceptance separate.
- Phase 2 local implementation includes Wave 0 RED contracts, exact `uuid@14.0.1` approval, the reviewed `0004_consensus_knowledge.sql` file, commercial hierarchy authority, and Proposed/Confirmed Knowledge authority. The local migration file is not evidence of what ran against hosted D1.
- Phase 2 Plan 02-12 records the owner-accepted redacted real-principal denial/zero-state-delta proof and read-only hosted D1 baseline available on 2026-08-01. It does not classify the current live schema or repair the later incident.
- On 2026-08-01, the Sites-owning account restored the original project from temporary public access to custom owner-only access (one owner, no other users, groups, or editors). That restoration alone was not evidence for Plan 02-12; the owner separately accepted the later redacted Plan 02-12 evidence set.
- The 2026-08-24 forensic report invalidates Plan 02-13 acceptance: a supplied read-only observation contradicts the required schema-0003/no-migration premise, and Git proves the deployed source was reconstructed from superseded blobs rather than the reviewed Phase 2 lineage.
- The exact original migration digest, mechanism, actor, time, journal, and live schema remain unknown and are intentionally waived. This does not assert that any migration occurred. No original state will be used.
- Owner-authorized read-only inspection on 2026-08-25 resolved the same private owner-only project at version 11/source `e07e3f9`, confirmed zero gate rows, and obtained a complete 42-table overview. The observed 0004-family columns rule out a complete reviewed `b93c71d…` schema and align with a superseded pre-`e66dbf0` family, but cannot distinguish exact `aa89768…` from an intermediate variant without the missing journal, canonical schema, trigger/index/FK, invariant, and provider-audit evidence. No normal 0005–0009 tables were observed.
- Independent Phase 2 code, security, and UI audits are recorded in `02-REVIEW.md`, `02-SECURITY.md`, and `02-UI-REVIEW.md`. Their clean local results apply to reviewed mainline source, not the divergent deployed artifact, and authorize no hosted action.
- Phase 3 Plans 03-01 through 03-08 have committed local implementation, tests, UI, race hardening, a fail-closed offline release preflight, and matching summaries. They count as local-plan completion only; the phase and its requirements remain unaccepted while Phase 2 and the external gates are incomplete.
- Phase 3 Plans 03-09 through 03-11 require explicit owner authorization, controlled hosted proof, and owner lifecycle acceptance. They remain incomplete and cannot be replaced by local evidence.
- Phase 4 context/research/UI/validation and 12 checked plans are committed. Wave 1 is underway: RED contracts and additive profile-prospecting persistence are committed, but no Phase 4 plan summary exists.
- Phase 5 has 9 checked plans and a bounded local-only preparation lane. Checkpoint `c3233abf4e752afb5ca4e9d0a588852a4aaae07f` is pushed, independently reviewed clean, and verified by full test/lint/build on an isolated non-CI Mac Studio checkout. Provider composition and activation remain reject-only; no Phase 5 plan is complete.
- Phase 6 preparation and 13 checked plans are committed; execution has not started. The preparation lane includes a static provider/effect guard and an isolated synthetic approval/suppression state machine that runtime code does not import.
- Phase 7 preparation was integrated at `fc3f46f` and `e39ef11`.
- The guarded disposable local runtime is verified through checkpoint `efbb3a77193fba2068008fbfe9b29235ab2ad93f`: a real loopback browser can initialize the interview, enter the URL-addressable Knowledge workspace, submit an answer, and separately confirm it into a Knowledge Version. This enables no hosted, provider, prospecting, enrichment, export, or outbound effect.
- On 2026-08-27 the current checkout passed `npm test`, `npm run lint`, and `npm run build` with Node.js `v24.16.0`. Draft PR `#2` is open for the post-PR-1 changes and remains explicitly gated; the repository has no GitHub Actions workflow, and no CI or protected-governance change was made.
- The same release-hygiene gate advanced only the transitive `nanoid` lockfile resolution from `3.3.16` to patched `3.3.18`, within PostCSS's existing range. A fresh `npm ci` resolves the patched version and `npm audit --omit=dev` reports zero production vulnerabilities.
- On 2026-08-27 the owner permanently retired the inaccessible original target, waived its missing migration/provenance evidence, and selected the verified clean local baseline as the authoritative greenfield starting point. No hosted state changed.
- Later-phase local preparation does not satisfy Phase 2 or Phase 3 hosted/human gates and grants no operational authority. An unselected host is a deferred adapter boundary, so bounded local synthetic/reject-by-default work may continue without selecting or provisioning it.
- Plan 02-22 is complete. Safe resume is one bounded synthetic preparation unit under its checked preparation contract; Plan 02-99 stays blocked until separately authorized future-target evidence exists. The old incident collector remains historical code and must not be run against the original target.

Use these existing artifacts rather than restating product decisions:

- `docs/DIRECTION.md`
- `docs/IMPLEMENTATION-SPEC.md`
- `docs/adr/`
- `.planning/phases/02-consensus-knowledge-and-commercial-model/`
- `.planning/phases/04-profile-readiness-and-evidence-based-prospecting/`
- `.planning/phases/05-controlled-enrichment-and-verified-contacts/`

## Hosting and external authority

- The original project and URL are retired historical references. Do not access or use them.
- No future host or target is selected. Provisioning requires a later explicit owner decision and must create a new empty greenfield target.
- Never display, copy, rotate, or remove secret values.
- Safe runtime binding names are `DB`, `FILES`, `PILOT_OWNER_EMAIL`, and `OWNER_SUBJECT_PEPPER`. Their names may be documented; their values must never be copied into chat, Git, logs, screenshots, or handoff artifacts.
- Code, plans, decisions, tests, and safe evidence references are portable through GitHub. Each Codex account must independently have GitHub access to the repository.
- No hosted write is authorized in the current lane. A future target must prove its own empty pre-bootstrap state, exact checked source/migrations, owner-only boundary, zero effects, and independent review.
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
- No completion summary may be created for a blocked plan. The existing `02-13-SUMMARY.md` is invalidated incident history. Retired Plans 02-14 through 02-21 and the old recovery Plan 02-99 cannot be completed or resumed. Local proof cannot satisfy new terminal Plan 02-99 or Plans 03-09 through 03-11.

## Safe next action

Keep all external effects disabled and take one checked synthetic preparation
unit under the applicable preparation contract. The Phase 6 static guard and
isolated approval/suppression state machine are complete local preparation;
they do not execute a Phase 6 plan. Do not access the original target or
provision a new one. New terminal Plan 02-99 remains the future greenfield
target acceptance gate and performs no hosted action itself.
