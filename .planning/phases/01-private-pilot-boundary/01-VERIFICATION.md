---
phase: 01-private-pilot-boundary
verified: 2026-07-30T16:03:18Z
status: human_needed
score: 7/8 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Use a controlled second real Sites principal against the production app, interview API, capability API, and capability-probe route, then inspect owner-side state."
    expected: "Every surface returns only neutral denial and the owner confirms zero new workspace, object, proof, CSRF, interview, knowledge, or audit state."
    why_human: "The hosting boundary must assert the second identity; local identities, mocks, and forged headers cannot prove this condition."
  - test: "Run the authenticated hosted negative-mutation cases with the owner session: foreign origin, missing CSRF, malformed JSON, and replayed CSRF."
    expected: "The requests return the documented 4xx outcomes, create no successful proof, and logs expose neither session material nor the one-time CSRF value."
    why_human: "The safe harness requires an operator-supplied authenticated session transport that is intentionally unavailable to automated verification."
  - test: "Inspect Sites runtime configuration, the deployed client bundle, responses, and fresh worker logs for the Phase 1 secret-handling contract."
    expected: "Required server-only bindings exist, while owner email, subject pepper, cookies, tokens, proof payload bytes, workspace/object identifiers, and operational data are absent from Git, client output, responses, and logs."
    why_human: "Secret-store existence and hosted log contents are control-plane properties; repository inspection cannot prove them."
  - test: "Have fresh independent product and security reviewers assess application commit e74ed96 / Sites version 10 and record their verdicts."
    expected: "No unresolved BLOCKER or HIGH finding remains for the exact version-10 identity, mutation-token, capability, and hosted-proof boundary."
    why_human: "The repository's independent CLEAN reviews target version 8; 01-HOSTED-PROOF.md explicitly records the required fresh version-10 stage as REDTEAM-BLOCKED."
---

# Phase 1: Private Pilot Boundary Verification Report

**Phase Goal:** The owner can safely use a private, isolated, portable pilot boundary in which human authority is explicit and unproven capabilities cannot expose sensitive data or create external effects.
**Verified:** 2026-07-30T16:03:18Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|---|---|---|
| 1 | A signed-in owner is admitted to exactly one Company Workspace; unauthorized identities cannot bootstrap or read it, and invitations remain unavailable. | ✓ VERIFIED | `admitPilotOwner` compares normalized trusted identity to the server-only configured owner before returning a principal (`site/domain/pilot-access.ts:20-35`). Interview and capability handlers admit before workspace lookup or request processing (`site/domain/interview-handler.ts:28-47`, `site/domain/capability-handler.ts:51-58,83-105`). `workspaces.owner_subject` is unique (`site/db/schema.ts:10-13`). Local second-principal and zero-row tests pass. No invitation/role implementation exists. |
| 2 | No client value can choose a principal, workspace, object namespace, proof key, or proof payload. | ✓ VERIFIED | Routes receive identity and secrets only from server bindings (`site/app/api/interview/route.ts:19-39`, `site/app/api/capability-runtime.ts:20-50`). Object scope is constructed from the admitted workspace and an opaque server-generated probe ID (`site/domain/ports/object-storage.ts:8-27`, `site/adapters/cloudflare/r2-object-storage.ts:7-43`). Probe POST accepts only an empty JSON object (`site/domain/capability-handler.ts:83-118`). |
| 3 | Consequential knowledge requires a separate explicit confirmation, and no workflow silently sends, spends, or creates CRM opportunity/forecast/contract/revenue/customer state. | ✓ VERIFIED | Interview actions separate `submit_recommendation_answer` from `confirm_submitted_answer` (`site/domain/interview-handler.ts:56-69`); persistence tests cover the two-stage transition. The only live mutation outside the interview is the fixed storage proof. Later workflow controls render with native `disabled`; no send, spend, invitation, or CRM lifecycle handler/route exists. |
| 4 | Capability status is evidence-backed and distinguishes Proven, Blocked, and Unproven; binding presence or a failed/incomplete proof cannot yield Proven. | ✓ VERIFIED | `CapabilityStatus` is the exact three-state union and `projectCapabilityState` requires current successful evidence, including all five R2 steps (`site/domain/capabilities.ts:3,129-201`). D1 audit evidence, rather than a binding boolean, feeds the projection (`site/app/api/capability-runtime.ts:69-120`). Capability and object-storage tests pass. |
| 5 | The owner can see an auditable Pilot Status surface while leads, contacts, credentials, imports, schedules, exports, outreach, paid work, runners, and provider effects remain disabled. | ✓ VERIFIED | Server-rendered `Home` obtains the owner-only capability model before rendering (`site/app/page.tsx:9-30`). `PilotStatus` renders status counts, timestamps/references, eight capability cards, and the unavailable-effects boundary; fixture controls are natively disabled (`site/app/prospector-app.tsx:108-126,144-280`). Render and fixture-safety tests pass. |
| 6 | The fixed R2 proof performs write/read/digest/delete/absence inside the admitted workspace and records auditable minimized evidence; any failed step cannot prove storage. | ✓ VERIFIED | `runObjectStorageProof` executes and checks all five steps, attempts cleanup, and returns Blocked on failure (`site/domain/capabilities.ts:204-268`). The R2 adapter cannot escape its hashed workspace prefix. Runtime wiring records the result to workspace-scoped `audit_events` (`site/app/api/capability-runtime.ts:43-49,123-150`). Success, corrupt-read, delete-failure, and residual-object tests pass. |
| 7 | A redacted hosted record binds exact source/deployment provenance and records owner D1/R2 durability, anonymous denial, audit visibility, and provider-neutral behavior without operational data in Git. | ✓ VERIFIED | `01-HOSTED-PROOF.md` identifies application commit `e74ed96`, Sites source `d6b3b619...`, version 10, deployment, R2 five-step evidence, durable reload reference, and owner D1 lifecycle identifiers. The production denied-mode harness independently passed during this verification with HTTP 401 and neutral output. Repository searches found secret *names* only in server wiring/docs, not values. The provider-specific R2 type is confined to the adapter. |
| 8 | The exact hosted release is proven against a real second principal and authenticated negative mutations, its secret/log hygiene is control-plane verified, and the post-change version has fresh independent red-team approval. | ? UNCERTAIN | `01-HOSTED-PROOF.md` explicitly marks controlled second-principal denial and zero-delta checks pending, hosted foreign-origin/missing-CSRF/malformed/replay checks pending, and the fresh red-team stage `REDTEAM-BLOCKED`. Existing independent CLEAN reviews target version 8, while security-sensitive CSRF/log changes produced version 10. These require the human checks in this report. |

**Score:** 7/8 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `site/tests/pilot-access.test.mjs` | Single-owner admission and neutral denial contract | ✓ VERIFIED | Substantive Vite-loaded contract; owner normalization and missing/mismatched identity cases pass. |
| `site/tests/capability-state.test.mjs` | Evidence-backed capability projection contract | ✓ VERIFIED | Covers blocked/unproven/proven, stale, failed, and incomplete evidence. |
| `site/tests/object-storage.test.mjs` | Scoped object lifecycle contract | ✓ VERIFIED | Covers opaque prefix, traversal rejection, adapter scope, digest corruption, failed delete, and residual object. |
| `site/tests/capabilities-route.test.mjs` | Capability API privacy and mutation contract | ✓ VERIFIED | Covers owner-only no-store reads, neutral denial, fixed body, origin/CSRF/replay, missing R2, and proof results. |
| `site/domain/pilot-access.ts` | Single-owner admission | ✓ VERIFIED | Exports substantive `PilotAccessError` and `admitPilotOwner`; wired through both handler families. |
| `site/domain/interview-handler.ts` | Admission before interview reads/mutations | ✓ VERIFIED | Admits at the start of GET/POST, then scopes every operation to the derived principal. |
| `site/domain/capabilities.ts` | Capability projection and storage proof orchestration | ✓ VERIFIED | Substantive three-state projection and five-step proof implementation. |
| `site/domain/ports/object-storage.ts` | Provider-neutral object-storage port | ✓ VERIFIED | Exports the port plus hashed workspace prefix/key helpers; contains no provider type. |
| `site/adapters/cloudflare/r2-object-storage.ts` | Cloudflare R2 adapter | ✓ VERIFIED | Implements the port with private bucket/workspace fields and server-derived keys. |
| `site/app/api/capabilities/route.ts` | Owner-only capability GET | ✓ VERIFIED | Exports `GET` and delegates to the admitted evidence handler. |
| `site/app/api/capability-probe/route.ts` | Fixed owner-only R2 proof POST | ✓ VERIFIED | Exports `POST` and delegates through server runtime wiring to R2 proof/audit logic. |
| `site/app/prospector-app.tsx` | Default Pilot Status and disabled broader boundary | ✓ VERIFIED | Substantive status UI; wired to server initial state and `/api/capabilities` refresh. |
| `site/scripts/hosted-boundary-proof.mjs` | Repeatable redacted hosted validation | ✓ VERIFIED | Help, unit harness, and live anonymous denied mode pass; authenticated modes await operator transport. |
| `.planning/phases/01-private-pilot-boundary/01-HOSTED-PROOF.md` | Provenance, safe outcomes, unresolved checkpoints | ✓ VERIFIED | Substantive and candid: includes exact identifiers/evidence and preserves pending gates without overclaiming. |
| `docs/WAVE-0-CAPABILITY-REPORT.md` | Accepted capability boundary | ✓ VERIFIED | Mirrors version-10 provenance and R2/D1 evidence while retaining isolation, scheduler, runner, Gmail, and export limitations. |

`gsd-sdk verify.artifacts/key-links` produced several false negatives because it does not recognize TypeScript type exports, Vite dynamic test imports, or indirect route → handler → runtime wiring. Each such result was checked manually against source and execution.

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `pilot-access.test.mjs` | `pilot-access.ts` | Vite SSR module load | ✓ WIRED | Loads and invokes both exported admission symbols. |
| `object-storage.test.mjs` | `ports/object-storage.ts` | Vite SSR module load/fake port | ✓ WIRED | Invokes prefix helpers and proof through in-memory implementations. |
| `interview/route.ts` | `pilot-access.ts` | route → interview handler → admission | ✓ WIRED | Trusted identity and owner binding are injected; handler admits before D1 access. |
| `interview-handler.ts` | `interview.ts` | admitted principal passed to repository operations | ✓ WIRED | Every read/mutation receives the admitted principal. |
| `capabilities.ts` | `ports/object-storage.ts` | `ObjectStoragePort` dependency | ✓ WIRED | Proof orchestration calls all four port operations. |
| `r2-object-storage.ts` | `ports/object-storage.ts` | `implements ObjectStoragePort` | ✓ WIRED | Adapter implements and scopes the exact port contract. |
| `capabilities/route.ts` | `capabilities.ts` | route → handler → runtime evidence projection | ✓ WIRED | Handler calls `projectCapabilityState` using runtime D1 evidence. |
| `capability-probe/route.ts` | `r2-object-storage.ts` | route → handler → runtime proof | ✓ WIRED | Admitted workspace constructs the adapter, runs proof, then records audit evidence. |
| `prospector-app.tsx` | `/api/capabilities` | initial server state and authenticated refresh | ✓ WIRED | Server prop renders immediately; refresh updates state and unauthorized response removes the shell. |
| `hosted-boundary-proof.mjs` | `/api/capabilities` | denied/owner reads | ✓ WIRED | Live denied mode passed; authenticated read remains human-operated. |
| `hosted-boundary-proof.mjs` | `/api/capability-probe` | fixed owner proof | ✓ WIRED | Unit harness exercises full flow; hosted owner result is recorded with matching durable evidence. |
| `01-HOSTED-PROOF.md` | `WAVE-0-CAPABILITY-REPORT.md` | shared exact version/evidence identifiers | ✓ WIRED | Both record version 10, application/source provenance, matching R2 evidence, and the same open isolation gate. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|---|---|---|---|---|
| `site/app/prospector-app.tsx` Pilot Status | `initialCapabilityState` / `state` | Server `Home` or GET `/api/capabilities` → admitted workspace → D1 audit rows → projection | Yes | ✓ FLOWING |
| `site/app/api/capabilities/route.ts` | `capabilities` | Workspace-scoped `audit_events` query in `capability-runtime.ts` | Yes | ✓ FLOWING |
| `site/app/api/capability-probe/route.ts` | `proof` | Admitted workspace → `R2ObjectStorage` → five-step proof → D1 audit insert | Yes | ✓ FLOWING |
| Knowledge/Interview UI | `interview` | GET/POST `/api/interview` → owner-scoped D1 rows | Yes | ✓ FLOWING |
| Non-operational prospect/discovery views | `signals` / `discovery` | Static fixture arrays | No, intentionally synthetic | ℹ FIXTURE-ONLY — labelled synthetic and all consequential controls disabled |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Lint | `cd site && npm run lint` | Exit 0 | ✓ PASS |
| Production build and full tests | `cd site && npm test` | Build succeeded; 15/15 tests passed | ✓ PASS |
| Security/capability targeted suite | `node --test` on pilot access, capability state, object storage, routes, and hosted harness | 9/9 tests passed | ✓ PASS |
| Harness interface | `node scripts/hosted-boundary-proof.mjs --help` | Exit 0; safe modes/transport documented | ✓ PASS |
| Production anonymous boundary | hosted harness denied mode | HTTP 401, neutral output, `no-store`; exit 0 | ✓ PASS |
| Production owner/second-principal boundary | authenticated harness/browser checks | Session/second identity not available to verifier | ? HUMAN |

### Probe Execution

| Probe | Command | Result | Status |
|---|---|---|---|
| Conventional `probe-*.sh` | discovery scan | No conventional shell probes declared or found | ? N/A |
| Hosted boundary denied probe | `node scripts/hosted-boundary-proof.mjs --base-url https://prospector-steven-pilot.djstif.chatgpt.site/` | `{"ok":true,"check":"unauthenticated_denial","status":401,"neutral":true}` | ✓ PASS |
| Hosted owner proof | same harness with `--mode owner-proof --session-headers-file <local>` | Not run; authenticated transport intentionally unavailable | ? HUMAN |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| `REQ-private-human-governed-gtm` | 01-01 through 01-05 | Explicit knowledge/effect authority; no silent spend/outreach/CRM lifecycle | ✓ SATISFIED | Separate Answer/Confirmation persistence, fixed proof-only mutation, disabled effects, no CRM lifecycle route or handler, full tests green. |
| `REQ-company-workspace-isolation` | 01-01 through 01-05 | Exactly one auditable Company Workspace with no invitations or pooled data | ? NEEDS HUMAN | Unique owner subject, server admission, row scoping, opaque object prefix, local negative tests, and live anonymous 401 are verified; the required real hosted second-principal zero-delta proof remains pending. |

No Phase 1 requirement is orphaned: both roadmap requirements appear in every Phase 1 plan and no additional requirement is mapped to Phase 1.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|---|---|---|---|---|
| Phase-modified source set | — | `TBD` / `FIXME` / `XXX` debt markers | None | No blocker debt marker found. |
| `site/app/prospector-app.tsx` | 31-48 | Static prospect/discovery arrays | ℹ Info | Explicitly labelled synthetic fixture data; no live data claim and consequential controls are disabled. |
| Version-10 review evidence | — | Latest independent CLEAN review predates security-sensitive version-10 changes | ⚠ Warning | Requires fresh independent review; routed to human verification rather than treated as evidence. |

### Human Verification Required

#### 1. Controlled second hosted principal and zero-delta proof

**Test:** Sign in to production as a controlled second real Sites principal, open the app, request `/api/interview` and `/api/capabilities`, attempt the fixed capability probe, then return to the owner session and inspect workspace/object/proof/audit counts.
**Expected:** Neutral denial everywhere, no private metadata, and zero new state of every listed type.
**Why human:** Only the real hosting boundary can assert the second identity.

#### 2. Authenticated hosted mutation protection

**Test:** Run the owner-proof harness with a locally supplied owner session and observe foreign-origin, missing-CSRF, malformed-body, one-time proof, replay, and durable reload outcomes.
**Expected:** 403/403/400/200/403 respectively; complete R2 lifecycle; identical durable timestamp/reference; no successful evidence from a rejected request.
**Why human:** The verifier must not obtain or persist the operator's authenticated session.

#### 3. Hosted secrets and log hygiene

**Test:** Inspect runtime binding status, deployed client bundle, responses, and fresh worker logs after success and error paths.
**Expected:** Bindings exist server-side; no value, raw cookie/token, owner identity, workspace/object identifier, payload bytes, lead/contact data, or export data appears in Git/client/responses/logs.
**Why human:** Control-plane configuration and hosted log contents are not available in the repository.

#### 4. Fresh independent version-10 red team

**Test:** Independent product and security reviewers assess commit `e74ed96`, Sites source `d6b3b619...`, saved version 10, and the deployed mutation/session/logging behavior.
**Expected:** CLEAN or no unresolved BLOCKER/HIGH finding, with a durable review artifact tied to the exact version.
**Why human:** Existing review evidence is tied to version 8 and cannot validate later security-sensitive changes.

### Gaps Summary

No observable implementation gap was found in the local Phase 1 boundary: source exists, is substantive, is wired, receives real D1/R2 data on its operational paths, and passes lint/build plus all 15 tests. The escalation gate remains open because the roadmap's controlled-hosted-proof contract is not fully auditable from this environment. The real second-principal/zero-delta check, authenticated hosted mutation run, control-plane secret/log inspection, and fresh version-10 independent red team must be completed before Phase 1 can be marked passed.

No item was deferred to a later roadmap phase: these checks are specific Phase 1 closure gates, even though later phases own scheduler, runner, Gmail, export, and restore implementation.

---

_Verified: 2026-07-30T16:03:18Z_
_Verifier: Claude (gsd-verifier)_
