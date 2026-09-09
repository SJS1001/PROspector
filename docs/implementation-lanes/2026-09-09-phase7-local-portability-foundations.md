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
