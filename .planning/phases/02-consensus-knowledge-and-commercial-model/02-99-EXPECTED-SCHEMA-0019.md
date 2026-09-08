# Plan 02-99 expected post-migration schema (chain `0000`-`0019`)

**Captured:** 2026-09-07

**Checked source:** `071b95b78afe765d8f6f5312063518cd913ed10e`

**Runtime:** Miniflare D1 applied through `wrangler d1 migrations apply --local`
against fresh disposable state, plus an independent `node:sqlite` inventory
cross-check

**Status:** reference only. This describes the **whole checked chain** — the
release chain `0000`-`0009` plus the migrations listed under "Checked ahead of
the release chain" in `02-99-MIGRATION-MANIFEST.md`. It is the shape a fresh
local bootstrap produces, because the local lanes apply the entire chain.

**Supersedes nothing.** `02-99-EXPECTED-SCHEMA.md` remains active and describes
the release chain, which is what Stage 2 applied remotely and what
`greenfield:target:prepare` pins. The two documents describe different chains;
neither replaces the other. An earlier revision of this header claimed
otherwise and was wrong.

No tool pins this document. It is not remote evidence, it does not move any
migration into the release chain, and it grants no authority to apply one.
It states what a target would be expected to look like *if* a separately
authorized apply ever carried the chain past `0009`.

## Construction

The exact checked `0000`-`0019` chain was applied to a fresh disposable local
D1 database under `site/.local`, using a disposable generated Wrangler config
whose `migrations_dir` pointed at copies of the checked `site/drizzle/` SQL
files. `wrangler d1 migrations apply --local` was used rather than
`d1 execute --file` so that the provider-owned `d1_migrations` journal is
populated by the provider itself. The same twenty files were then replayed
independently into an in-process `node:sqlite` database, and all three schema
digests below were computed from both engines and compared.

The source migration digests are recorded separately in
`02-99-MIGRATION-MANIFEST.md`.

The application inventory excludes `sqlite_%`, `_cf_%`, and the provider-owned
`d1_migrations` journal. Canonical inventory lines are UTF-8
`type|name|table-name\n`, ordered by type, name, then table name. Canonical table
lines are UTF-8 `table-name\n`, ordered by name. Canonical journal lines are
UTF-8 `id|migration-name\n`, ordered by numeric ID.

Canonical definition lines are UTF-8
`type|name|table-name|stored-sql\n` in the same object order. The stored
`sqlite_schema.sql` text is preserved byte-for-byte except that CRLF or CR line
endings become LF; whitespace inside quoted values is never rewritten.
Provider-owned/internal objects and implicit indexes whose
`sqlite_schema.sql` is `NULL` are excluded from every application inventory.

These are exactly the canonical formats defined by `02-99-EXPECTED-SCHEMA.md`.
Before generating the table below, the same procedure was run against the
`0000`-`0009` prefix and reproduced all four digests recorded in that document
byte-for-byte, from both the D1 and the independent SQLite path. That
reproduction is the evidence that the construction method is unchanged and that
the values below differ only because the chain does.

## Expected result

| Check | Expected value |
|---|---:|
| Application tables | 123 |
| Explicit application indexes | 301 |
| Application triggers | 294 |
| Total application schema objects | 718 |
| Application-schema inventory SHA-256 | `57941ce28fc3c03ca1a740a0955be062c4a890575e3d03af84edfa18924b37cf` |
| Ordered application-table-name SHA-256 | `f5e0964c1937c2ce0403f1c219f57b03af39b03dbc4ee6e7fc34e9597172f2a3` |
| Line-ending-normalized application-schema-definition SHA-256 | `180234d85323cb3693afc447066b9ef45080ebcc7ff0b630ecc702fd1b39f183` |
| Migration-journal rows | 20 |
| Ordered migration-journal SHA-256 | `ff68c0770a4a570c4ea99cc75cd8e5f3fcc596bb8bc7691d3d0951e5ee0e3c7e` |
| Application tables with nonzero rows | 0 |
| `PRAGMA quick_check` | `ok` |
| `PRAGMA foreign_key_check` rows | 0 |

The independent `node:sqlite` replay produced identical table, index, trigger,
and total-object counts and identical inventory, table-name, and definition
digests. The journal digest has no cross-check counterpart because
`d1_migrations` is provider-owned and is not created by a raw file replay.

Every one of the 123 application tables was counted individually and returned
zero rows. The only nonzero non-internal table in this fresh local result is
`d1_migrations`, with the expected twenty journal rows. No workspace, gate,
schedule, run, prospect, contact, outreach, discovery, enrichment, suppression,
audit, CSRF, private-proof, or other application row exists.

The trigger count is lower than the chain's 317 `CREATE TRIGGER` statements
because later migrations, including the `0018` importer normalization, drop and
recreate earlier triggers. 294 is the count of trigger objects surviving in the
final schema, not the count of statements executed.

## Integrity-pragma caveat

`PRAGMA foreign_key_check` ran through the Miniflare D1 binding and returned
zero rows. `PRAGMA quick_check` did **not**: at this chain size it fails inside
the Miniflare D1 query worker with `SQLITE_NOMEM`, which is a Miniflare
query-worker memory limit and not a database defect. The recorded `ok` therefore
comes from opening the same persisted disposable D1 SQLite file read-only with
`node:sqlite` after the apply, and is corroborated by `ok` from the independent
replay. The schema inventory read from that persisted file matches the inventory
read through the D1 binding exactly, so both reads describe the same database.

A remote verification must run `PRAGMA quick_check` through the real provider
rather than relying on this local substitution.

## Remote verification contract

This contract applies only once a separate owner authorization has moved every
migration below `0019` into the manifest's release chain, and an authorized
apply has carried the target to that head. Until then the release chain ends at
`0009` and `02-99-EXPECTED-SCHEMA.md` is the contract remote reads must meet.

After such an apply, collect the same read-only inventories and recompute all
four digests. Also enumerate every application table count, verify the journal
names against the manifest's release chain as it then stands, run both
integrity pragmas, and prove R2 remains empty/private. Any count, name,
ordering, digest, journal, integrity, or row-state mismatch stops the release
before a Worker version or application request exists.

This document is an expected-local-result manifest. It does not prove a remote
migration, target binding, hosted schema, provider identity, principal, Worker,
deployment, persistence, or Plan 02-99 acceptance. No hosted, deployment, or
Cloudflare action of any kind was taken to produce it; every read above comes
from disposable local state under `site/.local`.

The separately recorded Stage 2 remote apply stopped at `0009`. The remote
journal therefore remains at ten rows and the remote schema remains the
`02-99-EXPECTED-SCHEMA.md` shape until a further apply is separately
authorized. This document states what the target is expected to look like
afterwards; it is not evidence that it does.
