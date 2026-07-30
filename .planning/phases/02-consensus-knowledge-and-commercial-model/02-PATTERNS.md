# Phase 02: Consensus Knowledge and Commercial Model - Pattern Map

**Mapped:** 2026-07-30
**Files analyzed:** 24 likely new/modified files
**Analogs found:** 23 / 24

## Authority Baseline

The closest code is the Phase 1 owner-scoped Consensus Interview, but it is an outer-shell analog, not a complete Phase 2 authority model. Copy its trusted-principal injection, workspace lookup, immutable answer snapshot, idempotency, D1 batch, neutral denial, and race-test patterns. Do **not** copy its remaining single-question assumptions, hard-coded confirmation display, application-only optimistic guards, or mixed `knowledge_versions.status` model.

These contracts apply to every assignment below:

- Workspace authority is derived only from `getChatGPTUser` -> `admitPilotOwner` -> HMAC principal -> owner-subject D1 lookup. Client `workspaceId`, company, entity, destination, or URL parameters are locators only and never grant scope.
- Database constraints own `Company -> Product -> Market Play -> Customer Profile -> Offer` parentage, Company-wide Organization/Contact identity, Market Play/Profile-scoped associations, one live session, one active question, one decision per reviewed snapshot, and one active configuration.
- Answer/proposal, decision, Knowledge Version, replacement candidate, activation, and audit records are immutable. Accept/Correct/Rescope append a Knowledge Version; Reject appends only a decision/audit record. Never update confirmed values or configuration manifests in place.
- Every consequential operation uses an exact server-constructed snapshot and digest containing the reviewed proposal/answer, sorted prerequisite Knowledge Version IDs and digests, destination scope, decision payload, and expected revisions. UI views render that stored snapshot verbatim as escaped JSX text.
- Phase 2 creates no operational authority. Later discovery, prospecting, contacts, schedules, spend, exports, approvals, packages, messages, and outbound effects stay natively disabled after knowledge confirmation and replacement activation.
- Every D1 integration test starts from the full migration chain (`0000` through the new migration), includes bound and legacy-unbound fixtures where relevant, and pairs a positive authority assertion with a forbidden-operational-table zero-delta assertion.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `site/db/schema.ts` | model/config | CRUD + batch | `site/db/schema.ts` | exact |
| `site/drizzle/0004_<generated>.sql` | migration | batch | `site/drizzle/0001_true_spencer_smythe.sql` | role-match |
| `site/domain/commercial-model.ts` | service/model | CRUD + request-response | `site/domain/interview.ts` | role-match |
| `site/domain/knowledge.ts` | service/model | CRUD + request-response | `site/domain/interview.ts` | exact outer-shell |
| `site/domain/interview.ts` | service/model | request-response | `site/domain/interview.ts` | exact extension |
| `site/domain/drift.ts` | utility | transform/graph traversal | none in live codebase | no analog |
| `site/domain/replacement.ts` | service | batch + request-response | `site/domain/interview.ts` | exact transaction shape |
| `site/domain/knowledge-handler.ts` | middleware/controller | request-response | `site/domain/interview-handler.ts` | exact |
| `site/app/api/knowledge/route.ts` | route/config | request-response | `site/app/api/interview/route.ts` | exact |
| `site/app/knowledge/knowledge-workspace.tsx` | component | request-response | `Knowledge` in `site/app/prospector-app.tsx` | role-match |
| `site/app/knowledge/commercial-model.tsx` | component | request-response | shell/scope UI in `site/app/prospector-app.tsx` | role-match |
| `site/app/knowledge/consensus-interview.tsx` | component | request-response | `Knowledge` in `site/app/prospector-app.tsx` | exact extraction |
| `site/app/knowledge/knowledge-library.tsx` | component | request-response | confirmed/interview panels in `site/app/prospector-app.tsx` | role-match |
| `site/app/knowledge/drift-replacements.tsx` | component | request-response | capability evidence/status panels in `site/app/prospector-app.tsx` | role-match |
| `site/app/prospector-app.tsx` | component/provider | event-driven composition | `site/app/prospector-app.tsx` | exact modification |
| `site/app/globals.css` | config | UI transform | `site/app/globals.css` | exact |
| `site/tests/helpers/d1.mjs` | test utility | file-I/O + batch | inline `applyMigrations`/`count` in `site/tests/interview-repository.test.mjs` | exact extraction |
| `site/tests/commercial-model-repository.test.mjs` | test | CRUD + batch | `site/tests/interview-repository.test.mjs` | role-match |
| `site/tests/knowledge-repository.test.mjs` | test | CRUD + concurrency | `site/tests/interview-repository.test.mjs` | exact outer-shell |
| `site/tests/interview-repository.test.mjs` | test | request-response + concurrency | same file | exact extension |
| `site/tests/drift-replacement.test.mjs` | test | transform + batch + concurrency | `site/tests/interview-repository.test.mjs` | role-match |
| `site/tests/knowledge-handler.test.mjs` | test | request-response | `site/tests/interview-handler.test.mjs` | exact |
| `site/tests/interview-handler.test.mjs` | test | request-response | same file | exact extension |
| `site/tests/knowledge-ui.test.mjs` | test | rendered/source regression | `site/tests/fixture-safety.test.mjs` + `site/tests/rendered-html.test.mjs` | exact |

`site/package.json` and `site/package-lock.json` are conditional rather than assumed Phase 2 edits. Change them only after the research-required human checkpoint approves `uuid`; do not hand-roll UUIDv7 or install a package implicitly.

## Pattern Assignments

### `site/db/schema.ts` (model/config, CRUD + batch)

**Analog:** `site/db/schema.ts`

**Imports and shared columns** (lines 1-8):

```typescript
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const auditColumns = {
  workspaceId: text("workspace_id").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  revision: integer("revision").notNull().default(1),
};
```

**Constraint style** (lines 22-25):

```typescript
export const interviewQuestions = sqliteTable("interview_questions", {
  // ...
  sessionId: text("session_id").notNull().references(() => interviewSessions.id),
  // ...
}, (t) => [uniqueIndex("question_version_unique").on(t.workspaceId, t.sessionId, t.version)]);

export const interviewAnswers = sqliteTable("interview_answers", {
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
  sessionId: text("session_id").notNull().references(() => interviewSessions.id),
  questionId: text("question_id").notNull().references(() => interviewQuestions.id),
  // ...
}, (t) => [
  uniqueIndex("answer_question_unique").on(t.workspaceId, t.questionId),
  uniqueIndex("answer_idempotency_unique").on(t.workspaceId, t.idempotencyKey),
]);
```

**Required Phase 2 augmentation:** define real `companies` and `offers` tables and foreign keys for every hierarchy edge. `offers.profile_id` is required; an Offer directly under Market Play violates the locked hierarchy. Stable knowledge items, proposals, sources/custody, decisions, immutable versions, prerequisite joins, typed-configuration dependencies, artifact dependencies, drift records, impact snapshots, replacement candidates, and activations must be separate relational authority records rather than JSON-only status flags.

Use partial unique indexes in the SQL migration for live-state invariants where Drizzle cannot express them cleanly:

```sql
CREATE UNIQUE INDEX one_active_question_per_session
ON interview_questions(workspace_id, session_id)
WHERE status = 'active';

CREATE UNIQUE INDEX one_active_config_per_owner
ON typed_configurations(workspace_id, owner_type, owner_id, kind)
WHERE active = 1;
```

Also constrain one live interview session per exact destination scope. Scope legality must be validated both by typed columns/FKs and by domain code; a free-form `scope_type/scope_id` pair is not sufficient authority.

---

### `site/drizzle/0004_<generated>.sql` (migration, batch)

**Analog:** `site/drizzle/0001_true_spencer_smythe.sql`

**Additive table/index/FK pattern** (lines 1-37):

```sql
CREATE TABLE `interview_answers` (
  `id` text PRIMARY KEY NOT NULL,
  `workspace_id` text NOT NULL,
  `session_id` text NOT NULL,
  `question_id` text NOT NULL,
  `idempotency_key` text NOT NULL,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`session_id`) REFERENCES `interview_sessions`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`question_id`) REFERENCES `interview_questions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `answer_question_unique`
ON `interview_answers` (`workspace_id`,`question_id`);
```

Generate from `schema.ts`, then inspect/customize SQL for partial indexes and the expand/backfill/contract sequence. Apply additively to hosted legacy state: create one Company per workspace, attach the existing historian Knowledge Version to a stable knowledge item without changing its value/digest/decision lineage, and preserve legacy-unbound quarantine. Do not repeat the old `PRAGMA foreign_keys=OFF` pattern from migration `0001`; research records D1 foreign-key enforcement as always on.

---

### `site/domain/commercial-model.ts` (service/model, CRUD + request-response)

**Analog:** `site/domain/interview.ts`

**Owner-derived lookup** (lines 843-861):

```typescript
async function ownedWorkspace(database: D1Database, principal: InterviewPrincipal) {
  const workspace = await workspaceForPrincipal(database, principal);
  if (!workspace) throw new InterviewConflictError("Workspace is not initialized");
  return workspace;
}

async function workspaceForPrincipal(database: D1Database, principal: InterviewPrincipal) {
  return database
    .prepare("SELECT id, company_name FROM workspaces WHERE owner_subject = ? LIMIT 1")
    .bind(principal.subject)
    .first();
}
```

Every hierarchy read/write begins from this admitted workspace and joins through exact parents. Never accept a client workspace ID as the root predicate. Seed only `Digitalrain -> ONE -> ONE for Mining -> Operating`; Greenfield remains Draft/nurture, and no placeholder Offer is invented. Company-wide Organization/Contact tables may exist, but Phase 2 exposes no operational creation command; scoped Account/Target/relevance/evidence/qualification/outreach associations remain inert projections.

---

### `site/domain/knowledge.ts` (service/model, CRUD + request-response)

**Analog:** `site/domain/interview.ts`

**Exact snapshot construction** (lines 366-382):

```typescript
const proposal = {
  questionId: current.id,
  questionRevision: current.revision,
  prompt: current.prompt,
  premise: research.premise,
  inference: research.inference,
  provenance: research.provenance,
  recommendation: current.recommendation,
  value: confirmedPolicyValue(),
};
const proposalJson = JSON.stringify(proposal);
const proposalDigest = await sha256(proposalJson);
const operationDigest = await answerOperationDigest(input, proposalDigest);
```

**Snapshot integrity validation** (lines 809-826):

```typescript
if ((await sha256(raw)) !== expectedDigest)
  throw new InterviewConflictError("The submitted policy snapshot failed integrity checks");
const proposal = JSON.parse(raw) as Partial<ProposalSnapshot>;
if (/* any required typed field is missing */)
  throw new InterviewConflictError("The submitted policy snapshot is incomplete");
return proposal as ProposalSnapshot;
```

Extend the fixed-order snapshot with exact destination, normalized provenance/custody/privacy/license/reuse fields, sorted prerequisite version IDs/digests, and current confirmed comparison. Reject unknown authority-bearing fields. All upload/import/research/edit/reuse paths create Proposed Knowledge only. Cross-Company reuse requires an allowlisted package and must exclude contacts, prospects, outreach, suppression, secrets, and unapproved private sources. Every destination still requires a separate owner decision.

---

### `site/domain/interview.ts` (service/model, request-response)

**Analog:** existing file, extended rather than replaced.

**Separate immutable answer transaction** (lines 387-439):

```typescript
await database.batch([
  database.prepare(
    `UPDATE interview_questions SET status = 'answered', revision = revision + 1, updated_at = ?
     WHERE id = ? AND workspace_id = ? AND status = 'active' AND revision = ?`,
  ).bind(now, current.id, workspace.id, input.expectedRevision),
  database.prepare(
    `INSERT INTO interview_answers
     (id, workspace_id, session_id, question_id, question_revision, choice,
      correction_json, idempotency_key, operation_digest, proposal_json,
      proposal_digest, created_at)
     VALUES (?, ?, ?, ?, ?, 'accept_recommendation', NULL, ?, ?, ?, ?, ?)`,
  ).bind(/* server-derived values */),
  database.prepare(`INSERT INTO audit_events (...) VALUES (...)`).bind(/* owner audit */),
]);
```

**Separate immutable decision/version transaction** (lines 542-609):

```typescript
await database.batch([
  database.prepare(`UPDATE interview_questions ... WHERE ... revision = ?`).bind(/* ... */),
  database.prepare(`UPDATE interview_sessions ... WHERE ... revision = ?`).bind(/* ... */),
  database.prepare(`INSERT INTO knowledge_versions (...) VALUES (...)`).bind(/* ... */),
  database.prepare(`INSERT INTO interview_confirmations (...) VALUES (...)`).bind(/* ... */),
  database.prepare(`INSERT INTO audit_events (...) VALUES (...)`).bind(/* ... */),
]);
```

Generalize confirmation as one discriminated command with `accept`, `reject`, `correct`, and `rescope`. Accept/Correct/Rescope append a Knowledge Version; Reject must leave version count unchanged. Keep one Active question via a partial unique index. Add prerequisite/source joins and ensure operation digests cover decision, reviewed snapshot digest, prerequisite digests, destination, corrected/rescoped content, and expected revisions.

Important correction to the analog: a guarded `UPDATE` that affects zero rows does not fail a D1 batch. Phase 2 must insert an expected-revision command/decision guard selected from the current authoritative row and make later inserts FK-reference it, so stale authority causes a statement failure and rollback. Unique indexes remain the final race arbiter.

Preserve the legacy quarantine style (lines 893-931): supersede only detached legacy-derived authority, archive/supersede its workflow rows, and append one idempotent quarantine audit. Never silently bind or upgrade `legacy-unbound` records.

---

### `site/domain/drift.ts` (utility, transform/graph traversal)

**Analog:** no live codebase analog; use the pure evaluator in `02-RESEARCH.md` rather than embedding traversal in a handler/component.

Required shape:

```typescript
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

Risk is an explicit allowlist: capability, proof point, claim guardrail, offer, suppression. Unknown kinds default to standard/no operational effect. Traverse only persisted `source -> knowledge version -> typed configuration -> affected artifact` edges; never pause by workspace/company broad filter. The sorted reached set and status/count projection become part of the persisted impact digest.

---

### `site/domain/replacement.ts` (service, batch + request-response)

**Analog:** `site/domain/interview.ts` lines 453-620.

Copy the sequence: validate ID/revision/key -> resolve owner workspace -> load exact stored candidate/preview -> compute operation digest -> detect same-key replay -> verify current state -> transactional append -> on uniqueness failure read the winner by key/digest -> return authoritative state.

Candidate creation and activation are separate commands. Candidate creation appends the new knowledge/configuration and a full immutable impact snapshot but leaves it inactive. Activation verifies the exact candidate preview digest/revisions, preserves the prior configuration, moves only the active pointer/status, appends containment/audit records, and performs zero future-phase writes. It records schedule/requalification/invalidation effects as impact categories only; Phase 2 must not execute them.

---

### `site/domain/knowledge-handler.ts` (middleware/controller, request-response)

**Analog:** `site/domain/interview-handler.ts`

**Admission and mutation boundary** (lines 40-86):

```typescript
principal = await authenticatedPrincipal(dependencies);
const rejected = validateSameOriginMutation(request, "interview-mutation", 8192);
if (rejected) return json({ error: rejected.error }, rejected.status);
await consumeCsrfToken(database, principal.subject, csrfTokenFromRequest(request));
const body = await readBoundedJson(request, 8192);
// dispatch a closed action set
```

**Error mapping** (lines 78-86, 111-120):

```typescript
if (error instanceof PilotAccessError) return privateWorkspaceUnavailable();
if (error instanceof CsrfTokenError) return json({ error: error.code }, 403);
if (error instanceof InterviewConflictError)
  return json({ error: error.code, message: error.message }, 409);

return Response.json(value, {
  status,
  headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" },
});
```

Use a distinct fixed intent such as `knowledge-mutation`. Admit the principal before parsing or acting. Dispatch only known actions and construct typed command inputs field-by-field; never forward arbitrary body JSON. Neutral unauthorized responses reveal no company, hierarchy, counts, source references, versions, or existence.

---

### `site/app/api/knowledge/route.ts` (route/config, request-response)

**Analog:** `site/app/api/interview/route.ts` lines 1-40.

```typescript
import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../chatgpt-auth";
import { handleKnowledgeGet, handleKnowledgePost } from "../../../domain/knowledge-handler";

export const dynamic = "force-dynamic";

export async function GET() {
  return handleKnowledgeGet(dependencies());
}

export async function POST(request: Request) {
  return handleKnowledgePost(request, dependencies());
}
```

Keep provider/binding wiring only. Require the existing `DB`, `OWNER_SUBJECT_PEPPER`, and `PILOT_OWNER_EMAIL` bindings unchanged, inject `getChatGPTUser`, and put no business decisions or client-header identity logic in the route.

---

### `site/app/knowledge/knowledge-workspace.tsx` (component, request-response)

**Analog:** `Knowledge` in `site/app/prospector-app.tsx` lines 466-545 plus shell lines 127-139.

Copy `credentials: "same-origin"`, `cache: "no-store"`, explicit loading/error states, and owner-neutral full-page denial. Own local view navigation and the authoritative scope path, but derive all hierarchy labels/counts/statuses from the admitted server projection. Use links/buttons with `aria-current`, not custom ARIA tabs.

On malformed/partial response, hide mutation controls and show the UI-spec authority-unknown copy. A network-unknown outcome may trigger only an explicit read (`Check current version`); it must not auto-retry a mutation.

---

### `site/app/knowledge/commercial-model.tsx` (component, request-response)

**Analog:** shell/scope UI in `site/app/prospector-app.tsx` lines 98-123 and 623-624.

Render a nested semantic list with independent expansion and selection buttons. The path is always Company -> Product -> Market Play -> Customer Profile -> Offer and is server-projected. Do not show a fixture-only scope as live. Product/Play/Profile/Offer forms submit expected revision and idempotency key; successful responses replace the local projection with the returned authoritative state.

No Phase 2 hierarchy state is labelled operationally Ready. Discovery/prospecting/profile schedule controls remain native `disabled` with adjacent visible boundary copy.

---

### `site/app/knowledge/consensus-interview.tsx` (component, request-response)

**Analog:** `Knowledge` in `site/app/prospector-app.tsx` lines 466-620.

**Logical-operation idempotency** (lines 547-566):

```typescript
pendingKey.current ??= crypto.randomUUID();
void mutate({
  action: "submit_recommendation_answer",
  questionId: interview.question.id,
  expectedRevision: interview.question.revision,
  idempotencyKey: pendingKey.current,
});
```

Keep the same key for the same logical operation after an unknown outcome; clear it only after the server verifies the authoritative result. Use a different key for Stage 2. During pending state, keep the exact reviewed snapshot visible and disable all competing actions.

Do **not** copy the hard-coded submitted answer at lines 601-606. Stage 2 must render the exact server snapshot: answer/proposal digest, question revision, sorted prerequisite versions/digests, and destination. Present exactly Accept, Reject, Correct, Rescope. Focus the Stage 2 heading after submission. Reload/races project server states such as answer submitted elsewhere, decision completed elsewhere, stale revision, or superseded question; never increment question numbers optimistically.

---

### `site/app/knowledge/knowledge-library.tsx` (component, request-response)

**Analog:** confirmed knowledge rendering in `site/app/prospector-app.tsx` lines 615-620.

```tsx
<dl className="confirmation-proof">
  <div><dt>Knowledge version</dt><dd>{confirmed.knowledgeVersionId}</dd></div>
  <div><dt>Audit event</dt><dd>{confirmed.auditEventId}</dd></div>
  <div><dt>Confirmed</dt><dd>{formatToronto(confirmed.confirmedAt)}</dd></div>
</dl>
```

Proposed and Confirmed are separate projections. Proposed cards show full provenance/custody/privacy/license/destination/current difference and the sentence “Proposed Knowledge has no authority until you promote it.” Confirmed cards are read-only, show immutable version/decision/audit/provenance/supersession/dependencies, and use **Propose change**, never Edit-in-place. Render source/import text as JSX children; never use `dangerouslySetInnerHTML`.

---

### `site/app/knowledge/drift-replacements.tsx` (component, request-response)

**Analog:** status/evidence components in `site/app/prospector-app.tsx` lines 295-318 and Phase 1 panel styles.

Reuse full-word semantic badges with a glyph plus text, monospace wrapping for IDs/digests, and `role="alert"` for conflicts. Drift cards must show current versus proposed, provenance, exact dependency paths, affected counts/status, containment, and all four owner decisions. High-risk is amber, not destructive red, and only dependency-reached outbound can be labelled paused.

Impact preview and activation are separate non-modal screens. `Create replacement candidate` must return `Candidate — not active`; only the second CTA says `Activate replacement`. Even `Replacement active` leaves all later operational controls natively disabled.

---

### `site/app/prospector-app.tsx` (component/provider, event-driven composition)

**Analog:** same file lines 49-128.

Move the oversized Knowledge implementation into `app/knowledge/*`; retain only shell/navigation composition. Preserve the unauthorized early return:

```tsx
if (access === "unauthorized") return <PrivateWorkspaceUnavailable />;
```

Replace the Knowledge fixture with `<KnowledgeWorkspace />`, but keep Market Discovery, Review Queue, Prospects, exports, and other future-phase effects disabled. Never allow a confirmed Knowledge Version or active replacement to flip those controls on.

---

### `site/app/globals.css` (config, UI transform)

**Analog:** `site/app/globals.css` lines 32-92.

Reuse the manual CSS system: 9px panels, 7px controls, 12px status pills, 44px enabled targets, 2px focus outline/offset, semantic text+color states, 1050/760/480 breakpoints, and reduced-motion rule. Phase 2’s UI spec overrides older arbitrary 9/10/11/18/25px type sizes inside the fixture: use only 12px body, 10px label, 16px heading, 28px display and weights 400/760. Preserve wrapping for mono IDs and dependency paths and never give cards fixed heights.

---

### `site/tests/helpers/d1.mjs` (test utility, file-I/O + batch)

**Analog:** `site/tests/interview-repository.test.mjs` lines 294-321 and `site/tests/interview-handler.test.mjs` lines 183-196.

```javascript
export async function applyMigrations(database) {
  for (const filename of [
    "0000_jittery_meteorite.sql",
    "0001_true_spencer_smythe.sql",
    "0002_eager_supreme_intelligence.sql",
    "0003_acoustic_magik.sql",
    "0004_<generated>.sql",
  ]) {
    const sql = await readFile(new URL(`../../drizzle/${filename}`, import.meta.url), "utf8");
    for (const statement of sql.split("--> statement-breakpoint")) {
      const trimmed = statement.trim();
      if (trimmed) await database.prepare(trimmed).run();
    }
  }
}
```

Centralize Miniflare creation, full migration application, row counts, legacy-bound/unbound fixtures, and race helpers. Never create only the newest schema in a test. Export a forbidden-table snapshot helper and compare before/after every Phase 2 mutation. The manifest must cover actual operational tables for Runs, Accounts, Signals, Contacts, Candidates, Prospects, schedules, approvals/grants, packages, messages, exports, and related downstream state; adding a new operational table requires adding it to this helper.

---

### Repository/concurrency tests

**Applies to:**

- `site/tests/commercial-model-repository.test.mjs`
- `site/tests/knowledge-repository.test.mjs`
- `site/tests/interview-repository.test.mjs`
- `site/tests/drift-replacement.test.mjs`

**Analog:** `site/tests/interview-repository.test.mjs` lines 9-193.

**Real D1 setup** (lines 9-22):

```javascript
const vite = await createServer({ configFile: false, logLevel: "silent" });
const miniflare = new Miniflare({
  modules: true,
  script: "export default { fetch() { return new Response('ok') } }",
  d1Databases: { DB: "prospector-interview-test" },
});
const database = await miniflare.getD1Database("DB");
await applyMigrations(database);
const domain = await vite.ssrLoadModule(/* domain module */);
```

**Race convergence** (lines 49-78, 105-150):

```javascript
const race = await Promise.allSettled(
  inputs.map((input) => domain.submitRecommendationAnswer(database, owner, input)),
);
assert.equal(race.filter((result) => result.status === "fulfilled").length, 1);
assert.equal(await count(database, "interview_answers"), 1);
assert.equal(await count(database, "knowledge_versions"), 0);
```

Commercial tests prove exact parent FKs, Company-wide identity uniqueness, scoped relationship uniqueness, initial seed, no placeholder Offer, and no Phase 2 operational writes. Knowledge/interview tests cover all four decisions, exact source/prerequisite/destination snapshot stability, idempotent retry, stale revision, response loss, two-tab answer/decision races, supersession, one active question, immutable predecessor/successor lineage, and legacy quarantine. Drift/replacement tests prove allowlisted risk, deterministic reached-only impact, inactive candidate, separate activation, preserved old configuration, stale/race rejection, and zero operational effects.

---

### Handler/security tests

**Applies to:**

- `site/tests/knowledge-handler.test.mjs`
- `site/tests/interview-handler.test.mjs`

**Analog:** `site/tests/interview-handler.test.mjs` lines 24-96 and 119-157.

Copy injected owner/outsider identities, one-time cookie assertions, same-origin/intent/content-type/body-limit failures, neutral 404 denial, and before/after row-count equality. Assert route source contains `getChatGPTUser` and does not trust authentication headers. Extend the matrix across every new command and verify stale conflicts are 409 with no authority delta.

---

### `site/tests/knowledge-ui.test.mjs` (test, rendered/source regression)

**Analogs:** `site/tests/fixture-safety.test.mjs` lines 8-47 and `site/tests/rendered-html.test.mjs` lines 34-83.

```javascript
const html = renderToStaticMarkup(createElement(ProspectorApp, props));
assert.match(html, /Private workspace unavailable/);
assert.doesNotMatch(html, /Digitalrain|ONE for Mining|audit reference/i);
assert.match(html, new RegExp(`<button(?=[^>]*disabled)[^>]*>${escaped}</button>`));
```

Cover four local Knowledge views, exact UI-spec copy, semantic states, exact server snapshot fields, text-only source rendering, empty/read-error/conflict/unknown-outcome states, accessibility headings/live regions, hierarchy semantics, responsive source assertions, and native-disabled later controls. Unlike old fixture controls that rely on `title`, Phase 2 requires adjacent visible disabled reasons.

## Shared Patterns

### Authentication and Workspace Authority

**Sources:** `site/app/api/interview/route.ts` lines 1-40; `site/domain/interview-handler.ts` lines 28-37 and 90-109; `site/domain/pilot-access.ts` lines 20-35; `site/domain/interview.ts` lines 843-879.

Apply to every handler/domain command. The route injects trusted identity, the handler admits the configured owner, and the domain resolves workspace by the derived principal subject. Client identifiers never establish tenancy. Unauthorized is always the same no-store 404 projection.

### D1 Authority and Concurrency

**Sources:** `site/db/schema.ts` lines 22-27; `site/domain/interview.ts` lines 323-450 and 453-620.

All SQL is prepared and bound. Expected revisions, idempotency keys, unique indexes, FKs, and transaction-failing command guards work together. Catching a batch error is allowed only to read the authoritative winner by workspace/key and compare its digest; never convert an unrelated failure into success.

### Immutable Decisions and Exact Snapshots

**Source:** `site/domain/interview.ts` lines 366-438, 481-540, 558-609, and 778-826.

Serialize one validated fixed-order snapshot, hash those exact bytes, store JSON+digest, and render that stored JSON for later review. Decision and audit records append; Confirmed Knowledge and active configuration bodies never update in place. The digest must bind prerequisites and destination, which the Phase 1 analog does not yet do.

### Error and Conflict Projection

**Sources:** `site/domain/interview-handler.ts` lines 78-86 and 111-120; `site/app/prospector-app.tsx` lines 472-545.

Map admission to neutral 404, CSRF to 403, stale/concurrent domain conflicts to 409, oversize to 413, unsupported action to 400, and unexpected errors to opaque 500. All responses are `no-store`/`nosniff`. The UI does not infer success from local state; after unknown authority it offers an explicit read-only current-version check.

### Native-Disabled Future Effects

**Sources:** `site/app/prospector-app.tsx` lines 98-120, 587-620, and 628-641; `site/tests/fixture-safety.test.mjs` lines 8-47.

Keep the native `disabled` attribute and adjacent visible explanation on discovery, prospecting, contact, schedule, spend, export, approval, message, and outbound controls. Confirmation or activation changes knowledge/configuration authority only. Tests assert disabled HTML and forbidden-table zero deltas.

### Full-Migration Test Setup

**Source:** `site/tests/interview-repository.test.mjs` lines 294-307.

Every Phase 2 D1 test applies `0000`, `0001`, `0002`, `0003`, and the new migration in order via statement breakpoints. Tests include pre-existing Phase 1 rows and legacy-unbound records so migration/backfill behavior is exercised, not merely an empty latest schema.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `site/domain/drift.ts` | utility | transform/graph traversal | No live dependency-graph evaluator exists; use the pure, sorted evaluator specified in `02-RESEARCH.md` and test it independently. |

## Planner Guardrails

- Prefer extending `site/domain/interview.ts` for interview state and introducing narrow sibling domain modules for hierarchy, knowledge, drift, and replacement. Do not create a second, disconnected interview persistence model.
- Do not expose an upload activation route. R2 custody may remain opaque/quarantined, but no parser/rendering path is allowed until an approved scanner exists.
- Do not seed an Offer. The first Offer is an owner-confirmed hierarchy-completion decision.
- Do not derive Product/Play/Profile authority from current fixture strings or `workspaces.company_name`.
- Do not treat a dependency edge as operational authorization.
- Do not activate hosted Phase 2 writes until the documented hosted migration preflight and outstanding Phase 1 second-real-principal gate are satisfied.

## Metadata

**Analog search scope:** `site/app`, `site/domain`, `site/db`, `site/drizzle`, `site/tests`
**Files scanned:** 39 source/config/test/migration files in `site/`; 5 strong analog groups retained
**Pattern extraction date:** 2026-07-30
