# Phase 3: Product Readiness and Market Discovery - Research

**Researched:** 2026-07-30  
**Domain:** Immutable Product discovery configuration, governed scheduling, and bounded Market Play discovery  
**Confidence:** HIGH

## User Constraints

No Phase 3 `CONTEXT.md` exists. The following accepted constraints are binding for planning. [VERIFIED: `.planning/phases/02-consensus-knowledge-and-commercial-model/02-CONTEXT.md`, `docs/adr/0001-generic-company-product-play-model.md`, `docs/adr/0002-confirmed-knowledge-and-effective-configuration.md`, `docs/adr/0003-untrusted-runners-and-human-gates.md`]

### Locked Decisions

- Preserve `Company -> Product -> Market Play -> Customer Profile -> Offer`; Product owns reusable capability, limitation, delivery, proof, ownership, and Claim Guardrail knowledge. [VERIFIED: `02-CONTEXT.md`]
- A Product becomes Ready only after the required Product knowledge is explicitly Confirmed; readiness creates an immutable Product Discovery Configuration that has no Market Play, Customer Profile, or Offer dependency. [VERIFIED: ADR-0002; `docs/IMPLEMENTATION-SPEC.md` §§4-5]
- A discovery run produces Market Play Proposals, not Accounts, Targets, Signals, Candidates, Prospects, contact data, outreach, or external effects. [VERIFIED: `CONTEXT.md`; `docs/IMPLEMENTATION-SPEC.md` §12]
- An untrusted Runner may contribute sourced findings/status only; application code owns schema validation, configuration/state transitions, and authority. [VERIFIED: ADR-0003]
- Explore, Defer, and Dismiss are immutable owner decisions. Explore creates only a Draft Market Play and opens a Draft interview; it never makes a Profile Ready or starts prospecting. [VERIFIED: `docs/IMPLEMENTATION-SPEC.md` §12; `.planning/ROADMAP.md`]
- Every discovery trigger surfaces at most three proposals. Proposal identity is Product + normalized market category + normalized audience + normalized problem family. [VERIFIED: `docs/IMPLEMENTATION-SPEC.md` §12]
- The hosted scheduler and Runner callback remain unproven. No provider credential, live runner, web retrieval, external activation, lead/contact import, or prospecting may be enabled without a separate accepted capability gate. [VERIFIED: `docs/WAVE-0-CAPABILITY-REPORT.md`; ADR-0003]

### Claude's Discretion

- Choose additive D1 table normalization, repository boundaries, UI composition, and the exact readiness question wording while preserving immutable snapshots, owner admission, CSRF/idempotency, audit, and fail-closed authority controls. [VERIFIED: `02-CONTEXT.md`]
- Use deterministic, local synthetic discovery submissions to prove replay and proposal logic before any real Runner or retrieval capability is separately authorized. [ASSUMED]

### Deferred Ideas (OUT OF SCOPE)

- Profile readiness, Runner assignments/connections, evidence qualification, Accounts, Targets, Signals, Candidates, Prospects, and recurring prospecting belong to Phase 4. [VERIFIED: `02-CONTEXT.md`; `.planning/ROADMAP.md`]
- Contact enrichment, Gmail, calling, suppression execution, CRM export, and restore remain in Phases 5-7. [VERIFIED: `02-CONTEXT.md`; `.planning/ROADMAP.md`]

## Phase Requirements

| ID | Description | Research support |
|---|---|---|
| REQ-product-readiness | Confirm complete Product knowledge before Ready; create immutable configuration plus initial/manual/monthly discovery without placeholder descendants. [VERIFIED: `.planning/REQUIREMENTS.md`] | Readiness guard, immutable manifest/digest, transactional initial-run/schedule records, and capability-gated execution. [VERIFIED: `docs/IMPLEMENTATION-SPEC.md` §§4-5,7] |
| REQ-market-discovery | Present at most three evidence-backed proposals per trigger and record Explore/Defer/Dismiss without automatic prospecting. [VERIFIED: `.planning/REQUIREMENTS.md`] | Immutable proposal/version/decision model, deterministic fingerprint/cooldown/reopen logic, and owner-only decision handler. [VERIFIED: `docs/IMPLEMENTATION-SPEC.md` §12] |

## Summary

Phase 3 should add a Product-level authority boundary, not a generic automation feature. The server evaluates readiness from the exact required Confirmed Knowledge versions, presents every missing item, and atomically appends a canonically serialized Product Discovery Configuration, an idempotent initial `market_discovery` run, schedule intent, and audit event. [VERIFIED: `docs/IMPLEMENTATION-SPEC.md` §§4-5] The configuration must be self-contained and replayable: a later edit creates a proposed replacement rather than changing an existing run's governing snapshot. [VERIFIED: ADR-0002; `docs/IMPLEMENTATION-SPEC.md` §4]

Discovery output must remain a bounded, evidence-backed suggestion layer. The application receives schema-validated finding submissions, deduplicates by the required Product/market/audience/problem fingerprint, and exposes no more than three surfaced proposals for each initial, manual, monthly, or material-change trigger. [VERIFIED: `docs/IMPLEMENTATION-SPEC.md` §§7,12; `.planning/ROADMAP.md`] A proposal is not an accepted customer profile: it is a Product-fit hypothesis with evidence and must stay visibly distinct from already configured Market Plays and Customer Profiles. [VERIFIED: `CONTEXT.md`; ADR-0001]

The current private pilot has no proven hosted scheduler or Runner callback. Therefore planning must split durable, fully testable schedule/run/proposal persistence from a separate human-controlled execution-capability gate. Until that gate is accepted, manual/monthly/initial work may be queued and displayed as blocked or exercised only by local synthetic test seams; it must not retrieve public URLs, call a model/provider, or create operational records. [VERIFIED: `docs/WAVE-0-CAPABILITY-REPORT.md`; ADR-0003] 

**Primary recommendation:** Implement local, replayable Product readiness and proposal-decision authority now; make all real scheduled/Runner execution a later explicit gate with a zero-effect default. [VERIFIED: phase boundary and capability report]

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|---|---|---|---|
| Readiness checklist and immutable configuration | API / Backend | Database / Storage | The server derives scope from the admitted workspace and must atomically persist revisions, manifest, command guard, run intent, schedule intent, and audit evidence. [VERIFIED: `docs/IMPLEMENTATION-SPEC.md` §5; Cloudflare D1 batch docs] |
| Monthly trigger dispatch | API / Backend | Database / Storage | A scheduler may invoke a Worker, but the application owns slot-key idempotency, owner/configuration validation, and run creation. [VERIFIED: `docs/IMPLEMENTATION-SPEC.md` §7; Cloudflare Cron Trigger docs] |
| Discovery finding ingestion | API / Backend | Database / Storage | Runners are untrusted and can submit findings/status only; application code validates schema, provenance, cap, and state. [VERIFIED: ADR-0003; `docs/IMPLEMENTATION-SPEC.md` §8] |
| Proposal review and cooldown | API / Backend | Database / Storage | Only the owner can make immutable Explore/Defer/Dismiss decisions and create the Draft Play/interview effect. [VERIFIED: `docs/IMPLEMENTATION-SPEC.md` §12] |
| Readiness/proposal UI | Browser / Client | Frontend Server (SSR) | The UI is a typed read model and dispatches owner actions; it must never compute authority, digest, scope, or lifecycle locally. [VERIFIED: `02-CONTEXT.md`; established handler pattern] |

## Standard Stack

### Core

| Library / service | Version | Purpose | Why standard |
|---|---:|---|---|
| Existing D1 + Drizzle schema/migrations | existing project stack | Immutable configuration/run/proposal/decision records and transactional guards. [VERIFIED: `site/package.json`; `site/db/schema.ts`] | Preserves the established pilot persistence pattern and D1 supports prepared statements and transactional batches. [CITED: https://developers.cloudflare.com/d1/worker-api/prepared-statements/; https://developers.cloudflare.com/d1/worker-api/d1-database/] |
| Existing Node test runner + Miniflare | existing project stack | D1 migration, handler, race, and zero-effect integration tests. [VERIFIED: `site/package.json`; `site/tests/helpers/d1.mjs`] | Existing tests already build isolated D1 fixtures directly. [VERIFIED: `site/tests/helpers/d1.mjs`] |
| Existing private Worker/Sites route boundary | existing project stack | Owner admission, bounded JSON, CSRF, same-origin mutation checks, neutral denials. [VERIFIED: `site/domain/interview-handler.ts`; `site/domain/request-security.ts`] | Reuses the tested authority boundary rather than adding a client-trusted discovery path. [VERIFIED: `02-CONTEXT.md`] |

### Supporting

| Library / service | Purpose | When to use |
|---|---|---|
| Cloudflare Cron Trigger `scheduled()` handler | Invokes the dispatch scan on UTC cron cadence. [CITED: https://developers.cloudflare.com/workers/configuration/cron-triggers/] | Only after a separate hosted scheduler capability proof and exact deployment review; it is not an authority mechanism. [VERIFIED: `docs/WAVE-0-CAPABILITY-REPORT.md`; `docs/IMPLEMENTATION-SPEC.md` §7] |
| Synthetic discovery executor test seam | Supplies fixed, local, schema-valid discovery findings without network/provider access. [ASSUMED] | Use for Phase 3 replay/concurrency validation while Runner/retrieval gates remain closed. [VERIFIED: ADR-0003; `docs/WAVE-0-CAPABILITY-REPORT.md`] |

### Alternatives Considered

| Instead of | Could use | Tradeoff |
|---|---|---|
| Durable queued run + separate execution gate | Calling a model/search provider inside the readiness/manual request | Direct execution would bypass the currently unproven scheduler/Runner capability boundary and risks external activation. [VERIFIED: `docs/WAVE-0-CAPABILITY-REPORT.md`; ADR-0003] |
| Immutable Product Discovery Configuration | Re-reading mutable current Product settings when a run starts | Historical replay would no longer reproduce the governing policy. [VERIFIED: ADR-0002; `docs/IMPLEMENTATION-SPEC.md` §4] |
| Proposal fingerprint plus material-evidence reopen | Free-form proposal title matching | Title matching cannot enforce deterministic deduplication/cooldown or preserve lineage. [VERIFIED: `docs/IMPLEMENTATION-SPEC.md` §12] |

**Installation:** No external package installation is recommended for Phase 3. [VERIFIED: existing project stack and phase scope]

## Architecture Patterns

### System Architecture Diagram

```text
Confirmed Product knowledge + active capability gate
                    |
                    v
      server readiness evaluator (all missing items)
                    |
          owner Ready command + expected revision
                    v
 D1 transaction: immutable manifest/digest -> config -> initial run -> monthly schedule -> audit
                    |                                           |
                    |                                           v
                    |                           capability-gated dispatcher
                    |                               |             |
                    |                               | blocked     | proven only
                    |                               v             v
                    |                         visible status  untrusted finding submission
                    |                                             |
                    v                                             v
 read-only readiness UI                         schema/provenance/cap/fingerprint validation
                                                              |
                                                              v
                                      <= 3 surfaced immutable Market Play proposals
                                                              |
                            owner Explore / Defer / Dismiss decision + audit
                               |                 |                 |
                               v                 v                 v
                   Draft Play + interview   review date      cooldown date
                   (never Profile/Prospect)  (no effects)      (no effects)
```

### Recommended Project Structure

```text
site/
├── db/schema.ts                         # additive typed records and indexes
├── drizzle/0005_product_discovery.sql   # additive migration after 0004
├── domain/product-readiness.ts           # pure checklist/manifest/command
├── domain/market-discovery.ts            # run, finding, proposal, decision logic
├── domain/market-discovery-handler.ts    # admitted owner/runner ingress boundary
├── worker/index.ts                       # narrow scheduled dispatch wiring
├── app/discovery/discovery-workspace.tsx # transport owner/read-model composition
└── tests/{product-readiness,market-discovery,market-discovery-handler,discovery-ui}.test.mjs
```

### Pattern 1: Server-derived readiness manifest and transaction-failing guard

Evaluate a fixed Product checklist from Confirmed Knowledge versions on the server; return the entire missing set for GET/read-only UI. A Ready command receives only product ID, expected revision, and idempotency key. The server constructs the canonical manifest in fixed field order, hashes it, and uses a command-guard row plus D1 batch so stale/missing prerequisites roll back the configuration, initial run, schedule, and audit together. [VERIFIED: `docs/IMPLEMENTATION-SPEC.md` §§4-5; `02-RESEARCH.md` Pattern 2] D1 documents that a failing statement in a batch rolls back the sequence. [CITED: https://developers.cloudflare.com/d1/worker-api/d1-database/]

```typescript
// Source: project authority pattern adapted to Product readiness.
const manifest = buildCanonicalProductDiscoveryManifest(confirmedVersions);
const digest = sha256(canonicalJson(manifest));
await db.batch([
  insertReadinessCommandGuard(productId, expectedRevision, idempotencyKey, digest),
  insertImmutableProductDiscoveryConfig(configId, productId, manifest, digest),
  insertInitialRun(`initial:product:${productId}:${configId}`, configId),
  insertMonthlySchedule(productId, configId),
  insertAuditEvent("product.ready", configId, digest),
]);
```

### Pattern 2: Durable intent separated from execution authority

Persist initial/manual/monthly run intent before attempting dispatch. A dispatcher claims only one eligible slot using the exact run type, Product ID, intended local instant, and timezone offset; it revalidates Product lifecycle, active configuration, capability evidence, and any cancellation before execution. [VERIFIED: `docs/IMPLEMENTATION-SPEC.md` §§5,7] If the capability is absent/unproven, transition only to a visible blocked/needs-attention outcome and record no provider/retrieval attempt. [VERIFIED: `docs/WAVE-0-CAPABILITY-REPORT.md`; ADR-0003]

Cloudflare Cron Triggers run in UTC, so a monthly Product policy requiring local-calendar semantics must be converted by application scheduling logic and its intended local instant/offset persisted in the slot key. [CITED: https://developers.cloudflare.com/workers/configuration/cron-triggers/] This conversion rule is necessary for this Product schedule and should receive explicit DST tests. [ASSUMED]

### Pattern 3: Proposal version versus accepted market configuration

Store a stable proposal identity, immutable evidence-backed versions, and immutable owner decisions separately. The read model distinguishes `Market Play Proposal` from an existing `Market Play` and from Customer Profiles. [VERIFIED: `CONTEXT.md`; `docs/IMPLEMENTATION-SPEC.md` §12] Explore atomically creates/reuses the Draft Market Play and opens its Draft interview; it must assert zero creation of Profile, Account, Target, Signal, Candidate, Prospect, contact, schedule, or external-effect rows. [VERIFIED: `.planning/ROADMAP.md`; Phase 3 boundary]

### Pattern 4: Deterministic cap, collision, and cooldown evaluation

Normalize the Product/fingerprint fields once, select candidates in a stable documented order, and persist the selected set or its selection digest for each trigger. Enforce a unique active proposal fingerprint per Product, let losing concurrent inserts append evidence to the winner, and apply the cap after existing-open/cooldown eligibility is considered. [VERIFIED: `docs/IMPLEMENTATION-SPEC.md` §12] Defer records a reason and review date (default 90 days); Dismiss records a reason and 180-day cooldown; early reopen requires a different material-evidence fingerprint that changes problem match, audience, Product fit, or risk—not repetition/republication. [VERIFIED: `docs/IMPLEMENTATION-SPEC.md` §12]

## Don't Hand-Roll

| Problem | Don't build | Use instead | Why |
|---|---|---|---|
| Multi-record readiness mutation | Sequential writes with compensating cleanup | D1 prepared statements inside a `batch()` plus a persisted command guard. [CITED: https://developers.cloudflare.com/d1/worker-api/d1-database/; https://developers.cloudflare.com/d1/worker-api/prepared-statements/] | A stale readiness command must not leave a Ready Product with only some of its configuration/run/schedule/audit records. [VERIFIED: `docs/IMPLEMENTATION-SPEC.md` §5] |
| Authentication/CSRF/request validation | Discovery-specific browser trust checks | Existing admitted-principal, same-origin, bounded-JSON, one-time CSRF handler pattern. [VERIFIED: `site/domain/interview-handler.ts`; `site/domain/request-security.ts`] | Authority derives from server identity and exact request semantics, not client IDs or UI state. [VERIFIED: `02-CONTEXT.md`] |
| Real-time provider invocation | Ad hoc fetch/model call in API handler | Capability-gated runner port with local synthetic executor until accepted proof. [VERIFIED: ADR-0003; `docs/WAVE-0-CAPABILITY-REPORT.md`] | The actual runner/scheduler capability is not yet proven; a convenient call would violate the pilot boundary. [VERIFIED: `docs/WAVE-0-CAPABILITY-REPORT.md`] |

## Common Pitfalls

### Pitfall 1: Ready transition succeeds without every durable side effect

**What goes wrong:** a Product becomes `ready` before configuration, initial run, monthly schedule, or audit persistence succeeds. [VERIFIED: `docs/IMPLEMENTATION-SPEC.md` §5]  
**How to avoid:** make all readiness writes one D1 transaction behind expected revision/idempotency and test zero partial rows on every injected failure. [CITED: https://developers.cloudflare.com/d1/worker-api/d1-database/]  
**Warning signs:** a `ready` Product has no active Product Discovery Configuration, exactly-one initial run, or schedule intent. [VERIFIED: `.planning/ROADMAP.md`; `docs/IMPLEMENTATION-SPEC.md` §5]

### Pitfall 2: Queueing treated as authorization to execute

**What goes wrong:** initial/manual/monthly run creation causes a public fetch, model call, or runner credential use. [VERIFIED: `docs/WAVE-0-CAPABILITY-REPORT.md`; ADR-0003]  
**How to avoid:** execution rechecks an explicit capability gate and records blocked status with zero external-attempt audit when unavailable. [VERIFIED: `docs/WAVE-0-CAPABILITY-REPORT.md`]  
**Warning signs:** a local readiness test needs network credentials or a manual button creates a Runner assignment/provider request. [VERIFIED: Phase 3 boundary]

### Pitfall 3: Proposal output promoted into an accepted customer profile

**What goes wrong:** a suggestion is rendered or stored as a configured Customer Profile, or Explore activates prospecting. [VERIFIED: `CONTEXT.md`; `.planning/ROADMAP.md`]  
**How to avoid:** name and type the output `Market Play Proposal`; Explore only creates/reuses a Draft Play and starts its interview. [VERIFIED: `docs/IMPLEMENTATION-SPEC.md` §12]  
**Warning signs:** an Explore test sees `profiles`, `prospects`, `accounts`, `signals`, `contacts`, or a prospecting schedule delta. [VERIFIED: phase boundary]

### Pitfall 4: Cap/cooldown bypassed by trigger type or concurrency

**What goes wrong:** manual, material-change, and monthly paths use different selection logic, or simultaneous runners create duplicate active proposals. [VERIFIED: `docs/RED-TEAM-TRIAGE-ROUND-3.md`; `docs/IMPLEMENTATION-SPEC.md` §12]  
**How to avoid:** use one normalized trigger pipeline, Product+fingerprint uniqueness, and deterministic selection persistence. [VERIFIED: `docs/IMPLEMENTATION-SPEC.md` §12]  
**Warning signs:** more than three newly surfaced proposals for one trigger or duplicate active proposal fingerprints. [VERIFIED: `.planning/ROADMAP.md`; `docs/IMPLEMENTATION-SPEC.md` §12]

## Environment Availability

| Dependency | Required by | Available | Version | Fallback |
|---|---|---|---|---|
| Node.js/npm + current local test stack | schema/domain/UI validation | ✓ | project declares Node `>=22.13.0`; existing Node/Miniflare tests are present. [VERIFIED: `site/package.json`; `site/tests/`] | — |
| D1/Miniflare local fixture | transaction/migration/race validation | ✓ | Miniflare is a project dev dependency. [VERIFIED: `site/package.json`; `site/tests/helpers/d1.mjs`] | — |
| Hosted idempotent scheduler | actual initial/monthly dispatch | ✗ unproven | no hosted proof. [VERIFIED: `docs/WAVE-0-CAPABILITY-REPORT.md`] | Persist intent; remain blocked; exercise only local synthetic seams. [ASSUMED] |
| Runner callback / provider adapter | actual discovery research execution | ✗ unproven | no implementation/proof. [VERIFIED: `docs/WAVE-0-CAPABILITY-REPORT.md`] | No external execution; local synthetic submissions for tests only. [ASSUMED] |
| Safe source retrieval service | public web evidence retrieval | ✗ not authorized/proven | retrieval contract exists but no authorized runtime capability. [VERIFIED: `docs/IMPLEMENTATION-SPEC.md` §8; `docs/WAVE-0-CAPABILITY-REPORT.md`] | Use repository/local synthetic evidence in tests; do not crawl. [VERIFIED: Phase 2 research boundary] |

**Missing dependencies with no fallback:** Hosted scheduler, Runner callback/provider, and safe retrieval cannot be substituted for production discovery; each requires an explicit capability gate before activation. [VERIFIED: `docs/WAVE-0-CAPABILITY-REPORT.md`; ADR-0003]

## Validation Architecture

### Test Framework

| Property | Value |
|---|---|
| Framework | Node.js built-in test runner with Miniflare D1 integration. [VERIFIED: `site/package.json`; `site/tests/helpers/d1.mjs`] |
| Config file | none; `site/tests/*.test.mjs` construct Vite/Miniflare directly. [VERIFIED: `site/tests/helpers/d1.mjs`] |
| Quick run command | `cd site && npm test` (build plus all tests). [VERIFIED: `site/package.json`] |
| Full suite command | `cd site && npm test && npm run lint && npm run build`. [VERIFIED: `site/package.json`] |

### Phase Requirements → Test Map

| Req ID | Behavior | Test type | Automated command | File exists? |
|---|---|---|---|---|
| REQ-product-readiness | all-missing checklist, immutable manifest, atomic Ready/config/run/schedule/audit, replacement/material-change replay/races, old-schema denial | D1 integration + concurrency | `cd site && node --test tests/product-readiness-repository.test.mjs` | ❌ Wave 0 |
| REQ-product-readiness | manual/initial/monthly requests cannot execute externally without proven gate | handler + zero-effect integration | `cd site && node --test tests/discovery-handler-ui.test.mjs` | ❌ Wave 0 |
| REQ-market-discovery | schema/provenance validation, fixed synthetic proof gate, per-trigger cap, fingerprint dedup/version lineage, replay and concurrent submissions | D1 integration + concurrency | `cd site && node --test tests/market-discovery-repository.test.mjs` | ❌ Wave 0 |
| REQ-market-discovery | Explore/Defer/Dismiss history, cooldown/material reopen, Draft-only Explore and no prospecting/profile effects | D1 integration + zero-delta manifest | `cd site && node --test tests/market-discovery-repository.test.mjs` | ❌ Wave 0 |
| both | admitted owner, CSRF, bounded body, unknown action, stale revision/idempotency, neutral denial, navigation/picker boundaries | handler/render integration | `cd site && node --test tests/discovery-handler-ui.test.mjs` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** focused relevant test, then `cd site && npm test`. [VERIFIED: existing test command]
- **Per wave merge:** `cd site && npm test && npm run lint`. [VERIFIED: existing scripts]
- **Phase gate:** full suite green plus accepted capability proof before any hosted scheduler/Runner/retrieval execution. [VERIFIED: `docs/WAVE-0-CAPABILITY-REPORT.md`]

### Wave 0 Gaps

- [ ] `site/tests/product-readiness-repository.test.mjs` — readiness, configuration digest, transaction rollback, exact one initial run/schedule, and material-change replacement activation. [ASSUMED]
- [ ] `site/tests/market-discovery-repository.test.mjs` — fixed synthetic proof, cap/dedup/cooldown/decision/concurrency and forbidden-table deltas. [ASSUMED]
- [ ] `site/tests/discovery-handler-ui.test.mjs` — admission/CSRF/request/capability-gate/submission, unmet checklist, navigation/picker, capability-blocked status, proposal evidence, and Draft-only Explore state. [ASSUMED]
- [ ] Extend `site/tests/helpers/d1.mjs` with the exact 0000-0005 chain and a Phase 3 forbidden operational-effect manifest. [ASSUMED]

## Security Domain

### Applicable ASVS Categories

| ASVS category | Applies | Standard control |
|---|---|---|
| V2 Authentication | yes | Reuse server-side pilot-owner admission; do not accept owner/workspace from the client. [VERIFIED: `site/domain/interview-handler.ts`; `site/domain/pilot-access.ts`] |
| V3 Session Management | yes | One-time, expiring, owner-bound CSRF token plus same-origin mutation checks. [VERIFIED: `site/domain/interview-handler.ts`; `site/domain/csrf.ts`] |
| V4 Access Control | yes | Server-derived workspace/Product scope, expected revision, immutable command guard, and owner-only decisions. [VERIFIED: `02-CONTEXT.md`; `docs/IMPLEMENTATION-SPEC.md` §§5,12] |
| V5 Input Validation | yes | Bounded JSON, strict discriminated actions/submission schemas, reject unknown authority-bearing fields, validate provenance references. [VERIFIED: `site/domain/request-security.ts`; `docs/IMPLEMENTATION-SPEC.md` §8] |
| V6 Cryptography | yes | Canonical JSON plus SHA-256 digest for immutable manifests/proposal evidence snapshots; never hand-roll a hash. [VERIFIED: ADR-0002; `docs/IMPLEMENTATION-SPEC.md` §§4,12] |

### Known Threat Patterns

| Pattern | STRIDE | Standard mitigation |
|---|---|---|
| Stale/two-tab readiness or decision command | Tampering | expected revision, idempotency digest, database guard, unique indexes, and visible conflict. [VERIFIED: `docs/IMPLEMENTATION-SPEC.md` §§5,12] |
| Runner submits fabricated/oversized/authority-bearing output | Tampering / Elevation | untrusted strict schema, bounded values, server-calculated fingerprint/cap/state, and no runner transition authority. [VERIFIED: ADR-0003; `docs/IMPLEMENTATION-SPEC.md` §8] |
| Queued work causes unapproved provider/network effect | Elevation / Repudiation | capability-gated dispatcher with an explicit blocked status and zero-attempt audit; no provider credentials in source/D1. [VERIFIED: `docs/WAVE-0-CAPABILITY-REPORT.md`] |
| Prompt-injection or SSRF through market evidence | Tampering / Information disclosure | do not add retrieval before the full URL/address-pinning/redirect/content containment contract is proven; source text is data, not instructions. [VERIFIED: `docs/IMPLEMENTATION-SPEC.md` §8; ADR-0003] |
| Proposal becomes accepted profile/prospect by UI or backend shortcut | Elevation | typed Proposal records and zero-delta assertions; Explore creates Draft Play/interview only. [VERIFIED: `docs/IMPLEMENTATION-SPEC.md` §12; `.planning/ROADMAP.md`] |

## Assumptions Log

| # | Claim | Section | Risk if wrong |
|---|---|---|---|
| A1 | A local synthetic discovery executor/submission seam is acceptable while external execution capability remains closed. | User Constraints / Standard Stack | Planning may need a different non-network test seam, but no external activation should occur. |
| A2 | The application must convert monthly local-calendar policy to persisted local instant/offset because Cloudflare cron is UTC. | Architecture Pattern 2 | Monthly cadence could be wrong around time zones/DST if the locked Product discovery policy specifies a different convention. |
| A3 | New focused test filenames listed in Wave 0 are appropriate module boundaries. | Validation Architecture | Planner may choose different file decomposition while preserving coverage. |

## Resolved Capability Authority

1. **RESOLVED — accepted Phase 3 hosted capability is `private-hosted-synthetic-proposal-proof`, owned by the admitted private-workspace owner.**
   - **Accepted capability and release gate:** After the owner accepts exact source revision/migration identity and green local Phase 3 evidence, the existing Phase 3 private-proof capability gate may admit only the fixed, repository-defined non-network synthetic proposal fixture through the owner-only `submit_private_synthetic_proof` command. The scope is one authorized Product/workspace, fixed fixture digest/provenance, bounded proposal review, and its audit/idempotency replay. It is not production Market Discovery execution and cannot authorize arbitrary content or transport.
   - **Required evidence artifacts:** accepted Phase 2 authority reference; owner authorization naming the capability, Product/workspace, exact source revision/migration, fixture digest/provenance, and review/expiry reference; green local `test:phase3` output; deployed source/migration identity; synthetic submission audit/configuration/run/proposal IDs; idempotency replay observation; and sanitized zero-effect evidence/log references.
   - **Capabilities still blocked:** scheduler dispatch, Cron configuration, Runner ingress/callback, web retrieval, model/search/provider calls or credentials, arbitrary external submissions, paid effects, Profile/prospecting activation, contacts, exports, messages, and outbound work. Each needs its own separately accepted future capability proof; no Phase 3 artifact substitutes for it.
   - **Why this resolves the gate:** it supplies an executable owner review proof without pretending that a queued run, cron row, hosted deployment, or fixture can prove external execution authority. [VERIFIED: ADR-0003; `docs/WAVE-0-CAPABILITY-REPORT.md`; D-13]

## Open Questions

2. **RESOLVED — runtime owner confirmation and readiness category mapping.**
   - Runtime owner confirmation occurs through the existing owner-scoped Consensus Interview, followed by the controlled server activation that derives and persists the immutable private synthetic-proof authorization record; no seed values, direct D1 edits, or invented Product facts are permitted. [VERIFIED: `02-CONTEXT.md`; ADR-0002]
   - `evaluateProductReadiness` consumes the existing Consensus Interview's Confirmed Product knowledge categories: capability, limitation, delivery, proof, ownership, claim guardrail, source policy, discovery policy, and default-runner policy. Missing categories remain visibly unmet; their values are supplied only by confirmed interview knowledge. [VERIFIED: `.planning/ROADMAP.md`; `02-CONTEXT.md`]

## Sources

### Primary (HIGH confidence)

- [ADR-0002](/Users/stevensmith/.codex/worktrees/a6df/PROspector/docs/adr/0002-confirmed-knowledge-and-effective-configuration.md) — immutable Product Discovery Configuration and confirmed knowledge authority.
- [ADR-0003](/Users/stevensmith/.codex/worktrees/a6df/PROspector/docs/adr/0003-untrusted-runners-and-human-gates.md) — runner boundary and human gates.
- [Implementation Specification](/Users/stevensmith/.codex/worktrees/a6df/PROspector/docs/IMPLEMENTATION-SPEC.md) — readiness, run/schedule, ingestion, and proposal contracts.
- [Capability Report](/Users/stevensmith/.codex/worktrees/a6df/PROspector/docs/WAVE-0-CAPABILITY-REPORT.md) — currently unproven hosted capabilities.
- [Cloudflare D1 batch documentation](https://developers.cloudflare.com/d1/worker-api/d1-database/) — transaction behavior.
- [Cloudflare Cron Trigger documentation](https://developers.cloudflare.com/workers/configuration/cron-triggers/) — scheduled handler and UTC behavior.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — existing project stack plus current official D1/Workers docs.
- Architecture: HIGH — accepted ADR/spec contracts prescribe the core model.
- Pitfalls: HIGH — directly derived from accepted adversarial triage and capability report.

**Research date:** 2026-07-30  
**Valid until:** 2026-08-06, because hosted provider capabilities are fast-changing and currently unproven. [VERIFIED: `docs/WAVE-0-CAPABILITY-REPORT.md`]
