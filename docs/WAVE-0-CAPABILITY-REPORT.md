# Wave 0 Capability Report

Date: 2026-07-29

Site project: `appgprj_6a6a2e5c533081919e9c47dd6dd6ceba`

Saved version: 8

Site source commit: `8af82949ad7b9a064836477cf656eea94bab9392`

Application code commit: `ebdf08a`

The Git commit containing this report is the release-evidence commit; it is
intentionally separate so the report can record the deployment that followed
the application commit.

## Outcome

Wave 0 is **blocked**, not failed. The private pilot can remain online with one
explicitly approved low-sensitivity exception: the owner may submit and then
separately confirm the historian data-readiness policy in the Consensus
Interview. Real leads, contacts, outreach, schedules, imports, exports, and
provider credentials remain prohibited.

## Evidence

| Capability | Result | Evidence |
|---|---|---|
| Owner-only hosting | Pass | Sites reports custom access with Steven Smith as the sole allowed user and no allowed groups. |
| Anonymous denial | Pass | Anonymous `GET /api/capabilities` returns HTTP 401 from the Sites sign-in gate. |
| Exact-source release | Pass | Site source `8af8294…` was pushed, packaged, saved as version 8, and deployed successfully with environment revision 1. Versions 4–7 were superseded during adversarial convergence and are not accepted releases. |
| Local build | Pass | Lint, production build, five persistence/security tests, React Doctor 100/100, and a zero-vulnerability production dependency audit pass. |
| D1/R2 declaration | Partial | Bindings are declared. Local Miniflare tests prove the two-stage D1 lifecycle, reload, idempotent retries, concurrent-writer exclusion, and cross-owner query isolation. Authenticated hosted persistence is still awaiting the owner browser proof. R2 remains probe-only. |
| Server secrets | Partial | Sites environment revision 1 contains secret `OWNER_SUBJECT_PEPPER`; its value is not returned or committed. Coordinated rotation and identity migration remain unproven. |
| Mutation/CSRF controls | Partial | Local handler tests prove trusted injected identity, spoofed-header denial, exact Origin, Fetch Metadata, JSON and streaming byte bounds, one-time owner-bound CSRF, replay denial, and cross-owner rejection. Unexpected handler faults are classified as 5xx. The platform does not expose a stable session ID, so provider-session rotation and stale-session behavior remain unproven. |
| Exact-policy confirmation | Pass locally | The immutable Answer stores the canonical policy payload and digest. Pending review and Confirmation read that snapshot, not a later compiled question. Drift and integrity tests pass. Any pre-snapshot Answer/Confirmation is shown as review-required, its derived knowledge is superseded, and a new two-stage review is opened while preserving the legacy records and quarantine audit. Concurrent different-key restarts converge on one deterministic replacement session, question, and audit event. |
| Legacy-workspace coexistence | Pass locally | If both a legacy SHA-owner workspace and a current HMAC-owner workspace exist, reads retain the current workspace while idempotently archiving the detached legacy sessions, superseding unbound derived knowledge, and appending one quarantine audit. Concurrent coexistence reads are tested. |
| Adversarial convergence | Pass for BLOCKER/HIGH | Independent product and security re-reviews of version 8 both returned CLEAN with no remaining BLOCKER or HIGH finding. Lower-risk hardening and the explicitly pending hosted proof remain tracked by this report. |
| Scheduler | Unproven | No hosted idempotent scheduled job has been exercised. |
| Runner callback | Unproven | Assignment token, expiry, revocation, limits, and spend reservation are not implemented. |
| Gmail | Blocked | A controlled Google account, OAuth client, PKCE flow, protected refresh-token store, and restricted thread test are required. |
| Export/restore | Unproven | Encrypted export, tamper checks, and clean-deployment restore are not implemented. |
| Recovery/observability | Unproven | Owner-visible failed-job and restore evidence do not exist. |

## Approved narrow exception and data handling

- The owner approved persisting one company-level scoring policy after a
  separate Answer and Confirmation action.
- Stored data is limited to an HMAC-derived owner subject, the fixed policy
  answer, version identifiers, timestamps, operation digests, and audit
  metadata. The email address and secret pepper are not stored in D1.
- The policy is recorded knowledge only. It is not consumed by scoring,
  prospecting, scheduling, or outreach.
- There is no self-service deletion or identity migration yet. Until those
  exist, deletion requires an owner-requested pilot teardown and pepper
  rotation must not occur without a coordinated workspace migration.
- One-time CSRF tokens expire after 15 minutes; used and expired records are
  pruned after the 24-hour cleanup threshold.

## Safe operating boundary

- Keep the deployed UI owner-only. Only the approved policy decision may be
  live; every prospecting and outbound surface remains synthetic and disabled.
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
3. An owner-authenticated hosted initialize → submit → reload → confirm →
   reload test. A second real principal is required before cross-principal
   isolation can be claimed at the hosted edge.
4. An owner-supplied one-time export passphrase during the restore drill; it is
   never stored.
