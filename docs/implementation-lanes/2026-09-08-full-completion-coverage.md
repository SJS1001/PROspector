# Full-completion coverage ledger

**Prepared:** 2026-09-08
**Repository:** `https://github.com/SJS1001/PROspector.git`
**Base:** `main` at `f2fceb0` (includes merged PRs #50–#56)
**Lane branch:** `claude/issue-full-completion-coverage`
**Scope of this document:** documentation only. No source file was edited to produce it.

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

Three gaps have no owning issue or in-flight lane as of this checkpoint:

| # | Gap | Phase | Size | Blocking type |
|---|---|---|---|---|
| U1 | `site/domain/product-readiness.ts`'s `evaluateProductReadiness` has no dedicated unit test file | 3 | small | none — pure local coding |
| U2 | No owner-facing read-only "Runner Assignment inspection" view exists (provider/model/instructions/tools/config/sources/grants), though the backing rows and domain projection are schema-ready | 4 | small–medium | none — pure local coding, but touches UI surface; recommend routing through issue #8's coordinator to avoid a second concurrent UI writer |
| U3 | Issue #7's narrow allowance for public-documentation research on a candidate contact-provider's data fields/freshness/reuse terms/rate limits/pricing was explicitly out of PR #54's scope and remains open | 5 | small | none — pure research/documentation, no owner authorization needed |

Everything else identified below is either (a) already inside an open issue's stated scope
— cited by number, not duplicated — or (b)/(c) blocked on hosted/provider/credential
authority or an explicit owner decision, with the exact plan number or checkpoint named.
Task packets for U1–U3 are at the end of this document, sized for independent, non-colliding
dispatch.

## Active incumbents (do not dispatch a duplicate writer against these)

| Owner | Scope | Files | Status at this checkpoint |
|---|---|---|---|
| Issue #9 | Multi-question interview progression through Offer/readiness | `site/domain/interview.ts`, `interview-handler.ts`, `interview-question-composer.ts` | Open; production path still terminates after one confirmed decision (see Phase 2 below) |
| Issue #6 | First-person discovery for prospects with no known contact | `site/domain/person-discovery*.ts`, `app/api/contacts/person-discovery/*`, `app/prospects/person-discovery-workspace.tsx` | Open; C1–C4 lanes landed, production route still supplies no service |
| Issue #8 | Task-focused, coherent, understandable interface | `site/app/**` (shell, discovery, knowledge, prospecting UI) | Open; PR #56 recently merged into this scope |
| Issue #7 | Prospect quality, contact coverage, operating cost measurement | `docs/PROSPECT-QUALITY-EVALUATION.md`, `site/domain/prospect-quality-evaluation.ts` | Open; PR #54 (merged) reported the harness already exists and named remaining owner-only prerequisites |
| Issue #11 | Complete browser journey and accessibility acceptance | `site/tests/browser/**`, `site/scripts/browser-acceptance-*`, `site/playwright.config.ts` | Open; pinned Chromium 1243 unobtainable in this environment per `docs/implementation-lanes/2026-09-08-work-unit-e1-operator-journey.md` — do not re-attempt the download |
| Issue #42 | `greenfield-target-config` stale test assertions (2 failures on main) | `site/tests/greenfield-target-config.test.mjs`, the migration-manifest CLI seam | Open; CI-hygiene only, does not block Phase 2 domain acceptance |
| PR #53 author (unpublished follow-up) | Morning Brief persisted read | `site/domain/morning-brief.ts`, `site/domain/morning-brief-read.ts` | **Live defect confirmed, fix in progress, not yet pushed**: `morning-brief-read.ts:198`'s `authority_commands` join has no `workspace_id` predicate, unlike every sibling query in the file and unlike `profile-readiness.ts`'s equivalent pattern. No commit fixing it exists on `main` past `f2fceb0`. **Do not touch these two files.** |
| Independent reviewer | Auditing PR #53/#54 | — | In progress elsewhere; not duplicated here |

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
| Company→Product→Market Play→Customer Profile→Offer hierarchy; Org/Contact identity Company-wide; Account/Target scoped correctly | `commercial-model.ts:9-36` types; scope legend at lines 32-33 (`organization`/`contact` scoped `"company"`, `account` scoped `"market_play_profile"`) | coded, wired (via `knowledge-handler.ts`), validated (`commercial-model-repository.test.mjs` 4/4) | `interview.ts` still exports `PILOT_COMPANY_NAME="Digitalrain"` and `bootstrapInterview` (`interview.ts:418-437`) unconditionally seeds a `"Digitalrain"` workspace; `action:"bootstrap"` remains in `INTERVIEW_ACTIONS` and reachable via `/api/interview` (`interview-handler.ts:77-78,175-176`) for any admitted owner, with no test proving it's unreachable for a non-local-demo generic owner. This is the exact residual defect the issue #5 evidence doc (`docs/implementation-lanes/2026-09-08-issue5-generic-onboarding-evidence.md`) hands off. | **In scope for issue #9** — its own evidence already cites `interview.ts:703` | (a) pure local coding — **assigned to issue #9, not dispatched here** |
| Consensus Interview: one question at a time, evidence/inference/recommendation, explicit Accept/Reject/Correct/Rescope | `interview.ts:611` `submitInterviewAnswer`, `:797` `recordInterviewDecision`, snapshot at `:710-721` | coded, validated at unit level | The **generalized multi-question queue** (`interview-question-composer.ts:270-323`, Company→Product(9)→Play(6)→Profile(11)→Offer) only advances when `enableLocalDemoProgression` is true (`interview-handler.ts:74-75`), which requires `import.meta.env.DEV && TRUSTED_IDENTITY_PROVIDER==="local-demo" && LOCAL_DEMO==="1"` plus a loopback host (`runtime-identity.ts:80-84`) — **never true in a real deployment**. Outside local-demo, `readInterviewState` returns terminal `"confirmed"` after one decision with no live follow-up session (`interview.ts:217-229,243-253`) — this is exactly Audit A2/issue #9's "completes the session after one decision." | Same generalized queue composer needs to be reachable from the secure/production path, not just local-demo | **In scope for issue #9** | (a) pure local coding — **assigned to issue #9, not dispatched here** |
| Reloads/retries/stale tabs/concurrent answers converge on one authoritative question | `interview.ts:185-191` explicit `liveSession` precedence; idempotency-keyed writes at `:724-757` | coded, validated (`interview-repository.test.mjs`, `interview-handler.test.mjs`) | Only sequential/synthetic race proof exists; no browser-level concurrent-tab proof (`tests/browser/interview*.spec.ts` does not exist) | Browser acceptance | (a) domain-level met; browser proof is issue #11 territory, not newly blocking |
| Uploads/imports/research/edits enter as Proposed Knowledge with provenance; owner review/promote without unauthorized Runs/Accounts/Contacts/Prospects | `knowledge-handler.ts:96-100` dispatch (`propose_owner_edit`, `propose_repository_research`, `import_plain_text`, `propose_reuse`, `propose_allowlisted_package`); `reviewKnowledgeProposal` | coded, wired, validated (`knowledge-handler.test.mjs`, `knowledge-repository.test.mjs`) | none found | — | (a) met |
| Drift impact inspection, immutable replacement activation, snapshots, invalidated approvals, dependency-graph-scoped high-risk pause | `drift.ts` — `classifyDriftRisk` (line 51), `HIGH_RISK_DRIFT_KINDS` (4-10), `reachedArtifacts` BFS (60), `buildDriftImpact` (103) | coded, wired (`knowledge-handler.ts:112-115,193,235`), validated (`drift-replacement.test.mjs`) | UI exists (`app/knowledge/drift-replacements.tsx`) but no browser test proves it end to end | Browser acceptance | (a) domain met; browser proof is issue #8/#11 territory |
| Migration-manifest CLI test hygiene | — | — | `greenfield-target-config.test.mjs` asserts a stale manifest block, 2 failures on `main` | Named CI-hygiene fix, does not gate Phase 2 domain acceptance | **Issue #42 already owns this** |

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
| Minimized, revocable, quota-limited runner scope; owner inspection | `runner-assignment.ts:14-38` HMAC-signed ≤5-min TTL capability, DB stores hash only (line 34); `revokeRunnerAssignment` (40-52); `submitRunnerObservations` (55-72) | coded, validated (`runner-assignment.test.mjs` + 4 sibling suites) | `prospecting-handler.ts:26` unconditionally rejects `issue_assignment` ("Runner capability is unavailable") regardless of state; **no owner-facing inspection UI exists at all** for provider/model/instructions/tools/config/sources/grants — confirmed via grep, zero `app/` references to `runner-assignment` exports | Issuance itself needs the hosted capability gate; the **inspection view does not** — it can read already-schema-ready (currently empty) rows today | Issuance = (b) hosted. Inspection view = (a) pure local coding — **this is unassigned gap U2, task packet below** |
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
| Seeded hierarchy + Phase 4 schedule state shown, not activated | `morning-brief-read.ts:140-209` — **active incumbent lane, do not touch** (see table above) | coded, unit-validated, zero runtime importers besides its own test | UI composition owned by the Work Unit D operator-interface lane (issue #8 adjacent), not duplicated here | — | (a) once the incumbent's fix lands and it's composed — not this ledger's action |
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
Confirmed still blocked in this environment: pinned Chromium build 1243 is unobtainable
(`cdn.playwright.dev` and `playwright.azureedge.net` both unreachable per
`docs/implementation-lanes/2026-09-08-work-unit-e1-operator-journey.md`); this ledger did not
re-attempt the download, per that doc's own instruction not to. E2 (approval/CRM-handoff
browser acceptance) is separately blocked because its underlying seams (`preparation/`,
`crm-csv-codec.ts`) are hard-gated from runtime composition (same Phase 6/7 gates above).
Gate: (b) hosted/environment for E1 continuation; (b)/(c) mixed for E2.

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

### Packet U1 — Product readiness unit coverage
- **New file only:** `site/tests/product-readiness.test.mjs`
- **Touches no existing file.**
- **Work:** table-driven unit test against `site/domain/product-readiness.ts`'s
  `evaluateProductReadiness`, asserting `complete:false` for each of the 9 categories missing
  individually and `complete:true` only when all 9 have exactly one confirmed knowledge
  version each; also cover duplicate-category rejection.
- **Verification:** new suite passes; no existing suite's assertions change.
- **Gate:** (a) pure local coding, unblocked.
- **Priority:** low — a coverage gap, not a product-facing gap.

### Packet U2 — Runner Assignment read-only inspection view
- **Candidate new files:** a read-only projection function in `site/domain/runner-assignment.ts`
  (additive export, does not touch existing exports/logic) plus a new UI view under
  `site/app/prospecting/` or wherever issue #8's lane places new prospecting-adjacent
  surfaces.
- **Recommend coordinating with issue #8's owner before dispatch** — this is a new capability
  surface, not a coherence fix to existing UI, so it may or may not fit that lane's current
  scope; flagged here rather than assumed.
- **Work:** expose already-schema-ready (currently empty) `runner_assignments`/audit rows as
  a read-only owner view of provider/model/instructions/tools/configuration/sources/grants,
  explicitly never exposing `token_hash`/`nonce_hash`/raw capability values.
- **Verification:** a test asserting the projection surfaces the intended fields and none of
  the excluded secret-adjacent fields.
- **Gate:** (a) pure local coding, unblocked by hosted/owner authority — the only open
  question is which lane should own it.
- **Priority:** medium — real product-facing value (owner visibility into what a runner would
  do) independent of the hosted issuance gate.

### Packet U3 — Candidate contact-provider public documentation research
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
