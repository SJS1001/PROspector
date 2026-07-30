# Phase 03: Product Readiness and Market Discovery - Pattern Map

**Mapped:** 2026-07-30  
**Files analyzed:** 16 likely new/modified files  
**Analogs found:** 14 / 16

## Authority Baseline

Phase 3 extends the Phase 2 commercial aggregate; it does not introduce another Product, configuration, or Market Play source of truth. The closest live implementation is the owner-scoped Consensus Interview. Reuse its admitted-principal injection, workspace-rooted lookup, canonical JSON/digest, D1 batch, idempotency replay, neutral denial, and full-chain Miniflare tests. Phase 2's `02-PATTERNS.md` supplies the required strengthened patterns (immutable knowledge versions, typed configuration lineage, D1 command guards, and forbidden-effect assertions) where the live Phase 1 shell is incomplete.

These boundaries apply to every file below:

- A Product is Ready only after a **pure**, server-authoritative checklist finds every required category backed by the exact Confirmed Knowledge Version(s): capability, limitation, delivery, proof, ownership, claim guardrail, source policy, discovery policy, and default-runner policy. Proposed records, fixture text, a client Boolean, or a current-pointer read cannot satisfy the list.
- The Ready command receives the Product expected revision plus the complete exact version-id/digest set. It atomically appends audit history, creates/reuses one immutable canonical-digest Product Discovery Configuration, inserts/reuses `initial:product:{product_id}:{configuration_id}`, exposes manual discovery, and adds the monthly Product schedule. A retry returns the winner; a race leaves exactly one configuration/run/schedule.
- A Product Discovery Run pins configuration ID/digest, runner/instruction/output-schema/tool policies, source/discovery policy versions, trigger, source window/watermark, and deterministic submission/result lineage. Replay uses the stored manifest, never an active/current pointer. Product readiness may exist with zero Plays, Profiles, and Offers.
- Untrusted discovery findings are bounded data, never instructions. The application validates schema, citation/provenance, caps, ordering, state transitions, and audit. No runner/provider credential, provider fallback, paid call, external fetch, scheduler release, or other operational effect is authorized by this phase; missing/unknown capability gates fail closed.
- A run surfaces at most three valid evidence-backed **proposals**, ordered server-side. A Market Play Proposal is not a Market Play, Customer Profile, Offer, or accepted commercial truth. Partial/malformed/authority-unknown data displays no action controls and permits only an explicit authoritative read.
- Explore/Defer/Dismiss is a one-time immutable owner decision against the proposal version/digest and expected revision. Explore creates/opens only a Draft Market Play Consensus Interview from the stored proposal snapshot. It does not create a Ready Profile, Accounts, Targets, Prospects, contact data, prospecting, spend, or outbound work. Defer applies 90 days; Dismiss 180; only a materially different evidenced finding can reopen the exact deterministic fingerprint.
- All route mutations retain same-origin + Fetch Metadata + fixed intent + consumed CSRF + bounded JSON + closed action dispatch. Unauthorized callers receive the existing no-store neutral 404 projection. Consequential positive tests pair with forbidden operational-table zero-delta assertions.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `site/db/schema.ts` | model/config | CRUD + batch | `site/db/schema.ts` | exact extension |
| `site/drizzle/0005_product_discovery.sql` | migration | batch | `site/drizzle/0001_true_spencer_smythe.sql` | role-match |
| `site/domain/product-readiness.ts` | service/model | CRUD + request-response | `site/domain/interview.ts` | exact transaction shell |
| `site/domain/market-discovery.ts` | service/model | request-response + batch | `site/domain/interview.ts` | role-match |
| `site/domain/discovery-submission.ts` | service/utility | event-driven + transform | none in live codebase | no analog |
| `site/domain/discovery-handler.ts` | middleware/controller | request-response | `site/domain/interview-handler.ts` | exact |
| `site/app/api/discovery/route.ts` | route/config | request-response | `site/app/api/interview/route.ts` | exact |
| `site/app/discovery/discovery-workspace.tsx` | component | request-response | `Knowledge` in `site/app/prospector-app.tsx` | role-match |
| `site/app/discovery/product-readiness.tsx` | component | request-response | `Knowledge` in `site/app/prospector-app.tsx` | role-match |
| `site/app/discovery/proposal-cards.tsx` | component | request-response | `MarketDiscovery` in `site/app/prospector-app.tsx` | exact extraction |
| `site/app/prospector-app.tsx` | component/provider | event-driven composition | `site/app/prospector-app.tsx` | exact modification |
| `site/app/globals.css` | config | UI transform | `site/app/globals.css` | exact |
| `site/tests/helpers/d1.mjs` | test utility | file-I/O + batch | same file | exact extension |
| `site/tests/product-readiness-repository.test.mjs` | test | CRUD + batch + concurrency | `site/tests/interview-repository.test.mjs` | role-match |
| `site/tests/market-discovery-repository.test.mjs` | test | event-driven + batch + concurrency | `site/tests/interview-repository.test.mjs` | role-match |
| `site/tests/discovery-handler-ui.test.mjs` | test | request-response + rendered regression | `site/tests/interview-handler.test.mjs` + `site/tests/fixture-safety.test.mjs` | role-match |

`site/package.json` and `site/package-lock.json` are not Phase 3 edits unless a later plan identifies and separately approves a needed dependency. Do not install a scheduler, runner, HTTP retrieval client, or provider SDK to simulate capability that has not passed its release proof.

## Pattern Assignments

### `site/db/schema.ts` (model/config, CRUD + batch)

**Analog:** `site/db/schema.ts` lines 3-8 and 15-25.

**Shared audit/revision columns and typed configuration style** (lines 3-8, 19-20):

```typescript
const auditColumns = {
  workspaceId: text("workspace_id").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  revision: integer("revision").notNull().default(1),
};

export const configurations = sqliteTable("typed_configurations", {
  id: text("id").primaryKey(), ...auditColumns,
  ownerType: text("owner_type", { enum: ["product", "profile"] }).notNull(),
  ownerId: text("owner_id").notNull(), kind: text("kind").notNull(),
  digest: text("digest").notNull(), manifestJson: text("manifest_json").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(false),
});
```

Extend the Phase 2 aggregate rather than replacing this generic table: add relational Product Discovery Configuration/version-prerequisite joins; Product-owned schedules; Product discovery runs and append-only run events/submissions; immutable Market Play Proposal versions/evidence joins; proposal decisions; and fingerprint/split/merge/reopen lineage. Keep a configuration manifest canonical JSON plus SHA-256 digest and store every referenced Knowledge Version ID/digest as typed rows or a frozen, validated manifest (not a mutable “latest confirmed” query).

Use FKs and migration-only partial unique indexes for: one active Product Discovery Configuration; one `initial` run per Product/configuration; one schedule per Product/run type; one active scheduled slot; one active proposal per Product/fingerprint; and one terminal Explore/Defer/Dismiss decision per proposal revision. The existing `products.lifecycle` enum (line 15) remains the lifecycle authority; never add a client-owned `isReady` projection.

### `site/drizzle/0005_product_discovery.sql` (migration, batch)

**Analog:** `site/drizzle/0001_true_spencer_smythe.sql`, plus Phase 2 map lines 108-133.

**Additive FK/index pattern:**

```sql
CREATE TABLE `interview_answers` (
  `id` text PRIMARY KEY NOT NULL,
  `workspace_id` text NOT NULL,
  `session_id` text NOT NULL,
  `question_id` text NOT NULL,
  `idempotency_key` text NOT NULL,
  FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`),
  FOREIGN KEY (`session_id`) REFERENCES `interview_sessions`(`id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `answer_idempotency_unique`
ON `interview_answers` (`workspace_id`,`idempotency_key`);
```

Generate additively after the actual Phase 2 migration name/number is known; `0005_product_discovery.sql` is a planning placeholder, not permission to assume `0004` landed unchanged. Preserve old configurations/runs as historical records, never backfill a Product to Ready based on fixtures. Inspect generated SQL for partial indexes and D1-compatible command guards; do not use the old migration-0001 foreign-key-off pattern.

### `site/domain/product-readiness.ts` (service/model, CRUD + request-response)

**Analog:** `site/domain/interview.ts` lines 330-450, 453-620, 809-826, and 843-879.

**Owned root + exact snapshot/digest:**

```typescript
const workspace = await ownedWorkspace(database, principal);
const manifestJson = JSON.stringify(manifest); // manifest uses fixed field order
const manifestDigest = await sha256(manifestJson);

if ((await sha256(raw)) !== expectedDigest)
  throw new InterviewConflictError("The submitted policy snapshot failed integrity checks");
```

Create a pure `evaluateProductReadiness(confirmedKnowledge, product)` that returns *all* missing category codes/details and no side effects. The Ready command loads the admitted workspace then the exact Product, validates its expected revision and the submitted sorted Version ID/digest set against Confirmed Knowledge, produces a canonical immutable Product Discovery Configuration manifest, and uses a single D1 batch to transition Draft -> Ready, append audit, write/reuse config, initial run, manual-control availability projection, and monthly schedule.

Follow the winner-read pattern from lines 330-342 and 440-449: compute an operation digest binding Product ID/revision, sorted prerequisites, configuration digest, trigger/schedule identity, and idempotency key; on a unique race, read the winner by workspace/key and verify the digest before returning it. A failed/exhausted initial run returns `Needs attention`; it neither reverts Ready nor creates a second initial run. Paused/archived/stale/configuration-failed/authority-unknown Product states reject new starts fail closed.

### `site/domain/market-discovery.ts` (service/model, request-response + batch)

**Analog:** `site/domain/interview.ts` lines 366-439 and 481-620.

**Immutable record + audit batch:**

```typescript
await database.batch([
  database.prepare(`UPDATE ... WHERE id = ? AND workspace_id = ? AND revision = ?`)
    .bind(/* expected state */),
  database.prepare(`INSERT INTO ... (id, workspace_id, ..., idempotency_key, operation_digest, proposal_json, proposal_digest)
                    VALUES (?, ?, ..., ?, ?, ?, ?)`)
    .bind(/* server-derived values */),
  database.prepare(`INSERT INTO audit_events (...) VALUES (...)`).bind(/* owner audit */),
]);
```

Implement Product-scoped manual/material/monthly/initial run creation and owner decision reads here. Each run stores exact configuration, policy versions, trigger, attempt, time window, and watermark. Only a completed valid run advances its Product schedule watermark; calculate the discovery window as `(last_successful_watermark - 24h, started_at]`, following `docs/IMPLEMENTATION-SPEC.md` lines 204-210. Do not silently retry a mutation after an unknown result; permit only an explicit read.

Use deterministic `Product ID + normalized market category + normalized audience + normalized problem family` fingerprinting (spec lines 286-290). Server-side validate and order findings, retain at most three surfaced proposal versions per run, and collision-merge evidence into the existing fingerprint instead of making a second accepted market. Decision digest binds proposal version/digest/fingerprint, expected revision, decision, reason/review date, and idempotency key. Explore creates/opens a Draft Market Play interview only from the stored proposal snapshot; Defer requires/reports its 90-day date; Dismiss reports 180 days. Only changed material-evidence fingerprint affecting match/audience/fit/risk can reopen, with explicit lineage.

### `site/domain/discovery-submission.ts` (service/utility, event-driven + transform)

**Analog:** none in live codebase; use the application-owned boundary in `docs/adr/0003-untrusted-runners-and-human-gates.md` and `docs/IMPLEMENTATION-SPEC.md` lines 214-224 and 286-290.

Keep this narrow, pure-at-the-edge intake module separate from owner routes: validate a bounded schema, source/evidence provenance, per-run caps, Product/run/configuration identity, submission idempotency, and monotonic transition; then hand only normalized data to `market-discovery.ts`. Treat all source text and runner output as escaped data. Do not parse instructions, execute tools, select a provider, call an external service, follow a current configuration pointer, or accept credentials. Until later capability and runner/scheduler release proofs are accepted, the production transport/control remains absent or reject-only; deterministic fixtures may exercise the domain boundary.

### `site/domain/discovery-handler.ts` (middleware/controller, request-response)

**Analog:** `site/domain/interview-handler.ts` lines 40-87, 90-120.

**Admission, mutation guard, and closed dispatch:**

```typescript
principal = await authenticatedPrincipal(dependencies);
const rejected = validateSameOriginMutation(request, "discovery-mutation", 8192);
if (rejected) return json({ error: rejected.error }, rejected.status);
await consumeCsrfToken(database, principal.subject, csrfTokenFromRequest(request));
const body = await readBoundedJson(request, 8192);
// construct each typed command field-by-field from a closed action set
```

Use owner-only GET projection and closed actions such as `read_product_readiness`, `make_product_ready`, `start_manual_discovery`, `decide_proposal`, and `read_current_state`. Do not expose runner ingestion from this owner handler. Admit before parse, use a distinct intent, issue replacement CSRF on response, construct typed input field-by-field, and map PilotAccessError to the same neutral 404, CSRF to 403, conflict to 409, oversize to 413, unsupported to 400, and unexpected errors to opaque 500 with `no-store` and `nosniff`.

### `site/app/api/discovery/route.ts` (route/config, request-response)

**Analog:** `site/app/api/interview/route.ts` lines 1-40.

```typescript
import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../chatgpt-auth";
import { handleDiscoveryGet, handleDiscoveryPost } from "../../../domain/discovery-handler";

export const dynamic = "force-dynamic";
export async function GET() { return handleDiscoveryGet(dependencies()); }
export async function POST(request: Request) { return handleDiscoveryPost(request, dependencies()); }
```

Keep this file provider/binding wiring only. Require the established `DB`, `OWNER_SUBJECT_PEPPER`, and `PILOT_OWNER_EMAIL`; use `getChatGPTUser`; place no Product ID trust, lifecycle logic, capability decision, runner credential, or business state transition in this route.

### `site/app/discovery/discovery-workspace.tsx` (component, request-response)

**Analog:** `Knowledge` in `site/app/prospector-app.tsx` lines 466-545 and Phase 2 map lines 336-342.

Copy `credentials: "same-origin"`, `cache: "no-store"`, loading/error/neutral-denial states, server-projection replacement after success, and one logical-operation idempotency key in a ref. If a mutation outcome is unknown, retain the key, hide decision controls, show authority-unknown, and offer only **Check current version** (explicit GET); never auto-retry Ready, manual run, or a proposal decision. The workspace owns local navigation only; lifecycle, checklist, config/run/schedule IDs, proposal cards, cooldown, and availability derive from server response.

### `site/app/discovery/product-readiness.tsx` (component, request-response)

**Analog:** confirmed-state UI in `site/app/prospector-app.tsx` lines 578-624; Phase 2 map lines 378-390.

Render the complete server checklist including each missing/confirmed category, exact Confirmed Knowledge Version/digest, Product revision, and the immutable configuration digest after readiness. Use read-only `<dl>` records and escaped JSX text. The primary `Make ONE ready` button is present only for a complete, authority-known Draft Product and submits expected revision plus the exact displayed prerequisite IDs/digests. Ready has zero-Play/Profile/Offer explanatory copy, and a `Needs attention` initial-run state is visible without rolling readiness back. Paused, archived, stale, configuration-failed, or unknown states have native-disabled/absent effect controls with visible reasons.

### `site/app/discovery/proposal-cards.tsx` (component, request-response)

**Analog:** `MarketDiscovery` in `site/app/prospector-app.tsx` lines 628-630, strengthened by Phase 2 map lines 356-374 and 394-400.

Replace fixture proposal fields with authoritative card data: Product fit, problem match, audience/customer type, likely buyer, examples, cited evidence/provenance, risk, deterministic fingerprint/collision relationship, exact proposal version/digest, and cooldown/reopen history. At most three cards render per run. Label each **Suggested market — not an accepted Customer Profile**. The Explore/Defer/Dismiss action submits the exact proposal revision/digest with a stable idempotency key; Defer/Dismiss collect a required reason and display the 90/180-day outcome. During pending/unknown/malformed state, no action controls render. Explore confirmation must state it opens Draft Market Play Consensus Interview only; it must not say ready/activate/prospect.

### `site/app/prospector-app.tsx` (component/provider, event-driven composition)

**Analog:** same file lines 466-642 and Phase 2 map lines 404-415.

Replace only the Phase 1 fixture `MarketDiscovery` view with `<DiscoveryWorkspace />` after the Phase 3 accepted gate path is present. Keep the early unauthorized return and preserve the native-disabled fixture/controls for Review Queue, Prospects, contacts, schedules outside Product discovery, enrichment, exports, approvals, messages, and outbound work. A Ready Product, configuration, run, or Explore decision must never flip Profile/prospecting/outbound effects on.

### `site/app/globals.css` (config, UI transform)

**Analog:** `site/app/globals.css` lines 32-92; Phase 2 map lines 418-422.

Reuse panels, semantic status badges, 44px enabled target sizing, focus outline, responsive breakpoints, reduced-motion rule, and wrapping monospace IDs/digests. Proposal status needs text plus color: Draft/Proposed/Ready configuration/Needs attention/Cooldown/Authority unknown. Never communicate an operational effect through color alone or give cards a fixed height; evidence and collision lineage must remain inspectable on narrow screens.

### `site/tests/helpers/d1.mjs` (test utility, file-I/O + batch)

**Analog:** `site/tests/helpers/d1.mjs` lines 6-16 and 104-124; Phase 2 map lines 426-448.

Extend the existing full-migration list only after its Phase 2 filename is resolved, then apply every migration in order using `--> statement-breakpoint`. Add Phase 3 operational-table coverage to `FORBIDDEN_OPERATIONAL_TABLES` only where it helps prove the boundary: readiness/configuration/run/proposal records are Phase 3 authority state and may change; Accounts, Targets, Signals, Prospects, contacts, schedules beyond the Product discovery schedule, grants, packages/messages, exports, and external-effect records must not. Reuse `snapshotForbiddenOperationalRows`, `assertForbiddenOperationalRowsUnchanged`, and `runRace` rather than open-coding them.

### `site/tests/product-readiness-repository.test.mjs` (test, CRUD + batch + concurrency)

**Analog:** `site/tests/interview-repository.test.mjs` lines 9-193 and Phase 2 map lines 452-488.

Use real Miniflare D1 + Vite-loaded domain module + the full migration chain. Cover the pure all-missing checklist; Proposed/fixture/client flag rejection; exact confirmed-version/digest validation; zero Play/Profile/Offer readiness; canonical config replay; stale revision; lost-response/retry; competing Ready calls; one initial key/config/run/schedule; pause/archive/stale/config-failed fail-closed; and exhausted initial `Needs attention`. Each positive Ready assertion includes zero deltas for Profile readiness/prospecting, Account/Target/Prospect/contact, spend, export, approval, message, and outbound tables.

### `site/tests/market-discovery-repository.test.mjs` (test, event-driven + batch + concurrency)

**Analog:** `site/tests/interview-repository.test.mjs` lines 49-150 and Phase 2 map lines 477-488.

Use fixed clocks and deterministic normalized inputs. Test initial/monthly/manual/material-change trigger identity, pinned manifest replay, run window plus 24-hour overlap, success-only watermark, bounded schema/provenance/caps, malformed/partial authority-unknown output, deterministic max-three ordering, duplicate collision evidence attachment, fingerprint split/merge lineage, cooldown/reopen materiality, stale/retry/race convergence, and one immutable decision against exact revision/digest. Verify Explore yields a Draft Play interview only and produces no Profile Ready/prospecting/operational writes; Defer and Dismiss enforce 90/180-day cooldowns.

### `site/tests/discovery-handler-ui.test.mjs` (test, request-response + rendered regression)

**Analogs:** `site/tests/interview-handler.test.mjs` lines 24-157, `site/tests/fixture-safety.test.mjs` lines 8-47, and `site/tests/rendered-html.test.mjs` lines 34-83.

Exercise owner/outsider/no-identity, cross-owner Product ID, foreign origin, Fetch Metadata, missing/wrong intent, missing/replayed CSRF, oversized/malformed JSON, unsupported action, stale expected revision, idempotency mismatch/replay, and neutral no-store denial. Render readiness incomplete/complete/Ready/Needs-attention/paused/authority-unknown and proposal blank/malformed/cooldown/explorable states. Assert proposal cards show the required evidence/inference/fit/collision boundary and at most three; no `dangerouslySetInnerHTML`; and all Phase 4+ controls are actual native-disabled buttons with adjacent visible reasons. Assert no render or mutation creates a Profile Ready, account, target, prospect, contact, spend, export, approval, package, message, or outbound effect.

## Shared Patterns

### Authentication, tenancy, and mutation security

**Sources:** `site/app/api/interview/route.ts` lines 1-40; `site/domain/interview-handler.ts` lines 40-120; `site/domain/pilot-access.ts` lines 20-35; `site/domain/interview.ts` lines 843-879.

Routes inject trusted identity; handlers admit the configured owner before reading/parsing; domains resolve a workspace from the HMAC principal and join every Product/run/proposal through it. A client Product ID is a locator, never authority. Existing same-origin/Fetch Metadata/fixed-intent/CSRF/bounded-body and neutral 404 contracts apply to every owner mutation.

### Immutable snapshots, D1 concurrency, and replay

**Sources:** `site/domain/interview.ts` lines 366-439, 481-540, 542-620, 809-826; `docs/IMPLEMENTATION-SPEC.md` lines 104-145 and 200-210.

Build one validated canonical snapshot, hash exact bytes, persist JSON + digest + referenced version IDs/digests, then render only that persisted snapshot. Pair expected revisions, idempotency keys, unique indexes, FKs, and command guards in one batch. On conflict, only return an authoritative prior outcome when key and digest match exactly. Historical runs/results never follow an active configuration pointer.

### Proposal versus commercial authority

**Sources:** `docs/adr/0001-generic-company-product-play-model.md`; `docs/IMPLEMENTATION-SPEC.md` lines 286-290; `03-CONTEXT.md` D-07 through D-11.

Proposals are immutable, evidence-backed suggestion versions under a Product fingerprint. They are never profiles or accepted truth. Explore is a draft-interview entry; Defer/Dismiss are cooldown decisions; only future, separate authority can activate a Play/Profile or prospecting. UI copy and zero-effect tests must make that distinction explicit.

### Release gates and zero-effect assertions

**Sources:** `docs/adr/0003-untrusted-runners-and-human-gates.md`; `docs/adr/0004-private-sites-pilot-and-portability.md`; `site/tests/helpers/d1.mjs` lines 104-124; `site/tests/fixture-safety.test.mjs` lines 8-47.

Do not treat Product Ready or a scheduled/run record as permission to execute retrieval, start a runner, spend, or enact an external effect. Gate transport/release capability remains absent or reject-only until the documented proof and explicit authority exist. Tests pair every Phase 3 positive result with forbidden downstream table zero deltas and native-disabled later controls.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `site/domain/discovery-submission.ts` | service/utility | event-driven + transform | No runner/scheduler submission boundary exists in live code. Implement from the accepted untrusted-runner and hostile-source contracts, with reject-only production transport until release proofs are accepted. |
| Product scheduler adapter/transport | provider port | event-driven | No trusted hosted scheduler/runner callback proof exists. Do not add an adapter as a Phase 3 prerequisite; model deterministic domain schedule/run state and retain the release gate. |

## Planner Guardrails

- Extend the Phase 2 Company/Product/Confirmed Knowledge authority; do not seed a second Product or write a parallel configuration table that bypasses it.
- Keep readiness evaluation pure and exhaustive; never let the UI select which missing knowledge to ignore.
- Do not create placeholder Market Plays, Customer Profiles, or Offers. Product readiness with none is the accepted path.
- Do not issue runner/provider credentials, fetch external sources, silently fail over a provider, or turn a schedule row into external execution.
- Never auto-retry a consequential mutation. Preserve its idempotency key and require an explicit read after unknown authority.
- Keep Product Discovery Configuration, Run, proposal version, evidence, and decision lineage immutable. A replacement/material change becomes a new snapshot; historical replay never dereferences `current`.
- Explore means Draft Market Play Consensus Interview only. It must not create/ready a Profile or write prospecting/contact/Account/Target/Prospect/outbound state.

## Metadata

**Analog search scope:** `site/app`, `site/domain`, `site/db`, `site/drizzle`, `site/tests`, Phase 2 pattern map, accepted ADRs/specification  
**Files scanned:** 27 source/config/test/migration/planning files; 5 strong analog groups retained  
**Pattern extraction date:** 2026-07-30
