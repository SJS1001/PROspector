# Plan 02-99 Stage 1 provisioning evidence

**Captured:** 2026-09-02

**Checked source:** `798803d42093efabd3a9bc20154efb18d629c0a4`

**Operator:** owner-confirmed Cloudflare account, identity retained outside Git

**Tool:** Wrangler 4.116.0

## Authorized scope

The owner authorized exactly one new greenfield D1 database and one new private
R2 bucket in Eastern North America. Stage 1 did not authorize a Worker,
migration, object upload, target-bound configuration, Access application,
route, secret, version, deployment, bootstrap, provider, export, schedule, or
outbound effect.

The inaccessible original project was not resolved, inspected, accessed,
migrated, restored, modified, cloned, or used as evidence.

## Sanitized result

| Check | Result |
|---|---|
| D1 resources created in this stage | 1 |
| D1 application schema objects | 0 |
| D1 migration-journal objects | 0 |
| D1 `PRAGMA quick_check` | `ok` |
| D1 foreign-key violation rows | 0 |
| R2 resources created in this stage | 1 |
| R2 object count | 0 |
| R2 custom domains | 0 |
| R2 public `r2.dev` access | disabled |
| Repository configuration changed by provisioning | no |

Account identity, resource names/IDs, URLs, tokens, credentials, owner email,
and secret values are intentionally absent from this repository. The operator
must retain the exact resource mapping outside Git for a later authorized
target-bound configuration.

## Authority boundary

This evidence closes only resource creation and empty/private pre-migration
proof. It does not complete Plan 02-99 and makes no migration, deployment,
principal, application-read, persistence, or human-acceptance claim. The next
external step requires separate authorization for a reviewed target-bound
configuration and the checked D1 migration chain. R2 must remain empty and both
public exposure mechanisms must remain disabled.
