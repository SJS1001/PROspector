# Cloud enrichment integration lane

## Recovered integration follow-up

The original result below exposed the defect; it is no longer the current test
expectation. On `codex/cloud-wave1-integration`, forward-only migration `0011`
and matching repository predicates preserve observed candidates with a Passed
assessment and current approved Prospect. Previously applied migrations remain
unchanged. The focused integration now passes three cases: actual Phase 4 to
grant/reservation/uncertainty lifecycle, rejected candidate denial, and candidate
invalidation after issuance. The old trigger rejection and rollback are also
proved before the forward candidate is applied in disposable D1. Successful
provider settlement through ContactReady/ExportReady remains incomplete.
See `2026-09-04-recovered-integration.md`; no phase or hosted acceptance is claimed.

## Original cloud result (historical)

- Base: `38d86681cd7a8e9f5be70b56365d9be2a786f0ad` (`origin/main`; tree `098689052d412d93972c67131dda8b2b5638e772`)
- Branch: `codex/cloud-enrichment-integration`
- Owned files: `site/tests/controlled-enrichment-integration.test.mjs`, `site/tests/helpers/phase5-integration.mjs`, and this record
- Scope: disposable-D1, synthetic-only integration through existing Phase 4 and Phase 5 services; all provider behavior is a test-injected fake behind reject-only production composition
- Hosted/phase claims: none; this is not Phase 4/5 acceptance, activation, deployment, or provider evidence
- External effects: no provider account, credential, real contact, paid request, schedule activation, export, message, call, or hosted action
- Validation: `cd site && node --test tests/controlled-enrichment-integration.test.mjs` — PASS (1/1); `cd site && npx eslint tests/controlled-enrichment-integration.test.mjs tests/helpers/phase5-integration.mjs` — PASS
- Limitations: canonical `npm test`, build, deployment, preflight, and CI were not run and remain pending under the coordinator hold; the requested post-grant lifecycle is blocked by the source defect below
- Source defect/blocker: the real Phase 4 service retains an assessed candidate as `observed`, but both Phase 5 repository authority reads and the Phase 5 D1 guards require `pc.status = 'qualified'`; no source service performs that transition. The integration test proves the unmodified repository fails closed and does not forge the row. Minimal suggested correction: align both repository predicates and the corresponding `0008`/`0009` guard predicates with the actual Phase 4 `observed` state while retaining the existing immutable `Passed` assessment plus current `approved` Prospect joins. Because domain/schema files are outside this lane, grant/reservation/fake-settlement/eligibility/replay/uncertainty/invalidation coverage remains blocked on that correction.
