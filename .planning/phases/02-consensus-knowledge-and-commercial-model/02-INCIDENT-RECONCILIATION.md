# Phase 2 incident reconciliation

**Recorded:** 2026-08-25
**Status:** `constrained_read_only_classification; provenance_incomplete; recovery_not_authorized`
**Authority:** Owner-approved read-only inspection of the same existing private Sites project only

This record narrows the incident classification. It does not authorize or
perform a deployment, migration, repair, restore, compensation, gate write,
access-policy change, secret operation, or any other hosted write.

## Target binding

- The inspection resolved the same existing private owner-only Sites project.
- The project remains active with its custom private access policy: one owner,
  no editors, groups, or external visitors.
- The live saved version is version 11 and its source resolves to `e07e3f9`.
- The associated deployment reports success.
- The bound `DB` inventory returned 42 user tables without truncation.
- `phase_activation_gates` contains zero rows. The
  `consensus_knowledge` gate remains absent.

Private database identifiers, deployment receipts, raw hosted rows, account
identifiers, and authentication material remain outside Git.

## Proven read-only findings

The complete user-table overview contains the Phase 2 tables associated with
migration 0004. Three differentiating live column signatures are:

| Table | Observed relevant columns | Reviewed-0004 columns absent from the live signature |
|---|---|---|
| `knowledge_drifts` | `knowledge_item_id`, `current_version_id`, `proposal_id`, `risk_kind`, `dependency_digest`, `status` | `proposed_version_id` |
| `replacement_candidates` | `owner_type`, `owner_id`, `current_configuration_id`, `candidate_configuration_id`, `impact_snapshot_id`, `candidate_digest`, `status` | `proposed_version_id`, `expected_owner_revision` |
| `knowledge_versions` | `scope_type`, `scope_id`, `kind`, `value_json`, `status`, `source_digest`, `knowledge_item_id`, `proposal_id`, `decision_id`, `authority_command_id`, `value_digest` | `predecessor_version_id` |

Those signatures conclusively rule out a complete application of the current
reviewed `b93c71d…` migration. They align with a superseded pre-`e66dbf0`
schema family, but do not prove exact application of `aa89768…`: an
intermediate `5ecd767…` migration has the same three table-column shapes and
differs in constraints and triggers that the available inventory cannot show.

The complete user-table inventory contains none of the tables introduced by
the normal 0005 through 0009 migration sequence, including product-discovery,
profile-prospecting, prospecting-run, or enrichment tables. This rules out a
complete normal application of migrations 0005 through 0009. It does not rule
out an inaccurate journal, ad hoc SQL, or a partial/manual write.

The deployed `e07e3f9` source bundle contains the superseded `aa89768…`
migration, an older gate CLI with an `activate` command, and an older handler
whose gate validation is materially weaker than reviewed mainline. Source
contents do not prove which SQL or trigger definitions are live, who wrote the
database, or whether the gate command was run. The empty gate proves only that
no activation row exists now.

## Classification

**Current classification: partial/mixed/unknown, with strong evidence of a
superseded pre-`e66dbf0` schema family.**

Owner-authorized read-only reconciliation produced a constrained
classification, not recovery authority. The observed live column signatures
conclusively rule out a complete application of the reviewed `b93c71d…` 0004
and align with a superseded pre-`e66dbf0` schema family. They do not prove exact
application of `aa89768…` or any other complete migration: trigger, index,
foreign-key, and constraint completeness; `d1_migrations` contents; migration
mechanism; actor; and time remain unknown. The complete live user-table
overview contains none of the tables introduced by migrations 0005 through
0009, so there is no evidence of a complete normal 0005+ application; journal
state and manual or partial activity remain unknown.

## Not proven

The read-only connector did not expose:

- exact `d1_migrations` names, ordering, checksums, or applied timestamps;
- canonical `sqlite_schema` definitions;
- trigger, index, check-constraint, or foreign-key definitions and
  `PRAGMA foreign_key_check` results;
- protected historian, binding, quarantine, forbidden-state, and audit
  invariant counts/digests bound to this observation;
- provider database/deployment audit receipts identifying actor, action,
  mechanism, and time; or
- a recoverable backup/restore point and a tested restore procedure.

No claim may therefore be made that either known 0004 digest ran completely,
that the live schema is internally consistent, or that forward repair or
restore is safe.

## Plan impact

- Plan 02-13 remains invalidated incident history and earns no completion
  credit.
- The original Plans 02-14 through 02-20 are preserved verbatim as
  `02-14-PLAN.retired.md` through `02-20-PLAN.retired.md` outside GSD executor
  discovery. Their clean 0003/release contracts cannot be resumed for the
  current target, and neither known 0004 may be reapplied.
- Plan 02-21 is the only recovery-design incident plan. It permits completion of the remaining
  read-only provenance bundle, one local design-only recovery contract,
  independent design review, and a separate owner decision that may authorize
  only drafting a future checked plan. It creates no executable recovery
  artifact, rehearsal, provider recovery environment, restore drill, or hosted
  write.
- Plan 02-99 is the canonical terminal acceptance barrier. It keeps Phase 2
  incomplete after Plan 02-21, performs no hosted action, and must be atomically
  moved after the future replacement sequence's terminal successor before Task
  1 can create fresh independent verification and Task 2 can require exact
  owner acceptance.

## Remaining evidence and next action

Complete one redacted, timestamped, target-bound read-only bundle through a
provider-supported database/control-plane view. It must contain the missing
journal, canonical schema, trigger/index/foreign-key, invariant, and provider
audit evidence listed above. If the provider cannot expose an item, record the
specific unsupported capability; absence of evidence cannot be treated as a
pass.

Only after that bundle exists may a local recovery design select exactly one
path:

1. a uniquely identified, forward-only reconciliation for an exactly
   classified superseded schema, never a reapplication of either known 0004;
   or
2. a provider-supported restore to a proven pre-change snapshot when the live
   state remains partial/mixed/unknown.

The design must specify the exact executable files, tests, backup/restore
evidence, local rehearsal, independent exact-artifact review, target/actor
binding, and stop/rollback conditions a future checked plan will require. Plan
02-21 may obtain a later, separate owner decision only to draft and check that
future path-specific plan. It cannot authorize implementation or execution.
The future plan must contain its own blocking owner checkpoint bound to the
implemented source/recovery digests, proven backup/restore evidence, exact
artifact review, target, actor, rollback boundary, and stop conditions before
the first hosted write. Generic approval, this record, the prior read-only
approval, a design review, or a passing local test does not authorize that
write.

## No-write boundary

Keep the existing project private and owner-only and keep
`consensus_knowledge` absent. Do not deploy, migrate, run a gate writer,
compensate, restore, drop/rebuild objects, change access, alter secrets, create
a replacement project, issue/consume an application CSRF token for testing, or
activate any later capability. Discovery, prospecting, contacts, enrichment,
schedules, exports, spend, Runners, Gmail, calling, messaging, and every other
outbound effect remain disabled.
