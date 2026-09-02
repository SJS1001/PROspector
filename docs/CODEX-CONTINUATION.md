# PROspector cross-account continuation handoff

**Created:** 2026-07-30  
**Repository:** `https://github.com/SJS1001/PROspector.git`  
**Branch:** `codex/generic-prospector-pilot`  
**Portable checkpoint:** use the latest `origin/codex/generic-prospector-pilot` commit  
**Focus:** Continue from the verified greenfield local baseline while preserving every external-effect gate.

## Fresh isolated pilot ownership

The original hosted project is inaccessible and permanently outside the
execution path. Read [`GREENFIELD-BASELINE.md`](GREENFIELD-BASELINE.md) before
planning or implementation. Cloudflare Stage 1 resources have been
provisioned, and Stage 2 committed D1 migrations `0000` through `0007` before
stopping safely on `0008`. A repaired `0008`/`0009` candidate exists only in
Git. Canonical local preflight, a new private candidate, no-upload dry run, and
fresh read-only D1/R2 reinspection are green; only explicit remote-resume
authority remains before a migration retry. No Worker, route, Access
policy, secret, version, deployment, application request, or effect exists.

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
3. Treat all accounts as local-work accounts unless the owner separately authorizes that account for the provisioned greenfield target and the exact bounded stage. Never infer hosted evidence or continuing write authority from account access or the Stage 1 record.
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
- Phase 6 preparation and 13 checked plans are committed; execution has not started. The preparation lane includes a static provider/effect guard, an isolated synthetic approval/suppression state machine, a canonical synthetic Package/Message artifact plus invalidation contract, a minimized synthetic final-dispatch recheck/lease decision that grants no invocation authority, a pure originated reply/bounce stop classifier that grants no persistence or cancellation authority, a canonical synthetic DeliveryUnknown/manual-reconciliation classifier that grants no persistence, reconciliation, retry, or provider authority, a synthetic unsubscribe/explicit-opt-out suppression-before-success classifier that grants no persistence, cancellation, response, or provider authority, a synthetic manual-call eligibility/outcome classifier that grants no phone target, activity, suppression, follow-up, persistence, or phone-effect authority, a minimized audit-envelope/append classifier that grants no logger, persistence, external-sink, or provider authority, an identity-change suppression resolver that preserves the full scoped union across merge/split without identity, tombstone, persistence, or provider authority, an atomic identity/suppression receipt classifier that accepts only empty state or one exact complete five-record hash chain while granting no write authority, a suppression-retention classifier that carries the full subject/alias/deletion-tombstone union through delete/import/export/archive/restore without lifecycle, persistence, export, restore, provider, or effect authority, and a cross-contract invariant bundle that binds all twelve verified boundaries by synthetic ID/digest only without claiming any modeled branch occurred. Runtime code imports none of these preparation modules.
- Phase 7 context/research/UI/validation preparation was integrated at `fc3f46f` and `e39ef11`. A new `07-PREPARATION.md` now permits only bounded synthetic zero-effect work while Plan 06-10 and the Phase 7 plan graph remain incomplete. Its first pure weekly-outcome candidate counts only each stable Prospect's earliest supplied Export-ready transition in the supplied local Monday-Sunday week, retains DST-local offsets, keeps ten loss categories separate, excludes Draft profiles, and grants no real-outcome, provenance, runtime, schedule, runner, persistence, CSV/export, provider, plan, or effect authority.
- The guarded disposable local runtime is verified through checkpoint `efbb3a77193fba2068008fbfe9b29235ab2ad93f`: a real loopback browser can initialize the interview, enter the URL-addressable Knowledge workspace, submit an answer, and separately confirm it into a Knowledge Version. This enables no hosted, provider, prospecting, enrichment, export, or outbound effect.
- On 2026-08-27 the guarded local-runtime checkpoint passed `npm test`, `npm run lint`, and `npm run build` with Node.js `v24.16.0`.
- On 2026-08-28 the suppression-before-success candidate passed its 15-case focused suite, the 50-case aggregate Phase 6 preparation suite, canonical `npm test` (including the production build), canonical `npm run lint`, and `npm audit --omit=dev` with zero production vulnerabilities on Node.js `v24.16.0`. Draft PR `#2` is open for the post-PR-1 changes and remains explicitly gated; the repository has no GitHub Actions workflow, and no CI or protected-governance change was made.
- On 2026-08-28 the manual-call candidate passed its 15-case focused suite, the 65-case aggregate Phase 6 preparation suite, canonical `npm test` (including the production build), canonical `npm run lint`, and `npm audit --omit=dev` with zero production vulnerabilities on Node.js `v24.16.0`. This remains local preparation only; draft PR `#2` remains gated and no hosted/provider/phone authority changed.
- On 2026-08-28 the minimized audit-envelope candidate passed its 12-case focused suite, the 77-case aggregate Phase 6 preparation suite, canonical `npm test` (including the production build), canonical `npm run lint`, and `npm audit --omit=dev` with zero production vulnerabilities on Node.js `v24.16.0`. This remains local preparation only; draft PR `#2` remains gated and no logger, persistence, hosted, provider, or effect authority changed.
- On 2026-08-28 the identity-change suppression candidate passed its 12-case focused suite, the 89-case aggregate Phase 6 preparation suite, canonical `npm test` (including the production build), canonical `npm run lint`, and `npm audit --omit=dev` with zero production vulnerabilities on Node.js `v24.16.0`. This remains local preparation only; draft PR `#2` remains gated and no identity, suppression, tombstone, persistence, hosted, provider, or effect authority changed.
- On 2026-08-28 the atomic identity/suppression receipt candidate passed its 12-case focused suite, the 101-case aggregate Phase 6 preparation suite, canonical `npm test` (including the production build), canonical `npm run lint`, and `npm audit --omit=dev` with zero production vulnerabilities on Node.js `v24.16.0`. This remains local preparation only; draft PR `#2` remains gated and no identity, suppression, audit, persistence, hosted, provider, or effect authority changed.
- On 2026-08-28 the suppression-retention candidate passed its 14-case focused suite, the 115-case aggregate Phase 6 preparation suite, canonical `npm test` (including the production build), canonical `npm run lint`, and `npm audit --omit=dev` with zero production vulnerabilities on Node.js `v24.16.0`. This remains local preparation only; draft PR `#2` remains gated and no delete, import, export, archive, restore, persistence, hosted, provider, or effect authority changed.
- On 2026-08-28 the cross-contract invariant-bundle candidate passed its 13-case focused suite, the 128-case aggregate Phase 6 preparation suite, canonical `npm test` (including the production build), canonical `npm run lint`, and `npm audit --omit=dev` with zero production vulnerabilities on Node.js `v24.16.0`. This remains local preparation only; draft PR `#2` remains gated, no modeled branch occurrence is claimed, and no plan, runtime, persistence, export, archive, restore, hosted, provider, or effect authority changed.
- On 2026-08-28 the Phase 7 weekly-outcome candidate passed its 12-case focused suite, all 140 preparation cases, canonical `npm test` (including the production build), canonical `npm run lint`, and `npm audit --omit=dev` with zero production vulnerabilities on Node.js `v24.16.0`. This remains local preparation only; future events fail closed, no modeled transition is real outcome evidence, draft PR `#2` remains gated, and no plan, runtime, schedule, runner, persistence, CSV/export, hosted, provider, or effect authority changed.
- On 2026-09-02 a pure Phase 7 current-eligibility handoff candidate passed its 12-case focused suite, all 152 preparation cases, canonical `npm test` (including the production build), canonical `npm run lint`, targeted runtime/effect scans, and `npm audit --omit=dev` with zero production vulnerabilities on Node.js `v24.16.0`. It separates unique Prospect and eligible contact-row counts, deduplicates only stable Prospect plus contact-point identity, records exact fail-closed exclusions, and exposes suppression only through labelled non-contactable synthetic references. It accepts no raw identities and grants no operational handoff, plan, runtime, persistence, CSV serialization/delivery, export, hosted, provider, or effect authority.
- On 2026-09-02 a pure Phase 7 immutable handoff request/version decision passed its 13-case focused suite, all 165 preparation cases, canonical `npm test` (including the production build), canonical `npm run lint`, targeted runtime/effect scans, and `npm audit --omit=dev` with zero production vulnerabilities on Node.js `v24.16.0`. It projects first/next immutable version numbers or exact idempotent replay from synthetic IDs/digests only; same-key semantic changes, authority drift, and history/receipt conflicts fail closed. It grants no version creation, history mutation, plan, runtime, persistence, CSV serialization, delivery, download, export, hosted, provider, or effect authority.
- On 2026-09-02 a pure Phase 7 handoff manifest intent passed its 13-case focused suite, all 178 preparation cases, canonical `npm test` (including the production build), canonical `npm run lint`, targeted runtime/effect scans, and `npm audit --omit=dev` with zero production vulnerabilities on Node.js `v24.16.0`. It binds only synthetic eligibility, request/version, configuration/export-definition, exclusion-ledger, non-contactable-manifest, schema, and aggregate-count material. It accepts no raw contact value, row, CSV byte, checksum, or provider handle and grants no manifest/checksum, version/history mutation, plan, runtime, persistence, serialization, delivery, download, export, hosted, provider, or effect authority.
- On 2026-09-02 a pure Phase 7 canonical CSV schema/policy definition passed its 13-case focused suite, all 191 preparation cases, canonical `npm test` (including the production build), canonical `npm run lint`, targeted runtime/effect scans, and `npm audit --omit=dev` with zero production vulnerabilities on Node.js `v24.16.0`. It fixes the generic 22-field launch order, stable Prospect/Contact/contact-point sort order, and UTF-8/no-BOM/CRLF/single-header/RFC-4180/empty-null/formula-neutralization labels. It accepts no row value or materialized byte and grants no operational policy, CSV artifact/checksum, plan, runtime, persistence, serialization, delivery, download, export, hosted, provider, or effect authority.
- On 2026-09-02 a pure Phase 7 CSV materialization-precondition decision passed its 13-case focused suite, all 204 preparation cases, canonical `npm test` (including the production build), canonical `npm run lint`, targeted runtime/effect scans, and `npm audit --omit=dev` with zero production vulnerabilities on Node.js `v24.16.0`. It binds only the manifest-intent and CSV-policy-definition IDs/digests and independently rechecks current eligibility, request/version, configuration, export definition, suppression, chronology, and disabled effects. It grants no row access, CSV artifact/checksum, plan, runtime, persistence, serialization, byte creation, delivery, download, export, hosted, provider, or effect authority.
- On 2026-09-02 a pure Phase 7 CSV artifact-version intent passed its 13-case focused suite, all 217 preparation cases, canonical `npm test` (including the production build), canonical `npm run lint`, targeted runtime/effect scans, and `npm audit --omit=dev` with zero production vulnerabilities on Node.js `v24.16.0`. It binds only the materialization-precondition, handoff request/version, manifest-intent, and CSV-policy IDs/digests plus one bounded intended version number and rechecks current history/dependencies. It grants no version/history mutation, row access, CSV artifact/checksum, plan, runtime, persistence, serialization, byte creation, delivery, download, export, hosted, provider, or effect authority.
- On 2026-09-02 a pure Phase 7 handoff invariant-bundle capstone passed its 13-case focused suite, all 230 preparation cases, canonical `npm test` (including the production build), canonical `npm run lint`, targeted runtime/effect scans, and `npm audit --omit=dev` with zero production vulnerabilities on Node.js `v24.16.0`. It canonicalizes the exact closed six-node handoff candidate graph, rejects malformed nodes/edges, authenticates no occurrence, remains runtime-unreachable, and grants no plan, version/history, row, CSV artifact/checksum, persistence, serialization, byte creation, delivery, download, export, hosted, provider, or effect authority. The bounded safe Phase 7 preparation line is complete.
- On 2026-09-02 deployable metadata was detached from the retired failed pilot: checked `.openai/hosting.json` now contains binding names only, the build artifact carries no `appgprj_` target identifier, and its generated D1 migration path resolves to the checked `drizzle/` chain. The hosted shell no longer imports a runtime Google-font CDN. A regression test enforces all three properties and `vinext check` reports 100% compatibility. Generated all-zero/placeholder resource identities remain local build sentinels and are not deployment authority.
- On 2026-09-02 a target-neutral Cloudflare Access identity adapter was added locally. It verifies RS256 JWT signature, exact issuer/audience, dates, and bounded email against the configured team JWKS. One explicit identity-provider mode is required; missing, unknown, partial, or conflicting configuration denies access, and Cloudflare mode prevents Sites headers or `LOCAL_DEMO` from granting identity. Adversarial tests use only generated local keys and mocked JWKS responses. No Access policy, target value, account, credential, principal, network call, or hosted state was used.
- An independent adversarial review first found and then verified closure of raw Sites-header fallback, local-demo cross-mode/origin bypass, JWKS refresh amplification/same-key rotation, and indefinitely renewed stale-key trust. The final review is clean at high and medium severity; the fixed stale-key deadline cannot be advanced by failed refreshes.
- The resulting identity slice passes the complete canonical `npm test` gate (including the production build), canonical `npm run lint`, `npm audit --omit=dev` with zero production vulnerabilities, and `vinext check` at 100% compatibility. These are local code/readiness results only and do not satisfy the separately required target configuration or real-principal acceptance evidence.
- The same release-hygiene gate advanced only the transitive `nanoid` lockfile resolution from `3.3.16` to patched `3.3.18`, within PostCSS's existing range. A fresh `npm ci` resolves the patched version and `npm audit --omit=dev` reports zero production vulnerabilities.
- On 2026-08-27 the owner permanently retired the inaccessible original target, waived its missing migration/provenance evidence, and selected the verified clean local baseline as the authoritative greenfield starting point. No hosted state changed.
- Later-phase local preparation does not satisfy Phase 2 or Phase 3 hosted/human gates and grants no operational authority. An unselected host is a deferred adapter boundary, so bounded local synthetic/reject-by-default work may continue without selecting or provisioning it.
- Plan 02-22 is complete. On 2026-09-02 owner-authorized Cloudflare Stage 1 created one fresh D1 and one private R2 resource in Eastern North America. Stage 2 then prepared an ignored private candidate, passed a no-upload dry run, and committed D1 migrations `0000` through `0007`. Migration `0008` failed before journaling with `incomplete input`; no retry occurred. Post-failure D1 integrity is clean with zero application rows and no partial `0008` schema, while R2 remains empty/private. No Worker/version, Access policy, route, secret, deployment, application request, or effect occurred. Plan 02-99 remains incomplete. The old incident collector remains historical code and must not be run against the original target.
- The exact repaired `0000`-`0009` migration bytes now have an ordered SHA-256 manifest at `.planning/phases/02-consensus-knowledge-and-commercial-model/02-99-MIGRATION-MANIFEST.md`, bound to source `46d082e962c4acc1771e92ad300d61913d50ead4`. `0008` and pending `0009` use importer-safe trigger guards with one outer `END;` terminator. This is local byte evidence only; the prior ignored candidate is stale and the changed bytes have not been applied remotely.
- Focused Miniflare D1 fixtures and separate SQLite inventory cross-checks record both the paused `0000`-`0007` boundary and the repaired chain's expected post-chain shape in `.planning/phases/02-consensus-knowledge-and-commercial-model/02-99-STAGE2-EVIDENCE.md` and `02-99-EXPECTED-SCHEMA.md`. Exact object, table, stored-definition, and journal digests supplement the 71/151/77 paused counts and 92/206/149 post-chain counts. They are local comparison material only and cannot substitute for fresh remote evidence.
- The checked target-configuration contract at `.planning/phases/02-consensus-knowledge-and-commercial-model/02-99-TARGET-CONFIG-CONTRACT.md` fixes the closed resource inputs, private custody, exact bindings/migration resolution, public-exposure and effect denial, Wrangler validation/dry-run, and sanitized output invariants. Candidate source `886b48b31119f76382535a06d4535e04aa049097` passed canonical build/tests, lint, the six-case target-config suite, production audit, Vinext compatibility, private byte-stable preparation, and a Wrangler 4.116.0 no-upload dry run. Fresh read-only D1 state exactly matches the paused `0000`-`0007` digests/counts with 71 empty application tables and pending `0008`/`0009`; R2 remains empty/private. This is not remote migration evidence.

Use these existing artifacts rather than restating product decisions:

- `docs/DIRECTION.md`
- `docs/IMPLEMENTATION-SPEC.md`
- `docs/adr/`
- `.planning/phases/02-consensus-knowledge-and-commercial-model/`
- `.planning/phases/04-profile-readiness-and-evidence-based-prospecting/`
- `.planning/phases/05-controlled-enrichment-and-verified-contacts/`

## Hosting and external authority

- The original project and URL are retired historical references. Do not access or use them.
- Cloudflare is selected for the greenfield resources. Exact account/resource identities remain outside Git. Stage 2 is paused after `0007`: local preflight, the regenerated private candidate/no-upload dry run, and fresh read-only target evidence are green. One exact D1 migration apply still needs explicit authorization. Access, Worker/version, route, secret, deployment, and application actions remain unauthorized.
- Never display, copy, rotate, or remove secret values.
- Safe runtime binding names are `DB`, `FILES`, `PILOT_OWNER_EMAIL`, and `OWNER_SUBJECT_PEPPER`. Their names may be documented; their values must never be copied into chat, Git, logs, screenshots, or handoff artifacts.
- Code, plans, decisions, tests, and safe evidence references are portable through GitHub. Each Codex account must independently have GitHub access to the repository.
- No further hosted write is authorized in the current lane. The provisioned D1 is freshly proven clean and empty at migration `0007`; do not retry `0008` or reuse the stale candidate. The exact next gate is explicit authority for one apply of the pending `0008`/`0009` chain under `02-99-STAGE2-EVIDENCE.md`.
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
isolated approval/suppression and canonical artifact/invalidation contracts are
complete local preparation. The synthetic final-dispatch recheck/lease decision
and the originated-event/stop-rule cancellation projection are also complete;
the DeliveryUnknown/manual-reconciliation, unsubscribe/explicit-opt-out
suppression-before-success, manual-call eligibility/outcome, minimized
audit-envelope/append, identity-change suppression, and atomic identity/
suppression receipt classifiers are complete as well. The synthetic
suppression-retention manifest across delete/import/export/archive/restore and
the ID/digest-only cross-contract invariant bundle are also complete.
Collectively they grant
no invocation, persistence,
reconciliation, retry, cancellation, response, phone-target, activity,
follow-up, logger, external-sink, identity-mutation, tombstone-deletion, or
phone-effect authority, and none executes a Phase 6 plan. The Phase 7
dependency audit and bounded preparation authority are now complete, as is its
weekly-outcome, current-eligibility, immutable handoff request/version,
digest-only handoff manifest intent, canonical CSV schema/policy-definition,
CSV materialization-precondition, CSV artifact-version-intent, and handoff
invariant-bundle capstone. The bounded safe Phase 7 preparation line is now
complete. Do not add more preparation placeholders. The next executable
product work requires the actual greenfield target/human/persistence gates,
beginning with terminal Plan 02-99 acceptance and then dependency-ordered Phase
7 plan execution. Until separately authorized and evidenced, do not select or
provision a target, access real rows, create CSV bytes/checksums or history,
persist, deliver, download, export, invoke a provider, or perform any effect.
Do not execute a Phase 7 plan or create its plan tests. Do not access the
original target or provision a new one. New terminal Plan 02-99 remains the
future greenfield target acceptance gate and performs no hosted action itself.
