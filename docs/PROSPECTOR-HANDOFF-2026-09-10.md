# PROspector pause handoff — 2026-09-10

## Checkpoint

- Status: **paused by owner direction** after the current task.
- Repair commit: `95b3d5529fca15ee65fd009ec1447f3ef40c8ffb`.
- Review vehicle: PR #111, remote branch
  `codex/phase3-release-evidence-contract`. The local integration-branch name is
  not a portable remote reference.
- Baseline: greenfield only. The original private Sites project is inaccessible,
  permanently retired, and must not be inspected, migrated, restored, cloned, or
  used as evidence. No claim is made that an original-project migration occurred.
- Effects: none. No hosted write, provider selection, credential use, real data,
  export, email, phone call, or outbound communication occurred in this slice.
- CI policy: use local/self-hosted runners or an explicitly approved cloud runner.
  Do not use GitHub-hosted runners.

## Completed in this session

PR #111's Phase 3 release-evidence contract was repaired against current `main`.
It now requires a server-derived release tuple, adds immutable migration identity
in migration `0020`, keeps upgraded `legacy-unbound` records neutral and
non-consumable, and binds offline preflight authorization to the exact migration
and fixture tuple. A regression derives and verifies the historical `0000`–`0019`
chain digest rather than silently accepting a mistyped constant.

Local evidence on the final repair tree:

- `npm test`: pass, including the production build and canonical repository suite.
- `npm run lint`: pass.
- Focused migration/repository/handler suite: 34/34 pass.
- `git diff --check`: pass before the repair commit.

This evidence proves local preparation only. It grants no plan, phase, hosted,
provider, export, or effect authority.

## Formal completion ledger

The formal checked-plan ledger remains:

- Phase 2: 13 of 14 plans complete; terminal Plan `02-99` remains.
- Phase 3: 8 of 11 plans complete; Plans `03-09` through `03-11` remain.
- Phases 4–7: 0 plans formally complete. Significant local code exists, but it
  has not earned plan credit because dependency, hosted, provider, review, and
  owner-acceptance gates remain outstanding.

Do not convert local modules, fixtures, tests, or prose into completion credit.

## Remaining dependency-ordered task breakdown

### 1. Land the current repair safely

1. Obtain normal independent/trusted review for PR #111.
2. Run required checks using only local/self-hosted or approved cloud runners.
3. Resolve findings without weakening fail-closed boundaries.
4. Merge only when repository governance permits it; do not self-attest or bypass
   required review.

### 2. Finish Phase 2 terminal acceptance (`02-99`)

This is the first external checkpoint and requires separate owner authority at
the moment of action:

1. On the already-provisioned greenfield target, attach the saved exact-owner
   Access policy to the Worker for **All traffic** with a **1 hour** duration.
2. Verify the effective owner-only Access boundary and duration.
3. Prove denial using a real non-owner principal.
4. Refresh target-specific D1, R2, Cron, route, reviewed-source, migration,
   integrity, and zero-effect evidence.
5. Record explicit owner acceptance of the exact evidence tuple.

The current Wrangler OAuth profile cannot administer Access. Use the dashboard
or an owner-approved least-privilege Access Apps and Policies credential; do not
broaden or replace credentials automatically.

### 3. Finish Phase 3 (`03-09`–`03-11`)

1. `03-09`: obtain owner authorization and record the immutable hosted
   authorization tuple; rerun the offline preflight against that exact tuple.
2. `03-10`: execute the narrow private hosted synthetic proof and verify literal
   zero external effects.
3. `03-11`: complete owner lifecycle acceptance and explicitly disposition
   transport capability.

No Gmail, telephony, export, provider, or real-data capability may be activated
as an incidental part of these proofs.

### 4. Reconcile and complete Phase 4 (`04-01`–`04-12`)

1. Map the substantial merged profile, prospecting, operator-review, and market-
   discovery implementation to each checked plan without retroactive overclaim.
2. Execute missing tests, security/privacy review, UI review, summaries, and
   acceptance evidence in dependency order.
3. Resolve the persisted Prospect lifecycle mismatch documented in
   `.planning/STATE.md` where applicable.
4. Complete target-specific terminal Plans `04-11` and `04-12` only after the
   greenfield hosted boundary is accepted.

### 5. Complete Phase 5 (`05-01`–`05-09`)

1. Reconcile existing fictional contact/enrichment and verification preparation
   modules to the checked plans.
2. Complete local reject-by-default persistence, review, provenance, UI, security,
   and test work.
3. Separately obtain owner decisions for any provider, spend limit, credential,
   real-data source, or hosted activation.
4. Run controlled enrichment/contact-verification acceptance only after those
   decisions and gates exist.

### 6. Complete Phase 6 (`06-01`–`06-13`)

1. Reconcile the existing synthetic package/message, suppression, approval,
   leasing, cancellation, and delivery-unknown cores to their checked plans.
2. Close persistence and lifecycle gaps while preserving literal zero effects.
3. Select and authorize Gmail/OAuth and manual-call/telephony boundaries as
   separate owner decisions; add secrets only through an approved secret store.
4. Implement and verify verified phone display, click-to-call, package-derived
   call scripts, and manual outcome/notes logging.
5. Prove suppression and final-dispatch rechecks before any controlled outbound
   acceptance. Never send real communication without explicit authorization.
6. Complete terminal Plans `06-10` and `06-13` with target/provider evidence.

### 7. Complete Phase 7 (`07-01`–`07-10`)

1. Reconcile existing morning/weekly projection, CRM CSV codec, and portability
   foundations to the checked plans.
2. Add the missing persisted prospect-state transition history/adapter needed by
   the weekly reducer; explicitly map or reject `cooled_down`.
3. Complete morning runs, weekly reporting, seven-lead product behavior, and the
   exportable CRM-handoff CSV behind approval and privacy controls.
4. Prove scheduler/runner callbacks on an approved host.
5. Perform backup/restore and disaster-recovery drills using an owner-supplied
   one-time export passphrase; do not store it in Git.
6. Complete target-specific Plans `07-07` and `07-10`.

### 8. Final product acceptance and release

1. Run end-to-end functional, security, privacy, accessibility, responsive UI,
   failure/recovery, and zero-effect-before-authorization suites.
2. Perform trusted independent code/security review and resolve findings.
3. Verify tenant isolation and invited-user roles before inviting users.
4. Confirm production monitoring, audit logs, retention/deletion, backups, and
   incident/runbook readiness.
5. Obtain owner UAT and explicit release acceptance.
6. Activate real providers, schedules, exports, or outbound effects only through
   their separately approved gates.

## External decisions that remain intentionally unresolved

- Exact greenfield hosting target and final production release authority.
- Access dashboard action or least-privilege Access credential.
- Gmail OAuth client/account and send authority.
- Phone/calling implementation and any telephony provider.
- Enrichment/contact-verification providers, credentials, and spend limits.
- Approved scheduled runner/host.
- Real-data import and the July 24 lead files.
- One-time export passphrase for the restore drill.
- Production user invitations, retention policy, and final UAT acceptance.

## Exact resume procedure

1. Fetch the repository and fast-forward remote branch
   `codex/phase3-release-evidence-contract` for PR #111; do not rely on a
   remembered SHA or this conversation.
2. Read `AGENTS.md`, `docs/CODEX-CONTINUATION.md`, this handoff,
   `docs/GREENFIELD-BASELINE.md`, `.planning/STATE.md`, `.planning/ROADMAP.md`,
   the Phase 2 activation/review/security/UI records, and the dependencies named
   by the active plan.
3. Require a clean worktree and verify the remote PR/branch state.
4. First executable action: finish trusted review and governance checks for PR
   #111. If it is already merged, begin the evidence checklist for Plan `02-99`
   but stop before the Access attachment until the owner explicitly authorizes
   that external action.
5. Maintain the original-project prohibition and every provider, credential,
   real-data, export, outbound, protected-governance, and production gate.
