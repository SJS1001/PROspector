# Wave 0 Capability Report

Date: 2026-07-29

Site project: `appgprj_6a6a2e5c533081919e9c47dd6dd6ceba`

Saved version: 3

Site source commit: `e8f83d92cb189b5b6bd030da30b9ac0a6520860d`

Application code commit: `f15fc2d`

The Git commit containing this report is the release-evidence commit; it is
intentionally separate so the report can record the deployment that followed
the application commit.

## Outcome

Wave 0 is **blocked**, not failed. The private fixture pilot can remain online,
but no sensitive or operational data may be activated.

## Evidence

| Capability | Result | Evidence |
|---|---|---|
| Owner-only hosting | Pass | Sites reports custom access with Steven Smith as the sole allowed user and no allowed groups. |
| Anonymous denial | Pass | Anonymous `GET /api/capabilities` returns HTTP 401 from the Sites sign-in gate. |
| Exact-source release | Pass | Site-only commit was pushed to the Sites source repository, packaged, saved as version 3, and deployed successfully. Version 2 removed the misleading live-state language; version 3 adds rendered native-disabled regression coverage. |
| Local build | Pass | Lint, production build, build/source smoke, rendered fixture-safety test, and a zero-vulnerability production dependency audit pass. |
| D1/R2 declaration | Partial | Bindings are declared and local simulated probes pass; authenticated hosted persistence and isolation are not yet exercised. |
| Server secrets | Unproven | No production secret is configured, which prevents leakage but does not prove the storage/rotation contract. |
| Session/CSRF controls | Unproven | The current slice has no consequential mutation route. Rotation, Origin, Fetch-Metadata, and stale-session tests do not exist yet. |
| Scheduler | Unproven | No hosted idempotent scheduled job has been exercised. |
| Runner callback | Unproven | Assignment token, expiry, revocation, limits, and spend reservation are not implemented. |
| Gmail | Blocked | A controlled Google account, OAuth client, PKCE flow, protected refresh-token store, and restricted thread test are required. |
| Export/restore | Unproven | Encrypted export, tamper checks, and clean-deployment restore are not implemented. |
| Recovery/observability | Unproven | Owner-visible failed-job and restore evidence do not exist. |

## Safe operating boundary

- Keep the deployed UI synthetic and owner-only.
- Do not upload the July 24 operational lead files.
- Do not configure Gmail, provider, runner, or model credentials in source or D1.
- Do not represent fixture buttons or counters as completed external actions.
- Re-run this report after authenticated hosted storage, scheduler, Runner,
  Gmail, export/restore, and failure-recovery tests exist.

## Inputs needed to unblock the gate

1. A controlled Google test account and approved OAuth client configuration.
2. A decision and proof path for scheduled execution and Runner callbacks on
   Sites, or selection of a compatible worker/queue host behind the existing
   ports.
3. An owner-authenticated hosted test session for D1/R2 durability and
   cross-principal isolation.
4. An owner-supplied one-time export passphrase during the restore drill; it is
   never stored.
