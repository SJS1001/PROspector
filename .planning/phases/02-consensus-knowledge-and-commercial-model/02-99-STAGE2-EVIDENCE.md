# Plan 02-99 Stage 2 configuration and migration evidence

**Captured:** 2026-09-02

**Status:** incomplete; remote migration stopped safely after `0007`

**Repair candidate source:** `46d082e962c4acc1771e92ad300d61913d50ead4`

**Tool:** Wrangler 4.116.0

## Authorized scope

Stage 2 authorized one ignored target candidate, a no-upload Wrangler dry run,
the exact checked `0000`-`0009` migration chain against the existing Stage 1
D1 database, and read-only post-migration D1/R2 evidence. It did not authorize
a Worker/version upload, Access policy, route, domain, secret, deployment,
application request, real data, provider, export, schedule, or outbound effect.

The inaccessible original project was not resolved, inspected, accessed,
migrated, restored, modified, cloned, or used as evidence.

## Sanitized execution result

| Check | Result |
|---|---|
| Ignored owner-private mapping and target candidate | prepared |
| Candidate source binding | authoritative outer repository HEAD |
| Wrangler target-config validation | passed |
| Wrangler no-upload dry run | passed |
| Pre-migration D1 application objects | 0 |
| Pre-migration D1 journal rows | 0 |
| Remote migrations committed | `0000` through `0007` |
| First uncommitted migration | `0008_controlled_enrichment.sql` |
| Remote error | `incomplete input` / `SQLITE_ERROR` |
| Retry attempted | no |
| Post-failure D1 journal rows | 8, exactly `0000` through `0007` |
| Post-failure D1 application tables/indexes/triggers | 71 / 151 / 77 |
| Post-failure D1 application rows | 0 |
| Post-failure D1 `PRAGMA quick_check` | `ok` |
| Post-failure foreign-key violation rows | 0 |
| Post-failure R2 objects | 0 |
| Post-failure R2 custom domains | 0 |
| Post-failure R2 public `r2.dev` access | disabled |

The failed migration did not create a journal entry or leave partial `0008`
schema. Earlier successful migrations remain applied, which is Wrangler's
documented failure model. No Worker or application surface exists.

## Local repair candidate

`0008` introduced nested `SELECT CASE ... END;` trigger guards; their inner
compound-looking terminators can be mistaken for the trigger's outer `END;` at
the remote importer boundary. The repair rewrites all such guards in `0008`
and the still-pending `0009` as equivalent `SELECT RAISE ... WHERE` guards.
Each marker-delimited trigger now contains exactly one `END;`, its outer
compound terminator.

Focused verification completed off the held preflight lane:

- 22 enrichment persistence and authority tests passed;
- 3 migration-`0009` upgrade/fail-closed tests passed;
- the importer-boundary regression test passed;
- all 6 focused target-configuration CLI tests passed against the updated
  manifest and expected-schema digest pin;
- a fresh local chain retained 92 application tables, 206 indexes, 149
  triggers, 447 total objects, all three expected inventory digests, and
  `quick_check=ok`; and
- independent review found no remaining high- or medium-severity issue after
  tightening the regression to the exact one-outer-terminator contract.

The repair is local evidence only. The previous ignored candidate is stale,
and the changed migration bytes have not been applied remotely.

## Required resume sequence

Owner direction currently holds the canonical preflight lane. Until that hold
is released, do not regenerate a release candidate or perform another remote
write. After release:

1. run the canonical test/build/lint/audit and target-preparation gates;
2. independently review the exact repaired source and migration manifest;
3. create a new ignored, private candidate and repeat the no-upload dry run;
4. re-read the remote journal/schema/data and R2 privacy state;
5. obtain explicit authorization to resume this partially migrated database;
6. apply only pending `0008` and `0009` once; and
7. collect the exact post-chain D1/R2 evidence before any later stage.

This document is not a Plan 02-99 completion summary and grants no later-stage
authority.
