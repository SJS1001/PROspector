# Phase 6–7 local build map, 2026-11-09

A read-only planning pass at `8f81d03` produced this map. The binding rules are in `COMPLETION.md`, section "Phase 6–7 local build rules, 2026-11-09". Local results are locally accepted only; they earn no plan credit and produce no summary files.

## Status by plan

| Plan | Delivers | Status in code | Local now? |
| --- | --- | --- | --- |
| 06-01 | RED contract suites (artifacts, dispatch, suppression, manual call) | partly done, under other test files | yes, gate waived locally |
| 06-02 | Outreach schema and repository | done (0010–0017, `outreach-repository.ts`); named test file missing | yes, Lane A adds the test |
| 06-03 | Package/Message Version services, expiry, invalidation | partly done (repository primitives only) | yes, Lane A |
| 06-04 | Suppression resolver, tombstones, stop/cancel rules, unsubscribe | partly done | yes, Lane B |
| 06-05 | MailPort and reject-only Gmail adapter | done; the OAuth/PKCE validator is missing | optional |
| 06-06 | Enqueue, lease, dispatch, originated sync | partly done; Dispatching, Sent and DeliveryUnknown are in memory only | Tasks 1 and 3 yes (Lane E); D1 Task 2 needs a migration (deferred) |
| 06-07 | Manual call, backed by D1 | decision service done, D1 layer missing | yes, Lane F, with the phone action disabled |
| 06-08 | Owner handler and Outreach UI | not started | yes, Lane G |
| 06-09 | Synthetic lifecycle integration and full gate | not started | yes, Lane H |
| 06-10 | Owner Gmail authorization | human gate | no (hosted target and live Gmail) |
| 06-11 | Phase 4/5 input matrix acceptance | human gate | no (needs 04-12 and 05-09) |
| 06-12 | Real Gmail MailPort and worker | not started | no (needs 06-10) |
| 06-13 | Composition review, Gmail drill, manual-call UAT | not started | Task 3 only, with the owner, after Lanes F and G |
| 07-01 | Weekly outcome and Morning Brief contracts | partly done | yes, Lane C |
| 07-02 | CSV handoff contracts | partly done | yes, Lane C |
| 07-03 | Archive and restore contracts (fake ports) | partly done | yes, Lane C, with no crypto install |
| 07-04 | Phase 7 evidence migration and repository | not started | no (index `NNNN` undecided) |
| 07-05 | Weekly projector and read-only Morning Brief | mostly done | finishing needs 07-04 |
| 07-06 | CSV handoff service | partly done | service shell only (Lane I); persistence needs 07-04 |
| 07-07 | Archive crypto and restore-target acceptance | human gate | no (crypto choice and hosted target) |
| 07-08 | Encrypted archive, dry run, restore | not started | no (needs 07-07) |
| 07-09 | Handoff and Recovery surfaces | Morning Brief GET only | no (needs 07-08) |
| 07-10 | Integration and hosted restore drill | not started | Task 1 after 07-09; Task 2 is hosted |

## Facts every lane must respect

- The D1 outbox stops before any provider call. Every result reports `providerCalls: 0`, and `tests/outreach-outbox-event-scope-guard-reachability.test.mjs` pins the unreachable send states.
- `recheckForPackageApproval`, `recheckForCrmExport`, `recheckForClickToCall` and `recheckForFinalSend` always refuse. Inject an eligibility port and never edit or bypass them.
- `tests/outreach-preparation-boundary.test.mjs` forbids Gmail endpoints, `GMAIL_*` secret names, literal `tel:`/`mailto:` links and runtime imports of `site/preparation/`.
- The migration head is 0022. No lane adds a migration.
- `prospect-transition-history.ts` stays unwired.
- `local-portable-backup.ts` uses PBKDF2, which is not the memory-hard KDF 07-07 asks for. Crypto is the owner's decision.

## Lanes

Every lane uses synthetic data and fake ports only. A lane adds no migration, installs no package, adds no route to a provider, does not edit `site/preparation/`, creates no summary, and does not edit `COMPLETION.md` or `COMPLETION_LEDGER.md`. Lanes do not edit `tests/helpers/outreach-fixture.mjs`; create a lane-local helper instead.

Guard checks every lane re-runs:

- `cd site && node --test tests/outreach-preparation-boundary.test.mjs tests/outreach-outbox-event-scope-guard-reachability.test.mjs tests/migration-source-of-truth.test.mjs`
- eslint on the changed files
- `npm run build`

**Wave 1 (in parallel, disjoint files)**

- **Lane A: artifact services (06-01 Task 1, 06-02 test, 06-03).**
  - New files: `site/domain/outreach-package.ts`, `site/domain/message-version.ts`, `site/tests/outreach-artifacts.test.mjs`.
  - `outreach-repository.ts` is read-only in this wave.
- **Lane B: suppression and stop rules (06-04, the suppression part of 06-01).**
  - New files: `site/domain/suppression.ts`, `site/domain/outreach-stop-rules.ts`, `site/tests/suppression.test.mjs`.
  - Owns `outreach-repository.ts` (statement-builder exports only) and `outbox.ts` (one cancel method: `pending`/`leased` to `cancelled`).
- **Lane C: Phase 7 contract tests (07-01, 07-02, 07-03). Test files only.**
  - New files: `site/tests/mining-handoff-ui.test.mjs`, `site/tests/crm-handoff.test.mjs`, `site/tests/workspace-recovery.test.mjs`.
  - Extends `site/tests/weekly-outcome.test.mjs`.

**Wave 2 (after A and B merge)**

- **Lane E: dispatch suite and originated sync (06-06 Tasks 1 and 3).**
  - Files: `outbox.ts`, new `originated-mail-sync.ts`, `outreach-stop-rules.ts`, new `tests/outreach-dispatch.test.mjs`.
- **Lane F: manual call backed by D1 (06-07).**
  - New files: `site/domain/manual-call.ts`, `site/tests/manual-call.test.mjs`.
  - The phone action stays disabled.
- **Lane I (optional): CSV handoff service shell (07-06, partial).**
  - New file: `site/domain/crm-handoff.ts`.

**Wave 3 (serial)**

- **Lane G: owner handler and Outreach UI (06-08).** This includes `site/app/api/outreach/route.ts` and an unsubscribe route.
- **Lane H: integration and the full gate (06-09).** It is the only lane that runs the full `npm test`.

## Owner decisions still open

- **D-1:** the 07-04 migration index.
- **D-3:** whether to reopen the D1 send states for a fake-port dispatch path. Recommended: defer.
- **D-4:** the archive crypto (a memory-hard KDF) for 07-07/07-08.
- **D-6:** site domain suppression blocks subdomains (applied by default, reversible).
