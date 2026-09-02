# Greenfield baseline authority

**Decision date:** 2026-08-27
**Authority:** explicit owner direction
**Status:** active source of truth

## Decision

The original private hosted PROspector project is inaccessible and permanently
outside the execution path. Do not attempt to resolve, inspect, migrate,
restore, modify, clone, or otherwise use it.

Its migration journal, canonical schema, constraints, actor, mechanism, time,
and provenance are unavailable. The owner intentionally waives that evidence
because no original-project state will be reused. This is an abandonment of
the old migration path, not evidence that a migration occurred and not an
acceptance of any historical schema.

The checked repository and a freshly created, empty local database are the new
authoritative starting point. Every future environment must be greenfield:

- create no dependency on an original-project identifier, row, object, backup,
  migration journal, deployment, secret, or evidence reference;
- keep checked deployable metadata target-neutral; generated placeholder
  resource identities are local build sentinels and are not deployable;
- apply the checked migration chain only to a new empty target;
- verify the new target independently before treating it as usable;
- keep gates, schedules, providers, enrichment, Gmail, calling, exports, and
  every outbound effect disabled until their own checked authorization passes;
- never represent local fixtures or this waiver as hosted or production proof.

No hosted target is selected or provisioned by this decision. Creating or
changing one remains a separate owner-authorized external action.

## Local attestation

From `site/`, run:

```bash
npm run baseline:greenfield
```

The command resets only ignored state below `site/.local`, applies the checked
repository migration chain to that disposable database, checks foreign keys,
and proves selected authority and operational tables are empty. Its safe JSON
result explicitly records `originalProjectMigrationClaim: "none"`.

This attestation proves reproducible local bootstrap only. It makes no claim
about the inaccessible original project or any future hosted target.

## Retired history

The forensic report, incident reconciliation, and retired Plans 02-13 through
02-21 and the old recovery Plan 02-99 remain immutable history explaining why
the old target was abandoned. They are not executable plans and are not
dependencies of greenfield work.
