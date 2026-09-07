# CRM CSV contract conformance — implementation note

**Date:** 2026-09-07
**Branch:** `codex/generic-onboarding-integration`
**Commit:** `d1510f0`
**Scope:** `site/tests/crm-csv-contract-conformance.test.mjs` (added) and this record

## What this is

Tests only. No production or runtime module, policy string, fixture, or
migration changed.

`site/preparation/phase7-csv-policy-definition.ts` declares the canonical CSV
schema and byte policies as labels. `site/domain/crm-csv-codec.ts` implements
those policies as bytes and deliberately imports nothing, so it reproduces the
same 22-field order, schema version, and byte rules from its own hardcoded
copy. Each side had a focused suite asserting its own copy. Nothing asserted
that the two copies agreed, so a drift in either could pass both suites.

This suite is the single binding between them. It cross-constructs the Phase 7
policy artifact from the runtime `CRM_CSV_SCHEMA_VERSION` and
`CRM_CSV_FIELD_IDS` constants — not from a third hardcoded list — so runtime
schema or field-order drift makes the construction reject before any other
assertion runs.

## What it proves

- **Ordered field and schema parity.** Reordered, rotated, dropped, duplicated,
  extended, renamed, and version-bumped runtime-derived field lists each reject
  rather than cross-construct, so the parity check is a fence and not a
  tautology.
- **Sort behaviour.** Output order follows the declared Prospect, Contact, then
  contact-point sort keys, is invariant across all 120 input permutations and
  across every reassigned non-sort label, and uses a fixture in which sorting by
  contact point before Contact would reorder rows.
- **Declared labels bound to bytes.** Encoding, absent byte-order mark, CRLF
  separation, the single header row, RFC 4180 double-quote escaping, and the
  empty-field null policy are verified with a strict byte-level reader that
  fails on a bare quote, an unterminated quoted field, a lone CR, or a lone LF.
  Quoting is proven minimal: each cell's observed quoting must equal what its
  emitted text actually requires, so quote-everything is a failure.
- **Formula neutralization.** Eighty leader and payload combinations cover
  whitespace, C0 and C1 controls, and U+FEFF, proving the apostrophe is placed
  ahead of the leader and that neutralization happens before quoting escapes the
  result.
- **E.164 behaviour.** Leading-plus contact values are neutralized text that
  recovers the exact supplied value with no digit loss, including spaced,
  comma-bearing, and quote-bearing variants; `tel:`-prefixed and national-digit
  values are untouched.
- **Duplicate-conflict semantics.** Row identity is exactly the stable Prospect
  plus contact-point pair. An exact repeat collapses; a differing value in any
  other field — swept across all 22 — fails closed, including `contact_id`,
  which is a sort key but not part of identity.
- **Zero authority.** Every preparation effect counter stays zero and every
  authorization stays false before and after real CSV bytes exist in the same
  process, and the policy artifact leaks no row, byte, or checksum material.
- **Offline guards.** The codec's no-import invariant is restated rather than
  weakened, and `app/`, `worker/`, `domain/`, `adapters/`, and `db/` module
  specifiers are scanned to prove no runtime module imports preparation code.

## Documented boundaries

Three current behaviours are now pinned as facts, not endorsed as sufficient:

- the neutralized class is exactly `\p{White_Space}`, `\p{Cc}`, and U+FEFF, so a
  leading U+200B, U+200E, U+00AD, or U+2060 before a formula character is not
  neutralized;
- sort comparison is UTF-16 code-unit order, not code-point order, so a
  supplementary-plane identifier sorts before U+FFFD; and
- the `empty_field` null policy makes `null` and `""` byte-identical on output
  while the deduplication signature still separates them, so one identity
  carrying both fails closed as a conflict.

## Validation

From `site/`:

```bash
node --test --test-concurrency=1 tests/crm-csv-contract-conformance.test.mjs
node --test --test-concurrency=1 tests/crm-csv-contract-conformance.test.mjs \
  tests/crm-csv-codec.test.mjs tests/phase7-preparation-csv-policy-definition.test.mjs
npm run lint
```

Focused suite 12/12; the CRM CSV trio 33/33; canonical `npm run lint` clean
repository-wide on Node.js `v22.22.2`. The suite was mutation-checked against an
isolated scratch copy of the codec: LF separation, an emitted byte-order mark,
quote-everything, removed formula neutralization, a narrowed neutralization
class, Contact-before-Prospect sorting, a swapped field order, a bumped schema
version, last-write-wins duplicates, a literal `NULL`, and a preparation import
were each caught. The repository codec was not modified.

Canonical `npm test`, including the production build and the Miniflare-backed
suites, was not run in this lane. The preflight lane was not used.

## Authority

Local test evidence only. It creates no Phase 7 summary and earns no plan or
phase completion credit. It grants no runtime, persistence, CSV
materialization, delivery, download, export, archive, hosted, provider,
credential, or outbound authority, and it activates nothing. The Phase 7 plan
graph and its upstream gates remain blocked.
