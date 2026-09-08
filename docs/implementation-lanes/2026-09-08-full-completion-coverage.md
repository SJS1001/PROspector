# Full-completion coverage ledger

**Prepared:** 2026-09-08 (first pass at `f2fceb0`; corrected at `fcf5b9e`; reconciled at `f7d8fc0`; inconsistency fix at `c2ac7b0`)
**Repository:** `https://github.com/SJS1001/PROspector.git`
**Base:** `main` at `c2ac7b0` (includes merged PRs #50–#70)
**Lane branch:** `claude/ledger-fix-inconsistency`
**Scope of this document:** documentation only. No source file was edited to produce it.

## Post-merge fix: internal inconsistency flagged by Codex review

PR #70 (the previous reconciliation) merged, but a Codex review comment on it correctly caught
an internal contradiction this document had introduced: the corrections section and
cross-cutting section both recorded the owner-reported `operator-journey` 1/1 pass at
`f7d8fc0`, but the Active Incumbents row for issue #11 still said "nothing past the 320px
assertion line has been re-proven," which reads as a flat contradiction to anyone using this
ledger to schedule remaining issue #11 work. Fixed below — verified against GitHub again
before editing, not just patched to remove the contradiction. In the same pass, PRs #66, #67,
#68, and #69 — all "open draft" in the prior version — merged; their rows are updated from
open to merged/landed accordingly.

## Reconciliation notice: prior corrections were lost in merge, recovered here

PR #63 (the first correction pass) merged at head `5f04cb9337e1229e8502ce96206e8abc20a3a775`
— **not** `8be9071`, the commit that actually carried the retraction of a false-positive
regression claim and the U1/U3/PR #62 reconciliation. That final push landed on the branch
after the merge had already happened, so it was silently dropped from `main`. Confirmed by
diffing `5f04cb9..8be9071` directly (104 lines across one file) and by reading PR #63's merged
`head` field via the GitHub API rather than assuming the local branch state matched. This
document recovers those omitted corrections below and reconciles everything against the
current state of `main`, which has moved substantially further in the interim.

## Corrections, this pass

All verified directly against GitHub/source before writing anything down — none taken on
faith, including claims relayed by the coordinator:

1. **Issue #42 regression claim retracted (recovered from `8be9071`).** The prior pass's
   "5/8 cases failing" for `greenfield-target-config.test.mjs` was a false positive: this
   sandbox was missing a `dist/` build, which the CLI's `digestBuild()` reads
   (`dist/server`/`dist/client`); the resulting `ENOENT` collapses into the CLI's generic
   `greenfield_target_prepare_failed` code for every case regardless of scenario
   (`site/scripts/greenfield-target-config.mjs:446-456`). After `npm run build`, the same
   suite is 8/8 passing here. No claim is made either way about the exact "2 failures" issue
   #42's title cites beyond what is now shown; issue #42 remains open and owned there.
2. **U1 and U3 are now fully resolved, not merely incumbent (superseding even the recovered
   `8be9071` state, which had them as in-progress).** `PR #64` (merged, `ceea468` →
   `f7d8fc0`) added `site/tests/product-readiness.test.mjs`. `PR #61` (merged, `a90c732` →
   `235e19f`) added `docs/implementation-lanes/2026-09-08-contact-provider-public-research.md`.
   Both moved out of "unassigned" and out of "active incumbent" — they're done. See the
   updated Phase 3 and cross-cutting sections below.
3. **PR #62 (issue #11's lane) found a real, official-Chromium-verified defect** at exact head
   `0ba6eae`: a 320px overflow in `.assessment.outcome-passed` (`scrollWidth 469` vs expected
   `<=321`). Root-caused to `site/app/prospecting/prospecting-workspace.tsx`'s component
   stylesheet missing `overflow-wrap:anywhere` on the assessment paragraph. **Fixed and
   merged**: `PR #65` (`448531b`, merged) added the fix; a follow-up **`PR #68`** (open, not
   yet merged) corrects PR #65's own diagnosis — its claim that no CSS Grid ancestor existed
   around `.assessment` was wrong (the component has its own embedded `<style>` block making
   `.assessment` a real grid container) — and removes three dead/redundant clauses PR #65 had
   added, keeping only the one load-bearing rule. **`PR #66`** (open, docs-only, head advanced
   to `24c098e`) originally recorded the combined SHA (`f7d8fc0`) with *"no claim is made that
   `f7d8fc0` passes."* **That wording is now stale, per the repo owner directly**
   ([PR #66 comment 5589272347](https://github.com/SJS1001/PROspector/pull/66#issuecomment-5589272347)):
   a newer official run at `f7d8fc0` used per-stage exit codes rather than one fail-fast
   command, and its `operator-journey` stage reportedly passed 1/1 in 25.1s
   (`STAGE_EXIT browser=0`, `forbiddenRows`/R2/multipart all zero) — **reported here as a
   coordinator/runner-attributed receipt with its exact provenance (that PR comment), not as
   this ledger's own execution.** The owner's own comment is explicit that full canonical
   `npm test` and lint remain unproven for that run, and that historical failing evidence must
   stay labelled by its own revision/time rather than implying every browser lane passed. This
   ledger makes no claim of whole-`f7d8fc0` browser validation — only that one specific stage
   has a reported, attributed pass distinct from PR #62's earlier failing run, and canonical
   confirmation is still outstanding.
4. **U2b reclassified from dispatchable back to HELD — independent reviewer NO-GO,
   independently verified as correct.** The prior pass accepted a Codex suggestion to surface
   `runner_submissions.provenance_json` ("transformations") on the theory that it's a plain,
   already-disclosed field category like `provider`/`model`/`allowedTools`. An independent
   reviewer correctly identified the flaw and it was reverified directly against
   `site/domain/runner-assignment.ts:75` (`normalizeSubmission`): `provider`, `model`,
   `instructionVersion`, `toolConfigurationDigest`, and `tools` are all **validated against the
   server-pinned `ledger` values** and rejected on mismatch (`text(provenance.provider,256)!==
   ledger.provider`, etc., and `tools` must canonically equal `ledger.allowedTools`) — they are
   server echoes, not runner-authored content. `transformations`, by contrast, has **no such
   pinning**: `array(provenance.transformations).map(x=>text(x,128))` accepts whatever the
   untrusted runner submits, bounded only to 128 characters per entry, with no schema or
   allowlist on content. Bounded arbitrary text from an untrusted contributor can carry
   identity or source material. The five already-visible, server-pinned fields do not
   authorize wholesale exposure of a sixth, runner-controlled one. **U2b is corrected below
   from dispatchable to HELD**, pending either a safe ingress vocabulary design (e.g., an
   allowlist of transformation kinds, sanitization, or a length/content policy) or an explicit
   owner disclosure decision — same posture as U2a, for a different underlying reason. No code
   should be written against U2b until one of those exists.
5. **New reported status, recorded without independent re-derivation beyond what's checkable:**
   issue #9 has real interview-progression work reported active in an isolated git worktree —
   noted in Active Incumbents below as reported, not verified by a landed commit (none found
   on `main` past `PR #58`, and no open PR was found for it as of this pass).
6. **Contacts/Person Discovery (issue #6) wording tightened.** The C4 synthetic lane
   (`person-discovery-c4-acceptance.ts`) proves the operator can capture and confirm *intent*
   to treat a discovered person as a contact candidate through a real, dev-gated command path
   — it does **not** prove any contact reaches a verified `ContactReady` state. `ContactReady`
   requires `mailbox_verified`/`source_verified` per `contact-eligibility.ts:165-166` (see
   Phase 5 below); C4's synthetic fixtures do not claim to produce that class. Corrected in the
   Phase 5 person-discovery note below to avoid conflating "an intent-capture command path
   works" with "a contact was verified."
7. **CSV/Phase 7 handoff work has a real, open, narrowly-scoped draft (`PR #67`), owned by
   the CSV lane — not by this ledger.** `domain/crm-handoff-projection.ts` (new, draft) composes
   the real `recheckForCrmExport`/`CRM_CSV_FIELD_IDS` contracts rather than restating them, and
   unconditionally returns `blocked: true` for every candidate — including one with fully
   current `ContactReady` evidence — so production admission stays zero. It adds a dev-gated,
   loopback-only, no-body-read preview route whose response keeps a real `decision` (always
   empty/refused) separate from a `preview` flagged
   `previewRowsAreFictionalAndUnadmitted: true`. It also appends one subsection to
   `07-PREPARATION.md` recording a narrow, owner-authorized (2026-09-08, root
   `01a076dc-f024-7693-afd7-cc9ecfd73a67`) exception to the Phase 7 stop condition — the Stop
   condition text itself is unchanged, and no other planning file is touched. **This ledger
   does not touch `07-PREPARATION.md`, `crm-handoff-projection.ts`, or any file in PR #67's
   scope** — that append and the seam belong to the CSV lane, reported here for completeness
   only.

A general principle, carried forward from the prior pass: **missing runtime composition is
not the same finding as a hosted/credential/owner-authorization gate.** Several "coded but not
wired" items in this ledger (e.g., Contacts `commandService` composition in Phase 5) require no
live provider or credential to compose and test — they are deliberately withheld pending a
named plan/owner decision, which is a real gate, but a different kind than one requiring a
hosted target or real credentials. Where that distinction matters, it is called out explicitly
in the gate classification rather than collapsed into a single "blocked" bucket.

## Method

This ledger was built by re-inspecting current `site/domain/`, `site/app/`, `site/worker/`,
`site/preparation/`, and `site/tests/` source directly against `.planning/ROADMAP.md`'s
phase success criteria and `docs/DIRECTION.md`/`docs/IMPLEMENTATION-SPEC.md`'s testable
invariants — not by repeating stale prior inventories. Every claim below cites a file:line, a
PR/commit reference, or an explicit "not found" search result.

No completion percentage is asserted anywhere in this document. Status per deliverable is
one of: **coded** (exists, not necessarily reachable), **runtime-wired** (a live HTTP route
composes it), **validated** (a passing focused test exercises it, at whatever layer),
**accepted** (an owner-authorized hosted/live acceptance checkpoint has been satisfied — none
have, anywhere in this repository, past Phase 1's historical/superseded evidence). These are
independent axes; a deliverable can be coded and validated without being runtime-wired, and
runtime-wired without being accepted.

## Executive answer

**Is every remaining deliverable currently assigned to an active lane? No.**

Zero gaps are currently open for fresh dispatch as of this checkpoint. U1 and U3 (the two
gaps this ledger previously flagged as unassigned) are now resolved via merged PRs #64 and
#61. U2a and U2b are both real gaps but neither is dispatchable coding work right now — both
are held pending a design or owner decision, for two different reasons:

| # | Gap | Phase | Blocking type |
|---|---|---|---|
| U2a | No dedicated owner-facing "Runner Assignment inspection" view exists exposing provider/model/instructions/tools/sources/grants together | 4 | **owner decision** — issue #8's explicit disclosure hold covers exactly this kind of grant/identity/source exposure |
| U2b | `runner_submissions.provenance_json` ("transformations") is persisted but silently dropped by `readProspectingProjection` | 4 | **design + owner decision** — unlike the five server-pinned fields already shown, this field is arbitrary runner-controlled text with no ingress vocabulary/sanitization; needs either a safe schema for it or an explicit disclosure decision before any code is written |

Everything else identified below is either (a) named as within an open issue's stated scope
— cited by number, with landed commits distinguished from merely-claimed scope in the Active
Incumbents table below — or (b)/(c) blocked on hosted/provider/credential authority or an
explicit owner decision, with the exact plan number or checkpoint named. Both U2a and U2b are
documented at the end of this document as **held**, not dispatchable.

## Active incumbents (do not dispatch a duplicate writer against these)

An open GitHub issue names a claimed scope, not by itself an accepted or actively-executing
assignment. The **Verified activity** column distinguishes issues with landed commits/PRs
within this checkpoint window from issues that are open but show no verified recent activity
beyond their own filing — do not treat the latter as "someone is already on it."

| Owner | Scope | Files | Verified activity | Remaining within that scope |
|---|---|---|---|---|
| Issue #9 | Multi-question interview progression through Offer/readiness | `site/domain/interview.ts`, `interview-handler.ts`, `interview-question-composer.ts` | **Landed:** PR #58 fenced the `bootstrap` escape hatch. **Reported (unverified by a landed commit or open PR as of this pass):** real interview-progression work active in an isolated worktree | The generalized interview queue still advances only under `enableLocalDemoProgression` on `main`; the secure/production path still terminates after one confirmed decision (see Phase 2 below) as of the last verified commit |
| Issue #6 | First-person discovery for prospects with no known contact | `site/domain/person-discovery*.ts`, `app/api/contacts/person-discovery/*`, `app/prospects/person-discovery-workspace.tsx` | **Landed:** C1–C4 lanes (dated 2026-09-05/06) | Production route still supplies no service. C4 proves operator **intent-capture** through a real dev-gated command path only — it does not prove any contact reaches verified `ContactReady` (see correction 6 above and Phase 5 below) |
| Issue #8 | Task-focused, coherent, understandable interface | `site/app/**` (shell, discovery, knowledge, prospecting UI) | **Landed:** PR #56; PR #65 (320px CSS fix, merged); PR #68 (merged — CSS cleanup + diagnosis correction: PR #65's "no Grid ancestor" claim was wrong, `.assessment` is a real grid container via the component's own embedded stylesheet; 3 dead/redundant clauses removed, 1 load-bearing rule kept) | Scope beyond these not independently re-verified in this pass |
| Issue #7 | Prospect quality, contact coverage, operating cost measurement | `docs/PROSPECT-QUALITY-EVALUATION.md`, `site/domain/prospect-quality-evaluation.ts` | **Landed:** PR #54 (report-only) and **PR #61 (merged — U3, resolved)** | Owner-only prerequisites named in PR #54 remain (representative real cohort, independent owner labels, manual-process comparator, provider selection, provider trial) — all (c) owner decisions |
| Issue #11 | Complete browser journey and accessibility acceptance | `site/tests/browser/**`, `site/scripts/browser-acceptance-*`, `site/playwright.config.ts` | **Landed:** PR #62 (merged, `fe11d6d`) adding visible-focus/screen-reader/zoom assertions and finding the real 320px defect; PR #66 (merged) records the combined SHA. **The owner directly reported** ([PR #66 comment 5589272347](https://github.com/SJS1001/PROspector/pull/66#issuecomment-5589272347)) a newer per-stage run at `f7d8fc0` whose `operator-journey` stage passed (1/1, 25.1s, `STAGE_EXIT browser=0`, zero forbidden rows/R2/multipart) — recorded here as an attributed receipt with its exact provenance, not this ledger's own execution | The same owner comment is explicit that full canonical `npm test` and lint remain unproven for that run. Not yet independently re-proven at `f7d8fc0`: the 200%-text-resize assertion, the visible-focus walk, the three announcement assertions, journey steps 1–6, `test:browser`, `test:browser:person-discovery`. `site/domain/ports/retrieval.ts` still has no runtime importer, so issue #11's "fake research run" stage still has no seam; the "local handoff" stage now does (PR #67, merged — see below), but it is not yet exercised by a browser lane |
| Issue #42 | `greenfield-target-config` stale test assertions | `site/tests/greenfield-target-config.test.mjs`, the migration-manifest CLI seam | **Landed:** PR #59 (mode-0600 assertion restored) | This ledger's own prior "5/8 failing" claim was **retracted** (see corrections section) — was a missing `dist/` build in this sandbox, not a regression. No independent claim is made either way about the exact "2 failures" the issue title cites |
| — (CSV/Phase 7 handoff) | CRM handoff decision seam, gated local-demo preview | `domain/crm-handoff-projection.ts` (new, now on `main`), `07-PREPARATION.md` (one appended subsection), a dev-gated preview route | **Merged:** PR #67 (`de93e93`), 13/13 focused tests. Composes the real `recheckForCrmExport`/`CRM_CSV_FIELD_IDS` contracts; `recheckForCrmExport` stays unconditionally `blocked: true` for every candidate | Production admission stays zero even though the seam now exists on `main`; does not complete issue #11's handoff journey by itself — a browser lane still needs to exercise it. Canonical validation/independent review status not independently re-confirmed by this ledger past what PR #67 itself reported. **Not this ledger's file to touch** |
| Issue #8 (UI trigger for the above) | Demo-only UI trigger for the CRM handoff CSV preview | `site/app/local-demo/_screen.tsx`, `site/app/globals.css` (addition), `site/tests/local-demo-crm-preview-normalizer.test.mjs` (new) | **Merged:** PR #69 (`a2ec8f8`, revised from an earlier push), 18/18 focused tests. `normalizeCrmPreview` fails closed unless `admittedRowCount===0` **and** `decision.admitted` is a length-0 array **and** all five external-effect authorization flags are exactly `false` **and** the fictional-provenance flag is `true` — any deviation renders "Preview unavailable," never a silent guess | Still gated on `PR #67`'s route existing (now true) and a combined browser/canonical proof, owned by issue #11, not yet independently confirmed here. **Not this ledger's file to touch** |
| PR #57 author | Morning Brief persisted read | `site/domain/morning-brief.ts`, `site/domain/morning-brief-read.ts` | **Landed and resolved:** PR #57 fixed the `authority_commands` cross-workspace join at `morning-brief-read.ts:198` with a failing-first regression, audited every other join in the file | No longer an in-progress incumbent; this ledger still does not touch these files, since there is no remaining gap in them to report |
| Independent reviewer(s) | Auditing PR #53/#54, and the U2b provenance/transformations NO-GO | — | Found the PR #57 defect; found the U2b risk this pass corrects | Ongoing elsewhere; not duplicated here |

This ledger touches none of the files above.

---

## Phase 1: Private Pilot Boundary

ROADMAP marks local plans complete (`[x]`); the hosted-equivalent gate (Plan 02-99) remains open.

**Runtime composition note (answers "how are routes wired" once, applies to all phases):**
`site/worker/index.ts:2,36` only imports `vinext/server/app-router-entry` and wraps its
`fetch` in a security-header helper — it does not itself list routes. Composition instead
happens per file under `site/app/api/*/route.ts` (Next-style file routing), each importing
its own domain handler. This is confirmed, not inferred, for every route cited below.

| Criterion | Evidence | Status | Gap | Dependency | Gate |
|---|---|---|---|---|---|
| Single Workspace; unauthorized/second principal denied; invitations unavailable | `site/domain/pilot-access.ts:20-36` `admitPilotOwner`; called from every handler's principal resolution; no invite route exists anywhere under `site/app/api` | coded, runtime-wired, validated (`pilot-access.test.mjs`) | No hosted proof of a second **real** Cloudflare Access identity being denied — only local-identity injection is tested | Live second-principal Access identity against a hosted deployment | (b) hosted/credential |
| Explicit confirm required; nothing silently spends/sends/creates CRM state | Accept/Reject/Correct/Rescope gating throughout `interview.ts`; `discovery-handler.ts` `decide_proposal` requires `confirmed===true` for dismiss | coded, wired, validated | none found | — | (a) met |
| Auditable capability status keeping disabled effects until proven | `site/domain/capabilities.ts:5-17` `CAPABILITY_IDS`; `app/api/capabilities/route.ts`, `capability-probe/route.ts` | coded, wired, validated (`capabilities-route.test.mjs`, `capability-state.test.mjs`) | none for Phase 1 itself | — | (a) met |
| Controlled hosted proof (identity, D1/R2, mutation protection, secrets, audit, provider-neutral boundary) | Local proof machinery exists (`runObjectStorageProof`); ROADMAP.md:49 records Plan 01-05's hosted proof as done for the **retired** target, with the second-principal checkpoint "visibly deferred and grants no later authority" | superseded historical evidence only | No fresh hosted evidence against the current greenfield target | Plan `02-99`: "requires separately authorized evidence from a new empty target and cannot be completed by local fixtures" (ROADMAP.md:79) | (b)+(c) hosted authority + owner decision to provision a new target |

---

## Phase 2: Consensus Knowledge and Commercial Model

ROADMAP: 13/14 active local plans done; `02-99` (hosted greenfield target) is the outstanding plan.

| Criterion | Evidence | Status | Gap | Dependency | Gate |
|---|---|---|---|---|---|
| Company→Product→Market Play→Customer Profile→Offer hierarchy; Org/Contact identity Company-wide; Account/Target scoped correctly | `commercial-model.ts:9-36` types; scope legend at lines 32-33 (`organization`/`contact` scoped `"company"`, `account` scoped `"market_play_profile"`) | coded, wired (via `knowledge-handler.ts`), validated (`commercial-model-repository.test.mjs` 4/4) | **Resolved by PR #58** (merged): `action:"bootstrap"` is now gated behind the same `enableLocalDemoProgression` fence as `advance_local_interview` and fails closed (404) outside local-demo. | — | (a) done |
| Consensus Interview: one question at a time, evidence/inference/recommendation, explicit Accept/Reject/Correct/Rescope | `interview.ts:611` `submitInterviewAnswer`, `:797` `recordInterviewDecision`, snapshot at `:710-721` | coded, validated at unit level | The **generalized multi-question queue** (`interview-question-composer.ts:270-323`, Company→Product(9)→Play(6)→Profile(11)→Offer) only advances when `enableLocalDemoProgression` is true (`interview-handler.ts:74-75`) — **never true in a real deployment** on `main` as of this checkpoint. Outside local-demo, `readInterviewState` returns terminal `"confirmed"` after one decision with no live follow-up session (`interview.ts:217-229,243-253`) — this is exactly Audit A2/issue #9's "completes the session after one decision." | Same generalized queue composer needs to be reachable from the secure/production path, not just local-demo | **In scope for issue #9**, reported as actively being worked in an isolated worktree (unverified by a landed commit here) | (a) pure local coding — **assigned to issue #9, not dispatched here** |
| Reloads/retries/stale tabs/concurrent answers converge on one authoritative question | `interview.ts:185-191` explicit `liveSession` precedence; idempotency-keyed writes at `:724-757` | coded, validated (`interview-repository.test.mjs`, `interview-handler.test.mjs`) | Only sequential/synthetic race proof exists; no browser-level concurrent-tab proof (`tests/browser/interview*.spec.ts` does not exist) | Browser acceptance | (a) domain-level met; browser proof is issue #11 territory, not newly blocking |
| Uploads/imports/research/edits enter as Proposed Knowledge with provenance; owner review/promote without unauthorized Runs/Accounts/Contacts/Prospects | `knowledge-handler.ts:96-100` dispatch (`propose_owner_edit`, `propose_repository_research`, `import_plain_text`, `propose_reuse`, `propose_allowlisted_package`); `reviewKnowledgeProposal` | coded, wired, validated (`knowledge-handler.test.mjs`, `knowledge-repository.test.mjs`) | none found | — | (a) met |
| Drift impact inspection, immutable replacement activation, snapshots, invalidated approvals, dependency-graph-scoped high-risk pause | `drift.ts` — `classifyDriftRisk` (line 51), `HIGH_RISK_DRIFT_KINDS` (4-10), `reachedArtifacts` BFS (60), `buildDriftImpact` (103) | coded, wired (`knowledge-handler.ts:112-115,193,235`), validated (`drift-replacement.test.mjs`) | UI exists (`app/knowledge/drift-replacements.tsx`) but no browser test proves it end to end | Browser acceptance | (a) domain met; browser proof is issue #8/#11 territory |
| Migration-manifest CLI test hygiene | — | — | PR #59 restored one missing happy-path assertion (mode 0600). This ledger's own prior "5/8 failing" claim was **retracted** (see corrections section) — root-caused to this sandbox missing a `dist/` build, not a source regression; 8/8 pass here once built. No independent claim is made either way about the exact "2 failures" the issue title cites | Named CI-hygiene fix, does not gate Phase 2 domain acceptance | **Issue #42 already owns this** |

---

## Phase 3: Product Readiness and Market Discovery

ROADMAP: 8/11 plans done (03-01..03-08 local); 03-09/03-10/03-11 are the outstanding hosted-authorization plans.

| Criterion | Evidence | Status | Gap | Dependency | Gate |
|---|---|---|---|---|---|
| Owner sees every unmet Product readiness item; cannot activate until all 9 categories confirmed | `product-readiness.ts:34-67` `evaluateProductReadiness` | coded, wired, validated — **now with dedicated unit coverage**: `PR #64` (merged) added `site/tests/product-readiness.test.mjs` | **Resolved.** Previously flagged as unassigned gap U1; no longer a gap. | — | (a) done |
| Readiness atomically creates Product Discovery Configuration, queues one initial run, reveals manual discovery, schedules monthly discovery | `product-readiness.ts:131` `makeProductReady`; requires configuration+run+schedule all-or-nothing (lines 89-98) | coded, wired, validated | `manualDiscovery.executionState` is permanently `"blocked_missing_capability"` (line 119) — revealed but not executable | Same scheduler/runner-callback hosted capability gap as Phase 1 criterion 3 ("unproven") | (b) hosted capability proof, not new Phase 3 domain code |
| Monthly/manual/material-change discovery surfaces ≤3 evidence-backed proposals | `market-discovery.ts:581` `ranked.slice(0,3)` hard cap; `submitDiscoveryFindings` (495) | coded, wired, validated (`market-discovery-repository.test.mjs`) | none found | — | (a) met |
| Explore/Defer/Dismiss with durable history/cooldown; Explore opens Draft Play interview, never Ready/prospecting | `market-discovery.ts:846-961` `decideMarketPlayProposal` (90-day defer, 180-day dismiss, `confirmed===true` required for dismiss); Explore creates `lifecycle:'draft'` Market Play only; `profile-readiness.ts:200` structurally requires `play.lifecycle` to be `active`/`ready` before Profile authority | coded, wired, validated | No browser-level proof that Explore opens a usable interview screen (`tests/browser/discovery*.spec.ts` does not exist) | Browser acceptance | (a) domain met; UI/browser proof is issue #8/#11 territory |
| 03-09/03-10/03-11 hosted no-effect proof and owner lifecycle acceptance | `market-discovery.ts:306-416` `activatePrivateSyntheticProofAuthorization`, `:417+` `submitPrivateSyntheticProof` — coded and digest-pinned, unexecuted against a real hosted target | coded, unvalidated against hosted target | ROADMAP.md:112-114 — all three plans unchecked | 03-09 requires "exact owner authorization" first; 03-10 requires the hosted no-effect proof itself; 03-11 requires owner lifecycle acceptance | (c) owner decision (03-09/03-11) then (b) hosted (03-10) |

---

## Phase 4: Profile Readiness and Evidence-Based Prospecting

ROADMAP: 0/12 plans formally accepted; strong local domain candidate, no runtime effect path.

**Structural finding (applies to every row below):** no HTTP path in the deployed worker can
actually issue a runner assignment, accept a runner submission, or advance a run past
`blocked_missing_capability`. This is the documented fail-closed pilot boundary, not an
oversight — `app/api/prospecting/runner/route.ts` hardcodes `runnerIngressEnabled:false` with
an explicit comment that the callback awaits "a later hosted capability checkpoint."

| Criterion | Evidence | Status | Gap | Dependency | Gate |
|---|---|---|---|---|---|
| Readiness → atomic candidate/activation → initial run + recurring schedule | `profile-readiness.ts:37-55,113-137,139-178`; DST-safe weekday slotting `prospecting-schedule.ts:40-54,182-185` | coded, wired (`prospecting-handler.ts:23-24`), validated (`profile-prospecting-contract.test.mjs`, `-integration.test.mjs`, `-ui.test.mjs`) | Every created run/schedule persists as `execution_state='blocked_missing_capability'` (`profile-readiness.ts:155,165-166`); no code path advances a run via a real transport | Hosted runner-transport capability checkpoint | (b) hosted |
| Minimized, revocable, quota-limited runner scope; owner inspection | `runner-assignment.ts:14-38` HMAC-signed ≤5-min TTL capability, DB stores hash only (line 34); `revokeRunnerAssignment` (40-52); `submitRunnerObservations` (55-72) | coded, validated (`runner-assignment.test.mjs` + 4 sibling suites) | `prospecting-handler.ts:26` unconditionally rejects `issue_assignment` regardless of state. Owner inspection is **partially** live already: `prospect-review.ts:121-124` surfaces `provider`/`model`/`allowedTools`/`quotas`, all **server-pinned** values, in the Review Queue projection today. Two remaining gaps, both now held: (1) a dedicated combined instructions/config/sources/grants view — held behind issue #8's disclosure hold (U2a); (2) `runner_submissions.provenance_json` ("transformations") is persisted but never joined into that projection — **also held**, not because it's a disclosure-hold field like U2a, but because unlike the five already-shown fields it is arbitrary runner-controlled text with no server-side pinning or content vocabulary (`runner-assignment.ts:75`; see correction 4 above) (U2b) | Issuance itself needs the hosted capability gate. **Neither inspection gap needs a hosted gate** — both are blocked on a design/owner decision instead | Issuance = (b) hosted. U2a = (c) owner decision. U2b = (c) design + owner decision — **both held, task write-ups below** |
| Signal provenance (URL/tier/dates/retrieval/excerpt/lineage); Tier-3-alone insufficient; 24h overlap; 30-day reconfirmation | `source-policy.ts:9-46`; 24h overlap `prospecting-schedule.ts:70-74`; Tier gate `qualification.ts:57-60,81` | coded, validated (covered via `prospecting-ingestion.test.mjs`/`-lifecycle.test.mjs`) | Reachable only through runner submissions (blocked, see above) | Same hosted runner-transport gate | (b) hosted for end-to-end; (a) already met for domain logic itself |
| Deterministic 5-dimension Mining score, 7/10 threshold, pain/timing non-zero, independent-source rule, hard disqualifiers, explicit outcomes | `qualification.ts` — full pure evaluator, `MINING_HARD_DISQUALIFIERS` (2-8), pass rule (70-74), tie-order (92-96) | coded, wired into `prospecting-ingestion.ts`, validated (`qualification.test.mjs`, `prospect-quality-evaluation.test.mjs`) | End-to-end proof needs a live run with non-synthetic evidence | Hosted runner-transport gate | (b) hosted for full acceptance; domain logic itself already (a) done |
| Review Queue Approve/Reject/Defer with reason, cooldown/re-entry, funnel-loss visibility, no auto-authorization of next effect | `prospect-review.ts` `decideQualifiedProspect`; dispatched at `prospecting-handler.ts:28`, UI at `app/prospecting/review-queue.tsx` | coded, wired, validated (covered inside `profile-prospecting-integration.test.mjs`) | Command path is fully reachable, unlike issuance/Contacts — it's just starved of real qualified prospects until the runner-transport gate opens | Same hosted gate, for real data only; the command path itself works today | (a) command path met; (b) only for populating it with real data |

---

## Phase 5: Controlled Enrichment and Verified Contacts

ROADMAP: 0/9 plans formally accepted; heaviest unit/integration test density in the repo, entirely unreachable from any route.

| Criterion | Evidence | Status | Gap | Dependency | Gate |
|---|---|---|---|---|---|
| Single-use, bounded grant required before any paid call | `enrichment-grant-issuance.ts` `issueEnrichmentGrant` (49), `deriveOperationKey` (110); `enrichment-authority.ts` `validateEnrichmentAuthority` (140), `reserveEnrichmentOperation` (168), named rejection reasons (`grant_unavailable`/`grant_consumed`/`operation_key_mismatch`/`budget_exceeded`, line 72) | coded, validated (11 dedicated test files, most heavily covered area in the repo) | `contacts-handler.ts:70-73` returns `unavailable(...)` because `app/api/contacts/route.ts` never constructs a `commandService` — the entire grant/reserve/settle pipeline is unreachable from HTTP. The composed candidate is explicitly documented as "intentionally not imported by the production route" | Plan `05-07`, plus real `phase4Accepted`/`controlledEnrichmentActivated` predicates (both structurally false today since Phase 4 isn't accepted) | (c) — deliberately withheld pending Plan `05-07`'s authorization, not a technical/hosted blocker (no live provider call is needed to compose and test the route wiring itself) |
| Runner spend stays within budgets; retries/uncertain charges never borrow/extend authority | `enrichment-authority.ts` `BudgetAccount` (4-17), `ReconciliationReason` (`timeout`/`ambiguous`/`provider_port_mismatch`/etc., line 34) | coded, validated (`enrichment-operation-preflight-integrity.test.mjs`, `enrichment-reservation-snapshot.test.mjs`) | Same composition gap as above | Same Plan 05-07 | (c) same as above |
| Suggested/inferred/domain-valid/MX-only stays labelled Contact Suggestion, cannot reach Enriched/export/call/send eligibility | `contacts-handler.ts:238-259` state machine (`ContactReady`/`ContactSuggestion`/`NeedsReview`/`NonContactable`); `contact-eligibility.ts:165-166` — only `mailbox_verified`/`source_verified` reach eligible; everything else falls to `"suggestion"` | coded, **and read-side is runtime-wired** — `GET /api/contacts` composes `handleContactsGet` fully; live UI at `app/prospects/contacts-workspace.tsx` | Mutation side (verification promotion) shares the Plan 05-07 composition gap above; read/labelling side is already live | Plan 05-07 for the mutation half only | Read/labelling = (a) already done and live. Mutation = (c) |
| Freshness rechecked at package/export/call/send boundaries; stale reverts to NeedsReview | `contacts-handler.ts:240,271` `fresh()`/`recheckSnapshot` — demotes `ContactReady→NeedsReview` live at read time using `DEFAULT_CONTACT_FRESHNESS_MS` per verification class | coded, wired, validated (`contact-clock-integrity.test.mjs`) | Package/export/send-boundary rechecks belong to Phase 6/7 (not yet built) — correctly out of Phase 5's own scope | Phase 6/7 composition | (a) Phase 5's own boundary (read) is done; remainder is those phases' gate, not a new Phase 5 gap |
| Owner review of ambiguous merge/split, preserving lineage/relevance/associations/suppression | `identity-resolution.ts` (1105 lines), `identity-repository.ts` (1515 lines); `contacts-handler.ts:37-38,307-308` command shapes | coded, validated (`identity-resolution.test.mjs` confirmed present) | Same `commandService` composition gap. **Reported:** the Contacts-owning lane has independently confirmed this same gap and is writing a test-DI (dependency-injection) demonstration for it — no new runtime permission requested or granted | Plan 05-07 | (c) |

**Person Discovery sub-area (the "no known contact" path):** fully owned by issue #6 (C1–C4
lanes, `person-discovery*.ts`/`-handler.ts`/`-repository.ts`, dev-only route gate at
`app/api/contacts/person-discovery/route.ts:30-37`). **C4 proves operator intent-capture
through a real, dev-gated command path only — it does not prove any contact reaches verified
`ContactReady`** (that requires `mailbox_verified`/`source_verified` per the row above; C4's
synthetic fixtures don't claim to produce that class). Not duplicated further here beyond
ownership citation, per issue #6's own "Execution boundary" coordination note.

---

## Phase 6: Governed Outreach and Suppression

ROADMAP: 0/13 plans; execution has not started. `06-PREPARATION.md` authorizes only local
synthetic fail-closed boundary work, all under `site/preparation/` — confirmed via
`grep -rn "preparation/" site/domain site/app site/worker` returning zero runtime importers
(comment-only references).

| Criterion | Evidence | Status | Dependency | Gate |
|---|---|---|---|---|
| Package review/approval → CRM eligibility only | `outreach-repository.ts` (863 lines); `preparation/outreach-artifacts.ts`, `-approval-suppression.ts` model the canonical builder/state machine | coded (partly preparation-only, runtime-unreachable) | Plans `06-01`–`06-09`, all unstarted, gated behind Phase 5 (also unstarted) | (c) dependency sequencing |
| Immutable per-message Gmail approval binding all fields | `preparation/outreach-artifacts.ts`; `adapters/gmail.ts:11-30` deny-only stub, zero importers confirmed | coded (deny-only stub) | `06-10-PLAN.md` Task 2: named blocking-human checkpoint requiring owner authorization of a controlled non-production Google/Gmail account, exact scopes, secret-handling policy, bound, expiry | (c) explicit owner authorization gate |
| Fenced send lease, digest/state/drift/suppression recheck, DeliveryUnknown | `outbox.ts` (1987 lines, zero runtime importers); `preparation/outreach-dispatch-decision.ts`, `delivery-unknown-decision.ts` | coded, unit-validated, runtime-unreachable | Plan `06-11`, gated behind `06-10` | (c) then (a) once unblocked |
| Transactional Company-wide suppression surviving delete/import/export/restore/merge | `preparation/suppression-identity-resolution.ts`, `-identity-receipts.ts`, `-retention-manifest.ts`, `-success-decision.ts` | coded (preparation-only) | Plan `06-11` cross-contract composition | (c) |
| Reply/bounce/pause/archive stop follow-ups; manual click-to-call | `preparation/originated-stop-decision.ts`, `manual-call-decision.ts`, `mail-port-admission-decision.ts` | coded (preparation-only) | Same `06-10`/`06-11` chain | (c) |

**No genuinely unblocked local coding slice exists in Phase 6.** Every path terminates at
either Phase 5's not-started status or the named `06-10` owner-authorization checkpoint.

---

## Phase 7: Mining Pilot Handoff and Recovery

ROADMAP: 0/10 plans; "Planned; dependency-gated."

| Criterion | Evidence | Status | Gap | Dependency | Gate |
|---|---|---|---|---|---|
| Seeded hierarchy + Phase 4 schedule state shown, not activated | `morning-brief-read.ts:140-209` — cross-workspace join defect **resolved by PR #57** (see table above) | coded, unit-validated (13/13), zero runtime importers besides its own test | Module itself has no remaining gap; UI composition is owned by the Work Unit D operator-interface lane (issue #8 adjacent), not duplicated here | Composition into a route/UI | (a) module done; composition is (a) pure local coding once that lane picks it up — not this ledger's action |
| Weekly Export-ready cohort (7/week target), 10 funnel-loss categories | `weekly-outcome.ts` (674 lines, pure reducer, zero runtime importers) | coded, unit-validated | `ExportReady` exists nowhere in schema; `profile_prospects.state` admits only `qualified/approved/rejected/deferred/cooled_down`; no transition-history table exists | Plan `07-04`'s migration index is unallocated; `07-04` depends on `07-01/02/03`, which depend on Plan `06-10`'s Gmail-authorization gate | (c) — transitively blocked on the same `06-10` owner gate as Phase 6 |
| CRM CSV — one row per eligible Enriched Contact, stable Prospect ID | `crm-csv-codec.ts` (261 lines, still zero direct runtime importers itself). **Now merged:** `domain/crm-handoff-projection.ts` (`PR #67`, merged) composes the real eligibility/CSV contracts into a decision seam that stays unconditionally `blocked: true` for every candidate, plus a fictional-only dev-gated preview clearly flagged as unadmitted; its UI trigger (`PR #69`, merged) is wired into the dev-only `/local-demo` screen | coded, unit-validated (codec + seam, 13/13 + 18/18 across #67/#69), dev-gated-route-wired (not a production route) | Real (non-fictional) admission stays zero (`recheckForCrmExport` unconditionally `blocked: true`); the handoff/manifest chain for actual eligible-contact export is still `06-10`-gated | (c) for real admission; the dev-only seam/preview itself is done (a), owner-authorized separately, not this ledger's to touch |
| Passphrase-encrypted, content-addressed, versioned workspace archive | No `archive.ts`/`restore.ts` domain module found | not started | Plans `07-05`–`07-08`, all unstarted | (c) |
| Owner-reviewed restore dry run, fail-closed on tamper/wrong-passphrase/version-skew | No restore-specific module or preparation file found | not started | Plans `07-09`–`07-10` | (c) |

**Single dominant structural fact for Phase 6+7 together:** one named human-authorization
checkpoint (`06-10-PLAN.md` Task 2 — owner-named Gmail account/scope authorization) blocks
essentially everything downstream in both phases, either directly (`06-11`/`06-12`) or
transitively (`07-01`–`07-04`).

---

## Cross-cutting

### Browser/accessibility acceptance — issue #11
The pinned Chromium 1243 build is unobtainable specifically in *this* sandbox
(`cdn.playwright.dev`/`playwright.azureedge.net` unreachable here) — this ledger did not
re-attempt the download. Elsewhere, it has been obtained and actually run: **PR #62** (merged)
drove the real E1 journey against it and first found a genuine defect (the 320px overflow, see
corrections section), fixed via merged **PR #65** and a merged diagnosis-correction cleanup
(**PR #68**). **PR #66** (merged, docs-only) records the combined SHA (`f7d8fc0`). Its own
body text was written before a later run and still reads "no claim is made that `f7d8fc0`
passes" — **that specific sentence is now stale**, per the repo owner directly
([PR #66 comment 5589272347](https://github.com/SJS1001/PROspector/pull/66#issuecomment-5589272347)):
a newer official per-stage run at `f7d8fc0` had its `operator-journey` stage pass (1/1, 25.1s,
`STAGE_EXIT browser=0`, zero forbidden rows/R2/multipart) — **recorded here as a
coordinator/runner-attributed receipt with its exact provenance, not this ledger's own
execution.** That same owner comment is explicit that full canonical `npm test` and lint
remain unproven for this run, and that historical failing evidence must stay labelled by its
own revision/time rather than implying every browser lane passed. So: this ledger does not
claim whole-`f7d8fc0` browser validation, but it also does not repeat PR #66's now-superseded
"nothing re-proven" line for the one stage that has a reported pass — the two must not be
stated in the same document as if both were still true, which an earlier draft of this ledger
incorrectly did (flagged by a Codex review on PR #70, fixed here). E2 (approval/CRM-handoff
browser acceptance): `crm-csv-codec.ts`'s handoff seam now exists on `main` (**PR #67**,
merged) with a UI trigger (**PR #69**, merged), but neither has a browser lane exercising them
yet — that remains issue #11's open work, separate from `preparation/`'s still-hard-gated
Phase 6 seams. Gate: (b) hosted/environment for any further work in this sandbox specifically;
(a) pure local coding for browser-lane coverage of the now-merged #67/#69 seam (issue #11's to
pick up, not this ledger's); (b)/(c) mixed for the rest of E2.

### Security review posture
No repository-wide `docs/SECURITY*.md` exists; only Phase-2-scoped `02-SECURITY.md`. The
closest cross-cutting security gate is `06-10-PLAN.md`'s required independent
pre-composition review before Gmail composition, itself blocked at the Task 2
owner-authorization checkpoint. No separate coding slice identified.

### Deployment / hosted readiness
`docs/DEPLOYMENT-OWNERSHIP.md` and `docs/CLOUDFLARE-GREENFIELD-READINESS.md` — one fresh D1 +
one private R2 exist; Stage 2 D1 migration verified at `0009`; Stage 3B0 Zero Trust Free team
approved. No Worker deployment, no live Access application/policy, no secrets injected. Gate:
(b) hosted/provider authority under Plan `02-99`, which also transitively gates every later
phase's hosted acceptance checkpoint (03-09..11, etc.).

### Issue #7 — prospect quality/cost evaluation
PR #54 (merged, report-only) found the evaluation harness (`prospect-quality-evaluation.ts`,
15/15 passing tests) already exists, added no duplicate code, and named five owner-only
prerequisites: a representative real cohort, independent owner labels, a manual-process
comparator, a named candidate provider, and an authorized provider trial — all (c) owner
decisions. The one item that didn't need owner authorization — narrow, read-only
public-documentation research on a candidate provider's published data fields, freshness
policy, reuse terms, rate limits, and pricing — is **resolved**: `PR #61` (merged) added
`docs/implementation-lanes/2026-09-08-contact-provider-public-research.md`, comparing five
providers with unresolved terms explicitly marked rather than guessed.

---

## Held work (real gaps, not currently dispatchable)

### U2a — Runner Assignment full inspection view (provider/model/instructions/tools/sources/grants) — HELD
Issue #8's body states explicitly: "Full grant/identity/source disclosure remains subject to
its existing explicit hold; do not expose withheld information as part of a copy or layout
change." A dedicated view surfacing provider/model/instructions/tools/sources/grants together
is exactly the disclosure that hold covers, regardless of which fields a first draft chooses
to include. **What would need to happen first:** the owner reconciles the disclosure hold
(confirms it still applies, narrows it, or lifts it for this specific projection) before any
code is written against it. The backing rows are schema-ready and reading them needs no
hosted/credential authority — once reconciled, this is (a) pure local coding, not (b)
hosted-gated.

### U2b — Surface runner-submission transformations — HELD (corrected this pass)
`runner_submissions.provenance_json` is real, persisted, and silently dropped by
`readProspectingProjection` (`prospect-review.ts:96` never joins `runner_submissions`), even
though that same function already surfaces `provider`/`model`/`allowedTools` live today.
**Why this is not simply dispatchable, corrected from the prior pass's mistake:** those three
already-shown fields are server-pinned echoes, validated against `ledger.*` and rejected on
mismatch (`runner-assignment.ts:75`). `provenance.transformations` has no equivalent pinning
— it is arbitrary runner-controlled text, bounded only to 128 characters per entry, accepted
from an untrusted contributor with no content vocabulary or sanitization. Surfacing it
verbatim in a UI could disclose identity/source material an untrusted runner chose to write,
which the already-visible field category does not authorize. **What would need to happen
first:** either a safe ingress vocabulary (an allowlist of transformation kinds, a
sanitization pass, or a content policy enforced at submission time — none of which exist
today) or an explicit owner decision to disclose the raw field as-is. **Do not implement code
against this until one of those exists.**

---

## Boundary

No multitenancy, real identities/data, hosted, provider, account, credential, outbound, or
export effect was introduced, exercised, or proposed by this document. No source file,
migration, schema, `package.json`, or other planning document (`STATE.md`, `ROADMAP.md`,
`REQUIREMENTS.md`, `PROJECT.md`, `07-PREPARATION.md`) was modified — only this one ledger file
was written. Every "coded" or "validated" status above reflects local, synthetic test
evidence; none constitutes or substitutes for the hosted/owner acceptance checkpoints named
throughout (Plans `02-99`, `03-09/10/11`, `05-07`, `06-10`, `07-01..10`). This ledger names
accepted owner lanes and dependency chains; it does not claim any live session execution
occurred against a hosted target, and no percentage of completion is asserted anywhere in it.
