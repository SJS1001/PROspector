# Phase 2: Consensus Knowledge and Commercial Model - Research

**Researched:** 2026-07-30  
**Domain:** D1-backed commercial hierarchy, immutable knowledge decisions, concurrency-safe interview state, dependency-scoped drift  
**Confidence:** HIGH for architecture and existing-stack patterns; MEDIUM for upload activation because no approved content scanner is available. [VERIFIED: codebase and official documentation]

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

Deliver the authoritative commercial hierarchy and the complete research-first Consensus Interview/knowledge-drift workflow. This phase owns Company, Product, Market Play, Customer Profile, Offer, Company-wide Organization/Contact identity, scoped commercial relationships, Proposed and Confirmed Knowledge, immutable decisions, replacement configuration impact, and concurrency-safe interview behavior. It does not activate Product discovery, prospecting, enrichment, Gmail, calling, exports, or external Runner work.

#### Commercial Hierarchy and Scope
- Preserve `Company -> Product -> Market Play -> Customer Profile -> Offer` exactly.
- Product owns reusable capability, limitation, delivery, proof, ownership, and claim-guardrail truth; Market Play owns market/problem/audience/language/evidence/offer context; Customer Profile owns fit, disqualifiers, roles, signals, rubric, proof/contact/outreach policy, schedule, timezone, and output target.
- Organization and Contact identities are unique Company-wide. Account, Target, relevance, evidence, qualification, and outreach associations are Market Play/Profile scoped.
- ONE for Mining and ONE for Marine are separate Market Plays while they share ONE's capability/delivery/roadmap; divergence in those fundamentals requires a separate Product.

#### Consensus Interview and Concurrency
- Research public and uploaded material before asking; present one decision-bearing question at a time with facts and source references, labelled inference, a recommendation, and prerequisite knowledge versions.
- Answer submission and confirmation remain separate immutable steps. Confirmation actions are Accept, Reject, Correct, and Rescope against exact answer/proposal/prerequisite digests.
- At most one Active question exists per session. Expected revisions, idempotency keys, immutable snapshots, and transactional uniqueness make reloads/retries converge and make stale or concurrent conflicts visible.
- Accept, Correct, and Rescope append Knowledge Versions; no action overwrites confirmed truth. Superseded questions and unconfirmed answers retain lineage and audit history.

#### Proposed Knowledge, Imports, and Reuse
- Uploads, imports, research, edits, and reusable knowledge always enter as Proposed Knowledge with provenance, source/custody, privacy, licensing, and destination scope.
- Proposal review and promotion are separate owner actions. Phase 2 promotion may create knowledge/hierarchy authority only; it cannot create Runs, Accounts, Signals, Contacts, Candidates, or Prospects.
- Reuse order is same-Company confirmed knowledge, same-Product knowledge, then explicitly allowlisted cross-Company packages. Every destination requires confirmation.
- Cross-Company reuse excludes contacts, prospects, outreach, suppression, secrets, and unapproved private sources and preserves provenance/licensing.

#### Drift and Replacement Authority
- Differences from confirmed state create Knowledge Drift with an explicit dependency graph: source -> knowledge version -> typed configuration -> affected artifact.
- High-risk drift covers capability, proof point, claim guardrail, offer, or suppression and pauses only dependency-reached outbound artifacts.
- Accepted changes to Ready entities never mutate active configurations. The owner receives an impact preview and activates an immutable replacement in a separate transaction.
- Replacement activation preserves history, rolls future schedules, keeps in-flight results as historical proposals, requalifies only affected unreviewed prospects, invalidates dependent approvals/packages/messages, and requires explicit reactivation where necessary.

### Claude's Discretion
- Exact table normalization, repository module boundaries, UI component decomposition, pagination, and copy may follow current D1/React patterns as long as the locked state, scope, audit, concurrency, and authority contracts remain exact.

### Deferred Ideas (OUT OF SCOPE)
- Product readiness and Market Discovery activation belong to Phase 3.
- Profile readiness, schedules, Runner assignments, evidence qualification, and Accounts/Prospects belong to Phase 4.
- Contact enrichment, outbound, suppression, CSV handoff, and workspace restore remain in Phases 5–7.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REQ-commercial-hierarchy | The operator can represent `Company -> Product -> Market Play -> Customer Profile -> Offer`, with Company-wide Organization/Contact identity and Market Play-specific Account, Target, relevance, evidence, qualification, and outreach state. | Use a normalized, foreign-keyed hierarchy; add Company-wide identity tables and scoped relationship tables with no Phase 2 operational write API. [VERIFIED: `.planning/REQUIREMENTS.md`, `02-CONTEXT.md`, ADR-0001] |
| REQ-consensus-interview | The operator can complete a research-first, one-question-at-a-time Consensus Interview that visibly separates evidence, inference, recommendation, and confirmed knowledge and records explicit confirmation, correction, rejection, or rescoping. | Generalize the existing Phase 1 state machine, preserve immutable snapshots, add all four decision paths, prerequisite/source joins, database uniqueness, and explicit stale/conflict projections. [VERIFIED: `site/domain/interview.ts`, `02-UI-SPEC.md`, `docs/IMPLEMENTATION-SPEC.md`] |
| REQ-versioned-knowledge-and-drift | The operator can review Proposed Knowledge and drift without mutating Confirmed Knowledge or active typed configurations in place; replacement activation preserves snapshots, invalidates affected approvals, and pauses only dependency-reached high-risk outbound. | Introduce stable knowledge items, immutable proposals/versions/decisions, explicit configuration dependency joins, persisted impact snapshots, and separate candidate/activation transactions. [VERIFIED: ADR-0002, `02-CONTEXT.md`, `docs/IMPLEMENTATION-SPEC.md`] |
</phase_requirements>

## Summary

Phase 2 should be planned as an authority-model expansion, not as a UI-only expansion of the historian question. Phase 1 already proves the essential outer shell: owner admission, neutral denial, bounded same-origin mutations, one-time CSRF, D1 persistence, idempotency digests, immutable answer snapshots, audit events, and race tests. [VERIFIED: `site/domain/interview.ts`, `site/domain/interview-handler.ts`, `site/tests/interview-*.test.mjs`] The missing work is to normalize the commercial aggregate, make proposals/provenance/decisions first-class, generalize the interview to all four confirmation outcomes, and record dependency edges and replacement impact without enabling downstream operations. [VERIFIED: `site/db/schema.ts`, `02-CONTEXT.md`]

The schema must enforce authority invariants rather than relying on client state or a read-before-write check. D1 `batch()` is transactional and rolls back the whole sequence when a statement fails, but a guarded `UPDATE ... WHERE revision = ?` that changes zero rows is not itself an SQL error. [CITED: https://developers.cloudflare.com/d1/worker-api/d1-database/#batch] Therefore each consequential operation should insert an expected-revision command/decision row and make subsequent writes depend on it through foreign keys and unique indexes, so a missing/stale guard or duplicate authority row fails the transaction. [VERIFIED: D1 semantics plus current concurrency pattern in `site/domain/interview.ts`]

The phase must remain inert operationally. No Phase 2 command may insert or mutate Runs, Accounts, Signals, Contacts, Candidates, Prospects, schedules, approvals, exports, spend grants, messages, or outbound state. [VERIFIED: `02-CONTEXT.md`] Identity and scoped-association tables may be established to satisfy the model, but Phase 2 routes expose no account/contact/prospect creation action and proposal promotion is restricted to hierarchy and knowledge authority. [VERIFIED: `02-CONTEXT.md`, `02-UI-SPEC.md`]

**Primary recommendation:** Build four vertical slices in dependency order: (1) additive schema/backfill plus authority-boundary tests, (2) authoritative commercial-model read/write projections, (3) generalized interview/proposal promotion with all concurrency cases, and (4) drift impact/replacement candidates plus the approved Knowledge UI. [VERIFIED: codebase dependency analysis]

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Commercial hierarchy and scope ownership | Database / Storage | API / Backend | D1 constraints own parentage and uniqueness; domain services validate allowed lifecycle and owner scope. [VERIFIED: ADR-0001; D1 constraints docs] |
| Company-wide identity and Market Play/Profile associations | Database / Storage | API / Backend | Canonical identity and scoped relationships are data invariants, while Phase 2 exposes read-only model projections for these future operational entities. [VERIFIED: `02-CONTEXT.md`, `02-UI-SPEC.md`] |
| Consensus Interview state machine | API / Backend | Database / Storage | Trusted domain code computes transitions and exact snapshots; D1 uniqueness and foreign keys make races converge. [VERIFIED: `site/domain/interview.ts`; D1 batch docs] |
| Evidence/inference/recommendation presentation | Browser / Client | API / Backend | The API returns separately typed fields; React renders semantic, escaped text without creating authority. [VERIFIED: `02-UI-SPEC.md`; React DOM docs] |
| Proposed/Confirmed Knowledge authority | Database / Storage | API / Backend | Immutable versions and owner decisions are authoritative; UI tabs are projections only. [VERIFIED: ADR-0002] |
| Drift evaluation and dependency traversal | API / Backend | Database / Storage | A pure domain evaluator traverses persisted source/version/configuration/artifact edges and stores a reproducible impact snapshot. [VERIFIED: `docs/DIRECTION.md`, ADR-0002] |
| Replacement candidate and activation | API / Backend | Database / Storage | Candidate creation and activation are separate owner commands; D1 atomically changes only the active pointer/status and audit/containment records. [VERIFIED: `02-CONTEXT.md`] |
| Uploaded object custody | Database / Storage | API / Backend | R2 stores opaque objects and D1 stores custody/digest metadata; unscanned objects remain quarantined and unusable as evidence. [VERIFIED: `docs/IMPLEMENTATION-SPEC.md` §8; `site/domain/ports/object-storage.ts`] |
| Operational effects | API / Backend | — | Phase 2 must expose no command that can start or authorize them. [VERIFIED: `02-CONTEXT.md`] |

## Standard Stack

### Core

| Library / Service | Version | Purpose | Why Standard Here |
|-------------------|---------|---------|-------------------|
| Next.js | 16.2.12 pinned | Route handlers and application shell | Already deployed; route files currently contain provider wiring only. [VERIFIED: `site/package.json`, `site/app/api/interview/route.ts`] |
| React / React DOM | 19.2.6 pinned | Knowledge workspace UI | Existing manual component system and approved UI contract require React/native semantic HTML, with no component library. [VERIFIED: `site/package.json`, `02-UI-SPEC.md`] |
| Cloudflare D1 | current Sites binding | Structured authority state | Existing hosted persistence boundary; `batch()` supplies ordered transactional statements and prepared binding. [CITED: https://developers.cloudflare.com/d1/worker-api/d1-database/#batch] |
| Drizzle ORM | 0.45.2 pinned | Schema declarations and generated migrations | Existing schema and migration history use Drizzle's SQLite APIs and `drizzle-kit generate`. [VERIFIED: `site/package.json`, `site/db/schema.ts`; CITED: https://orm.drizzle.team/docs/drizzle-kit-generate] |
| TypeScript | 5.9.3 pinned | Domain and UI types | Existing strict TypeScript configuration is the project convention. [VERIFIED: `site/package.json`, `site/tsconfig.json`] |
| Node test runner + Miniflare | Node 24.16.0 / Miniflare 4.20260515.0 | D1 integration, handler, and concurrency tests | Existing tests run real D1 behavior through Miniflare and the full suite passes. [VERIFIED: environment probe, `site/tests/interview-repository.test.mjs`, `npm test` on 2026-07-30] |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `uuid` [ASSUMED] | 14.0.1 | RFC 9562 UUIDv7 entity IDs | Use for newly created independent domain entities to satisfy the required UUIDv7 record contract; keep deterministic operation digests/idempotency as a separate concern. Slopcheck could not be installed, so planner must add a human-verification checkpoint before install. [CITED: https://github.com/uuidjs/uuid; VERIFIED: npm registry version only] |
| Web Crypto API | runtime built-in | SHA-256/HMAC digests | Continue the existing server-derived digest pattern for exact operation and snapshot semantics; do not trust client-provided digests. [VERIFIED: `site/domain/interview.ts`] |
| Existing R2 `ObjectStorePort` | deployed binding | Raw upload custody | Store only opaque quarantined uploads until an approved scanner has produced a passed safety record. [VERIFIED: `site/domain/ports/object-storage.ts`, `docs/IMPLEMENTATION-SPEC.md` §8] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Normalized D1 joins | A single JSON knowledge document | Rejected: it cannot enforce scope, one-current-version, source lineage, or dependency uniqueness and would require whole-document rewrites. [VERIFIED: ADR-0002 requirements] |
| D1 partial unique indexes and FKs | Application-only locks | Rejected: separate Workers/tabs cannot share an in-memory lock, while D1 supports unique and partial indexes. [CITED: https://developers.cloudflare.com/d1/best-practices/use-indexes/] |
| Existing manual React design system | shadcn or another component library | Rejected by the approved UI contract. [VERIFIED: `02-UI-SPEC.md`] |
| `uuid` [ASSUMED] | Hand-written UUIDv7 encoder | Rejected: identifier encoding and monotonic/random behavior should not become custom security-sensitive code. [CITED: https://github.com/uuidjs/uuid] |
| Relational dependency joins | A graph database | Rejected: this bounded directed graph is part of the existing D1 authority transaction and does not justify a new service boundary. [VERIFIED: ADR-0002 and current D1 architecture] |

**Installation (only after human package verification):**

```bash
npm install uuid@14.0.1
```

The rest of Phase 2 should add no package. [VERIFIED: existing stack covers UI, storage, cryptography, routing, and tests]

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | postinstall | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-------------|-----------|-------------|
| `uuid` [ASSUMED] | npm | Registry created 2011-03-31 | npm page reports about 228M weekly downloads | https://github.com/uuidjs/uuid | none returned by `npm view` | unavailable; installation failed in the restricted environment | Flagged — planner must add `checkpoint:human-verify` before install. [VERIFIED: npm registry metadata; CITED: https://www.npmjs.com/package/uuid] |

**Packages removed due to slopcheck `[SLOP]` verdict:** none; no verdict was available.  
**Packages flagged as suspicious `[SUS]`:** none by verdict; `uuid` remains `[ASSUMED]` solely because the mandatory verifier was unavailable.  
**Postinstall audit:** `npm view uuid scripts.postinstall` returned no script. [VERIFIED: npm registry]

## Architecture Patterns

### System Architecture Diagram

```text
Signed-in owner browser
  │ GET authoritative projection / POST explicit command
  ▼
Next route (provider wiring only)
  │ getChatGPTUser + D1/R2 bindings
  ▼
Secure handler
  ├─ neutral owner admission failure ───────────────► 404 no workspace data
  ├─ Origin / Fetch-Metadata / intent / JSON limit
  └─ consume one-time owner-bound CSRF token
       │ admitted principal + parsed command
       ▼
Domain service
  ├─ Commercial model aggregate
  ├─ Proposal / interview decision state machine
  ├─ Knowledge version append
  └─ Drift impact + replacement evaluator
       │ prepared statements + expected revision + operation digest
       ▼
D1 transactional batch
  ├─ command/decision guard (unique idempotency + exact digest)
  ├─ immutable snapshot / version / audit rows
  ├─ current pointer or lifecycle projection update
  └─ dependency edges / impact snapshot
       │
       ├─ conflict/zero authority ──────────────────► 409 authoritative reload
       └─ committed state ──────────────────────────► fresh no-store projection

Upload branch:
Browser ─► secure handler ─► R2 opaque object + D1 custody/digest proposal
                              └─ no approved scan ─► Quarantined; not evidence

Drift branch:
Source ─► Knowledge Version ─► Typed Configuration ─► Affected Artifact
             │                         │
             └─ accepted change ─► replacement candidate
                                        └─ separate activation transaction
                                           (never starts later-phase work)
```

This flow retains the existing trusted-handler/domain/storage boundaries and adds no autonomous or external-effect path. [VERIFIED: `site/domain/interview-handler.ts`, `02-CONTEXT.md`]

### Recommended Project Structure

```text
site/
├── app/
│   ├── api/
│   │   ├── interview/route.ts       # existing thin provider wiring
│   │   └── knowledge/route.ts       # hierarchy, proposal, drift commands/reads
│   ├── knowledge/
│   │   ├── knowledge-workspace.tsx  # local view navigation + scope path
│   │   ├── commercial-model.tsx
│   │   ├── consensus-interview.tsx
│   │   ├── knowledge-library.tsx
│   │   └── drift-replacements.tsx
│   └── prospector-app.tsx           # shell/navigation composition only
├── domain/
│   ├── commercial-model.ts           # hierarchy aggregate and seed
│   ├── knowledge.ts                  # proposal/decision/version authority
│   ├── interview.ts                  # extend existing state machine
│   ├── drift.ts                      # risk/dependency/impact pure functions
│   ├── replacement.ts                # candidate + activation commands
│   ├── knowledge-handler.ts          # reuse secure admission pattern
│   └── ports/object-storage.ts       # existing R2-neutral custody port
├── db/schema.ts                      # all constraints and indexes
├── drizzle/                          # additive generated/custom SQL
└── tests/
    ├── helpers/d1.mjs                # shared migration/fixture helper
    ├── commercial-model-repository.test.mjs
    ├── knowledge-repository.test.mjs
    ├── interview-repository.test.mjs
    ├── drift-replacement.test.mjs
    ├── knowledge-handler.test.mjs
    └── knowledge-ui.test.mjs
```

This decomposition keeps route files shallow while moving the current oversized Knowledge UI out of `prospector-app.tsx`; it follows the Phase 1 dependency-injection pattern. [VERIFIED: `site/app/api/interview/route.ts`, `site/domain/interview-handler.ts`, `site/app/prospector-app.tsx`]

### Component Responsibilities

| Component | Owns | Must Not Own |
|-----------|------|--------------|
| `commercial-model.ts` | parent/child validation, seed, scope path, hierarchy draft mutations | knowledge confirmation, readiness, accounts/contacts/prospects [VERIFIED: locked scope] |
| `knowledge.ts` | proposal snapshot, provenance, decision, immutable version append, reuse eligibility | source retrieval, outbound effects [VERIFIED: ADR-0002] |
| `interview.ts` | one-question state, answer snapshot, all four confirmation decisions, next-question lineage | workspace admission/CSRF/provider bindings [VERIFIED: existing architecture] |
| `drift.ts` | pure risk classification, reached-edge traversal, impact categories/counts | activating configuration or changing downstream rows [VERIFIED: ADR-0002] |
| `replacement.ts` | persist candidate preview, validate exact preview/revisions, atomic activation/audit | creating runs/schedules or requalifying records during Phase 2 [VERIFIED: phase boundary] |
| handlers | admission, request security, bounded parsing, HTTP status mapping | business decisions [VERIFIED: `site/domain/interview-handler.ts`] |
| React views | accessible projection, explicit action selection, focus/conflict behavior | authority inference, digest calculation, optimistic confirmation [VERIFIED: `02-UI-SPEC.md`] |

### Pattern 1: Stable aggregate plus immutable authority records

Use stable hierarchy/knowledge-item rows as locators and append immutable proposal, decision, and version rows. Only a revision/current-version pointer or lifecycle projection changes; value, scope, provenance, and decision snapshots never change after insertion. [VERIFIED: ADR-0002]

Recommended core records: [VERIFIED: synthesis of locked model and existing schema]

| Record | Required shape / constraint |
|--------|-----------------------------|
| `companies` | one row per workspace; unique `workspace_id`; seed `Digitalrain`. [VERIFIED: ADR-0001] |
| `products` | add `company_id`; seed `ONE`; keep operational lifecycle Draft. [VERIFIED: `02-CONTEXT.md`, later readiness deferred] |
| `market_plays` | FK to Product; seed `ONE for Mining`; do not seed Marine until owner-created. [VERIFIED: `02-CONTEXT.md`] |
| `customer_profiles` | FK to Market Play; seed `Operating` and `Greenfield`; Greenfield remains Draft/nurture and no Profile becomes Ready here. [VERIFIED: `02-CONTEXT.md`] |
| `offers` | FK to Customer Profile, not directly to Market Play; create only after an explicit confirmed decision because no initial Offer name/value is locked. [VERIFIED: exact hierarchy in `02-CONTEXT.md`; implementation-spec cardinality conflict resolved in favor of locked context] |
| `organizations`, `contacts` | Company-wide identity uniqueness using normalized identity keys; no Phase 2 create/promote route. [VERIFIED: REQ-commercial-hierarchy and boundary] |
| `accounts`, `targets`, `contact_relevance` | Market Play/Profile-scoped FK structure; schema/read-model only in Phase 2, with no command that creates operational rows. [VERIFIED: `02-CONTEXT.md`] |
| `sources`, `source_excerpts` | source/custody/retrieval/privacy/license/digest metadata and bounded plain-text excerpts. [VERIFIED: `docs/IMPLEMENTATION-SPEC.md`] |
| `knowledge_items` | stable unique `(workspace, scope_type, scope_id, kind, slot)` plus current confirmed pointer/revision. [VERIFIED: model requirement] |
| `knowledge_proposals` | immutable value/scope/provenance/reuse snapshot and digest, with review state derived from decision. [VERIFIED: locked proposal contract] |
| `proposal_decisions` | one immutable Accept/Reject/Correct/Rescope outcome per reviewed proposal/answer, unique idempotency and operation digest. [VERIFIED: locked decision contract] |
| `knowledge_versions` | immutable version number/value digest/scope/kind/decision/predecessor, with no value update path. [VERIFIED: ADR-0002] |
| `configuration_knowledge_dependencies` | immutable configuration-to-version joins; unique pair. [VERIFIED: ADR-0002] |
| `artifact_configuration_dependencies` | typed artifact-to-configuration joins for future artifacts; Phase 2 has no artifact-creation API. [VERIFIED: explicit dependency contract] |
| `knowledge_drifts` | current version, proposal, risk kind, dependency snapshot digest, status/revision. [VERIFIED: drift contract] |
| `replacement_candidates` | exact current/candidate configuration digests plus immutable impact JSON/digest and owner scope. [VERIFIED: UI contract] |
| `configuration_activations` | append-only activation decision/audit link; uniqueness prevents two winning activations for one expected owner revision. [VERIFIED: replacement contract] |

### Pattern 2: Transaction-failing authority guard

Do not treat a zero-row optimistic update as a failed D1 transaction. Insert a command/decision guard only when the expected revision and state match, then make the authority-bearing rows reference that guard; a stale guard causes a foreign-key failure and rolls back the whole batch. [CITED: https://developers.cloudflare.com/d1/worker-api/d1-database/#batch; https://developers.cloudflare.com/d1/sql-api/foreign-keys/]

```typescript
// Source: Cloudflare D1 batch + foreign-key documentation; adapted to project pattern.
const commandId = uuidv7(); // `uuid` [ASSUMED]; install only after checkpoint.
await db.batch([
  db.prepare(`
    INSERT INTO authority_commands
      (id, workspace_id, subject_type, subject_id, expected_revision,
       idempotency_key, operation_digest, created_at)
    SELECT ?, ?, 'knowledge_proposal', id, revision, ?, ?, ?
    FROM knowledge_proposals
    WHERE id = ? AND workspace_id = ? AND revision = ? AND review_state = 'pending'
  `).bind(commandId, workspaceId, key, operationDigest, now,
          proposalId, workspaceId, expectedRevision),

  // FK(command_id) ensures a stale SELECT-above becomes a transaction failure.
  db.prepare(`
    INSERT INTO proposal_decisions
      (id, workspace_id, proposal_id, command_id, decision,
       reviewed_snapshot_json, reviewed_snapshot_digest, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(decisionId, workspaceId, proposalId, commandId, decision,
          snapshotJson, snapshotDigest, now),
]);
```

All values are bound prepared-statement parameters; Cloudflare recommends binding because it prevents SQL injection and supports statement reuse. [CITED: https://developers.cloudflare.com/d1/worker-api/prepared-statements/]

### Pattern 3: Partial unique indexes for live authority

Use D1 partial unique indexes for invariants that apply only to active states. D1 documents partial indexes and uniqueness as supported index behavior. [CITED: https://developers.cloudflare.com/d1/best-practices/use-indexes/]

```sql
-- Source: Cloudflare D1 index documentation.
CREATE UNIQUE INDEX one_live_session_per_scope
ON interview_sessions(workspace_id, scope_type, scope_id)
WHERE state IN ('open', 'awaiting_answer', 'awaiting_confirmation', 'paused');

CREATE UNIQUE INDEX one_active_question_per_session
ON interview_questions(workspace_id, session_id)
WHERE status = 'active';

CREATE UNIQUE INDEX one_active_config_per_owner
ON typed_configurations(workspace_id, owner_type, owner_id, kind)
WHERE active = 1;
```

Keep the existing unique answer-per-question, confirmation-per-answer, and workspace/idempotency indexes. [VERIFIED: `site/db/schema.ts`, migration 0001]

### Pattern 4: Exact, server-constructed snapshots

Construct a typed object in a fixed field order after validating every field, serialize it once, hash those exact bytes, store JSON and digest together, and use that stored JSON for all later review/confirmation views. [VERIFIED: corrected Phase 1 pattern in `site/domain/interview.ts`] The confirmation digest must include decision type, reviewed answer/proposal digest, prerequisite version IDs and digests, destination scope, expected revisions, and corrected/rescoped content when applicable. [VERIFIED: `02-CONTEXT.md`]

Reject unknown authority-bearing fields rather than passing arbitrary request JSON into stored snapshots. [VERIFIED: `docs/IMPLEMENTATION-SPEC.md` §8]

### Pattern 5: One generalized decision command

Implement Accept, Reject, Correct, and Rescope as a discriminated server command, not four loosely related handlers. [VERIFIED: UI and state-machine contract]

```typescript
type ConfirmationCommand =
  | { decision: "accept" }
  | { decision: "reject"; reason: string }
  | { decision: "correct"; correctedValue: unknown; reason: string }
  | { decision: "rescope"; destination: ScopeRef; reason: string };

// Accept/Correct/Rescope append a Knowledge Version.
// Reject appends only the immutable decision and audit event.
```

The server resolves the destination against the admitted workspace and verifies that the requested kind is legal at that scope; the client path is never authority. [VERIFIED: Phase 1 authorization convention and locked scope rules]

### Pattern 6: Dependency-reached drift, never broad pause

Compute impact by traversing persisted joins from challenged source/version to configurations and then to artifacts. Store the sorted reached node IDs and statuses in the candidate impact snapshot so activation can verify that the owner is approving the exact graph result. [VERIFIED: ADR-0002] High-risk classification is an allowlist of `capability`, `proof_point`, `claim_guardrail`, `offer`, and `suppression`; any new kind defaults to standard/no operational effect until explicitly classified. [VERIFIED: `02-CONTEXT.md`]

Because Phase 2 creates no outbound artifacts, the seeded/current workspace should normally project `Operational effects remain disabled in this pilot`; tests must still use synthetic dependency fixtures to prove selective traversal without adding production command paths. [VERIFIED: phase boundary and UI contract]

### Pattern 7: Quarantine-first uploads

An uploaded object may create an immutable source/custody record and Proposed Knowledge record, but it remains `quarantined` and its body is neither parsed nor rendered until a safety result exists. [VERIFIED: `docs/IMPLEMENTATION-SPEC.md` §8] No scanner is installed or represented by an existing port, so Phase 2 must fail closed rather than claim a scan. [VERIFIED: environment and codebase audit]

Repository-seeded source excerpts and bounded owner-entered plain text can support the initial interview without runtime crawling or external Runner work. [VERIFIED: phase boundary; `source/` materials exist in codebase] Public URLs may be stored as source references, but runtime retrieval must not be introduced unless the full SSRF/redirect/address-pinning contract in Implementation Spec §8 is implemented and tested. [VERIFIED: `docs/IMPLEMENTATION-SPEC.md` §8]

### Pattern 8: Authoritative UI projection

Use database IDs as stable React keys, render source excerpts as JSX text children, and never use `dangerouslySetInnerHTML` for source/import content. React warns that raw untrusted HTML through `dangerouslySetInnerHTML` creates XSS risk. [CITED: https://react.dev/reference/react-dom/components/common] Keep current reviewed snapshots visible during pending mutations; on unknown network outcome perform a read-only refresh and never auto-retry a mutation with a new key. [VERIFIED: `02-UI-SPEC.md`]

### Anti-Patterns to Avoid

- **`workspace.company_name` as the Company aggregate:** it cannot represent Company versioning or a real parent FK; add `companies` and retain the workspace name only for backward compatibility during expansion. [VERIFIED: existing schema versus ADR-0001]
- **Offer directly under Market Play:** the core-record table in `IMPLEMENTATION-SPEC.md` says Market Play, but locked Context and UI require `Profile -> Offer`; use `profile_id`. [VERIFIED: source conflict resolved by locked context]
- **JSON-only provenance:** searchable/status fields and joins belong in columns; JSON is for immutable bounded snapshots. [VERIFIED: required dependency/provenance behavior]
- **Client-computed scope/digests/counts:** server reconstructs them from admitted D1 rows. [VERIFIED: established Phase 1 pattern]
- **Read-then-write without a constraint:** another tab can win between those operations. [VERIFIED: current race tests and D1 semantics]
- **Mutating a confirmed value or configuration manifest:** append a proposal/version/candidate and activate separately. [VERIFIED: ADR-0002]
- **Treating Answer submission as confirmation:** preserve the two transactions and distinct UI stages. [VERIFIED: Phase 1 corrective ADR history]
- **Reusing a new idempotency key after an unknown outcome:** retain the original logical-operation key and read current authority before any explicit retry. [VERIFIED: `02-UI-SPEC.md`]
- **Generic Company-wide drift pause:** only reached artifacts receive containment. [VERIFIED: ADR-0002]
- **Enabling fixture controls because knowledge is live:** later-phase controls remain native-disabled with adjacent explanation. [VERIFIED: `02-UI-SPEC.md`]
- **Parsing or rendering unscanned uploads:** quarantine until a real safety result exists. [VERIFIED: Implementation Spec §8]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Authentication/admission | Client workspace selector or email comparison | Existing `getChatGPTUser` + `admitPilotOwner` | Already tested for neutral denial and HMAC owner identity. [VERIFIED: `site/domain/pilot-access.ts`] |
| CSRF/session mutation safety | New token scheme | Existing request-security and one-time CSRF helpers | Existing route/handler tests cover origin, intent, replay, and owner binding. [VERIFIED: `site/domain/csrf.ts`, `site/domain/request-security.ts`] |
| Multi-statement transaction emulation | Manual compensating writes | D1 `batch()` plus constraints/FKs | D1 documents batch rollback on statement failure. [CITED: https://developers.cloudflare.com/d1/worker-api/d1-database/#batch] |
| SQL escaping | String interpolation | D1 prepared statements with `.bind()` | Official guidance recommends bound prepared statements and notes SQL-injection protection. [CITED: https://developers.cloudflare.com/d1/worker-api/prepared-statements/] |
| UUIDv7 codec | Bit manipulation | `uuid.v7()` [ASSUMED] after package checkpoint | Official project supports RFC 9562 v7 and modern crypto APIs. [CITED: https://github.com/uuidjs/uuid] |
| HTML sanitizer for evidence | Sanitizing arbitrary HTML in the UI | Store/render bounded plain text; no raw HTML | React text children are sufficient and avoid the dangerous raw-HTML path. [CITED: https://react.dev/reference/react-dom/components/common] |
| Generic workflow engine | Configurable state-machine framework | Explicit domain transitions + D1 constraints | The allowed states and authority effects are fixed and security-sensitive. [VERIFIED: `docs/IMPLEMENTATION-SPEC.md`] |
| Graph database | External graph service | Two relational dependency join tables + deterministic traversal | Keeps replacement/containment in the authoritative D1 transaction. [VERIFIED: ADR-0002] |
| Malware/secret scanner | Regex-only “scan passed” logic | Quarantine meanwhile; choose an approved scanner only through a later explicit architecture decision | The required scan is security-sensitive, no approved tool exists, and the current trust-boundary contract does not list a scanner port. [VERIFIED: Implementation Spec §§1 and 8; environment audit] |

**Key insight:** custom UI or application locks cannot substitute for database-enforced uniqueness and immutable authority records when retries and concurrent tabs are part of the acceptance criteria. [VERIFIED: Phase 1 race history and D1 official semantics]

## Runtime State Inventory

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| Stored data | Hosted D1 contains the Phase 1 owner workspace, interview history, confirmed historian Knowledge Version, audit records, and CSRF records; exact hosted row counts were not available in this research session. [VERIFIED: ADR-0004 hosted lifecycle checkpoint, `.planning/STATE.md`] | Use additive schema changes; preflight counts; create one Company from each workspace; bind the existing historian version to a stable knowledge item without changing its value/digest/decision lineage; verify counts and legacy quarantine invariants. [VERIFIED: migration policy] |
| Live service config | Private Sites has D1/R2 bindings and owner secret bindings; R2 lifecycle is reported proven, while Phase 1 still lacks the second-real-principal hosted isolation checkpoint. [VERIFIED: `.planning/STATE.md`] | Do not rename bindings/secrets. Gate Phase 2 hosted activation on the outstanding Phase 1 principal proof. Add no scheduler/runner/provider binding. [VERIFIED: phase dependency/boundary] |
| OS-registered state | None in Phase 2 scope; repository scan found no launchd/systemd/Task Scheduler registration and this phase renames none. [VERIFIED: codebase file scan] | None. [VERIFIED: no rename/registration change] |
| Secrets/env vars | `OWNER_SUBJECT_PEPPER` and `PILOT_OWNER_EMAIL` remain required; no Phase 2 decision changes those names. [VERIFIED: `site/app/api/interview/route.ts`] | Reuse unchanged; never copy secret values into proposal/source/audit JSON. [VERIFIED: audit contract] |
| Build artifacts / installed packages | Existing `.next`/`dist` output becomes stale after schema/UI changes; `uuid` is not currently installed. [VERIFIED: codebase and package manifest] | Rebuild with `npm test`; after a human package checkpoint, update `package.json`/lockfile and reinstall. Do not treat generated output as migration authority. [VERIFIED: current scripts] |

**Migration classification:** Company/knowledge-item introduction needs both a code edit for future writes and a data backfill for the existing hosted historian record. [VERIFIED: current schema and hosted checkpoint]

## Common Pitfalls

### Pitfall 1: Zero-row optimistic update does not abort the batch

**What goes wrong:** a stale operation can continue inserting decision/version rows if its guarded update merely affects zero rows. [VERIFIED: SQL/D1 behavior]  
**Why it happens:** D1 rolls back on statement failure, not on a successful statement with zero changes. [CITED: https://developers.cloudflare.com/d1/worker-api/d1-database/#batch]  
**How to avoid:** use a command guard inserted from the expected row and require subsequent rows to FK-reference it; also enforce one-decision/one-active invariants with unique indexes. [VERIFIED: recommended architecture]  
**Warning signs:** `UPDATE ... WHERE revision = ?` followed by unrelated inserts without a constraint tying them together. [VERIFIED: code-review heuristic]

### Pitfall 2: Existing schema looks more complete than it is

**What goes wrong:** planner assumes Products/Plays/Profiles/Knowledge/typed configs are authoritative because tables exist. [VERIFIED: `site/db/schema.ts`]  
**Why it happens:** Phase 1 created scaffolding, but there is no Company table, Offer table, source/proposal/drift/dependency model, or generalized decision API; many hierarchy columns lack declared FKs. [VERIFIED: `site/db/schema.ts`, migrations 0000–0003]  
**How to avoid:** treat current tables as migration inputs and add the constraints/records described above before building UI writes. [VERIFIED: gap analysis]  
**Warning signs:** UI counts or scope paths sourced from fixture constants or unjoined string IDs. [VERIFIED: current fixture UI]

### Pitfall 3: Offer parent conflict

**What goes wrong:** Offer is implemented under Market Play, flattening the locked hierarchy. [VERIFIED: conflicting implementation-spec row]  
**Why it happens:** `IMPLEMENTATION-SPEC.md` core-record table says `offer | market play 1:N`, while every locked phase source says `Customer Profile -> Offer`. [VERIFIED: docs conflict]  
**How to avoid:** phase context wins; use `offers.profile_id`, and carry Market Play through the Profile parent. [VERIFIED: `02-CONTEXT.md`]  
**Warning signs:** an Offer can be selected without a Profile in the scope path. [VERIFIED: UI contract]

### Pitfall 4: Operational lifecycle accidentally activated by seed data

**What goes wrong:** seeded Product/Profile receives Ready/Active and later controls become enabled. [VERIFIED: phase-boundary risk]  
**Why it happens:** Phase 1 fixtures visually described “Ready examples,” but they were synthetic. [VERIFIED: `site/app/prospector-app.tsx`]  
**How to avoid:** seed hierarchy/knowledge only; keep operational readiness Draft and all later controls disabled. [VERIFIED: deferred phase ownership]  
**Warning signs:** Phase 2 writes a run, schedule, account, prospect, approval, export, or message row. [VERIFIED: forbidden effect list]

### Pitfall 5: Proposal status conflated with version status

**What goes wrong:** accepting a proposal updates its value/status into a “confirmed proposal,” losing the reviewed snapshot. [VERIFIED: immutable-decision risk]  
**Why it happens:** current `knowledge_versions.status` mixes proposed/confirmed/rejected/superseded. [VERIFIED: `site/db/schema.ts`]  
**How to avoid:** separate proposal, decision, stable item, and immutable version records; derive UI status from their relations. [VERIFIED: recommended model]  
**Warning signs:** `UPDATE knowledge_versions SET value_json = ...`. [VERIFIED: prohibited write pattern]

### Pitfall 6: Digest omits prerequisites or destination

**What goes wrong:** a stale answer can be confirmed after prerequisite knowledge or scope changed. [VERIFIED: locked digest contract]  
**Why it happens:** Phase 1 proposal snapshots contain question content/value but not generalized prerequisite or destination digests. [VERIFIED: `site/domain/interview.ts`]  
**How to avoid:** include sorted prerequisites and exact destination in the stored snapshot and operation digest, then revalidate current prerequisites at confirmation. [VERIFIED: `02-CONTEXT.md`]  
**Warning signs:** confirmation operation digest contains only answer ID and decision. [VERIFIED: required review field set]

### Pitfall 7: “High risk” becomes a global pause

**What goes wrong:** unrelated future artifacts are shown or marked paused. [VERIFIED: prohibited drift behavior]  
**Why it happens:** risk category is used without graph traversal. [VERIFIED: drift contract]  
**How to avoid:** persist joins and calculate reached artifacts; store empty reached sets honestly when no artifacts exist in Phase 2. [VERIFIED: ADR-0002]  
**Warning signs:** pause update filters only by workspace or Product rather than explicit reached IDs. [VERIFIED: dependency model]

### Pitfall 8: Upload accepted as safe evidence

**What goes wrong:** malicious or secret-bearing content is parsed/rendered. [VERIFIED: Implementation Spec threat model]  
**Why it happens:** R2 durability is mistaken for content safety. [VERIFIED: object-storage boundary]  
**How to avoid:** immutable quarantine status, opaque storage, no parsing/rendering, and a scanner-result requirement. [VERIFIED: Implementation Spec §8]  
**Warning signs:** “uploaded” and “reviewable” are the same state. [VERIFIED: required fail-closed distinction]

### Pitfall 9: Replacement activation performs future-phase work

**What goes wrong:** activation creates schedules, runs, requalifications, or approval/message rows. [VERIFIED: boundary violation]  
**Why it happens:** the full future rollover contract is implemented prematurely. [VERIFIED: Phase 3–6 ownership]  
**How to avoid:** Phase 2 records immutable candidate/activation and impact/containment projections only; later phases consume them. [VERIFIED: `02-CONTEXT.md`]  
**Warning signs:** replacement tests assert new operational records rather than zero forbidden deltas. [VERIFIED: validation requirement]

### Pitfall 10: Migrations ignore hosted legacy state

**What goes wrong:** confirmed historian history is detached, duplicated, or silently upgraded. [VERIFIED: Phase 1 legacy incidents]  
**Why it happens:** test fixtures start from an empty D1 and skip migrations 0000–0003. [VERIFIED: current test helper]  
**How to avoid:** every Phase 2 repository test applies the full migration chain and includes bound and legacy-unbound fixtures; hosted preflight checks counts/digests before enabling writes. [VERIFIED: ADR-0004 and migration policy]  
**Warning signs:** a test creates only the newest schema. [VERIFIED: migration test heuristic]

## Code Examples

### Safe D1 preparation and transaction

```typescript
// Source: https://developers.cloudflare.com/d1/worker-api/d1-database/#batch
const results = await database.batch([
  database.prepare("INSERT INTO audit_events (...) VALUES (?, ?, ...)")
    .bind(auditId, workspaceId /* ... */),
  database.prepare("UPDATE knowledge_items SET current_version_id = ?, revision = revision + 1 WHERE id = ? AND workspace_id = ? AND revision = ?")
    .bind(versionId, itemId, workspaceId, expectedRevision),
]);
```

D1 executes batch statements sequentially and rolls back the sequence on a failing statement. [CITED: https://developers.cloudflare.com/d1/worker-api/d1-database/#batch]

### Plain-text evidence rendering

```tsx
// Source: https://react.dev/reference/react-dom/components/common
function EvidenceExcerpt({ excerpt }: { excerpt: string }) {
  return <blockquote>{excerpt}</blockquote>; // text child; no raw HTML
}
```

React documents that `dangerouslySetInnerHTML` with untrusted data is an XSS risk. [CITED: https://react.dev/reference/react-dom/components/common]

### Deterministic reached-impact evaluation

```typescript
type DependencyEdge = {
  fromType: "source" | "knowledge_version" | "configuration";
  fromId: string;
  toType: "knowledge_version" | "configuration" | "artifact";
  toId: string;
};

export function reachedArtifacts(startIds: readonly string[], edges: readonly DependencyEdge[]) {
  const reached = new Set(startIds);
  for (let changed = true; changed;) {
    changed = false;
    for (const edge of edges) {
      if (reached.has(edge.fromId) && !reached.has(edge.toId)) {
        reached.add(edge.toId);
        changed = true;
      }
    }
  }
  return edges
    .filter((edge) => edge.toType === "artifact" && reached.has(edge.toId))
    .map((edge) => edge.toId)
    .sort();
}
```

The evaluator must remain pure and its sorted result must be included in the persisted impact digest. [VERIFIED: reproducibility requirement in ADR-0002]

### Boundary assertion helper

```javascript
const forbiddenTables = [
  "runs", "accounts", "signals", "contacts", "candidates", "prospects",
  "schedules", "approval_grants", "outreach_packages", "message_versions",
  "export_jobs",
];

const before = await counts(database, forbiddenTables);
await performPhase2Command();
assert.deepEqual(await counts(database, forbiddenTables), before);
```

Every consequential Phase 2 test should pair its positive authority assertion with a zero-delta assertion for forbidden operational tables. [VERIFIED: locked phase boundary]

## State of the Art

| Old / Current Project Approach | Current Recommended Approach | When Changed | Impact |
|--------------------------------|------------------------------|--------------|--------|
| Single historian Accept-only flow | Generic answer plus Accept/Reject/Correct/Rescope decision command | Phase 2 contract, 2026-07-30 | All material decisions share immutable snapshot and conflict behavior. [VERIFIED: `02-CONTEXT.md`] |
| `knowledge_versions.status` mixes proposal and authority | Separate proposal, decision, stable item, and immutable version | ADR-0002 accepted 2026-07-29 | No overwrite or ambiguous “confirmed proposal.” [VERIFIED: ADR-0002] |
| Application race handling plus broad scope index | Partial unique live-state indexes plus transaction-failing guards | D1 currently documents partial indexes and transactional batch | Exactly-one authority is database enforced. [CITED: https://developers.cloudflare.com/d1/best-practices/use-indexes/; https://developers.cloudflare.com/d1/worker-api/d1-database/#batch] |
| Top-level SQL migration files | Continue current top-level files; Cloudflare now also supports nested Drizzle layouts if config changes later | D1 nested-layout support added May/June 2026 | No migration-layout change is needed for this phase. [CITED: https://developers.cloudflare.com/d1/reference/migrations/] |
| ASVS 4 terminology in the research template | Verify against stable ASVS 5.0.0 | ASVS 5.0.0 released May 2025 | Security mapping should identify the version explicitly. [CITED: https://github.com/OWASP/ASVS] |

**Deprecated/outdated:**

- Treating the Phase 1 fixture hierarchy as persisted authority is outdated; only the owner-scoped historian lifecycle is live. [VERIFIED: `site/app/prospector-app.tsx`, `.planning/STATE.md`]
- A single generic Confirm button is prohibited; the exact decision verbs and two-stage workflow are locked. [VERIFIED: `02-UI-SPEC.md`]
- `PRAGMA foreign_keys=OFF` in a D1 migration is not the current recommended migration mechanism; D1 documents always-on enforcement and `PRAGMA defer_foreign_keys` for temporary migration deferral. [CITED: https://developers.cloudflare.com/d1/sql-api/foreign-keys/]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `uuid@14.0.1` is acceptable for new UUIDv7 entity IDs; package existence/source/docs were verified, but slopcheck could not run. | Standard Stack / Package Audit | Planner must insert a human verification checkpoint; if rejected, choose another verified RFC 9562 implementation rather than hand-writing UUIDv7. |

All other recommendations are derived from locked project documents, inspected source, successful local tests, or cited official documentation. [VERIFIED: research audit]

## Open Questions

1. **Which malware/secret-scanning capability will release uploaded objects from quarantine?**
   - What we know: the implementation contract requires scanning before content is available, and no scanner/package/port exists. [VERIFIED: Implementation Spec §8 and environment audit]
   - What's unclear: the approved hosted scanner/provider and its privacy/retention contract. [VERIFIED: no project decision found]
   - Recommendation: implement quarantine metadata now; do not add an external scanner adapter or activate parsing/rendering until a later explicit provider and trust-boundary decision updates the accepted port list. [VERIFIED: safest in-scope path]

2. **What rows exist in hosted D1 immediately before the Phase 2 migration?**
   - What we know: hosted owner lifecycle created an authoritative historian Knowledge Version and audit lineage. [VERIFIED: ADR-0004]
   - What's unclear: exact counts across scaffold tables after the latest deployment. [VERIFIED: hosted DB not queried in this session]
   - Recommendation: planner adds a read-only count/digest preflight and post-backfill invariant check before enabling new writes. [VERIFIED: expand/migrate/contract policy]

3. **What is the initial Offer?**
   - What we know: Company, Product, Market Play, and two Profile names are locked; no Offer name or value is specified. [VERIFIED: `02-CONTEXT.md`]
   - What's unclear: the owner's concrete entry point for Operating. [VERIFIED: source review]
   - Recommendation: do not seed a placeholder; make Offer the first hierarchy-completion interview decision and append it only after owner confirmation. [VERIFIED: hierarchy and confirmation contracts]

4. **Can hosted Phase 2 execution begin before Phase 1's second-principal proof?**
   - What we know: ROADMAP makes Phase 2 depend on Phase 1, and STATE still marks the non-substitutable second real principal checkpoint open. [VERIFIED: `.planning/ROADMAP.md`, `.planning/STATE.md`]
   - What's unclear: only when the owner can perform that external checkpoint. [VERIFIED: external dependency]
   - Recommendation: local planning/implementation may proceed, but hosted activation and any broader real data remain gated. [VERIFIED: accepted pilot boundary]

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node.js | build/tests/domain | ✓ | 24.16.0; project minimum is 22.13.0 | — [VERIFIED: environment and `site/package.json`] |
| npm | package/build/test | ✓ | 11.13.0 | — [VERIFIED: environment] |
| Wrangler | D1/Sites local and migration tooling | ✓ project-local | 4.92.0 | invoke through `npm exec` with project-local log path. [VERIFIED: environment] |
| Drizzle Kit / ORM | schema generation | ✓ | 0.31.10 / 0.45.2 | — [VERIFIED: environment, package manifest] |
| Miniflare | D1 integration tests | ✓ | 4.20260515.0 | —; full suite passed. [VERIFIED: `npm test`] |
| Hosted D1 | live authority state | ✓ narrow owner slice | binding present; hosted lifecycle proven | keep Phase 2 activation gated on Phase 1 principal proof. [VERIFIED: ADR-0004, STATE] |
| Hosted R2 | opaque upload custody | ✓ durability | binding/lifecycle proven | quarantine only. [VERIFIED: STATE] |
| Content malware/secret scanner | upload release | ✗ | — | Store quarantined object; do not parse/render. [VERIFIED: environment/codebase audit] |
| `uuid` | UUIDv7 IDs | ✗ | proposed 14.0.1 | human verification checkpoint before install. [ASSUMED] |

**Missing dependencies with no safe activation fallback:** approved content scanner for making arbitrary uploads usable. [VERIFIED: Implementation Spec §8]  
**Missing dependencies with fallback:** `uuid` can be checkpointed before implementation; uploads can be quarantined without activation. [VERIFIED: recommended plan]

## Validation Architecture

Nyquist validation is enabled because `.planning/config.json` does not set `workflow.nyquist_validation` to `false`. [VERIFIED: `.planning/config.json`]

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Node built-in test runner on Node 24.16.0 + Miniflare 4.20260515.0 [VERIFIED: package/environment/tests] |
| Config file | none; tests are `site/tests/*.test.mjs` and create Vite/Miniflare directly. [VERIFIED: codebase] |
| Quick run command | `cd site && npm test` — current full build and 15 tests completed in about 3.7 seconds. [VERIFIED: executed 2026-07-30] |
| Full suite command | `cd site && npm test && npm run lint` [VERIFIED: scripts and successful execution] |

Directly invoking only the Vite/Miniflare interview test file hung after a failure in this environment, while the canonical `npm test` command passed all 15 tests; use the package script as the reliable sampling command until Wave 0 isolates shared setup. [VERIFIED: executed test behavior]

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REQ-commercial-hierarchy | exact Company→Product→Play→Profile→Offer parentage, seed, no placeholder Offer, Company-wide identity uniqueness, play/profile-scoped associations | D1 integration | `cd site && npm test` | ❌ Wave 0: `tests/commercial-model-repository.test.mjs` |
| REQ-commercial-hierarchy | owner-only hierarchy/projection; client workspace/scope IDs grant no authority; neutral denial | handler integration | `cd site && npm test` | ❌ Wave 0: extend/new `tests/knowledge-handler.test.mjs` |
| REQ-commercial-hierarchy | Commercial Model tree, scope path, disabled later-phase actions, mobile semantics | rendered/source regression | `cd site && npm test` | ❌ Wave 0: `tests/knowledge-ui.test.mjs` |
| REQ-consensus-interview | evidence/inference/recommendation/prerequisites remain distinct and exact snapshot survives source/question drift | D1 integration | `cd site && npm test` | ⚠ extend `tests/interview-repository.test.mjs` |
| REQ-consensus-interview | Accept/Reject/Correct/Rescope; only three append Knowledge Versions; reason/destination validation | D1 integration | `cd site && npm test` | ❌ Wave 0 cases |
| REQ-consensus-interview | retry, response loss, two-tab answer/confirmation, stale revision, supersession, exactly one active question/session | concurrency integration | `cd site && npm test` | ⚠ existing races cover Accept-only; extend |
| REQ-consensus-interview | Origin/intent/content type/body limit/CSRF/replay/cross-owner denial for every new command | handler security | `cd site && npm test` | ⚠ extend `tests/interview-handler.test.mjs` and `tests/knowledge-handler.test.mjs` |
| REQ-versioned-knowledge-and-drift | every intake creates Proposed with provenance/privacy/license/destination; promotion never changes forbidden tables | D1 integration | `cd site && npm test` | ❌ Wave 0: `tests/knowledge-repository.test.mjs` |
| REQ-versioned-knowledge-and-drift | confirmed values never update; predecessor/successor and decision lineage preserved | D1 integration | `cd site && npm test` | ❌ Wave 0 cases |
| REQ-versioned-knowledge-and-drift | risk allowlist, exact dependency reach, unrelated artifacts unaffected | pure unit + D1 integration | `cd site && npm test` | ❌ Wave 0: `tests/drift-replacement.test.mjs` |
| REQ-versioned-knowledge-and-drift | impact preview digest, candidate-not-active, separate activation, stale/race/idempotency, preserved old config | D1 concurrency | `cd site && npm test` | ❌ Wave 0 cases |
| All three | every Phase 2 command produces zero deltas in Runs/Accounts/Signals/Contacts/Candidates/Prospects/schedules/approvals/exports/messages | boundary integration | `cd site && npm test` | ❌ Wave 0 shared forbidden-count helper |
| All three | full legacy migration preserves confirmed historian snapshot and quarantines legacy-unbound decisions | migration integration | `cd site && npm test` | ⚠ current coverage exists; extend for new backfill |

### Sampling Rate

- **Per task commit:** `cd site && npm test` [VERIFIED: current runtime under 30 seconds]
- **Per wave merge:** `cd site && npm test && npm run lint` [VERIFIED: both currently green]
- **Phase gate:** full suite green, migration pre/post invariants green, and rendered Phase 2 contract green before `/gsd:verify-work`. [VERIFIED: project validation conventions]

### Wave 0 Gaps

- [ ] `site/tests/helpers/d1.mjs` — centralize full migration application, table counts, and race helpers so targeted tests do not duplicate/setup-conflict. [VERIFIED: current helper is embedded in interview test]
- [ ] `site/tests/commercial-model-repository.test.mjs` — hierarchy, FKs, seed, identity/scoping, revisions. [VERIFIED: missing]
- [ ] `site/tests/knowledge-repository.test.mjs` — proposal/provenance/decision/version/reuse/boundary. [VERIFIED: missing]
- [ ] `site/tests/drift-replacement.test.mjs` — graph reach, risk, preview, activation, race, zero operational effects. [VERIFIED: missing]
- [ ] `site/tests/knowledge-handler.test.mjs` — admission, request validation, CSRF, neutral denial, exact conflicts. [VERIFIED: missing]
- [ ] `site/tests/knowledge-ui.test.mjs` — four local views, semantics/copy, native-disabled later controls, stale/unknown states. [VERIFIED: missing]
- [ ] Legacy/backfill fixtures for valid bound historian state, legacy-unbound state, and coexistence state. [VERIFIED: current migration risks]
- [ ] A forbidden-table zero-delta helper used by every Phase 2 mutation test. [VERIFIED: phase boundary]

## Security Domain

Security enforcement is enabled because `.planning/config.json` does not set `security_enforcement` to `false`. [VERIFIED: `.planning/config.json`] OWASP's latest stable ASVS is 5.0.0, dated May 2025. [CITED: https://github.com/OWASP/ASVS]

### Applicable ASVS Categories

| ASVS Area | Applies | Standard Control |
|-----------|---------|------------------|
| Authentication | yes | Reuse trusted-edge `getChatGPTUser` and configured-owner admission; never accept identity headers from browser input. [VERIFIED: Phase 1 implementation/tests] |
| Session Management | yes | Keep host session trust server-side and require short-lived one-time owner-bound CSRF for consequential commands. [VERIFIED: `site/domain/csrf.ts`, implementation contract] |
| Access Control | yes | Derive workspace from admitted principal and include `workspace_id` in every query/unique key; add cross-principal negative tests. [VERIFIED: implementation contract] |
| Validation / Business Logic | yes | Bounded JSON, strict action discriminants, exact scope-kind allowlists, expected revisions, immutable digests, DB constraints. [VERIFIED: current handler and Phase 2 contract] |
| Encoding and Sanitization | yes | Render source/upload excerpts as plain React text; no raw HTML. [CITED: https://react.dev/reference/react-dom/components/common] |
| Cryptography | yes | Use Web Crypto SHA-256/HMAC for integrity/identity digests; secrets remain binding-only and are never logged. [VERIFIED: Phase 1 code] |
| File Handling | yes | Opaque R2 custody, content hash, quarantine, bounded metadata; no parse/render until approved scan. [VERIFIED: Implementation Spec §8] |
| Logging and Error Handling | yes | Append bounded audit events; neutral unauthorized response; do not log secrets/raw private documents or authority payload bodies. [VERIFIED: Implementation Spec §22] |

### Known Threat Patterns for This Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Cross-workspace IDOR | Spoofing / Elevation | admitted workspace in every query; client ID only locator; neutral 404 and negative tests. [VERIFIED: Phase 1 pattern] |
| SQL injection in filters/scope | Tampering | allowlisted identifiers and bound D1 prepared statements. [CITED: https://developers.cloudflare.com/d1/worker-api/prepared-statements/] |
| CSRF/replay of Accept/Activate | Spoofing / Tampering | Origin + Fetch Metadata + intent + one-time owner token + idempotency digest. [VERIFIED: existing handler pattern] |
| Two-tab stale decision | Tampering | exact snapshot/prerequisite digest, expected revisions, guard FK, unique decision index, visible 409. [VERIFIED: locked concurrency contract] |
| Proposal promoted to unauthorized scope | Elevation | server scope resolution, scope-kind matrix, explicit destination confirmation, workspace FKs. [VERIFIED: context] |
| Untrusted source HTML/prompt injection | Tampering / Information disclosure | plain-text excerpts, no raw HTML, no privileged tools/Runner, quarantine uploads. [VERIFIED: Implementation Spec §8; React docs] |
| Dependency omission causes over/under pause | Tampering | normalized immutable edges, deterministic traversal, persisted impact digest, synthetic graph tests. [VERIFIED: ADR-0002] |
| Audit leakage | Information disclosure | digests/refs instead of secrets, tokens, raw private docs, or full bodies. [VERIFIED: Implementation Spec §22] |
| Unauthorized operational side effect | Elevation | no Phase 2 command path plus forbidden-table zero-delta tests. [VERIFIED: phase boundary] |
| Migration detaches historian authority | Tampering / Repudiation | additive migration, lineage backfill, pre/post count/digest checks, legacy fixtures. [VERIFIED: migration policy] |

## Sources

### Primary (HIGH confidence)

- `.planning/phases/02-consensus-knowledge-and-commercial-model/02-CONTEXT.md` — locked phase boundary, hierarchy, decisions, concurrency, reuse, drift. [VERIFIED: codebase]
- `.planning/phases/02-consensus-knowledge-and-commercial-model/02-UI-SPEC.md` — approved interaction, state, accessibility, responsive, and no-library contract. [VERIFIED: codebase]
- `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md`, `.planning/STATE.md` — requirement text, phase dependency, current blockers. [VERIFIED: codebase]
- `docs/DIRECTION.md`, `docs/IMPLEMENTATION-SPEC.md`, ADR-0001 through ADR-0005 — accepted domain/trust/versioning contracts. [VERIFIED: codebase]
- `site/db/schema.ts`, migrations 0000–0003, `site/domain/interview.ts`, handler/route/UI/tests — live Phase 1 implementation. [VERIFIED: codebase]
- https://developers.cloudflare.com/d1/worker-api/d1-database/#batch — D1 batch transactions and sessions. [CITED: official docs, updated 2026-06-22]
- https://developers.cloudflare.com/d1/worker-api/prepared-statements/ — parameter binding and prepared statements. [CITED: official docs, updated 2026-06-22]
- https://developers.cloudflare.com/d1/sql-api/foreign-keys/ — enforced/deferred foreign keys. [CITED: official docs, updated 2026-04-21]
- https://developers.cloudflare.com/d1/best-practices/use-indexes/ — unique and partial indexes. [CITED: official docs, updated 2026-04-21]
- https://developers.cloudflare.com/d1/reference/migrations/ — migration sequencing and layout. [CITED: official docs, updated 2026-06-08]
- https://orm.drizzle.team/docs/drizzle-kit-generate — generated schema/migration workflow. [CITED: official docs]
- https://orm.drizzle.team/docs/indexes-constraints — declared constraints/indexes. [CITED: official docs]
- https://react.dev/reference/react-dom/components/common — safe text versus dangerous raw HTML. [CITED: official docs]
- https://github.com/OWASP/ASVS — stable ASVS 5.0.0 status. [CITED: official project]

### Secondary (MEDIUM confidence)

- https://github.com/uuidjs/uuid and https://www.npmjs.com/package/uuid — UUIDv7 API and registry metadata; package remains `[ASSUMED]` because slopcheck was unavailable. [CITED: official project/registry]

### Tertiary (LOW confidence)

- None. [VERIFIED: source audit]

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH for retained dependencies; MEDIUM for `uuid` until human package verification. [VERIFIED: manifest/registry/audit]
- Architecture: HIGH — directly constrained by accepted ADRs, Context, UI contract, inspected D1 code, and official D1 semantics. [VERIFIED: source set]
- Pitfalls: HIGH — most are already represented by Phase 1 red-team incidents or direct schema gaps. [VERIFIED: ADR-0004 and codebase]
- Upload activation: MEDIUM — quarantine behavior is clear, but scanner selection is undecided. [VERIFIED: open dependency]

**Research date:** 2026-07-30  
**Valid until:** 2026-08-29 for project architecture; re-check package/D1/Next versions before install or deployment because those are fast-moving. [VERIFIED: date-based recommendation]
