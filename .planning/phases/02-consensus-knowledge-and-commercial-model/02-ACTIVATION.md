# Phase 2 activation ledger

This ledger is status-only evidence. It **never grants authority**, changes a gate, authorizes a deployment, or substitutes for a human decision. `human_needed` is a pause and never completes a task.

| Release stage | Status | Non-authorizing evidence field |
|---|---|---|
| Phase 1 real-principal prerequisite | status: accepted (owner-confirmed, 2026-08-01) | Redacted operator evidence confirms a separately signed-in principal was denied across the private app and required APIs, with owner-confirmed zero D1/R2/audit delta. |
| Old-schema preflight | status: accepted (owner-confirmed, 2026-08-01) | Redacted read-only hosted-D1 evidence confirms the exact 0000–0003 baseline, zero foreign-key violations, protected historian digest/count baseline, complete forbidden-table counts, and absent Phase 2 gate. |
| Compatibility deployment | status: deployed, verification pending (2026-08-01) | Existing private project only; source `e07e3f950a27a96bd928135e700a659b7ac6c324`, saved version 11, deployment `appgdep_6a6e38c59fdc8191840f6427bc1efe55` succeeded. Owner GET/POST and fresh-log checks remain pending. |
| Additive 0004 | status: blocked | migration identifier / timestamp: pending |
| Post-migration proof | status: blocked | counts / foreign-key status / opaque digest reference: pending |
| Independent review | status: blocked | independent review reference: pending |
| Exact-source deployment | status: blocked | reviewed source digest / deployment identifier: pending |
| Post-deploy real-principal/negative/log proof | status: blocked | boundary proof reference / redacted timestamp: pending |
| Explicit consensus_knowledge authorization | status: blocked | owner authorization reference: pending |
| Gate activation | status: blocked | exact tuple digest / accepted timestamp: pending |
| Owner lifecycle | status: blocked | owner lifecycle evidence reference: pending |

The existing private Sites project must be reused without clone, replace, delete, rename, or public exposure. Secrets are never revealed, rotated, or removed. Arbitrary file upload remains disabled: only bounded UTF-8 `import_plain_text` to Proposed Knowledge can be considered after the later exact `consensus_knowledge` gate activation. Multipart/file upload, batch promotion, filename or path authority, HTML/binary parser dispatch, operational imports, and every later effect remain disabled. Discovery, prospecting, contacts, schedules, exports, credentials, paid work, Runners, Gmail, calling, messaging, and outbound effects remain disabled.

No automated test, local fixture, status row, deployment record, digest, or text in this ledger can satisfy an absent human evidence requirement.

The 2026-07-30 inspection was read-only. It confirmed the exact existing project remains active, private/custom, owner-only, and at saved version 10 with zero accepted editors. No access policy, secret, deployment, database, object, or gate state was changed.

On 2026-08-01, the resolving owner account found that the project had been
temporarily set to public access and restored it to the existing custom,
owner-only policy: one owner, no non-owner users, no groups, and no editors.
The restoration changed no secret, deployment, database, object, gate, or
runtime value. A read-only unauthenticated request reached the private Sites
edge and received a 401/no-store response; this is not a second signed-in
principal proof. The project still exposes only the logical D1 binding to this
account, not an approved read-only hosted-D1 query/result-adapter surface.
Plan 02-12 therefore remains incomplete and no `02-12-SUMMARY.md` exists.

On 2026-08-01, the operator reported that a separately signed-in account was
denied on the private app entry and all three protected API routes:
`/api/interview`, `/api/capabilities`, and `/api/capability-probe`. This is
partial real-principal evidence only. The required owner-side zero-delta check
for D1, R2, and audit state remained unavailable without the same approved
read-only hosted-D1 control-plane path. This partial report was superseded on
2026-08-01 when the owner confirmed receipt and acceptance of the complete
redacted evidence set: real-principal denial, zero D1/R2/audit delta, and the
read-only old-schema hosted-D1 baseline. Raw control-plane output, counts,
identifiers, and digests remain outside Git and this ledger. Plan 02-12 is
complete; it authorizes only the next ordered compatibility deployment plan,
not a migration, gate activation, upload, or later capability.

On 2026-08-01, the tested Plan 02 compatibility source was saved and deployed
to the existing private project without changing access, bindings, secrets,
database schema, gate state, or later capability state. The deployment is not
accepted as Plan 02-13 completion: the in-app Browser could not perform the
required owner-session `/api/knowledge` checks, so the neutral GET, 503 POST,
zero-delta, and fresh-log evidence remains outstanding. Do not migrate until
those checks are recorded.
