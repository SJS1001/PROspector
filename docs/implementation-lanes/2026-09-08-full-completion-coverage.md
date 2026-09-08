# Full-completion coverage ledger

**Prepared:** 2026-09-08 (first pass at `f2fceb0`; corrected same day at `fcf5b9e`)
**Repository:** `https://github.com/SJS1001/PROspector.git`
**Base:** `main` at `fcf5b9e` (includes merged PRs #50–#60)
**Lane branch:** `claude/issue-full-completion-coverage-corrections`
**Scope of this document:** documentation only. No source file was edited to produce it.

## Corrections since first publication

The coordinator reviewed the first pass (merged as PR #60, at `f2fceb0`) and identified five
stale-checkpoint issues, all verified directly against GitHub before editing below:

1. **PR #57 (merged)** fixed the exact `morning-brief-read.ts:198` cross-workspace
   `authority_commands` join this ledger had flagged as an unresolved "active incumbent, do
   not touch." An independent reviewer found the defect, wrote a failing regression first,
   added the single `AND ac.workspace_id = ps.workspace_id` predicate, and audited every
   other join in the file (all already correctly scoped). `tests/morning-brief-read.test.mjs`
   is 13/13. This is now resolved, not incumbent-in-progress; the "do not touch" instruction
   no longer applies to these two files, though no further action is taken on them by this
   ledger.
2. **PR #58 (merged)** fixed the `interview.ts`/`interview-handler.ts` `action:"bootstrap"`
   escape hatch this ledger cited as "assigned to issue #9, not dispatched here." It is now
   gated behind the same `enableLocalDemoProgression` fence as `advance_local_interview`,
   fails closed (404 `private_workspace_unavailable`) outside local-demo. Resolved.
3. **PR #59 (merged)** added the missing mode-0600 assertion for the greenfield-target-config
   CLI candidate. A first re-run of `tests/greenfield-target-config.test.mjs` in this sandbox
   showed 5 of 8 cases failing on the generic `greenfield_target_prepare_failed` code — **this
   was wrongly reported here as a possible source regression.** Root-caused and retracted: the
   CLI's `digestBuild()` reads `dist/server`/`dist/client`, which did not exist in this
   checkout because no production build had been run yet; that missing prerequisite throws an
   `ENOENT` that doesn't match the CLI's own `/^[a-z_]+$/` error-code pattern, so `main()`
   collapses it to the generic code for every case, regardless of which specific scenario each
   test drives. After `npm run build`, the same suite is **8/8 passing** in this sandbox. This
   is the same class of mistake the coordinator flagged independently (an independent reviewer
   hit an equivalent git-less-checkout prerequisite failure elsewhere and correctly
   distinguished it from a source regression) — verified directly here, not taken on faith.
   Corrected below: issue #42's own scope is unaffected by this retraction, and this ledger
   makes no claim either way about the exact "2 failures" the issue's title cites beyond what
   is now shown.
4. **Browser E1 Chromium receipts exist and were missed.** The first pass stated the pinned
   Chromium 1243 build was "unobtainable in this environment" as a blanket fact. That is true
   only of *this* sandbox. The coordinator has since published two verified receipts: PR #50
   comment [5588416480](https://github.com/SJS1001/PROspector/pull/50#issuecomment-5588416480)
   (candidate `bff326f`, isolated Hetzner container, official Chromium 1243, no shim,
   `npm run test:browser` 2/2, `test:browser:person-discovery` 1/1, `test:browser:operator-journey`
   1/1, zero-effect verifiers clean) and PR #51 comment
   [5588407370](https://github.com/SJS1001/PROspector/pull/51#issuecomment-5588407370)
   (candidate `9bff835`, same setup, `test:browser:person-discovery` 1/1, full 20-migration
   chain, zero-effect clean). Both commits are ancestors of current `main`. Both receipts are
   explicit that they resolve only the browser-environment blocker for those exact candidates —
   full canonical validation and independent review remain separately required, and neither
   receipt is itself independent review or merge approval. Corrected below to scope the claim
   accurately instead of stating a blanket block.
5. **U2 cannot be presented as unconditionally dispatchable.** Issue #8's own body states:
   "Full grant/identity/source disclosure remains subject to its existing explicit hold; do
   not expose withheld information as part of a copy or layout change." A "Runner Assignment
   inspection" view exposing provider/model/instructions/tools/sources/grants is exactly the
   kind of disclosure that hold covers. U2 is reclassified below from an unblocked (a) coding
   packet to a (c) owner-decision-gated one: the disclosure hold must be reconciled by the
   owner before any such view is built, and no confidential capability field may be exposed
   by inference in the meantime.
6. **U2 was too blunt an instrument — split into U2a/U2b after a second reviewer pass.** A
   Codex review on this PR pointed out, and independent verification confirmed, that
   `runner_submissions.provenance_json` (the "transformations" ROADMAP Phase 4 criterion 2
   names) is real, persisted, and silently dropped by `readProspectingProjection`
   (`prospect-review.ts:96` never joins `runner_submissions`) — even though that same function
   already surfaces provider/model/allowedTools live today. Blanket-holding *all* runner
   inspection work conflated a genuinely held disclosure decision (U2a: a dedicated
   grant/identity/source view) with an already-shipped field category's missing coverage
   (U2b: transformations). Split below; U2b is dispatchable now.
7. **A real, official-Chromium-verified accessibility defect landed on PR #62** (issue #11's
   own lane): at exact head `0ba6eae` (docs head `7e81b464`), the 320px zoom acceptance case
   failed for real — `.assessment.outcome-passed` overflows to `scrollWidth 469` against an
   expected `<= 321`. Root-caused to source, not the test: `prospecting-workspace.tsx` applies
   `min-width:0` to several panel selectors but not `.assessment>*`, and
   `overflow-wrap:anywhere` to `code`/`small`/`dd`/`blockquote` but not the assessment card's
   paragraph, which renders a bare 64-character configuration digest with no break
   opportunity. The fix is assigned to issue #8's UI owner (outside PR #62's own file
   ownership); PR #62 does not touch `prospecting-workspace.tsx`. This is corrected below from
   "browser environment blocker only" to a real, reported defect with a named owner and root
   cause — the environment blocker itself is separately confirmed resolved (the pinned browser
   was obtained and the journey actually ran).
8. **U1 and U3 both now have active incumbent work — reclassified from "unassigned."** U1 has
   a pushed branch (`claude/product-readiness-unit-coverage-fw7k9v` at `ceea468`, focused suite
   6/6 passing and lint-clean per the coordinator, full suite pending, no PR opened yet). U3 is
   PR #61 (open, `claude/issue-7-provider-public-research`), already comparing five candidate
   providers' public documentation with an explicit "unknown — requires owner follow-up"
   section rather than guessing. Neither is dispatchable as a fresh packet now; both are moved
   to the Active Incumbents table below. Only U2b remains a genuinely unassigned, dispatchable
   packet.
9. **Research and CSV incumbents reported as having ACKed new bounded scopes**, per the
   coordinator; CSV runtime exposure (Phase 7's `crm-csv-codec.ts` composition) remains
   explicitly held pending a named plan amendment. No new commit changes `crm-csv-codec.ts` or
   its composition state on `main` past `fcf5b9e` as of this pass (verified directly), so this
   ledger's existing Phase 7 CSV gate classification is unchanged — recorded here as reported
   status, not independently re-derived beyond that check.

A general principle, applied more consistently below per the coordinator's note: **missing
runtime composition is not the same finding as a hosted/credential/owner-authorization
gate.** Several "coded but not wired" items in this ledger (e.g., Contacts `commandService`
composition in Phase 5) require no live provider or credential to compose and test — they are
deliberately withheld pending a named plan/owner decision, which is a real gate, but a
different kind than one requiring a hosted target or real credentials. Where that distinction
matters, it is called out explicitly in the gate classification rather than collapsed into a
single "blocked" bucket.

## Method

This ledger was built by re-inspecting current `site/domain/`, `site/app/`, `site/worker/`,
`site/preparation/`, and `site/tests/` source directly against `.planning/ROADMAP.md`'s
phase success criteria and `docs/DIRECTION.md`/`docs/IMPLEMENTATION-SPEC.md`'s testable
invariants — not by repeating `docs/implementation-lanes/2026-09-05-completion-inventory.md`,
which is now three days and roughly a dozen merged PRs stale. Every claim below cites a
file:line or an explicit "not found" search result. Where a prior finding could not be
independently re-verified in this pass, it is marked `unverified` rather than restated as
fact.

No completion percentage is asserted anywhere in this document. Status per deliverable is
one of: **coded** (exists, not necessarily reachable), **runtime-wired** (a live HTTP route
composes it), **validated** (a passing focused test exercises it, at whatever layer),
**accepted** (an owner-authorized hosted/live acceptance checkpoint has been satisfied — none
have, anywhere in this repository, past Phase 1's historical/superseded evidence). These are
independent axes; a deliverable can be coded and validated without being runtime-wired, and
runtime-wired without being accepted.

## Executive answer

**Is every remaining deliverable currently assigned to an active lane? No.**

One gap has no owning issue or in-flight lane as of this checkpoint. Two more (U1, U3) were
unassigned at first publication but now have active incumbent branches/PRs — moved to Active
Incumbents below, not re-listed here. One (U2a) is real but owner-decision-gated, not a
dispatchable coding gap:

| # | Gap | Phase | Size | Blocking type |
|---|---|---|---|---|
| U2b | `runner_submissions.provenance_json` ("transformations" per ROADMAP Phase 4 criterion 2) is persisted but silently dropped by `readProspectingProjection`, even though that same function already surfaces provider/model/allowedTools live today | 4 | small | none — pure local coding, distinct field category from U2a's hold — **the sole unassigned, dispatchable packet as of this pass** |
| U2a | No dedicated owner-facing "Runner Assignment inspection" view exists exposing provider/model/instructions/tools/sources/grants together | 4 | small–medium | **owner decision** — issue #8's explicit disclosure hold covers exactly this kind of grant/identity/source exposure; **not dispatchable as coding work until the owner reconciles that hold** |

Everything else identified below is either (a) named as within an open issue's stated
scope — cited by number, with landed commits distinguished from merely-claimed scope in the
"Active incumbents" table below, not assumed to be actively worked just because the issue is
open — or (b)/(c) blocked on hosted/provider/credential authority or an explicit owner
decision, with the exact plan number or checkpoint named. A task packet for U2b is at the end
of this document; U2a is documented there too but is **held**, not dispatchable, pending an
owner decision on issue #8's disclosure hold (see the corrections section above). U1 and U3
also have packet write-ups retained at the end for reference, marked superseded by their
incumbent activity below.

## Active incumbents (do not dispatch a duplicate writer against these)

An open GitHub issue names a claimed scope, not by itself an accepted or actively-executing
assignment. The **Verified activity** column distinguishes issues with landed commits within
this checkpoint window from issues that are open but show no verified recent activity beyond
their own filing — do not treat the latter as "someone is already on it."

| Owner | Scope | Files | Verified activity | Remaining within that scope |
|---|---|---|---|---|
| Issue #9 | Multi-question interview progression through Offer/readiness | `site/domain/interview.ts`, `interview-handler.ts`, `interview-question-composer.ts` | **Landed:** PR #58 fenced the `bootstrap` escape hatch | Not yet landed: the generalized interview queue still advances only under `enableLocalDemoProgression`; the secure/production path still terminates after one confirmed decision (see Phase 2 below) — open, no verified commit against this specific gap yet |
| Issue #6 | First-person discovery for prospects with no known contact | `site/domain/person-discovery*.ts`, `app/api/contacts/person-discovery/*`, `app/prospects/person-discovery-workspace.tsx` | **Landed:** C1–C4 lanes (dated 2026-09-05/06) | Production route still supplies no service — open, no more recent verified commit found |
| Issue #8 | Task-focused, coherent, understandable interface | `site/app/**` (shell, discovery, knowledge, prospecting UI) | **Landed:** PR #56 | Open; scope beyond PR #56 not independently re-verified in this pass |
| Issue #7 | Prospect quality, contact coverage, operating cost measurement | `docs/PROSPECT-QUALITY-EVALUATION.md`, `site/domain/prospect-quality-evaluation.ts` | **Landed:** PR #54 (report-only — found the harness pre-existing, added no code) | Owner-only prerequisites named in that PR remain; PR #61 (below) covers the one non-owner-gated sliver |
| Issue #7 (U3) | Public-documentation-only research on candidate contact-enrichment providers | `docs/implementation-lanes/2026-09-08-contact-provider-public-research.md` (new) | **Open PR #61** (`claude/issue-7-provider-public-research`, `a90c732`): compares five providers on published evidence/freshness, reuse terms, rate limits, pricing; no provider selected/connected; unresolved terms explicitly marked `unknown — requires owner follow-up` rather than guessed | Under review; do not open a competing packet against this file |
| Issue #11 | Complete browser journey and accessibility acceptance | `site/tests/browser/**`, `site/scripts/browser-acceptance-*`, `site/playwright.config.ts` | **Landed:** the E1 lane doc, coordinator-published Hetzner receipts for `bff326f`/`9bff835` (PR #50/#51), and **open PR #62** (`claude/issue-11-browser-journey`, `7e81b464`) adding visible-focus/screen-reader/zoom acceptance | **PR #62 found a real, official-Chromium-verified defect** at exact head `0ba6eae`: a 320px overflow in `.assessment.outcome-passed` (`scrollWidth 469` vs expected `<=321`), root-caused to `prospecting-workspace.tsx` missing `min-width:0`/`overflow-wrap:anywhere` on the assessment card — fix assigned to issue #8's UI owner, outside PR #62's file ownership. This sandbox specifically still cannot obtain the pinned build — do not re-attempt the download here; the environment blocker itself is otherwise resolved elsewhere |
| Issue #42 | `greenfield-target-config` stale test assertions | `site/tests/greenfield-target-config.test.mjs`, the migration-manifest CLI seam | **Landed:** PR #59 (mode-0600 assertion restored) | This ledger's own first-pass "5/8 failing" claim was **retracted** (see corrections section) — the failures were this sandbox missing a `dist/` build, not a source regression; 8/8 pass here once built. No independent claim is made either way about the exact "2 failures" the issue title cites |
| — | Product readiness unit coverage (U1) | `site/tests/product-readiness.test.mjs` (new) | **Pushed branch** `claude/product-readiness-unit-coverage-fw7k9v` (`ceea468`), no PR opened yet; reported focused suite 6/6 passing and lint-clean, full suite pending | Not yet mergeable; do not dispatch a competing packet against this file |
| PR #57 author | Morning Brief persisted read | `site/domain/morning-brief.ts`, `site/domain/morning-brief-read.ts` | **Landed and resolved:** PR #57 fixed the `authority_commands` cross-workspace join at `morning-brief-read.ts:198` with a failing-first regression, audited every other join in the file | No longer an in-progress incumbent; this ledger still does not touch these files, since there is no remaining gap in them to report |
| Independent reviewer | Auditing PR #53/#54 | — | Found the PR #57 defect | Ongoing elsewhere; not duplicated here |

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
| Company→Product→Market Play→Customer Profile→Offer hierarchy; Org/Contact identity Company-wide; Account/Target scoped correctly | `commercial-model.ts:9-36` types; scope legend at lines 32-33 (`organization`/`contact` scoped `"company"`, `account` scoped `"market_play_profile"`) | coded, wired (via `knowledge-handler.ts`), validated (`commercial-model-repository.test.mjs` 4/4) | **Resolved by PR #58** (merged): `action:"bootstrap"` is now gated behind the same `enableLocalDemoProgression` fence as `advance_local_interview` and fails closed (404) outside local-demo. This was the residual defect the issue #5 evidence doc handed off to issue #9; it is no longer open. | — | (a) done |
| Consensus Interview: one question at a time, evidence/inference/recommendation, explicit Accept/Reject/Correct/Rescope | `interview.ts:611` `submitInterviewAnswer`, `:797` `recordInterviewDecision`, snapshot at `:710-721` | coded, validated at unit level | The **generalized multi-question queue** (`interview-question-composer.ts:270-323`, Company→Product(9)→Play(6)→Profile(11)→Offer) only advances when `enableLocalDemoProgression` is true (`interview-handler.ts:74-75`), which requires `import.meta.env.DEV && TRUSTED_IDENTITY_PROVIDER==="local-demo" && LOCAL_DEMO==="1"` plus a loopback host (`runtime-identity.ts:80-84`) — **never true in a real deployment**. Outside local-demo, `readInterviewState` returns terminal `"confirmed"` after one decision with no live follow-up session (`interview.ts:217-229,243-253`) — this is exactly Audit A2/issue #9's "completes the session after one decision." | Same generalized queue composer needs to be reachable from the secure/production path, not just local-demo | **In scope for issue #9** | (a) pure local coding — **assigned to issue #9, not dispatched here** |
| Reloads/retries/stale tabs/concurrent answers converge on one authoritative question | `interview.ts:185-191` explicit `liveSession` precedence; idempotency-keyed writes at `:724-757` | coded, validated (`interview-repository.test.mjs`, `interview-handler.test.mjs`) | Only sequential/synthetic race proof exists; no browser-level concurrent-tab proof (`tests/browser/interview*.spec.ts` does not exist) | Browser acceptance | (a) domain-level met; browser proof is issue #11 territory, not newly blocking |
| Uploads/imports/research/edits enter as Proposed Knowledge with provenance; owner review/promote without unauthorized Runs/Accounts/Contacts/Prospects | `knowledge-handler.ts:96-100` dispatch (`propose_owner_edit`, `propose_repository_research`, `import_plain_text`, `propose_reuse`, `propose_allowlisted_package`); `reviewKnowledgeProposal` | coded, wired, validated (`knowledge-handler.test.mjs`, `knowledge-repository.test.mjs`) | none found | — | (a) met |
| Drift impact inspection, immutable replacement activation, snapshots, invalidated approvals, dependency-graph-scoped high-risk pause | `drift.ts` — `classifyDriftRisk` (line 51), `HIGH_RISK_DRIFT_KINDS` (4-10), `reachedArtifacts` BFS (60), `buildDriftImpact` (103) | coded, wired (`knowledge-handler.ts:112-115,193,235`), validated (`drift-replacement.test.mjs`) | UI exists (`app/knowledge/drift-replacements.tsx`) but no browser test proves it end to end | Browser acceptance | (a) domain met; browser proof is issue #8/#11 territory |
| Migration-manifest CLI test hygiene | — | — | PR #59 restored one missing happy-path assertion (mode 0600). This ledger's own first-pass re-run reported 5/8 failing and speculated it might be a source regression — **retracted**: root-caused to this sandbox missing a `dist/` build (see corrections section), 8/8 pass once built. No independent claim is made either way about the exact "2 failures" the issue title cites | Named CI-hygiene fix, does not gate Phase 2 domain acceptance | **Issue #42 already owns this** |

---

## Phase 3: Product Readiness and Market Discovery

ROADMAP: 8/11 plans done (03-01..03-08 local); 03-09/03-10/03-11 are the outstanding hosted-authorization plans.

| Criterion | Evidence | Status | Gap | Dependency | Gate |
|---|---|---|---|---|---|
| Owner sees every unmet Product readiness item; cannot activate until all 9 categories confirmed | `product-readiness.ts:34-67` `evaluateProductReadiness` | coded, wired, indirectly validated (`discovery-handler-ui.test.mjs`, `market-discovery-repository.test.mjs`) | **No dedicated unit test file for the pure `evaluateProductReadiness` function itself** — only indirect coverage | none — pure local gap | (a) — **this is unassigned gap U1, task packet below** |
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
| Minimized, revocable, quota-limited runner scope; owner inspection | `runner-assignment.ts:14-38` HMAC-signed ≤5-min TTL capability, DB stores hash only (line 34); `revokeRunnerAssignment` (40-52); `submitRunnerObservations` (55-72) | coded, validated (`runner-assignment.test.mjs` + 4 sibling suites) | `prospecting-handler.ts:26` unconditionally rejects `issue_assignment` ("Runner capability is unavailable") regardless of state. Owner inspection is **partially** live already: `prospect-review.ts:121-124` already surfaces `provider`/`model`/`allowedTools`/`quotas` in the Review Queue projection. Two named remaining gaps: (1) no dedicated view combines those with instructions/config/sources/grants — held behind issue #8's disclosure hold (U2a); (2) `runner_submissions.provenance_json` ("transformations") is persisted but never joined into that same projection — not held, just missing (U2b) | Issuance itself needs the hosted capability gate; **neither inspection gap does** — both read already-schema-ready rows | Issuance = (b) hosted. U2a = (c) owner decision. U2b = (a) pure local coding — **unassigned, task packets below** |
| Signal provenance (URL/tier/dates/retrieval/excerpt/lineage); Tier-3-alone insufficient; 24h overlap; 30-day reconfirmation | `source-policy.ts:9-46`; 24h overlap `prospecting-schedule.ts:70-74`; Tier gate `qualification.ts:57-60,81` | coded, validated (covered via `prospecting-ingestion.test.mjs`/`-lifecycle.test.mjs`, not a dedicated `source-policy.test.mjs` — confirmed present under those names, not missing) | Reachable only through runner submissions (blocked, see above) | Same hosted runner-transport gate | (b) hosted for end-to-end; (a) already met for domain logic itself |
| Deterministic 5-dimension Mining score, 7/10 threshold, pain/timing non-zero, independent-source rule, hard disqualifiers, explicit outcomes | `qualification.ts` — full pure evaluator, `MINING_HARD_DISQUALIFIERS` (2-8), pass rule (70-74), tie-order (92-96) | coded, wired into `prospecting-ingestion.ts`, validated (`qualification.test.mjs`, `prospect-quality-evaluation.test.mjs`) | End-to-end proof needs a live run with non-synthetic evidence | Hosted runner-transport gate | (b) hosted for full acceptance; domain logic itself already (a) done |
| Review Queue Approve/Reject/Defer with reason, cooldown/re-entry, funnel-loss visibility, no auto-authorization of next effect | `prospect-review.ts` `decideQualifiedProspect`; dispatched at `prospecting-handler.ts:28`, UI at `app/prospecting/review-queue.tsx` | coded, wired, validated (covered inside `profile-prospecting-integration.test.mjs`, confirmed present — not a separate missing file) | Command path is fully reachable, unlike issuance/Contacts — it's just starved of real qualified prospects until the runner-transport gate opens | Same hosted gate, for real data only; the command path itself works today | (a) command path met; (b) only for populating it with real data |

---

## Phase 5: Controlled Enrichment and Verified Contacts

ROADMAP: 0/9 plans formally accepted; heaviest unit/integration test density in the repo, entirely unreachable from any route.

| Criterion | Evidence | Status | Gap | Dependency | Gate |
|---|---|---|---|---|---|
| Single-use, bounded grant required before any paid call | `enrichment-grant-issuance.ts` `issueEnrichmentGrant` (49), `deriveOperationKey` (110); `enrichment-authority.ts` `validateEnrichmentAuthority` (140), `reserveEnrichmentOperation` (168), named rejection reasons (`grant_unavailable`/`grant_consumed`/`operation_key_mismatch`/`budget_exceeded`, line 72) | coded, validated (11 dedicated test files, most heavily covered area in the repo) | `contacts-handler.ts:70-73` returns `unavailable(...)` because `app/api/contacts/route.ts` never constructs a `commandService` — the entire grant/reserve/settle pipeline is unreachable from HTTP. The composed candidate exists (`docs/implementation-lanes/2026-09-05-contacts-d1-adapter-candidate.md`) and explicitly states it is "intentionally not imported by the production route" | Plan `05-07`, plus real `phase4Accepted`/`controlledEnrichmentActivated` predicates (both structurally false today since Phase 4 isn't accepted) | (c) — lane docs are explicit this composition is being **deliberately withheld pending Plan 05-07's authorization**, not a technical/hosted blocker (no live provider call is needed to compose and test the route wiring itself, since `contact-provider-port.ts` stays `unconfigured` regardless) |
| Runner spend stays within budgets; retries/uncertain charges never borrow/extend authority | `enrichment-authority.ts` `BudgetAccount` (4-17), `ReconciliationReason` (`timeout`/`ambiguous`/`provider_port_mismatch`/etc., line 34) | coded, validated (`enrichment-operation-preflight-integrity.test.mjs`, `enrichment-reservation-snapshot.test.mjs`) | Same composition gap as above | Same Plan 05-07 | (c) same as above |
| Suggested/inferred/domain-valid/MX-only stays labelled Contact Suggestion, cannot reach Enriched/export/call/send eligibility | `contacts-handler.ts:238-259` state machine (`ContactReady`/`ContactSuggestion`/`NeedsReview`/`NonContactable`); `contact-eligibility.ts:165-166` — only `mailbox_verified`/`source_verified` reach eligible; everything else (including MX-only/domain-valid, which are not modeled as a separate class from `domain_valid`) falls to `"suggestion"` | coded, **and read-side is runtime-wired** — `GET /api/contacts` composes `handleContactsGet` fully; live UI at `app/prospects/contacts-workspace.tsx` | Mutation side (verification promotion) shares the Plan 05-07 composition gap above; read/labelling side is already live | Plan 05-07 for the mutation half only | Read/labelling = (a) already done and live. Mutation = (c) |
| Freshness rechecked at package/export/call/send boundaries; stale reverts to NeedsReview | `contacts-handler.ts:240,271` `fresh()`/`recheckSnapshot` — demotes `ContactReady→NeedsReview` live at read time using `DEFAULT_CONTACT_FRESHNESS_MS` per verification class | coded, wired, validated (`contact-clock-integrity.test.mjs`) | Package/export/send-boundary rechecks belong to Phase 6/7 (not yet built) — correctly out of Phase 5's own scope | Phase 6/7 composition | (a) Phase 5's own boundary (read) is done; remainder is those phases' gate, not a new Phase 5 gap |
| Owner review of ambiguous merge/split, preserving lineage/relevance/associations/suppression | `identity-resolution.ts` (1105 lines), `identity-repository.ts` (1515 lines); `contacts-handler.ts:37-38,307-308` command shapes | coded, validated (`identity-resolution.test.mjs` confirmed present — re-verified directly, not a gap) | Same `commandService` composition gap | Plan 05-07 | (c) |

**Person Discovery sub-area (the "no known contact" path):** fully owned by issue #6 (C1–C4
lanes, `person-discovery*.ts`/`-handler.ts`/`-repository.ts`, dev-only route gate at
`app/api/contacts/person-discovery/route.ts:30-37`). Not duplicated here beyond ownership
citation, per issue #6's own "Execution boundary" coordination note.

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
| Weekly Export-ready cohort (7/week target), 10 funnel-loss categories | `weekly-outcome.ts` (674 lines, pure reducer, zero runtime importers) | coded, unit-validated | `ExportReady` exists nowhere in schema; `profile_prospects.state` admits only `qualified/approved/rejected/deferred/cooled_down`; no transition-history table exists — pinned by `weekly-outcome-persisted-state-conformance.test.mjs`'s `UNBACKED_PROSPECT_STATES` | Plan `07-04`'s migration index is unallocated; `07-04` depends on `07-01/02/03`, which depend on Plan `06-10`'s Gmail-authorization gate | (c) — transitively blocked on the same `06-10` owner gate as Phase 6 |
| CRM CSV — one row per eligible Enriched Contact, stable Prospect ID | `crm-csv-codec.ts` (261 lines); `preparation/phase7-csv-policy-definition.ts` and 3 sibling files model schema/version-intent/precondition | coded, unit-validated, zero runtime importers | Same handoff/manifest chain, ultimately `06-10`-gated | (c) then (a) |
| Passphrase-encrypted, content-addressed, versioned workspace archive | No `archive.ts`/`restore.ts` domain module found | not started | Plans `07-05`–`07-08`, all unstarted | (c) |
| Owner-reviewed restore dry run, fail-closed on tamper/wrong-passphrase/version-skew | No restore-specific module or preparation file found | not started | Plans `07-09`–`07-10` | (c) |

**Single dominant structural fact for Phase 6+7 together:** one named human-authorization
checkpoint (`06-10-PLAN.md` Task 2 — owner-named Gmail account/scope authorization) blocks
essentially everything downstream in both phases, either directly (`06-11`/`06-12`) or
transitively (`07-01`–`07-04` per `07-PREPARATION.md`'s own note that it is blocked "while
Plan 06-10 and every Phase 7 dependency remain incomplete").

---

## Cross-cutting

### Browser/accessibility acceptance — issue #11
**Corrected from the first pass.** The pinned Chromium 1243 build is unobtainable specifically
in *this* sandbox (`cdn.playwright.dev` and `playwright.azureedge.net` both unreachable here
per `docs/implementation-lanes/2026-09-08-work-unit-e1-operator-journey.md`) — this ledger did
not re-attempt the download in this environment. It is not a blanket "unobtainable" claim: the
coordinator has published verified receipts of the real pinned build actually running, with no
shim, against exact commits `bff326f` (PR #50 comment 5588416480) and `9bff835` (PR #51
comment 5588407370), both ancestors of current `main`, on isolated Hetzner containers — 2/2,
1/1, and 1/1 across the three lanes, zero-effect verifiers clean. Both receipts are explicit
that they resolve only the browser-environment blocker for those exact candidates; full
canonical validation and independent review remain separately required and are not claimed
here. **Second correction, same pass:** open PR #62 (issue #11's own lane, see Active
Incumbents above) went further and actually ran the E1 journey against the real pinned build —
this is no longer merely an environment-resolved blocker. It found one **real** defect: a
320px overflow in `.assessment.outcome-passed`, root-caused to a missing `min-width:0`/
`overflow-wrap:anywhere` pair on the assessment card in `prospecting-workspace.tsx`, fixed by
issue #8's UI owner rather than PR #62 itself (outside that lane's file ownership). E2
(approval/CRM-handoff browser acceptance) is separately blocked because its underlying seams
(`preparation/`, `crm-csv-codec.ts`) are hard-gated from runtime composition (same Phase 6/7
gates above) — this part of the original finding stands. Gate: (b) hosted/environment for any
further E1 work in this sandbox specifically (already satisfied elsewhere); (a) pure local
coding for the found CSS defect, assigned to issue #8; (b)/(c) mixed for E2.

### Security review posture
No repository-wide `docs/SECURITY*.md` exists; only Phase-2-scoped `02-SECURITY.md`. The
closest cross-cutting security gate is `06-10-PLAN.md`'s required independent
pre-composition review before Gmail composition, itself blocked at the Task 2
owner-authorization checkpoint. No separate coding slice identified; this ledger and a future
dedicated `docs/SECURITY-REVIEW.md` (if the owner wants one) are the only documentation-only
options, not code.

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
decisions. One item was explicitly out of that PR's scope and remains genuinely open without
requiring owner authorization: narrow, read-only public-documentation research on a candidate
provider's published data fields, freshness policy, reuse terms, rate limits, and pricing.
That is task packet U3 below.

---

## Task packets for coordinator dispatch

Each packet is independently dispatchable, touches no file claimed by an active incumbent
above, and does not overlap another packet's files.

### Packet U1 — Product readiness unit coverage — **SUPERSEDED, do not dispatch**
- **Status:** an incumbent branch already exists — `claude/product-readiness-unit-coverage-fw7k9v`
  (`ceea468`), reported focused suite 6/6 passing, lint-clean, full suite pending, no PR yet.
  See Active Incumbents above. Retained below only as the original scoping reference in case
  that branch stalls or needs a second reviewer's write-up to compare against.
- **New file only:** `site/tests/product-readiness.test.mjs`
- **Touches no existing file.**
- **Work:** table-driven unit test against `site/domain/product-readiness.ts`'s
  `evaluateProductReadiness`, asserting `complete:false` for each of the 9 categories missing
  individually and `complete:true` only when all 9 have exactly one confirmed knowledge
  version each; also cover duplicate-category rejection.
- **Verification:** new suite passes; no existing suite's assertions change.
- **Gate:** (a) pure local coding, unblocked.
- **Priority:** low — a coverage gap, not a product-facing gap.

### Packet U2a — Runner Assignment full inspection view (provider/model/instructions/tools/sources/grants) — **HELD, not dispatchable**
- Issue #8's body states explicitly: "Full grant/identity/source disclosure remains subject
  to its existing explicit hold; do not expose withheld information as part of a copy or
  layout change." A dedicated view surfacing provider/model/instructions/tools/sources/grants
  together is exactly the disclosure that hold covers, regardless of which fields a first
  draft chooses to include — the hold is about the disclosure decision itself, not about any
  one field list.
- **What would need to happen first:** the owner reconciles the disclosure hold (confirms it
  still applies, narrows it, or lifts it for this specific projection) before any code is
  written against it. No confidential capability field may be exposed by inference — i.e., a
  narrower view that only implies the existence/shape of held-back fields does not sidestep
  the hold either.
- **What remains true and unchanged:** the backing `runner_assignments`/audit rows are
  schema-ready (currently empty) and reading them requires no hosted/credential authority —
  once the disclosure hold is reconciled, building the view is (a) pure local coding, not
  (b) hosted-gated. That is a different kind of gate than the ones blocking Phase 6/7, and
  should not be conflated with them.
- **Action for this ledger:** do not dispatch. Report the held status to the coordinator;
  await an explicit owner decision on the disclosure hold before this packet becomes
  actionable.

### Packet U2b — Surface runner-submission transformations in the review queue — **dispatchable, not held**
- **Reviewer-identified split (Codex, PR #63 review comment on line 329 of the prior draft),
  independently verified before accepting:** `runner_submissions.provenance_json` is a real,
  `NOT NULL`, persisted column (`site/drizzle/0007_profile_prospecting.sql:407`), but
  `readProspectingProjection` (`site/domain/prospect-review.ts:96`) never joins
  `runner_submissions` at all — only `runner_assignments` — so those recorded transformations
  are silently dropped from the projection the Review Queue UI consumes. `.planning/ROADMAP.md`
  Phase 4 criterion 2 explicitly requires the owner be able to inspect "transformations" among
  provider/model/instructions/tools/configuration/sources/assignment/grants.
- **Why this is not covered by the U2a hold:** the same `readProspectingProjection` function
  already surfaces `provider`/`model`/`allowedTools`/`quotas` derived from
  `runner_assignments.quota_json` (`prospect-review.ts:121-124`) in live, already-shipped code
  — i.e., that category of field is not itself universally withheld; the U2a hold is about a
  *dedicated full-grant/identity/source inspection surface*, not about every individual field
  ever reaching the UI. `provenance_json` (transformations applied to raw evidence) is a
  distinct field from grant/identity/source/credential material and does not itself disclose
  any of those.
- **Work:** join `runner_submissions` into the existing `runs` query in
  `readProspectingProjection`, project `provenance_json` (parsed, bounded) onto each run/queue
  row, and render it in the existing Review Queue UI alongside the already-shown
  provider/model/allowedTools fields — explicitly excluding raw grant tokens, capability
  secrets, and any field U2a's hold covers.
- **Verification:** a test asserting the projection surfaces parsed `provenance_json` content
  for a seeded submission, and a second asserting no `token_hash`/`nonce_hash`/raw-capability
  field appears anywhere in the projection's output shape.
- **Gate:** (a) pure local coding, unblocked — no owner decision needed, since it extends an
  already-shipped, already-disclosed field category rather than opening a new one.
- **Priority:** medium — closes a concrete, named ROADMAP criterion gap (Phase 4 "inspect
  transformations") that U2a's hold does not actually cover.

### Packet U3 — Candidate contact-provider public documentation research — **SUPERSEDED, do not dispatch**
- **Status:** open as PR #61 (`claude/issue-7-provider-public-research`, `a90c732`) —
  `docs/implementation-lanes/2026-09-08-contact-provider-public-research.md`, comparing five
  providers, unresolved terms explicitly marked rather than guessed. See Active Incumbents
  above. Retained below only as the original scoping reference.
- **Routes through issue #7's existing owner**, not a freestanding independent dispatch — it
  extends the same evaluation-gap inventory PR #54 already produced there, so should land as
  that lane's follow-up rather than a separately assigned writer.
- **New file only:** an addition to `docs/implementation-lanes/issue-7-evaluation.md` or a new
  sibling doc, at the discretion of whoever picks this up — documentation only, no code.
- **Work:** research and record, from public documentation only (no account, no API call, no
  spend), a candidate contact-enrichment provider's published data fields, freshness policy,
  reuse/redistribution terms, rate limits, and pricing — informational input for the owner's
  eventual provider-selection decision, not a selection itself.
- **Verification:** none beyond normal documentation review; makes no code change and touches
  no test.
- **Gate:** (a) pure research/documentation, unblocked.
- **Priority:** low — informational only, not on any critical path.

---

## Boundary

No multitenancy, real identities/data, hosted, provider, account, credential, outbound, or
export effect was introduced, exercised, or proposed by this document. No source file,
migration, schema, `package.json`, or other planning document (`STATE.md`, `ROADMAP.md`,
`REQUIREMENTS.md`, `PROJECT.md`) was modified — only this new file was added. Every "coded"
or "validated" status above reflects local, synthetic test evidence; none constitutes or
substitutes for the hosted/owner acceptance checkpoints named throughout (Plans `02-99`,
`03-09/10/11`, `05-07`, `06-10`, `07-01..10`). This ledger names accepted owner lanes and
dependency chains; it does not claim any live session execution occurred against a hosted
target.
