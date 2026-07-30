---
phase: 07
status: planning-ready
research_mode: repository-and-contract-only
created: 2026-07-30
---

# Phase 7: Mining Pilot Handoff and Recovery — Technical Research

<research_findings>
## Established Architecture to Extend

The repository contract calls for a private, server-authorized Site with D1 for structured operational records, R2 for documents/export artifacts, immutable versioned decisions, audit events, provider-neutral ports, and current eligibility projections. Phase 7 extends that shape with a report/export/archive boundary. It must not turn the application into a CRM or allow reporting/export to bypass upstream authority.

`docs/IMPLEMENTATION-SPEC.md` locks the decisive facts: ExportReady is a current projection, only fresh `mailbox_verified`/`source_verified` contacts can be handed off, package approval is required, Company-wide suppression survives export/restore, exports are retained for seven days by default, and workspace restore must be clean-deployment, encrypted, versioned, dry-run-first, and fail closed.

## Recommended Technical Shape

1. **Weekly outcome projector:** consume immutable lifecycle transition history and a supplied America/Toronto clock/boundary to derive the Monday–Sunday cohort by first ExportReady transition per stable Prospect ID. Produce separate typed loss buckets from current/historical states; never derive the metric from CSV rows.
2. **Export eligibility snapshot service:** resolve admitted workspace and current upstream projections in one read/transactional fence. Require ExportReady prospect, current approved package, eligible/fresh contact, and no matching suppression. Return stable, canonical row records plus excluded-reason counts.
3. **Deterministic CSV writer:** map the frozen snapshot to a versioned schema with fixed field/row ordering, RFC 4180 serialization, UTF-8, spreadsheet formula neutralization, and canonical manifest/checksum. Persist artifact bytes and manifest through an object port; retries reuse the snapshot/artifact when the export definition digest matches.
4. **Archive service:** create an immutable manifest-first logical export of canonical D1 records and content-addressed R2 objects, ordered/canonicalized before hashing. Encrypt the generated archive in a streaming/service boundary with an explicit envelope format and password KDF parameters; audit only safe metadata/digests.
5. **Restore verifier and applier:** parse/decrypt/verify into a read-only staging model, check compatibility, target cleanliness, object hashes, foreign-key/unique/current-projection invariants, and effect fences. Only then let a separate explicit owner command apply an idempotent restore transaction/object transfer. The restored target must be paused/disabled before it is released.

## Research Conclusions for Later Planning

| Question | Conclusion |
|---|---|
| What counts as the weekly seven? | A unique Prospect’s first ExportReady transition in the local Monday–Sunday week, not CSV rows, later re-exports, or current state alone. |
| Is export a CRM API? | No. CSV artifact plus manifest/checksum only. No syncing or CRM authority. |
| Can an older export be reused after eligibility changes? | Historical artifacts stay auditable; a new export must re-evaluate current eligibility/suppression. It must not silently mutate old bytes. |
| How does duplicate handling work? | Canonical row identity is stable Prospect ID + eligible contact/contact-point identity; render order is canonical. Never dedupe from display text. |
| How does suppression interact with restore? | It is a first-class append-only/tombstoned record in snapshot, manifest, invariant checks, restore, and every export decision. It wins over all current eligibility. |
| Which encryption implementation? | Select a maintained, platform-compatible authenticated encryption and memory-hard KDF during implementation only after capability proof. Preserve a versioned envelope and test vectors; never invent crypto or store passphrases. |
| Does dry run write anything? | No target domain/object writes. It may write only a minimized, authorized audit attempt outside the candidate restore target if that audit path is independently safe. |
| What is replay? | Deterministic reconstruction/verification of archive records and projections with stable IDs/digests, no external effects and no new lifecycle decisions. |

## Mining Evidence Interpretation

The accepted Mining materials establish the seed and operating context, not operational proof: the brochure/deck label Engebø figures illustrative rather than audited. `enrichment/sample_leads.json` is small, uses `example.*` URLs/domains, and contains Operating, Greenfield, non-target, and disqualified shapes. It can support synthetic fixture tests for scope separation, losses, and CSV escaping; it is not an eligible import, contact source, or pilot outcome dataset.
</research_findings>

<implementation_constraints>
## Non-negotiable Constraints

- No deploy, runner scheduling/execution, Gmail/send/call, enrichment, provider access/spend, live lead import, or live/private file use is authorized while preparing this phase.
- Every read/write starts from an admitted owner and server-derived workspace. Client-supplied workspace, report range, artifact key, target, or restore scope is never authority.
- Export eligibility is re-evaluated on the server at materialization/download boundary; UI badges and a prior successful export cannot authorize a new contactable row.
- Formula-safe CSV must neutralize formula-leading text before serializer quoting. Use stable UTF-8 bytes, a versioned header/schema, and SHA-256 over the exact persisted bytes.
- Archive must include provenance/history and suppression/deletion tombstones but never credentials, token secrets, passphrases, or external-provider SDK state.
- Encryption is authenticated; wrong password and tampering have indistinguishable fail-closed handling to untrusted callers. KDF/envelope/version metadata is public manifest metadata, not secret material.
- Clean restore target, compatibility window, restore nonce/idempotency, all effects disabled, and a successful dry run are mandatory preconditions for an apply. No partial restore is released.
</implementation_constraints>

<planning_risks>
## Risks and Required Mitigations

| Risk | Required mitigation |
|---|---|
| Seven target becomes a volume incentive | Separate first-transition cohort from CSV rows and loss buckets; test that every blocked/rejected/deferred/reversed item remains excluded and visible. |
| CSV duplicate or non-deterministic bytes | Frozen input snapshot/version digest, canonical identity/order, byte checksum, retry/replay tests, and a rejection for mismatched same idempotency key. |
| Suppressed/stale contact leaks after cached UI/export | Transactional current-state/suppression fence at export, download authorization, and negative tests across aliases/merge/restore. |
| Spreadsheet formula execution | Prefix neutralization fixture tests for `=`, `+`, `-`, `@`, delimiters, quotes, CR/LF, Unicode, and null/empty cells. |
| Archive omits an object/history/tombstone | Manifest enumerates canonical records/objects/hashes/counts; dry-run completeness/referential checks and deliberate missing-object/tombstone tests. |
| Crypto or version downgrade | Versioned authenticated envelope; capability-tested maintained primitive; reject unsupported/older schema/KDF/policy before target writes. |
| Partial or effectful restore | Staged dry run, clean target marker, restore lock/nonce, invariant gate, and explicit default-disabled schedule/send/provider fence. |
| Mining fixture bleeds into generic model | Parameterized Company/Product/Play/Profile fixtures plus second non-Mining fixture; no logic branches on labels. |
</planning_risks>

<canonical_refs>
## Canonical References

Use the Phase 7 CONTEXT canonical refs as the required reading set. In particular, implementation planning must read `docs/IMPLEMENTATION-SPEC.md` section 20 before selecting archive serialization, encryption, or restore mechanics; it is the release contract.
</canonical_refs>
