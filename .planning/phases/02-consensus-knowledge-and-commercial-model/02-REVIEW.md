---
phase: 02-consensus-knowledge-and-commercial-model
reviewed: 2026-07-30T18:49:59Z
depth: deep
files_reviewed: 32
files_reviewed_list:
  - site/tests/helpers/d1.mjs
  - site/tests/migration-chain.test.mjs
  - site/tests/commercial-model-repository.test.mjs
  - site/tests/knowledge-repository.test.mjs
  - site/tests/interview-repository.test.mjs
  - site/tests/interview-handler.test.mjs
  - site/tests/knowledge-handler.test.mjs
  - site/tests/drift-replacement.test.mjs
  - site/tests/knowledge-ui.test.mjs
  - site/package.json
  - site/package-lock.json
  - site/db/schema.ts
  - site/drizzle/0004_consensus_knowledge.sql
  - site/drizzle/meta/0004_snapshot.json
  - site/drizzle/meta/_journal.json
  - site/domain/commercial-model.ts
  - site/domain/knowledge.ts
  - site/domain/interview.ts
  - site/domain/interview-handler.ts
  - site/domain/drift.ts
  - site/domain/replacement.ts
  - site/domain/knowledge-handler.ts
  - site/app/api/knowledge/route.ts
  - site/app/knowledge/commercial-model.tsx
  - site/app/knowledge/consensus-interview.tsx
  - site/app/knowledge/knowledge-library.tsx
  - site/app/knowledge/drift-replacements.tsx
  - site/app/knowledge/knowledge-workspace.tsx
  - site/app/prospector-app.tsx
  - site/app/globals.css
  - site/scripts/phase2-hosted-preflight.mjs
  - site/scripts/phase2-gate.mjs
findings:
  critical: 5
  warning: 4
  info: 0
  total: 9
status: issues_found
---

# Phase 02: Code Review Report

**Reviewed:** 2026-07-30T18:49:59Z
**Depth:** deep
**Files Reviewed:** 32
**Status:** issues_found

## Summary

The Phase 2 implementation contains fail-open activation tooling, authority writes which can commit after an optimistic-concurrency check has failed, broken first-Offer lineage enforcement, and an unscanned-source disclosure path. These are release blockers. The review traced the D1 schema, domain commands, handler gate, CLI gate writer, and React transport. Phase 12+ hosted activation evidence was treated as out of scope; the locally callable bypass that defeats its blocked boundary is reported below.

## Critical Issues

### CR-01: The local gate writer can activate Phase 2 with fabricated evidence

**File:** `site/scripts/phase2-gate.mjs:28-67`

**Issue:** `activate` is a publicly callable CLI action and its only protection is syntactic prefix/regex checks in `assertEvidenceRelations`. Any operator with normal Wrangler/D1 credentials can provide values such as `authorization-x`, `appgprj_x~appgdep_y`, and `independent-review-x`; line 67 then executes the immutable insert. There is no separately authenticated human authorization, evidence verification, or Plan 19-only runtime interlock. `handleKnowledgePost` accepts that row as activation based only on nonempty columns and a 64-character digest at `site/domain/knowledge-handler.ts:149-152`. This locally bypasses the explicitly blocked hosted activation boundary.

**Fix:** Remove or hard-disable `activate` until its separately authorized release plan. When activation is introduced, require a verified, server-side authorization artifact and recompute/verify the canonical tuple digest in the handler before enabling writes; do not treat user-supplied reference-shaped strings as proof.

### CR-02: Proposal review can promote stale knowledge after its revision guard loses a race

**File:** `site/domain/knowledge.ts:52-82`

**Issue:** The code reads and validates `proposal.revision` at line 59, but the batch at lines 65-81 inserts the authority command, decision, Knowledge Item, and confirmed Knowledge Version before issuing the guarded proposal update at line 78. SQLite/D1 does not make an `UPDATE ... WHERE revision = ?` that changes zero rows fail the batch. A concurrent reviewer can therefore change the proposal between the read and batch: this invocation still commits a confirmed version and audit record even though its final `UPDATE` matched nothing. That violates immutable authority and the required D1 concurrency contract.

**Fix:** Put the revision predicate on an insert whose success is required (for example an `INSERT ... SELECT ... FROM knowledge_proposals WHERE id = ? AND revision = ? AND status = 'proposed'`), or perform the guarded update first and explicitly abort/roll back when `meta.changes !== 1` before any decision/version insert. Add a two-key concurrent-review regression test proving only one decision/version commits.

### CR-03: The first-Offer lineage does not bind the Offer's profile to the confirmed proposal

**File:** `site/domain/commercial-model.ts:162-178`

**Issue:** `materializeOfferFromConfirmedHierarchyDecision` proves only that the supplied question, answer, decision, version, command, audit event, and arbitrary `profileId` are in the same workspace. Its query at lines 165-171 never joins `knowledge_proposals.destination_scope_id` (or the stored snapshot destination) to `p.id`. The migration trigger repeats the same omission at `site/drizzle/0004_consensus_knowledge.sql:415-421`. A valid hierarchy decision for one profile can consequently be used to create an Offer under another profile in the workspace, breaking first-Offer parentage and immutable decision lineage.

**Fix:** Require the proposal/version's destination scope to be `customer_profile` and equal `NEW.profile_id`/`input.profileId` in both the helper query and `offer_lineage_insert`; ideally make the exact profile ID a stored, foreign-keyed lineage field rather than resolving a display locator after the decision.

### CR-04: The generalized decision splits one authority transition into multiple transactions

**File:** `site/domain/interview.ts:627-663`

**Issue:** `recordInterviewDecision` first commits `reviewKnowledgeProposal` (including a confirmed version) at lines 627-633, then separately attempts to close the question/session and insert the interview confirmation at lines 639-647, and later creates the Offer in a third write at lines 655-661. If the latter batch loses a concurrent race or fails, the catch at lines 648-650 throws while leaving already-confirmed knowledge with no corresponding interview confirmation; a retry finds the preexisting proposal decision and cannot restore a coherent atomically linked decision. The final Offer operation can similarly fail after the confirmation has committed. This violates the Answer → Decision → Confirmed Version/Offer atomic lineage promised by the phase.

**Fix:** Move proposal decision, version, answer binding, interview confirmation, audit, session/question transition, and any Offer materialization into one database transaction with all state predicates enforced as required inserts/updates. Add failure-injection and concurrent-decision tests asserting no partial authority state remains.

### CR-05: Quarantined upload content is returned and rendered despite the quarantine

**File:** `site/domain/knowledge.ts:30-43, 96`

**Issue:** A `quarantined_upload` stores `value.excerpt` in `source_excerpts.content` and `knowledge_proposals.value_json` at lines 30-33. `proposalById` unconditionally deserializes and returns that value at line 96. The Knowledge API's library projection includes those proposal objects (`readKnowledgeLibrary` at line 85), and the UI renders `item.value.excerpt` at `site/app/knowledge/knowledge-library.tsx:23`. The `readKnowledgeContent` denial at lines 87-88 does not protect this already exposed path. Thus unscanned content is disclosed/rendered as normal plain text.

**Fix:** For quarantined inputs, persist only opaque custody metadata and a digest—never an excerpt/value available to normal projection. Exclude quarantined proposals from `listKnowledge` or return a redacted metadata-only view, and add an API/UI regression test that the raw upload text cannot appear in any response or rendered output.

## Warnings

### WR-01: Draft creation can commit after the parent revision check loses a race

**File:** `site/domain/commercial-model.ts:142-158`

**Issue:** The first batch statement conditionally inserts an authority command only if the parent still has the expected revision (lines 143-145), but the draft entity and audit inserts are unconditional following statements. If the guarded `INSERT ... SELECT` produces zero rows, D1 still commits the child entity/audit. The optimistic concurrency control is therefore advisory rather than enforced.

**Fix:** Make the child insert depend on the same parent/revision predicate, or update the parent revision first and require one changed row before creating the child. Add a race test which mutates the parent after lookup and proves no draft/audit is created.

### WR-02: Retry paths accept a reused idempotency key for different operations

**File:** `site/domain/knowledge.ts:57-63`; `site/domain/replacement.ts:49-53`

**Issue:** Both functions look up a prior command/key and return its result without comparing its stored `operation_digest` to the digest calculated for the new request. Unlike `initializeCommercialModel` and `activateReplacement`, a reused key with a changed decision, correction, target, candidate input, or revision silently returns an unrelated prior result instead of a conflict.

**Fix:** Select `operation_digest` with the prior row and reject when it differs from the newly computed digest. Cover changed-payload same-key retries for review and candidate creation.

### WR-03: The Knowledge UI cannot propose a change from a confirmed Knowledge card

**File:** `site/app/knowledge/knowledge-workspace.tsx:107`

**Issue:** For a `KnowledgeItemProjection`, `proposalPayload` uses `source.destination.id` as `destination.locator`. The domain resolver only looks up a destination by `name` (`site/domain/knowledge.ts:94`), so the UUID-like scope ID emitted by the UI cannot resolve. Clicking “Propose change” on every confirmed card returns `command_conflict`.

**Fix:** Return a display locator/name in the server projection and send it, or change the command contract to accept a server-validated scope ID and resolve it with workspace/type checks.

### WR-04: The D1 immutability trigger permits semantic/digest mutation of confirmed versions

**File:** `site/drizzle/0004_consensus_knowledge.sql:430-431`

**Issue:** The trigger protects only five columns. It permits updates to `value_digest`, `knowledge_item_id`, `scope_type`, `scope_id`, and `kind`, allowing the recorded digest, owner/scope, or current-item linkage of a confirmed version to change in place. This undermines the stated immutable authority even if the current domain code does not perform such an update.

**Fix:** Use a before-update trigger that rejects every update except the explicitly allowed lifecycle fields (`status`, timestamps, and revision if supersession is required), and separately assert that no update can alter a version's semantic value, digest, scope, or lineage.

---

_Reviewed: 2026-07-30T18:49:59Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
