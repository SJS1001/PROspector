# Durable archive recovery acceptance

Run from `operator/` with Node >=22.15:

```sh
npm ci --no-audit --no-fund
node --test acceptance/archive-recovery/recovery.test.mjs
node --test acceptance/local-contracts.test.mjs
npm run typecheck
npm run lint
```

This opt-in lane owns only this directory. It does not change the other archive,
restart, concurrency, auth, browser or UI test lanes or any production module.
The existing 17 handler contracts remain the baseline.

## What the tests prove

Each worker process loads production `db.ts`, migrations, `archive.ts` and
`archive-db.ts` through Vite SSR without a server listener. Every database lives
in a new physical OS temporary directory outside the checkout, removed at test
completion. Workers receive only PATH, NODE_ENV=test, empty DATABASE_URL and
the generated OPERATOR_DATA_DIR; they do not inherit credentials or owner paths.
After Vite setup and before application imports, test-only instrumentation
rejects TCP connects, UDP socket creation and fetch. A denied TCP probe verifies
the fence. No provider module, browser, HTTP admission bypass or production auth
change is used. This is adapter/process evidence, not browser/auth acceptance or
an OS-level firewall attestation.

1. All 19 declared archive collections contain meaningful fictional records.
   Restore into a verified empty migrated database, reopen in a new process,
   compare every semantic table/field/reference against explicit normalization,
   and inspect raw disk rows for absent leases, inactive approvals and expiry
   authority. Spent grant history remains; active grants and credentials are
   excluded. Package/message authority-reset audit events are required.
2. Wrong version, tampered digest, broken reference, duplicate contact ID,
   foreign-owner row field, actual foreign-owner primary-key collision,
   truncated serialized input, omitted manual-handoff event and erased consumed
   status each fail. Reference/identity/history mutations are rehashed, proving
   rejection beyond checksum checks. Truncated text is tested at the archive
   API boundary, not through an HTTP JSON parser.
3. A real invalid SQL statement executes on the adapter's pinned transaction
   after the contacts table is inserted; PostgreSQL failure must roll back.
   A separate restore is SIGKILLed at that same checkpoint. The parent verifies
   the checkpoint marker and signal, waits for child termination via spawnSync,
   then removes only the empty stale lock as the documented recovery procedure
   requires. A fresh process reopens the same database.
4. Every failure is followed immediately by a fresh-process canonical snapshot
   equal to the original full database (all public base tables except migration
   bookkeeping), including suppressions, terminal/manual history, active grants,
   secrets and schedules. No failed restore may partially reset authority.
5. A successful restore whose archive omits suppressions must retain existing
   local and foreign-owner opt-outs and exact manual history. It must reset
   populated schedule/lease/acknowledgement/grant authority while retaining the
   fictional credential unchanged.

Rows and object keys are canonicalized; full snapshots retain timestamps, not
just counts. Successful semantic archive comparison removes only the separately
asserted generated restore-audit events and explicitly adjusts the documented
approval/budget normalization. No rejection baseline is normalized.

## Recorded verification

Base: `8838363ef64698f92ac57ac06d564b3d72d4701f`, verified before edits.
Branch: `codex/archive-recovery-evidence-20261028`.
Environment: Linux 6.18.55 x86_64, Node v24.22.1, npm 11.9.0.
Parent and inherited child model/effort controls were not exposed; no model
selection claim is made. One scoped subagent owned only `fixture.mjs`.

- `npm ci --no-audit --no-fund`: exit 0, 479 packages.
- Combined recovery plus baseline handler run: exit 0, 19/19 (the first two
  recovery tests plus all 17 unchanged baseline contracts).
- Final recovery-only run: exit 0, 3/3 passed, zero failures/skips; 11 rejection/failure/interruption variants, 43.36 seconds.
- `npm run typecheck`: exit 0.
- `npm run lint`: exit 0; three existing unused-variable warnings in qualify.ts
  and fns.ts, no errors.
- Focused eslint and Prettier: pass.

No concrete production defect was reproduced, so no production patch is made.
No cross-scope fix is required by these results. Browser matrix, real owner Mac
recovery, owner acceptance and real-provider quality remain outside this lane
and are not claimed. No build/full-suite rerun is claimed for this test-only
change. No merge, deployment, workflow/settings change or CI polling occurred.
