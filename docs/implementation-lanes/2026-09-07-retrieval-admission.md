# Retrieval admission boundary — implementation note

**Date:** 2026-09-07
**Branch:** `codex/generic-onboarding-integration`
**Scope:** `site/domain/ports/retrieval.ts`, `site/tests/retrieval-port-admission.test.mjs`

## What this is

`domain/ports/retrieval.ts` is a pure, runtime-unreachable boundary. It imports
nothing, opens no socket, reads no configuration, and is composed by no runtime
module. It defines the admission contract that a future retrieval adapter would
have to satisfy, expressed as pure predicates over a request and over the
evidence an adapter claims about what it actually did.

## Corrected flaws

- **Documentation and reserved address space was treated as public.** IPv6
  classification is now fail-closed: an address is public only inside global
  unicast `2000::/3` and outside the `2001::/23`, `2001:db8::/32`, `2002::/16`,
  and `3fff::/20` carve-outs. IPv4 rejects the IANA special-purpose registry,
  including cloud metadata, CGNAT, benchmarking, and the three TEST-NET blocks.
  Ambiguous literals (leading-zero octets, decimal or hex forms, zone
  identifiers, bracketed or trailing-dot forms) are never public.
- **Guarded evidence was standalone or optional.** Resolved address sets,
  per-hop connection pinning, the full redirect chain with its declared count,
  transfer and decompression accounting, and wall-clock evidence are now
  mandatory fields of one contract, bound to the exact admitted request and the
  returned document. `maximumDecompressedBytes` is a required request cap.

## Fail-closed behaviour

Missing, partial, malformed, or unknown-field evidence is a rejection carrying a
stable `RetrievalAdmissionError` reason, never a warning or a default. The
guarded port admits the request before an adapter is reached, never propagates
an adapter's own error or transport detail, and revalidates the adapter's
claimed evidence before any document escapes. The default port remains
reject-only.

## Validation

From `site/`:

```bash
node --test --test-concurrency=1 tests/retrieval-port-admission.test.mjs
node --test --test-concurrency=1 tests/runner-assignment.test.mjs
npx eslint domain/ports/retrieval.ts tests/retrieval-port-admission.test.mjs
```

The admission suite was mutation-checked: removing the `2001:db8::/32` block,
making decompression accounting optional, and dropping the pinned-address
membership check each fail the suite.

## Authority

This is local, synthetic, zero-effect work. It activates no retrieval, composes
no adapter, and makes no network call. It earns no plan completion credit and
grants no hosted, provider, credential, export, outbound, or preflight
authority; the Phase 4 hosted retrieval checkpoints remain blocked.
