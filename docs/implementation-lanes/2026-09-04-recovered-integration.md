# Recovered cloud implementation wave

## Authority and checkpoint

This is an owner-authorized **offline implementation candidate**, not phase
acceptance or operational activation. Integration branch:
`codex/cloud-wave1-integration`, based on main
`38d86681cd7a8e9f5be70b56365d9be2a786f0ad`. PR #2 was already merged into
that base; references to it as an open draft in older records are historical.
No new PR is implied by this record. Resolve the current branch tip from Git.

The cloud tasks completed but had no GitHub push credential. Their complete
format-patch artifacts were recovered through the signed-in browser and
imported with `git am`; no cloud credential was added or copied. The temporary
loopback transfer service has been stopped. Source and evidence now live in
Git, not only in task attachments or temporary files.

| Lane | Original cloud commit | Recovered commit |
| --- | --- | --- |
| CSV codec | `607e4f2c2b8225d750dcf02e47fc14fcde967bbd` | `646297afad65a618f322e384a4bcd3a3ca335d30` |
| Contacts UI | `13f625764d6f033d984e5c3ed9b7d0c7ed2070e8` | `83d863b29624374e8808ac837b744111004aee60` |
| Enrichment integration | `eb4df49995d6939f9507c6974ad751805ee37faf` | `3e0bb9531cc6f82d8c16e7d9fb6aea29ede23e93` |
| Outreach persistence | `f100f3b7dc570e07bd567eead30e353c30ffa110` | `25305956b824b05d41d0366ddde50ff5f3121f33` |
| Mail boundary | `8c50138df27965ddd0ccf83df1c6765fa83f8319` | `2f6acfabad529a7942b07912b122216eca147ca8` |
| Weekly outcome | `cd5ad49cbe5f99a87693b931a99fed7bdf188596` | `3779a4be7f5edb5c84586e50df4c525867d5194c` |

Published artifact SHA-256 matched exactly for Contacts
`af675214e5783a3c0e0b5beb33cf9af09857345412b888d896ce1b49f5271cf4`,
enrichment `bd2eeff8059dfcb2c6a6cc33b0d41f788f8b6bdfa8195394a5bbe65d086d1127`,
outreach `547adf72c5c2a598167c904a3acb8f2aff93dd8c713aa79e7c45e6bf67964e82`,
mail `a849770223fd5e7f68c6b0877451a34855ed57bc15300cb89ac365af9473033b`, and
weekly `8ea859111b827e9fc28ab38a0859d376da30eece993f197d06f0176d66175c5c`.
CSV had no published checksum; its recovered hash was
`a4bb346be3d7cba2a55f956ad42ebcbdd7f0749ec8ac732dfd9491b803999379`
and its commit header matched the cloud result. Imported commits are historical
candidates, not reviewed-ready releases; the following local fixes supersede them.

## Review corrections

- CSV: neutralize leading whitespace/control/BOM formula prefixes; return
  defensive byte copies so caller mutation cannot invalidate the canonical
  checksum; prove exact and one-byte-over UTF-8 limits, including multibyte IDs.
- Contacts: validate bounded reject-only projections before rendering/readiness;
  omit contact-like references and unsafe labels; recover unknown POST outcomes
  with GET only, clear confirmation, and reject late generations. Tests cover
  the shared recovery functions and static rendering, not a real browser walkthrough.
- Mail: bind every approved-message field into the reconciliation marker;
  reject symbol-keyed extras. The adapter still always rejects without a transport.
- Weekly: cap total events at 100,000 without truncating; exclude Draft metrics;
  reject symbol-bearing arrays; avoid repeated sorting inside membership comparison.
- Enrichment: preserve the actual Phase 4 observed candidate with its Passed
  assessment and current approved Prospect. Forward migration `0011` changes
  exactly three current trigger predicates to accept `observed` or legacy
  `qualified`, retaining all other scope/configuration/revision/freshness guards.
  The repository uses the same predicates. Prior `0000`–`0009` bytes, snapshots,
  accepted manifest, and hosted evidence remain unchanged.
- Outreach: see `cloud-outreach-persistence.md` for candidate hardening and its
  remaining authority limitations. Neither the original cloud test count nor
  passing happy-path tests alone establish security or release readiness.
- Plan 06-02's ambiguous body-storage wording is clarified against DIRECTION's
  immutable approval requirement and IMPLEMENTATION-SPEC sections 16/18/19/22:
  canonical outbound bodies belong in their immutable Message Version artifact,
  not general logs/audit; full inbound reply bodies remain forbidden. This
  resolves plan wording and changes no product policy or activation authority.
  Its obsolete `0009` slot is also corrected to the implemented candidate `0010`;
  the already-applied Phase 5 `0009` migration must never be overwritten.

## Verification ledger

All commands below are from `site/` with Node.js `v24.16.0`, synthetic data only.

- `node --test tests/crm-csv-codec.test.mjs tests/gmail-boundary.test.mjs tests/weekly-outcome.test.mjs tests/phase7-preparation-weekly-outcome.test.mjs tests/outreach-preparation-boundary.test.mjs`: **38/38 passed**.
- `node --test tests/controlled-enrichment-integration.test.mjs`: **3/3 passed**.
  Proves old-chain rejection/rollback, additive repair, grant replay, one reservation,
  uncertainty without re-claim, and invalidated candidate/configuration denial.
- `node --test tests/enrichment-candidate-lineage-migration.test.mjs tests/migration-cloudflare-importer-compatibility.test.mjs`: **2/2 passed**.
- `node --test tests/contact-evidence-presentation.test.mjs tests/contact-confirmation-state.test.mjs`: **4/4 passed** after privacy hardening.
- `node --test tests/contacts-ui.test.mjs`: **8/8 passed** on the final Contacts
  code, bringing the three focused Contacts files to **12/12 passed**.
  Touched-file lint passed. A broad TypeScript diagnostic was not a green gate:
  the repository has existing errors outside those files. No full TypeScript
  success is claimed.
- CSV/mail/weekly standalone strict TypeScript checks and touched-file lint passed.
- Existing `enrichment-persistence-foundation` plus `enrichment-issuance-replay-order`
  focused run passed **23/24**, with the sole failure an obsolete assertion that
  `0009` must remain the last journal entry. That test now checks the exact `0009`
  entry instead; its targeted rerun passed **1/1**. The fixture still applies only
  `0000`–`0009`, and its no-outreach-table assertions are unchanged. This is not
  a claim that a fresh whole combined run was performed after the assertion edit.
- `node --test tests/outreach-persistence.test.mjs tests/migration-cloudflare-importer-compatibility.test.mjs`: **16/16 passed** after final hardening. Parent-version rollback/replay cases also passed **2/2** separately and the observed-candidate approval case passed **1/1** separately. Touched-file lint and diff check pass. Independent review found no remaining high/medium issue in the final parent fences; this remains a local candidate with the explicit resolver/release limits in its lane record.

Canonical `npm test` (including build), full lint, preflight, CI and release
acceptance remain **pending**, not passed. The owner's preflight hold is active.

## Exact remaining path

1. Complete the real-service enrichment success/verification/eligibility lifecycle
   with test-injected providers. Current integration proves issuance, reservation,
   uncertainty, and invalidation; it does not yet prove a successful provider
   settlement through ContactReady or ExportReady.
2. Implement missing durable outbox/lease/finalization, approval consumption,
   source invalidation, exact suppression resolution, and read-only runtime
   projections behind disabled adapters. Continue artifact construction,
   manual-call logging, handoff persistence/delivery, outcome history and recovery
   as bounded local units, preserving every external gate.
3. Obtain permission before canonical preflight/release validation. Candidate
   `0010`/`0011` deliberately do not match the accepted ten-migration hosted
   manifest. Its verifier must reject this branch for target preparation until a
   separately reviewed exact release-candidate contract exists; never change old
   evidence to imply the new migrations were applied remotely.
4. Separately finish Plan 02-99 Access attachment/secrets/private release and
   real-principal acceptance, then dependent phase acceptance and authorized
   provider/operational proof. No original Sites access, hosting writes, provider
   configuration, credentials, real data, exports to recipients, outbound messages,
   calls, schedules or spend occurred in this integration work.

There is no new plan-completion credit. The whole system remains incomplete.
