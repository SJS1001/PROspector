# Plan 02-99 expected post-migration schema

**Captured:** 2026-09-02

**Checked source:** `5bc8e6c1846ef46bfc626844fa053959c39a4347`

**Runtime:** Wrangler 4.116.0 local D1, fresh disposable state

## Construction

Wrangler applied the exact checked `0000`-`0009` chain from
`dist/server/wrangler.json` to a newly created local D1 persistence directory.
All ten migrations reported success. The source migration digests are recorded
separately in `02-99-MIGRATION-MANIFEST.md`.

The application inventory excludes `sqlite_%`, `_cf_%`, and the provider-owned
`d1_migrations` journal. Canonical inventory lines are UTF-8
`type|name|table-name\n`, ordered by type, name, then table name. Canonical table
lines are UTF-8 `table-name\n`, ordered by name. Canonical journal lines are
UTF-8 `id|migration-name\n`, ordered by numeric ID.

## Expected result

| Check | Expected value |
|---|---:|
| Application tables | 92 |
| Explicit application indexes | 206 |
| Application triggers | 149 |
| Total application schema objects | 447 |
| Application-schema inventory SHA-256 | `2f8a9690082ec113b65c97db84ada657e5b55fdf9577c06c2a3a1a5a84706a08` |
| Ordered application-table-name SHA-256 | `76f0b8d5bd656682404183fc127a1549bce734fb17a4734d81236bc421fddfc7` |
| Migration-journal rows | 10 |
| Ordered migration-journal SHA-256 | `f5465182301bf4405432459b99466ee43e61ea72bbc775bce8ddac305a0f500f` |
| Application tables with nonzero rows | 0 |
| `PRAGMA quick_check` | `ok` |
| `PRAGMA foreign_key_check` rows | 0 |

The only nonzero non-internal table in this fresh local result is
`d1_migrations`, with the expected ten journal rows. No workspace, gate,
schedule, run, prospect, contact, enrichment, suppression, audit, CSRF,
private-proof, or other application row exists.

## Remote verification contract

After separately authorized remote migration, collect the same read-only
inventories and recompute all three digests. Also enumerate every application
table count, verify the exact ten journal names from the migration manifest,
run both integrity pragmas, and prove R2 remains empty/private. Any count,
name, ordering, digest, journal, integrity, or row-state mismatch stops the
release before a Worker version or application request exists.

This document is an expected-local-result manifest. It does not prove a remote
migration, target binding, hosted schema, provider identity, principal, Worker,
deployment, persistence, or Plan 02-99 acceptance.
