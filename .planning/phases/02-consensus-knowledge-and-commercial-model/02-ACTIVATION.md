# Phase 2 activation ledger

This ledger is status-only evidence. It **never grants authority**, changes a gate, authorizes a deployment, or substitutes for a human decision. `human_needed` is a pause and never completes a task.

| Release stage | Status | Non-authorizing evidence field |
|---|---|---|
| Phase 1 real-principal prerequisite | status: accepted (owner-confirmed, 2026-08-01) | Redacted operator evidence confirms a separately signed-in principal was denied across the private app and required APIs, with owner-confirmed zero D1/R2/audit delta. |
| Old-schema preflight | status: historical acceptance; current reliance blocked | The owner accepted redacted Plan 02-12 evidence on 2026-08-01. The later live-schema observation does not establish when the schema diverged, so this evidence cannot classify the current database or restore Plan 02-13 acceptance. |
| Compatibility deployment | status: **incident-blocked; acceptance invalidated 2026-08-24** | The required schema-0003/no-migration premise is contradicted by the supplied read-only live observation, and Git proves the deployed source was not the reviewed Phase 2 lineage. The historical Plan 02-13 summary is superseded by the forensic report. |
| Read-only incident reconciliation | status: owner authorization required | Next permissible action only: bind redacted schema, `d1_migrations`, provider audit, deployment, and database provenance evidence to the same existing private project. No hosted write is permitted. |
| Additive 0004 | status: **non-executable** | Exact applied migration digest, mechanism, actor, time, journal state, and schema completeness are unknown. Do not apply either known 0004 file over the current state. |
| Post-migration proof | status: non-executable | Current schema must first be classified read-only as exact reviewed, exact superseded, or partial/mixed/unknown. |
| Independent review | status: non-executable | No reconciled source/schema artifact exists for review. |
| Exact-source deployment | status: non-executable | Reconciled immutable source and target-bound evidence are absent. |
| Post-deploy real-principal/negative/log proof | status: non-executable | Upstream incident reconciliation and reviewed deployment are absent. |
| Explicit consensus_knowledge authorization | status: non-executable | Upstream release stages are unaccepted. |
| Gate activation | status: non-executable; gate absent | Preserve the absent gate. No gate writer or activation is authorized. |
| Owner lifecycle | status: non-executable | Upstream release and activation stages are unaccepted. |

The existing private Sites project must be reused without clone, replace, delete, rename, or public exposure. Secrets are never revealed, rotated, or removed. Arbitrary file upload remains disabled: only bounded UTF-8 `import_plain_text` to Proposed Knowledge can be considered after the later exact `consensus_knowledge` gate activation. Multipart/file upload, batch promotion, filename or path authority, HTML/binary parser dispatch, operational imports, and every later effect remain disabled. Discovery, prospecting, contacts, schedules, exports, credentials, paid work, Runners, Gmail, calling, messaging, and outbound effects remain disabled.

No automated test, local fixture, status row, deployment record, digest, or text in this ledger can satisfy an absent human evidence requirement.

The 2026-07-30 inspection was read-only. It confirmed the exact existing project remains active, private/custom, owner-only, and at saved version 10 with zero accepted editors. No access policy, secret, deployment, database, object, or gate state was changed.

## Historical checkpoints and incident disposition

On 2026-08-01, the resolving owner account restored the existing project from
temporary public access to its custom owner-only policy. Later that day, the
owner accepted a redacted evidence set for Plan 02-12 and then accepted the
Plan 02-13 route observations as a schema-0003 compatibility deployment. Those
records remain historical evidence of what was reported and accepted at the
time; raw hosted evidence remains outside Git.

The committed 2026-08-24 forensic report supersedes the Plan 02-13 acceptance
and its release-order conclusion. A supplied read-only owner observation found
0004-created tables while the gate remained empty. Git also proves that the
deployed source was reconstructed from superseded blobs rather than the
reviewed Phase 2 lineage. The observation does not prove which migration SQL
ran, whether it ran completely, what the migration journal records, or which
actor or mechanism wrote the schema. The exact applied migration digest and
actor therefore remain unknown.

Plan 02-13 is incident-blocked and earns no completion credit. Plans 02-14
through 02-20 are non-executable. All hosted writes remain frozen: do not
deploy, migrate, compensate, drop or rebuild tables, run a gate writer, alter
access, modify secrets, or improvise a destructive rollback. The only
permissible next action is owner-authorized read-only schema, migration-journal,
and provider-audit reconciliation on the same existing private project. See
`.planning/forensics/report-20260824-140458.md`.
