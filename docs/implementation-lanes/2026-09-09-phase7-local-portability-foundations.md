# Phase 7 local portability foundations

This lane adds three provider-free, runtime-unreachable foundations over only
synthetic input:

- deterministic CRM CSV materialization through the existing canonical codec,
  with a tenant-bound immutable manifest and byte/manifest SHA-256 digests;
- an in-memory, authenticated local backup/restore boundary using the explicitly
  versioned Web Crypto PBKDF2-SHA-256 (210,000 iterations) and AES-256-GCM
  suite, canonical records, clean-target enforcement,
  atomic return-value application, idempotent replay, preserved suppression
  tombstones, and all effects disabled; and
- a pure retention decision that can expire artifact payloads while preserving
  manifests and suppression tombstones.

The modules have no route, UI, D1, R2, filesystem, provider, credential,
delivery, download, scheduler, or outbound composition. They do not grant
export or restore authority, and they do not earn Phase 7 plan or completion
credit. A future reviewed runtime adapter must separately establish current
tenant authority, accepted upstream projections, durable transactions, object
storage, recent owner reauthentication, and the required greenfield recovery
drill before any operational use.

This dependency-free cryptographic envelope is a non-operational compatibility
prototype, not a production-grade backup system. Restore rejects any different
or extended algorithm suite. Operationalization requires a separately reviewed
KDF calibration/versioning and key-handling design appropriate to the selected
runtime and threat model.

## Restore-compatibility follow-up

The local envelope is now version 2 and binds a closed
`prospector/portable-workspace-schema/v1` identifier plus an explicitly
`synthetic_disposable` source snapshot ID/digest and migration-lineage digest.
Before returning even an in-memory restored state, restore must authenticate the
envelope and match an exact caller-supplied workspace/schema/snapshot/lineage
expectation. The same check can return a deeply frozen compatibility receipt
containing only digests, counts, identifiers, and literal false restore and
operational authority. Workspace identity drift, source-snapshot or lineage
drift, schema skew, legacy/downgraded envelope metadata, wrong passphrase, and
tampered bytes all collapse to `portable_backup_untrusted`.

This receipt is only a local synthetic contract result. It is not provenance
that a real snapshot, schema, migration, object, source workspace, or target
exists; it is not a dry run; and it cannot authorize restore. Version 1 was
never operational and is intentionally rejected rather than silently accepted
after the payload contract gained explicit compatibility and provenance fields.
The exact future gate remains Plan 07-07: owner-accepted capability evidence for
a maintained platform-compatible authenticated-encryption and memory-hard KDF
design, plus an exact separately authorized clean greenfield source/restore
target and its own reviewed-source, schema/migration, private-boundary, and
zero-effect evidence. Plan 07-08 and the controlled Plan 07-10 recovery drill
remain blocked behind that gate.
