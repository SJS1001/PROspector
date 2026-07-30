---
phase: 07
status: planning-ready
created: 2026-07-30
---

# Phase 7 — Implementation Pattern Map

## Pattern Map

| Concern | Required pattern | Reuse / avoid |
|---|---|---|
| Admission and scope | Derive owner/workspace server-side before reports, exports, archive, dry run, or restore | Reuse Phase 1/2 server admission; never trust client target/artifact/workspace IDs. |
| Current eligibility | Immutable history + current projection + transaction-time suppression fence | Reuse Phase 4/5 projection design; never infer eligibility from a previous export, UI, or historic transition alone. |
| Weekly metric | Pure local-time cohort projector over immutable first-transition history | Inject a clock/timezone boundary; never count rows or use server UTC week. |
| CSV artifact | Canonical snapshot -> deterministic serializer -> immutable object + manifest/checksum/audit | Use a narrow export port; never construct ad-hoc browser CSV or silently change a retry’s bytes. |
| Duplicate/suppression | Stable IDs and normalized subjects in a transactionally fenced snapshot | Preserve separate non-contactable manifest if needed; never emit a suppressed contactable row. |
| Archive | Canonical ordered record stream + content-addressed object manifest -> authenticated encrypted envelope | Keep encryption/key handling in a deep server module; never store passphrase/credentials or depend on provider backup format. |
| Restore | Verify-only dry run -> explicit idempotent apply into clean target -> default-disabled effect fence | Use staging/restore port and lock; never overwrite in place, auto-enable schedules, or replay provider calls. |
| Audit | Append-only bounded event with actor, subject/version/digest, result, and safe reason | Follow Phase 1/2 audit shape; never log secrets, passphrase, raw archive, or broad contact payload. |
| UI authority | One owner surface owns server fetch/CSRF/idempotency/recovery; pure leaves render supplied projections | Reuse Phase 2/4 UI transport pattern; no leaf reads/writes artifacts directly. |

## Deep Module Boundary

```text
weekly-outcome.ts       local-week cohort and loss projector (pure)
crm-handoff.ts          eligibility snapshot, canonical rows, CSV/manifest digest
workspace-archive.ts    canonical record/object enumeration and encrypted envelope
restore-verifier.ts     dry-run integrity/compatibility/clean-target checks
restore-apply.ts        explicit idempotent restore + all-effects-disabled fence
ports/{objects,clock,archive-delivery}.ts
```

Names are flexible. The boundary is not: the route, UI leaf, CSV serializer, or storage adapter may not make authority, suppression, compatibility, or effect-release decisions.

## Transaction and Replay Shape

```text
admitted owner + server workspace
  -> current upstream projection/suppression fence
  -> frozen export snapshot (stable IDs + configuration/package digests)
  -> canonical CSV bytes + manifest checksum + immutable audit

recent owner reauth + server workspace
  -> canonical record/object manifest + hashes
  -> authenticated encrypted archive + delivery metadata
  -> dry-run decrypt/verify/compatibility/clean-target/invariants (no target writes)
  -> explicit restore nonce/lock + idempotent apply
  -> target schedules/sends/providers remain disabled until separate authority
```

## Integrity Checks

- Uniqueness/idempotency key binds owner, workspace, operation type, canonical input digest, and output artifact/restore result; same key with different semantics conflicts.
- Export rows reference stable Prospect and eligible Contact/contact-point identities; manifest counts both unique Prospects and contact rows distinctly.
- Manifest includes archive format, schema compatibility range, creator/version/time, canonical record/object counts, hashes, dependencies, effect-fence result, and exact artifact checksum.
- Restore verifies all object hashes and references, IDs, append-only/version relations, current configuration/package/export digests, suppression/deletion tombstones, and target-empty marker before target mutation.
- Reprojection after restore must match archived canonical result where inputs are historical; all operational queues/schedules/outboxes start paused/disabled and no adapter is invoked.

## Anti-patterns

- Counting every CSV row, every export, or current ExportReady state as a new seven-lead outcome.
- Exporting Contact Suggestions, stale contacts, unapproved packages, cross-workspace data, or suppressed subjects because an earlier UI/export showed green.
- Dedupe by email/name/display text, random row order, locale-dependent serialization, or retry regeneration without a frozen snapshot.
- Treating a CSV manifest as a CRM integration or adding CRM pipeline/revenue state.
- Encrypting with a stored passphrase, logging it, using unauthenticated encryption, or accepting archive/version skew by best effort.
- Applying a restore before dry-run/clean-target/invariant proof, overwriting a target, or restoring schedules/sends/provider authority enabled.
- Hard-coding Digitalrain/ONE/Mining labels into generic domain/schema behavior or treating illustrative Mining claims/synthetic sample data as operational proof.
