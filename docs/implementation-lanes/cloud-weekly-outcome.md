# Cloud weekly outcome implementation lane

## Scope

- Branch: `codex/cloud-weekly-outcome`
- Base: `38d86681cd7a8e9f5be70b56365d9be2a786f0ad`
- Base tree: `098689052d412d93972c67131dda8b2b5638e772`, identical to pilot checkpoint `6affd08682c7fa4167ccf7cccf6acd8eb41d44bc`
- Owned files:
  - `site/domain/weekly-outcome.ts`
  - `site/tests/weekly-outcome.test.mjs`
  - `docs/implementation-lanes/cloud-weekly-outcome.md`

## Interface and behavior

`reduceWeeklyOutcome(input)` is a pure, independently importable reducer for a
future read-only Morning Brief. Its exported TypeScript contract requires:

- generic Workspace, Company, Product, Market Play, and Profile IDs plus an
  `Operating` or `Draft` Profile lifecycle;
- fixed IANA timezone `America/Toronto` and an exact UTC `asOf` instant;
- origin-to-`asOf` coverage naming every stable Prospect expected in the
  snapshot; and
- one contiguous, chronological, state-continuous history stream per named
  Prospect, beginning with `prospect_created` and carrying safe audit
  references.

The reducer accepts at most 10,000 Prospects, 10,000 events per Prospect, and
100,000 events across the complete snapshot. A snapshot above any limit is
unavailable; it is never truncated into a partial outcome.

The reducer structurally verifies coverage membership, sequence, chronology,
scope, state continuity, future-event exclusion, and exact input shapes. It
counts only the first-ever explicit transition to `ExportReady` for each stable
Prospect when that transition falls in the local Monday-Sunday week. An
`Approved` or `ContactReady` state is never inferred to be Export-ready.
Re-entry after a reversal cannot replace an earlier first transition.

The available projection keeps the fixed target of seven, distinct stable
Prospect and linked Contact counts, cohort audit references and local UTC
offsets, and ten separate loss ledgers. Draft Profile history is explicitly
excluded and therefore produces zero stable Prospect/contact metrics, cohort,
and losses. Missing or incomplete coverage and malformed history return
`status: "unavailable"`, `counts: null`, and `losses: null`; they do not report
zero success.

## Assumptions and authority boundary

- The future repository adapter must obtain `coverage.prospectIds` and all
  history streams from one transaction-consistent authoritative snapshot. The
  reducer can verify the supplied structure but cannot prove database
  provenance, phase acceptance, or that an event occurred in the real world.
- `coverage.from: "prospect_origin"` is a data-contract boundary, not a caller
  authority boolean. Its `through` instant must equal `asOf` exactly.
- `distinctStableContactCount` counts distinct explicit `contact_linked`
  history IDs. It is not an eligible-contact-row count, ContactReady inference,
  package approval, or export permission.
- Loss events are immutable supplied history facts. They remain separate from
  the first-Export-ready cohort and never increase it.
- The module has no database, route, persistence, scheduler, runner, provider,
  export, environment, filesystem, or network port. No preparation module is
  imported into runtime.

## Focused validation

- `cd site && node --test tests/weekly-outcome.test.mjs tests/phase7-preparation-weekly-outcome.test.mjs` — PASS, 21/21 (9 reducer cases plus the 12 existing preparation-semantics cases).
- `cd site && npx eslint domain/weekly-outcome.ts tests/weekly-outcome.test.mjs` — PASS.
- `cd site && npx tsc --noEmit --strict --target ES2022 --lib ES2022,DOM --module ESNext --moduleResolution Bundler --skipLibCheck domain/weekly-outcome.ts` — PASS.
- `git diff --check` — PASS after all owned changes.

The canonical full `npm test`, build, preflight, deployment, and CI gates were
not run because that validation lane is on hold. They remain pending for the
coordinator. This lane makes no hosted, production, operational, plan, phase,
or acceptance claim.
